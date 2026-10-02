/*
 * Conciliador Solutta — tela-entregas.js
 * CONTROLE DE ENTREGAS (Dony, 02/10/2026). Três telas:
 *   📅 Painel do mês   todas as empresas × as entregas do mês, com semáforo; clicar marca como entregue
 *   🏢 Uma empresa     o ano inteiro dela, mês a mês, e quais entregas valem para ela
 *   ⚙ Entregas        o catálogo do escritório (nome, categoria, periodicidade, prazo, regimes)
 *
 * O catálogo é do ESCRITÓRIO (documentoGeral); o que foi entregue fica guardado por empresa e por ano
 * (documento da empresa, 'entregas-<ano>'); e quais entregas valem para cada empresa saem do REGIME dela,
 * com ajuste à mão guardado no cadastro.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = () => raiz.MotorEntregas;
  function app() { return raiz.App; }

  const CHAVE_TIPOS = 'entregas-tipos';
  const chaveDoAno = (ano) => 'entregas-' + ano;

  const E = { parte: '', codigo: '', competencia: '', ano: 0, categoria: '', so: '', tipos: null, marcas: {}, empresas: [] };

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function lerTipos() {
    const arm = app().armazenamento;
    let doc = null;
    try { doc = await arm.documentoGeral(CHAVE_TIPOS); } catch (e) { doc = null; }
    const tipos = doc && doc.dados && Array.isArray(doc.dados.tipos) ? doc.dados.tipos : null;
    return tipos && tipos.length ? tipos : M().CATALOGO.map((t) => Object.assign({}, t));
  }
  async function gravarTipos(tipos) {
    await app().armazenamento.salvarDocumentoGeral(CHAVE_TIPOS, { dados: { tipos } });
    E.tipos = tipos;
  }
  async function lerMarcas(codigo, ano) {
    try {
      const doc = await app().armazenamento.documento(codigo, chaveDoAno(ano));
      return (doc && doc.dados && doc.dados.marcas) || {};
    } catch (e) { return {}; }
  }
  async function gravarMarca(codigo, ano, chave, marca) {
    const marcas = Object.assign({}, await lerMarcas(codigo, ano));
    if (marca) marcas[chave] = marca; else delete marcas[chave];
    await app().armazenamento.salvarDocumento(codigo, chaveDoAno(ano), { dados: { marcas } });
    E.marcas[String(codigo)] = marcas;
    return marcas;
  }
  const anoDe = (comp) => Number(String(comp).slice(0, 4));

  // ------------------------------------------------------------------
  // Moldura
  // ------------------------------------------------------------------
  function pintar(el, html) {
    el.innerHTML = '<div id="ent-raiz"></div>';
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.innerHTML = html;
    return raizEl;
  }
  function abas(parte) {
    const comp = E.competencia || U.competenciaDe(U.hoje());
    return '<div class="erp-abas nao-imprimir">' +
      '<a href="#/entregas/' + U.anoMes(comp) + '" class="' + (parte === 'painel' ? 'ativa' : '') + '">📅 Painel do mês</a>' +
      (E.codigo ? '<a href="#/entregas/empresa/' + encodeURIComponent(E.codigo) + '/' + (E.ano || anoDe(comp)) + '" class="' + (parte === 'empresa' ? 'ativa' : '') + '">🏢 Empresa</a>' : '') +
      '<a href="#/entregas/tipos" class="' + (parte === 'tipos' ? 'ativa' : '') + '">⚙ Entregas do escritório</a>' +
      '</div>';
  }
  const COR = { verde: 'ok', ambar: 'falta-ambar', vermelho: 'falta', cinza: 'suave' };
  function selo(s) {
    const marca = { entregue: '✓', dispensada: '–', atrasada: '!', 'vence-hoje': '•', 'no-prazo': '', 'sem-prazo': '' }[s.estado];
    return '<span class="ent-selo ent-' + s.cor + '" title="' + T.esc(s.rotulo + (s.vence ? ' · vence ' + s.vence.texto : '')) + '">' + (marca || '·') + '</span>';
  }

  // ------------------------------------------------------------------
  // PAINEL DO MÊS
  // ------------------------------------------------------------------
  async function mostrarPainel(el, anoMes, conferir) {
    T.carregando(el, 'Montando o controle de entregas…');
    const comp = /^\d{4}-\d{2}$/.test(String(anoMes || '')) ? anoMes + '-01' : U.competenciaDe(U.hoje());
    E.parte = 'painel'; E.competencia = comp; E.ano = anoDe(comp);
    const empresas = (app().empresas || []).filter((e) => !e.ehGrupo);
    E.empresas = empresas;
    E.tipos = await lerTipos();
    E.marcas = {};
    for (const e of empresas) E.marcas[String(e.codigo)] = await lerMarcas(e.codigo, E.ano);
    // A declaração anual do painel é a do exercício anterior: as marcas dela ficam no ano passado.
    for (const e of empresas) {
      const anterior = await lerMarcas(e.codigo, E.ano - 1);
      E.marcas[String(e.codigo)] = Object.assign({}, anterior, E.marcas[String(e.codigo)]);
    }
    if (conferir && !conferir()) return;
    desenharPainel(el);
  }

  function desenharPainel(el) {
    const p = M().painel(E.empresas, E.tipos, E.competencia, E.marcas, { categoria: E.categoria });
    const comp = E.competencia;
    const mes = (n) => U.anoMes(U.somarMeses(comp, n));
    const cats = M().CATEGORIAS;
    const linhas = p.linhas.filter((l) => {
      if (E.so === 'atrasadas') return l.atrasadas > 0;
      if (E.so === 'pendentes') return l.entregues < l.total;
      return true;
    });
    // As colunas são as entregas que aparecem em alguma empresa (cada regime tem as suas).
    const colunas = [];
    p.linhas.forEach((l) => l.celulas.forEach((c) => { if (!colunas.some((x) => x.id === c.tipo.id)) colunas.push(c.tipo); }));
    colunas.sort((a, b) => cats.findIndex((c) => c.id === a.categoria) - cats.findIndex((c) => c.id === b.categoria) || a.nome.localeCompare(b.nome, 'pt-BR'));
    const corpo = linhas.map((l) => {
      const porId = new Map(l.celulas.map((c) => [c.tipo.id, c]));
      return '<tr><td class="fixa"><a href="#/entregas/empresa/' + encodeURIComponent(l.empresa.codigo) + '/' + E.ano + '">' +
        T.esc(l.empresa.codigo) + ' · ' + T.esc(l.empresa.nome) + '</a>' +
        '<br><span class="pequeno suave">' + T.esc(l.empresa.regime || 'sem regime no cadastro') + '</span></td>' +
        '<td class="num pequeno">' + l.entregues + '/' + l.total + (l.atrasadas ? ' <span class="falta">· ' + l.atrasadas + ' atrasada(s)</span>' : '') + '</td>' +
        colunas.map((t) => {
          const c = porId.get(t.id);
          if (!c) return '<td class="ent-celula ent-fora" title="esta entrega não vale para esta empresa">·</td>';
          return '<td class="ent-celula"><button type="button" class="ent-botao" data-ent-marcar="' + T.esc(l.empresa.codigo) + '|' + T.esc(t.id) + '|' + T.esc(c.competencia) + '">' + selo(c) + '</button></td>';
        }).join('') + '</tr>';
    }).join('');
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>📦 Controle de entregas</h1>' +
      '<p class="suave">O que falta entregar, o que está atrasado e o que já saiu — por empresa e por mês.</p></div>' +
      '<div class="acoes"><button type="button" class="botao pequeno" data-ent="mes-anterior">◀</button> ' +
      '<b style="margin:0 8px">' + T.esc(U.nomeCompetencia(comp)) + '</b> ' +
      '<button type="button" class="botao pequeno" data-ent="mes-seguinte">▶</button></div></div>' +
      abas('painel') +
      '<div class="md-barra">' +
      '<label class="caixa-opcao"><input type="radio" name="ent-cat" value=""' + (!E.categoria ? ' checked' : '') + '> Tudo</label>' +
      cats.map((c) => '<label class="caixa-opcao"><input type="radio" name="ent-cat" value="' + c.id + '"' + (E.categoria === c.id ? ' checked' : '') + '> ' + c.icone + ' ' + T.esc(c.curto) + '</label>').join('') +
      '<span style="width:14px"></span>' +
      '<label class="caixa-opcao"><input type="checkbox" data-ent-so="atrasadas"' + (E.so === 'atrasadas' ? ' checked' : '') + '> só com atraso</label>' +
      '<label class="caixa-opcao"><input type="checkbox" data-ent-so="pendentes"' + (E.so === 'pendentes' ? ' checked' : '') + '> só com pendência</label>' +
      '<span class="espaco"></span>' +
      '<span class="' + (p.resumo.atrasadas ? 'md-falta' : 'md-ok') + '">' + p.resumo.entregues + ' de ' + p.resumo.total + ' entregues' +
      (p.resumo.atrasadas ? ' · ' + p.resumo.atrasadas + ' atrasada(s)' : '') + (p.resumo.venceHoje ? ' · ' + p.resumo.venceHoje + ' vence(m) hoje' : '') + '</span></div>' +
      (!E.empresas.length ? '<div class="aviso ambar"><span class="icone-aviso">🏢</span><div>Nenhuma empresa cadastrada ainda. <a href="#/">Ir para as empresas</a></div></div>' :
        '<div class="apres-caixa"><table class="apres ent-tabela"><thead><tr>' +
        '<th class="fixa">Empresa</th><th class="num">Feitas</th>' +
        colunas.map((t) => '<th class="ent-col" title="' + T.esc(M().categoria(t.categoria).nome + ' · ' + M().prazoEmPalavras(t)) + '"><span>' + T.esc(t.nome) + '</span></th>').join('') +
        '</tr></thead><tbody>' + (corpo || '<tr><td colspan="' + (colunas.length + 2) + '" class="suave">Nada aqui com esse filtro.</td></tr>') + '</tbody></table></div>') +
      '<p class="apres-nota suave">Clique num quadradinho para marcar como entregue. ' +
      '<b class="ent-legenda"><span class="ent-selo ent-verde">✓</span> entregue · <span class="ent-selo ent-vermelho">!</span> atrasada · ' +
      '<span class="ent-selo ent-ambar">•</span> vence hoje ou está perto · <span class="ent-selo ent-cinza">·</span> no prazo</b></p>' +
      '<p class="apres-nota suave">Os prazos vêm sugeridos e <b>mudam por norma e por estado</b>: confira cada um em <b>⚙ Entregas do escritório</b>.</p>');
    ligarPainel(el);
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.querySelectorAll('[name="ent-cat"]').forEach((r) => r.addEventListener('change', () => { E.categoria = r.value; desenharPainel(el); }));
    raizEl.querySelectorAll('[data-ent-so]').forEach((c) => c.addEventListener('change', () => {
      const qual = c.getAttribute('data-ent-so');
      E.so = c.checked ? qual : '';
      desenharPainel(el);
    }));
  }

  function ligarPainel(el) {
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.addEventListener('click', async (ev) => {
      const nav = ev.target.closest('[data-ent]');
      if (nav) {
        const q = nav.getAttribute('data-ent');
        if (q === 'mes-anterior' || q === 'mes-seguinte') app().ir('#/entregas/' + U.anoMes(U.somarMeses(E.competencia, q === 'mes-anterior' ? -1 : 1)));
        return;
      }
      const bt = ev.target.closest('[data-ent-marcar]');
      if (bt) {
        const [codigo, tipoId, comp] = bt.getAttribute('data-ent-marcar').split('|');
        await janelaDaEntrega(el, codigo, tipoId, comp, () => desenharPainel(el));
      }
    });
  }

  // ------------------------------------------------------------------
  // A JANELA DE UMA ENTREGA: marcar, desmarcar, dispensar, anotar o protocolo
  // ------------------------------------------------------------------
  async function janelaDaEntrega(el, codigo, tipoId, competencia, aoFechar) {
    const tipo = (E.tipos || []).find((t) => t.id === tipoId);
    if (!tipo) return;
    const empresa = (app().empresas || []).find((e) => String(e.codigo) === String(codigo)) || {};
    const ano = anoDe(competencia);
    const marcas = E.marcas[String(codigo)] || (E.marcas[String(codigo)] = await lerMarcas(codigo, ano));
    const chave = tipoId + '|' + competencia;
    const marca = marcas[chave] || null;
    const s = M().situacao(tipo, competencia, marca);
    const quando = competencia.length === 4 ? 'exercício de ' + competencia : U.nomeCompetencia(competencia);
    const r = await T.janela({
      titulo: tipo.nome,
      corpo: '<p class="suave" style="margin:0 0 12px;line-height:1.55"><b>' + T.esc(empresa.codigo + ' · ' + empresa.nome) + '</b><br>' +
        T.esc(quando) + ' · vence em <b>' + T.esc(s.vence ? s.vence.texto : '—') + '</b> · ' +
        '<span class="' + (s.cor === 'vermelho' ? 'falta' : s.cor === 'verde' ? 'ok' : '') + '">' + T.esc(s.rotulo) + '</span></p>' +
        (tipo.observacao ? '<p class="pequeno suave" style="margin:0 0 12px">' + T.esc(tipo.observacao) + '</p>' : '') +
        '<div class="grade-form">' +
        '<div class="campo"><label for="f-data">Entregue em</label><input id="f-data" value="' + T.esc((marca && marca.data) || U.hoje().texto) + '" placeholder="dd/mm/aaaa"></div>' +
        '<div class="campo"><label for="f-protocolo">Recibo / protocolo</label><input id="f-protocolo" maxlength="60" value="' + T.esc((marca && marca.protocolo) || '') + '"></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc((marca && marca.observacao) || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:10px"></div>',
      botoes: [{ texto: 'Fechar', valor: null }]
        .concat(marca ? [{ texto: '↩ Desmarcar', valor: { acao: 'limpar' } }] : [])
        .concat([{ texto: '– Dispensar', valor: { acao: 'dispensar' } },
          { texto: '✓ Marcar como entregue', tipo: 'primario', antes: (j) => {
            const data = U.lerData(j.querySelector('#f-data').value);
            if (!data) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">Data inválida: escreva dd/mm/aaaa.</div>'; return false; }
            return { acao: 'entregue', data: data.texto, protocolo: j.querySelector('#f-protocolo').value.trim(), observacao: j.querySelector('#f-obs').value.trim() };
          } }]),
    });
    if (!r) return;
    let nova = null;
    if (r.acao === 'entregue') nova = { situacao: 'entregue', data: r.data, protocolo: r.protocolo, observacao: r.observacao, por: app().usuario.nome, em: U.agoraISO() };
    else if (r.acao === 'dispensar') nova = { situacao: 'dispensada', por: app().usuario.nome, em: U.agoraISO() };
    try {
      await gravarMarca(codigo, ano, chave, nova);
      T.avisoRapido(r.acao === 'limpar' ? 'Marcação desfeita.' : r.acao === 'dispensar' ? 'Marcada como dispensada.' : 'Entrega marcada.', 'ok', 3000);
      if (aoFechar) aoFechar();
    } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
  }

  // ------------------------------------------------------------------
  // UMA EMPRESA, O ANO INTEIRO
  // ------------------------------------------------------------------
  async function mostrarEmpresa(el, codigo, ano, conferir) {
    T.carregando(el, 'Abrindo as entregas da empresa…');
    const a = Number(ano) || U.hoje().ano;
    E.parte = 'empresa'; E.codigo = String(codigo); E.ano = a;
    E.competencia = a + '-' + String(U.hoje().mes).padStart(2, '0') + '-01';
    E.tipos = await lerTipos();
    E.marcas[String(codigo)] = Object.assign({}, await lerMarcas(codigo, a - 1), await lerMarcas(codigo, a));
    if (conferir && !conferir()) return;
    desenharEmpresa(el);
  }
  function desenharEmpresa(el) {
    const empresa = (app().empresas || []).find((e) => String(e.codigo) === E.codigo);
    if (!empresa) { pintar(el, '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>Empresa não encontrada. <a href="#/entregas">Voltar</a></div></div>'); return; }
    const linhas = M().doAno(empresa, E.tipos, E.ano, E.marcas[E.codigo] || {});
    const valem = new Set(M().tiposDaEmpresa(empresa, E.tipos).map((t) => t.id));
    const cats = M().CATEGORIAS;
    const corpo = cats.map((c) => {
      const dela = linhas.filter((l) => l.tipo.categoria === c.id);
      if (!dela.length) return '';
      return '<tr class="ent-grupo"><td colspan="14">' + c.icone + ' <b>' + T.esc(c.nome) + '</b> <span class="suave pequeno">' + T.esc(c.ajuda) + '</span></td></tr>' +
        dela.map((l) => '<tr><td class="fixa"><b>' + T.esc(l.tipo.nome) + '</b><br><span class="pequeno suave">' + T.esc(M().prazoEmPalavras(l.tipo)) + '</span></td>' +
          (l.tipo.periodicidade === 'anual'
            ? '<td class="ent-celula" colspan="12"><button type="button" class="ent-botao" data-ent-marcar="' + T.esc(E.codigo) + '|' + T.esc(l.tipo.id) + '|' + T.esc(l.celulas[0].competencia) + '">' +
              selo(l.celulas[0]) + ' <span class="pequeno">exercício ' + T.esc(l.celulas[0].competencia) + ' · vence ' + T.esc(l.celulas[0].vence ? l.celulas[0].vence.texto : '—') + '</span></button></td>'
            : U.MESES.map((nome, i) => {
              const c2 = l.celulas.find((x) => U.partesCompetencia(x.competencia) && U.partesCompetencia(x.competencia).mes === i + 1);
              if (!c2) return '<td class="ent-celula ent-fora">·</td>';
              return '<td class="ent-celula"><button type="button" class="ent-botao" data-ent-marcar="' + T.esc(E.codigo) + '|' + T.esc(l.tipo.id) + '|' + T.esc(c2.competencia) + '">' + selo(c2) + '</button></td>';
            }).join('')) +
          '</tr>').join('');
    }).join('');
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>📦 Entregas de ' + T.esc(empresa.nome) + '</h1>' +
      '<p class="suave">' + T.esc(empresa.codigo) + ' · ' + T.esc(empresa.regime || 'sem regime no cadastro') + ' · ano ' + E.ano + '</p></div>' +
      '<div class="acoes"><button type="button" class="botao pequeno" data-ent="ano-anterior">◀ ' + (E.ano - 1) + '</button> ' +
      '<button type="button" class="botao pequeno" data-ent="ano-seguinte">' + (E.ano + 1) + ' ▶</button> ' +
      '<button type="button" class="botao" data-ent="quais">✎ Quais entregas valem para ela</button></div></div>' +
      abas('empresa') +
      '<div class="apres-caixa"><table class="apres ent-tabela"><thead><tr><th class="fixa">Entrega</th>' +
      U.MESES.map((m) => '<th class="ent-col-mes">' + T.esc(m.slice(0, 3)) + '</th>').join('') + '</tr></thead><tbody>' +
      (corpo || '<tr><td colspan="13" class="suave">Nenhuma entrega vale para esta empresa. Clique em <b>✎ Quais entregas valem para ela</b>.</td></tr>') +
      '</tbody></table></div>' +
      '<p class="apres-nota suave">' + valem.size + ' entrega(s) valem para esta empresa, pelo regime <b>' + T.esc(empresa.regime || '—') + '</b> e pelos ajustes dela.</p>');
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.addEventListener('click', async (ev) => {
      const nav = ev.target.closest('[data-ent]');
      if (nav) {
        const q = nav.getAttribute('data-ent');
        if (q === 'ano-anterior') app().ir('#/entregas/empresa/' + encodeURIComponent(E.codigo) + '/' + (E.ano - 1));
        else if (q === 'ano-seguinte') app().ir('#/entregas/empresa/' + encodeURIComponent(E.codigo) + '/' + (E.ano + 1));
        else if (q === 'quais') await janelaQuais(el, empresa);
        return;
      }
      const bt = ev.target.closest('[data-ent-marcar]');
      if (bt) {
        const [codigo, tipoId, comp] = bt.getAttribute('data-ent-marcar').split('|');
        await janelaDaEntrega(el, codigo, tipoId, comp, () => desenharEmpresa(el));
      }
    });
  }

  // Quais entregas valem para esta empresa: o regime sugere, ele liga e desliga.
  async function janelaQuais(el, empresa) {
    const tipos = E.tipos || [];
    const valem = new Set(M().tiposDaEmpresa(empresa, tipos).map((t) => t.id));
    const escolhas = empresa.entregas || {};
    const cats = M().CATEGORIAS;
    const salvo = await T.janela({
      titulo: 'Quais entregas valem para ' + empresa.nome,
      larga: true,
      corpo: '<p class="suave" style="margin:0 0 12px;line-height:1.55">O programa já marcou o que costuma valer para o regime <b>' +
        T.esc(empresa.regime || 'não informado') + '</b>. Ligue ou desligue o que for diferente — fica guardado só nesta empresa.</p>' +
        cats.map((c) => '<h3 class="apres-sub">' + c.icone + ' ' + T.esc(c.nome) + '</h3>' +
          tipos.filter((t) => t.categoria === c.id).map((t) => '<label class="caixa-opcao ent-escolha"><input type="checkbox" data-q="' + T.esc(t.id) + '"' +
            (valem.has(t.id) ? ' checked' : '') + '> ' + T.esc(t.nome) + ' <span class="suave pequeno">· ' + T.esc(M().prazoEmPalavras(t)) +
            (escolhas[t.id] !== undefined ? ' · <b>ajustada à mão</b>' : '') + '</span></label>').join('')).join(''),
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', tipo: 'primario', antes: (j) => {
        const novo = {};
        Array.from(j.querySelectorAll('[data-q]')).forEach((c) => {
          const id = c.getAttribute('data-q');
          const padrao = M().tiposDaEmpresa(Object.assign({}, empresa, { entregas: {} }), tipos).some((t) => t.id === id);
          if (c.checked !== padrao) novo[id] = c.checked;   // só guarda o que foge do regime
        });
        return { entregas: novo };
      } }],
    });
    if (!salvo) return;
    try {
      await app().armazenamento.salvarEmpresa(Object.assign({}, empresa, { entregas: salvo.entregas }));
      app().empresas = await app().armazenamento.empresas();
      T.avisoRapido('Entregas desta empresa salvas.', 'ok', 3000);
      desenharEmpresa(el);
    } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
  }

  // ------------------------------------------------------------------
  // O CATÁLOGO DO ESCRITÓRIO
  // ------------------------------------------------------------------
  async function mostrarTipos(el, conferir) {
    T.carregando(el, 'Abrindo as entregas do escritório…');
    E.parte = 'tipos';
    E.tipos = await lerTipos();
    if (conferir && !conferir()) return;
    desenharTipos(el);
  }
  function desenharTipos(el) {
    const cats = M().CATEGORIAS;
    const corpo = cats.map((c) => {
      const dela = (E.tipos || []).filter((t) => t.categoria === c.id);
      return '<tr class="ent-grupo"><td colspan="6">' + c.icone + ' <b>' + T.esc(c.nome) + '</b> <span class="suave pequeno">' + T.esc(c.ajuda) + '</span></td></tr>' +
        (dela.map((t) => '<tr' + (t.situacao === 'inativa' ? ' class="erp-inativa"' : '') + '><td class="fixa"><b>' + T.esc(t.nome) + '</b>' +
          (t.observacao ? '<br><span class="pequeno suave">' + T.esc(t.observacao) + '</span>' : '') + '</td>' +
          '<td class="pequeno">' + T.esc(M().periodicidade(t.periodicidade).nome) + '</td>' +
          '<td class="pequeno">' + T.esc(M().prazoEmPalavras(t)) + '</td>' +
          '<td class="pequeno">' + T.esc((t.regimes && t.regimes.length && t.regimes.length < M().REGIMES.length) ? t.regimes.join(', ') : 'todos os regimes') + '</td>' +
          '<td class="pequeno">' + (t.situacao === 'inativa' ? '<span class="falta">não usa</span>' : 'em uso') + '</td>' +
          '<td class="nao-imprimir" style="white-space:nowrap"><button type="button" class="lapis" data-ent-editar="' + T.esc(t.id) + '" title="Editar">✎</button> ' +
          '<button type="button" class="lapis" data-ent-excluir="' + T.esc(t.id) + '" title="Excluir">🗑</button></td></tr>').join('') ||
          '<tr><td colspan="6" class="suave">Nenhuma nesta categoria.</td></tr>');
    }).join('');
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>⚙ Entregas do escritório</h1>' +
      '<p class="suave">A lista que vale para todas as empresas. O regime de cada uma escolhe quais aparecem para ela.</p></div>' +
      '<div class="acoes"><button type="button" class="botao primario" data-ent="nova">+ Nova entrega</button> ' +
      '<button type="button" class="botao pequeno" data-ent="restaurar">↺ Voltar à lista sugerida</button></div></div>' +
      abas('tipos') +
      '<div class="aviso ambar"><span class="icone-aviso">📅</span><div><b>Confira os prazos.</b> Os que vêm aqui são os usuais, para você não começar do zero — ' +
      'mas eles mudam por norma, por estado e por regime. Ajuste cada um ao que vale para a sua carteira.</div></div>' +
      '<div class="apres-caixa" style="margin-top:12px"><table class="apres"><thead><tr><th class="fixa">Entrega</th><th>Periodicidade</th><th>Prazo</th><th>Regimes</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead>' +
      '<tbody>' + corpo + '</tbody></table></div>');
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.addEventListener('click', async (ev) => {
      const nav = ev.target.closest('[data-ent]');
      if (nav) {
        const q = nav.getAttribute('data-ent');
        if (q === 'nova') await janelaTipo(el, null);
        else if (q === 'restaurar') {
          const ok = await T.confirmar({ titulo: 'Voltar à lista sugerida?',
            texto: 'A lista do escritório volta a ser a que o programa sugere. <b>O que já foi marcado como entregue não se perde</b> — some só o que você mudou nesta lista.',
            botao: '↺ Voltar à sugerida', perigo: true });
          if (!ok) return;
          await gravarTipos(M().CATALOGO.map((t) => Object.assign({}, t)));
          T.avisoRapido('Lista restaurada.', 'ok', 3000);
          desenharTipos(el);
        }
        return;
      }
      const ed = ev.target.closest('[data-ent-editar]');
      if (ed) { await janelaTipo(el, ed.getAttribute('data-ent-editar')); return; }
      const ex = ev.target.closest('[data-ent-excluir]');
      if (ex) {
        const id = ex.getAttribute('data-ent-excluir');
        const t = (E.tipos || []).find((x) => x.id === id) || {};
        const ok = await T.confirmar({ titulo: 'Excluir "' + (t.nome || id) + '"?',
          texto: 'Ela sai da lista do escritório. O que já foi marcado como entregue continua guardado.', botao: '🗑 Excluir', perigo: true });
        if (!ok) return;
        await gravarTipos((E.tipos || []).filter((x) => x.id !== id));
        desenharTipos(el);
      }
    });
  }

  async function janelaTipo(el, id) {
    const tipos = E.tipos || [];
    const atual = id ? (tipos.find((t) => t.id === id) || {}) : { categoria: 'fisco', periodicidade: 'mensal', prazo: { dia: 15, meses: 1 }, regimes: [] };
    const p = atual.prazo || {};
    const regimes = M().REGIMES;
    const salvo = await T.janela({
      titulo: id ? 'Editar "' + atual.nome + '"' : 'Nova entrega',
      larga: true,
      corpo: '<div class="grade-form">' +
        '<div class="campo inteiro"><label for="f-nome">Nome *</label><input id="f-nome" maxlength="80" autofocus value="' + T.esc(atual.nome || '') + '" placeholder="Ex.: GIA de São Paulo"></div>' +
        '<div class="campo"><label for="f-cat">O que é *</label><select id="f-cat">' +
        M().CATEGORIAS.map((c) => '<option value="' + c.id + '"' + (atual.categoria === c.id ? ' selected' : '') + '>' + c.icone + ' ' + T.esc(c.nome) + '</option>').join('') + '</select></div>' +
        '<div class="campo"><label for="f-per">Periodicidade *</label><select id="f-per">' +
        M().PERIODICIDADES.map((x) => '<option value="' + x.id + '"' + (atual.periodicidade === x.id ? ' selected' : '') + '>' + T.esc(x.nome) + '</option>').join('') + '</select></div>' +
        '<div class="campo"><label for="f-dia">Dia do prazo</label><input id="f-dia" type="number" min="1" max="31" value="' + T.esc(String(p.dia || 15)) + '"></div>' +
        '<div class="campo" id="caixa-meses"><label for="f-meses">Quando</label><select id="f-meses">' +
        [[0, 'no próprio mês da competência'], [1, 'no mês seguinte'], [2, 'no 2º mês seguinte'], [3, 'no 3º mês seguinte']]
          .map(([n, txt]) => '<option value="' + n + '"' + ((p.meses === undefined ? 1 : p.meses) === n ? ' selected' : '') + '>' + txt + '</option>').join('') + '</select></div>' +
        '<div class="campo" id="caixa-mes"><label for="f-mes">Mês do prazo (anual)</label><select id="f-mes">' +
        U.MESES.map((m, i) => '<option value="' + (i + 1) + '"' + ((Number(p.mes) || 5) === i + 1 ? ' selected' : '') + '>' + T.esc(m) + '</option>').join('') + '</select>' +
        '<span class="ajuda">Do ano seguinte ao exercício.</span></div>' +
        '<div class="campo inteiro"><label>Vale para quais regimes <span class="suave pequeno">(nenhum marcado = todos)</span></label>' +
        '<div>' + regimes.map((r) => '<label class="caixa-opcao"><input type="checkbox" data-reg="' + T.esc(r) + '"' +
          ((atual.regimes || []).indexOf(r) >= 0 ? ' checked' : '') + '> ' + T.esc(r) + '</label>').join('') + '</div></div>' +
        '<div class="campo"><label for="f-sit">Situação</label><select id="f-sit">' +
        '<option value="ativa"' + (atual.situacao !== 'inativa' ? ' selected' : '') + '>Em uso</option>' +
        '<option value="inativa"' + (atual.situacao === 'inativa' ? ' selected' : '') + '>Não usa</option></select></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc(atual.observacao || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      aoAbrir: (j) => {
        const per = j.querySelector('#f-per');
        const mostrar = () => {
          const v = per.value;
          j.querySelector('#caixa-meses').style.display = v === 'anual' || v === 'eventual' ? 'none' : '';
          j.querySelector('#caixa-mes').style.display = v === 'anual' ? '' : 'none';
          j.querySelector('#f-dia').closest('.campo').style.display = v === 'eventual' ? 'none' : '';
        };
        per.addEventListener('change', mostrar);
        mostrar();
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: id ? 'Salvar' : 'Cadastrar', tipo: 'primario', antes: (j) => {
        const novo = {
          id: id || '', nome: j.querySelector('#f-nome').value.trim(), categoria: j.querySelector('#f-cat').value,
          periodicidade: j.querySelector('#f-per').value,
          prazo: { dia: Number(j.querySelector('#f-dia').value), meses: Number(j.querySelector('#f-meses').value), mes: Number(j.querySelector('#f-mes').value) },
          regimes: Array.from(j.querySelectorAll('[data-reg]')).filter((c) => c.checked).map((c) => c.getAttribute('data-reg')),
          situacao: j.querySelector('#f-sit').value, observacao: j.querySelector('#f-obs').value.trim(),
        };
        const r = M().conferirTipo(novo, tipos, id);
        if (!r.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(r.erro) + '</div>'; return false; }
        return r.tipo;
      } }],
    });
    if (!salvo) return;
    await gravarTipos(tipos.filter((t) => t.id !== id).concat([salvo]));
    T.avisoRapido(id ? 'Entrega salva.' : 'Entrega cadastrada.', 'ok', 3000);
    desenharTipos(el);
  }

  // ------------------------------------------------------------------
  async function mostrar(el, parte, a, b, conferir) {
    if (parte === 'tipos') return mostrarTipos(el, conferir);
    if (parte === 'empresa') return mostrarEmpresa(el, a, b, conferir);
    return mostrarPainel(el, parte, conferir);
  }

  raiz.TelaEntregas = { mostrar, _teste: { estado: () => E } };
})(self);
