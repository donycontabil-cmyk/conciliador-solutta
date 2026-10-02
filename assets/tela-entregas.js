/*
 * Conciliador Solutta — tela-entregas.js
 * CONTROLE DE ENTREGAS, no desenho que o Dony mandou (02/10/2026, prints do sistema que ele usa):
 * escolhe-se a OBRIGAÇÃO no alto ("ECF 2026", "Fechamento Contábil 08/2026") e a carteira inteira aparece
 * embaixo, uma empresa por linha — BPO, Célula, Grupo, Empresa, Código, CNPJ, Regime, Responsável,
 * Arquivos, Status, Validada, Validado por, Data validação e Observações.
 *
 * Tudo se edita na própria linha e grava na hora. Em cima, os cartões da obrigação (competência,
 * vencimento e meta de entrega) e a barra com busca, filtros, Excel e PDF.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = () => raiz.MotorEntregas;
  function app() { return raiz.App; }

  const CHAVE_OBRIGACOES = 'entregas-obrigacoes';
  const chaveDaObrigacao = (id) => 'ob-' + String(id).slice(0, 38);
  const CHAVE_ULTIMA = 'entregas.ultima-obrigacao';

  const E = { parte: '', obrigacoes: [], ob: null, dados: {}, linhas: [], filtros: {}, ordem: { col: 'nome', desc: false }, el: null };

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function lerObrigacoes() {
    try {
      const doc = await app().armazenamento.documentoGeral(CHAVE_OBRIGACOES);
      return (doc && doc.dados && Array.isArray(doc.dados.obrigacoes)) ? doc.dados.obrigacoes : [];
    } catch (e) { return []; }
  }
  async function gravarObrigacoes(lista) {
    await app().armazenamento.salvarDocumentoGeral(CHAVE_OBRIGACOES, { dados: { obrigacoes: lista } });
    E.obrigacoes = lista;
  }
  async function lerDados(id) {
    try {
      const doc = await app().armazenamento.documentoGeral(chaveDaObrigacao(id));
      return (doc && doc.dados && doc.dados.linhas) || {};
    } catch (e) { return {}; }
  }
  async function gravarDados(id, dados) {
    await app().armazenamento.salvarDocumentoGeral(chaveDaObrigacao(id), { dados: { linhas: dados } });
    E.dados = dados;
  }

  function pintar(el, html) {
    el.innerHTML = '<div id="ent-raiz"></div>';
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.innerHTML = html;
    return raizEl;
  }

  // ------------------------------------------------------------------
  // A TELA PRINCIPAL
  // ------------------------------------------------------------------
  async function mostrar(el, parte, id, conferir) {
    if (parte === 'obrigacoes') return mostrarObrigacoes(el, conferir);
    T.carregando(el, 'Abrindo o controle de entregas…');
    E.el = el; E.parte = 'controle';
    E.obrigacoes = await lerObrigacoes();
    // #/entregas/<id da obrigação>: o id vem no primeiro pedaço do endereço.
    const escolhida = parte || id || app().lerLocal(CHAVE_ULTIMA) || '';
    E.ob = E.obrigacoes.find((o) => o.id === escolhida) || null;
    E.dados = E.ob ? await lerDados(E.ob.id) : {};
    if (conferir && !conferir()) return;
    if (E.ob) app().gravarLocal(CHAVE_ULTIMA, E.ob.id);
    desenhar(el);
  }

  function desenhar(el) {
    const ob = E.ob;
    const todas = ob ? M().linhas(app().empresas || [], ob, E.dados) : [];
    E.linhas = todas;
    const lista = M().ordenar(M().filtrar(todas, E.filtros), E.ordem.col, E.ordem.desc);
    const res = ob ? M().resumo(todas, ob) : null;
    const opcoes = '<option value="">Selecione a obrigação…</option>' +
      E.obrigacoes.map((o) => '<option value="' + T.esc(o.id) + '"' + (ob && o.id === ob.id ? ' selected' : '') + '>' +
        T.esc(o.nome) + (o.situacao === 'encerrada' ? ' (encerrada)' : '') + '</option>').join('');
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>Controle de Obrigações</h1>' +
      '<p class="suave">Selecione uma obrigação para carregar as empresas.</p></div>' +
      '<div class="acoes"><button type="button" class="botao primario" data-ent="nova">+ Nova obrigação</button> ' +
      (ob ? '<button type="button" class="botao" data-ent="quem">👥 Quem entrega esta</button> ' : '') +
      '<a class="botao pequeno" href="#/entregas/obrigacoes">⚙ Obrigações</a></div></div>' +
      // Escolha da obrigação + competência (o quadro de cima do print)
      '<div class="cartao corpo ent-escolha-caixa"><div class="grade-form">' +
      '<div class="campo"><label for="ent-ob">Obrigação</label><select id="ent-ob" class="apres-campo">' + opcoes + '</select></div>' +
      '<div class="campo"><label for="ent-comp">Competência</label><input id="ent-comp" class="apres-campo" readonly value="' + T.esc(ob ? (ob.competencia || '—') : '—') + '"></div>' +
      '</div></div>' +
      (!ob
        ? '<div class="cartao corpo ent-vazio"><p class="suave">' + (E.obrigacoes.length
          ? 'Selecione uma obrigação acima para começar.'
          : 'Nenhuma obrigação cadastrada ainda. Clique em <b>+ Nova obrigação</b> — ECD, ECF, IBGE, MIT, Fechamento Contábil e outras já vêm com o prazo sugerido.') + '</p></div>'
        : cartoesDaObrigacao(ob, res) + avisoDeQuemEntrega() + barra(todas, lista, res) + tabela(lista, ob)));
    ligar(el);
  }

  // Quem ainda não tem as obrigações marcadas no cadastro entra em TODAS — e aparece aqui, para ele saber
  // que a lista está maior do que deveria (Dony, 02/10/2026: "não entregamos tudo de todas").
  function avisoDeQuemEntrega() {
    const faltam = M().semMarcar(app().empresas || []);
    if (!faltam) return '';
    return '<div class="aviso ambar nao-imprimir" style="margin:0 0 12px"><span class="icone-aviso">👥</span><div>' +
      '<b>' + faltam + ' empresa(s) ainda estão sem as obrigações marcadas no cadastro</b> e, por isso, aparecem em todas. ' +
      'Clique em <b>👥 Quem entrega esta</b> aqui em cima — ou marque no cadastro de cada uma.</div></div>';
  }

  // Marcar de uma vez quem entrega esta obrigação. Grava no cadastro de cada empresa, que é onde essa
  // informação mora: assim vale para a ECF 2027, para a de 2028 e para todas as outras do mesmo tipo.
  async function janelaQuemEntrega(el) {
    const ob = E.ob;
    if (!ob) return;
    const empresas = (app().empresas || []).filter((e) => !e.ehGrupo).slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const chave = M().chaveDe(ob);
    const salvo = await T.janela({
      titulo: 'Quem entrega "' + ob.nome + '"?',
      larga: true,
      corpo: '<p class="suave" style="margin:0 0 12px;line-height:1.55">Marque as empresas que entregam <b>' + T.esc(ob.nome) + '</b>. ' +
        'Fica guardado no cadastro de cada uma — vale também para as próximas ' + T.esc(M().modelo(ob.modelo) ? M().modelo(ob.modelo).nome : ob.nome) + ' dos outros anos.</p>' +
        '<div class="md-barra" style="margin-bottom:8px"><button type="button" class="botao pequeno" data-todos="1">Marcar todas</button>' +
        '<button type="button" class="botao pequeno" data-todos="0">Desmarcar todas</button>' +
        '<input class="apres-campo pequeno" id="q-busca" placeholder="procurar empresa…" style="flex:1;min-width:180px"></div>' +
        '<div class="emp-obrigacoes" id="q-lista" style="max-height:48vh;overflow:auto">' +
        empresas.map((e) => '<label class="caixa-opcao ent-escolha" data-nome="' + T.esc(U.semAcento(e.codigo + ' ' + e.nome).toUpperCase()) + '">' +
          '<input type="checkbox" data-emp="' + T.esc(e.codigo) + '"' + (M().entrega(e, ob) ? ' checked' : '') + '> ' +
          T.esc(e.codigo + ' · ' + e.nome) + ' <span class="suave pequeno">' + T.esc([e.bpo, e.celula, e.regime].filter(Boolean).join(' · ')) + '</span></label>').join('') +
        '</div>',
      aoAbrir: (j) => {
        j.querySelectorAll('[data-todos]').forEach((b) => b.addEventListener('click', () => {
          const v = b.getAttribute('data-todos') === '1';
          j.querySelectorAll('#q-lista label:not([hidden]) [data-emp]').forEach((c) => { c.checked = v; });
        }));
        const busca = j.querySelector('#q-busca');
        busca.addEventListener('input', () => {
          const q = U.semAcento(busca.value).toUpperCase().trim();
          j.querySelectorAll('#q-lista label').forEach((l) => { l.hidden = !!q && l.getAttribute('data-nome').indexOf(q) < 0; });
        });
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Salvar', tipo: 'primario', antes: (j) =>
        Array.from(j.querySelectorAll('[data-emp]')).map((c) => ({ codigo: c.getAttribute('data-emp'), marcada: c.checked })) }],
    });
    if (!salvo) return;
    const todasAsChaves = M().paraMarcar(E.obrigacoes).map((x) => x.chave);
    let mexidas = 0;
    for (const { codigo, marcada } of salvo) {
      const emp = (app().empresas || []).find((e) => String(e.codigo) === String(codigo));
      if (!emp) continue;
      const tinha = Array.isArray(emp.obrigacoes) ? emp.obrigacoes.slice() : [];
      let nova = tinha.slice();
      if (marcada && nova.indexOf(chave) < 0) nova.push(chave);
      // Desmarcar quem está com a lista vazia (= "entrega todas") vira "entrega todas, menos esta":
      // senão ela continuaria aparecendo, e ele acharia que o programa não obedeceu.
      if (!marcada) nova = (tinha.length ? tinha : todasAsChaves).filter((c) => c !== chave);
      if (JSON.stringify(nova) === JSON.stringify(tinha)) continue;
      try { await app().armazenamento.salvarEmpresa(Object.assign({}, emp, { obrigacoes: nova })); mexidas++; } catch (e) { /* segue para as outras */ }
    }
    app().empresas = await app().armazenamento.empresas();
    T.avisoRapido(mexidas ? mexidas + ' empresa(s) ajustada(s).' : 'Nada mudou.', 'ok', 4000);
    desenhar(el);
  }

  function cartoesDaObrigacao(ob, res) {
    const p = res.prazo;
    const cor = (d) => (d === null ? '' : d < 0 ? 'falta' : d <= 3 ? 'falta-ambar' : '');
    const dias = (d) => (d === null ? '' : d < 0 ? ' <span class="pequeno">(' + (-d) + ' dia(s) atrás)</span>' : d === 0 ? ' <span class="pequeno">(hoje)</span>' : ' <span class="pequeno">(em ' + d + ' dia(s))</span>');
    return '<div class="cartao corpo ent-cartoes">' +
      '<div><span class="pequeno suave">📋 Obrigação</span><br><b>' + T.esc(ob.nome) + '</b></div>' +
      '<div><span class="pequeno suave">Competência</span><br><b>' + T.esc(ob.competencia || '—') + '</b></div>' +
      '<div><span class="pequeno suave">🗓 Vencimento</span><br><b class="' + cor(p.diasVencimento) + '">' + T.esc(ob.vencimento || '—') + '</b>' + dias(p.diasVencimento) + '</div>' +
      '<div><span class="pequeno suave">🎯 Meta de entrega</span><br><b class="' + cor(p.diasMeta) + '">' + T.esc(ob.meta || '—') + '</b>' + dias(p.diasMeta) + '</div>' +
      '<div><span class="pequeno suave">Andamento</span><br><b>' + res.entregues + ' de ' + res.total + '</b> entregues' +
      (res.atrasadas ? ' · <span class="falta">' + res.atrasadas + ' atrasada(s)</span>' : '') +
      (res.validadas ? ' · ' + res.validadas + ' validada(s)' : '') + '</div>' +
      '</div>';
  }

  function barra(todas, lista, res) {
    const f = E.filtros;
    const sel = (campo, rotulo) => {
      const vals = M().valoresDe(todas, campo);
      if (!vals.length) return '';
      return '<select class="apres-campo pequeno" data-filtro="' + campo + '"><option value="">' + rotulo + ': todos</option>' +
        vals.map((v) => '<option value="' + T.esc(v) + '"' + (f[campo] === v ? ' selected' : '') + '>' + T.esc(v) + '</option>').join('') + '</select>';
    };
    return '<div class="md-barra ent-barra">' +
      '<input id="ent-busca" class="apres-campo" style="min-width:260px;flex:1" placeholder="🔎 Busca geral…" value="' + T.esc(f.busca || '') + '">' +
      sel('bpo', 'BPO') + sel('celula', 'Célula') + sel('grupo', 'Grupo') + sel('responsavel', 'Responsável') + sel('regime', 'Regime') +
      '<select class="apres-campo pequeno" data-filtro="status"><option value="">Status: todos</option>' +
      M().STATUS.map((s) => '<option value="' + s.id + '"' + (f.status === s.id ? ' selected' : '') + '>' + T.esc(s.nome) + '</option>').join('') + '</select>' +
      '<select class="apres-campo pequeno" data-filtro="validada"><option value="">Validada: tanto faz</option>' +
      '<option value="sim"' + (f.validada === 'sim' ? ' selected' : '') + '>Validada</option>' +
      '<option value="nao"' + (f.validada === 'nao' ? ' selected' : '') + '>Falta validar</option></select>' +
      '<button type="button" class="botao pequeno" data-ent="so-atrasadas"' + (f.so === 'atrasadas' ? ' style="background:var(--vermelho-fundo)"' : '') + '>⚠ Só atrasadas</button>' +
      '<button type="button" class="botao pequeno" data-ent="limpar">✕ Limpar</button>' +
      '<button type="button" class="botao pequeno" data-ent="excel">📗 Excel</button>' +
      '<button type="button" class="botao pequeno" data-ent="pdf">📄 PDF</button>' +
      '<span class="espaco"></span><span class="pequeno suave">' + lista.length + ' de ' + todas.length + ' registro(s)</span>' +
      '</div>';
  }

  const COLUNAS = [
    { id: 'bpo', titulo: 'BPO' }, { id: 'celula', titulo: 'Célula' }, { id: 'grupo', titulo: 'Grupo' },
    { id: 'nome', titulo: 'Empresa' }, { id: 'codigo', titulo: 'Código' }, { id: 'cnpj', titulo: 'CNPJ' },
    { id: 'regime', titulo: 'Regime Tributário' }, { id: 'responsavel', titulo: 'Responsável' },
    { id: '', titulo: 'Arquivos' }, { id: 'statusNome', titulo: 'Status' }, { id: 'validada', titulo: 'Validada' },
    { id: 'validadoPor', titulo: 'Validado por' }, { id: 'validadoEm', titulo: 'Data validação' },
    { id: 'observacoes', titulo: 'Observações' },
  ];
  function tabela(lista, ob) {
    const seta = (c) => (E.ordem.col === c ? ' ' + (E.ordem.desc ? '▼' : '▲') : ' <span class="seta">⇅</span>');
    const pessoas = M().valoresDe(E.linhas, 'responsavel');
    const regimes = ['Lucro Real', 'Lucro Real Trimestral', 'Lucro Presumido', 'Simples Nacional', 'MEI', 'Imune / Isenta', 'Outro'];
    return '<div class="apres-caixa ent-caixa"><table class="apres ent-obrig"><thead><tr>' +
      COLUNAS.map((c) => '<th' + (c.id ? ' class="ent-ordena" data-ordem="' + c.id + '"' : '') + '>' + T.esc(c.titulo) + (c.id ? seta(c.id) : '') + '</th>').join('') +
      '</tr></thead><tbody>' +
      (lista.map((l) => '<tr' + (l.atrasada ? ' class="ent-linha-atraso"' : '') + ' data-linha="' + T.esc(l.codigo) + '">' +
        '<td class="pequeno">' + T.esc(l.bpo || '—') + '</td>' +
        '<td class="pequeno">' + T.esc(l.celula || '—') + '</td>' +
        '<td class="pequeno">' + T.esc(l.grupo || '—') + '</td>' +
        '<td class="ent-empresa"><b>' + T.esc(l.nome) + '</b></td>' +
        '<td class="pequeno">' + T.esc(l.codigo) + '</td>' +
        '<td class="pequeno">' + T.esc(l.cnpj ? U.formatarCnpj(l.cnpj) : '—') + '</td>' +
        '<td><select class="apres-campo pequeno" data-campo="regime"' + (l.regimeDaLinha ? ' title="mudado nesta obrigação"' : '') + '>' +
        ['' ].concat(regimes.indexOf(l.regime) < 0 && l.regime ? [l.regime] : []).concat(regimes)
          .filter((x, i, a) => a.indexOf(x) === i)
          .map((x) => '<option value="' + T.esc(x) + '"' + (l.regime === x ? ' selected' : '') + '>' + T.esc(x || '—') + '</option>').join('') + '</select></td>' +
        '<td><input class="apres-campo pequeno" data-campo="responsavel" list="ent-pessoas" value="' + T.esc(l.responsavel) + '" placeholder="quem faz"></td>' +
        '<td class="ent-celula"><button type="button" class="botao pequeno" data-campo="arquivos" title="Anexos desta entrega">📎' + (l.arquivos ? ' ' + l.arquivos : '') + '</button></td>' +
        '<td><select class="apres-campo pequeno ent-status ent-' + l.statusCor + '" data-campo="status">' +
        M().STATUS.map((s) => '<option value="' + s.id + '"' + (l.status === s.id ? ' selected' : '') + '>' + T.esc(s.nome) + '</option>').join('') + '</select></td>' +
        '<td class="ent-celula"><input type="checkbox" data-campo="validada"' + (l.validada ? ' checked' : '') + ' title="Validada"></td>' +
        '<td class="pequeno">' + T.esc(l.validadoPor || '—') + '</td>' +
        '<td class="pequeno">' + T.esc(l.validadoEm ? U.dataHoraLocal(l.validadoEm) : '—') + '</td>' +
        '<td><input class="apres-campo pequeno" data-campo="observacoes" value="' + T.esc(l.observacoes) + '" placeholder="—"></td>' +
        '</tr>').join('') || '<tr><td colspan="' + COLUNAS.length + '" class="suave">Nenhuma empresa com esse filtro.</td></tr>') +
      '</tbody></table></div>' +
      '<datalist id="ent-pessoas">' + pessoas.map((p) => '<option value="' + T.esc(p) + '">').join('') + '</datalist>' +
      '<p class="apres-nota suave">Tudo o que você muda na linha grava na hora. Mudar o <b>Status</b> derruba a validação — ' +
      'o que foi conferido mudou, então alguém precisa validar de novo.</p>';
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function ligar(el) {
    const raizEl = el.querySelector('#ent-raiz');
    const sel = raizEl.querySelector('#ent-ob');
    if (sel) sel.addEventListener('change', () => app().ir('#/entregas/' + encodeURIComponent(sel.value)));
    const busca = raizEl.querySelector('#ent-busca');
    if (busca) busca.addEventListener('input', T.debounce(() => {
      E.filtros.busca = busca.value;
      desenhar(el);
      const novo = el.querySelector('#ent-busca');
      if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
    }, 300));
    raizEl.querySelectorAll('[data-filtro]').forEach((s) => s.addEventListener('change', () => {
      E.filtros[s.getAttribute('data-filtro')] = s.value;
      desenhar(el);
    }));
    raizEl.querySelectorAll('[data-ordem]').forEach((th) => th.addEventListener('click', () => {
      const c = th.getAttribute('data-ordem');
      E.ordem = { col: c, desc: E.ordem.col === c ? !E.ordem.desc : false };
      desenhar(el);
    }));
    raizEl.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-ent]');
      if (!b) return;
      const q = b.getAttribute('data-ent');
      if (q === 'nova') await janelaObrigacao(el, null);
      else if (q === 'quem') await janelaQuemEntrega(el);
      else if (q === 'limpar') { E.filtros = {}; desenhar(el); }
      else if (q === 'so-atrasadas') { E.filtros.so = E.filtros.so === 'atrasadas' ? '' : 'atrasadas'; desenhar(el); }
      else if (q === 'excel') baixarExcel();
      else if (q === 'pdf') window.print();
    });
    // Edição na própria linha
    const mexeu = async (ev) => {
      const campo = ev.target.getAttribute && ev.target.getAttribute('data-campo');
      if (!campo || campo === 'arquivos') return;
      const tr = ev.target.closest('[data-linha]');
      if (!tr || !E.ob) return;
      const codigo = tr.getAttribute('data-linha');
      const valor = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
      const dados = Object.assign({}, E.dados);
      dados[codigo] = M().mudarLinha(dados[codigo], campo, valor, app().usuario.nome);
      try {
        await gravarDados(E.ob.id, dados);
        desenhar(el);
      } catch (e) { T.avisoRapido('Não consegui guardar: ' + T.mensagemDeErro(e), 'erro', 7000); }
    };
    raizEl.querySelectorAll('select[data-campo], input[type="checkbox"][data-campo]').forEach((x) => x.addEventListener('change', mexeu));
    raizEl.querySelectorAll('input[data-campo="responsavel"], input[data-campo="observacoes"]').forEach((x) => {
      x.addEventListener('change', mexeu);
      x.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
    });
    raizEl.querySelectorAll('[data-campo="arquivos"]').forEach((x) => x.addEventListener('click', () => {
      T.janela({ titulo: 'Anexos', corpo: '<p style="line-height:1.55">Guardar o recibo e o arquivo de cada entrega é o próximo pedaço. ' +
        'Por enquanto, use a coluna <b>Observações</b> para anotar o número do recibo.</p>' });
    }));
  }

  // ------------------------------------------------------------------
  // Cadastro das obrigações
  // ------------------------------------------------------------------
  async function janelaObrigacao(el, id) {
    const lista = E.obrigacoes;
    const atual = id ? (lista.find((o) => o.id === id) || {}) : {};
    const hoje = U.hoje();
    const salvo = await T.janela({
      titulo: id ? 'Editar "' + atual.nome + '"' : 'Nova obrigação',
      larga: true,
      corpo: (id ? '' : '<p class="suave" style="margin:0 0 12px;line-height:1.55">Escolha um modelo e o programa já preenche o nome, a competência e o prazo usual — depois é só ajustar.</p>' +
        '<div class="campo"><label for="f-modelo">Modelo</label><select id="f-modelo" class="apres-campo">' +
        '<option value="">— começar em branco —</option>' +
        M().MODELOS.map((m) => '<option value="' + m.id + '">' + T.esc(m.nome) + (m.ajuda ? ' · ' + T.esc(m.ajuda) : '') + '</option>').join('') + '</select></div>' +
        '<div class="grade-form" style="margin-top:8px"><div class="campo"><label for="f-ano">Ano</label><input id="f-ano" type="number" value="' + hoje.ano + '"></div>' +
        '<div class="campo"><label for="f-mes">Mês (quando for mensal)</label><select id="f-mes">' +
        U.MESES.map((m, i) => '<option value="' + (i + 1) + '"' + (hoje.mes === i + 1 ? ' selected' : '') + '>' + T.esc(m) + '</option>').join('') + '</select></div></div><hr style="margin:14px 0;border:0;border-top:1px solid var(--borda)">') +
      '<div class="grade-form">' +
        '<div class="campo inteiro"><label for="f-nome">Nome *</label><input id="f-nome" maxlength="80" value="' + T.esc(atual.nome || '') + '" placeholder="Ex.: ECF 2026"></div>' +
        '<div class="campo"><label for="f-comp">Competência</label><input id="f-comp" maxlength="20" value="' + T.esc(atual.competencia || '') + '" placeholder="2025 ou 08/2026"></div>' +
        '<div class="campo"><label for="f-venc">Vencimento</label><input id="f-venc" maxlength="10" value="' + T.esc(atual.vencimento || '') + '" placeholder="dd/mm/aaaa"></div>' +
        '<div class="campo"><label for="f-meta">Meta de entrega</label><input id="f-meta" maxlength="10" value="' + T.esc(atual.meta || '') + '" placeholder="dd/mm/aaaa">' +
        '<span class="ajuda">A data interna do escritório, antes do prazo legal.</span></div>' +
        '<div class="campo"><label for="f-sit">Situação</label><select id="f-sit">' +
        '<option value="aberta"' + (atual.situacao !== 'encerrada' ? ' selected' : '') + '>Aberta</option>' +
        '<option value="encerrada"' + (atual.situacao === 'encerrada' ? ' selected' : '') + '>Encerrada</option></select></div>' +
        '<div class="campo inteiro"><label for="f-obs">Observação</label><input id="f-obs" maxlength="200" value="' + T.esc(atual.observacao || '') + '"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      aoAbrir: (j) => {
        const mod = j.querySelector('#f-modelo');
        if (!mod) return;
        const preencher = () => {
          if (!mod.value) return;
          const s = M().sugerir(mod.value, j.querySelector('#f-ano').value, j.querySelector('#f-mes').value);
          j.querySelector('#f-nome').value = s.nome;
          j.querySelector('#f-comp').value = s.competencia;
          j.querySelector('#f-venc').value = s.vencimento;
          j.querySelector('#f-meta').value = s.meta;
        };
        mod.addEventListener('change', preencher);
        j.querySelector('#f-ano').addEventListener('change', preencher);
        j.querySelector('#f-mes').addEventListener('change', preencher);
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: id ? 'Salvar' : 'Criar', tipo: 'primario', antes: (j) => {
        const nova = {
          id: id || '', nome: j.querySelector('#f-nome').value.trim(), competencia: j.querySelector('#f-comp').value.trim(),
          vencimento: j.querySelector('#f-venc').value.trim(), meta: j.querySelector('#f-meta').value.trim(),
          situacao: j.querySelector('#f-sit').value, observacao: j.querySelector('#f-obs').value.trim(),
          modelo: j.querySelector('#f-modelo') ? j.querySelector('#f-modelo').value : (atual.modelo || ''),
        };
        const r = M().conferirObrigacao(nova, lista, id);
        if (!r.ok) { j.querySelector('#f-erro').innerHTML = '<div class="aviso vermelho">' + T.esc(r.erro) + '</div>'; return false; }
        return r.obrigacao;
      } }],
    });
    if (!salvo) return;
    await gravarObrigacoes(lista.filter((o) => o.id !== id).concat([salvo]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    T.avisoRapido(id ? 'Obrigação salva.' : 'Obrigação "' + salvo.nome + '" criada.', 'ok', 4000);
    app().ir('#/entregas/' + encodeURIComponent(salvo.id));
  }

  async function mostrarObrigacoes(el, conferir) {
    T.carregando(el, 'Abrindo as obrigações…');
    E.el = el; E.parte = 'obrigacoes';
    E.obrigacoes = await lerObrigacoes();
    if (conferir && !conferir()) return;
    const hoje = U.hoje();
    pintar(el,
      '<div class="cabecalho"><div class="titulos"><h1>⚙ Obrigações</h1>' +
      '<p class="suave">A lista do que o escritório controla: ECD, ECF, IBGE, MIT, fechamento contábil e o que mais você criar.</p></div>' +
      '<div class="acoes"><button type="button" class="botao primario" data-ent="nova">+ Nova obrigação</button> ' +
      '<a class="botao pequeno" href="#/entregas">↩ Voltar ao controle</a></div></div>' +
      '<div class="apres-caixa"><table class="apres"><thead><tr><th>Obrigação</th><th>Competência</th><th>Vencimento</th><th>Meta</th><th>Situação</th><th class="nao-imprimir"></th></tr></thead><tbody>' +
      (E.obrigacoes.map((o) => {
        const p = M().prazo(o, hoje);
        return '<tr' + (o.situacao === 'encerrada' ? ' class="erp-inativa"' : '') + '><td><a href="#/entregas/' + encodeURIComponent(o.id) + '"><b>' + T.esc(o.nome) + '</b></a>' +
          (o.observacao ? '<br><span class="pequeno suave">' + T.esc(o.observacao) + '</span>' : '') + '</td>' +
          '<td class="pequeno">' + T.esc(o.competencia || '—') + '</td>' +
          '<td class="pequeno' + (p.venceu ? ' falta' : '') + '">' + T.esc(o.vencimento || '—') + '</td>' +
          '<td class="pequeno">' + T.esc(o.meta || '—') + '</td>' +
          '<td class="pequeno">' + (o.situacao === 'encerrada' ? 'encerrada' : 'aberta') + '</td>' +
          '<td class="nao-imprimir" style="white-space:nowrap"><button type="button" class="lapis" data-ob-editar="' + T.esc(o.id) + '" title="Editar">✎</button> ' +
          '<button type="button" class="lapis" data-ob-excluir="' + T.esc(o.id) + '" title="Excluir">🗑</button></td></tr>';
      }).join('') || '<tr><td colspan="6" class="suave">Nenhuma ainda. Clique em <b>+ Nova obrigação</b>.</td></tr>') +
      '</tbody></table></div>');
    const raizEl = el.querySelector('#ent-raiz');
    raizEl.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-ent="nova"]')) { await janelaObrigacao(el, null); return; }
      const ed = ev.target.closest('[data-ob-editar]');
      if (ed) { await janelaObrigacao(el, ed.getAttribute('data-ob-editar')); return; }
      const ex = ev.target.closest('[data-ob-excluir]');
      if (ex) {
        const id = ex.getAttribute('data-ob-excluir');
        const o = E.obrigacoes.find((x) => x.id === id) || {};
        const ok = await T.confirmar({ titulo: 'Excluir "' + (o.nome || id) + '"?',
          texto: 'A obrigação sai da lista. <b>O que já foi preenchido nela some junto.</b>', botao: '🗑 Excluir', perigo: true });
        if (!ok) return;
        await gravarObrigacoes(E.obrigacoes.filter((x) => x.id !== id));
        await mostrarObrigacoes(el);
      }
    });
  }

  // ------------------------------------------------------------------
  // Excel (a mesma lista que está na tela, com os filtros aplicados)
  // ------------------------------------------------------------------
  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' },
    sub: { cor: 'FF5F6B7A', italico: true },
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true },
    verde: { fundo: 'FFE6F4EA' }, ambar: { fundo: 'FFFDF3DA' }, vermelho: { fundo: 'FFFBE4E2' },
  };
  function baixarExcel() {
    if (!E.ob) return;
    const lista = M().ordenar(M().filtrar(E.linhas, E.filtros), E.ordem.col, E.ordem.desc);
    const cel = (v, e) => (e ? { v: v, e: e } : v);
    const linhas = [
      { celulas: [cel(E.ob.nome, 'tit')], altura: 22 },
      { celulas: [cel('Competência ' + (E.ob.competencia || '—') + ' · vencimento ' + (E.ob.vencimento || '—') + ' · meta ' + (E.ob.meta || '—'), 'sub')] },
      null,
      { celulas: ['BPO', 'Célula', 'Grupo', 'Empresa', 'Código', 'CNPJ', 'Regime', 'Responsável', 'Status', 'Validada', 'Validado por', 'Data validação', 'Observações'].map((x) => cel(x, 'cab')), altura: 26 },
    ];
    lista.forEach((l) => {
      const e = l.atrasada ? 'vermelho' : l.status === 'entregue' ? 'verde' : l.status === 'andamento' ? 'ambar' : null;
      linhas.push({ celulas: [l.bpo, l.celula, l.grupo, l.nome, l.codigo, l.cnpj ? U.formatarCnpj(l.cnpj) : '', l.regime, l.responsavel,
        cel(l.statusNome + (l.atrasada ? ' (atrasada)' : ''), e), l.validada ? 'sim' : 'não', l.validadoPor,
        l.validadoEm ? U.dataHoraLocal(l.validadoEm) : '', l.observacoes] });
    });
    const bytes = raiz.ExcelBonito.gerar({ planilhas: [{ nome: 'Controle', colunas: [12, 12, 18, 42, 10, 20, 20, 16, 16, 10, 24, 18, 40], linhas,
      repetir: ['4', '4'], rodape: E.ob.nome + ' · ' + U.hoje().texto }] , estilos: ESTILOS });
    T.baixar(bytes, U.nomeSeguro(E.ob.nome, 80) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  raiz.TelaEntregas = { mostrar, _teste: { estado: () => E } };
})(self);
