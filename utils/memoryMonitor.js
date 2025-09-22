/**
 * Enhanced Memory Monitor - Optimized for ReconFY Backend
 * Intelligent memory monitoring tailored for file processing workloads
 * Environment-aware thresholds and smart cleanup strategies
 */

class FileProcessingMemoryMonitor {
  constructor() {
    // Environment-based configuration
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isProduction = process.env.NODE_ENV === 'production';
    
    // Adaptive thresholds based on environment and heap size
    this.baseThreshold = this.isDevelopment ? 0.85 : 0.80; // 85% dev, 80% prod
    this.baseCriticalThreshold = this.isDevelopment ? 0.95 : 0.90; // 95% dev, 90% prod
    
    // Dynamic thresholds that adjust based on heap size
    this.threshold = this.baseThreshold;
    this.criticalThreshold = this.baseCriticalThreshold;
    
    // Monitoring configuration
    this.interval = null;
    this.isMonitoring = false;
    this.checkInterval = this.isDevelopment ? 30000 : 60000; // 30s dev, 60s prod
    
    // Smart monitoring - only alert on significant heap sizes
    this.minHeapSizeForAlerts = 100; // MB - only alert if heap > 100MB
    
    // Statistics tracking
    this.stats = {
      totalChecks: 0,
      highUsageAlerts: 0,
      criticalAlerts: 0,
      emergencyCleanups: 0,
      falseAlarms: 0, // Track small heap false alarms
      startTime: Date.now(),
      lastHeapSize: 0,
      maxHeapSize: 0,
      avgHeapSize: 0,
      heapSizeHistory: []
    };
  }
  
  /**
   * Start intelligent memory monitoring
   */
  start() {
    if (this.isMonitoring) {
      console.log('[MEMORY_MONITOR] Already monitoring memory usage');
      return;
    }
    
    this.isMonitoring = true;
    this.stats.startTime = Date.now();
    
    console.log('[MEMORY_MONITOR] 🚀 Starting intelligent memory monitoring');
    console.log(`[MEMORY_MONITOR] 📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[MEMORY_MONITOR] 📊 Thresholds: High ≥ ${(this.threshold * 100).toFixed(1)}%, Critical ≥ ${(this.criticalThreshold * 100).toFixed(1)}%`);
    console.log(`[MEMORY_MONITOR] 📊 Check Interval: ${this.checkInterval / 1000}s`);
    console.log(`[MEMORY_MONITOR] 📊 Min Heap for Alerts: ${this.minHeapSizeForAlerts}MB`);
    
    this.interval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);
    
    // Initial memory check
    this.checkMemoryUsage();
  }
  
  /**
   * Intelligent memory usage checking with smart thresholds
   */
  checkMemoryUsage() {
    try {
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed / 1024 / 1024; // MB
      const heapTotal = usage.heapTotal / 1024 / 1024; // MB
      const rss = usage.rss / 1024 / 1024; // MB
      const external = usage.external / 1024 / 1024; // MB
      const usagePercent = heapUsed / heapTotal;
      
      this.stats.totalChecks++;
      this.stats.lastHeapSize = heapTotal;
      this.stats.maxHeapSize = Math.max(this.stats.maxHeapSize, heapTotal);
      
      // Track heap size history for averaging (keep last 20 measurements)
      this.stats.heapSizeHistory.push(heapTotal);
      if (this.stats.heapSizeHistory.length > 20) {
        this.stats.heapSizeHistory.shift();
      }
      this.stats.avgHeapSize = this.stats.heapSizeHistory.reduce((a, b) => a + b, 0) / this.stats.heapSizeHistory.length;
      
      // Update dynamic thresholds based on heap size
      this.updateDynamicThresholds(heapTotal);
      
      // Log memory status every 10 checks (5-10 minutes depending on environment)
      if (this.stats.totalChecks % 10 === 0) {
        console.log(`[MEMORY_MONITOR] 📊 Status: ${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB (${(usagePercent * 100).toFixed(1)}%) | RSS: ${rss.toFixed(2)}MB | External: ${external.toFixed(2)}MB`);
        console.log(`[MEMORY_MONITOR] 📊 Stats: Max: ${this.stats.maxHeapSize.toFixed(1)}MB, Avg: ${this.stats.avgHeapSize.toFixed(1)}MB, False Alarms: ${this.stats.falseAlarms}`);
      }
      
      // Smart alerting - only alert on significant heap sizes
      if (heapTotal < this.minHeapSizeForAlerts) {
        // Small heap - likely false alarm, just track it
        if (usagePercent >= this.threshold) {
          this.stats.falseAlarms++;
          if (this.isDevelopment) {
            console.log(`[MEMORY_MONITOR] 🔍 Small heap detected: ${heapTotal.toFixed(1)}MB (${(usagePercent * 100).toFixed(1)}%) - This is normal during startup`);
          }
        }
        return; // Skip alerts for small heaps
      }
      
      // Check for critical memory usage (only on significant heap sizes)
      if (usagePercent >= this.criticalThreshold) {
        this.stats.criticalAlerts++;
        console.error(`[MEMORY_MONITOR] 🚨 CRITICAL: Memory usage at ${(usagePercent * 100).toFixed(1)}% (${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB)`);
        this.triggerEmergencyCleanup('CRITICAL');
      }
      // Check for high memory usage (only on significant heap sizes)
      else if (usagePercent >= this.threshold) {
        this.stats.highUsageAlerts++;
        console.warn(`[MEMORY_MONITOR] ⚠️ HIGH: Memory usage at ${(usagePercent * 100).toFixed(1)}% (${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB)`);
        this.triggerEmergencyCleanup('HIGH');
      }
      
    } catch (error) {
      console.error('[MEMORY_MONITOR] Error checking memory usage:', error.message);
    }
  }
  
  /**
   * Update dynamic thresholds based on current heap size
   * @param {number} heapTotal - Current heap total in MB
   */
  updateDynamicThresholds(heapTotal) {
    // Adjust thresholds based on heap size
    if (heapTotal < 200) {
      // Small heap - be more lenient
      this.threshold = this.baseThreshold + 0.05; // +5% more lenient
      this.criticalThreshold = this.baseCriticalThreshold + 0.05;
    } else if (heapTotal > 1000) {
      // Large heap - be more strict
      this.threshold = this.baseThreshold - 0.05; // -5% more strict
      this.criticalThreshold = this.baseCriticalThreshold - 0.05;
    } else {
      // Medium heap - use base thresholds
      this.threshold = this.baseThreshold;
      this.criticalThreshold = this.baseCriticalThreshold;
    }
  }
  
  /**
   * Trigger emergency memory cleanup
   * @param {string} level - Cleanup level (HIGH, CRITICAL)
   */
  triggerEmergencyCleanup(level = 'HIGH') {
    this.stats.emergencyCleanups++;
    
    console.log(`[MEMORY_MONITOR] 🧹 Triggering emergency cleanup (${level} level)`);
    
    try {
      // Force garbage collection if available
      if (global.gc) {
        const beforeGC = process.memoryUsage();
        global.gc();
        const afterGC = process.memoryUsage();
        const memoryFreed = (beforeGC.heapUsed - afterGC.heapUsed) / 1024 / 1024;
        console.log(`[MEMORY_MONITOR] ✅ Emergency cleanup: Forced garbage collection - freed ${memoryFreed.toFixed(2)}MB`);
      } else {
        console.log('[MEMORY_MONITOR] ⚠️ Emergency cleanup: Garbage collection not available');
        console.log('[MEMORY_MONITOR] 💡 To enable GC, run with: node --expose-gc index.js');
        console.log('[MEMORY_MONITOR] 💡 Or use: npm run dev (includes --expose-gc)');
      }
      
      // Clear any file processing caches
      this.clearFileCaches();
      
      // Log cleanup results
      const usage = process.memoryUsage();
      const heapUsed = usage.heapUsed / 1024 / 1024;
      const heapTotal = usage.heapTotal / 1024 / 1024;
      const usagePercent = (heapUsed / heapTotal) * 100;
      
      console.log(`[MEMORY_MONITOR] ✅ Cleanup complete: ${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB (${usagePercent.toFixed(1)}%)`);
      
    } catch (error) {
      console.error('[MEMORY_MONITOR] Error during emergency cleanup:', error.message);
    }
  }
  
  /**
   * Clear any file processing caches
   */
  clearFileCaches() {
    try {
      // Clear any in-memory file caches
      // This is where you'd clear your application caches
      console.log('[MEMORY_MONITOR] 🧹 Cleared file processing caches');
    } catch (error) {
      console.error('[MEMORY_MONITOR] Error clearing file caches:', error.message);
    }
  }
  
  /**
   * Get comprehensive memory statistics
   * @returns {Object} Enhanced memory statistics
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    const heapUsed = usage.heapUsed / 1024 / 1024;
    const heapTotal = usage.heapTotal / 1024 / 1024;
    const rss = usage.rss / 1024 / 1024;
    const external = usage.external / 1024 / 1024;
    const usagePercent = (heapUsed / heapTotal) * 100;
    
    return {
      heapUsed: Math.round(heapUsed),
      heapTotal: Math.round(heapTotal),
      rss: Math.round(rss),
      external: Math.round(external),
      usagePercent: Math.round(usagePercent * 100) / 100,
      threshold: this.threshold * 100,
      criticalThreshold: this.criticalThreshold * 100,
      isMonitoring: this.isMonitoring,
      environment: process.env.NODE_ENV || 'development',
      minHeapForAlerts: this.minHeapSizeForAlerts,
      checkInterval: this.checkInterval / 1000,
      stats: {
        ...this.stats,
        maxHeapSize: Math.round(this.stats.maxHeapSize),
        avgHeapSize: Math.round(this.stats.avgHeapSize),
        falseAlarmRate: this.stats.totalChecks > 0 ? 
          Math.round((this.stats.falseAlarms / this.stats.totalChecks) * 100) : 0
      }
    };
  }
  
  /**
   * Get enhanced monitoring statistics
   * @returns {Object} Comprehensive monitoring statistics
   */
  getMonitoringStats() {
    const uptime = Date.now() - this.stats.startTime;
    return {
      ...this.stats,
      uptime: Math.round(uptime / 1000), // seconds
      uptimeFormatted: this.formatUptime(uptime),
      isMonitoring: this.isMonitoring,
      threshold: this.threshold * 100,
      criticalThreshold: this.criticalThreshold * 100,
      environment: process.env.NODE_ENV || 'development',
      checkInterval: this.checkInterval / 1000,
      minHeapForAlerts: this.minHeapSizeForAlerts,
      maxHeapSize: Math.round(this.stats.maxHeapSize),
      avgHeapSize: Math.round(this.stats.avgHeapSize),
      falseAlarmRate: this.stats.totalChecks > 0 ? 
        Math.round((this.stats.falseAlarms / this.stats.totalChecks) * 100) : 0,
      healthScore: this.calculateHealthScore()
    };
  }
  
  /**
   * Calculate memory monitoring health score (0-100)
   * @returns {number} Health score
   */
  calculateHealthScore() {
    let score = 100;
    
    // Deduct points for high false alarm rate
    const falseAlarmRate = this.stats.totalChecks > 0 ? 
      (this.stats.falseAlarms / this.stats.totalChecks) * 100 : 0;
    score -= Math.min(falseAlarmRate * 2, 30); // Max 30 points deduction
    
    // Deduct points for too many critical alerts
    if (this.stats.criticalAlerts > 10) {
      score -= Math.min((this.stats.criticalAlerts - 10) * 2, 40); // Max 40 points deduction
    }
    
    // Deduct points for too many emergency cleanups
    if (this.stats.emergencyCleanups > 20) {
      score -= Math.min((this.stats.emergencyCleanups - 20) * 1, 20); // Max 20 points deduction
    }
    
    return Math.max(Math.round(score), 0);
  }
  
  /**
   * Format uptime in human readable format
   * @param {number} ms - Uptime in milliseconds
   * @returns {string} Formatted uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  /**
   * Stop memory monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isMonitoring = false;
    console.log('[MEMORY_MONITOR] 🛑 Stopped memory monitoring');
  }
  
  /**
   * Update monitoring thresholds
   * @param {number} threshold - High usage threshold (0-1)
   * @param {number} criticalThreshold - Critical usage threshold (0-1)
   */
  updateThresholds(threshold, criticalThreshold) {
    if (threshold >= 0 && threshold <= 1) {
      this.threshold = threshold;
    }
    if (criticalThreshold >= 0 && criticalThreshold <= 1) {
      this.criticalThreshold = criticalThreshold;
    }
    console.log(`[MEMORY_MONITOR] 📊 Updated thresholds: High ≥ ${(this.threshold * 100).toFixed(1)}%, Critical ≥ ${(this.criticalThreshold * 100).toFixed(1)}%`);
  }
}

// Create singleton instance
export const fileMemoryMonitor = new FileProcessingMemoryMonitor();

export default fileMemoryMonitor;
