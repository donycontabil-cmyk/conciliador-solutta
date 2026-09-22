/*
 * Conciliador Solutta — tela-subir.js
 * Os arquivos sobem DENTRO de cada passo, cada um no seu LUGAR (Dony, 15/09/2026: "quero subir os
 * arquivos dentro da conciliação; o sistema fica tentando adivinhar o que é o quê" e "o esquema de
 * subir arquivos tem que ser em todas; quero a tela limpa").
 * O lugar diz o que o arquivo é: tipo, competência e papel da conta. O programa lê o arquivo pelo
 * conteúdo só para conferir (arquivo de outro tipo, CNPJ de outra empresa, razão sem lançamento no
 * período, relatório com posição de outro mês) e guarda.
 *
 * VERSÕES (Dony, 16/09/2026: "coloco um novo razão e esse novo passa a ser a base, mas ele faz uma
 * comparação de um com o outro, para ficar registrado quantos razões subiram; o aging também — pode
 * vir um aging novo porque o financeiro errou"): carregar num lugar que já tem arquivo guarda uma
 * VERSÃO NOVA, que passa a ser a usada; as anteriores continuam guardadas no lugar (versão 1, 2, 3…),
 * cada uma com a comparação com a de antes (iguais, entraram, saíram, mudaram). Excluir a versão em uso
 * volta para a anterior. No lugar de várias contas (Passo ①) a mesma conta vira versão nova e outra
 * conta soma.
 *
 * Cada passo monta os seus lugares:
 *   { id, parte, titulo, sub, nome (para as mensagens), log,
 *     tipo: 'razao' | 'financeiro_pagar' | 'financeiro_adiantamento' | 'balancete' (relatório de apresentação) | 'diario' (livro
 *       diário do ano: os razões dos passos podem sair dele — opcional, o razão continua subindo como sempre), competencia,
 *     papel (razão: 'principal' | 'adiantamento'), varias (razão com mais de uma conta), opcional,
 *     periodo: { de, ate } (razão: confere se há lançamento; de = null → tudo até o fim do mês),
 *     nomePeriodo, arquivos: [meta, ...] (a versão que o passo usa agora),
 *     conferirTroca: async (novo, comparacao) => bool (opcional: antes de guardar a versão nova),
 *     avisoExcluir: html (opcional: o que acontece com o passo ao excluir) }
 * e usa painel() para desenhar o quadro (com op.metas = todos os arquivos da empresa, para as versões),
 * ligar() para os lugares (carregar, arrastar, excluir, ver o que mudou) e, no cabeçalho do passo,
 * botao() + ligarBotao() para abrir e fechar o quadro ("📁 Carregar ou excluir arquivos").
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function motor() { return raiz.MotorTerceiro; }
  function primeiraMaiuscula(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

  // Guarda UMA conta de um razão lido (Leitor.ler) na competência dada, com o papel dado.
  // extra: campos a mais no registro (comparacao com a versão anterior, recarga).
  function guardarContaDoRazao(codigo, r, c, papel, comp, extra) {
    const rz = r.razao;
    const conta = Object.assign({}, c);
    delete conta.papel;
    delete conta.papelAutomatico;
    const meta = Object.assign({
      tipo: 'razao', arquivo: r.nomeArquivo, periodo: rz.periodo, competencia: comp, desenho: rz.desenho,
      conta: { codigo: c.codigo, classificacao: c.classificacao, nome: c.nome, papel: papel.papel, familia: papel.familia, banco: papel.banco || null },
      lancamentos: c.lancamentos.length, saldoAnterior: c.saldoAnterior, saldoFinal: c.saldoFinal, confere: c.confere,
      empresaNoArquivo: rz.empresa, cnpjNoArquivo: rz.cnpj, hashDoConteudo: r.hash,
    }, extra || {});
    const conteudo = { tipo: 'razao', desenho: rz.desenho, empresa: rz.empresa, cnpj: rz.cnpj, periodo: rz.periodo, periodoOrigem: rz.periodoOrigem, conta };
    return app().armazenamento.guardarArquivo(codigo, meta, conteudo, r.bytes);
  }

  // Guarda um relatório de títulos em aberto (aging) com o tipo e a competência dados.
  function guardarTitulos(codigo, r, tipo, comp, extra) {
    const f = r.financeiro;
    const meta = Object.assign({ tipo, arquivo: r.nomeArquivo, competencia: comp, titulos: f.titulos.length, total: f.total, posicao: f.posicao, hashDoConteudo: r.hash }, extra || {});
    return app().armazenamento.guardarArquivo(codigo, meta, { tipo, titulos: f.titulos, total: f.total, descartados: f.descartados, posicao: f.posicao }, r.bytes);
  }

  // Guarda um balancete (relatório de apresentação) na competência dada. O resultado do mês (créditos −
  // débitos das contas de 1º nível que não são 1 e 2) vai na ficha para aparecer no lugar.
  function guardarBalancete(codigo, r, comp, extra) {
    const b = r.balancete;
    const resultado = b.contas.filter((c) => c.nivel === 1 && !/^0*[12]$/.test(c.conta)).reduce((s, c) => s + c.creditos - c.debitos, 0);
    const meta = Object.assign({ tipo: 'balancete', arquivo: r.nomeArquivo, competencia: comp, periodo: b.periodo, contas: b.contas.length, resultado,
      confere: b.confere, empresaNoArquivo: b.empresa, cnpjNoArquivo: b.cnpj, hashDoConteudo: r.hash }, extra || {});
    return app().armazenamento.guardarArquivo(codigo, meta, { tipo: 'balancete', empresa: b.empresa, cnpj: b.cnpj, periodo: b.periodo, contas: b.contas, total: b.total }, r.bytes);
  }

  // Guarda um livro diário no lugar do ano (competência = janeiro do ano do fim do diário).
  function guardarDiario(codigo, r, comp, extra) {
    const d = r.diario;
    const meta = Object.assign({ tipo: 'diario', arquivo: r.nomeArquivo, competencia: comp, periodo: d.periodo, lancamentos: d.lancamentos.length, contas: d.contas.length, codigosDasContas: d.contas,
      totalDebitos: d.totalDebitos, totalCreditos: d.totalCreditos, confere: d.confere, empresaNoArquivo: d.empresa, cnpjNoArquivo: d.cnpj, hashDoConteudo: r.hash }, extra || {});
    return app().armazenamento.guardarArquivo(codigo, meta, raiz.MotorDiario.paraGuardar(d), r.bytes);
  }

  // Os arquivos guardados que ocupam o mesmo lugar que este (as versões): aging = mesmo tipo e
  // competência; razão = mesma competência e papel — e a mesma conta no lugar de várias contas (①);
  // livro diário = o do mesmo ano. Sem o lugar, o razão é o da mesma conta.
  function doMesmoLugar(metas, m, lugar) {
    if (m.tipo === 'diario') return metas.filter((x) => x.tipo === 'diario' && String(x.competencia).slice(0, 4) === String(m.competencia).slice(0, 4));
    if (m.tipo !== 'razao') return metas.filter((x) => x.tipo === m.tipo && x.competencia === m.competencia);
    const porConta = !lugar || lugar.varias;
    return metas.filter((x) => x.tipo === 'razao' && x.competencia === m.competencia && x.conta && m.conta &&
      x.conta.familia === m.conta.familia && x.conta.papel === m.conta.papel && (!porConta || String(x.conta.codigo) === String(m.conta.codigo)));
  }

  // As versões do lugar deste arquivo, da mais nova (a usada) para a mais antiga.
  function versoesDoArquivo(metas, m, lugar) {
    const lista = doMesmoLugar(metas || [], m, lugar);
    if (!lista.some((x) => x.id === m.id)) lista.push(m);
    return lista.sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
  }

  // A versão que o lugar usa agora (a da mesma conta, no lugar de várias contas).
  // ------------------------------------------------------------------
  // Balancete de desenho novo: as colunas (Dony, 18/09/2026: "cada empresa tem um tipo de balancete; quero
  // indicar a conta, o débito, o crédito, o saldo inicial e o final no primeiro, para não ter que pedir
  // para mapear toda hora"). A leitura boa = pelo menos 3 contas e 90% delas fechando (anterior + débitos −
  // créditos = atual).
  // ------------------------------------------------------------------
  const balanceteBom = (b) => !!b && !!b.contas && b.contas.length >= 3 && b.qualidade >= 0.9;
  async function balanceteDoArquivo(r, arquivo, codigo) {
    let abas;
    try { abas = raiz.LerPlanilha.abrir(r.bytes).abas; } catch (e) { return null; }
    const L = raiz.LerBalancete;
    const tentar = (op) => { try { return L.ler(abas, Object.assign({ nomeArquivo: arquivo.name }, op)); } catch (e) { return null; } };
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
    // 1) As colunas que a empresa já tem guardadas (mesmo desenho dos meses anteriores): entra direto.
    if (emp.mapaBalancete) { const x = tentar({ mapa: emp.mapaBalancete }); if (balanceteBom(x)) return x; }
    // 2) Pelo conteúdo: quem usa confere as colunas na primeira vez; 3) senão, indica.
    const pelo = tentar({ inferir: true });
    const sugestao = pelo && pelo.contas.length ? pelo.mapa : emp.mapaBalancete || null;
    const mapa = await escolherColunasDoBalancete(abas, arquivo.name, sugestao, balanceteBom(pelo));
    if (!mapa) return false;
    const b = tentar({ mapa });
    if (!b || !b.contas.length) { T.avisoRapido('Com essas colunas não achei nenhuma conta.', 'erro', 5000); return false; }
    await guardarMapaDoBalancete(codigo, mapa);
    return b;
  }
  async function guardarMapaDoBalancete(codigo, mapa) {
    try {
      const arm = app().armazenamento;
      const cad = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo)); // relido: outra pessoa pode ter mexido
      if (!cad) return;
      const salvo = await arm.salvarEmpresa(Object.assign({}, cad, { mapaBalancete: mapa }));
      const ix = app().empresas.findIndex((e) => String(e.codigo) === String(codigo));
      if (ix >= 0) app().empresas[ix] = salvo;
    } catch (e) { /* guardar as colunas ajuda na próxima vez; não impede esta leitura */ }
  }
  // A janela das colunas: o começo do arquivo, uma lista para cada coisa e, na hora, quantas contas fecham.
  function escolherColunasDoBalancete(abas, nomeArquivo, sugestao, achouSozinho) {
    const L = raiz.LerBalancete;
    const CAMPOS = [['conta', 'Conta (código ou classificação)', true], ['titulo', 'Nome da conta', false], ['saldoAnterior', 'Saldo anterior (inicial)', true],
      ['dcAnterior', 'D/C do saldo anterior', false], ['debitos', 'Débitos', true], ['creditos', 'Créditos', true], ['saldoAtual', 'Saldo atual (final)', true], ['dcAtual', 'D/C do saldo atual', false]];
    const letra = (i) => { let s = '', k = i + 1; while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; };
    const estado = { aba: sugestao && abas[sugestao.aba] ? sugestao.aba : 0, colunas: Object.assign({}, (sugestao && sugestao.colunas) || {}) };
    const cheia = (v) => v !== null && v !== undefined && String(v).trim() !== '';
    const linhasPrevia = () => ((abas[estado.aba] || {}).linhas || []).filter((l) => l && l.filter(cheia).length >= 2).slice(0, 14);
    const nCols = () => Math.min(40, linhasPrevia().reduce((m, l) => Math.max(m, l.length), 0));
    const amostra = (i) => { const v = linhasPrevia().map((l) => l[i]).find(cheia); return v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, 18); };
    const previa = () => {
      const n = nCols(), usadas = new Map(Object.keys(estado.colunas).map((k) => [estado.colunas[k], k]));
      const rotulo = Object.fromEntries(CAMPOS.map(([k, t]) => [k, t.split(' (')[0]]));
      return '<table class="bal-previa"><thead><tr><th></th>' + Array.from({ length: n }, (v, i) => '<th class="' + (usadas.has(i) ? 'usada' : '') + '">' + letra(i) +
        (usadas.has(i) ? '<small>' + T.esc(rotulo[usadas.get(i)]) + '</small>' : '') + '</th>').join('') + '</tr></thead><tbody>' +
        linhasPrevia().map((l, r) => '<tr><td class="num-linha">' + (r + 1) + '</td>' + Array.from({ length: n }, (v, i) => '<td class="' + (usadas.has(i) ? 'usada' : '') + '">' +
          T.esc(cheia(l[i]) ? String(l[i]).replace(/\s+/g, ' ').trim().slice(0, 28) : '') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    };
    const listas = () => CAMPOS.map(([k, t, obrig]) => '<label class="bal-campo"><span>' + T.esc(t) + (obrig ? ' *' : '') + '</span><select class="apres-campo" data-campo="' + k + '">' +
      '<option value="">' + (obrig ? '(escolha)' : '— não tem —') + '</option>' + Array.from({ length: nCols() }, (v, i) => '<option value="' + i + '"' + (estado.colunas[k] === i ? ' selected' : '') + '>' +
      letra(i) + (amostra(i) ? ' · ' + T.esc(amostra(i)) : '') + '</option>').join('') + '</select></label>').join('');
    // Na hora: quantas contas, quantas fecham e um exemplo.
    const resultado = () => {
      const faltam = CAMPOS.filter(([k, , obrig]) => obrig && !Number.isInteger(estado.colunas[k])).map(([, t]) => t.split(' (')[0].toLowerCase());
      if (faltam.length) return { ok: false, html: 'Falta escolher: ' + T.esc(faltam.join(', ')) + '.' };
      let b = null;
      try { b = L.ler(abas, { mapa: { aba: estado.aba, colunas: estado.colunas }, nomeArquivo }); } catch (e) { return { ok: false, html: T.esc(e.message) }; }
      if (!b.contas.length) return { ok: false, html: 'Com essas colunas não achei nenhuma conta: confira a coluna da conta.' };
      const ex = b.contas.find((c) => c.analitica && (c.debitos || c.creditos)) || b.contas[0];
      const r2 = (c) => U.formatarCentavos(c);
      const pc = Math.round(b.qualidade * 1000) / 10;
      return { ok: true, qualidade: b.qualidade, html: '<b>' + b.contas.length + ' contas</b> · <b class="' + (b.qualidade >= 0.9 ? 'ok' : 'rel-aviso') + '">' + String(pc).replace('.', ',') + '% fecham</b> ' +
        '(saldo anterior + débitos − créditos = saldo atual)<br><span class="suave">Exemplo: ' + T.esc(ex.conta + ' ' + (ex.titulo || '')) + ': ' + r2(ex.saldoAnterior) + ' + ' + r2(ex.debitos) + ' − ' + r2(ex.creditos) + ' = ' + r2(ex.saldoAtual) + '</span>' };
    };
    const corpo = '<p style="margin:0 0 8px;line-height:1.5">' + (achouSozinho
      ? 'Li <b>' + T.esc(nomeArquivo) + '</b> pelo conteúdo. <b>Confira se as colunas estão certas</b> (é só da primeira vez: a empresa guarda e os próximos balancetes deste desenho entram sozinhos).'
      : 'Não entendi sozinho as colunas de <b>' + T.esc(nomeArquivo) + '</b>. <b>Diga qual coluna é cada coisa</b> (só desta vez: a empresa guarda e os próximos balancetes deste desenho entram sozinhos).') + '</p>' +
      (abas.length > 1 ? '<label class="bal-campo" style="margin-bottom:8px"><span>Aba da planilha</span><select class="apres-campo" id="bal-aba">' + abas.map((a, i) => '<option value="' + i + '"' + (i === estado.aba ? ' selected' : '') + '>' + T.esc(a.nome || 'Aba ' + (i + 1)) + '</option>').join('') + '</select></label>' : '') +
      '<div class="bal-previa-caixa" id="bal-previa">' + previa() + '</div>' +
      '<div class="bal-campos" id="bal-campos">' + listas() + '</div>' +
      '<p class="bal-resultado" id="bal-resultado"></p>' +
      '<p class="suave pequeno" style="margin:6px 0 0">D/C: só quando o arquivo tem uma coluna com "D" ou "C" ao lado do saldo. Saldo sem sinal nenhum também serve: o lado sai da própria conta.</p>';
    return T.janela({
      titulo: 'Quais são as colunas deste balancete?', larga: true, corpo,
      aoAbrir: (j) => {
        const atualizar = (tudo) => {
          if (tudo) { j.querySelector('#bal-campos').innerHTML = listas(); }
          j.querySelector('#bal-previa').innerHTML = previa();
          j.querySelector('#bal-resultado').innerHTML = resultado().html;
        };
        j.addEventListener('change', (ev) => {
          if (ev.target.id === 'bal-aba') { estado.aba = Number(ev.target.value); estado.colunas = {}; atualizar(true); return; }
          const s = ev.target.closest('select[data-campo]');
          if (!s) return;
          const k = s.getAttribute('data-campo');
          if (s.value === '') delete estado.colunas[k]; else estado.colunas[k] = Number(s.value);
          atualizar(false);
        });
        atualizar(false);
      },
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Usar estas colunas', tipo: 'primario', antes: (j) => {
        const r = resultado();
        if (!r.ok) { j.querySelector('#bal-resultado').innerHTML = '<span class="rel-aviso">' + r.html + '</span>'; return false; }
        return { aba: estado.aba, colunas: Object.assign({}, estado.colunas) };
      } }],
    });
  }

  function emUsoNoLugar(lugar, conta) {
    const lista = lugar.arquivos || [];
    if (lugar.tipo === 'razao' && lugar.varias) return lista.find((m) => m.conta && conta && String(m.conta.codigo) === String(conta.codigo)) || null;
    return lista[0] || null;
  }

  // "1 igual" / "2 iguais" (o número vai em negrito com op.negrito).
  function contagem(n, um, varios, negrito) {
    const num = negrito ? '<b>' + n + '</b>' : String(n);
    return num + ' ' + (n === 1 ? um : varios);
  }
  // "981 iguais · 2 entraram · 1 saiu · 1 mudou"
  function contagensDaComparacao(c, negrito) {
    return [contagem(c.iguais, 'igual', 'iguais', negrito), contagem(c.entraram, 'entrou', 'entraram', negrito),
      contagem(c.sairam, 'saiu', 'saíram', negrito), contagem(c.mudaram, 'mudou', 'mudaram', negrito)].join(' · ');
  }

  // "9 entraram · 2 saíram · 1 mudou" (ou "mesmos itens").
  function textoComparacao(c, tipo) {
    if (!c || c.iguais === undefined) return 'comparada com a versão anterior';
    const nome = tipo === 'razao' || tipo === 'diario' ? ['lançamento', 'lançamentos'] : tipo === 'balancete' ? ['conta', 'contas'] : ['título', 'títulos'];
    const partes = [];
    if (c.entraram) partes.push('<b>' + c.entraram + '</b> ' + (c.entraram === 1 ? 'entrou' : 'entraram'));
    if (c.sairam) partes.push('<b>' + c.sairam + '</b> ' + (c.sairam === 1 ? 'saiu' : 'saíram'));
    if (c.mudaram) partes.push('<b>' + c.mudaram + '</b> ' + (c.mudaram === 1 ? 'mudou' : 'mudaram'));
    return partes.length ? partes.join(' · ') + ' (' + nome[1] + ')' : 'os mesmos ' + nome[1] + ' da versão anterior';
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  function detalheDoArquivo(m) {
    if (m.tipo === 'diario') {
      return (m.lancamentos || 0).toLocaleString('pt-BR') + ' lançamentos · ' + (m.periodo ? T.esc(m.periodo.de + ' a ' + m.periodo.ate) : '') +
        (m.confere === false ? ' · <span class="falta">débitos ≠ créditos</span>' : ' · débitos = créditos');
    }
    if (m.tipo === 'balancete') {
      return (m.contas || 0) + ' contas · ' + (m.resultado >= 0 ? 'lucro' : 'prejuízo') + ' do mês ' + T.moeda(Math.abs(m.resultado || 0)) +
        (m.confere === false ? ' · <span class="falta">não fecha</span>' : '');
    }
    return m.tipo === 'razao'
      ? 'conta ' + T.esc(m.conta.codigo + ' ' + (m.conta.nome || '')) + ' · ' + (m.lancamentos || 0) + ' lanç.' + (m.periodo ? ' · ' + T.esc(m.periodo.de + ' a ' + m.periodo.ate) : '')
      : (m.titulos || 0) + ' títulos · ' + T.moeda(m.total || 0);
  }
  function tipoDaComparacao(m) { return m.tipo === 'razao' ? 'razao' : m.tipo === 'balancete' ? 'balancete' : m.tipo === 'diario' ? 'diario' : 'aging'; }
  function quemEnviou(m) { return m.enviadoEm ? T.esc(m.enviadoPor || '') + ' em ' + U.dataHoraLocal(m.enviadoEm) : ''; }

  function descreverArquivo(m, lugar, metas) {
    const versoes = versoesDoArquivo(metas, m, lugar);
    const pos = Math.max(0, versoes.findIndex((x) => x.id === m.id));
    const numero = versoes.length - pos;
    const antigas = versoes.slice(pos + 1);
    const outroMes = m.competencia !== lugar.competencia ? ' · guardado em ' + U.nomeCompetencia(m.competencia) : '';
    const quem = quemEnviou(m);
    const tipo = tipoDaComparacao(m);
    const comparar = antigas.length || (m.comparacao && m.comparacao.com);
    return '<div class="arquivo-lugar"><div><b>' + T.esc(m.arquivo) + '</b>' +
      (m.origem === 'diario' ? ' <span class="selo do-diario" title="Razão montado a partir do livro diário ' + T.esc(m.diarioArquivo || '') + ', com o saldo inicial do balancete">📒 do diário</span>' : '') +
      (versoes.length > 1 ? ' <span class="selo versao" title="O programa usa a versão mais nova; as anteriores continuam guardadas">versão ' + numero + ' · em uso</span>' : '') +
      '<br><span class="suave">' + detalheDoArquivo(m) + outroMes + (quem ? ' · ' + quem : '') + '</span>' +
      (comparar ? '<br><span class="pequeno">Em relação à versão anterior: ' + textoComparacao(m.comparacao, tipo) +
        ' · <button type="button" class="lapis" data-ver-versao="' + T.esc(m.id) + '">ver o que mudou</button></span>' : '') +
      '</div>' +
      '<button type="button" class="botao pequeno perigo" data-apagar-arquivo="' + T.esc(m.id) + '" title="Excluir esta versão (a cópia vai para _apagados)">🗑 Excluir</button></div>' +
      (antigas.length ? '<details class="versoes-lugar"><summary>' + antigas.length + (antigas.length === 1 ? ' versão anterior guardada' : ' versões anteriores guardadas') + '</summary>' +
        antigas.map((v, k) => {
          const n = numero - 1 - k;
          const temAnterior = k < antigas.length - 1 || (v.comparacao && v.comparacao.com);
          return '<div class="versao-antiga"><div><b>versão ' + n + '</b> · ' + T.esc(v.arquivo) +
            '<br><span class="suave">' + detalheDoArquivo(v) + (quemEnviou(v) ? ' · ' + quemEnviou(v) : '') + '</span>' +
            (temAnterior ? '<br><span class="pequeno">Em relação à versão ' + (n - 1 || 'anterior') + ': ' + textoComparacao(v.comparacao, tipo) +
              ' · <button type="button" class="lapis" data-ver-versao="' + T.esc(v.id) + '">ver o que mudou</button></span>' : '') +
            '</div><button type="button" class="botao pequeno perigo" data-apagar-arquivo="' + T.esc(v.id) + '" title="Excluir esta versão antiga">🗑</button></div>';
        }).join('') + '</details>' : '');
  }

  // Quadros abertos pelo botão de cima (continuam abertos quando a tela redesenha depois de carregar ou excluir).
  const abertos = new Set();

  // O botão de cima, à direita, no cabeçalho do passo (Dony, 15/09/2026: "quero ali em cima à direita
  // um lugar de carregar novos arquivos" e "excluir os anexos que eu coloquei").
  function botao(chave) {
    const aberto = abertos.has(chave);
    return '<button type="button" class="botao pequeno primario" data-abrir-arquivos="' + T.esc(chave) + '" aria-expanded="' + aberto + '" ' +
      'title="Ver os arquivos desta conciliação, carregar novos ou excluir">' + (aberto ? '📁 Fechar os arquivos' : '📁 Carregar ou excluir arquivos') + '</button>';
  }

  // op: { chave, titulo, resumo, lugares, metas (todos os arquivos da empresa: as versões), antes (html
  //       antes dos lugares), depois (html depois), aberto (abre sozinho), fixo (sempre à vista e sem
  //       "Fechar": quando falta arquivo) }
  function painel(op) {
    const lugares = op.lugares;
    const faltam = lugares.filter((l) => !l.opcional && !l.arquivos.length).length;
    const guardados = lugares.reduce((s, l) => s + l.arquivos.length, 0);
    if (op.aberto && op.chave) abertos.add(op.chave);
    const visivel = op.fixo || (op.chave && abertos.has(op.chave));
    // Livro diário guardado que cobre o período dos razões: eles podem sair dele (opcional — o razão continua subindo
    // como sempre).
    const razoes = lugares.filter((l) => l.tipo === 'razao');
    const doDiarioNo = new Map(razoes.map((l) => [l.id, diarioDoLugar(op.metas, l)]).filter((x) => x[1]));
    const umDiario = doDiarioNo.size ? doDiarioNo.values().next().value : null;
    const codigoAberto = app() && app().rota && app().rota.codigo;
    const empAberta = codigoAberto ? (app().empresas || []).find((e) => String(e.codigo) === String(codigoAberto)) : null;
    const escolhas = razoes.filter((l) => doDiarioNo.has(l.id)).map((l) => ({ l, contas: contasEscolhidas(empAberta, l) })).filter((x) => x.contas);
    const avisoDiario = umDiario
      ? '<div class="aviso info diario-no-painel"><span class="icone-aviso">📒</span><div>' +
        (escolhas.length
          ? '<b>O livro diário de ' + T.esc(String(umDiario.competencia).slice(0, 4)) + ' é o razão deste passo</b> (' + T.esc(umDiario.periodo.de + ' a ' + umDiario.periodo.ate) +
            '): o razão das contas escolhidas sai dele sozinho — ' + escolhas.map((x) => T.esc(x.l.titulo.replace(/^Razão de /, '') + ': ' + x.contas.join(', '))).join(' · ') +
            '. Conta com razão carregado continua com o razão. <button type="button" class="botao pequeno" data-do-diario-todos>✎ Trocar as contas</button>'
          : '<b>O livro diário de ' + T.esc(String(umDiario.competencia).slice(0, 4)) + ' está guardado</b> (' + T.esc(umDiario.periodo.de + ' a ' + umDiario.periodo.ate) +
            '): ele pode ser o razão deste passo — escolha as contas e o razão delas sai dele, sem subir conta por conta. Ou carregue o razão como sempre. ' +
            '<button type="button" class="botao pequeno" data-do-diario-todos>📒 Escolher as contas</button>') + '</div></div>'
      : razoes.length && codigoAberto
        ? '<p class="suave pequeno" style="margin:-4px 0 10px">Tem o livro diário da empresa? Guarde em <a href="#/empresa/' + encodeURIComponent(codigoAberto) + '/diario">📒 Livro diário</a> e os razões podem sair dele (opcional).</p>'
        : '';
    return '<section class="cartao corpo arquivos-passo" data-painel-arquivos="' + T.esc(op.chave || '') + '"' + (visivel ? '' : ' hidden') + '>' +
      '<div class="cab-arquivos"><h3>📁 ' + T.esc(op.titulo || 'Arquivos deste passo') + '</h3>' +
      '<span class="suave pequeno">' + (op.resumo ? T.esc(op.resumo) + ' · ' : '') +
      (faltam ? '<span class="falta">' + faltam + ' arquivo(s) faltando</span>' : guardados + ' arquivo(s) em uso') + '</span>' +
      (op.fixo ? '' : '<button type="button" class="botao pequeno" data-fechar-arquivos>✕ Fechar</button>') + '</div>' +
      '<p class="suave pequeno" style="margin:0 0 10px">Cada arquivo tem o seu lugar: <b>⬆ Carregar</b> (ou arraste o arquivo em cima do lugar) e <b>🗑 Excluir</b>. ' +
      'Chegou um arquivo novo (razão refeito, aging corrigido)? Use <b>🔄 Carregar nova versão</b>: a nova passa a ser a usada, a anterior continua guardada ' +
      'e o programa mostra o que mudou de uma para a outra.</p>' +
      (op.antes || '') + avisoDiario +
      '<div class="lugares">' + lugares.map((l) => {
        const tem = l.arquivos.length > 0;
        const rotulo = !tem ? '⬆ Carregar' : l.varias ? '⬆ Carregar outra conta ou versão' : '🔄 Carregar nova versão';
        const dica = !tem ? '' : l.varias ? ' title="A mesma conta vira uma versão nova (a anterior fica guardada); outra conta soma"' : ' title="A nova versão passa a ser a usada; a anterior continua guardada e dá para ver o que mudou"';
        return '<div class="lugar' + (tem ? ' ok' : '') + '" data-lugar="' + l.id + '">' +
          '<div class="parte">' + T.esc(l.parte) + '</div>' +
          '<h4>' + (tem ? '✓ ' : '') + T.esc(l.titulo) + '</h4><div class="pequeno"><b>' + T.esc(l.sub) + '</b></div>' +
          '<div class="arquivos-do-lugar pequeno">' + (tem ? l.arquivos.map((m) => descreverArquivo(m, l, op.metas)).join('')
            : l.opcional ? '<span class="suave">opcional</span>' : '<span class="falta">falta</span>') + '</div>' +
          '<div class="linha-flex" style="margin-top:auto"><button type="button" class="botao pequeno' + (tem || l.opcional ? '' : ' primario') + '" data-subir-lugar="' + l.id + '"' + dica + '>' + rotulo + '</button>' +
          (doDiarioNo.has(l.id) ? '<button type="button" class="botao pequeno" data-do-diario="' + l.id + '" title="Montar o razão das contas deste lugar a partir do livro diário guardado, com o saldo inicial do balancete">📒 Tirar do diário</button>' : '') +
          '<span class="suave pequeno">ou arraste o arquivo aqui</span></div>' +
          '<input type="file" class="escondido" data-arquivo-lugar="' + l.id + '"' + (l.varias ? ' multiple' : '') + ' accept=".xls,.xlsx,.xlsm,.csv,.txt"></div>';
      }).join('') + '</div>' +
      (op.depois || '') +
      '</section>';
  }

  // Mostra ou esconde o quadro (e acerta o botão de cima).
  function mostrarPainel(p, abrir) {
    if (!p) return;
    const chave = p.getAttribute('data-painel-arquivos');
    p.hidden = !abrir;
    if (chave) { if (abrir) abertos.add(chave); else abertos.delete(chave); }
    const bt = chave && Array.from(document.querySelectorAll('[data-abrir-arquivos]')).find((b) => b.getAttribute('data-abrir-arquivos') === chave);
    if (bt) {
      bt.setAttribute('aria-expanded', String(abrir));
      bt.textContent = abrir ? '📁 Fechar os arquivos' : '📁 Carregar ou excluir arquivos';
    }
    if (abrir && p.scrollIntoView) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function ligarBotao(bt) {
    if (!bt) return;
    bt.addEventListener('click', () => {
      const chave = bt.getAttribute('data-abrir-arquivos');
      const p = Array.from(document.querySelectorAll('[data-painel-arquivos]')).find((x) => x.getAttribute('data-painel-arquivos') === chave);
      mostrarPainel(p, !!(p && p.hidden));
    });
  }

  function ligar(el, codigo, lugares) {
    if (!el) return;
    const doLugar = (id) => lugares.find((l) => l.id === id);
    const subirVarios = async (lugar, arquivos) => {
      const lista = Array.from(arquivos || []);
      if (!lista.length || !lugar) return;
      if (lista.length > 1 && !lugar.varias) { T.avisoRapido('Este lugar é de um arquivo só: solte um de cada vez.', 'erro'); return; }
      let algum = false;
      for (const f of lista) algum = (await subir(codigo, lugar, f, { semRota: true, lugares })) || algum;
      if (algum) app().mostrarRota();
    };
    // O arquivo de um botão (a versão em uso ou uma antiga).
    const metaDoBotao = async (l, id) => (l && l.arquivos.find((m) => m.id === id)) || (await app().armazenamento.arquivos(codigo)).find((m) => m.id === id) || null;
    el.addEventListener('change', async (ev) => {
      const inp = ev.target.closest('[data-arquivo-lugar]');
      if (!inp || !inp.files || !inp.files.length) return;
      const arquivos = Array.from(inp.files);
      inp.value = '';
      await subirVarios(doLugar(inp.getAttribute('data-arquivo-lugar')), arquivos);
    });
    el.addEventListener('click', async (ev) => {
      if (ev.target.closest('[data-fechar-arquivos]')) { mostrarPainel(el, false); return; }
      const b = ev.target.closest('[data-subir-lugar]');
      if (b) { const inp = el.querySelector('[data-arquivo-lugar="' + b.getAttribute('data-subir-lugar') + '"]'); if (inp) inp.click(); return; }
      // Razão tirado do livro diário (opcional): de um lugar ou de todos os lugares de razão do quadro.
      const dd = ev.target.closest('[data-do-diario]');
      if (dd) { const l = doLugar(dd.getAttribute('data-do-diario')); await doDiario(codigo, l ? [l] : []); return; }
      if (ev.target.closest('[data-do-diario-todos]')) { await doDiario(codigo, lugares); return; }
      const ver = ev.target.closest('[data-ver-versao]');
      if (ver) {
        ev.preventDefault();
        await verVersao(codigo, doLugar(ver.closest('[data-lugar]').getAttribute('data-lugar')), ver.getAttribute('data-ver-versao'));
        return;
      }
      const ap = ev.target.closest('[data-apagar-arquivo]');
      if (ap) {
        const l = doLugar(ap.closest('[data-lugar]').getAttribute('data-lugar'));
        await apagar(codigo, l, await metaDoBotao(l, ap.getAttribute('data-apagar-arquivo')));
      }
    });
    // Arquivo solto no quadro, fora de um lugar: não deixa o navegador abrir o arquivo no lugar do programa.
    el.addEventListener('dragover', (ev) => ev.preventDefault());
    el.addEventListener('drop', (ev) => { ev.preventDefault(); T.avisoRapido('Solte o arquivo em cima do lugar dele.', null, 4000); });
    el.querySelectorAll('.lugar').forEach((s) => {
      s.addEventListener('dragover', (ev) => { ev.preventDefault(); s.classList.add('por-cima'); });
      s.addEventListener('dragleave', (ev) => { if (!s.contains(ev.relatedTarget)) s.classList.remove('por-cima'); });
      s.addEventListener('drop', async (ev) => {
        ev.preventDefault(); ev.stopPropagation(); s.classList.remove('por-cima');
        await subirVarios(doLugar(s.getAttribute('data-lugar')), ev.dataTransfer && ev.dataTransfer.files);
      });
    });
  }

  // ------------------------------------------------------------------
  // Subir, trocar e apagar
  // ------------------------------------------------------------------
  function nomeDoPapel(p) {
    const x = (raiz.Familias.PAPEIS_ESCOLHIVEIS || []).find((e) => e.familia === p.familia && e.papel === p.papel);
    return x ? x.texto : p.familia === 'financeiro' ? 'banco' : p.familia + '/' + p.papel;
  }

  // Razão com várias contas: qual (ou quais, no lugar de várias contas) é deste lugar.
  function escolherContas(r, lugar) {
    const doPapel = (c) => c.papel && c.papel.familia === 'fornecedores' && c.papel.papel === lugar.papel;
    const primeira = Math.max(0, r.contas.findIndex(doPapel));
    return T.janela({
      titulo: (lugar.varias ? 'Quais contas deste razão vão para "' : 'Qual conta deste razão vai para "') + lugar.titulo + '"?',
      corpo: '<p class="suave" style="margin-bottom:8px">' + T.esc(r.nomeArquivo) + ' tem ' + r.contas.length + ' contas.</p>' +
        r.contas.map((c, k) => '<label class="item-aba"><input type="' + (lugar.varias ? 'checkbox' : 'radio') + '" name="conta-razao" value="' + k + '"' +
          ((lugar.varias ? doPapel(c) : k === primeira) ? ' checked' : '') + '> <b>' + T.esc(c.codigo) + '</b> ' + T.esc(c.nome || '') +
          ' <span class="suave pequeno">· ' + c.lancamentos.length + ' lanç.' + (c.papel && c.papel.familia ? ' · parece ' + T.esc(nomeDoPapel(c.papel)) : '') + '</span></label>').join(''),
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar', tipo: 'primario', antes: (j) => {
        const marcadas = Array.from(j.querySelectorAll('input[name="conta-razao"]:checked')).map((x) => r.contas[Number(x.value)]);
        return marcadas.length ? marcadas : false;
      } }],
    });
  }

  // A comparação da versão nova com a versão em uso (só os números ficam guardados no arquivo novo).
  async function compararComEmUso(ativo, tipo, novo) {
    const base = { com: ativo.id, arquivoAnterior: ativo.arquivo };
    try {
      const antes = await app().armazenamento.conteudoDoArquivo(ativo.id);
      return Object.assign(base, motor().resumoDaComparacao(comparar(tipo, antes, novo)));
    } catch (e) { return base; }
  }
  function comparar(tipo, antes, depois) {
    if (tipo === 'diario') return raiz.MotorDiario.compararDiarios(antes, depois);
    return tipo === 'balancete' ? raiz.MotorApresentacao.compararBalancetes(antes, depois) : motor().compararVersoes(tipo, antes, depois);
  }

  // Arquivo posto no lugar do diário com lançamentos (conta de débito, crédito e valor) mas sem o título de livro
  // diário — pode ser uma planilha de lançamentos (importação, reclassificação): pergunta se é o diário completo.
  // Devolve o diário lido, false (não é) ou null (nem tem lançamentos assim).
  async function diarioSemTitulo(r, arquivo) {
    let abas;
    try { abas = raiz.LerPlanilha.abrir(r.bytes).abas; } catch (e) { return null; }
    if (raiz.LerDiario.reconhecer(abas, { semTitulo: true }).tipo !== 'diario') return null;
    const d = raiz.LerDiario.ler(abas, { nomeArquivo: arquivo.name });
    if (!d.lancamentos.length) return null;
    const ok = await T.confirmar({ titulo: 'É o livro diário completo?',
      texto: '<b>' + T.esc(arquivo.name) + '</b> tem ' + d.lancamentos.length.toLocaleString('pt-BR') + ' lançamentos (' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + ', ' +
        d.contas.length + ' contas) com conta de débito, conta de crédito e valor, mas não tem o título de livro diário: pode ser uma planilha de lançamentos ' +
        '(importação, reclassificação). Guardar como o livro diário da empresa?',
      botao: 'É o diário: guardar' });
    return ok ? d : false;
  }

  // O número da versão de cada arquivo novo ("versão 2 (a anterior continua guardada: 9 entraram)").
  async function textoDasVersoes(codigo, lugar, novas) {
    if (!novas.length) return '';
    const metas = await app().armazenamento.arquivos(codigo);
    return novas.map((n) => {
      const qtd = versoesDoArquivo(metas, n.meta, lugar).length;
      if (qtd < 2) return '';
      return 'versão ' + qtd + ' (a anterior continua guardada' + (n.comparacao && n.comparacao.iguais !== undefined
        ? ': ' + textoComparacao(n.comparacao, tipoDaComparacao(lugar)).replace(/<\/?b>/g, '') : '') + ')';
    }).filter(Boolean).join('; ');
  }

  // Guarda contas de razão num lugar de razão: cada conta vira a versão nova da mesma conta do lugar (a anterior
  // continua guardada), com a comparação; a empresa passa a saber o papel das contas. itens: [{ r (o razão lido),
  // conta, extra (campos a mais no registro) }]. Devolve { novas, jaEra } ou null (desistiu na conferência da troca).
  async function guardarContasNoLugar(codigo, lugar, itens) {
    const arm = app().armazenamento;
    const papel = { familia: 'fornecedores', papel: lugar.papel };
    const lembrar = {};
    const novas = [];
    let jaEra = true;
    for (const { r, conta, extra: maisCampos } of itens) {
      const auto = conta.papel || {};
      if (auto.familia !== papel.familia || auto.papel !== papel.papel) lembrar[conta.codigo] = papel;
      const ativo = emUsoNoLugar(lugar, conta);
      // Já é a versão em uso deste lugar: nada a fazer.
      if (ativo && ativo.hashDoConteudo === r.hash && ativo.conta && String(ativo.conta.codigo) === String(conta.codigo)) continue;
      jaEra = false;
      const comparacao = ativo ? await compararComEmUso(ativo, 'razao', { conta }) : null;
      if (ativo && typeof lugar.conferirTroca === 'function' && !(await lugar.conferirTroca({ tipo: 'razao', conta }, comparacao))) return null;
      const extra = Object.assign({}, maisCampos || {}, comparacao ? { comparacao } : {});
      let g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, extra);
      if (g.jaExistia && g.meta.conta && (g.meta.conta.papel !== papel.papel || g.meta.conta.familia !== papel.familia)) {
        // Já estava guardado com outro papel: guarda de novo com o papel deste lugar.
        await arm.apagarArquivo(g.meta.id);
        g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, extra);
      } else if (g.jaExistia && (!ativo || g.meta.id !== ativo.id)) {
        // Uma versão antiga deste lugar carregada de novo: vira a versão nova (a mais nova é a usada).
        g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, Object.assign({ recarga: U.agoraISO() }, extra));
      }
      novas.push({ meta: g.meta, ativo, comparacao });
    }
    // A empresa passa a saber o papel destas contas.
    if (Object.keys(lembrar).length) {
      const cad = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo)); // relido: outra pessoa pode ter mexido
      const salvo = await arm.salvarEmpresa(Object.assign({}, cad, { papeisDeConta: Object.assign({}, cad.papeisDeConta || {}, lembrar) }));
      const ix = app().empresas.findIndex((e) => String(e.codigo) === String(codigo));
      if (ix >= 0) app().empresas[ix] = salvo;
    }
    return { novas, jaEra };
  }

  // Sobe UM arquivo num lugar. Devolve true se guardou. op: { semRota (não redesenha no fim), lugares (os outros
  // lugares do quadro: o diário solto num razão serve todos), lido (o arquivo já lido) }.
  async function subir(codigo, lugar, arquivo, op) {
    const arm = app().armazenamento;
    let r = op && op.lido;
    if (!r) {
      T.avisoRapido('Lendo ' + arquivo.name + '…', null, 2500);
      try {
        const bytes = await T.lerArquivoComoBytes(arquivo);
        r = raiz.Leitor.ler(bytes, arquivo.name);
        r.bytes = bytes;
      } catch (e) { T.avisoRapido('Não consegui ler ' + arquivo.name + ': ' + T.mensagemDeErro(e), 'erro'); return false; }
    }
    const naoServe = (esperado, outroTipo) => T.janela({
      titulo: 'Esse arquivo não é ' + esperado,
      corpo: '<p style="line-height:1.5">Este lugar é o do <b>' + T.esc(lugar.nome) + '</b>, mas <b>' + T.esc(arquivo.name) + '</b> ' +
        (outroTipo ? 'é de outro tipo: ' + T.esc(r.nomeDoTipo || r.tipo) + '.' : 'não foi entendido pelo programa' + (r.motivo ? ': ' + T.esc(r.motivo) : '.')) + '</p>' +
        '<p class="suave pequeno" style="margin-top:8px">Confira se é o arquivo certo. Se for, mas o programa não entendeu, mande o desenho pelo menu “Ver o desenho de um arquivo”.</p>' });
    try {
      let resumo, jaEra = true;
      const novas = []; // { meta, comparacao } das versões guardadas agora
      const versaoNova = async (g, ativo, comparacao) => { novas.push({ meta: g.meta, ativo, comparacao }); };
      // O livro diário solto num lugar de razão: guarda como o diário do ano e oferece tirar dele as contas dos razões.
      if (lugar.tipo === 'razao' && r.tipo === 'diario' && r.diario && r.diario.lancamentos.length) {
        const d = r.diario;
        const ok = await T.confirmar({ titulo: 'Esse arquivo é o livro diário',
          texto: '<b>' + T.esc(arquivo.name) + '</b> é o livro diário da empresa (' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + ', ' + d.lancamentos.length.toLocaleString('pt-BR') + ' lançamentos). ' +
            'Guardar como o diário de ' + T.esc(d.periodo.ate.slice(6, 10)) + ' e escolher as contas que saem dele para este passo?',
          botao: 'Guardar o diário' });
        if (!ok) return false;
        const lugarDiario = lugarDoDiario(d.periodo.ate.slice(6, 10), await arm.arquivos(codigo));
        if (!(await subir(codigo, lugarDiario, arquivo, { semRota: true, lido: r }))) return false;
        await doDiario(codigo, (op && op.lugares) || [lugar], { semRota: true });
        if (!(op && op.semRota)) app().mostrarRota();
        return true;
      }
      if (lugar.tipo === 'razao') {
        if (r.tipo !== 'razao' || !r.contas || !r.contas.length) { await naoServe('um razão', r.tipo !== 'razao' && r.tipo !== 'desconhecido'); return false; }
        const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
        const rz = r.razao;
        if (rz.cnpj && emp.cnpj && String(rz.cnpj).slice(0, 8) !== String(emp.cnpj).slice(0, 8)) {
          const ok = await T.confirmar({ titulo: 'Esse razão é de outra empresa?',
            texto: 'O CNPJ do razão (' + U.formatarCnpj(rz.cnpj) + ') não é o de <b>' + T.esc(emp.nome) + '</b> (' + U.formatarCnpj(emp.cnpj) + ').',
            botao: 'Guardar mesmo assim', perigo: true });
          if (!ok) return false;
        }
        // Papel escolhido antes para esta empresa: ajuda a achar a conta num razão de várias.
        const escolhidos = emp.papeisDeConta || {};
        r.contas.forEach((c) => { const e = escolhidos[c.codigo]; if (e && e.familia) c.papel = { familia: e.familia, papel: e.papel, regra: 'escolhido para esta empresa', banco: null, escolhido: true }; });
        const doPapel = r.contas.filter((c) => c.papel && c.papel.familia === 'fornecedores' && c.papel.papel === lugar.papel);
        const contas = r.contas.length === 1 ? [r.contas[0]] : doPapel.length === 1 ? doPapel : await escolherContas(r, lugar);
        if (!contas || !contas.length) return false;
        // Tem lançamento no período (ou até o fim do mês)?
        const per = lugar.periodo || { de: null, ate: lugar.competencia };
        const iniNum = per.de ? U.inicioDaCompetencia(per.de).numero : -Infinity;
        const fimNum = U.fimDaCompetencia(per.ate || lugar.competencia).numero;
        const noPeriodo = contas.reduce((s, c) => s + c.lancamentos.filter((l) => { const n = U.montarData(l.dia, l.mes, l.ano); return !!n && n.numero >= iniNum && n.numero <= fimNum; }).length, 0);
        const nomePeriodo = lugar.nomePeriodo || (per.de ? U.nomeCompetencia(per.de) + ' a ' : 'até o fim de ') + U.nomeCompetencia(per.ate || lugar.competencia);
        const emPeriodo = (per.de ? 'em ' : '') + nomePeriodo; // "em abril a agosto/2026" ou "até o fim de julho/2026"
        if (!noPeriodo) {
          const ok = await T.confirmar({ titulo: 'Esse razão não tem lançamento no período',
            texto: T.esc(arquivo.name) + (rz.periodo ? ' vai de <b>' + T.esc(rz.periodo.de) + ' a ' + T.esc(rz.periodo.ate) + '</b>' : '') + ' e não tem nenhum lançamento ' + (per.de ? 'em ' : '') + '<b>' + T.esc(nomePeriodo) + '</b>. É o arquivo certo?',
            botao: 'Guardar assim mesmo', perigo: true });
          if (!ok) return false;
        }
        const guardadas = await guardarContasNoLugar(codigo, lugar, contas.map((conta) => ({ r, conta })));
        if (!guardadas) return false;
        if (!guardadas.jaEra) jaEra = false;
        guardadas.novas.forEach((n) => novas.push(n));
        resumo =(contas.length === 1 ? 'conta ' + contas[0].codigo : contas.length + ' contas (' + contas.map((c) => c.codigo).join(', ') + ')') +
          ' · ' + noPeriodo + ' lançamento(s) ' + emPeriodo + (rz.periodo ? ' (arquivo de ' + rz.periodo.de + ' a ' + rz.periodo.ate + ')' : '');
      } else if (lugar.tipo === 'diario') {
        // Livro diário (Dony, 22/09/2026: "ao invés de subir razão por razão, subir o diário"): um por ano, versões.
        if (r.tipo !== 'diario') {
          const lido = await diarioSemTitulo(r, arquivo);
          if (lido === false) return false;
          if (lido) { r.tipo = 'diario'; r.diario = lido; }
        }
        const d = r.diario;
        if (r.tipo !== 'diario' || !d || !d.lancamentos.length) { await naoServe('um livro diário', r.tipo !== 'diario' && r.tipo !== 'desconhecido'); return false; }
        const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
        if (d.cnpj && emp.cnpj && String(d.cnpj).slice(0, 8) !== String(emp.cnpj).slice(0, 8)) {
          const ok = await T.confirmar({ titulo: 'Esse diário é de outra empresa?',
            texto: 'O CNPJ do diário (' + U.formatarCnpj(d.cnpj) + ') não é o de <b>' + T.esc(emp.nome) + '</b> (' + U.formatarCnpj(emp.cnpj) + ').',
            botao: 'Guardar mesmo assim', perigo: true });
          if (!ok) return false;
        }
        const ano = d.periodo.ate.slice(6, 10);
        if (ano !== String(lugar.competencia).slice(0, 4)) {
          await T.janela({ titulo: 'O diário é de outro ano',
            corpo: '<p style="line-height:1.5">' + T.esc(arquivo.name) + ' vai de <b>' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + '</b>, mas este lugar é o do diário de <b>' +
              T.esc(String(lugar.competencia).slice(0, 4)) + '</b>. Escolha o ano ' + T.esc(ano) + ' lá em cima e carregue de novo.</p>' });
          return false;
        }
        if (!d.confere) {
          const ok = await T.confirmar({ titulo: 'O diário não fecha',
            texto: d.avisos.map((a) => T.esc(a)).join('<br>') + '<br><br>Os razões que saírem dele podem não bater com o balancete. Guardar assim mesmo?',
            botao: 'Guardar assim mesmo', perigo: true });
          if (!ok) return false;
        }
        const ativo = emUsoNoLugar(lugar);
        if (!(ativo && ativo.hashDoConteudo === r.hash)) {
          jaEra = false;
          // O diário novo tem menos meses que o em uso: confirma (a versão nova passa a ser a usada).
          const dia = (t) => { const x = U.lerData(t); return x ? x.numero : 0; };
          if (ativo && ativo.periodo && (dia(d.periodo.de) > dia(ativo.periodo.de) || dia(d.periodo.ate) < dia(ativo.periodo.ate))) {
            const ok = await T.confirmar({ titulo: 'O diário novo tem menos meses',
              texto: 'O diário em uso vai de <b>' + T.esc(ativo.periodo.de + ' a ' + ativo.periodo.ate) + '</b>; o novo, de <b>' + T.esc(d.periodo.de + ' a ' + d.periodo.ate) + '</b>. ' +
                'O novo passa a ser o usado (o anterior continua guardado). Continuar?',
              botao: 'Usar o novo', perigo: true });
            if (!ok) return false;
          }
          const comparacao = ativo ? await compararComEmUso(ativo, 'diario', d) : null;
          const extra = comparacao ? { comparacao } : {};
          let g = await guardarDiario(codigo, r, lugar.competencia, extra);
          if (g.jaExistia && (!ativo || g.meta.id !== ativo.id)) g = await guardarDiario(codigo, r, lugar.competencia, Object.assign({ recarga: U.agoraISO() }, extra));
          await versaoNova(g, ativo, comparacao);
        }
        resumo = d.lancamentos.length.toLocaleString('pt-BR') + ' lançamentos · ' + d.periodo.de + ' a ' + d.periodo.ate + (d.confere ? ' · débitos = créditos' : '');
      } else if (lugar.tipo === 'balancete') {
        // Balancete que o leitor geral não entendeu (ou em que a conta não fecha): as colunas guardadas na
        // empresa; senão pelo conteúdo ou indicadas por quem usa (Dony, 18/09/2026: "vários tipos de
        // balancete; se não entender, eu indico as colunas no primeiro e ele guarda").
        if (r.tipo !== 'razao' && !/^financeiro/.test(r.tipo) && !balanceteBom(r.balancete)) {
          const lido = await balanceteDoArquivo(r, arquivo, codigo);
          if (lido === false) return false;
          if (lido) { r.tipo = 'balancete'; r.balancete = lido; r.competencia = lido.competencia; }
        }
        const b = r.balancete;
        if (r.tipo !== 'balancete' || !b || !b.contas.length) { await naoServe('um balancete', r.tipo !== 'balancete' && r.tipo !== 'desconhecido'); return false; }
        const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
        if (b.cnpj && emp.cnpj && String(b.cnpj).slice(0, 8) !== String(emp.cnpj).slice(0, 8)) {
          const ok = await T.confirmar({ titulo: 'Esse balancete é de outra empresa?',
            texto: 'O CNPJ do balancete (' + U.formatarCnpj(b.cnpj) + ') não é o de <b>' + T.esc(emp.nome) + '</b> (' + U.formatarCnpj(emp.cnpj) + ').',
            botao: 'Guardar mesmo assim', perigo: true });
          if (!ok) return false;
        }
        if (b.competencia && b.competencia !== lugar.competencia) {
          const ok = await T.confirmar({ titulo: 'O balancete é de outro mês',
            texto: T.esc(arquivo.name) + ' é de <b>' + T.esc(b.periodo.de + ' a ' + b.periodo.ate) + '</b>, mas este lugar é o de <b>' + T.esc(U.nomeCompetencia(lugar.competencia)) + '</b>. É o arquivo certo?',
            botao: 'Guardar em ' + U.nomeCompetencia(lugar.competencia), perigo: true });
          if (!ok) return false;
        }
        if (b.variosMeses || !b.confere) {
          const ok = await T.confirmar({ titulo: b.variosMeses ? 'O balancete tem mais de um mês' : 'O balancete não fecha',
            texto: b.avisos.map((a) => T.esc(a)).join('<br>') + '<br><br>O relatório usa os débitos e créditos de cada mês. Guardar assim mesmo?',
            botao: 'Guardar assim mesmo', perigo: true });
          if (!ok) return false;
        }
        const ativo = emUsoNoLugar(lugar);
        if (!(ativo && ativo.hashDoConteudo === r.hash)) {
          jaEra = false;
          const comparacao = ativo ? await compararComEmUso(ativo, 'balancete', b) : null;
          const extra = comparacao ? { comparacao } : {};
          let g = await guardarBalancete(codigo, r, lugar.competencia, extra);
          if (g.jaExistia && (!ativo || g.meta.id !== ativo.id)) g = await guardarBalancete(codigo, r, lugar.competencia, Object.assign({ recarga: U.agoraISO() }, extra));
          await versaoNova(g, ativo, comparacao);
        }
        resumo = b.contas.length + ' contas · ' + (b.periodo ? b.periodo.de + ' a ' + b.periodo.ate : U.nomeCompetencia(lugar.competencia));
      } else {
        if (!r.financeiro) { await naoServe('um relatório de títulos em aberto (aging)', !/^financeiro|^desconhecido$/.test(r.tipo)); return false; }
        const pos = r.financeiro.posicao && U.lerData(r.financeiro.posicao);
        if (pos && U.competenciaDe(pos) !== lugar.competencia) {
          const ok = await T.confirmar({ titulo: 'A data do relatório é de outro mês',
            texto: 'O relatório diz posição em <b>' + T.esc(pos.texto) + '</b>, mas este lugar é o <b>' + T.esc(lugar.nome) + '</b>. É o arquivo certo?',
            botao: 'Guardar como ' + U.nomeCompetencia(lugar.competencia), perigo: true });
          if (!ok) return false;
        }
        const ativo = emUsoNoLugar(lugar);
        if (!(ativo && ativo.hashDoConteudo === r.hash)) {
          jaEra = false;
          const comparacao = ativo ? await compararComEmUso(ativo, 'aging', r.financeiro) : null;
          if (ativo && typeof lugar.conferirTroca === 'function' && !(await lugar.conferirTroca({ tipo: 'aging', financeiro: r.financeiro }, comparacao))) return false;
          const extra = comparacao ? { comparacao } : {};
          let g = await guardarTitulos(codigo, r, lugar.tipo, lugar.competencia, extra);
          if (g.jaExistia && (!ativo || g.meta.id !== ativo.id)) g = await guardarTitulos(codigo, r, lugar.tipo, lugar.competencia, Object.assign({ recarga: U.agoraISO() }, extra));
          await versaoNova(g, ativo, comparacao);
        }
        resumo = r.financeiro.titulos.length + ' títulos · ' + T.moeda(r.financeiro.total);
        // Relatório com filtro (só um tipo de linha entra ou uma aba só): diz qual regra valeu e, se for o
        // caso, quantas linhas ficaram de fora.
        const fora = (r.financeiro.descartados || []).reduce((s, d) => s + (d.quantidade || 0), 0);
        if (r.financeiro.formato) resumo += ' · ' + (fora ? fora + ' linha(s) de fora — entram ' : '') + r.financeiro.formato;
      }
      const textoVersao = await textoDasVersoes(codigo, lugar, novas);
      await arm.registrarNoLog({ codigo, acao: 'arquivo-no-lugar', alvo: (lugar.log || lugar.id) + '/' + U.anoMes(lugar.competencia),
        detalhe: arquivo.name + ' → ' + lugar.nome + (textoVersao ? ' · ' + textoVersao : '') });
      T.avisoRapido('✓ ' + primeiraMaiuscula(lugar.nome) + ': ' + arquivo.name + ' (' + resumo + ')' +
        (textoVersao ? ' — ' + textoVersao : jaEra ? ' — já era este arquivo' : ''), 'ok', 9000);
      if (!(op && op.semRota)) app().mostrarRota();
      return true;
    } catch (e) {
      T.avisoRapido('Não foi possível guardar ' + arquivo.name + ': ' + T.mensagemDeErro(e), 'erro');
      return false;
    }
  }

  // ------------------------------------------------------------------
  // RAZÃO TIRADO DO LIVRO DIÁRIO (Dony, 22/09/2026: "ao invés de subir razão por razão, subir o diário" + "tem que ser
  // um misto, optativo e não obrigatório: não muda as regras dos que já funcionam por razão" + "se eu carreguei o
  // diário, automaticamente ele tem que entender que o diário é o razão; eu quero poder selecionar quais são as contas
  // que eu estou conciliando"). As contas escolhidas (guardadas na empresa, por papel) saem do diário em uso, com o
  // saldo inicial do balancete, e ficam guardadas como um razão carregado (mesmas versões, comparação e papel da
  // conta). Ao abrir o passo, o razão sai de novo quando o diário, os balancetes do período ou a escolha mudam. Conta
  // com razão CARREGADO em uso continua com o razão (o misto, conta por conta).
  // ------------------------------------------------------------------
  const BOM = String.fromCharCode(0xFEFF);
  // O lugar do livro diário de um ano (competência = janeiro do ano).
  function lugarDoDiario(ano, metas) {
    const doAno = (metas || []).filter((m) => m.tipo === 'diario' && String(m.competencia).slice(0, 4) === String(ano))
      .sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    return { id: 'diario', parte: 'Contabilidade', titulo: 'Livro diário de ' + ano, sub: 'todas as contas, do 1º mês ao último', nome: 'livro diário de ' + ano,
      log: 'diario', tipo: 'diario', competencia: ano + '-01-01', arquivos: doAno.length ? [doAno[0]] : [] };
  }
  function periodoDoLugar(lugar) {
    const per = lugar.periodo || { de: null, ate: lugar.competencia };
    return { de: per.de || null, ate: per.ate || lugar.competencia };
  }
  // O razão tirado do diário é sempre do começo do diário até o fim do mês do lugar: o mesmo para todos os passos da
  // competência (eles dividem o lugar guardado; o ③ e o ② usam só as linhas do período deles). Um passo não troca o razão
  // do outro.
  function periodoDeGuardar(lugar) { return { de: null, ate: periodoDoLugar(lugar).ate }; }
  // Os diários em uso: o mais novo de cada ano.
  function diariosEmUso(metas) {
    const porAno = new Map();
    (metas || []).filter((m) => m.tipo === 'diario' && m.periodo).forEach((m) => {
      const a = String(m.competencia).slice(0, 4);
      if (!porAno.has(a) || U.paraMs(m.enviadoEm) > U.paraMs(porAno.get(a).enviadoEm)) porAno.set(a, m);
    });
    return Array.from(porAno.values()).sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
  }
  // O diário em uso que cobre o período do lugar (no "até o fim de", o razão começa no começo do diário).
  function diarioDoLugar(metas, lugar) {
    const p = periodoDoLugar(lugar);
    const fim = U.fimDaCompetencia(p.ate), ini = p.de ? U.inicioDaCompetencia(p.de) : null;
    if (!fim) return null;
    return diariosEmUso(metas).find((m) => {
      const a = U.lerData(m.periodo.de), b = U.lerData(m.periodo.ate);
      return !!(a && b && b.numero >= fim.numero && a.numero <= fim.numero && (!ini || a.numero <= ini.numero));
    }) || null;
  }
  // Os balancetes do período do diário: o mais novo de cada mês, do 1º mês ao mês depois do fim.
  function metasDosBalancetes(metas, periodo) {
    const de = U.competenciaDe(U.lerData(periodo.de)), ate = U.somarMeses(U.competenciaDe(U.lerData(periodo.ate)), 1);
    const porMes = new Map();
    (metas || []).filter((m) => m.tipo === 'balancete' && m.competencia >= de && m.competencia <= ate).forEach((m) => {
      if (!porMes.has(m.competencia) || U.paraMs(m.enviadoEm) > U.paraMs(porMes.get(m.competencia).enviadoEm)) porMes.set(m.competencia, m);
    });
    return Array.from(porMes.values()).sort((a, b) => a.competencia.localeCompare(b.competencia));
  }
  // Os que trazem o código reduzido (o diário usa esse código): o saldo inicial e a conferência saem deles.
  async function balancetesDoDiario(metas, periodo) {
    const lista = [];
    for (const m of metasDosBalancetes(metas, periodo)) {
      const c = await app().armazenamento.conteudoDoArquivo(m.id);
      if (c && c.contas && c.contas.some((x) => String(x.reduzido || '').trim())) lista.push({ competencia: m.competencia, contas: c.contas, arquivo: m.arquivo });
    }
    return lista;
  }
  // A base do razão tirado do diário num lugar: o diário em uso, o balancete que dá o saldo inicial (o primeiro do período)
  // e o do mês do fim do lugar (confere o saldo final). Se mudou, o razão sai de novo.
  function baseDoLugar(md, metasBal, lugar) {
    const fim = periodoDoLugar(lugar).ate;
    const doFim = metasBal.find((m) => m.competencia === fim);
    return md.id + '|' + (metasBal[0] ? metasBal[0].id : '') + '|' + (doFim ? doFim.id : '');
  }

  // A escolha das contas, guardada na empresa por papel: { fornecedores_principal: [...], fornecedores_adiantamento: [...] }.
  const chaveDoPapel = (lugar) => 'fornecedores_' + lugar.papel;
  function contasEscolhidas(emp, lugar) {
    const x = emp && emp.contasDoDiario && emp.contasDoDiario[chaveDoPapel(lugar)];
    return Array.isArray(x) && x.length ? x.map(String) : null;
  }
  async function guardarEscolha(codigo, novas) {
    const arm = app().armazenamento;
    const cad = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo)); // relido: outra pessoa pode ter mexido
    if (!cad) return;
    const salvo = await arm.salvarEmpresa(Object.assign({}, cad, { contasDoDiario: Object.assign({}, cad.contasDoDiario || {}, novas) }));
    const ix = app().empresas.findIndex((e) => String(e.codigo) === String(codigo));
    if (ix >= 0) app().empresas[ix] = salvo;
  }

  // Tudo o que a escolha precisa: o diário que cobre os lugares, os balancetes, o plano de contas e, para cada lugar de
  // razão, as contas candidatas (as escolhidas antes, as em uso, as achadas no plano e as de papel lembrado) com o razão
  // de cada uma. Quando não dá: { ok: false, motivo: 'sem-diario' | 'fora-do-periodo' | 'sem-balancete', md, diario }.
  async function prepararDoDiario(codigo, lugares) {
    const arm = app().armazenamento;
    const MD = raiz.MotorDiario;
    const metas = await arm.arquivos(codigo);
    const alvos = (lugares || []).filter((l) => l.tipo === 'razao').map((lugar) => ({ lugar, md: diarioDoLugar(metas, lugar) })).filter((a) => a.md);
    if (!alvos.length) { const algum = diariosEmUso(metas)[0] || null; return { ok: false, motivo: algum ? 'fora-do-periodo' : 'sem-diario', md: algum }; }
    const md = alvos[0].md;
    const diario = await arm.conteudoDoArquivo(md.id);
    const balancetes = await balancetesDoDiario(metas, md.periodo);
    if (!balancetes.length) return { ok: false, motivo: 'sem-balancete', md, diario };
    const plano = MD.planoDosBalancetes(balancetes);
    const noDiario = new Set(diario.contas || []);
    const detectadas = MD.contasDasConciliacoes(plano);
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
    const escolhidos = emp.papeisDeConta || {};
    const existe = (red) => plano.has(String(red)) || noDiario.has(String(red));
    const papelDe = (red) => {
      const e = escolhidos[red];
      if (e && e.familia) return { familia: e.familia, papel: e.papel, escolhido: true };
      const d = detectadas.find((c) => c.reduzido === red);
      return d ? { familia: d.familia, papel: d.papel } : null;
    };
    const grupos = alvos.map(({ lugar }) => {
      const salvas = contasEscolhidas(emp, lugar);
      const ids = [];
      const somar = (red) => { red = String(red); if (ids.indexOf(red) < 0 && existe(red)) ids.push(red); };
      (salvas || []).forEach(somar);
      (lugar.arquivos || []).forEach((m) => { if (m.conta && m.conta.codigo) somar(m.conta.codigo); });
      detectadas.filter((c) => c.familia === 'fornecedores' && c.papel === lugar.papel).forEach((c) => somar(c.reduzido));
      Object.keys(escolhidos).forEach((k) => { const e = escolhidos[k]; if (e && e.familia === 'fornecedores' && e.papel === lugar.papel) somar(k); });
      const carregadas = new Set((lugar.arquivos || []).filter((m) => m.conta && m.origem !== 'diario').map((m) => String(m.conta.codigo)));
      const contas = ids.map((red) => ({ red, rz: MD.razaoDaConta(diario, balancetes, red, periodoDeGuardar(lugar)), carregada: carregadas.has(red) }));
      // Marcadas: a escolha guardada; sem ela, as achadas com movimento ou saldo (no lugar de uma conta só, a em uso ou a primeira).
      let marcadas;
      if (salvas) marcadas = salvas.filter(existe);
      else if (lugar.varias) marcadas = contas.filter((x) => x.rz.conta.lancamentos.length > 0 || x.rz.conta.saldoAnterior !== 0).map((x) => x.red);
      else {
        const emUso = new Set((lugar.arquivos || []).map((m) => m.conta && String(m.conta.codigo)));
        const x = contas.find((c) => emUso.has(c.red)) || contas[0];
        marcadas = x ? [x.red] : [];
      }
      return { lugar, contas, marcadas, salvas: !!salvas };
    });
    return { ok: true, md, diario, balancetes, plano, noDiario, existe, papelDe, grupos, metasBal: metasDosBalancetes(metas, md.periodo) };
  }

  // Por que não dá para tirar do diário (a mesma frase na janela e na tela do passo).
  function textoSemDiario(codigo, prep, comp) {
    const link = (md) => '<a href="#/empresa/' + encodeURIComponent(codigo) + '/diario' + (md ? '/' + String(md.competencia).slice(0, 4) : '') + '">📒 Livro diário</a>';
    if (prep && prep.motivo === 'sem-balancete') {
      const mes = prep.diario && prep.diario.meses && prep.diario.meses[0] ? prep.diario.meses[0].comp : prep.md.competencia;
      return '<b>O livro diário é o razão deste passo, mas falta o saldo inicial das contas.</b> O diário traz os débitos e os créditos, não o saldo com que cada conta começou: ' +
        'carregue o <b>balancete de ' + T.esc(U.nomeCompetencia(mes)) + '</b> (ou de qualquer mês do diário, com o código reduzido das contas) no quadro de arquivos aqui embaixo ou em ' + link(prep.md) + '.';
    }
    if (prep && prep.motivo === 'fora-do-periodo') {
      return '<b>O livro diário guardado vai de ' + T.esc(prep.md.periodo.de + ' a ' + prep.md.periodo.ate) + ' e não cobre ' + T.esc(U.nomeCompetencia(comp)) + '.</b> ' +
        'Guarde o diário até ' + T.esc(U.nomeCompetencia(comp)) + ' em ' + link(prep.md) + ', ou carregue o razão aqui embaixo, como sempre.';
    }
    return 'Nenhum livro diário guardado. Guarde o diário da empresa em ' + link(null) + ', ou carregue o razão aqui embaixo, como sempre.';
  }
  // O lugar do balancete que dá o saldo inicial (o do 1º mês do diário), para carregar ali mesmo no passo.
  function lugarDoBalanceteDoDiario(prep) {
    if (!prep || prep.motivo !== 'sem-balancete' || !prep.diario || !prep.diario.meses || !prep.diario.meses.length) return null;
    const comp = prep.diario.meses[0].comp;
    return { id: 'bal-diario', parte: 'Balancete · saldo inicial do diário', titulo: 'Balancete de ' + U.nomeCompetencia(comp), sub: 'o mesmo do relatório de apresentação',
      nome: 'balancete de ' + U.nomeCompetencia(comp), log: 'apresentacao/balancete', tipo: 'balancete', competencia: comp, arquivos: [] };
  }

  // As contas de cada lugar para marcar (na janela e no cartão do passo).
  function htmlDaEscolha(prep, op) {
    const fimNome = (lugar) => U.nomeCompetencia(periodoDoLugar(lugar).ate);
    const dc = (v) => T.htmlDC(v, v >= 0 ? 'D' : 'C');
    const linhaDaConta = (g, x) => {
      const c = x.rz.conta, confere = x.rz.confereComBalancete;
      return '<label class="item-aba conta-do-diario"><input type="' + (g.lugar.varias ? 'checkbox' : 'radio') + '" name="diario-' + T.esc(g.lugar.id) + '" value="' + T.esc(x.red) + '"' +
        (g.marcadas.indexOf(x.red) >= 0 ? ' checked' : '') + '> ' +
        '<span><b>' + T.esc(x.red) + '</b> ' + T.esc(c.nome) + (c.classificacao ? ' <span class="suave pequeno">' + T.esc(c.classificacao) + '</span>' : '') +
        (x.carregada ? ' <span class="selo versao" title="Esta conta tem razão carregado neste lugar: ele continua valendo">razão carregado</span>' : '') +
        '<br><span class="suave pequeno">' + c.lancamentos.length.toLocaleString('pt-BR') + ' lanç. · saldo inicial ' + dc(c.saldoAnterior) + ' → final ' + dc(c.saldoFinal) + '</span> ' +
        (confere === true ? '<span class="selo ok-diario" title="Saldo inicial + débitos − créditos do diário = saldo do balancete">✓ bate com o balancete de ' + T.esc(fimNome(g.lugar)) + '</span>'
          : confere === false ? '<span class="selo falta-diario">✗ o balancete de ' + T.esc(fimNome(g.lugar)) + ' diz ' + dc(c.saldoFinalDeclarado) + '</span>'
            : '<span class="suave pequeno">· sem o balancete de ' + T.esc(fimNome(g.lugar)) + ' para conferir o saldo do fim</span>') + '</span></label>';
    };
    return '<p class="suave pequeno" style="margin-bottom:8px;line-height:1.5">' + T.esc(prep.md.arquivo) + ' · ' + T.esc(prep.md.periodo.de + ' a ' + prep.md.periodo.ate) +
      ' · saldo inicial do balancete de ' + T.esc(U.nomeCompetencia(prep.balancetes[0].competencia)) + '. ' +
      (op && op.soEscolha ? 'A escolha fica guardada na empresa: os passos tiram do diário o razão destas contas sozinhos.'
        : 'A escolha fica guardada na empresa: nas próximas vezes, e com o diário novo, os passos tiram o razão sozinhos. Conta com razão carregado continua com o razão.') + '</p>' +
      prep.grupos.map((g) => '<fieldset class="grupo-diario" data-grupo-diario="' + T.esc(g.lugar.id) + '"><legend>' + T.esc(g.lugar.titulo) +
        (op && op.soEscolha ? '' : ' · do começo do diário até o fim de ' + T.esc(fimNome(g.lugar))) + '</legend>' +
        (g.contas.length ? g.contas.map((x) => linhaDaConta(g, x)).join('') : '<p class="suave pequeno">O programa não achou no plano de contas nenhuma conta deste papel: digite o código reduzido abaixo.</p>') +
        '<label class="pequeno outra-conta">Outra conta (código reduzido; mais de uma, separe por vírgula): <input type="text" data-outra-conta="' + T.esc(g.lugar.id) + '" inputmode="numeric" placeholder="ex.: 148"></label>' +
        '</fieldset>').join('') + '<p class="falta pequeno" data-erro-diario hidden></p>';
  }
  // A escolha marcada na janela ou no cartão: [{ lugar, contas }], ou false (a mensagem de erro fica à vista).
  function lerEscolha(el, prep) {
    const erro = el.querySelector('[data-erro-diario]');
    const falhar = (t) => { if (erro) { erro.hidden = false; erro.textContent = t; } return false; };
    const porLugar = [];
    for (const g of prep.grupos) {
      const marcadas = Array.from(el.querySelectorAll('input[name="diario-' + g.lugar.id + '"]:checked')).map((x) => x.value);
      const digitadas = String((el.querySelector('[data-outra-conta="' + g.lugar.id + '"]') || {}).value || '').split(/[^0-9]+/).filter(Boolean).map((x) => x.replace(/^0+(?=\d)/, ''));
      const desconhecidas = digitadas.filter((x) => !prep.existe(x));
      if (desconhecidas.length) return falhar('Não achei no diário nem no plano de contas: ' + desconhecidas.join(', ') + '.');
      const contas = marcadas.concat(digitadas.filter((x) => marcadas.indexOf(x) < 0));
      if (!g.lugar.varias && contas.length > 1) return falhar('"' + g.lugar.titulo + '" é de uma conta só: marque uma ou digite uma.');
      porLugar.push({ lugar: g.lugar, contas });
    }
    if (!porLugar.some((x) => x.contas.length)) return falhar('Marque pelo menos uma conta.');
    return porLugar;
  }

  // Um lugar de razão com as contas escolhidas: tira do diário e guarda o razão das contas que mudaram (diário novo,
  // balancete novo ou conta nova na escolha); o razão tirado do diário das contas desmarcadas sai do lugar. Conta com razão
  // carregado em uso fica como está. Devolve { texto } (o que foi feito, para o aviso) ou null (desistiu na conferência).
  async function sincronizarLugar(codigo, prep, lugar, contas) {
    const MD = raiz.MotorDiario;
    const arm = app().armazenamento;
    const p = periodoDeGuardar(lugar);
    const emUso = new Map((lugar.arquivos || []).filter((m) => m.conta).map((m) => [String(m.conta.codigo), m]));
    const itens = [];
    for (const red of contas) {
      const atual = emUso.get(red);
      if (atual && atual.origem !== 'diario') continue;
      const rz = MD.razaoDaConta(prep.diario, prep.balancetes, red, p);
      const bytes = new TextEncoder().encode(BOM + MD.csvDoRazao(rz));
      const hash = U.hashBytes(bytes);
      if (atual && atual.hashDoConteudo === hash) continue;
      const r = { nomeArquivo: 'Razão do diário - conta ' + red + ' - ' + rz.periodo.de.replace(/\//g, '-') + ' a ' + rz.periodo.ate.replace(/\//g, '-') + '.csv',
        hash, bytes, razao: { periodo: rz.periodo, desenho: 'diario', empresa: prep.diario.empresa, cnpj: prep.diario.cnpj, periodoOrigem: 'diario' } };
      itens.push({ r, conta: Object.assign({}, rz.conta, { papel: prep.papelDe(red) }), extra: { origem: 'diario', diarioId: prep.md.id, diarioArquivo: prep.md.arquivo, baseDiario: baseDoLugar(prep.md, prep.metasBal, lugar) } });
    }
    let guardadas = { novas: [], jaEra: true };
    if (itens.length) {
      guardadas = await guardarContasNoLugar(codigo, lugar, itens);
      if (!guardadas) return null;
    }
    // Desmarcadas: saem todas as versões tiradas do diário (a carregada, se houver, volta a valer).
    const tirar = [];
    if (Array.from(emUso.values()).some((m) => m.origem === 'diario' && contas.indexOf(String(m.conta.codigo)) < 0)) {
      const metas = await arm.arquivos(codigo);
      emUso.forEach((m, red) => {
        if (m.origem !== 'diario' || contas.indexOf(red) >= 0) return;
        doMesmoLugar(metas, m, lugar).filter((x) => x.origem === 'diario').forEach((x) => tirar.push(x));
      });
      for (const m of tirar) await arm.apagarArquivo(m.id);
    }
    if (!itens.length && !tirar.length) return { texto: '' };
    const textoVersao = await textoDasVersoes(codigo, lugar, guardadas.novas);
    const partes = [];
    if (itens.length) {
      partes.push((itens.length === 1 ? 'conta ' + itens[0].conta.codigo : itens.length + ' contas (' + itens.map((x) => x.conta.codigo).join(', ') + ')') + ' · ' +
        itens.reduce((s, x) => s + x.conta.lancamentos.length, 0).toLocaleString('pt-BR') + ' lançamento(s) de ' + itens[0].r.razao.periodo.de + ' a ' + itens[0].r.razao.periodo.ate);
    }
    const sairam = Array.from(new Set(tirar.map((m) => String(m.conta.codigo))));
    if (sairam.length) partes.push((sairam.length === 1 ? 'saiu a conta ' : 'saíram as contas ') + sairam.join(', '));
    const resumo = partes.join(' · ');
    await arm.registrarNoLog({ codigo, acao: 'razao-do-diario', alvo: (lugar.log || lugar.id) + '/' + U.anoMes(lugar.competencia),
      detalhe: prep.md.arquivo + ' → ' + lugar.nome + ' · ' + resumo + (textoVersao ? ' · ' + textoVersao : '') });
    return { texto: primeiraMaiuscula(lugar.nome) + ': ' + resumo + (textoVersao ? ' — ' + textoVersao : '') };
  }

  // Aplica a escolha: guarda as contas na empresa e (fora da página do diário) tira o razão delas em cada lugar.
  async function aplicarEscolha(codigo, prep, porLugar, op) {
    const novas = {};
    porLugar.forEach(({ lugar, contas }) => { novas[chaveDoPapel(lugar)] = contas; });
    try {
      await guardarEscolha(codigo, novas);
      if (op && op.soEscolha) { T.avisoRapido('✓ Contas guardadas: os passos tiram o razão delas do livro diário.', 'ok', 6000); return true; }
      const feitos = [];
      for (const { lugar, contas } of porLugar) {
        const r = await sincronizarLugar(codigo, prep, lugar, contas);
        if (r === null) break;
        if (r.texto) feitos.push(r.texto);
      }
      T.avisoRapido(feitos.length ? '✓ Do livro diário — ' + feitos.join(' · ') : '✓ Contas guardadas: os razões já estavam em dia com o diário.', 'ok', 10000);
      return true;
    } catch (e) {
      T.avisoRapido('Não foi possível guardar o razão tirado do diário: ' + T.mensagemDeErro(e), 'erro');
      return false;
    }
  }

  // A janela da escolha: botões "📒 Tirar do diário" e "✎ Trocar as contas" dos passos, ou a página do diário (op.soEscolha:
  // só guarda a escolha). lugares: os de razão do passo (na página do diário, lugares de exemplo com o papel).
  async function doDiario(codigo, lugares, op) {
    let prep;
    try {
      T.avisoRapido('Abrindo o livro diário…', null, 2500);
      prep = await prepararDoDiario(codigo, lugares);
    } catch (e) { T.avisoRapido('Não consegui abrir o livro diário: ' + T.mensagemDeErro(e), 'erro'); return false; }
    if (!prep.ok) {
      const comp = lugares && lugares[0] ? periodoDoLugar(lugares[0]).ate : '';
      await T.janela({ titulo: 'Livro diário', corpo: '<p style="line-height:1.5">' + textoSemDiario(codigo, prep, comp) + '</p>' });
      return false;
    }
    const escolha = await T.janela({ titulo: op && op.soEscolha ? 'Contas das conciliações (livro diário)' : 'Contas desta conciliação (livro diário)', larga: true,
      corpo: htmlDaEscolha(prep, op),
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: op && op.soEscolha ? 'Guardar a escolha' : 'Usar estas contas', tipo: 'primario', antes: (j) => lerEscolha(j, prep) }] });
    if (!escolha) return false;
    const feito = await aplicarEscolha(codigo, prep, escolha, op);
    if (feito && !(op && op.semRota)) app().mostrarRota();
    return feito;
  }

  // O cartão da escolha, na tela do passo (lugar de razão vazio, diário guardado e nenhuma conta escolhida ainda).
  function cartaoDaEscolha(prep) {
    return '<section class="cartao corpo escolha-diario"><h3>📒 O livro diário é o razão deste passo</h3>' +
      '<p class="suave" style="margin:4px 0 10px;line-height:1.5">Não precisa carregar o razão: marque as contas que você está conciliando e o programa tira o razão delas do diário. ' +
      'Prefere o razão? Carregue no quadro de arquivos aqui embaixo, como sempre.</p>' + htmlDaEscolha(prep) +
      '<div class="linha-flex" style="margin-top:10px"><button type="button" class="botao primario" data-usar-contas>📒 Conciliar com estas contas</button></div></section>';
  }
  function ligarCartaoDaEscolha(el, codigo, prep) {
    if (!el || !prep) return;
    el.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-usar-contas]');
      if (!b) return;
      const escolha = lerEscolha(el, prep);
      if (!escolha) return;
      b.disabled = true;
      if (await aplicarEscolha(codigo, prep, escolha)) app().mostrarRota(); else b.disabled = false;
    });
  }

  // AUTOMÁTICO, ao abrir o passo: com diário que cobre o período e contas escolhidas, o razão delas sai do diário (só o que
  // mudou). Devolve { estado: 'ok' | 'escolher' (lugar vazio sem escolha) | 'sem-balancete' | 'fora-do-periodo' | 'sem-diario',
  // mudou, prep (quando a tela precisa mostrar a escolha ou o motivo) }.
  async function sincronizarDoDiario(codigo, lugares) {
    const metas = await app().armazenamento.arquivos(codigo);
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo)) || {};
    const razoes = (lugares || []).filter((l) => l.tipo === 'razao');
    const alvos = razoes.map((lugar) => ({ lugar, md: diarioDoLugar(metas, lugar) })).filter((a) => a.md);
    const vazio = razoes.some((l) => !(l.arquivos || []).length);
    if (!alvos.length) {
      const algum = diariosEmUso(metas)[0] || null;
      return { estado: algum ? 'fora-do-periodo' : 'sem-diario', mudou: false, prep: algum && vazio ? { ok: false, motivo: 'fora-do-periodo', md: algum } : null };
    }
    const md = alvos[0].md;
    const metasBal = metasDosBalancetes(metas, md.periodo);
    // As contas que o diário movimenta (guardadas com ele): conta escolhida que ele não tem não pede para tirar de novo.
    const doDiario = Array.isArray(md.codigosDasContas) ? new Set(md.codigosDasContas.map(String)) : null;
    let precisa = false, escolher = false;
    for (const { lugar } of alvos) {
      const salvas = contasEscolhidas(emp, lugar);
      const arqs = lugar.arquivos || [];
      if (!salvas || (!lugar.varias && salvas.length > 1)) { if (!arqs.length) escolher = true; continue; }
      const base = baseDoLugar(md, metasBal, lugar);
      const emUso = new Map(arqs.filter((m) => m.conta).map((m) => [String(m.conta.codigo), m]));
      for (const red of salvas) {
        const m = emUso.get(red);
        if (!m && doDiario && !doDiario.has(red)) continue;
        // Em dia: tirado deste diário com estes balancetes (o razão tirado antes de existir a base vale pelo diário).
        const legado = !m || m.baseDiario ? false : m.diarioId === md.id && m.periodo && m.periodo.de === md.periodo.de;
        if (!m || (m.origem === 'diario' && !(m.baseDiario ? m.baseDiario === base : legado))) precisa = true;
      }
      if (arqs.some((m) => m.origem === 'diario' && m.conta && salvas.indexOf(String(m.conta.codigo)) < 0)) precisa = true;
    }
    if (!precisa && !escolher) return { estado: 'ok', mudou: false };
    const prep = await prepararDoDiario(codigo, lugares);
    if (!prep.ok) return { estado: prep.motivo, mudou: false, prep };
    let mudou = false;
    if (precisa) {
      const feitos = [];
      for (const g of prep.grupos) {
        const salvas = contasEscolhidas(emp, g.lugar);
        if (!salvas || (!g.lugar.varias && salvas.length > 1)) continue;
        const r = await sincronizarLugar(codigo, prep, g.lugar, salvas.filter(prep.existe));
        if (r && r.texto) { feitos.push(r.texto); mudou = true; }
      }
      if (feitos.length) T.avisoRapido('✓ Do livro diário — ' + feitos.join(' · '), 'ok', 9000);
    }
    return { estado: escolher ? 'escolher' : 'ok', mudou, prep };
  }

  // O que os lugares de razão têm do diário, para a linha do passo ("📒 do livro diário: 148, 2001 · 37").
  function resumoDoDiario(lugares) {
    const partes = [];
    (lugares || []).filter((l) => l.tipo === 'razao').forEach((l) => {
      const doDiario = (l.arquivos || []).filter((m) => m.origem === 'diario' && m.conta).map((m) => m.conta.codigo);
      if (doDiario.length) partes.push(l.titulo.replace(/^Razão de /, '') + ' ' + doDiario.join(', '));
    });
    return partes.join(' · ');
  }

  // Exclui UMA versão do lugar (a cópia vai para _apagados). Excluir a versão em uso volta para a
  // anterior; com mais de uma versão, dá para excluir todas de uma vez.
  async function apagar(codigo, lugar, meta, op) {
    if (!lugar || !meta) return false;
    const arm = app().armazenamento;
    const versoes = versoesDoArquivo(await arm.arquivos(codigo), meta, lugar);
    const pos = Math.max(0, versoes.findIndex((m) => m.id === meta.id));
    const numero = versoes.length - pos;
    const emUso = (lugar.arquivos || []).some((m) => m.id === meta.id);
    const anterior = emUso ? versoes[pos + 1] : null;
    const varias = versoes.length > 1;
    const oQue = !varias ? '' : emUso
      ? (anterior ? '<br><br>A <b>versão ' + (numero - 1) + '</b> (' + T.esc(anterior.arquivo) + ') volta a ser a usada.' : '')
      : '<br><br>É uma versão antiga: sai só da lista de versões (a usada continua a mesma).';
    const escolha = await T.janela({
      titulo: varias ? 'Excluir a versão ' + numero + '?' : 'Excluir este arquivo?',
      corpo: '<p style="line-height:1.5"><b>' + T.esc(meta.arquivo) + '</b>' + (meta.conta ? ' · conta ' + T.esc(meta.conta.codigo + ' ' + (meta.conta.nome || '')) : '') +
        ' — ' + T.esc(lugar.nome) + (meta.competencia !== lugar.competencia ? ' (guardado em ' + U.nomeCompetencia(meta.competencia) + ')' : '') + '.' + oQue +
        (!varias || (emUso && !anterior) ? '<br><br>Ele sai de todos os passos que usam este arquivo.' : '') +
        (emUso && lugar.avisoExcluir ? '<br><br>' + lugar.avisoExcluir : '') +
        '<br><br><span class="suave pequeno">A cópia vai para a pasta <b>_apagados</b> da pasta de dados (nada some de verdade).</span></p>',
      botoes: [{ texto: 'Cancelar', valor: null }]
        .concat(varias ? [{ texto: 'Excluir as ' + versoes.length + ' versões', tipo: 'perigo', valor: 'todas' }] : [])
        .concat([{ texto: varias ? 'Excluir a versão ' + numero : 'Excluir', tipo: 'perigo', valor: 'esta' }]),
    });
    if (escolha !== 'esta' && escolha !== 'todas') return false;
    try {
      const sair = escolha === 'todas' ? versoes : [meta];
      for (const m of sair) await arm.apagarArquivo(m.id);
      await arm.registrarNoLog({ codigo, acao: 'arquivo-apagado-do-lugar', alvo: (lugar.log || lugar.id) + '/' + U.anoMes(lugar.competencia),
        detalhe: meta.arquivo + (escolha === 'todas' ? ' (e as outras ' + (versoes.length - 1) + ' versões)' : varias ? ' (versão ' + numero + ')' : '') });
      T.avisoRapido(escolha === 'todas' ? versoes.length + ' versões excluídas: ' + meta.arquivo
        : 'Excluído: ' + meta.arquivo + (varias && emUso && anterior ? ' — a versão ' + (numero - 1) + ' voltou a ser a usada' : ''), 'ok', 6000);
      if (!(op && op.semRota)) app().mostrarRota();
      return true;
    } catch (e) {
      T.avisoRapido(T.mensagemDeErro(e), 'erro');
      return false;
    }
  }

  // ------------------------------------------------------------------
  // Ver o que mudou de uma versão para a anterior (Dony, 16/09/2026: "provar que o financeiro está errado").
  // ------------------------------------------------------------------
  async function verVersao(codigo, lugar, id) {
    const arm = app().armazenamento;
    let m, anterior = null, numero, cAntes = null, cDepois;
    try {
      const metas = await arm.arquivos(codigo);
      m = metas.find((x) => x.id === id);
      if (!m) return;
      const versoes = versoesDoArquivo(metas, m, lugar);
      const pos = Math.max(0, versoes.findIndex((x) => x.id === id));
      numero = versoes.length - pos;
      anterior = versoes[pos + 1] || null;
      if (anterior) cAntes = await arm.conteudoDoArquivo(anterior.id);
      else if (m.comparacao && m.comparacao.com) {
        // A versão anterior foi excluída: a cópia está na pasta _apagados.
        const ap = await arm.arquivoApagado(m.comparacao.com);
        if (ap) { cAntes = ap.conteudo; anterior = Object.assign({ arquivo: m.comparacao.arquivoAnterior }, ap.meta || {}, { excluida: true }); }
      }
      cDepois = await arm.conteudoDoArquivo(m.id);
    } catch (e) { T.avisoRapido('Não consegui abrir as versões: ' + T.mensagemDeErro(e), 'erro'); return; }
    if (!cAntes) { T.avisoRapido('A versão anterior não está mais guardada.', 'erro'); return; }
    const c = comparar(tipoDaComparacao(m), cAntes, cDepois);
    const nomeAnt = anterior.excluida ? 'a versão anterior (excluída)' : 'a versão ' + (numero - 1);
    await T.janela({ titulo: 'O que mudou da ' + nomeAnt.replace(/^a /, '') + ' para a versão ' + numero + ' · ' + (lugar ? lugar.nome : ''), larga: true,
      corpo: htmlComparacao(c, { antes: anterior, depois: m, nomeAntes: primeiraMaiuscula(nomeAnt.replace(/^a /, '')), nomeDepois: 'Versão ' + numero }) });
  }

  function htmlComparacao(c, op) {
    if (c.tipo === 'balancete') return htmlComparacaoBalancete(c, op);
    const razao = c.tipo === 'razao';
    const totais = (t) => razao ? 'débitos ' + T.moeda(t.debitos) + ' · créditos ' + T.moeda(t.creditos) : 'total ' + T.moeda(t.total);
    const ficha = (nome, m, qtd, t) => '<div><b>' + T.esc(nome) + '</b>: ' + T.esc(m.arquivo || '') + ' · ' + qtd + (razao ? ' lançamentos' : ' títulos') + ' · ' + totais(t) +
      (m.enviadoEm ? ' · ' + T.esc(m.enviadoPor || '') + ' em ' + U.dataHoraLocal(m.enviadoEm) : '') + '</div>';
    const cab = razao
      ? '<th>Data</th><th>Documento</th><th class="historico">Histórico</th><th class="num">Débito</th><th class="num">Crédito</th>'
      : '<th>Vencimento</th><th>Documento</th><th>Fornecedor</th><th class="num">Valor</th>';
    const tds = (x) => razao
      ? '<td class="num">' + T.esc(x.data || '—') + '</td><td>' + T.nome(x.doc) + '</td><td class="historico">' + T.esc(x.historico || '') + '</td>' + T.tdValor(x.debito) + T.tdValor(x.credito)
      : '<td class="num">' + T.esc(x.data || '—') + '</td><td>' + T.nome(x.doc) + (x.parcela ? ' <span class="suave">' + T.esc(x.parcela) + '</span>' : '') + '</td><td class="nome">' + T.esc(x.nome || '') + '</td>' + T.tdValor(x.valor);
    const LIMITE = 300;
    const tabela = (titulo, xs, explica) => '<h3 class="titulo-comparacao">' + titulo + ' <small>(' + xs.length + ')</small></h3>' +
      (explica ? '<p class="suave pequeno" style="margin:0 0 6px">' + explica + '</p>' : '') +
      (xs.length ? '<div class="tabela-caixa"><table class="tabela"><thead><tr>' + cab + '</tr></thead><tbody>' +
        xs.slice(0, LIMITE).map((x) => '<tr>' + tds(x) + '</tr>').join('') + '</tbody></table></div>' +
        (xs.length > LIMITE ? '<p class="suave pequeno">… e mais ' + (xs.length - LIMITE) + '.</p>' : '') : '<p class="suave pequeno">Nenhum.</p>');
    const mudA = new Set(c.mudaram.map((p) => p.antes)), mudD = new Set(c.mudaram.map((p) => p.depois));
    const entraram = c.entraram.filter((x) => !mudD.has(x)), sairam = c.sairam.filter((x) => !mudA.has(x));
    const mudaram = c.mudaram.length
      ? '<div class="tabela-caixa"><table class="tabela"><thead><tr><th></th>' + cab + '<th>O que mudou</th></tr></thead><tbody>' +
        c.mudaram.slice(0, LIMITE).map((p) => '<tr class="suave"><td class="pequeno">antes</td>' + tds(p.antes) + '<td rowspan="2"><b>' + T.esc(p.campos.join(', ') || '—') + '</b></td></tr>' +
          '<tr><td class="pequeno"><b>agora</b></td>' + tds(p.depois) + '</tr>').join('') + '</tbody></table></div>' +
        (c.mudaram.length > LIMITE ? '<p class="suave pequeno">… e mais ' + (c.mudaram.length - LIMITE) + '.</p>' : '')
      : '<p class="suave pequeno">Nenhum.</p>';
    return '<div class="fichas-versao pequeno">' + ficha(op.nomeAntes, op.antes, c.qtdAntes, c.antes) + ficha(op.nomeDepois, op.depois, c.qtdDepois, c.depois) + '</div>' +
      '<p class="resumo-versao">✓ ' + contagem(c.iguais, 'igual', 'iguais', true) + ' · ➕ ' + contagem(entraram.length, 'entrou', 'entraram', true) +
        ' · ➖ ' + contagem(sairam.length, 'saiu', 'saíram', true) + ' · ✎ ' + contagem(c.mudaram.length, 'mudou', 'mudaram', true) + '</p>' +
      tabela('➕ Entraram', entraram, 'Estão na versão nova e não estavam na anterior.') +
      tabela('➖ Saíram', sairam, 'Estavam na versão anterior e não estão na nova.') +
      '<h3 class="titulo-comparacao">✎ Mudaram <small>(' + c.mudaram.length + ')</small></h3>' +
      '<p class="suave pequeno" style="margin:0 0 6px">O mesmo ' + (razao ? 'lançamento' : 'título') + ' com alguma coisa diferente (' +
        (razao ? 'mesma data e histórico, ' : '') + 'mesma data e valor, mesma data e documento, ou mesmo documento e valor).</p>' + mudaram;
  }

  // Balancete: conta por conta (entrou, saiu ou mudou algum dos quatro valores).
  function htmlComparacaoBalancete(c, op) {
    const ficha = (nome, m, qtd, t) => '<div><b>' + T.esc(nome) + '</b>: ' + T.esc(m.arquivo || '') + ' · ' + qtd + ' contas · débitos ' + T.moeda(t.debitos) + ' · créditos ' + T.moeda(t.creditos) +
      (m.enviadoEm ? ' · ' + T.esc(m.enviadoPor || '') + ' em ' + U.dataHoraLocal(m.enviadoEm) : '') + '</div>';
    const cab = '<th>Conta</th><th>Título</th><th class="num">Saldo anterior</th><th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo atual</th>';
    const tds = (x) => '<td class="num">' + T.esc(x.conta) + '</td><td class="nome">' + T.esc(x.titulo || '') + '</td>' + T.tdValor(x.saldoAnterior) + T.tdValor(x.debitos) + T.tdValor(x.creditos) + T.tdValor(x.saldoAtual);
    const LIMITE = 300;
    const mudA = new Set(c.mudaram.map((p) => p.antes)), mudD = new Set(c.mudaram.map((p) => p.depois));
    const entraram = c.entraram.filter((x) => !mudD.has(x)), sairam = c.sairam.filter((x) => !mudA.has(x));
    const tabela = (titulo, xs) => '<h3 class="titulo-comparacao">' + titulo + ' <small>(' + xs.length + ')</small></h3>' +
      (xs.length ? '<div class="tabela-caixa"><table class="tabela"><thead><tr>' + cab + '</tr></thead><tbody>' + xs.slice(0, LIMITE).map((x) => '<tr>' + tds(x) + '</tr>').join('') +
        '</tbody></table></div>' : '<p class="suave pequeno">Nenhuma.</p>');
    const mudaram = c.mudaram.length
      ? '<div class="tabela-caixa"><table class="tabela"><thead><tr><th></th>' + cab + '<th>O que mudou</th></tr></thead><tbody>' +
        c.mudaram.slice(0, LIMITE).map((p) => '<tr class="suave"><td class="pequeno">antes</td>' + tds(p.antes) + '<td rowspan="2"><b>' + T.esc(p.campos.join(', ')) + '</b></td></tr>' +
          '<tr><td class="pequeno"><b>agora</b></td>' + tds(p.depois) + '</tr>').join('') + '</tbody></table></div>'
      : '<p class="suave pequeno">Nenhuma.</p>';
    return '<div class="fichas-versao pequeno">' + ficha(op.nomeAntes, op.antes, c.qtdAntes, c.antes) + ficha(op.nomeDepois, op.depois, c.qtdDepois, c.depois) + '</div>' +
      '<p class="resumo-versao">✓ ' + contagem(c.iguais, 'igual', 'iguais', true) + ' · ➕ ' + contagem(entraram.length, 'entrou', 'entraram', true) +
        ' · ➖ ' + contagem(sairam.length, 'saiu', 'saíram', true) + ' · ✎ ' + contagem(c.mudaram.length, 'mudou', 'mudaram', true) + '</p>' +
      tabela('➕ Contas que entraram', entraram) + tabela('➖ Contas que saíram', sairam) +
      '<h3 class="titulo-comparacao">✎ Contas que mudaram <small>(' + c.mudaram.length + ')</small></h3>' + mudaram;
  }

  raiz.TelaSubir = { painel, botao, ligar, ligarBotao, subir, apagar, verVersao, guardarContaDoRazao, guardarTitulos, guardarBalancete, guardarDiario, doMesmoLugar, versoesDoArquivo,
    htmlComparacao, contagensDaComparacao, lugarDoDiario, diariosEmUso, diarioDoLugar, balancetesDoDiario, doDiario,
    sincronizarDoDiario, prepararDoDiario, cartaoDaEscolha, ligarCartaoDaEscolha, textoSemDiario, lugarDoBalanceteDoDiario, contasEscolhidas, resumoDoDiario };
})(self);
