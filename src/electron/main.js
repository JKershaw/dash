import { app, BrowserWindow, shell } from 'electron';
import { startServer, stopServer } from '../presentation/entry-points/server.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let serverInstance = null;

const createWindow = async () => {
  try {
    // Set output directory to proper Electron user data path
    // This ensures files are written to the correct location for desktop apps
    if (!process.env.OUTPUT_DIR) {
      process.env.OUTPUT_DIR = path.join(app.getPath('userData'), 'output');
    }
    
    // Start Express server
    console.log('🚀 Starting Express server...');
    const { server, port } = await startServer();
    serverInstance = server;
    console.log(`📡 Server running on port ${port}`);
    
    // Create Electron window
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false, // Disable sandbox for file system access
        preload: path.join(__dirname, 'preload.js')
      },
      icon: path.join(__dirname, '../../public/icons/icon-512.png'),
      show: false, // Don't show until ready
      titleBarStyle: 'default',
      webSecurity: true
    });
    
    // Wait for page to load, then show window
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      console.log('🎯 Dash ready!');
    });
    
    // Handle external links - open in default browser instead of Electron window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
    
    await mainWindow.loadURL(`http://localhost:${port}`);
    
    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    app.quit();
  }
};

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  console.log('🛑 Shutting down server...');
  if (serverInstance) {
    await stopServer(serverInstance);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle server errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});