#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const fastCsv = require('fast-csv');

// Input path must be provided (no default)

// Simple env parser for boolean-ish flags
const isEnvTrue = (name) => {
    const v = process.env[name];
    if (!v) return false;
    return v === '1' || v.toLowerCase() === 'true';
};

// Parse args: collect flags and first positional as input file (flags can appear before or after the input)
const argv = process.argv.slice(2);
let inputFile = undefined;
const flagTokens = [];

for (const token of argv) {
    if (token.startsWith('-')) {
        flagTokens.push(token);
    } else if (!inputFile) {
        inputFile = token;
    }
}

const flags = new Set(flagTokens);
const helpEnabled = flags.has('--help') || flags.has('-h');
const normalizeUrlEnabled = flags.has('--normalize-url') || flags.has('-n') || isEnvTrue('NORMALIZE_URLS');
const lowerUsernamesEnabled = flags.has('--case-insensitive-usernames') || flags.has('-u') || isEnvTrue('CASE_INSENSITIVE_USERNAMES');
const ignoreEmptyPasswordsEnabled = flags.has('--ignore-empty-passwords') || flags.has('-p') || isEnvTrue('IGNORE_EMPTY_PASSWORDS');
const preferModifyTimeEnabled = flags.has('--prefer-modify-time') || flags.has('-m') || isEnvTrue('PREFER_MODIFY_TIME');
const overwriteEnabled = flags.has('--overwrite') || flags.has('-o') || isEnvTrue('OVERWRITE_OUTPUT');
const logDuplicatesEnabled = flags.has('--log-duplicates') || flags.has('-d') || isEnvTrue('LOG_DUPLICATES');

// Derive default output name: "<name> (cleaned)<ext>"
const makeCleanedName = (inputPath) => {
    const { dir, name, ext } = path.parse(inputPath);
    const cleaned = `${name} (cleaned)${ext || '.csv'}`;
    return dir ? path.join(dir, cleaned) : cleaned;
};

// Main processing function after input is known
const run = (resolvedInputFile) => {
    const OUTPUT_FILE = overwriteEnabled ? resolvedInputFile : makeCleanedName(resolvedInputFile);

    // Styled labels (bold + color)
    const ANSI = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', magenta: '\x1b[35m' };
    const label = (text) => `${ANSI.bold}${ANSI.cyan}${text}:${ANSI.reset}`;
    const dupLabel = (text) => `${ANSI.bold}${ANSI.magenta}${text}:${ANSI.reset}`;

    console.log(`${label('Input file')} ${resolvedInputFile}`);
    if (normalizeUrlEnabled) console.log(`${label('Normalize URL')} scheme+host only`);
    if (lowerUsernamesEnabled) console.log(`${label('Usernames')} lowercased for dedupe`);
    if (ignoreEmptyPasswordsEnabled) console.log(`${label('Passwords')} rows without values skipped`);
    if (preferModifyTimeEnabled) console.log(`${label('modifyTime')} required; rows without skipped`);
    if (logDuplicatesEnabled) console.log(`${dupLabel('Duplicates')} will be logged`);
    console.log(`${label('Output file')} ${OUTPUT_FILE}${overwriteEnabled ? ' (overwrite enabled)' : ''}`);

    let duplicatesCount = 0;

    fs.createReadStream(resolvedInputFile)
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
                duplicatesCount += 1;
                if (logDuplicatesEnabled) {
                    console.log(`${dupLabel('Duplicate')} ${usernamePart} | ${sitePart}`);
                }
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
                    console.log(`${label('Status')} Done`);
                    console.log(`${label('Unique accounts')} ${resultData.length}`);
                    console.log(`${dupLabel('Duplicates')} ${duplicatesCount}`);
                    console.log(`${label('Saved file')} ${OUTPUT_FILE}`);
                });
        });
};

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

// Normalize a CLI-provided input path
const normalizeInputPath = (p) => {
    if (!p) return p;
    let s = p.trim();
    // strip surrounding quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1);
    }
    // unescape spaces (common from drag-and-drop)
    s = s.replace(/\\\s/g, ' ');
    // expand ~ to home directory
    if (s.startsWith('~')) {
        const os = require('os');
        s = os.homedir() + s.slice(1);
    }
    return s;
};

const printHelp = () => {
    console.log(`Usage: pass-clean [options] input.csv\n` +
        `Input CSV is required. Flags may appear before or after the input path.\n` +
        `Output defaults to \"<input> (cleaned)<ext>\" unless --overwrite/-o is set.\n\n` +
        `Options:\n` +
        `  -h, --help                      Show this help\n` +
        `  -n, --normalize-url             Normalize URLs to scheme+host\n` +
        `  -u, --case-insensitive-usernames Lowercase usernames before dedupe\n` +
        `  -p, --ignore-empty-passwords    Skip rows without passwords\n` +
        `  -m, --prefer-modify-time        Require modifyTime; skip rows without it\n` +
        `  -o, --overwrite                 Write output to the input file name\n\n` +
        `Env vars (boolean): NORMALIZE_URLS, CASE_INSENSITIVE_USERNAMES,\n` +
        `IGNORE_EMPTY_PASSWORDS, PREFER_MODIFY_TIME, OVERWRITE_OUTPUT`);
};

// Entry point: show help if requested; prompt for input when missing
const start = () => {
    if (helpEnabled) {
        printHelp();
        process.exit(0);
    }

    if (!inputFile) {
        printHelp();
        console.error('No input file provided. Exiting.');
        process.exit(1);
    }

    const normalized = normalizeInputPath(inputFile);
    const fsPath = normalized;
    try {
        if (!fs.existsSync(fsPath)) {
            console.error(`Input not found: ${fsPath}`);
            process.exit(1);
        }
    } catch (e) {
        console.error(`Unable to access input: ${fsPath}`);
        console.error(e.message);
        process.exit(1);
    }

    run(fsPath);
};

start();