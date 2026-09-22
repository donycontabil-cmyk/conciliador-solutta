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
  // Em CLIENTES é o espelho (Dony, 22/09/2026: "só muda a conta, e a natureza de uma é credora e a da outra é devedora"):
  // a nota de venda aumenta a conta no DÉBITO e o recebimento diminui no crédito; no adiantamento de clientes (passivo) é o contrário.
  const PASSOS_AB = {
    fornecedores: {
      passo3: {
        id: 'passo3', numero: '③', tipo: 'fornecedor_pagar', titulo: 'Fornecedores × contas a pagar', familia: 'fornecedores',
        natureza: 'fornecedores', tipoFinanceiro: 'financeiro_pagar', papelRazao: 'principal',
        nomeAging: 'aging (contas a pagar)', nomeRazao: 'razão de fornecedores',
        aumento: 'nota', reducao: 'baixa', aumentos: 'notas', reducoes: 'baixas', ladoAumento: 'créditos', ladoReducao: 'débitos',
        avisoAntes: 'baixa com data antes da nota', avisoCurto: 'baixa antes da nota',
      },
      passo2: {
        id: 'passo2', numero: '②', tipo: 'adiantamento_financeiro', titulo: 'Adiantamento × financeiro', familia: 'fornecedores',
        natureza: 'adiantamento', tipoFinanceiro: 'financeiro_adiantamento', papelRazao: 'adiantamento',
        nomeAging: 'aging de adiantamentos', nomeRazao: 'razão de adiantamento a fornecedores',
        aumento: 'adiantamento', reducao: 'compensação', aumentos: 'adiantamentos', reducoes: 'compensações', ladoAumento: 'débitos', ladoReducao: 'créditos',
        avisoAntes: 'compensação com data antes do adiantamento', avisoCurto: 'compensação antes do adiantamento',
      },
    },
    clientes: {
      passo3: {
        id: 'passo3', numero: '③', tipo: 'cliente_receber', titulo: 'Clientes × contas a receber', familia: 'clientes',
        natureza: 'clientes', tipoFinanceiro: 'financeiro_receber', papelRazao: 'principal',
        nomeAging: 'aging (contas a receber)', nomeRazao: 'razão de clientes',
        aumento: 'nota', reducao: 'recebimento', aumentos: 'notas', reducoes: 'recebimentos', ladoAumento: 'débitos', ladoReducao: 'créditos',
        avisoAntes: 'recebimento com data antes da nota', avisoCurto: 'recebimento antes da nota',
      },
      passo2: {
        id: 'passo2', numero: '②', tipo: 'adiantamento_cliente_financeiro', titulo: 'Adiantamento de clientes × financeiro', familia: 'clientes',
        natureza: 'adiantamento_cliente', tipoFinanceiro: 'financeiro_adiantamento_cliente', papelRazao: 'adiantamento',
        nomeAging: 'aging de adiantamentos de clientes', nomeRazao: 'razão de adiantamento de clientes',
        aumento: 'adiantamento', reducao: 'compensação', aumentos: 'adiantamentos', reducoes: 'compensações', ladoAumento: 'créditos', ladoReducao: 'débitos',
        avisoAntes: 'compensação com data antes do adiantamento', avisoCurto: 'compensação antes do adiantamento',
      },
    },
  };
  function configDoPasso(passoId, familiaId) {
    const daFamilia = PASSOS_AB[familiaId || 'fornecedores'] || PASSOS_AB.fornecedores;
    return daFamilia[passoId] || daFamilia.passo3;
  }
  function primeiraMaiuscula(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  // "fornecedor" ou "cliente", conforme a família do passo aberto (Dony, 22/09/2026).
  function pessoa() { return E && E.cfg && E.cfg.familia === 'clientes' ? 'cliente' : 'fornecedor'; }
  function pessoas() { return pessoa() + 's'; }
  // Natureza (D/C) no lugar do sinal (Dony, 16/09/2026: "só pelo valor positivo ou negativo me atrapalha").
  function dc(v) { return M.ladoDC(v, E.cfg.natureza); }
  function textoDC(v) { return T.valorDC(v, dc(v)); }   // "1.236,55 C"
  function htmlDC(v) { return T.htmlDC(v, dc(v)); }     // com a marca colorida
  function tdDC(v, extra) { return T.tdValorDC(v, dc(v), extra); }

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
    const cfg = configDoPasso(opcoes && opcoes.passo, opcoes && opcoes.familia);
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
    const arqs = arquivosDoPasso(metas, comp, cfg.id, { de: periodoDe, familia: cfg.familia });
    if (conferir && !conferir()) return null;
    const falta = [];
    if (!arqs.agingAnterior) falta.push('o ' + cfg.nomeAging + ' de ' + U.nomeCompetencia(arqs.compAnterior));
    if (!arqs.agingAtual) falta.push('o ' + cfg.nomeAging + ' de ' + U.nomeCompetencia(comp));
    if (!arqs.razao) falta.push('o ' + cfg.nomeRazao + ' de ' + nomeDoPeriodo(periodoDe, comp));
    if (falta.length) return { emp, comp, falta, cfg, arqs, registro, periodoDe };
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const [aAnt, aAtu, raz] = await Promise.all([carregar(arqs.agingAnterior), carregar(arqs.agingAtual), carregar(arqs.razao)]);
    if (conferir && !conferir()) return null;

    const decisoes = { donos: d.donos || {}, conciliadas: d.conciliadas || [], observacoes: d.observacoes || {}, conciliacoesAB: d.conciliacoesAB || [], historico: d.historico || [], inicio: d.inicio || null,
      atualizacoes: d.atualizacoes || [] };
    if (periodoDe) decisoes.periodoDe = periodoDe;
    // Lançamentos da Parte A: os do PERÍODO escolhido (do começo do período ao fim do mês). Sem
    // período, só os do mês (vale também para um razão de vários meses usado num mês do meio).
    const todosLancamentos = raz.conteudo.conta.lancamentos || [];
    const deComp = arqs.periodo ? arqs.periodo.de : comp;
    const lancamentosDoMes = lancamentosDoPeriodo(todosLancamentos, deComp, comp);
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
    // Arquivo atualizado depois da última gravação: confere o que mudou (o que não mudou continua).
    const atualizou = await conferirAtualizacao({ arm, registro, metas, atuais: { aAnt, aAtu, raz }, entrada, itens, decisoes, comp, deComp, cfg });
    if (conferir && !conferir()) return null;
    return { emp, comp, arquivos: { aAnt, aAtu, raz }, registro, entrada, decisoes, r, itens, arrumou: arrumado.mudou, atualizou, anterior, cfg, razaoDoMes, arqs, periodoDe };
  }

  // Os lançamentos do começo do período (ou do mês) ao fim do mês.
  function lancamentosDoPeriodo(lancs, deComp, comp) {
    const deNum = U.inicioDaCompetencia(deComp || comp).numero, ateNum = U.fimDaCompetencia(comp).numero;
    return (lancs || []).filter((l) => { const n = U.montarData(l.dia, l.mes, l.ano); return !!n && n.numero >= deNum && n.numero <= ateNum; });
  }

  // ------------------------------------------------------------------
  // ARQUIVO ATUALIZADO depois da última gravação (Dony, 16/09/2026: "atualizei o razão; se eu subir o
  // novo, tudo aquilo que ele já tinha feito, ele vai manter?" e "o meu medo é que as conciliações
  // manuais sumam, e que uma conciliação perca um lançamento no razão novo sem o sistema identificar").
  // O registro guarda os arquivos que a conciliação usou; se agora é outro (versão nova, ou excluiu e
  // carregou de novo), compara os itens de antes com os de agora (MotorTerceiro.atualizarAB): nenhuma
  // conciliação sai sozinha; a que perdeu item fica marcada ("⚠ item faltando") para ele decidir; o item
  // só corrigido (mesmo valor e documento) é trocado dentro dela; o ⚡ tenta o que entrou; e fica
  // registrado o que aconteceu (decisoes.atualizacoes) — o cartão da aba Conciliar A × B.
  // ------------------------------------------------------------------
  const LUGARES_DO_REGISTRO = [['anterior', 'aAnt'], ['atual', 'aAtu'], ['razao', 'raz']];
  const ATUALIZACOES_GUARDADAS = 12;   // as últimas atualizações
  const ATUALIZACOES_COM_LISTAS = 3;   // as últimas com a lista do que entrou, saiu e mudou
  const LIMITE_LISTA = 400;

  // O conteúdo de um arquivo da última gravação: ainda guardado (versão anterior) ou na pasta _apagados.
  async function conteudoAntigo(arm, id, metas) {
    const meta = metas.find((m) => m.id === id) || null;
    if (meta) { try { return { meta, conteudo: await arm.conteudoDoArquivo(id) }; } catch (e) { /* segue */ } }
    try {
      const ap = typeof arm.arquivoApagado === 'function' ? await arm.arquivoApagado(id) : null;
      if (ap) return { meta: ap.meta || { id }, conteudo: ap.conteudo, excluido: true };
    } catch (e) { /* sem cópia */ }
    return null;
  }

  function nomeDoLugarAtualizado(lugar, entrada, cfg) {
    if (lugar === 'razao') return cfg.nomeRazao;
    return cfg.nomeAging + ' de ' + (lugar === 'anterior' ? entrada.mesAnterior : entrada.mesAtual);
  }

  // Resultado da atualização em números (o cartão, o aviso e o histórico usam).
  function contasDaAtualizacao(a) {
    const mud = (a.mudaram || []).length;
    const faltando = a.faltando || [];
    return {
      entraram: Math.max(0, (a.qtdEntraram || 0) - mud), sairam: Math.max(0, (a.qtdSairam || 0) - mud), mudaram: mud,
      trocadas: (a.trocadas || []).length, faltando: faltando.length, faltandoNovas: faltando.filter((f) => !f.jaFaltava).length,
      faltandoManuais: faltando.filter((f) => f.grupo.regra === 'manual').length, completas: (a.completas || []).length, novas: (a.novas || []).length,
    };
  }

  // "razão de fornecedores atualizado: 640 conciliações continuam · 1 trocada · 2 com item faltando · 5 novas pelo ⚡ · entraram 9, saíram 2, mudaram 1"
  function fraseDaAtualizacao(a) {
    const n = contasDaAtualizacao(a);
    const partes = [a.continuam + ' conciliação(ões) continuam'];
    if (n.trocadas) partes.push(n.trocadas + ' com item trocado pelo corrigido');
    if (n.faltando) partes.push(n.faltando + ' com item faltando (para conferir)');
    if (n.completas) partes.push(n.completas + ' completas de novo');
    if (n.novas) partes.push(n.novas + ' nova(s) pelo ⚡');
    if (!a.semComparacao) partes.push('entraram ' + n.entraram + ', saíram ' + n.sairam + ', mudaram ' + n.mudaram);
    return (a.nomes && a.nomes.length ? a.nomes.join(' e ') + ' atualizado: ' : 'Arquivo atualizado: ') + partes.join(' · ');
  }

  // Só as últimas atualizações guardam as listas inteiras.
  function compactarAtualizacoes(lista) {
    const xs = lista.slice(-ATUALIZACOES_GUARDADAS);
    return xs.map((a, i) => (i >= xs.length - ATUALIZACOES_COM_LISTAS ? a
      : Object.assign({}, a, { entraram: [], sairam: [], mudaram: [], listasCompactadas: true })));
  }

  // O que fica guardado de uma conciliação na atualização (sem a lista de itens).
  function resumoDoGrupo(g) {
    const o = { id: g.id, tipo: g.tipo, regra: g.regra, documento: g.documento || '', nome: g.nome || '', valorA: g.valorA || 0, valorB: g.valorB || 0 };
    if (g.obs) o.obs = g.obs;
    if (g.quem) o.quem = g.quem;
    return o;
  }

  async function conferirAtualizacao(ctx) {
    const { arm, registro, metas, atuais, entrada, itens, decisoes, comp, deComp, cfg } = ctx;
    const grupos = decisoes.conciliacoesAB;
    if (!registro.atualizadoEm || !grupos.length) return null;
    const usados = Array.isArray(registro.arquivos) && registro.arquivos.length === 3 ? registro.arquivos : null;
    const trocados = usados
      ? LUGARES_DO_REGISTRO.map(([lugar, k], i) => ({ lugar, idAntes: usados[i], atual: atuais[k] })).filter((t) => t.idAntes && t.idAntes !== t.atual.meta.id)
      : [];
    if (!trocados.length) return null;
    // Os itens de antes: refeitos com os arquivos da última gravação; sem eles, os das conciliações e das pendências.
    const antigos = {};
    for (const t of trocados) antigos[t.lugar] = await conteudoAntigo(arm, t.idAntes, metas);
    let antes = null, semArquivoAntigo = false;
    if (trocados.every((t) => antigos[t.lugar])) {
      const e = Object.assign({}, entrada);
      if (antigos.anterior) e.agingAnterior = antigos.anterior.conteudo;
      if (antigos.atual) e.agingAtual = antigos.atual.conteudo;
      if (antigos.razao) e.contaRazao = { conta: antigos.razao.conteudo.conta, lancamentos: lancamentosDoPeriodo(antigos.razao.conteudo.conta.lancamentos, deComp, comp) };
      const itensAntes = M.itensAB(e, M.calcular(e));
      antes = { ids: new Set(itensAntes.porId.keys()), porId: itensAntes.porId };
    } else if (registro.pendencias) {
      semArquivoAntigo = true;
      const porId = new Map();
      (registro.pendencias.A || []).concat(registro.pendencias.B || []).forEach((x) => porId.set(x.id, x));
      const ids = new Set(porId.keys());
      grupos.forEach((g) => (g.a || []).concat(g.b || []).forEach((id) => ids.add(id)));
      antes = { ids, porId };
    }
    const quem = app().usuario.nome, quando = U.agoraISO();
    const res = M.atualizarAB(antes, itens, grupos, quem, quando);
    const nomes = trocados.map((t) => nomeDoLugarAtualizado(t.lugar, entrada, cfg));
    const novasFaltando = res.faltando.filter((f) => !f.jaFaltava).length;
    if (!res.trocadas.length && !novasFaltando && !res.completas.length && !res.novas.length && !res.entraram.length && !res.sairam.length) {
      return { vazio: true, nomes };
    }
    decisoes.conciliacoesAB = res.grupos;
    const arquivoDe = (x) => (x && x.meta ? { id: x.meta.id, arquivo: x.meta.arquivo || '', enviadoEm: x.meta.enviadoEm || '', enviadoPor: x.meta.enviadoPor || '',
      qtd: x.meta.tipo === 'razao' ? x.meta.lancamentos : x.meta.titulos, excluido: !!x.excluido } : null);
    const a = {
      quando, quem, nomes,
      arquivos: trocados.map((t) => ({ lugar: t.lugar, antes: arquivoDe(antigos[t.lugar]) || { id: t.idAntes }, depois: arquivoDe(t.atual) })),
      continuam: res.continuam,
      qtdEntraram: res.entraram.length, qtdSairam: res.sairam.length,
      entraram: res.entraram.slice(0, LIMITE_LISTA), sairam: res.sairam.slice(0, LIMITE_LISTA), mudaram: res.mudaram.slice(0, LIMITE_LISTA),
      trocadas: res.trocadas.map((x) => ({ grupo: resumoDoGrupo(x.grupo), trocas: x.trocas })),
      faltando: res.faltando.map((x) => ({ grupo: resumoDoGrupo(x.grupo), sairam: x.sairam, jaFaltava: !!x.jaFaltava })),
      completas: res.completas,
      novas: res.novas.map((g) => g.id),
    };
    if (res.semComparacao) a.semComparacao = true;
    if (semArquivoAntigo) a.semArquivoAntigo = true;
    decisoes.atualizacoes = compactarAtualizacoes((decisoes.atualizacoes || []).concat([a]));
    const marcadas = a.faltando.filter((f) => !f.jaFaltava);
    decisoes.historico = (decisoes.historico || []).concat([{ quando, quem, texto: '🔄 ' + fraseDaAtualizacao(a) +
      (marcadas.length ? ' — com item faltando: ' + marcadas.slice(0, 20).map((x) => '#' + x.grupo.id).join(', ') + (marcadas.length > 20 ? '…' : '') : '') }]).slice(-200);
    return a;
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

  async function mostrar(el, codigo, anoMes, conferir, passoId, familiaId) {
    const cfg = configDoPasso(passoId, familiaId);
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/' + cfg.familia + '/' + anoMes;
    T.carregando(el, 'Abrindo o Passo ' + cfg.numero + ' de ' + U.nomeCompetencia(comp) + '…');
    const dados = await carregarDados(codigo, anoMes, conferir, { passo: cfg.id, familia: cfg.familia });
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
    const at = dados.atualizou;
    desenharTudo();
    if (at && !at.vazio) {
      // Arquivo atualizado: grava o resultado (conciliações que continuam, desfeitas e novas).
      gravar('conciliacao-atualizada', fraseDaAtualizacao(at));
      T.avisoRapido('🔄 ' + fraseDaAtualizacao(at), 'ok', 10000);
      return;
    }
    if (at && at.vazio) T.avisoRapido('🔄 ' + (at.nomes.join(' e ') || 'Arquivo') + ': versão nova com os mesmos itens — a conciliação continua igual.', 'ok', 7000);
    // Pendências gravadas desatualizadas (registro de antes desta versão, troca do início,
    // arquivo trocado): regrava para o mês seguinte continuar do jeito certo.
    const pendenciasDeAgora = JSON.stringify(M.pendenciasAB(E.itens, E.decisoes.conciliacoesAB, E.comp));
    if (at || dados.arrumou || (dados.registro.atualizadoEm && JSON.stringify(dados.registro.pendencias || null) !== pendenciasDeAgora)) gravar(null);
  }

  // Escolhe os arquivos de um passo A × B para o período escolhido (opcoes.de = começo do
  // período; sem ele, só o mês):
  //  - aging anterior = o do mês ANTES do começo do período (período abril a agosto → março);
  //  - aging do mês = o do fim do período;
  //  - razão = o guardado nesta conciliação (competência do fim). Só para um mês, vale também um
  //    razão de vários meses guardado em outra competência que cobre o mês inteiro.
  //  ③: contas a pagar + razão de fornecedores · ②: aging de adiantamentos + razão de adiantamento.
  function arquivosDoPasso(metas, comp, passoId, opcoes) {
    const cfg = configDoPasso(passoId, opcoes && opcoes.familia);
    const de = inicioDoPeriodo(opcoes && opcoes.de, comp);
    const compAnterior = U.somarMeses(de || comp, -1);
    const maisNovo = (lista) => lista.slice().sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm))[0] || null;
    const agings = (c) => metas.filter((m) => m.tipo === cfg.tipoFinanceiro && m.competencia === c);
    const daConta = (m) => m.tipo === 'razao' && m.conta && m.conta.familia === cfg.familia && m.conta.papel === cfg.papelRazao;
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
      periodo: de ? { de, ate: comp } : null, sugestaoDe, metas };
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
    const aberta = E && E.registro && E.registro.id === ctx.registro.id && E.el && E.el.isConnected;
    const qtd = aberta ? E.decisoes.conciliacoesAB.length : ((ctx.registro.decisoes && ctx.registro.decisoes.conciliacoesAB) || []).length;
    const avisoExcluir = qtd ? 'As <b>' + qtd.toLocaleString('pt-BR') + '</b> conciliações deste passo continuam guardadas: com a troca de arquivo, ' +
      'o que não mudou continua conciliado, nenhuma conciliação some e o programa mostra o que entrou, saiu ou mudou. (Para trocar direto, use <b>🔄 Carregar nova versão</b>.)' : '';
    const comuns = (id) => ({ conferirTroca: conferirTrocaDo(ctx, id), avisoExcluir });
    return [
      Object.assign({ id: 'razao', parte: 'Parte A · contabilidade', titulo: primeiraMaiuscula(cfg.nomeRazao), sub: periodo, nome: cfg.nomeRazao + ' de ' + periodo, log: cfg.id + '/razao',
        tipo: 'razao', papel: cfg.papelRazao, competencia: comp, periodo: { de: periodoDe || comp, ate: comp }, nomePeriodo: periodo, arquivos: arqs.razao ? [arqs.razao] : [] }, comuns('razao')),
      Object.assign({ id: 'anterior', parte: 'Parte A · saldo inicial', titulo: primeiraMaiuscula(cfg.nomeAging), sub: U.nomeCompetencia(arqs.compAnterior) + (periodoDe ? ' (mês antes do período)' : ' (mês anterior)'),
        nome: cfg.nomeAging + ' de ' + U.nomeCompetencia(arqs.compAnterior), log: cfg.id + '/anterior', tipo: cfg.tipoFinanceiro, competencia: arqs.compAnterior, arquivos: arqs.agingAnterior ? [arqs.agingAnterior] : [] }, comuns('anterior')),
      Object.assign({ id: 'atual', parte: 'Parte B · financeiro', titulo: primeiraMaiuscula(cfg.nomeAging), sub: U.nomeCompetencia(comp),
        nome: cfg.nomeAging + ' de ' + U.nomeCompetencia(comp), log: cfg.id + '/atual', tipo: cfg.tipoFinanceiro, competencia: comp, arquivos: arqs.agingAtual ? [arqs.agingAtual] : [] }, comuns('atual')),
    ];
  }

  // Antes de guardar a versão nova de um arquivo que a conciliação aberta usa: mostra o que vai
  // acontecer com as conciliações (o mesmo cálculo que roda ao abrir, MotorTerceiro.atualizarAB) e pergunta.
  function conferirTrocaDo(ctx, lugarId) {
    return async (novo, comparacao) => {
      if (!E || !E.registro || E.registro.id !== ctx.registro.id || !E.el || !E.el.isConnected) return true;
      await E.fila; // o que estava para gravar grava antes
      const grupos = E.decisoes.conciliacoesAB;
      if (!grupos.length) return true;
      const entrada = Object.assign({}, E.entrada, { decisoes: E.decisoes });
      if (lugarId === 'razao') entrada.contaRazao = { conta: novo.conta, lancamentos: lancamentosDoPeriodo(novo.conta.lancamentos, E.arqs.periodo ? E.arqs.periodo.de : E.comp, E.comp) };
      else if (lugarId === 'anterior') entrada.agingAnterior = novo.financeiro;
      else entrada.agingAtual = novo.financeiro;
      let res;
      try {
        const itens = M.itensAB(entrada, M.calcular(entrada));
        res = M.atualizarAB({ ids: new Set(E.itens.porId.keys()), porId: E.itens.porId }, itens, grupos, '', '');
      } catch (e) { return true; }
      const novasFaltando = res.faltando.filter((f) => !f.jaFaltava);
      if (!res.trocadas.length && !novasFaltando.length && !res.completas.length && !res.novas.length && !res.entraram.length && !res.sairam.length) return true;
      const nomeLugar = nomeDoLugarAtualizado(lugarId, E.entrada, E.cfg);
      const coisas = lugarId === 'razao' ? 'lançamentos' : 'títulos';
      const mud = res.mudaram.length;
      const ids = (gs) => gs.slice(0, 12).map((g) => '#' + g.id).join(', ') + (gs.length > 12 ? '…' : '');
      const manuais = novasFaltando.filter((f) => f.grupo.regra === 'manual').length;
      const muito = novasFaltando.length >= 10 && novasFaltando.length > grupos.length * 0.3;
      const noArquivo = comparacao && comparacao.iguais !== undefined
        ? 'No arquivo: ' + raiz.TelaSubir.contagensDaComparacao(comparacao, true) + '.<br>' : '';
      return T.confirmar({
        titulo: 'Carregar a versão nova do ' + nomeLugar + '?',
        texto: noArquivo + 'Na conciliação de ' + T.esc(E.entrada.nomeRazao || E.entrada.mesAtual) + ':<br>' +
          '✓ <b>' + res.continuam.toLocaleString('pt-BR') + '</b> conciliação(ões) continuam como estão (nenhuma é desfeita sozinha).<br>' +
          '➕ Entram <b>' + Math.max(0, res.entraram.length - mud) + '</b> · ➖ saem <b>' + Math.max(0, res.sairam.length - mud) + '</b> · ✎ mudam <b>' + mud + '</b> ' + coisas + ' nas Partes A e B.<br>' +
          (res.trocadas.length ? '✎ <b>' + res.trocadas.length + '</b> conciliação(ões) continuam com o item corrigido no lugar do antigo (mesmo valor e documento): ' + ids(res.trocadas.map((x) => x.grupo)) + '.<br>' : '') +
          (novasFaltando.length ? '<span class="falta">⚠ <b>' + novasFaltando.length + '</b> conciliação(ões) vão ficar com item faltando' + (manuais ? ' (' + manuais + ' feita(s) à mão)' : '') + ': ' + ids(novasFaltando.map((x) => x.grupo)) +
            '. Elas <b>não somem</b>: ficam marcadas para você conferir e decidir.</span><br>' : '') +
          (res.completas.length ? '↩ <b>' + res.completas.length + '</b> conciliação(ões) com item faltando ficam completas de novo: ' + ids(res.completas.map((id) => ({ id }))) + '.<br>' : '') +
          '⚡ ' + (res.novas.length ? '<b>' + res.novas.length + '</b> conciliação(ões) novas com o que entrou, pelas regras do documento' : 'Nada do que entrou casa pelas regras do documento') +
          '; o resto fica em aberto para conciliar à mão.<br><br><span class="suave">A versão de agora continua guardada: dá para voltar excluindo a nova.</span>' +
          (muito ? '<br><br><span class="falta">⚠ Muita conciliação perde item com esta versão. Confira se é o arquivo certo (mesma conta e mesmo mês).</span>' : ''),
        botao: '🔄 Carregar a versão nova', perigo: muito,
      });
    };
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
      chave: chaveDoPainel(ctx), titulo: 'Período e arquivos desta conciliação', resumo: nomeDoPeriodo(periodoDe, comp), aberto, fixo, lugares: lugaresDoPasso(ctx), metas: arqs.metas,
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
      delete decisoes.atualizacoes; // os itens são outros: as atualizações de antes não valem mais
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
      '<a class="botao pequeno" href="#/empresa/' + encodeURIComponent(E.codigo) + '/' + E.cfg.familia + '/' + U.anoMes(E.comp) + '/' + E.cfg.id + '-relatorio" title="Relatório da conciliação para imprimir, salvar em PDF ou baixar em Excel">📄 Relatório</a>' +
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
      ? 'Conforme o RAZÃO de ' + E.entrada.mesAnterior + ' (saldo da contabilidade): aging ' + textoDC(ini.aging) + ' − ' + ini.qtdTirados + ' título(s) que ficaram em aberto na Parte B (' + textoDC(ini.tirados) + ') + ' + ini.qtdPendentes + ' pendência(s) da Parte A (' + textoDC(ini.pendentesA) + ')'
      : 'Conforme o AGING de ' + E.entrada.mesAnterior + ': o que estava em aberto no financeiro no fim do mês passado';
    return '<div class="cartao corpo cartao-ponte" style="margin-bottom:14px;border-left:4px solid var(--' + (bate ? 'verde' : 'vermelho') + ')">' +
      '<div class="ponte">' +
      pedaco(rotuloInicial, p.anterior, dicaInicial) +
      ' <b>+</b> ' + pedaco('Movimento do razão', p.movimento, E.cfg.aumentos + ' (' + E.cfg.ladoAumento + ', ' + T.moeda(p.notas) + ') menos ' + E.cfg.reducoes + ' (' + E.cfg.ladoReducao + ', ' + T.moeda(p.baixas) + ') do mês') +
      ' <b>=</b> ' + pedaco('Esperado (contabilidade)', p.esperado, 'é o que o balancete tem que mostrar', 'forte') +
      seta + pedaco('Aging ' + E.entrada.mesAtual, p.atual, 'o que está em aberto agora') +
      '</div>' +
      '<div class="linha-flex" style="margin-top:12px;justify-content:space-between">' +
      '<div class="' + (bate ? 'ok' : 'falta') + '" style="font-size:16px;font-weight:600">' + (bate ? '✓ Fecha no centavo' : '● Diferença de R$ ' + htmlDC(p.diferenca) + ' para conciliar <span class="suave pequeno" style="font-weight:400">(contabilidade − financeiro)</span>') + '</div>' +
      // A contagem por fornecedor só aparece se alguma aba por fornecedor estiver à vista.
      (['diferencas', 'fornecedores', 'sem'].some((id) => !abasOcultas().has(id))
        ? '<div class="suave pequeno">' + E.r.resumo.batem + ' batem · ' + E.r.resumo.comDiferenca + ' com diferença · ' + E.r.resumo.semFornecedor + ' linhas sem fornecedor</div>' : '') +
      '</div></div>';
  }

  function pedaco(rotulo, valor, dica, forte) {
    return '<span class="ponte-item" title="' + T.esc(dica) + '"><span class="rotulo">' + T.esc(rotulo) + '</span>' +
      '<b class="num' + (forte ? ' forte' : '') + '">' + htmlDC(valor) + '</b></span>';
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
    { id: 'fornecedores', titulo: 'Por ' + (pessoa()) },
    { id: 'sem', titulo: 'Sem ' + (pessoa()) },
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
    const reg = x.registro ? ' (registro contábil em ' + x.registro + ')' : '';
    if (x.fonte === 'anterior') return 'aging ' + E.entrada.mesAnterior + reg;
    if (x.fonte === 'atual') return 'aging ' + E.entrada.mesAtual + reg;
    if (x.fonte === 'pendente') return 'pendente de ' + U.nomeCompetencia(x.origem) + (x.fonteOriginal ? ' · ' + nomeDaFonte(x.fonteOriginal) : '');
    return nomeDaFonte(x.fonte);
  }
  // Na tabela estreita de cada parte: "aging jun/26", "nota", "baixa", "pend. jul/26".
  function rotuloCurto(x) {
    const curto = (mes) => String(mes).slice(0, 3) + '/' + String(mes).slice(-2);
    // Título com a data do registro contábil (quando o relatório diz): "reg. 03/08".
    const reg = x.registro ? ' · reg. ' + String(x.registro).slice(0, 5) : '';
    if (x.fonte === 'anterior') return 'aging ' + curto(E.entrada.mesAnterior) + reg;
    if (x.fonte === 'atual') return 'aging ' + curto(E.entrada.mesAtual) + reg;
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
    const dinheiro = (c) => textoDC(c);
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
    if (mudaItens) E.decisoes.atualizacoes = []; // os itens são outros: as atualizações de antes não valem mais
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
      corpo: '<p style="line-height:1.55"><b>📄 Conforme o AGING de ' + T.esc(mesAnt) + '</b> (' + textoDC(v.pelaAging.valor) + '): o aging estava certo; a Parte B de ' + T.esc(mesAnt) + ' vira a Parte A de ' + T.esc(mes) + '.</p>' +
        '<p style="line-height:1.55;margin-top:8px"><b>📒 Conforme o RAZÃO de ' + T.esc(mesAnt) + '</b> (' + textoDC(v.peloRazao.valor) + '): vale o saldo da contabilidade; a diferença de ' + T.esc(mesAnt) + ' continua.</p>' +
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
  const CAMPOS_LADO = ['doc', 'forn', 'valor', 'data', 'dc'];
  function termos(texto, separador) { return String(texto || '').split(separador).map((s) => s.trim()).filter(Boolean); }
  function filtroDoLado(lado) {
    const docTexto = termos(filtro(lado + '.doc'), /[,;]/);
    const docs = docTexto.map((d) => M.normalizarDocumento(d)).filter(Boolean);
    const forns = termos(filtro(lado + '.forn'), /[,;]/);
    const valores = termos(filtro(lado + '.valor'), /;/).map(filtroValor).filter(Boolean);
    const datas = termos(filtro(lado + '.data'), /;/).map(filtroData).filter(Boolean);
    const soDC = filtro(lado + '.dc');
    return (x) => (!soDC || dc(x.valor) === soDC) && (!docTexto.length || docs.some((d) => x.doc.indexOf(d) >= 0)) &&
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
      campo('forn', primeiraMaiuscula(pessoa()), 'Nome do ' + pessoa() + ', ou pedaço do histórico. Mais de um: POSTO CENTRAL, SILVA') +
      campo('valor', 'Valor', 'Valor (1.236,55), parte dele, ou faixa: 100 a 500 — com ou sem sinal. Mais de um: 791,43; 5.105,88') +
      campo('data', 'Data', 'Data (08/07/2026), parte dela (07/2026), ou faixa: 01/07 a 15/07. Mais de uma: 08/07; 22/07') +
      '<select data-filtro="' + lado + '.dc" class="' + (filtro(lado + '.dc') ? 'ativo' : '') + '" title="Só os débitos ou só os créditos">' +
      [['', 'D e C'], ['D', 'Só débito'], ['C', 'Só crédito']].map((o) => '<option value="' + o[0] + '"' + (filtro(lado + '.dc') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
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
    // Conciliações com item que não está mais nos arquivos (o arquivo mudou): continuam, marcadas, até ele decidir.
    E.comFalta = new Set(grupos.filter((g) => M.faltandoNoGrupo(g, it.porId).length).map((g) => g.id));

    const ab = M.emAbertoAB(it, grupos);
    const busca = filtro('busca');
    const ultima = ultimaAtualizacao();
    // '' = em aberto · 'conciliados' · 'valor' (só pelo valor) · 'margem' (com margem) · 'faltando' (com item
    // faltando) · 'atualizacao' (da última atualização de arquivo) · 'todos'
    let mostrar = filtro('mostrar');
    if ((mostrar === 'atualizacao' && !ultima) || (mostrar === 'faltando' && !E.comFalta.size)) mostrar = '';
    const daAtualizacao = idsDaAtualizacao(ultima);
    const b = buscaAB(busca);
    const grupoDe = (x) => E.idDoItem.get(x.id);
    const naLista = (x) => (mostrar === 'todos' ? true
      : mostrar === 'conciliados' ? !!grupoDe(x)
      : mostrar === 'valor' ? M.ehPorValor(grupoDe(x))
      : mostrar === 'margem' ? M.ehComMargem(grupoDe(x))
      : mostrar === 'faltando' ? !!grupoDe(x) && E.comFalta.has(grupoDe(x).id)
      : mostrar === 'atualizacao' ? daAtualizacao.itens.has(x.id) || (!!grupoDe(x) && daAtualizacao.grupos.has(grupoDe(x).id))
      : !grupoDe(x)) && b.item(x);
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

    const opcoes = [['', 'Em aberto'], ['conciliados', 'Conciliados'], ['valor', 'Conciliados só pelo valor'], ['margem', 'Conciliados com margem']]
      .concat(E.comFalta.size ? [['faltando', '⚠ Conciliados com item faltando (' + E.comFalta.size + ')']] : [])
      .concat(ultima ? [['atualizacao', 'Da última atualização de arquivo']] : [])
      .concat([['todos', 'Todos']]);
    E.el.querySelector('#filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Busca nos dois lados: documento, ' + pessoa() + ', valor, data ou #ID" title="Vale para a Parte A, a Parte B e a lista de conciliações. Cada parte tem também os seus filtros." value="' + T.esc(busca) + '">' +
      '<select class="filtro" data-filtro="mostrar">' + opcoes.map((o) => '<option value="' + o[0] + '"' + (mostrar === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="linha-flex" style="gap:6px"><input type="checkbox" id="ab-anterior"' + (E.incluirAnterior ? ' checked' : '') + '> <span class="pequeno">Parte A = aging ' + T.esc(E.entrada.mesAnterior) + (E.itens.continuacao ? ' + pendências' : '') + ' + razão</span></label>' +
      '<span class="suave pequeno">(desmarque para <b>só o razão</b>)</span>';

    const ROTULOS = { todos: 'item(ns)', conciliados: 'conciliado(s)', valor: 'conciliado(s) só pelo valor', margem: 'conciliado(s) com margem',
      faltando: 'nas conciliações com item faltando', atualizacao: 'da última atualização de arquivo' };
    const rot = ROTULOS[mostrar] || 'em aberto';
    E.daAtualizacao = ultima && !ultima.visto ? daAtualizacao : null; // selos "novo", "trocado" e "mudou" nas partes
    alvo.innerHTML = cartaoAtualizacao(ultima) + cartaoFaltando(grupos) + cartaoInicio() + resumoAB(ab, grupos) +
      '<div class="grade-ab">' +
      colunaAB('A', 'Parte A · contabilidade', E.incluirAnterior ? 'aging ' + E.entrada.mesAnterior + ' + razão de ' + (E.entrada.nomeRazao || E.entrada.mesAtual) : 'só o razão de ' + (E.entrada.nomeRazao || E.entrada.mesAtual), filtradosA, fixosA, rot) +
      colunaAB('B', 'Parte B · financeiro', 'aging ' + E.entrada.mesAtual, filtradosB, fixosB, rot) +
      '</div>' +
      '<div id="barra-ab"></div>' +
      '<div id="lista-ab"></div>';
    T.tabelaPaginada(alvo.querySelector('#colA'), tabelaItens('A', listaA));
    T.tabelaPaginada(alvo.querySelector('#colB'), tabelaItens('B', listaB));
    atualizarBarraAB();
    desenharListaAB(alvo.querySelector('#lista-ab'), b, MODOS_LISTA[mostrar] ? mostrar : '', daAtualizacao);
  }

  // ------------------------------------------------------------------
  // Cartões da ATUALIZAÇÃO DE ARQUIVO (conferirAtualizacao) e das conciliações com item faltando.
  // ------------------------------------------------------------------
  function ultimaAtualizacao() { const xs = (E.decisoes && E.decisoes.atualizacoes) || []; return xs.length ? xs[xs.length - 1] : null; }

  // Os itens (que entraram ou foram trocados) e as conciliações (novas, trocadas, com item faltando,
  // completas de novo) da atualização.
  function idsDaAtualizacao(a) {
    const r = { itens: new Set(), grupos: new Set(), novos: new Set(), trocados: new Set(), mudados: new Set() };
    if (!a) return r;
    (a.entraram || []).forEach((x) => { r.itens.add(x.id); r.novos.add(x.id); });
    (a.mudaram || []).forEach((p) => r.mudados.add(p.depois.id));
    (a.trocadas || []).forEach((t) => { r.grupos.add(t.grupo.id); (t.trocas || []).forEach((x) => { r.itens.add(x.depois.id); r.trocados.add(x.depois.id); }); });
    (a.faltando || []).forEach((f) => r.grupos.add(f.grupo.id));
    (a.completas || []).concat(a.novas || []).forEach((id) => r.grupos.add(id));
    return r;
  }

  function nomesDaAtualizacao(a) { return (a.nomes && a.nomes.length) ? a.nomes.join(' e ') : 'arquivo'; }
  function botoesDeIds(ids, max) {
    const n = max || 15;
    return ids.slice(0, n).map((id) => '<button type="button" class="lapis" data-ver-id="' + id + '" title="Ver a conciliação #' + id + '"><b>#' + id + '</b></button>').join(' ') + (ids.length > n ? ' …' : '');
  }

  function cartaoAtualizacao(a) {
    if (!a) return '';
    const quando = U.dataHoraLocal(a.quando) + (a.quem ? ' · ' + a.quem : '');
    const n = contasDaAtualizacao(a);
    if (a.visto) {
      const pl = (q, um, varios) => q + ' ' + (q === 1 ? um : varios);
      return '<div class="linha-inicio">🔄 Última atualização de arquivo (' + T.esc(nomesDaAtualizacao(a)) + ', ' + T.esc(quando) + '): ' +
        pl(a.continuam, 'conciliação continuou', 'conciliações continuaram') + (n.trocadas ? ' · ' + pl(n.trocadas, 'com item trocado', 'com item trocado') : '') +
        (n.faltandoNovas ? ' · ' + pl(n.faltandoNovas, 'ficou com item faltando', 'ficaram com item faltando') : '') + (n.novas ? ' · ' + pl(n.novas, 'nova', 'novas') : '') +
        '. <button type="button" class="botao pequeno leve" data-acao="ver-atualizacao">ver o que mudou</button></div>';
    }
    const novasFaltando = (a.faltando || []).filter((f) => !f.jaFaltava);
    const manuais = novasFaltando.filter((f) => f.grupo.regra === 'manual').length;
    const abertosAgora = (a.entraram || []).filter((x) => E.itens.porId.has(x.id) && !E.idDoItem.has(x.id)).length;
    const arquivos = (a.arquivos || []).map((f) => '<li class="suave">' + T.esc(primeiraMaiuscula(nomeDoLugarAtualizado(f.lugar, E.entrada, E.cfg))) + ': ' +
      (f.antes && f.antes.arquivo ? '<b>' + T.esc(f.antes.arquivo) + '</b>' + (f.antes.qtd !== undefined ? ' (' + f.antes.qtd + ')' : '') : 'a versão de antes') + ' → ' +
      (f.depois ? '<b>' + T.esc(f.depois.arquivo) + '</b>' + (f.depois.qtd !== undefined ? ' (' + f.depois.qtd + ')' : '') : '?') +
      (f.antes && f.antes.excluido ? ' <span class="pequeno">(a de antes tinha sido excluída; comparada pela cópia da pasta _apagados)</span>' : '') + '</li>').join('');
    return '<div class="cartao corpo cartao-atualizacao">' +
      '<h3>🔄 ' + T.esc(primeiraMaiuscula(nomesDaAtualizacao(a))) + ' atualizado <span class="suave pequeno" style="font-weight:400">· ' + T.esc(quando) + '</span></h3>' +
      '<ul class="lista-atualizacao">' + arquivos +
      '<li>✓ <b>' + a.continuam.toLocaleString('pt-BR') + '</b> conciliação(ões) continuam como estavam — nenhuma foi desfeita.</li>' +
      (a.semComparacao
        ? '<li class="suave">Não deu para comparar com o arquivo de antes (ele não está mais na pasta de dados): só as conciliações foram conferidas.</li>'
        : '<li>➕ Entraram <b>' + n.entraram + '</b> · ➖ saíram <b>' + n.sairam + '</b> · ✎ mudaram <b>' + n.mudaram + '</b> item(ns) nas Partes A e B' +
          (a.semArquivoAntigo ? ' <span class="suave pequeno">(o arquivo de antes não está mais guardado: comparado pelo que estava em aberto e conciliado)</span>' : '') + '.</li>') +
      (n.trocadas ? '<li>✎ <b>' + n.trocadas + '</b> conciliação(ões) continuam com o item corrigido no lugar do antigo (mesmo valor e documento): ' + botoesDeIds(a.trocadas.map((t) => t.grupo.id)) + '.</li>' : '') +
      (novasFaltando.length ? '<li class="falta">⚠ <b>' + novasFaltando.length + '</b> conciliação(ões) ficaram com item faltando' + (manuais ? ' (' + manuais + ' feita(s) à mão)' : '') + ': ' +
        botoesDeIds(novasFaltando.map((f) => f.grupo.id)) + ' — <b>não foram desfeitas</b>: confira e decida (aviso logo abaixo).</li>' : '') +
      (n.completas ? '<li>↩ <b>' + n.completas + '</b> conciliação(ões) com item faltando ficaram completas de novo (o item voltou): ' + botoesDeIds(a.completas) + '.</li>' : '') +
      '<li>' + (n.novas ? '⚡ <b>' + n.novas + '</b> conciliação(ões) novas com o que entrou, pelas regras do documento: ' + botoesDeIds(a.novas) + '.'
        : '⚡ Nada do que entrou casou pelas regras do documento.') + '</li>' +
      (a.semComparacao ? '' : '<li>' + (abertosAgora ? '● <b>' + abertosAgora + '</b> item(ns) que entraram estão em aberto — para conciliar à mão (ou com os outros botões).' : '✓ Nada do que entrou ficou em aberto.') + '</li>') +
      '</ul>' +
      '<div class="linha-flex" style="margin-top:8px">' +
      '<button type="button" class="botao pequeno primario" data-acao="ver-atualizacao">📋 Ver o que mudou</button>' +
      '<button type="button" class="botao pequeno" data-acao="mostrar-atualizacao" title="Mostra nas partes e na lista só o que mexeu nesta atualização">Mostrar na lista</button>' +
      '<button type="button" class="botao pequeno leve" data-acao="entendi-atualizacao" title="Guarda o aviso (continua em Ver o que mudou)">✓ Entendi</button>' +
      '</div></div>';
  }

  // Aviso fixo enquanto houver conciliação com item faltando (Dony, 16/09/2026: "quero que o sistema identifique").
  function cartaoFaltando(grupos) {
    if (!E.comFalta.size) return '';
    const lista = grupos.filter((g) => E.comFalta.has(g.id));
    const manuais = lista.filter((g) => g.regra === 'manual').length;
    return '<div class="aviso vermelho" style="margin-bottom:12px"><span class="icone-aviso">⚠</span><div>' +
      '<b>' + lista.length + '</b> conciliação(ões) com item que não está mais nos arquivos' + (manuais ? ' (<b>' + manuais + '</b> feita(s) à mão)' : '') + ': ' + botoesDeIds(lista.map((g) => g.id), 20) + '.<br>' +
      'Elas <b>continuam conciliadas</b> até você decidir: se o item saiu de verdade, clique em <b>Desfazer</b> (o resto dela volta para em aberto); ' +
      'se foi engano no arquivo, carregue a versão certa — ela fica completa de novo sozinha. ' +
      '<span class="linha-flex" style="margin-top:6px"><button type="button" class="botao pequeno" data-acao="mostrar-faltando">Mostrar essas</button>' +
      '<button type="button" class="botao pequeno perigo" data-acao="desfazer-faltando">↺ ' + (lista.length === 1 ? 'Desfazer esta' : 'Desfazer as ' + lista.length) + '</button></span></div></div>';
  }

  // Janela com o detalhe da última atualização.
  async function verAtualizacao() {
    const a = ultimaAtualizacao();
    if (!a) return;
    const tds = (x) => '<td><b>' + T.esc(x.lado || '') + '</b></td><td class="num">' + T.esc(x.data || '—') + '</td><td class="num">' + T.nome(x.doc) + '</td>' +
      '<td class="pequeno suave">' + T.esc(x.fonte ? rotuloFonte(x) : '') + '</td><td class="historico">' + T.esc(x.nome || '') + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico) + '</span>' : '') + '</td>' +
      (x.valor !== undefined ? tdDC(x.valor) : '<td class="suave pequeno">sem detalhe</td>');
    const cab = '<th>Lado</th><th>Data</th><th>Documento</th><th>Origem</th><th class="historico">Fornecedor · histórico</th><th class="num">Valor · D/C</th>';
    const verId = (id) => '<button type="button" class="lapis" data-fechar-e-ver="' + id + '"><b>#' + id + '</b></button>';
    const situacao = (id) => { const g = E.idDoItem.get(id); return g ? verId(g.id) : (E.itens.porId.has(id) ? '<span class="falta">em aberto</span>' : '<span class="suave">saiu depois</span>'); };
    const LIM = 300;
    const tabela = (titulo, xs, comSituacao, explica) => '<h3 class="titulo-comparacao">' + titulo + ' <small>(' + xs.length + ')</small></h3>' +
      (explica ? '<p class="suave pequeno" style="margin:0 0 6px">' + explica + '</p>' : '') +
      (xs.length ? '<div class="tabela-caixa"><table class="tabela"><thead><tr>' + cab + (comSituacao ? '<th>Agora</th>' : '') + '</tr></thead><tbody>' +
        xs.slice(0, LIM).map((x) => '<tr>' + tds(x) + (comSituacao ? '<td>' + situacao(x.id) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' +
        (xs.length > LIM ? '<p class="suave pequeno">… e mais ' + (xs.length - LIM) + '.</p>' : '') : '<p class="suave pequeno">Nenhum.</p>');
    const mudA = new Set((a.mudaram || []).map((p) => p.antes.id)), mudD = new Set((a.mudaram || []).map((p) => p.depois.id));
    const entraram = (a.entraram || []).filter((x) => !mudD.has(x.id)), sairam = (a.sairam || []).filter((x) => !mudA.has(x.id));
    const cabGrupo = '<th>ID</th><th>Como</th><th>Documento</th><th>' + primeiraMaiuscula(pessoa()) + '</th><th class="num">Parte A</th><th class="num">Parte B</th>';
    const tdsGrupo = (g) => '<td class="num">' + verId(g.id) + '</td><td><span class="selo ' + seloDaRegra(g) + '">' + T.esc(COMO_AB[g.regra] || g.regra) + '</span></td>' +
      '<td class="num">' + T.nome(g.documento) + '</td><td class="nome">' + T.nome(g.nome) + (g.obs ? '<br><span class="suave pequeno">✎ ' + T.esc(g.obs) + '</span>' : '') + '</td>' +
      tdDC(g.valorA) + tdDC(g.valorB);
    const agoraDoGrupo = (id) => {
      const g = E.decisoes.conciliacoesAB.find((x) => x.id === id);
      if (!g) return '<span class="suave">desfeita depois</span>';
      return E.comFalta.has(id) ? '<span class="falta">ainda com item faltando</span>' : '<span class="ok">completa</span>';
    };
    const faltando = (a.faltando || []).length
      ? '<div class="tabela-caixa"><table class="tabela"><thead><tr>' + cabGrupo + '<th class="historico">O item que saiu</th><th>Agora</th></tr></thead><tbody>' +
        a.faltando.map((f) => '<tr>' + tdsGrupo(f.grupo) + '<td class="historico pequeno">' + (f.sairam || []).map((s) => {
          const p = (a.mudaram || []).find((q) => q.antes.id === s.id);
          return (s.valor !== undefined ? '<b>' + T.esc(s.lado || '') + '</b> · ' + T.esc(s.data || '') + ' · doc ' + T.esc(s.doc || '—') + ' · ' + T.esc((s.historico || s.nome || '').slice(0, 90)) + ' · ' + htmlDC(s.valor)
            : '<span class="suave">item ' + T.esc(s.id) + ' (sem detalhe)</span>') +
            (p ? ' <span class="selo suspeita">mudou: ' + T.esc((p.campos || []).join(', ')) + '</span>' : ' <span class="selo mao">saiu</span>');
        }).join('<br>') + (f.jaFaltava ? '<br><span class="suave">(já estava faltando antes desta atualização)</span>' : '') + '</td><td class="pequeno">' + agoraDoGrupo(f.grupo.id) + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="suave pequeno">Nenhuma.</p>';
    const trocadas = (a.trocadas || []).length
      ? '<div class="tabela-caixa"><table class="tabela"><thead><tr>' + cabGrupo + '<th class="historico">Antes → agora</th></tr></thead><tbody>' +
        a.trocadas.map((t) => '<tr>' + tdsGrupo(t.grupo) + '<td class="historico pequeno">' + (t.trocas || []).map((x) =>
          'antes: ' + T.esc(x.antes.data || '') + ' · ' + T.esc((x.antes.historico || x.antes.nome || '').slice(0, 80)) + '<br><b>agora</b>: ' + T.esc(x.depois.data || '') + ' · ' +
          T.esc((x.depois.historico || x.depois.nome || '').slice(0, 80)) + ' <span class="selo suspeita">mudou: ' + T.esc((x.campos || []).join(', ') || '—') + '</span>').join('<br>') + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '<p class="suave pequeno">Nenhuma.</p>';
    const mudaram = (a.mudaram || []).length
      ? '<div class="tabela-caixa"><table class="tabela"><thead><tr><th></th>' + cab + '<th>O que mudou</th></tr></thead><tbody>' +
        a.mudaram.slice(0, LIM).map((p) => '<tr class="suave"><td class="pequeno">antes</td>' + tds(p.antes) + '<td rowspan="2"><b>' + T.esc((p.campos || []).join(', ') || '—') + '</b></td></tr>' +
          '<tr><td class="pequeno"><b>agora</b></td>' + tds(p.depois) + '</tr>').join('') + '</tbody></table></div>'
      : '<p class="suave pequeno">Nenhum.</p>';
    const n = contasDaAtualizacao(a);
    const compactada = a.listasCompactadas ? '<div class="aviso ambar pequeno" style="margin-bottom:8px">As listas do que entrou, saiu e mudou desta atualização não ficaram guardadas (só as das 3 últimas).</div>' : '';
    const r = await T.janela({
      titulo: '🔄 ' + primeiraMaiuscula(nomesDaAtualizacao(a)) + ' atualizado · ' + U.dataHoraLocal(a.quando), larga: true,
      corpo: compactada + '<p class="resumo-versao">✓ <b>' + a.continuam + '</b> continuam · ✎ <b>' + n.trocadas + '</b> com item trocado · ⚠ <b>' + n.faltando + '</b> com item faltando · ↩ <b>' + n.completas +
        '</b> completas de novo · ⚡ <b>' + n.novas + '</b> nova(s)' + (a.novas && a.novas.length ? ' (' + a.novas.slice(0, 8).map((id) => '#' + id).join(', ') + (a.novas.length > 8 ? '…' : '') + ')' : '') + '</p>' +
        '<h3 class="titulo-comparacao">⚠ Conciliações com item faltando <small>(' + n.faltando + ')</small></h3>' +
        '<p class="suave pequeno" style="margin:0 0 6px">Um item delas não está no arquivo novo. Elas <b>não foram desfeitas</b>: continuam conciliadas até você decidir (Desfazer, ou carregar a versão certa do arquivo).</p>' + faltando +
        '<h3 class="titulo-comparacao">✎ Conciliações com item trocado <small>(' + n.trocadas + ')</small></h3>' +
        '<p class="suave pequeno" style="margin:0 0 6px">O item delas foi corrigido no arquivo novo (mesmo lado, valor e documento; mudou o texto, a data ou o fornecedor): elas continuam, com o item novo.</p>' + trocadas +
        (n.completas ? '<p class="pequeno" style="margin-top:10px">↩ Completas de novo (o item voltou): ' + a.completas.map(verId).join(' ') + '</p>' : '') +
        tabela('➕ Entraram', entraram, true, 'Itens que não estavam antes. "Agora" diz se já estão conciliados.') +
        tabela('➖ Saíram', sairam, false, 'Itens que estavam antes e não estão mais (os que estavam conciliados aparecem também lá em cima).') +
        '<h3 class="titulo-comparacao">✎ Mudaram <small>(' + (a.mudaram || []).length + ')</small></h3>' + mudaram,
      aoAbrir: (j, fechar) => {
        j.addEventListener('click', (ev) => {
          const bt = ev.target.closest('[data-fechar-e-ver]');
          if (bt) fechar(Number(bt.getAttribute('data-fechar-e-ver')));
        });
      },
    });
    if (typeof r === 'number') verConciliacao(r);
  }

  function verConciliacao(id) {
    E.filtros['ab.busca'] = '#' + id;
    E.filtros['ab.mostrar'] = 'todos';
    E.abertosAB.add(id);
    desenharAba();
  }

  function mostrarNaLista(modo) {
    E.filtros['ab.busca'] = '';
    E.filtros['ab.mostrar'] = modo;
    desenharAba();
  }

  async function entendiAtualizacao() {
    const a = ultimaAtualizacao();
    if (!a) return;
    a.visto = { quem: app().usuario.nome, quando: U.agoraISO() };
    if (filtro('mostrar') === 'atualizacao') E.filtros['ab.mostrar'] = '';
    redesenhaMantendo();
    gravar(null);
  }

  function seloDaRegra(g) { return g.regra === 'manual' ? 'mao' : M.ehPorValor(g) ? 'valor' : M.ehComMargem(g) ? 'margem' : 'opcional'; }

  function resumoAB(ab, grupos) {
    const conta = (tipo) => grupos.filter((g) => g.tipo === tipo).length;
    const aMao = grupos.filter((g) => g.regra === 'manual').length;
    const porValor = grupos.filter(M.ehPorValor).length;
    const comMargem = grupos.filter(M.ehComMargem).length;
    const auto = grupos.length - aMao - porValor - comMargem;
    const dif = ab.valorA - ab.valorB;
    // Conciliações que tiram valores diferentes dos dois lados: à mão "assim mesmo", com margem, ou com item
    // faltando (o item que saiu não está mais nas partes). Com isso, em aberto A − B + estas = diferença da ponte.
    const naoBatem = grupos.reduce((s, g) => s + (g.a || []).reduce((t, id) => t + ((E.itens.porId.get(id) || {}).valor || 0), 0)
      - (g.b || []).reduce((t, id) => t + ((E.itens.porId.get(id) || {}).valor || 0), 0), 0);
    const conferir = grupos.filter((g) => g.aviso === 'baixa-antes-da-nota');
    const n = (q) => q.toLocaleString('pt-BR');
    // As três ações grandes, do mesmo tamanho, com a cor do selo de cada uma (Dony, 16/09/2026: "acabamento
    // mais bonitinho — o Conciliar ficou caprichado e os demais muito abaixo").
    const acao = (acaoId, classe, icone, titulo, sub, dica) => '<button type="button" class="acao ' + classe + '" data-acao="' + acaoId + '" title="' + T.esc(dica) + '">' +
      '<span class="acao-icone" aria-hidden="true">' + icone + '</span><span class="acao-texto"><b>' + titulo + '</b><small>' + sub + '</small></span></button>';
    const lote = (acaoId, cor, rotulo, qtd, dica) => '<button type="button" class="chip-desfazer" data-acao="' + acaoId + '" title="' + T.esc(dica) + '">' +
      '<span class="cor ' + cor + '" aria-hidden="true"></span>' + rotulo + ' <span class="qtd">' + n(qtd) + '</span></button>';
    const lotes = [
      auto ? lote('desfazer-automaticas', 'documento', 'Automáticas', auto, 'Desfaz as conciliações feitas pelo ⚡ Conciliar (pelo documento)') : '',
      porValor ? lote('desfazer-valor', 'valor', 'Só pelo valor', porValor, 'Desfaz as conciliações feitas pelo ≈ Conciliar só pelo valor') : '',
      comMargem ? lote('desfazer-margem', 'margem', 'Com margem', comMargem, 'Desfaz as conciliações feitas pelo ± Conciliar com margem') : '',
      aMao ? lote('desfazer-manuais', 'manual', 'À mão', aMao, 'Desfaz as conciliações feitas à mão') : '',
      E.comFalta.size ? lote('desfazer-faltando', 'faltando', 'Com item faltando', E.comFalta.size, 'Desfaz as conciliações com item que não está mais nos arquivos') : '',
    ].join('');
    const pilula = (cor, texto) => '<span class="pilula ' + cor + '">' + texto + '</span>';
    return '<div class="cartao corpo" style="margin-bottom:12px">' +
      '<div class="ponte">' +
      pedaco('Em aberto · Parte A', ab.valorA, ab.abertosA.length + ' item(ns) em aberto na contabilidade') +
      ' <b>−</b> ' + pedaco('Em aberto · Parte B', ab.valorB, ab.abertosB.length + ' item(ns) em aberto no financeiro') +
      ' <b>=</b> ' + pedaco('Diferença a investigar', dif, 'o que sobra em aberto', 'forte') +
      '</div>' +
      '<div class="acoes-ab">' +
      '<div class="acoes-conciliar">' +
      acao('conciliar-tudo', 'documento', '⚡', 'Conciliar', 'pelo documento e fornecedor',
        'Acha tudo o que casa pelo documento — primeiro com o mesmo fornecedor, depois com o mesmo nome, depois só pelo documento — e dá um ID para cada conciliação (1, 2, 3…)') +
      // Dony, 16/09/2026: só roda quando ele aperta (valores quebrados, sem documento e sem fornecedor).
      acao('conciliar-valor', 'valor', '≈', 'Conciliar só pelo valor', 'sem documento e sem fornecedor',
        'Depois do ⚡ pelo documento, casa o que sobrou por VALOR igual, sem olhar documento e fornecedor. Só valor quebrado: inteiro terminado em zero (10, 100, 200…) fica de fora. Só roda quando você aperta.') +
      // Dony, 16/09/2026: "fechar documento + fornecedor com margem de diferença, até um real; só quando eu apertar".
      acao('conciliar-margem', 'margem', '±', 'Conciliar com margem', 'doc + fornecedor · até ' + T.moeda(M.MARGEM_AB),
        'Depois do ⚡ pelo documento, casa o que sobrou pelo MESMO documento e MESMO fornecedor aceitando diferença de até ' + T.moeda(M.MARGEM_AB) + ' (centavos de arredondamento). Só roda quando você aperta.') +
      '</div>' +
      (lotes ? '<div class="desfazer-lote"><span class="rotulo-lote">↺ Desfazer em lote</span>' + lotes + '</div>' : '') +
      '</div>' +
      (grupos.length
        ? '<div class="contagem-ab pequeno"><b>' + n(grupos.length) + '</b>&nbsp;conciliação(ões) com ID:' +
          pilula('cinza', n(conta('AxA')) + ' A×A') + pilula('azul', n(conta('AxB')) + ' A×B') + (conta('BxB') ? pilula('cinza', n(conta('BxB')) + ' B×B') : '') +
          (aMao ? pilula('cinza', n(aMao) + ' à mão') : '') + (porValor ? '<span class="selo valor">' + n(porValor) + ' só pelo valor</span>' : '') +
          (comMargem ? '<span class="selo margem">' + n(comMargem) + ' com margem</span>' : '') +
          (E.comFalta.size ? '<span class="selo perigo">⚠ ' + n(E.comFalta.size) + ' com item faltando</span>' : '') +
          '<span class="suave">· em aberto: <b>' + n(ab.abertosA.length) + '</b> na A e <b>' + n(ab.abertosB.length) + '</b> na B</span></div>'
        : '<p class="suave pequeno" style="margin:12px 0 0">Nada conciliado ainda. Comece pelo <b>⚡ Conciliar</b>; o que sobrar dá para casar só pelo valor, com margem ou à mão (marque os itens nas partes).</p>') +
      (Math.abs(naoBatem) >= 1 || conferir.length ? '<p class="pequeno" style="margin:8px 0 0">' +
        (Math.abs(naoBatem) >= 1 ? '<span class="falta">Conciliações que não batem (à mão com diferença, com margem ou com item faltando): ' + textoDC(naoBatem) + '.</span>' : '') +
        (conferir.length ? (Math.abs(naoBatem) >= 1 ? '<br>' : '') + '<span style="color:var(--ambar)">⚠ Para conferir — ' + E.cfg.avisoAntes + ':</span> ' + botoesDeIds(conferir.map((g) => g.id)) : '') +
        '</p>' : '') +
      '</div>';
  }

  function colunaAB(lado, titulo, sub, itens, fixos, rot) {
    const total = itens.reduce((s, x) => s + x.valor, 0);
    const filtrado = CAMPOS_LADO.some((n) => filtro(lado + '.' + n));
    return '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px"><h3 style="flex:1">' + T.esc(titulo) + '</h3>' +
      '<span class="pilula ' + (lado === 'A' ? 'azul' : 'ambar') + '" title="Soma da lista (sem os marcados de fora do filtro)">' + textoDC(total) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + T.esc(sub) + ' · ' + itens.length.toLocaleString('pt-BR') + ' ' + rot + (filtrado ? ' <b>(filtrado)</b>' : '') +
      (fixos.length ? ' · <b>+' + fixos.length + ' marcado(s)</b> de fora do filtro, no topo' : '') + '</p>' +
      filtrosDoLadoHtml(lado) +
      '<div id="col' + lado + '"></div></div>';
  }

  function tabelaItens(lado, itens) {
    const sel = lado === 'A' ? E.selA : E.selB;
    return {
      alta: true, porPagina: 200,
      ordem: { id: 'ab-itens-' + lado, fixo: (x) => !!(E.fixos && E.fixos.has(x.id)), colunas: [null, TXT((x) => x.doc), TXT((x) => (x.chave === SEM ? '' : x.nome)),
        DATA((x) => x.data), VALOR((x) => x.valor), NUM((x) => { const g = E.idDoItem.get(x.id); return g ? g.id : null; })] },
      cabecalho: '<th class="caixa"><input type="checkbox" data-marca-todos="' + lado + '" title="Marcar todos os em aberto desta lista (com os filtros de agora)"></th><th>Documento</th><th>' + primeiraMaiuscula(pessoa()) + '</th><th>Data · origem</th><th class="num" title="Sem sinal: D = débito · C = crédito">Valor · D/C</th><th>ID</th>',
      linhas: itens, vazio: 'Nada nesta lista.',
      linha: (x) => {
        const g = E.idDoItem.get(x.id);
        const marcado = sel.has(x.id);
        const fixo = E.fixos && E.fixos.has(x.id);
        // Da última atualização de arquivo (enquanto não clicou em "Entendi"): entrou, foi trocado ou mudou.
        const at = E.daAtualizacao;
        const seloAt = !at ? '' : at.trocados.has(x.id) ? '<span class="selo suspeita" title="Corrigido no arquivo novo: entrou no lugar do antigo, na mesma conciliação">trocado</span> '
          : at.mudados.has(x.id) ? '<span class="selo suspeita" title="Mudou na última atualização de arquivo">mudou</span> '
          : at.novos.has(x.id) ? '<span class="selo novo" title="Entrou na última atualização de arquivo">novo</span> ' : '';
        const seloG = !g ? null : E.comFalta.has(g.id) ? ['perigo', '⚠ falta item'] : M.ehPorValor(g) ? ['valor', 'só valor'] : M.ehComMargem(g) ? ['margem', '± margem'] : ['opcional', TIPO_AB[g.tipo]];
        return '<tr class="' + (marcado ? 'destaque' : '') + (fixo ? ' fixo' : '') + '"><td class="caixa">' + (g ? '' : '<input type="checkbox" data-item="' + lado + '" data-id="' + T.esc(x.id) + '"' + (marcado ? ' checked' : '') + '>') + '</td>' +
          '<td class="num"><b>' + T.nome(x.doc) + '</b></td>' +
          '<td class="nome">' + (fixo ? '<span class="selo suspeita" title="Marcado antes, com outro filtro">marcado</span> ' : '') + seloAt +
          (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 70)) + '</span>' : '') + '</td>' +
          '<td class="num" title="' + T.esc(rotuloFonte(x)) + '">' + T.esc(x.data || '—') + '<br><span class="pequeno suave">' + T.esc(rotuloCurto(x)) + '</span></td>' +
          tdDC(x.valor) + '' +
          '<td style="white-space:nowrap">' + (g ? '<button type="button" class="lapis" data-ver-id="' + g.id + '" title="Ver a conciliação #' + g.id + ' (' + T.esc(M.REGRAS_AB[g.regra] || '') + ')"><b>#' + g.id + '</b></button><br><span class="selo ' + seloG[0] + '">' + seloG[1] + '</span>' : '') + '</td></tr>';
      },
    };
  }

  // Colunas que ordenam ao clicar no título (T.tabelaPaginada, op.ordem).
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });
  // Linha do razão: aumento e redução ordenam pelo valor do lançamento (um débito de 200 fica junto de um crédito de 200).
  const valorDaLinha = (lc) => (lc.debito || 0) - (lc.credito || 0);

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
      '<span>Parte A: <b class="num">' + textoDC(sa) + '</b> (' + E.selA.size + ')</span>' +
      '<span>Parte B: <b class="num">' + textoDC(sb) + '</b> (' + E.selB.size + ')</span>' +
      '<span class="' + (bate ? 'ok' : 'falta') + '">' + (bate ? '✓ bate' : 'diferença ' + textoDC(dif)) + '</span>' +
      '<span class="explica">vira o ID #' + M.proximoIdAB(E.decisoes.conciliacoesAB) + ' · ' + TIPO_AB[M.tipoAB(E.selA.size, E.selB.size)] +
      (fora ? ' · ' + fora + ' marcado(s) fora do filtro' : '') + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-ab">✓ Conciliar manualmente</button>' +
      '<button type="button" class="botao" data-acao="limpar-ab">Limpar</button></div>';
  }

  // modo: '' (todas) · 'valor' (só pelo valor) · 'margem' (com margem) · 'faltando' (com item faltando) ·
  // 'atualizacao' (as que mexeram na última atualização de arquivo)
  const MODOS_LISTA = {
    valor: { titulo: 'Conciliações só pelo valor', de: M.ehPorValor,
      aviso: '<div class="aviso ambar" style="margin:0 0 10px"><span class="icone-aviso">≈</span><div>Casadas <b>só pelo valor</b> (valor quebrado igual), sem olhar documento e fornecedor. Confira cada uma: abra no ▸ e, se não for, clique em <b>Desfazer</b>.</div></div>' },
    margem: { titulo: 'Conciliações com margem', de: M.ehComMargem,
      aviso: '<div class="aviso ambar" style="margin:0 0 10px"><span class="icone-aviso">±</span><div>Casadas pelo <b>mesmo documento e fornecedor</b> com diferença de até ' + T.moeda(M.MARGEM_AB) + ' entre as partes. A diferença de cada uma aparece na coluna Itens. Se não for, clique em <b>Desfazer</b>.</div></div>' },
    faltando: { titulo: 'Conciliações com item faltando', de: (g) => E.comFalta.has(g.id),
      aviso: '<div class="aviso vermelho" style="margin:0 0 10px"><span class="icone-aviso">⚠</span><div>Um item destas conciliações <b>não está mais nos arquivos</b>. Abra no ▸ para ver qual. Se ele saiu de verdade, clique em <b>Desfazer</b>; se foi engano no arquivo, carregue a versão certa.</div></div>' },
    atualizacao: { titulo: 'Conciliações da última atualização de arquivo', de: null,
      aviso: '<div class="aviso info" style="margin:0 0 10px"><span class="icone-aviso">🔄</span><div>As conciliações <b>novas</b> (o ⚡ com o que entrou), as <b>trocadas</b> (item corrigido) e as que ficaram <b>com item faltando</b> na última atualização de arquivo. O detalhe está em <b>Ver o que mudou</b>, no cartão lá em cima.</div></div>' },
  };
  function desenharListaAB(el, b, modo, daAtualizacao) {
    const grupos = E.decisoes.conciliacoesAB;
    if (!grupos.length) { el.innerHTML = ''; return; }
    const m = MODOS_LISTA[modo] || null;
    const doModo = !m ? () => true : modo === 'atualizacao' ? (g) => daAtualizacao.grupos.has(g.id) : m.de;
    const lista = grupos.filter((g) => b.grupo(g) && doModo(g)).sort((x, y) => x.id - y.id);
    el.innerHTML = '<h3 style="margin:18px 0 8px">' + (m ? m.titulo : 'Conciliações com ID') + ' (' + lista.length.toLocaleString('pt-BR') + (lista.length !== grupos.length ? ' de ' + grupos.length.toLocaleString('pt-BR') : '') + ')</h3>' +
      (m ? m.aviso : '') +
      '<div id="tab-ab"></div>';
    T.tabelaPaginada(el.querySelector('#tab-ab'), {
      alta: false, porPagina: 100,
      ordem: { id: 'ab-lista', colunas: [null, NUM((g) => g.id), TXT((g) => TIPO_AB[g.tipo]), TXT((g) => COMO_AB[g.regra] || g.regra), TXT((g) => g.documento), TXT((g) => g.nome),
        DATA(dataDoGrupo), VALOR((g) => g.valorA), VALOR((g) => g.valorB), NUM((g) => g.a.length + g.b.length), NUM((g) => U.paraMs(g.quando) || null), null] },
      cabecalho: '<th style="width:24px"></th><th>ID</th><th>Tipo</th><th>Como</th><th>Documento</th><th>' + primeiraMaiuscula(pessoa()) + '</th><th title="A data mais antiga dos itens da conciliação">Data</th><th class="num">Parte A</th><th class="num">Parte B</th><th>Itens</th><th>Quem · quando</th><th></th>',
      linhas: lista, vazio: 'Nenhuma conciliação com este filtro.',
      linha: (g) => {
        const aberto = E.abertosAB.has(g.id);
        const faltam = g.a.concat(g.b).filter((id) => !E.itens.porId.has(id)).length;
        const dif = g.valorA - g.valorB;
        return '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir-ab="' + g.id + '" title="Ver os itens">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="num"><b>#' + g.id + '</b></td>' +
          '<td><span class="pilula ' + (g.tipo === 'AxB' ? 'azul' : 'cinza') + '">' + TIPO_AB[g.tipo] + '</span></td>' +
          '<td><span class="selo ' + seloDaRegra(g) + '" title="' + T.esc(M.REGRAS_AB[g.regra] || '') + '">' + T.esc(COMO_AB[g.regra] || g.regra) + '</span>' +
          (g.aviso === 'baixa-antes-da-nota' ? '<br><span class="selo suspeita" title="' + primeiraMaiuscula(E.cfg.avisoAntes) + ' (7.11): confira">' + E.cfg.avisoCurto + '</span>' : '') + '</td>' +
          '<td class="num">' + T.nome(g.documento) + '</td>' +
          '<td class="nome">' + T.nome(g.nome) + (g.obs ? '<br><span class="suave pequeno">✎ ' + T.esc(g.obs) + '</span>' : '') +
          (faltam ? '<br><span class="selo perigo" title="Um item desta conciliação não está mais nos arquivos: abra no ▸ para ver qual">⚠ ' + faltam + ' item(ns) faltando</span>' : '') +
          (g.trocas && g.trocas.length ? '<br><span class="selo suspeita" title="Item corrigido no arquivo novo, trocado dentro da conciliação">✎ item trocado</span>' : '') + '</td>' +
          '<td class="num">' + T.esc(dataDoGrupo(g) || '—') + '</td>' +
          tdDC(g.valorA) + tdDC(g.valorB) +
          '<td class="pequeno" style="white-space:nowrap">' + g.a.length + ' de A · ' + g.b.length + ' de B' + (Math.abs(dif) >= 1 ? '<br><span class="falta">diferença ' + textoDC(dif) + '</span>' : '') + '</td>' +
          '<td class="pequeno suave">' + T.esc(g.quem || '') + (g.quando ? '<br>' + U.dataHoraLocal(g.quando) : '') + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer-ab="' + g.id + '">Desfazer</button></td></tr>' +
          (aberto ? linhaDetalheAB(g) : '');
      },
    });
  }

  // Data de uma conciliação: a mais antiga dos itens (razão: data do lançamento; aging: vencimento).
  function dataDoGrupo(g) {
    let menor = null;
    g.a.concat(g.b).forEach((id) => { const x = E.itens.porId.get(id); const d = x && U.lerData(x.data); if (d && (!menor || d.numero < menor.numero)) menor = d; });
    return menor ? menor.texto : '';
  }

  // O que se sabe de um item que saiu dos arquivos (guardado nas atualizações, a mais nova primeiro).
  function itemQueSaiu(id) {
    const xs = (E.decisoes.atualizacoes || []).slice().reverse();
    for (const a of xs) {
      for (const f of a.faltando || []) { const s = (f.sairam || []).find((x) => x.id === id && x.valor !== undefined); if (s) return { item: s, quando: a.quando }; }
      const s = (a.sairam || []).find((x) => x.id === id && x.valor !== undefined);
      if (s) return { item: s, quando: a.quando };
    }
    return null;
  }

  function linhaDetalheAB(g) {
    const itens = g.a.concat(g.b).map((id) => E.itens.porId.get(id) || { id, faltando: true });
    const faltou = (x) => {
      const s = itemQueSaiu(x.id);
      if (!s) return '<tr><td colspan="6" class="falta pequeno">⚠ Item que não está mais nos arquivos (' + T.esc(x.id) + ')</td></tr>';
      const i = s.item;
      return '<tr class="item-faltando"><td><b>' + T.esc(i.lado || '') + '</b></td><td class="num">' + T.nome(i.doc) + '</td><td class="pequeno"><span class="selo perigo">⚠ saiu em ' + T.esc(U.dataHoraLocal(s.quando)) + '</span></td>' +
        '<td class="num">' + T.esc(i.data || '—') + '</td><td class="historico">' + T.esc(i.nome || '') + (i.historico ? '<br><span class="suave pequeno">' + T.esc(i.historico) + '</span>' : '') + '</td>' + tdDC(i.valor) + '</tr>';
    };
    const trocas = (g.trocas || []).length ? '<p class="pequeno suave" style="margin:6px 0 0">✎ Item trocado pelo corrigido: ' + g.trocas.map((t) => U.dataHoraLocal(t.quando) + ' (mudou: ' + T.esc((t.campos || []).join(', ') || '—') + ')').join(' · ') + '</p>' : '';
    return '<tr class="sub"><td></td><td colspan="11"><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Lado</th><th>Documento</th><th>Origem</th><th>Data</th><th class="historico">Fornecedor · histórico</th><th class="num">Valor · D/C</th></tr></thead><tbody>' +
      itens.map((x) => x.faltando ? faltou(x) :
        '<tr><td><b>' + x.lado + '</b></td><td class="num">' + T.nome(x.doc) + '</td><td class="pequeno suave">' + T.esc(rotuloFonte(x)) + '</td><td class="num">' + T.esc(x.data || '—') + '</td>' +
        '<td class="historico">' + (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico) + '</span>' : '') + '</td>' +
        tdDC(x.valor) + '</tr>').join('') +
      '</tbody></table></div>' + trocas + '</td></tr>';
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

  // ≈ Conciliar só pelo valor (Dony, 16/09/2026): só quando ele aperta. Antes, o que casa pelo
  // documento (o ⚡) — o valor sozinho é a última tentativa.
  async function conciliarSoPeloValor() {
    const quem = app().usuario.nome, quando = U.agoraISO();
    const pelosDocs = M.conciliarAutomatico(E.itens, E.decisoes.conciliacoesAB, quem, quando);
    const porValor = M.conciliarPorValor(E.itens, E.decisoes.conciliacoesAB.concat(pelosDocs), quem, quando);
    if (!porValor.length) {
      T.avisoRapido('Nada casa só pelo valor (com valor quebrado) no que ficou em aberto' + (pelosDocs.length ? '. O ⚡ pelo documento achou ' + pelosDocs.length + ' e elas NÃO foram gravadas: aperte ⚡ Conciliar.' : '.'), 'ok', 8000);
      return;
    }
    const n = (regra) => porValor.filter((g) => g.regra === regra).length;
    const conferir = porValor.filter((g) => g.aviso).length;
    const ok = await T.confirmar({
      titulo: 'Conciliar só pelo valor?',
      texto: (pelosDocs.length ? 'Antes, o <b>⚡ pelo documento</b> acha <b>' + pelosDocs.length + '</b> conciliação(ões) novas.<br>' : '') +
        'Só pelo valor (sem olhar documento e fornecedor, só valor quebrado): <b>' + porValor.length + '</b> conciliação(ões) — ' +
        n('valor-par') + ' dentro da Parte A e ' + n('valor') + ' da Parte A com a Parte B' + (conferir ? ', ' + conferir + ' para conferir (' + E.cfg.avisoAntes + ')' : '') + '.<br><br>' +
        'Depois, confira em <b>Mostrar → Conciliados só pelo valor</b>; o que não for, é só desfazer.',
      botao: 'Conciliar só pelo valor',
    });
    if (!ok) return;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat(pelosDocs, porValor);
    const faixa = (xs) => xs.length === 1 ? 'ID #' + xs[0].id : 'IDs #' + xs[0].id + ' a #' + xs[xs.length - 1].id;
    const texto = (pelosDocs.length ? pelosDocs.length + ' pelo documento (' + faixa(pelosDocs) + ') e ' : '') +
      porValor.length + ' só pelo valor (' + faixa(porValor) + '): ' + n('valor-par') + ' A×A e ' + n('valor') + ' A×B';
    historico('≈ Conciliar só pelo valor: ' + texto);
    E.filtros[E.aba + '.mostrar'] = 'valor'; // já mostra as novas para conferir
    redesenharAB();
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    T.avisoRapido('≈ ' + texto + '. Em aberto: ' + ab.abertosA.length + ' na A e ' + ab.abertosB.length + ' na B.', 'ok', 9000);
    gravar('terceiro-ab-valor', texto);
  }

  // ± Conciliar com margem (Dony, 16/09/2026: "um botão chamado fechar documento + fornecedor com margem de
  // diferença; até um real de margem; só concilia se eu apertar esse botão"). Antes, o que casa exato pelo
  // documento (o ⚡) — a margem é só para o que sobrou.
  async function conciliarComMargem() {
    const quem = app().usuario.nome, quando = U.agoraISO();
    const margem = M.MARGEM_AB;
    const pelosDocs = M.conciliarAutomatico(E.itens, E.decisoes.conciliacoesAB, quem, quando);
    const comMargem = M.conciliarAutomatico(E.itens, E.decisoes.conciliacoesAB.concat(pelosDocs), quem, quando, { margem });
    if (!comMargem.length) {
      T.avisoRapido('Nada casa pelo mesmo documento e fornecedor com diferença de até ' + T.moeda(margem) +
        (pelosDocs.length ? '. O ⚡ pelo documento achou ' + pelosDocs.length + ' e elas NÃO foram gravadas: aperte ⚡ Conciliar.' : '.'), 'ok', 8000);
      return;
    }
    const soma = comMargem.reduce((s, g) => s + (g.valorA - g.valorB), 0);
    const maior = comMargem.reduce((m, g) => Math.max(m, Math.abs(g.valorA - g.valorB)), 0);
    const ok = await T.confirmar({
      titulo: 'Conciliar com margem de até ' + T.moeda(margem) + '?',
      texto: (pelosDocs.length ? 'Antes, o <b>⚡ pelo documento</b> acha <b>' + pelosDocs.length + '</b> conciliação(ões) novas (exatas).<br>' : '') +
        'Com margem (mesmo documento e mesmo fornecedor, diferença de até ' + T.moeda(margem) + '): <b>' + comMargem.length + '</b> conciliação(ões), ' +
        'com diferença somada de <b>' + textoDC(soma) + '</b> (a maior: ' + T.moeda(maior) + ').<br><br>' +
        'Depois, confira em <b>Mostrar → Conciliados com margem</b>; o que não for, é só desfazer.',
      botao: '± Conciliar com margem',
    });
    if (!ok) return;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat(pelosDocs, comMargem);
    const faixa = (xs) => xs.length === 1 ? 'ID #' + xs[0].id : 'IDs #' + xs[0].id + ' a #' + xs[xs.length - 1].id;
    const texto = (pelosDocs.length ? pelosDocs.length + ' pelo documento (' + faixa(pelosDocs) + ') e ' : '') +
      comMargem.length + ' com margem (' + faixa(comMargem) + '), diferença somada ' + textoDC(soma);
    historico('± Conciliar com margem: ' + texto);
    E.filtros[E.aba + '.mostrar'] = 'margem'; // já mostra as novas para conferir
    redesenharAB();
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    T.avisoRapido('± ' + texto + '. Em aberto: ' + ab.abertosA.length + ' na A e ' + ab.abertosB.length + ' na B.', 'ok', 9000);
    gravar('terceiro-ab-margem', texto);
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
  // tipo: 'manuais' (à mão) · 'automaticas' (⚡ pelo documento) · 'valor' (≈ só pelo valor) · 'margem' (± com
  // margem) · 'faltando' (com item que não está mais nos arquivos).
  const LOTES = {
    manuais: { de: (g) => g.regra === 'manual', nome: 'manuais', titulo: 'Desfazer as conciliações manuais',
      texto: (n) => 'As <b>' + n + '</b> conciliações feitas à mão voltam para <b>em aberto</b> (as observações delas também saem). As outras continuam.' },
    automaticas: { de: (g) => g.regra !== 'manual' && !M.ehPorValor(g) && !M.ehComMargem(g), nome: 'automáticas', titulo: 'Desfazer as conciliações automáticas',
      texto: (n) => 'As <b>' + n + '</b> conciliações feitas pelo ⚡ Conciliar (pelo documento) voltam para <b>em aberto</b>. As feitas à mão, as só pelo valor e as com margem continuam.' },
    valor: { de: M.ehPorValor, nome: 'só pelo valor', titulo: 'Desfazer as conciliações só pelo valor',
      texto: (n) => 'As <b>' + n + '</b> conciliações feitas pelo ≈ Conciliar só pelo valor voltam para <b>em aberto</b>. As outras continuam.' },
    margem: { de: M.ehComMargem, nome: 'com margem', titulo: 'Desfazer as conciliações com margem',
      texto: (n) => 'As <b>' + n + '</b> conciliações feitas pelo ± Conciliar com margem voltam para <b>em aberto</b>. As outras continuam.' },
    faltando: { de: (g) => E.comFalta.has(g.id), nome: 'com item faltando', titulo: 'Desfazer as conciliações com item faltando',
      texto: (n) => 'As <b>' + n + '</b> conciliações com item que não está mais nos arquivos são desfeitas: o que sobrou delas volta para <b>em aberto</b>' +
        ' (as feitas à mão também — confira antes em <b>Mostrar → Conciliados com item faltando</b>). As outras continuam.' },
  };
  async function desfazerEmLote(tipo) {
    const lote = LOTES[tipo];
    const saem = E.decisoes.conciliacoesAB.filter(lote.de);
    if (!saem.length) return;
    const ok = await T.confirmar({ titulo: lote.titulo, texto: lote.texto(saem.length.toLocaleString('pt-BR')), botao: 'Desfazer', perigo: true });
    if (!ok) return;
    const ids = new Set(saem.map((g) => g.id));
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => !ids.has(g.id));
    saem.forEach((g) => E.abertosAB.delete(g.id));
    historico('Desfez ' + saem.length + ' conciliações ' + lote.nome + ': ' + saem.slice(0, 20).map((g) => '#' + g.id).join(', ') + (saem.length > 20 ? '…' : ''));
    redesenharAB();
    T.avisoRapido(saem.length + ' conciliação(ões) ' + lote.nome + ' desfeita(s).', 'ok');
    gravar('terceiro-ab-desfazer-' + tipo, saem.length + ' conciliações');
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
        corpo: '<p style="line-height:1.7">Parte A: <b>R$ ' + textoDC(valorA) + '</b> (' + a.length + ' item(ns))<br>Parte B: <b>R$ ' + textoDC(valorB) + '</b> (' + b.length + ' item(ns))<br>' +
          '<span class="falta">Diferença: <b>R$ ' + textoDC(valorA - valorB) + '</b></span></p>' +
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
    historico('Conciliou à mão #' + g.id + ' (' + TIPO_AB[g.tipo] + '): ' + a.length + ' de A e ' + b.length + ' de B (' + textoDC(valorA) + ' × ' + textoDC(valorB) + ')');
    redesenharAB();
    T.avisoRapido('Conciliado à mão: ID #' + g.id + ' (' + TIPO_AB[g.tipo] + ')', 'ok');
    gravar('terceiro-ab-conciliar', '#' + g.id + ' · ' + a.length + '+' + b.length + ' · ' + textoDC(valorA));
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
      ordem: { id: 'ab-fornecedores', colunas: [null, TXT((f) => f.nome), TXT((f) => f.cnpj), VALOR((f) => f.anterior), VALOR((f) => f.notas), VALOR((f) => f.baixas),
        VALOR((f) => f.movimento), VALOR((f) => f.esperado), VALOR((f) => f.atual), VALOR((f) => f.diferenca), TXT((f) => (SIT[f.situacao] || [0, f.situacao])[1]), null] },
      cabecalho: '<th style="width:24px"></th><th>' + primeiraMaiuscula(pessoa()) + '</th><th>CNPJ</th><th class="num">' + T.esc(E.entrada.mesAnterior) + '</th><th class="num">' + primeiraMaiuscula(E.cfg.aumentos) + '</th><th class="num">' + primeiraMaiuscula(E.cfg.reducoes) + '</th><th class="num">Movim.</th><th class="num">Esperado</th><th class="num">' + T.esc(E.entrada.mesAtual) + '</th><th class="num">Diferença</th><th>Situação</th><th></th>',
      linhas: lista, porPagina: 200,
      vazio: soDiferencas ? 'Tudo batendo — nenhuma diferença. 🎉' : 'Nenhum fornecedor com estes filtros.',
      linha: (f) => {
        const aberto = E.abertos.has(f.chave);
        let h = '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir="' + T.esc(f.chave) + '">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="nome"><b>' + T.esc(f.nome) + '</b>' + (f.observacao ? '<br><span class="suave pequeno">✎ ' + T.esc(f.observacao) + '</span>' : '') + '</td>' +
          '<td class="num">' + (f.cnpj ? U.formatarCnpj(f.cnpj) : '—') + '</td>' +
          tdDC(f.anterior) + T.tdValor(f.notas) + T.tdValor(f.baixas) + tdDC(f.movimento) + tdDC(f.esperado) + tdDC(f.atual) +
          '<td class="num ' + (Math.abs(f.diferenca) < 1 ? 'zero' : 'negativo') + '"><b>' + htmlDC(f.diferenca) + '</b></td>' +
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
    const tabTit = (titulo, g) => g && g.titulos.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>' + titulo + '</b> (' + g.titulos.length + ' · R$ ' + textoDC(g.valor) + ')</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Vencimento</th><th>Documento</th><th class="num">Valor</th></tr></thead><tbody>' +
      g.titulos.slice(0, 40).map((t) => '<tr><td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + tdDC(t.valor) + '</tr>').join('') + '</tbody></table></div>' : '';
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
    const lancsSem = E.arquivos.raz.conteudo.conta.lancamentos;
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      ordem: { id: 'ab-sem', colunas: [DATA((l) => lancsSem[l.i].data), TXT((l) => M.documentoDaLinha(lancsSem[l.i])), TXT((l) => lancsSem[l.i].historico),
        VALOR((l) => valorDaLinha(lancsSem[l.i])), VALOR((l) => valorDaLinha(lancsSem[l.i])), null] },
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
      ordem: { id: 'ab-razao', colunas: [DATA((l) => lancs[l.i].data), TXT((l) => M.documentoDaLinha(lancs[l.i])), TXT((l) => lancs[l.i].historico),
        TXT((l) => { const d = E.r.porLinha.get(l.digital); return d.chave === SEM ? '' : d.nome; }), VALOR((l) => valorDaLinha(lancs[l.i])), VALOR((l) => valorDaLinha(lancs[l.i])), null] },
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th>' + primeiraMaiuscula(pessoa()) + '</th>' + cabecalhoRazao(false) + '<th></th>',
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
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">Aging de ' + T.esc(mes) + ': ' + lista.length + ' título(s) em aberto · R$ ' + textoDC(total) + '.</p><div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      ordem: { id: 'ab-aging', colunas: [TXT((x) => x.nome), TXT((x) => x.cnpj), DATA((x) => x.vencimento), TXT((x) => x.documento), VALOR((x) => x.valor)] },
      cabecalho: '<th>' + primeiraMaiuscula(pessoa()) + '</th><th>CNPJ</th><th>Vencimento</th><th>Documento</th><th class="num">Valor · D/C</th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhum título.',
      linha: (t) => '<tr><td class="nome">' + T.esc(t.nome) + '</td><td class="num">' + (t.cnpj ? U.formatarCnpj(t.cnpj) : '—') + '</td>' +
        '<td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + tdDC(t.valor) + '</tr>',
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
      else if (a === 'conciliar-valor') await conciliarSoPeloValor();
      else if (a === 'conciliar-margem') await conciliarComMargem();
      else if (a === 'desfazer-automaticas') await desfazerEmLote('automaticas');
      else if (a === 'desfazer-valor') await desfazerEmLote('valor');
      else if (a === 'desfazer-margem') await desfazerEmLote('margem');
      else if (a === 'desfazer-faltando') await desfazerEmLote('faltando');
      else if (a === 'desfazer-manuais') await desfazerEmLote('manuais');
      else if (a === 'ver-atualizacao') await verAtualizacao();
      else if (a === 'mostrar-atualizacao') mostrarNaLista('atualizacao');
      else if (a === 'mostrar-faltando') mostrarNaLista('faltando');
      else if (a === 'entendi-atualizacao') await entendiAtualizacao();
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
