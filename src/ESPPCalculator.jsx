import React, { useState, useMemo } from "react";

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

  const model = useMemo(() => {
    const od = parse(offeringDate), pd = parse(purchaseDate), sd = parse(saleDate);
    const qualDate = new Date(Math.max(addYears(od, 2).getTime(), addYears(pd, 1).getTime()));
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
  }, [offeringDate, purchaseDate, saleDate, offeringFmv, purchaseFmv, salePrice, shares, discount, lookback, ordRate, ltcgRate, stateRate]);

  const { now, later, qualDate, lot, sd, saved, days } = model;
  const accent = now.qualifying ? C.qual : C.disqual;

  /* timeline geometry */
  const t0 = lot.offeringDate.getTime();
  const tEnd = Math.max(qualDate.getTime(), sd.getTime()) + 30 * 86400000;
  const pos = (d) => ((d.getTime() - t0) / (tEnd - t0)) * 100;

  const Field = ({ label, value, onChange, type = "number", step = "any", suffix }) => (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 5 }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.rule}`, background: C.surface, borderRadius: 3 }}>
        <input
          type={type} step={step} value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%", padding: "9px 10px", border: "none", outline: "none", background: "transparent",
            font: "500 15px 'JetBrains Mono', ui-monospace, monospace", color: C.ink,
          }}
        />
        {suffix && <span style={{ padding: "0 10px", color: C.muted, fontSize: 13 }}>{suffix}</span>}
      </div>
    </label>
  );

  const Row = ({ label, value, strong, color }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${C.rule}` }}>
      <span style={{ fontSize: 13, color: strong ? C.ink : C.muted, fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{ font: `${strong ? 700 : 500} ${strong ? 17 : 14}px 'JetBrains Mono', monospace`, color: color || C.ink }}>{value}</span>
    </div>
  );

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

        {/* signature: holding-period timeline */}
        <div style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "26px 24px 20px", marginBottom: 22, borderRadius: 2 }}>
          <div style={{ position: "relative", height: 74 }}>
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, height: 2, background: C.rule }} />
            <div style={{ position: "absolute", top: 26, left: 0, width: `${Math.min(pos(sd), 100)}%`, height: 2, background: accent, transition: "width .25s ease" }} />
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
            {/* sale marker */}
            <div style={{ position: "absolute", left: `${Math.min(pos(sd), 100)}%`, top: 18, transform: "translateX(-50%)", transition: "left .25s ease" }}>
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
            <Field label="Offering date" value={offeringDate} onChange={setOfferingDate} type="date" />
            <Field label="Purchase date" value={purchaseDate} onChange={setPurchaseDate} type="date" />
            <Field label="Sale date" value={saleDate} onChange={setSaleDate} type="date" />
            <div style={{ height: 1, background: C.rule, margin: "4px 0 16px" }} />
            <Field label="Price on offering date" value={offeringFmv} onChange={setOfferingFmv} suffix="$" />
            <Field label="Price on purchase date" value={purchaseFmv} onChange={setPurchaseFmv} suffix="$" />
            <Field label="Sale price" value={salePrice} onChange={setSalePrice} suffix="$" />
            <Field label="Shares" value={shares} onChange={setShares} />
            <Field label="Plan discount" value={discount} onChange={setDiscount} suffix="%" />
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: C.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={lookback} onChange={(e) => setLookback(e.target.checked)} style={{ accentColor: C.ink }} />
              Plan has a lookback provision
            </label>
            <div style={{ height: 1, background: C.rule, margin: "0 0 16px" }} />
            <Field label="Marginal ordinary rate" value={ordRate} onChange={setOrdRate} suffix="%" />
            <Field label="Long-term capital rate" value={ltcgRate} onChange={setLtcgRate} suffix="%" />
            <Field label="State rate" value={stateRate} onChange={setStateRate} suffix="%" />
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

            <p style={{ marginTop: 18, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Federal estimate only. Ignores AMT, the 3.8% net investment income tax, the $3,000 annual capital loss cap, and payroll tax treatment. Educational tool, not tax advice.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
