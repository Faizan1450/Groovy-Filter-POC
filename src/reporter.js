'use strict';

/**
 * src/reporter.js
 * ─────────────────────────────────────────────
 * Builds and saves an Excel report for all processed iflows.
 *
 * Excel columns (one row per groovy script):
 *   A: Package Name              (bulk mode: package name | /process: "-")
 *   B: Iflow Name
 *   C: Total Groovy Found        (all script activities in .iflw)
 *   D: Global GS Count           (GS_Shared_Collection scripts — skipped)
 *   E: Local GS Count            (valid scripts that were scanned)
 *   F: Local GS Name             (the .groovy file name)
 *   G: Lines Containing "String" (line number + content, \n-separated)
 *   H: Comments
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

// ── Colours ────────────────────────────────────────────────────────────────
const COLOR = {
    headerBg: '4472C4',   // Medium Excel blue — clean, professional
    headerFont: 'FFFFFF',   // White text on header
    matchBg: 'E2EFDA',   // Soft green — cells with "String" matches
    errorFont: 'C0392B',   // Muted red text for comments column warnings
    altRowBg: 'F2F2F2',   // Very light gray for alternating rows
    rowBg: 'FFFFFF',   // White for normal rows
};

// ── Column definitions ─────────────────────────────────────────────────────
const COLUMNS = [
    { header: 'Package Name', key: 'packageName', width: 40 },
    { header: 'Iflow Name', key: 'iflowName', width: 55 },
    { header: 'Total Groovy Found', key: 'totalFound', width: 20 },
    { header: 'Global GS Count', key: 'globalGsCount', width: 18 },
    { header: 'Local GS Count', key: 'localGsCount', width: 16 },
    { header: 'Local GS Name', key: 'localGsName', width: 40 },
    { header: 'Lines Containing "String"', key: 'linesString', width: 65 },
    { header: 'Comments', key: 'comments', width: 45 },
];

/**
 * Builds the flat list of Excel rows from all processed iflow data.
 * @param {object[]} iflowDataList
 * @returns {object[]}
 */
function buildRows(iflowDataList) {
    const rows = [];

    for (const iflow of iflowDataList) {
        const {
            packageName = '-',
            iflowName,
            totalFound,
            skipped,
            scripts,
            hasScriptFolder,
            results,
            errorMessage,
        } = iflow;

        // ── Iflow-level error (download/parse failed) ──
        if (errorMessage) {
            rows.push({
                packageName,
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
        const localGsCount = (scripts || []).length;

        // ── No script folder in zip ──
        if (!hasScriptFolder) {
            rows.push({
                packageName,
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
                packageName,
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
            } else {
                linesString = result.matches
                    .map((m) => `Line ${m.lineNumber}: ${m.content.trim()}`)
                    .join('\n');
            }

            rows.push({
                packageName,
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
 * Generates an Excel file from all iflow results.
 * @param {object[]} iflowDataList
 * @returns {Promise<string>} Absolute path to the saved file
 */
async function generateExcel(iflowDataList) {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SAP CPI Groovy Filter';
    const worksheet = workbook.addWorksheet('Groovy Filter Report');

    // ── Set columns ──────────────────────────────────────────────────────
    worksheet.columns = COLUMNS;

    // ── Style header row ─────────────────────────────────────────────────
    const headerRow = worksheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: `FF${COLOR.headerFont}` }, name: 'Calibri', size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR.headerBg}` } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            bottom: { style: 'thin', color: { argb: 'FF2E5496' } },
        };
    });

    // ── Enable auto-filter on header ─────────────────────────────────────
    worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: COLUMNS.length },
    };

    // ── Add data rows ────────────────────────────────────────────────────
    const dataRows = buildRows(iflowDataList);

    dataRows.forEach((rowData, idx) => {
        const row = worksheet.addRow(rowData);
        const isAltRow = idx % 2 === 1;
        const hasMatch = rowData.linesString
            && rowData.linesString !== '-'
            && rowData.linesString !== 'No matches';
        const hasComment = rowData.comments && rowData.comments !== '';
        const rowBgArgb = `FF${isAltRow ? COLOR.altRowBg : COLOR.rowBg}`;

        row.height = 16;

        row.eachCell({ includeEmpty: true }, (cell, colNum) => {
            cell.font = { name: 'Calibri', size: 10 };
            cell.alignment = { vertical: 'top', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgArgb } };
        });

        // Highlight "Lines Containing String" column (col G = 7) in soft green
        if (hasMatch) {
            const matchCell = row.getCell(7);
            matchCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLOR.matchBg}` } };
            matchCell.font = { name: 'Calibri', size: 10 };
        }

        // Style comments column (col H = 8) in muted red italic for warnings
        if (hasComment && rowData.errorMessage !== undefined || hasComment) {
            row.getCell(8).font = { italic: true, color: { argb: `FF${COLOR.errorFont}` }, name: 'Calibri', size: 10 };
        }

        row.commit();
    });

    // ── Freeze header row + first two columns ────────────────────────────
    worksheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }];

    // ── Save file ────────────────────────────────────────────────────────
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const fileName = `Groovy_Filter_Report_${timestamp}.xlsx`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
}

module.exports = { generateExcel };
