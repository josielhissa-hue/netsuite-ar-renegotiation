# JH Renegociação de Recebíveis para NetSuite

Módulo 1 do **JH Finance Controls Framework**. Renegocia faturas vencidas de clientes dentro do NetSuite, com controles prontos para auditoria.

**O que faz:** simula o acordo (multa, juros de mora, desconto, entrada e parcelas Price, SAC ou Flat), registra os números com uma impressão digital de integridade, exige aprovação por alçada com segregação de funções, fecha as faturas originais com uma nota de crédito, lança encargos e desconto num único lançamento contábil, fatura cada parcela e detecta quebra do acordo.

**Por que é diferente:** o NetSuite não tem esse objeto nativo. Hoje as empresas fazem isso em planilha e com lançamentos manuais. Aqui cada número rastreia até a fatura de origem, e a conta de Recebíveis Renegociados zera ao fim do acordo.

Documentação completa em inglês: [README](../README.md), [metodologia](methodology.md), [modelo contábil](accounting-model.md), [matriz de controles](controls-matrix.md), [instalação](installation.md).
