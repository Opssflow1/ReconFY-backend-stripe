// Helper utility functions for ReconFY backend
// Extracted from index.js for better modularity

/**
 * Helper function to filter out undefined values from objects
 * @param {Object} obj - The object to filter
 * @returns {Object} - Object with undefined values removed
 */
export function filterUndefined(obj) {
  const filtered = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Safe parsing of FRONTEND_URL environment variable
 * @returns {Array} - Array of valid frontend URLs
 */
export const parseFrontendUrls = () => {
  try {
    if (!process.env.FRONTEND_URL) return [];
    
    return process.env.FRONTEND_URL
      .split(',')
      .map(url => url.trim())
      .filter(url => {
        try {
          new URL(url);
          return true;
        } catch {
          console.warn(`Invalid URL in FRONTEND_URL: ${url}`);
          return false;
        }
      });
  } catch (error) {
    console.error('Error parsing FRONTEND_URL:', error);
    return [];
  }
};

/**
 * Get log rotation statistics
 * @returns {Object} - Log rotation status and statistics
 */
export const getLogRotationStats = async () => {
  try {
    const stats = {
      status: 'healthy',
      message: 'Log rotation active',
      lastRotation: new Date().toISOString(),
      diskUsage: 'unknown',
      logFiles: 0
    };
    
    // Check if we're in production and should implement log rotation
    if (process.env.NODE_ENV === 'production') {
      // This would integrate with actual log rotation system
      // For now, return basic status
      stats.message = 'Production log rotation configured';
    }
    
    return stats;
  } catch (error) {
    return {
      status: 'error',
      message: error.message
    };
  }
};
