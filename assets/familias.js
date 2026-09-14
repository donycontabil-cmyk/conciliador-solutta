/*
 * Conciliador Solutta — familias.js
 * Famílias (Fornecedores, Clientes, Financeiro), papel de cada conta do razão e bancos.
 * Tudo aqui é CONFIGURÁVEL: é lista, não é código espalhado (Parte 7.0).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.Familias = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  // Bancos pelo nome ou pelo código (Parte 7.0).
  const BANCOS = [
    { nome: 'ITAU', codigo: '341', termos: ['ITAU'] },
    { nome: 'SANTANDER', codigo: '033', termos: ['SANTANDER'] },
    { nome: 'BRADESCO', codigo: '237', termos: ['BRADESCO'] },
    { nome: 'BANCO DO BRASIL', codigo: '001', termos: ['BANCO DO BRASIL', 'BB'] },
    { nome: 'CAIXA ECONOMICA', codigo: '104', termos: ['CAIXA ECONOMICA', 'CEF'] },
    { nome: 'SICOOB', codigo: '756', termos: ['SICOOB'] },
    { nome: 'SICREDI', codigo: '748', termos: ['SICREDI'] },
    { nome: 'NUBANK', codigo: '260', termos: ['NUBANK', 'NU PAGAMENTOS'] },
    { nome: 'INTER', codigo: '077', termos: ['BANCO INTER', 'INTER'] },
    { nome: 'C6', codigo: '336', termos: ['C6 BANK', 'C6'] },
    { nome: 'BTG', codigo: '208', termos: ['BTG'] },
    { nome: 'SAFRA', codigo: '422', termos: ['SAFRA'] },
    { nome: 'STONE', codigo: '197', termos: ['STONE'] },
    { nome: 'CORA', codigo: '403', termos: ['CORA'] },
    { nome: 'MERCADO PAGO', codigo: '323', termos: ['MERCADO PAGO', 'MERCADOPAGO'] },
    { nome: 'PAGBANK', codigo: '290', termos: ['PAGBANK', 'PAGSEGURO'] },
  ];

  function contem(nomeNormalizado, termo) {
    return (' ' + nomeNormalizado + ' ').indexOf(' ' + termo + ' ') >= 0;
  }

  function bancoDoNome(nome) {
    const n = Util.normalizarNome(nome);
    for (const b of BANCOS) {
      if (b.termos.some((t) => contem(n, t)) || contem(n, b.codigo)) return { nome: b.nome, codigo: b.codigo };
    }
    return null;
  }

  // Papel de cada conta do razão, pelo NOME e pela CLASSIFICAÇÃO (Parte 7.0).
  // Cada regra: { familia, papel, teste(nomeNormalizado, classificacao) }.
  // A primeira que servir decide. Acrescentar um caso = acrescentar uma linha.
  const REGRAS_DE_PAPEL = [
    { familia: 'fornecedores', papel: 'adiantamento', descricao: 'ADIANT + FORNEC',
      teste: (n) => /ADIANT/.test(n) && /FORNEC/.test(n) },
    { familia: 'clientes', papel: 'adiantamento', descricao: 'ADIANT + CLIENTE, RECEBIMENTOS ANTECIPADOS, ADIANTAMENTOS RECEBIDOS',
      teste: (n) => (/ADIANT/.test(n) && /CLIENTE/.test(n)) || /RECEBIMENTOS? ANTECIPADOS?/.test(n) || /ADIANTAMENTOS? RECEBIDOS?/.test(n) },
    { familia: 'fornecedores', papel: 'principal', descricao: 'FORNECEDOR sem ADIANT',
      teste: (n) => /FORNECEDOR/.test(n) && !/ADIANT/.test(n) },
    { familia: 'clientes', papel: 'principal', descricao: 'no ativo, sem ADIANT: CLIENTE, MENSALIDADE, DUPLICATAS/CONTAS/TITULOS A RECEBER',
      teste: (n, c) => ativo(c) && !/ADIANT/.test(n) &&
        (/CLIENTE/.test(n) || /MENSALIDADE/.test(n) || /(DUPLICATAS|CONTAS|TITULOS) A RECEBER/.test(n)) },
    { familia: 'financeiro', papel: 'banco', descricao: 'no ativo, nome de banco ou CONTA MOVIMENTO / CONTA CORRENTE / C/C, sem aplicação',
      teste: (n, c) => ativo(c) && !/(APLICACAO|INVESTIMENTO|POUPANCA|GARANTIDA)/.test(n) &&
        (bancoDoNome(n) !== null || /BANCOS? CONTA MOVIMENTO/.test(n) || /CONTA CORRENTE/.test(n) || contem(n, 'C C')) },
  ];

  function ativo(classificacao) { return /^1/.test(String(classificacao || '').trim()); }

  function papelDaConta(conta) {
    const nome = Util.normalizarNome(conta && conta.nome);
    const classif = conta && conta.classificacao;
    for (const r of REGRAS_DE_PAPEL) {
      if (r.teste(nome, classif)) {
        const papel = { familia: r.familia, papel: r.papel, regra: r.descricao, banco: null };
        if (r.papel === 'banco') papel.banco = bancoDoNome(nome);
        return papel;
      }
    }
    // Conta de banco no PASSIVO é cheque especial e fica fora.
    if (bancoDoNome(nome) && /^2/.test(String(classif || ''))) {
      return { familia: null, papel: null, regra: 'conta de banco no passivo (cheque especial): fica fora', banco: null };
    }
    return { familia: null, papel: null, regra: 'nenhuma conciliação usa esta conta', banco: null };
  }

  // Famílias e passos. Estado "construido" diz o que já funciona nesta etapa.
  const FAMILIAS = [
    {
      id: 'fornecedores', titulo: 'Fornecedores', icone: '📦',
      texto: 'Fornecedores a pagar, adiantamentos a fornecedores e o contas a pagar do financeiro.',
      checklist: [
        { id: 'bancos', texto: 'Conferi que todos os bancos foram conciliados (extrato × contabilidade de cada conta bancária da competência).' },
        { id: 'notas', texto: 'Conferi que todas as notas fiscais de entrada subiram (livro fiscal × contabilidade).' },
      ],
      passos: [
        { id: 'passo1', numero: '①', tipo: 'fornecedor_adiantamento', titulo: 'Fornecedores × Adiantamento',
          texto: 'Mata o que bate dentro de cada razão e sugere as reclassificações entre fornecedores e adiantamento.',
          precisa: [{ papel: 'principal', texto: 'Razão de fornecedores' }, { papel: 'adiantamento', texto: 'Razão de adiantamento a fornecedores' }],
          opcional: [{ tipo: 'financeiro_pagar', texto: 'Contas a pagar em aberto (ajuda a reconhecer nomes)' }],
          construido: true },
        { id: 'passo11', numero: '1.1', tipo: 'fornecedor_conferencia_ajustes', titulo: 'Os ajustes subiram certo?',
          texto: 'Confere no razão novo se cada ajuste do ① entrou com valor, data e contas certas.', construido: false, etapa: 2 },
        { id: 'passo12', numero: '1.2', tipo: 'fornecedor_auditoria_razao', titulo: 'Auditoria do razão',
          texto: 'Guarda o razão final congelado e avisa quando alguém mexe num mês já fechado.', construido: false, etapa: 2 },
        { id: 'passo2', numero: '②', tipo: 'adiantamento_financeiro', titulo: 'Adiantamento × financeiro',
          texto: 'Confronta o adiantamento com o relatório de adiantamentos do financeiro. Regra a definir com o Dony.', construido: false, etapa: 2 },
        { id: 'passo3', numero: '③', tipo: 'fornecedor_pagar', titulo: 'Fornecedores × contas a pagar',
          texto: 'Bate o saldo de cada fornecedor com os títulos em aberto do financeiro no fim do mês.', construido: false, etapa: 2 },
      ],
    },
    {
      id: 'clientes', titulo: 'Clientes · contas a receber', icone: '🧾',
      texto: 'O espelho de Fornecedores: clientes, adiantamentos de clientes e contas a receber.',
      passos: [], construido: false, etapa: 3,
    },
    {
      id: 'financeiro', titulo: 'Financeiro', icone: '🏦',
      texto: 'Auditoria de cada banco: extrato × contabilidade × movimento do financeiro.',
      passos: [], construido: false, etapa: 3,
    },
  ];

  function familia(id) { return FAMILIAS.find((f) => f.id === id) || null; }

  return { BANCOS, REGRAS_DE_PAPEL, FAMILIAS, familia, papelDaConta, bancoDoNome };
});
