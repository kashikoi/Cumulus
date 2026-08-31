# Cumulus — agent context / project memory

This file is a checked-in snapshot of the working context and history built up while
developing this app with an AI coding agent. If you're an agent picking up this repo in a
new session (or the user lost their chat history), **read this whole file first** — it
explains what's been built, why, and several non-obvious gotchas that have already been
hit once and fixed.

## What this is
- A personal finance web app, built incrementally via live browser preview, one small
  feature/request at a time.
- Named "Cumulus". Header `h1.app__title` = "Cumulus", `p.app__subtitle` = "A clearer view
  of your wealth.". `<title>` = Cumulus.
- Intent: a DYNAMIC, never-"final" tool that keeps evolving as the user uses it. Purely
  personal use, not a product.
- Workflow: user prompts a change -> agent edits files -> reload page in a browser preview
  -> screenshot -> user reacts -> repeat.

## Where it lives
- This repo IS the app folder (previously developed in a scratch folder called `webapp/`
  before being moved into its own git repo — if you see stale references to a `webapp/`
  path anywhere, it means the repo root).
- Files: `index.html`, `styles.css`, `app.js`, `tutorial.html`, `tutorial.css`, plus
  `icon.svg` (cloud app icon) and `manifest.webmanifest`. Plain vanilla HTML/CSS/JS, no
  build step, no framework, no bundler.
- App icon: `icon.svg` = iOS-style rounded sky-gradient tile (#7ec0ee->#cfe9fb) with a
  white cloud. Linked as favicon (`rel=icon` svg), `apple-touch-icon`, and via
  `manifest.webmanifest` (name Cumulus, theme/bg #7ec0ee).
- Runs by opening `index.html` directly (`file://`). Data persists in the browser's
  localStorage — there is NO backend, NO server, NO build step.

## Live-preview workflow
- The app is normally opened directly in the user's real Chrome via `file://` (or a
  browser preview tool during an agent session).
- To refresh the user's real Chrome after an edit (macOS): an AppleScript loop over
  Chrome windows/tabs, `reload t` where `URL of t contains "index.html"`.
- Data is per-browser (localStorage) AND per-origin/path — a preview browser's copy is
  separate from the user's real Chrome copy. Treat the user's real Chrome as the source
  of truth for their actual data; any sandbox/preview account data is throwaway test data
  and should be restored to a clean single-account state after verifying a change.

## Data model (localStorage keys)
- `finance.accounts` — array of account objects (see "Account fields" below).
- `finance.payments` — array of `{id, accountId, date (yyyy-mm-dd), amount}`. Pruned to
  the last ~3 months on every load/save (`prunePayments()`).
- `finance.groupOrder` — persisted display order of the account category groups
  (drag-reorderable).
- `finance.theme` — `"dark"` or `"light"`.

### Account fields (not all apply to every type)
`{id, name, url, type, balance, icon, address, zillow, redfin, homeValue, payFrequency,
lastPayDate, dueDay, minAmount, apr, origBalance, payoffBy}`
- `type` drives grouping via `ACCOUNT_TYPES`/`GROUPS` maps in `app.js` (income / cash /
  invest / property / credit / loans / bills).
- Bills (`type` in the "Monthly Bills" group, including the `donation` type) use ONLY
  `minAmount` as their monthly amount — there's no separate "balance" for bills anymore
  (see the "Bills simplified" entry in the feature log below for the backward-compat
  fallback that still reads old `balance`-based bills correctly).
- `dueDay`, `apr`, `origBalance`, `payoffBy` are only meaningful for liabilities
  (credit/loans) and property/mortgage.

## Feature log (chronological, most recent last)

Everything below was built incrementally. Each entry documents WHAT was built, WHY, and
any gotchas hit along the way — read these before touching the related code, since
several non-obvious bugs have already been found and fixed once.

- **Net worth summary + accounts grid.** Cards show a company favicon icon, color-coded
  balance (red = negative/owed).
- **Accounts merged with links.** Every account can have a website URL (`acc.url`,
  normalized via `normalizeUrl()` to prepend `https://`). The card body IS the bank link —
  clicking it opens the URL in a new tab; accounts without a URL open the edit modal
  instead. Icon priority: custom pasted icon > site favicon (Google s2 favicon service,
  `faviconFor()`) > type emoji, all via the shared `accountIconHtml()` helper.
- **Per-account action buttons** (hover, in `.account-card__actions`): update (⟳,
  `data-update`), edit (pencil, `data-edit`), delete (trash, `data-del`). All
  `stopPropagation` so they don't trigger the card's open-link click.
- **Balance update via paste, not clipboard.read().** Clicking ⟳ "arms" that account
  (`armUpdate(id)`), focuses a hidden `<textarea>` `pasteCatcher`. The next Cmd+V paste
  event (not `navigator.clipboard.read()`) grabs the pasted screenshot image, runs it
  through Tesseract.js OCR, extracts the first dollar amount (`extractBalance()`), and
  sets the balance. Chosen specifically because `file://` is a throwaway origin, so Chrome
  won't persist a clipboard-read permission grant → constant re-prompts. A paste event
  needs no permission at all.
- **Custom icon via paste.** For sites whose favicon won't load, the account modal has an
  "Icon" field — paste a screenshot of the logo, it's downscaled to ≤128px PNG
  (`blobToIcon()`, canvas) and stored as a data URL in `acc.icon`.
- **Account categories/groups** with per-group subtotals: Income, Cash & Savings,
  Investments & Retirement, Property, Credit Cards, Loans, Monthly Bills. Groups are
  drag-reorderable (persisted in `finance.groupOrder`), and cards within a group are also
  drag-reorderable (iPhone-style long-press-to-jiggle, then drag).
  - GOTCHA: never put `backdrop-filter`/`filter`/`transform` on `.account-group` — it
    makes the group a containing block for `position:fixed` descendants, and a dragged
    card jumps off-screen. This exact bug happened once; keep translucency at the
    `background`/`border` level only for that element.
- **Income/paycheck accounts** (`type: "salary"`) are cash-flow only, not a stored
  balance — excluded from net worth. Fields: `payFrequency` (`"biweekly"` |
  `"semimonthly"`), `lastPayDate`. Scheduling helpers: `upcomingPaydays()` (today-relative,
  count-based), `paydaysInRange()` (a date-range sibling used only for projections),
  `monthlyIncome()`.
- **Property/mortgage accounts** add `address`, `zillow`, `redfin`, `homeValue` (avg of
  the two estimates). No Zillow/Redfin API exists (no public API + CORS + ToS), so
  "Look up" just opens a search page for the user to read the number off manually.
- **Header live date/time + fixed sky gradient.** Fixed a bug where the page appeared to
  "get whiter as you scroll" on tall pages — root cause was the `body` gradient being
  sized to the full scrollable height instead of the viewport. Fix:
  `background-attachment: fixed` on `body`. **Any future edit that re-declares the
  `background` shorthand on `body` (e.g. for dark mode) must re-declare
  `background-attachment: fixed` too, or it silently resets to `scroll` and the bug comes
  back.** This has already happened once.
- **Cash Flow section**: cash-on-hand total, a due-items list, and a projection table
  running through January of next calendar year. `isDueAccount(a)` = bills/property/any
  liability. `monthlyObligation(a)` = the account's `minAmount` (bills used to use
  `balance` — see "Bills simplified" below for the compat fallback). Payments are logged
  as plain records; **logging a payment does NOT auto-reduce the account's stored
  balance** (known simplification — it's tracking/projection only).
- **Side panels: calendar + calculator** (shown only at ≥1500px viewport width, so the
  main `.app` column never changes width/position). Calendar shows a month grid; days get
  colored:
  - **Red** = something due that day, unpaid (scoped to last-month-onward, via
    `monthInDueRange()` — no future cutoff, so navigating the calendar arbitrarily far
    ahead still colors due days correctly). A day where every due item is paid gets NO
    special color at all — the earlier "green = all paid up" treatment was removed by
    request; paid-vs-due is still tracked internally (`dueStatusByDay`) purely to decide
    red vs nothing, and still shows up as a `✅ Name — paid $X` line in the hover popup.
  - **Green** = a paycheck lands that day — repurposed from the old purple "payday"
    color once "paid" stopped using green. Shown for **today or future** paydays, PLUS
    the single most recent PAST payday (found by scanning ~40 days back per account and
    taking the latest one before today, via `paydaysInRange` + `lastPastPayday`) — any
    payday older than that most-recent-past one is filtered out and stops being
    highlighted. If a day is BOTH an unpaid due date and a payday, **red always wins
    outright** — full override, no blended/ringed style at all (this made the old
    `.calendar__day--payday-ring` class obsolete; it was removed along with the "paid"
    CSS class).
  - **⏰ badge** = a manually-set "pay off by" reminder date (see below) — computed for
    ANY month (not limited to the due-date window), rendered as a small icon overlay
    (`::after`) specifically so it never conflicts with the background/ring colors above.
  - **Hovering** any non-empty highlighted day shows a floating summary popup listing
    every event that day (`🔴 Name — due $X`, `✅ Name — paid $X`, `💰 Name — payday $X`,
    `⏰ Name — pay off by today`). Built from a `dayInfo` map rebuilt every render;
    tooltip is one reused DOM node appended to `document.body` (not static HTML) so it
    survives calendar re-renders. Delegated `mouseover`/`mouseout` on the grid container
    (bound once, not per-render).
- **Tutorial page** (`tutorial.html` + `tutorial.css`) — a second, JS-free page reusing
  `styles.css` for the shared sky theme. A jump-nav chip bar lets readers skip to any
  step instead of reading linearly. Has its own tiny inline theme-sync script since it
  doesn't load `app.js`.
- **Payoff / amortization explorer** for liabilities and property: optional `apr` +
  `origBalance` fields unlock a progress-bar teaser on the card + a modal with a live
  payment slider (payoff date / total interest / principal-vs-interest bar / month-by-
  month schedule, all recompute live as you drag).
  - GOTCHA: account cards use a custom `pointerdown` tap handler, NOT a click handler —
    `stopPropagation()` on a click listener does nothing to stop a card tap. Any new
    clickable element inside a card needs an explicit `if (e.target.closest(".your-class"))
    return;` guard in `onCardPointerDown`.
- **Dark mode.** A class on `<html>` (`.dark`), not `<body>`. A tiny synchronous inline
  script in `<head>` (before the stylesheet) applies the class before first paint to
  avoid a flash of light mode. Most components re-theme for free via CSS variables
  (`--text`, `--muted`, `--card`, etc.) — components using literal colors instead needed
  explicit `html.dark .selector {}` overrides (this was most of the actual work).
  - GOTCHA: a dark-mode override that re-declares the `background` shorthand on an
    element with modifier subclasses (e.g. `.calculator__btn--equals`) can accidentally
    steamroll those modifiers, because `html.dark .base-class` is MORE specific than the
    plain modifier class regardless of source order. Fix with `:not()` exclusions.
- **Payday highlight** and **"pay off by" date reminder** — see calendar section above
  and the card badge described there. `payoffBy` is a manually-set target date (e.g. a 0%
  intro-APR deadline) independent of the APR/amortization system — works even with no
  APR set. Card badge (`payoffByBadgeHtml()`) has 3-tier urgency coloring (neutral / amber
  ≤60 days / red ≤30 days, today, or already passed).
- **Bills simplified to Min/Expected only + Donation type.** Bills now use ONLY
  `minAmount` as their amount (previously there was a redundant separate "Monthly
  amount" balance field). `monthlyObligation(a)` prefers `minAmount` first, falling back
  to the old `balance`-based amount ONLY for bills that haven't been re-saved yet — this
  is a backward-compat layer, not dead code; don't remove it casually. Added a
  `donation` account type (🤝) to the Monthly Bills group.
- **Global keyboard-to-calculator.** Any digit/operator/Enter/Escape keypress anywhere on
  the page drives the on-screen calculator, EXCEPT while focus is inside an
  INPUT/TEXTAREA/SELECT/contenteditable (so normal form typing is never hijacked).
- **Cash Flow restructure: Past due / Upcoming dues.** Replaced an earlier "Due this
  month" + "Previous dues" backlog design. **Past due** = all of last month (still
  unpaid) + this month's due days strictly before today. **Upcoming dues** = this
  month's due days from today onward (today counts as upcoming, not past) + all of next
  month. An account can legitimately appear in more than one bucket/month — that's
  intentional, not a bug.
  - GOTCHA already found+fixed: when defaulting a payment's date for a target
    month/year, the condition must be "is the target month DIFFERENT from the current
    one" (past OR future), NOT "is it before now" — a future-month payment defaulted to
    today's date silently fails to match that month's `date.slice(0,7)` key and the item
    never shows as paid. Any new code that logs a payment for a specific target month
    must use the clamped-due-day-within-that-month date for any month that isn't the
    current one.
- **Payment History removed entirely** (the old per-account expandable list of past
  payments with individual delete buttons). The "Paid $X · date · Undo" indicator for the
  CURRENT period is NOT history and was kept.
- **Upcoming dues grouped by paycheck, not by calendar month** (Aug 2026). Still covers
  the same window as before (today through the rest of this month, plus all of next
  month) but the group headers are now "Current paycheck · since Aug 28" / "Paycheck ·
  Sep 11" / "Paycheck · Sep 25" etc. instead of "Aug 2026" / "Sep 2026" — the idea being
  each bill groups under whichever paycheck would naturally cover it.
  - Periods are built from every DISTINCT payday across ALL income accounts (merged into
    one sorted, deduped list by exact date) from the most recent past payday (mirrors the
    calendar's "last past payday" logic — reuses the same lookback-40-days-then-take-last
    approach) through the end of next month. A due item is assigned to the LAST period
    whose date is `<= ` the item's own due date — i.e. "the most recent paycheck at or
    before this bill is due." This is why 3-paycheck months and multiple income accounts
    both just fall out naturally with no special-casing: every distinct payday from every
    income account becomes its own period boundary, whether that's 2, 3, or more per
    month.
  - The one period that contains "right now" (its own date `<=` now, and either it's the
    last period or the next one hasn't happened yet) is flagged `isCurrent` and labeled
    "Current paycheck · since <date>" instead of "Paycheck · <date>".
  - GOTCHA/fallback: if there are NO income accounts (or none with a `lastPayDate` set),
    there's nothing to anchor pay periods on, so it falls back to the exact old
    month-based grouping ("Aug 2026" / "Sep 2026" headers). Don't remove this fallback —
    plenty of setups (e.g. cash-only, or income tracked outside the app) have zero salary
    accounts.
  - An account with no `dueDay` set (rare/incomplete data) can't be date-matched to a
    period, so it's dumped into the current period as a reasonable default rather than
    being dropped — mirrors the pre-existing behavior where such accounts already showed
    up in both the "this month" and "next month" buckets regardless of date.
- **Single "Mark paid" is instant, no prompt.** Clicking "Mark paid" on an individual due
  item logs a payment immediately using the account's default amount (`minAmount`) and an
  appropriate date — no modal, no confirmation. (A "Mark all paid" bulk button + its own
  confirm dialog existed for a while but was later removed entirely per user request —
  don't reintroduce it without being asked.)
- **Settings popup** (⚙️ button in the header, replacing what used to be a separate
  theme-toggle button + a "Tutorial" link) opens a modal (not a new page) with:
  Appearance toggle, a Tutorial link, and four data-management actions:
  - **Export data** — downloads a `cumulus-backup-YYYY-MM-DD.json` file
    (`{accounts, payments, groupOrder, exportedAt}`) via a Blob + throwaway `<a
    download>`.
  - **Import data** — loads a backup file back in (validates it has an `accounts` array,
    confirms before overwriting, then reloads).
  - **Randomize data (demo)** — fills the app with a realistic ~12-account demo dataset
    (paycheck, savings, mortgage, two credit cards including a 0%-intro one with a
    `payoffBy` date, auto loan, a few bills, a couple of already-paid items) — handy for
    showing the app off without needing real data.
  - **Clear all data** — wipes accounts/payments/groupOrder (keeps the theme
    preference). This is the one action that still shows a native `confirm()` dialog,
    since it's genuinely destructive/irreversible — every other prompt in the app was
    deliberately removed for friction reasons, but this one was kept on purpose.
- **Crypto account type** (its own group, "Crypto", between Investments & Retirement and
  Property in `GROUP_ORDER`). The user picks a coin by symbol or name (a "Look up"
  button, matching the existing Zillow/Redfin pattern) and enters an amount held — NOT a
  dollar balance. Live price + coin icon come from **CoinGecko's free public API**
  (`api.coingecko.com`), not CoinMarketCap — CoinMarketCap's official API requires a
  server-side API key and doesn't support CORS for direct browser calls, which conflicts
  with this app's "no backend, no build step" architecture; CoinGecko's `/search` and
  `/simple/price` endpoints need no key and work fine from a `file://` origin.
  - `lookupCryptoCoin()` calls `/api/v3/search?query=...`, takes the top (most relevant)
    match, then fetches its USD price via `/api/v3/simple/price`, staging the result in
    `modalCrypto = {id, symbol, name, icon, price, priceAt}` (mirrors the existing
    `modalIcon` staging pattern for pasted custom icons) and showing a confirmation
    preview before the user saves — important because coin symbols collide often (many
    small tokens share a ticker) and this lets the user visually confirm before
    committing.
  - On save, the account stores `cryptoId`/`cryptoSymbol`/`cryptoName`/`cryptoAmount`/
    `cryptoPrice`/`cryptoPriceAt`, and `acc.balance` is COMPUTED as
    `cryptoAmount × cryptoPrice` (not user-entered — the generic balance field is hidden
    for crypto, same pattern as bills using Min/expected instead of a balance). Because
    `netContribution()`/`render()`'s subtotal logic already just read `a.balance`
    generically for any non-special "asset"-kind group, crypto needed ZERO changes to
    net-worth math — only `cardHtml()` needed a new display branch.
  - `acc.icon` is set to CoinGecko's icon URL automatically UNLESS the user pastes their
    own custom icon over it (the existing custom-icon-paste flow still works for crypto
    accounts too; `modalIcon` — the pasted-icon stage — takes priority over
    `modalCrypto.icon` on save). KNOWN MINOR QUIRK: clicking "Remove" on the icon picker
    for a crypto account doesn't actually clear it as long as `modalCrypto` is still
    populated (i.e. a lookup already ran) — the coin icon gets re-applied on save. Not
    fixed since it's a rare edge case; would need `modalIcon` to support an explicit
    "cleared" tri-state distinct from "never set" to fix properly.
  - `refreshCryptoPrices()` batches ALL crypto accounts' price fetches into ONE API call
    (`ids=id1,id2,...`) rather than one call per account, and is invoked (a) once at
    startup right after the initial `render()` (cards show last-known/cached values
    first, then live-update moments later once the fetch resolves), and (b) from any
    single crypto card's ⟳ button (which was repurposed FOR crypto accounts specifically
    — it means "refresh live price" instead of "paste a balance screenshot", since a
    live-quoted asset has no balance screenshot to paste; `cardHtml()`'s `updateBtn`
    branches on `isCrypto` to swap the button's behavior/title/data-attribute
    (`data-refresh-crypto` vs `data-update`)). Clicking any one crypto card's refresh
    button refreshes the price for ALL crypto accounts at once (simpler than a per-
    account-only refresh, and it's one API call either way).
  - Amounts are formatted via `formatCryptoAmount()` (up to 4 decimals if ≥1 unit, 8
    decimals if <1, trailing zeros trimmed) since crypto quantities are often fractional
    with many decimal places (e.g. 0.00032 BTC) — plain `toFixed(2)` would be wrong here.
  - Not wired into `randomizeDemoData()` yet (the demo-data generator predates this
    feature) — could be added as a nice touch later, but wasn't requested.

## Key decisions / boundaries
- Do NOT drive an automated browser logged into the user's real bank (session/credential
  security). Everything balance-related is user-captured (screenshot/paste) only.
- Real auto-sync (Plaid/OAuth aggregator) would need a backend + API keys — not built,
  not currently planned.
- No background clipboard watching (browser security) — the user must copy a screenshot
  then explicitly paste.
- The app is, and should stay, ad-free and free. If monetization ever comes up again, a
  paid "Pro" tier for something that inherently needs a backend (e.g. real cross-device
  sync) fits the privacy-first brand much better than ads would — this was discussed and
  explicitly rejected as a direction once already.

## Ideas discussed but not yet built
- Net-worth-over-time chart.
- Transactions per account, budgets, CSV import.
- Offline OCR (bundle Tesseract locally instead of loading it from a CDN).
- A "which account?" picker when OCR can't confidently match a pasted screenshot.

## Style notes
- Theme: an animated sky background — a light blue gradient (dark navy in dark mode)
  with 4 drifting white clouds (`.sky` fixed, `.cloud--1..4`) and, in dark mode, two
  tiled twinkling star layers. Clouds are built from DOM children
  (`.cloud__base` + two `.cloud__lobe`s), crisp and un-blurred — do not revert to a
  blurred/radial-gradient cloud style, it was explicitly replaced.
- Cards/panels: frosted-glass translucency via CSS variables (`--card`, `--card-strong`),
  `backdrop-filter: blur(8px)`, soft blue shadows. Buttons use `--accent-2` (blue) with
  white text. Do NOT hardcode colors that should instead reference the shared CSS
  variables — anything hardcoded needs a manual `html.dark` override, which is easy to
  forget (see the dark-mode section above).
- Vanilla JS only, no framework, no build step, unless explicitly asked to add one.
