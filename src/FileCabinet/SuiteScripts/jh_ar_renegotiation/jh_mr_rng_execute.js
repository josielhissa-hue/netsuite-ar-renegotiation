/**
 * © 2026 JHISSA Consultoria. Released under the MIT License (see LICENSE).
 * JH Receivables Renegotiation for NetSuite · JH Finance Controls Framework
 *
 * JHISSA Consultoria
 * Av. Paulista, 171, 4º andar, Bela Vista – São Paulo/SP – 01311-904
 * Contact: Josiel Hissa · josiel.hissa@jhissa.com.br · linkedin.com/in/josielhissa
 * Reference: JH-OSS-2026-001
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/log', './jh_lib_rng_data'], (record, search, runtime, log, data) => {
  const PARAM_AGREEMENT = 'custscript_jh_rng_mr_agreement';
  const { REC, AG, STATUS } = data;
  const toCents = (v) => Math.round(data.num(v) * 100);

  const getInputData = () => {
    const single = runtime.getCurrentScript().getParameter({ name: PARAM_AGREEMENT });
    if (single) return [String(single)];
    const ids = [];
    search.create({
      type: REC.AGREEMENT,
      filters: [[AG.STATUS, 'is', STATUS.APPROVED], 'AND', [AG.CREDIT_MEMO, 'anyof', '@NONE@']],
      columns: ['internalid']
    }).run().each((r) => { ids.push(String(r.id)); return ids.length < 500; });
    return ids;
  };

  const verifySources = (snapshot) => {
    const ids = snapshot.sources.map((s) => s.id);
    const live = {};
    search.create({
      type: search.Type.INVOICE,
      filters: [['internalid', 'anyof', ids], 'AND', ['mainline', 'is', 'T']],
      columns: ['amountremaining', 'status']
    }).run().each((r) => { live[String(r.id)] = toCents(r.getValue('amountremaining')); return true; });
    const drift = snapshot.sources.filter((s) => live[s.id] !== toCents(s.amountDue));
    if (drift.length) throw new Error(`Open balance changed since approval for invoice(s): ${drift.map((d) => d.tranId || d.id).join(', ')}`);
  };

  const createCreditMemo = (ag, policy, snapshot) => {
    const cm = record.create({ type: record.Type.CREDIT_MEMO, isDynamic: true });
    cm.setValue({ fieldId: 'entity', value: ag.getValue({ fieldId: AG.CUSTOMER }) });
    if (ag.getValue({ fieldId: AG.SUBSIDIARY })) cm.setValue({ fieldId: 'subsidiary', value: ag.getValue({ fieldId: AG.SUBSIDIARY }) });
    cm.setValue({ fieldId: 'currency', value: ag.getValue({ fieldId: AG.CURRENCY }) });
    cm.setValue({ fieldId: 'trandate', value: new Date() });
    cm.setValue({ fieldId: 'memo', value: `Renegotiation agreement ${ag.id} · ${snapshot.fingerprint}` });
    cm.selectNewLine({ sublistId: 'item' });
    cm.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: policy.rrItem });
    cm.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
    cm.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: snapshot.totals.openAmount });
    cm.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: snapshot.totals.openAmount });
    cm.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: 'Overdue invoices transferred to renegotiation agreement' });
    cm.commitLine({ sublistId: 'item' });
    const wanted = new Map(snapshot.sources.map((s) => [s.id, s.amountDue]));
    const lines = cm.getLineCount({ sublistId: 'apply' });
    let applied = 0;
    for (let i = 0; i < lines; i += 1) {
      const docId = String(cm.getSublistValue({ sublistId: 'apply', fieldId: 'internalid', line: i }));
      if (!wanted.has(docId)) continue;
      cm.selectLine({ sublistId: 'apply', line: i });
      cm.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
      cm.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'amount', value: wanted.get(docId) });
      cm.commitLine({ sublistId: 'apply' });
      applied += 1;
    }
    if (applied !== wanted.size) throw new Error(`Credit memo could apply ${applied} of ${wanted.size} invoices`);
    return cm.save({ enableSourcing: true, ignoreMandatoryFields: false });
  };

  const createJournal = (ag, policy, snapshot) => {
    const plan = data.engine.postingPlan(snapshot);
    const j = plan.journal;
    if (!j.debitRenegotiated && !j.debitDiscountExpense) return null;
    const je = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: true });
    if (ag.getValue({ fieldId: AG.SUBSIDIARY })) je.setValue({ fieldId: 'subsidiary', value: ag.getValue({ fieldId: AG.SUBSIDIARY }) });
    je.setValue({ fieldId: 'currency', value: ag.getValue({ fieldId: AG.CURRENCY }) });
    je.setValue({ fieldId: 'trandate', value: new Date() });
    je.setValue({ fieldId: 'memo', value: `Renegotiation charges and discount · agreement ${ag.id}` });
    const customer = ag.getValue({ fieldId: AG.CUSTOMER });
    const line = (account, debit, credit, memo) => {
      if (!debit && !credit) return;
      je.selectNewLine({ sublistId: 'line' });
      je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: account });
      if (debit) je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'debit', value: debit });
      if (credit) je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'credit', value: credit });
      je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'entity', value: customer });
      je.setCurrentSublistValue({ sublistId: 'line', fieldId: 'memo', value: memo });
      je.commitLine({ sublistId: 'line' });
    };
    line(policy.accRenegotiated, j.debitRenegotiated, 0, 'Penalty and late interest added to renegotiated balance');
    line(policy.accPenalty, 0, j.creditPenaltyIncome, 'Late payment penalty');
    line(policy.accLateInterest, 0, j.creditLateInterestIncome, 'Late payment interest');
    line(policy.accDiscount, j.debitDiscountExpense, 0, 'Discount granted in renegotiation');
    line(policy.accRenegotiated, 0, j.creditRenegotiatedForDiscount, 'Discount granted in renegotiation');
    return je.save({ enableSourcing: true, ignoreMandatoryFields: false });
  };

  const createDownPaymentInvoice = (ag, policy, snapshot) => {
    const amount = snapshot.totals.downPayment;
    if (!amount) return null;
    const inv = record.create({ type: record.Type.INVOICE, isDynamic: true });
    inv.setValue({ fieldId: 'entity', value: ag.getValue({ fieldId: AG.CUSTOMER }) });
    if (ag.getValue({ fieldId: AG.SUBSIDIARY })) inv.setValue({ fieldId: 'subsidiary', value: ag.getValue({ fieldId: AG.SUBSIDIARY }) });
    inv.setValue({ fieldId: 'currency', value: ag.getValue({ fieldId: AG.CURRENCY }) });
    inv.setValue({ fieldId: 'trandate', value: new Date() });
    inv.setValue({ fieldId: 'duedate', value: new Date() });
    inv.setValue({ fieldId: 'memo', value: `Down payment · renegotiation agreement ${ag.id}` });
    inv.selectNewLine({ sublistId: 'item' });
    inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: policy.rrItem });
    inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
    inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: amount });
    inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: amount });
    inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: 'Down payment' });
    inv.commitLine({ sublistId: 'item' });
    return inv.save({ enableSourcing: true, ignoreMandatoryFields: false });
  };

  const map = (ctx) => {
    const id = JSON.parse(ctx.value);
    const ag = record.load({ type: REC.AGREEMENT, id });
    const status = ag.getValue({ fieldId: AG.STATUS });
    if (status !== STATUS.APPROVED) {
      log.audit({ title: 'Skipped', details: `Agreement ${id} is ${status}` });
      return;
    }
    const snapshot = data.readSnapshot(ag);
    try {
      if (!snapshot || !data.engine.verify(snapshot) || snapshot.fingerprint !== ag.getValue({ fieldId: AG.FINGERPRINT })) throw new Error('Snapshot integrity check failed');
      const policy = data.loadPolicy(ag.getValue({ fieldId: AG.POLICY }));
      const updates = {};
      if (!ag.getValue({ fieldId: AG.CREDIT_MEMO })) {
        verifySources(snapshot);
        updates[AG.CREDIT_MEMO] = createCreditMemo(ag, policy, snapshot);
        record.submitFields({ type: REC.AGREEMENT, id, values: { [AG.CREDIT_MEMO]: updates[AG.CREDIT_MEMO] } });
      }
      if (!ag.getValue({ fieldId: AG.JOURNAL })) {
        const je = createJournal(ag, policy, snapshot);
        if (je) record.submitFields({ type: REC.AGREEMENT, id, values: { [AG.JOURNAL]: je } });
      }
      if (!ag.getValue({ fieldId: AG.DOWN_INVOICE })) {
        const dp = createDownPaymentInvoice(ag, policy, snapshot);
        if (dp) record.submitFields({ type: REC.AGREEMENT, id, values: { [AG.DOWN_INVOICE]: dp } });
      }
      record.submitFields({ type: REC.AGREEMENT, id, values: { [AG.STATUS]: STATUS.ACTIVE } });
      data.appendLog(id, 'Executed: original invoices closed, charges posted, agreement active');
      ctx.write({ key: 'ok', value: id });
    } catch (e) {
      log.error({ title: `Agreement ${id} execution failed`, details: e });
      record.submitFields({ type: REC.AGREEMENT, id, values: { [AG.STATUS]: STATUS.FAILED } });
      data.appendLog(id, `Execution failed: ${e.message || e}`);
      ctx.write({ key: 'failed', value: id });
    }
  };

  const summarize = (summary) => {
    const counts = { ok: 0, failed: 0 };
    summary.output.iterator().each((key) => { counts[key] = (counts[key] || 0) + 1; return true; });
    summary.mapSummary.errors.iterator().each((key, err) => { log.error({ title: `Map error ${key}`, details: err }); return true; });
    log.audit({ title: 'Renegotiation execution', details: JSON.stringify(counts) });
  };

  return { getInputData, map, summarize };
});
