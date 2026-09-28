/*
 * Conciliador Solutta — motor-consolidado.js
 * CONSOLIDAÇÃO de várias empresas num relatório só (Dony, 28/09/2026: "existem algumas empresas em que eu
 * preciso consolidar; quero entrar nos relatórios de consolidação e escolher as empresas que eu quero").
 *
 * O jeito é simples de propósito: a consolidação SOMA OS BALANCETES das empresas escolhidas — mês a mês,
 * conta por conta — e devolve balancetes no mesmo formato de sempre. Daí para a frente o relatório de
 * apresentação inteiro (DRE mensal e trimestral, balanço, indicadores, fluxo de caixa, simulação) sai do
 * jeito que já sai para uma empresa, sem nada de novo.
 *
 * ELIMINAÇÕES (Dony escolheu "marcar as contas que se eliminam"): as contas marcadas são operações ENTRE as
 * empresas do grupo — mútuo de uma com a outra, venda de uma para a outra, participação societária. No
 * consolidado elas são ZERADAS, e o valor sai também das contas-mãe (senão a sintética ficaria maior que a
 * soma das filhas). Os dois lados têm que se anular: quando a soma das contas marcadas não dá zero, a
 * diferença vira AVISO — é ela que denuncia o lançamento que faltou de um lado.
 *
 * Nada aqui grava: recebe os balancetes já lidos e devolve os consolidados.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), require('./motor-apresentacao.js'));
  else raiz.MotorConsolidado = fabrica(raiz.Util, raiz.MotorApresentacao);
})(typeof self !== 'undefined' ? self : this, function (Util, MotorApresentacao) {
  'use strict';

  const soDigitos = (c) => String(c || '').replace(/\D+/g, '');
  const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  // A conta-mãe de "1.1.2.003" é "1.1.2" (pelo código; é o mesmo caminho que o relatório usa).
  function maes(conta) {
    const partes = String(conta || '').split('.');
    const lista = [];
    for (let n = partes.length - 1; n >= 1; n--) lista.push(partes.slice(0, n).join('.'));
    return lista;
  }
  const ehFilhaDe = (conta, pai) => String(conta).indexOf(String(pai) + '.') === 0;

  /**
   * partes: [{ codigo, nome, balancetes: [{ competencia, contas: [...] }] }]
   * op: { eliminar: ['1.1.2.003.0007', …] }  (códigos das contas de operações entre as empresas do grupo)
   * Devolve { balancetes, empresas, competencias, eliminacoes, avisos, conferencia }.
   */
  function consolidar(partes, op) {
    const lista = (partes || []).filter((p) => p && p.codigo);
    const opc = op || {};
    const marcadas = (opc.eliminar || []).map(texto).filter(Boolean);
    const digitosMarcados = new Set(marcadas.map(soDigitos).filter(Boolean));
    const avisos = [];
    // Uma conta é eliminada quando ela é a marcada, ou uma filha dela (marcar o grupo elimina o galho todo).
    const eliminada = (conta) => {
      const c = texto(conta);
      if (digitosMarcados.has(soDigitos(c))) return true;
      return marcadas.some((m) => ehFilhaDe(c, m));
    };

    const porMes = new Map();          // competência -> Map(conta -> conta consolidada)
    const titulosDiferentes = [];
    const empresas = [];
    const doEliminado = new Map();     // conta marcada -> { conta, titulo, porEmpresa, meses }

    lista.forEach((p) => {
      const meses = [];
      let quantas = 0;
      (p.balancetes || []).forEach((b) => {
        const comp = texto(b.competencia);
        if (!comp || !b.contas || !b.contas.length) return;
        meses.push(comp);
        if (!porMes.has(comp)) porMes.set(comp, new Map());
        const alvo = porMes.get(comp);
        b.contas.forEach((c) => {
          const cod = texto(c.conta);
          if (!cod) return;
          quantas++;
          let x = alvo.get(cod);
          if (!x) {
            x = { conta: cod, reduzido: texto(c.reduzido), titulo: texto(c.titulo), nivel: c.nivel, pai: texto(c.pai),
              saldoAnterior: 0, debitos: 0, creditos: 0, saldoAtual: 0, empresas: [] };
            alvo.set(cod, x);
          } else if (x.titulo && texto(c.titulo) && Util.normalizarNome(x.titulo) !== Util.normalizarNome(c.titulo)
            && !titulosDiferentes.some((t) => t.conta === cod)) {
            titulosDiferentes.push({ conta: cod, um: x.titulo, outro: texto(c.titulo) });
          }
          x.saldoAnterior += c.saldoAnterior || 0;
          x.debitos += c.debitos || 0;
          x.creditos += c.creditos || 0;
          x.saldoAtual += c.saldoAtual || 0;
          if (x.empresas.indexOf(p.codigo) < 0) x.empresas.push(p.codigo);
          // O que cada empresa tem nas contas marcadas (para mostrar os dois lados da eliminação).
          if (eliminada(cod)) {
            const k = doEliminado.get(cod) || { conta: cod, titulo: texto(c.titulo), porEmpresa: new Map(), meses: new Set() };
            if (!k.titulo) k.titulo = texto(c.titulo);
            const antes = k.porEmpresa.get(p.codigo) || { codigo: p.codigo, nome: p.nome || p.codigo, valor: 0 };
            antes.valor += MotorApresentacao.valorUsado(c);
            k.porEmpresa.set(p.codigo, antes);
            k.meses.add(comp);
            doEliminado.set(cod, k);
          }
        });
      });
      empresas.push({ codigo: p.codigo, nome: p.nome || p.codigo, meses: meses.sort(), contas: quantas });
    });

    const competencias = Array.from(porMes.keys()).sort();
    // Os dois lados de uma eliminação quase nunca têm o MESMO código (o mútuo é 1.1.2… numa empresa e 2.1.6…
    // na outra), então a conferência não é conta por conta: é a soma de TODAS as contas marcadas, que tem que
    // dar zero — um lado devedor, o outro credor. Ainda separada em patrimoniais (1 e 2) e resultado (3, 4 e
    // 5), porque é assim que dá para achar qual lado ficou faltando.
    const classeDela = (conta) => (/^[12]/.test(soDigitos(conta).charAt(0) || String(conta).charAt(0)) ? 'patrimonial' : 'resultado');
    const eliminacoes = Array.from(doEliminado.values()).map((k) => {
      const porEmpresa = Array.from(k.porEmpresa.values()).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      return { conta: k.conta, titulo: k.titulo, classe: classeDela(k.conta), porEmpresa,
        valor: porEmpresa.reduce((s, e) => s + e.valor, 0), meses: Array.from(k.meses).sort() };
    }).sort((a, b) => MotorApresentacao.compararContas(a.conta, b.conta));
    const somaDe = (classe) => eliminacoes.filter((e) => !classe || e.classe === classe).reduce((s, e) => s + e.valor, 0);
    const somaDasEliminacoes = { total: somaDe(null), patrimonial: somaDe('patrimonial'), resultado: somaDe('resultado') };
    somaDasEliminacoes.confere = Math.abs(somaDasEliminacoes.patrimonial) <= 1 && Math.abs(somaDasEliminacoes.resultado) <= 1;
    eliminacoes.forEach((e) => { e.confere = Math.abs(somaDasEliminacoes[e.classe]) <= 1; });
    // Zerar as contas eliminadas e tirar o valor delas das contas-mãe.
    let zeradas = 0;
    porMes.forEach((alvo) => {
      const fora = Array.from(alvo.values()).filter((c) => eliminada(c.conta));
      fora.forEach((c) => {
        // Só a conta ANALÍTICA desconta das mães (a sintética marcada já vem pelas filhas dela).
        const temFilha = Array.from(alvo.keys()).some((k) => ehFilhaDe(k, c.conta));
        if (!temFilha) {
          maes(c.conta).forEach((m) => {
            const mae = alvo.get(m);
            if (!mae || eliminada(m)) return;
            mae.saldoAnterior -= c.saldoAnterior;
            mae.debitos -= c.debitos;
            mae.creditos -= c.creditos;
            mae.saldoAtual -= c.saldoAtual;
          });
        }
        c.saldoAnterior = 0; c.debitos = 0; c.creditos = 0; c.saldoAtual = 0; c.eliminada = true;
        zeradas++;
      });
    });

    const balancetes = competencias.map((comp) => ({
      competencia: comp,
      contas: Array.from(porMes.get(comp).values()).sort((a, b) => MotorApresentacao.compararContas(a.conta, b.conta)),
    }));
    // Conferência: em cada mês, a soma dos saldos de 1º nível tem que continuar dando zero.
    const conferencia = balancetes.map((b) => {
      const soma = b.contas.filter((c) => c.nivel === 1).reduce((s, c) => s + c.saldoAtual, 0);
      return { competencia: b.competencia, confere: Math.abs(soma) <= 1, diferenca: soma, empresas: empresasDoMes(lista, b.competencia) };
    });

    // Avisos
    if (!lista.length) avisos.push('Nenhuma empresa escolhida para consolidar.');
    const faltando = competencias.filter((comp) => empresasDoMes(lista, comp).length < lista.length);
    if (faltando.length) {
      avisos.push(faltando.map((c) => Util.nomeCompetencia(c) + ' (' + empresasDoMes(lista, c).join(', ') + ')').join('; ') +
        ': nem todas as empresas têm balancete desse mês — o consolidado do mês é só das que têm.');
    }
    [['patrimonial', 'de ativo e passivo'], ['resultado', 'de receita, custo e despesa']].forEach(([classe, nome]) => {
      const dif = somaDasEliminacoes[classe];
      if (Math.abs(dif) <= 1) return;
      const dessas = eliminacoes.filter((e) => e.classe === classe);
      avisos.push('As contas marcadas para eliminar ' + nome + ' não se anulam entre as empresas: ' +
        dessas.map((e) => e.conta + ' ' + e.porEmpresa.map((x) => x.nome + ' ' + Util.formatarCentavos(x.valor)).join(' e ')).join(' · ') +
        ' — sobra ' + Util.formatarCentavos(dif) + '. Confira o lançamento nos dois lados (o consolidado fica fora do lugar nessa diferença).');
    });
    titulosDiferentes.slice(0, 3).forEach((t) => {
      avisos.push('A conta ' + t.conta + ' tem nomes diferentes nas empresas ("' + t.um + '" e "' + t.outro + '"): confira se o plano de contas é o mesmo. No consolidado vale o primeiro.');
    });
    conferencia.filter((c) => !c.confere).forEach((c) => {
      avisos.push('Em ' + Util.nomeCompetencia(c.competencia) + ' a soma dos saldos de 1º nível do consolidado não dá zero (' + Util.formatarCentavos(c.diferenca) + ').');
    });

    return { balancetes, empresas, competencias, eliminacoes, somaDasEliminacoes, zeradas, avisos, conferencia,
      resumo: { empresas: lista.length, meses: competencias.length, eliminadas: eliminacoes.length, anulam: somaDasEliminacoes.confere } };
  }

  function empresasDoMes(lista, comp) {
    return lista.filter((p) => (p.balancetes || []).some((b) => texto(b.competencia) === comp && b.contas && b.contas.length)).map((p) => p.codigo);
  }

  return { consolidar };
});
