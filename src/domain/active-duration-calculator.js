/**
 * Active Duration Calculator
 * Calculates the actual development time by excluding long user response gaps
 */

/**
 * Calculate active duration by analyzing conversation timestamps
 * Excludes gaps longer than a threshold (indicating user break/overnight/etc)
 * 
 * @param {Array} conversation - Array of conversation entries with timestamps
 * @param {Object} options - Configuration options
 * @param {number} options.maxGapMinutes - Maximum gap before considering it a break (default: 30 minutes)
 * @param {number} options.minActiveSeconds - Minimum session time to consider valid (default: 30 seconds)
 * @returns {Object} Duration analysis
 */
export function calculateActiveDuration(conversation, options = {}) {
    const {
        maxGapMinutes = 30,
        minActiveSeconds = 30
    } = options;

    if (!conversation || conversation.length === 0) {
        return {
            activeDurationSeconds: 0,
            rawDurationSeconds: 0,
            activeSegments: [],
            excludedGaps: [],
            confidence: 'low',
            metadata: { reason: 'no conversation data' }
        };
    }

    // Filter entries with valid timestamps and sort chronologically
    const timestampedEntries = conversation
        .filter(entry => entry.timestamp)
        .map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

    if (timestampedEntries.length < 2) {
        return {
            activeDurationSeconds: 0,
            rawDurationSeconds: 0,
            activeSegments: [],
            excludedGaps: [],
            confidence: 'low',
            metadata: { reason: 'insufficient timestamp data' }
        };
    }

    const startTime = timestampedEntries[0].timestamp;
    const endTime = timestampedEntries[timestampedEntries.length - 1].timestamp;
    const rawDurationSeconds = (endTime - startTime) / 1000;

    // Find active segments by analyzing gaps between messages
    const maxGapMs = maxGapMinutes * 60 * 1000;
    const activeSegments = [];
    const excludedGaps = [];
    
    let currentSegmentStart = startTime;
    let totalActiveTime = 0;

    for (let i = 1; i < timestampedEntries.length; i++) {
        const prevEntry = timestampedEntries[i - 1];
        const currentEntry = timestampedEntries[i];
        const gapMs = currentEntry.timestamp - prevEntry.timestamp;
        const gapMinutes = gapMs / (1000 * 60);

        if (gapMs > maxGapMs) {
            // Long gap detected - end current segment
            const segmentDuration = (prevEntry.timestamp - currentSegmentStart) / 1000;
            if (segmentDuration > minActiveSeconds) {
                const messageCount = i - activeSegments.reduce((sum, seg) => sum + (seg.messageCount || 0), 0);
                activeSegments.push({
                    start: currentSegmentStart,
                    end: prevEntry.timestamp,
                    durationSeconds: segmentDuration,
                    messageCount: messageCount
                });
                totalActiveTime += segmentDuration;
            }

            excludedGaps.push({
                start: prevEntry.timestamp,
                end: currentEntry.timestamp,
                durationMinutes: Math.round(gapMinutes),
                reason: gapMinutes > 60 ? 'likely break/overnight' : 'extended pause'
            });

            // Start new segment
            currentSegmentStart = currentEntry.timestamp;
        }
    }

    // Add final segment
    const finalSegmentDuration = (endTime - currentSegmentStart) / 1000;
    if (finalSegmentDuration > minActiveSeconds) {
        const remainingMessages = timestampedEntries.length - activeSegments.reduce((sum, seg) => sum + (seg.messageCount || 0), 0);
        activeSegments.push({
            start: currentSegmentStart,
            end: endTime,
            durationSeconds: finalSegmentDuration,
            messageCount: remainingMessages
        });
        totalActiveTime += finalSegmentDuration;
    }

    // Determine confidence level
    let confidence = 'high';
    const timeReduction = 1 - (totalActiveTime / rawDurationSeconds);
    
    if (excludedGaps.length === 0) {
        confidence = rawDurationSeconds > 3600 ? 'medium' : 'high'; // Long sessions without gaps might still include breaks
    } else if (timeReduction > 0.8) {
        confidence = 'medium'; // Very large reductions might indicate aggressive filtering
    } else if (timestampedEntries.length < 10) {
        confidence = 'medium'; // Low message count reduces confidence
    }

    return {
        activeDurationSeconds: Math.round(totalActiveTime),
        rawDurationSeconds: Math.round(rawDurationSeconds),
        activeSegments,
        excludedGaps,
        confidence,
        metadata: {
            totalMessages: timestampedEntries.length,
            activeSegmentCount: activeSegments.length,
            excludedGapCount: excludedGaps.length,
            timeReduction: Math.round(timeReduction * 100),
            maxGapMinutes,
            analysis: generateAnalysisText(activeSegments, excludedGaps, timeReduction)
        }
    };
}

/**
 * Generate human-readable analysis text
 * @param {Array} activeSegments - Active segments
 * @param {Array} excludedGaps - Excluded gaps
 * @param {number} timeReduction - Percentage of time reduced
 * @returns {string} Analysis text
 */
function generateAnalysisText(activeSegments, excludedGaps, timeReduction) {
    if (excludedGaps.length === 0) {
        return 'Continuous session with no significant breaks detected';
    }

    const totalBreakTime = excludedGaps.reduce((sum, gap) => sum + gap.durationMinutes, 0);
    const longestBreak = Math.max(...excludedGaps.map(gap => gap.durationMinutes));
    
    let analysis = `Detected ${excludedGaps.length} break${excludedGaps.length > 1 ? 's' : ''} totaling ${totalBreakTime} minutes`;
    
    if (longestBreak > 60) {
        analysis += ` (longest: ${Math.round(longestBreak / 60)}h)`;
    } else {
        analysis += ` (longest: ${longestBreak}m)`;
    }
    
    if (timeReduction > 0.5) {
        analysis += '. Significant improvement in active duration accuracy';
    } else if (timeReduction > 0.2) {
        analysis += '. Moderate improvement in duration accuracy';
    } else {
        analysis += '. Minor adjustments to duration';
    }
    
    return analysis;
}

/**
 * Format active duration for display
 * @param {Object} durationAnalysis - Result from calculateActiveDuration
 * @returns {string} Formatted duration string
 */
export function formatActiveDuration(durationAnalysis) {
    if (!durationAnalysis || durationAnalysis.activeDurationSeconds === 0) {
        return '0m (no active time detected)';
    }
    
    const seconds = durationAnalysis.activeDurationSeconds;
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    let formatted = '';
    if (hours > 0) formatted += `${hours}h `;
    if (remainingMinutes > 0) formatted += `${remainingMinutes}m `;
    if (remainingSeconds > 0 && hours === 0) formatted += `${remainingSeconds}s`;
    
    // Add confidence indicator
    const confidenceIcon = {
        'high': '✓',
        'medium': '~',
        'low': '?'
    }[durationAnalysis.confidence] || '?';
    
    return `${formatted.trim()} ${confidenceIcon}`;
}