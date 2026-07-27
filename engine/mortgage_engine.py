"""
Mortgage calculator engine — amortization, extra payments, and refinance comparison.

Educational tool. Ignores PMI removal timing nuances, property tax/insurance
escrow, and points tax treatment unless you extend it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


def add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return date(y, m, day)


def monthly_payment(principal: float, annual_rate: float, term_months: int) -> float:
    """Standard fixed-rate amortizing payment (P&I only)."""
    if annual_rate == 0:
        return principal / term_months
    r = annual_rate / 12
    return principal * r / (1 - (1 + r) ** -term_months)


@dataclass
class ExtraPayment:
    amount: float
    monthly_index: int | None = None   # one-time, applied at this payment number
    recurring: bool = False            # if True, applies every month from monthly_index on


@dataclass
class Loan:
    principal: float
    annual_rate: float
    term_years: int
    start_date: date
    extra_payments: list[ExtraPayment] = field(default_factory=list)

    @property
    def term_months(self) -> int:
        return self.term_years * 12

    @property
    def base_payment(self) -> float:
        return monthly_payment(self.principal, self.annual_rate, self.term_months)


@dataclass
class ScheduleRow:
    period: int
    date: date
    payment: float
    principal_paid: float
    interest_paid: float
    extra_paid: float
    balance: float


@dataclass
class Summary:
    payoff_date: date
    months_to_payoff: int
    total_paid: float
    total_interest: float
    schedule: list[ScheduleRow]


def _extra_for_period(loan: Loan, period: int) -> float:
    total = 0.0
    for e in loan.extra_payments:
        if e.monthly_index is None:
            continue
        if e.recurring and period >= e.monthly_index:
            total += e.amount
        elif not e.recurring and period == e.monthly_index:
            total += e.amount
    return total


def amortize(loan: Loan) -> Summary:
    balance = loan.principal
    rate_m = loan.annual_rate / 12
    payment = loan.base_payment
    schedule: list[ScheduleRow] = []
    total_interest = 0.0
    total_paid = 0.0
    period = 0

    while balance > 0.01 and period < loan.term_months + 600:  # safety cap
        period += 1
        interest = balance * rate_m
        sched_principal = min(payment - interest, balance)
        extra = min(_extra_for_period(loan, period), balance - sched_principal)
        extra = max(extra, 0.0)
        principal_paid = sched_principal + extra
        balance = balance - principal_paid  # keep full precision; round only for display

        row_payment = interest + principal_paid
        total_interest += interest
        total_paid += row_payment

        schedule.append(ScheduleRow(
            period=period,
            date=add_months(loan.start_date, period - 1),
            payment=round(row_payment, 2),
            principal_paid=round(principal_paid, 2),
            interest_paid=round(interest, 2),
            extra_paid=round(extra, 2),
            balance=round(max(balance, 0.0), 2),
        ))
        if balance <= 0.005:
            break

    return Summary(
        payoff_date=schedule[-1].date if schedule else loan.start_date,
        months_to_payoff=period,
        total_paid=round(total_paid, 2),
        total_interest=round(total_interest, 2),
        schedule=schedule,
    )


def compare_extra_payment(loan: Loan, extra_monthly: float) -> dict:
    """Baseline (no extra) vs. with a recurring extra monthly payment."""
    baseline = amortize(Loan(loan.principal, loan.annual_rate, loan.term_years, loan.start_date))
    with_extra = amortize(Loan(
        loan.principal, loan.annual_rate, loan.term_years, loan.start_date,
        extra_payments=[ExtraPayment(amount=extra_monthly, monthly_index=1, recurring=True)],
    ))
    return {
        "baseline": baseline,
        "with_extra": with_extra,
        "interest_saved": round(baseline.total_interest - with_extra.total_interest, 2),
        "months_saved": baseline.months_to_payoff - with_extra.months_to_payoff,
    }


@dataclass
class RefinanceInputs:
    current_balance: float
    current_rate: float
    current_remaining_months: int
    new_rate: float
    new_term_years: int
    closing_costs: float
    start_date: date


def compare_refinance(r: RefinanceInputs) -> dict:
    """Keep current loan vs. refinance into a new one, with breakeven on closing costs."""
    current_payment = monthly_payment(r.current_balance, r.current_rate, r.current_remaining_months)
    current_summary = _amortize_months(r.current_balance, r.current_rate,
                                        r.current_remaining_months, r.start_date)

    new_loan_months = r.new_term_years * 12
    new_payment = monthly_payment(r.current_balance, r.new_rate, new_loan_months)
    new_summary = _amortize_months(r.current_balance, r.new_rate, new_loan_months, r.start_date)

    monthly_savings = current_payment - new_payment
    breakeven_months = (r.closing_costs / monthly_savings) if monthly_savings > 0 else None

    return {
        "current_payment": round(current_payment, 2),
        "new_payment": round(new_payment, 2),
        "monthly_savings": round(monthly_savings, 2),
        "current_total_interest": current_summary.total_interest,
        "new_total_interest": new_summary.total_interest,
        "lifetime_interest_diff": round(current_summary.total_interest - new_summary.total_interest, 2),
        "breakeven_months": round(breakeven_months, 1) if breakeven_months else None,
    }


def _amortize_months(principal: float, annual_rate: float, term_months: int, start: date) -> Summary:
    """Amortize with an explicit month count (avoids year-rounding issues)."""
    loan = Loan(principal, annual_rate, term_months / 12, start)
    # monkeypatch: force exact term_months via a temp subclass-free approach
    balance = principal
    rate_m = annual_rate / 12
    payment = monthly_payment(principal, annual_rate, term_months)
    schedule = []
    total_interest = 0.0
    total_paid = 0.0
    for period in range(1, term_months + 1):
        interest = balance * rate_m
        principal_paid = min(payment - interest, balance)
        balance = balance - principal_paid
        total_interest += interest
        total_paid += interest + principal_paid
        schedule.append(ScheduleRow(
            period=period, date=add_months(start, period - 1),
            payment=round(interest + principal_paid, 2),
            principal_paid=round(principal_paid, 2), interest_paid=round(interest, 2),
            extra_paid=0.0, balance=round(max(balance, 0.0), 2),
        ))
        if balance <= 0.005:
            break
    return Summary(
        payoff_date=schedule[-1].date if schedule else start,
        months_to_payoff=len(schedule),
        total_paid=round(total_paid, 2),
        total_interest=round(total_interest, 2),
        schedule=schedule,
    )


if __name__ == "__main__":
    loan = Loan(principal=500_000, annual_rate=0.065, term_years=30, start_date=date(2026, 8, 1))
    print(f"Base payment: ${loan.base_payment:,.2f}/mo\n")

    out = compare_extra_payment(loan, extra_monthly=400)
    print(f"Baseline payoff:   {out['baseline'].payoff_date}  interest ${out['baseline'].total_interest:,.2f}")
    print(f"With $400 extra:   {out['with_extra'].payoff_date}  interest ${out['with_extra'].total_interest:,.2f}")
    print(f"Saved: ${out['interest_saved']:,.2f} and {out['months_saved']} months\n")

    refi = compare_refinance(RefinanceInputs(
        current_balance=500_000, current_rate=0.065, current_remaining_months=336,
        new_rate=0.058, new_term_years=30, closing_costs=6000, start_date=date(2026, 8, 1),
    ))
    print(f"Current payment: ${refi['current_payment']:,.2f}  New payment: ${refi['new_payment']:,.2f}")
    print(f"Monthly savings: ${refi['monthly_savings']:,.2f}  Breakeven: {refi['breakeven_months']} months")
    print(f"Lifetime interest diff: ${refi['lifetime_interest_diff']:,.2f}")
