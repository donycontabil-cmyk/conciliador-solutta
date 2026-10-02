/*
 * Conciliador Solutta — motor-entregas.js
 * CONTROLE DE ENTREGAS / OBRIGAÇÕES. Dony, 02/10/2026: "é um controle do que foi entregue. Por exemplo,
 * poder controlar ECD, ECF, IBGE, MIT, essas coisas, entendeu?" — e mandou os prints do sistema que ele usa.
 *
 * O desenho é o dele: escolhe-se UMA OBRIGAÇÃO ("ECF 2026", "Fechamento Contábil 08/2026") e aparece a
 * CARTEIRA INTEIRA dentro dela, uma empresa por linha, com responsável, situação, validação e observação.
 * Cada obrigação tem a sua competência, o seu vencimento e a META DE ENTREGA (a data interna do escritório,
 * sempre antes do prazo legal).
 *
 * Só regra: nada de tela nem de armazenamento.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.MotorEntregas = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const texto = (v) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const chave = (v) => Util.semAcento(texto(v)).toUpperCase();

  // A situação de cada empresa dentro da obrigação (a coluna Status).
  const STATUS = [
    { id: 'pendente', nome: 'Pendente', cor: 'cinza', feito: false },
    { id: 'andamento', nome: 'Em andamento', cor: 'ambar', feito: false },
    { id: 'entregue', nome: 'Entregue', cor: 'verde', feito: true },
    { id: 'nao-se-aplica', nome: 'Não se aplica', cor: 'cinza', feito: true },
  ];
  const status = (id) => STATUS.find((s) => s.id === id) || STATUS[0];

  // Modelos para criar a obrigação em dois cliques, já com o prazo usual. CONFIRA os prazos: eles mudam
  // por norma, por estado e por regime — aqui é só para não digitar tudo do zero.
  const MODELOS = [
    { id: 'ecd', nome: 'ECD', ajuda: 'Escrituração Contábil Digital', anual: true, dia: 31, mes: 5, competencia: 'exercício' },
    { id: 'ecf', nome: 'ECF', ajuda: 'Escrituração Contábil Fiscal', anual: true, dia: 31, mes: 7, competencia: 'exercício' },
    { id: 'ibge', nome: 'IBGE', ajuda: 'Pesquisas do IBGE', anual: true, dia: 31, mes: 12, competencia: 'exercício' },
    { id: 'mit', nome: 'MIT', ajuda: 'Módulo de Inclusão de Tributos (DCTFWeb)', anual: false, dia: 25, competencia: 'mês' },
    { id: 'fechamento', nome: 'Fechamento Contábil', ajuda: 'O fechamento do mês', anual: false, dia: 25, competencia: 'mês' },
    { id: 'defis', nome: 'DEFIS', ajuda: 'Declaração do Simples', anual: true, dia: 31, mes: 3, competencia: 'exercício' },
    { id: 'dasn', nome: 'DASN-SIMEI', ajuda: 'Declaração anual do MEI', anual: true, dia: 31, mes: 5, competencia: 'exercício' },
    { id: 'esocial', nome: 'eSocial', ajuda: 'Folha do mês', anual: false, dia: 15, competencia: 'mês' },
    { id: 'reinf', nome: 'EFD-Reinf', ajuda: 'Retenções', anual: false, dia: 15, competencia: 'mês' },
    { id: 'dctfweb', nome: 'DCTFWeb', ajuda: '', anual: false, dia: 25, competencia: 'mês' },
    { id: 'sped-fiscal', nome: 'EFD ICMS/IPI', ajuda: 'SPED Fiscal (o dia muda por estado)', anual: false, dia: 20, competencia: 'mês' },
    { id: 'contrib', nome: 'EFD-Contribuições', ajuda: '', anual: false, dia: 10, meses: 2, competencia: 'mês' },
    { id: 'balancete', nome: 'Balancete', ajuda: 'Entrega ao cliente', anual: false, dia: 20, competencia: 'mês' },
    { id: 'outra', nome: 'Outra', ajuda: 'Escreva o nome', anual: false, dia: 20, competencia: 'livre' },
  ];
  const modelo = (id) => MODELOS.find((m) => m.id === id) || null;

  // Sugere nome, competência e vencimento quando ele escolhe um modelo — ele ajusta tudo na janela.
  function sugerir(idModelo, ano, mes) {
    const m = modelo(idModelo);
    const hoje = Util.hoje();
    const a = Number(ano) || hoje.ano;
    if (!m) return { nome: '', competencia: '', vencimento: '', meta: '' };
    if (m.anual) {
      // Anual: a obrigação é do ano em que se entrega e a competência é o exercício anterior.
      const venc = Util.montarData(Math.min(m.dia, new Date(Date.UTC(a, m.mes, 0)).getUTCDate()), m.mes, a);
      return { nome: m.nome + ' ' + a, competencia: String(a - 1), vencimento: venc ? venc.texto : '', meta: tirarDias(venc, 3) };
    }
    const mm = Number(mes) || hoje.mes;
    const comp = String(mm).padStart(2, '0') + '/' + a;
    const adiante = Number(m.meses || 1);
    const total = a * 12 + (mm - 1) + adiante;
    const anoV = Math.floor(total / 12), mesV = (total % 12) + 1;
    const venc = Util.montarData(Math.min(m.dia, new Date(Date.UTC(anoV, mesV, 0)).getUTCDate()), mesV, anoV);
    return { nome: m.nome + ' ' + comp, competencia: comp, vencimento: venc ? venc.texto : '', meta: tirarDias(venc, 3) };
  }
  function tirarDias(data, n) {
    if (!data) return '';
    const d = Util.dataDeNumero(data.numero - n);
    return d ? d.texto : '';
  }

  function conferirObrigacao(ob, outras, idAntigo) {
    const nome = texto(ob && ob.nome);
    if (!nome) return { ok: false, erro: 'Escreva o nome da obrigação (ECD 2026, Fechamento Contábil 08/2026…).' };
    const id = texto(ob.id) || Util.semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38);
    if (!id) return { ok: false, erro: 'O nome precisa ter letras ou números.' };
    const lista = (outras || []).filter((x) => x.id !== idAntigo);
    if (lista.some((x) => x.id === id)) return { ok: false, erro: 'Já existe uma obrigação com esse nome.' };
    const venc = Util.lerData(ob.vencimento);
    if (ob.vencimento && !venc) return { ok: false, erro: 'Vencimento inválido: escreva dd/mm/aaaa.' };
    const meta = Util.lerData(ob.meta);
    if (ob.meta && !meta) return { ok: false, erro: 'Meta de entrega inválida: escreva dd/mm/aaaa.' };
    if (venc && meta && meta.numero > venc.numero) return { ok: false, erro: 'A meta de entrega é a data interna: ela vem ANTES do vencimento.' };
    return { ok: true, obrigacao: {
      id, nome, competencia: texto(ob.competencia), vencimento: venc ? venc.texto : '', meta: meta ? meta.texto : '',
      modelo: texto(ob.modelo), regimes: Array.isArray(ob.regimes) ? ob.regimes.slice() : [],
      situacao: ob.situacao === 'encerrada' ? 'encerrada' : 'aberta', observacao: texto(ob.observacao),
    } };
  }

  // Quanto falta (ou passou) para o vencimento e para a meta.
  function prazo(obrigacao, hoje) {
    const dia = hoje || Util.hoje();
    const venc = Util.lerData(obrigacao && obrigacao.vencimento);
    const meta = Util.lerData(obrigacao && obrigacao.meta);
    return {
      vencimento: venc, meta,
      diasVencimento: venc ? venc.numero - dia.numero : null,
      diasMeta: meta ? meta.numero - dia.numero : null,
      venceu: venc ? venc.numero < dia.numero : false,
      passouDaMeta: meta ? meta.numero < dia.numero : false,
    };
  }

  // ------------------------------------------------------------------
  // AS LINHAS: uma empresa por linha, como nos prints dele.
  // dados: { '<código da empresa>': { status, responsavel, regime, validada, validadoPor, validadoEm,
  //                                   observacoes, entregueEm, arquivos } }
  // ------------------------------------------------------------------
  function linhas(empresas, obrigacao, dados, op) {
    const d = dados || {};
    const hoje = (op && op.hoje) || Util.hoje();
    const p = prazo(obrigacao, hoje);
    return (empresas || []).filter((e) => !e.ehGrupo).map((e) => {
      const linha = d[String(e.codigo)] || {};
      const st = status(linha.status);
      // Sem entregar e o prazo já passou: é atraso — é a coluna que ele olha primeiro.
      const atrasada = !st.feito && p.venceu;
      const correndo = !st.feito && !p.venceu && p.passouDaMeta;
      return {
        codigo: String(e.codigo), empresa: e,
        bpo: texto(e.bpo), celula: texto(e.celula), grupo: texto(e.grupo),
        nome: texto(e.nome), cnpj: texto(e.cnpj),
        regime: texto(linha.regime) || texto(e.regime),
        regimeDaLinha: !!texto(linha.regime),
        responsavel: texto(linha.responsavel),
        status: st.id, statusNome: st.nome, statusCor: atrasada ? 'vermelho' : st.cor, feito: st.feito,
        atrasada, correndo,
        validada: !!linha.validada, validadoPor: texto(linha.validadoPor), validadoEm: texto(linha.validadoEm),
        entregueEm: texto(linha.entregueEm), observacoes: texto(linha.observacoes),
        arquivos: Number(linha.arquivos) || 0,
      };
    });
  }

  function resumo(lista, obrigacao, hoje) {
    const p = prazo(obrigacao, hoje);
    const conta = (f) => lista.filter(f).length;
    return {
      total: lista.length,
      entregues: conta((l) => l.status === 'entregue'),
      naoSeAplica: conta((l) => l.status === 'nao-se-aplica'),
      andamento: conta((l) => l.status === 'andamento'),
      pendentes: conta((l) => !l.feito),
      atrasadas: conta((l) => l.atrasada),
      validadas: conta((l) => l.validada),
      semResponsavel: conta((l) => !l.responsavel),
      prazo: p,
    };
  }

  // A busca geral e os filtros das colunas, como na barra do print.
  function filtrar(lista, f) {
    const q = chave((f && f.busca) || '');
    const igual = (valor, alvo) => !alvo || chave(valor) === chave(alvo);
    return (lista || []).filter((l) => {
      if (q && [l.nome, l.codigo, l.cnpj, l.grupo, l.celula, l.bpo, l.responsavel, l.observacoes, l.regime]
        .every((x) => chave(x).indexOf(q) < 0)) return false;
      if (!igual(l.bpo, f && f.bpo) || !igual(l.celula, f && f.celula) || !igual(l.grupo, f && f.grupo)) return false;
      if (!igual(l.responsavel, f && f.responsavel) || !igual(l.regime, f && f.regime)) return false;
      if (f && f.status && l.status !== f.status) return false;
      if (f && f.validada === 'sim' && !l.validada) return false;
      if (f && f.validada === 'nao' && l.validada) return false;
      if (f && f.so === 'atrasadas' && !l.atrasada) return false;
      if (f && f.so === 'pendentes' && l.feito) return false;
      if (f && f.so === 'sem-responsavel' && l.responsavel) return false;
      return true;
    });
  }

  const ORDENAVEIS = ['bpo', 'celula', 'grupo', 'nome', 'codigo', 'cnpj', 'regime', 'responsavel', 'statusNome', 'validada', 'validadoPor', 'validadoEm', 'observacoes'];
  function ordenar(lista, coluna, desc) {
    const c = ORDENAVEIS.indexOf(coluna) >= 0 ? coluna : 'nome';
    const valor = (l) => (c === 'validada' ? (l.validada ? '1' : '0') : chave(l[c]));
    return (lista || []).slice().sort((a, b) => {
      const x = valor(a), y = valor(b);
      if (x === y) return chave(a.nome).localeCompare(chave(b.nome), 'pt-BR');
      // Vazio sempre por último, qualquer que seja a ordem: linha sem preencher não pode liderar a lista.
      if (!x) return 1;
      if (!y) return -1;
      return (desc ? -1 : 1) * x.localeCompare(y, 'pt-BR', { numeric: true });
    });
  }

  // Os valores que já aparecem numa coluna (enchem os filtros e as sugestões de digitação).
  function valoresDe(lista, campo) {
    const vistos = new Map();
    (lista || []).forEach((l) => { const v = texto(l[campo]); if (v && !vistos.has(chave(v))) vistos.set(chave(v), v); });
    return Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // O que vai gravado quando ele mexe numa linha. A validação carimba quem e quando.
  function mudarLinha(linhaGuardada, campo, valor, quem) {
    const nova = Object.assign({}, linhaGuardada || {});
    if (campo === 'status') {
      nova.status = status(valor).id;
      if (nova.status === 'entregue' && !nova.entregueEm) nova.entregueEm = Util.hoje().texto;
      if (nova.status !== 'entregue') delete nova.entregueEm;
      // Mudou o que foi entregue: a validação anterior não vale mais.
      if (nova.validada) { nova.validada = false; delete nova.validadoPor; delete nova.validadoEm; }
    } else if (campo === 'validada') {
      nova.validada = !!valor;
      if (nova.validada) { nova.validadoPor = texto(quem); nova.validadoEm = Util.agoraISO(); }
      else { delete nova.validadoPor; delete nova.validadoEm; }
    } else if (['responsavel', 'observacoes', 'regime'].indexOf(campo) >= 0) {
      const v = texto(valor);
      if (v) nova[campo] = v; else delete nova[campo];
    }
    return nova;
  }

  return { STATUS, status, MODELOS, modelo, sugerir, conferirObrigacao, prazo, linhas, resumo, filtrar, ordenar, ORDENAVEIS, valoresDe, mudarLinha };
});
