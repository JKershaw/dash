/**
 * @file API Routes Module
 * Main router that delegates to specialized route modules
 *
 * @swagger
 * openapi: 3.0.3
 * info:
 *   title: Claude Code Analysis API
 *   description: API for analyzing Claude Code conversation logs and generating insights
 *   version: 1.0.0
 *   contact:
 *     name: AI Self-Improvement System
 * servers:
 *   - url: http://localhost:{dynamic_port}
 *     description: Development server
 */

import { setupLogRoutes } from './routes/logs.js';
import { setupSessionRoutes } from './routes/sessions.js';
import { setupAnalysisRoutes } from './routes/analysis.js';
import { setupDashboardRoutes } from './routes/dashboard.js';
import { setupReportsRoutes } from './routes/reports.js';
import { setupDebugRoutes } from './routes/debug.js';
import { setupChatRoutes } from './routes/chat.js';
import { setupSettingsRoutes } from './routes/settings.js';

/**
 * Setup all API routes using modular approach
 * @param {Express.Application} app - Express application instance
 */
export function setupAPIRoutes(app) {
  console.log('🔗 Setting up API routes...');

  // Setup route modules
  setupLogRoutes(app);
  setupSessionRoutes(app);
  setupAnalysisRoutes(app);
  setupReportsRoutes(app);
  setupDashboardRoutes(app);
  setupDebugRoutes(app);
  setupChatRoutes(app);
  setupSettingsRoutes(app);

  console.log('✅ API routes configured');
}

/**
 * Setup error handling middleware for API routes
 * @param {Express.Application} app - Express application instance
 */
export function setupErrorHandling(app) {
  // Global error handler for API routes
  app.use('/api/*', (err, req, res, _next) => {
    console.error('API Error:', err);
    
    // Handle JSON parsing errors with 400 status
    if (err.type === 'entity.parse.failed' || 
        err.name === 'SyntaxError' && err.message.includes('JSON')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON format',
        timestamp: new Date().toISOString(),
        path: req.path,
      });
    }
    
    // Handle other errors with 500 status
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  });

  // 404 handler for API routes (only for unmatched API routes)
  app.use('/api/*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint ${req.path} not found`,
      timestamp: new Date().toISOString(),
    });
  });
}

/**
 * Setup request logging middleware
 * @param {Express.Application} app - Express application instance
 */
export function setupRequestLogging(app) {
  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api/')) {
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      }
    });
    next();
  });
}
