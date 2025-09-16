/**
 * @file Simplified LLM Service - Direct implementation without abstraction layers
 * Replaces the entire complex LLM infrastructure with 3 simple functions
 */

import Anthropic from '@anthropic-ai/sdk';
import { analysisTools, handleToolCall } from './analysis-tools.js';
import { isTest, getApiKey, getModel } from '../config.js';
import { trackLLMCall } from './metadata-collector.js';
import { loadBasicSessionData } from './analysis-data.js';
import { reportSubPhase } from './progress/progress-calculator.js';
import { getSubPhase } from './progress/progress-config.js';

// Import extracted modules
import { getModelMaxTokens } from './llm/model-config.js';
import { calculateStats, parseUserFriendlyMessage } from './llm/utilities.js';
import {
  buildAnalysisPrompt,
  buildExecutiveSummaryPrompt,
  buildNarrativeSummaryPrompt,
  buildSelfReflectionPrompt,
} from './llm/prompt-builder.js';
import { processAnalysisResponse } from './llm/response-processor.js';
import {
  generateSyntheticEnhancedAnalysis,
  createFallbackExecutiveSummary,
  createFallbackNarrativeSummary,
} from './llm/fallback-content.js';

/**
 * Core agentic LLM function with tool calling
 * @param {string} prompt - The prompt to send
 * @param {Array} sessions - Session data for tools (null = tools load on-demand)
 * @param {boolean} useTools - Whether to enable tool calling
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<Object>} LLM response with tool results
 */
async function callAnthropicWithTools(prompt, sessions, useTools = true, progressCallback = null) {
  // Check if API is available
  if (isTest() || !getApiKey()) {
    console.log('📝 API unavailable, using fallback content');
    return null; // Let caller handle fallback
  }

  const client = new Anthropic({ apiKey: getApiKey() });

  // Build messages array
  const messages = [{ role: 'user', content: prompt }];

  // Configure request
  const currentModel = getModel();
  const config = {
    model: currentModel,
    max_tokens: getModelMaxTokens(currentModel, useTools),
    messages,
    ...(useTools && {
      tools: analysisTools,
      tool_choice: {
        type: 'auto',
        disable_parallel_tool_use: false, // Explicitly enable parallel tool calling
      },
    }),
  };

  // Make initial request
  let response = useTools
    ? await client.messages.stream(config).finalMessage()
    : await client.messages.create(config);

  // Handle tool calling loop
  let toolRounds = 0;
  // Get max rounds from config instead of hardcoding
  const toolConfig = getSubPhase('analysis', 'enhancedAnalysis', 'agenticRounds');
  const maxToolRounds = toolConfig?.maxRounds || 25; // Fallback to 25 if config unavailable
  let totalToolCalls = 0;

  while (
    useTools &&
    response.content.some(c => c.type === 'tool_use') &&
    toolRounds < maxToolRounds
  ) {
    toolRounds++;
    const toolCalls = response.content.filter(c => c.type === 'tool_use');
    totalToolCalls += toolCalls.length;

    console.log(`🔍 Round ${toolRounds}: Processing ${toolCalls.length} tool call(s)...`);

    // Report tool round progress using declarative config
    if (progressCallback) {
      const roundProgress = reportSubPhase('analysis', 'enhancedAnalysis', 'agenticRounds', {
        currentStep: toolRounds,
        totalSteps: toolConfig?.estimatedSteps || 6,
        message: `Round ${toolRounds}: Using ${toolCalls.length} tool(s)...`,
        toolActivity: { toolName: toolCalls[0]?.name, round: toolRounds }
      });
      
      progressCallback('llm:round', {
        round: toolRounds,
        toolCount: toolCalls.length,
        message: roundProgress.message,
        percentage: roundProgress.percentage,
        toolActivity: roundProgress.toolActivity
      });
    }

    // Process tools with individual progress
    const sessionData = sessions || (await loadBasicSessionData());

    for (const toolCall of toolCalls) {
      if (progressCallback) {
        progressCallback('tool:start', {
          toolName: toolCall.name,
          message: `Using ${toolCall.name}...`,
        });
      }
    }

    const toolResults = await processToolCalls(response, sessionData.sessions || sessionData);

    // Continue conversation
    messages.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults }  // All tool results in single message
    );

    const nextConfig = { ...config, messages };
    response = await client.messages.stream(nextConfig).finalMessage();
  }

  // Report synthesis phase
  if (progressCallback && toolRounds > 0) {
    progressCallback('enhancedAnalysis:synthesis', { message: 'Synthesizing insights...' });
  }

  return { response, toolRounds, totalToolCalls, messages, client: client, model: currentModel };
}

/**
 * Internal wrapper for analysis calls that filters out granular progress events
 * Prevents tool-level progress from contaminating main analysis progress system
 * @param {string} prompt - The prompt to send
 * @param {Array} sessions - Session data for tools
 * @param {boolean} useTools - Whether to enable tool calling
 * @param {Function} progressCallback - Progress callback (will be filtered)
 * @returns {Promise<Object>} LLM response with tool results
 */
async function callAnthropicForAnalysis(prompt, sessions, useTools, progressCallback) {
  // Create filtered callback that converts tool events to tool activity
  const filteredCallback = progressCallback
    ? (step, data) => {
        // Pass through main analysis events normally
        if (step.startsWith('enhancedAnalysis:')) {
          progressCallback(step, data);
        }
        // Convert tool and LLM events to tool activity (preserves info without affecting progress bar)
        else if (step.startsWith('tool:') || step.startsWith('llm:')) {
          progressCallback('enhancedAnalysis:toolActivity', {
            toolActivity: {
              originalStep: step,
              ...data,
            },
          });
        }
        // Silently ignore other events
      }
    : null;

  return callAnthropicWithTools(prompt, sessions, useTools, filteredCallback);
}

/**
 * Generate enhanced analysis using Claude Code (agentic approach)
 * @param {Object} sessionAnalysis - Session analysis data with sessions and recommendations
 * @param {boolean} deepDive - Enable deep-dive analysis (auto-determined if undefined)
 * @param {Function} progressCallback - Optional progress callback
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {Promise<Object>} Enhanced analysis result with success flag and error details
 */
export async function generateEnhancedAnalysis(
  sessionAnalysis,
  deepDive,
  progressCallback = null,
  metadata = null
) {
  // Check if API is available (simple API key check)
  if (isTest() || !getApiKey()) {
    console.log('📝 API unavailable, using fallback content');
    return await generateSyntheticEnhancedAnalysis(sessionAnalysis);
  }

  // Emit progress
  if (progressCallback) {
    const initProgress = reportSubPhase('analysis', 'enhancedAnalysis', 'initialization', {
      status: 'in_progress',
      message: 'Starting enhanced AI analysis',
      currentStep: 1,
      totalSteps: 1
    });
    
    progressCallback('enhancedAnalysis:start', {
      message: initProgress.message,
      percentage: initProgress.percentage,
    });
  }

  const sessions = sessionAnalysis?.sessions || sessionAnalysis?.sessionAnalyses || [];
  const recommendations =
    sessionAnalysis?.recommendations || sessionAnalysis?.crossProjectPatterns || [];

  // Always enable deep dive mode unless explicitly disabled
  const shouldDeepDive = deepDive !== false;
  
  // Get agentic config for progress calculation
  const agenticConfig = getSubPhase('analysis', 'enhancedAnalysis', 'agenticRounds');

  const startTime = Date.now();
  try {
    if (progressCallback) {
      const deepDiveProgress = reportSubPhase('analysis', 'enhancedAnalysis', 'agenticRounds', {
        status: 'in_progress',
        message: shouldDeepDive
          ? 'Starting deep dive analysis with tools'
          : 'Starting standard analysis',
        currentStep: 1,
        totalSteps: agenticConfig?.estimatedSteps || 6
      });
      
      progressCallback('enhancedAnalysis:progress', {
        message: deepDiveProgress.message,
        percentage: deepDiveProgress.percentage,
      });
    }

    console.log(`🤖 Starting ${shouldDeepDive ? 'tool-enabled' : 'standard'} analysis...`);

    // Build analysis prompt
    const analysisPrompt = buildAnalysisPrompt(sessions, recommendations, shouldDeepDive);

    // Use filtered wrapper function to prevent tool progress from contaminating analysis UI
    const coreResult = await callAnthropicForAnalysis(
      analysisPrompt,
      sessions,
      shouldDeepDive,
      progressCallback
    );
    if (!coreResult) {
      // Fallback if core function failed
      return await generateSyntheticEnhancedAnalysis(sessionAnalysis);
    }

    const { response, toolRounds, totalToolCalls, messages, client, model } = coreResult;

    // Log completion results
    if (shouldDeepDive && toolRounds > 0) {
      console.log(
        `🧠 Deep dive investigation complete after ${toolRounds} rounds with ${totalToolCalls} total tool calls`
      );

      const textContent = response.content.filter(c => c.type === 'text');
      if (textContent.length > 0) {
        const totalLength = textContent.reduce((sum, c) => sum + c.text.length, 0);
        console.log(
          `🧠 Analysis complete: Generated ${totalLength} characters of comprehensive analysis`
        );
      }
    }

    const duration = Date.now() - startTime;
    console.log('✅ Enhanced analysis completed successfully');

    // Track metadata
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'enhanced-analysis',
        strategy: shouldDeepDive ? 'api-with-tools' : 'api-simple',
        provider: 'anthropic-api',
        model: getModel(),
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        toolCalls: Math.max(
          totalToolCalls,
          response.content.filter(c => c.type === 'tool_use').length
        ),
        deepDive: shouldDeepDive,
        duration,
        success: true,
      });
    }

    // Generate investigation reflection if agentic analysis occurred
    if (shouldDeepDive && toolRounds > 0) {
      // Agentic analysis occurred - investigation reflection is MANDATORY
      const investigationSummary = await generateInvestigationReflection(
        client, messages, toolRounds, totalToolCalls, model, metadata
      );
      
      // Store investigation summary in metadata for summary generation
      if (metadata && investigationSummary) {
        metadata.investigationSummary = investigationSummary;
      }
    }

    // Self-reflection debug mode (if enabled)
    if (process.env.DEBUG_SELF_REFLECTION === 'true' && shouldDeepDive && toolRounds > 0) {
      await _runSelfReflection(client, messages, toolRounds, totalToolCalls, sessions, model);
    }

    if (progressCallback) {
      const synthesisProgress = reportSubPhase('analysis', 'enhancedAnalysis', 'synthesis', {
        status: 'complete',
        message: 'Analysis complete',
        currentStep: 1,
        totalSteps: 1
      });
      
      progressCallback('enhancedAnalysis:complete', {
        message: synthesisProgress.message,
        percentage: synthesisProgress.percentage,
      });
    }

    return processAnalysisResponse(response, sessions, recommendations);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.warn('⚠️ Enhanced analysis failed:', error.message);

    // Track failed attempt
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'enhanced-analysis',
        strategy: shouldDeepDive ? 'api-with-tools' : 'api-simple',
        provider: 'anthropic-api',
        model: getModel(),
        duration,
        success: false,
        error: error.message,
      });
    }

    // Simple retry with exponential backoff (only 1 retry)
    if (error.message?.includes('rate_limit') || error.message?.includes('timeout')) {
      console.log('🔄 Retrying after rate limit/timeout...');
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

      try {
        // Create client for retry
        const retryClient = new Anthropic({ apiKey: getApiKey() });

        // Reconstruct config for retry (using initial messages only)
        const retryModel = getModel();
        const retryConfig = {
          model: retryModel,
          max_tokens: getModelMaxTokens(retryModel, shouldDeepDive),
          messages: [
            {
              role: 'user',
              content: buildAnalysisPrompt(sessions, recommendations, shouldDeepDive),
            },
          ],
          ...(shouldDeepDive && {
            tools: analysisTools,
            tool_choice: {
              type: 'auto',
              disable_parallel_tool_use: false, // Explicitly enable parallel tool calling in retry
            },
          }),
        };

        // Use streaming for retry if it's a deep dive analysis
        let retryResponse;
        if (shouldDeepDive) {
          const retryStream = retryClient.messages.stream(retryConfig);
          retryResponse = await retryStream.finalMessage();
        } else {
          retryResponse = await retryClient.messages.create(retryConfig);
        }
        const retryDuration = Date.now() - startTime;

        if (metadata) {
          trackLLMCall(metadata, {
            type: 'enhanced-analysis',
            strategy: shouldDeepDive ? 'api-with-tools' : 'api-simple',
            provider: 'anthropic-api',
            model: getModel(),
            inputTokens: retryResponse.usage?.input_tokens,
            outputTokens: retryResponse.usage?.output_tokens,
            totalTokens:
              (retryResponse.usage?.input_tokens || 0) + (retryResponse.usage?.output_tokens || 0),
            duration: retryDuration,
            success: true,
            retry: true,
          });
        }

        return processAnalysisResponse(retryResponse, sessions, recommendations);
      } catch {
        console.log('❌ Retry also failed, using fallback');
        // Fall through to fallback
      }
    }

    console.log('❌ Using fallback analysis');
    const fallback = await generateSyntheticEnhancedAnalysis(sessionAnalysis);
    return {
      content: fallback,
      error: {
        type: 'llm_error',
        message: parseUserFriendlyMessage(error, 'Enhanced AI analysis'),
        details: error.message,
      },
    };
  }
}

/**
 * Generate investigation reflection after agentic analysis
 * @param {Object} client - Anthropic client
 * @param {Array} messages - Conversation history with tool usage
 * @param {number} toolRounds - Number of tool calling rounds completed
 * @param {number} totalToolCalls - Total number of tool calls made
 * @param {string} model - Model being used
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {Promise<string|null>} Investigation reflection text or null if failed
 */
async function generateInvestigationReflection(client, messages, toolRounds, totalToolCalls, model, metadata) {
  try {
    console.log('🔍 Generating investigation reflection to capture contextual intelligence...');

    // Create investigation reflection prompt
    const reflectionPrompt = `You have completed a comprehensive investigation of Claude Code session data from one developer's workflow. This reflection captures the key insights and evidence you discovered for user-facing summaries.

## Investigation Summary Request

Provide a comprehensive summary (max 2500 characters) that captures:

1. **Key Patterns Discovered**: Specific issues and behaviors identified with quantified impact
2. **Evidence Examples**: Concrete session quotes, error messages, and behaviors that illustrate patterns
3. **Contextual Insights**: Important discoveries that emerged from analyzing actual session conversations
4. **Quantified Findings**: Percentages, frequencies, and measurable impacts of identified patterns
5. **Critical Correlations**: Connections between behavior and session outcomes

Focus on actionable insights that help the developer understand their workflow patterns and improve their experience with Claude Code.

**Format**: Write as a dense, evidence-rich summary for user-facing reports. Include specific examples, percentages, and concrete evidence that users can act upon.

## Response Requirements:
- Maximum 2500 characters
- Include specific session examples and measurable data
- Focus on patterns users can recognize and address
- Provide quantified evidence (percentages, frequencies, durations)
- Keep content user-valuable, not process-focused`;

    // Make the investigation reflection call with full conversation context
    const reflectionMessages = [
      ...messages, // Include full conversation history with all tool calls and results
      {
        role: 'user',
        content: reflectionPrompt,
      },
    ];

    const reflectionConfig = {
      model: model,
      max_tokens: 1500, // Sufficient for 2500 character output
      messages: reflectionMessages,
    };

    const reflectionResponse = await client.messages.create(reflectionConfig);
    const text = reflectionResponse.content[0]?.text || '';

    // Track the LLM call in metadata
    const duration = Date.now();
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'investigation-reflection',
        strategy: 'post-analysis',
        provider: 'anthropic-api',
        model: model,
        inputTokens: reflectionResponse.usage?.input_tokens || 0,
        outputTokens: reflectionResponse.usage?.output_tokens || 0,
        totalTokens: (reflectionResponse.usage?.input_tokens || 0) + (reflectionResponse.usage?.output_tokens || 0),
        duration,
        success: true,
      });
    }

    console.log(`✅ Investigation reflection generated: ${text.length} characters`);
    return text || null;
  } catch (error) {
    console.warn('⚠️ Investigation reflection failed - summaries will use limited context:', error.message);
    return null;
  }
}

/**
 * Run self-reflection analysis to assess tool usage effectiveness
 * @param {Object} client - Anthropic client
 * @param {Array} messages - Conversation history with tool usage
 * @param {number} toolRounds - Number of tool calling rounds completed
 * @param {number} totalToolCalls - Total number of tool calls made
 * @param {Array} sessions - Session data that was analyzed
 * @param {string} model - Model being used
 */
async function _runSelfReflection(client, messages, toolRounds, totalToolCalls, sessions, model) {
  try {
    console.log('🔍 Self-Reflection: Analyzing tool usage effectiveness...');

    // Context summary is now built within the extracted prompt

    // Create self-reflection prompt that references the actual investigation
    const reflectionPrompt = buildSelfReflectionPrompt(totalToolCalls, toolRounds);

    // Make the self-reflection call with full conversation context for comprehensive feedback
    const reflectionMessages = [
      ...messages, // Include full conversation history with all tool calls and results
      {
        role: 'user',
        content: reflectionPrompt,
      },
    ];

    const reflectionConfig = {
      model: model,
      max_tokens: getModelMaxTokens(model, false), // Self-reflection is simple analysis
      messages: reflectionMessages,
    };

    const reflectionStream = client.messages.stream(reflectionConfig);
    const reflectionResponse = await reflectionStream.finalMessage();

    // Extract and log the self-reflection
    const reflectionText = reflectionResponse.content[0]?.text || 'No reflection generated';

    console.log('\n' + '='.repeat(100));
    console.log('🤔 LLM SELF-REFLECTION ON TOOL USAGE EFFECTIVENESS');
    console.log('='.repeat(100));
    console.log(reflectionText);
    console.log('='.repeat(100) + '\n');

    // Log token usage for this reflection
    if (reflectionResponse.usage) {
      console.log(
        `💡 Self-reflection tokens: ${reflectionResponse.usage.input_tokens} input + ${reflectionResponse.usage.output_tokens} output = ${reflectionResponse.usage.input_tokens + reflectionResponse.usage.output_tokens} total`
      );
    }
  } catch (error) {
    console.log('❌ Self-reflection failed:', error.message);
  }
}

/**
 * Process tool calls from the LLM response
 * @param {Object} response - API response containing tool calls
 * @param {Array} sessions - Session data for tool handlers
 * @returns {Promise<Array>} Tool results for the LLM
 */
async function processToolCalls(response, sessions) {
  const toolResults = [];

  for (const content of response.content) {
    if (content.type === 'tool_use') {
      const startTime = Date.now();
      try {
        console.log(`      ⚙️  Executing ${content.name}...`);
        const result = await handleToolCall(content.name, content.input, sessions);
        const duration = Date.now() - startTime;

        // Log result summary
        if (Array.isArray(result)) {
          console.log(
            `      ✅ ${content.name} completed in ${duration}ms → ${result.length} results`
          );
        } else if (result && typeof result === 'object') {
          console.log(
            `      ✅ ${content.name} completed in ${duration}ms → object with ${Object.keys(result).length} keys`
          );
        } else {
          console.log(`      ✅ ${content.name} completed in ${duration}ms → ${typeof result}`);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: content.id,
          content: JSON.stringify(result, null, 2), // Pretty format for readability
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`      ❌ ${content.name} failed in ${duration}ms → ${error.message}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: content.id,
          is_error: true,
          content: `Tool error: ${error.message}`,
        });
      }
    }
  }

  return toolResults;
}

/**
 * Generate chat response using tools
 * @param {string} userMessage - User's chat message
 * @param {Array} conversationHistory - Previous messages
 * @param {Object} analysisContext - Current analysis context (project filter, etc.)
 * @returns {Promise<Object>} Chat response
 */
export async function generateChatResponse(
  userMessage,
  conversationHistory = [],
  analysisContext = null,
  progressCallback = null
) {
  // Fallback check
  if (isTest() || !getApiKey()) {
    const projectNote = analysisContext?.projectFilter
      ? ` for project "${analysisContext.projectFilter}"`
      : '';
    return {
      success: true,
      response: `I understand you're asking about: "${userMessage}". However, I currently don't have access to your session data${projectNote}.`,
      metadata: { strategy: 'fallback', projectFilter: analysisContext?.projectFilter },
    };
  }

  try {
    // Build chat-specific prompt
    const chatPrompt = buildChatPrompt(userMessage, conversationHistory, analysisContext);

    // Report progress before calling LLM
    if (progressCallback) {
      progressCallback('llm:start', { message: 'Sending request to AI' });
    }

    // Use core function with progress callback
    const result = await callAnthropicWithTools(chatPrompt, null, true, progressCallback);

    if (!result) {
      throw new Error('Core function returned null');
    }

    // Extract text response
    let responseText = '';
    for (const content of result.response.content) {
      if (content.type === 'text') {
        responseText += content.text;
      }
    }

    return {
      success: true,
      response: responseText || 'I was unable to generate a response.',
      metadata: {
        strategy: 'agentic',
        toolRounds: result.toolRounds || 0,
        totalToolCalls: result.totalToolCalls || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      response: `I encountered an error. Please try rephrasing your question.`,
      error: error.message,
      metadata: { strategy: 'error_fallback' },
    };
  }
}

/**
 * Build chat prompt - focused on conversational interaction
 */
function buildChatPrompt(userMessage, conversationHistory, analysisContext = null) {
  let prompt = `You are a helpful AI assistant for analyzing Claude Code development sessions.

User's Question: "${userMessage}"`;

  // Add analysis summaries for rich context
  if (
    analysisContext?.executiveSummary ||
    analysisContext?.narrativeSummary ||
    analysisContext?.recommendations?.length > 0
  ) {
    prompt += '\n\nCURRENT ANALYSIS CONTEXT:';

    if (analysisContext.executiveSummary) {
      prompt += `\n\nEXECUTIVE SUMMARY:\n${analysisContext.executiveSummary}`;
    }

    if (analysisContext.narrativeSummary) {
      prompt += `\n\nNARRATIVE SUMMARY:\n${analysisContext.narrativeSummary}`;
    }

    if (analysisContext.recommendations && analysisContext.recommendations.length > 0) {
      prompt += '\n\nKEY RECOMMENDATIONS:';
      analysisContext.recommendations.slice(0, 5).forEach((rec, i) => {
        prompt += `\n${i + 1}. ${rec.title || rec.description || rec}`;
        if (rec.description && rec.title) {
          prompt += ` - ${rec.description}`;
        }
      });
    }

    if (analysisContext.enhancedAnalysis) {
      // Include key insights from enhanced analysis if available
      const enhanced = analysisContext.enhancedAnalysis;
      if (enhanced.keyInsights || enhanced.summary) {
        prompt += `\n\nAI INSIGHTS:\n${enhanced.keyInsights || enhanced.summary}`;
      }
    }

    // Add temporal context for time-aware responses
    if (analysisContext.temporalSummary) {
      const temporal = analysisContext.temporalSummary;
      prompt += `\n\nTEMPORAL ANALYSIS CONTEXT:
- TODAY: ${temporal.today.sessionCount} sessions, ${temporal.today.errorCount} errors (avg ${Math.round(temporal.today.avgDuration/60)}min each)
- YESTERDAY: ${temporal.yesterday.sessionCount} sessions, ${temporal.yesterday.errorCount} errors (avg ${Math.round(temporal.yesterday.avgDuration/60)}min each)
- THIS WEEK: ${temporal.thisWeek.sessionCount} sessions total
- TRENDS: ${temporal.trends.errorTrend > 0 ? 'Errors increased' : 'Errors decreased'} ${Math.abs(temporal.trends.errorTrend).toFixed(1)}% vs yesterday`;

      if (temporal.today.topIssues?.length > 0) {
        prompt += `\n- TODAY'S TOP ISSUES: ${temporal.today.topIssues.map(issue => `${issue.issue} (${issue.count}x)`).join(', ')}`;
      }
    }
  }

  // Add project filtering context if available
  if (analysisContext?.projectFilter) {
    prompt += `

IMPORTANT CONTEXT: The user is currently viewing analysis results filtered to project "${analysisContext.projectFilter}".
- The dashboard and reports they see are scoped to this project
- When they refer to "this project", "my sessions", "recent work", etc., they mean "${analysisContext.projectFilter}"
- DEFAULT: Use project="${analysisContext.projectFilter}" in tool calls to match what they're viewing
- FLEXIBLE: You CAN access other projects if the user explicitly asks (e.g., "compare to project-beta", "show me React sessions")
- CONTEXTUAL: Help users understand when you're showing data from outside their current view
- When showing cross-project data, mention you're expanding beyond their current "${analysisContext.projectFilter}" scope`;
  } else {
    prompt += `

CONTEXT: The user is viewing comprehensive analysis results across ALL projects.
- No project filtering is applied - you have access to all their session data
- Feel free to search across projects and provide insights from their complete development history`;
  }

  // Add conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    prompt += '\n\nRecent Conversation:';
    conversationHistory.slice(-6).forEach(msg => {
      if (msg.role === 'user') {
        prompt += `\nUser: ${msg.content}`;
      } else if (msg.role === 'assistant') {
        prompt += `\nAssistant: ${msg.content}`;
      }
    });
  }

  prompt += `

Instructions:
- Answer the user's specific question helpfully and conversationally
- You have rich analysis context above - use it to provide informed responses about their development patterns
- For temporal queries ("today", "this week", "recently"), use the TEMPORAL ANALYSIS CONTEXT above
- You can also request time-filtered data using tools like search_sessions with appropriate date filters
- Use available tools to search/filter sessions as needed for specific data or deeper analysis${analysisContext?.projectFilter ? `\n- DEFAULT to project="${analysisContext.projectFilter}" when calling tools unless user explicitly requests other projects\n- When expanding scope beyond "${analysisContext.projectFilter}", explain you're showing data outside their current view` : ''}
- For general questions about patterns, struggles, or insights, reference the analysis context first
- Be concise but informative (1-3 paragraphs typically)
- Ask clarifying questions if the request is unclear

Available Tools:
- search_sessions: Search sessions by keyword, project, duration, etc.
- find_struggling_sessions: Find sessions with struggle indicators  
- get_session_details: Get detailed info about a specific session
- get_session_script: Load complete session script content
- analyze_patterns: Find patterns in filtered session data
- analyze_error_patterns: Analyze error patterns in sessions

Respond naturally as a helpful assistant.`;

  return prompt;
}

/**
 * Generate executive summary using direct Anthropic API
 * @param {Array} sessions - Session data
 * @param {Array} recommendations - Recommendation data
 * @param {Object} enhancedAnalysis - Optional enhanced analysis data
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {Promise<string>} Executive summary text
 */
export async function generateExecutiveSummary(
  sessions,
  recommendations,
  enhancedAnalysis = null,
  metadata = null
) {
  // Check API availability
  if (isTest() || !getApiKey()) {
    return createFallbackExecutiveSummary(sessions, recommendations);
  }

  const startTime = Date.now();
  try {
    const client = new Anthropic({
      apiKey: getApiKey(),
    });

    const stats = calculateStats(sessions, recommendations);

    // Build context from enhanced analysis if available (legacy behavior)
    let enhancedContext = '';
    if (enhancedAnalysis && typeof enhancedAnalysis === 'string') {
      // Extract key sections from markdown enhanced analysis
      const sections = enhancedAnalysis
        .split(/\n## /)
        .slice(1, 4) // Take first 3 sections after main header
        .map(section => {
          const lines = section.split('\n');
          const title = lines[0];
          const content = lines.slice(1).join(' ').substring(0, 150);
          return `• ${title}: ${content}...`;
        })
        .join('\n');

      if (sections) {
        enhancedContext = `\n\nKey Deep-Dive Findings:\n${sections}`;
      }
    }

    const prompt = buildExecutiveSummaryPrompt(stats, enhancedContext, metadata);

    // Ensure prompt can be JSON serialized (fallback for malformed Unicode)
    let finalPrompt = prompt;
    try {
      JSON.stringify({ role: 'user', content: finalPrompt });
    } catch (jsonError) {
      console.warn('JSON serialization failed, sanitizing Unicode:', jsonError.message);

      // Sanitize by replacing problematic Unicode characters
      finalPrompt = finalPrompt.replace(/[\uD800-\uDFFF]/g, ''); // Remove surrogates

      // Test again after sanitization
      try {
        JSON.stringify({ role: 'user', content: finalPrompt });
        console.log('✅ Unicode sanitization successful');
      } catch (sanitizeError) {
        console.error(
          '❌ Even after sanitization, JSON serialization failed:',
          sanitizeError.message
        );
        console.error('Problematic prompt length:', finalPrompt.length);
        console.error('Prompt sample (first 200 chars):', finalPrompt.substring(0, 200));
        throw new Error(
          `JSON serialization failed even after Unicode sanitization: ${sanitizeError.message}`
        );
      }
    }

    const currentModel = getModel();
    const summaryConfig = {
      model: currentModel,
      max_tokens: getModelMaxTokens(currentModel, false), // Executive summary is simple analysis
      messages: [{ role: 'user', content: finalPrompt }],
    };

    // Use streaming for executive summary to prevent timeout
    const summaryStream = client.messages.stream(summaryConfig);
    const response = await summaryStream.finalMessage();

    const duration = Date.now() - startTime;
    const text = response.content[0]?.text || '';

    // Debug logging for executive summary response
    console.log('🤖 Executive Summary LLM Response DEBUG:');
    console.log('  Text length:', text.length);
    console.log(
      '  Has problematic chars:',
      /[\uD800-\uDFFF\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text) ? 'YES' : 'NO'
    );

    // Track successful LLM call
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'executive-summary',
        strategy: 'simple',
        provider: 'anthropic-api',
        model: getModel(),
        maxTokens: 2000,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        actualTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        duration,
        success: true,
      });
    }

    const content =
      text.length > 100 ? text : createFallbackExecutiveSummary(sessions, recommendations);

    const returnValue = typeof content === 'string' ? content : content.content || content;

    // Debug logging for return type
    console.log('📤 Executive Summary Return DEBUG:');
    console.log('  Return type:', typeof returnValue);
    console.log('  Is string:', typeof returnValue === 'string');

    return returnValue;
  } catch (error) {
    console.warn('Executive summary generation failed:', error.message);
    console.error('🚨 Executive Summary Error Details:', {
      errorType: error.constructor.name,
      stack: error.stack?.split('\n')[0] || 'No stack trace',
    });

    // Track failed LLM call
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'executive-summary',
        strategy: 'simple',
        provider: 'anthropic-api',
        model: getModel(),
        maxTokens: 2000,
        actualTokens: 0,
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
      });
    }

    const fallback = createFallbackExecutiveSummary(sessions, recommendations);

    // Return structured error info for frontend
    return {
      content: fallback,
      error: {
        type: 'llm_error',
        message: parseUserFriendlyMessage(error, 'Executive summary'),
        details: error.message,
      },
    };
  }
}

/**
 * Generate narrative summary using direct Anthropic API
 * @param {Array} sessions - Session data
 * @param {Array} recommendations - Recommendation data
 * @param {Object} enhancedAnalysis - Optional enhanced analysis data
 * @param {Object} metadata - Optional metadata object for tracking
 * @returns {Promise<string>} Narrative summary text
 */
export async function generateNarrativeSummary(
  sessions,
  recommendations,
  enhancedAnalysis = null,
  metadata = null
) {
  // Validate inputs
  if (!Array.isArray(sessions)) {
    throw new Error(`generateNarrativeSummary: sessions must be array, got ${typeof sessions}`);
  }
  if (!Array.isArray(recommendations)) {
    throw new Error(
      `generateNarrativeSummary: recommendations must be array, got ${typeof recommendations}`
    );
  }

  // Check API availability
  if (isTest() || !getApiKey()) {
    return createFallbackNarrativeSummary(sessions, recommendations);
  }

  const startTime = Date.now();
  try {
    const client = new Anthropic({
      apiKey: getApiKey(),
    });

    const stats = calculateStats(sessions, recommendations);

    // Build enhanced context from deep-dive analysis (legacy behavior)
    let enhancedContext = '';
    if (enhancedAnalysis && typeof enhancedAnalysis === 'string') {
      // Extract detailed sections from markdown enhanced analysis
      const sections = enhancedAnalysis
        .split(/\n## /)
        .slice(1) // Skip main header
        .map(section => {
          const lines = section.split('\n');
          const title = lines[0];
          const content = lines.slice(1).join(' ').substring(0, 200);
          return `• ${title}: ${content}`;
        })
        .join('\n');

      if (sections) {
        enhancedContext = `\n\nDetailed Investigation Findings:\n${sections}\n\nUse these specific findings to inform your analysis and provide concrete examples.`;
      }
    }

    const prompt = buildNarrativeSummaryPrompt(stats, enhancedContext, metadata);

    // Ensure prompt can be JSON serialized (fallback for malformed Unicode)
    let finalPrompt = prompt;
    try {
      JSON.stringify({ role: 'user', content: finalPrompt });
    } catch (jsonError) {
      console.warn(
        'JSON serialization failed in narrative summary, sanitizing Unicode:',
        jsonError.message
      );

      // Sanitize by replacing problematic Unicode characters
      finalPrompt = finalPrompt.replace(/[\uD800-\uDFFF]/g, ''); // Remove surrogates

      // Test again after sanitization
      try {
        JSON.stringify({ role: 'user', content: finalPrompt });
        console.log('✅ Unicode sanitization successful in narrative summary');
      } catch (sanitizeError) {
        console.error(
          '❌ Even after sanitization, narrative summary JSON serialization failed:',
          sanitizeError.message
        );
        console.error('Problematic prompt length:', finalPrompt.length);
        console.error('Prompt sample (first 200 chars):', finalPrompt.substring(0, 200));
        throw new Error(
          `Narrative summary JSON serialization failed even after Unicode sanitization: ${sanitizeError.message}`
        );
      }
    }

    const currentModel = getModel();
    const narrativeConfig = {
      model: currentModel,
      max_tokens: getModelMaxTokens(currentModel, false), // Narrative summary is simple analysis
      messages: [{ role: 'user', content: finalPrompt }],
    };

    // Use streaming for narrative summary to prevent timeout
    const narrativeStream = client.messages.stream(narrativeConfig);
    const response = await narrativeStream.finalMessage();

    const duration = Date.now() - startTime;
    const text = response.content[0]?.text || '';

    // Debug logging for narrative summary response
    console.log('🤖 Narrative Summary LLM Response DEBUG:');
    console.log('  Text length:', text.length);
    console.log(
      '  Has problematic chars:',
      /[\uD800-\uDFFF\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text) ? 'YES' : 'NO'
    );

    // Track successful LLM call
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'narrative-summary',
        strategy: 'simple',
        provider: 'anthropic-api',
        model: getModel(),
        maxTokens: 3000,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        actualTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
        duration,
        success: true,
      });
    }

    const narrative =
      text.length > 100 ? text : createFallbackNarrativeSummary(sessions, recommendations);

    // Ensure we return a string for successful case
    const finalNarrative =
      typeof narrative === 'string' ? narrative : narrative.content || narrative;

    // Validate result
    if (typeof finalNarrative !== 'string' || finalNarrative.trim().length === 0) {
      console.log('⚠️  Narrative summary validation failed, using fallback');
      return createFallbackNarrativeSummary(sessions, recommendations);
    }

    // Debug logging for return type
    console.log('📤 Narrative Summary Return DEBUG:');
    console.log('  Return type:', typeof finalNarrative);
    console.log('  Length:', finalNarrative.length);

    return finalNarrative;
  } catch (error) {
    console.warn('Narrative summary generation failed:', error.message);
    console.error('🚨 Narrative Summary Error Details:', {
      errorType: error.constructor.name,
      stack: error.stack?.split('\n')[0] || 'No stack trace',
    });

    // Track failed LLM call
    if (metadata) {
      trackLLMCall(metadata, {
        type: 'narrative-summary',
        strategy: 'simple',
        provider: 'anthropic-api',
        model: getModel(),
        maxTokens: 3000,
        actualTokens: 0,
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
      });
    }

    const fallback = createFallbackNarrativeSummary(sessions, recommendations);

    // Return structured error info for frontend
    return {
      content: fallback,
      error: {
        type: 'llm_error',
        message: parseUserFriendlyMessage(error, 'Narrative summary'),
        details: error.message,
      },
    };
  }
}
