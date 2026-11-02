# Contributing

Thanks for helping! This is a free, volunteer student project: a weekly timetable planner built from the
Uni Kassel eCampus course catalogue. It is not an official university service.

Issues and pull requests are welcome in English, German or Turkish.

## Setup

Requirements: Node.js 20 or newer.

```sh
npm install
npm run serve   # serves site/ at http://localhost:3000
npm test        # node --test, must pass before a PR
```

Open a program locally with `?p=<slug>`, e.g. http://localhost:3000/?p=bsc-informatik. Slugs are listed in
`site/data/programs.json`.

## Where things live

| Path | What |
|------|------|
| `site/` | The static app (no build step). `site/js/app.js` UI, `schedule.js` scheduling logic, `i18n.js` UI strings, `share.js` friend sharing |
| `site/data/` | Generated course data, one JSON per program. Do not edit by hand; it is overwritten by the scraper |
| `scraper/` | Node scraper for eCampus plus hand-maintained data: translations, notes, requirement rules |
| `scraper/rules/<slug>.json` | Requirement rules per program ("N modules from this area"), with links to the official PO/Modulhandbuch |
| `worker/` | Cloudflare Worker for the feedback form (`/api/*`) |
| `deploy/` | Maintainer-only build and publish scripts |
| `test/` | Tests (`node --test`), HTML fixtures in `test/fixtures/` |

## Good first contributions

- **Requirement rules for a missing program**: add `scraper/rules/<slug>.json` based on the official
  Prüfungsordnung / Modulhandbuch. Always put the source PDF link in the file. Look at an existing file
  (e.g. `scraper/rules/bsc-informatik.json`) for the format.
- **Translations**: course names and notes in `scraper/translations-*.json` and `scraper/notes-*.json`. The UI is
  Turkish, English and German; any new UI text needs all three in `site/js/i18n.js`.
- **Bug reports with a program slug and a screenshot** are very helpful.

## Rules

- **Be gentle with eCampus.** Use the cache (`npm run scrape` reuses `scraper/.cache`). Do not run `--fresh` in
  loops or add automatic/periodic scraping. A single program: `npm run scrape -- --only=<slug>`.
- Add or update tests for logic changes (`test/`).
- Keep the site static and dependency-light. No tracking, no accounts; user choices stay in `localStorage`.
- Phones matter: do not rely on hover, check widths under 700px.
- Do not commit secrets (`.dev.vars`, tokens).

## Deployment

Only the maintainer deploys (`deploy/deploy.sh`). Merged changes go live with the next deploy.
