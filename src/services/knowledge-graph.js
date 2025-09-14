/**
 * @file Knowledge Graph Service
 * Manages cross-session connections and patterns for enhanced learning
 * Provides abstraction layer for graph storage and querying operations
 */

import { readFileContent, writeFileContent, pathExists } from '../infrastructure/file-utils.js';
import { getReportsDir } from '../config.js';
import path from 'path';

/**
 * Knowledge Graph Service - Manages cross-session connections and patterns
 * Provides abstraction layer for graph storage and querying operations
 */
export class KnowledgeGraph {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null; // Lazy loaded
  }

  /**
   * Find sessions with similar concepts or error patterns
   * @param {Array<string>} concepts - Concepts to match against
   * @param {Array<string>} errors - Error patterns to match against
   * @returns {Array} Array of similar sessions with overlap scores
   */
  async findSimilarSessions(concepts = [], errors = []) {
    await this._ensureLoaded();
    
    const results = [];
    const allSessions = Object.entries(this.data.sessions || {});
    
    for (const [sessionId, sessionData] of allSessions) {
      const score = this._calculateSimilarityScore(
        { concepts, errors }, 
        sessionData
      );
      
      if (score > 0) {
        results.push({
          sessionId,
          project: sessionData.project,
          concepts: sessionData.concepts,
          errors: sessionData.errors,
          solutions: sessionData.solutions,
          similarityScore: score
        });
      }
    }
    
    return results.sort((a, b) => b.similarityScore - a.similarityScore);
  }

  /**
   * Get historical solutions for similar error patterns
   * @param {string} errorPattern - Error pattern to search for
   * @param {Array<string>} contextConcepts - Additional context concepts
   * @returns {Array} Array of solutions with context
   */
  async getSolutionsForError(errorPattern, contextConcepts = []) {
    await this._ensureLoaded();
    
    const solutions = [];
    const errorLower = errorPattern.toLowerCase();
    
    Object.entries(this.data.sessions || {}).forEach(([sessionId, sessionData]) => {
      // Check if session had similar error
      const hasMatchingError = sessionData.errors.some(error => 
        error.toLowerCase().includes(errorLower) || 
        errorLower.includes(error.toLowerCase())
      );
      
      if (hasMatchingError && sessionData.solutions.length > 0) {
        // Calculate context relevance
        const contextRelevance = this._calculateContextRelevance(
          contextConcepts, 
          sessionData.concepts
        );
        
        sessionData.solutions.forEach(solution => {
          solutions.push({
            solution,
            sessionId,
            project: sessionData.project,
            context: sessionData.concepts,
            relevanceScore: contextRelevance,
            errorMatched: sessionData.errors.find(e => 
              e.toLowerCase().includes(errorLower) || 
              errorLower.includes(e.toLowerCase())
            )
          });
        });
      }
    });
    
    return solutions.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Add connections for a session
   * @param {string} sessionId - Session identifier
   * @param {Object} connections - Extracted concepts, errors, solutions
   */
  async addSessionConnections(sessionId, connections) {
    await this._ensureLoaded();
    
    // Initialize data structure if needed
    if (!this.data.sessions) {
      this.data.sessions = {};
    }
    
    // Store session connections
    this.data.sessions[sessionId] = {
      concepts: connections.concepts || [],
      errors: connections.errors || [],
      solutions: connections.solutions || [],
      project: connections.project || 'unknown',
      timestamp: new Date().toISOString()
    };
    
    // Update indexes for fast lookups
    this._updateIndexes(sessionId, connections);
    
    // Persist to file
    await this._save();
  }

  // Private implementation methods
  async _ensureLoaded() {
    if (this.data === null) {
      if (await pathExists(this.filePath)) {
        try {
          const content = await readFileContent(this.filePath);
          this.data = JSON.parse(content);
        } catch (parseError) {
          console.warn('⚠️ Knowledge graph file corrupted, creating backup and starting fresh:', parseError.message);
          
          // Create backup of corrupted file
          try {
            const backupPath = `${this.filePath}.corrupted-${Date.now()}`;
            const content = await readFileContent(this.filePath);
            await writeFileContent(backupPath, content);
            console.log(`📁 Corrupted file backed up to: ${backupPath}`);
          } catch (backupError) {
            console.warn('Failed to backup corrupted file:', backupError.message);
          }
          
          // Initialize with empty structure
          this.data = { sessions: {}, indexes: { concepts: {}, errors: {} } };
        }
      } else {
        this.data = { sessions: {}, indexes: { concepts: {}, errors: {} } };
      }
    }
  }

  async _save() {
    try {
      const jsonString = JSON.stringify(this.data, null, 2);
      await writeFileContent(this.filePath, jsonString);
    } catch (stringifyError) {
      console.warn('⚠️ Failed to save knowledge graph due to JSON serialization error:', stringifyError.message);
      
      // Try to save a cleaned version by filtering out problematic entries
      try {
        const cleanedData = this._createCleanedData();
        const jsonString = JSON.stringify(cleanedData, null, 2);
        await writeFileContent(this.filePath, jsonString);
        console.log('✅ Saved knowledge graph with problematic entries removed');
      } catch (fallbackError) {
        console.warn('❌ Even fallback save failed:', fallbackError.message);
        // Don't throw - let the process continue
      }
    }
  }

  _createCleanedData() {
    const cleanedData = {
      sessions: {},
      indexes: { concepts: {}, errors: {} }
    };

    // Try to copy each session, skipping problematic ones
    for (const [sessionId, sessionData] of Object.entries(this.data.sessions || {})) {
      try {
        // Test if this session can be serialized
        JSON.stringify(sessionData);
        cleanedData.sessions[sessionId] = sessionData;
      } catch (sessionError) {
        console.warn(`Skipping problematic session ${sessionId}:`, sessionError.message);
        // Skip this session but continue with others
      }
    }

    // Rebuild indexes from cleaned sessions
    for (const [sessionId, sessionData] of Object.entries(cleanedData.sessions)) {
      // Index concepts
      sessionData.concepts?.forEach(concept => {
        if (!cleanedData.indexes.concepts[concept]) {
          cleanedData.indexes.concepts[concept] = [];
        }
        if (!cleanedData.indexes.concepts[concept].includes(sessionId)) {
          cleanedData.indexes.concepts[concept].push(sessionId);
        }
      });
      
      // Index errors
      sessionData.errors?.forEach(error => {
        if (!cleanedData.indexes.errors[error]) {
          cleanedData.indexes.errors[error] = [];
        }
        if (!cleanedData.indexes.errors[error].includes(sessionId)) {
          cleanedData.indexes.errors[error].push(sessionId);
        }
      });
    }

    return cleanedData;
  }

  _calculateSimilarityScore(query, sessionData) {
    let score = 0;
    
    // Concept overlap
    const conceptOverlap = query.concepts.filter(concept =>
      sessionData.concepts.some(sc => 
        sc.toLowerCase().includes(concept.toLowerCase()) ||
        concept.toLowerCase().includes(sc.toLowerCase())
      )
    ).length;
    score += conceptOverlap * 2; // 2 points per concept match
    
    // Error pattern overlap  
    const errorOverlap = query.errors.filter(error =>
      sessionData.errors.some(se => 
        se.toLowerCase().includes(error.toLowerCase()) ||
        error.toLowerCase().includes(se.toLowerCase())
      )
    ).length;
    score += errorOverlap * 3; // 3 points per error match (more valuable)
    
    return score;
  }

  _calculateContextRelevance(queryConcepts, sessionConcepts) {
    if (queryConcepts.length === 0) return 1; // Default relevance
    
    const matches = queryConcepts.filter(concept =>
      sessionConcepts.some(sc => 
        sc.toLowerCase().includes(concept.toLowerCase()) ||
        concept.toLowerCase().includes(sc.toLowerCase())
      )
    ).length;
    
    return matches / queryConcepts.length; // Relevance ratio
  }

  _updateIndexes(sessionId, connections) {
    if (!this.data.indexes) {
      this.data.indexes = { concepts: {}, errors: {} };
    }
    
    // Index concepts
    connections.concepts?.forEach(concept => {
      if (!this.data.indexes.concepts[concept]) {
        this.data.indexes.concepts[concept] = [];
      }
      if (!this.data.indexes.concepts[concept].includes(sessionId)) {
        this.data.indexes.concepts[concept].push(sessionId);
      }
    });
    
    // Index errors
    connections.errors?.forEach(error => {
      if (!this.data.indexes.errors[error]) {
        this.data.indexes.errors[error] = [];
      }
      if (!this.data.indexes.errors[error].includes(sessionId)) {
        this.data.indexes.errors[error].push(sessionId);
      }
    });
  }
}

/**
 * Get file path for knowledge graph data
 * @returns {string} Path to knowledge graph file
 */
export function getKnowledgeGraphPath() {
  return path.join(getReportsDir(), 'knowledge-connections.json');
}