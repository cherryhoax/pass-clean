# 🔑 pass-clean

Clean and deduplicate password CSV exports.

## Installation

Global install from GitHub (replace owner if you fork):

```bash
npm install -g cherryhoax/pass-clean
```

## Usage

- Run locally: `node index.js [flags]`
- After npm install (local bin): `npx pass-clean [flags]`
- After global install: `pass-clean [flags]`

Input: `passwords.csv` in the working directory. Output defaults to `passwords (cleaned).csv` (original is left untouched unless overwrite is enabled).

## Flags

- `--normalize-url`, `-n` — normalize URLs to `scheme://host` (drops paths) before deduping.
- `--case-insensitive-usernames`, `-u` — lowercase usernames before deduping.
- `--ignore-empty-passwords`, `-p` — skip rows that have no password value.
- `--prefer-modify-time`, `-m` — require `modifyTime`; rows without it are skipped.
- `--overwrite`, `-o` — write output to the input filename (overwrites the original file).

## Environment variables

- `NORMALIZE_URLS=1` — same as `--normalize-url` / `-n`.
- `CASE_INSENSITIVE_USERNAMES=1` — same as `--case-insensitive-usernames` / `-u`.
- `IGNORE_EMPTY_PASSWORDS=1` — same as `--ignore-empty-passwords` / `-p`.
- `PREFER_MODIFY_TIME=1` — same as `--prefer-modify-time` / `-m`.
- `OVERWRITE_OUTPUT=1` — same as `--overwrite` / `-o`.

## Examples

- Normalize URLs and lowercase usernames:
  - `node index.js --normalize-url --case-insensitive-usernames`
- Skip rows missing passwords and require `modifyTime`:
  - `node index.js -p -m`
- Overwrite the original input file:
  - `node index.js -o`
- Use env var for URL normalization:
  - `NORMALIZE_URLS=1 node index.js`

## Notes

- Dedup key format: `username|site`, where `site` is normalized when `--normalize-url`/`-n` is on.
- Timestamps: prefers `modifyTime` when present; otherwise falls back to `createTime` (unless `-m` is used to skip missing `modifyTime`).

## Contributing

Contributions are most welcome! Feel free to submit issues and pull requests to help improve **Disco Launcher**.

1. Fork the repository.
2. Create a new branch for your feature or bugfix.
3. Submit a pull request when your code is ready.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any inquiries or feedback, feel free to reach out!

<a href="https://www.buymeacoffee.com/cherryhoax" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>
