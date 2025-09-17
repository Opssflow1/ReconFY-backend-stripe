// Webhook processing utilities for ReconFY backend
// Extracted from index.js for better modularity

import admin from "firebase-admin";

/**
 * Webhook Processing Utils - Handles webhook processing with locking and idempotency
 */
export const webhookProcessingUtils = {
  /**
   * Check if webhook has already been processed
   * @param {string} webhookId - The webhook ID
   * @param {Object} db - Firebase database reference
   * @returns {Promise<boolean>} - Whether webhook was processed
   */
  async isWebhookProcessed(webhookId, db) {
    try {
      const processedSnap = await db.ref(`webhookProcessing/${webhookId}`).once('value');
      return processedSnap.exists();
    } catch (error) {
      console.error(`Error checking webhook processing status:`, error);
      return false;
    }
  },

  /**
   * Mark webhook as processed
   * @param {string} webhookId - The webhook ID
   * @param {string} eventType - The event type
   * @param {string} userId - The user ID
   * @param {Object} db - Firebase database reference
   */
  async markWebhookProcessed(webhookId, eventType, userId, db) {
    try {
      await db.ref(`webhookProcessing/${webhookId}`).set({
        processed: true,
        eventType,
        userId,
        processedAt: admin.database.ServerValue.TIMESTAMP,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error(`Error marking webhook as processed:`, error);
      throw error;
    }
  },

  /**
   * Acquire user-level lock to prevent race conditions
   * @param {string} userId - The user ID
   * @param {string} eventType - The event type
   * @param {number} lockTimeout - Lock timeout in milliseconds
   * @param {Object} db - Firebase database reference
   * @returns {Promise<string|null>} - Lock ID or null if failed
   */
  async acquireUserLock(userId, eventType = 'unknown', lockTimeout = 30000, db) {
    const lockKey = `userLocks/${userId}`;
    const lockData = {
      lockedAt: Date.now(),
      expiresAt: Date.now() + lockTimeout,
      processId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: eventType,
      timestamp: Date.now()
    };

    try {
      // Check if lock already exists and is still valid
      const existingLockSnap = await db.ref(lockKey).once('value');
      const existingLock = existingLockSnap.val();
      
      // If lock exists and hasn't expired, cannot acquire
      if (existingLock && existingLock.expiresAt > Date.now()) {
        console.log(`[LOCK] User ${userId} is already locked by process ${existingLock.processId}`);
        return null;
      }
      
      // Acquire the lock
      await db.ref(lockKey).set(lockData);
      console.log(`[LOCK] Acquired lock for user ${userId}`);
      return lockData.processId;
    } catch (error) {
      console.error(`[LOCK] Error acquiring lock for user ${userId}:`, error);
      return null;
    }
  },

  /**
   * Release user-level lock
   * @param {string} userId - The user ID
   * @param {string} processId - The process ID
   * @param {Object} db - Firebase database reference
   */
  async releaseUserLock(userId, processId, db) {
    const lockKey = `userLocks/${userId}`;
    try {
      const lockSnap = await db.ref(lockKey).once('value');
      const currentLock = lockSnap.val();
      
      // Only release if we own the lock
      if (currentLock && currentLock.processId === processId) {
        await db.ref(lockKey).remove();
        console.log(`[LOCK] Released lock for user ${userId}`);
      } else {
        console.log(`[LOCK] Cannot release lock for user ${userId} - not owned by this process`);
      }
    } catch (error) {
      console.error(`[LOCK] Error releasing lock for user ${userId}:`, error);
    }
  },

  /**
   * Process webhook with proper locking and idempotency
   * @param {Object} event - The webhook event
   * @param {string} userId - The user ID
   * @param {Function} processor - The processor function
   * @param {Object} db - Firebase database reference
   * @param {boolean} skipDeduplication - Skip database deduplication check (used when called from circuit breaker)
   * @returns {Promise<Object>} - Processing result
   */
  async processWebhookSafely(event, userId, processor, db, skipDeduplication = false) {
    const webhookId = `${event.id}_${event.data.object.id}`;
    const eventType = event.type;
    
    console.log(`[WEBHOOK] Processing ${eventType} for user ${userId}, webhook ID: ${webhookId}`);
    
    // Check if webhook already processed (skip if called from circuit breaker)
    if (!skipDeduplication) {
      console.log(`[WEBHOOK] Checking database deduplication for webhook: ${webhookId}`);
      if (await this.isWebhookProcessed(webhookId, db)) {
        console.log(`[WEBHOOK] Webhook ${webhookId} already processed in database, skipping`);
        return { success: true, skipped: true, reason: 'already_processed' };
      }
      console.log(`[WEBHOOK] Webhook ${webhookId} not found in database, proceeding with processing`);
    } else {
      console.log(`[WEBHOOK] Skipping database deduplication check for webhook: ${webhookId} (called from circuit breaker)`);
    }
    
    // ✅ RACE CONDITION FIX: Enhanced locking with event type awareness
    const lockId = await this.acquireUserLock(userId, eventType, 30000, db);
    if (!lockId) {
      console.log(`[WEBHOOK] Could not acquire lock for user ${userId}, webhook will be retried`);
      return { success: false, reason: 'lock_unavailable' };
    }
    
    try {
      // ✅ RACE CONDITION FIX: Check for conflicting webhooks
      const conflictingWebhooks = await this.checkConflictingWebhooks(userId, eventType, db);
      if (conflictingWebhooks.length > 0) {
        console.log(`[WEBHOOK] Conflicting webhooks detected for user ${userId}:`, conflictingWebhooks);
        // Wait for conflicting webhooks to complete
        await this.waitForWebhookCompletion(conflictingWebhooks, db);
      }
      
      // Process the webhook
      const result = await processor();
      
      // Mark webhook as processed
      await this.markWebhookProcessed(webhookId, eventType, userId, db);
      
      console.log(`[WEBHOOK] Successfully processed ${eventType} for user ${userId}`);
      return { success: true, result };
      
    } catch (error) {
      console.error(`[WEBHOOK] Error processing ${eventType} for user ${userId}:`, error);
      return { success: false, error: error.message };
    } finally {
      // Always release the lock
      await this.releaseUserLock(userId, lockId, db);
    }
  },
  
  /**
   * Check for conflicting webhooks
   * @param {string} userId - The user ID
   * @param {string} currentEventType - The current event type
   * @param {Object} db - Firebase database reference
   * @returns {Promise<Array>} - Array of conflicting webhooks
   */
  async checkConflictingWebhooks(userId, currentEventType, db) {
    try {
      const webhookSnap = await db.ref('webhookProcessing').once('value');
      const conflicting = [];
      
      webhookSnap.forEach((webhookSnapshot) => {
        const webhook = webhookSnapshot.val();
        if (webhook.userId === userId && 
            webhook.eventType !== currentEventType && 
            webhook.timestamp > Date.now() - 60000) { // Last minute
          conflicting.push(webhook);
        }
      });
      
      return conflicting;
    } catch (error) {
      console.error(`Error checking conflicting webhooks for user ${userId}:`, error);
      return [];
    }
  },
  
  /**
   * Wait for conflicting webhooks to complete
   * @param {Array} conflictingWebhooks - Array of conflicting webhooks
   * @param {Object} db - Firebase database reference
   */
  async waitForWebhookCompletion(conflictingWebhooks, db) {
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const stillRunning = [];
      
      for (const webhook of conflictingWebhooks) {
        const isStillRunning = await this.isWebhookProcessed(webhook.id, db);
        if (!isStillRunning) {
          stillRunning.push(webhook);
        }
      }
      
      if (stillRunning.length === 0) {
        console.log('[WEBHOOK] All conflicting webhooks completed');
        return;
      }
      
      // Wait 100ms before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn('[WEBHOOK] Timeout waiting for conflicting webhooks to complete');
  },

  /**
   * Clean up expired locks (should be called periodically)
   * @param {Object} db - Firebase database reference
   */
  async cleanupExpiredLocks(db) {
    try {
      const locksSnap = await db.ref('userLocks').once('value');
      const now = Date.now();
      let cleanedCount = 0;
      
      locksSnap.forEach((lockSnapshot) => {
        const lock = lockSnapshot.val();
        if (lock && lock.expiresAt < now) {
          db.ref(`userLocks/${lockSnapshot.key}`).remove();
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`[LOCK] Cleaned up ${cleanedCount} expired locks`);
      }
    } catch (error) {
      console.error(`[LOCK] Error cleaning up expired locks:`, error);
    }
  },

  /**
   * Clean up old webhook processing records (older than 7 days)
   * @param {Object} db - Firebase database reference
   */
  async cleanupOldWebhookRecords(db) {
    try {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const processedSnap = await db.ref('webhookProcessing').once('value');
      let cleanedCount = 0;
      
      processedSnap.forEach((recordSnapshot) => {
        const record = recordSnapshot.val();
        if (record && record.timestamp < sevenDaysAgo) {
          db.ref(`webhookProcessing/${recordSnapshot.key}`).remove();
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`[WEBHOOK] Cleaned up ${cleanedCount} old webhook processing records`);
      }
    } catch (error) {
      console.error(`[WEBHOOK] Error cleaning up old webhook records:`, error);
    }
  },

  /**
   * Clean up old failed webhook records (older than 30 days)
   * @param {Object} db - Firebase database reference
   */
  async cleanupOldFailedWebhooks(db) {
    try {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const failedSnap = await db.ref('failedWebhooks').once('value');
      let cleanedCount = 0;
      
      failedSnap.forEach((failedSnapshot) => {
        const failed = failedSnapshot.val();
        if (failed && failed.timestamp < thirtyDaysAgo) {
          db.ref(`failedWebhooks/${failedSnapshot.key}`).remove();
          cleanedCount++;
        }
      });
      
      if (cleanedCount > 0) {
        console.log(`[WEBHOOK] Cleaned up ${cleanedCount} old failed webhook records`);
      }
    } catch (error) {
      console.error(`[WEBHOOK] Error cleaning up old failed webhooks:`, error);
    }
  }
};
