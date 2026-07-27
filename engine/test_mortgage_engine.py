"""Tests for the mortgage engine. Run: pytest -v"""

from datetime import date

import pytest

from mortgage_engine import (
    Loan, ExtraPayment, RefinanceInputs, add_months, amortize,
    compare_extra_payment, compare_refinance, monthly_payment,
)


def approx(v, tol=0.02):
    class _A:
        def __eq__(self, o): return abs(o - v) <= tol
        def __repr__(self): return f"~{v}"
    return _A()


# --- payment formula -------------------------------------------------------

def test_standard_payment_matches_known_value():
    # $300k, 6%, 30yr -> well-known ~$1798.65
    p = monthly_payment(300_000, 0.06, 360)
    assert p == approx(1798.65, tol=0.05)


def test_zero_rate_is_simple_division():
    assert monthly_payment(120_000, 0.0, 120) == approx(1000.00)


def test_add_months_rolls_year():
    assert add_months(date(2026, 11, 1), 3) == date(2027, 2, 1)


def test_add_months_clamps_short_months():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)


# --- amortization ------------------------------------------------------

def test_amortization_reaches_zero_balance():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    s = amortize(loan)
    assert s.schedule[-1].balance == 0.0
    assert s.months_to_payoff == 360


def test_amortization_total_paid_equals_principal_plus_interest():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    s = amortize(loan)
    assert s.total_paid == approx(300_000 + s.total_interest, tol=5)


def test_first_payment_mostly_interest():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    s = amortize(loan)
    first = s.schedule[0]
    assert first.interest_paid > first.principal_paid


def test_last_payment_mostly_principal():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    s = amortize(loan)
    last = s.schedule[-1]
    assert last.principal_paid > last.interest_paid


def test_schedule_dates_increment_monthly():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    s = amortize(loan)
    assert s.schedule[0].date == date(2026, 1, 1)
    assert s.schedule[1].date == date(2026, 2, 1)
    assert s.schedule[11].date == date(2026, 12, 1)


# --- extra payments ------------------------------------------------------

def test_recurring_extra_payment_shortens_term():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    out = compare_extra_payment(loan, extra_monthly=300)
    assert out["with_extra"].months_to_payoff < out["baseline"].months_to_payoff
    assert out["months_saved"] > 0
    assert out["interest_saved"] > 0


def test_larger_extra_payment_saves_more_interest():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1))
    small = compare_extra_payment(loan, extra_monthly=100)
    large = compare_extra_payment(loan, extra_monthly=500)
    assert large["interest_saved"] > small["interest_saved"]


def test_one_time_extra_payment_reduces_balance_at_that_point():
    loan = Loan(300_000, 0.06, 30, date(2026, 1, 1),
                extra_payments=[ExtraPayment(amount=20_000, monthly_index=12, recurring=False)])
    s = amortize(loan)
    assert s.schedule[11].extra_paid == approx(20_000, tol=0.5)
    assert s.schedule[12].extra_paid == 0.0


def test_extra_payment_never_overpays_final_balance():
    loan = Loan(50_000, 0.06, 5, date(2026, 1, 1),
                extra_payments=[ExtraPayment(amount=5_000, monthly_index=1, recurring=True)])
    s = amortize(loan)
    assert all(row.balance >= 0 for row in s.schedule)
    assert s.schedule[-1].balance == 0.0


# --- refinance -------------------------------------------------------------

def test_lower_rate_refi_reduces_payment():
    refi = compare_refinance(RefinanceInputs(
        current_balance=400_000, current_rate=0.07, current_remaining_months=300,
        new_rate=0.06, new_term_years=25, closing_costs=5000, start_date=date(2026, 1, 1),
    ))
    assert refi["new_payment"] < refi["current_payment"]
    assert refi["monthly_savings"] > 0


def test_breakeven_scales_with_closing_costs():
    base_kwargs = dict(current_balance=400_000, current_rate=0.07, current_remaining_months=300,
                        new_rate=0.06, new_term_years=25, start_date=date(2026, 1, 1))
    low = compare_refinance(RefinanceInputs(closing_costs=2000, **base_kwargs))
    high = compare_refinance(RefinanceInputs(closing_costs=8000, **base_kwargs))
    assert high["breakeven_months"] > low["breakeven_months"]


def test_refi_into_higher_rate_has_no_breakeven():
    refi = compare_refinance(RefinanceInputs(
        current_balance=400_000, current_rate=0.05, current_remaining_months=300,
        new_rate=0.07, new_term_years=30, closing_costs=5000, start_date=date(2026, 1, 1),
    ))
    assert refi["monthly_savings"] < 0
    assert refi["breakeven_months"] is None
