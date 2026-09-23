/*
 * Conciliador Solutta — ler-diario.js
 * Dois jeitos de datar, e o leitor entende os dois (Dony, 23/09/2026): a DATA EM COLUNA, em cada linha, ou a
 * DATA EM LINHA PRÓPRIA antes dos lançamentos do dia (com "Total dia" e "Total mês" no meio, que são ignorados).
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
  // O cabeçalho: Histórico, Débito, Crédito e Valor, sem Saldo (no diário, Débito e Crédito são CONTAS).
  // A coluna DATA é opcional: há relatório que põe a data numa linha só dela, antes dos lançamentos do dia
  // (Dony, 23/09/2026, o diário da Felix). Sem a coluna, c.data fica -1 e a data vem da linha do dia.
  const OBRIGATORIAS = ['historico', 'debito', 'credito', 'valor'];
  function cabecalho(linha) {
    const ch = (linha || []).map(chave);
    if (ch.indexOf('saldo') >= 0) return null;
    const c = {};
    for (const k of OBRIGATORIAS) {
      const i = ch.findIndex((x) => NOMES[k].indexOf(x) >= 0);
      if (i < 0) return null;
      c[k] = i;
    }
    const iData = ch.findIndex((x) => NOMES.data.indexOf(x) >= 0);
    c.data = iData;
    c.semColunaDeData = iData < 0;
    return c;
  }

  // Linha que só traz a DATA DO DIA ("18/05/2026" e o resto vazio): dali para a frente, os lançamentos são
  // desse dia. É assim que alguns relatórios separam os dias em vez de repetir a data em cada linha.
  function dataDoDia(linha) {
    const cheias = (linha || []).map((x, i) => [i, x]).filter(([, x]) => !(x === null || x === undefined || String(x).trim() === ''));
    if (cheias.length !== 1) return null;
    const bruto = String(cheias[0][1]).trim();
    if (!/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(bruto)) return null;
    const d = Util.lerData(bruto);
    return d && d.valida !== false ? d : null;
  }
  // Linha de fechamento do relatório: total do dia, total do mês, transporte, página.
  const LINHA_DE_TOTAL = /^\s*(total|totais|transporte|soma|p[aá]gina|folha)\b/i;

  // A PARTIDA DE UMA LINHA (conta de débito, conta de crédito e valor).
  // Primeiro pelas colunas do cabeçalho. Quando não bate — há relatório que muda o número de colunas no meio
  // do arquivo (Dony, 23/09/2026: no diário da Felix, de agosto em diante some uma coluna) —, procura sozinho:
  // o VALOR é a última célula numérica com centavos ou a última preenchida; as contas são as células só de
  // dígitos antes dele. Com uma conta só (lançamento de várias linhas), o lado vem do deslocamento das colunas.
  function lerPartida(linha, c) {
    const l = linha || [];
    const direto = { debito: contaDe(l[c.debito]), credito: contaDe(l[c.credito]), valor: valorDe(l[c.valor]) };
    if (direto.valor !== null && (direto.debito || direto.credito)) return direto;
    // Onde está o valor: a última célula preenchida que dá número e não é código de conta puro.
    let iValor = -1;
    for (let k = l.length - 1; k >= 0; k--) {
      const x = l[k];
      if (x === null || x === undefined || String(x).trim() === '') continue;
      const v = valorDe(x);
      if (v === null) continue;
      const soDigitos = /^\d+$/.test(String(x).trim());
      if (soDigitos && iValor >= 0) break;     // já achei o valor: dígitos antes dele são contas
      if (soDigitos && k <= c.historico) break; // número no lugar do histórico não é valor
      iValor = k;
      break;
    }
    if (iValor < 0) return direto;
    const valor = valorDe(l[iValor]);
    const contas = [];
    for (let k = 0; k < iValor; k++) { const cc = contaDe(l[k]); if (cc) contas.push({ k, conta: cc }); }
    if (!contas.length) return { debito: '', credito: '', valor };
    if (contas.length >= 2) {
      const a = contas[contas.length - 2], b = contas[contas.length - 1];
      return { debito: a.conta, credito: b.conta, valor };
    }
    // Uma conta só: o lado vem do deslocamento entre a coluna do valor aqui e a do cabeçalho.
    const desloc = iValor - c.valor;
    const so = contas[0];
    const perto = (alvo) => Math.abs(so.k - (alvo + desloc));
    return perto(c.debito) <= perto(c.credito) ? { debito: so.conta, credito: '', valor } : { debito: '', credito: so.conta, valor };
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
      let boas = 0, vistas = 0, repetem = 0, comData = 0, diasSoltos = 0;
      for (const l of linhas.slice(r + 1, r + 80)) {
        if (!l || cabecalho(l)) continue;
        if (dataDoDia(l)) { diasSoltos++; continue; }
        const v = valorDe(l[c.valor]);
        if (v === null) continue;
        vistas++;
        if (contaDe(l[c.debito]) || contaDe(l[c.credito])) boas++;
        if (valorDe(l[c.debito]) === v || valorDe(l[c.credito]) === v) repetem++;
        if (c.data >= 0 && Util.lerData(l[c.data])) comData++;
      }
      if (!(vistas >= 3 && boas >= vistas * 0.9 && repetem < vistas * 0.5)) continue;
      // Sem coluna de data, a data tem que vir das linhas do dia; com a coluna, ela tem que estar preenchida.
      if (c.semColunaDeData ? diasSoltos < 1 : comData < 1) continue;
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
    const totaisDoDia = [];
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
        if (cab) {
          // Cabeçalho repetido no alto de cada página. Há relatório que, da segunda página em diante, põe a DATA
          // no lugar da palavra "Data" ("05/01/2026 | Histórico | … "): nesse caso o cabeçalho continua o mesmo
          // (não perde a coluna de data) e a data da linha vale para o que vem depois.
          if (c && cab.semColunaDeData && !c.semColunaDeData) {
            const dCab = Util.lerData(l[c.data]);
            if (dCab) data = dCab;
            ultima = null;
            continue;
          }
          c = cab;
          continue;
        }
        if (!c) continue;
        // A data do dia numa linha só dela (diário sem coluna de data).
        const doDia = dataDoDia(l);
        if (doDia) { data = doDia; ultima = null; continue; }
        // Total do dia, total do mês, transporte: não é lançamento — mas o TOTAL DO DIA é a conferência que o
        // próprio relatório imprime, e o programa usa para provar que leu certo (Dony, 23/09/2026).
        const primeira = l.find((x) => !vazio(x));
        if (primeira !== undefined && LINHA_DE_TOTAL.test(String(primeira))) {
          if (/total\s+(do\s+)?dia/i.test(String(primeira)) && data) {
            const numeros = l.map((x) => (vazio(x) || /^\s*(total|cre|deb)/i.test(String(x)) ? null : valorDe(x))).filter((x) => x !== null);
            if (numeros.length >= 2) totaisDoDia.push({ data: data.texto, debito: numeros[0], credito: numeros[numeros.length - 1] });
          }
          linhasIgnoradas++;
          ultima = null;
          continue;
        }
        const d = c.data >= 0 ? Util.lerData(l[c.data]) : null;
        const partida = lerPartida(l, c);
        const debito = partida.debito, credito = partida.credito;
        const v = partida.valor;
        // Linha só com texto no histórico, depois de uma partida: a continuação do histórico (o relatório quebra o
        // histórico longo em mais de uma linha). Junta com espaço.
        const hist = limparHistorico(l[c.historico]);
        if (ultima && hist && (c.data < 0 || vazio(l[c.data])) && l.every((x, k) => k === c.historico || vazio(x)) && !/^(di[aá]rio|empresa|total|transporte|p[aá]gina|folha)\b/i.test(hist)) {
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
    // CONFERÊNCIA COM O TOTAL DO DIA que o relatório imprime: cada dia lido tem que dar o mesmo número.
    const porDia = new Map();
    lancamentos.forEach((x) => { const a = porDia.get(x.data) || { debito: 0, credito: 0 }; if (x.debito) a.debito += x.valor; if (x.credito) a.credito += x.valor; porDia.set(x.data, a); });
    const diasConferidos = [];
    totaisDoDia.forEach((t) => {
      const lido = porDia.get(t.data) || { debito: 0, credito: 0 };
      diasConferidos.push({ data: t.data, impresso: t.debito, lido: lido.debito, confere: t.debito === lido.debito });
    });
    const diasQueNaoBatem = diasConferidos.filter((x) => !x.confere);
    if (diasQueNaoBatem.length) {
      avisos.push(diasQueNaoBatem.length + ' dia(s) não batem com o total impresso no relatório (' +
        diasQueNaoBatem.slice(0, 3).map((x) => x.data + ': lido ' + Util.formatarCentavos(x.lido) + ' × impresso ' + Util.formatarCentavos(x.impresso)).join('; ') + ').');
    }
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
      grupos, contas, totalDebitos, totalCreditos, confere: totalDebitos === totalCreditos && !abertosNoFim && !diasQueNaoBatem.length, avisos, linhasIgnoradas,
      diasConferidos: diasConferidos.length, diasQueNaoBatem: diasQueNaoBatem.length };
  }

  return { reconhecer, ler, cabecalho, contaDe };
});
