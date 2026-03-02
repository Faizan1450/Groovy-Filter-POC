'use strict';

/**
 * src/iflowDownloader.js
 * ─────────────────────────────────────────────
 * Downloads an iflow zip from SAP CPI as an in-memory Buffer.
 *
 * Endpoint:
 *   GET {baseURL}/api/v1/IntegrationDesigntimeArtifacts(Id='{iflowName}',Version='active')/$value
 *
 * Returns a Buffer — passed directly to AdmZip, nothing written to disk.
 */

const axios = require('axios');
const env = require('../config/env');

/**
 * @param {string} iflowName - The iflow artifact ID
 * @param {string} token     - Bearer token from authService.getToken()
 * @returns {Promise<Buffer>} Raw zip content as a Buffer
 */
async function downloadIflowZip(iflowName, token) {
    const url =
        `${env.BASE_URL}/api/v1/IntegrationDesigntimeArtifacts` +
        `(Id='${iflowName}',Version='active')/$value`;

    console.log(`  ⬇️   Downloading`);

    try {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/zip, application/octet-stream',
            },
            responseType: 'arraybuffer',
            timeout: 30_000,
        });

        const buffer = Buffer.from(response.data);
        const sizeKB = (buffer.length / 1024).toFixed(1);
        console.log(`  📦  Downloaded ${sizeKB} KB`);

        return buffer;

    } catch (err) {
        // Decode arraybuffer error body into readable text for diagnosis
        if (err.response?.data) {
            const rawBody = Buffer.from(err.response.data).toString('utf8');
            const status = err.response.status;

            // Extract <message>...</message> for cleaner logs
            const match = rawBody.match(/<message[^>]*>(.*?)<\/message>/i);
            if (match && match[1]) {
                throw new Error(`${match[1]} (HTTP ${status})`);
            }

            throw new Error(`HTTP ${status} — ${rawBody.slice(0, 300)}`);
        }
        throw err;
    }
}

module.exports = { downloadIflowZip };
