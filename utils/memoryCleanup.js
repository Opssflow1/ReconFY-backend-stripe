/**
 * Memory Cleanup Utility
 * Optimizes file processing memory usage and prevents memory leaks
 */

import fs from 'fs-extra';
import path from 'path';

export const memoryCleanup = {
  /**
   * Force garbage collection if available
   * @param {string} context - Context for logging
   * @returns {boolean} - Whether GC was successful
   */
  forceGC(context = 'Memory Cleanup') {
    if (global.gc) {
      const beforeGC = this.getMemoryStats();
      global.gc();
      const afterGC = this.getMemoryStats();
      const memoryFreed = beforeGC.heapUsed - afterGC.heapUsed;
      
      console.log(`[MEMORY] ✅ ${context}: Forced garbage collection - freed ${memoryFreed}MB`);
      return true;
    } else {
      console.log(`[MEMORY] ⚠️ ${context}: Garbage collection not available`);
      console.log('[MEMORY] 💡 To enable GC, run with: node --expose-gc index.js');
      console.log('[MEMORY] 💡 Or use: npm run dev (includes --expose-gc)');
      return false;
    }
  },
  
  /**
   * Clear file buffers after processing to free memory
   * @param {Array|Object} files - File objects or array of file objects
   */
  clearFileBuffers(files) {
    if (!files) return;
    
    const fileArray = Array.isArray(files) ? files : [files];
    
    fileArray.forEach(file => {
      if (file && file.buffer) {
        // Clear the buffer to free memory
        file.buffer = null;
        console.log(`[MEMORY] Cleared buffer for file: ${file.originalname || 'unknown'}`);
      }
    });
  },
  
  /**
   * Clear temporary files from processing
   * @param {string} tempDir - Directory containing temp files
   */
  async clearTempFiles(tempDir) {
    try {
      if (!fs.existsSync(tempDir)) {
        return;
      }
      
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter(file => file.startsWith('temp_'));
      
      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        try {
          await fs.remove(filePath);
          console.log(`[MEMORY] Cleared temp file: ${file}`);
        } catch (error) {
          console.error(`[MEMORY] Failed to clear temp file ${file}:`, error.message);
        }
      }
      
      console.log(`[MEMORY] Cleared ${tempFiles.length} temp files`);
    } catch (error) {
      console.error('[MEMORY] Temp file cleanup error:', error.message);
    }
  },
  
  /**
   * Get current memory usage statistics
   * @returns {Object} Memory usage information
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      usagePercent: Math.round((usage.heapUsed / usage.heapTotal) * 100) // %
    };
  },
  
  /**
   * Log memory usage with context
   * @param {string} context - Context description
   */
  logMemoryUsage(context = '') {
    const stats = this.getMemoryStats();
    console.log(`[MEMORY] ${context}: ${stats.heapUsed}MB / ${stats.heapTotal}MB (${stats.usagePercent}%)`);
  },
  
  /**
   * Intelligent comprehensive cleanup after file processing
   * @param {Array|Object} files - Files to clean up
   * @param {string} tempDir - Temp directory to clean
   * @param {string} context - Context for logging
   */
  async comprehensiveCleanup(files, tempDir, context = 'File Processing') {
    const startTime = Date.now();
    console.log(`[MEMORY] Starting intelligent cleanup for: ${context}`);
    
    // Log memory usage before cleanup
    const beforeStats = this.getMemoryStats();
    this.logMemoryUsage(`${context} - Before Cleanup`);
    
    // Clear file buffers
    this.clearFileBuffers(files);
    
    // Clear temp files
    if (tempDir) {
      await this.clearTempFiles(tempDir);
    }
    
    // Only force GC if memory usage is actually high
    const currentStats = this.getMemoryStats();
    if (currentStats.usagePercent > 70) {
      const gcSuccess = this.forceGC(`${context} - High Memory Usage`);
      if (!gcSuccess) {
        console.log(`[MEMORY] ⚠️ GC not available, but memory usage is high (${currentStats.usagePercent}%)`);
      }
    } else {
      console.log(`[MEMORY] ✅ Skipping GC - memory usage is healthy (${currentStats.usagePercent}%)`);
    }
    
    // Log final memory usage
    const afterStats = this.getMemoryStats();
    this.logMemoryUsage(`${context} - After Cleanup`);
    
    // Calculate cleanup effectiveness
    const memoryFreed = beforeStats.heapUsed - afterStats.heapUsed;
    const cleanupTime = Date.now() - startTime;
    
    console.log(`[MEMORY] Cleanup completed in ${cleanupTime}ms, freed ${memoryFreed}MB`);
    
    // Only warn if memory usage is genuinely high after cleanup
    if (afterStats.usagePercent > 80) {
      console.warn(`[MEMORY] ⚠️ High memory usage after cleanup: ${afterStats.usagePercent}% (${afterStats.heapUsed}MB / ${afterStats.heapTotal}MB)`);
    } else if (afterStats.usagePercent > 60) {
      console.log(`[MEMORY] ℹ️ Moderate memory usage after cleanup: ${afterStats.usagePercent}% (${afterStats.heapUsed}MB / ${afterStats.heapTotal}MB)`);
    } else {
      console.log(`[MEMORY] ✅ Healthy memory usage after cleanup: ${afterStats.usagePercent}% (${afterStats.heapUsed}MB / ${afterStats.heapTotal}MB)`);
    }
  }
};

export default memoryCleanup;
