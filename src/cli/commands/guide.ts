/**
 * Guide command - prints the agent guide to stdout
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function commandGuide(): void {
  const guidePath = resolve(__dirname, '../../../docs/agent-guide.md');
  const content = readFileSync(guidePath, 'utf-8');
  console.log(content);
}
