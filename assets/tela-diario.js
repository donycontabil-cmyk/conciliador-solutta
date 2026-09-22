/*
 * Conciliador Solutta — tela-diario.js
 * LIVRO DIÁRIO da empresa (Dony, 22/09/2026: "ao invés de subir razão por razão, eu quero a opção subir diário" +
 * "junto com o balancete: saldo inicial mais todos os débitos e créditos daquela conta tem que ser o saldo final que
 * está no balancete" + "tem que ser um misto, optativo e não obrigatório: não muda as regras dos que já funcionam por
 * razão"). A página do ano:
 *  - o lugar do diário (um por ano, com versões) e os dos balancetes dos meses (os mesmos do relatório de apresentação);
 *  - o resumo do diário (período, lançamentos, débitos = créditos);
 *  - a CONFERÊNCIA com cada balancete carregado, conta por conta (débitos, créditos e saldo do mês), e o fechamento do
 *    começo ao fim (saldo inicial + débitos − créditos = saldo do balancete do último mês);
 *  - as contas das conciliações achadas no plano de contas (fornecedores, adiantamentos, clientes, bancos);
 *  - o RAZÃO DE QUALQUER CONTA tirado do diário (na tela e em Excel) — a base das conciliações de clientes e de
 *    resultado que ainda vão chegar.
 * Nos passos, o botão "📒 Tirar do diário" monta o razão das contas do lugar (TelaSubir.doDiario).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function MD() { return raiz.MotorDiario; }
  const primeiraMaiuscula = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  const dc = (v) => T.htmlDC(v, v >= 0 ? 'D' : 'C');
  const tdDC = (v) => T.tdValorDC(v, v >= 0 ? 'D' : 'C');
  const NOME_PAPEL = { 'fornecedores/principal': 'Fornecedores', 'fornecedores/adiantamento': 'Adiant. a fornecedores', 'clientes/principal': 'Clientes',
    'clientes/adiantamento': 'Adiant. de clientes', 'financeiro/banco': 'Banco' };

  let E = null; // estado da tela aberta

  // ------------------------------------------------------------------
  // Abrir
  // ------------------------------------------------------------------
  async function mostrar(el, codigo, ano, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) {
      el.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>A empresa <b>' + T.esc(codigo) + '</b> não está cadastrada nesta pasta de dados. <a href="#/">Voltar para as empresas</a></div></div>';
      return;
    }
    T.carregando(el, 'Abrindo o livro diário…');
    const arm = app().armazenamento;
    const metas = await arm.arquivos(codigo);
    const anoAtual = Number(U.hoje().ano || new Date().getFullYear());
    const anosComDiario = Array.from(new Set(metas.filter((m) => m.tipo === 'diario').map((m) => Number(String(m.competencia).slice(0, 4))))).sort((a, b) => b - a);
    const anoEscolhido = Number(ano) || anosComDiario[0] || anoAtual;
    const lugarDiario = raiz.TelaSubir.lugarDoDiario(anoEscolhido, metas);
    const balDoTipo = metas.filter((m) => m.tipo === 'balancete');
    const lugaresBal = U.MESES.map((nome, i) => {
      const comp = anoEscolhido + '-' + String(i + 1).padStart(2, '0') + '-01';
      const doMes = balDoTipo.filter((m) => m.competencia === comp).sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
      return { id: 'bal-' + String(i + 1).padStart(2, '0'), parte: 'Balancete · opcional', titulo: primeiraMaiuscula(nome), sub: U.nomeCompetencia(comp),
        nome: 'balancete de ' + U.nomeCompetencia(comp), log: 'apresentacao/balancete', tipo: 'balancete', competencia: comp, arquivos: doMes.length ? [doMes[0]] : [], opcional: true };
    });
    const md = lugarDiario.arquivos[0] || null;
    let diario = null, balancetes = [];
    if (md) {
      diario = await arm.conteudoDoArquivo(md.id);
      balancetes = await raiz.TelaSubir.balancetesDoDiario(metas, md.periodo);
    }
    if (conferir && !conferir()) return;
    const mesmo = E && E.codigo === codigo && E.ano === anoEscolhido && E.md && md && E.md.id === md.id;
    E = { codigo, emp, ano: anoEscolhido, metas, md, diario, balancetes, lugares: [lugarDiario].concat(lugaresBal),
      anos: Array.from(new Set(anosComDiario.concat([anoAtual, anoAtual - 1, anoEscolhido]))).sort((a, b) => b - a), anosComDiario,
      razao: mesmo ? E.razao : null };
    if (diario) {
      E.conf = MD().conferir(diario, balancetes);
      E.saldos = MD().saldosDasContas(diario, balancetes);
      E.plano = MD().planoDosBalancetes(balancetes);
    }
    desenhar(el);
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenhar(el) {
    const emp = E.emp, d = E.diario;
    const chave = 'diario-' + E.codigo + '-' + E.ano;
    const painel = raiz.TelaSubir.painel({ chave, titulo: 'Livro diário e balancetes de ' + E.ano, lugares: E.lugares, metas: E.metas, fixo: !d,
      resumo: d ? d.periodo.de + ' a ' + d.periodo.ate : 'sem diário',
      antes: '<p class="suave pequeno" style="margin:-4px 0 10px">O <b>livro diário</b> traz os lançamentos de todas as contas; o <b>balancete</b> de um mês dá o saldo inicial ' +
        'e confere o diário (os balancetes são os mesmos do relatório de apresentação). Com o balancete do último mês do diário, o programa confere também o saldo final de cada conta.</p>' });
    el.innerHTML = '<div class="diario-raiz">' +
      '<a class="voltar" href="#/empresa/' + encodeURIComponent(E.codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>📒 Livro diário</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + E.ano + (d ? ' · ' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + ' · ' + d.lancamentos.length.toLocaleString('pt-BR') + ' lançamentos' : ' · nenhum diário ainda') + '</p></div>' +
      '<div class="linha-flex">' +
      (E.anos.length > 1 ? '<select class="apres-campo" id="diario-ano" title="Ano do diário">' + E.anos.map((a) => '<option value="' + a + '"' + (a === E.ano ? ' selected' : '') + '>' + a +
        (E.anosComDiario.indexOf(a) < 0 ? ' · sem diário' : '') + '</option>').join('') + '</select>' : '') +
      raiz.TelaSubir.botao(chave) + '</div></div>' +
      painel +
      (d ? corpo() : '<div class="aviso info"><span class="icone-aviso">📒</span><div><b>Guarde aqui o livro diário do ano</b> (todas as contas, do primeiro mês ao último que já tem). ' +
        'Com ele, nos passos de fornecedores o botão <b>📒 Tirar do diário</b> monta o razão das contas sem subir conta por conta, e o programa confere cada mês com o balancete. ' +
        'É opcional: os passos continuam aceitando o razão como sempre.</div></div>') +
      '</div>';
    const raizEl = el.querySelector('.diario-raiz');
    raiz.TelaSubir.ligar(raizEl.querySelector('.arquivos-passo'), E.codigo, E.lugares);
    raiz.TelaSubir.ligarBotao(raizEl.querySelector('[data-abrir-arquivos]'));
    const selAno = raizEl.querySelector('#diario-ano');
    if (selAno) selAno.addEventListener('change', () => app().ir('#/empresa/' + encodeURIComponent(E.codigo) + '/diario/' + selAno.value));
    if (!d) return;
    ligarCorpo(raizEl);
    if (E.razao) mostrarRazao(raizEl, E.razao.red, E.razao.de, E.razao.ate, true);
  }

  function corpo() {
    const d = E.diario, conf = E.conf, s = E.saldos;
    const comps = d.meses.map((m) => m.comp);
    const nomeFim = U.nomeCompetencia(comps[comps.length - 1]);
    // Resumo
    const nomeIni = U.nomeCompetencia(comps[0]);
    const periodoCurto = comps.length === 1 ? nomeFim : (nomeIni.slice(-4) === nomeFim.slice(-4) ? nomeIni.slice(0, -5) : nomeIni) + ' a ' + nomeFim;
    const cartoes = '<div class="grade-4 diario-cartoes">' +
      '<div class="cartao resumo"><div class="rotulo">Período</div><div class="grande">' + T.esc(primeiraMaiuscula(periodoCurto)) + '</div>' +
        '<div class="detalhe"><span>' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + ' · ' + comps.length + (comps.length === 1 ? ' mês' : ' meses') + '</span><span>' + T.esc(E.md.arquivo) + '</span></div></div>' +
      '<div class="cartao resumo"><div class="rotulo">Lançamentos</div><div class="grande">' + d.lancamentos.length.toLocaleString('pt-BR') + '</div>' +
        '<div class="detalhe"><span><b>' + (d.grupos || 0).toLocaleString('pt-BR') + '</b> lançamentos contábeis (' + (d.lancamentosDeVarias || 0).toLocaleString('pt-BR') + ' linhas de lançamentos com várias contas)</span></div></div>' +
      '<div class="cartao resumo"><div class="rotulo">Débitos = créditos</div><div class="grande">' + (d.confere ? '✓ ' : '✗ ') + T.esc(U.formatarCentavos(d.totalDebitos)) + '</div>' +
        '<div class="detalhe"><span>débitos <b>' + T.esc(U.formatarCentavos(d.totalDebitos)) + '</b> · créditos <b>' + T.esc(U.formatarCentavos(d.totalCreditos)) + '</b></span>' +
        '<span><b>' + (d.contas || []).length.toLocaleString('pt-BR') + '</b> contas movimentadas</span></div></div>' +
      '<div class="cartao resumo"><div class="rotulo">Conferido com o balancete</div><div class="grande">' + (conf.mesesComBalancete ? (conf.confere ? '✓ ' : '✗ ') + conf.mesesComBalancete + ' de ' + comps.length + (comps.length === 1 ? ' mês' : ' meses') : '—') + '</div>' +
        '<div class="detalhe"><span>' + (conf.mesesComBalancete ? '<b>' + conf.contasConferidas.toLocaleString('pt-BR') + '</b> conta(s)-mês conferidas · <b>' + conf.divergencias + '</b> diferença(s)' : 'carregue os balancetes dos meses para conferir') + '</span></div></div>' +
      '</div>';
    const avisosDiario = (d.avisos || []).length ? '<div class="aviso ambar" style="margin-top:12px"><span class="icone-aviso">⚠️</span><div>' + d.avisos.map((a) => T.esc(a)).join('<br>') + '</div></div>' : '';
    // Conferência por mês
    const linhasMes = conf.meses.map((m) => {
      if (!m.temBalancete) {
        return '<tr><td>' + T.esc(primeiraMaiuscula(U.nomeCompetencia(m.comp))) + '</td><td class="num">' + m.lancamentos.toLocaleString('pt-BR') + '</td>' +
          '<td colspan="4" class="suave">sem balancete — <button type="button" class="lapis" data-abrir-balancetes>carregar o balancete de ' + T.esc(U.nomeCompetencia(m.comp)) + '</button></td></tr>';
      }
      const dif = m.divergencias.length + m.semBalancete.length;
      return '<tr><td>' + T.esc(primeiraMaiuscula(U.nomeCompetencia(m.comp))) + '</td><td class="num">' + m.lancamentos.toLocaleString('pt-BR') + '</td><td>' + (dif ? '<span class="pilula vermelho">✗ não bate</span>' : '<span class="pilula verde">✓ bate</span>') + '</td>' +
        '<td class="num">' + m.contas + '</td><td class="num">' + m.batem + '</td><td class="num">' + (dif ? '<button type="button" class="lapis forte" data-ver-diferencas="' + m.comp + '">' + dif + ' — ver</button>' : '0') + '</td></tr>';
    }).join('');
    const fechamento = s.temBalanceteDoFim
      ? (s.naoBatem.length
        ? '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div><b>Do começo ao fim: ' + s.batem + ' de ' + s.conferidas + ' contas fecham com o balancete de ' + T.esc(nomeFim) + '.</b> ' +
          'Nas outras ' + s.naoBatem.length + ', saldo inicial + débitos − créditos do diário não dá o saldo do balancete: <button type="button" class="lapis forte" data-ver-fechamento>ver as contas</button></div></div>'
        : '<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Do começo ao fim, as ' + s.conferidas + ' contas fecham:</b> saldo inicial + todos os débitos e créditos do diário = saldo do balancete de ' + T.esc(nomeFim) + '.</div></div>')
      : '<p class="suave pequeno">Para conferir o fechamento do começo ao fim (saldo inicial + todos os débitos e créditos = saldo final do balancete), carregue o <b>balancete de ' + T.esc(nomeFim) + '</b>.</p>';
    const conferencia = '<section class="cartao corpo" style="margin-top:14px"><h2>Conferência com os balancetes</h2>' +
      '<p class="suave pequeno" style="margin:4px 0 10px">Em cada mês com balancete, conta por conta: os débitos e os créditos do mês no diário são os do balancete, e o saldo anterior + débitos − créditos dá o saldo do fim do mês.</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Mês</th><th class="num">Lançamentos no diário</th><th>Balancete</th><th class="num">Contas conferidas</th><th class="num">Batem</th><th class="num">Diferenças</th></tr></thead><tbody>' +
      linhasMes + '</tbody></table></div><div style="margin-top:10px">' + fechamento + '</div>' +
      (!E.balancetes.length ? '<div class="aviso ambar" style="margin-top:10px"><span class="icone-aviso">⚠️</span><div><b>Sem balancete do período do diário, o saldo inicial das contas não é conhecido</b> (e os nomes das contas também não: o diário só traz o código). ' +
        'Carregue pelo menos o balancete de ' + T.esc(U.nomeCompetencia(comps[0])) + '.</div></div>' : '') +
      (s.semPlano && E.balancetes.length ? '<p class="suave pequeno" style="margin-top:8px">' + s.semPlano + ' conta(s) do diário não estão nos balancetes carregados (conta nova no ano ou só com movimento depois): o nome aparece com o balancete do último mês.</p>' : '') +
      '</section>';
    // Contas das conciliações
    const emp = E.emp, escolhidos = emp.papeisDeConta || {};
    const detectadas = MD().contasDasConciliacoes(E.plano);
    Object.keys(escolhidos).forEach((k) => {
      const e = escolhidos[k];
      if (!e || !e.familia || detectadas.some((c) => c.reduzido === String(k))) return;
      const info = E.plano.get(String(k));
      if (info || (d.contas || []).indexOf(String(k)) >= 0) detectadas.push({ reduzido: String(k), conta: info ? info.conta : '', titulo: info ? info.titulo : '', familia: e.familia, papel: e.papel, escolhido: true });
    });
    const porRed = new Map(s.contas.map((c) => [c.reduzido, c]));
    const linhasConc = detectadas.map((c) => {
      const x = porRed.get(c.reduzido) || { lancamentos: 0, saldoInicial: null, debitos: 0, creditos: 0, saldoFinal: null, saldoBalancete: null, confere: null };
      return '<tr><td class="sem-quebra">' + T.esc(NOME_PAPEL[c.familia + '/' + c.papel] || c.familia) + (c.escolhido ? ' <span class="suave pequeno" title="Escolhido para esta empresa">(escolhido)</span>' : '') + '</td>' +
        '<td class="nome"><b>' + T.esc(c.reduzido) + '</b> ' + T.esc(c.titulo || '—') + '<br><span class="suave pequeno">' + T.esc(c.conta || '') + '</span></td>' +
        '<td class="num">' + x.lancamentos.toLocaleString('pt-BR') + '</td>' + (x.saldoInicial === null ? '<td class="num suave">—</td>' : tdDC(x.saldoInicial)) + T.tdValor(x.debitos) + T.tdValor(x.creditos) +
        (x.saldoFinal === null ? '<td class="num suave">—</td>' : tdDC(x.saldoFinal)) +
        '<td>' + (x.confere === true ? '<span class="pilula verde">✓ bate</span>' : x.confere === false ? '<span class="pilula vermelho" title="O balancete diz ' + T.esc(T.valorDC(x.saldoBalancete, x.saldoBalancete >= 0 ? 'D' : 'C')) + '">✗ não bate</span>' : '<span class="suave pequeno">sem o balancete</span>') + '</td>' +
        '<td><button type="button" class="botao pequeno sem-quebra" data-ver-razao="' + T.esc(c.reduzido) + '">Ver razão</button></td></tr>';
    }).join('');
    const contas = '<section class="cartao corpo" style="margin-top:14px"><h2>Contas das conciliações</h2>' +
      '<p class="suave pequeno" style="margin:4px 0 10px">Achadas no plano de contas pelo nome e pela classificação. Nos passos de fornecedores, o botão <b>📒 Tirar do diário</b> monta o razão delas ' +
      '(opcional: o razão continua podendo subir como sempre). Clientes e resultado usam a mesma base quando as conciliações chegarem.</p>' +
      (detectadas.length ? '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Conciliação</th><th>Conta</th><th class="num">Lanç.</th><th class="num">Saldo inicial</th>' +
        '<th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo final</th><th title="Saldo final pelo diário × saldo do balancete de ' + T.esc(nomeFim) + '">Fim × balancete</th><th></th></tr></thead><tbody>' + linhasConc + '</tbody></table></div>'
        : '<p class="suave">Nenhuma conta de fornecedores, clientes ou bancos achada no plano de contas' + (E.balancetes.length ? '' : ' (carregue um balancete: o plano de contas vem dele)') + '.</p>') +
      '</section>';
    // Razão de qualquer conta
    const opcoes = s.contas.filter((c) => c.lancamentos || (c.saldoInicial || 0) !== 0).map((c) => '<option value="' + T.esc(c.reduzido + ' — ' + (c.titulo || 'conta ' + c.reduzido) + (c.conta ? ' (' + c.conta + ')' : '')) + '"></option>').join('');
    const mesesOp = (sel) => comps.map((c) => '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + T.esc(U.nomeCompetencia(c)) + '</option>').join('');
    const razao = '<section class="cartao corpo" style="margin-top:14px" id="diario-razao"><h2>Razão de uma conta</h2>' +
      '<p class="suave pequeno" style="margin:4px 0 10px">Qualquer conta do diário — de balanço ou de resultado —, com o saldo inicial do balancete e o saldo corrido. Digite o código reduzido ou o nome.</p>' +
      '<div class="linha-flex"><input class="apres-campo" id="diario-conta" list="diario-contas" placeholder="código ou nome da conta" style="min-width:320px"><datalist id="diario-contas">' + opcoes + '</datalist>' +
      '<label class="pequeno">de <select class="apres-campo" id="diario-de">' + mesesOp(comps[0]) + '</select></label>' +
      '<label class="pequeno">até <select class="apres-campo" id="diario-ate">' + mesesOp(comps[comps.length - 1]) + '</select></label>' +
      '<button type="button" class="botao primario pequeno" id="diario-ver">Ver razão</button></div>' +
      '<div id="diario-razao-corpo" style="margin-top:12px"></div></section>';
    return cartoes + avisosDiario + conferencia + contas + razao;
  }

  // ------------------------------------------------------------------
  // Cliques
  // ------------------------------------------------------------------
  function ligarCorpo(raizEl) {
    raizEl.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-abrir-balancetes]')) {
        const p = raizEl.querySelector('.arquivos-passo');
        if (p && p.hidden) { const bt = raizEl.querySelector('[data-abrir-arquivos]'); if (bt) bt.click(); } else if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const vd = ev.target.closest('[data-ver-diferencas]');
      if (vd) { verDiferencas(vd.getAttribute('data-ver-diferencas')); return; }
      if (ev.target.closest('[data-ver-fechamento]')) { verFechamento(); return; }
      const vr = ev.target.closest('[data-ver-razao]');
      if (vr) {
        const red = vr.getAttribute('data-ver-razao');
        const inp = raizEl.querySelector('#diario-conta');
        const c = E.saldos.contas.find((x) => x.reduzido === red);
        if (inp) inp.value = red + ' — ' + ((c && c.titulo) || 'conta ' + red) + (c && c.conta ? ' (' + c.conta + ')' : '');
        const comps = E.diario.meses.map((m) => m.comp);
        mostrarRazao(raizEl, red, comps[0], comps[comps.length - 1]);
        return;
      }
      if (ev.target.closest('#diario-ver')) { verDaCaixa(raizEl); return; }
      if (ev.target.closest('[data-excel-razao]')) { baixarExcel(); return; }
    });
    const inp = raizEl.querySelector('#diario-conta');
    if (inp) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); verDaCaixa(raizEl); } });
  }

  // A conta digitada: o código reduzido do começo ("2000 — Fornecedores…") ou o nome (a única conta com esse pedaço).
  function contaDigitada(texto) {
    const t = String(texto || '').trim();
    const m = t.match(/^0*(\d+)/);
    if (m && E.saldos.contas.some((c) => c.reduzido === m[1])) return m[1];
    const k = U.semAcento(t).toLowerCase();
    if (!k) return null;
    const achadas = E.saldos.contas.filter((c) => U.semAcento(c.titulo || '').toLowerCase().indexOf(k) >= 0);
    return achadas.length === 1 ? achadas[0].reduzido : achadas.length ? achadas : null;
  }
  function verDaCaixa(raizEl) {
    const r = contaDigitada(raizEl.querySelector('#diario-conta').value);
    const de = raizEl.querySelector('#diario-de').value, ate = raizEl.querySelector('#diario-ate').value;
    if (!r) { T.avisoRapido('Não achei essa conta no diário.', 'erro', 4000); return; }
    if (Array.isArray(r)) { T.avisoRapido(r.length + ' contas com esse nome: escolha na lista (' + r.slice(0, 4).map((c) => c.reduzido + ' ' + c.titulo).join(' · ') + (r.length > 4 ? '…' : '') + ').', 'erro', 7000); return; }
    if (de > ate) { T.avisoRapido('O mês de início vem depois do mês do fim.', 'erro', 4000); return; }
    mostrarRazao(raizEl, r, de, ate);
  }

  function mostrarRazao(raizEl, red, de, ate, semRolar) {
    const alvo = raizEl.querySelector('#diario-razao-corpo');
    if (!alvo) return;
    const rz = MD().razaoDaConta(E.diario, E.balancetes, red, { de, ate });
    E.razao = { red, de, ate, rz };
    const c = rz.conta;
    const selDe = raizEl.querySelector('#diario-de'), selAte = raizEl.querySelector('#diario-ate');
    if (selDe) selDe.value = rz.inicio;
    if (selAte) selAte.value = rz.fim;
    const conferido = rz.confereComBalancete === true ? '<span class="pilula verde">✓ bate com o balancete de ' + T.esc(U.nomeCompetencia(rz.fim)) + '</span>'
      : rz.confereComBalancete === false ? '<span class="pilula vermelho">✗ o balancete de ' + T.esc(U.nomeCompetencia(rz.fim)) + ' diz ' + dc(c.saldoFinalDeclarado) + '</span>'
        : '<span class="suave pequeno">sem o balancete de ' + T.esc(U.nomeCompetencia(rz.fim)) + ' para conferir o saldo do fim</span>';
    alvo.innerHTML = '<div class="cab-razao-diario"><div><b>' + T.esc(c.codigo + ' · ' + c.nome) + '</b>' + (c.classificacao ? ' <span class="suave">' + T.esc(c.classificacao) + '</span>' : '') +
      '<br><span class="suave pequeno">' + T.esc(rz.periodo.de + ' a ' + rz.periodo.ate) + ' · ' + c.lancamentos.length.toLocaleString('pt-BR') + ' lançamento(s) · saldo inicial ' + dc(c.saldoAnterior) +
      ' · débitos ' + T.esc(U.formatarCentavos(c.totalDebito)) + ' · créditos ' + T.esc(U.formatarCentavos(c.totalCredito)) + ' · saldo final <b>' + dc(c.saldoFinal) + '</b></span> ' + conferido + '</div>' +
      '<button type="button" class="botao pequeno" data-excel-razao>⬇ Excel</button></div>' +
      (c.avisos.length ? '<div class="aviso ambar" style="margin:8px 0"><span class="icone-aviso">⚠️</span><div>' + c.avisos.map((a) => T.esc(a)).join('<br>') + '</div></div>' : '') +
      '<div id="diario-razao-tabela" style="margin-top:8px"></div>';
    const nomeConta = (red2) => { const x = E.plano.get(String(red2)); return x ? x.titulo : ''; };
    T.tabelaPaginada(alvo.querySelector('#diario-razao-tabela'), {
      linhas: c.lancamentos, porPagina: 300,
      cabecalho: '<th>Data</th><th class="num">Lanç.</th><th class="historico">Histórico</th><th>Contrapartida</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th>',
      linha: (l) => '<tr><td class="num">' + T.esc(l.data) + '</td><td class="num suave">' + T.esc(l.numero) + '</td><td class="historico">' + T.esc(l.historico) + '</td>' +
        '<td class="pequeno">' + (l.contrapartida ? '<b>' + T.esc(l.contrapartida) + '</b> ' + T.esc(nomeConta(l.contrapartida)) : l.contrapartidas && l.contrapartidas.length ? '<span class="suave">várias: ' + T.esc(l.contrapartidas.join(', ')) + '</span>' : '—') + '</td>' +
        T.tdValor(l.debito) + T.tdValor(l.credito) + tdDC(l.saldo) + '</tr>',
      rodape: '<tr class="total"><td colspan="4">Saldo inicial ' + dc(c.saldoAnterior) + ' · total do período</td>' + T.tdValor(c.totalDebito) + T.tdValor(c.totalCredito) + tdDC(c.saldoFinal) + '</tr>',
      vazio: 'Nenhum lançamento desta conta no período.',
    });
    if (!semRolar && alvo.scrollIntoView) alvo.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // As diferenças de um mês (conta por conta).
  function verDiferencas(comp) {
    const m = E.conf.meses.find((x) => x.comp === comp);
    if (!m) return;
    const linhas = m.divergencias.map((x) => '<tr><td class="num">' + T.esc(x.reduzido) + '</td><td class="nome">' + T.esc(x.titulo || '') + ' <span class="suave pequeno">' + T.esc(x.conta || '') + '</span></td>' +
      T.tdValor(x.balancete.debitos) + T.tdValor(x.diario.debitos) + T.tdValor(x.balancete.creditos) + T.tdValor(x.diario.creditos) + tdDC(x.balancete.saldoAtual) + tdDC(x.diario.saldoFinal) + T.tdValor(x.diferencaSaldo) + '</tr>').join('');
    const sem = m.semBalancete.map((x) => '<tr><td class="num">' + T.esc(x.reduzido) + '</td><td class="nome suave">não está no balancete</td>' + T.tdValor(0) + T.tdValor(x.debitos) + T.tdValor(0) + T.tdValor(x.creditos) + '<td></td><td></td><td></td></tr>').join('');
    T.janela({ titulo: 'Diferenças entre o diário e o balancete de ' + U.nomeCompetencia(comp), larga: true,
      corpo: '<p class="suave pequeno" style="margin-bottom:8px">Saldo do diário = saldo anterior do balancete + débitos − créditos do mês no diário.</p>' +
        '<div class="tabela-caixa alta"><table class="tabela"><thead><tr><th class="num">Conta</th><th>Nome</th><th class="num">Débitos no balancete</th><th class="num">Débitos no diário</th>' +
        '<th class="num">Créditos no balancete</th><th class="num">Créditos no diário</th><th class="num">Saldo no balancete</th><th class="num">Saldo pelo diário</th><th class="num">Diferença</th></tr></thead><tbody>' +
        linhas + sem + '</tbody></table></div>' });
  }

  // As contas que não fecham do começo ao fim.
  function verFechamento() {
    const s = E.saldos;
    const linhas = s.naoBatem.map((x) => '<tr><td class="num">' + T.esc(x.reduzido) + '</td><td class="nome">' + T.esc(x.titulo || '') + ' <span class="suave pequeno">' + T.esc(x.conta || '') + '</span></td>' +
      tdDC(x.saldoInicial) + T.tdValor(x.debitos) + T.tdValor(x.creditos) + tdDC(x.saldoFinal) + tdDC(x.saldoBalancete) + T.tdValor(x.saldoFinal - x.saldoBalancete) + '</tr>').join('');
    T.janela({ titulo: 'Contas que não fecham com o balancete de ' + U.nomeCompetencia(s.fim), larga: true,
      corpo: '<div class="tabela-caixa alta"><table class="tabela"><thead><tr><th class="num">Conta</th><th>Nome</th><th class="num">Saldo inicial</th><th class="num">Débitos</th><th class="num">Créditos</th>' +
        '<th class="num">Saldo pelo diário</th><th class="num">Saldo no balancete</th><th class="num">Diferença</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' });
  }

  // ------------------------------------------------------------------
  // Excel do razão aberto
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
  };
  const reais = (c) => Math.round(Number(c) || 0) / 100;
  const cel = (v, e) => ({ v: v === undefined ? null : v, e: e || 'txt' });
  const letraDC = (v) => (v ? (v >= 0 ? 'D' : 'C') : '');
  function baixarExcel() {
    if (!E.razao) return;
    const rz = E.razao.rz, c = rz.conta, emp = E.emp;
    const nomeConta = (red) => { const x = E.plano.get(String(red)); return x ? x.titulo : ''; };
    const l = [];
    l.push({ celulas: [cel('Razão da conta ' + c.codigo + ' · ' + c.nome + (c.classificacao ? ' (' + c.classificacao + ')' : ''), 'tit')], altura: 22 });
    l.push({ celulas: [cel(emp.codigo + ' · ' + emp.nome + ' · ' + rz.periodo.de + ' a ' + rz.periodo.ate + ' · tirado do livro diário ' + E.md.arquivo, 'sub')] });
    l.push(null);
    const cab = l.push({ celulas: ['Data', 'Lançamento', 'Histórico', 'Contrapartida', 'Débito', 'Crédito', 'Saldo', 'D/C'].map((t, k) => cel(t, k >= 4 && k <= 6 ? 'cabNum' : 'cab')), altura: 22 });
    l.push({ celulas: [cel(''), cel(''), cel('Saldo inicial'), cel(''), cel(null), cel(null), cel(reais(Math.abs(c.saldoAnterior)), 'val'), cel(letraDC(c.saldoAnterior))] });
    c.lancamentos.forEach((x) => l.push({ celulas: [cel(x.data, 'data'), cel(x.numero), cel(x.historico),
      cel(x.contrapartida ? x.contrapartida + ' ' + nomeConta(x.contrapartida) : (x.contrapartidas || []).length ? 'várias: ' + x.contrapartidas.join(', ') : ''),
      cel(x.debito ? reais(x.debito) : null, 'val'), cel(x.credito ? reais(x.credito) : null, 'val'), cel(reais(Math.abs(x.saldo)), 'val'), cel(letraDC(x.saldo))] }));
    l.push({ celulas: [cel('Total', 'tot'), cel('', 'tot'), cel(c.lancamentos.length + ' lançamento(s)', 'tot'), cel('', 'tot'), cel(reais(c.totalDebito), 'totVal'), cel(reais(c.totalCredito), 'totVal'),
      cel(reais(Math.abs(c.saldoFinal)), 'totVal'), cel(letraDC(c.saldoFinal), 'tot')] });
    if (rz.confereComBalancete !== null) l.push({ celulas: [cel(rz.confereComBalancete ? 'Confere com o balancete de ' + U.nomeCompetencia(rz.fim) : 'NÃO confere: o balancete de ' + U.nomeCompetencia(rz.fim) + ' diz ' + T.valorDC(c.saldoFinalDeclarado, c.saldoFinalDeclarado >= 0 ? 'D' : 'C'), 'sub')] });
    const bytes = raiz.ExcelBonito.gerar({ planilhas: [{ nome: 'Razão ' + c.codigo, colunas: [11, 11, 70, 36, 15, 15, 16, 5], linhas: l, congelar: { linhas: cab, colunas: 0 }, repetir: [cab, cab],
      paisagem: true, rodape: emp.nome + ' · razão tirado do diário · ' + rz.periodo.de + ' a ' + rz.periodo.ate }], estilos: ESTILOS });
    T.baixar(bytes, U.nomeSeguro('Razão ' + c.codigo + ' ' + c.nome + ' ' + emp.codigo + ' ' + U.anoMes(rz.inicio) + ' a ' + U.anoMes(rz.fim), 100) + '.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'razao-do-diario-excel', alvo: 'diario/' + E.ano, detalhe: 'conta ' + c.codigo + ' · ' + rz.periodo.de + ' a ' + rz.periodo.ate }).catch(() => {});
  }

  raiz.TelaDiario = { mostrar, _teste: { contaDigitada } };
})(self);
