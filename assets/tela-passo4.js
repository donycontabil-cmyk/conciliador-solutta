/*
 * Conciliador Solutta — tela-passo4.js
 * Passo ④ · FORNECEDORES · SOMENTE RAZÃO (Dony, 22/09/2026: "a conciliação de fornecedor só o razão contra o próprio
 * razão, só para pegar distorções dentro do próprio razão; se eu tiver o diário, vai ser o diário; ele só vai pegar
 * débito e crédito e vai me mostrar tudo que tem a crédito em aberto e tudo que está em débito em aberto" + "no mesmo
 * layout da outra conciliação, mesmo só tendo parte A: no estilo da Parte A, para ter um ID, tudo num lugar só — uma
 * parte A onde eu possa filtrar tudo que conciliou e tudo que está em aberto").
 * O razão de fornecedores do ① (o mesmo lugar; com o livro diário, o razão das contas escolhidas sai dele) contra ele
 * mesmo: as mesmas batidas do ① dentro do razão, sem adiantamento e sem reclassificação (MotorFechamento.somenteRazao).
 * UMA lista (a Parte A do ③): cada lançamento com o seu ID de conciliação, filtros de documento, fornecedor, valor, data
 * e D/C, e o "mostrar" (em aberto, a crédito, a débito, conciliados, todos). Embaixo, as conciliações com ID e o por
 * fornecedor. Não grava decisão: é uma leitura do razão.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function M() { return raiz.MotorFechamento; }
  const SEM = () => raiz.MotorNomes.SEM_FORNECEDOR;
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });
  const COMO = { '1x1': 'um com um', '1xN': 'um pagamento, várias notas', 'Nx1': 'uma nota, vários pagamentos', zerou: 'o resto do fornecedor zerou', 'mesmo-dia': 'mesmo dia, sem fornecedor' };
  function mostrarOpcoes() {
    const r = rotulos();
    return [['', 'Em aberto'], ['credito', r.aumento], ['debito', r.reducao],
      ['dois-lados', 'Em aberto dos ' + r.pessoas + ' com os dois lados'], ['conciliados', 'Conciliados'], ['todos', 'Todos']];
  }

  let P = null; // estado da tela aberta

  // Os lugares do ④: o razão de fornecedores e o contas a pagar (opcional, ajuda a reconhecer os nomes) do ①.
  function lugaresDoPasso4(comp, arqs, familiaId) { return raiz.TelaPasso1.lugaresDoPasso1(comp, arqs, familiaId).filter((l) => l.id !== 'A'); }
  function chaveDoPainel(codigo, comp, familiaId) { return codigo + '|passo4|' + (familiaId || 'fornecedores') + '|' + comp; }
  // O ④ não decide nada sobre os lançamentos (é uma leitura do razão), mas guarda QUAIS REGRAS estão ligadas:
  // senão, toda vez que ele abrisse, teria de apertar os botões de novo.
  function idDoPasso4(codigo, comp, familiaId) { return 'F-' + codigo + '-' + raiz.TelaFamilia.tipoDoPasso(raiz.TelaFamilia.familiaDe(familiaId), 'passo4') + '-' + U.anoMes(comp); }
  // A família aberta: em fornecedores o saldo aumenta no CRÉDITO (a nota); em clientes, no DÉBITO (a venda).
  function fam() { return (P && P.fam) || raiz.Familias.familia('fornecedores'); }
  const cliente = () => fam().id === 'clientes';
  // Os dois lados em aberto, com o nome certo em cada família.
  function rotulos() {
    const c = cliente();
    return { aumento: 'A ' + (c ? 'débito' : 'crédito') + ' em aberto', aumentoSub: c ? 'nota sem recebimento' : 'nota sem pagamento',
      reducao: 'A ' + (c ? 'crédito' : 'débito') + ' em aberto', reducaoSub: c ? 'recebimento sem nota' : 'pagamento sem nota',
      pessoa: c ? 'cliente' : 'fornecedor', pessoas: c ? 'clientes' : 'fornecedores' };
  }

  // ------------------------------------------------------------------
  // Abrir
  // ------------------------------------------------------------------
  async function mostrar(el, codigo, anoMes, conferir, familiaId) {
    const comp = anoMes + '-01';
    const familia = raiz.TelaFamilia.familiaDe(familiaId);
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/' + familia.id + '/' + anoMes;
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Abrindo o Passo ④ de ' + U.nomeCompetencia(comp) + '…');
    const arm = app().armazenamento;
    const S = raiz.TelaSubir;
    // O livro diário é o razão: com as contas de fornecedores escolhidas, o razão delas sai do diário (só o que mudou).
    let metas = await arm.arquivos(codigo);
    if (conferir && !conferir()) return;
    let sinc = { estado: 'erro', mudou: false };
    try { sinc = await S.sincronizarDoDiario(codigo, lugaresDoPasso4(comp, raiz.TelaFamilia.arquivosDoPasso1(metas, comp, familia.id), familia.id)); } catch (e) { T.avisoRapido('Livro diário: ' + T.mensagemDeErro(e), 'erro', 8000); }
    if (conferir && !conferir()) return;
    if (sinc.mudou) metas = await arm.arquivos(codigo);
    const arqs = raiz.TelaFamilia.arquivosDoPasso1(metas, comp, familia.id);
    const curto = familia.titulo.replace(/ ·.*$/, '');
    const cabecalho = '<a class="voltar" href="' + voltar + '">← ' + T.esc(curto) + ' · ' + U.nomeCompetencia(comp) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Passo ④ · ' + T.esc(curto) + ' · somente razão</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + U.nomeCompetencia(comp) + '</p></div></div>';
    if (!arqs.F.length) {
      const doDiario = sinc.prep ? (sinc.prep.ok ? (sinc.estado === 'escolher' ? S.cartaoDaEscolha(sinc.prep) : '')
        : '<div class="aviso ambar" style="margin-bottom:12px"><span class="icone-aviso">📒</span><div>' + S.textoSemDiario(codigo, sinc.prep, comp) + '</div></div>') : '';
      const extras = [S.lugarDoBalanceteDoDiario(sinc.prep)].filter(Boolean);
      const lugares = lugaresDoPasso4(comp, arqs, familia.id).concat(extras);
      el.innerHTML = cabecalho + (doDiario || '<div class="aviso info" style="margin-bottom:12px"><span class="icone-aviso">📁</span><div><b>Suba o razão de ' + T.esc(familia.contas.principal) + '</b> ' +
        '(o mesmo do Passo ①: o que subir aqui vale lá, e o contrário também) — ou guarde o livro diário e escolha as contas.</div></div>') +
        S.painel({ chave: chaveDoPainel(codigo, comp, familia.id), titulo: 'Arquivos do passo', resumo: U.nomeCompetencia(comp), fixo: true, lugares, metas: arqs.metas });
      S.ligar(el.querySelector('.arquivos-passo'), codigo, lugares);
      S.ligarCartaoDaEscolha(el.querySelector('.escolha-diario'), codigo, sinc.prep);
      return;
    }
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const F = await Promise.all(arqs.F.map(carregar));
    const pagar = arqs.pagar ? await carregar(arqs.pagar) : null;
    if (conferir && !conferir()) return;
    const fonte = (x) => ({ arquivoId: x.meta.id, conta: x.conteudo.conta, saldoAnterior: x.conteudo.conta.saldoAnterior,
      saldoFinal: x.conteudo.conta.saldoFinalDeclarado, lancamentos: x.conteudo.conta.lancamentos, periodo: x.conteudo.periodo });
    // As regras guardadas deste mês (se nunca mexeu, são as duas de sempre).
    let registro = null;
    try { registro = (await arm.conciliacoes(codigo, comp)).find((x) => x.id === idDoPasso4(codigo, comp, familia.id)) || null; } catch (e) { registro = null; }
    if (conferir && !conferir()) return;
    const regras = M().regrasDe(registro && registro.decisoes ? registro.decisoes.regras : null);
    const r = M().somenteRazao({ natureza: familia.natureza, competencia: comp, contas: { F: F.map(fonte) }, titulos: pagar ? pagar.conteudo.titulos : [], decisoes: { regras } });
    P = { codigo, comp, emp, voltar, arqs, F, pagar, r, cabecalho, fam: familia, abertos: new Set(), regras, registro, fonte,
      titulos: pagar ? pagar.conteudo.titulos : [],
      filtros: { busca: '', mostrar: '', regra: '', doc: '', forn: '', valor: '', data: '', dc: '' } };
    numerarBatidas();
    el.innerHTML = '<div class="tela-passo4"></div>';
    P.el = el.firstChild;
    ligarUmaVez();
    desenhar();
  }

  // ------------------------------------------------------------------
  // As REGRAS (as mesmas do ①, Dony 22/09/2026: "esses botões em todas as conciliações"): cada botão liga
  // ou desliga a regra e a leitura do razão é refeita na hora. Fica guardado no mês.
  // ------------------------------------------------------------------
  const CLASSE_REGRA = { documento: 'documento', 'fornecedor-valor': 'fornecedor', margem: 'margem', valor: 'valor', 'mesmo-dia': 'opcional' };
  function seloRegra(id) {
    const g = M().REGRA_DE[id] || { icone: '', curto: id, texto: '' };
    return '<span class="selo ' + (CLASSE_REGRA[id] || 'opcional') + '" title="' + T.esc(g.texto) + '">' + g.icone + ' ' + T.esc(g.curto) + '</span>';
  }
  function opcoesDeRegra() {
    return [['', 'Conciliado por: tudo']].concat(M().REGRAS.map((g) => [g.id, g.icone + ' ' + g.nome]))
      .concat([['mesmo-dia', '📅 Mesmo dia, sem ' + rotulos().pessoa]]);
  }
  function barraDeRegras() {
    const t = P.r.totais;
    const qtd = (id) => P.r.batidas.filter((b) => b.regra === id).length;
    const botao = (g) => {
      const ligada = !!P.regras[g.id];
      return '<button type="button" class="acao ' + CLASSE_REGRA[g.id] + (ligada ? '' : ' apagada') + '" data-regra="' + g.id + '" ' +
        'title="' + T.esc(g.texto + (ligada ? ' · Clique para DESLIGAR esta regra.' : ' · Clique para LIGAR esta regra.')) + '">' +
        '<span class="acao-icone" aria-hidden="true">' + g.icone + '</span>' +
        '<span class="acao-texto"><b>' + T.esc(g.nome) + '</b><small>' + T.esc(g.sub || g.curto) + '</small></span>' +
        '<span class="estado">' + (ligada ? qtd(g.id).toLocaleString('pt-BR') : 'ligar') + '</span></button>';
    };
    const md = qtd('mesmo-dia');
    const avisos = [
      t.comMargem.qtd ? '<span class="falta">± <b>' + t.comMargem.qtd + '</b> com margem: a diferença de ' + T.moeda(Math.abs(t.comMargem.valor)) + ' continua em aberto.</span>' : '',
      t.soPeloValor.qtd ? '<span class="falta">≈ <b>' + t.soPeloValor.qtd + '</b> só pelo valor: são de ' + T.esc(rotulos().pessoas) + ' diferentes — confira uma a uma.</span>' : '',
    ].filter(Boolean).join(' ');
    return '<div class="acoes-ab" style="margin:14px 0 0"><div class="rotulo-regras pequeno">Conciliação dentro do razão · o que o programa pode casar sozinho</div>' +
      '<div class="acoes-conciliar quatro">' + M().REGRAS.map(botao).join('') + '</div>' +
      '<p class="pequeno suave" style="margin:0">Cada botão liga ou desliga a regra e a leitura do razão é refeita na hora. ' +
      (md ? '📅 <b>' + md + '</b> bateram no mesmo dia, sem ' + T.esc(rotulos().pessoa) + '. ' : '') + avisos + '</p></div>';
  }
  async function alternarRegra(id) {
    const g = M().REGRA_DE[id];
    if (!g || !P) return;
    const ligar = !P.regras[id];
    const antes = P.r.totais.bateram;
    const novas = Object.assign({}, P.regras);
    novas[id] = ligar;
    P.regras = novas;
    P.r = M().somenteRazao({ natureza: P.fam.natureza, competencia: P.comp, contas: { F: P.F.map(P.fonte) }, titulos: P.titulos, decisoes: { regras: P.regras } });
    numerarBatidas();
    P.abertos = new Set();
    P.filtros.regra = ligar ? id : (P.filtros.regra === id ? '' : P.filtros.regra);
    if (ligar) P.filtros.mostrar = 'conciliados';
    desenhar();
    const dif = P.r.totais.bateram - antes;
    const daRegra = P.r.batidas.filter((b) => b.regra === id).length;
    const texto = (ligar ? 'Ligou' : 'Desligou') + ' a regra ' + g.icone + ' ' + g.nome + ' (' + g.curto + '): ' +
      (ligar ? daRegra + ' conciliação(ões) por esta regra, ' + (dif >= 0 ? '+' : '') + dif + ' linha(s) a mais conciliadas'
        : Math.abs(dif) + ' linha(s) voltaram a ficar em aberto');
    T.avisoRapido(texto + '. Clique de novo no botão para voltar atrás.', P.r.invariantes.ok ? 'ok' : 'erro', 9000);
    try {
      const arm = app().armazenamento;
      const base = P.registro || { id: idDoPasso4(P.codigo, P.comp, P.fam.id), codigo: P.codigo, tipo: raiz.TelaFamilia.tipoDoPasso(P.fam, 'passo4'), competencia: P.comp, arquivos: [] };
      const decisoes = Object.assign({}, base.decisoes, { regras: P.regras });
      decisoes.historico = (decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome, texto }]).slice(-200);
      P.registro = await arm.salvarConciliacao(Object.assign({}, base, { situacao: 'andamento', decisoes,
        resumo: { linhas: P.r.totais.linhas, bateram: P.r.totais.bateram, batidas: P.r.totais.batidas, conferido: P.r.invariantes.ok } }));
      await arm.registrarNoLog({ codigo: P.codigo, acao: 'passo4-regra-' + (ligar ? 'ligada' : 'desligada'), alvo: P.registro.id, detalhe: texto });
    } catch (e) { T.avisoRapido('A regra valeu agora, mas não deu para guardar: ' + T.mensagemDeErro(e), 'erro', 8000); }
  }

  // Cada batida ganha um número (#1, #2, …), da mais antiga para a mais nova — é o ID que aparece na lista.
  function numerarBatidas() {
    const r = P.r;
    const primeira = (b) => b.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i)[0];
    const ordenadas = r.batidas.slice().sort((a, b) => { const x = primeira(a), y = primeira(b); return x.dia - y.dia || x.i - y.i; });
    P.numeroDaBatida = new Map();
    P.batidaDoNumero = new Map();
    ordenadas.forEach((b, k) => { P.numeroDaBatida.set(b.id, k + 1); P.batidaDoNumero.set(k + 1, b); });
    P.batidaDaLinha = new Map();
    r.batidas.forEach((b) => b.linhas.forEach((i) => P.batidaDaLinha.set(i, b)));
    P.primeiraDaBatida = primeira;
  }

  // ------------------------------------------------------------------
  // Filtros (os mesmos jeitos do ③: valor com faixa, data com faixa, vários separados por vírgula)
  // ------------------------------------------------------------------
  const nomeDe = (l) => (l.dono.chave === SEM() ? 'Sem fornecedor' : l.dono.nome);
  const docDe = (l) => String(l.nota || l.numero || '');
  const dcDe = (v) => raiz.MotorTerceiro.ladoDC(v || 1, fam().natureza); // o + é o lado que aumenta o saldo da conta
  const tdDC = (v) => T.tdValorDC(v, dcDe(v));
  const textoDC = (v) => T.valorDC(v, dcDe(v));
  const filtro = (n) => P.filtros[n] || '';
  function combina(termo, ...textos) {
    const t = U.semAcento(String(termo || '')).toLowerCase().trim();
    return !t || textos.some((x) => U.semAcento(String(x || '')).toLowerCase().indexOf(t) >= 0);
  }
  function filtroValor(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    const centavos = (s) => { const n = U.paraNumero(String(s).replace(/R\$\s*/i, '')); return n === null ? null : Math.abs(U.centavos(n)); };
    if (faixa.length === 2) {
      const de = centavos(faixa[0]), ate = centavos(faixa[1]);
      if (de !== null && ate !== null) return (x) => Math.abs(x.valor) >= Math.min(de, ate) && Math.abs(x.valor) <= Math.max(de, ate);
    }
    const v = centavos(t);
    if (v !== null) return (x) => Math.abs(x.valor) === v;
    return (x) => U.formatarCentavos(Math.abs(x.valor)).indexOf(t) >= 0;
  }
  function filtroData(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    const numero = (s) => { s = s.trim(); if (/^\d{1,2}\/\d{1,2}$/.test(s)) s += '/' + P.comp.slice(0, 4); const d = U.lerData(s); return d ? d.numero : null; };
    if (faixa.length === 2) {
      const de = numero(faixa[0]), ate = numero(faixa[1]);
      if (de !== null && ate !== null) return (x) => x.dia >= Math.min(de, ate) && x.dia <= Math.max(de, ate);
    }
    return (x) => String(x.data || '').indexOf(t) >= 0;
  }
  const termos = (texto, sep) => String(texto || '').split(sep).map((s) => s.trim()).filter(Boolean);
  // A busca de cima: "#12" = a conciliação 12; valor; data; número = documento; texto = fornecedor ou histórico.
  function buscaGeral() {
    const q = filtro('busca').trim();
    if (!q) return { linha: () => true, batida: () => true };
    const mId = q.match(/^#\s*(\d+)$/);
    if (mId) {
      const n = Number(mId[1]);
      return { linha: (l) => { const b = P.batidaDaLinha.get(l.i); return !!b && P.numeroDaBatida.get(b.id) === n; }, batida: (b) => P.numeroDaBatida.get(b.id) === n };
    }
    let linha;
    if (/^[-+]?\s*(R\$\s*)?\d[\d.]*,\d{1,2}$/i.test(q) || /^\d[\d.]*(,\d{1,2})?\s+(a|até|ate)\s+\d[\d.]*(,\d{1,2})?$/i.test(q)) linha = filtroValor(q);
    else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(q)) linha = filtroData(q);
    else if (/^[\d.\-/ ]+$/.test(q)) linha = (l) => docDe(l).indexOf(q.trim()) >= 0;
    else linha = (l) => combina(q, nomeDe(l), l.historico);
    return { linha, batida: (b) => b.linhas.some((i) => linha(P.r.linhas[i])) };
  }
  function filtroDasColunas() {
    const docs = termos(filtro('doc'), /[,;]/);
    const forns = termos(filtro('forn'), /[,;]/);
    const valores = termos(filtro('valor'), /;/).map(filtroValor).filter(Boolean);
    const datas = termos(filtro('data'), /;/).map(filtroData).filter(Boolean);
    const soDC = filtro('dc');
    return (l) => (!soDC || dcDe(l.valor) === soDC) && (!docs.length || docs.some((d) => docDe(l).indexOf(d) >= 0)) &&
      (!forns.length || forns.some((f) => combina(f, nomeDe(l), l.historico))) &&
      (!valores.length || valores.some((f) => f(l))) && (!datas.length || datas.some((f) => f(l)));
  }
  // As linhas da lista, conforme o "mostrar" e os filtros.
  function linhasDaLista() {
    const r = P.r;
    const mostrar = filtro('mostrar');
    const b = buscaGeral();
    const cols = filtroDasColunas();
    const doisLados = new Set(r.porFornecedor.filter((g) => g.osDoisLados).map((g) => g.chave));
    const regra = filtro('regra');
    const daRegra = (l) => { if (!regra) return true; const b = P.batidaDaLinha.get(l.i); return !!b && b.regra === regra; };
    const noMostrar = (l) => {
      const casou = P.batidaDaLinha.has(l.i);
      if (mostrar === 'todos') return true;
      if (mostrar === 'conciliados') return casou;
      if (mostrar === 'credito') return !casou && l.valor > 0;
      if (mostrar === 'debito') return !casou && l.valor < 0;
      if (mostrar === 'dois-lados') return !casou && doisLados.has(l.dono.chave);
      return !casou && l.valor !== 0;
    };
    return r.linhas.filter((l) => daRegra(l) && noMostrar(l) && b.linha(l) && cols(l));
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenhar() {
    const r = P.r, t = r.totais;
    const contaTxt = P.F.map((x) => T.esc(x.conteudo.conta.codigo + ' ' + x.conteudo.conta.nome) + ' <span class="suave">(' + x.conteudo.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.)</span>').join(', ');
    const lugares = lugaresDoPasso4(P.comp, P.arqs, P.fam.id);
    P.el.innerHTML = P.cabecalho.replace('</p></div></div>', () => '</p><p class="suave pequeno">Fornecedores: ' + contaTxt + (P.pagar ? ' · Contas a pagar: ' + P.pagar.meta.titulos + ' títulos (ajuda a reconhecer nomes)' : '') + '</p>' +
      raiz.TelaPasso1.linhaDoDiario(lugares) + '</div>' +
      '<div class="linha-flex"><button type="button" class="botao" data-acao="excel" title="As listas em Excel: resumo, lançamentos com ID, conciliações e por fornecedor">⬇ Excel</button>' +
      raiz.TelaSubir.botao(chaveDoPainel(P.codigo, P.comp, P.fam.id)) + '</div></div>') +
      raiz.TelaSubir.painel({ chave: chaveDoPainel(P.codigo, P.comp, P.fam.id), titulo: 'Arquivos do passo', resumo: U.nomeCompetencia(P.comp), fixo: false, lugares, metas: P.arqs.metas }) +
      '<div id="p4-avisos"></div>' +
      '<div class="grade-4" style="margin-top:14px">' +
        '<div class="cartao resumo"><div class="rotulo">Linhas do razão</div><div class="grande">' + t.linhas.toLocaleString('pt-BR') + '</div>' +
          '<div class="detalhe"><span><b>' + t.bateram.toLocaleString('pt-BR') + '</b> conciliadas em ' + t.batidas.toLocaleString('pt-BR') + ' conciliações</span><span>até ' + T.esc(U.fimDaCompetencia(P.comp).texto) +
          (r.foraDaCompetencia ? ' · ' + r.foraDaCompetencia + ' depois do mês ficam fora' : '') + '</span></div></div>' +
        '<div class="cartao resumo"><div class="rotulo">' + T.esc(rotulos().aumento) + '</div><div class="grande">' + T.moeda(t.credito.valor) + '</div>' +
          '<div class="detalhe"><span><b>' + t.credito.qtd.toLocaleString('pt-BR') + '</b> lançamento(s) · ' + T.esc(rotulos().aumentoSub) + '</span></div></div>' +
        '<div class="cartao resumo"><div class="rotulo">' + T.esc(rotulos().reducao) + '</div><div class="grande">' + T.moeda(t.debito.valor) + '</div>' +
          '<div class="detalhe"><span><b>' + t.debito.qtd.toLocaleString('pt-BR') + '</b> lançamento(s) · ' + T.esc(rotulos().reducaoSub) + '</span>' +
          (t.fornecedoresComOsDoisLados ? '<span><b>' + t.fornecedoresComOsDoisLados + '</b> ' + T.esc(rotulos().pessoa) + '(s) com débito e crédito em aberto</span>' : '') + '</div></div>' +
        '<div class="cartao resumo"><div class="rotulo">Saldo do razão</div><div class="grande">' + T.htmlDC(t.saldoFinal, dcDe(t.saldoFinal)) + '</div>' +
          '<div class="detalhe"><span>saldo anterior ' + T.htmlDC(t.saldoAnterior, dcDe(t.saldoAnterior)) + '</span><span>+ crédito − débito em aberto</span></div></div>' +
      '</div>' +
      '<div id="p4-regras"></div>' +
      '<div class="filtros" id="p4-filtros"></div>' +
      '<div id="p4-parte"></div>' +
      '<div id="p4-lista"></div>' +
      '<div id="p4-fornecedores"></div>';
    desenharAvisos();
    P.el.querySelector('#p4-regras').innerHTML = barraDeRegras();
    desenharFiltros();
    desenharParte();
    desenharLista();
    desenharFornecedores();
    ligar();
  }

  function desenharAvisos() {
    const r = P.r, t = r.totais;
    const partes = [];
    if (r.invariantes.ok) {
      partes.push('<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Conferido no centavo.</b> Cada conciliação soma zero; saldo anterior ' + T.esc(textoDC(t.saldoAnterior)) +
        ' + ' + T.esc(rotulos().aumento.toLowerCase()) + ' ' + T.esc(U.formatarCentavos(t.credito.valor)) + ' − ' + T.esc(rotulos().reducao.toLowerCase()) + ' ' + T.esc(U.formatarCentavos(t.debito.valor)) + ' = saldo do razão ' + T.esc(textoDC(t.saldoFinal)) + '.' +
        (t.comMargem.qtd || t.soPeloValor.qtd ? ' <b>' + (t.comMargem.qtd + t.soPeloValor.qtd) + '</b> conciliação(ões) pelas regras opcionais (± com margem e ≈ só pelo valor)' +
          (t.comMargem.qtd ? ': a diferença de ' + T.esc(U.formatarCentavos(Math.abs(t.residuo))) + ' continua em aberto' : '') + '.' : '') + '</div></div>');
    } else {
      partes.push('<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>A conferência falhou.</b><ul class="pequeno">' + r.invariantes.falhas.slice(0, 10).map((f) => '<li>' + T.esc(f) + '</li>').join('') + '</ul></div></div>');
    }
    if (t.saldoAnterior) {
      partes.push('<div class="aviso ambar"><span class="icone-aviso">ℹ️</span><div><b>O razão começa com saldo anterior de ' + T.esc(textoDC(t.saldoAnterior)) + ', sem dizer de qual fornecedor.</b> ' +
        (cliente() ? 'Recebimento' : 'Pagamento') + ' do começo do período que quita nota de antes dele aparece em aberto do outro lado (a nota está no saldo anterior).</div></div>');
    }
    P.el.querySelector('#p4-avisos').innerHTML = partes.join('');
  }

  function desenharFiltros() {
    P.el.querySelector('#p4-filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Busca: documento, fornecedor, histórico, valor, data ou #ID" ' +
      'title="Vale para a lista e para as conciliações. A lista tem também os filtros de cada coluna." value="' + T.esc(filtro('busca')) + '">' +
      '<select class="filtro" data-filtro="mostrar">' + mostrarOpcoes().map((o) => '<option value="' + o[0] + '"' + (filtro('mostrar') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<select class="filtro" data-filtro="regra" title="Por qual regra a conciliação foi feita">' +
      opcoesDeRegra().map((o) => '<option value="' + o[0] + '"' + (filtro('regra') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<span class="suave pequeno">Conciliado = débito e crédito do mesmo ' + rotulos().pessoa + ' que se anulam, dentro do próprio razão.</span>';
  }

  const CAMPOS = ['doc', 'forn', 'valor', 'data', 'dc'];
  function filtrosDasColunasHtml() {
    const campo = (nome, texto, dica) => {
      const v = filtro(nome);
      return '<input type="search" data-filtro="' + nome + '" class="' + (v ? 'ativo' : '') + '" placeholder="' + texto + '" title="' + T.esc(dica) + '" value="' + T.esc(v) + '">';
    };
    const algum = CAMPOS.some((n) => filtro(n));
    return '<div class="filtros-lado">' +
      campo('doc', 'Documento', 'Número da nota ou do lançamento, ou parte dele. Mais de um: 107, 207') +
      campo('forn', 'Fornecedor', 'Nome do fornecedor, ou pedaço do histórico. Mais de um: POSTO CENTRAL, SILVA') +
      campo('valor', 'Valor', 'Valor (1.236,55), parte dele, ou faixa: 100 a 500. Mais de um: 791,43; 5.105,88') +
      campo('data', 'Data', 'Data (08/07/2026), parte dela (07/2026), ou faixa: 01/07 a 15/07. Mais de uma: 08/07; 22/07') +
      '<select data-filtro="dc" class="' + (filtro('dc') ? 'ativo' : '') + '" title="Só os débitos ou só os créditos">' +
      [['', 'D e C'], ['D', 'Só débito'], ['C', 'Só crédito']].map((o) => '<option value="' + o[0] + '"' + (filtro('dc') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<button type="button" class="lapis" data-limpar-filtros title="Limpar os filtros das colunas"' + (algum ? '' : ' disabled') + '>✕</button>' +
      '</div>';
  }

  // A lista (a "Parte A" do ③): os lançamentos do razão, conciliados e em aberto, com o ID da conciliação.
  function desenharParte() {
    const lista = linhasDaLista();
    const total = lista.reduce((s, l) => s + l.valor, 0);
    const rot = { todos: 'lançamento(s)', conciliados: 'conciliado(s)', credito: rotulos().aumento.toLowerCase(), debito: rotulos().reducao.toLowerCase(),
      'dois-lados': 'em aberto de ' + rotulos().pessoa + ' com os dois lados' }[filtro('mostrar')] || 'em aberto';
    const filtrado = CAMPOS.some((n) => filtro(n)) || filtro('busca');
    P.el.querySelector('#p4-parte').innerHTML = '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px">' +
      '<h3 style="flex:1">Parte A · o razão de ' + T.esc(fam().contas.principal) + '</h3>' +
      '<span class="pilula azul" title="Soma da lista com os filtros de agora">' + textoDC(total) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + P.F.map((x) => T.esc(x.conteudo.conta.codigo)).join(', ') + ' · ' + lista.length.toLocaleString('pt-BR') + ' ' + rot +
      (filtrado ? ' <b>(filtrado)</b>' : '') + ' · de ' + P.r.totais.linhas.toLocaleString('pt-BR') + ' lançamentos</p>' +
      filtrosDasColunasHtml() + '<div id="p4-tabela"></div></div>';
    T.tabelaPaginada(P.el.querySelector('#p4-tabela'), {
      alta: true, porPagina: 200,
      ordem: { id: 'p4-linhas', colunas: [TXT(docDe), TXT((l) => (l.dono.chave === SEM() ? '' : l.dono.nome)), DATA((l) => l.data), VALOR((l) => l.valor),
        NUM((l) => { const b = P.batidaDaLinha.get(l.i); return b ? P.numeroDaBatida.get(b.id) : null; })] },
      cabecalho: '<th>Documento</th><th>' + (cliente() ? 'Cliente' : 'Fornecedor') + '</th><th>Data · conta</th><th class="num" title="Sem sinal: D = débito · C = crédito">Valor · D/C</th><th>ID</th>',
      linhas: lista, vazio: 'Nada nesta lista com estes filtros.',
      linha: (l) => {
        const b = P.batidaDaLinha.get(l.i);
        const n = b ? P.numeroDaBatida.get(b.id) : null;
        return '<tr' + (b && P.abertos.has(b.id) ? ' class="destaque"' : '') + '><td class="num"><b>' + T.nome(docDe(l)) + '</b></td>' +
          '<td class="nome">' + (l.dono.chave === SEM() ? '<span class="falta">sem ' + rotulos().pessoa + '</span>' : T.esc(l.dono.nome)) +
          (l.historico ? '<br><span class="suave pequeno">' + T.esc(l.historico.slice(0, 80)) + '</span>' : '') + '</td>' +
          '<td class="num">' + T.esc(l.data || '—') + '<br><span class="pequeno suave" title="' + T.esc(l.contaNome || '') + '">conta ' + T.esc(l.conta) + '</span></td>' +
          tdDC(l.valor) +
          '<td style="white-space:nowrap">' + (n ? '<button type="button" class="lapis" data-ver-batida="' + n + '" title="Ver a conciliação #' + n + '"><b>#' + n + '</b></button><br>' + T.seloComo(l.como)
            : '<span class="selo opcional" title="Não casou com nenhum débito ou crédito do mesmo fornecedor">em aberto</span>') + '</td></tr>';
      },
    });
  }

  // As conciliações com ID (o que casou), no estilo da lista do ③.
  function desenharLista() {
    const r = P.r;
    const b = buscaGeral();
    const cols = filtroDasColunas();
    const mostrar = filtro('mostrar');
    const regra = filtro('regra');
    const lista = r.batidas.filter((x) => (!regra || x.regra === regra) && b.batida(x) && (mostrar === 'todos' || mostrar === 'conciliados' || !CAMPOS.some((n) => filtro(n)) ? true : x.linhas.some((i) => cols(r.linhas[i]))))
      .sort((x, y) => P.numeroDaBatida.get(x.id) - P.numeroDaBatida.get(y.id));
    const el = P.el.querySelector('#p4-lista');
    el.innerHTML = '<h3 style="margin:18px 0 8px">Conciliações com ID (' + lista.length.toLocaleString('pt-BR') +
      (lista.length !== r.batidas.length ? ' de ' + r.batidas.length.toLocaleString('pt-BR') : '') + ')</h3>' +
      '<p class="suave pequeno" style="margin:0 0 8px">Débito e crédito do mesmo fornecedor que se anulam dentro do próprio razão. Clique no ▸ para ver os lançamentos.</p>' +
      '<div id="p4-tab-lista"></div>';
    T.tabelaPaginada(el.querySelector('#p4-tab-lista'), {
      alta: false, porPagina: 100,
      ordem: { id: 'p4-batidas', colunas: [null, NUM((x) => P.numeroDaBatida.get(x.id)), TXT((x) => x.regra + ' ' + x.como), TXT((x) => docDe(P.primeiraDaBatida(x))), TXT((x) => nomeDe(P.primeiraDaBatida(x))),
        DATA((x) => P.primeiraDaBatida(x).data), VALOR((x) => x.valor), NUM((x) => x.linhas.length)] },
      cabecalho: '<th style="width:24px"></th><th>ID</th><th>Conciliado por</th><th>Documento</th><th>' + (cliente() ? 'Cliente' : 'Fornecedor') + '</th><th title="A data mais antiga dos lançamentos">Data</th><th class="num">Valor</th><th>Lançamentos</th>',
      linhas: lista, vazio: 'Nenhuma conciliação com este filtro.',
      linha: (x) => {
        const n = P.numeroDaBatida.get(x.id);
        const aberto = P.abertos.has(x.id);
        const ls = x.linhas.map((i) => r.linhas[i]).sort((a, c) => a.dia - c.dia || a.i - c.i);
        let html = '<tr class="' + (aberto ? 'destaque' : '') + '" id="p4-b-' + n + '"><td><button type="button" class="lapis" data-abrir-batida="' + n + '" title="Ver os lançamentos">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="num"><b>#' + n + '</b></td>' +
          '<td>' + seloRegra(x.regra) + (x.diferenca ? ' <span class="falta pequeno">dif. ' + T.moeda(Math.abs(x.diferenca)) + '</span>' : '') +
          '<br>' + T.seloComo(x.como) + ' <span class="suave pequeno">' + T.esc(COMO[x.como] || '') + '</span></td>' +
          '<td class="num">' + T.nome(docDe(ls[0])) + '</td>' +
          '<td class="nome">' + (ls[0].dono.chave === SEM() ? '<span class="falta">sem fornecedor</span>' : T.esc(ls[0].dono.nome)) + '</td>' +
          '<td class="num">' + T.esc(ls[0].data + (ls.length > 1 && ls[ls.length - 1].data !== ls[0].data ? ' a ' + ls[ls.length - 1].data : '')) + '</td>' +
          T.tdValor(x.valor) + '<td class="pequeno">' + ls.length + ' (' + ls.filter((l) => l.valor > 0).length + ' a crédito · ' + ls.filter((l) => l.valor < 0).length + ' a débito)</td></tr>';
        if (aberto) {
          html += ls.map((l) => '<tr class="sub"><td></td><td class="num">' + T.nome(docDe(l)) + '</td><td class="pequeno" colspan="3">' + T.esc(l.data) + ' · ' + T.esc(l.historico.slice(0, 90)) +
            '</td><td class="pequeno suave">conta ' + T.esc(l.conta) + '</td>' + tdDC(l.valor) + '<td></td></tr>').join('');
        }
        return html;
      },
    });
  }

  // Por fornecedor: o que ficou em aberto de cada um (fechado até clicar). Clicar no nome filtra a lista de cima.
  function desenharFornecedores() {
    const r = P.r;
    const lista = r.porFornecedor.slice().sort((a, b) => (b.osDoisLados ? 1 : 0) - (a.osDoisLados ? 1 : 0) || Math.abs(b.saldo) - Math.abs(a.saldo));
    P.el.querySelector('#p4-fornecedores').innerHTML = '<details class="cartao corpo" style="margin-top:18px"' + (P.fornecedoresAberto ? ' open' : '') + ' id="p4-det-forn">' +
      '<summary><b>Por ' + T.esc(rotulos().pessoa) + '</b> · o que ficou em aberto de cada um (' + lista.length.toLocaleString('pt-BR') + ')' +
      (r.totais.fornecedoresComOsDoisLados ? ' · <span class="selo suspeita">' + r.totais.fornecedoresComOsDoisLados + ' com débito e crédito em aberto</span>' : '') + '</summary>' +
      '<p class="suave pequeno" style="margin:8px 0">Os que têm os dois lados em aberto vêm primeiro: é onde o pagamento não casou com a nota. Clique no nome para filtrar a lista de cima.</p>' +
      '<div id="p4-tab-forn"></div></details>';
    T.tabelaPaginada(P.el.querySelector('#p4-tab-forn'), {
      alta: true, porPagina: 200,
      ordem: { id: 'p4-fornecedores', colunas: [TXT((g) => g.nome), NUM((g) => g.qtdCredito), VALOR((g) => g.credito), NUM((g) => g.qtdDebito), VALOR((g) => g.debito), VALOR((g) => g.saldo)] },
      cabecalho: '<th>' + (cliente() ? 'Cliente' : 'Fornecedor') + '</th><th class="num">Lanç. ' + (cliente() ? 'a débito' : 'a crédito') + '</th><th class="num">' + (cliente() ? 'A débito' : 'A crédito') + '</th><th class="num">Lanç. ' + (cliente() ? 'a crédito' : 'a débito') + '</th><th class="num">' + (cliente() ? 'A crédito' : 'A débito') + '</th><th class="num">Saldo em aberto</th>',
      linhas: lista, vazio: 'Nada em aberto.',
      linha: (g) => '<tr class="' + (g.osDoisLados ? 'destaque-dois-lados' : '') + '"><td class="nome">' +
        (g.chave === SEM() ? '<span class="falta">sem fornecedor</span>' : '<button type="button" class="lapis forte" data-filtrar-forn="' + T.esc(g.nome) + '" title="Filtrar a lista de cima por este fornecedor">' + T.esc(g.nome) + '</button>') +
        (g.cnpj ? ' <span class="suave pequeno">' + T.esc(U.formatarCnpj(g.cnpj)) + '</span>' : '') +
        (g.osDoisLados ? ' <span class="selo suspeita" title="Débito e crédito do mesmo fornecedor que não casaram: pagamento com valor diferente, parcial ou nome diferente">débito e crédito em aberto</span>' : '') + '</td>' +
        '<td class="num">' + g.qtdCredito + '</td>' + T.tdValor(g.credito) + '<td class="num">' + g.qtdDebito + '</td>' + T.tdValor(g.debito) + tdDC(g.saldo) + '</tr>',
    });
  }

  // ------------------------------------------------------------------
  // Cliques e filtros
  // ------------------------------------------------------------------
  function redesenharListas() {
    desenharParte();
    desenharLista();
    ligarCampos();
  }
  function ligar() { ligarCampos(); }
  // Os campos nascem a cada desenho (o quadro de arquivos, a busca e os filtros das colunas).
  function ligarCampos() {
    raiz.TelaSubir.ligar(P.el.querySelector('.arquivos-passo'), P.codigo, lugaresDoPasso4(P.comp, P.arqs, P.fam.id));
    raiz.TelaSubir.ligarBotao(P.el.querySelector('[data-abrir-arquivos]'));
    P.el.querySelectorAll('[data-filtro]').forEach((campo) => {
      const nome = campo.getAttribute('data-filtro');
      if (campo.tagName === 'SELECT') campo.addEventListener('change', () => { P.filtros[nome] = campo.value; redesenharListas(); });
      else campo.addEventListener('input', T.debounce(() => { P.filtros[nome] = campo.value; redesenharListas(); const c = P.el.querySelector('[data-filtro="' + nome + '"]'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 300));
    });
  }
  // Os cliques ficam no contêiner da tela, UMA vez (ligar a cada desenho somaria um ouvinte por redesenho).
  function ligarUmaVez() {
    P.el.addEventListener('click', async (ev) => {
      const ver = ev.target.closest('[data-ver-batida]');
      if (ver) {
        const n = Number(ver.getAttribute('data-ver-batida'));
        const b = P.batidaDoNumero.get(n);
        if (b) { P.abertos.add(b.id); redesenharListas(); const linha = P.el.querySelector('#p4-b-' + n); if (linha && linha.scrollIntoView) linha.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        return;
      }
      const ab = ev.target.closest('[data-abrir-batida]');
      if (ab) {
        const b = P.batidaDoNumero.get(Number(ab.getAttribute('data-abrir-batida')));
        if (b) { if (P.abertos.has(b.id)) P.abertos.delete(b.id); else P.abertos.add(b.id); desenharListaMantendoRolagem(); }
        return;
      }
      const rg = ev.target.closest('[data-regra]');
      if (rg) { await alternarRegra(rg.getAttribute('data-regra')); return; }
      const ff = ev.target.closest('[data-filtrar-forn]');
      if (ff) { P.filtros.forn = ff.getAttribute('data-filtrar-forn'); P.filtros.mostrar = P.filtros.mostrar === 'conciliados' ? '' : P.filtros.mostrar; desenharFiltros(); redesenharListas(); const p = P.el.querySelector('#p4-parte'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if (ev.target.closest('[data-limpar-filtros]')) { CAMPOS.forEach((n) => { P.filtros[n] = ''; }); redesenharListas(); return; }
      const acao = ev.target.closest('[data-acao]');
      if (!acao) return;
      const a = acao.getAttribute('data-acao');
      if (a === 'excel') baixarExcel();
      if (a === 'trocar-contas') await raiz.TelaSubir.doDiario(P.codigo, lugaresDoPasso4(P.comp, P.arqs, P.fam.id));
    });
    P.el.addEventListener('toggle', (ev) => { if (ev.target && ev.target.id === 'p4-det-forn') P.fornecedoresAberto = ev.target.open; }, true);
  }
  function desenharListaMantendoRolagem() {
    const c = document.getElementById('conteudo');
    const y = c ? c.scrollTop : 0;
    desenharParte();
    desenharLista();
    ligarCampos();
    if (c) c.scrollTop = y;
  }

  // ------------------------------------------------------------------
  // Excel
  // ------------------------------------------------------------------
  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' },
    sub: { cor: 'FF5F6B7A', italico: true },
    txt: {},
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true, borda: { baixo: { cor: 'FF1F4E78' } } },
    cabNum: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', alinh: 'right', vert: 'center', quebra: true },
    data: { alinh: 'center' },
    val: { formato: 'dinheiro' },
    tot: { negrito: true, fundo: 'FFDDEBF7', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    totVal: { negrito: true, fundo: 'FFDDEBF7', formato: 'dinheiro', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    grp: { negrito: true, fundo: 'FFE7EEF5' },
    grpVal: { negrito: true, fundo: 'FFE7EEF5', formato: 'dinheiro' },
  };
  const reais = (c) => Math.round(Number(c) || 0) / 100;
  const cel = (v, e) => ({ v: v === undefined ? null : v, e: e || 'txt' });
  function baixarExcel() {
    const r = P.r, t = r.totais, emp = P.emp;
    const mes = U.nomeCompetencia(P.comp);
    const sub = emp.codigo + ' · ' + emp.nome + ' · ' + mes + ' · razão até ' + U.fimDaCompetencia(P.comp).texto;
    const planilhas = [];
    // Resumo
    const res = [{ celulas: [cel('Fornecedores · somente razão (Passo ④)', 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null,
      { celulas: [cel('Conta', 'cab'), cel('Lançamentos', 'cabNum')], altura: 20 }];
    P.F.forEach((x) => res.push({ celulas: [cel(x.conteudo.conta.codigo + ' ' + x.conteudo.conta.nome + (x.meta.origem === 'diario' ? ' (do livro diário)' : '')), cel(x.conteudo.conta.lancamentos.length)] }));
    res.push(null);
    res.push({ celulas: [cel('Resumo', 'cab'), cel('Lançamentos', 'cabNum'), cel('Valor', 'cabNum'), cel('D/C', 'cab')], altura: 20 });
    res.push({ celulas: [cel('Saldo anterior (sem detalhe por fornecedor)'), cel(null), cel(reais(Math.abs(t.saldoAnterior)), 'val'), cel(t.saldoAnterior ? dcDe(t.saldoAnterior) : '')] });
    res.push({ celulas: [cel('Conciliados dentro do razão (' + t.batidas + ' conciliações)'), cel(t.bateram), cel(0, 'val'), cel('')] });
    res.push({ celulas: [cel('A crédito em aberto (nota sem pagamento)'), cel(t.credito.qtd), cel(reais(t.credito.valor), 'val'), cel('C')] });
    res.push({ celulas: [cel('A débito em aberto (pagamento sem nota)'), cel(t.debito.qtd), cel(reais(t.debito.valor), 'val'), cel('D')] });
    res.push({ celulas: [cel('Saldo do razão', 'tot'), cel(t.linhas, 'tot'), cel(reais(Math.abs(t.saldoFinal)), 'totVal'), cel(dcDe(t.saldoFinal), 'tot')] });
    res.push(null);
    res.push({ celulas: [cel(r.invariantes.ok ? 'Conferido: cada conciliação soma zero e saldo anterior + crédito − débito em aberto = saldo do razão.' : 'A conferência falhou: ' + r.invariantes.falhas.join(' / '), 'sub')] });
    planilhas.push({ nome: 'Resumo', colunas: [60, 14, 18, 6], linhas: res });
    // Lançamentos: todos, com a situação e o ID (a mesma lista da tela)
    const l = [{ celulas: [cel('Lançamentos do razão de fornecedores', 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null];
    const cabL = l.push({ celulas: ['Situação', 'ID', 'Como', 'Data', 'Conta', 'Documento', 'Fornecedor', 'CNPJ', 'Histórico', 'Valor', 'D/C'].map((x, k) => cel(x, k === 9 ? 'cabNum' : 'cab')), altura: 20 });
    r.linhas.slice().sort((a, b) => a.dia - b.dia || a.i - b.i).forEach((x) => {
      const b = P.batidaDaLinha.get(x.i);
      l.push({ celulas: [cel(b ? 'conciliado' : 'em aberto'), cel(b ? P.numeroDaBatida.get(b.id) : null), cel(b ? b.como : ''), cel(x.data, 'data'), cel(x.conta), cel(docDe(x)), cel(nomeDe(x)),
        cel(x.dono.cnpj ? U.formatarCnpj(x.dono.cnpj) : ''), cel(x.historico), cel(reais(Math.abs(x.valor)), 'val'), cel(dcDe(x.valor))] });
    });
    l.push({ celulas: [cel('Em aberto', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel(t.credito.qtd + ' a crédito · ' + t.debito.qtd + ' a débito', 'tot'), cel('', 'tot'), cel('', 'tot'),
      cel(reais(Math.abs(t.credito.valor - t.debito.valor)), 'totVal'), cel(dcDe(t.credito.valor - t.debito.valor), 'tot')] });
    planilhas.push({ nome: 'Lançamentos', colunas: [12, 7, 9, 11, 8, 14, 40, 19, 70, 15, 5], linhas: l, congelar: { linhas: cabL, colunas: 0 }, repetir: [cabL, cabL], paisagem: true,
      rodape: emp.nome + ' · somente razão · ' + mes });
    // Conciliações com ID
    const b2 = [{ celulas: [cel('Conciliações com ID (o que casou dentro do razão)', 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null];
    const cabB = b2.push({ celulas: ['ID', 'Como', 'Fornecedor', 'Data', 'Documento', 'Histórico', 'Valor', 'D/C'].map((x, k) => cel(x, k === 6 ? 'cabNum' : 'cab')), altura: 20 });
    r.batidas.slice().sort((x, y) => P.numeroDaBatida.get(x.id) - P.numeroDaBatida.get(y.id)).forEach((bt) => {
      bt.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i).forEach((x) => b2.push({ celulas: [cel(P.numeroDaBatida.get(bt.id)), cel(bt.como), cel(nomeDe(x)), cel(x.data, 'data'),
        cel(docDe(x)), cel(x.historico), cel(reais(Math.abs(x.valor)), 'val'), cel(dcDe(x.valor))] }));
    });
    planilhas.push({ nome: 'Conciliações', colunas: [7, 10, 40, 11, 14, 70, 15, 5], linhas: b2, congelar: { linhas: cabB, colunas: 0 }, repetir: [cabB, cabB], paisagem: true,
      rodape: emp.nome + ' · conciliações · ' + mes });
    // Por fornecedor
    const g = [{ celulas: [cel('Por fornecedor · o que ficou em aberto', 'tit')], altura: 22 }, { celulas: [cel(sub + ' · clique no + à esquerda para ver os lançamentos', 'sub')] }, null];
    const cabG = g.push({ celulas: ['Fornecedor', 'CNPJ', 'Lanç. a crédito', 'A crédito', 'Lanç. a débito', 'A débito', 'Saldo', 'D/C', 'Débito e crédito em aberto'].map((x, k) => cel(x, k >= 2 && k <= 6 ? 'cabNum' : 'cab')), altura: 30 });
    r.porFornecedor.forEach((f) => {
      g.push({ celulas: [cel(f.nome, 'grp'), cel(f.cnpj ? U.formatarCnpj(f.cnpj) : '', 'grp'), cel(f.qtdCredito, 'grp'), cel(reais(f.credito), 'grpVal'), cel(f.qtdDebito, 'grp'), cel(reais(f.debito), 'grpVal'),
        cel(reais(Math.abs(f.saldo)), 'grpVal'), cel(f.saldo ? dcDe(f.saldo) : '', 'grp'), cel(f.osDoisLados ? 'sim' : '', 'grp')], recolhida: true });
      f.linhas.map((i) => r.linhas[i]).sort((a, c) => a.dia - c.dia || a.i - c.i).forEach((x) => g.push({ celulas: [cel('   ' + x.data + ' · ' + x.historico), null, null, cel(x.valor > 0 ? reais(x.valor) : null, 'val'), null,
        cel(x.valor < 0 ? reais(-x.valor) : null, 'val')], nivel: 1, escondida: true }));
    });
    planilhas.push({ nome: 'Por fornecedor', colunas: [70, 19, 12, 15, 12, 15, 15, 5, 14], linhas: g, congelar: { linhas: cabG, colunas: 0 }, repetir: [cabG, cabG], resumoAcima: true, paisagem: true,
      rodape: emp.nome + ' · por fornecedor · ' + mes });
    const bytes = raiz.ExcelBonito.gerar({ planilhas, estilos: ESTILOS, ativa: 1 });
    T.baixar(bytes, U.nomeSeguro('Fornecedores somente razao ' + emp.codigo + ' ' + emp.nome + ' ' + U.anoMes(P.comp), 100) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app().armazenamento.registrarNoLog({ codigo: P.codigo, acao: 'somente-razao-excel', alvo: 'fornecedores/' + U.anoMes(P.comp), detalhe: t.credito.qtd + ' a crédito · ' + t.debito.qtd + ' a débito' }).catch(() => {});
  }

  raiz.TelaPasso4 = { mostrar, estado: () => P };
})(self);
