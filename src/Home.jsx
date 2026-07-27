import React from "react";

const C = { ink: "#1B2430", paper: "#F0EEE6", surface: "#FFFFFF", rule: "#D8D3C4", muted: "#6B7280", accent: "#1F4E5F" };

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", width: 22, height: 22 };

const ESPPIcon = () => (
  <svg {...iconProps}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M8.5 15L15.5 8" />
    <circle cx="9" cy="9" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

const MortgageIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 11.5L12 4l8.5 7.5" />
    <path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9" />
    <path d="M9.5 20v-6h5v6" />
  </svg>
);

const StocksIcon = () => (
  <svg {...iconProps}>
    <path d="M3.5 17l5.5-6 4 4 7.5-9" />
    <path d="M15 6h5.5v5.5" />
  </svg>
);

const TOOLS = [
  {
    slug: "espp",
    title: "ESPP Disposition Calculator",
    blurb: "Sell now, or wait for the qualifying date? Compare the tax outcome and catch the cost-basis correction brokers leave off your 1099-B.",
    Icon: ESPPIcon,
  },
  {
    slug: "mortgage",
    title: "Mortgage Amortization Calculator",
    blurb: "See where each payment actually goes, model extra payments against the payoff date, and check whether refinancing breaks even.",
    Icon: MortgageIcon,
  },
  {
    slug: "stocks",
    title: "Stock Recommendation Engine",
    blurb: "Blend live analyst ratings with price momentum into a single score per ticker, across a whole watchlist at once.",
    Icon: StocksIcon,
  },
];

export default function Home({ onNavigate }) {
  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", padding: "60px 20px" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>
          Finance tools
        </div>
        <h1 style={{ margin: "0 0 12px", fontFamily: "'Source Serif 4', Georgia, serif", fontSize: "clamp(30px,5vw,46px)", fontWeight: 700, letterSpacing: "-.02em" }}>
          Calculators worth trusting
        </h1>
        <p style={{ margin: "0 0 36px", color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 520 }}>
          Interactive tools for decisions that are usually explained badly. Each one is backed by a tested calculation engine — the logic, not just the UI.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
          {TOOLS.map((t) => (
            <button
              key={t.slug}
              onClick={() => onNavigate(t.slug)}
              style={{
                textAlign: "left", background: C.surface, border: `1px solid ${C.rule}`, borderRadius: 3,
                padding: "20px 22px", cursor: "pointer", fontFamily: "inherit",
                transition: "border-color .15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.rule)}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: 8, background: C.paper, border: `1px solid ${C.rule}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.accent }}>
                  <t.Icon />
                </div>
                <div>
                  <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, fontWeight: 700, marginBottom: 6 }}>
                    {t.title} →
                  </div>
                  <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.5 }}>{t.blurb}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
