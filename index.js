// Cognito JWT verification middleware
import cognitoAuthenticate from "./cognitoAuth.js";

import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();


const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://www.opss.com',
  'https://admin.opss.com'
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Webhook endpoint needs raw body for signature verification

app.use("/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Health check

app.get("/", (req, res) => {
  res.send({ status: "OpssFlow Backend API", version: "1.0.0" });
});

// Secure endpoint to get current user's subscription data (moved after app is defined)
app.get('/subscription/me', cognitoAuthenticate, async (req, res) => {
  const userId = req.user.sub;
  console.log('[DEBUG] GET /subscription/me called', { userId });
  try {
    const subSnap = await db.ref(`users/${userId}/subscription`).once('value');
    const subscription = subSnap.val();
    console.log('[DEBUG] Subscription data fetched from DB', { userId, subscription });
    if (!subscription) {
      console.warn('[DEBUG] Subscription not found for user', { userId });
      return res.status(404).json({ error: 'Subscription not found' });
    }
    res.json({ subscription });
  } catch (err) {
    console.error('[DEBUG] Error fetching subscription:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to get Stripe price ID based on plan
const getPriceId = (planType) => {
  const priceIds = {
    MONTHLY: process.env.STRIPE_MONTHLY_PRICE_ID,
    YEARLY: process.env.STRIPE_YEARLY_PRICE_ID
  };
  return priceIds[planType];
};

// Helper function to update user subscription in database (grouped under /subscription)
const updateUserSubscription = async (userId, subscriptionData) => {
  try {
    const subRef = db.ref(`users/${userId}/subscription`);
    // Clean up legacy/duplicated fields
    const cleaned = { ...subscriptionData };
    delete cleaned.subscriptionStatus;
    delete cleaned.subscriptionTier;
    delete cleaned.subscriptionStartDate;
    delete cleaned.subscriptionEndDate;
    delete cleaned.amount;
    delete cleaned.currency;
    // Only use new fields
    await subRef.update({
      ...cleaned,
      updatedAt: admin.database.ServerValue.TIMESTAMP
    });
    console.log(`Updated subscription for user ${userId}:`, cleaned);
  } catch (error) {
    console.error(`Error updating subscription for user ${userId}:`, error);
    throw error;
  }
};

// Update Stripe subscription plan (upgrade/downgrade)
app.post("/update-subscription-plan", cognitoAuthenticate, async (req, res) => {
  const { userId, newPlanType } = req.body;
  console.log('[DEBUG] POST /update-subscription-plan called', { userId, newPlanType });
  try {
    // Fetch user subscription from DB
    const userSnap = await db.ref(`users/${userId}/subscription`).once('value');
    const subscription = userSnap.val();
    console.log('[DEBUG] Subscription fetched for update', { userId, subscription });
    if (!subscription || !subscription.stripeSubscriptionId) {
      console.warn('[DEBUG] No active Stripe subscription found for user', { userId });
      return res.status(400).json({ error: "Active Stripe subscription not found" });
    }
    const currentTier = subscription.tier || subscription.subscriptionTier;
    // Block YEARLY->MONTHLY downgrade mid-cycle (SaaS best practice)
    if (currentTier === 'YEARLY' && newPlanType === 'MONTHLY') {
      // Optionally, allow downgrade only at period end
      return res.status(400).json({ error: "Downgrading from YEARLY to MONTHLY is only allowed at the end of your current billing period. Please cancel auto-renew and resubscribe to MONTHLY after your current period ends." });
    }
    const priceId = getPriceId(newPlanType);
    if (!priceId) {
      console.warn('[DEBUG] Invalid plan type provided', { newPlanType });
      return res.status(400).json({ error: "Invalid plan type" });
    }
    // Get the subscription from Stripe
    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
    console.log('[DEBUG] Stripe subscription retrieved', { stripeSub });
    if (!stripeSub || !stripeSub.items || !stripeSub.items.data.length) {
      console.warn('[DEBUG] Stripe subscription items not found', { stripeSub });
      return res.status(400).json({ error: "Stripe subscription items not found" });
    }
    // Update the subscription with the new price (in-place, never create duplicate)
    const updatedSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [{
        id: stripeSub.items.data[0].id,
        price: priceId
      }],
      proration_behavior: 'create_prorations'
    });
    console.log('[DEBUG] Stripe subscription updated', { updatedSub });
    // Do not update DB here; rely on webhook for DB sync
    res.json({ success: true, message: "Subscription plan updated. Changes will reflect after Stripe processes the update.", subscriptionId: updatedSub.id });
  } catch (err) {
    console.error('[DEBUG] Error updating subscription plan:', err);
    res.status(400).json({ error: err.message });
  }
});

// Create Stripe Checkout session
app.post("/create-checkout-session", cognitoAuthenticate, async (req, res) => {
  const { userId, planType, userEmail, successUrl, cancelUrl } = req.body;
  
  try {
    const priceId = getPriceId(planType);
    if (!priceId) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      metadata: {
        userId: userId,
        planType: planType
      },
      success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });
    
    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(400).json({ error: err.message });
  }
});

// Create billing portal session
app.post("/create-portal-session", cognitoAuthenticate, async (req, res) => {
  const { customerId, returnUrl } = req.body;
  
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    
    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating portal session:", err);
    res.status(400).json({ error: err.message });
  }
});

// Verify payment and update subscription
app.post("/verify-payment", cognitoAuthenticate, async (req, res) => {
  const { userId, sessionId } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      const customer = await stripe.customers.retrieve(session.customer);
      
      // Update user subscription in database (clean structure)
      const subscriptionData = {
        status: 'ACTIVE',
        tier: session.metadata.planType,
        startDate: new Date(subscription.current_period_start * 1000).toISOString(),
        endDate: new Date(subscription.current_period_end * 1000).toISOString(),
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        billing: {
          amount: subscription.items.data[0].price.unit_amount / 100,
          currency: subscription.items.data[0].price.currency.toUpperCase(),
        }
      };
      await updateUserSubscription(userId, subscriptionData);
      
      res.json({ success: true, subscription: subscriptionData });
    } else {
      res.status(400).json({ error: "Payment not completed" });
    }
  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(400).json({ error: err.message });
  }
});

// Cancel subscription
app.post("/cancel-subscription", cognitoAuthenticate, async (req, res) => {
  const { userId, subscriptionId } = req.body;
  try {
    // Set cancel_at_period_end on Stripe (never delete immediately)
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    // Do NOT update DB here; always rely on webhook for DB sync (SaaS best practice)
    res.json({ success: true, message: "Subscription will cancel at period end. Your access remains until then. Changes will reflect after Stripe processes the update." });
  } catch (err) {
    console.error("Error canceling subscription:", err);
    res.status(400).json({ error: err.message });
  }
});

// Admin: Get all users with subscription data
// Admin: Get all users with subscription data (only return subscription object)
app.get("/admin/users", cognitoAuthenticate, async (req, res) => {
  // Admin group check (Cognito 'Admins' group)
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  try {
    const usersSnapshot = await db.ref('users').once('value');
    const users = [];
    usersSnapshot.forEach(childSnapshot => {
      const val = childSnapshot.val();
      users.push({
        id: childSnapshot.key,
        subscription: val.subscription || null,
        email: val.email || null,
        name: val.name || null,
        company: val.company || null 
      });
    });
    res.json({ users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: err.message });
  }
});


// Reactivate subscription endpoint
app.post("/reactivate-subscription", cognitoAuthenticate, async (req, res) => {
  const { userId, planType, userEmail, successUrl, cancelUrl } = req.body;
  try {
    // Fetch user from DB
    const userSnap = await db.ref(`users/${userId}/subscription`).once('value');
    const subscription = userSnap.val();
    // For backward compatibility, also fetch root user for email if needed
    const userRootSnap = await db.ref(`users/${userId}`).once('value');
    const userRoot = userRootSnap.val();
    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(400).json({ error: "User or Stripe customer not found" });
    }
    // Try to find active or canceled subscription
    let stripeSub = null;
    const subs = await stripe.subscriptions.list({ customer: subscription.stripeCustomerId, limit: 10 });
    if (subs.data && subs.data.length > 0) {
      // Find the most recent subscription
      stripeSub = subs.data.sort((a, b) => b.created - a.created)[0];
    }
    const planTier = planType || subscription.tier || subscription.subscriptionTier;
    if (stripeSub) {
      if (stripeSub.status === 'canceled') {
        // Create a new subscription via Checkout
        const priceId = getPriceId(planTier);
        if (!priceId) return res.status(400).json({ error: "Invalid plan type" });
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          customer: subscription.stripeCustomerId,
          customer_email: userEmail || userRoot?.email,
          metadata: { userId, planType: planTier },
          success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl,
        });
        return res.json({ action: 'checkout', url: session.url });
      } else if (stripeSub.cancel_at_period_end) {
        // Reactivate by setting cancel_at_period_end to false
        const updatedSub = await stripe.subscriptions.update(stripeSub.id, { cancel_at_period_end: false });
        // Do NOT update DB here; always rely on webhook for DB sync (SaaS best practice)
        return res.json({ action: 'reactivated', message: 'Subscription reactivated', subscriptionId: updatedSub.id });
      } else if (stripeSub.status === 'active' || stripeSub.status === 'trialing') {
        // Already active
        return res.json({ action: 'already_active', message: 'Subscription is already active' });
      } else if (stripeSub.status === 'incomplete' || stripeSub.status === 'past_due') {
        // Payment required, send to billing portal
        const portal = await stripe.billingPortal.sessions.create({
          customer: subscription.stripeCustomerId,
          return_url: successUrl
        });
        return res.json({ action: 'billing_portal', url: portal.url });
      }
    } else {
      // No subscription found, create new via Checkout
      const priceId = getPriceId(planTier);
      if (!priceId) return res.status(400).json({ error: "Invalid plan type" });
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer: subscription.stripeCustomerId,
        customer_email: userEmail || userRoot?.email,
        metadata: { userId, planType: planTier },
        success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
      });
      return res.json({ action: 'checkout', url: session.url });
    }
    // Fallback
    return res.status(400).json({ error: "Unable to process reactivation" });
  } catch (err) {
    console.error("Error in /reactivate-subscription:", err);
    res.status(400).json({ error: err.message });
  }
});

// Admin: Update user subscription
app.put("/admin/users/:userId/subscription", cognitoAuthenticate, async (req, res) => {
  // Admin group check (Cognito 'Admins' group)
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  const { userId } = req.params;
  const updates = req.body;
  try {
    // If company is present in updates, update root-level company field
    if (typeof updates.company === 'string') {
      await db.ref(`users/${userId}/company`).set(updates.company);
    }

    // Fetch current subscription from DB
    const userSnap = await db.ref(`users/${userId}/subscription`).once('value');
    const subscription = userSnap.val();
    if (!subscription || !subscription.stripeSubscriptionId) {
      return res.status(400).json({ error: "Active Stripe subscription not found for user" });
    }

    let stripeChanged = false;
    // Handle tier/plan change
    if (updates.subscriptionTier && updates.subscriptionTier !== subscription.tier) {
      const priceId = getPriceId(updates.subscriptionTier);
      if (!priceId) {
        return res.status(400).json({ error: "Invalid plan type" });
      }
      // Update Stripe subscription plan
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      if (!stripeSub || !stripeSub.items || !stripeSub.items.data.length) {
        return res.status(400).json({ error: "Stripe subscription items not found" });
      }
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{ id: stripeSub.items.data[0].id, price: priceId }],
        proration_behavior: 'create_prorations'
      });
      stripeChanged = true;
    }

    // Handle cancel at period end
    if (typeof updates.cancelAtPeriodEnd === 'boolean' && updates.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: updates.cancelAtPeriodEnd
      });
      stripeChanged = true;
    }

    // Handle status change (cancel/reactivate)
    if (updates.subscriptionStatus && updates.subscriptionStatus !== subscription.status) {
      if (updates.subscriptionStatus === 'CANCELLED') {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
        stripeChanged = true;
      } else if (updates.subscriptionStatus === 'ACTIVE') {
        // Reactivate: remove cancel_at_period_end if set
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: false });
        stripeChanged = true;
      }
    }

    // Only update DB directly for cancelAtPeriodEnd or status changes, not for plan/tier changes
    let dbUpdate = {};
    if (typeof updates.cancelAtPeriodEnd === 'boolean' && updates.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd) {
      dbUpdate.cancelAtPeriodEnd = updates.cancelAtPeriodEnd;
    }
    if (updates.subscriptionStatus && updates.subscriptionStatus !== subscription.status) {
      dbUpdate.status = updates.subscriptionStatus;
      if (updates.subscriptionStatus === 'CANCELLED') {
        dbUpdate.isActive = false;
      } else if (updates.subscriptionStatus === 'ACTIVE') {
        dbUpdate.isActive = true;
      }
    }
    if (Object.keys(dbUpdate).length > 0) {
      await updateUserSubscription(userId, {
        ...dbUpdate,
        adminUpdated: true,
        adminUpdatedAt: new Date().toISOString()
      });
    }

    res.json({ success: true, message: `Subscription updated successfully${stripeChanged ? ' (Stripe synced)' : ''}. Note: Plan/tier changes will reflect after Stripe webhook confirmation.` });
  } catch (err) {
    console.error("Error updating user subscription:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook endpoint
app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  console.log('[WEBHOOK] Received Stripe webhook', {
    headers: req.headers,
    rawBody: req.body && req.body.length ? req.body.toString('utf8') : undefined
  });
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
    console.log('[WEBHOOK] Stripe webhook event constructed', {
      type: event.type,
      id: event.id,
      payload: event.data && event.data.object ? event.data.object : event
    });
  } catch (err) {
    console.error('[WEBHOOK] Signature verification failed:', err.message, {
      sig,
      error: err,
      rawBody: req.body && req.body.length ? req.body.toString('utf8') : undefined
    });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        console.log('[DEBUG] Webhook: checkout.session.completed', { session });
        if (session.mode === 'subscription') {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const customer = await stripe.customers.retrieve(session.customer);
          console.log('[DEBUG] Webhook: Stripe subscription and customer fetched', { subscription, customer });
          await updateUserSubscription(session.metadata.userId, {
            status: 'ACTIVE',
            tier: session.metadata.planType,
            startDate: new Date(subscription.current_period_start * 1000).toISOString(),
            endDate: new Date(subscription.current_period_end * 1000).toISOString(),
            stripeCustomerId: customer.id,
            stripeSubscriptionId: subscription.id,
            nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: false,
            billing: {
              amount: subscription.items.data[0].price.unit_amount / 100,
              currency: subscription.items.data[0].price.currency.toUpperCase(),
            }
          });
          console.log('[DEBUG] Webhook: User subscription updated in DB', { userId: session.metadata.userId });
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('[DEBUG] Webhook: invoice.paid', { invoice });
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customer = await stripe.customers.retrieve(invoice.customer);
          // Find user by customer ID
          const usersSnapshot = await db.ref('users').once('value');
          let userId = null;
          usersSnapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.stripeCustomerId === customer.id) {
              userId = childSnapshot.key;
            }
          });
          if (userId) {
            await updateUserSubscription(userId, {
              status: 'ACTIVE',
              endDate: new Date(subscription.current_period_end * 1000).toISOString(),
              nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
              lastPaymentDate: new Date(invoice.created * 1000).toISOString()
            });
            console.log('[DEBUG] Webhook: User subscription updated in DB (invoice.paid)', { userId });
          } else {
            console.warn('[DEBUG] Webhook: No user found for customer in invoice.paid', { customerId: customer.id });
          }
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const deletedSubscription = event.data.object;
        console.log('[DEBUG] Webhook: customer.subscription.deleted', { deletedSubscription });
        const deletedCustomer = await stripe.customers.retrieve(deletedSubscription.customer);
        // Find user by customer ID
        const deletedUsersSnapshot = await db.ref('users').once('value');
        let deletedUserId = null;
        deletedUsersSnapshot.forEach(childSnapshot => {
          const userData = childSnapshot.val();
          if (userData.stripeCustomerId === deletedCustomer.id) {
            deletedUserId = childSnapshot.key;
          }
        });
        if (deletedUserId) {
          await updateUserSubscription(deletedUserId, {
            status: 'CANCELLED',
            isActive: false,
            endDate: new Date().toISOString(),
            billing: {
              cancelAtPeriodEnd: true,
              cancellationDate: new Date().toISOString()
            }
          });
          console.log('[DEBUG] Webhook: User subscription marked as cancelled in DB', { deletedUserId });
        } else {
          console.warn('[DEBUG] Webhook: No user found for customer in subscription.deleted', { customerId: deletedCustomer.id });
        }
        break;
      }
      case 'customer.subscription.updated': {
        let updatedSubscription = event.data.object;
        console.log('[DEBUG] Webhook: customer.subscription.updated', { updatedSubscription });
        const updatedCustomer = await stripe.customers.retrieve(updatedSubscription.customer);

        // If period fields are missing, fetch latest from Stripe
        if (!updatedSubscription.current_period_start || !updatedSubscription.current_period_end) {
          updatedSubscription = await stripe.subscriptions.retrieve(updatedSubscription.id);
        }

        // Find user by customer ID (check both stripeCustomerId and subscription.stripeCustomerId)
        const updatedUsersSnapshot = await db.ref('users').once('value');
        let updatedUserId = null;
        updatedUsersSnapshot.forEach(childSnapshot => {
          const userData = childSnapshot.val();
          if (userData.stripeCustomerId === updatedCustomer.id || 
              userData.subscription?.stripeCustomerId === updatedCustomer.id) {
            updatedUserId = childSnapshot.key;
          }
        });

        if (updatedUserId) {
          // Determine plan tier from Stripe price ID
          const priceId = updatedSubscription.items.data[0]?.price?.id;
          let tier = 'MONTHLY'; // default
          if (priceId === process.env.STRIPE_YEARLY_PRICE_ID) {
            tier = 'YEARLY';
          } else if (priceId === process.env.STRIPE_MONTHLY_PRICE_ID) {
            tier = 'MONTHLY';
          }

          // Add null checks for Stripe timestamps
          const startDate = updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000).toISOString() : null;
          const endDate = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000).toISOString() : null;
          const nextBillingDate = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000).toISOString() : null;

          // Standard subscription update with all required fields
          const subscriptionUpdate = {
            tier,
            status: updatedSubscription.status === 'active' ? 'ACTIVE' : 'INACTIVE',
            isActive: updatedSubscription.status === 'active',
            startDate,
            endDate,
            nextBillingDate,
            stripeCustomerId: updatedCustomer.id,
            stripeSubscriptionId: updatedSubscription.id,
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
            billing: {
              amount: updatedSubscription.items.data[0]?.price?.unit_amount ? updatedSubscription.items.data[0]?.price?.unit_amount / 100 : null,
              currency: updatedSubscription.items.data[0]?.price?.currency ? updatedSubscription.items.data[0]?.price?.currency.toUpperCase() : null,
              cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end
            },
            features: {
              exportEnabled: true,
              fullAccess: true,
              prioritySupport: tier === 'YEARLY'
            }
          };

          await updateUserSubscription(updatedUserId, subscriptionUpdate);
          console.log('[DEBUG] Webhook: User subscription updated in DB (subscription.updated)', {
            updatedUserId,
            tier,
            amount: subscriptionUpdate.billing.amount
          });
        } else {
          console.warn('[DEBUG] Webhook: No user found for customer in subscription.updated', { customerId: updatedCustomer.id });
        }
        break;
      }
      default:
        console.log(`[DEBUG] Webhook: Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error(`[DEBUG] Error handling webhook event ${event.type}:`, error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
  res.json({ received: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`OpssFlow Backend running on port ${PORT}`);
  console.log(`Stripe webhooks endpoint: /webhook`);
  console.log(`Admin endpoints: /admin/users, /admin/users/:userId/subscription`);
  console.log(`Reactivation endpoint: /reactivate-subscription`);
});
