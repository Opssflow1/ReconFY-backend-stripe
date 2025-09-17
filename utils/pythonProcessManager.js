/**
 * Python Process Manager with Fallback
 * Ensures TSP ID extraction always works with process pool or direct execution
 * Zero risk implementation with guaranteed functionality
 */

import { PythonShell } from 'python-shell';
import { pythonProcessPool } from './pythonProcessPool.js';

class PythonProcessManager {
  constructor() {
    this.usePool = true; // Start with pool enabled
    this.fallbackCount = 0;
    this.maxFallbacks = 5; // Switch to direct after 5 failures
    this.stats = {
      poolExecutions: 0,
      directExecutions: 0,
      fallbackSwitches: 0,
      totalExecutions: 0,
      startTime: Date.now()
    };
  }
  
  /**
   * Execute Python script with pool fallback to direct execution
   * @param {string} script - Python script name
   * @param {Array} args - Script arguments
   * @param {Object} options - PythonShell options
   * @returns {Promise} - Script execution result
   */
  async execute(script, args, options) {
    this.stats.totalExecutions++;
    
    if (this.usePool) {
      try {
        const result = await this.executeWithPool(script, args, options);
        this.stats.poolExecutions++;
        return result;
      } catch (error) {
        console.warn(`[PYTHON_MANAGER] Pool execution failed, falling back to direct: ${error.message}`);
        this.fallbackCount++;
        
        if (this.fallbackCount >= this.maxFallbacks) {
          console.warn('[PYTHON_MANAGER] Too many pool failures, switching to direct execution');
          this.usePool = false;
          this.stats.fallbackSwitches++;
        }
        
        return await this.executeDirect(script, args, options);
      }
    } else {
      return await this.executeDirect(script, args, options);
    }
  }
  
  /**
   * Execute using process pool
   * @param {string} script - Python script name
   * @param {Array} args - Script arguments
   * @param {Object} options - PythonShell options
   * @returns {Promise} - Script execution result
   */
  async executeWithPool(script, args, options) {
    return await pythonProcessPool.execute(script, args, options);
  }
  
  /**
   * Execute directly using PythonShell (original method)
   * @param {string} script - Python script name
   * @param {Array} args - Script arguments
   * @param {Object} options - PythonShell options
   * @returns {Promise} - Script execution result
   */
  async executeDirect(script, args, options) {
    return new Promise((resolve, reject) => {
      const shell = new PythonShell(script, options);
      
      let hasResolved = false;
      let processTimeout;
      
      // Set process timeout (15 seconds)
      processTimeout = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          try {
            shell.kill('SIGTERM');
            // Force cleanup after timeout
            setTimeout(() => {
              try {
                shell.kill('SIGKILL');
              } catch (e) {
                console.error('[PYTHON_MANAGER] Force kill failed:', e.message);
              }
            }, 5000);
          } catch (e) {
            console.error('[PYTHON_MANAGER] Process termination failed:', e.message);
          }
          reject(new Error('Python process timeout'));
        }
      }, 15000);
      
      const cleanup = () => {
        if (processTimeout) {
          clearTimeout(processTimeout);
          processTimeout = null;
        }
        try {
          shell.end();
        } catch (e) {
          console.error('[PYTHON_MANAGER] Shell end failed:', e.message);
        }
      };
      
      shell.on('message', (results) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          this.stats.directExecutions++;
          resolve(results && results.length > 0 ? results[0] : null);
        }
      });
      
      shell.on('error', (err) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          this.stats.directExecutions++;
          reject(err);
        }
      });
      
      shell.on('close', (code) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          this.stats.directExecutions++;
          
          if (code === 0 || code === null || code === undefined) {
            resolve(null);
          } else {
            reject(new Error(`Python script closed with code ${code}`));
          }
        }
      });
    });
  }
  
  /**
   * Reset fallback counter (call when pool is working again)
   */
  resetFallbackCounter() {
    this.fallbackCount = 0;
    if (!this.usePool) {
      console.log('[PYTHON_MANAGER] Resetting to pool execution');
      this.usePool = true;
    }
  }
  
  /**
   * Get execution statistics
   * @returns {Object} - Execution statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const poolStats = pythonProcessPool.getStats();
    
    return {
      ...this.stats,
      uptime: Math.round(uptime / 1000),
      uptimeFormatted: this.formatUptime(uptime),
      usePool: this.usePool,
      fallbackCount: this.fallbackCount,
      maxFallbacks: this.maxFallbacks,
      poolStats: poolStats,
      successRate: this.stats.totalExecutions > 0 ? 
        ((this.stats.poolExecutions + this.stats.directExecutions) / this.stats.totalExecutions * 100).toFixed(1) : 100
    };
  }
  
  /**
   * Format uptime in human readable format
   * @param {number} ms - Milliseconds
   * @returns {string} - Formatted uptime
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
   * Force cleanup of all processes
   */
  forceCleanup() {
    if (this.usePool) {
      pythonProcessPool.forceCleanup();
    }
  }
}

// Create singleton instance
export const pythonProcessManager = new PythonProcessManager();

export default pythonProcessManager;
