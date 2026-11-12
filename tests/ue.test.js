'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./amd-loader');

const T = { CREATE: 'create', EDIT: 'edit', XEDIT: 'xedit', DELETE: 'delete', VIEW: 'view' };
const engineMock = load('jh_lib_rng_engine');
const snapshot = engineMock.simulate({
  asOf: '2026-11-12',
  policy: { penaltyPct: 2, lateRatePct: 1, financingRatePct: 1, maxInstallments: 6, minDownPct: 0, tiers: [{ level: 1, maxDiscountPct: 10, maxInstallments: 6, roles: [1030] }] },
  invoices: [{ id: '1', dueDate: '2026-10-01', amountDue: 1000 }],
  request: { installments: 3, downPayment: 0, firstDueDate: '2026-12-01' }
});

let user = { id: 7, role: 1030 };
const policyRecord = { custrecord_jh_rngp_tiers: JSON.stringify([{ level: 1, maxDiscountPct: 10, maxInstallments: 6, roles: [1030] }]), custrecord_jh_rngp_max_installments: 6 };
const mocks = {
  'N/runtime': { getCurrentUser: () => user, executionContext: 'USERINTERFACE', ContextType: { MAP_REDUCE: 'MAPREDUCE', SCHEDULED: 'SCHEDULED' }, getCurrentScript: () => ({}) },
  'N/task': { create: () => ({ submit: () => 'T1' }), TaskType: { MAP_REDUCE: 'MAP_REDUCE' } },
  'N/log': { error() {}, audit() {} },
  'N/error': { create: ({ name, message }) => Object.assign(new Error(message), { name }) },
  'N/record': { load: () => ({ getValue: ({ fieldId }) => policyRecord[fieldId] }), submitFields() {} },
  'N/search': { lookupFields: () => ({}) }
};
const ue = load('jh_ue_rng_agreement', mocks);

const recOf = (vals) => {
  const v = { ...vals };
  return { id: 55, getValue: ({ fieldId }) => v[fieldId], setValue: ({ fieldId, value }) => { v[fieldId] = value; }, getFields: () => Object.keys(v), _v: v };
};
const stored = () => ({
  custrecord_jh_rnga_status: 'PENDING_APPROVAL',
  custrecord_jh_rnga_requested_by: 7,
  custrecord_jh_rnga_policy: 1,
  custrecord_jh_rnga_approval_level: 1,
  custrecord_jh_rnga_discount: snapshot.totals.discount,
  custrecord_jh_rnga_snapshot: JSON.stringify(snapshot),
  custrecord_jh_rnga_fingerprint: snapshot.fingerprint
});
const ctx = (type, oldVals, newVals) => ({ type, UserEventType: T, oldRecord: recOf(oldVals), newRecord: recOf(newVals) });

test('requester cannot approve own agreement', () => {
  user = { id: 7, role: 1030 };
  assert.throws(() => ue.beforeSubmit(ctx(T.EDIT, stored(), { ...stored(), custrecord_jh_rnga_status: 'APPROVED' })), /Segregation of duties/);
});

test('approver with tier role can approve and gets stamped', () => {
  user = { id: 9, role: 1030 };
  const c = ctx(T.EDIT, stored(), { ...stored(), custrecord_jh_rnga_status: 'APPROVED' });
  ue.beforeSubmit(c);
  assert.equal(c.newRecord._v.custrecord_jh_rnga_approved_by, 9);
});

test('approver without tier role is blocked', () => {
  user = { id: 9, role: 3 };
  assert.throws(() => ue.beforeSubmit(ctx(T.EDIT, stored(), { ...stored(), custrecord_jh_rnga_status: 'APPROVED' })), /cannot approve level 1/);
});

test('terms are locked after creation', () => {
  user = { id: 9, role: 1030 };
  assert.throws(() => ue.beforeSubmit(ctx(T.EDIT, stored(), { ...stored(), custrecord_jh_rnga_discount: 1 })), /locked/);
});

test('invalid transition is blocked, including via inline edit', () => {
  user = { id: 9, role: 1030 };
  assert.throws(() => ue.beforeSubmit(ctx(T.XEDIT, { ...stored(), custrecord_jh_rnga_status: 'ACTIVE' }, { custrecord_jh_rnga_status: 'PENDING_APPROVAL' })), /cannot change/);
});

test('tampered snapshot is rejected on create', () => {
  const bad = { ...stored(), custrecord_jh_rnga_fingerprint: 'deadbeef' };
  assert.throws(() => ue.beforeSubmit(ctx(T.CREATE, {}, bad)), /fingerprint/);
});

test('active agreements cannot be deleted', () => {
  assert.throws(() => ue.beforeSubmit(ctx(T.DELETE, { ...stored(), custrecord_jh_rnga_status: 'ACTIVE' }, {})), /cannot be deleted/);
});
