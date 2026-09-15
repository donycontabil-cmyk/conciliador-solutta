/*
 * Conciliador Solutta — tela-passo3.js
 * Painel dos passos no modelo "Conciliar A × B" (modelo aging):
 *  - Passo ③ Fornecedores × contas a pagar (pedido do Dony 14/09/2026);
 *  - Passo ② Adiantamento × financeiro (Dony, 15/09/2026: "exatamente igual: lado A o aging
 *    anterior mais o razão, lado B o aging do mês, as mesmas regras, do mesmo jeito").
 * A ponte: aging do mês passado + movimento do razão do mês = a contabilidade (esperado);
 * a sobra tem que bater com o aging do mês. O que não bate aparece para conciliar à MÃO
 * (juntar fornecedores que a régua não juntou — instituição de pagamento, variação de nome).
 * O que muda de um passo para o outro está em PASSOS_AB. Grava sozinho a cada decisão.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = raiz.MotorTerceiro;
  const MN = raiz.MotorNomes;
  const SEM = MN.SEM_FORNECEDOR;

  function app() { return raiz.App; }

  const SIT = {
    'bate': ['verde', 'bate'],
    'conciliada': ['azul', 'conciliada à mão'],
    'diferenca': ['vermelho', 'diferença'],
    'so-razao': ['cinza', 'só no razão (comprou e pagou no mês)'],
    'so-anterior': ['ambar', 'sumiu (só no mês passado)'],
    'so-aging': ['ambar', 'só no aging do mês'],
    'sem-fornecedor': ['vermelho', 'sem fornecedor'],
  };
  function pil(s) { const x = SIT[s] || ['cinza', s]; return '<span class="pilula ' + x[0] + '">' + T.esc(x[1]) + '</span>'; }

  let E = null;

  // O que muda entre os passos A × B. "aumento"/"reducao" são os nomes, na tela, de quem aumenta
  // e de quem diminui o saldo da conta (o motor chama de nota e baixa; ver MotorTerceiro.ladosDoRazao).
  const PASSOS_AB = {
    passo3: {
      id: 'passo3', numero: '③', tipo: 'fornecedor_pagar', titulo: 'Fornecedores × contas a pagar',
      natureza: 'fornecedores', tipoFinanceiro: 'financeiro_pagar', papelRazao: 'principal',
      nomeAging: 'aging (contas a pagar)', nomeRazao: 'razão de fornecedores',
      aumento: 'nota', reducao: 'baixa', aumentos: 'notas', reducoes: 'baixas', ladoAumento: 'créditos', ladoReducao: 'débitos',
      avisoAntes: 'baixa com data antes da nota', avisoCurto: 'baixa antes da nota',
    },
    passo2: {
      id: 'passo2', numero: '②', tipo: 'adiantamento_financeiro', titulo: 'Adiantamento × financeiro',
      natureza: 'adiantamento', tipoFinanceiro: 'financeiro_adiantamento', papelRazao: 'adiantamento',
      nomeAging: 'aging de adiantamentos', nomeRazao: 'razão de adiantamento a fornecedores',
      aumento: 'adiantamento', reducao: 'compensação', aumentos: 'adiantamentos', reducoes: 'compensações', ladoAumento: 'débitos', ladoReducao: 'créditos',
      avisoAntes: 'compensação com data antes do adiantamento', avisoCurto: 'compensação antes do adiantamento',
    },
  };
  function configDoPasso(passoId) { return PASSOS_AB[passoId] || PASSOS_AB.passo3; }
  function primeiraMaiuscula(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  // Saldo inicial escolhido: 'razao' (conforme o razão do mês anterior) ou 'aging' (padrão).
  // Aceita os nomes da versão 13: 'continuar' = razão; 'zero' = aging.
  function modoDoInicio(inicio) {
    const m = inicio && inicio.modo;
    return m === 'razao' || m === 'continuar' ? 'razao' : 'aging';
  }

  // Tudo o que um passo A × B precisa de um mês: arquivos, registro, cálculo e itens A e B.
  // Usado pela tela e pelo relatório (tela-relatorio3.js). Devolve null se a rota mudou no meio.
  // opcoes: { passo: 'passo3' | 'passo2', semAnterior }
  async function carregarDados(codigo, anoMes, conferir, opcoes) {
    const cfg = configDoPasso(opcoes && opcoes.passo);
    const arm = app().armazenamento;
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    const comp = anoMes + '-01';
    if (!emp) return { erro: 'Empresa não cadastrada.' };
    // O registro vem primeiro: nele está o PERÍODO escolhido na tela (Dony, 15/09/2026: "lá dentro
    // eu escolho o período que estou conciliando, um mês ou um período; aí ele já sabe o que é").
    const idReg = idDoRegistro(codigo, anoMes, cfg);
    const concs = await arm.conciliacoes(codigo, comp);
    const registro = concs.find((c) => c.id === idReg) || { id: idReg, codigo, tipo: cfg.tipo, competencia: comp, situacao: 'andamento', arquivos: [], decisoes: {}, resumo: {} };
    const d = registro.decisoes || {};
    const periodoDe = inicioDoPeriodo(d.periodoDe, comp);
    const metas = await arm.arquivos(codigo);
    const arqs = arquivosDoPasso(metas, comp, cfg.id, { de: periodoDe });
    if (conferir && !conferir()) return null;
    const falta = [];
    if (!arqs.agingAnterior) falta.push('o ' + cfg.nomeAging + ' de ' + U.nomeCompetencia(arqs.compAnterior));
    if (!arqs.agingAtual) falta.push('o ' + cfg.nomeAging + ' de ' + U.nomeCompetencia(comp));
    if (!arqs.razao) falta.push('o ' + cfg.nomeRazao + ' de ' + nomeDoPeriodo(periodoDe, comp));
    if (falta.length) return { emp, comp, falta, cfg, arqs, registro, periodoDe };
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const [aAnt, aAtu, raz] = await Promise.all([carregar(arqs.agingAnterior), carregar(arqs.agingAtual), carregar(arqs.razao)]);
    if (conferir && !conferir()) return null;

    const decisoes = { donos: d.donos || {}, conciliadas: d.conciliadas || [], observacoes: d.observacoes || {}, conciliacoesAB: d.conciliacoesAB || [], historico: d.historico || [], inicio: d.inicio || null };
    if (periodoDe) decisoes.periodoDe = periodoDe;
    // Lançamentos da Parte A: os do PERÍODO escolhido (do começo do período ao fim do mês). Sem
    // período, só os do mês (vale também para um razão de vários meses usado num mês do meio).
    const todosLancamentos = raz.conteudo.conta.lancamentos || [];
    const deNum = U.inicioDaCompetencia(arqs.periodo ? arqs.periodo.de : comp).numero, ateNum = U.fimDaCompetencia(comp).numero;
    const lancamentosDoMes = todosLancamentos.filter((l) => { const n = U.montarData(l.dia, l.mes, l.ano); return !!n && n.numero >= deNum && n.numero <= ateNum; });
    const razaoDoMes = { total: todosLancamentos.length, doMes: lancamentosDoMes.length, periodo: raz.conteudo.periodo || raz.meta.periodo || null, dePeriodo: !!arqs.periodo };
    // Mês anterior (o do aging anterior): o que ficou em aberto nele, para o saldo inicial conforme o razão.
    const anterior = (opcoes && opcoes.semAnterior) ? null : await pendenciasDoMesAnterior(codigo, arqs.compAnterior, cfg);
    if (conferir && !conferir()) return null;
    const nomeRazao = nomeDoPeriodo(periodoDe, comp);
    const entrada = {
      competencia: comp, natureza: cfg.natureza,
      mesAnterior: U.nomeCompetencia(arqs.compAnterior), mesAtual: U.nomeCompetencia(comp), nomeRazao,
      contaRazao: { conta: raz.conteudo.conta, lancamentos: lancamentosDoMes },
      agingAnterior: aAnt.conteudo, agingAtual: aAtu.conteudo, decisoes,
    };
    if (modoDoInicio(decisoes.inicio) === 'razao' && anterior && anterior.pendencias) entrada.continuacao = anterior.pendencias;
    const r = M.calcular(entrada);
    const itens = M.itensAB(entrada, r);
    const arrumado = M.arrumarGruposAB(decisoes.conciliacoesAB, itens.legado);
    decisoes.conciliacoesAB = arrumado.grupos;
    return { emp, comp, arquivos: { aAnt, aAtu, raz }, registro, entrada, decisoes, r, itens, arrumou: arrumado.mudou, anterior, cfg, razaoDoMes, arqs, periodoDe };
  }

  function idDoRegistro(codigo, anoMes, cfg) { return 'F-' + codigo + '-' + cfg.tipo + '-' + anoMes; }

  // Começo do período escolhido ('AAAA-MM-01'), só se for antes do mês da conciliação.
  function inicioDoPeriodo(de, comp) {
    return /^\d{4}-\d{2}-01$/.test(String(de || '')) && de < comp ? de : null;
  }
  // "agosto/2026" ou "abril a agosto/2026" (ou "novembro/2025 a agosto/2026").
  function nomeDoPeriodo(de, comp) {
    if (!de) return U.nomeCompetencia(comp);
    const mesmoAno = de.slice(0, 4) === comp.slice(0, 4);
    return (mesmoAno ? U.nomeCompetencia(de).replace(/\/\d{4}$/, '') : U.nomeCompetencia(de)) + ' a ' + U.nomeCompetencia(comp);
  }

  // Pendências do mês anterior (o que ficou em aberto na A e na B dele), do MESMO passo. Vêm do
  // registro do mês anterior; registro de antes desta versão (sem pendências) é calculado com os
  // arquivos dele, do zero. Sem conciliação no mês anterior não há do que continuar.
  // compAnt = a competência do aging anterior (o mês passado, ou o mês antes do começo do razão).
  async function pendenciasDoMesAnterior(codigo, compAnt, cfg) {
    const arm = app().armazenamento;
    const idAnt = idDoRegistro(codigo, U.anoMes(compAnt), cfg);
    const reg = (await arm.conciliacoes(codigo, compAnt)).find((c) => c.id === idAnt) || null;
    if (!reg) return { competencia: compAnt, pendencias: null };
    if (reg.pendencias) return { competencia: compAnt, pendencias: reg.pendencias, registro: reg };
    const dadosAnt = await carregarDados(codigo, U.anoMes(compAnt), null, { semAnterior: true, passo: cfg.id });
    if (!dadosAnt || dadosAnt.erro || dadosAnt.falta) return { competencia: compAnt, pendencias: null, registro: reg };
    return { competencia: compAnt, pendencias: M.pendenciasAB(dadosAnt.itens, dadosAnt.decisoes.conciliacoesAB, compAnt), registro: reg, calculado: true };
  }

  async function mostrar(el, codigo, anoMes, conferir, passoId) {
    const cfg = configDoPasso(passoId);
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + anoMes;
    T.carregando(el, 'Abrindo o Passo ' + cfg.numero + ' de ' + U.nomeCompetencia(comp) + '…');
    const dados = await carregarDados(codigo, anoMes, conferir, { passo: cfg.id });
    if (!dados) return;
    if (dados.erro) { el.innerHTML = '<div class="aviso ambar">' + T.esc(dados.erro) + ' <a href="#/">Voltar</a></div>'; return; }
    if (dados.falta) {
      // Os arquivos sobem AQUI, cada um no seu lugar (Dony, 15/09/2026).
      const ctx = { cfg, codigo, comp, arqs: dados.arqs, periodoDe: dados.periodoDe, registro: dados.registro };
      el.innerHTML = '<a class="voltar" href="' + voltar + '">← Fornecedores · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="cabecalho"><div class="titulos"><h1>Passo ' + cfg.numero + ' · ' + T.esc(cfg.titulo) + '</h1>' +
        '<p class="suave">' + T.esc(dados.emp.codigo + ' · ' + dados.emp.nome) + ' · ' + U.nomeCompetencia(comp) + '</p></div></div>' +
        '<div class="aviso info" style="margin-bottom:12px"><span class="icone-aviso">📁</span><div><b>Escolha o período e suba cada arquivo no seu lugar.</b> ' +
        'O programa sabe o que é pelo lugar onde você coloca — não precisa adivinhar nada. Falta: ' + dados.falta.map(T.esc).join('; ') + '.</div></div>' +
        painelArquivos(ctx, false, true);
      ligarPainel(el.querySelector('.arquivos-passo'), ctx);
      return;
    }

    el.innerHTML = '<div class="tela-passo3"></div>';
    E = {
      el: el.firstChild, codigo, comp, emp: dados.emp, voltar, registro: dados.registro, cfg,
      arquivos: dados.arquivos, entrada: dados.entrada, decisoes: dados.decisoes,
      aba: app().lerLocal('conciliador-solutta.aba-' + cfg.id) || 'ab',
      filtros: {}, abertos: new Set(), guardadoEm: dados.registro.atualizadoEm || null, fila: Promise.resolve(),
      incluirAnterior: app().lerLocal('conciliador-solutta.ab-anterior') !== '0',
      selA: new Set(), selB: new Set(), abertosAB: new Set(), idDoItem: new Map(),
      r: dados.r, itens: dados.itens, porChave: new Map(dados.r.fornecedores.map((f) => [f.chave, f])),
      anterior: dados.anterior, razaoDoMes: dados.razaoDoMes, arqs: dados.arqs, periodoDe: dados.periodoDe,
    };
    if (E.aba !== 'ab' && abasOcultas().has(E.aba)) E.aba = 'ab';
    desenharTudo();
    // Pendências gravadas desatualizadas (registro de antes desta versão, troca do início,
    // arquivo trocado): regrava para o mês seguinte continuar do jeito certo.
    const pendenciasDeAgora = JSON.stringify(M.pendenciasAB(E.itens, E.decisoes.conciliacoesAB, E.comp));
    if (dados.arrumou || (dados.registro.atualizadoEm && JSON.stringify(dados.registro.pendencias || null) !== pendenciasDeAgora)) gravar(null);
  }

  // Escolhe os arquivos de um passo A × B para o período escolhido (opcoes.de = começo do
  // período; sem ele, só o mês):
  //  - aging anterior = o do mês ANTES do começo do período (período abril a agosto → março);
  //  - aging do mês = o do fim do período;
  //  - razão = o guardado nesta conciliação (competência do fim). Só para um mês, vale também um
  //    razão de vários meses guardado em outra competência que cobre o mês inteiro.
  //  ③: contas a pagar + razão de fornecedores · ②: aging de adiantamentos + razão de adiantamento.
  function arquivosDoPasso(metas, comp, passoId, opcoes) {
    const cfg = configDoPasso(passoId);
    const de = inicioDoPeriodo(opcoes && opcoes.de, comp);
    const compAnterior = U.somarMeses(de || comp, -1);
    const maisNovo = (lista) => lista.slice().sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm))[0] || null;
    const agings = (c) => metas.filter((m) => m.tipo === cfg.tipoFinanceiro && m.competencia === c);
    const daConta = (m) => m.tipo === 'razao' && m.conta && m.conta.familia === 'fornecedores' && m.conta.papel === cfg.papelRazao;
    const inicio = U.inicioDaCompetencia(comp), fim = U.fimDaCompetencia(comp);
    const cobre = (m) => {
      const a = m.periodo && U.lerData(m.periodo.de), b = m.periodo && U.lerData(m.periodo.ate);
      return !!(a && b && a.numero <= inicio.numero && b.numero >= fim.numero);
    };
    const exato = maisNovo(metas.filter((m) => daConta(m) && m.competencia === comp));
    const razao = exato || (de ? null : maisNovo(metas.filter((m) => daConta(m) && cobre(m))));
    // O razão guardado aqui começa antes do período escolhido: a tela oferece conciliar o período dele.
    const inicioRazao = razao && razao.periodo && U.lerData(razao.periodo.de);
    const sugestaoDe = exato && inicioRazao && U.competenciaDe(inicioRazao) < (de || comp) ? U.competenciaDe(inicioRazao) : null;
    return { agingAnterior: maisNovo(agings(compAnterior)), agingAtual: maisNovo(agings(comp)), razao, compAnterior,
      periodo: de ? { de, ate: comp } : null, sugestaoDe };
  }
  function arquivosDoTerceiro(metas, comp) { return arquivosDoPasso(metas, comp, 'passo3'); }

  // ------------------------------------------------------------------
  // PERÍODO e ARQUIVOS da conciliação (Dony, 15/09/2026): "quero subir os arquivos quando estiver
  // dentro da conciliação; o sistema fica tentando adivinhar o que é o quê. Lá dentro eu escolho o
  // período (um mês ou um período) e aí, quando receber o arquivo, ele já sabe o que é."
  // Cada arquivo tem o seu lugar: o lugar diz o tipo, a competência e o papel da conta.
  // ------------------------------------------------------------------
  function contextoDoPainel() {
    return { cfg: E.cfg, codigo: E.codigo, comp: E.comp, arqs: E.arqs, periodoDe: E.periodoDe, registro: E.registro };
  }

  // Os lugares de arquivo do passo (desenhados e subidos pela peça comum, TelaSubir).
  function lugaresDoPasso(ctx) {
    const { cfg, comp, arqs, periodoDe } = ctx;
    const periodo = nomeDoPeriodo(periodoDe, comp);
    return [
      { id: 'razao', parte: 'Parte A · contabilidade', titulo: primeiraMaiuscula(cfg.nomeRazao), sub: periodo, nome: cfg.nomeRazao + ' de ' + periodo, log: cfg.id + '/razao',
        tipo: 'razao', papel: cfg.papelRazao, competencia: comp, periodo: { de: periodoDe || comp, ate: comp }, nomePeriodo: periodo, arquivos: arqs.razao ? [arqs.razao] : [] },
      { id: 'anterior', parte: 'Parte A · saldo inicial', titulo: primeiraMaiuscula(cfg.nomeAging), sub: U.nomeCompetencia(arqs.compAnterior) + (periodoDe ? ' (mês antes do período)' : ' (mês anterior)'),
        nome: cfg.nomeAging + ' de ' + U.nomeCompetencia(arqs.compAnterior), log: cfg.id + '/anterior', tipo: cfg.tipoFinanceiro, competencia: arqs.compAnterior, arquivos: arqs.agingAnterior ? [arqs.agingAnterior] : [] },
      { id: 'atual', parte: 'Parte B · financeiro', titulo: primeiraMaiuscula(cfg.nomeAging), sub: U.nomeCompetencia(comp),
        nome: cfg.nomeAging + ' de ' + U.nomeCompetencia(comp), log: cfg.id + '/atual', tipo: cfg.tipoFinanceiro, competencia: comp, arquivos: arqs.agingAtual ? [arqs.agingAtual] : [] },
    ];
  }

  function chaveDoPainel(ctx) { return ctx.codigo + '|' + ctx.cfg.id + '|' + ctx.comp; }

  // aberto = abre sozinho; fixo = sempre à vista, sem "Fechar" (quando falta arquivo).
  function painelArquivos(ctx, aberto, fixo) {
    const { cfg, comp, arqs, periodoDe } = ctx;
    const opcoes = [['', 'Só ' + U.nomeCompetencia(comp)]];
    for (let i = 1; i <= 23; i++) { const de = U.somarMeses(comp, -i); opcoes.push([de, nomeDoPeriodo(de, comp)]); }
    const sugestao = arqs.sugestaoDe && arqs.razao && arqs.razao.periodo
      ? '<div class="aviso info" style="margin:0 0 10px"><span class="icone-aviso">📅</span><div>O razão guardado vai de <b>' + T.esc(arqs.razao.periodo.de) + ' a ' + T.esc(arqs.razao.periodo.ate) + '</b>. ' +
        '<button type="button" class="botao pequeno" data-usar-periodo="' + arqs.sugestaoDe + '">Conciliar o período ' + T.esc(nomeDoPeriodo(arqs.sugestaoDe, comp)) + '</button></div></div>' : '';
    return raiz.TelaSubir.painel({
      chave: chaveDoPainel(ctx), titulo: 'Período e arquivos desta conciliação', resumo: nomeDoPeriodo(periodoDe, comp), aberto, fixo, lugares: lugaresDoPasso(ctx),
      antes: '<div class="linha-flex periodo-passo"><label class="pequeno" for="periodo-de"><b>Período da conciliação</b></label>' +
        '<select class="filtro" id="periodo-de" data-periodo-de>' + opcoes.map((o) => '<option value="' + o[0] + '"' + ((periodoDe || '') === o[0] ? ' selected' : '') + '>' + T.esc(o[1]) + '</option>').join('') + '</select>' +
        '<span class="suave pequeno">Parte A = ' + T.esc(cfg.nomeAging) + ' de ' + T.esc(U.nomeCompetencia(arqs.compAnterior)) + ' + razão de ' + T.esc(nomeDoPeriodo(periodoDe, comp)) +
        ' · Parte B = ' + T.esc(cfg.nomeAging) + ' de ' + T.esc(U.nomeCompetencia(comp)) + '</span></div>' + sugestao,
    });
  }

  function ligarPainel(el, ctx) {
    if (!el) return;
    raiz.TelaSubir.ligar(el, ctx.codigo, lugaresDoPasso(ctx));
    el.addEventListener('change', async (ev) => {
      const per = ev.target.closest('[data-periodo-de]');
      if (per) await mudarPeriodo(ctx, per.value, per);
    });
    el.addEventListener('click', async (ev) => {
      const u = ev.target.closest('[data-usar-periodo]');
      if (u) await mudarPeriodo(ctx, u.getAttribute('data-usar-periodo'));
    });
  }

  async function mudarPeriodo(ctx, valor, select) {
    const arm = app().armazenamento;
    const novo = inicioDoPeriodo(valor, ctx.comp);
    const atual = ctx.periodoDe || null;
    if (novo === atual) return;
    try {
      // Lê o registro de agora (a tela aberta pode ter gravado conciliações depois de desenhar o painel).
      if (E && E.registro && E.registro.id === ctx.registro.id) await E.fila;
      const guardado = (await arm.conciliacoes(ctx.codigo, ctx.comp)).find((c) => c.id === ctx.registro.id) || ctx.registro;
      const qtd = ((guardado.decisoes && guardado.decisoes.conciliacoesAB) || []).length;
      if (qtd) {
        const ok = await T.confirmar({
          titulo: 'Mudar o período da conciliação?',
          texto: 'O período passa a ser <b>' + T.esc(nomeDoPeriodo(novo, ctx.comp)) + '</b>. Os itens da Parte A mudam, então as <b>' + qtd + '</b> conciliações deste passo serão <b>desfeitas</b> para conciliar de novo.',
          botao: 'Mudar o período', perigo: true,
        });
        if (!ok) { if (select) select.value = atual || ''; return; }
      }
      const decisoes = Object.assign({}, guardado.decisoes || {});
      if (novo) decisoes.periodoDe = novo; else delete decisoes.periodoDe;
      if (qtd) decisoes.conciliacoesAB = [];
      decisoes.historico = (decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome,
        texto: 'Período: ' + nomeDoPeriodo(novo, ctx.comp) + (qtd ? ' (desfez ' + qtd + ' conciliações)' : '') }]).slice(-200);
      await arm.salvarConciliacao(Object.assign({}, guardado, { decisoes, situacao: 'andamento' }));
      await arm.registrarNoLog({ codigo: ctx.codigo, acao: 'periodo-da-conciliacao', alvo: ctx.registro.id, detalhe: nomeDoPeriodo(novo, ctx.comp) });
      T.avisoRapido('Período: ' + nomeDoPeriodo(novo, ctx.comp) + '.', 'ok');
      app().mostrarRota();
    } catch (e) {
      if (select) select.value = atual || '';
      T.avisoRapido('Não foi possível mudar o período: ' + T.mensagemDeErro(e), 'erro');
    }
  }

  function calcular() {
    E.entrada.decisoes = E.decisoes;
    E.r = M.calcular(E.entrada);
    E.porChave = new Map(E.r.fornecedores.map((f) => [f.chave, f]));
    E.itens = M.itensAB(E.entrada, E.r);
  }

  function resumoParaGravar() {
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    return Object.assign({}, E.r.resumo, {
      conciliacoesAB: E.decisoes.conciliacoesAB.length,
      abertosA: ab.abertosA.length, abertosB: ab.abertosB.length, diferencaAB: ab.valorA - ab.valorB,
    });
  }

  function gravar(acao, detalhe) {
    E.fila = E.fila.then(async () => {
      const arm = app().armazenamento;
      const reg = Object.assign({}, E.registro, {
        situacao: 'andamento',
        arquivos: [E.arquivos.aAnt.meta.id, E.arquivos.aAtu.meta.id, E.arquivos.raz.meta.id],
        decisoes: E.decisoes, resumo: resumoParaGravar(),
        // O que ficou em aberto: o mês seguinte pode continuar daqui.
        pendencias: M.pendenciasAB(E.itens, E.decisoes.conciliacoesAB, E.comp),
      });
      try {
        E.registro = await arm.salvarConciliacao(reg);
        E.guardadoEm = E.registro.atualizadoEm;
        if (acao) await arm.registrarNoLog({ codigo: E.codigo, acao, alvo: E.registro.id, detalhe: detalhe || '' });
        const g = E.el.querySelector('#guardado'); if (g) g.textContent = 'guardado às ' + U.horaLocal(E.guardadoEm);
      } catch (e) { T.avisoRapido('Não foi possível gravar: ' + T.mensagemDeErro(e), 'erro'); }
    });
    return E.fila;
  }

  function historico(texto) {
    E.decisoes.historico = (E.decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome, texto }]).slice(-200);
  }

  // ------------------------------------------------------------------
  function desenharTudo() {
    const r = E.r;
    // Quadro de arquivos escondido (abre pelo botão de cima); abre sozinho quando o razão guardado
    // começa antes do período e nada foi conciliado ainda. Vem antes do cabeçalho: o botão mostra se está aberto.
    const painel = painelArquivos(contextoDoPainel(), !!(E.arqs && E.arqs.sugestaoDe) && !(E.decisoes.conciliacoesAB || []).length, false);
    E.el.innerHTML =
      '<a class="voltar" href="' + E.voltar + '">← Fornecedores · ' + U.nomeCompetencia(E.comp) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Passo ' + E.cfg.numero + ' · ' + T.esc(E.cfg.titulo) + '</h1>' +
      '<p class="suave">' + T.esc(E.emp.codigo + ' · ' + E.emp.nome) + ' · ' + U.nomeCompetencia(E.comp) + '</p>' +
      '<p class="suave pequeno">Conta ' + T.esc(r.conta.codigo + ' · ' + r.conta.nome) + ' · aging de ' + T.esc(E.entrada.mesAnterior) + ' e de ' + T.esc(E.entrada.mesAtual) + '</p>' +
      (E.razaoDoMes && E.razaoDoMes.dePeriodo
        ? '<p class="pequeno" style="color:var(--azul)">📅 Conciliação do período <b>' + T.esc(E.entrada.nomeRazao) + '</b>: Parte A = aging de ' + T.esc(E.entrada.mesAnterior) +
          ' + os <b>' + E.razaoDoMes.doMes + '</b> lançamentos do razão' + (E.razaoDoMes.periodo ? ' (' + T.esc(E.razaoDoMes.periodo.de) + ' a ' + T.esc(E.razaoDoMes.periodo.ate) + ')' : '') + '; Parte B = aging de ' + T.esc(E.entrada.mesAtual) + '.</p>'
        : E.razaoDoMes && E.razaoDoMes.doMes !== E.razaoDoMes.total
          ? '<p class="pequeno" style="color:var(--azul)">📅 Razão ' + (E.razaoDoMes.periodo ? 'de ' + T.esc(E.razaoDoMes.periodo.de) + ' a ' + T.esc(E.razaoDoMes.periodo.ate) : 'de vários meses') +
            ': a Parte A usa só os <b>' + E.razaoDoMes.doMes + '</b> lançamentos de ' + T.esc(E.entrada.mesAtual) + ' (de ' + E.razaoDoMes.total + ' no arquivo).</p>' : '') +
      '</div>' +
      '<div class="linha-flex" style="gap:12px"><span class="guardado" id="guardado" title="Cada decisão é gravada na hora">' + (E.guardadoEm ? 'guardado às ' + U.horaLocal(E.guardadoEm) : 'nenhuma decisão tomada ainda') + '</span>' +
      // Arquivos em cima à direita (Dony, 15/09/2026: "um lugar de carregar novos arquivos" e excluir).
      raiz.TelaSubir.botao(chaveDoPainel(contextoDoPainel())) +
      '<a class="botao pequeno" href="#/empresa/' + encodeURIComponent(E.codigo) + '/fornecedores/' + U.anoMes(E.comp) + '/' + E.cfg.id + '-relatorio" title="Relatório da conciliação para imprimir, salvar em PDF ou baixar em Excel">📄 Relatório</a>' +
      '<button type="button" class="botao pequeno perigo" data-acao="limpar-conciliacao" title="Apagar tudo o que foi feito neste passo num mês e começar do zero">🧹 Limpar conciliação</button></div></div>' +
      painel +
      desenharPonte() +
      '<div class="abas" id="abas" role="tablist"></div>' +
      '<div class="filtros" id="filtros"></div>' +
      '<div id="aba"></div>';
    ligarPainel(E.el.querySelector('.arquivos-passo'), contextoDoPainel());
    raiz.TelaSubir.ligarBotao(E.el.querySelector('[data-abrir-arquivos]'));
    desenharAbas();
    desenharAba();
    E.el.addEventListener('click', aoClicar);
    E.el.addEventListener('change', aoMudar);
    E.el.addEventListener('input', T.debounce((ev) => {
      const f = ev.target.closest('[data-filtro]'); if (!f || f.tagName !== 'INPUT') return;
      E.filtros[E.aba + '.' + f.getAttribute('data-filtro')] = f.value;
      const pos = f.selectionStart; desenharAba();
      const n = E.el.querySelector('[data-filtro="' + f.getAttribute('data-filtro') + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    }, 250));
  }

  function desenharPonte() {
    const p = E.r.ponte;
    const bate = Math.abs(p.diferenca) < 1;
    const seta = ' <span class="fraco">→</span> ';
    const ini = p.inicio || { modo: 'aging' };
    const rotuloInicial = ini.modo === 'razao' ? 'Saldo inicial · razão ' + E.entrada.mesAnterior : 'Saldo inicial · aging ' + E.entrada.mesAnterior;
    const dicaInicial = ini.modo === 'razao'
      ? 'Conforme o RAZÃO de ' + E.entrada.mesAnterior + ' (saldo da contabilidade): aging ' + T.moeda(ini.aging) + ' − ' + ini.qtdTirados + ' título(s) que ficaram em aberto na Parte B (' + T.moeda(ini.tirados) + ') + ' + ini.qtdPendentes + ' pendência(s) da Parte A (' + T.moeda(ini.pendentesA) + ')'
      : 'Conforme o AGING de ' + E.entrada.mesAnterior + ': o que estava em aberto no financeiro no fim do mês passado';
    return '<div class="cartao corpo cartao-ponte" style="margin-bottom:14px;border-left:4px solid var(--' + (bate ? 'verde' : 'vermelho') + ')">' +
      '<div class="ponte">' +
      pedaco(rotuloInicial, p.anterior, dicaInicial) +
      ' <b>+</b> ' + pedaco('Movimento do razão', p.movimento, E.cfg.aumentos + ' (' + E.cfg.ladoAumento + ', ' + T.moeda(p.notas) + ') menos ' + E.cfg.reducoes + ' (' + E.cfg.ladoReducao + ', ' + T.moeda(p.baixas) + ') do mês') +
      ' <b>=</b> ' + pedaco('Esperado (contabilidade)', p.esperado, 'é o que o balancete tem que mostrar', 'forte') +
      seta + pedaco('Aging ' + E.entrada.mesAtual, p.atual, 'o que está em aberto agora') +
      '</div>' +
      '<div class="linha-flex" style="margin-top:12px;justify-content:space-between">' +
      '<div class="' + (bate ? 'ok' : 'falta') + '" style="font-size:16px;font-weight:600">' + (bate ? '✓ Fecha no centavo' : '● Diferença de ' + T.moeda(Math.abs(p.diferenca)) + ' para conciliar') + '</div>' +
      // A contagem por fornecedor só aparece se alguma aba por fornecedor estiver à vista.
      (['diferencas', 'fornecedores', 'sem'].some((id) => !abasOcultas().has(id))
        ? '<div class="suave pequeno">' + E.r.resumo.batem + ' batem · ' + E.r.resumo.comDiferenca + ' com diferença · ' + E.r.resumo.semFornecedor + ' linhas sem fornecedor</div>' : '') +
      '</div></div>';
  }

  function pedaco(rotulo, valor, dica, forte) {
    return '<span class="ponte-item" title="' + T.esc(dica) + '"><span class="rotulo">' + T.esc(rotulo) + '</span>' +
      '<b class="num' + (forte ? ' forte' : '') + '">' + U.formatarCentavos(valor) + '</b></span>';
  }

  function contador(id) {
    const r = E.r;
    switch (id) {
      case 'ab': return E.decisoes.conciliacoesAB.length;
      case 'diferencas': return r.comDiferenca.length;
      case 'fornecedores': return r.fornecedores.filter((f) => f.chave !== SEM).length;
      case 'sem': return r.semFornecedor.qtd;
      case 'razao': return r.linhas.length;
      case 'agingAnt': return E.arquivos.aAnt.conteudo.titulos.length;
      case 'agingAtu': return E.arquivos.aAtu.conteudo.titulos.length;
      default: return 0;
    }
  }
  const ABAS = () => [
    { id: 'ab', titulo: 'Conciliar A × B' },
    { id: 'diferencas', titulo: 'Diferenças' },
    { id: 'fornecedores', titulo: 'Por fornecedor' },
    { id: 'sem', titulo: 'Sem fornecedor' },
    { id: 'razao', titulo: 'Razão completo' },
    { id: 'agingAnt', titulo: 'Aging ' + E.entrada.mesAnterior },
    { id: 'agingAtu', titulo: 'Aging ' + E.entrada.mesAtual },
  ];
  // Abas ocultas nesta empresa (Dony, 14/09/2026: "não eliminar, deixar ocultos"). Guardadas no
  // cadastro da empresa, por passo: { passo3: [...], passo2: [...] }. "Conciliar A × B" sempre aparece.
  function abasOcultas() { return new Set(((E.emp && E.emp.abasOcultas) || {})[E.cfg.id] || []); }

  function desenharAbas() {
    const ocultas = abasOcultas();
    E.el.querySelector('#abas').innerHTML = ABAS().filter((a) => a.id === 'ab' || !ocultas.has(a.id)).map((a) =>
      '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' +
      T.esc(a.titulo) + '<span class="contador">' + contador(a.id).toLocaleString('pt-BR') + '</span></button>').join('') +
      '<button type="button" class="abas-config" data-acao="config-abas" title="Escolher quais abas aparecem nesta empresa">⚙ ' +
      (ocultas.size ? ocultas.size + ' aba(s) oculta(s)' : 'Abas') + '</button>';
  }

  async function configurarAbas() {
    const ocultas = abasOcultas();
    const escolha = await T.janela({
      titulo: 'Abas do Passo ' + E.cfg.numero + ' nesta empresa',
      corpo: '<p class="suave" style="margin-bottom:8px;line-height:1.5">Desmarque as abas que esta empresa não usa. Elas ficam <b>ocultas</b> (nada é apagado) e voltam quando você marcar de novo.</p>' +
        '<label class="item-aba"><input type="checkbox" checked disabled> <b>Conciliar A × B</b> <span class="suave pequeno">sempre aparece</span></label>' +
        ABAS().filter((a) => a.id !== 'ab').map((a) => '<label class="item-aba"><input type="checkbox" data-aba-visivel="' + a.id + '"' + (ocultas.has(a.id) ? '' : ' checked') + '> ' + T.esc(a.titulo) + '</label>').join(''),
      botoes: [{ texto: 'Cancelar', valor: null },
        { texto: 'Guardar', tipo: 'primario', antes: (j) => Array.from(j.querySelectorAll('[data-aba-visivel]')).filter((c) => !c.checked).map((c) => c.getAttribute('data-aba-visivel')) }],
    });
    if (!Array.isArray(escolha)) return;
    const arm = app().armazenamento;
    try {
      // Reler antes de gravar: outra pessoa pode ter mexido no cadastro.
      const emp = (await arm.empresas()).find((e) => String(e.codigo) === String(E.codigo));
      const todas = Object.assign({}, emp.abasOcultas || {}, { [E.cfg.id]: escolha });
      const salvo = await arm.salvarEmpresa(Object.assign({}, emp, { abasOcultas: todas }));
      E.emp = salvo;
      const i = app().empresas.findIndex((e) => String(e.codigo) === String(E.codigo));
      if (i >= 0) app().empresas[i] = salvo;
      await arm.registrarNoLog({ codigo: E.codigo, acao: 'abas-ocultas', alvo: E.cfg.id, detalhe: escolha.join(', ') || '(nenhuma)' });
      if (escolha.indexOf(E.aba) >= 0) { E.aba = 'ab'; app().gravarLocal('conciliador-solutta.aba-' + E.cfg.id, 'ab'); }
      E.el.querySelector('.cartao-ponte').outerHTML = '';
      E.el.querySelector('#abas').insertAdjacentHTML('beforebegin', desenharPonte());
      desenharAbas();
      desenharAba();
      T.avisoRapido(escolha.length ? escolha.length + ' aba(s) oculta(s) nesta empresa.' : 'Todas as abas à vista.', 'ok');
    } catch (e) {
      T.avisoRapido(T.mensagemDeErro(e), 'erro');
    }
  }

  function filtro(nome) { return E.filtros[E.aba + '.' + nome] || ''; }
  function combina(texto, ...campos) { const q = U.normalizarNome(texto); return !q || campos.some((c) => U.normalizarNome(c).indexOf(q) >= 0); }

  function desenharFiltros(campos) {
    E.el.querySelector('#filtros').innerHTML = campos.map((c) => c.tipo === 'busca'
      ? '<input type="search" class="busca" data-filtro="' + c.nome + '" placeholder="' + T.esc(c.texto) + '" value="' + T.esc(filtro(c.nome)) + '">'
      : '<select class="filtro" data-filtro="' + c.nome + '">' + c.opcoes.map((o) => '<option value="' + o[0] + '"' + (filtro(c.nome) === o[0] ? ' selected' : '') + '>' + T.esc(o[1]) + '</option>').join('') + '</select>').join('');
  }

  function desenharAba() {
    const alvo = E.el.querySelector('#aba');
    switch (E.aba) {
      case 'ab': return abaAB(alvo);
      case 'diferencas': return abaFornecedores(alvo, true);
      case 'fornecedores': return abaFornecedores(alvo, false);
      case 'sem': return abaSem(alvo);
      case 'razao': return abaRazao(alvo);
      case 'agingAnt': return abaAging(alvo, E.arquivos.aAnt.conteudo, E.entrada.mesAnterior);
      case 'agingAtu': return abaAging(alvo, E.arquivos.aAtu.conteudo, E.entrada.mesAtual);
      default: return null;
    }
  }

  // ------------------------------------------------------------------
  // Aba "Conciliar A × B": Parte A (aging do mês passado + razão) × Parte B (aging do mês).
  // ⚡ Conciliar acha tudo pelo DOCUMENTO (MotorTerceiro.conciliarAutomatico) e marca cada
  // conciliação com um ID sequencial (1, 2, 3…): A×A quando se mata dentro da A, A×B quando
  // casa com a B (pedido do Dony, 14/09/2026). O que sobrar dá para marcar à mão — também
  // ganha o próximo ID. O que não concilia fica em aberto: o da A na A, o da B na B.
  // ------------------------------------------------------------------
  const TIPO_AB = { AxA: 'A×A', AxB: 'A×B', BxB: 'B×B' };
  const COMO_AB = M.COMO_AB; // rótulo curto de cada regra (definido no motor)

  function nomeDaFonte(fonte) { return fonte === 'nota' ? 'razão · ' + E.cfg.aumento : fonte === 'baixa' ? 'razão · ' + E.cfg.reducao : 'aging'; }
  function rotuloFonte(x) {
    if (x.fonte === 'anterior') return 'aging ' + E.entrada.mesAnterior;
    if (x.fonte === 'atual') return 'aging ' + E.entrada.mesAtual;
    if (x.fonte === 'pendente') return 'pendente de ' + U.nomeCompetencia(x.origem) + (x.fonteOriginal ? ' · ' + nomeDaFonte(x.fonteOriginal) : '');
    return nomeDaFonte(x.fonte);
  }
  // Na tabela estreita de cada parte: "aging jun/26", "nota", "baixa", "pend. jul/26".
  function rotuloCurto(x) {
    const curto = (mes) => String(mes).slice(0, 3) + '/' + String(mes).slice(-2);
    if (x.fonte === 'anterior') return 'aging ' + curto(E.entrada.mesAnterior);
    if (x.fonte === 'atual') return 'aging ' + curto(E.entrada.mesAtual);
    if (x.fonte === 'pendente') return 'pend. ' + curto(U.nomeCompetencia(x.origem));
    return x.fonte === 'nota' ? E.cfg.aumento : E.cfg.reducao;
  }

  // ------------------------------------------------------------------
  // SALDO INICIAL do mês (Dony, 15/09/2026): "considerar o saldo inicial contábil conforme o
  // AGING ou conforme o RAZÃO do mês anterior". Ex.: em julho o razão estava diferente, o aging
  // estava certo e a contabilidade foi ajustada: agosto segue o aging de julho como se fosse o
  // razão (a Parte B de julho vira a Parte A de agosto). Ou, se vale a contabilidade, agosto
  // parte do saldo do razão de julho e a diferença de julho continua.
  // Modos gravados: 'aging' e 'razao' (os antigos 'zero' e 'continuar' valem o mesmo).
  // ------------------------------------------------------------------
  function valoresDoInicio() {
    const ant = E.anterior;
    const pelaAging = M.saldoInicialAB({ agingAnterior: E.entrada.agingAnterior });
    const peloRazao = ant && ant.pendencias ? M.saldoInicialAB({ agingAnterior: E.entrada.agingAnterior, continuacao: ant.pendencias }) : null;
    return { pelaAging, peloRazao };
  }

  function cartaoInicio() {
    const ant = E.anterior;
    if (!ant) return '';
    const mesAnt = T.esc(U.nomeCompetencia(ant.competencia)), mes = T.esc(U.nomeCompetencia(E.comp));
    const v = valoresDoInicio();
    const dinheiro = (c) => U.formatarCentavos(c);
    // Mês anterior sem conciliação neste passo: só dá para partir do aging.
    if (!ant.pendencias) {
      return '<div class="linha-inicio">📄 Saldo inicial de ' + mes + ' <b>conforme o aging de ' + mesAnt + '</b> (' + dinheiro(v.pelaAging.valor) + '). ' +
        '<span class="suave">Para usar o saldo conforme o razão de ' + mesAnt + ', concilie ' + mesAnt + ' no Passo ' + E.cfg.numero + '.</span></div>';
    }
    const p = ant.pendencias;
    // Mês anterior fechou sem nada em aberto: aging e razão dão o mesmo saldo, não há o que escolher.
    if (!p.A.length && !p.B.length) {
      return '<div class="linha-inicio">✓ ' + mesAnt + ' fechou sem nada em aberto: o saldo inicial de ' + mes + ' é o mesmo conforme o aging e conforme o razão (' + dinheiro(v.pelaAging.valor) + ').</div>';
    }
    const ficou = '<b>' + p.A.length + '</b> item(ns) em aberto na Parte A (' + dinheiro(p.valorA) + ') e <b>' + p.B.length + '</b> na Parte B (' + dinheiro(p.valorB) + ')';
    const escolhido = E.decisoes.inicio ? modoDoInicio(E.decisoes.inicio) : null;
    if (escolhido) {
      const c = E.itens.continuacao;
      const texto = escolhido === 'razao'
        ? '📒 Saldo inicial <b>conforme o RAZÃO de ' + mesAnt + '</b> (' + dinheiro(v.peloRazao.valor) + '): entraram na Parte A <b>' + (c ? c.pendentes : 0) + '</b> pendência(s) de ' + mesAnt +
          ' e saíram do aging <b>' + (c ? c.excluidos.length : 0) + '</b> título(s) que tinham ficado em aberto na Parte B.' +
          (c && c.naoAchados.length ? ' <span class="falta">' + c.naoAchados.length + ' título(s) da Parte B de ' + mesAnt + ' não foram achados no aging (arquivo trocado?).</span>' : '')
        : '📄 Saldo inicial <b>conforme o AGING de ' + mesAnt + '</b> (' + dinheiro(v.pelaAging.valor) + '): a Parte B de ' + mesAnt + ' virou a Parte A de ' + mes + ' (lá tinham ficado ' + ficou + ').';
      return '<div class="linha-inicio">' + texto + ' <button type="button" class="botao pequeno leve" data-acao="trocar-inicio">trocar</button></div>';
    }
    return '<div class="cartao corpo cartao-inicio">' +
      '<h3>Saldo inicial de ' + mes + ' (contabilidade · Parte A)</h3>' +
      '<p class="suave" style="margin:4px 0 10px">Em ' + mesAnt + ' ficaram ' + ficou + ' — diferença de ' + dinheiro(p.valorA - p.valorB) + '. Qual saldo vale para começar ' + mes + '?</p>' +
      '<div class="opcoes-inicio">' +
      '<button type="button" class="opcao-inicio" data-inicio="aging"><b>📄 Conforme o AGING de ' + mesAnt + '</b><em class="valor-inicio">' + dinheiro(v.pelaAging.valor) + '</em>' +
      '<span>O aging de ' + mesAnt + ' estava certo (a contabilidade foi ajustada e bateu). A Parte B de ' + mesAnt + ' vira a Parte A de ' + mes + ': Parte A = aging de ' + mesAnt + ' + razão de ' + T.esc(E.entrada.nomeRazao || mes) + '.</span></button>' +
      '<button type="button" class="opcao-inicio" data-inicio="razao"><b>📒 Conforme o RAZÃO de ' + mesAnt + '</b><em class="valor-inicio">' + dinheiro(v.peloRazao.valor) + '</em>' +
      '<span>Vale o saldo da contabilidade no fim de ' + mesAnt + ': a Parte A traz as pendências da A de ' + mesAnt + ' e tira do aging os títulos que ficaram em aberto na B. A diferença de ' + mesAnt + ' continua em ' + mes + '.</span></button>' +
      '</div></div>';
  }

  async function escolherInicio(modo) {
    const ant = E.anterior;
    if (!ant || !ant.pendencias) return;
    const mesAnt = U.nomeCompetencia(ant.competencia), mes = U.nomeCompetencia(E.comp);
    const nomeModo = modo === 'razao' ? 'conforme o razão de ' + mesAnt : 'conforme o aging de ' + mesAnt;
    const efetivo = modoDoInicio(E.decisoes.inicio);
    const qtd = E.decisoes.conciliacoesAB.length;
    const mudaItens = modo !== efetivo;
    if (mudaItens && qtd) {
      // Os itens da Parte A mudam: as conciliações feitas com os itens de antes são desfeitas.
      const ok = await T.confirmar({
        titulo: 'Saldo inicial ' + nomeModo + '?',
        texto: 'A Parte A de ' + mes + ' passa a começar ' + nomeModo + '.' +
          '<br><br>Os itens da Parte A mudam, então as <b>' + qtd + '</b> conciliações deste mês serão <b>desfeitas</b> (voltam para em aberto) para conciliar de novo.',
        botao: modo === 'razao' ? 'Usar o razão de ' + mesAnt : 'Usar o aging de ' + mesAnt, perigo: true,
      });
      if (!ok) return;
      E.decisoes.conciliacoesAB = [];
    }
    E.decisoes.inicio = { modo, de: ant.competencia, quem: app().usuario.nome, quando: U.agoraISO() };
    historico('Saldo inicial ' + nomeModo + (mudaItens && qtd ? ' (desfez ' + qtd + ' conciliações)' : ''));
    await gravar('terceiro-saldo-inicial', nomeModo);
    app().mostrarRota(); // recarrega com os itens do novo saldo inicial
  }

  async function trocarInicio() {
    const ant = E.anterior;
    if (!ant || !ant.pendencias) return;
    const mesAnt = U.nomeCompetencia(ant.competencia), mes = U.nomeCompetencia(E.comp);
    const v = valoresDoInicio();
    const escolha = await T.janela({
      titulo: 'Saldo inicial de ' + mes,
      corpo: '<p style="line-height:1.55"><b>📄 Conforme o AGING de ' + T.esc(mesAnt) + '</b> (' + U.formatarCentavos(v.pelaAging.valor) + '): o aging estava certo; a Parte B de ' + T.esc(mesAnt) + ' vira a Parte A de ' + T.esc(mes) + '.</p>' +
        '<p style="line-height:1.55;margin-top:8px"><b>📒 Conforme o RAZÃO de ' + T.esc(mesAnt) + '</b> (' + U.formatarCentavos(v.peloRazao.valor) + '): vale o saldo da contabilidade; a diferença de ' + T.esc(mesAnt) + ' continua.</p>' +
        (E.decisoes.conciliacoesAB.length ? '<p class="falta pequeno" style="margin-top:10px">Se mudar, as conciliações deste mês são desfeitas para conciliar de novo.</p>' : ''),
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Conforme o aging', valor: 'aging' }, { texto: 'Conforme o razão', tipo: 'primario', valor: 'razao' }],
    });
    if (escolha) await escolherInicio(escolha);
  }

  // Documento primeiro (sem documento no fim), depois fornecedor e data: o que casa fica perto.
  const ordemDoc = M.compararPorDocumento;

  // Filtros de valor e de data (Dony, 14/09/2026: "filtrar por valor, por data, por fornecedor
  // ou por documento, tanto na parte A quanto na parte B").
  // Valor: "1.236,55" acha esse valor com ou sem sinal; um pedaço ("1.236") acha quem contém;
  // faixa "100 a 500" (sem sinal).
  function filtroValor(texto) {
    const t = String(texto || '').replace(/R\$\s*/i, '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    if (faixa.length === 2) {
      const de = U.paraNumero(faixa[0]), ate = U.paraNumero(faixa[1]);
      if (de !== null && ate !== null) {
        const min = U.centavos(Math.min(Math.abs(de), Math.abs(ate))), max = U.centavos(Math.max(Math.abs(de), Math.abs(ate)));
        return (x) => Math.abs(x.valor) >= min && Math.abs(x.valor) <= max;
      }
    }
    const pedaco = t.replace(/^[-+]\s*/, '').replace(/\s+/g, '');
    const semPonto = pedaco.replace(/\./g, '');
    return (x) => {
      const f = U.formatarCentavos(Math.abs(x.valor));
      return f.indexOf(pedaco) >= 0 || f.replace(/\./g, '').indexOf(semPonto) >= 0;
    };
  }
  // Data (vencimento no aging, data do lançamento no razão): "08/07/2026", um pedaço
  // ("07/2026") ou faixa "01/07/2026 a 15/07/2026" (sem o ano, vale o da competência).
  function filtroData(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    if (faixa.length === 2) {
      const numero = (s) => { s = s.trim(); if (/^\d{1,2}\/\d{1,2}$/.test(s)) s += '/' + E.comp.slice(0, 4); const d = U.lerData(s); return d ? d.numero : null; };
      const de = numero(faixa[0]), ate = numero(faixa[1]);
      if (de !== null && ate !== null) {
        return (x) => { const d = U.lerData(x.data); return !!d && d.numero >= Math.min(de, ate) && d.numero <= Math.max(de, ate); };
      }
    }
    return (x) => String(x.data || '').indexOf(t) >= 0;
  }

  // Filtros de UMA parte (cada lado tem os seus: o nome muda de um lado para o outro).
  // Mais de um de uma vez (Dony, 14/09/2026: a perninha que falta pode estar em OUTRO
  // fornecedor — "selecionei um fornecedor e a outra perninha está em outro"): fornecedor e
  // documento separados por vírgula ("POSTO CENTRAL, SILVA"); valor e data por ponto e vírgula
  // (a vírgula já é a dos centavos).
  const CAMPOS_LADO = ['doc', 'forn', 'valor', 'data'];
  function termos(texto, separador) { return String(texto || '').split(separador).map((s) => s.trim()).filter(Boolean); }
  function filtroDoLado(lado) {
    const docTexto = termos(filtro(lado + '.doc'), /[,;]/);
    const docs = docTexto.map((d) => M.normalizarDocumento(d)).filter(Boolean);
    const forns = termos(filtro(lado + '.forn'), /[,;]/);
    const valores = termos(filtro(lado + '.valor'), /;/).map(filtroValor).filter(Boolean);
    const datas = termos(filtro(lado + '.data'), /;/).map(filtroData).filter(Boolean);
    return (x) => (!docTexto.length || docs.some((d) => x.doc.indexOf(d) >= 0)) &&
      (!forns.length || forns.some((f) => combina(f, x.nome, x.historico || ''))) &&
      (!valores.length || valores.some((f) => f(x))) && (!datas.length || datas.some((f) => f(x)));
  }
  function filtrosDoLadoHtml(lado) {
    const campo = (nome, texto, dica) => {
      const v = filtro(lado + '.' + nome);
      return '<input type="search" data-filtro="' + lado + '.' + nome + '" class="' + (v ? 'ativo' : '') + '" placeholder="' + texto + '" title="' + T.esc(dica) + '" value="' + T.esc(v) + '">';
    };
    const algum = CAMPOS_LADO.some((n) => filtro(lado + '.' + n));
    return '<div class="filtros-lado">' +
      campo('doc', 'Documento', 'Número do documento, ou parte dele. Mais de um: 107, 207') +
      campo('forn', 'Fornecedor', 'Nome do fornecedor, ou pedaço do histórico. Mais de um: POSTO CENTRAL, SILVA') +
      campo('valor', 'Valor', 'Valor (1.236,55), parte dele, ou faixa: 100 a 500 — com ou sem sinal. Mais de um: 791,43; 5.105,88') +
      campo('data', 'Data', 'Data (08/07/2026), parte dela (07/2026), ou faixa: 01/07 a 15/07. Mais de uma: 08/07; 22/07') +
      '<button type="button" class="lapis" data-limpar-lado="' + lado + '" title="Limpar os filtros desta parte"' + (algum ? '' : ' disabled') + '>✕</button>' +
      '</div>' +
      (algum ? '<p class="dica-lado">Mais de um fornecedor ou documento: separe com vírgula (<b>POSTO CENTRAL, SILVA</b>). Os itens marcados ficam no topo, mesmo fora do filtro.</p>' : '');
  }

  // Busca de cima (vale para os dois lados e para a lista): "#12" = a conciliação 12;
  // valor ("791,43"); data ("08/07/2026"); número = documento; texto = fornecedor ou histórico.
  function buscaAB(busca) {
    const q = String(busca || '').trim();
    if (!q) return { item: () => true, grupo: () => true };
    const mId = q.match(/^#\s*(\d+)$/);
    if (mId) {
      const n = Number(mId[1]);
      return { item: (x) => { const g = E.idDoItem.get(x.id); return !!g && g.id === n; }, grupo: (g) => g.id === n };
    }
    let item;
    if (/^[-+]?\s*(R\$\s*)?\d[\d.]*,\d{1,2}$/i.test(q) || /^\d[\d.]*(,\d{1,2})?\s+(a|até|ate)\s+\d[\d.]*(,\d{1,2})?$/i.test(q)) item = filtroValor(q);
    else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(q)) item = filtroData(q);
    else if (/^[\d.\-\/ ]+$/.test(q)) { const dig = M.normalizarDocumento(q); item = (x) => !!dig && x.doc.indexOf(dig) >= 0; }
    else item = (x) => combina(q, x.nome, x.historico || '');
    return { item, grupo: (g) => g.a.concat(g.b).some((id) => { const x = E.itens.porId.get(id); return x && item(x); }) };
  }

  function abaAB(alvo) {
    const it = E.itens;
    const grupos = E.decisoes.conciliacoesAB;
    E.idDoItem = new Map();
    grupos.forEach((g) => g.a.concat(g.b).forEach((id) => E.idDoItem.set(id, g)));
    E.selA.forEach((id) => { if (!it.porId.has(id) || E.idDoItem.has(id)) E.selA.delete(id); });
    E.selB.forEach((id) => { if (!it.porId.has(id) || E.idDoItem.has(id)) E.selB.delete(id); });

    const ab = M.emAbertoAB(it, grupos);
    const busca = filtro('busca');
    const mostrar = filtro('mostrar');            // '' = em aberto · 'conciliados' · 'todos'
    const b = buscaAB(busca);
    const naLista = (x) => (mostrar === 'todos' || (mostrar === 'conciliados' ? E.idDoItem.has(x.id) : !E.idDoItem.has(x.id))) && b.item(x);
    const doLadoA = filtroDoLado('A'), doLadoB = filtroDoLado('B');
    const passaA = (x) => (E.incluirAnterior || (x.fonte !== 'anterior' && x.fonte !== 'pendente')) && naLista(x) && doLadoA(x);
    const passaB = (x) => naLista(x) && doLadoB(x);
    const filtradosA = it.A.filter(passaA).sort(ordemDoc);
    const filtradosB = it.B.filter(passaB).sort(ordemDoc);
    // O que está marcado fica no topo mesmo fora do filtro: marca as perninhas de um
    // fornecedor, troca o filtro para o outro, e as de antes continuam à vista.
    const fixosA = it.A.filter((x) => E.selA.has(x.id) && !passaA(x)).sort(ordemDoc);
    const fixosB = it.B.filter((x) => E.selB.has(x.id) && !passaB(x)).sort(ordemDoc);
    const listaA = fixosA.concat(filtradosA);
    const listaB = fixosB.concat(filtradosB);
    E.listaA = listaA; E.listaB = listaB;
    E.fixos = new Set(fixosA.concat(fixosB).map((x) => x.id));

    E.el.querySelector('#filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Busca nos dois lados: documento, fornecedor, valor, data ou #ID" title="Vale para a Parte A, a Parte B e a lista de conciliações. Cada parte tem também os seus filtros." value="' + T.esc(busca) + '">' +
      '<select class="filtro" data-filtro="mostrar">' + [['', 'Em aberto'], ['conciliados', 'Conciliados'], ['todos', 'Todos']].map((o) =>
        '<option value="' + o[0] + '"' + (mostrar === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="linha-flex" style="gap:6px"><input type="checkbox" id="ab-anterior"' + (E.incluirAnterior ? ' checked' : '') + '> <span class="pequeno">Parte A = aging ' + T.esc(E.entrada.mesAnterior) + (E.itens.continuacao ? ' + pendências' : '') + ' + razão</span></label>' +
      '<span class="suave pequeno">(desmarque para <b>só o razão</b>)</span>';

    const rot = mostrar === 'todos' ? 'item(ns)' : (mostrar === 'conciliados' ? 'conciliado(s)' : 'em aberto');
    alvo.innerHTML = cartaoInicio() + resumoAB(ab, grupos) +
      '<div class="grade-ab">' +
      colunaAB('A', 'Parte A · contabilidade', E.incluirAnterior ? 'aging ' + E.entrada.mesAnterior + ' + razão de ' + (E.entrada.nomeRazao || E.entrada.mesAtual) : 'só o razão de ' + (E.entrada.nomeRazao || E.entrada.mesAtual), filtradosA, fixosA, rot) +
      colunaAB('B', 'Parte B · financeiro', 'aging ' + E.entrada.mesAtual, filtradosB, fixosB, rot) +
      '</div>' +
      '<div id="barra-ab"></div>' +
      '<div id="lista-ab"></div>';
    T.tabelaPaginada(alvo.querySelector('#colA'), tabelaItens('A', listaA));
    T.tabelaPaginada(alvo.querySelector('#colB'), tabelaItens('B', listaB));
    atualizarBarraAB();
    desenharListaAB(alvo.querySelector('#lista-ab'), b);
  }

  function resumoAB(ab, grupos) {
    const conta = (tipo) => grupos.filter((g) => g.tipo === tipo).length;
    const aMao = grupos.filter((g) => g.regra === 'manual').length;
    const auto = grupos.length - aMao;
    const dif = ab.valorA - ab.valorB;
    // Conciliação à mão "assim mesmo" (sem bater) tira valores diferentes dos dois lados.
    const forcado = grupos.reduce((s, g) => s + (g.valorA - g.valorB), 0);
    const conferir = grupos.filter((g) => g.aviso === 'baixa-antes-da-nota');
    return '<div class="cartao corpo" style="margin-bottom:12px">' +
      '<div class="linha-flex" style="justify-content:space-between;align-items:flex-start;gap:14px">' +
      '<div class="ponte">' +
      pedaco('Em aberto · Parte A', ab.valorA, ab.abertosA.length + ' item(ns) em aberto na contabilidade') +
      ' <b>−</b> ' + pedaco('Em aberto · Parte B', ab.valorB, ab.abertosB.length + ' item(ns) em aberto no financeiro') +
      ' <b>=</b> ' + pedaco('Diferença a investigar', dif, 'o que sobra em aberto', 'forte') +
      '</div>' +
      '<div class="linha-flex">' +
      '<button type="button" class="botao primario" data-acao="conciliar-tudo" title="Acha tudo o que casa pelo documento e marca cada conciliação com um ID">⚡ Conciliar</button>' +
      (auto ? '<button type="button" class="botao pequeno perigo" data-acao="desfazer-automaticas">Desfazer as automáticas</button>' : '') +
      (aMao ? '<button type="button" class="botao pequeno perigo" data-acao="desfazer-manuais">Desfazer as manuais</button>' : '') +
      '</div></div>' +
      '<p class="suave pequeno" style="margin:10px 0 0">' +
      (grupos.length ? '<b>' + grupos.length.toLocaleString('pt-BR') + '</b> conciliação(ões) com ID: ' + conta('AxA') + ' A×A · ' + conta('AxB') + ' A×B' + (conta('BxB') ? ' · ' + conta('BxB') + ' B×B' : '') + ' · ' + aMao + ' à mão · em aberto: <b>' + ab.abertosA.length + '</b> na A e <b>' + ab.abertosB.length + '</b> na B. ' : 'Nada conciliado ainda. ') +
      'O <b>⚡ Conciliar</b> casa pelo <b>documento</b> — primeiro com o mesmo fornecedor, depois com o mesmo nome de fornecedor, depois só pelo documento — e dá um ID para cada conciliação (1, 2, 3…).' +
      (Math.abs(forcado) >= 1 ? ' <span class="falta">Conciliações à mão sem bater: ' + U.formatarCentavos(forcado) + '.</span>' : '') +
      (conferir.length ? '<br><span style="color:var(--ambar)">⚠ Para conferir — ' + E.cfg.avisoAntes + ':</span> ' +
        conferir.slice(0, 15).map((g) => '<button type="button" class="lapis" data-ver-id="' + g.id + '" title="Ver a conciliação #' + g.id + '"><b>#' + g.id + '</b></button>').join(' ') + (conferir.length > 15 ? ' …' : '') : '') +
      '</p></div>';
  }

  function colunaAB(lado, titulo, sub, itens, fixos, rot) {
    const total = itens.reduce((s, x) => s + x.valor, 0);
    const filtrado = CAMPOS_LADO.some((n) => filtro(lado + '.' + n));
    return '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px"><h3 style="flex:1">' + T.esc(titulo) + '</h3>' +
      '<span class="pilula ' + (lado === 'A' ? 'azul' : 'ambar') + '" title="Soma da lista (sem os marcados de fora do filtro)">' + U.formatarCentavos(total) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + T.esc(sub) + ' · ' + itens.length.toLocaleString('pt-BR') + ' ' + rot + (filtrado ? ' <b>(filtrado)</b>' : '') +
      (fixos.length ? ' · <b>+' + fixos.length + ' marcado(s)</b> de fora do filtro, no topo' : '') + '</p>' +
      filtrosDoLadoHtml(lado) +
      '<div id="col' + lado + '"></div></div>';
  }

  function tabelaItens(lado, itens) {
    const sel = lado === 'A' ? E.selA : E.selB;
    return {
      alta: true, porPagina: 200,
      cabecalho: '<th class="caixa"><input type="checkbox" data-marca-todos="' + lado + '" title="Marcar todos os em aberto desta lista (com os filtros de agora)"></th><th>Documento</th><th>Fornecedor</th><th>Data · origem</th><th class="num">Valor</th><th>ID</th>',
      linhas: itens, vazio: 'Nada nesta lista.',
      linha: (x) => {
        const g = E.idDoItem.get(x.id);
        const marcado = sel.has(x.id);
        const fixo = E.fixos && E.fixos.has(x.id);
        return '<tr class="' + (marcado ? 'destaque' : '') + (fixo ? ' fixo' : '') + '"><td class="caixa">' + (g ? '' : '<input type="checkbox" data-item="' + lado + '" data-id="' + T.esc(x.id) + '"' + (marcado ? ' checked' : '') + '>') + '</td>' +
          '<td class="num"><b>' + T.nome(x.doc) + '</b></td>' +
          '<td class="nome">' + (fixo ? '<span class="selo suspeita" title="Marcado antes, com outro filtro">marcado</span> ' : '') +
          (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 70)) + '</span>' : '') + '</td>' +
          '<td class="num" title="' + T.esc(rotuloFonte(x)) + '">' + T.esc(x.data || '—') + '<br><span class="pequeno suave">' + T.esc(rotuloCurto(x)) + '</span></td>' +
          '<td class="num ' + (x.valor < 0 ? 'negativo' : '') + '">' + U.formatarCentavos(x.valor) + '</td>' +
          '<td style="white-space:nowrap">' + (g ? '<button type="button" class="lapis" data-ver-id="' + g.id + '" title="Ver a conciliação #' + g.id + ' (' + T.esc(M.REGRAS_AB[g.regra] || '') + ')"><b>#' + g.id + '</b></button><br><span class="selo opcional">' + TIPO_AB[g.tipo] + '</span>' : '') + '</td></tr>';
      },
    };
  }

  function somaSel(sel) { let s = 0; sel.forEach((id) => { const x = E.itens.porId.get(id); if (x) s += x.valor; }); return s; }

  function atualizarBarraAB() {
    const barra = E.el.querySelector('#barra-ab'); if (!barra) return;
    const sa = somaSel(E.selA), sb = somaSel(E.selB), dif = sa - sb;
    const nSel = E.selA.size + E.selB.size;
    if (!nSel) { barra.innerHTML = '<p class="suave pequeno" style="margin:10px 0">Para conciliar à mão: marque os itens na Parte A e/ou na Parte B — aparece embaixo a opção <b>Conciliar manualmente</b>, que cria o próximo ID.</p>'; return; }
    const bate = Math.abs(dif) < 1;
    // Marcado fora da lista só acontece com a busca de cima ou o "Mostrar" (os filtros de cada parte deixam no topo).
    const naTela = new Set((E.listaA || []).concat(E.listaB || []).map((x) => x.id));
    const fora = Array.from(E.selA).concat(Array.from(E.selB)).filter((id) => !naTela.has(id)).length;
    // Barra fixa no rodapé: aparece assim que marca, sem precisar rolar a tela.
    barra.innerHTML = '<div class="espaco-barra"></div><div class="barra-selecao" role="region" aria-label="Itens marcados">' +
      '<span>Parte A: <b class="num">' + U.formatarCentavos(sa) + '</b> (' + E.selA.size + ')</span>' +
      '<span>Parte B: <b class="num">' + U.formatarCentavos(sb) + '</b> (' + E.selB.size + ')</span>' +
      '<span class="' + (bate ? 'ok' : 'falta') + '">' + (bate ? '✓ bate' : 'diferença ' + U.formatarCentavos(dif)) + '</span>' +
      '<span class="explica">vira o ID #' + M.proximoIdAB(E.decisoes.conciliacoesAB) + ' · ' + TIPO_AB[M.tipoAB(E.selA.size, E.selB.size)] +
      (fora ? ' · ' + fora + ' marcado(s) fora do filtro' : '') + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-ab">✓ Conciliar manualmente</button>' +
      '<button type="button" class="botao" data-acao="limpar-ab">Limpar</button></div>';
  }

  function desenharListaAB(el, b) {
    const grupos = E.decisoes.conciliacoesAB;
    if (!grupos.length) { el.innerHTML = ''; return; }
    const lista = grupos.filter(b.grupo).sort((x, y) => x.id - y.id);
    el.innerHTML = '<h3 style="margin:18px 0 8px">Conciliações com ID (' + lista.length.toLocaleString('pt-BR') + (lista.length !== grupos.length ? ' de ' + grupos.length.toLocaleString('pt-BR') : '') + ')</h3><div id="tab-ab"></div>';
    T.tabelaPaginada(el.querySelector('#tab-ab'), {
      alta: false, porPagina: 100,
      cabecalho: '<th style="width:24px"></th><th>ID</th><th>Tipo</th><th>Como</th><th>Documento</th><th>Fornecedor</th><th class="num">Parte A</th><th class="num">Parte B</th><th>Itens</th><th>Quem</th><th></th>',
      linhas: lista, vazio: 'Nenhuma conciliação com este filtro.',
      linha: (g) => {
        const aberto = E.abertosAB.has(g.id);
        const faltam = g.a.concat(g.b).filter((id) => !E.itens.porId.has(id)).length;
        const dif = g.valorA - g.valorB;
        return '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir-ab="' + g.id + '" title="Ver os itens">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="num"><b>#' + g.id + '</b></td>' +
          '<td><span class="pilula ' + (g.tipo === 'AxB' ? 'azul' : 'cinza') + '">' + TIPO_AB[g.tipo] + '</span></td>' +
          '<td><span class="selo ' + (g.regra === 'manual' ? 'mao' : 'opcional') + '" title="' + T.esc(M.REGRAS_AB[g.regra] || '') + '">' + T.esc(COMO_AB[g.regra] || g.regra) + '</span>' +
          (g.aviso === 'baixa-antes-da-nota' ? '<br><span class="selo suspeita" title="' + primeiraMaiuscula(E.cfg.avisoAntes) + ' (7.11): confira">' + E.cfg.avisoCurto + '</span>' : '') + '</td>' +
          '<td class="num">' + T.nome(g.documento) + '</td>' +
          '<td class="nome">' + T.nome(g.nome) + (g.obs ? '<br><span class="suave pequeno">✎ ' + T.esc(g.obs) + '</span>' : '') +
          (faltam ? '<br><span class="falta pequeno">' + faltam + ' item(ns) não estão mais nos arquivos</span>' : '') + '</td>' +
          T.tdValor(g.valorA) + T.tdValor(g.valorB) +
          '<td class="pequeno" style="white-space:nowrap">' + g.a.length + ' de A · ' + g.b.length + ' de B' + (Math.abs(dif) >= 1 ? '<br><span class="falta">diferença ' + U.formatarCentavos(dif) + '</span>' : '') + '</td>' +
          '<td class="pequeno suave">' + T.esc(g.quem || '') + (g.quando ? '<br>' + U.dataHoraLocal(g.quando) : '') + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer-ab="' + g.id + '">Desfazer</button></td></tr>' +
          (aberto ? linhaDetalheAB(g) : '');
      },
    });
  }

  function linhaDetalheAB(g) {
    const itens = g.a.concat(g.b).map((id) => E.itens.porId.get(id) || { id, faltando: true });
    return '<tr class="sub"><td></td><td colspan="10"><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Lado</th><th>Documento</th><th>Origem</th><th>Data</th><th class="historico">Fornecedor · histórico</th><th class="num">Valor</th></tr></thead><tbody>' +
      itens.map((x) => x.faltando ? '<tr><td colspan="6" class="falta pequeno">Item que não está mais nos arquivos (' + T.esc(x.id) + ')</td></tr>' :
        '<tr><td><b>' + x.lado + '</b></td><td class="num">' + T.nome(x.doc) + '</td><td class="pequeno suave">' + T.esc(rotuloFonte(x)) + '</td><td class="num">' + T.esc(x.data || '—') + '</td>' +
        '<td class="historico">' + (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico) + '</span>' : '') + '</td>' +
        '<td class="num ' + (x.valor < 0 ? 'negativo' : '') + '">' + U.formatarCentavos(x.valor) + '</td></tr>').join('') +
      '</tbody></table></div></td></tr>';
  }

  // Abre/fecha os itens de uma conciliação sem redesenhar a lista (não perde o "mostrar mais").
  function alternarDetalheAB(botao) {
    const id = Number(botao.getAttribute('data-abrir-ab'));
    const tr = botao.closest('tr');
    const g = E.decisoes.conciliacoesAB.find((x) => x.id === id);
    const prox = tr.nextElementSibling;
    if (E.abertosAB.has(id)) {
      E.abertosAB.delete(id);
      if (prox && prox.classList.contains('sub')) prox.remove();
      botao.textContent = '▸'; tr.classList.remove('destaque');
    } else if (g) {
      E.abertosAB.add(id);
      tr.insertAdjacentHTML('afterend', linhaDetalheAB(g));
      botao.textContent = '▾'; tr.classList.add('destaque');
    }
  }

  function redesenharAB() { desenharAbas(); redesenhaMantendo(); }

  // ⚡ Conciliar: acha tudo pelo documento e marca com IDs sequenciais.
  function conciliarTudo() {
    const novos = M.conciliarAutomatico(E.itens, E.decisoes.conciliacoesAB, app().usuario.nome, U.agoraISO());
    if (!novos.length) { T.avisoRapido('Nada novo para conciliar pelo documento.', 'ok'); return; }
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat(novos);
    const n = (tipo) => novos.filter((g) => g.tipo === tipo).length;
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    const texto = novos.length + (novos.length === 1 ? ' conciliação nova (ID #' + novos[0].id + ')' : ' conciliações novas (IDs #' + novos[0].id + ' a #' + novos[novos.length - 1].id + ')') +
      ': ' + n('AxA') + ' A×A e ' + n('AxB') + ' A×B' + (n('BxB') ? ' e ' + n('BxB') + ' B×B' : '');
    historico('⚡ Conciliar pelo documento: ' + texto);
    redesenharAB();
    T.avisoRapido('⚡ ' + texto + '. Em aberto: ' + ab.abertosA.length + ' na A e ' + ab.abertosB.length + ' na B.', 'ok', 8000);
    gravar('terceiro-ab-automatico', texto);
  }

  // Limpar a conciliação de um mês (Dony, 14/09/2026: "escolho o mês da conciliação e limpo ela
  // todinha"). Apaga o registro deste passo nesse mês: conciliações com ID (automáticas e à mão),
  // observações e fornecedores ajustados à mão. Os arquivos continuam guardados; o registro vai
  // para _apagados (nada some de verdade).
  async function limparConciliacao() {
    const arm = app().armazenamento;
    let registros;
    try {
      registros = (await arm.conciliacoes(E.codigo)).filter((c) => c.tipo === E.cfg.tipo)
        .sort((a, b) => (a.competencia < b.competencia ? 1 : a.competencia > b.competencia ? -1 : 0));
    } catch (e) { T.avisoRapido(T.mensagemDeErro(e), 'erro'); return; }
    if (!registros.length) { T.avisoRapido('Nenhuma conciliação do Passo ' + E.cfg.numero + ' gravada nesta empresa: não há o que limpar.', 'ok'); return; }
    const descreve = (c) => {
      const gs = (c.decisoes && c.decisoes.conciliacoesAB) || [];
      const mao = gs.filter((g) => g.regra === 'manual').length;
      return U.nomeCompetencia(c.competencia) + ' — ' + gs.length.toLocaleString('pt-BR') + ' conciliação(ões) com ID' + (mao ? ' (' + mao + ' à mão)' : '') +
        (c.atualizadoEm ? ' · gravada por ' + (c.atualizadoPor || '?') + ' em ' + U.dataHoraLocal(c.atualizadoEm) : '');
    };
    const inicial = registros.find((c) => c.competencia === E.comp) || registros[0];
    const mesDe = (id) => U.nomeCompetencia((registros.find((c) => c.id === id) || inicial).competencia);
    const escolhido = await T.janela({
      titulo: 'Limpar a conciliação do Passo ' + E.cfg.numero + ' · ' + E.cfg.titulo,
      corpo: '<div class="campo"><label for="mes-limpar">Mês da conciliação</label><select id="mes-limpar">' +
        registros.map((c) => '<option value="' + T.esc(c.id) + '"' + (c === inicial ? ' selected' : '') + '>' + T.esc(descreve(c)) + '</option>').join('') + '</select></div>' +
        '<p style="line-height:1.55;margin-top:12px">Apaga <b>tudo</b> o que foi feito no Passo ' + E.cfg.numero + ' desse mês: as conciliações com ID (automáticas e à mão), as observações e os fornecedores ajustados à mão. Depois é como começar do zero.</p>' +
        '<p class="suave pequeno" style="line-height:1.5">Os arquivos (agings e razão) e o período escolhido continuam guardados. Uma cópia do que foi apagado vai para a pasta <b>_apagados</b> da pasta de dados — nada some de verdade.</p>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Limpar ' + mesDe(inicial.id), tipo: 'perigo', antes: (j) => j.querySelector('#mes-limpar').value }],
      aoAbrir: (j) => {
        const sel = j.querySelector('#mes-limpar');
        sel.addEventListener('change', () => { j.querySelector('footer .perigo').textContent = 'Limpar ' + mesDe(sel.value); });
      },
    });
    if (!escolhido) return;
    const reg = registros.find((c) => c.id === escolhido);
    if (!reg) return;
    try {
      await E.fila; // gravação pendente termina antes (senão ela recriaria o registro apagado)
      const ok = await arm.apagarConciliacao(reg.id);
      // O período é da conciliação, não uma decisão: continua escolhido depois de limpar.
      const per = reg.decisoes && inicioDoPeriodo(reg.decisoes.periodoDe, reg.competencia);
      if (per) {
        await arm.salvarConciliacao({ id: reg.id, codigo: reg.codigo, tipo: reg.tipo, competencia: reg.competencia, situacao: 'andamento', arquivos: [], resumo: {},
          decisoes: { periodoDe: per, historico: [{ quando: U.agoraISO(), quem: app().usuario.nome, texto: 'Conciliação limpa; período mantido: ' + nomeDoPeriodo(per, reg.competencia) }] } });
      }
      const gs = (reg.decisoes && reg.decisoes.conciliacoesAB) || [];
      await arm.registrarNoLog({ codigo: E.codigo, acao: 'terceiro-limpar', alvo: reg.id, detalhe: U.nomeCompetencia(reg.competencia) + ' · ' + gs.length + ' conciliações' });
      T.avisoRapido('Conciliação de ' + U.nomeCompetencia(reg.competencia) + ' limpa' + (ok ? ' (cópia em _apagados).' : '.'), 'ok', 6000);
      if (reg.competencia === E.comp) app().mostrarRota();
    } catch (e) {
      T.avisoRapido('Não foi possível limpar: ' + T.mensagemDeErro(e), 'erro');
    }
  }

  // Desfazer em lote (Dony, 14/09/2026: "desfazer as automáticas e desfazer as manuais também").
  // Uma por uma continua no botão Desfazer de cada ID, na lista.
  async function desfazerEmLote(manuais) {
    const saem = E.decisoes.conciliacoesAB.filter((g) => (g.regra === 'manual') === manuais);
    if (!saem.length) return;
    const ok = await T.confirmar({
      titulo: manuais ? 'Desfazer as conciliações manuais' : 'Desfazer as conciliações automáticas',
      texto: manuais
        ? 'As <b>' + saem.length.toLocaleString('pt-BR') + '</b> conciliações feitas à mão voltam para <b>em aberto</b> (as observações delas também saem). As automáticas continuam.'
        : 'As <b>' + saem.length.toLocaleString('pt-BR') + '</b> conciliações feitas pelo ⚡ Conciliar voltam para <b>em aberto</b>. As feitas à mão continuam.',
      botao: 'Desfazer', perigo: true,
    });
    if (!ok) return;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => (g.regra === 'manual') !== manuais);
    saem.forEach((g) => E.abertosAB.delete(g.id));
    historico('Desfez ' + saem.length + ' conciliações ' + (manuais ? 'manuais' : 'automáticas') + ': ' + saem.slice(0, 20).map((g) => '#' + g.id).join(', ') + (saem.length > 20 ? '…' : ''));
    redesenharAB();
    T.avisoRapido(saem.length + ' conciliação(ões) ' + (manuais ? 'manuais' : 'automáticas') + ' desfeita(s).', 'ok');
    gravar(manuais ? 'terceiro-ab-desfazer-manuais' : 'terceiro-ab-desfazer-automaticas', saem.length + ' conciliações');
  }

  async function conciliarAB() {
    const a = Array.from(E.selA), b = Array.from(E.selB);
    if (!a.length && !b.length) return;
    const valorA = somaSel(E.selA), valorB = somaSel(E.selB);
    let obs = '';
    if (Math.abs(valorA - valorB) >= 1) {
      // Diferença não bloqueia: pergunta mostrando os dois valores (Parte 7.11), com o motivo.
      const r = await T.janela({
        titulo: 'Conciliar manualmente com diferença?',
        corpo: '<p style="line-height:1.7">Parte A: <b>' + T.moeda(valorA) + '</b> (' + a.length + ' item(ns))<br>Parte B: <b>' + T.moeda(valorB) + '</b> (' + b.length + ' item(ns))<br>' +
          '<span class="falta">Diferença: <b>' + T.moeda(valorA - valorB) + '</b></span></p>' +
          '<div class="campo" style="margin-top:10px"><label for="obs-ab">Observação (por que concilia assim)</label><input id="obs-ab" autocomplete="off" maxlength="200" placeholder="Ex.: juros pagos no boleto" autofocus></div>',
        botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Conciliar com diferença', tipo: 'primario', antes: (j) => ({ obs: j.querySelector('#obs-ab').value.trim() }) }],
        aoAbrir: (j) => { j.querySelector('#obs-ab').addEventListener('keydown', (e) => { if (e.key === 'Enter') j.querySelector('footer .primario').click(); }); },
      });
      if (!r) return;
      obs = r.obs;
    }
    const itens = a.concat(b).map((id) => E.itens.porId.get(id)).filter(Boolean);
    const docs = Array.from(new Set(itens.map((x) => x.doc).filter(Boolean)));
    const g = {
      id: M.proximoIdAB(E.decisoes.conciliacoesAB), tipo: M.tipoAB(a.length, b.length), regra: 'manual',
      documento: docs.slice(0, 3).join(', ') + (docs.length > 3 ? '…' : ''),
      nome: ((itens.find((x) => x.chave !== SEM) || itens[0] || {}).nome) || '',
      a, b, valorA, valorB, quem: app().usuario.nome, quando: U.agoraISO(),
    };
    if (obs) g.obs = obs;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat([g]);
    E.selA = new Set(); E.selB = new Set();
    historico('Conciliou à mão #' + g.id + ' (' + TIPO_AB[g.tipo] + '): ' + a.length + ' de A e ' + b.length + ' de B (' + U.formatarCentavos(valorA) + ' × ' + U.formatarCentavos(valorB) + ')');
    redesenharAB();
    T.avisoRapido('Conciliado à mão: ID #' + g.id + ' (' + TIPO_AB[g.tipo] + ')', 'ok');
    gravar('terceiro-ab-conciliar', '#' + g.id + ' · ' + a.length + '+' + b.length + ' · ' + U.formatarCentavos(valorA));
  }

  function abaFornecedores(alvo, soDiferencas) {
    const situacoes = Array.from(new Set(E.r.fornecedores.map((f) => f.situacao)));
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' },
      { tipo: 'select', nome: 'situacao', texto: 'Situação', opcoes: [['', 'Todas as situações']].concat(situacoes.map((s) => [s, (SIT[s] || [0, s])[1]])) },
    ]);
    const busca = filtro('busca'); const sit = filtro('situacao');
    let lista = E.r.fornecedores.filter((f) => f.chave !== SEM);
    if (soDiferencas) lista = lista.filter((f) => f.situacao !== 'bate' && f.situacao !== 'so-razao' && f.situacao !== 'conciliada');
    lista = lista.filter((f) => (!sit || f.situacao === sit) && (combina(busca, f.nome) || (U.soDigitos(busca) && f.cnpj && f.cnpj.indexOf(U.soDigitos(busca)) >= 0)));
    const explica = soDiferencas
      ? '<p class="suave pequeno" style="margin:0 0 10px">Só os fornecedores que <b>não bateram</b>. Junte à mão os que são o mesmo (✎), ou marque como conciliado (✓) quando você já conferiu.</p>'
      : '<p class="suave pequeno" style="margin:0 0 10px">Todos os fornecedores. <b>Aging ' + T.esc(E.entrada.mesAnterior) + ' + movimento = esperado</b>; a diferença é contra o aging ' + T.esc(E.entrada.mesAtual) + '.</p>';
    alvo.innerHTML = explica + '<div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th style="width:24px"></th><th>Fornecedor</th><th>CNPJ</th><th class="num">' + T.esc(E.entrada.mesAnterior) + '</th><th class="num">' + primeiraMaiuscula(E.cfg.aumentos) + '</th><th class="num">' + primeiraMaiuscula(E.cfg.reducoes) + '</th><th class="num">Movim.</th><th class="num">Esperado</th><th class="num">' + T.esc(E.entrada.mesAtual) + '</th><th class="num">Diferença</th><th>Situação</th><th></th>',
      linhas: lista, porPagina: 200,
      vazio: soDiferencas ? 'Tudo batendo — nenhuma diferença. 🎉' : 'Nenhum fornecedor com estes filtros.',
      linha: (f) => {
        const aberto = E.abertos.has(f.chave);
        let h = '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir="' + T.esc(f.chave) + '">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="nome"><b>' + T.esc(f.nome) + '</b>' + (f.observacao ? '<br><span class="suave pequeno">✎ ' + T.esc(f.observacao) + '</span>' : '') + '</td>' +
          '<td class="num">' + (f.cnpj ? U.formatarCnpj(f.cnpj) : '—') + '</td>' +
          T.tdValor(f.anterior) + T.tdValor(f.notas) + T.tdValor(f.baixas) + T.tdValor(f.movimento) + T.tdValor(f.esperado) + T.tdValor(f.atual) +
          '<td class="num ' + (Math.abs(f.diferenca) < 1 ? 'zero' : 'negativo') + '"><b>' + U.formatarCentavos(f.diferenca) + '</b></td>' +
          '<td>' + pil(f.situacao) + '</td>' +
          '<td class="num" style="white-space:nowrap">' + (f.linhasRazao ? '<button type="button" class="botao pequeno leve" data-juntar="' + T.esc(f.chave) + '" title="Juntar com outro fornecedor (mesmo dono)">✎ juntar</button>' : '') +
          (f.situacao !== 'bate' ? ' <button type="button" class="botao pequeno" data-conciliar="' + T.esc(f.chave) + '">' + (f.situacao === 'conciliada' ? 'desfazer' : '✓ conciliar') + '</button>' : '') + '</td></tr>';
        if (aberto) h += '<tr class="sub"><td></td><td colspan="11">' + detalheFornecedor(f) + '</td></tr>';
        return h;
      },
    });
  }

  // Colunas do razão no sentido da conta: ③ nota (crédito) e baixa (débito); ② adiantamento
  // (débito) e compensação (crédito).
  function cabecalhoRazao(comLado) {
    const rot = (nome, lado) => primeiraMaiuscula(nome) + (comLado ? ' (' + lado.slice(0, 4) + '.)' : '');
    return '<th class="num">' + rot(E.cfg.aumento, E.cfg.ladoAumento) + '</th><th class="num">' + rot(E.cfg.reducao, E.cfg.ladoReducao) + '</th>';
  }
  function tdsRazao(l) {
    const lados = M.ladosDoRazao(E.cfg.natureza, l);
    return T.tdValor(lados.aumento) + T.tdValor(lados.reducao);
  }

  function detalheFornecedor(f) {
    const r = E.r;
    const rz = r.razPorChave.get(f.chave);
    const a = r.anterior.get(f.chave); const at = r.atual.get(f.chave);
    const tabTit = (titulo, g) => g && g.titulos.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>' + titulo + '</b> (' + g.titulos.length + ' · ' + T.moeda(g.valor) + ')</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Vencimento</th><th>Documento</th><th class="num">Valor</th></tr></thead><tbody>' +
      g.titulos.slice(0, 40).map((t) => '<tr><td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + T.tdValor(t.valor) + '</tr>').join('') + '</tbody></table></div>' : '';
    const tabRaz = rz && rz.linhas.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>Razão do mês</b> (' + rz.linhas.length + ' lançamentos)</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th>' + cabecalhoRazao(true) + '<th></th></tr></thead><tbody>' +
      rz.linhas.slice(0, 80).map((l) => '<tr><td class="num">' + T.esc(l.data) + '</td><td>' + T.nome(l.documento) + '</td><td class="historico">' + T.esc(l.historico) + '</td>' +
        tdsRazao(l) + '<td><button type="button" class="lapis" data-dono-linha="' + l.i + '" title="Esta linha é de outro fornecedor">✎</button></td></tr>').join('') +
      '</tbody></table></div>' + (rz.linhas.length > 80 ? '<p class="suave pequeno">… e mais ' + (rz.linhas.length - 80) + '.</p>' : '') : '<p class="suave pequeno">Sem lançamentos no razão para este fornecedor.</p>';
    return tabRaz + tabTit('Aging ' + E.entrada.mesAnterior, a) + tabTit('Aging ' + E.entrada.mesAtual, at);
  }

  function abaSem(alvo) {
    const linhas = E.r.semFornecedor.linhas.map((i) => E.r.linhas[i]);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">' + linhas.length + ' linha(s) do razão que o programa não conseguiu dizer de quem são. Clique no ✎ para dar o fornecedor.</p><div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th>' + cabecalhoRazao(false) + '<th></th>',
      linhas, vazio: 'Nenhuma linha sem fornecedor. 👍',
      linha: (l) => { const lc = E.arquivos.raz.conteudo.conta.lancamentos[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDaLinha(lc)) + '</td>' +
        '<td class="historico">' + T.esc(lc.historico) + '</td>' + tdsRazao(lc) +
        '<td><button type="button" class="botao pequeno" data-dono-linha="' + l.i + '">✎ dar fornecedor</button></td></tr>'; },
    });
  }

  function abaRazao(alvo) {
    desenharFiltros([{ tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor, histórico ou documento' }]);
    const busca = filtro('busca');
    const lancs = E.arquivos.raz.conteudo.conta.lancamentos;
    const lista = E.r.linhas.filter((l) => { const d = E.r.porLinha.get(l.digital); return combina(busca, d.nome, l.historico) || (busca && M.documentoDaLinha(lancs[l.i]).indexOf(M.normalizarDocumento(busca) || busca) >= 0); });
    alvo.innerHTML = '<div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th>Fornecedor</th>' + cabecalhoRazao(false) + '<th></th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhuma linha.',
      linha: (l) => { const d = E.r.porLinha.get(l.digital); const lc = lancs[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDaLinha(lc)) + '</td>' +
        '<td class="historico">' + T.esc(lc.historico) + '</td><td class="nome">' + (d.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(d.nome)) +
        ' <button type="button" class="lapis" data-dono-linha="' + l.i + '">✎</button></td>' + tdsRazao(lc) + '<td></td></tr>'; },
    });
  }

  function abaAging(alvo, conteudo, mes) {
    desenharFiltros([{ tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' }]);
    const busca = filtro('busca');
    const lista = conteudo.titulos.filter((t) => combina(busca, t.nome) || (U.soDigitos(busca) && t.cnpj && t.cnpj.indexOf(U.soDigitos(busca)) >= 0));
    const total = lista.reduce((s, t) => s + t.valor, 0);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">Aging de ' + T.esc(mes) + ': ' + lista.length + ' título(s) em aberto · ' + T.moeda(total) + '.</p><div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Fornecedor</th><th>CNPJ</th><th>Vencimento</th><th>Documento</th><th class="num">Valor</th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhum título.',
      linha: (t) => '<tr><td class="nome">' + T.esc(t.nome) + '</td><td class="num">' + (t.cnpj ? U.formatarCnpj(t.cnpj) : '—') + '</td>' +
        '<td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + T.tdValor(t.valor) + '</tr>',
    });
  }

  // ------------------------------------------------------------------
  function recalcularEDesenhar() {
    calcular();
    E.el.querySelector('.cartao-ponte').outerHTML = ''; // remove ponte antiga
    // redesenha ponte no lugar
    const abas = E.el.querySelector('#abas');
    abas.insertAdjacentHTML('beforebegin', desenharPonte());
    desenharAbas();
    redesenhaMantendo();
  }
  function redesenhaMantendo() {
    const caixa = E.el.querySelector('#aba .tabela-caixa'); const topo = caixa ? caixa.scrollTop : 0;
    const pagina = E.el.closest('.conteudo'); const tp = pagina ? pagina.scrollTop : 0;
    desenharAba();
    const nova = E.el.querySelector('#aba .tabela-caixa'); if (nova) nova.scrollTop = topo;
    if (pagina) pagina.scrollTop = tp;
  }

  async function aoClicar(ev) {
    const aba = ev.target.closest('[data-aba]');
    if (aba) { E.aba = aba.getAttribute('data-aba'); app().gravarLocal('conciliador-solutta.aba-' + E.cfg.id, E.aba); desenharAbas(); desenharAba(); return; }
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { const k = abrir.getAttribute('data-abrir'); if (E.abertos.has(k)) E.abertos.delete(k); else E.abertos.add(k); redesenhaMantendo(); return; }
    const conciliar = ev.target.closest('[data-conciliar]');
    if (conciliar) {
      const k = conciliar.getAttribute('data-conciliar');
      const set = new Set(E.decisoes.conciliadas);
      if (set.has(k)) set.delete(k); else set.add(k);
      E.decisoes.conciliadas = Array.from(set);
      historico((set.has(k) ? 'Conciliou à mão ' : 'Desfez conciliação ') + k);
      recalcularEDesenhar();
      gravar('terceiro-conciliar', k);
      return;
    }
    const juntar = ev.target.closest('[data-juntar]');
    if (juntar) { await juntarFornecedor(juntar.getAttribute('data-juntar')); return; }
    const donoLinha = ev.target.closest('[data-dono-linha]');
    if (donoLinha) { await trocarDonoLinha(Number(donoLinha.getAttribute('data-dono-linha'))); return; }
    const acao = ev.target.closest('[data-acao]');
    if (acao) {
      const a = acao.getAttribute('data-acao');
      if (a === 'config-abas') await configurarAbas();
      else if (a === 'trocar-inicio') await trocarInicio();
      else if (a === 'limpar-conciliacao') await limparConciliacao();
      else if (a === 'conciliar-tudo') conciliarTudo();
      else if (a === 'desfazer-automaticas') await desfazerEmLote(false);
      else if (a === 'desfazer-manuais') await desfazerEmLote(true);
      else if (a === 'conciliar-ab') await conciliarAB();
      else if (a === 'limpar-ab') { E.selA = new Set(); E.selB = new Set(); redesenhaMantendo(); }
      return;
    }
    const limparLado = ev.target.closest('[data-limpar-lado]');
    if (limparLado) {
      const lado = limparLado.getAttribute('data-limpar-lado');
      CAMPOS_LADO.forEach((n) => { delete E.filtros['ab.' + lado + '.' + n]; });
      redesenhaMantendo();
      return;
    }
    const inicio = ev.target.closest('[data-inicio]');
    if (inicio) { await escolherInicio(inicio.getAttribute('data-inicio')); return; }
    const abrirAb = ev.target.closest('[data-abrir-ab]');
    if (abrirAb) { alternarDetalheAB(abrirAb); return; }
    const verId = ev.target.closest('[data-ver-id]');
    if (verId) {
      E.filtros['ab.busca'] = '#' + verId.getAttribute('data-ver-id');
      E.filtros['ab.mostrar'] = 'todos';
      E.abertosAB.add(Number(verId.getAttribute('data-ver-id')));
      desenharAba();
      return;
    }
    const desab = ev.target.closest('[data-desfazer-ab]');
    if (desab) {
      const id = Number(desab.getAttribute('data-desfazer-ab'));
      E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => g.id !== id);
      E.abertosAB.delete(id);
      historico('Desfez a conciliação #' + id);
      redesenharAB();
      gravar('terceiro-ab-desfazer', '#' + id);
      return;
    }
  }
  function aoMudar(ev) {
    const sel = ev.target.closest('select[data-filtro]');
    if (sel) { E.filtros[E.aba + '.' + sel.getAttribute('data-filtro')] = sel.value; desenharAba(); return; }
    const antc = ev.target.closest('#ab-anterior');
    if (antc) { E.incluirAnterior = antc.checked; app().gravarLocal('conciliador-solutta.ab-anterior', antc.checked ? '1' : '0'); desenharAba(); return; }
    const item = ev.target.closest('[data-item]');
    if (item) {
      const lado = item.getAttribute('data-item'); const id = item.getAttribute('data-id');
      const set = lado === 'A' ? E.selA : E.selB;
      if (item.checked) set.add(id); else set.delete(id);
      const tr = item.closest('tr'); if (tr) tr.classList.toggle('destaque', item.checked);
      atualizarBarraAB();
      return;
    }
    const todos = ev.target.closest('[data-marca-todos]');
    if (todos) {
      // Marca a lista INTEIRA desta parte (com os filtros de agora), não só as linhas já desenhadas.
      const lado = todos.getAttribute('data-marca-todos'); const set = lado === 'A' ? E.selA : E.selB;
      ((lado === 'A' ? E.listaA : E.listaB) || []).forEach((x) => {
        if (E.idDoItem.has(x.id)) return;
        if (todos.checked) set.add(x.id); else set.delete(x.id);
      });
      E.el.querySelectorAll('#col' + lado + ' [data-item]').forEach((c) => {
        const marcado = set.has(c.getAttribute('data-id'));
        c.checked = marcado;
        c.closest('tr').classList.toggle('destaque', marcado);
      });
      atualizarBarraAB();
    }
  }

  // Juntar um fornecedor inteiro (todas as suas linhas do razão) com outro (o mesmo dono).
  async function juntarFornecedor(chave) {
    const f = E.porChave.get(chave);
    const escolha = await janelaDono('Juntar "' + f.nome + '" com outro fornecedor',
      'As linhas do razão de <b>' + T.esc(f.nome) + '</b> passam a ser do fornecedor que você escolher (útil quando a nota entra num nome e a baixa em outro).');
    if (!escolha) return;
    const rz = E.r.razPorChave.get(chave);
    (rz ? rz.linhas : []).forEach((l) => { E.decisoes.donos[E.r.linhas[l.i].digital] = { chave: escolha.chave, nome: escolha.nome }; });
    historico('Juntou "' + f.nome + '" em "' + escolha.nome + '"');
    recalcularEDesenhar();
    T.avisoRapido('Juntado em ' + escolha.nome, 'ok');
    gravar('terceiro-juntar', f.nome + ' -> ' + escolha.nome);
  }

  async function trocarDonoLinha(i) {
    const linha = E.r.linhas.find((l) => l.i === i); if (!linha) return;
    const lc = E.arquivos.raz.conteudo.conta.lancamentos[i];
    const escolha = await janelaDono('Fornecedor desta linha',
      '<span class="pequeno suave">' + T.esc(lc.data) + ' · ' + T.esc(lc.historico) + '</span>');
    if (!escolha) return;
    E.decisoes.donos[linha.digital] = { chave: escolha.chave, nome: escolha.nome };
    historico('Trocou dono de uma linha para ' + escolha.nome);
    recalcularEDesenhar();
    gravar('terceiro-dono-linha', escolha.nome);
  }

  function janelaDono(titulo, subtitulo) {
    let escolha = null;
    return T.janela({
      titulo,
      corpo: (subtitulo ? '<p style="margin-bottom:10px">' + subtitulo + '</p>' : '') +
        '<div class="campo"><label for="nd">Fornecedor (nome ou CNPJ)</label><input id="nd" autofocus autocomplete="off" placeholder="Digite para ver os parecidos"></div>' +
        '<div id="diz" class="pequeno" style="margin-top:6px;min-height:18px"></div><div class="sugestoes-dono" id="sg"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Aplicar', tipo: 'primario', antes: (j) => { const t = j.querySelector('#nd').value.trim(); if (!t) return false; return escolha || MN.sugerirDono(t, E.r.listaFornecedores); } }],
      aoAbrir: (j) => {
        const input = j.querySelector('#nd'); const diz = j.querySelector('#diz'); const sg = j.querySelector('#sg');
        const atualizar = () => {
          escolha = null;
          const s = MN.sugerirDono(input.value, E.r.listaFornecedores);
          if (s.tipo === 'vazio') { diz.innerHTML = ''; sg.innerHTML = ''; return; }
          diz.innerHTML = s.tipo === 'novo' ? '<span style="color:var(--ambar)">Vai criar novo: <b>' + T.esc(s.nome) + '</b></span>' : '<span class="ok">Vai vincular a <b>' + T.esc(s.nome) + '</b> (' + T.esc(s.motivo) + ')</span>';
          sg.innerHTML = s.sugestoes.map((x) => '<button type="button" data-chave="' + T.esc(x.chave) + '">' + T.esc(x.nome) + (x.cnpj ? ' <span class="suave pequeno">' + U.formatarCnpj(x.cnpj) + '</span>' : '') + ' <span class="suave pequeno">· ' + x.linhas + '</span></button>').join('');
        };
        input.addEventListener('input', atualizar);
        sg.addEventListener('click', (e) => { const b = e.target.closest('[data-chave]'); if (!b) return; const x = E.r.listaFornecedores[b.getAttribute('data-chave')]; input.value = x.nome; escolha = { chave: x.chave, nome: x.nome }; diz.innerHTML = '<span class="ok">Vai vincular a <b>' + T.esc(x.nome) + '</b></span>'; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') j.querySelector('footer .primario').click(); });
      },
    });
  }

  raiz.TelaPasso3 = { mostrar, arquivosDoTerceiro, arquivosDoPasso, carregarDados, modoDoInicio, configDoPasso, PASSOS_AB, estado: () => E, TIPO_AB, COMO_AB };
})(self);
