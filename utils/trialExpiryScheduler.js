// Trial Expiry Scheduler for ReconFY backend
// Handles automatic expiration of Firebase-managed trial subscriptions

import { subscriptionLogger } from "./logger.js";
import { updateUserSubscription } from "./subscriptionUtils.js";

/**
 * Trial Expiry Scheduler Class
 * Manages scheduled checks for expired trial subscriptions
 */
export class TrialExpiryScheduler {
  constructor(db, options = {}) {
    this.db = db;
    this.isRunning = false;
    this.schedulerInterval = null;
    
    // Configuration options
    this.config = {
      // Check every 24 hours (in milliseconds)
      checkInterval: options.checkInterval || 24 * 60 * 60 * 1000,
      
      // Initial delay before first check (5 minutes after startup)
      initialDelay: options.initialDelay || 5 * 60 * 1000,
      
      // Batch size for processing users (prevent memory issues)
      batchSize: options.batchSize || 50,
      
      // Enable/disable scheduler
      enabled: options.enabled !== false
    };
    
    subscriptionLogger.info('Trial Expiry Scheduler initialized', {
      checkInterval: `${this.config.checkInterval / (60 * 60 * 1000)}h`,
      initialDelay: `${this.config.initialDelay / (60 * 1000)}m`,
      batchSize: this.config.batchSize,
      enabled: this.config.enabled
    });
  }

  /**
   * Start the trial expiry scheduler
   */
  start() {
    if (!this.config.enabled) {
      subscriptionLogger.info('Trial Expiry Scheduler is disabled');
      return;
    }

    if (this.isRunning) {
      subscriptionLogger.warn('Trial Expiry Scheduler is already running');
      return;
    }

    this.isRunning = true;
    
    subscriptionLogger.info('Starting Trial Expiry Scheduler', {
      initialDelay: this.config.initialDelay,
      checkInterval: this.config.checkInterval
    });

    // Schedule initial check after startup delay
    setTimeout(() => {
      this.checkExpiredTrials();
      
      // Set up recurring checks
      this.schedulerInterval = setInterval(() => {
        this.checkExpiredTrials();
      }, this.config.checkInterval);
      
    }, this.config.initialDelay);
  }

  /**
   * Stop the trial expiry scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    subscriptionLogger.info('Trial Expiry Scheduler stopped');
  }

  /**
   * Check for and expire trial subscriptions
   */
  async checkExpiredTrials() {
    const startTime = Date.now();
    
    try {
      subscriptionLogger.info('Starting trial expiry check');
      
      // Query all users with TRIAL subscriptions
      const trialUsersSnapshot = await this.db.ref('users')
        .orderByChild('subscription/tier')
        .equalTo('TRIAL')
        .once('value');
      
      if (!trialUsersSnapshot.exists()) {
        subscriptionLogger.info('No trial users found');
        return;
      }
      
      const trialUsers = trialUsersSnapshot.val();
      const userIds = Object.keys(trialUsers);
      const currentDate = new Date();
      
      subscriptionLogger.info(`Found ${userIds.length} trial users to check`);
      
      let expiredCount = 0;
      let processedCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Process users in batches to prevent memory issues
      for (let i = 0; i < userIds.length; i += this.config.batchSize) {
        const batch = userIds.slice(i, i + this.config.batchSize);
        
        await Promise.all(batch.map(async (userId) => {
          try {
            const user = trialUsers[userId];
            const subscription = user.subscription;
            
            processedCount++;
            
            // Skip if not a valid trial subscription
            if (!subscription || 
                subscription.tier !== 'TRIAL' || 
                subscription.status !== 'ACTIVE' || 
                !subscription.endDate) {
              return;
            }
            
            const endDate = new Date(subscription.endDate);
            
            // Check if trial has expired
            if (endDate <= currentDate) {
              await this.expireTrial(userId, subscription, endDate);
              expiredCount++;
              
              subscriptionLogger.info(`Trial expired for user ${userId}`, {
                endDate: subscription.endDate,
                expiredDays: Math.floor((currentDate - endDate) / (24 * 60 * 60 * 1000))
              });
            }
            
          } catch (error) {
            errorCount++;
            errors.push({ userId, error: error.message });
            
            subscriptionLogger.error(`Error processing trial for user ${userId}`, {
              error: error.message,
              stack: error.stack
            });
          }
        }));
        
        // Small delay between batches to prevent overwhelming the database
        if (i + this.config.batchSize < userIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const duration = Date.now() - startTime;
      
      subscriptionLogger.info('Trial expiry check completed', {
        totalUsers: userIds.length,
        processedUsers: processedCount,
        expiredTrials: expiredCount,
        errors: errorCount,
        duration: `${duration}ms`
      });
      
      // Log errors if any
      if (errors.length > 0) {
        subscriptionLogger.error('Trial expiry errors summary', { errors });
      }
      
    } catch (error) {
      subscriptionLogger.error('Failed to check expired trials', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Expire a single trial subscription
   * @param {string} userId - User ID
   * @param {Object} subscription - Current subscription object
   * @param {Date} endDate - Trial end date
   */
  async expireTrial(userId, subscription, endDate) {
    const expiryData = {
      status: 'CANCELLED',
      isActive: false,
      cancelAtPeriodEnd: true,
      cancellationDate: new Date().toISOString(),
      cancellationReason: 'trial_expired'
    };
    
    subscriptionLogger.debug('Expiring trial subscription', {
      userId,
      currentStatus: subscription.status,
      endDate: subscription.endDate,
      updates: expiryData
    });
    
    await updateUserSubscription(userId, expiryData, this.db);
    
    subscriptionLogger.info('Trial subscription expired successfully', {
      userId,
      tier: subscription.tier,
      originalEndDate: subscription.endDate
    });
  }

  /**
   * Get scheduler status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      nextCheck: this.schedulerInterval ? 
        new Date(Date.now() + this.config.checkInterval).toISOString() : 
        null
    };
  }

  /**
   * Manual trigger for trial expiry check (for testing/admin purposes)
   */
  async manualCheck() {
    subscriptionLogger.info('Manual trial expiry check triggered');
    await this.checkExpiredTrials();
  }
}

/**
 * Create and configure trial expiry scheduler instance
 * @param {Object} db - Firebase database instance
 * @param {Object} options - Configuration options
 * @returns {TrialExpiryScheduler} Scheduler instance
 */
export function createTrialExpiryScheduler(db, options = {}) {
  return new TrialExpiryScheduler(db, options);
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG = {
  checkInterval: 24 * 60 * 60 * 1000, // 24 hours
  initialDelay: 5 * 60 * 1000,        // 5 minutes
  batchSize: 50,                       // 50 users per batch
  enabled: true                        // Enabled by default
};