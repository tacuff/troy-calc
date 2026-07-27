import React, { useState, useMemo } from "react";

/* ---------- helpers ---------- */
const usd = (n, cents = false) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

const addMonths = (d, n) => {
  const c = new Date(d.getTime());
  c.setUTCMonth(c.getUTCMonth() + n);
  return c;
};
const fmtMonYr = (d) => d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function monthlyPayment(principal, annualRate, termMonths) {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

function amortize(principal, annualRate, termMonths, startDate, extraMonthly = 0) {
  let balance = principal;
  const rateM = annualRate / 12;
  const payment = monthlyPayment(principal, annualRate, termMonths);
  const schedule = [];
  let totalInterest = 0;
  let period = 0;
  const cap = termMonths + 600;

  while (balance > 0.005 && period < cap) {
    period += 1;
    const interest = balance * rateM;
    const schedPrincipal = Math.min(payment - interest, balance);
    const extra = Math.max(Math.min(extraMonthly, balance - schedPrincipal), 0);
    const principalPaid = schedPrincipal + extra;
    balance = balance - principalPaid;
    totalInterest += interest;
    schedule.push({
      period,
      date: addMonths(startDate, period - 1),
      interest,
      principal: principalPaid,
      balance: Math.max(balance, 0),
    });
    if (balance <= 0.005) break;
  }
  return { schedule, totalInterest, payment, monthsToPayoff: period };
}

/* ---------- design tokens ---------- */
const C = {
  ink: "#1B2430",
  paper: "#F0EEE6",
  surface: "#FFFFFF",
  principal: "#1F4E5F",
  interest: "#C1652F",
  muted: "#6B7280",
  rule: "#D8D3C4",
};

const RANGE_CSS = `
  input[type="range"].mortgage-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; border-radius: 2px;
    background: ${C.rule}; outline: none; margin: 8px 0 2px;
  }
  input[type="range"].mortgage-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: ${C.principal}; border: 2px solid ${C.surface};
    box-shadow: 0 0 0 1px ${C.principal}; cursor: pointer; margin-top: -1px;
  }
  input[type="range"].mortgage-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${C.surface};
    background: ${C.principal}; box-shadow: 0 0 0 1px ${C.principal}; cursor: pointer;
  }
  input[type="range"].mortgage-slider::-moz-range-track { background: ${C.rule}; height: 4px; border-radius: 2px; }
`;

/* ---------- stable, module-scope subcomponents ----------
   Defined outside the calculator function so React sees the same
   component identity across renders. Defining these inside the
   function body would remount the <input> on every keystroke/drag
   tick, which silently breaks click-and-drag on range inputs. */

const NUMBER_FIELD_STYLE = {
  width: 84, font: "600 14px 'Source Serif 4', Georgia, serif", color: C.ink,
  border: `1px solid ${C.rule}`, borderRadius: 2, padding: "3px 6px", textAlign: "right",
  background: C.surface, fontFamily: "inherit",
};

const SliderField = ({ label, value, onChange, min, max, step = 1, suffix, prefix }) => (
  <div style={{ marginBottom: 15 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <span style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        {prefix && <span style={{ fontSize: 13, color: C.muted }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          style={NUMBER_FIELD_STYLE}
        />
        {suffix && <span style={{ fontSize: 12, color: C.muted }}>{suffix}</span>}
      </div>
    </div>
    <input
      type="range" className="mortgage-slider"
      min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
      <span>{prefix || ""}{min}{suffix ? ` ${suffix}` : ""}</span>
      <span>{prefix || ""}{max}{suffix ? ` ${suffix}` : ""}</span>
    </div>
  </div>
);

const StatRow = ({ label, value, color, strong }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
    <span style={{ font: `${strong ? 700 : 500} ${strong ? 16 : 14}px 'Source Serif 4', Georgia, serif`, color: color || C.ink }}>{value}</span>
  </div>
);

const TabButton = ({ id, mode, onSelect, children }) => (
  <button
    onClick={() => onSelect(id)}
    style={{
      padding: "9px 18px", border: `1px solid ${C.ink}`, background: mode === id ? C.ink : "transparent",
      color: mode === id ? C.paper : C.ink, borderRadius: 2, fontSize: 13, fontWeight: 600,
      cursor: "pointer", fontFamily: "'Inter', system-ui, sans-serif",
    }}
  >
    {children}
  </button>
);

export default function MortgageCalculator() {
  const [principal, setPrincipal] = useState(500000);
  const [rate, setRate] = useState(6.25);
  const [term, setTerm] = useState(30);
  const [extraMonthly, setExtraMonthly] = useState(300);
  const [mode, setMode] = useState("extra"); // "extra" | "refi"

  // taxes & insurance (annual $, applies to both modes)
  const [annualPropertyTax, setAnnualPropertyTax] = useState(6000);
  const [annualHomeInsurance, setAnnualHomeInsurance] = useState(1800);

  // refinance-specific
  const [remainingMonths, setRemainingMonths] = useState(336);
  const [newRate, setNewRate] = useState(5.6);
  const [newTerm, setNewTerm] = useState(30);
  const [closingCosts, setClosingCosts] = useState(6000);

  const startDate = useMemo(() => new Date(Date.UTC(2026, 0, 1)), []);

  const base = useMemo(
    () => amortize(+principal, +rate / 100, +term * 12, startDate, 0),
    [principal, rate, term, startDate]
  );
  const withExtra = useMemo(
    () => amortize(+principal, +rate / 100, +term * 12, startDate, +extraMonthly),
    [principal, rate, term, extraMonthly, startDate]
  );

  const refi = useMemo(() => {
    const currentPmt = monthlyPayment(+principal, +rate / 100, +remainingMonths);
    const currentAm = amortize(+principal, +rate / 100, +remainingMonths, startDate, 0);
    const newPmt = monthlyPayment(+principal, +newRate / 100, +newTerm * 12);
    const newAm = amortize(+principal, +newRate / 100, +newTerm * 12, startDate, 0);
    const monthlySavings = currentPmt - newPmt;
    const breakeven = monthlySavings > 0 ? closingCosts / monthlySavings : null;
    return {
      currentPmt, newPmt, monthlySavings, breakeven,
      currentInterest: currentAm.totalInterest, newInterest: newAm.totalInterest,
      lifetimeDiff: currentAm.totalInterest - newAm.totalInterest,
    };
  }, [principal, rate, remainingMonths, newRate, newTerm, closingCosts, startDate]);

  const monthlyTaxInsurance = (+annualPropertyTax + +annualHomeInsurance) / 12;

  const interestSaved = base.totalInterest - withExtra.totalInterest;
  const monthsSaved = base.monthsToPayoff - withExtra.monthsToPayoff;
  const yearsSaved = (monthsSaved / 12).toFixed(1);

  /* --- chart geometry: cumulative principal vs interest over baseline schedule --- */
  const chartW = 640, chartH = 200, pad = 28;
  const maxMonths = base.schedule.length;
  const stepEvery = Math.max(Math.round(maxMonths / 80), 1);
  const points = base.schedule.filter((_, i) => i % stepEvery === 0 || i === base.schedule.length - 1);
  const maxPayment = Math.max(...points.map((p) => p.interest + p.principal));
  const x = (i) => pad + (i / (points.length - 1)) * (chartW - pad * 2);
  const y = (v) => chartH - pad - (v / maxPayment) * (chartH - pad * 1.4);

  const principalPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.principal)}`).join(" ");
  const interestPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.interest)}`).join(" ");
  const crossIdx = points.findIndex((p) => p.principal >= p.interest);


  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", padding: "30px 20px 60px" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
            Mortgage amortization
          </div>
          <h1 style={{ margin: 0, fontFamily: "'Source Serif 4', Georgia, serif", fontSize: "clamp(28px, 4.5vw, 42px)", fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.08 }}>
            Where every payment actually goes
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 560, fontSize: 15, color: C.muted, lineHeight: 1.55 }}>
            Early payments are mostly interest. The chart below shows the month your payment tips toward principal — and how much extra payments or refinancing move it.
          </p>
        </header>

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <TabButton id="extra" mode={mode} onSelect={setMode}>Extra payments</TabButton>
          <TabButton id="refi" mode={mode} onSelect={setMode}>Refinance</TabButton>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(230px, 280px) 1fr", gap: 20, alignItems: "start" }}>
          {/* inputs */}
          <aside style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "16px 16px 4px", borderRadius: 2 }}>
            <style>{RANGE_CSS}</style>
            <SliderField label="Loan amount" value={principal} onChange={setPrincipal} min={50000} max={2000000} step={5000} prefix="$" />
            <SliderField label="Interest rate" value={rate} onChange={setRate} min={2} max={10} step={0.05} suffix="%" />
            {mode === "extra" ? (
              <>
                <SliderField label="Term" value={term} onChange={setTerm} min={5} max={30} step={1} suffix="yrs" />
                <div style={{ height: 1, background: C.rule, margin: "6px 0 14px" }} />
                <SliderField label="Extra monthly payment" value={extraMonthly} onChange={setExtraMonthly} min={0} max={2000} step={25} prefix="$" />
              </>
            ) : (
              <>
                <SliderField label="Months remaining" value={remainingMonths} onChange={setRemainingMonths} min={1} max={360} step={1} suffix="mo" />
                <div style={{ height: 1, background: C.rule, margin: "6px 0 14px" }} />
                <SliderField label="New rate" value={newRate} onChange={setNewRate} min={2} max={10} step={0.05} suffix="%" />
                <SliderField label="New term" value={newTerm} onChange={setNewTerm} min={5} max={30} step={1} suffix="yrs" />
                <SliderField label="Closing costs" value={closingCosts} onChange={setClosingCosts} min={0} max={20000} step={250} prefix="$" />
              </>
            )}

            <div style={{ height: 1, background: C.rule, margin: "6px 0 14px" }} />
            <div style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
              Home insurance & taxes
            </div>
            <SliderField label="Annual property tax" value={annualPropertyTax} onChange={setAnnualPropertyTax} min={0} max={20000} step={100} prefix="$" />
            <SliderField label="Annual home insurance" value={annualHomeInsurance} onChange={setAnnualHomeInsurance} min={0} max={8000} step={50} prefix="$" />
          </aside>

          {/* results */}
          <main>
            {mode === "extra" ? (
              <>
                {/* signature chart */}
                <div style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "20px 20px 14px", borderRadius: 2, marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontFamily: "'Source Serif 4', serif", fontSize: 16, fontWeight: 600 }}>
                      Principal vs. interest, baseline schedule
                    </h3>
                    <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
                      <span style={{ color: C.principal }}>● Principal</span>
                      <span style={{ color: C.interest }}>● Interest</span>
                    </div>
                  </div>
                  <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" style={{ display: "block" }}>
                    <line x1={pad} y1={chartH - pad} x2={chartW - pad} y2={chartH - pad} stroke={C.rule} strokeWidth="1" />
                    {crossIdx > 0 && (
                      <line x1={x(crossIdx)} y1={pad * 0.4} x2={x(crossIdx)} y2={chartH - pad} stroke={C.rule} strokeDasharray="3 3" />
                    )}
                    <path d={interestPath} fill="none" stroke={C.interest} strokeWidth="2.2" />
                    <path d={principalPath} fill="none" stroke={C.principal} strokeWidth="2.2" />
                    {crossIdx > 0 && (
                      <text x={x(crossIdx)} y={pad * 0.2 + 8} fontSize="10" fill={C.muted} textAnchor="middle">
                        crossover · {fmtMonYr(points[crossIdx].date)}
                      </text>
                    )}
                  </svg>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 16, marginBottom: 18 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderTop: `3px solid ${C.muted}`, padding: "16px 18px", borderRadius: 2 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted }}>Baseline</h4>
                    <StatRow label="Principal & interest" value={usd(base.payment, true)} />
                    <StatRow label="Tax & insurance" value={usd(monthlyTaxInsurance, true)} />
                    <StatRow label="Total monthly payment" value={usd(base.payment + monthlyTaxInsurance, true)} strong />
                    <StatRow label="Payoff date" value={fmtMonYr(base.schedule[base.schedule.length - 1]?.date || startDate)} />
                    <StatRow label="Total interest" value={usd(base.totalInterest)} strong color={C.interest} />
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderTop: `3px solid ${C.principal}`, padding: "16px 18px", borderRadius: 2 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: C.principal }}>With extra payment</h4>
                    <StatRow label="Principal, interest & extra" value={usd(base.payment + (+extraMonthly), true)} />
                    <StatRow label="Tax & insurance" value={usd(monthlyTaxInsurance, true)} />
                    <StatRow label="Total monthly payment" value={usd(base.payment + (+extraMonthly) + monthlyTaxInsurance, true)} strong color={C.principal} />
                    <StatRow label="Payoff date" value={fmtMonYr(withExtra.schedule[withExtra.schedule.length - 1]?.date || startDate)} />
                    <StatRow label="Total interest" value={usd(withExtra.totalInterest)} strong color={C.principal} />
                  </div>
                </div>

                <div style={{ background: C.ink, color: C.paper, padding: "20px 22px", borderRadius: 2 }}>
                  <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>What the extra payment buys</div>
                  <div style={{ font: "700 clamp(24px,4vw,34px) 'Source Serif 4', serif", marginBottom: 4 }}>{usd(interestSaved)} saved</div>
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
                    Payoff moves up {yearsSaved} years ({monthsSaved} months) for {usd(+extraMonthly)}/mo extra — {usd(+extraMonthly * monthsSaved)} paid in, {usd(interestSaved)} back in interest not charged.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 16, marginBottom: 18 }}>
                  <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderTop: `3px solid ${C.muted}`, padding: "16px 18px", borderRadius: 2 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted }}>Keep current loan</h4>
                    <StatRow label="Principal & interest" value={usd(refi.currentPmt, true)} />
                    <StatRow label="Tax & insurance" value={usd(monthlyTaxInsurance, true)} />
                    <StatRow label="Total monthly payment" value={usd(refi.currentPmt + monthlyTaxInsurance, true)} strong />
                    <StatRow label="Remaining interest" value={usd(refi.currentInterest)} strong />
                  </div>
                  <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderTop: `3px solid ${C.principal}`, padding: "16px 18px", borderRadius: 2 }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: C.principal }}>Refinance</h4>
                    <StatRow label="New principal & interest" value={usd(refi.newPmt, true)} />
                    <StatRow label="Tax & insurance" value={usd(monthlyTaxInsurance, true)} />
                    <StatRow label="New total monthly payment" value={usd(refi.newPmt + monthlyTaxInsurance, true)} strong color={C.principal} />
                    <StatRow label="New total interest" value={usd(refi.newInterest)} strong color={C.principal} />
                  </div>
                </div>

                <div style={{ background: C.ink, color: C.paper, padding: "20px 22px", borderRadius: 2, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Breakeven on closing costs</div>
                  <div style={{ font: "700 clamp(24px,4vw,34px) 'Source Serif 4', serif", marginBottom: 4 }}>
                    {refi.breakeven ? `${refi.breakeven.toFixed(1)} months` : "Never — new rate is higher"}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>
                    {refi.monthlySavings > 0
                      ? `${usd(refi.monthlySavings, true)}/mo saved. ${usd(closingCosts)} in closing costs pays for itself in ${refi.breakeven?.toFixed(1)} months, then it's pure savings.`
                      : "This refinance costs more per month than staying put — check the numbers before proceeding."}
                  </p>
                </div>

                <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                  Lifetime interest difference: <strong style={{ color: C.ink }}>{usd(Math.abs(refi.lifetimeDiff))}</strong> {refi.lifetimeDiff > 0 ? "saved" : "more"} by refinancing, comparing the full remaining term of each loan.
                </p>
              </>
            )}

            <p style={{ marginTop: 18, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Includes principal, interest, property tax, and home insurance. Excludes PMI and points. Educational tool, not financial advice.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
