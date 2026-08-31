// ---- Finance app state ----
// Each account type belongs to a display group; the group's kind drives net-worth math.
const ACCOUNT_TYPES = {
  salary: { label: "Paycheck / Salary", group: "income", emoji: "\uD83D\uDCB0" },
  checking: { label: "Checking", group: "cash", emoji: "\uD83C\uDFE6" },
  savings: { label: "Savings", group: "cash", emoji: "\uD83D\uDC8E" },
  cash: { label: "Cash", group: "cash", emoji: "\uD83D\uDCB5" },
  investment: { label: "Investment", group: "invest", emoji: "\uD83D\uDCC8" },
  retirement: { label: "Retirement (401k / IRA)", group: "invest", emoji: "\uD83C\uDFDD\uFE0F" },
  crypto: { label: "Cryptocurrency", group: "crypto", emoji: "\uD83E\uDE99" },
  property: { label: "Home / Mortgage", group: "property", emoji: "\uD83C\uDFE1" },
  credit: { label: "Credit card", group: "credit", emoji: "\uD83D\uDCB3" },
  loan: { label: "Personal loan", group: "loans", emoji: "\uD83E\uDDFE" },
  student: { label: "Student loan", group: "loans", emoji: "\uD83C\uDF93" },
  auto: { label: "Auto loan", group: "loans", emoji: "\uD83D\uDE97" },
  internet: { label: "Internet", group: "bills", emoji: "\uD83C\uDF10" },
  phone: { label: "Phone", group: "bills", emoji: "\uD83D\uDCF1" },
  utility: { label: "Utility", group: "bills", emoji: "\uD83D\uDCA1" },
  subscription: { label: "Subscription", group: "bills", emoji: "\uD83D\uDCFA" },
  insurance: { label: "Insurance", group: "bills", emoji: "\uD83D\uDEE1\uFE0F" },
  donation: { label: "Donation", group: "bills", emoji: "\uD83E\uDD1D" },
  bill: { label: "Other bill", group: "bills", emoji: "\uD83E\uDDFE" },
};

const GROUPS = {
  income: { label: "Income", kind: "income" },
  cash: { label: "Cash & Savings", kind: "asset" },
  invest: { label: "Investments & Retirement", kind: "asset" },
  crypto: { label: "Crypto", kind: "asset" },
  property: { label: "Property", kind: "property" },
  credit: { label: "Credit Cards", kind: "liability" },
  loans: { label: "Loans", kind: "liability" },
  bills: { label: "Monthly Bills", kind: "expense" },
};
const GROUP_ORDER = ["income", "cash", "invest", "crypto", "property", "credit", "loans", "bills"];

function typeMeta(type) {
  return ACCOUNT_TYPES[type] || ACCOUNT_TYPES.checking;
}
function groupOf(account) {
  return typeMeta(account.type).group;
}
function emojiFor(type) {
  return typeMeta(type).emoji;
}
// Signed contribution of an account to net worth.
function netContribution(a) {
  const g = groupOf(a);
  if (g === "income" || g === "bills") return 0; // cash flow, not a stored balance
  if (g === "property") return (Number(a.homeValue) || 0) - Math.abs(Number(a.balance) || 0);
  if (GROUPS[g] && GROUPS[g].kind === "liability") return -Math.abs(Number(a.balance) || 0);
  return Number(a.balance) || 0;
}
// Average of the provided (non-empty) home-value estimates, or null.
function avgEstimate(...vals) {
  const nums = vals.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// ---- Paycheck scheduling ----
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}
// The two day-of-month paydays for a twice-a-month schedule, derived from the last pay date.
function semimonthlyDays(dom) {
  return [dom, dom <= 15 ? dom + 15 : dom - 15];
}
// The upcoming paydays (strictly after today) for a salary account, newest first `count`.
function upcomingPaydays(freq, lastDateStr, count = 2) {
  const last = parseLocalDate(lastDateStr);
  if (!last) return [];
  const today = startOfToday();
  const out = [];
  if (freq === "semimonthly") {
    const [a, b] = semimonthlyDays(last.getDate());
    for (let m = 0; m <= 4 && out.length < count; m++) {
      const base = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      for (const day of [Math.min(a, lastDay), Math.min(b, lastDay)].sort((x, y) => x - y)) {
        const d = new Date(base.getFullYear(), base.getMonth(), day);
        if (d > today) out.push(d);
      }
    }
    return out.slice(0, count);
  }
  // biweekly (default)
  const d = new Date(last);
  while (d <= today) d.setDate(d.getDate() + 14);
  for (let i = 0; i < count; i++) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 14);
  }
  return out;
}
// Estimated monthly take-home from net pay + schedule.
function monthlyIncome(freq, netPay) {
  const n = Number(netPay) || 0;
  return freq === "semimonthly" ? n * 2 : (n * 26) / 12;
}
// All paydays for a salary account that fall within [start, end] (inclusive), for projections.
function paydaysInRange(freq, lastDateStr, start, end) {
  const last = parseLocalDate(lastDateStr);
  if (!last) return [];
  const out = [];
  if (freq === "semimonthly") {
    const [a, b] = semimonthlyDays(last.getDate());
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      for (const day of [Math.min(a, lastDay), Math.min(b, lastDay)].sort((x, y) => x - y)) {
        const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
        if (d >= start && d <= end) out.push(d);
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }
  // biweekly (default)
  const d = new Date(last);
  while (d < start) d.setDate(d.getDate() + 14);
  while (d <= end) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 14);
  }
  return out;
}

// ---- Cash flow: bills/loans/dues + payment log ----
// Whether an account is a recurring monthly obligation (bill, credit card, loan, or mortgage).
function isDueAccount(a) {
  const g = groupOf(a);
  return g === "bills" || g === "property" || (GROUPS[g] && GROUPS[g].kind === "liability");
}
// The amount expected to be paid this cycle: the bill's/liability's min/expected amount.
// Bills used to store their amount as `balance`; fall back to it for accounts not yet re-saved.
function monthlyObligation(a) {
  if (Number(a.minAmount) > 0) return Number(a.minAmount);
  return groupOf(a) === "bills" ? Math.abs(Number(a.balance) || 0) : 0;
}

// ---- Amortization / payoff projection ----
// The monthly payment we assume for a debt: its min/expected amount.
function payoffPayment(a) {
  return Number(a.minAmount) || 0;
}
// Whether a debt has enough info to project a payoff (has an APR set, even 0%, + a payment).
function canProject(a) {
  return (
    (GROUPS[groupOf(a)] && (GROUPS[groupOf(a)].kind === "liability" || groupOf(a) === "property")) &&
    Number.isFinite(Number(a.apr)) &&
    Number(a.apr) >= 0 &&
    payoffPayment(a) > 0 &&
    Math.abs(Number(a.balance) || 0) > 0
  );
}
// Build a month-by-month payoff schedule.
// balance: amount owed (positive); apr: annual %, payment: fixed monthly payment.
function amortize(balance, apr, payment) {
  const B0 = Math.abs(Number(balance) || 0);
  const P = Math.max(0, Number(payment) || 0);
  const r = (Number(apr) || 0) / 100 / 12;
  const out = {
    months: 0,
    totalInterest: 0,
    totalPaid: 0,
    schedule: [],
    neverPays: false,
    monthlyInterest: r * B0,
    principal: B0,
  };
  if (B0 <= 0 || P <= 0) return out;
  // Payment can't cover the first month's interest -> balance never shrinks.
  if (r > 0 && P <= r * B0) {
    out.neverPays = true;
    return out;
  }
  let bal = B0;
  const start = new Date();
  const MAX = 1200; // 100-year guard against runaway loops
  for (let n = 1; n <= MAX && bal > 0.005; n++) {
    const interest = r * bal;
    let principal = P - interest;
    if (principal > bal) principal = bal;
    const pay = principal + interest;
    bal -= principal;
    out.totalInterest += interest;
    out.totalPaid += pay;
    out.schedule.push({
      n,
      date: new Date(start.getFullYear(), start.getMonth() + n, 1),
      payment: pay,
      principal,
      interest,
      balance: Math.max(0, bal),
    });
    out.months = n;
  }
  return out;
}
// Short "Mar 2029" label from a Date.
function monthYear(d) {
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
// Short "Sep 8" label from a Date (no year — used for near-term paycheck grouping).
function monthDay(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// "3 yr 4 mo" style label from a month count.
function durationLabel(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} yr`);
  if (m) parts.push(`${m} mo`);
  return parts.join(" ") || "0 mo";
}

function loadPayments() {
  try {
    const arr = JSON.parse(localStorage.getItem("finance.payments"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function savePayments() {
  localStorage.setItem("finance.payments", JSON.stringify(payments));
}
function paymentsFor(accountId) {
  return payments.filter((p) => p.accountId === accountId).sort((a, b) => (a.date < b.date ? 1 : -1));
}
function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
// The payment (if any) logged for an account in a specific calendar month.
function paidInMonth(accountId, year, month) {
  const key = currentMonthKey(new Date(year, month, 1));
  return paymentsFor(accountId).find((p) => p.date.slice(0, 7) === key) || null;
}
function paidThisMonth(accountId) {
  const now = new Date();
  return paidInMonth(accountId, now.getFullYear(), now.getMonth());
}
// True if an account's due day (clamped to the target month's length) falls before the given day-of-month.
function dueDayBefore(a, day, daysInMonth) {
  if (!a.dueDay) return false;
  return Math.min(a.dueDay, daysInMonth) < day;
}
// Due-date calendar coloring applies from last month onward, with no future cutoff.
function monthInDueRange(year, month) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const target = new Date(year, month, 1);
  return target >= start;
}
function formatShortDate(dateStr) {
  const d = parseLocalDate(dateStr);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : dateStr;
}
// Every {year, month} bucket from this month through January of next calendar year.
function projectionMonths() {
  const now = new Date();
  const months = [];
  let y = now.getFullYear();
  let m = now.getMonth();
  const endY = now.getFullYear() + 1;
  while (y < endY || (y === endY && m <= 0)) {
    months.push({ year: y, month: m });
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return months;
}

let payments = loadPayments();

// ---- Pending incoming/outgoing money (not yet reflected in an account's real balance) ----
function loadPendingTx() {
  try {
    const arr = JSON.parse(localStorage.getItem("finance.pendingTx"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function savePendingTx() {
  localStorage.setItem("finance.pendingTx", JSON.stringify(pendingTx));
}
let pendingTx = loadPendingTx();
// Which paycheck period a pending entry belongs to (see renderCashFlow's keyFor()) and the currently
// available periods to assign one to — both refreshed on every render, read by the "+ Pending" modal.
let currentPeriodKey = null;
let periodOptions = [];

let accounts = load();
let groupOrder = loadGroupOrder();
let editingId = null;


// ---- Elements ----
const accountsEl = document.getElementById("accounts");
const netWorthEl = document.getElementById("net-worth");
const netWorthMetaEl = document.getElementById("net-worth-meta");
const pastDueBlockEl = document.getElementById("past-due-block");
const pastDueListEl = document.getElementById("past-due-list");
const upcomingListEl = document.getElementById("upcoming-list");
const completedListEl = document.getElementById("completed-list");
const projectionTableEl = document.getElementById("projection-table");
const projectionEndLabelEl = document.getElementById("projection-end-label");

const modal = document.getElementById("account-modal");
const modalTitle = document.getElementById("modal-title");
const nameInput = document.getElementById("acc-name");
const urlInput = document.getElementById("acc-url");
const typeInput = document.getElementById("acc-type");
const balanceInput = document.getElementById("acc-balance");
const deleteBtn = document.getElementById("delete-account-btn");
const iconPreviewEl = document.getElementById("acc-icon-preview");
const pasteIconBtn = document.getElementById("paste-icon-btn");
const clearIconBtn = document.getElementById("clear-icon-btn");
const iconHintEl = document.getElementById("icon-hint");
const ICON_HINT_DEFAULT = iconHintEl.textContent;
const balanceLabel = document.getElementById("acc-balance-label");
const balanceField = document.getElementById("balance-field");
const minAmountLabel = document.getElementById("acc-minamount-label");
const propertyFields = document.getElementById("property-fields");
const addressInput = document.getElementById("acc-address");
const zillowInput = document.getElementById("acc-zillow");
const redfinInput = document.getElementById("acc-redfin");
const homeValueDisplay = document.getElementById("home-value-display");
const mortgageOwedDisplay = document.getElementById("mortgage-owed-display");
const equityDisplay = document.getElementById("equity-display");
const incomeFields = document.getElementById("income-fields");
const payFreqInput = document.getElementById("acc-payfreq");
const lastPayInput = document.getElementById("acc-lastpay");
const nextPayDisplay = document.getElementById("next-pay-display");
const followingPayDisplay = document.getElementById("following-pay-display");
const monthlyIncomeDisplay = document.getElementById("monthly-income-display");
const cryptoFields = document.getElementById("crypto-fields");
const cryptoQueryInput = document.getElementById("acc-crypto-query");
const cryptoAmountInput = document.getElementById("acc-crypto-amount");
const cryptoHintEl = document.getElementById("crypto-hint");
const CRYPTO_HINT_DEFAULT = cryptoHintEl.textContent;
const cryptoPreviewEl = document.getElementById("crypto-preview");
const cryptoPreviewIconEl = document.getElementById("crypto-preview-icon");
const cryptoPreviewNameEl = document.getElementById("crypto-preview-name");
const cryptoPreviewPriceEl = document.getElementById("crypto-preview-price");
const cryptoPreviewValueEl = document.getElementById("crypto-preview-value");
let modalCrypto = null; // staged {id, symbol, name, icon, price, priceAt} from a coin lookup in the open modal
const dueDayField = document.getElementById("dueday-field");
const dueDayInput = document.getElementById("acc-dueday");
const minAmountInput = document.getElementById("acc-minamount");
const dueDaySubfield = document.getElementById("dueday-subfield");
const autoDeductField = document.getElementById("autodeduct-field");
const autoDeductInput = document.getElementById("acc-autodeduct");
const aprField = document.getElementById("apr-field");
const aprInput = document.getElementById("acc-apr");
const origBalanceInput = document.getElementById("acc-origbalance");
const payoffByField = document.getElementById("payoffby-field");
const payoffByInput = document.getElementById("acc-payoffby");
let modalIcon = null; // custom icon (data URL) staged in the open modal

// ---- Events ----
document.getElementById("add-account-btn").addEventListener("click", openAddModal);
document.getElementById("cancel-account-btn").addEventListener("click", closeModal);
document.getElementById("save-account-btn").addEventListener("click", saveAccount);
deleteBtn.addEventListener("click", deleteAccount);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

// Custom icon: paste a screenshot (for sites whose favicon won't load).
// A hidden textarea catches the Cmd+V so no clipboard permission is needed.
const iconPasteCatcher = document.createElement("textarea");
iconPasteCatcher.setAttribute("aria-hidden", "true");
iconPasteCatcher.tabIndex = -1;
iconPasteCatcher.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
document.body.appendChild(iconPasteCatcher);

pasteIconBtn.addEventListener("click", () => {
  iconHintEl.textContent = "Now press \u2318V to paste your screenshot.";
  iconPasteCatcher.value = "";
  iconPasteCatcher.focus();
});

clearIconBtn.addEventListener("click", () => {
  modalIcon = null;
  renderIconPreview();
  iconHintEl.textContent = ICON_HINT_DEFAULT;
});

iconPasteCatcher.addEventListener("paste", async (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) {
    iconHintEl.textContent = "That wasn't an image. Copy a screenshot of the logo and try again.";
    return;
  }
  e.preventDefault();
  try {
    modalIcon = await blobToIcon(item.getAsFile());
    renderIconPreview();
    iconHintEl.textContent = "Icon set \u2014 click Save to apply.";
  } catch {
    iconHintEl.textContent = "Couldn't read that image. Try another screenshot.";
  }
});

// Keep the favicon/emoji preview in sync while typing, unless a custom icon is set.
urlInput.addEventListener("input", () => {
  if (!modalIcon) renderIconPreview();
});
typeInput.addEventListener("change", () => {
  if (!modalIcon) renderIconPreview();
  applyTypeUI();
});

[zillowInput, redfinInput, balanceInput].forEach((el) =>
  el.addEventListener("input", updateEquityPreview)
);
document.getElementById("lookup-zillow").addEventListener("click", () => openEstimate("zillow"));
document.getElementById("lookup-redfin").addEventListener("click", () => openEstimate("redfin"));

[payFreqInput, lastPayInput, balanceInput].forEach((el) =>
  el.addEventListener("input", updateIncomePreview)
);

// Adapt the modal to the selected type (property fields, income fields, balance label).
function applyTypeUI() {
  const group = groupOf({ type: typeInput.value });
  const isProperty = group === "property";
  const isIncome = group === "income";
  const isExpense = group === "bills";
  const isCrypto = group === "crypto";
  const isLiability = GROUPS[group] && GROUPS[group].kind === "liability";
  propertyFields.hidden = !isProperty;
  incomeFields.hidden = !isIncome;
  cryptoFields.hidden = !isCrypto;
  balanceField.hidden = isExpense || isCrypto; // bills use Min/expected, crypto is amount × live price
  dueDayField.hidden = !(isLiability || isExpense || isProperty);
  dueDaySubfield.hidden = !(isLiability || isExpense || isProperty);
  autoDeductField.hidden = !(isLiability || isProperty); // only accounts with a real owed balance can pay it down
  aprField.hidden = !(isLiability || isProperty); // payoff projection needs a rate on debts only
  payoffByField.hidden = !(isLiability || isProperty);
  minAmountLabel.textContent = isExpense ? "Monthly amount" : "Min / expected amount (optional)";
  if (isProperty) balanceLabel.textContent = "Mortgage balance owed";
  else if (isIncome) balanceLabel.textContent = "Net paycheck (after tax)";
  else if (isLiability) balanceLabel.textContent = "Amount owed";
  else balanceLabel.textContent = "Current balance (optional)";
  if (isProperty) updateEquityPreview();
  if (isIncome) updateIncomePreview();
  if (isCrypto) updateCryptoPreview();
}

// Live preview of the next paydays + estimated monthly income in the modal.
function updateIncomePreview() {
  if (incomeFields.hidden) return;
  const freq = payFreqInput.value;
  const days = upcomingPaydays(freq, lastPayInput.value, 2);
  nextPayDisplay.textContent = days[0] ? formatPayday(days[0]) : "\u2014";
  followingPayDisplay.textContent = days[1] ? formatPayday(days[1]) : "\u2014";
  monthlyIncomeDisplay.textContent = money(monthlyIncome(freq, balanceInput.value));
}

// e.g. "Fri, Sep 12 · in 5 days"
function formatPayday(date) {
  const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const days = Math.round((date - startOfToday()) / 86400000);
  const rel = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${label} \u00b7 ${rel}`;
}

// e.g. 15 -> "15th"
function ordinalDay(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function updateEquityPreview() {
  const value = avgEstimate(zillowInput.value, redfinInput.value) || 0;
  const owed = Math.abs(parseFloat(balanceInput.value) || 0);
  homeValueDisplay.textContent = money(value);
  mortgageOwedDisplay.textContent = money(-owed);
  equityDisplay.textContent = money(value - owed);
}

// Open Zillow / Redfin for the entered address so the user can grab an estimate.
function openEstimate(site) {
  const addr = addressInput.value.trim();
  if (!addr) {
    alert("Enter the property address first.");
    return;
  }
  const q = encodeURIComponent(addr);
  const url =
    site === "zillow"
      ? `https://www.zillow.com/homes/${q}_rb/`
      : `https://www.google.com/search?q=redfin+estimate+${q}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---- Crypto: coin lookup + live price via the free CoinGecko public API (no key, CORS-friendly) ----
// Resolve a typed symbol/name (e.g. "BTC", "solana") to a specific coin + its live USD price + icon.
async function lookupCryptoCoin() {
  const query = cryptoQueryInput.value.trim();
  if (!query) {
    cryptoHintEl.textContent = "Type a coin symbol or name first, e.g. BTC.";
    return;
  }
  cryptoHintEl.textContent = "Looking up\u2026";
  try {
    const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`);
    const searchData = await searchRes.json();
    const coin = searchData.coins && searchData.coins[0];
    if (!coin) {
      cryptoHintEl.textContent = "No matching coin found. Try the full name or a common symbol like ETH.";
      return;
    }
    const price = await fetchCryptoPrice(coin.id);
    modalCrypto = {
      id: coin.id,
      symbol: (coin.symbol || "").toUpperCase(),
      name: coin.name,
      icon: coin.large || coin.thumb || "",
      price: price,
      priceAt: new Date().toISOString(),
    };
    cryptoHintEl.textContent = price
      ? "Found it \u2014 enter the amount you hold and save."
      : "Found the coin, but couldn't fetch a live price right now.";
    updateCryptoPreview();
  } catch {
    cryptoHintEl.textContent = "Lookup failed \u2014 check your connection and try again.";
  }
}

// Live USD price for one coin id via CoinGecko's simple/price endpoint, or null on failure.
async function fetchCryptoPrice(id) {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`);
    const data = await res.json();
    return data[id] ? Number(data[id].usd) : null;
  } catch {
    return null;
  }
}

// Live USD prices for several coin ids in one batched call. Returns a Map(id -> price).
async function fetchCryptoPrices(ids) {
  const out = new Map();
  if (!ids.length) return out;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`);
    const data = await res.json();
    for (const id of ids) if (data[id]) out.set(id, Number(data[id].usd));
  } catch {
    // Offline or rate-limited — callers keep the last-known prices.
  }
  return out;
}

// Trim a crypto quantity to a sensible number of decimals (e.g. 0.5, 12.345) without trailing zeros.
function formatCryptoAmount(n) {
  const num = Number(n) || 0;
  const decimals = num >= 1 ? 4 : 8;
  return String(Math.round(num * 10 ** decimals) / 10 ** decimals);
}

// Formats a crypto PRICE (not a holding's total value) so sub-$1 coins don't just round to "$0.00":
// count the leading zeros right after the decimal point, then show 5 significant digits from the
// first nonzero one on — e.g. $0.00000123457 for a coin priced at ~0.0000012346. $1+ prices just use
// normal 2-decimal currency formatting.
function formatCryptoPrice(price) {
  const n = Number(price) || 0;
  if (n <= 0 || n >= 1) return money(n);
  const frac = n.toFixed(20).split(".")[1] || "";
  let leadingZeros = 0;
  while (leadingZeros < frac.length && frac[leadingZeros] === "0") leadingZeros++;
  const decimals = Math.min(leadingZeros + 5, 18);
  return `$${n.toFixed(decimals)}`;
}

// e.g. "2m ago", "3h ago", "Just now"
function relativeTime(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Refreshes the resolved-coin preview in the modal as the user edits the amount held.
function updateCryptoPreview() {
  if (!modalCrypto) {
    cryptoPreviewEl.hidden = true;
    return;
  }
  cryptoPreviewEl.hidden = false;
  cryptoPreviewIconEl.src = modalCrypto.icon || "";
  cryptoPreviewNameEl.textContent = `${modalCrypto.name} (${modalCrypto.symbol})`;
  cryptoPreviewPriceEl.textContent = modalCrypto.price
    ? `${formatCryptoPrice(modalCrypto.price)} / coin \u00b7 ${relativeTime(modalCrypto.priceAt)}`
    : "Price unavailable";
  const amount = parseFloat(cryptoAmountInput.value) || 0;
  cryptoPreviewValueEl.textContent = modalCrypto.price ? money(amount * modalCrypto.price) : "";
}

document.getElementById("lookup-crypto").addEventListener("click", lookupCryptoCoin);
cryptoAmountInput.addEventListener("input", updateCryptoPreview);

// Batch-refresh live prices for every crypto account in one call, then re-render.
async function refreshCryptoPrices() {
  const cryptoAccounts = accounts.filter((a) => groupOf(a) === "crypto" && a.cryptoId);
  if (!cryptoAccounts.length) return;
  const prices = await fetchCryptoPrices([...new Set(cryptoAccounts.map((a) => a.cryptoId))]);
  if (!prices.size) return;
  let changed = false;
  for (const a of cryptoAccounts) {
    const price = prices.get(a.cryptoId);
    if (!price) continue;
    a.cryptoPrice = price;
    a.cryptoPriceAt = new Date().toISOString();
    a.balance = (Number(a.cryptoAmount) || 0) * price;
    changed = true;
  }
  if (changed) {
    save();
    render();
  }
}

// ---- Functions ----
function openAddModal() {
  editingId = null;
  modalTitle.textContent = "Add account";
  deleteBtn.style.display = "none";
  nameInput.value = "";
  urlInput.value = "";
  balanceInput.value = "";
  typeInput.value = "checking";
  addressInput.value = "";
  zillowInput.value = "";
  redfinInput.value = "";
  payFreqInput.value = "biweekly";
  lastPayInput.value = "";
  dueDayInput.value = "";
  minAmountInput.value = "";
  autoDeductInput.checked = false;
  aprInput.value = "";
  origBalanceInput.value = "";
  payoffByInput.value = "";
  cryptoQueryInput.value = "";
  cryptoAmountInput.value = "";
  modalCrypto = null;
  updateCryptoPreview();
  modalIcon = null;
  renderIconPreview();
  applyTypeUI();
  modal.classList.add("open");
  nameInput.focus();
}

function openEditModal(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  editingId = id;
  modalTitle.textContent = "Edit account";
  deleteBtn.style.display = "inline-block";
  nameInput.value = acc.name;
  urlInput.value = acc.url || "";
  typeInput.value = acc.type;
  balanceInput.value = acc.balance;
  addressInput.value = acc.address || "";
  zillowInput.value = acc.zillow || "";
  redfinInput.value = acc.redfin || "";
  payFreqInput.value = acc.payFrequency || "biweekly";
  lastPayInput.value = acc.lastPayDate || "";
  dueDayInput.value = acc.dueDay || "";
  // Back-compat: older bills stored their amount as balance before Min/expected became the single amount field.
  minAmountInput.value = acc.minAmount || (groupOf(acc) === "bills" ? acc.balance || "" : "") || "";
  autoDeductInput.checked = !!acc.autoDeductOnPay;
  aprInput.value = acc.apr != null ? acc.apr : ""; // 0% is a valid, meaningful APR — don't let `|| ""` collapse it to blank
  origBalanceInput.value = acc.origBalance || "";
  payoffByInput.value = acc.payoffBy || "";
  cryptoQueryInput.value = acc.cryptoName || acc.cryptoSymbol || "";
  cryptoAmountInput.value = acc.cryptoAmount || "";
  modalCrypto = acc.cryptoId
    ? { id: acc.cryptoId, symbol: acc.cryptoSymbol, name: acc.cryptoName, icon: acc.icon, price: acc.cryptoPrice, priceAt: acc.cryptoPriceAt }
    : null;
  updateCryptoPreview();
  modalIcon = acc.icon || null;
  renderIconPreview();
  applyTypeUI();
  modal.classList.add("open");
  balanceInput.focus();
  balanceInput.select();
}

function closeModal() {
  modal.classList.remove("open");
  editingId = null;
}

function saveAccount() {
  const name = nameInput.value.trim();
  const url = normalizeUrl(urlInput.value);
  const balance = balanceInput.value.trim() === "" ? 0 : parseFloat(balanceInput.value);
  const type = typeInput.value;
  const isProperty = groupOf({ type }) === "property";
  const isIncome = groupOf({ type }) === "income";
  const isExpense = groupOf({ type }) === "bills";
  const isCrypto = groupOf({ type }) === "crypto";
  const isLiability = GROUPS[groupOf({ type })] && GROUPS[groupOf({ type })].kind === "liability";
  if (!name || Number.isNaN(balance)) {
    alert("Please enter a name (balance is optional and defaults to 0).");
    return;
  }
  const zillow = zillowInput.value.trim() === "" ? null : parseFloat(zillowInput.value);
  const redfin = redfinInput.value.trim() === "" ? null : parseFloat(redfinInput.value);

  const acc = editingId !== null ? accounts.find((a) => a.id === editingId) : { id: Date.now() };
  const prevBalance = acc.balance;
  acc.name = name;
  acc.url = url;
  acc.type = type;
  acc.balance = isExpense || isCrypto ? 0 : balance; // bills use Min/expected, crypto is amount × live price
  // A manual edit that actually changes the balance counts as a fresh "update", same as the screenshot-paste flow.
  if (!isIncome && !isExpense && !isCrypto && prevBalance !== acc.balance) acc.balanceUpdatedAt = new Date().toISOString();
  if (modalIcon) acc.icon = modalIcon;
  else delete acc.icon;

  if (isProperty) {
    acc.address = addressInput.value.trim();
    acc.zillow = zillow;
    acc.redfin = redfin;
    acc.homeValue = avgEstimate(zillow, redfin) || 0;
  } else {
    delete acc.address;
    delete acc.zillow;
    delete acc.redfin;
    delete acc.homeValue;
  }

  if (isIncome) {
    acc.payFrequency = payFreqInput.value;
    acc.lastPayDate = lastPayInput.value;
  } else {
    delete acc.payFrequency;
    delete acc.lastPayDate;
  }

  if (isLiability || isExpense || isProperty) {
    const dueDay = parseInt(dueDayInput.value, 10);
    if (dueDay >= 1 && dueDay <= 31) acc.dueDay = dueDay;
    else delete acc.dueDay;
  } else {
    delete acc.dueDay;
  }

  if (isLiability || isExpense || isProperty) {
    const minAmount = parseFloat(minAmountInput.value);
    if (Number.isFinite(minAmount) && minAmount > 0) acc.minAmount = minAmount;
    else delete acc.minAmount;
  } else {
    delete acc.minAmount;
  }

  if (isLiability || isProperty) {
    acc.autoDeductOnPay = autoDeductInput.checked;
  } else {
    delete acc.autoDeductOnPay;
  }

  if (isLiability || isProperty) {
    const apr = parseFloat(aprInput.value);
    if (Number.isFinite(apr) && apr >= 0) acc.apr = apr;
    else delete acc.apr;
    const origBalance = parseFloat(origBalanceInput.value);
    if (Number.isFinite(origBalance) && origBalance > 0) acc.origBalance = origBalance;
    else delete acc.origBalance;
    if (payoffByInput.value) acc.payoffBy = payoffByInput.value;
    else delete acc.payoffBy;
  } else {
    delete acc.apr;
    delete acc.origBalance;
    delete acc.payoffBy;
  }

  if (isCrypto) {
    const amount = parseFloat(cryptoAmountInput.value) || 0;
    acc.cryptoAmount = amount;
    if (modalCrypto) {
      acc.cryptoId = modalCrypto.id;
      acc.cryptoSymbol = modalCrypto.symbol;
      acc.cryptoName = modalCrypto.name;
      if (modalCrypto.price) acc.cryptoPrice = modalCrypto.price;
      if (modalCrypto.priceAt) acc.cryptoPriceAt = modalCrypto.priceAt;
      if (!modalIcon && modalCrypto.icon) acc.icon = modalCrypto.icon; // don't clobber a deliberately pasted custom icon
    }
    acc.balance = amount * (Number(acc.cryptoPrice) || 0);
  } else {
    delete acc.cryptoId;
    delete acc.cryptoSymbol;
    delete acc.cryptoName;
    delete acc.cryptoAmount;
    delete acc.cryptoPrice;
    delete acc.cryptoPriceAt;
  }

  if (editingId === null) accounts.push(acc);
  save();
  closeModal();
  render();
}

function deleteAccount() {
  if (editingId === null) return;
  const id = editingId;
  closeModal();
  deleteAccountById(id);
}

function deleteAccountById(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  if (!confirm(`Delete "${acc.name}"?`)) return;
  accounts = accounts.filter((a) => a.id !== id);
  payments = payments.filter((p) => p.accountId !== id);
  save();
  savePayments();
  render();
}

// Only one Cash & Savings account at a time can be the designated Upcoming dues balance (radio-style toggle).
function toggleCashFlowInclude(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  const turningOn = acc.includeInCashFlow !== true;
  for (const a of accounts) if (groupOf(a) === "cash") a.includeInCashFlow = false;
  acc.includeInCashFlow = turningOn;
  save();
  render();
}

// ---- Favicon helper ----
function normalizeUrl(url) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed;
}

function faviconFor(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

// Shows the staged custom icon, else the site favicon, else the type emoji.
function renderIconPreview() {
  if (modalIcon) {
    iconPreviewEl.innerHTML = `<img src="${escapeHtml(modalIcon)}" alt="" />`;
    clearIconBtn.hidden = false;
    return;
  }
  clearIconBtn.hidden = true;
  const url = normalizeUrl(urlInput.value);
  const fav = url ? faviconFor(url) : "";
  const emoji = emojiFor(typeInput.value);
  iconPreviewEl.innerHTML = fav
    ? `<img src="${escapeHtml(fav)}" alt="" onerror="this.replaceWith(document.createTextNode('${emoji}'))" />`
    : emoji;
}

// Downscale a pasted screenshot to a small icon so it stays crisp and localStorage-friendly.
function blobToIcon(blob, max = 128) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(max / img.width, max / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Which paycheck period counts as "current" right now — same "most recent past payday" logic
// renderCashFlow() uses to build its period list, factored out so account cards (rendered before
// renderCashFlow() runs) can filter pending money the same way. renderCashFlow() overwrites
// `currentPeriodKey` with the exact value it actually used once it builds the real period list.
function computeCurrentPeriodKey() {
  const now = new Date();
  const incomeAccounts = accounts.filter((acc) => groupOf(acc) === "income" && acc.lastPayDate);
  if (!incomeAccounts.length) return `month:${now.getFullYear()}-${now.getMonth()}`;
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - 40);
  let latest = null;
  for (const inc of incomeAccounts) {
    const paydays = paydaysInRange(inc.payFrequency, inc.lastPayDate, lookbackStart, now);
    const last = paydays[paydays.length - 1];
    if (last && (!latest || last > latest)) latest = last;
  }
  return latest ? `pay:${latest.getTime()}` : `month:${now.getFullYear()}-${now.getMonth()}`;
}

function render() {
  // Pre-computed here (not just inside renderCashFlow(), which runs AFTER account cards are built)
  // so cardHtml()'s own pending annotation can already filter by the correct current period.
  // renderCashFlow() re-derives the authoritative value once it actually builds the period list.
  currentPeriodKey = computeCurrentPeriodKey();
  const netWorth = accounts.reduce((sum, a) => sum + netContribution(a), 0);
  netWorthEl.textContent = money(netWorth);

  if (!accounts.length) {
    netWorthMetaEl.textContent = "Add an account to get started";
    accountsEl.innerHTML = `<div class="empty">No accounts yet. Click "Add account" to begin.</div>`;
    renderCashFlow();
    return;
  }

  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    const c = netContribution(a);
    if (groupOf(a) === "property") {
      assets += Number(a.homeValue) || 0;
      debts += Math.abs(Number(a.balance) || 0);
    } else if (c >= 0) assets += c;
    else debts += -c;
  }
  netWorthMetaEl.textContent = `${money(assets)} in assets \u00b7 ${money(debts)} owed`;

  // Bucket accounts by group, preserving the accounts[] order within each.
  const buckets = {};
  for (const key of groupOrder) buckets[key] = [];
  for (const a of accounts) (buckets[groupOf(a)] || (buckets[groupOf(a)] = [])).push(a);

  accountsEl.innerHTML = groupOrder.filter((key) => buckets[key].length)
    .map((key) => {
      const isIncome = GROUPS[key].kind === "income";
      const isExpense = GROUPS[key].kind === "expense";
      let subtotal;
      if (isIncome) subtotal = buckets[key].reduce((s, a) => s + monthlyIncome(a.payFrequency, a.balance), 0);
      else if (isExpense) subtotal = -buckets[key].reduce((s, a) => s + monthlyObligation(a), 0);
      else subtotal = buckets[key].reduce((s, a) => s + netContribution(a), 0);
      const totalText = isIncome || isExpense ? `${money(subtotal)}/mo` : money(subtotal);
      const cards = buckets[key].map(cardHtml).join("");
      return `
        <section class="account-group" data-group="${key}">
          <div class="account-group__head">
            <h3 class="account-group__title">${GROUPS[key].label}</h3>
            <span class="account-group__total ${subtotal < 0 ? "negative" : ""}">${totalText}</span>
          </div>
          <div class="account-group__grid">${cards}</div>
        </section>`;
    })
    .join("");

  bindCardEvents();
  renderCashFlow();
}

// A manually-set target date reminder (e.g. a 0% intro-APR deadline) shown on the card, with urgency coloring.
function payoffByBadgeHtml(a) {
  if (!a.payoffBy) return "";
  const target = parseLocalDate(a.payoffBy);
  if (!target) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((target - today) / 86400000);
  const dateLabel = target.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  let urgency = "";
  let text;
  if (daysLeft < 0) {
    urgency = "payoffby--urgent";
    text = `Payoff date passed \u2014 ${dateLabel}`;
  } else if (daysLeft === 0) {
    urgency = "payoffby--urgent";
    text = `Pay off by today!`;
  } else if (daysLeft <= 30) {
    urgency = "payoffby--urgent";
    text = `Pay off by ${dateLabel} \u00b7 ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  } else if (daysLeft <= 60) {
    urgency = "payoffby--soon";
    text = `Pay off by ${dateLabel} \u00b7 ${daysLeft} days left`;
  } else {
    text = `Pay off by ${dateLabel} \u00b7 ${daysLeft} days left`;
  }
  return `<div class="payoffby ${urgency}">&#9200; ${escapeHtml(text)}</div>`;
}

// The payoff teaser shown on a debt card: payoff month, a progress bar, and a "View payoff" affordance.
function payoffTeaserHtml(a) {
  if (!canProject(a)) return "";
  const bal = Math.abs(Number(a.balance) || 0);
  const am = amortize(bal, a.apr, payoffPayment(a));
  if (am.neverPays) {
    return `
      <div class="payoff payoff--warn" data-payoff="${a.id}">
        <div class="payoff__bar"><span class="payoff__fill payoff__fill--warn" style="width:100%"></span></div>
        <div class="payoff__line">Payment barely covers interest <span class="payoff__cta">details &rsaquo;</span></div>
      </div>`;
  }
  const orig = Number(a.origBalance) || 0;
  let pct;
  let label;
  if (orig > bal) {
    pct = Math.min(100, Math.max(0, ((orig - bal) / orig) * 100));
    label = `${Math.round(pct)}% paid off`;
  } else {
    // No original amount: show the principal share of the remaining payoff instead of a % complete.
    pct = am.totalPaid > 0 ? (am.principal / am.totalPaid) * 100 : 100;
    label = `${money(am.totalInterest)} interest left`;
  }
  const payoff = am.schedule.length ? monthYear(am.schedule[am.schedule.length - 1].date) : "\u2014";
  return `
    <div class="payoff" data-payoff="${a.id}">
      <div class="payoff__bar"><span class="payoff__fill" style="width:${pct.toFixed(1)}%"></span></div>
      <div class="payoff__line">Paid off <strong>${payoff}</strong> &middot; ${escapeHtml(label)} <span class="payoff__cta">View payoff &rsaquo;</span></div>
    </div>`;
}

function cardHtml(a) {
  const group = groupOf(a);
  const isProperty = group === "property";
  const isIncome = group === "income";
  const isExpense = group === "bills";
  const isCrypto = group === "crypto";
  const isLiability = GROUPS[group] && GROUPS[group].kind === "liability";
  const icon = accountIconHtml(a, "account-card__fav", "account-card__fav--custom");

  let body;
  if (isProperty) {
    const homeValue = Number(a.homeValue) || 0;
    const owed = Math.abs(Number(a.balance) || 0);
    const equity = homeValue - owed;
    const minRow = a.minAmount
      ? `<span>Min / expected</span><span>${money(Number(a.minAmount))}</span>`
      : "";
    const dueRow = a.dueDay ? `<span>Due day</span><span>${ordinalDay(a.dueDay)}</span>` : "";
    body = `
      <div class="account-card__equity ${equity < 0 ? "negative" : ""}">${money(equity)}</div>
      <div class="account-card__proprows">
        <span>Home value</span><span>${money(homeValue)}</span>
        <span>Mortgage</span><span class="negative">${money(-owed)}</span>
        ${dueRow}
        ${minRow}
      </div>${a.address ? `<div class="account-card__addr">${escapeHtml(a.address)}</div>` : ""}`;
  } else if (isIncome) {
    const net = Number(a.balance) || 0;
    const freqLabel = a.payFrequency === "semimonthly" ? "Twice a month" : "Every 2 weeks";
    const next = upcomingPaydays(a.payFrequency, a.lastPayDate, 1)[0];
    const nextText = next ? formatPayday(next) : "Set last paycheck date";
    body = `
      <div class="account-card__balance">${money(net)}</div>
      <div class="account-card__proprows">
        <span>Schedule</span><span>${freqLabel}</span>
        <span>Next paycheck</span><span>${escapeHtml(nextText)}</span>
        <span>Est. monthly</span><span>${money(monthlyIncome(a.payFrequency, net))}</span>
      </div>`;
  } else if (isExpense) {
    const amount = monthlyObligation(a);
    body = `<div class="account-card__balance negative">${money(-amount)}/mo</div>`;
  } else if (isCrypto) {
    const value = Number(a.balance) || 0;
    const amount = Number(a.cryptoAmount) || 0;
    body = `
      <div class="account-card__balance">${money(value)}</div>
      <div class="account-card__proprows">
        <span>Holding</span><span>${formatCryptoAmount(amount)} ${escapeHtml(a.cryptoSymbol || "")}</span>
        ${a.cryptoPrice ? `<span>Price</span><span>${formatCryptoPrice(Number(a.cryptoPrice))}</span>` : ""}
        ${a.cryptoPriceAt ? `<span>Updated</span><span>${relativeTime(a.cryptoPriceAt)}</span>` : ""}
      </div>`;
  } else {
    const displayBalance = isLiability ? -Math.abs(a.balance) : a.balance;
    body = `<div class="account-card__balance ${displayBalance < 0 ? "negative" : ""}">${money(displayBalance)}</div>`;
  }
  if (isLiability || isExpense) {
    const infoRows = [];
    if (a.dueDay) infoRows.push(["Due day", ordinalDay(a.dueDay)]);
    // For bills the amount IS the min/expected (already shown as the big balance above) — only liabilities need it called out separately.
    if (isLiability && a.minAmount) infoRows.push(["Min / expected", money(Number(a.minAmount))]);
    if (infoRows.length) {
      body += `<div class="account-card__proprows">${infoRows
        .map(([k, v]) => `<span>${escapeHtml(k)}</span><span>${escapeHtml(String(v))}</span>`)
        .join("")}</div>`;
    }
  }

  body += payoffByBadgeHtml(a);
  body += payoffTeaserHtml(a);
  // Any account whose balance the user manually maintains (screenshot-paste or edit) shows when it was last updated.
  if (!isIncome && !isExpense && !isCrypto && a.balanceUpdatedAt) {
    body += `<div class="account-card__updated">Updated ${relativeTime(a.balanceUpdatedAt)}</div>`;
  }
  // The designated Upcoming-dues account shows net pending money assigned to the CURRENT paycheck
  // period only — pending assigned to a future paycheck shouldn't inflate today's preview balance.
  if (group === "cash" && a.includeInCashFlow === true && pendingTx.length) {
    const unresolved = pendingTx.filter((p) => !p.resolvedAt && (p.periodKey || currentPeriodKey) === currentPeriodKey);
    const pendingIn = unresolved.filter((p) => p.direction !== "out").reduce((s, p) => s + p.amount, 0);
    const pendingOut = unresolved.filter((p) => p.direction === "out").reduce((s, p) => s + p.amount, 0);
    const netPending = pendingIn - pendingOut;
    if (netPending !== 0) {
      const original = Number(a.balance) || 0;
      const adjusted = original + netPending;
      body += `<div class="account-card__pending ${netPending > 0 ? "positive" : "negative"}" data-balance-tooltip data-original="${original}" data-pending-in="${pendingIn}" data-pending-out="${pendingOut}">${netPending > 0 ? "+" : "\u2212"}${money(Math.abs(netPending))} pending \u2192 ${money(adjusted)}</div>`;
    }
  }

  const updateBtn = isIncome || isExpense
    ? ""
    : isCrypto
    ? `<button class="account-card__btn" data-refresh-crypto="${a.id}" title="Refresh live price" aria-label="Refresh live price">&#10227;</button>`
    : `<button class="account-card__btn" data-update="${a.id}" title="Update: screenshot the balance, click, then press Cmd+V" aria-label="Update from screenshot">&#10227;</button>`;
  // Cash & Savings: exactly one account at a time can be the designated balance used for Upcoming dues.
  const included = a.includeInCashFlow === true;
  const includeBtn =
    group === "cash"
      ? `<button class="account-card__btn${included ? "" : " account-card__btn--muted"}" data-toggle-cashflow="${a.id}" title="${included ? "Used as the Upcoming dues balance" : "Use this account's balance for Upcoming dues"}" aria-label="Toggle as the Upcoming dues balance">${included ? "&#9989;" : "&#11036;"}</button>`
      : "";
  // Optional review checklist: lets the user confirm they've eyeballed recent transactions on
  // accounts that see a lot of activity. Reviewed status auto-resets each payday (see isAccountReviewed).
  const reviewable = reviewFeatureEnabled && needsReviewCheck(a);
  const reviewed = reviewable && isAccountReviewed(a);
  const reviewBtn = reviewable
    ? `<button class="account-card__btn" data-toggle-reviewed="${a.id}" title="${reviewed ? "Reviewed \u2014 click to flag for another look" : "Mark as reviewed \u2014 no suspicious activity"}" aria-label="Toggle reviewed">${reviewed ? "&#128737;\uFE0F" : "&#128269;"}</button>`
    : "";

  return `
    <div class="account-card${a.url ? " account-card--link" : ""}${reviewable && !reviewed ? " account-card--needs-review" : ""}" data-id="${a.id}" data-group="${group}"${a.url ? ` data-url="${escapeHtml(a.url)}"` : ""}${a.url ? ` title="Open ${escapeHtml(a.name)}"` : ""}>
      <div class="account-card__actions">
        ${updateBtn}
        ${includeBtn}
        ${reviewBtn}
        <button class="account-card__btn" data-edit="${a.id}" title="Edit account" aria-label="Edit account">&#9998;</button>
        <button class="account-card__btn account-card__btn--del" data-del="${a.id}" title="Delete account" aria-label="Delete account">&#128465;</button>
      </div>
      <div class="account-card__top">
        <div class="account-card__icon">${icon}</div>
        <div>
          <div class="account-card__name">${escapeHtml(a.name)}</div>
          <div class="account-card__type">${escapeHtml(typeMeta(a.type).label)}</div>
        </div>
      </div>
      ${body}
    </div>`;
}

function bindCardEvents() {
  accountsEl.querySelectorAll(".account-card").forEach((card) => {
    card.querySelectorAll("img").forEach((img) => (img.draggable = false));
  });
  accountsEl.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(Number(btn.dataset.edit));
    });
  });
  accountsEl.querySelectorAll("[data-update]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      armUpdate(Number(btn.dataset.update));
    });
  });
  accountsEl.querySelectorAll("[data-refresh-crypto]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      btn.textContent = "\u2026";
      refreshCryptoPrices().finally(() => (btn.textContent = "\u27F3"));
    });
  });
  accountsEl.querySelectorAll("[data-toggle-cashflow]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCashFlowInclude(Number(btn.dataset.toggleCashflow));
    });
  });
  accountsEl.querySelectorAll("[data-toggle-reviewed]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleReviewed(Number(btn.dataset.toggleReviewed));
    });
  });
  accountsEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAccountById(Number(btn.dataset.del));
    });
  });
  accountsEl.querySelectorAll("[data-payoff]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openPayoffModal(Number(el.dataset.payoff));
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Shows a custom-pasted icon, else the site favicon, else the type emoji — shared by account cards and the due list.
function accountIconHtml(a, baseClass, customModifier) {
  if (a.icon) {
    const cls = customModifier ? `${baseClass} ${customModifier}` : baseClass;
    return `<img class="${cls}" src="${escapeHtml(a.icon)}" alt="" />`;
  }
  const fav = a.url ? faviconFor(a.url) : "";
  const emoji = emojiFor(a.type);
  return fav
    ? `<img class="${baseClass}" src="${escapeHtml(fav)}" alt="" onerror="this.replaceWith(document.createTextNode('${emoji}'))" />`
    : emoji;
}

// ---- Cash Flow: due list + projection ----
function renderCashFlow() {
  periodOptions = [];
  // Sum across all Cash & Savings accounts — no longer shown on its own, but still seeds the Projection table's starting balance.
  const cashOnHand = accounts
    .filter((a) => groupOf(a) === "cash")
    .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  // Exactly one Cash & Savings account can be checkmarked as "the" account Upcoming dues tracks —
  // its real balance is the starting point, and Mark paid auto-deducts from it (see markPaidInstant).
  const designatedCashAccount = accounts.find((a) => groupOf(a) === "cash" && a.includeInCashFlow === true);
  const cashFlowStartBalance = designatedCashAccount ? Number(designatedCashAccount.balance) || 0 : null;

  const dueAccounts = accounts
    .filter(isDueAccount)
    .sort((a, b) => (a.dueDay || 99) - (b.dueDay || 99));

  const now = new Date();
  const today = now.getDate();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  const daysInThisMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
  const lastMonth = new Date(thisYear, thisMonth - 1, 1);
  const nextMonth = new Date(thisYear, thisMonth + 1, 1);
  const isPastThisMonth = (a) => dueDayBefore(a, today, daysInThisMonth);

  // Past due: all of last month (whatever's still unpaid) + this month's due days already gone by.
  const pastGroups = [
    { year: lastMonth.getFullYear(), month: lastMonth.getMonth(), items: dueAccounts.filter((a) => !paidInMonth(a.id, lastMonth.getFullYear(), lastMonth.getMonth())) },
    { year: thisYear, month: thisMonth, items: dueAccounts.filter((a) => isPastThisMonth(a) && !paidInMonth(a.id, thisYear, thisMonth)) },
  ].filter((g) => g.items.length);
  pastDueBlockEl.hidden = !pastGroups.length;
  pastDueListEl.innerHTML = pastGroups
    .map(
      (g) => `
      <div class="cashflow__group-month">${monthYear(new Date(g.year, g.month, 1))}</div>
      ${g.items.map((a) => dueItemHtml(a, { year: g.year, month: g.month })).join("")}`
    )
    .join("");

  // Upcoming: today through the rest of this month, plus all of next month, grouped by
  // whichever paycheck would most naturally cover each due date — not by calendar month.
  // Periods are built from every distinct payday (across all income accounts) from the
  // most recent past payday through the end of next month, so 3-paycheck months and
  // multiple income accounts both just fall out of the same merged, sorted date list.
  const daysInNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
  const dueDateFor = (a, y, m, daysInM) => (a.dueDay ? new Date(y, m, Math.min(a.dueDay, daysInM)) : null);
  const upcomingItems = [];
  for (const a of dueAccounts) {
    if (!isPastThisMonth(a)) upcomingItems.push({ a, year: thisYear, month: thisMonth, dueDate: dueDateFor(a, thisYear, thisMonth, daysInThisMonth) });
    upcomingItems.push({ a, year: nextMonth.getFullYear(), month: nextMonth.getMonth(), dueDate: dueDateFor(a, nextMonth.getFullYear(), nextMonth.getMonth(), daysInNextMonth) });
  }

  const incomeAccounts = accounts.filter((acc) => groupOf(acc) === "income" && acc.lastPayDate);
  let payPeriods = [];
  if (incomeAccounts.length) {
    const rangeEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0, 23, 59, 59, 999);
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - 40);
    const dayBeforeToday = new Date(thisYear, thisMonth, today - 1);
    const paydayMap = new Map(); // time -> { date, incomeAmount } (sums every account paid on that exact date)
    for (const inc of incomeAccounts) {
      const pastOnes = paydaysInRange(inc.payFrequency, inc.lastPayDate, lookbackStart, dayBeforeToday);
      const lastPastPayday = pastOnes[pastOnes.length - 1];
      const futureOnes = paydaysInRange(inc.payFrequency, inc.lastPayDate, now, rangeEnd);
      const incAmount = Number(inc.balance) || 0;
      for (const d of [...(lastPastPayday ? [lastPastPayday] : []), ...futureOnes]) {
        const key = d.getTime();
        const entry = paydayMap.get(key) || { date: d, incomeAmount: 0 };
        entry.incomeAmount += incAmount;
        paydayMap.set(key, entry);
      }
    }
    const sortedEntries = [...paydayMap.values()].sort((x, y) => x.date - y.date);
    payPeriods = sortedEntries.map((entry, i, arr) => ({
      date: entry.date,
      incomeAmount: entry.incomeAmount,
      isCurrent: entry.date <= now && (i === arr.length - 1 || arr[i + 1].date > now),
      items: [],
    }));
  }

  // Every pending entry belongs to a specific paycheck period (`periodKey`) so it can be dragged... er,
  // assigned to a future paycheck via the "+ Pending" modal instead of always landing on the current one.
  // Legacy entries created before this existed have no periodKey — they fall back to whichever period
  // is current at render time, same as before. Resolved-in-window pending is scoped the same as always
  // (current+next month) for the Completed side; older resolved entries only show in the History popup.
  const windowStart = new Date(thisYear, thisMonth, 1);
  const windowEnd = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  const activePending = pendingTx.filter((p) => !p.resolvedAt).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const completedPending = pendingTx
    .filter((p) => p.resolvedAt && new Date(p.resolvedAt) >= windowStart && new Date(p.resolvedAt) <= windowEnd)
    .sort((a, b) => new Date(b.resolvedAt) - new Date(a.resolvedAt));

  // Builds every period's {startBalance, endBalance} (chained across all of them, even ones with
  // nothing due, so a paycheck with no bills still carries its income forward) AND renders its
  // Activity/Completed HTML in one pass, so the numbers and the markup can never drift apart. Each
  // period's OWN pending money (matched via keyFor) feeds directly into ITS estimate, not whichever
  // period happens to be current — so assigning a pending entry to a future paycheck only moves ITS
  // estimate, exactly like the request. Pending with a stale/unmatched periodKey (e.g. its income
  // account got deleted) falls back onto the very first period rather than silently disappearing.
  function buildPeriods(groups, keyFor, labelFor, startRow) {
    const keys = groups.map(keyFor);
    if (keys.length) currentPeriodKey = keys[0];
    keys.forEach((key, i) => periodOptions.push({ key, label: labelFor(groups[i]) }));
    const activeByKey = new Map(keys.map((k) => [k, []]));
    const completedByKey = new Map(keys.map((k) => [k, []]));
    for (const p of activePending) {
      const key = p.periodKey || currentPeriodKey;
      (activeByKey.get(key) || activeByKey.get(keys[0]))?.push(p);
    }
    for (const p of completedPending) {
      const key = p.periodKey || currentPeriodKey;
      (completedByKey.get(key) || completedByKey.get(keys[0]))?.push(p);
    }

    let activityHtml = "";
    let completedHtml = "";
    let row = startRow;
    let running = cashFlowStartBalance;
    groups.forEach((g, i) => {
      const key = keys[i];
      const groupActive = activeByKey.get(key) || [];
      const groupCompleted = completedByKey.get(key) || [];
      if (i > 0) running += g.incomeAmount || 0;
      g.startBalance = cashFlowStartBalance === null ? undefined : running;
      const unpaid = g.items.filter((it) => !paidInMonth(it.a.id, it.year, it.month));
      const paidItems = g.items.filter((it) => paidInMonth(it.a.id, it.year, it.month));
      const pendingNet = groupActive.reduce((s, p) => s + (p.direction === "out" ? -p.amount : p.amount), 0);
      g.duesTotal = unpaid.reduce((s, it) => s + monthlyObligation(it.a), 0);
      g.endBalance = g.startBalance === undefined ? undefined : g.startBalance - g.duesTotal + pendingNet;
      if (cashFlowStartBalance !== null) running = g.endBalance;
      if (!unpaid.length && !paidItems.length && !groupActive.length && !groupCompleted.length) return; // nothing at all this period
      const monthLabel = `<span>${labelFor(g)}</span>${g.endBalance === undefined ? "" : `<span class="cashflow__group-balance">Est. balance <span class="${g.endBalance < 0 ? "negative" : ""}">${money(g.endBalance)}</span></span>`}`;
      activityHtml += `
      <div class="cashflow__group" style="--row:${row}"${g.startBalance === undefined ? "" : ` data-start-balance="${g.startBalance}" data-income-amount="${g.incomeAmount || 0}" data-pending-net="${pendingNet}"`}>
        <div class="cashflow__group-month">${monthLabel}</div>
        ${groupActive.map(pendingItemHtml).join("")}
        ${unpaid.map((it) => dueItemHtml(it.a, { year: it.year, month: it.month, editableAmount: true })).join("")}
      </div>`;
      if (paidItems.length || groupCompleted.length) {
        completedHtml += `
      <div class="cashflow__group" style="--row:${row}">
        <div class="cashflow__group-month" style="visibility:hidden" aria-hidden="true">${monthLabel}</div>
        ${groupCompleted.map(completedPendingItemHtml).join("")}
        ${paidItems.map((it) => completedItemHtml(it.a, { year: it.year, month: it.month })).join("")}
      </div>`;
      }
      row++;
    });
    return { activityHtml, completedHtml };
  }

  if (payPeriods.length) {
    for (const item of upcomingItems) {
      const target = item.dueDate
        ? payPeriods.reduce((best, p) => (p.date <= item.dueDate ? p : best), payPeriods[0])
        : payPeriods[0]; // no due day set — attach to the current pay period as a reasonable default
      target.items.push(item);
    }
    // Stale leading paydays from another income account (older than the actual current one) never
    // get displayed — same skip as before, just done as a slice instead of a loop-and-continue.
    const currentIdx = payPeriods.findIndex((p) => p.isCurrent);
    const visiblePeriods = currentIdx === -1 ? [] : payPeriods.slice(currentIdx);
    const { activityHtml, completedHtml } = buildPeriods(
      visiblePeriods,
      (p) => `pay:${p.date.getTime()}`,
      (p) => (p.isCurrent ? `Current paycheck \u00b7 since ${monthDay(p.date)}` : `Paycheck \u00b7 ${monthDay(p.date)}`),
      2
    );
    upcomingListEl.innerHTML = activityHtml || `<div class="empty" style="--row:2">Nothing due or pending right now.</div>`;
    completedListEl.innerHTML = completedHtml || `<div class="empty" style="--row:2">Nothing completed yet this period.</div>`;
  } else {
    // No income account to anchor pay periods on — fall back to plain month grouping, still
    // chaining a starting/ending balance across the two buckets (no paycheck income to add between them).
    const upcomingGroups = [
      { year: thisYear, month: thisMonth, items: dueAccounts.filter((a) => !isPastThisMonth(a)).map((a) => ({ a, year: thisYear, month: thisMonth })) },
      { year: nextMonth.getFullYear(), month: nextMonth.getMonth(), items: dueAccounts.map((a) => ({ a, year: nextMonth.getFullYear(), month: nextMonth.getMonth() })) },
    ];
    const { activityHtml, completedHtml } = buildPeriods(
      upcomingGroups,
      (g) => `month:${g.year}-${g.month}`,
      (g) => monthYear(new Date(g.year, g.month, 1)),
      2
    );
    upcomingListEl.innerHTML = activityHtml || `<div class="empty" style="--row:2">Nothing due or pending right now.</div>`;
    completedListEl.innerHTML = completedHtml || `<div class="empty" style="--row:2">Nothing completed yet this period.</div>`;
  }



  bindDueEvents();

  const months = projectionMonths();
  let balance = cashOnHand;
  const rows = months.map(({ year, month }, idx) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const isCurrent = idx === 0;
    const rangeStart = isCurrent ? now : monthStart;

    let income = 0;
    for (const a of accounts) {
      if (groupOf(a) !== "income") continue;
      income += paydaysInRange(a.payFrequency, a.lastPayDate, rangeStart, monthEnd).length * (Number(a.balance) || 0);
    }

    let dues = 0;
    for (const a of accounts) {
      if (!isDueAccount(a)) continue;
      if (isCurrent && paidThisMonth(a.id)) continue; // already paid this month, already reflected in cash on hand
      dues += monthlyObligation(a);
    }

    const net = income - dues;
    balance += net;
    return { label: monthStart.toLocaleDateString("en-US", { month: "short", year: "numeric" }), income, dues, net, balance };
  });

  projectionEndLabelEl.textContent = rows.length ? rows[rows.length - 1].label : "";
  projectionTableEl.dataset.cashOnHand = cashOnHand;
  projectionTableEl.innerHTML = `
    <div class="cashflow__row cashflow__row--head">
      <span>Month</span><span>Income</span><span>Bills &amp; dues</span><span>Net</span><span>Balance</span>
    </div>
    ${rows
      .map(
        (r, idx) => `
      <div class="cashflow__row" data-year="${months[idx].year}" data-month-idx="${months[idx].month}" data-current="${idx === 0}" data-income="${r.income}">
        <span>${r.label}</span>
        <span>${money(r.income)}</span>
        <span class="negative due-cell">${money(-r.dues)}</span>
        <span class="net-cell ${r.net < 0 ? "negative" : ""}">${money(r.net)}</span>
        <span class="balance-cell ${r.balance < 0 ? "negative" : ""}">${money(r.balance)}</span>
      </div>`
      )
      .join("")}`;

  renderCalendar();
}

// Renders an UNPAID due item for the Activity column. Past due's own list also uses this (editable=false there).
function dueItemHtml(a, opts = {}) {
  const now = new Date();
  const year = opts.year ?? now.getFullYear();
  const month = opts.month ?? now.getMonth();
  const amount = monthlyObligation(a);
  const dueText = a.dueDay ? `Due on the ${ordinalDay(a.dueDay)}` : "No due day set";
  const amountText = amount > 0 ? money(amount) : "No amount set";
  const editable = !!opts.editableAmount;
  // Upcoming dues entries let the user override the amount actually being paid, defaulting to the account's own min/expected setting.
  const payControl = editable
    ? `<div class="due-item__pay-row">
         <input type="number" class="due-item__amount-input" min="0" step="0.01" value="${amount > 0 ? amount : ""}" placeholder="Amount" aria-label="Amount to pay for ${escapeHtml(a.name)}" data-live-key="${a.id}|${year}|${month}">
         <button class="btn due-item__pay" data-mark-paid="${a.id}" data-due-year="${year}" data-due-month="${month}">Mark paid</button>
       </div>`
    : `<button class="btn due-item__pay" data-mark-paid="${a.id}" data-due-year="${year}" data-due-month="${month}">Mark paid</button>`;

  return `
    <div class="due-item" data-account="${a.id}">
      <div class="due-item__top">
        <div class="due-item__icon">${accountIconHtml(a, "due-item__icon-img", "due-item__icon-img--custom")}</div>
        <div class="due-item__info">
          <div class="due-item__name">${escapeHtml(a.name)}</div>
          <div class="due-item__meta">${escapeHtml(editable ? dueText : `${dueText} \u00b7 ${amountText}`)}</div>
        </div>
        ${payControl}
      </div>
    </div>`;
}

// Renders a PAID due item for the Completed column, with a button to undo the payment and move it back to Activity.
function completedItemHtml(a, opts) {
  const paid = paidInMonth(a.id, opts.year, opts.month);
  if (!paid) return "";
  return `
    <div class="due-item due-item--completed" data-account="${a.id}">
      <div class="due-item__top">
        <div class="due-item__icon">${accountIconHtml(a, "due-item__icon-img", "due-item__icon-img--custom")}</div>
        <div class="due-item__info">
          <div class="due-item__name">${escapeHtml(a.name)}</div>
          <div class="due-item__meta">Paid ${money(paid.amount)} \u00b7 ${escapeHtml(formatShortDate(paid.date))}</div>
        </div>
        <button class="btn btn--ghost due-item__pay" data-undo-payment="${paid.id}">&#8617; Return to activity</button>
      </div>
    </div>`;
}

// A pending incoming/outgoing entry in Upcoming activity — money not yet reflected in the designated account's real balance.
function pendingItemHtml(p) {
  const isOut = p.direction === "out";
  const partyLine = p.party ? `${isOut ? "To" : "From"} ${escapeHtml(p.party)} \u00b7 ` : "";
  return `
    <div class="due-item due-item--pending-${isOut ? "out" : "in"}" data-pending="${p.id}">
      <div class="due-item__top">
        <div class="due-item__icon">${isOut ? "\u{1F4E4}" : "\u{1F4E5}"}</div>
        <div class="due-item__info">
          <div class="due-item__name">${escapeHtml(p.description)}</div>
          <div class="due-item__meta">${partyLine}<span class="due-item__amount due-item__amount--${isOut ? "out" : "in"}">${isOut ? "\u2212" : "+"}${money(p.amount)}</span></div>
        </div>
        <div class="due-item__actions">
          <button class="btn due-item__pay" data-resolve-pending="${p.id}">${isOut ? "Mark sent" : "Mark received"}</button>
          <button class="btn btn--ghost due-item__delete" data-delete-pending="${p.id}" title="Delete">&#128465;</button>
        </div>
      </div>
    </div>`;
}

// A resolved pending entry, for the Completed column / History popup, with a button to move it back to Activity.
function completedPendingItemHtml(p) {
  const isOut = p.direction === "out";
  const partyLine = p.party ? `${isOut ? "To" : "From"} ${escapeHtml(p.party)} \u00b7 ` : "";
  return `
    <div class="due-item due-item--completed" data-pending="${p.id}">
      <div class="due-item__top">
        <div class="due-item__icon">${isOut ? "\u{1F4E4}" : "\u{1F4E5}"}</div>
        <div class="due-item__info">
          <div class="due-item__name">${escapeHtml(p.description)}</div>
          <div class="due-item__meta">${partyLine}${isOut ? "Sent" : "Received"} \u00b7 ${escapeHtml(formatShortDate(p.resolvedAt.slice(0, 10)))} \u00b7 <span class="due-item__amount due-item__amount--${isOut ? "out" : "in"}">${isOut ? "\u2212" : "+"}${money(p.amount)}</span></div>
        </div>
        <button class="btn btn--ghost due-item__pay" data-restore-pending="${p.id}">&#8617; Return to activity</button>
      </div>
    </div>`;
}

// Live-updates a group's "Est. balance" as the user edits an amount input, using whatever's currently
// typed for each still-unpaid item — mirrors the math done at render time in renderCashFlow(). Then
// cascades forward through every later group's sibling (each one's start = prior end + its own
// income, same chain renderCashFlow() builds), since an earlier edit changes every later balance too.
function recomputeGroupBalance(groupEl) {
  let group = groupEl;
  while (group && group.dataset.startBalance !== undefined) {
    const start = Number(group.dataset.startBalance);
    const pendingNet = Number(group.dataset.pendingNet) || 0;
    let duesTotal = 0;
    group.querySelectorAll(".due-item__amount-input").forEach((input) => {
      const val = parseFloat(input.value);
      duesTotal += Number.isFinite(val) && val >= 0 ? val : 0;
    });
    const end = start - duesTotal + pendingNet;
    const balanceEl = group.querySelector(".cashflow__group-balance");
    if (balanceEl) balanceEl.innerHTML = `Est. balance <span class="${end < 0 ? "negative" : ""}">${money(end)}</span>`;
    const next = group.nextElementSibling;
    if (!next || !next.classList.contains("cashflow__group") || next.dataset.startBalance === undefined) break;
    next.dataset.startBalance = end + (Number(next.dataset.incomeAmount) || 0);
    group = next;
  }
}

// Live-updates the Projection table's "Bills & dues"/Net/Balance the same way, using whatever's
// currently typed in Upcoming activity's editable inputs (past-due items have no editable input, so
// they always fall back to the account's own monthlyObligation() — same as at render time).
function recomputeProjectionLive() {
  const rows = [...projectionTableEl.querySelectorAll(".cashflow__row:not(.cashflow__row--head)")];
  if (!rows.length) return;
  const overrides = new Map(); // "accountId|year|month" -> currently-typed amount
  document.querySelectorAll("#upcoming-list .due-item__amount-input").forEach((input) => {
    const val = parseFloat(input.value);
    overrides.set(input.dataset.liveKey, Number.isFinite(val) && val >= 0 ? val : 0);
  });
  let balance = Number(projectionTableEl.dataset.cashOnHand);
  for (const row of rows) {
    const year = Number(row.dataset.year);
    const month = Number(row.dataset.monthIdx);
    const isCurrent = row.dataset.current === "true";
    let dues = 0;
    for (const a of accounts) {
      if (!isDueAccount(a)) continue;
      if (isCurrent && paidThisMonth(a.id)) continue;
      const key = `${a.id}|${year}|${month}`;
      dues += overrides.has(key) ? overrides.get(key) : monthlyObligation(a);
    }
    const income = Number(row.dataset.income);
    const net = income - dues;
    balance += net;
    row.querySelector(".due-cell").textContent = money(-dues);
    const netEl = row.querySelector(".net-cell");
    netEl.textContent = money(net);
    netEl.classList.toggle("negative", net < 0);
    const balEl = row.querySelector(".balance-cell");
    balEl.textContent = money(balance);
    balEl.classList.toggle("negative", balance < 0);
  }
}

function bindDueEvents() {
  document.querySelectorAll("#past-due-list [data-mark-paid], #upcoming-list [data-mark-paid]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".due-item")?.querySelector(".due-item__amount-input");
      const override = input ? parseFloat(input.value) : NaN;
      markPaidInstant(Number(btn.dataset.markPaid), Number(btn.dataset.dueYear), Number(btn.dataset.dueMonth), Number.isFinite(override) && override >= 0 ? override : undefined);
    });
  });
  // Recompute a group's displayed "$start (end)" live as the user edits an amount, without waiting for Mark paid.
  document.querySelectorAll("#upcoming-list .due-item__amount-input").forEach((input) => {
    input.addEventListener("input", () => {
      recomputeGroupBalance(input.closest(".cashflow__group"));
      recomputeProjectionLive();
    });
  });
  document.querySelectorAll("#upcoming-list [data-resolve-pending]").forEach((btn) => {
    btn.addEventListener("click", () => resolvePendingTx(Number(btn.dataset.resolvePending)));
  });
  document.querySelectorAll("#upcoming-list [data-delete-pending]").forEach((btn) => {
    btn.addEventListener("click", () => deletePendingTx(Number(btn.dataset.deletePending)));
  });
  document.querySelectorAll("#completed-list [data-restore-pending]").forEach((btn) => {
    btn.addEventListener("click", () => restorePendingTx(Number(btn.dataset.restorePending)));
  });
  document.querySelectorAll("#past-due-list [data-undo-payment], #upcoming-list [data-undo-payment], #completed-list [data-undo-payment]").forEach((btn) => {
    btn.addEventListener("click", () => undoPayment(Number(btn.dataset.undoPayment)));
  });
}

// Reverses a logged payment (used by "Return to activity" in Completed and the History popup, and the
// occasional still-paid item shown inline elsewhere) — un-does both kinds of auto-deduction, if either applied.
function undoPayment(id) {
  const payment = payments.find((p) => p.id === id);
  // Reverse the auto-deduction, if any, back onto whichever account it actually came out of — not necessarily today's designated one.
  if (payment && payment.deductedAccountId != null) {
    const acc = accounts.find((a) => a.id === payment.deductedAccountId);
    if (acc) {
      acc.balance = (Number(acc.balance) || 0) + payment.deductedAmount;
      save();
    }
  }
  // Reverse the bill/liability account's own auto-deduction (the "auto-deduct from balance" account setting), if it applied.
  if (payment && payment.selfDeductedAmount) {
    const acc = accounts.find((a) => a.id === payment.accountId);
    if (acc) {
      acc.balance = (Number(acc.balance) || 0) + payment.selfDeductedAmount;
      save();
    }
  }
  payments = payments.filter((p) => p.id !== id);
  savePayments();
  render();
}

// Logs a payment with the default amount/date for the target month, no prompt — used by both single "Mark paid" and "Mark all paid".
// Also auto-deducts the amount from the designated Upcoming dues account (if one is set) so its balance stays in sync as bills get paid.
// overrideAmount lets the Upcoming dues amount input replace the account's own min/expected default for this one payment.
function markPaidInstant(accountId, year, month, overrideAmount) {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc) return;
  const now = new Date();
  const hasTarget = Number.isFinite(year) && Number.isFinite(month);
  // Same-month payments default to today; past OR future target months need a date that actually falls within them.
  const isOtherMonth = hasTarget && !(year === now.getFullYear() && month === now.getMonth());
  let date;
  if (isOtherMonth) {
    const daysInTargetMonth = new Date(year, month + 1, 0).getDate();
    const day = acc.dueDay ? Math.min(acc.dueDay, daysInTargetMonth) : daysInTargetMonth;
    date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else {
    date = now.toISOString().slice(0, 10);
  }
  const amount = Number.isFinite(overrideAmount) ? overrideAmount : monthlyObligation(acc);
  const payment = { id: Date.now(), accountId, date, amount };
  const designated = accounts.find((a) => groupOf(a) === "cash" && a.includeInCashFlow === true);
  if (designated) {
    designated.balance = (Number(designated.balance) || 0) - amount;
    payment.deductedAccountId = designated.id;
    payment.deductedAmount = amount;
    save();
  }
  // Optional per-account setting: also pay the amount down off the bill/liability account's own balance.
  if (acc.autoDeductOnPay) {
    const before = Number(acc.balance) || 0;
    acc.balance = Math.max(0, before - amount);
    payment.selfDeductedAmount = before - acc.balance; // actual amount removed, in case clamping at 0 reduced it
    save();
  }
  payments.push(payment);
  savePayments();
  render();
}

// ---- Payoff / amortization explorer ----
const payoffModal = document.getElementById("payoff-modal");
const payoffTitle = document.getElementById("payoff-title");
const payoffSub = document.getElementById("payoff-sub");
const payoffHeroDate = document.getElementById("payoff-hero-date");
const payoffHeroMeta = document.getElementById("payoff-hero-meta");
const payoffSlider = document.getElementById("payoff-payment");
const payoffPaymentOut = document.getElementById("payoff-payment-out");
const payoffMinLabel = document.getElementById("payoff-min-label");
const payoffMaxLabel = document.getElementById("payoff-max-label");
const payoffDelta = document.getElementById("payoff-delta");
const payoffSplitPrincipal = document.getElementById("payoff-split-principal");
const payoffSplitInterest = document.getElementById("payoff-split-interest");
const payoffPrincipalAmt = document.getElementById("payoff-principal-amt");
const payoffInterestAmt = document.getElementById("payoff-interest-amt");
const payoffScheduleBody = document.getElementById("payoff-schedule-body");
let payoffAccount = null; // { balance, apr, basePayment }

document.getElementById("close-payoff-btn").addEventListener("click", closePayoffModal);
payoffModal.addEventListener("click", (e) => {
  if (e.target === payoffModal) closePayoffModal();
});
payoffSlider.addEventListener("input", renderPayoff);

function openPayoffModal(accountId) {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || !canProject(acc)) return;
  const balance = Math.abs(Number(acc.balance) || 0);
  const basePayment = payoffPayment(acc);
  payoffAccount = { balance, apr: Number(acc.apr), basePayment };
  payoffTitle.textContent = `${acc.name} payoff`;
  payoffSub.textContent = `${money(balance)} owed at ${acc.apr}% APR`;
  // Slider spans from the minimum payment up to 4x that amount.
  const min = basePayment;
  const max = basePayment * 4;
  payoffSlider.min = min;
  payoffSlider.max = max;
  payoffSlider.step = Math.max(1, Math.round(basePayment / 100));
  payoffSlider.value = min;
  payoffMinLabel.textContent = `${money(min)} (min)`;
  payoffMaxLabel.textContent = money(max);
  renderPayoff();
  payoffModal.classList.add("open");
}

function closePayoffModal() {
  payoffModal.classList.remove("open");
  payoffAccount = null;
}

function renderPayoff() {
  if (!payoffAccount) return;
  const { balance, apr, basePayment } = payoffAccount;
  const payment = Number(payoffSlider.value);
  payoffPaymentOut.textContent = money(payment);
  const am = amortize(balance, apr, payment);

  if (am.neverPays) {
    payoffHeroDate.textContent = "Never";
    payoffHeroMeta.textContent = "This payment doesn't cover the monthly interest \u2014 the balance won't go down.";
    payoffDelta.textContent = "";
    payoffSplitPrincipal.style.width = "0%";
    payoffSplitInterest.style.width = "100%";
    payoffPrincipalAmt.textContent = money(balance);
    payoffInterestAmt.textContent = "\u221e";
    payoffScheduleBody.innerHTML = "";
    return;
  }

  const end = am.schedule[am.schedule.length - 1].date;
  payoffHeroDate.textContent = monthYear(end);
  payoffHeroMeta.textContent = `${durationLabel(am.months)} \u00b7 ${money(am.totalInterest)} interest \u00b7 ${money(am.totalPaid)} total`;

  // Compare against paying only the minimum.
  const baseAm = amortize(balance, apr, basePayment);
  if (payment > basePayment && !baseAm.neverPays) {
    const monthsSaved = baseAm.months - am.months;
    const interestSaved = baseAm.totalInterest - am.totalInterest;
    payoffDelta.textContent = `vs. minimum: ${monthsSaved > 0 ? `${durationLabel(monthsSaved)} sooner` : "same time"} \u00b7 save ${money(interestSaved)}`;
    payoffDelta.classList.add("payoff-slider__delta--good");
  } else {
    payoffDelta.textContent = "Drag right to pay it off faster.";
    payoffDelta.classList.remove("payoff-slider__delta--good");
  }

  // Principal vs interest split of the total money paid.
  const principalPct = am.totalPaid > 0 ? (am.principal / am.totalPaid) * 100 : 100;
  payoffSplitPrincipal.style.width = `${principalPct.toFixed(1)}%`;
  payoffSplitInterest.style.width = `${(100 - principalPct).toFixed(1)}%`;
  payoffPrincipalAmt.textContent = money(am.principal);
  payoffInterestAmt.textContent = money(am.totalInterest);

  payoffScheduleBody.innerHTML = am.schedule
    .map(
      (row) => `<tr>
        <td>${row.n}</td>
        <td>${monthYear(row.date)}</td>
        <td>${money(row.principal)}</td>
        <td class="payoff-schedule__interest">${money(row.interest)}</td>
        <td>${money(row.balance)}</td>
      </tr>`
    )
    .join("");
}

// ---- Per-account update from a pasted screenshot ----
// Clicking update "arms" an account; the next Cmd+V paste (captured via a hidden
// field, so no clipboard permission is needed) updates that account's balance.
// We just take the first dollar amount OCR finds in the pasted image.
function extractBalance(text) {
  const decimal = text.match(/-?\$?\s*[\d,]+\.\d{2}/);
  const match = decimal || text.match(/-?\$\s*[\d,]+/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/[$,\s]/g, ""));
  return Number.isNaN(value) ? null : value;
}

let pendingUpdateId = null;
let disarmTimer = null;

// Hidden capture field: focusing it routes the user's Cmd+V here without a permission prompt.
const pasteCatcher = document.createElement("textarea");
pasteCatcher.setAttribute("aria-hidden", "true");
pasteCatcher.tabIndex = -1;
pasteCatcher.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;";
document.body.appendChild(pasteCatcher);

pasteCatcher.addEventListener("paste", (e) => {
  const id = pendingUpdateId;
  if (id == null) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) {
    alert("That wasn't an image. Take a screenshot of the balance, then click update and press Cmd+V.");
    disarmUpdate();
    return;
  }
  e.preventDefault();
  runUpdate(id, item.getAsFile());
  disarmUpdate();
});

pasteCatcher.addEventListener("blur", () => {
  if (pendingUpdateId != null) disarmUpdate();
});

function armUpdate(id) {
  if (pendingUpdateId === id) {
    disarmUpdate();
    return;
  }
  pendingUpdateId = id;
  const btn = accountsEl.querySelector(`[data-update="${id}"]`);
  if (btn) {
    btn.textContent = "\u2318V";
    btn.classList.add("account-card__btn--armed");
    btn.title = "Press Cmd+V to paste your balance screenshot";
  }
  pasteCatcher.value = "";
  pasteCatcher.focus();
  clearTimeout(disarmTimer);
  disarmTimer = setTimeout(disarmUpdate, 20000);
}

function disarmUpdate() {
  clearTimeout(disarmTimer);
  const id = pendingUpdateId;
  pendingUpdateId = null;
  if (id == null) return;
  const btn = accountsEl.querySelector(`[data-update="${id}"]`);
  if (btn) {
    btn.textContent = "\u27F3";
    btn.classList.remove("account-card__btn--armed");
    btn.disabled = false;
    btn.title = "Update: screenshot the balance, click, then press Cmd+V";
  }
}

async function runUpdate(id, blob) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc || !blob) return;

  if (typeof Tesseract === "undefined") {
    alert("The OCR library didn't load (needs internet). Can't read the screenshot.");
    return;
  }

  const btn = accountsEl.querySelector(`[data-update="${id}"]`);
  if (btn) {
    btn.textContent = "\u2026";
    btn.disabled = true;
  }

  try {
    const { data } = await Tesseract.recognize(blob, "eng");
    const text = (data.text || "").trim();
    const value = extractBalance(text);
    if (value === null) {
      alert("Couldn't find a dollar amount in that screenshot. Crop it to just the balance and try again.");
      return;
    }
    acc.balance = value;
    acc.balanceUpdatedAt = new Date().toISOString();
    save();
    render();
    flashCard(id);
  } catch (err) {
    alert("Update failed: " + err.message);
  } finally {
    if (btn) {
      btn.textContent = "\u27F3";
      btn.disabled = false;
    }
  }
}

function flashCard(id) {
  const card = accountsEl.querySelector(`.account-card[data-id="${id}"]`);
  if (!card) return;
  card.classList.add("account-card--updated");
  setTimeout(() => card.classList.remove("account-card--updated"), 1200);
}

function save() {
  localStorage.setItem("finance.accounts", JSON.stringify(accounts));
}

function load() {
  try {
    return JSON.parse(localStorage.getItem("finance.accounts")) || [];
  } catch {
    return [];
  }
}

// Persisted display order of the category groups (reorderable by drag).
function loadGroupOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem("finance.groupOrder"));
    if (Array.isArray(saved)) {
      const order = saved.filter((k) => GROUPS[k]);
      for (const k of GROUP_ORDER) if (!order.includes(k)) order.push(k);
      return order;
    }
  } catch {}
  return [...GROUP_ORDER];
}

function saveGroupOrder() {
  localStorage.setItem("finance.groupOrder", JSON.stringify(groupOrder));
}

// ---- iPhone-style arrange: long-press to jiggle, drag to reorder ----
let editMode = false;
let dragState = null;
let groupDragState = null;
let longPressTimer = null;
const LONG_PRESS_MS = 320;
const MOVE_THRESHOLD = 8;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editMode) exitEditMode();
});

// Click anywhere outside a category to leave arrange mode.
// (Cards and the surrounding category area are drag handles, so they don't exit.)
document.addEventListener("pointerdown", (e) => {
  if (!editMode || dragState || groupDragState) return;
  if (e.target.closest(".account-group")) return;
  exitEditMode();
});

function enterEditMode() {
  if (editMode) return;
  editMode = true;
  accountsEl.classList.add("accounts--editing");
}

function exitEditMode() {
  if (!editMode) return;
  editMode = false;
  accountsEl.classList.remove("accounts--editing");
}

accountsEl.addEventListener("pointerdown", onCardPointerDown);

function onCardPointerDown(e) {
  if (e.button && e.button !== 0) return;
  if (e.target.closest(".account-card__actions")) return; // let action buttons work
  if (e.target.closest(".payoff")) return; // let the payoff teaser open its own modal

  const card = e.target.closest(".account-card:not(.account-card--placeholder)");
  const groupEl = e.target.closest(".account-group");
  // Hit test: inside a category area but not on a card -> drag the whole category.
  const isGroupGrab = !card && !!groupEl;
  const handle = isGroupGrab ? groupEl : card;
  if (!handle) return;

  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const id = card ? Number(card.dataset.id) : null;
  let started = false;
  let movedFar = false;
  handle.setPointerCapture?.(e.pointerId);

  const begin = () => {
    if (started) return;
    started = true;
    enterEditMode();
    if (isGroupGrab) startGroupDrag(groupEl, e.clientX, e.clientY);
    else startDrag(card, id, e.clientX, e.clientY);
  };

  if (!editMode) {
    longPressTimer = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(8);
      begin();
    }, LONG_PRESS_MS);
  }

  const move = (ev) => {
    const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
    if (!started) {
      if (editMode && dist > MOVE_THRESHOLD) {
        begin();
      } else if (!editMode && dist > MOVE_THRESHOLD) {
        movedFar = true;
        clearTimeout(longPressTimer);
      }
    }
    if (started) {
      if (isGroupGrab) groupDragMove(ev.clientX, ev.clientY);
      else dragMove(ev.clientX, ev.clientY);
    }
  };

  const up = () => {
    clearTimeout(longPressTimer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (started) {
      if (isGroupGrab) endGroupDrag();
      else endDrag();
    } else if (!editMode && !movedFar && !isGroupGrab) {
      openCard(card);
    }
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

function openCard(card) {
  const url = card.dataset.url;
  if (url) window.open(url, "_blank", "noopener,noreferrer");
  else openEditModal(Number(card.dataset.id));
}

function startDrag(card, id, x, y) {
  const rect = card.getBoundingClientRect();
  const grid = card.closest(".account-group__grid");
  const placeholder = document.createElement("div");
  placeholder.className = "account-card account-card--placeholder";
  placeholder.style.width = rect.width + "px";
  placeholder.style.height = rect.height + "px";
  placeholder.style.visibility = "hidden";
  grid.insertBefore(placeholder, card);

  dragState = {
    id,
    el: card,
    grid,
    placeholder,
    grabDX: x - rect.left,
    grabDY: y - rect.top,
  };

  card.classList.add("account-card--dragging");
  Object.assign(card.style, {
    position: "fixed",
    margin: "0",
    width: rect.width + "px",
    height: rect.height + "px",
    left: rect.left + "px",
    top: rect.top + "px",
  });
  positionDragged(x, y);
}

function positionDragged(x, y) {
  dragState.el.style.left = x - dragState.grabDX + "px";
  dragState.el.style.top = y - dragState.grabDY + "px";
}

function dragMove(x, y) {
  positionDragged(x, y);
  const target = cardUnderPoint(x, y);
  if (target) movePlaceholder(target, x);
}

function cardUnderPoint(x, y) {
  // Only reorder within the dragged card's own group grid.
  const cards = [
    ...dragState.grid.querySelectorAll(
      ".account-card:not(.account-card--dragging):not(.account-card--placeholder)"
    ),
  ];
  return (
    cards.find((c) => {
      const r = c.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }) || null
  );
}

function movePlaceholder(target, x) {
  const ph = dragState.placeholder;
  const flipCards = [...accountsEl.querySelectorAll(".account-card:not(.account-card--dragging)")];
  const first = new Map(flipCards.map((c) => [c, c.getBoundingClientRect()]));

  const r = target.getBoundingClientRect();
  if (x > r.left + r.width / 2) target.after(ph);
  else target.before(ph);

  for (const c of flipCards) {
    if (c === ph) continue;
    const a = first.get(c);
    const b = c.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (!dx && !dy) continue;
    // composite:"add" so the slide layers on top of the running jiggle animation
    c.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
      { duration: 240, easing: "cubic-bezier(0.2,0.8,0.3,1)", composite: "add" }
    );
  }
}

function endDrag() {
  const { el, placeholder, id } = dragState;
  // Flatten every group grid in DOM order; placeholder marks the dragged card's slot.
  const order = [...accountsEl.querySelectorAll(".account-group__grid > *")]
    .filter((node) => node !== el)
    .map((node) => (node === placeholder ? id : Number(node.dataset.id)))
    .filter((v) => !Number.isNaN(v));
  accounts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  dragState = null;
  save();
  render();
}

// ---- Category (group) drag-to-reorder ----
function startGroupDrag(section, x, y) {
  const rect = section.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "account-group account-group--placeholder";
  placeholder.style.width = rect.width + "px";
  placeholder.style.height = rect.height + "px";
  placeholder.style.visibility = "hidden";
  accountsEl.insertBefore(placeholder, section);

  groupDragState = {
    el: section,
    placeholder,
    grabDX: x - rect.left,
    grabDY: y - rect.top,
  };

  section.classList.add("account-group--dragging");
  Object.assign(section.style, {
    position: "fixed",
    margin: "0",
    width: rect.width + "px",
    left: rect.left + "px",
    top: rect.top + "px",
  });
  positionDraggedGroup(x, y);
}

function positionDraggedGroup(x, y) {
  groupDragState.el.style.left = x - groupDragState.grabDX + "px";
  groupDragState.el.style.top = y - groupDragState.grabDY + "px";
}

function groupDragMove(x, y) {
  positionDraggedGroup(x, y);
  const target = groupUnderPoint(y);
  if (target) moveGroupPlaceholder(target, y);
}

function groupUnderPoint(y) {
  const sections = [
    ...accountsEl.querySelectorAll(
      ".account-group:not(.account-group--dragging):not(.account-group--placeholder)"
    ),
  ];
  return (
    sections.find((s) => {
      const r = s.getBoundingClientRect();
      return y >= r.top && y <= r.bottom;
    }) || null
  );
}

function moveGroupPlaceholder(target, y) {
  const ph = groupDragState.placeholder;
  const flip = [...accountsEl.querySelectorAll(".account-group:not(.account-group--dragging)")];
  const first = new Map(flip.map((s) => [s, s.getBoundingClientRect()]));

  const r = target.getBoundingClientRect();
  if (y > r.top + r.height / 2) target.after(ph);
  else target.before(ph);

  for (const s of flip) {
    if (s === ph) continue;
    const a = first.get(s);
    const b = s.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    if (!dx && !dy) continue;
    s.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
      { duration: 240, easing: "cubic-bezier(0.2,0.8,0.3,1)", composite: "add" }
    );
  }
}

function endGroupDrag() {
  const { el, placeholder } = groupDragState;
  const visible = [...accountsEl.querySelectorAll(".account-group")]
    .filter((node) => node !== el)
    .map((node) => (node === placeholder ? el.dataset.group : node.dataset.group))
    .filter(Boolean);
  // Keep empty (hidden) groups too, appended after the visible order.
  for (const key of groupOrder) if (!visible.includes(key)) visible.push(key);
  groupOrder = visible;
  groupDragState = null;
  saveGroupOrder();
  render();
}

// ---- Light/dark theme toggle ----
const THEME_KEY = "finance.theme";
const themeToggleBtn = document.getElementById("theme-toggle-btn");
function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (themeToggleBtn) themeToggleBtn.textContent = theme === "dark" ? "\u2600\uFE0F Light mode" : "\uD83C\uDF19 Dark mode";
}
applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
themeToggleBtn?.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

// ---- Settings modal ----
const settingsModal = document.getElementById("settings-modal");
document.getElementById("settings-btn").addEventListener("click", () => settingsModal.classList.add("open"));
document.getElementById("close-settings-btn").addEventListener("click", () => settingsModal.classList.remove("open"));
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove("open");
});

// ---- Account review checklist (optional, toggled in Settings) ----
const REVIEW_ENABLED_KEY = "finance.reviewEnabled";
const reviewToggleBtn = document.getElementById("review-toggle-btn");
let reviewFeatureEnabled = localStorage.getItem(REVIEW_ENABLED_KEY) === "true";
function applyReviewSetting(enabled) {
  reviewFeatureEnabled = enabled;
  if (reviewToggleBtn) reviewToggleBtn.textContent = enabled ? "On" : "Off";
  render();
}
reviewToggleBtn?.addEventListener("click", () => {
  const next = !reviewFeatureEnabled;
  localStorage.setItem(REVIEW_ENABLED_KEY, String(next));
  applyReviewSetting(next);
});
if (reviewToggleBtn) reviewToggleBtn.textContent = reviewFeatureEnabled ? "On" : "Off";

// Only checking/savings/cash and credit card accounts accumulate enough transactions to be worth reviewing.
function needsReviewCheck(a) {
  const g = groupOf(a);
  return g === "cash" || g === "credit";
}
// The start of the current "review period" — the most recent payday across all income accounts
// (today counts), or the start of this calendar month if there's no income account to anchor on.
function currentReviewPeriodStart() {
  const now = new Date();
  const incomeAccounts = accounts.filter((a) => groupOf(a) === "income" && a.lastPayDate);
  if (!incomeAccounts.length) return new Date(now.getFullYear(), now.getMonth(), 1);
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - 40);
  let latest = null;
  for (const inc of incomeAccounts) {
    const paydays = paydaysInRange(inc.payFrequency, inc.lastPayDate, lookbackStart, startOfToday());
    const lastForAccount = paydays[paydays.length - 1];
    if (lastForAccount && (!latest || lastForAccount > latest)) latest = lastForAccount;
  }
  return latest || new Date(now.getFullYear(), now.getMonth(), 1);
}
// Reviewed status isn't a stored flag on its own — it's derived from comparing the last review
// timestamp to the current period's start, so it automatically "resets" once a new payday arrives.
function isAccountReviewed(a) {
  return !!a.reviewedAt && new Date(a.reviewedAt) >= currentReviewPeriodStart();
}
function toggleReviewed(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc) return;
  if (isAccountReviewed(acc)) delete acc.reviewedAt;
  else acc.reviewedAt = new Date().toISOString();
  save();
  render();
}

// ---- Pending incoming/outgoing money modal ----
const pendingModal = document.getElementById("pending-modal");
const pendingDirectionInput = document.getElementById("pending-direction");
const pendingDescInput = document.getElementById("pending-desc");
const pendingPartyInput = document.getElementById("pending-party");
const pendingPartyLabel = document.getElementById("pending-party-label");
const pendingPartyListEl = document.getElementById("pending-party-list");
const pendingAmountInput = document.getElementById("pending-amount");

// Pending entries always apply to whichever Cash & Savings account is checked for Upcoming dues.
function findDesignatedCashAccount() {
  return accounts.find((a) => groupOf(a) === "cash" && a.includeInCashFlow === true);
}
function updatePendingPartyLabel() {
  pendingPartyLabel.textContent = pendingDirectionInput.value === "out" ? "Payee (optional)" : "Payer (optional)";
}
pendingDirectionInput.addEventListener("change", updatePendingPartyLabel);
const pendingPeriodSelect = document.getElementById("pending-period");

document.getElementById("add-pending-btn").addEventListener("click", () => {
  if (!findDesignatedCashAccount()) {
    alert("Check an account in Cash & Savings first \u2014 pending entries need one to apply to.");
    return;
  }
  pendingDirectionInput.value = "in";
  pendingDescInput.value = "";
  pendingPartyInput.value = "";
  pendingAmountInput.value = "";
  updatePendingPartyLabel();
  pendingPartyListEl.innerHTML = accounts.map((a) => `<option value="${escapeHtml(a.name)}"></option>`).join("");
  // periodOptions is rebuilt by the most recent renderCashFlow() call — always current by the time this opens.
  pendingPeriodSelect.innerHTML = periodOptions.map((o) => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join("");
  pendingModal.classList.add("open");
});
document.getElementById("cancel-pending-btn").addEventListener("click", () => pendingModal.classList.remove("open"));
pendingModal.addEventListener("click", (e) => {
  if (e.target === pendingModal) pendingModal.classList.remove("open");
});
document.getElementById("save-pending-btn").addEventListener("click", () => {
  const description = pendingDescInput.value.trim();
  const amount = parseFloat(pendingAmountInput.value);
  if (!description || !Number.isFinite(amount) || amount <= 0) {
    alert("Please enter a description and an amount greater than 0.");
    return;
  }
  pendingTx.push({
    id: Date.now(),
    description,
    party: pendingPartyInput.value.trim(),
    amount,
    direction: pendingDirectionInput.value === "out" ? "out" : "in",
    createdAt: new Date().toISOString(),
    periodKey: pendingPeriodSelect.value || currentPeriodKey,
  });
  savePendingTx();
  pendingModal.classList.remove("open");
  render();
});
function resolvePendingTx(id) {
  const p = pendingTx.find((p) => p.id === id);
  if (!p) return;
  // Money was only ever a *preview* adjustment on the designated account's card/balance while pending —
  // resolving it needs to actually land it in that account's real balance, or the money just vanishes.
  const designated = findDesignatedCashAccount();
  if (designated) {
    designated.balance = (Number(designated.balance) || 0) + (p.direction === "out" ? -p.amount : p.amount);
    p.resolvedAccountId = designated.id; // so restore reverses it on the SAME account, even if the designation changes later
    save();
  }
  p.resolvedAt = new Date().toISOString(); // kept forever for history — never deleted, just flagged resolved
  savePendingTx();
  render();
}
// Moves a resolved pending entry back to the active list (from the Completed column or History popup).
function restorePendingTx(id) {
  const p = pendingTx.find((p) => p.id === id);
  if (!p) return;
  if (p.resolvedAccountId != null) {
    const acc = accounts.find((a) => a.id === p.resolvedAccountId);
    if (acc) {
      acc.balance = (Number(acc.balance) || 0) - (p.direction === "out" ? -p.amount : p.amount);
      save();
    }
    delete p.resolvedAccountId;
  }
  delete p.resolvedAt;
  savePendingTx();
  render();
}
// Permanently removes a pending entry (e.g. entered by mistake) — unlike resolve/restore this has no reversal.
function deletePendingTx(id) {
  const p = pendingTx.find((p) => p.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.description}"?`)) return;
  pendingTx = pendingTx.filter((p) => p.id !== id);
  savePendingTx();
  render();
}

// ---- Full activity history popup: every paid bill + every resolved pending entry, ever, in one scrollable list ----
const historyModal = document.getElementById("history-modal");
const historyListEl = document.getElementById("history-list");
document.getElementById("view-history-btn").addEventListener("click", () => {
  renderHistory();
  historyModal.classList.add("open");
});
document.getElementById("close-history-btn").addEventListener("click", () => historyModal.classList.remove("open"));
historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) historyModal.classList.remove("open");
});
function renderHistory() {
  const billEntries = payments.map((p) => {
    const acc = accounts.find((a) => a.id === p.accountId);
    return { date: p.date, kind: "out", title: acc ? acc.name : "(deleted account)", subtitle: "Bill paid", amount: p.amount, undoId: p.id, isPending: false };
  });
  const pendingEntries = pendingTx
    .filter((p) => p.resolvedAt)
    .map((p) => ({
      date: p.resolvedAt.slice(0, 10),
      kind: p.direction === "out" ? "out" : "in",
      title: p.description,
      subtitle: p.party ? `${p.direction === "out" ? "To" : "From"} ${p.party}` : p.direction === "out" ? "Sent" : "Received",
      amount: p.amount,
      undoId: p.id,
      isPending: true,
    }));
  const entries = [...billEntries, ...pendingEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!entries.length) {
    historyListEl.innerHTML = `<div class="empty">Nothing marked paid or received yet.</div>`;
    return;
  }
  let lastMonthKey = "";
  const rows = [];
  for (const e of entries) {
    const d = parseLocalDate(e.date);
    const monthKey = e.date.slice(0, 7);
    if (monthKey !== lastMonthKey) {
      rows.push(`<div class="cashflow__group-month"><span>${d ? monthYear(d) : e.date}</span></div>`);
      lastMonthKey = monthKey;
    }
    rows.push(`
      <div class="due-item due-item--completed">
        <div class="due-item__top">
          <div class="due-item__icon">${e.kind === "out" ? "\u{1F4E4}" : "\u{1F4E5}"}</div>
          <div class="due-item__info">
            <div class="due-item__name">${escapeHtml(e.title)}</div>
            <div class="due-item__meta">${escapeHtml(e.subtitle)} \u00b7 ${escapeHtml(formatShortDate(e.date))}</div>
          </div>
          <div class="due-item__amount due-item__amount--${e.kind}">${e.kind === "out" ? "\u2212" : "+"}${money(e.amount)}</div>
          <button class="btn btn--ghost due-item__pay" data-${e.isPending ? "restore-pending" : "undo-payment"}="${e.undoId}">&#8617; Return to activity</button>
        </div>
      </div>`);
  }
  historyListEl.innerHTML = rows.join("");
  historyListEl.querySelectorAll("[data-undo-payment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      undoPayment(Number(btn.dataset.undoPayment));
      renderHistory();
    });
  });
  historyListEl.querySelectorAll("[data-restore-pending]").forEach((btn) => {
    btn.addEventListener("click", () => {
      restorePendingTx(Number(btn.dataset.restorePending));
      renderHistory();
    });
  });
}

// Fills the app with a plausible, varied demo dataset — handy for showing the app off.
function randomizeDemoData() {
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (arr) => arr[randInt(0, arr.length - 1)];
  const uid = () => Date.now() + Math.floor(Math.random() * 100000);
  const now = new Date();
  const isoInMonths = (months, day) => new Date(now.getFullYear(), now.getMonth() + months, day).toISOString().slice(0, 10);
  const lastPayDate = new Date(now);
  lastPayDate.setDate(lastPayDate.getDate() - randInt(1, 13));

  const demoAccounts = [
    { id: uid(), name: "Everyday Checking", type: "checking", balance: randInt(1800, 8600) },
    { id: uid(), name: "High-Yield Savings", type: "savings", balance: randInt(6000, 32000) },
    {
      id: uid(),
      name: "Salary",
      type: "salary",
      balance: randInt(2200, 4400),
      payFrequency: "biweekly",
      lastPayDate: lastPayDate.toISOString().slice(0, 10),
    },
    { id: uid(), name: "Brokerage", type: "investment", balance: randInt(9000, 68000) },
    { id: uid(), name: "401(k)", type: "retirement", balance: randInt(24000, 145000) },
    {
      id: uid(),
      name: "Home",
      type: "property",
      address: pick([
        "412 Maple St, Austin, TX",
        "88 Birchwood Ave, Denver, CO",
        "215 Sunset Dr, Raleigh, NC",
      ]),
      zillow: randInt(380000, 520000),
      redfin: randInt(370000, 530000),
      balance: randInt(180000, 340000),
      minAmount: randInt(1400, 2400),
      dueDay: 1,
      apr: Number((randInt(55, 70) / 10).toFixed(2)),
    },
    {
      id: uid(),
      name: "Rewards Visa",
      type: "credit",
      balance: randInt(600, 5200),
      minAmount: randInt(35, 220),
      dueDay: randInt(1, 28),
      apr: randInt(19, 27),
      origBalance: randInt(6000, 12000),
    },
    {
      id: uid(),
      name: "0% Intro Mastercard",
      type: "credit",
      balance: randInt(1200, 4000),
      minAmount: randInt(100, 250),
      dueDay: randInt(1, 28),
      apr: 0,
      origBalance: randInt(4000, 6000),
      payoffBy: isoInMonths(randInt(4, 14), randInt(1, 28)),
    },
    {
      id: uid(),
      name: "Auto Loan",
      type: "auto",
      balance: randInt(9000, 24000),
      minAmount: randInt(280, 520),
      dueDay: randInt(1, 28),
      apr: Number((randInt(35, 85) / 10).toFixed(2)),
    },
    { id: uid(), name: "Internet", type: "internet", minAmount: randInt(55, 95), dueDay: randInt(1, 28) },
    { id: uid(), name: "Streaming Bundle", type: "subscription", minAmount: randInt(12, 35), dueDay: randInt(1, 28) },
    { id: uid(), name: "Local Food Bank", type: "donation", minAmount: randInt(20, 75), dueDay: randInt(1, 28) },
  ];
  const home = demoAccounts.find((a) => a.type === "property");
  if (home) home.homeValue = Math.round((home.zillow + home.redfin) / 2);

  // Log a couple of already-paid bills this month so the demo feels lived-in, not brand new.
  const demoPayments = [];
  for (const a of demoAccounts.filter((a) => a.type === "internet" || a.type === "subscription")) {
    demoPayments.push({
      id: uid(),
      accountId: a.id,
      date: new Date(now.getFullYear(), now.getMonth(), Math.min(a.dueDay, 28)).toISOString().slice(0, 10),
      amount: a.minAmount,
    });
  }

  localStorage.setItem("finance.accounts", JSON.stringify(demoAccounts));
  localStorage.setItem("finance.payments", JSON.stringify(demoPayments));
  localStorage.removeItem("finance.groupOrder");
}

document.getElementById("clear-data-btn").addEventListener("click", () => {
  if (!confirm("Delete every account and payment record? This can't be undone.")) return;
  localStorage.removeItem("finance.accounts");
  localStorage.removeItem("finance.payments");
  localStorage.removeItem("finance.groupOrder");
  location.reload();
});

document.getElementById("export-data-btn").addEventListener("click", () => {
  const data = {
    accounts: JSON.parse(localStorage.getItem("finance.accounts") || "[]"),
    payments: JSON.parse(localStorage.getItem("finance.payments") || "[]"),
    groupOrder: JSON.parse(localStorage.getItem("finance.groupOrder") || "null"),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cumulus-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importFileInput = document.getElementById("import-file-input");
document.getElementById("import-data-btn").addEventListener("click", () => importFileInput.click());
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.accounts)) throw new Error("Missing accounts list");
      if (!confirm("Replace all current data with this backup?")) return;
      localStorage.setItem("finance.accounts", JSON.stringify(data.accounts));
      localStorage.setItem("finance.payments", JSON.stringify(Array.isArray(data.payments) ? data.payments : []));
      if (Array.isArray(data.groupOrder)) localStorage.setItem("finance.groupOrder", JSON.stringify(data.groupOrder));
      location.reload();
    } catch (err) {
      alert("That doesn't look like a valid Cumulus backup file.");
    }
  };
  reader.readAsText(file);
  importFileInput.value = "";
});

document.getElementById("randomize-data-btn").addEventListener("click", () => {
  if (!confirm("Replace all current data with random demo data? Handy for showing the app off.")) return;
  randomizeDemoData();
  location.reload();
});

// ---- Live header date/time ----
const dateEl = document.getElementById("app-date");
const timeEl = document.getElementById("app-time");
function updateClock() {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  timeEl.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
updateClock();
setInterval(updateClock, 1000);

// ---- Side panel: calendar (shown on wide viewports) ----
let calendarDate = new Date();
const calGridEl = document.getElementById("cal-grid");
const calTitleEl = document.getElementById("cal-title");
document.getElementById("cal-prev").addEventListener("click", () => {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  renderCalendar();
});

// ---- Calendar hover popup: a summary of what's due/payday/etc. on a highlighted day ----
let calendarDayInfo = {}; // day-of-displayed-month -> array of summary lines, rebuilt each renderCalendar()
const calTooltipEl = document.createElement("div");
calTooltipEl.className = "calendar-tooltip";
calTooltipEl.hidden = true;
document.body.appendChild(calTooltipEl);

function showCalTooltip(cell, lines) {
  calTooltipEl.innerHTML = lines.map((l) => `<div class="calendar-tooltip__row">${l}</div>`).join("");
  calTooltipEl.hidden = false;
  const rect = cell.getBoundingClientRect();
  const tipRect = calTooltipEl.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8;
  calTooltipEl.style.top = `${top}px`;
  calTooltipEl.style.left = `${left}px`;
}
function hideCalTooltip() {
  calTooltipEl.hidden = true;
}
calGridEl.addEventListener("mouseover", (e) => {
  const cell = e.target.closest(".calendar__day");
  if (!cell || cell.classList.contains("calendar__day--muted")) return;
  const info = calendarDayInfo[Number(cell.dataset.day)];
  if (!info || !info.length) {
    hideCalTooltip();
    return;
  }
  showCalTooltip(cell, info);
});
calGridEl.addEventListener("mouseout", (e) => {
  if (!e.relatedTarget || !calGridEl.contains(e.relatedTarget)) hideCalTooltip();
});

// ---- Account balance hover popup: original balance + pending in/out = the adjusted total shown on the card ----
const balanceTooltipEl = document.createElement("div");
balanceTooltipEl.className = "calendar-tooltip";
balanceTooltipEl.hidden = true;
document.body.appendChild(balanceTooltipEl);

function showBalanceTooltip(el) {
  const original = Number(el.dataset.original) || 0;
  const pendingIn = Number(el.dataset.pendingIn) || 0;
  const pendingOut = Number(el.dataset.pendingOut) || 0;
  const lines = [`Original balance <strong>${money(original)}</strong>`];
  if (pendingIn) lines.push(`+ Pending in <strong>+${money(pendingIn)}</strong>`);
  if (pendingOut) lines.push(`\u2212 Pending out <strong>\u2212${money(pendingOut)}</strong>`);
  lines.push(`= Adjusted <strong>${money(original + pendingIn - pendingOut)}</strong>`);
  balanceTooltipEl.innerHTML = lines.map((l) => `<div class="calendar-tooltip__row balance-tooltip__row">${l}</div>`).join("");
  balanceTooltipEl.hidden = false;
  const rect = el.getBoundingClientRect();
  const tipRect = balanceTooltipEl.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
  if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8;
  balanceTooltipEl.style.top = `${top}px`;
  balanceTooltipEl.style.left = `${left}px`;
}
function hideBalanceTooltip() {
  balanceTooltipEl.hidden = true;
}
accountsEl.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-balance-tooltip]");
  if (!el) return;
  showBalanceTooltip(el);
});
accountsEl.addEventListener("mouseout", (e) => {
  if (e.target.closest("[data-balance-tooltip]") && (!e.relatedTarget || !e.target.closest("[data-balance-tooltip]").contains(e.relatedTarget))) hideBalanceTooltip();
});

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  calTitleEl.textContent = calendarDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, muted: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, today: isCurrentMonth && d === today.getDate() });
  let nextDay = 1;
  while (cells.length % 7 !== 0) cells.push({ day: nextDay++, muted: true });

  // Red = something due that day and still unpaid. Green = a paycheck lands that day
  // (today/future paydays, plus the single most recent past payday — older ones stop being highlighted).
  // Computed for last month onward, with no future cutoff.
  // dayInfo collects human-readable lines per day for the hover summary popup.
  const dueStatusByDay = {};
  const paydayDays = new Set();
  const dayInfo = {};
  const addInfo = (day, line) => (dayInfo[day] || (dayInfo[day] = [])).push(line);
  if (monthInDueRange(year, month)) {
    for (const a of accounts) {
      if (!isDueAccount(a) || !a.dueDay) continue;
      const day = Math.min(a.dueDay, daysInMonth);
      const status = dueStatusByDay[day] || (dueStatusByDay[day] = { total: 0, paid: 0 });
      status.total++;
      const amount = monthlyObligation(a);
      const amountText = amount > 0 ? money(amount) : "";
      if (paidInMonth(a.id, year, month)) {
        status.paid++;
        addInfo(day, `\u2705 ${escapeHtml(a.name)} \u2014 paid${amountText ? ` ${amountText}` : ""}`);
      } else {
        addInfo(day, `\uD83D\uDD34 ${escapeHtml(a.name)} \u2014 due${amountText ? ` ${amountText}` : ""}`);
      }
    }
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);
    const todayStart = startOfToday();
    for (const a of accounts) {
      if (groupOf(a) !== "income") continue;
      const amountText = money(Number(a.balance) || 0);
      // Older paydays stop being highlighted once passed, but the most recent past payday stays lit.
      const lookbackStart = new Date(todayStart);
      lookbackStart.setDate(lookbackStart.getDate() - 40);
      const dayBeforeToday = new Date(todayStart);
      dayBeforeToday.setDate(dayBeforeToday.getDate() - 1);
      const pastPaydays = paydaysInRange(a.payFrequency, a.lastPayDate, lookbackStart, dayBeforeToday);
      const lastPastPayday = pastPaydays[pastPaydays.length - 1] || null;
      for (const d of paydaysInRange(a.payFrequency, a.lastPayDate, monthStart, monthEnd)) {
        const isPast = d < todayStart;
        const isMostRecentPast = lastPastPayday && d.getTime() === lastPastPayday.getTime();
        if (isPast && !isMostRecentPast) continue;
        paydayDays.add(d.getDate());
        addInfo(d.getDate(), `\uD83D\uDCB0 ${escapeHtml(a.name)} \u2014 payday ${amountText}`);
      }
    }
  }

  // A manually-set "pay off by" reminder date (e.g. a 0% intro APR deadline) can be any month, not just the due-date window.
  const payoffByDays = new Set();
  for (const a of accounts) {
    if (!a.payoffBy) continue;
    const d = parseLocalDate(a.payoffBy);
    if (d && d.getFullYear() === year && d.getMonth() === month) {
      payoffByDays.add(d.getDate());
      addInfo(d.getDate(), `\u23F0 ${escapeHtml(a.name)} \u2014 pay off by today`);
    }
  }
  calendarDayInfo = dayInfo;

  calGridEl.innerHTML = cells
    .map((c) => {
      let cls = "calendar__day";
      if (c.muted) cls += " calendar__day--muted";
      const status = !c.muted && dueStatusByDay[c.day];
      const isPayday = !c.muted && paydayDays.has(c.day);
      const isUnpaidDue = status && status.paid < status.total;
      // An unpaid due date always wins outright over a payday — no blend, just red.
      if (isUnpaidDue) cls += " calendar__day--due";
      else if (isPayday) cls += " calendar__day--payday";
      if (!c.muted && payoffByDays.has(c.day)) cls += " calendar__day--payoffby";
      if (c.today) cls += " calendar__day--today";
      return `<div class="${cls}" data-day="${c.day}">${c.day}</div>`;
    })
    .join("");
}
renderCalendar();

// ---- Side panel: calculator (shown on wide viewports) ----
const calcDisplayEl = document.getElementById("calc-display");
let calcValue = "0";
let calcPrev = null;
let calcOp = null;
let calcResetNext = false;

document.querySelectorAll("[data-calc]").forEach((btn) => {
  btn.addEventListener("click", () => handleCalcInput(btn.dataset.calc));
});

// Any keyboard input on the page (not while typing in a field) drives the calculator.
const CALC_KEY_MAP = {
  "0": "0", "1": "1", "2": "2", "3": "3", "4": "4",
  "5": "5", "6": "6", "7": "7", "8": "8", "9": "9",
  ".": "decimal", "+": "add", "-": "subtract", "*": "multiply", "/": "divide",
  "%": "percent", "=": "equals", "Enter": "equals", "Escape": "clear",
};
window.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
  const key = CALC_KEY_MAP[e.key] || (e.key.toLowerCase() === "c" ? "clear" : null);
  if (!key) return;
  e.preventDefault();
  handleCalcInput(key);
  const btn = document.querySelector(`[data-calc="${key}"]`);
  if (btn) {
    btn.classList.add("calculator__btn--pressed");
    setTimeout(() => btn.classList.remove("calculator__btn--pressed"), 120);
  }
});

function handleCalcInput(key) {
  if (!Number.isNaN(Number(key)) && key !== "") {
    if (calcValue === "0" || calcResetNext) {
      calcValue = key;
      calcResetNext = false;
    } else {
      calcValue += key;
    }
  } else if (key === "decimal") {
    if (calcResetNext) {
      calcValue = "0.";
      calcResetNext = false;
    } else if (!calcValue.includes(".")) {
      calcValue += ".";
    }
  } else if (key === "clear") {
    calcValue = "0";
    calcPrev = null;
    calcOp = null;
    calcResetNext = false;
  } else if (key === "sign") {
    calcValue = String(parseFloat(calcValue) * -1);
  } else if (key === "percent") {
    calcValue = String(parseFloat(calcValue) / 100);
  } else if (key === "add" || key === "subtract" || key === "multiply" || key === "divide") {
    if (calcOp && !calcResetNext) {
      calcValue = String(calcCompute(calcPrev, parseFloat(calcValue), calcOp));
    }
    calcPrev = parseFloat(calcValue);
    calcOp = key;
    calcResetNext = true;
  } else if (key === "equals") {
    if (calcOp !== null) {
      calcValue = String(calcCompute(calcPrev, parseFloat(calcValue), calcOp));
      calcOp = null;
      calcPrev = null;
      calcResetNext = true;
    }
  }
  calcDisplayEl.textContent = formatCalcValue(calcValue);
}

function calcCompute(a, b, op) {
  switch (op) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "divide":
      return b === 0 ? 0 : a / b;
    default:
      return b;
  }
}

// Trim floating-point noise (e.g. 0.1+0.2) before displaying.
function formatCalcValue(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "Error";
  return String(Math.round(n * 1e10) / 1e10);
}

// Line up the side panels' tops with the net-worth summary box, not the header.
function alignSidePanels() {
  const app = document.querySelector(".app");
  const summary = document.querySelector(".summary");
  if (!app || !summary) return;
  const offset = summary.getBoundingClientRect().top - app.getBoundingClientRect().top;
  document.querySelectorAll(".side-panel").forEach((p) => {
    p.style.marginTop = offset + "px";
  });
}
alignSidePanels();
window.addEventListener("resize", alignSidePanels);

render();
refreshCryptoPrices(); // pick up live prices once at startup (cards render first with last-known values)

