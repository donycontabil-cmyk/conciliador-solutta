/*
 * Conciliador Solutta — tela-livre.js
 * CONCILIAÇÕES LIVRES (Dony, 22/09/2026: "eu quero poder entrar ali dentro desse menu e criar uma nova
 * conciliação: colocar a conta contábil, perguntar com qual eu quero conciliar... por exemplo, impostos a
 * recuperar com o livro fiscal, ou impostos a pagar com o livro fiscal"). A conciliação que ELE cria, sem
 * depender de eu escrever um passo novo: escolhe a conta da Parte A, com quem ela cruza na Parte B (outra
 * conta do plano) e a regra do cruzamento. A definição fica guardada na empresa e vale TODO MÊS.
 *
 * As duas contas saem do LIVRO DIÁRIO do ano (o mesmo dos passos): não precisa subir razão nenhum. Se o
 * diário não cobrir o mês, a tela diz o que falta.
 *
 * O cruzamento (na hora de criar):
 *   contrapartida — uma diminui quando a outra aumenta (o débito de uma casa com o crédito da outra);
 *   mesmo-valor   — as duas mostram o mesmo valor do mesmo lado (dois relatórios da mesma coisa).
 *
 * Daí para a frente é a mesma máquina do ③: itens A e B com ID, os cinco botões (⚡ documento, 👤 fornecedor
 * e valor, 👥 fornecedor próximo, ≈ só pelo valor, ± com margem), conciliar à mão, desfazer e a lista com ID.
 * Conferência: em aberto na A − em aberto na B = a diferença da conciliação, sempre.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function M() { return raiz.MotorTerceiro; }
  function MD() { return raiz.MotorDiario; }
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });

  const FOLGA_DIAS = 5;   // a folga do 📆 (ele pediu: primeiro no mesmo dia, depois com alguns dias)
  let E = null; // estado da tela aberta

  // ------------------------------------------------------------------
  // As definições, guardadas na empresa (valem todo mês)
  // ------------------------------------------------------------------
  function definicoes(emp) { return emp && Array.isArray(emp.conciliacoesLivres) ? emp.conciliacoesLivres : []; }
  function definicaoDe(emp, id) { return definicoes(emp).find((d) => String(d.id) === String(id)) || null; }
  function proximoId(emp) {
    let n = 1;
    definicoes(emp).forEach((d) => { const x = Number(String(d.id).replace(/[^0-9]/g, '')); if (x >= n) n = x + 1; });
    return 'L' + n;
  }
  function nomeDaDefinicao(d) {
    if (d.nome) return d.nome;
    if (d.origem === 'arquivo') return d.ladoUnico ? 'Razão que eu subo (um lado só)' : 'Dois razões que eu subo';
    return ((d.contaA && d.contaA.titulo) || (d.contaA && d.contaA.codigo) || 'Parte A') + ' × ' + ((d.contaB && d.contaB.titulo) || (d.contaB && d.contaB.codigo) || 'relatório');
  }
  function idDoRegistro(codigo, idLivre, comp) { return 'L-' + codigo + '-' + idLivre + '-' + U.anoMes(comp); }

  // ------------------------------------------------------------------
  // O diário do ano e o plano de contas (de onde saem as contas para escolher)
  // ------------------------------------------------------------------
  async function carregarDiario(codigo, ano, conferir) {
    const arm = app().armazenamento;
    const metas = await arm.arquivos(codigo);
    if (conferir && !conferir()) return null;
    const diarios = metas.filter((m) => m.tipo === 'diario' && m.periodo).sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    const meta = (ano ? diarios.find((m) => String(m.competencia).slice(0, 4) === String(ano)) : null) || diarios[0] || null;
    if (!meta) return { meta: null, diario: null, balancetes: [], plano: new Map(), metas };
    const conteudo = await arm.conteudoDoArquivo(meta.id);
    if (conferir && !conferir()) return null;
    const anoDoDiario = String(meta.competencia).slice(0, 4);
    const metasBal = metas.filter((m) => m.tipo === 'balancete' && String(m.competencia).slice(0, 4) === anoDoDiario)
      .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
    const balancetes = [];
    const planoDaEmp = await raiz.TelaSubir.planoDaEmpresa(metas);   // nome da conta pelo plano, quando tem
    for (const b of metasBal) {
      const c = await arm.conteudoDoArquivo(b.id);
      if (conferir && !conferir()) return null;
      balancetes.push({ competencia: b.competencia, contas: raiz.TelaSubir.comNomesDoPlano((c.balancete && c.balancete.contas) || c.contas || [], planoDaEmp) });
    }
    return { meta, diario: conteudo.diario || conteudo, balancetes, plano: MD().planoDosBalancetes(balancetes), metas };
  }

  // As contas que dá para escolher: as analíticas do plano dos balancetes, com o saldo do diário.
  function contasParaEscolher(plano) {
    const lista = [];
    plano.forEach((c) => { if (c.analitica) lista.push(c); });
    return lista.sort((a, b) => String(a.conta).localeCompare(String(b.conta)));
  }

  // ------------------------------------------------------------------
  // A LISTA das conciliações livres da empresa (#/empresa/<codigo>/livres)
  // ------------------------------------------------------------------
  async function mostrarLista(el, codigo, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Abrindo as conciliações livres…');
    const dados = await carregarDiario(codigo, null, conferir);
    if (!dados) return;
    const lista = definicoes(emp);
    const cartao = (d) => {
      const ultima = d.ultimaCompetencia || (dados.meta ? String(dados.meta.competencia).slice(0, 7) : U.anoMes(U.hoje().texto));
      return '<a class="cartao familia" href="#/empresa/' + encodeURIComponent(codigo) + '/livre/' + encodeURIComponent(d.id) + '/' + ultima + '">' +
        '<div class="icone">🧩</div><h2>' + T.esc(nomeDaDefinicao(d)) + '</h2>' +
        '<p class="suave" style="line-height:1.5">' + T.esc(textoDaDefinicao(d)) + '</p>' +
        '<div class="rodape"><span class="suave pequeno">criada por ' + T.esc(d.criadoPor || '') + (d.criadoEm ? ' em ' + U.dataHoraLocal(d.criadoEm) : '') + '</span>' +
        '<span class="botao primario pequeno">Abrir →</span></div></a>';
    };
    el.innerHTML = '<a class="voltar" href="#/empresa/' + encodeURIComponent(codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Minhas conciliações</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · as conciliações que você mesmo cria, de qualquer conta</p></div>' +
      '<button type="button" class="botao primario" data-acao="nova">➕ Nova conciliação</button></div>' +
      (dados.meta ? '' : '<div class="aviso ambar" style="margin-bottom:12px"><span class="icone-aviso">📒</span><div><b>Suba o livro diário do ano</b> em <a href="#/empresa/' + encodeURIComponent(codigo) + '/diario">📒 Livro diário</a>: ' +
        'as contas da conciliação livre saem dele (com o balancete do primeiro mês para o saldo inicial).</div></div>') +
      (lista.length ? '<div class="grade-3">' + lista.map(cartao).join('') + '</div>'
        : '<div class="aviso info"><span class="icone-aviso">🧩</span><div><b>Nenhuma conciliação criada ainda.</b> Clique em <b>➕ Nova conciliação</b>: ' +
          'escolha a conta que você quer conciliar, com qual conta ela cruza e a regra do cruzamento. Ela passa a valer todo mês.</div></div>') +
      (lista.length ? '<div class="cartao corpo" style="margin-top:14px"><h3 style="margin:0 0 8px">Guardadas nesta empresa</h3>' +
        '<table class="tabela"><thead><tr><th>Conciliação</th><th>Parte A</th><th>Parte B</th><th>Cruzamento</th><th></th></tr></thead><tbody>' +
        lista.map((d) => '<tr><td><b>' + T.esc(nomeDaDefinicao(d)) + '</b></td>' +
          '<td>' + T.esc(d.origem === 'arquivo' ? 'do arquivo que eu subo' : textoDaConta(d.contaA)) + '</td>' +
          '<td>' + T.esc(d.origem === 'arquivo' ? (d.ladoUnico ? '— (um lado só)' : 'do arquivo que eu subo') : (d.contaB ? textoDaConta(d.contaB) : 'relatório (a combinar)')) + '</td>' +
          '<td>' + T.esc(d.regra === 'mesmo-valor' ? 'mesmo valor dos dois lados' : 'contrapartida (uma baixa a outra)') + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno" data-editar="' + T.esc(d.id) + '">Editar</button> ' +
          '<button type="button" class="botao pequeno perigo" data-apagar="' + T.esc(d.id) + '">Apagar</button></td></tr>').join('') +
        '</tbody></table></div>' : '');
    el.addEventListener('click', async (ev) => {
      const nova = ev.target.closest('[data-acao="nova"]');
      if (nova) { await formulario(codigo, null, dados); return; }
      const editar = ev.target.closest('[data-editar]');
      if (editar) { await formulario(codigo, editar.getAttribute('data-editar'), dados); return; }
      const apagar = ev.target.closest('[data-apagar]');
      if (apagar) { await apagarDefinicao(codigo, apagar.getAttribute('data-apagar')); return; }
    });
  }

  function textoDaConta(c) { return c ? (c.codigo + (c.titulo ? ' · ' + c.titulo : '')) : ''; }
  function textoDaDefinicao(d) {
    if (d.origem === 'arquivo') return (d.ladoUnico ? 'um razão que eu subo (um lado só)' : 'dois razões que eu subo') + ' · ' +
      (d.regra === 'mesmo-valor' ? 'mesmo valor dos dois lados' : 'contrapartida');
    return textoDaConta(d.contaA) + ' × ' + (d.contaB ? textoDaConta(d.contaB) : 'um relatório') + ' · ' +
      (d.regra === 'mesmo-valor' ? 'mesmo valor dos dois lados' : 'contrapartida');
  }

  // ------------------------------------------------------------------
  // Criar / editar uma conciliação livre
  // ------------------------------------------------------------------
  async function formulario(codigo, id, dados) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    const d = id ? definicaoDe(emp, id) : null;
    const contas = contasParaEscolher(dados.plano);
    // SEM livro diário ainda dá para criar a conciliação: a de ARQUIVO não depende dele (Dony, 09/10/2026:
    // "quero poder subir arquivos diversos para conciliar").
    if (!contas.length && d && d.origem !== 'arquivo') {
      T.avisoRapido('Sem o livro diário e o balancete do ano, não dá para listar as contas. Suba-os em 📒 Livro diário.', 'ambar', 9000);
      return;
    }
    const opcoes = (escolhida) => contas.map((c) => '<option value="' + T.esc(c.reduzido) + '"' + (String(escolhida || '') === String(c.reduzido) ? ' selected' : '') + '>' +
      T.esc(c.reduzido + ' · ' + c.conta + ' · ' + c.titulo) + '</option>').join('');
    const r = await T.janela({
      titulo: d ? 'Editar a conciliação' : 'Nova conciliação',
      corpo: '<div class="campo"><label for="lv-nome">Nome (como ela vai aparecer)</label>' +
        '<input id="lv-nome" maxlength="80" autofocus placeholder="Ex.: Repasses a receber × repasses a pagar" value="' + T.esc(d ? d.nome || '' : '') + '"></div>' +
        // DE ONDE VÊM OS LANÇAMENTOS (Dony, 09/10/2026: "quero poder subir arquivos diversos para conciliar,
        // e pode ser lado A com lado B, e somente lado A").
        '<div class="campo" style="margin-top:10px"><label for="lv-origem">De onde vêm os lançamentos</label>' +
        '<select id="lv-origem">' +
        '<option value="diario"' + (!d || d.origem !== 'arquivo' ? ' selected' : '') + '>Do livro diário do ano — escolho duas contas do plano</option>' +
        '<option value="arquivo"' + (d && d.origem === 'arquivo' ? ' selected' : '') + '>De arquivos que eu subo — um razão de cada lado</option>' +
        '</select></div>' +
        '<div id="lv-contas"' + (d && d.origem === 'arquivo' ? ' hidden' : '') + '>' +
        '<div class="campo" style="margin-top:10px"><label for="lv-a">Parte A · a conta que você quer conciliar</label>' +
        '<select id="lv-a">' + opcoes(d && d.contaA ? d.contaA.codigo : '') + '</select></div>' +
        '<div class="campo" style="margin-top:10px"><label for="lv-b">Parte B · com qual conta ela cruza</label>' +
        '<select id="lv-b">' + opcoes(d && d.contaB ? d.contaB.codigo : '') + '</select></div></div>' +
        '<div id="lv-arquivo"' + (!d || d.origem !== 'arquivo' ? ' hidden' : '') + '>' +
        '<label class="caixa-opcao" style="margin-top:12px"><input type="checkbox" id="lv-unico"' + (d && d.ladoUnico ? ' checked' : '') + '> ' +
        '<b>Só a Parte A</b> — achar o que se anula dentro do próprio razão</label>' +
        '<p class="suave pequeno" style="margin:8px 0 0;line-height:1.5">Você sobe o razão de cada lado na própria conciliação, e as contas saem do arquivo. ' +
        'Serve para relatório que não está no livro diário — dois razões de sistemas diferentes, por exemplo.</p></div>' +
        '<div class="campo" style="margin-top:10px"><label for="lv-regra">Como as duas se cruzam</label>' +
        '<select id="lv-regra">' +
        '<option value="contrapartida"' + (!d || d.regra !== 'mesmo-valor' ? ' selected' : '') + '>Contrapartida — o débito de uma casa com o crédito da outra</option>' +
        '<option value="mesmo-valor"' + (d && d.regra === 'mesmo-valor' ? ' selected' : '') + '>Mesmo valor — as duas mostram o mesmo valor, do mesmo lado</option>' +
        '</select></div>' +
        '<p class="suave pequeno" style="margin:10px 0 0;line-height:1.5">A conciliação vale <b>todo mês</b>: ao abrir, você escolhe a competência. ' +
        'Nos botões dela estão as regras — inclusive <b>⚡ data e valor</b>, que é a que casa dois razões sem documento em comum.</p>',
      aoAbrir: (j) => {
        const origem = j.querySelector('#lv-origem');
        const troca = () => {
          const arq = origem.value === 'arquivo';
          j.querySelector('#lv-contas').hidden = arq;
          j.querySelector('#lv-arquivo').hidden = !arq;
        };
        origem.addEventListener('change', troca);
        troca();
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: d ? 'Guardar' : 'Criar a conciliação', tipo: 'primario', antes: (j) => {
        const val = (x) => { const e = j.querySelector('#' + x); return e ? e.value : ''; };
        const origem = val('lv-origem') === 'arquivo' ? 'arquivo' : 'diario';
        const ladoUnico = origem === 'arquivo' && !!j.querySelector('#lv-unico').checked;
        if (origem === 'arquivo') return { nome: val('lv-nome'), origem, ladoUnico, regra: val('lv-regra') };
        const acha = (r2) => contas.find((c) => String(c.reduzido) === String(r2));
        const a = acha(val('lv-a')), b = acha(val('lv-b'));
        if (!a || !b) { T.avisoRapido('Escolha as duas contas.', 'ambar'); return false; }
        if (String(a.reduzido) === String(b.reduzido)) { T.avisoRapido('As duas partes não podem ser a mesma conta — para a conta com ela mesma, use o Passo ④.', 'ambar', 8000); return false; }
        return { nome: val('lv-nome'), origem, ladoUnico: false, a, b, regra: val('lv-regra') };
      } }],
    });
    if (!r) return;
    const conta = (c) => ({ codigo: String(c.reduzido), classificacao: c.conta || '', titulo: c.titulo || '' });
    const nova = {
      id: d ? d.id : proximoId(emp),
      nome: String(r.nome || '').trim(),
      origem: r.origem,
      ladoUnico: !!r.ladoUnico,
      contaA: r.a ? conta(r.a) : (d && d.origem === 'arquivo' ? d.contaA : null),
      contaB: r.b ? conta(r.b) : (d && d.origem === 'arquivo' ? d.contaB : null),
      regra: r.regra === 'mesmo-valor' ? 'mesmo-valor' : 'contrapartida',
      criadoEm: d ? d.criadoEm : U.agoraISO(), criadoPor: d ? d.criadoPor : app().usuario.nome,
    };

    const lista = definicoes(emp).filter((x) => String(x.id) !== String(nova.id)).concat([nova]);
    await app().armazenamento.salvarEmpresa(Object.assign({}, emp, { conciliacoesLivres: lista }));
    await app().armazenamento.registrarNoLog({ codigo, acao: d ? 'livre-editada' : 'livre-criada', alvo: nova.id, detalhe: nomeDaDefinicao(nova) });
    app().empresas = await app().armazenamento.empresas();
    T.avisoRapido((d ? 'Conciliação guardada' : 'Conciliação criada') + ': ' + nomeDaDefinicao(nova) + '.', 'ok');
    app().mostrarRota();
  }

  async function apagarDefinicao(codigo, id) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    const d = definicaoDe(emp, id);
    if (!d) return;
    const ok = await T.confirmar({ titulo: 'Apagar a conciliação?', perigo: true, botao: 'Apagar',
      texto: 'A conciliação <b>' + T.esc(nomeDaDefinicao(d)) + '</b> sai da lista. <b>O que você já conciliou nos meses continua guardado</b> e volta se você criar de novo com as mesmas contas.' });
    if (!ok) return;
    await app().armazenamento.salvarEmpresa(Object.assign({}, emp, { conciliacoesLivres: definicoes(emp).filter((x) => String(x.id) !== String(id)) }));
    await app().armazenamento.registrarNoLog({ codigo, acao: 'livre-apagada', alvo: id, detalhe: nomeDaDefinicao(d) });
    app().empresas = await app().armazenamento.empresas();
    T.avisoRapido('Conciliação apagada.', 'ok');
    app().mostrarRota();
  }

  // ------------------------------------------------------------------
  // A CONCILIAÇÃO (#/empresa/<codigo>/livre/<id>/<AAAA-MM>)
  // ------------------------------------------------------------------
  // CONCILIAÇÃO DE ARQUIVO: os dois lados saem de razões que ele sobe aqui mesmo, em vez de saírem do livro
  // diário (Dony, 09/10/2026: "quero poder subir arquivos diversos para conciliar, e pode ser lado A com
  // lado B, e somente lado A"). Cada lado tem o seu lugar de arquivo, com versões, como nos passos.
  // ------------------------------------------------------------------
  function lugaresDoArquivo(d, comp, metas) {
    // O papel fica em m.conta.papel (é assim que a TelaSubir guarda o lugar de onde o arquivo veio).
    const doLugar = (idLugar) => (metas || []).filter((m) => m.tipo === 'razao' && m.conta && m.conta.papel === 'livre-' + d.id + '-' + idLugar);
    const lugares = [{ id: 'ladoA', parte: 'Parte A', titulo: 'Razão da Parte A', sub: U.nomeCompetencia(comp),
      nome: 'Razão da Parte A', log: 'livre/' + d.id + '/A', tipo: 'razao', papel: 'livre-' + d.id + '-ladoA',
      competencia: comp, arquivos: doLugar('ladoA') }];
    if (!d.ladoUnico) {
      lugares.push({ id: 'ladoB', parte: 'Parte B', titulo: 'Razão da Parte B', sub: U.nomeCompetencia(comp),
        nome: 'Razão da Parte B', log: 'livre/' + d.id + '/B', tipo: 'razao', papel: 'livre-' + d.id + '-ladoB',
        competencia: comp, arquivos: doLugar('ladoB') });
    }
    return lugares;
  }
  // Lê os razões subidos. Devolve { A, B, lugares, metas } — A e B são a conta do razão (com lancamentos).
  async function razoesDoArquivo(codigo, d, comp, conferir) {
    const arm = app().armazenamento;
    let metas = [];
    try { metas = await arm.arquivos(codigo); } catch (e) { metas = []; }
    if (conferir && !conferir()) return null;
    const lugares = lugaresDoArquivo(d, comp, metas);
    const contaDoLugar = async (idLugar) => {
      const lista = (metas || []).filter((m) => m.tipo === 'razao' && m.conta && m.conta.papel === 'livre-' + d.id + '-' + idLugar)
        .sort((x, y) => U.paraMs(y.enviadoEm) - U.paraMs(x.enviadoEm));
      if (!lista.length) return null;
      const meta = lista[0];
      const conteudo = await arm.conteudoDoArquivo(meta.id);
      if (!conteudo) return null;
      // O arquivo guardado traz UMA conta (é assim que a TelaSubir grava o razão de um lugar); o razão
      // lido na hora traz a lista. Os dois servem.
      const r = conteudo.razao || (conteudo.tipo === 'razao' ? conteudo : null);
      const contas = (r && r.contas) || (r && r.conta ? [r.conta] : []);
      if (!contas.length) return null;
      // O razão de uma conta só (o caso do pedido): a primeira conta é a conta do relatório. Vindo mais de
      // uma, o programa junta os lançamentos de todas — é o que o relatório mostra.
      if (contas.length === 1) return Object.assign({}, contas[0], { arquivo: meta.nome || '' });
      const juntos = [];
      contas.forEach((c) => (c.lancamentos || []).forEach((l) => juntos.push(l)));
      return { codigo: contas.map((c) => c.codigo).join(', ').slice(0, 40), nome: contas.length + ' contas do arquivo',
        classificacao: '', lancamentos: juntos, arquivo: meta.arquivo || '' };
    };
    const A = await contaDoLugar('ladoA');
    if (conferir && !conferir()) return null;
    const B = d.ladoUnico ? null : await contaDoLugar('ladoB');
    if (conferir && !conferir()) return null;
    return { A, B, lugares, metas };
  }
  function painelDeArquivos(codigo, d, comp, arqs) {
    return '<div id="lv-arquivos">' + raiz.TelaSubir.painel({
      chave: 'livre-' + codigo + '-' + d.id + '-' + U.anoMes(comp),
      titulo: 'Arquivos desta conciliação', resumo: U.nomeCompetencia(comp), aberto: !arqs.A, fixo: false,
      lugares: arqs.lugares, metas: arqs.metas,
    }) + '</div>';
  }

  // ------------------------------------------------------------------
  async function mostrar(el, codigo, id, anoMes, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    const d = definicaoDe(emp, id);
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/livres';
    if (!d) { el.innerHTML = '<div class="aviso ambar">Esta conciliação não existe mais. <a href="' + voltar + '">Voltar</a></div>'; return; }
    const comp = anoMes + '-01';
    T.carregando(el, 'Abrindo ' + nomeDaDefinicao(d) + ' de ' + U.nomeCompetencia(comp) + '…');
    // A conciliação DE ARQUIVO não depende do livro diário: os dois lados saem dos razões que ele sobe aqui
    // (Dony, 09/10/2026, os repasses entre lojas do Grupo Semar).
    const porArquivo = d.origem === 'arquivo';
    const dados = porArquivo ? { diario: null, balancetes: [], metas: [], plano: null } : await carregarDiario(codigo, anoMes.slice(0, 4), conferir);
    if (!dados) return;
    const cabecalho = '<a class="voltar" href="' + voltar + '">← Minhas conciliações</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>' + T.esc(nomeDaDefinicao(d)) + '</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + U.nomeCompetencia(comp) + ' · ' + T.esc(textoDaDefinicao(d)) + '</p></div>' +
      '<div class="linha-flex"><span class="guardado" id="lv-guardado">—</span>' +
      '<button type="button" class="botao" data-acao="excel" title="As duas partes e as conciliações em Excel">⬇ Excel</button></div></div>';
    if (!porArquivo && !dados.diario) {
      el.innerHTML = cabecalho + '<div class="aviso ambar"><span class="icone-aviso">📒</span><div><b>Sem livro diário de ' + T.esc(anoMes.slice(0, 4)) + '.</b> ' +
        'Suba o diário do ano em <a href="#/empresa/' + encodeURIComponent(codigo) + '/diario">📒 Livro diário</a> — as duas contas saem dele.</div></div>';
      return;
    }
    let rA = null, rB = null, arquivosDaConc = null;
    if (porArquivo) {
      arquivosDaConc = await razoesDoArquivo(codigo, d, comp, conferir);
      if (!arquivosDaConc) return;
      if (!arquivosDaConc.A) {
        el.innerHTML = cabecalho + painelDeArquivos(codigo, d, comp, arquivosDaConc) +
          '<div class="aviso ambar"><span class="icone-aviso">📄</span><div><b>Suba o razão da Parte A</b> aí em cima' +
          (d.ladoUnico ? '.' : ' e o da Parte B.') + ' As contas saem do próprio arquivo.</div></div>';
        raiz.TelaSubir.ligar(el.querySelector('#lv-arquivos .arquivos-passo'), codigo, arquivosDaConc.lugares);
        raiz.TelaSubir.ligarBotao(el.querySelector('[data-abrir-arquivos]'));
        return;
      }
      rA = { conta: arquivosDaConc.A };
      rB = arquivosDaConc.B ? { conta: arquivosDaConc.B } : { conta: { codigo: '', nome: '', lancamentos: [] } };
    } else {
      const razao = (conta) => MD().razaoDaConta(dados.diario, dados.balancetes, conta.codigo, { ate: comp });
      rA = razao(d.contaA);
      rB = razao(d.contaB);
    }
    if (conferir && !conferir()) return;
    // Com origem ARQUIVO a conta sai do razão lido: daí para a frente a tela é a mesma de sempre.
    if (porArquivo) {
      d.contaA = { codigo: rA.conta.codigo || 'A', classificacao: rA.conta.classificacao || '', titulo: rA.conta.nome || 'Parte A' };
      d.contaB = { codigo: (rB.conta && rB.conta.codigo) || (d.ladoUnico ? '—' : 'B'), classificacao: '', titulo: (rB.conta && rB.conta.nome) || (d.ladoUnico ? 'um lado só' : 'Parte B') };
    }
    // A Parte A entra pelo lado do saldo dela (ativo cresce no débito; passivo e resultado credor, no crédito).
    const sinalA = ladoDaConta(d.contaA, rA);
    const entrada = {
      A: { conta: rA.conta, lancamentos: rA.conta.lancamentos, sinal: sinalA },
      B: { conta: rB.conta, lancamentos: rB.conta.lancamentos, sinal: d.regra === 'mesmo-valor' ? sinalA : (sinalA === 'D' ? 'C' : 'D'), regra: d.regra },
      decisoes: {},
    };
    const arm = app().armazenamento;
    const registro = (await arm.conciliacoes(codigo, comp)).find((x) => x.id === idDoRegistro(codigo, d.id, comp)) ||
      { id: idDoRegistro(codigo, d.id, comp), codigo, tipo: 'livre', competencia: comp, arquivos: [], decisoes: {} };
    if (conferir && !conferir()) return;
    const decisoes = Object.assign({ conciliacoesAB: [], donos: {}, historico: [] }, registro.decisoes);
    decisoes.conciliacoesAB = decisoes.conciliacoesAB || [];
    entrada.decisoes = decisoes;
    const itens = M().itensLivres(entrada);
    E = { codigo, comp, emp, d, voltar, cabecalho, dados, rA, rB, entrada, itens, decisoes, registro, el: null,
      selA: new Set(), selB: new Set(), abertos: new Set(), filtros: { busca: '', mostrar: '' }, fila: Promise.resolve(),
      arquivos: arquivosDaConc };
    const arrumado = M().arrumarGruposAB(decisoes.conciliacoesAB, itens.legado);
    decisoes.conciliacoesAB = arrumado.grupos;
    el.innerHTML = '<div class="tela-livre"></div>';
    E.el = el.firstChild;
    ligarUmaVez();
    desenhar();
  }

  // O lado em que a conta cresce: 1 (ativo) e 3/4 (despesa) no débito; 2 (passivo) e 3 receita no crédito.
  // Com o saldo do balancete a gente confirma: saldo devedor cresce no débito.
  function ladoDaConta(conta, razao) {
    const saldo = razao && razao.conta ? razao.conta.saldoFinal : 0;
    if (saldo > 0) return 'D';
    if (saldo < 0) return 'C';
    const classe = String(conta.classificacao || conta.codigo || '').trim().charAt(0);
    return classe === '2' || classe === '3' ? 'C' : 'D';
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenhar() {
    E.el.innerHTML = E.cabecalho +
      (E.arquivos ? painelDeArquivos(E.codigo, E.d, E.comp, E.arquivos) : '') +
      '<div id="lv-avisos"></div>' +
      '<div class="grade-4" id="lv-cartoes" style="margin-top:14px"></div>' +
      '<div id="lv-acoes"></div>' +
      '<div class="filtros" id="lv-filtros"></div>' +
      '<div class="grade-2" id="lv-partes"></div>' +
      '<div id="lv-lista"></div>' +
      '<div id="lv-barra"></div>';
    if (E.arquivos) {
      raiz.TelaSubir.ligar(E.el.querySelector('#lv-arquivos .arquivos-passo'), E.codigo, E.arquivos.lugares);
      raiz.TelaSubir.ligarBotao(E.el.querySelector('#lv-arquivos [data-abrir-arquivos]'));
    }
    desenharAvisos();
    desenharCartoes();
    desenharAcoes();
    desenharFiltros();
    desenharPartes();
    desenharLista();
    atualizarBarra();
    const g = E.el.querySelector('#lv-guardado');
    if (g) g.textContent = E.registro.atualizadoEm ? 'guardado às ' + U.horaLocal(E.registro.atualizadoEm) : 'nenhuma decisão ainda';
  }

  function desenharCartoes() {
    const ab = M().emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    const dif = ab.valorA - ab.valorB;
    const n = (q) => Number(q || 0).toLocaleString('pt-BR');
    E.el.querySelector('#lv-cartoes').innerHTML =
      cartao('Parte A · ' + T.esc(E.d.contaA.codigo), T.moeda(ab.valorA), n(ab.abertosA.length) + ' item(ns) em aberto', T.esc(E.d.contaA.titulo || '')) +
      cartao('Parte B · ' + T.esc(E.d.contaB.codigo), T.moeda(ab.valorB), n(ab.abertosB.length) + ' item(ns) em aberto', T.esc(E.d.contaB.titulo || '')) +
      cartao('Diferença a investigar', T.moeda(dif), 'em aberto na A − em aberto na B', dif === 0 ? 'as duas partes fecham' : 'confira o que sobrou dos dois lados') +
      cartao('Conciliações', n(E.decisoes.conciliacoesAB.length), n(E.itens.A.length) + ' item(ns) na A · ' + n(E.itens.B.length) + ' na B', 'cada uma com o seu ID');
  }

  function cartao(rotulo, grande, detalhe, extra) {
    return '<div class="cartao resumo"><div class="rotulo">' + rotulo + '</div><div class="grande">' + grande + '</div>' +
      '<div class="detalhe"><span>' + detalhe + '</span>' + (extra ? '<span class="suave">' + extra + '</span>' : '') + '</div></div>';
  }

  function desenharAvisos() {
    const partes = [];
    const avisos = (E.rA.conta.avisos || []).concat(E.rB.conta.avisos || []);
    const conferido = E.rA.conta.confere !== false && E.rB.conta.confere !== false;
    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    const ab = M().emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    const fecha = soma(E.itens.A) - soma(E.itens.B) === (ab.valorA - ab.valorB) + somaDasConciliacoes();
    partes.push(conferido && fecha
      ? '<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Conferido no centavo.</b> ' +
        (E.d.origem === 'arquivo' ? 'Os lançamentos são os dos arquivos que você subiu; ' : 'As duas contas saem do livro diário e batem com o balancete; ') +
        'o que está em aberto na Parte A menos o que está em aberto na Parte B, mais o que as conciliações levaram, é o movimento das duas contas.</div></div>'
      : '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div><b>Confira antes de usar.</b><ul class="pequeno">' +
        (fecha ? '' : '<li>As somas das partes não fecham com as conciliações.</li>') +
        avisos.map((a) => '<li>' + T.esc(a) + '</li>').join('') + '</ul></div></div>');
    if (E.d.origem === 'arquivo') {
      const umLado = E.d.ladoUnico;
      partes.push('<div class="aviso info"><span class="icone-aviso">📄</span><div>Dos arquivos que você subiu: ' +
        '<b>' + T.esc(E.d.contaA.codigo) + '</b> ' + T.esc(E.rA.conta.nome) + ' (' + E.rA.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.' +
        (E.rA.conta.arquivo ? ', ' + T.esc(E.rA.conta.arquivo) : '') + ')' +
        (umLado ? ' — conciliação de <b>um lado só</b>: o que se anula dentro do próprio razão.'
          : ' e <b>' + T.esc(E.d.contaB.codigo) + '</b> ' + T.esc(E.rB.conta.nome) + ' (' + E.rB.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.' +
            (E.rB.conta.arquivo ? ', ' + T.esc(E.rB.conta.arquivo) : '') + ').') +
        ' Para casar dois razões sem documento em comum, use o <b>📅 Data e valor</b>.</div></div>');
    } else {
      partes.push('<div class="aviso info"><span class="icone-aviso">📒</span><div>Do livro diário de ' + T.esc(String(E.dados.meta.competencia).slice(0, 4)) + ': ' +
        '<b>' + T.esc(E.d.contaA.codigo) + '</b> ' + T.esc(E.rA.conta.nome) + ' (' + E.rA.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.) e ' +
        '<b>' + T.esc(E.d.contaB.codigo) + '</b> ' + T.esc(E.rB.conta.nome) + ' (' + E.rB.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.), de ' +
        T.esc(E.rA.periodo.de) + ' a ' + T.esc(E.rA.periodo.ate) + '.</div></div>');
    }
    E.el.querySelector('#lv-avisos').innerHTML = partes.join('');
  }

  function somaDasConciliacoes() {
    return E.decisoes.conciliacoesAB.reduce((s, g) => s + (g.a || []).reduce((t, id) => t + ((E.itens.porId.get(id) || {}).valor || 0), 0)
      - (g.b || []).reduce((t, id) => t + ((E.itens.porId.get(id) || {}).valor || 0), 0), 0);
  }

  // Os cinco botões, iguais aos dos passos.
  function desenharAcoes() {
    const grupos = E.decisoes.conciliacoesAB;
    const n = (q) => Number(q || 0).toLocaleString('pt-BR');
    const acao = (id, classe, icone, titulo, sub, dica) => '<button type="button" class="acao ' + classe + '" data-acao="' + id + '" title="' + T.esc(dica) + '">' +
      '<span class="acao-icone" aria-hidden="true">' + icone + '</span><span class="acao-texto"><b>' + T.esc(titulo) + '</b><small>' + T.esc(sub) + '</small></span></button>';
    const lote = (id, cor, rotulo, qtd) => qtd ? '<button type="button" class="chip-desfazer" data-acao="' + id + '"><span class="cor ' + cor + '"></span>' + rotulo + ' <span class="qtd">' + n(qtd) + '</span></button>' : '';
    const doc = grupos.filter((g) => g.regra !== 'manual' && !M().ehPorValor(g) && !M().ehComMargem(g) && !M().ehPorFornecedor(g) && !M().ehPorProximo(g) && !M().ehPorDataEValor(g)).length;
    E.el.querySelector('#lv-acoes').innerHTML = '<div class="acoes-ab">' +
      '<div class="rotulo-regras pequeno">Conciliar automaticamente · escolha a regra (o que ela achar ganha ID e entra na lista)</div>' +
      '<div class="acoes-conciliar sete">' +
      acao('conciliar-tudo', 'documento', '⚡', 'Documento e nome', 'o mesmo documento nos dois lados', 'Acha tudo o que casa pelo documento (a nota, o número do lançamento), primeiro com o mesmo nome e depois só pelo documento.') +
      acao('conciliar-fornecedor', 'fornecedor', '👤', 'Nome e valor', 'sem olhar o documento', 'Depois do ⚡, casa o que sobrou pelo MESMO nome e mesmo valor, sem olhar o documento.') +
      acao('conciliar-proximo', 'proximo', '👥', 'Nome próximo', 'nome parecido, mesmo valor', 'Depois do 👤, casa o que sobrou quando o nome começa pela mesma palavra e o valor é igual. Confira uma a uma.') +
      acao('conciliar-valor', 'valor', '≈', 'Só pelo valor', 'sem documento e sem nome', 'Casa o que sobrou por valor igual, sem olhar documento e nome. Só valor quebrado: inteiro terminado em zero fica de fora.') +
      acao('conciliar-margem', 'margem', '±', 'Com margem', 'doc + nome · até ' + T.moeda(M().MARGEM_AB), 'Casa pelo mesmo documento e nome aceitando diferença de até ' + T.moeda(M().MARGEM_AB) + '.') +
      // DATA E VALOR: a regra que casa dois razões sem documento e sem nome em comum (Dony, 09/10/2026,
      // os repasses entre lojas): primeiro no mesmo dia e, num botão à parte, com alguns dias de folga.
      acao('conciliar-data', 'data', '📅', 'Data e valor', 'mesmo dia, mesmo valor', 'Casa um item de cada lado com o MESMO valor no MESMO dia — e, dentro da Parte A, o que se anula no mesmo dia. É a regra para dois razões sem documento em comum.') +
      acao('conciliar-data-folga', 'data-folga', '📆', 'Data com folga', 'até ' + FOLGA_DIAS + ' dias de diferença', 'Depois do 📅, casa o que sobrou aceitando até ' + FOLGA_DIAS + ' dias entre uma data e a outra, pegando sempre o par mais perto.') +
      '</div>' +
      (grupos.length ? '<div class="desfazer-lote"><span class="rotulo-lote">↺ Desfazer em lote</span>' +
        lote('desfazer-automaticas', 'documento', 'Pelo documento', doc) +
        lote('desfazer-fornecedor', 'fornecedor', 'Nome e valor', grupos.filter(M().ehPorFornecedor).length) +
        lote('desfazer-proximo', 'proximo', 'Nome próximo', grupos.filter(M().ehPorProximo).length) +
        lote('desfazer-valor', 'valor', 'Só pelo valor', grupos.filter(M().ehPorValor).length) +
        lote('desfazer-margem', 'margem', 'Com margem', grupos.filter(M().ehComMargem).length) +
        lote('desfazer-data', 'data', 'Data e valor', grupos.filter(M().ehPorDataEValor).length) +
        lote('desfazer-manuais', 'manual', 'À mão', grupos.filter((g) => g.regra === 'manual').length) +
        '</div>' : '') +
      '</div>';
  }

  function filtro(nome) { return E.filtros[nome] || ''; }
  function desenharFiltros() {
    const opcoes = [['', 'Em aberto'], ['conciliados', 'Conciliados'], ['documento', '⚡ Conciliados pelo documento'], ['data', '📅 Conciliados por data e valor'],
      ['fornecedor', '👤 Conciliados por nome e valor'], ['proximo', '👥 Conciliados por nome próximo'],
      ['valor', '≈ Conciliados só pelo valor'], ['margem', '± Conciliados com margem'],
      // As feitas à mão em separado (Dony, 05/10/2026): é o que mais se quer reconferir depois.
      ['mao', '✋ Conciliados à mão'], ['todos', 'Todos']];
    E.el.querySelector('#lv-filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Busca nos dois lados: documento, nome, valor, data ou #ID" value="' + T.esc(filtro('busca')) + '">' +
      '<select class="filtro" data-filtro="mostrar">' + opcoes.map((o) => '<option value="' + o[0] + '"' + (filtro('mostrar') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  }

  function grupoDoItem(x) {
    return E.decisoes.conciliacoesAB.find((g) => (g.a || []).indexOf(x.id) >= 0 || (g.b || []).indexOf(x.id) >= 0) || null;
  }
  function itensDoLado(lado) {
    const mostrar = filtro('mostrar');
    const busca = String(filtro('busca') || '').trim().toLowerCase();
    const casa = (x) => {
      if (!busca) return true;
      const alvo = (x.doc + ' ' + x.nome + ' ' + x.historico + ' ' + x.data + ' ' + U.formatarCentavos(Math.abs(x.valor))).toLowerCase();
      return alvo.indexOf(busca) >= 0;
    };
    const daRegra = (x) => {
      const g = grupoDoItem(x);
      if (mostrar === 'todos') return true;
      if (mostrar === 'conciliados') return !!g;
      if (mostrar === 'documento') return !!g && g.regra !== 'manual' && !M().ehPorValor(g) && !M().ehComMargem(g) && !M().ehPorFornecedor(g) && !M().ehPorProximo(g) && !M().ehPorDataEValor(g);
      if (mostrar === 'data') return M().ehPorDataEValor(g);
      if (mostrar === 'fornecedor') return M().ehPorFornecedor(g);
      if (mostrar === 'proximo') return M().ehPorProximo(g);
      if (mostrar === 'valor') return M().ehPorValor(g);
      if (mostrar === 'margem') return M().ehComMargem(g);
      if (mostrar === 'mao') return M().ehAMao(g);
      return !g;
    };
    return E.itens[lado].filter((x) => daRegra(x) && casa(x)).sort((a, b) => a.ordem - b.ordem || (a.doc < b.doc ? -1 : 1));
  }

  function desenharPartes() {
    E.el.querySelector('#lv-partes').innerHTML = parte('A') + parte('B');
    ligarTabelas();
  }

  function parte(lado) {
    const conta = lado === 'A' ? E.d.contaA : E.d.contaB;
    const lista = itensDoLado(lado);
    const total = lista.reduce((s, x) => s + x.valor, 0);
    return '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px">' +
      '<h3 style="flex:1">Parte ' + lado + ' · ' + T.esc(conta.codigo + ' ' + (conta.titulo || '')) + '</h3>' +
      '<span class="pilula azul">' + T.moeda(total) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + lista.length.toLocaleString('pt-BR') + ' item(ns) · de ' + E.itens[lado].length.toLocaleString('pt-BR') + '</p>' +
      '<div id="lv-tab-' + lado + '"></div></div>';
  }

  function ligarTabelas() {
    for (const lado of ['A', 'B']) {
      const alvo = E.el.querySelector('#lv-tab-' + lado);
      if (!alvo) continue;
      const lista = itensDoLado(lado);
      const sel = lado === 'A' ? E.selA : E.selB;
      T.tabelaPaginada(alvo, {
        alta: true, porPagina: 200,
        ordem: { id: 'lv-' + lado, colunas: [null, TXT((x) => x.doc), TXT((x) => x.nome), DATA((x) => x.data), VALOR((x) => x.valor), NUM((x) => { const g = grupoDoItem(x); return g ? g.id : null; })] },
        cabecalho: '<th style="width:26px"></th><th>Documento</th><th>Nome</th><th>Data</th><th class="num">Valor</th><th>ID</th>',
        linhas: lista, vazio: 'Nada nesta parte com estes filtros.',
        linha: (x) => {
          const g = grupoDoItem(x);
          return '<tr><td><input type="checkbox" data-sel="' + lado + '" value="' + T.esc(x.id) + '"' + (sel.has(x.id) ? ' checked' : '') + (g ? ' disabled' : '') + '></td>' +
            '<td class="num"><b>' + T.nome(x.doc || '') + '</b></td>' +
            '<td class="nome">' + T.esc(x.nome || '') + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 70)) + '</span>' : '') + '</td>' +
            '<td class="num">' + T.esc(x.data || '') + '</td>' + T.tdValor(x.valor) +
            '<td>' + (g ? '<span class="pilula azul">#' + g.id + '</span>' : '<span class="suave pequeno">em aberto</span>') + '</td></tr>';
        },
      });
    }
  }

  function desenharLista() {
    const grupos = E.decisoes.conciliacoesAB.slice().sort((a, b) => a.id - b.id);
    const el = E.el.querySelector('#lv-lista');
    if (!grupos.length) { el.innerHTML = '<p class="suave pequeno" style="margin:14px 0 0">Nada conciliado ainda. Comece pelo <b>⚡ Documento e nome</b>.</p>'; return; }
    el.innerHTML = '<h3 style="margin:18px 0 8px">Conciliações com ID (' + grupos.length.toLocaleString('pt-BR') + ')</h3><div id="lv-tab-lista"></div>';
    T.tabelaPaginada(el.querySelector('#lv-tab-lista'), {
      alta: false, porPagina: 100,
      ordem: { id: 'lv-lista', colunas: [NUM((g) => g.id), TXT((g) => M().COMO_AB[g.regra] || g.regra), TXT((g) => g.documento), TXT((g) => g.nome), VALOR((g) => g.valorA), VALOR((g) => g.valorB), null] },
      cabecalho: '<th>ID</th><th>Conciliado por</th><th>Documento</th><th>Nome</th><th class="num">Parte A</th><th class="num">Parte B</th><th></th>',
      linhas: grupos, vazio: 'Nenhuma conciliação.',
      linha: (g) => '<tr><td class="num"><b>#' + g.id + '</b></td>' +
        '<td><span class="selo ' + seloDaRegra(g) + '">' + T.esc(M().COMO_AB[g.regra] || g.regra) + '</span></td>' +
        '<td class="num">' + T.nome(g.documento || '') + '</td><td class="nome">' + T.esc(g.nome || '') + '</td>' +
        T.tdValor(g.valorA) + T.tdValor(g.valorB) +
        '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer="' + g.id + '">Desfazer</button></td></tr>',
    });
  }

  function seloDaRegra(g) {
    return g.regra === 'manual' ? 'mao' : M().ehPorValor(g) ? 'valor' : M().ehComMargem(g) ? 'margem'
      : M().ehPorFornecedor(g) ? 'fornecedor' : M().ehPorProximo(g) ? 'proximo' : 'opcional';
  }

  function atualizarBarra() {
    const a = Array.from(E.selA), b = Array.from(E.selB);
    const soma = (ids) => ids.reduce((s, id) => s + ((E.itens.porId.get(id) || {}).valor || 0), 0);
    const barra = E.el.querySelector('#lv-barra');
    if (!a.length && !b.length) { barra.innerHTML = ''; return; }
    const dif = soma(a) - soma(b);
    barra.innerHTML = '<div class="barra-selecao"><span><b>' + a.length + '</b> na A (' + T.moeda(soma(a)) + ') e <b>' + b.length + '</b> na B (' + T.moeda(soma(b)) + ')' +
      (dif ? ' · <span class="falta">diferença ' + T.moeda(dif) + '</span>' : ' · <b>batem</b>') + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-mao">✋ Conciliar à mão</button>' +
      '<button type="button" class="botao" data-acao="limpar-selecao">Limpar</button></div>';
  }

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  function historico(texto) {
    E.decisoes.historico = (E.decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome, texto }]).slice(-200);
  }

  function gravar(acao, detalhe) {
    E.fila = E.fila.then(async () => {
      try {
        E.registro = await app().armazenamento.salvarConciliacao(Object.assign({}, E.registro, {
          situacao: 'andamento', decisoes: E.decisoes,
          resumo: { conciliacoes: E.decisoes.conciliacoesAB.length, itensA: E.itens.A.length, itensB: E.itens.B.length,
            definicao: { id: E.d.id, nome: nomeDaDefinicao(E.d), contaA: E.d.contaA.codigo, contaB: E.d.contaB.codigo, regra: E.d.regra } },
        }));
        if (acao) await app().armazenamento.registrarNoLog({ codigo: E.codigo, acao, alvo: E.registro.id, detalhe: detalhe || '' });
        const g = E.el.querySelector('#lv-guardado');
        if (g) g.textContent = 'guardado às ' + U.horaLocal(E.registro.atualizadoEm);
      } catch (e) {
        T.avisoRapido('Não foi possível gravar: ' + T.mensagemDeErro(e), 'erro');
      }
    });
    return E.fila;
  }

  function redesenhar() {
    E.decisoes.conciliacoesAB = M().arrumarGruposAB(E.decisoes.conciliacoesAB, E.itens.legado).grupos;
    desenharAvisos();
    desenharCartoes();
    desenharAcoes();
    desenharPartes();
    desenharLista();
    atualizarBarra();
  }

  async function conciliarPor(qual) {
    const quem = app().usuario.nome, quando = U.agoraISO();
    const jaTem = E.decisoes.conciliacoesAB;
    const docs = M().conciliarAutomatico(E.itens, jaTem, quem, quando);
    let novas = [], nome = '';
    if (qual === 'documento') { novas = docs; nome = '⚡ documento e nome'; }
    else if (qual === 'fornecedor') { novas = M().conciliarPorFornecedor(E.itens, jaTem.concat(docs), quem, quando); nome = '👤 nome e valor'; }
    else if (qual === 'proximo') {
      const iguais = M().conciliarPorFornecedor(E.itens, jaTem.concat(docs), quem, quando);
      novas = M().conciliarPorFornecedor(E.itens, jaTem.concat(docs, iguais), quem, quando, { proximo: true });
      if (novas.length) novas = iguais.concat(novas);
      nome = '👥 nome próximo';
    } else if (qual === 'valor') { novas = M().conciliarPorValor(E.itens, jaTem.concat(docs), quem, quando); nome = '≈ só pelo valor'; }
    else if (qual === 'data') { novas = M().conciliarPorDataEValor(E.itens, jaTem.concat(docs), quem, quando, { folgaDias: 0 }); nome = '📅 data e valor'; }
    else if (qual === 'data-folga') {
      const exatas = M().conciliarPorDataEValor(E.itens, jaTem.concat(docs), quem, quando, { folgaDias: 0 });
      novas = M().conciliarPorDataEValor(E.itens, jaTem.concat(docs, exatas), quem, quando, { folgaDias: FOLGA_DIAS });
      if (novas.length) novas = exatas.concat(novas); else novas = exatas;
      nome = '📆 data com folga';
    }
    else if (qual === 'margem') { novas = M().conciliarAutomatico(E.itens, jaTem.concat(docs), quem, quando, { margem: M().MARGEM_AB }); nome = '± com margem'; }
    const entram = qual === 'documento' ? novas : docs.concat(novas);
    if (!entram.length) { T.avisoRapido('Nada casa por aí no que ficou em aberto.', 'ok', 7000); return; }
    if (qual !== 'documento') {
      const ok = await T.confirmar({ titulo: 'Conciliar por ' + nome + '?', botao: 'Conciliar',
        texto: (docs.length ? 'Antes, o <b>⚡ pelo documento</b> acha <b>' + docs.length + '</b>.<br>' : '') +
          'Por <b>' + T.esc(nome) + '</b>: <b>' + (entram.length - docs.length) + '</b> conciliação(ões).<br><br>Depois confira em <b>Mostrar</b> e desfaça o que não for.' });
      if (!ok) return;
    }
    E.decisoes.conciliacoesAB = jaTem.concat(entram);
    const texto = entram.length + ' conciliação(ões) por ' + nome;
    historico(texto);
    E.filtros.mostrar = qual === 'documento' ? 'documento' : qual;
    desenharFiltros();
    redesenhar();
    T.avisoRapido(texto + '.', 'ok', 8000);
    gravar('livre-' + qual, texto);
  }

  async function desfazerEm(tipo) {
    const de = {
      automaticas: (g) => g.regra !== 'manual' && !M().ehPorValor(g) && !M().ehComMargem(g) && !M().ehPorFornecedor(g) && !M().ehPorProximo(g) && !M().ehPorDataEValor(g),
      fornecedor: M().ehPorFornecedor, proximo: M().ehPorProximo, valor: M().ehPorValor, margem: M().ehComMargem, data: M().ehPorDataEValor,
      manuais: (g) => g.regra === 'manual',
    }[tipo];
    const saem = E.decisoes.conciliacoesAB.filter(de);
    if (!saem.length) return;
    const ok = await T.confirmar({ titulo: 'Desfazer ' + saem.length + ' conciliação(ões)?', perigo: true, botao: 'Desfazer',
      texto: 'Os itens delas voltam para <b>em aberto</b>. As outras continuam.' });
    if (!ok) return;
    const ids = new Set(saem.map((g) => g.id));
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => !ids.has(g.id));
    historico('Desfez ' + saem.length + ' conciliação(ões) (' + tipo + ')');
    redesenhar();
    T.avisoRapido(saem.length + ' conciliação(ões) desfeita(s).', 'ok');
    gravar('livre-desfazer-' + tipo, saem.length + ' conciliações');
  }

  async function conciliarAMao() {
    const a = Array.from(E.selA), b = Array.from(E.selB);
    if (!a.length && !b.length) return;
    const soma = (ids) => ids.reduce((s, id) => s + ((E.itens.porId.get(id) || {}).valor || 0), 0);
    const dif = soma(a) - soma(b);
    if (Math.abs(dif) >= 1) {
      const ok = await T.confirmar({ titulo: 'Conciliar com diferença de ' + T.moeda(dif) + '?', botao: 'Conciliar assim mesmo',
        texto: 'A Parte A soma <b>' + T.moeda(soma(a)) + '</b> e a Parte B soma <b>' + T.moeda(soma(b)) + '</b>. A diferença fica anotada na conciliação.' });
      if (!ok) return;
    }
    const proximo = M().proximoIdAB(E.decisoes.conciliacoesAB);
    const itens = a.concat(b).map((id) => E.itens.porId.get(id)).filter(Boolean);
    const g = { id: proximo, tipo: M().tipoAB(a.length, b.length), regra: 'manual', documento: (itens.find((x) => x.doc) || {}).doc || '',
      nome: (itens.find((x) => x.nome) || {}).nome || '', a, b, valorA: soma(a), valorB: soma(b), quem: app().usuario.nome, quando: U.agoraISO() };
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat([g]);
    E.selA.clear(); E.selB.clear();
    historico('Conciliou à mão: #' + g.id + ' (' + a.length + ' na A e ' + b.length + ' na B)');
    redesenhar();
    T.avisoRapido('Conciliação #' + g.id + ' criada à mão.', 'ok');
    gravar('livre-mao', '#' + g.id);
  }

  async function desfazerUma(id) {
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => String(g.id) !== String(id));
    historico('Desfez a conciliação #' + id);
    redesenhar();
    gravar('livre-desfazer', '#' + id);
  }

  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' },
    sub: { cor: 'FF5F6B7A', italico: true },
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true },
    cabNum: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', alinh: 'right', vert: 'center', quebra: true },
    val: { formato: 'dinheiro' },
    grp: { negrito: true, fundo: 'FFE7EEF5' },
    grpVal: { negrito: true, fundo: 'FFE7EEF5', formato: 'dinheiro' },
  };
  function baixarExcel() {
    const cel = (v, e) => (e ? { v: v, e: e } : v);
    const reais = (c) => Math.round(c) / 100;
    const mes = U.nomeCompetencia(E.comp);
    const planilhas = [];
    // Resumo
    const ab = M().emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    const res = [{ celulas: [cel(nomeDaDefinicao(E.d), 'tit')], altura: 22 }, { celulas: [cel(E.emp.codigo + ' · ' + E.emp.nome + ' · ' + mes, 'sub')] }, null];
    [['Parte A', textoDaConta(E.d.contaA)], ['Parte B', textoDaConta(E.d.contaB)],
      ['Cruzamento', E.d.regra === 'mesmo-valor' ? 'mesmo valor dos dois lados' : 'contrapartida'],
      ['Em aberto na Parte A', reais(ab.valorA)], ['Em aberto na Parte B', reais(ab.valorB)],
      ['Diferença', reais(ab.valorA - ab.valorB)], ['Conciliações', E.decisoes.conciliacoesAB.length]]
      .forEach(([k, v]) => res.push({ celulas: [cel(k, 'grp'), typeof v === 'number' ? cel(v, 'grpVal') : cel(v, 'grp')] }));
    planilhas.push({ nome: 'Resumo', colunas: [34, 60], linhas: res, rodape: E.emp.nome + ' · ' + nomeDaDefinicao(E.d) + ' · ' + mes });
    // As duas partes e as conciliações
    for (const lado of ['A', 'B']) {
      const linhas = [{ celulas: [cel('Parte ' + lado + ' · ' + textoDaConta(lado === 'A' ? E.d.contaA : E.d.contaB), 'tit')], altura: 22 }, { celulas: [cel(mes, 'sub')] }, null];
      const cab = linhas.push({ celulas: ['Situação', 'ID', 'Documento', 'Nome', 'Data', 'Valor', 'Histórico'].map((x, k) => cel(x, k === 5 ? 'cabNum' : 'cab')), altura: 26 });
      E.itens[lado].forEach((x) => {
        const g = grupoDoItem(x);
        linhas.push({ celulas: [g ? 'conciliado' : 'em aberto', g ? g.id : null, x.doc || '', x.nome || '', x.data || '', cel(reais(x.valor), 'val'), x.historico || ''] });
      });
      planilhas.push({ nome: 'Parte ' + lado, colunas: [12, 8, 16, 40, 12, 15, 60], linhas, congelar: { linhas: cab, colunas: 0 }, repetir: [cab, cab], paisagem: true,
        rodape: E.emp.nome + ' · parte ' + lado + ' · ' + mes });
    }
    const lc = [{ celulas: [cel('Conciliações com ID', 'tit')], altura: 22 }, { celulas: [cel(nomeDaDefinicao(E.d) + ' · ' + mes, 'sub')] }, null];
    const cabL = lc.push({ celulas: ['ID', 'Conciliado por', 'Documento', 'Nome', 'Parte A', 'Parte B', 'Diferença', 'Quem', 'Quando'].map((x, k) => cel(x, k >= 4 && k <= 6 ? 'cabNum' : 'cab')), altura: 26 });
    E.decisoes.conciliacoesAB.slice().sort((a, b) => a.id - b.id).forEach((g) => lc.push({ celulas: [g.id, M().COMO_AB[g.regra] || g.regra, g.documento || '', g.nome || '',
      cel(reais(g.valorA), 'val'), cel(reais(g.valorB), 'val'), cel(reais(g.valorA - g.valorB), 'val'), g.quem || '', g.quando ? U.dataHoraLocal(g.quando) : ''] }));
    planilhas.push({ nome: 'Conciliações', colunas: [8, 26, 16, 40, 15, 15, 14, 18, 18], linhas: lc, congelar: { linhas: cabL, colunas: 0 }, repetir: [cabL, cabL], paisagem: true,
      rodape: E.emp.nome + ' · conciliações · ' + mes });
    const bytes = raiz.ExcelBonito.gerar({ planilhas, estilos: ESTILOS, ativa: 1 });
    T.baixar(bytes, U.nomeSeguro(nomeDaDefinicao(E.d) + ' ' + E.emp.codigo + ' ' + U.anoMes(E.comp), 100) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'livre-excel', alvo: E.d.id, detalhe: E.decisoes.conciliacoesAB.length + ' conciliações' }).catch(() => {});
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function ligarUmaVez() {
    E.el.addEventListener('click', async (ev) => {
      const desfazer = ev.target.closest('[data-desfazer]');
      if (desfazer) { await desfazerUma(desfazer.getAttribute('data-desfazer')); return; }
      const acao = ev.target.closest('[data-acao]');
      if (!acao) return;
      const a = acao.getAttribute('data-acao');
      if (a === 'excel') { baixarExcel(); return; }
      if (a === 'limpar-selecao') { E.selA.clear(); E.selB.clear(); desenharPartes(); atualizarBarra(); return; }
      if (a === 'conciliar-mao') { await conciliarAMao(); return; }
      if (a.indexOf('desfazer-') === 0) { await desfazerEm(a.slice('desfazer-'.length)); return; }
      if (a.indexOf('conciliar-') === 0) {
        const qual = { 'conciliar-tudo': 'documento', 'conciliar-fornecedor': 'fornecedor', 'conciliar-proximo': 'proximo', 'conciliar-valor': 'valor', 'conciliar-margem': 'margem',
          'conciliar-data': 'data', 'conciliar-data-folga': 'data-folga' }[a];
        if (qual) await conciliarPor(qual);
      }
    });
    E.el.addEventListener('change', (ev) => {
      const sel = ev.target.closest('[data-sel]');
      if (sel) {
        const conjunto = sel.getAttribute('data-sel') === 'A' ? E.selA : E.selB;
        if (sel.checked) conjunto.add(sel.value); else conjunto.delete(sel.value);
        atualizarBarra();
        return;
      }
      const f = ev.target.closest('[data-filtro]');
      if (f) { E.filtros[f.getAttribute('data-filtro')] = f.value; desenharPartes(); }
    });
    E.el.addEventListener('input', (ev) => {
      const f = ev.target.closest('input[data-filtro]');
      if (!f) return;
      E.filtros[f.getAttribute('data-filtro')] = f.value;
      clearTimeout(E.tempo);
      E.tempo = setTimeout(() => { desenharPartes(); }, 250);
    });
  }

  raiz.TelaLivre = { mostrarLista, mostrar, definicoes, definicaoDe, nomeDaDefinicao, idDoRegistro };
})(self);
