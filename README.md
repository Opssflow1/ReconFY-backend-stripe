# OpssFlow Backend (Stripe SaaS)

This is a minimal Express backend for Stripe-powered SaaS subscriptions, ready to deploy on Render or similar platforms.

## Allowed Origins
- http://localhost:3000 (development)
- http://localhost:3001 (development)
- https://www.opss.com
- https://admin.opss.com
- https://main.d2ukbtk1dng1se.amplifyapp.com
- https://main.d2899pnyi792jc.amplifyapp.com
## Features
- Create Stripe Checkout sessions for subscriptions
- Stripe webhook endpoint for subscription events
- CORS enabled for your frontend

## Setup
1. Copy `.env.example` to `.env` and fill in your Stripe keys and frontend URL.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Start the server:
   ```sh
   npm start
   ```

## Deployment
- Deploy the `backend` folder to Render as a Node.js service.
- Set environment variables in Render dashboard as in `.env.example`.

## Endpoints
- `POST /create-checkout-session` — Create a Stripe Checkout session
- `POST /webhook` — Stripe webhook handler

## Notes
- You must handle user subscription updates in your DB in the webhook handler.
- For production, set your Stripe keys and webhook secret securely.
