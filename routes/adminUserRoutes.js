/**
 * Admin User Management Routes
 * Handles all admin user management endpoints
 * Extracted from index.js for better modularity
 */

import express from "express";
import Joi from "joi";
import Stripe from "stripe";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { adminProtected } from "../middleware/stacks.js";
import { validateBody } from "../middleware/validation.js";
import { adminUsersListQuerySchema, adminUsersLocationsQuerySchema, adminDeleteUserBodySchema, adminUpdateUserSubscriptionBodySchema } from "../schemas.js";
import ImmutableAuditLogger from "../auditLogger.js";
import { logUserLocationDeleted, logAdminUserSubscriptionUpdated, logAdminUserSubscriptionUpdateFailed, logUserDeleted } from "../utils/auditUtils.js";
import { getPriceId, getTierFromPriceId } from "../utils/stripeHelpers.js";
import { updateUserSubscription } from "../utils/subscriptionUtils.js";
import { logSubscriptionPlanChanged } from "../utils/auditUtils.js";

/**
 * Setup admin user management routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.db - Firebase database instance
 * @param {Object} dependencies.auditLogger - Audit logging service
 * @param {Object} dependencies.cognitoClient - AWS Cognito client
 * @param {Object} dependencies.stripe - Stripe client
 */
export const setupAdminUserRoutes = (app, { db, auditLogger, cognitoClient, stripe }) => {

  // Admin: Get all users with subscription data (only return subscription object)
  app.get("/admin/users", ...adminProtected, validateBody(adminUsersListQuerySchema), async (req, res) => {
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

  // Admin: Get all locations for a specific user
  app.get('/admin/users/:userId/locations', ...adminProtected, validateBody(adminUsersLocationsQuerySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    
    try {
      const { userId } = req.params;
      const locationsSnap = await db.ref(`users/${userId}/locations`).once('value');
      
      if (!locationsSnap.exists()) {
        return res.json({ locations: [] });
      }
      
      const locations = Object.values(locationsSnap.val());
      res.json({ locations });
    } catch (err) {
      console.error('[ADMIN] Error fetching user locations:', err);
      res.status(500).json({ error: 'Failed to fetch user locations' });
    }
  });

  // Admin: Delete specific user location
  app.delete('/admin/users/:userId/locations/:locationId', ...adminProtected, async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    
    try {
      const { userId, locationId } = req.params;
      
      // Step 1: Get location details for analytics cleanup
      const locationSnap = await db.ref(`users/${userId}/locations/${locationId}`).once('value');
      if (!locationSnap.exists()) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      const location = locationSnap.val();
      const tspId = location.tspId;
      
      // Step 2: Delete associated analytics for this location
      const analyticsSnap = await db.ref(`analytics/${userId}`).once('value');
      let deletedAnalyticsCount = 0;
      
      if (analyticsSnap.exists()) {
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
          deletedAnalyticsCount = analyticsToDelete.length;
          console.log(`[TRANSACTION] Deleted ${deletedAnalyticsCount} analytics for location ${locationId}`);
        }
      }
      
      // ✅ TRANSACTION FIX: Use batch operation for atomic deletion
      const locationUpdates = {};
      locationUpdates[`users/${userId}/locations/${locationId}`] = null; // null = delete
      
      await db.ref().update(locationUpdates);
      
      // Fetch user root to include email in audit target
      let userEmail = null;
      try {
        const userRootSnap = await db.ref(`users/${userId}`).once('value');
        userEmail = userRootSnap.val()?.email || null;
      } catch (e) {
        userEmail = null;
      }
      
      await logUserLocationDeleted(auditLogger, { req, userId, userEmail, locationId, tspId, before: location });
      
      res.json({
        success: true,
        message: 'Location and associated analytics deleted successfully',
        details: {
          locationId,
          tspId,
          deletedAnalyticsCount,
          adminUser: req.user.sub
        }
      });
      
    } catch (err) {
      console.error('[ADMIN] Error deleting user location:', err);
      res.status(500).json({ error: 'Failed to delete user location' });
    }
  });

  // Admin: Update user subscription
  app.put("/admin/users/:userId/subscription", ...adminProtected, validateBody(adminUpdateUserSubscriptionBodySchema), async (req, res) => {
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
      if (updates.tier && updates.tier !== subscription.tier) {
        const priceId = getPriceId(updates.tier);
        if (!priceId) {
          return res.status(400).json({ error: "Invalid plan type" });
        }
        // Update Stripe subscription plan
        const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        if (!stripeSub || !stripeSub.items || !stripeSub.items.data.length) {
          return res.status(400).json({ error: "Stripe subscription items not found" });
        }
        const updatedStripeSub = await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{ id: stripeSub.items.data[0].id, price: priceId }],
          proration_behavior: 'create_prorations'
        });
        stripeChanged = true;

        // Log plan change transition immediately (since webhook audits are disabled)
        try {
          const refreshedSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
          const newPrice = refreshedSub.items?.data?.[0]?.price;
          const newTier = updates.tier || (newPrice?.id ? getTierFromPriceId(newPrice.id) : subscription.tier);
          const beforeState = {
            tier: subscription.tier,
            amount: subscription.billing?.amount || null,
            status: 'ACTIVE'
          };
          const afterState = {
            tier: newTier,
            amount: typeof newPrice?.unit_amount === 'number' ? newPrice.unit_amount / 100 : null,
            status: 'ACTIVE'
          };
          await logSubscriptionPlanChanged(auditLogger, {
            req,
            user: userData,
            before: beforeState,
            after: afterState,
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            priceId: newPrice?.id
          });
        } catch (auditError) {
          console.error('[AUDIT] Failed to log admin plan change:', auditError);
        }
      }

      // Handle cancel at period end
      const previousCancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
      if (typeof updates.cancelAtPeriodEnd === 'boolean' && updates.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: updates.cancelAtPeriodEnd
        });
        stripeChanged = true;
      }

      // Handle status change (cancel/reactivate)
      const previousStatus = subscription.status;
      if (updates.status && updates.status !== subscription.status) {
        if (updates.status === 'CANCELLED') {
          await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
          stripeChanged = true;
        } else if (updates.status === 'ACTIVE') {
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
        changes.push(`cancel_at_period_end: ${previousCancelAtPeriodEnd ? 'true' : 'false'} -> ${updates.cancelAtPeriodEnd ? 'true' : 'false'}`);
      }
      if (updates.status && updates.status !== subscription.status) {
        dbUpdate.status = updates.status;
        if (updates.status === 'CANCELLED') {
          dbUpdate.isActive = false;
        } else if (updates.status === 'ACTIVE') {
          dbUpdate.isActive = true;
        }
        changes.push('status');
        changes.push(`status: ${previousStatus || 'UNKNOWN'} -> ${updates.status}`);
      }
      
      // Track tier changes even though they're handled by Stripe webhook
      if (updates.tier && updates.tier !== subscription.tier) {
        changes.push('tier');
        // Add tier change info to the changes array for better tracking
        changes.push(`tier:${subscription.tier}->${updates.tier}`);
      }
      
      if (Object.keys(dbUpdate).length > 0) {
        await updateUserSubscription(userId, {
          ...dbUpdate,
          adminUpdated: true,
          adminUpdatedAt: new Date().toISOString()
        }, db);
      }

      // Avoid duplicate plan-change logs: if tier changed, we already logged transition above.
      const tierChanged = Boolean(updates.tier && updates.tier !== subscription.tier);
      if (!tierChanged) {
        await logAdminUserSubscriptionUpdated(auditLogger, {
          req,
          userId,
          userEmail: userData?.email,
          before: subscription,
          after: { ...subscription, ...dbUpdate },
          changes
        });
      }

      res.json({ success: true, message: `Subscription updated successfully${stripeChanged ? ' (Stripe synced)' : ''}. Note: Plan/tier changes will reflect after Stripe webhook confirmation.` });
    } catch (err) {
      console.error("Error updating user subscription:", err);
      
      // Log the failed admin action
      try {
        await logAdminUserSubscriptionUpdateFailed(auditLogger, { req, userId, userEmail: userData?.email, error: err });
      } catch (auditError) {
        console.error("Failed to log audit entry:", auditError);
      }
      
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: Delete user completely (Firebase, Stripe, Cognito)
  app.delete('/admin/users/:userId', ...adminProtected, validateBody(adminDeleteUserBodySchema), async (req, res) => {
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

      await logUserDeleted(auditLogger, { req, userId, email: userData.email, before: userData });

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

};
