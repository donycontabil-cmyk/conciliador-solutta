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
      let comCodigo = 0, comNome = 0;
      linhas.forEach((l) => {
        const t = texto(l && l[i]);
        if (!t) return;
        cheias.push(t);
        if (ehCodigo(t)) { comCodigo++; codigos.add(t); }
        if (temNome(t)) { comNome++; nomes.add(t); }
      });
      cols.push({ i, cheias: cheias.length, comCodigo, comNome, codigos: codigos.size, nomes: nomes.size });
    }
    const deCodigo = cols.filter((c) => c.cheias >= 5 && c.comCodigo >= c.cheias * 0.8)
      .sort((a, b) => b.codigos - a.codigos || a.i - b.i)[0];
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

  // Lê o plano. op: { nomeArquivo, aceitar (o lugar do plano manda: lê mesmo sem o título) }
  function ler(abas, op) {
    const opc = op || {};
    const rec = reconhecer(abas, opc);
    if (!rec) throw new Error('Não achei neste arquivo uma lista de contas (código e nome).');
    const linhas = abas[rec.aba].linhas || [];
    const c = rec.colunas;
    const avisos = [];
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
    // Contas repetidas: fica a primeira (e avisa).
    const vistas = new Set();
    const limpas = [];
    let repetidas = 0;
    contas.forEach((x) => { if (vistas.has(x.conta)) { repetidas++; return; } vistas.add(x.conta); limpas.push(x); });
    if (repetidas) avisos.push(repetidas + ' conta(s) apareceram mais de uma vez: ficou a primeira.');
    const empresa = nomeDaEmpresa(linhas, c);
    return { tipo: 'plano', empresa, contas: limpas, total: limpas.length, avisos, aba: rec.aba, colunas: c };
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
    ((plano && plano.contas) || []).forEach((x) => {
      const cod = String(x.conta || '').trim();
      if (!cod || !x.titulo) return;
      if (!porCodigo.has(cod)) porCodigo.set(cod, x.titulo);
      const d = soDigitos(cod);
      if (d && !porDigitos.has(d)) porDigitos.set(d, x.titulo);
    });
    const achar = (codigo) => {
      const cod = String(codigo === null || codigo === undefined ? '' : codigo).trim();
      if (!cod) return '';
      return porCodigo.get(cod) || porDigitos.get(soDigitos(cod)) || '';
    };
    return { achar, quantas: porCodigo.size };
  }

  // Troca o nome das contas pelo do plano (só quando o plano tem aquela conta). Devolve uma lista nova.
  function comOsNomes(contas, plano) {
    const p = plano && typeof plano.achar === 'function' ? plano : paraProcurar(plano);
    if (!p.quantas) return contas || [];
    return (contas || []).map((x) => {
      const nome = p.achar(x.conta) || p.achar(x.reduzido);
      return nome && nome !== x.titulo ? Object.assign({}, x, { titulo: nome, tituloDoArquivo: x.titulo }) : x;
    });
  }

  return { reconhecer, ler, paraProcurar, comOsNomes, acharColunas };
});
