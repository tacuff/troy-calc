import React, { useState, useMemo, useRef, useCallback } from "react";

/* ---------- date helpers ---------- */
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addYears = (d, n) => {
  const c = new Date(d.getTime());
  c.setUTCFullYear(c.getUTCFullYear() + n);
  return c;
};
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);
const usd = (n) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- calculation engine (mirrors espp_engine.py) ---------- */
function analyze({ offeringFmv, purchaseFmv, discount, shares, lookback }, salePrice, saleDate, lot, rates) {
  const base = lookback ? Math.min(offeringFmv, purchaseFmv) : purchaseFmv;
  const pp = base * (1 - discount);
  const qualifying = saleDate >= lot.qualDate;
  let ordPs, capPs, term, capRate, notes = [];

  if (qualifying) {
    const statutory = discount * offeringFmv;
    const gain = salePrice - pp;
    if (gain <= 0) {
      ordPs = 0;
      notes.push("Sold at or below what you paid — no ordinary income, the whole loss is long-term capital.");
    } else {
      ordPs = Math.min(gain, statutory);
      notes.push(
        statutory < gain
          ? "Ordinary income is capped at the offering-date discount. Everything above it is long-term gain."
          : "The gain is smaller than the original discount, so all of it counts as ordinary income."
      );
    }
    capPs = salePrice - pp - ordPs;
    term = "long";
    capRate = rates.ltcg;
  } else {
    ordPs = Math.max(purchaseFmv - pp, 0);
    capPs = salePrice - purchaseFmv;
    const held = (saleDate - lot.purchaseDate) / 86400000;
    term = held > 365 ? "long" : "short";
    capRate = term === "long" ? rates.ltcg : rates.ordinary;
    notes.push("The full purchase-date spread is W-2 income even if the stock dropped afterward.");
    if (capPs < 0) notes.push("You owe ordinary tax on money you never received. The loss is capital and offsets separately.");
  }

  const ordinary = ordPs * shares;
  const capital = capPs * shares;
  const adjBasis = pp + ordPs;
  const taxOrd = ordinary * (rates.ordinary + rates.state);
  const taxCap = capital * (capRate + rates.state);
  const total = taxOrd + taxCap;

  return {
    qualifying, pp, ordinary, capital, term, adjBasis,
    basisAdjustment: (adjBasis - pp) * shares,
    taxOrd, taxCap, total,
    proceeds: salePrice * shares,
    net: salePrice * shares - total,
    notes,
  };
}

/* ---------- design tokens ---------- */
const C = {
  ink: "#101F2C",
  paper: "#E9EDF1",
  surface: "#FFFFFF",
  qual: "#0B6E62",
  disqual: "#A9500B",
  muted: "#5C6E7E",
  rule: "#C9D3DC",
};

const RANGE_CSS = `
  input[type="range"].espp-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; border-radius: 2px;
    background: ${C.rule}; outline: none; margin: 8px 0 2px;
  }
  input[type="range"].espp-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: ${C.ink}; border: 2px solid ${C.surface};
    box-shadow: 0 0 0 1px ${C.ink}; cursor: pointer; margin-top: -1px;
  }
  input[type="range"].espp-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${C.surface};
    background: ${C.ink}; box-shadow: 0 0 0 1px ${C.ink}; cursor: pointer;
  }
  input[type="range"].espp-slider::-moz-range-track { background: ${C.rule}; height: 4px; border-radius: 2px; }
`;

/* ---------- stable, module-scope subcomponents ----------
   Defined outside the calculator function so React sees the same
   component identity across renders. Defining these inside the
   function body would remount the <input> on every keystroke/drag
   tick, which silently breaks click-and-drag on range inputs. */

const SliderField = ({ label, value, onChange, min, max, step = 1, suffix, accentColor }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
      <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted }}>
        {label}
      </span>
      <span style={{ font: "600 13px 'JetBrains Mono', monospace", color: accentColor || C.ink }}>
        {suffix === "$" ? "$" : ""}{Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{suffix && suffix !== "$" ? suffix : ""}
      </span>
    </div>
    <input
      type="range" className="espp-slider"
      min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
      <span>{suffix === "$" ? "$" : ""}{min}{suffix && suffix !== "$" ? suffix : ""}</span>
      <span>{suffix === "$" ? "$" : ""}{max}{suffix && suffix !== "$" ? suffix : ""}</span>
    </div>
  </div>
);

const DateField = ({ label, value, onChange }) => (
  <label style={{ display: "block", marginBottom: 14 }}>
    <span style={{ display: "block", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>
      {label}
    </span>
    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.rule}`, background: C.surface, borderRadius: 3 }}>
      <input
        type="date" value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "9px 10px", border: "none", outline: "none", background: "transparent",
          font: "500 14px 'JetBrains Mono', ui-monospace, monospace", color: C.ink,
        }}
      />
    </div>
  </label>
);

const Row = ({ label, value, strong, color }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${C.rule}` }}>
    <span style={{ fontSize: 13, color: strong ? C.ink : C.muted, fontWeight: strong ? 600 : 400 }}>{label}</span>
    <span style={{ font: `${strong ? 700 : 500} ${strong ? 17 : 14}px 'JetBrains Mono', monospace`, color: color || C.ink }}>{value}</span>
  </div>
);

const ModeTabButton = ({ id, mode, onSelect, children }) => (
  <button
    onClick={() => onSelect(id)}
    style={{
      padding: "9px 18px", border: `1px solid ${C.ink}`, background: mode === id ? C.ink : "transparent",
      color: mode === id ? C.paper : C.ink, borderRadius: 2, fontSize: 13, fontWeight: 600,
      cursor: "pointer", fontFamily: "'Instrument Sans', system-ui, sans-serif", marginRight: 10,
    }}
  >
    {children}
  </button>
);

const cellStyle = { padding: "6px 8px", verticalAlign: "middle" };
const tableInputStyle = {
  width: 118, font: "500 12px 'JetBrains Mono', monospace", border: `1px solid ${C.rule}`,
  borderRadius: 2, padding: "4px 6px", background: C.paper, color: C.ink,
};

let roundIdSeq = 1;
const makeRound = (overrides = {}) => ({
  id: roundIdSeq++,
  offeringDate: "2024-01-01",
  purchaseDate: "2024-06-30",
  saleDate: "2025-08-01",
  offeringFmv: 50,
  purchaseFmv: 80,
  salePrice: 90,
  shares: 100,
  discount: 15,
  lookback: true,
  ...overrides,
});

const Panel = ({ title, tag, tagColor, r, headline }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderTop: `3px solid ${tagColor}`, padding: "18px 20px 20px", borderRadius: "2px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: "-.01em" }}>{title}</h3>
      <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: tagColor, border: `1px solid ${tagColor}`, padding: "2px 7px", borderRadius: 2 }}>
        {tag}
      </span>
    </div>
    <p style={{ margin: "0 0 14px", fontSize: 12, color: C.muted }}>{headline}</p>
    <Row label="Ordinary income (W-2)" value={usd(r.ordinary)} />
    <Row label={`Capital gain (${r.term}-term)`} value={usd(r.capital)} />
    <Row label="Tax on ordinary" value={usd(r.taxOrd)} />
    <Row label="Tax on capital" value={usd(r.taxCap)} />
    <Row label="Total tax" value={usd(r.total)} strong color={tagColor} />
    <Row label="Net proceeds" value={usd(r.net)} strong />
  </div>
);

export default function ESPPCalculator() {
  const [offeringDate, setOfferingDate] = useState("2024-01-01");
  const [purchaseDate, setPurchaseDate] = useState("2024-06-30");
  const [saleDate, setSaleDate] = useState("2025-08-01");
  const [offeringFmv, setOfferingFmv] = useState(50);
  const [purchaseFmv, setPurchaseFmv] = useState(80);
  const [salePrice, setSalePrice] = useState(90);
  const [shares, setShares] = useState(100);
  const [discount, setDiscount] = useState(15);
  const [lookback, setLookback] = useState(true);
  const [ordRate, setOrdRate] = useState(24);
  const [ltcgRate, setLtcgRate] = useState(15);
  const [stateRate, setStateRate] = useState(0);

  const [mode, setMode] = useState("single"); // "single" | "rounds"
  const [rounds, setRounds] = useState(() => [
    makeRound(),
    makeRound({ offeringDate: "2024-07-01", purchaseDate: "2024-12-31", offeringFmv: 55, purchaseFmv: 70 }),
  ]);

  const updateRound = (id, field, value) =>
    setRounds((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addRound = () => setRounds((rs) => [...rs, makeRound()]);
  const removeRound = (id) => setRounds((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const roundResults = useMemo(() => {
    const rates = { ordinary: ordRate / 100, ltcg: ltcgRate / 100, state: stateRate / 100 };
    return rounds.map((r) => {
      const od = parse(r.offeringDate), pd = parse(r.purchaseDate), sdte = parse(r.saleDate);
      const qualDate = new Date(Math.max(addYears(od, 2).getTime(), addYears(pd, 1).getTime()));
      const lot = { offeringDate: od, purchaseDate: pd, qualDate };
      const inputs = {
        offeringFmv: +r.offeringFmv, purchaseFmv: +r.purchaseFmv,
        discount: r.discount / 100, shares: +r.shares, lookback: r.lookback,
      };
      return { id: r.id, qualDate, ...analyze(inputs, +r.salePrice, sdte, lot, rates) };
    });
  }, [rounds, ordRate, ltcgRate, stateRate]);

  const roundTotals = useMemo(
    () =>
      roundResults.reduce(
        (acc, r) => ({
          ordinary: acc.ordinary + r.ordinary,
          capital: acc.capital + r.capital,
          total: acc.total + r.total,
          net: acc.net + r.net,
        }),
        { ordinary: 0, capital: 0, total: 0, net: 0 }
      ),
    [roundResults]
  );
  const totalShares = useMemo(() => rounds.reduce((s, r) => s + (+r.shares || 0), 0), [rounds]);

  const gateInfo = useMemo(() => {
    const od = parse(offeringDate), pd = parse(purchaseDate);
    const qualDate = new Date(Math.max(addYears(od, 2).getTime(), addYears(pd, 1).getTime()));
    return { od, pd, qualDate };
  }, [offeringDate, purchaseDate]);

  const model = useMemo(() => {
    const od = gateInfo.od, pd = gateInfo.pd, sd = parse(saleDate);
    const qualDate = gateInfo.qualDate;
    const lot = { offeringDate: od, purchaseDate: pd, qualDate };
    const inputs = {
      offeringFmv: +offeringFmv, purchaseFmv: +purchaseFmv,
      discount: discount / 100, shares: +shares, lookback,
    };
    const rates = { ordinary: ordRate / 100, ltcg: ltcgRate / 100, state: stateRate / 100 };
    const now = analyze(inputs, +salePrice, sd, lot, rates);
    const later = analyze(inputs, +salePrice, qualDate, lot, rates);
    const days = Math.max(Math.round((qualDate - sd) / 86400000), 0);
    return { now, later, qualDate, lot, sd, saved: now.total - later.total, days };
  }, [gateInfo, saleDate, offeringFmv, purchaseFmv, salePrice, shares, discount, lookback, ordRate, ltcgRate, stateRate]);

  const { now, later, qualDate, lot, sd, saved, days } = model;
  const accent = now.qualifying ? C.qual : C.disqual;
  const saleSliderMax = Math.max(daysBetween(gateInfo.pd, qualDate) + 365, 730);

  /* timeline geometry */
  const t0 = lot.offeringDate.getTime();
  const tEnd = Math.max(qualDate.getTime(), sd.getTime()) + 30 * 86400000;
  const pos = (d) => ((d.getTime() - t0) / (tEnd - t0)) * 100;

  const timelineRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const dateFromClientX = useCallback((clientX) => {
    const el = timelineRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const t = t0 + frac * (tEnd - t0);
    return new Date(Math.round(t / 86400000) * 86400000);
  }, [t0, tEnd]);

  const onMarkerPointerDown = (e) => {
    e.preventDefault();
    setDragging(true);
    e.target.setPointerCapture(e.pointerId);
  };
  const onTimelinePointerMove = (e) => {
    if (!dragging) return;
    const d = dateFromClientX(e.clientX);
    if (d) setSaleDate(fmtDate(d));
  };
  const onTimelinePointerUp = () => setDragging(false);


  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Instrument Sans', system-ui, sans-serif", padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* header */}
        <header style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
            Employee stock purchase plan
          </div>
          <h1 style={{ margin: 0, fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 600, letterSpacing: "-.03em", lineHeight: 1.05 }}>
            Sell now, or cross the line?
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 560, fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
            Two holding-period gates decide how your discount gets taxed. Move the sale date and watch which side you land on.
          </p>
        </header>

        <div style={{ display: "flex", marginBottom: 20 }}>
          <ModeTabButton id="single" mode={mode} onSelect={setMode}>Single lot</ModeTabButton>
          <ModeTabButton id="rounds" mode={mode} onSelect={setMode}>Multiple rounds</ModeTabButton>
        </div>

        {mode === "single" && (
        <>
        {/* signature: holding-period timeline */}
        <div style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "26px 24px 20px", marginBottom: 22, borderRadius: 2 }}>
          <div
            ref={timelineRef}
            onPointerMove={onTimelinePointerMove}
            onPointerUp={onTimelinePointerUp}
            style={{ position: "relative", height: 74, cursor: dragging ? "grabbing" : "default", touchAction: "none" }}
          >
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, height: 2, background: C.rule }} />
            <div style={{ position: "absolute", top: 26, left: 0, width: `${Math.min(pos(sd), 100)}%`, height: 2, background: accent, transition: dragging ? "none" : "width .25s ease" }} />
            {[
              { d: lot.offeringDate, label: "Offering", sub: "grant" },
              { d: lot.purchaseDate, label: "Purchase", sub: "shares bought" },
              { d: qualDate, label: "Qualifying", sub: "2yr + 1yr gate", gate: true },
            ].map((m, i) => (
              <div key={i} style={{ position: "absolute", left: `${pos(m.d)}%`, top: 0, transform: "translateX(-50%)", textAlign: "center", width: 92 }}>
                <div style={{ fontSize: 10, color: m.gate ? C.qual : C.muted, fontWeight: m.gate ? 600 : 400, marginBottom: 4 }}>{m.label}</div>
                <div style={{ width: m.gate ? 3 : 9, height: m.gate ? 22 : 9, background: m.gate ? C.qual : C.ink, margin: "0 auto", borderRadius: m.gate ? 0 : "50%", marginTop: m.gate ? -3 : 4 }} />
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6, fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(m.d).slice(2)}</div>
              </div>
            ))}
            {/* sale marker — draggable */}
            <div
              onPointerDown={onMarkerPointerDown}
              style={{
                position: "absolute", left: `${Math.min(pos(sd), 100)}%`, top: 18,
                transform: "translateX(-50%)", transition: dragging ? "none" : "left .25s ease",
                cursor: dragging ? "grabbing" : "grab", padding: "0 8px", touchAction: "none",
              }}
            >
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: accent, border: `3px solid ${C.surface}`, boxShadow: `0 0 0 2px ${accent}` }} />
              <div style={{ fontSize: 10, color: accent, marginTop: 6, fontWeight: 600, whiteSpace: "nowrap", transform: "translateX(-50%)", marginLeft: 9 }}>
                SALE
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.rule}`, display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>You paid</div>
              <div style={{ font: "700 20px 'JetBrains Mono', monospace" }}>{usd(now.pp)}<span style={{ fontSize: 12, color: C.muted }}>/sh</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>Qualifies on</div>
              <div style={{ font: "700 20px 'JetBrains Mono', monospace", color: C.qual }}>{fmtDate(qualDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" }}>Days short</div>
              <div style={{ font: "700 20px 'JetBrains Mono', monospace", color: days > 0 ? C.disqual : C.qual }}>{days}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) 1fr", gap: 22, alignItems: "start" }}>

          {/* inputs */}
          <aside style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "18px 18px 8px", borderRadius: 2 }}>
            <style>{RANGE_CSS}</style>
            <DateField label="Offering date" value={offeringDate} onChange={setOfferingDate} />
            <DateField label="Purchase date" value={purchaseDate} onChange={setPurchaseDate} />

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted }}>Sale date</span>
                <span style={{ font: "600 13px 'JetBrains Mono', monospace", color: accent }}>{fmtDate(sd)}</span>
              </div>
              <input
                type="range" className="espp-slider"
                min={0} max={saleSliderMax} step={1}
                value={Math.min(Math.max(daysBetween(gateInfo.pd, sd), 0), saleSliderMax)}
                onChange={(e) => setSaleDate(fmtDate(addDays(gateInfo.pd, +e.target.value)))}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
                <span>Purchase</span>
                <span>Qualifying + 1yr</span>
              </div>
            </div>

            <div style={{ height: 1, background: C.rule, margin: "4px 0 16px" }} />
            <SliderField label="Price on offering date" value={offeringFmv} onChange={setOfferingFmv} min={1} max={300} step={0.5} suffix="$" />
            <SliderField label="Price on purchase date" value={purchaseFmv} onChange={setPurchaseFmv} min={1} max={300} step={0.5} suffix="$" />
            <SliderField label="Sale price" value={salePrice} onChange={setSalePrice} min={1} max={300} step={0.5} suffix="$" accentColor={accent} />
            <SliderField label="Shares" value={shares} onChange={setShares} min={1} max={2000} step={1} />
            <SliderField label="Plan discount" value={discount} onChange={setDiscount} min={5} max={15} step={1} suffix="%" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: C.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={lookback} onChange={(e) => setLookback(e.target.checked)} style={{ accentColor: C.ink }} />
              Plan has a lookback provision
            </label>
            <div style={{ height: 1, background: C.rule, margin: "0 0 16px" }} />
            <SliderField label="Marginal ordinary rate" value={ordRate} onChange={setOrdRate} min={0} max={37} step={1} suffix="%" />
            <SliderField label="Long-term capital rate" value={ltcgRate} onChange={setLtcgRate} min={0} max={20} step={1} suffix="%" />
            <SliderField label="State rate" value={stateRate} onChange={setStateRate} min={0} max={13} step={0.5} suffix="%" />
          </aside>

          {/* results */}
          <main>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 18 }}>
              <Panel
                title="Sell on your sale date"
                tag={now.qualifying ? "Qualifying" : "Disqualifying"}
                tagColor={now.qualifying ? C.qual : C.disqual}
                r={now}
                headline={fmtDate(sd)}
              />
              <Panel
                title="Wait for the gate"
                tag="Qualifying"
                tagColor={C.qual}
                r={later}
                headline={`${fmtDate(qualDate)} · assumes price holds at ${usd(+salePrice)}`}
              />
            </div>

            {/* verdict */}
            <div style={{ background: C.ink, color: C.paper, padding: "20px 22px", borderRadius: 2, marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.65, marginBottom: 6 }}>
                Difference
              </div>
              <div style={{ font: "700 clamp(26px, 4vw, 38px) 'JetBrains Mono', monospace", letterSpacing: "-.02em", lineHeight: 1.1 }}>
                {usd(Math.abs(saved))}
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.8, lineHeight: 1.5, maxWidth: 520 }}>
                {days === 0
                  ? "This sale already qualifies. Nothing left to wait for."
                  : saved > 0
                  ? `Waiting ${days} more days saves that much in tax — but only if the price holds. Weigh it against ${days} more days of single-stock risk.`
                  : "Waiting doesn't help here. The tax treatment is the same or worse."}
              </p>
            </div>

            {/* basis trap */}
            <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.disqual}`, padding: "16px 18px", borderRadius: 2, marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Fix your cost basis on Form 8949</h4>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
                Your broker will likely report a basis of <strong style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{usd(now.pp)}</strong>/share.
                The correct basis is <strong style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{usd(now.adjBasis)}</strong>/share
                once the discount already taxed as wages is added back — a{" "}
                <strong style={{ color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{usd(now.basisAdjustment)}</strong> correction.
                Skip it and you pay tax twice on the same discount.
              </p>
            </div>

            {now.notes.map((n, i) => (
              <p key={i} style={{ margin: "0 0 8px", fontSize: 13, color: C.muted, lineHeight: 1.5, paddingLeft: 14, borderLeft: `2px solid ${C.rule}` }}>{n}</p>
            ))}
          </main>
        </div>
        </>
        )}

        {mode === "rounds" && (
          <div style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "20px 22px 22px", borderRadius: 2, marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Multiple purchase rounds</h3>
              <button
                onClick={addRound}
                style={{ padding: "7px 14px", border: `1px solid ${C.ink}`, background: C.ink, color: C.paper, borderRadius: 2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                + Add round
              </button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: C.muted, maxWidth: 640 }}>
              One row per purchase period. Tax rates below apply to every round.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1150 }}>
                <thead>
                  <tr>
                    {["Offering date", "Purchase date", "Sale date", "Offering FMV", "Purchase FMV", "Sale price", "Shares", "Discount %", "Lookback", "Status", "Ordinary", "Capital", "Total tax", "Net proceeds", ""].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: `2px solid ${C.rule}`, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => {
                    const res = roundResults.find((x) => x.id === r.id);
                    return (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <td style={cellStyle}><input type="date" value={r.offeringDate} onChange={(e) => updateRound(r.id, "offeringDate", e.target.value)} style={tableInputStyle} /></td>
                        <td style={cellStyle}><input type="date" value={r.purchaseDate} onChange={(e) => updateRound(r.id, "purchaseDate", e.target.value)} style={tableInputStyle} /></td>
                        <td style={cellStyle}><input type="date" value={r.saleDate} onChange={(e) => updateRound(r.id, "saleDate", e.target.value)} style={tableInputStyle} /></td>
                        <td style={cellStyle}><input type="number" value={r.offeringFmv} step="0.5" onChange={(e) => updateRound(r.id, "offeringFmv", e.target.value)} style={{ ...tableInputStyle, width: 70 }} /></td>
                        <td style={cellStyle}><input type="number" value={r.purchaseFmv} step="0.5" onChange={(e) => updateRound(r.id, "purchaseFmv", e.target.value)} style={{ ...tableInputStyle, width: 70 }} /></td>
                        <td style={cellStyle}><input type="number" value={r.salePrice} step="0.5" onChange={(e) => updateRound(r.id, "salePrice", e.target.value)} style={{ ...tableInputStyle, width: 70 }} /></td>
                        <td style={cellStyle}><input type="number" value={r.shares} onChange={(e) => updateRound(r.id, "shares", e.target.value)} style={{ ...tableInputStyle, width: 64 }} /></td>
                        <td style={cellStyle}><input type="number" value={r.discount} onChange={(e) => updateRound(r.id, "discount", e.target.value)} style={{ ...tableInputStyle, width: 56 }} /></td>
                        <td style={{ ...cellStyle, textAlign: "center" }}>
                          <input type="checkbox" checked={r.lookback} onChange={(e) => updateRound(r.id, "lookback", e.target.checked)} style={{ accentColor: C.ink }} />
                        </td>
                        <td style={cellStyle}>
                          <span style={{ fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: res.qualifying ? C.qual : C.disqual, border: `1px solid ${res.qualifying ? C.qual : C.disqual}`, padding: "2px 6px", borderRadius: 2, whiteSpace: "nowrap" }}>
                            {res.qualifying ? "Qualifying" : "Disqualifying"}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace" }}>{usd(res.ordinary)}</td>
                        <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace" }}>{usd(res.capital)}</td>
                        <td style={{ ...cellStyle, font: "700 12px 'JetBrains Mono', monospace" }}>{usd(res.total)}</td>
                        <td style={{ ...cellStyle, font: "700 12px 'JetBrains Mono', monospace" }}>{usd(res.net)}</td>
                        <td style={cellStyle}>
                          <button
                            onClick={() => removeRound(r.id)}
                            disabled={rounds.length <= 1}
                            title="Remove round"
                            style={{ border: "none", background: "none", color: C.disqual, cursor: rounds.length > 1 ? "pointer" : "not-allowed", opacity: rounds.length > 1 ? 1 : 0.3, fontSize: 17, lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>Totals</td>
                    <td style={{ padding: "10px 8px", font: "700 12px 'JetBrains Mono', monospace" }}>{totalShares}</td>
                    <td colSpan={2}></td>
                    <td style={{ padding: "10px 8px", font: "700 12px 'JetBrains Mono', monospace" }}>{usd(roundTotals.ordinary)}</td>
                    <td style={{ padding: "10px 8px", font: "700 12px 'JetBrains Mono', monospace" }}>{usd(roundTotals.capital)}</td>
                    <td style={{ padding: "10px 8px", font: "700 12px 'JetBrains Mono', monospace", color: C.disqual }}>{usd(roundTotals.total)}</td>
                    <td style={{ padding: "10px 8px", font: "700 12px 'JetBrains Mono', monospace", color: C.qual }}>{usd(roundTotals.net)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div style={{ height: 1, background: C.rule, margin: "22px 0 16px" }} />
            <style>{RANGE_CSS}</style>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 20 }}>
              <SliderField label="Marginal ordinary rate" value={ordRate} onChange={setOrdRate} min={0} max={37} step={1} suffix="%" />
              <SliderField label="Long-term capital rate" value={ltcgRate} onChange={setLtcgRate} min={0} max={20} step={1} suffix="%" />
              <SliderField label="State rate" value={stateRate} onChange={setStateRate} min={0} max={13} step={0.5} suffix="%" />
            </div>
          </div>
        )}

        <p style={{ marginTop: 8, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          Federal estimate only. Ignores AMT, the 3.8% net investment income tax, the $3,000 annual capital loss cap, and payroll tax treatment. Educational tool, not tax advice.
        </p>
      </div>
    </div>
  );
}
