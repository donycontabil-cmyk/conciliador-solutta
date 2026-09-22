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
 *  - DRE (CPC 51) MENSAL e TRIMESTRAL: as contas analíticas agrupadas nas linhas do MODELO_DRE — pelas
 *    LINHAS DA EMPRESA (o mapa que quem usa conferiu) ou, sem elas, pelo começo do código do modelo quando os
 *    nomes das contas batem com ele —, com os subtotais da planilha e o valor com o sinal do resultado
 *    (receita +, custo e despesa −); AV % sobre a receita líquida; AH % sobre o período anterior;
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
  // LINHAS DA DRE POR EMPRESA (Dony, 18/09/2026: cada empresa tem o seu plano de contas — a DRE de um plano
  // diferente saiu com despesa no custo e custo em outras receitas, pelos códigos do modelo). As contas de
  // resultado entram nas linhas do MODELO_DRE por um MAPA da empresa:
  //   { contas: { '<conta>': '<id da linha>' | 'fora' }, rotulos: { '<id da linha>': 'nome na DRE' } }
  // Cada conta segue a conta mais próxima ACIMA dela que está no mapa (a de cima vale para todas as de baixo,
  // a não ser que uma de baixo tenha a sua). Sem mapa guardado:
  //  - se os NOMES das contas batem com o modelo da planilha (avaliarModelo), a DRE sai pelo modelo;
  //  - se não batem, o programa SUGERE as linhas pelos nomes (sugerirMapaDre) e a DRE só aparece depois de
  //    quem usa conferir e confirmar ("se a informação não está certa, é melhor não colocar").
  // ------------------------------------------------------------------
  const LINHAS_DO_MAPA = MODELO_DRE.filter((g) => g.prefixos && !g.semLinha).map((g) => ({ id: g.id, rotulo: g.rotulo, categoria: g.categoria }));
  // Linhas de despesa por natureza (a conta de baixo segue a de cima; só IR/CSLL e depreciação saem dela).
  const NATUREZA = { pessoal: 1, servicos: 1, utilidades: 1, ocupacao: 1, viagens: 1, logistica: 1, provisoes: 1, tributarias: 1, gerais: 1, comerciais: 1, propaganda: 1, depreciacao: 1 };
  // A linha pelo nome da conta: a primeira regra que casa ganha (a ordem importa: "deduções da receita
  // bruta" é dedução, não receita; "outras receitas não operacionais" é resultado não operacional; "custo dos
  // serviços" é custo, não serviço contratado). Nomes sem acento, em maiúsculas, pontuação vira espaço.
  const REGRAS_NOME = [
    ['fora', /LUCROS? ?\/? ?(E |OU )?PREJUIZOS?|PREJUIZO DO EXERCICIO|APURACAO DO RESULTADO|RESULTADO DO EXERCICIO|ENCERRAMENTO DO EXERCICIO/],
    ['tributos', /IMPOSTO DE RENDA|\bIRPJ\b|\bCSLL\b|CONTRIBUICAO SOCIAL|TRIBUT\w* SOBRE O LUCRO|PROVISO(ES|AO) (S\/ ?|SOBRE )(O )?(RESULTADO|LUCRO)|PROV\w* (P\/ ?|PARA )(O )?(IR\b|IMPOSTOS?)/],
    ['investimentos', /NAO OPERACIONA|GANHOS? (DE|NA) CAPITAL|PERDAS? DE CAPITAL|VENDA D[OE] (ATIVO )?IMOBILIZADO|ALIENACAO D|BAIXA D[OE] (ATIVO )?IMOBILIZADO|PARTIC\w* SOCIETARIA|EQUIVALENCIA PATRIMONIAL|RESULTADOS? D[EO] INVESTIMENTO/],
    ['receitasFinanceiras', /RECEITAS? FINANCEIRA|RENDIMENTOS? (DE |S\/ ?)?APLICAC|JUROS (RECEBIDOS|ATIVOS|AUFERIDOS)|DESCONTOS? OBTIDOS?|VARIAC\w* (CAMBIA\w*|MONETARIA\w*) ATIVA/],
    ['despesasFinanceiras', /DESPESAS? FINANCEIRA|ENCARGOS FINANCEIROS|JUROS (PAGOS|PASSIVOS|INCORRIDOS|S\/ ?EMPRESTIMO|S\/ ?FINANCIAMENTO|DE MORA)|DESPESAS BANCARIAS|TARIFAS? BANCARIA|\bIOF\b|DESCONTOS? CONCEDIDOS?|VARIAC\w* (CAMBIA\w*|MONETARIA\w*) PASSIVA/],
    ['deducoes', /DEDUC|\bDED\b|DEVOLUC\w* (DE |S\/ ?)?VENDA|VENDAS? CANCELAD|CANCELAMENTO|ABATIMENTO|IMPOSTOS? (INCIDENTES )?(S\/ ?|SOBRE )(AS )?(VENDA|RECEITA|FATURAMENTO)|TRIBUTOS? (INCIDENTES )?(S\/ ?|SOBRE )(A )?(RECEITA|VENDA)|SIMPLES NACIONAL/],
    ['perdas', /AVARIA|PERDAS? (DE |COM |NO |NOS |EM )?(ESTOQUE|PRODUTO|MERCADORIA)|EXTRAVIO|QUEBRAS?\b|CONSUMO (DE PRODUTOS|PROPRIO)/],
    ['cmv', /\bCUSTOS?\b|\bCMV\b|\bCPV\b|\bCSP\b/],
    ['outrasReceitas', /OUTRAS RECEITAS|RECEITAS? (DIVERSAS|EVENTUA)|RECUP\w* (DE )?DESP|RECEITAS? (DE|COM) ALUGUE|ALUGUEIS RECEBIDOS|BONIFICAC\w* RECEBIDA/],
    ['receitaBruta', /RECEITA (OPERACIONAL )?BRUTA|\bVENDAS?\b|FATURAMENTO|\bREC SERV|RECEITAS? (DE |COM |C\/ ?)(VENDA|SERVICO|PRESTACAO|MERCADORIA|PRODUTO|LOCACAO|REVENDA)|PRESTACAO DE SERVICO/, /DESPES|CUSTO|COMISS|FRETE|PROMOC/],
    ['depreciacao', /DEPREC|AMORTIZ|EXAUST/],
    ['provisoes', /PROVIS|\bPDD\b|\bPCLD\b|LIQUIDACAO DUVIDOSA|INCOBRAVE|PERDAS? (COM |DE |EM )(CREDITO|CLIENTE|RECEBIVE)|CONTINGENC|CONTIGENC/],
    ['comerciais', /COMISS|TAXAS? (DE |S\/ ?)?(ADMINISTRACAO DE )?CART|TARIFAS? (DE |S\/ ?)?CART|ANTECIPACAO DE RECEBIVE|MARKETPLACE|ROYALT|FRANQUIA|COMERCIAIS VARIAVE|DESPESAS? COM VENDAS|REPRESENTANTES/],
    ['propaganda', /PROPAGANDA|PUBLICIDADE|PUPLICIDADE|MARKETING|PROMOC|ANUNCIO|PATROCINIO|FEIRAS|BRINDES|\bPROP E P/],
    ['servicos', /SERVIC(?!OS? PUBLICOS)|\bSERV\b|HONORAR|\bHONOR\b|ASSESSORIA|CONSULTORIA|AUDITORIA|TERCEIRIZ|PESSOA JURIDICA|PESSOA FISICA|\bPJ\b|ADVOC|CONTABE|CONTABI|SISTEMAS?\b|SOFTWARE|LICENCA DE USO|TECNOLOGIA|INFORMATICA|PROCESSAMENTO DE DADOS/],
    ['pessoal', /PESSOAL|SALARI|ORDENADO|ENCARGOS SOCIA|\bINSS\b|\bFGTS\b|FERIAS|DECIMO TERCEIRO|PRO LABORE|BENEFICIO|VALE (TRANSPORTE|REFEICAO|ALIMENTACAO)|ASSISTENCIA MEDICA|PLANO DE SAUDE|SAUDE OCUPACIONAL|DIRIGENTE|REMUNERAC|RESCIS|HORAS EXTRAS|GRATIFICAC|TREINAMENTO|UNIFORME|ESTAGIA|APRENDIZ|BOLSA AUXILIO|ALIMENTACAO DO TRABALHADOR/],
    ['utilidades', /UTILIDADE|SERVICOS? PUBLICOS|ENERGIA|\bAGUA\b|ESGOTO|TELEFON|TELECOM|INTERNET|COMUNICAC|CORREIO|CONTAS DE CONSUMO|\bGAS\b|\bLUZ\b|\bFAX\b/],
    ['ocupacao', /OCUPACAO|ALUGUE|CONDOMINIO|LOCACAO DE (IMOVE|SALA|GALPAO|LOJA|PREDIO)|SEGURANCA|VIGILANCIA|LIMPEZA E CONSERVACAO|MANUTENCAO PREDIAL/],
    ['viagens', /VIAGE|HOSPEDAG|PASSAGE|ESTADIA|REPRESENTACAO|\bREPRES\b|VEICULO|COMBUSTIV|PEDAGIO|ESTACIONAMENTO|LOCOMOCAO|CONDUCAO|\bTAXI|QUILOMETRAG|DIARIAS/],
    ['logistica', /FRETE|TRANSPORTE|ENTREGA|LOGISTIC|CARRETO|ARMAZENAG|MOTOBOY|EXPEDICAO/],
    ['tributarias', /TRIBUTAR|IMPOSTOS? E TAXAS|\bTAXAS?\b|EMOLUMENTO|\bIPTU\b|\bIPVA\b|ALVARA|CONTRIBUIC\w* SINDIC|TRIBUTOS (MUNICIPAIS|ESTADUAIS|FEDERAIS)|MULTAS? FISCA/],
    ['gerais', /GERAIS|DIVERSA|DIVERSOS|MATERIA\w* (DE )?(EXPEDIENTE|ESCRITORIO|LIMPEZA|CONSUMO|USO)|USO E CONSUMO|\bCOPA\b|CARTOR|DOACO|MULTAS|INDEDUT|NAO DEDUTIVE|SINISTRO|SEGUROS?\b|ASSINATURA|MANUT|REPARO|CONSERVACAO|ASSOCIAC|ARRENDAMENTO|LEASING|MARCAS E PATENTES|APROPRIAC|DIRETORIA|OUTRAS DESPESAS/],
  ];
  // Contas-mãe que só juntam outras (o nome não diz a linha: decide nas de baixo).
  const GENERICO_RECEITA = /^RECEITAS?( OPERACIONA\w*| LIQUIDA\w*( OPERAC\w*)?| TOTA\w*)?$/;
  const GENERICO_DESPESA = /^(DESPESAS?|DESP)( OPERACIONA\w*| OPERAC| ADMINISTRATIVA\w*| ADM\w*| COMERCIA\w*| GERAIS E ADMINISTRATIVAS| COM VENDAS| E CUSTOS)?$|^OUTRAS DESP\w*( OPERAC\w*)?$|^CUSTOS E DESPESAS\b/;
  const GENERICO_RESULTADO = /^(CONTAS DE )?RESULTADOS?( OPERACIONA\w*| DO PERIODO)?$/;
  const ehContainerFinanceiro = (n) => /FINANCEIR/.test(n) && (/RESULTADO/.test(n) || (/RECEITA/.test(n) && /DESPESA/.test(n)) || /^(RECEITAS E DESPESAS |DESPESAS E RECEITAS )?FINANCEIR\w*$/.test(n));
  function nomeNormal(t) {
    let n = Util.semAcento(String(t || '')).toUpperCase().replace(/\(\s*-\s*\)/g, ' ').replace(/[^A-Z0-9\/]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^([A-Z] )+[A-Z]$/.test(n)) n = n.replace(/ /g, ''); // "A T I V O"
    return n;
  }
  // As linhas que o nome indica, na ordem das regras (sem repetir).
  function linhasPeloNome(n) {
    const out = [];
    for (const [linha, sim, nao] of REGRAS_NOME) if (sim.test(n) && !(nao && nao.test(n)) && out.indexOf(linha) < 0) out.push(linha);
    return out;
  }
  function filhasPorMae(contas) {
    const m = new Map();
    contas.forEach((c) => { const k = c.pai || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
    return m;
  }
  const raizesDoResultado = (contas) => { const tem = new Set(contas.map((c) => c.conta)); return contas.filter((c) => !patrimonial(c.conta) && (!c.pai || !tem.has(c.pai))); };

  // A linha de cada conta de resultado pelos nomes. Map conta -> { linha, fonte }: 'nome' (o nome dela ou
  // de uma de cima disse), 'reserva' (o nome não diz: a linha que sobra no grupo, ex.: despesas gerais).
  function linhasSugeridas(contas) {
    const filhas = filhasPorMae(contas);
    const res = new Map();
    const reserva = (dica, n) => {
      if (dica === 'fin') return /RECEITA|RENDIMENTO|GANHO/.test(n) && !/DESPESA/.test(n) ? 'receitasFinanceiras' : 'despesasFinanceiras';
      if (dica === 'receita') return 'receitaBruta';
      if (dica === 'despesa') return /COMERCIA/.test(n) ? 'comerciais' : 'gerais';
      if (dica && dica.ambiguas) return dica.ambiguas[0];
      return null;
    };
    const dicaDoNome = (n) => (/FINANCEIR/.test(n) ? 'fin' : /RECEITA/.test(n) && !/DESPESA|CUSTO/.test(n) ? 'receita' : /DESPESA|CUSTO|DESP\b/.test(n) ? 'despesa' : null);
    function visitar(c, herdada, dica) {
      const n = nomeNormal(c.titulo);
      const menos = /\(\s*-\s*\)/.test(String(c.titulo || ''));
      const casadas = linhasPeloNome(n);
      let decisao = null, novaDica = dica;
      if (herdada) {
        const h = herdada.linha;
        if (h !== 'fora' && h !== 'tributos' && casadas[0] === 'tributos') decisao = { linha: 'tributos', fonte: 'nome' };
        else if (h === 'receitaBruta' && (casadas.indexOf('deducoes') >= 0 || menos || /\b(ICMS|PIS|COFINS|ISS|ISSQN|IPI|DAS)\b|SUBSTITUICAO TRIBUTARIA/.test(n))) decisao = { linha: 'deducoes', fonte: 'nome' };
        else if (h === 'cmv' && casadas[0] === 'perdas') decisao = { linha: 'perdas', fonte: 'nome' };
        else if (NATUREZA[h] && h !== 'depreciacao' && casadas[0] === 'depreciacao') decisao = { linha: 'depreciacao', fonte: 'nome' };
        else decisao = { linha: h, fonte: herdada.fonte };
      } else if (dica === 'fin' && !(ehContainerFinanceiro(n) && !c.analitica)) {
        decisao = { linha: casadas[0] === 'tributos' ? 'tributos' : reserva('fin', n), fonte: 'nome' };
      } else if (!c.analitica && ehContainerFinanceiro(n)) novaDica = 'fin';
      else if (!c.analitica && GENERICO_RECEITA.test(n)) novaDica = 'receita';
      else if (!c.analitica && GENERICO_DESPESA.test(n)) novaDica = 'despesa';
      else if (!c.analitica && GENERICO_RESULTADO.test(n)) novaDica = null;
      else if (casadas.length) {
        const naturezas = casadas.filter((l) => NATUREZA[l]);
        // "UTILIDADES E SERVIÇOS": duas naturezas no nome de uma conta-mãe — decide nas de baixo.
        if (!c.analitica && naturezas.length >= 2 && naturezas.length === casadas.length) novaDica = { ambiguas: naturezas };
        else decisao = { linha: casadas[0], fonte: 'nome' };
      } else if (c.analitica) {
        const l = reserva(dica || dicaDoNome(n), n);
        if (l) decisao = { linha: l, fonte: 'reserva' };
      } else novaDica = dicaDoNome(n) || dica;
      if (decisao) res.set(c.conta, decisao);
      (filhas.get(c.conta) || []).forEach((f) => visitar(f, decisao, decisao ? null : novaDica));
    }
    raizesDoResultado(contas).forEach((c) => visitar(c, null, null));
    return res;
  }

  // Mapa com o mínimo de contas: cada linha fica na conta mais alta em que ela vale para TODAS as analíticas
  // de baixo (uma conta nova que aparecer embaixo segue essa linha). linhaDe(conta analítica) -> linha | null.
  function compactarMapa(contas, linhaDe) {
    const filhas = filhasPorMae(contas);
    const comum = new Map();
    function calcular(c) {
      let l;
      if (c.analitica) l = linhaDe(c) || null;
      else {
        for (const f of filhas.get(c.conta) || []) { const x = calcular(f); if (l === undefined) l = x; else if (l !== x) l = '*'; }
        if (l === undefined) l = null;
      }
      comum.set(c.conta, l);
      return l;
    }
    const mapa = {};
    function gravar(c) {
      const l = comum.get(c.conta);
      if (l === '*') (filhas.get(c.conta) || []).forEach(gravar);
      else if (l) mapa[c.conta] = l;
    }
    const raizes = raizesDoResultado(contas);
    raizes.forEach(calcular);
    raizes.forEach(gravar);
    return mapa;
  }

  // A linha de uma conta pelo modelo da planilha (começo do código; o prefixo mais comprido ganha).
  const GRUPOS_COM_PREFIXO = MODELO_DRE.filter((g) => g.prefixos && g.prefixos.length);
  function linhaDoModelo(conta) {
    let melhor = null, tam = -1;
    for (const g of GRUPOS_COM_PREFIXO) for (const p of g.prefixos) if (comeca(conta, p) && p.length > tam) { melhor = g.id; tam = p.length; }
    if (melhor) return melhor;
    return FORA_DA_DRE.some((f) => comeca(conta, f.prefixo)) ? 'fora' : null;
  }
  // A linha de uma conta pelo mapa: a da própria conta ou a da conta mais próxima acima dela.
  function linhaNoMapa(mapa, indice, conta) {
    let c = conta;
    const vistas = new Set();
    while (c && !vistas.has(c)) {
      vistas.add(c);
      if (mapa[c]) return mapa[c];
      const x = indice.get(c);
      c = x ? x.pai : '';
    }
    return null;
  }
  function sugerirMapaDre(contas) {
    const sug = linhasSugeridas(contas);
    return compactarMapa(contas, (c) => { const s = sug.get(c.conta); return s ? s.linha : null; });
  }
  function mapaDoModelo(contas) { return compactarMapa(contas, (c) => linhaDoModelo(c.conta)); }
  // Os planos de contas de vários anos num só (a conta é analítica se nenhuma outra é filha dela).
  function planoJunto(listas) {
    const porConta = new Map();
    listas.forEach((l) => (l || []).forEach((c) => { if (!porConta.has(c.conta)) porConta.set(c.conta, Object.assign({}, c)); }));
    const todas = Array.from(porConta.values()).sort((a, b) => compararContas(a.conta, b.conta));
    const pais = new Set(todas.map((c) => c.pai).filter(Boolean));
    todas.forEach((c) => { c.analitica = !pais.has(c.conta); });
    return todas;
  }
  // RECLASSIFICAR UMA CONTA (Dony, 22/09/2026: "a conta que entrou em outras contas de resultado sem linha na DRE, eu
  // quero poder arrastar para os grupos; não posso ter esse outras contas"): as linhas da DRE da empresa com a conta na
  // linha nova (ela passa a ter a linha dela, mesmo que a conta de cima tenha outra). Sem linhas guardadas, a empresa que
  // usava o modelo da planilha parte das linhas do modelo, montadas com o plano de TODOS os anos carregados (senão uma
  // conta que só existe num ano perderia a linha que o modelo dava a ela). op: { mapa (as linhas guardadas ou null),
  // situacao (da DRE), planos (os planos de contas dos anos), conta, linha }. null: DRE ainda não conferida.
  function reclassificarConta(op) {
    const salvo = op.mapa && op.mapa.contas && Object.keys(op.mapa.contas).length ? op.mapa.contas : null;
    if (!salvo && op.situacao !== 'modelo') return null;
    const contas = salvo ? Object.assign({}, salvo) : mapaDoModelo(planoJunto(op.planos || []));
    contas[op.conta] = op.linha;
    return contas;
  }

  // Os nomes batem com o modelo? Compara, conta analítica por conta analítica (pesando pelo movimento), a
  // linha do modelo com a que o nome indica. Serve só se discorda em no máximo 0,1% do movimento (quase nada: na dúvida, pergunta). Conta cujo nome
  // não diz nada fica de fora da comparação; sem nenhuma para comparar, não serve (pergunta a quem usa).
  function avaliarModelo(contas, peso) {
    const sug = linhasSugeridas(contas);
    let total = 0, contra = 0;
    const divergencias = [];
    for (const c of contas) {
      if (!c.analitica || patrimonial(c.conta)) continue;
      const w = peso(c.conta);
      if (!w) continue;
      const m = linhaDoModelo(c.conta);
      const s = sug.get(c.conta);
      if (m === 'fora' || !s || s.fonte !== 'nome' || s.linha === 'fora') continue;
      total += w;
      if (m !== s.linha) { contra += w; divergencias.push({ conta: c.conta, titulo: c.titulo, modelo: m, pelosNomes: s.linha, peso: w }); }
    }
    divergencias.sort((a, b) => b.peso - a.peso);
    return { serve: total > 0 && contra <= total * 0.001, total, contra, divergencias: divergencias.slice(0, 20) };
  }

  // ------------------------------------------------------------------
  // LALUR: alíquotas e regras da planilha modelo (aba Premissas) e os ajustes da planilha modelo.
  // ------------------------------------------------------------------
  const PARAMETROS = {
    irpj: 0.15, adicional: 0.10, limiteAdicionalMes: 2000000 /* R$ 20.000,00 por mês do período */, csll: 0.09,
    compensacao: 0.30, patPercentual: 0.15, patRedutor: 0.90, patLimite: 0.036,
  };
  // Adições e exclusões por conta. regra: 'movimento' = débitos − créditos do mês (positivo = adição,
  // negativo = exclusão — a regra dinâmica da planilha); 'aumento-credor' = exclusão do quanto o saldo credor
  // de uma conta patrimonial aumentou no mês (planilha: −MÁXIMO(0; −(saldo atual − saldo anterior))).
  // A EMPRESA COMEÇA SEM NENHUMA CONTA: quem usa marca cada conta na DRE ou no balancete (Dony, 18/09/2026:
  // "eu quero ir lá no balancete, na DRE, e colocar essa conta é adição, essa é exclusão, e não você
  // decidindo o que é"). AJUSTES_MODELO é a lista da planilha modelo, usada só pela prova que confere a planilha.
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
    ['Ajustes', 'Adições e exclusões nas contas marcadas por quem usa, na DRE ou no balancete', 'Marcação da empresa no ano', 'Incluído', 'Validar documentação e natureza fiscal.'],
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
  // A classe é o primeiro pedaço do código, sem o zero na frente ("01.1.1.01.001" é do ativo, como "1.1.1.01.001").
  function classeDe(conta) { return String(conta).split('.')[0].replace(/^0+(?=\d)/, ''); }
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
    // Conta com saldo ou movimento no período (Dony, 18/09/2026: "esconder as contas que não possuem saldo nem
    // movimento; se tiver saldo, logo tem movimento"): saldo anterior, débitos, créditos ou saldo atual ≠ 0.
    const ativaNoMes = (conta, m) => { const l = linhaDoMes(conta, m); return !!l && !!(l.saldoAnterior || l.debitos || l.creditos || l.saldoAtual); };
    const ativaNoTrimestre = (conta, t) => t.meses.some((m) => ativaNoMes(conta, m));
    // ativa: por coluna, se a conta tem saldo ou movimento (a tela esconde as que não têm em nenhuma coluna).
    function tabelaDeContas(colunas, valorDe, ativaDe) {
      const valores = new Map(contas.map((c) => [c.conta, colunas.map((col) => valorDe(c.conta, col))]));
      return contas.map((c) => {
        const v = valores.get(c.conta);
        const vp = c.pai && valores.has(c.pai) ? valores.get(c.pai) : null;
        return Object.assign({}, c, {
          valores: v,
          av: v.map((x, k) => (c.nivel === 1 || !vp ? null : div(x, vp[k]))),
          ah: v.map((x, k) => (k === 0 ? null : ah(x, v[k - 1]))),
          ativa: colunas.map((col) => ativaDe(c.conta, col)),
        });
      });
    }
    const mensal = { colunas: meses.map((m) => ({ id: m.comp, rotulo: m.rotulo, falta: !m.tem })), linhas: tabelaDeContas(meses, valor, ativaNoMes) };
    const trimestral = { colunas: trimestres.map((t) => ({ id: t.id, rotulo: t.rotulo, parcial: t.parcial })), linhas: tabelaDeContas(trimestres, valorTrimestre, ativaNoTrimestre) };

    // ---------- DRE: as linhas pelo mapa da empresa; sem mapa, pelo modelo (se os nomes batem) ou pela
    // sugestão pelos nomes (situação 'sugestao': a tela só mostra a DRE depois de quem usa conferir).
    const peso = (conta) => meses.reduce((s, m) => { const l = linhaDoMes(conta, m); return s + (l ? Math.abs(l.debitos - l.creditos) : 0); }, 0);
    // (rascunho: as linhas que quem usa está escolhendo, mesmo vazias — a prévia da tela)
    const mapaEmpresa = entrada.mapaDre && entrada.mapaDre.contas && (entrada.mapaDre.rascunho || Object.keys(entrada.mapaDre.contas).length) ? entrada.mapaDre : null;
    let situacaoDre, mapaUsado = null, avaliacao = null;
    if (mapaEmpresa) { situacaoDre = 'mapa'; mapaUsado = mapaEmpresa.contas; }
    else {
      avaliacao = entrada.dreModo === 'modelo' ? { serve: true, forcado: true, divergencias: [] } : avaliarModelo(contas, peso);
      if (avaliacao.serve) situacaoDre = 'modelo';
      else { situacaoDre = 'sugestao'; mapaUsado = sugerirMapaDre(contas); }
    }
    const rotulosDre = (mapaEmpresa && mapaEmpresa.rotulos) || {};
    const gruposComPrefixo = MODELO_DRE.filter((g) => g.prefixos);
    const analiticasDoGrupo = new Map(gruposComPrefixo.map((g) => [g.id, []]));
    const foraDaDre = [], naoMapeadas = [];
    for (const c of contas) {
      if (!c.analitica || c.patrimonial) continue;
      const l = mapaUsado ? linhaNoMapa(mapaUsado, indice, c.conta) : linhaDoModelo(c.conta);
      if (l === 'fora') {
        const f = mapaUsado ? null : FORA_DA_DRE.find((x) => comeca(c.conta, x.prefixo));
        foraDaDre.push({ conta: c.conta, titulo: c.titulo, motivo: f ? f.motivo : 'marcada fora da DRE nas linhas da empresa' });
        continue;
      }
      if (l && analiticasDoGrupo.has(l) && l !== 'semLinha') { analiticasDoGrupo.get(l).push(c); continue; }
      naoMapeadas.push({ conta: c.conta, titulo: c.titulo, motivo: 'nenhuma linha da DRE pega esta conta: foi para "Outras contas de resultado"' });
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
            const rotulo = rotulosDre[g.id] || (g.semLinha && situacaoDre !== 'modelo' ? '(-) Outras contas de resultado (sem linha na DRE)' : g.rotulo);
            linhas.push({ id: g.id, categoria: g.categoria, tipo: 'grupo', rotulo, valores, filhas: filhas.length, semLinha: !!g.semLinha });
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
    // LUCRO ACUMULADO NO ANO (Dony, 22/09/2026: "depois do lucro ou prejuízo líquido no período, um lucro ou prejuízo
    // líquido acumulado: janeiro só janeiro, fevereiro janeiro e fevereiro, março março mais o acumulado de janeiro e
    // fevereiro, abril abril mais o acumulado de janeiro a março [...] importante para as empresas de lucro real, para
    // ver quando vai dar lucro"): a soma do lucro líquido desde JANEIRO, na última linha. Sem o balancete de janeiro, ou
    // com um mês faltando no meio, o acumulado não dá para saber: fica vazio dali em diante. AV %: o lucro acumulado
    // sobre a receita líquida acumulada (a margem do ano até ali). No trimestral: o acumulado no fim de cada trimestre.
    const acumulado = acumuladoNoAno(meses.map((m) => m.tem), dreMensal.totais.get('lucroLiquido'), dreMensal.totais.get('receitaLiquida'), meses.length ? meses[0].mes : 0);
    dreMensal.linhas.push(linhaAcumulada(acumulado.valores.concat(colAcumulado.map(() => null)), acumulado.receitas.concat(colAcumulado.map(() => null))));
    const fimDoTrimestre = (t) => meses.indexOf(t.meses[t.meses.length - 1]);
    dreTrimestral.linhas.push(linhaAcumulada(trimestres.map((t) => acumulado.valores[fimDoTrimestre(t)]), trimestres.map((t) => acumulado.receitas[fimDoTrimestre(t)])));
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
    // RESUMO (Dony, 18/09/2026: "ativo, passivo, receitas, custos e despesas: somando tudo tem que dar zero —
    // o resultado é acumulado, o mês anterior mais o atual"): o SALDO de cada conta de 1º nível no fim do mês,
    // como no balancete (nas de resultado, o acumulado desde o último encerramento). Trimestre: o saldo do
    // último mês com balancete do trimestre. A linha "soma" tem que dar zero em todas as colunas.
    const primeiroNivel = contas.filter((c) => c.nivel === 1);
    const saldoNoMes = (conta, m) => { if (!m || !m.tem) return null; const l = linhaDoMes(conta, m); return l ? l.saldoAtual : 0; };
    const ultimoDoTrimestre = (tri) => { const com = tri.meses.filter((m) => m.tem); return com[com.length - 1] || null; };
    const colunasResumo = meses.map((m) => ({ id: m.comp, rotulo: m.rotulo, falta: !m.tem, mes: m }))
      .concat(trimestres.map((tri) => ({ id: tri.id, rotulo: tri.rotulo, trimestre: true, mes: ultimoDoTrimestre(tri) })));
    const resumo = {
      colunas: colunasResumo.map((c) => ({ id: c.id, rotulo: c.rotulo, falta: !!c.falta, trimestre: !!c.trimestre })),
      linhas: primeiroNivel.map((c) => ({ conta: c.conta, titulo: c.titulo, patrimonial: c.patrimonial, valores: colunasResumo.map((col) => saldoNoMes(c.conta, col.mes)) })),
    };
    resumo.soma = colunasResumo.map((col, k) => (col.mes && col.mes.tem ? resumo.linhas.reduce((s, l) => s + (l.valores[k] || 0), 0) : null));
    const balanco = montarBalanco({ meses, contas, linhaDoMes, primeiroNivel, dreMensal });

    const avisos = [];
    const faltando = meses.filter((m) => !m.tem).map((m) => m.rotulo);
    if (faltando.length) avisos.push('Falta o balancete de ' + faltando.join(', ') + ': esses meses ficam vazios e os trimestres deles ficam parciais' +
      (acumulado.paraEm !== null ? '; o lucro acumulado no ano fica vazio a partir de ' + meses[acumulado.paraEm].rotulo : '') + '.');
    if (situacaoDre === 'sugestao') avisos.push('As linhas da DRE desta empresa ainda não foram conferidas: o plano de contas dela é diferente do modelo da planilha. ' +
      'Abra a DRE e confira em que linha entra cada grupo de contas (fica guardado para a empresa). Até lá, a DRE, os indicadores e o relatório do cliente ficam fechados.');
    else if (naoMapeadas.length) avisos.push(naoMapeadas.length + ' conta(s) de resultado sem linha na DRE entraram em "Outras contas de resultado" (' +
      naoMapeadas.slice(0, 3).map((n) => n.conta + ' ' + n.titulo).join('; ') + (naoMapeadas.length > 3 ? '; …' : '') + '): na DRE, arraste cada uma para a linha certa (fica guardado para a empresa).');
    balanco.colunas.forEach((c, k) => {
      const d = balanco.conferencia.diferenca[k];
      if (d === null || Math.abs(d) <= 1) return;
      // Resultado aberto que vem de antes do primeiro balancete carregado: falta carregar os meses anteriores.
      avisos.push(c.semEncerramento
        ? 'Em ' + c.rotulo + ' o balanço não fecha (' + Util.formatarCentavos(d) + ') porque o resultado do ano começou antes do primeiro balancete carregado: carregue os balancetes desde o último encerramento (em geral, desde janeiro).'
        : 'Em ' + c.rotulo + ' o balanço não fecha: ativo − (passivo + PL + resultado da DRE) = ' + Util.formatarCentavos(d) + '.');
    });
    conferencia.filter((c) => c.diferenca).forEach((c) => avisos.push('Em ' + c.mes + ' o lucro da DRE difere do resultado do balancete em ' + Util.formatarCentavos(c.diferenca) + ' (contas fora da DRE).'));

    return { ano, meses, trimestres, contas, base, mensal, trimestral,
      dre: { mensal: dreMensal, trimestral: dreTrimestral, foraDaDre, naoMapeadas, conferencia, situacao: situacaoDre, mapa: mapaUsado, rotulos: rotulosDre, avaliacao,
        acumulado: { semJaneiro: acumulado.semJaneiro, paraEm: acumulado.paraEm === null ? null : meses[acumulado.paraEm].rotulo } },
      lalur, resumo, balanco, avisos, faltando };
  }

  // O lucro acumulado no ano, mês a mês. tem: o mês tem valor (balancete real ou simulado); lucro e receita: os valores
  // do mês; primeiroMes: o número do mês da primeira posição (tem que ser janeiro). paraEm: a posição do primeiro mês
  // sem valor depois de janeiro (dali em diante, vazio).
  function acumuladoNoAno(tem, lucro, receita, primeiroMes) {
    const valores = [], receitas = [];
    const semJaneiro = !tem.length || primeiroMes !== 1 || !tem[0];
    let segue = !semJaneiro, somaL = 0, somaR = 0, paraEm = null;
    tem.forEach((t, k) => {
      if (segue && !t) { segue = false; paraEm = k; }
      if (!segue) { valores.push(null); receitas.push(null); return; }
      somaL += lucro[k] || 0; somaR += receita[k] || 0;
      valores.push(somaL); receitas.push(somaR);
    });
    // Os meses vazios só no fim (ainda não chegaram) não interrompem nada: o acumulado só acaba ali.
    if (paraEm !== null && !tem.slice(paraEm + 1).some(Boolean)) paraEm = null;
    return { valores, receitas, semJaneiro, paraEm };
  }
  const linhaAcumulada = (valores, receitas) => ({ id: 'lucroAcumulado', categoria: 'Resultado', tipo: 'total', rotulo: 'Lucro ou prejuízo líquido acumulado no ano',
    acumuladoAno: true, destaque: true, valores, av: valores.map((v, i) => div(v, receitas[i])), ah: valores.map(() => null) });
  const semAcumulado = (l) => !l.acumuladoAno;

  function rotuloAcumulado(meses) {
    if (!meses.length) return 'Acumulado';
    return NOMES_MES[meses[0].mes - 1] + '–' + NOMES_MES[meses[meses.length - 1].mes - 1];
  }

  // ------------------------------------------------------------------
  // BALANÇO PATRIMONIAL simulado (Dony, 18/09/2026: "cria um balanço patrimonial e lança no resultado do
  // exercício um simulado de acordo com a DRE: ativo e passivo têm que bater"). Em cada mês: o ativo; o
  // passivo; o PL do balancete MAIS o resultado do exercício pela DRE desde o último encerramento (o mês mais
  // recente em que as contas de resultado começaram zeradas: janeiro, e depois de cada encerramento).
  // Conferências: ativo − (passivo + PL + resultado) = 0, e o resultado pela DRE = o das contas de resultado
  // ainda abertas no balancete. Passivo e PL com o saldo credor positivo.
  // ------------------------------------------------------------------
  function montarBalanco(x) {
    const { meses, contas, linhaDoMes, primeiroNivel, dreMensal } = x;
    const saldo = (conta, m) => { if (!m.tem) return null; const l = linhaDoMes(conta, m); return l ? l.saldoAtual : 0; };
    const doResultado = primeiroNivel.filter((c) => !patrimonial(c.conta));
    const lucro = dreMensal.totais.get('lucroLiquido') || [];
    const desde = meses.map((m, k) => {
      if (!m.tem) return null;
      for (let i = k; i >= 0; i--) {
        if (!meses[i].tem) continue;
        const abertura = doResultado.reduce((s, c) => { const l = linhaDoMes(c.conta, meses[i]); return s + (l ? l.saldoAnterior : 0); }, 0);
        if (Math.abs(abertura) <= 1) return i;
      }
      return null; // o resultado aberto vem de antes do primeiro balancete carregado
    });
    const primeiro = meses.findIndex((m) => m.tem);
    const resultadoDre = meses.map((m, k) => {
      if (!m.tem) return null;
      let s = 0;
      for (let i = desde[k] === null ? primeiro : desde[k]; i <= k; i++) s += lucro[i] || 0;
      return s;
    });
    const resultadoBalancete = meses.map((m) => (m.tem ? -doResultado.reduce((s, c) => s + (saldo(c.conta, m) || 0), 0) : null));
    const soma = (listas) => meses.map((m, k) => (m.tem ? listas.reduce((s, vs) => s + (vs[k] || 0), 0) : null));
    const filhas = (pai) => contas.filter((c) => c.pai === pai);
    const daConta = (c, sinal, nivel, extra) => Object.assign({ conta: c.conta, rotulo: c.titulo, nivel, tipo: 'conta',
      valores: meses.map((m) => { const v = saldo(c.conta, m); return v === null ? null : sinal * v; }) }, extra || {});
    const cb = contasDoBalanco(contas);
    const P = cb.passivo;
    const zeros = meses.map((m) => (m.tem ? 0 : null));
    const linhas = [];
    const vAtivo = cb.ativo ? daConta(cb.ativo, 1, 1).valores : zeros;
    linhas.push({ id: 'ativo', rotulo: 'ATIVO', tipo: 'total', nivel: 1, valores: vAtivo });
    if (cb.ativo) filhas(cb.ativo.conta).forEach((c2) => { linhas.push(daConta(c2, 1, 2, { tipo: 'grupo' })); filhas(c2.conta).forEach((c3) => linhas.push(daConta(c3, 1, 3))); });
    const gruposPassivo = P ? filhas(P.conta).filter((c) => !cb.pl || c.conta !== cb.pl.conta) : [];
    const vPassivo = soma(gruposPassivo.map((c) => daConta(c, -1, 2).valores));
    linhas.push({ id: 'passivo', rotulo: 'PASSIVO', tipo: 'total', nivel: 1, valores: vPassivo });
    gruposPassivo.forEach((c2) => { linhas.push(daConta(c2, -1, 2, { tipo: 'grupo' })); filhas(c2.conta).forEach((c3) => linhas.push(daConta(c3, -1, 3))); });
    const vPlBalancete = cb.pl ? daConta(cb.pl, -1, 2).valores : zeros;
    const vPl = soma([vPlBalancete, resultadoDre]);
    linhas.push({ id: 'pl', rotulo: 'PATRIMÔNIO LÍQUIDO', tipo: 'total', nivel: 1, valores: vPl });
    if (cb.pl) {
      linhas.push(daConta(cb.pl, -1, 2, { tipo: 'grupo', rotulo: cb.pl.titulo + ' (no balancete)', grupoPl: true }));
      filhas(cb.pl.conta).forEach((c3) => linhas.push(daConta(c3, -1, 3, { doPl: true })));
    }
    linhas.push({ id: 'resultado', rotulo: 'Resultado do exercício (pela DRE, desde o último encerramento)', tipo: 'resultado', nivel: 2, valores: resultadoDre });
    const vTotal = soma([vPassivo, vPl]);
    linhas.push({ id: 'totalPassivoPl', rotulo: 'TOTAL DO PASSIVO E PATRIMÔNIO LÍQUIDO', tipo: 'total', nivel: 1, destaque: true, valores: vTotal });
    const diferenca = meses.map((m, k) => (m.tem ? vAtivo[k] - vTotal[k] : null));
    const difResultado = meses.map((m, k) => (m.tem ? resultadoBalancete[k] - resultadoDre[k] : null));
    return {
      colunas: meses.map((m, k) => ({ id: m.comp, rotulo: m.rotulo, falta: !m.tem, desde: desde[k] === null ? null : meses[desde[k]].rotulo, semEncerramento: m.tem && desde[k] === null })),
      linhas,
      conferencia: { diferenca, resultadoBalancete, resultadoDre, difResultado },
      fecha: diferenca.every((d) => d === null || Math.abs(d) <= 1) && difResultado.every((d) => d === null || Math.abs(d) <= 1),
    };
  }

  // ------------------------------------------------------------------
  // LALUR
  // ------------------------------------------------------------------
  function montarLalur(x) {
    const { meses, trimestres, valor, linhaDoMes, indice, dreMensal, cfg } = x;
    const P = Object.assign({}, PARAMETROS, cfg.parametros || {});
    const ajustesCfg = Array.isArray(cfg.ajustes) ? cfg.ajustes : [];
    // Sem conta do PAT escolhida: a da planilha modelo, se ela existe no plano desta empresa.
    const contaPAT = cfg.contaPAT === undefined ? (indice.has(CONTA_PAT_MODELO) ? CONTA_PAT_MODELO : '') : cfg.contaPAT;
    const parteB = cfg.parteB || {};

    // Valor do ajuste de uma conta num mês (positivo = adição, negativo = exclusão).
    const ajusteNoMes = (a, m) => {
      if (!m.tem) return null;
      if (a.regra === 'aumento-credor') {
        const l = linhaDoMes(a.conta, m);
        if (!l) return 0;
        return -Math.max(0, l.saldoAnterior - l.saldoAtual);
      }
      const l = linhaDoMes(a.conta, m); // débitos − créditos (na conta patrimonial, o saldo não serve)
      return l ? l.debitos - l.creditos : 0;
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
      // Trimestres em que a conta entrou do lado contrário ao marcado (regra dinâmica: adição com movimento
      // credor no trimestre vira exclusão, e o contrário) — a tela avisa.
      const contraMarca = trimestres.filter((t) => {
        const s = somaDe(t.meses.map((m) => porMes.get(m.comp))) || 0;
        return a.tipo === 'exclusao' ? s > 0 : s < 0;
      }).map((t) => t.rotulo);
      return { conta: a.conta, tipo: a.tipo === 'exclusao' ? 'Exclusão' : 'Adição', regra: a.regra, titulo: c ? c.titulo : (a.descricao || ''), noBalancete: !!c, valores, porMes, contraMarca };
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
  // INDICADORES financeiros e patrimoniais (Dony, 18/09/2026: "uma tela de índices — liquidez, ROI,
  // investidores, endividamento, essas coisas"). Balanço: saldo do fim do mês; resultado: movimento do mês.
  // As contas do balanço são achadas pelo NOME (ativo circulante, estoques…), com o código de sempre como
  // reserva — outro plano de contas também funciona, e a tela mostra quais contas foram usadas.
  // PL* = ativo total − passivo circulante − passivo não circulante: inclui o resultado do ano que ainda não
  // foi encerrado no balancete (sem isso o ROE e o capital de terceiros ÷ próprio sairiam errados no meio do ano).
  // ------------------------------------------------------------------
  const INDICADORES = [
    { id: 'liquidezCorrente', grupo: 'Liquidez', rotulo: 'Liquidez corrente', formula: 'Ativo circulante ÷ passivo circulante', tipo: 'x', melhor: 'maior' },
    { id: 'liquidezSeca', grupo: 'Liquidez', rotulo: 'Liquidez seca', formula: '(Ativo circulante − estoques) ÷ passivo circulante', tipo: 'x', melhor: 'maior' },
    { id: 'liquidezImediata', grupo: 'Liquidez', rotulo: 'Liquidez imediata', formula: 'Disponível ÷ passivo circulante', tipo: 'x', melhor: 'maior' },
    { id: 'liquidezGeral', grupo: 'Liquidez', rotulo: 'Liquidez geral', formula: '(Ativo circulante + realizável a longo prazo) ÷ (passivo circulante + não circulante)', tipo: 'x', melhor: 'maior' },
    { id: 'ccl', grupo: 'Liquidez', rotulo: 'Capital circulante líquido', formula: 'Ativo circulante − passivo circulante', tipo: 'R$', melhor: 'maior' },
    { id: 'endividamento', grupo: 'Endividamento e estrutura', rotulo: 'Endividamento sobre o ativo', formula: '(Passivo circulante + não circulante) ÷ ativo total', tipo: '%', melhor: 'menor' },
    { id: 'composicao', grupo: 'Endividamento e estrutura', rotulo: 'Composição do endividamento (curto prazo)', formula: 'Passivo circulante ÷ (passivo circulante + não circulante)', tipo: '%', melhor: 'menor' },
    { id: 'terceiros', grupo: 'Endividamento e estrutura', rotulo: 'Capital de terceiros ÷ capital próprio', formula: '(Passivo circulante + não circulante) ÷ PL*', tipo: 'x', melhor: 'menor' },
    { id: 'imobilizacao', grupo: 'Endividamento e estrutura', rotulo: 'Imobilização do patrimônio líquido', formula: '(Ativo não circulante − realizável a longo prazo) ÷ PL*', tipo: '%', melhor: 'menor' },
    { id: 'margemBruta', grupo: 'Rentabilidade e retorno', rotulo: 'Margem bruta', formula: 'Lucro bruto ÷ receita líquida', tipo: '%', melhor: 'maior' },
    { id: 'margemEbitda', grupo: 'Rentabilidade e retorno', rotulo: 'Margem EBITDA', formula: 'EBITDA gerencial ÷ receita líquida', tipo: '%', melhor: 'maior' },
    { id: 'margemOperacional', grupo: 'Rentabilidade e retorno', rotulo: 'Margem operacional', formula: 'Lucro operacional ÷ receita líquida', tipo: '%', melhor: 'maior' },
    { id: 'margemLiquida', grupo: 'Rentabilidade e retorno', rotulo: 'Margem líquida', formula: 'Lucro líquido ÷ receita líquida', tipo: '%', melhor: 'maior' },
    { id: 'roi', grupo: 'Rentabilidade e retorno', rotulo: 'ROI — retorno sobre o ativo', formula: 'Lucro líquido ÷ ativo total', tipo: '%', melhor: 'maior' },
    { id: 'roe', grupo: 'Rentabilidade e retorno', rotulo: 'ROE — retorno do investidor (sobre o PL)', formula: 'Lucro líquido ÷ PL*', tipo: '%', melhor: 'maior' },
    { id: 'giro', grupo: 'Rentabilidade e retorno', rotulo: 'Giro do ativo', formula: 'Receita líquida ÷ ativo total', tipo: 'x', melhor: 'maior' },
    { id: 'pmr', grupo: 'Prazos médios', rotulo: 'Prazo médio de recebimento', formula: 'Clientes ÷ receita bruta do mês × 30', tipo: 'dias', melhor: 'menor' },
    { id: 'pme', grupo: 'Prazos médios', rotulo: 'Prazo médio de estocagem', formula: 'Estoques ÷ custo das mercadorias do mês × 30', tipo: 'dias', melhor: 'menor' },
  ];

  // As contas do balanço que os indicadores usam: pelo nome, com o código de sempre como reserva.
  function contasDoBalanco(contas) {
    const porConta = new Map(contas.map((c) => [c.conta, c]));
    const filhas = (pai) => (pai ? contas.filter((c) => c.pai === pai.conta) : []);
    const nome = (c) => nomeNormal(c.titulo);
    const achar = (lista, sim, nao, reserva) => lista.find((c) => sim.test(nome(c)) && !(nao && nao.test(nome(c)))) || (reserva && porConta.get(reserva)) || null;
    // Nas filhas e, se não achar, nas netas (ex.: "CRÉDITOS" > "CLIENTES").
    const acharFundo = (pai, sim, nao, reserva) => achar(filhas(pai), sim, nao, null) || achar([].concat(...filhas(pai).map(filhas)), sim, nao, reserva);
    const NAO_CIRC = /NAO CIRCULANTE|LONGO PRAZO/;
    // Ativo e passivo: a conta de 1º nível da classe 1 e da 2 (o código pode ser "1", "1.0.0.00.00001"...).
    const primeiras = contas.filter((c) => c.nivel === 1);
    const daClasse = (k, re) => primeiras.find((c) => classeDe(c.conta) === k) || primeiras.find((c) => re.test(nome(c))) || porConta.get(k) || null;
    const ativo = daClasse('1', /^ATIVO/), passivo = daClasse('2', /^PASSIVO/);
    const ac = achar(filhas(ativo), /CIRCULANTE/, NAO_CIRC, '1.1');
    const anc = achar(filhas(ativo), /NAO CIRCULANTE/, null, '1.2');
    const pc = achar(filhas(passivo), /CIRCULANTE/, NAO_CIRC, '2.1');
    return {
      ativo, passivo, ac, anc, pc,
      disponivel: acharFundo(ac, /DISPONIVE|CAIXA/, null, '1.1.1'),
      clientes: acharFundo(ac, /CLIENTE|RECEBER/, /ADIANTAMENTO|ADTO/, '1.1.2'),
      estoques: acharFundo(ac, /ESTOQUE/, null, '1.1.4'),
      // No plano antigo o realizável a longo prazo fica direto no ativo ("ATIVO REAL. LONGO PRAZO").
      rlp: achar(filhas(anc), /REALIZ/, null, null) || achar(filhas(ativo), /REALIZ|LONGO PRAZO/, null, '1.2.1'),
      pnc: achar(filhas(passivo), NAO_CIRC, null, '2.2'),
      pl: achar(filhas(passivo), /PATRIMONIO/, null, '2.3'),
    };
  }
  const NOMES_CONTAS_BALANCO = { ativo: 'Ativo total', ac: 'Ativo circulante', disponivel: 'Disponível', clientes: 'Clientes', estoques: 'Estoques', anc: 'Ativo não circulante',
    rlp: 'Realizável a longo prazo', pc: 'Passivo circulante', pnc: 'Passivo não circulante', pl: 'Patrimônio líquido (contábil)' };

  // ks: índices dos meses (padrão: todos com balancete). acumulado: acrescenta a coluna do período
  // (resultado somado nos meses; balanço no último mês).
  function indicadores(rel, ks, op) {
    const opc = op || {};
    const meses = rel.meses;
    const idx = (ks || meses.map((m, k) => (m.tem ? k : -1)).filter((k) => k >= 0)).slice();
    const contas = contasDoBalanco(rel.contas);
    const saldo = new Map(rel.mensal.linhas.map((l) => [l.conta, l.valores]));
    const dre = new Map(rel.dre.mensal.linhas.filter((l) => l.tipo !== 'analitica').map((l) => [l.id, l.valores]));
    const bal = (qual, k) => { const c = contas[qual]; if (!c || !meses[k] || !meses[k].tem) return null; const v = (saldo.get(c.conta) || [])[k]; return v === null || v === undefined ? 0 : v; };
    const fluxo = (id, k) => { const v = (dre.get(id) || [])[k]; return v === null || v === undefined ? null : v; };
    const div = (a, b) => (a === null || b === null || !b ? null : a / b);
    // Componentes de um mês (ou do período: fluxos somados, balanço do último mês).
    function componentes(lista) {
      const ult = lista[lista.length - 1];
      if (ult === undefined || !meses[ult] || !meses[ult].tem) return null;
      const soma = (id) => { let s = 0, tem = false; lista.forEach((k) => { const v = fluxo(id, k); if (v !== null) { s += v; tem = true; } }); return tem ? s : null; };
      // Não circulante = total − circulante (vale também para o plano antigo, com realizável a longo prazo,
      // permanente e diferido direto no ativo, e exigível a longo prazo no passivo). Passivo: saldo credor vem negativo.
      const ativo = bal('ativo', ult), ac = bal('ac', ult);
      const anc = ativo === null || ac === null ? null : ativo - ac;
      const pc = -bal('pc', ult);
      const pnc = contas.passivo ? -(bal('passivo', ult) - bal('pc', ult) - (contas.pl ? bal('pl', ult) : 0)) : contas.pnc ? -bal('pnc', ult) : 0;
      return { n: lista.length, ativo, ac, anc, pc, pnc, disponivel: bal('disponivel', ult), clientes: bal('clientes', ult), estoques: bal('estoques', ult), rlp: contas.rlp ? bal('rlp', ult) : 0,
        pl: ativo - pc - pnc, rb: soma('receitaBruta'), rl: soma('receitaLiquida'), lb: soma('lucroBruto'), ebitda: soma('ebitda'), lo: soma('lucroOperacional'), ll: soma('lucroLiquido'),
        cmv: soma('cmv') === null ? null : -soma('cmv') };
    }
    const CALCULO = {
      liquidezCorrente: (x) => div(x.ac, x.pc), liquidezSeca: (x) => div(x.ac - x.estoques, x.pc), liquidezImediata: (x) => div(x.disponivel, x.pc),
      liquidezGeral: (x) => div(x.ac + x.rlp, x.pc + x.pnc), ccl: (x) => x.ac - x.pc,
      endividamento: (x) => div(x.pc + x.pnc, x.ativo), composicao: (x) => div(x.pc, x.pc + x.pnc), terceiros: (x) => (x.pl > 0 ? div(x.pc + x.pnc, x.pl) : null),
      imobilizacao: (x) => (x.pl > 0 ? div(x.anc - x.rlp, x.pl) : null),
      margemBruta: (x) => div(x.lb, x.rl), margemEbitda: (x) => div(x.ebitda, x.rl), margemOperacional: (x) => div(x.lo, x.rl), margemLiquida: (x) => div(x.ll, x.rl),
      roi: (x) => div(x.ll, x.ativo), roe: (x) => (x.pl > 0 ? div(x.ll, x.pl) : null), giro: (x) => div(x.rl, x.ativo),
      pmr: (x) => (x.rb > 0 ? x.clientes / (x.rb / x.n) * 30 : null), pme: (x) => (x.cmv > 0 ? x.estoques / (x.cmv / x.n) * 30 : null),
    };
    // Sem a conta de que o indicador precisa, ele fica vazio (não inventa zero).
    const PRECISA = { liquidezCorrente: ['ac', 'pc'], liquidezSeca: ['ac', 'pc', 'estoques'], liquidezImediata: ['disponivel', 'pc'], liquidezGeral: ['ac', 'pc'], ccl: ['ac', 'pc'],
      endividamento: ['ativo', 'pc'], composicao: ['pc'], terceiros: ['ativo', 'pc'], imobilizacao: ['ativo', 'ac', 'pc'], roi: ['ativo'], roe: ['ativo', 'pc'], giro: ['ativo'],
      pmr: ['clientes'], pme: ['estoques'] };
    const temContas = (id) => (PRECISA[id] || []).every((q) => contas[q]);
    const porMes = idx.map((k) => componentes([k]));
    const doPeriodo = opc.acumulado ? componentes(idx.filter((k) => meses[k].tem)) : null;
    const linhas = INDICADORES.map((ind) => {
      const calc = (x) => (x && temContas(ind.id) ? CALCULO[ind.id](x) : null);
      const valores = porMes.map(calc);
      if (opc.acumulado) valores.push(calc(doPeriodo));
      return Object.assign({}, ind, { valores: valores.map((v) => (v === null || !isFinite(v) ? null : v)) });
    });
    const colunas = idx.map((k) => ({ k, id: meses[k].comp, rotulo: meses[k].rotulo, falta: !meses[k].tem }));
    if (opc.acumulado) colunas.push({ acumulado: true, rotulo: 'Período ' + (idx.length ? meses[idx[0]].rotulo.slice(0, 3) + '–' + meses[idx[idx.length - 1]].rotulo.slice(0, 3) : '') });
    // Sem conta própria, o não circulante sai da conta: ativo − circulante; passivo − circulante − PL.
    const CALCULADAS = { anc: contas.ativo && contas.ac ? 'ativo − ativo circulante' : null, pnc: contas.passivo && contas.pc ? 'passivo − passivo circulante − PL' : null };
    const usadas = Object.keys(NOMES_CONTAS_BALANCO).map((q) => ({ qual: q, nome: NOMES_CONTAS_BALANCO[q], conta: contas[q] ? contas[q].conta : null, titulo: contas[q] ? contas[q].titulo : null,
      calculo: contas[q] ? null : CALCULADAS[q] || null }));
    return { colunas, linhas, contas: usadas, faltam: usadas.filter((u) => !u.conta && !u.calculo).map((u) => u.nome), componentes: porMes };
  }

  // ------------------------------------------------------------------
  // O mesmo mês em dois anos é pelo NÚMERO do mês, não pela posição: o relatório de cada ano começa no trimestre
  // do primeiro balancete dele (2026 desde janeiro e 2025 só desde abril: a posição 0 é janeiro num e abril no outro).
  // ------------------------------------------------------------------
  const indiceDoMes = (rel, n) => rel.meses.findIndex((m) => m.mes === n);
  const rotuloDoMes = (ano, n) => rotuloMes(ano + '-' + String(n).padStart(2, '0') + '-01');
  // O índice, no outro ano, do mês k deste (-1 quando o outro ano não tem o balancete dele).
  function mesNoOutroAno(rel, k, outro) {
    const j = rel.meses[k] ? indiceDoMes(outro, rel.meses[k].mes) : -1;
    return j >= 0 && outro.meses[j].tem ? j : -1;
  }
  const somaNos = (vs, lista) => { let s = 0, tem = false; lista.forEach((k) => { const v = (vs || [])[k]; if (v !== null && v !== undefined) { s += v; tem = true; } }); return tem ? s : null; };
  const variacao = (a, b) => ({ varR: a === null || b === null ? null : a - b, varP: a === null || b === null || !b ? null : (a - b) / Math.abs(b) });
  // As linhas de dois anos, na ordem do primeiro; a que só existe no segundo entra antes da próxima que os dois têm.
  function mesclar(la, lb, chave) {
    const emA = new Set(la.map(chave));
    const posB = new Map(lb.map((x, i) => [chave(x), i]));
    const out = [];
    let j = 0;
    la.forEach((x) => {
      const p = posB.get(chave(x));
      if (p !== undefined) {
        for (; j < p; j++) if (!emA.has(chave(lb[j]))) out.push({ b: lb[j] });
        j = Math.max(j, p + 1);
      }
      out.push({ a: x, b: p !== undefined ? lb[p] : null });
    });
    for (; j < lb.length; j++) if (!emA.has(chave(lb[j]))) out.push({ b: lb[j] });
    return out;
  }

  // ------------------------------------------------------------------
  // COMPARATIVO com o ano anterior (Dony, 21/09/2026: "quero poder jogar os balancetes de 2025 das empresas,
  // para poder fazer comparação" — escolheu a aba Comparativo): os meses escolhidos do ano ao lado dos MESMOS
  // meses do ano anterior. DRE: a soma dos meses; balanço: o saldo do fim do último mês escolhido; indicadores:
  // o período (resultado somado nos meses, balanço do último mês). Variação em R$ (atual − anterior) e em %
  // sobre o valor do ano anterior sem o sinal: custo que cresce dá variação negativa, como o lucro que cai.
  // Conta que só existe num dos anos entra no lugar dela da árvore, com zero no outro.
  // ks: os índices dos meses escolhidos no ano atual (posições em atual.meses).
  // ------------------------------------------------------------------
  function comparativo(atual, anterior, ks) {
    const kA = ks.filter((k) => atual.meses[k] && atual.meses[k].tem);
    const kB = ks.map((k) => mesNoOutroAno(atual, k, anterior)).filter((j) => j >= 0);
    const doAno = (l, lista) => (l ? somaNos(l.valores, lista) : lista.length ? 0 : null);

    const rlA = somaNos((atual.dre.mensal.linhas.find((l) => l.id === 'receitaLiquida') || {}).valores, kA);
    const rlB = somaNos((anterior.dre.mensal.linhas.find((l) => l.id === 'receitaLiquida') || {}).valores, kB);
    // (sem a linha do lucro acumulado no ano: no comparativo cada coluna já é a soma dos meses)
    const dre = mesclar(atual.dre.mensal.linhas.filter(semAcumulado), anterior.dre.mensal.linhas.filter(semAcumulado), (l) => l.id).map(({ a, b }) => {
      const base = a || b;
      const va = doAno(a, kA), vb = doAno(b, kB);
      return Object.assign({ id: base.id, tipo: base.tipo, grupo: base.grupo, conta: base.conta, rotulo: base.rotulo, categoria: base.categoria, destaque: !!base.destaque,
        semLinha: !!base.semLinha, atual: va, anterior: vb, avAtual: div(va, rlA), avAnterior: div(vb, rlB), soNoAnterior: !a, soNoAtual: !b }, variacao(va, vb));
    });
    dre.forEach((l) => { if (l.tipo === 'grupo') l.filhas = dre.filter((x) => x.tipo === 'analitica' && x.grupo === l.id).length; });

    const kUlt = kA.length ? kA[kA.length - 1] : null;
    const jUlt = kUlt === null ? -1 : mesNoOutroAno(atual, kUlt, anterior);
    const temB = jUlt >= 0;
    const balanco = mesclar(atual.balanco.linhas, anterior.balanco.linhas, (l) => l.id || 'c:' + l.conta).map(({ a, b }) => {
      const base = a || b;
      const va = kUlt === null ? null : a ? a.valores[kUlt] : 0;
      const vb = !temB ? null : b ? b.valores[jUlt] : 0;
      return Object.assign({ id: base.id, tipo: base.tipo, conta: base.conta, rotulo: base.rotulo, nivel: base.nivel, destaque: !!base.destaque, atual: va, anterior: vb }, variacao(va, vb));
    });

    const indA = kA.length ? indicadores(atual, kA, { acumulado: true }) : null;
    const indB = kB.length ? indicadores(anterior, kB, { acumulado: true }) : null;
    const doPeriodo = (ind, i) => { if (!ind) return null; const vs = ind.linhas[i].valores; return vs[vs.length - 1]; };
    const indic = INDICADORES.map((d, i) => {
      const va = doPeriodo(indA, i), vb = doPeriodo(indB, i);
      return Object.assign({}, d, { atual: va, anterior: vb, diferenca: va === null || vb === null ? null : va - vb });
    });

    return {
      mesesAtual: kA, mesesAnterior: kB,
      // Os meses escolhidos que o ano anterior não tem ("Mar/25"): a comparação deles fica só de um lado.
      faltamNoAnterior: ks.filter((k) => atual.meses[k] && mesNoOutroAno(atual, k, anterior) < 0).map((k) => rotuloDoMes(anterior.ano, atual.meses[k].mes)),
      mesDoBalanco: kUlt, balancoSemAnterior: kUlt !== null && !temB,
      rotuloBalanco: kUlt === null ? '' : atual.meses[kUlt].rotulo, rotuloBalancoAnterior: kUlt === null ? '' : rotuloDoMes(anterior.ano, atual.meses[kUlt].mes),
      dre, balanco, indicadores: indic,
    };
  }

  // ------------------------------------------------------------------
  // DEMONSTRAÇÕES PARA ASSINAR (Dony, 22/09/2026: "emitir o balanço e a DRE direto do sistema para imprimir e assinar pro
  // cliente" + "e já cria também o fluxo de caixa, do modo mais simples — eu acho que é o indireto"). Para o mês k (a
  // data-base; posição em rel.meses):
  //  - BALANÇO PATRIMONIAL no fim do mês: ativo, passivo e patrimônio líquido (com o resultado do exercício que ainda não
  //    foi encerrado, pela DRE) e os totais, que têm que fechar;
  //  - DRE do período: do começo do ano até o mês (ou só o mês), com as linhas da DRE da empresa;
  //  - FLUXO DE CAIXA pelo MÉTODO INDIRETO no mesmo período: o lucro, mais a depreciação, mais a variação de cada grupo do
  //    balanço entre o começo do período (o saldo anterior do primeiro mês) e o fim (o saldo do mês): no ativo, o aumento
  //    consome caixa; no passivo, gera. Operacional = circulante; investimento = não circulante do ativo; financiamento =
  //    empréstimos, não circulante do passivo e o PL fora o lucro. A soma dá a variação do disponível (a conferência).
  // O período é seguido: com um mês faltando no meio, começa depois dele (e avisa). Com o ano anterior (op.comparar): o
  // balanço do fim do ano anterior (o último mês com balancete dele) e a DRE dos mesmos meses do ano anterior.
  // op: { k, soMes (a DRE só do mês), comparar }.
  // ------------------------------------------------------------------
  const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate();
  const dataDoFim = (ano, mes) => String(ultimoDia(ano, mes)).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + ano;
  const dataDoComeco = (ano, mes) => '01/' + String(mes).padStart(2, '0') + '/' + ano;
  // Nome da conta para a demonstração: o nome do plano (em geral em maiúsculas) com só a primeira letra grande; as siglas
  // (ICMS, PIS, INSS...) continuam em maiúsculas.
  const SIGLAS = new Set(['ICMS', 'PIS', 'COFINS', 'INSS', 'FGTS', 'IRPJ', 'CSLL', 'IRRF', 'ISS', 'ISSQN', 'IPI', 'IOF', 'IPTU', 'IPVA', 'PAT', 'CPC', 'LTDA', 'S/A', 'SA', 'ME', 'EPP', 'IFRS', 'CP', 'LP', 'PL', 'RH', 'TI', 'DAS', 'SIMPLES']);
  function nomeDaDemonstracao(t) {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    if (!s || s !== s.toUpperCase()) return s;
    return s.split(' ').map((p, i) => {
      const limpo = p.replace(/[^A-Za-zÀ-ÿ/]/g, '');
      if (SIGLAS.has(limpo) || /\d/.test(p)) return p;
      const minusc = p.toLowerCase();
      return i === 0 ? minusc.charAt(0).toUpperCase() + minusc.slice(1) : minusc;
    }).join(' ');
  }
  // O nome no meio da frase ("aumento de impostos a recuperar"): só a primeira letra fica pequena, e a sigla não muda.
  const noMeioDaFrase = (s) => (/^[A-ZÀ-Ý]{2,}\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  // Grupos do passivo circulante que são financiamento (e não operação) no fluxo de caixa.
  const DE_FINANCIAMENTO = /EMPRESTIMO|FINANCIAMENTO|DEBENTURE|ARRENDAMENTO|LEASING|MUTUO|DIVIDENDO|LUCROS A DISTRIBUIR|JUROS SOBRE (O )?CAPITAL/;
  const IMOBILIZADO = /IMOBILIZ|INTANGIV|DIFERIDO/;

  function demonstracoes(rel, anterior, op) {
    const opc = op || {};
    const k = opc.k;
    const m = rel.meses[k];
    if (!m || !m.tem) return null;
    const ano = rel.ano;
    const avisos = [];
    // O período: os meses seguidos (com balancete) que terminam no mês; ou só o mês.
    let ini = k;
    if (!opc.soMes) while (ini > 0 && rel.meses[ini - 1].tem) ini--;
    const ks = [];
    for (let i = ini; i <= k; i++) ks.push(i);
    const falta = !opc.soMes && ini > 0 ? rel.meses[ini - 1].rotulo : null;
    if (falta) avisos.push('Falta o balancete de ' + falta + ': a DRE e o fluxo de caixa vão de ' + rel.meses[ini].rotulo + ' a ' + m.rotulo + '.');
    else if (!opc.soMes && rel.meses[ini].mes !== 1) avisos.push('O primeiro balancete do ano é de ' + rel.meses[ini].rotulo + ': a DRE e o fluxo de caixa começam nele (sem janeiro, não é o ano todo).');
    const periodo = { de: dataDoComeco(ano, rel.meses[ini].mes), ate: dataDoFim(ano, m.mes) };
    // O ano anterior: o balanço do último mês com balancete; a DRE dos mesmos meses.
    const comAnt = !!(opc.comparar && anterior);
    const jFim = comAnt ? anterior.meses.map((x, j) => (x.tem ? j : -1)).filter((j) => j >= 0).pop() : undefined;
    const ksAnt = comAnt ? ks.map((kk) => mesNoOutroAno(rel, kk, anterior)).filter((j) => j >= 0) : [];
    const ant = comAnt ? {
      data: jFim === undefined ? '' : dataDoFim(anterior.ano, anterior.meses[jFim].mes),
      periodo: ksAnt.length ? { de: dataDoComeco(anterior.ano, anterior.meses[ksAnt[0]].mes), ate: dataDoFim(anterior.ano, anterior.meses[ksAnt[ksAnt.length - 1]].mes) } : null,
    } : null;
    if (comAnt && ksAnt.length < ks.length) avisos.push(anterior.ano + ' não tem balancete de todos os meses do período: a DRE de ' + anterior.ano + ' fica só com ' + ksAnt.length + ' mês(es).');

    // ---------- Balanço patrimonial no fim do mês (e do ano anterior)
    const juntasBal = mesclar(rel.balanco.linhas, comAnt ? anterior.balanco.linhas : [], (l) => l.id || 'c:' + l.conta);
    const bal = [];
    let totalAtivo = null, totalAtivoAnt = null;
    juntasBal.forEach(({ a, b }) => {
      const base = a || b;
      const valor = a ? a.valores[k] : 0;
      const valorAnt = comAnt ? (b && jFim !== undefined ? b.valores[jFim] : 0) : null;
      if (base.id === 'ativo') { bal.push({ tipo: 'secao', rotulo: 'ATIVO' }); totalAtivo = valor; totalAtivoAnt = valorAnt; return; }
      if (base.id === 'passivo') { bal.push({ tipo: 'total', id: 'totalAtivo', rotulo: 'TOTAL DO ATIVO', valor: totalAtivo, anterior: totalAtivoAnt }, { tipo: 'secao', rotulo: 'PASSIVO' }); return; }
      if (base.id === 'pl') { bal.push({ tipo: 'grupo', nivel: 2, id: 'pl', rotulo: 'Patrimônio líquido', valor, anterior: valorAnt }); return; }
      if (base.grupoPl) return;
      if (base.id === 'resultado') { bal.push({ tipo: 'conta', nivel: 3, id: 'resultado', rotulo: 'Resultado do exercício', valor, anterior: valorAnt }); return; }
      if (base.id === 'totalPassivoPl') { bal.push({ tipo: 'total', id: 'totalPassivoPl', rotulo: 'TOTAL DO PASSIVO E DO PATRIMÔNIO LÍQUIDO', valor, anterior: valorAnt }); return; }
      bal.push({ tipo: base.tipo === 'grupo' ? 'grupo' : 'conta', nivel: base.nivel, conta: base.conta, rotulo: nomeDaDemonstracao(base.rotulo), valor, anterior: valorAnt });
    });
    // Grupo com uma conta só embaixo que se divide em várias (ex.: passivo circulante > obrigações correntes > fornecedores,
    // empréstimos...): no lugar dela vão as de baixo, com o detalhe que interessa na demonstração.
    const plano = planoJunto([rel.contas].concat(comAnt ? [anterior.contas] : []));
    const saldoDaConta = (r, conta, j, sinal) => { const l = r.mensal.linhas.find((x) => x.conta === conta); return l ? sinal * (l.valores[j] || 0) : 0; };
    let sinal = 1;
    for (let i = 0; i < bal.length; i++) {
      const g = bal[i];
      if (g.tipo === 'secao') sinal = g.rotulo === 'PASSIVO' ? -1 : 1;
      if (g.tipo !== 'grupo' || !g.conta) continue;
      let fim = i + 1;
      while (fim < bal.length && bal[fim].tipo === 'conta' && !bal[fim].id) fim++;
      if (fim - i - 1 !== 1) continue;
      const netas = plano.filter((c) => c.pai === bal[i + 1].conta);
      if (netas.length < 2) continue;
      bal.splice(i + 1, 1, ...netas.map((c) => ({ tipo: 'conta', nivel: 3, conta: c.conta, rotulo: nomeDaDemonstracao(c.titulo), valor: saldoDaConta(rel, c.conta, k, sinal),
        anterior: comAnt ? (jFim === undefined ? 0 : saldoDaConta(anterior, c.conta, jFim, sinal)) : null })));
    }
    const totalPl = (bal.find((l) => l.id === 'totalPassivoPl') || {});
    const difBal = (totalAtivo || 0) - (totalPl.valor || 0);
    const difBalAnt = comAnt ? (totalAtivoAnt || 0) - (totalPl.anterior || 0) : 0;
    if (Math.abs(difBal) > 1) avisos.push('O balanço de ' + m.rotulo + ' não fecha: o ativo é ' + Util.formatarCentavos(totalAtivo) + ' e o passivo mais o patrimônio líquido, ' + Util.formatarCentavos(totalPl.valor) + '. Confira antes de imprimir.');
    if (comAnt && Math.abs(difBalAnt) > 1) avisos.push('O balanço de ' + anterior.ano + ' não fecha (diferença de ' + Util.formatarCentavos(difBalAnt) + ').');

    // ---------- DRE do período (e dos mesmos meses do ano anterior)
    const linhasDre = (r) => r.dre.mensal.linhas.filter((l) => semAcumulado(l) && l.tipo !== 'analitica' && l.id !== 'ebitda');
    const dre = mesclar(linhasDre(rel), comAnt ? linhasDre(anterior) : [], (l) => l.id).map(({ a, b }) => {
      const base = a || b;
      return { id: base.id, tipo: base.tipo, rotulo: base.rotulo, categoria: base.categoria, destaque: !!base.destaque, semLinha: !!base.semLinha,
        valor: a ? somaNos(a.valores, ks) || 0 : 0, anterior: comAnt ? (b ? somaNos(b.valores, ksAnt) || 0 : 0) : null };
    });
    const sem = dre.find((l) => l.semLinha && (l.valor || l.anterior));
    if (sem) avisos.push('Há valor em "Outras contas de resultado" (sem linha na DRE): arraste as contas para a linha certa na aba DRE antes de imprimir.');

    // ---------- Fluxo de caixa (método indireto) no período
    const cb = contasDoBalanco(rel.contas);
    let dfc = null;
    if (!cb.ac || !cb.disponivel) avisos.push('Não achei o ' + (!cb.ac ? 'ativo circulante' : 'disponível (caixa e bancos)') + ' no plano de contas: sem ele não dá para montar o fluxo de caixa.');
    else {
      const saldos = (rotulo, campo) => { const mapa = new Map(); rel.base.forEach((x) => { if (x.mes === rotulo) mapa.set(x.conta, x[campo]); }); return mapa; };
      const abertura = saldos(rel.meses[ini].rotulo, 'saldoAnterior'), fechamento = saldos(m.rotulo, 'saldoAtual');
      const delta = (c) => (fechamento.get(c.conta) || 0) - (abertura.get(c.conta) || 0);
      const porConta = new Map(rel.contas.map((c) => [c.conta, c]));
      const filhasDe = (c) => (c ? rel.contas.filter((x) => x.pai === c.conta) : []);
      const contem = (c, alvo) => { let x = alvo; while (x && x.pai) { if (x.pai === c.conta) return true; x = porConta.get(x.pai); } return false; };
      // Os grupos de baixo de uma conta, abrindo o que contém o disponível (o disponível não entra: ele é o caixa).
      const gruposSem = (pai, fora) => [].concat(...filhasDe(pai).map((c) => (c.conta === fora.conta ? [] : contem(c, fora) ? gruposSem(c, fora) : [c])));
      // Um grupo só, que se divide em várias contas: vão as de baixo (ex.: obrigações correntes > fornecedores, empréstimos...).
      const abrirUnico = (lista) => { let l = lista; while (l.length === 1 && filhasDe(l[0]).length >= 2) l = filhasDe(l[0]); return l; };
      const nome = (c) => nomeDaDemonstracao(c.titulo);
      const soma = (vs) => vs.reduce((s, v) => s + v, 0);
      const serie = (id) => (rel.dre.mensal.linhas.find((l) => l.id === id) || {}).valores || [];
      const lucro = somaNos(serie('lucroLiquido'), ks) || 0;
      const depreciacao = -(somaNos(serie('depreciacao'), ks) || 0);
      const operacionais = [], investimentos = [], financiamentos = [];
      const linha = (lista, rotulo, valor, conta) => { lista.push({ rotulo, valor, conta: conta || null }); };
      // Ativo circulante (fora o disponível): operacional.
      abrirUnico(gruposSem(cb.ac, cb.disponivel)).forEach((c) => linha(operacionais, '(Aumento) redução de ' + noMeioDaFrase(nome(c)), -delta(c), c.conta));
      // Passivo circulante: operacional, fora empréstimos, financiamentos e dividendos.
      abrirUnico(filhasDe(cb.pc)).forEach((c) => {
        const fin = DE_FINANCIAMENTO.test(nomeNormal(c.titulo));
        linha(fin ? financiamentos : operacionais, 'Aumento (redução) de ' + noMeioDaFrase(nome(c)) + (fin ? ' (curto prazo)' : ''), -delta(c), c.conta);
      });
      // Ativo não circulante: investimento (imobilizado e intangível numa linha, com a depreciação somada de volta).
      const naoCirc = abrirUnico(filhasDe(cb.anc));
      const imob = naoCirc.filter((c) => IMOBILIZADO.test(nomeNormal(c.titulo)));
      naoCirc.filter((c) => imob.indexOf(c) < 0).forEach((c) => linha(investimentos, '(Aumento) redução de ' + noMeioDaFrase(nome(c)), -delta(c), c.conta));
      if (imob.length || depreciacao) linha(investimentos, 'Aquisição de imobilizado e intangível (líquida de baixas)', -(soma(imob.map(delta)) + depreciacao));
      // Passivo não circulante: financiamento.
      abrirUnico(filhasDe(cb.pnc)).forEach((c) => linha(financiamentos, 'Aumento (redução) de ' + noMeioDaFrase(nome(c)) + ' (longo prazo)', -delta(c), c.conta));
      // Outros grupos do ativo e do passivo (planos com o realizável ou o exigível a longo prazo direto no 1º nível).
      const usados = new Set([cb.ac, cb.anc, cb.pc, cb.pnc, cb.pl].filter(Boolean).map((c) => c.conta));
      filhasDe(cb.ativo).filter((c) => !usados.has(c.conta)).forEach((c) => linha(investimentos, '(Aumento) redução de ' + noMeioDaFrase(nome(c)), -delta(c), c.conta));
      filhasDe(cb.passivo).filter((c) => !usados.has(c.conta)).forEach((c) => linha(financiamentos, 'Aumento (redução) de ' + noMeioDaFrase(nome(c)), -delta(c), c.conta));
      // O patrimônio líquido fora o lucro do período: aumento de capital, distribuição de lucros e ajustes.
      const doResultado = rel.contas.filter((c) => c.nivel === 1 && !patrimonial(c.conta));
      const resultadoAberto = (mapa) => -soma(doResultado.map((c) => mapa.get(c.conta) || 0));
      const plTotal = (mapa) => (cb.pl ? -(mapa.get(cb.pl.conta) || 0) : 0) + resultadoAberto(mapa);
      linha(financiamentos, 'Outras variações do patrimônio líquido (capital, distribuição de lucros e ajustes)', plTotal(fechamento) - plTotal(abertura) - lucro);
      const tira0 = (lista) => lista.filter((l) => Math.round(l.valor));
      const totOp = lucro + depreciacao + soma(operacionais.map((l) => l.valor));
      const totInv = soma(investimentos.map((l) => l.valor)), totFin = soma(financiamentos.map((l) => l.valor));
      const caixaInicio = abertura.get(cb.disponivel.conta) || 0, caixaFim = fechamento.get(cb.disponivel.conta) || 0;
      const aumento = totOp + totInv + totFin;
      const diferenca = caixaFim - caixaInicio - aumento;
      if (Math.abs(diferenca) > 1) avisos.push('O fluxo de caixa não fecha com o disponível por ' + Util.formatarCentavos(diferenca) + ' (o balancete de ' + m.rotulo + ' ou de ' + rel.meses[ini].rotulo + ' pode não estar fechando).');
      dfc = { lucro, depreciacao, operacionais: tira0(operacionais), investimentos: tira0(investimentos), financiamentos: tira0(financiamentos),
        totalOperacional: totOp, totalInvestimento: totInv, totalFinanciamento: totFin, aumento, caixaInicio, caixaFim, diferenca, confere: Math.abs(diferenca) <= 1,
        dataInicio: dataDoFim(rel.meses[ini].mes === 1 ? ano - 1 : ano, rel.meses[ini].mes === 1 ? 12 : rel.meses[ini].mes - 1), disponivel: cb.disponivel.conta + ' ' + cb.disponivel.titulo };
    }
    return {
      k, mes: m, data: dataDoFim(ano, m.mes), periodo, meses: ks, soMes: !!opc.soMes, falta, anterior: ant,
      balanco: { linhas: bal, totalAtivo, totalPassivoPl: totalPl.valor, fecha: Math.abs(difBal) <= 1, diferenca: difBal, fechaAnterior: !comAnt || Math.abs(difBalAnt) <= 1 },
      dre, dfc, avisos,
    };
  }

  // ------------------------------------------------------------------
  // DRE SIMULAÇÃO (Dony, 21/09/2026: "ela vai pegar o ano real de 26 e, os meses seguintes, os mesmos valores do
  // ano anterior; e eu quero ter a condição de digitar um percentual de evolução — por exemplo, digitar 10% a mais
  // para tudo, e ele ajusta 10% a mais para tudo nessa simulação").
  // Os 12 meses do ano:
  //  - mês com balancete: o valor REAL;
  //  - mês sem balancete: o MESMO mês do ano anterior × (1 + percentual), conta por conta — receitas, custos e
  //    despesas, tudo (−5 = 5% a menos). Cada conta é arredondada no centavo e os subtotais são refeitos com as
  //    contas, como na DRE: a DRE simulada fecha no centavo;
  //  - mês sem balancete nos dois anos: vazio.
  // AJUSTES (Dony, 22/09/2026: "eu quero poder incluir ajustes — por exemplo um lançamento de estoque ou custo — e que
  // ele vá para o lugar que eu defina: escolho adicionar ajuste, escolho o grupo, ponho o número e ele modifica a DRE"):
  // cada ajuste é um lançamento num MÊS e numa LINHA DA DRE, a débito (reduz o resultado: aumenta custo ou despesa,
  // diminui receita) ou a crédito (aumenta o resultado). Ele entra no subtotal da linha, aparece embaixo dela como uma
  // linha própria e refaz os totais daquele mês.
  // No fim: o realizado e o simulado (sem os ajustes), os ajustes, o ano (tudo junto) e o ano anterior (os meses que
  // ele tem), com a variação; e, na última linha, o lucro acumulado no ano mês a mês.
  // Conta que só existe num dos anos entra no lugar dela, com zero no outro (como no comparativo): conta nova no
  // ano fica zerada nos meses simulados, porque o ano anterior não tem valor dela.
  // opcoes: { percentual } em % (10 = 10% a mais); ajustes: [{ id, mes (1 a 12), linha (id da linha da DRE), lado ('D'
  // ou 'C'), valor (centavos, positivo), descricao }].
  // ------------------------------------------------------------------
  const LINHAS_DE_AJUSTE = new Set(LINHAS_DO_MAPA.map((l) => l.id));
  function simulacao(atual, anterior, opcoes) {
    const percentual = Number((opcoes && opcoes.percentual) || 0) || 0;
    const fator = 1 + percentual / 100;
    const ano = atual.ano;
    const meses = [];
    for (let n = 1; n <= 12; n++) {
      const iA = indiceDoMes(atual, n), iB = indiceDoMes(anterior, n);
      const kA = iA >= 0 && atual.meses[iA].tem ? iA : -1, kB = iB >= 0 && anterior.meses[iB].tem ? iB : -1;
      meses.push({ mes: n, comp: ano + '-' + String(n).padStart(2, '0') + '-01', rotulo: rotuloDoMes(ano, n), rotuloAnterior: rotuloDoMes(ano - 1, n), kA, kB,
        origem: kA >= 0 ? 'real' : kB >= 0 ? 'simulado' : 'vazio' });
    }
    const de = (origem) => meses.filter((m) => m.origem === origem);
    const reais = de('real'), simulados = de('simulado'), vazios = de('vazio');
    const ultimoReal = reais.length ? reais[reais.length - 1].mes : 0;
    const vazia = () => meses.map((m) => (m.origem === 'vazio' ? null : 0));

    // Contas analíticas: o valor real, o do ano anterior com o percentual ou nada; os grupos somam as contas deles.
    const juntas = mesclar(atual.dre.mensal.linhas.filter(semAcumulado), anterior.dre.mensal.linhas.filter(semAcumulado), (l) => l.id);
    const contas = new Map(); // id da conta -> 12 valores
    const doGrupo = new Map();
    juntas.forEach(({ a, b }) => {
      const l = a || b;
      if (l.tipo !== 'analitica') return;
      const vs = meses.map((m) => (m.origem === 'real' ? (a ? a.valores[m.kA] || 0 : 0)
        : m.origem === 'simulado' ? (b ? Math.round((b.valores[m.kB] || 0) * fator) || 0 : 0) : null));
      contas.set(l.id, vs);
      const g = doGrupo.get(l.grupo) || vazia();
      doGrupo.set(l.grupo, g.map((x, i) => (x === null ? null : x + vs[i])));
    });

    // Os ajustes: o mês tem que ter valor (real ou simulado) e a linha tem que ser uma linha da DRE.
    const lidos = ((opcoes && opcoes.ajustes) || []).map((a) => {
      const m = meses[(Number(a && a.mes) || 0) - 1];
      const valor = Math.round(Number(a && a.valor) || 0);
      const motivo = !m ? 'mês que não existe' : m.origem === 'vazio' ? m.rotulo + ' não tem balancete em nenhum dos dois anos'
        : !LINHAS_DE_AJUSTE.has(a.linha) ? 'linha da DRE que não existe' : !(valor > 0) ? 'valor zerado' : null;
      return { a, m, valor, efeito: (a && a.lado === 'C' ? 1 : -1) * valor, motivo };
    });
    const usados = lidos.filter((x) => !x.motivo).sort((x, y) => x.m.mes - y.m.mes);
    const doGrupoComAjuste = new Map(Array.from(doGrupo.entries()).map(([k, v]) => [k, v.slice()]));
    usados.forEach((x) => {
      const g = doGrupoComAjuste.get(x.a.linha) || vazia();
      g[x.m.mes - 1] += x.efeito;
      doGrupoComAjuste.set(x.a.linha, g);
    });
    // Subtotais e totais pelo modelo da DRE, sem e com os ajustes.
    function totaisPeloModelo(grupos) {
      const v = new Map();
      for (const g of MODELO_DRE) {
        if (g.prefixos) { v.set(g.id, grupos.get(g.id) || vazia()); continue; }
        v.set(g.id, meses.map((m, i) => {
          if (m.origem === 'vazio') return null;
          let s = 0;
          (g.soma || []).forEach((id) => { s += v.get(id)[i] || 0; });
          (g.menos || []).forEach((id) => { s -= v.get(id)[i] || 0; });
          return s;
        }));
      }
      return v;
    }
    const sem = totaisPeloModelo(doGrupo), com = totaisPeloModelo(doGrupoComAjuste);

    // As colunas do fim: realizado e simulado (sem os ajustes), os ajustes, o ano e o ano anterior (os meses dele).
    const posicoes = (lista) => lista.map((m) => m.mes - 1);
    const iReais = posicoes(reais), iSimulados = posicoes(simulados), iAno = posicoes(reais.concat(simulados));
    const kAnt = anterior.meses.map((m, j) => (m.tem ? j : -1)).filter((j) => j >= 0);
    const rlAnterior = (anterior.dre.mensal.linhas.find((l) => l.id === 'receitaLiquida') || {}).valores;
    const rlAno = somaNos(com.get('receitaLiquida'), iAno), rlAnt = somaNos(rlAnterior, kAnt);
    const porGrupo = new Map(); // linha da DRE -> ajustes dela
    usados.forEach((x) => { if (!porGrupo.has(x.a.linha)) porGrupo.set(x.a.linha, []); porGrupo.get(x.a.linha).push(x); });
    const linhas = juntas.map(({ a, b }) => {
      const base = a || b;
      const analitica = base.tipo === 'analitica';
      const semAj = analitica ? contas.get(base.id) : sem.get(base.id);
      const vs = analitica ? semAj : com.get(base.id);
      const noAno = somaNos(vs, iAno);
      const noAnterior = b ? somaNos(b.valores, kAnt) : kAnt.length ? 0 : null;
      return Object.assign({ id: base.id, tipo: base.tipo, grupo: base.grupo, conta: base.conta, rotulo: base.rotulo, categoria: base.categoria, destaque: !!base.destaque,
        semLinha: !!base.semLinha, soNoAnterior: !a, soNoAtual: !b, valores: vs, realizado: somaNos(semAj, iReais), simulado: somaNos(semAj, iSimulados),
        ajustes: usados.length ? (noAno || 0) - (somaNos(semAj, iAno) || 0) : null, nAjustes: base.tipo === 'grupo' ? (porGrupo.get(base.id) || []).length : 0,
        ano: noAno, anterior: noAnterior, avAno: div(noAno, rlAno), avAnterior: div(noAnterior, rlAnt) }, variacao(noAno, noAnterior));
    });
    linhas.forEach((l) => { if (l.tipo === 'grupo') l.filhas = linhas.filter((x) => x.tipo === 'analitica' && x.grupo === l.id).length; });
    // Cada ajuste é uma linha embaixo da linha da DRE dele, depois das contas.
    porGrupo.forEach((lista, g) => {
      let fim = -1;
      linhas.forEach((l, i) => { if (l.id === g || (l.tipo === 'analitica' && l.grupo === g)) fim = i; });
      const categoria = (MODELO_DRE.find((x) => x.id === g) || {}).categoria;
      linhas.splice(fim + 1, 0, ...lista.map((x) => ({ id: 'ajuste:' + x.a.id, tipo: 'ajuste', grupo: g, categoria, rotulo: x.a.descricao || 'Ajuste', mes: x.m.mes,
        ajuste: { id: x.a.id, mes: x.m.mes, linha: g, lado: x.a.lado === 'C' ? 'C' : 'D', valor: x.valor, descricao: x.a.descricao || '' },
        valores: meses.map((m, i) => (i === x.m.mes - 1 ? x.efeito : null)), realizado: null, simulado: null, ajustes: x.efeito, ano: x.efeito, anterior: null,
        avAno: div(x.efeito, rlAno), avAnterior: null, varR: null, varP: null })));
    });
    // O lucro acumulado no ano, mês a mês (com os ajustes), na última linha.
    const acumulado = acumuladoNoAno(meses.map((m) => m.origem !== 'vazio'), com.get('lucroLiquido'), com.get('receitaLiquida'), 1);
    linhas.push(Object.assign(linhaAcumulada(acumulado.valores, acumulado.receitas), { realizado: null, simulado: null, ajustes: null, ano: null, anterior: null,
      avAno: null, avAnterior: null, varR: null, varP: null }));

    // Conferência: nos meses reais, cada linha é a da DRE mensal do ano (fora os ajustes); nos simulados, a receita
    // líquida é a do ano anterior com o percentual (a diferença, se houver, é o arredondamento de cada conta no centavo).
    const reaisConferem = juntas.every(({ a }) => !a || reais.every((m) => ((a.tipo === 'analitica' ? contas.get(a.id) : sem.get(a.id))[m.mes - 1] || 0) === (a.valores[m.kA] || 0)));
    return {
      percentual, fator, ano, anoAnterior: anterior.ano, meses, linhas,
      reais: reais.map((m) => m.mes), simulados: simulados.map((m) => m.mes), vazios: vazios.map((m) => m.mes),
      // Mês sem balancete no meio dos reais: entra pela simulação também (a tela avisa).
      lacunas: simulados.filter((m) => m.mes < ultimoReal).map((m) => m.mes),
      // Meses reais que o ano anterior não tem: o total dele fica sem esses meses.
      faltamNoAnterior: reais.filter((m) => m.kB < 0).map((m) => m.mes),
      mesesAnterior: kAnt.map((j) => anterior.meses[j].mes),
      // Contas novas no ano (com valor nos meses reais): zeradas nos meses simulados.
      novas: linhas.filter((l) => l.tipo === 'analitica' && l.soNoAtual && l.realizado).map((l) => ({ conta: l.conta, rotulo: l.rotulo })),
      // Os ajustes que entraram (com o efeito no lucro: + crédito, − débito) e os que não entraram (e por quê).
      ajustes: usados.map((x) => Object.assign({}, x.a, { valor: x.valor, efeito: x.efeito, rotuloMes: x.m.rotulo, origem: x.m.origem })),
      ajustesFora: lidos.filter((x) => x.motivo).map((x) => ({ ajuste: x.a, motivo: x.motivo })),
      efeitoAjustes: usados.reduce((s, x) => s + x.efeito, 0),
      acumulado: { semJaneiro: acumulado.semJaneiro, paraEm: acumulado.paraEm === null ? null : meses[acumulado.paraEm].rotulo },
      conferencia: { reais: reaisConferem, receitaBase: somaNos(rlAnterior, simulados.map((m) => m.kB)), receitaSimulada: somaNos(sem.get('receitaLiquida'), iSimulados) },
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

  return { montar, compararBalancetes, indicadores, comparativo, simulacao, demonstracoes, nomeDaDemonstracao, noMeioDaFrase, INDICADORES, contasDoBalanco, MODELO_DRE, FORA_DA_DRE, PARAMETROS, AJUSTES_MODELO, CONTA_PAT_MODELO, PREMISSAS, rotuloMes, compararContas, valorUsado,
    LINHAS_DO_MAPA, sugerirMapaDre, mapaDoModelo, reclassificarConta, planoJunto, linhaNoMapa, linhaDoModelo, avaliarModelo, linhasSugeridas, nomeNormal };
});
