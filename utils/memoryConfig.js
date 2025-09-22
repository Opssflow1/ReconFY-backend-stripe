/**
 * Memory Configuration Utility
 * Environment-based memory management configuration
 */

export const memoryConfig = {
  /**
   * Get memory configuration based on environment
   */
  getConfig() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isStaging = process.env.NODE_ENV === 'staging';
    
    // Base configuration
    const config = {
      // Memory thresholds
      highThreshold: isDevelopment ? 0.85 : 0.75,
      criticalThreshold: isDevelopment ? 0.95 : 0.90,
      
      // Monitoring settings
      checkInterval: isDevelopment ? 30000 : 15000, // 30s dev, 15s prod
      alertCooldown: isDevelopment ? 300000 : 60000, // 5min dev, 1min prod
      minHeapSize: 100, // MB
      
      // File processing limits
      maxFileSize: isProduction ? 25 * 1024 * 1024 : 10 * 1024 * 1024, // 25MB prod, 10MB dev
      maxFiles: isProduction ? 5 : 3,
      
      // Memory limits
      maxHeapSize: isProduction ? 1024 : 512, // MB
      maxRSS: isProduction ? 2048 : 1024, // MB
      
      // Cleanup settings
      cleanupDelay: 100, // ms
      forceGC: true,
      
      // Logging
      verboseLogging: isDevelopment,
      logInterval: 10, // Log every N checks
      
      environment: process.env.NODE_ENV || 'development'
    };
    
    return config;
  },
  
  /**
   * Get Node.js memory arguments for startup
   */
  getNodeArgs() {
    const config = this.getConfig();
    const args = [
      `--max-old-space-size=${config.maxHeapSize}`,
      '--expose-gc'
    ];
    
    if (config.environment === 'production') {
      args.push('--optimize-for-size');
    }
    
    return args;
  },
  
  /**
   * Validate memory configuration
   */
  validateConfig() {
    const config = this.getConfig();
    const errors = [];
    
    if (config.highThreshold >= config.criticalThreshold) {
      errors.push('High threshold must be less than critical threshold');
    }
    
    if (config.minHeapSize < 50) {
      errors.push('Minimum heap size should be at least 50MB');
    }
    
    if (config.maxFileSize > 100 * 1024 * 1024) {
      errors.push('Maximum file size should not exceed 100MB');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },
  
  /**
   * Get memory recommendations for current environment
   */
  getRecommendations() {
    const config = this.getConfig();
    const recommendations = [];
    
    if (config.environment === 'development') {
      recommendations.push('Development mode: Higher thresholds, longer cooldowns');
      recommendations.push('Consider using --max-old-space-size=256 for development');
    } else if (config.environment === 'production') {
      recommendations.push('Production mode: Lower thresholds, shorter cooldowns');
      recommendations.push('Consider using --max-old-space-size=1024 for production');
      recommendations.push('Enable PM2 clustering for better memory distribution');
    }
    
    return recommendations;
  }
};

export default memoryConfig;
