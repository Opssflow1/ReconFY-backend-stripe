// Cognito JWT verification middleware
import cognitoAuthenticate from "./cognitoAuth.js";

import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import ImmutableAuditLogger from "./auditLogger.js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Initialize audit logger with database instance
const auditLogger = new ImmutableAuditLogger(db);

// Initialize AWS SES for email functionality
const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Email templates
const EMAIL_TEMPLATES = {
  INQUIRY_RECEIVED: {
    subject: "Your inquiry has been received - ReconFY Support",
    body: (ticketNumber, customerName) => `
Dear ${customerName},

Thank you for contacting ReconFY Support. We have received your inquiry and our team will review it shortly.

Ticket Number: ${ticketNumber}
Status: New

We typically respond within 24 hours during business days. If you have any urgent concerns, please fllow up by ticket number on the ReconFY Support Portal..

Best regards,
ReconFY Support Team
    `.trim()
  },
  
  STATUS_UPDATE: {
    subject: "Your inquiry status has been updated - ReconFY Support",
    body: (ticketNumber, customerName, status, adminResponse) => `
Dear ${customerName},

Your inquiry status has been updated:

Ticket Number: ${ticketNumber}
New Status: ${status}

${adminResponse ? `Response from our team:\n${adminResponse}\n` : ''}

Kindly track your request by ticket number on the ReconFY Support Portal.

Best regards,
ReconFY Support Team
    `.trim()
  },
  
  INQUIRY_RESOLVED: {
    subject: "Your inquiry has been resolved - ReconFY Support",
    body: (ticketNumber, customerName, resolution) => `
Dear ${customerName},

Great news! Your inquiry has been resolved:

Ticket Number: ${ticketNumber}
Status: Resolved

${resolution ? `Resolution:\n${resolution}\n` : ''}

Thank you for choosing ReconFY!

Best regards,
ReconFY Support Team
    `.trim()
  }
};

// Helper function to filter out undefined values from objects
function filterUndefined(obj) {
  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// Helper function to send emails
async function sendEmail(toEmail, subject, body, fromEmail = null) {
  try {
    const fromAddress = fromEmail || process.env.SES_FROM_EMAIL || 'noreply@opssflow.com';
    
    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const result = await sesClient.send(command);
    console.log('Email sent successfully:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Generate unique ticket number
function generateTicketNumber() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TKT-${timestamp}-${random}`.toUpperCase();
}

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

// Initialize Cognito client with credentials
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});




// Allow both deployed frontend and localhost for CORS
const allowedOrigins = [
  process.env.FRONTEND_URL?.trim(),
  "http://localhost:3001",
  "http://localhost:3000",
  "https://main.d2ukbtk1dng1se.amplifyapp.com",
  "https://main.d2899pnyi792jc.amplifyapp.com"
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
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
        company: val.company || null,
        // NEW: Legal acceptance data
        legalAcceptance: val.legalAcceptance || null,
        createdAt: val.createdAt || null,
        updatedAt: val.updatedAt || null
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

// -----------------------------
// Analytics Endpoints (Single Heading: analytics/{userId}/{analyticsId})
// -----------------------------

// Create analytics record for current user
app.post('/analytics', cognitoAuthenticate, async (req, res) => {
  try {
    const userId = req.user.sub;
    const {
      analysisType,
      profitData,
      calculationResults,
      missingRebates,
      totalProfit,
      totalRevenue,
      filesProcessed,
      metadata
    } = req.body || {};

    const analyticsId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const nowIso = new Date().toISOString();

    const record = {
      id: analyticsId,
      userId,
      analysisType: analysisType || 'profit_calculation',
      profitData: profitData || {},
      calculationResults: calculationResults || {},
      missingRebates: missingRebates || {},
      totalProfit: typeof totalProfit === 'number' ? totalProfit : null,
      totalRevenue: typeof totalRevenue === 'number' ? totalRevenue : null,
      filesProcessed: typeof filesProcessed === 'number' ? filesProcessed : null,
      metadata: {
        ...(metadata || {}),
        calculationTimestamp: nowIso,
        source: (metadata && metadata.source) || 'backend'
      },
      analysisDate: nowIso,
      createdAt: nowIso
    };

    await db.ref(`analytics/${userId}/${analyticsId}`).set(record);
    return res.json(record);
  } catch (err) {
    console.error('[DEBUG] Error creating analytics:', err);
    return res.status(500).json({ error: 'Failed to create analytics' });
  }
});

// Get current user's analytics list (sorted desc by createdAt)
app.get('/analytics', cognitoAuthenticate, async (req, res) => {
  try {
    const userId = req.user.sub;
    const snap = await db.ref(`analytics/${userId}`).once('value');
    if (!snap.exists()) return res.json([]);
    const rows = Object.values(snap.val()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error('[DEBUG] Error fetching analytics:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Delete all analytics for current user
app.delete('/analytics', cognitoAuthenticate, async (req, res) => {
  try {
    const userId = req.user.sub;
    await db.ref(`analytics/${userId}`).remove();
    return res.json({ success: true });
  } catch (err) {
    console.error('[DEBUG] Error deleting analytics:', err);
    return res.status(500).json({ error: 'Failed to delete analytics' });
  }
});

// Admin: get analytics for specific user
app.get('/admin/analytics/:userId', cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }
  try {
    const { userId } = req.params;
    const snap = await db.ref(`analytics/${userId}`).once('value');
    if (!snap.exists()) return res.json([]);
    const rows = Object.values(snap.val()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error('[DEBUG] Error fetching user analytics (admin):', err);
    return res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
});

// Admin: delete all analytics for specific user
app.delete('/admin/analytics/:userId', cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: 'Forbidden: Admins only' });
  }
  try {
    const { userId } = req.params;
    
    // Fetch user data for audit logging
    const userDataSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userDataSnap.val();
    
    await db.ref(`analytics/${userId}`).remove();
    
    // Log the successful analytics deletion
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'USER_ANALYTICS_DELETED',
        category: 'DATA_MANAGEMENT'
      },
      { id: userId, email: userData?.email },
      {
        before: null,
        after: null,
        changes: ['analytics_deleted']
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
        deleteOperation: true
      }
    );
    
    return res.json({ success: true });
  } catch (err) {
    console.error('[DEBUG] Error deleting user analytics (admin):', err);
    
    // Log the failed analytics deletion
    try {
      await auditLogger.createFailedAuditLog(
        req.user,
        {
          type: 'USER_ANALYTICS_DELETE_FAILED',
          category: 'DATA_MANAGEMENT'
        },
        { id: userId, email: userData?.email },
        err,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          sessionId: req.headers['x-session-id'] || 'unknown',
          mfaUsed: req.user.mfaUsed || false,
          sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
        }
      );
    } catch (auditError) {
      console.error("Failed to log audit entry:", auditError);
    }
    
    return res.status(500).json({ error: 'Failed to delete user analytics' });
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
    // Fetch user data first for audit logging
    const userDataSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userDataSnap.val();
    if (!userData) {
      return res.status(404).json({ error: "User not found" });
    }

    // If company is present in updates, update root-level company field
    // Using update() instead of set() to preserve existing user data structure
    if (typeof updates.company === 'string') {
      await db.ref(`users/${userId}`).update({ company: updates.company });
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
    let changes = [];
    
    if (typeof updates.cancelAtPeriodEnd === 'boolean' && updates.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd) {
      dbUpdate.cancelAtPeriodEnd = updates.cancelAtPeriodEnd;
      changes.push('cancelAtPeriodEnd');
    }
    if (updates.subscriptionStatus && updates.subscriptionStatus !== subscription.status) {
      dbUpdate.status = updates.subscriptionStatus;
      if (updates.subscriptionStatus === 'CANCELLED') {
        dbUpdate.isActive = false;
      } else if (updates.subscriptionStatus === 'ACTIVE') {
        dbUpdate.isActive = true;
      }
      changes.push('subscriptionStatus');
    }
    
    // Track tier changes even though they're handled by Stripe webhook
    if (updates.subscriptionTier && updates.subscriptionTier !== subscription.tier) {
      changes.push('tier');
      // Add tier change info to the changes array for better tracking
      changes.push(`tier:${subscription.tier}->${updates.subscriptionTier}`);
    }
    
    if (Object.keys(dbUpdate).length > 0) {
      await updateUserSubscription(userId, {
        ...dbUpdate,
        adminUpdated: true,
        adminUpdatedAt: new Date().toISOString()
      });
    }

    // Log the successful admin action
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'USER_SUBSCRIPTION_UPDATED',
        category: 'USER_MANAGEMENT'
      },
      { id: userId, email: userData?.email },
      {
        before: subscription,
        after: { ...subscription, ...dbUpdate },
        changes: changes
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
      }
    );

    res.json({ success: true, message: `Subscription updated successfully${stripeChanged ? ' (Stripe synced)' : ''}. Note: Plan/tier changes will reflect after Stripe webhook confirmation.` });
  } catch (err) {
    console.error("Error updating user subscription:", err);
    
    // Log the failed admin action
    try {
      await auditLogger.createFailedAuditLog(
        req.user,
        {
          type: 'USER_SUBSCRIPTION_UPDATE_FAILED',
          category: 'USER_MANAGEMENT'
        },
        { id: userId, email: userData?.email },
        err,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          sessionId: req.headers['x-session-id'] || 'unknown',
          mfaUsed: req.user.mfaUsed || false,
          sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
        }
      );
    } catch (auditError) {
      console.error("Failed to log audit entry:", auditError);
    }
    
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete user completely (Firebase, Stripe, Cognito)
app.delete('/admin/users/:userId', cognitoAuthenticate, async (req, res) => {
  // Admin group check (Cognito 'Admins' group)
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }

  const { userId } = req.params;
  console.log('[ADMIN] User deletion requested', { userId, adminUser: req.user.sub });

  try {
    // Step 1: Get user data from Firebase
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userSnap.val();
    
    if (!userData) {
      return res.status(404).json({ error: "User not found in database" });
    }

    console.log('[ADMIN] User data retrieved', { userId, email: userData.email, stripeCustomerId: userData.subscription?.stripeCustomerId });

    // Step 2: Delete from Stripe (if customer exists)
    let stripeDeleted = false;
    if (userData.subscription?.stripeCustomerId) {
      try {
        // Cancel all subscriptions first
        const subscriptions = await stripe.subscriptions.list({
          customer: userData.subscription.stripeCustomerId,
          limit: 100
        });
        
        for (const subscription of subscriptions.data) {
          await stripe.subscriptions.cancel(subscription.id);
          console.log('[ADMIN] Stripe subscription cancelled', { subscriptionId: subscription.id });
        }

        // Delete the customer
        await stripe.customers.del(userData.subscription.stripeCustomerId);
        stripeDeleted = true;
        console.log('[ADMIN] Stripe customer deleted', { customerId: userData.subscription.stripeCustomerId });
      } catch (stripeError) {
        console.error('[ADMIN] Stripe deletion error', { error: stripeError.message, customerId: userData.subscription.stripeCustomerId });
        // Continue with other deletions even if Stripe fails
      }
    }

    // Step 3: Delete from Cognito (if email exists)
    let cognitoDeleted = false;
    if (userData.email) {
      try {
        const deleteUserCommand = new AdminDeleteUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: userData.email
        });
        
        await cognitoClient.send(deleteUserCommand);
        cognitoDeleted = true;
        console.log('[ADMIN] Cognito user deleted', { email: userData.email });
      } catch (cognitoError) {
        console.error('[ADMIN] Cognito deletion error', { error: cognitoError.message, email: userData.email });
        // Continue with other deletions even if Cognito fails
      }
    }

    // Step 4: Delete from Firebase (user data and analytics)
    try {
      // Delete user analytics
      await db.ref(`analytics/${userId}`).remove();
      console.log('[ADMIN] User analytics deleted', { userId });

      // Delete user profile and subscription
      await db.ref(`users/${userId}`).remove();
      console.log('[ADMIN] User profile deleted', { userId });
    } catch (firebaseError) {
      console.error('[ADMIN] Firebase deletion error', { error: firebaseError.message, userId });
      throw firebaseError; // Re-throw Firebase errors as they're critical
    }

    // Step 5: Log the deletion
    console.log('[ADMIN] User deletion completed', {
      userId,
      email: userData.email,
      stripeDeleted,
      cognitoDeleted,
      adminUser: req.user.sub,
      timestamp: new Date().toISOString()
    });

    // Log the successful user deletion
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'USER_DELETED',
        category: 'USER_MANAGEMENT'
      },
      { id: userId, email: userData.email },
      {
        before: userData,
        after: null,
        changes: ['user_deleted', 'stripe_deleted', 'cognito_deleted', 'analytics_deleted']
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
        userDeletion: true,
        deleteOperation: true,
        sensitiveData: true
      }
    );

    res.json({
      success: true,
      message: "User deleted successfully",
      details: {
        userId,
        email: userData.email,
        stripeDeleted,
        cognitoDeleted,
        firebaseDeleted: true
      }
    });

  } catch (error) {
    console.error('[ADMIN] User deletion failed', { error: error.message, userId });
    res.status(500).json({
      error: "Failed to delete user",
      message: error.message,
      userId
    });
  }
});

// Admin: Get audit logs
app.get('/admin/audit-logs', cognitoAuthenticate, async (req, res) => {
  // Admin group check (Cognito 'Admins' group)
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }

  try {
    const filters = {
      adminUser: req.query.adminUser,
      action: req.query.action,
      dateRange: req.query.dateRange || '7d'
    };

    const auditLogs = await auditLogger.getAuditLogs(filters);
    
    res.json({
      success: true,
      logs: auditLogs,
      total: auditLogs.length,
      filters: filters
    });
  } catch (error) {
    console.error('[AUDIT] Failed to get audit logs:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// Admin: Verify audit log integrity
app.get('/admin/audit-logs/:logId/verify', cognitoAuthenticate, async (req, res) => {
  // Admin group check (Cognito 'Admins' group)
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }

  try {
    const { logId } = req.params;
    const isIntegrityValid = await auditLogger.verifyLogIntegrity(logId);
    
    res.json({
      success: true,
      logId: logId,
      integrityValid: isIntegrityValid
    });
  } catch (error) {
    console.error('[AUDIT] Failed to verify log integrity:', error);
    res.status(500).json({ error: 'Failed to verify log integrity' });
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
          
          // Log subscription activation for audit purposes
          try {
            const userData = await db.ref(`users/${session.metadata.userId}`).once('value');
            const user = userData.val();
            if (user) {
              await auditLogger.createAuditLog(
                { sub: 'SYSTEM', email: 'system@opssflow.com' }, // System identifier for automated actions
                {
                  type: 'SUBSCRIPTION_ACTIVATED',
                  category: 'LEGAL_COMPLIANCE'
                },
                {
                  id: user.id,
                  email: user.email,
                  type: 'LEGAL_ACCEPTANCE',
                  company: user.company,
                  termsVersion: user.legalAcceptance?.termsOfService?.version || '1.0.0',
                  privacyVersion: user.legalAcceptance?.privacyPolicy?.version || '1.0.0',
                  acceptedAt: user.legalAcceptance?.termsOfService?.acceptedAt || 'unknown',
                  ipAddress: user.legalAcceptance?.termsOfService?.ipAddress || 'unknown',
                  userAgent: user.legalAcceptance?.termsOfService?.userAgent || 'unknown'
                },
                {
                  before: { subscriptionStatus: 'TRIAL' },
                  after: { subscriptionStatus: 'ACTIVE', tier: session.mode },
                  changes: ['subscription_activation', 'plan_upgrade']
                },
                {
                  ipAddress: 'webhook',
                  userAgent: 'stripe-webhook',
                  sessionId: session.id,
                  legalAction: true,
                  gdprConsent: true
                }
              );
            }
          } catch (auditError) {
            console.error('[AUDIT] Failed to log subscription activation', { error: auditError.message, userId: session.metadata.userId });
          }
          
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
          // Find user by customer ID (only check subscription.stripeCustomerId)
          const usersSnapshot = await db.ref('users').once('value');
          let userId = null;
          usersSnapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.subscription?.stripeCustomerId === customer.id) {
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
        // Find user by customer ID (only check subscription.stripeCustomerId)
        const deletedUsersSnapshot = await db.ref('users').once('value');
        let deletedUserId = null;
        deletedUsersSnapshot.forEach(childSnapshot => {
          const userData = childSnapshot.val();
          if (userData.subscription?.stripeCustomerId === deletedCustomer.id) {
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

        // Find user by customer ID (only check subscription.stripeCustomerId)
        const updatedUsersSnapshot = await db.ref('users').once('value');
        let updatedUserId = null;
        updatedUsersSnapshot.forEach(childSnapshot => {
          const userData = childSnapshot.val();
          if (userData.subscription?.stripeCustomerId === updatedCustomer.id) {
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

// Enhanced Contact form submission endpoint
app.post("/contact", async (req, res) => {
  try {
    const { firstName, lastName, email, company, message, category = 'GENERAL' } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !message) {
      return res.status(400).json({ error: "All required fields must be provided" });
    }
    
    // Generate ticket number
    const ticketNumber = generateTicketNumber();
    
    // Create contact inquiry record
    const contactId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const contactData = {
      id: contactId,
      ticketNumber,
      firstName,
      lastName,
      email,
      company: company || null,
      message,
      category: category || 'GENERAL',
      status: 'NEW',
      priority: 'MEDIUM',
      source: 'WEBSITE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: [], // Array to store admin responses
      customerReplies: [], // Array to store customer replies
      assignedTo: null,
      adminNotes: null,
      metadata: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        referrer: req.headers.referer || 'direct'
      }
    };
    
    // Store in Firebase
    await db.ref(`contactInquiries/${contactId}`).set(contactData);
    
    // Send confirmation email to customer
    try {
      console.log('Attempting to send confirmation email:', {
        email,
        ticketNumber,
        firstName,
        sendEmailFunctionAvailable: typeof sendEmail === 'function'
      });
      
      // Check if sendEmail function is available
      if (typeof sendEmail === 'function') {
        console.log('Sending confirmation email via sendEmail function...');
        const emailResult = await sendEmail(
          email,
          EMAIL_TEMPLATES.INQUIRY_RECEIVED.subject,
          EMAIL_TEMPLATES.INQUIRY_RECEIVED.body(ticketNumber, firstName)
        );
        console.log('Confirmation email sent successfully:', emailResult);
      } else {
        console.error('sendEmail function is not available - this should not happen!');
      }
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({ 
      success: true, 
      message: "Contact inquiry submitted successfully",
      contactId,
      ticketNumber
    });
    
  } catch (error) {
    console.error("Error submitting contact form:", error);
    res.status(500).json({ error: "Failed to submit contact form" });
  }
});

// Admin: Get all contact inquiries with enhanced filters
app.get("/admin/contact-inquiries", cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  
  try {
    const { status, priority, category, dateRange, assignedTo, search } = req.query;
    const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
    let inquiries = [];
    
    if (inquiriesSnapshot.exists()) {
      inquiriesSnapshot.forEach(childSnapshot => {
        inquiries.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
    }
    
    // Apply filters
    if (status && status !== 'ALL') {
      inquiries = inquiries.filter(inq => inq.status === status);
    }
    if (priority && priority !== 'ALL') {
      inquiries = inquiries.filter(inq => inq.priority === priority);
    }
    if (category && category !== 'ALL') {
      inquiries = inquiries.filter(inq => inq.category === category);
    }
    if (assignedTo && assignedTo !== 'ALL') {
      inquiries = inquiries.filter(inq => inq.assignedTo === assignedTo);
    }
    if (dateRange && dateRange !== 'ALL') {
      const cutoffDate = new Date();
      if (dateRange === '7d') cutoffDate.setDate(cutoffDate.getDate() - 7);
      else if (dateRange === '30d') cutoffDate.setDate(cutoffDate.getDate() - 30);
      else if (dateRange === '90d') cutoffDate.setDate(cutoffDate.getDate() - 90);
      
      inquiries = inquiries.filter(inq => new Date(inq.createdAt) >= cutoffDate);
    }
    
    // Search functionality
    if (search) {
      const searchLower = search.toLowerCase();
      inquiries = inquiries.filter(inq => 
        inq.firstName?.toLowerCase().includes(searchLower) ||
        inq.lastName?.toLowerCase().includes(searchLower) ||
        inq.email?.toLowerCase().includes(searchLower) ||
        inq.company?.toLowerCase().includes(searchLower) ||
        inq.message?.toLowerCase().includes(searchLower) ||
        inq.ticketNumber?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort by creation date (newest first)
    inquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({ inquiries });
  } catch (error) {
    console.error("Error fetching contact inquiries:", error);
    res.status(500).json({ error: "Failed to fetch contact inquiries" });
  }
});

// Admin: Update contact inquiry with response system
app.put("/admin/contact-inquiries/:inquiryId", cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  
  try {
    const { inquiryId } = req.params;
    const { 
      status, 
      priority, 
      adminNotes, 
      assignedTo, 
      response,
      sendEmailToCustomer = true
    } = req.body;
    
    // Get current inquiry data
    const inquirySnapshot = await db.ref(`contactInquiries/${inquiryId}`).once('value');
    if (!inquirySnapshot.exists()) {
      return res.status(404).json({ error: "Contact inquiry not found" });
    }
    
    const currentInquiry = inquirySnapshot.val();
    const previousStatus = currentInquiry.status;
    
    // Build updates object, filtering out undefined values
    const updates = {};
    
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (assignedTo !== undefined) updates.assignedTo = assignedTo;
    
    // Always update these fields
    updates.updatedAt = new Date().toISOString();
    updates.lastUpdatedBy = req.user.sub;
    
    // Add response to responses array if provided
    if (response) {
      const newResponse = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        message: response,
        adminId: req.user.sub,
        adminName: req.user.name || req.user.email || 'Admin',
        timestamp: new Date().toISOString()
      };
      
      const responses = currentInquiry.responses || [];
      responses.push(newResponse);
      updates.responses = responses;
    }
    
    // Filter out any undefined values before sending to Firebase
    const filteredUpdates = filterUndefined(updates);
    await db.ref(`contactInquiries/${inquiryId}`).update(filteredUpdates);
    
    // Send email to customer if requested and status changed or response added
    if (sendEmailToCustomer && (status !== previousStatus || response)) {
      console.log('Attempting to send status update email:', {
        email: currentInquiry.email,
        ticketNumber: currentInquiry.ticketNumber,
        statusChanged: status !== previousStatus,
        responseAdded: !!response,
        sendEmailFunctionAvailable: typeof sendEmail === 'function'
      });
      
      try {
        let emailSubject, emailBody;
        
        if (status === 'RESOLVED') {
          emailSubject = EMAIL_TEMPLATES.INQUIRY_RESOLVED.subject;
          emailBody = EMAIL_TEMPLATES.INQUIRY_RESOLVED.body(
            currentInquiry.ticketNumber,
            currentInquiry.firstName,
            response
          );
        } else if (status !== previousStatus) {
          emailSubject = EMAIL_TEMPLATES.STATUS_UPDATE.subject;
          emailBody = EMAIL_TEMPLATES.STATUS_UPDATE.body(
            currentInquiry.ticketNumber,
            currentInquiry.firstName,
            status,
            response
          );
        } else if (response) {
          emailSubject = EMAIL_TEMPLATES.STATUS_UPDATE.subject;
          emailBody = EMAIL_TEMPLATES.STATUS_UPDATE.body(
            currentInquiry.ticketNumber,
            currentInquiry.firstName,
            status,
            response
          );
        }
        
        if (emailSubject && emailBody) {
          // Check if sendEmail function is available
          if (typeof sendEmail === 'function') {
            console.log('Sending status update email via sendEmail function...');
            const emailResult = await sendEmail(
              currentInquiry.email,
              emailSubject,
              emailBody
            );
            console.log('Status update email sent successfully:', emailResult);
          } else {
            console.error('sendEmail function is not available - this should not happen!');
          }
        }
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('Status update email not sent:', {
        sendEmailToCustomer,
        statusChanged: status !== previousStatus,
        responseAdded: !!response
      });
    }
    
    // Log the admin action
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'CONTACT_INQUIRY_UPDATED',
        category: 'CUSTOMER_SUPPORT'
      },
      { 
        id: inquiryId, 
        ticketNumber: currentInquiry.ticketNumber,
        email: currentInquiry.email,
        firstName: currentInquiry.firstName,
        lastName: currentInquiry.lastName,
        company: currentInquiry.company,
        type: 'INQUIRY'
      },
      {
        before: { status: previousStatus, priority: currentInquiry.priority },
        after: updates,
        changes: Object.keys(updates)
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
      }
    );
    
    res.json({ success: true, message: "Contact inquiry updated successfully" });
  } catch (error) {
    console.error("Error updating contact inquiry:", error);
    res.status(500).json({ error: "Failed to update contact inquiry" });
  }
});

// Admin: Send response to customer
app.post("/admin/contact-inquiries/:inquiryId/respond", cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  
  try {
    const { inquiryId } = req.params;
    const { response, sendEmailToCustomer = true } = req.body;
    
    if (!response) {
      return res.status(400).json({ error: "Response message is required" });
    }
    
    // Get current inquiry data
    const inquirySnapshot = await db.ref(`contactInquiries/${inquiryId}`).once('value');
    if (!inquirySnapshot.exists()) {
      return res.status(404).json({ error: "Contact inquiry not found" });
    }
    
    const currentInquiry = inquirySnapshot.val();
    
    // Add response to responses array
    const newResponse = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      message: response,
      adminId: req.user.sub,
      adminName: req.user.name || req.user.email,
      timestamp: new Date().toISOString()
    };
    
    const responses = currentInquiry.responses || [];
    responses.push(newResponse);
    
    // Update inquiry - ensure all values are defined
    const updates = {
      responses: responses,
      updatedAt: new Date().toISOString(),
      lastUpdatedBy: req.user.sub || 'unknown'
    };
    
    // Filter out any undefined values before sending to Firebase
    const filteredUpdates = filterUndefined(updates);
    await db.ref(`contactInquiries/${inquiryId}`).update(filteredUpdates);
    
    // Send email to customer if requested
    if (sendEmailToCustomer) {
      console.log('Attempting to send email to customer:', {
        email: currentInquiry.email,
        ticketNumber: currentInquiry.ticketNumber,
        sendEmailFunctionAvailable: typeof sendEmail === 'function'
      });
      
      try {
        const emailSubject = `Response to your inquiry - ${currentInquiry.ticketNumber}`;
        const emailBody = `
Dear ${currentInquiry.firstName},

You have received a response to your inquiry:

Ticket Number: ${currentInquiry.ticketNumber}
Response from our team:

${response}

Kindly track your request by ticket number on the ReconFY Support Portal.

Best regards,
ReconFY Support Team
        `.trim();
        
        // Check if sendEmail function is available
        if (typeof sendEmail === 'function') {
          console.log('Sending email via sendEmail function...');
          const emailResult = await sendEmail(
            currentInquiry.email,
            emailSubject,
            emailBody
          );
          console.log('Email sent successfully:', emailResult);
        } else {
          console.error('sendEmail function is not available - this should not happen!');
        }
      } catch (emailError) {
        console.error('Failed to send response email:', emailError);
        // Don't fail the request if email fails
      }
    } else {
      console.log('Email not sent - sendEmailToCustomer is false');
    }
    
    // Log the action
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'CONTACT_INQUIRY_RESPONSE_SENT',
        category: 'CUSTOMER_SUPPORT'
      },
      { 
        id: inquiryId, 
        ticketNumber: currentInquiry.ticketNumber,
        email: currentInquiry.email,
        firstName: currentInquiry.firstName,
        lastName: currentInquiry.lastName,
        company: currentInquiry.company,
        type: 'INQUIRY'
      },
      {
        before: null,
        after: { response: newResponse },
        changes: ['response_sent']
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
      }
    );
    
    res.json({ success: true, message: "Response sent successfully" });
  } catch (error) {
    console.error("Error sending response:", error);
    res.status(500).json({ error: "Failed to send response" });
  }
});

// Admin: Get contact inquiry statistics
app.get("/admin/contact-inquiries/stats", cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  
  try {
    const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
    let inquiries = [];
    
    if (inquiriesSnapshot.exists()) {
      inquiriesSnapshot.forEach(childSnapshot => {
        inquiries.push(childSnapshot.val());
      });
    }
    
    // Calculate statistics
    const stats = {
      total: inquiries.length,
      byStatus: {
        NEW: inquiries.filter(inq => inq.status === 'NEW').length,
        IN_PROGRESS: inquiries.filter(inq => inq.status === 'IN_PROGRESS').length,
        RESOLVED: inquiries.filter(inq => inq.status === 'RESOLVED').length,
        CLOSED: inquiries.filter(inq => inq.status === 'CLOSED').length,
        CUSTOMER_REPLY: inquiries.filter(inq => inq.status === 'CUSTOMER_REPLY').length
      },
      byPriority: {
        LOW: inquiries.filter(inq => inq.priority === 'LOW').length,
        MEDIUM: inquiries.filter(inq => inq.priority === 'MEDIUM').length,
        HIGH: inquiries.filter(inq => inq.priority === 'HIGH').length,
        URGENT: inquiries.filter(inq => inq.priority === 'URGENT').length
      },
      byCategory: {
        GENERAL: inquiries.filter(inq => inq.category === 'GENERAL').length,
        TECHNICAL: inquiries.filter(inq => inq.category === 'TECHNICAL').length,
        BILLING: inquiries.filter(inq => inq.category === 'BILLING').length,
        FEATURE_REQUEST: inquiries.filter(inq => inq.category === 'FEATURE_REQUEST').length
      },
      averageResponseTime: 0, // TODO: Calculate based on first response time
      unassigned: inquiries.filter(inq => !inq.assignedTo).length,
      customerReplies: inquiries.reduce((total, inq) => total + (inq.customerReplies?.length || 0), 0)
    };
    
    res.json({ stats });
  } catch (error) {
    console.error("Error fetching contact statistics:", error);
    res.status(500).json({ error: "Failed to fetch contact statistics" });
  }
});

// Public: Get ticket by ticket number (customer portal)
app.get("/ticket/:ticketNumber", async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    
    if (!ticketNumber) {
      return res.status(400).json({ error: "Ticket number is required" });
    }
    
    // Search for ticket in Firebase
    const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
    let foundInquiry = null;
    
    if (inquiriesSnapshot.exists()) {
      inquiriesSnapshot.forEach(childSnapshot => {
        const inquiry = childSnapshot.val();
        if (inquiry.ticketNumber === ticketNumber) {
          foundInquiry = {
            id: childSnapshot.key,
            ...inquiry
          };
        }
      });
    }
    
    if (!foundInquiry) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    
    // Return ticket details (excluding sensitive admin info)
    const ticketData = {
      ticketNumber: foundInquiry.ticketNumber,
      firstName: foundInquiry.firstName,
      lastName: foundInquiry.lastName,
      email: foundInquiry.email,
      company: foundInquiry.company,
      message: foundInquiry.message,
      category: foundInquiry.category,
      status: foundInquiry.status,
      priority: foundInquiry.priority,
      createdAt: foundInquiry.createdAt,
      updatedAt: foundInquiry.updatedAt,
      responses: foundInquiry.responses || [],
      customerReplies: foundInquiry.customerReplies || []
    };
    
    res.json({ success: true, ticket: ticketData });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// Public: Customer reply to ticket
app.post("/ticket/:ticketNumber/reply", async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { message, customerEmail, customerName } = req.body;
    
    if (!message || !customerEmail || !customerName) {
      return res.status(400).json({ error: "Message, customer email, and customer name are required" });
    }
    
    // Find the ticket
    const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
    let foundInquiry = null;
    let inquiryId = null;
    
    if (inquiriesSnapshot.exists()) {
      inquiriesSnapshot.forEach(childSnapshot => {
        const inquiry = childSnapshot.val();
        if (inquiry.ticketNumber === ticketNumber) {
          foundInquiry = inquiry;
          inquiryId = childSnapshot.key;
        }
      });
    }
    
    if (!foundInquiry) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    
    // Check if ticket is resolved (no more replies allowed)
    if (foundInquiry.status === 'RESOLVED') {
      return res.status(400).json({ error: "Cannot reply to resolved ticket" });
    }
    
    // Verify customer email matches ticket email
    if (foundInquiry.email !== customerEmail) {
      return res.status(403).json({ error: "Email does not match ticket" });
    }
    
    // Create customer reply
    const customerReply = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      message: message,
      customerEmail: customerEmail,
      customerName: customerName,
      timestamp: new Date().toISOString()
    };
    
    // Add to customerReplies array
    const customerReplies = foundInquiry.customerReplies || [];
    customerReplies.push(customerReply);
    
    // Update ticket
    const updates = {
      customerReplies: customerReplies,
      status: 'CUSTOMER_REPLY',
      updatedAt: new Date().toISOString(),
      lastCustomerReply: new Date().toISOString()
    };
    
    await db.ref(`contactInquiries/${inquiryId}`).update(updates);
    
    // Send notification email to admins (optional)
    try {
      if (typeof sendEmail === 'function') {
        const adminNotificationSubject = `Customer Reply - Ticket ${ticketNumber}`;
        const adminNotificationBody = `
A customer has replied to ticket ${ticketNumber}:

Customer: ${customerName} (${customerEmail})
Message: ${message}

Please review and respond in the admin dashboard.

Best regards,
ReconFY System
        `.trim();
        
        // Get admin emails from users collection
        const usersSnapshot = await db.ref('users').once('value');
        const adminEmails = [];
        
        if (usersSnapshot.exists()) {
          usersSnapshot.forEach(childSnapshot => {
            const user = childSnapshot.val();
            if (user.role === 'admin' || user.role === 'Admin') {
              adminEmails.push(user.email);
            }
          });
        }
        
        // Send to each admin
        for (const adminEmail of adminEmails) {
          try {
            await sendEmail(adminEmail, adminNotificationSubject, adminNotificationBody);
          } catch (emailError) {
            console.error(`Failed to send admin notification to ${adminEmail}:`, emailError);
          }
        }
      }
    } catch (emailError) {
      console.error('Failed to send admin notifications:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({ 
      success: true, 
      message: "Reply sent successfully",
      replyId: customerReply.id
    });
    
  } catch (error) {
    console.error("Error sending customer reply:", error);
    res.status(500).json({ error: "Failed to send reply" });
  }
});

// Admin: Delete contact inquiry
app.delete("/admin/contact-inquiries/:inquiryId", cognitoAuthenticate, async (req, res) => {
  const groups = req.user["cognito:groups"] || [];
  if (!groups.includes("Admins")) {
    return res.status(403).json({ error: "Forbidden: Admins only" });
  }
  
  try {
    const { inquiryId } = req.params;
    
    // Fetch inquiry data for audit logging
    const inquirySnap = await db.ref(`contactInquiries/${inquiryId}`).once('value');
    const inquiryData = inquirySnap.val();
    
    if (!inquiryData) {
      return res.status(404).json({ error: "Contact inquiry not found" });
    }
    
    await db.ref(`contactInquiries/${inquiryId}`).remove();
    
    // Log the deletion
    await auditLogger.createAuditLog(
      req.user,
      {
        type: 'CONTACT_INQUIRY_DELETED',
        category: 'CUSTOMER_SUPPORT'
      },
      { id: inquiryId, email: inquiryData.email },
      {
        before: inquiryData,
        after: null,
        changes: ['inquiry_deleted']
      },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['x-session-id'] || 'unknown',
        mfaUsed: req.user.mfaUsed || false,
        sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
        deleteOperation: true
      }
    );
    
    res.json({ success: true, message: "Contact inquiry deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact inquiry:", error);
    res.status(500).json({ error: "Failed to delete contact inquiry" });
  }
});

// Admin: Get legal compliance statistics
app.get("/admin/legal-compliance", cognitoAuthenticate, async (req, res) => {
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
        email: val.email || null,
        company: val.company || null,
        legalAcceptance: val.legalAcceptance || null,
        createdAt: val.createdAt || null
      });
    });
    
    const stats = {
      totalUsers: users.length,
      termsAccepted: users.filter(u => u.legalAcceptance?.termsOfService?.accepted).length,
      privacyAccepted: users.filter(u => u.legalAcceptance?.privacyPolicy?.accepted).length,
      allLegalAccepted: users.filter(u => 
        u.legalAcceptance?.termsOfService?.accepted && 
        u.legalAcceptance?.privacyPolicy?.accepted
      ).length,
      pendingLegalAcceptance: users.filter(u => 
        !u.legalAcceptance?.termsOfService?.accepted || 
        !u.legalAcceptance?.privacyPolicy?.accepted
      ).length,
      complianceRate: users.length > 0 ? 
        (users.filter(u => 
          u.legalAcceptance?.termsOfService?.accepted && 
          u.legalAcceptance?.privacyPolicy?.accepted
        ).length / users.length * 100).toFixed(1) : 0,
      lastUpdated: new Date().toISOString()
    };
    
    res.json({ stats });
  } catch (err) {
    console.error("Error fetching legal compliance stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// Log terms acceptance for audit purposes
app.post("/log/terms-acceptance", async (req, res) => {
  try {
    const { userId, email, company, termsVersion, privacyVersion, ipAddress, userAgent } = req.body;
    
    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Log terms acceptance for audit purposes
    await auditLogger.createAuditLog(
      { sub: 'SYSTEM', email: 'system@opssflow.com' }, // System identifier for automated actions
      {
        type: 'TERMS_ACCEPTED',
        category: 'LEGAL_COMPLIANCE'
      },
      {
        id: userId,
        email: email,
        type: 'LEGAL_ACCEPTANCE',
        company: company,
        termsVersion: termsVersion || '1.0.0',
        privacyVersion: privacyVersion || '1.0.0',
        acceptedAt: new Date().toISOString(),
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown'
      },
      {
        before: { termsAccepted: false, privacyAccepted: false },
        after: { termsAccepted: true, privacyAccepted: true },
        changes: ['terms_acceptance', 'privacy_acceptance']
      },
      {
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        sessionId: 'signup',
        legalAction: true,
        gdprConsent: true
      }
    );

    res.json({ success: true, message: 'Terms acceptance logged successfully' });
  } catch (error) {
    console.error('Error in /log/terms-acceptance:', error);
    res.status(500).json({ error: 'Failed to log terms acceptance' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`OpssFlow Backend running on port ${PORT}`);
  console.log(`Stripe webhooks endpoint: /webhook`);
  console.log(`Admin endpoints: /admin/users, /admin/users/:userId/subscription, /admin/users/:userId (DELETE), /admin/audit-logs`);
  console.log(`Contact endpoints: /contact, /ticket/:ticketNumber, /admin/contact-inquiries, /admin/contact-inquiries/stats`);
  console.log(`Reactivation endpoint: /reactivate-subscription`);
});
