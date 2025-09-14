/**
 * @file Chat Routes
 * Handles interactive chat API for session analysis
 */

import { loadBasicSessionData, loadLatestAnalysisMetadata, getAnalysisData } from '../../../services/analysis-data.js';
import { generateChatResponse } from '../../../services/llm-service.js';
import { ProgressManager } from '../../../services/progress-manager.js';

// Simple in-memory conversation store (could be enhanced with persistence)
const conversations = new Map();

// In-memory store for chat progress (simple Map)
const chatProgressStore = new Map();

// Simple in-memory job store for non-blocking chat processing
const chatJobs = new Map();

/**
 * Setup chat API routes
 * @param {Express} app - Express application
 */
export function setupChatRoutes(app) {
  /**
   * @swagger
   * /api/chat:
   *   post:
   *     summary: Send chat message for interactive analysis
   *     description: Process chat messages about session analysis data
   *     tags:
   *       - Chat
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - message
   *             properties:
   *               message:
   *                 type: string
   *                 description: User's question or request
   *               conversationId:
   *                 type: string
   *                 description: Existing conversation ID for continuation
   */
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, conversationId } = req.body || {};

      // Validate input
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          error: 'Message is required',
          message: 'Please provide a non-empty message',
        });
      }

      // Get or create conversation
      let conversation;
      let newConversationId = conversationId;

      if (conversationId && conversations.has(conversationId)) {
        conversation = conversations.get(conversationId);
      } else {
        // Create new conversation
        newConversationId = generateConversationId();
        conversation = {
          id: newConversationId,
          messages: [],
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        conversations.set(newConversationId, conversation);
      }

      // Add user message to conversation
      conversation.messages.push({
        role: 'user',
        content: message.trim(),
        timestamp: new Date(),
      });
      conversation.lastActivity = new Date();

      // Get current analysis context (including project filter and analysis results)
      let analysisContext = null;
      try {
        const [metadata, analysisData] = await Promise.all([
          loadLatestAnalysisMetadata(),
          getAnalysisData()
        ]);
        
        if (metadata || analysisData) {
          analysisContext = {
            projectFilter: metadata?.projectFilter || null,
            runId: metadata?.id || null,
            // Include human-readable analysis summaries for rich context
            executiveSummary: analysisData?.executiveSummary || null,
            // Add temporal context for time-aware AI responses
            temporalSummary: analysisData?.temporalSummary || null,
            narrativeSummary: analysisData?.narrativeSummary || null,
            recommendations: analysisData?.recommendations || [],
            enhancedAnalysis: analysisData?.enhancedAnalysis || null
          };
        }
      } catch (error) {
        console.warn('⚠️ Could not load analysis context for chat:', error.message);
      }

      // Create progress manager for this chat request
      const progressManager = new ProgressManager();
      
      // Store progress updates for progress endpoint
      progressManager.on('progress', (data) => {
        console.log(`📊 Chat progress: ${data.message} (phase: ${data.phase})`);
        chatProgressStore.set(newConversationId, {
          ...data,
          timestamp: new Date().toISOString(),
          conversationId: newConversationId
        });
      });

      // Start progress tracking
      console.log('🚀 Starting progress tracking...');
      progressManager.reportProgress('chat:start', { 
        message: 'Processing your question',
        phase: 'initialization'
      });

      // Return immediately with conversation ID and job info
      res.json({
        conversationId: newConversationId,
        status: 'processing',
        timestamp: new Date().toISOString(),
      });

      // Process chat in the background
      processChatInBackground(
        newConversationId,
        message.trim(),
        conversation,
        analysisContext,
        progressManager
      );

    } catch (error) {
      console.error('Error processing chat message:', error);
      res.status(500).json({
        error: 'Failed to process chat message',
        message: error.message,
      });
    }
  });

  /**
   * @swagger
   * /api/chat/{conversationId}/progress:
   *   get:
   *     summary: Get progress updates for a chat conversation
   *     description: Poll for current progress status of chat processing
   *     tags:
   *       - Chat
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: The conversation ID to get progress for
   */
  app.get('/api/chat/:conversationId/progress', (req, res) => {
    const { conversationId } = req.params;
    
    try {
      // Get current progress for this conversation
      const progress = chatProgressStore.get(conversationId);
      
      // Force no HTTP caching for real-time updates
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      if (progress) {
        res.json({
          success: true,
          timestamp: Date.now(), // Force different response each time
          ...progress
        });
      } else {
        // No progress data found - chat might be starting or completed
        res.json({
          success: true,
          message: 'Processing...',
          phase: 'unknown',
          conversationId,
          timestamp: Date.now() // Force different response each time
        });
      }
    } catch (error) {
      console.error('Error fetching chat progress:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch progress'
      });
    }
  });

  /**
   * @swagger
   * /api/chat/{conversationId}/result:
   *   get:
   *     summary: Get chat result when processing is complete
   *     description: Poll for chat result after receiving processing status
   *     tags:
   *       - Chat
   *     parameters:
   *       - in: path
   *         name: conversationId
   *         required: true
   *         schema:
   *           type: string
   *         description: The conversation ID to get result for
   */
  app.get('/api/chat/:conversationId/result', (req, res) => {
    const { conversationId } = req.params;
    
    try {
      const job = chatJobs.get(conversationId);
      
      if (!job) {
        return res.status(404).json({
          error: 'Chat not found',
          conversationId
        });
      }
      
      // Force no HTTP caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      if (job.status === 'processing') {
        res.json({
          status: 'processing',
          conversationId,
          timestamp: Date.now()
        });
      } else if (job.status === 'completed') {
        res.json({
          status: 'completed',
          response: job.response,
          conversationId,
          timestamp: job.timestamp,
          metadata: job.metadata
        });
      } else if (job.status === 'error') {
        // Extract error information from metadata for unified error handling
        const metadata = job.result?.metadata;
        const errors = metadata?.errors || [];
        const criticalErrors = errors.filter(e => e.severity === 'critical');
        const errorSummary = criticalErrors.length > 0 
          ? criticalErrors[0] 
          : errors[0] || job.error; // Fallback to legacy job.error if no metadata

        res.status(500).json({
          status: 'error',
          error: errorSummary,
          conversationId,
          timestamp: job.timestamp,
          metadata: {
            totalErrors: errors.length,
            criticalErrors: criticalErrors.length,
            warnings: errors.filter(e => e.severity === 'warning').length
          }
        });
      }
    } catch (error) {
      console.error('Error fetching chat result:', error);
      res.status(500).json({
        error: 'Failed to fetch result',
        conversationId
      });
    }
  });
}

/**
 * Process chat message in background (non-blocking)
 */
async function processChatInBackground(conversationId, message, conversation, analysisContext, progressManager) {
  try {
    // Mark job as processing
    chatJobs.set(conversationId, {
      status: 'processing',
      startTime: new Date()
    });

    // Add delay for initialization phase (so frontend can see it)
    const initDelay = process.env.CHAT_INIT_DELAY_MS || (process.env.NODE_ENV === 'test' ? 0 : 1000);
    if (initDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, parseInt(initDelay)));
    }

    // Report context loading progress
    console.log('📥 Reporting context loading...');
    progressManager.reportProgress('chat:context', { 
      message: 'Loading analysis context',
      phase: 'context_loading'
    });

    // Add delay for context loading phase
    const contextDelay = process.env.CHAT_CONTEXT_DELAY_MS || (process.env.NODE_ENV === 'test' ? 0 : 1500);
    if (contextDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, parseInt(contextDelay)));
    }

    // Generate chat response with progress callback
    const chatResult = await generateChatResponse(
      message, 
      conversation.messages.slice(-10), // Keep last 10 messages for context
      analysisContext, // Pass analysis context including project filter
      // Add progress callback  
      (phase, data) => {
        progressManager.reportProgress(phase, {
          message: formatProgressMessage(phase, data),
          ...data,
          phase: phase // Ensure phase is preserved (after spread)
        });
      }
    );

    // Add delay before completion (so we can see synthesis phase)
    const completionDelay = process.env.CHAT_COMPLETION_DELAY_MS || (process.env.NODE_ENV === 'test' ? 0 : 1000);
    if (completionDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, parseInt(completionDelay)));
    }

    // Complete progress tracking
    progressManager.reportProgress('chat:complete', { 
      message: 'Response ready!',
      phase: 'complete'
    });

    // Extract response text
    let responseText;
    if (chatResult.success) {
      responseText = chatResult.response;
    } else {
      // Load session data for fallback only if needed (with project filtering if available)
      const filters = analysisContext?.projectFilter ? { project: analysisContext.projectFilter } : null;
      const sessionData = await loadBasicSessionData(filters);
      responseText = generateFallbackResponse(message, sessionData, analysisContext);
    }

    // Add assistant response to conversation
    conversation.messages.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date(),
      metadata: {
        strategy: chatResult.metadata?.strategy || 'fallback',
        toolRounds: chatResult.metadata?.toolRounds || 0,
        totalToolCalls: chatResult.metadata?.totalToolCalls || 0,
      },
    });

    // Store completed result
    chatJobs.set(conversationId, {
      status: 'completed',
      response: responseText,
      timestamp: new Date().toISOString(),
      metadata: {
        messageCount: conversation.messages.length,
        strategy: chatResult.metadata?.strategy || 'fallback',
        toolRounds: chatResult.metadata?.toolRounds || 0,
        totalToolCalls: chatResult.metadata?.totalToolCalls || 0,
      },
    });

    // Clean up progress data and job after delay
    setTimeout(() => {
      chatProgressStore.delete(conversationId);
      chatJobs.delete(conversationId);
    }, 60000);

  } catch (error) {
    console.error('Background chat processing error:', error);
    
    // Store error result
    chatJobs.set(conversationId, {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });

    // Clean up after delay
    setTimeout(() => {
      chatProgressStore.delete(conversationId);
      chatJobs.delete(conversationId);
    }, 60000);
  }
}

/**
 * Helper function to format progress messages
 * @param {string} phase - Progress phase
 * @param {Object} data - Progress data
 * @returns {string} Formatted message
 */
function formatProgressMessage(phase, data) {
  switch (phase) {
    case 'chat:start': return 'Processing your question';
    case 'chat:context': return 'Loading analysis context';
    case 'llm:start': return 'Thinking';
    case 'tool:start': return `Using ${data.toolName || 'tools'}`;
    case 'tool:searching': return 'Searching sessions';
    case 'tool:analyzing': return 'Analyzing patterns';
    case 'llm:round': return `Round ${data.round || 1}: Investigating`;
    case 'enhancedAnalysis:synthesis': return 'Synthesizing insights';
    case 'chat:complete': return 'Response ready!';
    default: return data.message || 'Processing';
  }
}

/**
 * Generate a unique conversation ID
 * @returns {string} Conversation ID
 */
function generateConversationId() {
  return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a fallback response when LLM analysis fails
 * @param {string} message - User message
 * @param {Object} sessionData - Session data
 * @param {Object} analysisContext - Analysis context with project filter
 * @returns {string} Fallback response
 */
function generateFallbackResponse(message, sessionData, analysisContext = null) {
  const sessionCount = sessionData.sessions?.length || 0;
  const hasStrugglingSessions = sessionData.sessions?.some(s => s.hasStruggle) || false;
  const projectContext = analysisContext?.projectFilter ? ` for project "${analysisContext.projectFilter}"` : '';

  if (message.toLowerCase().includes('session')) {
    return `I found ${sessionCount} sessions${projectContext} in your analysis data. ${
      hasStrugglingSessions ? 'Some sessions show struggle patterns that might benefit from attention.' : 'The sessions appear to show good development flow.'
    } You can ask me specific questions about these sessions.`;
  }

  if (message.toLowerCase().includes('project')) {
    if (analysisContext?.projectFilter) {
      return `Your analysis is currently filtered to project "${analysisContext.projectFilter}" with ${sessionCount} sessions. What would you like to know about this project's sessions?`;
    } else {
      const projects = new Set(sessionData.sessions?.map(s => s.projectName).filter(Boolean));
      return `Your sessions cover ${projects.size} different projects: ${Array.from(projects).join(', ')}. Which project would you like to know more about?`;
    }
  }

  if (message.toLowerCase().includes('help')) {
    const scopeNote = analysisContext?.projectFilter ? ` (scoped to project "${analysisContext.projectFilter}")` : '';
    return `I can help you analyze your Claude Code sessions${scopeNote}. Try asking about:
- "Show me sessions with struggles"
- "Which projects have the most activity?"
- "What are the main patterns in my sessions?"
- "Find sessions related to [keyword]"`;
  }

  return `I understand you're asking about: "${message}". I have access to ${sessionCount} sessions${projectContext} from your Claude Code analysis. Could you be more specific about what you'd like to know?`;
}