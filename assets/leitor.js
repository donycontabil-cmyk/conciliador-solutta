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
    module.exports = fabrica(require('./util.js'), require('./ler-planilha.js'), require('./ler-razao.js'), require('./ler-financeiro.js'), require('./familias.js'), require('./ler-balancete.js'));
  } else {
    raiz.Leitor = fabrica(raiz.Util, raiz.LerPlanilha, raiz.LerRazao, raiz.LerFinanceiro, raiz.Familias, raiz.LerBalancete);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, LerPlanilha, LerRazao, LerFinanceiro, Familias, LerBalancete) {
  'use strict';

  const NOMES_DOS_TIPOS = {
    razao: 'Razão contábil',
    financeiro_pagar: 'Contas a pagar em aberto',
    financeiro_receber: 'Contas a receber em aberto',
    financeiro_adiantamento: 'Adiantamentos a fornecedores em aberto',
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
      r.contas = razao.contas.map((c) => Object.assign({ papel: Familias.papelDaConta(c, { nomeArquivo }) }, c));
      return fechar(r);
    }
    // Balancete (relatório de apresentação): lido conta por conta quando o cabeçalho é reconhecido.
    const recBal = LerBalancete && LerBalancete.reconhecer(planilha.abas);
    if (recBal) {
      const b = LerBalancete.ler(planilha.abas, { nomeArquivo });
      r.tipo = 'balancete';
      r.motivo = recBal.motivo;
      r.balancete = b;
      r.avisos = r.avisos.concat(b.avisos);
      r.competencia = b.competencia;
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
      // Relatório de ADIANTAMENTOS (Passo ②) tem as mesmas colunas do contas a pagar: o nome do
      // arquivo diz ("aging adiantamento 07.2026"). Na tela de subir dá para trocar o tipo.
      if (r.tipo === 'financeiro_pagar' && /adiant/i.test(Util.semAcento(String(nomeArquivo || '')))) {
        r.tipo = 'financeiro_adiantamento';
        fin.tipo = 'financeiro_adiantamento';
      }
      r.motivo = recFin.motivo;
      r.financeiro = fin;
      r.avisos = r.avisos.concat(fin.avisos);
      if (fin.posicao) r.competencia = Util.competenciaDe(Util.lerData(fin.posicao));
      // Sem data de posição no arquivo: tenta a competência pelo NOME (ex.: "06.2026 -aging" -> junho/2026;
      // "AGING 072026" -> julho/2026).
      if (!r.competencia) {
        const nome = String(nomeArquivo || '');
        const m = nome.match(/(?:^|[^\d])(0[1-9]|1[0-2])[.\-_ /](20\d{2})(?!\d)/) || nome.match(/(?:^|[^\d])(0[1-9]|1[0-2])(20\d{2})(?!\d)/);
        if (m) { r.competencia = m[2] + '-' + m[1] + '-01'; r.competenciaPeloNome = true; }
      }
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
