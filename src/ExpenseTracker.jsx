
import AIAdvisor from "./AIAdvisor.jsx";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, AreaChart, Area, ReferenceLine,
} from "recharts";
import qyntLogo from "./qynt-logo.svg";
import qyntLogoDark from "./qynt-logo-dark.svg";
import { supabase } from "./supabaseClient";

/* Tracks whatever theme is actually applied to <html data-theme>, so components (the logo, mainly)
   can react to it without needing the theme setting threaded down as a prop from the top. */
function useAppliedTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(el.dataset.theme || "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

/* ─────────────────────────  THEME  ───────────────────────── */
const T = {
  bg: "var(--bg)", sidebar: "var(--sidebar)", surface: "var(--surface)", surface2: "var(--surface2)", line: "var(--line)",
  dark: "var(--dark)", darkSoft: "var(--darkSoft)", deepGreen: "var(--deepGreen)", mint: "var(--mint)", mintSoft: "var(--mintSoft)",
  gold: "var(--gold)", goldSoft: "var(--goldSoft)", rose: "var(--rose)", roseSoft: "var(--roseSoft)",
  text: "var(--text)", mut: "var(--mut)", mut2: "var(--mut2)",
};

/* ─────────────────  DEFAULT CATEGORIES  ───────────────── */
const DEFAULT_CATS = {
  heads: [
    { name: "Housing & Utilities", color: "#E0A93F", kind: "expense" },
    { name: "Transportation", color: "#4A90A4", kind: "expense" },
    { name: "Food & Dining", color: "#2E9B8F", kind: "expense" },
    { name: "Health & Wellness", color: "#EF5A6F", kind: "expense" },
    { name: "Entertainment & Leisure", color: "#9B5DE5", kind: "expense" },
    { name: "Personal Care & Shopping", color: "#F15BB5", kind: "expense" },
    { name: "Financial & Insurance", color: "#118AB2", kind: "expense" },
    { name: "Education & Growth", color: "#06D6A0", kind: "expense" },
    { name: "Family & Kids", color: "#FF8C42", kind: "expense" },
    { name: "Gifts & Donations", color: "#E8B04B", kind: "expense" },
    { name: "Transfers & Cash Movement", color: "#8FA88E", kind: "expense" },
    { name: "Miscellaneous", color: "#5B8DEF", kind: "expense" },
    { name: "Income", color: "#4FB878", kind: "income" },
  ],
  subcats: {
    "Housing & Utilities": ["Rent", "Property Taxes", "Home Insurance", "Electricity/Gas", "Water/Waste", "Internet", "Home Supplies", "Furniture", "Phone"],
    Transportation: ["Vehicle Loan", "Fuel", "Public Transit", "Taxi", "Parking", "Maintenance", "Vehicle Repair", "Car Insurance"],
    "Food & Dining": ["Groceries", "Restaurants", "Fast Food", "Cafes", "Coffee", "Snacks", "Drinks", "Dessert", "Delivery/Takeaway", "Fruits"],
    "Health & Wellness": ["Medical Insurance", "Doctor Visits", "Pharmacy", "Dental", "Healthcare", "Medicine", "Lab/Test", "Fitness"],
    "Entertainment & Leisure": ["Subscriptions", "Events", "Cinema", "Swimming", "Hobbies", "Gaming", "Travel", "Activities"],
    "Personal Care & Shopping": ["Clothing", "Shoes", "Shopping", "Grooming", "Salon", "Toiletries", "Laundry", "Personal Items"],
    "Financial & Insurance": ["Emergency Fund", "Investments", "Debt Paydown", "Personal Loan", "Bank Charges", "Life Insurance", "Savings Allocation"],
    "Education & Growth": ["Tuition", "School Fees", "Books", "Stationery", "Courses", "Certifications", "Career Training"],
    "Family & Kids": ["Mother", "Father", "Wife", "Kids", "Diapers", "Baby Care", "Child Care", "Toys", "Family Support"],
    "Gifts & Donations": ["Gifts", "Cash Gifts", "Donations", "Religious Giving", "Wedding Gifts", "Birthday Gifts"],
    "Transfers & Cash Movement": ["Bank Transfer", "Wallet Transfer", "Cash Withdrawal", "Cash Deposit", "Cash Support", "Account Transfer"],
    Miscellaneous: ["Unexpected", "Emergency Repairs", "Uncategorized", "Other", "One-time Expense"],
    Income: ["Salary", "Quaid Ventures", "Income"],
  },
};

/* Maps the OLD default taxonomy (pre-restructure) onto the new one above, so existing accounts can be
   migrated in place. A subcat entry that's a plain string is renamed within the same mapped head; an
   {head, sub} object means that subcategory actually belongs under a different new main category. */
const CATEGORY_MIGRATION = {
  "Food & drinks": {
    head: "Food & Dining",
    subs: { Groceries: "Groceries", Restaurant: "Restaurants", Food: "Fast Food", Coffee: "Coffee", Snacks: "Snacks", Drinks: "Drinks" },
  },
  Transportation: {
    head: "Transportation",
    subs: { Petrol: "Fuel", Parking: "Parking", Taxi: "Taxi", Repair: "Vehicle Repair" },
  },
  Housing: {
    head: "Housing & Utilities",
    subs: {
      Electricity: "Electricity/Gas", Water: "Water/Waste", Telephone: "Phone", "Home supplies": "Home Supplies",
      Loan: { head: "Financial & Insurance", sub: "Personal Loan" },
      Mama: { head: "Family & Kids", sub: "Mother" },
      Papa: { head: "Family & Kids", sub: "Father" },
      Bank: { head: "Financial & Insurance", sub: "Bank Charges" },
      "Bank Transfer": { head: "Transfers & Cash Movement", sub: "Bank Transfer" },
    },
  },
  Lifestyle: {
    head: "Personal Care & Shopping",
    subs: {
      Shopping: "Shopping", Salon: "Salon",
      Pharmacy: { head: "Health & Wellness", sub: "Pharmacy" },
      Furniture: { head: "Housing & Utilities", sub: "Furniture" },
      "Child care": { head: "Family & Kids", sub: "Child Care" },
      Mirha: { head: "Family & Kids", sub: "Kids" },
      Tickets: { head: "Entertainment & Leisure", sub: "Events" },
    },
  },
  Entertainment: {
    head: "Entertainment & Leisure",
    subs: {
      Subscription: "Subscriptions",
      Electronics: { head: "Personal Care & Shopping", sub: "Shopping" },
      Entertainment: "Activities",
    },
  },
  Miscellaneous: {
    head: "Miscellaneous",
    subs: {
      Gift: { head: "Gifts & Donations", sub: "Gifts" },
      Healthcare: { head: "Health & Wellness", sub: "Healthcare" },
      Miscellaneous: "Other",
    },
  },
  Income: { head: "Income", subs: {} },
};
function resolveCategoryMigration(oldHead, oldSub) {
  const rule = CATEGORY_MIGRATION[oldHead];
  if (!rule) return null;
  const subRule = rule.subs[oldSub];
  if (!subRule) return { head: rule.head, sub: oldSub };
  return typeof subRule === "string" ? { head: rule.head, sub: subRule } : { head: subRule.head, sub: subRule.sub };
}
function migrateToNewCategoryStructure(cats, txns, budgets) {
  const heads = DEFAULT_CATS.heads.map((h) => ({ ...h }));
  const subcats = {};
  Object.entries(DEFAULT_CATS.subcats).forEach(([h, list]) => { subcats[h] = [...list]; });
  const kept = [];

  cats.heads.forEach((h) => {
    if (!CATEGORY_MIGRATION[h.name] && !heads.some((x) => x.name === h.name)) {
      heads.push(h);
      subcats[h.name] = subcats[h.name] || [...(cats.subcats[h.name] || [])];
      kept.push(h.name);
    }
  });

  const newTxns = txns.map((t) => {
    const resolved = resolveCategoryMigration(t.head, t.cat);
    if (!resolved) return t;
    if (!subcats[resolved.head]) subcats[resolved.head] = [];
    if (!subcats[resolved.head].some((s) => s.toLowerCase() === resolved.sub.toLowerCase())) subcats[resolved.head].push(resolved.sub);
    return { ...t, head: resolved.head, cat: resolved.sub };
  });

  const seenBudgetHeads = new Set();
  const newBudgets = [];
  budgets.forEach((b) => { if (!CATEGORY_MIGRATION[b.head]) { newBudgets.push(b); seenBudgetHeads.add(b.head); } });
  budgets.forEach((b) => {
    const rule = CATEGORY_MIGRATION[b.head];
    if (rule && !seenBudgetHeads.has(rule.head)) { newBudgets.push({ ...b, head: rule.head }); seenBudgetHeads.add(rule.head); }
  });

  return { cats: { heads, subcats }, txns: newTxns, budgets: newBudgets, kept };
}

/* ───────────────────────  HELPERS  ─────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fm = (n, dec = 2) => n.toLocaleString("en-PK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const money = (n, currency) => `${fm(n)} ${currency}`;
const monthLabel = (m) => {
  const [y, mo] = m.split("-");
  return new Date(+y, +mo - 1, 1).toLocaleString("en", { month: "short" }) + " " + y;
};
const dateLabel = (dateStr) => new Date(dateStr + "T00:00").toLocaleDateString("en", { month: "short", day: "2-digit", year: "numeric" });
const dayAxisLabel = (dateStr) => new Date(dateStr + "T00:00").toLocaleDateString("en", { month: "short", day: "2-digit" });
const iso = (d) => d.toISOString().slice(0, 10);
const weekBounds = (dateStr) => {
  const d = new Date(dateStr + "T00:00");
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
};
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
const TXN_KEY = "expense-tracker:transactions:v1";
const CAT_KEY = "expense-tracker:categories:v1";
const WALLET_KEY = "expense-tracker:wallets:v1";
const BUDGET_KEY = "expense-tracker:budgets:v1";
const SAVING_KEY = "expense-tracker:savings:v1";
const PROFILE_KEY = "expense-tracker:profile:v1";
const DAILY_LIMIT_KEY = "expense-tracker:dailylimit:v1";
const ONBOARDED_KEY = "expense-tracker:onboarded:v1";
const DEFAULT_PROFILE = {
  name: "You", email: "", color: "#2E9B8F", avatar: "",
  sex: "", dobDay: "", dobMonth: "", dobYear: "",
  currency: "PKR", language: "English", theme: "system",
};
const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];
const CURRENCY_OPTIONS = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "INR"];
const CURRENCY_NAMES = {
  PKR: "Pakistani Rupee", USD: "United States Dollar", EUR: "Euro", GBP: "British Pound",
  AED: "United Arab Emirates Dirham", SAR: "Saudi Riyal", INR: "Indian Rupee",
};
const LANGUAGE_OPTIONS = ["English", "Urdu", "Arabic"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function saveKey(userId, key, value) {
  const { error } = await supabase.from("app_data").upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function loadAllData(userId, keysWithFallback) {
  const { data, error } = await supabase.from("app_data").select("key,value").eq("user_id", userId);
  if (error) throw error;
  const byKey = new Map((data || []).map((r) => [r.key, r.value]));
  const result = {};
  const backfills = [];
  for (const [key, fallback] of keysWithFallback) {
    if (byKey.has(key)) {
      result[key] = byKey.get(key);
    } else {
      result[key] = fallback;
      backfills.push(supabase.from("app_data").upsert({ user_id: userId, key, value: fallback }));
    }
  }
  if (backfills.length) Promise.all(backfills);
  return result;
}

const MAX_WALLETS = 2;
const MAX_BUDGETS = 5;
const MAX_SAVINGS = 2;
const DEFAULT_WALLET_ID = "wallet-main";
const DEFAULT_WALLETS = [{ id: DEFAULT_WALLET_ID, name: "Main Wallet", color: T.mint, startingBalance: 0 }];

const defaultScope = () => ({ mode: "all", year: "", month: "", week: "", from: "", to: "" });

function scopeRange(s) {
  if (s.mode === "year" && s.year) return [`${s.year}-01-01`, `${s.year}-12-31`];
  if (s.mode === "month" && s.month) return [`${s.month}-01`, `${s.month}-31`];
  if (s.mode === "week" && s.week) return weekBounds(s.week);
  if (s.mode === "custom" && (s.from || s.to)) return [s.from || "0000-01-01", s.to || "9999-12-31"];
  return null;
}
function currentMonthRange() {
  const now = new Date();
  return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
}
const inScope = (dateStr, s) => {
  const r = scopeRange(s);
  return !r || (dateStr >= r[0] && dateStr <= r[1]);
};
function scopeLabel(s) {
  if (s.mode === "year" && s.year) return s.year;
  if (s.mode === "month" && s.month) return monthLabel(s.month);
  if (s.mode === "week" && s.week) { const [a, b] = weekBounds(s.week); return `${dateLabel(a)} → ${dateLabel(b)}`; }
  if (s.mode === "custom" && (s.from || s.to)) return `${s.from ? dateLabel(s.from) : "…"} → ${s.to ? dateLabel(s.to) : "…"}`;
  return "All time";
}
function daysInRange(fromISO, toISO) {
  const out = [];
  const d = new Date(fromISO + "T00:00");
  const end = new Date(toISO + "T00:00");
  while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function monthsInRange(fromISO, toISO) {
  const out = [];
  let y = +fromISO.slice(0, 4), m = +fromISO.slice(5, 7);
  const endY = +toISO.slice(0, 4), endM = +toISO.slice(5, 7);
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/* ───────────────  DATA EXPORT (CSV / XLSX)  ─────────────── */
const EXPORT_COLUMNS = ["Date", "Type", "Category", "Subcategory", "Note", "Wallet", "Amount", "Currency"];
const EXPORT_COL_WIDTHS = [12, 10, 16, 16, 30, 14, 12, 10];
function transactionsToRows(txns, wallets, currency) {
  const walletName = (id) => wallets.find((w) => w.id === id)?.name || "";
  return txns.map((t) => ({
    Date: t.date,
    Type: t.amount >= 0 ? "Income" : "Expense",
    Category: t.head,
    Subcategory: t.cat,
    Note: t.note || "",
    Wallet: walletName(t.walletId),
    Amount: t.amount,
    Currency: currency,
  }));
}
function escapeCSVField(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function rowsToCSV(rows) {
  const lines = [EXPORT_COLUMNS.join(",")];
  rows.forEach((r) => lines.push(EXPORT_COLUMNS.map((c) => escapeCSVField(r[c])).join(",")));
  return lines.join("\n");
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function downloadText(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

function xmlEscape(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function colLetter(i) {
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}
function xlsxSheetXML(rows) {
  const cols = `<cols>${EXPORT_COL_WIDTHS.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const headerRow = `<row r="1">${EXPORT_COLUMNS.map((c, i) =>
    `<c r="${colLetter(i)}1" t="inlineStr" s="1"><is><t>${xmlEscape(c)}</t></is></c>`).join("")}</row>`;
  const dataRows = rows.map((row, ri) => {
    const r = ri + 2;
    const cells = EXPORT_COLUMNS.map((c, i) => {
      const ref = `${colLetter(i)}${r}`;
      if (c === "Amount") return `<c r="${ref}"><v>${Number(row[c]) || 0}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(row[c])}</t></is></c>`;
    }).join("");
    return `<row r="${r}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${cols}<sheetData>${headerRow}${dataRows}</sheetData>
</worksheet>`;
}
const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" xfId="0"/><xf numFmtId="0" fontId="1" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const XLSX_WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
const XLSX_CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
const XLSX_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
const XLSX_WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach(({ name, data }) => {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const size = data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const centralOffset = offset;
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function rowsToXLSXBlob(rows) {
  const enc = new TextEncoder();
  const files = [
    { name: "[Content_Types].xml", data: enc.encode(XLSX_CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: enc.encode(XLSX_RELS_XML) },
    { name: "xl/workbook.xml", data: enc.encode(XLSX_WORKBOOK_XML) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(XLSX_WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: enc.encode(XLSX_STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(xlsxSheetXML(rows)) },
  ];
  return buildZip(files);
}

function parseCSVText(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rowsToObjects(rows);
}
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v !== undefined && v !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { if (h) obj[h] = r[i] ?? ""; });
      return obj;
    });
}
function excelSerialToISO(n) {
  return iso(new Date(Math.round((n - 25569) * 86400 * 1000)));
}

async function inflateRawDeflate(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't read compressed .xlsx files — try Chrome, Edge, or a recent Safari/Firefox.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function readZipEntries(buf) {
  const dv = new DataView(buf);
  const len = buf.byteLength;
  let eocd = -1;
  for (let i = len - 22; i >= 0 && i >= len - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That doesn't look like a valid .xlsx file.");
  const count = dv.getUint16(eocd + 10, true);
  let offset = dv.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(offset, true) !== 0x02014b50) break;
    const method = dv.getUint16(offset + 10, true);
    const compSize = dv.getUint32(offset + 20, true);
    const nameLen = dv.getUint16(offset + 28, true);
    const extraLen = dv.getUint16(offset + 30, true);
    const commentLen = dv.getUint16(offset + 32, true);
    const localHeaderOffset = dv.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buf, offset + 46, nameLen));
    entries.push({ name, method, compSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
async function readZipEntryText(buf, entries, name) {
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;
  const dv = new DataView(buf);
  const lo = entry.localHeaderOffset;
  const nameLen = dv.getUint16(lo + 26, true);
  const extraLen = dv.getUint16(lo + 28, true);
  const raw = new Uint8Array(buf, lo + 30 + nameLen + extraLen, entry.compSize);
  const bytes = entry.method === 0 ? raw : await inflateRawDeflate(raw);
  return new TextDecoder("utf-8").decode(bytes);
}
function parseSharedStrings(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) =>
    Array.from(si.getElementsByTagName("t")).map((t) => t.textContent).join(""));
}
function colIndexFromRef(ref) {
  const letters = (ref.match(/^[A-Z]+/) || [""])[0];
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return col - 1;
}
function parseWorksheetRows(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("row")).map((rowEl) => {
    const rowArr = [];
    Array.from(rowEl.getElementsByTagName("c")).forEach((c) => {
      const ref = c.getAttribute("r") || "";
      const idx = ref ? colIndexFromRef(ref) : rowArr.length;
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        const isEl = c.getElementsByTagName("is")[0];
        value = isEl ? Array.from(isEl.getElementsByTagName("t")).map((t) => t.textContent).join("") : "";
      } else {
        const vEl = c.getElementsByTagName("v")[0];
        const raw = vEl ? vEl.textContent : "";
        value = type === "s" ? (sharedStrings[parseInt(raw, 10)] ?? "") : raw;
      }
      rowArr[idx] = value;
    });
    return rowArr;
  });
}
async function parseXLSXFile(file) {
  const buf = await file.arrayBuffer();
  const entries = readZipEntries(buf);
  const sharedStrings = parseSharedStrings(await readZipEntryText(buf, entries, "xl/sharedStrings.xml"));
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbookXML = await readZipEntryText(buf, entries, "xl/workbook.xml");
  const relsXML = await readZipEntryText(buf, entries, "xl/_rels/workbook.xml.rels");
  if (workbookXML && relsXML) {
    const rId = new DOMParser().parseFromString(workbookXML, "application/xml").getElementsByTagName("sheet")[0]?.getAttribute("r:id");
    const rel = rId && Array.from(new DOMParser().parseFromString(relsXML, "application/xml").getElementsByTagName("Relationship"))
      .find((r) => r.getAttribute("Id") === rId);
    if (rel) sheetPath = "xl/" + rel.getAttribute("Target").replace(/^\/?(xl\/)?/, "");
  }
  const sheetXML = await readZipEntryText(buf, entries, sheetPath);
  if (!sheetXML) throw new Error("Couldn't find a worksheet inside this file.");
  return rowsToObjects(parseWorksheetRows(sheetXML, sharedStrings));
}
async function parseImportFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCSVText(await file.text());
  if (name.endsWith(".xlsx")) return parseXLSXFile(file);
  throw new Error("Unsupported file type — please choose a .csv or .xlsx file.");
}
function buildTxnsFromImportRows(rows, cats, wallets) {
  const heads = [...cats.heads];
  const subcats = { ...cats.subcats };
  const findHead = (n) => heads.find((h) => h.name.toLowerCase() === n.toLowerCase());
  const findWallet = (n) => wallets.find((w) => w.name.toLowerCase() === n.toLowerCase());
  const findHeadOwningSubcat = (n) => {
    if (!n) return null;
    const lower = n.toLowerCase();
    return heads.find((h) => (subcats[h.name] || []).some((s) => s.toLowerCase() === lower)) || null;
  };
  const txns = [], errors = [], newHeads = [], newSubcats = [];
  let defaultedWallets = 0;

  rows.forEach((r, i) => {
    const line = i + 2;
    const dateRaw = String(r.Date ?? "").trim();
    const amountRaw = String(r.Amount ?? "").trim();
    if (!dateRaw || !amountRaw) { errors.push(`Row ${line}: missing date or amount.`); return; }

    let date = dateRaw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) { }
    else if (/^\d+(\.\d+)?$/.test(dateRaw)) date = excelSerialToISO(parseFloat(dateRaw));
    else { const d = new Date(dateRaw); if (!isNaN(d)) date = iso(d); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`Row ${line}: unrecognized date "${dateRaw}".`); return; }

    let amount = parseFloat(amountRaw.replace(/,/g, ""));
    if (!isFinite(amount) || amount === 0) { errors.push(`Row ${line}: invalid amount "${amountRaw}".`); return; }
    const typeRaw = String(r.Type ?? "").trim().toLowerCase();
    if (typeRaw === "expense") amount = -Math.abs(amount);
    else if (typeRaw === "income") amount = Math.abs(amount);

    const categoryRaw = String(r.Category ?? "").trim();
    const subRawInput = String(r.Subcategory ?? "").trim();

    let head = (categoryRaw && findHead(categoryRaw))
      || (categoryRaw && findHeadOwningSubcat(categoryRaw))
      || (subRawInput && findHead(subRawInput))
      || (subRawInput && findHeadOwningSubcat(subRawInput))
      || null;

    if (!head && categoryRaw) {
      head = { name: categoryRaw, color: SWATCHES[heads.length % SWATCHES.length], kind: amount >= 0 ? "income" : "expense" };
      heads.push(head);
      subcats[head.name] = [];
      newHeads.push(head.name);
    }
    const headName = head ? head.name : (amount >= 0 ? "Income" : "Miscellaneous");

    const subRaw = subRawInput || categoryRaw || headName;
    if (!subcats[headName]) subcats[headName] = [];
    if (!subcats[headName].some((s) => s.toLowerCase() === subRaw.toLowerCase())) {
      subcats[headName].push(subRaw);
      newSubcats.push(`${headName} → ${subRaw}`);
    }

    const walletRaw = String(r.Wallet ?? "").trim();
    let wallet = walletRaw ? findWallet(walletRaw) : wallets[0];
    if (!wallet) { wallet = wallets[0]; if (walletRaw) defaultedWallets++; }

    txns.push({ id: uid(), date, head: headName, cat: subRaw, note: String(r.Note ?? "").trim(), amount, walletId: wallet?.id || null, savingSpaceId: null });
  });

  return { txns, errors, newHeads, newSubcats, defaultedWallets, cats: { heads, subcats } };
}

function findMiscategorizedMerges(cats) {
  const { heads, subcats } = cats;
  const merges = [];
  heads.forEach((h) => {
    const owner = heads.find((other) => other.name !== h.name &&
      (subcats[other.name] || []).some((s) => s.toLowerCase() === h.name.toLowerCase()));
    if (owner) merges.push({ from: h.name, to: owner.name });
  });
  return merges.length ? merges : null;
}
function applyMiscategorizedMerges(merges, cats, txns, budgets) {
  const mergeMap = new Map(merges.map((m) => [m.from.toLowerCase(), m.to]));
  const heads = cats.heads.filter((h) => !mergeMap.has(h.name.toLowerCase()));
  const subcats = {};
  heads.forEach((h) => { subcats[h.name] = cats.subcats[h.name] || []; });

  const newTxns = txns.map((t) => {
    const to = mergeMap.get(t.head.toLowerCase());
    return to ? { ...t, head: to, cat: t.head } : t;
  });

  const seenBudgetHeads = new Set();
  const newBudgets = [];
  budgets.forEach((b) => { if (!mergeMap.has(b.head.toLowerCase())) { newBudgets.push(b); seenBudgetHeads.add(b.head); } });
  budgets.forEach((b) => {
    if (mergeMap.has(b.head.toLowerCase())) {
      const to = mergeMap.get(b.head.toLowerCase());
      if (!seenBudgetHeads.has(to)) { newBudgets.push({ ...b, head: to }); seenBudgetHeads.add(to); }
    }
  });

  return { cats: { heads, subcats }, txns: newTxns, budgets: newBudgets };
}

function prevPeriodChange(txns, scope, selector) {
  const range = scopeRange(scope);
  if (!range) return null;
  const [start, end] = range;
  const startD = new Date(start + "T00:00");
  const endD = new Date(end + "T00:00");
  const days = Math.round((endD - startD) / 86400000) + 1;
  if (!(days > 0)) return null;
  const prevEnd = new Date(startD); prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
  const prevStartISO = iso(prevStart), prevEndISO = iso(prevEnd);
  const cur = txns.filter((t) => t.date >= start && t.date <= end).reduce((s, t) => s + selector(t), 0);
  const prev = txns.filter((t) => t.date >= prevStartISO && t.date <= prevEndISO).reduce((s, t) => s + selector(t), 0);
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

const QUICK_PICKS = [
  ["all", "All Time"],
  ["year", "This Year"],
  ["month", "This Month"],
  ["week", "This Week"],
  ["today", "Today"],
];

function StatusBar({ scope, setScope, wallets, walletFilter, setWalletFilter }) {
  const [open, setOpen] = useState(false);
  const canStep = scope.mode === "year" || scope.mode === "month" || scope.mode === "week";

  const step = (dir) => {
    if (scope.mode === "year" && scope.year) {
      setScope({ ...scope, year: String(+scope.year + dir) });
    } else if (scope.mode === "month" && scope.month) {
      const [y, m] = scope.month.split("-").map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      setScope({ ...scope, month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
    } else if (scope.mode === "week" && scope.week) {
      const d = new Date(scope.week + "T00:00");
      d.setDate(d.getDate() + dir * 7);
      setScope({ ...scope, week: iso(d) });
    }
  };

  return (
    <div style={S.statusBar}>
      <button className="desktopOnly" disabled={!canStep} onClick={() => step(-1)} style={{ ...S.stepBtn, ...(canStep ? {} : S.stepBtnDisabled) }}>‹</button>
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ ...S.rangeTrigger, ...(open ? S.rangeTriggerActive : {}) }} className="rangeTriggerBtn">
          <IconCalendar /> <span className="rangeTriggerLabel">{scopeLabel(scope)}</span> <IconChevronDown />
        </button>
        {open && (
          <>
            <div style={S.popoverBackdrop} onClick={() => setOpen(false)} />
            <RangePopover scope={scope} setScope={setScope} onClose={() => setOpen(false)} />
          </>
        )}
      </div>
      <button className="desktopOnly" disabled={!canStep} onClick={() => step(1)} style={{ ...S.stepBtn, ...(canStep ? {} : S.stepBtnDisabled) }}>›</button>
      {wallets && (
        <FilterPicker value={walletFilter} placeholderLabel="All wallets" triggerIcon={<IconWallet />}
          triggerStyle={{ flex: "0 0 auto" }}
          options={[{ value: "all", label: "All wallets" }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]}
          onChange={setWalletFilter} />
      )}
    </div>
  );
}

function RangePopover({ scope, setScope, onClose }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [pendingFrom, setPendingFrom] = useState(scope.mode === "custom" ? scope.from : "");
  const [pendingTo, setPendingTo] = useState(scope.mode === "custom" ? scope.to : "");

  const pickDay = (dateStr) => {
    if (!pendingFrom || pendingTo) { setPendingFrom(dateStr); setPendingTo(""); }
    else if (dateStr < pendingFrom) { setPendingFrom(dateStr); }
    else { setPendingTo(dateStr); }
  };

  const quickPick = (mode) => {
    if (mode === "all") setScope(defaultScope());
    else if (mode === "year") setScope({ ...defaultScope(), mode: "year", year: String(today.getFullYear()) });
    else if (mode === "month") setScope({ ...defaultScope(), mode: "month", month: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}` });
    else if (mode === "week") setScope({ ...defaultScope(), mode: "week", week: iso(today) });
    else if (mode === "today") setScope({ ...defaultScope(), mode: "custom", from: iso(today), to: iso(today) });
    onClose();
  };

  const applyRange = () => {
    if (!pendingFrom) return;
    setScope({ ...defaultScope(), mode: "custom", from: pendingFrom, to: pendingTo || pendingFrom });
    onClose();
  };

  const shiftView = (dir) => {
    const d = new Date(viewYear, viewMonth + dir, 1);
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  };
  const rightMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const rightYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const leftLabel = new Date(viewYear, viewMonth, 1).toLocaleString("en", { month: "long", year: "numeric" });
  const rightLabel = new Date(rightYear, rightMonth, 1).toLocaleString("en", { month: "long", year: "numeric" });

  return (
    <div className="rangePopover" style={S.popover} onClick={(e) => e.stopPropagation()}>
      <div className="popoverCalendars" style={S.popoverCalendars}>
        <div style={S.popoverNav}>
          <button onClick={() => shiftView(-1)} style={S.stepBtn}>‹</button>
          <div className="popoverNavLabel" style={S.popoverNavLabel}>
            <span className="desktopOnly" style={{ display: "inline" }}>{leftLabel} – {rightLabel}</span>
            <span className="mobileOnly" style={{ display: "inline" }}>{leftLabel}</span>
          </div>
          <button onClick={() => shiftView(1)} style={S.stepBtn}>›</button>
        </div>
        <div className="calendarRow" style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <MonthGrid year={viewYear} month={viewMonth} pendingFrom={pendingFrom} pendingTo={pendingTo} onPick={pickDay} />
          <div className="desktopOnly">
            <MonthGrid year={rightYear} month={rightMonth} pendingFrom={pendingFrom} pendingTo={pendingTo} onPick={pickDay} />
          </div>
        </div>
        <div style={S.popoverHint}>
          {pendingFrom
            ? (pendingTo ? `${dateLabel(pendingFrom)} → ${dateLabel(pendingTo)}` : "Click a date to set end of custom range")
            : "Click a date to set start of custom range"}
        </div>
      </div>
      <div className="rangePopoverQuick" style={S.popoverQuick}>
        <div style={S.kicker2}>QUICK SELECT</div>
        {QUICK_PICKS.map(([mode, label]) => (
          <button key={mode} onClick={() => quickPick(mode)}
            style={{ ...S.quickPickBtn, ...(scope.mode === mode ? S.quickPickBtnActive : {}) }}>
            {label}
          </button>
        ))}
        <button onClick={applyRange} disabled={!pendingFrom}
          style={{ ...S.primaryBtn, marginTop: "auto", opacity: pendingFrom ? 1 : 0.4, cursor: pendingFrom ? "pointer" : "default" }}>
          Apply Range
        </button>
      </div>
    </div>
  );
}

function MonthGrid({ year, month, pendingFrom, pendingTo, onPick }) {
  const weeks = buildMonthGrid(year, month);
  const label = new Date(year, month, 1).toLocaleString("en", { month: "long", year: "numeric" });
  const todayStr = iso(new Date());
  return (
    <div>
      <div style={S.monthGridLabel}>{label}</div>
      <div className="monthGridRow" style={S.monthGridRow}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} style={S.monthGridDow}>{d}</span>)}</div>
      {weeks.map((week, wi) => (
        <div key={wi} className="monthGridRow" style={S.monthGridRow}>
          {week.map((d, di) => {
            if (!d) return <span key={di} className="monthGridCell" style={S.monthGridCell} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const inRange = pendingFrom && pendingTo && dateStr >= pendingFrom && dateStr <= pendingTo;
            const isEdge = dateStr === pendingFrom || dateStr === pendingTo;
            return (
              <button key={di} className="monthGridCell" onClick={() => onPick(dateStr)}
                style={{
                  ...S.monthGridCell, ...S.monthGridDay,
                  ...(isToday ? S.monthGridToday : {}),
                  ...(inRange ? S.monthGridInRange : {}),
                  ...(isEdge ? S.monthGridEdge : {}),
                }}>
                {d}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────  ICONS  ─────────────────────── */
function IconGridMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2.4" fill="currentColor" />
      <rect x="13" y="3" width="8" height="8" rx="2.4" fill="currentColor" />
      <rect x="3" y="13" width="8" height="8" rx="2.4" fill="currentColor" />
      <rect x="13" y="13" width="8" height="8" rx="2.4" fill="currentColor" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2.4" fill="currentColor" />
      <rect x="13" y="3" width="8" height="8" rx="2.4" fill="currentColor" opacity="0.45" />
      <rect x="3" y="13" width="8" height="8" rx="2.4" fill="currentColor" opacity="0.45" />
      <rect x="13" y="13" width="8" height="8" rx="2.4" fill="currentColor" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12v17l-2.5-1.5L13 20l-2.5-1.5L8 20l-2-1.5V3z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconCoin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M9.2 14.2c.4.9 1.4 1.5 2.8 1.5 1.7 0 2.8-.8 2.8-1.9 0-2.7-5.6-1.1-5.6-3.7 0-1.1 1.1-1.9 2.8-1.9 1.3 0 2.3.5 2.7 1.4M12 7.3v1.1M12 15.7v1" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconScale() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M7 21h10M5 7h6m2 0h4M5 7l-2.5 5a2.5 2.5 0 005 0L5 7zm14 0l-2.5 5a2.5 2.5 0 005 0L19 7z" />
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
function IconArrowDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
function IconGauge() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16a8 8 0 1116 0" />
      <path d="M12 16l3.5-4.5" />
    </svg>
  );
}
function IconPieChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12A9 9 0 1112 3v9h9z" />
    </svg>
  );
}
function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconTrend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16l5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  );
}
function IconSpark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v12M12 16l-4-4M12 16l4-4" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </svg>
  );
}
function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeOff() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a20.3 20.3 0 015.06-5.94M9.9 4.24A10.4 10.4 0 0112 4c7 0 11 7 11 7a20.5 20.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}
function IconGoogle() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.6 34.7 27 35.6 24 35.6c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.6 35.9 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

/* ───────────────────────  SIDEBAR & TOPBAR  ─────────────────────── */
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: IconDashboard },
  { key: "transactions", label: "Transactions", Icon: IconReceipt },
  { key: "statistics", label: "Statistics", Icon: IconPieChart },
  { key: "wallets", label: "Wallets", Icon: IconWallet },
  { key: "budgets", label: "Budgets", Icon: IconGauge },
  { key: "savings", label: "Saving spaces", Icon: IconTarget },
  { key: "forecast", label: "Forecast", Icon: IconTrend },
  { key: "vault", label: "Family vault", Icon: IconShield },
  { key: "intelligence", label: "Intelligence", Icon: IconSpark },
  { key: "advisor", label: "AI advisor", Icon: IconChat },
  { key: "settings", label: "Settings", Icon: IconGear },
];

function Sidebar({ tab, setTab, currency }) {
  const theme = useAppliedTheme();
  return (
    <aside className="sidebar" style={S.sidebar}>
      <div style={S.sidebarLogo}>
        <img src={theme === "dark" ? qyntLogoDark : qyntLogo} alt="QYNT" style={{ height: 34, width: "auto", display: "block" }} />
      </div>
      <nav className="sidebarNav" style={S.sidebarNav}>
        {NAV_ITEMS.map((it) => (
          <button key={it.key} className="navItem" onClick={() => setTab(it.key)}
            style={{ ...S.navItem, ...(tab === it.key ? S.navItemActive : {}) }}>
            <it.Icon /> <span className="navLabel">{it.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function NavHubButton({ open, onToggle }) {
  return (
    <button className="hubNavBtn" onClick={onToggle} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
      <span className="hubNavIconWrap">
        <span className={`hubNavIconLayer${open ? "" : " show"}`} aria-hidden="true"><IconGridMenu /></span>
        <span className={`hubNavIconLayer${open ? " show" : ""}`} aria-hidden="true"><IconX /></span>
      </span>
    </button>
  );
}

function Sheet({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheetBack" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheetHandle" />
        {children}
      </div>
    </div>
  );
}

function PickerField({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <label style={S.label}>{label}</label>
      <button type="button" onClick={() => setOpen(true)}
        style={{ ...S.input, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: "pointer", minHeight: 44 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.label : "Select…"}</span>
        <span style={{ color: T.mut2, flexShrink: 0, marginLeft: 8 }}><IconChevronDown /></span>
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div className="sectionTitleLg" style={{ textAlign: "center", marginBottom: 14 }}>{label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "50vh", overflowY: "auto" }}>
            {options.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 12px", minHeight: 44,
                  background: o.value === value ? T.mintSoft : "none", border: "none", borderRadius: 12, fontSize: 15,
                  fontWeight: o.value === value ? 700 : 500, color: T.text, textAlign: "left",
                }}>
                {o.label}
                {o.value === value && <span style={{ color: T.darkSoft }}><IconCheck /></span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

function FilterPicker({ value, options, onChange, placeholderLabel, disabled, triggerIcon, triggerStyle }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} style={{ ...S.filterPickerTrigger, ...triggerStyle, ...(disabled ? S.filterPickerTriggerDisabled : {}) }}>
        {triggerIcon}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current ? current.label : placeholderLabel}</span>
        <span style={{ color: T.mut2, flexShrink: 0 }}><IconChevronDown /></span>
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div className="sectionTitleLg" style={{ textAlign: "center", marginBottom: 14 }}>{placeholderLabel}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: "50vh", overflowY: "auto" }}>
            {options.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 12px", minHeight: 44,
                  background: o.value === value ? T.mintSoft : "none", border: "none", borderRadius: 12, fontSize: 15,
                  fontWeight: o.value === value ? 700 : 500, color: T.text, textAlign: "left",
                }}>
                {o.label}
                {o.value === value && <span style={{ color: T.darkSoft }}><IconCheck /></span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

const NAV_HUB_ITEMS = [
  { key: "dashboard", label: "Home", Icon: IconDashboard },
  { key: "add-expense", label: "Add Expense", Icon: IconArrowUp, isAction: true },
  { key: "add-income", label: "Add Income", Icon: IconArrowDown, isAction: true },
  { key: "transactions", label: "Transactions", Icon: IconReceipt },
  { key: "statistics", label: "Statistics", Icon: IconPieChart },
  { key: "wallets", label: "Wallets", Icon: IconWallet },
  { key: "budgets", label: "Budgets", Icon: IconGauge },
  { key: "savings", label: "Savings", Icon: IconTarget },
  { key: "forecast", label: "Forecast", Icon: IconTrend },
  { key: "vault", label: "Family vault", Icon: IconShield },
  { key: "intelligence", label: "Intelligence", Icon: IconSpark },
  { key: "advisor", label: "AI advisor", Icon: IconChat },
  { key: "settings", label: "Settings", Icon: IconGear },
];
function NavHub({ onClose, tab, goTab, onQuickAdd }) {
  const go = (fn) => { fn(); onClose(); };
  const actionHandlers = {
    "add-expense": () => onQuickAdd("expense"),
    "add-income": () => onQuickAdd("income"),
  };
  return (
    <Sheet onClose={onClose}>
      <div className="sectionTitleLg" style={{ textAlign: "center", marginBottom: 16 }}>Hub</div>
      <div className="hubGrid">
        {NAV_HUB_ITEMS.map((it) => {
          const active = !it.isAction && tab === it.key;
          return (
            <button key={it.key} className={`hubCard${active ? " active" : ""}`}
              onClick={() => go(it.isAction ? actionHandlers[it.key] : () => goTab(it.key))}>
              <span className="hubIcon" style={{ background: active ? T.dark : T.surface2, color: active ? "#fff" : T.text }}>
                <it.Icon />
              </span>
              {it.label}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

const PAGE_COPY = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  statistics: "Statistics",
  add: "Add transaction",
  settings: "Settings",
  wallets: "Wallets",
  budgets: "Budgets",
  savings: "Saving spaces",
  forecast: "Forecast",
  vault: "Family vault",
  intelligence: "Intelligence",
  advisor: "AI advisor",
  profile: "Profile",
};
const TODAY_LABEL = new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function Topbar({ tab, saveState, scope, setScope, wallets, walletFilter, setWalletFilter, search, onSearchChange, onLog, profile, onOpenSettings, onLogout }) {
  const theme = useAppliedTheme();
  const showControls = STATUS_BAR_TABS.has(tab);
  const fullName = (profile?.name || "").trim();
  const initials = (fullName || "Y").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="appTopbar" style={S.topbar}>
      <div className="mobileOnly" style={S.topbarBrandRow}>
        <img src={theme === "dark" ? qyntLogoDark : qyntLogo} alt="QYNT" style={{ height: 22, width: "auto", display: "block" }} />
      </div>
      <div className="topbarTitleRow" style={S.topbarTitleRow}>
        <div>
          <div style={S.pageTitle}>{PAGE_COPY[tab]}</div>
          <div style={S.pageSub}>{TODAY_LABEL}</div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button onClick={() => setMenuOpen((o) => !o)} title="Account" style={S.accountTrigger}>
            {fullName && <span style={S.accountName}>{fullName}</span>}
            <span style={{ ...S.avatar, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {profile?.avatar ? (
                <img src={profile.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ width: "100%", height: "100%", background: profile?.color || T.mint, display: "flex", alignItems: "center", justifyContent: "center", color: T.dark, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700 }}>
                  {initials}
                </span>
              )}
            </span>
          </button>
          {menuOpen && (
            <>
              <div style={S.popoverBackdrop} onClick={() => setMenuOpen(false)} />
              <div style={S.avatarMenu} onClick={(e) => e.stopPropagation()}>
                <button className="avatarMenuItem" style={S.avatarMenuItem} onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
                  <IconGear /> Settings
                </button>
                <button className="avatarMenuItem" style={{ ...S.avatarMenuItem, color: T.rose }} onClick={() => { setMenuOpen(false); onLogout(); }}>
                  <IconLogout /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={S.topbarControls}>
        {showControls && (
          <>
            <StatusBar scope={scope} setScope={setScope} wallets={wallets} walletFilter={walletFilter} setWalletFilter={setWalletFilter} />

            <div className="desktopOnly">
              {searchOpen ? (
                <div style={S.searchWrap}>
                  <IconSearch />
                  <input className="field" autoFocus placeholder="Search transactions…"
                    value={search} onChange={(e) => onSearchChange(e.target.value)}
                    onBlur={() => { if (!search) setSearchOpen(false); }} style={S.searchInput} />
                </div>
              ) : (
                <button aria-label="Search transactions" onClick={() => setSearchOpen(true)} style={S.iconTrigger}>
                  <IconSearch />
                </button>
              )}
            </div>

            <button className="primaryBtn desktopOnly" onClick={onLog} style={S.logBtn}><IconPlus /> Log</button>
          </>
        )}

        {saveState && (
          <div style={{ ...S.savePill, ...(saveState === "error" ? S.savePillError : {}) }}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "⚠ Couldn't save"}
          </div>
        )}
      </div>
    </header>
  );
}

const STATUS_BAR_TABS = new Set(["dashboard", "transactions", "statistics"]);

/* ───────────────────────  AUTH  ─────────────────────── */
function AuthScreen() {
  const theme = useAppliedTheme();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setErr(""); setInfo(""); };

  const forgotPassword = async () => {
    setErr(""); setInfo("");
    if (!email) { setErr("Enter your email above first, then click \"Forgot password?\"."); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) setErr(error.message);
    else setInfo("Check your email for a link to reset your password.");
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() } } });
      if (error) setErr(error.message);
      else setInfo("Account created — check your email to confirm it, then log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };

  const submitGoogle = async () => {
    setErr(""); setInfo(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <form onSubmit={submit} style={{ ...S.formCard, width: 340 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img src={theme === "dark" ? qyntLogoDark : qyntLogo} alt="QYNT" style={{ height: 32, width: "auto" }} />
        </div>
        <div style={S.segment}>
          <button type="button" onClick={() => switchMode("login")} style={{ ...S.segBtn, flex: 1, ...(mode === "login" ? S.segBtnActive : {}) }}>Log in</button>
          <button type="button" onClick={() => switchMode("signup")} style={{ ...S.segBtn, flex: 1, ...(mode === "signup" ? S.segBtnActive : {}) }}>Sign up</button>
        </div>

        {mode === "signup" && (
          <>
            <label style={S.label}>Name</label>
            <input className="field" required autoComplete="name" value={name}
              onChange={(e) => setName(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />
          </>
        )}

        <label style={S.label}>Email</label>
        <input className="field" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} style={{ ...S.input, width: "100%" }} />

        <label style={S.label}>Password</label>
        <div style={{ position: "relative" }}>
          <input className="field" type={showPassword ? "text" : "password"} required minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ ...S.input, width: "100%", boxSizing: "border-box", paddingRight: 40 }} />
          <button type="button" onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={S.passwordToggle}>
            {showPassword ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>

        {mode === "login" && (
          <button type="button" className="linkBtn" onClick={forgotPassword}
            style={{ ...S.linkBtn, padding: 0, marginTop: 6, alignSelf: "flex-start" }}>
            Forgot password?
          </button>
        )}

        {err && <div style={{ color: T.rose, fontSize: 12, marginTop: 8 }}>{err}</div>}
        {info && <div style={{ color: T.darkSoft, fontSize: 12, marginTop: 8 }}>{info}</div>}

        <button type="submit" disabled={busy} className="primaryBtn" style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: T.line }} />
          <span style={{ fontSize: 11.5, color: T.mut2 }}>OR</span>
          <div style={{ flex: 1, height: 1, background: T.line }} />
        </div>

        <button type="button" disabled={busy} onClick={submitGoogle} style={S.googleBtn}>
          <IconGoogle /> {mode === "signup" ? "Sign up with Google" : "Continue with Google"}
        </button>
      </form>
    </div>
  );
}

/* ───────────────────────  ONBOARDING SURVEY  ─────────────────────── */
const ONBOARDING_EXAMPLE_TAGS = ["Core Operations", "Technical Infra", "Self-Care", "Family Legacy"];

function OnboardingHero({ kicker, title, blurb, bullets, cta, onNext, step, of }) {
  return (
    <div style={{ ...S.formCard, width: 420, background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`, color: "#EAF7EE", border: "none" }}>
      {kicker && <div style={{ fontSize: 11, letterSpacing: 2.2, color: "#9FCBAE", fontWeight: 600, marginBottom: 6 }}>{kicker}</div>}
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {blurb && <div style={{ fontSize: 13.5, color: "#CFE9D6", lineHeight: 1.5, marginBottom: 16 }}>{blurb}</div>}
      {bullets && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
          {bullets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13.5, color: "#EAF7EE" }}>
              <span style={{ color: T.mint, marginTop: 1 }}>◆</span>
              {typeof b === "string" ? <span>{b}</span> : (
                <div><div style={{ fontWeight: 700 }}>{b.title}</div>{b.sub && <div style={{ color: "#9FCBAE", fontSize: 12.5, marginTop: 2 }}>{b.sub}</div>}</div>
              )}
            </div>
          ))}
        </div>
      )}
      <button onClick={onNext} style={{ ...S.primaryBtn, background: T.mint, color: T.dark, marginTop: 0 }}>{cta} →</button>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 18 }}>
        {Array.from({ length: of }).map((_, i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i === step - 1 ? T.mint : "rgba(255,255,255,0.25)" }} />
        ))}
      </div>
    </div>
  );
}

function OnboardingFlow({ profile, persistProfile, cats, persistCats, wallets, addTxn, onDone }) {
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState(profile.currency || "PKR");
  const [currencySearch, setCurrencySearch] = useState("");
  const [exampleTags, setExampleTags] = useState(ONBOARDING_EXAMPLE_TAGS);
  const [customTags, setCustomTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [evtNote, setEvtNote] = useState("");
  const [evtType, setEvtType] = useState("expense");
  const [evtAmount, setEvtAmount] = useState("");
  const [evtTag, setEvtTag] = useState("");

  const next = () => setStep((s) => s + 1);

  const filteredCurrencies = CURRENCY_OPTIONS.filter((c) =>
    !currencySearch || c.toLowerCase().includes(currencySearch.toLowerCase()) || CURRENCY_NAMES[c].toLowerCase().includes(currencySearch.toLowerCase()));

  const addCustomTag = () => {
    const v = newTag.trim();
    if (!v || customTags.includes(v) || cats.heads.some((h) => h.name.toLowerCase() === v.toLowerCase())) return;
    setCustomTags((t) => [...t, v]);
    setNewTag("");
  };
  const removeCustomTag = (v) => setCustomTags((t) => t.filter((x) => x !== v));

  const deployLedger = async () => {
    if (customTags.length > 0) {
      const newHeads = customTags.map((name, i) => ({ name, color: SWATCHES[(cats.heads.length + i) % SWATCHES.length], kind: "expense" }));
      const nextSubcats = { ...cats.subcats };
      customTags.forEach((name) => { nextSubcats[name] = []; });
      await persistCats({ heads: [...cats.heads, ...newHeads], subcats: nextSubcats });
    }
    next();
  };

  const allTagOptions = [...exampleTags, ...customTags.filter((t) => !exampleTags.includes(t)), ...cats.heads.map((h) => h.name)]
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const commitEvent = async () => {
    const val = parseFloat(evtAmount);
    if (!val || val <= 0) return;
    const tag = evtTag || allTagOptions[0] || "Miscellaneous";
    let workingCats = cats;
    if (!cats.heads.some((h) => h.name === tag)) {
      workingCats = { heads: [...cats.heads, { name: tag, color: SWATCHES[cats.heads.length % SWATCHES.length], kind: "expense" }], subcats: { ...cats.subcats, [tag]: [] } };
      await persistCats(workingCats);
    }
    addTxn({
      id: uid(), date: iso(new Date()), head: tag, cat: tag,
      note: evtNote.trim(), amount: evtType === "expense" ? -val : val,
      walletId: wallets[0]?.id || "", savingSpaceId: null,
    });
    onDone();
  };

  if (step === 1) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <OnboardingHero step={1} of={7} title="QYNT" cta="Create account" onNext={next}
          bullets={[
            { title: "Autonomous Engine", sub: "Live statistics and predictive metrics forecasting upcoming lifestyle costs far into the future." },
            { title: "Family Wealth Architecture", sub: "Private, secure vaults engineered to protect and optimize long-term family assets." },
            { title: "Cross-Border Intelligence", sub: "Unified statistical view managing your shifting capital pool seamlessly across AED, PKR, and SAR." },
          ]} />
      </div>
    );
  }
  if (step === 2) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <OnboardingHero step={2} of={7} kicker="VALUE PROP · INTELLIGENCE" title="Predictive Intelligence" cta="Get started" onNext={next}
          blurb="Forward-looking logic that visualizes your capital 30 days into the future. Stop tracking what's gone; engineer what's next."
          bullets={["Autonomous Cash Flow Forecasting", "Real-Time Safe-to-Spend Radar", "Live Mid-Market Currency Synchronization"]} />
      </div>
    );
  }
  if (step === 3) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <OnboardingHero step={3} of={7} kicker="VALUE PROP · ECOSYSTEM" title="Unified Family Vaults" cta="Next" onNext={next}
          blurb="Pool resources with your partner while maintaining absolute strategic privacy. Everyone aligns on big milestones without the friction."
          bullets={["Instant Vault Synchronization", "Shared Cross-Border Goals", "Granular Access Architecture"]} />
      </div>
    );
  }
  if (step === 4) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.formCard, width: 420 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.mut2, fontWeight: 700, marginBottom: 4 }}>STEP 1 OF 2</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Welcome to QYNT</div>
          <div style={{ fontSize: 13, color: T.mut, marginBottom: 18 }}>Initialize your financial stack in two precise steps.</div>
          <label style={S.label}>Select Primary Denomination</label>
          <div style={{ fontSize: 12, color: T.mut2, marginBottom: 10 }}>
            Choose the base currency for your master system view. All cross-border inflows will auto-convert to this metric using live mid-market rates.
          </div>
          <input className="field" placeholder="Search currency code… (e.g., AED, SAR, PKR)" value={currencySearch}
            onChange={(e) => setCurrencySearch(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box", marginBottom: 10 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto", marginBottom: 18 }}>
            {filteredCurrencies.map((c) => (
              <button key={c} onClick={() => setCurrency(c)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10,
                background: currency === c ? T.mintSoft : "none", border: "none", cursor: "pointer", textAlign: "left",
              }}>
                <span style={{ fontSize: 13.5, fontWeight: currency === c ? 700 : 500, color: T.text }}>{c} <span style={{ color: T.mut2, fontWeight: 400 }}>{CURRENCY_NAMES[c]}</span></span>
                {currency === c && <span style={{ color: T.darkSoft }}><IconCheck /></span>}
              </button>
            ))}
          </div>
          <button className="primaryBtn" style={S.primaryBtn} onClick={async () => { await persistProfile({ ...profile, currency }); next(); }}>Initialize System</button>
        </div>
      </div>
    );
  }
  if (step === 5) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.formCard, width: 420 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: T.mut2, fontWeight: 700, marginBottom: 4 }}>STEP 2 OF 2</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Architect Your Ledger</div>
          <div style={{ fontSize: 13, color: T.mut, marginBottom: 6 }}>
            Categorize your active cash flows to power the AI forecasting engine. We have pre-configured core operational tracks for you.
          </div>
          <div style={{ fontSize: 12, color: T.mut2, marginBottom: 16, fontStyle: "italic" }}>
            Examples: Core Operations, Technical Infrastructure, Self-Care, Family Legacy
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {exampleTags.map((t) => (
              <span key={t} style={{ ...S.chip, ...S.chipActive, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {t}
                <button onClick={() => setExampleTags((tags) => tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}><IconX /></button>
              </span>
            ))}
            {customTags.map((t) => (
              <span key={t} style={{ ...S.chip, ...S.chipActive, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {t}
                <button onClick={() => removeCustomTag(t)} aria-label={`Remove ${t}`}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}><IconX /></button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input className="field" placeholder="Define a custom tag track…" value={newTag}
              onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomTag())}
              style={{ ...S.input, flex: 1, boxSizing: "border-box" }} />
            <button onClick={addCustomTag} aria-label="Add tag" style={{ ...S.iconTrigger, background: T.dark, color: "#fff", border: "none" }}><IconPlus /></button>
          </div>
          <button className="primaryBtn" style={S.primaryBtn} onClick={deployLedger}>Deploy Ledger Config</button>
        </div>
      </div>
    );
  }
  if (step === 6) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...S.formCard, width: 440 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>System Primed</div>
          <div style={{ fontSize: 13, color: T.mut, marginBottom: 18 }}>
            To calibrate your Safe-to-Spend Radar, log your first active cash flow event.
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>What qualifies as a system event?</div>
          <div style={{ fontSize: 12.5, color: T.mut, marginBottom: 18, lineHeight: 1.5 }}>
            Any internal or external transaction that shifts your liquidity pool — a retainer invoice received, space overhead paid, or a wellness entry logged. Simply name it, input the amount, and assign a tracking tag.
          </div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.mut2, fontWeight: 700, marginBottom: 8 }}>SYSTEM PREVIEW</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {[
              ["Vercel Infrastructure Inflow", "+1,250 SAR", T.darkSoft],
              ["Core Space Overhead", "−750.00 AED", T.rose],
              ["Self-Care Treatment", "−485.00 AED", T.rose],
              ["Daily Workspace Cafe", "−32.50 AED", T.rose],
            ].map(([label, amt, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: T.mut }}>{label}</span>
                <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{amt}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>Instant Calibration</div>
          <div style={{ fontSize: 12.5, color: T.mut, marginBottom: 20, lineHeight: 1.5 }}>
            Every logged metric updates your predictive dashboard immediately, adjusting your 30-day runway and net asset vectors.
          </div>
          <button className="primaryBtn" style={S.primaryBtn} onClick={next}>Begin Event Logging →</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...S.formCard, width: 420 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Initialize First Event</div>
        <div style={{ fontSize: 13, color: T.mut, marginBottom: 18 }}>
          Log an active transaction to instantly populate your predictive cash flow workspace.
        </div>
        <label style={S.label}>Event descriptor</label>
        <input className="field" placeholder="e.g., Client Retainer, Technical Tooling, Workspace Session…" value={evtNote}
          onChange={(e) => setEvtNote(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />

        <label style={S.label}>Transaction vector</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
          <div style={S.segment}>
            <button onClick={() => setEvtType("expense")} style={{ ...S.segBtn, ...(evtType === "expense" ? { ...S.segBtnActive, background: T.roseSoft, color: T.rose } : {}) }}>↗ Outflow (Spent)</button>
            <button onClick={() => setEvtType("income")} style={{ ...S.segBtn, ...(evtType === "income" ? { ...S.segBtnActive, background: T.mintSoft, color: T.darkSoft } : {}) }}>↙ Inflow (Earned)</button>
          </div>
          <input className="field" type="number" inputMode="decimal" placeholder="0.00" value={evtAmount}
            onChange={(e) => setEvtAmount(e.target.value)} style={{ ...S.input, width: 100, boxSizing: "border-box", fontFamily: FONT_DISPLAY, fontWeight: 700 }} />
        </div>

        <label style={{ ...S.label, marginTop: 14 }}>Assign aggregation tag</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {allTagOptions.map((t) => (
            <Chip key={t} active={evtTag === t} onClick={() => setEvtTag(t)}>{t}</Chip>
          ))}
        </div>

        <button className="primaryBtn" style={S.primaryBtn} onClick={commitEvent} disabled={!evtAmount || parseFloat(evtAmount) <= 0}>
          + Commit Event to Ledger
        </button>
        {(!evtAmount || parseFloat(evtAmount) <= 0) && (
          <div style={{ fontSize: 11.5, color: T.mut2, marginTop: 8, textAlign: "center" }}>Add at least one transaction token to view active dashboard simulation.</div>
        )}
        <button className="linkBtn" style={{ ...S.linkBtn, display: "block", margin: "10px auto 0" }} onClick={onDone}>Skip Initialization</button>
      </div>
    </div>
  );
}
/* ───────────────────────  APP  ─────────────────────── */
export default function ExpenseTracker() {
  const [session, setSession] = useState(undefined);
  const [txns, setTxns] = useState(null);
  const [cats, setCats] = useState(null);
  const [wallets, setWallets] = useState(null);
  const [budgets, setBudgets] = useState(null);
  const [savings, setSavings] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);
  const [onboarded, setOnboarded] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [settingsTab, setSettingsTab] = useState("profile");
  const [scope, setScope] = useState(defaultScope());
  const [walletFilter, setWalletFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [txnFilter, setTxnFilter] = useState(null);
  const [hubOpen, setHubOpen] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [editing, setEditing] = useState(null);
  const [addPreset, setAddPreset] = useState(null);
  const [returnTab, setReturnTab] = useState("dashboard");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    window.history.replaceState({ tab: "dashboard" }, "");
    const onPopState = (e) => {
      const k = e.state?.tab || "dashboard";
      setTab(k);
      if (k !== "add") setAddPreset(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!session) {
      setTxns(null); setCats(null); setWallets(null); setBudgets(null);
      setSavings(null); setProfile(null); setDailyLimit(null); setOnboarded(null);
      return;
    }
    (async () => {
      const uid_ = session.user.id;
      const meta = session.user.user_metadata || {};
      const metaName = meta.name || meta.full_name || "";
      const keys = [
        [WALLET_KEY, DEFAULT_WALLETS],
        [BUDGET_KEY, []],
        [SAVING_KEY, []],
        [PROFILE_KEY, { ...DEFAULT_PROFILE, name: metaName || DEFAULT_PROFILE.name, email: session.user.email || "" }],
        [DAILY_LIMIT_KEY, 0],
        [TXN_KEY, []],
        [CAT_KEY, DEFAULT_CATS],
        [ONBOARDED_KEY, false],
      ];
      let all;
      try {
        all = await loadAllData(uid_, keys);
      } catch {
        await new Promise((r) => setTimeout(r, 1200));
        try { all = await loadAllData(uid_, keys); }
        catch (e2) { console.error("Failed to load account data after retry:", e2); return; }
      }
      const loadedProfile = all[PROFILE_KEY];
      const migratedName = loadedProfile.name || `${loadedProfile.firstName || ""} ${loadedProfile.lastName || ""}`.trim() || undefined;
      setWallets(all[WALLET_KEY]);
      setBudgets(all[BUDGET_KEY]);
      setSavings(all[SAVING_KEY]);
      setProfile({ ...DEFAULT_PROFILE, ...loadedProfile, ...(migratedName ? { name: migratedName } : {}) });
      setDailyLimit(all[DAILY_LIMIT_KEY]);
      setTxns(all[TXN_KEY]);
      setCats(all[CAT_KEY]);
      setOnboarded(all[ONBOARDED_KEY]);
    })();
  }, [session]);

  useEffect(() => {
    if (wallets && walletFilter !== "all" && !wallets.some((w) => w.id === walletFilter)) {
      setWalletFilter("all");
    }
  }, [wallets, walletFilter]);

  useEffect(() => {
    const mode = profile?.theme || "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && media.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    apply();
    if (mode === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [profile?.theme]);

  const flash = (state) => {
    setSaveState(state);
    if (state === "saved") setTimeout(() => setSaveState(""), 1500);
  };
  const persistTxns = async (next) => {
    setTxns(next); flash("saving");
    try { await saveKey(session.user.id, TXN_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistCats = async (next) => {
    setCats(next); flash("saving");
    try { await saveKey(session.user.id, CAT_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistWallets = async (next) => {
    setWallets(next); flash("saving");
    try { await saveKey(session.user.id, WALLET_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistBudgets = async (next) => {
    setBudgets(next); flash("saving");
    try { await saveKey(session.user.id, BUDGET_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistSavings = async (next) => {
    setSavings(next); flash("saving");
    try { await saveKey(session.user.id, SAVING_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistProfile = async (next) => {
    setProfile(next); flash("saving");
    try { await saveKey(session.user.id, PROFILE_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const persistDailyLimit = async (next) => {
    setDailyLimit(next); flash("saving");
    try { await saveKey(session.user.id, DAILY_LIMIT_KEY, next); flash("saved"); }
    catch { flash("error"); }
  };
  const completeOnboarding = async () => {
    setOnboarded(true);
    try { await saveKey(session.user.id, ONBOARDED_KEY, true); } catch { }
  };
  const deleteBudgetById = (id) => { persistBudgets(budgets.filter((b) => b.id !== id)); return null; };
  const deleteSavingById = (id) => {
    const usedCount = txns.filter((t) => t.savingSpaceId === id).length;
    if (usedCount > 0) return `This saving space is used by ${usedCount} transaction(s) — reassign them first.`;
    persistSavings(savings.filter((s) => s.id !== id));
    return null;
  };

  const addTxn = (t) => persistTxns([...txns, t].sort((a, b) => a.date.localeCompare(b.date)));
  const updateTxn = (t) => persistTxns(txns.map((x) => (x.id === t.id ? t : x)).sort((a, b) => a.date.localeCompare(b.date)));
  const deleteTxn = (id) => persistTxns(txns.filter((t) => t.id !== id));

  const catColor = (head) => cats?.heads.find((h) => h.name === head)?.color || T.mut;

  const goTab = (k) => {
    setTab(k);
    if (k !== "add") setAddPreset(null);
    if (k !== tab) window.history.pushState({ tab: k }, "");
  };
  const openAdd = (preset) => { setReturnTab(tab); setAddPreset(preset); goTab("add"); };
  const handleSearchChange = (v) => { setSearch(v); if (v && tab !== "transactions") goTab("transactions"); };
  const openProfileSettings = () => { setSettingsTab("profile"); goTab("settings"); };
  const viewSubcategoryTxns = (head, sub) => { setTxnFilter({ head, sub }); goTab("transactions"); };
  const viewTypeTxns = (type) => { setTxnFilter({ type }); goTab("transactions"); };

  const resetAllData = async () => {
    await supabase.from("app_data").delete().eq("user_id", session.user.id);
    await supabase.auth.signOut();
  };

  if (session === undefined) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{CSS}</style>
        <div style={{ color: T.mut, fontFamily: FONT_BODY, letterSpacing: 2, fontSize: 13 }}>LOADING…</div>
      </div>
    );
  }

  if (session === null) {
    return <AuthScreen />;
  }

  if (!txns || !cats || !wallets || !budgets || !savings || !profile || dailyLimit == null || onboarded == null) {
    return (
      <div style={S.page}>
        <style>{CSS}</style>
        <SkeletonDashboard />
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div style={S.page}>
        <style>{CSS}</style>
        <OnboardingFlow
          profile={profile} persistProfile={persistProfile}
          cats={cats} persistCats={persistCats}
          wallets={wallets} addTxn={addTxn}
          onDone={completeOnboarding}
        />
      </div>
    );
  }

  const filteredTxns = walletFilter === "all" ? txns : txns.filter((t) => t.walletId === walletFilter);
  const filteredWallets = walletFilter === "all" ? wallets : wallets.filter((w) => w.id === walletFilter);

  return (
    <div className="appShell" style={S.page}>
      <style>{CSS}</style>
      <Sidebar tab={tab} setTab={goTab} currency={profile.currency} />
      <div className="mobileMain" style={{ flex: 1, minWidth: 0 }}>
        <Topbar tab={tab} saveState={saveState} scope={scope} setScope={setScope}
          wallets={wallets} walletFilter={walletFilter} setWalletFilter={setWalletFilter}
          search={search} onSearchChange={handleSearchChange} onLog={() => openAdd(null)}
          profile={profile} onOpenSettings={openProfileSettings} onLogout={() => supabase.auth.signOut()} />

        {tab === "dashboard" && (
          <Dashboard txns={filteredTxns} catColor={catColor} cats={cats} setTab={goTab} onQuickAdd={openAdd} scope={scope}
            savings={savings} dailyLimit={dailyLimit} budgets={budgets} currency={profile.currency} wallets={filteredWallets}
            setSettingsTab={setSettingsTab} onViewSubcategory={viewSubcategoryTxns} onViewType={viewTypeTxns} name={profile.name} />
        )}
        {tab === "transactions" && (
          <Transactions txns={filteredTxns} cats={cats} catColor={catColor} onEdit={setEditing} onDelete={deleteTxn} scope={scope}
            search={search} setSearch={setSearch} currency={profile.currency}
            presetFilter={txnFilter} onConsumePresetFilter={() => setTxnFilter(null)}
            onQuickAdd={openAdd} />
        )}
        {tab === "statistics" && (
          <Statistics txns={filteredTxns} cats={cats} scope={scope} currency={profile.currency} budgets={budgets} wallets={filteredWallets} onViewSubcategory={viewSubcategoryTxns} />
        )}
        {tab === "add" && (
          <Modal onClose={() => goTab(returnTab)}>
            <TxnForm cats={cats} presetType={addPreset} wallets={wallets} savings={savings} currency={profile.currency} embedded
              onSave={(t) => { addTxn(t); goTab(returnTab); }} />
          </Modal>
        )}
        {tab === "settings" && (
          <Settings cats={cats} txns={txns} persistCats={persistCats} persistTxns={persistTxns} catColor={catColor}
            wallets={wallets} budgets={budgets} savings={savings}
            persistWallets={persistWallets} persistBudgets={persistBudgets} persistSavings={persistSavings}
            dailyLimit={dailyLimit} persistDailyLimit={persistDailyLimit}
            profile={profile} persistProfile={persistProfile}
            settingsTab={settingsTab} setSettingsTab={setSettingsTab}
            onLogout={() => supabase.auth.signOut()} onResetData={resetAllData} />
        )}
        {tab === "wallets" && <Wallets txns={txns} wallets={wallets} scope={scope} currency={profile.currency}
          onAddWallet={() => { setSettingsTab("wallets"); goTab("settings"); }} />}
        {tab === "budgets" && <Budgets txns={txns} budgets={budgets} catColor={catColor} currency={profile.currency}
          onEditBudget={() => { setSettingsTab("budgets"); goTab("settings"); }} onDeleteBudget={deleteBudgetById} />}
        {tab === "savings" && <SavingSpaces txns={txns} savings={savings} currency={profile.currency}
          onAddGoal={() => { setSettingsTab("savings"); goTab("settings"); }}
          onEditSaving={() => { setSettingsTab("savings"); goTab("settings"); }} onDeleteSaving={deleteSavingById} />}
        {tab === "forecast" && <Forecast txns={txns} currency={profile.currency} />}
        {tab === "vault" && (
          <ComingSoon title="Family vault" blurb="Shared budgets, goals, and visibility for everyone in your household." />
        )}
        {tab === "intelligence" && (
          <ComingSoon title="Intelligence" blurb="Automatic insights into your spending patterns and anomalies." />
        )}
       {tab === "advisor" && (
  <AIAdvisor
    txns={filteredTxns}
    budgets={budgets}
    currency={profile.currency}
    scope={scope}
  />
)}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <TxnForm cats={cats} initial={editing} wallets={wallets} savings={savings} currency={profile.currency} embedded
            onSave={(t) => { updateTxn(t); setEditing(null); }}
            onDelete={() => { deleteTxn(editing.id); setEditing(null); }} />
        </Modal>
      )}

      <NavHubButton open={hubOpen} onToggle={() => setHubOpen((o) => !o)} />
      {hubOpen && (
        <NavHub onClose={() => setHubOpen(false)} tab={tab} goTab={goTab} onQuickAdd={openAdd} />
      )}
    </div>
  );
}

/* ───────────────────────  DASHBOARD  ─────────────────────── */
function Dashboard({ txns, catColor, cats, setTab, onQuickAdd, scope, savings, dailyLimit, budgets, currency, wallets, setSettingsTab, onViewSubcategory, onViewType, name }) {
  const openSettings = (subTab) => { setSettingsTab(subTab); setTab("settings"); };
  const scopedTxns = txns.filter((t) => inScope(t.date, scope));
  const income = scopedTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = scopedTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = income + expense;
  const spentPct = income > 0 ? Math.min(100, (-expense / income) * 100) : 100;
  const walletBalance = (wallets || []).reduce((sum, w) =>
    sum + w.startingBalance + txns.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amount, 0), 0);

  const incomeChange = prevPeriodChange(txns, scope, (t) => (t.amount > 0 ? t.amount : 0));
  const expenseChangeRaw = prevPeriodChange(txns, scope, (t) => (t.amount < 0 ? -t.amount : 0));
  const expenseChange = expenseChangeRaw == null ? null : -expenseChangeRaw;
  const netChange = prevPeriodChange(txns, scope, (t) => t.amount);

  const recentTx = [...scopedTxns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <main style={S.main}>
      <div className="mobileOnly pageTitleLg" style={{ color: T.text, marginBottom: 16, fontSize: "clamp(17px, 5.4vw, 24px)" }}>
        Welcome back,<br />{name || "there"} 👋
      </div>
      <div className="desktopOnly" style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 18 }}>
        Welcome back, {name || "there"} 👋
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <section className="heroSection" style={S.hero}>
          <div style={S.kicker}>NET FLOW · {scopeLabel(scope).toUpperCase()}</div>
          <div style={{ ...S.heroNumber, color: net >= 0 ? "#fff" : "#FFB3C0" }}>
            {net >= 0 ? "+" : "−"}{fm(Math.abs(net))}<span style={S.heroCur}> {currency}</span>
          </div>
          <div style={S.flowBarWrap}><div style={{ ...S.flowBar, width: `${spentPct}%` }} /></div>
          <div style={S.flowLegend}>
            <span><i style={{ ...S.dot, background: "#FFB3C0" }} />Spent {money(-expense, currency)}</span>
            <span><i style={{ ...S.dot, background: T.gold }} />Earned {money(income, currency)}</span>
            <span style={{ color: "#9FCBAE" }}>{income > 0 ? `${spentPct.toFixed(0)}% of income spent` : ""}</span>
          </div>
          <div className="heroMiniRow" style={S.heroMiniRow}>
            <MiniCard label="Income" value={money(income, currency)} color={T.gold} onClick={() => onViewType("income")} />
            <MiniCard label="Expenses" value={money(-expense, currency)} color="#FFB3C0" onClick={() => onViewType("expense")} />
            <MiniCard label={<><span className="desktopOnly">Transactions</span><span className="mobileOnly">Txns</span></>} value={scopedTxns.length} color="#CFE9D6" onClick={() => onViewType("all")} />
          </div>
        </section>

        <section className="quickActionsSection" style={S.quickActions}>
          <div style={S.quickTitle}>Quick actions</div>
          <div style={S.quickGrid}>
            <button className="quickBtn" style={S.quickBtn} onClick={() => onQuickAdd("expense")}>
              <span style={{ ...S.quickIcon, background: T.roseSoft, color: T.rose }}><IconPlus /></span>
              Add expense
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => onQuickAdd("income")}>
              <span style={{ ...S.quickIcon, background: T.mintSoft, color: T.darkSoft }}><IconPlus /></span>
              Add income
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => setTab("transactions")}>
              <span style={{ ...S.quickIcon, background: T.goldSoft, color: T.gold }}><IconReceipt /></span>
              Transactions
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => setTab("settings")}>
              <span style={{ ...S.quickIcon, background: T.surface2, color: T.mut }}><IconGear /></span>
              Settings
            </button>
          </div>
        </section>
      </div>

      <div className="statRow" style={S.statRow}>
        <StatCard label="Current Wallet Balance" value={money(walletBalance, currency)} valueColor={walletBalance >= 0 ? T.darkSoft : T.rose} iconBg={T.mintSoft} iconColor={T.darkSoft} icon={IconWallet} />
        <StatCard label="Total Period Change" value={money(net, currency)} valueColor={net >= 0 ? T.darkSoft : T.rose} change={netChange} iconBg={T.goldSoft} iconColor={T.gold} icon={IconScale} />
        <StatCard label="Total Period Expenses" value={money(-expense, currency)} change={expenseChange} iconBg={T.roseSoft} iconColor={T.rose} icon={IconArrowUp} />
        <StatCard label="Total Period Income" value={money(income, currency)} change={incomeChange} iconBg={T.mintSoft} iconColor={T.darkSoft} icon={IconArrowDown} />
      </div>

      <div className="dashGrid" style={{ marginBottom: 20 }}>
        <CashflowCard txns={scopedTxns} currency={currency} scope={scope} />
        <StatisticCard scopedTxns={scopedTxns} cats={cats} income={income} expense={expense} currency={currency}
          onViewSubcategory={onViewSubcategory} limit={5} onViewMore={() => setTab("statistics")} />
      </div>

      <div className="dashGrid" style={{ marginBottom: 20 }}>
        <SavingPlansCard txns={txns} savings={savings} onAddPlans={() => openSettings("savings")} currency={currency} />
        <FinanceScoreCard txns={txns} budgets={budgets} scope={scope} />
      </div>

      <div className="dailyLimitBurnRow" style={{ marginBottom: 20 }}>
        <div style={{ flex: "0 0 220px", minWidth: 0 }}>
          <DailyLimitCard txns={txns} dailyLimit={dailyLimit} onSetLimit={() => openSettings("limit")} currency={currency} />
        </div>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <BurnRateHeatmap txns={txns} currency={currency} />
        </div>
      </div>

      <Card title="Recent transactions" sub="Latest activity"
        filter={<button style={S.viewAllPill} onClick={() => setTab("transactions")}>View all →</button>}>
        <RecentTxnsTable txns={recentTx} catColor={catColor} currency={currency} />
      </Card>
    </main>
  );
}

function ConcentricRings({ data, size = 180 }) {
  const cx = size / 2, cy = size / 2;
  const strokeWidth = Math.max(7, Math.floor(size / 18));
  const gap = strokeWidth + 5;
  const outerR = size / 2 - strokeWidth / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const r = outerR - i * gap;
        if (r <= strokeWidth) return null;
        const circumference = 2 * Math.PI * r;
        const filled = (Math.max(0, Math.min(100, d.pct)) / 100) * circumference;
        return (
          <g key={d.name} transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={d.color + "22"} strokeWidth={strokeWidth} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={strokeWidth}
              strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

function StatisticCard({ scopedTxns, cats, income, expense, currency, onViewSubcategory, limit, onViewMore, title = "Statistic", showChart = true }) {
  const [statTab, setStatTab] = useState("expense");
  const [expandedCat, setExpandedCat] = useState(null);

  const expenseBreakdown = cats.heads.filter((h) => h.kind === "expense")
    .map((h) => ({
      name: h.name, color: h.color,
      value: -scopedTxns.filter((t) => t.head === h.name && t.amount < 0).reduce((s, t) => s + t.amount, 0),
    }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const incomeBreakdown = cats.heads.filter((h) => h.kind === "income")
    .map((h) => ({
      name: h.name, color: h.color,
      value: scopedTxns.filter((t) => t.head === h.name && t.amount > 0).reduce((s, t) => s + t.amount, 0),
    }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const fullBreakdown = statTab === "income" ? incomeBreakdown : expenseBreakdown;
  const donut = limit ? fullBreakdown.slice(0, limit) : fullBreakdown;
  const hasMoreCategories = limit && fullBreakdown.length > limit;
  const donutTotal = statTab === "income" ? income : -expense;
  const subBreakdown = (headName) => {
    const sign = statTab === "income" ? 1 : -1;
    const bySign = statTab === "income" ? (t) => t.amount > 0 : (t) => t.amount < 0;
    const map = {};
    scopedTxns.filter((t) => t.head === headName && bySign(t)).forEach((t) => {
      map[t.cat] = (map[t.cat] || 0) + sign * t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  return (
    <Card title={title}>
      <div style={S.statTabs}>
        <button onClick={() => { setStatTab("income"); setExpandedCat(null); }} style={{ ...S.statTab, ...(statTab === "income" ? S.statTabActive : {}) }}>
          Income
        </button>
        <button onClick={() => { setStatTab("expense"); setExpandedCat(null); }} style={{ ...S.statTab, ...(statTab === "expense" ? S.statTabActive : {}) }}>
          Expense
        </button>
      </div>
      {donut.length === 0 ? <Empty msg={`No ${statTab} in this range.`} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {showChart && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ textAlign: "center" }}>
                <div style={S.donutCenterLabel}>Total {statTab}</div>
                <div style={S.donutCenterValue}>{money(donutTotal, currency)}</div>
              </div>
              <ConcentricRings data={donut.map((d) => ({ ...d, pct: donutTotal !== 0 ? (d.value / donutTotal) * 100 : 0 }))} />
            </div>
          )}
          <div style={{ width: "100%" }}>
            {donut.map((d) => {
              const pct = donutTotal !== 0 ? (d.value / donutTotal) * 100 : 0;
              const isOpen = expandedCat === d.name;
              const subs = subBreakdown(d.name);
              return (
                <div key={d.name} style={{ padding: "6px 0", borderTop: `1px solid ${T.line}` }}>
                  <button type="button" className="statCatHead" onClick={() => setExpandedCat(isOpen ? null : d.name)}
                    aria-expanded={isOpen} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", font: "inherit", color: "inherit" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: T.text, fontWeight: 600 }}>
                        <span className={`statChevron${isOpen ? " open" : ""}`} aria-hidden="true"><IconChevronDown /></span>
                        {d.name}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: T.text, fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
                        {money(d.value, currency)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface2, overflow: "hidden" }}>
                        <div className="statPctFill" style={{ height: "100%", width: `${pct}%`, background: d.color, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: d.color, minWidth: 34, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                    </div>
                  </button>
                  <div className={`statSubWrap${isOpen ? " open" : ""}`}>
                    <div className="statSubInner">
                      <div style={{ marginTop: 4, marginLeft: 12, paddingLeft: 14, borderLeft: `2px solid ${d.color}33`, display: "flex", flexDirection: "column", gap: 10, paddingTop: 8, paddingBottom: 4 }}>
                        {subs.length === 0 ? (
                          <span style={{ fontSize: 12, color: T.mut2 }}>No subcategories in this range.</span>
                        ) : subs.map((s, i) => {
                          const subPct = d.value !== 0 ? (s.value / d.value) * 100 : 0;
                          return (
                            <button type="button" key={s.name} className="statSubRow" onClick={() => onViewSubcategory(d.name, s.name)}
                              title={`View ${s.name} transactions`}
                              style={{ animationDelay: `${i * 35}ms`, display: "block", width: "100%", textAlign: "left", background: "none", border: "none", font: "inherit", color: "inherit", padding: 0, cursor: "pointer" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: T.mut, fontWeight: 500 }}>
                                  <i style={{ width: 6, height: 6, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                                  {s.name}
                                </span>
                                <span style={{ fontVariantNumeric: "tabular-nums", color: T.text, fontWeight: 600, fontSize: 12.5 }}>{money(s.value, currency)}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ flex: 1, height: 5, borderRadius: 3, background: T.surface2, overflow: "hidden" }}>
                                  <div className="statSubBar" style={{ height: "100%", width: isOpen ? `${subPct}%` : "0%", background: d.color + "99", borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 10.5, color: T.mut2, minWidth: 28, textAlign: "right" }}>{subPct.toFixed(0)}%</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasMoreCategories && (
        <button style={{ ...S.viewAllPill, margin: "10px auto 0" }} onClick={onViewMore}>
          View more →
        </button>
      )}
    </Card>
  );
}

function CashflowCard({ txns, currency, scope }) {
  const [visual, setVisual] = useState(1);
  const totalBalance = txns.reduce((s, t) => s + t.amount, 0);

  const daily = useMemo(() => {
    const byDay = {};
    txns.forEach((t) => {
      const e = (byDay[t.date] ||= { label: t.date, Income: 0, Expense: 0 });
      if (t.amount > 0) e.Income += t.amount; else e.Expense += -t.amount;
    });
    const range = scopeRange(scope);
    const span = range ? daysInRange(range[0], range[1]) : null;
    const days = span && span.length <= 370 ? span : Object.keys(byDay).sort();
    return days.map((d) => ({ label: dayAxisLabel(d), Income: byDay[d]?.Income || 0, Expense: byDay[d]?.Expense || 0 }));
  }, [txns, scope]);

  const monthly = useMemo(() => {
    const byMonth = {};
    txns.forEach((t) => {
      const key = t.date.slice(0, 7);
      const e = (byMonth[key] ||= { key, Income: 0, Expense: 0 });
      if (t.amount > 0) e.Income += t.amount; else e.Expense += -t.amount;
    });
    const range = scopeRange(scope);
    const span = range ? monthsInRange(range[0], range[1]) : null;
    const keys = span && span.length <= 60 ? span : Object.keys(byMonth).sort();
    return keys.map((key) => ({ key, label: monthLabel(key), Income: byMonth[key]?.Income || 0, Expense: byMonth[key]?.Expense || 0 }));
  }, [txns, scope]);

  const isDailyView = visual === 1 && daily.length <= 92;
  const data = isDailyView ? daily : monthly;
  const hasData = data.some((d) => d.Income || d.Expense);
  const tickInterval = data.length > 8 ? Math.ceil(data.length / 7) - 1 : 0;
  const mobileTickInterval = data.length > 4 ? Math.ceil(data.length / 4) - 1 : 0;
  const mobileTickFormatter = (v) => {
    const parts = v.split(" ");
    return isDailyView ? (parts[1] || v) : parts[0];
  };

  return (
    <Card title="Cashflow" sub="Income vs expenses"
      filter={
        <div style={S.segment}>
          {[1, 2].map((v) => (
            <button key={v} onClick={() => setVisual(v)} style={{ ...S.segBtn, ...(visual === v ? S.segBtnActive : {}) }}>
              Visual {v}
            </button>
          ))}
        </div>
      }>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={S.kicker2}>TOTAL BALANCE</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.text, marginTop: 4, letterSpacing: -0.2 }}>
            {fm(totalBalance)} <span style={{ fontSize: 12, color: T.mut2, fontWeight: 400 }}>{currency}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ fontSize: 12.5, color: T.mut, display: "flex", alignItems: "center" }}>
            <i style={{ ...S.dot, background: visual === 2 ? T.darkSoft : T.mint }} />Income
          </span>
          <span style={{ fontSize: 12.5, color: T.mut, display: "flex", alignItems: "center" }}>
            <i style={{ ...S.dot, background: visual === 2 ? T.mint : T.darkSoft }} />Expense
          </span>
        </div>
      </div>

      {!hasData ? <Empty msg="No activity in this range." /> : (
        <>
          <div className="desktopOnly" style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              {visual === 1 ? (
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="cfIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.mint} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={T.mint} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cfExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.darkSoft} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={T.darkSoft} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} interval={tickInterval} />
                  <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<Tip currency={currency} />} cursor={{ stroke: T.line, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="Income" stroke={T.mint} strokeWidth={2.5} fill="url(#cfIncomeGrad)" activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="Expense" stroke={T.darkSoft} strokeWidth={2.5} fill="url(#cfExpenseGrad)" activeDot={{ r: 5 }} />
                </AreaChart>
              ) : (
                <BarChart data={data} barGap={4}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} interval={tickInterval} />
                  <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<Tip currency={currency} />} cursor={{ fill: T.surface2 }} />
                  <ReferenceLine y={0} stroke={T.line} />
                  <Bar dataKey="Income" fill={T.darkSoft} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={(d) => -d.Expense} name="Expense" fill={T.mint} radius={[0, 0, 4, 4]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div className="mobileOnly" style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              {visual === 1 ? (
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="cfIncomeGradM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.mint} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={T.mint} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cfExpenseGradM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.darkSoft} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={T.darkSoft} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false}
                    interval={mobileTickInterval} tickFormatter={mobileTickFormatter} />
                  <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<Tip currency={currency} />} cursor={{ stroke: T.line, strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="Income" stroke={T.mint} strokeWidth={2.5} fill="url(#cfIncomeGradM)" activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="Expense" stroke={T.darkSoft} strokeWidth={2.5} fill="url(#cfExpenseGradM)" activeDot={{ r: 5 }} />
                </AreaChart>
              ) : (
                <BarChart data={data} barGap={4}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false}
                    interval={mobileTickInterval} tickFormatter={mobileTickFormatter} />
                  <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<Tip currency={currency} />} cursor={{ fill: T.surface2 }} />
                  <ReferenceLine y={0} stroke={T.line} />
                  <Bar dataKey="Income" fill={T.darkSoft} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={(d) => -d.Expense} name="Expense" fill={T.mint} radius={[0, 0, 4, 4]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function SavingPlansCard({ txns, savings, onAddPlans, currency }) {
  const withProgress = savings.map((s) => {
    const current = txns.filter((t) => t.savingSpaceId === s.id).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const pct = s.target > 0 ? Math.min(100, (current / s.target) * 100) : 0;
    return { ...s, current, pct };
  });
  const totalSaved = withProgress.reduce((s, p) => s + p.current, 0);

  return (
    <Card title="Saving Plans"
      filter={<button style={S.viewAllPill} onClick={onAddPlans}>+ Add Plans</button>}>
      <div style={{ marginBottom: 14 }}>
        <div style={S.kicker2}>TOTAL SAVINGS</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.text, marginTop: 4, letterSpacing: -0.2 }}>{money(totalSaved, currency)}</div>
      </div>
      {withProgress.length === 0 ? (
        <Empty msg="No saving plans yet — add one in Settings." />
      ) : (
        withProgress.map((p, i) => (
          <div key={p.id} style={{ padding: "14px 0", borderTop: i > 0 ? `1px solid ${T.line}` : "none" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>{p.name}</div>
            <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${p.pct}%`, background: T.darkSoft }} />
              <div style={{ flex: 1, background: T.mint }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: T.mut }}>
              <span>{money(p.current, currency)} <span style={{ color: T.mut2 }}>/ {money(p.target, currency)}</span></span>
              <span style={{ fontWeight: 700, color: T.text }}>{p.pct.toFixed(0)}%</span>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function FinanceScoreCard({ txns, budgets, scope }) {
  const scopedTxns = txns.filter((t) => inScope(t.date, scope));
  const income = scopedTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = -scopedTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  const savingsRate = income > 0 ? net / income : (net >= 0 ? 1 : -1);
  const scoreA = Math.max(0, Math.min(100, 50 + savingsRate * 50));

  let scoreB = 75;
  if (budgets.length > 0) {
    const [monthStart, monthEnd] = currentMonthRange();
    const ratios = budgets.map((b) => {
      const spent = -txns.filter((t) => t.head === b.head && t.amount < 0 && t.date >= monthStart && t.date <= monthEnd).reduce((s, t) => s + t.amount, 0);
      return b.limit > 0 ? spent / b.limit : 0;
    });
    const avgRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    scoreB = Math.max(0, Math.min(100, 100 - Math.max(0, avgRatio - 1) * 100));
  }

  const expenseChangeRaw = prevPeriodChange(txns, scope, (t) => (t.amount < 0 ? -t.amount : 0));
  const expenseChange = expenseChangeRaw == null ? null : -expenseChangeRaw;
  const scoreC = expenseChange == null ? 70 : Math.max(0, Math.min(100, 50 + expenseChange));

  const score = Math.round(scoreA * 0.5 + scoreB * 0.3 + scoreC * 0.2);
  const label = score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Needs attention";

  return (
    <Card title="Finance Score" sub="Finance quality">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: T.text }}>{label}</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.mut }}>{score}%</div>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, background: T.darkSoft }} />
        <div style={{ flex: 1, background: T.mint }} />
      </div>
    </Card>
  );
}

function Statistics({ txns, cats, scope, currency, budgets, wallets, onViewSubcategory }) {
  const scopedTxns = txns.filter((t) => inScope(t.date, scope));
  const income = scopedTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = scopedTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = income + expense;
  const walletBalance = (wallets || []).reduce((sum, w) =>
    sum + w.startingBalance + txns.filter((t) => t.walletId === w.id).reduce((s, t) => s + t.amount, 0), 0);

  const incomeChange = prevPeriodChange(txns, scope, (t) => (t.amount > 0 ? t.amount : 0));
  const expenseChangeRaw = prevPeriodChange(txns, scope, (t) => (t.amount < 0 ? -t.amount : 0));
  const expenseChange = expenseChangeRaw == null ? null : -expenseChangeRaw;
  const netChange = prevPeriodChange(txns, scope, (t) => t.amount);

  return (
    <main style={S.main}>
      <div className="statRow" style={S.statRow}>
        <StatCard label="Current Wallet Balance" value={money(walletBalance, currency)} valueColor={walletBalance >= 0 ? T.darkSoft : T.rose} iconBg={T.mintSoft} iconColor={T.darkSoft} icon={IconWallet} />
        <StatCard label="Total Period Change" value={money(net, currency)} valueColor={net >= 0 ? T.darkSoft : T.rose} change={netChange} iconBg={T.goldSoft} iconColor={T.gold} icon={IconScale} />
        <StatCard label="Total Period Expenses" value={money(-expense, currency)} change={expenseChange} iconBg={T.roseSoft} iconColor={T.rose} icon={IconArrowUp} />
        <StatCard label="Total Period Income" value={money(income, currency)} change={incomeChange} iconBg={T.mintSoft} iconColor={T.darkSoft} icon={IconArrowDown} />
      </div>

      <div className="dashGrid" style={{ marginBottom: 20 }}>
        <CashflowCard txns={scopedTxns} currency={currency} scope={scope} />
        <FinanceScoreCard txns={txns} budgets={budgets} scope={scope} />
      </div>

      <StatisticCard scopedTxns={scopedTxns} cats={cats} income={income} expense={expense} currency={currency}
        onViewSubcategory={onViewSubcategory} limit={null} title="Full category breakdown" showChart={false} />
    </main>
  );
}

function DailyLimitCard({ txns, dailyLimit, onSetLimit, currency }) {
  const todayStr = iso(new Date());
  const spentToday = -txns.filter((t) => t.date === todayStr && t.amount < 0).reduce((s, t) => s + t.amount, 0);

  if (!dailyLimit) {
    return (
      <div style={{ ...S.statCard, width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={S.statTop}>
          <span style={{ ...S.statIcon, background: T.surface2, color: T.mut }}><IconGauge /></span>
        </div>
        <div style={{ fontSize: 12.5, color: T.mut, marginBottom: 8 }}>No daily limit set</div>
        <button className="linkBtn" style={{ ...S.linkBtn, padding: "0" }} onClick={onSetLimit}>Set one in Settings →</button>
      </div>
    );
  }

  const pct = Math.min(100, (spentToday / dailyLimit) * 100);
  const over = spentToday > dailyLimit;
  return (
    <div style={{ ...S.statCard, width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={S.statTop}>
        <span style={{ ...S.statIcon, background: over ? T.roseSoft : T.mintSoft, color: over ? T.rose : T.darkSoft }}><IconGauge /></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: over ? T.rose : T.mut2 }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ ...S.statValue, fontSize: 20, color: over ? T.rose : T.text }}>
        {money(spentToday, currency)} <span style={{ fontSize: 12, color: T.mut2, fontWeight: 400 }}>/ {money(dailyLimit, currency)}</span>
      </div>
      <div style={S.statLabel}>Today's spending limit</div>
      <div style={{ height: 6, borderRadius: 4, background: T.surface2, overflow: "hidden", marginTop: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? T.rose : T.darkSoft, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function BurnRateHeatmap({ txns, currency }) {
  const year = new Date().getFullYear();
  const todayStr = iso(new Date());
  const cell = 9, gap = 2;

  const spendByDay = useMemo(() => {
    const m = {};
    txns.forEach((t) => {
      if (t.amount < 0 && t.date.slice(0, 4) === String(year)) m[t.date] = (m[t.date] || 0) - t.amount;
    });
    return m;
  }, [txns, year]);

  const thresholds = useMemo(() => {
    const values = Object.values(spendByDay).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => (values.length ? values[Math.min(values.length - 1, Math.floor(p * values.length))] : 0);
    return { q25: q(0.25), q50: q(0.5), q75: q(0.75) };
  }, [spendByDay]);

  const bucket = (v) => {
    if (!v) return 0;
    if (v <= thresholds.q25) return 1;
    if (v <= thresholds.q50) return 2;
    if (v <= thresholds.q75) return 3;
    return 4;
  };
  const bucketColor = ["#FDE2E6", "#F8B4C0", "#F2748A", "#C23A52", "#7A1F30"];

  const weeks = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const dec31 = new Date(year, 11, 31);
    const gridStart = new Date(jan1); gridStart.setDate(jan1.getDate() - jan1.getDay());
    const gridEnd = new Date(dec31); gridEnd.setDate(dec31.getDate() + (6 - dec31.getDay()));
    const out = [];
    const cursor = new Date(gridStart);
    while (cursor <= gridEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor.getFullYear() === year ? iso(cursor) : null);
        cursor.setDate(cursor.getDate() + 1);
      }
      out.push(week);
    }
    return out;
  }, [year]);

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstReal = week.find((d) => d);
      if (!firstReal) return;
      const m = +firstReal.slice(5, 7) - 1;
      const dayNum = +firstReal.slice(8, 10);
      if (m !== lastMonth && dayNum <= 7) { labels.push({ wi, label: MONTH_NAMES[m].slice(0, 3) }); lastMonth = m; }
    });
    return labels;
  }, [weeks]);

  const rowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const MOBILE_WEEKS = 20;
  const todayWeekIndex = weeks.findIndex((week) => week.includes(todayStr));
  const mobileWeeks = todayWeekIndex === -1
    ? weeks.slice(-MOBILE_WEEKS)
    : weeks.slice(Math.max(0, todayWeekIndex - MOBILE_WEEKS + 1), todayWeekIndex + 1);
  const mCell = 8, mGap = 2;

  const renderGrid = (weekList, cellSize, gapSize, showMonths) => (
    <div style={{ display: "flex" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: gapSize, marginRight: 8, marginTop: showMonths ? 18 : 0 }}>
        {rowLabels.map((l, i) => (
          <div key={i} style={{ height: cellSize, fontSize: 10, color: T.mut2, lineHeight: `${cellSize}px` }}>{l}</div>
        ))}
      </div>
      <div>
        {showMonths && (
          <div style={{ display: "flex", position: "relative", height: 14, marginBottom: 4 }}>
            {monthLabels.map((m) => (
              <div key={m.wi} style={{ position: "absolute", left: m.wi * (cellSize + gapSize), fontSize: 10.5, color: T.mut2, fontWeight: 600 }}>{m.label}</div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: gapSize }}>
          {weekList.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: gapSize }}>
              {week.map((d, di) => {
                if (!d) return <div key={di} style={{ width: cellSize, height: cellSize }} />;
                const isToday = d === todayStr;
                const spend = spendByDay[d] || 0;
                return (
                  <div key={di} title={`${d}: ${money(spend, currency)}`}
                    style={{
                      width: cellSize, height: cellSize, borderRadius: 3, boxSizing: "border-box",
                      background: isToday ? T.mint : bucketColor[bucket(spend)],
                      border: isToday ? `2px solid ${T.dark}` : `1px solid ${T.line}`,
                    }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Card title="Burn Rate Heatmap" sub="Daily spend intensity">
      <div className="desktopOnly" style={{ overflowX: "auto", paddingBottom: 6 }}>
        {renderGrid(weeks, cell, gap, true)}
      </div>
      <div className="mobileOnly" style={{ overflowX: "auto" }}>
        <div style={{ fontSize: 12, color: T.mut2, marginBottom: 8 }}>Last {MOBILE_WEEKS} weeks</div>
        {renderGrid(mobileWeeks, mCell, mGap, false)}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11, color: T.mut2, flexWrap: "wrap" }}>
        <span>No spend</span>
        {bucketColor.slice(0, 4).map((c, i) => (
          <i key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: `1px solid ${T.line}`, display: "inline-block", boxSizing: "border-box" }} />
        ))}
        <i style={{ width: 12, height: 12, borderRadius: 3, background: bucketColor[4], display: "inline-block" }} />
        <span>High</span>
        <i style={{ width: 12, height: 12, borderRadius: 3, background: T.mint, border: `2px solid ${T.dark}`, display: "inline-block", boxSizing: "border-box" }} />
        <span>Today</span>
      </div>
    </Card>
  );
}

function StatCard({ label, value, valueColor, change, iconBg, iconColor, icon: Icon = IconCoin }) {
  return (
    <div className="statCard" style={S.statCard}>
      <div style={S.statTop}>
        <span style={{ ...S.statIcon, background: iconBg, color: iconColor }}><Icon /></span>
        {change != null && (
          <span style={{ ...S.changeBadge, ...(change >= 0 ? S.changeUp : S.changeDown) }}>
            {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <div style={{ ...S.statValue, color: valueColor || T.text }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function RecentTxnsTable({ txns, catColor, currency }) {
  if (txns.length === 0) return <Empty msg="No transactions in this range." />;
  return (
    <>
      <div className="mobileOnly">
        {txns.map((t) => (
          <div key={t.id} className="txnRow" style={S.txnRow}>
            <span style={{ ...S.catDot, background: catColor(t.head) }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.txnNote}>{t.note || t.cat}</div>
              <div style={S.txnMeta}>{t.head} · {dateLabel(t.date)}</div>
            </div>
            <div style={{ ...S.txnAmt, color: t.amount >= 0 ? T.darkSoft : T.rose }}>
              {t.amount >= 0 ? "+" : "−"}{money(Math.abs(t.amount), currency)}
            </div>
          </div>
        ))}
      </div>
      <div className="desktopOnly" style={{ overflowX: "auto" }}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Transaction</th>
            <th style={S.th}>Date</th>
            <th style={{ ...S.th, textAlign: "right" }}>Amount</th>
            <th style={{ ...S.th, textAlign: "center" }}>Type</th>
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className="tblRow" style={S.tr}>
              <td style={S.td}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...S.catDot, background: catColor(t.head) }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={S.tdMain}>{t.note || t.cat}</div>
                    <div style={S.tdSub}>{t.head} · {t.cat}</div>
                  </div>
                </div>
              </td>
              <td style={S.td}>
                <span style={S.tdSub}>{dateLabel(t.date)}</span>
              </td>
              <td style={{ ...S.td, textAlign: "right", fontFamily: FONT_DISPLAY, fontWeight: 600, color: t.amount >= 0 ? T.darkSoft : T.rose, fontVariantNumeric: "tabular-nums" }}>
                {t.amount >= 0 ? "+" : "−"}{money(Math.abs(t.amount), currency)}
              </td>
              <td style={{ ...S.td, textAlign: "center" }}>
                <span style={{ ...S.statusPill, ...(t.amount >= 0 ? S.pillIncome : S.pillExpense) }}>
                  {t.amount >= 0 ? "Income" : "Expense"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function Wallets({ txns, wallets, scope, currency, onAddWallet }) {
  const withBalance = wallets.map((w) => {
    const walletTxns = txns.filter((t) => t.walletId === w.id);
    return {
      ...w,
      balance: w.startingBalance + walletTxns.reduce((s, t) => s + t.amount, 0),
      scopedCount: walletTxns.filter((t) => inScope(t.date, scope)).length,
    };
  });
  const totalBalance = withBalance.reduce((s, w) => s + w.balance, 0);

  const openWalletBtn = (
    <button onClick={onAddWallet} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px", borderRadius: 18,
      border: `1.5px dashed ${T.line}`, background: "none", color: T.darkSoft, fontWeight: 700, fontSize: 14, minHeight: 44,
    }}>
      <IconPlus /> Open new wallet
    </button>
  );

  return (
    <main style={S.main}>
      <div className="mobileOnly pageTitleLg" style={{ color: T.text, marginBottom: 4 }}>My accounts</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
        Balance is the wallet's running total across all time — it isn't affected by the date range up top.
      </div>

      <div className="mobileOnly" style={{
        background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`, borderRadius: 20, padding: 22, color: "#EAF7EE",
        marginBottom: 20, boxShadow: "0 16px 32px rgba(15,40,28,0.22)",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#9FCBAE", fontWeight: 600, marginBottom: 6 }}>TOTAL BALANCE</div>
        <div className="amountLg" style={{ fontSize: 32, color: totalBalance >= 0 ? "#fff" : "#FFB3C0" }}>{money(totalBalance, currency)}</div>
      </div>

      <div className="mobileOnly" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {withBalance.map((w) => (
          <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 14, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: 16 }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, background: w.color + "33", color: T.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <IconWallet />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: T.text }}>{w.name}</div>
              <div style={{ fontSize: 12, color: T.mut2 }}>{w.scopedCount} txns in range</div>
            </div>
            <div className="amountLg" style={{ fontSize: 16, color: w.balance >= 0 ? T.text : T.rose, flexShrink: 0 }}>{money(w.balance, currency)}</div>
          </div>
        ))}
        {openWalletBtn}
      </div>

      <div className="desktopOnly" style={S.statRow}>
        {withBalance.map((w) => (
          <div key={w.id} style={S.statCard}>
            <div style={S.statTop}>
              <span style={{ ...S.statIcon, background: w.color + "33", color: T.text }}><IconWallet /></span>
              <span style={{ fontSize: 11.5, color: T.mut2 }}>{w.scopedCount} txns in range</span>
            </div>
            <div style={{ ...S.statValue, color: w.balance >= 0 ? T.text : T.rose }}>{money(w.balance, currency)}</div>
            <div style={S.statLabel}>{w.name}</div>
          </div>
        ))}
      </div>
      <div className="desktopOnly">{openWalletBtn}</div>
    </main>
  );
}

function Budgets({ txns, budgets, catColor, currency, onEditBudget, onDeleteBudget }) {
  const [confirmDelete, setConfirmDelete] = useState(null);
  if (budgets.length === 0) {
    return (
      <main style={S.main}>
        <Card title="Budgets"><Empty msg="No budgets yet — add one from Settings." /></Card>
      </main>
    );
  }
  const [monthStart, monthEnd] = currentMonthRange();
  const withSpend = budgets.map((b) => ({
    ...b,
    spent: -txns.filter((t) => t.head === b.head && t.amount < 0 && t.date >= monthStart && t.date <= monthEnd).reduce((s, t) => s + t.amount, 0),
  }));
  const totalLimit = withSpend.reduce((s, b) => s + b.limit, 0);
  const totalSpent = withSpend.reduce((s, b) => s + b.spent, 0);
  const totalPct = totalLimit > 0 ? Math.min(100, (totalSpent / totalLimit) * 100) : 0;
  const totalOver = totalSpent > totalLimit;

  return (
    <main style={S.main}>
      <div className="mobileOnly pageTitleLg" style={{ color: T.text, marginBottom: 4 }}>Budgets</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
        Budgets always track {dateLabel(monthStart)} → {dateLabel(monthEnd)} — the current calendar month, regardless of the date range up top.
      </div>

      <div className="mobileOnly" style={{
        background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`, borderRadius: 20, padding: 22, color: "#EAF7EE",
        marginBottom: 20, boxShadow: "0 16px 32px rgba(15,40,28,0.22)",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#9FCBAE", fontWeight: 600, marginBottom: 6 }}>MONTHLY BUDGET</div>
        <div className="amountLg" style={{ fontSize: 30, color: totalOver ? "#FFB3C0" : "#fff" }}>{money(totalSpent, currency)}</div>
        <div style={{ fontSize: 13, color: "#CFE9D6", marginBottom: 10 }}>of {money(totalLimit, currency)} budgeted</div>
        <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalPct}%`, background: totalOver ? "#FFB3C0" : T.mint, borderRadius: 5, transition: "width .4s" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
        {withSpend.map((b) => {
          const { spent } = b;
          const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0;
          const over = spent > b.limit;
          const barColor = pct >= 100 ? T.rose : pct >= 80 ? T.gold : T.darkSoft;
          return (
            <Card key={b.id} title={b.head} sub={`Limit ${money(b.limit, currency)}`}
              filter={confirmDelete !== b.id && (
                <div style={{ display: "flex", gap: 4 }}>
                  <button aria-label={`Edit budget for ${b.head}`} onClick={() => onEditBudget(b)} style={S.cardIconBtn}>✎</button>
                  <button aria-label={`Delete budget for ${b.head}`} onClick={() => setConfirmDelete(b.id)} style={S.cardIconBtn}><IconX /></button>
                </div>
              )}>
              {confirmDelete === b.id ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Delete this budget?</span>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setConfirmDelete(null)} style={S.confirmCancelBtn}>Cancel</button>
                    <button onClick={() => { onDeleteBudget(b.id); setConfirmDelete(null); }} style={S.confirmDeleteBtn}>Delete</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ ...S.catDot, background: catColor(b.head) }} />
                    <div style={{ flex: 1, height: 10, borderRadius: 6, background: T.surface2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 6, transition: "width .4s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: T.mut }}>Spent {money(spent, currency)}</span>
                    <span style={{ color: over ? T.rose : T.darkSoft, fontWeight: 700 }}>
                      {over ? `${money(spent - b.limit, currency)} over` : `${money(b.limit - spent, currency)} left`}
                    </span>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function SavingSpaces({ txns, savings, currency, onAddGoal, onEditSaving, onDeleteSaving }) {
  const withProgress = savings.map((s) => {
    const current = txns.filter((t) => t.savingSpaceId === s.id).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const pct = s.target > 0 ? Math.min(100, (current / s.target) * 100) : 0;
    return { ...s, current, pct };
  });
  const totalSaved = withProgress.reduce((s, p) => s + p.current, 0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteErr, setDeleteErr] = useState(null);

  const handleDelete = (id) => {
    const err = onDeleteSaving(id);
    setConfirmDelete(null);
    setDeleteErr(err ? { id, msg: err } : null);
  };

  return (
    <main style={S.main}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div className="mobileOnly pageTitleLg" style={{ color: T.text }}>Save</div>
        <button onClick={onAddGoal} aria-label="Add saving goal" className="mobileOnly"
          style={{ width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${T.line}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", color: T.text }}>
          <IconPlus />
        </button>
      </div>
      <div className="mobileOnly" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: T.mut, marginBottom: 2 }}>Your total savings</div>
        <div className="amountLg" style={{ fontSize: "clamp(28px, 8vw, 36px)", color: T.text }}>{money(totalSaved, currency)}</div>
      </div>

      {withProgress.length === 0 ? (
        <Card title="Saving spaces"><Empty msg="No saving spaces yet — add one from Settings." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
          {withProgress.map((s) => (
            <div key={s.id} style={{
              background: `linear-gradient(160deg, ${T.mint}, ${T.dark})`, borderRadius: 24, padding: 24,
              color: "#fff", minHeight: 200, display: "flex", flexDirection: "column", justifyContent: "space-between",
              boxShadow: "0 16px 32px rgba(15,20,40,0.22)",
            }}>
              {confirmDelete === s.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", justifyContent: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Delete "{s.name}"?</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setConfirmDelete(null)} style={{ ...S.confirmCancelBtn, background: "rgba(255,255,255,0.2)", color: "#fff" }}>Cancel</button>
                    <button onClick={() => handleDelete(s.id)} style={S.confirmDeleteBtn}>Delete</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700 }}>{s.name}</div>
                      {s.targetDate && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>by {dateLabel(s.targetDate)}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button aria-label={`Edit ${s.name}`} onClick={() => onEditSaving(s)} style={{ ...S.cardIconBtn, color: "#fff" }}>✎</button>
                      <button aria-label={`Delete ${s.name}`} onClick={() => { setDeleteErr(null); setConfirmDelete(s.id); }} style={{ ...S.cardIconBtn, color: "#fff" }}><IconX /></button>
                    </div>
                  </div>
                  <div>
                    <div className="amountLg" style={{ fontSize: 30, marginBottom: 10 }}>{money(s.current, currency)}</div>
                    <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${s.pct}%`, background: "#fff", borderRadius: 5, transition: "width .4s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "rgba(255,255,255,0.8)", marginTop: 8 }}>
                      <span>of {money(s.target, currency)}</span>
                      <span style={{ fontWeight: 700, color: "#fff" }}>{s.pct.toFixed(0)}%</span>
                    </div>
                    {deleteErr?.id === s.id && <div style={{ color: "#FFD9DF", fontSize: 11.5, marginTop: 8 }}>{deleteErr.msg}</div>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Forecast({ txns, currency }) {
  const months = [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
  const series = months.map((m) => {
    const mt = txns.filter((t) => t.date.slice(0, 7) === m);
    const inc = mt.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const exp = -mt.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    return { month: monthLabel(m), Income: inc, Expenses: exp, projected: false };
  });

  const trailing = series.slice(-6);
  const avgIncome = trailing.length ? trailing.reduce((s, m) => s + m.Income, 0) / trailing.length : 0;
  const avgExpense = trailing.length ? trailing.reduce((s, m) => s + m.Expenses, 0) / trailing.length : 0;
  const avgNet = avgIncome - avgExpense;

  const lastMonthKey = months[months.length - 1];
  const projected = [];
  if (lastMonthKey) {
    let [y, m] = lastMonthKey.split("-").map(Number);
    for (let i = 0; i < 3; i++) {
      m += 1; if (m > 12) { m = 1; y += 1; }
      const key = `${y}-${String(m).padStart(2, "0")}`;
      projected.push({ month: monthLabel(key), Income: avgIncome, Expenses: avgExpense, projected: true });
    }
  }
  const combined = [...series, ...projected];
  const tickInterval = combined.length > 8 ? Math.ceil(combined.length / 7) - 1 : 0;

  const MOBILE_MONTHS = 5;
  const mobileSeries = series.slice(-MOBILE_MONTHS);
  const mobileCombined = [...mobileSeries, ...projected];
  const mobileTickInterval = mobileCombined.length > 8 ? Math.ceil(mobileCombined.length / 7) - 1 : 0;

  const renderChart = (data, interval, shortLabels) => (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} barGap={4}>
          <CartesianGrid stroke={T.line} vertical={false} />
          <XAxis dataKey="month" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} interval={interval}
            tickFormatter={shortLabels ? (v) => v.split(" ")[0] : undefined} />
          <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
          <Tooltip content={<Tip currency={currency} />} cursor={{ fill: T.surface2 }} />
          <Legend wrapperStyle={{ fontSize: 11, color: T.mut }} />
          <Bar dataKey="Income" fill={T.darkSoft} radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={T.darkSoft} fillOpacity={d.projected ? 0.35 : 1} />)}
          </Bar>
          <Bar dataKey="Expenses" fill={T.mint} radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={T.mint} fillOpacity={d.projected ? 0.5 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  return (
    <main style={S.main}>
      <Card title="Predictive cash flow" sub="Based on your full transaction history">
        {series.length < 2 ? (
          <Empty msg="Log at least two months of transactions to see a forecast." />
        ) : (
          <>
            <div style={{ fontSize: 13, color: T.mut, marginBottom: 16 }}>
              Averaging your last {trailing.length} month{trailing.length !== 1 ? "s" : ""}, you net about{" "}
              <strong style={{ color: avgNet >= 0 ? T.darkSoft : T.rose }}>{money(avgNet, currency)}/month</strong>.
              The lighter bars below are a projection based on that average, not a guarantee.
            </div>
            <div className="desktopOnly">{renderChart(combined, tickInterval, false)}</div>
            <div className="mobileOnly">{renderChart(mobileCombined, mobileTickInterval, true)}</div>
          </>
        )}
      </Card>
    </main>
  );
}

function ComingSoon({ title, blurb }) {
  return (
    <main style={S.main}>
      <div style={S.comingSoon}>
        <div style={S.comingSoonBadge}>Coming soon</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginTop: 10 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: T.mut, marginTop: 8, maxWidth: 360 }}>{blurb}</div>
      </div>
    </main>
  );
}

function Transactions({ txns, cats, catColor, onEdit, onDelete, scope, search, setSearch, currency, presetFilter, onConsumePresetFilter, onQuickAdd }) {
  const [fHead, setFHead] = useState(presetFilter?.head || "all");
  const [fSub, setFSub] = useState(presetFilter?.sub || "all");
  const [fType, setFType] = useState(presetFilter?.type || "all");
  const [confirmDeleteTxn, setConfirmDeleteTxn] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => { if (presetFilter) onConsumePresetFilter(); }, []);

  const subOptions = fHead !== "all" ? cats.subcats[fHead] || [] : [];

  const filtered = txns.filter((t) => {
    if (!inScope(t.date, scope)) return false;
    if (fHead !== "all" && t.head !== fHead) return false;
    if (fSub !== "all" && t.cat !== fSub) return false;
    if (fType === "income" && t.amount <= 0) return false;
    if (fType === "expense" && t.amount >= 0) return false;
    if (search && !`${t.note} ${t.cat} ${t.head}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const byDate = useMemo(() => {
    const g = {};
    [...filtered].sort((a, b) => b.date.localeCompare(a.date)).forEach((t) => { (g[t.date] = g[t.date] || []).push(t); });
    return g;
  }, [filtered]);
  const dateKeys = Object.keys(byDate);
  const PAGE_SIZE = 30;
  const [visibleDays, setVisibleDays] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleDays(PAGE_SIZE); }, [scope, fHead, fSub, fType, search]);
  const visibleDateKeys = dateKeys.slice(0, visibleDays);

  return (
    <main style={S.main}>
      <div className="mobileOnly pageTitleLg" style={{ color: T.text, marginBottom: 4 }}>Transactions</div>
      <div style={S.filterBar}>
        <div className="mobileOnly">
          {searchOpen ? (
            <div style={{ ...S.searchWrap, width: "100%" }}>
              <IconSearch />
              <input className="field" autoFocus placeholder="Search transactions…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                onBlur={() => { if (!search) setSearchOpen(false); }} style={S.searchInput} />
            </div>
          ) : (
            <button aria-label="Search transactions" onClick={() => setSearchOpen(true)} style={S.iconTrigger}>
              <IconSearch />
            </button>
          )}
        </div>
        {search && (
          <div style={S.activeSearchPill}>
            Searching "{search}" <button onClick={() => { setSearch(""); setSearchOpen(false); }} aria-label="Clear search" style={S.activeSearchClear}>✕</button>
          </div>
        )}
        <FilterPicker value={fHead} placeholderLabel="All categories"
          options={[{ value: "all", label: "All categories" }, ...cats.heads.map((h) => ({ value: h.name, label: h.name }))]}
          onChange={(v) => { setFHead(v); setFSub("all"); }} />
        <FilterPicker value={fSub} placeholderLabel="All subcategories" disabled={fHead === "all" || subOptions.length === 0}
          options={[{ value: "all", label: "All subcategories" }, ...subOptions.map((s) => ({ value: s, label: s }))]}
          onChange={setFSub} />
        <FilterPicker value={fType} placeholderLabel="All types"
          options={[{ value: "all", label: "All types" }, { value: "expense", label: "Expense" }, { value: "income", label: "Income" }]}
          onChange={setFType} />
      </div>

      <div className="mobileOnly" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button className="quickBtn" style={{ ...S.quickBtn, flex: 1 }} onClick={() => onQuickAdd("expense")}>
          <span style={{ ...S.quickIcon, background: T.roseSoft, color: T.rose }}><IconPlus /></span>
          Add expense
        </button>
        <button className="quickBtn" style={{ ...S.quickBtn, flex: 1 }} onClick={() => onQuickAdd("income")}>
          <span style={{ ...S.quickIcon, background: T.mintSoft, color: T.darkSoft }}><IconPlus /></span>
          Add income
        </button>
      </div>

      <div style={S.resultLine}>
        {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · {scopeLabel(scope)} ·{" "}
        <span style={{ color: total >= 0 ? T.darkSoft : T.rose, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
          {total >= 0 ? "+" : "−"}{money(Math.abs(total), currency)}
        </span>
        <span style={{ color: T.mut2, marginLeft: 10, fontSize: 11 }}>Tap any transaction to edit</span>
      </div>

      {dateKeys.length === 0 && (
        <div style={S.empty}>No transactions match these filters. Clear a filter or add a new expense.</div>
      )}

      {visibleDateKeys.map((date) => {
        const dayTotal = byDate[date].reduce((s, t) => s + t.amount, 0);
        return (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ ...S.dateHead, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{dateLabel(date)}</span>
            <span style={{ color: dayTotal >= 0 ? T.darkSoft : T.rose, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
              {dayTotal >= 0 ? "+" : "−"}{money(Math.abs(dayTotal), currency)}
            </span>
          </div>
          {byDate[date].map((t) => (
            confirmDeleteTxn === t.id ? (
              <div key={t.id} className="txnRow" style={{ ...S.txnRow, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>Delete this transaction?</span>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setConfirmDeleteTxn(null)} style={S.confirmCancelBtn}>Cancel</button>
                  <button onClick={() => { onDelete(t.id); setConfirmDeleteTxn(null); }} style={S.confirmDeleteBtn}>Delete</button>
                </div>
              </div>
            ) : (
              <div key={t.id} className="txnRow" style={{ ...S.txnRow, cursor: "pointer" }}
                onClick={() => onEdit(t)} title="Edit this transaction">
                <span style={{ ...S.catDot, background: catColor(t.head) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.txnNote}>{t.note || t.cat}</div>
                  <div style={S.txnMeta}>{t.head} · {t.cat}</div>
                </div>
                <div style={{ ...S.txnAmt, color: t.amount >= 0 ? T.darkSoft : T.rose }}>
                  {t.amount >= 0 ? "+" : "−"}{money(Math.abs(t.amount), currency)}
                </div>
                <span className="editHint" style={S.editHint}>✎</span>
                <button aria-label="Delete transaction" className="txnDeleteBtn" onClick={(e) => { e.stopPropagation(); setConfirmDeleteTxn(t.id); }} style={S.txnDeleteBtn}>
                  <IconX />
                </button>
              </div>
            )
          ))}
        </div>
        );
      })}

      {dateKeys.length > visibleDays && (
        <button className="linkBtn" style={{ ...S.linkBtn, display: "block", margin: "8px auto 0" }}
          onClick={() => setVisibleDays((n) => n + PAGE_SIZE)}>
          Load more days ({dateKeys.length - visibleDays} left) ↓
        </button>
      )}
    </main>
  );
}

function TxnForm({ cats, initial, onSave, onDelete, presetType, wallets, savings, currency, embedded }) {
  const isEdit = !!initial;
  const today = new Date().toISOString().slice(0, 10);
  const expHeads = cats.heads.filter((h) => h.kind === "expense");
  const incHeads = cats.heads.filter((h) => h.kind === "income");

  const [type, setType] = useState(initial ? (initial.amount >= 0 ? "income" : "expense") : (presetType || "expense"));
  const [date, setDate] = useState(initial?.date || today);
  const [head, setHead] = useState(initial?.head || (type === "income" ? incHeads[0]?.name : expHeads[0]?.name) || "");
  const [cat, setCat] = useState(initial?.cat || cats.subcats[head]?.[0] || "");
  const [note, setNote] = useState(initial?.note || "");
  const [amount, setAmount] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const [walletId, setWalletId] = useState(initial?.walletId || wallets[0]?.id || "");
  const [savingSpaceId, setSavingSpaceId] = useState(initial?.savingSpaceId || "");
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  const headsForType = type === "income" ? incHeads : expHeads;
  const subcats = cats.subcats[head] || [];

  const pickType = (t) => {
    setType(t);
    const list = t === "income" ? incHeads : expHeads;
    const h = list[0]?.name || "";
    setHead(h); setCat(cats.subcats[h]?.[0] || "");
  };
  const pickHead = (h) => { setHead(h); setCat(cats.subcats[h]?.[0] || ""); };

  const submit = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setErr("Enter an amount greater than zero."); return; }
    if (!date) { setErr("Pick a date."); return; }
    if (!head) { setErr("Pick a category — add one in Settings if the list is empty."); return; }
    if (!walletId) { setErr("Pick a wallet."); return; }
    onSave({
      id: initial?.id || uid(), date, head, cat: cat || head,
      note: note.trim(), amount: type === "expense" ? -val : val,
      walletId, savingSpaceId: savingSpaceId || null,
    });
  };

  return (
    <main style={{ ...S.main, maxWidth: 560, ...(embedded ? { margin: 0, padding: 0, maxWidth: "none" } : {}) }}>
      <div style={{ ...S.formCard, ...(embedded ? { border: "none", padding: 0, background: "transparent", boxShadow: "none" } : {}) }}>
        {embedded && (
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, marginBottom: 10 }}>
            {isEdit ? "Edit transaction" : type === "income" ? "Add income" : "Add expense"}
          </div>
        )}
        <div style={S.segment}>
          {["expense", "income"].map((t) => (
            <button key={t} onClick={() => pickType(t)}
              style={{
                ...S.segBtn, flex: 1,
                ...(type === t ? { ...S.segBtnActive, background: t === "income" ? T.mintSoft : T.roseSoft, color: t === "income" ? T.darkSoft : T.rose } : {}),
              }}>
              {t === "expense" ? "− Expense" : "+ Income"}
            </button>
          ))}
        </div>

        <label style={S.label}>Amount ({currency})</label>
        <input className="field" type="number" inputMode="decimal" min="0" placeholder="0"
          value={amount} onChange={(e) => { setAmount(e.target.value); setErr(""); }}
          style={{ ...S.input, width: "100%", fontSize: 26, fontFamily: FONT_DISPLAY, fontWeight: 700, padding: "12px 14px" }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", minWidth: 0 }}>
            <label style={S.label}>Date</label>
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 0 }}>
            <PickerField label="Head category" value={head} onChange={pickHead}
              options={headsForType.map((h) => ({ value: h.name, label: h.name }))} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", minWidth: 0 }}>
            <PickerField label="Wallet" value={walletId} onChange={setWalletId}
              options={wallets.map((w) => ({ value: w.id, label: w.name }))} />
          </div>
          {savings.length > 0 && (
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <label style={S.label}>Saving space</label>
              <select className="field" value={savingSpaceId} onChange={(e) => setSavingSpaceId(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
                <option value="">None</option>
                {savings.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <label style={S.label}>Category</label>
        <div style={S.chipWrap}>
          {subcats.map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
          {subcats.length === 0 && <span style={{ fontSize: 12, color: T.mut2 }}>No subcategories — add some in Settings.</span>}
        </div>

        <label style={S.label}>Note</label>
        <input className="field" placeholder="e.g. Lunch at a restaurant" value={note}
          onChange={(e) => setNote(e.target.value)} style={{ ...S.input, width: "100%" }}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        {err && <div style={{ color: T.rose, fontSize: 12, marginTop: 8 }}>{err}</div>}

        <div className={embedded ? "stickyFormFooter" : undefined}>
          <button className="primaryBtn" onClick={submit} style={S.primaryBtn}>
            {isEdit ? "Save changes" : "Save transaction"}
          </button>
        </div>

        {isEdit && (
          !confirmDel ? (
            <button onClick={() => setConfirmDel(true)} style={S.dangerGhost}>Delete this transaction</button>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={onDelete} style={{ ...S.dangerGhost, flex: 1, marginTop: 0, background: T.rose, color: "#fff", borderColor: T.rose }}>
                Yes, delete
              </button>
              <button onClick={() => setConfirmDel(false)} style={{ ...S.dangerGhost, flex: 1, marginTop: 0, color: T.mut }}>
                Keep it
              </button>
            </div>
          )
        )}
      </div>
    </main>
  );
}

const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "limit", label: "Daily limit" },
  { key: "categories", label: "Categories" },
  { key: "wallets", label: "Wallets" },
  { key: "budgets", label: "Budgets" },
  { key: "savings", label: "Saving spaces" },
  { key: "logout", label: "Log out" },
];

function Settings({
  cats, txns, persistCats, persistTxns, catColor, wallets, budgets, savings,
  persistWallets, persistBudgets, persistSavings, dailyLimit, persistDailyLimit,
  profile, persistProfile, settingsTab, setSettingsTab, onLogout, onResetData,
}) {
  const [newHead, setNewHead] = useState("");
  const [dailyLimitInput, setDailyLimitInput] = useState(String(dailyLimit || ""));
  const [newHeadColor, setNewHeadColor] = useState("#4A90A4");
  const [newHeadKind, setNewHeadKind] = useState("expense");
  const [newSub, setNewSub] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [msg, setMsg] = useState("");
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState(null);
  const [confirmDeleteSaving, setConfirmDeleteSaving] = useState(null);
  const [confirmDeleteHead, setConfirmDeleteHead] = useState(null);
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState(null);
  const [collapsedCatHeads, setCollapsedCatHeads] = useState(() => new Set());
  const toggleCatHead = (name) => setCollapsedCatHeads((set) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const [mergePreview, setMergePreview] = useState(null);

  const scanForMiscategorized = () => {
    const merges = findMiscategorizedMerges(cats);
    if (!merges) { note("No miscategorized categories found — everything looks tidy."); return; }
    setMergePreview(merges);
  };
  const applyCleanup = () => {
    const { cats: newCats, txns: newTxns, budgets: newBudgets } = applyMiscategorizedMerges(mergePreview, cats, txns, budgets);
    persistCats(newCats); persistTxns(newTxns); persistBudgets(newBudgets);
    note(`Merged ${mergePreview.length} categor${mergePreview.length !== 1 ? "ies" : "y"}.`);
    setMergePreview(null);
  };

  const [structurePreview, setStructurePreview] = useState(null);
  const previewNewStructure = () => setStructurePreview(migrateToNewCategoryStructure(cats, txns, budgets));
  const applyNewStructure = () => {
    persistCats(structurePreview.cats); persistTxns(structurePreview.txns); persistBudgets(structurePreview.budgets);
    note("Category structure updated.");
    setStructurePreview(null);
  };

  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("0");
  const [newBudgetHead, setNewBudgetHead] = useState("");
  const [newBudgetLimit, setNewBudgetLimit] = useState("");
  const [newSavingName, setNewSavingName] = useState("");
  const [newSavingTarget, setNewSavingTarget] = useState("");
  const [newSavingDate, setNewSavingDate] = useState("");

  const usedByHead = (h) => txns.filter((t) => t.head === h).length;
  const usedBySub = (h, s) => txns.filter((t) => t.head === h && t.cat === s).length;
  const usedByBudget = (h) => budgets.some((b) => b.head === h);
  const usedByWallet = (id) => txns.filter((t) => t.walletId === id).length;
  const usedBySaving = (id) => txns.filter((t) => t.savingSpaceId === id).length;
  const note = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2600); };

  const addHead = () => {
    const name = newHead.trim();
    if (!name) return;
    if (cats.heads.some((h) => h.name.toLowerCase() === name.toLowerCase())) { note("That category already exists."); return; }
    persistCats({
      heads: [...cats.heads, { name, color: newHeadColor, kind: newHeadKind }],
      subcats: { ...cats.subcats, [name]: [] },
    });
    setNewHead("");
  };

  const deleteHead = (name) => {
    if (usedByHead(name) > 0) { note(`"${name}" is used by ${usedByHead(name)} transaction(s) — reassign them first.`); return; }
    if (usedByBudget(name)) { note(`"${name}" has a budget set — delete that budget first.`); return; }
    const { [name]: _, ...rest } = cats.subcats;
    persistCats({ heads: cats.heads.filter((h) => h.name !== name), subcats: rest });
  };

  const setColor = (name, color) =>
    persistCats({ ...cats, heads: cats.heads.map((h) => (h.name === name ? { ...h, color } : h)) });

  const addSub = (headName) => {
    const s = (newSub[headName] || "").trim();
    if (!s) return;
    const list = cats.subcats[headName] || [];
    if (list.some((x) => x.toLowerCase() === s.toLowerCase())) { note("That subcategory already exists."); return; }
    persistCats({ ...cats, subcats: { ...cats.subcats, [headName]: [...list, s] } });
    setNewSub({ ...newSub, [headName]: "" });
  };

  const deleteSub = (headName, s) => {
    if (usedBySub(headName, s) > 0) { note(`"${s}" is used by ${usedBySub(headName, s)} transaction(s) — reassign them first.`); return; }
    persistCats({ ...cats, subcats: { ...cats.subcats, [headName]: cats.subcats[headName].filter((x) => x !== s) } });
  };

  const commitRename = () => {
    const v = renaming.value.trim();
    if (!v) { setRenaming(null); return; }
    if (renaming.kind === "head") {
      const old = renaming.head;
      if (v !== old && cats.heads.some((h) => h.name.toLowerCase() === v.toLowerCase())) { note("A category with that name already exists."); return; }
      const { [old]: subs, ...rest } = cats.subcats;
      persistCats({
        heads: cats.heads.map((h) => (h.name === old ? { ...h, name: v } : h)),
        subcats: { ...rest, [v]: subs || [] },
      });
      persistTxns(txns.map((t) => (t.head === old ? { ...t, head: v } : t)));
      if (budgets.some((b) => b.head === old)) persistBudgets(budgets.map((b) => (b.head === old ? { ...b, head: v } : b)));
      note("Renamed — existing transactions and budgets updated too.");
    } else if (renaming.kind === "sub") {
      const { head, sub } = renaming;
      if (v !== sub && (cats.subcats[head] || []).some((x) => x.toLowerCase() === v.toLowerCase())) { note("That subcategory already exists."); return; }
      persistCats({ ...cats, subcats: { ...cats.subcats, [head]: cats.subcats[head].map((x) => (x === sub ? v : x)) } });
      persistTxns(txns.map((t) => (t.head === head && t.cat === sub ? { ...t, cat: v } : t)));
      note("Renamed — existing transactions updated too.");
    } else if (renaming.kind === "wallet") {
      persistWallets(wallets.map((w) => (w.id === renaming.id ? { ...w, name: v } : w)));
      note("Wallet renamed.");
    } else if (renaming.kind === "saving") {
      persistSavings(savings.map((s) => (s.id === renaming.id ? { ...s, name: v } : s)));
      note("Saving space renamed.");
    }
    setRenaming(null);
  };

  const group = (kind) => cats.heads.filter((h) => h.kind === kind);

  const addWallet = () => {
    const name = newWalletName.trim();
    if (!name) return;
    if (wallets.length >= MAX_WALLETS) { note(`Maximum of ${MAX_WALLETS} wallets reached — delete one to add another.`); return; }
    persistWallets([...wallets, { id: uid(), name, color: SWATCHES[wallets.length % SWATCHES.length], startingBalance: parseFloat(newWalletBalance) || 0 }]);
    setNewWalletName(""); setNewWalletBalance("0");
  };
  const deleteWallet = (id) => {
    if (wallets.length <= 1) { note("You need at least one wallet."); return; }
    if (usedByWallet(id) > 0) { note(`This wallet is used by ${usedByWallet(id)} transaction(s) — reassign them first.`); return; }
    persistWallets(wallets.filter((w) => w.id !== id));
  };
  const setWalletColor = (id, color) => persistWallets(wallets.map((w) => (w.id === id ? { ...w, color } : w)));
  const setWalletStart = (id, val) => persistWallets(wallets.map((w) => (w.id === id ? { ...w, startingBalance: parseFloat(val) || 0 } : w)));

  const expenseHeadsNotBudgeted = cats.heads.filter((h) => h.kind === "expense" && !budgets.some((b) => b.head === h.name));
  const addBudget = () => {
    const limit = parseFloat(newBudgetLimit);
    if (!newBudgetHead || !limit || limit <= 0) { note("Pick a category and a limit greater than zero."); return; }
    if (budgets.length >= MAX_BUDGETS) { note(`Maximum of ${MAX_BUDGETS} budgets reached — delete one to add another.`); return; }
    persistBudgets([...budgets, { id: uid(), head: newBudgetHead, limit }]);
    setNewBudgetHead(""); setNewBudgetLimit("");
  };
  const deleteBudget = (id) => persistBudgets(budgets.filter((b) => b.id !== id));
  const setBudgetLimit = (id, val) => persistBudgets(budgets.map((b) => (b.id === id ? { ...b, limit: parseFloat(val) || 0 } : b)));

  const addSaving = () => {
    const name = newSavingName.trim();
    const target = parseFloat(newSavingTarget);
    if (!name || !target || target <= 0) { note("Enter a name and a target greater than zero."); return; }
    if (savings.length >= MAX_SAVINGS) { note(`Maximum of ${MAX_SAVINGS} saving spaces reached — delete one to add another.`); return; }
    persistSavings([...savings, { id: uid(), name, target, targetDate: newSavingDate, color: SWATCHES[savings.length % SWATCHES.length] }]);
    setNewSavingName(""); setNewSavingTarget(""); setNewSavingDate("");
  };
  const deleteSaving = (id) => {
    if (usedBySaving(id) > 0) { note(`This saving space is used by ${usedBySaving(id)} transaction(s) — reassign them first.`); return; }
    persistSavings(savings.filter((s) => s.id !== id));
  };
  const setSavingTarget = (id, val) => persistSavings(savings.map((s) => (s.id === id ? { ...s, target: parseFloat(val) || 0 } : s)));
  const setSavingTargetDate = (id, val) => persistSavings(savings.map((s) => (s.id === id ? { ...s, targetDate: val } : s)));

  const saveDailyLimit = () => persistDailyLimit(parseFloat(dailyLimitInput) || 0);

  return (
    <main style={{ ...S.main, maxWidth: 900 }}>
    <div className="mobileOnly pageTitleLg" style={{ color: T.text, marginBottom: 16 }}>Settings</div>
    <div className="settingsLayout" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      <div style={S.settingsTabBar}>
        {SETTINGS_TABS.map((t) => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            style={{ ...S.settingsTabBtn, ...(settingsTab === t.key ? S.settingsTabBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
      {msg && <div style={S.settingsMsg}>{msg}</div>}

      {settingsTab === "profile" && <ProfileFields profile={profile} persistProfile={persistProfile} onResetData={onResetData}
        txns={txns} wallets={wallets} currency={profile.currency} cats={cats} persistCats={persistCats} persistTxns={persistTxns} />}

      {settingsTab === "logout" && (
        <div style={S.formCard}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Log out</div>
          <div style={{ fontSize: 12.5, color: T.mut2, marginBottom: 18 }}>
            Signed in as {profile.email || profile.name || "You"}. Your data stays on this device.
          </div>
          <button onClick={onLogout} style={{ ...S.primaryBtn, marginTop: 0, background: T.rose }}>Log out</button>
        </div>
      )}

      {settingsTab === "limit" && (
        <>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Daily limit</div>
          <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
            Shown on the dashboard as a running check against today's spending.
          </div>
          <section style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input className="field" type="number" placeholder="e.g. 3000" value={dailyLimitInput}
                onChange={(e) => setDailyLimitInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDailyLimit()}
                style={{ ...S.input, width: 160 }} />
              <button className="primaryBtn" onClick={saveDailyLimit} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>
                {dailyLimit > 0 ? "Update limit" : "Set limit"}
              </button>
              {dailyLimit > 0 && (
                <button onClick={() => { persistDailyLimit(0); setDailyLimitInput(""); }} style={S.tinyBtn}>Turn off</button>
              )}
            </div>
          </section>
        </>
      )}

      {settingsTab === "categories" && (
      <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Categories</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 12 }}>
        Rename anything and existing transactions update with it. Deleting is only possible when nothing uses the category.
      </div>

      <div style={{ background: T.mintSoft, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Update to the new category structure</div>
        <div style={{ fontSize: 12, color: T.mut2, marginBottom: 10 }}>
          Replaces your categories with the standard set (Housing &amp; Utilities, Transportation, Food &amp; Dining, and so on) and moves your existing transactions and budgets onto it automatically. Anything custom you've added that isn't part of the standard set is kept as-is.
        </div>
        {!structurePreview ? (
          <button onClick={previewNewStructure} style={S.tinyBtn}>Preview the update</button>
        ) : (
          <div>
            <div style={{ fontSize: 12.5, color: T.text, marginBottom: 8 }}>
              This will set up {structurePreview.cats.heads.length} main categories and remap {structurePreview.txns.filter((t, i) => t !== txns[i]).length} existing transaction{structurePreview.txns.length !== 1 ? "s" : ""}.
              {structurePreview.kept.length > 0 && <> Kept as-is: {structurePreview.kept.join(", ")}.</>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={applyNewStructure} className="primaryBtn" style={{ ...S.primaryBtn, marginTop: 0, padding: "8px 16px" }}>Apply update</button>
              <button onClick={() => setStructurePreview(null)} style={S.tinyBtn}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, marginBottom: 22 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Clean up miscategorized data</div>
        <div style={{ fontSize: 12, color: T.mut2, marginBottom: 10 }}>
          Finds main categories that are actually subcategories of another main category (often left over from an older import) and merges them in.
        </div>
        {!mergePreview ? (
          <button onClick={scanForMiscategorized} style={S.tinyBtn}>Scan for miscategorized data</button>
        ) : (
          <div>
            <div style={{ fontSize: 12.5, color: T.text, marginBottom: 8 }}>
              Found {mergePreview.length} categor{mergePreview.length !== 1 ? "ies" : "y"} to merge:
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {mergePreview.map((m, i) => <li key={i}>"{m.from}" → merges into "{m.to}"</li>)}
              </ul>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={applyCleanup} className="primaryBtn" style={{ ...S.primaryBtn, marginTop: 0, padding: "8px 16px" }}>Apply cleanup</button>
              <button onClick={() => setMergePreview(null)} style={S.tinyBtn}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {["expense", "income"].map((kind) => (
        <section key={kind} style={{ marginBottom: 26 }}>
          <div style={{ ...S.kicker2, marginBottom: 10 }}>{kind === "expense" ? "EXPENSE CATEGORIES" : "INCOME CATEGORIES"}</div>
          {group(kind).map((h) => (
            <div key={h.name} style={S.headBlock}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <ColorPicker value={h.color} onChange={(c) => setColor(h.name, c)} title="Category color"
                  usedColors={cats.heads.filter((x) => x.name !== h.name).map((x) => x.color)} />
                {renaming?.kind === "head" && renaming.head === h.name ? (
                  <input className="field" autoFocus value={renaming.value}
                    onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && commitRename()}
                    onBlur={commitRename} style={{ ...S.input, ...S.inputSm }} />
                ) : (
                  <button type="button" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer", background: "none", border: "none", padding: 0, color: "inherit" }}
                    onClick={() => setRenaming({ kind: "head", head: h.name, value: h.name })} title="Click to rename" aria-label={`Rename category ${h.name}`}>
                    {h.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
                  </button>
                )}
                <span style={{ fontSize: 11, color: T.mut2 }}>{usedByHead(h.name)} txns</span>
                {confirmDeleteHead === h.name ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: T.mut }}>
                    Delete?
                    <button onClick={() => { deleteHead(h.name); setConfirmDeleteHead(null); }} aria-label={`Confirm delete category ${h.name}`}
                      style={{ ...S.tinyBtn, color: "#fff", background: T.rose, borderColor: T.rose }}>✓</button>
                    <button onClick={() => setConfirmDeleteHead(null)} aria-label="Cancel delete" style={S.tinyBtn}>✕</button>
                  </span>
                ) : (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                    <button onClick={() => toggleCatHead(h.name)} aria-label={collapsedCatHeads.has(h.name) ? `Expand ${h.name}` : `Collapse ${h.name}`}
                      aria-expanded={!collapsedCatHeads.has(h.name)}
                      className={`statChevron${collapsedCatHeads.has(h.name) ? "" : " open"}`} style={{ position: "static" }}>
                      <IconChevronDown />
                    </button>
                    <button onClick={() => setConfirmDeleteHead(h.name)} style={S.tinyBtn}
                      aria-label={`Delete category ${h.name}`}
                      title={usedByHead(h.name) ? "In use — reassign transactions first" : "Delete category"}>✕</button>
                  </span>
                )}
              </div>
              <div className={`statSubWrap${collapsedCatHeads.has(h.name) ? "" : " open"}`}>
                <div className="statSubInner">
                  <div style={{ ...S.chipWrap, marginTop: 10 }}>
                    {(cats.subcats[h.name] || []).map((s) =>
                      renaming?.kind === "sub" && renaming.head === h.name && renaming.sub === s ? (
                        <input key={s} className="field" autoFocus value={renaming.value}
                          onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && commitRename()}
                          onBlur={commitRename} style={{ ...S.input, ...S.inputSm, width: 130 }} />
                      ) : (
                        <span key={s} className="chip" style={{ ...S.chip, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <button type="button" style={{ cursor: "pointer", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit" }} title="Click to rename"
                            aria-label={`Rename subcategory ${s}`}
                            onClick={() => setRenaming({ kind: "sub", head: h.name, sub: s, value: s })}>{s}</button>
                          <button type="button" onClick={() => deleteSub(h.name, s)} style={{ cursor: "pointer", color: T.mut2, background: "none", border: "none", padding: 0 }}
                            aria-label={`Delete subcategory ${s}`}
                            title={usedBySub(h.name, s) ? "In use" : "Delete"}>✕</button>
                        </span>
                      )
                    )}
                    <input className="field" placeholder="+ Add subcategory" value={newSub[h.name] || ""}
                      onChange={(e) => setNewSub({ ...newSub, [h.name]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && addSub(h.name)}
                      style={{ ...S.input, ...S.inputSm, width: 150 }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}

      <section style={{ marginBottom: 26 }}>
        <div style={{ ...S.kicker2, marginBottom: 10 }}>ADD A NEW CATEGORY</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <ColorPicker value={newHeadColor} onChange={setNewHeadColor} title="Category color"
            usedColors={cats.heads.map((x) => x.color)} />
          <input className="field" placeholder="Category name (e.g. Travel, Freelance)" value={newHead}
            onChange={(e) => setNewHead(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addHead()}
            style={{ ...S.input, flex: "1 1 180px" }} />
          <select className="field" value={newHeadKind} onChange={(e) => setNewHeadKind(e.target.value)} style={S.input}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
          <button className="primaryBtn" onClick={addHead} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>Add</button>
        </div>
      </section>
      </>
      )}

      {settingsTab === "wallets" && (
      <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Wallets</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
        Every transaction belongs to a wallet. {wallets.length}/{MAX_WALLETS} used.
      </div>
      {wallets.map((w) => (
        <div key={w.id} style={S.headBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ColorPicker value={w.color} onChange={(c) => setWalletColor(w.id, c)} title="Wallet color"
              usedColors={wallets.filter((x) => x.id !== w.id).map((x) => x.color)} />
            {renaming?.kind === "wallet" && renaming.id === w.id ? (
              <input className="field" autoFocus value={renaming.value}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                onBlur={commitRename} style={{ ...S.input, ...S.inputSm }} />
            ) : (
              <button type="button" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer", background: "none", border: "none", padding: 0, color: "inherit" }}
                onClick={() => setRenaming({ kind: "wallet", id: w.id, value: w.name })} title="Click to rename" aria-label={`Rename wallet ${w.name}`}>
                {w.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
              </button>
            )}
            <span style={{ fontSize: 11, color: T.mut2 }}>{usedByWallet(w.id)} txns</span>
            {confirmDeleteWallet === w.id ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: T.mut }}>
                Delete?
                <button onClick={() => { deleteWallet(w.id); setConfirmDeleteWallet(null); }} aria-label={`Confirm delete wallet ${w.name}`}
                  style={{ ...S.tinyBtn, color: "#fff", background: T.rose, borderColor: T.rose }}>✓</button>
                <button onClick={() => setConfirmDeleteWallet(null)} aria-label="Cancel delete" style={S.tinyBtn}>✕</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteWallet(w.id)} style={{ ...S.tinyBtn, marginLeft: "auto" }}
                aria-label={`Delete wallet ${w.name}`}
                title={wallets.length <= 1 ? "At least one wallet is required" : usedByWallet(w.id) ? "In use — reassign transactions first" : "Delete wallet"}>✕</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: T.mut2 }}>Starting balance</span>
            <input className="field" type="number" value={w.startingBalance}
              onChange={(e) => setWalletStart(w.id, e.target.value)} style={{ ...S.input, ...S.inputSm, width: 120 }} />
          </div>
        </div>
      ))}
      {wallets.length < MAX_WALLETS && (
        <section style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="field" placeholder="Wallet name (e.g. Bank account)" value={newWalletName}
              onChange={(e) => setNewWalletName(e.target.value)} style={{ ...S.input, flex: "1 1 180px" }} />
            <input className="field" type="number" placeholder="Starting balance" value={newWalletBalance}
              onChange={(e) => setNewWalletBalance(e.target.value)} style={{ ...S.input, width: 150 }} />
            <button className="primaryBtn" onClick={addWallet} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>Add</button>
          </div>
        </section>
      )}
      {wallets.length >= MAX_WALLETS && <div style={{ fontSize: 12, color: T.mut2, marginBottom: 26 }}>Maximum reached — delete a wallet to add another.</div>}
      </>
      )}

      {settingsTab === "budgets" && (
      <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Budgets</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
        One limit per category, compared against real spending. {budgets.length}/{MAX_BUDGETS} used.
      </div>
      {budgets.map((b) => (
        <div key={b.id} style={S.headBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ ...S.catDot, background: catColor(b.head) }} />
            <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5 }}>{b.head}</span>
            <span style={{ fontSize: 12, color: T.mut2 }}>limit</span>
            <input className="field" type="number" value={b.limit}
              onChange={(e) => setBudgetLimit(b.id, e.target.value)} style={{ ...S.input, ...S.inputSm, width: 120 }} />
            {confirmDeleteBudget === b.id ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: T.mut }}>
                Delete?
                <button onClick={() => { deleteBudget(b.id); setConfirmDeleteBudget(null); }} aria-label={`Confirm delete budget for ${b.head}`}
                  style={{ ...S.tinyBtn, color: "#fff", background: T.rose, borderColor: T.rose }}>✓</button>
                <button onClick={() => setConfirmDeleteBudget(null)} aria-label="Cancel delete" style={S.tinyBtn}>✕</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteBudget(b.id)} aria-label={`Delete budget for ${b.head}`}
                style={{ ...S.tinyBtn, marginLeft: "auto" }} title="Delete budget">✕</button>
            )}
          </div>
        </div>
      ))}
      {budgets.length < MAX_BUDGETS && (
        expenseHeadsNotBudgeted.length === 0 ? (
          <div style={{ fontSize: 12, color: T.mut2, marginBottom: 26 }}>Every expense category already has a budget.</div>
        ) : (
          <section style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select className="field" value={newBudgetHead} onChange={(e) => setNewBudgetHead(e.target.value)} style={S.input}>
                <option value="">Choose category…</option>
                {expenseHeadsNotBudgeted.map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}
              </select>
              <input className="field" type="number" placeholder={`Limit (${profile.currency})`} value={newBudgetLimit}
                onChange={(e) => setNewBudgetLimit(e.target.value)} style={{ ...S.input, width: 140 }} />
              <button className="primaryBtn" onClick={addBudget} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>Add</button>
            </div>
          </section>
        )
      )}
      {budgets.length >= MAX_BUDGETS && <div style={{ fontSize: 12, color: T.mut2, marginBottom: 26 }}>Maximum reached — delete a budget to add another.</div>}
      </>
      )}

      {settingsTab === "savings" && (
      <>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Saving spaces</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 14 }}>
        Tag any transaction to a space to count it toward the goal. {savings.length}/{MAX_SAVINGS} used.
      </div>
      {savings.map((s) => (
        <div key={s.id} style={S.headBlock}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {renaming?.kind === "saving" && renaming.id === s.id ? (
              <input className="field" autoFocus value={renaming.value}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && commitRename()}
                onBlur={commitRename} style={{ ...S.input, ...S.inputSm }} />
            ) : (
              <button type="button" style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer", background: "none", border: "none", padding: 0, color: "inherit" }}
                onClick={() => setRenaming({ kind: "saving", id: s.id, value: s.name })} title="Click to rename" aria-label={`Rename saving space ${s.name}`}>
                {s.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
              </button>
            )}
            <span style={{ fontSize: 12, color: T.mut2 }}>target</span>
            <input className="field" type="number" value={s.target}
              onChange={(e) => setSavingTarget(s.id, e.target.value)} style={{ ...S.input, ...S.inputSm, width: 120 }} />
            <span style={{ fontSize: 12, color: T.mut2 }}>by</span>
            <input className="field" type="date" value={s.targetDate || ""}
              onChange={(e) => setSavingTargetDate(s.id, e.target.value)} style={{ ...S.input, ...S.inputSm, width: 150 }} />
            <span style={{ fontSize: 11, color: T.mut2 }}>{usedBySaving(s.id)} txns</span>
            {confirmDeleteSaving === s.id ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: T.mut }}>
                Delete?
                <button onClick={() => { deleteSaving(s.id); setConfirmDeleteSaving(null); }} aria-label={`Confirm delete saving space ${s.name}`}
                  style={{ ...S.tinyBtn, color: "#fff", background: T.rose, borderColor: T.rose }}>✓</button>
                <button onClick={() => setConfirmDeleteSaving(null)} aria-label="Cancel delete" style={S.tinyBtn}>✕</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteSaving(s.id)} style={{ ...S.tinyBtn, marginLeft: "auto" }}
                aria-label={`Delete saving space ${s.name}`}
                title={usedBySaving(s.id) ? "In use — reassign transactions first" : "Delete"}>✕</button>
            )}
          </div>
        </div>
      ))}
      {savings.length < MAX_SAVINGS ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="field" placeholder="Goal name (e.g. Emergency fund)" value={newSavingName}
            onChange={(e) => setNewSavingName(e.target.value)} style={{ ...S.input, flex: "1 1 180px" }} />
          <input className="field" type="number" placeholder={`Target (${profile.currency})`} value={newSavingTarget}
            onChange={(e) => setNewSavingTarget(e.target.value)} style={{ ...S.input, width: 140 }} />
          <input className="field" type="date" value={newSavingDate}
            onChange={(e) => setNewSavingDate(e.target.value)} style={{ ...S.input, width: 150 }} />
          <button className="primaryBtn" onClick={addSaving} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>Add</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.mut2 }}>Maximum reached — delete a saving space to add another.</div>
      )}
      </>
      )}
      </div>
    </div>
    </main>
  );
}

const DOB_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DOB_YEARS = Array.from({ length: 90 }, (_, i) => new Date().getFullYear() - i);

function ProfileFields({ profile, persistProfile, onResetData, txns, wallets, currency, cats, persistCats, persistTxns }) {
  const [form, setForm] = useState(profile);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileInputRef = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const initials = (form.name || "Y").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const pickFile = () => fileInputRef.current?.click();
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ avatar: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const save = () => {
    persistProfile({ ...form, name: form.name.trim() || "You", email: form.email.trim() });
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  const setTheme = (value) => {
    set({ theme: value });
    persistProfile({ ...form, theme: value });
  };

  return (
    <div style={{ ...S.formCard, maxWidth: 560 }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Account settings</div>

      <label style={S.label}>Profile photo</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: form.color, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: T.dark }}>
          {form.avatar ? <img src={form.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        <button onClick={pickFile} style={S.uploadAvatarBtn}><IconUpload /> Upload Avatar</button>
        {form.avatar && (
          <button onClick={() => set({ avatar: "" })} title="Remove photo" aria-label="Remove photo" style={S.deleteAvatarBtn}><IconTrash /></button>
        )}
      </div>

      <label style={S.label}>Name</label>
      <input className="field" value={form.name} onChange={(e) => set({ name: e.target.value })} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px", minWidth: 0 }}>
          <label style={S.label}>Sex (optional)</label>
          <select className="field" value={form.sex} onChange={(e) => set({ sex: e.target.value })} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
            <option value="">Prefer not to say</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <label style={S.label}>Date of birth (optional)</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select className="field" value={form.dobDay} onChange={(e) => set({ dobDay: e.target.value })} style={{ ...S.input, flex: "1 1 70px", minWidth: 0 }}>
              <option value="">Day</option>
              {DOB_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="field" value={form.dobMonth} onChange={(e) => set({ dobMonth: e.target.value })} style={{ ...S.input, flex: "1.4 1 90px", minWidth: 0 }}>
              <option value="">Month</option>
              {MONTH_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="field" value={form.dobYear} onChange={(e) => set({ dobYear: e.target.value })} style={{ ...S.input, flex: "1 1 70px", minWidth: 0 }}>
              <option value="">Year</option>
              {DOB_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <label style={S.label}>Email address</label>
      <input className="field" type="email" placeholder="you@example.com" value={form.email}
        onChange={(e) => set({ email: e.target.value })} style={{ ...S.input, width: "100%" }} />

      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, marginTop: 22, marginBottom: 4 }}>Appearance</div>
      <label style={S.label}>Theme</label>
      <div style={{ ...S.segment, maxWidth: 320 }}>
        {THEME_OPTIONS.map((t) => (
          <button key={t.value} type="button" onClick={() => setTheme(t.value)}
            style={{ ...S.segBtn, flex: 1, ...((form.theme || "system") === t.value ? S.segBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.mut2, marginTop: 4, marginBottom: 4 }}>"System" follows your device's light/dark setting automatically.</div>

      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, marginTop: 22, marginBottom: 4 }}>Localization settings</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <label style={S.label}>Account currency</label>
          <select className="field" value={form.currency} onChange={(e) => set({ currency: e.target.value })} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
            {CURRENCY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div style={{ fontSize: 11, color: T.mut2, marginTop: 4 }}>Just relabels your numbers — amounts aren't converted between currencies.</div>
        </div>
        <div style={{ flex: "1 1 140px", minWidth: 0 }}>
          <label style={S.label}>Language</label>
          <select className="field" value={form.language} onChange={(e) => set({ language: e.target.value })} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
            {LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <div style={{ fontSize: 11, color: T.mut2, marginTop: 4 }}>Saved with your profile — the app's interface stays in English for now.</div>
        </div>
      </div>

      {saved && <div style={{ color: T.darkSoft, fontSize: 12, marginTop: 12 }}>✓ Settings updated</div>}
      <button className="primaryBtn" onClick={save} style={S.primaryBtn}>Update my settings</button>

      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, marginTop: 22, marginBottom: 4 }}>Data Management</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 10 }}>Download or import your transactions as a CSV or Excel file.</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setExportOpen(true)} style={S.uploadAvatarBtn}><IconUpload /> Export data</button>
        <button onClick={() => setImportOpen(true)} style={{ ...S.uploadAvatarBtn, background: T.surface2, color: T.text }}><IconDownload /> Import data</button>
      </div>

      {exportOpen && (
        <Modal onClose={() => setExportOpen(false)}>
          <ExportDataForm txns={txns} wallets={wallets} currency={currency} onClose={() => setExportOpen(false)} />
        </Modal>
      )}
      {importOpen && (
        <Modal onClose={() => setImportOpen(false)}>
          <ImportDataForm cats={cats} wallets={wallets} txns={txns} persistCats={persistCats} persistTxns={persistTxns} onClose={() => setImportOpen(false)} />
        </Modal>
      )}

      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 22, paddingTop: 16, textAlign: "right" }}>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={S.deleteAccountLink}>Reset my data</button>
        ) : (
          <span style={{ fontSize: 12.5, color: T.mut }}>
            This permanently erases every transaction, wallet, budget, and saving space, then signs you out. Your login itself isn't deleted — you can sign back in to a fresh, empty account. Are you sure?{" "}
            <button onClick={onResetData} style={{ ...S.deleteAccountLink, color: T.rose, fontWeight: 700 }}>Yes, reset everything</button>
            {" · "}
            <button onClick={() => setConfirmDel(false)} style={S.deleteAccountLink}>Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}

function ExportDataForm({ txns, wallets, currency, onClose }) {
  const [walletId, setWalletId] = useState("all");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [format, setFormat] = useState("csv");

  const periodRange = () => {
    if (period === "month") return currentMonthRange();
    if (period === "year") { const y = new Date().getFullYear(); return [`${y}-01-01`, `${y}-12-31`]; }
    if (period === "custom") return [from || "0000-01-01", to || "9999-12-31"];
    return null;
  };

  const runExport = () => {
    const range = periodRange();
    const filtered = txns.filter((t) =>
      (walletId === "all" || t.walletId === walletId) &&
      (!range || (t.date >= range[0] && t.date <= range[1]))
    );
    const rows = transactionsToRows(filtered, wallets, currency);
    const stamp = iso(new Date());
    if (format === "csv") downloadText(rowsToCSV(rows), `transactions-${stamp}.csv`, "text/csv;charset=utf-8;");
    else downloadBlob(rowsToXLSXBlob(rows), `transactions-${stamp}.xlsx`);
    onClose();
  };

  return (
    <div style={{ width: 380, maxWidth: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, marginBottom: 16 }}>Export data</div>

      <label style={S.label}>Wallet</label>
      <select className="field" value={walletId} onChange={(e) => setWalletId(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
        <option value="all">All wallets</option>
        {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>

      <label style={S.label}>Period</label>
      <select className="field" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }}>
        <option value="all">All time</option>
        <option value="month">This month</option>
        <option value="year">This year</option>
        <option value="custom">Custom range</option>
      </select>
      {period === "custom" && (
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={S.label}>From</label>
            <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={S.label}>To</label>
            <input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
      )}

      <label style={S.label}>Format</label>
      <div style={S.segment}>
        <button onClick={() => setFormat("csv")} style={{ ...S.segBtn, flex: 1, ...(format === "csv" ? S.segBtnActive : {}) }}>CSV</button>
        <button onClick={() => setFormat("xlsx")} style={{ ...S.segBtn, flex: 1, ...(format === "xlsx" ? S.segBtnActive : {}) }}>Excel (.xlsx)</button>
      </div>

      <button className="primaryBtn" onClick={runExport} style={S.primaryBtn}>Export data</button>
    </div>
  );
}

function ImportDataForm({ cats, wallets, txns, persistCats, persistTxns, onClose }) {
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const pickFile = () => fileInputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setStatus("parsing");
    setErrMsg("");
    try {
      const rows = await parseImportFile(file);
      if (!rows.length) throw new Error("No data rows found in this file.");
      const built = buildTxnsFromImportRows(rows, cats, wallets);
      setResult(built);
      setStatus("ready");
    } catch (err) {
      setErrMsg(err.message || "Couldn't read that file.");
      setStatus("error");
    }
  };

  const confirmImport = () => {
    if (!result || result.txns.length === 0) return;
    if (result.newHeads.length || result.newSubcats.length) persistCats(result.cats);
    persistTxns([...txns, ...result.txns].sort((a, b) => a.date.localeCompare(b.date)));
    setStatus("done");
  };

  return (
    <div style={{ width: 420, maxWidth: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Import data</div>
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 16 }}>
        Use a CSV or Excel file with the same columns as an exported sheet: Date, Type, Category, Subcategory, Note, Wallet, Amount, Currency.
      </div>

      {status === "done" ? (
        <>
          <div style={{ color: T.darkSoft, fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>
            ✓ Imported {result.txns.length} transaction{result.txns.length !== 1 ? "s" : ""}.
          </div>
          <button className="primaryBtn" onClick={onClose} style={S.primaryBtn}>Done</button>
        </>
      ) : (
        <>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx" onChange={onFile} style={{ display: "none" }} />
          <button onClick={pickFile} style={{ ...S.uploadAvatarBtn, alignSelf: "flex-start" }}><IconUpload /> Choose file</button>
          {fileName && <div style={{ fontSize: 12, color: T.mut, marginTop: 8 }}>{fileName}</div>}

          {status === "parsing" && <div style={{ fontSize: 12.5, color: T.mut2, marginTop: 12 }}>Reading file…</div>}
          {status === "error" && <div style={{ fontSize: 12.5, color: T.rose, marginTop: 12 }}>{errMsg}</div>}

          {status === "ready" && result && (
            <div style={{ marginTop: 16, fontSize: 12.5, color: T.mut, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>
                {result.txns.length} transaction{result.txns.length !== 1 ? "s" : ""} ready to import
              </div>
              {result.newHeads.length > 0 && <div>New categories: {result.newHeads.join(", ")}</div>}
              {result.newSubcats.length > 0 && <div>New subcategories: {result.newSubcats.join(", ")}</div>}
              {result.defaultedWallets > 0 && (
                <div style={{ color: T.gold }}>{result.defaultedWallets} row(s) had an unrecognized wallet — defaulted to "{wallets[0]?.name}".</div>
              )}
              {result.errors.length > 0 && (
                <div style={{ color: T.rose }}>
                  {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped:
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {result.errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
                    {result.errors.length > 6 && <li>+{result.errors.length - 6} more</li>}
                  </ul>
                </div>
              )}
              <button className="primaryBtn" onClick={confirmImport} style={S.primaryBtn} disabled={result.txns.length === 0}>
                Import {result.txns.length} transaction{result.txns.length !== 1 ? "s" : ""}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Modal({ children, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modalBack" style={S.modalBack} onClick={onClose}>
      <div className="modalCard" role="dialog" aria-modal="true" style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div className="sheetHandle mobileOnly" />
        <button onClick={onClose} style={S.modalClose} title="Close" aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}

const SWATCHES = [
  "#2E9B8F", "#4A90A4", "#5B8DEF", "#118AB2",
  "#06D6A0", "#4FB878", "#7FE6A0", "#8FA88E",
  "#FFD166", "#E0A93F", "#E8B04B", "#FF8C42",
  "#EF476F", "#EF5A6F", "#F15BB5", "#9B5DE5",
  "#A97FC0", "#C77DFF", "#073B4C", "#00BBF9",
];

const clamp01 = (n) => Math.min(1, Math.max(0, n));
function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return { r: parseInt(m.substring(0, 2), 16), g: parseInt(m.substring(2, 4), 16), b: parseInt(m.substring(4, 6), 16) };
}
function rgbToHex(r, g, b) {
  const h = (n) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100 };
}
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}
const hexToHsv = (hex) => (/^#[0-9A-Fa-f]{6}$/.test(hex) ? (({ r, g, b }) => rgbToHsv(r, g, b))(hexToRgb(hex)) : { h: 0, s: 0, v: 0 });
const hsvToHex = (h, s, v) => (({ r, g, b }) => rgbToHex(r, g, b))(hsvToRgb(h, s, v));

function ColorWheel({ hex, onChange }) {
  const [hsv, setHsv] = useState(() => hexToHsv(hex));
  const lastEmitted = useRef(hex);
  const squareRef = useRef(null);
  const hueRef = useRef(null);

  useEffect(() => {
    if (hex.toLowerCase() !== lastEmitted.current.toLowerCase()) {
      lastEmitted.current = hex;
      setHsv(hexToHsv(hex));
    }
  }, [hex]);

  useEffect(() => {
    const h = hsvToHex(hsv.h, hsv.s, hsv.v);
    if (h.toLowerCase() !== lastEmitted.current.toLowerCase()) {
      lastEmitted.current = h;
      onChange(h);
    }
  }, [hsv]);

  const dragSquare = (e) => {
    const rect = squareRef.current.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setHsv((prev) => ({ ...prev, s: x * 100, v: (1 - y) * 100 }));
  };
  const dragHue = (e) => {
    const rect = hueRef.current.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    setHsv((prev) => ({ ...prev, h: x * 360 }));
  };

  const pureHue = hsvToHex(hsv.h, 100, 100);

  return (
    <div>
      <div ref={squareRef} style={{ ...S.wheelSquare, background: pureHue }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragSquare(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) dragSquare(e); }}>
        <div style={S.wheelSquareWhite} />
        <div style={S.wheelSquareBlack} />
        <div style={{ ...S.wheelCursor, left: `${hsv.s}%`, top: `${100 - hsv.v}%`, background: hsvToHex(hsv.h, hsv.s, hsv.v) }} />
      </div>
      <div ref={hueRef} style={S.wheelHueTrack}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragHue(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) dragHue(e); }}>
        <div style={{ ...S.wheelHueThumb, left: `${(hsv.h / 360) * 100}%`, background: pureHue }} />
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange, title, usedColors }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("suggested");
  const [hex, setHex] = useState(value);

  const openPicker = () => { setHex(value); setOpen(true); };
  const commitHex = (v) => {
    let h = v.trim();
    if (h && !h.startsWith("#")) h = "#" + h;
    setHex(h);
    if (/^#[0-9A-Fa-f]{6}$/.test(h)) onChange(h);
  };

  const usedLower = new Set((usedColors || []).map((c) => c.toLowerCase()));
  const suggestions = SWATCHES.filter((c) => !usedLower.has(c.toLowerCase()) || c.toLowerCase() === value.toLowerCase());

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={openPicker} title={title || "Choose color"} className="colorSwatchBtn"
        style={{ ...S.colorSwatchBtn, background: value }} />
      {open && (
        <>
          <div style={S.popoverBackdrop} onClick={() => setOpen(false)} />
          <div style={{ ...S.colorPopover, width: 216 }} onClick={(e) => e.stopPropagation()}>
            <div style={S.segment}>
              <button onClick={() => setMode("suggested")} style={{ ...S.segBtn, flex: 1, ...(mode === "suggested" ? S.segBtnActive : {}) }}>Suggested</button>
              <button onClick={() => setMode("wheel")} style={{ ...S.segBtn, flex: 1, ...(mode === "wheel" ? S.segBtnActive : {}) }}>Wheel</button>
            </div>

            {mode === "suggested" ? (
              suggestions.length === 0 ? (
                <div style={{ fontSize: 11.5, color: T.mut2, marginTop: 14, lineHeight: 1.5 }}>
                  All suggested colors are already in use — try the Wheel tab for a custom shade.
                </div>
              ) : (
                <div style={{ ...S.colorGrid, marginTop: 14 }}>
                  {suggestions.map((c) => {
                    const isActive = c.toLowerCase() === value.toLowerCase();
                    return (
                      <button key={c} className="colorSwatch" onClick={() => { onChange(c); setHex(c); setOpen(false); }}
                        style={{ ...S.colorSwatch, background: c, ...(isActive ? S.colorSwatchActive : {}) }}
                        title={c}>
                        {isActive && <IconCheck />}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <div style={{ marginTop: 14 }}>
                <ColorWheel hex={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : value} onChange={(c) => { setHex(c); onChange(c); }} />
              </div>
            )}

            <div style={{ ...S.colorPopoverLabel, marginTop: 14 }}>HEX</div>
            <div style={S.colorCustomRow}>
              <span style={{ ...S.colorSwatch, background: /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : value, width: 26, height: 26, flexShrink: 0 }} />
              <input className="field" value={hex} onChange={(e) => commitHex(e.target.value)}
                placeholder="#RRGGBB" style={{ ...S.input, ...S.inputSm, flex: 1, minWidth: 0, width: "100%", boxSizing: "border-box", fontFamily: "monospace", letterSpacing: 0.5 }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="chip" style={{ ...S.chip, ...(active ? S.chipActive : {}) }}>{children}</button>
  );
}
function MiniCard({ label, value, color, onClick }) {
  return (
    <button className="heroMiniCard" style={{ ...S.heroMini, ...(onClick ? { cursor: "pointer", textAlign: "left" } : {}) }} onClick={onClick} disabled={!onClick}>
      <div className="heroMiniLabel" style={{ fontSize: 10.5, letterSpacing: 1.3, color: "#BFE0C9", textTransform: "uppercase", fontWeight: 600, overflowWrap: "break-word", wordBreak: "break-word", whiteSpace: "nowrap" }}>{label}</div>
      <div className="heroMiniValue" style={{ fontFamily: FONT_DISPLAY, fontSize: 14.5, color: color || "#fff", fontVariantNumeric: "tabular-nums", marginTop: 4, fontWeight: 700, letterSpacing: -0.1 }}>{value}</div>
    </button>
  );
}
function Card({ title, sub, filter, children }) {
  return (
    <section className="card" style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, color: T.text }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: T.mut2, letterSpacing: 0.3, marginTop: 2 }}>{sub}</div>}
        </div>
        {filter}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>{children}</div>
    </section>
  );
}
function Empty({ msg }) {
  return <div style={{ color: T.mut2, fontSize: 12.5, padding: "34px 0", textAlign: "center" }}>{msg}</div>;
}
function Skel({ w, h, r = 10, style }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
function SkeletonDashboard() {
  return (
    <div className="appShell">
      <aside className="sidebar" style={S.sidebar}>
        <Skel w={100} h={30} style={{ margin: "0 8px 24px" }} />
        {Array.from({ length: 6 }).map((_, i) => <Skel key={i} w="100%" h={38} r={12} style={{ marginBottom: 8 }} />)}
      </aside>
      <div style={{ flex: 1, minWidth: 0, padding: "24px 32px" }}>
        <Skel w={160} h={26} style={{ marginBottom: 24 }} />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
          <Skel w="100%" h={200} r={20} style={{ flex: "1.6 1 420px" }} />
          <Skel w="100%" h={200} r={20} style={{ flex: "1 1 260px" }} />
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skel key={i} w="100%" h={100} r={18} style={{ flex: "1 1 200px" }} />)}
        </div>
        <Skel w="100%" h={280} r={20} />
      </div>
    </div>
  );
}
function Tip({ active, payload, label, currency = "PKR" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "0 8px 20px rgba(16,40,30,0.14)" }}>
      {label && <div style={{ color: T.mut2, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color || p.payload?.fill || T.text }}>
          {p.name}: {money(p.value, currency)}
        </div>
      ))}
    </div>
  );
}

const FONT_DISPLAY = "'Ubuntu','Segoe UI',sans-serif";
const FONT_BODY = "'Ubuntu','Segoe UI',sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap');
* { box-sizing: border-box; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }
}
:root {
  --bg: #F3F8F4; --sidebar: #EAF6EC; --surface: #FFFFFF; --surface2: #F0F8F2; --line: #E3EEE5;
  --dark: #132A1E; --darkSoft: #1F4A34; --deepGreen: #1F4A34; --mint: #7FE6A0; --mintSoft: #E1F7E6;
  --gold: #E0A93F; --goldSoft: #FBEFD9; --rose: #EF5A6F; --roseSoft: #FCE7EA;
  --text: #16281D; --mut: #5E7568; --mut2: #93A99B;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #0A1712; --sidebar: #071009; --surface: #16281F; --surface2: #213A2B; --line: #34543E;
  --dark: #17392A; --darkSoft: #A8E6BE; --deepGreen: #2A5A40; --mint: #6EF2A6; --mintSoft: #1E4531;
  --gold: #F0BB4C; --goldSoft: #423114; --rose: #FF8A99; --roseSoft: #442026;
  --text: #F3FAF6; --mut: #B9D8C5; --mut2: #8AAC96;
  color-scheme: dark;
}
button, input, select, textarea { font-family: inherit; }
button { background: none; color: inherit; }
html, body, #root { height: 100%; }
body { margin: 0; overflow-x: hidden; overscroll-behavior-y: none; -webkit-overflow-scrolling: touch; }
* { -webkit-tap-highlight-color: transparent; }
button, a, input, select, textarea { -webkit-tap-highlight-color: transparent; }
@media (hover: none) {
  button:focus, a:focus, input:focus:not(.field), select:focus, [role="button"]:focus { outline: none; }
}
body, .appShell { min-height: 100dvh; }

.pageTitleLg { font-family: ${FONT_DISPLAY}; font-weight: 700; font-size: clamp(28px, 9vw, 40px); line-height: 1.1; letter-spacing: -0.5px; }
.sectionTitleLg { font-family: ${FONT_DISPLAY}; font-weight: 700; font-size: clamp(20px, 5.5vw, 26px); line-height: 1.15; }
.amountLg { font-family: ${FONT_DISPLAY}; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.field:focus { outline: 2px solid ${T.mint}66; border-color: ${T.darkSoft} !important; }
.recharts-wrapper *:focus, .recharts-surface *:focus, .recharts-sector:focus, .recharts-pie-sector:focus { outline: none !important; }
.chip:hover { border-color: ${T.darkSoft}; }
.colorSwatch:hover { transform: scale(1.15); }
.colorSwatchBtn:hover { box-shadow: 0 0 0 1.5px ${T.darkSoft}; }
.avatarMenuItem:hover { background: ${T.surface2}; }
.primaryBtn:hover { filter: brightness(1.12); }
.primaryBtn, .quickBtn, .navItem, .chip, .hubCard { transition: transform .12s ease, background .15s ease, filter .15s ease; }
.primaryBtn:active, .quickBtn:active, .chip:active { transform: scale(0.96); }
.navItem:active { transform: scale(0.97); }
.linkBtn:hover { text-decoration: underline; }
.navItem:hover { background: ${T.mintSoft}; }
.quickBtn:hover { background: ${T.surface2}; }
.tblRow:hover { background: ${T.surface2}; }
.txnRow { background: ${T.surface}; transition: background .15s ease, transform .1s ease; }
.txnRow:hover { background: ${T.surface2}; }
.txnRow:active { transform: scale(0.99); }
.txnRow .editHint, .txnRow .txnDeleteBtn { opacity: 1; }

.statCatHead { cursor: pointer; padding: 8px 10px; margin: 0 -10px; border-radius: 12px; transition: background .18s ease; }
.statCatHead:hover { background: ${T.surface2}; }
.statCatHead:active { transform: scale(0.995); }
.statChevron { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 6px;
  background: ${T.surface2}; color: ${T.mut}; transition: transform .3s cubic-bezier(.4,0,.2,1), background .18s ease, color .18s ease; transform: rotate(-90deg); }
.statChevron.open { transform: rotate(0deg); background: ${T.darkSoft}; color: #fff; }
.statPctFill { transition: width .5s cubic-bezier(.22,1,.36,1); }
.statSubWrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .32s cubic-bezier(.4,0,.2,1); }
.statSubWrap.open { grid-template-rows: 1fr; }
.statSubInner { overflow: hidden; }
.statSubRow { opacity: 0; transform: translateX(-8px); animation: statSubIn .32s cubic-bezier(.2,.8,.3,1) forwards; border-radius: 8px; transition: background .15s ease; }
.statSubRow:hover { background: ${T.surface2}; }
.statSubBar { transition: width .5s cubic-bezier(.22,1,.36,1) .05s; }
@keyframes statSubIn { to { opacity: 1; transform: translateX(0); } }

.appShell { display: flex; min-height: 100vh; min-height: 100dvh; }
.sidebar { width: 236px; flex-shrink: 0; }
.sidebarNav { display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 900px) {
  .appShell { flex-direction: column; height: 100dvh; overflow: hidden; }
  .sidebar { display: none !important; }
  .mobileMain { height: 100%; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding-bottom: calc(92px + env(safe-area-inset-bottom)) !important; }
}
@media (min-width: 901px) {
  .hubNavBtn { display: none !important; }
  .mobileOnly { display: none !important; }
}
.desktopOnly { display: block; }
@media (max-width: 900px) { .desktopOnly { display: none !important; } }
.chipScroll { display: flex; flex-wrap: wrap; gap: 8px; }
.chipScroll > button { flex-shrink: 0; }
@media (max-width: 900px) {
  .rangeTriggerBtn { padding: 7px 10px !important; font-size: 12px !important; }
  .rangeTriggerLabel { max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.skel { background: linear-gradient(90deg, ${T.surface2} 25%, ${T.line} 37%, ${T.surface2} 63%); background-size: 400% 100%; animation: skelShimmer 1.4s ease infinite; }
@keyframes skelShimmer { from { background-position: 100% 50%; } to { background-position: 0 50%; } }

@media (max-width: 640px) {
  .modalBack { align-items: flex-end !important; padding: 0 !important; }
  .modalCard {
    border-radius: 24px 24px 0 0 !important; max-width: none !important; width: 100% !important;
    max-height: 86dvh !important; padding: 10px 20px calc(20px + env(safe-area-inset-bottom)) !important;
    animation: sheetUp .28s cubic-bezier(.2,.8,.3,1);
  }
  .modalCard > .sheetHandle { margin-bottom: 10px; }
  .stickyFormFooter { position: sticky; bottom: -1px; background: ${T.surface}; padding: 10px 0 2px; margin: 0 -20px; padding-left: 20px; padding-right: 20px; }

  .card { padding: 16px !important; border-radius: 18px !important; margin-bottom: 14px !important; }
  .statCard { padding: 14px !important; border-radius: 16px !important; }
  .statRow { gap: 10px !important; grid-template-columns: repeat(2, 1fr) !important; margin-bottom: 14px !important; }
  .heroSection { padding: 18px !important; border-radius: 18px !important; gap: 10px !important; }
  .quickActionsSection { padding: 16px !important; border-radius: 18px !important; }
  .heroMiniRow { gap: 8px !important; }
  .heroMiniCard { padding: 7px 8px !important; }

  .appTopbar { padding-bottom: 8px !important; gap: 10px !important; }
  main { padding-top: 6px !important; }
  .heroMiniLabel { font-size: 9px !important; letter-spacing: 0.8px !important; }
  .heroMiniValue { font-size: 13px !important; }
}

.hubNavBtn {
  position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  z-index: 60; width: 58px; height: 58px; border-radius: 50%; background: ${T.dark}; border: none;
  display: flex; align-items: center; justify-content: center; color: #fff;
  box-shadow: 0 10px 26px rgba(19,42,30,0.38); transition: transform .15s ease;
}
.hubNavBtn:active { transform: translateX(-50%) scale(0.92); }
.hubNavIconWrap { position: relative; width: 20px; height: 20px; }
.hubNavIconLayer {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  opacity: 0; transform: scale(0.5) rotate(-40deg); transition: opacity .18s ease, transform .25s cubic-bezier(.4,0,.2,1);
}
.hubNavIconLayer.show { opacity: 1; transform: scale(1) rotate(0deg); }
.hubCard.active { background: ${T.mintSoft}; }

.sheetBack { position: fixed; inset: 0; background: rgba(16,30,22,0.55); z-index: 100; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 101; background: ${T.surface};
  border-radius: 24px 24px 0 0; padding: 10px 20px calc(20px + env(safe-area-inset-bottom));
  max-height: 86dvh; overflow-y: auto; box-shadow: 0 -12px 40px rgba(15,30,20,0.25);
  animation: sheetUp .28s cubic-bezier(.2,.8,.3,1);
}
.sheetHandle { width: 40px; height: 5px; border-radius: 3px; background: ${T.line}; margin: 4px auto 14px; }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@media (min-width: 641px) {
  .sheetBack { display: flex; align-items: center; justify-content: center; }
  .sheet { position: relative; left: auto; right: auto; bottom: auto; border-radius: 22px; max-width: 480px; width: 100%;
    animation: sheetPop .2s cubic-bezier(.2,.8,.3,1); }
}
@keyframes sheetPop { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }

.hubGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 380px) { .hubGrid { grid-template-columns: repeat(2, 1fr); } }
.hubCard {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  background: ${T.surface}; border: 1px solid ${T.line}; border-radius: 20px; padding: 20px 8px;
  min-height: 96px; min-width: 0; color: ${T.text}; font-family: ${FONT_BODY}; font-size: 12.5px; font-weight: 600; text-align: center;
  box-shadow: 0 1px 3px rgba(16,40,30,0.05); transition: transform .12s ease, filter .12s ease;
  overflow-wrap: break-word; word-break: break-word; hyphens: auto; width: 100%;
}
.hubCard:active { transform: scale(0.95); filter: brightness(0.96); }
.hubIcon {
  width: 46px; height: 46px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease;
}
.hubIcon svg { width: 22px; height: 22px; }
.dashGrid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 20px; }
@media (max-width: 980px) { .dashGrid { grid-template-columns: minmax(0, 1fr); } }
.dailyLimitBurnRow { display: flex; gap: 20px; align-items: stretch; }
@media (max-width: 900px) {
  .dailyLimitBurnRow { flex-direction: column; }
  .dailyLimitBurnRow > div { flex: 1 1 auto !important; width: 100%; height: auto !important; }
}
@media (max-width: 720px) {
  .settingsLayout { flex-direction: column; gap: 14px !important; }
  .settingsLayout > div:first-child {
    width: 100% !important; flex-direction: row !important; flex-wrap: wrap !important;
  }
  .settingsLayout > div:first-child > button { flex-shrink: 0; width: auto !important; border-radius: 999px !important; }
}

.rangePopover { max-width: calc(100vw - 24px); }
@media (max-width: 700px) {
  .rangePopover {
    position: fixed !important; left: 12px !important; right: 12px !important; top: 96px !important;
    width: auto !important; max-width: none !important; flex-direction: row !important;
    max-height: 70vh !important; overflow-y: auto !important; align-items: stretch !important;
  }
  .rangePopoverQuick {
    order: -1; border-left: none !important; border-right: 1px solid ${T.line}; padding: 12px !important;
    flex: 0 0 auto; min-width: 100px; width: 100px;
  }
  .rangePopover .popoverCalendars { order: 1; padding: 12px !important; gap: 8px !important; flex: 1; min-width: 0; }
  .rangePopover .calendarRow { justify-content: center !important; }
  .rangePopover .popoverNavLabel { min-width: 0 !important; font-size: 12px !important; }
  .rangePopover .monthGridRow { grid-template-columns: repeat(7, 26px) !important; }
  .rangePopover .monthGridCell { width: 26px !important; height: 26px !important; }
  .rangePopover .popoverHint { font-size: 11px !important; }
}
`;

const S = {
  page: { minHeight: "100vh", background: T.bg, color: T.text, fontFamily: FONT_BODY },
  sidebar: {
    background: T.sidebar, borderRight: `1px solid ${T.line}`, padding: "24px 18px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  sidebarLogo: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "0 8px", marginBottom: 16 },
  navItem: {
    display: "flex", alignItems: "center", gap: 10, border: "none",
    color: T.mut, padding: "10px 12px", borderRadius: 12, cursor: "pointer", fontFamily: FONT_BODY,
    fontSize: 13.5, fontWeight: 500, textAlign: "left", width: "100%",
  },
  navItemActive: { background: T.mint, color: T.dark, fontWeight: 700 },
  navCaption: { fontSize: 10.5, letterSpacing: 1.8, color: T.mut2, fontWeight: 700, padding: "10px 10px 0" },

  topbar: {
    display: "flex", flexDirection: "column", gap: 14,
    maxWidth: 1180, margin: "0 auto", padding: "24px 32px 10px",
  },
  topbarBrandRow: { display: "flex", alignItems: "center", marginBottom: 2 },
  topbarTitleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
  pageTitle: { fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, color: T.text },
  pageSub: { fontSize: 12.5, color: T.mut, marginTop: 3 },
  savePill: { padding: "6px 14px", borderRadius: 20, fontSize: 12, border: `1px solid ${T.line}`, color: T.mut, background: T.surface },
  savePillError: { color: T.rose, borderColor: T.rose },

  topbarControls: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  searchWrap: {
    display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`,
    borderRadius: 10, padding: "8px 12px", color: T.mut2, minWidth: 190,
  },
  searchInput: { border: "none", outline: "none", background: "transparent", fontSize: 13, fontFamily: FONT_BODY, color: T.text, width: "100%" },
  iconTrigger: {
    width: 40, height: 40, borderRadius: 12, background: T.surface, border: `1px solid ${T.line}`, color: T.mut,
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
  },
  logBtn: {
    display: "flex", alignItems: "center", gap: 6, background: T.dark, color: "#fff", border: "none",
    borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY, letterSpacing: 0.2,
  },
  avatar: { width: 34, height: 34, borderRadius: "50%", background: T.mint, flexShrink: 0 },
  accountTrigger: {
    display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none",
    cursor: "pointer", padding: 0, fontFamily: FONT_BODY,
  },
  accountName: { fontSize: 13.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap" },
  avatarMenu: {
    position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 95, minWidth: 170,
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: 6,
    boxShadow: "0 20px 50px rgba(15,30,20,0.2)", display: "flex", flexDirection: "column", gap: 2,
  },
  avatarMenuItem: {
    display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none",
    padding: "9px 10px", borderRadius: 9, fontSize: 13.5, fontWeight: 500, color: T.text,
    cursor: "pointer", fontFamily: FONT_BODY, textAlign: "left", width: "100%",
  },
  activeSearchPill: {
    display: "flex", alignItems: "center", gap: 8, background: T.mintSoft, color: T.darkSoft, fontSize: 12.5, fontWeight: 600,
    padding: "8px 12px", borderRadius: 10,
  },
  activeSearchClear: { background: "transparent", border: "none", color: T.darkSoft, cursor: "pointer", fontSize: 12, padding: 0 },

  statusBar: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  },
  stepBtn: {
    width: 32, height: 32, borderRadius: 10, background: T.surface, border: `1px solid ${T.line}`,
    color: T.text, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepBtnDisabled: { color: T.mut2, cursor: "default", opacity: 0.5 },
  filterPickerTrigger: {
    display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`,
    borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 600, color: T.text, cursor: "pointer",
    fontFamily: FONT_BODY, flex: "1 1 130px", minWidth: 0,
  },
  filterPickerTriggerDisabled: { opacity: 0.5, cursor: "default" },
  rangeTrigger: {
    display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`,
    borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: T.text, cursor: "pointer", fontFamily: FONT_BODY,
  },
  rangeTriggerActive: { border: `1px solid ${T.darkSoft}` },
  popoverBackdrop: { position: "fixed", inset: 0, zIndex: 90, background: "transparent" },
  popover: {
    position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 95, display: "flex",
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, boxShadow: "0 20px 50px rgba(15,30,20,0.2)",
    overflow: "hidden",
  },
  popoverCalendars: { padding: 22, display: "flex", flexDirection: "column", gap: 14 },
  popoverNav: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14 },
  popoverNavLabel: { fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: T.text, minWidth: 220, textAlign: "center" },
  popoverHint: { fontSize: 12, color: T.mut2, textAlign: "center" },
  popoverQuick: {
    borderLeft: `1px solid ${T.line}`, background: T.surface2, padding: 18, minWidth: 160,
    display: "flex", flexDirection: "column", gap: 6,
  },
  quickPickBtn: {
    background: "transparent", border: "none", textAlign: "left", padding: "9px 10px", borderRadius: 9,
    fontSize: 13, color: T.text, cursor: "pointer", fontFamily: FONT_BODY, fontWeight: 500,
  },
  quickPickBtnActive: { background: T.dark, color: "#fff", fontWeight: 700 },
  monthGridLabel: { fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8, textAlign: "center" },
  monthGridRow: { display: "grid", gridTemplateColumns: "repeat(7, 32px)", gap: 2 },
  monthGridDow: { fontSize: 10.5, color: T.mut2, textAlign: "center", fontWeight: 700 },
  monthGridCell: { width: 32, height: 30 },
  monthGridDay: {
    background: "transparent", border: "none", borderRadius: 8, fontSize: 12.5, color: T.text,
    cursor: "pointer", fontFamily: FONT_BODY,
  },
  monthGridToday: { border: `1px solid ${T.mint}`, fontWeight: 700 },
  monthGridInRange: { background: T.mintSoft },
  monthGridEdge: { background: T.mint, color: T.dark, fontWeight: 700 },

  main: { maxWidth: 1180, margin: "0 auto", padding: "10px 32px 60px" },

  hero: {
    flex: "1.6 1 420px", minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14,
    background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`, borderRadius: 20, padding: 26,
    color: "#EAF7EE", boxShadow: "0 16px 32px rgba(15,40,28,0.22)",
  },
  kicker: { fontSize: 11, letterSpacing: 2.2, color: "#9FCBAE", fontWeight: 600 },
  kicker2: { fontSize: 11, letterSpacing: 2.2, color: T.mut2, fontWeight: 600 },
  heroNumber: { fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.15, letterSpacing: -0.3 },
  heroCur: { fontSize: 16, color: "#9FCBAE", fontWeight: 400 },
  flowBarWrap: { height: 9, borderRadius: 6, background: "rgba(255,255,255,0.16)", overflow: "hidden" },
  flowBar: { height: "100%", background: T.mint, borderRadius: 6, transition: "width .4s" },
  flowLegend: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#CFE9D6" },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  heroMiniRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: "auto" },
  heroMini: { flex: "1 1 100px", minWidth: 0, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: "10px 14px" },

  quickActions: { flex: "1 1 260px", minWidth: 0, maxWidth: "100%", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22, boxShadow: "0 1px 2px rgba(16,40,30,0.04)" },
  quickTitle: { fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 },
  quickGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  quickBtn: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
    background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 12px", cursor: "pointer",
    fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: T.text,
  },
  quickIcon: { width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" },

  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16, marginBottom: 20 },
  statCard: { minWidth: 0, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: 20, boxShadow: "0 1px 2px rgba(16,40,30,0.04)" },
  statTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  statIcon: { width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  changeBadge: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
  changeUp: { background: T.mintSoft, color: T.darkSoft },
  changeDown: { background: T.roseSoft, color: T.rose },
  statValue: { fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2 },
  statLabel: { fontSize: 12.5, color: T.mut, marginTop: 4 },

  card: { minWidth: 0, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22, marginBottom: 20, boxShadow: "0 1px 2px rgba(16,40,30,0.04)", height: "100%", display: "flex", flexDirection: "column" },
  statTabs: { display: "flex", gap: 24, marginBottom: 20 },
  statTab: {
    flex: 1, background: "transparent", border: "none", borderBottom: `2px solid ${T.line}`,
    padding: "0 0 12px", fontSize: 15, fontWeight: 700, color: T.mut2, cursor: "pointer",
    fontFamily: FONT_BODY, textAlign: "left",
  },
  statTabActive: { color: T.text, borderBottom: `2px solid ${T.darkSoft}` },
  legendRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14.5, color: T.text, padding: "11px 0" },
  pctBadge: { fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 9, minWidth: 40, textAlign: "center" },
  donutCenter: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" },
  donutCenterLabel: { fontSize: 11, color: T.mut2, textTransform: "capitalize", letterSpacing: 0.5 },
  donutCenterValue: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, color: T.text, marginTop: 4, letterSpacing: -0.2 },

  linkBtn: { background: "transparent", border: "none", color: T.darkSoft, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 4px" },
  viewAllPill: {
    display: "inline-flex", alignItems: "center", gap: 4, background: T.mintSoft, color: T.darkSoft,
    border: "none", borderRadius: 20, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY,
  },

  table: { width: "100%", borderCollapse: "collapse", minWidth: 520 },
  th: { textAlign: "left", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: T.mut2, padding: "0 10px 10px", borderBottom: `1px solid ${T.line}`, fontWeight: 600 },
  tr: {},
  td: { padding: "12px 10px", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 },
  tdMain: { color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 },
  tdSub: { fontSize: 11.5, color: T.mut2, marginTop: 2 },
  statusPill: { display: "inline-block", fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 20 },
  pillIncome: { background: T.mintSoft, color: T.darkSoft },
  pillExpense: { background: T.roseSoft, color: T.rose },

  filterBar: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, alignItems: "center" },
  input: {
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, color: T.text,
    padding: "9px 12px", fontSize: 13, fontFamily: FONT_BODY,
  },
  inputSm: { padding: "6px 9px", fontSize: 12, borderRadius: 8 },
  segment: { display: "flex", background: T.surface2, border: `1px solid ${T.line}`, borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { background: "transparent", border: "none", color: T.mut, padding: "7px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontFamily: FONT_BODY, fontWeight: 500 },
  segBtnActive: { background: T.surface, color: T.text, boxShadow: "0 1px 3px rgba(16,40,30,0.12)", fontWeight: 700 },
  resultLine: { fontSize: 12.5, color: T.mut, marginBottom: 16 },
  dateHead: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: T.mut2, margin: "0 0 6px 2px", fontWeight: 600 },
  txnRow: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14,
    border: `1px solid ${T.line}`, marginBottom: 6,
  },
  catDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  txnNote: { fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: T.text },
  txnMeta: { fontSize: 11.5, color: T.mut2 },
  txnAmt: { fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: -0.1 },
  editHint: { color: T.mut2, fontSize: 13, flexShrink: 0 },
  txnDeleteBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%",
    background: "none", border: "none", color: T.mut2, flexShrink: 0, cursor: "pointer",
  },
  cardIconBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%",
    background: "none", border: "none", color: T.mut2, flexShrink: 0, cursor: "pointer", fontSize: 13,
  },
  passwordToggle: {
    position: "absolute", top: "50%", right: 2, transform: "translateY(-50%)", display: "flex",
    alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 8,
    background: "none", border: "none", color: T.mut2, cursor: "pointer",
  },
  confirmCancelBtn: {
    background: T.surface2, color: T.text, border: "none", borderRadius: 9, padding: "8px 14px",
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT_BODY,
  },
  confirmDeleteBtn: {
    background: T.rose, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px",
    fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY,
  },
  empty: { color: T.mut2, fontSize: 13, padding: "40px 0", textAlign: "center" },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" },
  chip: {
    background: T.surface2, border: `1px solid ${T.line}`, color: T.mut, borderRadius: 18,
    padding: "6px 13px", fontSize: 12, cursor: "pointer", fontFamily: FONT_BODY, transition: "border-color .15s", fontWeight: 500,
  },
  chipActive: { background: T.mint, borderColor: T.mint, color: T.dark, fontWeight: 700 },
  formCard: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 26, display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 2px rgba(16,40,30,0.04)" },
  label: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: T.mut2, margin: "14px 0 6px", fontWeight: 600 },
  primaryBtn: {
    marginTop: 20, background: T.dark, color: "#fff", width: "100%", boxSizing: "border-box",
    border: "none", borderRadius: 12, padding: "13px 0", fontSize: 14.5, fontWeight: 700,
    fontFamily: FONT_DISPLAY, cursor: "pointer", letterSpacing: 0.3,
  },
  googleBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", boxSizing: "border-box",
    background: T.surface, color: T.text, border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 0",
    fontSize: 14, fontWeight: 600, fontFamily: FONT_BODY, cursor: "pointer",
  },
  dangerGhost: {
    marginTop: 10, background: "transparent", border: `1px solid ${T.line}`, color: T.rose,
    borderRadius: 12, padding: "10px 0", fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY,
  },
  modalBack: {
    position: "fixed", inset: 0, background: "rgba(16,30,22,0.55)", zIndex: 100,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  modal: {
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 26,
    width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", position: "relative",
    boxShadow: "0 20px 50px rgba(15,30,20,0.25)",
  },
  modalClose: {
    position: "absolute", top: 14, right: 14, background: T.surface2, border: "none", width: 28, height: 28, borderRadius: 8,
    color: T.mut, fontSize: 14, cursor: "pointer", padding: 0,
  },
  headBlock: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, marginBottom: 12 },
  colorSwatchBtn: {
    width: 30, height: 30, borderRadius: 9, border: `2px solid ${T.surface}`,
    boxShadow: `0 0 0 1.5px ${T.line}`, cursor: "pointer", padding: 0, flexShrink: 0,
  },
  colorPopover: {
    position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 95,
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 16, padding: 14,
    boxShadow: "0 20px 50px rgba(15,30,20,0.2)", width: 200,
  },
  colorPopoverLabel: { fontSize: 10, letterSpacing: 1.6, color: T.mut2, fontWeight: 700, marginBottom: 8 },
  colorGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  colorSwatch: {
    width: 28, height: 28, borderRadius: 9, border: "none", cursor: "pointer", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
    transition: "transform .12s", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)",
  },
  colorSwatchActive: { boxShadow: `0 0 0 2px ${T.surface}, 0 0 0 3.5px ${T.dark}` },
  colorCustomRow: { display: "flex", alignItems: "center", gap: 8 },
  wheelSquare: { position: "relative", width: "100%", height: 130, borderRadius: 12, cursor: "crosshair", overflow: "hidden", touchAction: "none" },
  wheelSquareWhite: { position: "absolute", inset: 0, background: "linear-gradient(to right, #fff, rgba(255,255,255,0))", pointerEvents: "none" },
  wheelSquareBlack: { position: "absolute", inset: 0, background: "linear-gradient(to top, #000, rgba(0,0,0,0))", pointerEvents: "none" },
  wheelCursor: {
    position: "absolute", width: 14, height: 14, borderRadius: "50%", border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.3)", transform: "translate(-50%,-50%)", pointerEvents: "none",
  },
  wheelHueTrack: {
    position: "relative", height: 14, borderRadius: 7, marginTop: 12, cursor: "pointer", touchAction: "none",
    background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
  },
  wheelHueThumb: {
    position: "absolute", top: "50%", width: 18, height: 18, borderRadius: "50%", border: "2px solid #fff",
    boxShadow: "0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.3)", transform: "translate(-50%,-50%)", pointerEvents: "none",
  },
  tinyBtn: { background: T.surface, border: `1px solid ${T.line}`, color: T.mut2, borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12 },
  settingsMsg: {
    background: T.goldSoft, border: `1px solid ${T.gold}55`, borderRadius: 10, padding: "9px 14px",
    fontSize: 12.5, color: T.gold, marginBottom: 14,
  },
  settingsTabBar: { display: "flex", flexDirection: "column", gap: 6, width: 180, flexShrink: 0 },
  settingsTabBtn: {
    background: T.surface, border: `1px solid ${T.line}`, color: T.mut, padding: "9px 16px",
    borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY, textAlign: "left", width: "100%",
  },
  settingsTabBtnActive: { background: T.dark, color: "#fff", border: `1px solid ${T.dark}` },
  uploadAvatarBtn: {
    display: "flex", alignItems: "center", gap: 8, background: T.mintSoft, color: T.darkSoft, border: "none",
    borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT_BODY,
  },
  deleteAvatarBtn: {
    display: "flex", alignItems: "center", justifyContent: "center", background: T.roseSoft, color: T.rose,
    border: "none", borderRadius: 10, width: 36, height: 36, cursor: "pointer",
  },
  deleteAccountLink: {
    background: "transparent", border: "none", color: T.mut2, fontSize: 12.5, cursor: "pointer",
    fontFamily: FONT_BODY, textDecoration: "underline", padding: 0,
  },
  comingSoon: {
    background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: "60px 30px", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 1px 2px rgba(16,40,30,0.04)",
  },
  comingSoonBadge: {
    background: T.mintSoft, color: T.darkSoft, fontSize: 11, fontWeight: 700, padding: "4px 12px",
    borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase",
  },
};