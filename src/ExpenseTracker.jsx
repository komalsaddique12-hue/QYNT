import { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, AreaChart, Area, ReferenceLine,
} from "recharts";
import qyntLogo from "./qynt-logo.svg";
import { supabase } from "./supabaseClient";

/* ─────────────────────────  THEME  ───────────────────────── */
const T = {
  bg: "#F3F8F4", sidebar: "#EAF6EC", surface: "#FFFFFF", surface2: "#F0F8F2", line: "#E3EEE5",
  dark: "#132A1E", darkSoft: "#1F4A34", mint: "#7FE6A0", mintSoft: "#E1F7E6",
  gold: "#E0A93F", goldSoft: "#FBEFD9", rose: "#EF5A6F", roseSoft: "#FCE7EA",
  text: "#16281D", mut: "#5E7568", mut2: "#93A99B",
};

/* ─────────────────  DEFAULT CATEGORIES  ───────────────── */
const DEFAULT_CATS = {
  heads: [
    { name: "Food & drinks", color: "#2E9B8F", kind: "expense" },
    { name: "Transportation", color: "#4A90A4", kind: "expense" },
    { name: "Housing", color: "#E0A93F", kind: "expense" },
    { name: "Lifestyle", color: "#A97FC0", kind: "expense" },
    { name: "Entertainment", color: "#EF5A6F", kind: "expense" },
    { name: "Miscellaneous", color: "#8FA88E", kind: "expense" },
    { name: "Income", color: "#4FB878", kind: "income" },
  ],
  subcats: {
    "Food & drinks": ["Groceries", "Restaurant", "Food", "Coffee", "Snacks", "Drinks"],
    Transportation: ["Petrol", "Parking", "Taxi", "Repair"],
    Housing: ["Electricity", "Water", "Telephone", "Home supplies", "Loan", "Mama", "Papa", "Bank", "Bank Transfer"],
    Lifestyle: ["Shopping", "Salon", "Pharmacy", "Furniture", "Child care", "Mirha", "Tickets"],
    Entertainment: ["Subscription", "Electronics", "Entertainment"],
    Miscellaneous: ["Gift", "Healthcare", "Miscellaneous"],
    Income: ["Salary", "Quaid Ventures", "Income"],
  },
};

/* ───────────────────────  HELPERS  ─────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fm = (n, dec = 0) => n.toLocaleString("en-PK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const monthLabel = (m) => {
  const [y, mo] = m.split("-");
  return new Date(+y, +mo - 1, 1).toLocaleString("en", { month: "short" }) + " " + y.slice(2);
};
const iso = (d) => d.toISOString().slice(0, 10);
const weekBounds = (dateStr) => {
  const d = new Date(dateStr + "T00:00");
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
};
/* Monday-first calendar grid for a given (year, month0-11) — null cells pad the leading/trailing week. */
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
const DEFAULT_PROFILE = {
  firstName: "You", lastName: "", email: "", color: "#2E9B8F", avatar: "",
  sex: "", dobDay: "", dobMonth: "", dobYear: "",
  currency: "PKR", language: "English",
};
const CURRENCY_OPTIONS = ["PKR", "USD", "EUR", "GBP", "AED", "SAR", "INR"];
const LANGUAGE_OPTIONS = ["English", "Urdu", "Arabic"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* Per-user JSON blob storage in Supabase, keyed the same way the old window.storage keys were. */
async function loadKey(userId, key, fallback) {
  const { data, error } = await supabase.from("app_data").select("value").eq("user_id", userId).eq("key", key).maybeSingle();
  if (error || !data) {
    await supabase.from("app_data").upsert({ user_id: userId, key, value: fallback });
    return fallback;
  }
  return data.value;
}
async function saveKey(userId, key, value) {
  const { error } = await supabase.from("app_data").upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

const MAX_WALLETS = 2;
const MAX_BUDGETS = 5;
const MAX_SAVINGS = 2;
const DEFAULT_WALLET_ID = "wallet-main";
const DEFAULT_WALLETS = [{ id: DEFAULT_WALLET_ID, name: "Main Wallet", color: T.mint, startingBalance: 0 }];

/* ───────────  DATE SCOPE (all / year / month / week / custom)  ─────────── */
const defaultScope = () => ({ mode: "all", year: "", month: "", week: "", from: "", to: "" });

function scopeRange(s) {
  if (s.mode === "year" && s.year) return [`${s.year}-01-01`, `${s.year}-12-31`];
  if (s.mode === "month" && s.month) return [`${s.month}-01`, `${s.month}-31`];
  if (s.mode === "week" && s.week) return weekBounds(s.week);
  if (s.mode === "custom" && (s.from || s.to)) return [s.from || "0000-01-01", s.to || "9999-12-31"];
  return null;
}
const inScope = (dateStr, s) => {
  const r = scopeRange(s);
  return !r || (dateStr >= r[0] && dateStr <= r[1]);
};
function scopeLabel(s) {
  if (s.mode === "year" && s.year) return s.year;
  if (s.mode === "month" && s.month) return monthLabel(s.month);
  if (s.mode === "week" && s.week) { const [a, b] = weekBounds(s.week); return `${a.slice(5)} → ${b.slice(5)}`; }
  if (s.mode === "custom" && (s.from || s.to)) return `${s.from || "…"} → ${s.to || "…"}`;
  return "All time";
}

/* Compares a bounded scope range against the equal-length period immediately before it. */
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

function StatusBar({ scope, setScope }) {
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
      <button disabled={!canStep} onClick={() => step(-1)} style={{ ...S.stepBtn, ...(canStep ? {} : S.stepBtnDisabled) }}>‹</button>
      <div style={{ position: "relative" }}>
        <button onClick={() => setOpen((o) => !o)} style={{ ...S.rangeTrigger, ...(open ? S.rangeTriggerActive : {}) }}>
          <IconCalendar /> {scopeLabel(scope)} <IconChevronDown />
        </button>
        {open && (
          <>
            <div style={S.popoverBackdrop} onClick={() => setOpen(false)} />
            <RangePopover scope={scope} setScope={setScope} onClose={() => setOpen(false)} />
          </>
        )}
      </div>
      <button disabled={!canStep} onClick={() => step(1)} style={{ ...S.stepBtn, ...(canStep ? {} : S.stepBtnDisabled) }}>›</button>
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
    <div style={S.popover} onClick={(e) => e.stopPropagation()}>
      <div style={S.popoverCalendars}>
        <div style={S.popoverNav}>
          <button onClick={() => shiftView(-1)} style={S.stepBtn}>‹</button>
          <div style={S.popoverNavLabel}>{leftLabel} – {rightLabel}</div>
          <button onClick={() => shiftView(1)} style={S.stepBtn}>›</button>
        </div>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
          <MonthGrid year={viewYear} month={viewMonth} pendingFrom={pendingFrom} pendingTo={pendingTo} onPick={pickDay} />
          <MonthGrid year={rightYear} month={rightMonth} pendingFrom={pendingFrom} pendingTo={pendingTo} onPick={pickDay} />
        </div>
        <div style={S.popoverHint}>
          {pendingFrom
            ? (pendingTo ? `${pendingFrom} → ${pendingTo}` : "Click a date to set end of custom range")
            : "Click a date to set start of custom range"}
        </div>
      </div>
      <div style={S.popoverQuick}>
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
      <div style={S.monthGridRow}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} style={S.monthGridDow}>{d}</span>)}</div>
      {weeks.map((week, wi) => (
        <div key={wi} style={S.monthGridRow}>
          {week.map((d, di) => {
            if (!d) return <span key={di} style={S.monthGridCell} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const isToday = dateStr === todayStr;
            const inRange = pendingFrom && pendingTo && dateStr >= pendingFrom && dateStr <= pendingTo;
            const isEdge = dateStr === pendingFrom || dateStr === pendingTo;
            return (
              <button key={di} onClick={() => onPick(dateStr)}
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
function IconSwap() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" />
      <path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" />
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
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 12.9a7.4 7.4 0 000-1.8l1.8-1.5-1.8-3.1-2.2.6a7.4 7.4 0 00-1.6-.9L15.2 4h-3.4l-.4 2.2a7.4 7.4 0 00-1.6.9l-2.2-.6-1.8 3.1L7.6 11a7.4 7.4 0 000 1.8l-1.8 1.5 1.8 3.1 2.2-.6c.5.4 1 .7 1.6.9l.4 2.3h3.4l.4-2.3c.6-.2 1.1-.5 1.6-.9l2.2.6 1.8-3.1z" />
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
function IconGauge() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16a8 8 0 1116 0" />
      <path d="M12 16l3.5-4.5" />
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
      <path d="M4 5h16v10H8l-4 4V5z" />
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
/* ───────────────────────  SIDEBAR & TOPBAR  ─────────────────────── */
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: IconDashboard },
  { key: "transactions", label: "Transactions", Icon: IconSwap },
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
  return (
    <aside className="sidebar" style={S.sidebar}>
      <div style={S.sidebarLogo}>
        <img src={qyntLogo} alt="QYNT" style={{ height: 34, width: "auto", display: "block" }} />
      </div>
      <nav className="sidebarNav" style={S.sidebarNav}>
        {NAV_ITEMS.map((it) => (
          <button key={it.key} className="navItem" onClick={() => setTab(it.key)}
            style={{ ...S.navItem, ...(tab === it.key ? S.navItemActive : {}) }}>
            <it.Icon /> <span className="navLabel">{it.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebarFoot" style={S.sidebarFoot}>Personal finance · {currency}</div>
    </aside>
  );
}

const PAGE_COPY = {
  dashboard: "Dashboard",
  transactions: "Transactions",
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

function Topbar({ tab, saveState, scope, setScope, search, onSearchChange, onLog, profile, onOpenSettings, onLogout }) {
  const showFilter = STATUS_BAR_TABS.has(tab);
  const fullName = `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
  const initials = (fullName || "Y").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={S.topbar}>
      <div>
        <div style={S.pageTitle}>{PAGE_COPY[tab]}</div>
        <div style={S.pageSub}>{TODAY_LABEL}</div>
      </div>
      <div style={S.topbarControls}>
        {showFilter && <StatusBar scope={scope} setScope={setScope} />}
        <div style={S.searchWrap}>
          <IconSearch />
          <input className="field" placeholder="Search transactions…" value={search}
            onChange={(e) => onSearchChange(e.target.value)} style={S.searchInput} />
        </div>
        {saveState && (
          <div style={{ ...S.savePill, ...(saveState === "error" ? S.savePillError : {}) }}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "⚠ Couldn't save"}
          </div>
        )}
        <button className="primaryBtn" onClick={onLog} style={S.logBtn}><IconPlus /> Log</button>
        <div style={{ position: "relative" }}>
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
    </header>
  );
}

const STATUS_BAR_TABS = new Set(["dashboard", "transactions", "wallets", "budgets", "savings"]);

/* ───────────────────────  AUTH  ─────────────────────── */
function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setErr(""); setInfo(""); };

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setErr(error.message);
      else setInfo("Account created — check your email to confirm it, then log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <form onSubmit={submit} style={{ ...S.formCard, width: 340 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img src={qyntLogo} alt="QYNT" style={{ height: 32, width: "auto" }} />
        </div>
        <div style={S.segment}>
          <button type="button" onClick={() => switchMode("login")} style={{ ...S.segBtn, flex: 1, ...(mode === "login" ? S.segBtnActive : {}) }}>Log in</button>
          <button type="button" onClick={() => switchMode("signup")} style={{ ...S.segBtn, flex: 1, ...(mode === "signup" ? S.segBtnActive : {}) }}>Sign up</button>
        </div>

        <label style={S.label}>Email</label>
        <input className="field" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} style={{ ...S.input, width: "100%" }} />

        <label style={S.label}>Password</label>
        <input className="field" type="password" required minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...S.input, width: "100%" }} />

        {err && <div style={{ color: T.rose, fontSize: 12, marginTop: 8 }}>{err}</div>}
        {info && <div style={{ color: T.darkSoft, fontSize: 12, marginTop: 8 }}>{info}</div>}

        <button type="submit" disabled={busy} className="primaryBtn" style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}

/* ───────────────────────  APP  ─────────────────────── */
export default function ExpenseTracker() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out, object = signed in
  const [txns, setTxns] = useState(null);
  const [cats, setCats] = useState(null);
  const [wallets, setWallets] = useState(null);
  const [budgets, setBudgets] = useState(null);
  const [savings, setSavings] = useState(null);
  const [profile, setProfile] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [settingsTab, setSettingsTab] = useState("profile");
  const [scope, setScope] = useState(defaultScope());
  const [search, setSearch] = useState("");
  const [saveState, setSaveState] = useState("");
  const [editing, setEditing] = useState(null); // txn being edited
  const [addPreset, setAddPreset] = useState(null); // "income" | "expense" | null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setTxns(null); setCats(null); setWallets(null); setBudgets(null);
      setSavings(null); setProfile(null); setDailyLimit(null);
      return;
    }
    (async () => {
      const uid_ = session.user.id;
      setWallets(await loadKey(uid_, WALLET_KEY, DEFAULT_WALLETS));
      setBudgets(await loadKey(uid_, BUDGET_KEY, []));
      setSavings(await loadKey(uid_, SAVING_KEY, []));
      const loadedProfile = await loadKey(uid_, PROFILE_KEY, { ...DEFAULT_PROFILE, email: session.user.email || "" });
      setProfile({ ...DEFAULT_PROFILE, ...loadedProfile });
      setDailyLimit(await loadKey(uid_, DAILY_LIMIT_KEY, 0));
      setTxns(await loadKey(uid_, TXN_KEY, []));
      setCats(await loadKey(uid_, CAT_KEY, DEFAULT_CATS));
    })();
  }, [session]);

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

  const addTxn = (t) => persistTxns([...txns, t].sort((a, b) => a.date.localeCompare(b.date)));
  const updateTxn = (t) => persistTxns(txns.map((x) => (x.id === t.id ? t : x)).sort((a, b) => a.date.localeCompare(b.date)));
  const deleteTxn = (id) => persistTxns(txns.filter((t) => t.id !== id));

  const catColor = (head) => cats?.heads.find((h) => h.name === head)?.color || T.mut;

  const goTab = (k) => { setTab(k); if (k !== "add") setAddPreset(null); };
  const handleSearchChange = (v) => { setSearch(v); if (v && tab !== "transactions") goTab("transactions"); };
  const openProfileSettings = () => { setSettingsTab("profile"); goTab("settings"); };

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

  if (!txns || !cats || !wallets || !budgets || !savings || !profile || dailyLimit == null) {
    return (
      <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{CSS}</style>
        <div style={{ color: T.mut, fontFamily: FONT_BODY, letterSpacing: 2, fontSize: 13 }}>OPENING YOUR LEDGER…</div>
      </div>
    );
  }

  return (
    <div className="appShell" style={S.page}>
      <style>{CSS}</style>
      <Sidebar tab={tab} setTab={goTab} currency={profile.currency} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Topbar tab={tab} saveState={saveState} scope={scope} setScope={setScope}
          search={search} onSearchChange={handleSearchChange} onLog={() => goTab("add")}
          profile={profile} onOpenSettings={openProfileSettings} onLogout={() => supabase.auth.signOut()} />

        {tab === "dashboard" && (
          <Dashboard txns={txns} catColor={catColor} cats={cats} setTab={goTab} setAddPreset={setAddPreset} scope={scope}
            savings={savings} dailyLimit={dailyLimit} budgets={budgets} currency={profile.currency}
            setSettingsTab={setSettingsTab} />
        )}
        {tab === "transactions" && (
          <Transactions txns={txns} cats={cats} catColor={catColor} onEdit={setEditing} scope={scope}
            search={search} setSearch={setSearch} />
        )}
        {tab === "add" && (
          <TxnForm cats={cats} presetType={addPreset} wallets={wallets} savings={savings} currency={profile.currency}
            onSave={(t) => { addTxn(t); goTab("transactions"); }} />
        )}
        {tab === "settings" && (
          <Settings cats={cats} txns={txns} persistCats={persistCats} persistTxns={persistTxns} catColor={catColor}
            wallets={wallets} budgets={budgets} savings={savings}
            persistWallets={persistWallets} persistBudgets={persistBudgets} persistSavings={persistSavings}
            dailyLimit={dailyLimit} persistDailyLimit={persistDailyLimit}
            profile={profile} persistProfile={persistProfile}
            settingsTab={settingsTab} setSettingsTab={setSettingsTab}
            onLogout={() => supabase.auth.signOut()} onDeleteAccount={resetAllData} />
        )}
        {tab === "wallets" && <Wallets txns={txns} wallets={wallets} scope={scope} />}
        {tab === "budgets" && <Budgets txns={txns} budgets={budgets} catColor={catColor} scope={scope} />}
        {tab === "savings" && <SavingSpaces txns={txns} savings={savings} scope={scope} />}
        {tab === "forecast" && <Forecast txns={txns} />}
        {tab === "vault" && (
          <ComingSoon title="Family vault" blurb="Shared budgets, goals, and visibility for everyone in your household." />
        )}
        {tab === "intelligence" && (
          <ComingSoon title="Intelligence" blurb="Automatic insights into your spending patterns and anomalies." />
        )}
        {tab === "advisor" && (
          <ComingSoon title="AI advisor" blurb="A personal assistant that helps you plan around your real numbers." />
        )}
      </div>

      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <TxnForm cats={cats} initial={editing} wallets={wallets} savings={savings} currency={profile.currency}
            onSave={(t) => { updateTxn(t); setEditing(null); }}
            onDelete={() => { deleteTxn(editing.id); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────  DASHBOARD  ─────────────────────── */
function Dashboard({ txns, catColor, cats, setTab, setAddPreset, scope, savings, dailyLimit, budgets, currency, setSettingsTab }) {
  const openSettings = (subTab) => { setSettingsTab(subTab); setTab("settings"); };
  const scopedTxns = txns.filter((t) => inScope(t.date, scope));
  const income = scopedTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = scopedTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = income + expense;
  const spentPct = income > 0 ? Math.min(100, (-expense / income) * 100) : 100;

  const incomeChange = prevPeriodChange(txns, scope, (t) => (t.amount > 0 ? t.amount : 0));
  const expenseChangeRaw = prevPeriodChange(txns, scope, (t) => (t.amount < 0 ? -t.amount : 0));
  const expenseChange = expenseChangeRaw == null ? null : -expenseChangeRaw; // spending less shows as positive
  const netChange = prevPeriodChange(txns, scope, (t) => t.amount);

  const [statTab, setStatTab] = useState("expense");
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
  const donut = statTab === "income" ? incomeBreakdown : expenseBreakdown;
  const donutTotal = statTab === "income" ? income : -expense;

  const dailyTx = scopedTxns.filter((t) => t.amount < 0);
  const dayMap = {};
  dailyTx.forEach((t) => { dayMap[t.date] = (dayMap[t.date] || 0) - t.amount; });
  const daily = Object.entries(dayMap).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, v]) => ({ day: d.slice(5), spend: v }));

  const recentTx = [...scopedTxns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <main style={S.main}>
      {/* hero + quick actions */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <section style={S.hero}>
          <div style={S.kicker}>NET FLOW · {scopeLabel(scope).toUpperCase()}</div>
          <div style={{ ...S.heroNumber, color: net >= 0 ? "#fff" : "#FFB3C0" }}>
            {net >= 0 ? "+" : "−"}{fm(Math.abs(net))}<span style={S.heroCur}> {currency}</span>
          </div>
          <div style={S.flowBarWrap}><div style={{ ...S.flowBar, width: `${spentPct}%` }} /></div>
          <div style={S.flowLegend}>
            <span><i style={{ ...S.dot, background: "#FFB3C0" }} />Spent {fm(-expense)}</span>
            <span><i style={{ ...S.dot, background: T.gold }} />Earned {fm(income)}</span>
            <span style={{ color: "#9FCBAE" }}>{income > 0 ? `${spentPct.toFixed(0)}% of income spent` : ""}</span>
          </div>
          <div style={S.heroMiniRow}>
            <MiniCard label="Income" value={fm(income)} color={T.gold} />
            <MiniCard label="Expenses" value={fm(-expense)} color="#FFB3C0" />
            <MiniCard label="Transactions" value={scopedTxns.length} color="#CFE9D6" />
          </div>
        </section>

        <section style={S.quickActions}>
          <div style={S.quickTitle}>Quick actions</div>
          <div style={S.quickGrid}>
            <button className="quickBtn" style={S.quickBtn} onClick={() => { setAddPreset("expense"); setTab("add"); }}>
              <span style={{ ...S.quickIcon, background: T.roseSoft, color: T.rose }}><IconPlus /></span>
              Add expense
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => { setAddPreset("income"); setTab("add"); }}>
              <span style={{ ...S.quickIcon, background: T.mintSoft, color: T.darkSoft }}><IconPlus /></span>
              Add income
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => setTab("transactions")}>
              <span style={{ ...S.quickIcon, background: T.goldSoft, color: T.gold }}><IconSwap /></span>
              Transactions
            </button>
            <button className="quickBtn" style={S.quickBtn} onClick={() => setTab("settings")}>
              <span style={{ ...S.quickIcon, background: T.surface2, color: T.mut }}><IconGear /></span>
              Settings
            </button>
          </div>
        </section>
      </div>

      {/* stat row */}
      <div style={S.statRow}>
        <StatCard label="Total income" value={fm(income)} change={incomeChange} iconBg={T.mintSoft} iconColor={T.darkSoft} />
        <StatCard label="Total expense" value={fm(-expense)} change={expenseChange} iconBg={T.roseSoft} iconColor={T.rose} />
        <StatCard label="Net savings" value={fm(net)} valueColor={net >= 0 ? T.darkSoft : T.rose} change={netChange} iconBg={T.goldSoft} iconColor={T.gold} />
        <DailyLimitCard txns={txns} dailyLimit={dailyLimit} onSetLimit={() => openSettings("limit")} />
      </div>

      {/* cashflow + statistic */}
      <div className="dashGrid" style={{ marginBottom: 20 }}>
        <CashflowCard txns={scopedTxns} currency={currency} />

        <Card title="Statistic">
          <div style={S.statTabs}>
            <button onClick={() => setStatTab("income")} style={{ ...S.statTab, ...(statTab === "income" ? S.statTabActive : {}) }}>
              Income <span style={S.statTabAmt}>({fm(income)})</span>
            </button>
            <button onClick={() => setStatTab("expense")} style={{ ...S.statTab, ...(statTab === "expense" ? S.statTabActive : {}) }}>
              Expense <span style={S.statTabAmt}>({fm(-expense)})</span>
            </button>
          </div>
          {donut.length === 0 ? <Empty msg={`No ${statTab} in this range.`} /> : (
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div style={{ width: 180, height: 180, flexShrink: 0, position: "relative" }}>
                {donut.length === 1 ? (
                  // Recharts can't sweep a full 360° ring for a single 100%-share slice — draw it directly.
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    <circle cx="90" cy="90" r="72" fill="none" stroke={donut[0].color} strokeWidth="28" />
                  </svg>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86}
                        paddingAngle={4} cornerRadius={10} stroke="none">
                        {donut.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip content={<Tip />} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div style={S.donutCenter}>
                  <div style={S.donutCenterLabel}>Total {statTab}</div>
                  <div style={S.donutCenterValue}>{fm(donutTotal)}</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {donut.map((d) => {
                  const pct = donutTotal !== 0 ? (d.value / donutTotal) * 100 : 0;
                  return (
                    <div key={d.name} style={S.legendRow}>
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ ...S.pctBadge, background: d.color + "22", color: d.color }}>{pct.toFixed(0)}%</span>
                        {d.name}
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: T.text, fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
                        {fm(d.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* saving plans + finance score */}
      <div className="dashGrid" style={{ marginBottom: 20 }}>
        <SavingPlansCard txns={txns} savings={savings} onAddPlans={() => openSettings("savings")} currency={currency} />
        <FinanceScoreCard txns={txns} budgets={budgets} scope={scope} />
      </div>

      <Card title="Daily spending" sub="Day-by-day spend">
        {daily.length === 0 ? <Empty msg="No spending in this range." /> : (
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.darkSoft} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={T.darkSoft} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="spend" stroke={T.darkSoft} strokeWidth={2} fill="url(#spendGrad)" name="Spent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Recent transactions" sub="Latest activity"
        filter={<button className="linkBtn" style={S.linkBtn} onClick={() => setTab("transactions")}>View all →</button>}>
        <RecentTxnsTable txns={recentTx} catColor={catColor} />
      </Card>
    </main>
  );
}

/* ─────────────  CASHFLOW CARD (week area view / year butterfly view)  ───────────── */
function CashflowCard({ txns, currency }) {
  const [visual, setVisual] = useState(1); // 1 = area chart, 2 = butterfly bar chart
  const totalBalance = txns.reduce((s, t) => s + t.amount, 0);

  const daily = useMemo(() => {
    const byDay = {};
    txns.forEach((t) => {
      const e = (byDay[t.date] ||= { label: t.date, Income: 0, Expense: 0 });
      if (t.amount > 0) e.Income += t.amount; else e.Expense += -t.amount;
    });
    return Object.values(byDay).sort((a, b) => a.label.localeCompare(b.label))
      .map((d) => ({ ...d, label: d.label.slice(5) }));
  }, [txns]);

  const monthly = useMemo(() => {
    const byMonth = {};
    txns.forEach((t) => {
      const key = t.date.slice(0, 7);
      const e = (byMonth[key] ||= { key, Income: 0, Expense: 0 });
      if (t.amount > 0) e.Income += t.amount; else e.Expense += t.amount;
    });
    return Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({ ...d, label: monthLabel(d.key) }));
  }, [txns]);

  const data = visual === 1 ? daily : monthly;
  const hasData = data.some((d) => d.Income || d.Expense);

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
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.text, marginTop: 4 }}>
            {fm(totalBalance)} <span style={{ fontSize: 13, color: T.mut2, fontWeight: 400 }}>{currency}</span>
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
        <div style={{ width: "100%", height: 260 }}>
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
                <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip content={<Tip />} cursor={{ stroke: T.line, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="Income" stroke={T.mint} strokeWidth={2.5} fill="url(#cfIncomeGrad)" activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="Expense" stroke={T.darkSoft} strokeWidth={2.5} fill="url(#cfExpenseGrad)" activeDot={{ r: 5 }} />
              </AreaChart>
            ) : (
              <BarChart data={data} barGap={4}>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip content={<Tip />} cursor={{ fill: T.surface2 }} />
                <ReferenceLine y={0} stroke={T.line} />
                <Bar dataKey="Income" fill={T.darkSoft} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expense" fill={T.mint} radius={[0, 0, 4, 4]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ─────────────  SAVING PLANS CARD  ───────────── */
function SavingPlansCard({ txns, savings, onAddPlans, currency }) {
  const withProgress = savings.map((s) => {
    const current = txns.filter((t) => t.savingSpaceId === s.id).reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const pct = s.target > 0 ? Math.min(100, (current / s.target) * 100) : 0;
    return { ...s, current, pct };
  });
  const totalSaved = withProgress.reduce((s, p) => s + p.current, 0);

  return (
    <Card title="Saving Plans"
      filter={<button className="linkBtn" style={S.linkBtn} onClick={onAddPlans}>+ Add Plans</button>}>
      <div style={{ marginBottom: 14 }}>
        <div style={S.kicker2}>TOTAL SAVINGS</div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.text, marginTop: 4 }}>{fm(totalSaved)} {currency}</div>
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
              <span>{fm(p.current)} <span style={{ color: T.mut2 }}>/ {fm(p.target)}</span></span>
              <span style={{ fontWeight: 700, color: T.text }}>{p.pct.toFixed(0)}%</span>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* ─────────────  FINANCE SCORE CARD  ───────────── */
function FinanceScoreCard({ txns, budgets, scope }) {
  const scopedTxns = txns.filter((t) => inScope(t.date, scope));
  const income = scopedTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = -scopedTxns.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const net = income - expense;

  const savingsRate = income > 0 ? net / income : (net >= 0 ? 1 : -1);
  const scoreA = Math.max(0, Math.min(100, 50 + savingsRate * 50));

  let scoreB = 75;
  if (budgets.length > 0) {
    const ratios = budgets.map((b) => {
      const spent = -txns.filter((t) => t.head === b.head && t.amount < 0 && inScope(t.date, scope)).reduce((s, t) => s + t.amount, 0);
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

/* ─────────────  DAILY LIMIT CARD (in stat row)  ───────────── */
function DailyLimitCard({ txns, dailyLimit, onSetLimit }) {
  const todayStr = iso(new Date());
  const spentToday = -txns.filter((t) => t.date === todayStr && t.amount < 0).reduce((s, t) => s + t.amount, 0);

  if (!dailyLimit) {
    return (
      <div style={S.statCard}>
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
    <div style={S.statCard}>
      <div style={S.statTop}>
        <span style={{ ...S.statIcon, background: over ? T.roseSoft : T.mintSoft, color: over ? T.rose : T.darkSoft }}><IconGauge /></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: over ? T.rose : T.mut2 }}>{pct.toFixed(0)}%</span>
      </div>
      <div style={{ ...S.statValue, fontSize: 20, color: over ? T.rose : T.text }}>
        {fm(spentToday)} <span style={{ fontSize: 12, color: T.mut2, fontWeight: 400 }}>/ {fm(dailyLimit)}</span>
      </div>
      <div style={S.statLabel}>Today's spending limit</div>
      <div style={{ height: 6, borderRadius: 4, background: T.surface2, overflow: "hidden", marginTop: 10 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? T.rose : T.darkSoft, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, valueColor, change, iconBg, iconColor }) {
  return (
    <div style={S.statCard}>
      <div style={S.statTop}>
        <span style={{ ...S.statIcon, background: iconBg, color: iconColor }}><IconCoin /></span>
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

function RecentTxnsTable({ txns, catColor }) {
  if (txns.length === 0) return <Empty msg="No transactions in this range." />;
  return (
    <div style={{ overflowX: "auto" }}>
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
                <span style={S.tdSub}>
                  {new Date(t.date + "T00:00").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </td>
              <td style={{ ...S.td, textAlign: "right", fontFamily: FONT_DISPLAY, fontWeight: 600, color: t.amount >= 0 ? T.darkSoft : T.rose, fontVariantNumeric: "tabular-nums" }}>
                {t.amount >= 0 ? "+" : "−"}{fm(Math.abs(t.amount), t.amount % 1 ? 2 : 0)}
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
  );
}

/* ───────────────────────  WALLETS  ─────────────────────── */
function Wallets({ txns, wallets, scope }) {
  return (
    <main style={S.main}>
      <div style={S.statRow}>
        {wallets.map((w) => {
          const scoped = txns.filter((t) => t.walletId === w.id && inScope(t.date, scope));
          const balance = w.startingBalance + scoped.reduce((s, t) => s + t.amount, 0);
          return (
            <div key={w.id} style={S.statCard}>
              <div style={S.statTop}>
                <span style={{ ...S.statIcon, background: w.color + "22", color: w.color }}><IconWallet /></span>
                <span style={{ fontSize: 11.5, color: T.mut2 }}>{scoped.length} txns</span>
              </div>
              <div style={{ ...S.statValue, color: balance >= 0 ? T.text : T.rose }}>{fm(balance)}</div>
              <div style={S.statLabel}>{w.name}</div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

/* ───────────────────────  BUDGETS  ─────────────────────── */
function Budgets({ txns, budgets, catColor, scope }) {
  if (budgets.length === 0) {
    return (
      <main style={S.main}>
        <Card title="Budgets"><Empty msg="No budgets yet — add one from Settings." /></Card>
      </main>
    );
  }
  return (
    <main style={S.main}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
        {budgets.map((b) => {
          const spent = -txns.filter((t) => t.head === b.head && t.amount < 0 && inScope(t.date, scope))
            .reduce((s, t) => s + t.amount, 0);
          const pct = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0;
          const over = spent > b.limit;
          const barColor = pct >= 100 ? T.rose : pct >= 80 ? T.gold : T.darkSoft;
          return (
            <Card key={b.id} title={b.head} sub={`Limit ${fm(b.limit)} PKR`}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ ...S.catDot, background: catColor(b.head) }} />
                <div style={{ flex: 1, height: 10, borderRadius: 6, background: T.surface2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 6, transition: "width .4s" }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: T.mut }}>Spent {fm(spent)}</span>
                <span style={{ color: over ? T.rose : T.darkSoft, fontWeight: 700 }}>
                  {over ? `${fm(spent - b.limit)} over` : `${fm(b.limit - spent)} left`}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

/* ───────────────────────  SAVING SPACES  ─────────────────────── */
function SavingSpaces({ txns, savings, scope }) {
  if (savings.length === 0) {
    return (
      <main style={S.main}>
        <Card title="Saving spaces"><Empty msg="No saving spaces yet — add one from Settings." /></Card>
      </main>
    );
  }
  return (
    <main style={S.main}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 20 }}>
        {savings.map((s) => {
          const current = txns.filter((t) => t.savingSpaceId === s.id && inScope(t.date, scope))
            .reduce((sum, t) => sum + Math.abs(t.amount), 0);
          const pct = s.target > 0 ? Math.min(100, (current / s.target) * 100) : 0;
          return (
            <Card key={s.id} title={s.name} sub={`Target ${fm(s.target)} PKR`}>
              <div style={{ height: 10, borderRadius: 6, background: T.surface2, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 6, transition: "width .4s" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: T.mut }}>Saved {fm(current)}</span>
                <span style={{ color: T.darkSoft, fontWeight: 700 }}>{pct.toFixed(0)}% of goal</span>
              </div>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

/* ───────────────────────  FORECAST  ─────────────────────── */
function Forecast({ txns }) {
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

  return (
    <main style={S.main}>
      <Card title="Predictive cash flow" sub="Based on your full transaction history">
        {series.length < 2 ? (
          <Empty msg="Log at least two months of transactions to see a forecast." />
        ) : (
          <>
            <div style={{ fontSize: 13, color: T.mut, marginBottom: 16 }}>
              Averaging your last {trailing.length} month{trailing.length !== 1 ? "s" : ""}, you net about{" "}
              <strong style={{ color: avgNet >= 0 ? T.darkSoft : T.rose }}>{fm(avgNet)} PKR/month</strong>.
              The lighter bars below are a projection based on that average, not a guarantee.
            </div>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={combined} barGap={4}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: T.mut2, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                  <Tooltip content={<Tip />} cursor={{ fill: T.surface2 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: T.mut }} />
                  <Bar dataKey="Income" fill={T.darkSoft} radius={[4, 4, 0, 0]}>
                    {combined.map((d, i) => <Cell key={i} fill={T.darkSoft} fillOpacity={d.projected ? 0.35 : 1} />)}
                  </Bar>
                  <Bar dataKey="Expenses" fill={T.mint} radius={[4, 4, 0, 0]}>
                    {combined.map((d, i) => <Cell key={i} fill={T.mint} fillOpacity={d.projected ? 0.5 : 1} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}

/* ───────────────────────  COMING SOON  ─────────────────────── */
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

/* ───────────────────────  TRANSACTIONS  ─────────────────────── */
function Transactions({ txns, cats, catColor, onEdit, scope, search, setSearch }) {
  const [fHead, setFHead] = useState("all");
  const [fSub, setFSub] = useState("all");
  const [fType, setFType] = useState("all");

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

  return (
    <main style={S.main}>
      <div style={S.filterBar}>
        {search && (
          <div style={S.activeSearchPill}>
            Searching “{search}” <button onClick={() => setSearch("")} style={S.activeSearchClear}>✕</button>
          </div>
        )}
        <select className="field" value={fHead} onChange={(e) => { setFHead(e.target.value); setFSub("all"); }} style={S.input}>
          <option value="all">All categories</option>
          {cats.heads.map((h) => <option key={h.name}>{h.name}</option>)}
        </select>
        {fHead !== "all" && subOptions.length > 0 && (
          <select className="field" value={fSub} onChange={(e) => setFSub(e.target.value)} style={S.input}>
            <option value="all">All subcategories</option>
            {subOptions.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <div style={S.segment}>
          {["all", "expense", "income"].map((t) => (
            <button key={t} onClick={() => setFType(t)} style={{ ...S.segBtn, ...(fType === t ? S.segBtnActive : {}) }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={S.resultLine}>
        {filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · {scopeLabel(scope)} ·{" "}
        <span style={{ color: total >= 0 ? T.darkSoft : T.rose, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
          {total >= 0 ? "+" : "−"}{fm(Math.abs(total))} PKR
        </span>
        <span style={{ color: T.mut2, marginLeft: 10, fontSize: 11 }}>Tap any transaction to edit</span>
      </div>

      {Object.keys(byDate).length === 0 && (
        <div style={S.empty}>No transactions match these filters. Clear a filter or add a new expense.</div>
      )}

      {Object.entries(byDate).map(([date, list]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={S.dateHead}>
            {new Date(date + "T00:00").toLocaleDateString("en", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
          </div>
          {list.map((t) => (
            <div key={t.id} className="txnRow" style={{ ...S.txnRow, cursor: "pointer" }}
              onClick={() => onEdit(t)} title="Edit this transaction">
              <span style={{ ...S.catDot, background: catColor(t.head) }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.txnNote}>{t.note || t.cat}</div>
                <div style={S.txnMeta}>{t.head} · {t.cat}</div>
              </div>
              <div style={{ ...S.txnAmt, color: t.amount >= 0 ? T.darkSoft : T.rose }}>
                {t.amount >= 0 ? "+" : "−"}{fm(Math.abs(t.amount), t.amount % 1 ? 2 : 0)}
              </div>
              <span className="editHint" style={S.editHint}>✎</span>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}

/* ─────────────  TXN FORM (add + edit share this)  ───────────── */
function TxnForm({ cats, initial, onSave, onDelete, presetType, wallets, savings, currency }) {
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
    <main style={{ ...S.main, maxWidth: 560, ...(isEdit ? { margin: 0, padding: 0, maxWidth: "none" } : {}) }}>
      <div style={{ ...S.formCard, ...(isEdit ? { border: "none", padding: 0, background: "transparent", boxShadow: "none" } : {}) }}>
        {isEdit && <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Edit transaction</div>}
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
          style={{ ...S.input, width: "100%", fontSize: 26, fontFamily: FONT_DISPLAY, fontWeight: 700, padding: "12px 14px" }} autoFocus={!isEdit} />

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Date</label>
            <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              style={{ ...S.input, width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Head category</label>
            <select className="field" value={head} onChange={(e) => pickHead(e.target.value)} style={{ ...S.input, width: "100%" }}>
              {headsForType.map((h) => <option key={h.name}>{h.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Wallet</label>
            <select className="field" value={walletId} onChange={(e) => setWalletId(e.target.value)} style={{ ...S.input, width: "100%" }}>
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {savings.length > 0 && (
            <div style={{ flex: 1 }}>
              <label style={S.label}>Saving space</label>
              <select className="field" value={savingSpaceId} onChange={(e) => setSavingSpaceId(e.target.value)} style={{ ...S.input, width: "100%" }}>
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
        <input className="field" placeholder="e.g. KFC with Mirha - Gulberg" value={note}
          onChange={(e) => setNote(e.target.value)} style={{ ...S.input, width: "100%" }}
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        {err && <div style={{ color: T.rose, fontSize: 12, marginTop: 8 }}>{err}</div>}

        <button className="primaryBtn" onClick={submit} style={S.primaryBtn}>
          {isEdit ? "Save changes" : "Save transaction"}
        </button>

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

/* ───────────────────────  SETTINGS  ─────────────────────── */
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
  profile, persistProfile, settingsTab, setSettingsTab, onLogout, onDeleteAccount,
}) {
  const [newHead, setNewHead] = useState("");
  const [dailyLimitInput, setDailyLimitInput] = useState(String(dailyLimit || ""));
  const [newHeadColor, setNewHeadColor] = useState("#4A90A4");
  const [newHeadKind, setNewHeadKind] = useState("expense");
  const [newSub, setNewSub] = useState({}); // {headName: text}
  const [renaming, setRenaming] = useState(null); // {kind:'head'|'sub'|'wallet'|'saving', ...}
  const [msg, setMsg] = useState("");

  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletBalance, setNewWalletBalance] = useState("0");
  const [newBudgetHead, setNewBudgetHead] = useState("");
  const [newBudgetLimit, setNewBudgetLimit] = useState("");
  const [newSavingName, setNewSavingName] = useState("");
  const [newSavingTarget, setNewSavingTarget] = useState("");

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
    persistWallets([...wallets, { id: uid(), name, color: "#4A90A4", startingBalance: parseFloat(newWalletBalance) || 0 }]);
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
    persistSavings([...savings, { id: uid(), name, target, color: "#A97FC0" }]);
    setNewSavingName(""); setNewSavingTarget("");
  };
  const deleteSaving = (id) => {
    if (usedBySaving(id) > 0) { note(`This saving space is used by ${usedBySaving(id)} transaction(s) — reassign them first.`); return; }
    persistSavings(savings.filter((s) => s.id !== id));
  };
  const setSavingTarget = (id, val) => persistSavings(savings.map((s) => (s.id === id ? { ...s, target: parseFloat(val) || 0 } : s)));

  const saveDailyLimit = () => persistDailyLimit(parseFloat(dailyLimitInput) || 0);

  return (
    <main style={{ ...S.main, maxWidth: 760 }}>
      <div style={S.settingsTabBar}>
        {SETTINGS_TABS.map((t) => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            style={{ ...S.settingsTabBtn, ...(settingsTab === t.key ? S.settingsTabBtnActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {msg && <div style={S.settingsMsg}>{msg}</div>}

      {settingsTab === "profile" && <ProfileFields profile={profile} persistProfile={persistProfile} onDeleteAccount={onDeleteAccount} />}

      {settingsTab === "logout" && (
        <div style={S.formCard}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Log out</div>
          <div style={{ fontSize: 12.5, color: T.mut2, marginBottom: 18 }}>
            Signed in as {profile.email || `${profile.firstName} ${profile.lastName}`.trim() || "You"}. Your data stays on this device.
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
      <div style={{ fontSize: 12, color: T.mut2, marginBottom: 18 }}>
        Rename anything and existing transactions update with it. Deleting is only possible when nothing uses the category.
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
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
                    onClick={() => setRenaming({ kind: "head", head: h.name, value: h.name })} title="Click to rename">
                    {h.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
                  </span>
                )}
                <span style={{ fontSize: 11, color: T.mut2 }}>{usedByHead(h.name)} txns</span>
                <button onClick={() => deleteHead(h.name)} style={{ ...S.tinyBtn, marginLeft: "auto" }}
                  title={usedByHead(h.name) ? "In use — reassign transactions first" : "Delete category"}>✕</button>
              </div>
              <div style={{ ...S.chipWrap, marginTop: 10 }}>
                {(cats.subcats[h.name] || []).map((s) =>
                  renaming?.kind === "sub" && renaming.head === h.name && renaming.sub === s ? (
                    <input key={s} className="field" autoFocus value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && commitRename()}
                      onBlur={commitRename} style={{ ...S.input, ...S.inputSm, width: 130 }} />
                  ) : (
                    <span key={s} className="chip" style={{ ...S.chip, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ cursor: "pointer" }} title="Click to rename"
                        onClick={() => setRenaming({ kind: "sub", head: h.name, sub: s, value: s })}>{s}</span>
                      <span onClick={() => deleteSub(h.name, s)} style={{ cursor: "pointer", color: T.mut2 }}
                        title={usedBySub(h.name, s) ? "In use" : "Delete"}>✕</span>
                    </span>
                  )
                )}
                <input className="field" placeholder="+ Add subcategory" value={newSub[h.name] || ""}
                  onChange={(e) => setNewSub({ ...newSub, [h.name]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && addSub(h.name)}
                  style={{ ...S.input, ...S.inputSm, width: 150 }} />
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
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
                onClick={() => setRenaming({ kind: "wallet", id: w.id, value: w.name })} title="Click to rename">
                {w.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
              </span>
            )}
            <span style={{ fontSize: 11, color: T.mut2 }}>{usedByWallet(w.id)} txns</span>
            <button onClick={() => deleteWallet(w.id)} style={{ ...S.tinyBtn, marginLeft: "auto" }}
              title={wallets.length <= 1 ? "At least one wallet is required" : usedByWallet(w.id) ? "In use — reassign transactions first" : "Delete wallet"}>✕</button>
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
            <button onClick={() => deleteBudget(b.id)} style={{ ...S.tinyBtn, marginLeft: "auto" }} title="Delete budget">✕</button>
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
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
                onClick={() => setRenaming({ kind: "saving", id: s.id, value: s.name })} title="Click to rename">
                {s.name} <span style={{ color: T.mut2, fontSize: 11 }}>✎</span>
              </span>
            )}
            <span style={{ fontSize: 12, color: T.mut2 }}>target</span>
            <input className="field" type="number" value={s.target}
              onChange={(e) => setSavingTarget(s.id, e.target.value)} style={{ ...S.input, ...S.inputSm, width: 120 }} />
            <span style={{ fontSize: 11, color: T.mut2 }}>{usedBySaving(s.id)} txns</span>
            <button onClick={() => deleteSaving(s.id)} style={{ ...S.tinyBtn, marginLeft: "auto" }}
              title={usedBySaving(s.id) ? "In use — reassign transactions first" : "Delete"}>✕</button>
          </div>
        </div>
      ))}
      {savings.length < MAX_SAVINGS ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="field" placeholder="Goal name (e.g. Emergency fund)" value={newSavingName}
            onChange={(e) => setNewSavingName(e.target.value)} style={{ ...S.input, flex: "1 1 180px" }} />
          <input className="field" type="number" placeholder={`Target (${profile.currency})`} value={newSavingTarget}
            onChange={(e) => setNewSavingTarget(e.target.value)} style={{ ...S.input, width: 140 }} />
          <button className="primaryBtn" onClick={addSaving} style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 22px" }}>Add</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.mut2 }}>Maximum reached — delete a saving space to add another.</div>
      )}
      </>
      )}
    </main>
  );
}

/* ───────────────────────  PROFILE FIELDS (embedded in Settings)  ─────────────────────── */
const DOB_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const DOB_YEARS = Array.from({ length: 90 }, (_, i) => new Date().getFullYear() - i);

function ProfileFields({ profile, persistProfile, onDeleteAccount }) {
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const fileInputRef = useRef(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const initials = `${form.firstName?.[0] || ""}${form.lastName?.[0] || ""}`.toUpperCase() || "Y";

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
    persistProfile({ ...form, firstName: form.firstName.trim() || "You", lastName: form.lastName.trim(), email: form.email.trim() });
    setSaved(true); setTimeout(() => setSaved(false), 1800);
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
          <button onClick={() => set({ avatar: "" })} title="Remove photo" style={S.deleteAvatarBtn}><IconTrash /></button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>First name</label>
          <input className="field" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} style={{ ...S.input, width: "100%" }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Last name</label>
          <input className="field" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} style={{ ...S.input, width: "100%" }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Sex (optional)</label>
          <select className="field" value={form.sex} onChange={(e) => set({ sex: e.target.value })} style={{ ...S.input, width: "100%" }}>
            <option value="">Prefer not to say</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Date of birth (optional)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="field" value={form.dobDay} onChange={(e) => set({ dobDay: e.target.value })} style={{ ...S.input, flex: 1 }}>
              <option value="">Day</option>
              {DOB_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="field" value={form.dobMonth} onChange={(e) => set({ dobMonth: e.target.value })} style={{ ...S.input, flex: 1.4 }}>
              <option value="">Month</option>
              {MONTH_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="field" value={form.dobYear} onChange={(e) => set({ dobYear: e.target.value })} style={{ ...S.input, flex: 1 }}>
              <option value="">Year</option>
              {DOB_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <label style={S.label}>Email address</label>
      <input className="field" type="email" placeholder="you@example.com" value={form.email}
        onChange={(e) => set({ email: e.target.value })} style={{ ...S.input, width: "100%" }} />

      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, marginTop: 22, marginBottom: 4 }}>Localization settings</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Account currency</label>
          <select className="field" value={form.currency} onChange={(e) => set({ currency: e.target.value })} style={{ ...S.input, width: "100%" }}>
            {CURRENCY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Language</label>
          <select className="field" value={form.language} onChange={(e) => set({ language: e.target.value })} style={{ ...S.input, width: "100%" }}>
            {LANGUAGE_OPTIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <div style={{ fontSize: 11, color: T.mut2, marginTop: 4 }}>Saved with your profile — the app's interface stays in English for now.</div>
        </div>
      </div>

      {saved && <div style={{ color: T.darkSoft, fontSize: 12, marginTop: 12 }}>✓ Settings updated</div>}
      <button className="primaryBtn" onClick={save} style={S.primaryBtn}>Update my settings</button>

      <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 22, paddingTop: 16, textAlign: "right" }}>
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} style={S.deleteAccountLink}>Delete account</button>
        ) : (
          <span style={{ fontSize: 12.5, color: T.mut }}>
            This wipes all local data. Are you sure?{" "}
            <button onClick={onDeleteAccount} style={{ ...S.deleteAccountLink, color: T.rose, fontWeight: 700 }}>Yes, delete everything</button>
            {" · "}
            <button onClick={() => setConfirmDel(false)} style={S.deleteAccountLink}>Cancel</button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────  SMALL PIECES  ─────────────────────── */
function Modal({ children, onClose }) {
  return (
    <div style={S.modalBack} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={S.modalClose} title="Close">✕</button>
        {children}
      </div>
    </div>
  );
}
/* Curated coolors.co-style palette — every value a distinct hue so no two suggestions read alike. */
const SWATCHES = [
  "#2E9B8F", "#4A90A4", "#5B8DEF", "#118AB2",
  "#06D6A0", "#4FB878", "#7FE6A0", "#8FA88E",
  "#FFD166", "#E0A93F", "#E8B04B", "#FF8C42",
  "#EF476F", "#EF5A6F", "#F15BB5", "#9B5DE5",
  "#A97FC0", "#C77DFF", "#073B4C", "#00BBF9",
];

/* ─────────  color-space helpers (hex ⇄ hsv) for the wheel picker  ───────── */
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

/* ─────────  draggable saturation/value square + hue slider  ───────── */
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
  }, [hsv]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const [mode, setMode] = useState("suggested"); // "suggested" | "wheel"
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
function MiniCard({ label, value, color }) {
  return (
    <div style={S.heroMini}>
      <div style={{ fontSize: 10.5, letterSpacing: 1.3, color: "#BFE0C9", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, color: color || "#fff", fontVariantNumeric: "tabular-nums", marginTop: 4, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function Card({ title, sub, filter, children }) {
  return (
    <section style={S.card}>
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
function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "0 8px 20px rgba(16,40,30,0.14)" }}>
      {label && <div style={{ color: T.mut2, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color || p.payload?.fill || T.text }}>
          {p.name}: {fm(p.value)} PKR
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────  STYLES  ─────────────────────── */
const FONT_DISPLAY = "'Ubuntu','Segoe UI',sans-serif";
const FONT_BODY = "'Ubuntu','Segoe UI',sans-serif";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@300;400;500;700&display=swap');
* { box-sizing: border-box; }
body { margin: 0; }
.field:focus { outline: 2px solid ${T.mint}66; border-color: ${T.darkSoft} !important; }
.chip:hover { border-color: ${T.darkSoft}; }
.colorSwatch:hover { transform: scale(1.15); }
.colorSwatchBtn:hover { box-shadow: 0 0 0 1.5px ${T.darkSoft}; }
.avatarMenuItem:hover { background: ${T.surface2}; }
.primaryBtn:hover { filter: brightness(1.12); }
.linkBtn:hover { text-decoration: underline; }
.navItem:hover { background: ${T.mintSoft}; }
.quickBtn:hover { background: ${T.surface2}; }
.tblRow:hover { background: ${T.surface2}; }
.txnRow { background: ${T.surface}; }
.txnRow:hover { background: ${T.surface2}; }
.txnRow .editHint { opacity: 0; transition: opacity .15s; }
.txnRow:hover .editHint { opacity: 1; }
@media (max-width: 640px) { .txnRow .editHint { opacity: 1; } }

.appShell { display: flex; min-height: 100vh; }
.sidebar { width: 236px; flex-shrink: 0; }
.sidebarNav { display: flex; flex-direction: column; gap: 4px; }
@media (max-width: 900px) {
  .appShell { flex-direction: column; }
  .sidebar { width: 100%; position: sticky; top: 0; z-index: 40; border-right: none !important; border-bottom: 1px solid ${T.line}; }
  .sidebarNav { flex-direction: row; overflow-x: auto; }
  .navItem .navLabel { display: none; }
  .navCaption { display: none; }
  .sidebarFoot { display: none; }
}
.dashGrid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; }
@media (max-width: 980px) { .dashGrid { grid-template-columns: 1fr; } }
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
  sidebarFoot: { marginTop: "auto", fontSize: 11, color: T.mut2, letterSpacing: 0.5, padding: "0 8px" },

  topbar: {
    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap",
    maxWidth: 1180, margin: "0 auto", padding: "24px 32px 20px",
  },
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
    display: "flex", alignItems: "center", gap: 8, background: T.mintSoft, color: "#1F7A46", fontSize: 12.5, fontWeight: 600,
    padding: "8px 12px", borderRadius: 10,
  },
  activeSearchClear: { background: "transparent", border: "none", color: "#1F7A46", cursor: "pointer", fontSize: 12, padding: 0 },

  statusBar: {
    display: "flex", alignItems: "center", gap: 10,
  },
  stepBtn: {
    width: 32, height: 32, borderRadius: 10, background: T.surface, border: `1px solid ${T.line}`,
    color: T.text, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stepBtnDisabled: { color: T.mut2, cursor: "default", opacity: 0.5 },
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

  main: { maxWidth: 1180, margin: "0 auto", padding: "20px 32px 60px" },

  hero: {
    flex: "1.6 1 420px", display: "flex", flexDirection: "column", gap: 14,
    background: `linear-gradient(150deg, ${T.dark}, ${T.darkSoft})`, borderRadius: 20, padding: 26,
    color: "#EAF7EE", boxShadow: "0 16px 32px rgba(15,40,28,0.22)",
  },
  kicker: { fontSize: 11, letterSpacing: 2.2, color: "#9FCBAE", fontWeight: 600 },
  kicker2: { fontSize: 11, letterSpacing: 2.2, color: T.mut2, fontWeight: 600 },
  heroNumber: { fontFamily: FONT_DISPLAY, fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 },
  heroCur: { fontSize: 16, color: "#9FCBAE", fontWeight: 400 },
  flowBarWrap: { height: 9, borderRadius: 6, background: "rgba(255,255,255,0.16)", overflow: "hidden" },
  flowBar: { height: "100%", background: T.mint, borderRadius: 6, transition: "width .4s" },
  flowLegend: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#CFE9D6" },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  heroMiniRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: "auto" },
  heroMini: { flex: "1 1 100px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: "10px 14px" },

  quickActions: { flex: "1 1 260px", background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22, boxShadow: "0 1px 2px rgba(16,40,30,0.04)" },
  quickTitle: { fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 },
  quickGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  quickBtn: {
    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
    border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 12px", cursor: "pointer",
    fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: T.text,
  },
  quickIcon: { width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" },

  statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16, marginBottom: 20 },
  statCard: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 18, padding: 20, boxShadow: "0 1px 2px rgba(16,40,30,0.04)" },
  statTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  statIcon: { width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" },
  changeBadge: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
  changeUp: { background: T.mintSoft, color: "#1F7A46" },
  changeDown: { background: T.roseSoft, color: T.rose },
  statValue: { fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  statLabel: { fontSize: 12.5, color: T.mut, marginTop: 4 },

  card: { background: T.surface, border: `1px solid ${T.line}`, borderRadius: 20, padding: 22, marginBottom: 20, boxShadow: "0 1px 2px rgba(16,40,30,0.04)", height: "100%", display: "flex", flexDirection: "column" },
  statTabs: { display: "flex", gap: 24, marginBottom: 20 },
  statTab: {
    flex: 1, background: "transparent", border: "none", borderBottom: `2px solid ${T.line}`,
    padding: "0 0 12px", fontSize: 15, fontWeight: 700, color: T.mut2, cursor: "pointer",
    fontFamily: FONT_BODY, textAlign: "left",
  },
  statTabActive: { color: T.text, borderBottom: `2px solid ${T.darkSoft}` },
  statTabAmt: { fontWeight: 400, opacity: 0.8 },
  legendRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14.5, color: T.text, padding: "11px 0" },
  pctBadge: { fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 9, minWidth: 40, textAlign: "center" },
  donutCenter: { position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" },
  donutCenterLabel: { fontSize: 11, color: T.mut2, textTransform: "capitalize", letterSpacing: 0.5 },
  donutCenterValue: { fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, color: T.text, marginTop: 4 },

  linkBtn: { background: "transparent", border: "none", color: T.darkSoft, fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: "6px 4px" },

  table: { width: "100%", borderCollapse: "collapse", minWidth: 520 },
  th: { textAlign: "left", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: T.mut2, padding: "0 10px 10px", borderBottom: `1px solid ${T.line}`, fontWeight: 600 },
  tr: {},
  td: { padding: "12px 10px", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 },
  tdMain: { color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 },
  tdSub: { fontSize: 11.5, color: T.mut2, marginTop: 2 },
  statusPill: { display: "inline-block", fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 20 },
  pillIncome: { background: T.mintSoft, color: "#1F7A46" },
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
  txnAmt: { fontFamily: FONT_DISPLAY, fontSize: 14.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", flexShrink: 0 },
  editHint: { color: T.mut2, fontSize: 13, flexShrink: 0 },
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
    marginTop: 20, background: T.dark, color: "#fff",
    border: "none", borderRadius: 12, padding: "13px 0", fontSize: 14.5, fontWeight: 700,
    fontFamily: FONT_DISPLAY, cursor: "pointer", letterSpacing: 0.3,
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
    fontSize: 12.5, color: "#8A6416", marginBottom: 14,
  },
  settingsTabBar: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 },
  settingsTabBtn: {
    background: T.surface, border: `1px solid ${T.line}`, color: T.mut, padding: "8px 16px",
    borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT_BODY,
  },
  settingsTabBtnActive: { background: T.dark, color: "#fff", border: `1px solid ${T.dark}` },
  uploadAvatarBtn: {
    display: "flex", alignItems: "center", gap: 8, background: T.mintSoft, color: "#1F7A46", border: "none",
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
    background: T.mintSoft, color: "#1F7A46", fontSize: 11, fontWeight: 700, padding: "4px 12px",
    borderRadius: 20, letterSpacing: 0.5, textTransform: "uppercase",
  },
};
