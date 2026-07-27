# Finance Calculators

A small site of interactive finance tools, each backed by a tested Python reference engine.

## Tools

**ESPP Disposition Calculator** (`#/espp`)

An interactive tool for the decision most ESPP participants get wrong: sell now, or hold until the sale qualifies?

Employee stock purchase plans have two holding-period gates — two years from the offering date **and** one year from the purchase date. Clear both and the discount is taxed favorably. Miss either and the entire purchase-date spread becomes ordinary income, even if the stock has since fallen below what you paid.

The calculator models both outcomes side by side and surfaces the cost-basis correction that brokers routinely omit.

**Mortgage Amortization Calculator** (`#/mortgage`)

Shows where each payment actually goes, models extra payments against the payoff date, and compares keeping a current loan against refinancing, including the breakeven point on closing costs.

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

## Structure

```
├── index.html                  page shell, fonts, base styles
├── src/
│   ├── main.jsx                React entry
│   ├── App.jsx                 hash-based router + back nav
│   ├── Home.jsx                landing page listing tools
│   ├── ESPPCalculator.jsx      ESPP tool UI + calculation logic
│   └── MortgageCalculator.jsx  mortgage tool UI + calculation logic
└── engine/
    ├── espp_engine.py          ESPP reference implementation
    ├── test_espp_engine.py     19 tests
    ├── mortgage_engine.py      mortgage reference implementation
    └── test_mortgage_engine.py 16 tests
```

Each Python engine is the reference implementation; the matching JavaScript in the component mirrors it. The tests exist to prove the financial logic is right independently of the UI — 35 tests total.

## Routing

No router library — a small hash-based switch in `App.jsx` (`#/espp`, `#/mortgage`, or no hash for the home page). Swap in `react-router` later if the site grows past a handful of tools.

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

The app is entirely client-side — no server, no API keys, no database. Any static host works.

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

Federal estimate only. Does not model AMT, the 3.8% net investment income tax, the $3,000 annual capital loss deduction limit, payroll tax treatment of the discount, or state-specific rules beyond a flat rate.

This is an educational tool, not tax advice. Verify against your Form 3922 and talk to a CPA before acting on it.

## License

MIT
