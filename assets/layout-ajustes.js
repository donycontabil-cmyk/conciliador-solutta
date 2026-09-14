/*
 * Conciliador Solutta — layout-ajustes.js
 * O ARQUIVO DE LANÇAMENTOS para importar no sistema contábil (Parte 7.3).
 * O layout fica todo AQUI, numa peça só: trocar de sistema contábil = trocar este
 * arquivo (ou as opções em config.js), sem mexer nos motores nem nas telas.
 *
 * LAYOUT DE REFERÊNCIA (confirmar BYTE A BYTE com um arquivo modelo do sistema da Solutta):
 *   Data;Conta débito;Conta crédito;Valor;;Histórico
 *   30/09/2026;<cód. fornecedores>;<cód. adiantamento>;1500,00;;Reclassificacao adiantamento - ...
 *  - separador ";", com uma coluna VAZIA entre Valor e Histórico;
 *  - valor com vírgula e SEM ponto de milhar;
 *  - conta pelo código reduzido, que vem do razão;
 *  - fim de linha do Windows (CRLF), inclusive depois da última linha;
 *  - Windows-1252 (ANSI), sem BOM. O navegador só gera UTF-8: aqui se converte.
 *    Até U+00FF copia o código; travessão e aspas curvas viram os simples; o resto vira "?";
 *  - ";" e quebras de linha tirados do histórico.
 * 13/09/2026: o Dony ainda não tem o modelo ("está tudo lá na empresa"); usado o de
 * referência, com a linha de títulos. Confirmar amanhã no computador da Solutta.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LayoutAjustes = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const CRLF = String.fromCharCode(13, 10);

  const PADRAO = {
    nome: 'Referência (Data;Conta débito;Conta crédito;Valor;;Histórico)',
    cabecalho: true,
    titulos: ['Data', 'Conta débito', 'Conta crédito', 'Valor', '', 'Histórico'],
    extensao: '.txt',
  };

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

  /**
   * @param lancamentos [{ data: 'dd/mm/aaaa', contaDebito, contaCredito, valor (centavos), historico }]
   * @param opcoes      layout (padrão: referência)
   * @returns { texto, bytes, linhas, total }
   */
  function gerar(lancamentos, opcoes) {
    const layout = Object.assign({}, PADRAO, opcoes || {});
    const linhas = [];
    if (layout.cabecalho) linhas.push(layout.titulos.join(';'));
    let total = 0;
    for (const l of lancamentos) {
      if (!(l.valor > 0)) throw new Error('Lançamento com valor zerado ou negativo não entra no arquivo: ' + l.historico);
      total += l.valor;
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
    return { texto, bytes: paraWindows1252(texto), linhas: lancamentos.length, total, layout: layout.nome };
  }

  function nomeDoArquivo(codigoEmpresa, competencia, familia, extensao) {
    return Util.nomeSeguro('Ajustes ' + codigoEmpresa + ' ' + Util.anoMes(competencia) + ' ' + familia, 70) + (extensao || PADRAO.extensao);
  }

  return { PADRAO, gerar, paraWindows1252, limparHistorico, nomeDoArquivo, CRLF };
});
