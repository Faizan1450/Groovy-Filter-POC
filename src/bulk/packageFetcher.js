'use strict';

/**
 * src/bulk/packageFetcher.js
 * ─────────────────────────────────────────────
 * Fetches the full list of Integration Packages from the SAP CPI tenant.
 *
 * API:  GET {BASE_URL}/api/v1/IntegrationPackages
 * Auth: Bearer token
 *
 * Returns:
 *   [{ packageId, packageName, iflowsUrl }]
 */

const axios = require('axios');
const xml2js = require('xml2js');
const env = require('../../config/env');

const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

/**
 * @param {string} token
 * @returns {Promise<Array<{ packageId: string, packageName: string, iflowsUrl: string }>>}
 */
async function fetchAllPackages(token) {
    const url = `${env.BASE_URL}/api/v1/IntegrationPackages`;

    const response = await axios.get(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/xml',
        },
        timeout: 30_000,
    });

    const parsed = await parser.parseStringPromise(response.data);

    // Navigate: feed → entry (normalize to array)
    const feed = parsed?.feed;
    const rawEntry = feed?.entry;

    if (!rawEntry) return [];  // No packages found

    const entries = Array.isArray(rawEntry) ? rawEntry : [rawEntry];

    return entries.map((entry) => {
        const packageId = entry?.['m:properties']?.['d:Id']?._ || entry?.['m:properties']?.['d:Id'] || '';
        const packageName = entry?.['m:properties']?.['d:Name']?._ || entry?.['m:properties']?.['d:Name'] || packageId;
        // The entry id is the full URL to the package resource
        const entryId = entry?.id || '';
        const iflowsUrl = `${entryId}/IntegrationDesigntimeArtifacts`;

        return { packageId, packageName, iflowsUrl };
    }).filter(p => p.packageId); // filter out malformed entries
}

module.exports = { fetchAllPackages };
