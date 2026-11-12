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
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/url', 'N/ui/dialog'], (url, dialog) => {
  const SL_SCRIPT = 'customscript_jh_rng_wizard_sl';
  const SL_DEPLOY = 'customdeploy_jh_rng_wizard_sl';

  const go = (agreementId, decision, reason) => {
    const params = { agreement: agreementId, decision };
    if (reason) params.reason = reason;
    window.location.href = url.resolveScript({ scriptId: SL_SCRIPT, deploymentId: SL_DEPLOY, params });
  };

  const decide = (agreementId, decision) => {
    if (decision === 'approve') {
      dialog.confirm({ title: 'Approve agreement', message: 'Approve this renegotiation? The credit memo, journal and down payment invoice will be created automatically.' })
        .then((ok) => { if (ok) go(agreementId, 'approve'); });
      return;
    }
    const reason = window.prompt('Reason for rejection');
    if (reason && reason.trim()) go(agreementId, 'reject', reason.trim());
  };

  window.jhRngDecide = decide;

  const pageInit = () => {
    window.jhRngDecide = decide;
  };

  return { pageInit, jhRngDecide: decide };
});
