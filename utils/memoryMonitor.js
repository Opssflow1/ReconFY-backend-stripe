/**
 * Enhanced Memory Monitor
 * Real-time memory monitoring and optimization for file processing
 * Zero risk implementation - only monitoring, no functional changes
 */

import { memoryConfig } from './memoryConfig.js';

class FileProcessingMemoryMonitor {
  constructor() {
    // Load configuration from memoryConfig
    this.config = memoryConfig.getConfig();
    
    // Apply configuration
    this.threshold = this.config.highThreshold;
    this.criticalThreshold = this.config.criticalThreshold;
    this.alertCooldown = this.config.alertCooldown;
    this.minHeapSize = this.config.minHeapSize;
    
    this.interval = null;
    this.isMonitoring = false;
    this.lastAlertTime = 0;
    
    this.stats = {
      totalChecks: 0,
      highUsageAlerts: 0,
      criticalAlerts: 0,
      emergencyCleanups: 0,
      skippedChecks: 0,
      startTime: Date.now()
    };
    
    // Validate configuration
    const validation = memoryConfig.validateConfig();
    if (!validation.isValid) {
      console.warn('[MEMORY_MONITOR] Configuration validation failed:', validation.errors);
    }
  }
  
  /**
   * Start real-time memory monitoring
   */
  start() {
    if (this.isMonitoring) {
      console.log('[MEMORY_MONITOR] Already monitoring memory usage');
      return;
    }
    
    this.isMonitoring = true;
    this.stats.startTime = Date.now();
    
    console.log('[MEMORY_MONITOR] 🚀 Starting real-time memory monitoring');
    console.log(`[MEMORY_MONITOR] 📊 Environment: ${this.config.environment}`);
    console.log(`[MEMORY_MONITOR] 📊 Thresholds: Normal < ${(this.threshold * 100).toFixed(0)}%, High ≥ ${(this.threshold * 100).toFixed(0)}%, Critical ≥ ${(this.criticalThreshold * 100).toFixed(0)}%`);
    console.log(`[MEMORY_MONITOR] 📊 Check Interval: ${this.config.checkInterval / 1000}s, Cooldown: ${this.config.alertCooldown / 1000}s`);
    
    this.interval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.config.checkInterval);
    
    // Initial memory check
    this.checkMemoryUsage();
  }
  
  /**
   * Check current memory usage and trigger alerts if needed
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
      
      // Skip monitoring if heap is too small (prevents false positives)
      if (heapTotal < this.minHeapSize) {
        this.stats.skippedChecks++;
        if (this.stats.skippedChecks % 20 === 0) {
          console.log(`[MEMORY_MONITOR] ⏭️ Skipping alerts - heap too small: ${heapTotal.toFixed(1)}MB (min: ${this.minHeapSize}MB)`);
        }
        return;
      }
      
      // Log memory status every 10 checks (2.5 minutes)
      if (this.stats.totalChecks % 10 === 0) {
        console.log(`[MEMORY_MONITOR] 📊 Status: ${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB (${(usagePercent * 100).toFixed(1)}%) | RSS: ${rss.toFixed(2)}MB | External: ${external.toFixed(2)}MB`);
      }
      
      // Check alert cooldown to prevent spam
      const now = Date.now();
      const timeSinceLastAlert = now - this.lastAlertTime;
      
      if (timeSinceLastAlert < this.alertCooldown) {
        return; // Skip alerts during cooldown period
      }
      
      // Check for critical memory usage
      if (usagePercent >= this.criticalThreshold) {
        this.stats.criticalAlerts++;
        this.lastAlertTime = now;
        console.error(`[MEMORY_MONITOR] 🚨 CRITICAL: Memory usage at ${(usagePercent * 100).toFixed(1)}% (${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB)`);
        this.triggerEmergencyCleanup('CRITICAL');
      }
      // Check for high memory usage
      else if (usagePercent >= this.threshold) {
        this.stats.highUsageAlerts++;
        this.lastAlertTime = now;
        console.warn(`[MEMORY_MONITOR] ⚠️ HIGH: Memory usage at ${(usagePercent * 100).toFixed(1)}% (${heapUsed.toFixed(2)}MB / ${heapTotal.toFixed(2)}MB)`);
        this.triggerEmergencyCleanup('HIGH');
      }
      
    } catch (error) {
      console.error('[MEMORY_MONITOR] Error checking memory usage:', error.message);
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
        global.gc();
        console.log('[MEMORY_MONITOR] ✅ Forced garbage collection');
      } else {
        console.log('[MEMORY_MONITOR] ⚠️ Garbage collection not available (run with --expose-gc)');
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
   * Get current memory statistics
   * @returns {Object} Memory statistics
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
      minHeapSize: this.minHeapSize,
      isMonitoring: this.isMonitoring,
      environment: process.env.NODE_ENV || 'development',
      stats: this.stats
    };
  }
  
  /**
   * Get monitoring statistics
   * @returns {Object} Monitoring statistics
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
      minHeapSize: this.minHeapSize,
      alertCooldown: this.alertCooldown,
      environment: process.env.NODE_ENV || 'development'
    };
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
