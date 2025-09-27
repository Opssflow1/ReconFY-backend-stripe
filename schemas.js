/**
 * Shared Joi Validation Schemas
 * Centralized schema definitions to avoid duplication
 */

import Joi from 'joi';

// Expense validation schema
export const expenseSchema = Joi.object({
  date: Joi.string().isoDate().required()
    .messages({ 'string.isoDate': 'Date must be in YYYY-MM-DD format' }),
  category: Joi.string().min(1).max(100).required()
    .messages({ 'string.min': 'Category is required' }),
  vendor: Joi.string().min(2).max(200).required()
    .messages({ 'string.min': 'Vendor must be at least 2 characters' }),
  amount: Joi.number().positive().max(999999.99).precision(2).required()
    .messages({ 'number.positive': 'Amount must be greater than 0' }),
  paymentMethod: Joi.string().min(1).max(50).required()
    .messages({ 'string.min': 'Payment method is required' }),
  notes: Joi.string().max(500).optional()
    .messages({ 'string.max': 'Notes must be less than 500 characters' }),
  // Excel import tracking field - allow but ignore
  index: Joi.number().integer().optional().strip(),
  // Attachment fields - allow object, null, or empty string
  attachment: Joi.alternatives().try(
    Joi.object({
      fileName: Joi.string().required(),
      fileSize: Joi.number().positive().max(10485760).required(), // 10MB max
      mimeType: Joi.string().valid('application/pdf', 'image/jpeg', 'image/png').required(),
      s3Key: Joi.string().required(),
      uploadedAt: Joi.string().isoDate().required(),
      uploadedBy: Joi.string().required()
    }),
    Joi.any().valid(null, "") // Allow null or empty string when no file
  ).optional()
});

// Monthly summary validation schema
export const monthlySummarySchema = Joi.object({
  totalRevenue: Joi.number().min(0).required(),
  totalExpenses: Joi.number().min(0).required(),
  netProfit: Joi.number().required(),
  locationId: Joi.string().required(),
  month: Joi.string().required()
});

// Expense import validation schema
export const expenseImportSchema = Joi.object({
  expenses: Joi.array().items(expenseSchema).min(1).max(1000).required()
    .messages({ 'array.min': 'At least one expense is required' })
});

// Expense category validation schema
export const expenseCategorySchema = Joi.object({
  category: Joi.string().min(1).max(100).required()
    .messages({ 'string.min': 'Category name is required' })
});

// Signup user validation schema (for public signup)
export const signupUserSchema = Joi.object({
  id: Joi.string().min(1).max(100).required()
    .messages({ 'string.min': 'User ID is required' }),
  email: Joi.string().email().required()
    .messages({ 'string.email': 'Please enter a valid email address' }),
  company: Joi.string().min(1).max(100).optional()
    .messages({ 'string.min': 'Company name must be at least 1 character' }),
  acceptTerms: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Terms acceptance must be true or false' })
});

// Admin user validation schema (for admin user creation)
export const userSchema = Joi.object({
  email: Joi.string().email().required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  role: Joi.string().valid('customer', 'admin', 'owner').required(),
  companyName: Joi.string().min(1).max(100).optional(),
  phoneNumber: Joi.string().min(10).max(15).optional(),
  address: Joi.object({
    street: Joi.string().max(100).optional(),
    city: Joi.string().max(50).optional(),
    state: Joi.string().max(50).optional(),
    zipCode: Joi.string().max(10).optional(),
    country: Joi.string().max(50).optional()
  }).optional(),
  preferences: Joi.object({
    notifications: Joi.boolean().default(true),
    theme: Joi.string().valid('light', 'dark').default('light'),
    timezone: Joi.string().default('UTC')
  }).optional(),
  subscription: Joi.object({
    plan: Joi.string().valid('starter', 'growth', 'pro', 'enterprise').required(),
    status: Joi.string().valid('active', 'inactive', 'cancelled', 'past_due').required(),
    currentPeriodStart: Joi.date().required(),
    currentPeriodEnd: Joi.date().required()
  }).optional(),
  locations: Joi.array().items(Joi.string()).optional(),
  tspIds: Joi.array().items(Joi.string()).optional(),
  primaryLocationId: Joi.string().optional(),
  primaryTspId: Joi.string().optional()
});

// ============================================================================
// API VALIDATION SCHEMAS
// ============================================================================

// User ID validation schema
export const userIdSchema = Joi.object({
  userId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).max(100).required()
    .messages({
      'string.pattern.base': 'User ID must contain only letters, numbers, hyphens, and underscores',
      'string.min': 'User ID must be at least 1 character long',
      'string.max': 'User ID must be no more than 100 characters long'
    })
});

// Subscription validation schema
export const subscriptionSchema = Joi.object({
  userId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).max(100).required()
    .messages({
      'string.pattern.base': 'User ID must contain only letters, numbers, hyphens, and underscores',
      'string.min': 'User ID must be at least 1 character long',
      'string.max': 'User ID must be no more than 100 characters long'
    }),
  planType: Joi.string().valid('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'TRIAL').required()
});

// Checkout session validation schema
export const checkoutSessionSchema = Joi.object({
  userId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).max(100).required()
    .messages({
      'string.pattern.base': 'User ID must contain only letters, numbers, hyphens, and underscores',
      'string.min': 'User ID must be at least 1 character long',
      'string.max': 'User ID must be no more than 100 characters long'
    }),
  planType: Joi.string().valid('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'TRIAL').required()
    .messages({
      'any.only': 'Plan type must be one of: STARTER, GROWTH, PRO, ENTERPRISE, TRIAL'
    }),
  userEmail: Joi.string().email().required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required for payment processing'
    }),
  successUrl: Joi.string().uri().required()
    .messages({
      'string.uri': 'Success URL must be a valid URL',
      'any.required': 'Success URL is required'
    }),
  cancelUrl: Joi.string().uri().required()
    .messages({
      'string.uri': 'Cancel URL must be a valid URL',
      'any.required': 'Cancel URL is required'
    })
});

// TSP ID extraction validation schema
export const tspIdExtractionSchema = Joi.object({
  // Note: File validation is handled by multer middleware
  // This schema validates any additional body parameters
  analysisType: Joi.string().valid('profit_calculation', 'cost_analysis', 'revenue_forecast').optional()
    .messages({
      'any.only': 'Analysis type must be one of: profit_calculation, cost_analysis, revenue_forecast'
    }),
  locationId: Joi.string().optional()
    .messages({
      'string.base': 'Location ID must be a string'
    }),
  userId: Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).max(100).optional()
    .messages({
      'string.pattern.base': 'User ID must contain only letters, numbers, hyphens, and underscores',
      'string.min': 'User ID must be at least 1 character long',
      'string.max': 'User ID must be no more than 100 characters long'
    })
});

// Contact form validation schema
export const contactSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  company: Joi.string().min(2).max(100).optional(),
  message: Joi.string().min(10).max(250).required()
});

// Analytics validation schema
export const analyticsSchema = Joi.object({
  analysisType: Joi.string().valid('profit_calculation', 'cost_analysis', 'revenue_forecast').required(),
  profitData: Joi.object().optional(),
  calculationResults: Joi.object().optional(),
  missingRebates: Joi.object().optional(),
  totalProfit: Joi.number().min(0).required(),
  totalRevenue: Joi.number().min(0).required(),
  filesProcessed: Joi.number().integer().min(0).required(),
  metadata: Joi.object().optional(),
  // Add missing fields that frontend sends:
  verificationResults: Joi.object().optional(),
  verificationTable: Joi.array().optional(),
  promoOrders: Joi.object().optional(),
  analysisDate: Joi.string().isoDate().optional(),
  // NEW: Location tracking fields for proper analytics-location relationship
  locationIds: Joi.array().items(Joi.string()).optional(),
  tspIds: Joi.array().items(Joi.string()).optional(),
  primaryLocationId: Joi.string().optional(),
  primaryTspId: Joi.string().optional()
});

// ============================================================================
// Reusable fragments and composed validation schemas (queries/bodies)
// ============================================================================

// Fragments
export const userId = Joi.string().pattern(/^[a-zA-Z0-9_-]+$/).min(1).max(100)
  .messages({
    'string.pattern.base': 'User ID must contain only letters, numbers, hyphens, and underscores',
    'string.min': 'User ID must be at least 1 character long',
    'string.max': 'User ID must be no more than 100 characters long'
  });

export const pagination = {
  limit: Joi.number().integer().min(1).max(1000).optional()
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be a whole number',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 1000'
    }),
  offset: Joi.number().integer().min(0).optional()
    .messages({
      'number.base': 'Offset must be a number',
      'number.integer': 'Offset must be a whole number',
      'number.min': 'Offset must be at least 0'
    })
};

export const adminDateRange = Joi.string().valid('7d', '30d', '90d', '1y', 'ALL');
export const shortDateRange = Joi.string().valid('7d', '30d', '90d', 'ALL');
export const webhookDateRange = Joi.string().valid('1h', '24h', '7d', '30d');
export const analysisTypeEnum = Joi.string().valid('profit_calculation', 'cost_analysis', 'revenue_forecast');
export const analysisTypeWithAll = Joi.string().valid('profit_calculation', 'cost_analysis', 'revenue_forecast', 'ALL');

// Health query schema (GET /)
export const healthQuerySchema = Joi.object({
  detailed: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Detailed flag must be true or false' }),
  includeMetrics: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include metrics flag must be true or false' }),
  checkServices: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Check services flag must be true or false' }),
  logRotation: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Log rotation flag must be true or false' })
});

// Contact admin filters
export const contactAdminListQuerySchema = Joi.object({
  status: Joi.string().valid('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CUSTOMER_REPLY', 'ALL').optional()
    .messages({ 'any.only': 'Status must be one of: NEW, IN_PROGRESS, RESOLVED, CLOSED, CUSTOMER_REPLY, ALL' }),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'ALL').optional()
    .messages({ 'any.only': 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT, ALL' }),
  category: Joi.string().valid('GENERAL', 'TECHNICAL', 'BILLING', 'FEATURE_REQUEST', 'ALL').optional()
    .messages({ 'any.only': 'Category must be one of: GENERAL, TECHNICAL, BILLING, FEATURE_REQUEST, ALL' }),
  dateRange: shortDateRange.optional(),
  assignedTo: Joi.string().valid('ALL').optional()
    .messages({ 'any.only': 'Assigned to filter must be ALL' }),
  search: Joi.string().max(200).optional()
    .messages({ 'string.max': 'Search query cannot exceed 200 characters' }),
  ...pagination
});

export const contactAdminUpdateBodySchema = Joi.object({
  status: Joi.string().valid('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CUSTOMER_REPLY').optional()
    .messages({ 'any.only': 'Status must be one of: NEW, IN_PROGRESS, RESOLVED, CLOSED, CUSTOMER_REPLY' }),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'URGENT').optional()
    .messages({ 'any.only': 'Priority must be one of: LOW, MEDIUM, HIGH, URGENT' }),
  adminNotes: Joi.string().max(1000).optional()
    .messages({ 'string.max': 'Admin notes cannot exceed 1000 characters' }),
  assignedTo: Joi.string().max(100).optional()
    .messages({ 'string.max': 'Assigned to field cannot exceed 100 characters' }),
  response: Joi.string().min(1).max(1000).optional()
    .messages({ 'string.min': 'Response cannot be empty', 'string.max': 'Response cannot exceed 1000 characters' }),
  sendEmailToCustomer: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Send email to customer must be true or false' })
});

export const contactAdminRespondBodySchema = Joi.object({
  response: Joi.string().min(1).max(1000).required()
    .messages({ 'string.min': 'Response cannot be empty', 'string.max': 'Response cannot exceed 1000 characters', 'any.required': 'Response message is required' }),
  sendEmailToCustomer: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Send email to customer must be true or false' })
});

export const contactAdminStatsQuerySchema = Joi.object({
  dateRange: adminDateRange.optional()
    .messages({ 'any.only': 'Date range must be one of: 7d, 30d, 90d, 1y, ALL' }),
  category: Joi.string().valid('GENERAL', 'TECHNICAL', 'BILLING', 'FEATURE_REQUEST', 'ALL').optional()
    .messages({ 'any.only': 'Category must be one of: GENERAL, TECHNICAL, BILLING, FEATURE_REQUEST, ALL' }),
  status: Joi.string().valid('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CUSTOMER_REPLY', 'ALL').optional()
    .messages({ 'any.only': 'Status must be one of: NEW, IN_PROGRESS, RESOLVED, CLOSED, CUSTOMER_REPLY, ALL' })
});

export const ticketReplyBodySchema = Joi.object({
  message: Joi.string().min(1).max(250).required()
    .messages({ 'string.min': 'Message cannot be empty', 'string.max': 'Message cannot exceed 250 characters', 'any.required': 'Message is required' }),
  email: Joi.string().email().optional()
    .messages({ 'string.email': 'Please provide a valid email address' }),
  name: Joi.string().min(2).max(100).optional()
    .messages({ 'string.min': 'Customer name must be at least 2 characters long', 'string.max': 'Customer name must be no more than 100 characters long' })
});

// Admin system/audit/webhook queries
export const adminAuditLogsQuerySchema = Joi.object({
  adminUser: Joi.string().optional(),
  action: Joi.string().optional(),
  dateRange: adminDateRange.optional()
    .messages({ 'any.only': 'Date range must be one of: 1d, 7d, 30d, 90d, 1y' }),
  ...pagination
});

export const adminLegalComplianceQuerySchema = Joi.object({
  dateRange: adminDateRange.optional()
    .messages({ 'any.only': 'Date range must be one of: 7d, 30d, 90d, 1y, ALL' }),
  complianceType: Joi.string().valid('TERMS', 'PRIVACY', 'BOTH', 'ALL').optional()
    .messages({ 'any.only': 'Compliance type must be one of: TERMS, PRIVACY, BOTH, ALL' }),
  includeDetails: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include details flag must be true or false' })
});

export const businessMetricsQuerySchema = Joi.object({
  period: Joi.string().valid('7d', '30d', '90d', '1y').optional().default('30d')
    .messages({ 'any.only': 'Period must be one of: 7d, 30d, 90d, 1y' }),
  includeChurn: Joi.boolean().optional().default(true)
    .messages({ 'boolean.base': 'Include churn must be true or false' })
});

export const systemHealthQuerySchema = Joi.object({
  detailed: Joi.boolean().optional().default(false)
    .messages({ 'boolean.base': 'Detailed flag must be true or false' })
});

export const cleanupDuplicateSubscriptionsSchema = Joi.object({
  dryRun: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Dry run flag must be true or false' })
});

export const retryFailedWebhooksSchema = Joi.object({
  maxRetries: Joi.number().integer().min(1).max(10).optional()
    .messages({ 'number.base': 'Max retries must be a number', 'number.integer': 'Max retries must be a whole number', 'number.min': 'Max retries must be at least 1', 'number.max': 'Max retries cannot exceed 10' }),
  retryDelay: Joi.number().integer().min(1000).max(60000).optional()
    .messages({ 'number.base': 'Retry delay must be a number', 'number.integer': 'Retry delay must be a whole number', 'number.min': 'Retry delay must be at least 1000ms', 'number.max': 'Retry delay cannot exceed 60000ms' })
});

export const adminWebhookStatsQuerySchema = Joi.object({
  dateRange: webhookDateRange.optional()
    .messages({ 'any.only': 'Date range must be one of: 1h, 24h, 7d, 30d' }),
  eventType: Joi.string().optional()
    .messages({ 'string.base': 'Event type must be a string' })
});

export const adminWebhookHealthQuerySchema = Joi.object({
  detailed: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Detailed flag must be true or false' }),
  includeMetrics: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include metrics flag must be true or false' })
});

// Admin users queries/bodies
export const adminUsersListQuerySchema = Joi.object({
  includeSubscription: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include subscription flag must be true or false' }),
  includeLegal: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include legal flag must be true or false' }),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'CANCELLED', 'TRIAL', 'ALL').optional()
    .messages({ 'any.only': 'Status must be one of: ACTIVE, INACTIVE, CANCELLED, TRIAL, ALL' }),
  tier: Joi.string().valid('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'TRIAL', 'ALL').optional()
    .messages({ 'any.only': 'Tier must be one of: STARTER, GROWTH, PRO, ENTERPRISE, TRIAL, ALL' }),
  ...pagination
});

export const adminUsersLocationsQuerySchema = Joi.object({
  includeAnalytics: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include analytics flag must be true or false' }),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'DELETED', 'ALL').optional()
    .messages({ 'any.only': 'Status must be one of: ACTIVE, INACTIVE, DELETED, ALL' }),
  ...pagination
});

export const adminDeleteUserBodySchema = Joi.object({
  deleteAnalytics: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Delete analytics flag must be true or false' }),
  deleteLocations: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Delete locations flag must be true or false' }),
  deleteAuditLogs: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Delete audit logs flag must be true or false' }),
  reason: Joi.string().max(500).optional()
    .messages({ 'string.max': 'Deletion reason cannot exceed 500 characters' })
});

export const adminUpdateUserSubscriptionBodySchema = Joi.object({
  tier: Joi.string().valid('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'TRIAL').optional()
    .messages({ 'any.only': 'Tier must be one of: STARTER, GROWTH, PRO, ENTERPRISE, TRIAL' }),
  status: Joi.string().valid('ACTIVE', 'CANCELLED', 'INACTIVE').optional()
    .messages({ 'any.only': 'Status must be one of: ACTIVE, CANCELLED, INACTIVE' }),
  cancelAtPeriodEnd: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Cancel at period end must be true or false' }),
  company: Joi.string().min(2).max(100).optional()
    .messages({ 'string.min': 'Company name must be at least 2 characters long', 'string.max': 'Company name must be no more than 100 characters long' })
});

export const termsAcceptanceBodySchema = Joi.object({
  userId: userId.required(),
  email: Joi.string().email().required()
    .messages({ 'string.email': 'Please provide a valid email address', 'any.required': 'Email is required' }),
  company: Joi.string().min(2).max(100).optional()
    .messages({ 'string.min': 'Company name must be at least 2 characters long', 'string.max': 'Company name must be no more than 100 characters long' }),
  termsVersion: Joi.string().optional(),
  privacyVersion: Joi.string().optional(),
  ipAddress: Joi.string().ip().optional()
    .messages({ 'string.ip': 'IP address must be a valid IP address' }),
  userAgent: Joi.string().optional()
});

// Subscription small bodies
export const verifyPaymentBodySchema = Joi.object({
  userId: userId.required(),
  sessionId: Joi.string().required()
    .messages({ 'any.required': 'Session ID is required for payment verification' })
});

export const cancelSubscriptionBodySchema = Joi.object({
  userId: userId.required(),
  subscriptionId: Joi.string().required()
    .messages({ 'any.required': 'Subscription ID is required for cancellation' })
});

export const reactivateSubscriptionBodySchema = Joi.object({
  userId: userId.required(),
  planType: Joi.string().valid('STARTER', 'GROWTH', 'PRO', 'ENTERPRISE', 'TRIAL').optional()
    .messages({ 'any.only': 'Plan type must be one of: STARTER, GROWTH, PRO, ENTERPRISE, TRIAL' }),
  userEmail: Joi.string().email().optional()
    .messages({ 'string.email': 'Please provide a valid email address' }),
  successUrl: Joi.string().uri().optional()
    .messages({ 'string.uri': 'Success URL must be a valid URL' }),
  cancelUrl: Joi.string().uri().optional()
    .messages({ 'string.uri': 'Cancel URL must be a valid URL' })
});

export const billingPortalBodySchema = Joi.object({
  customerId: Joi.string().required()
    .messages({ 'any.required': 'Customer ID is required for billing portal access' })
});

// Analytics admin queries
export const adminAnalyticsListQuerySchema = Joi.object({
  analysisType: analysisTypeWithAll.optional()
    .messages({ 'any.only': 'Analysis type must be one of: profit_calculation, cost_analysis, revenue_forecast, ALL' }),
  dateRange: adminDateRange.optional(),
  ...pagination
});

export const adminUserLocationAnalyticsQuerySchema = Joi.object({
  analysisType: analysisTypeWithAll.optional()
    .messages({ 'any.only': 'Analysis type must be one of: profit_calculation, cost_analysis, revenue_forecast, ALL' }),
  dateRange: adminDateRange.optional(),
  ...pagination
});

// Subscription query schemas
export const subscriptionMeQuerySchema = Joi.object({
  includeBilling: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include billing flag must be true or false' }),
  includeUsage: Joi.boolean().optional()
    .messages({ 'boolean.base': 'Include usage flag must be true or false' })
});

// Param schemas
export const userIdParamSchema = Joi.object({
  userId: userId.required()
});

export const userAndLocationParamSchema = Joi.object({
  userId: userId.required(),
  locationId: Joi.string().required()
});

export const analyticsIdParamSchema = Joi.object({
  analyticsId: Joi.string().required()
});

export const locationIdParamSchema = Joi.object({
  locationId: Joi.string().required()
});

export const monthYearParamSchema = Joi.object({
  monthYear: Joi.string().pattern(/^\d{4}-\d{2}$/).required()
    .messages({ 'string.pattern.base': 'monthYear must be in YYYY-MM format' })
});

export const userLocMonthParamSchema = Joi.object({
  userId: userId.required(),
  locationId: Joi.string().required(),
  monthYear: Joi.string().pattern(/^\d{4}-\d{2}$/).required()
    .messages({ 'string.pattern.base': 'monthYear must be in YYYY-MM format' })
});

export const userLocMonthExpenseParamSchema = Joi.object({
  userId: userId.required(),
  locationId: Joi.string().required(),
  monthYear: Joi.string().pattern(/^\d{4}-\d{2}$/).required()
    .messages({ 'string.pattern.base': 'monthYear must be in YYYY-MM format' }),
  expenseId: Joi.string().required()
});

export const userTspParamSchema = Joi.object({
  userId: userId.required(),
  tspId: Joi.string().required()
});

// ---------------------------------------------------------------------------
// Firebase small body/query schemas
// ---------------------------------------------------------------------------

export const analysesCountBodySchema = Joi.object({
  count: Joi.number().integer().min(0).required()
    .messages({ 'number.integer': 'count must be an integer', 'any.required': 'count is required' })
});

export const filesProcessedBodySchema = Joi.object({
  count: Joi.number().integer().min(0).required()
    .messages({ 'number.integer': 'count must be an integer', 'any.required': 'count is required' })
});

export const activityHistoryBodySchema = Joi.object({
  history: Joi.array().items(Joi.object()).required()
    .messages({ 'any.required': 'history is required' })
});

export const usageUpdateBodySchema = Joi.object({
  field: Joi.string().min(1).optional(),
  // allow arbitrary usage fields but ensure object
}).unknown(true);

export const bulkLocationsBodySchema = Joi.object({
  locationIds: Joi.array().items(Joi.string()).min(1).required()
    .messages({ 'any.required': 'locationIds is required', 'array.min': 'Provide at least one locationId' })
});

export const validateTspIdsBodySchema = Joi.object({
  tspIds: Joi.array().items(Joi.string()).min(1).required()
    .messages({ 'any.required': 'tspIds is required', 'array.min': 'Provide at least one tspId' })
});

export const dateRangeQuerySchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().required()
});

export const subscriptionValidateQuerySchema = Joi.object({
  feature: Joi.string().valid('profit_analysis', 'file_upload', 'reports', 'charts', 'locations').required()
    .messages({
      'any.only': 'Feature must be one of: profit_analysis, file_upload, reports, charts, locations',
      'any.required': 'Feature is required for validation'
    }),
  locationCount: Joi.number().integer().min(0).optional()
    .messages({
      'number.base': 'Location count must be a number',
      'number.integer': 'Location count must be a whole number',
      'number.min': 'Location count must be at least 0'
    })
});

// ============================================================================
// OTP VALIDATION SCHEMAS
// ============================================================================

// OTP send request schema
export const otpSendSchema = Joi.object({
  email: Joi.string().email().required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email address is required'
    })
});

// OTP verify request schema
export const otpVerifySchema = Joi.object({
  email: Joi.string().email().required()
    .messages({
      'string.email': 'Please enter a valid email address',
      'any.required': 'Email address is required'
    }),
  otp: Joi.string().pattern(/^\d{6}$/).required()
    .messages({
      'string.pattern.base': 'OTP must be a 6-digit number',
      'any.required': 'OTP code is required'
    })
});

// ============================================================================
// ADDITIONAL VALIDATION SCHEMAS FOR SECURITY FIXES
// ============================================================================

// User analytics data validation
export const userAnalyticsDataSchema = Joi.object({
  sessionKey: Joi.string().max(1000).optional(),
  activityHistory: Joi.array().items(Joi.object({
    action: Joi.string().max(100).required(),
    timestamp: Joi.string().isoDate().required(),
    details: Joi.object().optional()
  })).max(1000).optional(),
  analysesCount: Joi.number().integer().min(0).max(10000).optional(),
  filesProcessed: Joi.number().integer().min(0).max(10000).optional(),
  usage: Joi.object({
    monthlyAnalyses: Joi.number().integer().min(0).max(1000).optional(),
    fileUploads: Joi.number().integer().min(0).max(1000).optional(),
    apiCalls: Joi.number().integer().min(0).max(10000).optional()
  }).optional()
});

// Count validation schema (using existing pattern)
export const countBodySchema = Joi.object({
  count: Joi.number().integer().min(0).max(10000).required()
    .messages({ 'number.base': 'Count must be a number', 'number.integer': 'Count must be a whole number', 'number.min': 'Count must be at least 0', 'number.max': 'Count cannot exceed 10000' })
});