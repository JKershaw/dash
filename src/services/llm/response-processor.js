/**
 * @file Response Processor - Parses and formats LLM API responses
 * Functions for processing and structuring API responses into usable formats
 */

// NOTE: convertMarkdownToHtml removed - frontend now handles all markdown rendering

/**
 * Process the analysis response into the expected format
 * @param {Object} response - API response
 * @param {Array} sessions - Original session data
 * @param {Array} recommendations - Original recommendations
 * @returns {Object} Formatted analysis result
 */
export function processAnalysisResponse(response, sessions, recommendations) {
  // Extract text content from response
  let responseText = '';
  for (const content of response.content) {
    if (content.type === 'text') {
      responseText += content.text + '\n';
    }
  }

  if (!responseText || responseText.length < 50) {
    throw new Error('Analysis response too short or empty');
  }

  // Format as markdown and add metadata footer
  let markdown = responseText.trim();
  
  // Ensure it has a proper title if not already present
  if (!markdown.startsWith('# ')) {
    markdown = '# Enhanced Analysis\n\n' + markdown;
  }
  
  // Add metadata section at the end
  const strategy = response.content.some(c => c.type === 'tool_use') ? 'api-with-tools' : 'api-simple';
  markdown += `\n\n---\n\n## Analysis Metadata\n\n`;
  markdown += `- **Sessions Analyzed:** ${sessions.length}\n`;
  markdown += `- **Recommendations:** ${recommendations.length}\n`;
  markdown += `- **Strategy:** ${strategy}\n`;
  markdown += `- **Generated:** ${new Date().toISOString()}\n`;

  return markdown;
}

/**
 * Parse enhanced analysis response into structured insights
 * @param {string} responseText - Raw response text from API
 * @returns {Array} Structured insights array
 */
export function parseEnhancedAnalysisResponse(responseText) {
  const insights = [];

  // Try to extract sections by headers with optional emojis (fallback for older responses)
  const sectionRegex = /##\s*[🔍🚨💡📈]?\s*\*?\*?(.*?)\*?\*?[\r\n]/g;
  const matches = [...responseText.matchAll(sectionRegex)];

  if (matches.length > 0) {
    matches.forEach((match, index) => {
      const title = match[1].trim();
      const startIndex = match.index + match[0].length;
      const endIndex = index < matches.length - 1 ? matches[index + 1].index : responseText.length;
      const content = responseText.substring(startIndex, endIndex).trim();

      if (content) {
        insights.push({
          title: title,
          content: content,
        });
      }
    });
  }

  // If we didn't find structured sections, return the full content as a single insight
  if (insights.length === 0) {
    insights.push({
      title: 'AI Analysis',
      content: responseText,
    });
  }

  return insights;
}

/**
 * Extract summary from the response (first paragraph or key insight)
 * @param {string} responseText - Raw response text
 * @returns {string} Extracted summary
 */
export function extractSummary(responseText) {
  // Look for key insight section first
  const keyInsightMatch = responseText.match(
    /\*?\*?🎯\s*Key Insight\*?\*?[:]\s*([^\n]+(?:\n[^\n#]+)*)/i
  );
  if (keyInsightMatch) {
    return keyInsightMatch[1].trim();
  }

  // Look for first substantial paragraph (not a header)
  const lines = responseText.split('\n').filter(line => line.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('##') &&
      !trimmed.startsWith('**Context**') &&
      !trimmed.startsWith('**Session Overview**') &&
      trimmed.length > 50
    ) {
      return trimmed;
    }
  }

  // Fallback to first non-empty line
  const firstLine = lines.find(line => line.trim() && !line.startsWith('#'));
  return firstLine?.trim() || 'Enhanced analysis completed';
}

/**
 * Extract actions from Strategic Recommendations section specifically
 * @param {string} responseText - Raw response text
 * @returns {Array} Extracted actions array
 */
export function extractActionsFromResponse(responseText) {
  const actions = [];

  // First try to find the Strategic Recommendations section
  const strategicMatch = responseText.match(
    /##\s*💡\s*\*?\*?Strategic Recommendations\*?\*?(.*?)(?=##|$)/s
  );
  const textToAnalyze = strategicMatch ? strategicMatch[1] : responseText;

  // Look for bullet points, numbered lists, and structured recommendations
  const actionPatterns = [
    /[-*]\s*\*?\*?([^*\n]+)\*?\*?/g, // Bullet points
    /\d+\.\s*\*?\*?([^*\n]+)\*?\*?/g, // Numbered lists
    /[🎯📊🏗️🧠⚡]\s*([^🎯📊🏗️🧠⚡\n]+)/g, // Emoji-prefixed items
  ];

  for (const pattern of actionPatterns) {
    let match;
    while ((match = pattern.exec(textToAnalyze)) !== null) {
      const action = match[1].trim();
      if (action.length > 15 && !action.includes('**') && !action.startsWith('#')) {
        actions.push({
          description: action,
          priority: action.toLowerCase().includes('critical') ? 'high' : 'medium',
        });
      }
    }
  }

  // If no structured actions found, extract key sentences
  if (actions.length === 0) {
    const sentences = textToAnalyze.match(/[^.!?]+[.!?]/g) || [];
    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      if (cleaned.length > 30 && cleaned.length < 150) {
        actions.push({ description: cleaned, priority: 'medium' });
      }
    }
  }

  return actions.slice(0, 8); // Limit to 8 most relevant actions
}