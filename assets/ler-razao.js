/*
 * Conciliador Solutta — ler-razao.js
 * Lê o razão contábil a partir das linhas de uma planilha (ler-planilha.js).
 * Reconhece pelo CONTEÚDO e acha as colunas pelo TÍTULO (Parte 5.1).
 *
 * Desenhos conhecidos (Parte 5.2):
 *  - Desenho A (.xls): linha "Conta:" com código reduzido, classificação e nome;
 *    cabeçalho "Data | Lote/Número | Histórico | Cta.C.Part. | [Filial] | Débito | Crédito | Saldo | [Saldo-Exercício]".
 *    Visto nos razões reais usados como modelo (set/2026): "Saldo" é o acumulado SÓ do período
 *    (começa em zero) e "Saldo-Exercício" é o acumulado com o saldo anterior.
 *  - Desenho B (.xlsx "Relatório Razão Contábil"): linha "classificação | código - nome",
 *    cabeçalho "DATA | LOTE | LANC | C/PARTIDA | HISTORICO | DÉBITO | CRÉDITO | SALDO",
 *    "Saldo anterior", "Totais conta:"; o período pode vir só no nome do arquivo.
 *
 * Saída (igual para todos os desenhos). VALORES EM CENTAVOS INTEIROS.
 * Saldos no sentido DÉBITO − CRÉDITO (devedor positivo, credor negativo), como o
 * razão mostra; o motor é que vira o sinal conforme a natureza da conta (Parte 4).
 * {
 *   tipo: 'razao', desenho, empresa, cnpj,
 *   periodo: { de, ate }, periodoOrigem: 'conteudo' | 'nome-do-arquivo' | 'datas-dos-lancamentos',
 *   contas: [{ codigo, classificacao, nome, saldoAnterior,
 *     lancamentos: [{ data, dia, mes, ano, numero, historico, contrapartida, debito, credito, saldo }],
 *     totalDebito, totalCredito, saldoFinal, saldoFinalDeclarado, confere, avisos }],
 *   avisos, linhasIgnoradas
 * }
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerRazao = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  // Títulos comparados só com letras e números, sem acento, em minúsculas.
  function chaveTitulo(v) {
    return Util.semAcento(v === null || v === undefined ? '' : String(v)).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  // Sinônimos (Parte 5.2). Cada lista em ordem de preferência.
  // "complhis" (complemento do histórico) vem ANTES de "historico": no razão da Univale o
  // texto de verdade está no COMPLHIS (14/09/2026, Dony); nos desenhos A/B não existe COMPLHIS,
  // então "historico" continua ganhando.
  // Razão de adiantamento de um cliente real (15/09/2026, desenho D): "Cont. Contábil | [nome da conta,
  // sem título] | Cta Red.: | Dt. Movto | Lote | Lanç | C.P. Histórico | Documento | Débito |
  // Crédito | Saldo Acum. | D/C" — por isso "dtmovto", "cphistorico", "ctared", "contcontabil" e "saldoacum".
  const SINONIMOS = {
    data: ['data', 'dt', 'datalanc', 'datadolancamento', 'datalancamento', 'datamovimento', 'datamov', 'dtmovto', 'dtmovimento', 'dtmov'],
    numero: ['numero', 'num', 'lancamento', 'lanc', 'lcto', 'nlanc', 'nlancamento', 'numlancamento', 'lote', 'numlote'],
    historico: ['complhis', 'complementohistorico', 'historicocomplemento', 'complemento', 'historico', 'historicos', 'cphistorico', 'cphist'],
    contrapartida: ['ctacpart', 'contrapartida', 'cpart', 'cpartida', 'ctacpartida', 'contracpartida', 'ccontrapartida', 'contacontrapartida', 'contacontabilcontrapartida'],
    filial: ['filial'],
    debito: ['debito', 'debitos', 'valordebito', 'vlrdebito'],
    credito: ['credito', 'creditos', 'valorcredito', 'vlrcredito'],
    saldo: ['saldo', 'saldoatual', 'saldoacum', 'saldoacumulado'],
    saldoExercicio: ['saldoexercicio'],
    // Razão em LISTA (uma linha por lançamento, a conta numa coluna) — desenhos C e D (clientes reais).
    conta: ['contareduzida', 'contacontabil', 'contaredz', 'reduzida', 'ctared', 'ctareduzida', 'ctaredz', 'contared'],
    contaClassificacao: ['contacontabil', 'classificacao', 'classificacaocontabil', 'contcontabil', 'ctacontabil'],
    descricaoConta: ['descricao', 'descricaoconta', 'nomeconta', 'descricaodaconta'],
    documento: ['numdocumento', 'numerodocumento', 'ndocumento', 'nrodocumento', 'nrodoc', 'documento'],
  };

  function mapearCabecalho(linha) {
    const chaves = linha.map(chaveTitulo);
    const mapa = {};
    for (const campo of Object.keys(SINONIMOS)) {
      for (const sin of SINONIMOS[campo]) {
        const idx = chaves.indexOf(sin);
        if (idx >= 0) { mapa[campo] = idx; break; }
      }
    }
    return mapa;
  }

  function ehCabecalho(linha) {
    const m = mapearCabecalho(linha);
    return m.data !== undefined && m.historico !== undefined && (m.debito !== undefined || m.credito !== undefined);
  }

  // Cabeçalho de um razão em LISTA (desenho C): tem uma coluna de CONTA, data, histórico e
  // débito/crédito. É o que distingue do razão em blocos (que não tem coluna "conta") e do
  // relatório de títulos/aging (que não tem coluna de débito nem de crédito).
  function ehCabecalhoFlat(linha) {
    const m = mapearCabecalho(linha);
    return m.conta !== undefined && m.data !== undefined && m.historico !== undefined &&
      (m.debito !== undefined || m.credito !== undefined);
  }

  // Balancete: primeira coluna "Código"/"Conta"/"Classificação", com colunas de saldo, SEM histórico.
  function ehCabecalhoDeBalancete(linha) {
    const chaves = linha.map(chaveTitulo).filter(Boolean);
    if (!chaves.length) return false;
    const primeira = chaves[0];
    const temHistorico = chaves.indexOf('historico') >= 0;
    const temSaldos = chaves.some((c) => /^saldo(anterior|atual|final)?$/.test(c)) && chaves.some((c) => /^(debito|credito)s?$/.test(c));
    return !temHistorico && temSaldos && /^(codigo|conta|classificacao|cod|reduzido)$/.test(primeira);
  }

  function celulasCheias(linha) {
    const r = [];
    linha.forEach((v, i) => { if (v !== null && v !== undefined && String(v).trim() !== '') r.push({ i, v }); });
    return r;
  }

  const RE_CLASSIFICACAO = /^\d+(\.\d+)+$/;
  const RE_CODIGO_NOME = /^(\d+)\s*-\s*(.+)$/;

  // Linha de identificação da conta.
  function lerLinhaDeConta(linha) {
    const cheias = celulasCheias(linha);
    if (!cheias.length) return null;
    const primeira = chaveTitulo(cheias[0].v);
    // Desenho A: "Conta:" seguido de código, classificação e nome (em células ou num texto só).
    if (primeira === 'conta' || /^conta\d/.test(primeira)) {
      let resto = cheias.slice(1).map((c) => String(c.v).trim());
      if (primeira !== 'conta') resto = [String(cheias[0].v).replace(/^\s*conta\s*:?\s*/i, '')].concat(resto);
      const partes = [];
      resto.forEach((t) => {
        const m = t.match(/^(\d+)\s*-\s*(.+)$/);
        if (m) { partes.push(m[1]); partes.push(m[2]); } else partes.push(t);
      });
      let codigo = null, classificacao = null;
      const nomes = [];
      for (const t of partes) {
        if (classificacao === null && RE_CLASSIFICACAO.test(t)) classificacao = t;
        else if (codigo === null && /^\d+$/.test(t)) codigo = t;
        else nomes.push(t);
      }
      if (codigo === null && classificacao === null) return null;
      return { codigo: codigo || classificacao, classificacao: classificacao || '', nome: nomes.join(' ').trim(), desenho: 'A' };
    }
    // Desenho B: "1.1.1.02.0001 | 151 - Nome da conta"
    if (RE_CLASSIFICACAO.test(String(cheias[0].v).trim()) && cheias[1]) {
      const m = String(cheias[1].v).trim().match(RE_CODIGO_NOME);
      if (m) return { codigo: m[1], classificacao: String(cheias[0].v).trim(), nome: m[2].trim(), desenho: 'B' };
    }
    return null;
  }

  function textoDaLinha(linha) {
    return celulasCheias(linha).map((c) => String(c.v)).join(' ');
  }

  function ehSaldoAnterior(linha) {
    return celulasCheias(linha).some((c) => typeof c.v === 'string' && /^saldo\s+anterior/i.test(Util.semAcento(c.v).trim()));
  }

  function ehTotal(linha) {
    const cheias = celulasCheias(linha);
    return cheias.some((c) => typeof c.v === 'string' && /^(totais|total)(\s|:|$)/i.test(Util.semAcento(c.v).trim()));
  }

  function ehSaldoFinal(linha) {
    return celulasCheias(linha).some((c) => typeof c.v === 'string' && /^saldo\s+(atual|final)/i.test(Util.semAcento(c.v).trim()));
  }

  function numeroDe(v) {
    const n = Util.paraNumero(v);
    return n === null ? null : Util.centavos(n);
  }

  // Último número da linha (para "Saldo anterior" em coluna diferente da esperada).
  function ultimoNumero(linha, depoisDe) {
    for (let i = linha.length - 1; i > (depoisDe === undefined ? -1 : depoisDe); i--) {
      const n = numeroDe(linha[i]);
      if (n !== null && typeof linha[i] !== 'string') return n;
      if (n !== null && typeof linha[i] === 'string' && /[0-9]/.test(linha[i]) && !/[a-z]{3,}/i.test(linha[i])) return n;
    }
    return null;
  }

  function lerCabecalhoDoRelatorio(linhas, ate) {
    const info = { empresa: '', cnpj: '', periodo: null, titulo: '' };
    for (let r = 0; r < Math.min(ate, linhas.length); r++) {
      const linha = linhas[r] || [];
      const cheias = celulasCheias(linha);
      for (let k = 0; k < cheias.length; k++) {
        const bruto = String(cheias[k].v);
        const chave = chaveTitulo(bruto);
        const proximo = cheias[k + 1] ? String(cheias[k + 1].v).trim() : '';
        if (!info.empresa && (chave === 'empresa' || chave === 'razaosocial' || chave === 'nomedaempresa')) info.empresa = proximo;
        else if (!info.empresa && /^empresa\s*:/i.test(bruto)) info.empresa = bruto.replace(/^empresa\s*:\s*/i, '').trim();
        if (!info.cnpj && (chave === 'cnpj' || chave === 'cnpjcpf' || chave === 'inscricao')) {
          if (Util.cnpjValido(proximo)) info.cnpj = Util.limparCnpj(proximo);
        } else if (!info.cnpj && /c\.?\s*n\.?\s*p\.?\s*j\.?\s*:?/i.test(bruto)) {
          const m = bruto.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
          if (m && Util.cnpjValido(m[1])) info.cnpj = Util.limparCnpj(m[1]);
        }
        if (!info.periodo && (chave === 'periodo' || /^periodo/.test(chave))) {
          const texto = chave === 'periodo' ? proximo : bruto;
          const p = lerFaixaDeDatas(texto);
          if (p) info.periodo = p;
        }
        if (!info.titulo && /raz[aã]o/i.test(bruto) && bruto.length < 60) info.titulo = bruto.trim();
      }
    }
    return info;
  }

  function lerFaixaDeDatas(texto) {
    const s = String(texto || '');
    const m = s.match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\s*(?:-|a|até|ate|à)\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);
    if (!m) return null;
    const de = Util.lerData(m[1]), ate = Util.lerData(m[2]);
    if (!de || !ate) return null;
    return { de: de.texto, ate: ate.texto };
  }

  // Período pelo nome do arquivo (desenho B). Precisa de confirmação na tela.
  function periodoPeloNome(nome) {
    const s = String(nome || '');
    const faixa = lerFaixaDeDatas(s.replace(/_/g, ' '));
    if (faixa) return faixa;
    const m = s.match(/(\d{2})[.-]?(\d{2})[.-]?(\d{4})\s*(?:a|ate|até|-|_)\s*(\d{2})[.-]?(\d{2})[.-]?(\d{4})/i);
    if (m) {
      const de = Util.montarData(Number(m[1]), Number(m[2]), Number(m[3]));
      const ate = Util.montarData(Number(m[4]), Number(m[5]), Number(m[6]));
      if (de && ate) return { de: de.texto, ate: ate.texto };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Razão em LISTA: uma linha por lançamento, a conta numa coluna. Agrupa por conta.
  //  - Desenho C — contas a pagar de um cliente real (14/09/2026): Data Movimento, COMPLHIS (histórico),
  //    Conta reduzida, Conta contábil, Conta Contrapartida, Valor Débito, Valor Crédito. Sem saldo.
  //  - Desenho D — adiantamento a fornecedores do mesmo cliente (15/09/2026, "é extraído de forma
  //    diferente"): Cont. Contábil, o NOME da conta numa coluna SEM título (e cortado:
  //    "ADIANTAMENTO A"), Cta Red.:, Dt. Movto, Lote, Lanç, C.P. Histórico (o código do histórico
  //    padrão na frente: "783    BAIXA POR COMPENSAÇÃO…"), Documento, Débito, Crédito, Saldo Acum.
  //    e D/C na coluna ao lado. Saldo anterior numa linha só com o saldo antes do 1º lançamento;
  //    linha solta de saldo no meio (transporte de página) é ignorada; no fim, linhas de totais
  //    (débito, crédito e o saldo final). Pode trazer VÁRIOS MESES (ex.: abril a agosto).
  // ------------------------------------------------------------------
  function lerFlat(abas, opcoes) {
    const nomeArquivo = (opcoes && opcoes.nomeArquivo) || '';
    const avisos = [];
    const contasMap = new Map();
    let linhasIgnoradas = 0;
    let comSaldo = false;
    let info = { empresa: '', cnpj: '', periodo: null, titulo: '' };

    const texto = (v) => (v === null || v === undefined ? '' : String(v));
    const ehDC = (v) => /^[DC]$/i.test(texto(v).trim());
    // Saldo com o D/C da coluna ao lado: devedor positivo, credor negativo (débito − crédito).
    const saldoCom = (linha, col) => {
      if (col === undefined) return null;
      const n = numeroDe(linha[col]);
      if (n === null) return null;
      const dc = texto(linha[col + 1]).trim().toUpperCase();
      return dc === 'C' ? -Math.abs(n) : (dc === 'D' ? Math.abs(n) : n);
    };

    for (const aba of abas) {
      const linhas = aba.linhas;
      const rCab = linhas.findIndex((l) => l && ehCabecalhoFlat(l));
      if (rCab < 0) continue;
      const mapa = mapearCabecalho(linhas[rCab]);
      const cabecalho = linhas[rCab].map(chaveTitulo);
      // "C.P. Histórico": o histórico começa com o código do histórico padrão.
      const historicoComCodigo = /^cphist/.test(cabecalho[mapa.historico] || '');
      if (mapa.saldo !== undefined) comSaldo = true;
      const usadas = new Set(Object.values(mapa));
      // Nome da conta numa coluna sem título: a primeira coluna de texto (não data, não número,
      // não D/C) que não é de nenhum campo, olhando a primeira linha de lançamento.
      let colNome = mapa.descricaoConta;
      if (colNome === undefined) {
        const primeira = linhas.slice(rCab + 1).find((l) => l && mapa.data !== undefined && Util.lerData(l[mapa.data]) && mapa.conta !== undefined && texto(l[mapa.conta]).trim());
        if (primeira) {
          for (let i = 0; i < primeira.length; i++) {
            if (usadas.has(i) || cabecalho[i]) continue;
            const v = texto(primeira[i]).trim();
            if (v.length >= 3 && !ehDC(v) && numeroDe(v) === null && !Util.lerData(v) && /[A-Za-z]/.test(v)) { colNome = i; break; }
          }
        }
      }
      const infoAba = lerCabecalhoDoRelatorio(linhas, rCab);
      info = {
        empresa: info.empresa || infoAba.empresa,
        cnpj: info.cnpj || infoAba.cnpj,
        periodo: info.periodo || infoAba.periodo,
        titulo: info.titulo || infoAba.titulo,
      };
      let saldoSolto = null;   // linha só com o saldo, antes do primeiro lançamento da conta
      let ultima = null;       // última conta lida (as linhas de totais são dela)
      for (let r = rCab + 1; r < linhas.length; r++) {
        const linha = linhas[r];
        if (!linha || !celulasCheias(linha).length) continue;
        if (ehCabecalhoFlat(linha)) continue;               // cabeçalho repetido a cada página
        const data = mapa.data !== undefined ? Util.lerData(linha[mapa.data]) : null;
        const deb = mapa.debito !== undefined ? numeroDe(linha[mapa.debito]) : null;
        const cred = mapa.credito !== undefined ? numeroDe(linha[mapa.credito]) : null;
        const codigo = mapa.conta !== undefined && linha[mapa.conta] !== null && linha[mapa.conta] !== undefined ? String(linha[mapa.conta]).trim() : '';
        if (!data || (deb === null && cred === null) || !codigo) {
          if (!data && mapa.saldo !== undefined) {
            const saldo = saldoCom(linha, mapa.saldo);
            if (deb !== null && cred !== null && ultima) {
              // Linha de totais da conta: débito, crédito e, na última, o saldo final.
              ultima.totalDebitoDeclarado = deb;
              ultima.totalCreditoDeclarado = cred;
              if (saldo !== null) ultima.saldoFinalDeclarado = saldo;
              linhasIgnoradas++;
              continue;
            }
            if (saldo !== null && deb === null && cred === null) {
              // Saldo solto: antes do 1º lançamento é o saldo anterior; no meio, transporte de página.
              if (!ultima || !ultima.lancamentos.length) saldoSolto = saldo;
              linhasIgnoradas++;
              continue;
            }
          }
          linhasIgnoradas++;
          continue;
        }
        let conta = contasMap.get(codigo);
        if (!conta) {
          conta = {
            codigo,
            classificacao: mapa.contaClassificacao !== undefined && linha[mapa.contaClassificacao] !== null ? String(linha[mapa.contaClassificacao]).trim() : '',
            nome: colNome !== undefined && linha[colNome] !== null ? String(linha[colNome]).replace(/\s+/g, ' ').trim() : '',
            saldoAnterior: mapa.saldo !== undefined ? (saldoSolto !== null ? saldoSolto : null) : 0,
            lancamentos: [], totalDebitoDeclarado: null, totalCreditoDeclarado: null,
            saldoFinalDeclarado: null, avisos: [],
          };
          contasMap.set(codigo, conta);
          saldoSolto = null;
        }
        ultima = conta;
        let historico = texto(linha[mapa.historico]).replace(/\s+/g, ' ').trim();
        let codigoHistorico = '';
        if (historicoComCodigo) {
          const m = historico.match(/^(\d{1,6})\s+(.*)$/);
          if (m) { codigoHistorico = m[1]; historico = m[2]; }
        }
        const lanc = {
          data: data.texto, dia: data.dia, mes: data.mes, ano: data.ano,
          numero: mapa.numero !== undefined && linha[mapa.numero] !== null ? String(linha[mapa.numero]) : '',
          historico,
          contrapartida: mapa.contrapartida !== undefined && linha[mapa.contrapartida] !== null ? String(linha[mapa.contrapartida]) : '',
          documento: mapa.documento !== undefined && linha[mapa.documento] !== null ? String(linha[mapa.documento]) : '',
          debito: deb || 0, credito: cred || 0, saldo: mapa.saldo !== undefined ? saldoCom(linha, mapa.saldo) : null,
        };
        if (codigoHistorico) lanc.codigoHistorico = codigoHistorico;
        conta.lancamentos.push(lanc);
      }
    }

    const contas = Array.from(contasMap.values());
    let periodo = info.periodo;
    let periodoOrigem = periodo ? 'conteudo' : null;
    if (!periodo) { const pn = periodoPeloNome(nomeArquivo); if (pn) { periodo = pn; periodoOrigem = 'nome-do-arquivo'; } }
    if (!periodo) {
      let menor = null, maior = null;
      contas.forEach((c) => c.lancamentos.forEach((l) => {
        const n = Util.montarData(l.dia, l.mes, l.ano).numero;
        if (menor === null || n < menor) menor = n;
        if (maior === null || n > maior) maior = n;
      }));
      if (menor !== null) { periodo = { de: Util.dataDeNumero(menor).texto, ate: Util.dataDeNumero(maior).texto }; periodoOrigem = 'datas-dos-lancamentos'; }
    }
    if (periodoOrigem === 'datas-dos-lancamentos') avisos.push('O arquivo não diz o período: usei a primeira e a última data dos lançamentos. Confirme a competência.');

    for (const c of contas) {
      if (comSaldo) {
        // Desenho D: tem saldo acumulado e totais — confere linha a linha como os razões em bloco.
        conferirConta(c);
        continue;
      }
      conferirConta(c);
      // Razão em lista sem saldo (desenho C): o saldo se confere pelo aging e pelo balancete (③).
      c.confere = true;
      c.avisos.push('Razão em lista (uma linha por lançamento), sem saldo anterior no arquivo: o saldo é conferido pelo aging e pelo balancete.');
    }
    if (!contas.length) avisos.push('Não achei lançamentos neste razão em lista (confira se os títulos das colunas batem).');

    return {
      tipo: 'razao', desenho: comSaldo ? 'D' : 'C', empresa: info.empresa, cnpj: info.cnpj, titulo: info.titulo,
      periodo, periodoOrigem, contas, avisos, linhasIgnoradas,
    };
  }

  /**
   * Diz se as abas são um razão, um balancete ou outra coisa.
   * @returns { tipo: 'razao' | 'balancete' | null, motivo }
   */
  function reconhecer(abas) {
    let temCabecalho = false, temConta = false, balancete = false, temFlat = false;
    for (const aba of abas) {
      for (const linha of aba.linhas) {
        if (!linha) continue;
        if (!temCabecalho && ehCabecalho(linha)) temCabecalho = true;
        if (!temConta && lerLinhaDeConta(linha)) temConta = true;
        if (!balancete && ehCabecalhoDeBalancete(linha)) balancete = true;
        if (!temFlat && ehCabecalhoFlat(linha)) temFlat = true;
        if (temCabecalho && temConta) return { tipo: 'razao', motivo: 'Tem o cabeçalho de lançamentos (data, histórico, débito/crédito) e blocos de conta.' };
      }
    }
    // Razão em lista (desenho C): uma linha por lançamento, conta numa coluna. Só quando NÃO há blocos "Conta:".
    if (temFlat && !temConta) return { tipo: 'razao', flat: true, motivo: 'Razão em lista: uma linha por lançamento, com a conta numa coluna e Débito/Crédito.' };
    if (balancete) return { tipo: 'balancete', motivo: 'Este arquivo é um BALANCETE (primeira coluna com o código da conta e colunas de saldo, sem histórico), não um razão.' };
    if (temCabecalho && !temConta) return { tipo: null, motivo: 'Tem colunas de lançamento, mas nenhuma linha identificando a conta ("Conta:"). Não parece um razão contábil.' };
    return { tipo: null, motivo: 'Não achei o cabeçalho de um razão (Data, Histórico, Débito, Crédito).' };
  }

  /**
   * Lê o razão.
   * @param abas   [{ nome, linhas }] de LerPlanilha.abrir
   * @param opcoes { nomeArquivo }
   */
  function ler(abas, opcoes) {
    const nomeArquivo = (opcoes && opcoes.nomeArquivo) || '';
    // Razão em lista (desenho C) tem um leitor próprio: uma linha por lançamento, conta na coluna.
    const temBloco = abas.some((a) => a.linhas.some((l) => l && lerLinhaDeConta(l)));
    const temFlat = !temBloco && abas.some((a) => a.linhas.some((l) => l && ehCabecalhoFlat(l)));
    if (temFlat) return lerFlat(abas, opcoes);

    const avisos = [];
    const contas = [];
    let linhasIgnoradas = 0;
    let desenho = null;
    let info = { empresa: '', cnpj: '', periodo: null, titulo: '' };

    for (const aba of abas) {
      const linhas = aba.linhas;
      let mapa = null;
      let conta = null;
      let ultimoLanc = null;
      const primeiroCabecalho = linhas.findIndex((l) => l && ehCabecalho(l));
      const infoAba = lerCabecalhoDoRelatorio(linhas, primeiroCabecalho >= 0 ? primeiroCabecalho + 3 : 20);
      info = {
        empresa: info.empresa || infoAba.empresa,
        cnpj: info.cnpj || infoAba.cnpj,
        periodo: info.periodo || infoAba.periodo,
        titulo: info.titulo || infoAba.titulo,
      };

      for (let r = 0; r < linhas.length; r++) {
        const linha = linhas[r];
        if (!linha || !celulasCheias(linha).length) { continue; }

        if (ehCabecalho(linha)) { mapa = mapearCabecalho(linha); ultimoLanc = null; continue; }

        const idConta = lerLinhaDeConta(linha);
        if (idConta) {
          conta = {
            codigo: String(idConta.codigo), classificacao: idConta.classificacao, nome: idConta.nome,
            saldoAnterior: null, lancamentos: [], totalDebitoDeclarado: null, totalCreditoDeclarado: null,
            saldoFinalDeclarado: null, avisos: [], _linha: r + 1,
          };
          desenho = desenho || idConta.desenho;
          contas.push(conta);
          ultimoLanc = null;
          continue;
        }
        if (!mapa || !conta) { linhasIgnoradas++; continue; }

        const data = mapa.data !== undefined ? Util.lerData(linha[mapa.data]) : null;
        const deb = mapa.debito !== undefined ? numeroDe(linha[mapa.debito]) : null;
        const cred = mapa.credito !== undefined ? numeroDe(linha[mapa.credito]) : null;

        // "Saldo anterior" antes de lançamento: só quando não traz débito nem crédito
        // (um lançamento com data e valor é lançamento, mesmo que o histórico fale em saldo).
        if (ehSaldoAnterior(linha) && !(data && (deb !== null || cred !== null))) {
          let v = null;
          if (mapa.saldoExercicio !== undefined) v = numeroDe(linha[mapa.saldoExercicio]);
          if (v === null && mapa.saldo !== undefined) v = numeroDe(linha[mapa.saldo]);
          if (v === null) v = ultimoNumero(linha);
          if (conta.saldoAnterior === null) conta.saldoAnterior = v === null ? 0 : v;
          ultimoLanc = null;
          continue;
        }

        if (data && (deb !== null || cred !== null)) {
          const historico = String(linha[mapa.historico] === null || linha[mapa.historico] === undefined ? '' : linha[mapa.historico]).replace(/\s+/g, ' ').trim();
          const lanc = {
            data: data.texto, dia: data.dia, mes: data.mes, ano: data.ano,
            numero: mapa.numero !== undefined && linha[mapa.numero] !== null ? String(linha[mapa.numero]) : '',
            historico,
            contrapartida: mapa.contrapartida !== undefined && linha[mapa.contrapartida] !== null ? String(linha[mapa.contrapartida]) : '',
            debito: deb || 0,
            credito: cred || 0,
            saldo: null,
            saldoPeriodo: null,
          };
          if (mapa.saldoExercicio !== undefined) lanc.saldo = numeroDe(linha[mapa.saldoExercicio]);
          if (mapa.saldo !== undefined) {
            const s = numeroDe(linha[mapa.saldo]);
            if (lanc.saldo === null) lanc.saldo = s; else lanc.saldoPeriodo = s;
          }
          if (mapa.filial !== undefined && linha[mapa.filial] !== null) lanc.filial = String(linha[mapa.filial]);
          conta.lancamentos.push(lanc);
          ultimoLanc = lanc;
          continue;
        }

        if (ehTotal(linha) || ehSaldoFinal(linha)) {
          if (ehTotal(linha)) {
            if (mapa.debito !== undefined && deb !== null) conta.totalDebitoDeclarado = deb;
            if (mapa.credito !== undefined && cred !== null) conta.totalCreditoDeclarado = cred;
          }
          let sf = null;
          if (mapa.saldoExercicio !== undefined) sf = numeroDe(linha[mapa.saldoExercicio]);
          if (sf === null && mapa.saldo !== undefined) sf = numeroDe(linha[mapa.saldo]);
          if (sf !== null) conta.saldoFinalDeclarado = sf;
          ultimoLanc = null;
          continue;
        }

        // Histórico que continua na linha de baixo (só texto na coluna do histórico).
        if (ultimoLanc && mapa.historico !== undefined) {
          const cheias = celulasCheias(linha);
          const limite = Math.min.apply(null, [mapa.contrapartida, mapa.debito, mapa.credito, mapa.saldo]
            .filter((x) => x !== undefined && x > mapa.historico).concat([linha.length]));
          if (cheias.length && cheias.every((c) => c.i >= mapa.historico && c.i < limite && typeof c.v === 'string')) {
            ultimoLanc.historico = (ultimoLanc.historico + ' ' + cheias.map((c) => c.v).join(' ')).replace(/\s+/g, ' ').trim();
            continue;
          }
        }
        linhasIgnoradas++;
      }
    }

    // Período: do conteúdo; senão do nome do arquivo; senão das datas dos lançamentos.
    let periodo = info.periodo;
    let periodoOrigem = periodo ? 'conteudo' : null;
    if (!periodo) {
      const pn = periodoPeloNome(nomeArquivo);
      if (pn) { periodo = pn; periodoOrigem = 'nome-do-arquivo'; }
    }
    if (!periodo) {
      let menor = null, maior = null;
      contas.forEach((c) => c.lancamentos.forEach((l) => {
        const n = Util.montarData(l.dia, l.mes, l.ano).numero;
        if (menor === null || n < menor) menor = n;
        if (maior === null || n > maior) maior = n;
      }));
      if (menor !== null) {
        periodo = { de: Util.dataDeNumero(menor).texto, ate: Util.dataDeNumero(maior).texto };
        periodoOrigem = 'datas-dos-lancamentos';
      }
    }
    if (periodoOrigem === 'nome-do-arquivo') avisos.push('O período veio do NOME do arquivo (o conteúdo não diz). Confirme a competência.');
    if (periodoOrigem === 'datas-dos-lancamentos') avisos.push('O arquivo não diz o período: usei a primeira e a última data dos lançamentos. Confirme a competência.');

    for (const c of contas) conferirConta(c);
    contas.forEach((c) => { delete c._linha; });
    if (!contas.length) avisos.push('Nenhuma conta foi encontrada no razão.');

    return {
      tipo: 'razao', desenho: desenho || 'A',
      empresa: info.empresa, cnpj: info.cnpj, titulo: info.titulo,
      periodo, periodoOrigem,
      contas, avisos, linhasIgnoradas,
    };
  }

  // Conferência: saldo anterior + movimento = saldo final declarado (Parte 5.2).
  // Também descobre o SENTIDO do saldo (D−C ou C−D) pelo acumulado linha a linha e
  // devolve tudo em D−C.
  function conferirConta(c) {
    if (c.saldoAnterior === null) {
      c.saldoAnterior = 0;
      c.avisos.push('A conta não tem linha de saldo anterior: considerei zero.');
    }
    let totalDebito = 0, totalCredito = 0;
    c.lancamentos.forEach((l) => { totalDebito += l.debito; totalCredito += l.credito; });
    c.totalDebito = totalDebito;
    c.totalCredito = totalCredito;

    // Sentido do acumulado: testa D−C e C−D no primeiro lançamento com saldo.
    let sentido = 'D-C';
    const primeiro = c.lancamentos.find((l) => l.saldo !== null);
    if (primeiro) {
      const dc = c.saldoAnterior + primeiro.debito - primeiro.credito;
      const cd = c.saldoAnterior - primeiro.debito + primeiro.credito;
      if (primeiro.saldo !== dc && primeiro.saldo === cd) sentido = 'C-D';
    }
    if (sentido === 'C-D') {
      c.saldoAnterior = -c.saldoAnterior;
      c.lancamentos.forEach((l) => { if (l.saldo !== null) l.saldo = -l.saldo; });
      if (c.saldoFinalDeclarado !== null) c.saldoFinalDeclarado = -c.saldoFinalDeclarado;
      c.avisos.push('Este razão mostra o saldo como crédito − débito; o programa guardou como débito − crédito.');
    }

    // Acumulado linha a linha.
    let acumulado = c.saldoAnterior;
    let quebras = 0;
    let primeiraQuebra = null;
    for (const l of c.lancamentos) {
      acumulado += l.debito - l.credito;
      if (l.saldo !== null && l.saldo !== acumulado) {
        quebras++;
        if (!primeiraQuebra) primeiraQuebra = { data: l.data, historico: l.historico, esperado: acumulado, lido: l.saldo };
        acumulado = l.saldo; // segue pelo que o razão diz, para achar só as quebras de verdade
      }
    }
    c.saldoFinal = c.saldoAnterior + totalDebito - totalCredito;
    if (c.saldoFinalDeclarado === null) {
      const ultimo = c.lancamentos.length ? c.lancamentos[c.lancamentos.length - 1] : null;
      c.saldoFinalDeclarado = ultimo && ultimo.saldo !== null ? ultimo.saldo : null;
    }
    const totaisBatem = (c.totalDebitoDeclarado === null || c.totalDebitoDeclarado === totalDebito) &&
      (c.totalCreditoDeclarado === null || c.totalCreditoDeclarado === totalCredito);
    c.confere = quebras === 0 && totaisBatem && (c.saldoFinalDeclarado === null || c.saldoFinalDeclarado === c.saldoFinal);
    if (quebras) {
      c.avisos.push('O saldo acumulado não fecha em ' + quebras + ' linha(s). Primeira: ' + primeiraQuebra.data + ' "' +
        primeiraQuebra.historico.slice(0, 60) + '" — esperado ' + Util.formatarCentavos(primeiraQuebra.esperado) +
        ', o razão diz ' + Util.formatarCentavos(primeiraQuebra.lido) + '.');
    }
    if (!totaisBatem) {
      c.avisos.push('Os totais declarados no razão não batem com a soma das linhas (débito ' +
        Util.formatarCentavos(totalDebito) + ', crédito ' + Util.formatarCentavos(totalCredito) + ').');
    }
    if (c.saldoFinalDeclarado !== null && c.saldoFinalDeclarado !== c.saldoFinal) {
      c.avisos.push('Saldo anterior + movimento = ' + Util.formatarCentavos(c.saldoFinal) + ', mas o razão declara ' +
        Util.formatarCentavos(c.saldoFinalDeclarado) + '.');
    }
    c.lancamentos.forEach((l) => { delete l.saldoPeriodo; });
    delete c.totalDebitoDeclarado;
    delete c.totalCreditoDeclarado;
  }

  return { reconhecer, ler, mapearCabecalho, ehCabecalho, lerLinhaDeConta, periodoPeloNome, lerFaixaDeDatas };
});
