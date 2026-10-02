/*
 * Conciliador Solutta — motor-entregas.js
 * CONTROLE DE ENTREGAS (Dony, 02/10/2026: "quero que você crie um novo menu chamado Controle de entregas").
 * Ele escolheu as três coisas de uma vez: o que vai para o FISCO, o que o escritório ENTREGA ao cliente e o
 * que o cliente TEM QUE MANDAR — e que a lista de cada empresa saia sozinha pelo regime dela.
 *
 * Só regra, sem tela e sem armazenamento: o catálogo sugerido, o cálculo do vencimento de cada competência
 * e a situação (no prazo, vence hoje, atrasada, entregue, dispensada).
 *
 * AVISO QUE VALE OURO: os prazos aqui são os USUAIS, de sugestão, e mudam por norma, por estado e por
 * regime. Cada um é editável na tela, e a tela diz isso. Quem confere o prazo é o contador — o programa só
 * não deixa a data passar batida.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.MotorEntregas = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const texto = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();

  const CATEGORIAS = [
    { id: 'fisco', nome: 'Obrigação ao fisco', curto: 'Fisco', icone: '🏛️', ajuda: 'o que o escritório entrega ao governo' },
    { id: 'cliente', nome: 'Entrega ao cliente', curto: 'Cliente', icone: '📤', ajuda: 'o que o escritório manda para a empresa' },
    { id: 'documento', nome: 'Documento do cliente', curto: 'Documento', icone: '📥', ajuda: 'o que a empresa tem que mandar para o escritório' },
  ];
  const PERIODICIDADES = [
    { id: 'mensal', nome: 'Mensal', meses: 1 },
    { id: 'trimestral', nome: 'Trimestral', meses: 3 },
    { id: 'anual', nome: 'Anual', meses: 12 },
    { id: 'eventual', nome: 'Eventual (só quando acontecer)', meses: 0 },
  ];
  // Os regimes são os mesmos do cadastro da empresa (tela-carteira.js).
  const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'Imune / Isenta', 'Outro'];
  const TODOS = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'Imune / Isenta', 'Outro'];
  const SEM_MEI = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Imune / Isenta', 'Outro'];
  const NORMAL = ['Lucro Presumido', 'Lucro Real'];

  // ------------------------------------------------------------------
  // O CATÁLOGO SUGERIDO. prazo:
  //   { tipo: 'mes-seguinte', dia: 15, meses: 1 }  dia 15 do mês seguinte à competência (meses: quantos à frente)
  //   { tipo: 'data-fixa', dia: 31, mes: 5 }       data fixa do ano seguinte ao exercício (declarações anuais)
  //   { tipo: 'combinado', dia: 10 }               combinado com o cliente, dia do mês seguinte
  // regimes: para quais vale (vazio = todos). obrigatorio: nasce ligada na empresa.
  // ------------------------------------------------------------------
  const CATALOGO = [
    // --- FISCO (prazos usuais; confira a norma e o seu estado) -------------------------------------
    { id: 'esocial', nome: 'eSocial', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 15, meses: 1 }, regimes: TODOS,
      observacao: 'Folha do mês. Prazo usual: dia 15 do mês seguinte.' },
    { id: 'reinf', nome: 'EFD-Reinf', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 15, meses: 1 }, regimes: SEM_MEI,
      observacao: 'Retenções. Prazo usual: dia 15 do mês seguinte.' },
    { id: 'dctfweb', nome: 'DCTFWeb', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 25, meses: 1 }, regimes: SEM_MEI,
      observacao: 'Confira o prazo do seu caso: ele mudou nos últimos anos.' },
    { id: 'efd-icms', nome: 'EFD ICMS/IPI (SPED Fiscal)', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 20, meses: 1 }, regimes: NORMAL,
      observacao: 'O dia muda de estado para estado — ajuste para a UF da empresa.' },
    { id: 'efd-contrib', nome: 'EFD-Contribuições', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 10, meses: 2 }, regimes: NORMAL,
      observacao: 'Prazo usual: dia 10 do SEGUNDO mês seguinte.' },
    { id: 'pgdas', nome: 'PGDAS-D (apuração do Simples)', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 20, meses: 1 }, regimes: ['Simples Nacional'],
      observacao: 'Apuração e DAS do Simples.' },
    { id: 'das-mei', nome: 'DAS do MEI', categoria: 'fisco', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 20, meses: 1 }, regimes: ['MEI'] },
    { id: 'defis', nome: 'DEFIS', categoria: 'fisco', periodicidade: 'anual', prazo: { tipo: 'data-fixa', dia: 31, mes: 3 }, regimes: ['Simples Nacional'],
      observacao: 'Do ano anterior. Prazo usual: 31 de março.' },
    { id: 'dasn-mei', nome: 'DASN-SIMEI', categoria: 'fisco', periodicidade: 'anual', prazo: { tipo: 'data-fixa', dia: 31, mes: 5 }, regimes: ['MEI'],
      observacao: 'Declaração anual do MEI. Prazo usual: 31 de maio.' },
    { id: 'ecd', nome: 'ECD (escrituração contábil digital)', categoria: 'fisco', periodicidade: 'anual', prazo: { tipo: 'data-fixa', dia: 31, mes: 5 }, regimes: SEM_MEI,
      observacao: 'Do exercício anterior. Prazo usual: último dia útil de maio.' },
    { id: 'ecf', nome: 'ECF (escrituração contábil fiscal)', categoria: 'fisco', periodicidade: 'anual', prazo: { tipo: 'data-fixa', dia: 31, mes: 7 }, regimes: SEM_MEI,
      observacao: 'Do exercício anterior. Prazo usual: último dia útil de julho.' },
    // --- O QUE O ESCRITÓRIO ENTREGA AO CLIENTE -----------------------------------------------------
    { id: 'guias', nome: 'Guias de impostos', categoria: 'cliente', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 10, meses: 1 }, regimes: TODOS },
    { id: 'folha-cliente', nome: 'Folha de pagamento e holerites', categoria: 'cliente', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 1, meses: 1 }, regimes: TODOS,
      observacao: 'Costuma ir antes do fim do mês trabalhado — ajuste o dia ao combinado.' },
    { id: 'balancete-cliente', nome: 'Balancete do mês', categoria: 'cliente', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 20, meses: 1 }, regimes: SEM_MEI },
    { id: 'relatorio-cliente', nome: 'Relatório de apresentação (balanço, DRE e fluxo)', categoria: 'cliente', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 25, meses: 1 }, regimes: SEM_MEI,
      observacao: 'O relatório que o programa monta na tela de Apresentação.' },
    // --- O QUE O CLIENTE TEM QUE MANDAR ------------------------------------------------------------
    { id: 'notas-saida', nome: 'Notas de saída', categoria: 'documento', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 5, meses: 1 }, regimes: TODOS },
    { id: 'notas-entrada', nome: 'Notas de entrada', categoria: 'documento', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 5, meses: 1 }, regimes: TODOS },
    { id: 'extratos', nome: 'Extratos bancários', categoria: 'documento', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 5, meses: 1 }, regimes: TODOS,
      observacao: 'Sem o extrato não fecha a conciliação do mês.' },
    { id: 'folha-ponto', nome: 'Ponto e informações da folha', categoria: 'documento', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 1, meses: 0 }, regimes: TODOS,
      observacao: 'Chega ainda dentro do mês trabalhado; ajuste ao combinado.' },
    { id: 'documentos-diversos', nome: 'Outros documentos do mês', categoria: 'documento', periodicidade: 'mensal', prazo: { tipo: 'mes-seguinte', dia: 10, meses: 1 }, regimes: TODOS },
  ];

  const porCategoria = (id) => CATALOGO.filter((t) => t.categoria === id);
  const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || CATEGORIAS[0];
  const periodicidade = (id) => PERIODICIDADES.find((p) => p.id === id) || PERIODICIDADES[0];

  // As entregas sugeridas para uma empresa, pelo REGIME dela (Dony escolheu assim). Regime em branco: só o
  // que vale para todos, para não encher a tela de obrigação que talvez não seja dela.
  function tiposDaEmpresa(empresa, tipos) {
    const lista = (tipos && tipos.length ? tipos : CATALOGO).filter((t) => t.situacao !== 'inativa');
    const regime = texto(empresa && empresa.regime);
    const escolhas = (empresa && empresa.entregas) || {};   // { idDoTipo: true | false } — o ajuste dele
    return lista.filter((t) => {
      if (escolhas[t.id] === true) return true;
      if (escolhas[t.id] === false) return false;
      const regimes = t.regimes && t.regimes.length ? t.regimes : TODOS;
      return regime ? regimes.indexOf(regime) >= 0 : regimes.length === TODOS.length;
    });
  }

  // ------------------------------------------------------------------
  // QUANDO VENCE. competência: 'AAAA-MM-01' (mensal/trimestral) ou 'AAAA' (anual).
  // ------------------------------------------------------------------
  function vencimento(tipo, competencia) {
    const p = tipo && tipo.prazo;
    if (!p) return null;
    if (p.tipo === 'data-fixa') {
      // Declaração anual: a competência é o exercício e o prazo cai no ano seguinte.
      const ano = Number(String(competencia).slice(0, 4));
      if (!ano) return null;
      const mes = Number(p.mes) || 12;
      const ultimo = new Date(Date.UTC(ano + 1, mes, 0)).getUTCDate();
      return Util.montarData(Math.min(Number(p.dia) || ultimo, ultimo), mes, ano + 1);
    }
    const partes = Util.partesCompetencia(competencia);
    if (!partes) return null;
    const quantos = p.meses === undefined || p.meses === null ? 1 : Number(p.meses);
    const alvo = Util.partesCompetencia(Util.somarMeses(Util.competenciaDe({ ano: partes.ano, mes: partes.mes }), quantos));
    const ultimo = new Date(Date.UTC(alvo.ano, alvo.mes, 0)).getUTCDate();
    return Util.montarData(Math.min(Number(p.dia) || ultimo, ultimo), alvo.mes, alvo.ano);
  }

  // As competências de um ano, conforme a periodicidade (é o que vira coluna na tela).
  function competenciasDoAno(tipo, ano) {
    const per = periodicidade(tipo.periodicidade).id;
    if (per === 'anual') return [String(ano)];
    if (per === 'eventual') return [];
    const passo = per === 'trimestral' ? 3 : 1;
    const lista = [];
    for (let m = passo; m <= 12; m += passo) lista.push(ano + '-' + String(m).padStart(2, '0') + '-01');
    return lista;
  }

  // ------------------------------------------------------------------
  // A SITUAÇÃO de uma entrega. marca: { situacao: 'entregue'|'dispensada', data, por, protocolo, observacao }
  // Devolve { estado, rotulo, cor, dias, vence }:
  //   entregue | dispensada | atrasada | vence-hoje | no-prazo | sem-prazo
  // ------------------------------------------------------------------
  function situacao(tipo, competencia, marca, hoje) {
    const vence = vencimento(tipo, competencia);
    const dia = hoje || Util.hoje();
    const m = marca || {};
    if (m.situacao === 'entregue') {
      const quando = Util.lerData(m.data);
      const atraso = quando && vence ? quando.numero - vence.numero : 0;
      return { estado: 'entregue', rotulo: 'entregue' + (atraso > 0 ? ' com ' + atraso + ' dia(s) de atraso' : ''),
        cor: atraso > 0 ? 'ambar' : 'verde', dias: atraso, vence, em: quando };
    }
    if (m.situacao === 'dispensada') return { estado: 'dispensada', rotulo: 'dispensada', cor: 'cinza', dias: 0, vence };
    if (!vence) return { estado: 'sem-prazo', rotulo: 'sem prazo', cor: 'cinza', dias: 0, vence: null };
    const faltam = vence.numero - dia.numero;
    if (faltam < 0) return { estado: 'atrasada', rotulo: 'atrasada há ' + (-faltam) + ' dia(s)', cor: 'vermelho', dias: faltam, vence };
    if (faltam === 0) return { estado: 'vence-hoje', rotulo: 'vence hoje', cor: 'ambar', dias: 0, vence };
    return { estado: 'no-prazo', rotulo: 'vence em ' + faltam + ' dia(s)', cor: faltam <= 3 ? 'ambar' : 'cinza', dias: faltam, vence };
  }

  // O painel de um mês: uma linha por empresa, uma coluna por tipo, com a situação de cada cruzamento.
  // marcas: { '<código da empresa>': { '<idDoTipo>|<competência>': marca } }
  function painel(empresas, tipos, competencia, marcas, op) {
    const opc = op || {};
    const hoje = opc.hoje || Util.hoje();
    const soCategoria = opc.categoria || '';
    const linhas = (empresas || []).map((e) => {
      const meus = tiposDaEmpresa(e, tipos).filter((t) => !soCategoria || t.categoria === soCategoria);
      const daEmpresa = (marcas && marcas[String(e.codigo)]) || {};
      const celulas = meus.map((t) => {
        const comp = t.periodicidade === 'anual' ? String(Util.partesCompetencia(competencia).ano - 1) : competencia;
        const marca = daEmpresa[t.id + '|' + comp] || null;
        return Object.assign({ tipo: t, competencia: comp, marca }, situacao(t, comp, marca, hoje));
      });
      const conta = (e2) => celulas.filter((c) => c.estado === e2).length;
      return { empresa: e, celulas,
        entregues: conta('entregue') + conta('dispensada'),
        atrasadas: conta('atrasada'),
        venceHoje: conta('vence-hoje'),
        total: celulas.length };
    });
    const soma = (campo) => linhas.reduce((s, l) => s + l[campo], 0);
    return { competencia, linhas, tipos: tiposDaEmpresa((empresas || [])[0] || {}, tipos),
      resumo: { empresas: linhas.length, total: soma('total'), entregues: soma('entregues'), atrasadas: soma('atrasadas'), venceHoje: soma('venceHoje') } };
  }

  // O ano inteiro de UMA empresa: uma linha por tipo, uma coluna por competência.
  function doAno(empresa, tipos, ano, marcasDaEmpresa, op) {
    const hoje = (op && op.hoje) || Util.hoje();
    const marcas = marcasDaEmpresa || {};
    return tiposDaEmpresa(empresa, tipos).map((t) => {
      const comps = competenciasDoAno(t, Number(ano));
      return { tipo: t, celulas: comps.map((comp) => {
        const marca = marcas[t.id + '|' + comp] || null;
        return Object.assign({ tipo: t, competencia: comp, marca }, situacao(t, comp, marca, hoje));
      }) };
    });
  }

  // Um tipo novo ou editado, antes de entrar na lista.
  function conferirTipo(tipo, outros, idAntigo) {
    const nome = texto(tipo && tipo.nome);
    if (!nome) return { ok: false, erro: 'Escreva o nome da entrega.' };
    const id = texto(tipo.id) || Util.semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
    if (!id) return { ok: false, erro: 'O nome precisa ter letras ou números.' };
    const lista = (outros || []).filter((t) => t.id !== idAntigo);
    if (lista.some((t) => t.id === id)) return { ok: false, erro: 'Já existe uma entrega com esse nome.' };
    if (!categoria(tipo.categoria) || !CATEGORIAS.some((c) => c.id === tipo.categoria)) return { ok: false, erro: 'Escolha se é obrigação ao fisco, entrega ao cliente ou documento do cliente.' };
    if (!PERIODICIDADES.some((p) => p.id === tipo.periodicidade)) return { ok: false, erro: 'Escolha a periodicidade.' };
    const p = tipo.prazo || {};
    const dia = Number(p.dia);
    if (tipo.periodicidade !== 'eventual') {
      if (!(dia >= 1 && dia <= 31)) return { ok: false, erro: 'O dia do prazo vai de 1 a 31.' };
      if (p.tipo === 'data-fixa' && !(Number(p.mes) >= 1 && Number(p.mes) <= 12)) return { ok: false, erro: 'Escolha o mês do prazo.' };
    }
    const regimes = (tipo.regimes || []).filter((r) => REGIMES.indexOf(r) >= 0);
    return { ok: true, tipo: {
      id, nome, categoria: tipo.categoria, periodicidade: tipo.periodicidade,
      prazo: tipo.periodicidade === 'eventual' ? null
        : (tipo.periodicidade === 'anual' ? { tipo: 'data-fixa', dia, mes: Number(p.mes) || 12 } : { tipo: 'mes-seguinte', dia, meses: Number(p.meses) || 0 }),
      regimes, situacao: tipo.situacao === 'inativa' ? 'inativa' : 'ativa', observacao: texto(tipo.observacao),
    } };
  }

  // Como o prazo aparece escrito na tela.
  function prazoEmPalavras(tipo) {
    const p = tipo && tipo.prazo;
    if (!p) return 'sem prazo';
    if (p.tipo === 'data-fixa') return 'dia ' + p.dia + ' de ' + Util.MESES[(Number(p.mes) || 12) - 1] + ' do ano seguinte';
    const n = p.meses === undefined || p.meses === null ? 1 : Number(p.meses);
    if (n === 0) return 'dia ' + p.dia + ' do próprio mês';
    if (n === 1) return 'dia ' + p.dia + ' do mês seguinte';
    return 'dia ' + p.dia + ' do ' + n + 'º mês seguinte';
  }

  return { CATEGORIAS, PERIODICIDADES, REGIMES, CATALOGO,
    categoria, periodicidade, porCategoria, tiposDaEmpresa,
    vencimento, competenciasDoAno, situacao, painel, doAno, conferirTipo, prazoEmPalavras };
});
