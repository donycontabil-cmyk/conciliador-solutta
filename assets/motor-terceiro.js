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

  return { calcular, fornecedorDoHistorico, documentoDoHistorico, chaveDoTitulo };
});
