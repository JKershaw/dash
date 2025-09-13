#!/usr/bin/env node
import { startProductionServer } from '../src/presentation/entry-points/server.js';

// Start the web server when installed via npx
console.log('🚀 Starting Dash Server...');
console.log('   Please wait while we initialize...');
await startProductionServer();
