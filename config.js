/*
 * Conciliador Solutta — config.js
 * A ÚNICA configuração do programa (Parte 3.4). Nenhum endereço escrito no meio do código.
 * Caminhos sempre RELATIVOS: o site pode morar em https://conciliador.dominio.com.br/ ou em
 * https://dominio/conciliador/ sem mudar nada além deste arquivo.
 *
 * Trocar de casa (pasta -> servidor da Solutta) = mudar "modo" e "api" aqui e importar o pacote.
 */
(function (raiz) {
  'use strict';
  const CONFIG = {
    empresa: 'Solutta',
    programa: 'Conciliador Solutta',
    versao: 'Etapa 1',
    // Número e carimbo da versão publicada. Preenchidos sozinhos pelo montar-site.js a cada
    // publicação (o número sobe 1, 2, 3…), para quem usa saber se pegou a versão nova (Ctrl+F5).
    // build 'local' = rodando neste PC, ainda não publicado.
    numero: 65,
    build: '23/09/2026 15:49',

    // Onde os dados moram:
    //   'pasta'    -> numa pasta do computador de quem usa (hoje)
    //   'memoria'  -> só na memória do navegador, nada é gravado (demonstração e testes)
    //   'servidor' -> no servidor da Solutta (futuro, Parte 3.4)
    // Para testar sem pasta, abra o programa com ?modo=memoria no fim do endereço.
    modo: 'pasta',
    api: '',                                    // futuro: endereço RELATIVO ou completo da API do servidor

    pastaSugerida: 'C:\\Conciliador Solutta - Dados',

    // Botões da empresa de demonstração (SOLUTTA TESTE LTDA, 100% inventada), para mostrar o
    // programa sem arquivo de cliente. Desligar (false) quando o escritório começar a usar de verdade.
    demonstracao: true,

    // Marca: logotipo e cores da Solutta entram aqui quando o Dony passar (Parte 13, pergunta 6).
    logo: '',                                   // caminho relativo, ex.: 'assets/logo-solutta.png'
    cores: {
      primaria: '#2f4a64',
    },

    // Arquivo de lançamentos para o sistema contábil (Parte 7.3): a planilha de importação do sistema do
    // escritório (21/09/2026). formato: 'planilha' (Data | Conta débito | Participante | Conta crédito |
    // Participante | Valor | Histórico, sem títulos) ou 'texto' (o layout antigo de referência).
    layoutAjustes: {
      formato: 'planilha',
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = CONFIG;
  else raiz.CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
