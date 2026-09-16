/*
 * Conciliador Solutta — tela-comum.js
 * Peças de tela usadas por todas as áreas: valores, pílulas, janelas de confirmação,
 * mensagens rápidas, tabelas com "mostrar mais" e download de arquivo.
 * Linguagem de contador, em português. Nada de jargão de programação na tela.
 */
(function (raiz) {
  'use strict';
  const U = raiz.Util;
  const esc = U.escaparHtml;

  // Célula numérica: vazio é SEMPRE 0,00 ("padrão sempre"), zero com cor mais fraca.
  function valor(c) {
    const n = Math.round(Number(c) || 0);
    return '<span class="num' + (n === 0 ? ' zero' : '') + '">' + U.formatarCentavos(n) + '</span>';
  }
  function tdValor(c, extra) {
    const n = Math.round(Number(c) || 0);
    return '<td class="num' + (n === 0 ? ' zero' : '') + (extra ? ' ' + extra : '') + '">' + U.formatarCentavos(n) + '</td>';
  }
  function moeda(c) { return 'R$ ' + U.formatarCentavos(c); }
  // Valor com a natureza no lugar do sinal (Dony, 16/09/2026): "1.236,55 C" / "1.236,55 D".
  // dc = 'D' | 'C' | '' (quem decide é o passo, pela natureza da conta).
  function valorDC(c, dc) {
    const n = Math.round(Number(c) || 0);
    return U.formatarCentavos(Math.abs(n)) + (n && dc ? ' ' + dc : '');
  }
  function marcaDC(dc) { return dc ? ' <span class="dc ' + dc.toLowerCase() + '" title="' + (dc === 'D' ? 'Débito' : 'Crédito') + '">' + dc + '</span>' : ''; }
  function htmlDC(c, dc) {
    const n = Math.round(Number(c) || 0);
    return U.formatarCentavos(Math.abs(n)) + (n ? marcaDC(dc) : '');
  }
  function tdValorDC(c, dc, extra) {
    const n = Math.round(Number(c) || 0);
    return '<td class="num' + (n === 0 ? ' zero' : '') + (extra ? ' ' + extra : '') + '">' + htmlDC(n, dc) + '</td>';
  }
  function nome(n) { return n && String(n).trim() ? esc(n) : '—'; }

  // ------------------------------------------------------------------
  // Mensagens rápidas
  // ------------------------------------------------------------------
  function avisoRapido(texto, tipo, ms) {
    let caixa = document.querySelector('.avisos-rapidos');
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.className = 'avisos-rapidos';
      caixa.setAttribute('role', 'status');
      document.body.appendChild(caixa);
    }
    const el = document.createElement('div');
    el.className = 'aviso-rapido' + (tipo ? ' ' + tipo : '');
    el.textContent = texto;
    caixa.appendChild(el);
    setTimeout(() => el.remove(), ms || (tipo === 'erro' ? 8000 : 3500));
  }

  // Erro em português, dizendo o que fazer (Parte 8).
  function mensagemDeErro(e) {
    if (!e) return 'Algo deu errado.';
    if (e.name === 'NaoConectado') return e.message;
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'O navegador não deu permissão para usar a pasta de dados. Clique em "Reconectar a pasta de dados" e depois em Permitir.';
    if (e.name === 'NotFoundError') return 'Um arquivo ou pasta da pasta de dados não foi encontrado. Ele pode ter sido movido ou apagado fora do programa.';
    if (e.name === 'QuotaExceededError') return 'O disco está cheio. Libere espaço e tente de novo.';
    return e.message || String(e);
  }

  // ------------------------------------------------------------------
  // Janelas
  // ------------------------------------------------------------------
  function janela(op) {
    const fundo = document.createElement('div');
    fundo.className = 'fundo-janela';
    fundo.innerHTML = '<div class="janela' + (op.larga ? ' larga' : '') + '" role="dialog" aria-modal="true">' +
      '<header><h2>' + esc(op.titulo || '') + '</h2></header>' +
      '<div class="corpo-janela">' + (op.corpo || '') + '</div>' +
      '<footer></footer></div>';
    const rodape = fundo.querySelector('footer');
    let resolver;
    const promessa = new Promise((r) => { resolver = r; });
    function fechar(resultado) {
      fundo.remove();
      document.removeEventListener('keydown', teclas);
      resolver(resultado);
    }
    function teclas(ev) {
      if (ev.key === 'Escape') fechar(null);
    }
    (op.botoes || [{ texto: 'Fechar', valor: null }]).forEach((b) => {
      const bt = document.createElement('button');
      bt.type = 'button';
      bt.className = 'botao' + (b.tipo ? ' ' + b.tipo : '');
      bt.textContent = b.texto;
      bt.addEventListener('click', async () => {
        if (typeof b.antes === 'function') {
          const r = await b.antes(fundo);
          if (r === false) return;
          fechar(r === undefined ? b.valor : r);
          return;
        }
        fechar(b.valor);
      });
      rodape.appendChild(bt);
    });
    fundo.addEventListener('mousedown', (ev) => { if (ev.target === fundo && !op.naoFecharFora) fechar(null); });
    document.addEventListener('keydown', teclas);
    document.body.appendChild(fundo);
    const foco = fundo.querySelector('[autofocus]') || fundo.querySelector('footer .primario, footer .perigo');
    if (foco) setTimeout(() => foco.focus(), 30);
    if (typeof op.aoAbrir === 'function') op.aoAbrir(fundo, fechar);
    return promessa;
  }

  // Confirmação antes de ação irreversível (Parte 8).
  function confirmar(op) {
    return janela({
      titulo: op.titulo,
      corpo: '<p style="line-height:1.5">' + op.texto + '</p>',
      botoes: [{ texto: 'Cancelar', valor: false }, { texto: op.botao || 'Confirmar', tipo: op.perigo ? 'perigo' : 'primario', valor: true }],
    }).then((r) => r === true);
  }

  // ------------------------------------------------------------------
  // Pílulas de situação
  // ------------------------------------------------------------------
  const SITUACOES = {
    // linhas
    'bateu': ['verde', 'bateu', 'Casou com outra linha dentro do mesmo razão'],
    'auto': ['verde', 'reclassificada', 'A reclassificação aceita baixou o lado inteiro deste fornecedor'],
    'manual': ['azul', 'à mão', 'Entrou numa reclassificação feita à mão'],
    'parcial': ['ambar', 'parcial', 'A reclassificação baixou só uma parte; o resto continua em aberto'],
    'recusada': ['ambar', 'desmarcada', 'A reclassificação sugerida para este fornecedor está desmarcada'],
    'sem-par': ['cinza', 'sem par', 'Não casou com nada e não há reclassificação para ela'],
    'sem-fornecedor': ['vermelho', 'sem fornecedor', 'O programa não conseguiu dizer de quem é esta linha'],
    // por fornecedor
    'para-adiantamento': ['azul', 'vai para adiantamento', 'Fornecedores devedor: o pago a maior vai para o adiantamento'],
    'reclassificado': ['verde', 'reclassificado', 'A pagar e adiantado se compensaram'],
    'recusado': ['ambar', 'desmarcado', 'Havia sugestão, mas ela está desmarcada'],
    'a-mao': ['azul', 'à mão', 'Reclassificação feita à mão'],
    'so-a-pagar': ['cinza', 'só a pagar', 'Tem saldo a pagar e nenhum adiantamento'],
    'devedor': ['vermelho', 'devedor', 'Fornecedores com saldo devedor e a sugestão desmarcada'],
    'zerado': ['verde', 'zerado', 'Não sobrou saldo'],
    'de-principal': ['azul', 'recebe de fornecedores', 'Recebe o valor pago a maior que estava em fornecedores'],
    'so-adiantamento': ['cinza', 'só adiantamento', 'Tem adiantamento e nada a pagar'],
    'adiantamento-e-devedor': ['azul', 'adiantamento e devedor', 'Já tinha adiantamento e ainda recebe o devedor de fornecedores'],
    'adiantamento-credor': ['vermelho', 'adiantamento credor', 'O adiantamento ficou com saldo credor'],
  };
  function pilula(situacao) {
    const s = SITUACOES[situacao] || ['cinza', situacao, ''];
    return '<span class="pilula ' + s[0] + '" title="' + esc(s[2]) + '">' + esc(s[1]) + '</span>';
  }

  const COMO = {
    '1x1': 'uma nota e um pagamento de mesmo valor (o mais perto na data primeiro)',
    '1xN': 'um pagamento = soma de várias notas (até 90 dias antes dele)',
    'Nx1': 'uma nota = soma de vários pagamentos (até 90 dias depois dela)',
    'zerou': 'o que sobrou do fornecedor neste razão soma zero',
    'mesmo-dia': 'linhas sem fornecedor que se anulam na mesma conta, no mesmo dia e no mesmo valor',
  };
  function seloComo(como) {
    return '<span class="selo opcional" title="' + esc(COMO[como] || '') + '">' + esc(como === 'mesmo-dia' ? 'mesmo dia' : como) + '</span>';
  }

  // ------------------------------------------------------------------
  // Download (arquivo de ajustes): bytes exatos, sem o navegador converter nada.
  // ------------------------------------------------------------------
  function baixar(bytes, nomeArquivo, tipo) {
    const blob = new Blob([bytes], { type: tipo || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function lerArquivoComoBytes(arquivo) {
    if (arquivo.arrayBuffer) return arquivo.arrayBuffer().then((b) => new Uint8Array(b));
    return new Promise((ok, falha) => {
      const fr = new FileReader();
      fr.onload = () => ok(new Uint8Array(fr.result));
      fr.onerror = () => falha(fr.error);
      fr.readAsArrayBuffer(arquivo);
    });
  }

  function debounce(fn, ms) {
    let t = null;
    const d = function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn.apply(null, args); }, ms);
    };
    d.agora = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return d;
  }

  // Tabela com "mostrar mais": desenha as primeiras N linhas e acrescenta sob demanda.
  // ------------------------------------------------------------------
  // Ordenar clicando no título da coluna (Dony, 16/09/2026: "clicar ali em valor e ele organizar
  // por valor, independente se positivo ou negativo — um pagamento −200 e a compensação +200 ficam
  // juntos —, ou por data, fornecedor, documento; para todas"). Cada tabela diz, em op.ordem, quais
  // colunas ordenam: { id, colunas: [por <th>: null ou { tipo, de: (linha) => … }], fixo: (linha) => bool }.
  //   tipo 'valor'  = pelo valor SEM o sinal (−200 logo antes do +200);
  //   tipo 'data'   = dd/mm/aaaa; 'numero'; 'texto' (sem acento, "45" antes de "123").
  // Clique: crescente → decrescente → como veio. Vazio fica sempre no fim; as linhas "fixas" (marcadas
  // fora do filtro) continuam no topo. A escolha fica lembrada por tabela (op.ordem.id).
  // ------------------------------------------------------------------
  const ordensLembradas = new Map();
  function ordemLembrada(id) {
    if (!id) return null;
    if (ordensLembradas.has(id)) return ordensLembradas.get(id);
    try {
      const e = JSON.parse((raiz.App && raiz.App.lerLocal && raiz.App.lerLocal('conciliador-solutta.ordem.' + id)) || 'null');
      return e && typeof e.col === 'number' && (e.sentido === 1 || e.sentido === -1) ? e : null;
    } catch (e) { return null; }
  }
  function lembrarOrdem(id, estado) {
    if (!id) return;
    ordensLembradas.set(id, estado);
    try { if (raiz.App && raiz.App.gravarLocal) raiz.App.gravarLocal('conciliador-solutta.ordem.' + id, JSON.stringify(estado)); } catch (e) { /* só a lembrança */ }
  }
  function chaveDeOrdem(coluna, linha) {
    const v = coluna.de(linha);
    if (v === null || v === undefined || v === '') return null;
    if (coluna.tipo === 'valor') { const n = Number(v); return isFinite(n) ? Math.abs(n) * 2 + (n < 0 ? 0 : 1) : null; }
    if (coluna.tipo === 'numero') { const n = Number(v); return isFinite(n) ? n : null; }
    if (coluna.tipo === 'data') { const d = U.lerData(v); return d ? d.numero : null; }
    return U.semAcento(String(v)).trim().toLowerCase() || null;
  }
  function ordenarLinhas(linhas, ordem, estado) {
    const coluna = estado && ordem.colunas[estado.col];
    if (!coluna) return linhas;
    const s = estado.sentido;
    return linhas.map((x, i) => ({ x, i, k: chaveDeOrdem(coluna, x), f: ordem.fixo && ordem.fixo(x) ? 1 : 0 }))
      .sort((a, b) => {
        if (a.f !== b.f) return b.f - a.f;
        if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : (a.k === null ? 1 : -1);
        const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'pt-BR', { numeric: true });
        return c * s || a.i - b.i;
      })
      .map((o) => o.x);
  }

  function tabelaPaginada(el, op) {
    const porPagina = op.porPagina || 300;
    const ordem = op.ordem && op.ordem.colunas ? op.ordem : null;
    let estado = ordem ? ordemLembrada(ordem.id) : null;
    if (estado && !ordem.colunas[estado.col]) estado = null;
    let linhas = ordem ? ordenarLinhas(op.linhas, ordem, estado) : op.linhas;
    let mostradas = 0;
    const total = op.linhas.length;
    el.innerHTML = '<div class="tabela-caixa' + (op.alta === false ? '' : ' alta') + '"><table class="tabela"><thead><tr>' + op.cabecalho + '</tr></thead><tbody></tbody>' +
      (op.rodape ? '<tfoot>' + op.rodape + '</tfoot>' : '') + '</table>' +
      (total ? '' : '<div class="vazio">' + (op.vazio || 'Nada para mostrar.') + '</div>') +
      '<div class="mais-linhas escondido"></div></div>';
    const corpo = el.querySelector('tbody');
    const mais = el.querySelector('.mais-linhas');
    if (ordem) {
      const titulos = Array.from(el.querySelector('thead tr').children);
      const setas = () => titulos.forEach((th, i) => {
        if (!ordem.colunas[i]) return;
        const ativo = estado && estado.col === i;
        th.classList.toggle('ordenado', !!ativo);
        th.setAttribute('aria-sort', ativo ? (estado.sentido === 1 ? 'ascending' : 'descending') : 'none');
        th.querySelector('.seta-ordem').textContent = ativo ? (estado.sentido === 1 ? '▲' : '▼') : '↕';
      });
      titulos.forEach((th, i) => {
        const c = ordem.colunas[i];
        if (!c) return;
        th.classList.add('ordenavel');
        th.setAttribute('data-ordem-col', i);
        th.title = (th.title ? th.title + ' · ' : '') + (c.tipo === 'valor' ? 'Clique para ordenar pelo valor (sem olhar o sinal)' : 'Clique para ordenar');
        th.insertAdjacentHTML('beforeend', '<span class="seta-ordem" aria-hidden="true"></span>');
      });
      setas();
      el.querySelector('thead').addEventListener('click', (ev) => {
        const th = ev.target.closest('th[data-ordem-col]');
        if (!th || ev.target.closest('input, button, a, select, label')) return;
        const col = Number(th.getAttribute('data-ordem-col'));
        estado = !estado || estado.col !== col ? { col, sentido: 1 } : (estado.sentido === 1 ? { col, sentido: -1 } : null);
        lembrarOrdem(ordem.id, estado);
        linhas = ordenarLinhas(op.linhas, ordem, estado);
        const jaMostradas = mostradas;
        corpo.innerHTML = '';
        mostradas = 0;
        desenharMais(Math.max(jaMostradas, porPagina));
        setas();
      });
    }
    function desenharMais(quantas) {
      const ate = Math.min(total, mostradas + (quantas || porPagina));
      const partes = [];
      for (let i = mostradas; i < ate; i++) partes.push(op.linha(linhas[i], i));
      corpo.insertAdjacentHTML('beforeend', partes.join(''));
      mostradas = ate;
      if (mostradas < total) {
        mais.classList.remove('escondido');
        mais.innerHTML = 'Mostrando ' + mostradas.toLocaleString('pt-BR') + ' de ' + total.toLocaleString('pt-BR') +
          ' · <button type="button" class="botao pequeno">Mostrar mais ' + Math.min(porPagina, total - mostradas).toLocaleString('pt-BR') + '</button>' +
          ' <button type="button" class="botao pequeno leve" data-todas>Mostrar todas</button>';
      } else {
        mais.classList.add('escondido');
      }
    }
    mais.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-todas')) { while (mostradas < total) desenharMais(); } else desenharMais();
    });
    desenharMais();
    return { recarregar: () => tabelaPaginada(el, op) };
  }

  function carregando(el, texto) {
    el.innerHTML = '<div class="carregando">' + esc(texto || 'Carregando…') + '</div>';
  }

  raiz.Tela = {
    esc, valor, tdValor, moeda, valorDC, htmlDC, tdValorDC, marcaDC, nome, avisoRapido, mensagemDeErro, janela, confirmar, pilula, seloComo, COMO, SITUACOES,
    baixar, lerArquivoComoBytes, debounce, tabelaPaginada, ordenarLinhas, carregando,
  };
})(self);
