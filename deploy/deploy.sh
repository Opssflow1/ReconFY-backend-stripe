#!/bin/bash

# OPSS Backend Stripe - Deployment Script
# Run this script to deploy the application

set -e

APP_DIR="/var/www/opss-backend"
REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
BRANCH="main"

echo "🚀 Starting deployment of OPSS Backend Stripe..."

# Navigate to application directory
cd $APP_DIR

# Pull latest changes
echo "📥 Pulling latest changes from repository..."
git pull origin $BRANCH

# Install/update Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install --production

# Set up Python virtual environment
echo "🐍 Setting up Python environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

# Upgrade pip and install Python dependencies
pip install --upgrade pip setuptools wheel
pip install -r python/requirements.txt

# Set proper permissions
sudo chown -R ubuntu:ubuntu $APP_DIR
chmod +x $APP_DIR/deploy/*.sh

# Restart application with PM2
echo "🔄 Restarting application..."
pm2 restart opss-backend || pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup

echo "✅ Deployment completed successfully!"
echo "🌐 Application should be running on port 3000"
echo "📊 Check status with: pm2 status"
echo "📝 View logs with: pm2 logs opss-backend"
