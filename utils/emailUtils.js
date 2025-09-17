/**
 * Email Utilities
 * Extracted from index.js for better organization and maintainability
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Email templates
export const EMAIL_TEMPLATES = {
  INQUIRY_RECEIVED: {
    subject: "Your inquiry has been received - ReconFY Support",
    body: (ticketNumber, customerName) => `
Dear ${customerName},

Thank you for contacting ReconFY Support. We have received your inquiry and our team will review it shortly.

Ticket Number: ${ticketNumber}
Status: New

We typically respond within 24 hours during business days. If you have any urgent concerns, please fllow up by ticket number on the ReconFY Support Portal..

Best regards,
ReconFY Support Team
    `.trim()
  },
  
  STATUS_UPDATE: {
    subject: "Your inquiry status has been updated - ReconFY Support",
    body: (ticketNumber, customerName, status, adminResponse) => `
Dear ${customerName},

Your inquiry status has been updated:

Ticket Number: ${ticketNumber}
New Status: ${status}

${adminResponse ? `Response from our team:\n${adminResponse}\n` : ''}

Kindly track your request by ticket number on the ReconFY Support Portal.

Best regards,
ReconFY Support Team
    `.trim()
  },
  
  INQUIRY_RESOLVED: {
    subject: "Your inquiry has been resolved - ReconFY Support",
    body: (ticketNumber, customerName, resolution) => `
Dear ${customerName},

Great news! Your inquiry has been resolved:

Ticket Number: ${ticketNumber}
Status: Resolved

${resolution ? `Resolution:\n${resolution}\n` : ''}

Thank you for choosing ReconFY!

Best regards,
ReconFY Support Team
    `.trim()
  }
};

// Helper function to send emails
export async function sendEmail(sesClient, toEmail, subject, body, fromEmail = null) {
  try {
    const fromAddress = fromEmail || process.env.SES_FROM_EMAIL || 'noreply@opssflow.com';
    
    const command = new SendEmailCommand({
      Source: fromAddress,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: body,
            Charset: 'UTF-8',
          },
        },
      },
    });

    const result = await sesClient.send(command);
    console.log('Email sent successfully:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

// Generate unique ticket number
export function generateTicketNumber() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `TKT-${timestamp}-${random}`.toUpperCase();
}
