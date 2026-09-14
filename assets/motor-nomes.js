/*
 * Conciliador Solutta — motor-nomes.js
 * A régua do fornecedor (Parte 6): diz de quem é cada linha do razão.
 * Uma régua só para todos os passos (duas réguas dariam donos diferentes em telas
 * diferentes). Motor puro: recebe linhas, devolve donos. Não mexe em tela nem em
 * armazenamento.
 *
 * Ordem de quem manda (6.1):
 *  1. dono dado à mão (pela digital da linha)
 *  2. fornecedor declarado (saldo de abertura)
 *  3. CNPJ no histórico, pela raiz (chave = CNPJ da matriz calculado)
 *  4. semelhança de nome com os fornecedores que têm CNPJ
 *  5. semelhança entre os que não têm CNPJ (nota >= 0,75 junta)
 *  6. linha sem nome que anula a de UM fornecedor (mesma conta, dia, valor, lado oposto)
 *  7. "sem fornecedor", que aparece como tal e nunca some
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.MotorNomes = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const SEM_FORNECEDOR = 'sem-fornecedor';

  // ------------------------------------------------------------------
  // 6.4 Palavras que contam e palavras que não contam
  // ------------------------------------------------------------------
  const GENERICAS = new Set(('LTDA LIMITADA ME EPP EIRELI SA S A DE DA DO DOS DAS E COM COMERCIO COMERCIAL DIST ' +
    'DISTRIBUIDORA DISTRIB IND INDUSTRIA INDL PROD PRODUTOS ALIMENTICIOS ALIMENTOS CIA IMP IMPORTADORA ' +
    'EXPORTADORA C P I REF NF CONTA DER DERIVADOS SERVICOS SERVICO PAGAMENTO PAGAMENTOS TRANSF TRANSFERENCIA ' +
    'INSTITUICAO FORNECEDOR FORNECEDORES').split(' '));
  const GENERICAS_LONGAS = Array.from(GENERICAS).filter((g) => g.length >= 4);
  // Genéricas só quando a palavra é EXATAMENTE esta (PARAIBA continua sendo nome).
  const SO_INTEIRAS = new Set(('PARA POR PELO PELA VALOR REFERENTE CONFORME VENDA VENDAS RECEBIMENTO RECEBIMENTOS ' +
    'RECEBIDO RECEBIDA ADIANTAMENTO ADIANTAMENTOS FATURAMENTO DUPLICATA DUPLICATAS CLIENTE CLIENTES ' +
    'MENSALIDADE MENSALIDADES').split(' '));

  const cacheGenerica = new Map();
  function ehGenerica(palavra) {
    if (cacheGenerica.has(palavra)) return cacheGenerica.get(palavra);
    let r = GENERICAS.has(palavra) || SO_INTEIRAS.has(palavra);
    // Pedaço de genérica também é genérico (COMERCI, DISTR, DISTRIBUIDOR, PRODUTO),
    // quando a genérica tem 4 letras ou mais.
    if (!r && palavra.length >= 3) r = GENERICAS_LONGAS.some((g) => g.length > palavra.length && g.startsWith(palavra));
    cacheGenerica.set(palavra, r);
    return r;
  }

  // Palavras próprias = mais de 2 letras, não só número, e não genéricas.
  function palavrasProprias(nomeNormalizado) {
    if (!nomeNormalizado) return [];
    return nomeNormalizado.split(' ').filter((p) => p.length > 2 && !/^[0-9]+$/.test(p) && !ehGenerica(p));
  }

  // ------------------------------------------------------------------
  // 6.3 Limpar o nome
  // ------------------------------------------------------------------
  // Meios de pagamento que separam pedaços do histórico (a ordem importa: o mais longo primeiro).
  const MEIOS = [
    'PAGAMENTO DE BOLETO OUTROS BANCOS', 'PAGAMENTOS PIX QR CODE', 'PAGAMENTOS CONCESSIONARIA', 'PAGAMENTOS TRIB',
    'PIX QR CODE', 'TRANSFERENCIA ENVIADA', 'BOLETO PAGO', 'PIX ENVIADO PARA', 'PIX ENVIADO', 'DEBITO AUT',
    'TED ENVIADA', 'DOC ENVIADO',
  ];

  // Ruído retirado antes de normalizar (sobre o texto sem acento, em maiúsculas).
  const RUIDOS = [
    /^RECLASS\.?\s*/,
    /PAGAMENTO\s+(NAO\s+)?CONCILIADO\s+(COM|NO)\s+(O\s+)?SISTEMA\s+INTERNO\s*-?\s*/g,
    /-?\s*\d+\s+BAIXAS\b.*$/,
    /VALOR\s+REFERENTE\s*/g,
    /VLR\.?\s*REF\.?\s*/g,
  ];

  // CNPJ e CPF formatados ou picados, e sequências de 11 a 14 dígitos.
  const RE_DOCUMENTOS = [
    /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
    /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
    /\d{2}\.\d{3}\.\d{3}(?!\d)/g,
    /(^|\s)\d{2,3}\s\d{3}\s\d{3}(?=\s|$)/g,
    /\d{11,14}/g,
  ];

  // Tirar a repetição: o extrato escreve o nome cortado em ~12 caracteres e depois
  // inteiro. Tira palavra repetida e palavra que é o começo de outra mais longa do
  // mesmo nome: ALFA ALIMEN ALFA ALIMENTOS -> ALFA ALIMENTOS.
  function tirarRepeticao(palavras) {
    const saida = [];
    for (let i = 0; i < palavras.length; i++) {
      const p = palavras[i];
      if (saida.indexOf(p) >= 0) continue;
      const pedaco = p.length >= 2 && palavras.some((q, j) => j !== i && q.length > p.length && q.startsWith(p));
      if (pedaco) continue;
      saida.push(p);
    }
    return saida;
  }

  function limparNome(texto) {
    if (!texto) return '';
    let s = Util.semAcento(texto).toUpperCase();
    for (const re of RE_DOCUMENTOS) s = s.replace(re, ' ');
    for (const re of RUIDOS) s = s.replace(re, ' ');
    for (const meio of MEIOS) s = s.split(meio).join(' ');
    s = Util.normalizarNome(s);
    const palavras = tirarRepeticao(s.split(' ').filter(Boolean));
    return palavras.join(' ');
  }

  // ------------------------------------------------------------------
  // CNPJ no histórico (6.1.3): só com dígito verificador válido.
  // ------------------------------------------------------------------
  function cnpjsDoTexto(texto) {
    const achados = [];
    const s = String(texto || '');
    const formatados = s.match(/[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}/g) || [];
    for (const f of formatados) if (Util.cnpjValido(f)) achados.push(Util.limparCnpj(f));
    const soltos = s.match(/(^|[^0-9])(\d{14})(?![0-9])/g) || [];
    for (const t of soltos) {
      const d = t.replace(/[^0-9]/g, '');
      if (Util.cnpjValido(d) && achados.indexOf(d) < 0) achados.push(d);
    }
    return achados;
  }

  // ------------------------------------------------------------------
  // 6.2 Ler o histórico: uma LISTA de regras.
  // Acrescentar um padrão novo = acrescentar UMA linha na lista, sem mexer no motor.
  // Cada regra: { id, lado: 'D' | 'C' | '*', nome, re, tipo, pega }
  //   re   : testada no histórico sem acento e em maiúsculas;
  //   tipo : nota | pagamento | imposto | saldo | ajuste | sem-nome;
  //   pega : como tirar o nome dos grupos capturados:
  //          'nome'            -> grupo "nome" inteiro
  //          'primeiro-pedaco' -> só até o primeiro " - "
  //          'depois-do-meio'  -> o que vem DEPOIS do meio de pagamento (armadilha da sobra, 6.3)
  //          'dois-lados'      -> antes e depois do meio de pagamento (VALOR REFERENTE)
  //          'ate-o-valor'     -> depois do meio, cortando tudo depois do valor (EXTRATO BANCO)
  //          'reler'           -> aplica a lista de novo no resto (Reclass. <outro histórico>)
  // Formatos vistos nos razões reais usados como modelo (set/2026) e no roteiro.
  // ------------------------------------------------------------------
  const REGRAS = [
    { id: 'ajuste-do-programa', lado: '*', tipo: 'ajuste', nome: 'Ajuste gerado pelo próprio Conciliador',
      re: /^(?:RECLASSIFICACAO (?:PARA )?ADIANTAMENTO(?: DE CLIENTE)?|COMPENSACAO ADIANTAMENTO DE CLIENTE) - (?<nome>.+?)(?: - CNPJ (?<cnpj>[0-9A-Z./-]+))? - DE .+ PARA .+$/, pega: 'nome' },
    { id: 'saldo-inicial', lado: 'C', tipo: 'saldo', nome: 'SALDO INICIAL dd/mm/aaaa - NOME',
      re: /^SALDO INICIAL \d{2}\/\d{2}\/\d{4} - (?<nome>.+)$/, pega: 'nome' },
    { id: 'reclass-pagamento-sistema', lado: '*', tipo: 'pagamento', nome: 'Reclass. Pagamento (não) conciliado com o sistema interno',
      re: /^RECLASS\.?\s*PAGAMENTO (?:NAO )?CONCILIADO (?:COM|NO) (?:O )?SISTEMA INTERNO\s*-\s*(?<resto>.+)$/, pega: 'depois-do-meio' },
    { id: 'reclass', lado: '*', tipo: 'pagamento', nome: 'Reclass. <outro histórico>',
      re: /^RECLASS\.?\s*(?<resto>.+)$/, pega: 'reler' },
    { id: 'pagamento-sistema', lado: 'D', tipo: 'pagamento', nome: 'Pagamento (não) conciliado com o sistema interno - ...',
      re: /^PAGAMENTO (?:NAO )?CONCILIADO (?:COM|NO) (?:O )?SISTEMA INTERNO\s*-\s*(?<resto>.+)$/, pega: 'depois-do-meio' },
    { id: 'aquisicao-nota-fiscal', lado: 'C', tipo: 'nota', nome: 'AQUISICAO CONFORME NOTA FISCAL 123 - NOME',
      re: /^AQUISICAO CONFORME NOTA FISCAL (?<nota>\d+)\s*-\s*(?<nome>.+)$/, pega: 'nome' },
    { id: 'aquisicao-nf', lado: 'C', tipo: 'nota', nome: 'AQUISICAO NF 123 - NOME - complemento - CFOP',
      re: /^AQUISICAO NF (?:N[O°º]?\s*)?(?<nota>\d+)\s*-\s*(?<nome>.+)$/, pega: 'primeiro-pedaco' },
    { id: 'servicos-tomados', lado: 'C', tipo: 'nota', nome: 'SERVICOS TOMADOS ref. NF 123 - NOME',
      re: /^SERVICOS TOMADOS REF\.? NF (?:N[O°º]?\s*)?(?<nota>\d+)\s*-\s*(?<nome>.+)$/, pega: 'nome' },
    { id: 'simples-faturamento', lado: 'C', tipo: 'nota', nome: 'SIMPLES FATURAMENTO CONFORME NOTA FISCAL 123 - NOME',
      re: /^SIMPLES FATURAMENTO CONFORME NOTA FISCAL (?<nota>\d+)\s*-\s*(?<nome>.+)$/, pega: 'nome' },
    { id: 'devolucao-nota', lado: 'D', tipo: 'nota', nome: 'DEVOLUCAO CONFORME NOTA FISCAL 123 - NOME',
      re: /^DEVOLUCAO CONFORME NOTA FISCAL (?<nota>\d+)\s*-\s*(?<nome>.+)$/, pega: 'nome' },
    // Imposto retido: no começo do histórico (ou logo depois de VALOR REFERENTE), ou "<imposto> RETIDO" em qualquer lugar.
    { id: 'imposto-retido', lado: '*', tipo: 'imposto', nome: 'Imposto retido (ISS, IRRF, INSS, PIS, COFINS, CSLL)',
      re: /^(?:(?:VALOR REFERENTE|VLR\.? ?REF\.?)\s*)?(?:ISS|IRRF|INSS|PIS|COFINS|CSLL|CSRF|PCC)(?:[^A-Z]|$)|(?:^|[^A-Z])(?:ISS|IRRF|INSS|PIS|COFINS|CSLL|CSRF) RETID[OA]/, pega: 'nenhum' },
    { id: 'pagamento-fornecedor-extrato', lado: 'D', tipo: 'pagamento', nome: 'PAGAMENTO DE FORNECEDOR - EXTRATO BANCO - BOLETO PAGO NOME CNPJ -150,00',
      re: /^PAGAMENTO DE FORNECEDOR - EXTRATO [^-]+ - (?<resto>.+)$/, pega: 'ate-o-valor' },
    { id: 'pagamento-fornecedor-nf', lado: 'D', tipo: 'pagamento', nome: 'PAGAMENTO DE FORNECEDOR - NOME - NF: CNPJ NOTA',
      re: /^PAGAMENTO DE FORNECEDOR - (?<nome>.+?) - NF:\s*(?<cnpj>\d{14})?\s*(?<nota>\d+)?.*$/, pega: 'nome' },
    { id: 'pagamento-fornecedor', lado: 'D', tipo: 'pagamento', nome: 'PAGAMENTO DE FORNECEDOR - NOME - descrição',
      re: /^PAGAMENTO DE FORNECEDOR - (?<nome>.+)$/, pega: 'primeiro-pedaco' },
    { id: 'valor-referente-cheque', lado: 'D', tipo: 'sem-nome', nome: 'VALOR REFERENTE CH COMPENSADO (cheque)',
      re: /^(?:VALOR REFERENTE|VLR\.? ?REF\.?)\s*CH(?:EQUE)? COMPENSADO/, pega: 'nenhum' },
    { id: 'valor-referente', lado: 'D', tipo: 'pagamento', nome: 'VALOR REFERENTE ... BOLETO PAGO / PIX ENVIADO ... CNPJ',
      re: /^(?:VALOR REFERENTE|VLR\.? ?REF\.?)\s*(?<resto>.+)$/, pega: 'dois-lados' },
    { id: 'pix-enviado', lado: 'D', tipo: 'pagamento', nome: 'PIX ENVIADO (PARA) NOME',
      re: /^PIX ENVIADO (?:PARA )?(?<nome>.+)$/, pega: 'nome' },
    { id: 'debito-automatico', lado: 'D', tipo: 'pagamento', nome: 'DEBITO AUT NOME',
      re: /^DEBITO AUT\.?\s*(?<nome>.+)$/, pega: 'nome' },
    { id: 'retirada-socio', lado: '*', tipo: 'sem-nome', nome: 'RETIRADA DE SOCIO - ...',
      re: /^RETIRADAS? DE SOCIOS? - (?<nome>.+)$/, pega: 'primeiro-pedaco' },
    { id: 'categoria-verificar', lado: '*', tipo: 'pagamento', nome: 'CATEGORIA - VERIFICAR/AGUARDAR - NOME - descrição',
      re: /^[^-]+ - (?:VERIFICAR|AGUARDAR)[^-]* - (?<nome>.+)$/, pega: 'primeiro-pedaco-sem-meio' },
    { id: 'nota-ano-anterior', lado: 'C', tipo: 'nota', nome: '123456  NOME (número, dois espaços, nome)',
      re: /^(?<nota>\d{3,})\s{2,}(?<nome>\S.+)$/, pega: 'nome' },
  ];

  function acharMeio(texto) {
    let melhor = null;
    for (const meio of MEIOS) {
      const i = texto.indexOf(meio);
      if (i >= 0 && (melhor === null || i < melhor.inicio || (i === melhor.inicio && meio.length > melhor.meio.length))) {
        melhor = { inicio: i, fim: i + meio.length, meio };
      }
    }
    return melhor;
  }

  function primeiroPedaco(texto) {
    const i = texto.indexOf(' - ');
    return i >= 0 ? texto.slice(0, i) : texto;
  }

  // Lê um histórico e devolve o que dá para saber dele.
  function lerHistorico(historico, ladoDC) {
    const original = String(historico || '');
    const texto = Util.semAcento(original).toUpperCase().replace(/[ºª°]/g, 'O').replace(/QR-CODE/g, 'QR CODE').trim();
    const resultado = { regra: null, tipo: null, nomeBruto: '', nome: '', cnpjs: cnpjsDoTexto(texto), nota: null, sobra: null, reclass: /^RECLASS/.test(texto) };
    let alvo = texto;
    // Primeiro respeitando o lado da regra; se nada servir, tenta sem o lado (nota
    // lançada a débito no adiantamento, por exemplo: é uma reclassificação sem "Reclass.").
    let respeitarLado = true;
    for (let volta = 0; volta < 4; volta++) {
      let achou = false;
      for (const regra of REGRAS) {
        if (respeitarLado && regra.lado !== '*' && regra.lado !== ladoDC && !resultado.reclass) continue;
        const m = alvo.match(regra.re);
        if (!m) continue;
        const g = m.groups || {};
        if (regra.pega === 'reler') {
          resultado.regra = resultado.regra || regra.id;
          alvo = (g.resto || '').trim();
          achou = true;
          break;
        }
        resultado.regra = resultado.regra === 'reclass' ? 'reclass+' + regra.id : (resultado.regra || regra.id);
        resultado.tipo = regra.tipo;
        if (g.nota) resultado.nota = g.nota;
        if (g.cnpj && Util.cnpjValido(g.cnpj) && resultado.cnpjs.indexOf(Util.limparCnpj(g.cnpj)) < 0) resultado.cnpjs.unshift(Util.limparCnpj(g.cnpj));
        let bruto = '';
        const resto = (g.resto || g.nome || '').trim();
        switch (regra.pega) {
          case 'nome': bruto = resto; break;
          case 'primeiro-pedaco': bruto = primeiroPedaco(resto); break;
          case 'primeiro-pedaco-sem-meio': {
            let p = primeiroPedaco(resto);
            const meio = acharMeio(p);
            if (meio) p = p.slice(meio.fim);
            bruto = p.replace(/\s-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s.*)?$/, '');
            break;
          }
          case 'depois-do-meio': {
            // ARMADILHA (6.3): o pedaço ANTES do meio de pagamento é sobra da linha
            // anterior do extrato (campo de largura fixa): é nome de OUTRO fornecedor.
            const meio = acharMeio(resto);
            if (meio) {
              const antes = resto.slice(0, meio.inicio).trim();
              bruto = resto.slice(meio.fim).trim();
              if (antes) resultado.sobra = Util.normalizarNome(antes);
            } else {
              bruto = primeiroPedaco(resto);
            }
            break;
          }
          case 'dois-lados': {
            // VALOR REFERENTE: o nome está dos dois lados do meio de pagamento;
            // cortar antes perderia metade dele.
            const meio = acharMeio(resto);
            bruto = meio ? (resto.slice(0, meio.inicio) + ' ' + resto.slice(meio.fim)) : resto;
            bruto = bruto.replace(/\s-\s(?:APARENTEMENTE|VERIFICAR).*$/, '');
            break;
          }
          case 'ate-o-valor': {
            // EXTRATO BANCO: depois do valor vem o começo do fornecedor da linha seguinte.
            let p = resto;
            const meio = acharMeio(p);
            if (meio) p = p.slice(meio.fim);
            bruto = p.replace(/\s-?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s.*)?$/, '');
            break;
          }
          default: bruto = '';
        }
        resultado.nomeBruto = bruto.trim();
        resultado.nome = limparNome(bruto);
        achou = true;
        break;
      }
      if (!achou) {
        if (respeitarLado) { respeitarLado = false; continue; }
        break;
      }
      if (resultado.tipo !== null) break;
    }
    if (resultado.regra === 'reclass' && resultado.tipo === null) {
      // "Reclass." seguido de um histórico que nenhuma regra entende.
      resultado.nome = limparNome(alvo);
      resultado.tipo = 'pagamento';
    }
    return resultado;
  }

  // ------------------------------------------------------------------
  // 6.5 Semelhança de nomes: o %like% palavra a palavra
  // ------------------------------------------------------------------
  function valorDoPar(a, b) {
    if (a === b) return 1;
    const menor = a.length <= b.length ? a : b;
    const maior = a.length <= b.length ? b : a;
    if (menor.length >= 3 && maior.startsWith(menor)) return menor.length / maior.length;
    return 0;
  }

  // Compara as palavras do nome MENOR com as do MAIOR.
  // pesoRaro(palavra) = 1 / (quantos fornecedores usam a palavra, contando os pedaços).
  function comparar(palavrasA, palavrasB, pesoRaro) {
    if (!palavrasA.length || !palavrasB.length) return null;
    const menor = palavrasA.length <= palavrasB.length ? palavrasA : palavrasB;
    const maior = palavrasA.length <= palavrasB.length ? palavrasB : palavrasA;
    let batem = 0, forca = 0, rara = 0, maisRara = 0;
    for (const p of menor) {
      let melhor = 0;
      let melhorPalavra = null;
      for (const q of maior) {
        const v = valorDoPar(p, q);
        if (v > melhor) { melhor = v; melhorPalavra = q; }
      }
      if (melhor > 0) {
        batem++;
        forca += melhor;
        const peso = pesoRaro ? pesoRaro(p.length <= melhorPalavra.length ? p : melhorPalavra) : 0;
        rara += melhor * peso;
        if (peso > maisRara) maisRara = peso;
      }
    }
    const conjA = Array.from(new Set(palavrasA)).sort().join(' ');
    const conjB = Array.from(new Set(palavrasB)).sort().join(' ');
    return {
      nota: batem / menor.length,
      forca, batem, rara, maisRara,
      exato: conjA === conjB && new Set(palavrasA).size >= 2,
      // A PRIMEIRA palavra própria dos dois nomes forma par (igual ou começo da outra).
      primeiraBate: valorDoPar(palavrasA[0], palavrasB[0]) > 0,
    };
  }

  function melhorQue(a, b) {
    if (a.nota !== b.nota) return a.nota > b.nota;
    if (Math.abs(a.rara - b.rara) > 1e-9) return a.rara > b.rara;
    if (Math.abs(a.forca - b.forca) > 1e-9) return a.forca > b.forca;
    return a.batem > b.batem;
  }

  function empatados(a, b) {
    return a.nota === b.nota && Math.abs(a.rara - b.rara) <= 1e-9 && Math.abs(a.forca - b.forca) <= 1e-9 && a.batem === b.batem;
  }

  // Índice de palavras: para cada fornecedor, as palavras de todas as grafias.
  // Serve para o peso da palavra rara e para achar candidatos sem comparar com todos.
  function montarIndice(candidatos) {
    const porPrefixo = new Map();   // 3 primeiras letras -> Set(chave)
    const palavrasDe = new Map();   // chave -> Set(palavras)
    for (const c of candidatos) {
      const conj = new Set();
      for (const g of c.grafias) for (const p of g) conj.add(p);
      palavrasDe.set(c.chave, conj);
      for (const p of conj) {
        const pre = p.slice(0, 3);
        if (!porPrefixo.has(pre)) porPrefixo.set(pre, new Set());
        porPrefixo.get(pre).add(c.chave);
      }
    }
    const cachePeso = new Map();
    function pesoRaro(palavra) {
      if (cachePeso.has(palavra)) return cachePeso.get(palavra);
      const quem = porPrefixo.get(palavra.slice(0, 3));
      let usam = 0;
      if (quem) {
        for (const chave of quem) {
          for (const q of palavrasDe.get(chave)) {
            if (valorDoPar(palavra, q) > 0) { usam++; break; }
          }
        }
      }
      const peso = usam ? 1 / usam : 1;
      cachePeso.set(palavra, peso);
      return peso;
    }
    function candidatosPara(palavras) {
      const r = new Set();
      for (const p of palavras) {
        const quem = porPrefixo.get(p.slice(0, 3));
        if (quem) for (const chave of quem) r.add(chave);
      }
      return r;
    }
    return { pesoRaro, candidatosPara };
  }

  // Melhor candidato para um nome. Só aceita com nota >= minimo, sem empate e com
  // pelo menos uma palavra rara (de no máximo 2 fornecedores: maisRara >= 0,5),
  // salvo nome idêntico palavra por palavra. Empate é dúvida, e na dúvida não junta.
  //
  // REFINAMENTO MEDIDO (13/09/2026, nos razões reais usados como modelo; a confirmar com o Dony):
  // só conta como parecido o candidato cuja PRIMEIRA palavra própria forma par com a
  // primeira palavra própria do nome (o extrato corta o nome pelo FIM, nunca pelo
  // começo). Sem isso, 24 dos 275 casamentos por semelhança estavam errados — do tipo
  // "SOBRENOME", "FULANO DE SOBRENOME" e "BELTRANA SOBRENOME" irem todos para
  // "CICLANO DE SOBRENOME", ou "X Y Z TRANSPORTES" ir para "ALFA TRANSPORTES" (nomes
  // fictícios) — e nenhum casamento certo se perdeu.
  function escolher(palavras, candidatos, porChave, indice, opcoes) {
    const minimo = opcoes.minimo;
    const exigirRara = opcoes.exigirRara !== false;
    const chaves = indice.candidatosPara(palavras);
    let melhor = null, segundo = null;
    for (const chave of chaves) {
      if (opcoes.ignorar && opcoes.ignorar === chave) continue;
      const cand = porChave.get(chave);
      let doCand = null;
      for (const g of cand.grafias) {
        const r = comparar(palavras, g, indice.pesoRaro);
        if (!r || !(r.primeiraBate || r.exato)) continue;
        if (!doCand || melhorQue(r, doCand)) doCand = r;
      }
      if (!doCand || doCand.batem === 0) continue;
      doCand.chave = chave;
      if (!melhor || melhorQue(doCand, melhor)) { segundo = melhor; melhor = doCand; }
      else if (!segundo || melhorQue(doCand, segundo) || empatados(doCand, segundo)) segundo = doCand;
    }
    if (!melhor) return { aceito: null, motivo: 'nenhum parecido' };
    if (segundo && empatados(melhor, segundo)) return { aceito: null, motivo: 'empate', melhor, segundo };
    if (melhor.nota < minimo) return { aceito: null, motivo: 'nota baixa', melhor };
    if (exigirRara && !melhor.exato && melhor.maisRara < 0.5) return { aceito: null, motivo: 'sem palavra rara', melhor };
    return { aceito: melhor.chave, melhor, segundo };
  }

  // ------------------------------------------------------------------
  // Resolver os donos de todas as linhas
  // linhas: [{ digital, conta, dc: 'D'|'C', dia (número), debito, credito, historico, fornecedorDeclarado? }]
  // opcoes: { donos: { digital: { chave, nome } }, titulos: [{ nome, cnpj }] }
  // ------------------------------------------------------------------
  function resolver(linhas, opcoes) {
    const donosManuais = (opcoes && opcoes.donos) || {};
    const titulos = (opcoes && opcoes.titulos) || [];
    const porLinha = new Map();
    const fornecedores = new Map();
    const estatRegras = {};
    const naoEntendidos = [];

    function fornecedor(chave) {
      if (!fornecedores.has(chave)) {
        fornecedores.set(chave, { chave, cnpj: chave.startsWith('cnpj:') ? chave.slice(5) : '', nomeFinanceiro: '',
          nomeDeclarado: '', nomeManual: '', grafias: new Map(), linhas: 0 });
      }
      return fornecedores.get(chave);
    }
    function contarGrafia(f, nome) {
      if (!nome) return;
      f.grafias.set(nome, (f.grafias.get(nome) || 0) + 1);
    }

    // Leitura de cada histórico.
    const leituras = new Map();
    for (const l of linhas) {
      const lido = lerHistorico(l.historico, l.dc);
      leituras.set(l.digital, lido);
      const id = lido.regra || 'nenhuma';
      estatRegras[id] = (estatRegras[id] || 0) + 1;
      if (!lido.regra) naoEntendidos.push(l.historico);
    }

    // O cadastro do financeiro ensina (nome inteiro e CNPJ).
    for (const t of titulos) {
      if (!t.cnpj || !Util.cnpjValido(t.cnpj)) continue;
      const f = fornecedor('cnpj:' + Util.cnpjMatriz(t.cnpj));
      if (!f.nomeFinanceiro && t.nome) f.nomeFinanceiro = String(t.nome).trim();
    }

    const pendentes = [];
    for (const l of linhas) {
      const lido = leituras.get(l.digital);
      // 1. Dono dado à mão. A linha trocada NÃO empresta ao novo dono o nome nem o CNPJ do histórico.
      const manual = donosManuais[l.digital];
      if (manual && manual.chave) {
        const f = fornecedor(manual.chave);
        if (manual.nome && !f.nomeManual) f.nomeManual = manual.nome;
        porLinha.set(l.digital, { chave: manual.chave, origem: 'mao', lido });
        continue;
      }
      // 2. Fornecedor declarado (saldo de abertura).
      if (l.fornecedorDeclarado && (l.fornecedorDeclarado.cnpj || l.fornecedorDeclarado.nome)) {
        const d = l.fornecedorDeclarado;
        if (d.cnpj && Util.cnpjValido(d.cnpj)) {
          const f = fornecedor('cnpj:' + Util.cnpjMatriz(d.cnpj));
          if (d.nome && !f.nomeDeclarado) f.nomeDeclarado = d.nome;
          porLinha.set(l.digital, { chave: f.chave, origem: 'declarado', lido });
          continue;
        }
        pendentes.push({ l, lido, nome: limparNome(d.nome), declarado: d.nome });
        continue;
      }
      // 3. CNPJ no histórico, pela raiz.
      if (lido.cnpjs.length) {
        const f = fornecedor('cnpj:' + Util.cnpjMatriz(lido.cnpjs[0]));
        contarGrafia(f, lido.nome);
        porLinha.set(l.digital, { chave: f.chave, origem: 'cnpj', lido });
        continue;
      }
      pendentes.push({ l, lido, nome: lido.nome });
    }

    // Candidatos com CNPJ (grafias = nomes vistos com aquele CNPJ + nome do financeiro).
    function candidatosComCnpj() {
      const lista = [];
      for (const f of fornecedores.values()) {
        if (!f.chave.startsWith('cnpj:')) continue;
        const grafias = [];
        const nomes = Array.from(f.grafias.keys());
        if (f.nomeFinanceiro) nomes.push(limparNome(f.nomeFinanceiro));
        if (f.nomeDeclarado) nomes.push(limparNome(f.nomeDeclarado));
        for (const n of nomes) {
          const p = palavrasProprias(n);
          if (p.length) grafias.push(p);
        }
        if (grafias.length) lista.push({ chave: f.chave, grafias, nomesInteiros: nomes });
      }
      return lista;
    }
    const comCnpj = candidatosComCnpj();
    const porChaveCnpj = new Map(comCnpj.map((c) => [c.chave, c]));
    const indiceCnpj = montarIndice(comCnpj);
    // Nome feito só de genéricas: só liga a um CNPJ se o nome INTEIRO for igual ao de um único CNPJ.
    const nomeInteiroParaCnpj = new Map();
    for (const f of fornecedores.values()) {
      if (!f.chave.startsWith('cnpj:')) continue;
      const nomes = new Set(Array.from(f.grafias.keys()).concat(f.nomeFinanceiro ? [limparNome(f.nomeFinanceiro)] : []));
      for (const n of nomes) {
        if (!n) continue;
        if (!nomeInteiroParaCnpj.has(n)) nomeInteiroParaCnpj.set(n, new Set());
        nomeInteiroParaCnpj.get(n).add(f.chave);
      }
    }

    const semCnpj = [];
    const cacheEscolha = new Map();
    for (const p of pendentes) {
      const palavras = palavrasProprias(p.nome);
      if (!p.nome) { semCnpj.push(p); continue; }
      if (!palavras.length) {
        const quem = nomeInteiroParaCnpj.get(p.nome);
        if (quem && quem.size === 1) {
          const chave = Array.from(quem)[0];
          porLinha.set(p.l.digital, { chave, origem: 'nome-igual-cnpj', lido: p.lido });
          contarGrafia(fornecedor(chave), p.nome);
        } else {
          semCnpj.push(p);
        }
        continue;
      }
      // 4. Semelhança com os fornecedores que têm CNPJ.
      const chaveCache = palavras.join(' ');
      let escolha = cacheEscolha.get(chaveCache);
      if (!escolha) {
        escolha = escolher(palavras, comCnpj, porChaveCnpj, indiceCnpj, { minimo: 0.6 });
        cacheEscolha.set(chaveCache, escolha);
      }
      if (escolha.aceito) {
        porLinha.set(p.l.digital, { chave: escolha.aceito, origem: 'nome-parecido-cnpj', lido: p.lido, nota: escolha.melhor.nota });
        const f = fornecedor(escolha.aceito);
        contarGrafia(f, p.nome);
        if (p.declarado && !f.nomeDeclarado) f.nomeDeclarado = p.declarado;
      } else {
        p.palavras = palavras;
        semCnpj.push(p);
      }
    }

    // 5. Semelhança entre os que não têm CNPJ: nota >= 0,75 junta.
    const grupos = new Map();   // chave nome: -> { palavras, itens }
    for (const p of semCnpj) {
      if (!p.palavras || !p.palavras.length) continue;
      const chave = 'nome:' + p.palavras.join(' ');
      if (!grupos.has(chave)) grupos.set(chave, { chave, palavras: p.palavras, itens: [] });
      grupos.get(chave).itens.push(p);
    }
    const listaGrupos = Array.from(grupos.values()).sort((a, b) => b.itens.length - a.itens.length || (a.chave < b.chave ? -1 : 1));
    const candNome = listaGrupos.map((g) => ({ chave: g.chave, grafias: [g.palavras] }));
    const indiceNome = montarIndice(candNome);
    const porChaveNome = new Map(candNome.map((c) => [c.chave, c]));
    const pai = new Map();
    const raizDe = (k) => { while (pai.has(k)) k = pai.get(k); return k; };
    for (const g of listaGrupos) {
      const escolha = escolher(g.palavras, candNome, porChaveNome, indiceNome, { minimo: 0.75, exigirRara: false, ignorar: g.chave });
      if (escolha.aceito) {
        const a = raizDe(g.chave), b = raizDe(escolha.aceito);
        if (a !== b) {
          const ga = grupos.get(a), gb = grupos.get(b);
          // o grupo com mais linhas empresta a chave (só o nome da chave; o nome da tela é o mais frequente)
          if (ga.itens.length > gb.itens.length || (ga.itens.length === gb.itens.length && a < b)) pai.set(b, a); else pai.set(a, b);
        }
      }
    }
    for (const g of listaGrupos) {
      const chave = raizDe(g.chave);
      const f = fornecedor(chave);
      for (const p of g.itens) {
        porLinha.set(p.l.digital, { chave, origem: chave === g.chave ? 'nome' : 'nome-parecido', lido: p.lido });
        contarGrafia(f, p.nome);
        if (p.declarado && !f.nomeDeclarado) f.nomeDeclarado = p.declarado;
      }
    }

    // 6. Linha sem nome que anula a de UM fornecedor: mesma conta, mesmo dia, mesmo valor, lado oposto.
    const chaveAnula = (conta, dia, dc, valor) => conta + '|' + dia + '|' + dc + '|' + valor;
    const donosPorPosicao = new Map();
    for (const l of linhas) {
      const d = porLinha.get(l.digital);
      if (!d) continue;
      const valor = l.debito ? l.debito : l.credito;
      const k = chaveAnula(l.conta, l.dia, l.dc, valor);
      if (!donosPorPosicao.has(k)) donosPorPosicao.set(k, new Set());
      donosPorPosicao.get(k).add(d.chave);
    }
    for (const l of linhas) {
      if (porLinha.has(l.digital)) continue;
      const valor = l.debito ? l.debito : l.credito;
      const oposto = l.dc === 'D' ? 'C' : 'D';
      const quem = donosPorPosicao.get(chaveAnula(l.conta, l.dia, oposto, valor));
      if (quem && quem.size === 1) {
        porLinha.set(l.digital, { chave: Array.from(quem)[0], origem: 'anula', lido: leituras.get(l.digital) });
      }
    }

    // 7. Sem fornecedor.
    for (const l of linhas) {
      if (!porLinha.has(l.digital)) porLinha.set(l.digital, { chave: SEM_FORNECEDOR, origem: 'sem', lido: leituras.get(l.digital) });
    }

    // Contagem de linhas e nome da tela (6.6): financeiro -> declarado -> mais frequente -> à mão -> chave.
    for (const l of linhas) fornecedor(porLinha.get(l.digital).chave).linhas++;
    for (const f of fornecedores.values()) f.nome = nomeDaTela(f);

    // Sobra do extrato (6.3/6.7): em quantos fornecedores o mesmo pedaço aparece.
    const sobraEm = new Map();
    for (const l of linhas) {
      const d = porLinha.get(l.digital);
      if (!d.lido || !d.lido.sobra) continue;
      if (!sobraEm.has(d.lido.sobra)) sobraEm.set(d.lido.sobra, new Set());
      sobraEm.get(d.lido.sobra).add(d.chave);
    }

    const saida = new Map();
    for (const l of linhas) {
      const d = porLinha.get(l.digital);
      const f = fornecedores.get(d.chave);
      let aviso = '';
      if (d.lido && d.lido.sobra) {
        const n = sobraEm.get(d.lido.sobra).size;
        aviso = 'O pedaço "' + d.lido.sobra + '" antes do meio de pagamento é sobra da linha anterior do extrato' +
          (n > 1 ? ' (aparece em ' + n + ' fornecedores)' : '') + '; não foi usado para dizer o fornecedor.';
      }
      saida.set(l.digital, {
        chave: d.chave,
        nome: f ? f.nome : 'Sem fornecedor',
        cnpj: f && f.cnpj ? f.cnpj : '',
        origem: d.origem,
        regra: d.lido ? d.lido.regra : null,
        nomeLido: d.lido ? d.lido.nome : '',
        cnpjLido: d.lido && d.lido.cnpjs.length ? d.lido.cnpjs[0] : '',
        reclass: d.lido ? d.lido.reclass : false,
        aviso,
      });
    }

    const listaFornecedores = {};
    for (const f of fornecedores.values()) {
      if (!f.linhas && f.chave !== SEM_FORNECEDOR) continue;
      listaFornecedores[f.chave] = {
        chave: f.chave, nome: f.nome, cnpj: f.cnpj, linhas: f.linhas,
        grafias: Array.from(f.grafias.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]),
      };
    }
    return { porLinha: saida, fornecedores: listaFornecedores, regras: estatRegras, naoEntendidos };
  }

  function nomeDaTela(f) {
    if (f.chave === SEM_FORNECEDOR) return 'Sem fornecedor';
    if (f.nomeFinanceiro) return f.nomeFinanceiro;
    if (f.nomeDeclarado) return f.nomeDeclarado;
    if (f.grafias.size) {
      // o mais frequente; no empate, o mais comprido (o primeiro visto pode ser um pedaço)
      const lista = Array.from(f.grafias.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
      return lista[0][0];
    }
    if (f.nomeManual) return f.nomeManual;
    return f.chave.replace(/^(cnpj|nome):/, '');
  }

  // ------------------------------------------------------------------
  // 6.7 Trocar o dono à mão: enquanto a pessoa digita, diz se vai VINCULAR a um
  // fornecedor que existe ("igual" ou "parecido") ou criar um NOVO.
  // ------------------------------------------------------------------
  function sugerirDono(texto, fornecedores) {
    const bruto = String(texto || '').trim();
    if (!bruto) return { tipo: 'vazio', sugestoes: [] };
    const lista = Object.values(fornecedores).filter((f) => f.chave !== SEM_FORNECEDOR);
    const digitos = Util.limparCnpj(bruto);
    if (digitos.length === 14 && Util.cnpjValido(digitos)) {
      const chave = 'cnpj:' + Util.cnpjMatriz(digitos);
      const f = fornecedores[chave];
      if (f) return { tipo: 'igual', chave, nome: f.nome, motivo: 'mesmo CNPJ (pela raiz)', sugestoes: [f] };
      return { tipo: 'novo', chave, nome: bruto, motivo: 'CNPJ que ainda não aparece nos razões', sugestoes: [] };
    }
    const nome = limparNome(bruto);
    const palavras = palavrasProprias(nome);
    const iguais = lista.filter((f) => limparNome(f.nome) === nome || f.grafias.indexOf(nome) >= 0);
    if (iguais.length === 1) return { tipo: 'igual', chave: iguais[0].chave, nome: iguais[0].nome, motivo: 'mesmo nome', sugestoes: iguais };
    const candidatos = lista.map((f) => ({ chave: f.chave, grafias: [f.nome].concat(f.grafias).map((g) => palavrasProprias(limparNome(g))).filter((g) => g.length) }))
      .filter((c) => c.grafias.length);
    const porChave = new Map(candidatos.map((c) => [c.chave, c]));
    const indice = montarIndice(candidatos);
    const pontuados = [];
    if (palavras.length) {
      for (const chave of indice.candidatosPara(palavras)) {
        let melhor = null;
        for (const g of porChave.get(chave).grafias) {
          const r = comparar(palavras, g, indice.pesoRaro);
          if (r && (!melhor || melhorQue(r, melhor))) melhor = r;
        }
        if (melhor && melhor.batem) pontuados.push({ f: fornecedores[chave], r: melhor });
      }
    }
    pontuados.sort((a, b) => (melhorQue(a.r, b.r) ? -1 : melhorQue(b.r, a.r) ? 1 : 0));
    const sugestoes = pontuados.slice(0, 8).map((x) => x.f);
    if (palavras.length) {
      const escolha = escolher(palavras, candidatos, porChave, indice, { minimo: 0.6 });
      if (escolha.aceito) {
        const f = fornecedores[escolha.aceito];
        return { tipo: 'parecido', chave: f.chave, nome: f.nome, motivo: 'nome parecido', sugestoes };
      }
    }
    return { tipo: 'novo', chave: 'nome:' + (palavras.length ? palavras.join(' ') : nome), nome: bruto, motivo: 'fornecedor novo', sugestoes };
  }

  // Nome que parece MEIO DE PAGAMENTO (7.2): a inversa dele vem desmarcada, porque a
  // nota dele está no nome de outro fornecedor.
  const MEIOS_SUSPEITOS = ['CARTAO', 'BUSINESS', 'CHEQUE', 'CH COMPENSADO', 'FIDC', 'FUNDO', 'SECURITIZADORA',
    'SECURITIZACAO', 'FACTORING', 'FOMENTO', 'CARTEIRA DIGITAL', 'BOLETO', 'RELACAO DE PAGAMENTOS', 'FUNCIONARIOS',
    'BANCO', 'UNIBANCO', 'BANK', 'CONCESSIONARIA', 'SABESP', 'ENERGIA', 'ELETRICIDADE', 'AGUA E ESGOTO',
    'SANEAMENTO', 'INSTITUICAO DE PAGAMENTO', 'MERCADO PAGO', 'MERCADOPAGO', 'PAGSEGURO', 'PAGBANK', 'PICPAY',
    'NUBANK', 'NU PAGAMENTOS', 'STONE', 'CIELO', 'REDE', 'GETNET', 'ALELO', 'SODEXO', 'TICKET', 'VR BENEFICIOS',
    'ITAU', 'BRADESCO', 'SANTANDER', 'CAIXA ECONOMICA', 'SICOOB', 'SICREDI', 'BTG', 'SAFRA', 'INTER', 'C6'];

  function pareceMeioDePagamento(nome) {
    const n = ' ' + Util.normalizarNome(nome) + ' ';
    for (const m of MEIOS_SUSPEITOS) {
      if (n.indexOf(' ' + m + ' ') >= 0) return m;
    }
    return null;
  }

  return {
    SEM_FORNECEDOR, REGRAS, GENERICAS, SO_INTEIRAS, MEIOS_SUSPEITOS,
    ehGenerica, palavrasProprias, limparNome, tirarRepeticao, cnpjsDoTexto, lerHistorico,
    comparar, resolver, sugerirDono, pareceMeioDePagamento,
  };
});
