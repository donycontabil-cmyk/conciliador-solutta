/*
 * Conciliador Solutta — motor-diario.js
 * O que o programa faz com o LIVRO DIÁRIO da empresa (Dony, 22/09/2026: "ao invés de subir razão por razão, subir o
 * diário: a conciliação de fornecedores já entende os lançamentos de fornecedores, a de clientes também, a de resultado
 * também" + "o razão que você montar tem que ser exatamente o saldo inicial mais todos os débitos e créditos daquela
 * conta, e dar o saldo final que está no balancete"):
 *  - o PLANO DE CONTAS pelo código reduzido (o diário só traz o código): vem dos balancetes da empresa;
 *  - a CONFERÊNCIA com cada balancete do período: em cada conta analítica, os débitos e os créditos do mês no diário são
 *    os do balancete, e o saldo anterior + débitos − créditos é o saldo do fim do mês;
 *  - o SALDO NO COMEÇO de cada conta: o saldo anterior do balancete do primeiro mês do diário; sem ele, o de qualquer
 *    balancete do período, menos o que o diário movimentou antes dele;
 *  - o RAZÃO DE UMA CONTA num período, no mesmo desenho do razão que os passos usam (conta, saldo anterior, lançamentos com
 *    a contrapartida, o fornecedor e a nota lidos do histórico, e o saldo corrido), conferido com o saldo do balancete;
 *  - as CONTAS DAS CONCILIAÇÕES pelo nome e pela classificação (fornecedores e adiantamentos, clientes, bancos).
 * Valores em CENTAVOS; saldos em débito − crédito (o credor é negativo), como no balancete.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), require('./ler-razao.js'), require('./familias.js'));
  else raiz.MotorDiario = fabrica(raiz.Util, raiz.LerRazao, raiz.Familias);
})(typeof self !== 'undefined' ? self : this, function (Util, LerRazao, Familias) {
  'use strict';

  const compDe = (x) => x.ano + '-' + String(x.mes).padStart(2, '0') + '-01';
  const classe = (conta) => String(conta || '').trim().replace(/^0+(?=\d)/, '').charAt(0);

  // ------------------------------------------------------------------
  // Plano de contas pelo código reduzido (de todos os balancetes; o nome do mais recente vale).
  // balancetes: [{ competencia, contas }]
  // ------------------------------------------------------------------
  function planoDosBalancetes(balancetes) {
    const plano = new Map();
    (balancetes || []).slice().sort((a, b) => String(a.competencia).localeCompare(String(b.competencia))).forEach((b) => {
      const contas = b.contas || [];
      const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
      contas.forEach((c) => {
        const red = String(c.reduzido || '').trim();
        if (!red) return;
        plano.set(red, { reduzido: red, conta: c.conta, titulo: c.titulo || '', nivel: c.nivel, pai: c.pai || '', analitica: !pais.has(c.conta) });
      });
    });
    return plano;
  }

  // Os movimentos de cada conta no diário: por mês (competência) e no total.
  // O que se calcula uma vez por diário (o mesmo diário serve várias contas na mesma tela).
  const GUARDADOS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function guardado(diario, chave, fazer) {
    if (!GUARDADOS || !diario || typeof diario !== 'object') return fazer();
    let g = GUARDADOS.get(diario);
    if (!g) { g = {}; GUARDADOS.set(diario, g); }
    if (!(chave in g)) g[chave] = fazer();
    return g[chave];
  }

  function movimentos(diario) { return guardado(diario, 'movimentos', () => calcularMovimentos(diario)); }
  function calcularMovimentos(diario) {
    const m = new Map();
    const somar = (conta, comp, d, c) => {
      if (!conta) return;
      let x = m.get(conta);
      if (!x) { x = { d: 0, c: 0, n: 0, porMes: new Map() }; m.set(conta, x); }
      x.d += d; x.c += c; x.n++;
      const pm = x.porMes.get(comp) || { d: 0, c: 0, n: 0 };
      pm.d += d; pm.c += c; pm.n++;
      x.porMes.set(comp, pm);
    };
    (diario.lancamentos || []).forEach((l) => { const comp = compDe(l); somar(l.debito, comp, l.valor, 0); somar(l.credito, comp, 0, l.valor); });
    return m;
  }

  // ------------------------------------------------------------------
  // CONFERÊNCIA com os balancetes: cada mês do diário com balancete, conta analítica por conta analítica.
  // ------------------------------------------------------------------
  function conferir(diario, balancetes) {
    const mov = movimentos(diario);
    const porComp = new Map((balancetes || []).map((b) => [String(b.competencia).slice(0, 10), b]));
    const meses = (diario.meses || []).map((m) => {
      const b = porComp.get(m.comp);
      if (!b) return { comp: m.comp, temBalancete: false, lancamentos: m.lancamentos };
      const contas = b.contas || [];
      const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
      const analiticas = contas.filter((c) => !pais.has(c.conta) && String(c.reduzido || '').trim());
      const noBalancete = new Set(analiticas.map((c) => String(c.reduzido).trim()));
      const divergencias = [];
      analiticas.forEach((c) => {
        const red = String(c.reduzido).trim();
        const x = (mov.get(red) && mov.get(red).porMes.get(m.comp)) || { d: 0, c: 0 };
        const saldo = c.saldoAnterior + x.d - x.c;
        if (x.d !== c.debitos || x.c !== c.creditos || saldo !== c.saldoAtual) {
          divergencias.push({ reduzido: red, conta: c.conta, titulo: c.titulo, balancete: { debitos: c.debitos, creditos: c.creditos, saldoAnterior: c.saldoAnterior, saldoAtual: c.saldoAtual },
            diario: { debitos: x.d, creditos: x.c, saldoFinal: saldo }, diferencaSaldo: saldo - c.saldoAtual });
        }
      });
      // Contas que o diário movimentou no mês e que o balancete não tem (conta nova ou código trocado).
      const semBalancete = [];
      mov.forEach((x, red) => { const pm = x.porMes.get(m.comp); if (pm && !noBalancete.has(red)) semBalancete.push({ reduzido: red, debitos: pm.d, creditos: pm.c }); });
      return { comp: m.comp, temBalancete: true, lancamentos: m.lancamentos, contas: analiticas.length, batem: analiticas.length - divergencias.length, divergencias, semBalancete };
    });
    const com = meses.filter((m) => m.temBalancete);
    return {
      meses,
      mesesComBalancete: com.length,
      contasConferidas: com.reduce((s, m) => s + m.contas, 0),
      divergencias: com.reduce((s, m) => s + m.divergencias.length + m.semBalancete.length, 0),
      confere: com.length > 0 && com.every((m) => !m.divergencias.length && !m.semBalancete.length),
    };
  }

  // ------------------------------------------------------------------
  // SALDO NO COMEÇO do diário (1º dia do 1º mês) de uma conta: o saldo anterior do balancete do 1º mês; sem ele, o do
  // primeiro balancete do período (ou do mês logo depois do diário) menos o que o diário movimentou antes dele.
  // ------------------------------------------------------------------
  function saldoNoComeco(diario, balancetes, reduzido, mov) {
    const red = String(reduzido);
    const mv = (mov || movimentos(diario)).get(red);
    const comps = (diario.meses || []).map((m) => m.comp);
    if (!comps.length) return { valor: null, origem: null };
    const depois = Util.somarMeses(comps[comps.length - 1], 1);
    const candidatos = (balancetes || []).filter((b) => { const c = String(b.competencia).slice(0, 10); return comps.indexOf(c) >= 0 || c === depois; })
      .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
    for (const b of candidatos) {
      const comp = String(b.competencia).slice(0, 10);
      const linha = (b.contas || []).find((c) => String(c.reduzido || '').trim() === red);
      // Balancete sem a conta: saldo zero nele (o balancete lista as contas com saldo ou movimento).
      const anterior = linha ? linha.saldoAnterior : 0;
      let antes = 0;
      if (mv) mv.porMes.forEach((x, c) => { if (c < comp) antes += x.d - x.c; });
      return { valor: anterior - antes, origem: comp === comps[0] ? 'balancete-do-mes' : 'balancete-de-' + comp, comp, contaNoBalancete: !!linha };
    }
    return { valor: null, origem: null };
  }

  // ------------------------------------------------------------------
  // O RAZÃO DE UMA CONTA tirado do diário, no desenho do razão que os passos usam.
  // op: { de (competência do começo; sem ela, o começo do diário), ate (competência do fim) }
  // ------------------------------------------------------------------
  function razaoDaConta(diario, balancetes, reduzido, op) {
    const red = String(reduzido);
    const opc = op || {};
    const plano = planoDosBalancetes(balancetes);
    const info = plano.get(red) || { reduzido: red, conta: '', titulo: '' };
    const mov = movimentos(diario);
    const comps = (diario.meses || []).map((m) => m.comp);
    const inicio = opc.de && opc.de > comps[0] ? opc.de : comps[0];
    const fim = opc.ate && opc.ate < comps[comps.length - 1] ? opc.ate : comps[comps.length - 1];
    const avisos = [];
    const sc = saldoNoComeco(diario, balancetes, red, mov);
    let saldoAnterior = sc.valor;
    if (saldoAnterior === null) { avisos.push('Sem balancete do período do diário: o saldo inicial da conta não é conhecido (ficou zero). Carregue o balancete de ' + Util.nomeCompetencia(comps[0]) + '.'); saldoAnterior = 0; }
    // O que o diário movimentou antes do começo do período escolhido entra no saldo anterior.
    const mv = mov.get(red);
    if (mv) mv.porMes.forEach((x, c) => { if (c < inicio) saldoAnterior += x.d - x.c; });
    // As partidas da conta no período, com a contrapartida (no lançamento de várias linhas, a conta do outro lado quando é
    // uma só).
    const porGrupo = guardado(diario, 'porGrupo', () => {
      const g = new Map();
      (diario.lancamentos || []).forEach((l) => { if (!g.has(l.grupo)) g.set(l.grupo, []); g.get(l.grupo).push(l); });
      return g;
    });
    const lancamentos = [];
    let saldo = saldoAnterior, totalDebito = 0, totalCredito = 0;
    (diario.lancamentos || []).forEach((l) => {
      const comp = compDe(l);
      if (comp < inicio || comp > fim) return;
      const lados = [];
      if (l.debito === red) lados.push('D');
      if (l.credito === red) lados.push('C');
      lados.forEach((lado) => {
        let contra = lado === 'D' ? l.credito : l.debito;
        let contras = contra ? [contra] : [];
        if (!contra) {
          contras = Array.from(new Set((porGrupo.get(l.grupo) || []).map((x) => (lado === 'D' ? x.credito : x.debito)).filter((c) => c && c !== red)));
          contra = contras.length === 1 ? contras[0] : '';
        }
        const debito = lado === 'D' ? l.valor : 0, credito = lado === 'C' ? l.valor : 0;
        saldo += debito - credito;
        totalDebito += debito; totalCredito += credito;
        const lido = LerRazao.lancamentoH(l.historico);
        const cnpj = LerRazao.cnpjDoTextoH(l.historico);
        const x = { data: l.data, dia: l.dia, mes: l.mes, ano: l.ano, numero: String(l.grupo), historico: l.historico, contrapartida: contra, contrapartidas: contras,
          documento: '', participante: '', debito, credito, saldo, fornecedor: lido.fornecedor || '', linhaDoDiario: l.linha };
        if (lido.nota) x.nota = lido.nota;
        if (cnpj) x.cnpj = cnpj;
        if (x.fornecedor || cnpj) x.fornecedorDeclarado = cnpj ? { nome: x.fornecedor, cnpj } : { nome: x.fornecedor };
        lancamentos.push(x);
      });
    });
    // O saldo do fim conferido com o balancete do último mês (quando ele está carregado).
    const bFim = (balancetes || []).find((b) => String(b.competencia).slice(0, 10) === fim);
    const linhaFim = bFim ? (bFim.contas || []).find((c) => String(c.reduzido || '').trim() === red) : null;
    const saldoFinalDeclarado = bFim ? (linhaFim ? linhaFim.saldoAtual : 0) : null;
    const confere = saldoFinalDeclarado === null ? null : saldoFinalDeclarado === saldo;
    if (confere === false) avisos.push('O saldo do fim pelo diário (' + Util.formatarCentavos(saldo) + ') não é o do balancete de ' + Util.nomeCompetencia(fim) + ' (' + Util.formatarCentavos(saldoFinalDeclarado) + ').');
    const conta = { codigo: red, classificacao: info.conta || '', nome: info.titulo || ('Conta ' + red), saldoAnterior, lancamentos, totalDebito, totalCredito,
      saldoFinal: saldo, saldoFinalDeclarado, confere: confere !== false, avisos };
    return { conta, periodo: { de: '01/' + inicio.slice(5, 7) + '/' + inicio.slice(0, 4), ate: Util.fimDaCompetencia(fim).texto }, inicio, fim, origemSaldo: sc.origem, confereComBalancete: confere };
  }

  // ------------------------------------------------------------------
  // As contas que as conciliações usam, pelo nome e pela classificação, no plano dos balancetes (só as analíticas do
  // balanço: fornecedores e adiantamento de clientes no passivo; adiantamento a fornecedores, clientes e bancos no ativo).
  // ------------------------------------------------------------------
  function contasDasConciliacoes(plano) {
    const lista = [];
    (plano instanceof Map ? plano : planoDosBalancetes(plano)).forEach((c) => {
      if (!c.analitica) return;
      const p = Familias.papelDaConta({ nome: c.titulo, classificacao: c.conta });
      if (!p.familia) return;
      const k = classe(c.conta);
      const noPassivo = (p.familia === 'fornecedores' && p.papel === 'principal') || (p.familia === 'clientes' && p.papel === 'adiantamento');
      if (noPassivo ? k !== '2' : k !== '1') return;
      lista.push({ reduzido: c.reduzido, conta: c.conta, titulo: c.titulo, familia: p.familia, papel: p.papel });
    });
    return lista.sort((a, b) => String(a.conta).localeCompare(String(b.conta)));
  }

  // ------------------------------------------------------------------
  // SALDOS DE TODAS AS CONTAS pelo diário: saldo no começo (do balancete), débitos, créditos e saldo no fim, conferido
  // com o balancete do último mês do diário quando ele está carregado.
  // ------------------------------------------------------------------
  function saldosDasContas(diario, balancetes) {
    const mov = movimentos(diario);
    const plano = planoDosBalancetes(balancetes);
    const comps = (diario.meses || []).map((m) => m.comp);
    const fim = comps[comps.length - 1];
    const bFim = (balancetes || []).find((b) => String(b.competencia).slice(0, 10) === fim);
    const noFim = new Map(bFim ? (bFim.contas || []).filter((c) => String(c.reduzido || '').trim()).map((c) => [String(c.reduzido).trim(), c]) : []);
    const codigos = new Set(Array.from(plano.values()).filter((c) => c.analitica).map((c) => c.reduzido));
    mov.forEach((x, red) => codigos.add(red));
    const lista = Array.from(codigos).map((red) => {
      const info = plano.get(red) || null;
      const x = mov.get(red) || { d: 0, c: 0, n: 0 };
      const sc = saldoNoComeco(diario, balancetes, red, mov);
      const saldoFinal = sc.valor === null ? null : sc.valor + x.d - x.c;
      const lb = noFim.get(red);
      const saldoBalancete = bFim ? (lb ? lb.saldoAtual : 0) : null;
      return { reduzido: red, conta: info ? info.conta : '', titulo: info ? info.titulo : '', noPlano: !!info, lancamentos: x.n, saldoInicial: sc.valor, debitos: x.d, creditos: x.c,
        saldoFinal, saldoBalancete, confere: saldoBalancete === null || saldoFinal === null ? null : saldoFinal === saldoBalancete };
    });
    lista.sort((a, b) => (a.conta && b.conta ? String(a.conta).localeCompare(String(b.conta)) : a.conta ? -1 : b.conta ? 1 : Number(a.reduzido) - Number(b.reduzido)));
    const conferidas = lista.filter((c) => c.confere !== null);
    return { contas: lista, fim, temBalanceteDoFim: !!bFim, conferidas: conferidas.length, batem: conferidas.filter((c) => c.confere).length,
      naoBatem: conferidas.filter((c) => !c.confere), semPlano: lista.filter((c) => !c.noPlano).length };
  }

  // O diário do jeito que fica guardado (sem o número de ordem, que é a posição na lista).
  function paraGuardar(d) {
    return { tipo: 'diario', empresa: d.empresa, cnpj: d.cnpj, nomeArquivo: d.nomeArquivo, periodo: d.periodo, meses: d.meses,
      lancamentos: (d.lancamentos || []).map((l) => ({ linha: l.linha, data: l.data, dia: l.dia, mes: l.mes, ano: l.ano, historico: l.historico, debito: l.debito, credito: l.credito, valor: l.valor, grupo: l.grupo })),
      grupos: d.grupos, contas: d.contas, lancamentosDeVarias: d.lancamentosDeVarias, totalDebitos: d.totalDebitos, totalCreditos: d.totalCreditos,
      confere: d.confere, avisos: d.avisos || [], linhasIgnoradas: d.linhasIgnoradas };
  }

  // Versão nova do diário × a anterior: os lançamentos que entraram e os que saíram (mesma data, histórico, contas e
  // valor), no desenho da comparação de razão (para a mesma janela de "ver o que mudou").
  function compararDiarios(antes, depois) {
    const linhas = (d) => {
      const vezes = new Map();
      return ((d && d.lancamentos) || []).map((l) => {
        const base = [l.data, String(l.historico || '').slice(0, 120), l.debito || '', l.credito || '', l.valor].join('|');
        const n = vezes.get(base) || 0;
        vezes.set(base, n + 1);
        return { chave: base + '|' + n, data: l.data, doc: (l.debito ? 'D ' + l.debito : '') + (l.debito && l.credito ? ' · ' : '') + (l.credito ? 'C ' + l.credito : ''),
          historico: l.historico || '', nome: '', valor: l.valor, debito: l.debito ? l.valor : 0, credito: l.credito ? l.valor : 0 };
      });
    };
    const la = linhas(antes), ld = linhas(depois);
    const ca = new Set(la.map((x) => x.chave)), cd = new Set(ld.map((x) => x.chave));
    const sairam = la.filter((x) => !cd.has(x.chave)), entraram = ld.filter((x) => !ca.has(x.chave));
    const soma = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
    return { tipo: 'razao', iguais: la.length - sairam.length, entraram, sairam, mudaram: [], qtdAntes: la.length, qtdDepois: ld.length,
      antes: { debitos: soma(la, 'debito'), creditos: soma(la, 'credito') }, depois: { debitos: soma(ld, 'debito'), creditos: soma(ld, 'credito') } };
  }

  // O razão em CSV (o "arquivo" guardado com o razão tirado do diário, para baixar e conferir fora).
  function csvDoRazao(r) {
    const c = r.conta;
    const v = (x) => Util.formatarCentavos(x || 0);
    const q = (s) => '"' + String(s || '').replace(/"/g, '""') + '"';
    const linhas = ['Razão tirado do diário;' + q(c.codigo + ' - ' + c.classificacao + ' - ' + c.nome) + ';' + r.periodo.de + ' a ' + r.periodo.ate,
      'Data;Lançamento;Histórico;Contrapartida;Débito;Crédito;Saldo', ';;Saldo anterior;;;;' + v(c.saldoAnterior)];
    c.lancamentos.forEach((l) => linhas.push([l.data, l.numero, q(l.historico), l.contrapartida || (l.contrapartidas || []).join(' '), l.debito ? v(l.debito) : '', l.credito ? v(l.credito) : '', v(l.saldo)].join(';')));
    linhas.push(';;Total;;' + v(c.totalDebito) + ';' + v(c.totalCredito) + ';' + v(c.saldoFinal));
    return linhas.join('\r\n');
  }

  return { planoDosBalancetes, movimentos, conferir, saldoNoComeco, razaoDaConta, contasDasConciliacoes, saldosDasContas, paraGuardar, compararDiarios, csvDoRazao };
});
