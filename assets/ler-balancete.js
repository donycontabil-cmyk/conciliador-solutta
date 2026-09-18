/*
 * Conciliador Solutta — ler-balancete.js
 * Balancete mensal, a base do RELATÓRIO DE APRESENTAÇÃO (Dony, 18/09/2026: "um relatório de
 * apresentação dentro da empresa, com um lugar para importar os balancetes").
 *
 * Desenho visto (arquivos reais, 18/09/2026): uma aba; no topo o nome da empresa e
 * "Período: 01/01/2026 à 31/01/2026", embaixo o CNPJ e a emissão; cabeçalho
 * "Conta Contabil | Red. | Título da Conta | Saldo Ant. | Débitos | Créditos | Saldo Atual"; uma linha
 * por conta, sintéticas e analíticas ("1", "1.1", …, "1.1.1.001.00001"), números em texto
 * ("1.234,56", saldo credor com sinal de menos) e, no fim, "Total Geral:".
 * As colunas são achadas pelo TÍTULO (com sinônimos), como nos outros leitores.
 *
 * Saída (VALORES EM CENTAVOS; saldos no sentido débito − crédito: devedor +, credor −):
 * { tipo: 'balancete', empresa, cnpj, periodo: { de, ate }, competencia, variosMeses,
 *   contas: [{ conta, reduzido, titulo, nivel, pai, analitica, saldoAnterior, debitos, creditos, saldoAtual }],
 *   total: { debitos, creditos } | null, confere, avisos, linhasIgnoradas }
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerBalancete = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  function chaveTitulo(v) {
    return Util.semAcento(v === null || v === undefined ? '' : String(v)).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  const SINONIMOS = {
    conta: ['contacontabil', 'conta', 'classificacao', 'codigo', 'codigodaconta', 'contaclassificacao'],
    reduzido: ['red', 'reduzido', 'reduzida', 'codreduzido', 'contareduzida', 'codigoreduzido'],
    titulo: ['titulodaconta', 'titulo', 'descricaodaconta', 'descricao', 'nomedaconta', 'nome'],
    saldoAnterior: ['saldoant', 'saldoanterior', 'saldoinicial'],
    debitos: ['debitos', 'debito'],
    creditos: ['creditos', 'credito'],
    saldoAtual: ['saldoatual', 'saldofinal'],
  };
  const RE_CONTA = /^\d+(\.\d+)*$/;

  function mapear(linha) {
    const chaves = (linha || []).map(chaveTitulo);
    const mapa = {};
    const usados = new Set();
    for (const campo of Object.keys(SINONIMOS)) {
      for (const sin of SINONIMOS[campo]) {
        const i = chaves.findIndex((c, k) => c === sin && !usados.has(k));
        if (i >= 0) { mapa[campo] = i; usados.add(i); break; }
      }
    }
    mapa.temHistorico = chaves.indexOf('historico') >= 0;
    // Coluna de mês/competência = base com vários meses (ex.: a "Base_Normalizada" da planilha de
    // apresentação), não o balancete de um mês.
    mapa.temMes = chaves.some((c) => /^(mes|competencia|periodo|mesano|anomes)$/.test(c));
    return mapa;
  }

  function acharCabecalho(abas) {
    for (let a = 0; a < abas.length; a++) {
      const linhas = abas[a].linhas;
      for (let r = 0; r < Math.min(20, linhas.length); r++) {
        const m = mapear(linhas[r]);
        if (m.temHistorico || m.temMes) continue;
        if (!['conta', 'titulo', 'saldoAnterior', 'debitos', 'creditos', 'saldoAtual'].every((k) => m[k] !== undefined)) continue;
        // Conta repetida em muitas linhas também é tabela de vários meses (ou relatório de outro tipo).
        const codigos = linhas.slice(r + 1).map((l) => (l && l[m.conta] !== null && l[m.conta] !== undefined ? String(l[m.conta]).replace(/\s+/g, '') : '')).filter((c) => RE_CONTA.test(c));
        if (codigos.length && new Set(codigos).size < codigos.length * 0.9) continue;
        return { aba: a, linha: r, mapa: m };
      }
    }
    return null;
  }

  function reconhecer(abas) {
    const cab = acharCabecalho(abas);
    return cab ? { tipo: 'balancete', cabecalho: cab,
      motivo: 'Este arquivo é um BALANCETE: conta por conta, com saldo anterior, débitos, créditos e saldo atual.' } : null;
  }

  function centavosDe(v) {
    const n = Util.paraNumero(v);
    return n === null ? 0 : Util.centavos(n);
  }

  // Empresa, CNPJ e período escritos acima do cabeçalho.
  function topo(linhas, ate) {
    const r = { empresa: '', cnpj: '', periodo: null };
    for (let i = 0; i < ate; i++) {
      for (const c of linhas[i] || []) {
        if (c === null || c === undefined) continue;
        const t = String(c).replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const s = Util.semAcento(t);
        const per = s.match(/periodo\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:a|ate|-)\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        if (per) { const de = Util.lerData(per[1]), ateD = Util.lerData(per[2]); if (de && ateD) r.periodo = { de: de.texto, ate: ateD.texto }; continue; }
        const cnpj = s.match(/cnpj\s*:?\s*([\d./-]{14,18})/i);
        if (cnpj) { r.cnpj = Util.soDigitos(cnpj[1]); continue; }
        if (!r.empresa && !/emissao|pagina|folha|balancete/i.test(s) && /[a-z]/i.test(s)) r.empresa = t;
      }
    }
    return r;
  }

  function ler(abas, opcoes) {
    const rec = reconhecer(abas);
    if (!rec) throw new Error('Não achei o cabeçalho de um balancete (Conta, Título, Saldo anterior, Débitos, Créditos, Saldo atual).');
    const { aba, linha: rCab, mapa } = rec.cabecalho;
    const linhas = abas[aba].linhas;
    const info = topo(linhas, rCab);
    const texto = (l, i) => (i === undefined || l[i] === null || l[i] === undefined ? '' : String(l[i]).replace(/\s+/g, ' ').trim());
    const contas = [];
    const vistas = new Set();
    let total = null, linhasIgnoradas = 0, repetidas = 0;
    for (let r = rCab + 1; r < linhas.length; r++) {
      const l = linhas[r];
      if (!l || !l.some((c) => c !== null && String(c).trim() !== '')) continue;
      const codigo = texto(l, mapa.conta).replace(/\s+/g, '');
      if (/^total/i.test(Util.semAcento(codigo)) || (!codigo && /^total/i.test(Util.semAcento(texto(l, mapa.titulo))))) {
        total = { debitos: centavosDe(l[mapa.debitos]), creditos: centavosDe(l[mapa.creditos]) };
        continue;
      }
      if (!RE_CONTA.test(codigo)) { linhasIgnoradas++; continue; }
      if (vistas.has(codigo)) { repetidas++; continue; } // cabeçalho de página repetido ou conta em dobro
      vistas.add(codigo);
      const partes = codigo.split('.');
      contas.push({
        conta: codigo, reduzido: texto(l, mapa.reduzido), titulo: texto(l, mapa.titulo),
        nivel: partes.length, pai: partes.length > 1 ? partes.slice(0, -1).join('.') : '', analitica: true,
        saldoAnterior: centavosDe(l[mapa.saldoAnterior]), debitos: centavosDe(l[mapa.debitos]),
        creditos: centavosDe(l[mapa.creditos]), saldoAtual: centavosDe(l[mapa.saldoAtual]),
      });
    }
    // Analítica = conta sem filha no balancete.
    const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
    contas.forEach((c) => { c.analitica = !pais.has(c.conta); });

    // Conferências: cada conta (anterior + débitos − créditos = atual), as de 1º nível com o Total Geral,
    // o balancete fechado (soma dos saldos de 1º nível = zero) e cada conta-mãe = soma das filhas.
    const avisos = [];
    const erradas = contas.filter((c) => c.saldoAnterior + c.debitos - c.creditos !== c.saldoAtual);
    if (erradas.length) avisos.push(erradas.length + ' conta(s) em que saldo anterior + débitos − créditos não dá o saldo atual (ex.: ' + erradas[0].conta + ').');
    const primeiras = contas.filter((c) => c.nivel === 1);
    const soma = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
    let confere = !erradas.length;
    if (total) {
      if (soma(primeiras, 'debitos') !== total.debitos || soma(primeiras, 'creditos') !== total.creditos) {
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

    let periodo = info.periodo;
    if (!periodo && opcoes && opcoes.nomeArquivo) {
      // Sem período no conteúdo: tenta o mês pelo nome ("Balancete_07_2026", "jan_26").
      const comp = competenciaPeloNome(opcoes.nomeArquivo);
      if (comp) { const ini = Util.inicioDaCompetencia(comp), fim = Util.fimDaCompetencia(comp); periodo = { de: ini.texto, ate: fim.texto, peloNome: true }; }
    }
    const de = periodo && Util.lerData(periodo.de), ate = periodo && Util.lerData(periodo.ate);
    const variosMeses = !!(de && ate && (de.mes !== ate.mes || de.ano !== ate.ano));
    if (variosMeses) avisos.push('O período do balancete vai de ' + periodo.de + ' a ' + periodo.ate + ': o relatório espera um balancete por mês (débitos e créditos do mês).');
    return {
      tipo: 'balancete', empresa: info.empresa, cnpj: info.cnpj, periodo, competencia: ate ? Util.competenciaDe(ate) : null, variosMeses,
      contas, total, confere, avisos, linhasIgnoradas,
    };
  }

  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // "Balancete_07_2026" / "07.2026" / "jan_26" / "janeiro 2026" -> 'AAAA-MM-01'.
  function competenciaPeloNome(nome) {
    const s = Util.semAcento(String(nome || '')).toLowerCase();
    let m = s.match(/(?:^|[^\d])(0[1-9]|1[0-2])[.\-_ /](20\d{2})(?!\d)/);
    if (m) return m[2] + '-' + m[1] + '-01';
    m = s.match(/(?:^|[^a-z])(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[.\-_ /]*(20\d{2}|\d{2})(?!\d)/);
    if (m) { const ano = m[2].length === 2 ? '20' + m[2] : m[2]; return ano + '-' + String(MESES_CURTOS.indexOf(m[1]) + 1).padStart(2, '0') + '-01'; }
    return null;
  }

  return { reconhecer, ler, competenciaPeloNome, SINONIMOS };
});
