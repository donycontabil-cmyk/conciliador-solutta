/*
 * Conciliador Solutta — tela-passo3.js
 * Painel do Passo ③ — Fornecedores × contas a pagar (modelo aging, pedido do Dony 14/09/2026).
 * A ponte: aging do mês passado + movimento do razão do mês = a contabilidade (esperado);
 * a sobra tem que bater com o aging do mês. O que não bate aparece para conciliar à MÃO
 * (juntar fornecedores que a régua não juntou — instituição de pagamento, variação de nome).
 * Grava sozinho a cada decisão.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const M = raiz.MotorTerceiro;
  const MN = raiz.MotorNomes;
  const SEM = MN.SEM_FORNECEDOR;

  function app() { return raiz.App; }

  const SIT = {
    'bate': ['verde', 'bate'],
    'conciliada': ['azul', 'conciliada à mão'],
    'diferenca': ['vermelho', 'diferença'],
    'so-razao': ['cinza', 'só no razão (comprou e pagou no mês)'],
    'so-anterior': ['ambar', 'sumiu (só no mês passado)'],
    'so-aging': ['ambar', 'só no aging do mês'],
    'sem-fornecedor': ['vermelho', 'sem fornecedor'],
  };
  function pil(s) { const x = SIT[s] || ['cinza', s]; return '<span class="pilula ' + x[0] + '">' + T.esc(x[1]) + '</span>'; }

  let E = null;

  async function mostrar(el, codigo, anoMes, conferir) {
    const arm = app().armazenamento;
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + anoMes;
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Abrindo o Passo ③ de ' + U.nomeCompetencia(comp) + '…');

    const metas = await arm.arquivos(codigo);
    const arqs = arquivosDoTerceiro(metas, comp);
    if (conferir && !conferir()) return;
    const falta = [];
    if (!arqs.agingAnterior) falta.push('o aging (contas a pagar) de ' + U.nomeCompetencia(U.somarMeses(comp, -1)));
    if (!arqs.agingAtual) falta.push('o aging (contas a pagar) de ' + U.nomeCompetencia(comp));
    if (!arqs.razao) falta.push('o razão de fornecedores de ' + U.nomeCompetencia(comp));
    if (falta.length) {
      el.innerHTML = '<a class="voltar" href="' + voltar + '">← Fornecedores · ' + U.nomeCompetencia(comp) + '</a>' +
        '<div class="aviso ambar"><span class="icone-aviso">📄</span><div><b>Falta arquivo para o Passo ③.</b><br>Suba ' + falta.map(T.esc).join(', ') + '. ' +
        '<a href="' + voltar + '">Subir arquivos</a></div></div>';
      return;
    }
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const [aAnt, aAtu, raz] = await Promise.all([carregar(arqs.agingAnterior), carregar(arqs.agingAtual), carregar(arqs.razao)]);
    if (conferir && !conferir()) return;

    const idReg = 'F-' + codigo + '-fornecedor_pagar-' + anoMes;
    const concs = await arm.conciliacoes(codigo, comp);
    const registro = concs.find((c) => c.id === idReg) || { id: idReg, codigo, tipo: 'fornecedor_pagar', competencia: comp, situacao: 'andamento', arquivos: [], decisoes: {}, resumo: {} };
    const d = registro.decisoes || {};

    el.innerHTML = '<div class="tela-passo3"></div>';
    E = {
      el: el.firstChild, codigo, comp, emp, voltar, registro,
      arquivos: { aAnt, aAtu, raz },
      entrada: {
        competencia: comp, natureza: 'fornecedores',
        mesAnterior: U.nomeCompetencia(U.somarMeses(comp, -1)), mesAtual: U.nomeCompetencia(comp),
        contaRazao: { conta: raz.conteudo.conta, lancamentos: raz.conteudo.conta.lancamentos },
        agingAnterior: aAnt.conteudo, agingAtual: aAtu.conteudo,
      },
      decisoes: { donos: d.donos || {}, conciliadas: d.conciliadas || [], observacoes: d.observacoes || {}, conciliacoesAB: d.conciliacoesAB || [], historico: d.historico || [] },
      aba: app().lerLocal('conciliador-solutta.aba-passo3') || 'ab',
      filtros: {}, abertos: new Set(), guardadoEm: registro.atualizadoEm || null, fila: Promise.resolve(),
      incluirAnterior: app().lerLocal('conciliador-solutta.ab-anterior') !== '0',
      selA: new Set(), selB: new Set(),
    };
    calcular();
    desenharTudo();
  }

  // Escolhe os arquivos do ③: aging do mês, aging do mês passado e o razão de fornecedores.
  function arquivosDoTerceiro(metas, comp) {
    const compAnt = U.somarMeses(comp, -1);
    const maisNovo = (lista) => lista.slice().sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm))[0] || null;
    const pagar = (c) => metas.filter((m) => m.tipo === 'financeiro_pagar' && m.competencia === c);
    const razoes = (c) => metas.filter((m) => m.tipo === 'razao' && m.conta && m.conta.familia === 'fornecedores' && m.conta.papel === 'principal' && m.competencia === c);
    return { agingAnterior: maisNovo(pagar(compAnt)), agingAtual: maisNovo(pagar(comp)), razao: maisNovo(razoes(comp)) };
  }

  function calcular() {
    E.entrada.decisoes = E.decisoes;
    E.r = M.calcular(E.entrada);
    E.porChave = new Map(E.r.fornecedores.map((f) => [f.chave, f]));
  }

  function gravar(acao, detalhe) {
    E.fila = E.fila.then(async () => {
      const arm = app().armazenamento;
      const reg = Object.assign({}, E.registro, {
        situacao: 'andamento',
        arquivos: [E.arquivos.aAnt.meta.id, E.arquivos.aAtu.meta.id, E.arquivos.raz.meta.id],
        decisoes: E.decisoes, resumo: E.r.resumo,
      });
      try {
        E.registro = await arm.salvarConciliacao(reg);
        E.guardadoEm = E.registro.atualizadoEm;
        if (acao) await arm.registrarNoLog({ codigo: E.codigo, acao, alvo: E.registro.id, detalhe: detalhe || '' });
        const g = E.el.querySelector('#guardado'); if (g) g.textContent = 'guardado às ' + U.horaLocal(E.guardadoEm);
      } catch (e) { T.avisoRapido('Não foi possível gravar: ' + T.mensagemDeErro(e), 'erro'); }
    });
    return E.fila;
  }

  function historico(texto) {
    E.decisoes.historico = (E.decisoes.historico || []).concat([{ quando: U.agoraISO(), quem: app().usuario.nome, texto }]).slice(-200);
  }

  // ------------------------------------------------------------------
  function desenharTudo() {
    const r = E.r;
    E.el.innerHTML =
      '<a class="voltar" href="' + E.voltar + '">← Fornecedores · ' + U.nomeCompetencia(E.comp) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Passo ③ · Fornecedores × contas a pagar</h1>' +
      '<p class="suave">' + T.esc(E.emp.codigo + ' · ' + E.emp.nome) + ' · ' + U.nomeCompetencia(E.comp) + '</p>' +
      '<p class="suave pequeno">Conta ' + T.esc(r.conta.codigo + ' · ' + r.conta.nome) + ' · aging de ' + T.esc(E.entrada.mesAnterior) + ' e de ' + T.esc(E.entrada.mesAtual) + '</p></div>' +
      '<span class="guardado" id="guardado" title="Cada decisão é gravada na hora">' + (E.guardadoEm ? 'guardado às ' + U.horaLocal(E.guardadoEm) : 'nenhuma decisão tomada ainda') + '</span></div>' +
      desenharPonte() +
      '<div class="abas" id="abas" role="tablist"></div>' +
      '<div class="filtros" id="filtros"></div>' +
      '<div id="aba"></div>';
    desenharAbas();
    desenharAba();
    E.el.addEventListener('click', aoClicar);
    E.el.addEventListener('change', aoMudar);
    E.el.addEventListener('input', T.debounce((ev) => {
      const f = ev.target.closest('[data-filtro]'); if (!f || f.tagName !== 'INPUT') return;
      E.filtros[E.aba + '.' + f.getAttribute('data-filtro')] = f.value;
      const pos = f.selectionStart; desenharAba();
      const n = E.el.querySelector('[data-filtro="' + f.getAttribute('data-filtro') + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    }, 250));
  }

  function desenharPonte() {
    const p = E.r.ponte;
    const bate = Math.abs(p.diferenca) < 1;
    const seta = ' <span class="fraco">→</span> ';
    return '<div class="cartao corpo" style="margin-bottom:14px;border-left:4px solid var(--' + (bate ? 'verde' : 'vermelho') + ')">' +
      '<div class="ponte">' +
      pedaco('Aging ' + E.entrada.mesAnterior, p.anterior, 'o que estava em aberto no fim do mês passado') +
      ' <b>+</b> ' + pedaco('Movimento do razão', p.movimento, 'notas (' + T.moeda(p.notas) + ') menos baixas (' + T.moeda(p.baixas) + ') do mês') +
      ' <b>=</b> ' + pedaco('Esperado (contabilidade)', p.esperado, 'é o que o balancete tem que mostrar', 'forte') +
      seta + pedaco('Aging ' + E.entrada.mesAtual, p.atual, 'o que está em aberto agora') +
      '</div>' +
      '<div class="linha-flex" style="margin-top:12px;justify-content:space-between">' +
      '<div class="' + (bate ? 'ok' : 'falta') + '" style="font-size:16px;font-weight:600">' + (bate ? '✓ Fecha no centavo' : '● Diferença de ' + T.moeda(Math.abs(p.diferenca)) + ' para conciliar') + '</div>' +
      '<div class="suave pequeno">' + E.r.resumo.batem + ' batem · ' + E.r.resumo.comDiferenca + ' com diferença · ' + E.r.resumo.semFornecedor + ' linhas sem fornecedor</div>' +
      '</div></div>';
  }

  function pedaco(rotulo, valor, dica, forte) {
    return '<span class="ponte-item" title="' + T.esc(dica) + '"><span class="rotulo">' + T.esc(rotulo) + '</span>' +
      '<b class="num' + (forte ? ' forte' : '') + '">' + U.formatarCentavos(valor) + '</b></span>';
  }

  function contador(id) {
    const r = E.r;
    switch (id) {
      case 'ab': return E.decisoes.conciliacoesAB.length;
      case 'diferencas': return r.comDiferenca.length;
      case 'fornecedores': return r.fornecedores.filter((f) => f.chave !== SEM).length;
      case 'sem': return r.semFornecedor.qtd;
      case 'razao': return r.linhas.length;
      case 'agingAnt': return E.arquivos.aAnt.conteudo.titulos.length;
      case 'agingAtu': return E.arquivos.aAtu.conteudo.titulos.length;
      default: return 0;
    }
  }
  const ABAS = () => [
    { id: 'ab', titulo: 'Conciliar A × B' },
    { id: 'diferencas', titulo: 'Diferenças' },
    { id: 'fornecedores', titulo: 'Por fornecedor' },
    { id: 'sem', titulo: 'Sem fornecedor' },
    { id: 'razao', titulo: 'Razão completo' },
    { id: 'agingAnt', titulo: 'Aging ' + E.entrada.mesAnterior },
    { id: 'agingAtu', titulo: 'Aging ' + E.entrada.mesAtual },
  ];
  function desenharAbas() {
    E.el.querySelector('#abas').innerHTML = ABAS().map((a) => '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' +
      T.esc(a.titulo) + '<span class="contador">' + contador(a.id).toLocaleString('pt-BR') + '</span></button>').join('');
  }

  function filtro(nome) { return E.filtros[E.aba + '.' + nome] || ''; }
  function combina(texto, ...campos) { const q = U.normalizarNome(texto); return !q || campos.some((c) => U.normalizarNome(c).indexOf(q) >= 0); }

  function desenharFiltros(campos) {
    E.el.querySelector('#filtros').innerHTML = campos.map((c) => c.tipo === 'busca'
      ? '<input type="search" class="busca" data-filtro="' + c.nome + '" placeholder="' + T.esc(c.texto) + '" value="' + T.esc(filtro(c.nome)) + '">'
      : '<select class="filtro" data-filtro="' + c.nome + '">' + c.opcoes.map((o) => '<option value="' + o[0] + '"' + (filtro(c.nome) === o[0] ? ' selected' : '') + '>' + T.esc(o[1]) + '</option>').join('') + '</select>').join('');
  }

  function desenharAba() {
    const alvo = E.el.querySelector('#aba');
    switch (E.aba) {
      case 'ab': return abaAB(alvo);
      case 'diferencas': return abaFornecedores(alvo, true);
      case 'fornecedores': return abaFornecedores(alvo, false);
      case 'sem': return abaSem(alvo);
      case 'razao': return abaRazao(alvo);
      case 'agingAnt': return abaAging(alvo, E.arquivos.aAnt.conteudo, E.entrada.mesAnterior);
      case 'agingAtu': return abaAging(alvo, E.arquivos.aAtu.conteudo, E.entrada.mesAtual);
      default: return null;
    }
  }

  // ------------------------------------------------------------------
  // Aba "Conciliar A × B": Parte A (aging do mês passado + razão) × Parte B (aging do mês).
  // Marca item a item dos dois lados; quando o total marcado bate, vira conciliado e sai.
  // O que não for marcado fica em aberto — o da A na A, o da B na B (a diferença a investigar).
  // ------------------------------------------------------------------
  function itensAB() {
    const A = [], B = [];
    const lancs = E.arquivos.raz.conteudo.conta.lancamentos;
    if (E.incluirAnterior) {
      E.arquivos.aAnt.conteudo.titulos.forEach((t, i) => A.push({ id: 'AGA:' + i, fonte: 'aging ' + E.entrada.mesAnterior, chave: M.chaveDoTitulo(t), nome: t.nome, data: t.vencimento || '', doc: t.documento || '', valor: t.valor }));
    }
    E.r.linhas.forEach((l) => {
      const lc = lancs[l.i]; const d = E.r.porLinha.get(l.digital);
      A.push({ id: 'RAZ:' + l.digital, fonte: 'razão', chave: d.chave, nome: d.nome, data: lc.data, doc: M.documentoDoHistorico(lc.historico), historico: lc.historico, valor: lc.credito > 0 ? lc.credito : -lc.debito });
    });
    E.arquivos.aAtu.conteudo.titulos.forEach((t, i) => B.push({ id: 'AGB:' + i, fonte: 'aging ' + E.entrada.mesAtual, chave: M.chaveDoTitulo(t), nome: t.nome, data: t.vencimento || '', doc: t.documento || '', valor: t.valor }));
    return { A, B };
  }

  function abaAB(alvo) {
    const dados = itensAB();
    E.mapaItens = new Map();
    dados.A.concat(dados.B).forEach((x) => E.mapaItens.set(x.id, x));
    const conciliados = new Set();
    E.decisoes.conciliacoesAB.forEach((g) => g.ids.forEach((id) => conciliados.add(id)));
    // remove da seleção o que já não existe / já conciliado
    E.selA.forEach((id) => { if (!E.mapaItens.has(id) || conciliados.has(id)) E.selA.delete(id); });
    E.selB.forEach((id) => { if (!E.mapaItens.has(id) || conciliados.has(id)) E.selB.delete(id); });

    const busca = filtro('busca');
    const passa = (x) => combina(busca, x.nome, x.historico || '', x.doc || '');
    const abertosA = dados.A.filter((x) => !conciliados.has(x.id) && passa(x));
    const abertosB = dados.B.filter((x) => !conciliados.has(x.id) && passa(x));
    const emAbertoA = dados.A.filter((x) => !conciliados.has(x.id)).reduce((s, x) => s + x.valor, 0);
    const emAbertoB = dados.B.filter((x) => !conciliados.has(x.id)).reduce((s, x) => s + x.valor, 0);

    E.el.querySelector('#filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Filtrar por fornecedor, histórico ou documento" value="' + T.esc(busca) + '">' +
      '<label class="linha-flex" style="gap:6px"><input type="checkbox" id="ab-anterior"' + (E.incluirAnterior ? ' checked' : '') + '> <span class="pequeno">Parte A = aging ' + T.esc(E.entrada.mesAnterior) + ' + razão</span></label>' +
      '<span class="suave pequeno">(desmarque para <b>só o razão</b>)</span>';

    alvo.innerHTML =
      '<div class="grade-ab">' +
      colunaAB('A', 'Parte A · contabilidade', E.incluirAnterior ? 'aging ' + E.entrada.mesAnterior + ' + razão de ' + E.entrada.mesAtual : 'só o razão de ' + E.entrada.mesAtual, abertosA, emAbertoA) +
      colunaAB('B', 'Parte B · financeiro', 'aging ' + E.entrada.mesAtual, abertosB, emAbertoB) +
      '</div>' +
      '<div id="barra-ab"></div>' +
      conciliadosAB();
    T.tabelaPaginada(alvo.querySelector('#colA'), tabelaItens('A', abertosA));
    T.tabelaPaginada(alvo.querySelector('#colB'), tabelaItens('B', abertosB));
    atualizarBarraAB();
  }

  function colunaAB(lado, titulo, sub, itens, emAberto) {
    return '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px"><h3 style="flex:1">' + T.esc(titulo) + '</h3>' +
      '<span class="pilula ' + (lado === 'A' ? 'azul' : 'ambar') + '">em aberto ' + U.formatarCentavos(emAberto) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + T.esc(sub) + ' · ' + itens.length + ' item(ns) em aberto</p>' +
      '<div id="col' + lado + '"></div></div>';
  }

  function tabelaItens(lado, itens) {
    const sel = lado === 'A' ? E.selA : E.selB;
    return {
      alta: true, porPagina: 200,
      cabecalho: '<th class="caixa"><input type="checkbox" data-marca-todos="' + lado + '"></th><th>Fornecedor</th><th>Data</th><th>Doc</th><th>Origem</th><th class="num">Valor</th>',
      linhas: itens, vazio: 'Nada em aberto neste lado.',
      linha: (x) => '<tr class="' + (sel.has(x.id) ? 'destaque' : '') + '"><td class="caixa"><input type="checkbox" data-item="' + lado + '" data-id="' + T.esc(x.id) + '"' + (sel.has(x.id) ? ' checked' : '') + '></td>' +
        '<td class="nome">' + (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 60)) + '</span>' : '') + '</td>' +
        '<td class="num">' + T.esc(x.data || '—') + '</td><td>' + T.nome(x.doc) + '</td><td class="pequeno suave">' + T.esc(x.fonte) + '</td>' +
        '<td class="num ' + (x.valor < 0 ? 'negativo' : '') + '">' + U.formatarCentavos(x.valor) + '</td></tr>',
    };
  }

  function somaSel(sel) { let s = 0; sel.forEach((id) => { const x = E.mapaItens.get(id); if (x) s += x.valor; }); return s; }

  function atualizarBarraAB() {
    const barra = E.el.querySelector('#barra-ab'); if (!barra) return;
    const sa = somaSel(E.selA), sb = somaSel(E.selB), dif = sa - sb;
    const nSel = E.selA.size + E.selB.size;
    if (!nSel) { barra.innerHTML = '<p class="suave pequeno" style="margin:10px 0">Marque itens na Parte A e na Parte B. Quando o valor marcado dos dois lados bater, clique em <b>Conciliar</b>.</p>'; return; }
    const bate = Math.abs(dif) < 1;
    barra.innerHTML = '<div class="barra-selecao" style="position:static;transform:none;margin:12px 0;max-width:none">' +
      '<span>A: <b class="num">' + U.formatarCentavos(sa) + '</b> (' + E.selA.size + ')</span>' +
      '<span>B: <b class="num">' + U.formatarCentavos(sb) + '</b> (' + E.selB.size + ')</span>' +
      '<span class="' + (bate ? 'ok' : 'falta') + '">' + (bate ? '✓ bate' : 'diferença ' + U.formatarCentavos(dif)) + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-ab">Conciliar' + (bate ? '' : ' assim mesmo') + '</button>' +
      '<button type="button" class="botao" data-acao="limpar-ab">Limpar</button></div>';
  }

  function conciliadosAB() {
    const gs = E.decisoes.conciliacoesAB;
    if (!gs.length) return '';
    return '<h3 style="margin:18px 0 8px">Conciliados (' + gs.length + ')</h3><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th class="num">Parte A</th><th class="num">Parte B</th><th class="num">Diferença</th><th>Itens</th><th></th></tr></thead><tbody>' +
      gs.map((g, i) => '<tr><td class="pequeno">' + U.dataHoraLocal(g.quando) + '</td><td class="pequeno">' + T.esc(g.quem || '') + '</td>' +
        T.tdValor(g.valorA) + T.tdValor(g.valorB) + '<td class="num ' + (Math.abs(g.valorA - g.valorB) < 1 ? 'zero' : 'negativo') + '">' + U.formatarCentavos(g.valorA - g.valorB) + '</td>' +
        '<td class="pequeno">' + g.a.length + ' de A · ' + g.b.length + ' de B</td>' +
        '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer-ab="' + i + '">Desfazer</button></td></tr>').join('') +
      '</tbody></table></div>';
  }

  function conciliarAB() {
    const a = Array.from(E.selA), b = Array.from(E.selB);
    if (!a.length && !b.length) return;
    const valorA = somaSel(E.selA), valorB = somaSel(E.selB);
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat([{ ids: a.concat(b), a, b, valorA, valorB, quem: app().usuario.nome, quando: U.agoraISO() }]);
    E.selA = new Set(); E.selB = new Set();
    historico('Conciliou A×B: ' + a.length + ' de A e ' + b.length + ' de B (' + U.formatarCentavos(valorA) + ' × ' + U.formatarCentavos(valorB) + ')');
    desenharAba();
    gravar('terceiro-ab-conciliar', a.length + '+' + b.length + ' · ' + U.formatarCentavos(valorA));
  }

  function abaFornecedores(alvo, soDiferencas) {
    const situacoes = Array.from(new Set(E.r.fornecedores.map((f) => f.situacao)));
    desenharFiltros([
      { tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' },
      { tipo: 'select', nome: 'situacao', texto: 'Situação', opcoes: [['', 'Todas as situações']].concat(situacoes.map((s) => [s, (SIT[s] || [0, s])[1]])) },
    ]);
    const busca = filtro('busca'); const sit = filtro('situacao');
    let lista = E.r.fornecedores.filter((f) => f.chave !== SEM);
    if (soDiferencas) lista = lista.filter((f) => f.situacao !== 'bate' && f.situacao !== 'so-razao' && f.situacao !== 'conciliada');
    lista = lista.filter((f) => (!sit || f.situacao === sit) && (combina(busca, f.nome) || (U.soDigitos(busca) && f.cnpj && f.cnpj.indexOf(U.soDigitos(busca)) >= 0)));
    const explica = soDiferencas
      ? '<p class="suave pequeno" style="margin:0 0 10px">Só os fornecedores que <b>não bateram</b>. Junte à mão os que são o mesmo (✎), ou marque como conciliado (✓) quando você já conferiu.</p>'
      : '<p class="suave pequeno" style="margin:0 0 10px">Todos os fornecedores. <b>Aging ' + T.esc(E.entrada.mesAnterior) + ' + movimento = esperado</b>; a diferença é contra o aging ' + T.esc(E.entrada.mesAtual) + '.</p>';
    alvo.innerHTML = explica + '<div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th style="width:24px"></th><th>Fornecedor</th><th>CNPJ</th><th class="num">' + T.esc(E.entrada.mesAnterior) + '</th><th class="num">Notas</th><th class="num">Baixas</th><th class="num">Movim.</th><th class="num">Esperado</th><th class="num">' + T.esc(E.entrada.mesAtual) + '</th><th class="num">Diferença</th><th>Situação</th><th></th>',
      linhas: lista, porPagina: 200,
      vazio: soDiferencas ? 'Tudo batendo — nenhuma diferença. 🎉' : 'Nenhum fornecedor com estes filtros.',
      linha: (f) => {
        const aberto = E.abertos.has(f.chave);
        let h = '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir="' + T.esc(f.chave) + '">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="nome"><b>' + T.esc(f.nome) + '</b>' + (f.observacao ? '<br><span class="suave pequeno">✎ ' + T.esc(f.observacao) + '</span>' : '') + '</td>' +
          '<td class="num">' + (f.cnpj ? U.formatarCnpj(f.cnpj) : '—') + '</td>' +
          T.tdValor(f.anterior) + T.tdValor(f.notas) + T.tdValor(f.baixas) + T.tdValor(f.movimento) + T.tdValor(f.esperado) + T.tdValor(f.atual) +
          '<td class="num ' + (Math.abs(f.diferenca) < 1 ? 'zero' : 'negativo') + '"><b>' + U.formatarCentavos(f.diferenca) + '</b></td>' +
          '<td>' + pil(f.situacao) + '</td>' +
          '<td class="num" style="white-space:nowrap">' + (f.linhasRazao ? '<button type="button" class="botao pequeno leve" data-juntar="' + T.esc(f.chave) + '" title="Juntar com outro fornecedor (mesmo dono)">✎ juntar</button>' : '') +
          (f.situacao !== 'bate' ? ' <button type="button" class="botao pequeno" data-conciliar="' + T.esc(f.chave) + '">' + (f.situacao === 'conciliada' ? 'desfazer' : '✓ conciliar') + '</button>' : '') + '</td></tr>';
        if (aberto) h += '<tr class="sub"><td></td><td colspan="11">' + detalheFornecedor(f) + '</td></tr>';
        return h;
      },
    });
  }

  function detalheFornecedor(f) {
    const r = E.r;
    const rz = r.razPorChave.get(f.chave);
    const a = r.anterior.get(f.chave); const at = r.atual.get(f.chave);
    const tabTit = (titulo, g) => g && g.titulos.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>' + titulo + '</b> (' + g.titulos.length + ' · ' + T.moeda(g.valor) + ')</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Vencimento</th><th>Documento</th><th class="num">Valor</th></tr></thead><tbody>' +
      g.titulos.slice(0, 40).map((t) => '<tr><td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + T.tdValor(t.valor) + '</tr>').join('') + '</tbody></table></div>' : '';
    const tabRaz = rz && rz.linhas.length ? '<p class="pequeno" style="margin:8px 0 4px"><b>Razão do mês</b> (' + rz.linhas.length + ' lançamentos)</p>' +
      '<div class="tabela-caixa"><table class="tabela"><thead><tr><th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th class="num">Nota (créd.)</th><th class="num">Baixa (déb.)</th><th></th></tr></thead><tbody>' +
      rz.linhas.slice(0, 80).map((l) => '<tr><td class="num">' + T.esc(l.data) + '</td><td>' + T.nome(l.documento) + '</td><td class="historico">' + T.esc(l.historico) + '</td>' +
        T.tdValor(l.credito) + T.tdValor(l.debito) + '<td><button type="button" class="lapis" data-dono-linha="' + l.i + '" title="Esta linha é de outro fornecedor">✎</button></td></tr>').join('') +
      '</tbody></table></div>' + (rz.linhas.length > 80 ? '<p class="suave pequeno">… e mais ' + (rz.linhas.length - 80) + '.</p>' : '') : '<p class="suave pequeno">Sem lançamentos no razão para este fornecedor.</p>';
    return tabRaz + tabTit('Aging ' + E.entrada.mesAnterior, a) + tabTit('Aging ' + E.entrada.mesAtual, at);
  }

  function abaSem(alvo) {
    const linhas = E.r.semFornecedor.linhas.map((i) => E.r.linhas[i]);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">' + linhas.length + ' linha(s) do razão que o programa não conseguiu dizer de quem são. Clique no ✎ para dar o fornecedor.</p><div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th class="num">Nota</th><th class="num">Baixa</th><th></th>',
      linhas, vazio: 'Nenhuma linha sem fornecedor. 👍',
      linha: (l) => { const lc = E.arquivos.raz.conteudo.conta.lancamentos[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDoHistorico(lc.historico)) + '</td>' +
        '<td class="historico">' + T.esc(lc.historico) + '</td>' + T.tdValor(lc.credito) + T.tdValor(lc.debito) +
        '<td><button type="button" class="botao pequeno" data-dono-linha="' + l.i + '">✎ dar fornecedor</button></td></tr>'; },
    });
  }

  function abaRazao(alvo) {
    desenharFiltros([{ tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor, histórico ou documento' }]);
    const busca = filtro('busca');
    const lancs = E.arquivos.raz.conteudo.conta.lancamentos;
    const lista = E.r.linhas.filter((l) => { const d = E.r.porLinha.get(l.digital); return combina(busca, d.nome, l.historico) || (busca && M.documentoDoHistorico(l.historico).indexOf(busca) >= 0); });
    alvo.innerHTML = '<div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th>Fornecedor</th><th class="num">Nota</th><th class="num">Baixa</th><th></th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhuma linha.',
      linha: (l) => { const d = E.r.porLinha.get(l.digital); const lc = lancs[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDoHistorico(lc.historico)) + '</td>' +
        '<td class="historico">' + T.esc(lc.historico) + '</td><td class="nome">' + (d.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(d.nome)) +
        ' <button type="button" class="lapis" data-dono-linha="' + l.i + '">✎</button></td>' + T.tdValor(lc.credito) + T.tdValor(lc.debito) + '<td></td></tr>'; },
    });
  }

  function abaAging(alvo, conteudo, mes) {
    desenharFiltros([{ tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor ou CNPJ' }]);
    const busca = filtro('busca');
    const lista = conteudo.titulos.filter((t) => combina(busca, t.nome) || (U.soDigitos(busca) && t.cnpj && t.cnpj.indexOf(U.soDigitos(busca)) >= 0));
    const total = lista.reduce((s, t) => s + t.valor, 0);
    alvo.innerHTML = '<p class="suave pequeno" style="margin:0 0 8px">Aging de ' + T.esc(mes) + ': ' + lista.length + ' título(s) em aberto · ' + T.moeda(total) + '.</p><div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Fornecedor</th><th>CNPJ</th><th>Vencimento</th><th>Documento</th><th class="num">Valor</th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhum título.',
      linha: (t) => '<tr><td class="nome">' + T.esc(t.nome) + '</td><td class="num">' + (t.cnpj ? U.formatarCnpj(t.cnpj) : '—') + '</td>' +
        '<td class="num">' + T.esc(t.vencimento || '—') + '</td><td>' + T.nome(t.documento) + '</td>' + T.tdValor(t.valor) + '</tr>',
    });
  }

  // ------------------------------------------------------------------
  function recalcularEDesenhar() {
    calcular();
    E.el.querySelector('.cartao.corpo').outerHTML = ''; // remove ponte antiga
    // redesenha ponte no lugar
    const abas = E.el.querySelector('#abas');
    abas.insertAdjacentHTML('beforebegin', desenharPonte());
    desenharAbas();
    redesenhaMantendo();
  }
  function redesenhaMantendo() {
    const caixa = E.el.querySelector('#aba .tabela-caixa'); const topo = caixa ? caixa.scrollTop : 0;
    const pagina = E.el.closest('.conteudo'); const tp = pagina ? pagina.scrollTop : 0;
    desenharAba();
    const nova = E.el.querySelector('#aba .tabela-caixa'); if (nova) nova.scrollTop = topo;
    if (pagina) pagina.scrollTop = tp;
  }

  async function aoClicar(ev) {
    const aba = ev.target.closest('[data-aba]');
    if (aba) { E.aba = aba.getAttribute('data-aba'); app().gravarLocal('conciliador-solutta.aba-passo3', E.aba); desenharAbas(); desenharAba(); return; }
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { const k = abrir.getAttribute('data-abrir'); if (E.abertos.has(k)) E.abertos.delete(k); else E.abertos.add(k); redesenhaMantendo(); return; }
    const conciliar = ev.target.closest('[data-conciliar]');
    if (conciliar) {
      const k = conciliar.getAttribute('data-conciliar');
      const set = new Set(E.decisoes.conciliadas);
      if (set.has(k)) set.delete(k); else set.add(k);
      E.decisoes.conciliadas = Array.from(set);
      historico((set.has(k) ? 'Conciliou à mão ' : 'Desfez conciliação ') + k);
      recalcularEDesenhar();
      gravar('terceiro-conciliar', k);
      return;
    }
    const juntar = ev.target.closest('[data-juntar]');
    if (juntar) { await juntarFornecedor(juntar.getAttribute('data-juntar')); return; }
    const donoLinha = ev.target.closest('[data-dono-linha]');
    if (donoLinha) { await trocarDonoLinha(Number(donoLinha.getAttribute('data-dono-linha'))); return; }
    const acao = ev.target.closest('[data-acao]');
    if (acao) {
      const a = acao.getAttribute('data-acao');
      if (a === 'conciliar-ab') conciliarAB();
      else if (a === 'limpar-ab') { E.selA = new Set(); E.selB = new Set(); desenharAba(); }
      return;
    }
    const desab = ev.target.closest('[data-desfazer-ab]');
    if (desab) {
      const i = Number(desab.getAttribute('data-desfazer-ab'));
      E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g, k) => k !== i);
      historico('Desfez uma conciliação A×B');
      desenharAba();
      gravar('terceiro-ab-desfazer', '');
      return;
    }
  }
  function aoMudar(ev) {
    const sel = ev.target.closest('select[data-filtro]');
    if (sel) { E.filtros[E.aba + '.' + sel.getAttribute('data-filtro')] = sel.value; desenharAba(); return; }
    const antc = ev.target.closest('#ab-anterior');
    if (antc) { E.incluirAnterior = antc.checked; app().gravarLocal('conciliador-solutta.ab-anterior', antc.checked ? '1' : '0'); desenharAba(); return; }
    const item = ev.target.closest('[data-item]');
    if (item) {
      const lado = item.getAttribute('data-item'); const id = item.getAttribute('data-id');
      const set = lado === 'A' ? E.selA : E.selB;
      if (item.checked) set.add(id); else set.delete(id);
      const tr = item.closest('tr'); if (tr) tr.classList.toggle('destaque', item.checked);
      atualizarBarraAB();
      return;
    }
    const todos = ev.target.closest('[data-marca-todos]');
    if (todos) {
      const lado = todos.getAttribute('data-marca-todos'); const set = lado === 'A' ? E.selA : E.selB;
      E.el.querySelectorAll('#col' + lado + ' [data-item]').forEach((c) => {
        c.checked = todos.checked; const id = c.getAttribute('data-id');
        if (todos.checked) set.add(id); else set.delete(id);
        c.closest('tr').classList.toggle('destaque', todos.checked);
      });
      atualizarBarraAB();
    }
  }

  // Juntar um fornecedor inteiro (todas as suas linhas do razão) com outro (o mesmo dono).
  async function juntarFornecedor(chave) {
    const f = E.porChave.get(chave);
    const escolha = await janelaDono('Juntar "' + f.nome + '" com outro fornecedor',
      'As linhas do razão de <b>' + T.esc(f.nome) + '</b> passam a ser do fornecedor que você escolher (útil quando a nota entra num nome e a baixa em outro).');
    if (!escolha) return;
    const rz = E.r.razPorChave.get(chave);
    (rz ? rz.linhas : []).forEach((l) => { E.decisoes.donos[E.r.linhas[l.i].digital] = { chave: escolha.chave, nome: escolha.nome }; });
    historico('Juntou "' + f.nome + '" em "' + escolha.nome + '"');
    recalcularEDesenhar();
    T.avisoRapido('Juntado em ' + escolha.nome, 'ok');
    gravar('terceiro-juntar', f.nome + ' -> ' + escolha.nome);
  }

  async function trocarDonoLinha(i) {
    const linha = E.r.linhas.find((l) => l.i === i); if (!linha) return;
    const lc = E.arquivos.raz.conteudo.conta.lancamentos[i];
    const escolha = await janelaDono('Fornecedor desta linha',
      '<span class="pequeno suave">' + T.esc(lc.data) + ' · ' + T.esc(lc.historico) + '</span>');
    if (!escolha) return;
    E.decisoes.donos[linha.digital] = { chave: escolha.chave, nome: escolha.nome };
    historico('Trocou dono de uma linha para ' + escolha.nome);
    recalcularEDesenhar();
    gravar('terceiro-dono-linha', escolha.nome);
  }

  function janelaDono(titulo, subtitulo) {
    let escolha = null;
    return T.janela({
      titulo,
      corpo: (subtitulo ? '<p style="margin-bottom:10px">' + subtitulo + '</p>' : '') +
        '<div class="campo"><label for="nd">Fornecedor (nome ou CNPJ)</label><input id="nd" autofocus autocomplete="off" placeholder="Digite para ver os parecidos"></div>' +
        '<div id="diz" class="pequeno" style="margin-top:6px;min-height:18px"></div><div class="sugestoes-dono" id="sg"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Aplicar', tipo: 'primario', antes: (j) => { const t = j.querySelector('#nd').value.trim(); if (!t) return false; return escolha || MN.sugerirDono(t, E.r.listaFornecedores); } }],
      aoAbrir: (j) => {
        const input = j.querySelector('#nd'); const diz = j.querySelector('#diz'); const sg = j.querySelector('#sg');
        const atualizar = () => {
          escolha = null;
          const s = MN.sugerirDono(input.value, E.r.listaFornecedores);
          if (s.tipo === 'vazio') { diz.innerHTML = ''; sg.innerHTML = ''; return; }
          diz.innerHTML = s.tipo === 'novo' ? '<span style="color:var(--ambar)">Vai criar novo: <b>' + T.esc(s.nome) + '</b></span>' : '<span class="ok">Vai vincular a <b>' + T.esc(s.nome) + '</b> (' + T.esc(s.motivo) + ')</span>';
          sg.innerHTML = s.sugestoes.map((x) => '<button type="button" data-chave="' + T.esc(x.chave) + '">' + T.esc(x.nome) + (x.cnpj ? ' <span class="suave pequeno">' + U.formatarCnpj(x.cnpj) + '</span>' : '') + ' <span class="suave pequeno">· ' + x.linhas + '</span></button>').join('');
        };
        input.addEventListener('input', atualizar);
        sg.addEventListener('click', (e) => { const b = e.target.closest('[data-chave]'); if (!b) return; const x = E.r.listaFornecedores[b.getAttribute('data-chave')]; input.value = x.nome; escolha = { chave: x.chave, nome: x.nome }; diz.innerHTML = '<span class="ok">Vai vincular a <b>' + T.esc(x.nome) + '</b></span>'; });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') j.querySelector('footer .primario').click(); });
      },
    });
  }

  raiz.TelaPasso3 = { mostrar, arquivosDoTerceiro, estado: () => E };
})(self);
