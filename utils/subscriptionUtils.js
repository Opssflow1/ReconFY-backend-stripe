// Subscription utility functions for ReconFY backend
// Shared utilities for subscription management

import admin from "firebase-admin";

/**
 * Update user subscription in database with idempotency
 * @param {string} userId - User ID
 * @param {Object} subscriptionData - Subscription data to update
 * @param {Object} db - Firebase database instance
 * @returns {Promise<Object>} Update result
 */
export const updateUserSubscription = async (userId, subscriptionData, db) => {
  try {
    const subRef = db.ref(`users/${userId}/subscription`);
    
    // Get current subscription data
    const currentSubscriptionSnap = await subRef.once('value');
    const currentSubscription = currentSubscriptionSnap.val();
    
    // ✅ CRITICAL FIX: Check if this is a duplicate webhook update
    if (currentSubscription && currentSubscription.stripeSubscriptionId === subscriptionData.stripeSubscriptionId) {
      // Same subscription ID - check if we need to update
      const needsUpdate = !currentSubscription.lastWebhookUpdate || 
                         (Date.now() - currentSubscription.lastWebhookUpdate) > 5000; // 5 second cooldown
      
      if (!needsUpdate) {
        console.log(`[IDEMPOTENCY] Skipping duplicate webhook update for user ${userId}, subscription ${subscriptionData.stripeSubscriptionId}`);
        return { skipped: true, reason: 'duplicate_webhook' };
      }
    }
    
    if (currentSubscription) {
      // Clean up legacy/duplicated fields
      const cleaned = { ...subscriptionData };
      delete cleaned.amount;
      delete cleaned.currency;
      
      // Merge with existing data and add version for conflict detection
      const updatedSubscription = {
        ...currentSubscription,
        ...cleaned,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        version: (currentSubscription.version || 0) + 1,
        lastWebhookUpdate: Date.now()
      };
      
      await subRef.set(updatedSubscription);
      console.log(`Updated subscription for user ${userId}`);
      return { updated: true, version: updatedSubscription.version };
    } else {
      // If no existing subscription, create new one
      const cleaned = { ...subscriptionData };
      delete cleaned.amount;
      delete cleaned.currency;
      
      const newSubscription = {
        ...cleaned,
        createdAt: admin.database.ServerValue.TIMESTAMP,
        updatedAt: admin.database.ServerValue.TIMESTAMP,
        version: 1,
        lastWebhookUpdate: Date.now()
      };
      
      await subRef.set(newSubscription);
      console.log(`Created subscription for user ${userId}`);
      return { created: true, version: 1 };
    }
  } catch (error) {
    console.error(`Error updating subscription for user ${userId}:`, error);
    throw error;
  }
};
