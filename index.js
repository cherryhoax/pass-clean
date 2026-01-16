#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fastCsv = require('fast-csv');

// Input file name (output is derived below)
const INPUT_FILE = 'passwords.csv';

// Simple env parser for boolean-ish flags
const isEnvTrue = (name) => {
    const v = process.env[name];
    if (!v) return false;
    return v === '1' || v.toLowerCase() === 'true';
};

// Flags (long and short forms)
const args = new Set(process.argv.slice(2));
const normalizeUrlEnabled = args.has('--normalize-url') || args.has('-n') || isEnvTrue('NORMALIZE_URLS');
const lowerUsernamesEnabled = args.has('--case-insensitive-usernames') || args.has('-u') || isEnvTrue('CASE_INSENSITIVE_USERNAMES');
const ignoreEmptyPasswordsEnabled = args.has('--ignore-empty-passwords') || args.has('-p') || isEnvTrue('IGNORE_EMPTY_PASSWORDS');
const preferModifyTimeEnabled = args.has('--prefer-modify-time') || args.has('-m') || isEnvTrue('PREFER_MODIFY_TIME');
const overwriteEnabled = args.has('--overwrite') || args.has('-o') || isEnvTrue('OVERWRITE_OUTPUT');

// Derive default output name: "<name> (cleaned)<ext>"
const makeCleanedName = (inputPath) => {
    const { dir, name, ext } = path.parse(inputPath);
    const cleaned = `${name} (cleaned)${ext || '.csv'}`;
    return dir ? path.join(dir, cleaned) : cleaned;
};

const OUTPUT_FILE = overwriteEnabled ? INPUT_FILE : makeCleanedName(INPUT_FILE);

// Map to keep only the most recent records
const latestRecords = new Map();

// Convert date string to numeric timestamp
const getTimestamp = (dateString) => {
    if (!dateString) return 0;
    return new Date(dateString).getTime();
};

// Normalize URL to scheme+host (drops path) to merge site variants
const normalizeUrl = (value) => {
    if (!value) return '';
    try {
        const v = value.startsWith('http') ? value : `https://${value}`;
        const u = new URL(v);
        return `${u.protocol}//${u.host}`;
    } catch (err) {
        return value.trim().toLowerCase();
    }
};

console.log('Processing CSV...');
if (normalizeUrlEnabled) console.log('URL normalization enabled (scheme+host only).');
if (lowerUsernamesEnabled) console.log('Usernames will be lowercased for dedupe.');
if (ignoreEmptyPasswordsEnabled) console.log('Rows without passwords will be skipped.');
if (preferModifyTimeEnabled) console.log('Rows missing modifyTime will be skipped.');
console.log(`Output file: ${OUTPUT_FILE}${overwriteEnabled ? ' (overwrite enabled)' : ''}`);

fs.createReadStream(INPUT_FILE)
    .pipe(csv())
    .on('data', (row) => {
        if (ignoreEmptyPasswordsEnabled) {
            const pwd = row.password == null ? '' : String(row.password).trim();
            if (!pwd) return; // skip rows without a password
        }

        if (preferModifyTimeEnabled && !row.modifyTime) return; // skip if modifyTime is required but missing

        // Safer approach: combine username with URL (or Name) to preserve site-specific accounts.
        const usernamePart = lowerUsernamesEnabled
            ? (row.username || '').trim().toLowerCase()
            : (row.username || '').trim();
        const sitePart = normalizeUrlEnabled
            ? normalizeUrl(row.url || row.name)
            : (row.url || row.name || '').trim();
        const uniqueKey = `${usernamePart}|${sitePart}`;

        // Compare timestamps when the account already exists in the map
        if (latestRecords.has(uniqueKey)) {
            const existingRow = latestRecords.get(uniqueKey);
            
            // Use modifyTime when available, otherwise fall back to createTime
            const existingDate = getTimestamp(existingRow.modifyTime || existingRow.createTime);
            const newDate = getTimestamp(row.modifyTime || row.createTime);

            // Replace only when the new record is more recent
            if (newDate > existingDate) {
                latestRecords.set(uniqueKey, row);
            }
        } else {
            // First time seeing this account, add directly
            latestRecords.set(uniqueKey, row);
        }
    })
    .on('end', () => {
        // Convert map values to an array
        const resultData = Array.from(latestRecords.values());

        // Write the cleaned CSV
        const ws = fs.createWriteStream(OUTPUT_FILE);
        
        fastCsv
            .write(resultData, { headers: true })
            .pipe(ws)
            .on('finish', () => {
                console.log('Done.');
                console.log(`Unique accounts: ${resultData.length}`);
                console.log(`Saved file: ${OUTPUT_FILE}`);
            });
    });