'use strict';

/**
 * index.js — V3 Entry Point
 * ─────────────────────────────────────────────
 * Express server exposing:
 *   POST /process
 *   Body: { "iflows": ["IflowName1", "IflowName2", ...] }
 *
 * For each iflow:
 *   1. Download zip from SAP CPI (in-memory, no disk write)
 *   2. Extract .iflw XML, detect script folder presence
 *   3. Parse iflw → resolve valid groovy script names
 *   4. Read + scan each groovy for "string" lines (case-insensitive)
 *   5. Collect structured data for all iflows
 *   6. Export Excel report to output/
 *
 * Response:
 *   { message, processed, failed }
 */

const express = require('express');
const { getToken } = require('./src/authService');
const { downloadIflowZip } = require('./src/iflowDownloader');
const { loadAndExtractIflw, readGroovyFromZip } = require('./src/zipProcessor');
const { parseIflw } = require('./src/iflwParser');
const { scanGroovyContent } = require('./src/groovyScanner');
const { generateExcel } = require('./src/reporter');

const app = express();
const PORT = 3000;
app.use(express.json());

const DIV = '─'.repeat(65);

// ── POST /process ──────────────────────────────────────────────────────────
app.post('/process', async (req, res) => {
    const { iflows } = req.body;

    // ── Input validation ──
    if (!iflows || !Array.isArray(iflows) || iflows.length === 0) {
        return res.status(400).json({
            message: 'Request body must contain a non-empty "iflows" array.',
            example: { iflows: ['IflowName1', 'IflowName2'] },
        });
    }

    console.log(`\n📥  Received request to process ${iflows.length} iflow(s)\n`);

    // ── Step 1: Get OAuth token (cached, shared across all iflows) ──
    let token;
    try {
        token = await getToken();
    } catch (err) {
        return res.status(500).json({
            message: `Authentication failed: ${err.message}`,
            processed: 0,
            failed: [{ iflowName: 'N/A', errorMessage: err.message }],
        });
    }

    const iflowDataList = []; // structured data passed to Excel reporter
    const failed = [];
    let succeededCount = 0;

    // ── Process each iflow ──────────────────────────────────────────────────
    for (const iflowName of iflows) {
        console.log(DIV);
        console.log(`🚀  Processing iflow: ${iflowName}\n`);

        try {
            // Step 2: Download zip → in-memory Buffer
            const buffer = await downloadIflowZip(iflowName, token);

            // Step 3: Load zip, find .iflw, detect script folder
            const { zip, iflwContent, hasScriptFolder } = loadAndExtractIflw(buffer, iflowName);

            // Step 4: Parse .iflw — extract valid groovy names
            const { scripts, totalFound, skipped } = await parseIflw(iflwContent);

            console.log(`  📊  Script activities in .iflw : ${totalFound}`);
            console.log(`  ⏭️   Skipped (GS_Shared_Coll.) : ${skipped}`);
            console.log(`  ✅  Valid scripts to scan       : ${scripts.length}`);

            if (!hasScriptFolder) {
                console.log(`  ⚠️   No script folder found in zip.`);
            } else if (scripts.length === 0) {
                console.log(`  ⚠️   No valid groovy scripts to process.`);
            }

            // Step 5: Scan each groovy (in-memory)
            const results = scripts.map((scriptName) => {
                const { found, content } = readGroovyFromZip(zip, scriptName);
                return scanGroovyContent(scriptName, found, content);
            });

            iflowDataList.push({
                iflowName,
                totalFound,
                skipped,
                scripts,
                hasScriptFolder,
                results,
            });

            succeededCount++;

        } catch (err) {
            const msg = err.message || 'Unknown error';
            console.log(`  ❌  Failed: ${msg}`);
            failed.push({ iflowName, errorMessage: msg });

            // Still add an error row to the Excel report
            iflowDataList.push({
                iflowName,
                errorMessage: msg,
            });
        }

        console.log('');
    }

    // ── Step 6: Generate Excel report ──────────────────────────────────────
    let excelPath = '';
    try {
        excelPath = await generateExcel(iflowDataList);
        console.log(`\n📊  Excel report saved: ${excelPath}`);
    } catch (err) {
        console.log(`\n⚠️   Excel generation failed: ${err.message}`);
    }

    // ── Final console summary ───────────────────────────────────────────────
    console.log(`\n${DIV}`);
    console.log(`  🏁  All iflows processed.`);
    console.log(`      Succeeded: ${succeededCount} | Failed: ${failed.length}`);
    console.log(`${'='.repeat(65)}\n`);

    // ── Response ────────────────────────────────────────────────────────────
    return res.status(200).json({
        message: excelPath
            ? `Processing complete. Report saved to: ${excelPath}`
            : 'Processing complete. Excel generation failed — check server logs.',
        processed: succeededCount,
        ...(failed.length > 0 && { failed }),
    });
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: 'v3' });
});

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(65)}`);
    console.log(`  🚀  SAP CPI Groovy Filter — V3`);
    console.log(`  🌐  Server running at http://localhost:${PORT}`);
    console.log(`  📮  POST http://localhost:${PORT}/process`);
    console.log(`  💡  Body: { "iflows": ["IflowName1", "IflowName2"] }`);
    console.log(`${'='.repeat(65)}\n`);
});
