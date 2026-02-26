/**
 * Status command - shows task status
 */

import type { StorageAdapter } from '../../types/deps.js';
import { yellow } from '../colors.js';
import { log, printTaskDetails } from '../display.js';

export async function commandStatus(flags: Record<string, string>): Promise<void> {
  const taskId = flags['task-id'];

  const { loadConfig } = await import('../../config.js');
  const config = loadConfig();

  const { createStorage } = await import('../../infrastructure/storage/mangodb.js');
  const storage = await createStorage(config.dataDir);

  try {
    if (taskId) {
      const { getTask } = await import('../../queries/getTask.js');
      const task = await getTask(taskId, { storage });
      printTaskDetails(task);
    } else {
      // Show the most recent task
      const { listTasks } = await import('../../queries/listTasks.js');
      const tasks = await listTasks({ storage });

      if (tasks.length === 0) {
        log('No tasks found.');
        return;
      }

      // Sort by updatedAt descending, show the most recent
      tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const latest = tasks[0];
      log(`Showing most recent task. Use ${yellow('--task-id <id>')} to query a specific task.\n`);
      printTaskDetails(latest);
    }
  } finally {
    await (storage as StorageAdapter & { close(): Promise<void> }).close();
  }
}
