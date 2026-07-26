"""
ESPP disposition calculator — qualifying vs. disqualifying tax treatment.

Educational tool. Not tax advice. Ignores AMT, NIIT (3.8%), state tax,
and the $3,000/yr capital loss deduction cap unless you add them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


def add_years(d: date, n: int) -> date:
    """Anniversary date, handling Feb 29."""
    try:
        return d.replace(year=d.year + n)
    except ValueError:  # Feb 29 -> Mar 1
        return d.replace(year=d.year + n, month=3, day=1)


@dataclass
class ESPPLot:
    offering_date: date
    purchase_date: date
    offering_fmv: float      # FMV on offering/grant date
    purchase_fmv: float      # FMV on purchase date
    shares: float
    discount: float = 0.15   # 15% typical
    lookback: bool = True    # price off lesser of offering/purchase FMV

    @property
    def purchase_price(self) -> float:
        """Price actually paid per share."""
        base = min(self.offering_fmv, self.purchase_fmv) if self.lookback else self.purchase_fmv
        return round(base * (1 - self.discount), 4)

    @property
    def qualifying_date(self) -> date:
        """Earliest sale date that qualifies: 2yr from offering AND 1yr from purchase."""
        return max(add_years(self.offering_date, 2), add_years(self.purchase_date, 1))

    def is_qualifying(self, sale_date: date) -> bool:
        return sale_date >= self.qualifying_date


@dataclass
class TaxRates:
    ordinary: float = 0.24   # marginal federal ordinary rate
    ltcg: float = 0.15       # 0 / 15 / 20
    state: float = 0.0       # applied to both buckets
    niit: float = 0.0        # 0.038 if MAGI over threshold


@dataclass
class Result:
    disposition: str                 # "qualifying" | "disqualifying"
    shares: float
    purchase_price: float
    proceeds: float
    ordinary_income: float
    capital_gain: float
    capital_term: str                # "long" | "short" | "none"
    adjusted_basis: float            # per share, after discount income
    reported_1099b_basis: float      # per share, what the broker likely reports
    basis_adjustment: float          # total Form 8949 correction
    tax_ordinary: float
    tax_capital: float
    total_tax: float
    net_proceeds: float
    notes: list[str] = field(default_factory=list)


def analyze(lot: ESPPLot, sale_price: float, sale_date: date, rates: TaxRates) -> Result:
    shares = lot.shares
    pp = lot.purchase_price
    proceeds = sale_price * shares
    notes: list[str] = []

    if lot.is_qualifying(sale_date):
        disposition = "qualifying"
        # Ordinary income = lesser of actual gain, or the discount measured
        # against OFFERING-date FMV (not the purchase price you actually paid).
        statutory_discount = lot.discount * lot.offering_fmv
        actual_gain_ps = sale_price - pp
        if actual_gain_ps <= 0:
            ord_ps = 0.0
            notes.append("Sold at or below purchase price: no ordinary income, entire loss is long-term capital.")
        else:
            ord_ps = min(actual_gain_ps, statutory_discount)
            if statutory_discount < actual_gain_ps:
                notes.append("Ordinary income capped at the offering-date discount; the rest is long-term gain.")
            else:
                notes.append("Gain is smaller than the original discount, so all of it is ordinary income.")
        capital_ps = (sale_price - pp) - ord_ps
        capital_term = "long" if capital_ps != 0 else "none"
        cap_rate = rates.ltcg
    else:
        disposition = "disqualifying"
        # Full spread at purchase is ordinary income, regardless of sale price.
        ord_ps = max(lot.purchase_fmv - pp, 0.0)
        capital_ps = sale_price - lot.purchase_fmv
        held = (sale_date - lot.purchase_date).days
        capital_term = "long" if held > 365 else "short"
        cap_rate = rates.ltcg if capital_term == "long" else rates.ordinary
        notes.append("Full purchase-date spread is W-2 ordinary income even if the stock fell after purchase.")
        if capital_ps < 0:
            notes.append("You owe ordinary tax on income you never realized — the loss is capital and offsets separately.")

    ordinary_income = ord_ps * shares
    capital_gain = capital_ps * shares
    adjusted_basis = pp + ord_ps

    ord_rate = rates.ordinary + rates.state
    capital_rate = cap_rate + rates.state + rates.niit
    tax_ordinary = ordinary_income * ord_rate
    tax_capital = capital_gain * capital_rate  # negative gain -> tax benefit

    notes.append(
        "Broker 1099-B usually reports basis as the discounted purchase price only. "
        f"Adjust to ${adjusted_basis:,.2f}/share on Form 8949 (code B) or you pay tax twice on the discount."
    )

    return Result(
        disposition=disposition,
        shares=shares,
        purchase_price=pp,
        proceeds=proceeds,
        ordinary_income=ordinary_income,
        capital_gain=capital_gain,
        capital_term=capital_term,
        adjusted_basis=adjusted_basis,
        reported_1099b_basis=pp,
        basis_adjustment=(adjusted_basis - pp) * shares,
        tax_ordinary=tax_ordinary,
        tax_capital=tax_capital,
        total_tax=tax_ordinary + tax_capital,
        net_proceeds=proceeds - (tax_ordinary + tax_capital),
        notes=notes,
    )


def compare(lot: ESPPLot, sale_price: float, sale_date: date, rates: TaxRates,
            future_price: float | None = None) -> dict:
    """Sell now vs. wait until the qualifying date (holding price flat by default)."""
    now = analyze(lot, sale_price, sale_date, rates)
    later = analyze(lot, future_price if future_price is not None else sale_price,
                    lot.qualifying_date, rates)
    return {
        "sell_now": now,
        "wait_until_qualifying": later,
        "tax_saved_by_waiting": now.total_tax - later.total_tax,
        "days_to_wait": max((lot.qualifying_date - sale_date).days, 0),
        "breakeven_note": (
            "Waiting only helps if the price holds. Compare the tax saved against "
            "the downside of a concentrated single-stock position over that window."
        ),
    }


if __name__ == "__main__":
    lot = ESPPLot(
        offering_date=date(2024, 1, 1),
        purchase_date=date(2024, 6, 30),
        offering_fmv=50.00,
        purchase_fmv=80.00,
        shares=100,
        discount=0.15,
    )
    rates = TaxRates(ordinary=0.24, ltcg=0.15)
    out = compare(lot, sale_price=90.00, sale_date=date(2025, 8, 1), rates=rates)

    print(f"Paid ${lot.purchase_price}/share  |  qualifying on {lot.qualifying_date}\n")
    for key in ("sell_now", "wait_until_qualifying"):
        r = out[key]
        print(f"{key} ({r.disposition})")
        print(f"  ordinary income   ${r.ordinary_income:>10,.2f}")
        print(f"  capital gain      ${r.capital_gain:>10,.2f}  ({r.capital_term})")
        print(f"  total tax         ${r.total_tax:>10,.2f}")
        print(f"  net proceeds      ${r.net_proceeds:>10,.2f}\n")
    print(f"Tax saved by waiting {out['days_to_wait']} days: ${out['tax_saved_by_waiting']:,.2f}")
