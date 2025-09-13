import 'dotenv/config';
import { loadAndSaveSessions } from '../../services/session-loader.js';
import { ProgressDebugLogger } from '../../infrastructure/progress-debug-logger.js';
import { createMetadata, finalizeMetadata } from '../../services/metadata-collector.js';
import { getTimestampedReportPath, writeFileContent } from '../../infrastructure/file-utils.js';

/**
 * @file Session Loading Entry Point
 * Loads sessions from JSONL files and saves to markdown format
 */

/**
 * The main function for loading sessions
 */
async function main() {
  try {
    console.log('🚀 Starting session loading from Claude logs...');

    // Create metadata tracking for this session loading run
    const metadata = createMetadata();

    // Track progress history for debug report
    const progressHistory = [];
    const startTime = Date.now();

    const sessions = await loadAndSaveSessions((step, data) => {
      // Simple progress logging
      if (data.message) {
        console.log(`📊 ${data.message}`);
      }

      // Capture progress for debug report
      progressHistory.push({
        timestamp: new Date().toISOString(),
        message: data.message || step,
        percentage: data.percentage || 0,
        elapsedMs: Date.now() - startTime,
        step: step,
        details: data.details || '',
      });
    }, metadata);

    console.log(
      `✅ Session loading complete! ${sessions.length} sessions loaded and saved to markdown files`
    );
    console.log(`📁 Sessions saved to output/sessions/[project]/session-*.md`);

    // Finalize and save metadata
    try {
      metadata.summary = {
        ...metadata.summary,
        sessionsLoaded: sessions.length,
        strugglingSessionsFound: sessions.filter(s => s.hasStruggle).length,
      };

      const finalMetadata = finalizeMetadata(metadata);

      // Save metadata JSON file
      const metadataPath = getTimestampedReportPath('session-loading-metadata').replace(
        '.md',
        '.json'
      );
      await writeFileContent(metadataPath, JSON.stringify(finalMetadata, null, 2));

      console.log(`📊 Session loading metadata saved to ${metadataPath}`);
    } catch (error) {
      console.warn('⚠️ Failed to save metadata:', error.message);
    }

    // Generate progress debug report
    const mockJob = {
      id: 'session-loading',
      progressHistory: progressHistory,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
    };
    ProgressDebugLogger.generateProgressReport(mockJob);
  } catch (error) {
    console.error('❌ An error occurred during session loading:', error);
    process.exit(1);
  }
}

main();
