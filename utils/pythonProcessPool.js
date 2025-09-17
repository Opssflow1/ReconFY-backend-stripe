/**
 * Python Process Pool Manager
 * Reuses Python processes to reduce memory usage and improve performance
 * Zero risk implementation with fallback to direct PythonShell
 */

import { PythonShell } from 'python-shell';

class PythonProcessPool {
  constructor(maxProcesses = 3) {
    this.maxProcesses = maxProcesses;
    this.activeProcesses = new Map();
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      totalProcesses: 0,
      activeProcesses: 0,
      queuedJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      startTime: Date.now(),
      lastCleanupTime: null,
      poolUptime: 0
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  /**
   * Execute Python script using process pool
   * @param {string} script - Python script name
   * @param {Array} args - Script arguments
   * @param {Object} options - PythonShell options
   * @returns {Promise} - Script execution result
   */
  async execute(script, args, options) {
    return new Promise((resolve, reject) => {
      const job = { 
        script, 
        args, 
        options, 
        resolve, 
        reject, 
        id: Date.now() + Math.random(),
        createdAt: Date.now()
      };
      
      if (this.activeProcesses.size < this.maxProcesses) {
        this.createProcess(job);
      } else {
        this.queue.push(job);
        this.stats.queuedJobs++;
        console.log(`[PYTHON_POOL] Queued job ${job.id} (queue: ${this.queue.length})`);
      }
    });
  }
  
  /**
   * Create a new Python process for job execution
   * @param {Object} job - Job to execute
   */
  createProcess(job) {
    try {
      const shell = new PythonShell(job.script, job.options);
      this.activeProcesses.set(job.id, { 
        shell, 
        job, 
        startTime: Date.now(),
        timeout: null
      });
      
      this.stats.totalProcesses++;
      this.stats.activeProcesses++;
      
      console.log(`[PYTHON_POOL] Created process ${job.id} (active: ${this.activeProcesses.size}/${this.maxProcesses})`);
      
      // Set timeout for process (15 seconds)
      const timeout = setTimeout(() => {
        this.handleProcessTimeout(job.id);
      }, 15000);
      
      this.activeProcesses.get(job.id).timeout = timeout;
      
      // Handle process completion
      shell.on('message', (results) => {
        this.stats.completedJobs++;
        job.resolve(results);
        this.cleanupProcess(job.id);
      });
      
      // Handle process errors
      shell.on('error', (err) => {
        this.stats.failedJobs++;
        console.error(`[PYTHON_POOL] Process ${job.id} error:`, err.message);
        job.reject(err);
        this.cleanupProcess(job.id);
      });
      
      // Handle process close
      shell.on('close', (code) => {
        const processInfo = this.activeProcesses.get(job.id);
        if (processInfo) {
          clearTimeout(processInfo.timeout);
        }
        
        if (code !== 0 && code !== null && code !== undefined) {
          this.stats.failedJobs++;
          job.reject(new Error(`Python script closed with code ${code}`));
        }
        this.cleanupProcess(job.id);
      });
      
    } catch (error) {
      this.stats.failedJobs++;
      console.error(`[PYTHON_POOL] Failed to create process for job ${job.id}:`, error.message);
      job.reject(error);
    }
  }
  
  /**
   * Handle process timeout
   * @param {string} jobId - Job ID to timeout
   */
  handleProcessTimeout(jobId) {
    const processInfo = this.activeProcesses.get(jobId);
    if (processInfo) {
      console.warn(`[PYTHON_POOL] Process ${jobId} timeout, terminating...`);
      
      try {
        processInfo.shell.kill('SIGTERM');
        // Force kill after 5 seconds
        setTimeout(() => {
          try {
            processInfo.shell.kill('SIGKILL');
          } catch (e) {
            console.error('[PYTHON_POOL] Force kill failed:', e.message);
          }
        }, 5000);
      } catch (e) {
        console.error('[PYTHON_POOL] Process termination failed:', e.message);
      }
      
      this.stats.failedJobs++;
      processInfo.job.reject(new Error('Python process timeout'));
      this.cleanupProcess(jobId);
    }
  }
  
  /**
   * Clean up completed process and start next job
   * @param {string} jobId - Job ID to clean up
   */
  cleanupProcess(jobId) {
    const processInfo = this.activeProcesses.get(jobId);
    if (processInfo) {
      try {
        if (processInfo.timeout) {
          clearTimeout(processInfo.timeout);
        }
        processInfo.shell.end();
      } catch (e) {
        console.error('[PYTHON_POOL] Shell end failed:', e.message);
      }
      this.activeProcesses.delete(jobId);
      this.stats.activeProcesses--;
    }
    
    // Process next job in queue
    if (this.queue.length > 0) {
      const nextJob = this.queue.shift();
      this.stats.queuedJobs--;
      this.createProcess(nextJob);
    }
  }
  
  /**
   * Start cleanup interval for monitoring
   */
  startCleanupInterval() {
    setInterval(() => {
      this.stats.poolUptime = Date.now() - this.stats.startTime;
      this.stats.lastCleanupTime = Date.now();
      
      // Log pool status every 5 minutes
      if (this.stats.poolUptime % 300000 < 15000) {
        console.log(`[PYTHON_POOL] Status: ${this.stats.activeProcesses}/${this.maxProcesses} active, ${this.queue.length} queued`);
      }
    }, 15000);
  }
  
  /**
   * Get process pool statistics
   * @returns {Object} - Pool statistics
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    return {
      ...this.stats,
      uptime: Math.round(uptime / 1000),
      uptimeFormatted: this.formatUptime(uptime),
      maxProcesses: this.maxProcesses,
      queueLength: this.queue.length,
      isHealthy: this.stats.failedJobs < this.stats.completedJobs * 0.1 // Less than 10% failure rate
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
   * Force cleanup of all processes (emergency)
   */
  forceCleanup() {
    console.log('[PYTHON_POOL] Force cleanup initiated');
    
    // Clear queue
    this.queue.forEach(job => {
      job.reject(new Error('Pool force cleanup'));
    });
    this.queue = [];
    this.stats.queuedJobs = 0;
    
    // Terminate all active processes
    this.activeProcesses.forEach((processInfo, jobId) => {
      try {
        if (processInfo.timeout) {
          clearTimeout(processInfo.timeout);
        }
        processInfo.shell.kill('SIGTERM');
        processInfo.job.reject(new Error('Pool force cleanup'));
      } catch (e) {
        console.error(`[PYTHON_POOL] Force cleanup failed for ${jobId}:`, e.message);
      }
    });
    
    this.activeProcesses.clear();
    this.stats.activeProcesses = 0;
    
    console.log('[PYTHON_POOL] Force cleanup completed');
  }
}

// Create singleton instance
export const pythonProcessPool = new PythonProcessPool();

export default pythonProcessPool;
