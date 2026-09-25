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
    module.exports = fabrica(require('./util.js'), require('./ler-planilha.js'), require('./ler-razao.js'), require('./ler-financeiro.js'), require('./familias.js'), require('./ler-balancete.js'), require('./ler-diario.js'));
  } else {
    raiz.Leitor = fabrica(raiz.Util, raiz.LerPlanilha, raiz.LerRazao, raiz.LerFinanceiro, raiz.Familias, raiz.LerBalancete, raiz.LerDiario);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, LerPlanilha, LerRazao, LerFinanceiro, Familias, LerBalancete, LerDiario) {
  'use strict';

  const NOMES_DOS_TIPOS = {
    razao: 'Razão contábil',
    diario: 'Livro diário',
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
  // PDF? (a assinatura do arquivo é "%PDF"). O programa lê PDF desde 25/09/2026, porque o sistema de um
  // cliente (a Zelco) só emite assim.
  function ehPdf(bytes) {
    return !!bytes && bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

  function ler(bytes, nomeArquivo) {
    const r = { nomeArquivo, hash: Util.hashBytes(bytes), tipo: 'desconhecido', motivo: '', avisos: [], previa: [] };
    let planilha;
    try {
      if (ehPdf(bytes)) throw new Error('Este arquivo é um PDF. Use a leitura que abre PDF (o programa faz isso sozinho ao subir o arquivo).');
      planilha = LerPlanilha.abrir(bytes);
    } catch (e) {
      r.motivo = e.message;
      return fechar(r);
    }
    return lerAbas(planilha.abas, r, planilha.avisos.slice());
  }

  // A mesma leitura, com o arquivo já aberto em abas (planilha ou PDF).
  function lerAbas(abasDoArquivo, r, avisosAbertura) {
    const nomeArquivo = r.nomeArquivo;
    const planilha = { abas: abasDoArquivo, avisos: avisosAbertura || [] };
    r.avisos = planilha.avisos.slice();
    r.previa = previa(planilha.abas);
    // O arquivo JÁ ABERTO fica junto da leitura. Quem precisar tentar de novo (indicar as colunas do balancete,
    // por exemplo) usa estas abas em vez de abrir o arquivo outra vez — num PDF, abrir "como planilha" traz
    // lixo na tela (Dony, 25/09/2026: "carregou o balancete de janeiro, mas não entendeu os outros").
    r.abas = planilha.abas;

    // (saldo de abertura por fornecedor: formato a definir com o Dony — Parte 5.3)

    // Livro diário (todas as contas, uma partida por linha): antes do razão, que confundiria a lista de lançamentos.
    const recDiario = LerDiario ? LerDiario.reconhecer(planilha.abas, { nomeArquivo }) : { tipo: null };
    if (recDiario.tipo === 'diario') {
      const d = LerDiario.ler(planilha.abas, { nomeArquivo });
      r.tipo = 'diario';
      r.motivo = recDiario.motivo;
      r.diario = d;
      r.avisos = r.avisos.concat(d.avisos);
      if (d.periodo) r.competencia = Util.competenciaDe(Util.lerData(d.periodo.de));
      return fechar(r);
    }

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
      // inferir: o cabeçalho pode ter DUAS colunas com cara de saldo anterior — no balancete da Zelco,
      // "Saldo Incial conta" (desde a abertura) e "Inicial Período" (do mês). Em janeiro dá na mesma; de
      // fevereiro em diante, não. Quando o cabeçalho não fecha a conta, o leitor acha as colunas pelo
      // conteúdo e fica com a leitura que fecha (Dony, 25/09/2026: "por que ele tá pedindo de novo a
      // estrutura do balancete de fevereiro?").
      const b = LerBalancete.ler(planilha.abas, { nomeArquivo, inferir: true });
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

  // A leitura que serve para qualquer arquivo: planilha ou PDF. É assíncrona porque abrir PDF é assíncrono.
  // op: { pdf: { pdfjs, aoAndar, maximoPaginas } }
  async function lerArquivo(bytes, nomeArquivo, op) {
    if (!ehPdf(bytes)) return ler(bytes, nomeArquivo);
    const r = { nomeArquivo, hash: Util.hashBytes(bytes), tipo: 'desconhecido', motivo: '', avisos: [], previa: [], dePdf: true };
    const LerPdf = (op && op.lerPdf) || (typeof self !== 'undefined' ? self.LerPdf : null);
    if (!LerPdf) { r.motivo = 'Não achei o leitor de PDF.'; return fechar(r); }
    let lido;
    try {
      lido = await LerPdf.abas(bytes, Object.assign({ nome: nomeArquivo }, (op && op.pdf) || {}));
    } catch (e) {
      r.motivo = 'Não consegui abrir este PDF: ' + (e && e.message ? e.message : e);
      return fechar(r);
    }
    r.paginas = lido.paginas;
    const avisos = lido.lidas < lido.paginas ? ['O PDF tem ' + lido.paginas + ' páginas e foram lidas ' + lido.lidas + '.'] : [];
    return lerAbas(lido.abas, r, avisos);
  }

  return { ler, lerArquivo, lerAbas, ehPdf, NOMES_DOS_TIPOS };
});
