/**
 * Analytics Routes
 * Handles all analytics-related endpoints for users and admins
 * Extracted from index.js for better modularity
 */

import express from "express";
import Joi from "joi";
import { adminAnalyticsListQuerySchema, adminUserLocationAnalyticsQuerySchema } from "../schemas.js";
import { requireAuth, requireActivePlan, adminProtected } from "../middleware/stacks.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import { analyticsSchema, analyticsIdParamSchema } from "../schemas.js";
import ImmutableAuditLogger from "../auditLogger.js";
import { logUserAnalyticsDeleted, logUserAnalyticsDeleteFailed } from "../utils/auditUtils.js";

/**
 * Setup analytics routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.db - Firebase database instance
 * @param {Object} dependencies.auditLogger - Audit logging service
 * @param {Object} dependencies.cognitoClient - AWS Cognito client
 */
export const setupAnalyticsRoutes = (app, { db, auditLogger, cognitoClient }) => {
  
  // -----------------------------
  // Analytics Endpoints (Single Heading: analytics/{userId}/{analyticsId})
  // -----------------------------

  // Create analytics record for current user
  app.post('/analytics', ...requireAuth, validateBody(analyticsSchema), async (req, res) => {
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
        metadata,
        verificationResults,
        verificationTable,
        promoOrders,
        analysisDate,
        // NEW: Location tracking fields
        locationIds,
        tspIds,
        primaryLocationId,
        primaryTspId
      } = req.body || {};

      // ✅ DATA INTEGRITY FIX: Validate location references before creating analytics
      let validatedLocationIds = [];
      let validatedTspIds = [];
      let validatedPrimaryLocationId = null;
      let validatedPrimaryTspId = null;
      
      if (locationIds && locationIds.length > 0) {
        // Validate that all location IDs exist
        const userLocationsSnap = await db.ref(`users/${userId}/locations`).once('value');
        const userLocations = userLocationsSnap.val() || {};
        
        validatedLocationIds = locationIds.filter(locationId => {
          if (userLocations[locationId]) {
            return true;
          } else {
            console.warn(`[DATA_INTEGRITY] Analytics references non-existent location: ${locationId}`);
            return false;
          }
        });
      }
      
      if (tspIds && tspIds.length > 0) {
        // Validate that all TSP IDs exist in user locations
        const userLocationsSnap = await db.ref(`users/${userId}/locations`).once('value');
        const userLocations = userLocationsSnap.val() || {};
        const validTspIds = new Set();
        
        Object.values(userLocations).forEach(location => {
          if (location.tspId) {
            validTspIds.add(location.tspId);
          }
        });
        
        validatedTspIds = tspIds.filter(tspId => {
          if (validTspIds.has(tspId)) {
            return true;
          } else {
            console.warn(`[DATA_INTEGRITY] Analytics references non-existent TSP ID: ${tspId}`);
            return false;
          }
        });
      }
      
      // Validate primary location and TSP ID
      if (primaryLocationId) {
        const locationSnap = await db.ref(`users/${userId}/locations/${primaryLocationId}`).once('value');
        if (locationSnap.exists()) {
          validatedPrimaryLocationId = primaryLocationId;
        } else {
          console.warn(`[DATA_INTEGRITY] Analytics references non-existent primary location: ${primaryLocationId}`);
        }
      }
      
      if (primaryTspId) {
        const userLocationsSnap = await db.ref(`users/${userId}/locations`).once('value');
        const userLocations = userLocationsSnap.val() || {};
        const hasTspId = Object.values(userLocations).some(location => location.tspId === primaryTspId);
        
        if (hasTspId) {
          validatedPrimaryTspId = primaryTspId;
        } else {
          console.warn(`[DATA_INTEGRITY] Analytics references non-existent primary TSP ID: ${primaryTspId}`);
        }
      }

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
        verificationResults: verificationResults || {},
        verificationTable: verificationTable || [],
        promoOrders: promoOrders || {},
        // ✅ DATA INTEGRITY FIX: Use validated location references
        locationIds: validatedLocationIds,
        tspIds: validatedTspIds,
        primaryLocationId: validatedPrimaryLocationId,
        primaryTspId: validatedPrimaryTspId,
        metadata: {
          ...(metadata || {}),
          calculationTimestamp: nowIso,
          source: (metadata && metadata.source) || 'backend',
          validationInfo: {
            originalLocationIds: locationIds || [],
            originalTspIds: tspIds || [],
            originalPrimaryLocationId: primaryLocationId || null,
            originalPrimaryTspId: primaryTspId || null,
            validatedAt: nowIso
          }
        },
        analysisDate: analysisDate || nowIso,
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
  app.get('/analytics', ...requireAuth, async (req, res) => {
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
  app.delete('/analytics', ...requireActivePlan, async (req, res) => {
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
  app.get('/admin/analytics/:userId', ...adminProtected, validateBody(adminAnalyticsListQuerySchema), async (req, res) => {
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

  // Delete specific analytics record (simplified - userId from JWT)
  app.delete('/analytics/:analyticsId', validateParams(analyticsIdParamSchema), ...requireActivePlan, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { analyticsId } = req.params;
      
      // Check if the analytics record exists and belongs to the user
      const analyticsSnap = await db.ref(`analytics/${userId}/${analyticsId}`).once('value');
      if (!analyticsSnap.exists()) {
        return res.status(404).json({ error: 'Analytics record not found' });
      }
      
      // Delete the analytics record
      await db.ref(`analytics/${userId}/${analyticsId}`).remove();
      
      console.log(`[DELETE] Deleted analytics record ${analyticsId} for user ${userId}`);
      
      return res.json({ 
        success: true,
        message: 'Analytics record deleted successfully',
        analyticsId
      });
      
    } catch (err) {
      console.error('[DELETE] Error deleting analytics record:', err);
      return res.status(500).json({ error: 'Failed to delete analytics record' });
    }
  });

  // Delete analytics for specific location/TSP ID (for location deletion cleanup)
  app.delete('/analytics/location/:locationId', ...requireActivePlan, async (req, res) => {
    try {
      const userId = req.user.sub;
      const { locationId } = req.params;
      
      // Get the location to find its TSP ID
      const locationSnap = await db.ref(`users/${userId}/locations/${locationId}`).once('value');
      if (!locationSnap.exists()) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      const location = locationSnap.val();
      const tspId = location.tspId;
      
      // ✅ ARCHITECTURAL FIX: Use database transaction for atomic operation
      const analyticsSnap = await db.ref(`analytics/${userId}`).once('value');
      if (!analyticsSnap.exists()) {
        return res.json({ success: true, deletedCount: 0 });
      }
      
      const analytics = analyticsSnap.val();
      const analyticsToDelete = [];
      
      // Find analytics that reference this location or TSP ID
      Object.entries(analytics).forEach(([analyticsId, analyticsData]) => {
        const shouldDelete = 
          (analyticsData.locationIds && analyticsData.locationIds.includes(locationId)) ||
          (analyticsData.tspIds && analyticsData.tspIds.includes(tspId)) ||
          (analyticsData.primaryLocationId === locationId) ||
          (analyticsData.primaryTspId === tspId);
        
        if (shouldDelete) {
          analyticsToDelete.push(analyticsId);
        }
      });
      
      // ✅ TRANSACTION FIX: Use batch operation for atomic deletion
      if (analyticsToDelete.length > 0) {
        const updates = {};
        analyticsToDelete.forEach(analyticsId => {
          updates[`analytics/${userId}/${analyticsId}`] = null; // null = delete
        });
        
        await db.ref().update(updates);
        console.log(`[TRANSACTION] Deleted ${analyticsToDelete.length} analytics for location ${locationId}`);
      }
      
      return res.json({ 
        success: true, 
        deletedCount: analyticsToDelete.length,
        locationId,
        tspId
      });
    } catch (err) {
      console.error('[DEBUG] Error deleting location analytics:', err);
      return res.status(500).json({ error: 'Failed to delete location analytics' });
    }
  });

  // Admin: delete all analytics for specific user
  app.delete('/admin/analytics/:userId', ...adminProtected, async (req, res) => {
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
      
      await logUserAnalyticsDeleted(auditLogger, { req, userId, userEmail: userData?.email });
      
      return res.json({ success: true });
    } catch (err) {
      console.error('[DEBUG] Error deleting user analytics (admin):', err);
      
      // Log the failed analytics deletion
      try {
        await logUserAnalyticsDeleteFailed(auditLogger, { req, userId, userEmail: userData?.email, error: err });
      } catch (auditError) {
        console.error("Failed to log audit entry:", auditError);
      }
      
      return res.status(500).json({ error: 'Failed to delete user analytics' });
    }
  });

  // Admin: Get location analytics summary for a specific user location
  app.get('/admin/users/:userId/locations/:locationId/analytics', ...adminProtected, validateBody(adminUserLocationAnalyticsQuerySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    
    try {
      const { userId, locationId } = req.params;
      
      // Get location details
      const locationSnap = await db.ref(`users/${userId}/locations/${locationId}`).once('value');
      if (!locationSnap.exists()) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      const location = locationSnap.val();
      const tspId = location.tspId;
      
      // Get analytics that reference this location
      const analyticsSnap = await db.ref(`analytics/${userId}`).once('value');
      let relatedAnalytics = [];
      
      if (analyticsSnap.exists()) {
        const analytics = analyticsSnap.val();
        
        Object.entries(analytics).forEach(([analyticsId, analyticsData]) => {
          const isRelated = 
            (analyticsData.locationIds && analyticsData.locationIds.includes(locationId)) ||
            (analyticsData.tspIds && analyticsData.tspIds.includes(tspId)) ||
            (analyticsData.primaryLocationId === locationId) ||
            (analyticsData.primaryTspId === tspId);
          
          if (isRelated) {
            relatedAnalytics.push({
              id: analyticsId,
              ...analyticsData
            });
          }
        });
      }
      
      res.json({
        success: true,
        location,
        analytics: {
          count: relatedAnalytics.length,
          records: relatedAnalytics
        }
      });
      
    } catch (err) {
      console.error('[ADMIN] Error fetching location analytics:', err);
      res.status(500).json({ error: 'Failed to fetch location analytics' });
    }
  });

};
