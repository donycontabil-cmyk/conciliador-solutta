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
  function documentoDaLinha(l) {
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
    'doc-fornecedor-par': 'mesmo documento e fornecedor: a baixa mata a nota de mesmo valor',
    'doc-fornecedor': 'mesmo documento e fornecedor: soma igual nos dois lados',
    'doc-par': 'mesmo documento, nome diferente: a baixa mata a nota de mesmo valor',
    'doc': 'mesmo documento, nome diferente: soma igual nos dois lados',
    'manual': 'marcado à mão',
  };

  // Itens das partes A e B, com identidade que nasce do CONTEÚDO (Parte 4): trocar a ordem
  // das linhas do arquivo não troca o ID de ninguém. `legado` traduz os ids da versão 5
  // (posição no aging e digital do razão) para os de agora.
  //
  // CONTINUAR do mês anterior (Dony, 14/09/2026: "no mês seguinte, continuar da conciliação
  // anterior ou fazer desconsiderando a anterior"). Com `entrada.continuacao` (as pendências
  // do mês anterior, ver pendenciasAB):
  //   Parte A = aging do mês passado SEM os títulos que ficaram em aberto na Parte B do mês
  //             passado + o que ficou em aberto na Parte A do mês passado + razão do mês.
  // Assim a diferença (em aberto A − em aberto B) é a acumulada de verdade entre a
  // contabilidade e o financeiro. Sem `continuacao` é o "começar do zero".
  function itensAB(entrada, r) {
    const A = [], B = [];
    const porId = new Map();
    const legado = new Map();
    const lancs = (entrada.contaRazao && entrada.contaRazao.lancamentos) || [];
    const cont = entrada.continuacao || null;
    // O título que ficou em aberto na B do mês passado (TB:<hash>) é o mesmo do aging do mês
    // passado que entra na A agora (TA:<hash>): mesmo arquivo, mesmo conteúdo.
    const tirar = new Set(cont ? (cont.B || []).map((x) => String(x.id).replace(/^TB:/, 'TA:')) : []);
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
      const vezes = new Map();
      (lista || []).forEach((t, i) => {
        const doc = normalizarDocumento(t.documento);
        const base = [doc, t.parcela || '', Util.soDigitos(t.cnpj), t.valor, t.vencimento || '', Util.normalizarNome(t.nome)].join('|');
        const n = vezes.get(base) || 0; vezes.set(base, n + 1);
        const id = prefixo + ':' + Util.hash8(base + '|' + n);
        const item = { id, lado, fonte, doc, parcela: t.parcela || '',
          chave: chaveDoTitulo(t), nome: t.nome, cnpj: t.cnpj || '', data: t.vencimento || '', ordem: 0, historico: '', valor: t.valor };
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
      const x = guardar({ id: 'RZ:' + Util.hash8(l.digital), lado: 'A', fonte: lc.credito > 0 ? 'nota' : 'baixa',
        doc: documentoDaLinha(lc), parcela: '', chave: d.chave, nome: d.nome, cnpj: '', data: lc.data, ordem: l.dia,
        historico: lc.historico || '', valor: lc.credito > 0 ? lc.credito : -lc.debito, linha: l.i });
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
   * @returns lista de conciliações novas, com IDs a partir do próximo livre
   */
  function conciliarAutomatico(itens, existentes, quem, quando) {
    const usados = new Set();
    (existentes || []).forEach((g) => (g.a || []).concat(g.b || []).forEach((id) => usados.add(id)));
    let proximo = proximoIdAB(existentes);
    const candidatos = itens.A.concat(itens.B).filter((x) => x.doc && !usados.has(x.id));
    const livre = new Set(candidatos.map((x) => x.id));
    const novos = [];
    const soma = (xs) => xs.reduce((s, x) => s + x.valor, 0);
    const porOrdem = (p, q) => p.ordem - q.ordem;

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
    function agrupar(comFornecedor) {
      const m = new Map();
      for (const x of candidatos) {
        if (!livre.has(x.id) || (comFornecedor && x.chave === SEM)) continue;
        const k = comFornecedor ? x.doc + '|' + x.chave : x.doc;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(x);
      }
      return Array.from(m.entries()).sort(compararChave).map((e) => e[1]);
    }
    function pares(regra, comFornecedor) {
      for (const xs of agrupar(comFornecedor)) {
        const notas = xs.filter((x) => x.lado === 'A' && x.valor > 0).sort(porOrdem);
        const baixas = xs.filter((x) => x.lado === 'A' && x.valor < 0).sort(porOrdem);
        for (const bx of baixas) {
          const j = notas.findIndex((n) => n.valor === -bx.valor && n.ordem <= bx.ordem);
          if (j >= 0) { registrar([notas[j], bx], regra); notas.splice(j, 1); }
        }
      }
    }
    function grupos(regra, comFornecedor) {
      for (const xs of agrupar(comFornecedor)) {
        if (xs.length < 2) continue;
        if (soma(xs.filter((x) => x.lado === 'A')) === soma(xs.filter((x) => x.lado === 'B'))) registrar(xs, regra);
      }
    }
    pares('doc-fornecedor-par', true);
    grupos('doc-fornecedor', true);
    pares('doc-par', false);
    grupos('doc', false);
    return novos;
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
    const automaticas = porId.filter((x) => x.grupo.regra !== 'manual');
    const ab = emAbertoAB(itens, grupos);
    const porRegra = {};
    for (const x of automaticas) {
      const k = x.grupo.regra;
      if (!porRegra[k]) porRegra[k] = { conciliacoes: 0, itens: 0 };
      porRegra[k].conciliacoes++;
      porRegra[k].itens += x.itens.length;
    }
    const conta = (lista, pred) => lista.filter(pred).length;
    return {
      manuais, automaticas, porRegra,
      abertosA: ab.abertosA.slice().sort(compararPorDocumento), abertosB: ab.abertosB.slice().sort(compararPorDocumento),
      valorAbertoA: ab.valorA, valorAbertoB: ab.valorB,
      totais: {
        conciliacoes: porId.length, automaticas: automaticas.length, manuais: manuais.length,
        itensConciliados: porId.reduce((s, x) => s + x.itens.length - x.faltando, 0),
        itensAutomaticas: automaticas.reduce((s, x) => s + x.itens.length, 0), itensManuais: manuais.reduce((s, x) => s + x.itens.length, 0),
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

    // Linhas do razão para a régua de nomes. Digital estável (nasce do conteúdo).
    const ocorr = new Map();
    const linhas = razao.lancamentos.map((l, i) => {
      const base = 'R|' + (razao.conta.codigo || '') + '|' + l.data + '|' + String(l.historico || '').slice(0, 120) + '|' +
        l.debito + '|' + l.credito;
      const n = ocorr.get(base) || 0; ocorr.set(base, n + 1);
      return {
        i, digital: base + '|' + n, conta: String(razao.conta.codigo || ''),
        dc: l.credito > 0 ? 'C' : 'D', dia: Util.montarData(l.dia, l.mes, l.ano).numero,
        debito: l.debito, credito: l.credito, historico: l.historico || '',
        fornecedorDeclarado: { nome: fornecedorDoHistorico(l.historico) },
      };
    });

    // Cadastro = os títulos dos dois agings (nome + CNPJ ensinam a régua).
    const titulos = agAnt.titulos.concat(agAtu.titulos).map((t) => ({ nome: t.nome, cnpj: t.cnpj }));
    const nomes = MotorNomes.resolver(linhas, { donos, titulos });

    // Agrupa aging anterior e atual pela mesma chave da régua.
    function agrupaAging(tits) {
      const m = new Map();
      for (const t of tits) {
        const k = chaveDoTitulo(t);
        if (!m.has(k)) m.set(k, { chave: k, nome: t.nome, cnpj: t.cnpj || '', valor: 0, titulos: [] });
        const g = m.get(k);
        g.valor += t.valor;
        g.titulos.push(t);
        if (t.cnpj && !g.cnpj) g.cnpj = t.cnpj;
      }
      return m;
    }
    const anterior = agrupaAging(agAnt.titulos);
    const atual = agrupaAging(agAtu.titulos);

    // Agrupa o razão pela chave que a régua deu a cada linha.
    const razPorChave = new Map();
    for (const l of linhas) {
      const d = nomes.porLinha.get(l.digital);
      if (!razPorChave.has(d.chave)) razPorChave.set(d.chave, { chave: d.chave, notas: 0, baixas: 0, linhas: [] });
      const g = razPorChave.get(d.chave);
      g.notas += l.credito;
      g.baixas += l.debito;
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
    const totalAnterior = agAnt.titulos.reduce((s, t) => s + t.valor, 0);
    const totalAtual = agAtu.titulos.reduce((s, t) => s + t.valor, 0);
    const totalNotas = linhas.reduce((s, l) => s + l.credito, 0);
    const totalBaixas = linhas.reduce((s, l) => s + l.debito, 0);
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
    compararPorDocumento, arrumarGruposAB, relatorioAB, pendenciasAB,
  };
});
