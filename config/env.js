'use strict';

require('dotenv').config();

/**
 * config/env.js
 * ─────────────────────────────────────────────
 * Loads and validates required environment variables from .env
 * Throws clearly if any required variable is missing.
 */

const required = {
    BASE_URL: process.env.MDLZ_CPI_API_BASE_URL,
    CLIENT_ID: process.env.MDLZ_CLIENT_ID,
    CLIENT_SECRET: process.env.MDLZ_CLIENT_SECRET,
    TOKEN_URL: process.env.MDLZ_TOKEN_URL,
};

const missing = Object.entries(required)
    .filter(([, val]) => !val)
    .map(([key]) => key);

if (missing.length > 0) {
    throw new Error(
        `Missing required environment variables in .env:\n  ${missing.join('\n  ')}`
    );
}

module.exports = required;
