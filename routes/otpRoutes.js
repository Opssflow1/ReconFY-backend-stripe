// OTP Routes for ReconFY backend
// Production-ready OTP implementation using Firebase database
// Works with PM2 clustering - shared storage across all instances

import Joi from "joi";
import crypto from "crypto";
import { otpSendSchema, otpVerifySchema } from "../schemas.js";
import { authLimiter } from "../middleware/rateLimiting.js";
import { validateBody } from "../middleware/validation.js";
import { sendEmail, sendOTPEmail } from "../utils/emailUtils.js";

// Firebase-based OTP storage (production-ready, works with PM2 clustering)
let db = null;

// Initialize database connection
function initializeDatabase(database) {
  db = database;
}

// OTP email template
const OTP_EMAIL_TEMPLATE = {
  subject: "Your ReconFY verification code",
  body: (otp, expiresInMinutes) => `
Your ReconFY verification code is ${otp}. This code will expire in 3 minutes for security purposes. If you didn't request this code, please ignore this email.

Best regards,
The ReconFY Team
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

// ✅ COLLISION FIX: Firebase path encoding with collision detection
function encodeEmailForFirebase(email) {
  // ✅ COLLISION PREVENTION: Use base64 encoding to prevent collisions
  const base64Email = Buffer.from(email, 'utf8').toString('base64');
  
  // ✅ COLLISION PREVENTION: Replace problematic characters with safe alternatives
  const safeEmail = base64Email
    .replace(/\+/g, '_plus_')
    .replace(/\//g, '_slash_')
    .replace(/=/g, '_equals_')
    .replace(/-/g, '_dash_');
  
  // ✅ COLLISION PREVENTION: Add email hash for additional uniqueness
  const emailHash = crypto.createHash('md5').update(email).digest('hex').substring(0, 8);
  
  return `${safeEmail}_${emailHash}`;
}

// ✅ COLLISION FIX: Decode email from Firebase path
function decodeEmailFromFirebase(encodedEmail) {
  try {
    // Extract the base64 part (before the hash)
    const parts = encodedEmail.split('_');
    const hashIndex = parts.findIndex(part => part.length === 8 && /^[a-f0-9]+$/.test(part));
    
    if (hashIndex === -1) {
      throw new Error('Invalid encoded email format');
    }
    
    const base64Part = parts.slice(0, hashIndex).join('_');
    const originalBase64 = base64Part
      .replace(/_plus_/g, '+')
      .replace(/_slash_/g, '/')
      .replace(/_equals_/g, '=')
      .replace(/_dash_/g, '-');
    
    return Buffer.from(originalBase64, 'base64').toString('utf8');
  } catch (error) {
    console.error('Error decoding email from Firebase path:', error);
    throw new Error('Failed to decode email from Firebase path');
  }
}

// Firebase-based OTP storage functions
async function storeOTP(email, otpData) {
  if (!db) throw new Error('Database not initialized');
  
  const encodedEmail = encodeEmailForFirebase(email);
  const otpRef = db.ref(`otpCodes/${encodedEmail}`);
  await otpRef.set({
    ...otpData,
    email: email, // Store original email for reference
    createdAt: Date.now(),
    expiresAt: Date.now() + 3 * 60 * 1000 // 3 minutes
  });
}

// ✅ ATOMIC OPERATION: Safely increment OTP attempts with race condition protection
async function incrementOTPAttempts(email) {
  if (!db) throw new Error('Database not initialized');
  
  const encodedEmail = encodeEmailForFirebase(email);
  const otpRef = db.ref(`otpCodes/${encodedEmail}`);
  
  return new Promise((resolve, reject) => {
    otpRef.transaction((currentData) => {
      if (!currentData) {
        // OTP doesn't exist or was deleted
        return null;
      }
      
      // Check if OTP is still valid
      if (Date.now() > currentData.expiresAt) {
        // OTP expired, delete it
        return null;
      }
      
      // Check if already at max attempts
      if (currentData.attempts >= currentData.maxAttempts) {
        // Already at max attempts, return current data unchanged
        return currentData;
      }
      
      // Safely increment attempts
      return {
        ...currentData,
        attempts: currentData.attempts + 1,
        lastAttemptAt: Date.now()
      };
    }, (error, committed, snapshot) => {
      if (error) {
        console.error('Error in OTP attempts transaction:', error);
        reject(error);
      } else if (!committed) {
        // Transaction was aborted (OTP deleted or expired)
        reject(new Error('OTP not found or expired'));
      } else {
        const updatedData = snapshot.val();
        resolve(updatedData);
      }
    });
  });
}

async function getOTP(email) {
  if (!db) throw new Error('Database not initialized');
  
  const encodedEmail = encodeEmailForFirebase(email);
  const otpRef = db.ref(`otpCodes/${encodedEmail}`);
  const snapshot = await otpRef.once('value');
  return snapshot.exists() ? snapshot.val() : null;
}

async function deleteOTP(email) {
  if (!db) throw new Error('Database not initialized');
  
  const encodedEmail = encodeEmailForFirebase(email);
  const otpRef = db.ref(`otpCodes/${encodedEmail}`);
  await otpRef.remove();
}

async function storeSession(sessionToken, sessionData) {
  if (!db) throw new Error('Database not initialized');
  
  const sessionRef = db.ref(`otpSessions/${sessionToken}`);
  await sessionRef.set({
    ...sessionData,
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
}

async function getSession(sessionToken) {
  if (!db) throw new Error('Database not initialized');
  
  const sessionRef = db.ref(`otpSessions/${sessionToken}`);
  const snapshot = await sessionRef.once('value');
  return snapshot.exists() ? snapshot.val() : null;
}

async function deleteSession(sessionToken) {
  if (!db) throw new Error('Database not initialized');
  
  const sessionRef = db.ref(`otpSessions/${sessionToken}`);
  await sessionRef.remove();
}

// Clean expired OTPs and sessions (run every 5 minutes)
setInterval(async () => {
  if (!db) return;
  
  try {
  const now = Date.now();
    
    // ✅ OPTIMIZATION FIX: Batch cleanup operations for better performance
    const batchUpdates = {};
    let cleanedCount = 0;
    
    // ✅ OPTIMIZATION: Clean expired OTPs with batch operations
    const otpSnapshot = await db.ref('otpCodes').once('value');
    if (otpSnapshot.exists()) {
      const otps = otpSnapshot.val();
      for (const [encodedEmail, data] of Object.entries(otps)) {
    if (now > data.expiresAt) {
          // ✅ BATCH OPERATION: Add to batch updates instead of individual deletes
          batchUpdates[`otpCodes/${encodedEmail}`] = null; // null = delete
          cleanedCount++;
        }
      }
    }
    
    // ✅ OPTIMIZATION: Clean expired sessions with batch operations
    const sessionSnapshot = await db.ref('otpSessions').once('value');
    if (sessionSnapshot.exists()) {
      const sessions = sessionSnapshot.val();
      for (const [token, data] of Object.entries(sessions)) {
    if (now > data.expiresAt) {
          // ✅ BATCH OPERATION: Add to batch updates instead of individual deletes
          batchUpdates[`otpSessions/${token}`] = null; // null = delete
          cleanedCount++;
        }
      }
    }
    
    // ✅ OPTIMIZATION: Execute all deletions in a single batch operation
    if (Object.keys(batchUpdates).length > 0) {
      await db.ref().update(batchUpdates);
      console.log(`✅ BATCH CLEANUP: Removed ${cleanedCount} expired OTPs and sessions`);
    }
  } catch (error) {
    console.error('Error cleaning expired OTPs/sessions:', error);
  }
}, 5 * 60 * 1000);

/**
 * Setup OTP routes for the Express app
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.sesClient - AWS SES client
 * @param {Object} dependencies.db - Firebase database instance
 */
export function setupOTPRoutes(app, { sesClient, db: database }) {
  // Initialize database connection
  initializeDatabase(database);
  
  // Send OTP endpoint
  app.post("/otp/send", authLimiter, validateBody(otpSendSchema), async (req, res) => {
    try {
      const { email } = req.body;
      
      // Check if OTP already exists and is still valid
      const existingOTP = await getOTP(email);
      if (existingOTP && Date.now() < existingOTP.expiresAt) {
        const remainingTime = Math.ceil((existingOTP.expiresAt - Date.now()) / 1000);
        return res.status(429).json({ 
          error: 'OTP already sent', 
          message: `Please wait ${remainingTime} seconds before requesting a new OTP` 
        });
      }
      
      // Generate new OTP
      const otp = generateOTP();
      const maxAttempts = 3;
      
      // Store OTP in Firebase (shared across all PM2 instances)
      await storeOTP(email, {
        otp,
        attempts: 0,
        maxAttempts
      });
      
      // Send OTP email using dedicated OTP email function
      const emailBody = OTP_EMAIL_TEMPLATE.body(otp);
      await sendOTPEmail(sesClient, email, OTP_EMAIL_TEMPLATE.subject, emailBody);
      
      res.json({ 
        success: true, 
        message: 'OTP sent successfully to your email',
        expiresIn: 180 // 3 minutes in seconds
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
      
      // Get stored OTP from Firebase (shared across all PM2 instances)
      const storedOTP = await getOTP(email);
      if (!storedOTP) {
        return res.status(400).json({ 
          error: 'OTP not found or expired',
          message: 'Please request a new OTP'
        });
      }
      
      // Check expiration
      if (Date.now() > storedOTP.expiresAt) {
        await deleteOTP(email);
        
        return res.status(400).json({ 
          error: 'OTP expired',
          message: 'Please request a new OTP'
        });
      }
      
      // Check attempts
      if (storedOTP.attempts >= storedOTP.maxAttempts) {
        await deleteOTP(email);
        
        return res.status(400).json({ 
          error: 'Too many attempts',
          message: 'Please request a new OTP'
        });
      }
      
      // Verify OTP
      if (storedOTP.otp !== otp) {
        try {
          // ✅ RACE CONDITION FIX: Use atomic transaction to increment attempts
          const updatedOTP = await incrementOTPAttempts(email);
          
          if (!updatedOTP) {
            return res.status(400).json({ 
              error: 'OTP not found or expired',
              message: 'Please request a new OTP'
            });
          }
          
          const remainingAttempts = updatedOTP.maxAttempts - updatedOTP.attempts;
        
        return res.status(400).json({ 
          error: 'Invalid OTP',
            message: `Incorrect code. ${remainingAttempts} attempts remaining`
          });
        } catch (error) {
          console.error('Error incrementing OTP attempts:', error);
          return res.status(400).json({ 
            error: 'OTP not found or expired',
            message: 'Please request a new OTP'
          });
        }
      }
      
      // OTP verified successfully
      const sessionToken = generateSessionToken();
      
      // Store session in Firebase (shared across all PM2 instances)
      await storeSession(sessionToken, {
        email,
        verifiedAt: Date.now()
      });
      
      // Clean up OTP only after successful verification
      await deleteOTP(email);
      
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
      
      // Get session from Firebase (shared across all PM2 instances)
      const session = await getSession(sessionToken);
      if (!session) {
        return res.status(400).json({ 
          error: 'Invalid or expired session token' 
        });
      }
      
      if (Date.now() > session.expiresAt) {
        await deleteSession(sessionToken);
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
  
  // Delete specific session endpoint
  app.post("/otp/delete-session", authLimiter, async (req, res) => {
    try {
      const { sessionToken } = req.body;
      
      if (!sessionToken) {
        return res.status(400).json({ 
          error: 'Session token required' 
        });
      }
      
      // Delete session from Firebase
      await deleteSession(sessionToken);
      
      res.json({ 
        success: true, 
        message: 'Session deleted successfully'
      });
      
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({ 
        error: 'Failed to delete session' 
      });
    }
  });
  
  // Cleanup expired sessions endpoint (for maintenance)
  app.post("/otp/cleanup", async (req, res) => {
    try {
      const now = Date.now();
      let cleanedOTPs = 0;
      let cleanedSessions = 0;
      
      // ✅ OPTIMIZATION FIX: Batch cleanup operations for better performance
      const batchUpdates = {};
      
      // ✅ OPTIMIZATION: Clean expired OTPs with batch operations
      const otpSnapshot = await db.ref('otpCodes').once('value');
      if (otpSnapshot.exists()) {
        const otps = otpSnapshot.val();
        for (const [encodedEmail, data] of Object.entries(otps)) {
        if (now > data.expiresAt) {
            // ✅ BATCH OPERATION: Add to batch updates instead of individual deletes
            batchUpdates[`otpCodes/${encodedEmail}`] = null; // null = delete
          cleanedOTPs++;
          }
        }
      }
      
      // ✅ OPTIMIZATION: Clean expired sessions with batch operations
      const sessionSnapshot = await db.ref('otpSessions').once('value');
      if (sessionSnapshot.exists()) {
        const sessions = sessionSnapshot.val();
        for (const [token, data] of Object.entries(sessions)) {
        if (now > data.expiresAt) {
            // ✅ BATCH OPERATION: Add to batch updates instead of individual deletes
            batchUpdates[`otpSessions/${token}`] = null; // null = delete
          cleanedSessions++;
        }
        }
      }
      
      // ✅ OPTIMIZATION: Execute all deletions in a single batch operation
      if (Object.keys(batchUpdates).length > 0) {
        await db.ref().update(batchUpdates);
        console.log(`✅ BATCH CLEANUP: Removed ${cleanedOTPs} OTPs and ${cleanedSessions} sessions`);
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
