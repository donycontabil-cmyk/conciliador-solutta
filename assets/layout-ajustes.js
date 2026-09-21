/*
 * Conciliador Solutta — layout-ajustes.js
 * O ARQUIVO DE LANÇAMENTOS para importar no sistema contábil (Parte 7.3).
 * O layout fica todo AQUI, numa peça só: trocar de sistema contábil = trocar este
 * arquivo (ou as opções em config.js), sem mexer nos motores nem nas telas.
 *
 * LAYOUT DO SISTEMA DO ESCRITÓRIO (21/09/2026, a planilha de importação modelo que o Dony mandou —
 * "um novo layout de importação de lançamentos"): planilha .xlsx, uma aba, SEM linha de títulos, um
 * lançamento por linha, sete colunas:
 *   A Data (data de verdade, dd/mm/aaaa) · B Conta débito · C Participante do débito · D Conta crédito ·
 *   E Participante do crédito · F Valor (número) · G Histórico
 *  - conta pelo código reduzido, que vem do razão (número);
 *  - participante = o código do fornecedor no sistema, que vem da coluna Participante do razão; vazio quando
 *    o razão não traz (a planilha modelo deixa vazio nas contas sem participante);
 *  - histórico sem acento (não depende da tabela de caracteres do sistema), sem quebras de linha.
 *
 * LAYOUT ANTIGO DE REFERÊNCIA (formato 'texto', fica como opção em config.js):
 *   Data;Conta débito;Conta crédito;Valor;;Histórico
 *  - separador ";", com uma coluna VAZIA entre Valor e Histórico; valor com vírgula e SEM ponto de milhar;
 *  - fim de linha do Windows (CRLF), inclusive depois da última linha;
 *  - Windows-1252 (ANSI), sem BOM. O navegador só gera UTF-8: aqui se converte.
 *    Até U+00FF copia o código; travessão e aspas curvas viram os simples; o resto vira "?";
 *  - ";" e quebras de linha tirados do histórico.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), () => require('./excel-bonito.js'));
  else raiz.LayoutAjustes = fabrica(raiz.Util, () => raiz.ExcelBonito);
})(typeof self !== 'undefined' ? self : this, function (Util, excelBonito) {
  'use strict';

  const CRLF = String.fromCharCode(13, 10);
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  const LAYOUTS = {
    planilha: {
      formato: 'planilha',
      nome: 'Planilha de importação (Data | Conta débito | Participante | Conta crédito | Participante | Valor | Histórico)',
      extensao: '.xlsx', tipo: XLSX_MIME,
    },
    texto: {
      formato: 'texto',
      nome: 'Referência (Data;Conta débito;Conta crédito;Valor;;Histórico)',
      cabecalho: true,
      titulos: ['Data', 'Conta débito', 'Conta crédito', 'Valor', '', 'Histórico'],
      extensao: '.txt', tipo: 'text/plain',
    },
  };
  const PADRAO = LAYOUTS.planilha;

  // O layout pedido: o formato ('planilha' | 'texto') e o que mais vier nas opções (config.js).
  function layoutDe(opcoes) {
    const o = opcoes || {};
    return Object.assign({}, LAYOUTS[o.formato] || PADRAO, o);
  }

  // Converte texto para Windows-1252 (ANSI), sem BOM.
  function paraWindows1252(texto) {
    const s = String(texto);
    const bytes = new Uint8Array(s.length);
    let n = 0;
    for (const ch of s) {
      let c = ch.codePointAt(0);
      if (c === 0x2013 || c === 0x2014 || c === 0x2212) c = 0x2D;            // travessões e sinal de menos -> "-"
      else if (c === 0x2018 || c === 0x2019 || c === 0x201A) c = 0x27;     // aspas simples curvas -> '
      else if (c === 0x201C || c === 0x201D || c === 0x201E) c = 0x22;     // aspas duplas curvas -> "
      else if (c === 0x2026) c = 0x2E;                                     // reticências -> "."
      if (c > 0xFF || (c >= 0x80 && c <= 0x9F)) c = 0x3F;                   // o resto vira "?"
      bytes[n++] = c;
    }
    return bytes.slice(0, n);
  }

  function limparCampo(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
      .replace(/[;]/g, ',')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Histórico sem acento, para não depender da tabela de caracteres do sistema.
  function limparHistorico(texto) {
    return limparCampo(Util.semAcento(texto));
  }

  // Código (conta ou participante): número quando é só dígitos, como na planilha modelo; senão, o texto.
  function codigo(v) {
    const s = limparCampo(v);
    return /^\d{1,15}$/.test(s) ? Number(s) : s;
  }

  // 'dd/mm/aaaa' -> número de série do Excel (dias desde 30/12/1899).
  function serieDaData(texto) {
    const d = Util.lerData(texto);
    if (!d) throw new Error('Data inválida no lançamento: ' + texto);
    return Math.round(Date.UTC(d.ano, d.mes - 1, d.dia) / 86400000) + 25569;
  }

  function gerarTexto(lancamentos, layout) {
    const linhas = [];
    if (layout.cabecalho) linhas.push(layout.titulos.join(';'));
    for (const l of lancamentos) {
      linhas.push([
        l.data,
        limparCampo(l.contaDebito),
        limparCampo(l.contaCredito),
        Util.centavosParaArquivo(l.valor),
        '',
        limparHistorico(l.historico),
      ].join(';'));
    }
    const texto = linhas.map((x) => x + CRLF).join('');
    return { texto, bytes: paraWindows1252(texto) };
  }

  function gerarPlanilha(lancamentos, layout) {
    const EB = excelBonito();
    if (!EB) throw new Error('O gerador de planilha (excel-bonito.js) não foi carregado.');
    const cel = (v, e) => ({ v: v === '' ? null : v, e });
    const linhas = lancamentos.map((l) => ({ celulas: [
      cel(serieDaData(l.data), 'data'), cel(codigo(l.contaDebito), 'cod'), cel(codigo(l.participanteDebito), 'cod'),
      cel(codigo(l.contaCredito), 'cod'), cel(codigo(l.participanteCredito), 'cod'),
      cel(l.valor / 100, 'valor'), cel(limparHistorico(l.historico), 'txt'),
    ] }));
    const bytes = EB.gerar({
      planilhas: [{ nome: layout.nomeAba || 'Lançamentos', colunas: [12, 9, 11, 9, 11, 14, 72], linhas }],
      estilos: { data: { formato: 'dd/mm/yyyy' }, cod: {}, valor: { formato: '#,##0.00' }, txt: {} },
    });
    return { texto: null, bytes };
  }

  /**
   * @param lancamentos [{ data: 'dd/mm/aaaa', contaDebito, contaCredito, participanteDebito?, participanteCredito?,
   *                       valor (centavos), historico }]
   * @param opcoes      { formato: 'planilha' (padrão) | 'texto', nomeAba? }
   * @returns { texto (só no formato texto), bytes, linhas, total, layout, extensao, tipo }
   */
  function gerar(lancamentos, opcoes) {
    const layout = layoutDe(opcoes);
    let total = 0;
    for (const l of lancamentos) {
      if (!(l.valor > 0)) throw new Error('Lançamento com valor zerado ou negativo não entra no arquivo: ' + l.historico);
      total += l.valor;
    }
    const r = layout.formato === 'texto' ? gerarTexto(lancamentos, layout) : gerarPlanilha(lancamentos, layout);
    return { texto: r.texto, bytes: r.bytes, linhas: lancamentos.length, total, layout: layout.nome, extensao: layout.extensao, tipo: layout.tipo };
  }

  function nomeDoArquivo(codigoEmpresa, competencia, familia, extensao) {
    return Util.nomeSeguro('Ajustes ' + codigoEmpresa + ' ' + Util.anoMes(competencia) + ' ' + familia, 70) + (extensao || PADRAO.extensao);
  }

  return { PADRAO, LAYOUTS, layoutDe, gerar, paraWindows1252, limparHistorico, nomeDoArquivo, serieDaData, CRLF };
});
