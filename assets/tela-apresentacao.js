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
 *  - Indicadores (liquidez, endividamento, margens, ROI, ROE, prazos) e o RELATÓRIO DO CLIENTE: folhas A4
 *    em pé com o logo da empresa, no desenho do "Relatório de Variações Mensais" (relatorio-cliente.js),
 *    com os textos reescritos direto na prévia (Dony, 18/09/2026).
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
    { id: 'balanco', titulo: 'Balanço patrimonial' },
    { id: 'indicadores', titulo: 'Indicadores' },
    { id: 'comparativo', titulo: 'Comparativo' },
    { id: 'dre-mensal', titulo: 'DRE mensal' },
    { id: 'dre-trimestral', titulo: 'DRE trimestral' },
    { id: 'balancete-mensal', titulo: 'Balancete mensal' },
    { id: 'balancete-trimestral', titulo: 'Balancete trimestral' },
    { id: 'lalur', titulo: 'LALUR trimestral' },
    { id: 'cliente', titulo: '📄 Relatório do cliente' },
  ];
  const REGRAS = { movimento: 'Movimento do mês (conta de resultado)', 'aumento-credor': 'Aumento do saldo credor (conta patrimonial)' };
  const CHAVE_PREF = 'conciliador-solutta.apresentacao';

  // Estado da tela (continua entre redesenhos).
  const E = { codigo: null, ano: null, emp: null, rel: null, registro: null, config: {}, lugares: [], metas: [],
    aba: 'dre-mensal', avah: true, nivel: 5, semZeradas: false, abertos: new Set(), selecao: null, marcarLalur: false, balancetes: [], fila: null, clienteMes: null, cacheCliente: null, ultimoCliente: null, casas: 2, milhar: false,
    dreEdicao: null, balancetesAnt: [], relAnt: null };
  (function lerPreferencias() {
    try {
      const p = JSON.parse((raiz.localStorage && raiz.localStorage.getItem(CHAVE_PREF)) || '{}') || {};
      if (ABAS.some((a) => a.id === p.aba)) E.aba = p.aba;
      if (typeof p.avah === 'boolean') E.avah = p.avah;
      if (p.nivel >= 1 && p.nivel <= 9) E.nivel = p.nivel;
      if (typeof p.semZeradas === 'boolean') E.semZeradas = p.semZeradas;
      if (p.casas === 0 || p.casas === 1 || p.casas === 2) E.casas = p.casas;
      if (typeof p.milhar === 'boolean') E.milhar = p.milhar;
    } catch (e) { /* sem preferências guardadas */ }
  })();
  function guardarPreferencias() {
    try { raiz.localStorage.setItem(CHAVE_PREF, JSON.stringify({ aba: E.aba, avah: E.avah, nivel: E.nivel, semZeradas: E.semZeradas, casas: E.casas, milhar: E.milhar })); } catch (e) { /* navegador sem armazenamento */ }
  }

  // ------------------------------------------------------------------
  // Números no formato da planilha: negativo em vermelho entre parênteses, zero como "–".
  // Como os valores aparecem (Dony, 18/09/2026: "um botão para arredondar, eliminar os zeros, e para
  // mostrar por milhar: 100 mil vira 100"): casas depois da vírgula (2, 1 ou 0) e escala (R$ ou R$ mil).
  // Vale para a tela, a impressão, o Excel (a célula guarda o valor inteiro, só o formato muda) e o
  // relatório do cliente. Valor que arredonda para zero sai "0"; zero de verdade continua "–".
  // ------------------------------------------------------------------
  const FORMATADORES = {};
  function numeroNaEscala(centavos) {
    const casas = E.casas;
    const f = FORMATADORES[casas] || (FORMATADORES[casas] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
    return f.format(Math.abs(centavos) / 100 / (E.milhar ? 1000 : 1));
  }
  function dinheiro(c) {
    if (c === null || c === undefined || !isFinite(c)) return '';
    const n = Math.round(c);
    if (n === 0) return '<span class="zero">–</span>';
    const t = E.casas === 2 && !E.milhar ? U.formatarCentavos(Math.abs(n)) : numeroNaEscala(n);
    return n < 0 ? '<span class="neg">(' + t + ')</span>' : t;
  }
  function valoresEm() { return 'valores em ' + (E.milhar ? 'R$ mil' : 'R$') + (E.casas === 0 ? ', arredondados' : E.casas === 1 ? ', com uma casa decimal' : ''); }
  const numerosPadrao = () => E.casas === 2 && !E.milhar;
  // Os botões (em todas as abas): 1.234,56 · 1.234,6 · 1.235 e R$ · R$ mil.
  function opcoesNumeros() {
    const casas = [[2, '1.234,56', 'Com centavos'], [1, '1.234,6', 'Uma casa depois da vírgula'], [0, '1.235', 'Arredondado, sem casas depois da vírgula']]
      .map(([n, ex, dica]) => '<button type="button" class="seg' + (E.casas === n ? ' ativo' : '') + '" data-casas="' + n + '" title="' + dica + '" aria-pressed="' + (E.casas === n) + '">' + ex + '</button>').join('');
    const escala = [[false, 'R$', 'Valores em reais'], [true, 'R$ mil', 'Valores em milhares: 100.000 vira 100']]
      .map(([m, ex, dica]) => '<button type="button" class="seg' + (E.milhar === m ? ' ativo' : '') + '" data-milhar="' + (m ? 1 : 0) + '" title="' + dica + '" aria-pressed="' + (E.milhar === m) + '">' + ex + '</button>').join('');
    return '<span class="grupo-seg" title="Como os valores aparecem na tela, na impressão, no Excel e no relatório do cliente"><span class="seg-rotulo">Números</span>' + casas + '</span>' +
      '<span class="grupo-seg">' + escala + '</span>';
  }

  // Contas zeradas (Dony, 18/09/2026: "um botão para eu selecionar se visualizo as contas que não possuem saldo
  // nem movimento; se tiver saldo, logo tem movimento"): Todas · Sem as zeradas. Vale no balanço, na DRE, no
  // balancete e nas linhas da DRE (tela, impressão e Excel). Esconder não muda nenhum total: a conta escondida
  // é zero em todas as colunas.
  const ABAS_COM_CONTAS = { balanco: true, comparativo: true, 'dre-mensal': true, 'dre-trimestral': true, 'balancete-mensal': true, 'balancete-trimestral': true };
  function opcoesContas() {
    const bt = [[false, 'Todas', 'Mostra todas as contas do plano'], [true, 'Sem as zeradas', 'Esconde as contas sem saldo e sem movimento nos meses da tela (conta com saldo continua aparecendo)']]
      .map(([z, texto, dica]) => '<button type="button" class="seg' + (E.semZeradas === z ? ' ativo' : '') + '" data-zeradas="' + (z ? 1 : 0) + '" title="' + dica + '" aria-pressed="' + (E.semZeradas === z) + '">' + texto + '</button>').join('');
    return '<span class="grupo-seg" title="Contas sem saldo e sem movimento"><span class="seg-rotulo">Contas</span>' + bt + '</span>';
  }
  // As contas que ficam com "Sem as zeradas": têm saldo ou movimento em alguma coluna da tela (e todas as de
  // cima delas, para a árvore não quebrar). linhas: linhas do balancete do motor (com .ativa por coluna);
  // idx: as colunas que contam (todas, se não vier). null = mostrar todas.
  const semZeradasTexto = () => (E.semZeradas ? ' · sem as contas zeradas (sem saldo e sem movimento)' : '');
  function contasComSaldoOuMovimento(linhas, idx) {
    if (!E.semZeradas) return null;
    const porConta = new Map(linhas.map((l) => [l.conta, l]));
    const ficam = new Set();
    linhas.forEach((l) => {
      const ativa = l.ativa || [];
      if (!(idx ? idx.some((k) => ativa[k]) : ativa.some(Boolean))) return;
      let x = l;
      while (x && !ficam.has(x.conta)) { ficam.add(x.conta); x = x.pai ? porConta.get(x.pai) : null; }
    });
    return ficam;
  }
  function pct(x) {
    if (x === null || x === undefined || !isFinite(x)) return '';
    const v = Math.round(x * 1000) / 10;
    if (v === 0) return '<span class="zero">–</span>';
    const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    return v < 0 ? '<span class="neg">(' + t + ')</span>' : t;
  }

  function idRegistro(codigo, ano) { return 'F-' + codigo + '-apresentacao-' + ano + '-01'; }

  // As linhas da DRE guardadas na empresa (valem para todos os anos) e o relatório montado com elas.
  function mapaDaEmpresa() { const m = E.emp && E.emp.mapaDre; return m && m.contas && Object.keys(m.contas).length ? m : null; }
  function montarRel(balancetes, dreModo) {
    return motor().montar({ ano: E.ano, balancetes: balancetes || E.balancetes, config: E.config, mapaDre: mapaDaEmpresa(), dreModo });
  }
  // Plano de contas diferente do modelo e linhas ainda não conferidas: a DRE e o que sai dela ficam fechados.
  const dreFechada = () => !!E.rel && E.rel.dre.situacao === 'sugestao';

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
    // Os balancetes do ano anterior, para a aba Comparativo.
    const balancetesAnt = [];
    for (let i = 1; i <= 12; i++) {
      const comp = (anoEscolhido - 1) + '-' + String(i).padStart(2, '0') + '-01';
      const doMes = doTipo.filter((m) => m.competencia === comp).sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
      if (!doMes.length) continue;
      const c = await arm.conteudoDoArquivo(doMes[0].id);
      if (c && c.contas) balancetesAnt.push({ competencia: comp, contas: c.contas });
    }
    const registro = (await arm.conciliacoes(codigo, anoEscolhido + '-01-01')).find((r) => r.id === idRegistro(codigo, anoEscolhido)) || null;
    if (conferir && !conferir()) return;
    if (E.codigo !== codigo || E.ano !== anoEscolhido) { E.abertos = new Set(); E.selecao = null; E.dreEdicao = null; }
    Object.assign(E, { codigo, ano: anoEscolhido, emp, metas, lugares, registro, balancetes, balancetesAnt, relAnt: null, config: (registro && registro.config) || {} });
    E.rel = montarRel();
    // O ano anterior sempre aparece na escolha (Dony, 21/09/2026: "quero poder jogar os balancetes de 2025 das
    // empresas, para poder fazer comparação"): sem balancete nenhum dele ainda, é por ali que eles sobem.
    E.anos = Array.from(new Set(anosComBalancete.concat([anoAtual, anoAtual - 1, anoEscolhido]))).sort((a, b) => b - a);
    E.anosComBalancete = anosComBalancete;
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
      (E.anos.length > 1 ? '<select class="apres-campo" id="apres-ano" title="Ano do relatório (para subir os balancetes de outro ano, escolha o ano aqui)">' +
        E.anos.map((a) => '<option value="' + a + '"' + (a === E.ano ? ' selected' : '') + '>' + a + (E.anosComBalancete.indexOf(a) < 0 ? ' · sem balancete' : '') + '</option>').join('') + '</select>' : '') +
      raiz.TelaSubir.botao(chave) +
      (semBalancete ? '' : '<button type="button" class="botao" data-aba="cliente" title="As folhas para mandar ao cliente, com o logo da empresa">📄 Relatório do cliente</button>' +
        '<button type="button" class="botao" id="apres-excel" title="As mesmas abas da planilha modelo">⬇ Excel</button>' +
        '<button type="button" class="botao primario" id="apres-imprimir" title="Na janela de impressão, escolha a impressora ou “Salvar como PDF”">🖨 Imprimir / PDF</button>') +
      '</div></div>' +
      '<div id="apres-painel" class="nao-imprimir">' + painel + '</div>' +
      (semBalancete ? '<div class="cartao corpo nao-imprimir" style="margin-top:14px"><h3>Comece pelos balancetes</h3><p class="suave" style="line-height:1.55;margin:6px 0 0">' +
        'Carregue o balancete de cada mês no lugar dele, aqui em cima. Com eles o programa monta o <b>Resumo</b>, a <b>DRE mensal e trimestral</b>, ' +
        'o <b>balancete mensal e trimestral</b> (com AV % e AH %) e o <b>LALUR trimestral</b>, no desenho da planilha de apresentação.</p></div>' : conteudo()) +
      '</div><div id="apres-impressao" class="apres-impressao"></div>';
    ligar(el.querySelector('.apres-raiz'));
    conferirEstouro(el);
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

  function opcoesDaAba() { return opcoesNumeros() + (ABAS_COM_CONTAS[E.aba] ? opcoesContas() : '') + opcoesDaAbaSo(); }
  function opcoesDaAbaSo() {
    const avah = '<label class="caixa-opcao"><input type="checkbox" data-opcao="avah"' + (E.avah ? ' checked' : '') + '> AV % e AH %</label>';
    const marcar = '<label class="caixa-opcao lalur-opcao' + (E.marcarLalur ? ' ligada' : '') + '" title="Mostra, em cada conta, os botões para marcar adição ou exclusão do LALUR">' +
      '<input type="checkbox" data-opcao="marcar-lalur"' + (E.marcarLalur ? ' checked' : '') + '> ✎ Marcar adições e exclusões do LALUR</label>';
    const ajudaMarcar = '<span class="suave pequeno"><b>Marcando o LALUR:</b> clique em <b>+ Adição</b> ou <b>− Exclusão</b> na conta; clique de novo para tirar. ' +
      'Conta de ativo ou passivo só tem exclusão, pelo aumento do saldo credor (a regra da planilha). ' + ajustesAtuais().length + ' conta(s) marcada(s).</span>';
    if ((E.aba === 'dre-mensal' || E.aba === 'dre-trimestral') && (dreFechada() || E.dreEdicao)) {
      return '<span class="suave pequeno">Conferindo as <b>linhas da DRE</b> da empresa: escolha a linha de cada grupo de contas; a prévia da DRE ao lado muda na hora.</span>';
    }
    if (E.aba === 'dre-mensal' || E.aba === 'dre-trimestral') {
      return '<button type="button" class="botao pequeno" data-opcao="linhas-dre" title="Em que linha da DRE entra cada conta de resultado desta empresa">⚙ Linhas da DRE</button>' +
        '<button type="button" class="botao pequeno" data-opcao="abrir-tudo">＋ Abrir todas as contas</button>' +
        '<button type="button" class="botao pequeno" data-opcao="fechar-tudo">－ Fechar todas</button>' + avah + marcar +
        (E.marcarLalur ? ajudaMarcar : '<span class="suave pequeno">Clique num subtotal para abrir ou fechar as contas dele. AV % sobre a receita líquida; AH % sobre o ' + (E.aba === 'dre-mensal' ? 'mês' : 'trimestre') + ' anterior.</span>');
    }
    if (E.aba === 'balancete-mensal' || E.aba === 'balancete-trimestral') {
      return '<span class="suave pequeno">Mostrar até o nível</span>' + [1, 2, 3, 4, 5].map((n) => '<button type="button" class="botao pequeno' + (E.nivel === n ? ' primario' : '') + '" data-nivel="' + n + '">' + n + '</button>').join('') +
        avah + marcar +
        (E.marcarLalur ? ajudaMarcar : '<span class="suave pequeno">' + (E.aba === 'balancete-mensal' ? 'Contas 1 e 2: saldo final do mês; 3, 4 e 5: movimento do mês.' : 'Contas 1 e 2: saldo no fim do trimestre; 3, 4 e 5: soma dos meses.') + ' AV % sobre a conta-mãe.</span>');
    }
    if (E.aba === 'lalur') {
      return '<button type="button" class="botao pequeno" data-opcao="editar-ajustes">✎ Lista de ajustes e conta do PAT</button>' +
        '<span class="suave pequeno">Apuração trimestral do lucro real. As adições e exclusões são as contas que você marca na DRE ou no balancete. Os campos em azul da Parte B são preenchidos por você.</span>';
    }
    if (E.aba === 'indicadores') {
      return '<span class="suave pequeno">Balanço pelo saldo do fim do mês; resultado pelo movimento do mês. <b>Período</b>: resultado somado nos meses escolhidos e balanço do último mês. ' +
        '▲▼ = mudança sobre a coluna anterior (verde melhora, vermelho piora).</span>';
    }
    if (E.aba === 'cliente') return '';
    if (E.aba === 'comparativo') {
      if (dreFechada()) return '';
      return '<button type="button" class="botao pequeno" data-opcao="abrir-tudo">＋ Abrir todas as contas</button>' +
        '<button type="button" class="botao pequeno" data-opcao="fechar-tudo">－ Fechar todas</button>' +
        '<label class="caixa-opcao"><input type="checkbox" data-opcao="avah"' + (E.avah ? ' checked' : '') + '> AV %</label>' +
        '<span class="suave pequeno">Os meses escolhidos ao lado dos mesmos meses de ' + (E.ano - 1) + '. DRE: a soma dos meses; balanço: o fim do último mês. ' +
        'Variação % sobre ' + (E.ano - 1) + ' (verde melhora, vermelho piora).</span>';
    }
    if (E.aba === 'balanco') {
      return '<span class="suave pequeno">Conferência: ativo = passivo + patrimônio líquido + resultado do exercício pela DRE (o lucro dos meses desde o último encerramento). Tem que fechar em todos os meses.</span>';
    }
    return '<span class="suave pequeno">Saldos de 1º nível no fim de cada mês, como no balancete: a soma de cada coluna tem que dar zero. Os cartões de cima são da DRE (a soma dos meses escolhidos).</span>';
  }

  // ------------------------------------------------------------------
  // Meses escolhidos (Dony, 18/09/2026: "escolher o período — eu não quero janeiro, fevereiro, março, eu quero
  // abril, maio, junho — com botões mês a mês; clicou, o mês aparece ou some da DRE"). Vale para as visões
  // mensais (Resumo, DRE mensal e balancete mensal), na tela, na impressão e no Excel. O acumulado passa a
  // somar só os meses escolhidos. AH % continua sobre o mês anterior de verdade.
  // E.selecao: null = todos os meses com balancete; senão, Set de competências.
  // ------------------------------------------------------------------
  const ABAS_MENSAIS = { resumo: true, balanco: true, indicadores: true, comparativo: true, 'dre-mensal': true, 'balancete-mensal': true };
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
      linhas: tab.linhas.map((l) => Object.assign({}, l, { valores: ks.map((k) => l.valores[k]), av: ks.map((k) => l.av[k]), ah: ks.map((k) => l.ah[k]), ativa: ks.map((k) => l.ativa[k]) })) };
  }
  // Resumo (Dony, 18/09/2026: "somando ativo, passivo, receitas, custos e despesas tem que dar zero"): o saldo
  // de 1º nível no fim de cada mês escolhido e de cada trimestre, como no balancete; a soma de cada coluna = 0.
  function resumoVisivel() {
    const r = E.rel.resumo;
    const idx = indicesVisiveis().concat(r.colunas.map((c, i) => (c.trimestre ? i : -1)).filter((i) => i >= 0));
    return {
      colunas: idx.map((i) => r.colunas[i]),
      linhas: r.linhas.map((l) => Object.assign({}, l, { valores: idx.map((i) => l.valores[i]) })),
      soma: idx.map((i) => r.soma[i]),
    };
  }
  // ✓ 0,00 quando fecha; o valor em vermelho quando não fecha.
  function marcaZero(v) {
    if (v === null || v === undefined) return '';
    return Math.abs(v) <= 1 ? '<span class="ok">✓ 0,00</span>' : '<span class="neg">' + dinheiro(v) + ' ✗</span>';
  }
  // O painel dos meses (como o exemplo que o Dony mandou): atalhos, o ano e um botão por mês.
  function seletorMeses() {
    if (!ABAS_MENSAIS[E.aba]) return '';
    if ((E.aba === 'dre-mensal' && (dreFechada() || E.dreEdicao)) || ((E.aba === 'indicadores' || E.aba === 'comparativo') && dreFechada())) return '';
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
    const impressao = !!(op && op.impressao);
    if (aba === 'resumo') return secaoResumo();
    if (aba === 'balanco') return secaoBalanco();
    if (aba === 'indicadores') return dreFechada() ? (impressao ? '' : tituloSecao('Indicadores financeiros e patrimoniais', '') + avisoDreFechada('Os indicadores ficam fechados')) : secaoIndicadores();
    if (aba === 'comparativo') return dreFechada() ? (impressao ? '' : tituloSecao('Comparativo com ' + (E.ano - 1), '') + avisoDreFechada('O comparativo fica fechado')) : secaoComparativo(op);
    if (aba === 'cliente') return dreFechada() ? (impressao ? '' : avisoDreFechada('O relatório do cliente fica fechado')) : secaoCliente(op);
    if (/^dre-/.test(aba) && dreFechada() && impressao) return '';
    if (/^dre-/.test(aba) && (dreFechada() || E.dreEdicao) && !impressao) return secaoLinhasDre();
    if (aba === 'dre-mensal') return secaoDre(dreMensalVisivel(), 'DRE CPC 51 mensal detalhada', op, ficamNaDre('mensal'));
    if (aba === 'dre-trimestral') return secaoDre(rel.dre.trimestral, 'DRE CPC 51 trimestral detalhada', op, ficamNaDre('trimestral'));
    if (aba === 'balancete-mensal') return secaoBalancete(balanceteMensalVisivel(), 'Balancete analítico mensal');
    if (aba === 'balancete-trimestral') return secaoBalancete(rel.trimestral, 'Balancete analítico trimestral');
    if (aba === 'lalur') return secaoLalur(op);
    return '';
  }

  function tituloSecao(titulo, sub) {
    const nota = !numerosPadrao() && String(sub || '').indexOf('valores em') < 0 ? (sub ? ' · ' : '') + valoresEm() : '';
    return '<div class="apres-titulo"><h2>' + T.esc(E.emp.nome) + ' — ' + T.esc(titulo) + '</h2>' + (sub || nota ? '<p>' + (sub || '') + nota + '</p>' : '') + '</div>';
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
    const colunas = r.colunas.map((c) => Object.assign({}, c, { cls: c.trimestre ? 'tri' : '' }));
    const linhas = r.linhas.map((l) => '<tr class="nivel-1"><td class="fixa"><span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.titulo) + '</td>' +
      l.valores.map((v, k) => '<td class="num' + (colunas[k].cls ? ' ' + colunas[k].cls : '') + '">' + dinheiro(v) + '</td>').join('') + '</tr>').join('') +
      '<tr class="total resumo-soma"><td class="fixa">Soma (tem que dar zero)</td>' + r.soma.map((v, k) => '<td class="num' + (colunas[k].cls ? ' ' + colunas[k].cls : '') + '">' + marcaZero(v) + '</td>').join('') + '</tr>';
    const dre = dreMensalVisivel();
    const indicador = (id) => dre.linhas.find((l) => l.id === id);
    const iAcum = dre.colunas.findIndex((c) => c.acumulado); // o acumulado dos meses escolhidos, na última coluna
    const fichas = ['receitaLiquida', 'lucroBruto', 'ebitda', 'lucroOperacional', 'lucroLiquido'].map((id) => {
      const l = indicador(id);
      const total = l.valores[iAcum] || 0;
      const rl = indicador('receitaLiquida').valores[iAcum] || 0;
      return '<div class="apres-ficha"><span>' + T.esc(l.rotulo) + ' · ' + T.esc(dre.colunas[iAcum].rotulo) + '</span><b>' + dinheiro(total) + '</b>' +
        (id !== 'receitaLiquida' && rl ? '<small>' + pct(total / rl) + ' da receita líquida</small>' : '') + '</div>';
    }).join('');
    return tituloSecao('Resumo executivo', 'Os cartões: a DRE somada nos meses escolhidos. A tabela: o saldo das contas de 1º nível no fim de cada mês, como no balancete ' +
      '(receitas, custos e despesas acumulados desde o último encerramento); a soma de cada coluna tem que dar zero.') +
      (dreFechada() ? avisoDreFechada('Os cartões da DRE ficam fechados') : '<div class="apres-fichas">' + fichas + '</div>') +
      '<div class="apres-caixa"><table class="apres"><thead><tr><th class="fixa">Conta</th>' +
      colunas.map((c) => '<th class="num per' + (c.cls ? ' ' + c.cls : '') + (c.falta ? ' falta' : '') + '">' + T.esc(c.rotulo) + '</th>').join('') + '</tr></thead><tbody>' + linhas + '</tbody></table></div>';
  }

  // ---------- Balanço patrimonial (Dony, 18/09/2026: "cria um balanço e lança no resultado do exercício um
  // simulado de acordo com a DRE: ativo e passivo têm que bater — para ver se está fazendo a coisa certa")
  function secaoBalanco() {
    const b = E.rel.balanco;
    const ks = indicesVisiveis();
    const conf = b.conferencia;
    const ficam = contasComSaldoOuMovimento(E.rel.mensal.linhas, ks);
    const linha = (l) => {
      if (ficam && l.conta && !ficam.has(l.conta)) return '';
      const cls = l.tipo === 'total' ? 'total' + (l.destaque ? ' destaque' : '') : l.tipo === 'grupo' ? 'bal-grupo' : l.tipo === 'resultado' ? 'bal-resultado' : 'bal-conta';
      const rot = (l.conta ? '<span class="cod">' + T.esc(l.conta) + '</span> ' : '') + T.esc(l.rotulo);
      return '<tr class="' + cls + '"><td class="fixa" style="padding-left:' + (8 + ((l.nivel || 1) - 1) * 16) + 'px">' + rot + '</td>' +
        ks.map((k) => '<td class="num">' + dinheiro(l.valores[k]) + '</td>').join('') + '</tr>';
    };
    const conferencia = '<tr class="cat"><td class="fixa">Conferência</td><td colspan="' + ks.length + '"></td></tr>' +
      '<tr class="bal-conf"><td class="fixa">Ativo − (passivo + PL + resultado) <small>tem que dar zero</small></td>' + ks.map((k) => '<td class="num">' + marcaZero(conf.diferenca[k]) + '</td>').join('') + '</tr>' +
      '<tr><td class="fixa">Resultado pelo balancete <small>receitas, custos e despesas ainda não encerrados</small></td>' + ks.map((k) => '<td class="num">' + dinheiro(conf.resultadoBalancete[k]) + '</td>').join('') + '</tr>' +
      '<tr><td class="fixa">Resultado pela DRE <small>lucro dos meses desde o último encerramento</small></td>' + ks.map((k) => '<td class="num">' + dinheiro(conf.resultadoDre[k]) + '</td>').join('') + '</tr>' +
      '<tr class="bal-conf"><td class="fixa">Diferença entre os dois <small>tem que dar zero</small></td>' + ks.map((k) => '<td class="num">' + marcaZero(conf.difResultado[k]) + '</td>').join('') + '</tr>';
    const cab = '<thead><tr><th class="fixa">Balanço patrimonial</th>' + ks.map((k) => { const c = b.colunas[k]; return '<th class="num per' + (c.falta ? ' falta' : '') + '">' + T.esc(c.rotulo) +
      (c.desde ? '<small class="desde">resultado desde ' + T.esc(c.desde) + '</small>' : c.falta ? '<small>sem balancete</small>' : '') + '</th>'; }).join('') + '</tr></thead>';
    const naoFecha = ks.filter((k) => (conf.diferenca[k] !== null && Math.abs(conf.diferenca[k]) > 1) || (conf.difResultado[k] !== null && Math.abs(conf.difResultado[k]) > 1)).map((k) => b.colunas[k].rotulo);
    const semEnc = ks.filter((k) => b.colunas[k].semEncerramento).map((k) => b.colunas[k].rotulo);
    const selo = naoFecha.length
      ? '<div class="aviso ambar" style="margin:0 0 10px"><span class="icone-aviso">⚠️</span><div>O balanço <b>não fecha</b> em ' + T.esc(naoFecha.join(', ')) + '. Veja a conferência no fim da tabela.' +
        (semEnc.length ? ' Em ' + T.esc(semEnc.join(', ')) + ' o resultado aberto vem de antes do primeiro balancete carregado: carregue os meses desde o último encerramento.' : '') + '</div></div>'
      : '<div class="aviso verde" style="margin:0 0 10px"><span class="icone-aviso">✓</span><div>O balanço <b>fecha em todos os meses</b>: ativo = passivo + patrimônio líquido + resultado do exercício pela DRE, ' +
        'e o resultado pela DRE é igual ao das contas de resultado ainda abertas no balancete.</div></div>';
    return tituloSecao('Balanço patrimonial (conferência)', T.esc(E.ano) + ' · saldo do fim de cada mês · passivo e PL com o saldo credor positivo · o resultado do exercício vem da DRE ' +
      '(o lucro dos meses desde o último encerramento, que no balancete ainda está nas contas de resultado)' + semZeradasTexto()) + selo +
      '<div class="apres-caixa"><table class="apres balanco">' + cab + '<tbody>' + b.linhas.map(linha).join('') + conferencia + '</tbody></table></div>';
  }

  // ---------- DRE
  // ficam: as contas analíticas que aparecem com "Sem as zeradas" (null = todas).
  function ficamNaDre(qual) { return qual === 'mensal' ? contasComSaldoOuMovimento(E.rel.mensal.linhas, indicesVisiveis()) : contasComSaldoOuMovimento(E.rel.trimestral.linhas); }
  function secaoDre(dre, titulo, op, ficam) {
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
        if (!aberto || (ficam && !ficam.has(l.conta))) return faixa;
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
    const d = E.rel.dre;
    const nota = d.naoMapeadas.length ? '<p class="apres-nota">⚠️ "Outras contas de resultado" reúne conta(s) de resultado que nenhuma linha da DRE pega: ' +
      d.naoMapeadas.map((x) => T.esc(x.conta + ' ' + x.titulo)).join('; ') + '. Indique a linha delas em <b>⚙ Linhas da DRE</b> para ficar certo na apresentação.</p>' : '';
    const fora = !d.foraDaDre.length ? '' : d.situacao === 'modelo'
      ? '<p class="apres-nota suave">Fora da DRE, como na planilha: ' + d.foraDaDre.length + ' conta(s) de compras e estoque (4.2), que somam zero no mês.</p>'
      : '<p class="apres-nota suave">Fora da DRE (marcadas nas linhas da DRE da empresa): ' + d.foraDaDre.length + ' conta(s) — ' + d.foraDaDre.slice(0, 3).map((x) => T.esc(x.conta + ' ' + x.titulo)).join('; ') + (d.foraDaDre.length > 3 ? '; …' : '') + '.</p>';
    const salvo = mapaDaEmpresa();
    const origem = d.situacao === 'mapa'
      ? 'linhas da DRE desta empresa' + (salvo && salvo.conferidoEm ? ', conferidas em ' + T.esc(U.dataHoraLocal(salvo.conferidoEm).slice(0, 10)) : '')
      : 'linhas da DRE pelo modelo da planilha (os nomes das contas batem com ele)';
    return tituloSecao(titulo, T.esc(E.ano) + ' · ' + valoresEm() + ' · receitas positivas, custos e despesas entre parênteses' + semZeradasTexto() + ' · <span class="nao-imprimir">' + origem + '</span>') +
      '<div class="apres-caixa"><table class="apres dre' + (avah ? ' com-avah' : '') + (E.marcarLalur ? ' marcando' : '') + '">' + cabecalhoPeriodos([{ titulo: 'Linha / Conta analítica' }], colunas, avah) +
      '<tbody>' + corpo + '</tbody></table></div>' + nota + fora;
  }

  // ---------- LINHAS DA DRE da empresa (Dony, 18/09/2026: a DRE de um plano de contas diferente do da
  // planilha saiu com despesa no custo). Em que linha da DRE entra cada conta de resultado: a linha de uma
  // conta vale para todas as de baixo, a não ser que uma de baixo tenha a sua. O programa sugere pelos nomes,
  // quem usa confere e confirma; fica guardado na empresa (todos os anos). A prévia da DRE ao lado muda na hora.
  // E.dreEdicao = { contas: { conta: linha }, rotulos: { linha: nome na DRE }, abertos: Set }. O botão "Contas" (Todas ·
  // Sem as zeradas) vale também aqui.
  function avisoDreFechada(oque) {
    return '<div class="aviso ambar" style="margin:0 0 12px"><span class="icone-aviso">🔒</span><div><b>' + oque + ' até as linhas da DRE desta empresa serem conferidas.</b> ' +
      'O plano de contas dela é diferente do modelo da planilha; o programa já sugeriu a linha de cada grupo de contas pelos nomes. ' +
      '<button type="button" class="botao pequeno primario" data-opcao="ir-linhas-dre">Conferir as linhas da DRE</button></div></div>';
  }
  function rotuloDaLinha(id) {
    if (id === 'fora') return 'Fora da DRE';
    const proprio = E.dreEdicao && E.dreEdicao.rotulos[id];
    const l = motor().LINHAS_DO_MAPA.find((x) => x.id === id);
    return (proprio || (l ? l.rotulo : id)).replace(/^\(-\)\s*/, '');
  }
  function indiceDoPlano() { return new Map(E.rel.contas.map((c) => [c.conta, c])); }
  // Abre as contas-mãe de onde há linha escolhida (e das contas com movimento sem linha): as decisões aparecem.
  function abrirAte(abertos, contas, indice) {
    contas.forEach((k) => { let x = indice.get(k); while (x && x.pai && indice.has(x.pai)) { abertos.add(x.pai); x = indice.get(x.pai); } });
  }
  function iniciarEdicaoDre() {
    const d = E.rel.dre;
    const salvo = mapaDaEmpresa();
    const contas = salvo ? Object.assign({}, salvo.contas) : d.situacao === 'modelo' ? motor().mapaDoModelo(E.rel.contas) : Object.assign({}, d.mapa || {});
    E.dreEdicao = { contas, rotulos: Object.assign({}, (salvo && salvo.rotulos) || {}), abertos: new Set() };
    const indice = indiceDoPlano();
    abrirAte(E.dreEdicao.abertos, Object.keys(contas).concat(pendentesDre().map((c) => c.conta)), indice);
  }
  // Movimento de cada conta de resultado nos meses carregados (com o sinal da DRE: receita +) e as contas com
  // movimento (a analítica e todas as de cima dela).
  function movimentosDre() {
    const com = E.rel.meses.map((m, k) => (m.tem ? k : -1)).filter((k) => k >= 0);
    const mov = new Map(), comMov = new Set();
    const indice = indiceDoPlano();
    E.rel.mensal.linhas.forEach((l) => {
      if (l.patrimonial) return;
      let s = 0, abs = 0;
      com.forEach((k) => { const v = l.valores[k] || 0; s += v; abs += Math.abs(v); });
      mov.set(l.conta, -s);
      if (l.analitica && abs) { let x = l; while (x) { comMov.add(x.conta); x = x.pai ? indice.get(x.pai) : null; } }
    });
    return { mov, comMov };
  }
  // Contas analíticas com movimento e sem linha (não dá para confirmar assim).
  function pendentesDre() {
    const ed = E.dreEdicao;
    if (!ed) return [];
    const { comMov } = movimentosDre();
    const indice = indiceDoPlano();
    return E.rel.contas.filter((c) => c.analitica && !c.patrimonial && comMov.has(c.conta) && !motor().linhaNoMapa(ed.contas, indice, c.conta));
  }
  // maeSemFalta: conta-mãe sem linha própria em que todas as de baixo já têm a sua.
  function opcoesLinhas(propria, herdada, maeSemFalta) {
    const vazia = herdada ? '↳ igual à de cima: ' + T.esc(rotuloDaLinha(herdada)) : maeSemFalta ? '— cada conta de baixo tem a sua —' : '— sem linha —';
    let html = '<option value=""' + (propria ? '' : ' selected') + '>' + vazia + '</option>';
    let cat = null;
    motor().LINHAS_DO_MAPA.forEach((l) => {
      if (l.categoria !== cat) { if (cat !== null) html += '</optgroup>'; cat = l.categoria; html += '<optgroup label="' + T.esc(cat) + '">'; }
      html += '<option value="' + l.id + '"' + (propria === l.id ? ' selected' : '') + '>' + T.esc(rotuloDaLinha(l.id)) + '</option>';
    });
    return html + '</optgroup><option value="fora"' + (propria === 'fora' ? ' selected' : '') + '>Fora da DRE (não entra)</option>';
  }
  function secaoLinhasDre() {
    if (!E.dreEdicao) iniciarEdicaoDre();
    const ed = E.dreEdicao;
    const d = E.rel.dre;
    const indice = indiceDoPlano();
    const { mov } = movimentosDre();
    const resultado = E.rel.contas.filter((c) => !c.patrimonial);
    const temConta = new Set(resultado.map((c) => c.conta));
    const visivel = (c) => { let p = c.pai; while (p && temConta.has(p)) { if (!ed.abertos.has(p)) return false; p = indice.get(p).pai; } return true; };
    const pend = pendentesDre();
    const pendentes = new Set(pend.map((c) => c.conta));
    // Conta-mãe com alguma conta de baixo sem linha também fica em vermelho (para achar abrindo).
    pend.forEach((p) => { let x = indice.get(p.pai); while (x) { pendentes.add(x.conta); x = x.pai ? indice.get(x.pai) : null; } });
    const com = E.rel.meses.filter((m) => m.tem);
    const periodo = com.length ? (com.length === 1 ? com[0].rotulo : com[0].rotulo.slice(0, 3) + '–' + com[com.length - 1].rotulo) : '';
    const ficam = contasComSaldoOuMovimento(E.rel.mensal.linhas);
    const linhas = resultado.filter((c) => visivel(c) && (!ficam || ficam.has(c.conta))).map((c) => {
      const propria = ed.contas[c.conta] || '';
      const herdada = c.pai ? motor().linhaNoMapa(ed.contas, indice, c.pai) : null;
      const aberto = ed.abertos.has(c.conta);
      const semLinha = pendentes.has(c.conta);
      return '<tr class="md-n' + Math.min(c.nivel, 6) + (c.analitica ? ' md-ana' : ' md-sin') + (propria ? ' md-propria' : '') + (semLinha ? ' md-sem' : '') + '">' +
        '<td class="md-conta" style="padding-left:' + (6 + (c.nivel - 1) * 14) + 'px" title="' + T.esc(c.conta + ' ' + c.titulo) + '">' +
        (c.analitica ? '<span class="md-folha"></span>' : '<button type="button" class="md-abre" data-dre-abre="' + T.esc(c.conta) + '" aria-expanded="' + aberto + '" title="' + (aberto ? 'Fechar' : 'Abrir') + ' as contas de baixo">' + (aberto ? '▾' : '▸') + '</button>') +
        '<span class="cod">' + T.esc(c.conta) + '</span> ' + T.esc(c.titulo) + '</td>' +
        '<td class="num">' + dinheiro(mov.get(c.conta)) + '</td>' +
        '<td class="md-escolha"><select class="apres-campo" data-dre-conta="' + T.esc(c.conta) + '" aria-label="Linha da DRE da conta ' + T.esc(c.conta) + '">' + opcoesLinhas(propria, herdada, !c.analitica && !semLinha) + '</select></td></tr>';
    }).join('');
    // Prévia: a DRE com as linhas escolhidas (acumulado dos meses carregados) e a conferência com o balancete.
    const previa = motor().montar({ ano: E.ano, balancetes: E.balancetes, config: E.config, mapaDre: { contas: ed.contas, rotulos: ed.rotulos, rascunho: true } });
    const pd = previa.dre.mensal;
    const iAc = pd.colunas.findIndex((c) => c.acumulado);
    const linhasPrevia = pd.linhas.filter((l) => l.tipo !== 'analitica').map((l) => {
      const v = l.valores[iAc];
      if (l.tipo === 'grupo') {
        const modelo = (motor().LINHAS_DO_MAPA.find((x) => x.id === l.id) || { rotulo: l.rotulo }).rotulo;
        return '<tr class="md-pgrupo' + (l.filhas ? '' : ' md-vazia') + (l.semLinha ? ' md-sem' : '') + '"><td>' +
          (l.semLinha ? T.esc(l.rotulo) : '<input class="md-rotulo" data-dre-rotulo="' + T.esc(l.id) + '" value="' + T.esc(ed.rotulos[l.id] || modelo) + '" placeholder="' + T.esc(modelo) + '" title="Nome da linha na DRE (clique para mudar)">') +
          ' <small>' + l.filhas + '</small></td><td class="num">' + dinheiro(v) + '</td></tr>';
      }
      return '<tr class="total' + (l.destaque ? ' destaque' : '') + '"><td>' + T.esc(l.rotulo) + '</td><td class="num">' + dinheiro(v) + '</td></tr>';
    }).join('');
    const ll = pd.linhas.find((l) => l.id === 'lucroLiquido').valores[iAc] || 0;
    const resBal = previa.dre.conferencia.reduce((s, c) => s + c.resultadoBalancete, 0);
    const fecha = Math.abs(ll - resBal) <= 1;
    const conferencia = '<p class="md-conf ' + (fecha ? 'ok' : 'neg') + '">' + (fecha ? '✓ ' : '⚠ ') + 'Lucro líquido pela DRE <b>' + dinheiro(ll) + '</b> · resultado do balancete nos mesmos meses <b>' + dinheiro(resBal) + '</b>' +
      (fecha ? ' — iguais.' : ' — a diferença são as contas marcadas "Fora da DRE".') + '</p>';
    // Por que o modelo não serve: as contas em que o código do modelo e o nome da conta discordam.
    const exemplos = ((d.avaliacao && d.avaliacao.divergencias) || []).slice(0, 3).map((x) => '<b>' + T.esc(x.conta + ' ' + x.titulo) + '</b>: pelo código do modelo iria para “' +
      T.esc(x.modelo ? rotuloDaLinha(x.modelo) : 'sem linha') + '”, pelo nome é “' + T.esc(rotuloDaLinha(x.pelosNomes)) + '”');
    const aviso = d.situacao === 'sugestao' && !mapaDaEmpresa()
      ? '<div class="aviso ambar" style="margin:0 0 10px"><span class="icone-aviso">⚠️</span><div><b>O plano de contas desta empresa é diferente do modelo da planilha.</b>' +
        (exemplos.length ? ' Exemplos: ' + exemplos.join('; ') + '.' : '') + ' Para a DRE sair certa, confira em que linha entra cada grupo de contas. ' +
        'O programa já sugeriu pelos nomes das contas: mude o que precisar e clique em <b>Confirmar</b>. Fica guardado para a empresa, em todos os anos. Até lá, a DRE, os indicadores e o relatório do cliente ficam fechados.</div></div>'
      : '';
    const estado = pend.length
      ? '<span class="md-falta">⚠ ' + pend.length + ' conta(s) com movimento sem linha (em vermelho)</span>'
      : '<span class="md-ok">✓ Todas as contas com movimento têm linha</span>';
    return tituloSecao('Linhas da DRE', 'Em que linha da DRE entra cada conta de resultado · a linha de uma conta vale para todas as de baixo, a não ser que uma de baixo tenha a sua · fica guardado para a empresa') + aviso +
      '<div class="md-barra"><button type="button" class="botao primario" data-dre="confirmar">✓ Confirmar as linhas da DRE</button>' +
      (d.situacao !== 'sugestao' || mapaDaEmpresa() ? '<button type="button" class="botao" data-dre="cancelar" title="Volta para a DRE sem mudar nada">Cancelar</button>' : '') +
      '<button type="button" class="botao pequeno" data-dre="sugestao" title="Refaz tudo pela sugestão dos nomes das contas">↺ Sugestão pelos nomes</button>' +
      '<button type="button" class="botao pequeno" data-dre="modelo" title="Refaz tudo pelos códigos do modelo da planilha">↺ Modelo da planilha</button>' +
      '<button type="button" class="botao pequeno" data-dre="abrir-tudo">＋ Abrir todas</button><button type="button" class="botao pequeno" data-dre="fechar-tudo">－ Fechar todas</button>' +
      estado + '</div>' +
      '<div class="md-grade"><div class="apres-caixa md-arvore"><table class="apres md-tabela"><thead><tr><th class="fixa">Conta de resultado</th><th class="num md-c-valor">' + T.esc(periodo) + '</th><th class="md-c-linha">Linha da DRE</th></tr></thead><tbody>' +
      (linhas || '<tr><td colspan="3" class="suave">Nenhuma conta de resultado com movimento.</td></tr>') + '</tbody></table></div>' +
      '<div class="md-lado"><h3 class="apres-sub">Prévia da DRE <small>' + T.esc(periodo) + ' · muda na hora · clique no nome de uma linha para mudar como ela aparece</small></h3>' +
      '<table class="apres md-previa"><tbody>' + linhasPrevia + '</tbody></table>' + conferencia + '</div></div>';
  }
  // Muda a linha de uma conta. Numa conta-mãe, a escolha vale para todas as de baixo (as escolhas de baixo saem).
  function mudarLinhaDre(el, conta, valor) {
    const ed = E.dreEdicao;
    if (!ed) return;
    const indice = indiceDoPlano();
    const c = indice.get(conta);
    if (!c) return;
    let tiradas = 0;
    if (!c.analitica) {
      Object.keys(ed.contas).forEach((k) => {
        let x = indice.get(k);
        while (x && x.pai) { if (x.pai === conta) { delete ed.contas[k]; tiradas++; break; } x = indice.get(x.pai); }
      });
    }
    const herdada = c.pai ? motor().linhaNoMapa(ed.contas, indice, c.pai) : null;
    if (!valor || valor === herdada) delete ed.contas[conta]; else ed.contas[conta] = valor;
    redesenharFolha(el);
    if (tiradas) T.avisoRapido(tiradas + ' conta(s) de baixo passaram a seguir esta. Abra a conta para mudar alguma.', 'ok', 4000);
  }
  function refazerLinhasDre(el, qual) {
    const ed = E.dreEdicao;
    if (!ed) return;
    ed.contas = qual === 'modelo' ? motor().mapaDoModelo(E.rel.contas) : motor().sugerirMapaDre(E.rel.contas);
    ed.abertos = new Set();
    abrirAte(ed.abertos, Object.keys(ed.contas).concat(pendentesDre().map((c) => c.conta)), indiceDoPlano());
    redesenharFolha(el);
    T.avisoRapido(qual === 'modelo' ? 'Linhas refeitas pelos códigos do modelo da planilha: confira.' : 'Linhas refeitas pela sugestão dos nomes das contas: confira.', 'ok', 3500);
  }
  async function confirmarLinhasDre(el) {
    const ed = E.dreEdicao;
    if (!ed) return;
    const pend = pendentesDre();
    if (pend.length) {
      abrirAte(ed.abertos, pend.map((c) => c.conta), indiceDoPlano());
      redesenharFolha(el);
      T.avisoRapido('Falta a linha de ' + pend.length + ' conta(s) com movimento (em vermelho): escolha a linha delas ou "Fora da DRE".', 'erro', 6000);
      return;
    }
    // As contas de outros anos (que não estão no plano deste ano) continuam como estavam.
    const salvo = mapaDaEmpresa();
    const noPlano = new Set(E.rel.contas.map((c) => c.conta));
    const contas = {};
    if (salvo) Object.keys(salvo.contas).forEach((k) => { if (!noPlano.has(k)) contas[k] = salvo.contas[k]; });
    Object.assign(contas, ed.contas);
    const rotulos = {};
    Object.keys(ed.rotulos).forEach((k) => {
      const t = String(ed.rotulos[k] || '').replace(/\s+/g, ' ').trim();
      const l = motor().LINHAS_DO_MAPA.find((x) => x.id === k);
      if (t && l && t !== l.rotulo) rotulos[k] = t.slice(0, 80);
    });
    const ok = await salvarEmpresaCliente({ mapaDre: { contas, rotulos, conferidoEm: U.agoraISO(), conferidoPor: (app().usuario && app().usuario.nome) || '' } },
      'Linhas da DRE guardadas para a empresa: a DRE, os indicadores e o relatório do cliente usam essas linhas.');
    if (!ok) return;
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'apresentacao-linhas-dre', alvo: 'apresentacao/' + E.ano, detalhe: Object.keys(contas).length + ' conta(s) no mapa' }).catch(() => {});
    E.dreEdicao = null;
    E.cacheCliente = null;
    E.rel = montarRel();
    redesenharConteudo(el);
  }

  // ---------- Balancete mensal / trimestral
  function secaoBalancete(tab, titulo) {
    const avah = E.avah;
    const ficam = contasComSaldoOuMovimento(tab.linhas);
    const linhas = tab.linhas.filter((l) => l.nivel <= E.nivel && (!ficam || ficam.has(l.conta)));
    const corpo = linhas.map((l) => '<tr class="nivel-' + Math.min(l.nivel, 5) + (l.analitica ? ' analitica' : ' sintetica') + '"><td class="fixa" style="padding-left:' + (8 + (l.nivel - 1) * 14) + 'px">' +
      (l.analitica ? marcaLalur(l.conta, l.patrimonial) : '') + '<span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.titulo) + '</td>' + celulasPeriodos(l, avah) + '</tr>').join('');
    return tituloSecao(titulo, T.esc(E.ano) + ' · ' + linhas.length + ' de ' + tab.linhas.length + ' contas · saldos devedores positivos, credores entre parênteses' + semZeradasTexto()) +
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
      // Linhas da DRE: abrir/fechar uma conta-mãe e os botões da barra.
      const abre = ev.target.closest('button[data-dre-abre]');
      if (abre && E.dreEdicao) {
        const k = abre.getAttribute('data-dre-abre');
        if (E.dreEdicao.abertos.has(k)) E.dreEdicao.abertos.delete(k); else E.dreEdicao.abertos.add(k);
        redesenharFolha(el);
        return;
      }
      const bd = ev.target.closest('button[data-dre]');
      if (bd && E.dreEdicao) {
        const q = bd.getAttribute('data-dre');
        if (q === 'confirmar') await confirmarLinhasDre(el);
        else if (q === 'cancelar') { E.dreEdicao = null; redesenharConteudo(el); }
        else if (q === 'sugestao' || q === 'modelo') refazerLinhasDre(el, q);
        else if (q === 'abrir-tudo') { E.rel.contas.forEach((c) => { if (!c.patrimonial && !c.analitica) E.dreEdicao.abertos.add(c.conta); }); redesenharFolha(el); }
        else if (q === 'fechar-tudo') { E.dreEdicao.abertos.clear(); redesenharFolha(el); }
        return;
      }
      const irAno = ev.target.closest('button[data-ir-ano]');
      if (irAno) { app().ir('#/empresa/' + encodeURIComponent(E.codigo) + '/apresentacao/' + irAno.getAttribute('data-ir-ano')); return; }
      const lb = ev.target.closest('button[data-lalur]');
      if (lb) { marcarConta(el, lb.getAttribute('data-conta'), lb.getAttribute('data-lalur')); return; }
      const lt = ev.target.closest('button[data-lalur-tirar]');
      if (lt) { marcarConta(el, lt.getAttribute('data-lalur-tirar'), null); return; }
      const g = ev.target.closest('tr.grupo[data-grupo]');
      if (g) { const id = g.getAttribute('data-grupo'); if (E.abertos.has(id)) E.abertos.delete(id); else E.abertos.add(id); redesenharFolha(el); return; }
      const casas = ev.target.closest('button[data-casas]');
      if (casas) { E.casas = Number(casas.getAttribute('data-casas')); guardarPreferencias(); redesenharConteudo(el); return; }
      const zeradas = ev.target.closest('button[data-zeradas]');
      if (zeradas) { E.semZeradas = zeradas.getAttribute('data-zeradas') === '1'; guardarPreferencias(); redesenharConteudo(el); return; }
      const milhar = ev.target.closest('button[data-milhar]');
      if (milhar) { E.milhar = milhar.getAttribute('data-milhar') === '1'; guardarPreferencias(); redesenharConteudo(el); return; }
      // Relatório do cliente: tirar uma parte (✕ na folha) ou pôr de volta (↺ na barra); vale para o mês.
      const tirarParte = ev.target.closest('button[data-rc-ocultar], button[data-rc-mostrar]');
      if (tirarParte) {
        const comp = compDoCliente();
        const id = tirarParte.getAttribute('data-rc-ocultar') || tirarParte.getAttribute('data-rc-mostrar');
        const lista = (textosDoCliente(comp).ocultas || []).filter((x) => x !== id);
        if (tirarParte.hasAttribute('data-rc-ocultar')) lista.push(id);
        guardarTextoCliente(comp, 'ocultas', lista);
        redesenharFolha(el);
        return;
      }
      const rc = ev.target.closest('button[data-rc]');
      if (rc) { await acaoCliente(el, rc.getAttribute('data-rc')); return; }
      const mais = ev.target.closest('button[data-rc-mais]');
      if (mais) { itemCliente(el, mais.getAttribute('data-rc-mais'), 'mais'); return; }
      const tira = ev.target.closest('button[data-rc-tirar]');
      if (tira) { itemCliente(el, tira.getAttribute('data-rc-tirar'), 'tirar', Number(tira.getAttribute('data-i'))); return; }
      const o = ev.target.closest('button[data-opcao]');
      if (!o) return;
      const qual = o.getAttribute('data-opcao');
      if (qual === 'abrir-tudo') { E.rel.dre.mensal.linhas.filter((l) => l.tipo === 'grupo').forEach((l) => E.abertos.add(l.id)); redesenharFolha(el); }
      else if (qual === 'fechar-tudo') { E.abertos.clear(); redesenharFolha(el); }
      else if (qual === 'guardar-parte-b') await guardarParteB(el);
      else if (qual === 'editar-ajustes') await editarAjustes();
      else if (qual === 'linhas-dre') { iniciarEdicaoDre(); redesenharConteudo(el); }
      else if (qual === 'ir-linhas-dre') { E.aba = /^dre-/.test(E.aba) ? E.aba : 'dre-mensal'; guardarPreferencias(); redesenharConteudo(el); }
    });
    // Relatório do cliente: texto reescrito na prévia (guarda ao sair do texto), mês, cor e logo.
    el.addEventListener('focusout', (ev) => {
      const alvo = ev.target.closest && ev.target.closest('.rc-previa [data-texto], .rc-previa [data-lista]');
      if (alvo) guardarEdicaoCliente(el, alvo);
    });
    // Guarda também enquanto escreve (1 s depois de parar), para nada se perder se a tela for fechada.
    let esperaTexto = null;
    el.addEventListener('input', (ev) => {
      const alvo = ev.target.closest && ev.target.closest('.rc-previa [data-texto], .rc-previa [data-lista]');
      if (!alvo) return;
      clearTimeout(esperaTexto);
      esperaTexto = setTimeout(() => guardarEdicaoCliente(el, alvo, true), 1000);
    });
    el.addEventListener('keydown', (ev) => {
      const alvo = ev.target.closest && ev.target.closest('.rc-previa [data-texto="nome"], .rc-previa [data-parte="titulo"]');
      if (alvo && ev.key === 'Enter') { ev.preventDefault(); alvo.blur(); }
    });
    el.addEventListener('change', (ev) => {
      const sd = ev.target.closest('select[data-dre-conta]');
      if (sd) { mudarLinhaDre(el, sd.getAttribute('data-dre-conta'), sd.value); return; }
      const rot = ev.target.closest('input[data-dre-rotulo]');
      if (rot && E.dreEdicao) { E.dreEdicao.rotulos[rot.getAttribute('data-dre-rotulo')] = rot.value.replace(/\s+/g, ' ').trim(); redesenharFolha(el); return; }
      if (ev.target.id === 'rc-mes') { E.clienteMes = ev.target.value; redesenharFolha(el); return; }
      if (ev.target.id === 'rc-cor') { mudarCorCliente(el, ev.target.value); return; }
      if (ev.target.id === 'rc-arquivo-logo') { trocarLogo(el, ev.target.files && ev.target.files[0]); ev.target.value = ''; return; }
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
    conferirEstouro(el);
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
    E.rel = montarRel();
    redesenharConteudo(el);
    const config = E.config;
    E.fila = (E.fila || Promise.resolve())
      .then(() => guardarConfig(config, 'apresentacao-ajustes', texto))
      .then(() => T.avisoRapido(texto + ' · LALUR recalculado.', 'ok', 2500))
      .catch((e) => { T.avisoRapido('Não foi possível guardar a marcação: ' + T.mensagemDeErro(e), 'erro'); app().mostrarRota(); });
  }

  // ------------------------------------------------------------------
  // Indicadores (Dony, 18/09/2026: "uma tela de índices — liquidez, ROI, investidores, endividamento").
  // ------------------------------------------------------------------
  function indicadoresVisiveis() { return motor().indicadores(E.rel, indicesVisiveis(), { acumulado: true }); }
  const LIMITE_IND = { x: 0.005, '%': 0.0005, 'R$': 100, dias: 0.5 };
  function fmtIndicador(tipo, v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    if (tipo === 'x') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'x';
    if (tipo === '%') return pct(v);
    if (tipo === 'dias') return Math.round(v) + ' dias';
    return dinheiro(v);
  }
  // Linha pequena com a evolução do indicador nos meses (sem o período).
  function miniLinha(valores, melhor) {
    const vs = valores.filter((v) => v !== null && isFinite(v));
    if (vs.length < 2) return '';
    const min = Math.min.apply(null, vs), max = Math.max.apply(null, vs), amp = max - min || 1;
    const pts = [];
    valores.forEach((v, i) => { if (v !== null && isFinite(v)) pts.push([(4 + (i * 102) / Math.max(1, valores.length - 1)).toFixed(1), (22 - ((v - min) / amp) * 18).toFixed(1)]); });
    const ult = pts[pts.length - 1], d = vs[vs.length - 1] - vs[vs.length - 2];
    const cor = !d ? '#8a94a1' : (d > 0) === (melhor === 'maior') ? '#1d7a4c' : '#b3261e';
    return '<svg viewBox="0 0 110 26" aria-hidden="true"><polyline points="' + pts.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="#1f4e78" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<circle cx="' + ult[0] + '" cy="' + ult[1] + '" r="2.6" fill="' + cor + '"/></svg>';
  }
  function secaoIndicadores() {
    const ind = indicadoresVisiveis();
    const n = ind.colunas.length;
    let grupo = null;
    const corpo = ind.linhas.map((l) => {
      let faixa = '';
      if (l.grupo !== grupo) { grupo = l.grupo; faixa = '<tr class="cat"><td class="fixa">' + T.esc(grupo) + '</td><td colspan="' + (n + 1) + '"></td></tr>'; }
      const celulas = l.valores.map((v, i) => {
        const col = ind.colunas[i], ant = i > 0 && !ind.colunas[i - 1].acumulado ? l.valores[i - 1] : null;
        let seta = '';
        if (!col.acumulado && v !== null && ant !== null && Math.abs(v - ant) >= LIMITE_IND[l.tipo]) {
          const bom = (v > ant) === (l.melhor === 'maior');
          seta = '<span class="ind-seta ' + (bom ? 'bom' : 'ruim') + '" title="' + (bom ? 'Melhorou' : 'Piorou') + ' sobre ' + T.esc(ind.colunas[i - 1].rotulo) + '">' + (v > ant ? '▲' : '▼') + '</span>';
        }
        return '<td class="num' + (col.acumulado ? ' acum' : '') + '">' + fmtIndicador(l.tipo, v) + seta + '</td>';
      }).join('');
      return faixa + '<tr><td class="fixa"><b>' + T.esc(l.rotulo) + '</b><small>' + T.esc(l.formula) + '</small></td>' + celulas +
        '<td class="evolucao">' + miniLinha(l.valores.slice(0, ind.colunas.filter((c) => !c.acumulado).length), l.melhor) + '</td></tr>';
    }).join('');
    const colunas = ind.colunas.map((c) => '<th class="num per' + (c.acumulado ? ' acum' : '') + (c.falta ? ' falta' : '') + '">' + T.esc(c.rotulo) + '</th>').join('');
    const contas = '<p class="ind-contas">Contas usadas (achadas pelo nome no plano de contas): ' + ind.contas.map((c) => '<b>' + T.esc(c.nome) + '</b> = ' +
      (c.conta ? T.esc(c.conta + ' ' + c.titulo) : c.calculo ? 'calculado: ' + T.esc(c.calculo) : '<span class="rel-aviso">não achada</span>')).join(' · ') + '. PL* = ativo total − passivo circulante − passivo não circulante ' +
      '(inclui o resultado do ano que ainda não foi encerrado no balancete).</p>';
    const falta = ind.faltam.length ? '<div class="aviso ambar nao-imprimir" style="margin:0 0 10px"><span class="icone-aviso">⚠️</span><div>Não achei no plano de contas: ' + T.esc(ind.faltam.join(', ')) +
      '. Os indicadores que dependem dessas contas ficam vazios.</div></div>' : '';
    return tituloSecao('Indicadores financeiros e patrimoniais', T.esc(E.ano) + ' · liquidez, endividamento, rentabilidade e retorno (ROI e ROE) e prazos médios') + falta +
      '<div class="apres-caixa"><table class="apres indicadores"><thead><tr><th class="fixa">Indicador</th>' + colunas + '<th>Evolução</th></tr></thead><tbody>' + corpo + '</tbody></table></div>' + contas;
  }

  // ------------------------------------------------------------------
  // COMPARATIVO com o ano anterior (Dony, 21/09/2026: "quero poder jogar os balancetes de 2025 das empresas,
  // para poder fazer comparação" — escolheu a aba Comparativo): os meses escolhidos lado a lado com os mesmos
  // meses do ano anterior. O relatório do ano anterior é montado com as mesmas linhas da DRE da empresa.
  // ------------------------------------------------------------------
  function relAnterior() {
    if (!E.balancetesAnt || !E.balancetesAnt.length) return null;
    const m = mapaDaEmpresa();
    const chave = E.balancetesAnt.length + '|' + E.rel.dre.situacao + '|' + (m ? (m.conferidoEm || '') + Object.keys(m.contas).length : '');
    if (!E.relAnt || E.relAnt.chave !== chave) {
      E.relAnt = { chave, rel: motor().montar({ ano: E.ano - 1, balancetes: E.balancetesAnt, config: {}, mapaDre: m, dreModo: E.rel.dre.situacao === 'modelo' ? 'modelo' : undefined }) };
    }
    return E.relAnt.rel;
  }
  function comparativoVisivel() {
    const ant = relAnterior();
    return ant ? { ant, c: motor().comparativo(E.rel, ant, indicesVisiveis()) } : null;
  }
  // "Jan–Jul/26", "Jul/26", "Jan, Mar/26".
  function periodoDoAno(rel, lista, ano) {
    if (!lista.length) return 'sem balancete';
    const r = rotuloSelecao(lista.map((k) => rel.meses[k]));
    return /\/\d{2}$/.test(r) ? r : r + '/' + String(ano).slice(2);
  }
  function rotulosComparativo(c, ant) {
    const k = c.mesDoBalanco;
    return { atual: periodoDoAno(E.rel, c.mesesAtual, E.ano), anterior: periodoDoAno(ant, c.mesesAnterior, E.ano - 1),
      balAtual: k === null ? '' : 'Fim de ' + E.rel.meses[k].rotulo, balAnterior: k === null ? '' : 'Fim de ' + ant.meses[k].rotulo };
  }
  // A variação com a cor: verde quando melhora, vermelho quando piora (na DRE e no balanço, o valor maior é melhor
  // nas receitas e no lucro; nas linhas de custo e despesa o valor vem negativo, então o maior também é o melhor).
  function variacaoCor(v, texto) {
    if (v === null || v === undefined || !isFinite(v) || !Math.round(v * 1000)) return texto;
    return '<span class="' + (v > 0 ? 'var-bom' : 'var-ruim') + '">' + texto + '</span>';
  }
  function difIndicador(l) {
    const d = l.diferenca;
    if (d === null || d === undefined || !isFinite(d) || Math.abs(d) < LIMITE_IND[l.tipo]) return d === null || d === undefined ? '' : '<span class="zero">–</span>';
    const bom = (d > 0) === (l.melhor === 'maior');
    const sinal = d > 0 ? '+' : '−';
    const t = l.tipo === 'x' ? sinal + Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'x'
      : l.tipo === '%' ? sinal + (Math.abs(d) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' p.p.'
        : l.tipo === 'dias' ? sinal + Math.round(Math.abs(d)) + ' dias' : sinal + ' ' + dinheiro(Math.abs(d));
    return '<span class="ind-seta ' + (bom ? 'bom' : 'ruim') + '">' + (d > 0 ? '▲' : '▼') + '</span> <span class="' + (bom ? 'var-bom' : 'var-ruim') + '">' + t + '</span>';
  }
  const zeradaNosDois = (l) => !Math.round(l.atual || 0) && !Math.round(l.anterior || 0);

  function secaoComparativo(op) {
    const x = comparativoVisivel();
    const anoAnt = E.ano - 1;
    if (!x) {
      return tituloSecao('Comparativo com ' + anoAnt, '') +
        '<div class="aviso ambar"><span class="icone-aviso">📂</span><div><b>Ainda não há balancete de ' + anoAnt + ' nesta empresa.</b> Para comparar, escolha <b>' + anoAnt +
        '</b> no ano, lá em cima, e carregue o balancete de cada mês no lugar dele. Depois volte para ' + E.ano + ' e abra esta aba.' +
        '<div style="margin-top:8px"><button type="button" class="botao" data-ir-ano="' + anoAnt + '">Ir para ' + anoAnt + '</button></div></div></div>';
    }
    const { c, ant } = x;
    const rot = rotulosComparativo(c, ant);
    const avah = E.avah;
    const abrirTudo = !!(op && op.abrirTudo);
    const faltam = c.faltamNoAnterior.map((k) => ant.meses[k].rotulo);
    const aviso = faltam.length
      ? '<div class="aviso ambar" style="margin:0 0 10px"><span class="icone-aviso">⚠️</span><div>' + anoAnt + ' não tem balancete de <b>' + T.esc(faltam.join(', ')) + '</b>: ' +
        (c.mesesAnterior.length ? 'a comparação desses meses fica só com ' + E.ano + '.' : 'não há o que comparar nos meses escolhidos.') +
        (c.balancoSemAnterior ? ' O balanço de ' + T.esc(ant.meses[c.mesDoBalanco].rotulo) + ' também fica sem o ano anterior.' : '') + '</div></div>'
      : '';
    // DRE: as linhas da DRE com os dois anos, a variação e (com AV %) a análise vertical de cada ano.
    const nCols = 5 + (avah ? 2 : 0);
    const SEM_FAIXA = { 'Subtotal CPC 51': true, Subtotal: true, Resultado: true };
    let categoria = null;
    const celulas = (l) => '<td class="num">' + dinheiro(l.atual) + '</td>' + (avah ? '<td class="num pct">' + pct(l.avAtual) + '</td>' : '') +
      '<td class="num">' + dinheiro(l.anterior) + '</td>' + (avah ? '<td class="num pct">' + pct(l.avAnterior) + '</td>' : '') +
      '<td class="num acum">' + variacaoCor(l.varR, dinheiro(l.varR)) + '</td><td class="num pct acum">' + variacaoCor(l.varP, pct(l.varP)) + '</td>';
    const dre = c.dre.map((l) => {
      let faixa = '';
      if (l.categoria !== categoria) {
        categoria = l.categoria;
        if (!SEM_FAIXA[categoria]) faixa = '<tr class="cat"><td class="fixa">' + T.esc(categoria) + '</td><td colspan="' + (nCols - 1) + '"></td></tr>';
      }
      const aberto = abrirTudo || E.abertos.has(l.grupo || l.id);
      if (l.tipo === 'analitica') {
        if (!aberto || (E.semZeradas && zeradaNosDois(l))) return faixa;
        const so = l.soNoAnterior ? ' <small class="suave">(só em ' + anoAnt + ')</small>' : l.soNoAtual ? ' <small class="suave">(nova em ' + E.ano + ')</small>' : '';
        return faixa + '<tr class="analitica" data-de="' + T.esc(l.grupo) + '"><td class="fixa"><span class="cod">' + T.esc(l.conta) + '</span> ' + T.esc(l.rotulo) + so + '</td>' + celulas(l) + '</tr>';
      }
      if (l.tipo === 'grupo') {
        return faixa + '<tr class="grupo" data-grupo="' + T.esc(l.id) + '" title="' + (aberto ? 'Fechar' : 'Abrir') + ' as ' + l.filhas + ' conta(s)"><td class="fixa"><span class="abre nao-imprimir">' +
          (aberto ? '▾' : '▸') + '</span>' + T.esc(l.rotulo) + ' <small>' + l.filhas + '</small></td>' + celulas(l) + '</tr>';
      }
      return faixa + '<tr class="total' + (l.destaque ? ' destaque' : '') + '"><td class="fixa">' + T.esc(l.rotulo) + '</td>' + celulas(l) + '</tr>';
    }).join('');
    const cabDre = '<thead><tr><th class="fixa">Linha / Conta analítica</th><th class="num per">' + T.esc(rot.atual) + '</th>' + (avah ? '<th class="num pct">AV %</th>' : '') +
      '<th class="num per">' + T.esc(rot.anterior) + '</th>' + (avah ? '<th class="num pct">AV %</th>' : '') + '<th class="num per acum">Variação R$</th><th class="num pct acum">Variação %</th></tr></thead>';
    // Balanço: o fim do último mês escolhido nos dois anos.
    const balanco = c.balanco.map((l) => {
      if (E.semZeradas && l.conta && l.tipo === 'conta' && zeradaNosDois(l)) return '';
      const cls = l.tipo === 'total' ? 'total' + (l.destaque ? ' destaque' : '') : l.tipo === 'grupo' ? 'bal-grupo' : l.tipo === 'resultado' ? 'bal-resultado' : 'bal-conta';
      return '<tr class="' + cls + '"><td class="fixa" style="padding-left:' + (8 + ((l.nivel || 1) - 1) * 16) + 'px">' + (l.conta ? '<span class="cod">' + T.esc(l.conta) + '</span> ' : '') + T.esc(l.rotulo) + '</td>' +
        '<td class="num">' + dinheiro(l.atual) + '</td><td class="num">' + dinheiro(l.anterior) + '</td><td class="num acum">' + dinheiro(l.varR) + '</td><td class="num pct acum">' + pct(l.varP) + '</td></tr>';
    }).join('');
    // Indicadores do período nos dois anos e a diferença.
    let grupo = null;
    const indicadores = c.indicadores.map((l) => {
      let faixa = '';
      if (l.grupo !== grupo) { grupo = l.grupo; faixa = '<tr class="cat"><td class="fixa">' + T.esc(grupo) + '</td><td colspan="3"></td></tr>'; }
      return faixa + '<tr><td class="fixa"><b>' + T.esc(l.rotulo) + '</b><small>' + T.esc(l.formula) + '</small></td><td class="num">' + fmtIndicador(l.tipo, l.atual) + '</td><td class="num">' +
        fmtIndicador(l.tipo, l.anterior) + '</td><td class="num acum">' + difIndicador(l) + '</td></tr>';
    }).join('');
    return tituloSecao('Comparativo com ' + anoAnt, T.esc(rot.atual) + ' × ' + T.esc(rot.anterior) + ' · ' + valoresEm() + ' · receitas positivas, custos e despesas entre parênteses' + semZeradasTexto()) + aviso +
      '<h3 class="apres-sub">DRE · a soma dos meses</h3>' +
      '<div class="apres-caixa"><table class="apres dre comparativo">' + cabDre + '<tbody>' + dre + '</tbody></table></div>' +
      '<h3 class="apres-sub">Balanço patrimonial · o saldo do fim do mês</h3>' +
      '<div class="apres-caixa"><table class="apres balanco comparativo"><thead><tr><th class="fixa">Balanço patrimonial</th><th class="num per">' + T.esc(rot.balAtual) + '</th><th class="num per">' +
      T.esc(rot.balAnterior) + '</th><th class="num per acum">Variação R$</th><th class="num pct acum">Variação %</th></tr></thead><tbody>' + balanco + '</tbody></table></div>' +
      '<h3 class="apres-sub">Indicadores · o período (resultado somado nos meses, balanço do último mês)</h3>' +
      '<div class="apres-caixa"><table class="apres indicadores comparativo"><thead><tr><th class="fixa">Indicador</th><th class="num per">' + T.esc(rot.atual) + '</th><th class="num per">' + T.esc(rot.anterior) +
      '</th><th class="num per acum">Diferença</th></tr></thead><tbody>' + indicadores + '</tbody></table></div>';
  }

  // ------------------------------------------------------------------
  // Relatório para o cliente (Dony, 18/09/2026: "um imprimir relatório para o cliente, desta forma aí,
  // mostrando as variações; e um lugar em que eu coloque o logo da empresa"). As folhas vêm do
  // relatorio-cliente.js; aqui ficam a prévia, os textos reescritos, o logo, a cor e a impressão.
  // Textos guardados no registro do ano: config.cliente = { fixos: { nome, titulo, subtitulo }, meses: { <comp>: {...} } }.
  // Logo e cor ficam no cadastro da empresa (valem para todos os anos).
  // ------------------------------------------------------------------
  function mesesDoCliente() { return E.rel.meses.filter((m) => m.tem); }
  function compDoCliente() {
    const ms = mesesDoCliente();
    if (!ms.length) return null;
    return ms.some((m) => m.comp === E.clienteMes) ? E.clienteMes : ms[ms.length - 1].comp;
  }
  // O relatório cortado no mês escolhido (o trimestre do LALUR vai até esse mês).
  function relDoCliente(comp) {
    if (E.cacheCliente && E.cacheCliente.comp === comp && E.cacheCliente.base === E.rel) return E.cacheCliente.rel;
    // Mesmas linhas da DRE da tela (o modelo, se ele serve para o ano todo, vale também no mês cortado).
    const rel = montarRel(E.balancetes.filter((b) => b.competencia <= comp), E.rel.dre.situacao === 'modelo' ? 'modelo' : undefined);
    E.cacheCliente = { comp, base: E.rel, rel };
    return rel;
  }
  function textosDoCliente(comp) { const c = E.config.cliente || {}; return Object.assign({}, c.fixos || {}, (c.meses || {})[comp] || {}); }
  function corDoCliente() { return E.emp.corRelatorio || raiz.RelatorioCliente.COR_PADRAO; }
  function montarCliente(editavel) {
    const comp = compDoCliente();
    const r = raiz.RelatorioCliente.montar({ rel: relDoCliente(comp), comp, emp: { nome: E.emp.nome, cnpj: E.emp.cnpj, logo: E.emp.logo }, cor: corDoCliente(),
      textos: textosDoCliente(comp), editavel, emissao: U.dataHoraLocal(U.agoraISO()).slice(0, 10), formato: { casas: E.casas, milhar: E.milhar },
      ocultas: textosDoCliente(comp).ocultas || [] });
    if (editavel) E.ultimoCliente = r.textos;
    return r;
  }
  function secaoCliente(op) {
    const ms = mesesDoCliente();
    if (!ms.length) return '<p class="suave">Carregue os balancetes para montar o relatório do cliente.</p>';
    if (op && op.impressao) return montarCliente(false).html;
    const comp = compDoCliente();
    const r = montarCliente(true);
    const k = ms.findIndex((m) => m.comp === comp);
    const par = k > 0 ? 'Comparativo ' + ms[k - 1].rotulo + ' × ' + ms[k].rotulo : 'Primeiro mês com balancete: sem comparativo';
    const barra = '<div class="rc-barra nao-imprimir">' +
      '<label>Mês do relatório <select class="apres-campo" id="rc-mes">' + ms.map((m) => '<option value="' + m.comp + '"' + (m.comp === comp ? ' selected' : '') + '>' + T.esc(m.rotulo) + '</option>').join('') + '</select></label>' +
      '<span class="rc-par">' + T.esc(par) + ' · ' + r.paginas + ' folhas</span>' +
      (r.tiradas.length ? '<span class="rc-tiradas"><span class="suave pequeno">Tiradas:</span>' + r.tiradas.map((x) => '<button type="button" class="botao pequeno" data-rc-mostrar="' + T.esc(x.id) + '" title="Pôr de volta no relatório">↺ ' + T.esc(x.rotulo) + '</button>').join('') + '</span>' : '') +
      (E.emp.logo ? '<img class="rc-logo-mini" src="' + T.esc(E.emp.logo) + '" alt="Logo da empresa">' : '<span class="rc-sem-logo">sem logo</span>') +
      '<button type="button" class="botao pequeno" data-rc="logo">🖼 ' + (E.emp.logo ? 'Trocar o logo' : 'Colocar o logo da empresa') + '</button>' +
      (E.emp.logo ? '<button type="button" class="botao pequeno" data-rc="tirar-logo">Tirar o logo</button>' : '') +
      '<input type="file" id="rc-arquivo-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>' +
      '<label title="A cor da capa, dos títulos, dos gráficos e das tabelas">Cor <input type="color" id="rc-cor" value="' + T.esc(corDoCliente()) + '"></label>' +
      '<span class="rc-direita"><button type="button" class="botao pequeno" data-rc="textos-auto" title="Desfaz o que foi escrito neste mês e volta aos textos que o programa monta">↺ Textos automáticos</button>' +
      '<button type="button" class="botao primario" data-rc="imprimir" title="Na janela de impressão, escolha “Salvar como PDF” para mandar ao cliente">🖨 Imprimir / salvar PDF</button></span></div>';
    return barra + '<p class="rc-ajuda nao-imprimir">É assim que sai para o cliente (folhas A4 em pé). <b>Dá para reescrever qualquer texto direto na folha</b>: clique nele e escreva; ' +
      'fica guardado para este mês. O nome no topo das folhas, o título e o subtítulo da capa valem para todos os meses.</p>' +
      '<p class="rc-aviso-estouro nao-imprimir" id="rc-estouro" hidden></p><div class="rc-previa">' + r.html + '</div>';
  }
  // Texto que passou do tamanho da folha: a folha fica com borda vermelha e um aviso em cima.
  function conferirEstouro(el) {
    const aviso = el.querySelector('#rc-estouro');
    if (!aviso) return;
    const cheias = [];
    el.querySelectorAll('.rc-previa .rc-pagina').forEach((p, i) => { const passou = p.scrollHeight > p.clientHeight + 2; p.classList.toggle('rc-estourou', passou); if (passou) cheias.push(i + 1); });
    aviso.hidden = !cheias.length;
    aviso.textContent = cheias.length ? '⚠️ O texto passou do tamanho da folha ' + cheias.join(', ') + ': encurte, senão a parte de baixo sai cortada.' : '';
  }
  const ESPACO_DURO = new RegExp(String.fromCharCode(160), 'g');
  const limparTexto = (s) => String(s || '').replace(ESPACO_DURO, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  function guardarTextoCliente(comp, chave, valor) {
    const cli = JSON.parse(JSON.stringify(E.config.cliente || {}));
    if (raiz.RelatorioCliente.TEXTOS_FIXOS.indexOf(chave) >= 0) cli.fixos = Object.assign({}, cli.fixos || {}, { [chave]: valor });
    else { cli.meses = cli.meses || {}; cli.meses[comp] = Object.assign({}, cli.meses[comp] || {}, { [chave]: valor }); }
    E.config = Object.assign({}, E.config, { cliente: cli });
    if (E.ultimoCliente) E.ultimoCliente[chave] = valor;
    salvarEmFila('apresentacao-cliente', 'Relatório do cliente ' + String(comp).slice(0, 7) + ': ' + chave);
  }
  function guardarEdicaoCliente(el, alvo, digitando) {
    const comp = compDoCliente();
    const previa = el.querySelector('.rc-previa');
    if (!comp || !previa) return;
    const campo = alvo.getAttribute('data-texto');
    let chave, valor, redesenhar = false;
    if (campo) {
      chave = campo;
      valor = limparTexto(alvo.innerText);
      if (campo === 'nome' || campo === 'titulo') valor = valor.replace(/\s*\n\s*/g, ' ');
      redesenhar = campo === 'nome';
    } else {
      chave = alvo.getAttribute('data-lista');
      const itens = Array.from(previa.querySelectorAll('[data-lista="' + chave + '"]'));
      if (chave === 'recomendacoes') {
        const porItem = new Map();
        itens.forEach((x) => { const i = x.getAttribute('data-i'); const o = porItem.get(i) || { titulo: '', texto: '' }; o[x.getAttribute('data-parte')] = limparTexto(x.innerText); porItem.set(i, o); });
        valor = Array.from(porItem.values());
        redesenhar = valor.some((o) => !o.titulo && !o.texto);
        valor = valor.filter((o) => o.titulo || o.texto);
      } else {
        valor = itens.map((x) => limparTexto(x.innerText));
        redesenhar = valor.some((x) => !x);
        valor = valor.filter(Boolean);
      }
    }
    const antes = E.ultimoCliente ? E.ultimoCliente[chave] : undefined;
    if (JSON.stringify(antes) !== JSON.stringify(valor)) guardarTextoCliente(comp, chave, valor);
    if (digitando) return;
    if (redesenhar) setTimeout(() => redesenharFolha(el), 0);
    else conferirEstouro(el);
  }
  function itemCliente(el, lista, acao, i) {
    const comp = compDoCliente();
    const atual = ((E.ultimoCliente && E.ultimoCliente[lista]) || []).slice();
    if (acao === 'mais') atual.push(lista === 'recomendacoes' ? { titulo: 'Nova recomendação', texto: 'Escreva aqui o que recomendar.' } : 'Escreva aqui.');
    else atual.splice(i, 1);
    guardarTextoCliente(comp, lista, atual);
    redesenharFolha(el);
    if (acao !== 'mais') return;
    const itens = el.querySelectorAll('.rc-previa [data-lista="' + lista + '"]');
    const novo = itens[itens.length - (lista === 'recomendacoes' ? 2 : 1)];
    if (novo) {
      novo.focus();
      const faixa = document.createRange(); faixa.selectNodeContents(novo);
      const sel = raiz.getSelection(); sel.removeAllRanges(); sel.addRange(faixa);
    }
  }
  async function acaoCliente(el, qual) {
    if (qual === 'logo') { const inp = el.querySelector('#rc-arquivo-logo'); if (inp) inp.click(); return; }
    if (qual === 'tirar-logo') { if (await salvarEmpresaCliente({ logo: '' }, 'Logo tirado do relatório.')) redesenharFolha(el); return; }
    if (qual === 'imprimir') { await imprimirCliente(); return; }
    if (qual === 'textos-auto') {
      const comp = compDoCliente();
      const ok = await T.janela({ titulo: 'Voltar aos textos automáticos',
        corpo: '<p style="margin:0;line-height:1.5">Os textos que você escreveu no relatório de <b>' + T.esc(U.nomeCompetencia(comp)) + '</b> voltam a ser os que o programa monta pelos números. ' +
          'O nome no topo, o título e o subtítulo também voltam ao padrão.</p>',
        botoes: [{ texto: 'Cancelar', valor: false }, { texto: '↺ Voltar aos automáticos', tipo: 'primario', valor: true }] });
      if (!ok) return;
      const cli = JSON.parse(JSON.stringify(E.config.cliente || {}));
      delete cli.fixos;
      if (cli.meses) delete cli.meses[comp];
      E.config = Object.assign({}, E.config, { cliente: cli });
      salvarEmFila('apresentacao-cliente', 'Relatório do cliente ' + String(comp).slice(0, 7) + ': textos automáticos', 'Textos automáticos de volta.');
      redesenharFolha(el);
    }
  }
  async function salvarEmpresaCliente(mudancas, aviso) {
    try {
      const salvo = await app().armazenamento.salvarEmpresa(Object.assign({}, E.emp, mudancas));
      const lista = app().empresas || [];
      const i = lista.findIndex((e) => String(e.codigo) === String(E.codigo));
      if (i >= 0) lista[i] = salvo;
      E.emp = salvo;
      if (aviso) T.avisoRapido(aviso, 'ok', 3500);
      return true;
    } catch (e) {
      T.avisoRapido('Não foi possível guardar: ' + T.mensagemDeErro(e), 'erro', 6000);
      return false;
    }
  }
  async function mudarCorCliente(el, cor) {
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return;
    if (await salvarEmpresaCliente({ corRelatorio: cor })) redesenharFolha(el);
  }
  // Lê o logo: reduz (até 900 × 450) e acha a cor principal dele para o relatório.
  async function lerLogo(arquivo) {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) throw new Error('Escolha uma imagem PNG, JPG, WEBP ou SVG.');
    if (arquivo.size > 8 * 1024 * 1024) throw new Error('Imagem grande demais (mais de 8 MB).');
    const original = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(r.error); r.readAsDataURL(arquivo); });
    const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('Não consegui abrir essa imagem.')); i.src = original; });
    const w = img.naturalWidth || 600, h = img.naturalHeight || 300;
    const escala = Math.min(1, 900 / w, 450 / h);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * escala)); cv.height = Math.max(1, Math.round(h * escala));
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, cv.width, cv.height);
    let cor = null;
    try { cor = raiz.RelatorioCliente.corDoLogo(g.getImageData(0, 0, cv.width, cv.height).data); } catch (e) { /* sem acesso aos pixels: fica a cor que já estava */ }
    let logo = original;
    if (arquivo.type !== 'image/svg+xml') {
      const reduzido = cv.toDataURL(arquivo.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      if (escala < 1 || reduzido.length < original.length || arquivo.type === 'image/webp') logo = reduzido;
    }
    if (logo.length > 550000) throw new Error('O logo ficou grande demais mesmo reduzido. Use uma imagem menor (até uns 300 KB).');
    return { logo, cor };
  }
  async function trocarLogo(el, arquivo) {
    if (!arquivo) return;
    try {
      const { logo, cor } = await lerLogo(arquivo);
      const mudancas = { logo };
      if (cor) mudancas.corRelatorio = cor;
      if (await salvarEmpresaCliente(mudancas, 'Logo guardado' + (cor ? '; a cor do relatório veio do logo (dá para trocar no quadradinho “Cor”).' : '.'))) redesenharFolha(el);
    } catch (e) { T.avisoRapido(T.mensagemDeErro(e), 'erro', 6000); }
  }
  async function imprimirCliente() {
    const comp = compDoCliente();
    if (!comp) return;
    const alvo = document.getElementById('apres-impressao');
    alvo.innerHTML = montarCliente(false).html;
    await Promise.all(Array.from(alvo.querySelectorAll('img')).map((i) => (i.decode ? i.decode().catch(() => null) : null)));
    document.body.classList.add('imprimindo-cliente');
    const antes = document.title;
    const mes = E.rel.meses.find((m) => m.comp === comp);
    document.title = 'Relatório de variações ' + E.emp.nome + ' ' + (mes ? mes.rotulo.replace('/', '-') : '');
    const fim = () => { document.body.classList.remove('imprimindo-cliente'); alvo.innerHTML = ''; document.title = antes; raiz.removeEventListener('afterprint', fim); };
    raiz.addEventListener('afterprint', fim);
    setTimeout(() => raiz.print(), 80);
    app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'apresentacao-cliente-impresso', alvo: 'apresentacao/' + E.ano, detalhe: String(comp).slice(0, 7) }).catch(() => {});
  }
  // Guarda a configuração em fila (cliques e textos em sequência não se atropelam).
  function salvarEmFila(acao, detalhe, aviso) {
    const config = E.config;
    E.fila = (E.fila || Promise.resolve())
      .then(() => guardarConfig(config, acao, detalhe))
      .then(() => { if (aviso) T.avisoRapido(aviso, 'ok', 2500); })
      .catch((e) => { T.avisoRapido('Não foi possível guardar: ' + T.mensagemDeErro(e), 'erro'); app().mostrarRota(); });
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
      corpo: '<p class="suave pequeno" style="margin:0 0 8px">Escolha as partes. Cada uma começa numa folha nova, deitada. O balancete sai até o nível e com as opções que estão na tela.' +
        (dreFechada() ? ' <b>A DRE e os indicadores ficam de fora até as linhas da DRE desta empresa serem conferidas.</b>' : '') + '</p>' +
        ABAS.filter((a) => a.id !== 'cliente' && !(dreFechada() && (/^dre-/.test(a.id) || a.id === 'indicadores' || a.id === 'comparativo')) && !(a.id === 'comparativo' && !E.balancetesAnt.length))
          .map((a) => '<label class="item-aba"><input type="checkbox" value="' + a.id + '"' + (/^balancete/.test(a.id) ? '' : ' checked') + '> ' + a.titulo + '</label>').join('') +
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
      (E.selecao ? 'visões mensais com os meses escolhidos: ' + T.esc(rotuloSelecao(mesesVisiveis())) + ' · ' : '') + T.esc(valoresEm()) + ' · ' +
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

  // "#,##0.00" com as casas escolhidas; em R$ mil, a vírgula no fim do formato faz o Excel mostrar o valor ÷ 1.000.
  function formatoDinheiroExcel() {
    const p = '#,##0' + (E.casas ? '.' + '0'.repeat(E.casas) : '') + (E.milhar ? ',' : '');
    return p + ';[Red]\\(' + p + '\\);"–"';
  }
  function estilosDoExcel() {
    const FMT_DIN = formatoDinheiroExcel();
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
      e[t + '.val'] = Object.assign({}, base, { formato: FMT_DIN, borda: borda() });
      e[t + '.pct'] = Object.assign({}, base, { formato: 'porcento', tam: 9, cor: b.cor || COR.suave, borda: borda() });
      e[t + '.val.acum'] = Object.assign({}, base, { formato: FMT_DIN, negrito: true, fundo: ACUM[t], borda: borda({ esq: { estilo: 'medium', cor: COR.azul } }) });
      e[t + '.pct.acum'] = Object.assign({}, base, { formato: 'porcento', tam: 9, cor: b.cor || COR.suave, fundo: ACUM[t], borda: borda() });
    });
    // Indicadores: "1,56x", "12,5%", R$ e "38 dias"; o período com fundo e a linha à esquerda.
    const FMT_IND = { x: '0.00"x";[Red]-0.00"x";"–"', pct: 'porcento', val: FMT_DIN, dias: '0" dias";[Red]-0" dias";"–"' };
    Object.keys(FMT_IND).forEach((k) => {
      e['ind.' + k] = { formato: FMT_IND[k], cor: COR.texto, borda: { baixo: { cor: COR.linha } } };
      e['ind.' + k + '.acum'] = { formato: FMT_IND[k], negrito: true, cor: COR.texto, fundo: 'FFEEF3F8', borda: { baixo: { cor: COR.linha }, esq: { estilo: 'medium', cor: COR.azul } } };
    });
    e['ind.formula'] = { tam: 9, cor: COR.suave, borda: { baixo: { cor: COR.linha } } };
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
    f.titulo = (titulo, sub) => {
      const nota = !numerosPadrao() && String(sub || '').indexOf('valores em') < 0 ? (sub ? ' · ' : '') + valoresEm() : '';
      f.add([{ v: E.emp.nome + ' — ' + titulo, e: 'titulo' }], { altura: 22 }); f.add([{ v: (sub || '') + nota, e: 'subtitulo' }]); f.vazia();
    };
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

  // Indicadores: os meses escolhidos e o período (resultado somado nos meses, balanço do último mês).
  function folhaIndicadores() {
    const ind = indicadoresVisiveis();
    const larg = larguraValor([ind.linhas.find((l) => l.id === 'ccl').valores], 14);
    const f = novaFolha('Indicadores', [44, 72].concat(ind.colunas.map(() => larg)));
    f.titulo('Indicadores financeiros e patrimoniais', E.ano + ' · balanço pelo saldo do fim do mês; resultado pelo movimento do mês · Período: resultado somado nos meses e balanço do último mês' +
      ' · PL* = ativo total − passivo circulante − passivo não circulante');
    const r1 = f.add([{ v: 'Indicador', e: 'cabEsq' }, { v: 'Fórmula', e: 'cabEsq' }].concat(ind.colunas.map((c) => ({ v: c.rotulo, e: c.acumulado ? 'cabAcum' : 'cab' }))), { altura: 30 });
    const ESTILO = { x: 'ind.x', '%': 'ind.pct', 'R$': 'ind.val', dias: 'ind.dias' };
    let grupo = null;
    ind.linhas.forEach((l) => {
      if (l.grupo !== grupo) {
        grupo = l.grupo;
        f.add([{ v: grupo.toUpperCase(), e: 'cat' }].concat(Array.from({ length: ind.colunas.length + 1 }, () => ({ v: '', e: 'cat' }))), { altura: 16 });
      }
      f.add([{ v: l.rotulo, e: 'ana.rot0' }, { v: l.formula, e: 'ind.formula' }].concat(l.valores.map((v, k) => ({ v: l.tipo === 'R$' ? R(v) : P(v), e: ESTILO[l.tipo] + (ind.colunas[k].acumulado ? '.acum' : '') }))));
    });
    f.vazia();
    f.add([{ v: 'Contas usadas (achadas pelo nome no plano de contas):', e: 'subtitulo' }]);
    ind.contas.forEach((c) => f.add([{ v: c.nome, e: 'ind.formula' }, { v: c.conta ? c.conta + ' ' + c.titulo : c.calculo ? 'calculado: ' + c.calculo : 'não achada', e: 'ind.formula' }]));
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    return f;
  }

  // Comparativo com o ano anterior: a DRE (soma dos meses), o balanço (fim do último mês) e os indicadores do período.
  function folhaComparativo() {
    const { c, ant } = comparativoVisivel();
    const rot = rotulosComparativo(c, ant);
    const avah = E.avah;
    const larg = larguraValor([].concat(...[c.dre, c.balanco].map((ls) => [ls.map((l) => l.atual), ls.map((l) => l.anterior), ls.map((l) => l.varR)])), 16);
    const lpct = Math.max(9, larguraPct([c.dre.map((l) => l.varP), c.balanco.map((l) => l.varP)]));
    const f = novaFolha('Comparativo', [52, 18, larg].concat(avah ? [9] : [], [larg], avah ? [9] : [], [larg, lpct]), { resumoAcima: true });
    f.titulo('Comparativo com ' + (E.ano - 1), rot.atual + ' × ' + rot.anterior + ' · DRE: a soma dos meses · balanço: o saldo do fim do último mês · indicadores: o período · ' +
      'variação % sobre ' + (E.ano - 1) + ' · receitas positivas, custos e despesas entre parênteses' + semZeradasTexto());
    const faltam = c.faltamNoAnterior.map((k) => ant.meses[k].rotulo);
    if (faltam.length) f.add([{ v: (E.ano - 1) + ' não tem balancete de ' + faltam.join(', ') + ': a comparação desses meses fica só com ' + E.ano + '.', e: 'subtitulo' }]);
    const nCols = 5 + (avah ? 2 : 0);
    const cab = (titulo, a, b, meio, fim) => f.add([{ v: titulo, e: 'cabEsq' }, { v: meio || 'Conta', e: 'cab' }, { v: a, e: 'cab' }].concat(avah ? [{ v: 'AV %', e: 'cab' }] : [], [{ v: b, e: 'cab' }],
      avah ? [{ v: 'AV %', e: 'cab' }] : [], [{ v: fim ? fim[0] : 'Variação R$', e: 'cabAcum' }, { v: fim ? fim[1] : 'Variação %', e: 'cabAcum' }]), { altura: 30 });
    const r1 = cab('DRE · a soma dos meses', rot.atual, rot.anterior);
    const SEM_FAIXA = { 'Subtotal CPC 51': true, Subtotal: true, Resultado: true };
    let categoria = null;
    const valores = (t, l, comAv) => [{ v: R(l.atual), e: t + '.val' }].concat(avah ? [{ v: comAv ? P(l.avAtual) : null, e: t + '.pct' }] : [], [{ v: R(l.anterior), e: t + '.val' }],
      avah ? [{ v: comAv ? P(l.avAnterior) : null, e: t + '.pct' }] : [], [{ v: R(l.varR), e: t + '.val.acum' }, { v: P(l.varP), e: t + '.pct.acum' }]);
    c.dre.forEach((l) => {
      if (l.categoria !== categoria) {
        categoria = l.categoria;
        if (!SEM_FAIXA[categoria]) f.add([{ v: categoria.toUpperCase(), e: 'cat' }].concat(Array.from({ length: nCols }, () => ({ v: '', e: 'cat' }))), { altura: 16 });
      }
      const aberto = E.abertos.has(l.grupo || l.id);
      if (l.tipo === 'analitica') {
        if (E.semZeradas && zeradaNosDois(l)) return;
        f.add([{ v: l.rotulo, e: 'ana.rot2' }, { v: l.conta, e: 'ana.cod' }].concat(valores('ana', l, true)), { nivel: 1, escondida: !aberto });
      } else if (l.tipo === 'grupo') {
        f.add([{ v: l.rotulo, e: 'grp.rot0' }, { v: '', e: 'grp.cod' }].concat(valores('grp', l, true)), { recolhida: !aberto && l.filhas > 0 });
      } else {
        const t = l.destaque ? 'des' : 'tot';
        f.add([{ v: l.rotulo, e: t + '.rot0' }, { v: '', e: t + '.cod' }].concat(valores(t, l, true)));
      }
    });
    f.vazia();
    cab('Balanço patrimonial · o fim do mês', rot.balAtual, rot.balAnterior);
    c.balanco.forEach((l) => {
      if (E.semZeradas && l.conta && l.tipo === 'conta' && zeradaNosDois(l)) return;
      const t = l.tipo === 'total' ? (l.destaque ? 'des' : 'tot') : l.tipo === 'grupo' ? 'sin' : l.tipo === 'resultado' ? 'inp' : 'ana';
      f.add([{ v: l.rotulo, e: t + '.rot' + Math.min(5, (l.nivel || 1) - 1) }, { v: l.conta || '', e: t + '.cod' }].concat(valores(t, l, false)));
    });
    f.vazia();
    cab('Indicadores · o período', rot.atual, rot.anterior, 'Fórmula', ['Diferença', '']);
    const ESTILO = { x: 'ind.x', '%': 'ind.pct', 'R$': 'ind.val', dias: 'ind.dias' };
    let grupo = null;
    c.indicadores.forEach((l) => {
      if (l.grupo !== grupo) { grupo = l.grupo; f.add([{ v: grupo.toUpperCase(), e: 'cat' }].concat(Array.from({ length: nCols }, () => ({ v: '', e: 'cat' }))), { altura: 16 }); }
      const v = (x) => (l.tipo === 'R$' ? R(x) : P(x));
      f.add([{ v: l.rotulo, e: 'ana.rot0' }, { v: l.formula, e: 'ind.formula' }, { v: v(l.atual), e: ESTILO[l.tipo] }].concat(avah ? [{ v: null, e: 'ind.formula' }] : [], [{ v: v(l.anterior), e: ESTILO[l.tipo] }],
        avah ? [{ v: null, e: 'ind.formula' }] : [], [{ v: v(l.diferenca), e: ESTILO[l.tipo] + '.acum' }, { v: null, e: 'ind.formula' }]));
    });
    f.congelar = { linhas: r1, colunas: 1 };
    return f;
  }

  // Balanço patrimonial: os meses escolhidos e a conferência no fim.
  function folhaBalanco() {
    const b = E.rel.balanco;
    const ks = indicesVisiveis();
    const larg = larguraValor(b.linhas.map((l) => ks.map((k) => l.valores[k])), 16);
    const f = novaFolha('Balanço patrimonial', [62].concat(ks.map(() => larg)));
    f.titulo('Balanço patrimonial (conferência)', E.ano + ' · saldo do fim de cada mês · passivo e PL com o saldo credor positivo · resultado do exercício pela DRE (o lucro dos meses desde o último encerramento) · ' + valoresEm() + semZeradasTexto());
    const ficam = contasComSaldoOuMovimento(E.rel.mensal.linhas, ks);
    const r1 = f.add([{ v: 'Balanço patrimonial', e: 'cabEsq' }].concat(ks.map((k) => ({ v: b.colunas[k].rotulo + (b.colunas[k].desde ? '\n(resultado desde ' + b.colunas[k].desde + ')' : ''), e: 'cab' }))), { altura: 44 });
    b.linhas.forEach((l) => {
      if (ficam && l.conta && !ficam.has(l.conta)) return;
      const est = l.tipo === 'total' ? (l.destaque ? 'des' : 'tot') : l.tipo === 'grupo' ? 'sin' : l.tipo === 'resultado' ? 'inp' : 'ana';
      f.add([{ v: (l.conta ? l.conta + '  ' : '') + l.rotulo, e: est + '.rot' + Math.min(5, (l.nivel || 1) - 1) }].concat(ks.map((k) => ({ v: R(l.valores[k]), e: est + '.val' }))));
    });
    f.vazia();
    f.add([{ v: 'CONFERÊNCIA', e: 'cat' }].concat(ks.map(() => ({ v: '', e: 'cat' }))), { altura: 16 });
    const c = b.conferencia;
    [['Ativo − (passivo + PL + resultado): tem que dar zero', c.diferenca, 'tot'], ['Resultado pelo balancete (contas de resultado ainda abertas)', c.resultadoBalancete, 'ana'],
      ['Resultado pela DRE (lucro dos meses desde o último encerramento)', c.resultadoDre, 'ana'], ['Diferença entre os dois: tem que dar zero', c.difResultado, 'tot']]
      .forEach(([rot, vals, est]) => f.add([{ v: rot, e: est + '.rot0' }].concat(ks.map((k) => ({ v: R(vals[k]), e: est + '.val' })))));
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    return f;
  }

  function folhaResumo() {
    const r = resumoVisivel();
    const dre = dreMensalVisivel();
    const iAcum = dre.colunas.findIndex((c) => c.acumulado);
    const larg = larguraValor(r.linhas.map((l) => l.valores).concat([dre.linhas.map((l) => l.valores[iAcum])]), 16);
    const f = novaFolha('Resumo', [14, 44].concat(r.colunas.map(() => larg)));
    f.titulo('Resumo executivo', 'Indicadores: a DRE somada nos meses escolhidos · Contas de 1º nível: o saldo no fim de cada mês, como no balancete (a soma de cada coluna tem que dar zero)' +
      (E.selecao ? ' · meses escolhidos: ' + rotuloSelecao(mesesVisiveis()) : '') + ' · ' + valoresEm());
    // Os indicadores do período (as fichas do topo da tela) — só com as linhas da DRE conferidas.
    if (dreFechada()) f.add([{ v: 'Indicadores da DRE: fechados até as linhas da DRE desta empresa serem conferidas (o plano de contas é diferente do modelo da planilha).', e: 'subtitulo' }]);
    else {
      let n = f.add([{ v: 'Indicador', e: 'cabEsq' }, { v: '', e: 'cabEsq' }, { v: dre.colunas[iAcum].rotulo, e: 'cabAcum' }, { v: '% da receita líquida', e: 'cab' }], { altura: 30 });
      f.mesclar(0, n, 1, n);
      const rlAc = dre.linhas.find((l) => l.id === 'receitaLiquida').valores[iAcum];
      ['receitaLiquida', 'lucroBruto', 'ebitda', 'lucroOperacional', 'lucroLiquido'].forEach((id) => {
        const l = dre.linhas.find((x) => x.id === id);
        const v = l.valores[iAcum];
        n = f.add([{ v: l.rotulo, e: 'tot.rot0' }, { v: '', e: 'tot.rot0' }, { v: R(v), e: 'tot.val.acum' }, { v: id === 'receitaLiquida' || !rlAc || v === null ? null : v / rlAc, e: 'tot.pct' }]);
        f.mesclar(0, n, 1, n);
      });
    }
    f.vazia();
    const estilo = (c) => (c.trimestre ? 'cabTri' : 'cab');
    const r1 = f.add([{ v: 'Conta', e: 'cabEsq' }, { v: 'Título', e: 'cabEsq' }].concat(r.colunas.map((c) => ({ v: c.rotulo, e: estilo(c) }))), { altura: 20 });
    r.linhas.forEach((l) => f.add([{ v: l.conta, e: 'n1.cod' }, { v: l.titulo, e: 'n1.rot0' }].concat(l.valores.map((v) => ({ v: R(v), e: 'n1.val' })))));
    f.add([{ v: '', e: 'tot.cod' }, { v: 'Soma (tem que dar zero)', e: 'tot.rot0' }].concat(r.soma.map((v) => ({ v: R(v), e: 'tot.val' }))));
    f.repetir = [r1, r1];
    return f;
  }

  // DRE (mensal ou trimestral): faixa da categoria, subtotal com as contas agrupadas embaixo (+/−) e totais.
  // ficam: as contas analíticas que entram com "Sem as zeradas" (null = todas).
  function folhaDre(nome, titulo, sub, dre, ficam) {
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
        if (ficam && !ficam.has(l.conta)) return;
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
    f.titulo(titulo, sub + semZeradasTexto());
    const cab = cabecalhoComPeriodos(f, ['Conta', 'Título da conta'], tab.colunas, avah);
    const ficam = contasComSaldoOuMovimento(tab.linhas);
    const linhas = tab.linhas.filter((l) => !ficam || ficam.has(l.conta));
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
    f.titulo('LALUR Parte A: apuração do lucro real e da CSLL', 'Apuração trimestral a partir da DRE; adições e exclusões pela lista de ajustes; incentivo PAT e Parte B · ' + valoresEm());
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
    f.titulo('LALUR: ajustes mensais e trimestrais', 'Valor positivo = adição · valor negativo = exclusão · ' + valoresEm());
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
    f.titulo('Incentivo fiscal PAT', 'Conta ' + (L.contaPAT || '—') + (L.pat.titulo ? ' · ' + L.pat.titulo : '') + ' · menor entre o incentivo potencial e 3,6% do IRPJ principal (15%) · ' + valoresEm());
    r1 = f.add([{ v: 'Descrição', e: 'cabEsq' }, { v: 'Linha', e: 'cab' }].concat(L.pat.colunas.map((c) => ({ v: c.rotulo, e: c.lalur ? 'cabAcum' : 'cab' }))), { altura: 30 });
    L.pat.linhas.forEach((l) => f.add([{ v: l.rotulo, e: 'ana.rot0' }, { v: l.letra, e: 'ana.cod' }].concat(l.valores.map((v, k) => ({ v: R(v), e: 'ana.val' + (L.pat.colunas[k].lalur ? '.acum' : '') })))));
    f.congelar = { linhas: r1, colunas: 1 };
    f.repetir = [r1, r1];
    folhas.push(f);
    // Parte B
    larg = larguraValor(L.parteB.linhas.map((l) => l.valores), 16);
    f = novaFolha('LALUR Parte B', [46].concat(L.parteB.colunas.map(() => larg), [80]));
    f.titulo('LALUR Parte B: controles fiscais', 'Saldos de prejuízo fiscal e base negativa (zerados até serem informados) e IR retido · ' + valoresEm());
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
    // Com as linhas da DRE ainda não conferidas, a DRE e os indicadores ficam de fora (informação certa ou nada).
    const fechada = dreFechada();
    const abas = [
      ['resumo', () => folhaResumo()],
      ['balanco', () => folhaBalanco()],
      ['indicadores', () => folhaIndicadores(), fechada],
      ['comparativo', () => folhaComparativo(), fechada || !E.balancetesAnt.length],
      ['dre-mensal', () => folhaDre('DRE mensal', 'DRE CPC 51 mensal detalhada', E.ano + ' · ' + valoresEm() + ' · receitas positivas, custos e despesas entre parênteses · AV % sobre a receita líquida · AH % sobre o mês anterior' + escolha +
        ' · clique no + à esquerda para abrir as contas de um subtotal' + semZeradasTexto(), dreMensalVisivel(), ficamNaDre('mensal')), fechada],
      ['dre-trimestral', () => folhaDre('DRE trimestral', 'DRE CPC 51 trimestral detalhada', E.ano + ' · ' + valoresEm() + ' · AV % sobre a receita líquida · AH % sobre o trimestre anterior · clique no + à esquerda para abrir as contas' + semZeradasTexto(),
        E.rel.dre.trimestral, ficamNaDre('trimestral')), fechada],
      ['balancete-mensal', () => folhaBalancete('Balancete mensal', 'Balancete analítico mensal', E.ano + ' · contas 1 e 2: saldo final do mês · 3, 4 e 5: movimento do mês · AV % sobre a conta-mãe' + escolha +
        ' · use os números 1 a 5 no canto esquerdo do Excel para abrir ou fechar os níveis', balanceteMensalVisivel())],
      ['balancete-trimestral', () => folhaBalancete('Balancete trimestral', 'Balancete analítico trimestral', E.ano + ' · contas 1 e 2: saldo no fim do trimestre · 3, 4 e 5: soma dos meses · AV % sobre a conta-mãe', E.rel.trimestral)],
    ].filter((a) => !a[2]);
    const planilhas = abas.map((a) => a[1]()).concat(folhasLalur(), [folhaBase()]);
    const i = abas.findIndex((a) => a[0] === E.aba);
    const ativa = i >= 0 ? i : E.aba === 'lalur' ? abas.length : 0;
    return raiz.ExcelBonito.gerar({ planilhas, estilos: estilosDoExcel(), ativa });
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
  raiz.TelaApresentacao = { mostrar, _teste: { definirEstado: (x) => Object.assign(E, x), montarExcel, dinheiro } };
})(self);
