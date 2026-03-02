'use strict';

/**
 * src/groovyScanner.js
 * ─────────────────────────────────────────────
 * Scans groovy file content (as string) for lines containing
 * "string" in a case-insensitive way.
 */

/**
 * Scans a single groovy file's content for matching lines.
 *
 * @param {string} scriptName    - The groovy file name (for display)
 * @param {boolean} found        - Whether the file was found in the zip
 * @param {string} fileContent   - Raw file content as string (empty if not found)
 * @returns {{ scriptName: string, found: boolean, lineCount: number, matches: Array }}
 */
function scanGroovyContent(scriptName, found, fileContent) {
    if (!found) {
        return { scriptName, found: false, lineCount: 0, matches: [] };
    }

    const lines = fileContent.split('\n');
    const matches = [];

    lines.forEach((line, index) => {
        // Case-insensitive substring check for "string"
        if (line.toLowerCase().includes('string')) {
            matches.push({
                lineNumber: index + 1, // 1-indexed
                content: line,
            });
        }
    });

    return {
        scriptName,
        found: true,
        lineCount: matches.length,
        matches,
    };
}

module.exports = { scanGroovyContent };
