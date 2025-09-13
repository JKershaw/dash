import { config } from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath, URL } from 'url';
import { readFileSync } from 'fs';
// Data service removed - all data loaded via API endpoints
import { setupAPIRoutes, setupErrorHandling, setupRequestLogging } from '../api/routes.js';

// Load environment variables
config();

// Load version from package.json
const packageJson = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
);
const version = packageJson.version;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Express app (without starting server)
 * @param {Object} configOverrides - Optional configuration overrides for testing
 * @returns {Object} app - Express app instance
 */
export function createApp(configOverrides = null) {
  const app = express();

  // Store config overrides for API routes to use
  if (configOverrides) {
    app.locals.configOverrides = configOverrides;
  }

  // Set up EJS templating
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../../views'));

  // Serve static files from the output reports directories
  app.use('/reports', express.static(path.join(__dirname, 'output', 'reports', 'html')));
  app.use('/output', express.static(path.join(__dirname, 'output')));

  // Serve static assets (CSS, JS, etc.)
  app.use('/public', express.static(path.join(__dirname, '../../../public')));

  // Parse JSON bodies for API requests
  app.use(express.json());

  /**
   * Test route - verify EJS template compilation
   */
  app.get('/test', (req, res) => {
    console.log('🧪 Testing EJS template compilation...');
    res.render('test', {
      version: version,
    });
  });

  /**
   * Main dashboard route
   */
  app.get('/', (req, res) => {
    console.log('🏠 Serving dashboard...');
    res.render('dashboard', {
      title: 'Dashboard - Dash',
      currentPage: 'dashboard',
      version: version,
    });
  });

  /**
   * Results page route (latest results)
   */
  app.get('/results', (req, res) => {
    console.log('📊 Serving results page...');
    res.render('results', {
      title: 'Analysis Results - Dash',
      currentPage: 'results',
      version: version,
    });
  });

  /**
   * Results page route for specific analysis run
   */
  app.get('/results/:id', (req, res) => {
    const runId = req.params.id;
    console.log(`📊 Serving results page for run: ${runId}`);
    res.render('results', {
      title: `Analysis Results (${runId.substring(0, 8)}...) - Dash`,
      currentPage: 'results',
      version: version,
      runId: runId,
    });
  });

  /**
   * Sessions page route
   */
  app.get('/sessions', (req, res) => {
    console.log('📋 Serving sessions page...');
    res.render('sessions', {
      title: 'Session Explorer - Dash',
      currentPage: 'sessions',
      version: version,
    });
  });

  /**
   * Individual session page route
   */
  app.get('/session/:id', (req, res) => {
    console.log('📄 Serving session details page...');
    res.render('session', {
      title: `Session ${req.params.id} - Dash`,
      currentPage: 'sessions',
      sessionId: req.params.id,
      version: version,
    });
  });

  /**
   * Debug page route
   */
  app.get('/debug', (req, res) => {
    console.log('🐛 Serving debug page...');
    res.render('debug', {
      title: 'Debug Session Analysis - Dash',
      currentPage: 'debug',
      version: version,
      selectedSessionId: null,
    });
  });

  /**
   * Debug page route with session ID
   */
  app.get('/debug/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    console.log(`🐛 Serving debug page for session: ${sessionId}`);
    res.render('debug', {
      title: `Debug Session Analysis (${sessionId.substring(0, 8)}...) - Dash`,
      currentPage: 'debug',
      version: version,
      selectedSessionId: sessionId,
    });
  });

  /**
   * Settings page route
   */
  app.get('/settings', (req, res) => {
    console.log('⚙️ Serving settings page...');
    res.render('settings', {
      title: 'Settings - Dash',
      currentPage: 'settings',
      version: version,
    });
  });

  /**
   * Redirect old /live route to main route
   */
  app.get('/live', (req, res) => {
    res.redirect(301, '/');
  });

  /**
   * Setup API routes and error handling
   */
  setupRequestLogging(app); // Setup request logging first
  setupAPIRoutes(app); // Setup all API routes
  setupErrorHandling(app); // Setup error handling middleware last

  return app;
}

/**
 * Parse port from command line arguments
 * @returns {number|null} Port number from --port= argument or null
 */
function parsePortFromArgs() {
  const portArg = process.argv.find(arg => arg.startsWith('--port='));
  return portArg ? parseInt(portArg.split('=')[1]) : null;
}

/**
 * Universal server start - works for production AND tests
 * @param {Object} configOverrides - Optional configuration overrides for testing
 * @returns {Promise<Object>} { app, server, port } - Express app, server instance, and port
 */
export async function startServer(configOverrides = null) {
  const app = createApp(configOverrides);
  const cliPort = parsePortFromArgs();
  const PORT = cliPort || process.env.PORT || 0;

  const server = app.listen(PORT, '0.0.0.0');

  // Wait for server to be ready (prevents async timing issues)
  await new Promise(resolve => server.once('listening', resolve));

  const actualPort = server.address().port;
  
  // Store current port in app locals for settings API
  app.locals.currentPort = actualPort;

  // Only log if not in test mode
  if (process.env.NODE_ENV !== 'test') {
    const url = `http://localhost:${actualPort}`;

    console.log('');
    console.log('='.repeat(65));
    console.log('');
    console.log('🎯 Dash Server Ready!');
    console.log('');
    console.log(`   Dashboard:  ${url}`);
    console.log('');
    console.log('   → Open the URL above in your browser');
    console.log('   → View your session analysis and recommendations');
    console.log('   → Browse individual sessions and patterns');

    if (configOverrides) {
      console.log('');
      console.log('🧪 Test mode: Using config overrides');
      const logDir = configOverrides.LOG_PATHS?.SEARCH_DIRS?.[0] || 'default';
      console.log(`📂 Log directory: ${logDir}`);
    }

    console.log('');
    console.log('   Press Ctrl+C to stop the server');
    console.log('');
    console.log('='.repeat(65));
    console.log('');
  }

  // Universal signal handlers (safe in all environments)
  process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down server gracefully...');
    await stopServer(server);
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('👋 Received SIGTERM, shutting down gracefully...');
    await stopServer(server);
    process.exit(0);
  });

  return { app, server, port: actualPort };
}

/**
 * Stop server gracefully
 * @param {Object} server - Server instance
 * @returns {Promise<void>}
 */
export function stopServer(server) {
  if (!server || !server.listening) {
    return;
  }

  return new Promise(resolve => {
    server.close(() => resolve());
  });
}


/**
 * Start server in production mode (called by npm start)
 */
export async function startProductionServer() {
  // Use universal startServer (signal handlers included automatically)
  return await startServer();
}

// If this module is run directly (npm start), start production server
if (import.meta.url === `file://${process.argv[1]}`) {
  await startProductionServer();
}
