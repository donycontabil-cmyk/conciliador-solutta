/*
 * ERP Solutta — erp-dados.js
 * A PORTA DE SAÍDA dos dados do ERP. Dony, 01/10/2026: "ele vai começar aqui dentro do conciliador, e depois
 * vamos deixar ele independente, tem como?" — tem, e é por causa deste arquivo.
 *
 * Todo o ERP guarda e lê passando por aqui. Por dentro, hoje, ele usa a pasta de dados do Conciliador
 * (empresas/<código>/erp/<tabela>.json). No dia em que o ERP virar programa próprio, troca-se SÓ este
 * arquivo — por um que fale com o servidor, com um banco ou com outra pasta — e o resto do ERP nem fica
 * sabendo. É o mesmo truque do armazenamento do Conciliador, que já trocou de casa sem reescrever tela.
 *
 * As tabelas de hoje:
 *   plano       { layout: {...}, contas: [...] }     o layout e as contas
 *   centros     { layout: {...}, centros: [...] }    centros de resultado
 *   naturezas   { naturezas: [...] }                 naturezas de operação
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ErpDados = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TABELAS = ['plano', 'centros', 'naturezas'];
  // O nome da tabela vira nome de arquivo: só o que está na lista entra.
  function validar(tabela) {
    const t = String(tabela || '');
    if (TABELAS.indexOf(t) < 0) throw new Error('Tabela do ERP desconhecida: ' + t);
    return 'erp-' + t;
  }

  // O armazenamento em uso. Por padrão é o do Conciliador (App.armazenamento); dá para injetar outro
  // (as provas injetam um de mentira, e o ERP independente vai injetar o dele).
  let casa = null;
  function usar(armazenamento) { casa = armazenamento || null; }
  function arm() {
    const a = casa || (typeof self !== 'undefined' && self.App ? self.App.armazenamento : null);
    if (!a) throw new Error('O ERP Solutta não achou onde guardar os dados.');
    return a;
  }

  async function ler(codigo, tabela) {
    const doc = await arm().documento(codigo, validar(tabela));
    return doc && doc.dados ? doc.dados : null;
  }
  async function gravar(codigo, tabela, dados) {
    const doc = await arm().salvarDocumento(codigo, validar(tabela), { dados });
    try {
      await arm().registrarNoLog({ codigo, acao: 'erp-' + tabela + '-salvo' });
    } catch (e) { /* o log não pode derrubar a gravação */ }
    return doc && doc.dados ? doc.dados : dados;
  }
  // O que esta empresa já tem do ERP (para a tela inicial mostrar o que está pronto e o que falta).
  async function situacao(codigo) {
    const r = { plano: 0, contas: 0, centros: 0, naturezas: 0, temLayout: false };
    try {
      const plano = await ler(codigo, 'plano');
      r.temLayout = !!(plano && plano.layout && plano.layout.mascara);
      r.contas = ((plano && plano.contas) || []).length;
      const centros = await ler(codigo, 'centros');
      r.centros = ((centros && centros.centros) || []).length;
      const nats = await ler(codigo, 'naturezas');
      r.naturezas = ((nats && nats.naturezas) || []).length;
    } catch (e) { /* empresa sem nada do ERP ainda */ }
    return r;
  }

  return { TABELAS, usar, ler, gravar, situacao };
});
