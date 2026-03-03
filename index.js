'use strict';

/**
 * index.js — V4 Entry Point
 * ─────────────────────────────────────────────
 * Express server exposing:
 *
 *   POST /process
 *   Body: { "iflows": ["IflowName1", "IflowName2", ...] }
 *   → Downloads, processes, and exports named iflows to Excel (synchronous)
 *
 *   POST /bulk-process
 *   Body: none
 *   → Discovers ALL packages + iflows from the entire CPI tenant,
 *     processes them all, and exports to Excel (fire-and-forget, returns 202)
 *
 *   GET /health
 */

const express = require('express');
const { getToken } = require('./src/authService');
const { downloadIflowZip } = require('./src/iflowDownloader');
const { loadAndExtractIflw, readGroovyFromZip } = require('./src/zipProcessor');
const { parseIflw } = require('./src/iflwParser');
const { scanGroovyContent } = require('./src/groovyScanner');
const { generateExcel } = require('./src/reporter');
const { runBulkProcess } = require('./src/bulk/bulkOrchestrator');

const app = express();
const PORT = 3000;
app.use(express.json());

const DIV = '─'.repeat(65);

// ── POST /process ──────────────────────────────────────────────────────────
app.post('/process', async (req, res) => {
    const { iflows } = req.body;

    if (!iflows || !Array.isArray(iflows) || iflows.length === 0) {
        return res.status(400).json({
            message: 'Request body must contain a non-empty "iflows" array.',
            example: { iflows: ['IflowName1', 'IflowName2'] },
        });
    }

    console.log(`\n📥  Received request to process ${iflows.length} iflow(s)\n`);

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

    const iflowDataList = [];
    const failed = [];
    let succeededCount = 0;

    for (const iflowName of iflows) {
        console.log(DIV);
        console.log(`🚀  Processing iflow: ${iflowName}\n`);

        try {
            const buffer = await downloadIflowZip(iflowName, token);
            const { zip, iflwContent, hasScriptFolder } = loadAndExtractIflw(buffer, iflowName);
            const { scripts, totalFound, skipped } = await parseIflw(iflwContent);

            console.log(`  📊  Script activities in .iflw : ${totalFound}`);
            console.log(`  ⏭️   Skipped (GS_Shared_Coll.) : ${skipped}`);
            console.log(`  ✅  Valid scripts to scan       : ${scripts.length}`);

            if (!hasScriptFolder) {
                console.log(`  ⚠️   No script folder found in zip.`);
            } else if (scripts.length === 0) {
                console.log(`  ⚠️   No valid groovy scripts to process.`);
            }

            const results = scripts.map((scriptName) => {
                const { found, content } = readGroovyFromZip(zip, scriptName);
                return scanGroovyContent(scriptName, found, content);
            });

            iflowDataList.push({
                packageName: '-',
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
            iflowDataList.push({ packageName: '-', iflowName, errorMessage: msg });
        }

        console.log('');
    }

    let excelPath = '';
    try {
        excelPath = await generateExcel(iflowDataList);
        console.log(`\n📊  Excel report saved: ${excelPath}`);
    } catch (err) {
        console.log(`\n⚠️   Excel generation failed: ${err.message}`);
    }

    console.log(`\n${DIV}`);
    console.log(`  🏁  All iflows processed.`);
    console.log(`      Succeeded: ${succeededCount} | Failed: ${failed.length}`);
    console.log(`${'='.repeat(65)}\n`);

    return res.status(200).json({
        message: excelPath
            ? `Processing complete. Report saved to: ${excelPath}`
            : 'Processing complete. Excel generation failed — check server logs.',
        processed: succeededCount,
        ...(failed.length > 0 && { failed }),
    });
});

// ── POST /bulk-process ─────────────────────────────────────────────────────
app.post('/bulk-process', async (req, res) => {
    console.log(`\n📥  Bulk-process request received — discovering all CPI packages & iflows...\n`);

    let token;
    try {
        token = await getToken();
    } catch (err) {
        return res.status(500).json({
            message: `Authentication failed: ${err.message}`,
        });
    }

    // Return 202 immediately — processing runs in background
    res.status(202).json({
        message: 'Bulk processing started. Monitor server console for progress. Excel report will be saved to the output/ folder when complete.',
        startedAt: new Date().toISOString(),
    });

    // Fire-and-forget — process without blocking the response
    setImmediate(() => {
        runBulkProcess(token).catch((err) => {
            console.log(`\n❌  Bulk process crashed: ${err.message}`);
        });
    });
});

// ── GET /health ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: 'v4' });
});

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(65)}`);
    console.log(`  🚀  SAP CPI Groovy Filter — V4`);
    console.log(`  🌐  Server running at http://localhost:${PORT}`);
    console.log(`  📮  POST http://localhost:${PORT}/process`);
    console.log(`  �  POST http://localhost:${PORT}/bulk-process`);
    console.log(`${'='.repeat(65)}\n`);
});
