"""Tests for the ESPP disposition engine. Run: pytest -v"""

from datetime import date

import pytest

from espp_engine import ESPPLot, TaxRates, add_years, analyze, compare

RATES = TaxRates(ordinary=0.24, ltcg=0.15)


def lot(**kw):
    base = dict(
        offering_date=date(2024, 1, 1),
        purchase_date=date(2024, 6, 30),
        offering_fmv=50.00,
        purchase_fmv=80.00,
        shares=100,
        discount=0.15,
    )
    base.update(kw)
    return ESPPLot(**base)


# --- purchase price / lookback -------------------------------------------

def test_lookback_uses_lower_offering_price():
    assert lot().purchase_price == pytest.approx(42.50)  # 50 * 0.85


def test_without_lookback_uses_purchase_price():
    assert lot(lookback=False).purchase_price == pytest.approx(68.00)  # 80 * 0.85


def test_lookback_picks_purchase_price_when_stock_fell():
    assert lot(offering_fmv=80, purchase_fmv=50).purchase_price == pytest.approx(42.50)


# --- holding period gates ------------------------------------------------

def test_qualifying_date_is_later_of_two_gates():
    # 2yr from offering (2026-01-01) beats 1yr from purchase (2025-06-30)
    assert lot().qualifying_date == date(2026, 1, 1)


def test_purchase_gate_can_dominate():
    l = lot(offering_date=date(2024, 1, 1), purchase_date=date(2025, 11, 1))
    assert l.qualifying_date == date(2026, 11, 1)


def test_one_day_short_is_disqualifying():
    l = lot()
    assert not l.is_qualifying(date(2025, 12, 31))
    assert l.is_qualifying(date(2026, 1, 1))


def test_leap_day_rolls_forward():
    assert add_years(date(2024, 2, 29), 1) == date(2025, 3, 1)


# --- disqualifying -------------------------------------------------------

def test_disqualifying_taxes_full_purchase_spread():
    r = analyze(lot(), sale_price=90.00, sale_date=date(2025, 8, 1), rates=RATES)
    assert r.disposition == "disqualifying"
    assert r.ordinary_income == pytest.approx(3750.00)   # (80 - 42.50) * 100
    assert r.capital_gain == pytest.approx(1000.00)      # (90 - 80) * 100
    assert r.capital_term == "long"


def test_disqualifying_short_term_when_under_a_year():
    r = analyze(lot(), sale_price=90.00, sale_date=date(2024, 9, 1), rates=RATES)
    assert r.capital_term == "short"
    # short-term capital taxed at ordinary rate
    assert r.tax_capital == pytest.approx(1000.00 * 0.24)


def test_disqualifying_still_owes_tax_when_stock_crashed():
    """The nastiest ESPP case: ordinary income on money you never got."""
    r = analyze(lot(), sale_price=30.00, sale_date=date(2025, 8, 1), rates=RATES)
    assert r.ordinary_income == pytest.approx(3750.00)
    assert r.capital_gain == pytest.approx(-5000.00)
    assert r.tax_ordinary > 0
    assert any("never realized" in n for n in r.notes)


# --- qualifying ----------------------------------------------------------

def test_qualifying_caps_ordinary_at_offering_discount():
    r = analyze(lot(), sale_price=90.00, sale_date=date(2026, 6, 1), rates=RATES)
    assert r.disposition == "qualifying"
    assert r.ordinary_income == pytest.approx(750.00)    # 0.15 * 50 * 100
    assert r.capital_gain == pytest.approx(4000.00)      # rest is LTCG
    assert r.capital_term == "long"


def test_qualifying_small_gain_is_all_ordinary():
    r = analyze(lot(), sale_price=45.00, sale_date=date(2026, 6, 1), rates=RATES)
    assert r.ordinary_income == pytest.approx(250.00)    # gain (2.50) < discount (7.50)
    assert r.capital_gain == pytest.approx(0.00)


def test_qualifying_loss_has_no_ordinary_income():
    r = analyze(lot(), sale_price=40.00, sale_date=date(2026, 6, 1), rates=RATES)
    assert r.ordinary_income == 0.0
    assert r.capital_gain == pytest.approx(-250.00)
    assert r.tax_ordinary == 0.0


# --- basis ---------------------------------------------------------------

def test_basis_adjustment_equals_ordinary_income():
    """The Form 8949 correction is exactly the discount already taxed as wages."""
    r = analyze(lot(), sale_price=90.00, sale_date=date(2025, 8, 1), rates=RATES)
    assert r.basis_adjustment == pytest.approx(r.ordinary_income)
    assert r.reported_1099b_basis == pytest.approx(42.50)
    assert r.adjusted_basis == pytest.approx(80.00)


def test_no_double_taxation_when_basis_adjusted():
    """Ordinary + capital income should equal total economic gain, not more."""
    r = analyze(lot(), sale_price=90.00, sale_date=date(2025, 8, 1), rates=RATES)
    total_gain = (90.00 - 42.50) * 100
    assert r.ordinary_income + r.capital_gain == pytest.approx(total_gain)


# --- comparison ----------------------------------------------------------

def test_waiting_saves_tax_when_price_holds():
    out = compare(lot(), sale_price=90.00, sale_date=date(2025, 8, 1), rates=RATES)
    assert out["sell_now"].disposition == "disqualifying"
    assert out["wait_until_qualifying"].disposition == "qualifying"
    assert out["tax_saved_by_waiting"] > 0
    assert out["days_to_wait"] == 153


def test_no_days_to_wait_if_already_qualifying():
    out = compare(lot(), sale_price=90.00, sale_date=date(2026, 6, 1), rates=RATES)
    assert out["days_to_wait"] == 0


def test_waiting_can_lose_if_price_drops():
    out = compare(lot(), sale_price=90.00, sale_date=date(2025, 8, 1),
                  rates=RATES, future_price=55.00)
    assert out["wait_until_qualifying"].net_proceeds < out["sell_now"].net_proceeds


# --- rates ---------------------------------------------------------------

def test_state_rate_applies_to_both_buckets():
    plain = analyze(lot(), 90.00, date(2025, 8, 1), TaxRates(0.24, 0.15))
    with_state = analyze(lot(), 90.00, date(2025, 8, 1), TaxRates(0.24, 0.15, state=0.05))
    expected = plain.total_tax + (plain.ordinary_income + plain.capital_gain) * 0.05
    assert with_state.total_tax == pytest.approx(expected)
