/**
 * @file Prompt Builder - Constructs prompts for different analysis modes
 * Pure functions for building prompts for enhanced analysis, executive summaries, and narratives
 */

import { calculateStats } from './utilities.js';

/**
 * Build analysis prompt based on mode (regular vs deep dive)
 * @param {Array} sessions - Session data
 * @param {Array} recommendations - Recommendation data
 * @param {boolean} deepDive - Whether to enable deep dive mode
 * @returns {string} Analysis prompt
 */
export function buildAnalysisPrompt(sessions, recommendations, deepDive) {
  const stats = calculateStats(sessions, recommendations);
  const projects = [...new Set(sessions.map(s => s.projectName || 'Unknown'))];

  if (deepDive) {
    return `You are analyzing Claude Code conversation logs to identify both data-driven patterns AND practical workflow improvements. Your goal is to provide actionable recommendations at two levels: what the data reveals AND how the user can prevent these issues.

Context: ${stats.totalSessions} collaborative development sessions across ${projects.length} projects, totaling ${stats.totalHours} hours.

ADAPTIVE INVESTIGATION METHODOLOGY - HYPOTHESIS-DRIVEN APPROACH:

**Initial Foundation (3-4 tools):**
For maximum efficiency, execute multiple independent tools simultaneously rather than sequentially whenever possible.
- Use \`analyze_error_patterns\` and \`analyze_patterns\` to identify the top 3-5 most impactful issues
- Use \`find_struggling_sessions\` to get a diverse sample across projects/contexts
- Form specific hypotheses about root causes and user behavior patterns

**Strategic Investigation Principles:**
1. **Parallel Tool Efficiency**: When investigating multiple independent aspects (different projects, session types, or patterns), execute parallel tool calls to maximize efficiency
2. **Hypothesis-Driven**: After each tool call, form specific hypotheses about what you're seeing and test them
3. **Strategic Session Selection**: Choose sessions based on criteria (different user types, project complexity, error patterns, success stories)
4. **Comparative Analysis**: Always contrast struggling sessions with successful ones - what makes the difference?
5. **Behavioral Deep-Dives**: Session scripts are goldmines - analyze conversation flow, decision points, user language patterns
6. **Follow the Evidence**: Adapt your investigation based on findings rather than following a rigid sequence

**Core Questions to Investigate:**
- What are the top 3-5 patterns causing the most user friction? (form hypotheses)
- Which user behaviors correlate with session success vs abandonment? (test with comparative analysis)
- How do different user skill levels/contexts change the struggle patterns? (strategic session selection)
- What early warning signs predict session failure? (behavioral analysis from scripts)
- Which interventions would have the highest impact? (evidence-based prioritization)

**Session Script Exploitation Strategy:**
When using \`get_session_script\`, focus on:
- Conversation flow and decision points
- User language patterns (confidence, frustration, confusion indicators)
- Tool usage sequences and their effectiveness
- Recovery strategies that work vs fail
- Environmental and context factors

**Thoroughness Through Strategy:** Expect 10-15+ rounds, but let evidence guide your path. Better strategic depth than exhaustive breadth.

DUAL-PERSPECTIVE ANALYSIS REQUIRED:

A) **Data-Driven Insights** (What happened):
- Which error types are session-ending vs recoverable? (Provide percentages)
- Resolution success rates and typical time-to-resolution
- User skill progression evidence - do they improve or plateau?
- Context switching costs and productivity patterns

B) **Preventive Recommendations** (How to avoid these issues):
- Claude Code configuration suggestions based on observed patterns
- Session management strategies (when to start fresh, context preparation)
- Communication patterns that work better with Claude
- Task decomposition approaches for complex problems
- Prompt engineering improvements based on successful examples
- IDE workflow integration suggestions

STRATEGIC QUESTIONS TO GUIDE INVESTIGATION:
- **Pattern Identification**: What are the top 3-5 friction patterns with highest impact? What's the evidence?
- **Success Factors**: Which sessions succeeded despite initial struggles? What recovery strategies worked?
- **User Archetypes**: How do struggle patterns vary by skill level, project type, or context? 
- **Early Warning Signs**: What behavioral indicators predict session abandonment vs breakthrough?
- **Prevention Strategies**: What could users have done differently to avoid the most costly friction?
- **Configuration Impact**: Which Claude settings, session strategies, or workflow changes would eliminate the most common pain points?
- **Skill Progression**: Is there evidence of user learning over time, or do the same issues recur?

EXPECTED OUTPUT:
1. **Technical Friction Analysis**: Top issues with resolution rates and specific examples (cite session IDs)
2. **Success Pattern Recognition**: What works - both in-session recovery AND preventive approaches
3. **User Development Insights**: Evidence of learning progression vs recurring struggles
4. **Practical Configuration Advice**: Claude settings, session strategies, communication patterns
5. **Workflow Integration Recommendations**: How to better integrate Claude Code into development process
6. **Skill-Level Guidance**: Different approaches for different experience levels

EVIDENCE STANDARDS & INVESTIGATION QUALITY:
- **Hypothesis Testing**: State your hypotheses explicitly and show how evidence supports/refutes them
- **Comparative Analysis**: For every struggling pattern, identify contrasting successful examples
- **Strategic Session Selection**: Justify why you chose specific sessions - represent different user archetypes, not just random struggles
- **Behavioral Insights**: Extract user language patterns, decision points, and workflow strategies from session scripts
- **Quantified Impact**: Provide percentages, frequencies, and estimated time savings for recommendations
- **Root Cause vs Symptoms**: Distinguish between surface symptoms and underlying workflow issues
- **User Journey Focus**: Consider different user skill levels and contexts, not one-size-fits-all solutions

Format as markdown with clear sections. Provide insights that combine deep session analysis with practical workflow expertise.`;
  }

  // Standard analysis mode
  const topIssues = recommendations
    .slice(0, 8)
    .map(r => `${r.type}: ${r.description || r.title || 'No description'}`)
    .join('\n');

  return `Generate an enhanced AI analysis of collaborative development session patterns.

Context: You are analyzing Claude Code conversation logs showing ${stats.totalSessions} collaborative development sessions between a user and Claude across ${projects.length} projects.

Data Overview:
- ${stats.totalSessions} sessions analyzed (avg ${stats.avgSessionMinutes}min each)
- ${stats.totalHours} hours of development time
- ${recommendations.length} improvement opportunities identified
- Projects: ${projects.slice(0, 5).join(', ')}${projects.length > 5 ? '...' : ''}

Top Issues Found:
${topIssues}

Create a detailed enhanced analysis with:
1. Critical Patterns and Inefficiencies in the collaborative workflow
2. Priority Focus Areas that would dramatically improve development velocity  
3. Strategic Recommendations with specific implementation guidance
4. Expected Outcomes with quantified improvements (time savings, efficiency gains)

Write in a professional, analytical tone. Address the user directly using "you" and "your".
Focus on high-impact insights that only AI analysis could reveal from this session data.
Format as markdown with clear sections and bullet points for readability. No emojis.`;
}

/**
 * Build context summary for self-reflection
 * @param {Array} messages - Conversation history
 * @param {number} toolRounds - Tool calling rounds
 * @param {number} totalToolCalls - Total tool calls
 * @param {Array} sessions - Session data
 * @returns {string} Context summary
 */
export function buildSelfReflectionContext(messages, toolRounds, totalToolCalls, sessions) {
  const sessionCount = sessions.length;
  const avgDuration =
    sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / sessionCount / 60;
  const strugglingCount = sessions.filter(
    s => s.hasStruggle || (s.durationSeconds && s.durationSeconds > 1800)
  ).length;

  // Calculate conversation length
  const conversationChars = messages.reduce((total, msg) => {
    if (typeof msg.content === 'string') {
      return total + msg.content.length;
    } else if (Array.isArray(msg.content)) {
      return (
        total +
        msg.content.reduce((subtotal, part) => {
          return subtotal + (part.text?.length || 0) + JSON.stringify(part.input || {}).length;
        }, 0)
      );
    }
    return total;
  }, 0);

  return `- Dataset: ${sessionCount} sessions (avg ${Math.round(avgDuration)} min each, ${strugglingCount} showing struggle indicators)
- Tool Usage: ${totalToolCalls} tool calls across ${toolRounds} rounds of investigation
- Context Size: ~${Math.round(conversationChars / 1000)}K characters of conversation history
- Available Tools: get_session_details, find_struggling_sessions, get_session_script, analyze_patterns, analyze_error_patterns
- Investigation Depth: ${toolRounds > 10 ? 'Extensive' : toolRounds > 5 ? 'Thorough' : 'Focused'} exploration`;
}

/**
 * Get user-friendly description for tool names
 * @param {string} toolName - Tool name
 * @returns {string} User-friendly description
 */
export function getToolDescription(toolName) {
  const descriptions = {
    get_session_details: 'examining session metadata',
    find_struggling_sessions: 'identifying problematic patterns',
    get_session_script: 'analyzing conversation details',
    analyze_patterns: 'detecting workflow issues',
    analyze_error_patterns: 'investigating error trends',
  };
  return descriptions[toolName] || 'analyzing session data';
}

/**
 * Build executive summary prompt
 * @param {Object} stats - Calculated session statistics
 * @param {string} enhancedContext - Optional enhanced context from deep-dive analysis
 * @returns {string} Executive summary prompt
 */
export function buildExecutiveSummaryPrompt(stats, enhancedContext = '') {
  return `IMPORTANT: Respond with text only. Do not use any tools.

Generate an executive summary for collaborative development session analysis.

Context: You are analyzing Claude Code conversation logs showing collaborative development sessions between a user and Claude.

Data Overview:
- ${stats.totalSessions} sessions analyzed (avg ${stats.avgSessionMinutes}min each)
- ${stats.totalHours} hours of development time
- ${stats.recommendationCount} improvement opportunities identified
- Projects: ${stats.projects.join(', ')}${enhancedContext}

Create a concise, professional executive summary with:
1. Key Metrics about collaborative development performance
2. Key Areas for Improvement in collaborative patterns and workflow  
3. Immediate Opportunities to enhance the process
4. Implementation Considerations with next steps

Write in a calm, professional engineering tone. Address the user directly using "you" and "your".
Format as markdown with clear sections. No emojis.`;
}

/**
 * Build narrative summary prompt
 * @param {Object} stats - Calculated session statistics
 * @param {string} enhancedContext - Optional enhanced context from deep-dive analysis
 * @returns {string} Narrative summary prompt
 */
export function buildNarrativeSummaryPrompt(stats, enhancedContext = '') {
  const contextNote = enhancedContext ? ` Key patterns: ${enhancedContext}` : '';

  return `IMPORTANT: Respond with text only. Do not use any tools.

You're analyzing human-AI collaboration patterns to help a developer optimize their workflow with Claude Code. This analysis covers ${stats.totalSessions} collaborative development sessions across ${stats.projects.length} projects (${stats.totalHours} hours total, ${stats.avgSessionMinutes}min average).${contextNote}

CRITICAL ATTRIBUTION GUIDELINES:
- Tool usage, command timeouts, and execution errors = Claude's actions/limitations
- Task requests, session abandonment, and goal-setting = User's actions/decisions  
- Focus on how the USER can work more effectively WITH Claude

Structure your analysis:

1. **Collaboration Overview** - How effectively you and Claude worked together
2. **User Workflow Patterns** - Your approach to requesting help, structuring tasks, and managing sessions
3. **Claude's Performance Patterns** - Where Claude succeeded vs. struggled with your requests  
4. **Friction Points** - Collaboration breakdowns and their root causes
5. **Workflow Optimization** - Specific changes to improve human-AI collaboration

Writing approach:
- Distinguish between your requests/goals vs. Claude's execution/errors
- Focus on collaboration strategy over technical debugging
- Recommend session management, request structuring, and environment setup
- Suggest ways to prevent Claude's common failure patterns through better user guidance
- Address workflow efficiency, not just code quality

Examples of proper attribution:
GOOD: "Claude hit multiple timeouts while running your test commands"  
GOOD: "Your requests were well-structured, leading to efficient problem resolution"
GOOD: "Claude struggled with environment errors that could be prevented with setup validation"

AVOID: "Your timeout errors suggest infrastructure issues" 
AVOID: "Your tool usage shows inefficient debugging patterns"

Tone: Practical mentor helping optimize a collaborative workflow, not a technical code review.`;
}

/**
 * Build self-reflection prompt for tool usage analysis
 * @param {number} totalToolCalls - Total number of tool calls made
 * @param {number} toolRounds - Number of investigation rounds
 * @returns {string} Self-reflection prompt
 */
export function buildSelfReflectionPrompt(totalToolCalls, toolRounds) {
  return `You have just completed a multi-round investigation of Claude Code conversation logs using various analysis tools. Above this message is the complete record of your investigation - all ${totalToolCalls} tool calls across ${toolRounds} rounds, their results, and your final analysis.

## Your Investigation Summary:
${buildSelfReflectionContext([], toolRounds, totalToolCalls, [])}

## Self-Assessment Questions:
1. **Tool Selection Effectiveness**: Which tools provided the most valuable insights? Were there redundant or less useful tool calls?

2. **Investigation Strategy**: Was your progression logical and systematic? Did you follow leads effectively or get sidetracked?

3. **Evidence Quality**: How well did your tool usage support your final conclusions? Are there gaps where additional investigation would have helped?

4. **Synthesis Effectiveness**: How well did you connect findings across different tool results to form coherent insights?

5. **Practical Value**: How actionable and useful are your final recommendations for the user?

## Response Format:
Provide honest, specific feedback on your investigation process. Identify both strengths and areas for improvement. This self-reflection helps improve future analysis quality.

Be concise but thorough - focus on learnings that would genuinely improve future investigations.`;
}

/**
 * Build final synthesis prompt for tool-enabled analysis
 * @param {number} toolRounds - Number of investigation rounds completed
 * @param {number} totalToolCalls - Total tool calls made
 * @returns {string} Final synthesis prompt
 */
export function buildFinalSynthesisPrompt(toolRounds, totalToolCalls) {
  return `You've completed ${toolRounds} rounds of investigation with ${totalToolCalls} total tool calls. Now provide your final comprehensive analysis based on all the evidence you've gathered. Include:

1. **Data-Driven Insights** - Specific patterns found across your investigation
2. **Pattern Analysis** - Quantified evidence and correlations from multiple tools
3. **Root Cause Analysis** - Why these patterns exist and their impact
4. **Strategic Recommendations** - High-impact solutions backed by your findings
5. **Implementation Priorities** - Which changes would have the biggest effect

Focus on insights that only emerge from systematic investigation - not obvious observations. Support every claim with specific evidence from your tool usage. Address the developer directly with practical, actionable guidance.

Format as structured markdown with clear sections. This is your final response - synthesize everything into comprehensive, practical insights.`;
}

/**
 * Build completion hints for tool-enabled analysis
 * @param {number} toolRounds - Current number of tool rounds
 * @param {number} totalToolCalls - Total tool calls made
 * @returns {string} Completion hint based on investigation progress
 */
export function buildCompletionHints(toolRounds, totalToolCalls) {
  if (toolRounds >= 12) {
    return `\n\n[Deep investigation status: ${toolRounds} rounds completed with ${totalToolCalls} tools. You have extensive evidence from multiple session examinations. Consider synthesizing your findings, or continue if critical data is missing.]`;
  } else if (toolRounds >= 8) {
    return `\n\n[Investigation update: You've completed ${toolRounds} rounds with ${totalToolCalls} tools. You have substantial evidence for analysis. Continue investigating if you need more specific data, or provide your comprehensive findings.]`;
  }
  return '';
}
