/*
 * Conciliador Solutta — tela-resultado.js
 * CONTAS DE RESULTADO · ACHAR DISTORÇÕES (Dony, 22 e 23/09/2026: "um botão que busque as despesas do
 * fornecedor que estejam em contas diferentes — o Adonias em serviço de consultoria e o mesmo Adonias em
 * serviços PJ — e sugira o arquivo de importação para a reclassificação"; "ver dentro das contas de
 * resultado as distorções: fornecedores fora, pagamentos que podem ser de tributos ou coisa do tipo").
 *
 * Sai tudo do LIVRO DIÁRIO (que tem os dois lados de cada lançamento) + o plano dos balancetes. A tela
 * mostra os achados em listas separadas, com a CONTRAPARTIDA à vista — quem decide o que é distorção é
 * quem lê. O que for marcado vira ARQUIVO DE AJUSTES no layout de importação do sistema.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function MR() { return raiz.MotorResultado; }
  function MD() { return raiz.MotorDiario; }
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });

  let E = null;

  const ABAS = [
    { id: 'contas', titulo: 'Mesmo fornecedor em várias contas', icone: '🔀', chave: 'variasContas',
      texto: 'O mesmo fornecedor lançado em duas ou mais contas de resultado. Marque quem você quer reclassificar e escolha a conta que fica.' },
    { id: 'pagamento', titulo: 'Pagamento direto na despesa', icone: '🏦', chave: 'pagamentoDireto',
      texto: 'A despesa foi lançada direto contra o banco ou o caixa, sem passar por fornecedores — e esse fornecedor TEM conta no passivo. É o "fornecedor fora".' },
    { id: 'tributo', titulo: 'Cheiro de tributo em conta que não é de tributo', icone: '🧾', chave: 'cheiroDeTributo',
      texto: 'O histórico fala de DARF, DAS, GPS, INSS, FGTS, IRRF, PIS, COFINS, ISS… mas a conta não é de tributo.' },
    { id: 'lado', titulo: 'Lado errado', icone: '↔️', chave: 'ladoErrado',
      texto: 'Crédito em conta de despesa (ou débito em conta de receita) de verdade: já ficam de fora o estorno declarado, a rotina de folha, as contas redutoras, o rateio entre contas de resultado e o crédito de PIS/COFINS.' },
    { id: 'repetidos', titulo: 'Pode ser lançamento em dobro', icone: '👯', chave: 'repetidos',
      texto: 'Mesmo fornecedor, mesma conta, mesmo valor e mesmo mês, mais de uma vez. Às vezes é parcela; às vezes é dobra.' },
    { id: 'credito', titulo: 'Crédito de PIS/COFINS', icone: '💳', chave: 'creditoTributo',
      texto: 'O crédito de PIS/COFINS (e de outros tributos a recuperar) sai da despesa e vai para o ativo: a conta de despesa é creditada de propósito. Informativo — não é distorção.' },
    { id: 'rateio', titulo: 'Rateio entre contas de resultado', icone: '↪️', chave: 'rateio',
      texto: 'Lançamentos que saem de uma conta de resultado e entram em outra (rateio, apropriação de custo, reclassificação já feita). Informativo.' },
  ];

  async function mostrar(el, codigo, ano, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Lendo as contas de resultado…');
    const arm = app().armazenamento;
    const metas = await arm.arquivos(codigo);
    if (conferir && !conferir()) return;
    const diarios = metas.filter((m) => m.tipo === 'diario' && m.periodo).sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    const meta = (ano ? diarios.find((m) => String(m.competencia).slice(0, 4) === String(ano)) : null) || diarios[0] || null;
    const voltar = '#/empresa/' + encodeURIComponent(codigo);
    const cabecalho = '<a class="voltar" href="' + voltar + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Contas de resultado · achar distorções</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + (meta ? ' · livro diário de ' + T.esc(String(meta.competencia).slice(0, 4)) : '') + '</p></div>' +
      '<div class="linha-flex"><button type="button" class="botao" data-acao="excel">⬇ Excel</button>' +
      '<button type="button" class="botao primario" data-acao="ajustes">⬇ Arquivo de ajustes</button></div></div>';
    if (!meta) {
      el.innerHTML = cabecalho + '<div class="aviso ambar"><span class="icone-aviso">📒</span><div><b>Suba o livro diário do ano</b> em ' +
        '<a href="#/empresa/' + encodeURIComponent(codigo) + '/diario">📒 Livro diário</a> (com o balancete do primeiro mês). ' +
        'É dele que saem as contas de resultado e as contrapartidas de cada lançamento.</div></div>';
      return;
    }
    const conteudo = await arm.conteudoDoArquivo(meta.id);
    if (conferir && !conferir()) return;
    const anoDoDiario = String(meta.competencia).slice(0, 4);
    const balancetes = [];
    for (const b of metas.filter((m) => m.tipo === 'balancete' && String(m.competencia).slice(0, 4) === anoDoDiario)
      .sort((a, b2) => String(a.competencia).localeCompare(String(b2.competencia)))) {
      const c = await arm.conteudoDoArquivo(b.id);
      if (conferir && !conferir()) return;
      balancetes.push({ competencia: b.competencia, contas: (c.balancete && c.balancete.contas) || c.contas || [] });
    }
    const diario = conteudo.diario || conteudo;
    const r = MR().analisar({ diario, balancetes });
    if (conferir && !conferir()) return;
    E = { codigo, emp, meta, diario, balancetes, r, el: null, cabecalho, aba: 'contas',
      escolhas: new Map(), filtros: { busca: '', conta: '', mes: '' } };
    el.innerHTML = '<div class="tela-resultado"></div>';
    E.el = el.firstChild;
    ligar();
    desenhar();
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenhar() {
    const t = E.r.totais;
    const n = (q) => Number(q || 0).toLocaleString('pt-BR');
    const cartao = (id) => {
      const a = ABAS.find((x) => x.id === id);
      const d = t[a.chave] || { qtd: 0, valor: 0 };
      return '<button type="button" class="cartao resumo clicavel' + (E.aba === id ? ' ativo' : '') + '" data-aba="' + id + '">' +
        '<div class="rotulo">' + a.icone + ' ' + T.esc(a.titulo) + '</div><div class="grande">' + n(d.qtd) + '</div>' +
        '<div class="detalhe"><span>' + T.moeda(d.valor) + '</span></div></button>';
    };
    E.el.innerHTML = E.cabecalho +
      '<div class="aviso info"><span class="icone-aviso">📒</span><div>Do livro diário de ' + T.esc(String(E.meta.competencia).slice(0, 4)) + ' (' +
      T.esc(E.r.periodo.de.slice(0, 7)) + ' a ' + T.esc(E.r.periodo.ate.slice(0, 7)) + '): <b>' + n(t.linhas) + '</b> lançamento(s) em <b>' + n(t.contas) +
      '</b> contas de resultado, de <b>' + n(t.fornecedores) + '</b> fornecedor(es) reconhecido(s)' + (t.semFornecedor ? ' · ' + n(t.semFornecedor) + ' sem nome no histórico' : '') + '. ' +
      'Débitos ' + T.moeda(t.debito) + ' · créditos ' + T.moeda(t.credito) + '.' +
      (t.anuladas && t.anuladas.qtd ? ' <b>' + n(t.anuladas.qtd) + '</b> lançamento(s) já se anulam dentro da própria conta (a nota que foi reclassificada, o estorno): ' +
        'ficam de fora de todas as listas.' : '') +
      (t.folha && t.folha.qtd ? ' ' + n(t.folha.qtd) + ' crédito(s) de rotina de folha também.' : '') + '</div></div>' +
      '<div class="grade-3" style="margin-top:12px">' + ABAS.slice(0, 3).map((a) => cartao(a.id)).join('') + '</div>' +
      '<div class="grade-4" style="margin-top:10px">' + ABAS.slice(3).map((a) => cartao(a.id)).join('') + '</div>' +
      '<div class="filtros" id="re-filtros"></div>' +
      '<div id="re-lista"></div>';
    desenharFiltros();
    desenharLista();
  }

  function filtro(nome) { return E.filtros[nome] || ''; }
  function desenharFiltros() {
    const contas = E.r.contas.slice().sort((a, b) => String(a.conta).localeCompare(String(b.conta)));
    const meses = Array.from(new Set(E.r.linhas.map((x) => x.comp))).sort();
    E.el.querySelector('#re-filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Buscar fornecedor, conta, histórico ou valor" value="' + T.esc(filtro('busca')) + '">' +
      '<select class="filtro" data-filtro="conta"><option value="">Todas as contas</option>' +
      contas.map((c) => '<option value="' + T.esc(c.conta) + '"' + (filtro('conta') === c.conta ? ' selected' : '') + '>' + T.esc(c.conta + ' · ' + c.nome) + '</option>').join('') + '</select>' +
      '<select class="filtro" data-filtro="mes"><option value="">Todos os meses</option>' +
      meses.map((m) => '<option value="' + m + '"' + (filtro('mes') === m ? ' selected' : '') + '>' + T.esc(U.nomeCompetencia(m)) + '</option>').join('') + '</select>' +
      '<span class="suave pequeno">' + T.esc((ABAS.find((a) => a.id === E.aba) || {}).texto || '') + '</span>';
  }

  function casaBusca(texto) {
    const b = String(filtro('busca') || '').trim().toLowerCase();
    return !b || String(texto || '').toLowerCase().indexOf(b) >= 0;
  }
  function linhaPassa(x) {
    return (!filtro('conta') || x.conta === filtro('conta')) && (!filtro('mes') || x.comp === filtro('mes')) &&
      casaBusca(x.nome + ' ' + x.conta + ' ' + x.contaNome + ' ' + x.historico + ' ' + U.formatarCentavos(x.valor));
  }

  function desenharLista() {
    const alvo = E.el.querySelector('#re-lista');
    if (E.aba === 'contas') return desenharVariasContas(alvo);
    if (E.aba === 'repetidos') return desenharRepetidos(alvo);
    const achado = ABAS.find((a) => a.id === E.aba);
    const lista = (E.r.achados[achado.chave] || []).filter(linhaPassa).sort((a, b) => b.valor - a.valor);
    alvo.innerHTML = '<div class="cartao corpo" style="margin-top:14px"><h3 style="margin:0 0 4px">' + achado.icone + ' ' + T.esc(achado.titulo) +
      ' <span class="suave pequeno">(' + lista.length.toLocaleString('pt-BR') + ')</span></h3>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + T.esc(achado.texto) + '</p><div id="re-tab"></div></div>';
    T.tabelaPaginada(alvo.querySelector('#re-tab'), {
      alta: true, porPagina: 100,
      ordem: { id: 're-' + E.aba, colunas: [DATA((x) => x.data), TXT((x) => x.nome), TXT((x) => x.conta + ' ' + x.contaNome), TXT((x) => x.contra + ' ' + x.contraNome), VALOR((x) => x.valor), TXT((x) => x.lado)] },
      cabecalho: '<th>Data</th><th>Fornecedor</th><th>Conta de resultado</th><th>Contrapartida</th><th class="num">Valor</th><th>D/C</th>',
      linhas: lista, vazio: 'Nada nesta lista com estes filtros — o que é bom sinal.',
      linha: (x) => '<tr><td class="num">' + T.esc(x.data) + '</td>' +
        '<td class="nome">' + (x.nome ? T.esc(x.nome) : '<span class="falta">sem fornecedor</span>') +
        '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 90)) + '</span></td>' +
        '<td><b>' + T.esc(x.conta) + '</b> ' + T.esc(x.contaNome) + '</td>' +
        '<td>' + T.esc(x.contra + ' ' + x.contraNome) + '</td>' +
        T.tdValor(x.valor) + '<td>' + T.esc(x.lado) + '</td></tr>',
    });
  }

  // O achado principal: o mesmo fornecedor em várias contas, com a conta que fica e o que vai ser reclassificado.
  function desenharVariasContas(alvo) {
    const lista = E.r.achados.mesmoFornecedorVariasContas.filter((f) =>
      casaBusca(f.nome + ' ' + f.contas.map((c) => c.conta + ' ' + c.nome).join(' ')) &&
      (!filtro('conta') || f.contas.some((c) => c.conta === filtro('conta'))));
    const marcados = Array.from(E.escolhas.values()).filter((e) => e.marcado).length;
    alvo.innerHTML = '<div class="cartao corpo" style="margin-top:14px">' +
      '<div class="linha-flex" style="margin-bottom:6px"><h3 style="flex:1;margin:0">🔀 Mesmo fornecedor em várias contas ' +
      '<span class="suave pequeno">(' + lista.length.toLocaleString('pt-BR') + ')</span></h3>' +
      '<span class="pilula azul">' + marcados + ' marcado(s) para o arquivo de ajustes</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">Marque o fornecedor e escolha a <b>conta que fica</b>: o programa monta o lançamento que leva <b>o saldo</b> das outras para ela. ' +
      'A conta sugerida é a que tem a maior parte. O que já foi reclassificado (débito e crédito que se anulam na mesma conta) <b>não entra</b>.</p><div id="re-tab"></div></div>';
    T.tabelaPaginada(alvo.querySelector('#re-tab'), {
      alta: true, porPagina: 60,
      ordem: { id: 're-varias', colunas: [null, TXT((f) => f.nome), NUM((f) => f.qtdContas), VALOR((f) => f.total), VALOR((f) => f.aLevar), null] },
      cabecalho: '<th style="width:26px"></th><th>Fornecedor</th><th class="num">Contas</th><th class="num">Total no resultado</th><th class="num">Vai mudar de conta</th><th>Conta que fica</th>',
      linhas: lista, vazio: 'Nenhum fornecedor em mais de uma conta com estes filtros.',
      linha: (f) => {
        const e = E.escolhas.get(f.chave) || { marcado: false, destino: f.principal };
        const contas = f.contas.map((c) => '<div class="pequeno">' + (String(c.conta) === String(e.destino) ? '<b>' : '') + T.esc(c.conta + ' · ' + c.nome) +
          ' · ' + T.moeda(c.valor) + ' · ' + c.linhas.length + ' lanç.' + (c.anuladas ? ' <span class="suave">(+' + c.anuladas + ' já resolvido)</span>' : '') +
          (String(c.conta) === String(e.destino) ? ' (fica)</b>' : '') + '</div>').join('') +
          ((f.jaResolvidas || []).length ? '<div class="pequeno suave">já resolvido nesta conta (débito e crédito se anulam): ' +
            f.jaResolvidas.map((c) => T.esc(c.conta + ' · ' + c.nome)).join(' · ') + '</div>' : '') +
          ((f.residuos || []).length ? '<div class="pequeno falta">resíduo do lado contrário (não entra na reclassificação): ' +
            f.residuos.map((c) => T.esc(c.conta) + ' ' + T.moeda(c.valor)).join(' · ') + '</div>' : '');
        return '<tr><td><input type="checkbox" data-marcar="' + T.esc(f.chave) + '"' + (e.marcado ? ' checked' : '') + '></td>' +
          '<td class="nome"><b>' + T.esc(f.nome) + '</b>' + contas + '</td>' +
          '<td class="num">' + f.qtdContas + '</td>' + T.tdValor(f.total) + T.tdValor(f.aLevar) +
          '<td><select data-destino="' + T.esc(f.chave) + '">' +
          f.contas.map((c) => '<option value="' + T.esc(c.conta) + '"' + (String(c.conta) === String(e.destino) ? ' selected' : '') + '>' +
            T.esc(c.conta + ' · ' + c.nome.slice(0, 28)) + '</option>').join('') + '</select></td></tr>';
      },
    });
  }

  function desenharRepetidos(alvo) {
    const lista = E.r.achados.repetidos.filter((x) => casaBusca(x.nome + ' ' + x.conta + ' ' + x.contaNome) &&
      (!filtro('conta') || x.conta === filtro('conta')) && (!filtro('mes') || x.comp === filtro('mes')));
    alvo.innerHTML = '<div class="cartao corpo" style="margin-top:14px"><h3 style="margin:0 0 4px">👯 Pode ser lançamento em dobro ' +
      '<span class="suave pequeno">(' + lista.length.toLocaleString('pt-BR') + ')</span></h3>' +
      '<p class="suave pequeno" style="margin:0 0 8px">Mesmo fornecedor, mesma conta, mesmo valor e mesmo mês, mais de uma vez. Confira as datas e os documentos antes de concluir.</p><div id="re-tab"></div></div>';
    T.tabelaPaginada(alvo.querySelector('#re-tab'), {
      alta: true, porPagina: 100,
      ordem: { id: 're-repetidos', colunas: [TXT((x) => x.nome), TXT((x) => x.conta + ' ' + x.contaNome), VALOR((x) => x.valor), NUM((x) => x.vezes), TXT((x) => x.comp)] },
      cabecalho: '<th>Fornecedor</th><th>Conta</th><th class="num">Valor</th><th class="num">Vezes</th><th>Mês</th>',
      linhas: lista, vazio: 'Nada repetido com estes filtros.',
      linha: (x) => {
        const datas = x.linhas.map((i) => E.r.linhas[i].data).join(' · ');
        return '<tr><td class="nome"><b>' + T.esc(x.nome) + '</b><br><span class="suave pequeno">' + T.esc(datas) + '</span></td>' +
          '<td><b>' + T.esc(x.conta) + '</b> ' + T.esc(x.contaNome) + '</td>' + T.tdValor(x.valor) +
          '<td class="num"><b>' + x.vezes + '</b></td><td>' + T.esc(U.nomeCompetencia(x.comp)) + '</td></tr>';
      },
    });
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function ligar() {
    E.el.addEventListener('click', async (ev) => {
      const aba = ev.target.closest('[data-aba]');
      if (aba) { E.aba = aba.getAttribute('data-aba'); desenhar(); return; }
      const acao = ev.target.closest('[data-acao]');
      if (!acao) return;
      const a = acao.getAttribute('data-acao');
      if (a === 'ajustes') await baixarAjustes();
      else if (a === 'excel') baixarExcel();
    });
    E.el.addEventListener('change', (ev) => {
      const marcar = ev.target.closest('[data-marcar]');
      if (marcar) {
        const chave = marcar.getAttribute('data-marcar');
        const f = E.r.achados.mesmoFornecedorVariasContas.find((x) => x.chave === chave);
        const e = E.escolhas.get(chave) || { marcado: false, destino: f ? f.principal : '' };
        e.marcado = marcar.checked;
        E.escolhas.set(chave, e);
        desenharLista();
        return;
      }
      const destino = ev.target.closest('[data-destino]');
      if (destino) {
        const chave = destino.getAttribute('data-destino');
        const e = E.escolhas.get(chave) || { marcado: true, destino: '' };
        e.destino = destino.value;
        E.escolhas.set(chave, e);
        desenharLista();
        return;
      }
      const f = ev.target.closest('select[data-filtro]');
      if (f) { E.filtros[f.getAttribute('data-filtro')] = f.value; desenharLista(); }
    });
    E.el.addEventListener('input', (ev) => {
      const f = ev.target.closest('input[data-filtro]');
      if (!f) return;
      E.filtros[f.getAttribute('data-filtro')] = f.value;
      clearTimeout(E.tempo);
      E.tempo = setTimeout(desenharLista, 250);
    });
  }

  // ------------------------------------------------------------------
  // O arquivo de ajustes das reclassificações marcadas
  // ------------------------------------------------------------------
  async function baixarAjustes() {
    const escolhas = [];
    E.escolhas.forEach((e, chave) => {
      if (!e.marcado) return;
      const f = E.r.achados.mesmoFornecedorVariasContas.find((x) => x.chave === chave);
      if (!f) return;
      const destino = e.destino || f.principal;
      const linhas = f.contas.filter((c) => String(c.conta) !== String(destino)).reduce((t, c) => t.concat(c.linhas), []);
      escolhas.push({ linhas, destino });
    });
    if (!escolhas.length) {
      T.avisoRapido('Marque na lista "🔀 Mesmo fornecedor em várias contas" quem você quer reclassificar.', 'ambar', 8000);
      return;
    }
    const lancamentos = MR().ajustesDe(E.r, escolhas);
    if (!lancamentos.length) { T.avisoRapido('Nada a reclassificar: nas marcações, tudo já está na conta escolhida.', 'ok', 7000); return; }
    const total = lancamentos.reduce((s, l) => s + l.valor, 0);
    const ok = await T.confirmar({
      titulo: 'Baixar o arquivo de ajustes?',
      botao: '⬇ Baixar',
      texto: '<b>' + lancamentos.length + '</b> lançamento(s) de reclassificação, somando ' + T.moeda(total) + ', no layout de importação do sistema.<br><br>' +
        'Cada um leva o que está na conta errada para a conta que você escolheu, com o histórico pronto. <b>Confira no sistema antes de importar.</b>',
    });
    if (!ok) return;
    const cfg = app().config.layoutAjustes || {};
    const g = raiz.LayoutAjustes.gerar(lancamentos, cfg);
    const nome = raiz.LayoutAjustes.nomeDoArquivo(E.codigo, E.r.periodo.ate, 'resultado', g.extensao);
    T.baixar(g.bytes, nome, g.tipo || 'text/plain');
    T.avisoRapido('Arquivo de ajustes baixado: ' + nome + ' · ' + g.linhas + ' lançamento(s), ' + T.moeda(g.total) + '.', 'ok', 9000);
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'resultado-ajustes', alvo: nome,
      detalhe: lancamentos.length + ' reclassificação(ões) · ' + U.formatarCentavos(total) }).catch(() => {});
  }

  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' }, sub: { cor: 'FF5F6B7A', italico: true },
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true },
    cabNum: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', alinh: 'right', vert: 'center', quebra: true },
    val: { formato: 'dinheiro' }, grp: { negrito: true, fundo: 'FFE7EEF5' }, grpVal: { negrito: true, fundo: 'FFE7EEF5', formato: 'dinheiro' },
  };
  function baixarExcel() {
    const cel = (v, e) => (e ? { v: v, e: e } : v);
    const reais = (c) => Math.round(c) / 100;
    const planilhas = [];
    const t = E.r.totais;
    const res = [{ celulas: [cel('Contas de resultado · achar distorções', 'tit')], altura: 22 },
      { celulas: [cel(E.emp.codigo + ' · ' + E.emp.nome + ' · ' + E.r.periodo.de.slice(0, 7) + ' a ' + E.r.periodo.ate.slice(0, 7), 'sub')] }, null];
    ABAS.forEach((a) => {
      const d = t[a.chave] || { qtd: 0, valor: 0 };
      res.push({ celulas: [cel(a.titulo, 'grp'), cel(d.qtd, 'grp'), cel(reais(d.valor), 'grpVal')] });
    });
    planilhas.push({ nome: 'Resumo', colunas: [52, 12, 18], linhas: res, rodape: E.emp.nome + ' · contas de resultado' });
    // Uma aba por achado de linha
    ABAS.filter((a) => a.id !== 'contas' && a.id !== 'repetidos').forEach((a) => {
      const lista = E.r.achados[a.chave] || [];
      const linhas = [{ celulas: [cel(a.titulo, 'tit')], altura: 22 }, { celulas: [cel(a.texto, 'sub')] }, null];
      const cab = linhas.push({ celulas: ['Data', 'Fornecedor', 'Conta', 'Título da conta', 'Contrapartida', 'Título da contrapartida', 'Valor', 'D/C', 'Histórico']
        .map((x, k) => cel(x, k === 6 ? 'cabNum' : 'cab')), altura: 26 });
      lista.forEach((x) => linhas.push({ celulas: [x.data, x.nome || '', x.conta, x.contaNome, x.contra, x.contraNome, cel(reais(x.valor), 'val'), x.lado, x.historico] }));
      planilhas.push({ nome: a.titulo.slice(0, 28), colunas: [12, 38, 10, 30, 12, 30, 15, 6, 70], linhas, congelar: { linhas: cab, colunas: 0 }, repetir: [cab, cab], paisagem: true, rodape: E.emp.nome + ' · ' + a.titulo });
    });
    // Mesmo fornecedor em várias contas
    const v = [{ celulas: [cel('Mesmo fornecedor em várias contas', 'tit')], altura: 22 }, { celulas: [cel('a conta sugerida é a de maior valor', 'sub')] }, null];
    const cabV = v.push({ celulas: ['Fornecedor', 'Contas', 'Total no resultado', 'Vai mudar de conta', 'Conta sugerida', 'Detalhe'].map((x, k) => cel(x, k >= 2 && k <= 3 ? 'cabNum' : 'cab')), altura: 26 });
    E.r.achados.mesmoFornecedorVariasContas.forEach((f) => v.push({ celulas: [f.nome, f.qtdContas, cel(reais(f.total), 'val'), cel(reais(f.aLevar), 'val'),
      f.principal + ' · ' + f.principalNome, f.contas.map((c) => c.conta + ' ' + c.nome + ' ' + U.formatarCentavos(c.valor)).join(' | ')] }));
    planilhas.push({ nome: 'Fornecedor em varias contas', colunas: [40, 8, 16, 16, 34, 90], linhas: v, congelar: { linhas: cabV, colunas: 0 }, repetir: [cabV, cabV], paisagem: true, rodape: E.emp.nome });
    // Repetidos
    const rp = [{ celulas: [cel('Pode ser lançamento em dobro', 'tit')], altura: 22 }, null];
    const cabR = rp.push({ celulas: ['Fornecedor', 'Conta', 'Título', 'Valor', 'Vezes', 'Mês', 'Datas'].map((x, k) => cel(x, k === 3 || k === 4 ? 'cabNum' : 'cab')), altura: 26 });
    E.r.achados.repetidos.forEach((x) => rp.push({ celulas: [x.nome, x.conta, x.contaNome, cel(reais(x.valor), 'val'), x.vezes, x.comp.slice(0, 7),
      x.linhas.map((i) => E.r.linhas[i].data).join(' · ')] }));
    planilhas.push({ nome: 'Em dobro', colunas: [40, 10, 30, 15, 8, 10, 40], linhas: rp, congelar: { linhas: cabR, colunas: 0 }, repetir: [cabR, cabR], paisagem: true, rodape: E.emp.nome });
    const bytes = raiz.ExcelBonito.gerar({ planilhas, estilos: ESTILOS, ativa: 0 });
    T.baixar(bytes, U.nomeSeguro('Contas de resultado ' + E.emp.codigo + ' ' + E.emp.nome + ' ' + E.r.periodo.ate.slice(0, 7), 100) + '.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  raiz.TelaResultado = { mostrar, ABAS };
})(self);
