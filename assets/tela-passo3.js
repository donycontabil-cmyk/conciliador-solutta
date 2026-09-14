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
      selA: new Set(), selB: new Set(), abertosAB: new Set(), idDoItem: new Map(),
    };
    if (E.aba !== 'ab' && abasOcultas().has(E.aba)) E.aba = 'ab';
    calcular();
    const arrumou = arrumarConciliacoes();
    desenharTudo();
    if (arrumou) gravar(null);
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
    E.itens = M.itensAB(E.entrada, E.r);
  }

  function resumoParaGravar() {
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    return Object.assign({}, E.r.resumo, {
      conciliacoesAB: E.decisoes.conciliacoesAB.length,
      abertosA: ab.abertosA.length, abertosB: ab.abertosB.length, diferencaAB: ab.valorA - ab.valorB,
    });
  }

  function gravar(acao, detalhe) {
    E.fila = E.fila.then(async () => {
      const arm = app().armazenamento;
      const reg = Object.assign({}, E.registro, {
        situacao: 'andamento',
        arquivos: [E.arquivos.aAnt.meta.id, E.arquivos.aAtu.meta.id, E.arquivos.raz.meta.id],
        decisoes: E.decisoes, resumo: resumoParaGravar(),
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
      // A contagem por fornecedor só aparece se alguma aba por fornecedor estiver à vista.
      (['diferencas', 'fornecedores', 'sem'].some((id) => !abasOcultas().has(id))
        ? '<div class="suave pequeno">' + E.r.resumo.batem + ' batem · ' + E.r.resumo.comDiferenca + ' com diferença · ' + E.r.resumo.semFornecedor + ' linhas sem fornecedor</div>' : '') +
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
  // Abas ocultas nesta empresa (Dony, 14/09/2026: "não eliminar, deixar ocultos"). Guardadas no
  // cadastro da empresa: { passo3: [...] }. "Conciliar A × B" sempre aparece.
  function abasOcultas() { return new Set(((E.emp && E.emp.abasOcultas) || {}).passo3 || []); }

  function desenharAbas() {
    const ocultas = abasOcultas();
    E.el.querySelector('#abas').innerHTML = ABAS().filter((a) => a.id === 'ab' || !ocultas.has(a.id)).map((a) =>
      '<button type="button" role="tab" data-aba="' + a.id + '" class="' + (E.aba === a.id ? 'ativa' : '') + '">' +
      T.esc(a.titulo) + '<span class="contador">' + contador(a.id).toLocaleString('pt-BR') + '</span></button>').join('') +
      '<button type="button" class="abas-config" data-acao="config-abas" title="Escolher quais abas aparecem nesta empresa">⚙ ' +
      (ocultas.size ? ocultas.size + ' aba(s) oculta(s)' : 'Abas') + '</button>';
  }

  async function configurarAbas() {
    const ocultas = abasOcultas();
    const escolha = await T.janela({
      titulo: 'Abas do Passo ③ nesta empresa',
      corpo: '<p class="suave" style="margin-bottom:8px;line-height:1.5">Desmarque as abas que esta empresa não usa. Elas ficam <b>ocultas</b> (nada é apagado) e voltam quando você marcar de novo.</p>' +
        '<label class="item-aba"><input type="checkbox" checked disabled> <b>Conciliar A × B</b> <span class="suave pequeno">sempre aparece</span></label>' +
        ABAS().filter((a) => a.id !== 'ab').map((a) => '<label class="item-aba"><input type="checkbox" data-aba-visivel="' + a.id + '"' + (ocultas.has(a.id) ? '' : ' checked') + '> ' + T.esc(a.titulo) + '</label>').join(''),
      botoes: [{ texto: 'Cancelar', valor: null },
        { texto: 'Guardar', tipo: 'primario', antes: (j) => Array.from(j.querySelectorAll('[data-aba-visivel]')).filter((c) => !c.checked).map((c) => c.getAttribute('data-aba-visivel')) }],
    });
    if (!Array.isArray(escolha)) return;
    const arm = app().armazenamento;
    try {
      // Reler antes de gravar: outra pessoa pode ter mexido no cadastro.
      const emp = (await arm.empresas()).find((e) => String(e.codigo) === String(E.codigo));
      const todas = Object.assign({}, emp.abasOcultas || {}, { passo3: escolha });
      const salvo = await arm.salvarEmpresa(Object.assign({}, emp, { abasOcultas: todas }));
      E.emp = salvo;
      const i = app().empresas.findIndex((e) => String(e.codigo) === String(E.codigo));
      if (i >= 0) app().empresas[i] = salvo;
      await arm.registrarNoLog({ codigo: E.codigo, acao: 'abas-ocultas', alvo: 'passo3', detalhe: escolha.join(', ') || '(nenhuma)' });
      if (escolha.indexOf(E.aba) >= 0) { E.aba = 'ab'; app().gravarLocal('conciliador-solutta.aba-passo3', 'ab'); }
      E.el.querySelector('.cartao.corpo').outerHTML = '';
      E.el.querySelector('#abas').insertAdjacentHTML('beforebegin', desenharPonte());
      desenharAbas();
      desenharAba();
      T.avisoRapido(escolha.length ? escolha.length + ' aba(s) oculta(s) nesta empresa.' : 'Todas as abas à vista.', 'ok');
    } catch (e) {
      T.avisoRapido(T.mensagemDeErro(e), 'erro');
    }
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
  // ⚡ Conciliar acha tudo pelo DOCUMENTO (MotorTerceiro.conciliarAutomatico) e marca cada
  // conciliação com um ID sequencial (1, 2, 3…): A×A quando se mata dentro da A, A×B quando
  // casa com a B (pedido do Dony, 14/09/2026). O que sobrar dá para marcar à mão — também
  // ganha o próximo ID. O que não concilia fica em aberto: o da A na A, o da B na B.
  // ------------------------------------------------------------------
  const TIPO_AB = { AxA: 'A×A', AxB: 'A×B', BxB: 'B×B' };
  const COMO_AB = { 'doc-fornecedor-par': 'doc + fornecedor · par', 'doc-fornecedor': 'doc + fornecedor', 'doc-par': 'só doc · par', 'doc': 'só doc', 'manual': 'à mão' };

  function rotuloFonte(x) {
    if (x.fonte === 'anterior') return 'aging ' + E.entrada.mesAnterior;
    if (x.fonte === 'atual') return 'aging ' + E.entrada.mesAtual;
    return x.fonte === 'nota' ? 'razão · nota' : 'razão · baixa';
  }
  // Na tabela estreita de cada parte: "aging jun/26", "nota", "baixa".
  function rotuloCurto(x) {
    const curto = (mes) => String(mes).slice(0, 3) + '/' + String(mes).slice(-2);
    if (x.fonte === 'anterior') return 'aging ' + curto(E.entrada.mesAnterior);
    if (x.fonte === 'atual') return 'aging ' + curto(E.entrada.mesAtual);
    return x.fonte;
  }

  // Conciliações da versão 5: ids antigos viram os de agora; sem ID ganha o próximo número.
  function arrumarConciliacoes() {
    const traduz = (id) => E.itens.legado.get(id) || id;
    let proximo = M.proximoIdAB(E.decisoes.conciliacoesAB);
    let mudou = false;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.map((g) => {
      const a = (g.a || []).map(traduz), b = (g.b || []).map(traduz);
      const n = Object.assign({}, g, { a, b });
      if (n.ids) { delete n.ids; mudou = true; }
      if (!n.id) { n.id = proximo++; mudou = true; }
      if (!n.tipo) { n.tipo = M.tipoAB(a.length, b.length); mudou = true; }
      if (!n.regra) { n.regra = 'manual'; mudou = true; }
      if (a.some((id, i) => id !== g.a[i]) || b.some((id, i) => id !== g.b[i])) mudou = true;
      return n;
    });
    return mudou;
  }

  // Documento primeiro (sem documento no fim), depois fornecedor e data: o que casa fica perto.
  function ordemDoc(x, y) {
    if (!x.doc !== !y.doc) return x.doc ? -1 : 1;
    return x.doc.length - y.doc.length || (x.doc < y.doc ? -1 : x.doc > y.doc ? 1 : 0) ||
      (x.nome < y.nome ? -1 : x.nome > y.nome ? 1 : 0) || x.ordem - y.ordem;
  }

  // Filtros de valor e de data (Dony, 14/09/2026: "filtrar por valor, por data, por fornecedor
  // ou por documento, tanto na parte A quanto na parte B").
  // Valor: "1.236,55" acha esse valor com ou sem sinal; um pedaço ("1.236") acha quem contém;
  // faixa "100 a 500" (sem sinal).
  function filtroValor(texto) {
    const t = String(texto || '').replace(/R\$\s*/i, '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    if (faixa.length === 2) {
      const de = U.paraNumero(faixa[0]), ate = U.paraNumero(faixa[1]);
      if (de !== null && ate !== null) {
        const min = U.centavos(Math.min(Math.abs(de), Math.abs(ate))), max = U.centavos(Math.max(Math.abs(de), Math.abs(ate)));
        return (x) => Math.abs(x.valor) >= min && Math.abs(x.valor) <= max;
      }
    }
    const pedaco = t.replace(/^[-+]\s*/, '').replace(/\s+/g, '');
    const semPonto = pedaco.replace(/\./g, '');
    return (x) => {
      const f = U.formatarCentavos(Math.abs(x.valor));
      return f.indexOf(pedaco) >= 0 || f.replace(/\./g, '').indexOf(semPonto) >= 0;
    };
  }
  // Data (vencimento no aging, data do lançamento no razão): "08/07/2026", um pedaço
  // ("07/2026") ou faixa "01/07/2026 a 15/07/2026" (sem o ano, vale o da competência).
  function filtroData(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    const faixa = t.split(/\s+(?:a|até|ate)\s+/i);
    if (faixa.length === 2) {
      const numero = (s) => { s = s.trim(); if (/^\d{1,2}\/\d{1,2}$/.test(s)) s += '/' + E.comp.slice(0, 4); const d = U.lerData(s); return d ? d.numero : null; };
      const de = numero(faixa[0]), ate = numero(faixa[1]);
      if (de !== null && ate !== null) {
        return (x) => { const d = U.lerData(x.data); return !!d && d.numero >= Math.min(de, ate) && d.numero <= Math.max(de, ate); };
      }
    }
    return (x) => String(x.data || '').indexOf(t) >= 0;
  }

  // Filtros de UMA parte (cada lado tem os seus: o nome muda de um lado para o outro).
  // Mais de um de uma vez (Dony, 14/09/2026: a perninha que falta pode estar em OUTRO
  // fornecedor — "selecionei um fornecedor e a outra perninha está em outro"): fornecedor e
  // documento separados por vírgula ("POSTO CENTRAL, SILVA"); valor e data por ponto e vírgula
  // (a vírgula já é a dos centavos).
  const CAMPOS_LADO = ['doc', 'forn', 'valor', 'data'];
  function termos(texto, separador) { return String(texto || '').split(separador).map((s) => s.trim()).filter(Boolean); }
  function filtroDoLado(lado) {
    const docTexto = termos(filtro(lado + '.doc'), /[,;]/);
    const docs = docTexto.map((d) => M.normalizarDocumento(d)).filter(Boolean);
    const forns = termos(filtro(lado + '.forn'), /[,;]/);
    const valores = termos(filtro(lado + '.valor'), /;/).map(filtroValor).filter(Boolean);
    const datas = termos(filtro(lado + '.data'), /;/).map(filtroData).filter(Boolean);
    return (x) => (!docTexto.length || docs.some((d) => x.doc.indexOf(d) >= 0)) &&
      (!forns.length || forns.some((f) => combina(f, x.nome, x.historico || ''))) &&
      (!valores.length || valores.some((f) => f(x))) && (!datas.length || datas.some((f) => f(x)));
  }
  function filtrosDoLadoHtml(lado) {
    const campo = (nome, texto, dica) => {
      const v = filtro(lado + '.' + nome);
      return '<input type="search" data-filtro="' + lado + '.' + nome + '" class="' + (v ? 'ativo' : '') + '" placeholder="' + texto + '" title="' + T.esc(dica) + '" value="' + T.esc(v) + '">';
    };
    const algum = CAMPOS_LADO.some((n) => filtro(lado + '.' + n));
    return '<div class="filtros-lado">' +
      campo('doc', 'Documento', 'Número do documento, ou parte dele. Mais de um: 107, 207') +
      campo('forn', 'Fornecedor', 'Nome do fornecedor, ou pedaço do histórico. Mais de um: POSTO CENTRAL, SILVA') +
      campo('valor', 'Valor', 'Valor (1.236,55), parte dele, ou faixa: 100 a 500 — com ou sem sinal. Mais de um: 791,43; 5.105,88') +
      campo('data', 'Data', 'Data (08/07/2026), parte dela (07/2026), ou faixa: 01/07 a 15/07. Mais de uma: 08/07; 22/07') +
      '<button type="button" class="lapis" data-limpar-lado="' + lado + '" title="Limpar os filtros desta parte"' + (algum ? '' : ' disabled') + '>✕</button>' +
      '</div>' +
      (algum ? '<p class="dica-lado">Mais de um fornecedor ou documento: separe com vírgula (<b>POSTO CENTRAL, SILVA</b>). Os itens marcados ficam no topo, mesmo fora do filtro.</p>' : '');
  }

  // Busca de cima (vale para os dois lados e para a lista): "#12" = a conciliação 12;
  // valor ("791,43"); data ("08/07/2026"); número = documento; texto = fornecedor ou histórico.
  function buscaAB(busca) {
    const q = String(busca || '').trim();
    if (!q) return { item: () => true, grupo: () => true };
    const mId = q.match(/^#\s*(\d+)$/);
    if (mId) {
      const n = Number(mId[1]);
      return { item: (x) => { const g = E.idDoItem.get(x.id); return !!g && g.id === n; }, grupo: (g) => g.id === n };
    }
    let item;
    if (/^[-+]?\s*(R\$\s*)?\d[\d.]*,\d{1,2}$/i.test(q) || /^\d[\d.]*(,\d{1,2})?\s+(a|até|ate)\s+\d[\d.]*(,\d{1,2})?$/i.test(q)) item = filtroValor(q);
    else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(q)) item = filtroData(q);
    else if (/^[\d.\-\/ ]+$/.test(q)) { const dig = M.normalizarDocumento(q); item = (x) => !!dig && x.doc.indexOf(dig) >= 0; }
    else item = (x) => combina(q, x.nome, x.historico || '');
    return { item, grupo: (g) => g.a.concat(g.b).some((id) => { const x = E.itens.porId.get(id); return x && item(x); }) };
  }

  function abaAB(alvo) {
    const it = E.itens;
    const grupos = E.decisoes.conciliacoesAB;
    E.idDoItem = new Map();
    grupos.forEach((g) => g.a.concat(g.b).forEach((id) => E.idDoItem.set(id, g)));
    E.selA.forEach((id) => { if (!it.porId.has(id) || E.idDoItem.has(id)) E.selA.delete(id); });
    E.selB.forEach((id) => { if (!it.porId.has(id) || E.idDoItem.has(id)) E.selB.delete(id); });

    const ab = M.emAbertoAB(it, grupos);
    const busca = filtro('busca');
    const mostrar = filtro('mostrar');            // '' = em aberto · 'conciliados' · 'todos'
    const b = buscaAB(busca);
    const naLista = (x) => (mostrar === 'todos' || (mostrar === 'conciliados' ? E.idDoItem.has(x.id) : !E.idDoItem.has(x.id))) && b.item(x);
    const doLadoA = filtroDoLado('A'), doLadoB = filtroDoLado('B');
    const passaA = (x) => (E.incluirAnterior || x.fonte !== 'anterior') && naLista(x) && doLadoA(x);
    const passaB = (x) => naLista(x) && doLadoB(x);
    const filtradosA = it.A.filter(passaA).sort(ordemDoc);
    const filtradosB = it.B.filter(passaB).sort(ordemDoc);
    // O que está marcado fica no topo mesmo fora do filtro: marca as perninhas de um
    // fornecedor, troca o filtro para o outro, e as de antes continuam à vista.
    const fixosA = it.A.filter((x) => E.selA.has(x.id) && !passaA(x)).sort(ordemDoc);
    const fixosB = it.B.filter((x) => E.selB.has(x.id) && !passaB(x)).sort(ordemDoc);
    const listaA = fixosA.concat(filtradosA);
    const listaB = fixosB.concat(filtradosB);
    E.listaA = listaA; E.listaB = listaB;
    E.fixos = new Set(fixosA.concat(fixosB).map((x) => x.id));

    E.el.querySelector('#filtros').innerHTML =
      '<input type="search" class="busca" data-filtro="busca" placeholder="Busca nos dois lados: documento, fornecedor, valor, data ou #ID" title="Vale para a Parte A, a Parte B e a lista de conciliações. Cada parte tem também os seus filtros." value="' + T.esc(busca) + '">' +
      '<select class="filtro" data-filtro="mostrar">' + [['', 'Em aberto'], ['conciliados', 'Conciliados'], ['todos', 'Todos']].map((o) =>
        '<option value="' + o[0] + '"' + (mostrar === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="linha-flex" style="gap:6px"><input type="checkbox" id="ab-anterior"' + (E.incluirAnterior ? ' checked' : '') + '> <span class="pequeno">Parte A = aging ' + T.esc(E.entrada.mesAnterior) + ' + razão</span></label>' +
      '<span class="suave pequeno">(desmarque para <b>só o razão</b>)</span>';

    const rot = mostrar === 'todos' ? 'item(ns)' : (mostrar === 'conciliados' ? 'conciliado(s)' : 'em aberto');
    alvo.innerHTML = resumoAB(ab, grupos) +
      '<div class="grade-ab">' +
      colunaAB('A', 'Parte A · contabilidade', E.incluirAnterior ? 'aging ' + E.entrada.mesAnterior + ' + razão de ' + E.entrada.mesAtual : 'só o razão de ' + E.entrada.mesAtual, filtradosA, fixosA, rot) +
      colunaAB('B', 'Parte B · financeiro', 'aging ' + E.entrada.mesAtual, filtradosB, fixosB, rot) +
      '</div>' +
      '<div id="barra-ab"></div>' +
      '<div id="lista-ab"></div>';
    T.tabelaPaginada(alvo.querySelector('#colA'), tabelaItens('A', listaA));
    T.tabelaPaginada(alvo.querySelector('#colB'), tabelaItens('B', listaB));
    atualizarBarraAB();
    desenharListaAB(alvo.querySelector('#lista-ab'), b);
  }

  function resumoAB(ab, grupos) {
    const conta = (tipo) => grupos.filter((g) => g.tipo === tipo).length;
    const aMao = grupos.filter((g) => g.regra === 'manual').length;
    const auto = grupos.length - aMao;
    const dif = ab.valorA - ab.valorB;
    // Conciliação à mão "assim mesmo" (sem bater) tira valores diferentes dos dois lados.
    const forcado = grupos.reduce((s, g) => s + (g.valorA - g.valorB), 0);
    const conferir = grupos.filter((g) => g.aviso === 'baixa-antes-da-nota');
    return '<div class="cartao corpo" style="margin-bottom:12px">' +
      '<div class="linha-flex" style="justify-content:space-between;align-items:flex-start;gap:14px">' +
      '<div class="ponte">' +
      pedaco('Em aberto · Parte A', ab.valorA, ab.abertosA.length + ' item(ns) em aberto na contabilidade') +
      ' <b>−</b> ' + pedaco('Em aberto · Parte B', ab.valorB, ab.abertosB.length + ' item(ns) em aberto no financeiro') +
      ' <b>=</b> ' + pedaco('Diferença a investigar', dif, 'o que sobra em aberto', 'forte') +
      '</div>' +
      '<div class="linha-flex">' +
      '<button type="button" class="botao primario" data-acao="conciliar-tudo" title="Acha tudo o que casa pelo documento e marca cada conciliação com um ID">⚡ Conciliar</button>' +
      (auto ? '<button type="button" class="botao pequeno perigo" data-acao="desfazer-automaticas">Desfazer as automáticas</button>' : '') +
      '</div></div>' +
      '<p class="suave pequeno" style="margin:10px 0 0">' +
      (grupos.length ? '<b>' + grupos.length.toLocaleString('pt-BR') + '</b> conciliação(ões) com ID: ' + conta('AxA') + ' A×A · ' + conta('AxB') + ' A×B' + (conta('BxB') ? ' · ' + conta('BxB') + ' B×B' : '') + ' · ' + aMao + ' à mão · em aberto: <b>' + ab.abertosA.length + '</b> na A e <b>' + ab.abertosB.length + '</b> na B. ' : 'Nada conciliado ainda. ') +
      'O <b>⚡ Conciliar</b> casa pelo <b>documento</b> — primeiro com o mesmo fornecedor, depois só pelo documento — e dá um ID para cada conciliação (1, 2, 3…).' +
      (Math.abs(forcado) >= 1 ? ' <span class="falta">Conciliações à mão sem bater: ' + U.formatarCentavos(forcado) + '.</span>' : '') +
      (conferir.length ? '<br><span style="color:var(--ambar)">⚠ Para conferir — baixa com data antes da nota:</span> ' +
        conferir.slice(0, 15).map((g) => '<button type="button" class="lapis" data-ver-id="' + g.id + '" title="Ver a conciliação #' + g.id + '"><b>#' + g.id + '</b></button>').join(' ') + (conferir.length > 15 ? ' …' : '') : '') +
      '</p></div>';
  }

  function colunaAB(lado, titulo, sub, itens, fixos, rot) {
    const total = itens.reduce((s, x) => s + x.valor, 0);
    const filtrado = CAMPOS_LADO.some((n) => filtro(lado + '.' + n));
    return '<div class="cartao corpo coluna-ab"><div class="linha-flex" style="margin-bottom:6px"><h3 style="flex:1">' + T.esc(titulo) + '</h3>' +
      '<span class="pilula ' + (lado === 'A' ? 'azul' : 'ambar') + '" title="Soma da lista (sem os marcados de fora do filtro)">' + U.formatarCentavos(total) + '</span></div>' +
      '<p class="suave pequeno" style="margin:0 0 8px">' + T.esc(sub) + ' · ' + itens.length.toLocaleString('pt-BR') + ' ' + rot + (filtrado ? ' <b>(filtrado)</b>' : '') +
      (fixos.length ? ' · <b>+' + fixos.length + ' marcado(s)</b> de fora do filtro, no topo' : '') + '</p>' +
      filtrosDoLadoHtml(lado) +
      '<div id="col' + lado + '"></div></div>';
  }

  function tabelaItens(lado, itens) {
    const sel = lado === 'A' ? E.selA : E.selB;
    return {
      alta: true, porPagina: 200,
      cabecalho: '<th class="caixa"><input type="checkbox" data-marca-todos="' + lado + '" title="Marcar todos os em aberto desta lista (com os filtros de agora)"></th><th>Documento</th><th>Fornecedor</th><th>Data · origem</th><th class="num">Valor</th><th>ID</th>',
      linhas: itens, vazio: 'Nada nesta lista.',
      linha: (x) => {
        const g = E.idDoItem.get(x.id);
        const marcado = sel.has(x.id);
        const fixo = E.fixos && E.fixos.has(x.id);
        return '<tr class="' + (marcado ? 'destaque' : '') + (fixo ? ' fixo' : '') + '"><td class="caixa">' + (g ? '' : '<input type="checkbox" data-item="' + lado + '" data-id="' + T.esc(x.id) + '"' + (marcado ? ' checked' : '') + '>') + '</td>' +
          '<td class="num"><b>' + T.nome(x.doc) + '</b></td>' +
          '<td class="nome">' + (fixo ? '<span class="selo suspeita" title="Marcado antes, com outro filtro">marcado</span> ' : '') +
          (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico.slice(0, 70)) + '</span>' : '') + '</td>' +
          '<td class="num" title="' + T.esc(rotuloFonte(x)) + '">' + T.esc(x.data || '—') + '<br><span class="pequeno suave">' + T.esc(rotuloCurto(x)) + '</span></td>' +
          '<td class="num ' + (x.valor < 0 ? 'negativo' : '') + '">' + U.formatarCentavos(x.valor) + '</td>' +
          '<td style="white-space:nowrap">' + (g ? '<button type="button" class="lapis" data-ver-id="' + g.id + '" title="Ver a conciliação #' + g.id + ' (' + T.esc(M.REGRAS_AB[g.regra] || '') + ')"><b>#' + g.id + '</b></button><br><span class="selo opcional">' + TIPO_AB[g.tipo] + '</span>' : '') + '</td></tr>';
      },
    };
  }

  function somaSel(sel) { let s = 0; sel.forEach((id) => { const x = E.itens.porId.get(id); if (x) s += x.valor; }); return s; }

  function atualizarBarraAB() {
    const barra = E.el.querySelector('#barra-ab'); if (!barra) return;
    const sa = somaSel(E.selA), sb = somaSel(E.selB), dif = sa - sb;
    const nSel = E.selA.size + E.selB.size;
    if (!nSel) { barra.innerHTML = '<p class="suave pequeno" style="margin:10px 0">Para conciliar à mão: marque os itens na Parte A e/ou na Parte B — aparece embaixo a opção <b>Conciliar manualmente</b>, que cria o próximo ID.</p>'; return; }
    const bate = Math.abs(dif) < 1;
    // Marcado fora da lista só acontece com a busca de cima ou o "Mostrar" (os filtros de cada parte deixam no topo).
    const naTela = new Set((E.listaA || []).concat(E.listaB || []).map((x) => x.id));
    const fora = Array.from(E.selA).concat(Array.from(E.selB)).filter((id) => !naTela.has(id)).length;
    // Barra fixa no rodapé: aparece assim que marca, sem precisar rolar a tela.
    barra.innerHTML = '<div class="espaco-barra"></div><div class="barra-selecao" role="region" aria-label="Itens marcados">' +
      '<span>Parte A: <b class="num">' + U.formatarCentavos(sa) + '</b> (' + E.selA.size + ')</span>' +
      '<span>Parte B: <b class="num">' + U.formatarCentavos(sb) + '</b> (' + E.selB.size + ')</span>' +
      '<span class="' + (bate ? 'ok' : 'falta') + '">' + (bate ? '✓ bate' : 'diferença ' + U.formatarCentavos(dif)) + '</span>' +
      '<span class="explica">vira o ID #' + M.proximoIdAB(E.decisoes.conciliacoesAB) + ' · ' + TIPO_AB[M.tipoAB(E.selA.size, E.selB.size)] +
      (fora ? ' · ' + fora + ' marcado(s) fora do filtro' : '') + '</span>' +
      '<button type="button" class="botao primario" data-acao="conciliar-ab">✓ Conciliar manualmente</button>' +
      '<button type="button" class="botao" data-acao="limpar-ab">Limpar</button></div>';
  }

  function desenharListaAB(el, b) {
    const grupos = E.decisoes.conciliacoesAB;
    if (!grupos.length) { el.innerHTML = ''; return; }
    const lista = grupos.filter(b.grupo).sort((x, y) => x.id - y.id);
    el.innerHTML = '<h3 style="margin:18px 0 8px">Conciliações com ID (' + lista.length.toLocaleString('pt-BR') + (lista.length !== grupos.length ? ' de ' + grupos.length.toLocaleString('pt-BR') : '') + ')</h3><div id="tab-ab"></div>';
    T.tabelaPaginada(el.querySelector('#tab-ab'), {
      alta: false, porPagina: 100,
      cabecalho: '<th style="width:24px"></th><th>ID</th><th>Tipo</th><th>Como</th><th>Documento</th><th>Fornecedor</th><th class="num">Parte A</th><th class="num">Parte B</th><th>Itens</th><th>Quem</th><th></th>',
      linhas: lista, vazio: 'Nenhuma conciliação com este filtro.',
      linha: (g) => {
        const aberto = E.abertosAB.has(g.id);
        const faltam = g.a.concat(g.b).filter((id) => !E.itens.porId.has(id)).length;
        const dif = g.valorA - g.valorB;
        return '<tr class="' + (aberto ? 'destaque' : '') + '"><td><button type="button" class="lapis" data-abrir-ab="' + g.id + '" title="Ver os itens">' + (aberto ? '▾' : '▸') + '</button></td>' +
          '<td class="num"><b>#' + g.id + '</b></td>' +
          '<td><span class="pilula ' + (g.tipo === 'AxB' ? 'azul' : 'cinza') + '">' + TIPO_AB[g.tipo] + '</span></td>' +
          '<td><span class="selo ' + (g.regra === 'manual' ? 'mao' : 'opcional') + '" title="' + T.esc(M.REGRAS_AB[g.regra] || '') + '">' + T.esc(COMO_AB[g.regra] || g.regra) + '</span>' +
          (g.aviso === 'baixa-antes-da-nota' ? '<br><span class="selo suspeita" title="A baixa tem data anterior à nota (7.11): confira">baixa antes da nota</span>' : '') + '</td>' +
          '<td class="num">' + T.nome(g.documento) + '</td>' +
          '<td class="nome">' + T.nome(g.nome) + (g.obs ? '<br><span class="suave pequeno">✎ ' + T.esc(g.obs) + '</span>' : '') +
          (faltam ? '<br><span class="falta pequeno">' + faltam + ' item(ns) não estão mais nos arquivos</span>' : '') + '</td>' +
          T.tdValor(g.valorA) + T.tdValor(g.valorB) +
          '<td class="pequeno" style="white-space:nowrap">' + g.a.length + ' de A · ' + g.b.length + ' de B' + (Math.abs(dif) >= 1 ? '<br><span class="falta">diferença ' + U.formatarCentavos(dif) + '</span>' : '') + '</td>' +
          '<td class="pequeno suave">' + T.esc(g.quem || '') + (g.quando ? '<br>' + U.dataHoraLocal(g.quando) : '') + '</td>' +
          '<td class="num"><button type="button" class="botao pequeno perigo" data-desfazer-ab="' + g.id + '">Desfazer</button></td></tr>' +
          (aberto ? linhaDetalheAB(g) : '');
      },
    });
  }

  function linhaDetalheAB(g) {
    const itens = g.a.concat(g.b).map((id) => E.itens.porId.get(id) || { id, faltando: true });
    return '<tr class="sub"><td></td><td colspan="10"><div class="tabela-caixa"><table class="tabela"><thead><tr><th>Lado</th><th>Documento</th><th>Origem</th><th>Data</th><th class="historico">Fornecedor · histórico</th><th class="num">Valor</th></tr></thead><tbody>' +
      itens.map((x) => x.faltando ? '<tr><td colspan="6" class="falta pequeno">Item que não está mais nos arquivos (' + T.esc(x.id) + ')</td></tr>' :
        '<tr><td><b>' + x.lado + '</b></td><td class="num">' + T.nome(x.doc) + '</td><td class="pequeno suave">' + T.esc(rotuloFonte(x)) + '</td><td class="num">' + T.esc(x.data || '—') + '</td>' +
        '<td class="historico">' + (x.chave === SEM ? '<span class="falta">sem fornecedor</span>' : T.esc(x.nome)) + (x.historico ? '<br><span class="suave pequeno">' + T.esc(x.historico) + '</span>' : '') + '</td>' +
        '<td class="num ' + (x.valor < 0 ? 'negativo' : '') + '">' + U.formatarCentavos(x.valor) + '</td></tr>').join('') +
      '</tbody></table></div></td></tr>';
  }

  // Abre/fecha os itens de uma conciliação sem redesenhar a lista (não perde o "mostrar mais").
  function alternarDetalheAB(botao) {
    const id = Number(botao.getAttribute('data-abrir-ab'));
    const tr = botao.closest('tr');
    const g = E.decisoes.conciliacoesAB.find((x) => x.id === id);
    const prox = tr.nextElementSibling;
    if (E.abertosAB.has(id)) {
      E.abertosAB.delete(id);
      if (prox && prox.classList.contains('sub')) prox.remove();
      botao.textContent = '▸'; tr.classList.remove('destaque');
    } else if (g) {
      E.abertosAB.add(id);
      tr.insertAdjacentHTML('afterend', linhaDetalheAB(g));
      botao.textContent = '▾'; tr.classList.add('destaque');
    }
  }

  function redesenharAB() { desenharAbas(); redesenhaMantendo(); }

  // ⚡ Conciliar: acha tudo pelo documento e marca com IDs sequenciais.
  function conciliarTudo() {
    const novos = M.conciliarAutomatico(E.itens, E.decisoes.conciliacoesAB, app().usuario.nome, U.agoraISO());
    if (!novos.length) { T.avisoRapido('Nada novo para conciliar pelo documento.', 'ok'); return; }
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat(novos);
    const n = (tipo) => novos.filter((g) => g.tipo === tipo).length;
    const ab = M.emAbertoAB(E.itens, E.decisoes.conciliacoesAB);
    const texto = novos.length + (novos.length === 1 ? ' conciliação nova (ID #' + novos[0].id + ')' : ' conciliações novas (IDs #' + novos[0].id + ' a #' + novos[novos.length - 1].id + ')') +
      ': ' + n('AxA') + ' A×A e ' + n('AxB') + ' A×B' + (n('BxB') ? ' e ' + n('BxB') + ' B×B' : '');
    historico('⚡ Conciliar pelo documento: ' + texto);
    redesenharAB();
    T.avisoRapido('⚡ ' + texto + '. Em aberto: ' + ab.abertosA.length + ' na A e ' + ab.abertosB.length + ' na B.', 'ok', 8000);
    gravar('terceiro-ab-automatico', texto);
  }

  async function desfazerAutomaticas() {
    const auto = E.decisoes.conciliacoesAB.filter((g) => g.regra !== 'manual');
    if (!auto.length) return;
    const ok = await T.confirmar({
      titulo: 'Desfazer as conciliações automáticas',
      texto: 'As <b>' + auto.length.toLocaleString('pt-BR') + '</b> conciliações feitas pelo ⚡ Conciliar voltam para <b>em aberto</b>. As feitas à mão continuam.',
      botao: 'Desfazer', perigo: true,
    });
    if (!ok) return;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => g.regra === 'manual');
    historico('Desfez ' + auto.length + ' conciliações automáticas');
    redesenharAB();
    gravar('terceiro-ab-desfazer-automaticas', auto.length + ' conciliações');
  }

  async function conciliarAB() {
    const a = Array.from(E.selA), b = Array.from(E.selB);
    if (!a.length && !b.length) return;
    const valorA = somaSel(E.selA), valorB = somaSel(E.selB);
    let obs = '';
    if (Math.abs(valorA - valorB) >= 1) {
      // Diferença não bloqueia: pergunta mostrando os dois valores (Parte 7.11), com o motivo.
      const r = await T.janela({
        titulo: 'Conciliar manualmente com diferença?',
        corpo: '<p style="line-height:1.7">Parte A: <b>' + T.moeda(valorA) + '</b> (' + a.length + ' item(ns))<br>Parte B: <b>' + T.moeda(valorB) + '</b> (' + b.length + ' item(ns))<br>' +
          '<span class="falta">Diferença: <b>' + T.moeda(valorA - valorB) + '</b></span></p>' +
          '<div class="campo" style="margin-top:10px"><label for="obs-ab">Observação (por que concilia assim)</label><input id="obs-ab" autocomplete="off" maxlength="200" placeholder="Ex.: juros pagos no boleto" autofocus></div>',
        botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Conciliar com diferença', tipo: 'primario', antes: (j) => ({ obs: j.querySelector('#obs-ab').value.trim() }) }],
        aoAbrir: (j) => { j.querySelector('#obs-ab').addEventListener('keydown', (e) => { if (e.key === 'Enter') j.querySelector('footer .primario').click(); }); },
      });
      if (!r) return;
      obs = r.obs;
    }
    const itens = a.concat(b).map((id) => E.itens.porId.get(id)).filter(Boolean);
    const docs = Array.from(new Set(itens.map((x) => x.doc).filter(Boolean)));
    const g = {
      id: M.proximoIdAB(E.decisoes.conciliacoesAB), tipo: M.tipoAB(a.length, b.length), regra: 'manual',
      documento: docs.slice(0, 3).join(', ') + (docs.length > 3 ? '…' : ''),
      nome: ((itens.find((x) => x.chave !== SEM) || itens[0] || {}).nome) || '',
      a, b, valorA, valorB, quem: app().usuario.nome, quando: U.agoraISO(),
    };
    if (obs) g.obs = obs;
    E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.concat([g]);
    E.selA = new Set(); E.selB = new Set();
    historico('Conciliou à mão #' + g.id + ' (' + TIPO_AB[g.tipo] + '): ' + a.length + ' de A e ' + b.length + ' de B (' + U.formatarCentavos(valorA) + ' × ' + U.formatarCentavos(valorB) + ')');
    redesenharAB();
    T.avisoRapido('Conciliado à mão: ID #' + g.id + ' (' + TIPO_AB[g.tipo] + ')', 'ok');
    gravar('terceiro-ab-conciliar', '#' + g.id + ' · ' + a.length + '+' + b.length + ' · ' + U.formatarCentavos(valorA));
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
      linha: (l) => { const lc = E.arquivos.raz.conteudo.conta.lancamentos[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDaLinha(lc)) + '</td>' +
        '<td class="historico">' + T.esc(lc.historico) + '</td>' + T.tdValor(lc.credito) + T.tdValor(lc.debito) +
        '<td><button type="button" class="botao pequeno" data-dono-linha="' + l.i + '">✎ dar fornecedor</button></td></tr>'; },
    });
  }

  function abaRazao(alvo) {
    desenharFiltros([{ tipo: 'busca', nome: 'busca', texto: 'Buscar fornecedor, histórico ou documento' }]);
    const busca = filtro('busca');
    const lancs = E.arquivos.raz.conteudo.conta.lancamentos;
    const lista = E.r.linhas.filter((l) => { const d = E.r.porLinha.get(l.digital); return combina(busca, d.nome, l.historico) || (busca && M.documentoDaLinha(lancs[l.i]).indexOf(M.normalizarDocumento(busca) || busca) >= 0); });
    alvo.innerHTML = '<div id="tab"></div>';
    T.tabelaPaginada(alvo.querySelector('#tab'), {
      cabecalho: '<th>Data</th><th>NF/Doc</th><th class="historico">Histórico</th><th>Fornecedor</th><th class="num">Nota</th><th class="num">Baixa</th><th></th>',
      linhas: lista, porPagina: 300, vazio: 'Nenhuma linha.',
      linha: (l) => { const d = E.r.porLinha.get(l.digital); const lc = lancs[l.i]; return '<tr><td class="num">' + T.esc(lc.data) + '</td><td>' + T.nome(M.documentoDaLinha(lc)) + '</td>' +
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
      if (a === 'config-abas') await configurarAbas();
      else if (a === 'conciliar-tudo') conciliarTudo();
      else if (a === 'desfazer-automaticas') await desfazerAutomaticas();
      else if (a === 'conciliar-ab') await conciliarAB();
      else if (a === 'limpar-ab') { E.selA = new Set(); E.selB = new Set(); redesenhaMantendo(); }
      return;
    }
    const limparLado = ev.target.closest('[data-limpar-lado]');
    if (limparLado) {
      const lado = limparLado.getAttribute('data-limpar-lado');
      CAMPOS_LADO.forEach((n) => { delete E.filtros['ab.' + lado + '.' + n]; });
      redesenhaMantendo();
      return;
    }
    const abrirAb = ev.target.closest('[data-abrir-ab]');
    if (abrirAb) { alternarDetalheAB(abrirAb); return; }
    const verId = ev.target.closest('[data-ver-id]');
    if (verId) {
      E.filtros['ab.busca'] = '#' + verId.getAttribute('data-ver-id');
      E.filtros['ab.mostrar'] = 'todos';
      E.abertosAB.add(Number(verId.getAttribute('data-ver-id')));
      desenharAba();
      return;
    }
    const desab = ev.target.closest('[data-desfazer-ab]');
    if (desab) {
      const id = Number(desab.getAttribute('data-desfazer-ab'));
      E.decisoes.conciliacoesAB = E.decisoes.conciliacoesAB.filter((g) => g.id !== id);
      E.abertosAB.delete(id);
      historico('Desfez a conciliação #' + id);
      redesenharAB();
      gravar('terceiro-ab-desfazer', '#' + id);
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
      // Marca a lista INTEIRA desta parte (com os filtros de agora), não só as linhas já desenhadas.
      const lado = todos.getAttribute('data-marca-todos'); const set = lado === 'A' ? E.selA : E.selB;
      ((lado === 'A' ? E.listaA : E.listaB) || []).forEach((x) => {
        if (E.idDoItem.has(x.id)) return;
        if (todos.checked) set.add(x.id); else set.delete(x.id);
      });
      E.el.querySelectorAll('#col' + lado + ' [data-item]').forEach((c) => {
        const marcado = set.has(c.getAttribute('data-id'));
        c.checked = marcado;
        c.closest('tr').classList.toggle('destaque', marcado);
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
