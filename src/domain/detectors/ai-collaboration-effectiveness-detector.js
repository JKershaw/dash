/**
 * Detects when AI suggestions work well and collaboration is effective
 * @param {object} session - A normalized session object
 * @returns {Array} An array of detected AI collaboration effectiveness patterns
 */
export function detectAiCollaborationEffectiveness(session) {
  if (!session || !session.toolOperations || session.toolOperations.length < 3) {
    return [];
  }

  // Need both tool operations and conversation data for meaningful analysis
  if (!session.conversationData || session.conversationData.length < 3) {
    return [];
  }

  const toolOps = session.toolOperations;
  const conversation = session.conversationData;

  // Analyze conversation patterns
  const conversationMetrics = analyzeConversationEffectiveness(conversation, toolOps);
  
  // Analyze implementation success patterns
  const implementationMetrics = analyzeImplementationSuccess(toolOps, conversation);
  
  // Analyze problem-solving effectiveness
  const problemSolvingMetrics = analyzeProblemSolvingEffectiveness(toolOps, conversation);

  // Check if this session shows effective AI collaboration
  const overallEffectiveness = calculateOverallEffectiveness(
    conversationMetrics,
    implementationMetrics, 
    problemSolvingMetrics
  );

  // Check for signs of failed collaboration
  const hasFailedTests = toolOps.some(op => 
    op.name === 'Bash' && 
    op.output && 
    (op.output.includes('failed') || op.output.includes('error')) &&
    op.status === 'error'
  );
  
  const hasReverts = toolOps.some(op => 
    op.output && 
    (op.output.includes('Reverted') || op.output.includes('Manual fix'))
  );
  
  const hasNegativeFeedback = conversation.some(msg => 
    msg.role === 'user' && (
      msg.content.includes('didn\'t work') ||
      msg.content.includes('not working') ||
      msg.content.includes('not helpful') ||
      msg.content.includes('I\'ll figure it out myself')
    )
  );

  // Don't detect if there are clear signs of failure
  if (hasFailedTests && hasReverts) {
    return [];
  }
  
  if (hasNegativeFeedback) {
    return [];
  }

  // Only detect pattern if effectiveness is high enough
  if (overallEffectiveness.score < 0.7) {
    return [];
  }

  return [
    {
      type: 'ai_collaboration_effectiveness',
      implementationSuccessRate: implementationMetrics.successRate,
      conversationEfficiency: conversationMetrics.efficiency,
      solutionClarity: conversationMetrics.solutionClarity || 0.8,
      backAndForthCount: conversationMetrics.backAndForthCount,
      complexityScore: problemSolvingMetrics.complexity || 0.6,
      guidanceEffectiveness: problemSolvingMetrics.guidanceEffectiveness || 0.8,
      researchType: problemSolvingMetrics.researchType,
      totalToolsUsed: toolOps.length,
      _provenance: {
        patternType: 'ai_collaboration_effectiveness',
        detectionTimestamp: new Date().toISOString(),
        sessionId: session.sessionId,
        sourceFile: session._provenance?.sourceFile,
        confidenceLevel: overallEffectiveness.score >= 0.8 ? 'high' : 'medium',
      },
    },
  ];
}

/**
 * Analyze conversation effectiveness patterns
 */
function analyzeConversationEffectiveness(conversation, toolOps) {
  const assistantMessages = conversation.filter(msg => msg.role === 'assistant');
  
  // Calculate conversation efficiency (solution to implementation ratio)
  const solutionMessages = assistantMessages.filter(msg => 
    msg.content.includes('Here\'s') || 
    msg.content.includes('I\'ll') || 
    msg.content.includes('recommendation') ||
    msg.content.includes('implement') ||
    msg.content.includes('solution')
  );
  
  const implementationActions = toolOps.filter(op => 
    ['Edit', 'Write', 'MultiEdit'].includes(op.name) && 
    op.status === 'success'
  );

  const efficiency = solutionMessages.length > 0 ? 
    implementationActions.length / solutionMessages.length : 0;

  // Calculate back-and-forth count
  let backAndForth = 0;
  for (let i = 1; i < conversation.length; i++) {
    if (conversation[i].role !== conversation[i-1].role) {
      backAndForth++;
    }
  }
  backAndForth = Math.floor(backAndForth / 2); // Convert to exchange count

  // Assess solution clarity based on positive user responses to AI solutions
  // Only count user messages that come after assistant messages (responses to solutions)
  const userResponseMessages = [];
  for (let i = 1; i < conversation.length; i++) {
    if (conversation[i].role === 'user' && conversation[i-1].role === 'assistant') {
      userResponseMessages.push(conversation[i]);
    }
  }
  
  const positiveResponses = userResponseMessages.filter(msg => 
    msg.content.toLowerCase().includes('perfect') ||
    msg.content.toLowerCase().includes('exactly') ||
    msg.content.toLowerCase().includes('great') ||
    msg.content.toLowerCase().includes('worked') ||
    msg.content.toLowerCase().includes('thanks') ||
    msg.content.includes('exactly what I needed') ||
    msg.content.includes('makes perfect sense')
  );
  
  const solutionClarity = userResponseMessages.length > 0 ? 
    positiveResponses.length / userResponseMessages.length : 0;

  return {
    efficiency: Math.min(efficiency, 1.0),
    backAndForthCount: backAndForth,
    solutionClarity: solutionClarity,
  };
}

/**
 * Analyze implementation success patterns
 */
function analyzeImplementationSuccess(toolOps) {
  const implementationOps = toolOps.filter(op => 
    ['Edit', 'Write', 'MultiEdit'].includes(op.name)
  );
  
  const successfulOps = implementationOps.filter(op => op.status === 'success');
  const successRate = implementationOps.length > 0 ? 
    successfulOps.length / implementationOps.length : 0;

  // Check for AI-suggested implementations in outputs
  const aiSuggestedOps = implementationOps.filter(op => 
    op.output && (
      op.output.includes('AI') || 
      op.output.includes('suggested') ||
      op.output.includes('recommended')
    )
  );

  const aiImplementationRate = implementationOps.length > 0 ?
    aiSuggestedOps.length / implementationOps.length : 0;

  return {
    successRate: successRate,
    aiImplementationRate: aiImplementationRate,
  };
}

/**
 * Analyze problem-solving effectiveness
 */
function analyzeProblemSolvingEffectiveness(toolOps, conversation) {
  // Check for research/guidance patterns
  const researchOps = toolOps.filter(op => 
    ['Read', 'Grep', 'Glob'].includes(op.name)
  );
  
  const isGuidedInvestigation = researchOps.length >= 3 && 
    conversation.some(msg => 
      msg.role === 'assistant' && (
        msg.content.includes('guide') ||
        msg.content.includes('First') ||
        msg.content.includes('then') ||
        msg.content.includes('look for')
      )
    );

  // Assess complexity based on tool variety and problem indicators
  const toolTypes = new Set(toolOps.map(op => op.name));
  const hasComplexPatterns = conversation.some(msg => 
    msg.content.includes('complex') ||
    msg.content.includes('timeout') ||
    msg.content.includes('connection') ||
    msg.content.includes('database') ||
    msg.content.includes('configuration')
  );

  const complexity = hasComplexPatterns ? 0.8 : (toolTypes.size > 4 ? 0.7 : 0.5);

  return {
    complexity: complexity,
    guidanceEffectiveness: isGuidedInvestigation ? 0.9 : 0.6,
    researchType: isGuidedInvestigation ? 'guided_investigation' : null,
  };
}

/**
 * Calculate overall collaboration effectiveness
 */
function calculateOverallEffectiveness(conversationMetrics, implementationMetrics, problemSolvingMetrics) {
  const weights = {
    conversationEfficiency: 0.3,
    implementationSuccess: 0.4,
    solutionClarity: 0.2,
    problemSolving: 0.1,
  };

  const score = 
    conversationMetrics.efficiency * weights.conversationEfficiency +
    implementationMetrics.successRate * weights.implementationSuccess +
    conversationMetrics.solutionClarity * weights.solutionClarity +
    (problemSolvingMetrics.complexity || 0.5) * weights.problemSolving;

  return { score: Math.min(score, 1.0) };
}