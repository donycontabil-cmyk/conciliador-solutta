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
 *  - Adições e exclusões do LALUR: quem usa marca cada conta na própria DRE ou no balancete (botão
 *    "✎ Marcar adições e exclusões do LALUR"); a lista começa vazia (Dony, 18/09/2026).
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
    aba: 'dre-mensal', avah: true, nivel: 5, semZeradas: false, abertos: new Set(), selecao: null, marcarLalur: false, balancetes: [], fila: null };
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
    Object.assign(E, { codigo, ano: anoEscolhido, emp, metas, lugares, registro, balancetes, config: (registro && registro.config) || {} });
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
    return '<div id="apres-avisos">' + avisos() + '</div>' +
      '<div class="abas nao-imprimir" role="tablist">' + ABAS.map((a) => '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' + a.titulo + '</button>').join('') + '</div>' +
      '<div id="apres-meses">' + seletorMeses() + '</div>' +
      '<div class="apres-opcoes nao-imprimir">' + opcoesDaAba() + '</div>' +
      '<div class="apres-folha" id="apres-folha">' + secao(E.aba, {}) + '</div>';
  }

  function opcoesDaAba() {
    const avah = '<label class="caixa-opcao"><input type="checkbox" data-opcao="avah"' + (E.avah ? ' checked' : '') + '> AV % e AH %</label>';
    const marcar = '<label class="caixa-opcao lalur-opcao' + (E.marcarLalur ? ' ligada' : '') + '" title="Mostra, em cada conta, os botões para marcar adição ou exclusão do LALUR">' +
      '<input type="checkbox" data-opcao="marcar-lalur"' + (E.marcarLalur ? ' checked' : '') + '> ✎ Marcar adições e exclusões do LALUR</label>';
    const ajudaMarcar = '<span class="suave pequeno"><b>Marcando o LALUR:</b> clique em <b>+ Adição</b> ou <b>− Exclusão</b> na conta; clique de novo para tirar. ' +
      'Conta de ativo ou passivo só tem exclusão, pelo aumento do saldo credor (a regra da planilha). ' + ajustesAtuais().length + ' conta(s) marcada(s).</span>';
    if (E.aba === 'dre-mensal' || E.aba === 'dre-trimestral') {
      return '<button type="button" class="botao pequeno" data-opcao="abrir-tudo">＋ Abrir todas as contas</button>' +
        '<button type="button" class="botao pequeno" data-opcao="fechar-tudo">－ Fechar todas</button>' + avah + marcar +
        (E.marcarLalur ? ajudaMarcar : '<span class="suave pequeno">Clique num subtotal para abrir ou fechar as contas dele. AV % sobre a receita líquida; AH % sobre o ' + (E.aba === 'dre-mensal' ? 'mês' : 'trimestre') + ' anterior.</span>');
    }
    if (E.aba === 'balancete-mensal' || E.aba === 'balancete-trimestral') {
      return '<span class="suave pequeno">Mostrar até o nível</span>' + [1, 2, 3, 4, 5].map((n) => '<button type="button" class="botao pequeno' + (E.nivel === n ? ' primario' : '') + '" data-nivel="' + n + '">' + n + '</button>').join('') +
        '<label class="caixa-opcao"><input type="checkbox" data-opcao="sem-zeradas"' + (E.semZeradas ? ' checked' : '') + '> Esconder contas zeradas</label>' + avah + marcar +
        (E.marcarLalur ? ajudaMarcar : '<span class="suave pequeno">' + (E.aba === 'balancete-mensal' ? 'Contas 1 e 2: saldo final do mês; 3, 4 e 5: movimento do mês.' : 'Contas 1 e 2: saldo no fim do trimestre; 3, 4 e 5: soma dos meses.') + ' AV % sobre a conta-mãe.</span>');
    }
    if (E.aba === 'lalur') {
      return '<button type="button" class="botao pequeno" data-opcao="editar-ajustes">✎ Lista de ajustes e conta do PAT</button>' +
        '<span class="suave pequeno">Apuração trimestral do lucro real. As adições e exclusões são as contas que você marca na DRE ou no balancete. Os campos em azul da Parte B são preenchidos por você.</span>';
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
    const marcadas = new Set(ajustesAtuais().map((a) => a.conta));
    const noLalur = {};
    dre.linhas.forEach((l) => { if (l.tipo === 'analitica' && marcadas.has(l.conta)) noLalur[l.grupo] = (noLalur[l.grupo] || 0) + 1; });
    const corpo = dre.linhas.map((l) => {
      let faixa = '';
      if (l.categoria !== categoria) {
        categoria = l.categoria;
        if (!SEM_FAIXA[categoria]) faixa = '<tr class="cat"><td class="fixa">' + T.esc(categoria) + '</td><td colspan="' + (n - 1) + '"></td></tr>';
      }
      const aberto = (op && op.abrirTudo) || E.abertos.has(l.grupo || l.id);
      if (l.tipo === 'analitica') {
        if (!aberto) return faixa;
        return faixa + '<tr class="analitica" data-de="' + T.esc(l.grupo) + '"><td class="fixa">' + marcaLalur(l.conta, false) + '<span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.rotulo) + '</td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
      }
      if (l.tipo === 'grupo') {
        return faixa + '<tr class="grupo' + (l.semLinha ? ' sem-linha' : '') + '" data-grupo="' + T.esc(l.id) + '" title="' + (aberto ? 'Fechar' : 'Abrir') + ' as ' + l.filhas + ' conta(s)">' +
          '<td class="fixa"><span class="abre nao-imprimir">' + (aberto ? '▾' : '▸') + '</span>' + T.esc(l.rotulo) + (l.semLinha ? ' ⚠️' : '') + ' <small>' + l.filhas + '</small>' +
          (noLalur[l.id] ? '<small class="lalur-conta nao-imprimir" title="Contas deste subtotal marcadas no LALUR">· ' + noLalur[l.id] + ' no LALUR</small>' : '') + '</td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
      }
      return faixa + '<tr class="total' + (l.destaque ? ' destaque' : '') + '"><td class="fixa">' + T.esc(l.rotulo) + '</td>' + celulasPeriodos(l, avah, dre.colunas) + '</tr>';
    }).join('');
    const colunas = dre.colunas.map((c) => Object.assign({}, c, { cls: c.acumulado ? 'acum' : '' }));
    const nota = E.rel.dre.naoMapeadas.length ? '<p class="apres-nota">⚠️ "Outras contas de resultado" reúne conta(s) de resultado que nenhuma linha do modelo pega: ' +
      E.rel.dre.naoMapeadas.map((x) => T.esc(x.conta + ' ' + x.titulo)).join('; ') + '. Diga em que linha ela(s) entra(m) para ficar certo na apresentação.</p>' : '';
    const fora = E.rel.dre.foraDaDre.length ? '<p class="apres-nota suave">Fora da DRE, como na planilha: ' + E.rel.dre.foraDaDre.length + ' conta(s) de compras e estoque (4.2), que somam zero no mês.</p>' : '';
    return tituloSecao(titulo, T.esc(E.ano) + ' · valores em R$ · receitas positivas, custos e despesas entre parênteses') +
      '<div class="apres-caixa"><table class="apres dre' + (avah ? ' com-avah' : '') + (E.marcarLalur ? ' marcando' : '') + '">' + cabecalhoPeriodos([{ titulo: 'Linha / Conta analítica' }], colunas, avah) +
      '<tbody>' + corpo + '</tbody></table></div>' + nota + fora;
  }

  // ---------- Balancete mensal / trimestral
  function secaoBalancete(tab, titulo) {
    const avah = E.avah;
    const linhas = tab.linhas.filter((l) => l.nivel <= E.nivel && !(E.semZeradas && l.valores.every((v) => !v)));
    const corpo = linhas.map((l) => '<tr class="nivel-' + Math.min(l.nivel, 5) + (l.analitica ? ' analitica' : ' sintetica') + '"><td class="fixa" style="padding-left:' + (8 + (l.nivel - 1) * 14) + 'px">' +
      (l.analitica ? marcaLalur(l.conta, l.patrimonial) : '') + '<span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.titulo) + '</td>' + celulasPeriodos(l, avah) + '</tr>').join('');
    return tituloSecao(titulo, T.esc(E.ano) + ' · ' + linhas.length + ' de ' + tab.linhas.length + ' contas · saldos devedores positivos, credores entre parênteses') +
      '<div class="apres-caixa"><table class="apres balancete' + (avah ? ' com-avah' : '') + (E.marcarLalur ? ' marcando' : '') + '">' + cabecalhoPeriodos([{ titulo: 'Conta' }], tab.colunas, avah) + '<tbody>' + corpo + '</tbody></table></div>';
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
    const editavel = !(op && op.impressao);
    const ajustes = (L.ajustes.linhas.length ? '' : '<p class="apres-nota nao-imprimir">Nenhuma conta marcada ainda. Vá na <b>DRE</b> ou no <b>balancete</b>, ligue ' +
      '<b>✎ Marcar adições e exclusões do LALUR</b> e clique em <b>+ Adição</b> ou <b>− Exclusão</b> nas contas.</p>') +
      tabelaSimples(['Descrição', 'Conta', 'Tipo'], colAj, L.ajustes.linhas.map((a) => ({
        cab: [T.esc(a.titulo || '') + (a.noBalancete ? '' : ' <span class="rel-aviso">(não está nos balancetes)</span>') +
          (a.regra === 'aumento-credor' ? ' <small class="suave">· aumento do saldo credor</small>' : '') +
          (a.contraMarca.length ? ' <small class="lalur-contra nao-imprimir" title="Regra dinâmica da planilha: o movimento do trimestre foi do lado contrário ao marcado">⚠ no ' +
            T.esc(a.contraMarca.join(', ')) + ' entrou como ' + (a.tipo === 'Exclusão' ? 'adição' : 'exclusão') + '</small>' : ''),
        '<span class="cod">' + T.esc(a.conta) + '</span>',
        a.tipo + (editavel ? ' <button type="button" class="lalur-tirar nao-imprimir" data-lalur-tirar="' + T.esc(a.conta) + '" title="Tirar esta conta do LALUR">✕</button>' : '')], valores: a.valores,
      })).concat([
      { cls: 'total', cab: ['Total das Adições', '', ''], valores: L.ajustes.adicoes },
      { cls: 'total', cab: ['Total das Exclusões', '', ''], valores: L.ajustes.exclusoes },
    ]));
    const colPat = L.pat.colunas.map((c) => Object.assign({}, c, { cls: c.lalur ? 'acum' : '' }));
    const pat = tabelaSimples(['Descrição', 'Linha'], colPat, L.pat.linhas.map((l) => ({ cab: [T.esc(l.rotulo), l.letra], valores: l.valores })));
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
      '<h3 class="apres-sub">Ajustes mensais e trimestrais <small>as contas marcadas na DRE ou no balancete · valor positivo = adição · valor negativo = exclusão</small></h3>' + ajustes +
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
      const lb = ev.target.closest('button[data-lalur]');
      if (lb) { marcarConta(el, lb.getAttribute('data-conta'), lb.getAttribute('data-lalur')); return; }
      const lt = ev.target.closest('button[data-lalur-tirar]');
      if (lt) { marcarConta(el, lt.getAttribute('data-lalur-tirar'), null); return; }
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
      if (c.getAttribute('data-opcao') === 'marcar-lalur') {
        // Ligado na DRE, abre todos os subtotais para as contas aparecerem.
        E.marcarLalur = c.checked;
        if (E.marcarLalur && /^dre/.test(E.aba)) E.rel.dre.mensal.linhas.filter((l) => l.tipo === 'grupo').forEach((l) => E.abertos.add(l.id));
        redesenharConteudo(el);
        return;
      }
      if (c.getAttribute('data-opcao') === 'avah') E.avah = c.checked;
      if (c.getAttribute('data-opcao') === 'sem-zeradas') E.semZeradas = c.checked;
      guardarPreferencias();
      redesenharFolha(el);
    });
  }

  function redesenharConteudo(el) {
    const av = el.querySelector('#apres-avisos');
    if (av) av.innerHTML = avisos();
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

  // ------------------------------------------------------------------
  // Marcação das contas do LALUR (Dony, 18/09/2026: "eu quero ir lá no balancete, na DRE, e colocar essa
  // conta é adição, essa conta é exclusão, e não você decidindo o que é"). Conta de resultado: movimento do
  // mês (a regra dinâmica da planilha); conta de ativo/passivo: só exclusão, pelo aumento do saldo credor.
  // ------------------------------------------------------------------
  function ajustesAtuais() { return Array.isArray(E.config.ajustes) ? E.config.ajustes : []; }
  function marcaLalur(conta, patrimonial) {
    const m = ajustesAtuais().find((a) => a.conta === conta) || null;
    if (!E.marcarLalur) {
      return m ? '<span class="lalur-selo ' + (m.tipo === 'exclusao' ? 'exclusao' : 'adicao') + ' nao-imprimir" title="Conta marcada no LALUR">' +
        (m.tipo === 'exclusao' ? '− Exclusão' : '+ Adição') + '</span>' : '';
    }
    const ligado = (tipo) => !!m && (m.tipo === 'exclusao' ? 'exclusao' : 'adicao') === tipo;
    const bt = (tipo, texto, titulo) => '<button type="button" class="lalur-bt ' + tipo + (ligado(tipo) ? ' ligado' : '') + '" data-lalur="' + tipo + '" data-conta="' + T.esc(conta) + '" title="' +
      (ligado(tipo) ? 'Tirar do LALUR' : titulo) + '">' + texto + '</button>';
    return '<span class="lalur-bts nao-imprimir">' +
      (patrimonial && !ligado('adicao') ? '' : bt('adicao', '+ Adição', 'Marcar como adição no LALUR')) +
      bt('exclusao', '− Exclusão', patrimonial ? 'Marcar como exclusão no LALUR: o quanto o saldo credor aumentou no mês (regra da planilha)' : 'Marcar como exclusão no LALUR') + '</span>';
  }
  // Marca (tipo 'adicao'/'exclusao'), troca ou tira (tipo null ou o mesmo já marcado). Recalcula na hora e
  // guarda em fila, para cliques rápidos não se atropelarem.
  function marcarConta(el, conta, tipo) {
    const atual = ajustesAtuais().find((a) => a.conta === conta) || null;
    const resto = ajustesAtuais().filter((a) => a.conta !== conta);
    const linha = E.rel.contas.find((c) => c.conta === conta);
    let ajustes = resto, texto;
    if (!tipo || (atual && (atual.tipo === 'exclusao' ? 'exclusao' : 'adicao') === tipo)) texto = conta + ' saiu do LALUR';
    else {
      const regra = linha && linha.patrimonial ? 'aumento-credor' : 'movimento';
      ajustes = resto.concat([{ conta, tipo, regra }]).sort((a, b) => motor().compararContas(a.conta, b.conta));
      texto = conta + ' marcada como ' + (tipo === 'exclusao' ? 'exclusão' : 'adição');
    }
    E.config = Object.assign({}, E.config, { ajustes });
    E.rel = motor().montar({ ano: E.ano, balancetes: E.balancetes, config: E.config });
    redesenharConteudo(el);
    const config = E.config;
    E.fila = (E.fila || Promise.resolve())
      .then(() => guardarConfig(config, 'apresentacao-ajustes', texto))
      .then(() => T.avisoRapido(texto + ' · LALUR recalculado.', 'ok', 2500))
      .catch((e) => { T.avisoRapido('Não foi possível guardar a marcação: ' + T.mensagemDeErro(e), 'erro'); app().mostrarRota(); });
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
    const atuais = ajustesAtuais();
    const contas = E.rel.contas;
    const titulo = (c) => { const x = contas.find((k) => k.conta === c); return x ? x.titulo : ''; };
    const linha = (a) => '<tr><td><input class="apres-campo" list="apres-contas" data-aj="conta" value="' + T.esc(a.conta || '') + '" placeholder="conta" style="width:150px"></td>' +
      '<td class="pequeno suave" data-aj="titulo">' + T.esc(titulo(a.conta) || (a.conta ? 'não está nos balancetes' : '')) + '</td>' +
      '<td><select class="apres-campo" data-aj="tipo"><option value="adicao"' + (a.tipo !== 'exclusao' ? ' selected' : '') + '>Adição</option><option value="exclusao"' + (a.tipo === 'exclusao' ? ' selected' : '') + '>Exclusão</option></select></td>' +
      '<td><select class="apres-campo" data-aj="regra">' + Object.keys(REGRAS).map((k) => '<option value="' + k + '"' + ((a.regra || 'movimento') === k ? ' selected' : '') + '>' + REGRAS[k] + '</option>').join('') + '</select></td>' +
      '<td><button type="button" class="botao pequeno perigo" data-aj="tirar" title="Tirar da lista">✕</button></td></tr>';
    const corpo = '<p class="suave pequeno" style="margin:0 0 8px;line-height:1.5">As contas que entram nas adições e exclusões do LALUR (dá para marcar direto na DRE ou no balancete, ' +
      'no botão <b>✎ Marcar adições e exclusões do LALUR</b>). <b>Movimento do mês</b>: débitos − créditos da conta ' +
      '(positivo = adição, negativo = exclusão — a regra dinâmica da planilha). <b>Aumento do saldo credor</b>: exclusão do quanto o saldo credor da conta aumentou no mês (ex.: pagamento de aluguel no IFRS 16).</p>' +
      '<datalist id="apres-contas">' + contas.filter((c) => c.analitica).map((c) => '<option value="' + T.esc(c.conta) + '">' + T.esc(c.titulo) + '</option>').join('') + '</datalist>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Conta</th><th>Título no balancete</th><th>Tipo</th><th>Regra</th><th></th></tr></thead><tbody id="apres-aj-linhas">' +
      atuais.map(linha).join('') + '</tbody></table></div>' +
      '<div class="linha-flex" style="margin-top:8px"><button type="button" class="botao pequeno" data-aj="mais">＋ Adicionar conta</button></div>' +
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
  // Excel FORMATADO, igual à tela (Dony, 18/09/2026: "quero o Excel exatamente como eu vejo na tela,
  // bonito e formatado, porque vou mandar para o cliente"): as mesmas abas, os meses escolhidos, AV/AH
  // ligados ou não, os grupos da DRE abertos ou fechados como estão na tela (com o +/− do Excel para abrir
  // e fechar), o balancete até o nível escolhido (os outros níveis ficam recolhidos, abrem pelos números
  // de nível do Excel), cabeçalho e 1ª coluna travados e cada aba pronta para imprimir (folha deitada, uma
  // página de largura, cabeçalho repetido). O arquivo é montado por excel-bonito.js.
  // ------------------------------------------------------------------
  const R = (c) => (c === null || c === undefined || !isFinite(c) ? null : Math.round(c) / 100);
  const P = (x) => (x === null || x === undefined || !isFinite(x) ? null : x);
  const COR = { azul: 'FF1F4E78', azulSub: 'FF2B5D8A', azulAcum: 'FF0F2C46', azulAcumSub: 'FF16395A', azulTri: 'FF173B5C', ambar: 'FF7A5A16',
    branco: 'FFFFFFFF', texto: 'FF1D2733', suave: 'FF5F6B7A', fraco: 'FF8A94A1', linha: 'FFE6EAEF', divisa: 'FF2D6190' };

  function estilosDoExcel() {
    const e = {
      titulo: { negrito: true, tam: 14, cor: COR.azul },
      subtitulo: { italico: true, tam: 9, cor: COR.suave },
      cab: { negrito: true, cor: COR.branco, fundo: COR.azul, alinh: 'center', vert: 'center', quebra: true, borda: { dir: { cor: COR.divisa } } },
      cabEsq: { negrito: true, cor: COR.branco, fundo: COR.azul, alinh: 'left', vert: 'center', borda: { dir: { cor: COR.divisa } } },
      cabSub: { tam: 9, cor: COR.branco, fundo: COR.azulSub, alinh: 'center', borda: { dir: { cor: COR.divisa } } },
      cabAcum: { negrito: true, cor: COR.branco, fundo: COR.azulAcum, alinh: 'center', vert: 'center', quebra: true },
      cabAcumSub: { tam: 9, cor: COR.branco, fundo: COR.azulAcumSub, alinh: 'center' },
      cabTri: { negrito: true, cor: COR.branco, fundo: COR.azulTri, alinh: 'center', vert: 'center', quebra: true },
      cabTriSub: { tam: 9, cor: COR.branco, fundo: COR.azulTri, alinh: 'center' },
      cabFalta: { negrito: true, cor: 'FFFFE3A3', fundo: COR.ambar, alinh: 'center', vert: 'center', quebra: true },
      cat: { negrito: true, tam: 9, cor: COR.azul, fundo: 'FFF4F6F8', borda: { baixo: { cor: COR.linha } } },
    };
    // Tipos de linha (as mesmas cores da tela) × tipo de célula; ".acum" = coluna do acumulado.
    const LINHAS = { ana: {}, grp: { fundo: 'FFE7E6E6', negrito: true }, tot: { fundo: 'FFDDEBF7', negrito: true },
      des: { fundo: 'FFC9DCEF', negrito: true, cor: 'FF0F2C46', cima: true }, n1: { fundo: 'FFE7E6E6', negrito: true }, sin: { negrito: true },
      inp: { fundo: 'FFEAF2FB', negrito: true, cor: 'FF0B3D91' } };
    const ACUM = { ana: 'FFEEF3F8', grp: 'FFDCE1E7', tot: 'FFCFE0F1', des: 'FFBBD2EA', n1: 'FFDCE1E7', sin: 'FFEEF3F8', inp: 'FFEAF2FB' };
    Object.keys(LINHAS).forEach((t) => {
      const b = LINHAS[t];
      const borda = (extra) => Object.assign({ baixo: { cor: COR.linha } }, b.cima ? { cima: { cor: 'FF8FB0D0' } } : {}, extra || {});
      const base = { negrito: b.negrito, cor: b.cor || COR.texto, fundo: b.fundo };
      for (let r = 0; r <= 5; r++) e[t + '.rot' + r] = Object.assign({}, base, { recuo: r || undefined, borda: borda() });
      e[t + '.cod'] = Object.assign({}, base, { tam: 9, cor: COR.fraco, negrito: false, borda: borda() });
      e[t + '.txt'] = Object.assign({}, base, { borda: borda(), vert: 'top' });
      e[t + '.txtq'] = Object.assign({}, base, { borda: borda(), quebra: true, vert: 'top' });
      e[t + '.val'] = Object.assign({}, base, { formato: 'dinheiro', borda: borda() });
      e[t + '.pct'] = Object.assign({}, base, { formato: 'porcento', tam: 9, cor: b.cor || COR.suave, borda: borda() });
      e[t + '.val.acum'] = Object.assign({}, base, { formato: 'dinheiro', negrito: true, fundo: ACUM[t], borda: borda({ esq: { estilo: 'medium', cor: COR.azul } }) });
      e[t + '.pct.acum'] = Object.assign({}, base, { formato: 'porcento', tam: 9, cor: b.cor || COR.suave, fundo: ACUM[t], borda: borda() });
    });
    return e;
  }

  // Larguras pelo maior número da aba, para nada virar "#####" no Excel (AH passa de 10.000% às vezes,
  // e empresa grande tem valor na casa do bilhão). listas = arrays de valores em centavos ou de frações.
  function larguraValor(listas, minimo) {
    let max = 0;
    listas.forEach((vals) => (vals || []).forEach((c) => {
      if (c === null || c === undefined || !isFinite(c) || !Math.round(c)) return;
      const d = String(Math.floor(Math.abs(Math.round(c)) / 100)).length;
      max = Math.max(max, d + Math.floor((d - 1) / 3) + 3 + (c < 0 ? 2 : 0)); // 1.234,56 e (1.234,56)
    }));
    return Math.max(minimo || 15, Math.ceil(max * 0.9 + 1.5));
  }
  function larguraPct(listas) {
    let max = 0;
    listas.forEach((vals) => (vals || []).forEach((x) => {
      if (x === null || x === undefined || !isFinite(x)) return;
      const n = Math.abs(Math.round(x * 1000) / 10);
      if (n) max = Math.max(max, String(Math.floor(n)).length + 3 + (x < 0 ? 2 : 0)); // 12,5% e (12,5%)
    }));
    return max <= 8 ? 8 : max + 0.5;
  }
  function largurasDePeriodos(linhas, colunas, avah) {
    const val = larguraValor(linhas.map((l) => l.valores));
    if (!avah) return colunas.map(() => val);
    const av = larguraPct(linhas.map((l) => l.av)), ah = larguraPct(linhas.map((l) => l.ah));
    return [].concat(...colunas.map(() => [val, av, ah]));
  }

  // Uma aba em construção: add() devolve o número da linha (1 = primeira).
  function novaFolha(nome, larguras, op) {
    const f = Object.assign({ nome, colunas: larguras, linhas: [], mesclas: [], semGrade: true, paisagem: true, zoom: 90,
      rodape: E.emp.nome + ' · Relatório de apresentação ' + E.ano }, op || {});
    f.add = (celulas, extra) => { f.linhas.push(Object.assign({ celulas }, extra || {})); return f.linhas.length; };
    f.vazia = () => { f.linhas.push(null); return f.linhas.length; };
    f.mesclar = (c1, r1, c2, r2) => f.mesclas.push(raiz.ExcelBonito.coluna(c1) + r1 + ':' + raiz.ExcelBonito.coluna(c2) + r2);
    f.titulo = (titulo, sub) => { f.add([{ v: E.emp.nome + ' — ' + titulo, e: 'titulo' }], { altura: 22 }); f.add([{ v: sub || '', e: 'subtitulo' }]); f.vazia(); };
    return f;
  }

  // Cabeçalho com os períodos: com AV/AH, cada período ocupa 3 colunas (Valor, AV %, AH %), como na tela.
  function cabecalhoComPeriodos(f, fixas, colunas, avah) {
    const r1 = f.linhas.length + 1;
    const estilo = (c) => (c.acumulado ? 'cabAcum' : c.trimestre ? 'cabTri' : c.falta ? 'cabFalta' : 'cab');
    const estiloSub = (c) => (c.acumulado ? 'cabAcumSub' : c.trimestre ? 'cabTriSub' : 'cabSub');
    const linha1 = fixas.map((t, i) => ({ v: t, e: i === 0 ? 'cabEsq' : 'cab' }));
    colunas.forEach((c) => {
      linha1.push({ v: c.rotulo + (c.falta ? ' (sem balancete)' : ''), e: estilo(c) });
      if (avah) { linha1.push({ v: '', e: estilo(c) }); linha1.push({ v: '', e: estilo(c) }); }
    });
    f.add(linha1, { altura: 20 });
    if (avah) {
      f.add(fixas.map((t, i) => ({ v: '', e: i === 0 ? 'cabEsq' : 'cab' })).concat(...colunas.map((c) => ['Valor', 'AV %', 'AH %'].map((t) => ({ v: t, e: estiloSub(c) })))), { altura: 16 });
      fixas.forEach((t, i) => f.mesclar(i, r1, i, r1 + 1));
      colunas.forEach((c, k) => { const c0 = fixas.length + k * 3; f.mesclar(c0, r1, c0 + 2, r1); });
    }
    return { primeira: r1, ultima: f.linhas.length };
  }
  function celulasDePeriodos(tipo, l, colunas, avah) {
    const out = [];
    l.valores.forEach((v, k) => {
      const acum = colunas[k] && colunas[k].acumulado ? '.acum' : '';
      out.push({ v: R(v), e: tipo + '.val' + acum });
      if (avah) { out.push({ v: P(l.av[k]), e: tipo + '.pct' + acum }); out.push({ v: P(l.ah[k]), e: tipo + '.pct' + acum }); }
    });
    return out;
  }

  function folhaResumo() {
    const r = resumoVisivel();
    const dre = dreMensalVisivel();
    const iAcum = dre.colunas.findIndex((c) => c.acumulado);
    const larg = larguraValor(r.linhas.map((l) => l.valores).concat([dre.linhas.map((l) => l.valores[iAcum])]), 16);
    const f = novaFolha('Resumo', [14, 44].concat(r.colunas.map(() => larg)));
    f.titulo('Resumo executivo', 'Contas de 1º nível, mês a mês, acumulado e por trimestre' + (E.selecao ? ' · meses escolhidos: ' + rotuloSelecao(mesesVisiveis()) : '') + ' · valores em R$');
    // Os indicadores do período (as fichas do topo da tela).
    let n = f.add([{ v: 'Indicador', e: 'cabEsq' }, { v: '', e: 'cabEsq' }, { v: dre.colunas[iAcum].rotulo, e: 'cabAcum' }, { v: '% da receita líquida', e: 'cab' }], { altura: 30 });
    f.mesclar(0, n, 1, n);
    const rlAc = dre.linhas.find((l) => l.id === 'receitaLiquida').valores[iAcum];
    ['receitaLiquida', 'lucroBruto', 'ebitda', 'lucroOperacional', 'lucroLiquido'].forEach((id) => {
      const l = dre.linhas.find((x) => x.id === id);
      const v = l.valores[iAcum];
      n = f.add([{ v: l.rotulo, e: 'tot.rot0' }, { v: '', e: 'tot.rot0' }, { v: R(v), e: 'tot.val.acum' }, { v: id === 'receitaLiquida' || !rlAc || v === null ? null : v / rlAc, e: 'tot.pct' }]);
      f.mesclar(0, n, 1, n);
    });
    f.vazia();
    const estilo = (c) => (c.acumulado ? 'cabAcum' : c.trimestre ? 'cabTri' : 'cab');
    const r1 = f.add([{ v: 'Conta', e: 'cabEsq' }, { v: 'Título', e: 'cabEsq' }].concat(r.colunas.map((c) => ({ v: c.rotulo, e: estilo(c) }))), { altura: 20 });
    r.linhas.forEach((l) => f.add([{ v: l.conta, e: 'n1.cod' }, { v: l.titulo, e: 'n1.rot0' }].concat(l.valores.map((v, k) => ({ v: R(v), e: 'n1.val' + (r.colunas[k].acumulado ? '.acum' : '') })))));
    f.repetir = [r1, r1];
    return f;
  }

  // DRE (mensal ou trimestral): faixa da categoria, subtotal com as contas agrupadas embaixo (+/−) e totais.
  function folhaDre(nome, titulo, sub, dre) {
    const avah = E.avah;
    const f = novaFolha(nome, [52, 18].concat(largurasDePeriodos(dre.linhas, dre.colunas, avah)), { resumoAcima: true });
    f.titulo(titulo, sub);
    const cab = cabecalhoComPeriodos(f, ['Linha / Conta analítica', 'Conta'], dre.colunas, avah);
    const nCols = 2 + dre.colunas.length * (avah ? 3 : 1);
    const SEM_FAIXA = { 'Subtotal CPC 51': true, Subtotal: true, Resultado: true };
    let categoria = null;
    dre.linhas.forEach((l) => {
      if (l.categoria !== categoria) {
        categoria = l.categoria;
        if (!SEM_FAIXA[categoria]) f.add([{ v: categoria.toUpperCase(), e: 'cat' }].concat(Array.from({ length: nCols - 1 }, () => ({ v: '', e: 'cat' }))), { altura: 16 });
      }
      const aberto = E.abertos.has(l.grupo || l.id);
      if (l.tipo === 'analitica') {
        f.add([{ v: l.rotulo, e: 'ana.rot2' }, { v: l.conta, e: 'ana.cod' }].concat(celulasDePeriodos('ana', l, dre.colunas, avah)), { nivel: 1, escondida: !aberto });
      } else if (l.tipo === 'grupo') {
        f.add([{ v: l.rotulo, e: 'grp.rot0' }, { v: '', e: 'grp.cod' }].concat(celulasDePeriodos('grp', l, dre.colunas, avah)), { recolhida: !aberto && l.filhas > 0 });
      } else {
        const t = l.destaque ? 'des' : 'tot';
        f.add([{ v: l.rotulo, e: t + '.rot0' }, { v: '', e: t + '.cod' }].concat(celulasDePeriodos(t, l, dre.colunas, avah)));
      }
    });
    f.congelar = { linhas: cab.ultima, colunas: 2 };
    f.repetir = [cab.primeira, cab.ultima];
    return f;
  }

  // Balancete (mensal ou trimestral): recuo por nível e grupos por nível (o Excel abre e fecha pelos números 1 a 5).
  function folhaBalancete(nome, titulo, sub, tab) {
    const avah = E.avah;
    const f = novaFolha(nome, [18, 50].concat(largurasDePeriodos(tab.linhas, tab.colunas, avah)), { resumoAcima: true });
    f.titulo(titulo, sub);
    const cab = cabecalhoComPeriodos(f, ['Conta', 'Título da conta'], tab.colunas, avah);
    const linhas = tab.linhas.filter((l) => !(E.semZeradas && l.valores.every((v) => !v)));
    linhas.forEach((l, i) => {
      const t = l.nivel === 1 ? 'n1' : (!l.analitica && l.nivel <= 4) ? 'sin' : 'ana';
      const proxima = linhas[i + 1];
      const recolhida = l.nivel <= E.nivel && !!proxima && proxima.nivel > l.nivel && proxima.nivel > E.nivel;
      f.add([{ v: l.conta, e: t + '.cod' }, { v: l.titulo, e: t + '.rot' + Math.min(5, l.nivel - 1) }].concat(celulasDePeriodos(t, l, tab.colunas, avah)),
        { nivel: Math.min(7, l.nivel - 1), escondida: l.nivel > E.nivel, recolhida });
    });
    f.congelar = { linhas: cab.ultima, colunas: 2 };
    f.repetir = [cab.primeira, cab.ultima];
    return f;
  }

  function folhasLalur() {
    const L = E.rel.lalur;
    const folhas = [];
    // Parte A
    let larg = larguraValor(L.parteA.linhas.map((l) => l.valores), 17);
    let f = novaFolha('LALUR Parte A', [44, 16].concat(L.parteA.colunas.map(() => larg)));
    f.titulo('LALUR Parte A: apuração do lucro real e da CSLL', 'Apuração trimestral a partir da DRE; adições e exclusões pela lista de ajustes; incentivo PAT e Parte B · valores em R$');
    let r1 = f.add([{ v: 'Linha', e: 'cabEsq' }, { v: 'Bloco', e: 'cabEsq' }].concat(L.parteA.colunas.map((c) => ({ v: c.rotulo, e: c.soma ? 'cabAcum' : 'cab' }))), { altura: 30 });
    L.parteA.linhas.forEach((l) => {
      const t = l.destaque ? 'tot' : 'ana';
      f.add([{ v: l.rotulo, e: t + '.rot0' }, { v: l.bloco, e: t + '.cod' }].concat(l.valores.map((v, k) => ({ v: R(v), e: t + '.val' + (L.parteA.colunas[k].soma ? '.acum' : '') }))));
    });
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    folhas.push(f);
    // Ajustes
    larg = larguraValor(L.ajustes.linhas.map((a) => a.valores).concat([L.ajustes.adicoes, L.ajustes.exclusoes]), 14);
    f = novaFolha('LALUR Ajustes', [46, 18, 10].concat(L.ajustes.colunas.map(() => larg)));
    f.titulo('LALUR: ajustes mensais e trimestrais', 'Valor positivo = adição · valor negativo = exclusão · valores em R$');
    r1 = f.add([{ v: 'Descrição', e: 'cabEsq' }, { v: 'Conta', e: 'cab' }, { v: 'Tipo', e: 'cab' }].concat(L.ajustes.colunas.map((c) => ({ v: c.rotulo, e: c.trimestre ? 'cabTri' : 'cab' }))), { altura: 20 });
    if (!L.ajustes.linhas.length) f.add([{ v: 'Nenhuma conta marcada como adição ou exclusão.', e: 'ana.txt' }]);
    L.ajustes.linhas.forEach((a) => f.add([{ v: a.titulo || a.conta, e: 'ana.rot0' }, { v: a.conta, e: 'ana.cod' }, { v: a.tipo, e: 'ana.txt' }]
      .concat(a.valores.map((v, k) => ({ v: R(v), e: 'ana.val' + (L.ajustes.colunas[k].trimestre ? '.acum' : '') })))));
    [['Total das Adições', L.ajustes.adicoes], ['Total das Exclusões', L.ajustes.exclusoes]].forEach(([t, vals]) =>
      f.add([{ v: t, e: 'tot.rot0' }, { v: '', e: 'tot.cod' }, { v: '', e: 'tot.txt' }].concat(vals.map((v, k) => ({ v: R(v), e: 'tot.val' + (L.ajustes.colunas[k].trimestre ? '.acum' : '') })))));
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    folhas.push(f);
    // PAT
    larg = larguraValor(L.pat.linhas.map((l) => l.valores), 14);
    f = novaFolha('LALUR PAT', [58, 8].concat(L.pat.colunas.map(() => larg)));
    f.titulo('Incentivo fiscal PAT', 'Conta ' + (L.contaPAT || '—') + (L.pat.titulo ? ' · ' + L.pat.titulo : '') + ' · menor entre o incentivo potencial e 3,6% do IRPJ principal (15%) · valores em R$');
    r1 = f.add([{ v: 'Descrição', e: 'cabEsq' }, { v: 'Linha', e: 'cab' }].concat(L.pat.colunas.map((c) => ({ v: c.rotulo, e: c.lalur ? 'cabAcum' : 'cab' }))), { altura: 30 });
    L.pat.linhas.forEach((l) => f.add([{ v: l.rotulo, e: 'ana.rot0' }, { v: l.letra, e: 'ana.cod' }].concat(l.valores.map((v, k) => ({ v: R(v), e: 'ana.val' + (L.pat.colunas[k].lalur ? '.acum' : '') })))));
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    folhas.push(f);
    // Parte B
    larg = larguraValor(L.parteB.linhas.map((l) => l.valores), 16);
    f = novaFolha('LALUR Parte B', [46].concat(L.parteB.colunas.map(() => larg), [80]));
    f.titulo('LALUR Parte B: controles fiscais', 'Saldos de prejuízo fiscal e base negativa (zerados até serem informados) e IR retido · valores em R$');
    r1 = f.add([{ v: 'Controle', e: 'cabEsq' }].concat(L.parteB.colunas.map((c) => ({ v: c.rotulo, e: 'cab' })), [{ v: 'Observação', e: 'cabEsq' }]), { altura: 20 });
    L.parteB.linhas.forEach((l) => {
      const t = l.editavel ? 'inp' : 'ana';
      f.add([{ v: l.rotulo, e: t + '.rot0' }].concat(l.valores.map((v) => ({ v: R(v), e: t + '.val' })), [{ v: l.obs || '', e: 'ana.txt' }]));
    });
    folhas.push(f);
    // Premissas
    const largP = [22, 60, 38, 18, 55];
    f = novaFolha('LALUR Premissas', largP);
    f.titulo('LALUR: premissas, fontes e pontos de validação', '');
    f.add(['Tema', 'Premissa usada', 'Fonte / Base', 'Status', 'Comentário'].map((t) => ({ v: t, e: 'cabEsq' })), { altura: 20 });
    L.premissas.forEach((p) => {
      const linhasTexto = Math.max.apply(null, p.map((t, k) => Math.ceil(String(t).length / (largP[k] * 1.05))));
      f.add(p.map((t) => ({ v: t, e: 'ana.txtq' })), { altura: Math.max(15, 13 * linhasTexto + 4) });
    });
    folhas.push(f);
    return folhas;
  }

  function folhaBase() {
    const larg = larguraValor([].concat(...E.rel.base.map((b) => [[b.saldoAnterior, b.debitos, b.creditos, b.saldoAtual, b.valor]])), 15);
    const f = novaFolha('Base normalizada', [8, 18, 7, 44, larg, larg, larg, larg, larg, 16]);
    const r1 = f.add(['Mês', 'Conta', 'Red.', 'Título da Conta', 'Saldo Ant.', 'Débitos', 'Créditos', 'Saldo Atual', 'Valor Usado', 'Critério'].map((t, i) => ({ v: t, e: i < 4 || i === 9 ? 'cabEsq' : 'cab' })), { altura: 20 });
    E.rel.base.forEach((b) => f.add([{ v: b.mes, e: 'ana.txt' }, { v: b.conta, e: 'ana.cod' }, { v: b.reduzido, e: 'ana.cod' }, { v: b.titulo, e: 'ana.txt' }]
      .concat([b.saldoAnterior, b.debitos, b.creditos, b.saldoAtual, b.valor].map((v) => ({ v: R(v), e: 'ana.val' })), [{ v: b.criterio, e: 'ana.cod' }])));
    f.congelar = { linhas: r1, colunas: 0 };
    f.repetir = [r1, r1];
    return f;
  }

  function montarExcel() {
    const escolha = E.selecao ? ' · meses escolhidos: ' + rotuloSelecao(mesesVisiveis()) : '';
    const planilhas = [
      folhaResumo(),
      folhaDre('DRE mensal', 'DRE CPC 51 mensal detalhada', E.ano + ' · valores em R$ · receitas positivas, custos e despesas entre parênteses · AV % sobre a receita líquida · AH % sobre o mês anterior' + escolha +
        ' · clique no + à esquerda para abrir as contas de um subtotal', dreMensalVisivel()),
      folhaDre('DRE trimestral', 'DRE CPC 51 trimestral detalhada', E.ano + ' · valores em R$ · AV % sobre a receita líquida · AH % sobre o trimestre anterior · clique no + à esquerda para abrir as contas',
        E.rel.dre.trimestral),
      folhaBalancete('Balancete mensal', 'Balancete analítico mensal', E.ano + ' · contas 1 e 2: saldo final do mês · 3, 4 e 5: movimento do mês · AV % sobre a conta-mãe' + escolha +
        ' · use os números 1 a 5 no canto esquerdo do Excel para abrir ou fechar os níveis', balanceteMensalVisivel()),
      folhaBalancete('Balancete trimestral', 'Balancete analítico trimestral', E.ano + ' · contas 1 e 2: saldo no fim do trimestre · 3, 4 e 5: soma dos meses · AV % sobre a conta-mãe', E.rel.trimestral),
    ].concat(folhasLalur(), [folhaBase()]);
    const ordem = { resumo: 0, 'dre-mensal': 1, 'dre-trimestral': 2, 'balancete-mensal': 3, 'balancete-trimestral': 4, lalur: 5 };
    return raiz.ExcelBonito.gerar({ planilhas, estilos: estilosDoExcel(), ativa: ordem[E.aba] || 0 });
  }

  function baixarExcel() {
    let bytes;
    try { bytes = montarExcel(); } catch (e) { console.error(e); T.avisoRapido('Não foi possível montar o Excel: ' + T.mensagemDeErro(e), 'erro'); return; }
    const arquivo = U.nomeSeguro('Apresentação ' + E.codigo + ' ' + E.emp.nome + ' ' + E.ano) + '.xlsx';
    T.baixar(bytes, arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    T.avisoRapido('Excel baixado: ' + arquivo + ' (pasta Downloads).', 'ok', 5000);
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'apresentacao-excel', alvo: 'apresentacao/' + E.ano, detalhe: arquivo }).catch(() => {});
  }

  // _teste: para as provas montarem o Excel sem a tela (estado = os mesmos campos de E).
  raiz.TelaApresentacao = { mostrar, _teste: { definirEstado: (x) => Object.assign(E, x), montarExcel } };
})(self);
