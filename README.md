# Paradox Doctor

Paradox Doctor is a local-first browser diagnostic workspace for **Hearts of Iron IV** and **Victoria 3** modders.

Live site: `https://reridy.github.io/paradox-doctor/`

## Product principles

- **Root-cause first:** repeated engine noise is grouped and high-confidence structural findings are prioritized.
- **Game-aware:** HOI4 and Victoria 3 use different checks and guidance.
- **Honest uncertainty:** deterministic findings and heuristics are labelled differently; a clean scan is not presented as proof that a mod is bug-free.
- **Local-first:** selected project files, references and logs stay in the browser in the public beta.
- **Workflow over warning count:** regression baselines, ignored fingerprints, reference context and exportable reports reduce repeat debugging work.

## Current workflow

1. Select HOI4 or Victoria 3.
2. Add a project folder, `error.log`, or both.
3. Optionally load a local vanilla/dependency reference and current game version.
4. Run diagnosis.
5. Start with likely root causes, then review lower-confidence warnings.
6. Save a good result as a local regression baseline or export JSON/Markdown.

## Project Regression Doctor

`regression.html` compares a last-known-good project folder with the current broken version.

- Added, removed, and modified text files are detected by relative project path.
- Changed files are ranked using game-sensitive folder risk, brace-balance changes, removed known identifiers, edit size, and optional `error.log` correlation.
- The first changed area can be previewed side-by-side without uploading source files.
- Regression reports can be exported as Markdown or JSON.
- A structured GitHub feedback action lets users report a wrong ranking so real cases can improve future prioritization.

The ranking is deliberately presented as a **suspect list, not a verdict**.

## Key checks

### Shared
- Brace balance with strings/comments excluded from brace counting.
- Localization language-header and entry-shape checks.
- UTF-8 BOM information read from the raw bytes instead of decoded text.
- Duplicate localization keys inside one file and across selected files.
- `supported_version` comparison when a game version is supplied.
- Repeated `error.log` grouping with source-location extraction when possible.
- Optional exact-path/localization collision context against a local reference folder.

### Hearts of Iron IV
- Duplicate focus IDs and event IDs.
- Missing focus prerequisite references as dependency-aware heuristics.
- Duplicate state IDs and provinces assigned to multiple selected states.
- Duplicate province membership across selected strategic-region files.
- Conservative state/category/history/buildings review items.

### Victoria 3
- Duplicate journal-entry and event IDs.
- Journal/event reference heuristics with optional dependency reference lookup.
- Suspicious `timeout = 0` as a heuristic.
- Duplicate state-region keys and repeated selected province membership.
- Scope/event-target and map/state log triage.

## Finding baseline workflow

Each game can store one local baseline made of finding fingerprints. A later scan can show only findings that are new relative to that baseline. Ignored-finding fingerprints are also stored locally and separately by game.

## Repository quality

The site has no build step. GitHub Actions runs JavaScript syntax checks for the diagnostic app, Regression Doctor and tools, plus `node scripts/check-site.mjs`.

The static checker verifies internal file targets and duplicate HTML IDs.

## Architecture

- `index.html` — main diagnostic workspace
- `app-core.js` / `app-game-checks.js` / `app-log-runner.js` / `app-ui.js` — main scanner split by responsibility
- `regression.html` / `regression.js` / `regression.css` — two-project regression comparison
- `style.css` — shared responsive styles
- `guides.html` + `errors/` — user-facing troubleshooting content
- `games/` — game-specific landing pages
- `tools.html` / `tools.js` — non-core utilities such as HOI4 year shifting
- `privacy.html` — local-data behavior
- `pricing.html` — product roadmap; there is no paid plan today

## Limitations

Paradox Doctor is a heuristic diagnostic assistant, not a full engine parser and not a replacement for Paradox debug mode, CWTools, Tiger or direct game validation. Partial folder selections can only be checked against the context actually supplied. Regression ranking is heuristic and should be used to decide what to inspect first, not as proof of causation.

## Disclaimer

Paradox Doctor is an unofficial community project and is not affiliated with or endorsed by Paradox Interactive.
