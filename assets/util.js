/*
 * Conciliador Solutta — util.js
 * Peças pequenas usadas por todos os módulos: dinheiro em centavos, datas,
 * textos, CNPJ/CPF, impressão digital (hash) e nomes de arquivo seguros.
 * Formato UMD: roda no navegador (<script src>) e no Node (provas).
 * Não mexe em tela nem em armazenamento.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Util = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------
  // Dinheiro
  // Parte 4: dinheiro em CENTAVOS INTEIROS para casar e somar. No JavaScript
  // 0,1 + 0,2 não dá 0,3, e um centavo fantasma separa um par.
  // ------------------------------------------------------------------
  function centavos(valor) {
    const n = Number(valor);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  // Converte o que vier de uma planilha em número (reais), ou null.
  // Formatos vistos: 1.234,56 · 1234.56 · R$ 5,917.66 · -R$ 5.78 · (1.234,56) · 1.234,56 C
  // O separador decimal é o ÚLTIMO ponto ou vírgula, com até 2 dígitos depois.
  // Parêntese, sinal no fim ou "C" querem dizer credor (negativo); "D" é devedor.
  function paraNumero(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return isFinite(x) ? x : null;
    let s = String(x).trim();
    if (!s) return null;
    let negativo = false;
    if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1).trim(); }
    const sufixo = s.match(/\s*([CD])$/i);
    if (sufixo) {
      if (sufixo[1].toUpperCase() === 'C') negativo = !negativo;
      s = s.slice(0, s.length - sufixo[0].length).trim();
    }
    if (/-$/.test(s)) { negativo = !negativo; s = s.slice(0, -1).trim(); }
    if (/^-/.test(s)) { negativo = !negativo; s = s.slice(1).trim(); }
    s = s.replace(/^R\$\s*/i, '');
    if (/^-/.test(s)) { negativo = !negativo; s = s.slice(1).trim(); }
    s = s.replace(/\s+/g, '');
    if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
    const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    let inteiro = s, decimal = '';
    if (ultimo >= 0) {
      const depois = s.slice(ultimo + 1);
      if (depois.length >= 1 && depois.length <= 2) {
        inteiro = s.slice(0, ultimo);
        decimal = depois;
      }
    }
    inteiro = inteiro.replace(/[.,]/g, '');
    const n = Number((inteiro || '0') + (decimal ? '.' + decimal : ''));
    if (!isFinite(n)) return null;
    return negativo ? -n : n;
  }

  // 123456 -> "1.234,56" ; -5 -> "-0,05". Arredondar só para exibir.
  function formatarCentavos(c) {
    const n = Math.round(Number(c) || 0);
    const neg = n < 0;
    const abs = Math.abs(n);
    const inteiro = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const dec = String(abs % 100).padStart(2, '0');
    return (neg ? '-' : '') + inteiro + ',' + dec;
  }

  // Valor para arquivo de importação: vírgula decimal e SEM ponto de milhar (Parte 7.3).
  function centavosParaArquivo(c) {
    const n = Math.round(Number(c) || 0);
    const neg = n < 0;
    const abs = Math.abs(n);
    return (neg ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
  }

  // ------------------------------------------------------------------
  // Datas
  // Parte 4: dd/mm/aaaa na tela; competência AAAA-MM-01; comparar datas pelo
  // número de dias (UTC), nunca como texto.
  // ------------------------------------------------------------------
  const MS_DIA = 86400000;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function dataValida(dia, mes, ano) {
    if (!(ano >= 1900 && ano <= 2200 && mes >= 1 && mes <= 12 && dia >= 1)) return false;
    return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  }

  function montarData(dia, mes, ano) {
    if (!dataValida(dia, mes, ano)) return null;
    return {
      dia, mes, ano,
      texto: String(dia).padStart(2, '0') + '/' + String(mes).padStart(2, '0') + '/' + ano,
      numero: Math.floor(Date.UTC(ano, mes - 1, dia) / MS_DIA),
    };
  }

  // Número de série do Excel (sistema 1900, com o falso 29/02/1900) -> data.
  function dataDeSerie(serie, sistema1904) {
    const n = Math.floor(Number(serie));
    if (!isFinite(n) || n <= 0) return null;
    let ms;
    if (sistema1904) ms = Date.UTC(1904, 0, 1) + n * MS_DIA;
    else if (n < 60) ms = Date.UTC(1899, 11, 31) + n * MS_DIA;
    else ms = Date.UTC(1899, 11, 30) + n * MS_DIA;
    const d = new Date(ms);
    return montarData(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
  }

  // Aceita Date, texto (dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd) ou número de série.
  function lerData(x) {
    if (x === null || x === undefined || x === '') return null;
    if (x instanceof Date) {
      if (isNaN(x.getTime())) return null;
      // Data criada à meia-noite UTC vira o dia anterior no fuso do Brasil: usa UTC nesse caso.
      if (x.getUTCHours() === 0 && x.getUTCMinutes() === 0) return montarData(x.getUTCDate(), x.getUTCMonth() + 1, x.getUTCFullYear());
      return montarData(x.getDate(), x.getMonth() + 1, x.getFullYear());
    }
    if (typeof x === 'number') {
      if (x > 20000 && x < 80000) return dataDeSerie(x);
      return null;
    }
    const s = String(x).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s|$)/);
    if (m) {
      let ano = Number(m[3]);
      if (m[3].length === 2) ano += 2000;
      return montarData(Number(m[1]), Number(m[2]), ano);
    }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
    if (m) return montarData(Number(m[3]), Number(m[2]), Number(m[1]));
    return null;
  }

  function dataDeNumero(numero) {
    const d = new Date(numero * MS_DIA);
    return montarData(d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear());
  }

  // "Hoje" no fuso de quem usa (em UTC, depois das 21h já seria amanhã).
  function hoje() {
    const d = new Date();
    return montarData(d.getDate(), d.getMonth() + 1, d.getFullYear());
  }

  function competenciaDe(data) {
    return data.ano + '-' + String(data.mes).padStart(2, '0') + '-01';
  }

  function partesCompetencia(comp) {
    const m = String(comp || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return { ano: Number(m[1]), mes: Number(m[2]) };
  }

  function inicioDaCompetencia(comp) {
    const p = partesCompetencia(comp);
    return p ? montarData(1, p.mes, p.ano) : null;
  }

  function fimDaCompetencia(comp) {
    const p = partesCompetencia(comp);
    if (!p) return null;
    return montarData(new Date(Date.UTC(p.ano, p.mes, 0)).getUTCDate(), p.mes, p.ano);
  }

  function somarMeses(comp, n) {
    const p = partesCompetencia(comp);
    const total = p.ano * 12 + (p.mes - 1) + n;
    return Math.floor(total / 12) + '-' + String((total % 12) + 1).padStart(2, '0') + '-01';
  }

  // "2026-07-01" -> "julho/2026"
  function nomeCompetencia(comp) {
    const p = partesCompetencia(comp);
    return p ? MESES[p.mes - 1] + '/' + p.ano : '—';
  }

  // "2026-07-01" -> "2026-07" (pastas e ids)
  function anoMes(comp) {
    const p = partesCompetencia(comp);
    return p ? p.ano + '-' + String(p.mes).padStart(2, '0') : '';
  }

  // Carimbo de gravação em ISO UTC. Para comparar, converter para milissegundos:
  // carimbos de origens diferentes vêm escritos diferentes (Parte 4 e armadilha 22).
  function agoraISO() { return new Date().toISOString(); }
  function paraMs(iso) { const n = Date.parse(iso); return isNaN(n) ? 0 : n; }

  // "14:23" no fuso de quem usa
  function horaLocal(iso) {
    const d = iso ? new Date(iso) : new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function dataHoraLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' +
      d.getFullYear() + ' ' + horaLocal(iso);
  }

  // ------------------------------------------------------------------
  // Textos
  // ------------------------------------------------------------------
  function semAcento(s) {
    return String(s === null || s === undefined ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // Títulos de coluna: sem acento, minúsculas, espaços únicos, sem ":" no fim.
  function normalizarTitulo(s) {
    return semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
  }

  // Nomes: sem acento, MAIÚSCULAS, só letras, números e espaço (Parte 6.3).
  function normalizarNome(s) {
    return semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Parte 5.2: um sistema grava "Æ" no lugar de "ã" ("nÆo") SÓ EM ALGUMAS LINHAS
  // do mesmo arquivo (visto nos razões reais usados como modelo, set/2026). Trocar só o Æ,
  // que não existe em português; trocar a tabela de caracteres do arquivo inteiro
  // estraga as outras linhas. Maiúscula vizinha -> "Ã".
  function consertarAE(s) {
    if (typeof s !== 'string' || s.indexOf('Æ') < 0) return s;
    return s.replace(/Æ/g, function (_, pos, tudo) {
      const antes = tudo.charAt(pos - 1), depois = tudo.charAt(pos + 1);
      const maiuscula = (c) => c && c !== c.toLowerCase() && c === c.toUpperCase();
      return (maiuscula(antes) || maiuscula(depois)) ? 'Ã' : 'ã';
    });
  }

  function soDigitos(s) { return String(s === null || s === undefined ? '' : s).replace(/\D+/g, ''); }

  // Nº do documento com a parcela junto (contas a pagar de um cliente real, 16/09/2026):
  // "3760204/1" -> nota 3760204, parcela 1; "62026/1/R1" -> 62026, "1/R1" (renegociado);
  // "42092/ 42093/ COMPL/R1" -> "42092/ 42093/ COMPL", "R1"; "A24864" fica como está.
  // Parcela = número curto (até 3 dígitos) depois da barra, com o "/R<n>" da renegociação.
  function separarDocumento(s) {
    const t = String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
    let m = t.match(/^([A-Za-z]?\d+)\s*\/\s*(\d{1,3}(?:\s*\/\s*R\d*)?)$/i);
    if (m) return { documento: m[1], parcela: m[2].replace(/\s+/g, '').toUpperCase() };
    m = t.match(/^(.*?)\s*\/\s*(R\d*)$/i);
    if (m && m[1]) return { documento: m[1], parcela: m[2].toUpperCase() };
    return { documento: t, parcela: '' };
  }

  // ------------------------------------------------------------------
  // CNPJ e CPF
  // Parte 4: CNPJ só vale com dígito verificador válido (número de nota com 14
  // dígitos não é CNPJ). Aceita também o CNPJ alfanumérico (Receita, a partir de
  // julho/2026): letras nas 12 primeiras posições, valor = código do caractere − 48.
  // ------------------------------------------------------------------
  function dvCnpj(base12) {
    const valores = base12.toUpperCase().split('').map((c) => c.charCodeAt(0) - 48);
    const calc = (arr, pesos) => {
      const soma = arr.reduce((s, v, i) => s + v * pesos[i], 0);
      const r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    };
    const d1 = calc(valores, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = calc(valores.concat([d1]), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return String(d1) + String(d2);
  }

  function limparCnpj(s) { return String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }

  function cnpjValido(s) {
    const c = limparCnpj(s);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false;
    if (/^(\d)\1{13}$/.test(c)) return false;
    return dvCnpj(c.slice(0, 12)) === c.slice(12);
  }

  // Matriz e filial são o mesmo fornecedor: a chave é o CNPJ da matriz CALCULADO
  // (8 primeiros + 0001 + dígitos recalculados), igual com qualquer arquivo (Parte 6.1).
  function cnpjMatriz(s) {
    const c = limparCnpj(s);
    const base = c.slice(0, 8) + '0001';
    return base + dvCnpj(base);
  }

  function formatarCnpj(s) {
    const c = limparCnpj(s);
    if (c.length !== 14) return String(s || '');
    return c.slice(0, 2) + '.' + c.slice(2, 5) + '.' + c.slice(5, 8) + '/' + c.slice(8, 12) + '-' + c.slice(12);
  }

  function cpfValido(s) {
    const c = soDigitos(s);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    const calc = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
  }

  function formatarCpf(s) {
    const c = soDigitos(s);
    if (c.length !== 11) return String(s || '');
    return c.slice(0, 3) + '.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-' + c.slice(9);
  }

  // ------------------------------------------------------------------
  // Impressão digital (Parte 4): a identidade nasce do CONTEÚDO, nunca da posição.
  // Hash: dois acumuladores tipo FNV, base 36, 8 caracteres.
  // ------------------------------------------------------------------
  function hash8(texto) {
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0x050c5d1f | 0;
    const s = String(texto);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822507);
      h2 ^= h2 >>> 15;
    }
    const a = (h1 >>> 0).toString(36).padStart(7, '0').slice(-4);
    const b = (h2 >>> 0).toString(36).padStart(7, '0').slice(-4);
    return (a + b).toUpperCase();
  }

  // Hash dos bytes de um arquivo (para reconhecer o mesmo arquivo subido de novo).
  function hashBytes(bytes) {
    let h1 = 0x811c9dc5 | 0;
    let h2 = 0x050c5d1f | 0;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822507);
      h2 ^= h2 >>> 15;
    }
    return ((h1 >>> 0).toString(36).padStart(7, '0') + (h2 >>> 0).toString(36).padStart(7, '0')).toUpperCase() +
      '-' + bytes.length.toString(36).toUpperCase();
  }

  // ------------------------------------------------------------------
  // Nomes de pasta e de arquivo (Parte 3.2): sem \ / : * ? " < > | e com tamanho limitado.
  // ------------------------------------------------------------------
  const RESERVADOS = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  function nomeSeguro(nome, maximo) {
    const max = maximo || 80;
    let s = String(nome || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length > max) {
      const ponto = s.lastIndexOf('.');
      const ext = ponto > 0 && s.length - ponto <= 6 ? s.slice(ponto) : '';
      s = s.slice(0, max - ext.length).trim() + ext;
    }
    s = s.replace(/[. ]+$/, '');
    if (!s || RESERVADOS.test(s.split('.')[0])) s = '_' + s;
    return s;
  }

  function escaparHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  return {
    centavos, paraNumero, formatarCentavos, centavosParaArquivo,
    MESES, dataValida, montarData, dataDeSerie, lerData, dataDeNumero, hoje,
    competenciaDe, partesCompetencia, inicioDaCompetencia, fimDaCompetencia, somarMeses,
    nomeCompetencia, anoMes, agoraISO, paraMs, horaLocal, dataHoraLocal,
    semAcento, normalizarTitulo, normalizarNome, consertarAE, soDigitos, separarDocumento,
    dvCnpj, limparCnpj, cnpjValido, cnpjMatriz, formatarCnpj, cpfValido, formatarCpf,
    hash8, hashBytes, nomeSeguro, escaparHtml,
  };
});
