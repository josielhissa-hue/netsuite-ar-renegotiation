# JH Receivables Renegotiation for NetSuite

**Audit-ready renegotiation of overdue customer invoices, built natively on NetSuite.**
Module 1 of the **JH Finance Controls Framework**, an open-source set of SuiteScript components that embed internal controls directly into finance processes.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![SuiteScript 2.1](https://img.shields.io/badge/SuiteScript-2.1-informational)
![Tests](https://img.shields.io/badge/tests-18%20passing-brightgreen)

---

## The problem

When a customer falls behind, finance teams negotiate a deal: consolidate the overdue invoices, add late fees and interest, maybe grant a discount, take a down payment and split the rest into installments.

NetSuite has no native object for this. In practice, teams improvise with spreadsheets, manual credit memos and journal entries, and new invoices typed one by one. The result is a process auditors flag again and again:

- No record of **what was agreed**, by whom, and on which numbers.
- Discounts granted **without approval limits** or segregation of duties.
- Original invoices closed with **ad-hoc credit memos**, breaking the audit trail.
- Late fees and interest **calculated by hand**, inconsistently between customers.
- No one notices when the customer **breaks the agreement** until months later.

## What this module does

| Step | What happens | Control it enforces |
| --- | --- | --- |
| 1. Simulate | A Suitelet wizard selects the customer's open invoices and calculates penalty, late interest, discount, down payment and an installment schedule (Price, SAC or Flat). | Policy limits: max installments, max rate, min down payment, discount tiers. |
| 2. Submit | The agreement is saved with a JSON snapshot of every number and an integrity fingerprint. | Terms are **locked**: any later change to amounts is blocked. |
| 3. Approve | Approve / Reject buttons appear only for roles allowed at the agreement's approval level. | **Segregation of duties**: the requester can never approve. |
| 4. Execute | A Map/Reduce re-checks the original balances, closes the invoices with one credit memo, posts charges and discount in one journal, and bills the down payment. | **Drift check**: if any balance changed after approval, nothing posts and the agreement goes to FAILED. |
| 5. Monitor | A daily scheduled script bills each installment ahead of its due date, flags late installments, marks the agreement BROKEN after the grace period, cures it when paid, and SETTLED at the end. | **Breach detection** with e-mail to collections. |
| API | A RESTlet exposes the same simulation to portals or collection tools. | Same engine, same policy, read-only. |

## Why it is different

- **Accounting first.** Designed by an ex-Big Four auditor: every number traces to a source invoice, and the Renegotiated Receivables account always reconciles to zero at settlement (see [accounting model](docs/accounting-model.md)).
- **Controls you can show your auditor.** A [controls matrix](docs/controls-matrix.md) maps each control to the risk and financial-statement assertion it addresses.
- **Deterministic engine.** The calculation core (`jh_lib_rng_engine.js`) has no NetSuite dependencies, works in integer cents, and is covered by unit tests.
- **Jurisdiction-neutral.** Penalty, interest mode, rates and tiers live in a policy record. Example policies for Brazil and the U.S. are in [`examples/`](examples/).

## Repository layout

```
src/
  FileCabinet/SuiteScripts/jh_ar_renegotiation/
    jh_lib_rng_engine.js     Pure calculation engine (no N/ modules)
    jh_lib_rng_data.js       Record/field IDs, policy loader, persistence
    jh_sl_rng_wizard.js      Suitelet: simulation wizard, approve/reject endpoint
    jh_ue_rng_agreement.js   User Event: SoD, approval limits, locks, transitions
    jh_cs_rng_agreement.js   Client Script: approve/reject buttons
    jh_mr_rng_execute.js     Map/Reduce: credit memo, journal, down payment
    jh_ss_rng_monitor.js     Scheduled: billing, breach, cure, settlement
    jh_rl_rng_api.js         RESTlet: simulation API
  Objects/                   SDF custom records and script deployments
docs/                        Methodology, accounting model, controls, install, API
examples/                    Policy presets and API request sample
tests/                       Node test runner with mocked N/ modules
```

## Quick start

```bash
git clone https://github.com/josielhissa-hue/netsuite-ar-renegotiation.git
cd netsuite-ar-renegotiation
npm test                     # runs the engine, user event and map/reduce tests
suitecloud project:deploy    # after account setup, see docs/installation.md
```

Full setup (items, accounts, policy record, roles): [docs/installation.md](docs/installation.md).

## Status

Version 1.0.0. Logic is unit-tested locally with mocked NetSuite modules. **Validate in a sandbox account before production use.** Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

**Josiel Hissa**, JHISSA Consultoria. Accountant with 12 years in Big Four audit and consulting, now building finance automation on NetSuite.
[LinkedIn](https://linkedin.com/in/josielhissa) · josiel.hissa@jhissa.com.br

Licensed under the [MIT License](LICENSE).
