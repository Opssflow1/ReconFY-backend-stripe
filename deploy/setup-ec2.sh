#!/bin/bash

# OPSS Backend Stripe - EC2 Setup Script
# Run this script on your EC2 instance to install all dependencies

set -e

echo "🚀 Setting up EC2 instance for OPSS Backend Stripe..."

# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.9+ and build tools
sudo apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    cmake \
    ninja-build \
    libfreetype6-dev \
    libharfbuzz-dev \
    libjpeg-dev \
    libopenjp2-7-dev \
    libtesseract-dev \
    libtiff5-dev \
    libpng-dev \
    libz-dev \
    pkg-config \
    git \
    wget \
    curl \
    nginx \
    certbot \
    python3-certbot-nginx

# Install PM2 for process management
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /var/www/opss-backend
sudo chown -R ubuntu:ubuntu /var/www/opss-backend

# Create logs directory
sudo mkdir -p /var/log/opss-backend
sudo chown -R ubuntu:ubuntu /var/log/opss-backend

echo "✅ EC2 setup completed successfully!"
echo "📝 Next steps:"
echo "1. Clone your repository to /var/www/opss-backend"
echo "2. Set up environment variables"
echo "3. Install application dependencies"
echo "4. Configure PM2 and Nginx"
