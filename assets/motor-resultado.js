/*
 * Conciliador Solutta — motor-resultado.js
 * CONCILIAÇÃO DAS CONTAS DE RESULTADO (Dony, 22 e 23/09/2026: "eu quero um botão que busque as despesas do
 * fornecedor que estejam em contas diferentes — o Adonias está em serviço de consultoria e o mesmo Adonias
 * está em serviços PJ; mostre e sugira o arquivo de importação para a reclassificação" e "ver dentro das
 * contas de resultado as distorções: fornecedores fora, pagamentos que podem ser de tributos ou coisa do
 * tipo em conta de resultado").
 *
 * Parte do LIVRO DIÁRIO (que tem os dois lados de cada lançamento) e do plano dos balancetes. Conta de
 * resultado = classe 3 (receitas) e 4 (despesas) do plano. Cinco achados, cada um com a sua lista:
 *
 *   1. mesmoFornecedorVariasContas — o mesmo fornecedor em duas ou mais contas de resultado. Sugere levar
 *      tudo para a conta onde está a maior parte (quem decide é quem lê; dá para escolher outra).
 *   2. pagamentoDireto — a despesa foi lançada direto contra BANCO ou CAIXA, sem passar por fornecedores,
 *      e esse mesmo fornecedor TEM conta no passivo de fornecedores ("fornecedores fora").
 *   3. cheiroDeTributo — o histórico é de tributo (DARF, DAS, GPS, INSS, FGTS, IRRF, PIS, COFINS, ISS…) mas
 *      a conta não é de tributo.
 *   4. ladoErrado — crédito em conta de despesa (ou débito em conta de receita) fora de estorno declarado:
 *      quase sempre é reclassificação feita pela metade.
 *   5. repetidos — mesmo fornecedor, mesma conta, mesmo valor e mesmo mês, mais de uma vez: pode ser dobra.
 *
 * Nada é decidido aqui: o motor mostra e explica. Quem lê marca o que quer e o programa monta o ARQUIVO DE
 * AJUSTES (o mesmo layout de importação dos outros passos), sempre com os dois lados e o histórico pronto.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./util.js'), require('./motor-nomes.js'), require('./motor-diario.js'));
  } else {
    raiz.MotorResultado = fabrica(raiz.Util, raiz.MotorNomes, raiz.MotorDiario);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, MotorNomes, MotorDiario) {
  'use strict';

  const SEM = MotorNomes.SEM_FORNECEDOR;
  // A classe da conta pelo plano: "04.2.1.03.020" -> 4. Serve para planos com e sem o zero na frente.
  function classe(conta) {
    const m = String(conta || '').match(/(\d+)/);
    return m ? String(Number(m[1])) : '';
  }
  const ehResultado = (c) => classe(c.conta) === '3' || classe(c.conta) === '4';
  // Conta REDUTORA ("(-) PIS sobre vendas", "(-) Devoluções"): na receita ela é debitada de propósito, e na
  // despesa é creditada — não é lado errado.
  const ehRedutora = (titulo) => /^\s*\(-\)/.test(String(titulo || ''));
  const ehDespesa = (c) => classe(c.conta) === '4';
  const ehBancoOuCaixa = (c) => /^0?1\.1\.1/.test(String(c.conta || '')) || /\b(caixa|banco|bancos|aplica)/i.test(String(c.titulo || ''));

  // Palavras que dizem "isto é tributo" no histórico.
  const TRIBUTOS = /\b(darf|das\b|d\.a\.s|gps\b|dae\b|guia de recolhimento|inss|fgts|irrf|irpj|csll|pis\b|cofins|iss\b|issqn|icms|ipi\b|iptu|ipva|simples nacional|difal|gnre|fgts digital|dctf|sefip)\b/i;
  // Conta que JÁ é de tributo (aí o histórico de tributo está no lugar certo).
  const CONTA_DE_TRIBUTO = /(imposto|tribut|inss|fgts|iss|issqn|icms|ipi\b|ipva|iptu|iof|pis|cofins|irrf|irpj|csll|simples|taxa|contribui|encargo|multa|juros|darf|guia)/i;
  // Conta de FOLHA: crédito nela contra o passivo trabalhista é rotina (desconto do funcionário, provisão que
  // vira obrigação) e não é distorção — fica de fora do 'lado errado'.
  const CONTA_DE_PESSOAL = /(sal[áa]rio|f[ée]rias|d[ée]cimo|13|aviso pr[ée]vio|rescis|indeniza|vale.?transporte|vale.?refei|vale.?alimenta|adiantamento de sal|pr[óo]-labore|pro.?labore|estagi|encargo)/i;
  // Estorno declarado: o crédito na despesa está explicado no próprio histórico.
  const ESTORNO = /(estorno|reclassifica|transfer[êe]ncia de saldo|baixa de provis|revers[ãa]o|apropria)/i;

  function nomeDaLinha(l) {
    const lido = MotorDiario.lerHistorico ? MotorDiario.lerHistorico(l.historico || '') : { fornecedor: '' };
    return { nome: (lido && lido.fornecedor) || '', nota: (lido && lido.nota) || '' };
  }

  /**
   * Analisa as contas de resultado de um período.
   * entrada: { diario, balancetes, de (AAAA-MM-DD, opcional), ate (AAAA-MM-DD, opcional), donos (opcional) }
   */
  function analisar(entrada) {
    const t0 = Date.now();
    const diario = entrada.diario;
    const plano = MotorDiario.planoDosBalancetes(entrada.balancetes || []);
    const comps = (diario.meses || []).map((m) => m.comp);
    const de = entrada.de && entrada.de > comps[0] ? entrada.de : comps[0];
    const ate = entrada.ate && entrada.ate < comps[comps.length - 1] ? entrada.ate : comps[comps.length - 1];
    const compDe = (l) => l.ano + '-' + String(l.mes).padStart(2, '0') + '-01';
    const dentro = (l) => { const comp = compDe(l); return comp >= de && comp <= ate; };
    const info = (red) => plano.get(String(red)) || { reduzido: String(red), conta: '', titulo: 'Conta ' + red, analitica: true };

    // ------------------------------------------------------------------
    // As linhas de resultado: cada lançamento do diário que toca uma conta 3 ou 4.
    // ------------------------------------------------------------------
    const linhas = [];
    (diario.lancamentos || []).forEach((l, i) => {
      if (!dentro(l)) return;
      const cD = info(l.debito), cC = info(l.credito);
      const data = Util.montarData(l.dia, l.mes, l.ano);
      [['D', cD, cC], ['C', cC, cD]].forEach(([lado, conta, contra]) => {
        if (!ehResultado(conta)) return;
        linhas.push({
          i: linhas.length, lancamento: i, lado, conta: conta.reduzido, contaNome: conta.titulo, contaClass: conta.conta,
          contra: contra.reduzido, contraNome: contra.titulo, contraClass: contra.conta, contraBanco: ehBancoOuCaixa(contra),
          data: data.texto, dia: data.numero, comp: compDe(l), valor: l.valor, historico: l.historico || '',
          despesa: ehDespesa(conta),
        });
      });
    });
    // O nome do fornecedor de cada linha, pela mesma régua dos outros passos.
    const paraRegua = linhas.map((x) => ({ digital: 'R' + x.i, conta: x.conta, dc: x.lado, dia: x.dia, debito: x.lado === 'D' ? x.valor : 0,
      credito: x.lado === 'C' ? x.valor : 0, historico: x.historico, fornecedorDeclarado: (function () { const n = nomeDaLinha(x); return n.nome ? { nome: n.nome, cnpj: '' } : null; })() }));
    const nomes = MotorNomes.resolver(paraRegua, { donos: entrada.donos || {} });
    linhas.forEach((x, k) => {
      const d = nomes.porLinha.get(paraRegua[k].digital);
      x.chave = d ? d.chave : SEM;
      x.nome = d ? d.nome : '';
      x.nota = nomeDaLinha(x).nota;
    });

    // ------------------------------------------------------------------
    // Resumo por conta e por fornecedor
    // ------------------------------------------------------------------
    const contas = new Map();
    linhas.forEach((x) => {
      if (!contas.has(x.conta)) contas.set(x.conta, { conta: x.conta, nome: x.contaNome, classificacao: x.contaClass, despesa: x.despesa, debito: 0, credito: 0, linhas: 0 });
      const c = contas.get(x.conta);
      if (x.lado === 'D') c.debito += x.valor; else c.credito += x.valor;
      c.linhas++;
    });
    const porFornecedor = new Map();
    linhas.forEach((x) => {
      if (x.chave === SEM) return;
      if (!porFornecedor.has(x.chave)) porFornecedor.set(x.chave, { chave: x.chave, nome: x.nome, total: 0, linhas: [], contas: new Map() });
      const f = porFornecedor.get(x.chave);
      f.total += x.lado === 'D' ? x.valor : -x.valor;
      f.linhas.push(x.i);
      if (!f.contas.has(x.conta)) f.contas.set(x.conta, { conta: x.conta, nome: x.contaNome, valor: 0, linhas: [] });
      const c = f.contas.get(x.conta);
      c.valor += x.lado === 'D' ? x.valor : -x.valor;
      c.linhas.push(x.i);
    });

    // 1. O MESMO FORNECEDOR EM VÁRIAS CONTAS DE RESULTADO
    const mesmoFornecedorVariasContas = [];
    porFornecedor.forEach((f) => {
      const contasDele = Array.from(f.contas.values()).filter((c) => c.valor !== 0 || c.linhas.length);
      if (contasDele.length < 2) return;
      const ordenadas = contasDele.slice().sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const principal = ordenadas[0];
      mesmoFornecedorVariasContas.push({
        chave: f.chave, nome: f.nome, total: f.total, qtdContas: ordenadas.length,
        contas: ordenadas, principal: principal.conta, principalNome: principal.nome,
        aLevar: ordenadas.slice(1).reduce((s, c) => s + c.valor, 0),
        linhas: ordenadas.slice(1).reduce((t, c) => t.concat(c.linhas), []),
      });
    });
    mesmoFornecedorVariasContas.sort((a, b) => Math.abs(b.aLevar) - Math.abs(a.aLevar) || b.qtdContas - a.qtdContas);

    // 2. PAGAMENTO DIRETO NA DESPESA (o fornecedor tem conta no passivo, mas a despesa foi contra o banco)
    const noPassivo = new Set();
    (diario.lancamentos || []).forEach((l) => {
      if (!dentro(l)) return;
      [l.debito, l.credito].forEach((red) => {
        const c = info(red);
        if (classe(c.conta) === '2' && /fornecedor/i.test(String(c.titulo || ''))) {
          const n = nomeDaLinha(l);
          if (n.nome) noPassivo.add(MotorNomes.limparNome(n.nome));
        }
      });
    });
    const pagamentoDireto = linhas.filter((x) => x.despesa && x.lado === 'D' && x.contraBanco && x.chave !== SEM &&
      noPassivo.has(MotorNomes.limparNome(x.nome)));

    // 3. CHEIRO DE TRIBUTO EM CONTA QUE NÃO É DE TRIBUTO
    const cheiroDeTributo = linhas.filter((x) => TRIBUTOS.test(x.historico) && !CONTA_DE_TRIBUTO.test(x.contaNome));

    // 4. LADO ERRADO (crédito em despesa / débito em receita) sem estorno declarado. Quando a contrapartida é
    // OUTRA conta de resultado, é rateio/reclassificação entre despesas (comum, e não é erro): vai para a lista
    // de rateio, à parte.
    const daContra = (x) => plano.get(String(x.contra)) || { conta: x.contraClass };
    const noResultado = (x) => ehResultado(daContra(x));
    const invertido = (x) => (x.despesa && x.lado === 'C') || (!x.despesa && x.lado === 'D');
    const daFolha = (x) => CONTA_DE_PESSOAL.test(x.contaNome) && classe(daContra(x).conta) === '2';
    const ladoErrado = linhas.filter((x) => invertido(x) && !ESTORNO.test(x.historico) && !noResultado(x) && !daFolha(x) && !ehRedutora(x.contaNome));
    const folha = linhas.filter((x) => invertido(x) && !noResultado(x) && daFolha(x));
    const rateio = linhas.filter((x) => invertido(x) && noResultado(x));

    // 5. REPETIDOS: mesmo fornecedor, conta, valor, lado e mês, mais de uma vez
    const grupos = new Map();
    linhas.forEach((x) => {
      if (x.chave === SEM) return;
      const k = x.chave + '|' + x.conta + '|' + x.lado + '|' + x.valor + '|' + x.comp;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(x.i);
    });
    const repetidos = [];
    grupos.forEach((idx, k) => {
      if (idx.length < 2) return;
      const x = linhas[idx[0]];
      repetidos.push({ chave: x.chave, nome: x.nome, conta: x.conta, contaNome: x.contaNome, valor: x.valor, lado: x.lado,
        comp: x.comp, vezes: idx.length, linhas: idx, k });
    });
    repetidos.sort((a, b) => (b.valor * b.vezes) - (a.valor * a.vezes));

    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    return {
      periodo: { de, ate }, plano, linhas,
      contas: Array.from(contas.values()).sort((a, b) => (b.debito + b.credito) - (a.debito + a.credito)),
      fornecedores: Array.from(porFornecedor.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
      achados: { mesmoFornecedorVariasContas, pagamentoDireto, cheiroDeTributo, ladoErrado, rateio, folha, repetidos },
      totais: {
        linhas: linhas.length,
        contas: contas.size,
        fornecedores: porFornecedor.size,
        semFornecedor: linhas.filter((x) => x.chave === SEM).length,
        debito: linhas.filter((x) => x.lado === 'D').reduce((s, x) => s + x.valor, 0),
        credito: linhas.filter((x) => x.lado === 'C').reduce((s, x) => s + x.valor, 0),
        variasContas: { qtd: mesmoFornecedorVariasContas.length, valor: mesmoFornecedorVariasContas.reduce((s, f) => s + Math.abs(f.aLevar), 0) },
        pagamentoDireto: { qtd: pagamentoDireto.length, valor: soma(pagamentoDireto) },
        cheiroDeTributo: { qtd: cheiroDeTributo.length, valor: soma(cheiroDeTributo) },
        ladoErrado: { qtd: ladoErrado.length, valor: soma(ladoErrado) },
        rateio: { qtd: rateio.length, valor: soma(rateio) },
        folha: { qtd: folha.length, valor: soma(folha) },
        repetidos: { qtd: repetidos.length, valor: repetidos.reduce((s, r) => s + r.valor * (r.vezes - 1), 0) },
      },
      ms: Date.now() - t0,
    };
  }

  /**
   * O arquivo de ajustes das reclassificações escolhidas.
   * escolhas: [{ linhas: [i], destino: '<conta>' }] — cada linha sai da conta onde está e vai para o destino.
   * Devolve os lançamentos no formato dos outros passos: { data, contaDebito, contaCredito, valor, historico, participante }.
   */
  function ajustesDe(r, escolhas) {
    const lancamentos = [];
    const porDestino = new Map();
    (escolhas || []).forEach((e) => {
      (e.linhas || []).forEach((i) => {
        const x = r.linhas[i];
        if (!x || !e.destino || String(e.destino) === String(x.conta)) return;
        const k = e.destino + '|' + x.conta + '|' + x.lado + '|' + x.chave + '|' + x.comp;
        if (!porDestino.has(k)) porDestino.set(k, { destino: String(e.destino), origem: x.conta, origemNome: x.contaNome, lado: x.lado,
          nome: x.nome, comp: x.comp, valor: 0, linhas: [] });
        const g = porDestino.get(k);
        g.valor += x.valor;
        g.linhas.push(i);
      });
    });
    porDestino.forEach((g) => {
      const destinoNome = (r.plano.get(g.destino) || {}).titulo || '';
      const fim = Util.fimDaCompetencia(g.comp);
      // Débito na despesa errada: tira de lá (crédito) e joga no destino (débito). No crédito é o contrário.
      const lanc = g.lado === 'D'
        ? { contaDebito: g.destino, contaCredito: g.origem }
        : { contaDebito: g.origem, contaCredito: g.destino };
      lancamentos.push(Object.assign({
        data: (fim && fim.texto) || '', valor: Math.abs(g.valor),
        historico: 'Reclassificacao de resultado - ' + (g.nome || 'sem fornecedor') + ' - de ' + g.origem + ' ' + g.origemNome + ' para ' + g.destino + ' ' + destinoNome,
        participante: '', linhas: g.linhas,
      }, lanc));
    });
    return lancamentos.filter((l) => l.valor !== 0).sort((a, b) => b.valor - a.valor);
  }

  return { analisar, ajustesDe, classe, ehResultado, ehDespesa, ehRedutora, TRIBUTOS, CONTA_DE_TRIBUTO, CONTA_DE_PESSOAL, ESTORNO };
});
