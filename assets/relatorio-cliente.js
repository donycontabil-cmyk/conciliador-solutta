/*
 * Conciliador Solutta — relatorio-cliente.js
 * RELATÓRIO PARA O CLIENTE (Dony, 18/09/2026: "um imprimir relatório para o cliente, desta forma aí,
 * mostrando as variações — e um lugar em que eu coloque o logo da empresa para sair no relatório").
 * Segue o desenho do "Relatório de Variações Mensais" que ele mandou: folhas A4 em pé com capa, sumário
 * executivo (cartões), faturamento e lucro bruto, evolução de cada grupo da DRE, principais resultados,
 * indicadores, maiores variações a favor e contra por conta, tributos sobre o lucro e recomendações.
 *
 * Módulo puro: recebe o relatório do motor-apresentacao.js JÁ CORTADO no mês do relatório (o trimestre do
 * LALUR vai até esse mês), o mês, a empresa (nome, logo, cor) e os textos que quem usa escreveu; devolve o
 * HTML das folhas. Gráficos em SVG feitos aqui (nada de biblioteca de fora: o site roda sozinho).
 * Os textos automáticos só contam fatos dos números (subiu, caiu, quanto); qualquer um deles pode ser
 * reescrito na prévia (editavel: true) e o que foi escrito vale no lugar do automático.
 * Valores em CENTAVOS, como no motor.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), require('./motor-apresentacao.js'));
  else raiz.RelatorioCliente = fabrica(raiz.Util, raiz.MotorApresentacao);
})(typeof self !== 'undefined' ? self : this, function (Util, Motor) {
  'use strict';

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const COR_PADRAO = '#1f4e78';
  // Grupos da DRE que ganham gráfico próprio (seção 3), na ordem da DRE; só entram os que têm valor no ano.
  const GRUPOS = ['pessoal', 'servicos', 'utilidades', 'ocupacao', 'viagens', 'logistica', 'provisoes', 'tributarias', 'gerais', 'comerciais', 'propaganda',
    'depreciacao', 'semLinha', 'despesasFinanceiras'];
  // Indicadores da tabela da seção 5.
  const INDICADORES_TABELA = ['liquidezCorrente', 'liquidezSeca', 'liquidezImediata', 'liquidezGeral', 'margemBruta', 'margemOperacional', 'margemEbitda',
    'margemLiquida', 'endividamento', 'composicao', 'roi', 'roe'];
  // Textos que valem para todos os meses (os outros são de cada mês).
  const TEXTOS_FIXOS = ['nome', 'titulo', 'subtitulo'];

  // ------------------------------------------------------------------
  // Números e textos
  // ------------------------------------------------------------------
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const decimal = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const vazio = (v) => v === null || v === undefined || !isFinite(v);
  // R$ 1.234,56 / (R$ 1.234,56)
  function rs(c) {
    if (vazio(c)) return '—';
    const n = Math.round(c);
    const t = 'R$ ' + Util.formatarCentavos(Math.abs(n));
    return n < 0 ? '(' + t + ')' : t;
  }
  // Para o texto corrido: R$ 300,8 mil · R$ 3,57 milhões · R$ 453,20 (sem sinal)
  function rsCurto(c) {
    const v = Math.abs(c) / 100;
    if (v >= 1e9) return 'R$ ' + decimal(v / 1e9, 2) + (v < 2e9 ? ' bilhão' : ' bilhões');
    if (v >= 1e6) return 'R$ ' + decimal(v / 1e6, 2) + (v < 2e6 ? ' milhão' : ' milhões');
    if (v >= 1e3) return 'R$ ' + decimal(v / 1e3, 1) + ' mil';
    return 'R$ ' + decimal(v, 2);
  }
  // Nas tabelas, cartões e leituras: com as casas e a escala escolhidas (R$ 1.235 · R$ 1.234,6 mil).
  function rsFormato(c, fmt) {
    if (vazio(c)) return '—';
    const casas = fmt && (fmt.casas === 0 || fmt.casas === 1) ? fmt.casas : 2;
    const milhar = !!(fmt && fmt.milhar);
    const v = Math.round(c) / 100 / (milhar ? 1000 : 1);
    const numero = decimal(Math.abs(v), casas);
    const t = 'R$ ' + numero + (milhar ? ' mil' : '');
    return v < 0 && numero !== decimal(0, casas) ? '(' + t + ')' : t;
  }
  const rsCurtoS = (c) => (Math.round(c) < 0 ? '−' : '') + rsCurto(c);
  // +2,2% / −16,1% / n/a
  function pctSinal(x) {
    if (vazio(x)) return 'n/a';
    const v = Math.round(x * 1000) / 10;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + decimal(Math.abs(v), 1) + '%';
  }
  function pct(x) {
    if (vazio(x)) return '—';
    const v = Math.round(x * 1000) / 10;
    return (v < 0 ? '−' : '') + decimal(Math.abs(v), 1) + '%';
  }
  const vezes = (x) => (vazio(x) ? '—' : decimal(x, 2) + 'x');
  const mesNome = (m) => MESES[m.mes - 1];
  const divide = (a, b) => (vazio(a) || vazio(b) || !b ? null : a / b);
  const variacao = (atual, antes) => (vazio(atual) || vazio(antes) ? null : { d: atual - antes, p: antes ? (atual - antes) / Math.abs(antes) : null });
  const classeVar = (d) => (vazio(d) || Math.round(d) === 0 ? 'rc-neutro' : d > 0 ? 'rc-bom' : 'rc-ruim');

  // "EMPRESA X COMERCIO LTDA" -> "EMPRESA X COMERCIO" (o cabeçalho de cada folha; dá para reescrever).
  function nomeCurto(nome) {
    const n = String(nome || '').replace(/\s+(LTDA\.?|S\/A|S\.\s?A\.?|SA|EIRELI|EPP|ME|MEI)\s*$/i, '').replace(/[\s,.-]+$/, '').trim();
    return (n || String(nome || '')).slice(0, 48);
  }

  // Cores: a da empresa e as mais claras dela (fundo das caixas).
  function rgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function misturar(hex, t) { // t = quanto de branco (0 a 1)
    const c = rgb(hex) || rgb(COR_PADRAO);
    return '#' + c.map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function corValida(hex) { return rgb(hex) ? '#' + String(hex).replace('#', '').toLowerCase() : COR_PADRAO; }

  // A cor que mais aparece num logo (pixels RGBA do canvas): ignora branco, preto, cinza e transparente;
  // clara demais para letra branca por cima, escurece. null quando o logo não tem cor.
  function corDoLogo(px) {
    const baldes = new Map();
    for (let i = 0; i + 3 < px.length; i += 8) {
      const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
      if (a < 160) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 45 || (max - min) / max < 0.35) continue;
      let h;
      if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
      const k = Math.floor(((h * 60 + 360) % 360) / 15);
      const x = baldes.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      x.n++; x.r += r; x.g += g; x.b += b;
      baldes.set(k, x);
    }
    let melhor = null;
    baldes.forEach((x) => { if (!melhor || x.n > melhor.n) melhor = x; });
    if (!melhor || melhor.n < 12) return null;
    let c = [melhor.r / melhor.n, melhor.g / melhor.n, melhor.b / melhor.n];
    const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    if (lum > 0.5) c = c.map((v) => (v * 0.5) / lum);
    return '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  }

  // ------------------------------------------------------------------
  // Gráfico de linha com área (como no modelo): meses no eixo de baixo, valores em "mil" e "mi".
  // ------------------------------------------------------------------
  function passoBonito(x) {
    if (!(x > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function rotuloEixo(v) {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    const n = (x) => Number(x.toFixed(2)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    if (a >= 1e9) return s + n(a / 1e9) + ' bi';
    if (a >= 1e6) return s + n(a / 1e6) + ' mi';
    if (a >= 1e3) return s + n(a / 1e3) + ' mil';
    return s + n(a);
  }
  // op: { rotulos, valores (centavos, null = sem balancete), cor, largura, altura, fonte }
  function grafico(op) {
    const W = op.largura || 680, H = op.altura || 200, F = op.fonte || 11;
    const esq = Math.round(F * 5.4), dir = Math.round(F * 2.6), topo = 10, base = Math.round(F * 2.2);
    const pw = W - esq - dir, ph = H - topo - base;
    const n = op.rotulos.length;
    const vals = op.valores.map((c) => (vazio(c) ? null : c / 100));
    const tem = vals.filter((v) => v !== null);
    const r1 = (x) => Math.round(x * 10) / 10;
    let s = '<svg class="rc-grafico" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-size="' + F + '">';
    if (!tem.length) return s + '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" fill="#999">Sem valores no período</text></svg>';
    let min = Math.min(0, ...tem), max = Math.max(0, ...tem);
    if (max === min) max = min + 1;
    const passo = passoBonito((max - min) / 4);
    const y0 = Math.floor(min / passo + 1e-9) * passo, y1 = Math.ceil(max / passo - 1e-9) * passo;
    const X = (i) => r1(esq + (n <= 1 ? pw / 2 : (i * pw) / (n - 1)));
    const Y = (v) => r1(topo + ((y1 - v) / (y1 - y0)) * ph);
    for (let v = y0; v <= y1 + passo / 2; v += passo) {
      const y = Y(v);
      s += '<line x1="' + esq + '" y1="' + y + '" x2="' + (W - dir) + '" y2="' + y + '" stroke="' + (Math.abs(v) < passo / 1e6 ? '#9a9a9a' : '#ececec') + '" stroke-width="1"/>' +
        '<text x="' + (esq - 7) + '" y="' + r1(y + F * 0.35) + '" text-anchor="end" fill="#444">' + rotuloEixo(Math.abs(v) < passo / 1e6 ? 0 : v) + '</text>';
    }
    op.rotulos.forEach((r, i) => {
      s += '<line x1="' + X(i) + '" y1="' + topo + '" x2="' + X(i) + '" y2="' + (topo + ph) + '" stroke="#f0e6e6" stroke-width="1"/>' +
        '<text x="' + X(i) + '" y="' + (H - Math.round(F * 0.6)) + '" text-anchor="middle" fill="#444">' + esc(r) + '</text>';
    });
    const zero = Y(Math.max(y0, Math.min(0, y1)));
    const trechos = [];
    let atual = [];
    vals.forEach((v, i) => { if (v === null) { if (atual.length) trechos.push(atual); atual = []; } else atual.push([X(i), Y(v)]); });
    if (atual.length) trechos.push(atual);
    trechos.forEach((t) => {
      if (t.length > 1) s += '<path d="M' + t[0][0] + ',' + zero + ' L' + t.map((p) => p.join(',')).join(' L') + ' L' + t[t.length - 1][0] + ',' + zero + ' Z" fill="' + op.cor + '" fill-opacity="0.08"/>';
      s += '<polyline points="' + t.map((p) => p.join(',')).join(' ') + '" fill="none" stroke="' + op.cor + '" stroke-width="' + (F / 4.2).toFixed(1) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      t.forEach((p) => { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (F / 3.2).toFixed(1) + '" fill="' + op.cor + '"/>'; });
    });
    s += '<line x1="' + esq + '" y1="' + (topo + ph) + '" x2="' + (W - dir) + '" y2="' + (topo + ph) + '" stroke="#222" stroke-width="1.4"/>';
    return s + '</svg>';
  }

  // ------------------------------------------------------------------
  // Os números do relatório
  // ------------------------------------------------------------------
  function prepararDados(rel, comp) {
    const meses = rel.meses;
    let k = comp ? meses.findIndex((m) => m.comp === comp) : -1;
    if (k < 0 || !meses[k].tem) { k = -1; meses.forEach((m, i) => { if (m.tem) k = i; }); }
    if (k < 0) return null;
    let a = -1;
    for (let i = k - 1; i >= 0; i--) if (meses[i].tem) { a = i; break; }
    const linhas = rel.dre.mensal.linhas;
    const L = (id) => linhas.find((l) => l.tipo !== 'analitica' && l.id === id) || null;
    const val = (id, i) => { const l = L(id); return l && i >= 0 && meses[i] && meses[i].tem ? (l.valores[i] || 0) : null; };
    const serie = (id) => meses.slice(0, k + 1).map((m, i) => val(id, i));
    // Contas analíticas: variação do mês (sinal do resultado: receita +, despesa −; subir = favorável).
    const contas = linhas.filter((l) => l.tipo === 'analitica').map((l) => {
      const antes = a >= 0 ? (l.valores[a] || 0) : null, agora = l.valores[k] || 0;
      return { conta: l.conta, titulo: l.rotulo, antes, agora, d: antes === null ? null : agora - antes };
    });
    const favoraveis = contas.filter((x) => x.d > 0).sort((p, q) => q.d - p.d).slice(0, 12);
    const pressoes = contas.filter((x) => x.d < 0).sort((p, q) => p.d - q.d).slice(0, 12);
    // Grupos com valor no período.
    const grupos = GRUPOS.map((id) => L(id)).filter((l) => l && serie(l.id).some((v) => v));
    // Indicadores: mês anterior e mês do relatório.
    const ind = Motor.indicadores(rel, a >= 0 ? [a, k] : [k]);
    const indicador = (id) => {
      const l = ind.linhas.find((x) => x.id === id);
      const agora = l ? l.valores[a >= 0 ? 1 : 0] : null, antes = l && a >= 0 ? l.valores[0] : null;
      return { l, agora, antes };
    };
    // Tributos sobre o lucro: contábil (grupo 5.9) × LALUR, no trimestre até o mês.
    const q = (rel.lalur.porTrimestre || []).find((x) => x.t.meses.some((m) => m.comp === meses[k].comp)) || null;
    const noTri = q ? meses.map((m, i) => i).filter((i) => i <= k && meses[i].tem && q.t.meses.some((m) => m.comp === meses[i].comp)) : [];
    const contabil = noTri.reduce((s, i) => s - (val('tributos', i) || 0), 0);
    return {
      rel, k, a, meses, mesK: meses[k], mesA: a >= 0 ? meses[a] : null, rotulos: meses.slice(0, k + 1).map((m) => m.rotulo),
      L, val, serie, contas, favoraveis, pressoes, grupos, ind, indicador,
      fiscal: { q, contabil, lalur: q ? q.total : null, meses: noTri.map((i) => meses[i]), ajustes: (rel.lalur.ajustes.linhas || []).length },
    };
  }

  // ------------------------------------------------------------------
  // Textos automáticos (só fatos dos números; quem usa reescreve na prévia)
  // ------------------------------------------------------------------
  function textosAutomaticos(D, emp) {
    const t = {};
    const nk = mesNome(D.mesK), na = D.mesA ? mesNome(D.mesA) : null;
    const v = (id) => D.val(id, D.k), va = (id) => (D.a >= 0 ? D.val(id, D.a) : null);
    t.nome = nomeCurto(emp && emp.nome);
    t.titulo = 'Relatório de Variações Mensais';
    t.subtitulo = 'Contas analíticas de resultado, gráficos por grupo da DRE, indicadores financeiros e conciliação fiscal.';
    t.escopo = (D.mesA ? 'Comparativo ' + D.mesA.rotulo + ' x ' + D.mesK.rotulo + ', acompanhado da ' : 'Resultado de ' + D.mesK.rotulo + ', com a ') +
      'evolução mensal de ' + mesNome(D.meses.find((m) => m.tem)) + ' a ' + nk + ', com foco nos vetores operacionais, patrimoniais e tributários.';
    const cresceu = (d) => (Math.round(d) > 0 ? 'cresceu ' + rsCurto(d) : Math.round(d) < 0 ? 'recuou ' + rsCurto(d) : 'ficou estável');
    const foi = (c) => (Math.round(c) < 0 ? 'foi negativo em ' + rsCurto(c) : 'foi de ' + rsCurto(c));
    const rl = v('receitaLiquida'), rlA = va('receitaLiquida'), rb = v('receitaBruta'), rbA = va('receitaBruta');
    const lb = v('lucroBruto'), lbA = va('lucroBruto'), mb = divide(lb, rl), mbA = divide(lbA, rlA);
    const ebitda = v('ebitda'), ebitdaA = va('ebitda'), lo = v('lucroOperacional'), loA = va('lucroOperacional');
    const inv = v('investimentos') || 0, lair = v('antesTributos'), ll = v('lucroLiquido'), llA = va('lucroLiquido');
    const naoOperacionalPesa = Math.abs(inv) >= 1000000 && Math.abs(inv) >= 0.1 * Math.abs(lair || 0);
    const margem = mbA !== null && mb !== null ? 'a margem bruta passou de ' + pct(mbA) + ' para ' + pct(mb) : null;

    // 1. Leitura central
    const f = [];
    const comp = (atual, antes) => { const p = divide(atual - antes, Math.abs(antes)); return p === null ? '' : Math.round(p * 1000) === 0 ? ', igual a ' + na : ', ' + decimal(Math.abs(p) * 100, 1) + '% ' + (p > 0 ? 'acima' : 'abaixo') + ' de ' + na; };
    f.push('Em ' + nk + ', a receita líquida ' + foi(rl) + (rlA ? comp(rl, rlA) : '') + '.');
    if (lbA !== null) f.push('O lucro bruto ' + cresceu(lb - lbA) + (lbA ? ' (' + pctSinal((lb - lbA) / Math.abs(lbA)) + ')' : '') + (margem ? ' e ' + margem : '') + '.');
    f.push('O EBITDA ' + foi(ebitda) + (ebitdaA ? ' (' + pctSinal((ebitda - ebitdaA) / Math.abs(ebitdaA)) + ')' : '') + ' e o lucro operacional ' + foi(lo).replace(/^foi /, '') +
      (loA ? ' (' + pctSinal((lo - loA) / Math.abs(loA)) + ')' : '') + '.');
    if (naoOperacionalPesa) f.push('O resultado não operacional ' + foi(inv) + ' no mês.');
    f.push(Math.round(ll) < 0 ? 'O mês fechou com prejuízo líquido de ' + rsCurto(ll) + '.' : 'O lucro líquido do mês foi de ' + rsCurto(ll) + (llA ? ' (' + pctSinal((ll - llA) / Math.abs(llA)) + ' sobre ' + na + ')' : '') + '.');
    t.leitura = f.join(' ');

    // Prioridades (rascunho: o que os números pedem para acompanhar)
    const fisc = D.fiscal;
    const difFiscal = fisc.lalur === null ? 0 : fisc.lalur - fisc.contabil;
    const fiscalDescasado = fisc.lalur !== null && Math.abs(difFiscal) > Math.max(100000, 0.05 * Math.abs(fisc.lalur));
    const li = D.indicador('liquidezImediata'), lc = D.indicador('liquidezCorrente'), en = D.indicador('endividamento'), pmr = D.indicador('pmr');
    const pr = [];
    if (mbA !== null && mb !== null && mb - mbA <= -0.01) pr.push('Acompanhar a margem bruta, que passou de ' + pct(mbA) + ' para ' + pct(mb) + '.');
    if (D.pressoes[0]) pr.push('Acompanhar ' + D.pressoes[0].titulo + ', que reduziu o resultado de ' + nk + ' em ' + rsCurto(D.pressoes[0].d) + ' em relação a ' + na + '.');
    if (naoOperacionalPesa) pr.push('Separar o desempenho recorrente do resultado não operacional (' + rsCurtoS(inv) + ' em ' + nk + ').');
    if (fiscalDescasado) pr.push('Conciliar a provisão contábil de IRPJ e CSLL com o LALUR.');
    if (li.agora !== null && li.antes !== null && li.agora < li.antes && li.agora < 0.2) pr.push('Acompanhar o caixa: a liquidez imediata foi de ' + vezes(li.antes) + ' para ' + vezes(li.agora) + '.');
    t.prioridades = pr.slice(0, 4);

    // 2. Faturamento e lucro bruto
    const fat = [];
    if (rbA !== null) fat.push('A receita bruta ' + cresceu(rb - rbA) + ' em ' + nk + (rbA ? ' (' + pctSinal((rb - rbA) / Math.abs(rbA)) + ')' : '') +
      (lbA !== null ? ', e o lucro bruto ' + cresceu(lb - lbA) + (lbA ? ' (' + pctSinal((lb - lbA) / Math.abs(lbA)) + ')' : '') : '') + '.');
    else fat.push('A receita bruta de ' + nk + ' ' + foi(rb) + ' e o lucro bruto ' + foi(lb).replace(/^foi /, '') + '.');
    if (margem) fat.push(margem.charAt(0).toUpperCase() + margem.slice(1) + '.');
    t.faturamento = fat.join(' ');

    // 4. Principais resultados
    const res = [];
    if (D.mesA) res.push('De ' + na + ' para ' + nk + ', o EBITDA passou de ' + rsCurtoS(ebitdaA) + ' para ' + rsCurtoS(ebitda) + ' e o lucro operacional de ' + rsCurtoS(loA) + ' para ' + rsCurtoS(lo) + '.');
    res.push('O lucro antes do IRPJ e da CSLL ' + foi(lair) + (naoOperacionalPesa ? ', com ' + rsCurtoS(inv) + ' de resultado não operacional' : '') + '.');
    t.resultados = res.join(' ');

    // 5. Indicadores
    const ccl = D.indicador('ccl'), ls = D.indicador('liquidezSeca'), co = D.indicador('composicao'), roi = D.indicador('roi'), roe = D.indicador('roe');
    const liq = [];
    if (ccl.agora !== null) liq.push('o capital circulante líquido ' + (ccl.antes !== null ? 'passou de ' + rsCurtoS(ccl.antes) + ' para ' + rsCurtoS(ccl.agora) : 'é de ' + rsCurtoS(ccl.agora)) + '.');
    const deAte = (x, fmt) => (x.antes !== null ? 'foi de ' + fmt(x.antes) + ' para ' + fmt(x.agora) : 'é de ' + fmt(x.agora));
    const partesLiq = [];
    if (lc.agora !== null) partesLiq.push('a liquidez corrente ' + deAte(lc, vezes));
    if (ls.agora !== null) partesLiq.push('a seca ' + deAte(ls, vezes).replace(/^foi /, ''));
    if (li.agora !== null) partesLiq.push('a imediata ' + deAte(li, vezes).replace(/^foi /, ''));
    let txtLiq = liq.length ? 'Liquidez: ' + liq[0] : '';
    if (partesLiq.length) {
      const frase = partesLiq.length > 1 ? partesLiq.slice(0, -1).join(', ') + ' e ' + partesLiq[partesLiq.length - 1] : partesLiq[0];
      txtLiq += (txtLiq ? ' ' : 'Liquidez: ') + frase.charAt(0).toUpperCase() + frase.slice(1) + '.';
    }
    const est = [];
    if (en.agora !== null) est.push('o endividamento sobre o ativo ' + deAte(en, pct) + (co.agora !== null ? ', com ' + pct(co.agora) + ' no curto prazo' + (co.antes !== null ? ' (' + pct(co.antes) + ' em ' + na + ')' : '') : ''));
    if (roi.agora !== null) est.push('no mês, o ROI foi de ' + pct(roi.agora) + (roe.agora !== null ? ' e o ROE de ' + pct(roe.agora) : ''));
    t.indicadores = [txtLiq, est.length ? 'Estrutura: ' + est.join('. ').replace(/\. no mês/, '. No mês') + '.' : ''].filter(Boolean).join('\n\n');

    // 6 e 7. Maiores variações
    const lista = (xs, sinal) => {
      const itens = xs.slice(0, 3).map((x) => x.titulo + ' (' + sinal + rsCurto(x.d) + ')');
      return itens.length > 1 ? itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1] : itens[0];
    };
    t.favoraveis = D.mesA ? (D.favoraveis.length ? 'Os principais vetores favoráveis foram ' + lista(D.favoraveis, '+') + '.' : 'Nenhuma conta de resultado melhorou de ' + na + ' para ' + nk + '.') : '';
    t.pressoes = D.mesA ? (D.pressoes.length ? 'As maiores pressões vieram de ' + lista(D.pressoes, '−') + '.' : 'Nenhuma conta de resultado piorou de ' + na + ' para ' + nk + '.') : '';

    // 8. Tributos sobre o lucro
    if (fisc.lalur === null) t.fiscal = 'Sem apuração do LALUR para o trimestre de ' + nk + '.';
    else {
      const periodo = fisc.q.t.rotulo.replace(/\s*\(parcial\)/, '') + (fisc.meses.length < 3 ? ' (até ' + nk + ')' : '');
      const marcadas = fisc.ajustes ? '' : ' O LALUR ainda não tem adições nem exclusões marcadas.';
      t.fiscal = fiscalDescasado
        ? 'No ' + periodo + ', as contas contábeis de IRPJ e CSLL somaram ' + rs(fisc.contabil) + ', enquanto o LALUR estima IRPJ + CSLL líquido após PAT de ' + rs(fisc.lalur) +
          '. A diferença de ' + rs(Math.abs(difFiscal)) + ' deve ser conciliada antes do fechamento.' + marcadas
        : 'No ' + periodo + ', as contas contábeis de IRPJ e CSLL (' + rs(fisc.contabil) + ') estão alinhadas com a estimativa do LALUR de IRPJ + CSLL líquido após PAT (' + rs(fisc.lalur) + ').' + marcadas;
    }

    // Recomendações (rascunho: as situações que os números mostram)
    const rec = [];
    if (naoOperacionalPesa) rec.push({ titulo: 'Segregar recorrência', texto: 'Acompanhar EBITDA e lucro operacional separados do resultado não operacional.' });
    if (mbA !== null && mb !== null && mb - mbA <= -0.01) rec.push({ titulo: 'Revisar margem comercial', texto: 'Detalhar o custo das mercadorias, as bonificações e os tributos sobre vendas.' });
    if (fiscalDescasado) rec.push({ titulo: 'Conciliar IRPJ e CSLL', texto: 'Confrontar a DRE contábil, o LALUR, as provisões e os recolhimentos.' });
    if (lc.agora !== null && lc.agora >= 1 && li.agora !== null && li.agora < 0.2) rec.push({ titulo: 'Acompanhar o caixa', texto: 'A folga de liquidez está em recebíveis, estoques e créditos, e não em caixa.' });
    if (en.agora !== null && en.antes !== null && en.agora - en.antes >= 0.02) rec.push({ titulo: 'Acompanhar o endividamento', texto: 'O endividamento sobre o ativo passou de ' + pct(en.antes) + ' para ' + pct(en.agora) + '.' });
    if (pmr.agora !== null && pmr.antes !== null && pmr.agora - pmr.antes >= 5) rec.push({ titulo: 'Acompanhar o prazo de recebimento', texto: 'O prazo médio de recebimento passou de ' + Math.round(pmr.antes) + ' para ' + Math.round(pmr.agora) + ' dias.' });
    t.recomendacoes = rec.slice(0, 5);

    t.criterios = 'Contas de resultado comparadas pelo movimento do mês. Variação favorável significa aumento de receita ou redução de despesa; percentuais sobre base zero não são calculados. ' +
      'Indicadores patrimoniais pelo saldo do fim do mês; PL* = ativo total − passivo circulante − passivo não circulante (inclui o resultado do ano ainda não encerrado). ' +
      'A análise é gerencial e não substitui documentação fiscal, jurídica ou tributária.';
    return t;
  }

  // ------------------------------------------------------------------
  // HTML das folhas
  // ------------------------------------------------------------------
  function montar(op) {
    const D = prepararDados(op.rel, op.comp);
    if (!D) return { html: '<p>Sem balancete para montar o relatório.</p>', paginas: 0, auto: {}, dados: null };
    const emp = op.emp || {};
    const auto = textosAutomaticos(D, emp);
    const dados = op.textos || {};
    const T = {};
    Object.keys(auto).forEach((c) => { T[c] = dados[c] !== undefined && dados[c] !== null ? dados[c] : auto[c]; });
    const ed = !!op.editavel;
    const rsV = (c) => rsFormato(c, op.formato);
    const fmtNota = op.formato && (op.formato.milhar || op.formato.casas === 0 || op.formato.casas === 1)
      ? 'Valores em ' + (op.formato.milhar ? 'R$ mil' : 'R$') + (op.formato.casas === 0 ? ', arredondados' : op.formato.casas === 1 ? ', com uma casa decimal' : '') : '';
    const cor = corValida(op.cor);
    const logo = emp.logo ? '<img class="rc-logo" src="' + esc(emp.logo) + '" alt="">' : '';
    const nk = mesNome(D.mesK), na = D.mesA ? mesNome(D.mesA) : null;

    // Pedacinhos editáveis.
    const texto = (campo, tag, classe) => '<' + tag + ' class="' + (classe || '') + ' rc-texto' + (ed ? ' rc-edita' : '') + '"' +
      (ed ? ' contenteditable="plaintext-only" spellcheck="true" data-texto="' + campo + '" title="Clique para reescrever"' : '') + '>' + esc(T[campo]) + '</' + tag + '>';
    const bolinhas = (campo) => {
      const itens = (T[campo] || []).filter((x) => String(x).trim() || ed);
      if (!itens.length && !ed) return '';
      return '<ul class="rc-bolinhas">' + itens.map((x, i) => '<li><span class="rc-texto' + (ed ? ' rc-edita' : '') + '"' +
        (ed ? ' contenteditable="plaintext-only" data-lista="' + campo + '" data-i="' + i + '"' : '') + '>' + esc(x) + '</span>' +
        (ed ? ' <button type="button" class="rc-so-tela rc-tirar" data-rc-tirar="' + campo + '" data-i="' + i + '" title="Tirar este item">✕</button>' : '') + '</li>').join('') + '</ul>' +
        (ed ? '<button type="button" class="rc-so-tela rc-mais" data-rc-mais="' + campo + '">+ Acrescentar item</button>' : '');
    };
    const recomendacoes = () => {
      const itens = T.recomendacoes || [];
      if (!itens.length && !ed) return '';
      const parte = (x, i, qual, cls) => '<span class="' + cls + ' rc-texto' + (ed ? ' rc-edita' : '') + '"' + (ed ? ' contenteditable="plaintext-only" data-lista="recomendacoes" data-i="' + i + '" data-parte="' + qual + '"' : '') + '>' + esc(x[qual] || '') + '</span>';
      return '<h3 class="rc-h3">Recomendações objetivas</h3><ul class="rc-bolinhas rc-recomendacoes">' + itens.map((x, i) => '<li>' + parte(x, i, 'titulo', 'rc-rec-titulo') +
        (ed ? ' <button type="button" class="rc-so-tela rc-tirar" data-rc-tirar="recomendacoes" data-i="' + i + '" title="Tirar esta recomendação">✕</button>' : '') +
        '<br>' + parte(x, i, 'texto', 'rc-rec-texto') + '</li>').join('') + '</ul>' +
        (ed ? '<button type="button" class="rc-so-tela rc-mais" data-rc-mais="recomendacoes">+ Acrescentar recomendação</button>' : '');
    };

    const paginas = [];
    let secao = 0;
    const cabecalho = (titulo) => '<div class="rc-topo-faixa"></div><header class="rc-cab"><div><div class="rc-cab-empresa">' + texto('nome', 'span', 'rc-nome') +
      ' | ANÁLISE GERENCIAL</div><h2>' + esc(titulo) + '</h2></div>' + logo + '</header>';
    const pagina = (titulo, corpo) => paginas.push('<section class="rc-pagina">' + cabecalho(titulo) + '<div class="rc-corpo">' + corpo + '</div><div class="rc-numero">Página {{N}} de {{T}}</div></section>');
    const leitura = (id) => {
      const agora = D.val(id, D.k), antes = D.a >= 0 ? D.val(id, D.a) : null;
      const vv = variacao(agora, antes);
      return '<p class="rc-leitura">Leitura: ' + (D.mesA ? na + ' ' + rsV(antes) + '; ' : '') + nk + ' ' + rsV(agora) + '.' +
        (vv ? ' Variação ' + rsV(vv.d) + ' (' + (vv.p === null ? 'n/a' : pctSinal(vv.p)) + ').' : '') + '</p>';
    };
    const graficoDe = (id, titulo, tamanho) => {
      const serie = D.serie(id);
      const despesa = serie.every((x) => x === null || x <= 0) && serie.some((x) => x);
      return '<div class="rc-grafico-caixa"><div class="rc-grafico-titulo">' + esc(titulo) + '</div>' +
        grafico(Object.assign({ rotulos: tamanho && tamanho.curtos ? D.rotulos.map((r) => r.slice(0, 3)) : D.rotulos, valores: despesa ? serie.map((x) => (x === null ? null : -x)) : serie, cor }, tamanho || {})) + '</div>';
    };

    // Capa
    paginas.push('<section class="rc-pagina rc-capa"><div class="rc-capa-faixa"></div><div class="rc-capa-topo"><div class="rc-sobre">ANÁLISE GERENCIAL</div>' +
      (emp.logo ? '<img class="rc-capa-logo" src="' + esc(emp.logo) + '" alt="">' : '') + '</div>' + texto('titulo', 'h1', 'rc-capa-titulo') + texto('subtitulo', 'p', 'rc-capa-sub') +
      '<div class="rc-empurra"></div><div class="rc-caixa rc-capa-escopo"><div class="rc-caixa-titulo">Escopo</div>' + texto('escopo', 'div', '') + '</div>' +
      '<div class="rc-capa-base"><div><b>' + esc(emp.nome || '') + '</b>' + (emp.cnpj ? ' · CNPJ ' + esc(Util.formatarCnpj(emp.cnpj)) : '') + '</div>' +
      '<div>Base: DRE CPC 51 detalhada, balancete e LALUR' + (fmtNota ? ' · ' + fmtNota : '') + '</div><div>Emissão: ' + esc(op.emissao || '') + '</div></div><div class="rc-numero">Página {{N}} de {{T}}</div></section>');

    // 1. Sumário executivo
    const cartao = (id, rotulo) => {
      const agora = D.val(id, D.k), antes = D.a >= 0 ? D.val(id, D.a) : null, vv = variacao(agora, antes);
      return '<div class="rc-cartao"><span>' + esc(rotulo) + '</span><b>' + rsV(agora) + '</b>' +
        (vv ? '<small class="' + classeVar(vv.d) + '">' + rsV(vv.d) + ' | ' + (vv.p === null ? 'n/a' : pctSinal(vv.p)) + '</small>' : '<small class="rc-neutro">sem mês anterior</small>') + '</div>';
    };
    secao++;
    pagina(secao + '. Sumário executivo', '<div class="rc-cartoes">' + cartao('receitaBruta', 'Receita bruta de vendas') + cartao('receitaLiquida', 'Receita líquida') +
      cartao('lucroBruto', 'Lucro bruto') + cartao('ebitda', 'EBITDA gerencial') + cartao('lucroOperacional', 'Lucro ou prejuízo operacional') +
      cartao('lucroLiquido', 'Lucro ou prejuízo líquido do período') + '</div>' +
      '<div class="rc-caixa"><div class="rc-caixa-titulo">Leitura central</div>' + texto('leitura', 'div', '') + '</div>' +
      ((T.prioridades || []).length || ed ? '<h3 class="rc-h3">Prioridades gerenciais</h3>' + bolinhas('prioridades') : ''));

    // 2. Faturamento e lucro bruto
    secao++;
    pagina(secao + '. Faturamento e lucro bruto', graficoDe('receitaBruta', 'Receita bruta de vendas') + leitura('receitaBruta') +
      '<div class="rc-espaco"></div>' + graficoDe('lucroBruto', 'Lucro bruto') + leitura('lucroBruto') +
      '<div class="rc-empurra"></div><div class="rc-caixa">' + texto('faturamento', 'div', '') + '</div>');

    // 3. Evolução dos grupos da DRE (dois por folha)
    secao++;
    const nGrupo = secao;
    for (let i = 0; i < D.grupos.length; i += 2) {
      pagina(nGrupo + '. Evolução dos grupos da DRE', D.grupos.slice(i, i + 2).map((g, j) => {
        const nome = g.rotulo.replace(/^\(-\)\s*/, '');
        return (j ? '<div class="rc-espaco"></div>' : '') + '<h3 class="rc-sub">' + nGrupo + '.' + (i + j + 1) + '. ' + esc(nome.charAt(0).toUpperCase() + nome.slice(1)) + '</h3>' +
          graficoDe(g.id, g.rotulo) + leitura(g.id);
      }).join(''));
    }

    // 4. Principais resultados (quatro gráficos)
    secao++;
    const pequeno = { largura: 340, altura: 250, fonte: 12, curtos: D.rotulos.length > 5 };
    pagina(secao + '. Evolução mensal dos principais resultados', '<div class="rc-grade4">' + graficoDe('receitaLiquida', 'Receita líquida', pequeno) +
      graficoDe('ebitda', 'EBITDA gerencial', pequeno) + graficoDe('lucroOperacional', 'Lucro ou prejuízo operacional', pequeno) +
      graficoDe('antesTributos', 'Lucro antes do IRPJ e da CSLL', pequeno) + '</div><div class="rc-empurra"></div><div class="rc-caixa">' + texto('resultados', 'div', '') + '</div>');

    // 5. Indicadores
    secao++;
    const linhaInd = (id) => {
      const x = D.indicador(id);
      if (!x.l) return '';
      const fmt = x.l.tipo === 'x' ? vezes : x.l.tipo === '%' ? pct : x.l.tipo === 'dias' ? (y) => (vazio(y) ? '—' : Math.round(y) + ' dias') : rsV;
      const d = x.agora === null || x.antes === null ? null : x.agora - x.antes;
      const limite = x.l.tipo === 'x' ? 0.005 : x.l.tipo === '%' ? 0.0005 : x.l.tipo === 'dias' ? 0.5 : 100;
      const dTxt = d === null ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '') + (x.l.tipo === 'x' ? decimal(Math.abs(d), 2) + 'x' : x.l.tipo === '%' ? decimal(Math.abs(d) * 100, 1) + ' p.p.' : x.l.tipo === 'dias' ? Math.round(Math.abs(d)) + ' dias' : rsV(Math.abs(d)));
      const bom = d === null || Math.abs(d) < limite ? null : (d > 0) === (x.l.melhor === 'maior');
      return '<tr><td><b>' + esc(x.l.rotulo) + '</b></td>' + (D.mesA ? '<td class="num">' + fmt(x.antes) + '</td>' : '') + '<td class="num">' + fmt(x.agora) + '</td><td class="num">' + dTxt + '</td>' +
        '<td class="rc-centro"><b class="' + (bom === null ? 'rc-neutro' : bom ? 'rc-bom' : 'rc-ruim') + '">' + (d === null ? '—' : bom === null ? 'Estável' : bom ? 'Melhora' : 'Piora') + '</b></td></tr>';
    };
    pagina(secao + '. Indicadores financeiros e patrimoniais', '<table class="rc-tabela rc-tabela-ind"><thead><tr><th>Índice</th>' + (D.mesA ? '<th class="num">' + esc(D.mesA.rotulo) + '</th>' : '') +
      '<th class="num">' + esc(D.mesK.rotulo) + '</th><th class="num">Variação</th><th class="rc-centro">Leitura</th></tr></thead><tbody>' + INDICADORES_TABELA.map(linhaInd).join('') + '</tbody></table>' +
      '<p class="rc-nota">PL* = ativo total − passivo circulante − passivo não circulante. Balanço pelo saldo do fim do mês; resultado pelo movimento do mês.</p>' +
      '<div class="rc-empurra"></div><div class="rc-caixa">' + texto('indicadores', 'div', '') + '</div>');

    // 6 e 7. Maiores variações por conta
    const tabelaContas = (xs) => '<table class="rc-tabela rc-tabela-contas"><thead><tr><th>Conta</th><th>Descrição</th>' + (D.mesA ? '<th class="num">' + esc(D.mesA.rotulo) + '</th>' : '') +
      '<th class="num">' + esc(D.mesK.rotulo) + '</th><th class="num">Variação</th></tr></thead><tbody>' +
      (xs.length ? xs.map((x) => '<tr><td>' + esc(x.conta) + '</td><td>' + esc(x.titulo) + '</td>' + (D.mesA ? '<td class="num">' + rsV(x.antes) + '</td>' : '') + '<td class="num">' + rsV(x.agora) + '</td>' +
        '<td class="num"><b class="' + classeVar(x.d) + '">' + rsV(x.d) + '</b></td></tr>').join('') : '<tr><td colspan="5" class="rc-neutro">Nenhuma conta nesta situação.</td></tr>') + '</tbody></table>';
    if (D.mesA) {
      secao++;
      pagina(secao + '. Maiores variações favoráveis por conta', tabelaContas(D.favoraveis) + '<div class="rc-empurra"></div><div class="rc-caixa">' + texto('favoraveis', 'div', '') + '</div>');
      secao++;
      pagina(secao + '. Maiores pressões sobre o resultado', tabelaContas(D.pressoes) + '<div class="rc-empurra"></div><div class="rc-caixa">' + texto('pressoes', 'div', '') + '</div>');
    }

    // 8. Tributos sobre o lucro e recomendações
    secao++;
    pagina(secao + '. Tributos sobre o lucro e recomendações', '<div class="rc-caixa"><div class="rc-caixa-titulo">Ponto de atenção fiscal</div>' + texto('fiscal', 'div', '') + '</div>' +
      recomendacoes() + '<div class="rc-empurra"></div><div class="rc-caixa rc-caixa-cinza"><div class="rc-h4">Critérios e limitações</div>' + texto('criterios', 'div', 'rc-pequeno') +
      '<div class="rc-fonte">Fonte: balancetes de ' + esc(D.meses.find((m) => m.tem).rotulo) + ' a ' + esc(D.mesK.rotulo) + ' · Conciliador Solutta</div></div>');

    const total = paginas.length;
    const html = '<div class="rc" style="--rc-cor:' + cor + ';--rc-clara:' + misturar(cor, 0.9) + ';--rc-media:' + misturar(cor, 0.75) + '">' +
      paginas.map((p, i) => p.replace('{{N}}', String(i + 1)).replace('{{T}}', String(total))).join('') + '</div>';
    return { html, paginas: total, auto, textos: T, dados: D };
  }

  return { montar, textosAutomaticos, prepararDados, grafico, corDoLogo, nomeCurto, misturar, TEXTOS_FIXOS, GRUPOS, INDICADORES_TABELA, COR_PADRAO };
});
