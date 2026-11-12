'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./amd-loader');

const engine = load('jh_lib_rng_engine');

const policy = {
  penaltyPct: 2, lateRatePct: 1, lateMode: 'SIMPLE', financingRatePct: 1.5, maxInstallments: 12,
  minDownPct: 10, discountBase: 'CHARGES', defaultMethod: 'PRICE',
  tiers: [
    { level: 1, maxDiscountPct: 10, maxInstallments: 6, roles: [1030] },
    { level: 2, maxDiscountPct: 50, maxInstallments: 12, roles: [3] }
  ]
};
const invoices = [
  { id: '101', tranId: 'INV-101', dueDate: '2026-08-01', amountDue: 10000 },
  { id: '102', tranId: 'INV-102', dueDate: '2026-09-15', amountDue: 5000.55 }
];
const base = (terms) => engine.simulate({ asOf: '2026-11-12', policy, invoices, request: { installments: 6, downPayment: 2000, firstDueDate: '2026-12-10', method: 'PRICE', ...terms } });

const cents = (v) => Math.round(v * 100);

test('late charges follow policy per invoice', () => {
  const r = base({});
  const a = r.sources.find((s) => s.id === '101');
  assert.equal(a.daysOverdue, 103);
  assert.equal(a.penalty, 200);
  assert.equal(a.lateInterest, 343.33);
  assert.equal(r.totals.openAmount, 15000.55);
});

test('schedule principal adds up exactly to financed amount (Price, SAC, Flat)', () => {
  for (const method of ['PRICE', 'SAC', 'FLAT']) {
    const r = base({ method });
    assert.equal(r.valid, true, r.violations.join(';'));
    const sum = r.schedule.reduce((s, x) => s + cents(x.principal), 0);
    assert.equal(sum, cents(r.totals.financed), method);
    assert.equal(r.schedule[r.schedule.length - 1].balanceAfter, 0);
    assert.equal(cents(r.totals.totalDue), cents(r.totals.downPayment) + cents(r.totals.financed) + cents(r.totals.financingInterest));
  }
});

test('Price installments are level except last-cent adjustment', () => {
  const r = base({ method: 'PRICE' });
  const amounts = r.schedule.map((x) => cents(x.amount));
  const first = amounts[0];
  amounts.slice(0, -1).forEach((a) => assert.equal(a, first));
  assert.ok(Math.abs(amounts[amounts.length - 1] - first) <= 2);
});

test('discount applies to charges only and drives approval level', () => {
  const low = base({ discountPct: 5 });
  assert.equal(low.approvalLevel, 1);
  const charges = cents(low.totals.penalty) + cents(low.totals.lateInterest);
  assert.equal(cents(low.totals.discount), Math.round(charges * 0.05));
  const high = base({ discountPct: 30, installments: 10 });
  assert.equal(high.approvalLevel, 2);
  const none = base({ discountPct: 80 });
  assert.equal(none.valid, false);
  assert.match(none.violations.join(' '), /No approval tier/);
});

test('policy limits are enforced', () => {
  assert.match(base({ installments: 24 }).violations.join(' '), /above policy limit/);
  assert.match(base({ downPayment: 0 }).violations.join(' '), /below policy minimum/);
  assert.match(base({ ratePct: 3 }).violations.join(' '), /above policy rate/);
  assert.match(base({ firstDueDate: '2026-10-01' }).violations.join(' '), /before the as-of date/);
  assert.throws(() => engine.simulate({ asOf: '2026-11-12', policy, invoices: [invoices[0], invoices[0]], request: { installments: 1, firstDueDate: '2026-12-01', downPayment: 5000 } }), /selected twice/);
});

test('zero rate splits evenly and month-end dates clamp', () => {
  const r = base({ ratePct: 0, firstDueDate: '2027-01-31' });
  assert.equal(r.totals.financingInterest, 0);
  assert.equal(r.schedule.slice(0, 3).map((x) => x.dueDate).join(','), '2027-01-31,2027-02-28,2027-03-31');
});

test('fingerprint detects tampering after JSON round-trip', () => {
  const r = base({});
  const stored = JSON.parse(JSON.stringify(r));
  assert.equal(engine.verify(stored), true);
  stored.totals.discount = 999;
  assert.equal(engine.verify(stored), false);
});

test('posting plan balances the renegotiated receivables account', () => {
  const r = base({ discountPct: 10 });
  const p = engine.postingPlan(r);
  const debit = cents(p.creditMemo.renegotiatedReceivable) + cents(p.journal.debitRenegotiated);
  const credit = cents(p.journal.creditRenegotiatedForDiscount) + cents(p.downPaymentInvoice) + p.installmentInvoices.reduce((s, i) => s + cents(i.renegotiated), 0);
  assert.equal(debit, credit);
});

test('status transitions', () => {
  assert.equal(engine.canTransition('PENDING_APPROVAL', 'APPROVED'), true);
  assert.equal(engine.canTransition('ACTIVE', 'PENDING_APPROVAL'), false);
  assert.equal(engine.canTransition('SETTLED', 'ACTIVE'), false);
});
