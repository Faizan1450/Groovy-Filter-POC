'use strict';

/**
 * src/zipProcessor.js
 * ─────────────────────────────────────────────
 * Takes an in-memory Buffer (the downloaded iflow zip) and extracts:
 *   1. The .iflw file content (as XML string)
 *   2. A specific groovy script's content (as string)
 *
 * Nothing is written to disk. All processing done in-memory via AdmZip.
 *
 * Expected zip structure:
 *   <root>/src/main/resources/scenarioflows/integrationflow/*.iflw
 *   <root>/src/main/resources/script/*.groovy   ← may not exist in all iflows
 */

const AdmZip = require('adm-zip');

/**
 * Loads zip from buffer and finds the .iflw XML content.
 *
 * @param {Buffer} buffer    - Raw zip buffer from iflowDownloader
 * @param {string} iflowName - Used for error messages only
 * @returns {{ zip: AdmZip, iflwContent: string, hasScriptFolder: boolean }}
 */
function loadAndExtractIflw(buffer, iflowName) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error(`Invalid or empty zip buffer received for iflow: ${iflowName}`);
    }

    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Find the .iflw file
    const iflwEntry = entries.find(
        (e) => !e.isDirectory && e.entryName.endsWith('.iflw')
    );
    if (!iflwEntry) {
        throw new Error(`No .iflw file found inside the zip for iflow: ${iflowName}`);
    }

    console.log(`  📄  Found .iflw: ${iflwEntry.entryName.split('/').pop()}`);
    const iflwContent = iflwEntry.getData().toString('utf-8');

    // Check whether a script folder exists in this zip
    const hasScriptFolder = entries.some(
        (e) => e.entryName.includes('/script/') || e.entryName.startsWith('script/')
    );

    return { zip, iflwContent, hasScriptFolder };
}

/**
 * Reads a specific groovy script from the in-memory zip.
 *
 * @param {AdmZip} zip        - AdmZip instance
 * @param {string} scriptName - Groovy file name, e.g. "StringReplacer.groovy"
 * @returns {{ found: boolean, content: string }}
 */
function readGroovyFromZip(zip, scriptName) {
    const entries = zip.getEntries();

    const entry = entries.find(
        (e) =>
            !e.isDirectory &&
            (e.entryName.endsWith(`/script/${scriptName}`) ||
                e.entryName === `script/${scriptName}`)
    );

    if (!entry) {
        return { found: false, content: '' };
    }

    const content = entry.getData().toString('utf-8');
    return { found: true, content };
}

module.exports = { loadAndExtractIflw, readGroovyFromZip };
