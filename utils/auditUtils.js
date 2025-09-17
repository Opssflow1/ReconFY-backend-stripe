// Centralized audit logging helpers to keep payloads consistent across the codebase

/**
 * Log a subscription activation event (usually via webhook checkout.session.completed)
 */
export async function logSubscriptionActivated(auditLogger, {
  systemActor,
  user,
  before,
  after,
  sessionId,
  webhookEvent,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    systemActor || { sub: 'SYSTEM', email: 'WEBHOOK' },
    {
      type: 'SUBSCRIPTION_ACTIVATED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'SUBSCRIPTION_ACTIVATION',
      company: user.company,
      termsVersion: user.legalAcceptance?.termsOfService?.version || '1.0.0',
      privacyVersion: user.legalAcceptance?.privacyPolicy?.version || '1.0.0',
      acceptedAt: user.legalAcceptance?.termsOfService?.acceptedAt || 'unknown',
      ipAddress: user.legalAcceptance?.termsOfService?.ipAddress || 'unknown',
      userAgent: user.legalAcceptance?.termsOfService?.userAgent || 'unknown'
    },
    {
      before,
      after,
      changes: ['subscription_activation', 'plan_upgrade', `tier:${before?.tier}->${after?.tier}`]
    },
    {
      ipAddress: 'webhook',
      userAgent: 'stripe-webhook',
      sessionId: sessionId,
      legalAction: false,
      gdprConsent: false,
      webhookEvent,
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * Log a subscription cancellation (payment failure or explicit cancellation state via webhook)
 */
export async function logSubscriptionCancelled(auditLogger, {
  systemActor,
  user,
  before,
  after,
  sessionId,
  webhookEvent,
  stripeCustomerId,
  invoiceId,
  attemptCount,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    systemActor || { sub: 'SYSTEM', email: 'WEBHOOK' },
    {
      type: 'SUBSCRIPTION_CANCELLED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'PAYMENT_FAILURE',
      company: user.company
    },
    {
      before,
      after,
      changes: ['subscription_cancelled', 'payment_failed', 'cancel_at_period_end: false -> true']
    },
    {
      ipAddress: 'webhook',
      userAgent: 'stripe-webhook',
      sessionId,
      webhookEvent,
      stripeCustomerId,
      invoiceId,
      attemptCount,
      stripeSubscriptionId
    }
  );
}

/**
 * Log a new subscription created via webhook (customer.subscription.created)
 */
export async function logSubscriptionCreated(auditLogger, {
  systemActor,
  user,
  tier,
  sessionId,
  webhookEvent,
  stripeCustomerId,
  stripeSubscriptionId,
  priceId
}) {
  return auditLogger.createAuditLog(
    systemActor || { sub: 'SYSTEM', email: 'WEBHOOK' },
    {
      type: 'SUBSCRIPTION_CREATED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'SUBSCRIPTION_CREATION',
      company: user.company
    },
    {
      before: { status: 'NONE', tier: 'NONE' },
      after: { status: 'ACTIVE', tier },
      changes: ['subscription_created', 'plan_activation', `tier:${tier}`]
    },
    {
      ipAddress: 'webhook',
      userAgent: 'stripe-webhook',
      sessionId,
      webhookEvent,
      stripeCustomerId,
      stripeSubscriptionId,
      priceId
    }
  );
}

/**
 * Log plan change based on previous_attributes diff
 */
export async function logSubscriptionPlanChanged(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId,
  priceId
}) {
  // Keep identical behavior with current logSubscriptionChange usage
  return auditLogger.createAuditLog(
    req?.user || { sub: 'SYSTEM', email: 'WEBHOOK' },
    {
      type: 'SUBSCRIPTION_PLAN_CHANGED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_PLAN_CHANGE',
      company: user.company
    },
    {
      before,
      after,
      changes: ['plan_change', 'tier_change', `tier:${before?.tier}->${after?.tier}`]
    },
    {
      ipAddress: req?.ip || 'webhook',
      userAgent: req?.headers?.['user-agent'] || 'stripe-webhook',
      sessionId: req?.headers?.['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      stripeCustomerId,
      stripeSubscriptionId,
      priceId
    }
  );
}

/**
 * User-initiated: plan change before Stripe update
 */
export async function logUserPlanChange(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'SUBSCRIPTION_PLAN_CHANGED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_PLAN_CHANGE',
      company: user.company
    },
    {
      before,
      after,
      changes: ['plan_change', 'tier_change', `tier:${before?.tier}->${after?.tier}`]
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      changeSource: 'user_initiated',
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * User-initiated: cancel subscription (sets cancel_at_period_end)
 */
export async function logUserCancellation(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'SUBSCRIPTION_CANCELLED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_SUBSCRIPTION_CANCELLATION',
      company: user.company
    },
    {
      before,
      after,
      changes: ['subscription_cancelled', 'cancel_at_period_end: false -> true']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      changeSource: 'user_initiated',
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * User-initiated: reactivation via Checkout (when status canceled)
 */
export async function logUserReactivationCheckout(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'SUBSCRIPTION_REACTIVATED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_SUBSCRIPTION_REACTIVATION',
      company: user.company
    },
    {
      before,
      after,
      changes: ['subscription_reactivated', 'plan_reactivation', `tier:${before?.tier}->${after?.tier}`]
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      changeSource: 'user_initiated_checkout',
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * User-initiated: reactivation by toggling cancel_at_period_end to false
 */
export async function logUserReactivationToggle(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'SUBSCRIPTION_REACTIVATED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_SUBSCRIPTION_REACTIVATION',
      company: user.company
    },
    {
      before,
      after,
      changes: ['subscription_reactivated', 'cancel_at_period_end: true -> false']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      changeSource: 'user_initiated',
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * User-initiated: new subscription via Checkout (no existing subscription)
 */
export async function logUserSubscriptionCreationCheckout(auditLogger, {
  req,
  user,
  before,
  after,
  stripeCustomerId,
  stripeSubscriptionId
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'SUBSCRIPTION_ACTIVATED',
      category: 'SUBSCRIPTION_MANAGEMENT'
    },
    {
      id: user.id,
      email: user.email,
      type: 'USER_SUBSCRIPTION_CREATION',
      company: user.company
    },
    {
      before,
      after,
      changes: ['subscription_created', 'plan_activation', `tier:${after?.tier}`]
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      legalAction: false,
      gdprConsent: false,
      changeSource: 'user_initiated_checkout',
      stripeCustomerId,
      stripeSubscriptionId
    }
  );
}

/**
 * Admin/Legal: terms acceptance log (public logging endpoint)
 */
export async function logTermsAccepted(auditLogger, {
  userId,
  email,
  company,
  termsVersion,
  privacyVersion,
  ipAddress,
  userAgent
}) {
  return auditLogger.createAuditLog(
    { sub: 'SYSTEM', email: 'USER' },
    {
      type: 'TERMS_ACCEPTED',
      category: 'LEGAL_COMPLIANCE'
    },
    {
      id: userId,
      email: email,
      type: 'LEGAL_ACCEPTANCE',
      company: company,
      termsVersion: termsVersion || '1.0.0',
      privacyVersion: privacyVersion || '1.0.0',
      acceptedAt: new Date().toISOString(),
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown'
    },
    {
      before: { termsAccepted: false, privacyAccepted: false },
      after: { termsAccepted: true, privacyAccepted: true },
      changes: ['terms_acceptance', 'privacy_acceptance']
    },
    {
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      sessionId: 'signup',
      legalAction: true,
      gdprConsent: true
    }
  );
}

/**
 * Admin: user location deleted
 */
export async function logUserLocationDeleted(auditLogger, {
  req,
  userId,
  userEmail,
  locationId,
  tspId,
  before
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'USER_LOCATION_DELETED',
      category: 'USER_MANAGEMENT'
    },
    { id: userId, email: userEmail || null, locationId, tspId },
    {
      before,
      after: null,
      changes: ['location_deleted', 'analytics_cleaned']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
      deleteOperation: true,
      locationDeletion: true
    }
  );
}

/**
 * Admin: user subscription updated (success)
 */
export async function logAdminUserSubscriptionUpdated(auditLogger, {
  req,
  userId,
  userEmail,
  before,
  after,
  changes
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'USER_SUBSCRIPTION_UPDATED',
      category: 'USER_MANAGEMENT'
    },
    { id: userId, email: userEmail },
    { before, after, changes },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
    }
  );
}

/**
 * Admin: user subscription update failed
 */
export async function logAdminUserSubscriptionUpdateFailed(auditLogger, {
  req,
  userId,
  userEmail,
  error
}) {
  return auditLogger.createFailedAuditLog(
    req.user,
    {
      type: 'USER_SUBSCRIPTION_UPDATE_FAILED',
      category: 'USER_MANAGEMENT'
    },
    { id: userId, email: userEmail },
    error,
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
    }
  );
}

/**
 * Admin: user deleted
 */
export async function logUserDeleted(auditLogger, {
  req,
  userId,
  email,
  before
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'USER_DELETED',
      category: 'USER_MANAGEMENT'
    },
    { id: userId, email },
    {
      before,
      after: null,
      changes: ['user_deleted', 'stripe_deleted', 'cognito_deleted', 'analytics_deleted']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
      userDeletion: true,
      deleteOperation: true,
      sensitiveData: true
    }
  );
}

/**
 * Contact: inquiry updated
 */
export async function logContactInquiryUpdated(auditLogger, {
  req,
  inquiryId,
  inquiry,
  updates
}) {
  // Build detailed before/after for each updated field
  const updatedFields = Object.keys(updates || {});
  const before = {};
  const after = {};
  const changes = [];

  for (const field of updatedFields) {
    // Special-case responses: show count delta rather than full arrays
    if (field === 'responses' && Array.isArray(inquiry.responses) && Array.isArray(updates.responses)) {
      const beforeCount = inquiry.responses.length;
      const afterCount = updates.responses.length;
      before.responsesCount = beforeCount;
      after.responsesCount = afterCount;
      changes.push(`responsesCount: ${beforeCount} -> ${afterCount}`);
      continue;
    }

    const beforeVal = inquiry[field] === undefined ? null : inquiry[field];
    const afterVal = updates[field] === undefined ? null : updates[field];

    // Skip if no actual change (avoids noisy entries like same admin id)
    const isPrimitive = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
    const equal = isPrimitive(beforeVal) && isPrimitive(afterVal)
      ? beforeVal === afterVal
      : JSON.stringify(beforeVal) === JSON.stringify(afterVal);
    if (equal) {
      continue;
    }

    before[field] = beforeVal;
    after[field] = afterVal;

    // For large or nested objects, fall back to presence change note
    if (!isPrimitive(beforeVal) || !isPrimitive(afterVal)) {
      changes.push(`${field}: updated`);
    } else {
      changes.push(`${field}: ${beforeVal ?? 'null'} -> ${afterVal ?? 'null'}`);
    }
  }

  // Backward compatibility: include status/priority if not already present
  if (!updatedFields.includes('status')) {
    before.status = inquiry.status;
  }
  if (!updatedFields.includes('priority')) {
    before.priority = inquiry.priority;
  }

  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'CONTACT_INQUIRY_UPDATED',
      category: 'CUSTOMER_SUPPORT'
    },
    {
      id: inquiryId,
      ticketNumber: inquiry.ticketNumber,
      email: inquiry.email,
      firstName: inquiry.firstName,
      lastName: inquiry.lastName,
      company: inquiry.company,
      type: 'INQUIRY'
    },
    {
      before,
      after,
      changes
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
    }
  );
}

/**
 * Contact: response sent
 */
export async function logContactInquiryResponseSent(auditLogger, {
  req,
  inquiryId,
  inquiry,
  response
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'CONTACT_INQUIRY_RESPONSE_SENT',
      category: 'CUSTOMER_SUPPORT'
    },
    {
      id: inquiryId,
      ticketNumber: inquiry.ticketNumber,
      email: inquiry.email,
      firstName: inquiry.firstName,
      lastName: inquiry.lastName,
      company: inquiry.company,
      type: 'INQUIRY'
    },
    {
      before: null,
      after: { response },
      changes: ['response_sent']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
    }
  );
}

/**
 * Contact: inquiry deleted
 */
export async function logContactInquiryDeleted(auditLogger, {
  req,
  inquiryId,
  inquiry
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'CONTACT_INQUIRY_DELETED',
      category: 'CUSTOMER_SUPPORT'
    },
    { id: inquiryId, email: inquiry.email },
    {
      before: inquiry,
      after: null,
      changes: ['inquiry_deleted']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
      deleteOperation: true
    }
  );
}

/**
 * Analytics: user analytics deleted (admin)
 */
export async function logUserAnalyticsDeleted(auditLogger, {
  req,
  userId,
  userEmail
}) {
  return auditLogger.createAuditLog(
    req.user,
    {
      type: 'USER_ANALYTICS_DELETED',
      category: 'DATA_MANAGEMENT'
    },
    { id: userId, email: userEmail },
    {
      before: null,
      after: null,
      changes: ['analytics_deleted']
    },
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now()),
      deleteOperation: true
    }
  );
}

/**
 * Analytics: failed deletion (admin)
 */
export async function logUserAnalyticsDeleteFailed(auditLogger, {
  req,
  userId,
  userEmail,
  error
}) {
  return auditLogger.createFailedAuditLog(
    req.user,
    {
      type: 'USER_ANALYTICS_DELETE_FAILED',
      category: 'DATA_MANAGEMENT'
    },
    { id: userId, email: userEmail },
    error,
    {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      sessionId: req.headers['x-session-id'] || 'unknown',
      mfaUsed: req.user.mfaUsed || false,
      sessionDuration: Date.now() - (req.user.sessionStart || Date.now())
    }
  );
}


