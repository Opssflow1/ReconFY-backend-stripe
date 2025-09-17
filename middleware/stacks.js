import cognitoAuthenticate from "../cognitoAuth.js";
import { requireActiveSubscription, requireAnySubscription } from "../subscriptionAuth.js";
import { adminLimiter } from "./rateLimiting.js";

// Common middleware stacks to avoid repetition across routes
export const requireAuth = [
  cognitoAuthenticate
];

export const requireActivePlan = [
  cognitoAuthenticate,
  requireActiveSubscription
];

export const requireAnyPlan = [
  cognitoAuthenticate,
  requireAnySubscription
];

// For admin routes that need admin rate limiting plus auth
export const adminProtected = [
  adminLimiter,
  cognitoAuthenticate
];


