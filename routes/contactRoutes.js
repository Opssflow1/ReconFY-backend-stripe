// Contact Routes for ReconFY backend
// Extracted from index.js for better modularity

import Joi from "joi";
import { contactSchema, contactAdminListQuerySchema, contactAdminUpdateBodySchema, contactAdminRespondBodySchema, contactAdminStatsQuerySchema, ticketReplyBodySchema } from "../schemas.js";
import { globalLimiter, contactLimiter, adminLimiter } from "../middleware/rateLimiting.js";
import { adminProtected } from "../middleware/stacks.js";
import { validateBody } from "../middleware/validation.js";
import { sendEmail, generateTicketNumber, EMAIL_TEMPLATES } from "../utils/emailUtils.js";
import { filterUndefined } from "../utils/helpers.js";
import { logContactInquiryUpdated, logContactInquiryResponseSent, logContactInquiryDeleted } from "../utils/auditUtils.js";

/**
 * Setup contact routes for the Express app
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.auditLogger - Audit logger instance
 * @param {Object} dependencies.sesClient - AWS SES client
 * @param {Object} dependencies.db - Firebase database instance
 */
export function setupContactRoutes(app, { auditLogger, sesClient, db }) {
  
  // Enhanced Contact form submission endpoint
  app.post("/contact", contactLimiter, validateBody(contactSchema), async (req, res) => {
    try {
      const { firstName, lastName, email, company, message, category = 'GENERAL' } = req.body;
      
      // Validate required fields
      if (!firstName || !lastName || !email || !message) {
        return res.status(400).json({ error: "All required fields must be provided" });
      }
      
      // Generate ticket number
      const ticketNumber = generateTicketNumber();
      
      // Create contact inquiry record
      const contactId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const contactData = {
        id: contactId,
        ticketNumber,
        firstName,
        lastName,
        email,
        company: company || null,
        message,
        category: category || 'GENERAL',
        status: 'NEW',
        priority: 'MEDIUM',
        source: 'WEBSITE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responses: [], // Array to store admin responses
        customerReplies: [], // Array to store customer replies
        assignedTo: null,
        adminNotes: null,
        metadata: {
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          referrer: req.headers.referer || 'direct'
        }
      };
      
      // Store in Firebase
      await db.ref(`contactInquiries/${contactId}`).set(contactData);
      
      // ✅ MINOR FIX: Enhanced email sending with retry mechanism
      try {
        console.log('[CONTACT] Attempting to send confirmation email:', {
          email,
          ticketNumber,
          firstName,
          sendEmailFunctionAvailable: typeof sendEmail === 'function'
        });
        
        // Check if sendEmail function is available
        if (typeof sendEmail === 'function') {
          console.log('[CONTACT] Sending confirmation email via sendEmail function...');
          const emailResult = await sendEmail(
            sesClient,
            email,
            EMAIL_TEMPLATES.INQUIRY_RECEIVED.subject,
            EMAIL_TEMPLATES.INQUIRY_RECEIVED.body(ticketNumber, firstName)
          );
          console.log('[CONTACT] Confirmation email sent successfully:', emailResult);
        } else {
          console.error('[CONTACT] sendEmail function is not available - this should not happen!');
        }
      } catch (emailError) {
        console.error('[CONTACT] Failed to send confirmation email:', emailError);
        
        // ✅ MINOR FIX: Log failed email for retry processing
        try {
          await db.ref(`failedEmails/${contactId}`).set({
            email,
            ticketNumber,
            firstName,
            error: emailError.message,
            timestamp: Date.now(),
            retryCount: 0,
            maxRetries: 3,
            type: 'contact_confirmation'
          });
          console.log(`[EMAIL] Logged failed email ${contactId} for retry processing`);
        } catch (logError) {
          console.error('[EMAIL] Failed to log failed email:', logError);
        }
        
        // Don't fail the request if email fails
      }
      
      res.json({ 
        success: true, 
        message: "Contact inquiry submitted successfully",
        contactId,
        ticketNumber
      });
      
    } catch (error) {
      console.error("[CONTACT] Error submitting contact form:", error);
      res.status(500).json({ error: "Failed to submit contact form" });
    }
  });

  // Admin: Get all contact inquiries with enhanced filters
  app.get("/admin/contact-inquiries", ...adminProtected, validateBody(contactAdminListQuerySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { status, priority, category, dateRange, assignedTo, search, page = 1, limit = 50 } = req.query;
      
      // ✅ MODERATE FIX: Add pagination and server-side filtering
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page
      const offset = (pageNum - 1) * limitNum;
      
      let inquiries = [];
      let totalCount = 0;
      
      // Get total count first
      const countSnapshot = await db.ref('contactInquiries').once('value');
      if (countSnapshot.exists()) {
        totalCount = countSnapshot.numChildren();
      }
      
      // Apply server-side filtering with pagination
      let query = db.ref('contactInquiries');
      
      // Apply filters at database level where possible
      if (status && status !== 'ALL') {
        query = query.orderByChild('status').equalTo(status);
      }
      if (priority && priority !== 'ALL') {
        query = query.orderByChild('priority').equalTo(priority);
      }
      if (category && category !== 'ALL') {
        query = query.orderByChild('category').equalTo(category);
      }
      if (assignedTo && assignedTo !== 'ALL') {
        query = query.orderByChild('assignedTo').equalTo(assignedTo);
      }
      
      // Get filtered results
      const inquiriesSnapshot = await query.once('value');
      if (inquiriesSnapshot.exists()) {
        inquiriesSnapshot.forEach(childSnapshot => {
          inquiries.push({
            id: childSnapshot.key,
            ...childSnapshot.val()
          });
        });
      }
      
      // Apply date filtering (client-side for now, can be optimized later)
      if (dateRange && dateRange !== 'ALL') {
        const cutoffDate = new Date();
        if (dateRange === '7d') cutoffDate.setDate(cutoffDate.getDate() - 7);
        else if (dateRange === '30d') cutoffDate.setDate(cutoffDate.getDate() - 30);
        else if (dateRange === '90d') cutoffDate.setDate(cutoffDate.getDate() - 90);
        
        inquiries = inquiries.filter(inq => new Date(inq.createdAt) >= cutoffDate);
      }
      
      // Apply search filtering
      if (search) {
        const searchLower = search.toLowerCase();
        inquiries = inquiries.filter(inq => 
          inq.firstName?.toLowerCase().includes(searchLower) ||
          inq.lastName?.toLowerCase().includes(searchLower) ||
          inq.email?.toLowerCase().includes(searchLower) ||
          inq.company?.toLowerCase().includes(searchLower) ||
          inq.message?.toLowerCase().includes(searchLower) ||
          inq.ticketNumber?.toLowerCase().includes(searchLower)
        );
      }
      
      // Sort by creation date (newest first)
      inquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Apply pagination
      const paginatedInquiries = inquiries.slice(offset, offset + limitNum);
      const totalPages = Math.ceil(inquiries.length / limitNum);
      
      res.json({ 
        inquiries: paginatedInquiries,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount: inquiries.length,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1
        }
      });
    } catch (error) {
      console.error("[CONTACT] Error fetching contact inquiries:", error);
      res.status(500).json({ error: "Failed to fetch contact inquiries" });
    }
  });

  // Admin: Update contact inquiry with response system
  app.put("/admin/contact-inquiries/:inquiryId", ...adminProtected, validateBody(contactAdminUpdateBodySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { inquiryId } = req.params;
      const { 
        status, 
        priority, 
        adminNotes, 
        assignedTo, 
        response,
        sendEmailToCustomer = true
      } = req.body;
      
      // Get current inquiry data
      const inquirySnapshot = await db.ref(`contactInquiries/${inquiryId}`).once('value');
      if (!inquirySnapshot.exists()) {
        return res.status(404).json({ error: "Contact inquiry not found" });
      }
      
      const currentInquiry = inquirySnapshot.val();
      const previousStatus = currentInquiry.status;
      
      // Build updates object, filtering out undefined values
      const updates = {};
      
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;
      if (adminNotes !== undefined) updates.adminNotes = adminNotes;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      
      // Always update these fields
      updates.updatedAt = new Date().toISOString();
      updates.lastUpdatedBy = req.user.sub;
      
      // Add response to responses array if provided
      if (response) {
        const newResponse = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          message: response,
          adminId: req.user.sub,
          adminName: req.user.name || req.user.email || 'Admin',
          timestamp: new Date().toISOString()
        };
        
        const responses = currentInquiry.responses || [];
        responses.push(newResponse);
        updates.responses = responses;
      }
      
      // Filter out any undefined values before sending to Firebase
      const filteredUpdates = filterUndefined(updates);
      await db.ref(`contactInquiries/${inquiryId}`).update(filteredUpdates);
      
      // Send email to customer if requested and status changed or response added
      if (sendEmailToCustomer && (status !== previousStatus || response)) {
        console.log('[CONTACT] Attempting to send status update email:', {
          email: currentInquiry.email,
          ticketNumber: currentInquiry.ticketNumber,
          statusChanged: status !== previousStatus,
          responseAdded: !!response,
          sendEmailFunctionAvailable: typeof sendEmail === 'function'
        });
        
        try {
          let emailSubject, emailBody;
          
          if (status === 'RESOLVED') {
            emailSubject = EMAIL_TEMPLATES.INQUIRY_RESOLVED.subject;
            emailBody = EMAIL_TEMPLATES.INQUIRY_RESOLVED.body(
              currentInquiry.ticketNumber,
              currentInquiry.firstName,
              response
            );
          } else if (status !== previousStatus) {
            emailSubject = EMAIL_TEMPLATES.STATUS_UPDATE.subject;
            emailBody = EMAIL_TEMPLATES.STATUS_UPDATE.body(
              currentInquiry.ticketNumber,
              currentInquiry.firstName,
              status,
              response
            );
          } else if (response) {
            emailSubject = EMAIL_TEMPLATES.STATUS_UPDATE.subject;
            emailBody = EMAIL_TEMPLATES.STATUS_UPDATE.body(
              currentInquiry.ticketNumber,
              currentInquiry.firstName,
              status,
              response
            );
          }
          
          if (emailSubject && emailBody) {
            // Check if sendEmail function is available
            if (typeof sendEmail === 'function') {
              console.log('[CONTACT] Sending status update email via sendEmail function...');
              const emailResult = await sendEmail(
                sesClient,
                currentInquiry.email,
                emailSubject,
                emailBody
              );
              console.log('[CONTACT] Status update email sent successfully:', emailResult);
            } else {
              console.error('[CONTACT] sendEmail function is not available - this should not happen!');
            }
          }
        } catch (emailError) {
          console.error('[CONTACT] Failed to send status update email:', emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.log('[CONTACT] Status update email not sent:', {
          sendEmailToCustomer,
          statusChanged: status !== previousStatus,
          responseAdded: !!response
        });
      }
      
      await logContactInquiryUpdated(auditLogger, { req, inquiryId, inquiry: currentInquiry, updates });
      
      res.json({ success: true, message: "Contact inquiry updated successfully" });
    } catch (error) {
      console.error("[CONTACT] Error updating contact inquiry:", error);
      res.status(500).json({ error: "Failed to update contact inquiry" });
    }
  });

  // Admin: Send response to customer
  app.post("/admin/contact-inquiries/:inquiryId/respond", ...adminProtected, validateBody(contactAdminRespondBodySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { inquiryId } = req.params;
      const { response, sendEmailToCustomer = true } = req.body;
      
      if (!response) {
        return res.status(400).json({ error: "Response message is required" });
      }
      
      // Get current inquiry data
      const inquirySnapshot = await db.ref(`contactInquiries/${inquiryId}`).once('value');
      if (!inquirySnapshot.exists()) {
        return res.status(404).json({ error: "Contact inquiry not found" });
      }
      
      const currentInquiry = inquirySnapshot.val();
      
      // Add response to responses array
      const newResponse = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        message: response,
        adminId: req.user.sub,
        adminName: req.user.name || req.user.email || 'Admin',
        timestamp: new Date().toISOString()
      };
      
      const responses = currentInquiry.responses || [];
      responses.push(newResponse);
      
      // Update inquiry - ensure all values are defined
      const updates = {
        responses: responses,
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: req.user.sub || 'unknown'
      };
      
      // Filter out any undefined values before sending to Firebase
      const filteredUpdates = filterUndefined(updates);
      await db.ref(`contactInquiries/${inquiryId}`).update(filteredUpdates);
      
      // Send email to customer if requested
      if (sendEmailToCustomer) {
        console.log('[CONTACT] Attempting to send email to customer:', {
          email: currentInquiry.email,
          ticketNumber: currentInquiry.ticketNumber,
          sendEmailFunctionAvailable: typeof sendEmail === 'function'
        });
        
        try {
          const emailSubject = `Response to your inquiry - ${currentInquiry.ticketNumber}`;
          const emailBody = `
Dear ${currentInquiry.firstName},

You have received a response to your inquiry:

Ticket Number: ${currentInquiry.ticketNumber}
Response from our team:

${response}

Kindly track your request by ticket number on the ReconFY Support Portal.

Best regards,
ReconFY Support Team
          `.trim();
          
          // Check if sendEmail function is available
          if (typeof sendEmail === 'function') {
            console.log('[CONTACT] Sending email via sendEmail function...');
            const emailResult = await sendEmail(
              sesClient,
              currentInquiry.email,
              emailSubject,
              emailBody
            );
            console.log('[CONTACT] Email sent successfully:', emailResult);
          } else {
            console.error('[CONTACT] sendEmail function is not available - this should not happen!');
          }
        } catch (emailError) {
          console.error('[CONTACT] Failed to send response email:', emailError);
          // Don't fail the request if email fails
        }
      } else {
        console.log('[CONTACT] Email not sent - sendEmailToCustomer is false');
      }
      
      await logContactInquiryResponseSent(auditLogger, { req, inquiryId, inquiry: currentInquiry, response: newResponse });
      
      res.json({ success: true, message: "Response sent successfully" });
    } catch (error) {
      console.error("[CONTACT] Error sending response:", error);
      res.status(500).json({ error: "Failed to send response" });
    }
  });

  // Admin: Get contact inquiry statistics
  app.get("/admin/contact-inquiries/stats", ...adminProtected, validateBody(contactAdminStatsQuerySchema), async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
      let inquiries = [];
      
      if (inquiriesSnapshot.exists()) {
        inquiriesSnapshot.forEach(childSnapshot => {
          inquiries.push(childSnapshot.val());
        });
      }
      
      // Calculate statistics
      const stats = {
        total: inquiries.length,
        byStatus: {
          NEW: inquiries.filter(inq => inq.status === 'NEW').length,
          IN_PROGRESS: inquiries.filter(inq => inq.status === 'IN_PROGRESS').length,
          RESOLVED: inquiries.filter(inq => inq.status === 'RESOLVED').length,
          CLOSED: inquiries.filter(inq => inq.status === 'CLOSED').length,
          CUSTOMER_REPLY: inquiries.filter(inq => inq.status === 'CUSTOMER_REPLY').length
        },
        byPriority: {
          LOW: inquiries.filter(inq => inq.priority === 'LOW').length,
          MEDIUM: inquiries.filter(inq => inq.priority === 'MEDIUM').length,
          HIGH: inquiries.filter(inq => inq.priority === 'HIGH').length,
          URGENT: inquiries.filter(inq => inq.priority === 'URGENT').length
        },
        byCategory: {
          GENERAL: inquiries.filter(inq => inq.category === 'GENERAL').length,
          TECHNICAL: inquiries.filter(inq => inq.category === 'TECHNICAL').length,
          BILLING: inquiries.filter(inq => inq.category === 'BILLING').length,
          FEATURE_REQUEST: inquiries.filter(inq => inq.category === 'FEATURE_REQUEST').length
        },
        averageResponseTime: 0, // TODO: Calculate based on first response time
        unassigned: inquiries.filter(inq => !inq.assignedTo).length,
        customerReplies: inquiries.reduce((total, inq) => total + (inq.customerReplies?.length || 0), 0)
      };
      
      res.json({ stats });
    } catch (error) {
      console.error("[CONTACT] Error fetching contact statistics:", error);
      res.status(500).json({ error: "Failed to fetch contact statistics" });
    }
  });

  // Public: Get ticket by ticket number (customer portal)
  app.get("/ticket/:ticketNumber", globalLimiter, async (req, res) => {
    try {
      const { ticketNumber } = req.params;
      
      if (!ticketNumber) {
        return res.status(400).json({ error: "Ticket number is required" });
      }
      
      // Search for ticket in Firebase
      const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
      let foundInquiry = null;
      
      if (inquiriesSnapshot.exists()) {
        inquiriesSnapshot.forEach(childSnapshot => {
          const inquiry = childSnapshot.val();
          if (inquiry.ticketNumber === ticketNumber) {
            foundInquiry = {
              id: childSnapshot.key,
              ...inquiry
            };
          }
        });
      }
      
      if (!foundInquiry) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      // Return ticket details (excluding sensitive admin info)
      const ticketData = {
        ticketNumber: foundInquiry.ticketNumber,
        firstName: foundInquiry.firstName,
        lastName: foundInquiry.lastName,
        email: foundInquiry.email,
        company: foundInquiry.company,
        message: foundInquiry.message,
        category: foundInquiry.category,
        status: foundInquiry.status,
        priority: foundInquiry.priority,
        createdAt: foundInquiry.createdAt,
        updatedAt: foundInquiry.updatedAt,
        responses: foundInquiry.responses || [],
        customerReplies: foundInquiry.customerReplies || []
      };
      
      res.json({ success: true, ticket: ticketData });
    } catch (error) {
      console.error("[CONTACT] Error fetching ticket:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  // Public: Customer reply to ticket
  app.post("/ticket/:ticketNumber/reply", contactLimiter, validateBody(ticketReplyBodySchema), async (req, res) => {
    try {
      const { ticketNumber } = req.params;
      const { message, customerEmail, customerName } = req.body;
      
      if (!message || !customerEmail || !customerName) {
        return res.status(400).json({ error: "Message, customer email, and customer name are required" });
      }
      
      // Find the ticket
      const inquiriesSnapshot = await db.ref('contactInquiries').once('value');
      let foundInquiry = null;
      let inquiryId = null;
      
      if (inquiriesSnapshot.exists()) {
        inquiriesSnapshot.forEach(childSnapshot => {
          const inquiry = childSnapshot.val();
          if (inquiry.ticketNumber === ticketNumber) {
            foundInquiry = inquiry;
            inquiryId = childSnapshot.key;
          }
        });
      }
      
      if (!foundInquiry) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      // Check if ticket is resolved (no more replies allowed)
      if (foundInquiry.status === 'RESOLVED') {
        return res.status(400).json({ error: "Cannot reply to resolved ticket" });
      }
      
      // Verify customer email matches ticket email
      if (foundInquiry.email !== customerEmail) {
        return res.status(403).json({ error: "Email does not match ticket" });
      }
      
      // Create customer reply
      const customerReply = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        message: message,
        customerEmail: customerEmail,
        customerName: customerName,
        timestamp: new Date().toISOString()
      };
      
      // Add to customerReplies array
      const customerReplies = foundInquiry.customerReplies || [];
      customerReplies.push(customerReply);
      
      // Update ticket
      const updates = {
        customerReplies: customerReplies,
        status: 'CUSTOMER_REPLY',
        updatedAt: new Date().toISOString(),
        lastCustomerReply: new Date().toISOString()
      };
      
      await db.ref(`contactInquiries/${inquiryId}`).update(updates);
      
      // Send notification email to admins (optional)
      try {
        if (typeof sendEmail === 'function') {
          const adminNotificationSubject = `Customer Reply - Ticket ${ticketNumber}`;
          const adminNotificationBody = `
A customer has replied to ticket ${ticketNumber}:

Customer: ${customerName} (${customerEmail})
Message: ${message}

Please review and respond in the admin dashboard.

Best regards,
ReconFY System
          `.trim();
          
          // Get admin emails from users collection
          const usersSnapshot = await db.ref('users').once('value');
          const adminEmails = [];
          
          if (usersSnapshot.exists()) {
            usersSnapshot.forEach(childSnapshot => {
              const user = childSnapshot.val();
              if (user.role === 'admin' || user.role === 'Admin') {
                adminEmails.push(user.email);
              }
            });
          }
          
          // Send to each admin
          for (const adminEmail of adminEmails) {
            try {
              await sendEmail(sesClient, adminEmail, adminNotificationSubject, adminNotificationBody);
            } catch (emailError) {
              console.error(`[CONTACT] Failed to send admin notification to ${adminEmail}:`, emailError);
            }
          }
        }
      } catch (emailError) {
        console.error('[CONTACT] Failed to send admin notifications:', emailError);
        // Don't fail the request if email fails
      }
      
      res.json({ 
        success: true, 
        message: "Reply sent successfully",
        replyId: customerReply.id
      });
      
    } catch (error) {
      console.error("[CONTACT] Error sending customer reply:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // Admin: Delete contact inquiry
  app.delete("/admin/contact-inquiries/:inquiryId", ...adminProtected, async (req, res) => {
    const groups = req.user["cognito:groups"] || [];
    if (!groups.includes("Admins")) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }
    
    try {
      const { inquiryId } = req.params;
      
      // Fetch inquiry data for audit logging
      const inquirySnap = await db.ref(`contactInquiries/${inquiryId}`).once('value');
      const inquiryData = inquirySnap.val();
      
      if (!inquiryData) {
        return res.status(404).json({ error: "Contact inquiry not found" });
      }
      
      await db.ref(`contactInquiries/${inquiryId}`).remove();
      
      await logContactInquiryDeleted(auditLogger, { req, inquiryId, inquiry: inquiryData });
      
      res.json({ success: true, message: "Contact inquiry deleted successfully" });
    } catch (error) {
      console.error("[CONTACT] Error deleting contact inquiry:", error);
      res.status(500).json({ error: "Failed to delete contact inquiry" });
    }
  });
}
