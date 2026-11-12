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
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/runtime', 'N/task', 'N/log', 'N/error', './jh_lib_rng_data'], (runtime, task, log, error, data) => {
  const MR_SCRIPT = 'customscript_jh_rng_execute_mr';
  const MR_DEPLOY = 'customdeploy_jh_rng_execute_mr';
  const MR_PARAM = 'custscript_jh_rng_mr_agreement';
  const CS_PATH = './jh_cs_rng_agreement.js';
  const { AG, STATUS } = data;

  const fail = (code, message) => {
    throw error.create({ name: code, message, notifyOff: true });
  };

  const same = (a, b) => String(a === null || a === undefined ? '' : a) === String(b === null || b === undefined ? '' : b);

  const valueOf = (ctx, fieldId) => {
    const isX = ctx.type === ctx.UserEventType.XEDIT;
    if (isX && !ctx.newRecord.getFields().includes(fieldId)) return ctx.oldRecord ? ctx.oldRecord.getValue({ fieldId }) : null;
    return ctx.newRecord.getValue({ fieldId });
  };

  const roleAllowed = (policy, level, roleId) => {
    const tier = (policy.tiers || []).find((t) => Number(t.level) === Number(level));
    if (!tier) return false;
    return (tier.roles || []).map(String).includes(String(roleId));
  };

  const beforeLoad = (ctx) => {
    if (ctx.type !== ctx.UserEventType.VIEW) return;
    const rec = ctx.newRecord;
    if (rec.getValue({ fieldId: AG.STATUS }) !== STATUS.PENDING) return;
    const user = runtime.getCurrentUser();
    if (same(rec.getValue({ fieldId: AG.REQUESTED_BY }), user.id)) return;
    try {
      const policy = data.loadPolicy(rec.getValue({ fieldId: AG.POLICY }));
      if (!roleAllowed(policy, rec.getValue({ fieldId: AG.LEVEL }), user.role)) return;
      ctx.form.clientScriptModulePath = CS_PATH;
      ctx.form.addButton({ id: 'custpage_jh_rng_approve', label: 'Approve', functionName: `jhRngDecide(${rec.id},'approve')` });
      ctx.form.addButton({ id: 'custpage_jh_rng_reject', label: 'Reject', functionName: `jhRngDecide(${rec.id},'reject')` });
    } catch (e) {
      log.error({ title: 'beforeLoad approval buttons', details: e });
    }
  };

  const beforeSubmit = (ctx) => {
    const T = ctx.UserEventType;
    if (![T.CREATE, T.EDIT, T.XEDIT, T.DELETE].includes(ctx.type)) return;
    const runCtx = runtime.executionContext;
    const user = runtime.getCurrentUser();

    if (ctx.type === T.DELETE) {
      const st = ctx.oldRecord.getValue({ fieldId: AG.STATUS });
      if (![STATUS.DRAFT, STATUS.REJECTED, STATUS.CANCELLED].includes(st)) fail('JH_RNG_DELETE_BLOCKED', `Agreements in status ${st} cannot be deleted. Cancel or settle them instead.`);
      return;
    }

    if (ctx.type === T.CREATE) {
      const st = ctx.newRecord.getValue({ fieldId: AG.STATUS }) || STATUS.DRAFT;
      if (![STATUS.DRAFT, STATUS.PENDING].includes(st)) fail('JH_RNG_BAD_STATUS', 'New agreements start as Draft or Pending Approval');
      const snap = data.readSnapshot(ctx.newRecord);
      if (!snap || !data.engine.verify(snap) || !same(snap.fingerprint, ctx.newRecord.getValue({ fieldId: AG.FINGERPRINT }))) {
        fail('JH_RNG_FINGERPRINT', 'Agreement snapshot is missing or its fingerprint does not match');
      }
      if (!ctx.newRecord.getValue({ fieldId: AG.REQUESTED_BY })) ctx.newRecord.setValue({ fieldId: AG.REQUESTED_BY, value: user.id });
      return;
    }

    const oldStatus = ctx.oldRecord.getValue({ fieldId: AG.STATUS });
    const newStatus = valueOf(ctx, AG.STATUS);
    if (!data.engine.canTransition(oldStatus, newStatus)) fail('JH_RNG_TRANSITION', `Status cannot change from ${oldStatus} to ${newStatus}`);

    const changedLocked = data.LOCKED_FIELDS.filter((f) => {
      if (ctx.type === T.XEDIT && !ctx.newRecord.getFields().includes(f)) return false;
      const a = ctx.oldRecord.getValue({ fieldId: f });
      const b = ctx.newRecord.getValue({ fieldId: f });
      if (a instanceof Date || b instanceof Date) return data.toIso(a) !== data.toIso(b);
      return !same(a, b);
    });
    if (changedLocked.length) fail('JH_RNG_LOCKED', `Agreement terms are locked after creation. Create a new agreement instead. Fields: ${changedLocked.join(', ')}`);

    const snapText = ctx.oldRecord.getValue({ fieldId: AG.SNAPSHOT });
    const snap = data.parseJson(snapText, null);
    if (!snap || !data.engine.verify(snap)) fail('JH_RNG_FINGERPRINT', 'Stored snapshot failed the integrity check');

    if (newStatus === STATUS.APPROVED && oldStatus !== STATUS.APPROVED) {
      if (runCtx === runtime.ContextType.MAP_REDUCE || runCtx === runtime.ContextType.SCHEDULED) {
        if (oldStatus !== STATUS.FAILED) fail('JH_RNG_SOD', 'Background scripts cannot approve agreements');
        return;
      }
      if (same(ctx.oldRecord.getValue({ fieldId: AG.REQUESTED_BY }), user.id)) fail('JH_RNG_SOD', 'Segregation of duties: the requester cannot approve the same agreement');
      const policy = data.loadPolicy(ctx.oldRecord.getValue({ fieldId: AG.POLICY }));
      if (!roleAllowed(policy, ctx.oldRecord.getValue({ fieldId: AG.LEVEL }), user.role)) fail('JH_RNG_LIMIT', `Your role cannot approve level ${ctx.oldRecord.getValue({ fieldId: AG.LEVEL })} agreements`);
      ctx.newRecord.setValue({ fieldId: AG.APPROVED_BY, value: user.id });
      ctx.newRecord.setValue({ fieldId: AG.APPROVED_ON, value: new Date() });
    }

    if (newStatus === STATUS.REJECTED && oldStatus !== STATUS.REJECTED) {
      if (same(ctx.oldRecord.getValue({ fieldId: AG.REQUESTED_BY }), user.id)) fail('JH_RNG_SOD', 'The requester cannot reject their own agreement; cancel it instead');
      ctx.newRecord.setValue({ fieldId: AG.APPROVED_BY, value: user.id });
      ctx.newRecord.setValue({ fieldId: AG.APPROVED_ON, value: new Date() });
    }

    if (ctx.type === T.EDIT || ctx.type === T.XEDIT) {
      const touched = [AG.APPROVED_BY, AG.APPROVED_ON].filter((f) => ctx.type === T.EDIT || ctx.newRecord.getFields().includes(f));
      const approvingNow = [STATUS.APPROVED, STATUS.REJECTED].includes(newStatus) && oldStatus !== newStatus;
      if (!approvingNow && touched.some((f) => {
        const a = ctx.oldRecord.getValue({ fieldId: f });
        const b = ctx.newRecord.getValue({ fieldId: f });
        return a instanceof Date || b instanceof Date ? data.toIso(a) !== data.toIso(b) : !same(a, b);
      })) fail('JH_RNG_LOCKED', 'Approval fields are set only by the approval process');
    }
  };

  const afterSubmit = (ctx) => {
    const T = ctx.UserEventType;
    if (![T.EDIT, T.XEDIT].includes(ctx.type)) return;
    const oldStatus = ctx.oldRecord.getValue({ fieldId: AG.STATUS });
    const newStatus = valueOf(ctx, AG.STATUS);
    if (newStatus !== STATUS.APPROVED || oldStatus === STATUS.APPROVED) return;
    try {
      const t = task.create({ taskType: task.TaskType.MAP_REDUCE, scriptId: MR_SCRIPT, deploymentId: MR_DEPLOY, params: { [MR_PARAM]: String(ctx.newRecord.id) } });
      const taskId = t.submit();
      data.appendLog(ctx.newRecord.id, `Approved by user ${runtime.getCurrentUser().id}; execution task ${taskId}`);
    } catch (e) {
      log.error({ title: 'Execution task not queued', details: e });
      data.appendLog(ctx.newRecord.id, `Approved; execution not queued (${e.name || e.message}). Monitor will retry.`);
    }
  };

  return { beforeLoad, beforeSubmit, afterSubmit };
});
