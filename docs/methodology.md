# Calculation methodology

All amounts are computed in integer cents and converted back to currency only for output, so totals never drift by rounding.

## 1. Assessment of each source invoice

For each selected invoice with open balance `A` and due date `D`, at the as-of date `T`:

- Days overdue: `d = max(0, T − D)`
- Penalty: `P = A × penaltyPct` if `d > 0`, else 0
- Late interest, monthly rate `r`:
  - SIMPLE: `L = A × r × d / 30`
  - COMPOUND: `L = A × ((1 + r)^(d/30) − 1)`

## 2. Renegotiated balance

```
Open        = Σ A
Charges     = Σ P + Σ L
DiscountBase = Charges            (policy discountBase = CHARGES, default)
             | Open + Charges     (policy discountBase = TOTAL)
Discount    = min(DiscountBase × discountPct, DiscountBase)
Base        = Open + Charges − Discount
Financed    = Base − DownPayment
```

## 3. Installment schedule

`n` installments, monthly rate `i`, first due date `F`; installment `k` is due on `F + (k − 1) months`, clamped to the last day of shorter months (Jan 31 → Feb 28 → Mar 31).

| Method | Interest of installment k | Principal of installment k |
| --- | --- | --- |
| PRICE (French, level payment) | balance × i | PMT − interest, with PMT = Financed × i / (1 − (1 + i)^−n) |
| SAC (constant amortization) | balance × i | Financed / n |
| FLAT | Financed × i | Financed / n |

With `i = 0`, every method splits the financed amount evenly. The last installment absorbs any rounding residue, so Σ principal = Financed exactly.

## 4. Policy validation

A simulation is valid only if:

- `1 ≤ n ≤ maxInstallments`
- `DownPayment ≥ Base × minDownPct` and `DownPayment < Base`
- `0 ≤ i ≤ financingRatePct`
- First due date ≥ as-of date
- An approval tier exists with `discountPct ≤ maxDiscountPct` and `n ≤ maxInstallments`. The lowest such tier is the agreement's approval level.

Violations are returned as a list; the wizard shows them and hides the Submit button.

## 5. Integrity fingerprint

The full simulation (sources, totals, schedule, parameters, engine version) is serialized canonically (sorted keys) and hashed into a 64-bit fingerprint. The snapshot and fingerprint are stored on the agreement and re-verified on every save and before execution.

The fingerprint is **tamper-evidence, not cryptographic security**: it detects accidental or unauthorized edits to stored terms; access to change scripts is controlled by NetSuite roles.
