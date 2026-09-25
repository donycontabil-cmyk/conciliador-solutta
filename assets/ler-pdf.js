/*
 * Conciliador Solutta — ler-pdf.js
 * O PDF vira PLANILHA (Dony, 25/09/2026, a Zelco: "só sai em PDF"). O sistema do cliente imprime o balancete e
 * o diário em PDF; aqui o texto do PDF é remontado em LINHAS e COLUNAS, com a posição de cada pedaço na
 * página, e sai no mesmo formato que o programa já usa para planilha ([{ nome, linhas: [[célula, …], …] }]).
 * Assim os leitores de balancete, razão e diário continuam valendo — eles nem sabem que veio de um PDF.
 *
 * Como as colunas são achadas, já que o PDF não tem tabela de verdade:
 *  1. cada pedaço de texto tem x (esquerda), y (linha) e largura; os que estão na MESMA ALTURA viram uma linha
 *     (com uma folga, porque a impressora desalinha um pouco);
 *  2. dentro da linha, pedaços colados viram uma palavra só — é o que conserta o "F o r n e c e d o r" que o
 *     PDF do diário dela escreve letra por letra;
 *  3. as COLUNAS saem dos começos (x) que se repetem em muitas linhas da página: cada x frequente é uma
 *     coluna, e cada pedaço cai na coluna do x mais próximo à esquerda. Com isso o cabeçalho e os valores
 *     ficam alinhados mesmo quando a impressão mistura as colunas (o que atrapalha o "copiar e colar").
 *
 * Só leitura. Nada aqui grava arquivo nem decide o que o dado significa: isso é dos leitores.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.LerPdf = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // O pdf.js (a biblioteca que abre o PDF): no navegador vem do próprio programa; no Node, de onde a prova indicar.
  // O "worker" é o pedaço pesado que roda em paralelo, para a tela não travar enquanto o PDF é lido; ele mora
  // na mesma pasta do programa (funciona sem internet).
  const CAMINHO_DO_WORKER = (function () {
    try {
      const s = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
      return s ? s.replace(/ler-pdf\.js.*$/, 'pdf.worker.min.js') : '';
    } catch (e) { return ''; }
  })();
  function biblioteca(raiz) {
    const g = raiz || (typeof self !== 'undefined' ? self : global);
    const lib = g.pdfjsLib || null;
    if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc && CAMINHO_DO_WORKER) {
      lib.GlobalWorkerOptions.workerSrc = CAMINHO_DO_WORKER;
    }
    return lib;
  }

  const ARREDONDAR = 2; // casas do x/y usadas para juntar (o PDF tem frações de ponto)
  const arred = (v) => Math.round(v * ARREDONDAR) / ARREDONDAR;

  // ------------------------------------------------------------------
  // Uma página: os pedaços de texto viram linhas e colunas.
  // itens: [{ str, x, y, largura, altura }]
  // ------------------------------------------------------------------
  function linhasDaPagina(itens, op) {
    const opc = op || {};
    const folgaLinha = opc.folgaLinha || 2.2;   // altura em pontos para dizer que é a mesma linha
    const cheios = itens.filter((it) => String(it.str || '').trim() !== '');
    if (!cheios.length) return [];
    // 1) Juntar por altura (y), da primeira linha para a última.
    const porY = [];
    cheios.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((it) => {
      const linha = porY.find((l) => Math.abs(l.y - it.y) <= folgaLinha);
      if (linha) { linha.itens.push(it); linha.y = (linha.y * linha.itens.length + it.y) / (linha.itens.length + 1); }
      else porY.push({ y: it.y, itens: [it] });
    });
    porY.forEach((l) => l.itens.sort((a, b) => a.x - b.x));
    // 2) Pedaços colados viram uma palavra só. Há dois tipos de PDF: o que escreve palavras inteiras (com a
    // largura de cada uma) e o que escreve LETRA POR LETRA com largura zero — o diário da Zelco é assim, e sem
    // isto sairia "F o r n e c e d o r". Quando não há largura, o avanço típico entre as letras da linha é que
    // diz o que está colado e o que é espaço.
    porY.forEach((l) => {
      const its = l.itens;
      const semLargura = its.filter((i) => !(i.largura > 0)).length > its.length * 0.6;
      let passo = 0;
      if (semLargura) {
        const ds = [];
        for (let i = 1; i < its.length; i++) ds.push(its[i].x - its[i - 1].x);
        const bons = ds.filter((d) => d > 0.05).sort((a, b) => a - b);
        passo = bons.length ? bons[Math.floor(bons.length / 2)] : 3.5;
      }
      const juntos = [];
      its.forEach((it) => {
        const ultimo = juntos[juntos.length - 1];
        const larguraDele = it.largura > 0 ? it.largura : passo * 0.92;
        const distancia = ultimo ? it.x - (ultimo.x + ultimo.largura) : Infinity;
        const limite = semLargura ? passo * 0.75 : Math.max(0.6, (it.altura || 6) * 0.28);
        if (ultimo && distancia <= limite) {
          ultimo.str += (distancia > limite * 0.55 && !/\s$/.test(ultimo.str) ? ' ' : '') + it.str;
          ultimo.largura = it.x + larguraDele - ultimo.x;
        } else juntos.push({ str: it.str, x: it.x, largura: larguraDele, altura: it.altura });
      });
      l.pedacos = juntos.map((p) => ({ x: arred(p.x), largura: arred(p.largura || 0), texto: String(p.str).replace(/\s+/g, ' ').trim() })).filter((p) => p.texto);
    });
    return porY.filter((l) => l.pedacos.length);
  }

  // As colunas da página saem dos ESPAÇOS EM BRANCO que atravessam a folha de cima a baixo. Achar coluna pelo
  // começo do texto não serve num relatório: o número é alinhado à direita, então cada valor começaria numa
  // coluna diferente. Aqui o que conta é onde NÃO há texto em (quase) nenhuma linha — essas faixas vazias são
  // as divisas das colunas, e cada pedaço cai na faixa em que ele está.
  function colunasDaPagina(linhas, op) {
    const opc = op || {};
    const passo = opc.passo || 1;                 // resolução da varredura, em pontos
    const vazioMinimo = opc.vazioMinimo || 3;     // faixa vazia menor que isso não separa coluna
    const pedacos = [].concat(...linhas.map((l) => l.pedacos.map((p) => ({ de: p.x, ate: p.x + (p.largura || 0) }))));
    if (!pedacos.length) return [];
    const fim = Math.max.apply(null, pedacos.map((p) => p.ate)) + passo;
    const n = Math.ceil(fim / passo) + 1;
    // Quantas linhas ocupam cada ponto da largura. Um nome de conta comprido invade a coluna do valor em
    // algumas linhas; por isso o corte não é "vazio em todas", e sim "quase nunca ocupado" — senão o código, o
    // nome e os primeiros valores ficariam todos numa coluna só.
    const conta = new Uint16Array(n);
    linhas.forEach((l) => {
      const marcado = new Set();
      l.pedacos.forEach((p) => {
        const a = Math.max(0, Math.floor(p.x / passo)), b = Math.min(n - 1, Math.ceil((p.x + (p.largura || 0)) / passo));
        for (let i = a; i <= b; i++) if (!marcado.has(i)) { marcado.add(i); conta[i]++; }
      });
    });
    const limite = Math.max(1, Math.floor(linhas.length * (opc.ocupacaoMinima || 0.12)));
    const ocupado = new Uint8Array(n);
    for (let i = 0; i < n; i++) ocupado[i] = conta[i] > limite ? 1 : 0;
    // As faixas ocupadas, separadas pelos vazios grandes o bastante.
    const faixas = [];
    let inicio = -1, vazio = 0;
    for (let i = 0; i < n; i++) {
      if (ocupado[i]) {
        if (inicio < 0) inicio = i;
        else if (vazio >= vazioMinimo / passo) { faixas.push([inicio * passo, (i - vazio) * passo]); inicio = i; }
        vazio = 0;
      } else if (inicio >= 0) vazio++;
    }
    if (inicio >= 0) faixas.push([inicio * passo, (n - vazio) * passo]);
    return faixas;
  }

  // Uma linha nas células das faixas (colunas) do arquivo.
  function emCelulas(linha, faixas) {
    if (!faixas || faixas.length < 2) return [linha.pedacos.map((p) => p.texto).join(' ')];
    const celulas = new Array(faixas.length).fill('');
    linha.pedacos.forEach((p) => {
      const centro = p.x + (p.largura || 0) / 2;
      let i = -1;
      for (let k = 0; k < faixas.length && i < 0; k++) if (centro >= faixas[k][0] && centro <= faixas[k][1]) i = k;
      if (i < 0) { // pedaço fora das faixas conhecidas: vai para a mais perto
        let dist = Infinity;
        faixas.forEach((f, k) => { const d = centro < f[0] ? f[0] - centro : centro - f[1]; if (d < dist) { dist = d; i = k; } });
      }
      celulas[i] = celulas[i] ? celulas[i] + ' ' + p.texto : p.texto;
    });
    return celulas;
  }

  function paginaEmCelulas(itens, op) {
    const linhas = linhasDaPagina(itens, op);
    if (!linhas.length) return [];
    const faixas = colunasDaPagina(linhas, op);
    return linhas.map((l) => emCelulas(l, faixas));
  }

  // ------------------------------------------------------------------
  // O arquivo inteiro: uma "aba" só, com as linhas de todas as páginas na ordem.
  // bytes: Uint8Array/ArrayBuffer · op: { nome, pdfjs (a biblioteca), maximoPaginas, aoAndar(feitas, total) }
  // ------------------------------------------------------------------
  async function ler(bytes, op) {
    const opc = op || {};
    const lib = opc.pdfjs || biblioteca(opc.raiz);
    if (!lib) throw new Error('Não achei o leitor de PDF (pdf.js) para abrir este arquivo.');
    // SEMPRE uma cópia: o pdf.js entrega os bytes para o worker e o original fica vazio ("detached"). Sem a
    // cópia, o programa lia o PDF e depois não conseguia guardar o arquivo original na pasta.
    const dados = new Uint8Array(bytes);
    const doc = await lib.getDocument(Object.assign({ data: dados }, opc.opcoesPdf || {})).promise;
    const total = doc.numPages;
    const ate = Math.min(total, opc.maximoPaginas || 2000);
    // Primeiro as linhas de TODAS as páginas; as colunas saem depois, do arquivo inteiro. Se cada página
    // achasse as suas, uma página com uma coluna a menos jogaria os valores para o lado errado — e o relatório
    // sairia com saldo anterior zerado (foi o que aconteceu no primeiro teste com o balancete da Zelco).
    const porPagina = [];
    for (let p = 1; p <= ate; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items.map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        largura: it.width || 0,
        altura: it.height || Math.abs(it.transform[3]) || 6,
      }));
      porPagina.push(linhasDaPagina(itens, opc));
      if (opc.aoAndar) opc.aoAndar(p, ate);
      if (typeof pagina.cleanup === 'function') pagina.cleanup();
    }
    if (typeof doc.destroy === 'function') doc.destroy();
    // As colunas de cada página e, entre elas, o DESENHO MAIS COMUM — que vale para o arquivo inteiro. Juntar
    // os pedaços de todas as páginas antes de procurar as divisas não funciona: os nomes compridos de páginas
    // diferentes tapam os espaços vazios e as colunas somem. Por página o desenho sai limpo, e as páginas
    // repetem o mesmo desenho.
    const comLinhas = porPagina.filter((l) => l.length);
    const cortesPorPagina = comLinhas.map((linhas) => {
      const f = colunasDaPagina(linhas, opc);
      const cortes = [];
      for (let i = 1; i < f.length; i++) cortes.push((f[i - 1][1] + f[i][0]) / 2);
      return { cortes, fim: f.length ? f[f.length - 1][1] : 0, inicio: f.length ? f[0][0] : 0 };
    });
    // As divisas que aparecem na MAIORIA das páginas. Cada página sozinha tem uma divisa a mais ou a menos
    // (depende do tamanho dos valores daquela folha); o que se repete é o desenho de verdade.
    const grupos = [];
    cortesPorPagina.forEach((p) => p.cortes.forEach((x) => {
      const g = grupos.find((y) => Math.abs(y.x - x) <= (opc.folgaColuna || 4));
      if (g) { g.soma += x; g.n++; g.x = g.soma / g.n; } else grupos.push({ x, soma: x, n: 1 });
    }));
    // Basta a divisa aparecer em duas páginas: numa folha um valor comprido tapa o vazio, na outra não — e o
    // espaço existe de verdade. Com uma página só, vale o que ela mostrar.
    const minimoPaginas = comLinhas.length >= 3 ? 2 : 1;
    const divisas = grupos.filter((g) => g.n >= minimoPaginas).map((g) => g.x).sort((a, b) => a - b);
    const inicio = Math.min.apply(null, cortesPorPagina.map((p) => p.inicio).concat([0]));
    const fim = Math.max.apply(null, cortesPorPagina.map((p) => p.fim).concat([0])) + 10;
    const faixas = [];
    let de = inicio;
    divisas.forEach((x) => { faixas.push([de, x]); de = x; });
    faixas.push([de, fim]);
    const todas = [].concat.apply([], porPagina);
    const linhas = todas.map((l) => emCelulas(l, faixas));
    return { nome: opc.nome || 'PDF', paginas: total, lidas: ate, linhas, colunas: faixas.length,
      divisas: divisas.length, paginasLidas: comLinhas.length };
  }

  // O mesmo formato das planilhas: [{ nome, linhas }].
  async function abas(bytes, op) {
    const r = await ler(bytes, op);
    return { abas: [{ nome: r.nome, linhas: r.linhas }], paginas: r.paginas, lidas: r.lidas };
  }

  return { ler, abas, paginaEmCelulas, linhasDaPagina, colunasDaPagina };
});
