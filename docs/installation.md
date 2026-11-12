# Installation

## Requirements

- NetSuite account with Custom Records and Server SuiteScript enabled.
- SuiteCloud CLI (`npm install -g @oracle/suitecloud-cli`) authenticated to a **sandbox** first.

## 1. Deploy

```bash
suitecloud project:validate --server
suitecloud project:deploy
```

This creates four custom records (policy, agreement, source invoice, installment), five scripts and their deployments.

## 2. Accounts and items

Create the accounts and items listed in [accounting-model.md](accounting-model.md):

1. Account **Renegotiated Receivables** (Other Current Asset).
2. Accounts for penalty income, late interest income and renegotiation discount.
3. Other Charge item **Renegotiated balance**, income account = Renegotiated Receivables.
4. Other Charge item **Financing interest**, income account = interest income.

## 3. Policy record

Create one **JH Renegotiation Policy** (see `examples/policy-br.json` and `examples/policy-us.json`). Approval tiers are JSON:

```json
[
  { "level": 1, "maxDiscountPct": 10, "maxInstallments": 6,  "roles": [1030] },
  { "level": 2, "maxDiscountPct": 50, "maxInstallments": 12, "roles": [1031, 3] }
]
```

`roles` are internal IDs of the roles allowed to approve that level (for example, Collections Manager and Controller).

## 4. Script parameters and schedule

| Script | Set |
| --- | --- |
| JH Renegotiation Wizard (Suitelet) | Policy parameter; audience = collections roles |
| JH Renegotiation Simulation API (RESTlet) | Policy parameter; audience = integration role |
| JH Renegotiation Monitor (Scheduled) | Schedule daily, early morning |
| JH Renegotiation Execution (Map/Reduce) | No schedule needed; queued on approval and by the monitor |
| JH Renegotiation Agreement Controls (User Event) | Deployed on the agreement record, all roles, all contexts |

## 5. Reconciliation search (control RNG-12)

Create a saved search on the GL for the Renegotiated Receivables account and compare its balance monthly with the open agreement population (ACTIVE and BROKEN).

## 6. Smoke test in sandbox

1. Create an invoice dated 60 days ago for a test customer.
2. Open the wizard, select the invoice, simulate 3 installments, submit.
3. Log in with a different user in an approving role; approve.
4. Confirm the credit memo, journal and down payment invoice, and status ACTIVE.
5. Set an installment's lead days to bill it, run the monitor, confirm the installment invoice.
