/**
 * Firebase API Endpoints
 * These endpoints replace all frontend Firebase operations
 * Maintains exact same functionality while ensuring database security
 */

import express from 'express';
import firebaseHandler from './firebaseHandler.js';
import { requireActiveSubscription } from './subscriptionAuth.js';
import { requireAuth, adminProtected } from './middleware/stacks.js';
import Joi from 'joi';
import { expenseSchema, monthlySummarySchema, expenseImportSchema, expenseCategorySchema, userIdParamSchema, userAndLocationParamSchema, userLocMonthParamSchema, userLocMonthExpenseParamSchema, userTspParamSchema } from './schemas.js';
import { validateBody, validateParams } from './middleware/validation.js';

const router = express.Router();

// ✅ Schemas are now imported from schemas.js to avoid duplication
// ✅ Validation middleware is now imported from middleware/validation.js

// --- PUBLIC ENDPOINTS (No authentication required) ---

// Create user (public - no authentication required)
router.post('/users', async (req, res) => {
  try {
    const userData = req.body;
    const result = await firebaseHandler.createUser(userData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply authentication to all other routes
router.use(...requireAuth);

// --- USER ANALYTICS / SESSION ENDPOINTS ---

// Get user analytics data
router.get('/user-analytics/:userId', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const userData = await firebaseHandler.getUserAnalyticsData(userId);
    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set user analytics data
router.post('/user-analytics/:userId', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = req.body;
    const result = await firebaseHandler.setUserAnalyticsData(userId, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user analytics data
router.patch('/user-analytics/:userId', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const data = req.body;
    const result = await firebaseHandler.updateUserAnalyticsData(userId, data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analyses count
router.get('/user-analytics/:userId/analyses-count', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await firebaseHandler.getAnalysesCount(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set analyses count
router.post('/user-analytics/:userId/analyses-count', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { count } = req.body;
    const result = await firebaseHandler.setAnalysesCount(userId, count);
    res.json({ count: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get files processed count
router.get('/user-analytics/:userId/files-processed', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await firebaseHandler.getFilesProcessed(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set files processed count
router.post('/user-analytics/:userId/files-processed', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { count } = req.body;
    const result = await firebaseHandler.setFilesProcessed(userId, count);
    res.json({ count: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get activity history
router.get('/user-analytics/:userId/activity-history', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const history = await firebaseHandler.getActivityHistory(userId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set activity history
router.post('/user-analytics/:userId/activity-history', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { history } = req.body;
    const result = await firebaseHandler.setActivityHistory(userId, history);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user session key
router.get('/user-analytics/:userId/session-key', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionKey = await firebaseHandler.getUserSessionKey(userId);
    res.json({ sessionKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set user session key
router.post('/user-analytics/:userId/session-key', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionKey } = req.body;
    const result = await firebaseHandler.setUserSessionKey(userId, sessionKey);
    res.json({ sessionKey: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- USER OPERATIONS ENDPOINTS ---

// Get user
router.get('/users/:userId', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await firebaseHandler.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List users (admin only)
router.get('/users', ...adminProtected, async (req, res) => {
  try {
    const users = await firebaseHandler.listUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SUBSCRIPTION OPERATIONS ENDPOINTS ---

// Update usage
router.patch('/users/:userId/usage', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const usageData = req.body;
    const result = await firebaseHandler.updateUsage(userId, usageData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Increment usage
router.post('/users/:userId/usage/increment', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { field } = req.body;
    const result = await firebaseHandler.incrementUsage(userId, field);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset monthly usage
router.post('/users/:userId/usage/reset', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await firebaseHandler.resetMonthlyUsage(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ANALYTICS OPERATIONS ENDPOINTS ---

// Create analytics
router.post('/analytics', requireActiveSubscription, async (req, res) => {
  try {
    const analyticsData = req.body;
    const result = await firebaseHandler.createAnalytics(analyticsData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user analytics
router.get('/analytics/:userId', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const analytics = await firebaseHandler.getUserAnalytics(userId);
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics by date range
router.get('/analytics/:userId/date-range', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    const analytics = await firebaseHandler.getAnalyticsByDateRange(userId, new Date(startDate), new Date(endDate));
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete analytics
router.delete('/analytics/:userId', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await firebaseHandler.deleteAnalytics(userId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user analytics
router.delete('/user-analytics/:userId', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await firebaseHandler.deleteUserAnalytics(userId);
    res.json({ success: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LEGAL ACCEPTANCE ENDPOINTS ---

// Update legal acceptance
router.patch('/users/:userId/legal-acceptance', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const legalData = req.body;
    const result = await firebaseHandler.updateLegalAcceptance(userId, legalData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get legal acceptance
router.get('/users/:userId/legal-acceptance', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const legalAcceptance = await firebaseHandler.getLegalAcceptance(userId);
    res.json(legalAcceptance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if user has accepted all legal
router.get('/users/:userId/legal-acceptance/check', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const hasAccepted = await firebaseHandler.hasAcceptedAllLegal(userId);
    res.json({ hasAccepted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADMIN OPERATIONS ENDPOINTS ---

// Update user subscription (admin only)
router.patch('/admin/users/:userId/subscription', ...adminProtected, validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const subscriptionData = req.body;
    const result = await firebaseHandler.updateUserSubscription(userId, subscriptionData);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get admin stats
router.get('/admin/stats', ...adminProtected, async (req, res) => {
  try {
    const stats = await firebaseHandler.getAdminStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chart data
router.get('/admin/chart-data', ...adminProtected, async (req, res) => {
  try {
    const chartData = await firebaseHandler.getChartData();
    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LOCATION OPERATIONS ENDPOINTS ---

// Create location
router.post('/locations/:userId', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const locationData = req.body;
    const result = await firebaseHandler.createLocation(userId, locationData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user locations
router.get('/locations/:userId', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const locations = await firebaseHandler.getUserLocations(userId);
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific location
router.get('/locations/:userId/:locationId', validateParams(userAndLocationParamSchema), async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const location = await firebaseHandler.getLocation(userId, locationId);
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update location
router.patch('/locations/:userId/:locationId', validateParams(userAndLocationParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const updates = req.body;
    const result = await firebaseHandler.updateLocation(userId, locationId, updates);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete location
router.delete('/locations/:userId/:locationId', validateParams(userAndLocationParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const result = await firebaseHandler.deleteLocation(userId, locationId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete locations
router.delete('/locations/:userId/bulk', validateParams(userIdParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    const { locationIds } = req.body;
    const result = await firebaseHandler.bulkDeleteLocations(userId, locationIds);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get deletion impact
router.get('/locations/:userId/:locationId/impact', validateParams(userAndLocationParamSchema), async (req, res) => {
  try {
    const { userId, locationId } = req.params;
    const impact = await firebaseHandler.getDeletionImpact(userId, locationId);
    res.json(impact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check TSP ID uniqueness
router.get('/locations/:userId/tsp-id/:tspId/unique', validateParams(userTspParamSchema), async (req, res) => {
  try {
    const { userId, tspId } = req.params;
    const { excludeLocationId } = req.query;
    const isUnique = await firebaseHandler.isTspIdUniqueForUser(userId, tspId, excludeLocationId);
    res.json({ isUnique });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get location count
router.get('/locations/:userId/count', validateParams(userIdParamSchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await firebaseHandler.getLocationCount(userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get location by TSP ID
router.get('/locations/:userId/tsp-id/:tspId', validateParams(userTspParamSchema), async (req, res) => {
  try {
    const { userId, tspId } = req.params;
    const location = await firebaseHandler.getLocationByTspId(userId, tspId);
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Validate TSP IDs
router.post('/locations/:userId/validate-tsp-ids', async (req, res) => {
  try {
    const { userId } = req.params;
    const { tspIds } = req.body;
    const validation = await firebaseHandler.validateTspIds(userId, tspIds);
    res.json(validation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get location statistics
router.get('/locations/:userId/statistics', async (req, res) => {
  try {
    const { userId } = req.params;
    const statistics = await firebaseHandler.getLocationStatistics(userId);
    res.json(statistics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- UTILITY ENDPOINTS ---

// Check if user exists
router.get('/users/:userId/exists', async (req, res) => {
  try {
    const { userId } = req.params;
    const exists = await firebaseHandler.userExists(userId);
    res.json({ exists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user count
router.get('/users/count', async (req, res) => {
  try {
    const count = await firebaseHandler.getUserCount();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get users by subscription status
router.get('/users/status/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const users = await firebaseHandler.getUsersBySubscriptionStatus(status);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get users by subscription tier
router.get('/users/tier/:tier', async (req, res) => {
  try {
    const { tier } = req.params;
    const users = await firebaseHandler.getUsersBySubscriptionTier(tier);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- EXPENSE OPERATIONS ENDPOINTS ---

// Add expense to specific location-month
router.post('/expenses/:userId/:locationId/:monthYear', requireActiveSubscription, validateBody(expenseSchema), async (req, res) => {
  try {
    const { userId, locationId, monthYear } = req.params;
    const expenseData = req.body;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only manage your own expenses' });
    }

    const result = await firebaseHandler.addExpense(userId, locationId, monthYear, expenseData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly expenses for specific location
router.get('/expenses/:userId/:locationId/:monthYear', validateParams(userLocMonthParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId, monthYear } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only view your own expenses' });
    }

    const result = await firebaseHandler.getLocationMonthlyExpenses(userId, locationId, monthYear);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update expense in location-month
router.patch('/expenses/:userId/:locationId/:monthYear/:expenseId', validateParams(userLocMonthExpenseParamSchema), requireActiveSubscription, validateBody(expenseSchema), async (req, res) => {
  try {
    const { userId, locationId, monthYear, expenseId } = req.params;
    const updates = req.body;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only update your own expenses' });
    }

    const result = await firebaseHandler.updateExpense(userId, locationId, monthYear, expenseId, updates);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete expense from location-month
router.delete('/expenses/:userId/:locationId/:monthYear/:expenseId', validateParams(userLocMonthExpenseParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId, monthYear, expenseId } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only delete your own expenses' });
    }

    const result = await firebaseHandler.deleteExpense(userId, locationId, monthYear, expenseId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import CSV expenses to location-month
router.post('/expenses/:userId/:locationId/:monthYear/import', validateParams(userLocMonthParamSchema), requireActiveSubscription, validateBody(expenseImportSchema), async (req, res) => {
  try {
    const { userId, locationId, monthYear } = req.params;
    const { expenses } = req.body;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only import expenses for your own account' });
    }

    const result = await firebaseHandler.importExpenses(userId, locationId, monthYear, expenses);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- MONTHLY SUMMARY ENDPOINTS ---

// Get location monthly summary
router.get('/monthly-summary/:userId/:locationId/:monthYear', validateParams(userLocMonthParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId, monthYear } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only view your own summaries' });
    }

    const result = await firebaseHandler.getLocationMonthlySummary(userId, locationId, monthYear);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all monthly summaries for user
router.get('/monthly-summary/:userId', requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only view your own summaries' });
    }

    const result = await firebaseHandler.getAllLocationMonthlySummaries(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate monthly summary
router.post('/monthly-summary/:userId/:locationId/:monthYear', validateParams(userLocMonthParamSchema), requireActiveSubscription, async (req, res) => {
  try {
    const { userId, locationId, monthYear } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only calculate summaries for your own account' });
    }

    const result = await firebaseHandler.calculateMonthlySummary(userId, locationId, monthYear);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- EXPENSE CATEGORIES ENDPOINTS ---

// Get expense categories for user
router.get('/expense-categories/:userId', requireActiveSubscription, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only view your own categories' });
    }

    const result = await firebaseHandler.getUserExpenseCategories(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add custom expense category
router.post('/expense-categories/:userId', requireActiveSubscription, validateBody(expenseCategorySchema), async (req, res) => {
  try {
    const { userId } = req.params;
    const { category } = req.body;
    
    // Validate user ownership
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only manage your own categories' });
    }

    const result = await firebaseHandler.addExpenseCategory(userId, category);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
