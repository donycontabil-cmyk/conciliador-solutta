/*
 * Conciliador Solutta — armazenamento-memoria.js
 * O mesmo contrato, com a pasta de dados NA MEMÓRIA (nada no disco). Serve para as
 * provas e para testar a tela; some quando a página fecha.
 * Imita os métodos do "handle" da File System Access API e usa a MESMA lógica do
 * armazenamento-pasta.js: o que funciona aqui funciona na pasta de verdade.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./armazenamento-pasta.js'));
  else raiz.ArmazenamentoMemoria = fabrica(raiz.ArmazenamentoPasta);
})(typeof self !== 'undefined' ? self : this, function (ArmazenamentoPasta) {
  'use strict';

  function erro(nome, mensagem) {
    const e = new Error(mensagem);
    e.name = nome;
    return e;
  }

  function paraBytes(dado) {
    if (typeof dado === 'string') return new TextEncoder().encode(dado);
    if (dado instanceof Uint8Array) return dado;
    if (dado instanceof ArrayBuffer) return new Uint8Array(dado);
    if (dado && dado.buffer instanceof ArrayBuffer) return new Uint8Array(dado.buffer, dado.byteOffset, dado.byteLength);
    throw erro('TypeError', 'Tipo de dado não suportado na gravação.');
  }

  class ArquivoMemoria {
    constructor(nome) {
      this.kind = 'file';
      this.name = nome;
      this.dados = new Uint8Array(0);
      this.alteradoEm = Date.now();
    }
    async getFile() {
      const dados = this.dados.slice();
      const nome = this.name;
      const quando = this.alteradoEm;
      return {
        name: nome, size: dados.length, lastModified: quando,
        async arrayBuffer() { return dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength); },
        async text() { return new TextDecoder('utf-8').decode(dados); },
      };
    }
    async createWritable(opcoes) {
      const alvo = this;
      let buffer = opcoes && opcoes.keepExistingData ? alvo.dados.slice() : new Uint8Array(0);
      let pos = 0;
      let aberto = true;
      return {
        async seek(p) { pos = p; },
        async write(dado) {
          if (!aberto) throw erro('InvalidStateError', 'Gravação já fechada.');
          const b = paraBytes(dado && dado.type === 'write' ? dado.data : dado);
          const fim = pos + b.length;
          if (fim > buffer.length) { const novo = new Uint8Array(fim); novo.set(buffer); buffer = novo; }
          buffer.set(b, pos);
          pos = fim;
        },
        async close() { aberto = false; alvo.dados = buffer; alvo.alteradoEm = Date.now(); },
        async abort() { aberto = false; },
      };
    }
  }

  class PastaMemoria {
    constructor(nome) {
      this.kind = 'directory';
      this.name = nome;
      this.filhos = new Map();
    }
    async getDirectoryHandle(nome, opcoes) {
      const h = this.filhos.get(nome);
      if (h) {
        if (h.kind !== 'directory') throw erro('TypeMismatchError', nome + ' não é uma pasta.');
        return h;
      }
      if (!opcoes || !opcoes.create) throw erro('NotFoundError', 'Pasta não encontrada: ' + nome);
      const nova = new PastaMemoria(nome);
      this.filhos.set(nome, nova);
      return nova;
    }
    async getFileHandle(nome, opcoes) {
      const h = this.filhos.get(nome);
      if (h) {
        if (h.kind !== 'file') throw erro('TypeMismatchError', nome + ' não é um arquivo.');
        return h;
      }
      if (!opcoes || !opcoes.create) throw erro('NotFoundError', 'Arquivo não encontrado: ' + nome);
      const novo = new ArquivoMemoria(nome);
      this.filhos.set(nome, novo);
      return novo;
    }
    async removeEntry(nome, opcoes) {
      const h = this.filhos.get(nome);
      if (!h) throw erro('NotFoundError', 'Não encontrado: ' + nome);
      if (h.kind === 'directory' && h.filhos.size && !(opcoes && opcoes.recursive)) throw erro('InvalidModificationError', 'Pasta não vazia: ' + nome);
      this.filhos.delete(nome);
    }
    async *values() {
      for (const h of Array.from(this.filhos.values())) yield h;
    }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  /**
   * @param opcoes { usuario, nomeDaPasta }
   */
  function criar(opcoes) {
    const op = opcoes || {};
    const raiz = new PastaMemoria(op.nomeDaPasta || 'Memória do navegador');
    const seletor = {
      suportado: () => true,
      guardada: async () => raiz,
      lembrar: async () => {},
      esquecer: async () => {},
      permissao: async () => 'granted',
      escolher: async () => raiz,
    };
    const impl = ArmazenamentoPasta.criar({ seletor, usuario: op.usuario, rotulo: 'Memória (nada vai para o disco)' });
    impl.modo = 'memoria';
    impl.raizNaMemoria = raiz;
    return impl;
  }

  return { criar, PastaMemoria, ArquivoMemoria };
});
