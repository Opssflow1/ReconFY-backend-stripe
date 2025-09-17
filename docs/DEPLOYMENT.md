# Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the ReconFY Backend API across different environments and platforms. The application supports multiple deployment strategies including Docker, Kubernetes, AWS EC2, and serverless platforms.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Docker Deployment](#docker-deployment)
4. [Kubernetes Deployment](#kubernetes-deployment)
5. [AWS EC2 Deployment](#aws-ec2-deployment)
6. [Serverless Deployment](#serverless-deployment)
7. [Nginx Configuration](#nginx-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **Node.js** | 18.x | 20.x LTS |
| **RAM** | 512MB | 2GB+ |
| **CPU** | 1 core | 2+ cores |
| **Storage** | 1GB | 10GB+ |
| **Python** | 3.8+ | 3.11+ |

### External Services

Before deployment, ensure these services are configured:

- ✅ **AWS Account** with Cognito, S3, SES access
- ✅ **Firebase Project** with Realtime Database
- ✅ **Stripe Account** with API keys and webhooks
- ✅ **Domain & SSL Certificate** for production

### Required Tools

```bash
# Install Node.js and npm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python and dependencies
sudo apt-get install python3 python3-pip
pip3 install PyMuPDF

# Install Docker (optional)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install AWS CLI (for AWS deployments)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

## Local Development

### Setup Development Environment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd ReconFY-backend-stripe
   ```

2. **Install Dependencies**
   ```bash
   npm install
   pip3 install PyMuPDF python-shell
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your development configuration
   ```

4. **Start Development Server**
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

5. **Verify Installation**
   ```bash
   curl http://localhost:8080/
   # Should return health check with service status
   ```

### Development Scripts

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "npm audit && npm run security-check",
    "security-check": "npx audit-ci --config .audit-ci.json",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

## Docker Deployment

### Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S reconfy -u 1001

# Install Python dependencies
RUN apk add --no-cache python3 py3-pip
RUN pip3 install PyMuPDF

# Set working directory
WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=reconfy:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=reconfy:nodejs . .

# Set environment variables
ENV NODE_ENV=production
ENV TZ=UTC

# Expose port
EXPOSE 8080

# Switch to app user
USER reconfy

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1

# Start application
CMD ["npm", "start"]
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - TZ=UTC
    env_file:
      - .env.production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    volumes:
      - ./logs:/app/logs
    networks:
      - reconfy-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - reconfy-network

networks:
  reconfy-network:
    driver: bridge
```

### Build and Deploy

```bash
# Build Docker image
docker build -t reconfy/backend:latest .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f api

# Scale horizontally
docker-compose up -d --scale api=3
```

## Kubernetes Deployment

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: reconfy
  labels:
    name: reconfy
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: reconfy-config
  namespace: reconfy
data:
  NODE_ENV: "production"
  TZ: "UTC"
  PORT: "8080"
  AWS_REGION: "us-east-1"
  COGNITO_REGION: "us-east-1"
  PROCESSING_BACKEND_URL: "https://your-processing-backend.com"
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: reconfy-secrets
  namespace: reconfy
type: Opaque
data:
  # Base64 encoded values
  FIREBASE_SERVICE_ACCOUNT: <base64-encoded-json>
  STRIPE_SECRET_KEY: <base64-encoded-secret>
  STRIPE_WEBHOOK_SECRET: <base64-encoded-secret>
  AWS_ACCESS_KEY_ID: <base64-encoded-key>
  AWS_SECRET_ACCESS_KEY: <base64-encoded-secret>
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reconfy-backend
  namespace: reconfy
  labels:
    app: reconfy-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: reconfy-backend
  template:
    metadata:
      labels:
        app: reconfy-backend
    spec:
      containers:
      - name: api
        image: reconfy/backend:latest
        ports:
        - containerPort: 8080
        envFrom:
        - configMapRef:
            name: reconfy-config
        - secretRef:
            name: reconfy-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: reconfy-backend-service
  namespace: reconfy
spec:
  selector:
    app: reconfy-backend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: reconfy-backend-ingress
  namespace: reconfy
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: reconfy-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: reconfy-backend-service
            port:
              number: 80
```

### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n reconfy

# View logs
kubectl logs -f deployment/reconfy-backend -n reconfy

# Scale deployment
kubectl scale deployment reconfy-backend --replicas=5 -n reconfy
```

## AWS EC2 Deployment

### EC2 Instance Setup

1. **Launch EC2 Instance**
   ```bash
   # Ubuntu 22.04 LTS
   # Instance type: t3.medium (2 vCPU, 4GB RAM)
   # Security Group: Allow ports 22, 80, 443, 8080
   ```

2. **Install Dependencies**
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y

   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs

   # Install Python
   sudo apt install -y python3 python3-pip
   pip3 install PyMuPDF

   # Install PM2 for process management
   sudo npm install -g pm2

   # Install Nginx
   sudo apt install -y nginx

   # Install SSL certificate tools
   sudo apt install -y certbot python3-certbot-nginx
   ```

3. **Deploy Application**
   ```bash
   # Clone repository
   git clone <repository-url> /var/www/reconfy-backend
   cd /var/www/reconfy-backend

   # Install dependencies
   npm ci --production

   # Configure environment
   sudo cp .env.production .env
   sudo chown ubuntu:ubuntu .env

   # Start with PM2
   pm2 start ecosystem.config.js --env production
   pm2 save
   pm2 startup
   ```

### PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'reconfy-backend',
    script: 'index.js',
    cwd: '/var/www/reconfy-backend',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: '/var/log/reconfy/error.log',
    out_file: '/var/log/reconfy/out.log',
    log_file: '/var/log/reconfy/combined.log',
    time: true,
    health_check_http: 'http://localhost:8080/',
    health_check_grace_period: 3000
  }]
};
```

### SSL Certificate

```bash
# Obtain SSL certificate with Let's Encrypt
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal setup
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Serverless Deployment

### AWS Lambda with Serverless Framework

1. **Install Serverless Framework**
   ```bash
   npm install -g serverless
   serverless plugin install -n serverless-express
   ```

2. **Create `serverless.yml`**
   ```yaml
   service: reconfy-backend

   provider:
     name: aws
     runtime: nodejs20.x
     region: us-east-1
     stage: ${opt:stage, 'dev'}
     environment:
       NODE_ENV: ${self:provider.stage}
       AWS_REGION: ${self:provider.region}
     iamRoleStatements:
       - Effect: Allow
         Action:
           - cognito-idp:*
           - s3:*
           - ses:*
         Resource: "*"

   functions:
     api:
       handler: lambda.handler
       events:
         - http:
             path: /{proxy+}
             method: ANY
             cors: true
         - http:
             path: /
             method: ANY
             cors: true

   plugins:
     - serverless-express
   ```

3. **Create Lambda Handler**
   ```javascript
   // lambda.js
   const serverlessExpress = require('@codegenie/serverless-express');
   const app = require('./index.js');

   exports.handler = serverlessExpress({ app });
   ```

4. **Deploy**
   ```bash
   # Deploy to staging
   serverless deploy --stage staging

   # Deploy to production
   serverless deploy --stage production
   ```

## Nginx Configuration

### Production Nginx Config

Create `/etc/nginx/sites-available/reconfy-backend`:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

# Upstream backend
upstream reconfy_backend {
    least_conn;
    server 127.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:8081 max_fails=3 fail_timeout=30s backup;
}

# HTTP redirect to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Hide server information
    server_tokens off;

    # Client upload limits
    client_max_body_size 25M;
    client_body_timeout 60s;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml;

    # API endpoints
    location / {
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        limit_req_status 429;

        # Proxy settings
        proxy_pass http://reconfy_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # Auth endpoints (stricter rate limiting)
    location ~ ^/(subscription|create-checkout-session|verify-payment) {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://reconfy_backend;
        include proxy_params;
    }

    # Webhook endpoint (no auth rate limiting)
    location /webhook {
        proxy_pass http://reconfy_backend;
        include proxy_params;
    }

    # Health check endpoint
    location = /health {
        access_log off;
        proxy_pass http://reconfy_backend/;
        include proxy_params;
    }

    # Block sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # Logging
    access_log /var/log/nginx/reconfy-access.log;
    error_log /var/log/nginx/reconfy-error.log;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/reconfy-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring & Logging

### Application Monitoring

1. **PM2 Monitoring**
   ```bash
   # Install PM2 monitoring
   pm2 install pm2-server-monit

   # Monitor processes
   pm2 monit

   # View logs
   pm2 logs reconfy-backend
   ```

2. **Health Check Monitoring**
   ```bash
   # Create health check script
   cat > /usr/local/bin/health-check.sh << 'EOF'
   #!/bin/bash
   response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
   if [ $response != "200" ]; then
     echo "Health check failed: $response"
     # Send alert (email, Slack, etc.)
   fi
   EOF

   chmod +x /usr/local/bin/health-check.sh

   # Add to crontab
   echo "*/5 * * * * /usr/local/bin/health-check.sh" | crontab -
   ```

### Log Management

1. **Log Rotation**
   ```bash
   # Create logrotate config
   sudo tee /etc/logrotate.d/reconfy << 'EOF'
   /var/log/reconfy/*.log {
     daily
     missingok
     rotate 52
     compress
     delaycompress
     notifempty
     create 644 ubuntu ubuntu
     postrotate
       pm2 reloadLogs
     endscript
   }
   EOF
   ```

2. **Centralized Logging** (Optional)
   ```bash
   # Install filebeat for ELK stack
   curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-8.11.0-amd64.deb
   sudo dpkg -i filebeat-8.11.0-amd64.deb

   # Configure filebeat
   sudo nano /etc/filebeat/filebeat.yml
   ```

## Backup & Recovery

### Database Backup

```bash
# Firebase backup script
cat > /usr/local/bin/firebase-backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/firebase"
mkdir -p $BACKUP_DIR

# Export Firebase data (requires admin SDK)
node -e "
const admin = require('firebase-admin');
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

admin.database().ref().once('value', (snapshot) => {
  fs.writeFileSync('$BACKUP_DIR/firebase_$DATE.json', JSON.stringify(snapshot.val(), null, 2));
  console.log('Backup completed: firebase_$DATE.json');
  process.exit(0);
});
" || echo "Backup failed"
EOF

chmod +x /usr/local/bin/firebase-backup.sh

# Schedule daily backups
echo "0 2 * * * /usr/local/bin/firebase-backup.sh" | crontab -
```

### Application Backup

```bash
# Application code backup
cat > /usr/local/bin/app-backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/app"
APP_DIR="/var/www/reconfy-backend"

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/reconfy-app_$DATE.tar.gz -C $APP_DIR .

# Keep only last 30 days
find $BACKUP_DIR -name "reconfy-app_*.tar.gz" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/app-backup.sh
```

## Troubleshooting

### Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Application won't start** | Process exits immediately | Check environment variables and logs |
| **High memory usage** | Process gets killed | Increase memory limits, check for leaks |
| **Database connection fails** | Firebase authentication errors | Verify service account credentials |
| **File upload fails** | S3 upload errors | Check AWS credentials and bucket permissions |
| **Nginx 502 errors** | Bad Gateway responses | Check if application is running on expected port |
| **SSL certificate issues** | Browser security warnings | Renew certificate with certbot |

### Debugging Commands

```bash
# Check application status
pm2 status
pm2 logs reconfy-backend --lines 100

# Check system resources
htop
df -h
free -h

# Check network connectivity
netstat -tlnp | grep :8080
curl -I http://localhost:8080/

# Check service health
curl -s http://localhost:8080/ | jq '.'

# Check Nginx status
sudo nginx -t
sudo systemctl status nginx

# Check SSL certificate
openssl x509 -in /etc/letsencrypt/live/api.yourdomain.com/cert.pem -text -noout
```

### Performance Optimization

1. **Enable Node.js clustering** in PM2 config
2. **Configure database connection pooling**
3. **Implement Redis caching** for frequent queries
4. **Enable Nginx caching** for static responses
5. **Use CDN** for static assets
6. **Monitor and optimize** database queries

### Security Hardening

1. **Update system packages** regularly
2. **Configure firewall** to block unnecessary ports
3. **Enable fail2ban** for SSH protection
4. **Regular security audits** with tools like nmap
5. **Monitor access logs** for suspicious activity

---

For deployment support, contact the DevOps team at devops@yourdomain.com.