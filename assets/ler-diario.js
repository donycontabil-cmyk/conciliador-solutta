/*
 * Conciliador Solutta — ler-diario.js
 * Dois jeitos de datar, e o leitor entende os dois (Dony, 23/09/2026): a DATA EM COLUNA, em cada linha, ou a
 * DATA EM LINHA PRÓPRIA antes dos lançamentos do dia (com "Total dia" e "Total mês" no meio, que são ignorados).
 * LIVRO DIÁRIO (Dony, 22/09/2026: "ao invés de subir razão por razão, eu quero a opção subir diário: quando eu subir o
 * diário, a conciliação de fornecedores já entende todos os lançamentos de fornecedores; a de clientes também; a de
 * resultado também — já vai estar tudo lá" + "o razão que você montar tem que ser exatamente o saldo inicial mais todos
 * os débitos e créditos daquela conta, e dar o saldo final que está no balancete").
 *
 * Desenho do sistema contábil do escritório (CSV com ";" em ANSI):
 *   "Diário Número 1 de 01/01/2026 até 31/01/2026 … Página: 1" / "Empresa: 9999 - NOME … CNPJ:00.000.000/0000-00"
 *   "Data;Histórico;;;;Débito;Crédito;Valor"
 *   "01/01/2026;Serviços tomados ref. NF nº 123 - NOME;;;;400;2000;150"
 * Cada linha é uma partida: a conta de DÉBITO e a de CRÉDITO pelo código REDUZIDO, e o valor. Um lançamento com várias
 * contas vem em linhas seguidas com um lado só ("400;;100" / ";2000;90" / ";300;10"), que somam zero. A data pode vir em
 * toda linha ou só na primeira do dia (as de baixo seguem a de cima); o cabeçalho da página se repete no meio (fica de
 * fora). Os NOMES das contas não vêm no diário: vêm do plano de contas (o balancete). Valores em CENTAVOS.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerDiario = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const chave = (v) => Util.semAcento(String(v === null || v === undefined ? '' : v)).toLowerCase().replace(/[^a-z]/g, '');
  // Nomes aceitos para cada coluna (sistemas diferentes chamam diferente).
  const NOMES = {
    data: ['data', 'datalancamento', 'dtlancamento', 'dtlanc', 'datadolancamento'],
    historico: ['historico', 'complemento', 'descricao', 'historicocomplemento'],
    debito: ['debito', 'contadebito', 'debitoconta', 'contadedebito', 'cdebito', 'ctadebito'],
    credito: ['credito', 'contacredito', 'creditoconta', 'contadecredito', 'ccredito', 'ctacredito'],
    valor: ['valor', 'valorlancamento', 'valordolancamento', 'vlr', 'valorr'],
  };
  // DESENHO "UMA LINHA POR PERNA" (Dony, 25/09/2026, o diário da Zelco): cada linha traz UMA conta e o valor
  // em Débitos OU em Créditos — em vez de trazer as duas contas e um valor só. As pernas do mesmo lançamento
  // andam juntas pelo lote/número do lançamento.
  const NOMES_PERNA = {
    conta: ['ctacontab', 'ctacontabil', 'contacontabil', 'conta', 'contareduzida', 'codigoconta', 'ctacont', 'cta'],
    debito: ['debito', 'debitos', 'valordebito', 'vlrdebito', 'debitors'],
    credito: ['credito', 'creditos', 'valorcredito', 'vlrcredito', 'creditors'],
    historico: ['historico', 'historicopadrao', 'complemento', 'historicocomplemento', 'descricaodolancamento'],
    lote: ['lote', 'lotelcto', 'lotelancamento', 'lancamento', 'lcto', 'nlancamento', 'numerolancamento', 'lotelan', 'chave', 'chavelancamento'],
    documento: ['ndocto', 'numerodocto', 'documento', 'ndocumento', 'numerodocumento', 'doc', 'ndoc'],
    nomeDaConta: ['descricao', 'descricaoconta', 'nomedaconta', 'nomeconta', 'descricaodaconta'],
  };
  // O cabeçalho: Histórico, Débito, Crédito e Valor, sem Saldo (no diário, Débito e Crédito são CONTAS).
  // A coluna DATA é opcional: há relatório que põe a data numa linha só dela, antes dos lançamentos do dia
  // (Dony, 23/09/2026, o diário da Felix). Sem a coluna, c.data fica -1 e a data vem da linha do dia.
  const OBRIGATORIAS = ['historico', 'debito', 'credito', 'valor'];
  function cabecalho(linha) {
    const ch = (linha || []).map(chave);
    if (ch.indexOf('saldo') >= 0) return null;
    const c = {};
    for (const k of OBRIGATORIAS) {
      const i = ch.findIndex((x) => NOMES[k].indexOf(x) >= 0);
      if (i < 0) return null;
      c[k] = i;
    }
    const iData = ch.findIndex((x) => NOMES.data.indexOf(x) >= 0);
    c.data = iData;
    c.semColunaDeData = iData < 0;
    return c;
  }

  // O cabeçalho do desenho "uma linha por perna": precisa da conta e das DUAS colunas de valor (débitos e
  // créditos). Se as colunas de débito e crédito trouxessem CONTAS (o desenho de sempre), não haveria uma
  // coluna de conta separada — é isso que separa um do outro.
  function cabecalhoPorPerna(linha) {
    const ch = (linha || []).map(chave);
    if (ch.indexOf('saldo') >= 0) return null;
    const achar = (lista) => ch.findIndex((x) => lista.indexOf(x) >= 0);
    const conta = achar(NOMES_PERNA.conta);
    const debito = achar(NOMES_PERNA.debito);
    const credito = achar(NOMES_PERNA.credito);
    if (conta < 0 || debito < 0 || credito < 0 || debito === conta || credito === conta) return null;
    const c = { porPerna: true, conta, debito, credito,
      historico: achar(NOMES_PERNA.historico), lote: achar(NOMES_PERNA.lote), documento: achar(NOMES_PERNA.documento),
      nomeDaConta: achar(NOMES_PERNA.nomeDaConta) };
    const iData = achar(NOMES.data);
    c.data = iData;
    c.semColunaDeData = iData < 0;
    // Sem coluna de histórico, o nome da conta serve de histórico (é o que o relatório mostra).
    if (c.historico < 0) c.historico = c.nomeDaConta;
    // O que identifica o LANÇAMENTO: tudo o que vem entre a data e a conta (lote e número). Num PDF essas
    // colunas às vezes se partem em duas, por isso vale a faixa inteira e não uma coluna só.
    c.identificacao = [];
    for (let i = Math.max(0, iData) + 1; i < conta; i++) c.identificacao.push(i);
    return c;
  }

  // DESENHO "POR CONTA, COM CONTRAPARTIDA" (Dony, 29/09/2026, o diário da Omega): o relatório é organizado
  // como um razão — cada dia tem blocos "Conta: <nome> <classificação> <reduzido>" e, dentro do bloco, cada
  // linha traz a CONTRAPARTIDA e o valor em Débito ou em Crédito. Cada lançamento aparece DUAS vezes (uma em
  // cada conta), então só as linhas de DÉBITO entram: a conta do bloco é o débito e a contrapartida é o
  // crédito. O "TOTAL DO DIA" impresso pelo próprio relatório confere a leitura.
  const NOMES_BLOCO = {
    contrapartida: ['classificacao', 'contrapartida', 'ctacontrapartida', 'contacontrapartida', 'classificacaocontrapartida', 'classifcontrapartida'],
    reduzidoContra: ['contrap', 'contrapartida', 'reduzido', 'red', 'codigo', 'contrapart'],
  };
  function cabecalhoPorBloco(linha) {
    const ch = (linha || []).map(chave);
    const acharCh = (lista) => ch.findIndex((x) => lista.indexOf(x) >= 0);
    // Normalmente "Saldo" quer dizer que não é diário (é balancete ou razão). Mas o relatório impresso como
    // FICHA RAZÃO traz o saldo corrido ao lado e continua sendo o diário (Dony, 08/10/2026, a Jotec): ali
    // quem prova o desenho é a coluna de CONTRA PARTIDA.
    if (ch.indexOf('saldo') >= 0 && acharCh(NOMES_BLOCO.contrapartida) < 0) return null;
    const achar = (lista) => ch.findIndex((x) => lista.indexOf(x) >= 0);
    const debito = achar(NOMES_PERNA.debito), credito = achar(NOMES_PERNA.credito);
    const historico = achar(NOMES_PERNA.historico);
    const contra = achar(NOMES_BLOCO.contrapartida);
    // A conta não vem em coluna nenhuma: ela é o bloco. Havendo coluna de conta, é o desenho por perna.
    // A contrapartida é OPCIONAL: há relatório que traz só "Histórico | Documento | Chave | Débito | Crédito"
    // e junta as duas pernas pela CHAVE (Dony, 02/10/2026, o diário da UDLOG, que a colaboradora não conseguiu
    // ler). Sem contrapartida, quem confirma o desenho são as linhas de conta no corpo (ver reconhecerPorBloco).
    if (debito < 0 || credito < 0 || historico < 0) return null;
    if (achar(NOMES_PERNA.conta) >= 0) return null;
    const c = { porBloco: true, conta: -1, contrapartida: contra, debito, credito, historico,
      lote: achar(NOMES_PERNA.lote), documento: achar(NOMES_PERNA.documento), reduzidoContra: achar(NOMES_BLOCO.reduzidoContra) };
    const iData = achar(NOMES.data);
    c.data = iData;
    // A data pode vir partida em TRÊS COLUNAS — Dia, Mês, Ano (Dony, 08/10/2026, a Jotec).
    if (iData < 0) {
      const dia = ch.indexOf('dia'), mes = ch.indexOf('mes'), ano = ch.indexOf('ano');
      if (dia >= 0 && mes >= 0 && ano >= 0) c.dma = { dia, mes, ano };
    }
    c.semColunaDeData = iData < 0 && !c.dma;
    c.identificacao = c.lote >= 0 ? [c.lote] : [];
    return c;
  }
  // A data de uma linha quando ela vem em Dia, Mês e Ano separados.
  function dataDeDMA(l, c) {
    if (!c || !c.dma) return null;
    const n = (k) => { const v = String(l[k] === null || l[k] === undefined ? '' : l[k]).trim(); return /^\d{1,4}$/.test(v) ? Number(v) : null; };
    const d = n(c.dma.dia), m = n(c.dma.mes), a = n(c.dma.ano);
    if (!d || !m || !a || d > 31 || m > 12 || a < 1900) return null;
    return a + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  // A linha "Conta: ASSOC BRASILEIRA…  2.01.05.05.05.0152  F00152" (às vezes partida em várias células).
  // Também "Conta Contábil: 1.1.1.01.0001 - Caixa    Saldo inicial: 976,45" (Dony, 08/10/2026, a Jotec):
  // o "Saldo inicial" é cortado antes, senão ele vira parte do nome — ou, pior, é lido como a classificação.
  const LINHA_DE_CONTA = /^\s*conta(?:\s+cont[áa]bil)?\s*:?\s*(.+)$/i;
  const SALDO_INICIAL = /\s*saldo\s+inicial\s*:?.*$/i;
  // Sem a palavra "Conta:", a linha do bloco é "237 - 1.3.4.01.006 - Softwares" ou "1.3.4.01.006 - Softwares":
  // reduzido (opcional), CLASSIFICAÇÃO com pelo menos três pedaços, e o nome (Dony, 02/10/2026, a UDLOG).
  // O padrão é fechado de propósito: a continuação de um histórico (" FRANCO 37368676893 - Matriz") não casa.
  const CONTA_SOLTA = /^\s*(?:(\d{1,8})\s*[-–]\s*)?(\d+(?:\.\d+){2,})\s*[-–]\s*(\S.*)$/;
  function contaDoBloco(linha) {
    const cheias = (linha || []).filter((x) => !(x === null || x === undefined || String(x).trim() === ''));
    if (!cheias.length) return null;
    const todo = cheias.map((x) => String(x).trim()).join(' ').replace(/\s+/g, ' ');
    const m = todo.match(LINHA_DE_CONTA);
    if (!m) {
      // A linha tem que ser SÓ a conta: com valor ou documento ao lado, é lançamento, não cabeçalho de bloco.
      if (cheias.length !== 1) return null;
      const s = todo.match(CONTA_SOLTA);
      if (!s) return null;
      return { conta: s[2], nome: s[3].trim(), reduzido: s[1] || '' };
    }
    const resto = m[1].replace(SALDO_INICIAL, '');
    const achados = resto.match(/\d+(?:\.\d+){2,}/g);   // a classificação tem pelo menos três pedaços
    if (!achados || !achados.length) return null;
    const conta = achados[achados.length - 1];
    const i = resto.lastIndexOf(conta);
    let nome = resto.slice(0, i).replace(/[-–\s]+$/, '').trim();
    let reduzido = resto.slice(i + conta.length).replace(/^[-–\s]+/, '').trim();
    // "69 - 1.01.01.01.01.0001 - Caixa Matriz": o que veio antes é o reduzido e o que veio depois é o nome.
    if (!/[A-Za-zÀ-ÿ]/.test(nome) && /[A-Za-zÀ-ÿ]/.test(reduzido)) { const t = nome; nome = reduzido; reduzido = t; }
    return { conta, nome, reduzido };
  }
  // Uma linha do bloco é UMA PERNA do lançamento, como no desenho da Zelco — só que a conta não vem na
  // linha: é a conta do bloco. O valor está em Débito ou em Crédito, e a chave junta as duas pernas.
  // (A coluna de contrapartida é o que identifica o desenho e completa a perna que ficou sozinha.)
  function lerBloco(l, c, bloco) {
    if (!bloco) return { debito: '', credito: '', valor: null };
    // COM contrapartida (a Omega), as colunas do cabeçalho valem e a contrapartida confirma o desenho.
    // SEM ela (a UDLOG), as colunas escorregam de linha para linha: confiar no cabeçalho faria o programa
    // somar o número da CHAVE como se fosse dinheiro. Por isso, aí embaixo, o valor é achado pelo que ele é.
    if (c.contrapartida >= 0) {
      const vd = valorDe(l[c.debito]);
      const vc = valorDe(l[c.credito]);
      const contra = contaDe(l[c.contrapartida]);
      if (vd) return { debito: bloco.conta, credito: '', contrapartida: contra, valor: vd, coluna: c.debito };
      if (vc) return { debito: '', credito: bloco.conta, contrapartida: contra, valor: vc, coluna: c.credito };
      return { debito: '', credito: '', valor: null };
    }
    if (c.lote < 0) return { debito: '', credito: '', valor: null };
    // Nessas linhas tudo pode ter escorregado de coluna — inclusive a chave e o documento, que também são
    // números. Então o programa acha primeiro O DINHEIRO (a célula com centavos; não havendo, a última
    // numérica da linha) e, a partir dele, a CHAVE (o último inteiro antes do valor). O valor logo depois da
    // chave é débito; mais adiante, crédito. Sem isso o programa chegou a somar o número da chave como se
    // fosse dinheiro (Dony, 02/10/2026, o diário da UDLOG).
    const celula = (k) => (l[k] === null || l[k] === undefined ? '' : String(l[k])).trim();
    let kValor = -1;
    for (let k = c.lote; k < l.length; k++) {
      if (celula(k).indexOf(',') >= 0 && valorDe(l[k]) !== null) { kValor = k; break; }
    }
    if (kValor < 0) for (let k = l.length - 1; k > c.lote; k--) { if (valorDe(l[k]) !== null) { kValor = k; break; } }
    if (kValor < 0) return { debito: '', credito: '', valor: null };
    let kChave = -1;
    for (let k = kValor - 1; k >= 0; k--) { if (/^[0-9]{3,10}$/.test(celula(k))) { kChave = k; break; } }
    const v = valorDe(l[kValor]);
    if (v === null) return { debito: '', credito: '', valor: null };
    // Quando as duas pernas do mesmo lançamento caem em colunas vizinhas, o lado é confirmado depois, pelo par.
    return kChave >= 0 && kValor === kChave + 1
      ? { debito: bloco.conta, credito: '', valor: v, coluna: kValor }
      : { debito: '', credito: bloco.conta, valor: v, coluna: kValor };
  }

  // AS COLUNAS DE VALOR CONFERIDAS NOS DADOS. O cabeçalho pode estar deslocado em relação ao corpo: no
  // diário da UDLOG ele traz uma coluna vazia a mais ("Histórico | Documento | Chave | | Débito | Crédito")
  // e os valores caem uma casa antes. Lendo pelo cabeçalho, o crédito entrava como débito e o diário não
  // fechava (Dony, 02/10/2026: "uma colaboradora não conseguiu ler esse diário"). Aqui o programa olha ONDE
  // OS VALORES ESTÃO e, se o par de colunas vizinhas for outro, usa o que os dados mostram.
  // O rótulo numa célula e o valor na de ao lado (células mescladas na impressão): se a coluna que o
  // cabeçalho indica não traz número nenhum e uma vizinha à direita traz, o valor é o da vizinha
  // (Dony, 08/10/2026, a Jotec: "Débito" na coluna 15 e os valores na 16, "Crédito" na 19 e os valores na 20).
  function encostarNoValor(linhas, r, c) {
    const quantos = new Map();
    let olhadas = 0;
    for (let i = r + 1; i < linhas.length && olhadas < 600; i++) {
      const l = linhas[i];
      if (!l || contaDoBloco(l) || dataDoDia(l)) continue;
      const primeira = l.find((x) => !(x === null || x === undefined || String(x).trim() === ''));
      if (primeira === undefined || LINHA_DE_TOTAL.test(String(primeira))) continue;
      let achou = false;
      for (let k = 0; k < l.length; k++) { if (valorDe(l[k]) !== null) { quantos.set(k, (quantos.get(k) || 0) + 1); achou = true; } }
      if (achou) olhadas++;
    }
    if (olhadas < 10) return c;
    const encostada = (k) => {
      if (k < 0 || (quantos.get(k) || 0) >= 3) return k;
      for (let d = 1; d <= 2; d++) if ((quantos.get(k + d) || 0) >= 3) return k + d;
      return k;
    };
    const deb = encostada(c.debito), cre = encostada(c.credito);
    if (deb === c.debito && cre === c.credito) return c;
    return Object.assign({}, c, { debito: deb, credito: cre, encostada: true });
  }

  function calibrarPorBloco(linhas, r, c) {
    if (c.contrapartida >= 0) return encostarNoValor(linhas, r, c); // com contrapartida o cabeçalho se prova
    //                                                                 sozinho (a Omega); só o valor pode escorregar
    const onde = new Map();
    let olhadas = 0;
    for (let i = r + 1; i < linhas.length && olhadas < 500; i++) {
      const l = linhas[i];
      if (!l || contaDoBloco(l) || dataDoDia(l)) continue;
      const primeira = l.find((x) => !(x === null || x === undefined || String(x).trim() === ''));
      if (primeira === undefined || LINHA_DE_TOTAL.test(String(primeira))) continue;
      let achou = false;
      for (let k = 1; k < l.length; k++) {
        if (k === c.lote || k === c.documento) continue;
        if (valorDe(l[k]) === null) continue;
        onde.set(k, (onde.get(k) || 0) + 1);
        achou = true;
      }
      if (achou) olhadas++;
    }
    if (olhadas < 10) return c;
    const ordem = Array.from(onde.entries()).sort((a, b) => b[1] - a[1]);
    const melhor = ordem.slice(0, 2).map(([k]) => k).sort((a, b) => a - b);
    if (melhor.length !== 2 || melhor[1] - melhor[0] !== 1) return c;
    const noCabecalho = (onde.get(c.debito) || 0) + (onde.get(c.credito) || 0);
    const nosDados = (onde.get(melhor[0]) || 0) + (onde.get(melhor[1]) || 0);
    if (melhor[0] === c.debito && melhor[1] === c.credito) return c;
    if (nosDados <= noCabecalho) return c;
    return Object.assign({}, c, { debito: melhor[0], credito: melhor[1], calibrada: true });
  }

  // Linha que só traz a DATA DO DIA ("18/05/2026" e o resto vazio): dali para a frente, os lançamentos são
  // desse dia. É assim que alguns relatórios separam os dias em vez de repetir a data em cada linha.
  function dataDoDia(linha) {
    const cheias = (linha || []).map((x, i) => [i, x]).filter(([, x]) => !(x === null || x === undefined || String(x).trim() === ''));
    if (cheias.length !== 1) return null;
    const bruto = String(cheias[0][1]).trim();
    // Só a data ("18/05/2026") ou a data enfeitada pelo relatório ("**** DATA: 01/01/2026 ****", a Omega).
    // Em volta só cabem símbolos e a palavra "data"/"dia": FRASE com data no fim é histórico, não é o dia.
    // (Dony, 02/10/2026, a UDLOG: a continuação " E SHIPPING SERVICES LTDA Ref. 16/12/2024" virava a data
    // do dia e levava os lançamentos seguintes para o mês errado.)
    const m = bruto.match(/^[\s*·•.\-=_]*(?:(?:data|dia)\s*:?\s*)?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})[\s*·•.\-=_]*$/i);
    if (!m) return null;
    const d = Util.lerData(m[1]);
    return d && d.valida !== false ? d : null;
  }
  // Linha de fechamento do relatório: total do dia, total do mês, transporte, página.
  const LINHA_DE_TOTAL = /^\s*(total|totais|transporte|soma|p[aá]gina|folha)\b/i;

  // Uma PERNA do lançamento: a linha traz UMA conta e o valor em Débitos ou em Créditos (o desenho da Zelco).
  function lerPerna(l, c) {
    const conta = contaDe(l[c.conta]);
    if (!conta) return { debito: '', credito: '', valor: null };
    const vd = valorDe(l[c.debito]);
    const vc = valorDe(l[c.credito]);
    if (vd) return { debito: conta, credito: '', valor: vd };
    if (vc) return { debito: '', credito: conta, valor: vc };
    return { debito: '', credito: '', valor: null };
  }

  // A PARTIDA DE UMA LINHA (conta de débito, conta de crédito e valor).
  // Primeiro pelas colunas do cabeçalho. Quando não bate — há relatório que muda o número de colunas no meio
  // do arquivo (Dony, 23/09/2026: no diário da Felix, de agosto em diante some uma coluna) —, procura sozinho:
  // o VALOR é a última célula numérica com centavos ou a última preenchida; as contas são as células só de
  // dígitos antes dele. Com uma conta só (lançamento de várias linhas), o lado vem do deslocamento das colunas.
  function lerPartida(linha, c) {
    const l = linha || [];
    const direto = { debito: contaDe(l[c.debito]), credito: contaDe(l[c.credito]), valor: valorDe(l[c.valor]) };
    if (direto.valor !== null && (direto.debito || direto.credito)) return direto;
    // Onde está o valor: a última célula preenchida que dá número e não é código de conta puro.
    let iValor = -1;
    for (let k = l.length - 1; k >= 0; k--) {
      const x = l[k];
      if (x === null || x === undefined || String(x).trim() === '') continue;
      const v = valorDe(x);
      if (v === null) continue;
      const soDigitos = /^\d+$/.test(String(x).trim());
      if (soDigitos && iValor >= 0) break;     // já achei o valor: dígitos antes dele são contas
      if (soDigitos && k <= c.historico) break; // número no lugar do histórico não é valor
      iValor = k;
      break;
    }
    if (iValor < 0) return direto;
    const valor = valorDe(l[iValor]);
    const contas = [];
    for (let k = 0; k < iValor; k++) { const cc = contaDe(l[k]); if (cc) contas.push({ k, conta: cc }); }
    if (!contas.length) return { debito: '', credito: '', valor };
    if (contas.length >= 2) {
      const a = contas[contas.length - 2], b = contas[contas.length - 1];
      return { debito: a.conta, credito: b.conta, valor };
    }
    // Uma conta só: o lado vem do deslocamento entre a coluna do valor aqui e a do cabeçalho.
    const desloc = iValor - c.valor;
    const so = contas[0];
    const perto = (alvo) => Math.abs(so.k - (alvo + desloc));
    return perto(c.debito) <= perto(c.credito) ? { debito: so.conta, credito: '', valor } : { debito: '', credito: so.conta, valor };
  }
  // Código de conta (reduzido): só dígitos (a planilha pode trazer 400 como número inteiro; 12,50 não é conta).
  function contaDe(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v < 1e12 ? String(v) : '';
    const s = String(v).trim();
    if (/^\d{1,12}$/.test(s)) return s.replace(/^0+(?=\d)/, '');
    // Conta escrita com pontos, como o diário da Zelco ("2.1.50.010.001").
    return /^\d{1,4}(\.\d{1,6}){1,6}$/.test(s) ? s : '';
  }
  function valorDe(v) {
    if (typeof v === 'number') return isFinite(v) ? Util.centavos(v) : null;
    const n = Util.paraNumero(v);
    return n === null ? null : Util.centavos(n);
  }

  // É um diário? O cabeçalho nas primeiras linhas e, embaixo, linhas com conta de débito e/ou de crédito e valor. Num
  // razão com colunas Débito, Crédito e Valor, o valor repete o débito ou o crédito: esse não é diário. E precisa do
  // título de livro diário (no começo do arquivo ou no nome dele): sem ele é uma planilha de lançamentos (importação,
  // reclassificação, depreciação), que o leitor geral continua sem tomar por diário. op: { nomeArquivo, semTitulo (aceita
  // sem o título: o arquivo foi posto no lugar do diário) }.
  // O reconhecimento do desenho "por conta, com contrapartida", numa função só: ele é usado na ordem normal
  // e também na frente, quando a empresa já tem esse padrão guardado.
  function reconhecerPorBloco(linhas, rb, opc, tituloNoNome) {
    let cb = cabecalhoPorBloco(linhas[rb]);
    if (!cb) return null;
    cb = calibrarPorBloco(linhas, rb, cb);
    let blocos = 0, comValor = 0, comContra = 0, bloco = null;
    for (const l of linhas.slice(rb + 1, rb + 200)) {
      if (!l) continue;
      const nova = contaDoBloco(l);
      if (nova) { bloco = nova; blocos++; continue; }
      const primeira = l.find((x) => !(x === null || x === undefined || String(x).trim() === ''));
      if (primeira !== undefined && LINHA_DE_TOTAL.test(String(primeira))) continue;   // "TOTAL DO DIA" não é lançamento
      const p = lerBloco(l, cb, bloco);
      if (p.valor === null) continue;
      comValor++;
      if (p.contrapartida) comContra++;   // a contrapartida escrita na linha é a cara deste desenho
    }
    // Com coluna de contrapartida, ela tem que aparecer de verdade nas linhas. Sem ela, o que prova o desenho
    // são os BLOCOS DE CONTA: várias contas, cada uma com as suas linhas de valor (a UDLOG).
    const temColunaContra = cb.contrapartida >= 0;
    if (temColunaContra) { if (!(blocos >= 2 && comValor >= 3 && comContra >= comValor * 0.5)) return null; }
    else if (!(blocos >= 3 && comValor >= 3 && comValor >= blocos * 0.8)) return null;
    const tituloB = tituloNoNome || linhas.slice(0, rb).some((l) => l && l.some((x) => /\bdiario\b/i.test(Util.semAcento(String(x === null || x === undefined ? '' : x)))));
    if (tituloB || opc.semTitulo) {
      return { tipo: 'diario', porBloco: true,
        motivo: temColunaContra
          ? 'Livro diário por conta: cada dia tem blocos "Conta: …" e cada linha traz a contrapartida e o valor em Débito ou em Crédito.'
          : 'Livro diário por conta: cada dia tem blocos de conta e, dentro deles, uma linha por perna, com a chave juntando as duas.' };
    }
    return { tipo: null, semTitulo: true, motivo: 'Tem blocos de conta com contrapartida, débitos e créditos, mas não o título de livro diário.' };
  }

  function reconhecer(abas, op) {
    const opc = op || {};
    const tituloNoNome = /diario/i.test(Util.semAcento(String(opc.nomeArquivo || '')));
    for (const aba of abas || []) {
      const linhas = aba.linhas || [];
      // Com o PADRÃO GUARDADO da empresa, o desenho dela é procurado primeiro.
      if (opc.desenho === 'porBloco') {
        const rr = linhas.slice(0, 40).findIndex((l) => l && cabecalhoPorBloco(l));
        if (rr >= 0 && !cabecalho(linhas[rr])) {
          const guardado = reconhecerPorBloco(linhas, rr, opc, tituloNoNome);
          if (guardado) return guardado;
        }
      }
      // O desenho "uma linha por perna" (a Zelco): conta numa coluna e o valor em Débitos ou em Créditos.
      const rp = linhas.slice(0, 40).findIndex((l) => l && !cabecalho(l) && cabecalhoPorPerna(l));
      if (rp >= 0) {
        const cp = cabecalhoPorPerna(linhas[rp]);
        let pernas = 0, comConta = 0;
        for (const l of linhas.slice(rp + 1, rp + 120)) {
          if (!l || cabecalhoPorPerna(l)) continue;
          const p = lerPerna(l, cp);
          if (p.valor === null) continue;
          pernas++;
          if (p.debito || p.credito) comConta++;
        }
        if (pernas >= 4 && comConta >= pernas * 0.9) {
          const tituloP = tituloNoNome || linhas.slice(0, rp).some((l) => l && l.some((x) => /\bdiario\b/i.test(Util.semAcento(String(x === null || x === undefined ? '' : x)))));
          if (tituloP || opc.semTitulo) {
            return { tipo: 'diario', porPerna: true,
              motivo: 'Livro diário com uma linha por lançamento: a conta numa coluna e o valor em Débitos ou em Créditos; as pernas da mesma partida andam juntas pelo lote.' };
          }
          return { tipo: null, semTitulo: true, motivo: 'Tem conta, débitos e créditos linha a linha, mas não o título de livro diário.' };
        }
      }
      // O desenho "por conta, com contrapartida" (a Omega): blocos "Conta: …" e a contrapartida na linha.
      const rb = linhas.slice(0, 40).findIndex((l) => l && !cabecalho(l) && !cabecalhoPorPerna(l) && cabecalhoPorBloco(l));
      if (rb >= 0) {
        const doBloco = reconhecerPorBloco(linhas, rb, opc, tituloNoNome);
        if (doBloco) return doBloco;
      }
      const r = linhas.slice(0, 40).findIndex((l) => l && cabecalho(l));
      if (r < 0) continue;
      const c = cabecalho(linhas[r]);
      let boas = 0, vistas = 0, repetem = 0, comData = 0, diasSoltos = 0;
      for (const l of linhas.slice(r + 1, r + 80)) {
        if (!l || cabecalho(l)) continue;
        if (dataDoDia(l)) { diasSoltos++; continue; }
        const v = valorDe(l[c.valor]);
        if (v === null) continue;
        vistas++;
        if (contaDe(l[c.debito]) || contaDe(l[c.credito])) boas++;
        if (valorDe(l[c.debito]) === v || valorDe(l[c.credito]) === v) repetem++;
        if (c.data >= 0 && Util.lerData(l[c.data])) comData++;
      }
      if (!(vistas >= 3 && boas >= vistas * 0.9 && repetem < vistas * 0.5)) continue;
      // Sem coluna de data, a data tem que vir das linhas do dia; com a coluna, ela tem que estar preenchida.
      if (c.semColunaDeData ? diasSoltos < 1 : comData < 1) continue;
      const titulo = tituloNoNome || linhas.slice(0, r).some((l) => l && l.some((x) => /\bdiario\b/i.test(Util.semAcento(String(x === null || x === undefined ? '' : x)))));
      if (titulo || opc.semTitulo) return { tipo: 'diario', motivo: 'Livro diário: Data, Histórico, conta de Débito, conta de Crédito e Valor, uma partida por linha.' };
      return { tipo: null, semTitulo: true, motivo: 'Tem lançamentos com conta de débito, conta de crédito e valor, mas não o título de livro diário (planilha de lançamentos?).' };
    }
    return { tipo: null };
  }

  // A ordem em que os desenhos são testados. Com o PADRÃO GUARDADO da empresa (Dony, 29/09/2026: "precisa
  // ter um padrão para cada cliente"), o dela vem primeiro — só se não servir é que o programa adivinha.
  function naOrdem(l, desenho) {
    if (desenho === 'porBloco') return cabecalhoPorBloco(l) || cabecalho(l) || cabecalhoPorPerna(l);
    if (desenho === 'porPerna') return cabecalhoPorPerna(l) || cabecalho(l) || cabecalhoPorBloco(l);
    return cabecalho(l) || cabecalhoPorPerna(l) || cabecalhoPorBloco(l);
  }

  function ler(abas, opcoes) {
    const opc = opcoes || {};
    const nomeArquivo = (opcoes && opcoes.nomeArquivo) || '';
    const avisos = [];
    const lancamentos = [];
    let empresa = '', cnpj = '', linhasIgnoradas = 0, desenhoUsado = null;
    const totaisDoDia = [];
    const vazio = (x) => x === null || x === undefined || String(x).trim() === '';
    const limparHistorico = (x) => String(vazio(x) ? '' : x).replace(/^"+|"+$/g, '').replace(/\s+/g, ' ').trim();
    for (const aba of abas || []) {
      const linhas = aba.linhas || [];
      let c = null, data = null, ultima = null, bloco = null;
      for (let r = 0; r < linhas.length; r++) {
        const l = linhas[r];
        if (!l) continue;
        const texto = l.map((x) => (x === null || x === undefined ? '' : String(x))).join(' ');
        if (!empresa) { const m = texto.match(/Empresa:\s*(?:\d+\s*-\s*)?(.+?)(?:\s{2,}|$)/); if (m) empresa = m[1].replace(/\s+/g, ' ').trim(); }
        // Há relatório que não escreve "Empresa:": o nome vem sozinho numa célula do cabeçalho, antes do
        // primeiro lançamento (Dony, 08/10/2026, a Jotec). Vale a célula mais longa que acaba em LTDA/S.A./ME.
        if (!empresa && !c && r < 12) {
          const nome = (l || []).map((x) => String(x === null || x === undefined ? '' : x).replace(/\s+/g, ' ').trim())
            .filter((x) => x.length >= 12 && /\b(LTDA|S\.?A\.?|EIRELI|ME|EPP|MEI)\b\.?$/i.test(x) && !/^(CNPJ|FOLHA|P[ÁA]GINA)/i.test(x))
            .sort((a, b) => b.length - a.length)[0];
          if (nome) empresa = nome;
        }
        if (!cnpj) { const m = texto.match(/CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i); if (m && Util.cnpjValido(Util.limparCnpj(m[1]))) cnpj = Util.limparCnpj(m[1]); }
        const cab = naOrdem(l, opc.desenho);
        if (cab) {
          // Cabeçalho repetido no alto de cada página. Há relatório que, da segunda página em diante, põe a DATA
          // no lugar da palavra "Data" ("05/01/2026 | Histórico | … "): nesse caso o cabeçalho continua o mesmo
          // (não perde a coluna de data) e a data da linha vale para o que vem depois.
          if (c && cab.semColunaDeData && !c.semColunaDeData) {
            const dCab = Util.lerData(l[c.data]);
            if (dCab) data = dCab;
            ultima = null;
            continue;
          }
          c = cab;
          if (c.porBloco) c = calibrarPorBloco(linhas, r, c);
          desenhoUsado = c.porBloco ? 'porBloco' : c.porPerna ? 'porPerna' : 'linha';
          continue;
        }
        if (!c) continue;
        // A linha "Conta: …" abre o bloco de uma conta (desenho por conta, com contrapartida).
        if (c.porBloco) {
          const nova = contaDoBloco(l);
          if (nova) { bloco = nova; ultima = null; continue; }
        }
        // A data do dia numa linha só dela (diário sem coluna de data).
        const doDia = dataDoDia(l);
        if (doDia) { data = doDia; ultima = null; continue; }
        // Total do dia, total do mês, transporte: não é lançamento — mas o TOTAL DO DIA é a conferência que o
        // próprio relatório imprime, e o programa usa para provar que leu certo (Dony, 23/09/2026).
        const primeira = l.find((x) => !vazio(x));
        if (primeira !== undefined && LINHA_DE_TOTAL.test(String(primeira))) {
          if (/total\s+(do\s+)?dia/i.test(String(primeira)) && data) {
            // Com as colunas de valor conhecidas (por bloco ou por perna), o total do dia sai delas. Pegar
            // "o primeiro e o último número da linha" fazia o programa somar o NÚMERO DO DIA como se fosse
            // dinheiro: "Total do Dia | 8 | : | 300 | 0 | 1.276,45" virava 8,00 de débito
            // (Dony, 08/10/2026, a Jotec).
            const porColuna = (c.porBloco || c.porPerna) && c.debito >= 0 && c.credito >= 0;
            const vd = porColuna ? valorDe(l[c.debito]) : null;
            const vc = porColuna ? valorDe(l[c.credito]) : null;
            if (porColuna && (vd !== null || vc !== null)) totaisDoDia.push({ data: data.texto, debito: vd || 0, credito: vc || 0 });
            else if (!porColuna) {
              const numeros = l.map((x) => (vazio(x) || /^\s*(total|cre|deb)/i.test(String(x)) ? null : valorDe(x))).filter((x) => x !== null);
              if (numeros.length >= 2) totaisDoDia.push({ data: data.texto, debito: numeros[0], credito: numeros[numeros.length - 1] });
            }
          }
          linhasIgnoradas++;
          ultima = null;
          continue;
        }
        // A data vem da coluna Data ou, quando o relatório a parte em três, de Dia + Mês + Ano (a Jotec).
        const d = c.data >= 0 ? Util.lerData(l[c.data]) : (c.dma ? Util.lerData(dataDeDMA(l, c)) : null);
        const partida = c.porBloco ? lerBloco(l, c, bloco) : c.porPerna ? lerPerna(l, c) : lerPartida(l, c);
        const debito = partida.debito, credito = partida.credito;
        const v = partida.valor;
        // Linha só com texto no histórico, depois de uma partida: a continuação do histórico (o relatório quebra o
        // histórico longo em mais de uma linha). Junta com espaço.
        const hist = limparHistorico(l[c.historico]);
        const semData = c.data >= 0 ? vazio(l[c.data]) : (c.dma ? !dataDeDMA(l, c) : true);
        if (ultima && hist && semData && l.every((x, k) => k === c.historico || vazio(x)) && !/^(di[aá]rio|empresa|total|transporte|p[aá]gina|folha)\b/i.test(hist)) {
          ultima.historico = (ultima.historico + ' ' + hist).trim();
          continue;
        }
        // Linha sem conta ou sem valor: cabeçalho de página, total do dia, linha em branco.
        if (v === null || (!debito && !credito)) { linhasIgnoradas++; continue; }
        if (d) data = d;
        if (!data) { linhasIgnoradas++; continue; }
        // Valor negativo: inverte os lados (fica sempre positivo).
        const troca = v < 0;
        ultima = { n: lancamentos.length + 1, linha: r + 1, data: data.texto, dia: data.dia, mes: data.mes, ano: data.ano, historico: hist,
          debito: troca ? credito : debito, credito: troca ? debito : credito, valor: Math.abs(v) };
        // O lote/número do lançamento junta as pernas da mesma partida (no desenho por perna).
        if ((c.porPerna || c.porBloco) && (c.identificacao || []).length) {
          ultima.lote = c.identificacao.map((i) => (l[i] === null || l[i] === undefined ? '' : String(l[i]))).join(' ').replace(/s+/g, ' ').trim();
        }
        if (c.porBloco && c.contrapartida < 0 && partida.coluna !== undefined) ultima.coluna = partida.coluna;
        if (c.porPerna && c.nomeDaConta >= 0 && c.nomeDaConta !== c.historico) ultima.nomeDaConta = limparHistorico(l[c.nomeDaConta]);
        if (c.porBloco && bloco && bloco.nome) ultima.nomeDaConta = bloco.nome;
        lancamentos.push(ultima);
      }
    }
    // Os lançamentos: a linha com os dois lados é um lançamento; as linhas seguidas de um lado só formam um lançamento
    // quando a soma (débitos − créditos) volta a zero.
    // O LADO PELO PAR (diário por bloco sem contrapartida). O relatório da UDLOG mistura duas larguras: na
    // maioria das linhas o valor cai na coluna do débito e, em algumas, uma casa adiante — e aí um débito
    // tem a mesma cara de um crédito. Como as duas pernas do lançamento trazem a mesma chave e o mesmo
    // valor, elas resolvem a dúvida sozinhas: das duas colunas vizinhas em que os valores caíram, a da
    // ESQUERDA é o débito e a da DIREITA é o crédito (Dony, 02/10/2026).
    const temColuna = lancamentos.some((x) => x.coluna !== undefined);
    if (temColuna) {
      const porChave = new Map();
      lancamentos.forEach((x) => {
        if (x.coluna === undefined || !x.lote) return;
        const k = x.data + '|' + x.lote;
        if (!porChave.has(k)) porChave.set(k, []);
        porChave.get(k).push(x);
      });
      let arrumadas = 0;
      porChave.forEach((pernas) => {
        if (pernas.length !== 2) return;
        const [a, b] = pernas.slice().sort((p, q) => p.coluna - q.coluna);
        if (a.coluna === b.coluna || b.coluna - a.coluna !== 1 || a.valor !== b.valor) return;
        const conta = (x) => x.debito || x.credito;
        if (!a.debito) { a.debito = conta(a); a.credito = ''; arrumadas++; }
        if (!b.credito) { b.credito = conta(b); b.debito = ''; arrumadas++; }
      });
      if (arrumadas) avisos.push(arrumadas + ' linha(s) vinham com as colunas deslocadas: o lado foi conferido pela outra perna do mesmo lançamento.');
    }
    let grupos = 0, aberto = null, abertosNoFim = 0;
    const porLote = new Map();
    for (const x of lancamentos) {
      // Com lote/número do lançamento, as pernas do mesmo lançamento andam juntas por ele (é o que o relatório
      // imprime); sem lote, vale a regra de sempre: linhas seguidas de um lado só até a soma voltar a zero.
      if (x.lote) {
        const k = x.data + '|' + x.lote;
        if (!porLote.has(k)) porLote.set(k, ++grupos);
        x.grupo = porLote.get(k);
        continue;
      }
      if (x.debito && x.credito) { x.grupo = ++grupos; continue; }
      if (!aberto) aberto = { id: ++grupos, soma: 0 };
      x.grupo = aberto.id;
      aberto.soma += x.debito ? x.valor : -x.valor;
      if (aberto.soma === 0) aberto = null;
    }
    if (aberto) { abertosNoFim = 1; avisos.push('O último lançamento de várias linhas não fecha (sobra ' + Util.formatarCentavos(aberto.soma) + ').'); }
    // CONFERÊNCIA COM O TOTAL DO DIA que o relatório imprime: cada dia lido tem que dar o mesmo número.
    const porDia = new Map();
    lancamentos.forEach((x) => { const a = porDia.get(x.data) || { debito: 0, credito: 0 }; if (x.debito) a.debito += x.valor; if (x.credito) a.credito += x.valor; porDia.set(x.data, a); });
    // O relatório pode imprimir o "Total do Dia" UMA VEZ POR DIA (a Omega, organizada por dia) ou UMA VEZ
    // POR CONTA dentro do dia, quando ele é uma ficha razão (Dony, 08/10/2026, a Jotec). No segundo caso a
    // mesma data aparece várias vezes, e o total do dia do diário é a SOMA delas — comparando um a um, o
    // programa avisava que 659 dias não batiam, quando na verdade batiam todos.
    const impressoPorDia = new Map();
    totaisDoDia.forEach((t) => {
      const a = impressoPorDia.get(t.data) || { debito: 0, credito: 0 };
      a.debito += t.debito; a.credito += t.credito;
      impressoPorDia.set(t.data, a);
    });
    const diasConferidos = [];
    impressoPorDia.forEach((t, dataDoTotal) => {
      const lido = porDia.get(dataDoTotal) || { debito: 0, credito: 0 };
      diasConferidos.push({ data: dataDoTotal, impresso: t.debito, lido: lido.debito, confere: t.debito === lido.debito });
    });
    const diasQueNaoBatem = diasConferidos.filter((x) => !x.confere);
    if (diasQueNaoBatem.length) {
      avisos.push(diasQueNaoBatem.length + ' dia(s) não batem com o total impresso no relatório (' +
        diasQueNaoBatem.slice(0, 3).map((x) => x.data + ': lido ' + Util.formatarCentavos(x.lido) + ' × impresso ' + Util.formatarCentavos(x.impresso)).join('; ') + ').');
    }
    const totalDebitos = lancamentos.reduce((s, x) => s + (x.debito ? x.valor : 0), 0);
    const totalCreditos = lancamentos.reduce((s, x) => s + (x.credito ? x.valor : 0), 0);
    if (totalDebitos !== totalCreditos) avisos.push('Os débitos (' + Util.formatarCentavos(totalDebitos) + ') não batem com os créditos (' + Util.formatarCentavos(totalCreditos) + '): diferença de ' + Util.formatarCentavos(totalDebitos - totalCreditos) + '.');
    // O período: do primeiro dia do primeiro mês ao último dia do último mês com lançamento.
    let periodo = null;
    const meses = [];
    if (lancamentos.length) {
      const nums = lancamentos.map((x) => x.ano * 12 + x.mes);
      const a = Math.min.apply(null, nums), b = Math.max.apply(null, nums);
      const ano = (k) => Math.floor((k - 1) / 12), mes = (k) => ((k - 1) % 12) + 1;
      periodo = { de: '01/' + String(mes(a)).padStart(2, '0') + '/' + ano(a), ate: String(new Date(ano(b), mes(b), 0).getDate()).padStart(2, '0') + '/' + String(mes(b)).padStart(2, '0') + '/' + ano(b) };
      for (let k = a; k <= b; k++) {
        const doMes = lancamentos.filter((x) => x.ano * 12 + x.mes === k);
        meses.push({ comp: ano(k) + '-' + String(mes(k)).padStart(2, '0') + '-01', lancamentos: doMes.length, arquivo: nomeArquivo });
      }
      const vazios = meses.filter((m) => !m.lancamentos).map((m) => Util.nomeCompetencia(m.comp));
      if (vazios.length) avisos.push('Sem lançamento em ' + vazios.join(', ') + ': confira se o diário está completo.');
    } else avisos.push('Não achei nenhum lançamento neste diário.');
    const contas = Array.from(new Set([].concat(...lancamentos.map((x) => [x.debito, x.credito])).filter(Boolean))).sort((x, y) => Number(x) - Number(y));
    return { tipo: 'diario', desenho: desenhoUsado, empresa, cnpj, nomeArquivo, periodo, meses, lancamentos, lancamentosDeVarias: lancamentos.filter((x) => !x.debito || !x.credito).length,
      grupos, contas, totalDebitos, totalCreditos, confere: totalDebitos === totalCreditos && !abertosNoFim && !diasQueNaoBatem.length, avisos, linhasIgnoradas,
      diasConferidos: diasConferidos.length, diasQueNaoBatem: diasQueNaoBatem.length };
  }

  return { reconhecer, ler, cabecalho, contaDe };
});
