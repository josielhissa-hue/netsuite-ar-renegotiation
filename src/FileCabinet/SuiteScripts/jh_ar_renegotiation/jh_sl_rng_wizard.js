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
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/runtime', 'N/redirect', 'N/record', 'N/format', 'N/log', './jh_lib_rng_data'],
  (ui, message, runtime, redirect, record, format, log, data) => {
    const PARAM_POLICY = 'custscript_jh_rng_sl_policy';
    const F = {
      ACTION: 'custpage_action',
      CUSTOMER: 'custpage_customer',
      AS_OF: 'custpage_as_of',
      DISCOUNT: 'custpage_discount_pct',
      DOWN: 'custpage_down_payment',
      INSTALLMENTS: 'custpage_installments',
      FIRST_DUE: 'custpage_first_due',
      METHOD: 'custpage_method',
      RATE: 'custpage_rate',
      SELECTED: 'custpage_selected',
      SUMMARY: 'custpage_summary',
      INV_LIST: 'custpage_invoices',
      SCH_LIST: 'custpage_schedule'
    };

    const parseDateField = (v) => (v instanceof Date ? v : format.parse({ value: v, type: format.Type.DATE }));
    const fmtMoney = (v) => format.format({ value: v, type: format.Type.CURRENCY });
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const policyId = () => runtime.getCurrentScript().getParameter({ name: PARAM_POLICY });

    const readParams = (req) => ({
      customerId: req.parameters[F.CUSTOMER],
      asOf: req.parameters[F.AS_OF] ? data.toIso(parseDateField(req.parameters[F.AS_OF])) : data.todayIso(),
      discountPct: data.num(req.parameters[F.DISCOUNT]),
      downPayment: data.num(req.parameters[F.DOWN]),
      installments: parseInt(req.parameters[F.INSTALLMENTS], 10) || 1,
      firstDueDate: req.parameters[F.FIRST_DUE] ? data.toIso(parseDateField(req.parameters[F.FIRST_DUE])) : '',
      method: req.parameters[F.METHOD] || '',
      ratePct: req.parameters[F.RATE] === undefined || req.parameters[F.RATE] === '' ? undefined : data.num(req.parameters[F.RATE])
    });

    const selectedIds = (req) => {
      const fromHidden = String(req.parameters[F.SELECTED] || '').split(',').filter(Boolean);
      const count = req.getLineCount({ group: F.INV_LIST });
      if (count < 1) return fromHidden;
      const ids = [];
      for (let i = 0; i < count; i += 1) {
        if (req.getSublistValue({ group: F.INV_LIST, name: 'custpage_sel', line: i }) === 'T') {
          ids.push(req.getSublistValue({ group: F.INV_LIST, name: 'custpage_id', line: i }));
        }
      }
      return ids;
    };

    const runSimulation = (policy, p, ids) => {
      const invoices = data.normalizeInvoiceDates(data.openInvoices(p.customerId, ids), parseDateField);
      if (ids.length && invoices.length !== ids.length) throw new Error('One or more selected invoices are no longer open');
      const simulation = data.engine.simulate({
        asOf: p.asOf,
        policy,
        invoices,
        request: { discountPct: p.discountPct, downPayment: p.downPayment, installments: p.installments, firstDueDate: p.firstDueDate, method: p.method, ratePct: p.ratePct }
      });
      return { invoices, simulation };
    };

    const baseForm = (title) => {
      const form = ui.createForm({ title });
      form.addField({ id: F.ACTION, type: ui.FieldType.TEXT, label: 'Action' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
      return form;
    };

    const addParamFields = (form, p, policy) => {
      form.addFieldGroup({ id: 'grp_terms', label: 'Renegotiation terms' });
      const cust = form.addField({ id: F.CUSTOMER, type: ui.FieldType.SELECT, label: 'Customer', source: 'customer', container: 'grp_terms' });
      cust.isMandatory = true;
      if (p.customerId) cust.defaultValue = p.customerId;
      const asOf = form.addField({ id: F.AS_OF, type: ui.FieldType.DATE, label: 'As-of date', container: 'grp_terms' });
      asOf.defaultValue = data.fromIso(p.asOf);
      form.addField({ id: F.DISCOUNT, type: ui.FieldType.PERCENT, label: 'Discount on charges (%)', container: 'grp_terms' }).defaultValue = p.discountPct || 0;
      form.addField({ id: F.DOWN, type: ui.FieldType.CURRENCY, label: 'Down payment', container: 'grp_terms' }).defaultValue = p.downPayment || 0;
      const inst = form.addField({ id: F.INSTALLMENTS, type: ui.FieldType.INTEGER, label: `Installments (max ${policy.maxInstallments})`, container: 'grp_terms' });
      inst.defaultValue = p.installments || 1;
      const first = form.addField({ id: F.FIRST_DUE, type: ui.FieldType.DATE, label: 'First installment due', container: 'grp_terms' });
      if (p.firstDueDate) first.defaultValue = data.fromIso(p.firstDueDate);
      const method = form.addField({ id: F.METHOD, type: ui.FieldType.SELECT, label: 'Amortization method', container: 'grp_terms' });
      data.engine.METHODS.forEach((m) => method.addSelectOption({ value: m, text: m, isSelected: (p.method || policy.defaultMethod) === m }));
      form.addField({ id: F.RATE, type: ui.FieldType.PERCENT, label: `Monthly financing rate (max ${policy.financingRatePct}%)`, container: 'grp_terms' })
        .defaultValue = p.ratePct === undefined ? policy.financingRatePct : p.ratePct;
    };

    const addInvoiceList = (form, invoices, selected) => {
      const list = form.addSublist({ id: F.INV_LIST, type: ui.SublistType.LIST, label: 'Open invoices' });
      list.addMarkAllButtons();
      list.addField({ id: 'custpage_sel', type: ui.FieldType.CHECKBOX, label: 'Renegotiate' });
      list.addField({ id: 'custpage_id', type: ui.FieldType.TEXT, label: 'Internal ID' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN });
      list.addField({ id: 'custpage_tranid', type: ui.FieldType.TEXT, label: 'Invoice' });
      list.addField({ id: 'custpage_due', type: ui.FieldType.TEXT, label: 'Due date' });
      list.addField({ id: 'custpage_amt', type: ui.FieldType.CURRENCY, label: 'Amount remaining' });
      invoices.forEach((inv, i) => {
        list.setSublistValue({ id: 'custpage_sel', line: i, value: selected.includes(inv.id) ? 'T' : 'F' });
        list.setSublistValue({ id: 'custpage_id', line: i, value: inv.id });
        list.setSublistValue({ id: 'custpage_tranid', line: i, value: inv.tranId || inv.id });
        list.setSublistValue({ id: 'custpage_due', line: i, value: inv.dueDate || '-' });
        list.setSublistValue({ id: 'custpage_amt', line: i, value: inv.amountDue });
      });
    };

    const addSimulation = (form, sim) => {
      const t = sim.totals;
      const rows = [
        ['Open amount', t.openAmount], ['Penalty', t.penalty], ['Late interest', t.lateInterest], ['Discount', -t.discount],
        ['Renegotiated balance', t.baseAmount], ['Down payment', t.downPayment], ['Financed', t.financed],
        ['Financing interest', t.financingInterest], ['Total due', t.totalDue]
      ];
      const issues = sim.violations.length
        ? `<p style="color:#b42318"><b>Policy violations:</b><br>${sim.violations.map(esc).join('<br>')}</p>`
        : `<p style="color:#2f7d4f"><b>Within policy.</b> Required approval level: ${esc(sim.approvalLevel)}. Fingerprint ${esc(sim.fingerprint)}</p>`;
      const html = `<table style="border-collapse:collapse;font-size:13px">${rows.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0">${esc(k)}</td><td style="text-align:right">${esc(fmtMoney(v))}</td></tr>`).join('')}</table>${issues}`;
      form.addField({ id: F.SUMMARY, type: ui.FieldType.INLINEHTML, label: 'Summary' }).defaultValue = html;
      if (!sim.schedule.length) return;
      const list = form.addSublist({ id: F.SCH_LIST, type: ui.SublistType.STATICLIST, label: 'Installment schedule' });
      [['n', 'No.', ui.FieldType.INTEGER], ['due', 'Due date', ui.FieldType.TEXT], ['prin', 'Principal', ui.FieldType.CURRENCY],
        ['int', 'Interest', ui.FieldType.CURRENCY], ['amt', 'Installment', ui.FieldType.CURRENCY], ['bal', 'Balance after', ui.FieldType.CURRENCY]]
        .forEach(([id, label, type]) => list.addField({ id: `custpage_s_${id}`, type, label }));
      sim.schedule.forEach((r, i) => {
        list.setSublistValue({ id: 'custpage_s_n', line: i, value: String(r.number) });
        list.setSublistValue({ id: 'custpage_s_due', line: i, value: r.dueDate });
        list.setSublistValue({ id: 'custpage_s_prin', line: i, value: r.principal });
        list.setSublistValue({ id: 'custpage_s_int', line: i, value: r.interest });
        list.setSublistValue({ id: 'custpage_s_amt', line: i, value: r.amount });
        list.setSublistValue({ id: 'custpage_s_bal', line: i, value: r.balanceAfter });
      });
    };

    const renderWizard = (ctx, p, selected, notice) => {
      const policy = data.loadPolicy(policyId());
      const form = baseForm('Receivables renegotiation');
      if (notice) form.addPageInitMessage({ type: notice.type, title: notice.title, message: notice.text });
      addParamFields(form, p, policy);
      let sim = null;
      if (p.customerId) {
        const invoices = data.normalizeInvoiceDates(data.openInvoices(p.customerId), parseDateField);
        addInvoiceList(form, invoices, selected);
        if (selected.length && p.firstDueDate) {
          sim = runSimulation(policy, p, selected).simulation;
          addSimulation(form, sim);
        }
      }
      form.addField({ id: F.SELECTED, type: ui.FieldType.LONGTEXT, label: 'Selected' }).updateDisplayType({ displayType: ui.FieldDisplayType.HIDDEN }).defaultValue = selected.join(',');
      form.addSubmitButton({ label: p.customerId ? 'Simulate' : 'Load open invoices' });
      if (sim && sim.valid) form.addButton({ id: 'custpage_btn_create', label: 'Submit for approval', functionName: "(function(){var a=document.getElementById('custpage_action');a.value='create';document.forms[0].submit();})()" });
      ctx.response.writePage(form);
    };

    const handleCreate = (ctx, p, selected) => {
      const policy = data.loadPolicy(policyId());
      const { invoices, simulation } = runSimulation(policy, p, selected);
      const id = data.createAgreement({ customerId: p.customerId, policy, simulation, invoices });
      log.audit({ title: 'Agreement created', details: `id=${id} fingerprint=${simulation.fingerprint}` });
      redirect.toRecord({ type: data.REC.AGREEMENT, id });
    };

    const handleDecision = (ctx) => {
      const id = ctx.request.parameters.agreement;
      const decision = ctx.request.parameters.decision;
      const rec = record.load({ type: data.REC.AGREEMENT, id });
      if (decision === 'approve') rec.setValue({ fieldId: data.AG.STATUS, value: data.STATUS.APPROVED });
      else if (decision === 'reject') {
        rec.setValue({ fieldId: data.AG.STATUS, value: data.STATUS.REJECTED });
        rec.setValue({ fieldId: data.AG.REASON, value: String(ctx.request.parameters.reason || 'Rejected by approver').slice(0, 3900) });
      } else throw new Error('Unknown decision');
      rec.save();
      redirect.toRecord({ type: data.REC.AGREEMENT, id });
    };

    const onRequest = (ctx) => {
      try {
        if (ctx.request.parameters.decision) return handleDecision(ctx);
        const p = readParams(ctx.request);
        if (ctx.request.method === 'GET') return renderWizard(ctx, p, [], null);
        const selected = selectedIds(ctx.request);
        if (ctx.request.parameters[F.ACTION] === 'create') return handleCreate(ctx, p, selected);
        return renderWizard(ctx, p, selected, null);
      } catch (e) {
        log.error({ title: 'Renegotiation wizard', details: e });
        const p = readParams(ctx.request);
        return renderWizard(ctx, p, [], { type: message.Type.ERROR, title: 'Could not complete the request', text: esc(e.message || e) });
      }
    };

    return { onRequest };
  });
