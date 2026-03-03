'use strict';

/**
 * src/bulk/iflowFetcher.js
 * ─────────────────────────────────────────────
 * Fetches all iflows for a given integration package.
 *
 * API:  GET {packageEntryId}/IntegrationDesigntimeArtifacts
 * Auth: Bearer token
 *
 * Returns:
 *   [{ iflowId, iflowName, downloadUrl }]
 */

const axios = require('axios');
const xml2js = require('xml2js');

const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

/**
 * @param {string} iflowsUrl  - Full URL, e.g. https://{host}/api/v1/IntegrationPackages('XYZ')/IntegrationDesigntimeArtifacts
 * @param {string} token
 * @returns {Promise<Array<{ iflowId: string, iflowName: string, downloadUrl: string }>>}
 */
async function fetchIflowsForPackage(iflowsUrl, token) {
    const response = await axios.get(iflowsUrl, {
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

    if (!rawEntry) return [];  // Package has no iflows

    const entries = Array.isArray(rawEntry) ? rawEntry : [rawEntry];

    return entries.map((entry) => {
        const props = entry?.['m:properties'] || {};
        const iflowId = props?.['d:Id']?._ || props?.['d:Id'] || '';
        const iflowName = props?.['d:Name']?._ || props?.['d:Name'] || iflowId;
        // entry.id is the full REST URL for this iflow artifact
        const entryId = entry?.id || '';
        const downloadUrl = `${entryId}/$value`;

        return { iflowId, iflowName, downloadUrl };
    }).filter(i => i.iflowId);
}

module.exports = { fetchIflowsForPackage };
