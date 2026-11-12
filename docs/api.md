# Simulation API (RESTlet)

`GET` returns the engine version and supported methods.

`POST` simulates a renegotiation with live open invoices and the configured policy. It never writes data.

## Request

```json
{
  "customerId": "1234",
  "invoiceIds": ["5501", "5502"],
  "asOf": "2026-11-12",
  "terms": {
    "discountPct": 5,
    "downPayment": 2000,
    "installments": 6,
    "firstDueDate": "2026-12-10",
    "method": "PRICE",
    "ratePct": 1.5
  }
}
```

Omit `invoiceIds` to include every open invoice of the customer. Omit `ratePct` to use the policy rate.

## Response

```json
{
  "ok": true,
  "simulation": {
    "engineVersion": "1.0.0",
    "method": "PRICE",
    "installments": 6,
    "approvalLevel": 1,
    "totals": { "openAmount": 15000.55, "penalty": 300.01, "lateInterest": 440.01, "discount": 37, "baseAmount": 15703.57, "downPayment": 2000, "financed": 13703.57, "financingInterest": 728.37, "totalDue": 16431.94 },
    "schedule": [{ "number": 1, "dueDate": "2026-12-10", "principal": 2199.77, "interest": 205.55, "amount": 2405.32, "balanceAfter": 11503.8 }, "…"],
    "valid": true,
    "violations": [],
    "fingerprint": "…"
  }
}
```

Figures above come from the engine for two invoices (10,000.00 due 2026-08-01 and 5,000.55 due 2026-09-15) under `examples/policy-br.json`; the schedule is truncated after the first installment.
