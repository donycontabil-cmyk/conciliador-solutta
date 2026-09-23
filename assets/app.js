/*
 * Conciliador Solutta — app.js
 * Navegação (Carteira -> Empresa -> Família -> Passo), barra do topo, menu lateral
 * e a abertura do programa: nome de quem usa, pasta de dados e rota.
 * Endereços por "#" (funciona abrindo o index.html direto, por file://).
 */
(function (raiz) {
  'use strict';

  // Armadilha 23: lista de <script> alterada sem conferir -> módulo não carrega, calado.
  // Aqui se confere: faltando algum, a tela diz qual.
  const MODULOS = ['CONFIG', 'XLSX', 'Util', 'LerPlanilha', 'LerRazao', 'LerFinanceiro', 'LerBalancete', 'LerDiario', 'Familias', 'Leitor', 'MotorNomes',
    'MotorReclass', 'MotorFechamento', 'MotorTerceiro', 'MotorApresentacao', 'MotorDiario', 'MotorResultado', 'ExcelBonito', 'Backup', 'RelatorioCliente', 'LayoutAjustes', 'Demonstracao', 'Diagnostico', 'Armazenamento', 'ArmazenamentoPasta', 'ArmazenamentoMemoria',
    'Tela', 'TelaPasta', 'TelaCarteira', 'TelaEmpresa', 'TelaFamilia', 'TelaSubir', 'TelaPasso1', 'TelaPasso13', 'TelaPasso4', 'TelaPasso3', 'TelaRelatorio3', 'TelaApresentacao', 'TelaDiario', 'TelaLivre', 'TelaBackup', 'TelaResultado', 'TelaSuporte'];

  const CHAVE_USUARIO = 'conciliador-solutta.usuario';
  // Menu da esquerda fixo ou flutuante (Dony, 18/09/2026: "uma setinha que eu possa fixar quando eu quiser;
  // clicando nela, o menu fica flutuante e só reaparece quando eu passar o mouse até a esquerda").
  const CHAVE_MENU = 'conciliador-solutta.menu';

  const App = {
    config: null,
    modo: 'pasta',
    armazenamento: null,
    usuario: { nome: '', podeLancar: true },
    empresas: [],
    rota: null,
  };

  function lerLocal(chave) {
    try { return raiz.localStorage.getItem(chave); } catch (e) { return null; }
  }
  function gravarLocal(chave, valor) {
    try { raiz.localStorage.setItem(chave, valor); return true; } catch (e) { return false; }
  }

  function el(id) { return document.getElementById(id); }

  // ------------------------------------------------------------------
  // Estrutura da página
  // ------------------------------------------------------------------
  function montarEstrutura() {
    const cfg = App.config;
    const T = raiz.Tela;
    const faixa = App.modo === 'memoria'
      ? '<div class="faixa-modo">Modo demonstração: os dados ficam só na memória desta aba e somem ao fechar. Nada é gravado no disco.</div>' : '';
    document.body.innerHTML =
      '<div class="app' + (faixa ? ' com-faixa' : '') + (menuFlutuante() ? ' menu-flutuante' : '') + '">' +
      '<header class="topo">' +
      '<div class="marca">' + (cfg.logo ? '<img src="' + T.esc(cfg.logo) + '" alt="">' : '<span class="selo-marca">S</span>') + '<span>' + T.esc(cfg.programa) + '</span></div>' +
      '<span class="espaco"></span>' +
      '<button type="button" class="pilula-topo" id="topo-pasta" title="Pasta de dados em uso"><span class="ponto desligado"></span><span>Pasta de dados não conectada</span></button>' +
      '<button type="button" class="pilula-topo" id="topo-usuario" title="Quem está usando (fica gravado em cada ação)">👤 <span></span></button>' +
      '</header>' + faixa +
      '<nav class="menu" id="menu"></nav>' +
      '<div class="borda-menu" id="borda-menu" title="Menu (passe o mouse ou clique)"></div>' +
      '<main class="conteudo" id="conteudo"></main>' +
      '</div>';
    el('topo-usuario').addEventListener('click', () => raiz.TelaPasta.pedirNome(true).then(() => { atualizarTopo(); }));
    el('topo-pasta').addEventListener('click', () => raiz.TelaPasta.menuDaPasta());
    ligarMenuFlutuante();
    atualizarTopo();
  }

  // ------------------------------------------------------------------
  // Menu flutuante: a setinha no alto do menu solta (o menu some e a tela ganha a largura toda) ou fixa
  // de novo. Solto, ele aparece quando o mouse chega na borda esquerda e some quando o mouse sai dele.
  // ------------------------------------------------------------------
  function menuFlutuante() { return lerLocal(CHAVE_MENU) === 'flutuante'; }
  function ligarMenuFlutuante() {
    const menu = el('menu'), borda = el('borda-menu'), app = document.querySelector('.app');
    let relogio = null;
    const solto = () => app.classList.contains('menu-flutuante');
    const abrir = () => { if (!solto()) return; clearTimeout(relogio); menu.classList.add('aberto'); };
    const fechar = (espera) => { clearTimeout(relogio); relogio = setTimeout(() => menu.classList.remove('aberto'), espera || 0); };
    borda.addEventListener('mouseenter', abrir);
    borda.addEventListener('click', abrir);
    menu.addEventListener('mouseenter', () => clearTimeout(relogio));
    menu.addEventListener('mouseleave', () => { if (solto()) fechar(350); });
    menu.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-fixar-menu]')) {
        const soltar = !solto();
        gravarLocal(CHAVE_MENU, soltar ? 'flutuante' : 'fixo');
        app.classList.toggle('menu-flutuante', soltar);
        menu.classList.remove('aberto');
        atualizarMenu();
        return;
      }
      if (solto() && ev.target.closest('a')) fechar(0);
    });
  }

  async function atualizarTopo() {
    const botaoUsuario = el('topo-usuario');
    if (botaoUsuario) botaoUsuario.querySelector('span').textContent = App.usuario.nome || 'sem nome';
    const botaoPasta = el('topo-pasta');
    if (!botaoPasta || !App.armazenamento) return;
    const ligado = await App.armazenamento.estaConectado();
    const texto = await App.armazenamento.descricao();
    botaoPasta.querySelector('.ponto').classList.toggle('desligado', !ligado);
    botaoPasta.querySelector('span:last-child').textContent = texto;
    botaoPasta.title = ligado ? 'Pasta de dados em uso: tudo fica gravado nela, neste computador' : 'Clique para conectar a pasta de dados';
  }

  function atualizarMenu() {
    const T = raiz.Tela;
    const menu = el('menu');
    if (!menu) return;
    const r = App.rota || {};
    const solto = menuFlutuante();
    const partes = ['<button type="button" class="fixar-menu" data-fixar-menu aria-label="' + (solto ? 'Fixar o menu' : 'Soltar o menu') + '" title="' +
      (solto ? 'Fixar o menu aqui do lado' : 'Soltar o menu: ele se esconde e aparece quando você leva o mouse até a borda esquerda') + '">' +
      (solto ? '📌 Fixar' : '‹') + '</button>',
      '<div class="grupo">Carteira</div>',
      '<a href="#/" class="' + (r.nome === 'carteira' ? 'ativo' : '') + '">🏢 Empresas<span class="sub">cadastro e busca</span></a>'];
    if (r.codigo) {
      const emp = App.empresas.find((e) => String(e.codigo) === String(r.codigo));
      partes.push('<div class="grupo">Empresa aberta</div>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '" class="' + (r.nome === 'empresa' ? 'ativo' : '') + '">' +
        T.esc(r.codigo) + (emp ? ' · ' + T.esc(emp.nome) : '') + '<span class="sub">famílias de conciliação</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/fornecedores' + (r.anoMes ? '/' + r.anoMes : '') + '" class="' +
        (r.familia === 'fornecedores' ? 'ativo' : '') + '">📦 Fornecedores<span class="sub">checklist e passos</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/clientes' + (r.anoMes ? '/' + r.anoMes : '') + '" class="' +
        (r.familia === 'clientes' ? 'ativo' : '') + '">🧾 Clientes<span class="sub">checklist e passos</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/apresentacao' + (r.ano ? '/' + r.ano : '') + '" class="' +
        (r.nome === 'apresentacao' ? 'ativo' : '') + '">📊 Apresentação<span class="sub">balancetes, DRE e LALUR</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/diario' + (r.ano ? '/' + r.ano : '') + '" class="' +
        (r.nome === 'diario' ? 'ativo' : '') + '">📒 Livro diário<span class="sub">todas as contas; confere com o balancete</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/livres" class="' +
        (r.nome === 'livres' || r.nome === 'livre' ? 'ativo' : '') + '">🧩 Minhas conciliações<span class="sub">as que você cria, de qualquer conta</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/resultado' + (r.ano ? '/' + r.ano : '') + '" class="' +
        (r.nome === 'resultado' ? 'ativo' : '') + '">🔎 Contas de resultado<span class="sub">distorções e reclassificações</span></a>');
      partes.push('<a href="#/empresa/' + encodeURIComponent(r.codigo) + '/backup" class="' +
        (r.nome === 'backup' ? 'ativo' : '') + '">💾 Backup<span class="sub">levar esta empresa para outra máquina</span></a>');
    }
    partes.push('<div class="grupo">Programa</div>');
    partes.push('<a href="#/suporte" class="' + (r.nome === 'suporte' ? 'ativo' : '') + '">🔎 Ver o desenho de um arquivo<span class="sub">para adaptar a um sistema novo</span></a>');
    partes.push('<a href="#/sobre" class="' + (r.nome === 'sobre' ? 'ativo' : '') + '">ℹ️ Onde ficam os dados<span class="sub">hoje e no servidor da Solutta</span></a>');
    const publicado = App.config.build && App.config.build !== 'local';
    const versaoLinha = publicado
      ? 'versão ' + (App.config.numero || '?') + ' · ' + App.config.build
      : 'desenvolvimento (neste computador)';
    partes.push('<div class="rodape-menu"><b>' + T.esc(App.config.programa) + '</b> · ' + T.esc(App.config.versao) +
      '<br><span title="Número e data/hora da versão publicada. Depois de atualizar, dê Ctrl+F5 e confira se o número mudou.">' + T.esc(versaoLinha) + '</span></div>');
    menu.innerHTML = partes.join('');
  }

  // ------------------------------------------------------------------
  // Rotas
  // ------------------------------------------------------------------
  function lerRota() {
    const h = decodeURIComponent((raiz.location.hash || '').replace(/^#\/?/, ''));
    const p = h.split('/').filter(Boolean);
    if (!p.length) return { nome: 'carteira' };
    if (p[0] === 'sobre') return { nome: 'sobre' };
    if (p[0] === 'suporte') return { nome: 'suporte' };
    if (p[0] === 'empresa' && p[1]) {
      // Relatório de apresentação: #/empresa/<código>/apresentacao[/<ano>]
      if (p[2] === 'apresentacao') return { codigo: p[1], nome: 'apresentacao', ano: /^\d{4}$/.test(p[3] || '') ? Number(p[3]) : null };
      // Livro diário: #/empresa/<código>/diario[/<ano>]
      if (p[2] === 'diario') return { codigo: p[1], nome: 'diario', ano: /^\d{4}$/.test(p[3] || '') ? Number(p[3]) : null };
      // Conciliações livres (Dony, 22/09/2026: "poder criar a conciliação que eu quero, dentro de cada empresa"):
      // #/empresa/<código>/livres e #/empresa/<código>/livre/<id>/<AAAA-MM>
      // Backup da empresa (Dony, 23/09/2026): #/empresa/<código>/backup
      if (p[2] === 'backup') return { codigo: p[1], nome: 'backup' };
      // Contas de resultado (Dony, 23/09/2026): #/empresa/<código>/resultado[/<ano>]
      if (p[2] === 'resultado') return { codigo: p[1], nome: 'resultado', ano: /^[0-9]{4}$/.test(p[3] || '') ? Number(p[3]) : null };
      if (p[2] === 'livres') return { codigo: p[1], nome: 'livres' };
      if (p[2] === 'livre' && p[3]) return { codigo: p[1], nome: 'livre', livre: p[3], anoMes: /^\d{4}-\d{2}$/.test(p[4] || '') ? p[4] : null };
      const r = { codigo: p[1], nome: 'empresa' };
      if (p[2]) { r.nome = 'familia'; r.familia = p[2]; }
      if (p[3] && /^\d{4}-\d{2}$/.test(p[3])) r.anoMes = p[3];
      if (p[4]) { r.nome = 'passo'; r.passo = p[4]; }
      return r;
    }
    return { nome: 'carteira' };
  }

  function ir(hash) {
    if (raiz.location.hash === hash) mostrarRota();
    else raiz.location.hash = hash;
  }

  let rodada = 0;
  let ultimoEndereco = null;
  async function mostrarRota() {
    const minhaRodada = ++rodada;
    const conteudo = el('conteudo');
    App.rota = lerRota();
    // Tela nova começa do topo; redesenhar a mesma tela mantém onde a pessoa estava.
    if (raiz.location.hash !== ultimoEndereco) { conteudo.scrollTop = 0; ultimoEndereco = raiz.location.hash; }
    atualizarMenu();
    // "Ver o desenho de um arquivo" não precisa de pasta de dados nem de empresa: abre sempre.
    if (App.rota.nome === 'suporte') { raiz.TelaSuporte.mostrar(conteudo); return; }
    if (!(await App.armazenamento.estaConectado())) {
      raiz.TelaPasta.telaConectar(conteudo);
      return;
    }
    try {
      App.empresas = await App.armazenamento.empresas();
      atualizarMenu();
      if (minhaRodada !== rodada) return;
      const r = App.rota;
      const conferir = () => minhaRodada === rodada;
      if (r.nome === 'carteira') await raiz.TelaCarteira.mostrar(conteudo, conferir);
      else if (r.nome === 'sobre') mostrarSobre(conteudo);
      else if (r.nome === 'empresa') await raiz.TelaEmpresa.mostrar(conteudo, r.codigo, conferir);
      else if (r.nome === 'apresentacao') await raiz.TelaApresentacao.mostrar(conteudo, r.codigo, r.ano, conferir);
      else if (r.nome === 'diario') await raiz.TelaDiario.mostrar(conteudo, r.codigo, r.ano, conferir);
      else if (r.nome === 'backup') await raiz.TelaBackup.mostrar(conteudo, r.codigo, conferir);
      else if (r.nome === 'resultado') await raiz.TelaResultado.mostrar(conteudo, r.codigo, r.ano, conferir);
      else if (r.nome === 'livres') await raiz.TelaLivre.mostrarLista(conteudo, r.codigo, conferir);
      else if (r.nome === 'livre') await raiz.TelaLivre.mostrar(conteudo, r.codigo, r.livre, r.anoMes || raiz.Util.anoMes(raiz.Util.hoje().texto), conferir);
      else if (r.nome === 'familia') await raiz.TelaFamilia.mostrar(conteudo, r.codigo, r.familia, r.anoMes, conferir);
      else if (r.nome === 'passo' && r.passo === 'passo1') await raiz.TelaPasso1.mostrar(conteudo, r.codigo, r.anoMes, conferir, r.familia);
      // 1.3 · razão limpo: o que compõe os saldos depois do ① (para imprimir e mandar ao financeiro).
      else if (r.nome === 'passo' && r.passo === 'passo13') await raiz.TelaPasso13.mostrar(conteudo, r.codigo, r.anoMes, conferir, r.familia);
      // ④ · Fornecedores · somente razão: o razão de fornecedores (ou o livro diário) contra ele mesmo.
      else if (r.nome === 'passo' && r.passo === 'passo4') await raiz.TelaPasso4.mostrar(conteudo, r.codigo, r.anoMes, conferir, r.familia);
      // Passos no modelo "Conciliar A × B": ③ Fornecedores × contas a pagar e ② Adiantamento × financeiro.
      else if (r.nome === 'passo' && (r.passo === 'passo3' || r.passo === 'passo2')) await raiz.TelaPasso3.mostrar(conteudo, r.codigo, r.anoMes, conferir, r.passo, r.familia);
      else if (r.nome === 'passo' && (r.passo === 'passo3-relatorio' || r.passo === 'passo2-relatorio')) await raiz.TelaRelatorio3.mostrar(conteudo, r.codigo, r.anoMes, conferir, r.passo.replace('-relatorio', ''), r.familia);
      else conteudo.innerHTML = '<div class="aviso ambar">Esta tela não existe. <a href="#/">Voltar para as empresas</a>.</div>';
    } catch (e) {
      console.error(e);
      conteudo.innerHTML = '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>Não foi possível abrir esta tela.</b><br>' +
        raiz.Tela.esc(raiz.Tela.mensagemDeErro(e)) + '<br><a href="#/">Voltar para as empresas</a></div></div>';
    }
    atualizarTopo();
  }

  function mostrarSobre(conteudo) {
    const T = raiz.Tela;
    const modo = App.modo === 'memoria' ? 'na <b>memória desta aba</b> (modo demonstração: nada é gravado)' : 'numa <b>pasta deste computador</b>, escolhida por quem usa';
    conteudo.innerHTML =
      '<div class="cabecalho"><div class="titulos"><h1>Onde ficam os dados</h1><p class="suave">Hoje e quando a Solutta tiver servidor e domínio próprios.</p></div></div>' +
      '<div class="grade-3">' +
      '<div class="cartao corpo"><h3>Hoje</h3><p class="suave" style="margin-top:8px;line-height:1.55">Os dados ficam ' + modo + '. ' +
      'Nada vai para a internet. Cada arquivo que sobe é guardado como cópia fiel (a prova), junto com o que foi lido, ' +
      'e cada ação fica registrada com quem fez e quando.</p></div>' +
      '<div class="cartao corpo"><h3>Mudança de casa</h3><p class="suave" style="margin-top:8px;line-height:1.55">O programa guarda tudo por uma camada única de armazenamento. ' +
      'Trocar a pasta pelo servidor da Solutta é trocar uma linha da configuração e importar o pacote exportado — sem reescrever telas nem regras.</p></div>' +
      '<div class="cartao corpo"><h3>Servidor e domínio da Solutta</h3><p class="suave" style="margin-top:8px;line-height:1.55">O programa é um site estático: sobe em qualquer servidor web (IIS, Nginx, Apache), ' +
      'no domínio que a Solutta escolher. As regras de conciliação rodam no navegador e também no servidor. ' +
      'Depois vêm o login do escritório e a permissão por empresa (administrador, lança, só lê).</p></div>' +
      '</div>' +
      '<div class="cartao corpo" style="margin-top:14px"><h3>Estrutura da pasta de dados</h3><pre class="pequeno suave" style="margin:10px 0 0;white-space:pre-wrap">' +
      T.esc([
        'Conciliador Solutta - Dados/',
        '  _config.json                      versão do formato de dados',
        '  empresas.json                     a carteira',
        '  empresas/<código> - <nome>/',
        '    arquivos/<AAAA-MM>/<arquivo original>   cópia fiel do que subiu',
        '    arquivos/<AAAA-MM>/<id>.json            o que foi lido + quem e quando',
        '    conciliacoes/<id>.json                  decisões e resumo de cada passo',
        '    conciliacoes/_versoes/…                 gravações anteriores',
        '    congelados/…                            cópias imutáveis',
        '  log/<AAAA-MM>.jsonl               uma linha por ação: quando, quem, o quê',
        '  _apagados/…                       o que foi apagado pela tela (nada some de verdade)',
      ].join('\n')) + '</pre></div>';
  }

  // ------------------------------------------------------------------
  // Abertura
  // ------------------------------------------------------------------
  // Página velha guardada no navegador (o index.html do cache pede menos arquivos do que a versão nova): o programa
  // recarrega UMA vez com um endereço diferente, que o cache não tem, e volta inteiro. Só se ainda faltar peça é que
  // a tela explica o que fazer (Dony, 22/09/2026: "o site não está carregando" — era a página velha no cache).
  const CHAVE_RECARGA = 'conciliador-solutta.recarga';
  function jaRecarregou() { try { return raiz.sessionStorage.getItem(CHAVE_RECARGA) === '1'; } catch (e) { return true; } }
  function marcarRecarga(valor) { try { if (valor) raiz.sessionStorage.setItem(CHAVE_RECARGA, '1'); else raiz.sessionStorage.removeItem(CHAVE_RECARGA); } catch (e) { /* sem sessionStorage: segue */ } }

  // Lê o config.js do servidor SEM cache e compara o número da versão com o que está aberto. Maior lá =
  // esta página é velha: recarrega uma vez com um endereço que o cache não tem. Em pasta local (file://) e
  // sem rede não faz nada — é só uma ajuda, nunca atrapalha quem está trabalhando.
  const CHAVE_VERSAO = 'conciliador-solutta.recarga-versao';
  async function conferirVersaoPublicada() {
    try {
      if (!raiz.fetch || String(raiz.location.protocol).indexOf('http') !== 0) return;
      const aqui = Number((raiz.CONFIG || {}).numero) || 0;
      if (!aqui) return;
      const resposta = await raiz.fetch('config.js?versao=' + Date.now(), { cache: 'no-store' });
      if (!resposta.ok) return;
      const achado = (await resposta.text()).match(/numero:\s*(\d+)/);
      const publicada = achado ? Number(achado[1]) : 0;
      if (!publicada || publicada <= aqui) { try { raiz.sessionStorage.removeItem(CHAVE_VERSAO); } catch (e) { /* segue */ } return; }
      let jaTentou = false;
      try { jaTentou = raiz.sessionStorage.getItem(CHAVE_VERSAO) === String(publicada); } catch (e) { jaTentou = true; }
      if (jaTentou) { // recarregou e continua velha: a faixa fica na tela até ele atualizar
        faixaDeVersaoNova(publicada, aqui);
        return;
      }
      try { raiz.sessionStorage.setItem(CHAVE_VERSAO, String(publicada)); } catch (e) { /* segue */ }
      raiz.location.replace(raiz.location.origin + raiz.location.pathname + '?versao=' + publicada + raiz.location.hash);
    } catch (e) { /* sem rede ou sem permissão: o programa continua como está */ }
  }

  // Versão nova publicada e a página daqui continua velha (o navegador insiste no cache): uma FAIXA fixa no
  // alto, que não some, com o botão de atualizar. Antes era um aviso que sumia em 20 segundos e passava batido
  // (Dony, 23/09/2026: mandou foto de um erro que já estava corrigido no ar).
  function faixaDeVersaoNova(publicada, aqui) {
    if (document.getElementById("faixa-versao")) return;
    const d = document.createElement("div");
    d.id = "faixa-versao";
    d.className = "faixa-versao";
    d.innerHTML = "<span>⬆️ <b>Saiu a versão " + publicada + "</b> — esta janela ainda está na " + aqui + ". Atualize para pegar as novidades e as correções.</span>" +
      "<button type=\"button\" class=\"botao primario pequeno\">🔄 Atualizar agora</button>";
    d.querySelector("button").addEventListener("click", () => {
      try { raiz.sessionStorage.removeItem(CHAVE_VERSAO); } catch (e) { /* segue */ }
      raiz.location.replace(raiz.location.origin + raiz.location.pathname + "?versao=" + publicada + "-" + Date.now() + raiz.location.hash);
    });
    document.body.appendChild(d);
  }

  async function iniciar() {
    const faltam = MODULOS.filter((m) => !raiz[m]);
    if (faltam.length) {
      if (!jaRecarregou()) {
        marcarRecarga(true);
        raiz.location.replace(raiz.location.origin + raiz.location.pathname + '?recarga=' + Date.now() + raiz.location.hash);
        return;
      }
      document.body.innerHTML = '<div style="max-width:640px;margin:10vh auto;font-family:Segoe UI,Arial;padding:20px;line-height:1.5">' +
        '<h1 style="color:#b3261e">O programa não carregou inteiro</h1><p>Faltam as peças: <b>' + faltam.join(', ') + '</b>.</p>' +
        '<p>Quase sempre é a página antiga guardada no navegador. Aperte <b>Ctrl+F5</b> ou clique aqui:</p>' +
        '<p><button type="button" id="recarregar" style="font:inherit;padding:8px 14px;border-radius:6px;border:1px solid #2f4a64;background:#2f4a64;color:#fff;cursor:pointer">🔄 Recarregar o programa</button></p>' +
        '<p>Se continuar faltando, confira se a pasta do programa foi copiada inteira (com a pasta <b>assets</b>).</p></div>';
      const bt = document.getElementById('recarregar');
      if (bt) bt.addEventListener('click', () => { marcarRecarga(false); raiz.location.replace(raiz.location.origin + raiz.location.pathname + '?recarga=' + Date.now() + raiz.location.hash); });
      return;
    }
    marcarRecarga(false);
    App.config = raiz.CONFIG;
    // A versão publicada é mais nova do que a que abriu? Então o navegador serviu a página velha (as peças
    // estão todas lá, mas são as antigas: o programa abre sem as novidades). Recarrega UMA vez sozinho.
    // (Dony, 22/09/2026: "abri aqui a versão 55 e não vi esses botões" — era a página velha no cache.)
    conferirVersaoPublicada();
    const params = new URLSearchParams(raiz.location.search);
    App.modo = params.get('modo') === 'memoria' ? 'memoria' : (App.config.modo || 'pasta');
    App.demonstracao = !!(App.config.demonstracao || params.get('demonstracao') === '1');
    if (App.config.cores && App.config.cores.primaria) document.documentElement.style.setProperty('--primaria', App.config.cores.primaria);
    document.title = App.config.programa;

    const nomeGuardado = lerLocal(CHAVE_USUARIO);
    App.usuario = { nome: nomeGuardado || '', podeLancar: true };

    App.armazenamento = raiz.Armazenamento.criar({ modo: App.modo, api: App.config.api },
      { pasta: raiz.ArmazenamentoPasta, memoria: raiz.ArmazenamentoMemoria }, { usuario: () => App.usuario });

    montarEstrutura();

    if (App.modo === 'pasta') {
      const sit = await App.armazenamento.situacao();
      if (!sit.suportado) {
        raiz.TelaPasta.telaNaoSuportado(el('conteudo'));
        return;
      }
    }
    if (!App.usuario.nome) {
      await raiz.TelaPasta.pedirNome(false);
      atualizarTopo();
    }
    if (App.modo === 'memoria') {
      await App.armazenamento.conectar();
    } else {
      const sit = await App.armazenamento.situacao();
      if (sit.lembrada && sit.permissao === 'granted') {
        try { await App.armazenamento.conectar(); } catch (e) { console.warn(e); }
      }
    }
    raiz.addEventListener('hashchange', mostrarRota);
    await mostrarRota();
  }

  App.ir = ir;
  App.mostrarRota = mostrarRota;
  App.atualizarTopo = atualizarTopo;
  App.atualizarMenu = atualizarMenu;
  App.guardarNome = (nome) => { App.usuario.nome = nome; gravarLocal(CHAVE_USUARIO, nome); };
  App.lerLocal = lerLocal;
  App.gravarLocal = gravarLocal;
  raiz.App = App;

  // Nada some calado: se a abertura falhar, a tela diz o que houve.
  async function iniciarComCuidado() {
    try {
      await iniciar();
    } catch (e) {
      console.error(e);
      const alvo = el('conteudo') || document.body;
      alvo.innerHTML = '<div style="max-width:640px;margin:8vh auto;font-family:Segoe UI,Arial;padding:20px">' +
        '<h1 style="color:#b3261e">O Conciliador não conseguiu abrir</h1><p>' + String((e && e.message) || e).replace(/</g, '&lt;') + '</p>' +
        '<p>Feche a aba e abra de novo no Google Chrome ou no Microsoft Edge. Se continuar, avise o suporte com esta mensagem.</p></div>';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciarComCuidado);
  else iniciarComCuidado();
})(self);
