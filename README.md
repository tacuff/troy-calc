# Finance Calculators

A small site of interactive finance tools, each backed by a tested Python reference engine.

## Tools

**ESPP Disposition Calculator** (`#/espp`)

An interactive tool for the decision most ESPP participants get wrong: sell now, or hold until the sale qualifies?

Employee stock purchase plans have two holding-period gates — two years from the offering date **and** one year from the purchase date. Clear both and the discount is taxed favorably. Miss either and the entire purchase-date spread becomes ordinary income, even if the stock has since fallen below what you paid.

The calculator models both outcomes side by side and surfaces the cost-basis correction that brokers routinely omit.

**Mortgage Amortization Calculator** (`#/mortgage`)

Shows where each payment actually goes, models extra payments against the payoff date, and compares keeping a current loan against refinancing, including the breakeven point on closing costs. Every slider has a paired text field for exact entry, and a home insurance & property tax section rolls into the total monthly payment shown throughout.

**Stock Recommendation Engine** (`#/stocks`)

A watchlist table that blends live analyst ratings with price momentum into a single score per ticker. Add tickers, fetch live data, and adjust the analyst-vs-momentum weighting to see how the recommendation shifts. Price and momentum come from Finnhub; analyst ratings try Finnhub first and fall back to Financial Modeling Prep's free tier if you add an optional second key, since Finnhub stopped including ratings on its free plan.

## What each engine does

**ESPP** (`engine/espp_engine.py`)
- Computes the purchase price under a lookback provision (lesser of offering and purchase FMV, minus the plan discount)
- Determines qualifying vs. disqualifying status from the two holding-period gates
- Splits proceeds into ordinary income and capital gain under the correct rules for each case
- Flags the Form 8949 basis adjustment — the discount already taxed as W-2 wages, which most 1099-B forms leave out of reported basis
- Compares selling today against waiting for the qualifying date, holding price constant

**Mortgage** (`engine/mortgage_engine.py`)
- Standard fixed-rate amortization schedule, month by month
- Recurring or one-time extra payments, with interest saved and months shaved off
- Refinance comparison: new payment, lifetime interest difference, and breakeven months on closing costs
- Total monthly payment folds in annual property tax and home insurance alongside principal & interest

**Stock recommendation** (`src/StockRecommendation.jsx` — no Python reference engine; see below)
- Analyst score: net of strong-buy/buy/hold/sell/strong-sell counts from the latest ratings period, scaled to −1..1
- Momentum score: 13/26/52-week price return weighted 50/30/20, normalized against a ±30% swing
- Composite score: user-adjustable blend of the two, mapped to Strong Buy → Strong Sell

## Structure

```
├── index.html                  page shell, fonts, base styles
├── src/
│   ├── main.jsx                React entry
│   ├── App.jsx                 hash-based router + back nav
│   ├── Home.jsx                landing page listing tools
│   ├── ESPPCalculator.jsx      ESPP tool UI + calculation logic
│   ├── MortgageCalculator.jsx  mortgage tool UI + calculation logic
│   └── StockRecommendation.jsx stock recommendation tool UI + Finnhub/FMP calls + scoring logic
└── engine/
    ├── espp_engine.py          ESPP reference implementation
    ├── test_espp_engine.py     19 tests
    ├── mortgage_engine.py      mortgage reference implementation
    └── test_mortgage_engine.py 16 tests
```

Each Python engine is the reference implementation; the matching JavaScript in the component mirrors it. The tests exist to prove the financial logic is right independently of the UI — 35 tests total. The stock recommendation tool is the exception: its scoring math lives only in `StockRecommendation.jsx` since it depends on live data rather than user-entered inputs, so there's no Python mirror or test suite for it yet.

## Routing

No router library — a small hash-based switch in `App.jsx` (`#/espp`, `#/mortgage`, `#/stocks`, or no hash for the home page). Swap in `react-router` later if the site grows past a handful of tools.

## Running locally

```bash
npm install
npm run dev
```

Tests for the engine:

```bash
cd engine
pip install pytest
pytest -v
```

## Deploying

The app is entirely client-side — no server, no database, and no build-time API keys. Any static host works. The one exception: the Stock Recommendation Engine calls Finnhub's and (optionally) Financial Modeling Prep's APIs directly from the browser using keys each visitor pastes in themselves, stored only in that browser's `localStorage`. Nothing is bundled or committed — there's nothing to configure at deploy time.

**Vercel:** push to GitHub, import the repo at vercel.com. It detects Vite and needs no configuration.

**Cloudflare Pages / Netlify:** build command `npm run build`, output directory `dist`.

**GitHub Pages:** add `base: '/espp-calc/'` to `vite.config.js` first, then deploy `dist`.

## Edge cases handled

- **Lookback when the stock fell** — the purchase price still keys off the lower of the two prices
- **Leap-day anniversaries** — February 29 rolls forward to March 1
- **Qualifying sale at a loss** — no ordinary income; the whole loss is long-term capital
- **Qualifying sale with a small gain** — ordinary income is capped at the actual gain, not the statutory discount
- **Disqualifying sale after a crash** — ordinary income on the purchase-date spread is owed regardless, while the offsetting loss is capital and can only be used against capital gains

## Scope

**ESPP and mortgage tools:** federal estimate only. Does not model AMT, the 3.8% net investment income tax, the $3,000 annual capital loss deduction limit, payroll tax treatment of the discount, or state-specific rules beyond a flat rate.

This is an educational tool, not tax advice. Verify against your Form 3922 and talk to a CPA before acting on it.

**Stock recommendation engine:** a scoring heuristic, not a licensed recommendation. Price and momentum depend on Finnhub's free tier; analyst ratings depend on Finnhub (paid plans) or an optional Financial Modeling Prep key, and may be delayed, incomplete, or missing for some tickers either way. The FMP fallback endpoint was chosen from its public docs and CORS headers rather than a live-tested key — if it stops matching FMP's actual free-tier response shape, rows degrade to a momentum-only score rather than breaking. Educational tool, not investment advice — it should never be the sole basis for a trade.

## License

MIT
