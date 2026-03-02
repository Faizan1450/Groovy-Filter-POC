'use strict';

/**
 * src/reporter.js
 * ─────────────────────────────────────────────
 * Builds and saves an Excel report for all processed iflows.
 *
 * Excel columns (one row per groovy script):
 *   A: Iflow Name
 *   B: Total Groovy Found        (totalFound — all script activities in .iflw)
 *   C: Global GS Count           (GS_Shared_Collection scripts — skipped)
 *   D: Local GS Count            (valid scripts that were scanned)
 *   E: Local GS Name             (the .groovy file name)
 *   F: Lines Containing "String" (line numbers + trimmed content, \n-separated)
 *   G: Comments
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

// ── Column definitions ────────────────────────────────────────────────────
const COLUMNS = [
    { header: 'Iflow Name', key: 'iflowName', width: 55 },
    { header: 'Total Groovy Found', key: 'totalFound', width: 20 },
    { header: 'Global GS Count', key: 'globalGsCount', width: 18 },
    { header: 'Local GS Count', key: 'localGsCount', width: 16 },
    { header: 'Local GS Name', key: 'localGsName', width: 40 },
    { header: 'Lines Containing "String"', key: 'linesString', width: 60 },
    { header: 'Comments', key: 'comments', width: 45 },
];

/**
 * Builds the flat list of Excel rows from all processed iflow data.
 *
 * @param {object[]} iflowDataList - Array of per-iflow result objects
 * @returns {object[]} Flat array of row objects
 */
function buildRows(iflowDataList) {
    const rows = [];

    for (const iflow of iflowDataList) {
        const {
            iflowName,
            totalFound,
            skipped,
            scripts,
            hasScriptFolder,
            results,
            errorMessage,
        } = iflow;

        // ── Iflow-level error (e.g. download failed) ──
        if (errorMessage) {
            rows.push({
                iflowName,
                totalFound: '-',
                globalGsCount: '-',
                localGsCount: '-',
                localGsName: '-',
                linesString: '-',
                comments: errorMessage,
            });
            continue;
        }

        const globalGsCount = skipped;
        const localGsCount = scripts.length;

        // ── No script folder in zip ──
        if (!hasScriptFolder) {
            rows.push({
                iflowName,
                totalFound,
                globalGsCount,
                localGsCount,
                localGsName: '-',
                linesString: '-',
                comments: 'No script folder found in iflow zip',
            });
            continue;
        }

        // ── No valid (local) groovy scripts ──
        if (localGsCount === 0) {
            rows.push({
                iflowName,
                totalFound,
                globalGsCount,
                localGsCount,
                localGsName: '-',
                linesString: '-',
                comments: totalFound === 0
                    ? 'No groovy script activities found in .iflw'
                    : 'No valid groovy scripts to process (all are GS_Shared_Collection)',
            });
            continue;
        }

        // ── One row per groovy script ──
        for (const result of results) {
            let linesString = '';
            let comment = '';

            if (!result.found) {
                linesString = '-';
                comment = 'Script file not found in zip';
            } else if (result.lineCount === 0) {
                linesString = 'No matches';
                comment = '';
            } else {
                linesString = result.matches
                    .map((m) => `Line ${m.lineNumber}: ${m.content.trim()}`)
                    .join('\n');
            }

            rows.push({
                iflowName,
                totalFound,
                globalGsCount,
                localGsCount,
                localGsName: result.scriptName,
                linesString,
                comments: comment,
            });
        }
    }

    return rows;
}

/**
 * Generates an Excel file from all iflow results and saves it to output/.
 *
 * @param {object[]} iflowDataList - Array of per-iflow result objects
 * @returns {Promise<string>} Absolute path to the saved Excel file
 */
async function generateExcel(iflowDataList) {
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Groovy Filter Report');

    // ── Set columns ──
    worksheet.columns = COLUMNS;

    // ── Style header row ──
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E4057' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 22;

    // ── Add data rows ──
    const rows = buildRows(iflowDataList);

    for (const rowData of rows) {
        const row = worksheet.addRow(rowData);

        // Wrap text in all cells, align top
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'top', wrapText: true };
        });

        // Highlight rows with errors or warnings (Comments column = col G = 7)
        const comment = rowData.comments || '';
        if (comment && comment !== '') {
            row.getCell(7).font = { italic: true, color: { argb: 'FF8B0000' } };
        }

        // Highlight "Lines Containing String" cell (col F = 6) in light yellow if it has matches
        if (rowData.linesString && rowData.linesString !== '-' && rowData.linesString !== 'No matches') {
            row.getCell(6).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF9C4' },
            };
        }

        row.commit();
    }

    // ── Freeze header row ──
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // ── Save file ──
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = `Groovy_Filter_Report_${timestamp}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
}

module.exports = { generateExcel };
