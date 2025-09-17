# ReconFY Backend API

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.18%2B-blue.svg)](https://expressjs.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-orange.svg)](https://firebase.google.com/)
[![Stripe](https://img.shields.io/badge/Stripe-API%20v2023.10.16-purple.svg)](https://stripe.com/)
[![AWS](https://img.shields.io/badge/AWS-Cognito%20%7C%20S3%20%7C%20SES-yellow.svg)](https://aws.amazon.com/)

**ReconFY Backend** is a comprehensive Node.js/Express API serving a financial analysis SaaS platform. It provides subscription management, document processing, expense tracking, and administrative capabilities with enterprise-grade security and scalability.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Processing    │
│   (React/Vue)   │◄──►│   (Express.js)  │◄──►│   (FastAPI)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────────────┐
        │                 External Services                    │
        ├─────────────────┬─────────────────┬─────────────────┤
        │   AWS Cognito   │   Firebase DB   │   Stripe API    │
        │ (Authentication)│  (Real-time DB) │   (Payments)    │
        ├─────────────────┼─────────────────┼─────────────────┤
        │    AWS S3       │    AWS SES      │   Python ML     │
        │ (File Storage)  │    (Email)      │  (PDF Analysis) │
        └─────────────────┴─────────────────┴─────────────────┘
```

## 🚀 Key Features

### 🔐 Authentication & Authorization
- **AWS Cognito JWT Authentication** with group-based authorization
- **Role-based Access Control** (Admin, Customer)
- **Subscription-based Feature Access** with tier validation
- **Request ID Tracking** for audit trails

### 💳 Subscription Management
- **Stripe Integration** with webhooks for real-time updates
- **Multi-tier Plans** (Starter, Growth, Pro, Enterprise)
- **Billing Portal Integration** for customer self-service
- **Subscription Lifecycle Management** (create, upgrade, cancel, reactivate)

### 📊 Financial Analytics
- **TSP ID Extraction** from PDF documents using Python/PyMuPDF
- **Expense Tracking** with file attachments via S3
- **Profit Calculation** and revenue forecasting
- **Multi-location Business Support** with TSP tracking

### 🏢 Enterprise Features
- **Immutable Audit Logging** with integrity verification
- **Circuit Breaker Pattern** for webhook resilience
- **Rate Limiting** with proxy header support
- **Memory Monitoring** and automatic cleanup
- **Comprehensive Error Handling** with request correlation

### 📞 Customer Support
- **Contact Management System** with ticketing
- **Admin Response Portal** with email notifications
- **Ticket Tracking** for customer portal
- **Priority and Category Management**

## 📁 Project Structure

```
ReconFY-backend-stripe/
├── 📄 index.js                 # Main application entry point
├── 📄 package.json             # Dependencies and scripts
├── 📄 schemas.js               # Joi validation schemas
├── 📄 cognitoAuth.js           # JWT authentication middleware
├── 📄 auditLogger.js           # Immutable audit logging
├── 📄 firebaseEndpoints.js     # Firebase DB operations
├── 📄 firebaseHandler.js       # Firebase business logic
├── 📁 routes/                  # Modular route handlers
│   ├── 📄 contactRoutes.js     # Customer support & tickets
│   ├── 📄 subscriptionRoutes.js # Stripe & billing management
│   ├── 📄 analyticsRoutes.js   # Financial analytics APIs
│   ├── 📄 adminRoutes.js       # Admin panel & system health
│   ├── 📄 adminUserRoutes.js   # User management (admin)
│   ├── 📄 tspIdRoutes.js       # PDF processing & TSP extraction
│   ├── 📄 webhookRoutes.js     # Stripe webhook handling
│   ├── 📄 proxyRoutes.js       # Processing backend proxy
│   └── 📄 firebaseExpenseRoutes.js # Expense file management
├── 📁 middleware/              # Custom middleware
│   ├── 📄 rateLimiting.js      # Rate limiting configurations
│   ├── 📄 validation.js       # Request validation middleware
│   └── 📄 stacks.js           # Middleware stacks
├── 📁 utils/                   # Utility functions
│   ├── 📄 emailUtils.js        # SES email templates & sending
│   ├── 📄 stripeHelpers.js     # Stripe price & tier utilities
│   ├── 📄 s3Utils.js           # S3 upload/download operations
│   ├── 📄 subscriptionUtils.js # Subscription business logic
│   ├── 📄 circuitBreaker.js    # Webhook failure protection
│   ├── 📄 memoryMonitor.js     # Memory usage tracking
│   ├── 📄 webhookProcessing.js # Webhook event handling
│   └── 📄 auditUtils.js        # Audit logging helpers
├── 📁 python/                  # Python PDF processing scripts
│   └── 📄 pdf_processor_pypdf2.py # TSP ID extraction
└── 📁 deploy/                  # Deployment configurations
    └── 📄 nginx.conf           # Nginx reverse proxy config
```

## 🔧 Installation & Setup

### Prerequisites
- **Node.js 18+** and npm
- **Python 3.8+** with PyMuPDF (`pip install PyMuPDF`)
- **AWS Account** (Cognito, S3, SES access)
- **Firebase Project** with Realtime Database
- **Stripe Account** with API keys

### Environment Variables

Create a `.env` file with the following configuration:

```bash
# Server Configuration
NODE_ENV=development
PORT=8080
TZ=UTC

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# AWS Cognito
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx

# AWS S3
S3_BUCKET_NAME=your-reconfy-bucket

# AWS SES
SES_FROM_EMAIL=noreply@yourdomain.com

# Firebase
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...}
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com/

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxx
STRIPE_STARTER_PRICE_ID=price_xxxxxxxxx
STRIPE_GROWTH_PRICE_ID=price_xxxxxxxxx
STRIPE_PRO_PRICE_ID=price_xxxxxxxxx
STRIPE_ENTERPRISE_PRICE_ID=price_xxxxxxxxx

# Processing Backend
PROCESSING_BACKEND_URL=https://your-processing-backend.com

# CORS Configuration
FRONTEND_URLS=http://localhost:3000,https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
```

### Installation Steps

1. **Clone and Install Dependencies**
   ```bash
   git clone <repository-url>
   cd ReconFY-backend-stripe
   npm install
   ```

2. **Install Python Dependencies**
   ```bash
   pip install PyMuPDF python-shell
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   # or
   npm start
   ```

5. **Verify Installation**
   ```bash
   curl http://localhost:8080/
   # Should return health check with service status
   ```

## 📚 API Documentation

### Base URL
- **Development**: `http://localhost:8080`
- **Production**: `https://api.yourdomain.com`

### Authentication
All protected endpoints require an **Authorization header**:
```
Authorization: Bearer <jwt-token>
```

### Core Endpoints

#### 🔐 Authentication & Subscription
```http
GET    /subscription/me           # Get current user's subscription
GET    /subscription/validate     # Validate subscription access
POST   /create-checkout-session   # Create Stripe checkout
POST   /verify-payment           # Verify payment completion
POST   /cancel-subscription      # Cancel subscription
POST   /reactivate-subscription  # Reactivate subscription
POST   /create-billing-portal-session # Access billing portal
```

#### 📊 Analytics & Data
```http
GET    /analytics                # Get user's analytics
POST   /analytics                # Create analytics record
DELETE /analytics/:id            # Delete specific analytics
DELETE /analytics               # Delete all user analytics
```

#### 📞 Contact & Support
```http
POST   /contact                  # Submit contact inquiry
GET    /ticket/:ticketNumber     # Get ticket details
POST   /ticket/:ticketNumber/reply # Reply to ticket
```

#### 📄 Document Processing
```http
POST   /extract-tsp-id          # Extract TSP ID from single PDF
POST   /extract-tsp-ids-batch   # Batch process multiple PDFs
POST   /process-files           # Process files via backend proxy
GET    /download-report         # Download generated report
```

#### 🗄️ Firebase Database Operations
```http
# User Management
POST   /firebase/users          # Create user
GET    /firebase/user-analytics/:userId # Get user analytics

# Expense Management
POST   /firebase/expenses/upload # Upload expense attachment
GET    /firebase/expenses/:userId/:locationId/:monthYear # Get expenses
POST   /firebase/expenses/:userId/:locationId/:monthYear # Create expense
PUT    /firebase/expenses/:userId/:locationId/:monthYear/:expenseId # Update expense
DELETE /firebase/expenses/:userId/:locationId/:monthYear/:expenseId # Delete expense

# Location Management
GET    /firebase/locations/:userId # Get user locations
POST   /firebase/locations/:userId # Create location
PUT    /firebase/locations/:userId/:locationId # Update location
DELETE /firebase/locations/:userId/:locationId # Delete location
```

#### 🛡️ Admin Endpoints
```http
# User Management
GET    /admin/users             # List all users
DELETE /admin/users/:userId     # Delete user
PUT    /admin/users/:userId/subscription # Update user subscription
GET    /admin/users/:userId/locations # Get user locations
DELETE /admin/users/:userId/locations/:locationId # Delete location

# System Monitoring
GET    /admin/audit-logs        # Get audit logs
GET    /admin/business-metrics  # Business KPIs
GET    /admin/system-health     # System health check
GET    /admin/memory-stats      # Memory usage statistics

# Contact Management
GET    /admin/contact-inquiries # List contact inquiries
PUT    /admin/contact-inquiries/:id # Update inquiry
POST   /admin/contact-inquiries/:id/respond # Send response
DELETE /admin/contact-inquiries/:id # Delete inquiry
GET    /admin/contact-inquiries/stats # Inquiry statistics

# Webhook Management
GET    /admin/webhook-stats     # Webhook statistics
GET    /admin/webhook-health    # Webhook health status
POST   /admin/retry-failed-webhooks # Retry failed webhooks
```

#### 🔄 Webhooks
```http
POST   /webhook                 # Stripe webhook endpoint (Stripe only)
```

### Response Format

**Success Response:**
```json
{
  "success": true,
  "data": {...},
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Error Response:**
```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "details": "Additional context",
  "requestId": "req_1705317000000_abc123"
}
```

## 🔒 Security Implementation

### Authentication Flow
1. **Frontend** authenticates users via AWS Cognito
2. **JWT tokens** are issued with user claims and groups
3. **Backend middleware** validates JWT signatures using Cognito JWKS
4. **Authorization** checks user groups (Admins, Customers)

### Security Features
- **Environment-based CORS** with origin validation
- **Rate limiting** with multiple tiers by endpoint type
- **Request ID tracking** for audit correlation
- **File upload validation** with type and size restrictions
- **SQL injection prevention** via parameterized Firebase queries
- **Memory leak prevention** with automatic cleanup

### Data Protection
- **Immutable audit logs** with cryptographic integrity
- **Sensitive data encryption** in audit trails
- **S3 presigned URLs** for secure file access
- **Environment variable validation** on startup

## 🚀 Production Deployment

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

### Environment Setup
1. **Configure production environment variables**
2. **Set up AWS services** (Cognito, S3, SES)
3. **Configure Firebase** with production database
4. **Set up Stripe webhooks** pointing to your domain
5. **Configure reverse proxy** (Nginx recommended)

### Monitoring & Logging
- **Health check endpoint**: `GET /` returns system status
- **Memory monitoring**: `GET /admin/memory-stats`
- **Webhook monitoring**: `GET /admin/webhook-health`
- **Audit trail access**: `GET /admin/audit-logs`

### Performance Considerations
- **Process pooling** for Python PDF processing
- **Memory cleanup** after file operations
- **Circuit breakers** for external service failures
- **Database pagination** for large result sets

## 🧪 Development

### Code Quality
```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Health check
curl http://localhost:8080/
```

### Testing
```bash
# Test health endpoint
curl -X GET http://localhost:8080/

# Test authentication (requires valid JWT)
curl -X GET http://localhost:8080/subscription/me \
  -H "Authorization: Bearer <jwt-token>"

# Test file upload
curl -X POST http://localhost:8080/extract-tsp-id \
  -H "Authorization: Bearer <jwt-token>" \
  -F "pdfFile=@sample.pdf"
```

### Database Schema
The application uses **Firebase Realtime Database** with the following structure:

```
/users
  /{userId}
    /subscription: { status, tier, stripeCustomerId, ... }
    /locations: { locationId: { name, tspId, ... } }
/analytics
  /{userId}
    /{analyticsId}: { analysisType, totalProfit, ... }
/contactInquiries
  /{inquiryId}: { ticketNumber, status, message, ... }
/auditLogs
  /{logId}: { action, timestamp, adminUser, ... }
```

## 📈 Business Metrics

### Subscription Tiers
- **Starter**: $99/month - Basic features
- **Growth**: $199/month - Advanced analytics
- **Pro**: $249/month - Multi-location support
- **Enterprise**: $299/month - Custom features

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

## 📄 License

This project is proprietary software. All rights reserved.

## 📞 Support

- **Documentation**: [API Docs](./docs/api.md)
- **Email**: support@yourdomain.com
- **Enterprise**: enterprise@yourdomain.com

## 🔄 Changelog

### v1.0.0 (Current)
- ✅ Initial release with full SaaS functionality
- ✅ Stripe subscription management
- ✅ AWS Cognito authentication
- ✅ Firebase real-time database
- ✅ PDF TSP ID extraction
- ✅ Admin portal with audit logging
- ✅ Contact management system
- ✅ Memory monitoring and optimization
- ✅ Circuit breaker for webhook resilience

---

**ReconFY Backend** - Powering financial analysis with enterprise-grade reliability.