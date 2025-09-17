# Environment Configuration Guide

## Overview

This document provides comprehensive guidance on configuring environment variables for the ReconFY Backend API. Proper configuration is essential for security, functionality, and deployment across different environments.

## Required Environment Variables

### Server Configuration

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `NODE_ENV` | string | No | `development` | Application environment (`development`, `production`, `staging`) |
| `PORT` | number | No | `8080` | Server port number |
| `TZ` | string | No | `UTC` | Timezone for consistent date/time handling |

**Example:**
```bash
NODE_ENV=production
PORT=8080
TZ=UTC
```

### AWS Configuration

#### Core AWS Settings
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `AWS_REGION` | string | ✅ | AWS region for all services (e.g., `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | string | ✅ | AWS access key for API authentication |
| `AWS_SECRET_ACCESS_KEY` | string | ✅ | AWS secret key for API authentication |

#### AWS Cognito
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `COGNITO_REGION` | string | ✅ | AWS Cognito region (usually same as `AWS_REGION`) |
| `COGNITO_USER_POOL_ID` | string | ✅ | Cognito User Pool ID (format: `us-east-1_xxxxxxxxx`) |

#### AWS S3
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `S3_BUCKET_NAME` | string | ✅ | S3 bucket name for file storage |

#### AWS SES
| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `SES_FROM_EMAIL` | string | ✅ | Verified email address for sending notifications |

**Example:**
```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY_ID_HERE
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_ACCESS_KEY_HERE

# AWS Cognito
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_YOUR_POOL_ID

# AWS S3
S3_BUCKET_NAME=your-bucket-name-here

# AWS SES
SES_FROM_EMAIL=noreply@yourdomain.com
```

### Firebase Configuration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | JSON string | ✅ | Firebase service account credentials (entire JSON object as string) |
| `FIREBASE_DATABASE_URL` | string | ✅ | Firebase Realtime Database URL |

**Service Account JSON Structure:**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40your-project.iam.gserviceaccount.com"
}
```

**Example:**
```bash
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project-id",...}'
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com/
```

### Stripe Configuration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `STRIPE_SECRET_KEY` | string | ✅ | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | string | ✅ | Stripe webhook endpoint secret (`whsec_...`) |
| `STRIPE_STARTER_PRICE_ID` | string | ✅ | Price ID for Starter plan |
| `STRIPE_GROWTH_PRICE_ID` | string | ✅ | Price ID for Growth plan |
| `STRIPE_PRO_PRICE_ID` | string | ✅ | Price ID for Pro plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | string | ✅ | Price ID for Enterprise plan |

**Example:**
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET_HERE
STRIPE_STARTER_PRICE_ID=price_YOUR_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID=price_YOUR_GROWTH_PRICE_ID
STRIPE_PRO_PRICE_ID=price_YOUR_PRO_PRICE_ID
STRIPE_ENTERPRISE_PRICE_ID=price_YOUR_ENTERPRISE_PRICE_ID
```

### Processing Backend

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `PROCESSING_BACKEND_URL` | string | No | `https://your-processing-backend.com` | URL of the file processing backend service |

**Example:**
```bash
PROCESSING_BACKEND_URL=https://your-processing-backend.com
```

### CORS Configuration

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `FRONTEND_URLS` | string | No | Comma-separated list of frontend URLs for CORS |
| `ALLOWED_ORIGINS` | string | No | Comma-separated list of additional allowed origins |

**Example:**
```bash
# CORS Configuration
FRONTEND_URLS=https://yourdomain.com,https://app.yourdomain.com
ALLOWED_ORIGINS=https://admin.yourdomain.com,https://dashboard.yourdomain.com
```

## Environment-Specific Configuration

### Development Environment

Create a `.env` file in the project root:

```bash
# Development Environment
NODE_ENV=development
PORT=8080
TZ=UTC

# AWS (Development)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-dev-access-key
AWS_SECRET_ACCESS_KEY=your-dev-secret-key
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_your-dev-pool-id
S3_BUCKET_NAME=your-dev-bucket-name
SES_FROM_EMAIL=dev@yourdomain.com

# Firebase (Development)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-dev-project",...}'
FIREBASE_DATABASE_URL=https://your-dev-project-default-rtdb.firebaseio.com/

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID=price_test_YOUR_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID=price_test_YOUR_GROWTH_PRICE_ID
STRIPE_PRO_PRICE_ID=price_test_YOUR_PRO_PRICE_ID
STRIPE_ENTERPRISE_PRICE_ID=price_test_YOUR_ENTERPRISE_PRICE_ID

# Processing Backend (Development)
PROCESSING_BACKEND_URL=http://localhost:8000

# CORS (Development)
FRONTEND_URLS=http://localhost:3000,http://127.0.0.1:3000
ALLOWED_ORIGINS=http://localhost:3001
```

### Staging Environment

```bash
# Staging Environment
NODE_ENV=staging
PORT=8080
TZ=UTC

# AWS (Staging)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-staging-access-key
AWS_SECRET_ACCESS_KEY=your-staging-secret-key
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_your-staging-pool-id
S3_BUCKET_NAME=your-staging-bucket-name
SES_FROM_EMAIL=staging@yourdomain.com

# Firebase (Staging)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-staging-project",...}'
FIREBASE_DATABASE_URL=https://your-staging-project-default-rtdb.firebaseio.com/

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_YOUR_STAGING_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STAGING_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID=price_staging_YOUR_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID=price_staging_YOUR_GROWTH_PRICE_ID
STRIPE_PRO_PRICE_ID=price_staging_YOUR_PRO_PRICE_ID
STRIPE_ENTERPRISE_PRICE_ID=price_staging_YOUR_ENTERPRISE_PRICE_ID

# Processing Backend (Staging)
PROCESSING_BACKEND_URL=https://staging-api.yourdomain.com

# CORS (Staging)
FRONTEND_URLS=https://staging.yourdomain.com
ALLOWED_ORIGINS=https://staging-admin.yourdomain.com
```

### Production Environment

```bash
# Production Environment
NODE_ENV=production
PORT=8080
TZ=UTC

# AWS (Production)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-prod-access-key
AWS_SECRET_ACCESS_KEY=your-prod-secret-key
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_your-prod-pool-id
S3_BUCKET_NAME=your-production-bucket-name
SES_FROM_EMAIL=noreply@yourdomain.com

# Firebase (Production)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-prod-project",...}'
FIREBASE_DATABASE_URL=https://your-prod-project-default-rtdb.firebaseio.com/

# Stripe (Live Mode)
STRIPE_SECRET_KEY=sk_live_YOUR_STRIPE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_STRIPE_WEBHOOK_SECRET_HERE
STRIPE_STARTER_PRICE_ID=price_live_YOUR_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID=price_live_YOUR_GROWTH_PRICE_ID
STRIPE_PRO_PRICE_ID=price_live_YOUR_PRO_PRICE_ID
STRIPE_ENTERPRISE_PRICE_ID=price_live_YOUR_ENTERPRISE_PRICE_ID

# Processing Backend (Production)
PROCESSING_BACKEND_URL=https://your-processing-backend.com

# CORS (Production)
FRONTEND_URLS=https://yourdomain.com,https://app.yourdomain.com
ALLOWED_ORIGINS=https://admin.yourdomain.com
```

## Security Best Practices

### Environment Variable Security

1. **Never commit `.env` files** to version control
2. **Use strong, unique secrets** for each environment
3. **Rotate secrets regularly** (quarterly recommended)
4. **Use AWS Systems Manager Parameter Store** or similar for production
5. **Encrypt sensitive values** when stored in CI/CD systems

### Access Control

1. **Limit AWS IAM permissions** to minimum required
2. **Use separate AWS accounts** for different environments
3. **Enable MFA** for AWS console access
4. **Regular access audits** for service accounts

### Monitoring

1. **Monitor failed authentication attempts** in Cognito
2. **Alert on unusual API usage patterns** in Stripe
3. **Track S3 access logs** for file operations
4. **Monitor Firebase database rules** for unauthorized access

## Validation

The application validates all required environment variables on startup:

```javascript
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
  'S3_BUCKET_NAME'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ CRITICAL: Missing required environment variables:', missingEnvVars);
  process.exit(1);
}
```

## Deployment Configurations

### Docker Environment

```dockerfile
# Use build args for non-sensitive configuration
ARG NODE_ENV=production
ARG PORT=8080

# Set environment variables
ENV NODE_ENV=$NODE_ENV
ENV PORT=$PORT
ENV TZ=UTC

# Sensitive variables should be provided at runtime
# via docker run -e or docker-compose environment
```

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: .
    environment:
      - NODE_ENV=production
      - PORT=8080
      - TZ=UTC
    env_file:
      - .env.production
    ports:
      - "8080:8080"
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reconfy-backend
spec:
  template:
    spec:
      containers:
      - name: api
        image: reconfy/backend:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "8080"
        envFrom:
        - secretRef:
            name: reconfy-secrets
        - configMapRef:
            name: reconfy-config
```

### AWS Systems Manager Integration

For production environments, consider using AWS Systems Manager Parameter Store:

```javascript
// utils/configLoader.js
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({ region: process.env.AWS_REGION });

export const loadSecret = async (parameterName) => {
  const command = new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true
  });

  const response = await ssmClient.send(command);
  return response.Parameter.Value;
};

// Load Stripe secret from Parameter Store
const stripeSecretKey = await loadSecret('/reconfy/prod/stripe/secret-key');
```

## Troubleshooting

### Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Missing Environment Variables** | App exits on startup with error | Check `.env` file exists and contains all required variables |
| **Invalid Firebase JSON** | Firebase authentication fails | Validate JSON syntax and escape quotes properly |
| **Cognito Authentication Fails** | JWT validation errors | Verify `COGNITO_USER_POOL_ID` format and region |
| **Stripe Webhook Fails** | Webhook signature verification fails | Ensure `STRIPE_WEBHOOK_SECRET` matches Stripe dashboard |
| **S3 Upload Fails** | File upload errors | Check AWS credentials and S3 bucket permissions |
| **CORS Errors** | Frontend can't connect | Add frontend URL to `FRONTEND_URLS` or `ALLOWED_ORIGINS` |

### Debugging Commands

```bash
# Check environment variable loading
node -e "console.log(process.env.NODE_ENV)"

# Validate Firebase JSON
node -e "JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)"

# Test AWS connectivity
aws sts get-caller-identity

# Test Stripe connectivity
npx stripe status
```

### Health Check Validation

The health endpoint (`GET /`) provides detailed service connectivity information:

```bash
curl http://localhost:8080/?detailed=true
```

Expected response for healthy system:
```json
{
  "status": "ReconFY Backend API",
  "overall": "healthy",
  "checks": {
    "firebase": { "status": "healthy" },
    "stripe": { "status": "healthy" },
    "awsSes": { "status": "healthy" },
    "cognito": { "status": "healthy" }
  }
}
```

## Environment Migration

### Development to Staging

1. **Copy environment template**: `cp .env.development .env.staging`
2. **Update service endpoints**: Change URLs to staging services
3. **Use staging credentials**: Replace with staging AWS/Stripe keys
4. **Test thoroughly**: Run full test suite against staging
5. **Validate integrations**: Test all external service connections

### Staging to Production

1. **Security review**: Audit all credentials and permissions
2. **Performance testing**: Load test with production-like data
3. **Backup strategy**: Ensure proper backup procedures
4. **Monitoring setup**: Configure alerts and dashboards
5. **Rollback plan**: Prepare rollback procedures
6. **Documentation update**: Update deployment documentation

---

For configuration support, contact the development team at dev@yourdomain.com.