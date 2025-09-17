/**
 * S3 Utility Functions
 * Extracted from index.js for better organization and maintainability
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Create default S3 client for use in other modules
const defaultS3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ✅ S3 CLEANUP: Track orphaned files for monitoring
export const orphanedFilesTracker = {
  files: new Set(),
  add: (s3Key, reason) => {
    orphanedFilesTracker.files.add({ s3Key, reason, timestamp: new Date().toISOString() });
    console.warn(`🚨 ORPHANED FILE TRACKED: ${s3Key} - Reason: ${reason}`);
  },
  remove: (s3Key) => {
    const file = Array.from(orphanedFilesTracker.files).find(f => f.s3Key === s3Key);
    if (file) {
      orphanedFilesTracker.files.delete(file);
      console.log(`✅ ORPHANED FILE CLEANED: ${s3Key}`);
    }
  },
  getStats: () => ({
    count: orphanedFilesTracker.files.size,
    files: Array.from(orphanedFilesTracker.files)
  })
};

// Upload file to S3
export const uploadToS3 = async (s3Client, file, s3Key) => {
  try {
    // Debug: Check environment variables
    console.log('S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME);
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Missing');
    console.log('File buffer size:', file.buffer ? file.buffer.length : 'No buffer');
    console.log('S3 Key:', s3Key);
    
    // ✅ ENTERPRISE FIX: Use file.buffer instead of reading from disk
    const fileContent = file.buffer;
    
    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString()
      }
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    
    // ✅ ENTERPRISE FIX: No cleanup needed with memory storage
    console.log('S3 upload successful:', s3Key);
    return {
      success: true,
      s3Key,
      bucket: process.env.S3_BUCKET_NAME,
      region: process.env.AWS_REGION
    };
  } catch (error) {
    console.error('S3 upload error details:', {
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      bucket: process.env.S3_BUCKET_NAME,
      region: process.env.AWS_REGION,
      s3Key
    });
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

// Delete file from S3
export const deleteFromS3 = async (s3Client, s3Key) => {
  try {
    // ✅ ENHANCED LOGGING: Log S3 deletion attempts
    console.log(`🗑️ Attempting to delete S3 file: ${s3Key}`);
    
    const deleteParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key
    };

    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);
    
    console.log(`✅ Successfully deleted S3 file: ${s3Key}`);
    return { success: true };
  } catch (error) {
    // ✅ ENHANCED ERROR LOGGING: More detailed error information
    console.error('❌ S3 delete error details:', {
      s3Key,
      error: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      bucket: process.env.S3_BUCKET_NAME,
      region: process.env.AWS_REGION
    });
    
    // ✅ ENHANCED ERROR HANDLING: Different error types
    if (error.code === 'NoSuchKey') {
      console.warn(`⚠️ S3 file not found (may already be deleted): ${s3Key}`);
      return { success: true, warning: 'File not found' };
    }
    
    if (error.code === 'AccessDenied') {
      console.error(`🚫 Access denied for S3 file: ${s3Key}`);
      throw new Error('Access denied: Unable to delete file from S3');
    }
    
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

// Generate signed URL for file access
export const generateSignedUrl = async (s3Client, s3Key, expirationSeconds = 300) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key
    });

    const signedUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: expirationSeconds 
    });
    
    return signedUrl;
  } catch (error) {
    console.error('S3 signed URL error:', error);
    throw new Error('Failed to generate signed URL');
  }
};

// Wrapper functions that use default S3 client for backward compatibility
export const deleteFromS3Default = async (s3Key) => {
  return deleteFromS3(defaultS3Client, s3Key);
};

export const uploadToS3Default = async (file, s3Key) => {
  return uploadToS3(defaultS3Client, file, s3Key);
};

export const generateSignedUrlDefault = async (s3Key, expirationSeconds = 300) => {
  return generateSignedUrl(defaultS3Client, s3Key, expirationSeconds);
};
