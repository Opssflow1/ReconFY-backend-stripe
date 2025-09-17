// Stripe helper functions for ReconFY backend
// Extracted from index.js for better modularity

/**
 * Get Stripe price ID based on plan type
 * @param {string} planType - The plan type (STARTER, GROWTH, PRO, ENTERPRISE)
 * @returns {string} - The Stripe price ID
 */
export function getPriceId(planType) {
  const priceIds = {
    STARTER: process.env.STRIPE_STARTER_PRICE_ID,
    GROWTH: process.env.STRIPE_GROWTH_PRICE_ID,
    PRO: process.env.STRIPE_PRO_PRICE_ID,
    ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID
  };
  return priceIds[planType];
}

/**
 * Get tier from Stripe price ID
 * @param {string} priceId - The Stripe price ID
 * @returns {string} - The plan tier
 */
export function getTierFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'STARTER';
  if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) return 'GROWTH';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'ENTERPRISE';
  return 'UNKNOWN';
}

/**
 * Get tier hierarchy number for comparison
 * @param {string} tier - The tier name
 * @returns {number} - The hierarchy number (0-4)
 */
export function getTierHierarchy(tier) {
  const hierarchy = {
    'TRIAL': 0,
    'STARTER': 1,
    'GROWTH': 2,
    'PRO': 3,
    'ENTERPRISE': 4
  };
  return hierarchy[tier] || 0;
}

/**
 * Get plan price for audit logging
 * @param {string} planType - The plan type
 * @returns {number} - The plan price in dollars
 */
export function getPlanPrice(planType) {
  const prices = {
    'TRIAL': 0,
    'STARTER': 9,
    'GROWTH': 29,
    'PRO': 99,
    'ENTERPRISE': 299
  };
  return prices[planType] || 0;
}
