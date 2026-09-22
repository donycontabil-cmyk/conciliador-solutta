/*
 * Conciliador Solutta — tela-passo4.js
 * Passo ④ · FORNECEDORES · SOMENTE RAZÃO (Dony, 22/09/2026: "a conciliação de fornecedor só o razão contra o próprio
 * razão, só para pegar distorções dentro do próprio razão; se eu tiver o diário, vai ser o diário; ele só vai pegar
 * débito e crédito e vai me mostrar tudo que tem a crédito em aberto e tudo que está em débito em aberto").
 * O razão de fornecedores do ① (o mesmo lugar; com o livro diário, o razão das contas escolhidas sai dele) contra ele
 * mesmo: as mesmas batidas do ① dentro do razão, sem adiantamento e sem reclassificação (MotorFechamento.somenteRazao).
 * Mostra o que ficou em aberto a crédito e a débito, por fornecedor e o que casou, com Excel. Não grava decisão: é uma
 * leitura do razão.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function M() { return raiz.MotorFechamento; }
  const SEM = () => raiz.MotorNomes.SEM_FORNECEDOR;
  const TXT = (de) => ({ tipo: 'texto', de });
  const VALOR = (de) => ({ tipo: 'valor', de });
  const DATA = (de) => ({ tipo: 'data', de });
  const NUM = (de) => ({ tipo: 'numero', de });
  const ABAS = [
    { id: 'credito', titulo: 'A crédito em aberto', dica: 'O que ficou a crédito sem débito que casasse: nota sem pagamento' },
    { id: 'debito', titulo: 'A débito em aberto', dica: 'O que ficou a débito sem crédito que casasse: pagamento sem nota' },
    { id: 'fornecedores', titulo: 'Por fornecedor', dica: 'O que ficou em aberto de cada fornecedor, dos dois lados' },
    { id: 'bateu', titulo: 'O que casou', dica: 'Débito e crédito do mesmo fornecedor que se anulam (1x1, 1xN, Nx1, zerou, mesmo dia)' },
  ];

  let P = null; // estado da tela aberta

  // Os lugares do ④: o razão de fornecedores e o contas a pagar (opcional, ajuda a reconhecer os nomes) do ①.
  function lugaresDoPasso4(comp, arqs) { return raiz.TelaPasso1.lugaresDoPasso1(comp, arqs).filter((l) => l.id !== 'A'); }
  function chaveDoPainel(codigo, comp) { return codigo + '|passo4|' + comp; }

  // ------------------------------------------------------------------
  // Abrir
  // ------------------------------------------------------------------
  async function mostrar(el, codigo, anoMes, conferir) {
    const comp = anoMes + '-01';
    const voltar = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + anoMes;
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Abrindo o Passo ④ de ' + U.nomeCompetencia(comp) + '…');
    const arm = app().armazenamento;
    const S = raiz.TelaSubir;
    // O livro diário é o razão: com as contas de fornecedores escolhidas, o razão delas sai do diário (só o que mudou).
    let metas = await arm.arquivos(codigo);
    if (conferir && !conferir()) return;
    let sinc = { estado: 'erro', mudou: false };
    try { sinc = await S.sincronizarDoDiario(codigo, lugaresDoPasso4(comp, raiz.TelaFamilia.arquivosDoPasso1(metas, comp))); } catch (e) { T.avisoRapido('Livro diário: ' + T.mensagemDeErro(e), 'erro', 8000); }
    if (conferir && !conferir()) return;
    if (sinc.mudou) metas = await arm.arquivos(codigo);
    const arqs = raiz.TelaFamilia.arquivosDoPasso1(metas, comp);
    const cabecalho = '<a class="voltar" href="' + voltar + '">← Fornecedores · ' + U.nomeCompetencia(comp) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Passo ④ · Fornecedores · somente razão</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · ' + U.nomeCompetencia(comp) + '</p></div></div>';
    if (!arqs.F.length) {
      const doDiario = sinc.prep ? (sinc.prep.ok ? (sinc.estado === 'escolher' ? S.cartaoDaEscolha(sinc.prep) : '')
        : '<div class="aviso ambar" style="margin-bottom:12px"><span class="icone-aviso">📒</span><div>' + S.textoSemDiario(codigo, sinc.prep, comp) + '</div></div>') : '';
      const extras = [S.lugarDoBalanceteDoDiario(sinc.prep)].filter(Boolean);
      const lugares = lugaresDoPasso4(comp, arqs).concat(extras);
      el.innerHTML = cabecalho + (doDiario || '<div class="aviso info" style="margin-bottom:12px"><span class="icone-aviso">📁</span><div><b>Suba o razão de fornecedores</b> ' +
        '(o mesmo do Passo ①: o que subir aqui vale lá, e o contrário também) — ou guarde o livro diário e escolha as contas.</div></div>') +
        S.painel({ chave: chaveDoPainel(codigo, comp), titulo: 'Arquivos do passo', resumo: U.nomeCompetencia(comp), fixo: true, lugares, metas: arqs.metas });
      S.ligar(el.querySelector('.arquivos-passo'), codigo, lugares);
      S.ligarCartaoDaEscolha(el.querySelector('.escolha-diario'), codigo, sinc.prep);
      return;
    }
    const carregar = async (m) => ({ meta: m, conteudo: await arm.conteudoDoArquivo(m.id) });
    const F = await Promise.all(arqs.F.map(carregar));
    const pagar = arqs.pagar ? await carregar(arqs.pagar) : null;
    if (conferir && !conferir()) return;
    const fonte = (x) => ({ arquivoId: x.meta.id, conta: x.conteudo.conta, saldoAnterior: x.conteudo.conta.saldoAnterior,
      saldoFinal: x.conteudo.conta.saldoFinalDeclarado, lancamentos: x.conteudo.conta.lancamentos, periodo: x.conteudo.periodo });
    const r = M().somenteRazao({ competencia: comp, contas: { F: F.map(fonte) }, titulos: pagar ? pagar.conteudo.titulos : [] });
    const abaLembrada = app().lerLocal('conciliador-solutta.aba-passo4');
    P = { codigo, comp, emp, voltar, arqs, F, pagar, r, cabecalho, aba: ABAS.some((a) => a.id === abaLembrada) ? abaLembrada : 'credito', busca: '', soDoisLados: false, abertos: new Set() };
    el.innerHTML = '<div class="tela-passo4"></div>';
    P.el = el.firstChild;
    ligarUmaVez();
    desenhar();
  }

  // ------------------------------------------------------------------
  // Desenho
  // ------------------------------------------------------------------
  const nomeDe = (l) => (l.dono.chave === SEM() ? 'Sem fornecedor' : l.dono.nome);
  const dcDe = (v) => (v >= 0 ? 'C' : 'D'); // lado F: crédito − débito, positivo = a empresa deve (crédito)
  const tdDC = (v) => T.tdValorDC(v, dcDe(v));
  function desenhar() {
    const r = P.r, t = r.totais;
    const contaTxt = P.F.map((x) => T.esc(x.conteudo.conta.codigo + ' ' + x.conteudo.conta.nome) + ' <span class="suave">(' + x.conteudo.conta.lancamentos.length.toLocaleString('pt-BR') + ' lanç.)</span>').join(', ');
    const lugares = lugaresDoPasso4(P.comp, P.arqs);
    P.el.innerHTML = P.cabecalho.replace('</p></div></div>', () => '</p><p class="suave pequeno">Fornecedores: ' + contaTxt + (P.pagar ? ' · Contas a pagar: ' + P.pagar.meta.titulos + ' títulos (ajuda a reconhecer nomes)' : '') + '</p>' +
      raiz.TelaPasso1.linhaDoDiario(lugares) + '</div>' +
      '<div class="linha-flex"><button type="button" class="botao" data-acao="excel" title="As listas em Excel: resumo, a crédito, a débito, por fornecedor e o que casou">⬇ Excel</button>' +
      raiz.TelaSubir.botao(chaveDoPainel(P.codigo, P.comp)) + '</div></div>') +
      raiz.TelaSubir.painel({ chave: chaveDoPainel(P.codigo, P.comp), titulo: 'Arquivos do passo', resumo: U.nomeCompetencia(P.comp), fixo: false, lugares, metas: P.arqs.metas }) +
      '<div id="p4-avisos"></div>' +
      '<div class="grade-4" style="margin-top:14px">' +
        '<div class="cartao resumo"><div class="rotulo">Linhas do razão</div><div class="grande">' + t.linhas.toLocaleString('pt-BR') + '</div>' +
          '<div class="detalhe"><span><b>' + t.bateram.toLocaleString('pt-BR') + '</b> casaram (' + t.batidas.toLocaleString('pt-BR') + ' batidas)</span><span>até ' + T.esc(U.fimDaCompetencia(P.comp).texto) +
          (r.foraDaCompetencia ? ' · ' + r.foraDaCompetencia + ' depois do mês ficam fora' : '') + '</span></div></div>' +
        '<div class="cartao resumo"><div class="rotulo">A crédito em aberto</div><div class="grande">' + T.moeda(t.credito.valor) + '</div>' +
          '<div class="detalhe"><span><b>' + t.credito.qtd.toLocaleString('pt-BR') + '</b> lançamento(s) · nota sem pagamento</span></div></div>' +
        '<div class="cartao resumo"><div class="rotulo">A débito em aberto</div><div class="grande">' + T.moeda(t.debito.valor) + '</div>' +
          '<div class="detalhe"><span><b>' + t.debito.qtd.toLocaleString('pt-BR') + '</b> lançamento(s) · pagamento sem nota</span>' +
          (t.fornecedoresComOsDoisLados ? '<span><b>' + t.fornecedoresComOsDoisLados + '</b> fornecedor(es) com débito e crédito em aberto</span>' : '') + '</div></div>' +
        '<div class="cartao resumo"><div class="rotulo">Saldo do razão</div><div class="grande">' + T.htmlDC(t.saldoFinal, dcDe(t.saldoFinal)) + '</div>' +
          '<div class="detalhe"><span>saldo anterior ' + T.htmlDC(t.saldoAnterior, dcDe(t.saldoAnterior)) + '</span><span>+ crédito − débito em aberto</span></div></div>' +
      '</div>' +
      '<div class="abas" role="tablist">' + ABAS.map((a) => {
        const qtd = a.id === 'credito' ? t.credito.qtd : a.id === 'debito' ? t.debito.qtd : a.id === 'fornecedores' ? r.porFornecedor.length : t.batidas;
        return '<button type="button" role="tab" class="' + (a.id === P.aba ? 'ativa' : '') + '" data-aba="' + a.id + '" title="' + T.esc(a.dica) + '">' + T.esc(a.titulo) + ' <span class="contador">' + qtd.toLocaleString('pt-BR') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="filtros"><input type="search" class="apres-campo" id="p4-busca" placeholder="Buscar fornecedor, histórico ou documento" value="' + T.esc(P.busca) + '" style="min-width:320px">' +
        (P.aba === 'fornecedores' ? '<label class="pequeno"><input type="checkbox" id="p4-dois-lados"' + (P.soDoisLados ? ' checked' : '') + '> só os com débito e crédito em aberto</label>' : '') + '</div>' +
      '<div id="p4-aba"></div>';
    desenharAvisos();
    desenharAba();
    ligar();
  }

  function desenharAvisos() {
    const r = P.r, t = r.totais;
    const partes = [];
    if (r.invariantes.ok) {
      partes.push('<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Conferido no centavo.</b> Cada batida soma zero; saldo anterior ' + T.esc(T.valorDC(t.saldoAnterior, dcDe(t.saldoAnterior))) +
        ' + crédito em aberto ' + T.esc(U.formatarCentavos(t.credito.valor)) + ' − débito em aberto ' + T.esc(U.formatarCentavos(t.debito.valor)) + ' = saldo do razão ' + T.esc(T.valorDC(t.saldoFinal, dcDe(t.saldoFinal))) + '.</div></div>');
    } else {
      partes.push('<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>A conferência falhou.</b><ul class="pequeno">' + r.invariantes.falhas.slice(0, 10).map((f) => '<li>' + T.esc(f) + '</li>').join('') + '</ul></div></div>');
    }
    if (t.saldoAnterior) {
      partes.push('<div class="aviso ambar"><span class="icone-aviso">ℹ️</span><div><b>O razão começa com saldo anterior de ' + T.esc(T.valorDC(t.saldoAnterior, dcDe(t.saldoAnterior))) + ', sem dizer de qual fornecedor.</b> ' +
        'Pagamento do começo do período que quita nota de antes dele aparece a débito em aberto (a nota está no saldo anterior).</div></div>');
    }
    P.el.querySelector('#p4-avisos').innerHTML = partes.join('');
  }

  function combina(busca, texto) {
    const b = U.semAcento(busca).toLowerCase().trim();
    return !b || U.semAcento(texto).toLowerCase().indexOf(b) >= 0;
  }

  function desenharAba() {
    const alvo = P.el.querySelector('#p4-aba');
    const r = P.r;
    const contaDe = (l) => l.conta + (l.contaNome ? ' ' + l.contaNome : '');
    if (P.aba === 'credito' || P.aba === 'debito') {
      const lista = r.abertas[P.aba].filter((l) => combina(P.busca, nomeDe(l) + ' ' + l.historico + ' ' + (l.numero || '')));
      const total = lista.reduce((s, l) => s + l.valor, 0);
      T.tabelaPaginada(alvo, {
        ordem: { id: 'p4-' + P.aba, colunas: [DATA((l) => l.data), TXT((l) => l.conta), TXT((l) => nomeDe(l)), TXT((l) => l.historico), TXT((l) => l.numero), VALOR((l) => l.valor)] },
        cabecalho: '<th>Data</th><th>Conta</th><th>Fornecedor</th><th class="historico">Histórico</th><th>Lanç.</th><th class="num">Valor</th>',
        linhas: lista, porPagina: 300,
        vazio: P.busca ? 'Nada com esta busca.' : 'Nada em aberto deste lado.',
        linha: (l) => '<tr><td class="num">' + T.esc(l.data) + '</td><td class="pequeno" title="' + T.esc(contaDe(l)) + '">' + T.esc(l.conta) + '</td>' +
          '<td class="nome">' + (l.dono.chave === SEM() ? '<span class="falta">sem fornecedor</span>' : T.esc(l.dono.nome)) + '</td><td class="historico">' + T.esc(l.historico) + '</td>' +
          '<td class="pequeno suave">' + T.esc(l.numero || '') + '</td>' + tdDC(l.valor) + '</tr>',
        rodape: '<tr class="total"><td colspan="5">' + lista.length.toLocaleString('pt-BR') + ' lançamento(s)' + (P.busca ? ' com esta busca' : '') + '</td>' + tdDC(total) + '</tr>',
      });
      return;
    }
    if (P.aba === 'fornecedores') {
      const lista = r.porFornecedor.filter((g) => (!P.soDoisLados || g.osDoisLados) && combina(P.busca, g.nome + ' ' + (g.cnpj || '')));
      T.tabelaPaginada(alvo, {
        ordem: { id: 'p4-fornecedores', colunas: [null, TXT((g) => g.nome), NUM((g) => g.qtdCredito), VALOR((g) => g.credito), NUM((g) => g.qtdDebito), VALOR((g) => g.debito), VALOR((g) => g.saldo)] },
        cabecalho: '<th style="width:28px"></th><th>Fornecedor</th><th class="num">Lanç. a crédito</th><th class="num">A crédito</th><th class="num">Lanç. a débito</th><th class="num">A débito</th><th class="num">Saldo</th>',
        linhas: lista, porPagina: 200,
        vazio: 'Nenhum fornecedor com estes filtros.',
        linha: (g) => {
          const aberto = P.abertos.has(g.chave);
          let html = '<tr class="' + (g.osDoisLados ? 'destaque-dois-lados' : '') + '"><td><button type="button" class="lapis" data-abrir-forn="' + T.esc(g.chave) + '" title="Ver os lançamentos em aberto">' + (aberto ? '▾' : '▸') + '</button></td>' +
            '<td class="nome">' + (g.chave === SEM() ? '<span class="falta">sem fornecedor</span>' : T.esc(g.nome)) + (g.cnpj ? ' <span class="suave pequeno">' + T.esc(U.formatarCnpj(g.cnpj)) + '</span>' : '') +
            (g.osDoisLados ? ' <span class="selo suspeita" title="Débito e crédito do mesmo fornecedor que não casaram: pagamento que não bateu com a nota (valor diferente, parcial ou nome diferente)">débito e crédito em aberto</span>' : '') + '</td>' +
            '<td class="num">' + g.qtdCredito + '</td>' + T.tdValor(g.credito) + '<td class="num">' + g.qtdDebito + '</td>' + T.tdValor(g.debito) + tdDC(g.saldo) + '</tr>';
          if (aberto) {
            html += g.linhas.map((i) => r.linhas[i]).sort((a, b) => a.dia - b.dia || a.i - b.i).map((l) => '<tr class="sub"><td></td><td class="pequeno" colspan="3">' + T.esc(l.data) + ' · ' + T.esc(l.historico) +
              (l.numero ? ' <span class="suave">· lanç. ' + T.esc(l.numero) + '</span>' : '') + '</td><td></td><td></td>' + tdDC(l.valor) + '</tr>').join('');
          }
          return html;
        },
        rodape: '<tr class="total"><td></td><td>' + lista.length.toLocaleString('pt-BR') + ' fornecedor(es)</td><td class="num">' + lista.reduce((s, g) => s + g.qtdCredito, 0).toLocaleString('pt-BR') + '</td>' +
          T.tdValor(lista.reduce((s, g) => s + g.credito, 0)) + '<td class="num">' + lista.reduce((s, g) => s + g.qtdDebito, 0).toLocaleString('pt-BR') + '</td>' + T.tdValor(lista.reduce((s, g) => s + g.debito, 0)) +
          tdDC(lista.reduce((s, g) => s + g.saldo, 0)) + '</tr>',
      });
      return;
    }
    // O que casou: cada batida com as linhas dela.
    const lista = r.batidas.filter((b) => combina(P.busca, b.linhas.map((i) => nomeDe(r.linhas[i]) + ' ' + r.linhas[i].historico + ' ' + (r.linhas[i].numero || '')).join(' ')));
    const primeira = (b) => b.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i)[0];
    T.tabelaPaginada(alvo, {
      ordem: { id: 'p4-bateu', colunas: [null, TXT((b) => b.como), TXT((b) => nomeDe(primeira(b))), NUM((b) => b.linhas.length), VALOR((b) => b.valor), DATA((b) => primeira(b).data)] },
      cabecalho: '<th style="width:28px"></th><th>Como</th><th>Fornecedor</th><th class="num">Linhas</th><th class="num">Valor</th><th>Datas</th>',
      linhas: lista, porPagina: 200,
      vazio: 'Nada casou' + (P.busca ? ' com esta busca.' : '.'),
      linha: (b) => {
        const ls = b.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i);
        const aberto = P.abertos.has(b.id);
        let html = '<tr><td><button type="button" class="lapis" data-abrir-batida="' + T.esc(b.id) + '" title="Ver as linhas">' + (aberto ? '▾' : '▸') + '</button></td><td>' + T.seloComo(b.como) + '</td>' +
          '<td class="nome">' + (ls[0].dono.chave === SEM() ? '<span class="falta">sem fornecedor</span>' : T.esc(ls[0].dono.nome)) + '</td><td class="num">' + ls.length + '</td>' + T.tdValor(b.valor) +
          '<td class="num">' + T.esc(ls[0].data + (ls.length > 1 && ls[ls.length - 1].data !== ls[0].data ? ' a ' + ls[ls.length - 1].data : '')) + '</td></tr>';
        if (aberto) {
          html += ls.map((l) => '<tr class="sub"><td></td><td class="pequeno" colspan="3">' + T.esc(l.data) + ' · ' + T.esc(l.historico) + '</td>' + tdDC(l.valor) + '<td></td></tr>').join('');
        }
        return html;
      },
    });
  }

  // Os elementos que nascem a cada desenho (o quadro de arquivos, a busca e a caixa "só os dois lados").
  function ligar() {
    raiz.TelaSubir.ligar(P.el.querySelector('.arquivos-passo'), P.codigo, lugaresDoPasso4(P.comp, P.arqs));
    raiz.TelaSubir.ligarBotao(P.el.querySelector('[data-abrir-arquivos]'));
    const busca = P.el.querySelector('#p4-busca');
    if (busca) busca.addEventListener('input', T.debounce(() => { P.busca = busca.value; desenharAba(); }, 250));
    const dois = P.el.querySelector('#p4-dois-lados');
    if (dois) dois.addEventListener('change', () => { P.soDoisLados = dois.checked; desenharAba(); });
  }
  // Os cliques ficam no contêiner da tela, UMA vez (ligar a cada desenho somaria um ouvinte por aba trocada).
  function ligarUmaVez() {
    P.el.addEventListener('click', async (ev) => {
      const aba = ev.target.closest('[data-aba]');
      if (aba) { P.aba = aba.getAttribute('data-aba'); app().gravarLocal('conciliador-solutta.aba-passo4', P.aba); desenhar(); return; }
      const f = ev.target.closest('[data-abrir-forn]');
      if (f) { const k = f.getAttribute('data-abrir-forn'); if (P.abertos.has(k)) P.abertos.delete(k); else P.abertos.add(k); desenharAbaMantendoRolagem(); return; }
      const b = ev.target.closest('[data-abrir-batida]');
      if (b) { const k = b.getAttribute('data-abrir-batida'); if (P.abertos.has(k)) P.abertos.delete(k); else P.abertos.add(k); desenharAbaMantendoRolagem(); return; }
      const acao = ev.target.closest('[data-acao]');
      if (!acao) return;
      const a = acao.getAttribute('data-acao');
      if (a === 'excel') baixarExcel();
      if (a === 'trocar-contas') await raiz.TelaSubir.doDiario(P.codigo, lugaresDoPasso4(P.comp, P.arqs));
    });
  }
  function desenharAbaMantendoRolagem() {
    const c = document.getElementById('conteudo');
    const y = c ? c.scrollTop : 0;
    desenharAba();
    if (c) c.scrollTop = y;
  }

  // ------------------------------------------------------------------
  // Excel
  // ------------------------------------------------------------------
  const ESTILOS = {
    tit: { negrito: true, tam: 14, cor: 'FF17324D' },
    sub: { cor: 'FF5F6B7A', italico: true },
    txt: {},
    cab: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', vert: 'center', quebra: true, borda: { baixo: { cor: 'FF1F4E78' } } },
    cabNum: { negrito: true, cor: 'FFFFFFFF', fundo: 'FF1F4E78', alinh: 'right', vert: 'center', quebra: true },
    data: { alinh: 'center' },
    val: { formato: 'dinheiro' },
    tot: { negrito: true, fundo: 'FFDDEBF7', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    totVal: { negrito: true, fundo: 'FFDDEBF7', formato: 'dinheiro', borda: { cima: { estilo: 'medium', cor: 'FF1F4E78' } } },
    grp: { negrito: true, fundo: 'FFE7EEF5' },
    grpVal: { negrito: true, fundo: 'FFE7EEF5', formato: 'dinheiro' },
  };
  const reais = (c) => Math.round(Number(c) || 0) / 100;
  const cel = (v, e) => ({ v: v === undefined ? null : v, e: e || 'txt' });
  function baixarExcel() {
    const r = P.r, t = r.totais, emp = P.emp;
    const mes = U.nomeCompetencia(P.comp);
    const sub = emp.codigo + ' · ' + emp.nome + ' · ' + mes + ' · razão até ' + U.fimDaCompetencia(P.comp).texto;
    const planilhas = [];
    const res = [{ celulas: [cel('Fornecedores · somente razão (Passo ④)', 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null,
      { celulas: [cel('Conta', 'cab'), cel('Lançamentos', 'cabNum')], altura: 20 }];
    P.F.forEach((x) => res.push({ celulas: [cel(x.conteudo.conta.codigo + ' ' + x.conteudo.conta.nome + (x.meta.origem === 'diario' ? ' (do livro diário)' : '')), cel(x.conteudo.conta.lancamentos.length)] }));
    res.push(null);
    res.push({ celulas: [cel('Resumo', 'cab'), cel('Lançamentos', 'cabNum'), cel('Valor', 'cabNum'), cel('D/C', 'cab')], altura: 20 });
    res.push({ celulas: [cel('Saldo anterior (sem detalhe por fornecedor)'), cel(null), cel(reais(Math.abs(t.saldoAnterior)), 'val'), cel(t.saldoAnterior ? dcDe(t.saldoAnterior) : '')] });
    res.push({ celulas: [cel('Casaram (débito × crédito do mesmo fornecedor)'), cel(t.bateram), cel(0, 'val'), cel('')] });
    res.push({ celulas: [cel('A crédito em aberto (nota sem pagamento)'), cel(t.credito.qtd), cel(reais(t.credito.valor), 'val'), cel('C')] });
    res.push({ celulas: [cel('A débito em aberto (pagamento sem nota)'), cel(t.debito.qtd), cel(reais(t.debito.valor), 'val'), cel('D')] });
    res.push({ celulas: [cel('Saldo do razão', 'tot'), cel(t.linhas, 'tot'), cel(reais(Math.abs(t.saldoFinal)), 'totVal'), cel(dcDe(t.saldoFinal), 'tot')] });
    res.push(null);
    res.push({ celulas: [cel(r.invariantes.ok ? 'Conferido: cada batida soma zero e saldo anterior + crédito − débito em aberto = saldo do razão.' : 'A conferência falhou: ' + r.invariantes.falhas.join(' / '), 'sub')] });
    planilhas.push({ nome: 'Resumo', colunas: [60, 14, 18, 6], linhas: res });
    const lista = (nome, linhas) => {
      const l = [{ celulas: [cel(nome, 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null];
      const cab = l.push({ celulas: ['Data', 'Conta', 'Fornecedor', 'CNPJ', 'Histórico', 'Lançamento', 'Valor', 'D/C'].map((x, k) => cel(x, k === 6 ? 'cabNum' : 'cab')), altura: 20 });
      linhas.forEach((x) => l.push({ celulas: [cel(x.data, 'data'), cel(x.conta), cel(nomeDe(x)), cel(x.dono.cnpj ? U.formatarCnpj(x.dono.cnpj) : ''), cel(x.historico), cel(x.numero || ''),
        cel(reais(Math.abs(x.valor)), 'val'), cel(dcDe(x.valor))] }));
      const total = linhas.reduce((s, x) => s + x.valor, 0);
      l.push({ celulas: [cel('Total', 'tot'), cel('', 'tot'), cel(linhas.length + ' lançamento(s)', 'tot'), cel('', 'tot'), cel('', 'tot'), cel('', 'tot'), cel(reais(Math.abs(total)), 'totVal'), cel(total ? dcDe(total) : '', 'tot')] });
      planilhas.push({ nome, colunas: [11, 8, 40, 19, 70, 11, 15, 5], linhas: l, congelar: { linhas: cab, colunas: 0 }, repetir: [cab, cab], paisagem: true, rodape: emp.nome + ' · ' + nome + ' · ' + mes });
    };
    lista('A crédito em aberto', r.abertas.credito);
    lista('A débito em aberto', r.abertas.debito);
    const g = [{ celulas: [cel('Por fornecedor · o que ficou em aberto', 'tit')], altura: 22 }, { celulas: [cel(sub + ' · clique no + à esquerda para ver os lançamentos', 'sub')] }, null];
    const cabG = g.push({ celulas: ['Fornecedor', 'CNPJ', 'Lanç. a crédito', 'A crédito', 'Lanç. a débito', 'A débito', 'Saldo', 'D/C', 'Débito e crédito em aberto'].map((x, k) => cel(x, k >= 2 && k <= 6 ? 'cabNum' : 'cab')), altura: 30 });
    r.porFornecedor.forEach((f) => {
      g.push({ celulas: [cel(f.nome, 'grp'), cel(f.cnpj ? U.formatarCnpj(f.cnpj) : '', 'grp'), cel(f.qtdCredito, 'grp'), cel(reais(f.credito), 'grpVal'), cel(f.qtdDebito, 'grp'), cel(reais(f.debito), 'grpVal'),
        cel(reais(Math.abs(f.saldo)), 'grpVal'), cel(f.saldo ? dcDe(f.saldo) : '', 'grp'), cel(f.osDoisLados ? 'sim' : '', 'grp')], recolhida: true });
      f.linhas.map((i) => r.linhas[i]).sort((a, b) => a.dia - b.dia || a.i - b.i).forEach((x) => g.push({ celulas: [cel('   ' + x.data + ' · ' + x.historico), null, null, cel(x.valor > 0 ? reais(x.valor) : null, 'val'), null,
        cel(x.valor < 0 ? reais(-x.valor) : null, 'val')], nivel: 1, escondida: true }));
    });
    planilhas.push({ nome: 'Por fornecedor', colunas: [70, 19, 12, 15, 12, 15, 15, 5, 14], linhas: g, congelar: { linhas: cabG, colunas: 0 }, repetir: [cabG, cabG], resumoAcima: true, paisagem: true,
      rodape: emp.nome + ' · por fornecedor · ' + mes });
    const b = [{ celulas: [cel('O que casou (débito × crédito do mesmo fornecedor)', 'tit')], altura: 22 }, { celulas: [cel(sub, 'sub')] }, null];
    const cabB = b.push({ celulas: ['Batida', 'Como', 'Fornecedor', 'Data', 'Histórico', 'Valor', 'D/C'].map((x, k) => cel(x, k === 5 ? 'cabNum' : 'cab')), altura: 20 });
    r.batidas.forEach((bt, k) => bt.linhas.map((i) => r.linhas[i]).sort((x, y) => x.dia - y.dia || x.i - y.i).forEach((x) => b.push({ celulas: [cel(k + 1), cel(bt.como), cel(nomeDe(x)), cel(x.data, 'data'), cel(x.historico),
      cel(reais(Math.abs(x.valor)), 'val'), cel(dcDe(x.valor))] })));
    planilhas.push({ nome: 'O que casou', colunas: [8, 10, 40, 11, 70, 15, 5], linhas: b, congelar: { linhas: cabB, colunas: 0 }, repetir: [cabB, cabB], paisagem: true, rodape: emp.nome + ' · o que casou · ' + mes });
    const bytes = raiz.ExcelBonito.gerar({ planilhas, estilos: ESTILOS, ativa: 0 });
    T.baixar(bytes, U.nomeSeguro('Fornecedores somente razao ' + emp.codigo + ' ' + emp.nome + ' ' + U.anoMes(P.comp), 100) + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app().armazenamento.registrarNoLog({ codigo: P.codigo, acao: 'somente-razao-excel', alvo: 'fornecedores/' + U.anoMes(P.comp), detalhe: t.credito.qtd + ' a crédito · ' + t.debito.qtd + ' a débito' }).catch(() => {});
  }

  raiz.TelaPasso4 = { mostrar, estado: () => P };
})(self);
