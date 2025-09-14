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
  // Attachment fields
  attachment: Joi.object({
    fileName: Joi.string().required(),
    fileSize: Joi.number().positive().max(10485760).required(), // 10MB max
    mimeType: Joi.string().valid('application/pdf', 'image/jpeg', 'image/png').required(),
    s3Key: Joi.string().required(),
    uploadedAt: Joi.string().isoDate().required(),
    uploadedBy: Joi.string().required()
  }).optional()
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

// User validation schema
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
