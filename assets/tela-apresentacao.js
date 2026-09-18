/*
 * Conciliador Solutta — tela-apresentacao.js
 * RELATÓRIO DE APRESENTAÇÃO da empresa (Dony, 18/09/2026: "dentro da empresa, um relatório de
 * apresentação; seguir o mesmo layout do Excel, só que bonitinho no sistema, com um lugar para importar
 * os balancetes" — "o Mensal, o Trimestral e o LALUR trimestral também").
 *
 * Endereço: #/empresa/<código>/apresentacao[/<ano>].
 *  - Balancetes do ano: um lugar por mês (Janeiro a Dezembro), com as versões de sempre (tela-subir.js).
 *  - Abas: Resumo, DRE mensal, DRE trimestral, Balancete mensal, Balancete trimestral e LALUR (Parte A,
 *    ajustes, PAT, Parte B e premissas). As contas vêm do motor-apresentacao.js.
 *  - O que quem usa informa (Parte B, lista de ajustes, conta do PAT) fica num registro do ano.
 *  - Imprimir / salvar PDF (folha deitada) e Excel com as mesmas abas da planilha modelo.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function motor() { return raiz.MotorApresentacao; }

  const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const ABAS = [
    { id: 'resumo', titulo: 'Resumo' },
    { id: 'dre-mensal', titulo: 'DRE mensal' },
    { id: 'dre-trimestral', titulo: 'DRE trimestral' },
    { id: 'balancete-mensal', titulo: 'Balancete mensal' },
    { id: 'balancete-trimestral', titulo: 'Balancete trimestral' },
    { id: 'lalur', titulo: 'LALUR trimestral' },
  ];
  const REGRAS = { movimento: 'Movimento do mês (conta de resultado)', 'aumento-credor': 'Aumento do saldo credor (conta patrimonial)' };
  const CHAVE_PREF = 'conciliador-solutta.apresentacao';

  // Estado da tela (continua entre redesenhos).
  const E = { codigo: null, ano: null, emp: null, rel: null, registro: null, config: {}, lugares: [], metas: [],
    aba: 'dre-mensal', avah: true, nivel: 5, semZeradas: false, abertos: new Set(), selecao: null };
  (function lerPreferencias() {
    try {
      const p = JSON.parse((raiz.localStorage && raiz.localStorage.getItem(CHAVE_PREF)) || '{}') || {};
      if (ABAS.some((a) => a.id === p.aba)) E.aba = p.aba;
      if (typeof p.avah === 'boolean') E.avah = p.avah;
      if (p.nivel >= 1 && p.nivel <= 9) E.nivel = p.nivel;
      if (typeof p.semZeradas === 'boolean') E.semZeradas = p.semZeradas;
    } catch (e) { /* sem preferências guardadas */ }
  })();
  function guardarPreferencias() {
    try { raiz.localStorage.setItem(CHAVE_PREF, JSON.stringify({ aba: E.aba, avah: E.avah, nivel: E.nivel, semZeradas: E.semZeradas })); } catch (e) { /* navegador sem armazenamento */ }
  }

  // ------------------------------------------------------------------
  // Números no formato da planilha: negativo em vermelho entre parênteses, zero como "–".
  // ------------------------------------------------------------------
  function dinheiro(c) {
    if (c === null || c === undefined || !isFinite(c)) return '';
    const n = Math.round(c);
    if (n === 0) return '<span class="zero">–</span>';
    const t = U.formatarCentavos(Math.abs(n));
    return n < 0 ? '<span class="neg">(' + t + ')</span>' : t;
  }
  function pct(x) {
    if (x === null || x === undefined || !isFinite(x)) return '';
    const v = Math.round(x * 1000) / 10;
    if (v === 0) return '<span class="zero">–</span>';
    const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    return v < 0 ? '<span class="neg">(' + t + ')</span>' : t;
  }

  function idRegistro(codigo, ano) { return 'F-' + codigo + '-apresentacao-' + ano + '-01'; }

  // ------------------------------------------------------------------
  // Abrir a tela
  // ------------------------------------------------------------------
  async function mostrar(el, codigo, ano, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) {
      el.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>A empresa <b>' + T.esc(codigo) + '</b> não está cadastrada nesta pasta de dados. <a href="#/">Voltar para as empresas</a></div></div>';
      return;
    }
    T.carregando(el, 'Montando o relatório de apresentação…');
    const arm = app().armazenamento;
    const metas = await arm.arquivos(codigo);
    const doTipo = metas.filter((m) => m.tipo === 'balancete');
    const anoAtual = Number(U.hoje().ano || new Date().getFullYear());
    const anosComBalancete = Array.from(new Set(doTipo.map((m) => Number(String(m.competencia).slice(0, 4))))).sort((a, b) => b - a);
    const anoEscolhido = Number(ano) || anosComBalancete[0] || anoAtual;
    const lugares = MESES_LONGOS.map((nome, i) => {
      const comp = anoEscolhido + '-' + String(i + 1).padStart(2, '0') + '-01';
      const doMes = doTipo.filter((m) => m.competencia === comp).sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
      return { id: 'bal-' + String(i + 1).padStart(2, '0'), parte: 'Balancete', titulo: nome, sub: U.nomeCompetencia(comp),
        nome: 'balancete de ' + U.nomeCompetencia(comp), log: 'apresentacao/balancete', tipo: 'balancete', competencia: comp,
        arquivos: doMes.length ? [doMes[0]] : [], opcional: true };
    });
    const balancetes = [];
    for (const l of lugares) {
      if (!l.arquivos.length) continue;
      const c = await arm.conteudoDoArquivo(l.arquivos[0].id);
      if (c && c.contas) balancetes.push({ competencia: l.competencia, contas: c.contas });
    }
    const registro = (await arm.conciliacoes(codigo, anoEscolhido + '-01-01')).find((r) => r.id === idRegistro(codigo, anoEscolhido)) || null;
    if (conferir && !conferir()) return;
    if (E.codigo !== codigo || E.ano !== anoEscolhido) { E.abertos = new Set(); E.selecao = null; }
    Object.assign(E, { codigo, ano: anoEscolhido, emp, metas, lugares, registro, config: (registro && registro.config) || {} });
    E.rel = motor().montar({ ano: anoEscolhido, balancetes, config: E.config });
    E.anos = Array.from(new Set(anosComBalancete.concat([anoAtual, anoEscolhido]))).sort((a, b) => b - a);
    desenhar(el);
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function desenhar(el) {
    const rel = E.rel, emp = E.emp;
    const carregados = rel.meses.filter((m) => m.tem);
    const periodo = carregados.length ? carregados[0].rotulo.slice(0, 3) + '–' + carregados[carregados.length - 1].rotulo : '';
    const chave = 'apresentacao-' + E.codigo + '-' + E.ano;
    const semBalancete = !carregados.length;
    const painel = raiz.TelaSubir.painel({ chave, titulo: 'Balancetes de ' + E.ano, lugares: E.lugares, metas: E.metas, fixo: semBalancete,
      resumo: carregados.length + ' de 12 meses',
      antes: '<p class="suave pequeno" style="margin:-4px 0 10px">Um balancete por mês (período do dia 1º ao último dia do mês). ' +
        'O relatório usa do começo do trimestre do primeiro balancete até o último: faltando um mês no meio, ele fica vazio e o trimestre fica parcial.</p>' });
    // Tudo dentro de um "apres-raiz" novo a cada desenho: os cliques ficam ligados nele e somem com ele
    // (ligar no próprio `el`, que é o mesmo a cada tela, somaria um ouvinte a cada redesenho).
    el.innerHTML = '<div class="apres-raiz">' +
      '<a class="voltar nao-imprimir" href="#/empresa/' + encodeURIComponent(E.codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho nao-imprimir"><div class="titulos"><h1>📊 Relatório de apresentação</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + E.ano + (periodo ? ' · ' + T.esc(periodo) + ' · ' + carregados.length + ' balancete(s)' : ' · nenhum balancete ainda') + '</p></div>' +
      '<div class="linha-flex">' +
      (E.anos.length > 1 ? '<select class="apres-campo" id="apres-ano" title="Ano do relatório">' + E.anos.map((a) => '<option value="' + a + '"' + (a === E.ano ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>' : '') +
      raiz.TelaSubir.botao(chave) +
      (semBalancete ? '' : '<button type="button" class="botao" id="apres-excel" title="As mesmas abas da planilha modelo">⬇ Excel</button>' +
        '<button type="button" class="botao primario" id="apres-imprimir" title="Na janela de impressão, escolha a impressora ou “Salvar como PDF”">🖨 Imprimir / PDF</button>') +
      '</div></div>' +
      '<div id="apres-painel" class="nao-imprimir">' + painel + '</div>' +
      (semBalancete ? '<div class="cartao corpo nao-imprimir" style="margin-top:14px"><h3>Comece pelos balancetes</h3><p class="suave" style="line-height:1.55;margin:6px 0 0">' +
        'Carregue o balancete de cada mês no lugar dele, aqui em cima. Com eles o programa monta o <b>Resumo</b>, a <b>DRE mensal e trimestral</b>, ' +
        'o <b>balancete mensal e trimestral</b> (com AV % e AH %) e o <b>LALUR trimestral</b>, no desenho da planilha de apresentação.</p></div>' : conteudo()) +
      '</div><div id="apres-impressao" class="apres-impressao"></div>';
    ligar(el.querySelector('.apres-raiz'));
  }

  function avisos() {
    const rel = E.rel;
    const lista = rel.avisos.slice();
    if (rel.lalur.ajustesSemConta.length) lista.push(rel.lalur.ajustesSemConta.length + ' conta(s) da lista de ajustes do LALUR não aparecem nos balancetes (' + rel.lalur.ajustesSemConta.slice(0, 3).join(', ') + (rel.lalur.ajustesSemConta.length > 3 ? ', …' : '') + '): confira a lista na aba LALUR.');
    if (!rel.lalur.pat.noBalancete && rel.lalur.contaPAT) lista.push('A conta do PAT (' + rel.lalur.contaPAT + ') não aparece nos balancetes: confira na aba LALUR.');
    return lista.length ? '<div class="aviso ambar nao-imprimir" style="margin-top:12px"><span class="icone-aviso">⚠️</span><div>' + lista.map((a) => T.esc(a)).join('<br>') + '</div></div>' : '';
  }

  function conteudo() {
    return avisos() +
      '<div class="abas nao-imprimir" role="tablist">' + ABAS.map((a) => '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' + a.titulo + '</button>').join('') + '</div>' +
      '<div id="apres-meses">' + seletorMeses() + '</div>' +
      '<div class="apres-opcoes nao-imprimir">' + opcoesDaAba() + '</div>' +
      '<div class="apres-folha" id="apres-folha">' + secao(E.aba, {}) + '</div>';
  }

  function opcoesDaAba() {
    const avah = '<label class="caixa-opcao"><input type="checkbox" data-opcao="avah"' + (E.avah ? ' checked' : '') + '> AV % e AH %</label>';
    if (E.aba === 'dre-mensal' || E.aba === 'dre-trimestral') {
      return '<button type="button" class="botao pequeno" data-opcao="abrir-tudo">＋ Abrir todas as contas</button>' +
        '<button type="button" class="botao pequeno" data-opcao="fechar-tudo">－ Fechar todas</button>' + avah +
        '<span class="suave pequeno">Clique num subtotal para abrir ou fechar as contas dele. AV % sobre a receita líquida; AH % sobre o ' + (E.aba === 'dre-mensal' ? 'mês' : 'trimestre') + ' anterior.</span>';
    }
    if (E.aba === 'balancete-mensal' || E.aba === 'balancete-trimestral') {
      return '<span class="suave pequeno">Mostrar até o nível</span>' + [1, 2, 3, 4, 5].map((n) => '<button type="button" class="botao pequeno' + (E.nivel === n ? ' primario' : '') + '" data-nivel="' + n + '">' + n + '</button>').join('') +
        '<label class="caixa-opcao"><input type="checkbox" data-opcao="sem-zeradas"' + (E.semZeradas ? ' checked' : '') + '> Esconder contas zeradas</label>' + avah +
        '<span class="suave pequeno">' + (E.aba === 'balancete-mensal' ? 'Contas 1 e 2: saldo final do mês; 3, 4 e 5: movimento do mês.' : 'Contas 1 e 2: saldo no fim do trimestre; 3, 4 e 5: soma dos meses.') + ' AV % sobre a conta-mãe.</span>';
    }
    if (E.aba === 'lalur') {
      return '<button type="button" class="botao pequeno" data-opcao="editar-ajustes">✎ Lista de ajustes e conta do PAT</button>' +
        '<span class="suave pequeno">Apuração trimestral do lucro real. Os campos em azul da Parte B são preenchidos por você.</span>';
    }
    return '<span class="suave pequeno">Contas de 1º nível. No acumulado, ativo e passivo mostram o saldo do último mês escolhido; receitas, custos e despesas, a soma dos meses escolhidos.</span>';
  }

  // ------------------------------------------------------------------
  // Meses escolhidos (Dony, 18/09/2026: "escolher o período — eu não quero janeiro, fevereiro, março, eu quero
  // abril, maio, junho — com botões mês a mês; clicou, o mês aparece ou some da DRE"). Vale para as visões
  // mensais (Resumo, DRE mensal e balancete mensal), na tela, na impressão e no Excel. O acumulado passa a
  // somar só os meses escolhidos. AH % continua sobre o mês anterior de verdade.
  // E.selecao: null = todos os meses com balancete; senão, Set de competências.
  // ------------------------------------------------------------------
  const ABAS_MENSAIS = { resumo: true, 'dre-mensal': true, 'balancete-mensal': true };
  function mesesComBalancete() { return E.rel.meses.filter((m) => m.tem); }
  function mesesVisiveis() {
    const com = mesesComBalancete();
    if (!E.selecao) return com;
    const escolhidos = com.filter((m) => E.selecao.has(m.comp));
    return escolhidos.length ? escolhidos : com;
  }
  function indicesVisiveis() {
    const vis = new Set(mesesVisiveis().map((m) => m.comp));
    return E.rel.meses.map((m, k) => (vis.has(m.comp) ? k : -1)).filter((k) => k >= 0);
  }
  // "Jan–Ago", "Abr–Jun", "Jan, Mar, Jun" ou "5 meses".
  function rotuloSelecao(ms) {
    if (!ms.length) return '';
    const curto = (m) => m.rotulo.slice(0, 3);
    const seguidos = ms.every((m, i) => i === 0 || m.mes === ms[i - 1].mes + 1);
    if (seguidos) return ms.length === 1 ? ms[0].rotulo : curto(ms[0]) + '–' + curto(ms[ms.length - 1]);
    return ms.length <= 4 ? ms.map(curto).join(', ') : ms.length + ' meses';
  }
  const somaNos = (valores, ks) => { let s = 0, tem = false; ks.forEach((k) => { const v = valores[k]; if (v !== null && v !== undefined) { s += v; tem = true; } }); return tem ? s : null; };
  // DRE mensal só com os meses escolhidos e, no fim, o acumulado deles.
  function dreMensalVisivel() {
    const dre = E.rel.dre.mensal;
    const ks = indicesVisiveis();
    const rlAc = somaNos(dre.linhas.find((l) => l.id === 'receitaLiquida').valores, ks);
    return {
      colunas: ks.map((k) => dre.colunas[k]).concat([{ id: 'acumulado', rotulo: 'Acumulado ' + rotuloSelecao(ks.map((k) => E.rel.meses[k])), acumulado: true }]),
      linhas: dre.linhas.map((l) => {
        const ac = somaNos(l.valores, ks);
        return Object.assign({}, l, { valores: ks.map((k) => l.valores[k]).concat([ac]), av: ks.map((k) => l.av[k]).concat([ac === null || !rlAc ? null : ac / rlAc]), ah: ks.map((k) => l.ah[k]).concat([null]) });
      }),
    };
  }
  function balanceteMensalVisivel() {
    const tab = E.rel.mensal;
    const ks = indicesVisiveis();
    return { colunas: ks.map((k) => tab.colunas[k]),
      linhas: tab.linhas.map((l) => Object.assign({}, l, { valores: ks.map((k) => l.valores[k]), av: ks.map((k) => l.av[k]), ah: ks.map((k) => l.ah[k]) })) };
  }
  // Resumo: os meses escolhidos, o acumulado deles (ativo e passivo: saldo do último mês escolhido) e os trimestres.
  function resumoVisivel() {
    const r = E.rel.resumo;
    const ks = indicesVisiveis();
    const trimestres = r.colunas.map((c, i) => ({ c, i })).filter((x) => x.c.trimestre);
    return {
      colunas: ks.map((k) => r.colunas[k]).concat([{ id: 'acumulado', rotulo: rotuloSelecao(ks.map((k) => E.rel.meses[k])), acumulado: true }]).concat(trimestres.map((x) => x.c)),
      linhas: r.linhas.map((l) => {
        const vals = ks.map((k) => l.valores[k]);
        const ac = l.patrimonial ? (vals.length ? vals[vals.length - 1] : null) : somaNos(l.valores, ks);
        return Object.assign({}, l, { valores: vals.concat([ac]).concat(trimestres.map((x) => l.valores[x.i])) });
      }),
    };
  }
  // O painel dos meses (como o exemplo que o Dony mandou): atalhos, o ano e um botão por mês.
  function seletorMeses() {
    if (!ABAS_MENSAIS[E.aba]) return '';
    const com = mesesComBalancete();
    const vis = new Set(mesesVisiveis().map((m) => m.comp));
    const todos = !E.selecao || vis.size === com.length;
    const ultimos = (n) => !todos && vis.size === Math.min(n, com.length) && com.slice(-n).every((m) => vis.has(m.comp));
    const tri = (n) => com.filter((m) => m.trimestre === n);
    const eTri = (n) => { const ms = tri(n); return !todos && ms.length && vis.size === ms.length && ms.every((m) => vis.has(m.comp)); };
    const rapido = (id, texto, ativo, desligado) => '<button type="button" class="sm-rapido' + (ativo ? ' ativo' : '') + '" data-meses="' + id + '"' + (desligado ? ' disabled' : '') + '>' + texto + '</button>';
    const botoes = MESES_LONGOS.map((nome, i) => {
      const comp = E.ano + '-' + String(i + 1).padStart(2, '0') + '-01';
      const tem = com.some((m) => m.comp === comp);
      return '<button type="button" class="sm-mes' + (vis.has(comp) ? ' ativo' : '') + '" data-mes="' + comp + '"' + (tem ? '' : ' disabled title="Sem balancete de ' + nome.toLowerCase() + '"') +
        ' aria-pressed="' + vis.has(comp) + '">' + nome.slice(0, 3) + '</button>';
    }).join('');
    const escolhidos = mesesVisiveis();
    return '<div class="seletor-meses nao-imprimir"><div class="sm-topo"><span class="sm-rotulo">Meses</span>' +
      rapido('todos', 'Todos', todos) + rapido('ultimos-3', 'Últimos 3', ultimos(3), com.length <= 3) + rapido('ultimos-6', 'Últimos 6', ultimos(6), com.length <= 6) +
      '<span class="sm-separador"></span>' + [1, 2, 3, 4].map((n) => rapido('tri-' + n, n + 'T', eTri(n), !tri(n).length)).join('') +
      '<span class="sm-ano">' + E.ano + '</span></div><div class="sm-grade">' + botoes + '</div>' +
      '<p class="sm-dica">' + (todos ? 'Mostrando todos os ' + com.length + ' meses com balancete.' : 'Mostrando ' + escolhidos.length + ' de ' + com.length + ': ' + T.esc(rotuloSelecao(escolhidos)) + ' (o acumulado soma só esses).') +
      ' Clique num mês para ele aparecer ou sumir.</p></div>';
  }
  function mudarSelecao(qual) {
    const com = mesesComBalancete().map((m) => m.comp);
    if (qual === 'todos') { E.selecao = null; return; }
    if (qual === 'ultimos-3' || qual === 'ultimos-6') { const n = qual === 'ultimos-3' ? 3 : 6; E.selecao = com.length <= n ? null : new Set(com.slice(-n)); return; }
    if (/^tri-\d$/.test(qual)) { const n = Number(qual.slice(4)); E.selecao = new Set(mesesComBalancete().filter((m) => m.trimestre === n).map((m) => m.comp)); return; }
    // Um mês: aparece ou some (fica sempre pelo menos um).
    const atual = new Set(mesesVisiveis().map((m) => m.comp));
    if (atual.has(qual)) {
      if (atual.size === 1) { T.avisoRapido('Deixe pelo menos um mês na tela.', null, 3000); return; }
      atual.delete(qual);
    } else if (com.indexOf(qual) >= 0) atual.add(qual);
    E.selecao = atual.size === com.length ? null : atual;
  }

  // Uma seção do relatório (na tela, a aba; na impressão, uma depois da outra). op.impressao: todas as contas da DRE abertas?
  function secao(aba, op) {
    const rel = E.rel;
    if (aba === 'resumo') return secaoResumo();
    if (aba === 'dre-mensal') return secaoDre(dreMensalVisivel(), 'DRE CPC 51 mensal detalhada', op);
    if (aba === 'dre-trimestral') return secaoDre(rel.dre.trimestral, 'DRE CPC 51 trimestral detalhada', op);
    if (aba === 'balancete-mensal') return secaoBalancete(balanceteMensalVisivel(), 'Balancete analítico mensal');
    if (aba === 'balancete-trimestral') return secaoBalancete(rel.trimestral, 'Balancete analítico trimestral');
    if (aba === 'lalur') return secaoLalur(op);
    return '';
  }

  function tituloSecao(titulo, sub) {
    return '<div class="apres-titulo"><h2>' + T.esc(E.emp.nome) + ' — ' + T.esc(titulo) + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>';
  }

  // Cabeçalho das tabelas com períodos: com AV/AH, cada período ocupa 3 colunas (Valor, AV %, AH %).
  function cabecalhoPeriodos(fixas, colunas, avah) {
    if (!avah) {
      return '<thead><tr>' + fixas.map((f, i) => '<th class="' + (i === 0 ? 'fixa ' : '') + (f.cls || '') + '">' + f.titulo + '</th>').join('') +
        colunas.map((c) => '<th class="num per' + (c.falta ? ' falta' : '') + (c.cls ? ' ' + c.cls : '') + '">' + T.esc(c.rotulo) + (c.falta ? '<small>sem balancete</small>' : '') + '</th>').join('') + '</tr></thead>';
    }
    return '<thead><tr>' + fixas.map((f, i) => '<th rowspan="2" class="' + (i === 0 ? 'fixa ' : '') + (f.cls || '') + '">' + f.titulo + '</th>').join('') +
      colunas.map((c) => '<th colspan="3" class="per' + (c.falta ? ' falta' : '') + (c.cls ? ' ' + c.cls : '') + '">' + T.esc(c.rotulo) + (c.falta ? '<small>sem balancete</small>' : '') + '</th>').join('') +
      '</tr><tr class="sub">' + colunas.map(() => '<th class="num">Valor</th><th class="num pct">AV %</th><th class="num pct">AH %</th>').join('') + '</tr></thead>';
  }
  // colunas (opcional): a coluna do acumulado sai com fundo destacado.
  function celulasPeriodos(l, avah, colunas) {
    return l.valores.map((v, k) => {
      const extra = colunas && colunas[k] && colunas[k].acumulado ? ' acum' : '';
      return '<td class="num' + extra + '">' + dinheiro(v) + '</td>' + (avah ? '<td class="num pct' + extra + '">' + pct(l.av[k]) + '</td><td class="num pct' + extra + '">' + pct(l.ah[k]) + '</td>' : '');
    }).join('');
  }

  // ---------- Resumo
  function secaoResumo() {
    const r = resumoVisivel();
    const colunas = r.colunas.map((c) => Object.assign({}, c, { cls: c.acumulado ? 'acum' : c.trimestre ? 'tri' : '' }));
    const linhas = r.linhas.map((l) => '<tr class="nivel-1"><td class="fixa"><span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.titulo) + '</td>' +
      l.valores.map((v, k) => '<td class="num' + (colunas[k].cls ? ' ' + colunas[k].cls : '') + '">' + dinheiro(v) + '</td>').join('') + '</tr>').join('');
    const dre = dreMensalVisivel();
    const indicador = (id) => dre.linhas.find((l) => l.id === id);
    const iAcum = dre.colunas.findIndex((c) => c.acumulado); // o acumulado dos meses escolhidos, na última coluna
    const fichas = ['receitaLiquida', 'lucroBruto', 'ebitda', 'lucroOperacional', 'lucroLiquido'].map((id) => {
      const l = indicador(id);
      const total = l.valores[iAcum] || 0;
      const rl = indicador('receitaLiquida').valores[iAcum] || 0;
      return '<div class="apres-ficha"><span>' + T.esc(l.rotulo) + ' · ' + T.esc(colunas.find((c) => c.acumulado).rotulo) + '</span><b>' + dinheiro(total) + '</b>' +
        (id !== 'receitaLiquida' && rl ? '<small>' + pct(total / rl) + ' da receita líquida</small>' : '') + '</div>';
    }).join('');
    return tituloSecao('Resumo executivo', 'Contas de 1º nível, mês a mês, acumulado e por trimestre.') +
      '<div class="apres-fichas">' + fichas + '</div>' +
      '<div class="apres-caixa"><table class="apres"><thead><tr><th class="fixa">Conta</th>' +
      colunas.map((c) => '<th class="num per' + (c.cls ? ' ' + c.cls : '') + (c.falta ? ' falta' : '') + '">' + T.esc(c.rotulo) + '</th>').join('') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }

  // ---------- DRE
  function secaoDre(dre, titulo, op) {
    const avah = E.avah;
    const n = 1 + dre.colunas.length * (avah ? 3 : 1);
    let categoria = null;
    const SEM_FAIXA = { 'Subtotal CPC 51': true, Subtotal: true, Resultado: true };
    const corpo = dre.linhas.map((l) => {
      let faixa = '';
      if (l.categoria !== categoria) {
        categoria = l.categoria;
        if (!SEM_FAIXA[categoria]) faixa = '<tr class="cat"><td class="fixa">' + T.esc(categoria) + '</td><td colspan="' + (n - 1) + '"></td></tr>';
      }
      const aberto = (op && op.abrirTudo) || E.abertos.has(l.grupo || l.id);
      if (l.tipo === 'analitica') {
        if (!aberto) return faixa;
        return faixa + '<tr class="analitica" data-de="' + T.esc(l.grupo) + '"><td class="fixa"><span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.rotulo) + '</td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
      }
      if (l.tipo === 'grupo') {
        return faixa + '<tr class="grupo' + (l.semLinha ? ' sem-linha' : '') + '" data-grupo="' + T.esc(l.id) + '" title="' + (aberto ? 'Fechar' : 'Abrir') + ' as ' + l.filhas + ' conta(s)">' +
          '<td class="fixa"><span class="abre nao-imprimir">' + (aberto ? '▾' : '▸') + '</span>' + T.esc(l.rotulo) + (l.semLinha ? ' ⚠️' : '') + ' <small>' + l.filhas + '</small></td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
      }
      return faixa + '<tr class="total' + (l.destaque ? ' destaque' : '') + '"><td class="fixa">' + T.esc(l.rotulo) + '</td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
    }).join('');
    const colunas = dre.colunas.map((c) => Object.assign({}, c, { cls: c.acumulado ? 'acum' : '' }));
    const nota = E.rel.dre.naoMapeadas.length ? '<p class="apres-nota">⚠️ "Outras contas de resultado" reúne conta(s) de resultado que nenhuma linha do modelo pega: ' +
      E.rel.dre.naoMapeadas.map((x) => T.esc(x.conta + ' ' + x.titulo)).join('; ') + '. Diga em que linha ela(s) entra(m) para ficar certo na apresentação.</p>' : '';
    const fora = E.rel.dre.foraDaDre.length ? '<p class="apres-nota suave">Fora da DRE, como na planilha: ' + E.rel.dre.foraDaDre.length + ' conta(s) de compras e estoque (4.2), que somam zero no mês.</p>' : '';
    return tituloSecao(titulo, T.esc(E.ano) + ' · valores em R$ · receitas positivas, custos e despesas entre parênteses') +
      '<div class="apres-caixa"><table class="apres dre' + (avah ? ' com-avah' : '') + '">' + cabecalhoPeriodos([{ titulo: 'Linha / Conta analítica' }], colunas, avah) +
      '<tbody>' + corpo + '</tbody></table></div>' + nota + fora;
  }

  // ---------- Balancete mensal / trimestral
  function secaoBalancete(tab, titulo) {
    const avah = E.avah;
    const linhas = tab.linhas.filter((l) => l.nivel <= E.nivel && !(E.semZeradas && l.valores.every((v) => !v)));
    const corpo = linhas.map((l) => '<tr class="nivel-' + Math.min(l.nivel, 5) + (l.analitica ? ' analitica' : ' sintetica') + '"><td class="fixa" style="padding-left:' + (8 + (l.nivel - 1) * 14) + 'px">' +
      '<span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.titulo) + '</td>' + celulasPeriodos(l, avah) + '</tr>').join('');
    return tituloSecao(titulo, T.esc(E.ano) + ' · ' + linhas.length + ' de ' + tab.linhas.length + ' contas · saldos devedores positivos, credores entre parênteses') +
      '<div class="apres-caixa"><table class="apres balancete' + (avah ? ' com-avah' : '') + '">' + cabecalhoPeriodos([{ titulo: 'Conta' }], tab.colunas, avah) + '<tbody>' + corpo + '</tbody></table></div>';
  }

  // ---------- LALUR
  function tabelaSimples(fixas, colunas, linhas) {
    return '<div class="apres-caixa"><table class="apres simples"><thead><tr>' + fixas.map((f, i) => '<th class="' + (i === 0 ? 'fixa' : '') + '">' + f + '</th>').join('') +
      colunas.map((c) => '<th class="num per' + (c.cls ? ' ' + c.cls : '') + (c.falta ? ' falta' : '') + '">' + T.esc(c.rotulo) + '</th>').join('') + '</tr></thead><tbody>' +
      linhas.map((l) => '<tr class="' + (l.cls || '') + '">' + l.cab.map((x, i) => '<td class="' + (i === 0 ? 'fixa' : 'txt') + '">' + x + '</td>').join('') +
        l.valores.map((v, k) => '<td class="num' + (colunas[k].cls ? ' ' + colunas[k].cls : '') + '">' + dinheiro(v) + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }

  function secaoLalur(op) {
    const L = E.rel.lalur;
    const colA = L.parteA.colunas.map((c) => Object.assign({}, c, { cls: c.soma ? 'acum' : '' }));
    const parteA = tabelaSimples(['Linha', 'Bloco'], colA, L.parteA.linhas.map((l) => ({ cls: l.destaque ? 'total' : '', cab: [T.esc(l.rotulo), '<span class="suave">' + T.esc(l.bloco) + '</span>'], valores: l.valores })));
    const colAj = L.ajustes.colunas.map((c) => Object.assign({}, c, { cls: c.trimestre ? 'tri' : '' }));
    const ajustes = tabelaSimples(['Descrição', 'Conta', 'Tipo'], colAj, L.ajustes.linhas.map((a) => ({
      cab: [T.esc(a.titulo || '') + (a.noBalancete ? '' : ' <span class="rel-aviso">(não está nos balancetes)</span>') +
        (a.regra === 'aumento-credor' ? ' <small class="suave">· aumento do saldo credor</small>' : ''), '<span class="cod">' + T.esc(a.conta) + '</span>', a.tipo], valores: a.valores,
    })).concat([
      { cls: 'total', cab: ['Total das Adições', '', ''], valores: L.ajustes.adicoes },
      { cls: 'total', cab: ['Total das Exclusões', '', ''], valores: L.ajustes.exclusoes },
    ]));
    const colPat = L.pat.colunas.map((c) => Object.assign({}, c, { cls: c.lalur ? 'acum' : '' }));
    const pat = tabelaSimples(['Descrição', 'Linha'], colPat, L.pat.linhas.map((l) => ({ cab: [T.esc(l.rotulo), l.letra], valores: l.valores })));
    const editavel = !(op && op.impressao);
    const parteB = '<div class="apres-caixa"><table class="apres simples parte-b"><thead><tr><th class="fixa">Controle</th>' +
      L.parteB.colunas.map((c) => '<th class="num per">' + T.esc(c.rotulo) + '</th>').join('') + '<th>Observação</th></tr></thead><tbody>' +
      L.parteB.linhas.map((l) => '<tr class="' + (l.editavel ? 'editavel' : '') + '"><td class="fixa">' + T.esc(l.rotulo) + '</td>' +
        l.valores.map((v, k) => '<td class="num">' + (l.editavel && editavel
          ? '<input class="apres-campo valor" inputmode="decimal" data-parte-b="' + T.esc(L.parteB.colunas[k].id + '|' + l.campo) + '" value="' + (v ? U.formatarCentavos(Math.round(v)) : '') + '" placeholder="0,00">'
          : dinheiro(v)) + '</td>').join('') +
        '<td class="txt pequeno suave">' + T.esc(l.obs || '') + '</td></tr>').join('') + '</tbody></table></div>' +
      (editavel ? '<div class="linha-flex" style="margin-top:8px"><button type="button" class="botao primario pequeno" data-opcao="guardar-parte-b">💾 Guardar a Parte B</button>' +
        '<span class="suave pequeno">Os valores entram na Parte A na hora (compensação limitada a 30% e IR retido abatido do IRPJ).</span></div>' : '');
    const premissas = '<div class="apres-caixa"><table class="apres simples premissas"><thead><tr><th class="fixa">Tema</th><th>Premissa usada</th><th>Fonte / Base</th><th>Status</th><th>Comentário</th></tr></thead><tbody>' +
      L.premissas.map((p) => '<tr><td class="fixa">' + T.esc(p[0]) + '</td>' + p.slice(1).map((x) => '<td class="txt">' + T.esc(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    return tituloSecao('LALUR Parte A: apuração do lucro real e da CSLL', 'Apuração trimestral a partir da DRE; adições e exclusões pela lista de ajustes; incentivo PAT e Parte B.') + parteA +
      '<h3 class="apres-sub">Ajustes mensais e trimestrais <small>valor positivo = adição · valor negativo = exclusão</small></h3>' + ajustes +
      '<h3 class="apres-sub">Incentivo fiscal PAT <small>conta ' + T.esc(L.contaPAT || '—') + (L.pat.titulo ? ' · ' + T.esc(L.pat.titulo) : '') + ' · menor entre o incentivo potencial e 3,6% do IRPJ principal (15%)</small></h3>' + pat +
      '<h3 class="apres-sub">LALUR Parte B: controles fiscais <small>saldos de prejuízo fiscal e base negativa (zerados até você informar) e IR retido</small></h3>' + parteB +
      '<h3 class="apres-sub">Premissas, fontes e pontos de validação</h3>' + premissas;
  }

  // ------------------------------------------------------------------
  // Ações
  // ------------------------------------------------------------------
  function ligar(el) {
    const painel = el.querySelector('#apres-painel .arquivos-passo');
    raiz.TelaSubir.ligar(painel, E.codigo, E.lugares);
    raiz.TelaSubir.ligarBotao(el.querySelector('[data-abrir-arquivos]'));
    const sel = el.querySelector('#apres-ano');
    if (sel) sel.addEventListener('change', () => app().ir('#/empresa/' + encodeURIComponent(E.codigo) + '/apresentacao/' + sel.value));
    const bx = el.querySelector('#apres-excel');
    if (bx) bx.addEventListener('click', baixarExcel);
    const bi = el.querySelector('#apres-imprimir');
    if (bi) bi.addEventListener('click', imprimir);
    el.addEventListener('click', async (ev) => {
      const aba = ev.target.closest('[data-aba]');
      if (aba) { E.aba = aba.getAttribute('data-aba'); guardarPreferencias(); redesenharConteudo(el); return; }
      const nivel = ev.target.closest('[data-nivel]');
      if (nivel) { E.nivel = Number(nivel.getAttribute('data-nivel')); guardarPreferencias(); redesenharConteudo(el); return; }
      // Painel dos meses: um mês aparece ou some; os atalhos escolhem vários de uma vez.
      const mes = ev.target.closest('button[data-mes], button[data-meses]');
      if (mes && !mes.disabled) { mudarSelecao(mes.getAttribute('data-mes') || mes.getAttribute('data-meses')); redesenharConteudo(el); return; }
      const g = ev.target.closest('tr.grupo[data-grupo]');
      if (g) { const id = g.getAttribute('data-grupo'); if (E.abertos.has(id)) E.abertos.delete(id); else E.abertos.add(id); redesenharFolha(el); return; }
      const o = ev.target.closest('button[data-opcao]');
      if (!o) return;
      const qual = o.getAttribute('data-opcao');
      if (qual === 'abrir-tudo') { E.rel.dre.mensal.linhas.filter((l) => l.tipo === 'grupo').forEach((l) => E.abertos.add(l.id)); redesenharFolha(el); }
      else if (qual === 'fechar-tudo') { E.abertos.clear(); redesenharFolha(el); }
      else if (qual === 'guardar-parte-b') await guardarParteB(el);
      else if (qual === 'editar-ajustes') await editarAjustes();
    });
    el.addEventListener('change', (ev) => {
      const c = ev.target.closest('input[data-opcao]');
      if (!c) return;
      if (c.getAttribute('data-opcao') === 'avah') E.avah = c.checked;
      if (c.getAttribute('data-opcao') === 'sem-zeradas') E.semZeradas = c.checked;
      guardarPreferencias();
      redesenharFolha(el);
    });
  }

  function redesenharConteudo(el) {
    el.querySelectorAll('.abas [data-aba]').forEach((b) => b.classList.toggle('ativa', b.getAttribute('data-aba') === E.aba));
    const meses = el.querySelector('#apres-meses');
    if (meses) meses.innerHTML = seletorMeses();
    const op = el.querySelector('.apres-opcoes');
    if (op) op.innerHTML = opcoesDaAba();
    redesenharFolha(el);
  }
  function redesenharFolha(el) {
    const f = el.querySelector('#apres-folha');
    if (!f) return;
    const caixa = f.querySelector('.apres-caixa');
    const rolagem = caixa ? { x: caixa.scrollLeft, y: caixa.scrollTop } : null;
    f.innerHTML = secao(E.aba, {});
    const nova = f.querySelector('.apres-caixa');
    if (nova && rolagem) { nova.scrollLeft = rolagem.x; nova.scrollTop = rolagem.y; }
  }

  async function guardarConfig(novo, acao, detalhe) {
    const arm = app().armazenamento;
    const reg = Object.assign({}, E.registro || {}, { id: idRegistro(E.codigo, E.ano), codigo: E.codigo, tipo: 'apresentacao', competencia: E.ano + '-01-01',
      situacao: 'configurada', config: novo });
    E.registro = await arm.salvarConciliacao(reg);
    await arm.registrarNoLog({ codigo: E.codigo, acao, alvo: 'apresentacao/' + E.ano, detalhe: detalhe || '' });
  }

  async function guardarParteB(el) {
    const parteB = JSON.parse(JSON.stringify(E.config.parteB || {}));
    let invalido = null;
    el.querySelectorAll('input[data-parte-b]').forEach((inp) => {
      const [trimestre, campo] = inp.getAttribute('data-parte-b').split('|');
      const txt = inp.value.trim();
      const n = txt ? U.paraNumero(txt) : 0;
      if (n === null) { invalido = inp; return; }
      if (!parteB[trimestre]) parteB[trimestre] = {};
      parteB[trimestre][campo] = U.centavos(n);
    });
    if (invalido) { invalido.focus(); T.avisoRapido('Valor que não é número: "' + invalido.value + '".', 'erro'); return; }
    try {
      await guardarConfig(Object.assign({}, E.config, { parteB }), 'apresentacao-parte-b', 'LALUR Parte B ' + E.ano);
      T.avisoRapido('Parte B guardada: a Parte A foi recalculada.', 'ok', 5000);
      app().mostrarRota();
    } catch (e) { T.avisoRapido('Não foi possível guardar: ' + T.mensagemDeErro(e), 'erro'); }
  }

  // Lista de ajustes do LALUR e conta do PAT (por empresa e ano).
  async function editarAjustes() {
    const L = E.rel.lalur;
    const atuais = Array.isArray(E.config.ajustes) ? E.config.ajustes : motor().AJUSTES_MODELO;
    const contas = E.rel.contas;
    const titulo = (c) => { const x = contas.find((k) => k.conta === c); return x ? x.titulo : ''; };
    const linha = (a) => '<tr><td><input class="apres-campo" list="apres-contas" data-aj="conta" value="' + T.esc(a.conta || '') + '" placeholder="conta" style="width:150px"></td>' +
      '<td class="pequeno suave" data-aj="titulo">' + T.esc(titulo(a.conta) || (a.conta ? 'não está nos balancetes' : '')) + '</td>' +
      '<td><select class="apres-campo" data-aj="tipo"><option value="adicao"' + (a.tipo !== 'exclusao' ? ' selected' : '') + '>Adição</option><option value="exclusao"' + (a.tipo === 'exclusao' ? ' selected' : '') + '>Exclusão</option></select></td>' +
      '<td><select class="apres-campo" data-aj="regra">' + Object.keys(REGRAS).map((k) => '<option value="' + k + '"' + ((a.regra || 'movimento') === k ? ' selected' : '') + '>' + REGRAS[k] + '</option>').join('') + '</select></td>' +
      '<td><button type="button" class="botao pequeno perigo" data-aj="tirar" title="Tirar da lista">✕</button></td></tr>';
    const corpo = '<p class="suave pequeno" style="margin:0 0 8px;line-height:1.5">As contas que entram nas adições e exclusões do LALUR. <b>Movimento do mês</b>: débitos − créditos da conta ' +
      '(positivo = adição, negativo = exclusão — a regra dinâmica da planilha). <b>Aumento do saldo credor</b>: exclusão do quanto o saldo credor da conta aumentou no mês (ex.: pagamento de aluguel no IFRS 16).</p>' +
      '<datalist id="apres-contas">' + contas.filter((c) => c.analitica).map((c) => '<option value="' + T.esc(c.conta) + '">' + T.esc(c.titulo) + '</option>').join('') + '</datalist>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Conta</th><th>Título no balancete</th><th>Tipo</th><th>Regra</th><th></th></tr></thead><tbody id="apres-aj-linhas">' +
      atuais.map(linha).join('') + '</tbody></table></div>' +
      '<div class="linha-flex" style="margin-top:8px"><button type="button" class="botao pequeno" data-aj="mais">＋ Adicionar conta</button>' +
      '<button type="button" class="botao pequeno" data-aj="modelo">Voltar para a lista do modelo</button></div>' +
      '<div style="margin-top:14px"><label class="pequeno"><b>Conta do PAT</b> (despesa elegível ao incentivo)<br>' +
      '<input class="apres-campo" list="apres-contas" id="apres-conta-pat" value="' + T.esc(L.contaPAT || '') + '" style="width:190px"> <span class="suave" id="apres-titulo-pat">' + T.esc(titulo(L.contaPAT)) + '</span></label></div>';
    const res = await T.janela({
      titulo: 'LALUR · lista de ajustes e conta do PAT · ' + E.ano, larga: true, corpo,
      aoAbrir: (j) => {
        const tb = j.querySelector('#apres-aj-linhas');
        j.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-aj]');
          if (!b || b.tagName !== 'BUTTON') return;
          const q = b.getAttribute('data-aj');
          if (q === 'tirar') b.closest('tr').remove();
          if (q === 'mais') { tb.insertAdjacentHTML('beforeend', linha({ conta: '', tipo: 'adicao', regra: 'movimento' })); tb.lastElementChild.querySelector('input').focus(); }
          if (q === 'modelo') tb.innerHTML = motor().AJUSTES_MODELO.map(linha).join('');
        });
        j.addEventListener('input', (ev) => {
          const inp = ev.target.closest('input[data-aj="conta"]');
          if (inp) { const t = inp.closest('tr').querySelector('[data-aj="titulo"]'); t.textContent = titulo(inp.value.trim()) || (inp.value.trim() ? 'não está nos balancetes' : ''); }
          if (ev.target.id === 'apres-conta-pat') j.querySelector('#apres-titulo-pat').textContent = titulo(ev.target.value.trim());
        });
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar', tipo: 'primario', antes: (j) => {
        const ajustes = Array.from(j.querySelectorAll('#apres-aj-linhas tr')).map((tr) => ({
          conta: tr.querySelector('[data-aj="conta"]').value.trim(), tipo: tr.querySelector('[data-aj="tipo"]').value, regra: tr.querySelector('[data-aj="regra"]').value,
        })).filter((a) => a.conta);
        return { ajustes, contaPAT: j.querySelector('#apres-conta-pat').value.trim() };
      } }],
    });
    if (!res) return;
    try {
      await guardarConfig(Object.assign({}, E.config, res), 'apresentacao-ajustes', res.ajustes.length + ' conta(s) de ajuste · PAT ' + (res.contaPAT || '—'));
      T.avisoRapido('Lista de ajustes guardada: o LALUR foi recalculado.', 'ok', 5000);
      app().mostrarRota();
    } catch (e) { T.avisoRapido('Não foi possível guardar: ' + T.mensagemDeErro(e), 'erro'); }
  }

  // ------------------------------------------------------------------
  // Imprimir: escolhe as partes; cada uma começa numa folha nova (deitada).
  // ------------------------------------------------------------------
  async function imprimir() {
    const escolha = await T.janela({
      titulo: 'Imprimir ou salvar em PDF',
      corpo: '<p class="suave pequeno" style="margin:0 0 8px">Escolha as partes. Cada uma começa numa folha nova, deitada. O balancete sai até o nível e com as opções que estão na tela.</p>' +
        ABAS.map((a) => '<label class="item-aba"><input type="checkbox" value="' + a.id + '"' + (/^balancete/.test(a.id) ? '' : ' checked') + '> ' + a.titulo + '</label>').join('') +
        '<label class="item-aba" style="margin-top:8px"><input type="checkbox" id="apres-imp-abrir" checked> DRE com todas as contas analíticas abertas</label>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: '🖨 Imprimir', tipo: 'primario', antes: (j) => {
        const partes = Array.from(j.querySelectorAll('input[type=checkbox][value]:checked')).map((x) => x.value);
        return partes.length ? { partes, abrirTudo: j.querySelector('#apres-imp-abrir').checked } : false;
      } }],
    });
    if (!escolha) return;
    const alvo = document.getElementById('apres-impressao');
    const carregados = E.rel.meses.filter((m) => m.tem);
    alvo.innerHTML = '<div class="apres-capa"><div class="rel-marca"><span class="selo-marca">S</span> ' + T.esc(app().config.programa) + '</div>' +
      '<h1>Relatório de apresentação · ' + E.ano + '</h1><p>' + T.esc(E.emp.nome) + (E.emp.cnpj ? ' · CNPJ ' + T.esc(U.formatarCnpj(E.emp.cnpj)) : '') + '</p>' +
      '<p class="suave">' + (carregados.length ? T.esc(carregados[0].rotulo + ' a ' + carregados[carregados.length - 1].rotulo) + ' · ' : '') +
      (E.selecao ? 'visões mensais com os meses escolhidos: ' + T.esc(rotuloSelecao(mesesVisiveis())) + ' · ' : '') +
      'emitido por ' + T.esc(app().usuario.nome || '') + ' em ' + U.dataHoraLocal(U.agoraISO()) + '</p></div>' +
      escolha.partes.map((p) => '<section class="apres-parte">' + secao(p, { impressao: true, abrirTudo: escolha.abrirTudo }) + '</section>').join('');
    document.body.classList.add('imprimindo-apresentacao');
    const antes = document.title;
    document.title = 'Apresentação ' + E.codigo + ' ' + E.emp.nome + ' ' + E.ano;
    const fim = () => { document.body.classList.remove('imprimindo-apresentacao'); alvo.innerHTML = ''; document.title = antes; raiz.removeEventListener('afterprint', fim); };
    raiz.addEventListener('afterprint', fim);
    setTimeout(() => raiz.print(), 60);
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'apresentacao-impressa', alvo: 'apresentacao/' + E.ano, detalhe: escolha.partes.join(', ') }).catch(() => {});
  }

  // ------------------------------------------------------------------
  // Excel com as mesmas abas da planilha modelo (valores; números com o formato da planilha).
  // ------------------------------------------------------------------
  function baixarExcel() {
    const X = raiz.XLSX;
    const rel = E.rel;
    const wb = X.utils.book_new();
    const FMT_V = '#,##0.00;[Red]\\(#,##0.00\\);\\-', FMT_P = '0.0%;[Red]\\(0.0%\\);\\-';
    const R = (c) => (c === null || c === undefined || !isFinite(c) ? '' : Math.round(c) / 100);
    const P = (x) => (x === null || x === undefined || !isFinite(x) ? '' : x);
    const nome = E.emp.nome;
    // linhas: [[...]], fmt(linha, coluna) -> formato ou null
    function folha(titulo, linhas, larguras, fmt, nomeAba) {
      const ws = X.utils.aoa_to_sheet(linhas);
      ws['!cols'] = larguras.map((w) => ({ wch: w }));
      const f = X.utils.decode_range(ws['!ref'] || 'A1');
      for (let r = 0; r <= f.e.r; r++) for (let c = 0; c <= f.e.c; c++) {
        const cel = ws[X.utils.encode_cell({ r, c })];
        if (!cel || cel.t !== 'n') continue;
        const z = fmt(r, c);
        if (z) cel.z = z;
      }
      X.utils.book_append_sheet(wb, ws, nomeAba || titulo);
    }
    const tituloAba = (t, sub) => [[nome + ' - ' + t], [sub || ''], []];
    // Tabelas com Valor / AV % / AH % por período.
    function comPeriodos(t, sub, fixasCab, colunas, linhas, fixasDe, nomeAba) {
      const n = fixasCab.length;
      const cab1 = fixasCab.map(() => '').concat(...colunas.map((c) => [c.rotulo, '', '']));
      const cab2 = fixasCab.concat(...colunas.map(() => ['Valor', 'AV %', 'AH %']));
      const dados = linhas.map((l) => fixasDe(l).concat(...l.valores.map((v, k) => [R(v), P(l.av[k]), P(l.ah[k])])));
      const aoa = tituloAba(t, sub).concat([cab1, cab2], dados);
      folha(t, aoa, fixasCab.map((f, i) => (i === 1 ? 44 : 16)).concat(...colunas.map(() => [15, 8, 8])), (r, c) => (r < 5 || c < n ? null : ((c - n) % 3 === 0 ? FMT_V : FMT_P)), nomeAba);
    }
    // Resumo (visões mensais com os meses escolhidos na tela)
    const res = resumoVisivel();
    const escolha = E.selecao ? ' · meses escolhidos: ' + rotuloSelecao(mesesVisiveis()) : '';
    folha('Resumo', tituloAba('Resumo executivo das contas de 1º nível', escolha.slice(3)).concat([['Conta', 'Título'].concat(res.colunas.map((c) => c.rotulo))],
      res.linhas.map((l) => [l.conta, l.titulo].concat(l.valores.map(R)))), [8, 30].concat(res.colunas.map(() => 15)), (r, c) => (r > 3 && c > 1 ? FMT_V : null));
    // DRE
    const dreLinhas = (dre) => dre.linhas;
    const dreFixas = (l) => [l.categoria, l.rotulo, l.conta || '', l.tipo === 'analitica' ? 'Analítica' : 'Total / Subtotal'];
    const dreMes = dreMensalVisivel();
    comPeriodos('DRE CPC 51 Mensal Detalhada', E.ano + ' · AV % sobre a receita líquida · AH % sobre o mês anterior' + escolha, ['Categoria CPC 51', 'Linha / Conta Analítica', 'Conta Contábil', 'Tipo'],
      dreMes.colunas, dreLinhas(dreMes), dreFixas, 'DRE mensal');
    comPeriodos('DRE CPC 51 Trimestral Detalhada', E.ano + ' · AV % sobre a receita líquida · AH % sobre o trimestre anterior', ['Categoria CPC 51', 'Linha / Conta Analítica', 'Conta Contábil', 'Tipo'],
      rel.dre.trimestral.colunas, dreLinhas(rel.dre.trimestral), dreFixas, 'DRE trimestral');
    // Balancetes
    const balFixas = (l) => [l.conta, l.reduzido, l.titulo, l.nivel, l.pai];
    const balMes = balanceteMensalVisivel();
    comPeriodos('Balancete Analítico Mensal com AV e AH', 'Contas 1 e 2: saldo final · 3, 4 e 5: movimento do mês · AV % sobre a conta-mãe' + escolha, ['Conta', 'Red.', 'Título da Conta', 'Nível', 'Conta Pai'],
      balMes.colunas, balMes.linhas, balFixas, 'Mensal');
    comPeriodos('Análise Trimestral', 'Contas 1 e 2: saldo final do trimestre · 3, 4 e 5: soma dos meses', ['Conta', 'Red.', 'Título da Conta', 'Nível', 'Conta Pai'],
      rel.trimestral.colunas, rel.trimestral.linhas, balFixas, 'Trimestral');
    // LALUR
    const L = rel.lalur;
    folha('LALUR Parte A', tituloAba('LALUR Parte A: Apuração Lucro Real e CS', 'Apuração trimestral construída a partir da DRE').concat([['Bloco', 'Linha'].concat(L.parteA.colunas.map((c) => c.rotulo))],
      L.parteA.linhas.map((l) => [l.bloco, l.rotulo].concat(l.valores.map(R)))), [18, 40].concat(L.parteA.colunas.map(() => 16)), (r, c) => (r > 3 && c > 1 ? FMT_V : null), 'LALUR_Parte_A');
    folha('LALUR Ajustes', tituloAba('LALUR: Ajustes Mensais e Trimestrais', 'Valor positivo = Adição | Valor negativo = Exclusão').concat([['Tipo', 'Conta', 'Descrição'].concat(L.ajustes.colunas.map((c) => c.rotulo))],
      L.ajustes.linhas.map((a) => [a.tipo, a.conta, a.titulo].concat(a.valores.map(R))), [[]],
      [['', '', 'Total das Adições'].concat(L.ajustes.adicoes.map(R)), ['', '', 'Total das Exclusões'].concat(L.ajustes.exclusoes.map(R))]),
    [10, 18, 40].concat(L.ajustes.colunas.map(() => 14)), (r, c) => (r > 3 && c > 2 ? FMT_V : null), 'LALUR_Ajustes');
    folha('LALUR PAT', tituloAba('Incentivo Fiscal PAT', 'Menor entre incentivo potencial e limite de 3,6% sobre IRPJ principal (15%)').concat([['Linha', 'Descrição'].concat(L.pat.colunas.map((c) => c.rotulo))],
      L.pat.linhas.map((l) => [l.letra, l.rotulo].concat(l.valores.map(R)))), [6, 52].concat(L.pat.colunas.map(() => 14)), (r, c) => (r > 3 && c > 1 ? FMT_V : null), 'LALUR_PAT');
    folha('LALUR Parte B', tituloAba('LALUR Parte B: Controles fiscais', 'Saldos informados por quem usa (zerados por padrão)').concat([['Controle'].concat(L.parteB.colunas.map((c) => c.rotulo), ['Observação'])],
      L.parteB.linhas.map((l) => [l.rotulo].concat(l.valores.map(R), [l.obs || '']))), [44].concat(L.parteB.colunas.map(() => 14), [70]), (r, c) => (r > 3 && c > 0 ? FMT_V : null), 'LALUR_Parte_B');
    folha('LALUR Premissas', tituloAba('LALUR: Premissas, fontes e pontos de validação').concat([['Tema', 'Premissa usada', 'Fonte / Base', 'Status', 'Comentário']], L.premissas),
      [22, 70, 40, 18, 60], () => null, 'LALUR_Premissas');
    // Base normalizada
    folha('Base normalizada', [['Mês', 'Conta', 'Red.', 'Título da Conta', 'Saldo Ant.', 'Débitos', 'Créditos', 'Saldo Atual', 'Valor Usado', 'Critério']].concat(
      rel.base.map((b) => [b.mes, b.conta, b.reduzido, b.titulo, R(b.saldoAnterior), R(b.debitos), R(b.creditos), R(b.saldoAtual), R(b.valor), b.criterio])),
    [8, 18, 7, 40, 15, 15, 15, 15, 15, 16], (r, c) => (r > 0 && c >= 4 && c <= 8 ? FMT_V : null), 'Base_Normalizada');
    const bytes = X.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    const arquivo = U.nomeSeguro('Apresentação ' + E.codigo + ' ' + E.emp.nome + ' ' + E.ano) + '.xlsx';
    T.baixar(new Uint8Array(bytes), arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    T.avisoRapido('Excel baixado: ' + arquivo + ' (pasta Downloads).', 'ok', 5000);
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'apresentacao-excel', alvo: 'apresentacao/' + E.ano, detalhe: arquivo }).catch(() => {});
  }

  raiz.TelaApresentacao = { mostrar };
})(self);
