/**
 * OTP Audit Utilities
 * Logging functions for OTP-related events
 */

/**
 * Log OTP sent event
 */
export async function logOTPSent(auditLogger, {
  email,
  ipAddress,
  userAgent
}) {
  return auditLogger.createAuditLog(
    { sub: 'SYSTEM', email: 'OTP_SERVICE' },
    {
      type: 'OTP_SENT',
      category: 'AUTHENTICATION'
    },
    {
      id: email,
      email: email,
      type: 'OTP_SENT',
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown'
    },
    {
      before: null,
      after: { otpSent: true },
      changes: ['otp_sent']
    },
    {
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      sessionId: null,
      legalAction: false,
      gdprConsent: false
    }
  );
}

/**
 * Log OTP verified event
 */
export async function logOTPVerified(auditLogger, {
  email,
  ipAddress,
  userAgent
}) {
  return auditLogger.createAuditLog(
    { sub: 'SYSTEM', email: 'OTP_SERVICE' },
    {
      type: 'OTP_VERIFIED',
      category: 'AUTHENTICATION'
    },
    {
      id: email,
      email: email,
      type: 'OTP_VERIFIED',
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown'
    },
    {
      before: { otpSent: true },
      after: { otpVerified: true },
      changes: ['otp_verified']
    },
    {
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      sessionId: null,
      legalAction: false,
      gdprConsent: false
    }
  );
}

/**
 * Log OTP failed event
 */
export async function logOTPFailed(auditLogger, {
  email,
  reason,
  error,
  attempts,
  ipAddress
}) {
  return auditLogger.createAuditLog(
    { sub: 'SYSTEM', email: 'OTP_SERVICE' },
    {
      type: 'OTP_FAILED',
      category: 'AUTHENTICATION'
    },
    {
      id: email,
      email: email,
      type: 'OTP_FAILED',
      reason: reason,
      error: error,
      attempts: attempts,
      ipAddress: ipAddress || 'unknown'
    },
    {
      before: { otpSent: true },
      after: { otpFailed: true, reason: reason },
      changes: ['otp_failed']
    },
    {
      ipAddress: ipAddress || 'unknown',
      userAgent: 'unknown',
      sessionId: null,
      legalAction: false,
      gdprConsent: false
    }
  );
}
