// OTP Routes for ReconFY backend
// Secure OTP implementation using existing infrastructure

import Joi from "joi";
import crypto from "crypto";
import { otpSendSchema, otpVerifySchema } from "../schemas.js";
import { authLimiter } from "../middleware/rateLimiting.js";
import { validateBody } from "../middleware/validation.js";
import { sendEmail, sendOTPEmail } from "../utils/emailUtils.js";

// OTP storage (in production, use Redis)
const otpStore = new Map();
const sessionStore = new Map();

// OTP email template
const OTP_EMAIL_TEMPLATE = {
  subject: "Your OTP Code - ReconFY",
  body: (otp, expiresInMinutes) => `
Hello,

Your OTP code for ReconFY login is: ${otp}

This code will expire in ${expiresInMinutes} minutes.

If you did not request this code, please ignore this email.

Best regards,
ReconFY Team
  `.trim()
};

// Generate secure OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Generate secure session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Clean expired OTPs (run every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
    }
  }
  for (const [token, data] of sessionStore.entries()) {
    if (now > data.expiresAt) {
      sessionStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Setup OTP routes for the Express app
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.sesClient - AWS SES client
 */
export function setupOTPRoutes(app, { sesClient }) {
  
  // Send OTP endpoint
  app.post("/otp/send", authLimiter, validateBody(otpSendSchema), async (req, res) => {
    try {
      const { email } = req.body;
      
      // Check if OTP already exists and is still valid
      const existingOTP = otpStore.get(email);
      if (existingOTP && Date.now() < existingOTP.expiresAt) {
        const remainingTime = Math.ceil((existingOTP.expiresAt - Date.now()) / 1000);
        return res.status(429).json({ 
          error: 'OTP already sent', 
          message: `Please wait ${remainingTime} seconds before requesting a new OTP` 
        });
      }
      
      // Generate new OTP
      const otp = generateOTP();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
      const maxAttempts = 3;
      
      // Store OTP
      otpStore.set(email, {
        otp,
        expiresAt,
        attempts: 0,
        maxAttempts,
        createdAt: Date.now()
      });
      
      // Send OTP email using dedicated OTP email function
      const emailBody = OTP_EMAIL_TEMPLATE.body(otp, 10);
      await sendOTPEmail(sesClient, email, OTP_EMAIL_TEMPLATE.subject, emailBody);
      
      res.json({ 
        success: true, 
        message: 'OTP sent successfully to your email',
        expiresIn: 600 // 10 minutes in seconds
      });
      
    } catch (error) {
      console.error('Error sending OTP:', error);
      
      res.status(500).json({ 
        error: 'Failed to send OTP', 
        message: 'Please try again later' 
      });
    }
  });
  
  // Verify OTP endpoint
  app.post("/otp/verify", authLimiter, validateBody(otpVerifySchema), async (req, res) => {
    try {
      const { email, otp } = req.body;
      
      // Get stored OTP
      const storedOTP = otpStore.get(email);
      if (!storedOTP) {
        return res.status(400).json({ 
          error: 'OTP not found or expired',
          message: 'Please request a new OTP'
        });
      }
      
      // Check expiration
      if (Date.now() > storedOTP.expiresAt) {
        otpStore.delete(email);
        
        return res.status(400).json({ 
          error: 'OTP expired',
          message: 'Please request a new OTP'
        });
      }
      
      // Check attempts
      if (storedOTP.attempts >= storedOTP.maxAttempts) {
        otpStore.delete(email);
        
        return res.status(400).json({ 
          error: 'Too many attempts',
          message: 'Please request a new OTP'
        });
      }
      
      // Verify OTP
      if (storedOTP.otp !== otp) {
        storedOTP.attempts++;
        
        return res.status(400).json({ 
          error: 'Invalid OTP',
          message: `Incorrect code. ${storedOTP.maxAttempts - storedOTP.attempts} attempts remaining`
        });
      }
      
      // OTP verified successfully
      const sessionToken = generateSessionToken();
      const sessionExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      
      // Store session
      sessionStore.set(sessionToken, {
        email,
        expiresAt: sessionExpiresAt,
        verifiedAt: Date.now()
      });
      
      // Clean up OTP
      otpStore.delete(email);
      
      res.json({ 
        success: true, 
        message: 'OTP verified successfully',
        sessionToken,
        expiresIn: 300 // 5 minutes in seconds
      });
      
    } catch (error) {
      console.error('Error verifying OTP:', error);
      
      res.status(500).json({ 
        error: 'Failed to verify OTP', 
        message: 'Please try again later' 
      });
    }
  });
  
  // Validate session token endpoint
  app.post("/otp/validate-session", authLimiter, async (req, res) => {
    try {
      const { sessionToken } = req.body;
      
      if (!sessionToken) {
        return res.status(400).json({ 
          error: 'Session token required' 
        });
      }
      
      const session = sessionStore.get(sessionToken);
      if (!session) {
        return res.status(400).json({ 
          error: 'Invalid or expired session token' 
        });
      }
      
      if (Date.now() > session.expiresAt) {
        sessionStore.delete(sessionToken);
        return res.status(400).json({ 
          error: 'Session token expired' 
        });
      }
      
      res.json({ 
        success: true, 
        email: session.email,
        verifiedAt: session.verifiedAt
      });
      
    } catch (error) {
      console.error('Error validating session:', error);
      res.status(500).json({ 
        error: 'Failed to validate session' 
      });
    }
  });
  
  // Cleanup expired sessions endpoint (for maintenance)
  app.post("/otp/cleanup", async (req, res) => {
    try {
      const now = Date.now();
      let cleanedOTPs = 0;
      let cleanedSessions = 0;
      
      // Clean expired OTPs
      for (const [email, data] of otpStore.entries()) {
        if (now > data.expiresAt) {
          otpStore.delete(email);
          cleanedOTPs++;
        }
      }
      
      // Clean expired sessions
      for (const [token, data] of sessionStore.entries()) {
        if (now > data.expiresAt) {
          sessionStore.delete(token);
          cleanedSessions++;
        }
      }
      
      res.json({ 
        success: true, 
        message: 'Cleanup completed',
        cleanedOTPs,
        cleanedSessions
      });
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      res.status(500).json({ 
        error: 'Cleanup failed' 
      });
    }
  });
}
