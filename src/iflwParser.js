'use strict';

/**
 * src/iflwParser.js
 * ─────────────────────────────────────────────
 * Parses a .iflw XML string and extracts groovy script names
 * from callActivity elements inside ALL process definitions.
 *
 * Rules:
 *  - callActivity must have key "script"           → gives the .groovy filename
 *  - callActivity must have key "scriptBundleId"   → if value = "GS_Shared_Collection", SKIP
 *
 * NOTE: An iflow can have multiple <bpmn2:process> elements.
 * We iterate over ALL of them to ensure no scripts are missed.
 */

const xml2js = require('xml2js');

const SHARED_COLLECTION = 'GS_Shared_Collection';

/**
 * @param {string} xmlContent - Raw XML content of the .iflw file
 * @returns {Promise<{ scripts: string[], totalFound: number, skipped: number }>}
 */
async function parseIflw(xmlContent) {
    const parser = new xml2js.Parser({
        explicitArray: false,
        tagNameProcessors: [stripNamespace],
    });

    const result = await parser.parseStringPromise(xmlContent);

    const definitions = result['definitions'];
    if (!definitions) {
        throw new Error('Unexpected .iflw structure: missing <definitions> element.');
    }

    // ── Normalize process to an array ──────────────────────────────────────
    // With explicitArray:false, xml2js returns:
    //   - a plain object  → if the iflow has exactly ONE <process>
    //   - an array        → if the iflow has MULTIPLE <process> elements
    // We must handle both.
    const rawProcess = definitions['process'];
    if (!rawProcess) {
        throw new Error('Unexpected .iflw structure: missing <process> element inside definitions.');
    }
    const processes = Array.isArray(rawProcess) ? rawProcess : [rawProcess];

    const validScripts = [];
    let totalScriptActivities = 0;
    let skippedCount = 0;

    // ── Iterate over every process ──────────────────────────────────────────
    for (const process of processes) {
        const allCallActivities = collectCallActivities(process);

        for (const ca of allCallActivities) {
            const propMap = buildPropMap(ca);

            // Only process Groovy Script activities (must have a "script" property)
            if (!propMap['script']) continue;

            totalScriptActivities++;

            const scriptName = propMap['script'];
            const bundleId = propMap['scriptBundleId'] || '';

            // Skip shared collection scripts
            if (bundleId === SHARED_COLLECTION) {
                skippedCount++;
                continue;
            }

            // Collect, avoid duplicates
            if (!validScripts.includes(scriptName)) {
                validScripts.push(scriptName);
            }
        }
    }

    return {
        scripts: validScripts,
        totalFound: totalScriptActivities,
        skipped: skippedCount,
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Collects all callActivity elements from a process object,
 * including those nested inside subProcess elements.
 *
 * @param {object} process
 * @returns {object[]}
 */
function collectCallActivities(process) {
    let callActivities = [];

    // Top-level callActivities
    if (process['callActivity']) {
        const ca = process['callActivity'];
        callActivities = callActivities.concat(Array.isArray(ca) ? ca : [ca]);
    }

    // Nested inside subProcess
    if (process['subProcess']) {
        const subProcesses = Array.isArray(process['subProcess'])
            ? process['subProcess']
            : [process['subProcess']];

        for (const sp of subProcesses) {
            if (sp['callActivity']) {
                const spca = Array.isArray(sp['callActivity'])
                    ? sp['callActivity']
                    : [sp['callActivity']];
                callActivities = callActivities.concat(spca);
            }
        }
    }

    return callActivities;
}

/**
 * Builds a { key: value } map from a callActivity's extensionElements.property array.
 *
 * @param {object} callActivity
 * @returns {object}
 */
function buildPropMap(callActivity) {
    const propMap = {};
    const extElements = callActivity['extensionElements'];
    if (!extElements) return propMap;

    let properties = extElements['property'];
    if (!properties) return propMap;
    if (!Array.isArray(properties)) properties = [properties];

    for (const prop of properties) {
        const key = prop['key'];
        const value = prop['value'] || '';
        if (key) propMap[key] = value;
    }

    return propMap;
}

/**
 * Strips XML namespace prefixes from tag names.
 * e.g. "bpmn2:callActivity" → "callActivity"
 */
function stripNamespace(name) {
    return name.includes(':') ? name.split(':').pop() : name;
}

module.exports = { parseIflw };
