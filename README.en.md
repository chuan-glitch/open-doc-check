# open-doc-check

[中文说明](README.md)

A small Markdown link checker for broken web links, missing images, and local paths. Reports are currently in Chinese; this guide covers installation and usage in English.

Requires Node.js 22 or later. No account or API key needed. MIT licensed.

## Try it

```sh
git clone https://github.com/chuan-glitch/open-doc-check.git
cd open-doc-check
npm ci
node bin/open-doc-check.js /path/to/your/docs --offline
node bin/open-doc-check.js /path/to/your/docs --format html --output reports/result.html
```

Open `reports/result.html` in a browser. Replace `/path/to/your/docs` with your own directory. Quote paths containing spaces.

This project is not published on npm. Install from this repository rather than using `npx open-doc-check`.

## What it checks

- `.md` and `.markdown` files, excluding code blocks and inline code.
- Markdown links, images, defined reference links, and HTTP(S) autolinks.
- Relative local paths, URL-encoded paths, and paths containing non-English characters.
- HTTP(S) links with redirects, concurrent requests, URL deduplication, and a GET fallback when HEAD fails.

Results distinguish **OK**, **broken**, **uncertain**, and **skipped**. Timeouts, login restrictions, and rate limits are uncertain rather than automatically classified as broken. HTTP 404/410 and missing local paths are classified as broken.

## Options

```text
--offline              Check local paths only; no network requests
--format text|json|markdown|html
--output <file>        Save a report
--root <directory>    Resolve leading-slash paths against this directory
--timeout <ms>        Default 10000; shared by HEAD and GET
--concurrency <n>     Default 8; range 1–64
--exclude <name>      Skip a directory name; repeatable
--ignore <prefix>     Skip links starting with a prefix; repeatable
--strict              Treat uncertain results as failures
```

Exit codes: `0` no broken links; `1` broken links (or uncertain results with `--strict`); `2` invalid arguments or an execution error.

By default, `.git`, `node_modules`, `vendor`, `dist`, `build`, `coverage`, and `reports` are excluded. Directory traversal does not follow symbolic links. Network checks request URLs from the input documents, including redirects; use `--offline` for untrusted documents.

## Limits

- Heading anchors, raw HTML links/images, and undefined Markdown references are not validated.
- Line numbers can be approximate for complex multiline constructs.
- HTTP 200 may represent a login page or soft 404, so it does not guarantee useful content.
- No recursive website crawling, automatic fixes, or persistent cache yet.

## Development and feedback

```sh
npm test
npm run check
```

CI tests Windows and Linux on Node.js 22 and 24. Please open an Issue with a minimal Markdown example, your OS/Node version, and the expected result. Feedback on installation and false positives is particularly useful.

Inspired by the link-checking use case of [lychee](https://github.com/lycheeverse/lychee), with an independent JavaScript implementation using markdown-it.
