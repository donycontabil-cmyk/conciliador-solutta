/*
 * Conciliador Solutta — armazenamento-pasta.js
 * Guarda tudo numa PASTA do computador em uso (Parte 3.1 e 3.2), pela File System
 * Access API. Usa só os métodos do "handle" (getDirectoryHandle, getFileHandle,
 * createWritable, values, removeEntry): assim a mesma lógica roda sobre uma pasta de
 * verdade (navegador), sobre a memória (armazenamento-memoria.js) e sobre o disco no
 * Node (provas/imitador-fs.js). Uma pergunta, uma fonte (armadilha 6).
 *
 * Pasta de dados:
 *   _config.json                         versão do formato de dados, criada em
 *   empresas.json                        a carteira
 *   empresas/<codigo> - <nome curto>/
 *     arquivos/_indice.json              metadados de todos os arquivos (reconstruível)
 *     arquivos/<AAAA-MM>/<nome original> cópia fiel do que subiu (prova)
 *     arquivos/<AAAA-MM>/<id>.json       o que foi lido + metadados
 *     conciliacoes/<id>.json             estado atual
 *     conciliacoes/_versoes/<id>/<AAAA-MM-DDTHH-MM-SS>.json   gravações anteriores
 *     congelados/<id>.json               cópias imutáveis
 *   log/<AAAA-MM>.jsonl                  uma linha por ação: quando, quem, o quê
 *   _apagados/<AAAA-MM-DDTHH-MM-SS>/...  o que foi apagado pela tela (nada some de verdade)
 *
 * Nunca sobrescrever um arquivo com o mesmo nome e período: vira nova versão e a
 * anterior fica (num programa anterior, subir o razão ajustado com o mesmo nome apagou
 * o original — e o original era a prova). Gravar com createWritable(), que só troca o
 * arquivo no close(): não fica arquivo pela metade.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./util.js'));
  else raiz.ArmazenamentoPasta = fabrica(raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';

  const FORMATO = 1;
  const PROGRAMA = 'Conciliador Solutta';
  // Uma versão guardada por minuto no máximo: a tela grava a cada clique (Parte 7.2).
  const INTERVALO_VERSAO_MS = 60 * 1000;
  const IGNORAR_NA_PASTA_VAZIA = ['desktop.ini', 'thumbs.db', '.ds_store'];

  function erro(nome, mensagem) {
    const e = new Error(mensagem);
    e.name = nome;
    return e;
  }

  function naoAchou(e) {
    return e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError' || e.code === 'ENOENT');
  }

  // ------------------------------------------------------------------
  // Operações sobre handles
  // ------------------------------------------------------------------
  async function pasta(raiz, partes, criar) {
    let atual = raiz;
    for (const p of partes) {
      try {
        atual = await atual.getDirectoryHandle(p, { create: !!criar });
      } catch (e) {
        if (!criar && naoAchou(e)) return null;
        throw e;
      }
    }
    return atual;
  }

  async function lerBytes(dir, nome) {
    if (!dir) return null;
    try {
      const fh = await dir.getFileHandle(nome);
      const f = await fh.getFile();
      return new Uint8Array(await f.arrayBuffer());
    } catch (e) {
      if (naoAchou(e)) return null;
      throw e;
    }
  }

  async function lerTexto(dir, nome) {
    const b = await lerBytes(dir, nome);
    return b === null ? null : new TextDecoder('utf-8').decode(b);
  }

  async function lerJson(dir, nome) {
    const t = await lerTexto(dir, nome);
    if (t === null) return null;
    try {
      return JSON.parse(t);
    } catch (e) {
      throw erro('DadoCorrompido', 'O arquivo "' + nome + '" da pasta de dados está corrompido (não é JSON válido). ' +
        'Ele não foi apagado; chame o suporte antes de continuar.');
    }
  }

  async function gravar(dir, nome, conteudo) {
    const fh = await dir.getFileHandle(nome, { create: true });
    const w = await fh.createWritable();
    try {
      await w.write(typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo);
      await w.close();
    } catch (e) {
      try { if (typeof w.abort === 'function') await w.abort(); } catch (e2) { /* nada */ }
      throw e;
    }
  }

  async function acrescentar(dir, nome, texto) {
    const fh = await dir.getFileHandle(nome, { create: true });
    const f = await fh.getFile();
    const w = await fh.createWritable({ keepExistingData: true });
    try {
      await w.seek(f.size);
      await w.write(new TextEncoder().encode(texto));
      await w.close();
    } catch (e) {
      try { if (typeof w.abort === 'function') await w.abort(); } catch (e2) { /* nada */ }
      throw e;
    }
  }

  async function listar(dir) {
    const r = [];
    if (!dir) return r;
    for await (const h of dir.values()) r.push({ nome: h.name, tipo: h.kind, handle: h });
    return r;
  }

  async function existe(dir, nome) {
    if (!dir) return false;
    try { await dir.getFileHandle(nome); return true; } catch (e) { if (naoAchou(e)) return false; throw e; }
  }

  // Copia um arquivo para outra pasta (para o "_apagados") e só depois remove o original.
  async function moverArquivo(origem, nome, destino, novoNome) {
    const b = await lerBytes(origem, nome);
    if (b === null) return false;
    await gravar(destino, novoNome || nome, b);
    await origem.removeEntry(nome);
    return true;
  }

  function carimboDePasta(iso) {
    return String(iso || Util.agoraISO()).slice(0, 19).replace(/:/g, '-');
  }

  function bytesParaBase64(bytes) {
    let s = '';
    const pedaco = 0x8000;
    for (let i = 0; i < bytes.length; i += pedaco) s += String.fromCharCode.apply(null, bytes.subarray(i, i + pedaco));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  }

  function base64ParaBytes(b64) {
    if (typeof atob === 'function') {
      const s = atob(b64);
      const b = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
      return b;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  // ------------------------------------------------------------------
  // Seletor do navegador: escolher a pasta, lembrar dela (IndexedDB) e pedir permissão.
  // ------------------------------------------------------------------
  const BANCO_IDB = 'conciliador-solutta';
  const LOJA_IDB = 'config';

  function abrirIdb() {
    return new Promise((ok, falha) => {
      const req = indexedDB.open(BANCO_IDB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA_IDB);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }

  // O navegador guarda o "ponteiro" da pasta no IndexedDB. Se ele não responder (política
  // do TI, modo anônimo, perfil com problema), o programa não pode ficar com a tela em
  // branco: desiste em 3 segundos e segue como se não houvesse pasta lembrada.
  function comPrazo(promessa, ms) {
    return Promise.race([promessa, new Promise((_, falha) => setTimeout(() => falha(new Error('O navegador não respondeu ao guardar a pasta (IndexedDB).')), ms))]);
  }

  async function idb(modo, fn) {
    const db = await comPrazo(abrirIdb(), 3000);
    try {
      return await comPrazo(new Promise((ok, falha) => {
        const tx = db.transaction(LOJA_IDB, modo);
        const req = fn(tx.objectStore(LOJA_IDB));
        tx.oncomplete = () => ok(req ? req.result : undefined);
        tx.onerror = () => falha(tx.error);
        tx.onabort = () => falha(tx.error);
      }), 3000);
    } finally {
      db.close();
    }
  }

  const seletorNavegador = {
    suportado() {
      return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
    },
    async guardada() {
      try { return (await idb('readonly', (s) => s.get('pasta'))) || null; } catch (e) { return null; }
    },
    async lembrar(handle) {
      // Se não conseguir lembrar, a pasta funciona nesta abertura e a tela pede de novo na próxima.
      try { await idb('readwrite', (s) => s.put(handle, 'pasta')); } catch (e) { console.warn(e); }
    },
    async esquecer() {
      try { await idb('readwrite', (s) => s.delete('pasta')); } catch (e) { /* nada */ }
    },
    async permissao(handle, pedir) {
      const op = { mode: 'readwrite' };
      if (typeof handle.queryPermission !== 'function') return 'granted';
      let p = await handle.queryPermission(op);
      if (p !== 'granted' && pedir) p = await handle.requestPermission(op);
      return p;
    },
    async escolher() {
      return window.showDirectoryPicker({ id: 'conciliador-solutta-dados', mode: 'readwrite', startIn: 'documents' });
    },
  };

  // ------------------------------------------------------------------
  // A implementação
  // opcoes: { seletor, usuario: () => ({ nome, podeLancar }), rotulo }
  // ------------------------------------------------------------------
  function criar(opcoes) {
    const op = opcoes || {};
    const seletor = op.seletor || seletorNavegador;
    const usuario = op.usuario || (() => ({ nome: 'sem nome', podeLancar: true }));
    let raiz = null;
    let config = null;
    const pastasDeEmpresa = new Map();   // codigo -> nome da pasta

    function quem() {
      const u = usuario() || {};
      return u.nome || 'sem nome';
    }

    function exigirConexao() {
      if (!raiz) throw erro('NaoConectado', 'A pasta de dados não está conectada. Clique em "Reconectar a pasta de dados".');
    }

    // Situação para a tela: suportado? há pasta lembrada? permissão?
    async function situacao() {
      if (raiz) return { suportado: true, conectado: true, nome: raiz.name, permissao: 'granted' };
      if (typeof seletor.suportado === 'function' && !seletor.suportado()) return { suportado: false, conectado: false };
      const h = await seletor.guardada();
      if (!h) return { suportado: true, conectado: false, lembrada: false };
      let permissao = 'prompt';
      try { permissao = await seletor.permissao(h, false); } catch (e) { permissao = 'prompt'; }
      return { suportado: true, conectado: false, lembrada: true, nome: h.name, permissao };
    }

    /**
     * Conecta a pasta de dados.
     * @param pedido { escolherNova: bool, aceitarPastaComOutrosArquivos: bool }
     * @returns { ok, nome, criada } ou { ok: false, precisaConfirmar: texto }
     */
    async function conectar(pedido) {
      const p = pedido || {};
      let h = null;
      if (!p.escolherNova) h = await seletor.guardada();
      if (!h) {
        try {
          h = await seletor.escolher();
        } catch (e) {
          if (e && e.name === 'AbortError') return { ok: false, cancelado: true };
          if (e && (e.name === 'SecurityError' || e.name === 'TypeError' || e.name === 'NotAllowedError')) {
            throw erro('PastaRecusada', 'O navegador não deixa usar essa pasta (pasta do sistema ou raiz do disco). ' +
              'Crie uma pasta própria, por exemplo "C:\\Conciliador Solutta - Dados", e escolha ela.');
          }
          throw e;
        }
      }
      const perm = await seletor.permissao(h, true);
      if (perm !== 'granted') {
        return { ok: false, semPermissao: true, nome: h.name };
      }
      let cfg = await lerJson(h, '_config.json');
      let criada = false;
      if (!cfg) {
        const itens = (await listar(h)).filter((x) => IGNORAR_NA_PASTA_VAZIA.indexOf(x.nome.toLowerCase()) < 0);
        if (itens.length && !p.aceitarPastaComOutrosArquivos) {
          return { ok: false, precisaConfirmar: 'A pasta "' + h.name + '" já tem ' + itens.length + ' item(ns) e não é uma pasta do Conciliador. ' +
            'O recomendado é uma pasta vazia só para o programa. Usar esta mesmo assim?', nome: h.name };
        }
        cfg = { programa: PROGRAMA, formato: FORMATO, criadaEm: Util.agoraISO(), criadaPor: quem() };
        await gravar(h, '_config.json', JSON.stringify(cfg, null, 2));
        if (!(await existe(h, 'empresas.json'))) await gravar(h, 'empresas.json', '[]');
        criada = true;
      } else if (cfg.programa !== PROGRAMA) {
        throw erro('PastaDeOutroPrograma', 'A pasta "' + h.name + '" é de outro programa (' + (cfg.programa || 'desconhecido') + '). Escolha outra.');
      } else if (Number(cfg.formato) > FORMATO) {
        throw erro('FormatoNovo', 'Esta pasta foi gravada por uma versão mais nova do Conciliador (formato ' + cfg.formato + '). Atualize o programa.');
      }
      raiz = h;
      config = cfg;
      pastasDeEmpresa.clear();
      if (typeof seletor.lembrar === 'function') await seletor.lembrar(h);
      if (criada) await registrarNoLog({ acao: 'pasta-criada', alvo: h.name });
      return { ok: true, nome: h.name, criada };
    }

    async function desconectar(esquecer) {
      raiz = null;
      config = null;
      pastasDeEmpresa.clear();
      if (esquecer && typeof seletor.esquecer === 'function') await seletor.esquecer();
    }

    async function estaConectado() { return !!raiz; }

    async function descricao() {
      if (!raiz) return 'Pasta de dados não conectada';
      return (op.rotulo || 'Pasta') + ': ' + raiz.name;
    }

    async function quemSou() {
      const u = usuario() || {};
      return { nome: u.nome || 'sem nome', podeLancar: u.podeLancar !== false };
    }

    // ------------------------------------------------------------------
    // Carteira
    // ------------------------------------------------------------------
    function validarCodigo(codigo) {
      const c = String(codigo || '').trim();
      if (!c) throw erro('Validacao', 'Informe o código da empresa.');
      if (!/^[0-9A-Za-z._-]{1,20}$/.test(c)) throw erro('Validacao', 'O código da empresa aceita só letras, números, ponto, traço e sublinhado (até 20).');
      return c;
    }

    async function empresas() {
      exigirConexao();
      const lista = (await lerJson(raiz, 'empresas.json')) || [];
      return lista.slice().sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
    }

    function nomeCurto(nome) {
      // Tira os caracteres proibidos ANTES de contar as palavras ("A / B" não conta "/" como palavra).
      return Util.nomeSeguro(nome, 200).split(/\s+/).filter(Boolean).slice(0, 4).join(' ').slice(0, 40);
    }

    async function pastaDaEmpresa(codigo, criarSeFaltar) {
      exigirConexao();
      const c = validarCodigo(codigo);
      const dirEmpresas = await pasta(raiz, ['empresas'], true);
      if (pastasDeEmpresa.has(c)) return pasta(dirEmpresas, [pastasDeEmpresa.get(c)], criarSeFaltar);
      for (const item of await listar(dirEmpresas)) {
        if (item.tipo === 'directory' && (item.nome === c || item.nome.startsWith(c + ' - '))) {
          pastasDeEmpresa.set(c, item.nome);
          return item.handle;
        }
      }
      if (!criarSeFaltar) return null;
      const lista = (await lerJson(raiz, 'empresas.json')) || [];
      const emp = lista.find((e) => String(e.codigo) === c);
      const nome = Util.nomeSeguro(c + (emp && emp.nome ? ' - ' + nomeCurto(emp.nome) : ''), 60);
      pastasDeEmpresa.set(c, nome);
      return pasta(dirEmpresas, [nome], true);
    }

    // Listas por chave guardadas na empresa (passos inativos por família, abas ocultas por
    // passo): só nomes simples, sem repetição; lista vazia some.
    function limparMapaDeListas(valor) {
      const limpo = {};
      if (!valor || typeof valor !== 'object') return limpo;
      for (const chave of Object.keys(valor)) {
        if (!/^[a-z0-9_]{1,30}$/.test(chave) || !Array.isArray(valor[chave])) continue;
        const itens = Array.from(new Set(valor[chave].filter((p) => typeof p === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(p)))).sort();
        if (itens.length) limpo[chave] = itens;
      }
      return limpo;
    }

    function limparPapeisDeConta(valor) {
      const limpo = {};
      if (!valor || typeof valor !== 'object') return limpo;
      const validos = { fornecedores: ['principal', 'adiantamento'], clientes: ['principal', 'adiantamento'] };
      for (const codigo of Object.keys(valor)) {
        const p = valor[codigo];
        if (!/^[0-9A-Za-z._-]{1,30}$/.test(codigo) || !p || !validos[p.familia] || validos[p.familia].indexOf(p.papel) < 0) continue;
        limpo[codigo] = { familia: p.familia, papel: p.papel };
      }
      return limpo;
    }

    function limparMapaBalancete(valor) {
      if (!valor || typeof valor !== 'object' || !valor.colunas || typeof valor.colunas !== 'object') return null;
      const colunas = {};
      ['conta', 'titulo', 'reduzido', 'saldoAnterior', 'dcAnterior', 'debitos', 'creditos', 'saldoAtual', 'dcAtual'].forEach((k) => {
        const v = valor.colunas[k];
        if (Number.isInteger(v) && v >= 0 && v < 200) colunas[k] = v;
      });
      if (!['conta', 'saldoAnterior', 'debitos', 'creditos', 'saldoAtual'].every((k) => colunas[k] !== undefined)) return null;
      return { aba: Number.isInteger(valor.aba) && valor.aba >= 0 && valor.aba < 100 ? valor.aba : 0, colunas };
    }

    // Linhas da DRE da empresa: { contas: { '<conta>': '<id da linha>' | 'fora' }, rotulos: { '<id>': 'nome' },
    // conferidoEm, conferidoPor }. Sem nenhuma conta, some (a DRE volta ao modelo ou à sugestão).
    function limparMapaDre(valor) {
      if (!valor || typeof valor !== 'object' || !valor.contas || typeof valor.contas !== 'object') return null;
      const contas = {};
      let n = 0;
      for (const k of Object.keys(valor.contas)) {
        const v = valor.contas[k];
        if (!/^[0-9A-Za-z._-]{1,40}$/.test(k) || typeof v !== 'string' || !/^[A-Za-z]{2,30}$/.test(v)) continue;
        contas[k] = v;
        if (++n >= 5000) break;
      }
      if (!n) return null;
      const rotulos = {};
      if (valor.rotulos && typeof valor.rotulos === 'object') {
        Object.keys(valor.rotulos).slice(0, 60).forEach((k) => {
          const t = valor.rotulos[k];
          if (/^[A-Za-z]{2,30}$/.test(k) && typeof t === 'string' && t.trim()) rotulos[k] = t.replace(/\s+/g, ' ').trim().slice(0, 80);
        });
      }
      const limpo = { contas, rotulos };
      if (typeof valor.conferidoEm === 'string' && valor.conferidoEm.length <= 40) limpo.conferidoEm = valor.conferidoEm;
      if (typeof valor.conferidoPor === 'string' && valor.conferidoPor.trim()) limpo.conferidoPor = valor.conferidoPor.trim().slice(0, 80);
      return limpo;
    }

    // Quem assina o balanço, a DRE e o fluxo de caixa (Dony, 22/09/2026: "emitir o balanço e a DRE para imprimir e assinar pro
    // cliente"): { local, responsavel: { nome, cargo, cpf }, contador: { nome, crc, cpf } }; só texto, com tamanho máximo.
    function limparAssinaturas(valor) {
      if (!valor || typeof valor !== 'object') return null;
      const texto = (x, n) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
      const pessoa = (p, campos) => {
        const o = {};
        campos.forEach(([k, n]) => { const t = texto(p && p[k], n); if (t) o[k] = t; });
        return Object.keys(o).length ? o : null;
      };
      const limpo = {};
      const local = texto(valor.local, 80);
      if (local) limpo.local = local;
      const responsavel = pessoa(valor.responsavel, [['nome', 100], ['cargo', 60], ['cpf', 20]]);
      if (responsavel) limpo.responsavel = responsavel;
      const contador = pessoa(valor.contador, [['nome', 100], ['crc', 30], ['cpf', 20]]);
      if (contador) limpo.contador = contador;
      return Object.keys(limpo).length ? limpo : null;
    }

    async function salvarEmpresa(empresa) {
      exigirConexao();
      const codigo = validarCodigo(empresa && empresa.codigo);
      const nome = String(empresa.nome || '').trim();
      if (!nome) throw erro('Validacao', 'Informe o nome da empresa.');
      const cnpj = Util.limparCnpj(empresa.cnpj || '');
      if (cnpj && !Util.cnpjValido(cnpj)) throw erro('Validacao', 'O CNPJ ' + (empresa.cnpj || '') + ' não é válido (dígito verificador não confere).');
      const lista = (await lerJson(raiz, 'empresas.json')) || [];
      const agora = Util.agoraISO();
      const i = lista.findIndex((e) => String(e.codigo) === codigo);
      const anterior = i >= 0 ? lista[i] : null;
      const registro = {
        codigo, nome, cnpj,
        regime: String(empresa.regime || '').trim(),
        atividade: String(empresa.atividade || '').trim(),
        grupo: String(empresa.grupo || '').trim(),
        criadoEm: anterior ? anterior.criadoEm : agora,
        criadoPor: anterior ? (anterior.criadoPor || quem()) : quem(),
        atualizadoEm: agora,
        atualizadoPor: quem(),
      };
      // Passos que a empresa não usa, por família (Dony, 14/09/2026: "inativar e poder ativar
      // quando passar a ter"): { fornecedores: ['passo1', 'passo11'] }. Sem o campo na chamada
      // (ex.: editar o cadastro), fica o que já estava.
      const inativos = limparMapaDeListas(empresa.passosInativos !== undefined ? empresa.passosInativos : (anterior && anterior.passosInativos));
      if (Object.keys(inativos).length) registro.passosInativos = inativos;
      // Abas ocultas de cada passo (Dony, 14/09/2026: no ③ com relatório de contas a pagar só
      // interessa o "Conciliar A × B"): { passo3: ['diferencas', 'razao'] }. Mesma regra.
      const abas = limparMapaDeListas(empresa.abasOcultas !== undefined ? empresa.abasOcultas : (anterior && anterior.abasOcultas));
      if (Object.keys(abas).length) registro.abasOcultas = abas;
      // Papel escolhido à mão para uma conta que o programa não reconheceu (Dony, 15/09/2026: razão
      // de adiantamento com o nome da conta cortado): { '634': { familia: 'fornecedores', papel: 'adiantamento' } }.
      const papeis = limparPapeisDeConta(empresa.papeisDeConta !== undefined ? empresa.papeisDeConta : (anterior && anterior.papeisDeConta));
      if (Object.keys(papeis).length) registro.papeisDeConta = papeis;
      // Logo e cor do relatório para o cliente (Dony, 18/09/2026: "um lugar em que eu coloque o logo da
      // empresa para sair no relatório"): imagem já reduzida pela tela (data URL de até ~400 KB) e cor
      // #rrggbb. Mesma regra: sem o campo na chamada, fica o que já estava; vazio tira.
      const logo = empresa.logo !== undefined ? empresa.logo : (anterior && anterior.logo);
      if (typeof logo === 'string' && logo.length <= 560000 && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo)) registro.logo = logo;
      // Colunas do balancete indicadas por quem usa (Dony, 18/09/2026: "eu indico as colunas no primeiro e
      // ele guarda"): { aba, colunas: { conta, titulo, saldoAnterior, debitos, creditos, saldoAtual, dcAnterior, dcAtual } }.
      const mapaBal = limparMapaBalancete(empresa.mapaBalancete !== undefined ? empresa.mapaBalancete : (anterior && anterior.mapaBalancete));
      if (mapaBal) registro.mapaBalancete = mapaBal;
      // Linhas da DRE conferidas por quem usa (Dony, 18/09/2026: cada empresa com o seu plano de contas).
      const mapaDre = limparMapaDre(empresa.mapaDre !== undefined ? empresa.mapaDre : (anterior && anterior.mapaDre));
      if (mapaDre) registro.mapaDre = mapaDre;
      const cor = empresa.corRelatorio !== undefined ? empresa.corRelatorio : (anterior && anterior.corRelatorio);
      if (typeof cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(cor)) registro.corRelatorio = cor.toLowerCase();
      const assinaturas = limparAssinaturas(empresa.assinaturas !== undefined ? empresa.assinaturas : (anterior && anterior.assinaturas));
      if (assinaturas) registro.assinaturas = assinaturas;
      if (i >= 0) lista[i] = registro; else lista.push(registro);
      await gravar(raiz, 'empresas.json', JSON.stringify(lista, null, 2));
      await pastaDaEmpresa(codigo, true);
      await registrarNoLog({ codigo, acao: anterior ? 'empresa-editada' : 'empresa-cadastrada', alvo: codigo, detalhe: nome });
      return registro;
    }

    async function apagarEmpresa(codigo) {
      exigirConexao();
      const c = validarCodigo(codigo);
      const arqs = await arquivos(c);
      const concs = await conciliacoes(c);
      if (arqs.length || concs.length) {
        throw erro('EmpresaComDados', 'A empresa ' + c + ' tem ' + arqs.length + ' arquivo(s) e ' + concs.length + ' conciliação(ões) guardados. Apague os arquivos antes.');
      }
      const lista = ((await lerJson(raiz, 'empresas.json')) || []).filter((e) => String(e.codigo) !== c);
      await gravar(raiz, 'empresas.json', JSON.stringify(lista, null, 2));
      await registrarNoLog({ codigo: c, acao: 'empresa-apagada', alvo: c });
      return true;
    }

    // ------------------------------------------------------------------
    // Arquivos
    // ------------------------------------------------------------------
    function partesDoId(id) {
      const m = String(id || '').match(/^([A-Z]+)-(.+)-(\d{4}-\d{2})-([0-9A-Z]{8})$/);
      if (!m) return null;
      return { prefixo: m[1], codigo: m[2], anoMes: m[3], hash: m[4] };
    }

    async function lerIndice(dirEmpresa) {
      const dirArq = await pasta(dirEmpresa, ['arquivos'], true);
      let indice = await lerJson(dirArq, '_indice.json');
      if (!Array.isArray(indice)) {
        // Reconstrói o índice lendo cada <id>.json (o índice é só um atalho).
        indice = [];
        for (const mes of await listar(dirArq)) {
          if (mes.tipo !== 'directory' || !/^\d{4}-\d{2}$/.test(mes.nome)) continue;
          for (const item of await listar(mes.handle)) {
            if (item.tipo !== 'file' || !/^A-.+\.json$/.test(item.nome)) continue;
            const doc = await lerJson(mes.handle, item.nome);
            if (doc && doc.meta) indice.push(doc.meta);
          }
        }
        await gravar(dirArq, '_indice.json', JSON.stringify(indice, null, 2));
      }
      return { dirArq, indice };
    }

    async function arquivos(codigo) {
      exigirConexao();
      const dir = await pastaDaEmpresa(codigo, false);
      if (!dir) return [];
      const { indice } = await lerIndice(dir);
      return indice.slice().sort((a, b) => Util.paraMs(b.enviadoEm) - Util.paraMs(a.enviadoEm));
    }

    async function conteudoDoArquivo(id) {
      exigirConexao();
      const p = partesDoId(id);
      if (!p || p.prefixo !== 'A') throw erro('Validacao', 'Identificador de arquivo inválido: ' + id);
      const dir = await pastaDaEmpresa(p.codigo, false);
      const dirMes = dir && await pasta(dir, ['arquivos', p.anoMes], false);
      const doc = dirMes && await lerJson(dirMes, id + '.json');
      if (!doc) throw erro('NaoEncontrado', 'O arquivo ' + id + ' não está mais na pasta de dados.');
      return doc.conteudo;
    }

    async function bytesOriginais(id) {
      exigirConexao();
      const p = partesDoId(id);
      const dir = p && await pastaDaEmpresa(p.codigo, false);
      const dirMes = dir && await pasta(dir, ['arquivos', p.anoMes], false);
      const doc = dirMes && await lerJson(dirMes, id + '.json');
      if (!doc) return null;
      return lerBytes(dirMes, doc.meta.original);
    }

    /**
     * Guarda um arquivo lido (uma conta por vez, no caso de razão com várias contas).
     * meta: { tipo, arquivo, periodo, competencia, conta, lancamentos, titulos, hashDoConteudo }
     * @returns { meta, jaExistia, novaVersao }
     */
    async function guardarArquivo(codigo, meta, conteudo, bytes) {
      exigirConexao();
      const c = validarCodigo(codigo);
      if (!meta || !meta.tipo || !meta.competencia || !meta.arquivo) throw erro('Validacao', 'Faltam dados do arquivo (tipo, competência ou nome).');
      const anoMes = Util.anoMes(meta.competencia);
      if (!anoMes) throw erro('Validacao', 'Competência inválida: ' + meta.competencia);
      const hashDoConteudo = meta.hashDoConteudo || (bytes ? Util.hashBytes(bytes) : Util.hash8(JSON.stringify(conteudo)));
      const contaCodigo = meta.conta && meta.conta.codigo ? String(meta.conta.codigo) : '';
      // meta.recarga: o mesmo conteúdo carregado de novo como VERSÃO NOVA do lugar (voltar para uma
      // versão antiga, Dony 16/09/2026) — ganha outro id e fica como a mais nova.
      const recarga = meta.recarga ? '|recarga ' + meta.recarga : '';
      const id = 'A-' + c + '-' + anoMes + '-' + Util.hash8(hashDoConteudo + '|' + meta.tipo + '|' + contaCodigo + recarga);

      const dirEmpresa = await pastaDaEmpresa(c, true);
      const { dirArq, indice } = await lerIndice(dirEmpresa);
      const igual = indice.find((m) => m.id === id);
      if (igual) return { meta: igual, jaExistia: true, novaVersao: false };

      const dirMes = await pasta(dirArq, [anoMes], true);
      // Versão: mesmo nome de arquivo, mesmo período (competência), mesma conta e tipo.
      const mesmoNome = indice.filter((m) => m.competencia === meta.competencia && m.tipo === meta.tipo &&
        String(m.arquivo).toLowerCase() === String(meta.arquivo).toLowerCase() &&
        ((m.conta && m.conta.codigo) || '') === contaCodigo);
      const versao = mesmoNome.length + 1;

      // Original: cópia fiel. Nunca sobrescreve outro conteúdo com o mesmo nome.
      let original = null;
      if (bytes) {
        const nomeBase = Util.nomeSeguro(meta.arquivo, 120);
        const ponto = nomeBase.lastIndexOf('.');
        const radical = ponto > 0 ? nomeBase.slice(0, ponto) : nomeBase;
        const ext = ponto > 0 ? nomeBase.slice(ponto) : '';
        for (let n = 1; n < 1000; n++) {
          const candidato = n === 1 ? nomeBase : radical + ' (versão ' + n + ')' + ext;
          const atual = await lerBytes(dirMes, candidato);
          if (atual === null) { await gravar(dirMes, candidato, bytes); original = candidato; break; }
          if (Util.hashBytes(atual) === Util.hashBytes(bytes)) { original = candidato; break; }
        }
      }

      const registro = Object.assign({}, meta, {
        id, codigo: c, competencia: meta.competencia, hashDoConteudo, versao,
        original, enviadoPor: quem(), enviadoEm: Util.agoraISO(),
        atualizadoPor: quem(), atualizadoEm: Util.agoraISO(),
      });
      await gravar(dirMes, id + '.json', JSON.stringify({ meta: registro, conteudo }));
      indice.push(registro);
      await gravar(dirArq, '_indice.json', JSON.stringify(indice, null, 2));
      await registrarNoLog({ codigo: c, acao: 'arquivo-guardado', alvo: id,
        detalhe: meta.arquivo + (contaCodigo ? ' · conta ' + contaCodigo : '') + (versao > 1 ? ' · versão ' + versao : '') });
      return { meta: registro, jaExistia: false, novaVersao: versao > 1 };
    }

    async function lixeira() {
      return pasta(raiz, ['_apagados', carimboDePasta()], true);
    }

    // Um arquivo que a tela apagou (pasta _apagados), a cópia mais recente: { meta, conteudo, apagadoEm }
    // ou null. Serve para comparar a versão antiga com a nova quando um arquivo foi trocado.
    async function arquivoApagado(id) {
      exigirConexao();
      const p = partesDoId(id);
      if (!p || p.prefixo !== 'A') return null;
      const dirEmpresa = await pastaDaEmpresa(p.codigo, false);
      const dirApagados = await pasta(raiz, ['_apagados'], false);
      if (!dirEmpresa || !dirApagados) return null;
      const carimbos = (await listar(dirApagados)).filter((x) => x.tipo === 'directory').map((x) => x.nome).sort().reverse();
      for (const c of carimbos) {
        try {
          const dir = await pasta(dirApagados, [c, 'empresas', dirEmpresa.name, 'arquivos', p.anoMes], false);
          const doc = dir && await lerJson(dir, id + '.json');
          if (doc && doc.conteudo) return { meta: doc.meta || null, conteudo: doc.conteudo, apagadoEm: c };
        } catch (e) { /* cópia estragada: tenta a próxima */ }
      }
      return null;
    }

    async function apagarArquivo(id) {
      exigirConexao();
      const p = partesDoId(id);
      if (!p || p.prefixo !== 'A') throw erro('Validacao', 'Identificador de arquivo inválido: ' + id);
      const dirEmpresa = await pastaDaEmpresa(p.codigo, false);
      if (!dirEmpresa) return false;
      const { dirArq, indice } = await lerIndice(dirEmpresa);
      const meta = indice.find((m) => m.id === id);
      const dirMes = await pasta(dirArq, [p.anoMes], false);
      const destino = await lixeira();
      const destinoEmpresa = await pasta(destino, ['empresas', dirEmpresa.name, 'arquivos', p.anoMes], true);
      await moverArquivo(dirMes, id + '.json', destinoEmpresa);
      const resto = indice.filter((m) => m.id !== id);
      // O original só sai se nenhum outro registro usa a mesma cópia.
      if (meta && meta.original && !resto.some((m) => m.competencia === meta.competencia && m.original === meta.original)) {
        await moverArquivo(dirMes, meta.original, destinoEmpresa);
      }
      await gravar(dirArq, '_indice.json', JSON.stringify(resto, null, 2));
      await registrarNoLog({ codigo: p.codigo, acao: 'arquivo-apagado', alvo: id, detalhe: meta ? meta.arquivo : '' });
      return true;
    }

    // ------------------------------------------------------------------
    // Conciliações (servem também para checklist, conferências e auditorias)
    // ------------------------------------------------------------------
    async function conciliacoes(codigo, competencia) {
      exigirConexao();
      const dir = await pastaDaEmpresa(codigo, false);
      const dirConc = dir && await pasta(dir, ['conciliacoes'], false);
      if (!dirConc) return [];
      const fim = competencia ? '-' + Util.anoMes(competencia) + '.json' : '.json';
      const r = [];
      for (const item of await listar(dirConc)) {
        if (item.tipo !== 'file' || !item.nome.endsWith(fim)) continue;
        const doc = await lerJson(dirConc, item.nome);
        if (doc) r.push(doc);
      }
      return r;
    }

    async function salvarConciliacao(registro) {
      exigirConexao();
      if (!registro || !registro.id || !registro.codigo || !registro.tipo || !registro.competencia) {
        throw erro('Validacao', 'Conciliação sem id, empresa, tipo ou competência.');
      }
      if (!/^[0-9A-Za-z._-]+$/.test(registro.id)) throw erro('Validacao', 'Identificador de conciliação inválido: ' + registro.id);
      const dir = await pastaDaEmpresa(registro.codigo, true);
      const dirConc = await pasta(dir, ['conciliacoes'], true);
      const nome = registro.id + '.json';
      const anterior = await lerJson(dirConc, nome);
      const agora = Util.agoraISO();
      if (anterior) {
        const idade = Util.paraMs(agora) - Util.paraMs(anterior.atualizadoEm);
        if (idade >= INTERVALO_VERSAO_MS || anterior.situacao !== registro.situacao) {
          const dirVer = await pasta(dirConc, ['_versoes', registro.id], true);
          await gravar(dirVer, carimboDePasta(anterior.atualizadoEm) + '.json', JSON.stringify(anterior));
        }
      }
      const novo = Object.assign({}, registro, {
        criadoEm: anterior ? (anterior.criadoEm || anterior.atualizadoEm) : agora,
        atualizadoEm: agora,
        atualizadoPor: quem(),
      });
      await gravar(dirConc, nome, JSON.stringify(novo));
      return novo;
    }

    async function apagarConciliacao(id) {
      exigirConexao();
      const p = String(id || '').match(/^F-(.+?)-/);
      const lista = await empresas();
      const codigo = p ? lista.map((e) => String(e.codigo)).filter((c) => String(id).startsWith('F-' + c + '-')).sort((a, b) => b.length - a.length)[0] : null;
      if (!codigo) throw erro('Validacao', 'Identificador de conciliação inválido: ' + id);
      const dir = await pastaDaEmpresa(codigo, false);
      const dirConc = dir && await pasta(dir, ['conciliacoes'], false);
      if (!dirConc) return false;
      const destino = await pasta(await lixeira(), ['empresas', dir.name, 'conciliacoes'], true);
      const ok = await moverArquivo(dirConc, id + '.json', destino);
      if (ok) await registrarNoLog({ codigo, acao: 'conciliacao-apagada', alvo: id });
      return ok;
    }

    async function versoes(id) {
      exigirConexao();
      const lista = await empresas();
      const codigo = lista.map((e) => String(e.codigo)).filter((c) => String(id).startsWith('F-' + c + '-')).sort((a, b) => b.length - a.length)[0];
      if (!codigo) return [];
      const dir = await pastaDaEmpresa(codigo, false);
      const dirVer = dir && await pasta(dir, ['conciliacoes', '_versoes', id], false);
      const r = [];
      for (const item of await listar(dirVer)) {
        if (item.tipo !== 'file') continue;
        const m = item.nome.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.json$/);
        r.push({ nome: item.nome, quando: m ? m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4] + 'Z' : null });
      }
      return r.sort((a, b) => Util.paraMs(b.quando) - Util.paraMs(a.quando));
    }

    // ------------------------------------------------------------------
    // Cópias congeladas (imutáveis)
    // ------------------------------------------------------------------
    async function congelar(codigo, meta, conteudo) {
      exigirConexao();
      const c = validarCodigo(codigo);
      const texto = JSON.stringify(conteudo);
      const anoMes = Util.anoMes(meta && meta.competencia) || Util.anoMes(Util.competenciaDe(Util.hoje()));
      const id = 'C-' + c + '-' + anoMes + '-' + Util.hash8(texto + '|' + JSON.stringify(meta && meta.conta || ''));
      const dir = await pasta(await pastaDaEmpresa(c, true), ['congelados'], true);
      if (await existe(dir, id + '.json')) return { id, jaExistia: true };
      await gravar(dir, id + '.json', JSON.stringify({ id, meta: Object.assign({}, meta, { tipo: 'razao_congelado' }), conteudo,
        congeladoEm: Util.agoraISO(), congeladoPor: quem() }));
      await registrarNoLog({ codigo: c, acao: 'congelado', alvo: id, detalhe: meta && meta.arquivo });
      return { id, jaExistia: false };
    }

    async function congelado(id) {
      exigirConexao();
      const p = partesDoId(id);
      if (!p || p.prefixo !== 'C') throw erro('Validacao', 'Identificador de cópia congelada inválido: ' + id);
      const dir = await pastaDaEmpresa(p.codigo, false);
      const dirCong = dir && await pasta(dir, ['congelados'], false);
      return dirCong ? lerJson(dirCong, id + '.json') : null;
    }

    // ------------------------------------------------------------------
    // Rastro
    // ------------------------------------------------------------------
    async function registrarNoLog(acao) {
      if (!raiz) return false;
      const quando = Util.agoraISO();
      const linha = { quando, quem: quem(), codigo: acao.codigo || '', acao: acao.acao || '', alvo: acao.alvo || '', detalhe: acao.detalhe || '' };
      const dir = await pasta(raiz, ['log'], true);
      await acrescentar(dir, quando.slice(0, 7) + '.jsonl', JSON.stringify(linha) + String.fromCharCode(10));
      return true;
    }

    async function lerLog(anoMes) {
      exigirConexao();
      const dir = await pasta(raiz, ['log'], false);
      const t = dir && await lerTexto(dir, anoMes + '.jsonl');
      if (!t) return [];
      return t.split(String.fromCharCode(10)).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    }

    // ------------------------------------------------------------------
    // Mudança de casa: o pacote que o servidor futuro importa (Parte 3.4)
    // ------------------------------------------------------------------
    async function exportarTudo() {
      exigirConexao();
      const pacote = { programa: PROGRAMA, formato: FORMATO, exportadoEm: Util.agoraISO(), exportadoPor: quem(),
        empresas: await empresas(), arquivos: [], conciliacoes: [], congelados: [], log: [] };
      for (const emp of pacote.empresas) {
        for (const meta of await arquivos(emp.codigo)) {
          const conteudo = await conteudoDoArquivo(meta.id);
          const b = await bytesOriginais(meta.id);
          pacote.arquivos.push({ meta, conteudo, original: b ? bytesParaBase64(b) : null });
        }
        pacote.conciliacoes.push.apply(pacote.conciliacoes, await conciliacoes(emp.codigo));
        const dir = await pastaDaEmpresa(emp.codigo, false);
        const dirCong = dir && await pasta(dir, ['congelados'], false);
        for (const item of await listar(dirCong)) {
          if (item.tipo === 'file' && item.nome.endsWith('.json')) pacote.congelados.push(await lerJson(dirCong, item.nome));
        }
      }
      const dirLog = await pasta(raiz, ['log'], false);
      for (const item of await listar(dirLog)) {
        if (item.tipo === 'file' && /^\d{4}-\d{2}\.jsonl$/.test(item.nome)) pacote.log.push.apply(pacote.log, await lerLog(item.nome.slice(0, 7)));
      }
      return pacote;
    }

    async function importarTudo(pacote) {
      exigirConexao();
      if (!pacote || pacote.programa !== PROGRAMA) throw erro('Validacao', 'Este pacote não é do Conciliador Solutta.');
      const r = { empresas: 0, arquivos: 0, conciliacoes: 0, congelados: 0, log: 0 };
      const listaAtual = (await lerJson(raiz, 'empresas.json')) || [];
      for (const e of pacote.empresas || []) {
        const i = listaAtual.findIndex((x) => String(x.codigo) === String(e.codigo));
        if (i < 0 || Util.paraMs(e.atualizadoEm) > Util.paraMs(listaAtual[i].atualizadoEm)) {
          if (i < 0) listaAtual.push(e); else listaAtual[i] = e;
          r.empresas++;
        }
      }
      await gravar(raiz, 'empresas.json', JSON.stringify(listaAtual, null, 2));
      for (const e of pacote.empresas || []) await pastaDaEmpresa(e.codigo, true);
      for (const a of pacote.arquivos || []) {
        const meta = a.meta;
        const dirEmpresa = await pastaDaEmpresa(meta.codigo, true);
        const { dirArq, indice } = await lerIndice(dirEmpresa);
        if (indice.some((m) => m.id === meta.id)) continue;
        const dirMes = await pasta(dirArq, [Util.anoMes(meta.competencia)], true);
        if (a.original && meta.original && !(await existe(dirMes, meta.original))) await gravar(dirMes, meta.original, base64ParaBytes(a.original));
        await gravar(dirMes, meta.id + '.json', JSON.stringify({ meta, conteudo: a.conteudo }));
        indice.push(meta);
        await gravar(dirArq, '_indice.json', JSON.stringify(indice, null, 2));
        r.arquivos++;
      }
      for (const c of pacote.conciliacoes || []) {
        const dir = await pasta(await pastaDaEmpresa(c.codigo, true), ['conciliacoes'], true);
        const atual = await lerJson(dir, c.id + '.json');
        if (!atual || Util.paraMs(c.atualizadoEm) > Util.paraMs(atual.atualizadoEm)) {
          await gravar(dir, c.id + '.json', JSON.stringify(c));
          r.conciliacoes++;
        }
      }
      for (const c of pacote.congelados || []) {
        if (!c || !c.id) continue;
        const p = partesDoId(c.id);
        const dir = await pasta(await pastaDaEmpresa(p.codigo, true), ['congelados'], true);
        if (!(await existe(dir, c.id + '.json'))) { await gravar(dir, c.id + '.json', JSON.stringify(c)); r.congelados++; }
      }
      const dirLog = await pasta(raiz, ['log'], true);
      const porMes = new Map();
      for (const l of pacote.log || []) {
        const k = String(l.quando || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(k)) continue;
        if (!porMes.has(k)) porMes.set(k, []);
        porMes.get(k).push(l);
      }
      for (const [k, linhas] of porMes) {
        const existentes = new Set((await lerLog(k)).map((l) => JSON.stringify(l)));
        const novas = linhas.filter((l) => !existentes.has(JSON.stringify(l)));
        if (novas.length) {
          await acrescentar(dirLog, k + '.jsonl', novas.map((l) => JSON.stringify(l)).join(String.fromCharCode(10)) + String.fromCharCode(10));
          r.log += novas.length;
        }
      }
      await registrarNoLog({ acao: 'pacote-importado', detalhe: JSON.stringify(r) });
      return r;
    }

    return {
      // contrato
      conectar, estaConectado, descricao, quemSou,
      empresas, salvarEmpresa, apagarEmpresa,
      arquivos, conteudoDoArquivo, guardarArquivo, apagarArquivo, arquivoApagado,
      conciliacoes, salvarConciliacao, apagarConciliacao, versoes,
      congelar, congelado,
      registrarNoLog,
      exportarTudo, importarTudo,
      // extras desta casa
      situacao, desconectar, bytesOriginais, lerLog,
      modo: 'pasta',
    };
  }

  return { criar, seletorNavegador, FORMATO, PROGRAMA };
});
