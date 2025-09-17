/**
 * Rate Limiting Configuration
 * Extracted from index.js for better organization and maintainability
 */

import rateLimit from "express-rate-limit";

// Global rate limiter for all endpoints
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // limit each IP to 5000 requests per 15 minutes (25x increase from original)
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP',
      message: 'Please try again later.',
      retryAfter: Math.ceil(15 * 60 / 1000) // 15 minutes in seconds
    });
  }
});

// Stricter rate limiting for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 authentication attempts per 15 minutes (10x increase from original)
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again later.',
      retryAfter: Math.ceil(15 * 60 / 1000)
    });
  }
});

// Rate limiting for contact form submissions
export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 25, // limit each IP to 25 contact submissions per hour (7x increase from original)
  message: { error: 'Too many contact form submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many contact form submissions',
      message: 'Please try again later.',
      retryAfter: Math.ceil(60 * 60 / 1000) // 1 hour in seconds
    });
  }
});

// Rate limiting for webhook endpoints
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // limit each IP to 500 webhook calls per minute (25x increase from original)
  message: { error: 'Too many webhook calls, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many webhook calls',
      message: 'Please try again later.',
      retryAfter: Math.ceil(60 / 1000) // 1 minute in seconds
    });
  }
});

// Rate limiting for admin endpoints
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 admin requests per 15 minutes (20x increase from original)
  message: { error: 'Too many admin requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many admin requests',
      message: 'Please try again later.',
      retryAfter: Math.ceil(15 * 60 / 1000)
    });
  }
});
