/*
 * Conciliador Solutta — ler-financeiro.js
 * Relatórios do financeiro do cliente (Parte 5.4). Nesta etapa: contas a pagar ou a
 * receber EM ABERTO (títulos). Extrato bancário e movimento pago/recebido chegam na Etapa 3.
 *  - cabeçalho procurado nas primeiras 20 linhas, colunas pelo TÍTULO, com sinônimos;
 *  - descarta a linha de TOTAL (o total é recalculado pelos títulos: somar a linha de
 *    total dobraria o relatório) e o título baixado, pago ou liquidado;
 *  - nada some calado: cada linha descartada fica listada com o motivo.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerFinanceiro = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  function chaveTitulo(v) {
    return Util.semAcento(v === null || v === undefined ? '' : String(v)).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  const SINONIMOS = {
    // "nomeparceiroparceiro" = "Nome Parceiro (Parceiro)" da Univale (o fornecedor). Vem ANTES
    // do nome fantasia da própria empresa, que não é o fornecedor.
    nome: ['nomeparceiroparceiro', 'nomeparceiro', 'razaosocial', 'fornecedor', 'cliente', 'nome', 'nomefornecedor', 'nomedofornecedor', 'nomecliente', 'nomedocliente', 'favorecido', 'sacado'],
    cnpj: ['cnpjcpfparceiro', 'inscricao', 'cnpj', 'cpfcnpj', 'cnpjcpf', 'cpf', 'cnpjdofornecedor', 'documentodofornecedor'],
    // "vlrdodesdobramento" = coluna do aging da Univale que o Dony usa (14/09/2026): é o valor
    // em aberto do título. Vem ANTES de "valor líquido" e "saldo" para ganhar quando existem os dois.
    valor: ['vlrdodesdobramento', 'valordodesdobramento', 'vlrdesdobramento', 'valordesdobramento', 'valorliquido', 'saldo', 'valoremaberto', 'valoraberto', 'saldoemaberto', 'saldoaberto', 'valorapagar', 'valorareceber', 'valor', 'valortotal'],
    vencimento: ['vencimento', 'datavencimento', 'datadevencimento', 'dtvencimento', 'vencto', 'dtvencto'],
    documento: ['docserie', 'documento', 'numerodocumento', 'ndocumento', 'notafiscal', 'nronota', 'nrounico', 'nf', 'titulo', 'numerotitulo', 'numero'],
    parcela: ['parcela', 'parc', 'nparcela', 'desdob', 'desdobduplicata'],
    status: ['status', 'situacao'],
  };

  const DESCARTAR_STATUS = /^(baixad|pag|liquidad|quitad|cancelad|recebid)/;

  function mapear(linha) {
    const chaves = linha.map(chaveTitulo);
    const mapa = {};
    const usados = new Set();
    for (const campo of Object.keys(SINONIMOS)) {
      for (const sin of SINONIMOS[campo]) {
        const idx = chaves.findIndex((c, i) => c === sin && !usados.has(i));
        if (idx >= 0) { mapa[campo] = idx; usados.add(idx); break; }
      }
    }
    return mapa;
  }

  function acharCabecalho(abas) {
    for (let a = 0; a < abas.length; a++) {
      const linhas = abas[a].linhas;
      for (let r = 0; r < Math.min(20, linhas.length); r++) {
        const l = linhas[r];
        if (!l) continue;
        const m = mapear(l);
        if (m.nome !== undefined && m.valor !== undefined && (m.vencimento !== undefined || m.cnpj !== undefined || m.documento !== undefined)) {
          return { aba: a, linha: r, mapa: m };
        }
      }
    }
    return null;
  }

  function textoDasPrimeirasLinhas(abas, n) {
    const partes = [];
    for (const aba of abas) {
      for (let r = 0; r < Math.min(n, aba.linhas.length); r++) {
        for (const c of aba.linhas[r] || []) if (typeof c === 'string') partes.push(c);
      }
    }
    return Util.semAcento(partes.join(' ')).toLowerCase();
  }

  // Extrato bancário (para não confundir com títulos: armadilha 28).
  // Extrato = colunas de data, histórico e valor E (coluna de saldo OU linha "SALDO ANTERIOR").
  function pareceExtrato(abas) {
    const saldoAnterior = /saldo anterior/.test(textoDasPrimeirasLinhas(abas, 60));
    for (const aba of abas) {
      for (let r = 0; r < Math.min(30, aba.linhas.length); r++) {
        const chaves = (aba.linhas[r] || []).map(chaveTitulo);
        const temData = chaves.some((c) => c === 'data' || c === 'datalancamento' || c === 'datamovimento');
        const temDescricao = chaves.some((c) => /^(lancamento|historico|descricao|lancamentohistorico|historicolancamento)$/.test(c));
        const temValor = chaves.some((c) => c === 'valor' || c === 'valorrs' || c === 'credito' || c === 'debito');
        const temSaldo = chaves.some((c) => c === 'saldo' || c === 'saldors');
        if (temData && temDescricao && temValor && (temSaldo || saldoAnterior)) return true;
      }
    }
    return saldoAnterior && /(agencia|conta corrente|extrato)/.test(textoDasPrimeirasLinhas(abas, 15));
  }

  // ------------------------------------------------------------------
  // Contas a pagar de outro cliente real (16/09/2026 — "sempre vai ser enviado desta forma"): várias
  // abas (Cash Report, Contas a Pagar em Aberto, Monthly Average, Pagar, Fornecedores) e SÓ a aba
  // "Pagar" conta: Filial | Chave | Nº Documento | Fornecedor | Data de Entrada | Data de Vencimento |
  // Valor Bruto | Data Pagamento | Valor Pago | Situação | Origem | Contabil | Tipo | … Entram só os
  // títulos com Situação "Em Aberto" (coluna J) e Contabil "Outras Contas a Pagar" (coluna L) — regra
  // do Dony. O Nº Documento traz a parcela ("3760204/1"): a nota vai no documento, a parcela à parte.
  // ------------------------------------------------------------------
  const REGRA_ABA_PAGAR = { situacao: 'em aberto', contabil: 'outras contas a pagar', nomeContabil: 'Outras Contas a Pagar' };

  function acharAbaPagar(abas) {
    for (let a = 0; a < abas.length; a++) {
      if (!/^pagar$/i.test(String(abas[a].nome || '').trim())) continue;
      const linhas = abas[a].linhas;
      for (let r = 0; r < Math.min(20, linhas.length); r++) {
        const chaves = (linhas[r] || []).map(chaveTitulo);
        const col = (nome) => { const i = chaves.indexOf(nome); return i >= 0 ? i : undefined; };
        const m = { nome: col('fornecedor'), valor: col('valorbruto'), vencimento: col('datadevencimento'), documento: col('ndocumento'),
          status: col('situacao'), contabil: col('contabil') };
        if (m.nome !== undefined && m.valor !== undefined && m.status !== undefined && m.contabil !== undefined) return { aba: a, linha: r, mapa: m };
      }
    }
    return null;
  }

  function lerAbaPagar(abas, cab, opcoes) {
    const linhas = abas[cab.aba].linhas;
    const mapa = cab.mapa;
    const texto = (l, i) => (i === undefined || l[i] === null || l[i] === undefined ? '' : String(l[i]).replace(/\s+/g, ' ').trim());
    const norm = (v) => Util.semAcento(v).toLowerCase();
    const titulos = [];
    const descartados = [];
    const fora = {}; // motivo -> quantidade (milhares de títulos pagos: só a conta, sem a lista)
    for (let r = cab.linha + 1; r < linhas.length; r++) {
      const l = linhas[r];
      if (!l || !l.some((c) => c !== null && String(c).trim() !== '')) continue;
      const situacao = texto(l, mapa.status);
      const contabil = texto(l, mapa.contabil);
      if (norm(situacao) !== REGRA_ABA_PAGAR.situacao) {
        const m = 'Situação "' + (situacao || 'vazia') + '" (não está em aberto)';
        fora[m] = (fora[m] || 0) + 1;
        continue;
      }
      if (norm(contabil) !== REGRA_ABA_PAGAR.contabil) {
        const m = 'Contabil "' + (contabil || 'vazio') + '" (só entra ' + REGRA_ABA_PAGAR.nomeContabil + ')';
        fora[m] = (fora[m] || 0) + 1;
        continue;
      }
      const nome = texto(l, mapa.nome);
      const valor = Util.paraNumero(l[mapa.valor]);
      const textoLinha = l.filter((c) => c !== null).map(String).join(' | ');
      if (valor === null) { descartados.push({ linha: r + 1, motivo: 'em aberto sem valor', texto: textoLinha }); continue; }
      if (!nome) { descartados.push({ linha: r + 1, motivo: 'em aberto sem fornecedor', texto: textoLinha }); continue; }
      const venc = mapa.vencimento !== undefined ? Util.lerData(l[mapa.vencimento]) : null;
      const doc = Util.separarDocumento(texto(l, mapa.documento));
      titulos.push({
        nome, cnpj: '', cnpjValido: false, valor: Util.centavos(valor),
        vencimento: venc ? venc.texto : '', documento: doc.documento, parcela: doc.parcela,
        status: situacao, contabil,
      });
    }
    Object.keys(fora).forEach((m) => descartados.push({ linha: null, motivo: m, quantidade: fora[m], texto: '' }));
    return {
      tipo: (opcoes && opcoes.tipo) || 'financeiro_pagar',
      titulos,
      total: titulos.reduce((t, x) => t + x.valor, 0),
      descartados,
      avisos: [],
      posicao: null,
      formato: 'aba "' + abas[cab.aba].nome + '": Situação Em Aberto e Contabil ' + REGRA_ABA_PAGAR.nomeContabil,
    };
  }

  // ------------------------------------------------------------------
  // Contas a pagar de um terceiro cliente real (17/09/2026, "Contas a Pagar_A Vencer - AGING 072026"):
  // uma aba, cabeçalho "Nº Lancto | Seq. | Tipo do Lançamento | Código | [sem título] | Razão | UF | … |
  // Valor Original | Valor Ocorrências | Valor Líquido | Valor Quitado | Situação Documento | … |
  // Dt.Vencto | … | Notas Fiscais | … | CNPJ / CPF do cliente | …", uma linha "Total Geral" e, às vezes,
  // um total solto acima do cabeçalho. A coluna sem título depois do Código diz o TIPO do participante:
  // só entram as linhas "FORNECEDOR" (as outras são impostos, débito automático etc.) — com elas o total
  // do Valor Líquido é o saldo do razão de fornecedores (conferido: o aging de julho é o saldo inicial do
  // razão de agosto, o "Total Geral" do próprio relatório). O valor é o Valor Líquido; o documento é o
  // Nº Lancto (o NRM que o razão cita) e a parcela é a Seq.
  // ------------------------------------------------------------------
  const TIPO_PARTICIPANTE = 'FORNECEDOR';

  function acharAgingPorParticipante(abas) {
    for (let a = 0; a < abas.length; a++) {
      const linhas = abas[a].linhas;
      for (let r = 0; r < Math.min(20, linhas.length); r++) {
        const chaves = (linhas[r] || []).map(chaveTitulo);
        const col = (nome) => { const i = chaves.indexOf(nome); return i >= 0 ? i : undefined; };
        const m = { documento: col('nlancto'), parcela: col('seq'), nome: col('razao'), valor: col('valorliquido'), vencimento: col('dtvencto'),
          cnpj: col('cnpjcpfdocliente'), notaFiscal: col('notasfiscais'), status: col('situacaodocumento'), registro: col('datadoregistrocontabil') };
        if (m.documento === undefined || m.nome === undefined || m.valor === undefined || m.vencimento === undefined) continue;
        // A coluna do tipo: a sem título em que as linhas dizem "FORNECEDOR" (a primeira depois do Código).
        const amostra = linhas.slice(r + 1, r + 400).filter(Boolean);
        const candidatas = chaves.map((c, i) => i).filter((i) => !chaves[i] && amostra.some((l) => String(l[i] === null || l[i] === undefined ? '' : l[i]).trim().toUpperCase() === TIPO_PARTICIPANTE));
        if (!candidatas.length) continue;
        const codigo = col('codigo');
        m.tipo = candidatas.find((i) => codigo !== undefined && i > codigo) !== undefined ? candidatas.find((i) => i > codigo) : candidatas[0];
        return { aba: a, linha: r, mapa: m };
      }
    }
    return null;
  }

  function lerAgingPorParticipante(abas, cab, opcoes) {
    const linhas = abas[cab.aba].linhas;
    const mapa = cab.mapa;
    const texto = (l, i) => (i === undefined || l[i] === null || l[i] === undefined ? '' : String(l[i]).replace(/\s+/g, ' ').trim());
    const titulos = [];
    const descartados = [];
    const fora = new Map(); // tipo -> { quantidade, valor }
    for (let r = cab.linha + 1; r < linhas.length; r++) {
      const l = linhas[r];
      if (!l || !l.some((c) => c !== null && String(c).trim() !== '')) continue;
      const textoLinha = l.filter((c) => c !== null).map(String).join(' | ').slice(0, 300);
      if (/^total/i.test(Util.semAcento(texto(l, mapa.documento)))) {
        descartados.push({ linha: r + 1, motivo: 'linha de TOTAL (o total é recalculado pelos títulos)', texto: textoLinha });
        continue;
      }
      const valor = Util.paraNumero(l[mapa.valor]);
      const tipo = texto(l, mapa.tipo).toUpperCase();
      if (tipo !== TIPO_PARTICIPANTE) {
        const k = tipo || 'vazio';
        const f = fora.get(k) || { quantidade: 0, valor: 0 };
        f.quantidade++;
        f.valor += valor === null ? 0 : Util.centavos(valor);
        fora.set(k, f);
        continue;
      }
      const nome = texto(l, mapa.nome);
      if (valor === null) { descartados.push({ linha: r + 1, motivo: 'sem valor líquido', texto: textoLinha }); continue; }
      if (!nome) { descartados.push({ linha: r + 1, motivo: 'sem fornecedor', texto: textoLinha }); continue; }
      const cnpj = Util.soDigitos(texto(l, mapa.cnpj));
      const venc = Util.lerData(l[mapa.vencimento]);
      // Data em que o título entrou na contabilidade: o relatório lista pela emissão, e a nota pode
      // entrar no razão só no mês seguinte (caso real: títulos do aging de julho registrados em agosto).
      const registro = mapa.registro !== undefined ? Util.lerData(l[mapa.registro]) : null;
      titulos.push({
        nome, cnpj,
        cnpjValido: cnpj.length === 14 ? Util.cnpjValido(cnpj) : (cnpj.length === 11 ? Util.cpfValido(cnpj) : false),
        valor: Util.centavos(valor),
        vencimento: venc ? venc.texto : '',
        documento: texto(l, mapa.documento), parcela: texto(l, mapa.parcela),
        notaFiscal: texto(l, mapa.notaFiscal).replace(/^0+(?=\d)/, ''),
        status: texto(l, mapa.status),
        registro: registro ? registro.texto : '',
      });
    }
    fora.forEach((f, tipo) => descartados.push({ linha: null, motivo: 'tipo "' + (tipo === 'vazio' ? 'sem tipo' : tipo) + '" (só entra ' + TIPO_PARTICIPANTE + ': impostos, débito automático e outros ficam de fora)',
      quantidade: f.quantidade, valor: f.valor, texto: '' }));
    const invalidos = titulos.filter((t) => t.cnpj && !t.cnpjValido).length;
    return {
      tipo: (opcoes && opcoes.tipo) || 'financeiro_pagar',
      titulos,
      total: titulos.reduce((t, x) => t + x.valor, 0),
      descartados,
      avisos: invalidos ? [invalidos + ' título(s) com CNPJ/CPF de dígito verificador inválido (serão reconhecidos só pelo nome).'] : [],
      posicao: null,
      formato: 'só as linhas do tipo ' + TIPO_PARTICIPANTE + ', pelo Valor Líquido',
    };
  }

  function reconhecer(abas) {
    const pagar = acharAbaPagar(abas);
    if (pagar) {
      return { tipo: 'financeiro_pagar', certeza: true, cabecalho: pagar, abaPagar: true,
        motivo: 'Contas a pagar (aba "' + abas[pagar.aba].nome + '"): só os títulos com Situação Em Aberto e Contabil ' + REGRA_ABA_PAGAR.nomeContabil + '.' };
    }
    const participante = acharAgingPorParticipante(abas);
    if (participante) {
      return { tipo: 'financeiro_pagar', certeza: true, cabecalho: participante, porParticipante: true,
        motivo: 'Contas a pagar (lançamentos do financeiro): só as linhas do tipo ' + TIPO_PARTICIPANTE + ', pelo Valor Líquido.' };
    }
    const cab = acharCabecalho(abas);
    if (!cab) return { tipo: null, motivo: 'Não achei o cabeçalho de um relatório de títulos (nome, valor e vencimento ou documento) nas primeiras 20 linhas.' };
    const texto = textoDasPrimeirasLinhas(abas, cab.linha + 1);
    const cabecalho = (abas[cab.aba].linhas[cab.linha] || []).map(chaveTitulo);
    let tipo = null;
    let certeza = true;
    if (/a receber|contas a receber|receber/.test(texto) || cabecalho.indexOf('cliente') >= 0 || cabecalho.indexOf('sacado') >= 0) tipo = 'financeiro_receber';
    if (/a pagar|contas a pagar|pagar/.test(texto) || cabecalho.indexOf('fornecedor') >= 0 || cabecalho.indexOf('favorecido') >= 0) tipo = tipo ? null : 'financeiro_pagar';
    if (!tipo) { tipo = 'financeiro_pagar'; certeza = false; }
    return { tipo, certeza, cabecalho: cab, motivo: 'Relatório de títulos em aberto (colunas: ' +
      Object.keys(cab.mapa).map((k) => k).join(', ') + ').' };
  }

  function lerTitulos(abas, opcoes) {
    const rec = reconhecer(abas);
    if (!rec.tipo) throw new Error(rec.motivo);
    if (rec.abaPagar) return lerAbaPagar(abas, rec.cabecalho, opcoes);
    if (rec.porParticipante) return lerAgingPorParticipante(abas, rec.cabecalho, opcoes);
    const { aba, linha: linhaCab, mapa } = rec.cabecalho;
    const linhas = abas[aba].linhas;
    const titulos = [];
    const descartados = [];
    const avisos = [];
    for (let r = linhaCab + 1; r < linhas.length; r++) {
      const l = linhas[r];
      if (!l || !l.some((c) => c !== null && String(c).trim() !== '')) continue;
      const textoLinha = l.filter((c) => c !== null).map(String).join(' | ');
      const primeira = l.find((c) => c !== null && String(c).trim() !== '');
      const nome = l[mapa.nome] === null || l[mapa.nome] === undefined ? '' : String(l[mapa.nome]).trim();
      if (/^total/i.test(Util.semAcento(String(primeira)).trim()) || /^total/i.test(Util.semAcento(nome))) {
        descartados.push({ linha: r + 1, motivo: 'linha de TOTAL (o total é recalculado pelos títulos)', texto: textoLinha });
        continue;
      }
      if (mapearEhCabecalhoRepetido(l, mapa)) continue;
      const valor = Util.paraNumero(l[mapa.valor]);
      if (valor === null) {
        descartados.push({ linha: r + 1, motivo: 'sem valor', texto: textoLinha });
        continue;
      }
      if (!nome) {
        descartados.push({ linha: r + 1, motivo: 'sem nome', texto: textoLinha });
        continue;
      }
      const status = mapa.status !== undefined && l[mapa.status] !== null ? String(l[mapa.status]).trim() : '';
      if (status && DESCARTAR_STATUS.test(Util.semAcento(status).toLowerCase())) {
        descartados.push({ linha: r + 1, motivo: 'título ' + status.toLowerCase() + ' (não está em aberto)', texto: textoLinha });
        continue;
      }
      const doc = mapa.cnpj !== undefined ? Util.soDigitos(l[mapa.cnpj]) : '';
      const venc = mapa.vencimento !== undefined ? Util.lerData(l[mapa.vencimento]) : null;
      titulos.push({
        nome,
        cnpj: doc,
        cnpjValido: doc.length === 14 ? Util.cnpjValido(doc) : (doc.length === 11 ? Util.cpfValido(doc) : false),
        valor: Util.centavos(valor),
        vencimento: venc ? venc.texto : '',
        documento: mapa.documento !== undefined && l[mapa.documento] !== null ? String(l[mapa.documento]) : '',
        parcela: mapa.parcela !== undefined && l[mapa.parcela] !== null ? String(l[mapa.parcela]) : '',
        status,
      });
    }
    const invalidos = titulos.filter((t) => t.cnpj && !t.cnpjValido).length;
    if (invalidos) avisos.push(invalidos + ' título(s) com CNPJ/CPF de dígito verificador inválido (serão reconhecidos só pelo nome).');
    if (!rec.certeza) avisos.push('Não ficou claro se é contas a PAGAR ou a RECEBER: confirme.');
    return {
      tipo: (opcoes && opcoes.tipo) || rec.tipo,
      titulos,
      total: titulos.reduce((t, x) => t + x.valor, 0),
      descartados,
      avisos,
      posicao: posicaoDoRelatorio(abas, linhaCab),
    };
  }

  function mapearEhCabecalhoRepetido(linha, mapa) {
    return chaveTitulo(linha[mapa.nome]) && SINONIMOS.nome.indexOf(chaveTitulo(linha[mapa.nome])) >= 0 &&
      SINONIMOS.valor.indexOf(chaveTitulo(linha[mapa.valor])) >= 0;
  }

  // "Posição em dd/mm/aaaa", "Data base", "Emitido em": a data da posição, quando o relatório diz.
  // Faixa de VENCIMENTOS ("ago a dez") não é a data da posição (armadilha 27): quem confirma é a tela.
  function posicaoDoRelatorio(abas, ate) {
    const linhas = abas[0] ? abas[0].linhas : [];
    for (let r = 0; r < Math.min(ate, linhas.length); r++) {
      const t = (linhas[r] || []).filter((c) => c !== null).map(String).join(' ');
      const m = Util.semAcento(t).match(/(posicao|data base|database|emitido em|emissao)\D{0,12}(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (m) { const d = Util.lerData(m[2]); if (d) return d.texto; }
    }
    return null;
  }

  return { reconhecer, lerTitulos, pareceExtrato, SINONIMOS };
});
