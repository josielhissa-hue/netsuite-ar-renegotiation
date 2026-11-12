# Controls matrix

Each control is automated (enforced by script) unless marked otherwise. Assertions follow the usual financial-statement framework: existence/occurrence, completeness, accuracy/valuation, cut-off, rights and obligations, presentation.

| ID | Risk | Control | Type | Where | Assertion |
| --- | --- | --- | --- | --- | --- |
| RNG-01 | Charges calculated inconsistently between customers | Penalty and interest computed by the engine from the policy record; no manual entry | Preventive, automated | `jh_lib_rng_engine.js` | Accuracy |
| RNG-02 | Discounts or terms beyond authority | Approval tiers by discount % and installments; level stored on the agreement | Preventive, automated | Engine + `jh_ue_rng_agreement.js` | Valuation |
| RNG-03 | Same person requests and approves | Requester cannot approve or reject; approver must hold a role in the required tier | Preventive, automated | `jh_ue_rng_agreement.js` | Occurrence |
| RNG-04 | Terms changed after approval | Locked fields + snapshot fingerprint verified on every save and before execution | Preventive, automated | `jh_ue_rng_agreement.js`, `jh_mr_rng_execute.js` | Accuracy |
| RNG-05 | Agreement executed on stale balances (payment received meanwhile) | Live open balance of every source invoice compared to the approved snapshot; any drift stops execution | Preventive, automated | `jh_mr_rng_execute.js` | Accuracy, existence |
| RNG-06 | Original invoices closed without trace | One credit memo per agreement, applied only to the source invoices, linked to the agreement | Preventive, automated | `jh_mr_rng_execute.js` | Completeness |
| RNG-07 | Partial execution leaves books inconsistent | Each step stores its transaction ID; re-runs skip completed steps; failures set status FAILED with a log | Detective / corrective, automated | `jh_mr_rng_execute.js`, `jh_ss_rng_monitor.js` | Completeness |
| RNG-08 | Installments not billed on time | Daily billing of installments within the lead window | Preventive, automated | `jh_ss_rng_monitor.js` | Cut-off |
| RNG-09 | Breached agreements unnoticed | Overdue beyond grace → BROKEN + e-mail to collections; cure and settlement detected automatically | Detective, automated | `jh_ss_rng_monitor.js` | Valuation |
| RNG-10 | Invalid status changes | Allowed-transition map; inline edits checked too | Preventive, automated | Engine + User Event | Occurrence |
| RNG-11 | Active agreements deleted | Delete allowed only for DRAFT, REJECTED or CANCELLED | Preventive, automated | `jh_ue_rng_agreement.js` | Completeness |
| RNG-12 | RR account carries unexplained balance | Monthly reconciliation: RR balance = Σ (base − down payment − billed principal) of ACTIVE and BROKEN agreements | Detective, manual (review) | Saved search, see installation guide | Valuation, presentation |

## Evidence for testing

- **Design:** this matrix, the source code and the unit tests in `tests/`.
- **Operating effectiveness:** for a sample of agreements, inspect the agreement record (snapshot, fingerprint, requested by, decided by, execution log) and its linked credit memo, journal and installment invoices.
