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
define([], () => {
  const ENGINE_VERSION = '1.0.0';
  const METHODS = ['PRICE', 'SAC', 'FLAT'];
  const DAY_MS = 86400000;

  const toCents = (v) => Math.round((Number(v) || 0) * 100);
  const fromCents = (c) => Math.round(c) / 100;

  const parseDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) throw new Error(`Invalid date: ${iso}`);
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  const formatDate = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  };

  const daysBetween = (fromIso, toIso) => Math.round((parseDate(toIso) - parseDate(fromIso)) / DAY_MS);

  const addMonths = (iso, months) => {
    const base = new Date(parseDate(iso));
    const day = base.getUTCDate();
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return formatDate(Date.UTC(y, m, Math.min(day, lastDay)));
  };

  const lateInterestCents = (amountCents, days, monthlyPct, mode) => {
    if (days <= 0 || !monthlyPct) return 0;
    const r = monthlyPct / 100;
    if (mode === 'COMPOUND') return Math.round(amountCents * (Math.pow(1 + r, days / 30) - 1));
    return Math.round(amountCents * r * (days / 30));
  };

  const assessInvoices = (invoices, asOf, policy) => {
    if (!Array.isArray(invoices) || !invoices.length) throw new Error('Select at least one open invoice');
    const seen = new Set();
    return invoices.map((inv) => {
      if (seen.has(String(inv.id))) throw new Error(`Invoice ${inv.id} selected twice`);
      seen.add(String(inv.id));
      const amountCents = toCents(inv.amountDue);
      if (amountCents <= 0) throw new Error(`Invoice ${inv.tranId || inv.id} has no open balance`);
      const days = Math.max(0, daysBetween(inv.dueDate, asOf));
      const penaltyCents = days > 0 ? Math.round(amountCents * (Number(policy.penaltyPct) || 0) / 100) : 0;
      const lateCents = lateInterestCents(amountCents, days, Number(policy.lateRatePct) || 0, policy.lateMode);
      return {
        id: String(inv.id),
        tranId: inv.tranId || '',
        dueDate: inv.dueDate,
        amountDue: fromCents(amountCents),
        daysOverdue: days,
        penalty: fromCents(penaltyCents),
        lateInterest: fromCents(lateCents),
        _c: { amountCents, penaltyCents, lateCents }
      };
    });
  };

  const buildSchedule = (financedCents, n, ratePct, method, firstDueDate) => {
    const i = (Number(ratePct) || 0) / 100;
    const rows = [];
    let balance = financedCents;
    let pmt = 0;
    if (method === 'PRICE' && i > 0) pmt = financedCents * i / (1 - Math.pow(1 + i, -n));
    const flatInterestEach = method === 'FLAT' ? Math.round(financedCents * i) : 0;
    for (let k = 1; k <= n; k += 1) {
      let interest;
      let principal;
      if (method === 'FLAT') {
        interest = flatInterestEach;
        principal = Math.round(financedCents / n);
      } else if (method === 'SAC') {
        interest = Math.round(balance * i);
        principal = Math.round(financedCents / n);
      } else if (i > 0) {
        interest = Math.round(balance * i);
        principal = Math.round(pmt) - interest;
      } else {
        interest = 0;
        principal = Math.round(financedCents / n);
      }
      if (k === n) principal = balance;
      balance -= principal;
      rows.push({
        number: k,
        dueDate: addMonths(firstDueDate, k - 1),
        principal: fromCents(principal),
        interest: fromCents(interest),
        amount: fromCents(principal + interest),
        balanceAfter: fromCents(balance)
      });
    }
    return rows;
  };

  const resolveApprovalLevel = (tiers, discountPct, installments) => {
    const sorted = (tiers || []).slice().sort((a, b) => a.level - b.level);
    const tier = sorted.find((t) => discountPct <= Number(t.maxDiscountPct) + 1e-9 && installments <= Number(t.maxInstallments));
    return tier ? tier.level : null;
  };

  const canonical = (v) => {
    if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).filter((k) => k !== '_c' && v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
    }
    return JSON.stringify(v);
  };

  const fingerprint = (obj) => {
    const s = canonical(obj);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let k = 0; k < s.length; k += 1) {
      const c = s.charCodeAt(k);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  };

  const simulate = (input) => {
    const policy = input.policy || {};
    const req = input.request || {};
    const asOf = input.asOf;
    parseDate(asOf);
    const violations = [];
    const method = String(req.method || policy.defaultMethod || 'PRICE').toUpperCase();
    if (!METHODS.includes(method)) violations.push(`Unknown amortization method ${method}`);
    const n = parseInt(req.installments, 10);
    if (!(n >= 1)) violations.push('Installments must be at least 1');
    if (n > Number(policy.maxInstallments)) violations.push(`Installments above policy limit of ${policy.maxInstallments}`);

    const lines = assessInvoices(input.invoices, asOf, policy);
    const openCents = lines.reduce((s, l) => s + l._c.amountCents, 0);
    const penaltyCents = lines.reduce((s, l) => s + l._c.penaltyCents, 0);
    const lateCents = lines.reduce((s, l) => s + l._c.lateCents, 0);
    const chargesCents = penaltyCents + lateCents;

    const discountBase = policy.discountBase === 'TOTAL' ? openCents + chargesCents : chargesCents;
    const discountPct = Math.max(0, Number(req.discountPct) || 0);
    const discountCents = Math.min(Math.round(discountBase * discountPct / 100), discountBase);
    const baseCents = openCents + chargesCents - discountCents;

    const downCents = toCents(req.downPayment);
    const minDownCents = Math.round(baseCents * (Number(policy.minDownPct) || 0) / 100);
    if (downCents < 0) violations.push('Down payment cannot be negative');
    if (downCents < minDownCents) violations.push(`Down payment below policy minimum of ${fromCents(minDownCents).toFixed(2)}`);
    if (downCents >= baseCents) violations.push('Down payment must be lower than the renegotiated balance');

    const firstDueDate = req.firstDueDate;
    if (!firstDueDate) violations.push('First due date is required');
    else if (daysBetween(asOf, firstDueDate) < 0) violations.push('First due date cannot be before the as-of date');

    const ratePct = req.ratePct !== undefined && req.ratePct !== '' ? Number(req.ratePct) : Number(policy.financingRatePct) || 0;
    if (ratePct < 0) violations.push('Financing rate cannot be negative');
    if (ratePct > (Number(policy.financingRatePct) || 0)) violations.push('Financing rate above policy rate');

    const approvalLevel = resolveApprovalLevel(policy.tiers, discountPct, n || 0);
    if (approvalLevel === null) violations.push('No approval tier covers this discount and number of installments');

    const financedCents = Math.max(0, baseCents - downCents);
    const schedule = violations.length || !(n >= 1) ? [] : buildSchedule(financedCents, n, ratePct, method, firstDueDate);
    const financingInterestCents = schedule.reduce((s, r) => s + toCents(r.interest), 0);

    const result = {
      engineVersion: ENGINE_VERSION,
      asOf,
      method,
      installments: n || 0,
      ratePct,
      discountPct,
      approvalLevel,
      sources: lines.map(({ _c, ...rest }) => rest),
      totals: {
        openAmount: fromCents(openCents),
        penalty: fromCents(penaltyCents),
        lateInterest: fromCents(lateCents),
        discount: fromCents(discountCents),
        baseAmount: fromCents(baseCents),
        downPayment: fromCents(downCents),
        financed: fromCents(financedCents),
        financingInterest: fromCents(financingInterestCents),
        totalDue: fromCents(downCents + financedCents + financingInterestCents)
      },
      schedule,
      valid: violations.length === 0,
      violations
    };
    result.fingerprint = fingerprint({ ...result, fingerprint: undefined });
    return result;
  };

  const verify = (snapshot) => {
    if (!snapshot || !snapshot.fingerprint) return false;
    return fingerprint({ ...snapshot, fingerprint: undefined }) === snapshot.fingerprint;
  };

  const postingPlan = (snapshot) => {
    const t = snapshot.totals;
    return {
      creditMemo: { renegotiatedReceivable: t.openAmount, applyTo: snapshot.sources.map((s) => ({ id: s.id, amount: s.amountDue })) },
      journal: {
        debitRenegotiated: fromCents(toCents(t.penalty) + toCents(t.lateInterest)),
        creditPenaltyIncome: t.penalty,
        creditLateInterestIncome: t.lateInterest,
        debitDiscountExpense: t.discount,
        creditRenegotiatedForDiscount: t.discount
      },
      downPaymentInvoice: t.downPayment,
      installmentInvoices: snapshot.schedule.map((r) => ({ number: r.number, dueDate: r.dueDate, renegotiated: r.principal, financingInterest: r.interest }))
    };
  };

  const TRANSITIONS = {
    DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
    PENDING_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['ACTIVE', 'FAILED'],
    FAILED: ['APPROVED', 'CANCELLED'],
    ACTIVE: ['BROKEN', 'SETTLED'],
    BROKEN: ['ACTIVE', 'SETTLED'],
    REJECTED: [],
    CANCELLED: [],
    SETTLED: []
  };

  const canTransition = (from, to) => from === to || (TRANSITIONS[from] || []).includes(to);

  return {
    ENGINE_VERSION,
    METHODS,
    TRANSITIONS,
    simulate,
    verify,
    fingerprint,
    postingPlan,
    canTransition,
    resolveApprovalLevel,
    buildSchedule,
    addMonths,
    daysBetween
  };
});
