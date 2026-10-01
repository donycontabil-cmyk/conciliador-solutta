/*
 * ERP Solutta — erp-acesso.js
 * A TRANCA do ERP. Dony, 01/10/2026: "para acessar esse menu, digite uma senha… ele é secreto dentro dele".
 * Enquanto não destravar, o menu ERP NÃO APARECE no menu da esquerda — quem não sabe que ele existe não vê
 * nada. Quem sabe entra por um destes dois caminhos: o atalho do teclado ou o endereço #/erp direto.
 *
 * O QUE ISTO É, COM TODAS AS LETRAS: é uma TRANCA DE PORTA, não um cofre. O programa inteiro roda no
 * navegador de quem usa, então quem entende de código consegue passar por ela, e ela NÃO protege a pasta de
 * dados (essa continua aberta pelo Windows para quem tem acesso à máquina). Serve para o ERP não ficar à
 * mostra e para ninguém entrar sem querer. Proteção de verdade só com login no servidor da Solutta.
 *
 * A senha NÃO fica escrita em lugar nenhum: o config.js guarda só o RESUMO dela (um número calculado a
 * partir da senha, do qual não se volta para a senha lendo). Para trocar: node ferramentas/senha-erp.js
 *
 * A liberação vale enquanto a aba estiver aberta. Fechou o navegador, tranca de novo.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.ErpAcesso = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHAVE = 'erp-solutta.liberado';
  const TEMPERO = 'erp-solutta|';

  // O resumo da senha. Duas contas diferentes sobre os mesmos caracteres, em hexadecimal: do resultado não
  // se lê a senha de volta. É o MESMO cálculo no navegador e no Node (a ferramenta usa este arquivo).
  function resumo(senha) {
    const s = TEMPERO + String(senha === null || senha === undefined ? '' : senha);
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul((a ^ c) >>> 0, 0x01000193) >>> 0;
      b = Math.imul(((b + c) ^ (b >>> 7)) >>> 0, 0x85ebca6b) >>> 0;
    }
    const hex = (n) => ('00000000' + (n >>> 0).toString(16)).slice(-8);
    return hex(a) + hex(b);
  }

  function esperado(config) {
    const c = config || (typeof self !== 'undefined' ? self.CONFIG : null) || {};
    return String((c.erp && c.erp.senha) || '');
  }
  // Área sem senha cadastrada no config: fica destrancada (não inventa tranca sem senha).
  function temTranca(config) { return !!esperado(config); }
  function conferir(senha, config) { return !temTranca(config) || resumo(senha) === esperado(config); }

  function liberado(config) {
    if (!temTranca(config)) return true;
    try { return self.sessionStorage.getItem(CHAVE) === esperado(config); } catch (e) { return false; }
  }
  function liberar(config) {
    try { self.sessionStorage.setItem(CHAVE, esperado(config)); return true; } catch (e) { return false; }
  }
  function trancar() {
    try { self.sessionStorage.removeItem(CHAVE); } catch (e) { /* sem sessionStorage: nada a limpar */ }
  }
  // O atalho do teclado que abre a porta (o que está escrito no config, ou Ctrl+Shift+E).
  function atalho(config) {
    const c = config || (typeof self !== 'undefined' ? self.CONFIG : null) || {};
    return String((c.erp && c.erp.atalho) || 'Ctrl+Shift+E');
  }

  return { resumo, conferir, liberado, liberar, trancar, temTranca, atalho, CHAVE };
});
