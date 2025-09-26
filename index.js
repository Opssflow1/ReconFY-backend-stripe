// Cognito JWT verification middleware
import cognitoAuthenticate from "./cognitoAuth.js";
import { requireActiveSubscription, requireAnySubscription, setDatabase } from "./subscriptionAuth.js";

import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import axios from "axios";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import ImmutableAuditLogger from "./auditLogger.js";
import { SESClient } from "@aws-sdk/client-ses";
import { S3Client } from "@aws-sdk/client-s3";
import { sendEmail, generateTicketNumber, EMAIL_TEMPLATES } from "./utils/emailUtils.js";
import { uploadToS3, deleteFromS3, generateSignedUrl, orphanedFilesTracker } from "./utils/s3Utils.js";
import { filterUndefined, parseFrontendUrls, getLogRotationStats } from "./utils/helpers.js";
import { getPriceId, getTierFromPriceId, getTierHierarchy, getPlanPrice } from "./utils/stripeHelpers.js";
import { userDataManager } from "./utils/userDataManager.js";
import { webhookCircuitBreaker } from "./utils/circuitBreaker.js";
import { webhookProcessingUtils } from "./utils/webhookProcessing.js";
import { updateUserSubscription } from "./utils/subscriptionUtils.js";
import { fileMemoryMonitor } from "./utils/memoryMonitor.js";
import { createTrialExpiryScheduler } from "./utils/trialExpiryScheduler.js";
import { setupContactRoutes } from "./routes/contactRoutes.js";
import { setupSubscriptionRoutes } from "./routes/subscriptionRoutes.js";
import { setupAnalyticsRoutes } from "./routes/analyticsRoutes.js";
import { setupAdminUserRoutes } from "./routes/adminUserRoutes.js";
import { setupTspIdRoutes } from "./routes/tspIdRoutes.js";
import { setupAdminRoutes } from "./routes/adminRoutes.js";
import { setupFirebaseExpenseRoutes } from "./routes/firebaseExpenseRoutes.js";
import { setupProxyRoutes } from "./routes/proxyRoutes.js";
import { setupWebhookRoutes } from "./routes/webhookRoutes.js";
import firebaseEndpoints from "./firebaseEndpoints.js";
import firebaseHandler from "./firebaseHandler.js";
import helmet from "helmet";
import Joi from "joi";
import { healthQuerySchema } from "./schemas.js";
import { adminProtected } from "./middleware/stacks.js";
import { globalLimiter, authLimiter, contactLimiter, webhookLimiter, adminLimiter } from "./middleware/rateLimiting.js";
import { 
  expenseSchema, 
  monthlySummarySchema, 
  userSchema,
  userIdSchema, 
  subscriptionSchema, 
  checkoutSessionSchema, 
  tspIdExtractionSchema, 
  contactSchema, 
  analyticsSchema, 
  expenseImportSchema, 
  expenseCategorySchema
} from "./schemas.js";
import { validateBody, validateQuery } from "./middleware/validation.js";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { PythonShell } from "python-shell";
import FormData from "form-data";

// Load environment variables
dotenv.config();

// Processing backend configuration
const PROCESSING_BACKEND_URL = process.env.PROCESSING_BACKEND_URL || 'https://fastapi.myreconfy.com';

// Proxy utility function for forwarding requests to processing backend
const proxyToProcessingBackend = async (req, res, endpoint) => {
  try {
    console.log(`[PROXY] Forwarding ${req.method} ${endpoint} to processing backend`);
    
    // Prepare headers (preserve original content-type for file uploads)
    const headers = {
      'Authorization': req.headers.authorization,
      'User-Agent': 'ReconFY-Validation-Backend/1.0'
    };
    
    // Only set Content-Type if it's not multipart/form-data (let axios handle it)
    if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    
    const requestConfig = {
      headers,
      timeout: 120000, // 2 minutes timeout for file processing
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    };

    // Handle different request methods
    let response;
    if (req.method === 'GET') {
      response = await axios.get(`${PROCESSING_BACKEND_URL}${endpoint}`, {
        ...requestConfig,
        params: req.query
      });
    } else if (req.method === 'POST') {
      // For file uploads, create FormData with files and fields
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        const formData = new FormData();
        
        // Add all body fields to form data
        Object.keys(req.body).forEach(key => {
          formData.append(key, req.body[key]);
        });
        
        // Add files from multer processing
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            formData.append(file.fieldname, file.buffer, {
              filename: file.originalname,
              contentType: file.mimetype
            });
          });
        }
        
        // Add user context
        formData.append('userContext', JSON.stringify({
          userId: req.user?.sub,
          subscription: req.subscription,
          userRole: req.user?.role
        }));
        
        // Update headers for FormData
        requestConfig.headers = {
          ...requestConfig.headers,
          ...formData.getHeaders()
        };
        
        response = await axios.post(`${PROCESSING_BACKEND_URL}${endpoint}`, formData, requestConfig);
      } else {
        // For JSON requests, add user context to data
        const data = {
          ...req.body,
          userContext: {
            userId: req.user?.sub,
            subscription: req.subscription,
            userRole: req.user?.role
          }
        };
        response = await axios.post(`${PROCESSING_BACKEND_URL}${endpoint}`, data, requestConfig);
      }
    } else if (req.method === 'PUT') {
      const data = {
        ...req.body,
        userContext: {
          userId: req.user?.sub,
          subscription: req.subscription,
          userRole: req.user?.role
        }
      };
      response = await axios.put(`${PROCESSING_BACKEND_URL}${endpoint}`, data, requestConfig);
    } else if (req.method === 'DELETE') {
      response = await axios.delete(`${PROCESSING_BACKEND_URL}${endpoint}`, requestConfig);
    }

    // Forward response to client
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error(`[PROXY] Error forwarding request to processing backend:`, error.message);
    
    if (error.response) {
      // Forward error response from processing backend
      res.status(error.response.status).json({
        error: error.response.data?.error || 'Processing backend error',
        message: error.response.data?.message || error.message
      });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'Processing service unavailable',
        message: 'The file processing service is temporarily unavailable. Please try again later.'
      });
    } else if (error.code === 'ETIMEDOUT') {
      res.status(504).json({
        error: 'Processing timeout',
        message: 'The file processing request timed out. Please try again with smaller files.'
      });
    } else {
      res.status(500).json({
        error: 'Proxy error',
        message: 'An error occurred while processing your request.'
      });
    }
  }
};

// ✅ OPERATIONAL FIX: Validate required environment variables
const requiredEnvVars = [
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_DATABASE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_STARTER_PRICE_ID',
  'STRIPE_GROWTH_PRICE_ID',
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_ENTERPRISE_PRICE_ID',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'COGNITO_REGION',
  'COGNITO_USER_POOL_ID',
  'SES_FROM_EMAIL',
  'S3_BUCKET_NAME',
  'AUDIT_ENCRYPTION_KEY'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:', missingEnvVars);
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

console.log('[STARTUP] ✅ All required environment variables are set');

// Set timezone to UTC for consistency across all deployments
process.env.TZ = 'UTC';

// Initialize Firebase Admin
let serviceAccount;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is required');
  }
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  // ✅ SECURITY FIX: Validate service account structure
  if (!serviceAccount.type || !serviceAccount.project_id || !serviceAccount.private_key_id || !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Invalid Firebase service account structure');
  }
} catch (error) {
  console.error('❌ CRITICAL: Failed to parse Firebase service account:', error.message);
  process.exit(1);
}

if (!process.env.FIREBASE_DATABASE_URL) {
  console.error('❌ CRITICAL: FIREBASE_DATABASE_URL environment variable is required');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();

// Initialize subscription auth middleware with database reference
setDatabase(db);

// Initialize audit logger with database instance
const auditLogger = new ImmutableAuditLogger(db);

// Initialize AWS SES for email functionality
const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});






const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

// Initialize Cognito client with credentials
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Initialize S3 client for file storage
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ✅ ENTERPRISE FIX: Use memory storage for better performance and security
const storage = multer.memoryStorage();

// File filter for security - Updated for expense attachments
const fileFilter = (req, file, cb) => {
  // ✅ SECURITY: Allow PDF, JPG, PNG files for expense receipts
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Only PDF, JPG, and PNG files are allowed'), false);
  }
  
  // ✅ SECURITY: Check file extension
  const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(new Error('Invalid file extension'), false);
  }
  
  // ✅ SECURITY: Check for suspicious filenames
  const suspiciousPatterns = ['..', '\\', '/', 'cmd', 'bat', 'exe', 'sh'];
  const filename = file.originalname.toLowerCase();
  if (suspiciousPatterns.some(pattern => filename.includes(pattern))) {
    return cb(new Error('Suspicious filename detected'), false);
  }
  
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Only allow 1 file per request
  }
});

// Separate multer config for file processing (allows multiple files)
const uploadMultiple = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Allow Excel, CSV, and PDF files for processing
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/pdf' // .pdf
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel, CSV, and PDF files are allowed for processing'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 10 // Allow up to 10 files per request
  }
});

// ✅ ENTERPRISE FIX: No need for uploads directory with memory storage



// ✅ MODERATE FIX: Environment-based CORS configuration
const allowedOrigins = [
  ...parseFrontendUrls(),
  // Development origins - always allow localhost in development
  // Production origins for ReconFY domains
  "https://myreconfy.com",
  "https://www.myreconfy.com",
  "https://admin.myreconfy.com",
  // Production origins (only if explicitly set)
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];


app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // ✅ MODERATE FIX: Only log CORS in development to reduce log noise
    if (process.env.NODE_ENV === 'development') {
      console.log(`[CORS] Checking origin: ${origin}`);
      console.log(`[CORS] Allowed origins:`, allowedOrigins);
    }
    
    if (allowedOrigins.includes(origin)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[CORS] ✅ Allowed: ${origin}`);
      }
      return callback(null, true);
    }
    
    console.warn(`[CORS] ❌ Blocked: ${origin}`);
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
}));

// ✅ CRITICAL FIX: Configure Express to trust proxy headers for rate limiting
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "https://api.stripe.com", 
        "https://cognito-idp.us-east-1.amazonaws.com",
        "https://firebase.googleapis.com"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' }
}));


// Webhook endpoint needs raw body for signature verification
app.use("/webhook", webhookLimiter, express.raw({ type: "application/json" }));

// Request limits and security
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ✅ MODERATE FIX: Request timeout middleware with request ID tracking
app.use((req, res, next) => {
  // Generate request ID if not provided
  if (!req.headers['x-request-id']) {
    req.headers['x-request-id'] = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  
  // Set requestId on req object for easy access
  req.requestId = req.headers['x-request-id'];
  
  // Log request start (only in development)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[REQUEST] ${req.method} ${req.path} - ID: ${req.requestId}`);
  }
  
  req.setTimeout(30000, () => {
    res.status(408).json({ 
      error: 'Request timeout',
      requestId: req.requestId
    });
  });
  next();
});

// Apply global rate limiting to all routes
app.use(globalLimiter);



// ✅ DEBUG: Add validation debugging middleware
app.use('/firebase/expenses/:userId/:locationId/:monthYear', (req, res, next) => {
  if (req.method === 'POST') {
    console.log('🔍 DEBUG: Expense data being validated:', {
      body: req.body,
      hasAttachment: !!req.body.attachment,
      attachmentData: req.body.attachment
    });
  }
  next();
});

// ✅ TRIAL EXPIRY SCHEDULER: Initialize trial expiry scheduler
const trialExpiryScheduler = createTrialExpiryScheduler(db, {
  checkInterval: 24 * 60 * 60 * 1000, // Check every 24 hours
  initialDelay: 5 * 60 * 1000,        // Wait 5 minutes after startup
  batchSize: 50,                       // Process 50 users per batch
  enabled: true                        // Enable scheduler
});

// ✅ FIREBASE ENDPOINTS: Add secure Firebase operations endpoints
app.use('/firebase', firebaseEndpoints);

// ✅ CONTACT ROUTES: Setup contact management endpoints
setupContactRoutes(app, { auditLogger, sesClient, db });

// ✅ SUBSCRIPTION ROUTES: Setup subscription management endpoints
setupSubscriptionRoutes(app, { stripe, auditLogger, db, cognitoClient });

// ✅ ANALYTICS ROUTES: Setup analytics management endpoints
setupAnalyticsRoutes(app, { db, auditLogger, cognitoClient });

// ✅ ADMIN USER ROUTES: Setup admin user management endpoints
setupAdminUserRoutes(app, { db, auditLogger, cognitoClient, stripe });

// ✅ TSP ID ROUTES: Setup TSP ID extraction endpoints
setupTspIdRoutes(app, { upload, uploadMultiple });

// ✅ ADMIN ROUTES: Setup admin management endpoints
setupAdminRoutes(app, { 
  db, 
  auditLogger, 
  stripe, 
  webhookCircuitBreaker, 
  firebaseHandler, 
  orphanedFilesTracker,
  trialExpiryScheduler
});

// ✅ FIREBASE EXPENSE ROUTES: Setup Firebase expense file management endpoints
setupFirebaseExpenseRoutes(app, { 
  s3Client, 
  upload, 
  orphanedFilesTracker 
});

// ✅ PROXY ROUTES: Setup download and report proxy endpoints
setupProxyRoutes(app, { 
  uploadMultiple, 
  proxyToProcessingBackend 
});

// ✅ WEBHOOK ROUTES: Setup Stripe webhook processing endpoints
setupWebhookRoutes(app, { 
  stripe, 
  db, 
  webhookCircuitBreaker, 
  webhookProcessingUtils, 
  updateUserSubscription, 
  auditLogger 
});

// ✅ ERROR HANDLING FIX: Comprehensive error handling middleware with circuit breakers
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // ✅ CRITICAL FIX: Add request ID for correlation
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  
  // Handle specific error types
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS Error',
      message: 'Origin not allowed',
      details: err.message,
      requestId
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      requestId
    });
  }
  
  // ✅ SECURITY: Handle file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'File Too Large',
      message: 'Uploaded file exceeds maximum size limit (10MB)',
      details: 'Please upload a smaller file',
      requestId
    });
  }
  
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({
      error: 'Too Many Files',
      message: 'Too many files uploaded at once',
      details: 'Please upload only one file at a time',
      requestId
    });
  }
  
  // ✅ SECURITY: Handle multer file filter errors
  if (err.message && (
    err.message.includes('Only PDF files are allowed') ||
    err.message.includes('Invalid file extension') ||
    err.message.includes('Suspicious filename detected')
  )) {
    return res.status(400).json({
      error: 'File Upload Error',
      message: err.message,
      details: 'Please upload a valid PDF file'
    });
  }
  
  // ✅ SECURITY: Handle Stripe errors
  if (err.type && err.type.startsWith('Stripe')) {
    return res.status(400).json({
      error: 'Payment Error',
      message: 'Payment processing failed',
      details: err.message,
      requestId
    });
  }
  
  // ✅ SECURITY: Handle Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    return res.status(401).json({
      error: 'Authentication Error',
      message: 'Authentication failed',
      details: 'Please log in again',
      requestId
    });
  }
  
  
  // Generic error response (don't expose internal details)
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.',
    requestId
  });
});

// Memory monitoring endpoint for admin dashboard
app.get("/admin/memory-stats", ...adminProtected, async (req, res) => {
  try {
    const memoryStats = fileMemoryMonitor.getMemoryStats();
    const monitoringStats = fileMemoryMonitor.getMonitoringStats();
    
    res.json({
      success: true,
      memory: memoryStats,
      monitoring: monitoringStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Memory stats error:', error);
    res.status(500).json({
      error: 'Failed to get memory statistics',
      message: error.message
    });
  }
});

// ✅ OPERATIONAL FIX: Comprehensive health check endpoint with performance metrics and log rotation
app.get("/", globalLimiter, validateQuery(healthQuerySchema), async (req, res) => {
  try {
    const startTime = Date.now();
    const healthStatus = {
      status: "OpssFlow Backend API",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks: {},
      performance: {}
    };
    
    // Check Firebase connectivity
    try {
      await db.ref('.info/connected').once('value');
      healthStatus.checks.firebase = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      healthStatus.checks.firebase = { status: 'unhealthy', message: error.message };
    }
    
    // Check Stripe connectivity
    try {
      await stripe.customers.list({ limit: 1 });
      healthStatus.checks.stripe = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      healthStatus.checks.stripe = { status: 'unhealthy', message: error.message };
    }
    
    // Check AWS SES connectivity
    try {
      await sesClient.config.credentials();
      healthStatus.checks.awsSes = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      healthStatus.checks.awsSes = { status: 'unhealthy', message: error.message };
    }
    
    // Check Cognito connectivity
    try {
      await cognitoClient.config.credentials();
      healthStatus.checks.cognito = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      healthStatus.checks.cognito = { status: 'unhealthy', message: error.message };
    }
    
    // ✅ MINOR FIX: Add performance metrics and response time
    const responseTime = Date.now() - startTime;
    healthStatus.performance = {
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
    
    // ✅ MINOR FIX: Add log rotation status if requested
    if (req.query.logRotation) {
      try {
        const logStats = await getLogRotationStats();
        healthStatus.logRotation = logStats;
      } catch (logError) {
        healthStatus.logRotation = { status: 'error', message: logError.message };
      }
    }
    
    // Determine overall health
    const allChecksHealthy = Object.values(healthStatus.checks)
      .every(check => check.status === 'healthy');
    
    healthStatus.overall = allChecksHealthy ? 'healthy' : 'degraded';
    
    const statusCode = allChecksHealthy ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: "OpssFlow Backend API",
      version: "1.0.0",
      overall: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});




// Helper function to get Stripe price ID based on plan




// Note: Scheduled downgrade endpoints removed - users must cancel first, then choose new plan

// Helper function to get tier hierarchy (same as frontend)






// Admin: Get all users with subscription data























const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  const serviceName = 'ReconFY Backend API';
  const environment = process.env.NODE_ENV || 'development';
  const version = process.env.npm_package_version || 'unknown';
  const gitSha = process.env.GIT_SHA && process.env.GIT_SHA.trim() !== '' ? process.env.GIT_SHA.trim() : null;
  const startedAt = new Date().toISOString();

  // One-line human-friendly banner
  console.log(`[STARTUP] 🚀 ${serviceName} v${version} started on port ${PORT} in ${environment} at ${startedAt}`);

  // Structured startup summary (machine-readable)
  // Normalize regions (force us-east-1 if misconfigured as eu-north-1)
  const normalizedAwsRegion = (process.env.AWS_REGION === 'eu-north-1') ? 'us-east-1' : process.env.AWS_REGION;
  const normalizedCognitoRegion = (process.env.COGNITO_REGION === 'eu-north-1') ? 'us-east-1' : process.env.COGNITO_REGION;

  const startupSummary = {
    event: 'service_started',
    service: serviceName,
    version,
    environment,
    port: Number(PORT),
    timezone: process.env.TZ || 'UTC',
    features: {
      cors: true,
      helmet: true,
      rateLimiting: true,
      requestIdTracking: true,
      webhookCircuitBreaker: true,
      webhookDeduplication: true,
      auditLogging: {
        userActions: true
      },
      memoryMonitoring: true
    },
    dependencies: {
      stripeApiVersion: '2023-10-16',
      awsRegion: normalizedAwsRegion,
      cognitoRegion: normalizedCognitoRegion
    },
    health: {
      status: 'starting'
    },
    startedAt
  };
  // Only include gitSha when available
  if (gitSha) {
    startupSummary.gitSha = gitSha;
  }
  console.log(JSON.stringify(startupSummary));

  if (environment === 'development') {
    // Helpful endpoint overview in development only
    console.log('[STARTUP] 📡 Endpoints overview');
    console.log('  🔐 Auth:              /subscription/me, /subscription/validate');
    console.log('  💳 Subscription:      /update-subscription-plan, /create-checkout-session, /verify-payment, /cancel-subscription, /reactivate-subscription');
    console.log('  📊 Analytics:         /analytics, /analytics/location/:locationId');
    console.log('  📍 Locations:         /admin/users/:userId/locations, /admin/users/:userId/locations/:locationId');
    console.log('  🎫 Contact:           /contact, /ticket/:ticketNumber');
    console.log('  📋 Admin:             /admin/users, /admin/audit-logs, /admin/contact-inquiries');
    console.log('  🔄 Webhooks:          /webhook, /admin/retry-failed-webhooks, /admin/webhook-stats, /admin/webhook-health');
    console.log('  📊 SaaS Metrics:      /admin/business-metrics, /admin/system-health, /admin/cleanup-duplicate-subscriptions');
    console.log('  ⏰ Trial Management:  /admin/trial-expiry-status, /admin/trigger-trial-expiry');
  }
  
  // Start enhanced memory monitoring
  fileMemoryMonitor.start();
  console.log('[STARTUP] 🧠 Enhanced Memory Monitoring: ACTIVE');
  
  // Start trial expiry scheduler
  trialExpiryScheduler.start();
  console.log('[STARTUP] ⏰ Trial Expiry Scheduler: ACTIVE');
});






