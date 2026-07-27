import React, { useState, useMemo, useCallback, useEffect } from "react";

/* ---------- design tokens ---------- */
const C = {
  ink: "#12181F",
  paper: "#EDF1EF",
  surface: "#FFFFFF",
  buy: "#0E7C4A",
  strongBuy: "#0A5C37",
  sell: "#B23A26",
  strongSell: "#832111",
  muted: "#5B6670",
  rule: "#D7DEDA",
};

const RANGE_CSS = `
  .tool-grid { min-width: 0; }
  .tool-grid > aside, .tool-grid > main { min-width: 0; }
  @media (max-width: 720px) {
    .tool-grid { grid-template-columns: 1fr !important; }
  }
  input[type="range"].stock-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px; border-radius: 2px;
    background: ${C.rule}; outline: none; margin: 8px 0 2px;
  }
  input[type="range"].stock-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px; border-radius: 50%;
    background: ${C.ink}; border: 2px solid ${C.surface};
    box-shadow: 0 0 0 1px ${C.ink}; cursor: pointer; margin-top: -1px;
  }
  input[type="range"].stock-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${C.surface};
    background: ${C.ink}; box-shadow: 0 0 0 1px ${C.ink}; cursor: pointer;
  }
  input[type="range"].stock-slider::-moz-range-track { background: ${C.rule}; height: 4px; border-radius: 2px; }
`;

const API_KEY_STORAGE = "finnhub_api_key";
const FINNHUB_BASE = "https://finnhub.io/api/v1";

/* ---------- pure scoring engine ---------- */
function analystScore(rec) {
  if (!rec) return null;
  const { strongBuy = 0, buy = 0, hold = 0, sell = 0, strongSell = 0 } = rec;
  const total = strongBuy + buy + hold + sell + strongSell;
  if (!total) return null;
  const raw = (strongBuy * 2 + buy * 1 - sell * 1 - strongSell * 2) / total;
  return raw / 2; // -1..1
}

function momentumScore(metric) {
  if (!metric) return null;
  const m13 = metric["13WeekPriceReturnDaily"];
  const m26 = metric["26WeekPriceReturnDaily"];
  const m52 = metric["52WeekPriceReturnDaily"];
  if (m13 == null || m26 == null || m52 == null) return null;
  const weighted = 0.5 * m13 + 0.3 * m26 + 0.2 * m52;
  return Math.max(-1, Math.min(1, weighted / 30));
}

function compositeScore(aScore, mScore, analystWeight) {
  if (aScore == null && mScore == null) return null;
  if (aScore == null) return mScore;
  if (mScore == null) return aScore;
  return analystWeight * aScore + (1 - analystWeight) * mScore;
}

function recommendationFor(score) {
  if (score == null) return { label: "N/A", color: C.muted };
  if (score >= 0.5) return { label: "Strong Buy", color: C.strongBuy };
  if (score >= 0.15) return { label: "Buy", color: C.buy };
  if (score > -0.15) return { label: "Hold", color: C.muted };
  if (score > -0.5) return { label: "Sell", color: C.sell };
  return { label: "Strong Sell", color: C.strongSell };
}

const pct = (n, digits = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`);
const price = (n) => (n == null ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/* Finnhub returns non-JSON (an HTML redirect/error page) for endpoints
   the current plan can't access — parse defensively instead of letting
   res.json() throw a cryptic "Unexpected token '<'" error. */
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchTicker(ticker, apiKey) {
  const qs = `symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
  const [quoteRes, recRes, metricRes] = await Promise.all([
    fetch(`${FINNHUB_BASE}/quote?${qs}`),
    fetch(`${FINNHUB_BASE}/stock/recommendation-trend?${qs}`),
    fetch(`${FINNHUB_BASE}/stock/metric?${qs}&metric=all`),
  ]);
  if ([quoteRes.status, metricRes.status].includes(401)) {
    throw new Error("Invalid API key");
  }
  if ([quoteRes.status, metricRes.status].includes(429)) {
    throw new Error("Rate limited — wait a moment and retry");
  }
  const quote = await safeJson(quoteRes);
  const metricJson = await safeJson(metricRes);
  if (!quote || (quote.c === 0 && quote.pc === 0)) {
    throw new Error("Ticker not found");
  }

  // Recommendation trends require a paid Finnhub plan on some accounts and
  // come back as an HTML redirect instead of JSON — don't let that sink the
  // whole row, just fall back to a momentum-only score.
  const recArr = recRes.ok ? await safeJson(recRes) : null;
  const rec = Array.isArray(recArr) && recArr.length ? recArr[0] : null;
  const analystUnavailable = !rec;

  return {
    quote,
    rec,
    metric: metricJson?.metric || null,
    analystUnavailable,
  };
}

/* ---------- stable subcomponents ---------- */
const ScoreBar = ({ score }) => {
  const clamped = score == null ? 0 : Math.max(-1, Math.min(1, score));
  const color = recommendationFor(score).color;
  const widthPct = Math.abs(clamped) * 50;
  const leftPct = clamped >= 0 ? 50 : 50 - widthPct;
  return (
    <div style={{ position: "relative", width: 90, height: 8, background: C.rule, borderRadius: 2 }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: C.ink, opacity: 0.35 }} />
      {score != null && (
        <div style={{ position: "absolute", left: `${leftPct}%`, top: 0, bottom: 0, width: `${widthPct}%`, background: color, borderRadius: 2 }} />
      )}
    </div>
  );
};

const RecBadge = ({ score }) => {
  const { label, color } = recommendationFor(score);
  return (
    <span style={{ fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color, border: `1px solid ${color}`, padding: "3px 8px", borderRadius: 2, whiteSpace: "nowrap", fontWeight: 600 }}>
      {label}
    </span>
  );
};

const cellStyle = { padding: "8px 10px", verticalAlign: "middle", fontSize: 13 };

let rowIdSeq = 1;
const makeRow = (ticker = "") => ({ id: rowIdSeq++, ticker, status: "idle", error: null, quote: null, rec: null, metric: null });

export default function StockRecommendation() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || "");
  const [analystWeightPct, setAnalystWeightPct] = useState(50);
  const [rows, setRows] = useState(() => [makeRow("AAPL"), makeRow("MSFT"), makeRow("GOOGL")]);

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey]);

  const updateTicker = (id, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ticker: value.toUpperCase() } : r)));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);
  const removeRow = (id) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const fetchOne = useCallback(
    async (id) => {
      const row = rows.find((r) => r.id === id);
      if (!row || !row.ticker.trim()) return;
      if (!apiKey.trim()) {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "error", error: "Add your Finnhub API key above first" } : r)));
        return;
      }
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "loading", error: null } : r)));
      try {
        const data = await fetchTicker(row.ticker.trim(), apiKey.trim());
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "ok", error: null, ...data } : r)));
      } catch (err) {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "error", error: err.message } : r)));
      }
    },
    [rows, apiKey]
  );

  const fetchAll = () => rows.forEach((r) => r.ticker.trim() && fetchOne(r.id));

  const analystWeight = analystWeightPct / 100;

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", padding: "28px 20px 60px" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{RANGE_CSS}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
            Stock recommendation engine
          </div>
          <h1 style={{ margin: 0, fontFamily: "'Source Serif 4', Georgia, serif", fontSize: "clamp(28px, 4.5vw, 42px)", fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.08 }}>
            Analyst consensus meets price momentum
          </h1>
          <p style={{ margin: "10px 0 0", maxWidth: 620, fontSize: 15, color: C.muted, lineHeight: 1.55 }}>
            Blends live Wall Street analyst ratings with 13/26/52-week price momentum into a single score per ticker. Data comes from Finnhub's free API — bring your own key.
          </p>
        </header>

        {/* API key */}
        <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "16px 18px", marginBottom: 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <label style={{ display: "block", fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>
              Finnhub API key
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your free API key"
              style={{ width: "100%", boxSizing: "border-box", font: "500 13px 'JetBrains Mono', monospace", border: `1px solid ${C.rule}`, borderRadius: 2, padding: "8px 10px", background: C.paper, color: C.ink }}
            />
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.muted, maxWidth: 360, lineHeight: 1.5 }}>
            Stored only in this browser's local storage — never sent anywhere but Finnhub. Get a free key at{" "}
            <span style={{ textDecoration: "underline" }}>finnhub.io/register</span>.
          </p>
        </div>

        <div className="tool-grid" style={{ display: "grid", gridTemplateColumns: "minmax(230px, 280px) 1fr", gap: 20, alignItems: "start" }}>
          {/* controls */}
          <aside style={{ background: C.surface, border: `1px solid ${C.rule}`, padding: "16px 16px 4px", borderRadius: 2 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 11, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted }}>Analyst rating weight</span>
                <span style={{ font: "600 13px 'JetBrains Mono', monospace" }}>{analystWeightPct}%</span>
              </div>
              <input
                type="range" className="stock-slider"
                min={0} max={100} step={5} value={analystWeightPct}
                onChange={(e) => setAnalystWeightPct(+e.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted, marginTop: 2 }}>
                <span>All momentum</span>
                <span>All analysts</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: "0 0 14px" }}>
              Analyst score: net of strong buy / buy / hold / sell / strong sell counts from the latest ratings period.
            </p>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, margin: "0 0 14px" }}>
              Momentum score: weighted 13/26/52-week price return (50/30/20), normalized against a ±30% swing.
            </p>
            <p style={{ fontSize: 12, color: C.sell, lineHeight: 1.5, margin: 0 }}>
              Note: Finnhub's free tier no longer returns analyst recommendation trends for any ticker. Rows fall back to a momentum-only score until analyst data is available on your plan.
            </p>
            <div style={{ height: 1, background: C.rule, margin: "16px 0" }} />
            <button
              onClick={fetchAll}
              style={{ width: "100%", padding: "10px 0", border: `1px solid ${C.ink}`, background: C.ink, color: C.paper, borderRadius: 2, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}
            >
              Fetch all
            </button>
          </aside>

          {/* table */}
          <main>
            <div style={{ background: C.surface, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "18px 18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, fontFamily: "'Source Serif 4', serif" }}>Watchlist</h3>
                <button
                  onClick={addRow}
                  style={{ padding: "7px 14px", border: `1px solid ${C.ink}`, background: "transparent", color: C.ink, borderRadius: 2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  + Add ticker
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
                  <thead>
                    <tr>
                      {["Ticker", "Price", "Day", "Analysts (SB/B/H/S/SS)", "13w", "26w", "52w", "Score", "Recommendation", "", ""].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${C.rule}`, fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const aScore = analystScore(r.rec);
                      const mScore = momentumScore(r.metric);
                      const score = compositeScore(aScore, mScore, analystWeight);
                      return (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${C.rule}` }}>
                          <td style={cellStyle}>
                            <input
                              type="text"
                              value={r.ticker}
                              onChange={(e) => updateTicker(r.id, e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && fetchOne(r.id)}
                              placeholder="TSLA"
                              style={{ width: 70, font: "700 13px 'JetBrains Mono', monospace", border: `1px solid ${C.rule}`, borderRadius: 2, padding: "5px 7px", background: C.paper, color: C.ink, textTransform: "uppercase" }}
                            />
                          </td>
                          {r.status === "loading" ? (
                            <td colSpan={8} style={{ ...cellStyle, color: C.muted }}>Loading…</td>
                          ) : r.status === "error" ? (
                            <td colSpan={8} style={{ ...cellStyle, color: C.sell }}>{r.error}</td>
                          ) : r.status === "ok" ? (
                            <>
                              <td style={{ ...cellStyle, font: "600 13px 'JetBrains Mono', monospace" }}>{price(r.quote?.c)}</td>
                              <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace", color: (r.quote?.dp ?? 0) >= 0 ? C.buy : C.sell }}>{pct(r.quote?.dp)}</td>
                              <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
                                {r.rec ? (
                                  `${r.rec.strongBuy}/${r.rec.buy}/${r.rec.hold}/${r.rec.sell}/${r.rec.strongSell}`
                                ) : (
                                  <span style={{ color: C.muted, fontStyle: "italic", fontFamily: "'Inter', system-ui, sans-serif" }} title="Finnhub's free tier doesn't return analyst recommendation trends">
                                    Needs paid plan
                                  </span>
                                )}
                              </td>
                              <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace" }}>{pct(r.metric?.["13WeekPriceReturnDaily"])}</td>
                              <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace" }}>{pct(r.metric?.["26WeekPriceReturnDaily"])}</td>
                              <td style={{ ...cellStyle, font: "500 12px 'JetBrains Mono', monospace" }}>{pct(r.metric?.["52WeekPriceReturnDaily"])}</td>
                              <td style={cellStyle}><ScoreBar score={score} /></td>
                              <td style={cellStyle}><RecBadge score={score} /></td>
                            </>
                          ) : (
                            <td colSpan={8} style={{ ...cellStyle, color: C.muted }}>Not fetched yet</td>
                          )}
                          <td style={cellStyle}>
                            <button
                              onClick={() => fetchOne(r.id)}
                              disabled={r.status === "loading"}
                              style={{ border: `1px solid ${C.rule}`, background: "transparent", color: C.ink, borderRadius: 2, padding: "4px 9px", fontSize: 11, cursor: "pointer" }}
                            >
                              Fetch
                            </button>
                          </td>
                          <td style={cellStyle}>
                            <button
                              onClick={() => removeRow(r.id)}
                              disabled={rows.length <= 1}
                              title="Remove ticker"
                              style={{ border: "none", background: "none", color: C.sell, cursor: rows.length > 1 ? "pointer" : "not-allowed", opacity: rows.length > 1 ? 1 : 0.3, fontSize: 17, lineHeight: 1, padding: 0 }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ marginTop: 18, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              SB/B/H/S/SS = strong buy / buy / hold / sell / strong sell counts from the most recent analyst ratings period. Momentum and ratings data are provided by Finnhub's free tier and may be delayed or incomplete for some tickers. This is an educational scoring tool, not investment advice — it is not a licensed recommendation and should not be the sole basis for a trade.
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
