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
  - **0% APR is a valid, supported value** (Aug 2026 fix) — some interest-free loans are
    real (0% intro cards, family loans). `canProject()` checks
    `Number.isFinite(Number(a.apr)) && Number(a.apr) >= 0` (was `> 0`, which silently
    excluded 0%), and `saveAccount()` persists `apr` whenever it's a finite number `>= 0`
    (was `> 0`, which deleted an explicitly-entered 0 as if the field were blank).
    GOTCHA: `acc.apr || "value"` patterns break for `apr === 0` since `0` is falsy —
    `aprInput.value` must use `acc.apr != null ? acc.apr : ""` instead, or re-editing a
    0%-APR account shows a blank APR field. `amortize()` itself needed no changes — with
    `r = 0` it already just does straight-line principal paydown with zero interest.
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
- **Upcoming dues: single designated Cash & Savings account drives a live-updating
  balance** (Aug 2026, superseding an earlier multi-select/arrow-format version). Every
  group header (pay-period, or plain month in the no-income fallback) shows `$start
  ($end)`, e.g. "Current paycheck · since Aug 28 · $5,000.00 ($3,500.00)" — parentheses,
  not an arrow. `end` is `start` minus that group's UNPAID dues only (paid items are
  skipped, same "already reflected in the real balance" reasoning the projection table
  already used). Balances still CHAIN across every period in order (including empty ones
  that get filtered from the visible list), and only future pay-periods add a paycheck's
  `balance` on top of the prior period's ending balance — the CURRENT period's start is
  always just the designated account's real, live `balance`.
  - **Exactly one** Cash & Savings account can be "the" designated account at a time —
    radio-button behavior, not a multi-select. `includeInCashFlow` is `true` on at most
    one cash-group account; `toggleCashFlowInclude()` clears it on every other cash
    account before setting it on the clicked one (and clicking the already-active one
    turns it off, leaving nobody designated). Checkmark button (✅/⬜,
    `data-toggle-cashflow`) lives in the account card's action row, between the
    screenshot-update button and Edit, rendered ONLY for `group === "cash"`. If nobody is
    designated, the `$start ($end)` annotation is omitted entirely (group headers show
    just their label, like before this feature existed) — `cashFlowStartBalance` is
    `null` in that case and every downstream calc checks for that before computing.
  - **Mark paid auto-deducts from the designated account's real `balance`** (not just a
    payment record) — `markPaidInstant()` looks up whichever cash account currently has
    `includeInCashFlow === true` and subtracts the bill's `monthlyObligation` from its
    stored balance, then calls `render()` (not just `renderCashFlow()`) so the account
    card's own displayed balance updates too. This is WHY `start` visibly "approaches"
    `end` as bills get marked paid within the current period: each deduction shrinks the
    real balance by exactly the amount removed from that period's unpaid-dues total, so
    the two numbers converge and meet once everything in that period is paid.
  - **Undo reverses the exact deduction**, not just the payment record. Each payment
    logged with an active designated account stores `deductedAccountId` +
    `deductedAmount` on itself; undoing looks up THOSE fields (not whatever's currently
    designated) and credits the balance back to the ORIGINAL account — this matters
    because the user can switch the designated account between marking something paid
    and undoing it, and undo must still refund the account it actually came out of.
  - Marking a bill paid EARLY (a bill that's grouped under a future paycheck, not the
    current period) still deducts from the real balance right away — intentional, and it
    "just works" through the existing chain math with no special-casing: the current
    period's start immediately reflects the reduced real balance, and that future bill's
    own group no longer subtracts it again since `paidInMonth()` now excludes it.
  - This is intentionally a SEPARATE number (`cashFlowStartBalance`, one account's real
    `balance`) from the sum of ALL cash accounts used by the Projection table's running
    balance (that sum is still computed internally as `cashOnHand` inside
    `renderCashFlow()`, just no longer shown as its own line — see the removal note
    below) — those two were deliberately left as-is; don't merge them without asking. An
    "Emergency Fund" can still count toward net worth while never being the account
    Upcoming dues tracks.
- **"Upcoming dues" renamed "Upcoming activity" + pending incoming/outgoing money** (Aug
  2026). The section now covers two kinds of items: due bills/liabilities (unchanged) and
  new "pending" entries for money that hasn't hit an account's real balance yet (e.g. a
  check from Mom, or a check YOU wrote that hasn't cleared) — a "+ Pending" button lives
  in the section's heading row (`.cashflow__heading-row`, a new flex wrapper; "Past due"
  and "Projection" headings were left as plain `<h3>`s, unchanged).
  - Data: `finance.pendingTx` in localStorage, an array of `{id, description, party,
    amount, direction: "in"|"out", createdAt}` — `direction` distinguishes "they're
    paying me" (adds to balance) from "I'm paying them" (subtracts), i.e. whether the
    OTHER party is the payer or the payee; the modal's "Payer (optional)" / "Payee
    (optional)" label swaps live based on the direction `<select>`
    (`updatePendingPartyLabel()`). `party` is free text with a `<datalist>` populated
    from existing account names on modal-open, purely for autocomplete convenience — it
    is NOT a foreign key, just a string.
  - **No per-entry target account** — pending entries always apply to whichever Cash &
    Savings account currently has `includeInCashFlow === true` (the SAME
    designated-account toggle Upcoming dues already used), read fresh at render time via
    `findDesignatedCashAccount()`. Opening the "+ Pending" modal with no account
    designated shows an `alert()` and refuses to open — this feature has no meaning
    without one.
  - **Always folded into the SAME `cashFlowStartBalance`** used by the per-period
    `$start ($end)` math above: `netPending` (sum of `+amount` for "in", `-amount` for
    "out") is added to the designated account's real balance once, right where
    `cashFlowStartBalance` is computed, so every downstream period/group calculation
    already accounts for it with zero extra logic.
  - **Rendering order: pending entries are ALWAYS first**, ahead of every pay-period/
    month group, via a `pendingHtml` string built once and prepended to
    `upcomingListEl.innerHTML` in BOTH the pay-period branch and the no-income fallback
    branch — they render as their own unlabeled-date "Pending" group
    (`pendingItemHtml()`), with a 📥/📤 icon and a signed `+`/`\u2212` amount
    (`.due-item--pending-in` / `--out` give a green/amber left accent, distinct from the
    review checklist's amber which is a DIFFERENT meaning — don't reuse that class).
  - **"Mark received"/"Mark sent" just deletes the entry** (`resolvePendingTx()`) — it
    does NOT touch any account's stored `balance`. This is deliberate: the real balance
    is expected to already reflect the cleared transaction via the user's next
    screenshot-paste/manual update, so adjusting it here would double-count.
  - The designated account's own card also shows a `.account-card__pending` line (e.g.
    "+$45.67 pending → $3,545.67") whenever `netPending !== 0` — computed independently
    in `cardHtml()` (same formula, doesn't share state with `renderCashFlow()`).
  - The Upcoming-activity empty state text changed from "No bills, loans, or dues yet."
    to "Nothing due or pending right now." to match the broader scope.
- **`balanceUpdatedAt`: "Updated Xd ago" on manually-maintained account balances** (Aug
  2026, small side request folded into the above). Any account type that shows the
  screenshot-update button (i.e. NOT income/bills/crypto) now stamps
  `acc.balanceUpdatedAt` (ISO string) whenever its balance is set via (a) the OCR
  screenshot-paste flow (`runUpdate()`), or (b) a manual edit through the Add/Edit modal
  where the submitted balance actually differs from what was stored (`saveAccount()`
  compares old vs new before stamping — resaving the modal without changing the balance
  does NOT bump the timestamp). Displayed via the existing `relativeTime()` helper
  (already built for crypto price staleness) as a small `.account-card__updated` row
  under the card's proprows/badges. Deliberately NOT stamped by the Mark-paid
  auto-deduction above — that's an automatic derived change, not "the user updating the
  balance," and conflating the two would defeat the point of showing when the number was
  last genuinely reconciled against the real account.
- **"Cash on hand" summary line removed** (Aug 2026) — the standalone callout above Past
  due/Upcoming dues (`.cashflow__cash`, `#cash-on-hand`) was deleted from index.html,
  along with its CSS and the `cashOnHandEl.textContent = ...` line in
  `renderCashFlow()`. The underlying `cashOnHand` sum (all Cash & Savings accounts) is
  STILL computed and still seeds the Projection table's running balance — only the
  standalone display line was removed, not the math. Don't reintroduce the old element
  ID (`#cash-on-hand`) without also restoring this computation's display wiring.
- **Upcoming dues: editable payment amount** (Aug 2026). Each unpaid item in the
  Upcoming dues list (NOT Past due — that section intentionally still shows a plain
  "Mark paid" button with static text, unchanged) now shows a small number input
  (`.due-item__amount-input`) prefilled with `monthlyObligation(a)`, right next to Mark
  paid. `dueItemHtml(a, opts)` gained `opts.editableAmount` (only passed `true` from the
  Upcoming dues render calls) to switch between the old static `"$60.00"` meta text and
  this input. `bindDueEvents()`'s mark-paid handler reads
  `btn.closest(".due-item").querySelector(".due-item__amount-input")` at click time and
  passes it as `overrideAmount` into `markPaidInstant(accountId, year, month,
  overrideAmount)` — if present, finite, and `>= 0`, it replaces the account's own
  min/expected default for that ONE payment (both the logged `payment.amount` AND the
  amount auto-deducted from the designated cash account). Leaving the input untouched
  (or clearing it) falls back to `monthlyObligation(acc)`, identical to the old behavior.
  The input was later widened (110px, 15px font) after the original 80px/13px version
  clipped larger amounts like "$1,522.74" — don't shrink it back below that without
  checking a 4-digit dollar amount still fits.
  - GOTCHA fixed (Aug 2026): editing the amount input did NOT live-update the group's
    displayed `$start (end)` — it only recalculated after actually clicking Mark paid
    and triggering a full re-render, since typed-but-unsaved input values obviously
    aren't in the account data `render()` reads from. Fixed by wrapping each group
    (header + its items) in a `.cashflow__group` container carrying
    `data-start-balance="<number>"` and `data-income-amount="<number>"` (the paycheck
    that starts THIS group, `0` for the no-income fallback and for every fallback
    month), plus a live `input` listener on every `.due-item__amount-input` inside
    `#upcoming-list` (bound in `bindDueEvents()`) that calls
    `recomputeGroupBalance(input.closest(".cashflow__group"))`.
  - FOLLOW-UP FIX (Aug 2026, same day): the first version of `recomputeGroupBalance()`
    only updated the ONE group containing the edited input — later paycheck groups kept
    showing their stale original balances instead of cascading the change forward, even
    though `renderCashFlow()`'s own initial calculation always chains every group in
    order. Rewrote it to walk FORWARD through `.cashflow__group` siblings in a loop:
    recompute the current group's end balance from its own (already-correct)
    `data-start-balance`, then write `nextSibling.dataset.startBalance = thisEnd +
    Number(nextSibling.dataset.incomeAmount)` before moving on and repeating for that
    next group — same chain formula as the render-time calculation, just re-run
    entirely in the DOM without a save. This means an edit to an EARLY group's amount
    now correctly ripples through every LATER group's displayed balance live, and a
    second edit to a LATER group still recomputes correctly since each group's
    `data-start-balance` attribute itself gets kept up to date as the cascade runs (not
    just the visible text). Both the pay-period and no-income-fallback branches got the
    same `.cashflow__group` wrapper — if you touch either branch's HTML template, keep
    the wrapper (and its `data-start-balance`/`data-income-amount`) in sync with the
    other, or this live recompute silently breaks for one of the two grouping modes.
    Verified: committing via Mark paid or a pending entry's Mark received/sent (which
    both trigger a full `render()`) already recomputes every group correctly from
    scratch regardless of this DOM-only cascade, since `cashFlowStartBalance` is always
    freshly derived from the (by-then-mutated) account balance — no separate fix needed
    for the "commit" path, only the "live typing" path needed the cascade added.
  - NOT A BUG (user report clarified, Aug 2026): a user thought editing "U.S. Bank" was
    "affecting the balance above" — it wasn't. The `$start (end)` line sits at the TOP
    of a group's own card stack (header renders before its items), so editing an item
    updates ITS OWN group's total, which visually appears "above" the input on screen
    even though it's the same group, not an earlier one. Verified with an automated
    test reproducing the exact scenario (Verizon in an earlier "Current paycheck"
    group, U.S. Bank + Earnest in a later "Paycheck · Sep 11" group): editing U.S. Bank
    only changed the Sep 11 group's own total, never the earlier Current-paycheck
    group's. If this comes up again, re-confirm with the same kind of before/after
    per-group dump before assuming there's a regression.
- **Projection table also live-updates from Upcoming activity's inputs** (Aug 2026,
  same feature family as the group cascade above). Previously the "Projection through
  ..." table only ever reflected each account's stored `monthlyObligation()` — editing
  an amount in Upcoming activity had zero effect on it until a full re-render. Fixed by:
  giving each `.cashflow__row` `data-year`/`data-month-idx`/`data-current`/`data-income`
  (baked in at render time, same values already used to compute that row), giving each
  editable `.due-item__amount-input` a `data-live-key="accountId|year|month"`, and
  storing the table's own starting balance as `projectionTableEl.dataset.cashOnHand`.
  `recomputeProjectionLive()` (called from the SAME `input` listener that already drives
  `recomputeGroupBalance()`) builds a `Map` of every currently-typed Upcoming-activity
  amount keyed the same way, then walks every projection row summing each due account's
  live-typed value if one exists for that exact account+year+month, else falling back
  to `monthlyObligation(a)` — then cascades `balance` forward across all 6 rows from the
  stored `cashOnHand` baseline, same running-total pattern as everywhere else in this
  feature family. Only rows for "this month" and "next month" can ever actually change
  (those are the only two months with any visible editable input at all — Past due
  items have no input, and months further out have no due-items shown anywhere), but
  the function still recomputes/rewrites every row's Balance cell since the cascade
  must propagate through all of them regardless of which single row actually changed.
  Like the group cascade, this is a DOM-only preview — committing via Mark paid,
  Mark received/sent, Undo, etc. always triggers a full `render()` which recomputes the
  whole table fresh from stored data (discarding any live-typed-but-uncommitted
  override), exactly matching how the Upcoming-activity group balance itself behaves.
- **Upcoming activity split into side-by-side Activity / Completed columns + a History
  popup** (Aug 2026 — biggest revision of this feature so far). Replaces the old design
  where a paid bill just showed inline (within the same group) as a muted "Paid $X ·
  date · Undo" row mixed in with still-unpaid ones.
  - **Layout**: `.activity-columns` (flex row, `.activity-column` × 2, stacks vertically
    under 640px) holds `#upcoming-list` ("Activity" — still-unpaid bills + unresolved
    pending) and `#completed-list` ("Completed" — paid bills + resolved pending, SAME
    pay-period/month groups and SAME group labels as Activity, so the two columns line
    up period-for-period). A `🕑 History` button sits next to `+ Pending` in the
    section's heading row, opening `#history-modal`.
  - **Data model change — nothing is deleted anymore, just flagged**: `payments` is no
    longer pruned by age (`loadPayments()`/`savePayments()` had their 3-month
    `prunePayments()` cutoff removed entirely — full history is kept forever, per
    explicit request). Pending entries gained `resolvedAt` (ISO string): `Mark
    received`/`Mark sent` (`resolvePendingTx()`) now just SETS `resolvedAt` instead of
    removing the entry from `pendingTx`; `restorePendingTx()` clears it again. This is
    what makes "move it back" possible for pending money — for bills, "move it back" was
    already possible for free via the pre-existing Undo mechanism (deleting the
    `payments` record), just renamed/relocated in the UI as `undoPayment()` (button
    label "&#8617; Return to activity") and rendered in the Completed column instead of
    inline. GOTCHA: don't reintroduce ANY age-based pruning on `payments` without
    re-checking this — it was a deliberate removal, not an oversight.
  - **Splitting logic**: `renderCashFlow()` still builds the exact same `payPeriods` /
    `upcomingGroups` (with the same `startBalance` chain) as before splitting anything —
    then `buildGroupPair(groups, labelFor)` partitions each group's `items` into `unpaid`
    (→ Activity, via `dueItemHtml`, unchanged/simplified — it no longer has a "paid"
    branch at all, since paid items never reach it anymore) and `paidItems` (→
    Completed, via the NEW `completedItemHtml(a, opts)`). Same split for pending:
    `activePending` (`!p.resolvedAt`) → Activity's "Pending" mini-group;
    `completedPending` (`p.resolvedAt` within the current+next-month window) →
    Completed's own "Pending" mini-group, via the NEW `completedPendingItemHtml(p)`.
  - **Completed's own `$start (end)`**: reuses the SAME `g.startBalance` Activity's group
    already has (so both columns agree on where the period started), but Completed's
    own "end" = `startBalance - sum(paid amounts for that period)` — i.e. "here's where
    you'd be if you'd paid ONLY what's already been paid," a deliberately different
    number from Activity's own end ("here's where you'd be if you paid what's LEFT").
    Groups with zero unpaid items don't render in Activity; groups with zero paid items
    don't render in Completed — independently, so a period can legitimately appear in
    one column, both, or neither.
  - **GOTCHA already found+fixed**: `cashFlowStartBalance`'s `netPending` calculation
    (and the identical one in `cardHtml()`'s account-card pending annotation) originally
    summed ALL of `pendingTx`, including already-resolved entries — meaning resolving a
    pending item didn't stop it from inflating the displayed "adjusted" balance. Both
    were fixed to `.filter((p) => !p.resolvedAt)` before summing. Any other place that
    ever sums `pendingTx` amounts must do the same filter, or resolved money keeps
    "counting" forever.
  - **History popup** (`renderHistory()`, called fresh every time the modal opens —
    doesn't stay live-bound in the background): combines EVERY `payments` record +
    EVERY resolved `pendingTx` entry, regardless of date, sorted newest-first, grouped
    by month header (same `.cashflow__group-month` visual pattern as everywhere else),
    each row with a "Return to activity" button wired to `undoPayment()` or
    `restorePendingTx()` (which re-calls `renderHistory()` afterward too, so the
    still-open modal reflects the change immediately, in addition to the normal
    background `render()` those functions already trigger).
  - Icons: 📥 (money in) / 📤 (money out) reused consistently across Activity's pending
    rows, Completed's pending rows, and History's bill+pending rows, so the same visual
    language means the same thing everywhere in this feature.
- **Pending money now actually lands in the real account balance on resolve (bug fix +
  new capabilities, Aug 2026)**. Follow-up to the Activity/Completed/History feature
  above — three related fixes/additions in one pass:
  - **BUG FIXED — resolving pending money never touched the real balance.** Originally
    `resolvePendingTx()` only set `resolvedAt`; the designated cash account's `a.balance`
    was NEVER actually incremented/decremented — the "+$X pending → $Y" figure on the
    account card was only ever a display-time preview (`netPending`, computed live from
    unresolved `pendingTx`), never committed anywhere. So marking something "received"
    made it disappear from that preview with nothing replacing it — the money vanished.
    Fixed by giving `resolvePendingTx()` the exact same commit-on-action pattern
    `markPaidInstant()` already uses for bills: it now looks up
    `findDesignatedCashAccount()` and does
    `designated.balance += (direction === "out" ? -amount : +amount)` at the moment of
    resolution (not before — adding a pending entry, or just typing into the modal,
    still never touches any account's real balance, only the preview), and stamps
    `p.resolvedAccountId` so `restorePendingTx()` can reverse the exact same account
    later even if the "designated" account is changed in the meantime (mirrors how
    `payment.deductedAccountId` works for bills). `restorePendingTx()` reverses that
    delta before clearing `resolvedAt`/`resolvedAccountId`. GOTCHA: any future change to
    the pending-money flow must preserve "balance changes exactly once, at the resolve
    action, and reverses exactly once, at the restore action" — don't let the preview
    (`netPending`) and the committed balance both apply the same money twice.
  - **Delete pending items.** Unresolved pending entries in the Activity column now have
    a 🗑 delete button (`data-delete-pending`) next to Mark received/sent, wired to the
    new `deletePendingTx(id)` — a `confirm()`-gated permanent removal from `pendingTx`
    (no balance effect either way, since unresolved pending never touched the real
    balance to begin with). This is for entries added by mistake; it's intentionally
    NOT available on Completed/History rows — those represent money that's already
    landed in the real balance, so removing them there goes through "Return to
    activity" (a real reversal) rather than a silent delete.
  - **Completed pending rows now show the amount.** `completedPendingItemHtml()` was
    previously missing the amount entirely (just description + party + date) — added a
    colored `+`/`−` amount span matching the Activity row's styling, so you can see how
    much money was actually involved without having to open History.
  - **New: hover tooltip breaking down "original + pending = adjusted."** Hovering the
    `.account-card__pending` badge (the "+$X pending → $Y" line, only ever shown on the
    designated cash account) now shows a `.balance-tooltip` popup listing "Original
    balance", "+ Pending in" / "− Pending out" (only the non-zero one(s) — pure-incoming
    or pure-outgoing periods only show one line), and "= Adjusted", so it's clear what
    the displayed adjusted number is actually built from. Implemented as a single
    reusable floating tooltip element (`balanceTooltipEl`, appended to `document.body`),
    positioned via `getBoundingClientRect()` on mouseover — same pattern as the existing
    `calTooltipEl` calendar hover popup, reusing its `.calendar-tooltip` container CSS
    class (position:fixed, blur backdrop, shadow) with a new `.balance-tooltip__row`
    modifier (flex space-between layout, last row gets a divider) for its label/value
    rows. Data is passed via `data-original`/`data-pending-in`/`data-pending-out`
    attributes baked onto the badge at render time (`cardHtml()`), read by
    `showBalanceTooltip()` on hover — no per-render JS binding needed since it's a single
    delegated `mouseover`/`mouseout` listener on `accountsEl`.
- **"Accounts" / "Cash Flow" section headings removed** (Aug 2026), along with the
  `.section-head` wrapper div entirely (now dead CSS, deleted). `+ Add account` moved out
  of that removed header and is now its own full-width `.btn--add-account` element,
  positioned directly below the Net worth summary card and above the account groups —
  matches the visual weight of an `.account-group` card (full-width, rounded, padded)
  rather than a small corner button. `.cashflow` picked up its own `margin-top: 22px`
  since it used to get its top spacing for free from the now-deleted "Cash Flow"
  section-head's margin.
- **Single "Mark paid" is instant, no prompt.** Clicking "Mark paid" on an individual due
  item logs a payment immediately using the account's default amount (`minAmount`) and an
  appropriate date — no modal, no confirmation. (A "Mark all paid" bulk button + its own
  confirm dialog existed for a while but was later removed entirely per user request —
  don't reintroduce it without being asked.)
- **Per-account "auto-deduct from balance when marked paid"** (Aug 2026, off by default).
  A checkbox (`#acc-autodeduct` → `acc.autoDeductOnPay`) in the Add/Edit modal, shown only
  for liability and property types (`autoDeductField.hidden = !(isLiability ||
  isProperty)` in `applyTypeUI()` — bills don't have a real balance to pay down, so
  they're excluded). This is a SEPARATE mechanism from the designated-cash-account
  auto-deduction described above: that one pulls money OUT of a checking/savings account
  paying the bill; this one reduces the bill/liability account's OWN stored balance,
  e.g. paying down a credit card or loan. Both can fire from the same `markPaidInstant()`
  call independently — a single "Mark paid" click can deduct from the designated cash
  account AND pay down the card, if both are configured.
  - Implementation: in `markPaidInstant()`, `if (acc.autoDeductOnPay) { ... }` reduces
    `acc.balance` by the paid amount, clamped at 0 with `Math.max(0, ...)` (a liability's
    `balance` is stored as a positive "amount owed" magnitude, same convention used for
    display — see `isLiability ? -Math.abs(a.balance) : a.balance`). The ACTUAL amount
    removed (which can be less than the payment amount if clamping kicked in) is stored
    on the payment as `payment.selfDeductedAmount`, so Undo can precisely reverse it by
    crediting `payment.accountId`'s balance back up — mirrors the existing
    `deductedAccountId`/`deductedAmount` pattern for the designated cash account, just
    keyed to the bill account itself instead of a separate cash account.
  - GOTCHA avoided: Past due list items disappear entirely once paid (it filters to only
    still-unpaid items), so there's no Undo reachable for them there — Undo only shows up
    for items in a bucket that doesn't filter out paid entries (e.g. Upcoming dues' own
    month/pay-period bucket). This is pre-existing behavior, not something this feature
    changed, but it's easy to forget when testing "mark paid then undo" manually.
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
- **Account review checklist** (optional, off by default; toggled in Settings via
  `#review-toggle-btn` → `finance.reviewEnabled` in localStorage, gated behind the
  `reviewFeatureEnabled` module flag). Only Cash & Savings and Credit Card accounts
  (`needsReviewCheck()`: `groupOf(a) === "cash" || "credit"`) are eligible — the idea is
  accounts with lots of individual transactions worth eyeballing for anything
  suspicious, unlike a mortgage or a bill.
  - There's deliberately NO stored boolean flag for "is this checked". Instead each
    account gets `a.reviewedAt` (an ISO timestamp, set by `toggleReviewed()`), and
    `isAccountReviewed(a)` derives the current checked state by comparing that timestamp
    against `currentReviewPeriodStart()` — the start of the most recent payday (across
    ALL income accounts, today counts) or, with no income accounts configured, the start
    of the current calendar month. This is WHY the checkmark "resets on payday" for
    free: once a new payday's date moves past the account's `reviewedAt`, the same
    stored data now evaluates as unreviewed again — no cron/interval/mutation needed,
    and it's correct even if the app was closed when the payday happened.
  - UI: a 🔍 (needs review) / 🛡️ (reviewed) toggle button in the account card's action
    row (between the Upcoming-dues-balance checkmark and Edit), plus the WHOLE card gets
    a `.account-card--needs-review` class (amber left accent bar + soft amber shadow,
    hardcoded hex, not tied to `--danger`/`--accent` since this is a gentle reminder, not
    an error state) when eligible and not yet reviewed this period.
  - Reuses `paydaysInRange()` (already built for the calendar/Upcoming-dues features) —
    no new payday-scheduling logic was needed, just a new consumer of it.
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
  - **Per-coin PRICE display** (distinct from the amount above, and from the account's
    total dollar `balance`) uses `formatCryptoPrice()`, not `money()` — plain `money()`
    rounds to 2 decimals, which shows "$0.00" for the many sub-$1 coins (SHIB, PEPE,
    etc.). Rule: for prices `>= 1` (or `<= 0`), it's just normal 2-decimal currency. For
    `0 < price < 1`, count the leading zeros right after the decimal point, then show 5
    significant digits starting at the first nonzero one — e.g. a coin priced at
    ~0.0000050600 (4 leading zeros) displays as `$0.0000050600` instead of `$0.00`.
    Implemented by reading `n.toFixed(20)`'s fractional string to count zeros, then
    re-`toFixed`-ing to `leadingZeros + 5` decimals (capped at 18 as a float-precision
    safety net). Used in both the account card's "Price" row and the Add/Edit modal's
    live crypto preview line.
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
