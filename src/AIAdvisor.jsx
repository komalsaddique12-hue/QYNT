import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";

/* ─── THEME ─── */
const T = {
  surface: "var(--surface)", surface2: "var(--surface2)", line: "var(--line)",
  dark: "var(--dark)", darkSoft: "var(--darkSoft)", deepGreen: "var(--deepGreen)",
  mint: "var(--mint)", mintSoft: "var(--mintSoft)",
  gold: "var(--gold)", goldSoft: "var(--goldSoft)",
  rose: "var(--rose)", roseSoft: "var(--roseSoft)",
  text: "var(--text)", mut: "var(--mut)", mut2: "var(--mut2)",
};
const FONT_DISPLAY = "'Poppins','Ubuntu','Segoe UI',sans-serif";
const FONT_BODY = "'Inter','Ubuntu','Segoe UI',sans-serif";

const fm = (n, dec = 0) => Number(n || 0).toLocaleString("en-PK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const money = (n, currency) => `${fm(n)} ${currency}`;
const monthLabel = (m) => {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return new Date(+y, +mo - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
};
const dateLabel = (d) => new Date(d + "T00:00").toLocaleDateString("en", { month: "short", day: "2-digit", year: "numeric" });

/* ─── SCOPE HELPERS (identical to ExpenseTracker) ─── */
const iso = (d) => d.toISOString().slice(0, 10);
const weekBounds = (dateStr) => {
  const d = new Date(dateStr + "T00:00");
  const day = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
};
function scopeRange(s) {
  if (!s) return null;
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
  if (!s) return "All time";
  if (s.mode === "year" && s.year) return `Year ${s.year}`;
  if (s.mode === "month" && s.month) return monthLabel(s.month);
  if (s.mode === "week" && s.week) {
    const [a, b] = weekBounds(s.week);
    return `${dateLabel(a)} → ${dateLabel(b)}`;
  }
  if (s.mode === "custom" && (s.from || s.to)) {
    return `${s.from ? dateLabel(s.from) : "…"} → ${s.to ? dateLabel(s.to) : "…"}`;
  }
  return "All time";
}

/* ─── ICONS ─── */
function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  );
}
function IconWarning() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
function IconMoney() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

/* ─── ANALYSIS ENGINE ─── */
function analyze(txns, budgets, scope) {
  if (!txns || txns.length === 0) return { empty: true, noTxns: true };

  const inRange = txns.filter((t) => inScope(t.date, scope));
  if (inRange.length === 0) return { empty: true, noDataInRange: true };

  const sum = (arr, sign) => arr
    .filter((t) => (sign === "in" ? t.amount > 0 : t.amount < 0))
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const group = (list, keyFn) => {
    const map = {};
    list.filter((t) => t.amount < 0).forEach((t) => {
      const key = keyFn(t);
      map[key] = (map[key] || 0) + Math.abs(t.amount);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const currIncome = sum(inRange, "in");
  const currExpense = sum(inRange, "out");
  const currSavings = currIncome - currExpense;

  const currByCat = group(inRange, (t) => t.head);
  const currBySub = group(inRange, (t) => t.cat || t.head);

  const budgetAnalysis = (budgets || []).map((b) => {
    const spent = inRange
      .filter((t) => t.head === b.head && t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    const pct = b.limit > 0 ? (spent / b.limit) * 100 : 0;
    const over = spent > b.limit;
    const remaining = b.limit - spent;
    const status = over ? "over" : pct >= 80 ? "warning" : pct >= 50 ? "watch" : "safe";
    return { head: b.head, limit: b.limit, spent, pct, over, remaining, status };
  });

  const totalBudget = (budgets || []).reduce((s, b) => s + b.limit, 0);
  const totalBudgetSpent = budgetAnalysis.reduce((s, b) => s + b.spent, 0);
  const totalBudgetPct = totalBudget > 0 ? (totalBudgetSpent / totalBudget) * 100 : 0;

  const range = scopeRange(scope);
  let daysElapsed = 1;
  if (range) {
    const start = new Date(range[0] + "T00:00");
    const end = new Date(range[1] + "T00:00");
    const today = new Date();
    const cappedEnd = today < end ? today : end;
    daysElapsed = Math.max(1, Math.round((cappedEnd - start) / 86400000) + 1);
  } else {
    const dates = [...new Set(inRange.map((t) => t.date))];
    daysElapsed = Math.max(1, dates.length);
  }
  const avgDaily = daysElapsed > 0 ? currExpense / daysElapsed : 0;

  return {
    empty: false,
    currIncome, currExpense, currSavings,
    currByCat, currBySub,
    budgetAnalysis,
    totalBudget, totalBudgetSpent, totalBudgetPct,
    currTxnCount: inRange.length,
    currTotal: currExpense,
    daysElapsed, avgDaily,
    scopeLabel: scopeLabel(scope),
  };
}

/* ─── AI INSIGHTS — MAX 3 ─── */
function buildInsights(a, currency) {
  if (a.empty) return [];
  const candidates = [];

  const overBudgets = a.budgetAnalysis.filter(b => b.over);
  if (overBudgets.length > 0) {
    const worst = [...overBudgets].sort((a, b) => b.pct - a.pct)[0];
    candidates.push({
      type: "danger", icon: "alert",
      title: `${overBudgets.length} budget${overBudgets.length > 1 ? "s" : ""} over limit`,
      body: `"${worst.head}" is worst at ${worst.pct.toFixed(0)}% — ${money(worst.spent, currency)} spent vs ${money(worst.limit, currency)} limit.`,
      priority: 1,
    });
  }

  if (a.currIncome > 0 && a.currSavings < 0) {
    candidates.push({
      type: "danger", icon: "money",
      title: "Spending exceeds income",
      body: `You spent ${money(Math.abs(a.currSavings), currency)} more than you earned in ${a.scopeLabel}.`,
      priority: 2,
    });
  }

  const warningBudgets = a.budgetAnalysis.filter(b => b.status === "warning");
  if (warningBudgets.length > 0 && overBudgets.length === 0) {
    const w = [...warningBudgets].sort((a, b) => b.pct - a.pct)[0];
    candidates.push({
      type: "warning", icon: "warning",
      title: `${w.head} at ${w.pct.toFixed(0)}% of budget`,
      body: `Only ${money(w.remaining, currency)} left. Slow down on this category.`,
      priority: 3,
    });
  }

  if (a.currIncome > 0) {
    const rate = (a.currSavings / a.currIncome) * 100;
    if (rate >= 0 && rate < 15) {
      candidates.push({
        type: "warning", icon: "money",
        title: `Savings rate only ${rate.toFixed(0)}%`,
        body: `Target is 20%. You need ${money(0.20 * a.currIncome - a.currSavings, currency)} more saved in ${a.scopeLabel}.`,
        priority: 4,
      });
    }
  }

  if (a.currByCat.length > 0 && a.currIncome > 0) {
    const top = a.currByCat[0];
    const pctOfIncome = (top.value / a.currIncome) * 100;
    if (pctOfIncome >= 35) {
      candidates.push({
        type: "warning", icon: "warning",
        title: `${top.name} eats ${pctOfIncome.toFixed(0)}% of income`,
        body: `${money(top.value, currency)} on ${top.name}. Cut 15% → save ${money(top.value * 0.15, currency)}.`,
        priority: 5,
      });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const top3 = candidates.slice(0, 3);

  if (top3.length === 0) {
    top3.push({
      type: "success", icon: "check",
      title: "All clear — finances look healthy ✓",
      body: `Budgets on track, savings rate is above target, and no category is out of control in ${a.scopeLabel}.`,
    });
  }
  return top3;
}

/* ─── SMALL COMPONENTS ─── */
function InsightCard({ insight }) {
  const palette = {
    danger: { bg: "#ffebee", border: "#f44336", color: "#b71c1c" },
    warning: { bg: "#fff8e1", border: "#ffc107", color: "#856404" },
    success: { bg: "#e8f5e9", border: "#4caf50", color: "#1b5e20" },
  }[insight.type] || { bg: "#f5f5f5", border: "#999", color: "#333" };

  const iconEl = insight.icon === "alert" ? <IconAlert />
    : insight.icon === "warning" ? <IconWarning />
    : insight.icon === "money" ? <IconMoney />
    : <IconCheck />;

  return (
    <div style={{
      background: palette.bg, borderLeft: `5px solid ${palette.border}`, color: palette.color,
      borderRadius: 10, padding: "16px 20px", marginBottom: 12,
      display: "flex", gap: 14, alignItems: "flex-start",
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 10, background: palette.border, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {iconEl}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 800, marginBottom: 6, letterSpacing: -0.2 }}>
          {insight.title}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.55, fontWeight: 500 }}>
          {insight.body}
        </div>
      </div>
    </div>
  );
}

function TopCard({ label, sub, value, valueColor }) {
  return (
    <div style={{
      background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 12,
      padding: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 11, color: T.mut2, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: T.mut2, marginBottom: 8, fontWeight: 500 }}>{sub}</div>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700,
        color: valueColor || T.text, letterSpacing: -0.3,
      }}>
        {value}
      </div>
    </div>
  );
}

function SideCard({ title, children, maxHeight }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12, padding: 14,
      border: `1px solid ${T.line}`,
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 11, color: T.mut2, textTransform: "uppercase",
        letterSpacing: 1, marginBottom: 12, borderBottom: `1px solid ${T.line}`, paddingBottom: 8, fontWeight: 700,
      }}>
        {title}
      </div>
      <div style={maxHeight ? { maxHeight, overflowY: "auto" } : {}}>{children}</div>
    </div>
  );
}

function ListItem({ label, value, dotColor, bar, barColor }) {
  return (
    <div style={{ padding: "6px 0", borderBottom: `1px dashed ${T.line}` }}>
      <div style={{
        display: "flex", justifyContent: "space-between", fontSize: 12.5,
        color: T.text, fontWeight: 500, marginBottom: bar ? 4 : 0,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dotColor && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
          {label}
        </span>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, color: T.darkSoft, letterSpacing: -0.2, flexShrink: 0, marginLeft: 8 }}>
          {value}
        </span>
      </div>
      {bar != null && (
        <div style={{ height: 4, borderRadius: 2, background: T.surface2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, bar)}%`, background: barColor, transition: "width .4s" }} />
        </div>
      )}
    </div>
  );
}

function ChartBox({ title, sub, children, height = 200 }) {
  return (
    <div style={{
      background: "var(--surface)", borderRadius: 12, padding: 14,
      border: `1px solid ${T.line}`,
    }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {title}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: T.mut2, marginBottom: 10, fontWeight: 500 }}>{sub}</div>}
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─── */
export default function AIAdvisor({ txns, budgets = [], currency = "PKR", scope = null }) {
  const a = useMemo(() => analyze(txns, budgets, scope), [txns, budgets, scope]);
  const insights = useMemo(() => buildInsights(a, currency), [a, currency]);

  if (!txns || txns.length === 0) {
    return (
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 32px 60px" }}>
        <div style={{ background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 20, padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            No transactions yet
          </div>
          <div style={{ fontSize: 13, color: T.mut2 }}>
            Add transactions and set budgets — the advisor will analyze everything automatically.
          </div>
        </div>
      </main>
    );
  }

  if (a.empty) {
    return (
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "10px 32px 60px" }}>
        <div style={{
          background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`,
          borderRadius: 16, padding: "20px 26px", color: "#EAF7EE", marginBottom: 18,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#9FCBAE", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
            Analyzing — {scopeLabel(scope)}
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 800 }}>
            AI FINANCIAL ADVISOR
          </div>
        </div>
        <div style={{ background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 20, padding: 40, textAlign: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            No transactions in this range
          </div>
          <div style={{ fontSize: 13, color: T.mut2 }}>
            Try selecting a different time range from the calendar above.
          </div>
        </div>
      </main>
    );
  }

  const pieData = a.currByCat.slice(0, 5);
  const pieColors = ["#1a4d4a", "#2d7a75", "#7FE6A0", "#E0A93F", "#EF5A6F"];
  const topSubs = a.currBySub.slice(0, 6);
  const budgetChartData = a.budgetAnalysis.map(b => ({
    name: b.head.length > 12 ? b.head.slice(0, 11) + "…" : b.head,
    Limit: b.limit,
    Spent: b.spent,
  }));

  return (
    <main style={{ maxWidth: 1350, margin: "0 auto", padding: "10px 24px 60px" }}>

      {/* ─── HEADER ─── */}
      <div style={{
        background: `linear-gradient(150deg, ${T.dark}, ${T.deepGreen})`,
        borderRadius: 16, padding: "20px 26px", color: "#EAF7EE",
        marginBottom: 18, boxShadow: "0 10px 30px rgba(15,40,28,0.2)",
      }}>
        <div style={{ fontSize: 11, letterSpacing: 1.8, color: "#9FCBAE", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
          Analyzing — {a.scopeLabel}
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 800, letterSpacing: 0.3 }}>
          AI FINANCIAL ADVISOR
        </div>
      </div>

      {/* ─── QUICK STATS ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }} className="topCardsGrid">
        <TopCard label="Income" sub={a.scopeLabel} value={money(a.currIncome, currency)} />
        <TopCard label="Expenses" sub={a.scopeLabel} value={money(a.currExpense, currency)} valueColor={a.currExpense > a.currIncome ? T.rose : T.text} />
        <TopCard label="Net Savings" sub={a.scopeLabel} value={money(a.currSavings, currency)} valueColor={a.currSavings < 0 ? T.rose : T.darkSoft} />
      </div>

      {/* ─── AI INSIGHTS — MAX 3 ─── */}
      <div style={{ marginBottom: 18 }}>
        {insights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
      </div>

      {/* ─── BUDGET HEALTH BANNER ─── */}
      {a.budgetAnalysis.length > 0 && (
        <div style={{
          background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 14,
          padding: 20, marginBottom: 18,
        }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 14, color: T.text, textTransform: "uppercase",
            letterSpacing: 1, marginBottom: 14, borderBottom: `1px solid ${T.line}`,
            paddingBottom: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          }}>
            <IconTarget /> Budget Health — {a.scopeLabel}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={{ textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.mut2, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Total Budget</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.text }}>{money(a.totalBudget, currency)}</div>
            </div>
            <div style={{ textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.mut2, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Spent</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: a.totalBudgetPct >= 100 ? T.rose : T.text }}>{money(a.totalBudgetSpent, currency)}</div>
            </div>
            <div style={{ textAlign: "center", padding: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: T.mut2, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Used</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: a.totalBudgetPct >= 100 ? T.rose : a.totalBudgetPct >= 80 ? T.gold : T.darkSoft }}>
                {a.totalBudgetPct.toFixed(0)}%
              </div>
            </div>
          </div>

          {a.budgetAnalysis.map((b) => {
            const barColor = b.over ? T.rose : b.pct >= 80 ? T.gold : T.darkSoft;
            return (
              <ListItem
                key={b.head}
                label={b.head}
                value={`${money(b.spent, currency)} / ${money(b.limit, currency)} (${b.pct.toFixed(0)}%)`}
                bar={b.pct}
                barColor={barColor}
              />
            );
          })}
        </div>
      )}

      {/* ─── BODY GRID ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 18, alignItems: "flex-start" }} className="advisorGrid">

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <SideCard title="Top 3 Expenses">
            {a.currByCat.slice(0, 3).map((c, i) => (
              <ListItem key={i} label={c.name} value={money(c.value, currency)} dotColor={pieColors[i]} />
            ))}
            {a.currByCat.length === 0 && <div style={{ fontSize: 12, color: T.mut2 }}>No expenses yet.</div>}
          </SideCard>

          <SideCard title="All Expenses" maxHeight={280}>
            {a.currBySub.slice(0, 10).map((s, i) => (
              <ListItem key={i} label={s.name} value={money(s.value, currency)} />
            ))}
            {a.currBySub.length === 0 && <div style={{ fontSize: 12, color: T.mut2 }}>No expenses yet.</div>}
          </SideCard>

          <SideCard title="Range Summary">
            <ListItem label="Total spent" value={money(a.currTotal, currency)} />
            <ListItem label="Transactions" value={a.currTxnCount} />
            <ListItem label="Daily average" value={money(a.avgDaily, currency)} />
          </SideCard>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="chartsGrid">

            {budgetChartData.length > 0 && (
              <ChartBox title="Budget vs Spent" sub="Per Category" height={240}>
                <ResponsiveContainer>
                  <BarChart data={budgetChartData} barGap={4}>
                    <CartesianGrid stroke={T.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: T.mut2, fontSize: 9, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                    <Tooltip contentStyle={{ background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12 }}
                      formatter={(v) => money(v, currency)} />
                    <Legend wrapperStyle={{ fontSize: 10, fontWeight: 600 }} />
                    <Bar dataKey="Limit" fill="#d4c5a9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Spent" fill={T.dark} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}

            <ChartBox title="Category Split" sub="Top 5 Categories" height={240}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => money(v, currency)} />
                  <Legend wrapperStyle={{ fontSize: 10, fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartBox>

            <ChartBox title="Top Expenses" sub="Top 6 Line Items" height={260}>
              <ResponsiveContainer>
                <BarChart data={topSubs} layout="vertical">
                  <CartesianGrid stroke={T.line} horizontal={false} />
                  <XAxis type="number" tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: T.mut2, fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: `1px solid ${T.line}`, borderRadius: 10, fontSize: 12 }}
                    formatter={(v) => money(v, currency)} />
                  <Bar dataKey="value" fill={T.dark} radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>

            <div style={{
              background: "var(--surface)", borderRadius: 12, padding: 18,
              border: `1px solid ${T.line}`,
              display: "flex", flexDirection: "column", justifyContent: "center",
            }}>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 700, color: T.text,
                textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14,
              }}>
                Range at a Glance
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: T.mut2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Savings Rate
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, color: a.currIncome > 0 && (a.currSavings / a.currIncome) * 100 >= 20 ? T.darkSoft : T.gold }}>
                    {a.currIncome > 0 ? ((a.currSavings / a.currIncome) * 100).toFixed(0) : "—"}%
                  </div>
                  <div style={{ fontSize: 11, color: T.mut2, marginTop: 2 }}>of income saved</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: T.mut2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Daily Average
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, color: T.text }}>
                    {money(a.avgDaily, currency)}
                  </div>
                  <div style={{ fontSize: 11, color: T.mut2, marginTop: 2 }}>per day in this range</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: T.mut2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                    Range
                  </div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, color: T.text }}>
                    {a.scopeLabel}
                  </div>
                  <div style={{ fontSize: 11, color: T.mut2, marginTop: 2 }}>{a.daysElapsed} days</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .advisorGrid { grid-template-columns: 1fr !important; }
          .topCardsGrid { grid-template-columns: repeat(2, 1fr) !important; }
          .chartsGrid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .topCardsGrid { grid-template-columns: 1fr !important; }
        }
      `}</style>

    </main>
  );
}