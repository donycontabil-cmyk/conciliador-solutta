/*
 * Conciliador Solutta — ler-diario.js
 * LIVRO DIÁRIO (Dony, 22/09/2026: "ao invés de subir razão por razão, eu quero a opção subir diário: quando eu subir o
 * diário, a conciliação de fornecedores já entende todos os lançamentos de fornecedores; a de clientes também; a de
 * resultado também — já vai estar tudo lá" + "o razão que você montar tem que ser exatamente o saldo inicial mais todos
 * os débitos e créditos daquela conta, e dar o saldo final que está no balancete").
 *
 * Desenho do sistema contábil do escritório (CSV com ";" em ANSI):
 *   "Diário Número 1 de 01/01/2026 até 31/01/2026 … Página: 1" / "Empresa: 9999 - NOME … CNPJ:00.000.000/0000-00"
 *   "Data;Histórico;;;;Débito;Crédito;Valor"
 *   "01/01/2026;Serviços tomados ref. NF nº 123 - NOME;;;;400;2000;150"
 * Cada linha é uma partida: a conta de DÉBITO e a de CRÉDITO pelo código REDUZIDO, e o valor. Um lançamento com várias
 * contas vem em linhas seguidas com um lado só ("400;;100" / ";2000;90" / ";300;10"), que somam zero. A data pode vir em
 * toda linha ou só na primeira do dia (as de baixo seguem a de cima); o cabeçalho da página se repete no meio (fica de
 * fora). Os NOMES das contas não vêm no diário: vêm do plano de contas (o balancete). Valores em CENTAVOS.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerDiario = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const chave = (v) => Util.semAcento(String(v === null || v === undefined ? '' : v)).toLowerCase().replace(/[^a-z]/g, '');
  // Nomes aceitos para cada coluna (sistemas diferentes chamam diferente).
  const NOMES = {
    data: ['data', 'datalancamento', 'dtlancamento', 'dtlanc', 'datadolancamento'],
    historico: ['historico', 'complemento', 'descricao', 'historicocomplemento'],
    debito: ['debito', 'contadebito', 'debitoconta', 'contadedebito', 'cdebito', 'ctadebito'],
    credito: ['credito', 'contacredito', 'creditoconta', 'contadecredito', 'ccredito', 'ctacredito'],
    valor: ['valor', 'valorlancamento', 'valordolancamento', 'vlr', 'valorr'],
  };
  // O cabeçalho: Data, Histórico, Débito, Crédito e Valor, sem Saldo (no diário, Débito e Crédito são CONTAS).
  function cabecalho(linha) {
    const ch = (linha || []).map(chave);
    if (ch.indexOf('saldo') >= 0) return null;
    const c = {};
    for (const k of Object.keys(NOMES)) {
      const i = ch.findIndex((x) => NOMES[k].indexOf(x) >= 0);
      if (i < 0) return null;
      c[k] = i;
    }
    return c;
  }
  // Código de conta (reduzido): só dígitos (a planilha pode trazer 400 como número inteiro; 12,50 não é conta).
  function contaDe(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v < 1e12 ? String(v) : '';
    const s = String(v).trim();
    return /^\d{1,12}$/.test(s) ? s.replace(/^0+(?=\d)/, '') : '';
  }
  function valorDe(v) {
    if (typeof v === 'number') return isFinite(v) ? Util.centavos(v) : null;
    const n = Util.paraNumero(v);
    return n === null ? null : Util.centavos(n);
  }

  // É um diário? O cabeçalho nas primeiras linhas e, embaixo, linhas com conta de débito e/ou de crédito e valor. Num
  // razão com colunas Débito, Crédito e Valor, o valor repete o débito ou o crédito: esse não é diário. E precisa do
  // título de livro diário (no começo do arquivo ou no nome dele): sem ele é uma planilha de lançamentos (importação,
  // reclassificação, depreciação), que o leitor geral continua sem tomar por diário. op: { nomeArquivo, semTitulo (aceita
  // sem o título: o arquivo foi posto no lugar do diário) }.
  function reconhecer(abas, op) {
    const opc = op || {};
    const tituloNoNome = /diario/i.test(Util.semAcento(String(opc.nomeArquivo || '')));
    for (const aba of abas || []) {
      const linhas = aba.linhas || [];
      const r = linhas.slice(0, 40).findIndex((l) => l && cabecalho(l));
      if (r < 0) continue;
      const c = cabecalho(linhas[r]);
      let boas = 0, vistas = 0, repetem = 0;
      for (const l of linhas.slice(r + 1, r + 80)) {
        if (!l || cabecalho(l)) continue;
        const v = valorDe(l[c.valor]);
        if (v === null) continue;
        vistas++;
        if (contaDe(l[c.debito]) || contaDe(l[c.credito])) boas++;
        if (valorDe(l[c.debito]) === v || valorDe(l[c.credito]) === v) repetem++;
      }
      if (!(vistas >= 3 && boas >= vistas * 0.9 && repetem < vistas * 0.5)) continue;
      const titulo = tituloNoNome || linhas.slice(0, r).some((l) => l && l.some((x) => /\bdiario\b/i.test(Util.semAcento(String(x === null || x === undefined ? '' : x)))));
      if (titulo || opc.semTitulo) return { tipo: 'diario', motivo: 'Livro diário: Data, Histórico, conta de Débito, conta de Crédito e Valor, uma partida por linha.' };
      return { tipo: null, semTitulo: true, motivo: 'Tem lançamentos com conta de débito, conta de crédito e valor, mas não o título de livro diário (planilha de lançamentos?).' };
    }
    return { tipo: null };
  }

  function ler(abas, opcoes) {
    const nomeArquivo = (opcoes && opcoes.nomeArquivo) || '';
    const avisos = [];
    const lancamentos = [];
    let empresa = '', cnpj = '', linhasIgnoradas = 0;
    const vazio = (x) => x === null || x === undefined || String(x).trim() === '';
    const limparHistorico = (x) => String(vazio(x) ? '' : x).replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
    for (const aba of abas || []) {
      const linhas = aba.linhas || [];
      let c = null, data = null, ultima = null;
      for (let r = 0; r < linhas.length; r++) {
        const l = linhas[r];
        if (!l) continue;
        const texto = l.map((x) => (x === null || x === undefined ? '' : String(x))).join(' ');
        if (!empresa) { const m = texto.match(/Empresa:\s*(?:\d+\s*-\s*)?(.+?)(?:\s{2,}|$)/); if (m) empresa = m[1].replace(/\s+/g, ' ').trim(); }
        if (!cnpj) { const m = texto.match(/CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i); if (m && Util.cnpjValido(Util.limparCnpj(m[1]))) cnpj = Util.limparCnpj(m[1]); }
        const cab = cabecalho(l);
        if (cab) { c = cab; continue; }
        if (!c) continue;
        const d = Util.lerData(l[c.data]);
        const debito = contaDe(l[c.debito]), credito = contaDe(l[c.credito]);
        const v = valorDe(l[c.valor]);
        // Linha só com texto no histórico, depois de uma partida: a continuação do histórico (o relatório quebra o
        // histórico longo em mais de uma linha). Junta com espaço.
        const hist = limparHistorico(l[c.historico]);
        if (ultima && hist && vazio(l[c.data]) && l.every((x, k) => k === c.historico || vazio(x)) && !/^(di[aá]rio|empresa|total|transporte|p[aá]gina|folha)\b/i.test(hist)) {
          ultima.historico = (ultima.historico + ' ' + hist).trim();
          continue;
        }
        // Linha sem conta ou sem valor: cabeçalho de página, total do dia, linha em branco.
        if (v === null || (!debito && !credito)) { linhasIgnoradas++; continue; }
        if (d) data = d;
        if (!data) { linhasIgnoradas++; continue; }
        // Valor negativo: inverte os lados (fica sempre positivo).
        const troca = v < 0;
        ultima = { n: lancamentos.length + 1, linha: r + 1, data: data.texto, dia: data.dia, mes: data.mes, ano: data.ano, historico: hist,
          debito: troca ? credito : debito, credito: troca ? debito : credito, valor: Math.abs(v) };
        lancamentos.push(ultima);
      }
    }
    // Os lançamentos: a linha com os dois lados é um lançamento; as linhas seguidas de um lado só formam um lançamento
    // quando a soma (débitos − créditos) volta a zero.
    let grupos = 0, aberto = null, abertosNoFim = 0;
    for (const x of lancamentos) {
      if (x.debito && x.credito) { x.grupo = ++grupos; continue; }
      if (!aberto) aberto = { id: ++grupos, soma: 0 };
      x.grupo = aberto.id;
      aberto.soma += x.debito ? x.valor : -x.valor;
      if (aberto.soma === 0) aberto = null;
    }
    if (aberto) { abertosNoFim = 1; avisos.push('O último lançamento de várias linhas não fecha (sobra ' + Util.formatarCentavos(aberto.soma) + ').'); }
    const totalDebitos = lancamentos.reduce((s, x) => s + (x.debito ? x.valor : 0), 0);
    const totalCreditos = lancamentos.reduce((s, x) => s + (x.credito ? x.valor : 0), 0);
    if (totalDebitos !== totalCreditos) avisos.push('Os débitos (' + Util.formatarCentavos(totalDebitos) + ') não batem com os créditos (' + Util.formatarCentavos(totalCreditos) + '): diferença de ' + Util.formatarCentavos(totalDebitos - totalCreditos) + '.');
    // O período: do primeiro dia do primeiro mês ao último dia do último mês com lançamento.
    let periodo = null;
    const meses = [];
    if (lancamentos.length) {
      const nums = lancamentos.map((x) => x.ano * 12 + x.mes);
      const a = Math.min.apply(null, nums), b = Math.max.apply(null, nums);
      const ano = (k) => Math.floor((k - 1) / 12), mes = (k) => ((k - 1) % 12) + 1;
      periodo = { de: '01/' + String(mes(a)).padStart(2, '0') + '/' + ano(a), ate: String(new Date(ano(b), mes(b), 0).getDate()).padStart(2, '0') + '/' + String(mes(b)).padStart(2, '0') + '/' + ano(b) };
      for (let k = a; k <= b; k++) {
        const doMes = lancamentos.filter((x) => x.ano * 12 + x.mes === k);
        meses.push({ comp: ano(k) + '-' + String(mes(k)).padStart(2, '0') + '-01', lancamentos: doMes.length });
      }
      const vazios = meses.filter((m) => !m.lancamentos).map((m) => Util.nomeCompetencia(m.comp));
      if (vazios.length) avisos.push('Sem lançamento em ' + vazios.join(', ') + ': confira se o diário está completo.');
    } else avisos.push('Não achei nenhum lançamento neste diário.');
    const contas = Array.from(new Set([].concat(...lancamentos.map((x) => [x.debito, x.credito])).filter(Boolean))).sort((x, y) => Number(x) - Number(y));
    return { tipo: 'diario', empresa, cnpj, nomeArquivo, periodo, meses, lancamentos, lancamentosDeVarias: lancamentos.filter((x) => !x.debito || !x.credito).length,
      grupos, contas, totalDebitos, totalCreditos, confere: totalDebitos === totalCreditos && !abertosNoFim, avisos, linhasIgnoradas };
  }

  return { reconhecer, ler, cabecalho, contaDe };
});
