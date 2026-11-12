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
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/task', 'N/email', 'N/log', './jh_lib_rng_data'],
  (record, search, runtime, task, email, log, data) => {
    const MR_SCRIPT = 'customscript_jh_rng_execute_mr';
    const MR_DEPLOY = 'customdeploy_jh_rng_execute_mr';
    const MIN_USAGE = 400;
    const { REC, AG, INS, STATUS, INS_STATUS } = data;

    const lowGovernance = () => runtime.getCurrentScript().getRemainingUsage() < MIN_USAGE;

    const reschedule = () => {
      const s = runtime.getCurrentScript();
      try {
        task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT, scriptId: s.id, deploymentId: s.deploymentId }).submit();
      } catch (e) {
        log.audit({ title: 'Reschedule skipped', details: e.message });
      }
    };

    const agreementsIn = (statuses) => {
      const out = [];
      statuses.forEach((st) => {
        search.create({
          type: REC.AGREEMENT,
          filters: [[AG.STATUS, 'is', st]],
          columns: [AG.CUSTOMER, AG.SUBSIDIARY, AG.CURRENCY, AG.POLICY, AG.STATUS, AG.DOWN_INVOICE, AG.CREDIT_MEMO]
        }).run().each((r) => {
          out.push({
            id: r.id,
            customer: r.getValue(AG.CUSTOMER),
            subsidiary: r.getValue(AG.SUBSIDIARY),
            currency: r.getValue(AG.CURRENCY),
            policy: r.getValue(AG.POLICY),
            status: r.getValue(AG.STATUS),
            downInvoice: r.getValue(AG.DOWN_INVOICE),
            creditMemo: r.getValue(AG.CREDIT_MEMO)
          });
          return out.length < 1000;
        });
      });
      return out;
    };

    const invoiceState = (invoiceId) => {
      if (!invoiceId) return null;
      const f = search.lookupFields({ type: search.Type.INVOICE, id: invoiceId, columns: ['amountremaining', 'duedate', 'status'] });
      return { remaining: data.num(f.amountremaining), dueDate: f.duedate, status: (f.status && f.status[0] && f.status[0].value) || '' };
    };

    const billInstallment = (ag, policy, ins) => {
      const inv = record.create({ type: record.Type.INVOICE, isDynamic: true });
      inv.setValue({ fieldId: 'entity', value: ag.customer });
      if (ag.subsidiary) inv.setValue({ fieldId: 'subsidiary', value: ag.subsidiary });
      inv.setValue({ fieldId: 'currency', value: ag.currency });
      inv.setValue({ fieldId: 'trandate', value: new Date() });
      inv.setValue({ fieldId: 'duedate', value: ins.dueDate instanceof Date ? ins.dueDate : data.fromIso(data.toIso(ins.dueDate)) });
      inv.setValue({ fieldId: 'memo', value: `Installment ${ins.number} · renegotiation agreement ${ag.id}` });
      const addLine = (item, amount, description) => {
        if (!amount) return;
        inv.selectNewLine({ sublistId: 'item' });
        inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item });
        inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
        inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: amount });
        inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'amount', value: amount });
        inv.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: description });
        inv.commitLine({ sublistId: 'item' });
      };
      addLine(policy.rrItem, ins.principal, `Installment ${ins.number} · renegotiated balance`);
      addLine(policy.interestItem, ins.interest, `Installment ${ins.number} · financing interest`);
      const invoiceId = inv.save({ enableSourcing: true, ignoreMandatoryFields: false });
      record.submitFields({ type: REC.INSTALLMENT, id: ins.id, values: { [INS.INVOICE]: invoiceId, [INS.STATUS]: INS_STATUS.BILLED } });
      return invoiceId;
    };

    const notifyBreach = (ag, policy, ins, daysLate) => {
      if (!policy.notifyEmployee) return;
      try {
        email.send({
          author: policy.notifyEmployee,
          recipients: [policy.notifyEmployee],
          subject: `Renegotiation agreement ${ag.id} broken`,
          body: `Installment ${ins.number} is ${daysLate} days past due, beyond the ${policy.graceDays}-day grace period. The agreement was marked BROKEN for collection follow-up.`,
          relatedRecords: { entityId: ag.customer }
        });
      } catch (e) {
        log.error({ title: 'Breach notification failed', details: e });
      }
    };

    const processAgreement = (ag) => {
      const policy = data.loadPolicy(ag.policy);
      const today = data.todayIso();
      const list = data.installmentsOf(ag.id);
      let broken = false;
      let allPaid = true;
      let billed = 0;

      list.forEach((ins) => {
        if (lowGovernance()) return;
        const dueIso = data.toIso(ins.dueDate);
        if (ins.status === INS_STATUS.SCHEDULED) {
          allPaid = false;
          if (data.engine.daysBetween(today, dueIso) <= policy.leadDays) {
            billInstallment(ag, policy, ins);
            billed += 1;
          }
          return;
        }
        const st = invoiceState(ins.invoice);
        if (!st) { allPaid = false; return; }
        if (st.remaining <= 0) {
          if (ins.status !== INS_STATUS.PAID) record.submitFields({ type: REC.INSTALLMENT, id: ins.id, values: { [INS.STATUS]: INS_STATUS.PAID } });
          return;
        }
        allPaid = false;
        const daysLate = data.engine.daysBetween(dueIso, today);
        if (daysLate > 0 && ins.status !== INS_STATUS.OVERDUE) record.submitFields({ type: REC.INSTALLMENT, id: ins.id, values: { [INS.STATUS]: INS_STATUS.OVERDUE } });
        if (daysLate > policy.graceDays && !broken) {
          broken = true;
          if (ag.status === STATUS.ACTIVE) {
            record.submitFields({ type: REC.AGREEMENT, id: ag.id, values: { [AG.STATUS]: STATUS.BROKEN } });
            data.appendLog(ag.id, `Broken: installment ${ins.number} ${daysLate} days late`);
            notifyBreach(ag, policy, ins, daysLate);
          }
        }
      });

      const down = invoiceState(ag.downInvoice);
      if (down && down.remaining > 0) allPaid = false;

      if (ag.status === STATUS.BROKEN && !broken && !allPaid) {
        record.submitFields({ type: REC.AGREEMENT, id: ag.id, values: { [AG.STATUS]: STATUS.ACTIVE } });
        data.appendLog(ag.id, 'Cured: no installment beyond grace period');
      }
      if (allPaid && list.length && list.every((i) => i.status !== INS_STATUS.SCHEDULED)) {
        record.submitFields({ type: REC.AGREEMENT, id: ag.id, values: { [AG.STATUS]: STATUS.SETTLED } });
        data.appendLog(ag.id, 'Settled: all installments paid');
      }
      if (billed) data.appendLog(ag.id, `Billed ${billed} installment(s)`);
    };

    const retryApproved = () => {
      const pending = agreementsIn([STATUS.APPROVED]).filter((a) => !a.creditMemo);
      if (!pending.length) return;
      try {
        task.create({ taskType: task.TaskType.MAP_REDUCE, scriptId: MR_SCRIPT, deploymentId: MR_DEPLOY }).submit();
      } catch (e) {
        log.audit({ title: 'Execution retry not queued', details: e.message });
      }
    };

    const execute = () => {
      retryApproved();
      const agreements = agreementsIn([STATUS.ACTIVE, STATUS.BROKEN]);
      for (let k = 0; k < agreements.length; k += 1) {
        if (lowGovernance()) { reschedule(); return; }
        try {
          processAgreement(agreements[k]);
        } catch (e) {
          log.error({ title: `Monitor agreement ${agreements[k].id}`, details: e });
        }
      }
    };

    return { execute };
  });
