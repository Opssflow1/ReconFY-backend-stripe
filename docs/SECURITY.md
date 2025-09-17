# Security Documentation

## Overview

ReconFY Backend implements enterprise-grade security measures to protect user data, financial transactions, and system integrity. This document outlines the security architecture, authentication mechanisms, and best practices implemented in the system.

## Authentication & Authorization

### AWS Cognito Integration

The system uses **AWS Cognito** as the primary identity provider with JWT-based authentication.

#### Authentication Flow
```
1. Frontend → AWS Cognito (Login)
2. Cognito → JWT Token (with user claims)
3. Frontend → Backend (JWT in Authorization header)
4. Backend → Cognito JWKS (Token validation)
5. Backend → Protected Resource (Authorized access)
```

#### JWT Token Structure
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "cognito:groups": ["Customers"],
  "cognito:username": "user@example.com",
  "iat": 1705317000,
  "exp": 1705320600,
  "iss": "https://cognito-idp.region.amazonaws.com/pool-id"
}
```

#### Authorization Levels

| Level | Description | Implementation |
|-------|-------------|----------------|
| **Public** | No authentication required | Health endpoints, webhooks |
| **Authenticated** | Valid JWT token required | User profile, basic analytics |
| **Active Subscription** | Valid subscription + JWT | Premium features, file processing |
| **Admin Only** | Admin group membership | User management, system monitoring |

### Middleware Security Stack

#### 1. JWT Validation (`cognitoAuth.js`)
```javascript
// Validates JWT signature against Cognito JWKS
const cognitoAuthenticate = (req, res, next) => {
  // Extract Bearer token
  // Verify signature using Cognito public keys
  // Decode user claims
  // Set req.user with authenticated user data
}
```

#### 2. Subscription Validation (`subscriptionAuth.js`)
```javascript
// Validates active subscription for premium features
const requireActiveSubscription = async (req, res, next) => {
  // Check subscription status in Firebase
  // Validate subscription tier vs. requested feature
  // Set req.subscription with subscription data
}
```

#### 3. Role-Based Access Control
```javascript
// Admin group check
const groups = req.user["cognito:groups"] || [];
if (!groups.includes("Admins")) {
  return res.status(403).json({ error: "Forbidden: Admins only" });
}
```

## Data Protection

### Encryption in Transit
- **TLS 1.2+** for all HTTPS communications
- **Certificate pinning** for AWS services
- **Secure headers** via Helmet.js

### Encryption at Rest
- **Firebase Realtime Database** with built-in encryption
- **AWS S3** with server-side encryption (SSE-S3)
- **Sensitive audit data** encrypted before storage

### Data Classification

| Classification | Data Types | Protection Level |
|---------------|------------|------------------|
| **Public** | Health status, API documentation | Basic HTTPS |
| **Internal** | System metrics, non-PII logs | Authenticated access |
| **Confidential** | User profiles, financial data | Encrypted + access control |
| **Restricted** | Payment details, audit logs | Multi-layer encryption + immutable storage |

## Input Validation & Sanitization

### Joi Schema Validation
All API endpoints use **Joi schemas** for comprehensive input validation:

```javascript
// Example: Contact form validation
const contactSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).required(),
  lastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  message: Joi.string().min(10).max(1000).required()
});
```

### File Upload Security
```javascript
// File type validation
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];

// File size limits
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
  files: 1 // Single file per request
};

// Suspicious filename detection
const suspiciousPatterns = ['..', '\\', '/', 'cmd', 'bat', 'exe', 'sh'];
```

## Rate Limiting & DDoS Protection

### Multi-Tier Rate Limiting
```javascript
// Global rate limiting
globalLimiter: 5000 requests per 15 minutes

// Authentication endpoints
authLimiter: 50 requests per 15 minutes

// Contact form
contactLimiter: 25 requests per hour

// Webhooks
webhookLimiter: 500 requests per minute

// Admin endpoints
adminLimiter: 1000 requests per 15 minutes
```

### Request Correlation
Every request gets a unique **Request ID** for audit trails:
```javascript
// Format: req_timestamp_randomstring
req_1705317000000_abc123def
```

## Secure Communication

### CORS Configuration
```javascript
// Environment-based CORS
const allowedOrigins = [
  "https://yourdomain.com",
  "https://admin.yourdomain.com",
  // Development origins in dev mode only
  ...(process.env.NODE_ENV === 'development' ? ["http://localhost:3000"] : [])
];
```

### Security Headers (Helmet.js)
```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://cognito-idp.*"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  xssFilter: true,
  frameguard: { action: 'deny' }
})
```

## Audit Logging & Monitoring

### Immutable Audit Trail
All administrative actions are logged in an **immutable audit trail** with:

```javascript
const auditEntry = {
  id: logId,
  timestamp: ISO8601,
  adminUser: { id, email, sessionId },
  action: { type, category },
  target: { userId, email, type },
  changes: { before, after, modifiedFields },
  security: {
    ipAddress,
    userAgent,
    geoLocation,
    riskScore
  },
  integrity: {
    hash: SHA256(entry),
    signature: HMAC(entry, secret)
  }
};
```

### Security Monitoring
- **Failed login attempts** tracking
- **Suspicious activity** detection
- **Rate limit violations** alerting
- **Webhook signature failures** monitoring

## Error Handling & Information Disclosure

### Secure Error Responses
```javascript
// Production error handling
if (process.env.NODE_ENV === 'production') {
  // Generic error message
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Something went wrong. Please try again later.',
    requestId: req.headers['x-request-id']
  });
} else {
  // Detailed error in development
  res.status(500).json({
    error: error.name,
    message: error.message,
    stack: error.stack,
    requestId: req.headers['x-request-id']
  });
}
```

### Sensitive Data Redaction
```javascript
// Remove sensitive data from logs
const sanitizedRequest = {
  ...request,
  password: '[REDACTED]',
  creditCard: '[REDACTED]',
  ssn: '[REDACTED]'
};
```

## Payment Security (PCI Compliance)

### Stripe Integration
- **No card data storage** on backend servers
- **Stripe-hosted checkout** for PCI compliance
- **Webhook signature verification** for event integrity
- **Idempotency keys** for duplicate prevention

### Webhook Security
```javascript
// Stripe webhook verification
const sig = req.headers["stripe-signature"];
const event = stripe.webhooks.constructEvent(
  req.body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

### Circuit Breaker Pattern
```javascript
// Prevent cascading failures
const webhookCircuitBreaker = {
  failureThreshold: 5,
  recoveryTimeout: 60000,
  state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
};
```

## Memory Security

### Memory Leak Prevention
```javascript
// Automatic cleanup after file processing
const memoryCleanup = {
  comprehensiveCleanup: async (files, tempDir, context) => {
    // Clean file buffers
    // Remove temporary files
    // Force garbage collection
    // Log memory usage
  }
};
```

### Process Management
```javascript
// Python process pooling with timeouts
const pythonProcessManager = {
  execute: async (script, args, options) => {
    // Process timeout: 30 seconds
    // Memory limit enforcement
    // Automatic process cleanup
  }
};
```

## Environment Security

### Environment Variable Validation
```javascript
const requiredEnvVars = [
  'FIREBASE_SERVICE_ACCOUNT',
  'STRIPE_SECRET_KEY',
  'AWS_ACCESS_KEY_ID',
  'COGNITO_USER_POOL_ID'
];

// Validate on startup
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  process.exit(1);
}
```

### Secret Management
- **AWS Systems Manager Parameter Store** for production secrets
- **Environment-based configuration** for different deployment stages
- **No hardcoded credentials** in source code
- **Secret rotation** procedures documented

## Deployment Security

### Container Security
```dockerfile
# Use minimal base image
FROM node:18-alpine

# Non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S reconfy -u 1001

# Copy and set permissions
COPY --chown=reconfy:nodejs . /app
USER reconfy
```

### Network Security
```nginx
# Nginx security configuration
server {
  # Hide server information
  server_tokens off;

  # Security headers
  add_header X-Frame-Options DENY;
  add_header X-Content-Type-Options nosniff;
  add_header X-XSS-Protection "1; mode=block";

  # Rate limiting
  limit_req zone=api burst=10 nodelay;
}
```

## Incident Response

### Security Incident Procedures
1. **Detection** - Automated monitoring alerts
2. **Containment** - Immediate access revocation
3. **Investigation** - Audit log analysis
4. **Recovery** - System restoration procedures
5. **Lessons Learned** - Security improvements

### Contact Information
- **Security Team**: security@yourdomain.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX
- **PGP Key**: Available at security.yourdomain.com/pgp

## Compliance & Standards

### Frameworks
- **OWASP Top 10** - Web application security
- **NIST Cybersecurity Framework** - Risk management
- **SOC 2 Type II** - Service organization controls

### Regular Security Activities
- **Quarterly penetration testing**
- **Monthly vulnerability scans**
- **Weekly security training**
- **Daily security monitoring**

## Security Best Practices

### Development Guidelines
1. **Never commit secrets** to version control
2. **Use parameterized queries** for database operations
3. **Validate all inputs** on both client and server
4. **Implement proper error handling** without information disclosure
5. **Use HTTPS everywhere** for data transmission
6. **Follow principle of least privilege** for access control

### Operational Guidelines
1. **Regular security updates** for all dependencies
2. **Monitoring and alerting** for security events
3. **Backup and recovery** procedures tested monthly
4. **Incident response plan** updated quarterly
5. **Security awareness training** for all team members

## Security Testing

### Automated Security Scanning
```yaml
# GitHub Actions security workflow
name: Security Scan
on: [push, pull_request]
jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run npm audit
        run: npm audit --audit-level high
      - name: Run Snyk security scan
        run: npx snyk test
```

### Manual Security Testing
- **Authentication bypass testing**
- **Authorization escalation testing**
- **Input validation testing**
- **Session management testing**
- **File upload security testing**

---

For security-related questions or to report vulnerabilities, please contact our security team at security@yourdomain.com.