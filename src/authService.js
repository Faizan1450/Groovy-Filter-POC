'use strict';

/**
 * src/authService.js
 * ─────────────────────────────────────────────
 * Fetches and caches an OAuth2 Bearer token using the
 * Client Credentials grant (no user interaction needed).
 *
 * Token is re-used until it's within 60 seconds of expiry,
 * then a fresh one is fetched transparently.
 */

const axios = require('axios');
const env = require('../config/env');

// ── In-memory token cache ──────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0; // epoch ms

/**
 * Returns a valid Bearer token string, fetching a new one if needed.
 * @returns {Promise<string>} raw token (no "Bearer " prefix)
 */
async function getToken() {
    const now = Date.now();

    // Return cached token if still valid (with 60s safety buffer)
    if (cachedToken && now < tokenExpiresAt - 60_000) {
        console.log('🔑  Using cached OAuth2 token');
        return cachedToken;
    }

    console.log('🔐  Fetching new OAuth2 token...');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', env.CLIENT_ID);
    params.append('client_secret', env.CLIENT_SECRET);

    const response = await axios.post(env.TOKEN_URL, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15_000,
    });

    const { access_token, expires_in } = response.data;

    if (!access_token) {
        throw new Error('OAuth2 response did not contain an access_token.');
    }

    // Cache the token
    cachedToken = access_token;
    tokenExpiresAt = now + (expires_in ?? 3600) * 1000;

    console.log(`OAuth2 token acquired (expires in ${expires_in ?? 3600}s)`);
    return cachedToken;
}

/** Clears cached token (useful for testing or forced refresh). */
function clearTokenCache() {
    cachedToken = null;
    tokenExpiresAt = 0;
}

module.exports = { getToken, clearTokenCache };
