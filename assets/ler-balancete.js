/*
 * Conciliador Solutta — ler-balancete.js
 * Balancete mensal, a base do RELATÓRIO DE APRESENTAÇÃO (Dony, 18/09/2026: "um relatório de
 * apresentação dentro da empresa, com um lugar para importar os balancetes").
 *
 * Cada sistema contábil exporta o balancete de um jeito (Dony, 18/09/2026: "várias empresas com vários
 * tipos de balancete; o sistema tem que entender um plano de contas básico — conta, débito, crédito — e,
 * se não entender, eu indico as colunas no primeiro e ele guarda"). A leitura:
 *  1. MAPA (opcoes.mapa): as colunas indicadas por quem usa (guardadas na empresa);
 *  2. CABEÇALHO: as colunas achadas pelo título, com muitos nomes (Conta/Classificação/Código,
 *     Descrição/Título/Nome, Saldo anterior/inicial, Débito(s), Crédito(s), Saldo atual/final, D/C,
 *     "Saldo em 31/12/2025"), também com o cabeçalho em duas linhas ("Saldo | Movimento" em cima e
 *     "Anterior | Débito | Crédito | Atual" embaixo);
 *  3. CONTEÚDO (opcoes.inferir): sem cabeçalho conhecido, acha a coluna do código da conta, a do nome e
 *     as de valores, e escolhe as quatro de valores em que SALDO ANTERIOR + DÉBITOS − CRÉDITOS = SALDO
 *     ATUAL na maior parte das contas (é essa conta que diz que é um balancete).
 * Valores: número, "1.234,56", "(1.234,56)", "1.234,56-", "-1.234,56", "1.234,56 D"/"C" ou uma coluna D/C
 * ao lado do saldo. Saldo sem sinal nenhum: o lado de cada conta sai da própria conta (anterior + débitos
 * − créditos = atual). Saldo com sinal PELA NATUREZA da conta (positivo no lado normal dela, negativo no
 * contrário): ver acertarNatureza. Código: "1.1.01.001", "1-1-01-001", "1.1.01.001 - CAIXA" (código e nome na mesma
 * célula) ou sem pontos ("11101001"): a hierarquia sai das contas do próprio balancete (a mãe é o maior
 * código que é o começo dele) e o código ganha os pontos ("1.1.1.01.001").
 *
 * Saída (VALORES EM CENTAVOS; saldos no sentido débito − crédito: devedor +, credor −):
 * { tipo: 'balancete', empresa, cnpj, periodo: { de, ate }, competencia, variosMeses,
 *   contas: [{ conta, reduzido, titulo, nivel, pai, analitica, saldoAnterior, debitos, creditos, saldoAtual }],
 *   total: { debitos, creditos } | null, confere, avisos, linhasIgnoradas,
 *   qualidade (fração das contas em que anterior + débitos − créditos = atual), como ('mapa' | 'cabecalho' | 'conteudo'),
 *   mapa: { aba, colunas } (as colunas usadas, para guardar e usar de novo) }
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerBalancete = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const CAMPOS = ['conta', 'titulo', 'saldoAnterior', 'debitos', 'creditos', 'saldoAtual'];
  const OPCIONAIS = ['reduzido', 'dcAnterior', 'dcAtual'];
  const OBRIGATORIOS_MAPA = ['conta', 'saldoAnterior', 'debitos', 'creditos', 'saldoAtual'];
  const vazio = (v) => v === null || v === undefined || String(v).trim() === '';
  function chaveTitulo(v) {
    return Util.semAcento(v === null || v === undefined ? '' : String(v)).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  // O que um título de coluna pode ser (a chave é o título sem acento, espaço nem pontuação).
  function campoDoTitulo(k) {
    if (!k) return null;
    if (/^(dc|dcs|natureza|nat|sinal|debcred|dc\d)$/.test(k) || /(saldo|anterior|inicial|atual|final|ant)dc$/.test(k)) return 'dc';
    if (/^(red|reduzido|reduzida|codreduzido|contareduzida|codigoreduzido|codred|reduz|codigored|creduzido)$/.test(k)) return 'reduzido';
    if (/^(contacontabil|conta|classificacao|classificacaocontabil|classif|codigodaconta|contaclassificacao|codconta|contacodigo|numerodaconta|numeroconta|nconta|mascara|estrutura|codigocontabil|contas)$/.test(k)) return 'conta';
    if (/^(codigo|cod|codig)$/.test(k)) return 'codigo';
    if (/^(titulodaconta|titulo|descricaodaconta|descricao|descricaoconta|nomedaconta|nome|nomeconta|denominacao|especificacao|discriminacao|contadescricao|historicodaconta|contanome|nomedacontacontabil|descricaodacontacontabil)$/.test(k)) return 'titulo';
    if (/^saldoem/.test(k)) return 'saldoEm';
    if ((/anterior|inicial|abertura/.test(k) || /^(saldoant|sldant|sdoant|sdant|salant|ant|saldoini|sldini)$/.test(k)) && !/debit|credit/.test(k)) return 'saldoAnterior';
    if (/debit|^debs?$/.test(k)) return 'debitos';
    if (/credit|^creds?$/.test(k)) return 'creditos';
    if (/atual|final|encerramento|fim$|^saldos?$|^sld$/.test(k)) return 'saldoAtual';
    return null;
  }

  function mapearCabecalho(celulas) {
    const m = {};
    const saldoEm = [], dcs = [], codigos = [], contas = [];
    const chaves = (celulas || []).map(chaveTitulo);
    chaves.forEach((k, i) => {
      const campo = campoDoTitulo(k);
      if (!campo) return;
      if (campo === 'dc') dcs.push(i);
      else if (campo === 'saldoEm') saldoEm.push(i);
      else if (campo === 'codigo') codigos.push(i);
      else if (campo === 'conta') contas.push(i);
      else if (m[campo] === undefined) m[campo] = i;
    });
    // "Conta" e "Classificação" juntas (21/09/2026, o balancete do sistema do escritório: "Conta | Classificação |
    // Nome da conta contábil"): a Classificação é a conta (com os pontos, a árvore) e a outra é o reduzido.
    if (contas.length) {
      const classificacao = contas.find((i) => /^classifica/.test(chaves[i]));
      m.conta = classificacao !== undefined ? classificacao : contas[0];
      const outra = contas.find((i) => i !== m.conta);
      if (outra !== undefined && m.reduzido === undefined) m.reduzido = outra;
    }
    // "Código" é a conta quando não há outra coluna de conta; havendo (ex.: "Classificação"), é o reduzido.
    codigos.forEach((i) => { if (m.conta === undefined) m.conta = i; else if (m.reduzido === undefined) m.reduzido = i; });
    // "Saldo em 31/12/2025" e "Saldo em 31/01/2026": o primeiro é o anterior, o último o atual.
    if (saldoEm.length >= 2) {
      if (m.saldoAnterior === undefined) m.saldoAnterior = saldoEm[0];
      if (m.saldoAtual === undefined) m.saldoAtual = saldoEm[saldoEm.length - 1];
    } else if (saldoEm.length === 1 && m.saldoAtual === undefined) m.saldoAtual = saldoEm[0];
    // Coluna D/C logo depois de um saldo: é o lado dele.
    dcs.forEach((i) => {
      if (m.saldoAnterior !== undefined && i === m.saldoAnterior + 1) m.dcAnterior = i;
      else if (m.saldoAtual !== undefined && i === m.saldoAtual + 1) m.dcAtual = i;
    });
    m.temHistorico = chaves.indexOf('historico') >= 0;
    // Coluna de mês/competência = base com vários meses (ex.: a "Base_Normalizada" da planilha de
    // apresentação), não o balancete de um mês.
    m.temMes = chaves.some((c) => /^(mes|competencia|periodo|mesano|anomes)$/.test(c));
    return m;
  }
  const completo = (m) => CAMPOS.every((k) => m[k] !== undefined);

  // Duas linhas de cabeçalho numa só ("Saldo" + "Anterior"); preencher = o título de cima vale para as
  // colunas vazias à direita dele (célula mesclada).
  function juntar(a, b, preencher) {
    const n = Math.max((a || []).length, (b || []).length);
    const out = [];
    let ultimo = '';
    for (let i = 0; i < n; i++) {
      let cima = a && !vazio(a[i]) ? String(a[i]) : '';
      if (preencher) { if (cima) ultimo = cima; else if (b && !vazio(b[i])) cima = ultimo; }
      const baixo = b && !vazio(b[i]) ? String(b[i]) : '';
      out.push((cima + ' ' + baixo).trim());
    }
    return out;
  }

  // Código da conta numa célula: "1.1.01.001", "1-1-01-001", "11101001", "1.1.01.001 - CAIXA".
  function lerCodigo(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < 1e15 ? { codigo: String(v), resto: '' } : null;
    const s = String(v).replace(/\s+/g, ' ').trim();
    const m = s.match(/^(\d+(?:[.-]\d+)*)(?:\s*[-–—:]\s*|\s+)(\S.*)$/) || s.match(/^(\d+(?:[.-]\d+)*)\.?$/);
    if (!m) return null;
    return { codigo: m[1].replace(/-/g, '.'), resto: (m[2] || '').trim() };
  }
  // Célula de D/C ao lado de um valor: "D", "C" ou "-" (valor zero, sem lado).
  const ehMarca = (v) => !vazio(v) && /^[DC\-–—]$/i.test(String(v).trim());
  // Valor em centavos e o lado escrito na própria célula ("1.234,56 D" / "C"). null = não é número.
  function lerValor(v) {
    if (vazio(v) || /^[-–—]$/.test(String(v).trim())) return { centavos: 0, vazio: true, lado: null };
    const n = Util.paraNumero(v);
    if (n === null) return null;
    const s = typeof v === 'number' ? '' : String(v).trim().toUpperCase();
    return { centavos: Util.centavos(n), lado: /D$/.test(s) ? 1 : /C$/.test(s) ? -1 : null };
  }
  function ladoCelula(v) {
    const s = vazio(v) ? '' : String(v).trim().toUpperCase();
    return s === 'D' ? 1 : s === 'C' ? -1 : null;
  }

  function acharCabecalho(abas) {
    for (let a = 0; a < abas.length; a++) {
      const linhas = abas[a].linhas || [];
      for (let r = 0; r < Math.min(30, linhas.length); r++) {
        const tentativas = [{ celulas: linhas[r], altura: 1 }];
        if (linhas[r + 1]) tentativas.push({ celulas: juntar(linhas[r], linhas[r + 1], false), altura: 2 }, { celulas: juntar(linhas[r], linhas[r + 1], true), altura: 2 });
        for (const t of tentativas) {
          const m = mapearCabecalho(t.celulas);
          if (m.temHistorico || m.temMes || !completo(m)) continue;
          // Duas colunas de código: a conta é a que tem a árvore (os pontos) no conteúdo; a outra, o reduzido.
          if (m.reduzido !== undefined) {
            const pontos = (i) => linhas.slice(r + t.altura, r + t.altura + 200).filter((l) => { const c = l && lerCodigo(l[i]); return c && c.codigo.indexOf('.') > 0; }).length;
            if (pontos(m.reduzido) > pontos(m.conta)) { const x = m.conta; m.conta = m.reduzido; m.reduzido = x; }
          }
          // Conta repetida em muitas linhas também é tabela de vários meses (ou relatório de outro tipo).
          const codigos = linhas.slice(r + t.altura).map((l) => { const c = l && lerCodigo(l[m.conta]); return c ? c.codigo : ''; }).filter(Boolean);
          if (codigos.length && new Set(codigos).size < codigos.length * 0.9) continue;
          return { aba: a, linha: r, altura: t.altura, mapa: m };
        }
      }
    }
    return null;
  }

  // Cabeçalho torto (Dony, 18/09/2026, balancete de outro cliente: o título "Débito período" em cima da
  // coluna do D/C do saldo anterior e o número do débito na coluna do lado): cada campo de valor vai para a
  // coluna de números mais perto (a própria, a da direita ou a da esquerda) e a coluna de D/C colada no
  // saldo vira o lado dele.
  function alinhar(linhas, inicio, m) {
    const amostra = linhas.slice(inicio, inicio + 500).filter((l) => l && lerCodigo(l[m.conta]));
    if (!amostra.length) return m;
    const perfil = new Map();
    const de = (i) => {
      if (perfil.has(i)) return perfil.get(i);
      let cheia = 0, num = 0, marca = 0, lado = 0;
      amostra.forEach((l) => { const v = l[i]; if (vazio(v)) return; cheia++; if (ehMarca(v)) { marca++; if (ladoCelula(v)) lado++; } else if (Util.paraNumero(v) !== null) num++; });
      const p = { numerica: cheia > 0 && num >= cheia * 0.7, marcas: cheia > 0 && lado > 0 && marca >= cheia * 0.8 };
      perfil.set(i, p);
      return p;
    };
    const out = Object.assign({}, m);
    const usadas = () => new Set(['conta', 'titulo', 'reduzido', 'saldoAnterior', 'debitos', 'creditos', 'saldoAtual'].map((k) => out[k]).filter((i) => i !== undefined));
    ['saldoAnterior', 'debitos', 'creditos', 'saldoAtual'].forEach((k) => {
      const i = out[k];
      if (i === undefined || de(i).numerica) return;
      const livres = usadas();
      if (de(i + 1).numerica && !livres.has(i + 1)) out[k] = i + 1;
      else if (i > 0 && de(i - 1).numerica && !livres.has(i - 1)) out[k] = i - 1;
    });
    if (out.dcAnterior === undefined && out.saldoAnterior !== undefined && de(out.saldoAnterior + 1).marcas) out.dcAnterior = out.saldoAnterior + 1;
    if (out.dcAtual === undefined && out.saldoAtual !== undefined && de(out.saldoAtual + 1).marcas) out.dcAtual = out.saldoAtual + 1;
    return out;
  }

  function reconhecer(abas) {
    const cab = acharCabecalho(abas);
    return cab ? { tipo: 'balancete', cabecalho: cab,
      motivo: 'Este arquivo é um BALANCETE: conta por conta, com saldo anterior, débitos, créditos e saldo atual.' } : null;
  }

  // ------------------------------------------------------------------
  // Leitura pelo CONTEÚDO: a coluna do código, a do nome e as quatro de valores que fecham a conta.
  // ------------------------------------------------------------------
  // Fração das linhas com movimento em que anterior + débitos − créditos = atual (saldo sem sinal: vale o
  // lado que fechar).
  function fechamento(A, D, C, F, dcA, dcF) {
    const assinado = !!(dcA || dcF) || A.some((x) => x.centavos < 0 || x.lado) || F.some((x) => x.centavos < 0 || x.lado);
    let comMov = 0, fecham = 0;
    for (let k = 0; k < A.length; k++) {
      const d = Math.abs(D[k].centavos), c = Math.abs(C[k].centavos);
      if (!d && !c) continue;
      comMov++;
      let a = A[k].centavos, f = F[k].centavos;
      if (dcA && dcA[k]) a = Math.abs(a) * dcA[k];
      if (dcF && dcF[k]) f = Math.abs(f) * dcF[k];
      if (assinado) { if (Math.abs(a + d - c - f) <= 1) fecham++; } else if ([[1, 1], [-1, -1], [1, -1], [-1, 1]].some(([sa, sf]) => Math.abs(sa * a + d - c - sf * f) <= 1)) fecham++;
    }
    return comMov >= 3 ? fecham / comMov : 0;
  }
  function inferir(abas) {
    let melhor = null;
    abas.forEach((aba, ia) => {
      const linhas = aba.linhas || [];
      const uteis = [];
      linhas.forEach((l, r) => { if (l && l.filter((c) => !vazio(c)).length >= 3) uteis.push(r); });
      if (uteis.length < 5) return;
      const nCols = Math.min(60, uteis.reduce((m, r) => Math.max(m, linhas[r].length), 0));
      // 1) O código da conta: a coluna com mais códigos diferentes, de preferência em árvore (um é o começo do outro).
      let colConta = -1, notaConta = 0;
      for (let i = 0; i < nCols; i++) {
        const cods = [];
        uteis.forEach((r) => { const c = lerCodigo(linhas[r][i]); if (c) cods.push(c.codigo); });
        if (cods.length < 5 || cods.length < uteis.length * 0.4) continue;
        const conj = new Set(cods);
        if (conj.size < cods.length * 0.9) continue;
        const comMae = cods.filter((c) => { const p = c.lastIndexOf('.'); if (p > 0 && conj.has(c.slice(0, p))) return true; for (let n = c.length - 1; n >= 1; n--) if (conj.has(c.slice(0, n))) return true; return false; }).length;
        const comPonto = cods.filter((c) => c.indexOf('.') >= 0).length;
        const nota = cods.length * (1 + comMae / cods.length + (comPonto > cods.length / 2 ? 0.5 : 0));
        if (nota > notaConta) { notaConta = nota; colConta = i; }
      }
      if (colConta < 0) return;
      const comConta = uteis.filter((r) => lerCodigo(linhas[r][colConta]));
      // 2) O nome: a coluna com mais texto com letras (pode não haver: nome junto do código).
      let colTitulo, notaTitulo = 0;
      for (let i = 0; i < nCols; i++) {
        if (i === colConta) continue;
        const n = comConta.filter((r) => { const v = linhas[r][i]; return typeof v === 'string' && /[a-z]{2}/i.test(v) && Util.paraNumero(v) === null; }).length;
        if (n > notaTitulo) { notaTitulo = n; colTitulo = i; }
      }
      if (notaTitulo < comConta.length * 0.5) colTitulo = undefined;
      // 3) As colunas de valor e as de D/C — só à direita do código, como em todo balancete. Sem essa regra
      // a conta também fecha lida de trás para frente (atual + créditos − débitos = anterior) quando as
      // colunas estão fora de ordem, e a leitura sairia errada sem ninguém ver.
      const nums = [], dcs = [];
      for (let i = colConta + 1; i < nCols; i++) {
        if (i === colTitulo) continue;
        let cheias = 0, numeros = 0, marcas = 0, ladosDC = 0, inteiros = 0;
        const distintos = new Set();
        comConta.forEach((r) => {
          const v = linhas[r][i];
          if (vazio(v)) return;
          cheias++;
          if (ehMarca(v)) { marcas++; if (ladoCelula(v)) ladosDC++; return; }
          const n = Util.paraNumero(v);
          if (n !== null) { numeros++; distintos.add(n); if (Number.isInteger(n)) inteiros++; }
        });
        // Coluna de D/C: "D", "C" e "-" (zero), com pelo menos um D ou C.
        if (ladosDC && marcas >= cheias * 0.8) { dcs.push(i); continue; }
        if (numeros < comConta.length * 0.3 || numeros < cheias * 0.7) continue;
        if (inteiros === numeros && numeros >= 10 && distintos.size >= numeros * 0.95) continue; // código reduzido, não valor
        nums.push(i);
      }
      if (nums.length < 4) return;
      // 4) As quatro que fecham a conta (débito e crédito nas duas ordens).
      const valores = new Map(nums.map((i) => [i, comConta.map((r) => lerValor(linhas[r][i]) || { centavos: 0 })]));
      const dcDe = (i) => (dcs.indexOf(i + 1) >= 0 ? comConta.map((r) => ladoCelula(linhas[r][i + 1])) : null);
      let aqui = null;
      for (let a = 0; a < nums.length; a++) {
        for (let b = a + 1; b < nums.length; b++) {
          for (let c = b + 1; c < nums.length; c++) {
            for (let d = c + 1; d < nums.length; d++) {
              [[nums[b], nums[c]], [nums[c], nums[b]]].forEach(([deb, cred]) => {
                const q = fechamento(valores.get(nums[a]), valores.get(deb), valores.get(cred), valores.get(nums[d]), dcDe(nums[a]), dcDe(nums[d]));
                const largura = nums[d] - nums[a];
                if (!aqui || q > aqui.q + 1e-9 || (Math.abs(q - aqui.q) <= 1e-9 && largura < aqui.largura)) {
                  aqui = { q, largura, colunas: { saldoAnterior: nums[a], debitos: deb, creditos: cred, saldoAtual: nums[d] } };
                }
              });
            }
          }
        }
      }
      if (!aqui || aqui.q < 0.6) return;
      const colunas = Object.assign({ conta: colConta }, colTitulo !== undefined ? { titulo: colTitulo } : {}, aqui.colunas);
      if (dcs.indexOf(colunas.saldoAnterior + 1) >= 0) colunas.dcAnterior = colunas.saldoAnterior + 1;
      if (dcs.indexOf(colunas.saldoAtual + 1) >= 0) colunas.dcAtual = colunas.saldoAtual + 1;
      const nota = aqui.q * comConta.length;
      if (!melhor || nota > melhor.nota) melhor = { nota, escolha: { aba: ia, colunas, inicio: 0, como: 'conteudo' } };
    });
    return melhor ? melhor.escolha : null;
  }

  function doMapa(abas, mapa) {
    if (!mapa || !mapa.colunas) return null;
    const c = mapa.colunas;
    if (!OBRIGATORIOS_MAPA.every((k) => Number.isInteger(c[k]) && c[k] >= 0)) return null;
    const colunas = {};
    CAMPOS.concat(OPCIONAIS).forEach((k) => { if (Number.isInteger(c[k]) && c[k] >= 0) colunas[k] = c[k]; });
    return { aba: Number.isInteger(mapa.aba) && abas[mapa.aba] ? mapa.aba : 0, colunas, inicio: 0, como: 'mapa' };
  }

  const MESES_LONGOS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // Empresa, CNPJ e período escritos acima das contas. Também no desenho em que o rótulo fica numa célula e
  // o valor na seguinte ("Empresa | NOME DA EMPRESA", "CNPJ: | 00.000…", "Ano: | 2026") e o mês vem por extenso
  // ("Balancete - Julho").
  function topo(linhas, ate) {
    const r = { empresa: '', cnpj: '', periodo: null };
    let mesExtenso = 0, ano = 0;
    for (let i = 0; i < ate; i++) {
      const celulas = (linhas[i] || []).map((c) => (c === null || c === undefined ? '' : String(c).replace(/\s+/g, ' ').trim()));
      const seguinte = (k) => { for (let j = k + 1; j < celulas.length; j++) if (celulas[j]) return celulas[j]; return ''; };
      celulas.forEach((t, k) => {
        if (!t) return;
        const s = Util.semAcento(t).toLowerCase().replace(/[:.]+$/, '').trim();
        if (/^c\.?n\.?p\.?j\.?(\s*\(mf\))?$/.test(s)) { const d = Util.soDigitos(seguinte(k)); if (d.length === 14 && !r.cnpj) r.cnpj = d; }
        if (/^(empresa|razao social|nome da empresa|razao ou conjunto de razoes|estabelecimento|filial)$/.test(s) && !r.empresa) r.empresa = seguinte(k);
        if (/^(ano|exercicio)$/.test(s)) { const a = Number(seguinte(k)); if (a >= 2000 && a <= 2100) ano = a; }
        const m = MESES_LONGOS.indexOf(s);
        if (m >= 0) mesExtenso = m + 1;
        // Mês em inglês abreviado, como o Oracle escreve o período contábil: "Aug-26", "Aug-2026" (Dony,
        // 24/09/2026, o balancete do Centerlar: sem isso a competência só saía do nome do arquivo).
        const mEn = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/. ]\s*(\d{2}|\d{4})$/);
        if (mEn) {
          mesExtenso = MESES_EN.indexOf(mEn[1]) + 1;
          const a = Number(mEn[2]);
          ano = a < 100 ? 2000 + a : a;
        }
        const mAno = s.match(/^(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(?:\/|de)?\s*(20\d{2})$/);
        if (mAno) { mesExtenso = MESES_LONGOS.indexOf(mAno[1]) + 1; ano = Number(mAno[2]); }
      });
      for (const t of celulas) {
        if (!t) continue;
        const s = Util.semAcento(t);
        const per = s.match(/periodo\s*:?\s*(?:de\s*)?(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:a|ate|-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
          s.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:a|ate|-)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (per) { const de = Util.lerData(per[1]), ateD = Util.lerData(per[2]); if (de && ateD) r.periodo = { de: de.texto, ate: ateD.texto }; continue; }
        const cnpj = s.match(/cnpj\s*:?\s*([\d./-]{14,18})/i);
        if (cnpj) { r.cnpj = Util.soDigitos(cnpj[1]); continue; }
        const rotulo = s.toLowerCase().replace(/[:.]+$/, '').trim();
        const ehRotulo = /^(empresa|razao social|nome da empresa|ano|exercicio|pag|pagina|folha|data|cnpj|c\.?n\.?p\.?j\.?(\s*\(mf\))?)$/.test(rotulo) || MESES_LONGOS.indexOf(rotulo) >= 0;
        // O que é cabeçalho do relatório não é o nome da empresa ("Data do Relatório", "Parâmetros do
        // Relatório", "Moeda do Razão"…): senão o programa mostra o rótulo no lugar do nome do cliente.
        const ehCabecalhoDoRelatorio = /emissao|pagina|folha|balancete|periodo|data:|data do relatorio|relatorio de|parametros|moeda|tipo de (moeda|valor|saldo)|segmento|consolidado por|razao ou conjunto|conta natural/i.test(s);
        if (!r.empresa && !ehRotulo && !ehCabecalhoDoRelatorio && /[a-z]{3}/i.test(s)) r.empresa = t;
      }
    }
    // Mês por extenso + ano ("Balancete - Julho" … "Ano: 2026"): o mês inteiro.
    if (!r.periodo && mesExtenso && ano) {
      const comp = ano + '-' + String(mesExtenso).padStart(2, '0') + '-01';
      r.periodo = { de: Util.inicioDaCompetencia(comp).texto, ate: Util.fimDaCompetencia(comp).texto };
    }
    return r;
  }

  // Códigos sem pontos ("11101001"): a mãe é o maior código do balancete que é o começo dele.
  function pontuar(contas) {
    if (contas.filter((c) => c.conta.indexOf('.') < 0).length < contas.length * 0.8) return false;
    const conj = new Set(contas.map((c) => c.conta));
    const novo = new Map();
    contas.map((c) => c.conta).sort((a, b) => a.length - b.length || a.localeCompare(b)).forEach((c) => {
      let mae = null;
      for (let n = c.length - 1; n >= 1; n--) { const p = c.slice(0, n); if (conj.has(p)) { mae = p; break; } }
      novo.set(c, mae ? novo.get(mae) + '.' + c.slice(mae.length) : c);
    });
    const mudou = contas.some((c) => novo.get(c.conta) !== c.conta);
    contas.forEach((c) => { c.conta = novo.get(c.conta); });
    return mudou;
  }

  // A árvore (c.pai e c.nivel). Três jeitos de código:
  //  - com pontos ("1.1.01.001"): a mãe é o código sem o último pedaço;
  //  - sem pontos ("1101001"): a mãe é o maior código do balancete que é o começo dele (ganha os pontos);
  //  - máscara com número sequencial no fim ("1.1.1.01.00005", todos com o mesmo número de pedaços e a
  //    mãe "1.1.1.01" não existe como conta): o caminho é o código sem o último pedaço e sem os pedaços
  //    zerados do fim ("1.1.0.00.00002" -> "1.1"); a primeira conta de cada caminho é a sintética dele, e
  //    as seguintes com o mesmo caminho são as filhas (analíticas). A conta continua com o código do arquivo.
  function montarArvore(contas) {
    if (!contas.length) return 'vazia';
    if (pontuar(contas)) { porPontos(contas); return 'sem-pontos'; }
    const conj = new Set(contas.map((c) => c.conta));
    const comPonto = contas.filter((c) => c.conta.indexOf('.') > 0);
    const comMae = comPonto.filter((c) => conj.has(c.conta.slice(0, c.conta.lastIndexOf('.')))).length;
    if (comPonto.length && comMae >= comPonto.length * 0.3) { porPontos(contas); return 'pontos'; }
    // A mãe não existe como conta (máscara com número sequencial no fim, ou código sem árvore): pelo RECUO do
    // nome (o sistema imprime cada nível mais para dentro) e pela máscara; fica o que faz mais contas-mãe
    // baterem com a soma das filhas (o recuo ganha no empate: é o jeito que o próprio sistema mostra).
    const candidatas = [];
    const recuo = arvorePeloRecuo(contas);
    if (recuo) candidatas.push({ jeito: 'recuo', arvore: recuo });
    const mascara = arvorePelaMascara(contas);
    if (mascara) candidatas.push({ jeito: 'mascara', arvore: mascara });
    if (!candidatas.length) { contas.forEach((c) => { c.nivel = 1; c.pai = ''; }); return 'plana'; }
    candidatas.forEach((x) => { x.erradas = maesQueNaoBatem(contas, x.arvore); });
    candidatas.sort((a, b) => a.erradas - b.erradas);
    const escolhida = candidatas[0];
    contas.forEach((c, i) => { c.pai = escolhida.arvore[i].pai; c.nivel = escolhida.arvore[i].nivel; });
    return escolhida.jeito;
  }
  // Pelo recuo do nome (espaços no começo): os recuos diferentes, em ordem, são os níveis; a mãe é a
  // última conta do nível de cima. Só vale com pelo menos dois recuos diferentes.
  function arvorePeloRecuo(contas) {
    const recuos = Array.from(new Set(contas.map((c) => c.recuo || 0))).sort((a, b) => a - b);
    if (recuos.length < 2) return null;
    const nivelDe = new Map(recuos.map((r, i) => [r, i + 1]));
    const pilha = [];
    return contas.map((c) => {
      const nivel = nivelDe.get(c.recuo || 0);
      pilha.length = nivel - 1;
      let mae = null;
      for (let n = nivel - 2; n >= 0 && !mae; n--) mae = pilha[n] || null;
      pilha[nivel - 1] = c;
      return { nivel: mae ? nivel : 1, pai: mae ? mae.conta : '' };
    });
  }
  // Pela máscara ("1.1.1.01.00005", todos com o mesmo número de pedaços): o caminho é o código sem o último
  // pedaço e sem os pedaços zerados do fim; a primeira conta de cada caminho é a sintética dele.
  function arvorePelaMascara(contas) {
    const nSeg = contas[0].conta.split('.').length;
    if (nSeg < 3 || !contas.every((c) => c.conta.split('.').length === nSeg)) return null;
    const noDoCaminho = new Map();
    const arvore = [];
    contas.forEach((c, i) => {
      const seg = c.conta.split('.').slice(0, -1);
      while (seg.length > 1 && /^0+$/.test(seg[seg.length - 1])) seg.pop();
      const caminho = seg.join('.');
      const no = noDoCaminho.get(caminho);
      if (no) { arvore[i] = { pai: no.c.conta, nivel: no.nivel + 1 }; return; }
      let mae = null;
      for (let n = seg.length - 1; n >= 1 && !mae; n--) mae = noDoCaminho.get(seg.slice(0, n).join('.')) || null;
      arvore[i] = { pai: mae ? mae.c.conta : '', nivel: mae ? mae.nivel + 1 : 1 };
      noDoCaminho.set(caminho, { c, nivel: arvore[i].nivel });
    });
    return arvore;
  }
  function maesQueNaoBatem(contas, arvore) {
    const somas = new Map();
    contas.forEach((c, i) => { const p = arvore[i].pai; if (p) somas.set(p, (somas.get(p) || 0) + c.saldoAtual); });
    return contas.filter((c) => somas.has(c.conta) && Math.abs(somas.get(c.conta) - c.saldoAtual) > 1).length;
  }
  function porPontos(contas) {
    contas.forEach((c) => { const partes = c.conta.split('.'); c.nivel = partes.length; c.pai = partes.length > 1 ? partes.slice(0, -1).join('.') : ''; });
  }

  // Saldo sem sinal nem D/C: o lado de cada saldo é o que fecha a conta (anterior + débitos − créditos =
  // atual); sem como decidir (sem movimento), fica o lado da conta-mãe, senão o da maioria do grupo.
  function acertarSinais(contas) {
    const decididas = new Map();
    const indecisas = [];
    contas.forEach((c) => {
      const a = c.saldoAnterior, f = c.saldoAtual, mov = c.debitos - c.creditos;
      const pares = [];
      [[1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([sa, sf]) => {
        if (Math.abs(sa * a + mov - sf * f) > 1) return;
        const par = [sa * a, sf * f];
        if (!pares.some((p) => p[0] === par[0] && p[1] === par[1])) pares.push(par);
      });
      if (pares.length === 1) { c.saldoAnterior = pares[0][0]; c.saldoAtual = pares[0][1]; decididas.set(c.conta, Math.sign(pares[0][1] || pares[0][0]) || 1); } else indecisas.push(c);
    });
    const grupo = {};
    decididas.forEach((s, conta) => { const g = conta.split('.')[0]; grupo[g] = (grupo[g] || 0) + s; });
    indecisas.forEach((c) => {
      let lado = null;
      for (let p = c.conta; p.indexOf('.') > 0 && lado === null;) { p = p.slice(0, p.lastIndexOf('.')); if (decididas.has(p)) lado = decididas.get(p); }
      if (lado === null) lado = (grupo[c.conta.split('.')[0]] || 1) >= 0 ? 1 : -1;
      c.saldoAnterior *= lado;
      c.saldoAtual *= lado;
    });
  }

  // Saldo com sinal, mas PELA NATUREZA da conta (21/09/2026, o balancete do sistema do escritório): o positivo é
  // o lado normal dela (devedor no ativo e nas despesas, credor no passivo, no PL e nas receitas) e o negativo,
  // entre parênteses, o lado contrário ("(-) Depreciação acumulada (11.107.692,43)" no ativo; prejuízo acumulado
  // no PL). Aí "anterior + débitos − créditos = atual" só fecha nas contas devedoras; nas credoras fecha
  // "anterior − débitos + créditos = atual". Cada conta com movimento fica com o jeito que fecha; a sem movimento
  // (ou com débito = crédito), com o da conta-mãe; sem nenhuma decidida acima, com o da maioria da classe.
  // Só entra quando o jeito devedor − credor deixa muitas contas sem fechar e este fecha quase todas.
  function acertarNatureza(contas) {
    const fechaDC = (c) => Math.abs(c.saldoAnterior + c.debitos - c.creditos - c.saldoAtual) <= 1;
    const fechaCD = (c) => Math.abs(c.saldoAnterior - c.debitos + c.creditos - c.saldoAtual) <= 1;
    const comMov = contas.filter((c) => c.debitos !== c.creditos);
    if (comMov.length < 3) return false;
    const dc = comMov.filter(fechaDC).length;
    const algum = comMov.filter((c) => fechaDC(c) || fechaCD(c)).length;
    if (dc >= comMov.length * 0.9 || algum < comMov.length * 0.9) return false;
    const natureza = new Map();
    comMov.forEach((c) => { const a = fechaDC(c), b = fechaCD(c); if (a !== b) natureza.set(c.conta, a ? 1 : -1); });
    const porConta = new Map(contas.map((c) => [c.conta, c]));
    const classe = {};
    natureza.forEach((s, conta) => { const k = conta.split('.')[0]; classe[k] = (classe[k] || 0) + s; });
    contas.forEach((c) => {
      let s = natureza.get(c.conta);
      for (let p = porConta.get(c.pai); s === undefined && p; p = porConta.get(p.pai)) s = natureza.get(p.conta);
      if (s === undefined) s = (classe[c.conta.split('.')[0]] || 1) >= 0 ? 1 : -1;
      if (s < 0) { c.saldoAnterior = -c.saldoAnterior; c.saldoAtual = -c.saldoAtual; }
    });
    return true;
  }

  function montar(abas, escolha, opcoes) {
    const linhas = (abas[escolha.aba] || {}).linhas || [];
    const col = escolha.colunas;
    const texto = (l, i) => (i === undefined || i === null || l[i] === null || l[i] === undefined ? '' : String(l[i]).replace(/\s+/g, ' ').trim());
    const contas = [];
    const vistas = new Set();
    let total = null, linhasIgnoradas = 0, repetidas = 0, comLado = 0, negativos = 0, primeiraConta = -1;
    for (let r = escolha.inicio || 0; r < linhas.length; r++) {
      const l = linhas[r];
      if (!l || !l.some((c) => !vazio(c))) continue;
      const cod = lerCodigo(l[col.conta]);
      const tit = texto(l, col.titulo);
      // Resumo no fim, com o valor ao lado do rótulo ("Total de débitos | 36.350.651,68" e "Total de créditos | …").
      const rotulo = Util.semAcento(texto(l, l.findIndex((c) => !vazio(c)))).toLowerCase().replace(/[^a-z]+/g, '');
      if (/^totalde(debitos|creditos)$/.test(rotulo)) {
        const n = l.map((c) => (typeof c === 'string' && /[a-z]/i.test(c) ? null : lerValor(c))).find((x) => x && !x.vazio);
        if (n) { total = total || { debitos: null, creditos: null }; total[/debitos$/.test(rotulo) ? 'debitos' : 'creditos'] = Math.abs(n.centavos); }
        continue;
      }
      if (/^total/i.test(Util.semAcento(texto(l, col.conta))) || (!cod && /^total/i.test(Util.semAcento(tit)))) {
        const d = lerValor(l[col.debitos]), c = lerValor(l[col.creditos]);
        if (d && c && !(d.vazio && c.vazio)) total = { debitos: Math.abs(d.centavos), creditos: Math.abs(c.centavos) };
        continue;
      }
      if (!cod) { linhasIgnoradas++; continue; }
      const va = lerValor(l[col.saldoAnterior]), vd = lerValor(l[col.debitos]), vc = lerValor(l[col.creditos]), vf = lerValor(l[col.saldoAtual]);
      if (!va || !vd || !vc || !vf) { linhasIgnoradas++; continue; } // valor que não é número: não é linha de conta
      if (escolha.como === 'conteudo' && va.vazio && vd.vazio && vc.vazio && vf.vazio) { linhasIgnoradas++; continue; }
      if (vistas.has(cod.codigo)) { repetidas++; continue; } // cabeçalho de página repetido ou conta em dobro
      vistas.add(cod.codigo);
      if (primeiraConta < 0) primeiraConta = r;
      let sa = va.centavos, sf = vf.centavos;
      const la = ladoCelula(col.dcAnterior === undefined ? null : l[col.dcAnterior]), lf = ladoCelula(col.dcAtual === undefined ? null : l[col.dcAtual]);
      if (la) sa = Math.abs(sa) * la;
      if (lf) sf = Math.abs(sf) * lf;
      if (la || lf || va.lado || vf.lado) comLado++;
      if (sa < 0 || sf < 0) negativos++;
      // Recuo do nome (espaços no começo): em alguns sistemas é o que diz o nível da conta.
      const brutoNome = col.titulo !== undefined && typeof l[col.titulo] === 'string' ? l[col.titulo] : typeof l[col.conta] === 'string' ? l[col.conta] : '';
      contas.push({ conta: cod.codigo, reduzido: texto(l, col.reduzido), titulo: tit || cod.resto, nivel: 1, pai: '', analitica: true,
        saldoAnterior: sa, debitos: Math.abs(vd.centavos), creditos: Math.abs(vc.centavos), saldoAtual: sf, recuo: brutoNome.match(/^\s*/)[0].length });
    }
    const avisos = [];
    // A árvore das contas (mãe e nível): pelos pontos do código, pelo começo do código (sem pontos) ou pela
    // máscara com número sequencial no fim.
    const arvore = montarArvore(contas);
    contas.forEach((c) => { delete c.recuo; });
    if (arvore === 'sem-pontos') avisos.push('Os códigos das contas vieram sem pontos: a hierarquia saiu das próprias contas do balancete (a conta-mãe é o maior código que é o começo da filha).');
    if (arvore === 'plana') avisos.push('Não deu para montar a árvore das contas pelo código (todas ficaram no 1º nível).');
    // Saldo sem sinal nenhum (nem D/C): o lado sai da própria conta.
    const semSinal = !comLado && !negativos && contas.some((c) => c.saldoAnterior || c.saldoAtual);
    if (semSinal) {
      acertarSinais(contas);
      avisos.push('Os saldos vieram sem sinal nem D/C: o lado (devedor ou credor) de cada conta saiu da própria conta (saldo anterior + débitos − créditos = saldo atual).');
    } else if (!comLado && acertarNatureza(contas)) {
      avisos.push('Os saldos vieram pela natureza da conta (positivo no lado normal dela, negativo entre parênteses no lado contrário): o programa guardou devedor positivo e credor negativo.');
    }
    // Analítica = conta sem filha no balancete.
    const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
    contas.forEach((c) => { c.analitica = !pais.has(c.conta); });

    // Conferências: cada conta (anterior + débitos − créditos = atual), as de 1º nível com o Total Geral,
    // o balancete fechado (soma dos saldos de 1º nível = zero) e cada conta-mãe = soma das filhas.
    const erradas = contas.filter((c) => Math.abs(c.saldoAnterior + c.debitos - c.creditos - c.saldoAtual) > 1);
    if (erradas.length) avisos.push(erradas.length + ' conta(s) em que saldo anterior + débitos − créditos não dá o saldo atual (ex.: ' + erradas[0].conta + ').');
    const primeiras = contas.filter((c) => c.nivel === 1);
    const soma = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
    let confere = !erradas.length;
    if (total) {
      if ((total.debitos !== null && soma(primeiras, 'debitos') !== total.debitos) || (total.creditos !== null && soma(primeiras, 'creditos') !== total.creditos)) {
        confere = false;
        avisos.push('Os débitos e créditos das contas de 1º nível não batem com o Total Geral do arquivo.');
      }
    }
    if (primeiras.length && soma(primeiras, 'saldoAtual') !== 0) {
      avisos.push('A soma dos saldos das contas de 1º nível não dá zero (' + Util.formatarCentavos(soma(primeiras, 'saldoAtual')) + '): confira se o balancete está completo.');
    }
    const filhas = new Map();
    contas.forEach((c) => { if (c.pai) { if (!filhas.has(c.pai)) filhas.set(c.pai, []); filhas.get(c.pai).push(c); } });
    const maesErradas = contas.filter((c) => filhas.has(c.conta) && soma(filhas.get(c.conta), 'saldoAtual') !== c.saldoAtual);
    if (maesErradas.length) avisos.push(maesErradas.length + ' conta(s) sintética(s) com saldo diferente da soma das filhas (ex.: ' + maesErradas[0].conta + ').');
    if (repetidas) avisos.push(repetidas + ' linha(s) de conta repetida ignorada(s).');
    if (!contas.length) { confere = false; avisos.push('Não achei nenhuma conta neste balancete.'); }
    const qualidade = contas.length ? (contas.length - erradas.length) / contas.length : 0;
    if (escolha.como === 'conteudo') avisos.push('As colunas foram achadas pelo conteúdo (o cabeçalho do arquivo não tem os nomes conhecidos).');

    const info = topo(linhas, escolha.linhaCabecalho !== undefined ? escolha.linhaCabecalho : Math.max(0, primeiraConta));
    // Empresa e período podem estar NUMA ABA SÓ DE PARÂMETROS, longe das contas (Dony, 24/09/2026, o balancete
    // do Centerlar: a aba 1 traz "Período Contábil: Aug-26" e a aba 2, só as contas). Sem isso, a competência
    // vinha só do nome do arquivo — e sumia se o arquivo fosse renomeado.
    if (!info.periodo || !info.empresa) {
      for (const outra of abas || []) {
        if (!outra || outra === abas[escolha.aba] || !(outra.linhas || []).length) continue;
        const t = topo(outra.linhas, Math.min(outra.linhas.length, 40));
        if (!info.periodo && t.periodo) info.periodo = t.periodo;
        if (!info.empresa && t.empresa) info.empresa = t.empresa;
        if (!info.cnpj && t.cnpj) info.cnpj = t.cnpj;
        if (info.periodo && info.empresa) break;
      }
    }
    let periodo = info.periodo;
    if (!periodo && opcoes && opcoes.nomeArquivo) {
      // Sem período no conteúdo: tenta o mês pelo nome ("Balancete_07_2026", "jan_26").
      const comp = competenciaPeloNome(opcoes.nomeArquivo);
      if (comp) { const ini = Util.inicioDaCompetencia(comp), fim = Util.fimDaCompetencia(comp); periodo = { de: ini.texto, ate: fim.texto, peloNome: true }; }
    }
    const de = periodo && Util.lerData(periodo.de), ate = periodo && Util.lerData(periodo.ate);
    const variosMeses = !!(de && ate && (de.mes !== ate.mes || de.ano !== ate.ano));
    if (variosMeses) avisos.push('O período do balancete vai de ' + periodo.de + ' a ' + periodo.ate + ': o relatório espera um balancete por mês (débitos e créditos do mês).');
    const usadas = {};
    CAMPOS.concat(OPCIONAIS).forEach((k) => { if (Number.isInteger(col[k])) usadas[k] = col[k]; });
    return {
      tipo: 'balancete', empresa: info.empresa, cnpj: info.cnpj, periodo, competencia: ate ? Util.competenciaDe(ate) : null, variosMeses,
      contas, total, confere, avisos, linhasIgnoradas, qualidade, como: escolha.como, mapa: { aba: escolha.aba, colunas: usadas },
    };
  }

  // Lê o balancete: com o mapa indicado (só ele); senão pelo cabeçalho; e, com opcoes.inferir, pelo
  // conteúdo quando o cabeçalho não fecha a conta. Fica a leitura com mais contas que fecham.
  function ler(abas, opcoes) {
    const op = opcoes || {};
    if (op.mapa) {
      const e = doMapa(abas, op.mapa);
      if (!e) throw new Error('As colunas indicadas não servem para este arquivo (faltam conta, saldo anterior, débitos, créditos ou saldo atual).');
      return montar(abas, e, op);
    }
    const leituras = [];
    const cab = acharCabecalho(abas);
    if (cab) {
      const inicio = cab.linha + cab.altura;
      const colunas = alinhar(abas[cab.aba].linhas || [], inicio, cab.mapa);
      leituras.push(montar(abas, { aba: cab.aba, inicio, linhaCabecalho: cab.linha, colunas, como: 'cabecalho' }, op));
    }
    if (op.inferir && !leituras.some((x) => x.qualidade >= 0.9 && x.contas.length >= 3)) {
      const inf = inferir(abas);
      if (inf) leituras.push(montar(abas, inf, op));
    }
    if (!leituras.length) throw new Error('Não achei o cabeçalho de um balancete (Conta, Título, Saldo anterior, Débitos, Créditos, Saldo atual).');
    leituras.sort((a, b) => b.qualidade * b.contas.length - a.qualidade * a.contas.length);
    return leituras[0];
  }

  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // "Balancete_07_2026" / "07.2026" / "jan_26" / "janeiro 2026" -> 'AAAA-MM-01'.
  function competenciaPeloNome(nome) {
    const s = Util.semAcento(String(nome || '')).toLowerCase();
    let m = s.match(/(?:^|[^\d])(0[1-9]|1[0-2])[.\-_ /]?(20\d{2})(?!\d)/); // "07_2026", "07.2026", "072026"
    if (m) return m[2] + '-' + m[1] + '-01';
    m = s.match(/(?:^|[^a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[.\-_ /]*(20\d{2}|\d{2})(?!\d)/);
    if (m) { const ano = m[2].length === 2 ? '20' + m[2] : m[2]; return ano + '-' + String(MESES_CURTOS.indexOf(m[1]) + 1).padStart(2, '0') + '-01'; }
    return null;
  }

  // Nomes de coluna conhecidos (para quem quiser mostrar; a leitura usa campoDoTitulo).
  const SINONIMOS = {
    conta: ['Conta', 'Conta Contábil', 'Classificação', 'Código'], reduzido: ['Red.', 'Reduzido', 'Código (com Classificação ao lado)'],
    titulo: ['Título', 'Descrição', 'Nome da conta'], saldoAnterior: ['Saldo anterior', 'Saldo inicial', 'Saldo ant.', 'Saldo em (1ª data)'],
    debitos: ['Débito', 'Débitos', 'Movimento débito'], creditos: ['Crédito', 'Créditos', 'Movimento crédito'],
    saldoAtual: ['Saldo atual', 'Saldo final', 'Saldo', 'Saldo em (2ª data)'], dc: ['D/C', 'Natureza (ao lado do saldo)'],
  };

  return { reconhecer, ler, inferir, lerCodigo, lerValor, campoDoTitulo, competenciaPeloNome, SINONIMOS, CAMPOS };
});
