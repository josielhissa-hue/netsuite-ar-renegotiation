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
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', './jh_lib_rng_engine'], (record, search, runtime, engine) => {
  const REC = {
    AGREEMENT: 'customrecord_jh_rng_agreement',
    SOURCE: 'customrecord_jh_rng_source',
    INSTALLMENT: 'customrecord_jh_rng_installment',
    POLICY: 'customrecord_jh_rng_policy'
  };

  const AG = {
    CUSTOMER: 'custrecord_jh_rnga_customer',
    SUBSIDIARY: 'custrecord_jh_rnga_subsidiary',
    CURRENCY: 'custrecord_jh_rnga_currency',
    POLICY: 'custrecord_jh_rnga_policy',
    STATUS: 'custrecord_jh_rnga_status',
    METHOD: 'custrecord_jh_rnga_method',
    AS_OF: 'custrecord_jh_rnga_as_of',
    OPEN: 'custrecord_jh_rnga_open_amount',
    PENALTY: 'custrecord_jh_rnga_penalty',
    LATE: 'custrecord_jh_rnga_late_interest',
    DISCOUNT: 'custrecord_jh_rnga_discount',
    BASE: 'custrecord_jh_rnga_base_amount',
    DOWN: 'custrecord_jh_rnga_down_payment',
    FINANCED: 'custrecord_jh_rnga_financed',
    FIN_INTEREST: 'custrecord_jh_rnga_fin_interest',
    TOTAL: 'custrecord_jh_rnga_total_due',
    INSTALLMENTS: 'custrecord_jh_rnga_installments',
    RATE: 'custrecord_jh_rnga_rate',
    LEVEL: 'custrecord_jh_rnga_approval_level',
    REQUESTED_BY: 'custrecord_jh_rnga_requested_by',
    APPROVED_BY: 'custrecord_jh_rnga_approved_by',
    APPROVED_ON: 'custrecord_jh_rnga_approved_on',
    REASON: 'custrecord_jh_rnga_reason',
    SNAPSHOT: 'custrecord_jh_rnga_snapshot',
    FINGERPRINT: 'custrecord_jh_rnga_fingerprint',
    CREDIT_MEMO: 'custrecord_jh_rnga_credit_memo',
    JOURNAL: 'custrecord_jh_rnga_journal',
    DOWN_INVOICE: 'custrecord_jh_rnga_down_invoice',
    LOG: 'custrecord_jh_rnga_exec_log'
  };

  const SRC = {
    AGREEMENT: 'custrecord_jh_rngs_agreement',
    INVOICE: 'custrecord_jh_rngs_invoice',
    TRANID: 'custrecord_jh_rngs_tranid',
    DUE: 'custrecord_jh_rngs_due_date',
    AMOUNT: 'custrecord_jh_rngs_amount_due',
    DAYS: 'custrecord_jh_rngs_days_overdue',
    PENALTY: 'custrecord_jh_rngs_penalty',
    LATE: 'custrecord_jh_rngs_late_interest'
  };

  const INS = {
    AGREEMENT: 'custrecord_jh_rngi_agreement',
    NUMBER: 'custrecord_jh_rngi_number',
    DUE: 'custrecord_jh_rngi_due_date',
    PRINCIPAL: 'custrecord_jh_rngi_principal',
    INTEREST: 'custrecord_jh_rngi_interest',
    AMOUNT: 'custrecord_jh_rngi_amount',
    STATUS: 'custrecord_jh_rngi_status',
    INVOICE: 'custrecord_jh_rngi_invoice'
  };

  const POL = {
    PENALTY_PCT: 'custrecord_jh_rngp_penalty_pct',
    LATE_RATE: 'custrecord_jh_rngp_late_rate',
    LATE_MODE: 'custrecord_jh_rngp_late_mode',
    FIN_RATE: 'custrecord_jh_rngp_fin_rate',
    MAX_INST: 'custrecord_jh_rngp_max_installments',
    MIN_DOWN: 'custrecord_jh_rngp_min_down_pct',
    DISCOUNT_BASE: 'custrecord_jh_rngp_discount_base',
    DEFAULT_METHOD: 'custrecord_jh_rngp_default_method',
    TIERS: 'custrecord_jh_rngp_tiers',
    GRACE: 'custrecord_jh_rngp_grace_days',
    LEAD: 'custrecord_jh_rngp_lead_days',
    RR_ITEM: 'custrecord_jh_rngp_rr_item',
    INTEREST_ITEM: 'custrecord_jh_rngp_interest_item',
    ACC_RR: 'custrecord_jh_rngp_acc_rr',
    ACC_PENALTY: 'custrecord_jh_rngp_acc_penalty',
    ACC_LATE: 'custrecord_jh_rngp_acc_late',
    ACC_DISCOUNT: 'custrecord_jh_rngp_acc_discount',
    NOTIFY: 'custrecord_jh_rngp_notify_employee'
  };

  const STATUS = {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    FAILED: 'FAILED',
    ACTIVE: 'ACTIVE',
    BROKEN: 'BROKEN',
    SETTLED: 'SETTLED',
    CANCELLED: 'CANCELLED'
  };

  const INS_STATUS = { SCHEDULED: 'SCHEDULED', BILLED: 'BILLED', PAID: 'PAID', OVERDUE: 'OVERDUE' };

  const LOCKED_FIELDS = [AG.CUSTOMER, AG.SUBSIDIARY, AG.CURRENCY, AG.POLICY, AG.METHOD, AG.AS_OF, AG.OPEN, AG.PENALTY, AG.LATE,
    AG.DISCOUNT, AG.BASE, AG.DOWN, AG.FINANCED, AG.FIN_INTEREST, AG.TOTAL, AG.INSTALLMENTS, AG.RATE, AG.LEVEL,
    AG.REQUESTED_BY, AG.SNAPSHOT, AG.FINGERPRINT];

  const toIso = (d) => {
    if (!d) return '';
    const v = d instanceof Date ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  };

  const fromIso = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const todayIso = () => toIso(new Date());

  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const parseJson = (txt, fallback) => {
    try {
      return txt ? JSON.parse(txt) : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const loadPolicy = (policyId) => {
    if (!policyId) throw new Error('Renegotiation policy is not configured');
    const r = record.load({ type: REC.POLICY, id: policyId });
    const v = (f) => r.getValue({ fieldId: f });
    return {
      id: String(policyId),
      penaltyPct: num(v(POL.PENALTY_PCT)),
      lateRatePct: num(v(POL.LATE_RATE)),
      lateMode: String(v(POL.LATE_MODE) || 'SIMPLE').toUpperCase(),
      financingRatePct: num(v(POL.FIN_RATE)),
      maxInstallments: parseInt(v(POL.MAX_INST), 10) || 1,
      minDownPct: num(v(POL.MIN_DOWN)),
      discountBase: String(v(POL.DISCOUNT_BASE) || 'CHARGES').toUpperCase(),
      defaultMethod: String(v(POL.DEFAULT_METHOD) || 'PRICE').toUpperCase(),
      tiers: parseJson(v(POL.TIERS), []),
      graceDays: parseInt(v(POL.GRACE), 10) || 0,
      leadDays: parseInt(v(POL.LEAD), 10) || 0,
      rrItem: v(POL.RR_ITEM),
      interestItem: v(POL.INTEREST_ITEM),
      accRenegotiated: v(POL.ACC_RR),
      accPenalty: v(POL.ACC_PENALTY),
      accLateInterest: v(POL.ACC_LATE),
      accDiscount: v(POL.ACC_DISCOUNT),
      notifyEmployee: v(POL.NOTIFY)
    };
  };

  const openInvoices = (customerId, invoiceIds) => {
    const filters = [
      ['type', 'anyof', 'CustInvc'], 'AND',
      ['mainline', 'is', 'T'], 'AND',
      ['entity', 'anyof', customerId], 'AND',
      ['status', 'anyof', 'CustInvc:A'], 'AND',
      ['amountremaining', 'greaterthan', '0']
    ];
    if (invoiceIds && invoiceIds.length) filters.push('AND', ['internalid', 'anyof', invoiceIds]);
    const out = [];
    search.create({
      type: search.Type.INVOICE,
      filters,
      columns: ['tranid', 'trandate', 'duedate', 'amountremaining', 'currency', 'subsidiary']
    }).run().each((r) => {
      out.push({
        id: String(r.id),
        tranId: r.getValue('tranid'),
        tranDate: r.getValue('trandate'),
        dueDate: r.getValue('duedate') || r.getValue('trandate'),
        amountDue: num(r.getValue('amountremaining')),
        currency: r.getValue('currency'),
        subsidiary: r.getValue('subsidiary')
      });
      return out.length < 1000;
    });
    return out;
  };

  const normalizeInvoiceDates = (invoices, parseFn) => invoices.map((i) => ({ ...i, dueDate: toIso(parseFn(i.dueDate)) }));

  const assertSingleContext = (invoices) => {
    const currencies = new Set(invoices.map((i) => String(i.currency)));
    const subsidiaries = new Set(invoices.map((i) => String(i.subsidiary || '')));
    if (currencies.size > 1) throw new Error('All invoices in one agreement must share the same currency');
    if (subsidiaries.size > 1) throw new Error('All invoices in one agreement must share the same subsidiary');
    return { currency: invoices[0].currency, subsidiary: invoices[0].subsidiary };
  };

  const createAgreement = ({ customerId, policy, simulation, invoices }) => {
    if (!simulation.valid) throw new Error(`Simulation is not valid: ${simulation.violations.join('; ')}`);
    const ctx = assertSingleContext(invoices);
    const t = simulation.totals;
    const ag = record.create({ type: REC.AGREEMENT, isDynamic: false });
    const set = (f, v) => { if (v !== undefined && v !== null && v !== '') ag.setValue({ fieldId: f, value: v }); };
    set(AG.CUSTOMER, customerId);
    set(AG.SUBSIDIARY, ctx.subsidiary);
    set(AG.CURRENCY, ctx.currency);
    set(AG.POLICY, policy.id);
    set(AG.STATUS, STATUS.PENDING);
    set(AG.METHOD, simulation.method);
    set(AG.AS_OF, fromIso(simulation.asOf));
    set(AG.OPEN, t.openAmount);
    set(AG.PENALTY, t.penalty);
    set(AG.LATE, t.lateInterest);
    set(AG.DISCOUNT, t.discount);
    set(AG.BASE, t.baseAmount);
    set(AG.DOWN, t.downPayment);
    set(AG.FINANCED, t.financed);
    set(AG.FIN_INTEREST, t.financingInterest);
    set(AG.TOTAL, t.totalDue);
    set(AG.INSTALLMENTS, simulation.installments);
    set(AG.RATE, simulation.ratePct);
    set(AG.LEVEL, simulation.approvalLevel);
    set(AG.REQUESTED_BY, runtime.getCurrentUser().id);
    set(AG.SNAPSHOT, JSON.stringify(simulation));
    set(AG.FINGERPRINT, simulation.fingerprint);
    const agreementId = ag.save({ enableSourcing: true, ignoreMandatoryFields: false });

    simulation.sources.forEach((s) => {
      const r = record.create({ type: REC.SOURCE });
      r.setValue({ fieldId: SRC.AGREEMENT, value: agreementId });
      r.setValue({ fieldId: SRC.INVOICE, value: s.id });
      r.setValue({ fieldId: SRC.TRANID, value: s.tranId });
      r.setValue({ fieldId: SRC.DUE, value: fromIso(s.dueDate) });
      r.setValue({ fieldId: SRC.AMOUNT, value: s.amountDue });
      r.setValue({ fieldId: SRC.DAYS, value: s.daysOverdue });
      r.setValue({ fieldId: SRC.PENALTY, value: s.penalty });
      r.setValue({ fieldId: SRC.LATE, value: s.lateInterest });
      r.save();
    });

    simulation.schedule.forEach((row) => {
      const r = record.create({ type: REC.INSTALLMENT });
      r.setValue({ fieldId: INS.AGREEMENT, value: agreementId });
      r.setValue({ fieldId: INS.NUMBER, value: row.number });
      r.setValue({ fieldId: INS.DUE, value: fromIso(row.dueDate) });
      r.setValue({ fieldId: INS.PRINCIPAL, value: row.principal });
      r.setValue({ fieldId: INS.INTEREST, value: row.interest });
      r.setValue({ fieldId: INS.AMOUNT, value: row.amount });
      r.setValue({ fieldId: INS.STATUS, value: INS_STATUS.SCHEDULED });
      r.save();
    });

    return agreementId;
  };

  const readSnapshot = (rec) => parseJson(rec.getValue({ fieldId: AG.SNAPSHOT }), null);

  const appendLog = (agreementId, message) => {
    const cur = search.lookupFields({ type: REC.AGREEMENT, id: agreementId, columns: [AG.LOG] })[AG.LOG] || '';
    const line = `${new Date().toISOString()} ${message}`;
    const next = `${cur ? `${cur}\n` : ''}${line}`.slice(-3900);
    record.submitFields({ type: REC.AGREEMENT, id: agreementId, values: { [AG.LOG]: next }, options: { ignoreMandatoryFields: true } });
  };

  const installmentsOf = (agreementId) => {
    const out = [];
    search.create({
      type: REC.INSTALLMENT,
      filters: [[INS.AGREEMENT, 'anyof', agreementId]],
      columns: [INS.NUMBER, INS.DUE, INS.PRINCIPAL, INS.INTEREST, INS.AMOUNT, INS.STATUS, INS.INVOICE]
    }).run().each((r) => {
      out.push({
        id: r.id,
        number: parseInt(r.getValue(INS.NUMBER), 10),
        dueDate: r.getValue(INS.DUE),
        principal: num(r.getValue(INS.PRINCIPAL)),
        interest: num(r.getValue(INS.INTEREST)),
        amount: num(r.getValue(INS.AMOUNT)),
        status: r.getValue(INS.STATUS),
        invoice: r.getValue(INS.INVOICE)
      });
      return true;
    });
    return out.sort((a, b) => a.number - b.number);
  };

  return {
    REC, AG, SRC, INS, POL, STATUS, INS_STATUS, LOCKED_FIELDS,
    engine, toIso, fromIso, todayIso, num, parseJson,
    loadPolicy, openInvoices, normalizeInvoiceDates, assertSingleContext, createAgreement,
    readSnapshot, appendLog, installmentsOf
  };
});
