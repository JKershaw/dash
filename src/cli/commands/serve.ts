/**
 * Serve command - starts the web server
 */

import { log } from '../display.js';

export async function commandServe(): Promise<void> {
  log('Starting web server...');
  // Dynamic import to avoid loading express unless needed
  await import('../../server.js');
}
