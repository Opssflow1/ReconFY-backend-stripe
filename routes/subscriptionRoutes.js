// Subscription Management Routes for ReconFY backend
// Extracted from index.js for better modularity

import Joi from "joi";
import { subscriptionSchema, checkoutSessionSchema, verifyPaymentBodySchema, cancelSubscriptionBodySchema, reactivateSubscriptionBodySchema, billingPortalBodySchema, subscriptionMeQuerySchema, subscriptionValidateQuerySchema } from "../schemas.js";
import { globalLimiter, authLimiter } from "../middleware/rateLimiting.js";
import { requireAuth, requireActivePlan } from "../middleware/stacks.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import { getPriceId, getPlanPrice } from "../utils/stripeHelpers.js";
import { updateUserSubscription } from "../utils/subscriptionUtils.js";
import { 
  logUserPlanChange,
  logUserCancellation,
  logUserReactivationCheckout,
  logUserReactivationToggle,
  logUserSubscriptionCreationCheckout
} from "../utils/auditUtils.js";
import { subscriptionLogger } from "../utils/logger.js";

/**
 * Setup subscription routes for the Express app
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.stripe - Stripe client instance
 * @param {Object} dependencies.auditLogger - Audit logger instance
 * @param {Object} dependencies.db - Firebase database instance
 * @param {Object} dependencies.cognitoClient - Cognito client instance
 */
export function setupSubscriptionRoutes(app, { stripe, auditLogger, db, cognitoClient }) {


  // Secure endpoint to get current user's subscription data
  app.get('/subscription/me', ...requireAuth, validateQuery(subscriptionMeQuerySchema), async (req, res) => {
    const userId = req.user.sub;
    subscriptionLogger.debug('GET /subscription/me called', { userId }, req.requestId);
    try {
      const subSnap = await db.ref(`users/${userId}/subscription`).once('value');
      const subscription = subSnap.val();
      subscriptionLogger.debug('Subscription data fetched from DB', { 
        userId, 
        hasSubscription: !!subscription 
      }, req.requestId);
      if (!subscription) {
        subscriptionLogger.warn('Subscription not found for user', { userId }, req.requestId);
        return res.status(404).json({ error: 'Subscription not found' });
      }
      res.json({ subscription });
    } catch (err) {
      subscriptionLogger.error('Error fetching subscription', { 
        error: err.message 
      }, req.requestId);
      res.status(500).json({ error: err.message });
    }
  });

  // New endpoint: Validate subscription access for protected features
  app.get('/subscription/validate', ...requireActivePlan, validateQuery(subscriptionValidateQuerySchema), async (req, res) => {
    try {
      // req.subscription is set by the middleware
      const { subscription } = req;
      
      res.json({
        hasAccess: true,
        subscription: {
          status: subscription.status,
          tier: subscription.tier,
          endDate: subscription.endDate,
          daysRemaining: subscription.daysRemaining,
          isActive: subscription.isActive
        }
      });
    } catch (err) {
      console.error('[DEBUG] Error validating subscription:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update Stripe subscription plan (upgrade/downgrade)
  app.post("/update-subscription-plan", authLimiter, validateBody(subscriptionSchema), ...requireAuth, async (req, res) => {
    const { userId, planType } = req.body;
    subscriptionLogger.debug('POST /update-subscription-plan called', { userId, planType }, req.requestId);
    
    // ✅ SECURITY FIX: Validate user ownership
    if (req.user.sub !== userId) {
      console.warn('[SECURITY] User ownership validation failed', { 
        authenticatedUser: req.user.sub, 
        requestedUser: userId 
      });
      return res.status(403).json({ error: "Access denied: You can only modify your own subscription" });
    }
    
    try {
      // Fetch user subscription from DB
      const userSnap = await db.ref(`users/${userId}/subscription`).once('value');
      const subscription = userSnap.val();
      subscriptionLogger.debug('Subscription fetched for update', { 
        userId, 
        hasSubscription: !!subscription 
      }, req.requestId);
      if (!subscription || !subscription.stripeSubscriptionId) {
        subscriptionLogger.warn('No active Stripe subscription found for user', { userId }, req.requestId);
        return res.status(400).json({ error: "Active Stripe subscription not found" });
      }

      const priceId = getPriceId(planType);
      if (!priceId) {
        subscriptionLogger.warn('Invalid plan type provided', { planType }, req.requestId);
        return res.status(400).json({ error: "Invalid plan type" });
      }

      // Get the subscription from Stripe
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
      subscriptionLogger.debug('Stripe subscription retrieved', { 
        subscriptionId: stripeSub.id,
        status: stripeSub.status 
      }, req.requestId);
      if (!stripeSub || !stripeSub.items.data.length) {
        subscriptionLogger.warn('Stripe subscription items not found', { 
          subscriptionId: stripeSub?.id 
        }, req.requestId);
        return res.status(400).json({ error: "Stripe subscription items not found" });
      }

      // ✅ AUDIT LOGGING: Log user-initiated plan change BEFORE updating
      try {
        const userData = await db.ref(`users/${userId}`).once('value');
        const user = userData.val();
        
        if (user) {
          await logUserPlanChange(auditLogger, {
            req,
            user,
            before: {
              tier: subscription.tier,
              amount: subscription.billing?.amount,
              status: subscription.status
            },
            after: {
              tier: planType,
              amount: getPlanPrice(planType),
              status: 'ACTIVE'
            },
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId: subscription.stripeSubscriptionId
          });
          
          console.log('[AUDIT] ✅ User-initiated plan change logged successfully', {
            userId,
            from: subscription.tier,
            to: planType
          });
        }
      } catch (auditError) {
        console.error('[AUDIT] ❌ Failed to log user plan change:', auditError);
        // Don't fail the request if audit logging fails
      }

      // Update the subscription with the new price (in-place, never create duplicate)
      const updatedSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        items: [{
          id: stripeSub.items.data[0].id,
          price: priceId
        }],
        proration_behavior: 'create_prorations'
      });
      subscriptionLogger.debug('Stripe subscription updated', { 
        subscriptionId: updatedSub.id,
        status: updatedSub.status 
      }, req.requestId);

      res.json({ 
        success: true, 
        message: "Subscription plan updated. Changes will reflect after Stripe processes the update.", 
        subscriptionId: updatedSub.id,
        customerId: stripeSub.customer
      });
    } catch (err) {
      subscriptionLogger.error('Error updating subscription plan', { 
        error: err.message 
      }, req.requestId);
      res.status(500).json({ error: err.message });
    }
  });

  // Create Stripe Checkout session
  app.post("/create-checkout-session", authLimiter, validateBody(checkoutSessionSchema), ...requireAuth, async (req, res) => {
    const { userId, planType, userEmail, successUrl, cancelUrl } = req.body;
    
    // ✅ SECURITY FIX: Validate user ownership
    if (req.user.sub !== userId) {
      console.warn('[SECURITY] User ownership validation failed', { 
        authenticatedUser: req.user.sub, 
        requestedUser: userId 
      });
      return res.status(403).json({ error: "Access denied: You can only create checkout sessions for yourself" });
    }
    
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
      
      subscriptionLogger.debug('Checkout session created', { 
        userId, 
        planType, 
        sessionId: session.id 
      }, req.requestId);
      
      res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
      console.error("Error creating checkout session:", err);
      res.status(400).json({ error: err.message });
    }
  });

  // Verify payment and update subscription
  app.post("/verify-payment", authLimiter, validateBody(verifyPaymentBodySchema), ...requireAuth, async (req, res) => {
    const { userId, sessionId } = req.body;
    
    // ✅ SECURITY FIX: Validate user ownership
    if (req.user.sub !== userId) {
      console.warn('[SECURITY] User ownership validation failed', { 
        authenticatedUser: req.user.sub, 
        requestedUser: userId 
      });
      return res.status(403).json({ error: "Access denied: You can only verify payments for yourself" });
    }
    
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
        
        await updateUserSubscription(userId, subscriptionData, db);
        
        subscriptionLogger.debug('Verify payment: User subscription updated', { 
          userId, 
          planType: session.metadata.planType
        }, req.requestId);
        
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
  app.post("/cancel-subscription", authLimiter, validateBody(cancelSubscriptionBodySchema), ...requireAuth, async (req, res) => {
    const { userId, subscriptionId } = req.body;
    
    // ✅ SECURITY FIX: Validate user ownership
    if (req.user.sub !== userId) {
      console.warn('[SECURITY] User ownership validation failed', { 
        authenticatedUser: req.user.sub, 
        requestedUser: userId 
      });
      return res.status(403).json({ error: "Access denied: You can only cancel your own subscription" });
    }
    
    try {
      // ✅ AUDIT LOGGING: Log user-initiated subscription cancellation BEFORE updating Stripe
      try {
        const userData = await db.ref(`users/${userId}`).once('value');
        const user = userData.val();
        
        if (user) {
          await logUserCancellation(auditLogger, {
            req,
            user,
            before: {
              status: user.subscription?.status || 'ACTIVE',
              tier: user.subscription?.tier,
              cancelAtPeriodEnd: false
            },
            after: {
              status: 'CANCELLED',
              tier: user.subscription?.tier,
              cancelAtPeriodEnd: true,
              cancellationDate: new Date().toISOString()
            },
            stripeCustomerId: user.subscription?.stripeCustomerId,
            stripeSubscriptionId: subscriptionId
          });
          
          console.log('[AUDIT] ✅ User-initiated subscription cancellation logged successfully', { userId });
        }
      } catch (auditError) {
        console.error('[AUDIT] ❌ Failed to log user cancellation:', auditError);
        // Don't fail the request if audit logging fails
      }

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

  // Reactivate subscription
  app.post("/reactivate-subscription", authLimiter, validateBody(reactivateSubscriptionBodySchema), ...requireAuth, async (req, res) => {
    const { userId, planType, userEmail, successUrl, cancelUrl } = req.body;
    
    // ✅ SECURITY FIX: Validate user ownership
    if (req.user.sub !== userId) {
      console.warn('[SECURITY] User ownership validation failed', { 
        authenticatedUser: req.user.sub, 
        requestedUser: userId 
      });
      return res.status(403).json({ error: "Access denied: You can only reactivate your own subscription" });
    }
    
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
      const planTier = planType || subscription.tier;
      if (stripeSub) {
        if (stripeSub.status === 'canceled') {
          // ✅ AUDIT LOGGING: Log user-initiated subscription reactivation via checkout
          try {
            const userData = await db.ref(`users/${userId}`).once('value');
            const user = userData.val();
            
            if (user) {
              await logUserReactivationCheckout(auditLogger, {
                req,
                user,
                before: {
                  status: 'CANCELLED',
                  tier: subscription.tier,
                  cancelAtPeriodEnd: true
                },
                after: {
                  status: 'PENDING_CHECKOUT',
                  tier: planTier,
                  cancelAtPeriodEnd: false,
                  reactivationDate: new Date().toISOString()
                },
                stripeCustomerId: subscription.stripeCustomerId,
                stripeSubscriptionId: stripeSub.id
              });
              
              console.log('[AUDIT] ✅ User-initiated subscription reactivation (checkout) logged successfully', { userId });
            }
          } catch (auditError) {
            console.error('[AUDIT] ❌ Failed to log user reactivation checkout:', auditError);
            // Don't fail the request if audit logging fails
          }

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
          // ✅ AUDIT LOGGING: Log user-initiated subscription reactivation BEFORE updating Stripe
          try {
            const userData = await db.ref(`users/${userId}`).once('value');
            const user = userData.val();
            
            if (user) {
              await logUserReactivationToggle(auditLogger, {
                req,
                user,
                before: {
                  status: 'CANCELLED',
                  tier: subscription.tier,
                  cancelAtPeriodEnd: true
                },
                after: {
                  status: 'ACTIVE',
                  tier: subscription.tier,
                  cancelAtPeriodEnd: false,
                  reactivationDate: new Date().toISOString()
                },
                stripeCustomerId: subscription.stripeCustomerId,
                stripeSubscriptionId: stripeSub.id
              });
              
              console.log('[AUDIT] ✅ User-initiated subscription reactivation logged successfully', { userId });
            }
          } catch (auditError) {
            console.error('[AUDIT] ❌ Failed to log user reactivation:', auditError);
            // Don't fail the request if audit logging fails
          }

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
        // ✅ AUDIT LOGGING: Log user-initiated subscription creation via checkout (no existing subscription)
        try {
          const userData = await db.ref(`users/${userId}`).once('value');
          const user = userData.val();
          
          if (user) {
            await logUserSubscriptionCreationCheckout(auditLogger, {
              req,
              user,
              before: {
                status: 'NO_SUBSCRIPTION',
                tier: 'NONE',
                cancelAtPeriodEnd: false
              },
              after: {
                status: 'PENDING_CHECKOUT',
                tier: planTier,
                cancelAtPeriodEnd: false,
                creationDate: new Date().toISOString()
              },
              stripeCustomerId: subscription.stripeCustomerId,
              stripeSubscriptionId: null
            });
            
            console.log('[AUDIT] ✅ User-initiated subscription creation (checkout) logged successfully', { userId });
          }
        } catch (auditError) {
          console.error('[AUDIT] ❌ Failed to log user subscription creation:', auditError);
          // Don't fail the request if audit logging fails
        }

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

  // Create billing portal session
  app.post('/create-billing-portal-session', authLimiter, validateBody(billingPortalBodySchema), ...requireAuth, async (req, res) => {
    try {
      subscriptionLogger.debug('POST /create-billing-portal-session called', { 
        hasCustomerId: !!req.body.customerId,
        origin: req.headers.origin 
      }, req.requestId);

      const { customerId } = req.body;
      
      if (!customerId) {
        subscriptionLogger.warn('Missing customerId in request body', {}, req.requestId);
        return res.status(400).json({ 
          success: false, 
          message: 'Customer ID is required' 
        });
      }

      // Verify the customer belongs to the authenticated user
      const userId = req.user.sub;
      subscriptionLogger.debug('Authenticated user ID', { userId }, req.requestId);
      
      const userSnap = await db.ref(`users/${userId}/subscription`).once('value');
      const subscription = userSnap.val();
      
      subscriptionLogger.debug('User subscription data', { 
        hasSubscription: !!subscription, 
        stripeCustomerId: subscription?.stripeCustomerId,
        requestedCustomerId: customerId
      }, req.requestId);
      
      if (!subscription || subscription.stripeCustomerId !== customerId) {
        subscriptionLogger.warn('Customer ID mismatch or no subscription found', {}, req.requestId);
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied: Customer ID does not match authenticated user' 
        });
      }

      subscriptionLogger.debug('Creating Stripe billing portal session', { customerId }, req.requestId);
      
      // Ensure we have a valid return URL
      const returnUrl = req.headers.origin 
        ? `${req.headers.origin}/subscription`
        : 'http://localhost:3000/subscription'; // Fallback for local development
      
      subscriptionLogger.debug('Using return URL', { returnUrl }, req.requestId);
      
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      subscriptionLogger.debug('Stripe billing portal session created successfully', { 
        sessionId: session.id
      }, req.requestId);

      res.json({ 
        success: true, 
        url: session.url 
      });
    } catch (error) {
      console.error('[DEBUG] Error creating billing portal session:', error);
      console.error('[DEBUG] Error details:', {
        message: error.message,
        stack: error.stack,
        stripeError: error.type,
        stripeCode: error.code
      });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to create billing portal session',
        error: error.message
      });
    }
  });
}
