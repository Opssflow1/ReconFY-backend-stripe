/**
 * Memory Cleanup Utility
 * Optimizes file processing memory usage and prevents memory leaks
 */

import fs from 'fs-extra';
import path from 'path';

export const memoryCleanup = {
  /**
   * Force garbage collection if available
   */
  forceGC() {
    if (global.gc) {
      global.gc();
      console.log('[MEMORY] Forced garbage collection');
    } else {
      console.log('[MEMORY] Garbage collection not available (run with --expose-gc)');
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
   * Comprehensive cleanup after file processing
   * @param {Array|Object} files - Files to clean up
   * @param {string} tempDir - Temp directory to clean
   * @param {string} context - Context for logging
   */
  async comprehensiveCleanup(files, tempDir, context = 'File Processing') {
    console.log(`[MEMORY] Starting cleanup for: ${context}`);
    
    // Log memory usage before cleanup
    this.logMemoryUsage(`${context} - Before Cleanup`);
    
    // Clear file buffers
    this.clearFileBuffers(files);
    
    // Clear temp files
    if (tempDir) {
      await this.clearTempFiles(tempDir);
    }
    
    // Force garbage collection
    this.forceGC();
    
    // Log final memory usage
    this.logMemoryUsage(`${context} - After Cleanup`);
    
    // Check if memory usage is high after cleanup
    const stats = this.getMemoryStats();
    if (stats.usagePercent > 75) {
      console.warn(`[MEMORY] ⚠️ High memory usage after cleanup: ${stats.usagePercent}%`);
    }
  }
};

export default memoryCleanup;
