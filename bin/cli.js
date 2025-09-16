#!/usr/bin/env node
import { startProductionServer } from '../src/presentation/entry-points/server.js';

// Beta software notice
console.log('⚠️  BETA SOFTWARE - Evaluation only');
console.log('   Business/revenue-generating use requires permission');
console.log('');

// Start the web server when installed via npx
console.log('🚀 Starting Dash Server...');
console.log('   Please wait while we initialize...');
await startProductionServer();
