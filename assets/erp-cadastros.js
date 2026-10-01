/*
 * ERP Solutta — erp-cadastros.js
 * As TABELAS BÁSICAS do sistema contábil: o LAYOUT do plano de contas, as contas, os centros de resultado e
 * as naturezas de operação. Dony, 01/10/2026: "vamos criar um sistema contábil nosso, do zero, criando o
 * layout do plano de contas, centro de resultado e as naturezas de operação".
 *
 * Este arquivo é SÓ REGRA: não conhece tela nem armazenamento. É o coração do ERP e sai inteiro daqui para
 * um programa próprio no dia em que o ERP ficar independente (Dony: "depois vamos deixar ele independente").
 *
 * O LAYOUT vem antes das contas. Em todo sistema contábil é ele que diz como o código é montado:
 *   máscara  1.01.001.0001   -> quatro níveis de 1, 2, 3 e 4 dígitos, separados por ponto
 * Com a máscara o programa sabe, só de olhar o código: em que nível a conta está, qual é a conta de cima
 * (a mãe) e se o código está bem formado. Sem isso, cada conta é um palpite.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ErpCadastros = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const texto = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const soDigitos = (v) => texto(v).replace(/\D+/g, '');
  const semAcento = (v) => texto(v).normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  const chaveNome = (v) => semAcento(v).toUpperCase();

  // ------------------------------------------------------------------
  // ESPÉCIES de conta de 1º nível. A espécie diz em que demonstração a conta entra e qual é a natureza
  // normal dela (devedora ou credora) — é o que faz o balanço fechar e a DRE sair com o sinal certo.
  // ------------------------------------------------------------------
  const ESPECIES = [
    { id: 'ativo', nome: 'Ativo', natureza: 'D', onde: 'Balanço patrimonial' },
    { id: 'passivo', nome: 'Passivo', natureza: 'C', onde: 'Balanço patrimonial' },
    { id: 'pl', nome: 'Patrimônio líquido', natureza: 'C', onde: 'Balanço patrimonial' },
    { id: 'receita', nome: 'Receitas', natureza: 'C', onde: 'DRE' },
    { id: 'custo', nome: 'Custos', natureza: 'D', onde: 'DRE' },
    { id: 'despesa', nome: 'Despesas', natureza: 'D', onde: 'DRE' },
    { id: 'resultado', nome: 'Resultado (receitas e despesas juntas)', natureza: 'C', onde: 'DRE' },
    { id: 'compensacao', nome: 'Contas de compensação', natureza: 'D', onde: 'Fora do balanço' },
  ];
  const ESPECIE = {};
  ESPECIES.forEach((e) => { ESPECIE[e.id] = e; });
  const ehResultado = (especie) => ['receita', 'custo', 'despesa', 'resultado'].indexOf(especie) >= 0;
  const ehPatrimonial = (especie) => ['ativo', 'passivo', 'pl'].indexOf(especie) >= 0;

  // Modelos de plano prontos, para não começar da folha em branco. Ele troca o que quiser.
  const MODELOS = [
    { id: 'quatro', nome: '4 grupos (o mais comum)', mascara: '1.01.001.0001',
      niveis: ['Grupo', 'Subgrupo', 'Conta', 'Analítica'],
      grupos: [
        { codigo: '1', nome: 'ATIVO', especie: 'ativo' },
        { codigo: '2', nome: 'PASSIVO E PATRIMÔNIO LÍQUIDO', especie: 'passivo' },
        { codigo: '3', nome: 'RECEITAS', especie: 'receita' },
        { codigo: '4', nome: 'CUSTOS E DESPESAS', especie: 'despesa' },
      ] },
    { id: 'seis', nome: '6 grupos (PL e custos separados)', mascara: '1.01.01.001.0001',
      niveis: ['Grupo', 'Subgrupo', 'Conta', 'Subconta', 'Analítica'],
      grupos: [
        { codigo: '1', nome: 'ATIVO', especie: 'ativo' },
        { codigo: '2', nome: 'PASSIVO', especie: 'passivo' },
        { codigo: '3', nome: 'PATRIMÔNIO LÍQUIDO', especie: 'pl' },
        { codigo: '4', nome: 'RECEITAS', especie: 'receita' },
        { codigo: '5', nome: 'CUSTOS', especie: 'custo' },
        { codigo: '6', nome: 'DESPESAS', especie: 'despesa' },
      ] },
    { id: 'resultado', nome: 'Resultado num grupo só (como a Omega)', mascara: '1.01.01.01.01.0001',
      niveis: ['Grupo', 'Subgrupo', 'Conta', 'Subconta', 'Item', 'Analítica'],
      grupos: [
        { codigo: '1', nome: 'ATIVO', especie: 'ativo' },
        { codigo: '2', nome: 'PASSIVO', especie: 'passivo' },
        { codigo: '3', nome: 'RESULTADO', especie: 'resultado' },
        { codigo: '4', nome: 'CONTAS DE COMPENSAÇÃO', especie: 'compensacao' },
      ] },
  ];

  // ------------------------------------------------------------------
  // A MÁSCARA
  // Aceita dos dois jeitos: com 9 no lugar do dígito ("9.99.999.9999") ou um código de exemplo
  // ("1.01.001.0001"). O que vale é quantos dígitos tem cada nível e qual é o separador.
  // ------------------------------------------------------------------
  function lerMascara(entrada) {
    const t = texto(entrada);
    if (!t) return { ok: false, erro: 'Escreva a máscara do plano de contas, por exemplo 1.01.001.0001.' };
    const sep = t.indexOf('.') >= 0 ? '.' : t.indexOf('-') >= 0 ? '-' : '';
    if (!sep) return { ok: false, erro: 'A máscara precisa de um separador entre os níveis: ponto (1.01.001) ou traço (1-01-001).' };
    const partes = t.split(sep);
    if (partes.length < 2) return { ok: false, erro: 'A máscara precisa de pelo menos dois níveis (por exemplo 1.0001).' };
    if (partes.length > 8) return { ok: false, erro: 'No máximo oito níveis.' };
    const niveis = [];
    for (const p of partes) {
      const d = texto(p);
      if (!/^[0-9]+$/.test(d)) return { ok: false, erro: 'Cada nível da máscara é só número: "' + p + '" não serve.' };
      if (d.length > 6) return { ok: false, erro: 'Um nível com ' + d.length + ' dígitos é demais (o máximo é 6).' };
      niveis.push(d.length);
    }
    return { ok: true, niveis, separador: sep, texto: niveis.map((n) => '9'.repeat(n)).join(sep) };
  }

  // A MÁSCARA TIRADA DE UM PLANO QUE JÁ EXISTE: quando ele traz o plano de contas que o sistema do cliente
  // imprime, o programa olha os códigos e descobre sozinho o desenho (quantos dígitos tem cada nível).
  // O tamanho de cada nível é o MAIOR que aparece nele — "1.1" e "1.01" juntos viram dois dígitos.
  function mascaraDosCodigos(codigos) {
    const limpos = (codigos || []).map(texto).filter((c) => /^[0-9]+([.-][0-9]+)+$/.test(c));
    if (limpos.length < 3) return { ok: false, erro: 'Não achei códigos de conta com níveis (1.01.001) para descobrir a máscara.' };
    const sep = limpos[0].indexOf('.') >= 0 ? '.' : '-';
    const tamanhos = [];
    limpos.forEach((c) => {
      c.split(sep).forEach((p, i) => { tamanhos[i] = Math.max(tamanhos[i] || 0, p.length); });
    });
    if (tamanhos.length > 8) return { ok: false, erro: 'Esse plano tem ' + tamanhos.length + ' níveis — o máximo é 8.' };
    const mascara = tamanhos.map((n) => '9'.repeat(n)).join(sep);
    const m = lerMascara(mascara);
    if (!m.ok) return m;
    // Quantos códigos realmente batem com a máscara achada (os outros vão aparecer como problema).
    const batem = limpos.filter((c) => {
      const p = c.split(sep);
      return p.length <= tamanhos.length && p.every((x, i) => x.length === tamanhos[i]);
    }).length;
    return { ok: true, mascara: m.texto, separador: sep, tamanhos: m.niveis, batem, total: limpos.length };
  }

  // O layout inteiro, já conferido. layout: { mascara, niveis: [nomes], grupos: [{codigo,nome,especie}],
  // usaReduzido, exigeCentro }
  function lerLayout(layout) {
    const l = layout || {};
    const m = lerMascara(l.mascara);
    if (!m.ok) return { ok: false, erro: m.erro };
    const nomes = [];
    for (let i = 0; i < m.niveis.length; i++) nomes.push(texto((l.niveis || [])[i]) || ('Nível ' + (i + 1)));
    const grupos = [];
    const vistos = new Set();
    for (const g of (l.grupos || [])) {
      const codigo = texto(g.codigo);
      if (!codigo) continue;
      if (codigo.length !== m.niveis[0]) return { ok: false, erro: 'O grupo "' + codigo + '" não tem ' + m.niveis[0] + ' dígito(s), como pede a máscara.' };
      if (!/^[0-9]+$/.test(codigo)) return { ok: false, erro: 'O código do grupo é só número: "' + codigo + '" não serve.' };
      if (vistos.has(codigo)) return { ok: false, erro: 'O grupo ' + codigo + ' está repetido.' };
      vistos.add(codigo);
      if (!ESPECIE[g.especie]) return { ok: false, erro: 'O grupo ' + codigo + ' está sem espécie (ativo, passivo, receita…).' };
      grupos.push({ codigo, nome: texto(g.nome) || ('GRUPO ' + codigo), especie: g.especie });
    }
    if (!grupos.length) return { ok: false, erro: 'Cadastre pelo menos um grupo de 1º nível (1 ATIVO, 2 PASSIVO…).' };
    return { ok: true, mascara: m.texto, separador: m.separador, tamanhos: m.niveis, niveis: nomes, grupos,
      usaReduzido: !!l.usaReduzido, exigeCentro: !!l.exigeCentro };
  }

  // O código bate com a máscara? Devolve o nível (1 = grupo) e os pedaços.
  function lerCodigo(codigo, layout) {
    const L = layout && layout.ok ? layout : lerLayout(layout);
    if (!L.ok) return { ok: false, erro: L.erro };
    const t = texto(codigo);
    if (!t) return { ok: false, erro: 'Conta sem código.' };
    const partes = t.split(L.separador);
    if (partes.length > L.tamanhos.length) {
      return { ok: false, erro: 'O código ' + t + ' tem ' + partes.length + ' níveis e a máscara ' + L.mascara + ' tem ' + L.tamanhos.length + '.' };
    }
    for (let i = 0; i < partes.length; i++) {
      if (!/^[0-9]+$/.test(partes[i])) return { ok: false, erro: 'O código ' + t + ' tem "' + partes[i] + '" no ' + (i + 1) + 'º nível: só número.' };
      if (partes[i].length !== L.tamanhos[i]) {
        return { ok: false, erro: 'No código ' + t + ', o ' + (i + 1) + 'º nível tem ' + partes[i].length + ' dígito(s) e a máscara ' + L.mascara + ' pede ' + L.tamanhos[i] + '.' };
      }
    }
    return { ok: true, nivel: partes.length, partes, grupo: partes[0] };
  }

  // A conta de cima (mãe). O grupo (1º nível) não tem mãe.
  function paiDe(codigo, layout) {
    const L = layout && layout.ok ? layout : lerLayout(layout);
    if (!L.ok) return '';
    const partes = texto(codigo).split(L.separador);
    return partes.length <= 1 ? '' : partes.slice(0, partes.length - 1).join(L.separador);
  }

  // Monta o código do próximo "irmão" livre dentro de uma mãe (o botão "+ Nova conta" já vem preenchido).
  function proximoCodigo(contas, pai, layout) {
    const L = layout && layout.ok ? layout : lerLayout(layout);
    if (!L.ok) return '';
    const nivel = pai ? texto(pai).split(L.separador).length + 1 : 1;
    if (nivel > L.tamanhos.length) return '';
    const tam = L.tamanhos[nivel - 1];
    const usados = new Set();
    (contas || []).forEach((c) => {
      const cod = texto(c.codigo);
      if (!cod || paiDe(cod, L) !== texto(pai)) return;
      const partes = cod.split(L.separador);
      if (partes.length === nivel) usados.add(partes[nivel - 1]);
    });
    // De 5 em 5 quando cabe (1, 5, 10, 15…) é como os sistemas contábeis numeram: deixa espaço para encaixar
    // conta nova no meio depois, sem ter que renumerar tudo.
    const passo = tam >= 2 ? 5 : 1;
    for (let n = passo; n < Math.pow(10, tam); n += passo) {
      const s = String(n).padStart(tam, '0');
      if (!usados.has(s)) return pai ? pai + L.separador + s : s;
    }
    for (let n = 1; n < Math.pow(10, tam); n++) {
      const s = String(n).padStart(tam, '0');
      if (!usados.has(s)) return pai ? pai + L.separador + s : s;
    }
    return '';
  }

  // Ordena pelos pedaços do código (01 antes de 1.01, e 1.9 antes de 1.10).
  function compararCodigos(a, b, L) {
    const pa = texto(a).split(L.separador), pb = texto(b).split(L.separador);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] === undefined ? -1 : Number(pa[i]);
      const y = pb[i] === undefined ? -1 : Number(pb[i]);
      if (x !== y) return x - y;
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // O PLANO INTEIRO, conferido. Devolve a árvore (com mãe, nível, analítica) e os problemas.
  // Conta com filha é SINTÉTICA e não recebe lançamento; sem filha é ANALÍTICA e é nela que se lança.
  // ------------------------------------------------------------------
  function montarPlano(contas, layout) {
    const L = layout && layout.ok ? layout : lerLayout(layout);
    if (!L.ok) return { ok: false, erro: L.erro, contas: [], problemas: [{ conta: '', texto: L.erro }] };
    const problemas = [];
    const porCodigo = new Map();
    const porReduzido = new Map();
    const lista = [];
    const grupos = new Map(L.grupos.map((g) => [g.codigo, g]));
    (contas || []).forEach((c) => {
      const codigo = texto(c.codigo);
      const lido = lerCodigo(codigo, L);
      if (!lido.ok) { problemas.push({ conta: codigo, texto: lido.erro }); return; }
      if (porCodigo.has(codigo)) { problemas.push({ conta: codigo, texto: 'A conta ' + codigo + ' está cadastrada duas vezes.' }); return; }
      const grupo = grupos.get(lido.grupo);
      if (!grupo) { problemas.push({ conta: codigo, texto: 'O grupo ' + lido.grupo + ' da conta ' + codigo + ' não está nos grupos do layout.' }); return; }
      const reduzido = texto(c.reduzido);
      if (reduzido) {
        if (porReduzido.has(reduzido)) problemas.push({ conta: codigo, texto: 'O código reduzido ' + reduzido + ' já é da conta ' + porReduzido.get(reduzido) + '.' });
        else porReduzido.set(reduzido, codigo);
      }
      const nova = {
        codigo, reduzido, nome: texto(c.nome), nivel: lido.nivel, pai: paiDe(codigo, L),
        especie: grupo.especie, grupo: lido.grupo,
        // A natureza normal vem da espécie; a conta pode ter a sua (uma redutora de receita é devedora).
        natureza: c.natureza === 'D' || c.natureza === 'C' ? c.natureza : ESPECIE[grupo.especie].natureza,
        referencial: texto(c.referencial), centro: !!c.centro, situacao: c.situacao === 'inativa' ? 'inativa' : 'ativa',
        observacao: texto(c.observacao), filhas: 0, analitica: true,
      };
      porCodigo.set(codigo, nova);
      lista.push(nova);
    });
    lista.sort((a, b) => compararCodigos(a.codigo, b.codigo, L));
    // Mãe que falta e quem é sintética
    lista.forEach((c) => {
      if (!c.pai) return;
      const mae = porCodigo.get(c.pai);
      if (!mae) { problemas.push({ conta: c.codigo, texto: 'Falta a conta de cima (' + c.pai + ') da conta ' + c.codigo + '.' }); return; }
      mae.filhas++;
      mae.analitica = false;
    });
    lista.forEach((c) => { if (!c.nome) problemas.push({ conta: c.codigo, texto: 'A conta ' + c.codigo + ' está sem nome.' }); });
    const analiticas = lista.filter((c) => c.analitica).length;
    return { ok: !problemas.length, layout: L, contas: lista, porCodigo, problemas,
      total: lista.length, analiticas, sinteticas: lista.length - analiticas };
  }

  // Uma conta antes de entrar: devolve { ok, conta, erro }. Serve para o formulário avisar na hora.
  function conferirConta(conta, contas, layout, codigoAntigo) {
    const L = layout && layout.ok ? layout : lerLayout(layout);
    if (!L.ok) return { ok: false, erro: L.erro };
    const codigo = texto(conta && conta.codigo);
    const lido = lerCodigo(codigo, L);
    if (!lido.ok) return { ok: false, erro: lido.erro };
    if (!L.grupos.some((g) => g.codigo === lido.grupo)) return { ok: false, erro: 'O grupo ' + lido.grupo + ' não está no layout do plano.' };
    const outras = (contas || []).filter((c) => texto(c.codigo) !== texto(codigoAntigo));
    if (outras.some((c) => texto(c.codigo) === codigo)) return { ok: false, erro: 'Já existe a conta ' + codigo + '.' };
    if (!texto(conta.nome)) return { ok: false, erro: 'Escreva o nome da conta.' };
    const reduzido = texto(conta.reduzido);
    if (reduzido && outras.some((c) => texto(c.reduzido) === reduzido)) {
      return { ok: false, erro: 'O código reduzido ' + reduzido + ' já é de outra conta.' };
    }
    const pai = paiDe(codigo, L);
    if (pai && !outras.some((c) => texto(c.codigo) === pai)) {
      return { ok: false, erro: 'Antes desta, cadastre a conta de cima: ' + pai + '.' };
    }
    const grupo = L.grupos.find((g) => g.codigo === lido.grupo);
    return { ok: true, conta: {
      codigo, reduzido, nome: texto(conta.nome),
      natureza: conta.natureza === 'D' || conta.natureza === 'C' ? conta.natureza : ESPECIE[grupo.especie].natureza,
      referencial: texto(conta.referencial), centro: !!conta.centro,
      situacao: conta.situacao === 'inativa' ? 'inativa' : 'ativa', observacao: texto(conta.observacao),
    } };
  }

  // Excluir só vale em conta sem filha e (depois) sem lançamento. Quem tem filha, perde as de baixo junto.
  function podeExcluir(codigo, contas, layout) {
    const p = montarPlano(contas, layout);
    const c = p.porCodigo && p.porCodigo.get(texto(codigo));
    if (!c) return { ok: false, erro: 'Conta não encontrada.' };
    if (c.filhas) return { ok: false, erro: 'A conta ' + codigo + ' tem ' + c.filhas + ' conta(s) abaixo dela. Exclua as de baixo primeiro.' };
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // CENTROS DE RESULTADO — a mesma ideia do plano, com máscara própria (quase sempre menor: 99.99).
  // Serve para dividir receita e despesa por loja, obra, projeto ou departamento.
  // ------------------------------------------------------------------
  function montarCentros(centros, layout) {
    const m = lerMascara((layout || {}).mascara || '99.99');
    if (!m.ok) return { ok: false, erro: m.erro, centros: [], problemas: [{ conta: '', texto: m.erro }] };
    const L = { ok: true, separador: m.separador, tamanhos: m.niveis, mascara: m.texto, grupos: [] };
    const problemas = [];
    const por = new Map();
    const lista = [];
    (centros || []).forEach((c) => {
      const codigo = texto(c.codigo);
      const partes = codigo ? codigo.split(L.separador) : [];
      if (!codigo) { problemas.push({ conta: '', texto: 'Centro sem código.' }); return; }
      if (partes.length > L.tamanhos.length) { problemas.push({ conta: codigo, texto: 'O centro ' + codigo + ' tem mais níveis do que a máscara ' + L.mascara + '.' }); return; }
      for (let i = 0; i < partes.length; i++) {
        if (!/^[0-9]+$/.test(partes[i]) || partes[i].length !== L.tamanhos[i]) {
          problemas.push({ conta: codigo, texto: 'O centro ' + codigo + ' não bate com a máscara ' + L.mascara + '.' });
          return;
        }
      }
      if (por.has(codigo)) { problemas.push({ conta: codigo, texto: 'O centro ' + codigo + ' está repetido.' }); return; }
      const novo = { codigo, nome: texto(c.nome), nivel: partes.length, pai: paiDe(codigo, L),
        situacao: c.situacao === 'inativa' ? 'inativa' : 'ativa', observacao: texto(c.observacao), filhas: 0, analitica: true };
      if (!novo.nome) problemas.push({ conta: codigo, texto: 'O centro ' + codigo + ' está sem nome.' });
      por.set(codigo, novo);
      lista.push(novo);
    });
    lista.sort((a, b) => compararCodigos(a.codigo, b.codigo, L));
    lista.forEach((c) => {
      if (!c.pai) return;
      const mae = por.get(c.pai);
      if (!mae) { problemas.push({ conta: c.codigo, texto: 'Falta o centro de cima (' + c.pai + ').' }); return; }
      mae.filhas++;
      mae.analitica = false;
    });
    return { ok: !problemas.length, layout: L, centros: lista, porCodigo: por, problemas,
      total: lista.length, analiticos: lista.filter((c) => c.analitica).length };
  }

  // ------------------------------------------------------------------
  // NATUREZAS DE OPERAÇÃO — o que a nota é (venda, compra, devolução, remessa…), com o CFOP e o que ela
  // gera: estoque, financeiro e o lançamento contábil. É por aqui que a nota vira lançamento sozinha.
  // ------------------------------------------------------------------
  const FINALIDADES = [
    { id: 'venda', nome: 'Venda', lado: 'saida' },
    { id: 'compra', nome: 'Compra', lado: 'entrada' },
    { id: 'servico-prestado', nome: 'Serviço prestado', lado: 'saida' },
    { id: 'servico-tomado', nome: 'Serviço tomado', lado: 'entrada' },
    { id: 'devolucao-venda', nome: 'Devolução de venda', lado: 'entrada' },
    { id: 'devolucao-compra', nome: 'Devolução de compra', lado: 'saida' },
    { id: 'remessa', nome: 'Remessa', lado: 'saida' },
    { id: 'retorno', nome: 'Retorno', lado: 'entrada' },
    { id: 'transferencia', nome: 'Transferência', lado: 'saida' },
    { id: 'bonificacao', nome: 'Bonificação / brinde', lado: 'saida' },
    { id: 'imobilizado', nome: 'Compra de imobilizado', lado: 'entrada' },
    { id: 'outra', nome: 'Outra', lado: 'entrada' },
  ];
  const FINALIDADE = {};
  FINALIDADES.forEach((f) => { FINALIDADE[f.id] = f; });

  // Naturezas que todo mundo usa, para a lista não nascer vazia.
  const NATUREZAS_PADRAO = [
    { codigo: '1', nome: 'Venda de mercadoria', finalidade: 'venda', cfop: '5102', estoque: true, financeiro: true },
    { codigo: '2', nome: 'Venda de produção própria', finalidade: 'venda', cfop: '5101', estoque: true, financeiro: true },
    { codigo: '3', nome: 'Prestação de serviço', finalidade: 'servico-prestado', cfop: '5933', estoque: false, financeiro: true },
    { codigo: '4', nome: 'Compra para revenda', finalidade: 'compra', cfop: '1102', estoque: true, financeiro: true },
    { codigo: '5', nome: 'Compra de material de uso e consumo', finalidade: 'compra', cfop: '1556', estoque: false, financeiro: true },
    { codigo: '6', nome: 'Compra de imobilizado', finalidade: 'imobilizado', cfop: '1551', estoque: false, financeiro: true },
    { codigo: '7', nome: 'Serviço tomado', finalidade: 'servico-tomado', cfop: '1933', estoque: false, financeiro: true },
    { codigo: '8', nome: 'Devolução de venda', finalidade: 'devolucao-venda', cfop: '1202', estoque: true, financeiro: false },
    { codigo: '9', nome: 'Devolução de compra', finalidade: 'devolucao-compra', cfop: '5202', estoque: true, financeiro: false },
    { codigo: '10', nome: 'Transferência entre filiais', finalidade: 'transferencia', cfop: '5152', estoque: true, financeiro: false },
  ];

  function conferirNatureza(nat, outras, codigoAntigo) {
    const codigo = texto(nat && nat.codigo);
    if (!codigo) return { ok: false, erro: 'Escreva o código da natureza (1, 2, 101…).' };
    if (!/^[0-9A-Za-z.-]{1,10}$/.test(codigo)) return { ok: false, erro: 'O código da natureza tem no máximo 10 caracteres, sem espaço.' };
    if (!texto(nat.nome)) return { ok: false, erro: 'Escreva a descrição da natureza.' };
    const lista = (outras || []).filter((n) => texto(n.codigo) !== texto(codigoAntigo));
    if (lista.some((n) => texto(n.codigo) === codigo)) return { ok: false, erro: 'Já existe a natureza ' + codigo + '.' };
    if (lista.some((n) => chaveNome(n.nome) === chaveNome(nat.nome))) return { ok: false, erro: 'Já existe uma natureza com essa descrição.' };
    if (!FINALIDADE[nat.finalidade]) return { ok: false, erro: 'Escolha a finalidade (venda, compra, devolução…).' };
    const cfop = soDigitos(nat.cfop);
    if (cfop && cfop.length !== 4) return { ok: false, erro: 'O CFOP tem 4 números (por exemplo 5102).' };
    // O CFOP conta a história: 1/2/3 é entrada, 5/6/7 é saída. Se brigar com a finalidade, é engano de digitação.
    if (cfop) {
      const lado = '123'.indexOf(cfop[0]) >= 0 ? 'entrada' : '567'.indexOf(cfop[0]) >= 0 ? 'saida' : '';
      if (!lado) return { ok: false, erro: 'CFOP começa com 1, 2, 3 (entrada) ou 5, 6, 7 (saída).' };
      if (lado !== FINALIDADE[nat.finalidade].lado) {
        return { ok: false, erro: 'O CFOP ' + cfop + ' é de ' + (lado === 'entrada' ? 'ENTRADA' : 'SAÍDA') +
          ' e a finalidade "' + FINALIDADE[nat.finalidade].nome + '" é de ' + (FINALIDADE[nat.finalidade].lado === 'entrada' ? 'ENTRADA' : 'SAÍDA') + '.' };
      }
    }
    return { ok: true, natureza: {
      codigo, nome: texto(nat.nome), finalidade: nat.finalidade, cfop,
      estoque: !!nat.estoque, financeiro: !!nat.financeiro,
      contaDebito: texto(nat.contaDebito), contaCredito: texto(nat.contaCredito),
      situacao: nat.situacao === 'inativa' ? 'inativa' : 'ativa', observacao: texto(nat.observacao),
    } };
  }

  // A natureza aponta para contas do plano: se a conta não existe, ou é sintética, o lançamento não sai.
  function conferirNaturezas(naturezas, plano) {
    const problemas = [];
    const p = plano && plano.porCodigo ? plano : null;
    (naturezas || []).forEach((n) => {
      ['contaDebito', 'contaCredito'].forEach((campo) => {
        const cod = texto(n[campo]);
        if (!cod || !p) return;
        const c = p.porCodigo.get(cod);
        const qual = campo === 'contaDebito' ? 'de débito' : 'de crédito';
        if (!c) problemas.push({ conta: n.codigo, texto: 'A natureza ' + n.codigo + ' aponta para a conta ' + qual + ' ' + cod + ', que não está no plano.' });
        else if (!c.analitica) problemas.push({ conta: n.codigo, texto: 'A conta ' + qual + ' da natureza ' + n.codigo + ' (' + cod + ') é sintética: só conta analítica recebe lançamento.' });
      });
    });
    return problemas;
  }

  return {
    ESPECIES, ESPECIE, MODELOS, FINALIDADES, FINALIDADE, NATUREZAS_PADRAO,
    ehResultado, ehPatrimonial,
    lerMascara, mascaraDosCodigos, lerLayout, lerCodigo, paiDe, proximoCodigo, compararCodigos,
    montarPlano, conferirConta, podeExcluir,
    montarCentros,
    conferirNatureza, conferirNaturezas,
  };
});
