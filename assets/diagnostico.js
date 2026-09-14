/*
 * Conciliador Solutta — diagnostico.js
 * "Ver o desenho de um arquivo": lê o arquivo NO PRÓPRIO computador de quem usa e monta
 * um texto que descreve só o FORMATO — títulos das colunas, quantas linhas, o que o
 * programa reconheceu e os PADRÕES de histórico — com nomes, CNPJs, CPFs e valores
 * ESCONDIDOS. Serve para o Dony mandar ao suporte o desenho de cada sistema da Solutta
 * sem enviar arquivo e sem vazar dado de cliente (pedido de 14/09/2026: são vários
 * sistemas, cada um com um desenho).
 *
 * Regra de ouro: nada que saia daqui pode identificar um cliente. Letra vira x, dígito
 * vira 9; o programa mostra o texto na tela para a pessoa CONFERIR antes de copiar.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./util.js'), require('./ler-planilha.js'), require('./leitor.js'), require('./motor-nomes.js'));
  } else {
    raiz.Diagnostico = fabrica(raiz.Util, raiz.LerPlanilha, raiz.Leitor, raiz.MotorNomes);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, LerPlanilha, Leitor, MotorNomes) {
  'use strict';

  // Esconde o conteúdo de uma célula, mantendo só o FORMATO (a forma, não o dado).
  function mascararTexto(s) {
    return String(s).replace(/[0-9]/g, '9').replace(/[A-Za-zÀ-ÖØ-öø-ÿ]/g, 'x');
  }

  function ehData(s) {
    return typeof s === 'string' && /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s.trim());
  }

  // Palavras que podem aparecer LEGÍVEIS fora da linha de cabeçalho: são rótulos e
  // marcações do próprio sistema, nunca nome de cliente. Tudo o que não estiver aqui
  // (nem for um rótulo terminado em ":") vira máscara — por segurança.
  const PALAVRAS_SEGURAS = new Set(('DATA LOTE NUMERO NUM LANC LANCAMENTO HISTORICO CTA C PART CPART CONTRAPARTIDA FILIAL ' +
    'DEBITO CREDITO SALDO EXERCICIO ATUAL ANTERIOR FINAL CONTA CONTAS TOTAIS TOTAL CONSOLIDADO RAZAO BALANCETE FOLHA ' +
    'EMPRESA PERIODO CLASSIFICACAO CODIGO REDUZIDO VENCIMENTO PARCELA STATUS SITUACAO DOC SERIE POSICAO NF ' +
    'FORNECEDOR CLIENTE RAZONETE DEBITOS CREDITOS DE ATE A SISTEMA LICENCIADO PARA').split(' '));

  // Célula legível só se for rótulo (termina em ":"), título de cabeçalho, ou toda feita
  // de palavras seguras. mostrarTitulos = está na linha de cabeçalho (aí mostra tudo).
  function celulaParaTexto(v, mostrarTitulos) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') {
      const txt = String(Math.abs(v));
      return (v < 0 ? '-' : '') + txt.replace(/[0-9]/g, '9');
    }
    let s = String(v).trim();
    if (ehData(s)) return '99/99/9999';
    if (mostrarTitulos && !/\d/.test(s) && s.length <= 40) return s;   // linha de cabeçalho: mostra os títulos
    if (/:$/.test(s) && s.length <= 24) return s;                       // rótulo: "Empresa:", "Conta:", "C.N.P.J.:"
    const palavras = Util.semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    if (palavras.length && palavras.length <= 5 && palavras.every((p) => PALAVRAS_SEGURAS.has(p))) return s;
    return mascararTexto(s);                                            // qualquer outra coisa (nome, valor, texto livre): máscara
  }

  // Acha a linha de cabeçalho (a que tem mais títulos de coluna).
  function linhaDoCabecalho(linhas) {
    let melhor = -1, melhorNota = 0;
    for (let r = 0; r < Math.min(40, linhas.length); r++) {
      const cheias = (linhas[r] || []).filter((c) => c !== null && String(c).trim() !== '');
      if (cheias.length < 3) continue;
      const titulos = cheias.filter((c) => typeof c === 'string' && !/\d/.test(c) && String(c).trim().split(/\s+/).length <= 3).length;
      if (titulos > melhorNota) { melhorNota = titulos; melhor = r; }
    }
    return melhor;
  }

  function desenhoDasAbas(planilha) {
    const partes = [];
    planilha.abas.forEach((aba, i) => {
      const linhas = aba.linhas;
      const cab = linhaDoCabecalho(linhas);
      partes.push('  Aba ' + (i + 1) + ' "' + mascararTexto(aba.nome) + '": ' + linhas.length + ' linha(s)' +
        (cab >= 0 ? ', cabeçalho na linha ' + (cab + 1) : ', não achei uma linha de cabeçalho clara'));
      // Mostra até 16 primeiras linhas, mascarando o que for dado.
      let mostradas = 0;
      for (let r = 0; r < linhas.length && mostradas < 16; r++) {
        const linha = linhas[r] || [];
        if (!linha.some((c) => c !== null && String(c).trim() !== '')) continue;
        // Só a linha de cabeçalho mostra os títulos; nas outras, só rótulos e palavras seguras.
        const celulas = [];
        for (let c = 0; c < linha.length; c++) {
          const txt = celulaParaTexto(linha[c], r === cab);
          if (txt !== '') celulas.push('[' + c + '] ' + txt);
        }
        if (celulas.length) { partes.push('      ' + celulas.join('  |  ')); mostradas++; }
      }
    });
    return partes.join('\n');
  }

  // Padrões de histórico, com o NOME e o CNPJ tirados (o que sobra é o desenho do sistema).
  function padroesDeHistorico(razao) {
    const grupos = new Map();
    let total = 0, semRegra = 0;
    for (const conta of razao.contas) {
      for (const l of conta.lancamentos) {
        total++;
        const dc = l.debito ? 'D' : 'C';
        const lido = MotorNomes.lerHistorico(l.historico, dc);
        let s = Util.semAcento(l.historico).toUpperCase();
        // Tira CNPJ, CPF e o nome que o motor achou.
        s = s.replace(/[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}/g, '[CNPJ]');
        s = s.replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]');
        for (const cnpj of lido.cnpjs) s = s.split(Util.formatarCnpj(cnpj)).join('[CNPJ]').split(cnpj).join('[CNPJ]');
        const nome = lido.nomeBruto || lido.nome;
        if (nome) {
          for (const palavra of nome.split(/\s+/)) {
            if (palavra.length >= 3) s = s.replace(new RegExp('\\b' + palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), '[NOME]');
          }
        }
        s = s.replace(/\d+/g, '9').replace(/(\[NOME\]\s*){2,}/g, '[NOME] ').replace(/\s+/g, ' ').trim();
        if (!lido.regra) semRegra++;
        const chave = dc + ' | ' + s;
        if (!grupos.has(chave)) grupos.set(chave, { n: 0, regra: lido.regra || '(nenhuma regra entendeu)' });
        grupos.get(chave).n++;
      }
    }
    const lista = Array.from(grupos.entries()).sort((a, b) => b[1].n - a[1].n);
    const linhas = ['  ' + total + ' lançamentos, ' + lista.length + ' desenho(s) de histórico' +
      (semRegra ? ', ' + semRegra + ' lançamento(s) que nenhuma regra entendeu' : '')];
    for (const [chave, o] of lista.slice(0, 40)) {
      linhas.push('    ' + String(o.n).padStart(5) + '×  ' + chave + '   « ' + o.regra);
    }
    if (lista.length > 40) linhas.push('    … e mais ' + (lista.length - 40) + ' desenho(s).');
    return linhas.join('\n');
  }

  /**
   * Monta o texto do desenho de um arquivo.
   * @param nomeArquivo nome original (mascarado no texto)
   * @param bytes Uint8Array
   * @returns { texto, tipo, reconhecido }
   */
  function gerar(nomeArquivo, bytes) {
    const linhas = [];
    linhas.push('CONCILIADOR SOLUTTA — desenho de arquivo (sem nomes, CNPJs nem valores)');
    linhas.push('Arquivo: ' + mascararTexto(nomeArquivo) + '  ·  ' + bytes.length.toLocaleString('pt-BR') + ' bytes');
    let planilha, r;
    try {
      planilha = LerPlanilha.abrir(bytes);
    } catch (e) {
      linhas.push('NÃO abriu como planilha: ' + e.message);
      return { texto: linhas.join('\n'), tipo: 'erro', reconhecido: false };
    }
    linhas.push('Recipiente: ' + planilha.recipiente + (planilha.codificacao ? ' (' + planilha.codificacao + ')' : '') + '  ·  ' + planilha.abas.length + ' aba(s)');
    for (const a of planilha.avisos) linhas.push('Aviso da leitura: ' + a);
    linhas.push('');
    try {
      r = Leitor.ler(bytes, nomeArquivo);
    } catch (e) {
      r = { tipo: 'desconhecido', nomeDoTipo: 'erro', motivo: e.message, avisos: [] };
    }
    linhas.push('O programa reconheceu como: ' + r.nomeDoTipo + (r.tipo === 'razao' && r.razao ? ' (desenho ' + r.razao.desenho + ')' : ''));
    if (r.motivo) linhas.push('Motivo: ' + r.motivo);
    linhas.push('');
    linhas.push('ESTRUTURA (primeiras linhas, com os dados escondidos):');
    linhas.push(desenhoDasAbas(planilha));
    if (r.tipo === 'razao' && r.razao) {
      linhas.push('');
      linhas.push('CONTAS ENCONTRADAS:');
      for (const c of r.contas) {
        linhas.push('  conta ' + c.codigo + '  classificação ' + (c.classificacao || '—') + '  nome "' + c.nome + '"  ->  ' +
          (c.papel.familia ? c.papel.familia + '/' + c.papel.papel : 'fica de fora') +
          '  ·  ' + c.lancamentos.length + ' lançamentos  ·  ' + (c.confere ? 'saldo CONFERE' : 'saldo NÃO confere: ' + c.avisos.join(' ')));
      }
      linhas.push('');
      linhas.push('DESENHOS DE HISTÓRICO (nome e CNPJ trocados por [NOME] e [CNPJ]):');
      linhas.push(padroesDeHistorico(r.razao));
    }
    linhas.push('');
    linhas.push('— fim do desenho —');
    return { texto: linhas.join('\n'), tipo: r.tipo, reconhecido: r.tipo !== 'desconhecido' && r.tipo !== 'erro' };
  }

  return { gerar, mascararTexto };
});
