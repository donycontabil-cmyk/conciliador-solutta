/*
 * Conciliador Solutta — tela-passo13.js
 * 1.3 · RAZÃO LIMPO (Dony, 19/09/2026): "o razão de fornecedores limpo, ou seja, só o que tiver a crédito, já
 * que a gente tirou tudo que era débito, que não servia; e o razão de adiantamento, só o que for a débito — só
 * os saldos que ambos compõem. Preciso imprimir para mandar para as pessoas responsáveis encontrarem o que
 * aconteceu, principalmente na conta de adiantamento: a relação por lançamento ou por fornecedor, para o
 * financeiro encontrar o que aconteceu com esses pagamentos."
 * O cálculo é do motor (MotorFechamento.composicao), sobre o MESMO resultado do Passo ① (arquivos e decisões
 * gravadas lá). Aqui: a folha para imprimir ou salvar em PDF e o Excel (excel-bonito.js).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = raiz.MotorFechamento;

  function app() { return raiz.App; }

  const CHAVE_OPCOES = 'conciliador-solutta.razao-limpo';
  // conta: 'A' (adiantamento), 'F' (fornecedores) ou 'AF' (as duas); visao: 'fornecedor' ou 'lancamento'.
  const PADRAO = { conta: 'A', visao: 'fornecedor', anotacao: true };
  const NOME_CONTA = { F: 'Fornecedores', A: 'Adiantamento a fornecedores' };

  function lerOpcoes() {
    try { return Object.assign({}, PADRAO, JSON.parse(app().lerLocal(CHAVE_OPCOES) || '{}')); } catch (e) { return Object.assign({}, PADRAO); }
  }

  let R = null; // estado desta tela

  async function mostrar(el, codigo, anoMes, conferir, familiaId) {
    const comp = anoMes + '-01';
    const fam = raiz.TelaFamilia.familiaDe(familiaId);
    const familia = '#/empresa/' + encodeURIComponent(codigo) + '/' + fam.id + '/' + anoMes;
    T.carregando(el, 'Montando o razão limpo de ' + U.nomeCompetencia(comp) + '…');
    // O mesmo razão do ①: com o livro diário e as contas escolhidas, ele sai do diário antes (só o que mudou).
    if (!(await raiz.TelaPasso1.sincronizarComODiario(codigo, comp, conferir, fam.id))) return;
    const dados = await raiz.TelaPasso1.carregarDados(codigo, anoMes, conferir, fam.id);
    if (!dados) return;
    if (dados.erro) { el.innerHTML = '<div class="aviso ambar">' + T.esc(dados.erro) + ' <a href="#/">Voltar</a></div>'; return; }
    if (!dados.checklistOk || dados.falta) {
      el.innerHTML = '<a class="voltar" href="' + familia + '">← Fornecedores · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="aviso ambar"><span class="icone-aviso">📄</span><div><b>O razão limpo sai do Passo ①</b>, e o ① de ' + U.nomeCompetencia(comp) + ' ainda não está pronto: ' +
        (dados.checklistOk ? 'falta ' + [dados.arqs.F.length ? '' : 'o razão de ' + fam.contas.principal, dados.arqs.A.length ? '' : 'o razão de ' + fam.contas.adiantamento].filter(Boolean).join(' e ') + '.'
          : 'falta marcar o checklist "Antes de conciliar".') +
        ' <a href="' + familia + '/passo1">Abrir o Passo ①</a></div></div>';
      return;
    }
    const r = M.calcularPasso1(Object.assign({}, dados.entrada, { decisoes: dados.decisoes }), {});
    R = { el, codigo, comp, anoMes, emp: dados.emp, fam, familia, passo1: familia + '/passo1', registro: dados.registro, arquivos: dados.arquivos,
      r, c: M.composicao(r), opcoes: lerOpcoes(), emitido: U.agoraISO() };
    desenhar();
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function contasEscolhidas() { return R.opcoes.conta === 'AF' ? ['A', 'F'] : [R.opcoes.conta === 'F' ? 'F' : 'A']; }

  function desenhar() {
    const o = R.opcoes;
    const seg = (grupo, valor, texto, dica) => '<button type="button" class="seg' + (o[grupo] === valor ? ' ativo' : '') + '" data-' + grupo + '="' + valor + '" title="' + T.esc(dica) + '" aria-pressed="' + (o[grupo] === valor) + '">' + texto + '</button>';
    R.el.innerHTML =
      '<div class="barra-relatorio nao-imprimir">' +
      '<a class="voltar" style="margin:0" href="' + R.passo1 + '">← Voltar para o Passo ①</a>' +
      '<div class="linha-flex" style="gap:8px 12px;flex:1;min-width:280px">' +
      '<span class="grupo-seg"><span class="seg-rotulo">Conta</span>' + seg('conta', 'A', 'Adiantamento', 'Só o adiantamento a fornecedores (o que foi pago e ainda não tem nota)') +
      seg('conta', 'F', 'Fornecedores', 'Só fornecedores (as notas que continuam a pagar)') + seg('conta', 'AF', 'As duas', 'Adiantamento e fornecedores') + '</span>' +
      '<span class="grupo-seg"><span class="seg-rotulo">Relação</span>' + seg('visao', 'fornecedor', 'Por fornecedor', 'Agrupado por fornecedor, com o total de cada um') +
      seg('visao', 'lancamento', 'Por lançamento', 'Um lançamento embaixo do outro, pela data') + '</span>' +
      '<label class="caixa-opcao" title="Uma coluna em branco na folha para quem recebe anotar o que aconteceu"><input type="checkbox" data-opcao="anotacao"' + (o.anotacao ? ' checked' : '') + '> ✍ Coluna para anotar</label>' +
      '</div>' +
      '<div class="linha-flex" style="flex-wrap:nowrap">' +
      '<button type="button" class="botao" data-acao="excel" title="Baixar em planilha (lançamentos e fornecedores de cada conta)">⬇ Excel</button>' +
      '<button type="button" class="botao primario" data-acao="imprimir" title="Na janela de impressão, escolha a impressora ou “Salvar como PDF”">🖨 Imprimir / salvar PDF</button>' +
      '</div></div>' +
      '<article class="relatorio razao-limpo">' + capa() + resumo() + contasEscolhidas().map(secaoConta).join('') + assinaturas() + '</article>';
    const barra = R.el.querySelector('.barra-relatorio');
    barra.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-conta')) { mudar('conta', b.getAttribute('data-conta')); return; }
      if (b.hasAttribute('data-visao')) { mudar('visao', b.getAttribute('data-visao')); return; }
      const acao = b.getAttribute('data-acao');
      if (acao === 'imprimir') imprimir();
      else if (acao === 'excel') baixarExcel();
    });
    barra.addEventListener('change', (ev) => {
      const c = ev.target.closest('[data-opcao]');
      if (c) mudar(c.getAttribute('data-opcao'), c.checked);
    });
  }
  function mudar(qual, valor) {
    R.opcoes[qual] = valor;
    app().gravarLocal(CHAVE_OPCOES, JSON.stringify(R.opcoes));
    desenhar();
  }

  // Valor com a natureza (D/C) no lugar do sinal: + = o lado que forma o saldo (C em fornecedores, D no adiantamento).
  function dc(lado, c) { if (!c) return ''; return (lado === 'F') === (c > 0) ? 'C' : 'D'; }
  function dinheiro(lado, c) { return T.htmlDC(c, dc(lado, c)); }
  function tdDinheiro(lado, c, extra) { return '<td class="num' + (extra ? ' ' + extra : '') + '">' + dinheiro(lado, c) + '</td>'; }
  function nomeDoMes() { return U.nomeCompetencia(R.comp); }
  function contasDoLado(lado) { return R.arquivos[lado].map((x) => x.conteudo.conta.codigo + ' · ' + x.conteudo.conta.nome).join(', '); }

  function capa() {
    const cfg = app().config || {};
    const rs = R.r.resumo;
    const ficha = [
      ['Empresa', R.emp.codigo + ' · ' + R.emp.nome],
      ['CNPJ', R.emp.cnpj ? U.formatarCnpj(R.emp.cnpj) : '—'],
      ['Competência', nomeDoMes() + ' · saldos em ' + R.c.fim],
      ['Fornecedores', contasDoLado('F')],
      ['Adiantamento', contasDoLado('A')],
      ['Reclassificações do ①', (rs.aceitas + rs.manuais) + ' (arquivo de ajustes ' + T.moeda(rs.arquivo.total) + ')'],
      ['Última gravação do ①', R.registro.atualizadoEm ? (R.registro.atualizadoPor || '—') + ' · ' + U.dataHoraLocal(R.registro.atualizadoEm) : 'nenhuma decisão gravada (sugestões do programa)'],
      ['Emitido', (app().usuario.nome || '—') + ' · ' + U.dataHoraLocal(R.emitido)],
      ['Programa', (cfg.programa || 'Conciliador Solutta') + (cfg.numero ? ' · versão ' + cfg.numero : '')],
    ];
    return '<header class="rel-capa">' +
      '<div class="rel-topo"><div class="rel-marca"><span class="selo-marca">S</span>' + T.esc(cfg.programa || 'Conciliador Solutta') + '</div>' +
      '<div class="rel-sobretitulo">Passo 1.3 · razão limpo</div></div>' +
      '<h1>' + (contasEscolhidas().length === 2 ? 'O que compõe os saldos' : 'O que compõe o saldo de ' + T.esc(NOME_CONTA[contasEscolhidas()[0]].toLowerCase())) + '</h1>' +
      '<p class="rel-subtitulo">Depois do Passo ① (Fornecedores × Adiantamento) · <b>' + T.esc(nomeDoMes()) + '</b> · ' + (R.opcoes.visao === 'fornecedor' ? 'por fornecedor' : 'por lançamento') + '</p>' +
      '<dl class="rel-ficha">' + ficha.map((f) => '<div><dt>' + T.esc(f[0]) + '</dt><dd>' + T.esc(f[1]) + '</dd></div>').join('') + '</dl>' +
      '</header>';
  }

  function resumo() {
    const numero = (x) => '<div class="rel-numero' + (x.lado === 'A' ? ' azul' : ' ambar') + '"><div class="rotulo">' + T.esc(NOME_CONTA[x.lado]) + '</div>' +
      '<div class="valor">' + dinheiro(x.lado, x.saldo) + '</div><div class="det">' + x.itens.length.toLocaleString('pt-BR') + ' lançamento(s) em aberto · ' +
      x.fornecedores.length.toLocaleString('pt-BR') + ' fornecedor(es)' + (x.saldoAnterior ? ' · saldo anterior ' + dinheiro(x.lado, x.saldoAnterior) + ' sem detalhe' : '') + '</div></div>';
    const conta = contasEscolhidas().map((l) => R.c[l]);
    const naoConfere = conta.filter((x) => !x.confere);
    return '<section class="rel-secao">' +
      '<div class="rel-numeros">' + conta.map(numero).join('') + '</div>' +
      '<p class="rel-explica"><b>Como sai:</b> o que bateu dentro de cada razão no Passo ① sai; as reclassificações do arquivo de ajustes entram — a <b>direta</b> abate o mesmo valor ' +
      'nas duas contas e a <b>inversa</b> leva o saldo devedor do fornecedor para o adiantamento, como os pagamentos que o formam. Em cada fornecedor, o que diminui o saldo ' +
      'abate o que forma o saldo, do mais antigo para o mais novo. Fica só o que forma o saldo, com o valor em aberto.</p>' +
      (naoConfere.length
        ? '<p class="rel-alerta">⚠ ' + naoConfere.map((x) => T.esc(NOME_CONTA[x.lado]) + ': a soma (' + dinheiro(x.lado, x.saldo) + ') não fecha com o em aberto do ① (' + dinheiro(x.lado, x.emAberto) + ')').join(' · ') + '. Não mande antes de revisar.</p>'
        : '<p class="rel-explica ok">✓ Conferido no centavo: a soma de cada relação + o saldo anterior = o em aberto da conta no Passo ①, depois dos ajustes.</p>') +
      '</section>';
  }

  // Observações de um lançamento: de onde veio, o que já abateu, e o lado trocado.
  function obs(lado, i) {
    const partes = [];
    if (i.origem === 'inversa') partes.push('<span class="rl-selo inversa">veio de fornecedores</span> pagamento sem nota, reclassificado no ①');
    if (i.origem === 'direta') partes.push('<span class="rl-selo">reclassificação</span> ' + T.esc(i.historico));
    if (i.resto < 0) {
      partes.push('<span class="rl-selo invertido">' + (lado === 'F' ? 'a débito' : 'a crédito') + '</span> ' + (lado === 'F'
        ? 'pagamento sem nota que ficou em fornecedores (inversa desmarcada no ① ou sem fornecedor)'
        : 'baixa que não achou adiantamento'));
    }
    if (i.abatimentos.length && i.resto > 0) {
      const lista = i.abatimentos.slice(0, 4).map((a) => T.esc(a.data) + ' ' + T.esc(U.formatarCentavos(a.valor)) + (a.daNota ? ' (nota em fornecedores)' : a.origem === 'direta' ? ' (reclassificação direta)' : ''));
      partes.push('já abatido: ' + lista.join(' · ') + (i.abatimentos.length > 4 ? ' · …' : ''));
    }
    return partes.length ? '<div class="rl-obs">' + partes.join('<br>') + '</div>' : '';
  }
  function historicoComObs(lado, i) {
    const h = i.origem === 'direta' ? 'Reclassificação do ①' : i.historico;
    return T.esc(h || '—') + (i.contrapartida ? ' <span class="suave">· contrapartida ' + T.esc(i.contrapartida) + '</span>' : '') + obs(lado, i);
  }
  function colAnotar() { return R.opcoes.anotacao ? '<td class="rl-anotar"></td>' : ''; }
  function thAnotar() { return R.opcoes.anotacao ? '<th class="rl-anotar">O que aconteceu?</th>' : ''; }

  function secaoConta(lado) {
    const x = R.c[lado];
    const explica = lado === 'A'
      ? 'Os pagamentos adiantados que continuam <b>sem nota</b> depois do Passo ①: cada um precisa de uma explicação do financeiro (a nota chegou? foi devolvido? foi outro fornecedor?).'
      : 'As notas que continuam <b>a pagar</b> depois do Passo ①, com o valor que falta pagar de cada uma.';
    const corpo = !x.itens.length ? '<p class="rel-vazio">Nada em aberto nesta conta depois do Passo ①.</p>'
      : R.opcoes.visao === 'fornecedor' ? x.fornecedores.map((g) => blocoFornecedor(lado, g)).join('') : tabelaLancamentos(lado, x.itens);
    return '<section class="rel-secao">' +
      '<h2><span class="rel-marcador ' + (lado === 'A' ? 'azul' : 'ambar') + '"></span>' + T.esc(NOME_CONTA[lado]) + ' <small>(' + x.itens.length.toLocaleString('pt-BR') + ' lançamento(s) · ' +
        x.fornecedores.length.toLocaleString('pt-BR') + ' fornecedor(es) · ' + T.esc(contasDoLado(lado)) + ')</small></h2>' +
      '<p class="rel-explica">' + explica + (x.invertidos ? ' <span class="rel-aviso">' + x.invertidos + ' lançamento(s) ' + (lado === 'F' ? 'a débito' : 'a crédito') + ' continuam na conta (ver a observação).</span>' : '') + '</p>' +
      corpo +
      '<p class="rel-total-secao">Soma da relação <b>' + dinheiro(lado, x.total) + '</b>' +
      (x.saldoAnterior ? ' + saldo anterior do razão, sem detalhe por fornecedor <b>' + dinheiro(lado, x.saldoAnterior) + '</b>' : '') +
      ' = saldo da conta depois do ① <b>' + dinheiro(lado, x.saldo) + '</b>' + (x.confere ? ' <span class="ok">✓ confere</span>' : ' <span class="negativo">⚠ não confere com ' + dinheiro(lado, x.emAberto) + '</span>') + '</p>' +
      '</section>';
  }

  function blocoFornecedor(lado, g) {
    return '<div class="rel-grupo rl-forn">' +
      '<div class="rel-grupo-cab"><span class="rel-nome">' + T.esc(g.nome) + '</span>' + (g.cnpj ? '<span class="rel-doc">CNPJ ' + T.esc(U.formatarCnpj(g.cnpj)) + '</span>' : '') +
      '<span class="rel-valores">' + g.itens.length + ' lançamento(s) · em aberto <b>' + dinheiro(lado, g.total) + '</b></span></div>' +
      '<table class="rel-tab"><thead><tr><th style="width:74px">Data</th><th style="width:86px">Documento</th><th>Histórico</th><th class="num" style="width:108px">Lançamento</th>' +
      '<th class="num" style="width:108px">Em aberto</th>' + thAnotar() + '</tr></thead><tbody>' +
      g.itens.map((i) => '<tr><td>' + T.esc(i.data) + '</td><td class="doc">' + T.nome(i.numero) + '</td><td>' + historicoComObs(lado, i) + '</td>' +
        tdDinheiro(lado, i.valor) + tdDinheiro(lado, i.resto, 'forte') + colAnotar() + '</tr>').join('') +
      '</tbody></table></div>';
  }

  function tabelaLancamentos(lado, itens) {
    return '<table class="rel-tab rl-lancamentos"><thead><tr><th style="width:70px">Data</th><th style="width:190px">Fornecedor</th><th style="width:78px">Documento</th><th>Histórico</th>' +
      '<th class="num" style="width:100px">Lançamento</th><th class="num" style="width:100px">Em aberto</th>' + thAnotar() + '</tr></thead><tbody>' +
      itens.map((i) => '<tr><td>' + T.esc(i.data) + '</td><td>' + T.esc(i.nome) + (i.cnpj ? '<br><span class="suave">' + T.esc(U.formatarCnpj(i.cnpj)) + '</span>' : '') + '</td>' +
        '<td class="doc">' + T.nome(i.numero) + '</td><td>' + historicoComObs(lado, i) + '</td>' + tdDinheiro(lado, i.valor) + tdDinheiro(lado, i.resto, 'forte') + colAnotar() + '</tr>').join('') +
      // O total numa linha do corpo (o rodapé da tabela se repete em cada folha impressa).
      '<tr class="rl-total"><td colspan="5">Total em aberto (' + itens.length.toLocaleString('pt-BR') + ' lançamentos)</td>' + tdDinheiro(lado, itens.reduce((t, i) => t + i.resto, 0), 'forte') +
      (R.opcoes.anotacao ? '<td></td>' : '') + '</tr></tbody></table>';
  }

  function assinaturas() {
    return '<footer class="rel-assinaturas"><div><span></span>Preparado por</div><div><span></span>Conferido pelo financeiro</div><div><span></span>Data</div></footer>' +
      '<p class="rel-rodape">' + T.esc((app().config && app().config.programa) || 'Conciliador Solutta') + ' · razão limpo (Passo 1.3) · ' + T.esc(R.emp.codigo + ' · ' + R.emp.nome) +
      ' · ' + T.esc(nomeDoMes()) + ' · emitido em ' + U.dataHoraLocal(R.emitido) + '</p>';
  }

  // ------------------------------------------------------------------
  // Imprimir / PDF e Excel
  // ------------------------------------------------------------------
  function nomeDoArquivo(extensao) {
    const conta = R.opcoes.conta === 'AF' ? 'fornecedores e adiantamento' : R.opcoes.conta === 'F' ? 'fornecedores' : 'adiantamento';
    return U.nomeSeguro('Razão limpo ' + conta + ' ' + R.emp.codigo + ' ' + R.emp.nome + ' ' + U.anoMes(R.comp), 100) + (extensao || '');
  }

  function imprimir() {
    // O título da página vira o nome sugerido do PDF.
    const antes = document.title;
    document.title = nomeDoArquivo('');
    const devolver = () => { document.title = antes; raiz.removeEventListener('afterprint', devolver); };
    raiz.addEventListener('afterprint', devolver);
    raiz.print();
    app().armazenamento.registrarNoLog({ codigo: R.codigo, acao: 'razao-limpo-impresso', alvo: 'fornecedores/' + R.anoMes, detalhe: R.opcoes.conta + ' · ' + R.opcoes.visao }).catch(() => {});
  }

  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' },
    sub: { cor: 'FF5F6B7A', italico: true },
    rot: { negrito: true, cor: 'FF5F6B7A' },
    txt: {},
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true, borda: { baixo: { cor: 'FF1F4E78' } } },
    cabNum: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', alinh: 'right', vert: 'center', quebra: true },
    data: { alinh: 'center' },
    val: { formato: 'dinheiro' },
    valForte: { formato: 'dinheiro', negrito: true },
    grp: { negrito: true, fundo: 'FFE7EEF5', borda: { cima: { cor: 'FFC9D3DE' } } },
    grpVal: { negrito: true, fundo: 'FFE7EEF5', formato: 'dinheiro', borda: { cima: { cor: 'FFC9D3DE' } } },
    tot: { negrito: true, fundo: 'FFDDEBF7', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    totVal: { negrito: true, fundo: 'FFDDEBF7', formato: 'dinheiro', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    anotar: { fundo: 'FFFFFBE6', borda: { baixo: { cor: 'FFE2D7A8' } } },
  };
  const reais = (c) => Math.round(Number(c) || 0) / 100;
  const cel = (v, e) => ({ v: v === undefined ? null : v, e: e || 'txt' });

  // As planilhas: Resumo e, de cada conta escolhida, os lançamentos e o por fornecedor.
  function montarExcel() {
    const planilhas = [];
    const titulo = (linhas, texto, sub) => { linhas.push({ celulas: [cel(texto, 'tit')], altura: 22 }); if (sub) linhas.push({ celulas: [cel(sub, 'sub')] }); linhas.push(null); };
    // Resumo
    const res = [];
    titulo(res, 'Razão limpo · o que compõe os saldos depois do Passo ①', R.emp.codigo + ' · ' + R.emp.nome + ' · ' + nomeDoMes() + ' · saldos em ' + R.c.fim);
    res.push({ celulas: [cel('Conta', 'cab'), cel('Lançamentos', 'cabNum'), cel('Fornecedores', 'cabNum'), cel('Soma da relação', 'cabNum'), cel('Saldo anterior (sem detalhe)', 'cabNum'),
      cel('Saldo da conta depois do ①', 'cabNum'), cel('D/C', 'cab'), cel('Confere com o ①', 'cab')], altura: 30 });
    contasEscolhidas().forEach((lado) => {
      const x = R.c[lado];
      res.push({ celulas: [cel(NOME_CONTA[lado] + ' · ' + contasDoLado(lado)), cel(x.itens.length), cel(x.fornecedores.length), cel(reais(x.total), 'val'), cel(reais(x.saldoAnterior), 'val'),
        cel(reais(x.saldo), 'valForte'), cel(dc(lado, x.saldo)), cel(x.confere ? 'sim' : 'NÃO — revisar')] });
    });
    res.push(null);
    res.push({ celulas: [cel('Como sai: o que bateu dentro de cada razão no ① sai; a reclassificação direta abate o mesmo valor nas duas contas; a inversa leva o saldo devedor do fornecedor ' +
      'para o adiantamento, como os pagamentos que o formam; em cada fornecedor o que diminui o saldo abate o que forma, do mais antigo para o mais novo.', 'sub')] });
    res.push({ celulas: [cel('Emitido por ' + ((app() && app().usuario && app().usuario.nome) || '—') + ' em ' + U.dataHoraLocal(R.emitido), 'sub')] });
    planilhas.push({ nome: 'Resumo', colunas: [58, 13, 13, 17, 20, 22, 6, 16], linhas: res, paisagem: true });

    contasEscolhidas().forEach((lado) => {
      const x = R.c[lado];
      const curto = lado === 'A' ? 'Adiantamento' : 'Fornecedores';
      // Lançamentos (um embaixo do outro), com a coluna para o financeiro responder.
      const l = [];
      titulo(l, curto + ' · lançamentos em aberto depois do ①', R.emp.codigo + ' · ' + R.emp.nome + ' · ' + nomeDoMes() + ' · ' + contasDoLado(lado));
      const cab = l.push({ celulas: ['Data', 'Fornecedor', 'CNPJ', 'Documento', 'Histórico', 'Origem', 'Lançamento', 'Em aberto', 'D/C', 'Já abatido', 'Retorno do financeiro']
        .map((t, k) => cel(t, k === 6 || k === 7 ? 'cabNum' : 'cab')), altura: 30 });
      x.itens.forEach((i) => l.push({ celulas: [cel(i.data, 'data'), cel(i.nome), cel(i.cnpj ? U.formatarCnpj(i.cnpj) : ''), cel(i.numero || ''), cel(i.origem === 'direta' ? 'Reclassificação do ①' : i.historico),
        cel(i.origem === 'inversa' ? 'veio de fornecedores (inversa)' : i.origem === 'direta' ? 'reclassificação direta' : i.resto < 0 ? (lado === 'F' ? 'a débito' : 'a crédito') : 'razão'),
        cel(reais(i.valor), 'val'), cel(reais(i.resto), 'valForte'), cel(dc(lado, i.resto)),
        cel(i.abatimentos.map((a) => a.data + ' ' + U.formatarCentavos(a.valor) + (a.daNota ? ' (nota)' : a.origem === 'direta' ? ' (reclassificação)' : '')).join(' · ')), cel('', 'anotar')] }));
      l.push({ celulas: [cel('Total', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel(x.itens.length + ' lançamento(s)', 'tot'), cel('', 'tot'), cel('', 'tot'), cel(reais(x.total), 'totVal'),
        cel(dc(lado, x.total), 'tot'), cel('', 'tot'), cel('', 'tot')] });
      if (x.saldoAnterior) l.push({ celulas: [cel('Saldo anterior do razão (sem detalhe por fornecedor)'), null, null, null, null, null, null, cel(reais(x.saldoAnterior), 'val'), cel(dc(lado, x.saldoAnterior))] });
      l.push({ celulas: [cel('Saldo da conta depois do ①', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel(x.confere ? 'confere com o ①' : 'NÃO confere com o ① — revisar', 'tot'), cel('', 'tot'), cel('', 'tot'),
        cel(reais(x.saldo), 'totVal'), cel(dc(lado, x.saldo), 'tot'), cel('', 'tot'), cel('', 'tot')] });
      planilhas.push({ nome: curto + ' - lançamentos', colunas: [11, 34, 19, 13, 56, 28, 14, 14, 5, 34, 36], linhas: l, congelar: { linhas: cab, colunas: 0 }, repetir: [cab, cab],
        paisagem: true, rodape: R.emp.nome + ' · razão limpo · ' + nomeDoMes() });
      // Por fornecedor: o total de cada um e os lançamentos embaixo (abre e fecha no + do Excel).
      const g = [];
      titulo(g, curto + ' · por fornecedor', R.emp.codigo + ' · ' + R.emp.nome + ' · ' + nomeDoMes() + ' · clique no + à esquerda para ver os lançamentos de cada fornecedor');
      const cabG = g.push({ celulas: ['Fornecedor', 'CNPJ', 'Lançamentos', 'Em aberto', 'D/C', 'Retorno do financeiro'].map((t, k) => cel(t, k === 2 || k === 3 ? 'cabNum' : 'cab')), altura: 22 });
      x.fornecedores.forEach((f) => {
        g.push({ celulas: [cel(f.nome, 'grp'), cel(f.cnpj ? U.formatarCnpj(f.cnpj) : '', 'grp'), cel(f.itens.length, 'grp'), cel(reais(f.total), 'grpVal'), cel(dc(lado, f.total), 'grp'), cel('', 'anotar')], recolhida: true });
        f.itens.forEach((i) => g.push({ celulas: [cel('   ' + i.data + ' · ' + (i.numero ? 'doc ' + i.numero + ' · ' : '') + (i.origem === 'direta' ? 'Reclassificação do ①' : i.historico)), null, null,
          cel(reais(i.resto), 'val'), cel(dc(lado, i.resto))], nivel: 1, escondida: true }));
      });
      g.push({ celulas: [cel('Total (' + x.fornecedores.length + ' fornecedores)', 'tot'), cel('', 'tot'), cel(x.itens.length, 'tot'), cel(reais(x.total), 'totVal'), cel(dc(lado, x.total), 'tot'), cel('', 'tot')] });
      planilhas.push({ nome: curto + ' - fornecedores', colunas: [70, 19, 13, 15, 5, 40], linhas: g, congelar: { linhas: cabG, colunas: 0 }, repetir: [cabG, cabG], resumoAcima: true,
        paisagem: true, rodape: R.emp.nome + ' · razão limpo · ' + nomeDoMes() });
    });
    return raiz.ExcelBonito.gerar({ planilhas, estilos: ESTILOS, ativa: planilhas.length > 1 ? 1 : 0 });
  }

  function baixarExcel() {
    let bytes;
    try { bytes = montarExcel(); } catch (e) {
      console.error(e);
      T.avisoRapido('Não foi possível montar o Excel: ' + T.mensagemDeErro(e), 'erro');
      return;
    }
    const arquivo = nomeDoArquivo('.xlsx');
    T.baixar(bytes, arquivo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    T.avisoRapido('Excel baixado: ' + arquivo + ' (pasta Downloads).', 'ok', 5000);
    app().armazenamento.registrarNoLog({ codigo: R.codigo, acao: 'razao-limpo-excel', alvo: 'fornecedores/' + R.anoMes, detalhe: arquivo }).catch(() => {});
  }

  // _teste: para as provas montarem o Excel sem a tela.
  raiz.TelaPasso13 = { mostrar, _teste: { definir: (x) => { R = x; }, montarExcel } };
})(self);
