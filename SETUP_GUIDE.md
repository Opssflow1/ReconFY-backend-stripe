# OpssFlow Backend - Complete SaaS Subscription System

## Overview
This backend provides a complete Stripe-powered subscription system with admin controls, webhook handling, and secure database updates.

## Backend Setup (Deploy to Render)

### 1. Environment Variables
Set these in your Render service:

```bash
STRIPE_SECRET_KEY=sk_test_... # Your Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_... # Webhook secret from Stripe dashboard
STRIPE_MONTHLY_PRICE_ID=price_... # Monthly plan price ID from Stripe
STRIPE_YEARLY_PRICE_ID=price_... # Yearly plan price ID from Stripe
FRONTEND_URL=https://your-frontend-url.com
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."} # Firebase service account JSON
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
PORT=8080
```

### 2. Stripe Setup
1. Create products and prices in Stripe Dashboard
2. Copy the price IDs to your environment variables
3. Set up webhook endpoint: `https://your-backend-url.com/webhook`
4. Select these webhook events:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`

### 3. Firebase Setup
1. Generate a service account key from Firebase Console > Project Settings > Service Accounts
2. Download the JSON file and copy entire content to `FIREBASE_SERVICE_ACCOUNT` environment variable
3. Ensure Firebase Realtime Database is enabled

## Frontend Setup

### 1. Environment Variables
Add to your `.env` file:

```bash
REACT_APP_API_URL=https://your-backend-url.com
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abcdef
```

## API Endpoints

### Customer Endpoints
- `POST /create-checkout-session` - Create Stripe checkout session
- `POST /create-portal-session` - Create billing portal session  
- `POST /verify-payment` - Verify payment and update subscription
- `POST /cancel-subscription` - Cancel subscription
- `POST /webhook` - Stripe webhook handler (automatic)

### Admin Endpoints  
- `GET /admin/users` - Get all users with subscription data
- `PUT /admin/users/:userId/subscription` - Update user subscription

## How It Works

### 1. Subscription Flow
1. User clicks "Upgrade" on frontend
2. Frontend calls backend `/create-checkout-session`
3. Backend creates Stripe Checkout session
4. User is redirected to Stripe Checkout
5. After payment, user returns to frontend
6. Frontend calls backend `/verify-payment`
7. Backend updates user subscription in database

### 2. Webhook Flow
1. Stripe sends webhook to backend `/webhook`
2. Backend verifies webhook signature
3. Backend updates user subscription in database based on event
4. Frontend reads updated subscription from database

### 3. Admin Controls
- Admins can view all users: `GET /admin/users`
- Admins can update any subscription: `PUT /admin/users/:userId/subscription`
- Frontend admin dashboard uses these endpoints

## Security Features

✅ **Backend-only subscription updates**: No direct database writes from frontend after payment
✅ **Webhook verification**: All Stripe events are verified with webhook signatures
✅ **Admin authentication**: Admin endpoints should be protected (add auth middleware)
✅ **CORS protection**: Backend only accepts requests from your frontend domain
✅ **Secure payment flow**: All payments go through Stripe Checkout

## API Endpoints

### Customer Endpoints
- `POST /create-checkout-session` - Create Stripe checkout
- `POST /create-portal-session` - Create billing portal
- `POST /verify-payment` - Verify payment success
- `POST /cancel-subscription` - Cancel subscription

### Admin Endpoints
- `GET /admin/users` - Get all users
- `PUT /admin/users/:userId/subscription` - Update user subscription

### Webhooks
- `POST /webhook` - Stripe webhook handler

## Testing

1. Use Stripe test mode with test cards
2. Test webhook events using Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:8080/webhook
   ```
3. Test admin functions through admin dashboard

## Deployment Checklist

- [ ] Backend deployed to Render with all environment variables
- [ ] Frontend deployed with correct API_URL
- [ ] Stripe webhook endpoint configured
- [ ] Firebase service account configured
- [ ] Test subscription flow end-to-end
- [ ] Test admin controls
- [ ] Test webhook events
