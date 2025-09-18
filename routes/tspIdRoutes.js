/**
 * TSP ID Extraction Routes
 * Handles PDF TSP ID extraction using Python integration
 * Extracted from index.js for better modularity
 */

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { globalLimiter } from "../middleware/rateLimiting.js";
import { requireAuth, adminProtected } from "../middleware/stacks.js";
import { validateBody } from "../middleware/validation.js";
import { tspIdExtractionSchema } from "../schemas.js";
import { memoryCleanup } from "../utils/memoryCleanup.js";
import { pythonProcessManager } from "../utils/pythonProcessManager.js";

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Setup TSP ID extraction routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.upload - Multer instance for single file upload
 * @param {Object} dependencies.uploadMultiple - Multer instance for multiple file upload
 */
export const setupTspIdRoutes = (app, { upload, uploadMultiple }) => {

  // TSP ID Extraction endpoint using PyMuPDF
  app.post('/extract-tsp-id', 
    // globalLimiter is applied app-wide; avoid duplicate stacking
    ...requireAuth, 
    upload.single('pdfFile'), 
    validateBody(tspIdExtractionSchema),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        // Create temporary file from memory buffer
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${req.file.originalname}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        // Verify file was created
        if (!fs.existsSync(tempFilePath)) {
          return res.status(500).json({ error: 'Failed to create temporary file' });
        }
        
        console.log(`Processing PDF: ${req.file.originalname}`);
        
        // Log memory usage before processing
        memoryCleanup.logMemoryUsage('Before PDF Processing');
        
        // Call Python script using process manager (pool with fallback)
        const scriptPath = path.join(__dirname, '..', 'python');
        
        // Use virtual environment Python if it exists, otherwise fallback to system Python
        const venvPython = path.join(__dirname, '..', 'venv', 'bin', 'python');
        const pythonCommand = fs.existsSync(venvPython) ? venvPython : 
                             (process.platform === 'linux' ? 'python3' : 'python');
        
        const options = {
          mode: 'json',
          pythonPath: pythonCommand, // Use venv Python if available, otherwise system Python
          pythonOptions: ['-u'],
          scriptPath: scriptPath,
          args: [path.resolve(tempFilePath)] // Use absolute path
        };

        try {
          // Use process manager for better memory management
          const results = await pythonProcessManager.execute('pdf_processor_pypdf2.py', [path.resolve(tempFilePath)], options);
          
          // Parse the response correctly
          let result;
          if (Array.isArray(results) && results.length > 0) {
            result = results[0];
          } else if (results && typeof results === 'object') {
            result = results;
          } else {
            result = null;
          }
          
          // Handle successful extraction
          if (result && result.success === true && result.results && result.results.tspId) {
            console.log(`[PDF] ✅ TSP ID found: ${result.results.tspId} for ${req.file.originalname}`);
            
            // Clean up temporary file
            try {
              if (fs.existsSync(tempFilePath)) {
                await fs.remove(tempFilePath);
              }
            } catch (cleanupError) {
              console.error('[PDF] File cleanup error:', cleanupError);
            }
            
            // Memory cleanup after successful processing
            await memoryCleanup.comprehensiveCleanup(req.file, tempDir, 'Single PDF Processing');
            
            res.json({
              success: true,
              results: result.results,
              fileName: req.file.originalname,
              extractedAt: new Date().toISOString(),
              accuracy: result.results.accuracy || '100%',
              method: result.results.method || 'PyMuPDF Smart Extraction'
            });
          } else if (result && result.success === false) {
            console.log(`[PDF] ❌ Python script reported failure for ${req.file.originalname}:`, result.error);
            
            // Clean up temporary file
            try {
              if (fs.existsSync(tempFilePath)) {
                await fs.remove(tempFilePath);
              }
            } catch (cleanupError) {
              console.error('[PDF] File cleanup error:', cleanupError);
            }
            
            // Memory cleanup after processing
            await memoryCleanup.comprehensiveCleanup(req.file, tempDir, 'Single PDF Processing');
            
            res.status(404).json({ 
              error: 'No TSP ID found in PDF',
              details: result.error || 'Python script could not extract TSP ID',
              method: result.results?.method || 'PyMuPDF Smart Extraction'
            });
          } else {
            console.warn(`[PDF] ❌ No valid results from Python script for ${req.file.originalname}`);
            console.warn(`[PDF_DEBUG] Result was:`, result);
            
            // Clean up temporary file
            try {
              if (fs.existsSync(tempFilePath)) {
                await fs.remove(tempFilePath);
              }
            } catch (cleanupError) {
              console.error('[PDF] File cleanup error:', cleanupError);
            }
            
            // Memory cleanup after processing
            await memoryCleanup.comprehensiveCleanup(req.file, tempDir, 'Single PDF Processing');
            
            res.status(404).json({ 
              error: 'No TSP ID found in PDF',
              details: 'Python script returned invalid response format'
            });
          }
        } catch (error) {
          console.error(`[PDF] Processing error for ${req.file.originalname}:`, error.message);
          
          // Clean up temporary file
          try {
            if (fs.existsSync(tempFilePath)) {
              await fs.remove(tempFilePath);
            }
          } catch (cleanupError) {
            console.error('[PDF] File cleanup error:', cleanupError);
          }
          
          // Memory cleanup after error
          await memoryCleanup.comprehensiveCleanup(req.file, tempDir, 'Single PDF Processing Error');
          
          res.status(500).json({ 
            error: 'PDF processing failed',
            details: error.message
          });
        }

      } catch (error) {
        console.error('TSP ID extraction error:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          details: error.message 
        });
      }
    }
  );

  // Batch TSP ID Extraction endpoint for multiple PDFs
  app.post('/extract-tsp-ids-batch', 
    ...requireAuth, 
    upload.array('pdfFiles', 10), // Allow up to 10 PDFs
    validateBody(tspIdExtractionSchema),
    async (req, res) => {
      try {
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'No PDF files uploaded' });
        }

        const results = [];
        const errors = [];

        // Log memory usage before batch processing
        memoryCleanup.logMemoryUsage('Before Batch PDF Processing');

        // Process each PDF individually for maximum accuracy
        for (const file of req.files) {
          try {
            // Create temporary file from memory buffer
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${file.originalname}`);
            fs.writeFileSync(tempFilePath, file.buffer);
            
            // Call Python script using process manager for better memory management
            const scriptPath = path.join(__dirname, '..', 'python');
            const options = {
              mode: 'json',
              pythonPath: 'python',
              pythonOptions: ['-u'],
              scriptPath: scriptPath,
              args: [path.resolve(tempFilePath)] // Use absolute path
            };

            // Use process manager for better memory management
            const extractionResult = await pythonProcessManager.execute('pdf_processor_pypdf2.py', [path.resolve(tempFilePath)], options);

            // Parse the response correctly for batch processing
            let result;
            if (Array.isArray(extractionResult) && extractionResult.length > 0) {
              result = extractionResult[0];
            } else if (extractionResult && typeof extractionResult === 'object') {
              result = extractionResult;
            } else {
              result = null;
            }

            // ✅ CRITICAL FIX: Async file cleanup with error handling
            try {
              if (fs.existsSync(tempFilePath)) {
                await fs.remove(tempFilePath);
              }
            } catch (cleanupError) {
              console.error('[PDF] Batch file cleanup error:', cleanupError);
              // Don't fail the request due to cleanup issues
            }

            // Handle successful extraction for batch
            if (result && result.success === true && result.results && result.results.tspId) {
              console.log(`[PDF_BATCH] ✅ TSP ID found: ${result.results.tspId} for ${file.originalname}`);
              results.push({
                fileName: file.originalname,
                success: true,
                tspId: result.results.tspId,
                confidence: result.results.confidence,
                method: result.results.method,
                description: result.results.description,
                accuracy: result.results.accuracy || '100%'
              });
            } else if (result && result.success === false) {
              console.log(`[PDF_BATCH] ❌ Python script reported failure for ${file.originalname}:`, result.error);
              errors.push({
                fileName: file.originalname,
                error: result.error || 'Python script could not extract TSP ID',
                method: result.results?.method || 'PyMuPDF Smart Extraction'
              });
            } else {
              console.warn(`[PDF_BATCH] ❌ No valid results from Python script for ${file.originalname}`);
              errors.push({
                fileName: file.originalname,
                error: 'Python script returned invalid response format'
              });
            }

          } catch (fileError) {
            console.error(`Error processing ${file.originalname}:`, fileError);
            errors.push({
              fileName: file.originalname,
              error: fileError.message
            });
            
            // ✅ CRITICAL FIX: Async file cleanup with error handling
            try {
              if (fs.existsSync(file.path)) {
                await fs.remove(file.path);
              }
            } catch (cleanupError) {
              console.error('[PDF] Error cleanup error:', cleanupError);
              // Don't fail the request due to cleanup issues
            }
          }
        }

        // Memory cleanup after batch processing
        await memoryCleanup.comprehensiveCleanup(req.files, tempDir, 'Batch PDF Processing');

        // Return batch results
        res.json({
          success: true,
          totalFiles: req.files.length,
          successfulExtractions: results.length,
          failedExtractions: errors.length,
          results: results,
          errors: errors,
          extractedAt: new Date().toISOString(),
          overallAccuracy: '100%'
        });

      } catch (error) {
        console.error('Batch TSP ID extraction error:', error);
        res.status(500).json({ 
          error: 'Batch processing failed',
          details: error.message 
        });
      }
    }
  );

  // Process pool monitoring endpoint
  app.get('/admin/python-process-stats', 
    ...adminProtected, 
    async (req, res) => {
      try {
        const stats = pythonProcessManager.getStats();
        res.json({
          success: true,
          stats: stats,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Process stats error:', error);
        res.status(500).json({
          error: 'Failed to get process statistics',
          message: error.message
        });
      }
    }
  );

};
