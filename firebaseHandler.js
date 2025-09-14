/**
 * Firebase Handler for Backend
 * Handles all Firebase database operations that were previously done in frontend
 * This ensures database security while maintaining exact same functionality
 */

import admin from 'firebase-admin';

class FirebaseHandler {
  constructor() {
    this._db = null;
  }

  // Lazy initialization of database reference
  get db() {
    if (!this._db) {
      this._db = admin.database();
    }
    return this._db;
  }

  // --- USER ANALYTICS / SESSION HELPERS ---

  // Get all analytics/session data for a user
  async getUserAnalyticsData(userId) {
    try {
      const analyticsRef = this.db.ref(`userAnalytics/${userId}`);
      const snapshot = await analyticsRef.once('value');
      return snapshot.exists() ? snapshot.val() : {
        analysesCount: 0,
        filesProcessed: 0,
        activityHistory: [],
        userSessionKey: null
      };
    } catch (error) {
      throw error;
    }
  }

  // Set all analytics/session data for a user (overwrite)
  async setUserAnalyticsData(userId, data) {
    try {
      const analyticsRef = this.db.ref(`userAnalytics/${userId}`);
      await analyticsRef.set(data);
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Update analytics/session fields for a user (partial update)
  async updateUserAnalyticsData(userId, data) {
    try {
      const analyticsRef = this.db.ref(`userAnalytics/${userId}`);
      await analyticsRef.update(data);
      return data;
    } catch (error) {
      throw error;
    }
  }

  // Individual field helpers (optional, for convenience)
  async getAnalysesCount(userId) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/analysesCount`);
      const snapshot = await refPath.once('value');
      return snapshot.exists() ? snapshot.val() : 0;
    } catch (error) {
      throw error;
    }
  }

  async setAnalysesCount(userId, count) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/analysesCount`);
      await refPath.set(count);
      return count;
    } catch (error) {
      throw error;
    }
  }

  async getFilesProcessed(userId) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/filesProcessed`);
      const snapshot = await refPath.once('value');
      return snapshot.exists() ? snapshot.val() : 0;
    } catch (error) {
      throw error;
    }
  }

  async setFilesProcessed(userId, count) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/filesProcessed`);
      await refPath.set(count);
      return count;
    } catch (error) {
      throw error;
    }
  }

  async getActivityHistory(userId) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/activityHistory`);
      const snapshot = await refPath.once('value');
      return snapshot.exists() ? snapshot.val() : [];
    } catch (error) {
      throw error;
    }
  }

  async setActivityHistory(userId, history) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/activityHistory`);
      await refPath.set(history);
      return history;
    } catch (error) {
      throw error;
    }
  }

  async getUserSessionKey(userId) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/userSessionKey`);
      const snapshot = await refPath.once('value');
      return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
      throw error;
    }
  }

  async setUserSessionKey(userId, sessionKey) {
    try {
      const refPath = this.db.ref(`userAnalytics/${userId}/userSessionKey`);
      await refPath.set(sessionKey);
      return sessionKey;
    } catch (error) {
      throw error;
    }
  }

  // User operations
  async createUser(userData) {
    try {
      // Validate required fields
      if (!userData.id || !userData.email) {
        throw new Error('User ID and email are required');
      }

      const userRef = this.db.ref(`users/${userData.id}`);
      const currentDate = new Date();
      
      // Only write user info and a clean nested subscription object
      const cleanUserData = {
        id: userData.id,
        email: userData.email,
        company: userData.company || '',
        createdAt: currentDate.toISOString(),
        updatedAt: currentDate.toISOString(),
        isTrialUsed: true,
        
        // Legal Acceptance Tracking
        legalAcceptance: {
          termsOfService: {
            accepted: userData.acceptTerms || false,
            version: '1.0.0',
            acceptedAt: userData.acceptTerms ? currentDate.toISOString() : null,
            ipAddress: 'from-signup',
            userAgent: 'from-signup'
          },
          privacyPolicy: {
            accepted: userData.acceptTerms || false,
            version: '1.0.0',
            acceptedAt: userData.acceptTerms ? currentDate.toISOString() : null,
            ipAddress: 'from-signup',
            userAgent: 'from-signup'
          },
          updatedAt: currentDate.toISOString()
        },
        
        // Clean nested subscription object
        subscription: {
          status: 'ACTIVE',
          tier: 'TRIAL',
          cancelAtPeriodEnd: false,
          startDate: currentDate.toISOString(),
          endDate: new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          features: {
            exportEnabled: true,
            prioritySupport: false,
            fullAccess: true
          },
          usage: {
            analysesThisMonth: 0,
            filesProcessedThisMonth: 0
          },
          billing: {
            amount: 0,
            currency: 'USD',
            nextBillingDate: null
          },
          createdAt: currentDate.toISOString(),
          updatedAt: currentDate.toISOString()
        }
      };

      await userRef.set(cleanUserData);
      
      console.log('User created successfully:', { userId: userData.id, email: userData.email });
      return cleanUserData;
    } catch (error) {
      throw error;
    }
  }

  async getUser(userId) {
    try {
      const userRef = this.db.ref(`users/${userId}`);
      const snapshot = await userRef.once('value');
      if (snapshot.exists()) {
        return snapshot.val();
      }
      return null;
    } catch (error) {
      throw error;
    }
  }

  async listUsers() {
    try {
      const usersRef = this.db.ref('users');
      const snapshot = await usersRef.orderByChild('createdAt').once('value');
      const users = [];
      snapshot.forEach((childSnapshot) => {
        users.push({ id: childSnapshot.key, ...childSnapshot.val() });
      });
      return users;
    } catch (error) {
      throw error;
    }
  }

  // Subscription-specific operations
  async updateUsage(userId, usageData) {
    try {
      const userRef = this.db.ref(`users/${userId}/usage`);
      const updateData = {
        ...usageData,
        lastUpdated: new Date().toISOString()
      };
      
      await userRef.update(updateData);
      return updateData;
    } catch (error) {
      throw error;
    }
  }

  async incrementUsage(userId, field) {
    try {
      const user = await this.getUser(userId);
      if (!user) throw new Error('User not found');
      
      const currentUsage = user.usage || {};
      const newCount = (currentUsage[field] || 0) + 1;
      
      return await this.updateUsage(userId, {
        ...currentUsage,
        [field]: newCount
      });
    } catch (error) {
      throw error;
    }
  }

  async resetMonthlyUsage(userId) {
    try {
      const resetData = {
        analysesThisMonth: 0,
        filesProcessedThisMonth: 0,
        lastUsageReset: new Date().toISOString()
      };
      
      return await this.updateUsage(userId, resetData);
    } catch (error) {
      throw error;
    }
  }

  // --- ANALYTICS OPERATIONS ---
  
  // Create analytics record (for profit calculations)
  async createAnalytics(analyticsData) {
    try {
      const analyticsId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);
      const analyticsRef = this.db.ref(`analytics/${analyticsData.userId}/${analyticsId}`);
      
      const enrichedData = {
        ...analyticsData,
        id: analyticsId,
        createdAt: new Date().toISOString()
      };
      
      await analyticsRef.set(enrichedData);
      return enrichedData;
    } catch (error) {
      throw error;
    }
  }

  // Get user analytics (for reports and dashboard)
  async getUserAnalytics(userId) {
    try {
      const analyticsRef = this.db.ref(`analytics/${userId}`);
      const snapshot = await analyticsRef.once('value');
      
      if (!snapshot.exists()) {
        return [];
      }
      
      const analytics = [];
      snapshot.forEach((childSnapshot) => {
        analytics.push(childSnapshot.val());
      });
      
      // Sort by creation date (newest first)
      return analytics.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      return [];
    }
  }

  // Get analytics by date range
  async getAnalyticsByDateRange(userId, startDate, endDate) {
    try {
      const analytics = await this.getUserAnalytics(userId);
      return analytics.filter(item => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= startDate && itemDate <= endDate;
      });
    } catch (error) {
      return [];
    }
  }

  // Delete all analytics data for a user
  async deleteAnalytics(userId) {
    try {
      const analyticsRef = this.db.ref(`analytics/${userId}`);
      
      // Check if data exists before deleting
      const snapshot = await analyticsRef.once('value');
      if (snapshot.exists()) {
        await analyticsRef.remove();
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  // Delete user analytics data for a user
  async deleteUserAnalytics(userId) {
    try {
      const userAnalyticsRef = this.db.ref(`userAnalytics/${userId}`);
      
      // Check if data exists before deleting
      const snapshot = await userAnalyticsRef.once('value');
      if (snapshot.exists()) {
        await userAnalyticsRef.remove();
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  // --- LEGAL ACCEPTANCE OPERATIONS ---
  
  // Update legal acceptance for a user
  async updateLegalAcceptance(userId, legalData) {
    try {
      const userRef = this.db.ref(`users/${userId}/legalAcceptance`);
      const currentDate = new Date().toISOString();
      
      const updateData = {
        termsOfService: {
          accepted: legalData.termsOfService?.accepted || false,
          version: legalData.termsOfService?.version || '1.0.0',
          acceptedAt: legalData.termsOfService?.accepted ? currentDate.toISOString() : null,
          ipAddress: legalData.termsOfService?.ipAddress || 'from-update',
          userAgent: legalData.termsOfService?.userAgent || 'from-update'
        },
        privacyPolicy: {
          accepted: legalData.privacyPolicy?.accepted || false,
          version: legalData.privacyPolicy?.version || '1.0.0',
          acceptedAt: legalData.privacyPolicy?.accepted ? currentDate.toISOString() : null,
          ipAddress: legalData.privacyPolicy?.ipAddress || 'from-update',
          userAgent: legalData.privacyPolicy?.userAgent || 'from-update'
        },
        updatedAt: currentDate.toISOString()
      };
      
      await userRef.update(updateData);
      return updateData;
    } catch (error) {
      throw error;
    }
  }

  // Get legal acceptance status for a user
  async getLegalAcceptance(userId) {
    try {
      const legalRef = this.db.ref(`users/${userId}/legalAcceptance`);
      const snapshot = await legalRef.once('value');
      
      if (snapshot.exists()) {
        return snapshot.val();
      }
      
      return null;
    } catch (error) {
      throw error;
    }
  }

  // Check if user has accepted all required legal documents
  async hasAcceptedAllLegal(userId) {
    try {
      const legalAcceptance = await this.getLegalAcceptance(userId);
      
      if (!legalAcceptance) {
        return false;
      }
      
      return legalAcceptance.termsOfService?.accepted && 
             legalAcceptance.privacyPolicy?.accepted;
    } catch (error) {
      return false;
    }
  }

  // --- ADMIN OPERATIONS ---

  // Update user subscription (admin only)
  async updateUserSubscription(userId, subscriptionData) {
    try {
      const userRef = this.db.ref(`users/${userId}`);
      const currentDate = new Date().toISOString();
      
      const updateData = {
        company: subscriptionData.company,
        updatedAt: currentDate,
        'subscription/endDate': subscriptionData.endDate,
        'subscription/cancelAtPeriodEnd': subscriptionData.cancelAtPeriodEnd,
        'subscription/updatedAt': currentDate,
        'subscription/adminUpdated': true,
        'subscription/adminUpdatedAt': currentDate
      };
      
      await userRef.update(updateData);
      return updateData;
    } catch (error) {
      throw error;
    }
  }

  // Get admin stats
  async getAdminStats() {
    try {
      const adminStatsRef = this.db.ref('adminStats');
      const snapshot = await adminStatsRef.once('value');
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
      throw error;
    }
  }

  // Get chart data
  async getChartData() {
    try {
      const chartDataRef = this.db.ref('chartData');
      const snapshot = await chartDataRef.once('value');
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
      throw error;
    }
  }

  // --- LOCATION OPERATIONS ---

  // Create a new location for a user
  async createLocation(userId, locationData) {
    try {
      // Check if user can add more locations
      const userSubscription = await this.getUserSubscription(userId);
      const currentLocations = await this.getUserLocations(userId);
      const canAdd = this.canAddLocation(currentLocations.length, userSubscription.tier);
      
      if (!canAdd) {
        const limits = this.getLocationLimits(userSubscription.tier);
        throw new Error(`You have reached the maximum limit of ${limits.max} locations for your ${userSubscription.tier} plan. Please upgrade to add more locations.`);
      }

      // Check TSP ID uniqueness for this user
      const isTspIdUnique = await this.isTspIdUniqueForUser(userId, locationData.tspId);
      if (!isTspIdUnique) {
        throw new Error(`TSP ID "${locationData.tspId}" is already in use. Please use a unique TSP ID.`);
      }

      // Create location with metadata
      const locationRef = this.db.ref(`users/${userId}/locations`);
      const newLocationRef = locationRef.push();
      
      const location = {
        id: newLocationRef.key,
        userId: userId,
        storeName: locationData.storeName.trim(),
        address: locationData.address.trim(),
        tspId: locationData.tspId.trim(),
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await newLocationRef.set(location);
      
      return {
        success: true,
        location: location,
        message: 'Location created successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  // Get all locations for a user
  async getUserLocations(userId) {
    try {
      const locationsRef = this.db.ref(`users/${userId}/locations`);
      const snapshot = await locationsRef.once('value');
      
      if (!snapshot.exists()) {
        return [];
      }

      const locations = [];
      snapshot.forEach((childSnapshot) => {
        const location = childSnapshot.val();
        if (location && location.isActive !== false) {
          locations.push(location);
        }
      });

      // Sort by creation date (newest first)
      return locations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      throw error;
    }
  }

  // Get a specific location by ID
  async getLocation(userId, locationId) {
    try {
      const locationRef = this.db.ref(`users/${userId}/locations/${locationId}`);
      const snapshot = await locationRef.once('value');
      
      if (!snapshot.exists()) {
        throw new Error('Location not found');
      }

      return snapshot.val();
    } catch (error) {
      throw error;
    }
  }

  // Update an existing location
  async updateLocation(userId, locationId, updates) {
    try {
      // Check if TSP ID is unique (excluding current location)
      if (updates.tspId) {
        const isTspIdUnique = await this.isTspIdUniqueForUser(userId, updates.tspId, locationId);
        if (!isTspIdUnique) {
          throw new Error(`TSP ID "${updates.tspId}" is already in use. Please use a unique TSP ID.`);
        }
      }

      // Update location
      const locationRef = this.db.ref(`users/${userId}/locations/${locationId}`);
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await locationRef.update(updateData);
      
      return {
        success: true,
        message: 'Location updated successfully'
      };
    } catch (error) {
      throw error;
    }
  }

  // Delete a location (hard delete - removes from database and analytics)
  async deleteLocation(userId, locationId) {
    try {
      // Check if user can remove locations
      const userSubscription = await this.getUserSubscription(userId);
      const currentLocations = await this.getUserLocations(userId);
      const canRemove = currentLocations.length > this.getLocationLimits(userSubscription.tier).min;
      
      if (!canRemove) {
        const limits = this.getLocationLimits(userSubscription.tier);
        throw new Error(`You must maintain at least ${limits.min} location(s) for your ${limits.name} plan.`);
      }

      // Get location details before deletion for analytics cleanup
      const locationToDelete = await this.getLocation(userId, locationId);
      if (!locationToDelete) {
        throw new Error('Location not found');
      }

      const tspId = locationToDelete.tspId;
      
      // Step 1: Delete associated analytics for this location
      const analyticsSnap = await this.db.ref(`analytics/${userId}`).once('value');
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
        
        // Use batch operation for atomic deletion
        if (analyticsToDelete.length > 0) {
          const updates = {};
          analyticsToDelete.forEach(analyticsId => {
            updates[`analytics/${userId}/${analyticsId}`] = null; // null = delete
          });
          
          await this.db.ref().update(updates);
          deletedAnalyticsCount = analyticsToDelete.length;
          console.log(`[TRANSACTION] Deleted ${deletedAnalyticsCount} analytics for location ${locationId}`);
        }
      }

      // Step 2: Delete the location from database
      const locationRef = this.db.ref(`users/${userId}/locations/${locationId}`);
      await locationRef.remove();
      
      return {
        success: true,
        message: 'Location and associated analytics data deleted successfully',
        details: {
          locationId,
          tspId,
          deletedAnalyticsCount
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Bulk delete multiple locations and their analytics
  async bulkDeleteLocations(userId, locationIds) {
    try {
      if (!Array.isArray(locationIds) || locationIds.length === 0) {
        throw new Error('Invalid location IDs provided');
      }

      // Check if user can remove these locations
      const userSubscription = await this.getUserSubscription(userId);
      const currentLocations = await this.getUserLocations(userId);
      const remainingLocations = currentLocations.length - locationIds.length;
      const canRemove = remainingLocations >= this.getLocationLimits(userSubscription.tier).min;
      
      if (!canRemove) {
        const limits = this.getLocationLimits(userSubscription.tier);
        throw new Error(`Cannot delete locations. You must maintain at least ${limits.min} location(s) for your ${limits.name} plan.`);
      }

      const results = [];
      
      for (const locationId of locationIds) {
        try {
          const result = await this.deleteLocation(userId, locationId);
          results.push({ locationId, success: true, message: result.message });
        } catch (error) {
          results.push({ locationId, success: false, error: error.message });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        success: failed === 0,
        results,
        summary: {
          total: locationIds.length,
          successful,
          failed
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // Get deletion impact summary before deleting a location
  async getDeletionImpact(userId, locationId) {
    try {
      const location = await this.getLocation(userId, locationId);
      if (!location) {
        throw new Error('Location not found');
      }

      // Count analytics records that would be affected
      const analyticsRef = this.db.ref(`analytics/${userId}`);
      const analyticsSnapshot = await analyticsRef.once('value');
      
      let analyticsImpact = {
        totalRecords: 0,
        recordsToDelete: 0,
        recordsToUpdate: 0
      };

      if (analyticsSnapshot.exists()) {
        const analytics = analyticsSnapshot.val();
        
        Object.values(analytics).forEach(analyticsData => {
          const { shouldDelete, shouldUpdate } = this.processAnalyticsForTspId(analyticsData, location.tspId);
          analyticsImpact.totalRecords++;
          if (shouldDelete) analyticsImpact.recordsToDelete++;
          else if (shouldUpdate) analyticsImpact.recordsToUpdate++;
        });
      }

      return {
        location,
        analyticsImpact,
        totalImpact: analyticsImpact.recordsToDelete + analyticsImpact.recordsToUpdate
      };
    } catch (error) {
      throw error;
    }
  }

  // Check if TSP ID is unique for a user
  async isTspIdUniqueForUser(userId, tspId, excludeLocationId = null) {
    try {
      const locations = await this.getUserLocations(userId);
      return !locations.some(location => 
        location.tspId === tspId && 
        location.id !== excludeLocationId
      );
    } catch (error) {
      return false;
    }
  }

  // Get location count for a user
  async getLocationCount(userId) {
    try {
      const locations = await this.getUserLocations(userId);
      return locations.length;
    } catch (error) {
      return 0;
    }
  }

  // Get user subscription info (helper method)
  async getUserSubscription(userId) {
    try {
      const subscriptionRef = this.db.ref(`users/${userId}/subscription`);
      const snapshot = await subscriptionRef.once('value');
      
      if (!snapshot.exists()) {
        return { tier: 'TRIAL' }; // Default to trial if no subscription
      }

      return snapshot.val();
    } catch (error) {
      return { tier: 'TRIAL' };
    }
  }

  // Get location by TSP ID for a user
  async getLocationByTspId(userId, tspId) {
    try {
      const locations = await this.getUserLocations(userId);
      return locations.find(location => location.tspId === tspId) || null;
    } catch (error) {
      return null;
    }
  }

  // Validate TSP IDs for a user
  async validateTspIds(userId, tspIds) {
    try {
      const validation = {
        isValid: true,
        validTspIds: [],
        invalidTspIds: [],
        missingLocations: [],
        matchedLocations: []
      };

      for (const tspId of tspIds) {
        const location = await this.getLocationByTspId(userId, tspId);
        if (location) {
          validation.validTspIds.push(tspId);
          validation.matchedLocations.push(location);
        } else {
          validation.invalidTspIds.push(tspId);
          validation.missingLocations.push(tspId);
          validation.isValid = false;
        }
      }

      return validation;
    } catch (error) {
      throw error;
    }
  }

  // Get location statistics for a user
  async getLocationStatistics(userId) {
    try {
      const locations = await this.getUserLocations(userId);
      const userSubscription = await this.getUserSubscription(userId);
      const limits = this.getLocationLimits(userSubscription.tier);
      
      return {
        totalLocations: locations.length,
        activeLocations: locations.filter(loc => loc.isActive).length,
        planTier: userSubscription.tier,
        planLimits: limits,
        canAddMore: this.canAddLocation(locations.length, userSubscription.tier),
        usagePercentage: Math.round((locations.length / limits.max) * 100),
        nextUpgrade: this.getNextUpgradeRecommendation(locations.length, userSubscription.tier)
      };
    } catch (error) {
      throw error;
    }
  }

  // Get upgrade recommendation
  getNextUpgradeRecommendation(currentCount, currentTier) {
    const tiers = ['TRIAL', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    const currentIndex = tiers.indexOf(currentTier);
    
    for (let i = currentIndex + 1; i < tiers.length; i++) {
      const tier = tiers[i];
      const limits = this.getLocationLimits(tier);
      if (limits.max > currentCount) {
        return {
          tier: tier,
          maxLocations: limits.max,
          additionalLocations: limits.max - currentCount
        };
      }
    }
    
    return null; // Already at highest tier
  }

  // Location utility methods
  getLocationLimits(planTier) {
    const LOCATION_LIMITS = {
      TRIAL: { min: 1, max: 1, name: 'Trial' },
      STARTER: { min: 1, max: 3, name: 'Starter' },
      GROWTH: { min: 3, max: 10, name: 'Growth' },
      PRO: { min: 11, max: 25, name: 'Pro' },
      ENTERPRISE: { min: 26, max: 50, name: 'Enterprise' }
    };
    return LOCATION_LIMITS[planTier] || LOCATION_LIMITS.TRIAL;
  }

  canAddLocation(currentCount, planTier) {
    const limits = this.getLocationLimits(planTier);
    return currentCount < limits.max;
  }

  // Process analytics for TSP ID (helper method for deletion impact)
  processAnalyticsForTspId(analyticsData, tspId) {
    // This is a simplified version - in practice, you might want more sophisticated logic
    const containsTspId = this.analyticsContainsTspId(analyticsData, tspId);
    const isExclusive = this.isAnalyticsExclusivelyForTspId(analyticsData, tspId);
    
    return {
      shouldDelete: isExclusive,
      shouldUpdate: containsTspId && !isExclusive,
      updatedData: containsTspId && !isExclusive ? this.cleanAnalyticsData(analyticsData, tspId) : null
    };
  }

  // Check if analytics contains TSP ID
  analyticsContainsTspId(analyticsData, tspId) {
    if (!analyticsData || !tspId) return false;
    
    // Check if TSP ID exists in the analytics data
    // This is a simplified check - adjust based on your actual data structure
    return JSON.stringify(analyticsData).includes(tspId);
  }

  // Check if analytics is exclusively for a TSP ID
  isAnalyticsExclusivelyForTspId(analyticsData, tspId) {
    // This is a simplified check - adjust based on your actual data structure
    // For now, we'll assume if it contains the TSP ID, it's not exclusive
    return false;
  }

  // Clean analytics data by removing TSP ID references
  cleanAnalyticsData(analyticsData, tspId) {
    // This is a simplified cleaning - adjust based on your actual data structure
    // For now, return the original data
    return analyticsData;
  }

  // --- UTILITY OPERATIONS ---

  // Check if user exists
  async userExists(userId) {
    try {
      const userRef = this.db.ref(`users/${userId}`);
      const snapshot = await userRef.once('value');
      return snapshot.exists();
    } catch (error) {
      return false;
    }
  }

  // Get user count
  async getUserCount() {
    try {
      const usersRef = this.db.ref('users');
      const snapshot = await usersRef.once('value');
      return snapshot.numChildren();
    } catch (error) {
      return 0;
    }
  }

  // Get users by subscription status
  async getUsersBySubscriptionStatus(status) {
    try {
      const usersRef = this.db.ref('users');
      const snapshot = await usersRef.orderByChild('subscription/status').equalTo(status).once('value');
      const users = [];
      snapshot.forEach((childSnapshot) => {
        users.push({ id: childSnapshot.key, ...childSnapshot.val() });
      });
      return users;
    } catch (error) {
      return [];
    }
  }

  // Get users by subscription tier
  async getUsersBySubscriptionTier(tier) {
    try {
      const usersRef = this.db.ref('users');
      const snapshot = await usersRef.orderByChild('subscription/tier').equalTo(tier).once('value');
      const users = [];
      snapshot.forEach((childSnapshot) => {
        users.push({ id: childSnapshot.key, ...childSnapshot.val() });
      });
      return users;
    } catch (error) {
      return [];
    }
  }

  // --- EXPENSE OPERATIONS ---

  // Add expense to specific location-month
  async addExpense(userId, locationId, monthYear, expenseData) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      // Generate unique expense ID
      const expenseId = this.db.ref().push().key;
      const now = new Date().toISOString();

      // Create expense record
      const expense = {
        id: expenseId,
        userId,
        locationId,
        monthYear,
        date: expenseData.date,
        category: expenseData.category.trim(),
        vendor: expenseData.vendor.trim(),
        amount: parseFloat(expenseData.amount),
        paymentMethod: expenseData.paymentMethod.trim(),
        notes: expenseData.notes ? expenseData.notes.trim() : '',
        // NEW: Include attachment if provided
        attachment: expenseData.attachment || null,
        createdAt: now,
        updatedAt: now
      };

      // Store expense
      await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).set(expense);

      // Update monthly summary
      const monthlySummary = await this.calculateMonthlySummary(userId, locationId, monthYear);

      return {
        success: true,
        expense,
        monthlyData: {
          locationId,
          month: monthYear,
          expenses: { [expenseId]: expense },
          monthlyTotals: monthlySummary
        },
        monthlyTotals: monthlySummary
      };
    } catch (error) {
      throw error;
    }
  }

  // Get monthly expenses for specific location
  async getLocationMonthlyExpenses(userId, locationId, monthYear) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      // Fetch expenses
      const expensesSnap = await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}`).once('value');
      const expenses = expensesSnap.val() || {};

      // Calculate monthly totals
      const monthlyTotals = await this.calculateMonthlySummary(userId, locationId, monthYear);

      return {
        locationId,
        month: monthYear,
        expenses,
        monthlyTotals
      };
    } catch (error) {
      throw error;
    }
  }

  // Update expense in location-month
  async updateExpense(userId, locationId, monthYear, expenseId, updates) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      // Check if expense exists
      const expenseSnap = await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).once('value');
      if (!expenseSnap.exists()) {
        throw new Error('Expense not found');
      }

      const existingExpense = expenseSnap.val();
      const now = new Date().toISOString();

      // Update expense
      const updatedExpense = {
        ...existingExpense,
        ...updates,
        updatedAt: now
      };

      await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).set(updatedExpense);

      // Recalculate monthly summary
      const monthlyTotals = await this.calculateMonthlySummary(userId, locationId, monthYear);

      return {
        success: true,
        expense: updatedExpense,
        monthlyTotals
      };
    } catch (error) {
      throw error;
    }
  }

  // Delete expense from location-month
  async deleteExpense(userId, locationId, monthYear, expenseId) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      // Check if expense exists
      const expenseSnap = await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).once('value');
      if (!expenseSnap.exists()) {
        throw new Error('Expense not found');
      }

      const expense = expenseSnap.val();
      
      // NEW: Delete attachment from S3 if exists
      if (expense.attachment && expense.attachment.s3Key) {
        try {
          // Import S3 functions from main index.js
          const { deleteFromS3 } = await import('./index.js');
          await deleteFromS3(expense.attachment.s3Key);
          console.log(`✅ Deleted attachment from S3: ${expense.attachment.s3Key}`);
        } catch (s3Error) {
          console.error('❌ Failed to delete attachment from S3:', s3Error);
          // Continue with expense deletion even if S3 deletion fails
        }
      }

      // Delete expense
      await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).remove();

      // Recalculate monthly summary
      const monthlyTotals = await this.calculateMonthlySummary(userId, locationId, monthYear);

      return {
        success: true,
        monthlyTotals
      };
    } catch (error) {
      throw error;
    }
  }

  // Import CSV expenses to location-month
  async importExpenses(userId, locationId, monthYear, expensesArray) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      const now = new Date().toISOString();
      const importedExpenses = {};
      let importedCount = 0;
      let failedCount = 0;
      const errors = [];

      // Process each expense
      for (let i = 0; i < expensesArray.length; i++) {
        try {
          const expenseData = expensesArray[i];
          const expenseId = this.db.ref().push().key;

          const expense = {
            id: expenseId,
            userId,
            locationId,
            monthYear,
            date: expenseData.date,
            category: expenseData.category.trim(),
            vendor: expenseData.vendor.trim(),
            amount: parseFloat(expenseData.amount),
            paymentMethod: expenseData.paymentMethod.trim(),
            notes: expenseData.notes ? expenseData.notes.trim() : '',
            createdAt: now,
            updatedAt: now
          };

          // Store expense
          await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}/${expenseId}`).set(expense);
          importedExpenses[expenseId] = expense;
          importedCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            row: i + 1,
            error: error.message,
            data: expensesArray[i]
          });
        }
      }

      // Recalculate monthly summary
      const monthlyTotals = await this.calculateMonthlySummary(userId, locationId, monthYear);

      return {
        success: true,
        imported: importedCount,
        failed: failedCount,
        errors,
        monthlyData: {
          locationId,
          month: monthYear,
          expenses: importedExpenses,
          monthlyTotals
        },
        monthlyTotals
      };
    } catch (error) {
      throw error;
    }
  }

  // Calculate monthly summary for location
  async calculateMonthlySummary(userId, locationId, monthYear) {
    try {
      // Fetch all expenses for the month
      const expensesSnap = await this.db.ref(`expenses/${userId}/${locationId}/${monthYear}`).once('value');
      const expenses = expensesSnap.val() || {};

      // Calculate totals
      let totalExpenses = 0;
      const expensesByCategory = {};
      const transactionCount = Object.keys(expenses).length;

      Object.values(expenses).forEach(expense => {
        totalExpenses += expense.amount || 0;
        const category = expense.category || 'Uncategorized';
        expensesByCategory[category] = (expensesByCategory[category] || 0) + (expense.amount || 0);
      });

      // Get revenue from analytics (if available)
      let totalRevenue = 0;
      try {
        const analyticsSnap = await this.db.ref(`analytics/${userId}`).once('value');
        if (analyticsSnap.exists()) {
          const analytics = analyticsSnap.val();
          Object.values(analytics).forEach(analysis => {
            // Check if this analysis is for the same month and location
            const analysisDate = new Date(analysis.analysisDate);
            const analysisMonth = `${analysisDate.getFullYear()}-${String(analysisDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (analysisMonth === monthYear && 
                (analysis.locationIds?.includes(locationId) || analysis.primaryLocationId === locationId)) {
              totalRevenue += analysis.totalRevenue || 0;
            }
          });
        }
      } catch (error) {
        console.warn('Could not fetch revenue data:', error.message);
      }

      const netProfit = totalRevenue - totalExpenses;
      const now = new Date().toISOString();

      // Store/update monthly summary
      const summary = {
        userId,
        locationId,
        monthYear,
        totalRevenue,
        totalExpenses,
        netProfit,
        expensesByCategory,
        transactionCount,
        lastUpdated: now
      };

      await this.db.ref(`monthly-summaries/${userId}/${locationId}/${monthYear}`).set(summary);

      return summary;
    } catch (error) {
      throw error;
    }
  }

  // Get location monthly summary
  async getLocationMonthlySummary(userId, locationId, monthYear) {
    try {
      // Validate user ownership
      const userLocations = await this.getUserLocations(userId);
      const location = userLocations.find(loc => loc.id === locationId);
      if (!location) {
        throw new Error('Location not found or access denied');
      }

      // Try to get existing summary first
      const summarySnap = await this.db.ref(`monthly-summaries/${userId}/${locationId}/${monthYear}`).once('value');
      if (summarySnap.exists()) {
        return summarySnap.val();
      }

      // Calculate summary if it doesn't exist
      return await this.calculateMonthlySummary(userId, locationId, monthYear);
    } catch (error) {
      throw error;
    }
  }

  // Get all monthly summaries for user
  async getAllLocationMonthlySummaries(userId) {
    try {
      const summariesSnap = await this.db.ref(`monthly-summaries/${userId}`).once('value');
      return summariesSnap.val() || {};
    } catch (error) {
      throw error;
    }
  }

  // Get expense categories for user
  async getUserExpenseCategories(userId) {
    try {
      const categoriesSnap = await this.db.ref(`expense-categories/${userId}`).once('value');
      if (categoriesSnap.exists()) {
        return categoriesSnap.val();
      }

      // Return default categories if none exist
      const defaultCategories = {
        categories: [
          'Office Supplies', 'Utilities', 'Marketing', 'Fuel/Transport',
          'Equipment', 'Maintenance', 'Insurance', 'Professional Services',
          'Rent', 'Software', 'Travel', 'Meals', 'Other'
        ],
        customCategories: [],
        lastUpdated: new Date().toISOString()
      };

      // Store default categories
      await this.db.ref(`expense-categories/${userId}`).set(defaultCategories);
      return defaultCategories;
    } catch (error) {
      throw error;
    }
  }

  // Add custom expense category
  async addExpenseCategory(userId, category) {
    try {
      const categoriesSnap = await this.db.ref(`expense-categories/${userId}`).once('value');
      let categories = categoriesSnap.val();

      if (!categories) {
        categories = {
          categories: [
            'Office Supplies', 'Utilities', 'Marketing', 'Fuel/Transport',
            'Equipment', 'Maintenance', 'Insurance', 'Professional Services',
            'Rent', 'Software', 'Travel', 'Meals', 'Other'
          ],
          customCategories: [],
          lastUpdated: new Date().toISOString()
        };
      }

      // Add to custom categories if not already exists
      if (!categories.categories.includes(category) && !categories.customCategories.includes(category)) {
        categories.customCategories.push(category);
        categories.lastUpdated = new Date().toISOString();

        await this.db.ref(`expense-categories/${userId}`).set(categories);
      }

      return {
        success: true,
        categories: [...categories.categories, ...categories.customCategories]
      };
    } catch (error) {
      throw error;
    }
  }
}

// Create singleton instance
const firebaseHandler = new FirebaseHandler();
export default firebaseHandler;
