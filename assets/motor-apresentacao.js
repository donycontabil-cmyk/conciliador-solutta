/*
 * Conciliador Solutta — motor-apresentacao.js
 * RELATÓRIO DE APRESENTAÇÃO da empresa (Dony, 18/09/2026: "um relatório de apresentação dentro da
 * empresa; você vai seguir o mesmo layout que está no Excel, só que bonitinho no sistema, e vai ter um
 * lugar para eu importar os balancetes" — "dá conta de criar o Mensal e o Trimestral? E o LALUR
 * trimestral também").
 *
 * Motor puro: recebe os balancetes do ano (um por mês, lidos por ler-balancete.js) e a configuração da
 * empresa (ajustes do LALUR, conta do PAT, valores da Parte B) e devolve as peças do relatório, no desenho
 * da planilha modelo:
 *  - BASE: os balancetes um embaixo do outro. O VALOR USADO é o saldo final nas contas patrimoniais
 *    (1 e 2) e o movimento do mês (débitos − créditos) nas de resultado (3, 4, 5 e qualquer outra);
 *  - BALANCETE MENSAL e TRIMESTRAL, conta por conta (trimestre: saldo do último mês nas 1 e 2; soma dos
 *    meses nas demais), com AV % (sobre a conta-mãe) e AH % (sobre o período anterior);
 *  - DRE (CPC 51) MENSAL e TRIMESTRAL: as contas analíticas agrupadas pelo começo do código (MODELO_DRE),
 *    com os subtotais da planilha e o valor com o sinal do resultado (receita +, custo e despesa −);
 *    AV % sobre a receita líquida; AH % sobre o período anterior;
 *  - LALUR: ajustes (adições e exclusões por conta, com a regra dinâmica: movimento devedor = adição,
 *    credor = exclusão), incentivo PAT, Parte A trimestral (IRPJ e CSLL) e Parte B (o que quem usa informa);
 *  - RESUMO das contas de 1º nível.
 * Valores em CENTAVOS (no LALUR, com as frações das alíquotas: arredonda só na hora de mostrar);
 * AV/AH como fração (0,125 = 12,5 %) e null quando não dá para calcular (a planilha mostra vazio).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.MotorApresentacao = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  // ------------------------------------------------------------------
  // DRE (CPC 51): grupos pelo começo do código da conta, na ordem da planilha modelo. Linha com
  // `prefixos` = subtotal das contas analíticas que começam por um deles (o prefixo mais comprido
  // ganha); linha com `soma` (e `menos`) = conta feita com outras linhas.
  // ------------------------------------------------------------------
  const MODELO_DRE = [
    { categoria: 'Operacional', id: 'receitaBruta', rotulo: 'Receita bruta de vendas', prefixos: ['3.1.1'] },
    { categoria: 'Operacional', id: 'deducoes', rotulo: '(-) Devoluções, cancelamentos e tributos sobre vendas', prefixos: ['3.1.2'] },
    { categoria: 'Operacional', id: 'receitaLiquida', rotulo: 'Receita líquida', soma: ['receitaBruta', 'deducoes'], destaque: true },
    { categoria: 'Operacional', id: 'cmv', rotulo: '(-) Custo das mercadorias vendidas', prefixos: ['4.1'] },
    { categoria: 'Operacional', id: 'perdas', rotulo: '(-) Avarias, perdas e consumo de produtos', prefixos: ['4.9'] },
    { categoria: 'Operacional', id: 'lucroBruto', rotulo: 'Lucro bruto', soma: ['receitaLiquida', 'cmv', 'perdas'], destaque: true },
    { categoria: 'Operacional', id: 'outrasReceitas', rotulo: 'Outras receitas operacionais', prefixos: ['3.2'] },
    { categoria: 'Operacional', id: 'pessoal', rotulo: '(-) Despesas com pessoal', prefixos: ['5.1.1'] },
    { categoria: 'Operacional', id: 'servicos', rotulo: '(-) Serviços contratados', prefixos: ['5.1.2'] },
    { categoria: 'Operacional', id: 'utilidades', rotulo: '(-) Serviços públicos e utilidades', prefixos: ['5.1.3'] },
    { categoria: 'Operacional', id: 'ocupacao', rotulo: '(-) Ocupação', prefixos: ['5.1.4'] },
    { categoria: 'Operacional', id: 'viagens', rotulo: '(-) Viagens, representação e veículos', prefixos: ['5.1.5'] },
    { categoria: 'Operacional', id: 'logistica', rotulo: '(-) Entrega e logística', prefixos: ['5.1.6'] },
    // Linha nova (Dony, 18/09/2026, "resolve aí essa nova conta"): o grupo 5.1.7 do plano ("despesas com
    // provisões", ex.: perdas com créditos incobráveis), que entrou no balancete depois da planilha modelo.
    { categoria: 'Operacional', id: 'provisoes', rotulo: '(-) Despesas com provisões', prefixos: ['5.1.7'] },
    { categoria: 'Operacional', id: 'tributarias', rotulo: '(-) Despesas tributárias operacionais', prefixos: ['5.1.8'] },
    { categoria: 'Operacional', id: 'gerais', rotulo: '(-) Despesas gerais e não dedutíveis', prefixos: ['5.1.9'] },
    { categoria: 'Operacional', id: 'comerciais', rotulo: '(-) Despesas comerciais variáveis', prefixos: ['5.2.1'] },
    { categoria: 'Operacional', id: 'propaganda', rotulo: '(-) Propaganda, publicidade e promoção', prefixos: ['5.2.5'] },
    { categoria: 'Operacional', id: 'depreciacao', rotulo: '(-) Depreciação e amortização', prefixos: ['5.5'] },
    // Conta de resultado que nenhuma linha acima pega (conta nova no plano): entra aqui, com aviso, para a
    // DRE sempre fechar com o balancete. Sem conta assim, a linha nem aparece.
    { categoria: 'Operacional', id: 'semLinha', rotulo: '(-) Outras contas de resultado (sem linha no modelo)', prefixos: [], semLinha: true },
    { categoria: 'Operacional', id: 'lucroOperacional', rotulo: 'Lucro ou prejuízo operacional', destaque: true,
      soma: ['lucroBruto', 'outrasReceitas', 'pessoal', 'servicos', 'utilidades', 'ocupacao', 'viagens', 'logistica', 'provisoes', 'tributarias', 'gerais', 'comerciais', 'propaganda', 'depreciacao', 'semLinha'] },
    { categoria: 'Operacional', id: 'ebitda', rotulo: 'EBITDA gerencial', soma: ['lucroOperacional'], menos: ['depreciacao'] },
    { categoria: 'Investimentos', id: 'investimentos', rotulo: 'Resultado de investimentos e outros resultados não operacionais', prefixos: ['3.5'] },
    { categoria: 'Subtotal CPC 51', id: 'antesFinanciamento', rotulo: 'Lucro ou prejuízo antes de financiamento e tributos sobre o lucro', soma: ['lucroOperacional', 'investimentos'], destaque: true },
    { categoria: 'Financiamentos', id: 'receitasFinanceiras', rotulo: 'Receitas financeiras', prefixos: ['5.3.1.001', '5.3.2.002'] },
    { categoria: 'Financiamentos', id: 'despesasFinanceiras', rotulo: '(-) Despesas financeiras e encargos', prefixos: ['5.3.1.002', '5.3.2.001'] },
    { categoria: 'Financiamentos', id: 'resultadoFinanceiro', rotulo: 'Resultado de financiamentos', soma: ['receitasFinanceiras', 'despesasFinanceiras'] },
    { categoria: 'Subtotal', id: 'antesTributos', rotulo: 'Lucro ou prejuízo antes dos tributos sobre o lucro', soma: ['antesFinanciamento', 'resultadoFinanceiro'], destaque: true },
    { categoria: 'Tributos sobre o lucro', id: 'tributos', rotulo: '(-) IRPJ e CSLL', prefixos: ['5.9'] },
    { categoria: 'Resultado', id: 'lucroLiquido', rotulo: 'Lucro ou prejuízo líquido do período', soma: ['antesTributos', 'tributos'], destaque: true },
  ];
  // Contas de resultado que ficam fora da DRE de propósito (a planilha modelo também deixa).
  const FORA_DA_DRE = [{ prefixo: '4.2', motivo: 'compras e transferência para o estoque (no mês somam zero)' }];

  // ------------------------------------------------------------------
  // LALUR: alíquotas e regras da planilha modelo (aba Premissas) e os ajustes de exemplo.
  // ------------------------------------------------------------------
  const PARAMETROS = {
    irpj: 0.15, adicional: 0.10, limiteAdicionalMes: 2000000 /* R$ 20.000,00 por mês do período */, csll: 0.09,
    compensacao: 0.30, patPercentual: 0.15, patRedutor: 0.90, patLimite: 0.036,
  };
  // Ajustes do modelo (adições e exclusões por conta). regra: 'movimento' = débitos − créditos do mês
  // (positivo = adição, negativo = exclusão); 'aumento-credor' = exclusão do quanto o saldo credor de uma
  // conta patrimonial aumentou no mês (planilha: −MÁXIMO(0; −(saldo atual − saldo anterior))).
  const AJUSTES_MODELO = [
    { conta: '5.1.9.002.00399', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.2.5.002.00541', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.1.9.002.00400', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.1.9.003.00001', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.5.1.001.00709', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.3.1.002.00617', regra: 'movimento', tipo: 'adicao' },
    { conta: '5.1.9.003.00002', regra: 'movimento', tipo: 'adicao' },
    { conta: '2.1.1.005.00016', regra: 'aumento-credor', tipo: 'exclusao' },
  ];
  const CONTA_PAT_MODELO = '5.1.1.002.00126';
  const PREMISSAS = [
    ['CSLL', 'Alíquota padrão de 9% para pessoas jurídicas em geral', 'Receita Federal - CSLL', 'Usado no modelo', 'Validar se a empresa tem alíquota específica.'],
    ['IRPJ', 'Alíquota de 15% sobre o lucro real', 'Regra geral IRPJ lucro real', 'Usado no modelo', 'Validar com a escrituração fiscal.'],
    ['Adicional IRPJ', '10% sobre a parcela do lucro real que excede R$ 20.000 por mês, ou R$ 60.000 no trimestre', 'Regra geral IRPJ lucro real', 'Usado no modelo',
      'Apuração trimestral; no trimestre em andamento o limite é R$ 20.000 por mês já fechado.'],
    ['Compensação', 'Compensação de prejuízo fiscal/base negativa limitada a 30%, com os saldos informados na Parte B', 'Regra fiscal geral', 'Zerada por padrão', 'Preencher saldos disponíveis na Parte B.'],
    ['Ajustes', 'Adições e exclusões conforme as contas escolhidas na lista de ajustes', 'Lista de ajustes da empresa', 'Incluído', 'Validar documentação e natureza fiscal.'],
    ['PAT', 'Incentivo PAT calculado pelo menor entre 15% da despesa elegível x 90% e 3,6% do IRPJ principal', 'Consulta fiscal / regra informada pelo usuário + redutor de benefício em 2026',
      'Incluído no modelo', 'Validar inscrição no PAT e se a despesa da conta do PAT é integralmente elegível.'],
    ['Regra dinâmica resultado', 'Para contas de resultado 3, 4 e 5: movimento positivo/devedor = adição; movimento negativo/credor = exclusão', 'Critério definido pelo usuário nesta apuração',
      'Incluído no modelo', 'Uma conta de adição com movimento credor no trimestre vira exclusão.'],
    ['IR retido', 'IR retido informado na Parte B, abatido do IRPJ do trimestre', 'Informação do usuário', 'Aplicado', 'Abatimento após IRPJ total e antes do IRPJ líquido após PAT.'],
  ];

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  function mesDe(comp) { const p = Util.partesCompetencia(comp); return p ? p.mes : 0; }
  function anoDe(comp) { const p = Util.partesCompetencia(comp); return p ? p.ano : 0; }
  function rotuloMes(comp) { return NOMES_MES[mesDe(comp) - 1] + '/' + String(anoDe(comp)).slice(-2); }
  function classeDe(conta) { return String(conta).split('.')[0]; }
  function patrimonial(conta) { const c = classeDe(conta); return c === '1' || c === '2'; }
  // Ordem de conta: pedaço por pedaço, como número ("1.10" depois de "1.9").
  function compararContas(a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if (pa[i] === undefined) return -1;
      if (pb[i] === undefined) return 1;
      const d = Number(pa[i]) - Number(pb[i]);
      if (d) return d;
    }
    return 0;
  }
  function comeca(conta, prefixo) { return conta === prefixo || String(conta).indexOf(prefixo + '.') === 0; }
  const div = (a, b) => (a === null || b === null || b === undefined || !b ? null : a / b);
  const ah = (atual, anterior) => (atual === null || anterior === null || anterior === undefined || !anterior ? null : atual / anterior - 1);
  const somaDe = (xs) => { let s = 0, tem = false; for (const x of xs) if (x !== null && x !== undefined) { s += x; tem = true; } return tem ? s : null; };

  // Valor usado de uma linha do balancete: saldo final nas patrimoniais, movimento nas de resultado.
  function valorUsado(c) { return patrimonial(c.conta) ? c.saldoAtual : c.debitos - c.creditos; }

  // ------------------------------------------------------------------
  // Períodos: meses do ano (do começo do trimestre do primeiro balancete até o último) e trimestres.
  // ------------------------------------------------------------------
  function periodos(ano, porMes) {
    const carregados = Array.from(porMes.keys()).map(mesDe).sort((a, b) => a - b);
    if (!carregados.length) return { meses: [], trimestres: [] };
    const primeiro = Math.floor((carregados[0] - 1) / 3) * 3 + 1;
    const ultimo = carregados[carregados.length - 1];
    const meses = [];
    for (let m = primeiro; m <= ultimo; m++) {
      const comp = ano + '-' + String(m).padStart(2, '0') + '-01';
      meses.push({ comp, mes: m, rotulo: rotuloMes(comp), tem: porMes.has(comp), trimestre: Math.ceil(m / 3) });
    }
    const trimestres = [];
    for (const m of meses) {
      let t = trimestres.find((x) => x.n === m.trimestre);
      if (!t) { t = { n: m.trimestre, id: m.trimestre + 'T' + String(ano).slice(-2), meses: [] }; trimestres.push(t); }
      t.meses.push(m);
    }
    trimestres.forEach((t) => {
      t.carregados = t.meses.filter((m) => m.tem).length;
      t.parcial = t.meses.length < 3 || t.carregados < t.meses.length;
      t.emAndamento = t.meses.length < 3;
      t.rotulo = t.id + (t.parcial ? ' (parcial)' : '');
      t.faltam = t.meses.filter((m) => !m.tem).map((m) => m.rotulo);
    });
    return { meses, trimestres };
  }

  // ------------------------------------------------------------------
  // Montar o relatório
  // entrada: { ano, balancetes: [{ competencia, contas }], config: { ajustes, contaPAT, parteB: { '1T26': { prejuizoFiscal, baseNegativa, irRetido } } } }
  // ------------------------------------------------------------------
  function montar(entrada) {
    const ano = Number(entrada.ano);
    const cfg = entrada.config || {};
    const porMes = new Map();
    for (const b of entrada.balancetes || []) {
      if (!b || !b.competencia || anoDe(b.competencia) !== ano) continue;
      const mapa = new Map();
      (b.contas || []).forEach((c) => mapa.set(c.conta, c));
      porMes.set(Util.competenciaDe(Util.inicioDaCompetencia(b.competencia)), mapa);
    }
    const { meses, trimestres } = periodos(ano, porMes);

    // Plano de contas = todas as contas que aparecem em algum mês (título do mês mais recente).
    const plano = new Map();
    for (const m of meses) {
      const mapa = porMes.get(m.comp);
      if (!mapa) continue;
      mapa.forEach((c) => plano.set(c.conta, { conta: c.conta, reduzido: c.reduzido || '', titulo: c.titulo || '', nivel: c.nivel, pai: c.pai || '' }));
    }
    const contas = Array.from(plano.values()).sort((a, b) => compararContas(a.conta, b.conta));
    const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
    contas.forEach((c) => { c.analitica = !pais.has(c.conta); c.patrimonial = patrimonial(c.conta); });
    const indice = new Map(contas.map((c) => [c.conta, c]));

    // Valor usado por conta e mês (null no mês sem balancete; 0 na conta que não aparece no mês).
    const valor = (conta, m) => {
      const mapa = porMes.get(m.comp);
      if (!mapa) return null;
      const c = mapa.get(conta);
      return c ? valorUsado(c) : 0;
    };
    const linhaDoMes = (conta, m) => { const mapa = porMes.get(m.comp); return mapa ? mapa.get(conta) || null : null; };

    // ---------- Base normalizada
    const base = [];
    for (const m of meses) {
      const mapa = porMes.get(m.comp);
      if (!mapa) continue;
      Array.from(mapa.values()).sort((a, b) => compararContas(a.conta, b.conta)).forEach((c) => base.push({
        mes: m.rotulo, conta: c.conta, reduzido: c.reduzido || '', titulo: c.titulo || '', saldoAnterior: c.saldoAnterior, debitos: c.debitos,
        creditos: c.creditos, saldoAtual: c.saldoAtual, valor: valorUsado(c), criterio: patrimonial(c.conta) ? 'Saldo final' : 'Movimento do mês' }));
    }

    // ---------- Balancete mensal e trimestral
    const valorTrimestre = (conta, t) => {
      if (patrimonial(conta)) {
        const comSaldo = t.meses.filter((m) => m.tem);
        return comSaldo.length ? valor(conta, comSaldo[comSaldo.length - 1]) : null;
      }
      return somaDe(t.meses.map((m) => valor(conta, m)));
    };
    function tabelaDeContas(colunas, valorDe) {
      const valores = new Map(contas.map((c) => [c.conta, colunas.map((col) => valorDe(c.conta, col))]));
      return contas.map((c) => {
        const v = valores.get(c.conta);
        const vp = c.pai && valores.has(c.pai) ? valores.get(c.pai) : null;
        return Object.assign({}, c, {
          valores: v,
          av: v.map((x, k) => (c.nivel === 1 || !vp ? null : div(x, vp[k]))),
          ah: v.map((x, k) => (k === 0 ? null : ah(x, v[k - 1]))),
        });
      });
    }
    const mensal = { colunas: meses.map((m) => ({ id: m.comp, rotulo: m.rotulo, falta: !m.tem })), linhas: tabelaDeContas(meses, valor) };
    const trimestral = { colunas: trimestres.map((t) => ({ id: t.id, rotulo: t.rotulo, parcial: t.parcial })), linhas: tabelaDeContas(trimestres, valorTrimestre) };

    // ---------- DRE
    const gruposComPrefixo = MODELO_DRE.filter((g) => g.prefixos);
    const grupoDaConta = (conta) => {
      let melhor = null, tam = -1;
      for (const g of gruposComPrefixo) for (const p of g.prefixos) if (comeca(conta, p) && p.length > tam) { melhor = g; tam = p.length; }
      return melhor;
    };
    const analiticasDoGrupo = new Map(gruposComPrefixo.map((g) => [g.id, []]));
    const foraDaDre = [], naoMapeadas = [];
    for (const c of contas) {
      if (!c.analitica || c.patrimonial) continue;
      const g = grupoDaConta(c.conta);
      if (g) { analiticasDoGrupo.get(g.id).push(c); continue; }
      const fora = FORA_DA_DRE.find((f) => comeca(c.conta, f.prefixo));
      if (fora) { foraDaDre.push({ conta: c.conta, titulo: c.titulo, motivo: fora.motivo }); continue; }
      naoMapeadas.push({ conta: c.conta, titulo: c.titulo, motivo: 'nenhuma linha do modelo pega esta conta: foi para "Outras contas de resultado"' });
      analiticasDoGrupo.get('semLinha').push(c);
    }
    function dre(colunas, valorDe) {
      const linhas = [];
      const totais = new Map(); // id -> valores
      for (const g of MODELO_DRE) {
        let valores;
        if (g.prefixos) {
          const filhas = analiticasDoGrupo.get(g.id).map((c) => ({
            id: g.id + ':' + c.conta, grupo: g.id, categoria: g.categoria, tipo: 'analitica', rotulo: c.titulo, conta: c.conta,
            valores: colunas.map((col) => { const v = valorDe(c.conta, col); return v === null ? null : -v; }),
          }));
          valores = colunas.map((col, k) => somaDe(filhas.map((f) => f.valores[k])) || (colunas[k].falta ? null : 0));
          if (!(g.semLinha && !filhas.length)) {
            linhas.push({ id: g.id, categoria: g.categoria, tipo: 'grupo', rotulo: g.rotulo, valores, filhas: filhas.length, semLinha: !!g.semLinha });
            filhas.forEach((f) => linhas.push(f));
          }
        } else {
          valores = colunas.map((col, k) => {
            if (colunas[k].falta) return null;
            let s = 0;
            (g.soma || []).forEach((id) => { s += (totais.get(id) || [])[k] || 0; });
            (g.menos || []).forEach((id) => { s -= (totais.get(id) || [])[k] || 0; });
            return s;
          });
          linhas.push({ id: g.id, categoria: g.categoria, tipo: 'total', rotulo: g.rotulo, valores, destaque: !!g.destaque });
        }
        totais.set(g.id, valores);
      }
      const rl = totais.get('receitaLiquida');
      linhas.forEach((l) => {
        l.av = l.valores.map((v, k) => div(v, rl[k]));
        // O acumulado não tem "período anterior": AH vazio nele.
        l.ah = l.valores.map((v, k) => (k === 0 || colunas[k].acumulado ? null : ah(v, l.valores[k - 1])));
      });
      return { colunas: colunas.map((c) => ({ id: c.id || c.comp, rotulo: c.rotulo, falta: !!c.falta, parcial: !!c.parcial, acumulado: !!c.acumulado })), linhas, totais };
    }
    const colMeses = meses.map((m) => Object.assign({}, m, { id: m.comp, falta: !m.tem }));
    // DRE mensal com o ACUMULADO no fim, à direita (Dony, 18/09/2026: "um acumulado de janeiro até agosto;
    // quando tiver setembro, de janeiro a setembro"): a soma dos meses carregados, com AV % sobre a receita
    // líquida acumulada. Os meses continuam nas posições 0..n-1 (o LALUR e a conferência usam esse índice).
    const colAcumulado = meses.length ? [{ id: 'acumulado', rotulo: 'Acumulado ' + rotuloAcumulado(meses), acumulado: true }] : [];
    const dreMensal = dre(colMeses.concat(colAcumulado), (conta, col) => (col.acumulado ? somaDe(meses.map((m) => valor(conta, m))) : valor(conta, col)));
    const dreTrimestral = dre(trimestres, (conta, t) => valorTrimestre(conta, t));
    // Conferência: lucro da DRE × resultado do balancete (débitos − créditos das contas de 1º nível que não são 1 e 2).
    const conferencia = meses.filter((m) => m.tem).map((m) => {
      const mapa = porMes.get(m.comp);
      let resultado = 0;
      mapa.forEach((c) => { if (c.nivel === 1 && !patrimonial(c.conta)) resultado -= c.debitos - c.creditos; });
      const k = meses.indexOf(m);
      const lucro = dreMensal.totais.get('lucroLiquido')[k];
      const fora = foraDaDre.reduce((s, f) => s - (valor(f.conta, m) || 0), 0);
      return { mes: m.rotulo, lucroDre: lucro, resultadoBalancete: resultado, diferenca: resultado - lucro, fora };
    });

    // ---------- LALUR
    const lalur = montarLalur({ ano, meses, trimestres, porMes, valor, linhaDoMes, indice, dreMensal, cfg });

    // ---------- Resumo (contas de 1º nível)
    const primeiroNivel = contas.filter((c) => c.nivel === 1);
    const ultimoComSaldo = meses.filter((m) => m.tem).slice(-1)[0];
    const resumo = {
      colunas: meses.map((m) => ({ id: m.comp, rotulo: m.rotulo, falta: !m.tem }))
        .concat([{ id: 'acumulado', rotulo: rotuloAcumulado(meses), acumulado: true }])
        .concat(trimestres.map((t) => ({ id: t.id, rotulo: t.rotulo, trimestre: true }))),
      linhas: primeiroNivel.map((c) => ({
        conta: c.conta, titulo: c.titulo, patrimonial: c.patrimonial,
        valores: meses.map((m) => valor(c.conta, m))
          // Acumulado: soma dos meses nas de resultado; saldo do último mês nas patrimoniais (somar saldos de
          // meses diferentes não dá um número que signifique alguma coisa).
          .concat([c.patrimonial ? (ultimoComSaldo ? valor(c.conta, ultimoComSaldo) : null) : somaDe(meses.map((m) => valor(c.conta, m)))])
          .concat(trimestres.map((t) => valorTrimestre(c.conta, t))),
      })),
    };

    const avisos = [];
    const faltando = meses.filter((m) => !m.tem).map((m) => m.rotulo);
    if (faltando.length) avisos.push('Falta o balancete de ' + faltando.join(', ') + ': esses meses ficam vazios e os trimestres deles ficam parciais.');
    if (naoMapeadas.length) avisos.push(naoMapeadas.length + ' conta(s) de resultado sem linha no modelo da DRE entraram em "Outras contas de resultado" (' +
      naoMapeadas.slice(0, 3).map((n) => n.conta + ' ' + n.titulo).join('; ') + (naoMapeadas.length > 3 ? '; …' : '') + ').');
    conferencia.filter((c) => c.diferenca).forEach((c) => avisos.push('Em ' + c.mes + ' o lucro da DRE difere do resultado do balancete em ' + Util.formatarCentavos(c.diferenca) + ' (contas fora da DRE).'));

    return { ano, meses, trimestres, contas, base, mensal, trimestral, dre: { mensal: dreMensal, trimestral: dreTrimestral, foraDaDre, naoMapeadas, conferencia },
      lalur, resumo, avisos, faltando };
  }

  function rotuloAcumulado(meses) {
    if (!meses.length) return 'Acumulado';
    return NOMES_MES[meses[0].mes - 1] + '–' + NOMES_MES[meses[meses.length - 1].mes - 1];
  }

  // ------------------------------------------------------------------
  // LALUR
  // ------------------------------------------------------------------
  function montarLalur(x) {
    const { meses, trimestres, valor, linhaDoMes, indice, dreMensal, cfg } = x;
    const P = Object.assign({}, PARAMETROS, cfg.parametros || {});
    const ajustesCfg = Array.isArray(cfg.ajustes) ? cfg.ajustes : AJUSTES_MODELO;
    const contaPAT = cfg.contaPAT === undefined ? CONTA_PAT_MODELO : cfg.contaPAT;
    const parteB = cfg.parteB || {};

    // Valor do ajuste de uma conta num mês (positivo = adição, negativo = exclusão).
    const ajusteNoMes = (a, m) => {
      if (!m.tem) return null;
      if (a.regra === 'aumento-credor') {
        const l = linhaDoMes(a.conta, m);
        if (!l) return 0;
        return -Math.max(0, l.saldoAnterior - l.saldoAtual);
      }
      return valor(a.conta, m) || 0;
    };
    // Colunas dos ajustes: os meses e, depois dos meses de cada trimestre, o total do trimestre
    // (no trimestre em andamento com um mês só, o total seria igual ao mês: fica de fora, como na planilha).
    const colunasAjustes = [];
    trimestres.forEach((t) => {
      t.meses.forEach((m) => colunasAjustes.push({ id: m.comp, rotulo: m.rotulo, mes: m, falta: !m.tem }));
      if (t.meses.length > 1) colunasAjustes.push({ id: t.id, rotulo: t.rotulo, trimestre: t });
    });
    const ajustes = ajustesCfg.map((a) => {
      const c = indice.get(a.conta);
      const porMes = new Map(meses.map((m) => [m.comp, ajusteNoMes(a, m)]));
      const valores = colunasAjustes.map((col) => (col.mes ? porMes.get(col.mes.comp) : somaDe(col.trimestre.meses.map((m) => porMes.get(m.comp)))));
      return { conta: a.conta, tipo: a.tipo === 'exclusao' ? 'Exclusão' : 'Adição', regra: a.regra, titulo: c ? c.titulo : (a.descricao || ''), noBalancete: !!c, valores, porMes };
    });
    const totalPositivo = (k) => ajustes.reduce((s, a) => s + Math.max(0, a.valores[k] || 0), 0);
    const totalNegativo = (k) => ajustes.reduce((s, a) => s + Math.max(0, -(a.valores[k] || 0)), 0);
    const adicoesCol = colunasAjustes.map((c, k) => totalPositivo(k));
    const exclusoesCol = colunasAjustes.map((c, k) => totalNegativo(k));
    // Adições e exclusões de um trimestre: pelo total do trimestre de cada conta (planilha: SOMASE no total).
    const adicoesDoTrimestre = (t) => ajustes.reduce((s, a) => s + Math.max(0, somaDe(t.meses.map((m) => a.porMes.get(m.comp))) || 0), 0);
    const exclusoesDoTrimestre = (t) => ajustes.reduce((s, a) => s + Math.max(0, -(somaDe(t.meses.map((m) => a.porMes.get(m.comp))) || 0)), 0);

    // PAT
    const patMes = (m) => (m.tem ? Math.abs(valor(contaPAT, m) || 0) : null);
    const lucroMes = (m) => { const k = meses.indexOf(m); return dreMensal.totais.get('antesTributos')[k] || 0; };

    // Parte A por trimestre.
    const porTrimestre = trimestres.map((t) => {
      const b = parteB[t.id] || {};
      const lucroContabil = t.meses.reduce((s, m) => s + (m.tem ? lucroMes(m) : 0), 0);
      const adicoes = adicoesDoTrimestre(t), exclusoes = exclusoesDoTrimestre(t);
      const lrAntes = lucroContabil + adicoes - exclusoes;
      const compPrejuizo = Math.min(Math.max(0, lrAntes * P.compensacao), Number(b.prejuizoFiscal) || 0);
      const lrIrpj = Math.max(0, lrAntes - compPrejuizo);
      const irpj15 = lrIrpj * P.irpj;
      const mesesDoPeriodo = t.emAndamento ? t.carregados : 3;
      const adicional = Math.max(0, lrIrpj - P.limiteAdicionalMes * mesesDoPeriodo) * P.adicional;
      const irpjTotal = irpj15 + adicional;
      const irRetido = Number(b.irRetido) || 0;
      const compBaseNegativa = Math.min(Math.max(0, lrAntes * P.compensacao), Number(b.baseNegativa) || 0);
      const baseCsll = Math.max(0, lrAntes - compBaseNegativa);
      const csll = baseCsll * P.csll;
      const estimado = irpjTotal + csll - irRetido;
      const patDespesa = t.meses.reduce((s, m) => s + (patMes(m) || 0), 0);
      const patPotencial = patDespesa * P.patPercentual * P.patRedutor;
      const patLimite = irpj15 * P.patLimite;
      const patAproveitavel = Math.min(patPotencial, patLimite);
      const irpjLiquido = Math.max(0, irpjTotal - irRetido - patAproveitavel);
      return { t, lucroContabil, adicoes, exclusoes, lrAntes, compPrejuizo, lrIrpj, irpj15, adicional, irpjTotal, irRetido, compBaseNegativa, baseCsll, csll, estimado,
        patDespesa, patPotencial, patLimite, patAproveitavel, irpjLiquido, total: irpjLiquido + csll, mesesDoPeriodo };
    });
    const CAMPOS = ['lucroContabil', 'adicoes', 'exclusoes', 'lrAntes', 'compPrejuizo', 'lrIrpj', 'irpj15', 'adicional', 'irpjTotal', 'irRetido', 'compBaseNegativa',
      'baseCsll', 'csll', 'estimado', 'patDespesa', 'patPotencial', 'patLimite', 'patAproveitavel', 'irpjLiquido', 'total'];
    const somar = (lista) => { const r = {}; CAMPOS.forEach((c) => { r[c] = lista.reduce((s, x) => s + x[c], 0); }); return r; };
    // Colunas da Parte A: cada trimestre; depois do 2º (e do 4º) FECHADO, o semestre; no fim, o acumulado
    // (se não for igual ao semestre que acabou de sair).
    const colunasParteA = [];
    porTrimestre.forEach((q) => {
      colunasParteA.push(Object.assign({ id: q.t.id, rotulo: q.t.emAndamento ? q.t.rotulo + ' · ' + q.t.meses.filter((m) => m.tem).map((m) => m.rotulo).join(', ') : q.t.rotulo, trimestre: q.t }, q));
      if ((q.t.n === 2 || q.t.n === 4) && !q.t.emAndamento) {
        const doSemestre = porTrimestre.filter((y) => (q.t.n === 2 ? y.t.n <= 2 : y.t.n >= 3 && y.t.n <= 4));
        if (doSemestre.length > 1) colunasParteA.push(Object.assign({ id: 'S' + (q.t.n / 2), rotulo: q.t.n === 2 ? 'Jan–Jun' : 'Jul–Dez', soma: true, cobre: doSemestre.length }, somar(doSemestre)));
      }
    });
    const ultima = colunasParteA[colunasParteA.length - 1];
    if (porTrimestre.length > 1 && !(ultima && ultima.soma && ultima.cobre === porTrimestre.length)) {
      colunasParteA.push(Object.assign({ id: 'acumulado', rotulo: rotuloAcumulado(meses), soma: true, acumulado: true }, somar(porTrimestre)));
    }
    const LINHAS_A = [
      ['Resultado contábil', 'Lucro contábil antes do IRPJ/CSLL', 'lucroContabil'],
      ['Ajustes fiscais', '(+) Total das Adições Dinâmicas', 'adicoes'],
      ['Ajustes fiscais', '(-) Total das Exclusões Dinâmicas', 'exclusoes'],
      ['Base fiscal', 'Lucro Real antes da compensação', 'lrAntes', true],
      ['Compensação', '(-) Compensação prejuízo fiscal IRPJ', 'compPrejuizo'],
      ['Base fiscal', 'Lucro Real IRPJ', 'lrIrpj', true],
      ['IRPJ', 'IRPJ 15%', 'irpj15'],
      ['IRPJ', 'Adicional IRPJ 10%', 'adicional'],
      ['IRPJ', 'IRPJ Total', 'irpjTotal', true],
      ['IRPJ', '(-) IR retido utilizado', 'irRetido'],
      ['Compensação', '(-) Compensação base negativa CSLL', 'compBaseNegativa'],
      ['Base fiscal', 'Base de cálculo CSLL', 'baseCsll', true],
      ['CSLL', 'CSLL 9%', 'csll', true],
      ['Resumo', 'IRPJ + CSLL estimado', 'estimado', true],
      ['Incentivo fiscal', 'Despesa PAT elegível', 'patDespesa'],
      ['Incentivo fiscal', 'Incentivo PAT potencial', 'patPotencial'],
      ['Incentivo fiscal', 'Limite PAT 3,6% IRPJ principal', 'patLimite'],
      ['Incentivo fiscal', '(-) Incentivo PAT aproveitável', 'patAproveitavel'],
      ['Resumo', 'IRPJ líquido após PAT', 'irpjLiquido', true],
      ['Resumo', 'IRPJ + CSLL líquido após PAT', 'total', true],
    ];
    const parteA = {
      colunas: colunasParteA.map((c) => ({ id: c.id, rotulo: c.rotulo, soma: !!c.soma, parcial: !!(c.trimestre && c.trimestre.parcial) })),
      linhas: LINHAS_A.map(([bloco, rotulo, campo, destaque]) => ({ bloco, rotulo, campo, destaque: !!destaque, valores: colunasParteA.map((c) => c[campo]) })),
    };

    // PAT (tabela própria): os meses, os trimestres, o semestre e o acumulado.
    const colunasPat = meses.map((m) => ({ id: m.comp, rotulo: m.rotulo, mes: m, falta: !m.tem })).concat(colunasParteA.map((c) => ({ id: c.id, rotulo: c.rotulo, lalur: c })));
    const pat = {
      conta: contaPAT, titulo: indice.get(contaPAT) ? indice.get(contaPAT).titulo : '', noBalancete: !!indice.get(contaPAT),
      colunas: colunasPat.map((c) => ({ id: c.id, rotulo: c.rotulo, falta: !!c.falta, lalur: !!c.lalur })),
      linhas: [
        ['A', 'Despesa PAT elegível - conta ' + contaPAT, (c) => (c.mes ? patMes(c.mes) : c.lalur.patDespesa)],
        ['B', 'Incentivo potencial PAT = despesa elegível x 15% x 90%', (c) => (c.mes ? (patMes(c.mes) === null ? null : patMes(c.mes) * P.patPercentual * P.patRedutor) : c.lalur.patPotencial)],
        ['C', 'Limite PAT = 3,6% do IRPJ principal (15%)', (c) => (c.mes ? null : c.lalur.patLimite)],
        ['D', 'Incentivo PAT aproveitável = menor entre B e C', (c) => (c.mes ? null : c.lalur.patAproveitavel)],
      ].map(([letra, rotulo, f]) => ({ letra, rotulo, valores: colunasPat.map(f) })),
    };

    // Parte B: o que quem usa informa (por trimestre) e as compensações que a Parte A fez.
    const colunasB = porTrimestre.map((q) => ({ id: q.t.id, rotulo: q.t.rotulo, q }));
    const parteBTabela = {
      colunas: colunasB.map((c) => ({ id: c.id, rotulo: c.rotulo })),
      linhas: [
        { campo: 'prejuizoFiscal', rotulo: 'Prejuízo fiscal acumulado disponível IRPJ', editavel: true, obs: 'Informar o saldo disponível para compensação', valores: colunasB.map((c) => Number((parteB[c.id] || {}).prejuizoFiscal) || 0) },
        { campo: 'baseNegativa', rotulo: 'Base negativa acumulada disponível CSLL', editavel: true, obs: 'Informar o saldo disponível para compensação', valores: colunasB.map((c) => Number((parteB[c.id] || {}).baseNegativa) || 0) },
        { campo: 'compPrejuizo', rotulo: 'Compensação efetiva IRPJ', obs: 'Limitada na Parte A pelo menor entre o saldo disponível e 30% do lucro real antes da compensação', valores: colunasB.map((c) => c.q.compPrejuizo) },
        { campo: 'compBaseNegativa', rotulo: 'Compensação efetiva CSLL', obs: 'Limitada na Parte A pelo menor entre o saldo disponível e 30% da base antes da compensação', valores: colunasB.map((c) => c.q.compBaseNegativa) },
        { campo: 'irRetido', rotulo: 'IR retido utilizado', editavel: true, obs: 'Informado por quem usa para abatimento do IRPJ do trimestre', valores: colunasB.map((c) => Number((parteB[c.id] || {}).irRetido) || 0) },
      ],
    };

    return {
      parametros: P, contaPAT,
      ajustes: { colunas: colunasAjustes.map((c) => ({ id: c.id, rotulo: c.rotulo, trimestre: !!c.trimestre, falta: !!c.falta })), linhas: ajustes, adicoes: adicoesCol, exclusoes: exclusoesCol },
      pat, parteA, parteB: parteBTabela, premissas: PREMISSAS, porTrimestre,
      ajustesSemConta: ajustes.filter((a) => !a.noBalancete).map((a) => a.conta),
    };
  }

  // ------------------------------------------------------------------
  // Versões de um balancete: contas que entraram, saíram e mudaram (mesmo formato do compararVersoes
  // do razão e do aging: entraram e saíram trazem também as que mudaram).
  // ------------------------------------------------------------------
  function compararBalancetes(antes, depois) {
    const la = ((antes && antes.contas) || []), ld = ((depois && depois.contas) || []);
    const ma = new Map(la.map((c) => [c.conta, c])), md = new Map(ld.map((c) => [c.conta, c]));
    const igual = (a, b) => a.saldoAnterior === b.saldoAnterior && a.debitos === b.debitos && a.creditos === b.creditos && a.saldoAtual === b.saldoAtual;
    const sairam = la.filter((c) => !md.has(c.conta) || !igual(c, md.get(c.conta)));
    const entraram = ld.filter((c) => !ma.has(c.conta) || !igual(ma.get(c.conta), c));
    const mudaram = ld.filter((c) => ma.has(c.conta) && !igual(ma.get(c.conta), c)).map((c) => {
      const a = ma.get(c.conta);
      const campos = [['saldoAnterior', 'saldo anterior'], ['debitos', 'débitos'], ['creditos', 'créditos'], ['saldoAtual', 'saldo atual']].filter(([k]) => a[k] !== c[k]).map(([, n]) => n);
      return { antes: a, depois: c, campos };
    });
    const totais = (xs) => ({ debitos: xs.filter((c) => c.nivel === 1).reduce((s, c) => s + c.debitos, 0), creditos: xs.filter((c) => c.nivel === 1).reduce((s, c) => s + c.creditos, 0) });
    return { tipo: 'balancete', iguais: la.length - sairam.length, entraram, sairam, mudaram, qtdAntes: la.length, qtdDepois: ld.length, antes: totais(la), depois: totais(ld) };
  }

  return { montar, compararBalancetes, MODELO_DRE, FORA_DA_DRE, PARAMETROS, AJUSTES_MODELO, CONTA_PAT_MODELO, PREMISSAS, rotuloMes, compararContas, valorUsado };
});
