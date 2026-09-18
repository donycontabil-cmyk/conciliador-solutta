/*
 * Conciliador Solutta — excel-bonito.js
 * Planilha .xlsx FORMATADA (cores, negrito, bordas, formato de número, cabeçalho e 1ª coluna travados,
 * grupos com o +/− do Excel e folha pronta para imprimir) — Dony, 18/09/2026: "quero o Excel exatamente
 * como eu vejo na tela, bonito e formatado, porque vou mandar para o cliente".
 * A versão gratuita da biblioteca de planilhas (SheetJS) não grava estilo; por isso este módulo escreve o
 * XML do Excel à mão e usa da biblioteca só o compactador ZIP (XLSX.CFB).
 *
 * Entrada:
 *   { planilhas: [{
 *       nome, colunas: [largura, ...],
 *       linhas: [ { celulas: [ { v: texto|número|null, e: 'nome do estilo' } | null ], altura, nivel, escondida, recolhida } | null ],
 *       mesclas: ['A1:D1'], congelar: { linhas, colunas }, resumoAcima: true (o +/− fica na linha de cima do grupo),
 *       paisagem: true, repetir: [primeiraLinha, ultimaLinha] (títulos na impressão, 1 = primeira), semGrade: true,
 *       rodape: 'texto', zoom: 90 }],
 *     estilos: { nome: { negrito, italico, tam, cor, fundo, formato: 'dinheiro'|'porcento'|código, alinh, vert, recuo, quebra,
 *                        borda: { baixo|cima|esq|dir: { estilo: 'thin'|'medium', cor } } } },
 *     ativa: índice da planilha que abre primeiro }
 * Saída: Uint8Array do .xlsx. Cores em ARGB ("FF1F4E78").
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./xlsx.full.min.js'));
  else raiz.ExcelBonito = fabrica(raiz.XLSX);
})(typeof self !== 'undefined' ? self : this, function (XLSX) {
  'use strict';

  const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  // Número negativo em vermelho entre parênteses e zero como "–" (o formato da planilha modelo).
  const FORMATOS = { dinheiro: '#,##0.00;[Red]\\(#,##0.00\\);"–"', porcento: '0.0%;[Red]\\(0.0%\\);"–"', inteiro: '#,##0' };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Caracteres que o XML não aceita (controle) saem.
  const CONTROLE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) + String.fromCharCode(11, 12, 14) + '-' + String.fromCharCode(31, 0xFFFE, 0xFFFF) + ']', 'g');
  const limpo = (s) => String(s).replace(CONTROLE, '');
  // 0 -> A, 25 -> Z, 26 -> AA
  function coluna(n) {
    let s = '', k = n + 1;
    while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); }
    return s;
  }
  // Nome de aba: até 31 caracteres, sem : \ / ? * [ ]
  function nomeDeAba(nome, usados) {
    let n = String(nome || 'Planilha').replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Planilha';
    let k = 2;
    const base = n;
    while (usados.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
    usados.add(n.toLowerCase());
    return n;
  }

  // ------------------------------------------------------------------
  // Estilos: cada estilo com nome vira um "xf" do Excel (fontes, preenchimentos, bordas e formatos sem repetição).
  // ------------------------------------------------------------------
  function montarEstilos(defs) {
    const fontes = ['<font><sz val="10"/><color rgb="FF1D2733"/><name val="Calibri"/><family val="2"/></font>'];
    const fundos = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const bordas = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    const formatos = [];
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const indice = new Map();
    const unico = (lista, xml) => { let i = lista.indexOf(xml); if (i < 0) { lista.push(xml); i = lista.length - 1; } return i; };
    const lado = (tag, x) => (x ? '<' + tag + ' style="' + (x.estilo || 'thin') + '"><color rgb="' + (x.cor || 'FFC9D3DE') + '"/></' + tag + '>' : '<' + tag + '/>');
    for (const nome of Object.keys(defs || {})) {
      const d = defs[nome] || {};
      const fonte = '<font>' + (d.negrito ? '<b/>' : '') + (d.italico ? '<i/>' : '') + '<sz val="' + (d.tam || 10) + '"/><color rgb="' + (d.cor || 'FF1D2733') + '"/>' +
        '<name val="Calibri"/><family val="2"/></font>';
      const fontId = unico(fontes, fonte);
      const fillId = d.fundo ? unico(fundos, '<fill><patternFill patternType="solid"><fgColor rgb="' + d.fundo + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      const b = d.borda;
      const borderId = b ? unico(bordas, '<border>' + lado('left', b.esq) + lado('right', b.dir) + lado('top', b.cima) + lado('bottom', b.baixo) + '<diagonal/></border>') : 0;
      let numFmtId = 0;
      if (d.formato) {
        const codigo = FORMATOS[d.formato] || d.formato;
        let k = formatos.indexOf(codigo);
        if (k < 0) { formatos.push(codigo); k = formatos.length - 1; }
        numFmtId = 164 + k;
      }
      const temAlinh = d.alinh || d.vert || d.recuo || d.quebra;
      const alinh = temAlinh ? '<alignment' + (d.alinh ? ' horizontal="' + d.alinh + '"' : '') + (d.vert ? ' vertical="' + d.vert + '"' : '') +
        (d.recuo ? ' indent="' + d.recuo + '"' : '') + (d.quebra ? ' wrapText="1"' : '') + '/>' : '';
      const xf = '<xf numFmtId="' + numFmtId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' +
        (numFmtId ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fillId ? ' applyFill="1"' : '') + (borderId ? ' applyBorder="1"' : '') +
        (alinh ? ' applyAlignment="1">' + alinh + '</xf>' : '/>');
      indice.set(nome, unico(xfs, xf));
    }
    const xml = CABECALHO_XML + '<styleSheet xmlns="' + NS + '">' +
      (formatos.length ? '<numFmts count="' + formatos.length + '">' + formatos.map((c, k) => '<numFmt numFmtId="' + (164 + k) + '" formatCode="' + esc(c) + '"/>').join('') + '</numFmts>' : '') +
      '<fonts count="' + fontes.length + '">' + fontes.join('') + '</fonts>' +
      '<fills count="' + fundos.length + '">' + fundos.join('') + '</fills>' +
      '<borders count="' + bordas.length + '">' + bordas.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
    return { xml, indice };
  }

  // ------------------------------------------------------------------
  // Uma planilha (a ordem dos elementos é a que o Excel exige).
  // ------------------------------------------------------------------
  function planilhaXml(p, indice) {
    const linhas = [];
    let maxCol = 0, maxLinha = 1, maxNivel = 0;
    (p.linhas || []).forEach((l, r) => {
      if (!l) return;
      const celulas = (l.celulas || []).map((c, k) => {
        if (!c) return '';
        maxCol = Math.max(maxCol, k);
        const ref = coluna(k) + (r + 1);
        const s = c.e !== undefined && indice.has(c.e) ? ' s="' + indice.get(c.e) + '"' : '';
        if (c.v === null || c.v === undefined || c.v === '') return '<c r="' + ref + '"' + s + '/>';
        if (typeof c.v === 'number') return isFinite(c.v) ? '<c r="' + ref + '"' + s + '><v>' + c.v + '</v></c>' : '<c r="' + ref + '"' + s + '/>';
        return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(limpo(c.v)) + '</t></is></c>';
      }).join('');
      const nivel = Math.max(0, Math.min(7, l.nivel || 0));
      maxNivel = Math.max(maxNivel, nivel);
      maxLinha = r + 1;
      linhas.push('<row r="' + (r + 1) + '"' + (l.altura ? ' ht="' + l.altura + '" customHeight="1"' : '') + (nivel ? ' outlineLevel="' + nivel + '"' : '') +
        (l.escondida ? ' hidden="1"' : '') + (l.recolhida ? ' collapsed="1"' : '') + '>' + celulas + '</row>');
    });
    const cg = p.congelar || {};
    let painel = '';
    if (cg.linhas || cg.colunas) {
      const topo = coluna(cg.colunas || 0) + ((cg.linhas || 0) + 1);
      const ativo = cg.linhas && cg.colunas ? 'bottomRight' : cg.linhas ? 'bottomLeft' : 'topRight';
      painel = '<pane' + (cg.colunas ? ' xSplit="' + cg.colunas + '"' : '') + (cg.linhas ? ' ySplit="' + cg.linhas + '"' : '') + ' topLeftCell="' + topo +
        '" activePane="' + ativo + '" state="frozen"/><selection pane="' + ativo + '" activeCell="' + topo + '" sqref="' + topo + '"/>';
    }
    const ajustaPagina = p.paisagem || p.repetir;
    return CABECALHO_XML + '<worksheet xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
      '<sheetPr>' + (p.corAba ? '<tabColor rgb="' + p.corAba + '"/>' : '') + (p.resumoAcima ? '<outlinePr summaryBelow="0" summaryRight="1"/>' : '') +
      (ajustaPagina ? '<pageSetUpPr fitToPage="1"/>' : '') + '</sheetPr>' +
      '<dimension ref="A1:' + coluna(maxCol) + maxLinha + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"' + (p.semGrade ? ' showGridLines="0"' : '') + (p.zoom ? ' zoomScale="' + p.zoom + '" zoomScaleNormal="' + p.zoom + '"' : '') +
      (p.ativa ? ' tabSelected="1"' : '') + '>' + painel + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"' + (maxNivel ? ' outlineLevelRow="' + maxNivel + '"' : '') + '/>' +
      ((p.colunas || []).length ? '<cols>' + p.colunas.map((w, k) => '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '') +
      '<sheetData>' + linhas.join('') + '</sheetData>' +
      ((p.mesclas || []).length ? '<mergeCells count="' + p.mesclas.length + '">' + p.mesclas.map((m) => '<mergeCell ref="' + m + '"/>').join('') + '</mergeCells>' : '') +
      '<pageMargins left="0.3" right="0.3" top="0.45" bottom="0.5" header="0.2" footer="0.25"/>' +
      (ajustaPagina ? '<pageSetup paperSize="9" orientation="' + (p.paisagem ? 'landscape' : 'portrait') + '" fitToWidth="1" fitToHeight="0"/>' : '') +
      (p.rodape ? '<headerFooter><oddFooter>' + esc('&L&8' + String(p.rodape).replace(/&/g, '&&') + '&R&8Página &P de &N') + '</oddFooter></headerFooter>' : '') +
      '</worksheet>';
  }

  function gerar(entrada) {
    const { xml: estilos, indice } = montarEstilos(entrada.estilos);
    const usados = new Set();
    const planilhas = (entrada.planilhas || []).map((p, i) => Object.assign({}, p, { nome: nomeDeAba(p.nome, usados), ativa: i === (entrada.ativa || 0) }));
    const arquivos = [];
    arquivos.push(['[Content_Types].xml', CABECALHO_XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      planilhas.map((p, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>']);
    arquivos.push(['_rels/.rels', CABECALHO_XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
    // Títulos que se repetem em cada folha impressa.
    const nomes = planilhas.map((p, i) => (p.repetir ? '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + esc(p.nome.replace(/'/g, "''")) + '\'!$' + p.repetir[0] + ':$' + p.repetir[1] + '</definedName>' : '')).join('');
    arquivos.push(['xl/workbook.xml', CABECALHO_XML + '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '">' +
      '<bookViews><workbookView activeTab="' + (entrada.ativa || 0) + '"/></bookViews>' +
      '<sheets>' + planilhas.map((p, i) => '<sheet name="' + esc(p.nome) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      (nomes ? '<definedNames>' + nomes + '</definedNames>' : '') + '</workbook>']);
    arquivos.push(['xl/_rels/workbook.xml.rels', CABECALHO_XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      planilhas.map((p, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (planilhas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>']);
    arquivos.push(['xl/styles.xml', estilos]);
    planilhas.forEach((p, i) => arquivos.push(['xl/worksheets/sheet' + (i + 1) + '.xml', planilhaXml(p, indice)]));

    const zip = XLSX.CFB.utils.cfb_new();
    const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s) : Buffer.from(s, 'utf8'));
    arquivos.forEach(([caminho, conteudo]) => XLSX.CFB.utils.cfb_add(zip, '/' + caminho, utf8(conteudo)));
    return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array', compression: true }));
  }

  return { gerar, coluna, FORMATOS };
});
