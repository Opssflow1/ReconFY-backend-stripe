// Circuit breaker pattern for webhook processing with deduplication
// Extracted from index.js for better modularity

/**
 * Webhook Circuit Breaker - Prevents cascading failures and handles deduplication
 */
export const webhookCircuitBreaker = {
  failureThreshold: 5,
  recoveryTimeout: 60000, // 1 minute
  failures: 0,
  lastFailureTime: 0,
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  
  // ✅ CRITICAL FIX: Webhook deduplication to prevent spam
  processedWebhooks: new Map(), // Changed from Set to Map to track timestamps
  webhookTimeout: 5000, // 5 seconds
  
  // ✅ MEMORY MANAGEMENT: Periodic cleanup to prevent memory leaks
  cleanupInterval: null,
  
  /**
   * Execute operation with circuit breaker protection
   * @param {Function} operation - The operation to execute
   * @param {string} webhookId - Optional webhook ID for deduplication
   * @returns {Promise} - Operation result
   */
  async execute(operation, webhookId) {
    // Start periodic cleanup if not already started
    this.startPeriodicCleanup();
    
    // Check if webhook was recently processed
    if (webhookId && this.processedWebhooks.has(webhookId)) {
      const timestamp = this.processedWebhooks.get(webhookId);
      const age = Date.now() - timestamp;
      console.log(`[WEBHOOK_DEDUP] Skipping duplicate webhook: ${webhookId} (age: ${age}ms)`);
      return { success: true, reason: 'duplicate_webhook' };
    }
    
    // Add webhook to processed map with timestamp
    if (webhookId) {
      this.processedWebhooks.set(webhookId, Date.now());
      console.log(`[WEBHOOK_DEDUP] Added webhook to deduplication cache: ${webhookId} (total: ${this.processedWebhooks.size})`);
    }
    
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        console.log('[CIRCUIT_BREAKER] Webhook circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Webhook circuit breaker is OPEN - too many failures');
      }
    }
    
    try {
      const result = await operation();
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
        console.log('[CIRCUIT_BREAKER] Webhook circuit breaker reset to CLOSED');
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        console.error(`[CIRCUIT_BREAKER] Webhook circuit breaker opened after ${this.failures} failures`);
      }
      
      throw error;
    }
  },

  /**
   * Start periodic cleanup to prevent memory leaks
   */
  startPeriodicCleanup() {
    if (this.cleanupInterval) return; // Already started
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredWebhooks();
    }, 10000); // Cleanup every 10 seconds
    
    console.log('[CIRCUIT_BREAKER] Started periodic cleanup for webhook deduplication');
  },

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[CIRCUIT_BREAKER] Stopped periodic cleanup for webhook deduplication');
    }
  },

  /**
   * Clean up expired webhook IDs from memory
   */
  cleanupExpiredWebhooks() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [webhookId, timestamp] of this.processedWebhooks.entries()) {
      if (now - timestamp > this.webhookTimeout) {
        this.processedWebhooks.delete(webhookId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[CIRCUIT_BREAKER] Cleaned up ${cleanedCount} expired webhook IDs. Current size: ${this.processedWebhooks.size}`);
    }
  },

  /**
   * Get current statistics
   */
  getStats() {
    return {
      state: this.state,
      failures: this.failures,
      processedWebhooksCount: this.processedWebhooks.size,
      lastFailureTime: this.lastFailureTime,
      cleanupRunning: !!this.cleanupInterval
    };
  }
};
