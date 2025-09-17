import express from "express";
import { globalLimiter } from "../middleware/rateLimiting.js";
import { requireActivePlan } from "../middleware/stacks.js";
import { memoryCleanup } from "../utils/memoryCleanup.js";

export const setupProxyRoutes = (app, { 
  uploadMultiple, 
  proxyToProcessingBackend 
}) => {
  // File processing endpoint with subscription validation
  app.post('/process-files', 
    // globalLimiter applied app-wide in index.js; avoid duplicate stacking here
    ...requireActivePlan,
    uploadMultiple.any(), // Handle multipart/form-data file uploads for processing
    async (req, res) => {
      // Log memory usage before processing
      memoryCleanup.logMemoryUsage('Before File Processing');
      
      try {
        await proxyToProcessingBackend(req, res, '/process-files');
        
        // Memory cleanup after processing
        if (req.files && req.files.length > 0) {
          await memoryCleanup.comprehensiveCleanup(req.files, null, 'File Processing');
        }
      } catch (error) {
        // Memory cleanup even on error
        if (req.files && req.files.length > 0) {
          await memoryCleanup.comprehensiveCleanup(req.files, null, 'File Processing Error');
        }
        throw error;
      }
    }
  );

  // Report download endpoints with subscription validation
  app.get('/download-report', 
    ...requireActivePlan,
    async (req, res) => {
      await proxyToProcessingBackend(req, res, '/download-report');
    }
  );

  app.get('/download-profit-report', 
    ...requireActivePlan,
    async (req, res) => {
      await proxyToProcessingBackend(req, res, '/download-profit-report');
    }
  );

  app.get('/download-rebate-checker-report', 
    ...requireActivePlan,
    async (req, res) => {
      await proxyToProcessingBackend(req, res, '/download-rebate-checker-report');
    }
  );

  app.get('/download-pos-checker-report', 
    ...requireActivePlan,
    async (req, res) => {
      await proxyToProcessingBackend(req, res, '/download-pos-checker-report');
    }
  );
};
