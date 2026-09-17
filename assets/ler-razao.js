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
 *  - Desenhos C, D e E: ver lerFlat e lerPorContrapartida. Desenho F: ver lerAnalitico.
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
  // Razão por contrapartida de outro cliente (16/09/2026, desenho E): "ID Documento | Data | … |
  // Descrição Documento | Histórico | Contra-Partida | Descrição | R$ Débito | R$ Crédito | R$ Saldo".
  // Razão analítico de um terceiro cliente (17/09/2026, desenho F): "Data | Partida | Lote/Lanc | Nº Doc. |
  // Histórico | Débito | Crédito | Saldo" — por isso "partida", "lotelanc" e "ndoc".
  const SINONIMOS = {
    data: ['data', 'dt', 'datalanc', 'datadolancamento', 'datalancamento', 'datamovimento', 'datamov', 'dtmovto', 'dtmovimento', 'dtmov'],
    numero: ['numero', 'num', 'lancamento', 'lanc', 'lcto', 'nlanc', 'nlancamento', 'numlancamento', 'lote', 'numlote', 'iddocumento', 'lotelanc'],
    historico: ['complhis', 'complementohistorico', 'historicocomplemento', 'complemento', 'historico', 'historicos', 'cphistorico', 'cphist'],
    contrapartida: ['ctacpart', 'contrapartida', 'cpart', 'cpartida', 'ctacpartida', 'contracpartida', 'ccontrapartida', 'contacontrapartida', 'contacontabilcontrapartida', 'partida'],
    filial: ['filial'],
    debito: ['debito', 'debitos', 'valordebito', 'vlrdebito', 'rdebito'],
    credito: ['credito', 'creditos', 'valorcredito', 'vlrcredito', 'rcredito'],
    saldo: ['saldo', 'saldoatual', 'saldoacum', 'saldoacumulado', 'rsaldo'],
    descricaoDocumento: ['descricaodocumento'],
    saldoExercicio: ['saldoexercicio'],
    // Razão em LISTA (uma linha por lançamento, a conta numa coluna) — desenhos C e D (clientes reais).
    conta: ['contareduzida', 'contacontabil', 'contaredz', 'reduzida', 'ctared', 'ctareduzida', 'ctaredz', 'contared'],
    contaClassificacao: ['contacontabil', 'classificacao', 'classificacaocontabil', 'contcontabil', 'ctacontabil'],
    descricaoConta: ['descricao', 'descricaoconta', 'nomeconta', 'descricaodaconta'],
    documento: ['numdocumento', 'numerodocumento', 'ndocumento', 'nrodocumento', 'nrodoc', 'documento', 'ndoc'],
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

  // ------------------------------------------------------------------
  // Desenho E — razão POR CONTRAPARTIDA de outro cliente real (16/09/2026, "o razão também tem uma
  // estrutura diferente"): cabeçalho "ID Documento | Data | Dia | Mês | Ano | Descrição Documento |
  // Histórico | Contra-Partida | Descrição | R$ Débito | R$ Crédito | R$ Saldo" e as linhas em blocos
  // "Conta Contábil : 2.1.1.03.0003 Outras Contas a Pagar (débitos, créditos)". O arquivo é o razão de
  // UMA conta: no bloco dela vêm os lançamentos a débito (a contrapartida na coluna Contra-Partida);
  // cada outro bloco é uma conta de contrapartida e traz os lançamentos a crédito da conta (ali a
  // coluna Contra-Partida repete a própria conta). Débito e crédito são sempre os da conta do razão.
  // "SALDO INICIAL" numa linha do bloco dela; no fim, uma linha só com o total dos débitos e dos
  // créditos. O saldo corrido (R$ Saldo) segue a ordem de data e ID: o da última linha é o saldo final.
  // O histórico diz a nota e o fornecedor ("Compra cfe 52919516 de X", "PAGAMENTO DOC 158467/1 DE X",
  // "Compensação 1307/1/R1 de X", "IRRF na Compra cfe 158797 DE X", "… S/ NF 7058/1 - X",
  // "Juros no Pgto de documento 20268/1 de X", "DIFAL 82026 X").
  // ------------------------------------------------------------------
  const RE_BLOCO_E = /^\s*conta\s+cont[aá]bil\s*:\s*(\d+(?:\.\d+)+)\s+(.*?)\s*\(\s*(-?[\d.]*\d,\d{2})\s*,\s*(-?[\d.]*\d,\d{2})\s*\)\s*$/i;

  function blocoE(linha) {
    for (const c of celulasCheias(linha)) {
      if (typeof c.v !== 'string') continue;
      const m = c.v.match(RE_BLOCO_E);
      if (m) return { classificacao: m[1], nome: m[2].replace(/\s+/g, ' ').trim(), debito: numeroDe(m[3]), credito: numeroDe(m[4]) };
    }
    return null;
  }

  function ehRazaoPorContrapartida(abas) {
    return abas.some((a) => {
      const rCab = a.linhas.findIndex((l) => l && ehCabecalho(l) && mapearCabecalho(l).contrapartida !== undefined);
      return rCab >= 0 && a.linhas.slice(rCab + 1, rCab + 400).some((l) => l && blocoE(l));
    });
  }

  // Nota (documento do título) e fornecedor lidos do histórico do desenho E.
  const PADROES_E = [
    /\bcompra\s+cfe\s+(\S+)\s+de\s+(.+)$/i,                 // Compra cfe N de X · IRRF / ISS / VLR INSS na compra cfe N de X
    /^pagamento\s+doc\s+(.+?)\s+de\s+(.+)$/i,               // PAGAMENTO DOC 158467/1 DE X
    /^compensa[çc][ãa]o\s+(.+?)\s+de\s+(.+)$/i,              // Compensação 1307/1/R1 de X
    /\bdocumento\s+(\S+)\s+de\s+(.+)$/i,                    // Juros / Multa no Pgto de documento 20268/1 de X
    /\bs\/\s*nf\s+(\S+)\s+-\s+(.+)$/i,                      // VLR REF. RETENÇÃO DE CRF (PIS) S/ NF 7058/1 - X
    /\bdesconto\s+(\S+)\s+de\s+(.+)$/i,                     // VL REF. DESCONTO 1948/1 DE X
    /^difal\s+(\S+)\s+(.+)$/i,                              // DIFAL 82026 X
  ];
  const SO_FORNECEDOR_E = [
    /^estorno\s+de\s+adiantamento\s+de\s+(.+)$/i,           // ESTORNO DE ADIANTAMENTO DE X
    /^adiantamento\s+a\s+(.+)$/i,                           // ADIANTAMENTO A X
  ];
  function limparFornecedorE(s) {
    return String(s || '').replace(/^[\d.\/-]+\s+/, '').replace(/\s+\d{6,}$/, '').replace(/\s+/g, ' ').trim();
  }
  function notaEFornecedorE(historico, descricaoDocumento) {
    const h = String(historico || '').replace(/\s+/g, ' ').trim();
    for (const re of PADROES_E) {
      const m = h.match(re);
      if (m) return { nota: Util.separarDocumento(m[1]).documento, fornecedor: limparFornecedorE(m[2]) };
    }
    const nf = String(descricaoDocumento || '').match(/\bNF\s*N?[ºo°.]*\s*:?\s*([A-Za-z]?\d+)/i);
    for (const re of SO_FORNECEDOR_E) {
      const m = h.match(re);
      if (m) return { nota: nf ? nf[1] : '', fornecedor: limparFornecedorE(m[1]) };
    }
    return { nota: nf ? nf[1] : '', fornecedor: '' };
  }

  function lerPorContrapartida(abas) {
    const avisos = [];
    let linhasIgnoradas = 0;
    const blocos = [];
    const lidas = [];
    let saldoInicial = null, dataSaldoInicial = null, blocoSaldoInicial = null;
    let totalD = null, totalC = null;
    let info = { empresa: '', cnpj: '', periodo: null, titulo: '' };
    const texto = (linha, i) => (i === undefined || linha[i] === null || linha[i] === undefined ? '' : String(linha[i]).replace(/\s+/g, ' ').trim());

    for (const aba of abas) {
      const linhas = aba.linhas;
      const rCab = linhas.findIndex((l) => l && ehCabecalho(l) && mapearCabecalho(l).contrapartida !== undefined);
      if (rCab < 0) continue;
      const mapa = mapearCabecalho(linhas[rCab]);
      const infoAba = lerCabecalhoDoRelatorio(linhas, rCab);
      info = { empresa: info.empresa || infoAba.empresa, cnpj: info.cnpj || infoAba.cnpj, periodo: info.periodo || infoAba.periodo, titulo: info.titulo || infoAba.titulo };
      // "ID Documento" é título de célula mesclada: o número pode vir na coluna seguinte (sem título).
      if (mapa.numero !== undefined && !chaveTitulo(linhas[rCab][mapa.numero + 1])) {
        const amostra = linhas.slice(rCab + 1, rCab + 300).filter((l) => l && mapa.data !== undefined && Util.lerData(l[mapa.data]));
        const comNumero = (i) => amostra.filter((l) => /^\d+$/.test(texto(l, i))).length;
        if (comNumero(mapa.numero + 1) > comNumero(mapa.numero)) mapa.numero = mapa.numero + 1;
      }
      let bloco = null;
      for (let r = rCab + 1; r < linhas.length; r++) {
        const linha = linhas[r];
        if (!linha || !celulasCheias(linha).length || ehCabecalho(linha)) continue;
        const b = blocoE(linha);
        if (b) { bloco = Object.assign(b, { somaD: 0, somaC: 0 }); blocos.push(bloco); continue; }
        const data = mapa.data !== undefined ? Util.lerData(linha[mapa.data]) : null;
        const deb = mapa.debito !== undefined ? numeroDe(linha[mapa.debito]) : null;
        const cred = mapa.credito !== undefined ? numeroDe(linha[mapa.credito]) : null;
        const hist = texto(linha, mapa.historico);
        const desc = texto(linha, mapa.descricaoDocumento);
        if (/^saldo\s+inicial/i.test(desc) || /^saldo\s+inicial/i.test(hist)) {
          if (saldoInicial === null) { saldoInicial = mapa.saldo !== undefined ? numeroDe(linha[mapa.saldo]) : null; dataSaldoInicial = data; blocoSaldoInicial = bloco; }
          linhasIgnoradas++;
          continue;
        }
        if (!data) {
          if (deb !== null && cred !== null) { totalD = deb; totalC = cred; } // linha de totais do fim
          linhasIgnoradas++;
          continue;
        }
        if (!bloco || (deb === null && cred === null)) { linhasIgnoradas++; continue; }
        bloco.somaD += deb || 0;
        bloco.somaC += cred || 0;
        lidas.push({ bloco, r, id: texto(linha, mapa.numero), data, desc, hist,
          cp: texto(linha, mapa.contrapartida), cpNome: texto(linha, mapa.descricaoConta),
          debito: deb || 0, credito: cred || 0, saldo: mapa.saldo !== undefined ? numeroDe(linha[mapa.saldo]) : null });
      }
    }

    // A conta do razão: a que é contrapartida dos lançamentos dos OUTROS blocos (desempate: o bloco do saldo inicial).
    const candidatos = blocos.map((b) => ({ classificacao: b.classificacao, nome: b.nome, bloco: b }));
    const cps = new Map();
    lidas.forEach((l) => { if (l.cp) cps.set(l.cp, { classificacao: l.cp, nome: l.cpNome, bloco: null }); });
    cps.forEach((c) => { if (!candidatos.some((x) => x.classificacao === c.classificacao)) candidatos.push(c); });
    let principal = null;
    for (const c of candidatos) {
      const outras = lidas.filter((l) => l.bloco.classificacao !== c.classificacao);
      const comEla = outras.filter((l) => l.cp === c.classificacao).length;
      const nota = outras.length ? comEla / outras.length : (c.bloco ? 1 : 0);
      const saldo = c.bloco && c.bloco === blocoSaldoInicial ? 1 : 0;
      if (!principal || nota > principal.nota || (nota === principal.nota && saldo > principal.saldo)) principal = { c, nota, saldo };
    }
    const contas = [];
    if (principal && principal.nota >= 0.9) {
      const p = principal.c;
      const daConta = (l) => l.bloco.classificacao === p.classificacao;
      const fora = lidas.filter((l) => !daConta(l) && l.cp !== p.classificacao);
      if (fora.length) avisos.push(fora.length + ' linha(s) de outros blocos sem a conta ' + p.classificacao + ' na contrapartida ficaram de fora.');
      const ordenadas = lidas.filter((l) => daConta(l) || l.cp === p.classificacao)
        .sort((a, b) => a.data.numero - b.data.numero || (Number(a.id) || 0) - (Number(b.id) || 0) || a.r - b.r);
      const conta = {
        codigo: p.classificacao, classificacao: p.classificacao, nome: p.nome, saldoAnterior: null, lancamentos: [],
        totalDebitoDeclarado: totalD, totalCreditoDeclarado: totalC, saldoFinalDeclarado: null, avisos: [],
      };
      let totalDebito = 0, totalCredito = 0;
      for (const l of ordenadas) {
        const lido = notaEFornecedorE(l.hist, l.desc);
        totalDebito += l.debito;
        totalCredito += l.credito;
        conta.lancamentos.push({
          data: l.data.texto, dia: l.data.dia, mes: l.data.mes, ano: l.data.ano,
          numero: l.id, historico: l.hist, descricaoDocumento: l.desc,
          // No bloco da conta, a contrapartida está na coluna; nos outros blocos, é a conta do bloco.
          contrapartida: daConta(l) ? (l.cp + (l.cpNome ? ' ' + l.cpNome : '')).trim() : l.bloco.classificacao + ' ' + l.bloco.nome,
          documento: '', nota: lido.nota, fornecedor: lido.fornecedor,
          debito: l.debito, credito: l.credito, saldo: null,
        });
      }
      // Sentido do saldo (o arquivo mostra o saldo credor positivo nas contas do passivo): o saldo
      // inicial + o movimento tem que dar o saldo corrido da última linha.
      const ultimo = ordenadas.length ? ordenadas[ordenadas.length - 1].saldo : null;
      if (saldoInicial !== null) {
        const comoDC = saldoInicial + totalDebito - totalCredito;
        const comoCD = saldoInicial - totalDebito + totalCredito;
        if (ultimo !== null && ultimo === comoCD && ultimo !== comoDC) {
          conta.saldoAnterior = -saldoInicial;
          conta.saldoFinalDeclarado = -ultimo;
          conta.avisos.push('Este razão mostra o saldo como crédito − débito; o programa guardou como débito − crédito.');
        } else {
          conta.saldoAnterior = saldoInicial;
          conta.saldoFinalDeclarado = ultimo;
        }
      }
      conferirConta(conta);
      blocos.forEach((b) => {
        if ((b.debito !== null && b.debito !== b.somaD) || (b.credito !== null && b.credito !== b.somaC)) {
          conta.confere = false;
          conta.avisos.push('O bloco ' + b.classificacao + ' ' + b.nome + ' declara ' + Util.formatarCentavos(b.debito) + ' / ' + Util.formatarCentavos(b.credito) +
            ', mas as linhas somam ' + Util.formatarCentavos(b.somaD) + ' / ' + Util.formatarCentavos(b.somaC) + '.');
        }
      });
      contas.push(conta);
    } else if (lidas.length) {
      avisos.push('Não consegui dizer de qual conta é este razão (nenhuma conta aparece como contrapartida dos outros blocos).');
    }
    if (!lidas.length) avisos.push('Não achei lançamentos neste razão.');

    let periodo = info.periodo;
    let periodoOrigem = periodo ? 'conteudo' : null;
    if (!periodo && lidas.length) {
      const numeros = lidas.map((l) => l.data.numero);
      let de = Math.min.apply(null, numeros);
      if (dataSaldoInicial && dataSaldoInicial.numero + 1 <= de) de = dataSaldoInicial.numero + 1;
      periodo = { de: Util.dataDeNumero(de).texto, ate: Util.dataDeNumero(Math.max.apply(null, numeros)).texto };
      periodoOrigem = dataSaldoInicial ? 'conteudo' : 'datas-dos-lancamentos';
      if (!dataSaldoInicial) avisos.push('O arquivo não diz o período: usei a primeira e a última data dos lançamentos. Confirme a competência.');
    }
    return { tipo: 'razao', desenho: 'E', empresa: info.empresa, cnpj: info.cnpj, titulo: info.titulo, periodo, periodoOrigem, contas, avisos, linhasIgnoradas };
  }

  // ------------------------------------------------------------------
  // Desenho F — razão ANALÍTICO de um terceiro cliente real (17/09/2026): no topo, a conta num texto só
  // ("2.1.1.01.02004-2004-FORNECEDORES NACIONAIS"; a linha de cima é a conta-mãe, sem lançamentos), o
  // nome da empresa e "Razão Analítico de 01/08/2026 à 31/08/2026" na coluna ao lado; cabeçalho
  // "Data | Partida | Lote/Lanc | Nº Doc. | Histórico | Débito | Crédito | Saldo" e o D/C do saldo na
  // coluna seguinte, sem título; os números vêm como texto ("1.234.567,89"). "Saldo da Conta->" duas
  // vezes: antes dos lançamentos (o saldo anterior e o D/C) e no fim (total dos débitos, total dos
  // créditos, saldo final e o D/C).
  // O histórico cita o NRM (o número do lançamento no financeiro, o mesmo do aging) e o fornecedor:
  //   "VALOR REF. NF 1234 / NRM 5001-FORNECEDOR" (também "MERCADORIAS PARA REVENDA NF …",
  //   "VALOR REF. CSLL/IR/ISS RETIDO …", "… ICMS A RECUPERAR SOBRE NOTA FISCAL NF … / NRM …-…");
  // o pagamento só traz os números: "PAGAMENTO CF NRM4001 - 1 - NFº <999> - Parcela 1 / 5 …"
  // (o "- 1 -" é a parcela; também "PAGAMENTO CF SAI 12/26 - 1 - …", "PAGAMENTO CF 202401 - 32 - …");
  // juros e descontos: "… Ocorrencia ref: NRM4002-1- NFº <555> - …". O fornecedor do pagamento
  // o motor acha pelo documento (MotorTerceiro.calcular).
  // ------------------------------------------------------------------
  const RE_CONTA_F = /^\s*(\d+(?:\.\d+)+)\s*-\s*(\d+)\s*-\s*(.*\S)\s*$/;
  const RE_PAGAMENTO_F = /^pagamento\s+cf\s+(.+?)\s+-\s+(\d{1,3})\s+-/i;
  const RE_OCORRENCIA_F = /ocorr[eê]ncia\s+ref\s*:\s*(\S+?)-(\d{1,3})-/i;
  const RE_NRM_FORNECEDOR_F = /\bNRM\s*(\d+)\s*-\s*(.*\S)\s*$/i;
  const RE_NF_F = /\bNF\s*(?:º\s*<\s*|N[º°o]\.?\s*:\s*)?(\d+)/i;

  function contaF(linha) {
    const cheias = celulasCheias(linha);
    if (!cheias.length || typeof cheias[0].v !== 'string') return null;
    const m = cheias[0].v.match(RE_CONTA_F);
    return m ? { classificacao: m[1], codigo: m[2], nome: m[3].replace(/\s+/g, ' ').trim(), resto: cheias.slice(1).map((c) => String(c.v).trim()) } : null;
  }
  function ehSaldoDaConta(linha) {
    const cheias = celulasCheias(linha);
    return !!cheias.length && typeof cheias[0].v === 'string' && /^saldo\s+da\s+conta/i.test(Util.semAcento(cheias[0].v).trim());
  }
  function ehRazaoAnalitico(abas) {
    return abas.some((a) => {
      const rCab = a.linhas.findIndex((l) => l && ehCabecalho(l));
      if (rCab < 0 || !a.linhas.slice(0, rCab).some((l) => l && contaF(l))) return false;
      return a.linhas.slice(rCab + 1, rCab + 400).some((l) => l && ehSaldoDaConta(l));
    });
  }
  const semNrm = (s) => String(s || '').replace(/^\s*NRM\s*/i, '').trim();
  // Documento (o NRM, sem o prefixo), parcela, nota fiscal e fornecedor de um lançamento do desenho F.
  function lancamentoF(historico, documento) {
    const h = String(historico || '');
    const nf = (h.match(RE_NF_F) || [])[1] || '';
    let m = h.match(RE_PAGAMENTO_F) || h.match(RE_OCORRENCIA_F);
    if (m) return { nota: semNrm(m[1]), parcela: m[2], notaFiscal: nf, fornecedor: '' };
    m = h.match(RE_NRM_FORNECEDOR_F);
    if (m) return { nota: m[1], parcela: '', notaFiscal: nf, fornecedor: m[2].replace(/\s+/g, ' ').trim() };
    const d = String(documento || '').trim().match(/^(.*\S)\s*-\s*(\d{1,3})$/);
    return { nota: semNrm(d ? d[1] : documento), parcela: d ? d[2] : '', notaFiscal: nf, fornecedor: '' };
  }

  function lerAnalitico(abas, opcoes) {
    const nomeArquivo = (opcoes && opcoes.nomeArquivo) || '';
    const avisos = [];
    const contas = [];
    let linhasIgnoradas = 0;
    const info = { empresa: '', cnpj: '', periodo: null, titulo: '' };
    const texto = (linha, i) => (i === undefined || linha[i] === null || linha[i] === undefined ? '' : String(linha[i]).replace(/\s+/g, ' ').trim());
    const comDC = (n, dc) => (n === null ? null : /^c$/i.test(dc) ? -Math.abs(n) : /^d$/i.test(dc) ? Math.abs(n) : n);
    const novaConta = (c) => ({ codigo: c.codigo, classificacao: c.classificacao, nome: c.nome, saldoAnterior: null, lancamentos: [],
      totalDebitoDeclarado: null, totalCreditoDeclarado: null, saldoFinalDeclarado: null, avisos: [] });

    for (const aba of abas) {
      const linhas = aba.linhas;
      let mapa = null, conta = null, pendente = null;
      for (let r = 0; r < linhas.length; r++) {
        const linha = linhas[r];
        if (!linha || !celulasCheias(linha).length) continue;
        if (ehCabecalho(linha)) {
          mapa = mapearCabecalho(linha);
          if (pendente) { conta = novaConta(pendente); contas.push(conta); pendente = null; }
          continue;
        }
        const c = contaF(linha);
        if (c) {
          // O que vem ao lado da conta: o nome da empresa e o título com o período.
          for (const t of c.resto) {
            const p = lerFaixaDeDatas(t);
            if (p) { if (!info.periodo) info.periodo = p; if (!info.titulo) info.titulo = t.replace(/\s+de\s+\d.*$/i, '').trim(); } else if (!info.empresa && /[a-z]/i.test(t)) info.empresa = t;
          }
          // Antes do primeiro cabeçalho, a última conta vale (a de cima é a conta-mãe).
          if (mapa) { conta = novaConta(c); contas.push(conta); } else pendente = c;
          continue;
        }
        if (!mapa || !conta) { linhasIgnoradas++; continue; }
        if (ehSaldoDaConta(linha)) {
          const cheias = celulasCheias(linha).slice(1);
          const dcs = cheias.filter((x) => /^[DC]$/i.test(String(x.v).trim()));
          const dc = dcs.length ? String(dcs[dcs.length - 1].v).trim() : '';
          const nums = cheias.filter((x) => !/^[DC]$/i.test(String(x.v).trim())).map((x) => numeroDe(x.v)).filter((n) => n !== null);
          if (!conta.lancamentos.length && conta.saldoAnterior === null && nums.length) {
            conta.saldoAnterior = comDC(nums[0], dc);
          } else if (nums.length >= 3) {
            conta.totalDebitoDeclarado = nums[0];
            conta.totalCreditoDeclarado = nums[1];
            conta.saldoFinalDeclarado = comDC(nums[2], dc);
          }
          linhasIgnoradas++;
          continue;
        }
        // Linha com uma célula a menos (caso real: o Nº Doc. vazio sumiu na exportação e o resto andou uma
        // coluna para a esquerda): o D/C cai na coluna do Saldo. Aí o documento fica vazio e o histórico,
        // o débito, o crédito e o saldo são lidos uma coluna antes.
        const ehDC = (i) => i !== undefined && /^[DC]$/i.test(texto(linha, i));
        const desloca = mapa.saldo !== undefined && mapa.documento !== undefined && ehDC(mapa.saldo) && !ehDC(mapa.saldo + 1);
        const col = (campo) => (mapa[campo] === undefined ? undefined : desloca && mapa[campo] > mapa.documento ? mapa[campo] - 1 : mapa[campo]);
        const data = Util.lerData(linha[mapa.data]);
        const deb = col('debito') !== undefined ? numeroDe(linha[col('debito')]) : null;
        const cred = col('credito') !== undefined ? numeroDe(linha[col('credito')]) : null;
        if (!data || (deb === null && cred === null)) { linhasIgnoradas++; continue; }
        const historico = texto(linha, col('historico'));
        const documento = desloca ? '' : texto(linha, mapa.documento);
        const lido = lancamentoF(historico, documento);
        conta.lancamentos.push({
          data: data.texto, dia: data.dia, mes: data.mes, ano: data.ano,
          numero: texto(linha, mapa.numero), historico, contrapartida: texto(linha, mapa.contrapartida),
          documento, nota: lido.nota, parcela: lido.parcela, notaFiscal: lido.notaFiscal, fornecedor: lido.fornecedor,
          debito: deb || 0, credito: cred || 0,
          saldo: col('saldo') !== undefined ? comDC(numeroDe(linha[col('saldo')]), texto(linha, col('saldo') + 1)) : null,
        });
      }
    }
    // Conta-mãe (ou outra) sem lançamento e sem saldo: fica fora.
    const lidas = contas.filter((c) => c.lancamentos.length || c.saldoAnterior !== null);
    let periodo = info.periodo;
    let periodoOrigem = periodo ? 'conteudo' : null;
    if (!periodo) { const pn = periodoPeloNome(nomeArquivo); if (pn) { periodo = pn; periodoOrigem = 'nome-do-arquivo'; } }
    if (!periodo) {
      const numeros = [];
      lidas.forEach((c) => c.lancamentos.forEach((l) => numeros.push(Util.montarData(l.dia, l.mes, l.ano).numero)));
      if (numeros.length) {
        periodo = { de: Util.dataDeNumero(Math.min.apply(null, numeros)).texto, ate: Util.dataDeNumero(Math.max.apply(null, numeros)).texto };
        periodoOrigem = 'datas-dos-lancamentos';
        avisos.push('O arquivo não diz o período: usei a primeira e a última data dos lançamentos. Confirme a competência.');
      }
    }
    for (const c of lidas) conferirConta(c);
    if (!lidas.length) avisos.push('Não achei lançamentos neste razão.');
    return { tipo: 'razao', desenho: 'F', empresa: info.empresa, cnpj: info.cnpj, titulo: info.titulo, periodo, periodoOrigem, contas: lidas, avisos, linhasIgnoradas };
  }

  /**
   * Diz se as abas são um razão, um balancete ou outra coisa.
   * @returns { tipo: 'razao' | 'balancete' | null, motivo }
   */
  function reconhecer(abas) {
    if (ehRazaoPorContrapartida(abas)) {
      return { tipo: 'razao', porContrapartida: true, motivo: 'Razão por contrapartida: blocos "Conta Contábil" com Data, Histórico, Contra-Partida, Débito e Crédito.' };
    }
    if (ehRazaoAnalitico(abas)) {
      return { tipo: 'razao', analitico: true, motivo: 'Razão analítico: a conta no topo ("classificação-código-nome"), "Saldo da Conta" e Data, Nº Doc., Histórico, Débito, Crédito e Saldo.' };
    }
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
    // Razão por contrapartida (desenho E) e razão analítico (desenho F) têm leitores próprios.
    if (ehRazaoPorContrapartida(abas)) return lerPorContrapartida(abas);
    if (ehRazaoAnalitico(abas)) return lerAnalitico(abas, opcoes);
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

  return { reconhecer, ler, mapearCabecalho, ehCabecalho, lerLinhaDeConta, periodoPeloNome, lerFaixaDeDatas, notaEFornecedorE, lancamentoF };
});
