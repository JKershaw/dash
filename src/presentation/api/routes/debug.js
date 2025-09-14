/**
 * @file Debug Routes for Session Analysis
 * Provides detailed breakdown of pattern detection and analysis for individual sessions
 */

import {
  detectSimpleLoops,
  detectAdvancedLoops,
  detectLongSessions,
  detectErrorPatterns,
  detectNoProgressSessions,
  detectStagnation,
  detectPlanEditingLoops,
  detectReadingSpirals,
  detectShotgunDebugging,
  detectRedundantSequences,
  detectContextSwitching,
  analyzeStruggleTrend,
} from '../../../domain/struggle-detector.js';
import { detectAiCollaborationEffectiveness } from '../../../domain/detectors/ai-collaboration-effectiveness-detector.js';
import { detectProblemSolvingSuccess } from '../../../domain/detectors/problem-solving-success-detector.js';
import { detectProductiveSessions } from '../../../domain/detectors/productive-session-detector.js';
import { detectBashErrorPatterns } from '../../../domain/detectors/bash-error-classifier.js';
import { classifyStruggle } from '../../../domain/problem-classifier.js';
import { generateRecommendations } from '../../../shared/utilities/report-generator.js';
import { getAnalysisData } from '../../../services/analysis-data.js';
import { intelligentTruncation } from '../../../services/analysis-tools.js';
import { findScriptFile } from '../../../infrastructure/file-management/paths.js';
import { promises as fs } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { isTest, getApiKey, getModel } from '../../../config.js';

/**
 * Setup debug API routes
 * @param {Express} app - Express application
 */
export function setupDebugRoutes(app) {
  /**
   * @swagger
   * /api/debug/session/{id}:
   *   get:
   *     summary: Debug session analysis
   *     description: Get detailed breakdown of how a session is analyzed by all pattern detectors
   *     tags:
   *       - Debug
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: string
   *         description: Session ID
   */
  app.get('/api/debug/session/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const startTime = Date.now();

      // Load session data using existing logic
      const data = await getAnalysisData();
      const session = data.sessions.find(s => s.sessionId === id);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `No session found with ID: ${id}`,
          sessionId: id,
        });
      }

      console.log(`🔍 Debug analysis for session ${id}: ${session.projectName}`);

      // Run all pattern detectors individually
      const patternResults = {
        simpleLoops: detectSimpleLoops(session),
        advancedLoops: detectAdvancedLoops(session),
        longSessions: detectLongSessions(session),
        errorPatterns: detectErrorPatterns(session),
        noProgressSessions: detectNoProgressSessions(session),
        stagnation: detectStagnation(session),
        planEditingLoops: detectPlanEditingLoops(session),
        readingSpirals: detectReadingSpirals(session),
        shotgunDebugging: detectShotgunDebugging(session),
        redundantSequences: detectRedundantSequences(session),
        contextSwitching: detectContextSwitching(session),
        aiCollaborationEffectiveness: detectAiCollaborationEffectiveness(session),
        problemSolvingSuccess: detectProblemSolvingSuccess(session),
        productiveSessions: detectProductiveSessions(session),
        bashErrorPatterns: detectBashErrorPatterns(session),
      };

      // Run struggle classification
      const struggleClassification = classifyStruggle(session);

      // Run struggle trend analysis
      const struggleTrend = analyzeStruggleTrend(session);

      // Generate recommendations for this single session
      const singleSessionRecommendations = generateRecommendations([session]);

      // Count detected patterns
      const patternSummary = {};
      let totalPatternsFound = 0;

      Object.entries(patternResults).forEach(([patternType, results]) => {
        const count = Array.isArray(results) ? results.length : (results ? 1 : 0);
        patternSummary[patternType] = {
          count,
          detected: count > 0,
          results: results,
        };
        if (count > 0) totalPatternsFound++;
      });

      // Basic session metrics
      const sessionMetrics = {
        sessionId: session.sessionId,
        projectName: session.projectName,
        duration: {
          total: session.durationSeconds,
          active: session.activeDurationSeconds,
          formatted: `${Math.floor(session.durationSeconds / 60)}:${(session.durationSeconds % 60).toString().padStart(2, '0')}`,
        },
        toolOperations: {
          total: session.toolOperations?.length || 0,
          successful: session.toolOperations?.filter(op => op.status === 'success')?.length || 0,
          errors: session.toolOperations?.filter(op => op.status === 'error')?.length || 0,
          tools: session.toolOperations ? [...new Set(session.toolOperations.map(op => op.name))] : [],
        },
        conversation: {
          totalEntries: session.entryCount,
          humanMessages: session.humanMessageCount,
          assistantMessages: session.assistantMessageCount,
        },
        struggle: {
          hasStruggle: session.hasStruggle,
          indicators: session.struggleIndicators || [],
        },
      };

      // Performance timing
      const processingTime = Date.now() - startTime;

      console.log(`✅ Debug analysis complete for ${id} - ${totalPatternsFound} pattern types found (${processingTime}ms)`);

      // Build base response object
      const responseData = {
        sessionId: id,
        metadata: {
          processingTime,
          timestamp: new Date().toISOString(),
          totalPatternsFound,
          analysisVersion: '1.0.0',
        },
        sessionMetrics,
        patternResults: patternSummary,
        struggleClassification: {
          results: struggleClassification,
          count: struggleClassification.length,
        },
        struggleTrend: struggleTrend ? {
          ...struggleTrend,
          analysisAvailable: true,
        } : {
          analysisAvailable: false,
          reason: 'Session too short for trend analysis (<100 tool operations)',
        },
        recommendations: {
          count: singleSessionRecommendations.length,
          results: singleSessionRecommendations,
        },
        rawData: {
          availableOnRequest: true,
          note: 'Add ?includeRaw=true to include full raw session data',
        },
      };

      // Include raw session data if requested
      if (req.query.includeRaw === 'true') {
        responseData.rawData = {
          session: session,
          toolOperations: session.toolOperations,
          conversation: session.conversation,
          availableOnRequest: true,
          note: 'Full raw session data included',
        };
      }

      res.json(responseData);

    } catch (error) {
      console.error('Error in debug session analysis:', error);
      res.status(500).json({
        error: 'Debug analysis failed',
        message: error.message,
        sessionId: req.params.id,
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * List available sessions for debugging
   */
  app.get('/api/debug/sessions', async (req, res) => {
    try {
      const data = await getAnalysisData();
      const sessions = data.sessions || [];

      // Return session list with debug-relevant info
      const debugSessions = sessions.map(session => ({
        sessionId: session.sessionId,
        projectName: session.projectName,
        duration: session.durationSeconds,
        toolCount: session.toolOperations?.length || 0,
        hasStruggle: session.hasStruggle,
        startTime: session.startTime,
        suitable: {
          forPatternDetection: (session.toolOperations?.length || 0) >= 5,
          forTrendAnalysis: (session.toolOperations?.length || 0) >= 100,
          forErrorAnalysis: session.toolOperations?.some(op => op.status === 'error') || false,
          forSuccessAnalysis: (session.toolOperations?.length || 0) >= 10 && !session.hasStruggle,
        },
      }));

      // Sort by most interesting for debugging (has tools, longer duration)
      debugSessions.sort((a, b) => {
        const scoreA = (a.toolCount * 0.5) + (a.duration * 0.1) + (a.hasStruggle ? 100 : 0);
        const scoreB = (b.toolCount * 0.5) + (b.duration * 0.1) + (b.hasStruggle ? 100 : 0);
        return scoreB - scoreA;
      });

      res.json({
        sessions: debugSessions,
        metadata: {
          total: debugSessions.length,
          withToolOperations: debugSessions.filter(s => s.toolCount >= 5).length,
          suitableForTrends: debugSessions.filter(s => s.suitable.forTrendAnalysis).length,
          withErrors: debugSessions.filter(s => s.suitable.forErrorAnalysis).length,
          withStruggle: debugSessions.filter(s => s.hasStruggle).length,
        },
      });
    } catch (error) {
      console.error('Error loading debug sessions list:', error);
      res.status(500).json({
        error: 'Failed to load sessions for debugging',
        message: error.message,
      });
    }
  });

  /**
   * AI review of pattern detection results
   */
  app.post('/api/debug/session/:id/ai-review', async (req, res) => {
    try {
      const { id } = req.params;
      const startTime = Date.now();

      // Load session data
      const data = await getAnalysisData();
      const session = data.sessions.find(s => s.sessionId === id);

      if (!session) {
        return res.status(404).json({
          error: 'Session not found',
          message: `No session found with ID: ${id}`,
        });
      }

      console.log(`🤖 AI reviewing pattern detection for session ${id}`);

      // Get current pattern detection results
      const patternResults = {
        simpleLoops: detectSimpleLoops(session),
        advancedLoops: detectAdvancedLoops(session),
        longSessions: detectLongSessions(session),
        errorPatterns: detectErrorPatterns(session),
        noProgressSessions: detectNoProgressSessions(session),
        stagnation: detectStagnation(session),
        planEditingLoops: detectPlanEditingLoops(session),
        readingSpirals: detectReadingSpirals(session),
        shotgunDebugging: detectShotgunDebugging(session),
        redundantSequences: detectRedundantSequences(session),
        contextSwitching: detectContextSwitching(session),
        aiCollaborationEffectiveness: detectAiCollaborationEffectiveness(session),
        problemSolvingSuccess: detectProblemSolvingSuccess(session),
        productiveSessions: detectProductiveSessions(session),
        bashErrorPatterns: detectBashErrorPatterns(session),
      };

      // Get struggle classification
      const struggleClassification = classifyStruggle(session);

      // Create AI-optimized conversation summary using session script format
      let conversationScript = 'No conversation data available';
      
      try {
        // Direct file access instead of fetch - more efficient
        const scriptPath = await findScriptFile(session.sessionId);
        
        if (scriptPath) {
          const scriptData = await fs.readFile(scriptPath, 'utf-8');
          
          // SCRIPT SIZE DEBUGGING - Before processing
          const originalScriptSize = scriptData.length;
          const originalScriptLines = scriptData.split('\n').length;
          const originalEstimatedTokens = Math.ceil(originalScriptSize / 4);
          
          console.log('\n📄 SCRIPT PROCESSING DEBUG:');
          console.log('─'.repeat(50));
          console.log(`📥 ORIGINAL script file: ${originalScriptLines.toLocaleString()} lines, ${originalScriptSize.toLocaleString()} chars (~${originalEstimatedTokens.toLocaleString()} tokens)`);
          
          // For debug analysis, use higher line limit to preserve more content
          // Debug analysis specifically needs to see longer patterns
          const debugMaxLines = 6000; // Allow ~6000 lines (~90k tokens) for debug analysis
          const { content: truncatedScript, truncated, summary } = intelligentTruncation(scriptData, debugMaxLines);
          
          // Log truncation results
          const truncatedScriptSize = truncatedScript.length;
          const truncatedScriptLines = truncatedScript.split('\n').length;
          const truncatedEstimatedTokens = Math.ceil(truncatedScriptSize / 4);
          
          console.log(`✂️  AFTER truncation: ${truncatedScriptLines.toLocaleString()} lines, ${truncatedScriptSize.toLocaleString()} chars (~${truncatedEstimatedTokens.toLocaleString()} tokens)`);
          console.log(`   Truncated: ${truncated ? 'YES' : 'NO'}`);
          if (truncated) {
            console.log(`   Summary: ${summary}`);
            console.log(`   Reduction: ${Math.round((1 - truncatedScriptSize / originalScriptSize) * 100)}% size reduction`);
          }
          
          // Extract just the essential conversation flow from the script
          conversationScript = truncatedScript
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/^#.*$/gm, '') // Remove markdown headers  
            .replace(/^\*\*.*\*\*$/gm, '') // Remove metadata lines
            .replace(/^---$/gm, '') // Remove separators
            .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
            .replace(/🎯 Session Insights & Struggle Patterns[\s\S]*$/, '') // Remove generated insights
            .trim();
          
          // Add truncation notice if content was truncated
          if (truncated) {
            conversationScript += `\n\n[Debug Analysis Note: Content intelligently truncated to fit context limits. ${summary}]`;
          }
          
          // Final processed script size
          const finalScriptSize = conversationScript.length;
          const finalScriptLines = conversationScript.split('\n').length;
          const finalEstimatedTokens = Math.ceil(finalScriptSize / 4);
          
          console.log(`🎯 FINAL processed script: ${finalScriptLines.toLocaleString()} lines, ${finalScriptSize.toLocaleString()} chars (~${finalEstimatedTokens.toLocaleString()} tokens)`);
          console.log(`   Total processing reduction: ${Math.round((1 - finalScriptSize / originalScriptSize) * 100)}%`);
          console.log('─'.repeat(50));
            
        } else {
          throw new Error('Script file not found');
        }
      } catch (_scriptError) {
        console.log('Using fallback conversation extraction...');
        
        // Fallback: Create ultra-condensed conversation flow
        conversationScript = session.conversation
          ?.map((msg, index) => {
            if (msg.type === 'user') {
              // Keep user messages but truncate if very long
              const content = msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content;
              return `[${index}] USER: ${content}`;
            }
            
            if (msg.type === 'assistant') {
              // For assistant: extract just the key intent, not the implementation
              const content = msg.content;
              
              // Extract tool usage summary
              const toolMatches = content.match(/🔧.*?(?=🔧|$)/gs) || [];
              const toolSummary = toolMatches.map(match => {
                const toolName = match.match(/\*\*Tool Use: ([^*]+)\*\*/)?.[1] || 'Unknown';
                const success = match.includes('✅') ? '✅' : match.includes('❌') ? '❌' : '?';
                return `${toolName} ${success}`;
              }).join(', ');
              
              // Extract non-tool response (the actual message)
              const messageContent = content
                .replace(/🔧[\s\S]*?(?=🔧|$)/g, '') // Remove tool blocks
                .replace(/```[\s\S]*?```/g, '[code]') // Replace code with placeholder
                .replace(/\n{2,}/g, ' ') // Collapse newlines
                .trim();
                
              const truncatedMessage = messageContent.length > 200 ? messageContent.substring(0, 200) + '...' : messageContent;
              const toolPart = toolSummary ? ` [Tools: ${toolSummary}]` : '';
              
              return `[${index}] CLAUDE: ${truncatedMessage}${toolPart}`;
            }
            
            return `[${index}] ${msg.type?.toUpperCase()}: ${msg.content?.substring(0, 100)}...`;
          })
          ?.join('\n') || 'No conversation data available';
      }

      // Count detected patterns
      const detectedPatternsSummary = Object.entries(patternResults)
        .map(([type, results]) => {
          const count = Array.isArray(results) ? results.length : (results ? 1 : 0);
          return `${type}: ${count > 0 ? `${count} detected` : 'none detected'}`;
        })
        .join('\n');

      // Create comprehensive session analysis prompt with data accuracy focus
      const reviewPrompt = `## PRIMARY MISSION: DATA ACCURACY VALIDATION
You are a ground truth validator for an AI struggle detection system. Your job: Compare our algorithmic interpretations against the actual conversation reality.

**Core Question:** How accurately do our detected patterns represent what actually happened in this session?

## CONTEXT: CLAUDE CODE SESSIONS
You are analyzing interactions between a human developer and Claude Code (an AI coding assistant). Understanding this dynamic is crucial:

**Key Dynamics:**
- **Human**: Makes requests, provides feedback, guides direction
- **Claude Code**: Executes tools (Read, Edit, Bash, etc.) to fulfill requests
- **Collaboration Pattern**: Human guides strategy, Claude implements tactics
- **Learning Context**: Human may be exploring unfamiliar codebases or concepts
- **Tool Limitations**: Some "struggle" may reflect Claude's constraints, not human inefficiency

**Reframe Your Analysis:**
- "Is this pattern Claude being methodical or genuinely stuck?"
- "Does this represent effective human guidance of AI capabilities?"
- "Is this exploration phase necessary for human understanding?"
- "Are tool sequences reflecting complex request decomposition?"
- "Is this human-AI collaborative workflow actually efficient?"

## SESSION DATA
**Project:** ${session.projectName} | **Duration:** ${Math.floor(session.durationSeconds / 60)}min | **Messages:** ${session.conversation?.length || 0} | **Tools:** ${session.toolOperations?.length || 0}

## DETECTOR IMPLEMENTATION CONTEXT
**Available Struggle Pattern Detectors & Their Current Logic:**
- **redundantSequences**: Only detects Read→Edit→Read same file + Bash→Bash same command patterns
- **stagnation**: Flags operations with identical inputs/outputs using pattern recognition
- **simpleLoops**: Counts tool repetition above thresholds (e.g., 3+ same tool in sequence)  
- **advancedLoops**: Detects complex circular patterns and systematic loops
- **longSessions**: Flags sessions over duration thresholds
- **errorPatterns**: Tracks error frequencies and failure chains
- **shotgunDebugging**: Detects rapid tool switching patterns
- **readingSpirals**: Identifies excessive reading without action
- **contextSwitching**: Flags rapid file/context switches
- **bashErrorPatterns**: Enhanced bash error classification and pattern analysis

**Available Success Pattern Detectors & Their Current Logic:**
- **aiCollaborationEffectiveness**: Identifies when AI suggestions work well and collaboration is effective
- **problemSolvingSuccess**: Detects efficient resolution of complex issues on first/second attempt
- **productiveSessions**: Highlights highly productive sessions with systematic work and clean implementations

**Current Pattern Detection Results:**
${detectedPatternsSummary}

**ACTUAL DETECTED PATTERNS DATA:**
${Object.entries(patternResults)
  .filter(([_, results]) => Array.isArray(results) ? results.length > 0 : results)
  .map(([type, results]) => {
    const count = Array.isArray(results) ? results.length : (results ? 1 : 0);
    
    // Ultra-compact representation - just the essentials for analysis
    let essence = 'none';
    if (Array.isArray(results) && results.length > 0) {
      const firstResult = results[0];
      // Only show critical identifiers, not full data
      const indices = firstResult.toolIndices || firstResult.messageIndices || firstResult.indices;
      const indexRange = indices ? `ops[${Math.min(...indices)}-${Math.max(...indices)}]` : '';
      const key = firstResult.type || firstResult.pattern || firstResult.filePattern || 'pattern';
      essence = `${key} ${indexRange}`;
    } else if (results && typeof results === 'object') {
      essence = results.trend || results.classification || results.summary || 'detected';
    }
    
    return `• ${type}: ${count}x (${essence})`;
  }).join('\\n')}

**TOOL OPERATIONS WITH INDICES (for reference):**
${session.toolOperations?.map((op, index) => {
  // Compact format: [index] Tool(file/cmd) → status
  const file = op.input?.file_path ? op.input.file_path.split('/').pop() : '';
  const cmd = op.input?.command ? `"${op.input.command.substring(0, 20)}..."` : '';
  const bash_id = op.input?.bash_id ? `bash_${op.input.bash_id}` : '';
  const context = file || cmd || bash_id || '';
  const statusIcon = op.status === 'success' ? '✓' : op.status === 'error' ? '✗' : '?';
  
  return `[${index}] ${op.name}${context ? `(${context})` : ''} ${statusIcon}`;
}).join('\\n') || 'No tool operations found'}

**Struggle Classification:** ${struggleClassification.length} types detected

## CONVERSATION FLOW
${conversationScript}

## DATA ACCURACY VALIDATION
Compare our algorithmic analysis against conversation reality:

**Pattern Reality Check:**
- Which detected patterns accurately reflect genuine struggle or inefficiency?
- Which patterns are algorithmic false positives (flagging productive behavior)?
- What genuine struggle patterns did we completely miss?

**Conversation Context Analysis:**
- Does the conversation show frustration, confusion, or satisfaction?
- Are repeated actions indicating struggle or methodical progress?  
- Does the user's language suggest problems or productive collaboration?

**Behavioral Evidence Validation:**
- Do our "struggle" classifications match the actual user experience?
- Are we correctly distinguishing exploration from confusion?
- Are we missing positive collaboration patterns that should be celebrated?

## IMPLEMENTATION-READY FEEDBACK
When you identify specific detector issues with the data provided, use these formats:

**For FALSE POSITIVES (when you have concrete evidence):**
=== FALSE POSITIVE: [DetectorName] ===  
**Exact Detector**: [Specific function name from the available detectors list above]
**Detection Evidence**: [Reference the actual pattern data shown above - quote the exact detected pattern]
**Failing Operations**: [Specific toolOperations indices AND script line numbers, e.g., "Operations 28-30 (Script lines 520-540): Read→Edit→Read dashboard.js"]
**Script Evidence**: [Quote the exact script content showing this is productive, e.g., "Line 525: 'Edit dashboard.js successfully', Line 530: 'Reading file to verify changes'"]
**Current Logic Problem**: [Based on detector description above, what logic is incorrectly triggering?]
**Expected Result**: 0 patterns (reason: [why this should not be flagged based on detector's actual purpose and script evidence])
**Root Cause**: [Specific detector limitation with script evidence - e.g., "redundantSequences detector flags Read→Edit→Read pattern at lines 520-540, but script shows this is file modification verification workflow"]
**LLM-TDD Fix**: [Exact function enhancement needed with script context - e.g., "Add file modification verification check to redundantSequences detector - allow Read after Edit when Edit shows 'successfully updated'"]
**Test Data**: [Exact toolOperations array from the failing sequence with script line context]

**For MISSING PATTERNS (when you can trace specific undetected issues):**
=== MISSING PATTERN: [PatternName] ===
**Missing Detector**: [Which detector should catch this but doesn't, or new detector needed]
**Evidence**: [Exact message/operation indices AND script line numbers showing the undetected pattern, e.g., "Messages 72-76 (Script lines 800-850): Repeated Edit failures"]
**Script Evidence**: [Quote actual script lines showing the pattern, e.g., "Line 810: 'Edit failed - String not found', Line 825: 'Edit failed - String not found', Line 840: 'Edit failed - String not found'"]
**Should Be Detected By**: [Which specific detector from the list above should catch this]
**Detection Logic Gap**: [What's missing in the current detector algorithm based on script evidence]
**Test Cases**: [Exact input data that should trigger detection, based on script content]

**For INSIGHTS WITHOUT SPECIFIC FIXES:**
=== INSIGHT: [InsightName] ===
**Observation**: [What you noticed that's important]
**Impact**: [Why this matters for developer productivity/experience]
**Research Direction**: [What we should investigate further or consider in future detector design]
**Evidence**: [Script lines or patterns supporting this insight]

## UNIVERSALITY REQUIREMENTS
When suggesting detector improvements or new patterns, ensure they apply broadly:

**Universal Patterns (Suggest These):**
- Skill level agnostic: Works for beginners and experts
- Methodology independent: Not tied to specific development approaches  
- Collaboration universal: Reflects fundamental human-AI interaction patterns
- Domain agnostic: Applies across different project types

**Avoid Session-Specific Patterns:**
- Advanced methodologies (TDD, systematic refactoring)
- Project-specific workflows (testing frameworks, build processes)
- Expert-only techniques or sophisticated development practices
- Patterns unique to this particular task or domain

**Pattern Generalization Examples:**
- Instead of "LLM-TDD workflow" → suggest "adaptive tool switching"
- Instead of "advanced error recovery" → suggest "strategy diversification after failures"
- Instead of "systematic refactoring" → suggest "iterative improvement patterns"

## GROUND TRUTH VALIDATION FOCUS
Your primary job is validating our data accuracy against conversation reality. Secondary job is suggesting universally applicable improvements to make our system more accurate across all Claude Code users.

**SCRIPT REFERENCE REQUIREMENTS:**
- Always cite specific script line numbers (e.g., "Line 325:" or "Lines 400-450:")
- Quote actual script content to support your analysis
- Reference the TOOL OPERATIONS WITH INDICES above to map operations to script locations
- Cross-reference detected pattern indices with actual tool operations
- Use script timestamps to understand tool operation sequences
- Identify productive vs problematic patterns using actual script evidence
- When citing operations like "Operations 28-30", also reference the tool operations list above to see the exact tools and files involved

Keep response focused on pattern detection accuracy. Cite specific script line examples. Prioritize highest-impact improvements with implementation details backed by actual script content.`;

      // CONTEXT DEBUG LOGGING - Show sizes of all context components
      console.log('\n🔍 DEBUG AI REVIEW CONTEXT ANALYSIS:');
      console.log('═'.repeat(80));
      
      // Calculate component sizes
      const conversationScriptSize = conversationScript.length;
      const detectedPatternsSize = JSON.stringify(patternResults).length;
      const toolOperationsSize = JSON.stringify(session.toolOperations || []).length;
      const reviewPromptSize = reviewPrompt.length;
      
      // Token estimations (rough: ~4 chars per token)
      const estimatedScriptTokens = Math.ceil(conversationScriptSize / 4);
      const estimatedPatternsTokens = Math.ceil(detectedPatternsSize / 4);
      const estimatedToolsTokens = Math.ceil(toolOperationsSize / 4);
      const estimatedTotalTokens = Math.ceil(reviewPromptSize / 4);
      
      console.log('📊 CONTEXT SIZE BREAKDOWN:');
      console.log(`   Conversation script: ${conversationScriptSize.toLocaleString()} chars (~${estimatedScriptTokens.toLocaleString()} tokens)`);
      console.log(`   Pattern detection data: ${detectedPatternsSize.toLocaleString()} chars (~${estimatedPatternsTokens.toLocaleString()} tokens)`);
      console.log(`   Tool operations (all): ${toolOperationsSize.toLocaleString()} chars (~${estimatedToolsTokens.toLocaleString()} tokens)`);
      console.log(`   Total prompt size: ${reviewPromptSize.toLocaleString()} chars (~${estimatedTotalTokens.toLocaleString()} tokens)`);
      
      // Model limits
      const currentModel = getModel();
      console.log('🤖 MODEL & LIMITS:');
      console.log(`   Model: ${currentModel}`);
      console.log(`   Context window limit: ${currentModel.includes('4') ? '200K' : currentModel.includes('3.5') ? '128K' : '100K'} tokens`);
      console.log(`   Output limit: 8K tokens`);
      
      // Check if we're close to limits
      const contextLimit = currentModel.includes('4') ? 200000 : currentModel.includes('3.5') ? 128000 : 100000;
      const usagePercent = Math.round((estimatedTotalTokens / contextLimit) * 100);
      console.log(`   Context usage: ${usagePercent}% of limit`);
      
      if (usagePercent > 80) {
        console.log('   ⚠️  WARNING: High context usage, may hit limits!');
      } else if (usagePercent > 95) {
        console.log('   🚨 CRITICAL: Very close to context limit!');
      } else {
        console.log('   ✅ Context usage within safe limits');
      }
      
      console.log('═'.repeat(80));
      console.log('');

      // Call LLM for review (simple call)
      let aiReview = 'AI review not available (API key not configured)';
      
      if (!isTest() && getApiKey()) {
        try {
          const client = new Anthropic({ apiKey: getApiKey() });
          const response = await client.messages.create({
            model: getModel(),
            max_tokens: 8000, // Increased for comprehensive analysis
            messages: [{ role: 'user', content: reviewPrompt }],
          });
          aiReview = response.content[0]?.text || 'No review generated';
          
          // Log token usage to server console
          console.log(`🔢 Token usage for session ${id}:`);
          console.log(`   Input tokens: ${response.usage?.input_tokens || 'N/A'}`);
          console.log(`   Output tokens: ${response.usage?.output_tokens || 'N/A'}`);
          console.log(`   Total tokens: ${(response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)}`);
          console.log(`   Model: ${getModel()}`);
          
        } catch (llmError) {
          console.warn('LLM call failed:', llmError.message);
          aiReview = `AI review failed: ${llmError.message}`;
        }
      }

      const processingTime = Date.now() - startTime;
      
      console.log(`✅ AI review completed for ${id} (${processingTime}ms)`);

      res.json({
        sessionId: id,
        reviewAvailable: true,
        review: aiReview,
        metadata: {
          processingTime,
          timestamp: new Date().toISOString(),
          conversationLength: session.conversation?.length || 0,
          fullConversationAnalyzed: true,
          patternsAnalyzed: Object.keys(patternResults).length,
          maxTokensUsed: 8000,
          analysisDepth: 'comprehensive',
        },
      });

    } catch (error) {
      console.error('Error in AI pattern review:', error);
      
      // If LLM fails, return a helpful error
      if (error.message?.includes('API key') || error.message?.includes('quota')) {
        return res.json({
          sessionId: req.params.id,
          reviewAvailable: false,
          error: 'LLM service not available (API key or quota issue)',
          fallbackMessage: 'Manual review recommended: Check conversation for obvious loops, long pauses, or repeated failed operations.',
          metadata: {
            timestamp: new Date().toISOString(),
          },
        });
      }

      res.status(500).json({
        error: 'AI review failed',
        message: error.message,
        sessionId: req.params.id,
      });
    }
  });
}