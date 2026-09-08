# Paradox Doctor

Paradox Doctor is a local-first browser diagnostic toolkit for **Hearts of Iron IV** and **Victoria 3** modders.

Live site: `https://reridy.github.io/paradox-doctor/`

## Public v1 workflows

### Diagnose a broken project
- Scan a full mod folder, selected files, `error.log`, or both.
- Prioritize likely root causes instead of reproducing raw engine noise.
- Label deterministic findings separately from heuristics.
- Save a local baseline, ignore known noise, search/filter findings, and export Markdown/JSON reports.
- Optionally compare against a local vanilla/dependency reference folder and current game version.

### Project Regression Doctor
- Compare the latest known-good project with the current broken version.
- Detect added, removed and modified text files by relative path.
- Rank changed files using game-sensitive paths, brace changes, removed IDs and optional `error.log` correlation.
- Export a source-free regression report.

### Mod Compatibility Doctor
- Compare two complete mod roots locally.
- Detect exact-path overrides, duplicate localization keys, game-aware duplicate IDs and `replace_path` overlap.
- Support HOI4 focus/event/state IDs and Victoria 3 journal/event/state-region IDs.
- Apply an optional load-order assumption and export Markdown/JSON reports.

## Product principles

- **Root-cause first** — high-signal structural problems come before noisy heuristics.
- **Game-aware** — HOI4 and Victoria 3 use different rules and explanations.
- **Honest uncertainty** — a clean scan is not presented as proof that a mod is valid.
- **Local-first** — selected source files and logs are processed in the browser in v1.
- **Workflow over warning count** — regression, compatibility, baselines, references and reports aim to reduce debugging time.

## Key checks

### Shared
- Brace balance while ignoring braces in quoted strings/comments.
- Localization header/entry-shape checks and raw-byte BOM information.
- Duplicate localization keys inside one file and across selected files.
- `supported_version` comparison when a current game version is supplied.
- Repeated `error.log` grouping and source-location extraction when possible.
- Optional exact-path/localization reference context.

### Hearts of Iron IV
- Duplicate focus, event and state IDs.
- Dependency-aware focus-reference heuristics.
- Provinces assigned to multiple selected states.
- Duplicate province membership across selected strategic-region files.
- Conservative state/category/history/buildings review items.

### Victoria 3
- Duplicate journal-entry, event and state-region IDs.
- Journal/event reference heuristics.
- Scope/event-target error-log grouping.
- Duplicate selected province membership across state regions.
- Localization-path and map/state heuristics.

## Quality gates

GitHub Actions checks JavaScript syntax, static-site links/duplicate IDs, and a small rule regression suite before merge.

```bash
node --check app-core.js
node --check app-game-checks.js
node --check app-log-runner.js
node --check app-ui.js
node --check regression.js
node --check compatibility-engine.js
node --check compatibility.js
node --check tools.js
node --test tests/*.test.mjs tests/*.test.cjs
node scripts/check-site.mjs
```

## Architecture

- `index.html` + `app-*.js` — main diagnostic workspace
- `regression.html` / `regression.js` — project-version comparison
- `compatibility.html` / `compatibility-engine.js` / `compatibility.js` — two-mod compatibility analysis
- `guides.html` + `errors/` — troubleshooting library
- `tools.html` / `tools.js` — focused utilities
- `about.html` — support matrix and limitations
- `feedback.html` + GitHub issue forms — structured field feedback
- `privacy.html` — local-data behavior

## Limitations

Paradox Doctor is a heuristic diagnostic assistant, not a complete Clausewitz/Jomini parser and not a replacement for Paradox debug mode, map validation, CWTools, Tiger, or direct in-game testing. Partial folder selections can only be checked against the context supplied.

## Disclaimer

Paradox Doctor is an unofficial community project and is not affiliated with or endorsed by Paradox Interactive.
