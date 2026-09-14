/*
 * Conciliador Solutta — leitor.js
 * Recebe os BYTES de um arquivo e diz o que ele é, pelo CONTEÚDO (Parte 5.1).
 * Ordem de reconhecimento (5.1.6): saldo de abertura -> razão -> extrato -> relatório
 * financeiro. Um extrato com colunas "Razão Social" e "Saldo" passaria por relatório de
 * títulos se fosse testado depois.
 * O que não for o esperado é recusado dizendo o que é.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./util.js'), require('./ler-planilha.js'), require('./ler-razao.js'), require('./ler-financeiro.js'), require('./familias.js'));
  } else {
    raiz.Leitor = fabrica(raiz.Util, raiz.LerPlanilha, raiz.LerRazao, raiz.LerFinanceiro, raiz.Familias);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, LerPlanilha, LerRazao, LerFinanceiro, Familias) {
  'use strict';

  const NOMES_DOS_TIPOS = {
    razao: 'Razão contábil',
    financeiro_pagar: 'Contas a pagar em aberto',
    financeiro_receber: 'Contas a receber em aberto',
    balancete: 'Balancete',
    extrato: 'Extrato bancário',
    desconhecido: 'Arquivo não reconhecido',
  };

  function previa(abas, n) {
    const aba = abas[0];
    if (!aba) return [];
    return aba.linhas.slice(0, n || 12).map((l) => (l || []).slice(0, 12).map((c) => (c === null ? '' : String(c))));
  }

  /**
   * @param bytes Uint8Array
   * @param nomeArquivo nome original (só para mostrar e para o período do desenho B)
   * @returns { nomeArquivo, hash, tipo, nomeDoTipo, motivo, avisos, razao?, financeiro?, previa, competencia?, contas? }
   */
  function ler(bytes, nomeArquivo) {
    const r = { nomeArquivo, hash: Util.hashBytes(bytes), tipo: 'desconhecido', motivo: '', avisos: [], previa: [] };
    let planilha;
    try {
      planilha = LerPlanilha.abrir(bytes);
    } catch (e) {
      r.motivo = e.message;
      return fechar(r);
    }
    r.avisos = planilha.avisos.slice();
    r.previa = previa(planilha.abas);

    // (saldo de abertura por fornecedor: formato a definir com o Dony — Parte 5.3)

    const recRazao = LerRazao.reconhecer(planilha.abas);
    if (recRazao.tipo === 'razao') {
      const razao = LerRazao.ler(planilha.abas, { nomeArquivo });
      r.tipo = 'razao';
      r.motivo = recRazao.motivo;
      r.razao = razao;
      r.avisos = r.avisos.concat(razao.avisos);
      if (razao.periodo) {
        const ate = Util.lerData(razao.periodo.ate);
        const de = Util.lerData(razao.periodo.de);
        r.competencia = ate ? Util.competenciaDe(ate) : null;
        r.variosMeses = de && ate && (de.ano !== ate.ano || de.mes !== ate.mes);
      }
      r.contas = razao.contas.map((c) => Object.assign({ papel: Familias.papelDaConta(c) }, c));
      return fechar(r);
    }
    if (recRazao.tipo === 'balancete') {
      r.tipo = 'balancete';
      r.motivo = recRazao.motivo;
      return fechar(r);
    }
    if (LerFinanceiro.pareceExtrato(planilha.abas)) {
      r.tipo = 'extrato';
      r.motivo = 'Parece um EXTRATO BANCÁRIO. A leitura de extratos chega na Etapa 3 (auditoria financeira).';
      return fechar(r);
    }
    const recFin = LerFinanceiro.reconhecer(planilha.abas);
    if (recFin.tipo) {
      const fin = LerFinanceiro.lerTitulos(planilha.abas);
      r.tipo = fin.tipo;
      r.motivo = recFin.motivo;
      r.financeiro = fin;
      r.avisos = r.avisos.concat(fin.avisos);
      if (fin.posicao) r.competencia = Util.competenciaDe(Util.lerData(fin.posicao));
      return fechar(r);
    }
    r.motivo = 'Não reconheci este arquivo. ' + recRazao.motivo + ' ' + recFin.motivo;
    return fechar(r);
  }

  function fechar(r) {
    r.nomeDoTipo = NOMES_DOS_TIPOS[r.tipo] || r.tipo;
    return r;
  }

  return { ler, NOMES_DOS_TIPOS };
});
