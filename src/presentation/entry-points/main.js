import 'dotenv/config';
import { processClaudeLogs } from '../../analysis/analyze.js';
import { ProgressDebugLogger } from '../../infrastructure/progress-debug-logger.js';

/**
 * @file Main entry point for the AI Self-Improvement System.
 * Uses simplified functional approach for better maintainability.
 */

/**
 * Parse command line arguments for project filtering and other options
 */
function parseCliArguments() {
  const args = process.argv.slice(2);
  const options = {
    includeEnhanced: true,
    generateReports: true,
    filters: {}
  };

  // Parse --project=<value> argument
  const projectArg = args.find(arg => arg.startsWith('--project='));
  if (projectArg) {
    const projectValue = projectArg.split('=')[1];
    if (projectValue && projectValue.trim()) {
      options.filters.project = projectValue.trim();
      console.log(`🎯 Project filter: "${options.filters.project}"`);
    }
  }

  // Parse --no-enhanced argument
  if (args.includes('--no-enhanced')) {
    options.includeEnhanced = false;
    console.log('⚡ Enhanced analysis disabled');
  }

  // Parse --no-reports argument
  if (args.includes('--no-reports')) {
    options.generateReports = false;
    console.log('📊 Report generation disabled');
  }

  // Clean up filters if empty
  if (Object.keys(options.filters).length === 0) {
    delete options.filters;
  }

  return options;
}

/**
 * The main function for the AI Self-Improvement System.
 * Direct functional approach - no class abstractions.
 */
async function main() {
  try {
    console.log('🚀 Starting Claude logs analysis...');

    // Parse CLI arguments
    const options = parseCliArguments();

    // Track progress history for debug report
    const progressHistory = [];
    const startTime = Date.now();

    const results = await processClaudeLogs(
      options,
      (step, data) => {
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
      }
    );

    console.log(
      `✅ Analysis complete! ${results.sessions.length} sessions, ${results.recommendations.length} recommendations`
    );

    // Generate progress debug report
    const mockJob = {
      id: 'cli-analysis',
      progressHistory: progressHistory,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
    };
    ProgressDebugLogger.generateProgressReport(mockJob);
  } catch (error) {
    console.error('❌ An error occurred during log analysis:', error);
    process.exit(1);
  }
}

main();
