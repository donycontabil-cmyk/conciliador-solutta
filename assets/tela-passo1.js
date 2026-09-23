/*
 * Conciliador Solutta — tela-passo1.js
 * A tela do Passo ① — a conta principal × o adiantamento da família aberta (Fornecedores ou Clientes; Parte 7.2 e 7.3).
 * O programa faz o braçal; O CONTADOR DECIDE: toda sugestão pode ser desmarcada, toda
 * batida pode ser desfeita ("✕ Não confere"), e dá para reclassificar e trocar o
 * fornecedor à mão. Grava sozinho a cada decisão e mostra "guardado às 14:23".
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = raiz.MotorFechamento;
  const MN = raiz.MotorNomes;
  const SEM = MN.SEM_FORNECEDOR;

  function app() { return raiz.App; }

  // A família aberta (Fornecedores ou Clientes) e os textos dela — Dony, 22/09/2026: "clientes tem que ter o mesmo
  // menu e todas as conciliações de fornecedores; só muda a conta, e a natureza de uma é credora e a da outra é devedora".
  // O motor já tem as duas naturezas (MotorFechamento.TEXTOS): em fornecedores o crédito aumenta o saldo; em clientes, o débito.
  function familiaAberta() { return (E && E.fam) || raiz.Familias.familia('fornecedores'); }
  function TX() {
    const f = familiaAberta();
    const t = M.TEXTOS[f.natureza] || M.TEXTOS.fornecedores;
    const cliente = f.id === 'clientes';
    return { fam: f, F: t.F, A: t.A, f: f.contas.principal, a: f.contas.adiantamento,
      pessoa: cliente ? 'cliente' : 'fornecedor', pessoas: cliente ? 'clientes' : 'fornecedores',
      curtoA: cliente ? 'Adiantamento de clientes' : 'Adiantamento', titulo: t.F + ' × ' + (cliente ? 'Adiantamento de clientes' : 'Adiantamento') };
  }
  function abas() {
    const x = TX();
    return [
      { id: 'bateuF', titulo: '1 · Bateu no razão · ' + x.F },
      { id: 'bateuA', titulo: '1 · Bateu no razão · ' + x.curtoA },
      { id: 'reclass', titulo: '2 · Reclassificações' },
      { id: 'naoF', titulo: 'Não bateu · ' + x.F },
      { id: 'naoA', titulo: 'Não bateu · ' + x.curtoA },
      { id: 'fornF', titulo: 'Por ' + x.pessoa + ' · ' + x.F },
      { id: 'fornA', titulo: 'Por ' + x.pessoa + ' · ' + x.curtoA },
      { id: 'razao', titulo: 'Razão completo' },
    ];
  }
  const NAO_BATEU = ['sem-par', 'parcial', 'recusada', 'sem-fornecedor'];

  let E = null; // estado da tela aberta

  // ------------------------------------------------------------------
  // Abrir
  // ------------------------------------------------------------------
  // Os dados do ① de uma competência: arquivos, registro com as decisões e a entrada do motor. Serve também
  // o 1.3 (razão limpo), que parte do mesmo cálculo. null = outra tela foi aberta no meio do caminho.
  async function carregarDados(codigo, anoMes, conferir, familiaId) {
    const arm = app().armazenamento;
    const fam = raiz.TelaFamilia.familiaDe(familiaId);
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) return { erro: 'Empresa não cadastrada.' };
    const comp = anoMes + '-01';
    const concs = await arm.conciliacoes(codigo, comp);
    const metas = await arm.arquivos(codigo);
    if (conferir && !conferir()) return null;
    const arqs = raiz.TelaFamilia.arquivosDoPasso1(metas, comp, fam.id);
    // Subir continua liberado com o checklist pendente; a conciliação, não (Parte 7.1).
    const checklist = concs.find((c) => c.id === raiz.TelaFamilia.idChecklist(codigo, comp, fam.id));
    const checklistOk = raiz.TelaFamilia.checklistCompleto(checklist);
    const falta = !arqs.F.length || !arqs.A.length;
    const dados = { emp, comp, arqs, checklistOk, falta, fam };
    if (!checklistOk || falta) return dados;
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const F = await Promise.all(arqs.F.map(carregar));
    const A = await Promise.all(arqs.A.map(carregar));
    const pagar = arqs.pagar ? await carregar(arqs.pagar) : null;
    if (conferir && !conferir()) return null;
    const idReg = raiz.TelaFamilia.idPasso1(codigo, comp, fam.id);
    const registro = concs.find((c) => c.id === idReg) || {
      id: idReg, codigo, tipo: raiz.TelaFamilia.tipoDoPasso(fam, 'passo1'), competencia: comp, situacao: 'andamento', arquivos: [], decisoes: {}, resumo: {},
    };
    const d = registro.decisoes || {};
    const fonte = (x) => ({ arquivoId: x.meta.id, conta: x.conteudo.conta, saldoAnterior: x.conteudo.conta.saldoAnterior,
      saldoFinal: x.conteudo.conta.saldoFinalDeclarado, lancamentos: x.conteudo.conta.lancamentos, periodo: x.conteudo.periodo });
    const periodos = F.concat(A).map((x) => x.conteudo.periodo).filter(Boolean);
    const menor = periodos.map((p) => U.lerData(p.de)).filter(Boolean).sort((a, b) => a.numero - b.numero)[0];
    const maior = periodos.map((p) => U.lerData(p.ate)).filter(Boolean).sort((a, b) => b.numero - a.numero)[0];
    return Object.assign(dados, {
      registro, arquivos: { F, A, pagar },
      entrada: {
        natureza: fam.natureza, competencia: comp,
        periodo: menor && maior ? { de: menor.texto, ate: maior.texto } : null,
        contas: { F: F.map(fonte), A: A.map(fonte) },
        titulos: pagar ? pagar.conteudo.titulos : [],
      },
      decisoes: {
        recusadas: d.recusadas || [], aceitas: d.aceitas || [], manuais: d.manuais || [], desfeitas: d.desfeitas || [],
        donos: d.donos || {}, historico: d.historico || [],
        // As regras ligadas e as conciliações feitas à mão também são decisão: têm que voltar quando a tela reabre.
        regras: d.regras || null, batidasAMao: d.batidasAMao || [],
      },
    });
  }

  async function mostrar(el, codigo, anoMes, conferir, familiaId) {
    const comp = anoMes + '-01';
    const fam = raiz.TelaFamilia.familiaDe(familiaId);
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/' + fam.id + '/' + anoMes;
    T.carregando(el, 'Abrindo o Passo ① de ' + U.nomeCompetencia(comp) + '…');
    // O livro diário é o razão (Dony, 22/09/2026: "se eu carreguei o diário, automaticamente ele tem que entender que o
    // diário é o razão; eu quero poder selecionar quais são as contas"): com as contas escolhidas, o razão delas sai do
    // diário antes de abrir (só o que mudou). Conta com razão carregado continua com o razão.
    const sinc = await sincronizarComODiario(codigo, comp, conferir, fam.id);
    if (!sinc) return;
    const dados = await carregarDados(codigo, anoMes, conferir, fam.id);
    if (!dados) return;
    if (dados.erro) { el.innerHTML = '<div class="aviso ambar">' + T.esc(dados.erro) + ' <a href="#/">Voltar</a></div>'; return; }
    const { emp, arqs, checklistOk, falta } = dados;
    // Os arquivos sobem AQUI, cada um no seu lugar (Dony, 15/09/2026: "tem que ser em todas").
    if (!checklistOk || falta) {
      // Falta razão e há diário guardado: a escolha das contas (ou o que falta para o diário servir) no lugar do "suba o razão".
      const S = raiz.TelaSubir;
      const doDiario = falta && sinc.prep ? (sinc.prep.ok ? (sinc.estado === 'escolher' ? S.cartaoDaEscolha(sinc.prep) : '')
        : '<div class="aviso ambar" style="margin-bottom:12px"><span class="icone-aviso">📒</span><div>' + S.textoSemDiario(codigo, sinc.prep, comp) + '</div></div>') : '';
      const extras = [S.lugarDoBalanceteDoDiario(falta ? sinc.prep : null)].filter(Boolean);
      el.innerHTML = '<a class="voltar" href="' + voltar + '">← ' + T.esc(fam.titulo.replace(/ ·.*$/, '')) + ' · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="cabecalho"><div class="titulos"><h1>Passo ① · ' + T.esc(M.TEXTOS[fam.natureza].F + ' × ' + (fam.id === 'clientes' ? 'Adiantamento de clientes' : 'Adiantamento')) + '</h1>' +
        '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + U.nomeCompetencia(comp) + '</p></div></div>' +
        (checklistOk ? '' : '<div class="aviso ambar" style="margin-bottom:12px"><span class="icone-aviso">🔒</span><div><b>A conciliação espera o checklist "Antes de conciliar".</b><br>' +
          'Marque que os bancos foram conciliados e que as notas fiscais de entrada subiram. <a href="' + voltar + '">Ir para o checklist</a>' +
          (falta ? ' — os arquivos já podem subir aqui embaixo.' : '') + '</div></div>') +
        (doDiario || (falta ? '<div class="aviso info" style="margin-bottom:12px"><span class="icone-aviso">📁</span><div><b>Suba cada razão no seu lugar.</b> ' +
          'O programa sabe o que é pelo lugar onde você coloca. Falta: ' + [!arqs.F.length ? 'o razão de ' + fam.contas.principal : '', !arqs.A.length ? 'o razão de ' + fam.contas.adiantamento : ''].filter(Boolean).join(' e ') + '.</div></div>' : '')) +
        painelDoPasso1(codigo, comp, arqs, true, extras, fam.id);
      ligarPainelDoPasso1(el.querySelector('.arquivos-passo'), codigo, comp, arqs, extras, fam.id);
      S.ligarCartaoDaEscolha(el.querySelector('.escolha-diario'), codigo, sinc.prep);
      return;
    }
    const registro = dados.registro;

    // A tela mora num contêiner próprio: ao sair dela, o contêiner some junto com os eventos.
    el.innerHTML = '<div class="tela-passo1"></div>';
    E = {
      el: el.firstChild, codigo, comp, emp, voltar, registro, fam,
      arquivos: dados.arquivos,
      entrada: dados.entrada,
      decisoes: dados.decisoes,
      cache: {},
      aba: app().lerLocal('conciliador-solutta.aba-passo1') || 'bateuF',
      filtros: {},
      selecao: new Set(),
      abertos: new Set(),
      guardadoEm: registro.atualizadoEm || null,
      fila: Promise.resolve(),
    };
    if (!abas().some((a) => a.id === E.aba)) E.aba = 'bateuF';
    E.arqs = arqs;
    calcular();
    desenharTudo();
  }

  // Os lugares de arquivo do Passo ①: um razão de fornecedores e um de adiantamento (cada um pode
  // ter mais de uma conta) e, opcional, o contas a pagar em aberto (ajuda a reconhecer os nomes).
  function lugaresDoPasso1(comp, arqs, familiaId) {
    const fam = raiz.TelaFamilia.familiaDe(familiaId || (E && E.fam && E.fam.id));
    const mes = U.nomeCompetencia(comp);
    const ate = { de: null, ate: comp };
    const maiuscula = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
    const aberto = fam.id === 'clientes' ? 'contas a receber em aberto' : 'contas a pagar em aberto';
    return [
      { id: 'F', parte: 'Contabilidade', titulo: 'Razão de ' + fam.contas.principal, sub: mes, nome: 'razão de ' + fam.contas.principal + ' de ' + mes, log: 'passo1/' + fam.contas.principal,
        tipo: 'razao', familia: fam.id, papel: 'principal', varias: true, competencia: comp, periodo: ate, nomePeriodo: 'até o fim de ' + mes, arquivos: arqs.F },
      { id: 'A', parte: 'Contabilidade', titulo: 'Razão de ' + fam.contas.adiantamento, sub: mes, nome: 'razão de ' + fam.contas.adiantamento + ' de ' + mes, log: 'passo1/adiantamento',
        tipo: 'razao', familia: fam.id, papel: 'adiantamento', varias: true, competencia: comp, periodo: ate, nomePeriodo: 'até o fim de ' + mes, arquivos: arqs.A },
      { id: 'pagar', parte: 'Financeiro · opcional', titulo: maiuscula(aberto), sub: mes + ' · ajuda a reconhecer os nomes', nome: aberto + ' de ' + mes, log: 'passo1/pagar',
        tipo: (fam.tipoFinanceiro || {}).principal, opcional: true, competencia: comp, arquivos: arqs.pagar ? [arqs.pagar] : [] },
    ];
  }

  // Empresa de demonstração: os razões de exemplo sobem direto nos lugares.
  function eDemonstracao(codigo) {
    return !!(app().demonstracao && raiz.Demonstracao && String(raiz.Demonstracao.EMPRESA.codigo) === String(codigo));
  }

  function chaveDoPainel1(codigo, comp, familiaId) { return codigo + '|passo1|' + (familiaId || 'fornecedores') + '|' + comp; }

  // A linha do cabeçalho quando o razão sai do livro diário, com o botão de trocar as contas (data-acao="trocar-contas").
  function linhaDoDiario(lugares) {
    const resumo = raiz.TelaSubir.resumoDoDiario(lugares);
    return resumo ? '<p class="pequeno diario-no-passo">📒 Do livro diário: ' + T.esc(resumo) +
      ' · <button type="button" class="lapis forte" data-acao="trocar-contas" title="Escolher as contas que saem do livro diário (a escolha fica guardada na empresa)">✎ Trocar as contas</button></p>' : '';
  }

  // Os lugares de razão do ① com o que está guardado, sincronizados com o livro diário (TelaSubir.sincronizarDoDiario).
  // Serve também o 1.3 e o ④ (o mesmo razão de fornecedores). null = outra tela foi aberta no meio do caminho.
  async function sincronizarComODiario(codigo, comp, conferir, familiaId) {
    try {
      const metas = await app().armazenamento.arquivos(codigo);
      if (conferir && !conferir()) return null;
      const sinc = await raiz.TelaSubir.sincronizarDoDiario(codigo, lugaresDoPasso1(comp, raiz.TelaFamilia.arquivosDoPasso1(metas, comp, familiaId), familiaId));
      if (conferir && !conferir()) return null;
      return sinc;
    } catch (e) {
      T.avisoRapido('Livro diário: ' + T.mensagemDeErro(e), 'erro', 8000);
      return { estado: 'erro', mudou: false };
    }
  }

  // fixo = sempre à vista, sem "Fechar" (tela de falta de arquivo ou do checklist).
  // extras: lugares a mais (o balancete que dá o saldo inicial do livro diário, quando falta).
  function painelDoPasso1(codigo, comp, arqs, fixo, extras, familiaId) {
    return raiz.TelaSubir.painel({
      chave: chaveDoPainel1(codigo, comp, familiaId), titulo: 'Arquivos do passo', resumo: U.nomeCompetencia(comp), fixo, lugares: lugaresDoPasso1(comp, arqs, familiaId).concat(extras || []), metas: arqs.metas,
      depois: eDemonstracao(codigo)
        ? '<div class="linha-flex" style="margin-top:10px"><button type="button" class="botao" data-exemplo>🧪 Usar os razões de exemplo</button>' +
          '<span class="suave pequeno">Os razões de fornecedores e de adiantamento da empresa de demonstração (janeiro a julho/2026), com fornecedores, CNPJs e valores inventados.</span></div>'
        : '',
    });
  }

  function ligarPainelDoPasso1(el, codigo, comp, arqs, extras, familiaId) {
    if (!el) return;
    const lugares = lugaresDoPasso1(comp, arqs, familiaId).concat(extras || []);
    raiz.TelaSubir.ligar(el, codigo, lugares);
    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-exemplo]');
      if (!b) return;
      b.disabled = true;
      const razoes = raiz.Demonstracao.gerarRazoes();
      const arquivo = (x) => new File([x.bytes], x.nome, { type: 'application/vnd.ms-excel' });
      const f = await raiz.TelaSubir.subir(codigo, lugares[0], arquivo(razoes[0]), { semRota: true });
      const a = await raiz.TelaSubir.subir(codigo, lugares[1], arquivo(razoes[1]), { semRota: true });
      if (f || a) app().mostrarRota(); else b.disabled = false;
    });
  }

  function calcular() {
    E.entrada.decisoes = E.decisoes;
    E.r = M.calcularPasso1(E.entrada, E.cache);
    E.porDigital = new Map(E.r.linhas.map((l) => [l.digital, l]));
    E.batidaPorId = new Map(E.r.batidas.map((b) => [b.id, b]));
  }

  // ------------------------------------------------------------------
  // Gravar (cada decisão) — fila para não gravar por cima
  // ------------------------------------------------------------------
  function gravar(acao, alvo, detalhe) {
    E.fila = E.fila.then(async () => {
      const arm = app().armazenamento;
      const reg = Object.assign({}, E.registro, {
        situacao: 'andamento',
        arquivos: E.arquivos.F.concat(E.arquivos.A).map((x) => x.meta.id).concat(E.arquivos.pagar ? [E.arquivos.pagar.meta.id] : []),
        decisoes: E.decisoes,
        resumo: E.r.resumo,
      });
      try {
        E.registro = await arm.salvarConciliacao(reg);
        E.guardadoEm = E.registro.atualizadoEm;
        if (acao) await arm.registrarNoLog({ codigo: E.codigo, acao, alvo: alvo || E.registro.id, detalhe: detalhe || '' });
        const g = E.el.querySelector('#guardado');
        if (g) g.textContent = 'guardado às ' + U.horaLocal(E.guardadoEm);
      } catch (e) {
        T.avisoRapido('Não foi possível gravar: ' + T.mensagemDeErro(e), 'erro');
      }
    });
    return E.fila;
  }

  function historico(texto) {
    E.decisoes.historico = (E.decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome, texto }]).slice(-200);
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenharTudo() {
    const r = E.r;
    const contaTxt = (lista) => lista.map((x) => T.esc(x.conteudo.conta.codigo + ' ' + x.conteudo.conta.nome) + ' <span class="suave">(' +
      x.conteudo.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.)</span>').join(', ');
    E.el.innerHTML =
      '<a class="voltar" href="' + E.voltar + '">← ' + T.esc(E.fam.titulo.replace(/ ·.*$/, '')) + ' · ' + U.nomeCompetencia(E.comp) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Passo ① · ' + T.esc(TX().titulo) + '</h1>' +
      '<p class="suave">' + T.esc(E.emp.codigo + ' · ' + E.emp.nome) + ' · ' + U.nomeCompetencia(E.comp) + '</p>' +
      '<p class="suave pequeno">' + T.esc(TX().F) + ': ' + contaTxt(E.arquivos.F) + ' · ' + T.esc(TX().curtoA) + ': ' + contaTxt(E.arquivos.A) +
      (E.arquivos.pagar ? ' · Contas a pagar: ' + E.arquivos.pagar.meta.titulos + ' títulos (ajuda a reconhecer nomes)' : '') + '</p>' +
      linhaDoDiario(lugaresDoPasso1(E.comp, E.arqs, E.fam.id)) + '</div>' +
      '<div class="linha-flex" style="gap:12px"><span class="guardado" id="guardado" title="Cada decisão é gravada na hora, sozinha">' + (E.guardadoEm ? 'guardado às ' + U.horaLocal(E.guardadoEm) : 'nenhuma decisão tomada ainda') + '</span>' +
      // 1.3 (Dony, 19/09/2026): o que sobra em cada conta depois deste passo, para imprimir e mandar.
      '<button type="button" class="botao" data-acao="razao-limpo" title="1.3 · Razão limpo: só o que compõe o saldo de cada conta depois deste passo, por lançamento ou por fornecedor, para imprimir ou baixar em Excel">📄 1.3 Razão limpo</button>' +
      // Arquivos em cima à direita (Dony, 15/09/2026: "um lugar de carregar novos arquivos" e excluir).
      raiz.TelaSubir.botao(chaveDoPainel1(E.codigo, E.comp, E.fam.id)) + '</div></div>' +
      painelDoPasso1(E.codigo, E.comp, E.arqs, false, null, E.fam.id) +
      '<div id="avisos"></div>' +
      '<div class="grade-4" id="cartoes" style="margin-top:14px"></div>' +
      '<div id="regras"></div>' +
      '<div class="abas" id="abas" role="tablist"></div>' +
      '<div class="filtros" id="filtros"></div>' +
      '<div id="aba"></div>' +
      '<div id="barra"></div>';
    ligarPainelDoPasso1(E.el.querySelector('.arquivos-passo'), E.codigo, E.comp, E.arqs, null, E.fam.id);
    raiz.TelaSubir.ligarBotao(E.el.querySelector('[data-abrir-arquivos]'));
    desenharAvisos();
    desenharCartoes();
    desenharRegras();
    desenharAbas();
    desenharAba();
    ligarEventos();
    atualizarBarra();
    void r;
  }

  function desenharAvisos() {
    const r = E.r;
    const partes = [];
    const extras = r.batidas.filter((b) => b.regra === 'margem' || b.regra === 'valor').length;
    if (r.invariantes.ok) {
      partes.push('<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Conferido no centavo.</b> Cada batida soma zero; as sobras de cada ' + TX().pessoa + ' fecham com o saldo dele; ' +
        'o em aberto de cada conta fecha com o saldo do razão mexido pelos ajustes; o total do arquivo de ajustes fecha com as reclassificações marcadas.' +
        (extras ? ' <b>' + extras + '</b> conciliação(ões) pelas regras opcionais (± com margem e ≈ só pelo valor): o que elas deixaram de diferença continua em aberto e entra nesta conta.' : '') + '</div></div>');
    } else {
      partes.push('<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>A conferência falhou — não use o arquivo de ajustes antes de revisar.</b><ul class="pequeno">' +
        r.invariantes.falhas.slice(0, 10).map((f) => '<li>' + T.esc(f) + '</li>').join('') + '</ul></div></div>');
    }
    const saF = r.totais.F.saldoAnterior, saA = r.totais.A.saldoAnterior;
    if (saF || saA) {
      partes.push('<div class="aviso ambar"><span class="icone-aviso">ℹ️</span><div><b>Primeiro fechamento, sem saldo de abertura por fornecedor.</b> ' +
        'O razão começa em ' + T.esc(r.periodo ? r.periodo.de : '—') + ' com saldo anterior de ' + T.moeda(saF) + ' em ' + T.esc(TX().f) + ' e ' + T.moeda(saA) + ' em adiantamento, sem dizer de qual ' + TX().pessoa + '. ' +
        'Um pagamento do começo do período pode quitar nota de antes dele e aparecer como fornecedor devedor: <b>confira as inversas antes de aceitar</b>. ' +
        'Com a planilha de saldo de abertura por fornecedor isso se resolve (formato a combinar).</div></div>');
    }
    const de = r.periodo && U.lerData(r.periodo.de);
    if (de && (de.mes !== U.partesCompetencia(E.comp).mes || de.ano !== U.partesCompetencia(E.comp).ano)) {
      partes.push('<div class="aviso info"><span class="icone-aviso">📅</span><div>Razão de vários meses (' + T.esc(r.periodo.de + ' a ' + r.periodo.ate) + '): ' +
        'o passo usa todos os lançamentos até ' + T.esc(U.fimDaCompetencia(E.comp).texto) + '.</div></div>');
    }
    if (r.foraDaCompetencia) {
      partes.push('<div class="aviso ambar"><span class="icone-aviso">📅</span><div>' + r.foraDaCompetencia + ' lançamento(s) com data depois do fim da competência ficaram de fora deste passo.</div></div>');
    }
    const maoFora = r.aMaoQueNaoEncaixam || [];
    if (r.manuaisQueNaoEncaixam.length || r.desfeitasQueNaoEncaixam.length || maoFora.length) {
      partes.push('<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>Decisões que não encaixam mais</b> (nada foi apagado — confira):<ul class="pequeno">' +
        r.manuaisQueNaoEncaixam.map((x) => '<li>Reclassificação à mão "' + T.esc(x.manual.nome || x.manual.id) + '" de ' + T.esc(x.manual.quem || '') + ': ' + T.esc(x.motivo) + '</li>').join('') +
        maoFora.map((x) => '<li>Conciliação à mão ' + T.esc(x.grupo.id || '') + ' de ' + T.esc(x.grupo.quem || '') + ': ' + T.esc(x.motivo) + '</li>').join('') +
        r.desfeitasQueNaoEncaixam.map((x) => '<li>Batida desfeita ' + T.esc(x.desfeita.id) + ': ' + T.esc(x.motivo) + '</li>').join('') + '</ul></div></div>');
    }
    E.el.querySelector('#avisos').innerHTML = partes.join('');
  }

  function desenharCartoes() {
    const r = E.r;
    const t = r.totais;
    const cartaoConta = (lado, titulo) =>
      '<div class="cartao resumo"><div class="rotulo">' + titulo + '</div><div class="grande" title="Em aberto = saldo anterior + linhas que não bateram + efeito das reclassificações marcadas">' + T.moeda(t[lado].emAberto) + '</div>' +
      '<div class="detalhe"><span>em aberto depois dos ajustes</span><span><b>' + t[lado].linhas.toLocaleString('pt-BR') + '</b> linhas · <b>' + t[lado].bateram.toLocaleString('pt-BR') + '</b> bateram (' + t[lado].batidas.toLocaleString('pt-BR') + ' batidas) · <b>' +
      t[lado].sobraram.toLocaleString('pt-BR') + '</b> sobraram</span><span>saldo do razão ' + T.moeda(t[lado].saldoFinal) + ' · ajustes ' + T.moeda(t[lado].efeitoAjustes) + '</span></div></div>';
    const rs = r.resumo;
    E.el.querySelector('#cartoes').innerHTML =
      cartaoConta('F', TX().F + (TX().fam.id === 'clientes' ? ' (a receber)' : ' (a pagar)')) +
      cartaoConta('A', TX().A) +
      '<div class="cartao resumo"><div class="rotulo">Reclassificações</div><div class="grande">' + (rs.aceitas + rs.manuais) + ' marcadas</div>' +
      '<div class="detalhe"><span><span class="selo direta">diretas</span> <b>' + rs.diretas.qtd + '</b> · ' + T.moeda(rs.diretas.valor) + '</span>' +
      '<span><span class="selo inversa">inversas</span> <b>' + rs.inversas.qtd + '</b> · ' + T.moeda(rs.inversas.valor) + '</span>' +
      '<span><span class="selo suspeita">suspeitas desmarcadas</span> <b>' + rs.suspeitasDesmarcadas + '</b> · à mão <b>' + rs.manuais + '</b> · sugeridas <b>' + rs.sugeridas + '</b></span></div></div>' +
      '<div class="cartao resumo"><div class="rotulo">Arquivo de ajustes</div><div class="grande">' + T.moeda(rs.arquivo.total) + '</div>' +
      '<div class="detalhe"><span><b>' + rs.arquivo.lancamentos + '</b> lançamento(s) para importar no sistema contábil</span></div>' +
      '<div style="margin-top:10px"><button type="button" class="botao primario" data-acao="baixar"' + (rs.arquivo.lancamentos ? '' : ' disabled') + '>⬇ Baixar o arquivo de ajustes</button></div></div>';
  }

  function contadorDaAba(id) {
    const r = E.r;
    switch (id) {
      case 'bateuF': return r.batidas.filter((b) => b.lado === 'F').length;
      case 'bateuA': return r.batidas.filter((b) => b.lado === 'A').length;
      case 'reclass': return r.sugestoes.length + r.manuais.length;
      case 'naoF': return r.linhas.filter((l) => l.lado === 'F' && NAO_BATEU.indexOf(l.situacao) >= 0).length;
      case 'naoA': return r.linhas.filter((l) => l.lado === 'A' && NAO_BATEU.indexOf(l.situacao) >= 0).length;
      case 'fornF': return r.porFornecedor.F.length;
      case 'fornA': return r.porFornecedor.A.length;
      case 'razao': return r.linhas.length;
      default: return 0;
    }
  }

  function desenharAbas() {
    E.el.querySelector('#abas').innerHTML = abas().map((a) => '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' +
      T.esc(a.titulo) + '<span class="contador">' + contadorDaAba(a.id).toLocaleString('pt-BR') + '</span></button>').join('');
  }

  function filtro(nome, padrao) {
    const k = E.aba + '.' + nome;
    return E.filtros[k] !== undefined ? E.filtros[k] : (padrao || '');
  }

  function desenharFiltros(campos) {
    E.el.querySelector('#filtros').innerHTML = campos.map((c) => {
      if (c.tipo === 'busca') return '<input type="search" class="busca" data-filtro="' + c.nome + '" placeholder="' + T.esc(c.texto) + '" value="' + T.esc(filtro(c.nome)) + '">';
      return '<select class="filtro" data-filtro="' + c.nome + '" title="' + T.esc(c.texto) + '">' + c.opcoes.map((o) =>
        '<option value="' + o[0] + '"' + (filtro(c.nome) === o[0] ? ' selected' : '') + '>' + T.esc(o[1]) + '</option>').join('') + '</select>';
    }).join('') + (campos.some((c) => filtro(c.nome)) ? '<button type="button" class="botao leve pequeno" data-acao="limpar-filtros">Limpar filtros</button>' : '');
  }

  function combinaBusca(texto, ...campos) {
    const q = U.normalizarNome(texto);
    if (!q) return true;
    return campos.some((c) => U.normalizarNome(c).indexOf(q) >= 0);
  }

  function celulaDono(l) {
    const mao = l.dono.origem === 'mao';
    return '<td class="nome"><span class="dono">' + (l.dono.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(l.dono.nome)) +
      ' <button type="button" class="lapis" data-dono="' + T.esc(l.digital) + '" title="Trocar o fornecedor desta linha">✎</button></span>' +
      (mao ? '<br><span class="selo mao">✎ trocado à mão</span>' : '') +
      (l.dono.cnpj ? '<br><span class="suave pequeno">' + U.formatarCnpj(l.dono.cnpj) + '</span>' : '') + '</td>';
  }

  function obsDaLinha(l) {
    const partes = [];
    if (l.reclass) {
      partes.push('<span class="marca-reclass" title="Reclassificação do próprio sistema entre as duas contas: só marcada, NÃO é conciliação. Ela limpa uma conta e, na outra, bate com um valor que já existe ou fica em aberto.">⇄ ' +
        (l.reclass.sentido === 'foi-para' ? 'foi para ' : 'veio de ') + T.esc(l.reclass.conta) + '</span>');
    }
    if (l.batida) partes.push('<a href="#" data-ir-batida="' + T.esc(l.batida) + '" class="pequeno" title="Ver a batida desta linha">' + T.esc(l.batida) + '</a>');
    if (l.desfeita) partes.push('<span class="pilula ambar" title="Marcada como não confere: fica em aberto e não é casada com outras">✕ não confere</span>');
    if (l.fica !== null && l.fica !== undefined) partes.push('<span class="suave pequeno">fica ' + T.esc(U.formatarCentavos(l.fica)) + ' no fornecedor</span>');
    if (l.motivo === 'suspeita') partes.push('<span class="selo suspeita" title="O nome parece meio de pagamento: a inversa vem desmarcada">suspeita</span>');
    if (l.dono.aviso) partes.push('<span class="suave pequeno" title="' + T.esc(l.dono.aviso) + '">⚠ sobra do extrato</span>');
    return partes.join('<br>');
  }

  function desenharAba() {
    const alvo = E.el.querySelector('#aba');
    switch (E.aba) {
      case 'bateuF': case 'bateuA': return abaBatidas(alvo, E.aba === 'bateuF' ? 'F' : 'A');
      case 'reclass': return abaReclass(alvo);
      case 'naoF': case 'naoA': return abaNaoBateu(alvo, E.aba === 'naoF' ? 'F' : 'A');
      case 'fornF': case 'fornA': return abaPorFornecedor(alvo, E.aba === 'fornF' ? 'F' : 'A');
      case 'razao': return abaRazao(alvo);
      default: return null;
    }
  }

  // Colunas que ordenam ao clicar no título (T.tabelaPaginada, op.ordem).
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });
  // Débito e crédito ordenam pelo valor do lançamento: um débito de 200 fica junto de um crédito de 200.
  const valorDaLinha = (l) => (l.debito || 0) - (l.credito || 0);
  const nomeDoDono = (l) => (l.dono.chave === SEM ? '' : l.dono.nome);

  // ---------- 1 · Bateu no razão ----------
  function abaBatidas(alvo, lado) {
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor, histórico ou número da batida' },
      { tipo: 'select', nome: 'regra', texto: 'Conciliado por qual regra', opcoes: opcoesDeRegra() },
      { tipo: 'select', nome: 'como', texto: 'Como bateu', opcoes: [['', 'Todos os jeitos'], ['1x1', '1x1'], ['1xN', '1xN'], ['Nx1', 'Nx1'], ['zerou', 'zerou'], ['mesmo-dia', 'mesmo dia']] },
    ]);
    const r = E.r;
    const busca = filtro('busca');
    const como = filtro('como');
    const regra = filtro('regra');
    const desfeitas = E.decisoes.desfeitas.filter((d) => d.marcas.some((m) => { const l = E.porDigital.get(m); return l && l.lado === lado; }));
    const lista = r.batidas.filter((b) => b.lado === lado && (!como || b.como === como) && (!regra || b.regra === regra) && (!busca || b.id.indexOf(busca.toUpperCase()) >= 0 ||
      combinaBusca(busca, b.linhas.map((i) => r.linhas[i].dono.nome + ' ' + r.linhas[i].historico).join(' '))));
    const topo = desfeitas.length ? '<div class="aviso ambar" style="margin-bottom:10px"><span class="icone-aviso">✕</span><div><b>' + desfeitas.length + ' batida(s) marcada(s) como não confere</b> — as linhas estão em aberto e não são casadas com outras.<ul class="pequeno" style="margin:6px 0 0">' +
      desfeitas.map((d) => '<li>' + T.esc(d.id) + ' · ' + d.marcas.length + ' linhas · por ' + T.esc(d.quem) + ' em ' + U.dataHoraLocal(d.quando) +
        ' <button type="button" class="botao pequeno" data-voltar-bater="' + T.esc(d.id) + '">Voltar a bater</button></li>').join('') + '</ul></div></div>' : '';
    alvo.innerHTML = topo + '<div id="tabela-aba"></div>';
    const primeiraDa = (b) => b.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i)[0];
    T.tabelaPaginada(alvo.querySelector('#tabela-aba'), {
      ordem: { id: 'p1-batidas', colunas: [null, TXT((b) => b.regra), TXT((b) => b.como), TXT((b) => nomeDoDono(primeiraDa(b))), NUM((b) => b.linhas.length), VALOR((b) => b.valor),
        DATA((b) => primeiraDa(b).data), TXT((b) => b.id), null] },
      cabecalho: '<th style="width:28px"></th><th>Conciliado por</th><th>Como</th><th>' + T.esc(TX().pessoa.charAt(0).toUpperCase() + TX().pessoa.slice(1)) +
        '</th><th class="num">Linhas</th><th class="num">Valor</th><th>Datas</th><th>Batida</th><th></th>',
      linhas: lista,
      porPagina: 200,
      vazio: 'Nenhuma batida com estes filtros.',
      linha: (b) => {
        const ls = b.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i);
        const aberto = E.abertos.has(b.id);
        const nome = ls[0].dono.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(ls[0].dono.nome);
        let html = '<tr class="' + (aberto ? 'destaque' : '') + '" id="b-' + b.id + '"><td><button type="button" class="lapis" data-abrir="' + b.id + '" title="Ver as linhas">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td>' + seloRegra(b.regra) + (b.diferenca ? ' <span class="falta pequeno">dif. ' + T.moeda(Math.abs(b.diferenca)) + '</span>' : '') + '</td>' +
          '<td>' + T.seloComo(b.como) + '</td><td class="nome">' + nome + '</td><td class="num">' + ls.length + '</td>' + T.tdValor(b.valor) +
          '<td class="num">' + T.esc(ls[0].data + (ls.length > 1 && ls[ls.length - 1].data !== ls[0].data ? ' a ' + ls[ls.length - 1].data : '')) + '</td>' +
          '<td class="pequeno suave">' + T.esc(b.id) + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno perigo" data-nao-confere="' + b.id + '" title="As linhas voltam a ficar em aberto e não são casadas com outras">' +
          (b.regra === 'manual' ? '✕ Desfazer' : '✕ Não confere') + '</button></td></tr>';
        if (aberto) {
          html += ls.map((l) => '<tr class="sub"><td></td><td class="num">' + l.data + '</td><td class="historico" colspan="3">' + T.esc(l.historico) + '</td>' +
            T.tdValor(l.debito) + T.tdValor(l.credito) + '<td colspan="2">' + (l.reclass ? obsDaLinha(Object.assign({}, l, { batida: null })) : '<span class="suave pequeno">' + (l.valor > 0 ? 'forma o saldo' : 'baixa') + '</span>') + '</td></tr>').join('');
        }
        return html;
      },
    });
  }

  // ------------------------------------------------------------------
  // As REGRAS da conciliação dentro do razão (Dony, 22/09/2026: "eu quero aqueles três botõezinhos que tem no
  // fornecedor versus aging, e um quarto: conciliar por fornecedor e valor"). Cada botão LIGA ou DESLIGA a
  // regra e o passo recalcula na hora: ⚡ documento e fornecedor e 👤 fornecedor e valor vêm ligados (é o que o
  // ① sempre fez); ± com margem e ≈ só pelo valor só entram quando ele aperta, como no ③.
  // ------------------------------------------------------------------
  const CLASSE_REGRA = { documento: 'documento', 'fornecedor-valor': 'fornecedor', margem: 'margem', 'fornecedor-proximo': 'proximo', valor: 'valor', 'mesmo-dia': 'opcional', manual: 'mao' };
  const REGRA_AMAO = { icone: '✋', curto: 'à mão', nome: 'À mão', texto: 'Conciliação feita à mão: você marcou as linhas e disse que casam.' };
  function regrasLigadas() { return M.regrasDe(E.decisoes.regras); }
  function seloRegra(id) {
    const g = (id === 'manual' ? REGRA_AMAO : M.REGRA_DE[id]) || { icone: '', nome: id, texto: '' };
    return '<span class="selo ' + (CLASSE_REGRA[id] || 'opcional') + '" title="' + T.esc(g.texto) + '">' + g.icone + ' ' + T.esc(g.curto || g.nome) + '</span>';
  }
  function opcoesDeRegra() {
    return [['', 'Conciliado por: tudo']].concat(M.REGRAS.map((g) => [g.id, g.icone + ' ' + g.nome]))
      .concat([['mesmo-dia', '📅 Mesmo dia, sem ' + TX().pessoa], ['manual', '✋ À mão']]);
  }
  function desenharRegras() {
    const alvo = E.el.querySelector('#regras');
    if (alvo) alvo.innerHTML = barraDeRegras();
  }
  function barraDeRegras() {
    const r = E.r;
    const regras = regrasLigadas();
    const qtd = (id) => r.batidas.filter((b) => b.regra === id).length;
    const botao = (g) => {
      const ligada = !!regras[g.id];
      return '<button type="button" class="acao ' + CLASSE_REGRA[g.id] + (ligada ? '' : ' apagada') + '" data-regra="' + g.id + '" ' +
        'title="' + T.esc(g.texto + (ligada ? ' · Clique para DESLIGAR esta regra.' : ' · Clique para LIGAR esta regra.')) + '">' +
        '<span class="acao-icone" aria-hidden="true">' + g.icone + '</span>' +
        '<span class="acao-texto"><b>' + T.esc(g.nome) + '</b><small>' + T.esc(g.sub || g.curto) + '</small></span>' +
        '<span class="estado">' + (ligada ? qtd(g.id).toLocaleString('pt-BR') : 'ligar') + '</span></button>';
    };
    const t = { comMargem: { qtd: r.totais.F.comMargem.qtd + r.totais.A.comMargem.qtd, valor: r.totais.F.comMargem.valor + r.totais.A.comMargem.valor },
      soPeloValor: { qtd: r.totais.F.soPeloValor.qtd + r.totais.A.soPeloValor.qtd } };
    const md = qtd('mesmo-dia');
    const avisos = [
      t.comMargem.qtd ? '<span class="falta">± <b>' + t.comMargem.qtd + '</b> com margem: a diferença de ' + T.moeda(Math.abs(t.comMargem.valor)) + ' continua em aberto (confira uma a uma).</span>' : '',
      t.soPeloValor.qtd ? '<span class="falta">≈ <b>' + t.soPeloValor.qtd + '</b> só pelo valor: são de ' + TX().pessoas + ' diferentes — confira antes de usar o arquivo de ajustes.</span>' : '',
    ].filter(Boolean).join(' ');
    // O TOTAL vem primeiro (Dony, 22/09/2026: viu 110 no botão do documento e achou que tinha caído de 2.000 para 110 —
    // o 110 é só a fatia daquela regra; a soma dos botões é o total, que não mudou).
    const conciliadas = r.totais.F.bateram + r.totais.A.bateram;
    const linhasTodas = r.totais.F.linhas + r.totais.A.linhas;
    return '<div class="acoes-ab" style="margin:14px 0 0"><div class="rotulo-regras pequeno">Conciliação dentro do razão · total: <b>' +
      r.batidas.length.toLocaleString('pt-BR') + '</b> conciliações · <b>' + conciliadas.toLocaleString('pt-BR') + '</b> de ' + linhasTodas.toLocaleString('pt-BR') + ' linhas</div>' +
      '<div class="acoes-conciliar cinco">' + M.REGRAS.map(botao).join('') + '</div>' +
      '<p class="pequeno suave" style="margin:0">Cada botão mostra quantas conciliações saíram pela <b>regra dele</b> (a soma dá o total aí em cima) e liga ou desliga a regra, recalculando na hora; a lista fica em <b>1 · Bateu no razão</b>, com o filtro <b>Conciliado por</b>. ' +
      (md ? '📅 <b>' + md + '</b> bateram no mesmo dia, sem ' + TX().pessoa + '. ' : '') + avisos + '</p></div>';
  }

  // Liga/desliga uma regra: recalcula, grava a decisão e já mostra o que ela fez.
  async function alternarRegra(id) {
    const g = M.REGRA_DE[id];
    if (!g) return;
    const regras = regrasLigadas();
    const ligar = !regras[id];
    const antes = { batidas: E.r.batidas.length, bateram: E.r.totais.F.bateram + E.r.totais.A.bateram };
    const novas = Object.assign({}, regras);
    novas[id] = ligar;
    E.decisoes.regras = novas;
    if (ligar) E.filtros[E.aba + '.regra'] = id;
    else if (filtro('regra') === id) E.filtros[E.aba + '.regra'] = '';
    recalcularEDesenhar();
    const r = E.r;
    const dif = (r.totais.F.bateram + r.totais.A.bateram) - antes.bateram;
    const daRegra = r.batidas.filter((b) => b.regra === id).length;
    const texto = (ligar ? 'Ligou' : 'Desligou') + ' a regra ' + g.icone + ' ' + g.nome + ' (' + g.curto + '): ' +
      (ligar ? daRegra + ' conciliação(ões) por esta regra, ' + (dif >= 0 ? '+' : '') + dif + ' linha(s) a mais conciliadas'
        : Math.abs(dif) + ' linha(s) voltaram a ficar em aberto');
    historico(texto);
    await gravar('passo1-regra-' + (ligar ? 'ligada' : 'desligada'), E.registro.id, texto);
    T.avisoRapido(texto + '. Clique de novo no botão para voltar atrás.', r.invariantes.ok ? 'ok' : 'erro', 9000);
  }

  // ---------- 2 · Reclassificações ----------
  function abaReclass(alvo) {
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' },
      { tipo: 'select', nome: 'origem', texto: 'Origem', opcoes: [['', 'Todas'], ['direta', 'Diretas'], ['inversa', 'Inversas'], ['suspeita', 'Suspeitas'], ['desmarcada', 'Desmarcadas'], ['mao', 'À mão']] },
    ]);
    const r = E.r;
    const busca = filtro('busca');
    const origem = filtro('origem');
    const sugs = r.sugestoes.filter((s) => (!origem || (origem === 'direta' && s.sentido === 'direta') || (origem === 'inversa' && s.sentido === 'inversa') ||
      (origem === 'suspeita' && s.suspeita) || (origem === 'desmarcada' && !s.marcada)) && origem !== 'mao' &&
      (!busca || combinaBusca(busca, s.nome) || (s.cnpj && s.cnpj.indexOf(U.soDigitos(busca)) >= 0 && U.soDigitos(busca))));
    const manuais = (!origem || origem === 'mao') ? r.manuais.filter((m) => !busca || combinaBusca(busca, m.nome)) : [];
    const cli = TX().fam.id === 'clientes';
    const explica = '<p class="suave pequeno" style="margin:0 0 10px;line-height:1.5"><span class="selo direta">direta</span> ' + (cli ? 'a receber' : 'a pagar') + ' e adiantamento do mesmo ' + TX().pessoa + ': reclassifica o MENOR (' + (cli ? 'C ' + TX().f + ' / D adiantamento' : 'D ' + TX().f + ' / C adiantamento') + '). ' +
      '<span class="selo inversa">inversa</span> ' + T.esc(TX().f) + ' ' + (cli ? 'CREDOR' : 'DEVEDOR') + ': o saldo invertido inteiro vai para o adiantamento. ' +
      'Desmarcar tira a reclassificação do arquivo; a decisão fica gravada.</p>';
    alvo.innerHTML = explica + '<div id="tabela-aba"></div>' + (manuais.length || (!origem || origem === 'mao') ? '<h3 style="margin:18px 0 8px">Reclassificações à mão</h3><div id="tabela-mao"></div>' : '');
    T.tabelaPaginada(alvo.querySelector('#tabela-aba'), {
      ordem: { id: 'p1-reclass', colunas: [null, TXT((s) => s.sentido), TXT((s) => s.nome), VALOR((s) => s.aPagar), VALOR((s) => s.adiantado), VALOR((s) => s.valor),
        NUM((s) => s.lancamentos.length), null] },
      cabecalho: '<th class="caixa">Marcada</th><th>Sentido</th><th>Fornecedor</th><th class="num">A pagar (sobras)</th><th class="num">Adiantado (sobras)</th><th class="num">Valor</th><th>Lançamentos</th><th></th>',
      linhas: sugs,
      porPagina: 200,
      vazio: 'Nenhuma reclassificação sugerida com estes filtros.',
      linha: (s) => {
        const aberto = E.abertos.has(s.chave);
        let html = '<tr class="' + (aberto ? 'destaque' : '') + '"><td class="caixa"><input type="checkbox" data-sugestao="' + T.esc(s.chave) + '"' + (s.marcada ? ' checked' : '') + '></td>' +
          '<td><span class="selo ' + s.sentido + '">' + s.sentido + '</span>' + (s.suspeita ? '<br><span class="selo suspeita" title="O nome parece meio de pagamento (' + T.esc(s.suspeita) + '): a nota dele pode estar no nome de outro fornecedor. Vem desmarcada.">suspeita</span>' : '') + '</td>' +
          '<td class="nome"><b>' + T.esc(s.nome) + '</b>' + (s.cnpj ? '<br><span class="suave pequeno">' + U.formatarCnpj(s.cnpj) + '</span>' : '') + '</td>' +
          T.tdValor(s.aPagar) + T.tdValor(s.adiantado) + T.tdValor(s.valor, 'forte') +
          '<td class="pequeno">' + s.lancamentos.length + ' · ' + T.esc(s.sentido === 'direta' ? 'D ' + s.lancamentos[0].contaDebito + ' / C ' + s.lancamentos[0].contaCredito : 'D ' + s.lancamentos[0].contaDebito + ' / C ' + s.lancamentos[0].contaCredito) +
          (s.sentido === 'inversa' ? '<br><span class="suave">' + (s.notas.length ? 'notas e pagamentos: 1 lançamento no fim do mês' : 'só pagamentos: 1 lançamento por pagamento') + '</span>' : '') + '</td>' +
          '<td><button type="button" class="botao pequeno leve" data-abrir="' + T.esc(s.chave) + '">' + (aberto ? 'Fechar' : 'Detalhe') + '</button></td></tr>';
        if (aberto) html += '<tr class="sub"><td></td><td colspan="7">' + detalheSugestao(s) + '</td></tr>';
        return html;
      },
    });
    const caixaMao = alvo.querySelector('#tabela-mao');
    if (caixaMao) {
      T.tabelaPaginada(caixaMao, {
        alta: false,
        ordem: { id: 'p1-manuais', colunas: [TXT((m) => m.sentido), TXT((m) => m.nome), NUM((m) => m.marcas.length), VALOR((m) => m.valor), NUM((m) => U.paraMs(m.quando) || null), null] },
        cabecalho: '<th>Sentido</th><th>Fornecedor</th><th class="num">Linhas</th><th class="num">Valor</th><th>Quem e quando</th><th></th>',
        linhas: manuais,
        vazio: 'Nenhuma. Para fazer uma, selecione linhas nas abas "Não bateu" e use a barra que aparece no rodapé.',
        linha: (m) => '<tr><td><span class="selo ' + m.sentido + '">' + m.sentido + '</span> <span class="selo mao">à mão</span></td><td class="nome"><b>' + T.esc(m.nome) + '</b></td>' +
          '<td class="num">' + m.marcas.length + '</td>' + T.tdValor(m.valor) + '<td class="pequeno">' + T.esc(m.quem || '') + '<br>' + U.dataHoraLocal(m.quando) + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer-mao="' + T.esc(m.id) + '">Desfazer</button></td></tr>',
      });
    }
  }

  function detalheSugestao(s) {
    const r = E.r;
    const linhasDe = (idx) => idx.map((i) => r.linhas[i]);
    // O código do fornecedor no sistema (a coluna Participante do razão), que vai no arquivo ao lado da conta.
    const participante = (p) => (p ? ' <span class="suave pequeno" title="Participante (o código do fornecedor no sistema contábil)">· part. ' + T.esc(p) + '</span>' : '');
    const tabelaLinhas = (titulo, ls) => ls.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>' + titulo + '</b> (' + ls.length + ' · ' +
      T.moeda(ls.reduce((t, l) => t + l.valor, 0)) + ')</p><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Data</th><th>Histórico</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead><tbody>' +
      ls.slice(0, 60).map((l) => '<tr><td class="num">' + l.data + '</td><td class="historico">' + T.esc(l.historico) + '</td>' + T.tdValor(l.debito) + T.tdValor(l.credito) + '</tr>').join('') +
      '</tbody></table></div>' + (ls.length > 60 ? '<p class="suave pequeno">… e mais ' + (ls.length - 60) + ' linhas (veja em Não bateu).</p>' : '') : '';
    const lanc = '<p class="pequeno" style="margin:4px 0"><b>Lançamento(s) que vão para o arquivo</b></p><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Data</th><th>Conta débito</th><th>Conta crédito</th><th class="num">Valor</th><th>Histórico</th></tr></thead><tbody>' +
      s.lancamentos.map((l) => '<tr><td class="num">' + l.data + '</td><td>' + T.esc(l.contaDebito) + participante(l.participanteDebito) + '</td><td>' + T.esc(l.contaCredito) + participante(l.participanteCredito) + '</td>' +
        T.tdValor(l.valor) + '<td class="historico">' + T.esc(l.historico) + '</td></tr>').join('') +
      '</tbody></table></div>';
    if (s.sentido === 'direta') {
      return lanc + tabelaLinhas('Sobras em ' + TX().f, linhasDe(s.linhasF)) + tabelaLinhas('Sobras no adiantamento', linhasDe(s.linhasA));
    }
    return lanc + tabelaLinhas('Notas (formam o saldo)', linhasDe(s.notas)) + tabelaLinhas('Pagamentos (baixas)', linhasDe(s.pagamentos));
  }

  // ---------- Não bateu ----------
  function abaNaoBateu(alvo, lado) {
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou histórico' },
      { tipo: 'select', nome: 'motivo', texto: 'Motivo', opcoes: [['', 'Todos os motivos'], ['sem-par', 'sem par'], ['recusada', 'desmarcada'], ['sem-fornecedor', 'sem fornecedor'], ['parcial', 'parcial'], ['desfeita', 'não confere']] },
    ]);
    const r = E.r;
    const busca = filtro('busca');
    const motivo = filtro('motivo');
    const lista = r.linhas.filter((l) => l.lado === lado && NAO_BATEU.indexOf(l.situacao) >= 0 &&
      (!motivo || (motivo === 'desfeita' ? l.desfeita : l.situacao === motivo)) && combinaBusca(busca, l.dono.nome, l.historico));
    const total = lista.reduce((t, l) => t + l.valor, 0);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">' + lista.length.toLocaleString('pt-BR') + ' linha(s) · soma no sentido da conta ' + T.moeda(total) +
      ' · marque linhas para reclassificar à mão (a barra aparece no rodapé).</p><div id="tabela-aba"></div>';
    T.tabelaPaginada(alvo.querySelector('#tabela-aba'), {
      ordem: { id: 'p1-naobateu', colunas: [null, DATA((l) => l.data), TXT((l) => l.historico), TXT(nomeDoDono), VALOR(valorDaLinha), VALOR(valorDaLinha),
        TXT((l) => (T.SITUACOES[l.situacao] || [0, l.situacao])[1]), null] },
      cabecalho: '<th class="caixa"><input type="checkbox" data-marcar-pagina title="Marcar as linhas mostradas"></th><th>Data</th><th>Histórico</th><th>Fornecedor</th><th class="num">Débito</th><th class="num">Crédito</th><th>Situação</th><th>Observação</th>',
      linhas: lista,
      vazio: 'Nada em aberto com estes filtros.',
      linha: (l) => '<tr class="' + (E.selecao.has(l.digital) ? 'destaque' : '') + '"><td class="caixa"><input type="checkbox" data-selecionar="' + T.esc(l.digital) + '"' + (E.selecao.has(l.digital) ? ' checked' : '') + '></td>' +
        '<td class="num">' + l.data + '</td><td class="historico">' + T.esc(l.historico) + '</td>' + celulaDono(l) + T.tdValor(l.debito) + T.tdValor(l.credito) +
        '<td>' + T.pilula(l.situacao) + '</td><td>' + obsDaLinha(l) + '</td></tr>',
    });
  }

  // ---------- Por fornecedor (conta por conta) ----------
  function abaPorFornecedor(alvo, lado) {
    const r = E.r;
    const situacoes = Array.from(new Set(r.porFornecedor[lado].map((x) => x.situacao))).sort();
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' },
      { tipo: 'select', nome: 'situacao', texto: 'Situação', opcoes: [['', 'Todas as situações']].concat(situacoes.map((s) => [s, (T.SITUACOES[s] || [0, s])[1]])) },
    ]);
    const busca = filtro('busca');
    const sit = filtro('situacao');
    const lista = r.porFornecedor[lado].filter((x) => (!sit || x.situacao === sit) &&
      (combinaBusca(busca, x.nome) || (U.soDigitos(busca) && x.cnpj && x.cnpj.indexOf(U.soDigitos(busca)) >= 0)));
    const soma = (k) => lista.reduce((t, x) => t + x[k], 0);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">Conta por conta: ' + (lado === 'F' ? 'aqui só a conta de <b>' + T.esc(TX().f) + '</b> (positivo = ' + (TX().fam.id === 'clientes' ? 'o cliente deve' : 'a empresa deve') + ').' :
      'aqui só a conta de <b>adiantamento</b> (positivo = a empresa adiantou).') + ' Nunca numa linha só com as duas contas: pareceria saldo líquido.</p><div id="tabela-aba"></div>';
    T.tabelaPaginada(alvo.querySelector('#tabela-aba'), {
      ordem: { id: 'p1-porfornecedor', colunas: [TXT((x) => (x.chave === SEM ? '' : x.nome)), TXT((x) => x.cnpj), TXT((x) => (T.SITUACOES[x.situacao] || [0, x.situacao])[1]),
        VALOR((x) => x.tinha), NUM((x) => x.linhas), NUM((x) => x.bateram), VALOR((x) => x.reclassificado), VALOR((x) => x.fica)] },
      cabecalho: '<th>Fornecedor</th><th>CNPJ</th><th>Situação</th><th class="num" title="Saldo do fornecedor nesta conta no período">Tinha</th><th class="num">Linhas</th><th class="num">Bateram</th><th class="num" title="Efeito das reclassificações marcadas e à mão, com sinal">Reclassificado</th><th class="num">Fica</th>',
      linhas: lista,
      vazio: 'Nenhum fornecedor com estes filtros.',
      rodape: '<tr class="total"><td colspan="3">Total (' + lista.length.toLocaleString('pt-BR') + ' ' + TX().pessoas + ')</td>' + T.tdValor(soma('tinha')) +
        '<td class="num">' + soma('linhas').toLocaleString('pt-BR') + '</td><td class="num">' + soma('bateram').toLocaleString('pt-BR') + '</td>' + T.tdValor(soma('reclassificado')) + T.tdValor(soma('fica')) + '</tr>',
      linha: (x) => '<tr><td class="nome">' + (x.chave === SEM ? '<span class="falta">Sem fornecedor</span>' : T.esc(x.nome)) + '</td><td class="num">' + (x.cnpj ? U.formatarCnpj(x.cnpj) : '—') + '</td>' +
        '<td>' + T.pilula(x.situacao) + '</td>' + T.tdValor(x.tinha) + '<td class="num">' + x.linhas + '</td><td class="num">' + x.bateram + '</td>' + T.tdValor(x.reclassificado) + T.tdValor(x.fica) + '</tr>',
    });
  }

  // ---------- Razão completo ----------
  function abaRazao(alvo) {
    const r = E.r;
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor, histórico ou batida' },
      { tipo: 'select', nome: 'fonte', texto: 'Fonte', opcoes: [['', 'Todas as fontes']].concat(r.contas.F.map((c) => ['F:' + c.codigo, TX().F + ' · ' + c.codigo])).concat(r.contas.A.map((c) => ['A:' + c.codigo, 'Adiantamento · ' + c.codigo])) },
      { tipo: 'select', nome: 'situacao', texto: 'Situação', opcoes: [['', 'Todas as situações'], ['bateu', 'bateu'], ['auto', 'reclassificada'], ['manual', 'à mão'], ['parcial', 'parcial'], ['recusada', 'desmarcada'], ['sem-par', 'sem par'], ['sem-fornecedor', 'sem fornecedor']] },
    ]);
    const busca = filtro('busca');
    const fonte = filtro('fonte');
    const sit = filtro('situacao');
    const lista = r.linhas.filter((l) => (!fonte || fonte === l.lado + ':' + l.conta) && (!sit || l.situacao === sit) &&
      (!busca || (l.batida && l.batida.indexOf(busca.toUpperCase()) >= 0) || combinaBusca(busca, l.dono.nome, l.historico)));
    alvo.innerHTML = '<div id="tabela-aba"></div>';
    T.tabelaPaginada(alvo.querySelector('#tabela-aba'), {
      ordem: { id: 'p1-razao', colunas: [TXT((l) => l.lado + ' ' + l.conta), DATA((l) => l.data), TXT((l) => l.historico), TXT((l) => l.contrapartida), TXT(nomeDoDono),
        VALOR(valorDaLinha), VALOR(valorDaLinha), TXT((l) => (T.SITUACOES[l.situacao] || [0, l.situacao])[1]), null] },
      cabecalho: '<th>Fonte</th><th>Data</th><th>Histórico</th><th>Contrapartida</th><th>Fornecedor</th><th class="num">Débito</th><th class="num">Crédito</th><th>Situação</th><th>Observação</th>',
      linhas: lista,
      vazio: 'Nenhuma linha com estes filtros.',
      linha: (l) => '<tr><td class="pequeno">' + (l.lado === 'F' ? T.esc(TX().F) : 'Adiantamento') + '<br><span class="suave">' + T.esc(l.conta) + '</span></td>' +
        '<td class="num">' + l.data + '</td><td class="historico">' + T.esc(l.historico) + '</td><td>' + T.nome(l.contrapartida) + '</td>' + celulaDono(l) +
        T.tdValor(l.debito) + T.tdValor(l.credito) + '<td>' + T.pilula(l.situacao) + '</td><td>' + obsDaLinha(l) + '</td></tr>',
    });
  }

  // ------------------------------------------------------------------
  // Barra de seleção (reclassificação à mão)
  // Armadilha 19: atualizar a barra no fim de TODO clique.
  // ------------------------------------------------------------------
  function previaManual() {
    const marcas = Array.from(E.selecao).filter((d) => E.porDigital.has(d));
    if (!marcas.length) return null;
    const prova = M.aplicarManuais([{ id: 'previa', marcas, quando: U.agoraISO() }], E.porDigital);
    return { marcas, valida: prova.validas[0] || null, motivo: prova.naoEncaixam[0] ? prova.naoEncaixam[0].motivo : '' };
  }

  function atualizarBarra() {
    const barra = E.el.querySelector('#barra');
    if (!barra) return;
    const p = previaManual();
    if (!p) { barra.innerHTML = ''; return; }
    const ls = p.marcas.map((d) => E.porDigital.get(d));
    const somaF = ls.filter((l) => l.lado === 'F').reduce((t, l) => t + l.valor, 0);
    const somaA = ls.filter((l) => l.lado === 'A').reduce((t, l) => t + l.valor, 0);
    const explica = p.valida
      ? (p.valida.sentido === 'direta' ? '→ direta de ' + T.moeda(p.valida.valor) + ' (vale o menor; a diferença fica em aberto)' :
        '→ inversa: ' + p.valida.partes.length + ' lançamento(s), ' + T.moeda(p.valida.valor))
      : p.motivo;
    // Conciliar à mão é dentro da MESMA conta (débito e crédito que se anulam); reclassificar é de uma conta para
    // a outra. Por isso os dois botões: o que vale para o que está marcado fica ligado (Dony, 23/09/2026).
    const lados = new Set(ls.map((l) => l.lado));
    const podeConciliar = ls.length >= 2 && lados.size === 1 && ls.every((l) => l.situacao !== 'bateu');
    const somaSel = ls.reduce((t, l) => t + l.valor, 0);
    const explicaAqui = podeConciliar
      ? (lados.has('F') ? T.esc(TX().F) : 'Adiantamento') + ': ' + ls.filter((l) => l.valor > 0).length + ' a crédito e ' + ls.filter((l) => l.valor < 0).length + ' a débito' +
        (somaSel ? ' → conciliar à mão deixa ' + U.formatarCentavos(Math.abs(somaSel)) + ' de diferença em aberto' : ' → conciliar à mão fecha no centavo')
      : explica;
    barra.innerHTML = '<div class="barra-selecao"><span><b>' + ls.length + '</b> linha(s)</span>' +
      '<span>' + T.esc(TX().F) + ' <b class="num">' + U.formatarCentavos(somaF) + '</b></span><span>Adiantamento <b class="num">' + U.formatarCentavos(somaA) + '</b></span>' +
      '<span class="explica">' + T.esc(explicaAqui) + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-mao"' + (podeConciliar ? '' : ' disabled') +
      ' title="' + (podeConciliar ? 'Casar estas linhas entre si dentro da mesma conta' + (somaSel ? ' (sobra ' + U.formatarCentavos(Math.abs(somaSel)) + ', que continua em aberto)' : '')
        : lados.size > 1 ? 'Conciliar à mão é dentro da mesma conta: marque só linhas de uma delas' : 'Marque duas linhas ou mais que ainda não bateram') + '">✋ Conciliar à mão</button>' +
      '<button type="button" class="botao' + (podeConciliar ? '' : ' primario') + '" data-acao="reclassificar-mao"' + (p.valida ? '' : ' disabled') + '>Reclassificar à mão</button>' +
      '<button type="button" class="botao" data-acao="limpar-selecao">Limpar seleção</button></div>';
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function ligarEventos() {
    const raizTela = E.el;
    raizTela.addEventListener('click', aoClicar);
    raizTela.addEventListener('change', aoMudar);
    raizTela.addEventListener('input', T.debounce((ev) => {
      const f = ev.target.closest('[data-filtro]');
      if (!f || f.tagName !== 'INPUT') return;
      E.filtros[E.aba + '.' + f.getAttribute('data-filtro')] = f.value;
      const pos = f.selectionStart;
      desenharAba();
      const novo = raizTela.querySelector('[data-filtro="' + f.getAttribute('data-filtro') + '"]');
      if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) { /* nada */ } }
      atualizarBarra();
    }, 250));
  }

  async function aoClicar(ev) {
    const alvo = ev.target;
    try {
      const aba = alvo.closest('[data-aba]');
      if (aba) {
        E.aba = aba.getAttribute('data-aba');
        app().gravarLocal('conciliador-solutta.aba-passo1', E.aba);
        desenharAbas();
        desenharAba();
        return;
      }
      const abrir = alvo.closest('[data-abrir]');
      if (abrir) {
        const id = abrir.getAttribute('data-abrir');
        if (E.abertos.has(id)) E.abertos.delete(id); else E.abertos.add(id);
        redesenharAbaMantendoRolagem();
        return;
      }
      const irBatida = alvo.closest('[data-ir-batida]');
      if (irBatida) {
        ev.preventDefault();
        // Linha que bateu leva à batida dela.
        const id = irBatida.getAttribute('data-ir-batida');
        const b = E.batidaPorId.get(id);
        if (!b) return;
        E.aba = b.lado === 'F' ? 'bateuF' : 'bateuA';
        E.filtros[E.aba + '.busca'] = id;
        E.filtros[E.aba + '.como'] = '';
        E.abertos.add(id);
        desenharAbas();
        desenharAba();
        return;
      }
      const naoConfere = alvo.closest('[data-nao-confere]');
      if (naoConfere) {
        const id = naoConfere.getAttribute('data-nao-confere');
        const b = E.batidaPorId.get(id);
        if (!b) return;
        // Batida feita à mão: desfazer é apagar a decisão à mão (marcar "não confere" não teria efeito, ela
        // voltaria a ser criada na próxima conta).
        if (b.regra === 'manual') {
          E.decisoes.batidasAMao = (E.decisoes.batidasAMao || []).filter((x) => x.id !== b.idAMao);
          historico('Desfez a conciliação à mão ' + (b.idAMao || id));
          recalcularEDesenhar();
          T.avisoRapido('Conciliação à mão ' + (b.idAMao || id) + ' desfeita: as linhas voltaram para "Não bateu".');
          gravar('batida-a-mao-desfeita', b.idAMao || id, b.marcas.length + ' linhas');
          return;
        }
        E.decisoes.desfeitas = E.decisoes.desfeitas.concat([{ id, marcas: b.marcas.slice(), quem: app().usuario.nome, quando: U.agoraISO() }]);
        historico('Não confere: ' + id);
        recalcularEDesenhar();
        T.avisoRapido('Batida ' + id + ' marcada como não confere: as linhas voltaram para "Não bateu".');
        gravar('batida-nao-confere', id, b.marcas.length + ' linhas');
        return;
      }
      const voltarBater = alvo.closest('[data-voltar-bater]');
      if (voltarBater) {
        const id = voltarBater.getAttribute('data-voltar-bater');
        E.decisoes.desfeitas = E.decisoes.desfeitas.filter((d) => d.id !== id);
        historico('Voltar a bater: ' + id);
        recalcularEDesenhar();
        gravar('batida-voltou', id);
        return;
      }
      const dono = alvo.closest('[data-dono]');
      if (dono) { await trocarDono(dono.getAttribute('data-dono')); return; }
      const desfazerMao = alvo.closest('[data-desfazer-mao]');
      if (desfazerMao) {
        const id = desfazerMao.getAttribute('data-desfazer-mao');
        const m = E.decisoes.manuais.find((x) => x.id === id);
        const sim = await T.confirmar({ titulo: 'Desfazer a reclassificação à mão?', texto: 'As linhas voltam para "Não bateu" e o lançamento sai do arquivo de ajustes.<br><b>' + T.esc(m ? m.nome : id) + '</b>', botao: 'Desfazer', perigo: true });
        if (!sim) return;
        E.decisoes.manuais = E.decisoes.manuais.filter((x) => x.id !== id);
        historico('Desfez à mão: ' + id);
        recalcularEDesenhar();
        gravar('reclassificacao-mao-desfeita', id);
        return;
      }
      const regra = alvo.closest('[data-regra]');
      if (regra) { await alternarRegra(regra.getAttribute('data-regra')); return; }
      const acao = alvo.closest('[data-acao]');
      if (acao) {
        const a = acao.getAttribute('data-acao');
        // 1.3: espera a última decisão ser gravada, para o razão limpo sair com ela.
        if (a === 'razao-limpo') { acao.disabled = true; await E.fila; app().ir(E.voltar + '/passo13'); return; }
        // Livro diário: trocar as contas que saem dele (a escolha fica na empresa; o passo abre de novo com elas).
        if (a === 'trocar-contas') { await E.fila; await raiz.TelaSubir.doDiario(E.codigo, lugaresDoPasso1(E.comp, E.arqs, E.fam.id)); return; }
        if (a === 'baixar') baixarArquivo();
        if (a === 'limpar-selecao') { E.selecao.clear(); redesenharAbaMantendoRolagem(); }
        if (a === 'conciliar-mao') await conciliarAMao();
        if (a === 'reclassificar-mao') await reclassificarAMao();
        if (a === 'limpar-filtros') {
          Object.keys(E.filtros).filter((k) => k.startsWith(E.aba + '.')).forEach((k) => { delete E.filtros[k]; });
          desenharAba();
        }
      }
    } finally {
      atualizarBarra();
    }
  }

  function aoMudar(ev) {
    const alvo = ev.target;
    try {
      const sel = alvo.closest('select[data-filtro]');
      if (sel) {
        E.filtros[E.aba + '.' + sel.getAttribute('data-filtro')] = sel.value;
        desenharAba();
        return;
      }
      const sug = alvo.closest('[data-sugestao]');
      if (sug) {
        const chave = sug.getAttribute('data-sugestao');
        const s = E.r.sugestoes.find((x) => x.chave === chave);
        const marcar = sug.checked;
        const recusadas = new Set(E.decisoes.recusadas);
        const aceitas = new Set(E.decisoes.aceitas);
        if (marcar) { recusadas.delete(chave); if (s && s.suspeita) aceitas.add(chave); }
        else { recusadas.add(chave); aceitas.delete(chave); }
        E.decisoes.recusadas = Array.from(recusadas);
        E.decisoes.aceitas = Array.from(aceitas);
        historico((marcar ? 'Marcou ' : 'Desmarcou ') + chave);
        recalcularEDesenhar(true);
        gravar(marcar ? 'reclassificacao-marcada' : 'reclassificacao-desmarcada', chave, s ? s.nome + ' · ' + U.formatarCentavos(s.valor) : '');
        return;
      }
      const cx = alvo.closest('[data-selecionar]');
      if (cx) {
        const d = cx.getAttribute('data-selecionar');
        if (cx.checked) E.selecao.add(d); else E.selecao.delete(d);
        const tr = cx.closest('tr');
        if (tr) tr.classList.toggle('destaque', cx.checked);
        return;
      }
      const pagina = alvo.closest('[data-marcar-pagina]');
      if (pagina) {
        E.el.querySelectorAll('#aba [data-selecionar]').forEach((c) => {
          c.checked = pagina.checked;
          const d = c.getAttribute('data-selecionar');
          if (pagina.checked) E.selecao.add(d); else E.selecao.delete(d);
          c.closest('tr').classList.toggle('destaque', pagina.checked);
        });
      }
    } finally {
      atualizarBarra();
    }
  }

  function redesenharAbaMantendoRolagem() {
    const caixa = E.el.querySelector('#aba .tabela-caixa');
    const topo = caixa ? caixa.scrollTop : 0;
    const pagina = E.el.closest('.conteudo');
    const topoPagina = pagina ? pagina.scrollTop : 0;
    desenharAba();
    const nova = E.el.querySelector('#aba .tabela-caixa');
    if (nova) nova.scrollTop = topo;
    if (pagina) pagina.scrollTop = topoPagina;
  }

  function recalcularEDesenhar(soCartoes) {
    const t0 = Date.now();
    calcular();
    desenharAvisos();
    desenharCartoes();
    desenharRegras();
    desenharAbas();
    // Redesenha a aba sem pular para o topo (a pessoa continua onde estava).
    redesenharAbaMantendoRolagem();
    void soCartoes;
    if (Date.now() - t0 > 1500) console.info('Passo ① recalculado em ' + (Date.now() - t0) + ' ms');
  }

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  function baixarArquivo() {
    const r = E.r;
    if (!r.ajustes.length) { T.avisoRapido('Nenhuma reclassificação marcada: não há lançamento para o arquivo.'); return; }
    if (!r.invariantes.ok) { T.avisoRapido('A conferência falhou: revise antes de baixar o arquivo.', 'erro'); return; }
    const cfg = app().config.layoutAjustes || {};
    const g = raiz.LayoutAjustes.gerar(r.ajustes, cfg);
    const nome = raiz.LayoutAjustes.nomeDoArquivo(E.codigo, E.comp, TX().F, g.extensao);
    T.baixar(g.bytes, nome, g.tipo || 'text/plain');
    E.ultimoArquivo = { nome, bytes: g.bytes, linhas: g.linhas, total: g.total };
    historico('Baixou o arquivo de ajustes: ' + g.linhas + ' lançamentos, ' + U.formatarCentavos(g.total));
    gravar('arquivo-ajustes-baixado', nome, g.linhas + ' lançamentos · R$ ' + U.formatarCentavos(g.total));
    T.avisoRapido('Arquivo "' + nome + '" gerado: ' + g.linhas + ' lançamentos, ' + T.moeda(g.total) + '. Ele está na pasta Downloads.', 'ok', 6000);
  }

  // ------------------------------------------------------------------
  // CONCILIAR À MÃO dentro da mesma conta (Dony, 23/09/2026: "kd a opção de conciliar manualmente mano?" ·
  // "conciliar manual, deve exister em todos"). Vale antes de qualquer regra; pode ser de fornecedores diferentes
  // e pode ter diferença — a diferença continua em aberto, e o em aberto segue igual ao saldo do razão.
  // ------------------------------------------------------------------
  function proximoIdAMao() {
    let n = 0;
    for (const g of (E.decisoes.batidasAMao || [])) { const m = String(g.id || '').match(/(\d+)$/); if (m) n = Math.max(n, Number(m[1])); }
    return 'M' + (n + 1);
  }
  async function conciliarAMao() {
    const marcas = Array.from(E.selecao).filter((d) => E.porDigital.has(d));
    const ls = marcas.map((d) => E.porDigital.get(d));
    if (ls.length < 2 || new Set(ls.map((l) => l.lado)).size !== 1) return;
    const lado = ls[0].lado;
    const credito = ls.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
    const debito = -ls.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
    const dif = credito - debito;
    const conta = lado === 'F' ? TX().F : 'Adiantamento';
    const r = await T.janela({
      titulo: 'Conciliar à mão' + (dif ? ' com diferença?' : '?'),
      corpo: '<p style="line-height:1.7">' + ls.length + ' linha(s) de <b>' + T.esc(conta) + '</b> que se anulam entre si:<br>' +
        'A crédito: <b>' + T.moeda(credito) + '</b> (' + ls.filter((l) => l.valor > 0).length + ')<br>' +
        'A débito: <b>' + T.moeda(debito) + '</b> (' + ls.filter((l) => l.valor < 0).length + ')<br>' +
        (dif ? '<span class="falta">Diferença: <b>' + T.moeda(Math.abs(dif)) + '</b> — continua em aberto.</span>' : 'Fecha no centavo.') + '</p>' +
        '<div class="campo" style="margin-top:10px"><label for="obs-mao1">Observação (por que concilia assim)</label><input id="obs-mao1" autocomplete="off" maxlength="200" placeholder="Ex.: pagamento parcial da nota" autofocus></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: dif ? 'Conciliar com diferença' : 'Conciliar', tipo: 'primario', antes: (j) => ({ obs: j.querySelector('#obs-mao1').value.trim() }) }],
      aoAbrir: (j) => { j.querySelector('#obs-mao1').addEventListener('keydown', (e) => { if (e.key === 'Enter') j.querySelector('footer .primario').click(); }); },
    });
    if (!r) return;
    const g = { id: proximoIdAMao(), marcas, quem: app().usuario.nome, quando: U.agoraISO() };
    if (r.obs) g.obs = r.obs;
    E.decisoes.batidasAMao = (E.decisoes.batidasAMao || []).concat([g]);
    E.selecao.clear();
    calcular();
    const feita = E.r.batidas.find((b) => b.idAMao === g.id);
    if (!feita) {
      E.decisoes.batidasAMao = E.decisoes.batidasAMao.filter((x) => x !== g);
      recalcularEDesenhar();
      T.avisoRapido('Não deu para conciliar essas linhas à mão.', 'erro', 7000);
      return;
    }
    historico('Conciliou à mão ' + g.id + ': ' + ls.length + ' linha(s) de ' + conta + ' · ' + U.formatarCentavos(credito) + ' × ' + U.formatarCentavos(debito) +
      (dif ? ' · diferença ' + U.formatarCentavos(Math.abs(dif)) + ' em aberto' : '') + (r.obs ? ' · ' + r.obs : ''));
    E.aba = lado === 'F' ? 'bateuF' : 'bateuA';
    E.abertos.add(feita.id);
    recalcularEDesenhar();
    T.avisoRapido('Conciliado à mão: batida ' + feita.id + '. Para desfazer, use o ✕ na aba "Bateu no razão".', E.r.invariantes.ok ? 'ok' : 'erro', 8000);
    gravar('batida-a-mao-criada', g.id, ls.length + ' linhas · ' + U.formatarCentavos(credito));
  }

  async function reclassificarAMao() {
    const p = previaManual();
    if (!p || !p.valida) return;
    const v = p.valida;
    const nomePadrao = v.nome || '';
    const nome = await T.janela({
      titulo: 'Reclassificar à mão',
      corpo: '<p style="line-height:1.55">' + p.marcas.length + ' linha(s) → <span class="selo ' + v.sentido + '">' + v.sentido + '</span> de <b>' + T.moeda(v.valor) + '</b>' +
        (v.sentido === 'inversa' ? ' em ' + v.partes.length + ' lançamento(s), na data de cada pagamento.' : ', no fim da competência. A diferença entre os lados fica em aberto (pode ser desconto).') + '</p>' +
        '<div class="campo" style="margin-top:12px"><label for="nome-mao">Fornecedor no histórico do lançamento</label><input id="nome-mao" autofocus value="' + T.esc(nomePadrao) + '"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Reclassificar', tipo: 'primario', antes: (j) => j.querySelector('#nome-mao').value.trim() || nomePadrao || 'SEM NOME' }],
    });
    if (!nome) return;
    const quem = app().usuario.nome;
    const registro = { id: M.idDaManual(p.marcas), nome, valor: v.valor, marcas: p.marcas, sentido: v.sentido, quem, quando: U.agoraISO() };
    E.decisoes.manuais = E.decisoes.manuais.filter((m) => m.id !== registro.id).concat([registro]);
    E.selecao.clear();
    historico('À mão (' + v.sentido + '): ' + nome + ' ' + U.formatarCentavos(v.valor));
    recalcularEDesenhar();
    T.avisoRapido('Reclassificação à mão criada: ' + nome + ' · ' + T.moeda(v.valor), 'ok');
    gravar('reclassificacao-mao-criada', registro.id, nome + ' · ' + v.sentido + ' · ' + U.formatarCentavos(v.valor));
  }

  async function trocarDono(digital) {
    const l = E.porDigital.get(digital);
    if (!l) return;
    const manual = E.decisoes.donos[digital];
    let escolha = null;
    const resultado = await T.janela({
      titulo: 'Trocar o fornecedor desta linha',
      corpo: '<p class="pequeno suave" style="line-height:1.5">' + T.esc(l.data) + ' · ' + T.esc(l.historico) + ' · ' + (l.debito ? 'D ' + U.formatarCentavos(l.debito) : 'C ' + U.formatarCentavos(l.credito)) + '</p>' +
        '<p style="margin:8px 0">Hoje: <b>' + (l.dono.chave === SEM ? 'sem fornecedor' : T.esc(l.dono.nome)) + '</b>' + (manual ? ' <span class="selo mao">✎ trocado à mão</span>' : '') + '</p>' +
        (l.dono.aviso ? '<div class="aviso ambar" style="margin-bottom:8px"><span class="icone-aviso">⚠️</span><div>' + T.esc(l.dono.aviso) + '</div></div>' : '') +
        '<div class="campo"><label for="novo-dono">Novo fornecedor (nome ou CNPJ)</label><input id="novo-dono" autofocus autocomplete="off" placeholder="Digite para ver os parecidos"></div>' +
        '<div id="dono-diz" class="pequeno" style="margin-top:6px;min-height:18px"></div><div class="sugestoes-dono" id="dono-sugestoes"></div>' +
        '<p class="suave pequeno" style="margin-top:8px">A linha trocada não empresta ao novo fornecedor o nome nem o CNPJ do histórico (são do dono antigo).</p>',
      botoes: [{ texto: 'Cancelar', valor: null }]
        .concat(manual ? [{ texto: 'Voltar ao que o programa leu', valor: 'voltar' }] : [])
        .concat([{ texto: 'Aplicar', tipo: 'primario', antes: (j) => {
          const txt = j.querySelector('#novo-dono').value.trim();
          if (!txt) { j.querySelector('#novo-dono').focus(); return false; }
          return escolha || MN.sugerirDono(txt, E.r.fornecedores);
        } }]),
      aoAbrir: (j) => {
        const input = j.querySelector('#novo-dono');
        const diz = j.querySelector('#dono-diz');
        const lista = j.querySelector('#dono-sugestoes');
        const atualizar = () => {
          escolha = null;
          const s = MN.sugerirDono(input.value, E.r.fornecedores);
          if (s.tipo === 'vazio') { diz.innerHTML = ''; lista.innerHTML = ''; return; }
          diz.innerHTML = s.tipo === 'igual' ? '<span class="ok">Vai vincular a <b>' + T.esc(s.nome) + '</b> (igual: ' + T.esc(s.motivo) + ').</span>'
            : s.tipo === 'parecido' ? '<span style="color:var(--azul)">Vai vincular a <b>' + T.esc(s.nome) + '</b> (parecido).</span>'
              : '<span style="color:var(--ambar)">Vai criar o fornecedor novo <b>' + T.esc(s.nome) + '</b>.</span>';
          lista.innerHTML = s.sugestoes.map((f) => '<button type="button" data-chave="' + T.esc(f.chave) + '">' + T.esc(f.nome) +
            (f.cnpj ? ' <span class="suave pequeno">' + U.formatarCnpj(f.cnpj) + '</span>' : '') + ' <span class="suave pequeno">· ' + f.linhas + ' linhas</span></button>').join('');
        };
        input.addEventListener('input', atualizar);
        lista.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-chave]');
          if (!b) return;
          const f = E.r.fornecedores[b.getAttribute('data-chave')];
          input.value = f.nome;
          atualizar();
          escolha = { tipo: 'igual', chave: f.chave, nome: f.nome };
          diz.innerHTML = '<span class="ok">Vai vincular a <b>' + T.esc(f.nome) + '</b> (escolhido na lista).</span>';
        });
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') j.querySelector('footer .primario').click(); });
      },
    });
    if (!resultado) return;
    if (resultado === 'voltar') {
      delete E.decisoes.donos[digital];
      historico('Voltou ao dono lido: ' + digital);
      recalcularEDesenhar();
      gravar('dono-voltou', digital);
      return;
    }
    E.decisoes.donos[digital] = { chave: resultado.chave, nome: resultado.nome };
    historico('Trocou o dono para ' + resultado.nome);
    recalcularEDesenhar();
    T.avisoRapido('Fornecedor da linha trocado para ' + resultado.nome + '.', 'ok');
    gravar('dono-trocado', digital, resultado.nome);
  }

  raiz.TelaPasso1 = { mostrar, estado: () => E, carregarDados, sincronizarComODiario, lugaresDoPasso1, linhaDoDiario };
})(self);
