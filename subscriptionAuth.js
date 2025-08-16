/**
 * Subscription Validation Middleware for OpssFlow
 * Ensures users have active subscriptions before accessing protected features
 */

// Database reference will be passed in from the main app
let db = null;

// Function to set database reference
export const setDatabase = (database) => {
  db = database;
};

// Subscription validation middleware
const subscriptionAuth = (requiredStatus = 'ACTIVE') => {
  return async (req, res, next) => {
    try {
      const userId = req.user.sub;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Fetch user subscription from database
      const subSnap = await db.ref(`users/${userId}/subscription`).once('value');
      const subscription = subSnap.val();

      if (!subscription) {
        return res.status(403).json({ 
          error: 'No subscription found',
          code: 'NO_SUBSCRIPTION'
        });
      }

      // Check subscription status
      const status = subscription.status || subscription.subscriptionStatus;
      if (!status) {
        return res.status(403).json({ 
          error: 'Invalid subscription status',
          code: 'INVALID_STATUS'
        });
      }

      // Check if subscription is active
      const isActive = subscription.isActive === true;
      if (!isActive) {
        return res.status(403).json({ 
          error: 'Subscription is not active',
          code: 'INACTIVE_SUBSCRIPTION'
        });
      }

      // Check subscription end date
      const endDate = subscription.endDate ? new Date(subscription.endDate) : null;
      const now = new Date();
      
      if (endDate && endDate <= now) {
        return res.status(403).json({ 
          error: 'Subscription has expired',
          code: 'EXPIRED_SUBSCRIPTION'
        });
      }

      // Check if status matches required status
      if (requiredStatus !== 'ANY' && status !== requiredStatus && status !== 'TRIAL') {
        return res.status(403).json({ 
          error: `Subscription status '${status}' does not meet requirements`,
          code: 'INSUFFICIENT_STATUS'
        });
      }

      // Add subscription info to request for use in endpoints
      req.subscription = {
        ...subscription,
        userId,
        daysRemaining: endDate ? Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))) : 0
      };

      next();
    } catch (error) {
      console.error('Subscription validation error:', error);
      return res.status(500).json({ 
        error: 'Failed to validate subscription',
        code: 'VALIDATION_ERROR'
      });
    }
  };
};

// Specific middleware for different subscription requirements
export const requireActiveSubscription = subscriptionAuth('ACTIVE');
export const requireAnySubscription = subscriptionAuth('ANY');
export const requirePaidSubscription = subscriptionAuth('ACTIVE'); // Excludes TRIAL

export default subscriptionAuth;
