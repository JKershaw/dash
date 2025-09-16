/**
 * Detects redundant tool sequences (e.g., Read->Edit->Read same file).
 * Now phase-aware to allow exploration patterns while catching genuine redundancy.
 * @param {object} session - A normalized session object.
 * @param {Array} phaseInfo - Session phase information for context-aware detection.
 * @returns {Array} An array of detected redundant sequence patterns.
 */
export function detectRedundantSequences(session, phaseInfo = []) {
  if (!session || !session.toolOperations || session.toolOperations.length < 3) {
    return [];
  }

  const redundancies = [];

  // Check 3-operation patterns (Read->Edit->Read)
  for (let i = 0; i < session.toolOperations.length - 2; i++) {
    const [op1, op2, op3] = session.toolOperations.slice(i, i + 3);

    // Read->Edit->Read same file pattern
    if (
      op1.name === 'Read' &&
      ['Edit', 'MultiEdit'].includes(op2.name) &&
      op3.name === 'Read' &&
      op1.input?.file_path === op2.input?.file_path &&
      op2.input?.file_path === op3.input?.file_path
    ) {
      // Phase-aware and context-aware filtering
      if (!isLegitimateVerification(op1, op2, op3, session.toolOperations, i) &&
          !isExplorationSequence(i, i + 2, phaseInfo)) {
        redundancies.push({
          type: 'unnecessary_re_read',
          filePattern: op1.input?.file_path,
          indices: [i, i + 1, i + 2],
          tools: [op1.name, op2.name, op3.name],
          _provenance: {
            patternType: 'redundant_sequence',
            detectionTimestamp: new Date().toISOString(),
            sessionId: session.sessionId,
            sourceFile: session._provenance?.sourceFile,
            confidenceLevel: 'high',
          },
        });
      }
    }

  }

  // Check 2-operation patterns (Bash->Bash)
  for (let i = 0; i < session.toolOperations.length - 1; i++) {
    const [op1, op2] = session.toolOperations.slice(i, i + 2);

    // Bash->Bash same command pattern (common in debugging)
    // Enhanced logic based on AI feedback: don't flag git workflow commands as redundant
    if (
      op1.name === 'Bash' &&
      op2.name === 'Bash' &&
      op1.input?.command === op2.input?.command &&
      op1.status !== 'error' && // Only flag if first command succeeded
      !isGitWorkflowSequence(op1, op2) && // Don't flag git workflow commands
      !isExplorationSequence(i, i + 1, phaseInfo) // Allow duplicate commands during exploration
    ) {
      redundancies.push({
        type: 'duplicate_bash_command',
        command: op1.input?.command,
        indices: [i, i + 1],
        tools: [op1.name, op2.name],
        _provenance: {
          patternType: 'redundant_sequence',
          detectionTimestamp: new Date().toISOString(),
          sessionId: session.sessionId,
          sourceFile: session._provenance?.sourceFile,
          confidenceLevel: 'medium',
        },
      });
    }
  }

  return redundancies;
}

/**
 * Determines if a Read->Edit->Read sequence is legitimate verification.
 * @param {object} readOp1 - First read operation
 * @param {object} editOp - Edit operation  
 * @param {object} readOp2 - Second read operation
 * @param {Array} allOperations - All operations in session
 * @param {number} sequenceStart - Index where sequence starts
 * @returns {boolean} True if this is legitimate verification
 */
function isLegitimateVerification(readOp1, editOp, _readOp2, _allOperations, _sequenceStart) {
  // Based on enhanced LLM-TDD feedback: "Add context awareness to redundantSequences - 
  // exempt Read operations immediately following Edit operations of same file"
  // "Root Cause: doesn't distinguish between verification reads vs actual redundant operations"
  
  // Don't allow verification for no-op edits (identical old/new strings)
  const oldString = editOp.input?.old_string;
  const newString = editOp.input?.new_string;
  
  // Handle null/undefined comparisons properly
  if (oldString !== null && newString !== null && oldString === newString) {
    return false; // No-op edits don't need verification - this is genuine redundancy
  }
  
  // If both are null/undefined, this might be a MultiEdit or other operation that still changed content
  // Don't flag as redundant based on string comparison alone

  // Standard Read→Edit→Read verification workflow should be allowed for successful edits
  if (editOp.status === 'success') {
    return true; // Any successful edit that changes content warrants verification
  }

  // Allow if this appears to be error recovery (checking edit results)
  if (editOp.status === 'error' || editOp.output?.includes?.('error')) {
    return true; // Checking results after problematic edit
  }

  // Default: flag as redundant if none of above conditions met  
  return false;
}

/**
 * Determines if two consecutive Bash operations are part of a git workflow.
 * Based on AI feedback: "Sequential git inspection commands are productive development workflow"
 * @param {object} op1 - First Bash operation
 * @param {object} op2 - Second Bash operation  
 * @returns {boolean} True if this appears to be git workflow
 */
function isGitWorkflowSequence(op1, op2) {
  // AI feedback shows git commands like "git status", "git diff --cached", "git diff" 
  // are being flagged as redundant, but they serve different inspection purposes
  
  // If commands are explicitly different git commands, don't flag as redundant
  const cmd1 = op1.input?.command;
  const cmd2 = op2.input?.command;
  
  if (cmd1 && cmd2) {
    // Both commands available - check if they're different git commands
    const isGit1 = cmd1.startsWith('git ');
    const isGit2 = cmd2.startsWith('git ');
    
    if (isGit1 && isGit2) {
      // Different git commands are productive workflow
      if (cmd1 !== cmd2) {
        return true; // Don't flag different git commands as redundant
      }
      
      // Same git command - check if it's a workflow sequence (status, diff variants)
      const gitWorkflowCommands = [
        'git status',
        'git diff',
        'git diff --cached',
        'git diff --staged',
        'git log',
        'git add',
        'git commit',
        'git push'
      ];
      
      return gitWorkflowCommands.includes(cmd1);
    }
  }
  
  // If commands are null/undefined (common issue from AI feedback), 
  // assume consecutive Bash operations in git workflow context are different
  // This handles the case where git commands aren't properly captured in input.command
  // LLM-TDD Fix: Exclude BashOutput-style monitoring operations from this permissive logic
  if ((!cmd1 || !cmd2) && (op1.status === 'success' && op2.status === 'success')) {
    // Check if these are monitoring operations (have bash_id but no command)
    const isBashOutputStyle1 = op1.input?.bash_id && !op1.input?.command;
    const isBashOutputStyle2 = op2.input?.bash_id && !op2.input?.command;
    
    // If both operations are BashOutput-style monitoring calls, they should be subject to redundancy detection
    // Don't give them git workflow exemption
    if (isBashOutputStyle1 && isBashOutputStyle2) {
      return false; // Allow redundancy detection for monitoring operations
    }
    
    // Based on AI feedback: operations 50-51 show git commands with null inputs being flagged
    // Conservative approach: don't flag consecutive successful Bash operations as redundant
    // when command details are missing (likely git workflow) - but only for non-monitoring operations
    return true;
  }
  
  return false; // Not git workflow - allow redundancy detection
}

/**
 * Determines if a sequence occurs during exploration phase where duplicate operations are normal.
 * @param {number} startIndex - Start index of the sequence
 * @param {number} endIndex - End index of the sequence
 * @param {Array} phaseInfo - Session phase information
 * @returns {boolean} True if sequence is part of exploration phase
 */
function isExplorationSequence(startIndex, endIndex, phaseInfo) {
  if (!phaseInfo || phaseInfo.length === 0) {
    return false; // No phase info, don't provide exploration exemption
  }

  // Check if any part of the sequence overlaps with exploration phase
  const relevantPhases = phaseInfo.filter(phase => 
    phase.type === 'exploration' &&
    !(phase.endIndex < startIndex || phase.startIndex > endIndex) // Phases that overlap
  );

  if (relevantPhases.length === 0) {
    return false; // Not in exploration phase
  }

  // Check if the exploration phase has high confidence
  const highConfidenceExploration = relevantPhases.some(phase => phase.confidence >= 0.6);
  
  return highConfidenceExploration;
}