# Cumulus

**A clearer view of your wealth.**

Cumulus is a local-first personal finance dashboard for tracking accounts, recurring obligations, paydays, and debt payoff plans. It is a plain HTML, CSS, and JavaScript app with no build step and no backend.

## Run it

Open [index.html](index.html) directly in a modern browser:

```sh
open index.html
```

The app can also be hosted as static files, but opening it through `file://` is the intended personal-use workflow.

## What it does

- Tracks cash, investments, crypto, property, credit cards, loans, income, and monthly bills.
- Calculates net worth, including property equity and liabilities.
- Organizes account categories and accounts with long-press drag reordering.
- Supports pasted account-logo images and screenshot-based balance updates using browser OCR.
- Plans cash flow with past-due and upcoming activity, pay-period grouping, and projections through the following January.
- Displays a large-screen calendar for dues, paydays, and payoff-by reminders, plus a keyboard-enabled calculator.
- Provides debt and mortgage payoff projections with adjustable payments and amortization schedules.
- Includes light and dark themes, a built-in tutorial, and JSON export/import for backups.

## Data and privacy

Cumulus stores its data only in the browser's `localStorage`; it does not send account data to a server. Browser data is scoped to the browser and origin/path, so export a JSON backup regularly from **Settings** before clearing browser storage or switching environments.

Live cryptocurrency prices and coin icons are requested from the public CoinGecko API when crypto accounts are used. Website favicons and the OCR library are also loaded from external services as needed.

## Project structure

- [index.html](index.html): the main app UI.
- [app.js](app.js): account management, calculations, persistence, OCR, and interactions.
- [styles.css](styles.css): application styling and themes.
- [tutorial.html](tutorial.html) and [tutorial.css](tutorial.css): standalone in-app tutorial.
- [manifest.webmanifest](manifest.webmanifest) and [icon.svg](icon.svg): installable-app metadata and icon.

## Development

No package installation or build command is required. Edit the static files and refresh the browser. For project-specific implementation notes and known constraints, see [AGENTS.md](AGENTS.md).