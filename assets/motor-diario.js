/*
 * Conciliador Solutta — motor-diario.js
 * O que o programa faz com o LIVRO DIÁRIO da empresa (Dony, 22/09/2026: "ao invés de subir razão por razão, subir o
 * diário: a conciliação de fornecedores já entende os lançamentos de fornecedores, a de clientes também, a de resultado
 * também" + "o razão que você montar tem que ser exatamente o saldo inicial mais todos os débitos e créditos daquela
 * conta, e dar o saldo final que está no balancete"):
 *  - o PLANO DE CONTAS pelo código reduzido (o diário só traz o código): vem dos balancetes da empresa;
 *  - a CONFERÊNCIA com cada balancete do período: em cada conta analítica, os débitos e os créditos do mês no diário são
 *    os do balancete, e o saldo anterior + débitos − créditos é o saldo do fim do mês;
 *  - o SALDO NO COMEÇO de cada conta: o saldo anterior do balancete do primeiro mês do diário; sem ele, o de qualquer
 *    balancete do período, menos o que o diário movimentou antes dele;
 *  - o RAZÃO DE UMA CONTA num período, no mesmo desenho do razão que os passos usam (conta, saldo anterior, lançamentos com
 *    a contrapartida, o fornecedor e a nota lidos do histórico, e o saldo corrido), conferido com o saldo do balancete;
 *  - as CONTAS DAS CONCILIAÇÕES pelo nome e pela classificação (fornecedores e adiantamentos, clientes, bancos).
 * Valores em CENTAVOS; saldos em débito − crédito (o credor é negativo), como no balancete.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'), require('./ler-razao.js'), require('./familias.js'));
  else raiz.MotorDiario = fabrica(raiz.Util, raiz.LerRazao, raiz.Familias);
})(typeof self !== 'undefined' ? self : this, function (Util, LerRazao, Familias) {
  'use strict';

  const compDe = (x) => x.ano + '-' + String(x.mes).padStart(2, '0') + '-01';
  const classe = (conta) => String(conta || '').trim().replace(/^0+(?=\d)/, '').charAt(0);

  // ------------------------------------------------------------------
  // Plano de contas pelo código reduzido (de todos os balancetes; o nome do mais recente vale).
  // balancetes: [{ competencia, contas }]
  // ------------------------------------------------------------------
  // O plano vem dos balancetes. A conta do diário é achada pelo REDUZIDO e, quando o balancete não tem
  // reduzido, pela CLASSIFICAÇÃO — inclusive quando os dois relatórios escrevem a mesma conta com máscaras
  // diferentes (Dony, 25/09/2026, a Zelco: o balancete traz "1.1.1.002.0001" e o diário, "1.1.10.020.001";
  // tirando os pontos, os dígitos são os mesmos). Por isso o plano também é indexado só pelos dígitos.
  const soDigitos = (x) => String(x || '').replace(/\D+/g, '');
  // A conta dentro de um balancete: pelo reduzido, pela classificação ou pelos dígitos dela (a mesma conta
  // pode estar escrita com outra máscara em cada relatório).
  function contaNoBalancete(b, chave) {
    const k = String(chave || '').trim();
    if (!b || !k) return null;
    const dig = soDigitos(k);
    const contas = b.contas || [];
    return contas.find((c) => String(c.reduzido || '').trim() === k) ||
      contas.find((c) => String(c.conta || '').trim() === k) ||
      (dig ? contas.find((c) => soDigitos(c.conta) === dig) : null) || null;
  }
  function planoDosBalancetes(balancetes) {
    const plano = new Map();
    const apelidos = new Map(); // outro jeito de escrever a mesma conta -> a chave dela no plano
    (balancetes || []).slice().sort((a, b) => String(a.competencia).localeCompare(String(b.competencia))).forEach((b) => {
      const contas = b.contas || [];
      const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
      contas.forEach((c) => {
        const red = String(c.reduzido || '').trim();
        const cls = String(c.conta || '').trim();
        // A chave da conta é o reduzido; sem reduzido no balancete (o caso da Zelco), é a classificação.
        const chave = red || cls;
        if (!chave) return;
        plano.set(chave, { reduzido: chave, conta: c.conta, titulo: c.titulo || '', nivel: c.nivel, pai: c.pai || '', analitica: !pais.has(c.conta) });
        // Os APELIDOS ficam fora do plano (senão a mesma conta apareceria várias vezes em quem percorre o
        // plano inteiro): a classificação e os dígitos dela, para achar a conta escrita com outra máscara.
        if (cls && cls !== chave) apelidos.set(cls, chave);
        const dig = soDigitos(cls);
        if (dig && dig !== chave) apelidos.set(dig, chave);
      });
    });
    // Achar a conta do diário no plano: pelo que veio escrito, pelos apelidos, senão pelos dígitos.
    plano.achar = (codigo) => {
      const k = String(codigo || '').trim();
      if (!k) return null;
      if (plano.has(k)) return plano.get(k);
      const porApelido = apelidos.get(k) || apelidos.get(soDigitos(k));
      return porApelido ? plano.get(porApelido) || null : null;
    };
    plano.chaveDe = (codigo) => { const c = plano.achar(codigo); return c ? c.reduzido : String(codigo || '').trim(); };
    return plano;
  }

  // Os movimentos de cada conta no diário: por mês (competência) e no total.
  // O que se calcula uma vez por diário (o mesmo diário serve várias contas na mesma tela).
  const GUARDADOS = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function guardado(diario, chave, fazer) {
    if (!GUARDADOS || !diario || typeof diario !== 'object') return fazer();
    let g = GUARDADOS.get(diario);
    if (!g) { g = {}; GUARDADOS.set(diario, g); }
    if (!(chave in g)) g[chave] = fazer();
    return g[chave];
  }

  // O diário pode escrever a conta com uma máscara e o balancete com outra (Dony, 25/09/2026, a Zelco:
  // "1.1.10.020.001" no diário e "1.1.1.002.0001" no balancete). Antes de cruzar os dois, os códigos do
  // diário são traduzidos para a chave do plano — uma vez só, guardada no próprio diário.
  function traduzido(diario, plano) {
    if (!diario || !plano || typeof plano.achar !== 'function' || !plano.size) return diario;
    const marca = 'traduzido:' + plano.size + ':' + (plano.keys().next().value || '');
    return guardado(diario, marca, () => {
      let mudou = false;
      const conv = (c) => {
        const k = String(c || '');
        if (!k || plano.has(k)) return c;
        const x = plano.achar(k);
        if (x && x.reduzido !== k) { mudou = true; return x.reduzido; }
        return c;
      };
      const tradLanc = (l) => Object.assign({}, l, { debito: conv(l.debito), credito: conv(l.credito) });
      // Em alguns desenhos o mês guarda a lista de lançamentos; em outros, só a contagem. Só traduz a lista.
      const meses = (diario.meses || []).map((m) => (Array.isArray(m.lancamentos) ? Object.assign({}, m, { lancamentos: m.lancamentos.map(tradLanc) }) : m));
      const lancamentos = (diario.lancamentos || []).map(tradLanc);
      return mudou ? Object.assign({}, diario, { meses, lancamentos }) : diario;
    });
  }
  function movimentos(diario) { return guardado(diario, 'movimentos', () => calcularMovimentos(diario)); }
  function calcularMovimentos(diario) {
    const m = new Map();
    const somar = (conta, comp, d, c) => {
      if (!conta) return;
      let x = m.get(conta);
      if (!x) { x = { d: 0, c: 0, n: 0, porMes: new Map() }; m.set(conta, x); }
      x.d += d; x.c += c; x.n++;
      const pm = x.porMes.get(comp) || { d: 0, c: 0, n: 0 };
      pm.d += d; pm.c += c; pm.n++;
      x.porMes.set(comp, pm);
    };
    (diario.lancamentos || []).forEach((l) => { const comp = compDe(l); somar(l.debito, comp, l.valor, 0); somar(l.credito, comp, 0, l.valor); });
    return m;
  }

  // ------------------------------------------------------------------
  // CONFERÊNCIA com os balancetes: cada mês do diário com balancete, conta analítica por conta analítica.
  // ------------------------------------------------------------------
  function conferir(diario, balancetes) {
    const mov = movimentos(diario);
    const porComp = new Map((balancetes || []).map((b) => [String(b.competencia).slice(0, 10), b]));
    const meses = (diario.meses || []).map((m) => {
      const b = porComp.get(m.comp);
      if (!b) return { comp: m.comp, temBalancete: false, lancamentos: m.lancamentos };
      const contas = b.contas || [];
      const pais = new Set(contas.map((c) => c.pai).filter(Boolean));
      const analiticas = contas.filter((c) => !pais.has(c.conta) && String(c.reduzido || '').trim());
      const noBalancete = new Set(analiticas.map((c) => String(c.reduzido).trim()));
      const divergencias = [];
      analiticas.forEach((c) => {
        const red = String(c.reduzido).trim();
        const x = (mov.get(red) && mov.get(red).porMes.get(m.comp)) || { d: 0, c: 0 };
        const saldo = c.saldoAnterior + x.d - x.c;
        if (x.d !== c.debitos || x.c !== c.creditos || saldo !== c.saldoAtual) {
          divergencias.push({ reduzido: red, conta: c.conta, titulo: c.titulo, balancete: { debitos: c.debitos, creditos: c.creditos, saldoAnterior: c.saldoAnterior, saldoAtual: c.saldoAtual },
            diario: { debitos: x.d, creditos: x.c, saldoFinal: saldo }, diferencaSaldo: saldo - c.saldoAtual });
        }
      });
      // Contas que o diário movimentou no mês e que o balancete não tem (conta nova ou código trocado).
      const semBalancete = [];
      mov.forEach((x, red) => { const pm = x.porMes.get(m.comp); if (pm && !noBalancete.has(red)) semBalancete.push({ reduzido: red, debitos: pm.d, creditos: pm.c }); });
      return { comp: m.comp, temBalancete: true, lancamentos: m.lancamentos, contas: analiticas.length, batem: analiticas.length - divergencias.length, divergencias, semBalancete };
    });
    const com = meses.filter((m) => m.temBalancete);
    return {
      meses,
      mesesComBalancete: com.length,
      contasConferidas: com.reduce((s, m) => s + m.contas, 0),
      divergencias: com.reduce((s, m) => s + m.divergencias.length + m.semBalancete.length, 0),
      confere: com.length > 0 && com.every((m) => !m.divergencias.length && !m.semBalancete.length),
    };
  }

  // ------------------------------------------------------------------
  // SALDO NO COMEÇO do diário (1º dia do 1º mês) de uma conta: o saldo anterior do balancete do 1º mês; sem ele, o do
  // primeiro balancete do período (ou do mês logo depois do diário) menos o que o diário movimentou antes dele.
  // ------------------------------------------------------------------
  function saldoNoComeco(diario, balancetes, reduzido, mov) {
    const red = String(reduzido);
    const mv = (mov || movimentos(diario)).get(red);
    const comps = (diario.meses || []).map((m) => m.comp);
    if (!comps.length) return { valor: null, origem: null };
    const depois = Util.somarMeses(comps[comps.length - 1], 1);
    const candidatos = (balancetes || []).filter((b) => { const c = String(b.competencia).slice(0, 10); return comps.indexOf(c) >= 0 || c === depois; })
      .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
    for (const b of candidatos) {
      const comp = String(b.competencia).slice(0, 10);
      const linha = contaNoBalancete(b, red);
      // Balancete sem a conta: saldo zero nele (o balancete lista as contas com saldo ou movimento).
      const anterior = linha ? linha.saldoAnterior : 0;
      let antes = 0;
      if (mv) mv.porMes.forEach((x, c) => { if (c < comp) antes += x.d - x.c; });
      return { valor: anterior - antes, origem: comp === comps[0] ? 'balancete-do-mes' : 'balancete-de-' + comp, comp, contaNoBalancete: !!linha };
    }
    return { valor: null, origem: null };
  }

  // ------------------------------------------------------------------
  // O FORNECEDOR PELO HISTÓRICO do livro diário. No razão do sistema o fornecedor vem da coluna Participante; o diário não
  // tem essa coluna, e o nome só está no histórico. Quando o leitor do razão (LerRazao.lancamentoH) não acha o nome, estas
  // formas, medidas no caso real (a conta de fornecedores ficava com 3 de cada 4 linhas sem fornecedor):
  //   "Compras cfe NF nº. 123 - NOME", "Compras energia elétrica conf. NF nº. 1 - NOME", "Compras cfe n°.123 - Nome";
  //   "Pagamento Fatura|Boleto|Recibo|DACTE|Apólice|Nota Fiscal Eletrônica 123 [Parc 1/13] NOME", "Pagamento Parc 1/13 NOME",
  //   "Pagamento boleto - NOME", "Pagamento NOME - Pagamento realizado a partir da importação do extrato.";
  //   "TED … DEST. NOME", "TRANSF CC PARA CC [PJ] NOME", "Desconto obtido de NOME NF …", "Juros pagos a NOME NF …",
  //   "Empréstimos para Terceiros NOME Empréstimo …"; o nome depois de um " - " (a parte do extrato: "… - PAGTO ELETRON
  //   COBRANCA NOME"); e o histórico que é só o nome, em maiúsculas ("NOME COMERCIO LTDA").
  // ------------------------------------------------------------------
  const PAGO_NO_EXTRATO = /\s*-\s*pagamento\s*realizado.*$/i;
  const NAO_E_NOME = /^(RECLASS|AJUSTE|ESTORNO|BAIXA|TRANSF|PAGAMENTO|PAGTO|COMPRA|REF\b|DEVOLU|JUROS|DESCONTO|TARIFA|IOF|MULTA|SALDO|TOTAL|PROVIS|APROPRIA)/;
  function nomeDoHistorico(historico) {
    const h = String(historico || '').replace(/\s+/g, ' ').trim();
    const achou = (nota, nome) => ({ nota: nota || '', fornecedor: String(nome || '').replace(/\s+/g, ' ').trim() });
    let m = h.match(/^(?:compras?|vendas?)(?:\s+[a-zà-ú]+){0,2}\s+(?:cfe|conf\.?|conforme)\s+(?:nf\s*)?n[º°o]?\.?\s*([\w.\/-]+?)\s*-\s*(.+)$/i);
    if (m) return achou(m[1], m[2]);
    const semRabo = h.replace(PAGO_NO_EXTRATO, '');
    m = semRabo.match(/^pagamento\s+(?:fatura|boleto|recibo|dacte|ap[óo]lice|nota\s+fiscal(?:\s+eletr[ôo]nica)?)\s+\.{0,3}([\w.\/-]*\d[\w.\/-]*)\s+(?:parc\s+\d+\s*\/\s*\d+\s+)?(.+)$/i);
    if (m) return achou(m[1], m[2]);
    m = semRabo.match(/^pagamento\s+parc\s+\d+\s*\/\s*\d+\s+(.+)$/i) || semRabo.match(/^pagamento\s+boleto\s*-\s*(.+)$/i);
    if (m) return achou('', m[1]);
    if (PAGO_NO_EXTRATO.test(h)) { m = semRabo.match(/^pagamento\s+(.+)$/i); if (m) return achou('', m[1]); }
    m = /^ted\b/i.test(h) && h.match(/\bdest\.?\s+(.+)$/i);
    if (m) return achou('', m[1]);
    m = h.match(/^transf\s+cc\s+para\s+cc\s+(?:p[jf]\s+)?(.+)$/i) || h.match(/^desconto\s+obtido\s+de\s+(.+?)(?:\.?\s+nf\s.*)?$/i) ||
      h.match(/^juros\s+pagos\s+a\s+(.+?)(?:\.?\s+nf\s.*)?$/i) || h.match(/^empr[ée]stimos?\s+para\s+terceiros\s+(.+?)\s+empr[ée]stimo\b/i);
    if (m) return achou('', m[1]);
    const partes = h.split(/\s+-\s+/);
    for (let i = partes.length - 1; i >= 1; i--) { const x = LerRazao.lancamentoH(partes[i]); if (x.fornecedor) return achou(x.nota, x.fornecedor); }
    const palavras = h.split(' ').length;
    if (/^[A-ZÀ-Ú&.\/' -]+$/.test(h) && palavras >= 2 && palavras <= 8 && !NAO_E_NOME.test(Util.semAcento(h))) return achou('', h);
    const noMeio = nomePorPartes(h) || nomeNoFim(h);
    if (noMeio) return achou('', noMeio);
    return { nota: '', fornecedor: '' };
  }

  // ------------------------------------------------------------------
  // O NOME QUE ESTÁ NO MEIO DO HISTÓRICO, lido por partes (Dony, 23/09/2026: "como vc me diz que não tem
  // fornecedor mano? precisa ser mais inteligente"). No diário da Felix, 118 de 436 históricos ficavam sem nome
  // e o nome estava escrito neles: "PAGAMENTO FORNECEDOR - NOME - o que foi", "RECEBIMENTO/TRANSFERENCIA ENTRE
  // EMPRESAS - NOME", "Líquido Férias 08/2026 col.:9 - NOME", "PAGAMENTO - NOME - a descrição".
  // A régua é a de quem lê: quebra o histórico nos traços e fica com o pedaço que PARECE NOME — primeiro o que
  // termina em LTDA/ME/EIRELI/S.A., senão o primeiro pedaço curto que não é a descrição do que foi pago.
  // O primeiro pedaço fica de fora: ali está o tipo do lançamento, não o fornecedor.
  // ------------------------------------------------------------------
  const FIM_DE_EMPRESA = /\b(ltda|limitada|eireli|epp|mei|me|s\.?\/?a)\.?$/i;
  const E_DESCRICAO = new RegExp('^(' + [
    'ref\\b', 'refer', 'honorar', 'mensalid', 'parcela', 'parc\\b', 'vencto', 'vencimento', 'nota fiscal', 'nf\\b',
    'contabilid', 'escrit', 'consultor', 'aluguel', 'energia', 'agua\\b', 'telefon', 'internet', 'combustiv',
    'manutenc', 'seguro', 'plano\\b', 'salario', 'ferias', 'decimo', 'rescis', 'inss', 'fgts', 'irrf', 'iss\\b',
    'icms', 'pis\\b', 'cofins', 'simples', 'das\\b', 'darf', 'diferenca', 'multa', 'juros', 'taxa', 'tarifa',
    'desconto', 'adiantamento', 'emprestimo', 'repasse', 'reembolso', 'devoluc', 'compra', 'venda', 'pagamento',
    'recebimento', 'transferencia', 'deposito', 'saque', 'cartao', 'cartoes', 'boleto', 'pix\\b', 'ted\\b',
    'conforme', 'cfe\\b', 'valor\\b', 'saldo', 'total', 'lancamento', 'estorno', 'baixa', 'provisao',
    'apropriacao', 'integralizacao', 'capital', 'socio', 'retirada', 'prolabore', 'pro labore', 'quotas',
  ].join('|') + ')', 'i');
  function pareceNome(pedaco) {
    const x = String(pedaco || '').trim();
    if (x.length < 4 || x.length > 90) return false;
    const empresa = FIM_DE_EMPRESA.test(x);
    // Número no meio só passa em nome de empresa ("POSTO 3 IRMÃOS LTDA"); "08/2026 col.:9" não é nome.
    if (/\d/.test(x) && !empresa) return false;
    if (!/^[A-Za-zÀ-Ãà-ú0-9&.,'ºª\/ -]+$/.test(x)) return false;
    const palavras = x.split(/\s+/).filter(Boolean);
    if (palavras.length < 1 || palavras.length > 9) return false;
    // Terminando em razão social, é nome mesmo começando por uma palavra que também serve de descrição
    // ("SEGUROS FICTÍCIA LTDA"); sem razão social, a descrição do que foi pago não vale como nome.
    if (empresa) return true;
    if (E_DESCRICAO.test(Util.semAcento(x))) return false;
    // Sem sufixo de empresa: ou está todo em maiúsculas, ou as palavras grandes começam com maiúscula.
    const grandes = palavras.filter((p) => p.length >= 3);
    if (!grandes.length) return false;
    const maiusculo = x === x.toUpperCase();
    const proprias = grandes.filter((p) => /^[A-ZÀ-Ã]/.test(p));
    return maiusculo || proprias.length === grandes.length;
  }
  function nomePorPartes(historico) {
    const partes = String(historico || '').split(/\s+[-–]\s+/).map((x) => x.trim()).filter(Boolean);
    if (partes.length < 2) return '';
    const candidatos = partes.slice(1);
    const empresa = candidatos.find((x) => FIM_DE_EMPRESA.test(x) && pareceNome(x));
    if (empresa) return empresa;
    return candidatos.find(pareceNome) || '';
  }

  // O histórico SEM TRAÇO que acaba em razão social: "Adiantamento a fornecedor GAMA FICTÍCIA LTDA", "Compensação
  // de adiantamento GAMA FICTÍCIA LTDA". Volta do fim juntando as palavras próprias e para na primeira que é do
  // lançamento, não do nome (pagamento, fornecedor, ref, nota…). Só vale terminando em LTDA/ME/EIRELI/S.A. e com
  // duas palavras ou mais, senão sobraria meia razão social.
  const PALAVRA_DO_LANCAMENTO = new Set(('pagamento pagto pgto recebimento adiantamento compensacao reclassificacao estorno ' +
    'baixa provisao apropriacao fornecedor fornecedores cliente clientes ref referente nf nfe nfs nota duplicata boleto ' +
    'titulo parcela parc valor saldo total transferencia deposito pix ted doc conforme cfe aquisicao').split(' '));
  function nomeNoFim(historico) {
    const h = String(historico || '').replace(/\s+/g, ' ').trim();
    if (!FIM_DE_EMPRESA.test(h)) return '';
    const palavras = h.split(' ');
    let i = palavras.length;
    while (i > 0) {
      const p = palavras[i - 1];
      if (!/^[A-ZÀ-Ã][A-Za-zÀ-Ãà-ú0-9&.,'\/-]*$/.test(p)) break;
      if (PALAVRA_DO_LANCAMENTO.has(Util.semAcento(p).toLowerCase().replace(/[^a-z]/g, ''))) break;
      i--;
    }
    const nome = palavras.slice(i).join(' ');
    return i < palavras.length && palavras.length - i >= 2 && pareceNome(nome) ? nome : '';
  }
  // O leitor do razão primeiro; sem nome, as formas do diário.
  // Prefixo que só diz o que o lançamento é, antes do histórico de verdade: "Reclassificação - Serviços
  // tomados ref. NF nº 400 - OMEGA MONTAGENS LTDA" é a mesma nota da OMEGA (Dony, 23/09/2026: o programa tem
  // que enxergar que a nota foi reclassificada naquela conta).
  const PREFIXO_DE_AJUSTE = /^\s*(reclassifica[çc][ãa]o|reclass\.?|estorno|ajuste|transfer[êe]ncia de saldo|revers[ãa]o|baixa de provis[ãa]o|apropria[çc][ãa]o)\s*(de\s+)?[-:–]?\s*/i;

  // O nome lido é só a descrição do que foi pago ("REFERENTE A TAXA DE INCLUSÃO", "PLANO DE SAÚDE")? Então não é
  // fornecedor: melhor ficar sem nome do que inventar um fornecedor que não existe (Dony, 23/09/2026).
  const soDescricao = (nome) => !FIM_DE_EMPRESA.test(nome) && E_DESCRICAO.test(Util.semAcento(String(nome || '')));

  function lerHistorico(historico) {
    const lido = LerRazao.lancamentoH(historico);
    if (lido.fornecedor && !soDescricao(lido.fornecedor)) return lido;
    const d = nomeDoHistorico(historico);
    if (d.fornecedor) return { nota: lido.nota || d.nota, fornecedor: d.fornecedor };
    // Sem nome ainda: tira o prefixo do ajuste e lê de novo o que sobrou.
    const semPrefixo = String(historico || '').replace(PREFIXO_DE_AJUSTE, '');
    if (semPrefixo && semPrefixo !== historico) {
      const outra = LerRazao.lancamentoH(semPrefixo);
      if (outra.fornecedor && !soDescricao(outra.fornecedor)) return { nota: lido.nota || outra.nota, fornecedor: outra.fornecedor };
      const d2 = nomeDoHistorico(semPrefixo);
      if (d2.fornecedor) return { nota: lido.nota || d2.nota, fornecedor: d2.fornecedor };
    }
    return lido.fornecedor ? { nota: lido.nota, fornecedor: '' } : lido;
  }

  // ------------------------------------------------------------------
  // O RAZÃO DE UMA CONTA tirado do diário, no desenho do razão que os passos usam.
  // op: { de (competência do começo; sem ela, o começo do diário), ate (competência do fim) }
  // ------------------------------------------------------------------
  function razaoDaConta(diarioCru, balancetes, reduzido, op) {
    const opc = op || {};
    const plano = planoDosBalancetes(balancetes);
    const info = plano.achar(reduzido) || { reduzido: String(reduzido), conta: '', titulo: '' };
    // A conta pela chave do plano e o diário com os códigos traduzidos: os dois falam a mesma língua.
    const red = String(info.reduzido || reduzido);
    const diario = traduzido(diarioCru, plano);
    const mov = movimentos(diario);
    const comps = (diario.meses || []).map((m) => m.comp);
    const inicio = opc.de && opc.de > comps[0] ? opc.de : comps[0];
    const fim = opc.ate && opc.ate < comps[comps.length - 1] ? opc.ate : comps[comps.length - 1];
    const avisos = [];
    const sc = saldoNoComeco(diario, balancetes, red, mov);
    let saldoAnterior = sc.valor;
    if (saldoAnterior === null) { avisos.push('Sem balancete do período do diário: o saldo inicial da conta não é conhecido (ficou zero). Carregue o balancete de ' + Util.nomeCompetencia(comps[0]) + '.'); saldoAnterior = 0; }
    // O que o diário movimentou antes do começo do período escolhido entra no saldo anterior.
    const mv = mov.get(red);
    if (mv) mv.porMes.forEach((x, c) => { if (c < inicio) saldoAnterior += x.d - x.c; });
    // As partidas da conta no período, com a contrapartida (no lançamento de várias linhas, a conta do outro lado quando é
    // uma só).
    const porGrupo = guardado(diario, 'porGrupo', () => {
      const g = new Map();
      (diario.lancamentos || []).forEach((l) => { if (!g.has(l.grupo)) g.set(l.grupo, []); g.get(l.grupo).push(l); });
      return g;
    });
    const lancamentos = [];
    let saldo = saldoAnterior, totalDebito = 0, totalCredito = 0;
    (diario.lancamentos || []).forEach((l) => {
      const comp = compDe(l);
      if (comp < inicio || comp > fim) return;
      const lados = [];
      if (l.debito === red) lados.push('D');
      if (l.credito === red) lados.push('C');
      lados.forEach((lado) => {
        let contra = lado === 'D' ? l.credito : l.debito;
        let contras = contra ? [contra] : [];
        if (!contra) {
          contras = Array.from(new Set((porGrupo.get(l.grupo) || []).map((x) => (lado === 'D' ? x.credito : x.debito)).filter((c) => c && c !== red)));
          contra = contras.length === 1 ? contras[0] : '';
        }
        const debito = lado === 'D' ? l.valor : 0, credito = lado === 'C' ? l.valor : 0;
        saldo += debito - credito;
        totalDebito += debito; totalCredito += credito;
        const lido = lerHistorico(l.historico);
        const cnpj = LerRazao.cnpjDoTextoH(l.historico);
        const x = { data: l.data, dia: l.dia, mes: l.mes, ano: l.ano, numero: String(l.grupo), historico: l.historico, contrapartida: contra, contrapartidas: contras,
          documento: '', participante: '', debito, credito, saldo, fornecedor: lido.fornecedor || '', linhaDoDiario: l.linha };
        if (lido.nota) x.nota = lido.nota;
        if (cnpj) x.cnpj = cnpj;
        if (x.fornecedor || cnpj) x.fornecedorDeclarado = cnpj ? { nome: x.fornecedor, cnpj } : { nome: x.fornecedor };
        lancamentos.push(x);
      });
    });
    // O saldo do fim conferido com o balancete do último mês (quando ele está carregado).
    const bFim = (balancetes || []).find((b) => String(b.competencia).slice(0, 10) === fim);
    const linhaFim = contaNoBalancete(bFim, red);
    const saldoFinalDeclarado = bFim ? (linhaFim ? linhaFim.saldoAtual : 0) : null;
    const confere = saldoFinalDeclarado === null ? null : saldoFinalDeclarado === saldo;
    if (confere === false) avisos.push('O saldo do fim pelo diário (' + Util.formatarCentavos(saldo) + ') não é o do balancete de ' + Util.nomeCompetencia(fim) + ' (' + Util.formatarCentavos(saldoFinalDeclarado) + ').');
    const conta = { codigo: red, classificacao: info.conta || '', nome: info.titulo || ('Conta ' + red), saldoAnterior, lancamentos, totalDebito, totalCredito,
      saldoFinal: saldo, saldoFinalDeclarado, confere: confere !== false, avisos };
    return { conta, periodo: { de: '01/' + inicio.slice(5, 7) + '/' + inicio.slice(0, 4), ate: Util.fimDaCompetencia(fim).texto }, inicio, fim, origemSaldo: sc.origem, confereComBalancete: confere };
  }

  // ------------------------------------------------------------------
  // As contas que as conciliações usam, pelo nome e pela classificação, no plano dos balancetes (só as analíticas do
  // balanço: fornecedores e adiantamento de clientes no passivo; adiantamento a fornecedores, clientes e bancos no ativo).
  // ------------------------------------------------------------------
  function contasDasConciliacoes(plano) {
    const lista = [];
    (plano instanceof Map ? plano : planoDosBalancetes(plano)).forEach((c) => {
      if (!c.analitica) return;
      const p = Familias.papelDaConta({ nome: c.titulo, classificacao: c.conta });
      if (!p.familia) return;
      const k = classe(c.conta);
      const noPassivo = (p.familia === 'fornecedores' && p.papel === 'principal') || (p.familia === 'clientes' && p.papel === 'adiantamento');
      if (noPassivo ? k !== '2' : k !== '1') return;
      lista.push({ reduzido: c.reduzido, conta: c.conta, titulo: c.titulo, familia: p.familia, papel: p.papel });
    });
    return lista.sort((a, b) => String(a.conta).localeCompare(String(b.conta)));
  }

  // ------------------------------------------------------------------
  // SALDOS DE TODAS AS CONTAS pelo diário: saldo no começo (do balancete), débitos, créditos e saldo no fim, conferido
  // com o balancete do último mês do diário quando ele está carregado.
  // ------------------------------------------------------------------
  function saldosDasContas(diarioCru, balancetes) {
    const plano = planoDosBalancetes(balancetes);
    const diario = traduzido(diarioCru, plano);
    const mov = movimentos(diario);
    const comps = (diario.meses || []).map((m) => m.comp);
    const fim = comps[comps.length - 1];
    const bFim = (balancetes || []).find((b) => String(b.competencia).slice(0, 10) === fim);
    // O balancete do fim por reduzido E por classificação (com e sem os pontos): a conta do diário pode vir
    // escrita de outro jeito.
    const noFim = new Map();
    (bFim ? bFim.contas || [] : []).forEach((c) => {
      const red = String(c.reduzido || '').trim();
      if (red) noFim.set(red, c);
      const cls = String(c.conta || '').trim();
      if (cls && !noFim.has(cls)) noFim.set(cls, c);
      const dig = cls.replace(/D+/g, '');
      if (dig && !noFim.has(dig)) noFim.set(dig, c);
    });
    const codigos = new Set(Array.from(plano.values()).filter((c) => c.analitica).map((c) => c.reduzido));
    mov.forEach((x, red) => codigos.add(red));
    const lista = Array.from(codigos).map((red) => {
      const info = plano.achar(red) || null;
      const x = mov.get(red) || { d: 0, c: 0, n: 0 };
      const sc = saldoNoComeco(diario, balancetes, red, mov);
      const saldoFinal = sc.valor === null ? null : sc.valor + x.d - x.c;
      const lb = noFim.get(red) || noFim.get(String(red).replace(/D+/g, ''));
      const saldoBalancete = bFim ? (lb ? lb.saldoAtual : 0) : null;
      return { reduzido: red, conta: info ? info.conta : '', titulo: info ? info.titulo : '', noPlano: !!info, lancamentos: x.n, saldoInicial: sc.valor, debitos: x.d, creditos: x.c,
        saldoFinal, saldoBalancete, confere: saldoBalancete === null || saldoFinal === null ? null : saldoFinal === saldoBalancete };
    });
    lista.sort((a, b) => (a.conta && b.conta ? String(a.conta).localeCompare(String(b.conta)) : a.conta ? -1 : b.conta ? 1 : Number(a.reduzido) - Number(b.reduzido)));
    const conferidas = lista.filter((c) => c.confere !== null);
    return { contas: lista, fim, temBalanceteDoFim: !!bFim, conferidas: conferidas.length, batem: conferidas.filter((c) => c.confere).length,
      naoBatem: conferidas.filter((c) => !c.confere), semPlano: lista.filter((c) => !c.noPlano).length };
  }

  // O diário do jeito que fica guardado (sem o número de ordem, que é a posição na lista).
  function paraGuardar(d) {
    return { tipo: 'diario', empresa: d.empresa, cnpj: d.cnpj, nomeArquivo: d.nomeArquivo, periodo: d.periodo, meses: d.meses,
      lancamentos: (d.lancamentos || []).map((l) => ({ linha: l.linha, data: l.data, dia: l.dia, mes: l.mes, ano: l.ano, historico: l.historico, debito: l.debito, credito: l.credito, valor: l.valor, grupo: l.grupo })),
      grupos: d.grupos, contas: d.contas, lancamentosDeVarias: d.lancamentosDeVarias, totalDebitos: d.totalDebitos, totalCreditos: d.totalCreditos,
      confere: d.confere, avisos: d.avisos || [], linhasIgnoradas: d.linhasIgnoradas };
  }

  // Versão nova do diário × a anterior: os lançamentos que entraram e os que saíram (mesma data, histórico, contas e
  // valor), no desenho da comparação de razão (para a mesma janela de "ver o que mudou").
  function compararDiarios(antes, depois) {
    const linhas = (d) => {
      const vezes = new Map();
      return ((d && d.lancamentos) || []).map((l) => {
        const base = [l.data, String(l.historico || '').slice(0, 120), l.debito || '', l.credito || '', l.valor].join('|');
        const n = vezes.get(base) || 0;
        vezes.set(base, n + 1);
        return { chave: base + '|' + n, data: l.data, doc: (l.debito ? 'D ' + l.debito : '') + (l.debito && l.credito ? ' · ' : '') + (l.credito ? 'C ' + l.credito : ''),
          historico: l.historico || '', nome: '', valor: l.valor, debito: l.debito ? l.valor : 0, credito: l.credito ? l.valor : 0 };
      });
    };
    const la = linhas(antes), ld = linhas(depois);
    const ca = new Set(la.map((x) => x.chave)), cd = new Set(ld.map((x) => x.chave));
    const sairam = la.filter((x) => !cd.has(x.chave)), entraram = ld.filter((x) => !ca.has(x.chave));
    const soma = (xs, k) => xs.reduce((s, x) => s + x[k], 0);
    return { tipo: 'razao', iguais: la.length - sairam.length, entraram, sairam, mudaram: [], qtdAntes: la.length, qtdDepois: ld.length,
      antes: { debitos: soma(la, 'debito'), creditos: soma(la, 'credito') }, depois: { debitos: soma(ld, 'debito'), creditos: soma(ld, 'credito') } };
  }

  // O razão em CSV (o "arquivo" guardado com o razão tirado do diário, para baixar e conferir fora).
  function csvDoRazao(r) {
    const c = r.conta;
    const v = (x) => Util.formatarCentavos(x || 0);
    const q = (s) => '"' + String(s || '').replace(/"/g, '""') + '"';
    const linhas = ['Razão tirado do diário;' + q(c.codigo + ' - ' + c.classificacao + ' - ' + c.nome) + ';' + r.periodo.de + ' a ' + r.periodo.ate,
      'Data;Lançamento;Histórico;Contrapartida;Débito;Crédito;Saldo', ';;Saldo anterior;;;;' + v(c.saldoAnterior)];
    c.lancamentos.forEach((l) => linhas.push([l.data, l.numero, q(l.historico), l.contrapartida || (l.contrapartidas || []).join(' '), l.debito ? v(l.debito) : '', l.credito ? v(l.credito) : '', v(l.saldo)].join(';')));
    linhas.push(';;Total;;' + v(c.totalDebito) + ';' + v(c.totalCredito) + ';' + v(c.saldoFinal));
    return linhas.join('\r\n');
  }

  return { planoDosBalancetes, movimentos, conferir, saldoNoComeco, razaoDaConta, contasDasConciliacoes, saldosDasContas, paraGuardar, compararDiarios, csvDoRazao, nomeDoHistorico, lerHistorico };
});
