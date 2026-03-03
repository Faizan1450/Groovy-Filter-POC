'use strict';

/**
 * src/bulk/bulkOrchestrator.js
 * ─────────────────────────────────────────────
 * Orchestrates the full bulk-process flow:
 *   1. Fetch all packages from the CPI tenant
 *   2. For each package, fetch all iflows
 *   3. For each iflow, download zip + process (same pipeline as /process)
 *   4. Collect all data → generate single Excel report
 *
 * Runs as fire-and-forget: called without await from the /bulk-process endpoint.
 * Errors on individual iflows are logged and skipped — execution always continues.
 */

const { fetchAllPackages } = require('./packageFetcher');
const { fetchIflowsForPackage } = require('./iflowFetcher');
const { downloadFromUrl } = require('../iflowDownloader');
const { loadAndExtractIflw, readGroovyFromZip } = require('../zipProcessor');
const { parseIflw } = require('../iflwParser');
const { scanGroovyContent } = require('../groovyScanner');
const { generateExcel } = require('../reporter');

const DIV = '─'.repeat(65);

/** Pause execution for `ms` milliseconds. */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main bulk processing entry point.
 * @param {string} token - Valid OAuth2 bearer token
 */
async function runBulkProcess(token) {
    const iflowDataList = [];
    let totalSucceeded = 0;
    let totalFailed = 0;

    // ── Step 1: Fetch all packages ─────────────────────────────────────────
    let packages;
    try {
        packages = await fetchAllPackages(token);
        console.log(`\n✅  All Packages List Fetched (${packages.length} packages)\n`);
    } catch (err) {
        console.log(`❌  Failed to fetch package list: ${err.message}`);
        return;
    }

    // ── Step 2: Process each package ───────────────────────────────────────
    for (const pkg of packages) {
        console.log(`\nProcessing Package: ${pkg.packageName}`);

        // Fetch iflows for this package
        let iflows = [];
        try {
            iflows = await fetchIflowsForPackage(pkg.iflowsUrl, token);

        } catch (err) {
            const msg = err.message || 'Unknown error';
            console.log(`    ❌  Failed to fetch iflow list: ${msg}`);

            // Add a placeholder row so the failure is visible in Excel
            iflowDataList.push({
                packageName: pkg.packageName,
                iflowName: '-',
                errorMessage: `Failed to fetch iflow list: ${msg}`,
            });
            totalFailed++;

            await sleep(500);
            continue;
        }

        if (iflows.length === 0) {
            console.log(`  ⚠️  No iflows in this package`);
            await sleep(500);
            continue;
        }

        // ── Step 3: Process each iflow in this package ─────────────────────
        for (const iflow of iflows) {
            const displayName = iflow.iflowName || iflow.iflowId;
            console.log(`🚀  ${displayName}`);

            try {
                // Download zip buffer using the full URL from iflow discovery
                const buffer = await downloadFromUrl(iflow.downloadUrl, token);

                // Extract .iflw + detect script folder
                const { zip, iflwContent, hasScriptFolder } = loadAndExtractIflw(buffer, displayName);

                // Parse .iflw → get valid groovy script names
                const { scripts, totalFound, skipped } = await parseIflw(iflwContent);



                // Scan each groovy script in-memory
                const results = scripts.map((scriptName) => {
                    const { found, content } = readGroovyFromZip(zip, scriptName);
                    return scanGroovyContent(scriptName, found, content);
                });

                iflowDataList.push({
                    packageName: pkg.packageName,
                    iflowName: displayName,
                    totalFound,
                    skipped,
                    scripts,
                    hasScriptFolder,
                    results,
                });

                totalSucceeded++;

            } catch (err) {
                const msg = err.message || 'Unknown error';
                console.log(`  ❌  ${displayName}: ${msg}`);

                iflowDataList.push({
                    packageName: pkg.packageName,
                    iflowName: displayName,
                    errorMessage: msg,
                });

                totalFailed++;
            }
        }

        // ── 500ms gap between packages to avoid rate limiting ───────────────
        await sleep(500);
    }

    // ── Step 4: Generate Excel report ──────────────────────────────────────
    let excelPath = '';
    try {
        excelPath = await generateExcel(iflowDataList);
        console.log(`\n📊  Excel report saved: ${excelPath}`);
    } catch (err) {
        console.log(`\n⚠️   Excel generation failed: ${err.message}`);
    }

    // ── Final summary ───────────────────────────────────────────────────────
    console.log(`\n${'='.repeat(65)}`);
    console.log(`  🏁  Bulk complete. Succeeded: ${totalSucceeded} | Failed: ${totalFailed}`);
    console.log(`${'='.repeat(65)}\n`);
}

module.exports = { runBulkProcess };
