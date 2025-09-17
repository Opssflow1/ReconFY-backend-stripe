/**
 * Centralized Structured Logger
 * Environment-aware logging with request correlation and security compliance
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || 
  (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

const isProduction = process.env.NODE_ENV === 'production';

class Logger {
  constructor(context = 'APP') {
    this.context = context;
  }

  _shouldLog(level) {
    return LOG_LEVELS[level] <= currentLevel;
  }

  _sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveFields = ['password', 'secret', 'key', 'token', 'authorization', 'stripeSecretKey', 'privateKey'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this._sanitizeData(value);
      }
    }
    
    return sanitized;
  }

  _formatMessage(level, message, data = null, requestId = null) {
    const timestamp = new Date().toISOString();
    const baseLog = {
      timestamp,
      level,
      context: this.context,
      message
    };

    if (requestId) baseLog.requestId = requestId;
    if (data) {
      baseLog.data = isProduction ? this._sanitizeData(data) : data;
    }

    return isProduction ? JSON.stringify(baseLog) : 
      `[${level}] ${timestamp} [${this.context}] ${message}${data ? ' ' + JSON.stringify(this._sanitizeData(data)) : ''}`;
  }

  debug(message, data = null, requestId = null) {
    if (this._shouldLog('DEBUG')) {
      console.log(this._formatMessage('DEBUG', message, data, requestId));
    }
  }

  info(message, data = null, requestId = null) {
    if (this._shouldLog('INFO')) {
      console.log(this._formatMessage('INFO', message, data, requestId));
    }
  }

  warn(message, data = null, requestId = null) {
    if (this._shouldLog('WARN')) {
      console.warn(this._formatMessage('WARN', message, data, requestId));
    }
  }

  error(message, data = null, requestId = null) {
    if (this._shouldLog('ERROR')) {
      console.error(this._formatMessage('ERROR', message, data, requestId));
    }
  }
}

// Export context-specific loggers
export const webhookLogger = new Logger('WEBHOOK');
export const subscriptionLogger = new Logger('SUBSCRIPTION');
export const adminLogger = new Logger('ADMIN');
export const authLogger = new Logger('AUTH');
export const memoryLogger = new Logger('MEMORY');
export const auditLogger = new Logger('AUDIT');
export const proxyLogger = new Logger('PROXY');
export const pythonLogger = new Logger('PYTHON');
export const s3Logger = new Logger('S3');
export const defaultLogger = new Logger('APP');

export default Logger;
