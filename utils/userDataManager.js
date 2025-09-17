// User data management utilities for ReconFY backend
// Extracted from index.js for better modularity

import { filterUndefined } from "./helpers.js";

/**
 * User Data Manager - Centralized user data management to eliminate duplication
 */
export const userDataManager = {
  /**
   * Get user profile data (centralized, no duplication)
   * @param {string} userId - The user ID
   * @param {Object} db - Firebase database reference
   * @returns {Object|null} - Normalized user data or null if not found
   */
  async getUserProfile(userId, db) {
    try {
      const userSnap = await db.ref(`users/${userId}`).once('value');
      const userData = userSnap.val();
      
      if (!userData) return null;
      
      // Return normalized structure
      return {
        id: userId,
        email: userData.email || null,
        name: userData.name || null,
        company: userData.company || null,
        subscription: userData.subscription || null,
        locations: userData.locations || {},
        legalAcceptance: userData.legalAcceptance || null,
        createdAt: userData.createdAt || null,
        updatedAt: userData.updatedAt || null
      };
    } catch (error) {
      console.error(`Error fetching user profile for ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Update user profile data (centralized, no duplication)
   * @param {string} userId - The user ID
   * @param {Object} updates - The updates to apply
   * @param {Object} db - Firebase database reference
   * @returns {boolean} - Success status
   */
  async updateUserProfile(userId, updates, db) {
    try {
      const filteredUpdates = filterUndefined(updates);
      filteredUpdates.updatedAt = new Date().toISOString();
      
      await db.ref(`users/${userId}`).update(filteredUpdates);
      console.log(`Updated user profile for ${userId}`);
      
      return true;
    } catch (error) {
      console.error(`Error updating user profile for ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Validate user data consistency
   * @param {string} userId - The user ID
   * @param {Object} db - Firebase database reference
   * @returns {boolean} - Validation result
   */
  async validateUserDataConsistency(userId, db) {
    try {
      const userData = await this.getUserProfile(userId, db);
      if (!userData) return false;
      
      // Check for data consistency issues
      const issues = [];
      
      if (userData.subscription && !userData.subscription.stripeCustomerId) {
        issues.push('Subscription missing Stripe customer ID');
      }
      
      if (userData.locations && Object.keys(userData.locations).length > 0) {
        for (const [locationId, location] of Object.entries(userData.locations)) {
          if (!location.tspId) {
            issues.push(`Location ${locationId} missing TSP ID`);
          }
        }
      }
      
      if (issues.length > 0) {
        console.warn(`Data consistency issues for user ${userId}:`, issues);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error(`Error validating user data consistency for ${userId}:`, error);
      return false;
    }
  }
};
