/*
 * Conciliador Solutta — ler-plano.js
 * O PLANO DE CONTAS da empresa: código e nome, só isso (Dony, 25/09/2026, a Zelco: "o balancete saiu com os
 * nomes tudo cortado; quero salvar o plano de contas dessa empresa para, quando ele ver a conta, puxar o nome
 * pelo plano e não pelo que vem no balancete"). É OPCIONAL e vale só para a empresa em que for carregado.
 *
 * O arquivo dela é a "Relação das Contas Contábeis" em PDF, com onze colunas — e três armadilhas:
 *  1. mais de uma coluna tem cara de conta (a classificação, a conta referência do SPED, a de aglutinação, o
 *     código de natureza). A da empresa é a que tem um valor DIFERENTE em cada linha: as outras se repetem;
 *  2. o nome que não cabe na coluna CONTINUA NA LINHA DE BAIXO, sozinho ("TRIBUTOS E CONTRIBUIÇÕES A" +
 *     "COMPENSAR"). A continuação só vale na linha seguinte à da conta, e texto que se repete em várias
 *     páginas é cabeçalho (o nome da empresa, por exemplo), não continuação;
 *  3. a mesma conta é escrita com máscaras diferentes em cada relatório ("1.1.1.002.0001" no balancete,
 *     "1.1.10.020.001" no diário): o plano guarda os dois jeitos de procurar — pelo código e só pelos dígitos.
 *
 * Só leitura: nada aqui decide onde o nome vai ser usado.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.LerPlano = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
  const vazio = (v) => texto(v) === '';
  const EH_CODIGO = /^\d+(?:[.\-]\d+)*\.?$/;
  const soDigitos = (c) => String(c || '').replace(/\D+/g, '');
  // Conta de verdade tem HIERARQUIA (1.01.05.05). Número seco (4908) é sequência ou código reduzido — e os
  // dois nunca se comparam. Sem essa regra o reduzido 4908 de uma conta casava pelos dígitos com a sequência
  // 4908 de outra, e o plano trocava o nome de 289 contas por nome de cliente (Dony, 29/09/2026, a Omega:
  // "o sistema leu o plano de contas todo errado, que merdada é essa?").
  const temHierarquia = (c) => /[.\-]/.test(String(c === null || c === undefined ? '' : c));
  const ehCodigo = (v) => { const t = texto(v); return !!t && t.length <= 30 && EH_CODIGO.test(t); };
  const temNome = (v) => { const t = texto(v); return t.length >= 3 && /[A-Za-zÀ-ÿ]{3}/.test(t); };

  // A coluna das contas e a coluna dos nomes. Nas duas vale a mesma medida: a coluna certa é a que tem
  // MUITOS VALORES DIFERENTES. As outras colunas de código (referência, aglutinação, natureza) repetem o
  // mesmo valor em dezenas de contas, e as outras colunas de texto ("Devedora", "Credora") repetem duas.
  function acharColunas(linhas) {
    const largura = linhas.reduce((n, l) => Math.max(n, (l || []).length), 0);
    const cols = [];
    for (let i = 0; i < largura; i++) {
      const cheias = [], codigos = new Set(), nomes = new Set();
      let comCodigo = 0, comNome = 0, comPontos = 0;
      linhas.forEach((l) => {
        const t = texto(l && l[i]);
        if (!t) return;
        cheias.push(t);
        if (ehCodigo(t)) { comCodigo++; codigos.add(t); if (t.indexOf('.') > 0) comPontos++; }
        if (temNome(t)) { comNome++; nomes.add(t); }
      });
      cols.push({ i, cheias: cheias.length, comCodigo, comNome, comPontos, codigos: codigos.size, nomes: nomes.size });
    }
    const deCodigoTodas = cols.filter((c) => c.cheias >= 5 && c.comCodigo >= c.cheias * 0.8);
    // A conta do plano tem HIERARQUIA (pontos). Sem isso, uma coluna de sequência ("Seq.: 1, 2, 3…") ganharia
    // por ter mais valores diferentes que a classificação — foi o que aconteceu no plano da Omega, em que a
    // mesma classificação serve a 265 clientes (Dony, 29/09/2026).
    const comArvore = deCodigoTodas.filter((c) => c.comPontos >= c.comCodigo * 0.6);
    const deCodigo = (comArvore.length ? comArvore : deCodigoTodas).sort((a, b) => b.codigos - a.codigos || a.i - b.i)[0];
    if (!deCodigo) return null;
    const deNome = cols.filter((c) => c.i !== deCodigo.i && c.cheias >= 5 && c.comNome >= c.cheias * 0.6)
      .sort((a, b) => b.nomes - a.nomes || a.i - b.i)[0];
    if (!deNome) return null;
    return { conta: deCodigo.i, titulo: deNome.i, quantas: deCodigo.codigos };
  }

  // Este arquivo é um plano de contas? Pelo título ("Plano de contas", "Relação das contas contábeis") ou pelo
  // nome do arquivo — e desde que não tenha coluna de valor (aí é balancete).
  function reconhecer(abas, op) {
    const opc = op || {};
    const noNome = /(plano de contas|relacao das contas|planodecontas)/.test(Util.semAcento(String(opc.nomeArquivo || '')).toLowerCase());
    for (let a = 0; a < (abas || []).length; a++) {
      const linhas = (abas[a].linhas || []);
      const alto = Util.semAcento(linhas.slice(0, 12).map((l) => (l || []).map(texto).join(' ')).join(' ')).toLowerCase();
      const titulo = noNome || /(plano de contas|relacao das contas contabeis|relacao de contas contabeis)/.test(alto);
      if (!titulo && !opc.aceitar) continue;
      const c = acharColunas(linhas);
      if (!c || c.quantas < 5) continue;
      // Tem coluna de dinheiro (1.234,56)? Então é balancete, não plano.
      const comValor = linhas.filter((l) => (l || []).some((x) => /^-?\(?\d{1,3}(\.\d{3})*,\d{2}\)?\s*[DC]?$/.test(texto(x)))).length;
      if (comValor > Math.max(3, linhas.length * 0.1)) continue;
      return { tipo: 'plano', aba: a, colunas: c,
        motivo: 'Este arquivo é um PLANO DE CONTAS: o código e o nome de cada conta, sem valores.' };
    }
    return null;
  }

  // A coluna tem contas de verdade (com hierarquia) ou é uma sequência (1, 2, 3…)?
  function colunaComArvore(linhas, i) {
    let codigos = 0, comPonto = 0;
    (linhas || []).forEach((l) => {
      const t = texto(l && l[i]);
      if (!t || !ehCodigo(t)) return;
      codigos++;
      if (temHierarquia(t)) comPonto++;
    });
    return codigos >= 5 && comPonto >= codigos * 0.6;
  }

  // Lê o plano. op: { nomeArquivo, aceitar (o lugar do plano manda), colunas (o padrão guardado da empresa:
  // { conta, titulo } — Dony, 29/09/2026: "precisa ter um padrão para cada cliente"), semPadrao }
  function ler(abas, op) {
    const opc = op || {};
    const guardado = !opc.semPadrao && opc.colunas && Number.isInteger(opc.colunas.conta) && Number.isInteger(opc.colunas.titulo)
      ? { tipo: 'plano', aba: Number.isInteger(opc.colunas.aba) ? opc.colunas.aba : 0, colunas: { conta: opc.colunas.conta, titulo: opc.colunas.titulo, quantas: 0 } } : null;
    let rec = guardado && abas[guardado.aba] ? guardado : null;
    let doPadrao = '';
    // O padrão guardado manda — menos quando ele aponta para uma coluna SEM hierarquia (uma sequência) e o
    // arquivo tem uma com hierarquia. Padrão assim ficou guardado antes de o programa saber escolher, e
    // prendia a empresa no erro a cada recarga (Dony, 29/09/2026, a Omega).
    if (rec && !colunaComArvore((abas[rec.aba].linhas || []), rec.colunas.conta)) {
      const auto = reconhecer(abas, Object.assign({}, opc, { aceitar: true }));
      if (auto && colunaComArvore((abas[auto.aba].linhas || []), auto.colunas.conta)) {
        doPadrao = 'O padrão guardado apontava a coluna ' + (rec.colunas.conta + 1) + ', que é uma sequência (números sem hierarquia).' +
          ' Usei a coluna ' + (auto.colunas.conta + 1) + ', que é a classificação das contas.';
        rec = auto;
      }
    }
    if (!rec) rec = reconhecer(abas, opc);
    if (!rec) throw new Error('Não achei neste arquivo uma lista de contas (código e nome).');
    const linhas = abas[rec.aba].linhas || [];
    const c = rec.colunas;
    const avisos = [];
    if (doPadrao) avisos.push(doPadrao);
    // Texto que aparece em muitas linhas sozinho na coluna do nome é cabeçalho de página (o nome da empresa,
    // por exemplo), e não a continuação de um nome.
    const soltas = new Map();
    linhas.forEach((l) => {
      if (!l || !vazio(l[c.conta]) || vazio(l[c.titulo])) return;
      const t = texto(l[c.titulo]);
      soltas.set(t, (soltas.get(t) || 0) + 1);
    });
    const contas = [];
    let ultima = null, ultimaLinha = -2, continuadas = 0;
    linhas.forEach((l, r) => {
      if (!l) return;
      const cod = texto(l[c.conta]).replace(/\.$/, '');
      const nome = texto(l[c.titulo]);
      if (ehCodigo(cod) && cod) {
        if (!nome) return;
        ultima = { conta: cod, titulo: nome };
        ultimaLinha = r;
        contas.push(ultima);
        return;
      }
      // Continuação: só o nome preenchido, na linha logo abaixo da conta (ou da continuação anterior).
      const soONome = nome && (l.every((x, i) => i === c.titulo || vazio(x)));
      if (soONome && ultima && r === ultimaLinha + 1 && (soltas.get(nome) || 0) < Math.max(6, linhas.length * 0.01)) {
        ultima.titulo += ' ' + nome;
        ultimaLinha = r;
        continuadas++;
      }
    });
    if (!contas.length) throw new Error('Não achei nenhuma conta neste plano.');
    if (continuadas) avisos.push(continuadas + ' nome(s) que continuavam na linha de baixo foram juntados.');
    // Contas repetidas: fica a primeira. Quando as repetidas têm NOMES DIFERENTES (a Omega: 265 clientes na
    // mesma classificação), o nome é ambíguo — essa conta não serve para renomear nada.
    const porConta = new Map();
    const limpas = [];
    let repetidas = 0, ambiguas = 0;
    const chaveNome = (t) => Util.semAcento(String(t || '')).toUpperCase().replace(/\s+/g, ' ').trim();
    contas.forEach((x) => {
      const anterior = porConta.get(x.conta);
      if (anterior) {
        repetidas++;
        if (!anterior.ambiguo && chaveNome(anterior.titulo) !== chaveNome(x.titulo)) { anterior.ambiguo = true; ambiguas++; }
        return;
      }
      porConta.set(x.conta, x);
      limpas.push(x);
    });
    if (repetidas) avisos.push(repetidas + ' linha(s) repetiram a classificação de outra: ficou a primeira.');
    if (ambiguas) avisos.push(ambiguas + ' classificação(ões) aparecem com NOMES DIFERENTES (é uma classificação para várias contas): elas não renomeiam conta nenhuma.');
    const empresa = nomeDaEmpresa(linhas, c);
    const comArvore = limpas.filter((x) => temHierarquia(x.conta)).length;
    if (comArvore < limpas.length * 0.6) {
      avisos.push('ATENÇÃO: os códigos deste plano não têm hierarquia (só ' + comArvore + ' de ' + limpas.length +
        ' são do tipo 1.01.05). Isso costuma ser a coluna errada — confira antes de usar.');
    }
    return { tipo: 'plano', empresa, contas: limpas, total: limpas.length, comArvore, avisos, aba: rec.aba,
      colunas: { conta: c.conta, titulo: c.titulo, aba: rec.aba } };
  }

  // O nome da empresa: a linha de cima que é só texto comprido, antes da primeira conta.
  function nomeDaEmpresa(linhas, c) {
    for (let r = 0; r < Math.min(20, linhas.length); r++) {
      const l = linhas[r] || [];
      if (ehCodigo(texto(l[c.conta]))) break;
      const t = texto(l[c.titulo]);
      if (t.length >= 8 && /[A-Za-zÀ-ÿ]{4}/.test(t) && !/relacao|relação|plano|descricao|descrição|conta/i.test(t)) return t;
    }
    return '';
  }

  // O plano guardado vira uma busca: pelo código como está escrito e só pelos dígitos (a mesma conta sai com
  // máscaras diferentes em cada relatório do sistema).
  function paraProcurar(plano) {
    const porCodigo = new Map(), porDigitos = new Map();
    // O MESMO CÓDIGO COM NOMES DIFERENTES não serve para renomear nada (Dony, 29/09/2026, a Omega: 265
    // clientes na classificação 1.01.05.05.01.0001, cada um com o seu nome). Códigos assim ficam de fora.
    const nomes = new Map();
    ((plano && plano.contas) || []).forEach((x) => {
      const cod = String(x.conta || '').trim();
      if (!cod || !x.titulo) return;
      const lista = nomes.get(cod) || new Set();
      lista.add(Util.semAcento(String(x.titulo)).toUpperCase().replace(/\s+/g, ' ').trim());
      // A leitura já marcou a classificação que serve a várias contas com nomes diferentes.
      if (x.ambiguo) lista.add('#ambiguo');
      nomes.set(cod, lista);
    });
    let ambiguos = 0;
    ((plano && plano.contas) || []).forEach((x) => {
      const cod = String(x.conta || '').trim();
      if (!cod || !x.titulo) return;
      if ((nomes.get(cod) || new Set()).size > 1) { if (!porCodigo.has('#' + cod)) { porCodigo.set('#' + cod, 1); ambiguos++; } return; }
      if (!porCodigo.has(cod)) porCodigo.set(cod, x.titulo);
      // Só pelos dígitos vale entre contas do mesmo jeito — a mesma conta com máscaras diferentes
      // ("1.1.1.002.0001" no balancete, "1.1.10.020.001" no diário). Número seco fica de fora.
      const d = soDigitos(cod);
      if (d && temHierarquia(cod) && !porDigitos.has(d)) porDigitos.set(d, x.titulo);
    });
    const achar = (codigo) => {
      const cod = String(codigo === null || codigo === undefined ? '' : codigo).trim();
      if (!cod) return '';
      if (porCodigo.has('#' + cod)) return '';   // código ambíguo: não renomeia
      return porCodigo.get(cod) || (temHierarquia(cod) ? porDigitos.get(soDigitos(cod)) : '') || '';
    };
    const comArvore = Array.from(porCodigo.keys()).filter((c) => c.charAt(0) !== '#' && temHierarquia(c)).length;
    return { achar, quantas: porCodigo.size - ambiguos, ambiguos, comArvore };
  }

  // ESTE PLANO SERVE PARA ESTAS CONTAS? Ele tem que reconhecer as contas pelo CÓDIGO DELAS (a classificação).
  // Plano que só acerta pelo código reduzido está com a coluna errada: foi o que aconteceu na Omega, em que o
  // plano guardado tinha a coluna de sequência no lugar da classificação e 289 das 382 contas do balancete
  // ganharam nome de cliente ("3.05 DESPESAS E RECEITAS OPERACIONAIS" virou "3.05 HONDA").
  function conferir(plano, contas) {
    const p = plano && typeof plano.achar === 'function' ? plano : paraProcurar(plano);
    const lista = (contas || []).filter((x) => x && String(x.conta === null || x.conta === undefined ? '' : x.conta).trim());
    let pelaConta = 0, soPeloReduzido = 0;
    lista.forEach((x) => {
      if (p.achar(x.conta)) pelaConta++;
      else if (p.achar(x.reduzido)) soPeloReduzido++;
    });
    // Serve quando reconhece uma parte de verdade das contas PELO CÓDIGO DELAS, e nunca quando acerta mais
    // pelo reduzido do que pela conta (é o retrato do plano lido na coluna errada).
    const serve = !lista.length || (pelaConta >= lista.length * 0.25 && pelaConta >= soPeloReduzido);
    return { serve, pelaConta, soPeloReduzido, contas: lista.length,
      motivo: serve ? '' : 'Este plano não reconhece as contas do balancete: acertou ' + pelaConta + ' de ' + lista.length +
        ' pelo código da conta' + (soPeloReduzido ? ' (e ' + soPeloReduzido + ' só pelo código reduzido, que não vale)' : '') +
        '. Provavelmente ele foi lido com a coluna errada — carregue o plano de novo.' };
  }

  // Troca o nome das contas pelo do plano (só quando o plano tem aquela conta). Devolve uma lista nova.
  function comOsNomes(contas, plano) {
    const p = plano && typeof plano.achar === 'function' ? plano : paraProcurar(plano);
    if (!p.quantas) return contas || [];
    if (!conferir(p, contas).serve) return contas || [];   // plano com a coluna errada não renomeia nada
    // Plano de classificação só casa com classificação: o código reduzido ("4908") não vai procurar nome.
    const planoDeArvore = p.comArvore > p.quantas / 2;
    return (contas || []).map((x) => {
      const nome = p.achar(x.conta) || (!planoDeArvore || temHierarquia(x.reduzido) ? p.achar(x.reduzido) : '');
      return nome && nome !== x.titulo ? Object.assign({}, x, { titulo: nome, tituloDoArquivo: x.titulo }) : x;
    });
  }

  return { reconhecer, ler, paraProcurar, comOsNomes, conferir, acharColunas };
});
