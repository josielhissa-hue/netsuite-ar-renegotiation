'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./amd-loader');

const engine = load('jh_lib_rng_engine');
const snap = engine.simulate({
  asOf: '2026-11-12',
  policy: { penaltyPct: 2, lateRatePct: 1, financingRatePct: 1, maxInstallments: 6, minDownPct: 0, tiers: [{ level: 1, maxDiscountPct: 10, maxInstallments: 6 }] },
  invoices: [{ id: '11', tranId: 'INV-11', dueDate: '2026-10-01', amountDue: 1000 }, { id: '12', tranId: 'INV-12', dueDate: '2026-10-15', amountDue: 500 }],
  request: { installments: 3, downPayment: 300, discountPct: 10, firstDueDate: '2026-12-01' }
});

function harness(liveBalances) {
  const created = [];
  const agreement = {
    custrecord_jh_rnga_status: 'APPROVED', custrecord_jh_rnga_customer: 5, custrecord_jh_rnga_currency: 1, custrecord_jh_rnga_policy: 2,
    custrecord_jh_rnga_snapshot: JSON.stringify(snap), custrecord_jh_rnga_fingerprint: snap.fingerprint
  };
  const policy = {
    custrecord_jh_rngp_rr_item: 900, custrecord_jh_rngp_interest_item: 901, custrecord_jh_rngp_acc_rr: 120, custrecord_jh_rngp_acc_penalty: 410,
    custrecord_jh_rngp_acc_late: 411, custrecord_jh_rngp_acc_discount: 610, custrecord_jh_rngp_tiers: '[]', custrecord_jh_rngp_max_installments: 6
  };
  const submitted = [];
  const txn = (type) => {
    const t = { type, body: {}, lines: { item: [], line: [], apply: [{ internalid: '11' }, { internalid: '12' }, { internalid: '99' }] }, cur: null, curList: null };
    return {
      setValue: ({ fieldId, value }) => { t.body[fieldId] = value; },
      selectNewLine: ({ sublistId }) => { t.cur = {}; t.curList = sublistId; t.lines[sublistId].push(t.cur); },
      selectLine: ({ sublistId, line }) => { t.cur = t.lines[sublistId][line]; t.curList = sublistId; },
      setCurrentSublistValue: ({ fieldId, value }) => { t.cur[fieldId] = value; },
      commitLine: () => {},
      getLineCount: ({ sublistId }) => t.lines[sublistId].length,
      getSublistValue: ({ sublistId, fieldId, line }) => t.lines[sublistId][line][fieldId],
      save: () => { created.push(t); return 1000 + created.length; }
    };
  };
  const mocks = {
    'N/record': {
      Type: { CREDIT_MEMO: 'creditmemo', JOURNAL_ENTRY: 'journalentry', INVOICE: 'invoice' },
      load: ({ type, id }) => ({ id, getValue: ({ fieldId }) => (type === 'customrecord_jh_rng_agreement' ? agreement : policy)[fieldId] }),
      create: ({ type }) => txn(type),
      submitFields: ({ values }) => { submitted.push(values); Object.assign(agreement, values); }
    },
    'N/search': {
      Type: { INVOICE: 'invoice' },
      create: () => ({ run: () => ({ each: (cb) => Object.entries(liveBalances).forEach(([id, amt]) => cb({ id, getValue: () => amt })) }) }),
      lookupFields: () => ({})
    },
    'N/runtime': { getCurrentScript: () => ({ getParameter: () => '77' }), getCurrentUser: () => ({ id: 1 }) },
    'N/log': { error() {}, audit() {} }
  };
  const mr = load('jh_mr_rng_execute', mocks);
  const writes = [];
  mr.map({ value: '"77"', write: (w) => writes.push(w) });
  return { created, agreement, writes };
}

test('approved agreement executes credit memo, balanced journal and down payment', () => {
  const { created, agreement, writes } = harness({ 11: 1000, 12: 500 });
  assert.equal(writes[0].key, 'ok');
  assert.equal(agreement.custrecord_jh_rnga_status, 'ACTIVE');
  const [cm, je, dp] = created;
  assert.equal(cm.type, 'creditmemo');
  assert.equal(cm.lines.apply.filter((l) => l.apply).length, 2);
  assert.equal(cm.lines.item[0].amount, 1500);
  const dr = je.lines.line.reduce((s, l) => s + Math.round((l.debit || 0) * 100), 0);
  const cr = je.lines.line.reduce((s, l) => s + Math.round((l.credit || 0) * 100), 0);
  assert.equal(dr, cr);
  assert.equal(dp.type, 'invoice');
  assert.equal(dp.lines.item[0].amount, 300);
});

test('balance drift after approval fails safely without posting', () => {
  const { created, agreement, writes } = harness({ 11: 1000, 12: 200 });
  assert.equal(writes[0].key, 'failed');
  assert.equal(agreement.custrecord_jh_rnga_status, 'FAILED');
  assert.equal(created.length, 0);
  assert.match(agreement.custrecord_jh_rnga_exec_log || '', /INV-12/);
});
