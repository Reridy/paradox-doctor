# Paradox Doctor

Paradox Doctor is a local-first browser diagnostic tool for Paradox modders. The current public beta supports **Hearts of Iron IV** and **Victoria 3** with different game-aware diagnostic profiles.

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
- Game-specific troubleshooting guides.

### Hearts of Iron IV
- Focus ID and focus-localization checks.
- Duplicate state ID checks.
- Provinces assigned to multiple states.
- Duplicate strategic-region province membership.
- Common map/state structure warnings.
- `unexpected token`, unknown/invalid effects, references and map-related error-log triage.

### Victoria 3
- Jomini unset/wrong-scope and event-target log grouping.
- Journal-entry duplicate key and localization heuristics.
- Duplicate event ID checks.
- Victoria 3 localization-path heuristics.
- State-region key and repeated province-membership checks.
- Map/state and missing-reference log triage.

## Architecture

The site is intentionally static HTML/CSS/JavaScript so it can run on GitHub Pages without a backend. Project source files remain on the user's device in the current version.

The scanner is a practical heuristic diagnostic assistant, not a complete replacement for CWTools, Tiger, Paradox debug mode, or engine map validation. High-confidence deterministic conflicts are prioritized above lower-confidence warnings.

## Research direction

`research-2026-09-07.md` records the public modder pain points that informed the HOI4 + Victoria 3 expansion. The product direction is to focus on zero-install diagnosis and plain-language triage rather than becoming another full content editor.

## Run locally

No build step is required. Open `index.html`, or serve the repository with a simple static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

Pages can deploy directly from `main` and `/ (root)`.

## Roadmap

Future work should be driven by user feedback and measurable demand. Strong candidates include safe suggested fixes with diffs, project snapshots, compatibility comparison between mods, deeper reference graphs, and game-version-aware validation.

## Disclaimer

Paradox Doctor is an unofficial community project and is not affiliated with or endorsed by Paradox Interactive.
