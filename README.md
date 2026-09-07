# Paradox Doctor

Paradox Doctor is a browser-based diagnostic tool for Paradox modding. The first alpha focuses on **Hearts of Iron IV** and aims to turn common mod errors into understandable, actionable fixes.

## MVP features

- Scan `.yml` localization files for:
  - duplicate keys in the same file
  - malformed language headers
  - malformed localization entries
  - suspicious unquoted values
  - UTF-8 BOM warning
- Paste or load `error.log` and classify common problems such as:
  - duplicate localization
  - unexpected tokens
  - unknown effects/triggers
  - missing references
- Scan `.txt` scripts for simple duplicate-ID patterns and suspicious historical years.
- Shift timeline years by a configurable offset with a preview before copying.
- Everything runs locally in the browser. Files are not uploaded by the current MVP.

## Run locally

No build step is required.

1. Clone or download the repository.
2. Open `index.html` in a browser, or serve the folder with any simple static web server.

Example with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy with GitHub Pages

This project is intentionally static and can be hosted for free using GitHub Pages.

1. Merge the MVP branch into `main`.
2. Open the repository on GitHub.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save.

For this repository, the project-site URL should normally be:

`https://reridy.github.io/paradox-doctor/`

## Current limitations

This is an alpha heuristic scanner, not a complete Clausewitz/Jomini parser. Some findings may be false positives, and passing the scan does not prove a mod is error-free. Cross-file references, full focus/event/idea parsing, ZIP/folder-wide analysis, and safe automatic fixes are planned for later versions.

## Roadmap

- Cross-file duplicate IDs and references
- Missing localization detection for focuses, ideas, events and decisions
- Folder / ZIP scanning
- Better `error.log` parser with categorized explanations
- Safe automatic fixes with downloadable patched files
- Expansion to other Paradox titles

## Disclaimer

Paradox Doctor is an unofficial community project and is not affiliated with or endorsed by Paradox Interactive.
