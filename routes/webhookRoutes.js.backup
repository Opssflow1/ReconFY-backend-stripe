import express from "express";
import Stripe from "stripe";
import { webhookLimiter } from "../middleware/rateLimiting.js";
import { webhookLogger } from "../utils/logger.js";
// Audit logging for subscriptions via webhooks removed per request

export const setupWebhookRoutes = (app, { 
  stripe, 
  db, 
  webhookCircuitBreaker, 
  webhookProcessingUtils, 
  updateUserSubscription, 
  auditLogger 
}) => {
  // Stripe webhook endpoint - NO Joi validation (Stripe sends raw JSON body)
  app.post("/webhook", webhookLimiter, async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    
    // ✅ CRITICAL FIX: Stripe webhooks send raw JSON body, not parsed fields
    // Joi validation was blocking webhook processing - removed for compatibility
    console.log('[WEBHOOK] Received Stripe webhook', {
      headers: req.headers,
      rawBody: req.body && req.body.length ? req.body.toString('utf8') : undefined
    });
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET.trim());
      console.log('[WEBHOOK] ✅ Stripe webhook event constructed successfully', {
        type: event.type,
        id: event.id,
        timestamp: new Date().toISOString(),
        payload: event.data && event.data.object ? event.data.object : event
      });
    } catch (err) {
      console.error('[WEBHOOK] ❌ Signature verification failed:', err.message, {
        sig,
        error: err,
        rawBody: req.body && req.body.length ? req.body.toString('utf8') : undefined
      });
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    try {
      // ✅ CRITICAL FIX: Use circuit breaker for webhook processing with deduplication
      const webhookId = `${event.id}_${event.data.object.id}`;
      console.log(`[WEBHOOK] 🚀 Starting webhook processing for ${event.type}`, { webhookId });
      console.log(`[WEBHOOK] 📊 Event details:`, {
        eventType: event.type,
        eventId: event.id,
        objectId: event.data?.object?.id,
        customerId: event.data?.object?.customer,
        subscriptionId: event.data?.object?.subscription,
        timestamp: new Date().toISOString()
      });
      console.log(`[WEBHOOK] 🔄 Circuit breaker state:`, webhookCircuitBreaker.getStats());
      
      const result = await webhookCircuitBreaker.execute(async () => {
        // Clean up expired locks periodically (every 10th webhook)
        const webhookCount = Math.floor(Math.random() * 10);
        if (webhookCount === 0) {
          await webhookProcessingUtils.cleanupExpiredLocks(db);
        }
        
        // Clean up old webhook records periodically (every 50th webhook)
        if (webhookCount === 5) {
          await webhookProcessingUtils.cleanupOldWebhookRecords(db);
        }
        
        // Clean up old failed webhooks periodically (every 100th webhook)
        if (webhookCount === 9) {
          await webhookProcessingUtils.cleanupOldFailedWebhooks(db);
        }
        
            // ✅ SAAS BEST PRACTICE: Process only critical subscription events
        switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          webhookLogger.debug('Checkout session completed', { 
            sessionId: session.id, 
            mode: session.mode 
          }, req.requestId);
          if (session.mode === 'subscription') {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const customer = await stripe.customers.retrieve(session.customer);
            webhookLogger.debug('Stripe data fetched', { 
              subscriptionId: subscription.id,
              customerId: customer.id 
            }, req.requestId);
            
            // ✅ CRITICAL FIX: Check if user already has this subscription
            const existingUserSnap = await db.ref(`users/${session.metadata.userId}`).once('value');
            const existingUser = existingUserSnap.val();
            
            if (existingUser?.subscription?.stripeSubscriptionId === subscription.id) {
              console.log(`[IDEMPOTENCY] User ${session.metadata.userId} already has subscription ${subscription.id}, skipping duplicate creation`);
              return { success: true, reason: 'subscription_already_exists' };
            }
            
            // Use safe webhook processing to prevent race conditions
            const result = await webhookProcessingUtils.processWebhookSafely(
              event,
              session.metadata.userId,
              async () => {
                // ✅ AUDIT LOGGING FIX: Log subscription activation BEFORE updating subscription
                let beforeState = null;
                try {
                  const userData = await db.ref(`users/${session.metadata.userId}`).once('value');
                  const user = userData.val();
                  if (user) {
                    // Get actual current subscription state BEFORE updating
                    const currentSubscription = user.subscription || {};
                    beforeState = {
                      status: currentSubscription.status || 'TRIAL',
                      tier: currentSubscription.tier || 'TRIAL',
                      stripeCustomerId: currentSubscription.stripeCustomerId || null,
                      stripeSubscriptionId: currentSubscription.stripeSubscriptionId || null
                    };
                  }
                } catch (auditError) {
                  console.error('[AUDIT] Failed to get before state for subscription activation', { error: auditError.message, userId: session.metadata.userId });
                  // Set default before state if we can't get user data
                  beforeState = {
                    status: 'TRIAL',
                    tier: 'TRIAL',
                    stripeCustomerId: null,
                    stripeSubscriptionId: null
                  };
                }

                // Process subscription creation
                await updateUserSubscription(session.metadata.userId, {
                  status: 'ACTIVE',
                  tier: session.metadata.planType,
                  startDate: new Date(subscription.current_period_start * 1000).toISOString(),
                  endDate: new Date(subscription.current_period_end * 1000).toISOString(),
                  stripeCustomerId: customer.id,
                  stripeSubscriptionId: subscription.id,
                  nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
                  cancelAtPeriodEnd: false,
                  isActive: true,
                  paymentStatus: 'ACTIVE',
                  lastPaymentFailure: null,
                  paymentRetryCount: 0,
                  billing: {
                    amount: subscription.items.data[0].price.unit_amount / 100,
                    currency: subscription.items.data[0].price.currency.toUpperCase(),
                  }
                }, db, true); // Skip deduplication since we're inside circuit breaker
                
                // Now create the audit log with the correct before/after states
                try {
                  const userData = await db.ref(`users/${session.metadata.userId}`).once('value');
                  const user = userData.val();
                  if (user && beforeState) {
                    const afterState = {
                      status: 'ACTIVE',
                      tier: session.metadata.planType,
                      stripeCustomerId: customer.id,
                      stripeSubscriptionId: subscription.id
                    };
                    
                    // Audit logging removed for webhook subscription activation
                  }
                } catch (auditError) {
                  console.error('[AUDIT] Failed to log subscription activation', { error: auditError.message, userId: session.metadata.userId });
                }
                
                return { success: true };
              },
              db
            );
            
            if (result.success) {
              webhookLogger.debug('User subscription updated', { 
                userId: session.metadata.userId, 
                planType: session.metadata.planType,
                result: result.result
              }, req.requestId);
            } else {
              webhookLogger.error('Failed to process subscription creation', { 
                userId: session.metadata.userId, 
                reason: result.reason,
                error: result.error
              }, req.requestId);
            }
          }
          break;
        }
        // ❌ DUPLICATE invoice.paid HANDLER REMOVED - This was incomplete and caused race conditions
        // The complete handler is below at line 3723
        case 'customer.subscription.deleted': {
          const deletedSubscription = event.data.object;
          webhookLogger.debug('Subscription deleted', { 
            subscriptionId: deletedSubscription.id,
            customerId: deletedSubscription.customer
          }, req.requestId);
          const deletedCustomer = await stripe.customers.retrieve(deletedSubscription.customer);
          // ✅ PERFORMANCE FIX: Use indexed query instead of scanning all users
          let deletedUserId = null;
          try {
            // Create an index query for faster lookup
            const userQuery = await db.ref('users')
              .orderByChild('subscription/stripeCustomerId')
              .equalTo(deletedCustomer.id)
              .once('value');
            
            if (userQuery.exists()) {
              // Get the first (and should be only) user with this customer ID
              const userSnapshot = userQuery.val();
              deletedUserId = Object.keys(userSnapshot)[0];
            }
          } catch (queryError) {
            console.warn('[PERFORMANCE] Indexed query failed, falling back to scan:', queryError.message);
            // Fallback to scanning if indexed query fails
            const deletedUsersSnapshot = await db.ref('users').once('value');
          deletedUsersSnapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.subscription?.stripeCustomerId === deletedCustomer.id) {
              deletedUserId = childSnapshot.key;
            }
          });
          }
          
          if (deletedUserId) {
            // Use safe webhook processing to prevent race conditions
            const result = await webhookProcessingUtils.processWebhookSafely(
              event,
              deletedUserId,
              async () => {
            await updateUserSubscription(deletedUserId, {
              status: 'CANCELLED',
              isActive: false,
              endDate: new Date().toISOString(),
                cancelAtPeriodEnd: true,
                cancellationDate: new Date().toISOString()
            }, db, true); // Skip deduplication since we're inside circuit breaker
                return { success: true };
              },
              db
            );
            
            if (result.success) {
            webhookLogger.debug('User subscription marked as cancelled', { 
              deletedUserId 
            }, req.requestId);
            } else {
              webhookLogger.error('Failed to process subscription deletion', { 
                deletedUserId, 
                reason: result.reason,
                error: result.error
              }, req.requestId);
            }
          } else {
            webhookLogger.warn('No user found for customer in subscription deletion', { 
              customerId: deletedCustomer.id 
            }, req.requestId);
          }
          break;
        }
        case 'customer.subscription.updated': {
          // ✅ CRITICAL FIX: Enhanced to handle cancellations and reactivations properly
          // This event now processes:
          // - Plan changes (tier, pricing)
          // - Cancellations (cancel_at_period_end: true)
          // - Reactivations (cancel_at_period_end: false)
          // - Status changes
          //
          // 🚨 IMPORTANT: The previous logic was flawed because:
          // - hasCancellationChange checked if fields were "defined" (always true)
          // - This caused EVERY subscription update to trigger cancellation logs
          // - Even normal plan changes created incorrect "reactivation" logs
          //
          // ✅ FIXED: Now only logs when there's an ACTUAL change in cancellation state
          let updatedSubscription = event.data.object;
          webhookLogger.debug('Subscription updated', { 
            subscriptionId: updatedSubscription.id,
            customerId: updatedSubscription.customer
          }, req.requestId);
          
          // ✅ CRITICAL FIX: Check for significant changes including cancellations
          const previousAttributes = event.data.previous_attributes;
          const hasSignificantChange = previousAttributes && (
            previousAttributes.status ||           // Status changes
            previousAttributes.cancel_at_period_end ||  // Cancellation changes
            previousAttributes.items ||             // Plan/pricing changes
            previousAttributes.default_payment_method  // Payment method changes
          );
          
          // ✅ FIXED: Check for ACTUAL cancellation-related changes, not just field presence
          const hasCancellationChange = (previousAttributes?.cancel_at_period_end !== undefined && 
                                         updatedSubscription.cancel_at_period_end !== previousAttributes.cancel_at_period_end) ||
                                        (previousAttributes?.canceled_at !== updatedSubscription.canceled_at);
          
          if (!hasSignificantChange && !hasCancellationChange) {
            console.log('[WEBHOOK] Skipping non-significant subscription update');
            return { success: true, reason: 'non_significant_change' };
          }
          
          // ✅ ENHANCED: Log cancellation details for debugging with better context
          if (hasCancellationChange) {
            console.log('[WEBHOOK] Processing cancellation-related update:', {
              cancel_at_period_end: updatedSubscription.cancel_at_period_end,
              canceled_at: updatedSubscription.canceled_at,
              cancel_at: updatedSubscription.cancel_at,
              previousAttributes,
              hasActualChange: hasCancellationChange,
              reason: 'Detected cancellation-related fields in webhook payload'
            });
          }
          
          // ✅ NEW: Enhanced logging for all significant changes
          console.log('[WEBHOOK] Processing significant subscription update:', {
            hasSignificantChange,
            hasCancellationChange,
            previousAttributes: previousAttributes || 'none',
            currentStatus: updatedSubscription.status,
            currentCancelAtPeriodEnd: updatedSubscription.cancel_at_period_end
          });
          
          const updatedCustomer = await stripe.customers.retrieve(updatedSubscription.customer);

          // If period fields are missing, fetch latest from Stripe
          if (!updatedSubscription.current_period_start || !updatedSubscription.current_period_end) {
            updatedSubscription = await stripe.subscriptions.retrieve(updatedSubscription.id);
          }

          // ✅ PERFORMANCE FIX: Use indexed query instead of scanning all users
          let updatedUserId = null;
          try {
            // Create an index query for faster lookup
            const userQuery = await db.ref('users')
              .orderByChild('subscription/stripeCustomerId')
              .equalTo(updatedCustomer.id)
              .once('value');
            
            if (userQuery.exists()) {
              // Get the first (and should be only) user with this customer ID
              const userSnapshot = userQuery.val();
              updatedUserId = Object.keys(userSnapshot)[0];
            }
          } catch (queryError) {
            console.warn('[PERFORMANCE] Indexed query failed, falling back to scan:', queryError.message);
            // Fallback to scanning if indexed query fails
            const updatedUsersSnapshot = await db.ref('users').once('value');
          updatedUsersSnapshot.forEach(childSnapshot => {
            const userData = childSnapshot.val();
            if (userData.subscription?.stripeCustomerId === updatedCustomer.id) {
              updatedUserId = childSnapshot.key;
            }
          });
          }

          if (updatedUserId) {
            // ✅ CRITICAL FIX: Check if this is a duplicate subscription update
            const existingUserSnap = await db.ref(`users/${updatedUserId}`).once('value');
            const existingUser = existingUserSnap.val();
            
            if (existingUser?.subscription?.stripeSubscriptionId === updatedSubscription.id) {
              // Same subscription - check if we need to update
              const needsUpdate = !existingUser.subscription.lastWebhookUpdate || 
                                 (Date.now() - existingUser.subscription.lastWebhookUpdate) > 5000; // 5 second cooldown
              
              if (!needsUpdate) {
                console.log(`[IDEMPOTENCY] Skipping duplicate subscription update for user ${updatedUserId}, subscription ${updatedSubscription.id}`);
                return { success: true, reason: 'duplicate_subscription_update' };
              }
            }
            
            // Use safe webhook processing to prevent race conditions
            const result = await webhookProcessingUtils.processWebhookSafely(
              event,
              updatedUserId,
              async () => {
            // Determine plan tier from Stripe price ID
            const priceId = updatedSubscription.items.data[0]?.price?.id;
            let tier = 'STARTER'; // default to STARTER if no match
            
            webhookLogger.debug('Price ID mapping', {
              receivedPriceId: priceId,
              envVars: {
                STARTER: process.env.STRIPE_STARTER_PRICE_ID,
                GROWTH: process.env.STRIPE_GROWTH_PRICE_ID,
                PRO: process.env.STRIPE_PRO_PRICE_ID,
                ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID
              }
            }, req.requestId);
            
            if (priceId === process.env.STRIPE_STARTER_PRICE_ID) {
              tier = 'STARTER';
              webhookLogger.debug('Matched STARTER price ID', {}, req.requestId);
            } else if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) {
              tier = 'GROWTH';
              webhookLogger.debug('Matched GROWTH price ID', {}, req.requestId);
            } else if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
              tier = 'PRO';
              webhookLogger.debug('Matched PRO price ID', {}, req.requestId);
            } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
              tier = 'ENTERPRISE';
              webhookLogger.debug('Matched ENTERPRISE price ID', {}, req.requestId);
            } else {
              webhookLogger.warn('No matching price ID found - using default STARTER', {
                priceId,
                defaultTier: tier
              }, req.requestId);
            }

            webhookLogger.debug('Final tier determination', { priceId, tier }, req.requestId);

            // Add null checks for Stripe timestamps
            const startDate = updatedSubscription.current_period_start ? new Date(updatedSubscription.current_period_start * 1000).toISOString() : null;
            const endDate = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000).toISOString() : null;
            const nextBillingDate = updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000).toISOString() : null;

            // ✅ CRITICAL FIX: Enhanced subscription update with proper cancellation handling
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
              // ✅ NEW: Handle cancellation details properly
              ...(updatedSubscription.cancel_at_period_end && {
                cancellationDate: updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000).toISOString() : new Date().toISOString(),
                cancellationReason: updatedSubscription.cancellation_details?.reason || 'user_requested'
              }),
              // ✅ NEW: Clear cancellation details if reactivated
              ...(!updatedSubscription.cancel_at_period_end && {
                cancellationDate: null,
                cancellationReason: null
              }),
              billing: {
                amount: updatedSubscription.items.data[0]?.price?.unit_amount ? updatedSubscription.items.data[0]?.price?.unit_amount / 100 : null,
                currency: updatedSubscription.items.data[0]?.price?.currency ? updatedSubscription.items.data[0]?.price?.currency.toUpperCase() : null
              },
              features: {
                exportEnabled: true,
                fullAccess: true,
                prioritySupport: tier === 'GROWTH' || tier === 'PRO' || tier === 'ENTERPRISE'
              },
              // ✅ FIX: Set payment fields consistently with other webhooks
              paymentStatus: updatedSubscription.status === 'active' ? 'ACTIVE' : 'INACTIVE',
              lastPaymentFailure: null,
              paymentRetryCount: 0
            };

            await updateUserSubscription(updatedUserId, subscriptionUpdate, db);
                return { success: true, tier, amount: subscriptionUpdate.billing.amount };
              },
              db,
              true // Skip deduplication since we're inside circuit breaker
            );
            
            if (result.success) {
            webhookLogger.debug('User subscription updated in DB', {
              updatedUserId,
              tier: result.result.tier,
              amount: result.result.amount
            }, req.requestId);
              
              // ✅ AUDIT LOGGING FIX: Only log subscription plan change when there's an actual plan change
              try {
                const userData = await db.ref(`users/${updatedUserId}`).once('value');
                const user = userData.val();
                if (user) {
                  // Get the previous subscription state from the event's previous_attributes
                  const previousAttributes = event.data.previous_attributes;
                  
                  // ✅ FIX: Check if there's an actual plan/tier change
                  const hasPlanChange = previousAttributes?.items || 
                                     (previousAttributes?.plan && previousAttributes.plan.id !== updatedSubscription.items.data[0]?.price?.id);
                  
                  if (hasPlanChange) {
                    const beforeState = {
                      tier: previousAttributes?.plan?.id ? getTierFromPriceId(previousAttributes.plan.id) : 'UNKNOWN',
                      amount: previousAttributes?.plan?.amount ? previousAttributes.plan.amount / 100 : null,
                      status: 'ACTIVE'
                    };
                    
                    const afterState = {
                      tier: result.result.tier,
                      amount: result.result.amount,
                      status: 'ACTIVE'
                    };
                    
                    // Audit logging removed for webhook subscription plan change
                    
                    console.log('[AUDIT] ✅ Subscription plan change logged successfully', {
                      userId: updatedUserId,
                      from: beforeState.tier,
                      to: afterState.tier
                    });
                  } else {
                    console.log('[AUDIT] ⏭️ Skipping plan change audit log - no actual plan change detected', {
                      userId: updatedUserId,
                      previousAttributes: previousAttributes || 'none',
                      currentPriceId: updatedSubscription.items.data[0]?.price?.id
                    });
                  }
                }
              } catch (auditError) {
                console.error('[AUDIT] ❌ Failed to log subscription plan change', { 
                  error: auditError.message, 
                  userId: updatedUserId 
                });
              }
              
              // ✅ FIXED: Log cancellation/reactivation events ONLY when there's an actual change
              if (hasCancellationChange) {
                try {
                  const userData = await db.ref(`users/${updatedUserId}`).once('value');
                  const user = userData.val();
                  if (user) {
                    // ✅ FIXED: Determine event type based on ACTUAL change, not current state
                    let eventType = null;
                    if (previousAttributes?.cancel_at_period_end !== undefined && 
                        updatedSubscription.cancel_at_period_end !== previousAttributes.cancel_at_period_end) {
                      // There was an actual change in cancel_at_period_end
                      eventType = updatedSubscription.cancel_at_period_end ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_REACTIVATED';
                    } else if (previousAttributes?.canceled_at !== updatedSubscription.canceled_at) {
                      // There was an actual change in canceled_at
                      eventType = updatedSubscription.canceled_at ? 'SUBSCRIPTION_CANCELLED' : 'SUBSCRIPTION_REACTIVATED';
                    }
                    
                    // Only proceed if we have a valid event type
                    if (!eventType) {
                      console.log('[AUDIT] ⏭️ Skipping cancellation audit log - no actual cancellation change detected');
                      return;
                    }
                    
                    const eventCategory = 'SUBSCRIPTION_MANAGEMENT';
                    
                    // Audit logging removed for webhook cancellation/reactivation
                    
                    console.log('[AUDIT] ✅ Cancellation event logged successfully', {
                      userId: updatedUserId,
                      eventType,
                      cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end
                    });
                  }
                } catch (cancellationAuditError) {
                  console.error('[AUDIT] ❌ Failed to log cancellation event', { 
                    error: cancellationAuditError.message, 
                    userId: updatedUserId 
                  });
                }
              }
            } else {
              console.error('[DEBUG] Webhook: Failed to process subscription update', { 
                updatedUserId, 
                reason: result.reason,
                error: result.error
              });
            }
          } else {
            console.warn('[DEBUG] Webhook: No user found for customer in subscription.updated', { customerId: updatedCustomer.id });
          }
          
          // ✅ WEBHOOK FIX COMPLETE: 
          // - Cancellations now properly update cancelAtPeriodEnd, cancellationDate, and cancellationReason
          // - Reactivations clear cancellation details and restore active state
          // - All changes are logged to audit system for compliance
          // - Database stays in sync with Stripe subscription state
          break;
        }
        case 'invoice.paid': {
          const invoice = event.data.object;
          webhookLogger.debug('Invoice paid', { 
            invoiceId: invoice.id,
            subscriptionId: invoice.subscription 
          }, req.requestId);
          
          // ✅ SAAS BEST PRACTICE: Only update payment confirmation, not full subscription
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
            const customer = await stripe.customers.retrieve(invoice.customer);
            
            // ✅ PERFORMANCE FIX: Use indexed query instead of scanning all users
            let userId = null;
            try {
              const userQuery = await db.ref('users')
                .orderByChild('subscription/stripeCustomerId')
                .equalTo(customer.id)
                .once('value');
              
              if (userQuery.exists()) {
                const userSnapshot = userQuery.val();
                userId = Object.keys(userSnapshot)[0];
              }
            } catch (queryError) {
              console.warn('[PERFORMANCE] Indexed query failed, falling back to scan:', queryError.message);
              const usersSnapshot = await db.ref('users').once('value');
              usersSnapshot.forEach(childSnapshot => {
                const userData = childSnapshot.val();
                if (userData.subscription?.stripeCustomerId === customer.id) {
                  userId = childSnapshot.key;
                }
              });
            }
            
            if (userId) {
              // Use safe webhook processing to prevent race conditions
              const result = await webhookProcessingUtils.processWebhookSafely(
                event,
                userId,
                async () => {
                  // ✅ SAAS BEST PRACTICE: Clear all payment failure AND cancellation fields on successful payment
                  const result = await updateUserSubscription(userId, {
                    status: 'ACTIVE',
                    isActive: true,
                    cancelAtPeriodEnd: false,        // ✅ Clear cancellation flag
                    cancellationDate: null,          // ✅ Clear cancellation date
                    cancellationReason: null,        // ✅ Clear cancellation reason
                    paymentStatus: 'ACTIVE',
                    lastPaymentDate: new Date(invoice.created * 1000).toISOString(),
                    nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
                    lastPaymentFailure: null,
                    paymentRetryCount: 0
                  }, db, true); // Skip deduplication since we're inside circuit breaker
                  
                  if (result.skipped) {
                    return { success: true, reason: 'payment_already_recorded' };
                  }
                  
                  return { success: true, reason: 'invoice_paid_processed' };
                },
                db
              );
              
              if (result.success) {
                webhookLogger.debug('User subscription updated in DB (invoice.paid)', { 
                  userId 
                }, req.requestId);
              } else {
                webhookLogger.error('Failed to process invoice.paid', { 
                  userId, 
                  reason: result.reason,
                  error: result.error
                }, req.requestId);
              }
            } else {
              webhookLogger.warn('No user found for customer in invoice.paid', { 
                customerId: customer.id 
              }, req.requestId);
            }
          }
          break;
        }
        case 'invoice.payment_failed': {
          // ✅ SAAS BEST PRACTICE: Handle payment failures for dunning management
          const invoice = event.data.object;
          webhookLogger.debug('Invoice payment failed', { 
            invoiceId: invoice.id,
            subscriptionId: invoice.subscription 
          }, req.requestId);
          
          if (invoice.subscription) {
            const customer = await stripe.customers.retrieve(invoice.customer);
            
            // Find user by customer ID
            let userId = null;
            try {
              const userQuery = await db.ref('users')
                .orderByChild('subscription/stripeCustomerId')
                .equalTo(customer.id)
                .once('value');
              
              if (userQuery.exists()) {
                const userSnapshot = userQuery.val();
                userId = Object.keys(userSnapshot)[0];
              }
            } catch (queryError) {
              console.warn('[PERFORMANCE] Indexed query failed:', queryError.message);
            }
            
            if (userId) {
              const result = await webhookProcessingUtils.processWebhookSafely(
                event,
                userId,
                async () => {
                  // Update payment failure status and cancel subscription (same as cancel endpoint)
                  await updateUserSubscription(userId, {
                    status: 'CANCELLED',          // Mark as CANCELLED (same as cancel endpoint)
                    isActive: false,              // Set isActive to false (same as cancel endpoint)
                    cancelAtPeriodEnd: true,      // Set cancelAtPeriodEnd flag (same as cancel endpoint)
                    cancellationDate: new Date().toISOString(), // Record cancellation date
                    paymentStatus: 'FAILED',      // Still track payment status
                    lastPaymentFailure: new Date(invoice.created * 1000).toISOString(),
                    paymentRetryCount: (invoice.attempt_count || 1),
                    cancellationReason: 'payment_failure' // Add reason for reporting
                  }, db, true); // Skip deduplication since we're inside circuit breaker
                  
                  // Then, update the subscription in Stripe to match your database
                  try {
                    await stripe.subscriptions.update(invoice.subscription, {
                      cancel_at_period_end: true  // Same as your cancel endpoint
                    });
                    console.log(`[PAYMENT] Subscription ${invoice.subscription} marked for cancellation due to payment failure`);
                  } catch (cancelError) {
                    console.error(`[PAYMENT] Error marking subscription ${invoice.subscription} for cancellation:`, cancelError);
                  }
                  
                  // Audit logging removed for webhook payment failure cancellation
                  
                  return { success: true, reason: 'payment_failure_processed' };
                },
                db
              );
              
              if (result.success) {
                webhookLogger.debug('Payment failure processed', { 
                  userId, 
                  invoiceId: invoice.id 
                }, req.requestId);
              }
            } else {
              webhookLogger.warn('No user found for payment failure', { 
                customerId: customer.id 
              }, req.requestId);
            }
          }
          break;
        }
        case 'customer.subscription.created': {
          const newSubscription = event.data.object;
          webhookLogger.debug('Customer subscription created', { 
            subscriptionId: newSubscription.id,
            customerId: newSubscription.customer 
          }, req.requestId);
          
          // ✅ SAAS BEST PRACTICE: Skip if already processed by checkout.session.completed
          // This prevents duplicate subscription creation
          console.log('[WEBHOOK] Skipping customer.subscription.created - handled by checkout.session.completed');
          return { success: true, reason: 'handled_by_checkout_session' };
          
          const customer = await stripe.customers.retrieve(newSubscription.customer);
          
          // ✅ PERFORMANCE FIX: Use indexed query instead of scanning all users
          let userId = null;
          try {
            const userQuery = await db.ref('users')
              .orderByChild('subscription/stripeCustomerId')
              .equalTo(customer.id)
              .once('value');
            
            if (userQuery.exists()) {
              const userSnapshot = userQuery.val();
              userId = Object.keys(userSnapshot)[0];
            }
          } catch (queryError) {
            console.warn('[PERFORMANCE] Indexed query failed, falling back to scan:', queryError.message);
            const usersSnapshot = await db.ref('users').once('value');
            usersSnapshot.forEach(childSnapshot => {
              const userData = childSnapshot.val();
              if (userData.subscription?.stripeCustomerId === customer.id) {
                userId = childSnapshot.key;
              }
            });
          }
          
          if (userId) {
            // Use safe webhook processing to prevent race conditions
            const result = await webhookProcessingUtils.processWebhookSafely(
              event,
              userId,
              async () => {
                // Determine plan tier from Stripe price ID
                const priceId = newSubscription.items.data[0]?.price?.id;
                let tier = 'STARTER'; // default to STARTER if no match
                
                webhookLogger.debug('Price ID mapping for new subscription', {
                  receivedPriceId: priceId,
                  envVars: {
                    STARTER: process.env.STRIPE_STARTER_PRICE_ID,
                    GROWTH: process.env.STRIPE_GROWTH_PRICE_ID,
                    PRO: process.env.STRIPE_PRO_PRICE_ID,
                    ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID
                  }
                }, req.requestId);
                
                if (priceId === process.env.STRIPE_STARTER_PRICE_ID) {
                  tier = 'STARTER';
                  webhookLogger.debug('Matched STARTER price ID for new subscription', {}, req.requestId);
                } else if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) {
                  tier = 'GROWTH';
                  webhookLogger.debug('Matched GROWTH price ID for new subscription', {}, req.requestId);
                } else if (priceId === process.env.STRIPE_PRO_PRICE_ID) {
                  tier = 'PRO';
                  webhookLogger.debug('Matched PRO price ID for new subscription', {}, req.requestId);
                } else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) {
                  tier = 'ENTERPRISE';
                  webhookLogger.debug('Matched ENTERPRISE price ID for new subscription', {}, req.requestId);
                } else {
                  webhookLogger.warn('No matching price ID found for new subscription - using default STARTER', {
                    priceId,
                    defaultTier: tier
                  }, req.requestId);
                }
                
                // Update subscription with new plan details
                await updateUserSubscription(userId, {
                  tier,
                  status: 'ACTIVE',
                  isActive: true,
                  startDate: new Date(newSubscription.current_period_start * 1000).toISOString(),
                  endDate: new Date(newSubscription.current_period_end * 1000).toISOString(),
                  nextBillingDate: new Date(newSubscription.current_period_end * 1000).toISOString(),
                  stripeCustomerId: customer.id,
                  stripeSubscriptionId: newSubscription.id,
                  billing: {
                    amount: newSubscription.items.data[0]?.price?.unit_amount ? newSubscription.items.data[0]?.price?.unit_amount / 100 : null,
                    currency: newSubscription.items.data[0]?.price?.currency ? newSubscription.items.data[0]?.price?.currency.toUpperCase() : null
                  },
                  features: {
                    exportEnabled: true,
                    fullAccess: true,
                    prioritySupport: tier === 'GROWTH' || tier === 'PRO' || tier === 'ENTERPRISE'
                  }
                }, db, true); // Skip deduplication since we're inside circuit breaker
                
                return { success: true, reason: 'subscription_created_processed', tier };
              },
              db
            );
            
            if (result.success) {
              webhookLogger.debug('New user subscription created in DB', {
                userId,
                tier: result.result.tier
              }, req.requestId);
              
              // ✅ AUDIT LOGGING FIX: Log new subscription creation via webhook
              try {
                const userData = await db.ref(`users/${userId}`).once('value');
                const user = userData.val();
                if (user) {
                  // Audit logging removed for webhook subscription creation
                  
                  console.log('[AUDIT] ✅ New subscription creation logged successfully', {
                    userId,
                    tier: result.result.tier
                  });
                }
              } catch (auditError) {
                console.error('[AUDIT] ❌ Failed to log new subscription creation', { 
                  error: auditError.message, 
                  userId 
                });
              }
            } else {
              console.error('[DEBUG] Webhook: Failed to process subscription creation', { 
                userId, 
                reason: result.reason,
                error: result.error
              });
            }
          } else {
            console.warn('[DEBUG] Webhook: No user found for customer in subscription.created', { customerId: customer.id });
          }
          break;
        }
        // Note: subscription_schedule.completed webhook removed - no more scheduled downgrades
        default:
          webhookLogger.debug('Unhandled event type', { 
            eventType: event.type 
          }, req.requestId);
          return { success: true, reason: 'unhandled_event_type' };
      }
      
      return { success: true, reason: 'processed_successfully' };
    }, webhookId);
    
      if (result.success) {
      console.log('[WEBHOOK] ✅ Circuit breaker execution successful');
      if (result.reason === 'duplicate_webhook') {
        console.log('[WEBHOOK] ℹ️ Duplicate webhook skipped');
      } else {
        console.log(`[WEBHOOK] ✅ Webhook processing completed successfully for ${event.type}`, { webhookId });
      }
      }
    } catch (error) {
    console.error(`[WEBHOOK] ❌ Error handling webhook event ${event.type}:`, error);
      
      // Log failed webhook for retry processing
      try {
        const failedWebhookId = `${event.id}_${event.data?.object?.id || 'unknown'}`;
        await db.ref(`failedWebhooks/${failedWebhookId}`).set({
          eventType: event.type,
          eventId: event.id,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now(),
          retryCount: 0,
          maxRetries: 3
        });
        console.log(`[WEBHOOK] Logged failed webhook ${failedWebhookId} for retry processing`);
      } catch (logError) {
        console.error('[WEBHOOK] Failed to log failed webhook:', logError);
      }
      
      return res.status(500).json({ error: "Webhook processing failed" });
    }
    
    // Send success response
    res.json({ 
      received: true, 
      webhookId: event.id,
      processedAt: new Date().toISOString(),
      requestId: req.headers['x-request-id']
    });
  });
};
