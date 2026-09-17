/*
 * Conciliador Solutta — tela-relatorio3.js
 * Relatório da conciliação dos passos A × B (③ Fornecedores × contas a pagar e ② Adiantamento ×
 * financeiro). Pedido do Dony (14/09/2026):
 * "relatórios da conciliação, bem bonito, demonstrando o que foi conciliado manualmente e o
 * que foi automático, agrupado por ID".
 * Uma folha pronta para imprimir ou salvar em PDF (quem faz o PDF é o próprio navegador) e
 * a mesma coisa em Excel. Os dados vêm do motor (MotorTerceiro.relatorioAB); aqui só se desenha.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = raiz.MotorTerceiro;

  function app() { return raiz.App; }

  const TIPO = { AxA: 'A×A', AxB: 'A×B', BxB: 'B×B' };
  const COMO = M.COMO_AB; // rótulo curto de cada regra (definido no motor)
  const CHAVE_OPCOES = 'conciliador-solutta.relatorio3';
  const PADRAO = { manuais: true, automaticas: true, valor: true, margem: true, itens: true, abertos: true, versoes: true };

  function lerOpcoes() {
    try { return Object.assign({}, PADRAO, JSON.parse(app().lerLocal(CHAVE_OPCOES) || '{}')); } catch (e) { return Object.assign({}, PADRAO); }
  }

  let R = null; // estado desta tela

  async function mostrar(el, codigo, anoMes, conferir, passoId) {
    const cfg = raiz.TelaPasso3.configDoPasso(passoId);
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + anoMes + '/' + cfg.id;
    T.carregando(el, 'Montando o relatório de ' + U.nomeCompetencia(comp) + '…');
    const dados = await raiz.TelaPasso3.carregarDados(codigo, anoMes, conferir, { passo: cfg.id });
    if (!dados) return;
    if (dados.erro) { el.innerHTML = '<div class="aviso ambar">' + T.esc(dados.erro) + ' <a href="#/">Voltar</a></div>'; return; }
    if (dados.falta) {
      el.innerHTML = '<a class="voltar" href="' + voltar + '">← Passo ' + cfg.numero + ' · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="aviso ambar"><span class="icone-aviso">📄</span><div><b>Sem relatório: falta arquivo para o Passo ' + cfg.numero + '.</b><br>Suba ' + dados.falta.map(T.esc).join(', ') + '.</div></div>';
      return;
    }
    R = { el, codigo, comp, voltar, dados, cfg, rel: M.relatorioAB(dados.itens, dados.decisoes.conciliacoesAB), opcoes: lerOpcoes(), emitido: U.agoraISO() };
    desenhar();
  }

  function desenhar() {
    const o = R.opcoes;
    const marca = (nome, texto) => '<label class="linha-flex" style="gap:5px"><input type="checkbox" data-opcao="' + nome + '"' + (o[nome] ? ' checked' : '') + '> ' + texto + '</label>';
    R.el.innerHTML =
      '<div class="barra-relatorio nao-imprimir">' +
      '<a class="voltar" style="margin:0" href="' + R.voltar + '">← Voltar para a conciliação</a>' +
      '<div class="linha-flex" style="gap:6px 14px;flex:1;min-width:280px">' +
      '<span class="suave pequeno">Mostrar:</span>' + marca('manuais', 'Manuais') + marca('automaticas', 'Automáticas') + marca('valor', 'Só pelo valor') + marca('margem', 'Com margem') +
      marca('itens', 'Itens de cada ID') + marca('abertos', 'Em aberto') + marca('versoes', 'Versões dos arquivos') +
      '</div>' +
      '<div class="linha-flex" style="flex-wrap:nowrap">' +
      '<button type="button" class="botao" data-acao="excel" title="Baixar o relatório em planilha">⬇ Excel</button>' +
      '<button type="button" class="botao primario" data-acao="imprimir" title="Na janela de impressão, escolha a impressora ou “Salvar como PDF”">🖨 Imprimir / salvar PDF</button>' +
      '</div></div>' +
      '<article class="relatorio">' + capa() + resumo() +
      (o.manuais ? secaoConciliacoes('manuais') : '') +
      (o.automaticas ? secaoConciliacoes('automaticas') : '') +
      (o.valor && R.rel.porValor.length ? secaoConciliacoes('valor') : '') +
      (o.margem && R.rel.comMargem.length ? secaoConciliacoes('margem') : '') +
      (o.abertos ? secaoAbertos() : '') +
      (o.versoes ? secaoVersoes() : '') +
      assinaturas() + '</article>';
    R.el.querySelector('.barra-relatorio').addEventListener('change', (ev) => {
      const c = ev.target.closest('[data-opcao]');
      if (!c) return;
      R.opcoes[c.getAttribute('data-opcao')] = c.checked;
      app().gravarLocal(CHAVE_OPCOES, JSON.stringify(R.opcoes));
      desenhar();
    });
    R.el.querySelector('.barra-relatorio').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      if (b.getAttribute('data-acao') === 'imprimir') imprimir();
      else baixarExcel();
    });
  }

  // ------------------------------------------------------------------
  // Partes da folha
  // ------------------------------------------------------------------
  function nomeDoMes(x) { return U.nomeCompetencia(R.comp); }
  function nomeDaFonte(fonte) { return fonte === 'nota' ? 'razão · ' + R.cfg.aumento : fonte === 'baixa' ? 'razão · ' + R.cfg.reducao : 'aging'; }
  function fonte(x) {
    if (x.fonte === 'anterior') return 'aging ' + R.dados.entrada.mesAnterior;
    if (x.fonte === 'atual') return 'aging ' + R.dados.entrada.mesAtual;
    if (x.fonte === 'pendente') return 'pendente de ' + U.nomeCompetencia(x.origem) + (x.fonteOriginal ? ' · ' + nomeDaFonte(x.fonteOriginal) : '');
    return nomeDaFonte(x.fonte);
  }
  // De onde veio o saldo inicial da contabilidade: conforme o aging ou conforme o razão do mês anterior.
  // Texto simples (vai na ficha da capa, que escapa o texto, e numa célula do Excel): "801.889,12 C".
  function textoInicio() {
    const p = R.dados.r.ponte, ini = p.inicio || { modo: 'aging' }, c = R.dados.itens.continuacao;
    const mesAnt = R.dados.entrada.mesAnterior;
    const v = (x) => T.valorDC(x, dc(x));
    return ini.modo === 'razao'
      ? 'conforme o RAZÃO de ' + mesAnt + ' · ' + v(p.anterior) + ' (aging ' + v(ini.aging) + ' − ' + ini.qtdTirados + ' título(s) da B ' + v(ini.tirados) +
        ' + ' + ini.qtdPendentes + ' pendência(s) da A ' + v(ini.pendentesA) + ')' + (c && c.naoAchados.length ? ' · ' + c.naoAchados.length + ' título(s) da B não achados' : '')
      : 'conforme o AGING de ' + mesAnt + ' · ' + v(p.anterior);
  }
  // Valor com a natureza (D/C) no lugar do sinal (Dony, 16/09/2026).
  function dc(c) { return M.ladoDC(c, R.cfg.natureza); }
  function dinheiro(c) { return T.htmlDC(c, dc(c)); }
  function tdDinheiro(c) { return '<td class="num">' + dinheiro(c) + '</td>'; }
  function quemQuando(g) { return (g.quem ? T.esc(g.quem) : '—') + (g.quando ? ' · ' + U.dataHoraLocal(g.quando) : ''); }

  function capa() {
    const d = R.dados, emp = d.emp, conta = d.r.conta || {};
    const cfg = app().config || {};
    const ficha = [
      ['Empresa', emp.codigo + ' · ' + emp.nome],
      ['CNPJ', emp.cnpj ? U.formatarCnpj(emp.cnpj) : '—'],
      ['Competência', nomeDoMes()],
      ['Conta', (conta.codigo || '') + ' · ' + (conta.nome || '')],
      ['Parte A · contabilidade', 'aging ' + d.entrada.mesAnterior + (d.itens.continuacao ? ' + pendências de ' + U.nomeCompetencia(d.itens.continuacao.competencia) : '') + ' + razão de ' + (d.entrada.nomeRazao || d.entrada.mesAtual)],
      ['Parte B · financeiro', 'aging ' + d.entrada.mesAtual],
      ['Saldo inicial', textoInicio()],
      ['Última gravação', d.registro.atualizadoEm ? (d.registro.atualizadoPor || '—') + ' · ' + U.dataHoraLocal(d.registro.atualizadoEm) : 'nada gravado ainda'],
      ['Emitido', (app().usuario.nome || '—') + ' · ' + U.dataHoraLocal(R.emitido)],
      ['Programa', (cfg.programa || 'Conciliador Solutta') + (cfg.numero ? ' · versão ' + cfg.numero : '')],
    ];
    return '<header class="rel-capa">' +
      '<div class="rel-topo"><div class="rel-marca"><span class="selo-marca">S</span>' + T.esc(cfg.programa || 'Conciliador Solutta') + '</div>' +
      '<div class="rel-sobretitulo">Relatório de conciliação</div></div>' +
      '<h1>' + T.esc(R.cfg.titulo) + '</h1>' +
      '<p class="rel-subtitulo">Passo ' + R.cfg.numero + ' · Conciliar A × B · <b>' + T.esc(nomeDoMes()) + '</b></p>' +
      '<dl class="rel-ficha">' + ficha.map((f) => '<div><dt>' + T.esc(f[0]) + '</dt><dd>' + T.esc(f[1]) + '</dd></div>').join('') + '</dl>' +
      '</header>';
  }

  function resumo() {
    const p = R.dados.r.ponte, t = R.rel.totais, rel = R.rel;
    const item = (rotulo, valor, destaque) => '<div class="item' + (destaque ? ' destaque' : '') + '"><span>' + T.esc(rotulo) + '</span><b>' + dinheiro(valor) + '</b></div>';
    const numero = (rotulo, valor, detalhe, classe) => '<div class="rel-numero' + (classe ? ' ' + classe : '') + '"><div class="rotulo">' + T.esc(rotulo) + '</div>' +
      '<div class="valor">' + valor + '</div><div class="det">' + detalhe + '</div></div>';
    const difAB = rel.valorAbertoA - rel.valorAbertoB;
    const regras = Object.keys(COMO).filter((k) => rel.porRegra[k]);
    return '<section class="rel-secao">' +
      '<h2><span class="rel-marcador primaria"></span>Resumo</h2>' +
      '<div class="rel-ponte">' + item(((p.inicio && p.inicio.modo === 'razao') ? 'Saldo inicial · razão ' : 'Saldo inicial · aging ') + R.dados.entrada.mesAnterior, p.anterior) + '<span class="op">+</span>' +
      item('Movimento do razão', p.movimento) + '<span class="op">=</span>' + item('Esperado (contabilidade)', p.esperado, true) + '<span class="op">→</span>' +
      item('Aging ' + R.dados.entrada.mesAtual, p.atual) + '<span class="op">·</span>' + item('Diferença da ponte', p.diferenca) + '</div>' +
      '<div class="rel-numeros">' +
      numero('Conciliações com ID', t.conciliacoes.toLocaleString('pt-BR'), t.AxA + ' A×A · ' + t.AxB + ' A×B' + (t.BxB ? ' · ' + t.BxB + ' B×B' : '') + ' · ' + t.itensConciliados.toLocaleString('pt-BR') + ' itens') +
      numero('Automáticas (⚡ Conciliar)', t.automaticas.toLocaleString('pt-BR'), t.itensAutomaticas.toLocaleString('pt-BR') + ' itens · pelo documento', 'azul') +
      numero('Manuais (à mão)', t.manuais.toLocaleString('pt-BR'), t.itensManuais.toLocaleString('pt-BR') + ' itens · ' + t.manuaisComDiferenca + ' com diferença', 'ambar') +
      (t.porValor ? numero('Só pelo valor (≈)', t.porValor.toLocaleString('pt-BR'), t.itensPorValor.toLocaleString('pt-BR') + ' itens · sem documento e fornecedor · conferir', 'roxo') : '') +
      (t.comMargem ? numero('Com margem (±)', t.comMargem.toLocaleString('pt-BR'), t.itensComMargem.toLocaleString('pt-BR') + ' itens · diferença somada ' + dinheiro(t.diferencaComMargem), 'verde') : '') +
      numero('Em aberto · Parte A', dinheiro(rel.valorAbertoA), rel.abertosA.length + ' item(ns) na contabilidade') +
      numero('Em aberto · Parte B', dinheiro(rel.valorAbertoB), rel.abertosB.length + ' item(ns) no financeiro') +
      numero('Diferença a investigar', dinheiro(difAB), 'em aberto A − em aberto B', 'destaque') +
      '</div>' +
      (regras.length ? '<table class="rel-tab rel-regras"><thead><tr><th>Como foi achado</th><th class="num">Conciliações</th><th class="num">Itens</th></tr></thead><tbody>' +
        regras.map((k) => '<tr><td><b>' + T.esc(COMO[k]) + '</b> <span class="suave">— ' + T.esc(M.REGRAS_AB[k] || '') + '</span></td><td class="num">' + rel.porRegra[k].conciliacoes + '</td><td class="num">' + rel.porRegra[k].itens + '</td></tr>').join('') +
        '</tbody></table>' : '') +
      (t.paraConferir.length ? '<p class="rel-alerta">⚠ Para conferir — ' + R.cfg.avisoAntes + ': ' + t.paraConferir.map((id) => '<b>#' + id + '</b>').join(', ') + '</p>' : '') +
      (t.comItemFaltando ? '<p class="rel-alerta">⚠ ' + t.comItemFaltando + ' conciliação(ões) com item que não está mais nos arquivos (o arquivo foi atualizado depois de conciliar): ' +
        porId().filter((x) => x.faltando).slice(0, 30).map((x) => '<b>#' + x.grupo.id + '</b>').join(', ') + '. Elas continuam conciliadas até alguém decidir.</p>' : '') +
      (atualizacoes().length ? '<p class="rel-explica">🔄 ' + atualizacoes().length + ' atualização(ões) de arquivo depois de conciliar — ver “Versões dos arquivos e atualizações”.</p>' : '') +
      '</section>';
  }

  function porId() { return R.rel.manuais.concat(R.rel.automaticas, R.rel.porValor, R.rel.comMargem); }
  function atualizacoes() { return (R.dados.decisoes && R.dados.decisoes.atualizacoes) || []; }

  // O que se sabe de um item que saiu dos arquivos (guardado nas atualizações).
  function itemQueSaiu(id) {
    for (const a of atualizacoes().slice().reverse()) {
      for (const f of a.faltando || []) { const s = (f.sairam || []).find((x) => x.id === id && x.valor !== undefined); if (s) return s; }
      const s = (a.sairam || []).find((x) => x.id === id && x.valor !== undefined);
      if (s) return s;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // VERSÕES dos arquivos e ATUALIZAÇÕES depois de conciliar (Dony, 16/09/2026: "fica registrado quantos
  // razões subiram; o aging também — dá para provar que o financeiro estava errado").
  // ------------------------------------------------------------------
  function versoesDosArquivos() {
    const d = R.dados, metas = (d.arqs && d.arqs.metas) || [];
    const lugares = [
      ['Razão · ' + (d.entrada.nomeRazao || d.entrada.mesAtual), d.arquivos.raz.meta],
      ['Aging ' + d.entrada.mesAnterior + ' · Parte A', d.arquivos.aAnt.meta],
      ['Aging ' + d.entrada.mesAtual + ' · Parte B', d.arquivos.aAtu.meta],
    ];
    return lugares.map(([nome, m]) => ({ nome, emUso: m, versoes: raiz.TelaSubir.versoesDoArquivo(metas, m, { varias: false }) }));
  }
  function textoComparacao(c) {
    if (!c || c.iguais === undefined) return '—';
    return raiz.TelaSubir.contagensDaComparacao(c, false);
  }
  function secaoVersoes() {
    const lugares = versoesDosArquivos();
    const ats = atualizacoes();
    const tab = (l) => '<h3 class="rel-sub">' + T.esc(l.nome) + ' <small>(' + l.versoes.length + (l.versoes.length === 1 ? ' versão' : ' versões') + ')</small></h3>' +
      '<table class="rel-tab"><thead><tr><th style="width:62px">Versão</th><th>Arquivo</th><th style="width:150px">Carregado</th><th class="num" style="width:90px">Itens</th><th>Em relação à versão anterior</th></tr></thead><tbody>' +
      l.versoes.map((m, i) => '<tr><td><b>' + (l.versoes.length - i) + '</b>' + (m.id === l.emUso.id ? ' <span class="selo opcional">em uso</span>' : '') + '</td>' +
        '<td>' + T.esc(m.arquivo || '') + '</td><td>' + T.esc(m.enviadoPor || '') + (m.enviadoEm ? ' · ' + U.dataHoraLocal(m.enviadoEm) : '') + '</td>' +
        '<td class="num">' + (m.tipo === 'razao' ? (m.lancamentos || 0) + ' lanç.' : (m.titulos || 0) + ' tít. · ' + T.moeda(m.total || 0)) + '</td>' +
        '<td>' + T.esc(i < l.versoes.length - 1 || (m.comparacao && m.comparacao.com) ? textoComparacao(m.comparacao) : 'primeira versão') + '</td></tr>').join('') +
      '</tbody></table>';
    const linhaAt = (a) => {
      const mud = (a.mudaram || []).length;
      return '<tr><td>' + U.dataHoraLocal(a.quando) + '<br><span class="suave">' + T.esc(a.quem || '') + '</span></td><td>' + T.esc((a.nomes || []).join(' e ') || 'arquivo') + '</td>' +
        '<td class="num">' + a.continuam + '</td><td class="num">' + (a.trocadas || []).length + '</td><td class="num">' + (a.faltando || []).filter((f) => !f.jaFaltava).length + '</td>' +
        '<td class="num">' + (a.novas || []).length + '</td>' +
        '<td>' + (a.semComparacao ? 'sem comparação' : 'entraram ' + Math.max(0, (a.qtdEntraram || 0) - mud) + ' · saíram ' + Math.max(0, (a.qtdSairam || 0) - mud) + ' · mudaram ' + mud) + '</td></tr>';
    };
    return '<section class="rel-secao versoes">' +
      '<h2><span class="rel-marcador primaria"></span>Versões dos arquivos e atualizações</h2>' +
      '<p class="rel-explica">Cada arquivo novo carregado no mesmo lugar vira uma versão; o programa usa a mais nova e guarda as anteriores, com a comparação entre elas.</p>' +
      lugares.map(tab).join('') +
      (ats.length ? '<h3 class="rel-sub">Atualizações depois de conciliar <small>(' + ats.length + ')</small></h3>' +
        '<table class="rel-tab"><thead><tr><th style="width:120px">Quando</th><th>Arquivo</th><th class="num">Continuaram</th><th class="num">Item trocado</th><th class="num">Ficaram com item faltando</th><th class="num">Novas (⚡)</th><th>Itens</th></tr></thead><tbody>' +
        ats.map(linhaAt).join('') + '</tbody></table>' : '<p class="rel-vazio">Nenhum arquivo foi atualizado depois de conciliar.</p>') +
      '</section>';
  }

  const SECOES = {
    manuais: { lista: () => R.rel.manuais, titulo: 'Conciliações manuais', vazio: 'manual', total: 'das manuais', marcador: 'ambar',
      explica: 'Feitas à mão: quem marcou os itens, quando, e a observação quando concilia com diferença.' },
    automaticas: { lista: () => R.rel.automaticas, titulo: 'Conciliações automáticas', vazio: 'automática', total: 'das automáticas', marcador: 'azul',
      explica: 'Achadas pelo ⚡ Conciliar, pelo número do documento: primeiro com o mesmo fornecedor, depois com o mesmo nome de fornecedor, depois só pelo documento.' },
    valor: { lista: () => R.rel.porValor, titulo: 'Conciliações só pelo valor', vazio: 'só pelo valor', total: 'das só pelo valor', marcador: 'roxo',
      explica: 'Achadas pelo ≈ Conciliar só pelo valor: mesmo valor quebrado, SEM olhar documento e fornecedor (valor inteiro terminado em zero fica de fora). Confira cada uma.' },
    margem: { lista: () => R.rel.comMargem, titulo: 'Conciliações com margem', vazio: 'com margem', total: 'das com margem', marcador: 'verde',
      explica: 'Achadas pelo ± Conciliar com margem: mesmo documento e mesmo fornecedor, aceitando diferença de até ' + T.moeda(M.MARGEM_AB) + ' entre as partes (a diferença de cada uma aparece no cabeçalho).' },
  };
  function secaoConciliacoes(qual) {
    const s = SECOES[qual];
    const manuais = qual === 'manuais';
    const lista = s.lista();
    let corpo;
    if (!lista.length) corpo = '<p class="rel-vazio">Nenhuma conciliação ' + s.vazio + ' neste mês.</p>';
    else if (R.opcoes.itens) corpo = lista.map((x) => blocoDoId(x, qual)).join('');
    else corpo = tabelaCompacta(lista, manuais);
    const somaA = lista.reduce((s2, x) => s2 + (x.grupo.valorA || 0), 0), somaB = lista.reduce((s2, x) => s2 + (x.grupo.valorB || 0), 0);
    return '<section class="rel-secao ' + qual + '">' +
      '<h2><span class="rel-marcador ' + s.marcador + '"></span>' + s.titulo + ' <small>(' + lista.length.toLocaleString('pt-BR') + ')</small></h2>' +
      '<p class="rel-explica">' + s.explica + '</p>' + corpo +
      (lista.length ? '<p class="rel-total-secao">Total ' + s.total + ': Parte A <b>' + dinheiro(somaA) + '</b> · Parte B <b>' + dinheiro(somaB) + '</b>' +
        (Math.abs(somaA - somaB) >= 1 ? ' · diferença <b class="negativo">' + dinheiro(somaA - somaB) + '</b>' : '') + '</p>' : '') +
      '</section>';
  }

  function blocoDoId(x, qual) {
    const g = x.grupo;
    const manual = qual === 'manuais';
    const sub = [];
    sub.push((manual ? 'Conciliado à mão por ' : qual === 'valor' ? 'Conciliado pelo ≈ Conciliar só pelo valor · ' : qual === 'margem' ? 'Conciliado pelo ± Conciliar com margem · ' : 'Conciliado pelo ⚡ Conciliar · ') + quemQuando(g));
    if (!manual && M.REGRAS_AB[g.regra]) sub.push(T.esc(M.REGRAS_AB[g.regra]));
    if (g.obs) sub.push('✎ ' + T.esc(g.obs));
    if (g.aviso === 'baixa-antes-da-nota') sub.push('<span class="rel-aviso">⚠ ' + R.cfg.avisoAntes + '</span>');
    if (Math.abs(x.diferenca) >= 1) sub.push('<span class="negativo">diferença ' + dinheiro(x.diferenca) + '</span>');
    if (x.faltando) sub.push('<span class="negativo">⚠ ' + x.faltando + ' item(ns) não estão mais nos arquivos</span>');
    if (g.trocas && g.trocas.length) sub.push('✎ item trocado pelo corrigido (' + g.trocas.map((t) => U.dataHoraLocal(t.quando)).join(', ') + ')');
    const classe = manual ? 'mao' : qual === 'valor' ? 'valor' : qual === 'margem' ? 'margem' : 'opcional';
    return '<div class="rel-grupo' + (manual ? ' manual' : qual === 'valor' ? ' valor' : qual === 'margem' ? ' margem' : '') + '">' +
      '<div class="rel-grupo-cab"><span class="rel-id">#' + g.id + '</span>' +
      '<span class="pilula ' + (g.tipo === 'AxB' ? 'azul' : 'cinza') + '">' + (TIPO[g.tipo] || g.tipo) + '</span>' +
      '<span class="selo ' + classe + '">' + T.esc(COMO[g.regra] || g.regra) + '</span>' +
      (g.documento ? '<span class="rel-doc">Doc ' + T.esc(g.documento) + '</span>' : '') +
      '<span class="rel-nome">' + T.esc(g.nome || '') + '</span>' +
      '<span class="rel-valores">A <b>' + dinheiro(g.valorA || 0) + '</b> · B <b>' + dinheiro(g.valorB || 0) + '</b></span></div>' +
      '<div class="rel-grupo-sub">' + sub.join(' · ') + '</div>' +
      '<table class="rel-tab"><thead><tr><th style="width:34px">Lado</th><th style="width:78px">Documento</th><th style="width:118px">Origem</th><th style="width:74px">Data</th><th>Fornecedor · histórico</th><th class="num" style="width:104px">Valor · D/C</th></tr></thead><tbody>' +
      x.itens.map((i) => i.faltando
        ? linhaQueSaiu(i.id)
        : '<tr><td><b>' + i.lado + '</b></td><td class="doc">' + T.nome(i.doc) + '</td><td>' + T.esc(fonte(i)) + '</td><td>' + T.esc(i.data || '—') + '</td>' +
          '<td>' + T.esc(i.nome || '') + (i.historico ? '<br><span class="suave">' + T.esc(i.historico) + '</span>' : '') + '</td>' + tdDinheiro(i.valor) + '</tr>').join('') +
      '</tbody></table></div>';
  }

  // Item de uma conciliação que saiu dos arquivos: com o detalhe guardado na atualização, quando houver.
  function linhaQueSaiu(id) {
    const s = itemQueSaiu(id);
    if (!s) return '<tr><td colspan="6" class="negativo">⚠ Item que não está mais nos arquivos (' + T.esc(id) + ')</td></tr>';
    return '<tr class="negativo"><td><b>' + T.esc(s.lado || '') + '</b></td><td class="doc">' + T.nome(s.doc) + '</td><td>⚠ saiu do arquivo</td><td>' + T.esc(s.data || '—') + '</td>' +
      '<td>' + T.esc(s.nome || '') + (s.historico ? '<br><span class="suave">' + T.esc(s.historico) + '</span>' : '') + '</td>' + tdDinheiro(s.valor) + '</tr>';
  }

  function tabelaCompacta(lista, manuais) {
    return '<table class="rel-tab rel-compacta"><thead><tr><th>ID</th><th>Tipo</th><th>Como</th><th>Documento</th><th>Fornecedor</th><th class="num">Itens</th><th class="num">Parte A</th><th class="num">Parte B</th>' +
      '<th>' + (manuais ? 'Quem · quando · observação' : 'Quando') + '</th></tr></thead><tbody>' +
      lista.map((x) => { const g = x.grupo; return '<tr><td><b>#' + g.id + '</b></td><td>' + (TIPO[g.tipo] || g.tipo) + '</td><td>' + T.esc(COMO[g.regra] || g.regra) + '</td>' +
        '<td class="doc">' + T.nome(g.documento) + '</td><td>' + T.esc(g.nome || '') + (g.aviso ? ' <span class="rel-aviso">⚠</span>' : '') + '</td><td class="num">' + x.itens.length + '</td>' +
        tdDinheiro(g.valorA || 0) + tdDinheiro(g.valorB || 0) + '<td>' + (manuais ? quemQuando(g) + (g.obs ? ' · ✎ ' + T.esc(g.obs) : '') : (g.quando ? U.dataHoraLocal(g.quando) : '—')) + '</td></tr>'; }).join('') +
      '</tbody></table>';
  }

  function secaoAbertos() {
    const rel = R.rel;
    const tabela = (titulo, lista, total) => '<h3 class="rel-sub">' + T.esc(titulo) + ' <small>(' + lista.length + ' item(ns))</small></h3>' +
      (lista.length
        ? '<table class="rel-tab"><thead><tr><th style="width:78px">Documento</th><th style="width:118px">Origem</th><th style="width:74px">Data</th><th>Fornecedor · histórico</th><th class="num" style="width:104px">Valor · D/C</th></tr></thead><tbody>' +
          lista.map((i) => '<tr><td class="doc">' + T.nome(i.doc) + '</td><td>' + T.esc(fonte(i)) + '</td><td>' + T.esc(i.data || '—') + '</td>' +
            '<td>' + T.esc(i.nome || '') + (i.historico ? '<br><span class="suave">' + T.esc(i.historico) + '</span>' : '') + '</td>' + tdDinheiro(i.valor) + '</tr>').join('') +
          '</tbody><tfoot><tr><td colspan="4">Total em aberto</td>' + tdDinheiro(total) + '</tr></tfoot></table>'
        : '<p class="rel-vazio">Nada em aberto.</p>');
    return '<section class="rel-secao abertos">' +
      '<h2><span class="rel-marcador vermelho"></span>Em aberto <small>(o que sobrou para investigar)</small></h2>' +
      tabela('Parte A · contabilidade', rel.abertosA, rel.valorAbertoA) +
      tabela('Parte B · financeiro', rel.abertosB, rel.valorAbertoB) +
      '<p class="rel-total-secao">Em aberto A <b>' + dinheiro(rel.valorAbertoA) + '</b> − em aberto B <b>' + dinheiro(rel.valorAbertoB) + '</b> = diferença a investigar <b>' + dinheiro(rel.valorAbertoA - rel.valorAbertoB) + '</b></p>' +
      '</section>';
  }

  function assinaturas() {
    return '<footer class="rel-assinaturas"><div><span></span>Preparado por</div><div><span></span>Conferido por</div><div><span></span>Data</div></footer>' +
      '<p class="rel-rodape">' + T.esc((app().config && app().config.programa) || 'Conciliador Solutta') + ' · relatório de conciliação · ' + T.esc(R.dados.emp.codigo + ' · ' + R.dados.emp.nome) +
      ' · ' + T.esc(nomeDoMes()) + ' · emitido em ' + U.dataHoraLocal(R.emitido) + '</p>';
  }

  // ------------------------------------------------------------------
  // Imprimir / PDF e Excel
  // ------------------------------------------------------------------
  function nomeDoArquivo(extensao) {
    return U.nomeSeguro('Conciliação ' + R.cfg.numero + ' ' + R.dados.emp.codigo + ' ' + R.dados.emp.nome + ' ' + U.anoMes(R.comp), 90) + (extensao || '');
  }

  function imprimir() {
    // O título da página vira o nome sugerido do PDF.
    const antes = document.title;
    document.title = nomeDoArquivo('');
    const devolver = () => { document.title = antes; raiz.removeEventListener('afterprint', devolver); };
    raiz.addEventListener('afterprint', devolver);
    raiz.print();
  }

  function baixarExcel() {
    const X = raiz.XLSX;
    const d = R.dados, rel = R.rel, p = d.r.ponte, t = rel.totais;
    const reais = (c) => Math.round(Number(c) || 0) / 100;
    // Valor absoluto (Dony, 17/09/2026: "uma coluna de valor absoluto, que não considere se é débito ou
    // crédito, para ficar mais fácil de analisar no Excel"): ao lado do valor com sinal e do D/C.
    const absoluto = (c) => Math.abs(reais(c));
    const wb = X.utils.book_new();

    function folha(linhas, larguras, colunasValor, inicioDados) {
      const ws = X.utils.aoa_to_sheet(linhas);
      ws['!cols'] = larguras.map((w) => ({ wch: w }));
      const faixa = X.utils.decode_range(ws['!ref'] || 'A1');
      for (let r = inicioDados || 0; r <= faixa.e.r; r++) {
        for (const c of colunasValor) {
          const cel = ws[X.utils.encode_cell({ r, c })];
          if (cel && cel.t === 'n') cel.z = '#,##0.00';
        }
      }
      return ws;
    }

    const cab = [
      ['Relatório de conciliação — Passo ' + R.cfg.numero + ' · ' + R.cfg.titulo],
      ['Empresa', d.emp.codigo + ' · ' + d.emp.nome],
      ['Competência', U.nomeCompetencia(R.comp)],
      ['Conta', (d.r.conta.codigo || '') + ' · ' + (d.r.conta.nome || '')],
      ['Saldo inicial', textoInicio()],
      ['Emitido', (app().usuario.nome || '') + ' · ' + U.dataHoraLocal(R.emitido)],
      [],
    ];
    // Linha de valor do resumo: rótulo, valor com sinal, D/C e valor absoluto (só elas com formato de dinheiro;
    // as contagens ficam como número inteiro).
    const valor = (rotulo, c) => { const l = [rotulo, reais(c), dc(c), absoluto(c)]; l.ehValor = true; return l; };
    const resumo = cab.concat([
      ['Ponte', 'Valor', 'D/C', 'Valor absoluto'],
      valor(((p.inicio && p.inicio.modo === 'razao') ? 'Saldo inicial · razão ' : 'Saldo inicial · aging ') + d.entrada.mesAnterior, p.anterior),
      valor('Movimento do razão', p.movimento),
      valor('Esperado (contabilidade)', p.esperado),
      valor('Aging ' + d.entrada.mesAtual, p.atual),
      valor('Diferença da ponte', p.diferenca),
      [],
      ['Conciliações com ID', t.conciliacoes],
      ['  A×A', t.AxA], ['  A×B', t.AxB],
      ['Automáticas (⚡ Conciliar)', t.automaticas],
      ['Manuais (à mão)', t.manuais],
      ['Só pelo valor (≈)', t.porValor],
      ['Com margem (±)', t.comMargem], valor('Com margem · diferença somada', t.diferencaComMargem),
      ['Manuais com diferença', t.manuaisComDiferenca],
      ['Com item que não está mais nos arquivos', t.comItemFaltando],
      ['Atualizações de arquivo depois de conciliar', atualizacoes().length],
      ['Em aberto · Parte A (itens)', rel.abertosA.length], valor('Em aberto · Parte A (valor)', rel.valorAbertoA),
      ['Em aberto · Parte B (itens)', rel.abertosB.length], valor('Em aberto · Parte B (valor)', rel.valorAbertoB),
      valor('Diferença a investigar', rel.valorAbertoA - rel.valorAbertoB),
    ]);
    const folhaResumo = folha(resumo, [34, 60, 6, 16], []);
    resumo.forEach((l, r) => {
      if (!l.ehValor) return;
      [1, 3].forEach((c) => { const cel = folhaResumo[X.utils.encode_cell({ r, c })]; if (cel && cel.t === 'n') cel.z = '#,##0.00'; });
    });
    X.utils.book_append_sheet(wb, folhaResumo, 'Resumo');

    const cabecalhoItens = ['ID', 'Tipo', 'Como', 'Documento (ID)', 'Fornecedor (ID)', 'Parte A (ID)', 'Parte B (ID)', 'Quem', 'Quando', 'Observação', 'Aviso', 'Lado', 'Documento', 'Origem', 'Data', 'Fornecedor', 'Histórico', 'Valor', 'D/C', 'Valor absoluto'];
    const linhasDe = (lista) => {
      const linhas = [cabecalhoItens];
      for (const x of lista) {
        const g = x.grupo;
        for (const i of x.itens) {
          linhas.push([g.id, TIPO[g.tipo] || g.tipo, COMO[g.regra] || g.regra, g.documento || '', g.nome || '', reais(g.valorA), reais(g.valorB), g.quem || '',
            g.quando ? U.dataHoraLocal(g.quando) : '', g.obs || '', g.aviso === 'baixa-antes-da-nota' ? R.cfg.avisoCurto : '',
            ...(i.faltando ? itemQueSaiuNoExcel(i.id) : [i.lado, i.doc, fonte(i), i.data || '', i.nome || '', i.historico || '', reais(i.valor), dc(i.valor), absoluto(i.valor)])]);
        }
      }
      return linhas;
    };
    function itemQueSaiuNoExcel(id) {
      const s = itemQueSaiu(id);
      return s ? [s.lado || '', s.doc || '', 'SAIU DO ARQUIVO', s.data || '', s.nome || '', s.historico || '', reais(s.valor), dc(s.valor), absoluto(s.valor)]
        : ['', '', 'item não está mais nos arquivos', '', '', id, '', '', ''];
    }
    const larguras = [6, 6, 20, 14, 30, 13, 13, 16, 16, 30, 18, 5, 12, 18, 11, 30, 50, 13, 5, 14];
    const colunasDeValor = [5, 6, 17, 19];
    X.utils.book_append_sheet(wb, folha(linhasDe(rel.manuais), larguras, colunasDeValor, 1), 'Manuais');
    X.utils.book_append_sheet(wb, folha(linhasDe(rel.automaticas), larguras, colunasDeValor, 1), 'Automáticas');
    if (rel.porValor.length) X.utils.book_append_sheet(wb, folha(linhasDe(rel.porValor), larguras, colunasDeValor, 1), 'Só pelo valor');
    if (rel.comMargem.length) X.utils.book_append_sheet(wb, folha(linhasDe(rel.comMargem), larguras, colunasDeValor, 1), 'Com margem');

    const abertos = (lista) => [['Documento', 'Origem', 'Data', 'Fornecedor', 'Histórico', 'Valor', 'D/C', 'Valor absoluto']]
      .concat(lista.map((i) => [i.doc, fonte(i), i.data || '', i.nome || '', i.historico || '', reais(i.valor), dc(i.valor), absoluto(i.valor)]));
    X.utils.book_append_sheet(wb, folha(abertos(rel.abertosA), [12, 18, 11, 34, 60, 13, 5, 14], [5, 7], 1), 'Em aberto A');
    X.utils.book_append_sheet(wb, folha(abertos(rel.abertosB), [12, 18, 11, 34, 60, 13, 5, 14], [5, 7], 1), 'Em aberto B');

    // Versões dos arquivos e atualizações depois de conciliar (a prova do que mudou).
    const versoes = [['Arquivo', 'Versão', 'Em uso', 'Nome do arquivo', 'Carregado por', 'Carregado em', 'Itens', 'Iguais à anterior', 'Entraram', 'Saíram', 'Mudaram', 'Total (aging)']];
    for (const l of versoesDosArquivos()) {
      l.versoes.forEach((m, i) => {
        const c = m.comparacao || {};
        const tem = c.iguais !== undefined;
        versoes.push([l.nome, l.versoes.length - i, m.id === l.emUso.id ? 'sim' : '', m.arquivo || '', m.enviadoPor || '', m.enviadoEm ? U.dataHoraLocal(m.enviadoEm) : '',
          m.tipo === 'razao' ? (m.lancamentos || 0) : (m.titulos || 0),
          tem ? c.iguais : '', tem ? c.entraram : '', tem ? c.sairam : '', tem ? c.mudaram : '', m.tipo === 'razao' ? '' : reais(m.total || 0)]);
      });
    }
    versoes.push([]);
    versoes.push(['Atualizações depois de conciliar', 'Quando', 'Quem', 'Arquivo', 'Continuaram', 'Item trocado', 'Ficaram com item faltando', 'Novas (⚡)', 'Entraram', 'Saíram', 'Mudaram']);
    for (const a of atualizacoes()) {
      const mud = (a.mudaram || []).length;
      versoes.push(['', U.dataHoraLocal(a.quando), a.quem || '', (a.nomes || []).join(' e '), a.continuam, (a.trocadas || []).length,
        (a.faltando || []).filter((f) => !f.jaFaltava).length, (a.novas || []).length,
        Math.max(0, (a.qtdEntraram || 0) - mud), Math.max(0, (a.qtdSairam || 0) - mud), mud]);
    }
    X.utils.book_append_sheet(wb, folha(versoes, [30, 18, 8, 40, 18, 16, 12, 16, 12, 10, 10, 14], [11], 1), 'Versões');

    const bytes = X.write(wb, { bookType: 'xlsx', type: 'array' });
    T.baixar(new Uint8Array(bytes), nomeDoArquivo('.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    T.avisoRapido('Excel baixado: ' + nomeDoArquivo('.xlsx') + ' (pasta Downloads).', 'ok', 5000);
    app().armazenamento.registrarNoLog({ codigo: R.codigo, acao: 'terceiro-relatorio-excel', alvo: d.registro.id, detalhe: U.nomeCompetencia(R.comp) }).catch(() => {});
  }

  raiz.TelaRelatorio3 = { mostrar };
})(self);
