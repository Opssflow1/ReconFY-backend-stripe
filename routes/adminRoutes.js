import express from "express";
import Joi from "joi";
import { adminAuditLogsQuerySchema, adminLegalComplianceQuerySchema, businessMetricsQuerySchema, systemHealthQuerySchema, cleanupDuplicateSubscriptionsSchema, retryFailedWebhooksSchema, adminWebhookStatsQuerySchema, adminWebhookHealthQuerySchema, termsAcceptanceBodySchema } from "../schemas.js";
import Stripe from "stripe";
import { adminLimiter, globalLimiter } from "../middleware/rateLimiting.js";
import { adminProtected, requireActivePlan } from "../middleware/stacks.js";
import { validateBody, validateQuery } from "../middleware/validation.js";
import ImmutableAuditLogger from "../auditLogger.js";
import { logTermsAccepted } from "../utils/auditUtils.js";
import { webhookCircuitBreaker } from "../utils/circuitBreaker.js";
import firebaseHandler from "../firebaseHandler.js";
import { orphanedFilesTracker } from "../utils/s3Utils.js";

export const setupAdminRoutes = (app, { 
  db, 
  auditLogger, 
  stripe, 
  webhookCircuitBreaker, 
  firebaseHandler, 
  orphanedFilesTracker,
  trialExpiryScheduler 
}) => {
  // ✅ S3 CLEANUP: Monitor orphaned files endpoint
  app.get('/admin/orphaned-files', ...adminProtected, async (req, res) => {
    try {
      // Only allow admin users to access this endpoint
      const { sub: userId } = req.user;
      const user = await firebaseHandler.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Admin role required' });
      }

      const stats = orphanedFilesTracker.getStats();
      res.json({
        success: true,
        orphanedFiles: stats,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting orphaned files stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: Get audit logs
  app.get('/admin/audit-logs', ...adminProtected, validateBody(adminAuditLogsQuerySchema), async (req, res) => {
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
  app.get('/admin/audit-logs/:logId/verify', ...adminProtected, async (req, res) => {
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

  // Admin: Get legal compliance statistics
  app.get("/admin/legal-compliance", ...adminProtected, validateBody(adminLegalComplianceQuerySchema), async (req, res) => {
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
  app.post("/log/terms-acceptance", validateBody(termsAcceptanceBodySchema), async (req, res) => {
    try {
      const { userId, email, company, termsVersion, privacyVersion, ipAddress, userAgent } = req.body;
      
      if (!userId || !email) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      await logTermsAccepted(auditLogger, { userId, email, company, termsVersion, privacyVersion, ipAddress, userAgent });

      res.json({ success: true, message: 'Terms acceptance logged successfully' });
    } catch (error) {
      console.error('Error in /log/terms-acceptance:', error);
      res.status(500).json({ error: 'Failed to log terms acceptance' });
    }
  });

  // ✅ SAAS BEST PRACTICE: Business Metrics and Analytics
  app.get("/admin/business-metrics", ...adminProtected, validateQuery(businessMetricsQuerySchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { period, includeChurn } = req.query;
      const endDate = new Date();
      const startDate = new Date();
      
      // Calculate period
      switch (period) {
        case '7d': startDate.setDate(endDate.getDate() - 7); break;
        case '30d': startDate.setDate(endDate.getDate() - 30); break;
        case '90d': startDate.setDate(endDate.getDate() - 90); break;
        case '1y': startDate.setFullYear(endDate.getFullYear() - 1); break;
      }
      
      // Fetch all users and subscriptions
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      
      // Calculate business metrics
      const metrics = {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        users: {
          total: Object.keys(users).length,
          activeSubscriptions: 0,
          trialUsers: 0,
          cancelledUsers: 0
        },
        revenue: {
          totalMRR: 0,
          avgRevenuePerUser: 0,
          byTier: {
            STARTER: { count: 0, revenue: 0 },
            GROWTH: { count: 0, revenue: 0 },
            PRO: { count: 0, revenue: 0 },
            ENTERPRISE: { count: 0, revenue: 0 }
          }
        },
        growth: {
          newSignups: 0,
          conversions: 0,
          conversionRate: 0
        }
      };
      
      // Process user data
      for (const [userId, userData] of Object.entries(users)) {
        const createdAt = new Date(userData.createdAt || 0);
        const subscription = userData.subscription;
        
        // Count new signups in period
        if (createdAt >= startDate && createdAt <= endDate) {
          metrics.growth.newSignups++;
        }
        
        if (subscription) {
          if (subscription.tier === 'TRIAL') {
            // Count active trial users (tier is TRIAL, regardless of status)
            metrics.users.trialUsers++;
          } else if (subscription.status === 'ACTIVE' && !subscription.cancelAtPeriodEnd) {
            // Count active paid subscriptions (not scheduled for cancellation)
            metrics.users.activeSubscriptions++;
            const amount = subscription.billing?.amount || 0;
            metrics.revenue.totalMRR += amount;
            
            // Count by tier
            const tier = subscription.tier || 'STARTER';
            if (metrics.revenue.byTier[tier]) {
              metrics.revenue.byTier[tier].count++;
              metrics.revenue.byTier[tier].revenue += amount;
            }
            
            // Count conversions (trial to paid)
            if (userData.isTrialUsed && subscription.tier !== 'TRIAL') {
              metrics.growth.conversions++;
            }
          } else if (subscription.status === 'CANCELLED' || 
                     subscription.status === 'INACTIVE' ||
                     subscription.cancelAtPeriodEnd === true ||
                     subscription.isActive === false) {
            // Count cancelled users (explicit cancellation, inactive, scheduled cancellation, or inactive flag)
            metrics.users.cancelledUsers++;
          }
        } else if (userData.isTrialUsed) {
          // Count users who signed up but never created a subscription (expired/inactive trials)
          metrics.users.trialUsers++;
        }
      }
      
      // Calculate derived metrics
      metrics.revenue.avgRevenuePerUser = metrics.users.activeSubscriptions > 0 
        ? metrics.revenue.totalMRR / metrics.users.activeSubscriptions 
        : 0;
      
      metrics.growth.conversionRate = metrics.growth.newSignups > 0 
        ? (metrics.growth.conversions / metrics.growth.newSignups) * 100 
        : 0;
      
      // Add churn analysis if requested
      if (includeChurn) {
        metrics.churn = {
          rate: metrics.users.activeSubscriptions > 0 
            ? (metrics.users.cancelledUsers / (metrics.users.activeSubscriptions + metrics.users.cancelledUsers)) * 100 
            : 0,
          cancelledInPeriod: metrics.users.cancelledUsers
        };
      }
      
      res.json({
        success: true,
        metrics,
        generatedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error generating business metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ✅ SAAS BEST PRACTICE: System Health Monitoring
  app.get("/admin/system-health", ...adminProtected, validateBody(systemHealthQuerySchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { detailed } = req.body;
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
      };
      
      // Database connectivity check
      try {
        await db.ref('.info/connected').once('value');
        health.database = { status: 'connected' };
      } catch (dbError) {
        health.database = { status: 'error', error: dbError.message };
        health.status = 'degraded';
      }
      
      // Stripe connectivity check
      try {
        await stripe.customers.list({ limit: 1 });
        health.stripe = { status: 'connected' };
      } catch (stripeError) {
        health.stripe = { status: 'error', error: stripeError.message };
        health.status = 'degraded';
      }
      
      if (detailed) {
        // Webhook processing health
        const failedWebhooksSnap = await db.ref('failedWebhooks').once('value');
        const failedWebhooks = failedWebhooksSnap.val() || {};
        
        health.webhooks = {
          failedCount: Object.keys(failedWebhooks).length,
          circuitBreakerState: webhookCircuitBreaker.state,
          circuitBreakerStats: webhookCircuitBreaker.getStats()
        };
        
        // Recent error rates
        const recentErrors = Object.values(failedWebhooks).filter(webhook => 
          Date.now() - webhook.timestamp < 3600000 // Last hour
        );
        
        health.errors = {
          lastHour: recentErrors.length,
          errorRate: recentErrors.length > 0 ? (recentErrors.length / 60) : 0 // per minute
        };
      }
      
      res.json({
        success: true,
        health
      });
      
    } catch (error) {
      console.error('Error checking system health:', error);
      res.status(500).json({ 
        success: false,
        health: {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // NEW: Clean up duplicate subscription objects
  app.post("/admin/cleanup-duplicate-subscriptions", ...adminProtected, validateBody(cleanupDuplicateSubscriptionsSchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { dryRun = true } = req.body;
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val();
      const duplicates = [];
      const cleanupActions = [];
      
      // Find users with duplicate subscription objects
      for (const [userId, userData] of Object.entries(users)) {
        if (userData.subscription && userData.subscription.stripeSubscriptionId) {
          // Check if another user has the same subscription ID
          for (const [otherUserId, otherUserData] of Object.entries(users)) {
            if (userId !== otherUserId && 
                otherUserData.subscription && 
                otherUserData.subscription.stripeSubscriptionId === userData.subscription.stripeSubscriptionId) {
              
              duplicates.push({
                userId,
                otherUserId,
                subscriptionId: userData.subscription.stripeSubscriptionId,
                userEmail: userData.email,
                otherUserEmail: otherUserData.email
              });
              
              // Keep the user with the most recent subscription update
              const userUpdateTime = userData.subscription.lastWebhookUpdate || 0;
              const otherUserUpdateTime = otherUserData.subscription.lastWebhookUpdate || 0;
              
              if (userUpdateTime < otherUserUpdateTime) {
                cleanupActions.push({
                  action: 'remove',
                  userId,
                  reason: 'older_duplicate',
                  subscriptionId: userData.subscription.stripeSubscriptionId
                });
              } else {
                cleanupActions.push({
                  action: 'remove',
                  userId: otherUserId,
                  reason: 'older_duplicate',
                  subscriptionId: otherUserData.subscription.stripeSubscriptionId
                });
              }
            }
          }
        }
      }
      
      if (dryRun) {
        return res.json({
          success: true,
          message: 'Dry run completed',
          duplicates,
          cleanupActions,
          dryRun: true
        });
      }
      
      // Perform actual cleanup
      let cleanedCount = 0;
      for (const action of cleanupActions) {
        try {
          await db.ref(`users/${action.userId}/subscription`).remove();
          cleanedCount++;
          console.log(`[CLEANUP] Removed duplicate subscription for user ${action.userId}`);
        } catch (error) {
          console.error(`[CLEANUP] Failed to remove duplicate for user ${action.userId}:`, error);
        }
      }
      
      res.json({
        success: true,
        message: `Cleanup completed. Removed ${cleanedCount} duplicate subscriptions.`,
        duplicates,
        cleanupActions,
        cleanedCount,
        dryRun: false
      });
      
    } catch (error) {
      console.error('Error cleaning up duplicate subscriptions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // NEW: Retry processing for failed webhooks
  app.post("/admin/retry-failed-webhooks", ...adminProtected, validateBody(retryFailedWebhooksSchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const failedWebhooksSnap = await db.ref('failedWebhooks').once('value');
      const failedWebhooks = [];
      let processedCount = 0;
      let successCount = 0;
      
      failedWebhooksSnap.forEach((webhookSnapshot) => {
        const webhook = webhookSnapshot.val();
        if (webhook.retryCount < webhook.maxRetries) {
          failedWebhooks.push({
            id: webhookSnapshot.key,
            ...webhook
          });
        }
      });
      
      // Process failed webhooks in batches
      for (const failedWebhook of failedWebhooks) {
        try {
          // Increment retry count
          await db.ref(`failedWebhooks/${failedWebhook.id}`).update({
            retryCount: failedWebhook.retryCount + 1,
            lastRetryAt: Date.now()
          });
          
          // Attempt to reprocess (this would require storing the original event data)
          // For now, just mark as processed
          if (failedWebhook.retryCount + 1 >= failedWebhook.maxRetries) {
            await db.ref(`failedWebhooks/${failedWebhook.id}`).update({
              status: 'max_retries_exceeded',
              finalAttemptAt: Date.now()
            });
          }
          
          processedCount++;
          successCount++;
          
        } catch (retryError) {
          console.error(`[RETRY] Failed to retry webhook ${failedWebhook.id}:`, retryError);
          processedCount++;
        }
      }
      
      res.json({
        success: true,
        message: `Processed ${processedCount} failed webhooks`,
        processed: processedCount,
        successful: successCount,
        total: failedWebhooks.length
      });
      
    } catch (error) {
      console.error('[RETRY] Error processing failed webhooks:', error);
      res.status(500).json({ error: 'Failed to process failed webhooks' });
    }
  });

  // NEW: Get webhook processing statistics
  app.get("/admin/webhook-stats", ...adminProtected, validateBody(adminWebhookStatsQuerySchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const [processedSnap, failedSnap, locksSnap] = await Promise.all([
        db.ref('webhookProcessing').once('value'),
        db.ref('failedWebhooks').once('value'),
        db.ref('userLocks').once('value')
      ]);
      
      const processedCount = processedSnap.numChildren();
      const failedCount = failedSnap.numChildren();
      const activeLocks = locksSnap.numChildren();
      
      // Calculate success rate
      const totalWebhooks = processedCount + failedCount;
      const successRate = totalWebhooks > 0 ? ((processedCount / totalWebhooks) * 100).toFixed(2) : 100;
      
      res.json({
        success: true,
        stats: {
          totalProcessed: processedCount,
          totalFailed: failedCount,
          activeLocks: activeLocks,
          successRate: `${successRate}%`,
          totalWebhooks
        }
      });
      
    } catch (error) {
      console.error('[STATS] Error getting webhook statistics:', error);
      res.status(500).json({ error: 'Failed to get webhook statistics' });
    }
  });

  // NEW: Health check endpoint for webhook processing
  app.get("/admin/webhook-health", ...adminProtected, validateBody(adminWebhookHealthQuerySchema), async (req, res) => {
    // Admin group check (Cognito 'Admins' group)
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const [processedSnap, failedSnap, locksSnap] = await Promise.all([
        db.ref('webhookProcessing').once('value'),
        db.ref('failedWebhooks').once('value'),
        db.ref('userLocks').once('value')
      ]);
      
      const processedCount = processedSnap.numChildren();
      const failedCount = failedSnap.numChildren();
      const activeLocks = locksSnap.numChildren();
      
      // Check for stuck locks (locks older than 5 minutes)
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      let stuckLocks = 0;
      locksSnap.forEach((lockSnapshot) => {
        const lock = lockSnapshot.val();
        if (lock && lock.lockedAt < fiveMinutesAgo) {
          stuckLocks++;
        }
      });
      
      // Determine system health
      let healthStatus = 'HEALTHY';
      let issues = [];
      
      if (failedCount > 10) {
        healthStatus = 'WARNING';
        issues.push(`High number of failed webhooks: ${failedCount}`);
      }
      
      if (stuckLocks > 0) {
        healthStatus = 'CRITICAL';
        issues.push(`Stuck locks detected: ${stuckLocks}`);
      }
      
      if (activeLocks > 50) {
        healthStatus = 'WARNING';
        issues.push(`High number of active locks: ${activeLocks}`);
      }
      
      res.json({
        success: true,
        health: {
          status: healthStatus,
          timestamp: new Date().toISOString(),
          metrics: {
            processedWebhooks: processedCount,
            failedWebhooks: failedCount,
            activeLocks: activeLocks,
            stuckLocks: stuckLocks
          },
          issues: issues,
          recommendations: issues.length > 0 ? [
            'Check failed webhook logs for errors',
            'Monitor lock expiration times',
            'Consider increasing lock timeout if needed'
          ] : ['System operating normally']
        }
      });
      
    } catch (error) {
      console.error('[HEALTH] Error checking webhook health:', error);
      res.status(500).json({ 
        success: false,
        health: {
          status: 'ERROR',
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // ✅ TRIAL EXPIRY: Get scheduler status
  app.get('/admin/trial-expiry-status', ...adminProtected, async (req, res) => {
    try {
      // Only allow admin users to access this endpoint
      const { sub: userId } = req.user;
      const user = await firebaseHandler.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Admin role required' });
      }

      const status = trialExpiryScheduler ? trialExpiryScheduler.getStatus() : null;
      
      res.json({
        success: true,
        scheduler: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error getting trial expiry scheduler status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ✅ TRIAL EXPIRY: Manual trigger for trial expiry check
  app.post('/admin/trigger-trial-expiry', ...adminProtected, async (req, res) => {
    try {
      // Only allow admin users to trigger this
      const { sub: userId } = req.user;
      const user = await firebaseHandler.getUser(userId);
      
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Admin role required' });
      }

      if (!trialExpiryScheduler) {
        return res.status(503).json({ 
          error: 'Trial expiry scheduler not available',
          success: false 
        });
      }

      // Trigger manual check
      await trialExpiryScheduler.manualCheck();
      
      res.json({
        success: true,
        message: 'Trial expiry check triggered successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error triggering trial expiry check:', error);
      res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  });
};
