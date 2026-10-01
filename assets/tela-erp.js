/*
 * ERP Solutta — tela-erp.js
 * As telas das TABELAS BÁSICAS: layout do plano de contas, contas, centros de resultado e naturezas de
 * operação. Dony, 01/10/2026: "quero que você crie um menu ERP Solutta… aí vamos construindo aos poucos".
 *
 * A regra deste módulo: ele só conversa com erp-cadastros.js (as regras) e erp-dados.js (onde guardar).
 * Do Conciliador ele usa apenas o cadastro de empresas e as peças de tela comuns — é o que permite o ERP
 * sair daqui inteiro depois.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const C = () => raiz.ErpCadastros;
  const D = () => raiz.ErpDados;
  function app() { return raiz.App; }

  const CHAVE_EMPRESA = 'erp-solutta.empresa';
  // ------------------------------------------------------------------
  // O MENU DO ERP (Dony, 01/10/2026: "você vai criar um menu chamado CONFIGURAÇÕES; dentro dele,
  // CONTABILIDADE; e dentro de contabilidade você joga o plano de contas, o centro de resultado e a
  // natureza de operação"). É esta lista que desenha o menu da esquerda, a tela de Configurações e a
  // trilha no alto de cada tabela — mexer aqui muda os três de uma vez. As outras seções (fiscal,
  // financeiro, estoque, folha) entram aqui embaixo quando chegar a vez delas.
  // ------------------------------------------------------------------
  const SECOES = [
    { id: 'contabilidade', titulo: 'Contabilidade', icone: '📚', sub: 'as tabelas que a escrituração usa', itens: [
      { id: 'plano', titulo: 'Plano de contas', icone: '📘', sub: 'o layout e as contas' },
      { id: 'centros', titulo: 'Centros de resultado', icone: '🎯', sub: 'por loja, obra, projeto ou setor' },
      { id: 'naturezas', titulo: 'Naturezas de operação', icone: '🔖', sub: 'o que a nota é, e o que ela gera' },
    ] },
  ];
  // Todas as tabelas numa lista só (quem procura por id não precisa saber em que seção ela está).
  const PARTES = [].concat.apply([], SECOES.map((s) => s.itens.map((i) => Object.assign({ secao: s.id }, i))));
  const itemDe = (id) => PARTES.find((x) => x.id === id) || null;
  const secaoDe = (id) => { const i = itemDe(id); return i ? SECOES.find((s) => s.id === i.secao) : null; };

  // Estado da tela (só desta sessão): o que está aberto na árvore e o que foi digitado na busca.
  const E = { codigo: null, parte: null, abertos: null, busca: '', plano: null, centros: null, naturezas: null };

  function empresaDe(codigo) { return (app().empresas || []).find((e) => String(e.codigo) === String(codigo)) || null; }
  function lembrarEmpresa(codigo) { app().gravarLocal(CHAVE_EMPRESA, String(codigo)); }
  function empresaLembrada() { return app().lerLocal(CHAVE_EMPRESA) || ''; }

  // ------------------------------------------------------------------
  // Moldura: o cabeçalho com a empresa e as abas do ERP
  // ------------------------------------------------------------------
  function seletorDeEmpresa(codigo) {
    const opcoes = (app().empresas || []).map((e) => '<option value="' + T.esc(e.codigo) + '"' + (String(e.codigo) === String(codigo) ? ' selected' : '') + '>' +
      T.esc(e.codigo + ' · ' + e.nome) + '</option>').join('');
    return '<div class="acoes"><label class="pequeno suave" for="erp-empresa" style="margin-right:6px">Empresa</label>' +
      '<select id="erp-empresa" class="apres-campo" style="max-width:320px">' + opcoes + '</select></div>';
  }
  // Onde estou: ERP Solutta › Configurações › Contabilidade › Plano de contas.
  function trilha(codigo, parte) {
    const s = secaoDe(parte);
    const i = itemDe(parte);
    return '<nav class="erp-trilha nao-imprimir"><a href="#/erp">ERP Solutta</a> › <a href="#/erp/config/' + encodeURIComponent(codigo) + '">⚙️ Configurações</a>' +
      (s ? ' › <a href="#/erp/config/' + encodeURIComponent(codigo) + '#' + s.id + '">' + s.icone + ' ' + T.esc(s.titulo) + '</a>' : '') +
      (i ? ' › <b>' + T.esc(i.titulo) + '</b>' : '') + '</nav>';
  }
  function moldura(codigo, parte, corpo) {
    const emp = empresaDe(codigo);
    const p = itemDe(parte) || PARTES[0];
    const s = secaoDe(parte) || SECOES[0];
    return trilha(codigo, parte) +
      '<div class="cabecalho"><div class="titulos"><h1>' + p.icone + ' ' + T.esc(p.titulo) + '</h1>' +
      '<p class="suave">' + T.esc(p.sub) + '</p></div>' + seletorDeEmpresa(codigo) + '</div>' +
      // As irmãs da mesma seção ficam à mão: pular de uma tabela para a outra sem voltar ao menu.
      '<div class="erp-abas nao-imprimir">' + s.itens.map((x) => '<a href="#/erp/' + x.id + '/' + encodeURIComponent(codigo) + '" class="' + (x.id === parte ? 'ativa' : '') + '">' +
        x.icone + ' ' + T.esc(x.titulo) + '</a>').join('') + '<a href="#/erp/config/' + encodeURIComponent(codigo) + '" class="suave">↩ Configurações</a></div>' +
      (emp ? '' : '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>A empresa <b>' + T.esc(codigo) + '</b> não está cadastrada. <a href="#/">Ver as empresas</a></div></div>') +
      corpo;
  }
  // Cada desenho da tela nasce dentro de um nó NOVO. Os eventos são ligados nele, nunca no #conteudo: assim
  // o nó velho leva os listeners embora quando a tela é redesenhada (senão um clique viraria dois, três…).
  function pintar(el, html) {
    el.innerHTML = '<div id="erp-raiz"></div>';
    const raizEl = el.querySelector('#erp-raiz');
    raizEl.innerHTML = html;
    const sel = raizEl.querySelector('#erp-empresa');
    if (sel) sel.addEventListener('change', () => { lembrarEmpresa(sel.value); app().ir('#/erp/' + (E.parte || 'plano') + '/' + encodeURIComponent(sel.value)); });
    return raizEl;
  }

  // Lista de problemas (o que impede o plano de ficar de pé).
  function htmlProblemas(problemas, oque) {
    if (!problemas.length) return '';
    return '<div class="aviso vermelho" style="margin:0 0 12px"><span class="icone-aviso">⚠️</span><div><b>' + problemas.length +
      ' problema(s) ' + oque + ':</b><div class="pequeno" style="margin-top:6px">' +
      problemas.slice(0, 12).map((p) => '<div>' + (p.conta ? '<b>' + T.esc(p.conta) + '</b> · ' : '') + T.esc(p.texto) + '</div>').join('') +
      (problemas.length > 12 ? '<div class="suave">e mais ' + (problemas.length - 12) + '…</div>' : '') + '</div></div></div>';
  }

  // ------------------------------------------------------------------
  // INÍCIO DO ERP: escolher a empresa e ver o que já está pronto
  // ------------------------------------------------------------------
  async function mostrarInicio(el, conferir) {
    T.carregando(el, 'Abrindo o ERP Solutta…');
    const empresas = app().empresas || [];
    if (!empresas.length) {
      el.innerHTML = '<div class="cabecalho"><div class="titulos"><h1>ERP Solutta</h1><p class="suave">O sistema contábil do escritório.</p></div></div>' +
        '<div class="aviso ambar"><span class="icone-aviso">🏢</span><div>Cadastre uma empresa primeiro. <a href="#/">Ir para as empresas</a></div></div>';
      return;
    }
    const lembrada = empresaLembrada();
    const escolhida = empresas.find((e) => String(e.codigo) === lembrada) || empresas[0];
    const sit = await D().situacao(escolhida.codigo);
    if (conferir && !conferir()) return;
    E.parte = '';
    const cod = escolhida.codigo;
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>🧮 ERP Solutta</h1>' +
      '<p class="suave">O sistema contábil do escritório.</p></div>' + seletorDeEmpresa(cod) + '</div>' +
      '<div class="grade-3">' +
      '<a class="cartao corpo cartao-link" href="#/erp/config/' + encodeURIComponent(cod) + '"><h3>⚙️ Configurações</h3>' +
      '<p class="suave pequeno" style="margin:6px 0 10px">As tabelas do sistema, por módulo.</p>' +
      '<p class="pequeno">📚 <b>Contabilidade</b>: plano de contas' + (sit.temLayout ? ' (' + sit.contas + ')' : ' <span class="falta">a fazer</span>') +
      ', centros de resultado' + (sit.centros ? ' (' + sit.centros + ')' : '') + ', naturezas de operação' + (sit.naturezas ? ' (' + sit.naturezas + ')' : '') + '</p></a>' +
      '<div class="cartao corpo"><h3>📝 Escrituração</h3><p class="suave pequeno" style="margin:6px 0 10px">Lançamento, lote, estorno e histórico padrão.</p>' +
      '<p class="pequeno suave">Próximo pedaço — depende das tabelas de contabilidade estarem de pé.</p></div>' +
      '<div class="cartao corpo"><h3>📚 Livros e obrigações</h3><p class="suave pequeno" style="margin:6px 0 10px">Diário, razão, balancete, SPED e impostos.</p>' +
      '<p class="pequeno suave">Vem depois da escrituração.</p></div>' +
      '</div>' +
      '<div class="cartao corpo" style="margin-top:14px"><h3>Como isso cresce</h3>' +
      '<p class="suave" style="margin-top:8px;line-height:1.6">As tabelas de <b>Configurações › Contabilidade</b> são a base. Com elas de pé, o próximo passo é o <b>lançamento contábil</b> ' +
      '(partida dobrada, lote, estorno e histórico padrão) e, depois dele, os <b>livros oficiais</b>, a <b>entrada automática</b> de nota e extrato, o <b>SPED</b> e a <b>apuração de impostos</b>. ' +
      'Cada pedaço entra funcionando, sem mexer no que já está pronto.</p>' +
      '<p class="suave pequeno" style="margin-top:8px">Os dados do ERP ficam numa pasta só dele, dentro de cada empresa (<b>erp/</b>), e entram no backup. ' +
      'No dia em que o ERP virar programa próprio, essa pasta vai junto.</p></div>');
  }

  // ------------------------------------------------------------------
  // CONFIGURAÇÕES: as seções e, dentro de cada uma, as tabelas
  // ------------------------------------------------------------------
  async function mostrarConfig(el, codigo, conferir) {
    T.carregando(el, 'Abrindo as configurações…');
    const empresas = app().empresas || [];
    const cod = String(codigo || empresaLembrada() || (empresas[0] || {}).codigo || '');
    if (!cod) { await mostrarInicio(el, conferir); return; }
    E.codigo = cod; E.parte = 'config';
    lembrarEmpresa(cod);
    const sit = await D().situacao(cod);
    if (conferir && !conferir()) return;
    const resumos = {
      plano: sit.temLayout ? '<b>' + sit.contas + '</b> conta(s) · layout pronto' : '<span class="falta">ainda sem layout</span> — comece por aqui',
      centros: sit.centros ? '<b>' + sit.centros + '</b> centro(s)' : '<span class="suave">nenhum ainda</span>',
      naturezas: sit.naturezas ? '<b>' + sit.naturezas + '</b> natureza(s)' : '<span class="suave">nenhuma ainda</span>',
    };
    pintar(el,
      '<nav class="erp-trilha nao-imprimir"><a href="#/erp">ERP Solutta</a> › <b>⚙️ Configurações</b></nav>' +
      '<div class="cabecalho"><div class="titulos"><h1>⚙️ Configurações</h1>' +
      '<p class="suave">As tabelas do sistema, por módulo. Elas valem para esta empresa.</p></div>' + seletorDeEmpresa(cod) + '</div>' +
      SECOES.map((s) => '<h3 class="apres-sub" id="' + s.id + '" style="margin-top:8px">' + s.icone + ' ' + T.esc(s.titulo) +
        ' <small class="suave">' + T.esc(s.sub) + '</small></h3>' +
        '<div class="grade-3">' + s.itens.map((i) => '<a class="cartao corpo cartao-link" href="#/erp/' + i.id + '/' + encodeURIComponent(cod) + '">' +
          '<h3>' + i.icone + ' ' + T.esc(i.titulo) + '</h3>' +
          '<p class="suave pequeno" style="margin:6px 0 10px">' + T.esc(i.sub) + '</p><p>' + (resumos[i.id] || '') + '</p></a>').join('') + '</div>').join('') +
      '<p class="apres-nota suave" style="margin-top:14px">Os outros módulos — fiscal, financeiro, estoque, folha — ganham a seção deles aqui conforme forem entrando.</p>');
  }

  // ------------------------------------------------------------------
  // PLANO DE CONTAS
  // ------------------------------------------------------------------
  async function mostrarPlano(el, codigo, conferir) {
    T.carregando(el, 'Abrindo o plano de contas…');
    E.codigo = String(codigo); E.parte = 'plano';
    lembrarEmpresa(codigo);
    const guardado = (await D().ler(codigo, 'plano')) || {};
    if (conferir && !conferir()) return;
    E.plano = { layout: guardado.layout || null, contas: guardado.contas || [] };
    desenharPlano(el);
  }

  function desenharPlano(el) {
    const dados = E.plano;
    if (!dados.layout) { ligarSemLayout(pintar(el, moldura(E.codigo, 'plano', telaSemLayout())), el); return; }
    const p = C().montarPlano(dados.contas, dados.layout);
    const L = p.layout;
    const barra = '<div class="md-barra">' +
      '<button type="button" class="botao primario" data-erp="nova-conta">+ Nova conta</button>' +
      '<button type="button" class="botao" data-erp="layout">⚙ Layout do plano</button>' +
      '<button type="button" class="botao pequeno" data-erp="importar">📥 Trazer do plano já carregado</button>' +
      '<button type="button" class="botao pequeno" data-erp="abrir-tudo">＋ Abrir todas</button>' +
      '<button type="button" class="botao pequeno" data-erp="fechar-tudo">－ Fechar todas</button>' +
      '<span class="md-ok">' + p.total + ' conta(s) · ' + p.analiticas + ' analítica(s) · ' + p.sinteticas + ' sintética(s)</span>' +
      '<span class="espaco"></span>' +
      '<input id="erp-busca" class="apres-campo" style="max-width:260px" placeholder="procurar conta (código ou nome)" value="' + T.esc(E.busca) + '">' +
      '</div>';
    const info = '<p class="apres-nota suave">Máscara <b>' + T.esc(L.mascara) + '</b> · ' + L.niveis.length + ' níveis (' +
      L.niveis.map((n) => T.esc(n)).join(' › ') + ') · grupos: ' + L.grupos.map((g) => '<b>' + T.esc(g.codigo) + '</b> ' + T.esc(g.nome)).join(' · ') + '</p>';
    const raizEl = pintar(el, moldura(E.codigo, 'plano', barra + htmlProblemas(p.problemas, 'no plano de contas') + info +
      '<div class="apres-caixa"><table class="apres md-tabela"><thead><tr>' +
      '<th class="fixa">Conta</th><th>Natureza</th><th>Tipo</th>' + (L.usaReduzido ? '<th>Reduzido</th>' : '') +
      '<th>Referencial</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead><tbody>' +
      (linhasDoPlano(p, L) || '<tr><td colspan="7" class="suave">Nenhuma conta ainda. Clique em <b>+ Nova conta</b> ou em <b>📥 Trazer do plano já carregado</b>.</td></tr>') +
      '</tbody></table></div>'));
    ligarPlano(raizEl, el);
  }

  // A árvore: mostra uma conta quando a mãe dela está aberta. Com busca, mostra quem casa e as mães.
  function visiveisDoPlano(p) {
    const busca = U.semAcento(E.busca || '').toUpperCase().trim();
    if (!E.abertos) { E.abertos = new Set(p.contas.filter((c) => c.nivel <= 2).map((c) => c.codigo)); }
    if (busca) {
      const casa = (c) => (c.codigo + ' ' + U.semAcento(c.nome).toUpperCase()).indexOf(busca) >= 0;
      const ficam = new Set();
      p.contas.filter(casa).forEach((c) => {
        ficam.add(c.codigo);
        let pai = c.pai;
        while (pai) { ficam.add(pai); const m = p.porCodigo.get(pai); pai = m ? m.pai : ''; }
      });
      return p.contas.filter((c) => ficam.has(c.codigo));
    }
    return p.contas.filter((c) => {
      let pai = c.pai;
      while (pai) { if (!E.abertos.has(pai)) return false; const m = p.porCodigo.get(pai); pai = m ? m.pai : ''; }
      return true;
    });
  }
  function linhasDoPlano(p, L) {
    return visiveisDoPlano(p).map((c) => {
      const aberto = E.abertos.has(c.codigo);
      return '<tr class="md-n' + Math.min(c.nivel, 6) + (c.analitica ? ' md-ana' : ' md-sin') + (c.situacao === 'inativa' ? ' erp-inativa' : '') + '">' +
        '<td class="md-conta" style="padding-left:' + (6 + (c.nivel - 1) * 16) + 'px">' +
        (c.analitica ? '<span class="md-folha"></span>' : '<button type="button" class="md-abre" data-erp-abre="' + T.esc(c.codigo) + '" aria-expanded="' + aberto + '">' + (aberto ? '▾' : '▸') + '</button>') +
        '<span class="cod">' + T.esc(c.codigo) + '</span> ' + T.esc(c.nome) + (c.filhas ? ' <small class="suave">' + c.filhas + '</small>' : '') + '</td>' +
        '<td><span class="dc ' + (c.natureza === 'D' ? 'd' : 'c') + '">' + c.natureza + '</span> <span class="pequeno suave">' + (c.natureza === 'D' ? 'devedora' : 'credora') + '</span></td>' +
        '<td class="pequeno">' + (c.analitica ? 'analítica <span class="suave">(recebe lançamento)</span>' : 'sintética') + '</td>' +
        (L.usaReduzido ? '<td class="pequeno">' + T.esc(c.reduzido || '—') + '</td>' : '') +
        '<td class="pequeno">' + T.esc(c.referencial || '—') + '</td>' +
        '<td class="pequeno">' + (c.situacao === 'inativa' ? '<span class="falta">inativa</span>' : 'ativa') + '</td>' +
        '<td class="nao-imprimir" style="white-space:nowrap">' +
        '<button type="button" class="lapis" data-erp-filha="' + T.esc(c.codigo) + '" title="Nova conta abaixo desta">＋</button> ' +
        '<button type="button" class="lapis" data-erp-editar="' + T.esc(c.codigo) + '" title="Editar">✎</button> ' +
        '<button type="button" class="lapis" data-erp-excluir="' + T.esc(c.codigo) + '" title="Excluir">🗑</button></td></tr>';
    }).join('');
  }

  // Tela de quando a empresa ainda não tem layout: escolher um modelo pronto.
  function telaSemLayout() {
    return '<div class="aviso info"><span class="icone-aviso">📐</span><div><b>Antes das contas vem o layout.</b> ' +
      'É ele que diz como o código da conta é montado — quantos níveis, quantos dígitos em cada um — e quais são os grupos de 1º nível. ' +
      'Com o layout, o programa sabe sozinho em que nível cada conta está, quem é a conta de cima e se o código está certo.</div></div>' +
      '<div class="grade-3" style="margin-top:12px">' +
      C().MODELOS.map((m) => '<div class="cartao corpo"><h3>' + T.esc(m.nome) + '</h3>' +
        '<p class="pequeno" style="margin:8px 0"><b>Máscara</b> <code>' + T.esc(m.mascara) + '</code></p>' +
        '<p class="pequeno suave" style="margin:0 0 8px">' + m.niveis.map((n) => T.esc(n)).join(' › ') + '</p>' +
        '<p class="pequeno">' + m.grupos.map((g) => T.esc(g.codigo + ' ' + g.nome)).join('<br>') + '</p>' +
        '<button type="button" class="botao primario" style="margin-top:10px" data-erp-modelo="' + T.esc(m.id) + '">Começar com este</button></div>').join('') +
      '</div>' +
      '<div class="cartao corpo" style="margin-top:14px"><h3>Ou traga o plano que já existe</h3>' +
      '<p class="suave" style="margin:8px 0;line-height:1.55">Se esta empresa já tem um plano de contas carregado no Conciliador, o programa descobre a máscara sozinho ' +
      'e traz as contas prontas — é só conferir os grupos depois.</p>' +
      '<button type="button" class="botao" data-erp="importar">📥 Trazer do plano já carregado</button></div>';
  }
  function ligarSemLayout(raizEl, el) {
    raizEl.addEventListener('click', async (ev) => {
      const m = ev.target.closest('[data-erp-modelo]');
      if (m) {
        const modelo = C().MODELOS.find((x) => x.id === m.getAttribute('data-erp-modelo'));
        if (!modelo) return;
        await salvarPlano(el, { layout: { mascara: modelo.mascara, niveis: modelo.niveis.slice(), grupos: modelo.grupos.map((g) => Object.assign({}, g)), usaReduzido: false, exigeCentro: false }, contas: [] },
          'Layout criado: agora cadastre as contas.');
        return;
      }
      if (ev.target.closest('[data-erp="importar"]')) await importarPlano(el);
    });
  }

  async function salvarPlano(el, dados, aviso) {
    try {
      await D().gravar(E.codigo, 'plano', dados);
      E.plano = dados;
      if (aviso) T.avisoRapido(aviso, 'ok', 4000);
      desenharPlano(el);
    } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
  }

  function ligarPlano(raizEl, el) {
    const busca = raizEl.querySelector('#erp-busca');
    if (busca) busca.addEventListener('input', T.debounce(() => { E.busca = busca.value; desenharPlano(el); el.querySelector('#erp-busca').focus(); }, 250));
    raizEl.addEventListener('click', async (ev) => {
      const abre = ev.target.closest('[data-erp-abre]');
      if (abre) {
        const c = abre.getAttribute('data-erp-abre');
        if (E.abertos.has(c)) E.abertos.delete(c); else E.abertos.add(c);
        desenharPlano(el);
        return;
      }
      const acao = ev.target.closest('[data-erp]');
      if (acao) {
        const q = acao.getAttribute('data-erp');
        if (q === 'nova-conta') await formularioConta(el, null, '');
        else if (q === 'layout') await formularioLayout(el);
        else if (q === 'importar') await importarPlano(el);
        else if (q === 'abrir-tudo') { E.abertos = new Set(E.plano.contas.map((c) => String(c.codigo))); desenharPlano(el); }
        else if (q === 'fechar-tudo') { E.abertos = new Set(); desenharPlano(el); }
        return;
      }
      const filha = ev.target.closest('[data-erp-filha]');
      if (filha) { await formularioConta(el, null, filha.getAttribute('data-erp-filha')); return; }
      const editar = ev.target.closest('[data-erp-editar]');
      if (editar) { await formularioConta(el, editar.getAttribute('data-erp-editar'), ''); return; }
      const excluir = ev.target.closest('[data-erp-excluir]');
      if (excluir) { await excluirConta(el, excluir.getAttribute('data-erp-excluir')); return; }
    });
  }

  // Formulário de uma conta. pai: quando vem do "+" de uma conta, já sugere o próximo código livre dentro dela.
  async function formularioConta(el, codigoAntigo, pai) {
    const dados = E.plano;
    const L = C().lerLayout(dados.layout);
    if (!L.ok) { T.avisoRapido(L.erro, 'erro', 6000); return; }
    const atual = codigoAntigo ? (dados.contas.find((c) => String(c.codigo) === String(codigoAntigo)) || {}) : {};
    const sugerido = codigoAntigo ? atual.codigo : C().proximoCodigo(dados.contas, pai, L);
    const grupoDe = (cod) => { const g = String(cod || '').split(L.separador)[0]; return L.grupos.find((x) => x.codigo === g) || null; };
    const g0 = grupoDe(sugerido);
    const naturezaPadrao = g0 ? C().ESPECIE[g0.especie].natureza : 'D';
    const salvo = await T.janela({
      titulo: codigoAntigo ? 'Editar a conta ' + codigoAntigo : 'Nova conta',
      larga: true,
      corpo: '<div class="grade-form">' +
        '<div class="campo"><label for="f-codigo">Código *</label><input id="f-codigo" value="' + T.esc(sugerido || '') + '" placeholder="' + T.esc(L.mascara) + '"' + (codigoAntigo ? '' : ' autofocus') + '>' +
        '<span class="ajuda">Máscara <b>' + T.esc(L.mascara) + '</b> · níveis: ' + L.niveis.map((n) => T.esc(n)).join(' › ') + '</span></div>' +
        '<div class="campo inteiro"><label for="f-nome">Nome *</label><input id="f-nome" maxlength="120" value="' + T.esc(atual.nome || '') + '"' + (codigoAntigo ? ' autofocus' : '') + ' placeholder="Ex.: Caixa Matriz"></div>' +
        (L.usaReduzido ? '<div class="campo"><label for="f-reduzido">Código reduzido</label><input id="f-reduzido" maxlength="20" value="' + T.esc(atual.reduzido || '') + '" placeholder="Ex.: 69"><span class="ajuda">O número curto que o sistema usa no dia a dia.</span></div>' : '') +
        '<div class="campo"><label for="f-natureza">Natureza</label><select id="f-natureza">' +
        ['D', 'C'].map((n) => '<option value="' + n + '"' + ((atual.natureza || naturezaPadrao) === n ? ' selected' : '') + '>' + (n === 'D' ? 'Devedora (D)' : 'Credora (C)') + '</option>').join('') +
        '</select><span class="ajuda">O normal vem do grupo; uma redutora (por exemplo "(-) ICMS sobre vendas") vai ao contrário.</span></div>' +
        '<div class="campo"><label for="f-referencial">Conta referencial (SPED)</label><input id="f-referencial" maxlength="30" value="' + T.esc(atual.referencial || '') + '" placeholder="Ex.: 1.01.01.01.00"></div>' +
        '<div class="campo"><label for="f-situacao">Situação</label><select id="f-situacao">' +
        '<option value="ativa"' + (atual.situacao !== 'inativa' ? ' selected' : '') + '>Ativa</option>' +
        '<option value="inativa"' + (atual.situacao === 'inativa' ? ' selected' : '') + '>Inativa (não aceita lançamento novo)</option></select></div>' +
        '<div class="campo inteiro"><label class="caixa-opcao"><input type="checkbox" id="f-centro"' + (atual.centro ? ' checked' : '') + '> Exigir centro de resultado no lançamento desta conta</label></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc(atual.observacao || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, {
        texto: codigoAntigo ? 'Salvar' : 'Cadastrar', tipo: 'primario',
        antes: (j) => {
          const nova = {
            codigo: j.querySelector('#f-codigo').value.trim(),
            nome: j.querySelector('#f-nome').value.trim(),
            reduzido: j.querySelector('#f-reduzido') ? j.querySelector('#f-reduzido').value.trim() : (atual.reduzido || ''),
            natureza: j.querySelector('#f-natureza').value,
            referencial: j.querySelector('#f-referencial').value.trim(),
            situacao: j.querySelector('#f-situacao').value,
            centro: j.querySelector('#f-centro').checked,
            observacao: j.querySelector('#f-obs').value.trim(),
          };
          const r = C().conferirConta(nova, dados.contas, L, codigoAntigo);
          if (!r.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(r.erro) + '</div>'; return false; }
          return r.conta;
        },
      }],
    });
    if (!salvo) return;
    const contas = dados.contas.filter((c) => String(c.codigo) !== String(codigoAntigo)).concat([salvo]);
    E.abertos.add(C().paiDe(salvo.codigo, L));
    await salvarPlano(el, { layout: dados.layout, contas }, codigoAntigo ? 'Conta salva.' : 'Conta ' + salvo.codigo + ' cadastrada.');
  }

  async function excluirConta(el, codigo) {
    const dados = E.plano;
    const pode = C().podeExcluir(codigo, dados.contas, dados.layout);
    if (!pode.ok) { await T.janela({ titulo: 'Não dá para excluir agora', corpo: '<p style="line-height:1.5">' + T.esc(pode.erro) + '</p>' }); return; }
    const conta = dados.contas.find((c) => String(c.codigo) === String(codigo)) || {};
    const ok = await T.confirmar({ titulo: 'Excluir a conta ' + codigo + '?',
      texto: 'A conta <b>' + T.esc(codigo + ' ' + (conta.nome || '')) + '</b> sai do plano de contas desta empresa.', botao: '🗑 Excluir', perigo: true });
    if (!ok) return;
    await salvarPlano(el, { layout: dados.layout, contas: dados.contas.filter((c) => String(c.codigo) !== String(codigo)) }, 'Conta excluída.');
  }

  // ------------------------------------------------------------------
  // O LAYOUT: máscara, nome dos níveis, grupos de 1º nível e as duas opções
  // ------------------------------------------------------------------
  async function formularioLayout(el) {
    const dados = E.plano;
    const atual = C().lerLayout(dados.layout);
    const base = atual.ok ? atual : { mascara: '1.01.001.0001', niveis: ['Grupo', 'Subgrupo', 'Conta', 'Analítica'], grupos: C().MODELOS[0].grupos, usaReduzido: false, exigeCentro: false };
    const linhaGrupo = (g) => '<tr><td><input class="apres-campo g-codigo" value="' + T.esc(g.codigo || '') + '" style="width:80px"></td>' +
      '<td><input class="apres-campo g-nome" value="' + T.esc(g.nome || '') + '"></td>' +
      '<td><select class="apres-campo g-especie">' + C().ESPECIES.map((e) => '<option value="' + e.id + '"' + (g.especie === e.id ? ' selected' : '') + '>' +
        T.esc(e.nome) + ' (' + e.natureza + ')</option>').join('') + '</select></td>' +
      '<td><button type="button" class="lapis" data-g-tirar title="Tirar este grupo">🗑</button></td></tr>';
    const salvo = await T.janela({
      titulo: 'Layout do plano de contas',
      larga: true,
      corpo: '<p class="suave" style="line-height:1.55;margin:0 0 12px">A <b>máscara</b> diz como o código é montado. Escreva um exemplo de conta analítica — ' +
        '<code>1.01.001.0001</code> — ou use 9 no lugar dos números: <code>9.99.999.9999</code>.</p>' +
        '<div class="grade-form"><div class="campo"><label for="f-mascara">Máscara *</label><input id="f-mascara" value="' + T.esc(base.mascara) + '" autofocus></div>' +
        '<div class="campo"><label>Como ficou</label><div id="f-previa" class="pequeno"></div></div></div>' +
        '<h3 class="apres-sub" style="margin-top:14px">Nome de cada nível</h3><div id="f-niveis" class="grade-form"></div>' +
        '<h3 class="apres-sub" style="margin-top:14px">Grupos de 1º nível</h3>' +
        '<p class="suave pequeno" style="margin:0 0 8px">A <b>espécie</b> diz onde o grupo entra (balanço ou DRE) e qual é a natureza normal dele.</p>' +
        '<table class="apres"><thead><tr><th style="width:90px">Código</th><th>Nome</th><th style="width:280px">Espécie</th><th style="width:40px"></th></tr></thead>' +
        '<tbody id="f-grupos">' + base.grupos.map(linhaGrupo).join('') + '</tbody></table>' +
        '<button type="button" class="botao pequeno" id="f-mais-grupo" style="margin-top:8px">+ Grupo</button>' +
        '<h3 class="apres-sub" style="margin-top:14px">Opções</h3>' +
        '<label class="caixa-opcao"><input type="checkbox" id="f-reduzido"' + (base.usaReduzido ? ' checked' : '') + '> Usar <b>código reduzido</b> nas contas (o número curto do dia a dia)</label> ' +
        '<label class="caixa-opcao"><input type="checkbox" id="f-centro"' + (base.exigeCentro ? ' checked' : '') + '> Exigir <b>centro de resultado</b> nas contas de resultado</label>' +
        '<div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, {
        texto: 'Salvar o layout', tipo: 'primario',
        antes: async (j) => {
          const novo = lerFormularioLayout(j);
          const r = C().lerLayout(novo);
          if (!r.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(r.erro) + '</div>'; return false; }
          // Mudar a máscara com contas cadastradas pode deixar código fora do desenho: mostra antes.
          if (dados.contas.length) {
            const antes = C().montarPlano(dados.contas, dados.layout).problemas.length;
            const depois = C().montarPlano(dados.contas, novo).problemas.length;
            if (depois > antes) {
              const segue = await T.confirmar({ titulo: 'O layout novo não serve para todas as contas',
                texto: 'Com este layout, <b>' + depois + '</b> conta(s) ficam com problema (hoje são ' + antes + '). As contas não somem — elas aparecem na lista de problemas até serem acertadas.',
                botao: 'Salvar assim mesmo', perigo: true });
              if (!segue) return false;
            }
          }
          return novo;
        },
      }],
      aoAbrir: (j) => {
        const campo = j.querySelector('#f-mascara');
        const previa = j.querySelector('#f-previa');
        const niveis = j.querySelector('#f-niveis');
        const nomesAtuais = (base.niveis || []).slice();
        function redesenhar() {
          const m = C().lerMascara(campo.value);
          if (!m.ok) { previa.innerHTML = '<span class="falta">' + T.esc(m.erro) + '</span>'; return; }
          previa.innerHTML = '<b>' + T.esc(m.texto) + '</b> · ' + m.niveis.length + ' níveis · exemplo: <code>' +
            T.esc(m.niveis.map((n, i) => String(i === 0 ? 1 : 1).padStart(n, '0')).join(m.separador)) + '</code>';
          const guardados = Array.from(niveis.querySelectorAll('.n-nome')).map((x) => x.value);
          niveis.innerHTML = m.niveis.map((n, i) => '<div class="campo"><label>Nível ' + (i + 1) + ' (' + n + ' dígito' + (n > 1 ? 's' : '') + ')</label>' +
            '<input class="apres-campo n-nome" value="' + T.esc(guardados[i] || nomesAtuais[i] || ('Nível ' + (i + 1))) + '"></div>').join('');
        }
        campo.addEventListener('input', redesenhar);
        redesenhar();
        j.querySelector('#f-mais-grupo').addEventListener('click', () => {
          const corpo = j.querySelector('#f-grupos');
          const tr = document.createElement('tbody');
          tr.innerHTML = linhaGrupo({ codigo: '', nome: '', especie: 'ativo' });
          corpo.appendChild(tr.firstChild);
        });
        j.querySelector('#f-grupos').addEventListener('click', (ev) => {
          const bt = ev.target.closest('[data-g-tirar]');
          if (bt) bt.closest('tr').remove();
        });
      },
    });
    if (!salvo) return;
    await salvarPlano(el, { layout: salvo, contas: dados.contas }, 'Layout salvo.');
  }
  function lerFormularioLayout(j) {
    return {
      mascara: j.querySelector('#f-mascara').value.trim(),
      niveis: Array.from(j.querySelectorAll('.n-nome')).map((x) => x.value.trim()),
      grupos: Array.from(j.querySelectorAll('#f-grupos tr')).map((tr) => ({
        codigo: tr.querySelector('.g-codigo').value.trim(),
        nome: tr.querySelector('.g-nome').value.trim(),
        especie: tr.querySelector('.g-especie').value,
      })).filter((g) => g.codigo || g.nome),
      usaReduzido: j.querySelector('#f-reduzido').checked,
      exigeCentro: j.querySelector('#f-centro').checked,
    };
  }

  // ------------------------------------------------------------------
  // TRAZER O PLANO QUE JÁ FOI CARREGADO no Conciliador (não digitar 2.500 contas à mão)
  // ------------------------------------------------------------------
  async function importarPlano(el) {
    const arm = app().armazenamento;
    let metas = [];
    try { metas = (await arm.arquivos(E.codigo)).filter((m) => m.tipo === 'plano'); } catch (e) { metas = []; }
    if (!metas.length) {
      await T.janela({ titulo: 'Esta empresa ainda não tem plano carregado',
        corpo: '<p style="line-height:1.55">No Conciliador, abra <b>Apresentação</b> e carregue o arquivo no cartão <b>Plano de contas</b>. ' +
          'Depois volte aqui e clique de novo em <b>📥 Trazer do plano já carregado</b>.</p>' });
      return;
    }
    metas.sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    const doc = await arm.conteudoDoArquivo(metas[0].id);
    const vindas = ((doc && doc.contas) || []).filter((c) => c && c.conta && c.titulo);
    if (!vindas.length) { T.avisoRapido('O plano carregado não trouxe conta nenhuma.', 'erro', 6000); return; }
    const m = C().mascaraDosCodigos(vindas.map((c) => c.conta));
    const atual = C().lerLayout(E.plano.layout);
    // Com o plano ainda vazio, quem manda é a máscara do arquivo. Com contas cadastradas, a máscara de casa
    // continua valendo (trocar ela aqui bagunçaria o que já existe) — e o aviso diz o que não vai bater.
    const trocarMascara = m.ok && (!atual.ok || (!E.plano.contas.length && atual.mascara !== m.mascara));
    const mascara = trocarMascara ? m.mascara : (atual.ok ? atual.mascara : '');
    if (!mascara) { T.avisoRapido(m.erro || 'Não consegui descobrir a máscara desse plano.', 'erro', 7000); return; }
    // Os grupos de 1º nível saem do próprio arquivo; a espécie é um palpite pelo código (1 ativo, 2 passivo…)
    // e ele confere no layout depois.
    const sep = mascara.indexOf('.') >= 0 ? '.' : '-';
    const PALPITE = { 1: 'ativo', 2: 'passivo', 3: 'resultado', 4: 'despesa', 5: 'despesa', 6: 'compensacao' };
    const porConta = new Map(vindas.map((c) => [String(c.conta), c]));
    const grupos = atual.ok ? atual.grupos.slice() : [];
    vindas.forEach((c) => {
      const g = String(c.conta).split(sep)[0];
      if (grupos.some((x) => x.codigo === g)) return;
      const propria = porConta.get(g);
      // Grupo que o arquivo tem e o layout não tinha ENTRA (senão as contas dele ficariam todas de fora).
      grupos.push({ codigo: g, nome: (propria && propria.titulo) || ('GRUPO ' + g), especie: PALPITE[Number(g)] || 'ativo' });
    });
    grupos.sort((a, b) => Number(a.codigo) - Number(b.codigo) || String(a.codigo).localeCompare(String(b.codigo)));
    const layout = atual.ok
      ? Object.assign({}, E.plano.layout, { mascara, grupos })
      : { mascara, niveis: [], grupos, usaReduzido: vindas.some((c) => c.reduzido), exigeCentro: false };
    const contas = vindas.map((c) => ({ codigo: String(c.conta), nome: String(c.titulo), reduzido: c.reduzido ? String(c.reduzido) : '', situacao: 'ativa' }));
    const p = C().montarPlano(contas, layout);
    const ok = await T.confirmar({ titulo: 'Trazer ' + contas.length + ' conta(s) do plano carregado?',
      texto: 'Arquivo <b>' + T.esc(metas[0].arquivo || '') + '</b>.<br>Máscara: <b>' + T.esc(mascara) + '</b>' +
        (trocarMascara && atual.ok ? ' <span class="suave">(era ' + T.esc(atual.mascara) + ' — o arquivo manda, porque ainda não há conta cadastrada)</span>' : '') +
        ' · grupos: ' + grupos.map((g) => T.esc(g.codigo)).join(', ') + '.<br>' +
        (p.problemas.length ? '<span class="falta">' + p.problemas.length + ' conta(s) vão entrar com problema</span> (aparecem na lista para você acertar).' : 'Todas as contas batem com a máscara.') +
        (E.plano.contas.length ? '<br><b>As ' + E.plano.contas.length + ' conta(s) que já estão aqui serão substituídas.</b>' : ''),
      botao: '📥 Trazer as contas', perigo: !!E.plano.contas.length });
    if (!ok) return;
    E.abertos = null;
    await salvarPlano(el, { layout, contas }, contas.length + ' conta(s) trazidas. Confira os grupos em ⚙ Layout do plano.');
  }

  // ------------------------------------------------------------------
  // CENTROS DE RESULTADO
  // ------------------------------------------------------------------
  async function mostrarCentros(el, codigo, conferir) {
    T.carregando(el, 'Abrindo os centros de resultado…');
    E.codigo = String(codigo); E.parte = 'centros';
    lembrarEmpresa(codigo);
    const guardado = (await D().ler(codigo, 'centros')) || {};
    if (conferir && !conferir()) return;
    E.centros = { layout: guardado.layout || { mascara: '99.99' }, centros: guardado.centros || [] };
    desenharCentros(el);
  }
  function desenharCentros(el) {
    const dados = E.centros;
    const r = C().montarCentros(dados.centros, dados.layout);
    const corpo = '<div class="md-barra">' +
      '<button type="button" class="botao primario" data-erp="novo-centro">+ Novo centro</button>' +
      '<button type="button" class="botao" data-erp="mascara-centro">⚙ Máscara</button>' +
      '<span class="md-ok">' + r.total + ' centro(s) · ' + r.analiticos + ' que recebem lançamento</span></div>' +
      '<p class="apres-nota suave">Máscara <b>' + T.esc(r.layout ? r.layout.mascara : '') + '</b>. ' +
      'O centro de resultado divide receita e despesa por <b>loja, obra, projeto ou setor</b> — a conta diz <i>o quê</i>, o centro diz <i>onde</i>.</p>' +
      htmlProblemas(r.problemas, 'nos centros de resultado') +
      '<div class="apres-caixa"><table class="apres md-tabela"><thead><tr><th class="fixa">Centro</th><th>Tipo</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead><tbody>' +
      (r.centros.map((c) => '<tr class="md-n' + Math.min(c.nivel, 6) + (c.analitica ? ' md-ana' : ' md-sin') + (c.situacao === 'inativa' ? ' erp-inativa' : '') + '">' +
        '<td class="md-conta" style="padding-left:' + (6 + (c.nivel - 1) * 16) + 'px"><span class="cod">' + T.esc(c.codigo) + '</span> ' + T.esc(c.nome) + '</td>' +
        '<td class="pequeno">' + (c.analitica ? 'recebe lançamento' : 'agrupador') + '</td>' +
        '<td class="pequeno">' + (c.situacao === 'inativa' ? '<span class="falta">inativo</span>' : 'ativo') + '</td>' +
        '<td class="nao-imprimir" style="white-space:nowrap">' +
        '<button type="button" class="lapis" data-erp-editar="' + T.esc(c.codigo) + '" title="Editar">✎</button> ' +
        '<button type="button" class="lapis" data-erp-excluir="' + T.esc(c.codigo) + '" title="Excluir">🗑</button></td></tr>').join('') ||
        '<tr><td colspan="4" class="suave">Nenhum centro ainda. Clique em <b>+ Novo centro</b>.</td></tr>') +
      '</tbody></table></div>';
    const raizEl = pintar(el, moldura(E.codigo, 'centros', corpo));
    raizEl.addEventListener('click', async (ev) => {
      const acao = ev.target.closest('[data-erp]');
      if (acao) {
        if (acao.getAttribute('data-erp') === 'novo-centro') await formularioCentro(el, null);
        else if (acao.getAttribute('data-erp') === 'mascara-centro') await formularioMascaraCentro(el);
        return;
      }
      const editar = ev.target.closest('[data-erp-editar]');
      if (editar) { await formularioCentro(el, editar.getAttribute('data-erp-editar')); return; }
      const excluir = ev.target.closest('[data-erp-excluir]');
      if (excluir) {
        const cod = excluir.getAttribute('data-erp-excluir');
        const filhas = dados.centros.filter((c) => C().paiDe(c.codigo, { ok: true, separador: (dados.layout.mascara || '99.99').indexOf('.') >= 0 ? '.' : '-' }) === cod).length;
        if (filhas) { await T.janela({ titulo: 'Não dá para excluir agora', corpo: '<p>O centro ' + T.esc(cod) + ' tem ' + filhas + ' centro(s) abaixo dele. Exclua os de baixo primeiro.</p>' }); return; }
        const ok = await T.confirmar({ titulo: 'Excluir o centro ' + cod + '?', texto: 'Ele sai da lista desta empresa.', botao: '🗑 Excluir', perigo: true });
        if (!ok) return;
        await salvarCentros(el, { layout: dados.layout, centros: dados.centros.filter((c) => String(c.codigo) !== String(cod)) }, 'Centro excluído.');
      }
    });
  }
  async function salvarCentros(el, dados, aviso) {
    try {
      await D().gravar(E.codigo, 'centros', dados);
      E.centros = dados;
      if (aviso) T.avisoRapido(aviso, 'ok', 4000);
      desenharCentros(el);
    } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
  }
  async function formularioMascaraCentro(el) {
    const dados = E.centros;
    const salvo = await T.janela({
      titulo: 'Máscara dos centros de resultado',
      corpo: '<p class="suave" style="line-height:1.55;margin:0 0 12px">Quase sempre basta dois níveis: <code>99.99</code> — o primeiro é a área (01 Administração, 02 Comercial) e o segundo é o detalhe.</p>' +
        '<div class="campo"><label for="f-mascara">Máscara *</label><input id="f-mascara" autofocus value="' + T.esc(dados.layout.mascara || '99.99') + '"></div><div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', tipo: 'primario', antes: (j) => {
        const mascara = j.querySelector('#f-mascara').value.trim();
        const m = C().lerMascara(mascara);
        if (!m.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(m.erro) + '</div>'; return false; }
        return { mascara: m.texto };
      } }],
    });
    if (!salvo) return;
    await salvarCentros(el, { layout: salvo, centros: dados.centros }, 'Máscara salva.');
  }
  async function formularioCentro(el, codigoAntigo) {
    const dados = E.centros;
    const atual = codigoAntigo ? (dados.centros.find((c) => String(c.codigo) === String(codigoAntigo)) || {}) : {};
    const salvo = await T.janela({
      titulo: codigoAntigo ? 'Editar o centro ' + codigoAntigo : 'Novo centro de resultado',
      corpo: '<div class="grade-form">' +
        '<div class="campo"><label for="f-codigo">Código *</label><input id="f-codigo" value="' + T.esc(atual.codigo || '') + '" placeholder="' + T.esc(dados.layout.mascara || '99.99') + '"' + (codigoAntigo ? '' : ' autofocus') + '></div>' +
        '<div class="campo inteiro"><label for="f-nome">Nome *</label><input id="f-nome" maxlength="80" value="' + T.esc(atual.nome || '') + '"' + (codigoAntigo ? ' autofocus' : '') + ' placeholder="Ex.: Loja Centro"></div>' +
        '<div class="campo"><label for="f-situacao">Situação</label><select id="f-situacao">' +
        '<option value="ativa"' + (atual.situacao !== 'inativa' ? ' selected' : '') + '>Ativo</option>' +
        '<option value="inativa"' + (atual.situacao === 'inativa' ? ' selected' : '') + '>Inativo</option></select></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc(atual.observacao || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: codigoAntigo ? 'Salvar' : 'Cadastrar', tipo: 'primario', antes: (j) => {
        const novo = { codigo: j.querySelector('#f-codigo').value.trim(), nome: j.querySelector('#f-nome').value.trim(),
          situacao: j.querySelector('#f-situacao').value, observacao: j.querySelector('#f-obs').value.trim() };
        const outros = dados.centros.filter((c) => String(c.codigo) !== String(codigoAntigo));
        const r = C().montarCentros(outros.concat([novo]), dados.layout);
        const meu = r.problemas.filter((p) => p.conta === novo.codigo || !p.conta);
        if (meu.length) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(meu[0].texto) + '</div>'; return false; }
        return novo;
      } }],
    });
    if (!salvo) return;
    await salvarCentros(el, { layout: dados.layout, centros: dados.centros.filter((c) => String(c.codigo) !== String(codigoAntigo)).concat([salvo]) },
      codigoAntigo ? 'Centro salvo.' : 'Centro ' + salvo.codigo + ' cadastrado.');
  }

  // ------------------------------------------------------------------
  // NATUREZAS DE OPERAÇÃO
  // ------------------------------------------------------------------
  async function mostrarNaturezas(el, codigo, conferir) {
    T.carregando(el, 'Abrindo as naturezas de operação…');
    E.codigo = String(codigo); E.parte = 'naturezas';
    lembrarEmpresa(codigo);
    const guardado = (await D().ler(codigo, 'naturezas')) || {};
    const plano = (await D().ler(codigo, 'plano')) || {};
    if (conferir && !conferir()) return;
    E.naturezas = { naturezas: guardado.naturezas || [] };
    E.planoDasNaturezas = plano.layout ? C().montarPlano(plano.contas || [], plano.layout) : null;
    desenharNaturezas(el);
  }
  function desenharNaturezas(el) {
    const lista = E.naturezas.naturezas;
    const problemas = C().conferirNaturezas(lista, E.planoDasNaturezas);
    const corpo = '<div class="md-barra">' +
      '<button type="button" class="botao primario" data-erp="nova-natureza">+ Nova natureza</button>' +
      (lista.length ? '' : '<button type="button" class="botao" data-erp="padrao">📋 Trazer as 10 mais usadas</button>') +
      '<span class="md-ok">' + lista.length + ' natureza(s)</span></div>' +
      '<p class="apres-nota suave">A natureza diz <b>o que a nota é</b> — venda, compra, devolução, remessa — e <b>o que ela gera</b>: estoque, financeiro e o lançamento contábil. ' +
      'É por ela que a nota vira lançamento sozinha, quando a entrada automática entrar.</p>' +
      htmlProblemas(problemas, 'nas naturezas') +
      '<div class="apres-caixa"><table class="apres"><thead><tr><th style="width:80px">Código</th><th>Descrição</th><th>Finalidade</th><th>CFOP</th>' +
      '<th>Gera</th><th>Débito</th><th>Crédito</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead><tbody>' +
      (lista.slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true })).map((n) => {
        const f = C().FINALIDADE[n.finalidade];
        return '<tr' + (n.situacao === 'inativa' ? ' class="erp-inativa"' : '') + '>' +
          '<td><b>' + T.esc(n.codigo) + '</b></td><td>' + T.esc(n.nome) + '</td>' +
          '<td class="pequeno">' + T.esc(f ? f.nome : '—') + ' <span class="suave">' + (f ? (f.lado === 'entrada' ? '(entrada)' : '(saída)') : '') + '</span></td>' +
          '<td class="pequeno">' + T.esc(n.cfop || '—') + '</td>' +
          '<td class="pequeno">' + [n.estoque ? 'estoque' : '', n.financeiro ? 'financeiro' : ''].filter(Boolean).join(' + ') + (!n.estoque && !n.financeiro ? '—' : '') + '</td>' +
          '<td class="pequeno">' + T.esc(n.contaDebito || '—') + '</td><td class="pequeno">' + T.esc(n.contaCredito || '—') + '</td>' +
          '<td class="pequeno">' + (n.situacao === 'inativa' ? '<span class="falta">inativa</span>' : 'ativa') + '</td>' +
          '<td class="nao-imprimir" style="white-space:nowrap">' +
          '<button type="button" class="lapis" data-erp-editar="' + T.esc(n.codigo) + '" title="Editar">✎</button> ' +
          '<button type="button" class="lapis" data-erp-excluir="' + T.esc(n.codigo) + '" title="Excluir">🗑</button></td></tr>';
      }).join('') || '<tr><td colspan="9" class="suave">Nenhuma natureza ainda. Clique em <b>+ Nova natureza</b> ou traga as 10 mais usadas.</td></tr>') +
      '</tbody></table></div>';
    const raizEl = pintar(el, moldura(E.codigo, 'naturezas', corpo));
    raizEl.addEventListener('click', async (ev) => {
      const acao = ev.target.closest('[data-erp]');
      if (acao) {
        if (acao.getAttribute('data-erp') === 'nova-natureza') await formularioNatureza(el, null);
        else if (acao.getAttribute('data-erp') === 'padrao') {
          await salvarNaturezas(el, { naturezas: C().NATUREZAS_PADRAO.map((n) => Object.assign({ situacao: 'ativa', contaDebito: '', contaCredito: '' }, n)) },
            '10 naturezas trazidas. Ajuste o CFOP e as contas de cada uma.');
        }
        return;
      }
      const editar = ev.target.closest('[data-erp-editar]');
      if (editar) { await formularioNatureza(el, editar.getAttribute('data-erp-editar')); return; }
      const excluir = ev.target.closest('[data-erp-excluir]');
      if (excluir) {
        const cod = excluir.getAttribute('data-erp-excluir');
        const ok = await T.confirmar({ titulo: 'Excluir a natureza ' + cod + '?', texto: 'Ela sai da lista desta empresa.', botao: '🗑 Excluir', perigo: true });
        if (!ok) return;
        await salvarNaturezas(el, { naturezas: E.naturezas.naturezas.filter((n) => String(n.codigo) !== String(cod)) }, 'Natureza excluída.');
      }
    });
  }
  async function salvarNaturezas(el, dados, aviso) {
    try {
      await D().gravar(E.codigo, 'naturezas', dados);
      E.naturezas = dados;
      if (aviso) T.avisoRapido(aviso, 'ok', 4000);
      desenharNaturezas(el);
    } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
  }
  async function formularioNatureza(el, codigoAntigo) {
    const lista = E.naturezas.naturezas;
    const atual = codigoAntigo ? (lista.find((n) => String(n.codigo) === String(codigoAntigo)) || {}) : {};
    const p = E.planoDasNaturezas;
    const analiticas = p ? p.contas.filter((c) => c.analitica && c.situacao === 'ativa') : [];
    const opcoesConta = (escolhida) => '<option value="">— nenhuma —</option>' + analiticas.map((c) => '<option value="' + T.esc(c.codigo) + '"' +
      (String(escolhida || '') === c.codigo ? ' selected' : '') + '>' + T.esc(c.codigo + ' · ' + c.nome) + '</option>').join('');
    const semPlano = !analiticas.length;
    const salvo = await T.janela({
      titulo: codigoAntigo ? 'Editar a natureza ' + codigoAntigo : 'Nova natureza de operação',
      larga: true,
      corpo: '<div class="grade-form">' +
        '<div class="campo"><label for="f-codigo">Código *</label><input id="f-codigo" maxlength="10" value="' + T.esc(atual.codigo || '') + '"' + (codigoAntigo ? '' : ' autofocus') + ' placeholder="Ex.: 1"></div>' +
        '<div class="campo inteiro"><label for="f-nome">Descrição *</label><input id="f-nome" maxlength="80" value="' + T.esc(atual.nome || '') + '"' + (codigoAntigo ? ' autofocus' : '') + ' placeholder="Ex.: Venda de mercadoria"></div>' +
        '<div class="campo"><label for="f-finalidade">Finalidade *</label><select id="f-finalidade">' +
        C().FINALIDADES.map((f) => '<option value="' + f.id + '"' + (atual.finalidade === f.id ? ' selected' : '') + '>' + T.esc(f.nome) + ' (' + (f.lado === 'entrada' ? 'entrada' : 'saída') + ')</option>').join('') +
        '</select></div>' +
        '<div class="campo"><label for="f-cfop">CFOP</label><input id="f-cfop" maxlength="4" value="' + T.esc(atual.cfop || '') + '" placeholder="Ex.: 5102">' +
        '<span class="ajuda">1, 2 e 3 são entrada; 5, 6 e 7 são saída. O programa confere com a finalidade.</span></div>' +
        '<div class="campo inteiro"><label class="caixa-opcao"><input type="checkbox" id="f-estoque"' + (atual.estoque ? ' checked' : '') + '> Movimenta <b>estoque</b></label> ' +
        '<label class="caixa-opcao"><input type="checkbox" id="f-financeiro"' + (atual.financeiro ? ' checked' : '') + '> Gera <b>financeiro</b> (conta a pagar ou a receber)</label></div>' +
        (semPlano
          ? '<div class="campo inteiro"><div class="aviso ambar" style="margin:0"><span class="icone-aviso">📘</span><div>Cadastre o <b>plano de contas</b> primeiro para escolher aqui as contas de débito e crédito.</div></div></div>'
          : '<div class="campo"><label for="f-debito">Conta de débito</label><select id="f-debito">' + opcoesConta(atual.contaDebito) + '</select></div>' +
            '<div class="campo"><label for="f-credito">Conta de crédito</label><select id="f-credito">' + opcoesConta(atual.contaCredito) + '</select></div>') +
        '<div class="campo"><label for="f-situacao">Situação</label><select id="f-situacao">' +
        '<option value="ativa"' + (atual.situacao !== 'inativa' ? ' selected' : '') + '>Ativa</option>' +
        '<option value="inativa"' + (atual.situacao === 'inativa' ? ' selected' : '') + '>Inativa</option></select></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc(atual.observacao || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: codigoAntigo ? 'Salvar' : 'Cadastrar', tipo: 'primario', antes: (j) => {
        const nova = {
          codigo: j.querySelector('#f-codigo').value.trim(), nome: j.querySelector('#f-nome').value.trim(),
          finalidade: j.querySelector('#f-finalidade').value, cfop: j.querySelector('#f-cfop').value.trim(),
          estoque: j.querySelector('#f-estoque').checked, financeiro: j.querySelector('#f-financeiro').checked,
          contaDebito: j.querySelector('#f-debito') ? j.querySelector('#f-debito').value : (atual.contaDebito || ''),
          contaCredito: j.querySelector('#f-credito') ? j.querySelector('#f-credito').value : (atual.contaCredito || ''),
          situacao: j.querySelector('#f-situacao').value, observacao: j.querySelector('#f-obs').value.trim(),
        };
        const r = C().conferirNatureza(nova, lista, codigoAntigo);
        if (!r.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(r.erro) + '</div>'; return false; }
        return r.natureza;
      } }],
    });
    if (!salvo) return;
    await salvarNaturezas(el, { naturezas: lista.filter((n) => String(n.codigo) !== String(codigoAntigo)).concat([salvo]) },
      codigoAntigo ? 'Natureza salva.' : 'Natureza ' + salvo.codigo + ' cadastrada.');
  }

  // ------------------------------------------------------------------
  async function mostrar(el, parte, codigo, conferir) {
    if (parte === 'config') return mostrarConfig(el, codigo, conferir);
    if (!parte || !codigo) return mostrarInicio(el, conferir);
    if (parte === 'centros') return mostrarCentros(el, codigo, conferir);
    if (parte === 'naturezas') return mostrarNaturezas(el, codigo, conferir);
    return mostrarPlano(el, codigo, conferir);
  }

  raiz.TelaErp = { mostrar, SECOES, PARTES, itemDe, secaoDe, empresaLembrada, _teste: { estado: () => E } };
})(self);
