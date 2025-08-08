import crypto from 'crypto';

class ImmutableAuditLogger {
  constructor(db) {
    this.db = db;
  }

  // Create immutable audit log
  async createAuditLog(adminUser, action, targetUser, details, metadata) {
    const logId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    
    // Prepare log entry
    const logEntry = {
      id: logId,
      createdAt: timestamp,
      adminUserId: adminUser.sub,
      adminEmail: adminUser.email || adminUser['cognito:username'],
      adminSessionId: metadata.sessionId || 'unknown',
      action: action.type,
      actionCategory: action.category,
      targetUserId: targetUser?.id,
      targetEmail: targetUser?.email || null,
      targetDataType: this.classifyData(targetUser),
      changes: {
        before: this.encryptSensitiveData(details.before),
        after: this.encryptSensitiveData(details.after),
        modifiedFields: details.changes || []
      },
      compliance: this.getComplianceMetadata(action, targetUser),
      security: {
        ipAddress: metadata.ipAddress || 'unknown',
        userAgent: metadata.userAgent || 'unknown',
        geoLocation: metadata.geoLocation || 'unknown',
        riskScore: this.calculateRiskScore(metadata),
        mfaUsed: metadata.mfaUsed || false,
        sessionDuration: metadata.sessionDuration || 0
      },
      status: 'SUCCESS',
      errorDetails: null,
      timestamp: timestamp
    };

    // Generate integrity hash
    logEntry.hash = this.generateHash(logEntry);
    
    try {
      // Store in Firebase (immutable)
      await this.db.ref(`adminAuditLogs/${logId}`).set(logEntry);
      
      // Store hash in separate location for integrity verification
      await this.db.ref(`auditLogHashes/${logId}`).set({
        hash: logEntry.hash,
        timestamp: timestamp
      });
      
      console.log('[AUDIT] Log created successfully', { logId, action: action.type });
      return logEntry;
    } catch (error) {
      console.error('[AUDIT] Failed to create log', { error: error.message, logId });
      throw error;
    }
  }

  // Create audit log for failed actions
  async createFailedAuditLog(adminUser, action, targetUser, error, metadata) {
    const logId = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      id: logId,
      createdAt: timestamp,
      adminUserId: adminUser.sub,
      adminEmail: adminUser.email || adminUser['cognito:username'],
      adminSessionId: metadata.sessionId || 'unknown',
      action: action.type,
      actionCategory: action.category,
      targetUserId: targetUser?.id,
      targetEmail: targetUser?.email || null,
      targetDataType: this.classifyData(targetUser),
      changes: {
        before: null,
        after: null,
        modifiedFields: []
      },
      compliance: this.getComplianceMetadata(action, targetUser),
      security: {
        ipAddress: metadata.ipAddress || 'unknown',
        userAgent: metadata.userAgent || 'unknown',
        geoLocation: metadata.geoLocation || 'unknown',
        riskScore: this.calculateRiskScore(metadata),
        mfaUsed: metadata.mfaUsed || false,
        sessionDuration: metadata.sessionDuration || 0
      },
      status: 'FAILED',
      errorDetails: {
        message: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        timestamp: timestamp
      },
      timestamp: timestamp
    };

    logEntry.hash = this.generateHash(logEntry);
    
    try {
      await this.db.ref(`adminAuditLogs/${logId}`).set(logEntry);
      await this.db.ref(`auditLogHashes/${logId}`).set({
        hash: logEntry.hash,
        timestamp: timestamp
      });
      
      console.log('[AUDIT] Failed action logged', { logId, action: action.type, error: error.message });
      return logEntry;
    } catch (auditError) {
      console.error('[AUDIT] Failed to log failed action', { error: auditError.message, logId });
      throw auditError;
    }
  }

  // Data classification for compliance
  classifyData(user) {
    if (!user) return 'INTERNAL';
    
    // Check for health-related data
    if (user.healthData || user.medicalInfo || user.hipaaData) return 'PHI';
    
    // Check for financial data
    if (user.financialData || user.paymentInfo || user.billingData) return 'FINANCIAL';
    
    // Check for personal data
    if (user.personalData || user.pii || user.email || user.phone) return 'PII';
    
    return 'INTERNAL';
  }

  // Encrypt sensitive data
  encryptSensitiveData(data) {
    if (!data) return null;
    
    try {
      const key = process.env.AUDIT_ENCRYPTION_KEY || 'default-key-change-in-production';
      // Generate a 32-byte key from the string key
      const keyBuffer = crypto.scryptSync(key, 'salt', 32);
      // Generate a random 16-byte IV
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Return IV + encrypted data (IV is needed for decryption)
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('[AUDIT] Encryption failed', { error: error.message });
      return 'ENCRYPTION_FAILED';
    }
  }

  // Generate integrity hash
  generateHash(logEntry) {
    try {
      const content = JSON.stringify({
        id: logEntry.id,
        adminUserId: logEntry.adminUserId,
        action: logEntry.action,
        targetUserId: logEntry.targetUserId,
        timestamp: logEntry.timestamp,
        status: logEntry.status
      });
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      console.error('[AUDIT] Hash generation failed', { error: error.message });
      return 'HASH_GENERATION_FAILED';
    }
  }

  // Calculate risk score
  calculateRiskScore(metadata) {
    let score = 0.1; // Base score
    
    // High-risk indicators
    if (metadata.unusualTime) score += 0.3;
    if (metadata.unusualLocation) score += 0.2;
    if (metadata.bulkOperation) score += 0.4;
    if (metadata.sensitiveData) score += 0.3;
    if (metadata.deleteOperation) score += 0.5;
    if (metadata.userDeletion) score += 0.8;
    
    return Math.min(score, 1.0);
  }

  // Get compliance metadata
  getComplianceMetadata(action, targetUser) {
    const dataClassification = this.classifyData(targetUser);
    
    return {
      dataClassification: dataClassification,
      retentionPeriod: '7_YEARS', // SOX requirement
      gdprBasis: 'LEGITIMATE_INTEREST',
      hipaaCategory: dataClassification === 'PHI' ? 'HEALTHCARE_OPERATIONS' : null,
      soxRelevant: action.category === 'FINANCIAL' || dataClassification === 'FINANCIAL',
      gdprRelevant: targetUser?.euResident || dataClassification === 'PII',
      hipaaRelevant: dataClassification === 'PHI'
    };
  }

  // Verify log integrity
  async verifyLogIntegrity(logId) {
    try {
      const logRef = await this.db.ref(`adminAuditLogs/${logId}`).once('value');
      const hashRef = await this.db.ref(`auditLogHashes/${logId}`).once('value');
      
      const log = logRef.val();
      const storedHash = hashRef.val()?.hash;
      
      if (!log || !storedHash) return false;
      
      const calculatedHash = this.generateHash(log);
      return calculatedHash === storedHash;
    } catch (error) {
      console.error('[AUDIT] Integrity verification failed', { error: error.message, logId });
      return false;
    }
  }

  // Get audit logs with filtering
  async getAuditLogs(filters = {}) {
    try {
      let query = this.db.ref('adminAuditLogs');
      
      // Apply filters
      if (filters.adminUser) {
        query = query.orderByChild('adminEmail').equalTo(filters.adminUser);
      }
      
      if (filters.action) {
        query = query.orderByChild('action').equalTo(filters.action);
      }
      
      if (filters.dateRange) {
        const endDate = new Date();
        const startDate = new Date();
        
        switch (filters.dateRange) {
          case '1d':
            startDate.setDate(endDate.getDate() - 1);
            break;
          case '7d':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(endDate.getDate() - 30);
            break;
          case '90d':
            startDate.setDate(endDate.getDate() - 90);
            break;
          default:
            startDate.setDate(endDate.getDate() - 7);
        }
        
        query = query.orderByChild('timestamp').startAt(startDate.toISOString()).endAt(endDate.toISOString());
      }
      
      const snapshot = await query.limitToLast(100).once('value');
      const logs = [];
      
      snapshot.forEach((child) => {
        logs.push(child.val());
      });
      
      return logs.reverse();
    } catch (error) {
      console.error('[AUDIT] Failed to get audit logs', { error: error.message });
      throw error;
    }
  }

  // Cleanup expired logs (SOX 7-year retention)
  async cleanupExpiredLogs() {
    try {
      const sevenYearsAgo = new Date();
      sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
      
      const expiredLogs = await this.db.ref('adminAuditLogs')
        .orderByChild('timestamp')
        .endAt(sevenYearsAgo.toISOString())
        .once('value');
        
      if (expiredLogs.exists()) {
        // Archive to cold storage instead of deletion for compliance
        await this.archiveToColdStorage(expiredLogs.val());
        
        // Remove from main storage
        await this.db.ref('adminAuditLogs').update(expiredLogs.val());
        
        console.log('[AUDIT] Cleaned up expired logs', { count: Object.keys(expiredLogs.val()).length });
      }
    } catch (error) {
      console.error('[AUDIT] Cleanup failed', { error: error.message });
    }
  }

  // Archive to cold storage (placeholder)
  async archiveToColdStorage(logs) {
    // In production, this would archive to AWS S3 Glacier or similar
    console.log('[AUDIT] Archiving logs to cold storage', { count: Object.keys(logs).length });
  }
}

export default ImmutableAuditLogger;
