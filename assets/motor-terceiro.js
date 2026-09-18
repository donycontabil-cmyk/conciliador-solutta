/*
 * Conciliador Solutta — motor-terceiro.js
 * Passo ③ — Fornecedores × contas a pagar do financeiro, no modelo "aging" (pedido do Dony,
 * 14/09/2026, cliente Univale):
 *   aging ANTERIOR (mês passado) + movimento do RAZÃO do mês = saldo esperado (a contabilidade);
 *   e o que sobra tem que bater com o aging DO MÊS, fornecedor por fornecedor.
 * O que não bate aparece para conciliar à MÃO (juntar nomes que a régua não juntou).
 *
 * Motor puro: recebe dados, devolve dados. Usa a MESMA régua de nomes do ① (motor-nomes),
 * com os dois agings como cadastro (nome + CNPJ ensinam).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), require('./motor-nomes.js'));
  else raiz.MotorTerceiro = fabrica(raiz.Util, raiz.MotorNomes);
})(typeof self !== 'undefined' ? self : this, function (Util, MotorNomes) {
  'use strict';

  const SEM = MotorNomes.SEM_FORNECEDOR;

  // Fornecedor de um histórico da Univale: vem depois da última vírgula, ou depois de
  // "<número>-" quando não há vírgula (ex.: "CONF. NF: 9673273-ALELO S.A"). Um CPF colado
  // no fim ("... 07659855867") é tirado. Confirmado com o Dony (14/09/2026).
  function fornecedorDoHistorico(historico) {
    let s = String(historico || '').trim();
    let n;
    if (s.indexOf(',') >= 0) n = s.slice(s.lastIndexOf(',') + 1);
    else { const m = s.match(/\d[\d.\/]*\s*-\s*(.+)$/); n = m ? m[1] : s; }
    return n.replace(/\s+\d{6,}$/, '').trim();
  }

  // Número da nota/documento: depois de "NF:" ou "REF." (ignora "compensação top NNNN": o
  // número da nota é o que vem a seguir — Dony, 14/09/2026).
  function documentoDoHistorico(historico) {
    const s = Util.semAcento(String(historico || '')).toUpperCase();
    const m = s.match(/(?:NF:?|REF\.?)\s*0*([0-9]{1,})/);
    return m ? m[1] : '';
  }

  function chaveDoTitulo(t) {
    if (t.cnpj && Util.cnpjValido(t.cnpj)) return 'cnpj:' + Util.cnpjMatriz(t.cnpj);
    const p = MotorNomes.palavrasProprias(MotorNomes.limparNome(t.nome));
    return p.length ? 'nome:' + p.join(' ') : 'nome:' + Util.normalizarNome(t.nome);
  }

  // Sentido do razão pela NATUREZA da conta (Dony, 15/09/2026: o ② Adiantamento × financeiro é
  // "exatamente igual" ao ③, só que a conta é do ATIVO):
  //  - fornecedores (passivo): a nota é CRÉDITO (aumenta o a pagar) e a baixa é DÉBITO;
  //  - adiantamento a fornecedores (ativo): o adiantamento é DÉBITO e a compensação é CRÉDITO.
  // O resto (Parte A, Parte B, regras, IDs) é o mesmo: "nota" e "baixa" são só os papéis de quem
  // aumenta e de quem diminui o saldo.
  function ladosDoRazao(natureza, l) {
    const adiantamento = natureza === 'adiantamento';
    return { aumento: adiantamento ? (l.debito || 0) : (l.credito || 0), reducao: adiantamento ? (l.credito || 0) : (l.debito || 0) };
  }

  // Débito ou crédito de um valor da conciliação A × B (Dony, 16/09/2026: "coloca a natureza do
  // lançamento, débito ou crédito; só pelo sinal me atrapalha"). O valor + é o lado que AUMENTA o
  // saldo da conta — crédito em fornecedores (passivo), débito em adiantamento (ativo) — e o − é o
  // outro lado. Vale para lançamento, título e saldo. Zero não tem lado ('').
  function ladoDC(valor, natureza) {
    const v = Number(valor) || 0;
    if (!v) return '';
    return (v > 0) === (natureza === 'adiantamento') ? 'D' : 'C';
  }

  // Documento comparável dos dois lados: só os dígitos, sem zeros à esquerda ("011719" = "11719").
  function normalizarDocumento(s) {
    return String(s === null || s === undefined ? '' : s).replace(/\D+/g, '').replace(/^0+/, '');
  }

  // Documento de uma linha do razão (medido num razão real, 14/09/2026):
  //  1) o número depois de "NF:" ou "REF." (nota e baixa: "CONF. NF: 011719", "BAIXA PGTO. REF. 2458");
  //  2) na baixa por compensação, o número que vem DEPOIS do código da operação: em
  //     "BAIXA POR COMPENSAÇÃO NA TOP 1703 81" a nota é a 81 (1703 é a operação; a coluna
  //     Núm. Documento traz o número da compensação, que não existe no aging) — regra do Dony;
  //  3) senão, a coluna Núm. Documento ("DESPESAS COM 072026", "RENEGOCIAÇÃO ... 062026").
  // Quando o leitor já tirou a nota do histórico (razão por contrapartida, 16/09/2026: "Compra cfe
  // 52919516 de …", "PAGAMENTO DOC 158467/1 DE …"), vale a dele (l.nota).
  function documentoDaLinha(l) {
    if (l.nota) return normalizarDocumento(l.nota);
    const h = documentoDoHistorico(l.historico);
    if (h) return normalizarDocumento(h);
    const top = Util.semAcento(String(l.historico || '')).toUpperCase().match(/COMPENSACAO\s+NA\s+TOP\s+\d+\s+0*(\d+)/);
    if (top) return normalizarDocumento(top[1]);
    return normalizarDocumento(l.documento);
  }

  // ------------------------------------------------------------------
  // Conciliar A × B pelo DOCUMENTO (pedido do Dony, 14/09/2026): "um botão de conciliar, que
  // quando eu apertar ele acha tudo e já marca tudo que está conciliado" — casando pelo
  // documento, que nesse relatório está dos dois lados, e não pelo nome do fornecedor. Cada
  // conciliação ganha um ID sequencial (1, 2, 3…): A com A é um ID, A com B é outro.
  //   Parte A (contabilidade) = títulos do aging do mês passado (+) e linhas do razão do mês
  //   (nota = crédito, +; baixa = débito, −). Parte B (financeiro) = títulos do aging do mês.
  // Camadas, da mais segura para a mais larga (a simples primeiro, para não gastar nota numa
  // combinação — Parte 7.11):
  //   1. doc-fornecedor-par — mesmo documento e fornecedor: a baixa mata a nota (ou o título do
  //      mês passado) de mesmo valor; a mais antiga primeiro; baixa antes da nota não mata;
  //   2. doc-fornecedor — o que sobrou do mesmo documento e fornecedor soma igual em A e em B;
  //   3. doc-par e 4. doc — as mesmas duas só pelo documento (o nome muda de um lado para o
  //      outro: nome fantasia × razão social, a marca do aplicativo × a empresa que emite a nota).
  // O fornecedor entra primeiro porque há documento GENÉRICO: "072026" (despesas de julho)
  // aparece em muitos fornecedores, e a NF 60 de pessoas diferentes também.
  // ------------------------------------------------------------------
  const REGRAS_AB = {
    'doc-fornecedor-par': 'mesmo documento e fornecedor: a baixa (ou compensação) mata a nota (ou adiantamento) de mesmo valor',
    'doc-fornecedor': 'mesmo documento e fornecedor: soma igual nos dois lados',
    'doc-fornecedor-valor': 'mesmo documento e fornecedor: um lançamento e um título de mesmo valor (sobra outro título do mesmo documento)',
    'doc-nome-par': 'mesmo documento e mesmo nome de fornecedor: a baixa (ou compensação) mata a nota (ou adiantamento) de mesmo valor',
    'doc-nome': 'mesmo documento e mesmo nome de fornecedor: soma igual nos dois lados',
    'doc-nome-valor': 'mesmo documento e mesmo nome de fornecedor: um lançamento e um título de mesmo valor',
    'doc-par': 'mesmo documento, nome diferente: a baixa (ou compensação) mata a nota (ou adiantamento) de mesmo valor',
    'doc': 'mesmo documento, nome diferente: soma igual nos dois lados',
    // Só pelo valor (botão próprio, ver conciliarPorValor): sem olhar documento nem fornecedor.
    'valor-par': 'só pelo valor, sem documento e sem fornecedor: dentro da Parte A, quem aumenta com quem diminui o saldo, de mesmo valor quebrado',
    'valor': 'só pelo valor, sem documento e sem fornecedor: um item da Parte A e um da Parte B de mesmo valor quebrado',
    // Com margem (botão próprio, ver MARGEM_AB): mesmo documento e fornecedor, diferença de até R$ 1,00.
    'margem-fornecedor-par': 'com margem: mesmo documento e fornecedor, a baixa (ou compensação) mata a nota (ou adiantamento) com diferença de centavos',
    'margem-fornecedor': 'com margem: mesmo documento e fornecedor, a soma dos dois lados difere só nos centavos',
    'margem-fornecedor-valor': 'com margem: mesmo documento e fornecedor, um lançamento e um título com diferença de centavos',
    'margem-nome-par': 'com margem: mesmo documento e mesmo nome de fornecedor, a baixa (ou compensação) mata a nota (ou adiantamento) com diferença de centavos',
    'margem-nome': 'com margem: mesmo documento e mesmo nome de fornecedor, a soma dos dois lados difere só nos centavos',
    'margem-nome-valor': 'com margem: mesmo documento e mesmo nome de fornecedor, um lançamento e um título com diferença de centavos',
    'margem-palavra-par': 'com margem: mesmo documento e fornecedor com a mesma primeira palavra no nome (a filial num lado, a empresa no outro), a baixa (ou compensação) mata a nota (ou adiantamento) com diferença de centavos',
    'margem-palavra': 'com margem: mesmo documento e fornecedor com a mesma primeira palavra no nome, a soma dos dois lados difere só nos centavos',
    'margem-palavra-valor': 'com margem: mesmo documento e fornecedor com a mesma primeira palavra no nome, um lançamento e um título com diferença de centavos',
    'manual': 'marcado à mão',
  };
  function ehPorValor(g) { return !!g && (g.regra === 'valor' || g.regra === 'valor-par'); }
  function ehComMargem(g) { return !!g && /^margem-/.test(String(g.regra || '')); }
  // Rótulo curto de cada regra na tela e no relatório.
  const COMO_AB = {
    'doc-fornecedor-par': 'doc + fornecedor · par', 'doc-fornecedor': 'doc + fornecedor', 'doc-fornecedor-valor': 'doc + fornecedor · valor',
    'doc-nome-par': 'doc + nome · par', 'doc-nome': 'doc + nome', 'doc-nome-valor': 'doc + nome · valor',
    'doc-par': 'só doc · par', 'doc': 'só doc', 'valor-par': 'só valor · par', 'valor': 'só valor',
    'margem-fornecedor-par': '± doc + fornecedor · par', 'margem-fornecedor': '± doc + fornecedor', 'margem-fornecedor-valor': '± doc + fornecedor · valor',
    'margem-nome-par': '± doc + nome · par', 'margem-nome': '± doc + nome', 'margem-nome-valor': '± doc + nome · valor',
    'margem-palavra-par': '± doc + 1ª palavra · par', 'margem-palavra': '± doc + 1ª palavra', 'margem-palavra-valor': '± doc + 1ª palavra · valor',
    'manual': 'à mão',
  };
  // Margem do botão "± Conciliar com margem" (Dony, 16/09/2026: "até um real de margem"), em centavos.
  const MARGEM_AB = 100;

  // Nome do fornecedor comparável dos dois lados ("AGUA VIVA" = "Agua Viva"): as palavras próprias
  // do nome que aparece na tela (o do aging na Parte B; o que a régua deu, na Parte A).
  function nomeComparavel(x) {
    const p = MotorNomes.palavrasProprias(MotorNomes.limparNome(x.nome || ''));
    return p.length ? p.join(' ') : Util.normalizarNome(x.nome || '');
  }

  // Identidade de cada título de um aging (Parte 4): nasce do conteúdo (documento, parcela,
  // CNPJ, valor, vencimento e nome) + quantas vezes o mesmo conteúdo já apareceu. O mesmo
  // título do mesmo arquivo tem sempre o mesmo número, seja como Parte B de um mês (TB:) ou
  // como aging anterior do mês seguinte (TA:).
  function idsDeTitulos(lista, prefixo) {
    const vezes = new Map();
    return (lista || []).map((t) => {
      const doc = normalizarDocumento(t.documento);
      const base = [doc, t.parcela || '', Util.soDigitos(t.cnpj), t.valor, t.vencimento || '', Util.normalizarNome(t.nome)].join('|');
      const n = vezes.get(base) || 0; vezes.set(base, n + 1);
      return prefixo + ':' + Util.hash8(base + '|' + n);
    });
  }

  // O título que ficou em aberto na B do mês passado (TB:<hash>) é o mesmo do aging do mês
  // passado que entra na A agora (TA:<hash>): mesmo arquivo, mesmo conteúdo.
  function titulosParaTirar(cont) {
    return new Set(cont ? (cont.B || []).map((x) => String(x.id).replace(/^TB:/, 'TA:')) : []);
  }

  // SALDO INICIAL da contabilidade no mês (Dony, 15/09/2026): "considerar o saldo inicial
  // contábil conforme o AGING ou conforme o RAZÃO do mês anterior".
  //  - conforme o AGING do mês anterior (sem `entrada.continuacao`): o aging do mês passado
  //    estava certo (a contabilidade foi ajustada e bateu); a Parte B do mês passado vira a
  //    Parte A do mês. Saldo inicial = aging do mês passado.
  //  - conforme o RAZÃO do mês anterior (com `entrada.continuacao` = pendências do mês passado,
  //    ver pendenciasAB): vale o saldo da contabilidade no fim do mês passado = aging do mês
  //    passado − títulos que ficaram em aberto na Parte B + o que ficou em aberto na Parte A.
  //    A diferença do mês passado continua. Devolve os "títulos" do saldo inicial (os do aging
  //    que ficam + as pendências da A) e as contas da troca.
  function saldoInicialAB(entrada) {
    const lista = (entrada.agingAnterior && entrada.agingAnterior.titulos) || [];
    const cont = entrada.continuacao || null;
    const soma = (xs) => xs.reduce((s, t) => s + (Number(t.valor) || 0), 0);
    const aging = soma(lista);
    if (!cont) return { modo: 'aging', titulos: lista, aging, valor: aging, tirados: 0, pendentesA: 0, qtdTirados: 0, qtdPendentes: 0, competencia: '' };
    const tirar = titulosParaTirar(cont);
    const ids = idsDeTitulos(lista, 'TA');
    const ficam = [], tirados = [];
    lista.forEach((t, i) => (tirar.has(ids[i]) ? tirados : ficam).push(t));
    const pendentes = (cont.A || []).map((p) => ({ nome: p.nome || '', cnpj: p.cnpj || '', valor: Number(p.valor) || 0, documento: p.doc || '',
      vencimento: p.data || '', chave: p.chave || SEM, pendente: true, origem: p.origem || cont.competencia || '', fonteOriginal: p.fonte === 'pendente' ? (p.fonteOriginal || '') : (p.fonte || '') }));
    const titulos = ficam.concat(pendentes);
    return { modo: 'razao', titulos, aging, valor: soma(titulos), tirados: soma(tirados), pendentesA: soma(pendentes),
      qtdTirados: tirados.length, qtdPendentes: pendentes.length, competencia: cont.competencia || '' };
  }

  // Itens das partes A e B, com identidade que nasce do CONTEÚDO (Parte 4): trocar a ordem
  // das linhas do arquivo não troca o ID de ninguém. `legado` traduz os ids da versão 5
  // (posição no aging e digital do razão) para os de agora.
  //
  // Saldo inicial conforme o RAZÃO do mês anterior (`entrada.continuacao`, ver saldoInicialAB):
  //   Parte A = aging do mês passado SEM os títulos que ficaram em aberto na Parte B do mês
  //             passado + o que ficou em aberto na Parte A do mês passado + razão do mês.
  // Assim a diferença (em aberto A − em aberto B) é a acumulada de verdade entre a
  // contabilidade e o financeiro. Sem `continuacao` é o saldo inicial conforme o AGING.
  function itensAB(entrada, r) {
    const A = [], B = [];
    const porId = new Map();
    const legado = new Map();
    const lancs = (entrada.contaRazao && entrada.contaRazao.lancamentos) || [];
    const cont = entrada.continuacao || null;
    const tirar = titulosParaTirar(cont);
    const excluidos = [];
    function guardar(x) {
      let id = x.id, n = 1;
      while (porId.has(id)) id = x.id + '~' + (n++);
      x.id = id;
      porId.set(id, x);
      (x.lado === 'A' ? A : B).push(x);
      return x;
    }
    function titulos(lista, lado, fonte, prefixo, prefixoLegado) {
      const ids = idsDeTitulos(lista, prefixo);
      (lista || []).forEach((t, i) => {
        const doc = normalizarDocumento(t.documento);
        const id = ids[i];
        const item = { id, lado, fonte, doc, parcela: t.parcela || '',
          chave: chaveDoTitulo(t), nome: t.nome, cnpj: t.cnpj || '', data: t.vencimento || '', ordem: 0, historico: '', valor: t.valor };
        if (t.registro) item.registro = t.registro; // quando o título entrou na contabilidade (se o relatório diz)
        if (lado === 'A' && tirar.has(id)) { excluidos.push(item); return; }
        const x = guardar(item);
        legado.set(prefixoLegado + ':' + i, x.id);
      });
    }
    titulos(entrada.agingAnterior && entrada.agingAnterior.titulos, 'A', 'anterior', 'TA', 'AGA');
    // Pendências da Parte A do mês passado: entram antes do razão do mês (a nota nasce antes).
    let pendentes = 0;
    if (cont) {
      (cont.A || []).forEach((p) => {
        const id = String(p.id).indexOf('PA:') === 0 ? String(p.id) : 'PA:' + p.id;
        guardar({ id, lado: 'A', fonte: 'pendente', fonteOriginal: p.fonte === 'pendente' ? (p.fonteOriginal || '') : (p.fonte || ''),
          origem: p.origem || cont.competencia || '', doc: p.doc || '', parcela: p.parcela || '', chave: p.chave || SEM, nome: p.nome || '',
          cnpj: p.cnpj || '', data: p.data || '', ordem: 0, historico: p.historico || '', valor: Number(p.valor) || 0 });
        pendentes++;
      });
    }
    r.linhas.forEach((l) => {
      const lc = lancs[l.i];
      const d = r.porLinha.get(l.digital);
      const lados = ladosDoRazao(entrada.natureza, lc);
      const x = guardar({ id: 'RZ:' + Util.hash8(l.digital), lado: 'A', fonte: lados.aumento > 0 ? 'nota' : 'baixa',
        doc: documentoDaLinha(lc), parcela: lc.parcela || '', chave: d.chave, nome: d.nome, cnpj: lc.cnpj || '', data: lc.data, ordem: l.dia,
        historico: lc.historico || '', valor: lados.aumento > 0 ? lados.aumento : -lados.reducao, linha: l.i });
      legado.set('RAZ:' + l.digital, x.id);
    });
    titulos(entrada.agingAtual && entrada.agingAtual.titulos, 'B', 'atual', 'TB', 'AGB');
    // Título em aberto na B do mês passado que não apareceu no aging (arquivo trocado depois?).
    const achados = new Set(excluidos.map((x) => x.id));
    const naoAchados = cont ? (cont.B || []).filter((x) => !achados.has(String(x.id).replace(/^TB:/, 'TA:'))) : [];
    return { A, B, porId, legado, continuacao: cont ? { competencia: cont.competencia || '', pendentes, excluidos, naoAchados } : null };
  }

  // Pendências de um mês: o que ficou em aberto na Parte A e na Parte B, guardado no registro
  // do mês para o mês seguinte poder continuar dele. Só os campos que o próximo mês usa.
  const CAMPOS_PENDENCIA = ['id', 'lado', 'fonte', 'fonteOriginal', 'origem', 'doc', 'parcela', 'chave', 'nome', 'cnpj', 'data', 'historico', 'valor'];
  function pendenciasAB(itens, grupos, competencia) {
    const ab = emAbertoAB(itens, grupos);
    const copia = (x) => {
      const o = {};
      CAMPOS_PENDENCIA.forEach((k) => { if (x[k] !== undefined && x[k] !== '') o[k] = x[k]; });
      if (!o.origem) o.origem = competencia;
      return o;
    };
    return { competencia, A: ab.abertosA.map(copia), B: ab.abertosB.map(copia), valorA: ab.valorA, valorB: ab.valorB };
  }

  function tipoAB(qtdA, qtdB) { return qtdA && qtdB ? 'AxB' : (qtdA ? 'AxA' : 'BxB'); }
  function proximoIdAB(grupos) { return (grupos || []).reduce((m, g) => Math.max(m, Number(g.id) || 0), 0) + 1; }

  // Ordem estável dos grupos (o mesmo arquivo dá sempre os mesmos IDs): documento, depois fornecedor.
  function compararChave(x, y) {
    const [dx, fx] = x[0].split('|'), [dy, fy] = y[0].split('|');
    return dx.length - dy.length || (dx < dy ? -1 : dx > dy ? 1 : 0) || ((fx || '') < (fy || '') ? -1 : (fx || '') > (fy || '') ? 1 : 0);
  }

  /**
   * Acha tudo o que concilia pelo documento entre os itens ainda em aberto.
   * @param itens     resultado de itensAB
   * @param existentes conciliações já feitas [{ id, a:[ids], b:[ids] }] (os itens delas não entram)
   * @param quem, quando  gravados em cada conciliação nova
   * @param opcoes {
   *   margem: centavos — "± Conciliar com margem" (Dony, 16/09/2026: "fechar documento + fornecedor com
   *           margem de diferença, até um real, só quando eu apertar"): as camadas de documento +
   *           fornecedor, documento + nome e documento + primeira palavra do nome aceitam diferença de
   *           até `margem` (a mais perta primeiro); as de só documento não rodam;
   *   exigir: (item) => bool — só registra conciliação que tenha ao menos um item assim (a atualização
   *           de arquivo concilia só o que entrou ou voltou para em aberto; ver atualizarAB);
   *   primeiroId: o primeiro ID a usar (se for maior que o próximo livre) }
   * @returns lista de conciliações novas, com IDs a partir do próximo livre
   */
  function conciliarAutomatico(itens, existentes, quem, quando, opcoes) {
    const op = opcoes || {};
    const margem = Math.max(0, Math.round(Number(op.margem) || 0));
    const exigir = typeof op.exigir === 'function' ? op.exigir : null;
    const serve = (xs) => !exigir || xs.some(exigir);
    // Diferença que ainda "bate": zero, ou até a margem (mas não zero: o exato é do ⚡).
    const bate = (dif) => (margem ? dif !== 0 && Math.abs(dif) <= margem : dif === 0);
    const usados = new Set();
    (existentes || []).forEach((g) => (g.a || []).concat(g.b || []).forEach((id) => usados.add(id)));
    let proximo = Math.max(proximoIdAB(existentes), Math.floor(Number(op.primeiroId) || 0));
    const candidatos = itens.A.concat(itens.B).filter((x) => x.doc && !usados.has(x.id));
    const livre = new Set(candidatos.map((x) => x.id));
    const novos = [];
    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    const porOrdem = (p, q) => p.ordem - q.ordem;
    // O candidato que bate, o mais perto no valor (com margem); empatado, o da MESMA PARCELA que o item
    // de referência (parcelas de mesmo valor: a parcela 1 paga mata a parcela 1) e, depois, o primeiro da lista.
    const parcelaDe = (x) => String((x && x.parcela) || '').trim().replace(/^0+(?=\d)/, '');
    const melhor = (lista, dif, pode, ref) => {
      const pr = parcelaDe(ref);
      const mesma = (c) => !!pr && parcelaDe(c) === pr;
      let k = -1;
      lista.forEach((c, j) => {
        if (!pode(c) || !bate(dif(c))) return;
        if (k < 0) { k = j; return; }
        const d = Math.abs(dif(c)), dk = Math.abs(dif(lista[k]));
        if (d < dk || (d === dk && mesma(c) && !mesma(lista[k]))) k = j;
      });
      return k;
    };

    function registrar(xs, regra) {
      const a = xs.filter((x) => x.lado === 'A'), b = xs.filter((x) => x.lado === 'B');
      const nomeDe = (a.find((x) => x.chave !== SEM) || b[0] || a[0]).nome;
      const g = { id: proximo++, tipo: tipoAB(a.length, b.length), regra, documento: xs[0].doc, nome: nomeDe,
        a: a.map((x) => x.id), b: b.map((x) => x.id), valorA: soma(a), valorB: soma(b), quem: quem || '', quando: quando || '' };
      // "A nota nasce ANTES do pagamento" (7.11): baixa com data anterior a todas as notas do
      // razão (sem título do mês passado no grupo) concilia, mas fica marcada para conferir.
      // Caso real: despesa lançada no último dia do mês e paga antes.
      const notas = a.filter((x) => x.valor > 0);
      const baixas = a.filter((x) => x.valor < 0);
      if (baixas.length && notas.length && !notas.some((x) => x.fonte === 'anterior' || x.fonte === 'pendente')) {
        const primeira = Math.min.apply(null, notas.map((x) => x.ordem));
        if (baixas.some((x) => x.ordem < primeira)) g.aviso = 'baixa-antes-da-nota';
      }
      novos.push(g);
      xs.forEach((x) => livre.delete(x.id));
    }
    // Como separar os itens de um mesmo documento: 'fornecedor' (a chave da régua, quase sempre o
    // CNPJ), 'nome' (o nome do fornecedor escrito igual nos dois lados) ou só o documento.
    function agrupar(por) {
      const m = new Map();
      for (const x of candidatos) {
        if (!livre.has(x.id)) continue;
        // Linha sem fornecedor não tem nome de verdade ("Sem fornecedor"): fica para o "só doc".
        if (por !== 'doc' && x.chave === SEM) continue;
        let k = x.doc;
        if (por === 'fornecedor') k += '|' + x.chave;
        else if (por === 'nome') { const n = nomeComparavel(x); if (!n) continue; k += '|' + n; }
        else if (por === 'palavra') { const p = nomeComparavel(x).split(' ')[0]; if (!p) continue; k += '|' + p; }
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
      }
      return Array.from(m.entries()).sort(compararChave).map((e) => e[1]);
    }
    function pares(regra, por) {
      for (const xs of agrupar(por)) {
        const notas = xs.filter((x) => x.lado === 'A' && x.valor > 0).sort(porOrdem);
        const baixas = xs.filter((x) => x.lado === 'A' && x.valor < 0).sort(porOrdem);
        for (const bx of baixas) {
          const j = melhor(notas, (n) => n.valor + bx.valor, (n) => n.ordem <= bx.ordem && serve([n, bx]), bx);
          if (j >= 0) { registrar([notas[j], bx], regra); notas.splice(j, 1); }
        }
      }
    }
    function grupos(regra, por) {
      for (const xs of agrupar(por)) {
        if (xs.length < 2 || !serve(xs)) continue;
        if (bate(soma(xs.filter((x) => x.lado === 'A')) - soma(xs.filter((x) => x.lado === 'B')))) registrar(xs, regra);
      }
    }
    // Documento e fornecedor iguais, mas a soma do grupo não bate (sobrou outro título do mesmo
    // documento): casa uma nota (ou título do mês passado) com um título de MESMO valor.
    // Pedido do Dony (15/09/2026): uma despesa 82026 ficou em aberto porque o 82026 também é de
    // outro fornecedor; com documento e fornecedor ele acha. No caso real o aging do mês veio sem
    // CNPJ para esse fornecedor e a régua ligou a nota ao CNPJ: por isso existe também o "doc + nome".
    function valores(regra, por) {
      for (const xs of agrupar(por)) {
        const ladoA = xs.filter((x) => x.lado === 'A').sort(porOrdem);
        const ladoB = xs.filter((x) => x.lado === 'B').sort(porData);
        if (!ladoA.length || !ladoB.length) continue;
        for (const a of ladoA) {
          if (a.valor === 0) continue;
          const j = melhor(ladoB, (b) => a.valor - b.valor, (b) => serve([a, b]), a);
          if (j >= 0) { registrar([a, ladoB[j]], regra); ladoB.splice(j, 1); }
        }
      }
    }
    if (margem) {
      pares('margem-fornecedor-par', 'fornecedor');
      grupos('margem-fornecedor', 'fornecedor');
      valores('margem-fornecedor-valor', 'fornecedor');
      pares('margem-nome-par', 'nome');
      grupos('margem-nome', 'nome');
      valores('margem-nome-valor', 'nome');
      // O mesmo fornecedor escrito diferente nos dois lados (caso real, 16/09/2026: a filial no aging e
      // a empresa na compensação, mesmo documento, 2 centavos de diferença): a primeira palavra do nome.
      pares('margem-palavra-par', 'palavra');
      grupos('margem-palavra', 'palavra');
      valores('margem-palavra-valor', 'palavra');
      return novos;
    }
    pares('doc-fornecedor-par', 'fornecedor');
    grupos('doc-fornecedor', 'fornecedor');
    valores('doc-fornecedor-valor', 'fornecedor');
    pares('doc-nome-par', 'nome');
    grupos('doc-nome', 'nome');
    valores('doc-nome-valor', 'nome');
    pares('doc-par', 'doc');
    grupos('doc', 'doc');
    return novos;
  }

  // ------------------------------------------------------------------
  // Conciliar SÓ PELO VALOR (Dony, 16/09/2026): há contas em que nem o documento nem o fornecedor
  // ligam os dois lados (a compra é a nota 45 de um fornecedor e o pagamento saiu com o nome do
  // cartão de crédito do banco, mesmo valor: "nunca vou achar"). Botão próprio, em todas as conciliações
  // A × B, que só roda quando ele aperta. Casa o que ficou em aberto por valor igual, sem olhar
  // documento e fornecedor — e só valor QUEBRADO, para evitar coincidência: valor inteiro terminado
  // em zero (10, 20, 100, 200, 250, 1.000…) fica de fora; 200,15 e 281,00 entram.
  //   1. valor-par — dentro da Parte A: quem aumenta o saldo com quem diminui, de mesmo valor (a mais
  //      perto na data; a redução antes do aumento concilia, mas fica marcada para conferir);
  //   2. valor — Parte A com Parte B: um item da A e um título da B de mesmo valor (o mais antigo primeiro).
  // As conciliações ganham ID como as outras e aparecem à parte ("Conciliados só pelo valor").
  // ------------------------------------------------------------------
  function valorRedondo(centavos) { return Math.abs(Number(centavos) || 0) % 1000 === 0; }

  function conciliarPorValor(itens, existentes, quem, quando) {
    const usados = new Set();
    (existentes || []).forEach((g) => (g.a || []).concat(g.b || []).forEach((id) => usados.add(id)));
    let proximo = proximoIdAB(existentes);
    const serve = (x) => !usados.has(x.id) && !valorRedondo(x.valor);
    const novos = [];
    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    function registrar(a, b, regra) {
      const todos = a.concat(b);
      const nomeDe = (todos.find((x) => x.chave !== SEM) || todos[0]).nome;
      const g = { id: proximo++, tipo: tipoAB(a.length, b.length), regra, documento: (todos.find((x) => x.doc) || {}).doc || '', nome: nomeDe,
        a: a.map((x) => x.id), b: b.map((x) => x.id), valorA: soma(a), valorB: soma(b), quem: quem || '', quando: quando || '' };
      const aumento = a.find((x) => x.valor > 0), reducao = a.find((x) => x.valor < 0);
      if (aumento && reducao && aumento.fonte !== 'anterior' && aumento.fonte !== 'pendente' && reducao.ordem < aumento.ordem) g.aviso = 'baixa-antes-da-nota';
      novos.push(g);
      todos.forEach((x) => usados.add(x.id));
    }
    // 1. Dentro da Parte A.
    const aumentos = itens.A.filter((x) => serve(x) && x.valor > 0).sort((p, q) => p.ordem - q.ordem);
    const reducoes = itens.A.filter((x) => serve(x) && x.valor < 0).sort((p, q) => p.ordem - q.ordem);
    for (const r of reducoes) {
      let melhor = -1;
      aumentos.forEach((n, j) => {
        if (n.valor !== -r.valor) return;
        if (melhor < 0 || Math.abs(n.ordem - r.ordem) < Math.abs(aumentos[melhor].ordem - r.ordem)) melhor = j;
      });
      if (melhor >= 0) { registrar([aumentos[melhor], r], [], 'valor-par'); aumentos.splice(melhor, 1); }
    }
    // 2. Parte A com Parte B.
    const ladoA = itens.A.filter(serve).sort((p, q) => p.ordem - q.ordem);
    const ladoB = itens.B.filter(serve).sort(porData);
    for (const a of ladoA) {
      const j = ladoB.findIndex((b) => b.valor === a.valor);
      if (j >= 0) { registrar([a], [ladoB[j]], 'valor'); ladoB.splice(j, 1); }
    }
    return novos;
  }

  // ------------------------------------------------------------------
  // ATUALIZAR um arquivo da conciliação (Dony, 16/09/2026): "atualizei o razão; se eu subir o novo, tudo
  // aquilo que ele já tinha feito, ele vai manter? ... tudo aquilo que já existia antes não muda, ele só
  // altera aquilo que mudou: se tinha algum valor conciliado e no novo razão sumiu, ele detecta e fala;
  // se existia alguma pendência e entrou um novo razão, se der ele já amarra um com o outro pelas regras,
  // ou então fica em aberto para conciliar manualmente." Vale para o razão e para os agings.
  // E o medo dele (mesmo dia): "que as conciliações feitas de forma manual sumam; e que uma conciliação
  // feita antes, manual ou automática, perca um lançamento no razão novo sem o sistema identificar".
  // Por isso NENHUMA conciliação sai sozinha. Cada item tem a identidade do seu conteúdo (itensAB): o que
  // não mudou continua com o mesmo ID de item. Comparando os itens de antes com os de agora:
  //   - continua: a conciliação com todos os itens no arquivo novo (nada muda, nem o ID);
  //   - trocada: o item dela mudou só no texto ou na data — mesmo lado, mesmo valor, mesmo documento e
  //     (mesma data ou mesmo fornecedor), sem outro candidato igual: ela continua, com o mesmo ID, com o
  //     item novo no lugar do antigo (fica anotado o que mudou);
  //   - com item faltando: o item dela saiu (ou mudou de valor) — ela CONTINUA na lista, marcada, até ele
  //     decidir (Desfazer, ou carregar de novo a versão com o item: aí ela volta a ficar completa sozinha);
  //   - nova: o ⚡ (as regras do documento) só com o que ENTROU; o que já estava em aberto antes e não
  //     casa com nada novo fica como estava. O ≈ só pelo valor e o ± com margem não rodam sozinhos.
  // "Mudou" (para mostrar antes × agora) é mais largo que a troca: saiu um item e entrou outro do mesmo
  // lado e do mesmo arquivo com a mesma data e o mesmo histórico (valor corrigido), a mesma data e o
  // mesmo valor, a mesma data e o mesmo documento, ou o mesmo documento e o mesmo valor.
  // ------------------------------------------------------------------
  const CAMPOS_RESUMO = ['id', 'lado', 'fonte', 'fonteOriginal', 'origem', 'doc', 'nome', 'data', 'historico', 'valor'];
  function resumoDoItem(x) {
    const o = {};
    CAMPOS_RESUMO.forEach((k) => {
      if (x[k] === undefined || x[k] === null || x[k] === '') return;
      o[k] = k === 'historico' ? String(x[k]).slice(0, 160) : x[k];
    });
    return o;
  }
  const arquivoDoId = (id) => String(id).split(':')[0];
  // Pares "saiu × entrou" que são o mesmo item mudado (do critério mais forte para o mais fraco).
  function pareadosComoMudados(sairam, entraram, mesmoGrupo) {
    const tem = (x, k) => x[k] !== undefined && x[k] !== null && x[k] !== '';
    const igual = (a, b, k) => tem(a, k) && a[k] === b[k];
    const criterios = [
      (a, b) => igual(a, b, 'data') && a.valor === b.valor && igual(a, b, 'doc'),
      (a, b) => igual(a, b, 'data') && igual(a, b, 'historico'), // o mesmo lançamento com o valor corrigido
      (a, b) => igual(a, b, 'data') && a.valor === b.valor,
      (a, b) => igual(a, b, 'data') && igual(a, b, 'doc'),
      (a, b) => igual(a, b, 'doc') && a.valor === b.valor,
    ];
    const usadosS = new Set(), usadosE = new Set();
    const pares = [];
    for (const crit of criterios) {
      for (const s of sairam) {
        if (usadosS.has(s)) continue;
        const e = entraram.find((x) => !usadosE.has(x) && mesmoGrupo(s, x) && crit(s, x));
        if (e) { usadosS.add(s); usadosE.add(e); pares.push({ antes: s, depois: e }); }
      }
    }
    return pares;
  }
  // O que mudou entre dois itens (para a tela: "mudou: histórico e valor").
  function camposMudados(a, b) {
    const nomes = { data: 'data', doc: 'documento', valor: 'valor', nome: 'fornecedor', historico: 'histórico' };
    return Object.keys(nomes).filter((k) => String(a[k] === undefined ? '' : a[k]) !== String(b[k] === undefined ? '' : b[k])).map((k) => nomes[k]);
  }

  // Conciliação com item que não está nos itens de agora (o arquivo mudou depois de conciliar).
  function faltandoNoGrupo(g, porId) { return (g.a || []).concat(g.b || []).filter((id) => !porId.has(id)); }

  // Troca segura: para cada item que saiu, o item novo que é ele mesmo corrigido — mesmo lado e arquivo,
  // mesmo valor, mesmo documento (não vazio) e mesma data ou mesmo fornecedor — quando só existe UM
  // candidato assim (dos dois lados da comparação). Devolve Map(id que saiu → item novo).
  function trocasSeguras(sairam, entraram) {
    const mesmoFornecedor = (a, b) => (a.chave && a.chave !== SEM && a.chave === b.chave) || (!!nomeComparavel(a) && nomeComparavel(a) === nomeComparavel(b));
    const base = (x) => [x.lado, arquivoDoId(x.id), x.valor, x.doc].join('|');
    const criterios = [
      (s, e) => !!s.data && s.data === e.data,
      (s, e) => mesmoFornecedor(s, e),
    ];
    const trocas = new Map();
    const pegos = new Set();
    for (const crit of criterios) {
      for (const s of sairam) {
        if (trocas.has(s.id) || !s.doc) continue;
        const cand = entraram.filter((e) => !pegos.has(e.id) && base(e) === base(s) && crit(s, e));
        if (cand.length !== 1) continue;
        const rivais = sairam.filter((o) => o !== s && !trocas.has(o.id) && o.doc && base(o) === base(s) && crit(o, cand[0]));
        if (rivais.length) continue;
        trocas.set(s.id, cand[0]);
        pegos.add(cand[0].id);
      }
    }
    return trocas;
  }

  /**
   * @param antes   { ids: Set, porId: Map } — os itens da última gravação (sem o arquivo antigo, porId só
   *                tem os que estavam em aberto); null = sem comparação (só confere as conciliações)
   * @param itens   itensAB de agora
   * @param grupos  conciliações gravadas
   * @returns { grupos (todas as de antes, com as trocas, + as novas), continuam, trocadas: [{ grupo, trocas }],
   *            faltando: [{ grupo, sairam }], completas: [ids], novas, entraram, sairam, mudaram, semComparacao }
   */
  function atualizarAB(antes, itens, grupos, quem, quando) {
    const agora = itens.porId;
    const semComparacao = !antes;
    const lista = grupos || [];
    const idsDe = (g) => (g.a || []).concat(g.b || []);
    const entraram = semComparacao ? [] : itens.A.concat(itens.B).filter((x) => !antes.ids.has(x.id));
    const detalhe = (id) => (antes && antes.porId && antes.porId.get(id)) || null;
    const sairamIds = semComparacao ? [] : Array.from(antes.ids).filter((id) => !agora.has(id));
    const sairamDet = sairamIds.map(detalhe).filter(Boolean);
    const trocaDe = trocasSeguras(sairamDet, entraram);
    const continuam = [], trocadas = [], faltando = [], completas = [];
    const novaLista = lista.map((g) => {
      const ids = idsDe(g);
      if (!semComparacao && ids.some((id) => !antes.ids.has(id)) && ids.every((id) => agora.has(id))) completas.push(g.id); // o item voltou
      if (ids.every((id) => agora.has(id))) { continuam.push(g); return g; }
      const trocas = [];
      const trocar = (id) => {
        if (agora.has(id) || !trocaDe.has(id)) return id;
        const velho = detalhe(id), novo = trocaDe.get(id);
        trocaDe.delete(id); // cada item novo entra numa conciliação só
        trocas.push({ antes: resumoDoItem(velho), depois: resumoDoItem(novo), campos: camposMudados(velho, novo) });
        return novo.id;
      };
      const n = Object.assign({}, g, { a: (g.a || []).map(trocar), b: (g.b || []).map(trocar) });
      if (trocas.length) {
        n.trocas = (g.trocas || []).concat(trocas.map((t) => ({ quando, quem, antes: t.antes.id, depois: t.depois.id, campos: t.campos }))).slice(-20);
        trocadas.push({ grupo: n, trocas });
      }
      const aindaFaltam = faltandoNoGrupo(n, agora);
      if (aindaFaltam.length) {
        faltando.push({ grupo: n, sairam: aindaFaltam.map((id) => resumoDoItem(detalhe(id) || { id })),
          jaFaltava: !semComparacao && ids.some((id) => !antes.ids.has(id)) }); // já estava marcada antes desta atualização
      }
      return n;
    });
    // ⚡ só com o que entrou (os itens das conciliações, inclusive as marcadas com item faltando, não entram).
    const idsEntraram = new Set(entraram.map((x) => x.id));
    const maior = lista.reduce((m, g) => Math.max(m, Number(g.id) || 0), 0);
    const novas = conciliarAutomatico(itens, novaLista, quem, quando, { exigir: (x) => idsEntraram.has(x.id), primeiroId: maior + 1 });
    const mudaram = pareadosComoMudados(sairamDet, entraram, (s, e) => s.lado === e.lado && arquivoDoId(s.id) === arquivoDoId(e.id))
      .map((p) => ({ antes: resumoDoItem(p.antes), depois: resumoDoItem(p.depois), campos: camposMudados(p.antes, p.depois) }));
    return {
      grupos: novaLista.concat(novas), continuam: continuam.length, trocadas, faltando, completas, novas,
      entraram: entraram.map(resumoDoItem), sairam: sairamIds.map((id) => resumoDoItem(detalhe(id) || { id })), mudaram, semComparacao,
    };
  }

  // ------------------------------------------------------------------
  // VERSÕES de um arquivo (Dony, 16/09/2026: "coloco um novo razão e esse novo é a base, mas ele faz uma
  // comparação de um com o outro, para ficar registrado quantos razões subiram; o aging também — você
  // pode provar que o financeiro está errado e que vai vir um novo aging"). Compara o arquivo inteiro:
  // razão = lançamentos (data, histórico, débito, crédito); aging = títulos (documento, parcela, CNPJ,
  // valor, vencimento, nome). Devolve os que ficaram iguais, entraram, saíram e mudaram.
  // ------------------------------------------------------------------
  function linhasDaVersao(tipo, conteudo) {
    const c = conteudo || {};
    const vezes = new Map();
    const chave = (base) => { const n = vezes.get(base) || 0; vezes.set(base, n + 1); return base + '|' + n; };
    if (tipo === 'razao') {
      return ((c.conta && c.conta.lancamentos) || c.lancamentos || []).map((l) => ({
        chave: chave([l.data, String(l.historico || '').slice(0, 120), l.debito || 0, l.credito || 0].join('|')),
        data: l.data || '', doc: documentoDaLinha(l), historico: l.historico || '', nome: l.fornecedor !== undefined ? l.fornecedor : fornecedorDoHistorico(l.historico),
        valor: (l.credito || 0) - (l.debito || 0), debito: l.debito || 0, credito: l.credito || 0,
      }));
    }
    return (c.titulos || []).map((t) => ({
      chave: chave([normalizarDocumento(t.documento), t.parcela || '', Util.soDigitos(t.cnpj), t.valor, t.vencimento || '', Util.normalizarNome(t.nome)].join('|')),
      data: t.vencimento || '', doc: normalizarDocumento(t.documento), parcela: t.parcela || '', nome: t.nome || '', cnpj: t.cnpj || '', valor: t.valor || 0,
    }));
  }
  function compararVersoes(tipo, antes, depois) {
    const la = linhasDaVersao(tipo, antes), ld = linhasDaVersao(tipo, depois);
    const chavesA = new Set(la.map((x) => x.chave)), chavesD = new Set(ld.map((x) => x.chave));
    const sairam = la.filter((x) => !chavesD.has(x.chave));
    const entraram = ld.filter((x) => !chavesA.has(x.chave));
    const mudaram = pareadosComoMudados(sairam, entraram, () => true).map((p) => ({ antes: p.antes, depois: p.depois, campos: camposMudados(p.antes, p.depois) }));
    const somar = (xs, k) => xs.reduce((s, x) => s + (x[k] || 0), 0);
    const totais = (xs) => (tipo === 'razao' ? { debitos: somar(xs, 'debito'), creditos: somar(xs, 'credito') } : { total: somar(xs, 'valor') });
    return {
      tipo, iguais: la.length - sairam.length, entraram, sairam, mudaram,
      qtdAntes: la.length, qtdDepois: ld.length, antes: totais(la), depois: totais(ld),
    };
  }
  // O resumo que fica guardado no arquivo novo (só números).
  function resumoDaComparacao(c) {
    return { iguais: c.iguais, entraram: c.entraram.length - c.mudaram.length, sairam: c.sairam.length - c.mudaram.length, mudaram: c.mudaram.length,
      qtdAntes: c.qtdAntes, qtdDepois: c.qtdDepois, antes: c.antes, depois: c.depois };
  }

  // Vencimento (dd/mm/aaaa) em número, para ordenar os títulos do mais antigo para o mais novo.
  function porData(p, q) {
    const n = (x) => { const d = Util.lerData(x.data); return d ? d.numero : 0; };
    return n(p) - n(q);
  }

  // Documento primeiro (sem documento no fim), depois fornecedor e data: o que casa fica perto.
  function compararPorDocumento(x, y) {
    if (!x.doc !== !y.doc) return x.doc ? -1 : 1;
    return x.doc.length - y.doc.length || (x.doc < y.doc ? -1 : x.doc > y.doc ? 1 : 0) ||
      (x.nome < y.nome ? -1 : x.nome > y.nome ? 1 : 0) || x.ordem - y.ordem;
  }

  // Conciliações gravadas antes do ID (versão 5): ids antigos viram os de agora e quem não tem
  // número ganha o próximo. Devolve { grupos, mudou } sem mexer na lista recebida.
  function arrumarGruposAB(grupos, legado) {
    const traduz = (id) => (legado && legado.get(id)) || id;
    let proximo = proximoIdAB(grupos);
    let mudou = false;
    const novos = (grupos || []).map((g) => {
      const antesA = g.a || [], antesB = g.b || [];
      const a = antesA.map(traduz), b = antesB.map(traduz);
      const n = Object.assign({}, g, { a, b });
      if (n.ids) { delete n.ids; mudou = true; }
      if (!n.id) { n.id = proximo++; mudou = true; }
      if (!n.tipo) { n.tipo = tipoAB(a.length, b.length); mudou = true; }
      if (!n.regra) { n.regra = 'manual'; mudou = true; }
      if (a.some((id, i) => id !== antesA[i]) || b.some((id, i) => id !== antesB[i])) mudou = true;
      return n;
    });
    return { grupos: novos, mudou };
  }

  // Dados do RELATÓRIO da conciliação A × B (Dony, 14/09/2026: "relatório bem bonito,
  // demonstrando o que foi conciliado manualmente e o que foi automático, agrupado por ID").
  // Manuais e automáticas separadas, cada ID com os seus itens; o que ficou em aberto; totais.
  function relatorioAB(itens, grupos) {
    const porId = (grupos || []).slice().sort((x, y) => x.id - y.id).map((g) => {
      const doGrupo = (g.a || []).concat(g.b || []).map((id) => itens.porId.get(id) || { id, faltando: true });
      return { grupo: g, itens: doGrupo, faltando: doGrupo.filter((x) => x.faltando).length, diferenca: (g.valorA || 0) - (g.valorB || 0) };
    });
    const manuais = porId.filter((x) => x.grupo.regra === 'manual');
    const porValor = porId.filter((x) => ehPorValor(x.grupo));
    const comMargem = porId.filter((x) => ehComMargem(x.grupo));
    const automaticas = porId.filter((x) => x.grupo.regra !== 'manual' && !ehPorValor(x.grupo) && !ehComMargem(x.grupo));
    const ab = emAbertoAB(itens, grupos);
    const porRegra = {};
    for (const x of automaticas.concat(porValor, comMargem)) {
      const k = x.grupo.regra;
      if (!porRegra[k]) porRegra[k] = { conciliacoes: 0, itens: 0 };
      porRegra[k].conciliacoes++;
      porRegra[k].itens += x.itens.length;
    }
    const conta = (lista, pred) => lista.filter(pred).length;
    return {
      manuais, automaticas, porValor, comMargem, porRegra,
      abertosA: ab.abertosA.slice().sort(compararPorDocumento), abertosB: ab.abertosB.slice().sort(compararPorDocumento),
      valorAbertoA: ab.valorA, valorAbertoB: ab.valorB,
      totais: {
        conciliacoes: porId.length, automaticas: automaticas.length, manuais: manuais.length, porValor: porValor.length, comMargem: comMargem.length,
        itensConciliados: porId.reduce((s, x) => s + x.itens.length - x.faltando, 0),
        itensAutomaticas: automaticas.reduce((s, x) => s + x.itens.length, 0), itensManuais: manuais.reduce((s, x) => s + x.itens.length, 0),
        itensPorValor: porValor.reduce((s, x) => s + x.itens.length, 0),
        itensComMargem: comMargem.reduce((s, x) => s + x.itens.length, 0),
        diferencaComMargem: comMargem.reduce((s, x) => s + x.diferenca, 0),
        AxA: conta(porId, (x) => x.grupo.tipo === 'AxA'), AxB: conta(porId, (x) => x.grupo.tipo === 'AxB'), BxB: conta(porId, (x) => x.grupo.tipo === 'BxB'),
        manuaisComDiferenca: conta(manuais, (x) => Math.abs(x.diferenca) >= 1),
        paraConferir: porId.filter((x) => x.grupo.aviso === 'baixa-antes-da-nota').map((x) => x.grupo.id),
        comItemFaltando: conta(porId, (x) => x.faltando > 0),
      },
    };
  }

  // Em aberto de cada lado, depois das conciliações. A − B = a diferença da ponte, sempre
  // (cada conciliação que bate tira o mesmo valor dos dois lados).
  function emAbertoAB(itens, conciliacoes) {
    const usados = new Set();
    (conciliacoes || []).forEach((g) => (g.a || []).concat(g.b || []).forEach((id) => usados.add(id)));
    const abertosA = itens.A.filter((x) => !usados.has(x.id));
    const abertosB = itens.B.filter((x) => !usados.has(x.id));
    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    return { abertosA, abertosB, valorA: soma(abertosA), valorB: soma(abertosB), usados };
  }

  // ------------------------------------------------------------------
  // Fornecedor pelo DOCUMENTO (17/09/2026, razão em que o pagamento só traz o número do lançamento do
  // financeiro — "PAGAMENTO CF NRM4001 - 1 - …"): o documento é o mesmo do título do aging e da nota
  // do razão, e quem é o fornecedor está lá. Só para o leitor que separa o fornecedor do histórico
  // (l.fornecedor existe) e só quando o documento é de UM fornecedor:
  //  - linha sem fornecedor: ganha o nome (e o CNPJ) do título do aging com o mesmo documento, ou o
  //    nome de outra linha do razão com o mesmo documento;
  //  - linha com fornecedor: ganha o CNPJ do título do aging com o mesmo documento, se o nome do
  //    título começa pela mesma palavra (a régua liga pelo CNPJ, sem depender da grafia).
  // Documento repetido em fornecedores diferentes (ex.: um número genérico) não empresta nada.
  // ------------------------------------------------------------------
  function fornecedorPeloDocumento(lancamentos, titulos) {
    const primeira = (nome) => nomeComparavel({ nome }).split(' ')[0] || '';
    const porDoc = new Map();
    const pegar = (doc) => { if (!porDoc.has(doc)) porDoc.set(doc, { cnpjs: new Map(), nomesTitulo: new Map(), nomesRazao: new Map() }); return porDoc.get(doc); };
    for (const t of titulos || []) {
      const doc = normalizarDocumento(t.documento);
      if (!doc || !t.nome) continue;
      const g = pegar(doc);
      if (t.cnpj && Util.cnpjValido(t.cnpj)) { const m = Util.cnpjMatriz(t.cnpj); if (!g.cnpjs.has(m)) g.cnpjs.set(m, { nome: t.nome, cnpj: t.cnpj }); }
      g.nomesTitulo.set(Util.normalizarNome(t.nome), t.nome);
    }
    for (const l of lancamentos || []) {
      if (!l.fornecedor) continue;
      const doc = documentoDaLinha(l);
      if (doc) pegar(doc).nomesRazao.set(Util.normalizarNome(l.fornecedor), l.fornecedor);
    }
    // O fornecedor único de um documento: { nome, cnpj } ou null.
    const unico = (doc) => {
      const g = porDoc.get(doc);
      if (!g) return null;
      if (g.cnpjs.size === 1) return g.cnpjs.values().next().value;
      if (g.cnpjs.size > 1) return null;
      if (g.nomesTitulo.size === 1) return { nome: g.nomesTitulo.values().next().value, cnpj: '' };
      if (g.nomesTitulo.size > 1) return null;
      if (g.nomesRazao.size === 1) return { nome: g.nomesRazao.values().next().value, cnpj: '' };
      return null;
    };
    return (l) => {
      const doc = documentoDaLinha(l);
      const u = doc ? unico(doc) : null;
      // O CNPJ que o próprio razão traz no histórico (desenho G, 18/09/2026: "Forn: … - <CNPJ> , Doc: …") vale.
      const proprio = Util.soDigitos(l.cnpj || '');
      if (proprio.length === 14 && Util.cnpjValido(proprio)) return { nome: l.fornecedor || (u && u.nome) || '', cnpj: proprio };
      if (!l.fornecedor) return u ? { nome: u.nome, cnpj: u.cnpj || undefined } : { nome: '' };
      if (u && u.cnpj && primeira(u.nome) && primeira(u.nome) === primeira(l.fornecedor)) return { nome: l.fornecedor, cnpj: u.cnpj };
      return { nome: l.fornecedor };
    };
  }

  // Os leitores (ler-financeiro, ler-razao) já entregam os valores em CENTAVOS inteiros;
  // aqui não se multiplica de novo.

  /**
   * @param entrada {
   *   competencia, natureza, mesAnterior, mesAtual,
   *   contaRazao: { conta:{codigo,nome,classificacao}, lancamentos:[{dia,mes,ano,data,historico,debito,credito,documento,contrapartida}] },
   *   agingAnterior: { titulos:[{nome,cnpj,valor,vencimento,documento}], total },
   *   agingAtual:    { titulos:[...], total },
   *   decisoes: { donos:{digital:{chave,nome}}, conciliadas:[chave], observacoes:{chave:texto} },
   * }
   */
  function calcular(entrada) {
    const t0 = Date.now();
    const dec = entrada.decisoes || {};
    const donos = dec.donos || {};
    const conciliadas = new Set(dec.conciliadas || []);
    const razao = entrada.contaRazao || { conta: {}, lancamentos: [] };
    const agAnt = entrada.agingAnterior || { titulos: [] };
    const agAtu = entrada.agingAtual || { titulos: [] };
    // Saldo inicial conforme o aging ou conforme o razão do mês anterior (saldoInicialAB).
    const inicio = saldoInicialAB(entrada);

    // Linhas do razão para a régua de nomes. Digital estável (nasce do conteúdo).
    const peloDoc = fornecedorPeloDocumento(razao.lancamentos, agAnt.titulos.concat(agAtu.titulos));
    const ocorr = new Map();
    const linhas = razao.lancamentos.map((l, i) => {
      const base = 'R|' + (razao.conta.codigo || '') + '|' + l.data + '|' + String(l.historico || '').slice(0, 120) + '|' +
        l.debito + '|' + l.credito;
      const n = ocorr.get(base) || 0; ocorr.set(base, n + 1);
      return {
        i, digital: base + '|' + n, conta: String(razao.conta.codigo || ''),
        dc: l.credito > 0 ? 'C' : 'D', dia: Util.montarData(l.dia, l.mes, l.ano).numero,
        debito: l.debito, credito: l.credito, historico: l.historico || '',
        // O fornecedor que o leitor tirou do histórico (desenhos E e F) vale; senão, depois da última vírgula.
        // Sem fornecedor no histórico (o pagamento do desenho F), o do mesmo documento.
        fornecedorDeclarado: l.fornecedor === undefined ? { nome: fornecedorDoHistorico(l.historico) } : peloDoc(l),
      };
    });

    // Cadastro = os títulos dos dois agings (nome + CNPJ ensinam a régua).
    const titulos = agAnt.titulos.concat(agAtu.titulos).map((t) => ({ nome: t.nome, cnpj: t.cnpj }));
    const nomes = MotorNomes.resolver(linhas, { donos, titulos });

    // Agrupa aging anterior e atual pela mesma chave da régua (a pendência do mês passado já
    // traz a chave que a régua deu a ela lá).
    function agrupaAging(tits) {
      const m = new Map();
      for (const t of tits) {
        const k = t.chave || chaveDoTitulo(t);
        if (!m.has(k)) m.set(k, { chave: k, nome: t.nome, cnpj: t.cnpj || '', valor: 0, titulos: [] });
        const g = m.get(k);
        g.valor += t.valor;
        g.titulos.push(t);
        if (t.cnpj && !g.cnpj) g.cnpj = t.cnpj;
      }
      return m;
    }
    const anterior = agrupaAging(inicio.titulos);
    const atual = agrupaAging(agAtu.titulos);

    // Agrupa o razão pela chave que a régua deu a cada linha.
    const razPorChave = new Map();
    for (const l of linhas) {
      const d = nomes.porLinha.get(l.digital);
      if (!razPorChave.has(d.chave)) razPorChave.set(d.chave, { chave: d.chave, notas: 0, baixas: 0, linhas: [] });
      const g = razPorChave.get(d.chave);
      const lados = ladosDoRazao(entrada.natureza, l);
      g.notas += lados.aumento;      // fornecedores: notas (créditos) · adiantamento: adiantamentos (débitos)
      g.baixas += lados.reducao;     // fornecedores: baixas (débitos) · adiantamento: compensações (créditos)
      g.linhas.push({ i: l.i, data: razao.lancamentos[l.i].data, dia: l.dia, historico: l.historico,
        documento: documentoDoHistorico(l.historico), debito: l.debito, credito: l.credito,
        nome: d.nome, origem: d.origem });
    }

    // Monta a linha de cada fornecedor.
    const chaves = new Set([...anterior.keys(), ...atual.keys(), ...razPorChave.keys()]);
    const fornecedores = [];
    for (const k of chaves) {
      const a = anterior.get(k), at = atual.get(k), rz = razPorChave.get(k);
      const f = nomes.fornecedores[k] || {};
      const ehSem = k === SEM;
      const nome = ehSem ? 'Sem fornecedor' : ((a && a.nome) || (at && at.nome) || f.nome || (rz && rz.linhas[0] && rz.linhas[0].nome) || k.replace(/^(cnpj|nome):/, ''));
      const cnpj = ehSem ? '' : ((a && a.cnpj) || (at && at.cnpj) || f.cnpj || '');
      const antV = a ? a.valor : 0;
      const notas = rz ? rz.notas : 0;
      const baixas = rz ? rz.baixas : 0;
      const movimento = notas - baixas;
      const esperado = antV + movimento;
      const atuV = at ? at.valor : 0;
      const diferenca = esperado - atuV;
      let situacao;
      if (ehSem) situacao = 'sem-fornecedor';
      else if (conciliadas.has(k)) situacao = 'conciliada';
      else if (Math.abs(diferenca) < 1) situacao = 'bate';
      else if (antV === 0 && atuV === 0) situacao = 'so-razao';        // comprou e pagou no mês
      else if (!rz && atuV === 0) situacao = 'so-anterior';            // sumiu de um mês pro outro
      else if (antV === 0 && !rz) situacao = 'so-aging';               // só no aging do mês, sem razão
      else situacao = 'diferenca';
      fornecedores.push({
        chave: k, nome, cnpj, anterior: antV, notas, baixas, movimento, esperado, atual: atuV, diferenca, situacao,
        linhasRazao: rz ? rz.linhas.length : 0,
        titulosAnterior: a ? a.titulos.length : 0, titulosAtual: at ? at.titulos.length : 0,
        observacao: (dec.observacoes && dec.observacoes[k]) || '',
      });
    }
    fornecedores.sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca) || (x.nome < y.nome ? -1 : 1));

    // Ponte total.
    const soma = (f, campo) => f.reduce((s, x) => s + x[campo], 0);
    const totalAnterior = inicio.valor;
    const totalAtual = agAtu.titulos.reduce((s, t) => s + t.valor, 0);
    const totalNotas = linhas.reduce((s, l) => s + ladosDoRazao(entrada.natureza, l).aumento, 0);
    const totalBaixas = linhas.reduce((s, l) => s + ladosDoRazao(entrada.natureza, l).reducao, 0);
    const totalMovimento = totalNotas - totalBaixas;
    const totalEsperado = totalAnterior + totalMovimento;
    const diferencaTotal = totalEsperado - totalAtual;

    const semFornecedor = linhas.filter((l) => nomes.porLinha.get(l.digital).chave === SEM);
    const conta = razao.conta;

    // Conferências.
    const falhas = [];
    if (Math.abs(soma(fornecedores, 'diferenca') - diferencaTotal) > 1) falhas.push('A soma das diferenças por fornecedor não fecha com a diferença total.');
    if (soma(fornecedores, 'anterior') !== totalAnterior - (anterior.get(SEM) ? anterior.get(SEM).valor : 0)) { /* sem fornecedor não entra */ }

    const comDiferenca = fornecedores.filter((f) => f.situacao === 'diferenca' || f.situacao === 'so-anterior' || f.situacao === 'so-aging');

    return {
      natureza: entrada.natureza || 'fornecedores',
      competencia: entrada.competencia, mesAnterior: entrada.mesAnterior, mesAtual: entrada.mesAtual,
      conta,
      fornecedores, comDiferenca,
      razPorChave, anterior, atual,
      linhas, porLinha: nomes.porLinha, listaFornecedores: nomes.fornecedores,
      semFornecedor: { qtd: semFornecedor.length, linhas: semFornecedor.map((l) => l.i) },
      ponte: {
        anterior: totalAnterior, notas: totalNotas, baixas: totalBaixas, movimento: totalMovimento,
        esperado: totalEsperado, atual: totalAtual, diferenca: diferencaTotal,
        saldoRazao: (conta && typeof conta.saldoFinal === 'number') ? conta.saldoFinal : (totalNotas - totalBaixas),
        // De onde veio o saldo inicial: 'aging' (aging do mês passado) ou 'razao' (aging do mês
        // passado − títulos da B em aberto + pendências da A = saldo contábil do mês passado).
        inicio: { modo: inicio.modo, aging: inicio.aging, tirados: inicio.tirados, pendentesA: inicio.pendentesA,
          qtdTirados: inicio.qtdTirados, qtdPendentes: inicio.qtdPendentes, competencia: inicio.competencia },
      },
      resumo: {
        fornecedores: fornecedores.length,
        batem: fornecedores.filter((f) => f.situacao === 'bate').length,
        conciliadas: fornecedores.filter((f) => f.situacao === 'conciliada').length,
        comDiferenca: comDiferenca.length,
        semFornecedor: semFornecedor.length,
        diferenca: diferencaTotal,
      },
      invariantes: { ok: falhas.length === 0, falhas },
      ms: Date.now() - t0,
    };
  }

  return {
    calcular, fornecedorDoHistorico, documentoDoHistorico, chaveDoTitulo,
    normalizarDocumento, documentoDaLinha, itensAB, conciliarAutomatico, emAbertoAB, tipoAB, proximoIdAB, REGRAS_AB,
    compararPorDocumento, arrumarGruposAB, relatorioAB, pendenciasAB, saldoInicialAB, idsDeTitulos, COMO_AB, nomeComparavel, ladosDoRazao,
    conciliarPorValor, valorRedondo, ehPorValor, ladoDC,
    ehComMargem, MARGEM_AB, atualizarAB, faltandoNoGrupo, resumoDoItem, compararVersoes, resumoDaComparacao,
  };
});
