/*
 * Conciliador Solutta — ler-planilha.js
 * Abre .xls, .xlsx, .csv (e o que a SheetJS reconhecer) e devolve as abas como
 * linhas de células já limpas: número, texto ou data em "dd/mm/aaaa".
 * Faz os consertos das armadilhas de planilha da Parte 5.2:
 *  - .xls com a aba que abre vazia (registros fora do lugar / ponteiro da aba quebrado);
 *  - intervalo declarado (!ref) menor que os dados;
 *  - data como número de série, texto ou Date;
 *  - "Æ" no lugar de "ã" em algumas linhas.
 * Não reconhece o TIPO do arquivo (isso é dos leitores): só abre.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./xlsx.full.min.js'), require('./util.js'));
  else raiz.LerPlanilha = fabrica(raiz.XLSX, raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (XLSX, Util) {
  'use strict';

  function paraBytes(entrada) {
    if (entrada instanceof Uint8Array) return entrada;
    if (entrada instanceof ArrayBuffer) return new Uint8Array(entrada);
    if (entrada && entrada.buffer instanceof ArrayBuffer) return new Uint8Array(entrada.buffer, entrada.byteOffset, entrada.byteLength);
    // A biblioteca devolve o fluxo interno do .xls como lista comum de números no navegador.
    if (Array.isArray(entrada)) return Uint8Array.from(entrada);
    throw new Error('Conteúdo de arquivo em formato inesperado.');
  }

  function comeca(bytes, assinatura) {
    for (let i = 0; i < assinatura.length; i++) if (bytes[i] !== assinatura[i]) return false;
    return true;
  }

  // Tipo do recipiente pelo CONTEÚDO (nunca pelo nome: Parte 5.1).
  function recipiente(bytes) {
    if (comeca(bytes, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'ole';   // .xls antigo
    if (comeca(bytes, [0x50, 0x4B, 0x03, 0x04])) return 'zip';                            // .xlsx / .ods
    if (comeca(bytes, [0x09, 0x08]) || comeca(bytes, [0x09, 0x04]) || comeca(bytes, [0x09, 0x02])) return 'biff';
    let i = 0;
    if (comeca(bytes, [0xEF, 0xBB, 0xBF])) i = 3;
    while (i < bytes.length && i < 4096 && (bytes[i] === 0x20 || bytes[i] === 0x0A || bytes[i] === 0x0D || bytes[i] === 0x09)) i++;
    if (bytes[i] === 0x3C) return 'marcacao';                                               // HTML ou XML "disfarçado" de .xls
    return 'texto';
  }

  function decodificarTexto(bytes) {
    let inicio = 0;
    if (comeca(bytes, [0xEF, 0xBB, 0xBF])) inicio = 3;
    const corpo = bytes.subarray(inicio);
    try {
      return { texto: new TextDecoder('utf-8', { fatal: true }).decode(corpo), codificacao: 'UTF-8' };
    } catch (e) {
      return { texto: new TextDecoder('windows-1252').decode(corpo), codificacao: 'Windows-1252' };
    }
  }

  // ------------------------------------------------------------------
  // Conserto do .xls (BIFF8) cuja aba abre vazia.
  // Visto nos razões reais usados como modelo (set/2026): o sistema contábil grava milhares
  // de células EM BRANCO antes do início da aba, e o ponteiro da aba aponta para
  // elas. A biblioteca para de ler ao encontrar algo que não é início de aba, e a
  // aba vem vazia, calada. O conserto remonta o fluxo na ordem certa: blocos
  // globais, depois cada aba (com as células que estavam fora do lugar colocadas
  // dentro dela) e corrige o ponteiro de cada aba. Nenhum valor é descartado.
  // ------------------------------------------------------------------
  const BOF = [0x0009, 0x0209, 0x0409, 0x0809];
  const EOF = 0x000A;
  const BOUNDSHEET = 0x0085;

  function remontarBiff(fluxo) {
    const d = fluxo;
    const vista = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const regs = [];
    let p = 0;
    while (p + 4 <= d.length) {
      const tipo = vista.getUint16(p, true);
      const tam = vista.getUint16(p + 2, true);
      const fim = Math.min(d.length, p + 4 + tam);
      regs.push({ tipo, pedaco: d.subarray(p, fim) });
      p = fim;
    }
    const globais = [];
    const abas = [];
    let soltos = [];
    let fase = 'globais';
    let profundidade = 0;
    let atual = null;
    let movidos = 0;
    for (const r of regs) {
      if (fase === 'globais') {
        globais.push(r);
        if (BOF.indexOf(r.tipo) >= 0) profundidade++;
        if (r.tipo === EOF && --profundidade === 0) fase = 'abas';
        continue;
      }
      if (profundidade === 0) {
        if (BOF.indexOf(r.tipo) >= 0) {
          atual = { regs: [r], soltos: soltos };
          soltos = [];
          abas.push(atual);
          profundidade = 1;
        } else if (r.tipo !== 0) {
          soltos.push(r);
        }
        continue;
      }
      if (BOF.indexOf(r.tipo) >= 0) profundidade++;
      if (r.tipo === EOF) {
        profundidade--;
        if (profundidade === 0) {
          movidos += atual.soltos.length;
          atual.regs.push.apply(atual.regs, atual.soltos);
          atual.regs.push(r);
          continue;
        }
      }
      atual.regs.push(r);
    }
    if (!abas.length) return null;
    const tamanho = (lista) => lista.reduce((s, r) => s + r.pedaco.length, 0);
    let posicao = tamanho(globais);
    const posAbas = abas.map((a) => { const inicio = posicao; posicao += tamanho(a.regs); return inicio; });
    const novo = new Uint8Array(posicao);
    let q = 0;
    let k = 0;
    for (const r of globais) {
      novo.set(r.pedaco, q);
      if (r.tipo === BOUNDSHEET && k < posAbas.length && r.pedaco.length >= 8) {
        new DataView(novo.buffer).setUint32(q + 4, posAbas[k++], true);
      }
      q += r.pedaco.length;
    }
    for (const a of abas) for (const r of a.regs) { novo.set(r.pedaco, q); q += r.pedaco.length; }
    return { fluxo: novo, abas: abas.length, movidos };
  }

  function consertarXls(bytes, opcoes) {
    const cfb = XLSX.CFB.read(bytes, { type: 'buffer' });
    const ent = XLSX.CFB.find(cfb, 'Workbook') || XLSX.CFB.find(cfb, 'Book');
    if (!ent || !ent.content) return null;
    const r = remontarBiff(paraBytes(ent.content));
    if (!r) return null;
    const wb = XLSX.read(r.fluxo, opcoes);
    return { wb, movidos: r.movidos };
  }

  // ------------------------------------------------------------------
  // Leitura das células
  // ------------------------------------------------------------------
  function formatoDeData(celula) {
    if (!celula || !celula.z || typeof celula.z !== 'string') return false;
    try { return XLSX.SSF.is_date(celula.z); } catch (e) { return false; }
  }

  function valorDaCelula(celula, sistema1904) {
    if (!celula) return null;
    switch (celula.t) {
      case 'n': {
        if (formatoDeData(celula)) {
          const d = Util.dataDeSerie(celula.v, sistema1904);
          return d ? d.texto : celula.v;
        }
        return celula.v;
      }
      case 's':
      case 'str': {
        const s = Util.consertarAE(String(celula.v));
        return s.trim() === '' ? null : s;
      }
      case 'd': {
        const d = Util.lerData(celula.v);
        return d ? d.texto : null;
      }
      case 'b': return celula.v ? 'VERDADEIRO' : 'FALSO';
      case 'e': return null;
      case 'z': return null;
      default: return celula.v === undefined ? null : celula.v;
    }
  }

  // Parte 5.2: .xlsx que declara um intervalo (!ref) menor que os dados.
  // O intervalo é recalculado pelas células que EXISTEM.
  function linhasDaAba(aba, sistema1904) {
    const linhas = [];
    let maiorColuna = -1;
    if (Array.isArray(aba['!data'])) {
      aba['!data'].forEach((linha, r) => {
        if (!linha) return;
        linha.forEach((celula, c) => {
          const v = valorDaCelula(celula, sistema1904);
          if (v === null) return;
          (linhas[r] = linhas[r] || [])[c] = v;
          if (c > maiorColuna) maiorColuna = c;
        });
      });
    } else {
      for (const chave of Object.keys(aba)) {
        if (chave.charAt(0) === '!') continue;
        const pos = XLSX.utils.decode_cell(chave);
        const v = valorDaCelula(aba[chave], sistema1904);
        if (v === null) continue;
        (linhas[pos.r] = linhas[pos.r] || [])[pos.c] = v;
        if (pos.c > maiorColuna) maiorColuna = pos.c;
      }
    }
    // Preenche buracos com null (linhas em branco continuam existindo, com a posição certa).
    for (let r = 0; r < linhas.length; r++) {
      const l = linhas[r] || [];
      for (let c = 0; c <= maiorColuna; c++) if (l[c] === undefined) l[c] = null;
      linhas[r] = l;
    }
    return linhas;
  }

  /**
   * Abre um arquivo de planilha.
   * @param entrada bytes do arquivo (Uint8Array ou ArrayBuffer)
   * @returns { recipiente, abas: [{ nome, linhas }], avisos: [texto] }
   */
  function abrir(entrada) {
    const bytes = paraBytes(entrada);
    const avisos = [];
    const tipo = recipiente(bytes);
    const opcoes = { type: 'array', dense: true, cellNF: true, cellDates: false, cellHTML: false, cellFormula: false };
    let wb;
    let codificacao = null;
    try {
      if (tipo === 'texto') {
        const dec = decodificarTexto(bytes);
        codificacao = dec.codificacao;
        wb = XLSX.read(dec.texto, { type: 'string', raw: true, dense: true, cellDates: false });
      } else {
        wb = XLSX.read(bytes, opcoes);
      }
    } catch (e) {
      throw new Error('Não consegui abrir este arquivo como planilha (' + (e && e.message ? e.message : e) + '). ' +
        'Confira se ele abre no Excel e, se abrir, salve de novo como .xlsx e tente outra vez.');
    }
    const sistema1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);

    const faltando = wb.SheetNames.filter((n) => !wb.Sheets[n]);
    if (faltando.length && (tipo === 'ole' || tipo === 'biff')) {
      try {
        const consertado = tipo === 'ole' ? consertarXls(bytes, opcoes) : null;
        if (consertado && consertado.wb.SheetNames.some((n) => consertado.wb.Sheets[n])) {
          wb = consertado.wb;
          avisos.push('A planilha abria com a aba vazia (defeito comum em .xls exportado por sistema contábil). ' +
            'O programa remontou a leitura' + (consertado.movidos ? ' (' + consertado.movidos.toLocaleString('pt-BR') + ' células estavam fora do lugar)' : '') +
            ' e conferiu os totais abaixo.');
        }
      } catch (e) {
        avisos.push('A planilha abria com a aba vazia e o conserto automático falhou: ' + (e && e.message ? e.message : e));
      }
    }

    const abas = [];
    for (const nome of wb.SheetNames) {
      const aba = wb.Sheets[nome];
      if (!aba) {
        avisos.push('A aba "' + nome + '" não pôde ser lida (veio vazia). Abra o arquivo no Excel, salve como .xlsx e suba de novo.');
        continue;
      }
      abas.push({ nome, linhas: linhasDaAba(aba, sistema1904) });
    }
    return { recipiente: tipo, codificacao, abas, avisos };
  }

  return { abrir, recipiente, remontarBiff };
});
