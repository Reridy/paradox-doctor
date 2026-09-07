# Paradox Doctor

Paradox Doctor is a local-first browser diagnostic tool for Paradox modders. The current public beta supports **Hearts of Iron IV** and **Victoria 3** with game-aware diagnostic profiles and a regression-oriented debugging workflow.

## Live site

`https://reridy.github.io/paradox-doctor/`

## Current features

### Shared
- Choose HOI4 or Victoria 3 before scanning.
- Scan individual text files or a whole mod folder in the browser.
- Upload or paste `error.log`.
- Collapse repeated log patterns and prioritize likely root causes.
- Brace-balance and localization-format checks.
- Cross-file duplicate localization detection.
- Severity filtering, result search, local scan-history metadata.
- Export Markdown / JSON diagnostic reports.
- Load a previous JSON report as a **baseline** and show only newly introduced findings.
- Locally ignore known false-positive patterns and restore them later.
- Guided "Next action" hints on findings.
- Optional local **reference folder** for vanilla/dependency path and localization collision checks.
- `descriptor.mod` / `.mod` supported-version diagnostics, with optional comparison to a user-entered current game version.
- Game-specific troubleshooting guides and an ongoing modder-demand survey.

### Hearts of Iron IV
- Focus ID and focus-localization checks.
- Missing focus-prerequisite reference checks.
- Duplicate state ID checks.
- Provinces assigned to multiple states.
- Duplicate strategic-region province membership.
- Provinces present in selected states but absent from selected strategic-region definitions.
- Stronger warnings for newly added/incomplete states without building data.
- Common map/state structure warnings.
- `unexpected token`, unknown/invalid effects, references and map-related error-log triage.

### Victoria 3
- Jomini unset/wrong-scope and event-target log grouping.
- Journal-entry duplicate key and localization heuristics.
- Duplicate event ID checks.
- Journal/event reference heuristics.
- Suspicious `timeout = 0` journal-entry warning.
- Victoria 3 localization-path heuristics.
- State-region key and repeated province-membership checks.
- Map/state and missing-reference log triage.

## Why v3 focuses on workflow

Public modding support threads show two different needs:

1. Beginners often need plain-language guidance and a concrete next step, not more raw validator output.
2. Experienced modders need to distinguish **new regressions** from known warnings and intentional overrides, while controlling false positives.

The v3 demand review is documented in `research-2026-09-08.md`.

## Architecture and privacy

The site is intentionally static HTML/CSS/JavaScript so it can run on GitHub Pages without a backend. Project source files, optional reference files, baselines, and logs are processed on the user's device in the current version.

Only small preferences/metadata such as the selected game, ignored issue fingerprints, and recent scan summaries may be stored in browser local storage.

The scanner is a practical heuristic diagnostic assistant, not a complete replacement for CWTools, Tiger, Paradox debug mode, or engine map validation. High-confidence deterministic conflicts are prioritized above lower-confidence warnings.

## Run locally

No build step is required. Open `index.html`, or serve the repository with a simple static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Pages can deploy directly from `main` and `/ (root)`.

## Feedback / demand survey

The ongoing product-demand survey is tracked in GitHub issue #5. Reports of false positives, missed root causes, confusing explanations, and workflows that would save real time should determine future priorities.

## Roadmap

Strong candidates after v3 are safe suggested fixes with diffs, project snapshots, compatibility comparison between two mods, deeper reference graphs, game-version-aware validation packs, and CI-friendly regression reports.

## Disclaimer

Paradox Doctor is an unofficial community project and is not affiliated with or endorsed by Paradox Interactive.
