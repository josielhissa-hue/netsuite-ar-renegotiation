# Accounting model

The module uses one balance-sheet account, **Renegotiated Receivables (RR)**, an Other Current Asset that carries the agreement's balance between closing the original invoices and billing each installment. RR always returns to zero when the agreement is settled.

## Setup

| Element | Type | Points to |
| --- | --- | --- |
| RR item | Other Charge item, for sale | Income account = RR account |
| Financing interest item | Other Charge item, for sale | Interest income account |
| Penalty income account | Income / Other Income | |
| Late interest income account | Income / Other Income | |
| Renegotiation discount account | Expense or contra-revenue | |

## Postings

Example (the same figures the engine produces in the unit tests): open invoices 15,000.55; penalty 300.01; late interest 440.01; discount 10% of charges (74.00); down payment 2,000.00; 6 installments at 1.5% per month (Price).

| Moment | Transaction | Debit | Credit |
| --- | --- | --- | --- |
| Execution | Credit memo (RR item), applied to the original invoices | RR 15,000.55 | A/R 15,000.55 |
| Execution | Journal entry | RR 740.02 | Penalty income 300.01 · Late interest income 440.01 |
| Execution | Journal entry | Discount 74.00 | RR 74.00 |
| Execution | Down payment invoice (RR item) | A/R 2,000.00 | RR 2,000.00 |
| Each installment (lead days before due) | Installment invoice: RR item (principal) + interest item | A/R principal + interest | RR principal · Financing interest income |

After the last installment is billed, RR = 15,000.55 + 740.02 − 74.00 − 2,000.00 − Σ principal (13,666.57) = 0. The unit test `posting plan balances the renegotiated receivables account` proves this identity for every simulation.

## Policy choices to review with your auditor

- **Penalty and late interest** are recognized at execution. If collectability is doubtful, consider recognizing them on collection (configure the penalty and late-interest accounts to a deferred account and release on receipt).
- **Financing interest** is recognized as each installment is billed, matching the period it relates to.
- **Expected credit losses.** Renegotiated balances carry higher credit risk. Report RR and the installment invoices separately in your credit-loss (CECL / IFRS 9) analysis; the agreement record and its status (ACTIVE, BROKEN) give the population.
- **Breach.** A BROKEN agreement does not reverse postings. Collections decides whether to pursue the full remaining balance, cure, or write off, through the standard NetSuite process.
