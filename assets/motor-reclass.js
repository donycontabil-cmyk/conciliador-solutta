/*
 * Conciliador Solutta — motor-reclass.js
 * Marca as pernas de RECLASSIFICAÇÃO DO PRÓPRIO SISTEMA entre as duas contas (Parte 7.2):
 * histórico "Reclass." nos dois lados, contas diferentes, mesma data, mesmo valor e
 * lados opostos. É SÓ MARCADA na tela (⇄ "foi para" / "veio de"). NÃO É CONCILIAÇÃO.
 *
 * Regra do Dony: "ela sai de uma e vai para a outra, para limpar a conta em que saiu,
 * e ao entrar na outra conta, ou ela bate com um valor já existente na conta, ou fica
 * em aberto nessa outra conta". Casar as duas pernas entre si dava por resolvidas
 * centenas de linhas que ninguém conferiu (armadilha 11).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.MotorReclass = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  function ehReclass(historico) {
    return /^\s*reclass/i.test(Util.semAcento(historico || ''));
  }

  /**
   * @param linhas [{ digital, lado: 'F'|'A', conta, contaNome, dia, dc, debito, credito, historico, contrapartida }]
   * @returns Map digital -> { sentido: 'foi-para' | 'veio-de', par, conta, contaNome }
   *   "de X para Y" = crédito em X, débito em Y: a perna a CRÉDITO foi para a outra conta.
   */
  function marcar(linhas) {
    const marcas = new Map();
    const porChave = new Map();
    for (const l of linhas) {
      if (!ehReclass(l.historico)) continue;
      const valor = l.debito || l.credito;
      const k = l.dia + '|' + valor;
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push(l);
    }
    const textoIgual = (a, b) => Util.normalizarNome(a.historico) === Util.normalizarNome(b.historico);
    for (const grupo of porChave.values()) {
      if (grupo.length < 2) continue;
      const usados = new Set();
      // Primeiro os de histórico idêntico; depois os demais.
      for (const exigirTexto of [true, false]) {
        for (const a of grupo) {
          if (usados.has(a.digital)) continue;
          const b = grupo.find((x) => !usados.has(x.digital) && x !== a && x.conta !== a.conta && x.lado !== a.lado &&
            x.dc !== a.dc && (!exigirTexto || textoIgual(a, x)) &&
            (!a.contrapartida || !x.contrapartida || (String(a.contrapartida) === String(x.conta) && String(x.contrapartida) === String(a.conta))));
          if (!b) continue;
          usados.add(a.digital);
          usados.add(b.digital);
          const credito = a.dc === 'C' ? a : b;
          const debito = a.dc === 'C' ? b : a;
          marcas.set(credito.digital, { sentido: 'foi-para', par: debito.digital, conta: debito.conta, contaNome: debito.contaNome });
          marcas.set(debito.digital, { sentido: 'veio-de', par: credito.digital, conta: credito.conta, contaNome: credito.contaNome });
        }
      }
    }
    return marcas;
  }

  return { marcar, ehReclass };
});
