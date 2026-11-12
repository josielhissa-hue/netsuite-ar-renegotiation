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
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/runtime', 'N/format', 'N/log', './jh_lib_rng_data'], (runtime, format, log, data) => {
  const PARAM_POLICY = 'custscript_jh_rng_rl_policy';
  const parseDate = (v) => (v instanceof Date ? v : format.parse({ value: v, type: format.Type.DATE }));

  const post = (body) => {
    try {
      const req = typeof body === 'string' ? JSON.parse(body) : body;
      if (!req || !req.customerId) return { ok: false, error: 'customerId is required' };
      const policy = data.loadPolicy(runtime.getCurrentScript().getParameter({ name: PARAM_POLICY }));
      const ids = Array.isArray(req.invoiceIds) ? req.invoiceIds.map(String) : [];
      const invoices = data.normalizeInvoiceDates(data.openInvoices(req.customerId, ids), parseDate);
      if (ids.length && invoices.length !== ids.length) return { ok: false, error: 'One or more invoices are not open for this customer' };
      if (invoices.length) data.assertSingleContext(invoices);
      const simulation = data.engine.simulate({
        asOf: req.asOf || data.todayIso(),
        policy,
        invoices,
        request: req.terms || {}
      });
      return { ok: true, simulation };
    } catch (e) {
      log.error({ title: 'Renegotiation API', details: e });
      return { ok: false, error: e.message || String(e) };
    }
  };

  const get = () => ({ ok: true, engineVersion: data.engine.ENGINE_VERSION, methods: data.engine.METHODS });

  return { get, post };
});
