import React, { useState, useEffect } from "react";
import Home from "./Home.jsx";
import ESPPCalculator from "./ESPPCalculator.jsx";
import MortgageCalculator from "./MortgageCalculator.jsx";
import StockRecommendation from "./StockRecommendation.jsx";

const ROUTES = {
  espp: ESPPCalculator,
  mortgage: MortgageCalculator,
  stocks: StockRecommendation,
};

const TITLES = {
  espp: "ESPP Disposition Calculator",
  mortgage: "Mortgage Amortization Calculator",
  stocks: "Stock Recommendation Engine",
};
const DEFAULT_TITLE = "Finance Calculators";

function getSlugFromHash() {
  const h = window.location.hash.replace(/^#\/?/, "");
  return ROUTES[h] ? h : null;
}

export default function App() {
  const [slug, setSlug] = useState(getSlugFromHash);

  useEffect(() => {
    const onHashChange = () => setSlug(getSlugFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    document.title = TITLES[slug] || DEFAULT_TITLE;
  }, [slug]);

  const navigate = (s) => {
    window.location.hash = s ? `/${s}` : "";
    setSlug(s);
  };

  const BackBar = () => (
    <div style={{ padding: "14px 14px 0" }}>
      <button
        onClick={() => navigate(null)}
        style={{
          font: "600 12px 'Inter', system-ui, sans-serif", letterSpacing: ".04em", textTransform: "uppercase",
          background: "#1B2430", color: "#F0EEE6", border: "none", borderRadius: 3,
          padding: "7px 12px", cursor: "pointer", opacity: 0.85,
        }}
      >
        ← All tools
      </button>
    </div>
  );

  if (!slug) return <Home onNavigate={navigate} />;

  const Tool = ROUTES[slug];
  return (
    <>
      <BackBar />
      <Tool />
    </>
  );
}
