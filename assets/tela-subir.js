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
 *     tipo: 'razao' | 'financeiro_pagar' | 'financeiro_adiantamento' | 'balancete' (relatório de apresentação), competencia,
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
    const resultado = b.contas.filter((c) => c.nivel === 1 && !/^[12]$/.test(c.conta)).reduce((s, c) => s + c.creditos - c.debitos, 0);
    const meta = Object.assign({ tipo: 'balancete', arquivo: r.nomeArquivo, competencia: comp, periodo: b.periodo, contas: b.contas.length, resultado,
      confere: b.confere, empresaNoArquivo: b.empresa, cnpjNoArquivo: b.cnpj, hashDoConteudo: r.hash }, extra || {});
    return app().armazenamento.guardarArquivo(codigo, meta, { tipo: 'balancete', empresa: b.empresa, cnpj: b.cnpj, periodo: b.periodo, contas: b.contas, total: b.total }, r.bytes);
  }

  // Os arquivos guardados que ocupam o mesmo lugar que este (as versões): aging = mesmo tipo e
  // competência; razão = mesma competência e papel — e a mesma conta no lugar de várias contas (①).
  // Sem o lugar, o razão é o da mesma conta.
  function doMesmoLugar(metas, m, lugar) {
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
    const nome = tipo === 'razao' ? ['lançamento', 'lançamentos'] : tipo === 'balancete' ? ['conta', 'contas'] : ['título', 'títulos'];
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
    if (m.tipo === 'balancete') {
      return (m.contas || 0) + ' contas · ' + (m.resultado >= 0 ? 'lucro' : 'prejuízo') + ' do mês ' + T.moeda(Math.abs(m.resultado || 0)) +
        (m.confere === false ? ' · <span class="falta">não fecha</span>' : '');
    }
    return m.tipo === 'razao'
      ? 'conta ' + T.esc(m.conta.codigo + ' ' + (m.conta.nome || '')) + ' · ' + (m.lancamentos || 0) + ' lanç.' + (m.periodo ? ' · ' + T.esc(m.periodo.de + ' a ' + m.periodo.ate) : '')
      : (m.titulos || 0) + ' títulos · ' + T.moeda(m.total || 0);
  }
  function tipoDaComparacao(m) { return m.tipo === 'razao' ? 'razao' : m.tipo === 'balancete' ? 'balancete' : 'aging'; }
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
    return '<section class="cartao corpo arquivos-passo" data-painel-arquivos="' + T.esc(op.chave || '') + '"' + (visivel ? '' : ' hidden') + '>' +
      '<div class="cab-arquivos"><h3>📁 ' + T.esc(op.titulo || 'Arquivos deste passo') + '</h3>' +
      '<span class="suave pequeno">' + (op.resumo ? T.esc(op.resumo) + ' · ' : '') +
      (faltam ? '<span class="falta">' + faltam + ' arquivo(s) faltando</span>' : guardados + ' arquivo(s) em uso') + '</span>' +
      (op.fixo ? '' : '<button type="button" class="botao pequeno" data-fechar-arquivos>✕ Fechar</button>') + '</div>' +
      '<p class="suave pequeno" style="margin:0 0 10px">Cada arquivo tem o seu lugar: <b>⬆ Carregar</b> (ou arraste o arquivo em cima do lugar) e <b>🗑 Excluir</b>. ' +
      'Chegou um arquivo novo (razão refeito, aging corrigido)? Use <b>🔄 Carregar nova versão</b>: a nova passa a ser a usada, a anterior continua guardada ' +
      'e o programa mostra o que mudou de uma para a outra.</p>' +
      (op.antes || '') +
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
      for (const f of lista) algum = (await subir(codigo, lugar, f, { semRota: true })) || algum;
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
    return tipo === 'balancete' ? raiz.MotorApresentacao.compararBalancetes(antes, depois) : motor().compararVersoes(tipo, antes, depois);
  }

  // Sobe UM arquivo num lugar. Devolve true se guardou. op: { semRota } (não redesenha no fim).
  async function subir(codigo, lugar, arquivo, op) {
    const arm = app().armazenamento;
    T.avisoRapido('Lendo ' + arquivo.name + '…', null, 2500);
    let r;
    try {
      const bytes = await T.lerArquivoComoBytes(arquivo);
      r = raiz.Leitor.ler(bytes, arquivo.name);
      r.bytes = bytes;
    } catch (e) { T.avisoRapido('Não consegui ler ' + arquivo.name + ': ' + T.mensagemDeErro(e), 'erro'); return false; }
    const naoServe = (esperado, outroTipo) => T.janela({
      titulo: 'Esse arquivo não é ' + esperado,
      corpo: '<p style="line-height:1.5">Este lugar é o do <b>' + T.esc(lugar.nome) + '</b>, mas <b>' + T.esc(arquivo.name) + '</b> ' +
        (outroTipo ? 'é de outro tipo: ' + T.esc(r.nomeDoTipo || r.tipo) + '.' : 'não foi entendido pelo programa' + (r.motivo ? ': ' + T.esc(r.motivo) : '.')) + '</p>' +
        '<p class="suave pequeno" style="margin-top:8px">Confira se é o arquivo certo. Se for, mas o programa não entendeu, mande o desenho pelo menu “Ver o desenho de um arquivo”.</p>' });
    try {
      let resumo, jaEra = true;
      const novas = []; // { meta, comparacao } das versões guardadas agora
      const versaoNova = async (g, ativo, comparacao) => { novas.push({ meta: g.meta, ativo, comparacao }); };
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
        const papel = { familia: 'fornecedores', papel: lugar.papel };
        const lembrar = {};
        for (const conta of contas) {
          const auto = conta.papel || {};
          if (auto.familia !== papel.familia || auto.papel !== papel.papel) lembrar[conta.codigo] = papel;
          const ativo = emUsoNoLugar(lugar, conta);
          // Já é a versão em uso deste lugar: nada a fazer.
          if (ativo && ativo.hashDoConteudo === r.hash && ativo.conta && String(ativo.conta.codigo) === String(conta.codigo)) continue;
          jaEra = false;
          const comparacao = ativo ? await compararComEmUso(ativo, 'razao', { conta }) : null;
          if (ativo && typeof lugar.conferirTroca === 'function' && !(await lugar.conferirTroca({ tipo: 'razao', conta }, comparacao))) return false;
          const extra = comparacao ? { comparacao } : {};
          let g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, extra);
          if (g.jaExistia && g.meta.conta && (g.meta.conta.papel !== papel.papel || g.meta.conta.familia !== papel.familia)) {
            // Já estava guardado com outro papel: guarda de novo com o papel deste lugar.
            await arm.apagarArquivo(g.meta.id);
            g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, extra);
          } else if (g.jaExistia && (!ativo || g.meta.id !== ativo.id)) {
            // Uma versão antiga deste lugar carregada de novo: vira a versão nova (a mais nova é a usada).
            g = await guardarContaDoRazao(codigo, r, conta, papel, lugar.competencia, Object.assign({ recarga: U.agoraISO() }, extra));
          }
          await versaoNova(g, ativo, comparacao);
        }
        // A empresa passa a saber o papel destas contas.
        if (Object.keys(lembrar).length) {
          const cad = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo)); // relido: outra pessoa pode ter mexido
          const salvo = await arm.salvarEmpresa(Object.assign({}, cad, { papeisDeConta: Object.assign({}, cad.papeisDeConta || {}, lembrar) }));
          const ix = app().empresas.findIndex((e) => String(e.codigo) === String(codigo));
          if (ix >= 0) app().empresas[ix] = salvo;
        }
        resumo = (contas.length === 1 ? 'conta ' + contas[0].codigo : contas.length + ' contas (' + contas.map((c) => c.codigo).join(', ') + ')') +
          ' · ' + noPeriodo + ' lançamento(s) ' + emPeriodo + (rz.periodo ? ' (arquivo de ' + rz.periodo.de + ' a ' + rz.periodo.ate + ')' : '');
      } else if (lugar.tipo === 'balancete') {
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
      // Número da versão de cada arquivo novo.
      let textoVersao = '';
      if (novas.length) {
        const metas = await arm.arquivos(codigo);
        const partes = novas.map((n) => {
          const qtd = versoesDoArquivo(metas, n.meta, lugar).length;
          if (qtd < 2) return '';
          return 'versão ' + qtd + ' (a anterior continua guardada' + (n.comparacao && n.comparacao.iguais !== undefined
            ? ': ' + textoComparacao(n.comparacao, tipoDaComparacao(lugar)).replace(/<\/?b>/g, '') : '') + ')';
        }).filter(Boolean);
        textoVersao = partes.join('; ');
      }
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

  raiz.TelaSubir = { painel, botao, ligar, ligarBotao, subir, apagar, verVersao, guardarContaDoRazao, guardarTitulos, guardarBalancete, doMesmoLugar, versoesDoArquivo, htmlComparacao, contagensDaComparacao };
})(self);
