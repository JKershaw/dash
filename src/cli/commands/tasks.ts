/**
 * Tasks command - lists all tasks
 */

import type { StorageAdapter } from '../../types/deps.js';
import { bold, dim, boldCyan } from '../colors.js';
import { log, getStatusColor } from '../display.js';

export async function commandTasks(): Promise<void> {
  const { loadConfig } = await import('../../config.js');
  const config = loadConfig();

  const { createStorage } = await import('../../infrastructure/storage/mangodb.js');
  const storage = await createStorage(config.dataDir);

  try {
    const { listTasks } = await import('../../queries/listTasks.js');
    const tasks = await listTasks({ storage });

    if (tasks.length === 0) {
      log('No tasks found.');
      return;
    }

    // Sort by updatedAt descending
    tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    console.log(`\n  ${bold(`Tasks (${tasks.length}):`)}\n`);

    // Table header
    console.log(
      `  ${dim('ID'.padEnd(38))}${dim('Status'.padEnd(20))}${dim('Phase'.padEnd(14))}${dim('Description')}`,
    );
    console.log(`  ${dim('\u2500'.repeat(90))}`);

    for (const task of tasks) {
      const statusColor = getStatusColor(task.status);
      const id = task.id.length > 36 ? task.id.slice(0, 33) + '...' : task.id;
      const description =
        task.config.taskDescription.length > 40
          ? task.config.taskDescription.slice(0, 37) + '...'
          : task.config.taskDescription;

      console.log(
        `  ${dim(id.padEnd(38))}${statusColor(task.status.padEnd(20))}${boldCyan(task.currentPhase.padEnd(14))}${description}`,
      );
    }

    console.log('');
  } finally {
    await (storage as StorageAdapter & { close(): Promise<void> }).close();
  }
}
