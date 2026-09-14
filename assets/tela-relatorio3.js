/*
 * Conciliador Solutta — tela-relatorio3.js
 * Relatório da conciliação do Passo ③ (Conciliar A × B). Pedido do Dony (14/09/2026):
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
  const COMO = { 'doc-fornecedor-par': 'doc + fornecedor · par', 'doc-fornecedor': 'doc + fornecedor', 'doc-par': 'só doc · par', 'doc': 'só doc', 'manual': 'à mão' };
  const CHAVE_OPCOES = 'conciliador-solutta.relatorio3';
  const PADRAO = { manuais: true, automaticas: true, itens: true, abertos: true };

  function lerOpcoes() {
    try { return Object.assign({}, PADRAO, JSON.parse(app().lerLocal(CHAVE_OPCOES) || '{}')); } catch (e) { return Object.assign({}, PADRAO); }
  }

  let R = null; // estado desta tela

  async function mostrar(el, codigo, anoMes, conferir) {
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + anoMes + '/passo3';
    T.carregando(el, 'Montando o relatório de ' + U.nomeCompetencia(comp) + '…');
    const dados = await raiz.TelaPasso3.carregarDados(codigo, anoMes, conferir);
    if (!dados) return;
    if (dados.erro) { el.innerHTML = '<div class="aviso ambar">' + T.esc(dados.erro) + ' <a href="#/">Voltar</a></div>'; return; }
    if (dados.falta) {
      el.innerHTML = '<a class="voltar" href="' + voltar + '">← Passo ③ · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="aviso ambar"><span class="icone-aviso">📄</span><div><b>Sem relatório: falta arquivo para o Passo ③.</b><br>Suba ' + dados.falta.map(T.esc).join(', ') + '.</div></div>';
      return;
    }
    R = { el, codigo, comp, voltar, dados, rel: M.relatorioAB(dados.itens, dados.decisoes.conciliacoesAB), opcoes: lerOpcoes(), emitido: U.agoraISO() };
    desenhar();
  }

  function desenhar() {
    const o = R.opcoes;
    const marca = (nome, texto) => '<label class="linha-flex" style="gap:5px"><input type="checkbox" data-opcao="' + nome + '"' + (o[nome] ? ' checked' : '') + '> ' + texto + '</label>';
    R.el.innerHTML =
      '<div class="barra-relatorio nao-imprimir">' +
      '<a class="voltar" style="margin:0" href="' + R.voltar + '">← Voltar para a conciliação</a>' +
      '<div class="linha-flex" style="gap:14px">' +
      '<span class="suave pequeno">Mostrar:</span>' + marca('manuais', 'Manuais') + marca('automaticas', 'Automáticas') + marca('itens', 'Itens de cada ID') + marca('abertos', 'Em aberto') +
      '<button type="button" class="botao" data-acao="excel" title="Baixar o relatório em planilha">⬇ Excel</button>' +
      '<button type="button" class="botao primario" data-acao="imprimir" title="Na janela de impressão, escolha a impressora ou “Salvar como PDF”">🖨 Imprimir / salvar PDF</button>' +
      '</div></div>' +
      '<article class="relatorio">' + capa() + resumo() +
      (o.manuais ? secaoConciliacoes('manuais') : '') +
      (o.automaticas ? secaoConciliacoes('automaticas') : '') +
      (o.abertos ? secaoAbertos() : '') +
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
  function fonte(x) {
    if (x.fonte === 'anterior') return 'aging ' + R.dados.entrada.mesAnterior;
    if (x.fonte === 'atual') return 'aging ' + R.dados.entrada.mesAtual;
    return x.fonte === 'nota' ? 'razão · nota' : 'razão · baixa';
  }
  function dinheiro(c) { return U.formatarCentavos(c); }
  function tdDinheiro(c) { return '<td class="num' + (c < 0 ? ' negativo' : '') + '">' + dinheiro(c) + '</td>'; }
  function quemQuando(g) { return (g.quem ? T.esc(g.quem) : '—') + (g.quando ? ' · ' + U.dataHoraLocal(g.quando) : ''); }

  function capa() {
    const d = R.dados, emp = d.emp, conta = d.r.conta || {};
    const cfg = app().config || {};
    const ficha = [
      ['Empresa', emp.codigo + ' · ' + emp.nome],
      ['CNPJ', emp.cnpj ? U.formatarCnpj(emp.cnpj) : '—'],
      ['Competência', nomeDoMes()],
      ['Conta', (conta.codigo || '') + ' · ' + (conta.nome || '')],
      ['Parte A · contabilidade', 'aging ' + d.entrada.mesAnterior + ' + razão de ' + d.entrada.mesAtual],
      ['Parte B · financeiro', 'aging ' + d.entrada.mesAtual],
      ['Última gravação', d.registro.atualizadoEm ? (d.registro.atualizadoPor || '—') + ' · ' + U.dataHoraLocal(d.registro.atualizadoEm) : 'nada gravado ainda'],
      ['Emitido', (app().usuario.nome || '—') + ' · ' + U.dataHoraLocal(R.emitido)],
      ['Programa', (cfg.programa || 'Conciliador Solutta') + (cfg.numero ? ' · versão ' + cfg.numero : '')],
    ];
    return '<header class="rel-capa">' +
      '<div class="rel-topo"><div class="rel-marca"><span class="selo-marca">S</span>' + T.esc(cfg.programa || 'Conciliador Solutta') + '</div>' +
      '<div class="rel-sobretitulo">Relatório de conciliação</div></div>' +
      '<h1>Fornecedores × contas a pagar</h1>' +
      '<p class="rel-subtitulo">Passo ③ · Conciliar A × B · <b>' + T.esc(nomeDoMes()) + '</b></p>' +
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
      '<div class="rel-ponte">' + item('Aging ' + R.dados.entrada.mesAnterior, p.anterior) + '<span class="op">+</span>' +
      item('Movimento do razão', p.movimento) + '<span class="op">=</span>' + item('Esperado (contabilidade)', p.esperado, true) + '<span class="op">→</span>' +
      item('Aging ' + R.dados.entrada.mesAtual, p.atual) + '<span class="op">·</span>' + item('Diferença da ponte', p.diferenca) + '</div>' +
      '<div class="rel-numeros">' +
      numero('Conciliações com ID', t.conciliacoes.toLocaleString('pt-BR'), t.AxA + ' A×A · ' + t.AxB + ' A×B' + (t.BxB ? ' · ' + t.BxB + ' B×B' : '') + ' · ' + t.itensConciliados.toLocaleString('pt-BR') + ' itens') +
      numero('Automáticas (⚡ Conciliar)', t.automaticas.toLocaleString('pt-BR'), t.itensAutomaticas.toLocaleString('pt-BR') + ' itens · pelo documento', 'azul') +
      numero('Manuais (à mão)', t.manuais.toLocaleString('pt-BR'), t.itensManuais.toLocaleString('pt-BR') + ' itens · ' + t.manuaisComDiferenca + ' com diferença', 'ambar') +
      numero('Em aberto · Parte A', dinheiro(rel.valorAbertoA), rel.abertosA.length + ' item(ns) na contabilidade') +
      numero('Em aberto · Parte B', dinheiro(rel.valorAbertoB), rel.abertosB.length + ' item(ns) no financeiro') +
      numero('Diferença a investigar', dinheiro(difAB), 'em aberto A − em aberto B', 'destaque') +
      '</div>' +
      (regras.length ? '<table class="rel-tab rel-regras"><thead><tr><th>Como o ⚡ Conciliar achou</th><th class="num">Conciliações</th><th class="num">Itens</th></tr></thead><tbody>' +
        regras.map((k) => '<tr><td><b>' + T.esc(COMO[k]) + '</b> <span class="suave">— ' + T.esc(M.REGRAS_AB[k] || '') + '</span></td><td class="num">' + rel.porRegra[k].conciliacoes + '</td><td class="num">' + rel.porRegra[k].itens + '</td></tr>').join('') +
        '</tbody></table>' : '') +
      (t.paraConferir.length ? '<p class="rel-alerta">⚠ Para conferir — baixa com data antes da nota: ' + t.paraConferir.map((id) => '<b>#' + id + '</b>').join(', ') + '</p>' : '') +
      (t.comItemFaltando ? '<p class="rel-alerta">⚠ ' + t.comItemFaltando + ' conciliação(ões) com item que não está mais nos arquivos (arquivo trocado depois de conciliar).</p>' : '') +
      '</section>';
  }

  function secaoConciliacoes(qual) {
    const manuais = qual === 'manuais';
    const lista = manuais ? R.rel.manuais : R.rel.automaticas;
    const titulo = manuais ? 'Conciliações manuais' : 'Conciliações automáticas';
    const explica = manuais
      ? 'Feitas à mão: quem marcou os itens, quando, e a observação quando concilia com diferença.'
      : 'Achadas pelo ⚡ Conciliar, pelo número do documento: primeiro com o mesmo fornecedor, depois só pelo documento.';
    let corpo;
    if (!lista.length) corpo = '<p class="rel-vazio">Nenhuma conciliação ' + (manuais ? 'manual' : 'automática') + ' neste mês.</p>';
    else if (R.opcoes.itens) corpo = lista.map((x) => blocoDoId(x, manuais)).join('');
    else corpo = tabelaCompacta(lista, manuais);
    const somaA = lista.reduce((s, x) => s + (x.grupo.valorA || 0), 0), somaB = lista.reduce((s, x) => s + (x.grupo.valorB || 0), 0);
    return '<section class="rel-secao ' + qual + '">' +
      '<h2><span class="rel-marcador ' + (manuais ? 'ambar' : 'azul') + '"></span>' + titulo + ' <small>(' + lista.length.toLocaleString('pt-BR') + ')</small></h2>' +
      '<p class="rel-explica">' + explica + '</p>' + corpo +
      (lista.length ? '<p class="rel-total-secao">Total ' + (manuais ? 'das manuais' : 'das automáticas') + ': Parte A <b>' + dinheiro(somaA) + '</b> · Parte B <b>' + dinheiro(somaB) + '</b>' +
        (Math.abs(somaA - somaB) >= 1 ? ' · diferença <b class="negativo">' + dinheiro(somaA - somaB) + '</b>' : '') + '</p>' : '') +
      '</section>';
  }

  function blocoDoId(x, manual) {
    const g = x.grupo;
    const sub = [];
    sub.push((manual ? 'Conciliado à mão por ' : 'Conciliado pelo ⚡ Conciliar · ') + quemQuando(g));
    if (!manual && M.REGRAS_AB[g.regra]) sub.push(T.esc(M.REGRAS_AB[g.regra]));
    if (g.obs) sub.push('✎ ' + T.esc(g.obs));
    if (g.aviso === 'baixa-antes-da-nota') sub.push('<span class="rel-aviso">⚠ baixa com data antes da nota</span>');
    if (Math.abs(x.diferenca) >= 1) sub.push('<span class="negativo">diferença ' + dinheiro(x.diferenca) + '</span>');
    if (x.faltando) sub.push('<span class="negativo">' + x.faltando + ' item(ns) não estão mais nos arquivos</span>');
    return '<div class="rel-grupo' + (manual ? ' manual' : '') + '">' +
      '<div class="rel-grupo-cab"><span class="rel-id">#' + g.id + '</span>' +
      '<span class="pilula ' + (g.tipo === 'AxB' ? 'azul' : 'cinza') + '">' + (TIPO[g.tipo] || g.tipo) + '</span>' +
      '<span class="selo ' + (manual ? 'mao' : 'opcional') + '">' + T.esc(COMO[g.regra] || g.regra) + '</span>' +
      (g.documento ? '<span class="rel-doc">Doc ' + T.esc(g.documento) + '</span>' : '') +
      '<span class="rel-nome">' + T.esc(g.nome || '') + '</span>' +
      '<span class="rel-valores">A <b>' + dinheiro(g.valorA || 0) + '</b> · B <b>' + dinheiro(g.valorB || 0) + '</b></span></div>' +
      '<div class="rel-grupo-sub">' + sub.join(' · ') + '</div>' +
      '<table class="rel-tab"><thead><tr><th style="width:34px">Lado</th><th style="width:78px">Documento</th><th style="width:118px">Origem</th><th style="width:74px">Data</th><th>Fornecedor · histórico</th><th class="num" style="width:92px">Valor</th></tr></thead><tbody>' +
      x.itens.map((i) => i.faltando
        ? '<tr><td colspan="6" class="negativo">Item que não está mais nos arquivos (' + T.esc(i.id) + ')</td></tr>'
        : '<tr><td><b>' + i.lado + '</b></td><td class="doc">' + T.nome(i.doc) + '</td><td>' + T.esc(fonte(i)) + '</td><td>' + T.esc(i.data || '—') + '</td>' +
          '<td>' + T.esc(i.nome || '') + (i.historico ? '<br><span class="suave">' + T.esc(i.historico) + '</span>' : '') + '</td>' + tdDinheiro(i.valor) + '</tr>').join('') +
      '</tbody></table></div>';
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
        ? '<table class="rel-tab"><thead><tr><th style="width:78px">Documento</th><th style="width:118px">Origem</th><th style="width:74px">Data</th><th>Fornecedor · histórico</th><th class="num" style="width:92px">Valor</th></tr></thead><tbody>' +
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
    return U.nomeSeguro('Conciliação ③ ' + R.dados.emp.codigo + ' ' + R.dados.emp.nome + ' ' + U.anoMes(R.comp), 90) + (extensao || '');
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
      ['Relatório de conciliação — Passo ③ · Fornecedores × contas a pagar'],
      ['Empresa', d.emp.codigo + ' · ' + d.emp.nome],
      ['Competência', U.nomeCompetencia(R.comp)],
      ['Conta', (d.r.conta.codigo || '') + ' · ' + (d.r.conta.nome || '')],
      ['Emitido', (app().usuario.nome || '') + ' · ' + U.dataHoraLocal(R.emitido)],
      [],
    ];
    const resumo = cab.concat([
      ['Ponte'],
      ['Aging ' + d.entrada.mesAnterior, reais(p.anterior)],
      ['Movimento do razão', reais(p.movimento)],
      ['Esperado (contabilidade)', reais(p.esperado)],
      ['Aging ' + d.entrada.mesAtual, reais(p.atual)],
      ['Diferença da ponte', reais(p.diferenca)],
      [],
      ['Conciliações com ID', t.conciliacoes],
      ['  A×A', t.AxA], ['  A×B', t.AxB],
      ['Automáticas (⚡ Conciliar)', t.automaticas],
      ['Manuais (à mão)', t.manuais],
      ['Manuais com diferença', t.manuaisComDiferenca],
      ['Em aberto · Parte A (itens)', rel.abertosA.length], ['Em aberto · Parte A (valor)', reais(rel.valorAbertoA)],
      ['Em aberto · Parte B (itens)', rel.abertosB.length], ['Em aberto · Parte B (valor)', reais(rel.valorAbertoB)],
      ['Diferença a investigar', reais(rel.valorAbertoA - rel.valorAbertoB)],
    ]);
    X.utils.book_append_sheet(wb, folha(resumo, [34, 60], [1], 7), 'Resumo');

    const cabecalhoItens = ['ID', 'Tipo', 'Como', 'Documento (ID)', 'Fornecedor (ID)', 'Parte A (ID)', 'Parte B (ID)', 'Quem', 'Quando', 'Observação', 'Aviso', 'Lado', 'Documento', 'Origem', 'Data', 'Fornecedor', 'Histórico', 'Valor'];
    const linhasDe = (lista) => {
      const linhas = [cabecalhoItens];
      for (const x of lista) {
        const g = x.grupo;
        for (const i of x.itens) {
          linhas.push([g.id, TIPO[g.tipo] || g.tipo, COMO[g.regra] || g.regra, g.documento || '', g.nome || '', reais(g.valorA), reais(g.valorB), g.quem || '',
            g.quando ? U.dataHoraLocal(g.quando) : '', g.obs || '', g.aviso === 'baixa-antes-da-nota' ? 'baixa antes da nota' : '',
            i.faltando ? '' : i.lado, i.faltando ? '' : i.doc, i.faltando ? 'item não está mais nos arquivos' : fonte(i), i.faltando ? '' : (i.data || ''),
            i.faltando ? '' : (i.nome || ''), i.faltando ? i.id : (i.historico || ''), i.faltando ? '' : reais(i.valor)]);
        }
      }
      return linhas;
    };
    const larguras = [6, 6, 20, 14, 30, 13, 13, 16, 16, 30, 18, 5, 12, 18, 11, 30, 50, 13];
    X.utils.book_append_sheet(wb, folha(linhasDe(rel.manuais), larguras, [5, 6, 17], 1), 'Manuais');
    X.utils.book_append_sheet(wb, folha(linhasDe(rel.automaticas), larguras, [5, 6, 17], 1), 'Automáticas');

    const abertos = (lista) => [['Documento', 'Origem', 'Data', 'Fornecedor', 'Histórico', 'Valor']].concat(lista.map((i) => [i.doc, fonte(i), i.data || '', i.nome || '', i.historico || '', reais(i.valor)]));
    X.utils.book_append_sheet(wb, folha(abertos(rel.abertosA), [12, 18, 11, 34, 60, 13], [5], 1), 'Em aberto A');
    X.utils.book_append_sheet(wb, folha(abertos(rel.abertosB), [12, 18, 11, 34, 60, 13], [5], 1), 'Em aberto B');

    const bytes = X.write(wb, { bookType: 'xlsx', type: 'array' });
    T.baixar(new Uint8Array(bytes), nomeDoArquivo('.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    T.avisoRapido('Excel baixado: ' + nomeDoArquivo('.xlsx') + ' (pasta Downloads).', 'ok', 5000);
    app().armazenamento.registrarNoLog({ codigo: R.codigo, acao: 'terceiro-relatorio-excel', alvo: d.registro.id, detalhe: U.nomeCompetencia(R.comp) }).catch(() => {});
  }

  raiz.TelaRelatorio3 = { mostrar };
})(self);
