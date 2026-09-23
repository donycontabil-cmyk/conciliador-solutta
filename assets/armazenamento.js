/*
 * Conciliador Solutta — armazenamento.js
 * O CONTRATO ÚNICO de guardar (Parte 3.3). Nenhuma tela lê ou grava arquivo
 * diretamente: tudo passa por aqui, e tudo é assíncrono.
 *
 *   conectar(), estaConectado(), descricao(), quemSou()
 *   empresas(), salvarEmpresa(empresa), apagarEmpresa(codigo)
 *   arquivos(codigo), conteudoDoArquivo(id), guardarArquivo(codigo, meta, conteudo, bytesOriginais), apagarArquivo(id),
 *   arquivoApagado(id) (a cópia do que foi apagado: { meta, conteudo } ou null)
 *   conciliacoes(codigo, competencia), salvarConciliacao(registro), apagarConciliacao(id), versoes(id)
 *   exportarEmpresa(codigo) -> pacote de backup de uma empresa; importarTudo(pacote, { substituir })
 *   congelar(codigo, meta, conteudo), congelado(id)
 *   registrarNoLog(acao)
 *   exportarTudo(), importarTudo(pacote)
 *
 * Implementações com o MESMO contrato:
 *   armazenamento-pasta.js     hoje: pasta do computador (File System Access API)
 *   armazenamento-memoria.js   provas e testes da tela (nada no disco)
 *   armazenamento-servidor.js  futuro: fetch para a API do servidor da Solutta (Parte 3.4)
 * Qual usar vem do config.js. Trocar de casa = trocar uma linha da config e importar o pacote.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Armazenamento = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const METODOS = [
    'conectar', 'estaConectado', 'descricao', 'quemSou',
    'empresas', 'salvarEmpresa', 'apagarEmpresa',
    'arquivos', 'conteudoDoArquivo', 'guardarArquivo', 'apagarArquivo', 'arquivoApagado',
    'conciliacoes', 'salvarConciliacao', 'apagarConciliacao', 'versoes',
    'congelar', 'congelado',
    'registrarNoLog',
    'exportarTudo', 'exportarEmpresa', 'importarTudo',
  ];

  function conferirContrato(impl, nome) {
    const faltam = METODOS.filter((m) => typeof impl[m] !== 'function');
    if (faltam.length) throw new Error('O armazenamento "' + (nome || '?') + '" não cumpre o contrato: faltam ' + faltam.join(', ') + '.');
    return impl;
  }

  /**
   * Escolhe a implementação pela configuração.
   * @param config  { modo: 'pasta' | 'memoria' | 'servidor', api }
   * @param fabricas { pasta, memoria, servidor } — módulos carregados na página
   * @param opcoes   repassadas à implementação (ex.: usuario)
   */
  function criar(config, fabricas, opcoes) {
    const modo = (config && config.modo) || 'pasta';
    const fab = fabricas && fabricas[modo];
    if (!fab || typeof fab.criar !== 'function') {
      if (modo === 'servidor') throw new Error('O modo "servidor" ainda não foi construído (Etapa 4). Use modo "pasta" no config.js.');
      throw new Error('Armazenamento "' + modo + '" não encontrado. Confira o config.js e a lista de scripts do index.html.');
    }
    return conferirContrato(fab.criar(Object.assign({ config }, opcoes || {})), modo);
  }

  return { METODOS, conferirContrato, criar };
});
