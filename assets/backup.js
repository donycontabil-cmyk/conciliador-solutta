/*
 * Conciliador Solutta — backup.js
 * BACKUP DE UMA EMPRESA num arquivo só (Dony, 23/09/2026: "como o sistema é offline, cada um usa na sua
 * máquina; eu quero que o colaborador selecione a empresa, gere um backup, e o outro importe na máquina dele
 * e os dois fiquem com os mesmos dados").
 *
 * O arquivo é um ZIP (o mesmo empacotador das planilhas), com os bytes originais guardados crus — por isso
 * fica pequeno perto do que carrega dentro:
 *   manifesto.json      programa, formato, quando, quem, a empresa e as contagens (é o que a tela confere antes de importar)
 *   empresas.json       o cadastro da empresa
 *   arquivos.json       [{ meta, conteudo }] de cada arquivo (o que o programa leu)
 *   originais/<id>      o arquivo como veio (a prova), byte a byte
 *   conciliacoes.json   o estado de cada conciliação (com as decisões)
 *   congelados.json     as cópias imutáveis
 *   log.jsonl           as linhas de log daquela empresa
 *
 * ler() devolve o pacote no mesmo formato do armazenamento.importarTudo(), então a importação é a mesma
 * de sempre: nada é apagado, o que já existe aqui e está mais novo fica (a não ser que a pessoa peça para
 * substituir) e o que é trocado vira versão.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./xlsx.full.min.js'), require('./util.js'));
  else raiz.Backup = fabrica(raiz.XLSX, raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (XLSX, Util) {
  'use strict';

  const PROGRAMA = 'Conciliador Solutta';
  const VERSAO_BACKUP = 1;

  function erro(nome, mensagem) {
    const e = new Error(mensagem);
    e.name = nome;
    return e;
  }

  const texto = (x) => new TextEncoder().encode(typeof x === 'string' ? x : JSON.stringify(x));
  const deTexto = (bytes) => new TextDecoder('utf-8').decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));

  function base64ParaBytes(b64) {
    if (typeof atob === 'function') {
      const s = atob(b64);
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      return b;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  function bytesParaBase64(bytes) {
    let s = '';
    const pedaco = 0x8000;
    for (let i = 0; i < bytes.length; i += pedaco) s += String.fromCharCode.apply(null, bytes.subarray(i, i + pedaco));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  }

  // As contagens que aparecem na tela antes de importar (e no manifesto).
  function resumo(pacote) {
    const emp = (pacote.empresas || [])[0] || {};
    const arqs = pacote.arquivos || [];
    const meses = Array.from(new Set(arqs.map((a) => Util.anoMes(a.meta.competencia)).filter(Boolean))).sort();
    const porTipo = {};
    arqs.forEach((a) => { porTipo[a.meta.tipo] = (porTipo[a.meta.tipo] || 0) + 1; });
    return {
      empresa: { codigo: String(emp.codigo || ''), nome: emp.nome || '', cnpj: emp.cnpj || '' },
      exportadoEm: pacote.exportadoEm || '', exportadoPor: pacote.exportadoPor || '',
      arquivos: arqs.length, comOriginal: arqs.filter((a) => a.original).length, porTipo,
      conciliacoes: (pacote.conciliacoes || []).length, congelados: (pacote.congelados || []).length, log: (pacote.log || []).length,
      meses, de: meses[0] || '', ate: meses[meses.length - 1] || '',
      conciliacoesLivres: (emp.conciliacoesLivres || []).length,
    };
  }

  function nomeDoArquivo(pacote) {
    const r = resumo(pacote);
    const quando = String(pacote.exportadoEm || Util.agoraISO()).slice(0, 10);
    return Util.nomeSeguro('Backup ' + r.empresa.codigo + ' ' + r.empresa.nome + ' ' + quando, 110) + '.zip';
  }

  // ------------------------------------------------------------------
  // Empacotar: o pacote do armazenamento vira os bytes do arquivo .zip
  // ------------------------------------------------------------------
  function empacotar(pacote) {
    if (!pacote || pacote.programa !== PROGRAMA) throw erro('Validacao', 'Este pacote não é do Conciliador Solutta.');
    if (!(pacote.empresas || []).length) throw erro('Validacao', 'O backup precisa de uma empresa.');
    const zip = XLSX.CFB.utils.cfb_new();
    const por = (caminho, conteudo) => XLSX.CFB.utils.cfb_add(zip, '/' + caminho, conteudo);
    const semOriginal = (pacote.arquivos || []).map((a) => ({ meta: a.meta, conteudo: a.conteudo }));
    const manifesto = Object.assign({ programa: PROGRAMA, formato: pacote.formato, versaoBackup: VERSAO_BACKUP,
      exportadoEm: pacote.exportadoEm, exportadoPor: pacote.exportadoPor }, resumo(pacote));
    por('manifesto.json', texto(manifesto));
    por('empresas.json', texto(pacote.empresas || []));
    por('arquivos.json', texto(semOriginal));
    por('conciliacoes.json', texto(pacote.conciliacoes || []));
    por('congelados.json', texto(pacote.congelados || []));
    por('log.jsonl', texto((pacote.log || []).map((l) => JSON.stringify(l)).join('\n')));
    // Os arquivos originais entram crus, com o id no nome (nada de acento ou espaço no caminho do zip).
    (pacote.arquivos || []).forEach((a) => { if (a.original) por('originais/' + a.meta.id, base64ParaBytes(a.original)); });
    return new Uint8Array(XLSX.CFB.write(zip, { fileType: 'zip', type: 'array', compression: true }));
  }

  // ------------------------------------------------------------------
  // Ler: os bytes do arquivo viram o pacote que o armazenamento importa
  // ------------------------------------------------------------------
  function ler(bytes) {
    let zip;
    try {
      zip = XLSX.CFB.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: 'array' });
    } catch (e) {
      throw erro('Validacao', 'Não consegui abrir este arquivo de backup (ele não parece um .zip do Conciliador).');
    }
    const conteudos = new Map();
    zip.FullPaths.forEach((caminho, i) => {
      const item = zip.FileIndex[i];
      if (!item || item.type !== 2) return;
      const limpo = String(caminho).replace(/^\/?Root Entry\//, '').replace(/^\//, '');
      conteudos.set(limpo, item.content ? new Uint8Array(item.content) : new Uint8Array(0));
    });
    const json = (nome, padrao) => {
      const b = conteudos.get(nome);
      if (!b) return padrao;
      try { return JSON.parse(deTexto(b)); } catch (e) { throw erro('Validacao', 'O arquivo "' + nome + '" do backup está corrompido.'); }
    };
    const manifesto = json('manifesto.json', null);
    if (!manifesto || manifesto.programa !== PROGRAMA) throw erro('Validacao', 'Este arquivo não é um backup do Conciliador Solutta.');
    if (Number(manifesto.versaoBackup) > VERSAO_BACKUP) {
      throw erro('Validacao', 'Este backup foi gerado por uma versão mais nova do programa (' + manifesto.versaoBackup + '). Atualize o Conciliador (Ctrl+F5) e tente de novo.');
    }
    const arquivos = (json('arquivos.json', []) || []).map((a) => {
      const b = conteudos.get('originais/' + (a.meta && a.meta.id));
      return { meta: a.meta, conteudo: a.conteudo, original: b && b.length ? bytesParaBase64(b) : null };
    });
    const linhasLog = deTexto(conteudos.get('log.jsonl') || new Uint8Array(0)).split('\n').filter((l) => l.trim());
    const log = [];
    for (const l of linhasLog) { try { log.push(JSON.parse(l)); } catch (e) { /* linha estragada: o resto do log continua */ } }
    const pacote = { programa: PROGRAMA, formato: manifesto.formato, exportadoEm: manifesto.exportadoEm, exportadoPor: manifesto.exportadoPor,
      so: manifesto.empresa ? manifesto.empresa.codigo : null,
      empresas: json('empresas.json', []) || [], arquivos, conciliacoes: json('conciliacoes.json', []) || [],
      congelados: json('congelados.json', []) || [], log };
    if (!pacote.empresas.length) throw erro('Validacao', 'Este backup não tem empresa dentro.');
    // Confere o que o manifesto prometeu com o que veio (arquivo cortado pela metade, por exemplo).
    const r = resumo(pacote);
    const faltas = [];
    if (manifesto.arquivos !== undefined && manifesto.arquivos !== r.arquivos) faltas.push(manifesto.arquivos + ' arquivo(s) no manifesto e ' + r.arquivos + ' no pacote');
    if (manifesto.conciliacoes !== undefined && manifesto.conciliacoes !== r.conciliacoes) faltas.push(manifesto.conciliacoes + ' conciliação(ões) no manifesto e ' + r.conciliacoes + ' no pacote');
    if (manifesto.comOriginal !== undefined && manifesto.comOriginal !== r.comOriginal) faltas.push(manifesto.comOriginal + ' original(is) no manifesto e ' + r.comOriginal + ' no pacote');
    if (faltas.length) throw erro('Validacao', 'O backup chegou incompleto (' + faltas.join('; ') + '). Peça o arquivo de novo.');
    return { pacote, manifesto, resumo: r };
  }

  // O que a importação vai fazer nesta máquina, comparando com o que já existe aqui.
  // atual: { arquivos: [meta], conciliacoes: [{id, atualizadoEm}], empresa }
  function comparar(pacote, atual) {
    const aqui = atual || {};
    const idsArq = new Set((aqui.arquivos || []).map((m) => m.id));
    const porId = new Map((aqui.conciliacoes || []).map((c) => [c.id, c]));
    const arquivosNovos = (pacote.arquivos || []).filter((a) => !idsArq.has(a.meta.id));
    const conc = { novas: [], maisNovasNoBackup: [], maisNovasAqui: [], iguais: [] };
    (pacote.conciliacoes || []).forEach((c) => {
      const meu = porId.get(c.id);
      if (!meu) { conc.novas.push(c); return; }
      const la = Util.paraMs(c.atualizadoEm), aq = Util.paraMs(meu.atualizadoEm);
      if (la > aq) conc.maisNovasNoBackup.push(c);
      else if (la < aq) conc.maisNovasAqui.push(c);
      else conc.iguais.push(c);
    });
    return {
      empresaJaExiste: !!aqui.empresa,
      arquivos: { novos: arquivosNovos.length, jaTem: (pacote.arquivos || []).length - arquivosNovos.length },
      conciliacoes: { novas: conc.novas.length, maisNovasNoBackup: conc.maisNovasNoBackup.length,
        maisNovasAqui: conc.maisNovasAqui.length, iguais: conc.iguais.length },
      // Só quando tem conciliação mais nova aqui é que os dois lados podem ficar diferentes.
      podeFicarDiferente: conc.maisNovasAqui.length,
    };
  }

  return { PROGRAMA, VERSAO_BACKUP, empacotar, ler, resumo, comparar, nomeDoArquivo };
});
