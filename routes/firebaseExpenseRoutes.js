import express from "express";
import path from "path";
import { requireActivePlan } from "../middleware/stacks.js";
import { uploadToS3, deleteFromS3, generateSignedUrl } from "../utils/s3Utils.js";
import { memoryCleanup } from "../utils/memoryCleanup.js";

export const setupFirebaseExpenseRoutes = (app, { 
  s3Client, 
  upload, 
  orphanedFilesTracker 
}) => {
  // Upload expense attachment
  app.post('/firebase/expenses/upload', ...requireActivePlan, upload.single('file'), async (req, res) => {
    let s3Key = null;
    try {
      const { locationId, monthYear } = req.body;
      const { sub: userId } = req.user;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!locationId || !monthYear) {
        return res.status(400).json({ error: 'Location ID and month-year are required' });
      }

      // Generate S3 key
      const fileExtension = path.extname(file.originalname);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      s3Key = `expenses/${userId}/${locationId}/${monthYear}/file-${uniqueSuffix}${fileExtension}`;

      // Upload to S3
      const uploadResult = await uploadToS3(s3Client, file, s3Key);

      const attachmentData = {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        s3Key: s3Key,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId
      };

      // Memory cleanup after S3 upload
      await memoryCleanup.comprehensiveCleanup(file, null, 'Expense File Upload');

      res.json(attachmentData);
    } catch (error) {
      console.error('Attachment upload error:', error);
      
      // ✅ S3 CLEANUP: Delete S3 file if upload succeeded but processing failed
      if (s3Key) {
        try {
          await deleteFromS3(s3Client, s3Key);
          console.log(`✅ Cleaned up orphaned S3 file after upload error: ${s3Key}`);
        } catch (cleanupError) {
          console.error('❌ Failed to cleanup S3 file after upload error:', cleanupError);
          // Track as orphaned file for monitoring
          orphanedFilesTracker.add(s3Key, 'Upload error cleanup failed');
        }
      }
      
      // ✅ ENTERPRISE FIX: No cleanup needed with memory storage
      // File is automatically freed from memory on error
      res.status(500).json({ error: error.message });
    }
  });

  // Get signed URL for attachment
  app.get('/firebase/expenses/attachment/:s3Key', ...requireAuth, async (req, res) => {
    try {
      const { s3Key } = req.params;
      const { sub: userId } = req.user;
      
      // Decode the S3 key
      const decodedS3Key = decodeURIComponent(s3Key);
      
      // Extract user ID from S3 key for validation
      const keyParts = decodedS3Key.split('/');
      if (keyParts.length < 4 || keyParts[1] !== userId) {
        return res.status(403).json({ error: 'Access denied: Invalid file path' });
      }

      // Generate signed URL (5 minutes for non-owners, 24 hours for owners)
      const userRole = req.user.role || 'user';
      const expirationTime = userRole === 'owner' ? 24 * 60 * 60 : 5 * 60; // seconds
      const signedUrl = await generateSignedUrl(s3Client, decodedS3Key, expirationTime);
      
      res.json({ signedUrl });
    } catch (error) {
      console.error('Signed URL generation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete attachment
  app.delete('/firebase/expenses/attachment/:s3Key', ...requireAuth, async (req, res) => {
    try {
      const { s3Key } = req.params;
      const { sub: userId } = req.user;
      
      // Decode the S3 key
      const decodedS3Key = decodeURIComponent(s3Key);
      
      // Extract user ID from S3 key for validation
      const keyParts = decodedS3Key.split('/');
      if (keyParts.length < 4 || keyParts[1] !== userId) {
        return res.status(403).json({ error: 'Access denied: Invalid file path' });
      }

      // Delete from S3
      await deleteFromS3(s3Client, decodedS3Key);
      
      res.json({ success: true, message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('Attachment deletion error:', error);
      res.status(500).json({ error: error.message });
    }
  });
};
