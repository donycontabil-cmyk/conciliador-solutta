/*
 * Conciliador Solutta — tela-empresa.js
 * Cabeçalho da empresa e os cartões grandes das famílias (Parte 7.0 e 8).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }

  async function mostrar(el, codigo, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) {
      el.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>A empresa <b>' + T.esc(codigo) + '</b> não está cadastrada nesta pasta de dados. <a href="#/">Voltar para as empresas</a></div></div>';
      return;
    }
    const arquivos = await app().armazenamento.arquivos(codigo);
    if (conferir && !conferir()) return;
    const deFornecedores = arquivos.filter((a) => (a.conta && a.conta.familia === 'fornecedores') || a.tipo === 'financeiro_pagar' || a.tipo === 'financeiro_adiantamento');
    const competencias = Array.from(new Set(deFornecedores.map((a) => U.anoMes(a.competencia)))).sort().reverse();
    const detalhes = [emp.cnpj ? 'CNPJ ' + U.formatarCnpj(emp.cnpj) : null, emp.regime, emp.atividade, emp.grupo ? 'Grupo ' + emp.grupo : null].filter(Boolean);
    // Os PADRÕES de arquivo guardados nesta empresa (Dony, 29/09/2026: "precisa gravar os padrões para cada
    // cliente"): o que o programa já aprendeu do sistema dela, à vista de quem usa.
    const NOME_DESENHO = { porBloco: 'por conta, com contrapartida', porPerna: 'uma linha por perna', linha: 'uma partida por linha' };
    const d = emp.desenhos || {};
    const padroes = [emp.mapaBalancete ? 'balancete: colunas guardadas' : null,
      d.razao && d.razao.desenho ? 'razão: desenho ' + d.razao.desenho : null,
      d.diario && d.diario.desenho ? 'diário: ' + (NOME_DESENHO[d.diario.desenho] || d.diario.desenho) : null,
      d.plano && d.plano.colunas ? 'plano de contas: colunas guardadas' : null].filter(Boolean);

    const cartoes = raiz.Familias.FAMILIAS.map((f) => {
      // Família com passos prontos (Fornecedores e Clientes): abre com o último mês que tem arquivo dela.
      if ((f.passos || []).some((p) => p.construido)) {
        const fin = f.tipoFinanceiro || {};
        const daFamilia = arquivos.filter((a) => (a.conta && a.conta.familia === f.id) || a.tipo === fin.principal || a.tipo === fin.adiantamento);
        const meses = Array.from(new Set(daFamilia.map((a) => U.anoMes(a.competencia)))).sort().reverse();
        const ultima = meses[0];
        return '<a class="cartao familia" href="#/empresa/' + encodeURIComponent(codigo) + '/' + f.id + (ultima ? '/' + ultima : '') + '">' +
          '<div class="icone">' + f.icone + '</div><h2>' + T.esc(f.titulo) + '</h2><p class="suave" style="line-height:1.5">' + T.esc(f.texto) + '</p>' +
          '<div class="rodape"><span class="suave pequeno">' + (daFamilia.length ? daFamilia.length + ' arquivo(s)' + (ultima ? ' · último mês: ' + U.nomeCompetencia(ultima + '-01') : '') : 'nenhum arquivo ainda') + '</span>' +
          '<span class="botao primario pequeno">Abrir →</span></div></a>';
      }
      return '<div class="cartao familia" title="Chega na Etapa ' + f.etapa + ' do plano">' +
        '<div class="icone" style="filter:grayscale(1);opacity:.6">' + f.icone + '</div><h2>' + T.esc(f.titulo) + '</h2><p class="suave" style="line-height:1.5">' + T.esc(f.texto) + '</p>' +
        '<div class="rodape"><span class="pilula cinza">em construção · Etapa ' + f.etapa + '</span></div></div>';
    }).join('');

    // Relatório de apresentação (18/09/2026): balancetes do ano, DRE, balancete mensal/trimestral e LALUR.
    const balancetes = arquivos.filter((a) => a.tipo === 'balancete');
    const ultimoBal = balancetes.map((a) => U.anoMes(a.competencia)).sort().reverse()[0];
    const anoBal = ultimoBal ? ultimoBal.slice(0, 4) : '';
    const meses = anoBal ? new Set(balancetes.filter((a) => String(a.competencia).slice(0, 4) === anoBal).map((a) => a.competencia)).size : 0;
    const cartaoApresentacao = '<a class="cartao familia apresentacao" href="#/empresa/' + encodeURIComponent(codigo) + '/apresentacao' + (anoBal ? '/' + anoBal : '') + '">' +
      '<div class="icone">📊</div><h2>Relatório de apresentação</h2><p class="suave" style="line-height:1.5">Importe os balancetes do mês: o programa monta a DRE (CPC 51) mensal e trimestral, ' +
      'o balancete mensal e trimestral com AV % e AH % e o LALUR trimestral, prontos para apresentar, imprimir ou baixar em Excel.</p>' +
      '<div class="rodape"><span class="suave pequeno">' + (meses ? meses + ' balancete(s) de ' + anoBal + ' · último: ' + U.nomeCompetencia(ultimoBal + '-01') : 'nenhum balancete ainda') + '</span>' +
      '<span class="botao primario pequeno">Abrir →</span></div></a>';

    // Livro diário (22/09/2026): todas as contas do ano; os razões dos passos podem sair dele (opcional).
    const diarios = arquivos.filter((a) => a.tipo === 'diario' && a.periodo).sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)) || U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    const ultimoDiario = diarios[0];
    const cartaoDiario = '<a class="cartao familia diario" href="#/empresa/' + encodeURIComponent(codigo) + '/diario' + (ultimoDiario ? '/' + String(ultimoDiario.competencia).slice(0, 4) : '') + '">' +
      '<div class="icone">📒</div><h2>Livro diário</h2><p class="suave" style="line-height:1.5">Suba o diário do ano (todas as contas): o programa confere cada mês com o balancete e, nos passos, ' +
      'os razões podem sair dele sem subir conta por conta — ou continue subindo o razão, como preferir.</p>' +
      '<div class="rodape"><span class="suave pequeno">' + (ultimoDiario ? 'diário de ' + String(ultimoDiario.competencia).slice(0, 4) + ': ' + T.esc(ultimoDiario.periodo.de + ' a ' + ultimoDiario.periodo.ate) +
        ' · ' + (ultimoDiario.lancamentos || 0).toLocaleString('pt-BR') + ' lançamentos' : 'nenhum diário ainda') + '</span>' +
      '<span class="botao primario pequeno">Abrir →</span></div></a>';

    // Conciliações livres (Dony, 22/09/2026): as que ele mesmo cria, de qualquer conta.
    const livres = Array.isArray(emp.conciliacoesLivres) ? emp.conciliacoesLivres : [];
    const cartaoLivres = '<a class="cartao familia livres" href="#/empresa/' + encodeURIComponent(codigo) + '/livres">' +
      '<div class="icone">🧩</div><h2>Minhas conciliações</h2><p class="suave" style="line-height:1.5">Crie a conciliação que você quiser: escolha a conta, com qual outra conta ela cruza e ' +
      'a regra do cruzamento (impostos a recuperar × impostos a pagar, adiantamentos, contas transitórias). Vale todo mês, com os mesmos botões dos passos.</p>' +
      '<div class="rodape"><span class="suave pequeno">' + (livres.length ? livres.length + ' conciliação(ões) criada(s)' : 'nenhuma ainda · crie a primeira') + '</span>' +
      '<span class="botao primario pequeno">Abrir →</span></div></a>';

    // Contas de resultado (Dony, 23/09/2026): achar distorções nas despesas e receitas.
    const cartaoResultado = '<a class="cartao familia resultado" href="#/empresa/' + encodeURIComponent(codigo) + '/resultado">' +
      '<div class="icone">🔎</div><h2>Contas de resultado</h2><p class="suave" style="line-height:1.5">Acha as distorções das despesas e receitas pelo livro diário: o mesmo fornecedor em contas diferentes, ' +
      'pagamento direto na despesa, cheiro de tributo em conta que não é de tributo, lado errado e lançamento em dobro — com o arquivo de ajustes pronto.</p>' +
      '<div class="rodape"><span class="suave pequeno">' + (ultimoDiario ? 'pelo diário de ' + String(ultimoDiario.competencia).slice(0, 4) : 'precisa do livro diário') + '</span>' +
      '<span class="botao primario pequeno">Abrir →</span></div></a>';

    // Backup da empresa (Dony, 23/09/2026): cada um usa na sua máquina; o backup leva tudo para o colega.
    const cartaoBackup = '<a class="cartao familia backup" href="#/empresa/' + encodeURIComponent(codigo) + '/backup">' +
      '<div class="icone">💾</div><h2>Backup desta empresa</h2><p class="suave" style="line-height:1.5">Gere um arquivo com tudo desta empresa — arquivos, conciliações e decisões — ' +
      'para outro colaborador importar na máquina dele e ficar com os mesmos dados. E importe aqui o backup que ele mandar.</p>' +
      '<div class="rodape"><span class="suave pequeno">' + (arquivos.length ? arquivos.length + ' arquivo(s) nesta máquina' : 'nenhum arquivo ainda') + '</span>' +
      '<span class="botao primario pequeno">Abrir →</span></div></a>';

    // CONSOLIDAÇÃO (Dony, 28/09/2026): o grupo não tem arquivo nem conciliação própria — só o relatório, que
    // sai da soma das empresas escolhidas.
    const daConsolidacao = (emp.consolidacao && emp.consolidacao.empresas) || [];
    if (emp.ehGrupo) {
      const nomes = daConsolidacao.map((c) => { const x = app().empresas.find((e) => String(e.codigo) === String(c)); return x ? x.nome : c; });
      const cartaoConsolidado = '<a class="cartao familia apresentacao" href="#/empresa/' + encodeURIComponent(codigo) + '/apresentacao">' +
        '<div class="icone">🧩</div><h2>Relatório consolidado</h2><p class="suave" style="line-height:1.5">A soma dos balancetes das empresas do grupo, mês a mês e conta por conta, ' +
        'com as operações entre elas eliminadas: DRE mensal e trimestral, balanço, indicadores e fluxo de caixa.</p>' +
        '<div class="rodape"><span class="suave pequeno">' + (nomes.length ? T.esc(nomes.join(' + ')) : 'nenhuma empresa escolhida') + '</span>' +
        '<span class="botao primario pequeno">Abrir →</span></div></a>';
      el.innerHTML = '<a class="voltar" href="#/">← Empresas</a>' +
        '<div class="cabecalho"><div class="titulos"><h1>🧩 ' + T.esc(emp.nome) + '</h1><p class="suave">Consolidação · código ' + T.esc(emp.codigo) + ' · ' +
        daConsolidacao.length + ' empresa(s)</p></div><button class="botao" id="bt-editar">Editar a consolidação</button></div>' +
        '<div class="grade-3">' + cartaoConsolidado + '</div>';
      el.querySelector('#bt-editar').addEventListener('click', () => raiz.TelaCarteira.formularioGrupo(emp));
      return;
    }
    el.innerHTML = '<a class="voltar" href="#/">← Empresas</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>' + (emp.ehModelo ? '🧪 ' : '') + T.esc(emp.nome) + '</h1><p class="suave">Código ' + T.esc(emp.codigo) + (detalhes.length ? ' · ' + T.esc(detalhes.join(' · ')) : '') + '</p>' +
      (padroes.length ? '<p class="suave pequeno" title="O que o programa já aprendeu do sistema desta empresa: os próximos arquivos entram por aqui">🧠 Padrões desta empresa · ' + T.esc(padroes.join(' · ')) + '</p>' : '') + '</div>' +
      '<button class="botao" id="bt-editar">Editar cadastro</button></div>' +
      painelDoModelo(emp, arquivos) +
      '<div class="grade-3">' + cartaoApresentacao + cartaoDiario + cartoes + cartaoLivres + cartaoResultado + cartaoBackup + '</div>';
    el.querySelector('#bt-editar').addEventListener('click', () => raiz.TelaCarteira.formulario(emp));
    ligarModelo(el, emp);
  }

  // ------------------------------------------------------------------
  // EMPRESA MODELO (Dony, 20/10/2026: "criei aqui a empresa modelo e queria ter a opção de copiar os
  // dados de outra empresa… cópia igual, aí eu analiso aqui" + "quero poder excluir e copiar outro"
  // + "isso só no modelo, ok?"). O painel só aparece na empresa marcada como modelo no cadastro.
  // A cópia é FIEL: os mesmos arquivos (com os originais), as mesmas conciliações e a configuração.
  // A empresa de origem é só lida — nada nela muda.
  // ------------------------------------------------------------------
  function painelDoModelo(emp, arquivos) {
    if (!emp.ehModelo) return '';
    const outras = app().empresas.filter((e) => String(e.codigo) !== String(emp.codigo) && !e.ehGrupo && !e.ehModelo)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    const temDados = arquivos.length > 0;
    const opcoes = ['<option value="">— escolha a empresa —</option>'].concat(outras.map((e) =>
      '<option value="' + T.esc(e.codigo) + '">' + T.esc(e.codigo + ' · ' + e.nome) + '</option>')).join('');
    return '<div class="cartao corpo modelo-painel" style="margin-bottom:14px">' +
      '<h3 style="margin:0 0 6px">🧪 Empresa modelo</h3>' +
      '<p class="suave" style="line-height:1.55;margin:0 0 10px">Esta empresa é para estudar e demonstrar. Traga para cá os dados de uma empresa de verdade — ' +
      '<b>cópia igual</b>: os mesmos arquivos (com os originais), as mesmas conciliações e a configuração dela. ' +
      'A empresa de origem <b>não muda em nada</b>: ela é só lida.</p>' +
      (outras.length ? '<div class="linha-flex" style="gap:8px;flex-wrap:wrap">' +
        '<select id="md-origem" style="min-width:280px">' + opcoes + '</select>' +
        // MULTIPLICAR (Dony, 20/10/2026): "só muda os valores de forma proporcional". Inteiro, para
        // tudo continuar exato — ver o comentário em armazenamento-pasta.js.
        '<label class="suave pequeno" style="display:flex;align-items:center;gap:6px" ' +
        'title="1 = cópia igual. Outro número multiplica todos os valores: as contas, as datas e as proporções (AV %, AH %, indicadores) ficam iguais, só a escala muda.">' +
        // Campo de TEXTO, não de número: num campo de número o navegador apaga o que ele não
        // entende ("1,5" some) e o multiplicador viraria 1 calado. Aqui o que foi digitado fica
        // na tela e o programa diz por que não serve.
        'multiplicar por <input id="md-fator" type="text" inputmode="numeric" maxlength="4" value="1" style="width:60px;text-align:center"></label>' +
        '<button type="button" class="botao primario" data-acao="copiar-modelo">📋 Copiar os dados para cá</button>' +
        (temDados ? '<button type="button" class="botao" data-acao="limpar-modelo" title="Apaga os arquivos e as conciliações desta empresa modelo (o original continua inteiro na empresa de origem)">🧹 Limpar esta empresa</button>' : '') +
        '</div>' +
        (temDados ? '<p class="suave pequeno" style="margin:10px 0 0">Já tem ' + arquivos.length + ' arquivo(s) aqui. Copiar outra empresa <b>limpa isto antes</b>, para as duas não se misturarem.</p>' : '')
        : '<p class="suave pequeno">Nenhuma outra empresa cadastrada para copiar.</p>') +
      '<div id="md-aviso" style="margin-top:10px"></div></div>';
  }

  function ligarModelo(el, emp) {
    const painel = el.querySelector('.modelo-painel');
    if (!painel) return;
    const aviso = painel.querySelector('#md-aviso');
    painel.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      const acao = b.getAttribute('data-acao');
      const arm = app().armazenamento;
      if (acao === 'copiar-modelo') {
        const origem = painel.querySelector('#md-origem').value;
        if (!origem) { aviso.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>Escolha a empresa de onde copiar.</div></div>'; return; }
        const daOrigem = app().empresas.find((e) => String(e.codigo) === String(origem)) || {};
        const quantos = (await arm.arquivos(origem)).length;
        const tinha = (await arm.arquivos(emp.codigo)).length;
        const campoFator = painel.querySelector('#md-fator');
        const digitado = campoFator ? String(campoFator.value).trim() : '';
        // Campo vazio é 1 (cópia igual). Qualquer outra coisa tem que ser inteiro: "1,5" e "abc"
        // viram aviso, não viram 1 em silêncio.
        const fator = digitado === '' ? 1 : Number(digitado.replace(',', '.'));
        if (!Number.isInteger(fator) || fator < 1 || fator > 1000) {
          aviso.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>O multiplicador precisa ser um número <b>inteiro</b> de 1 a 1000 (<b>1</b> = cópia igual).<br>' +
            '<span class="suave pequeno">Com fator quebrado os centavos não se distribuem igual entre os dois lados, e o balanço deixaria de fechar.</span></div></div>';
          return;
        }
        const sim = await T.confirmar({
          titulo: 'Copiar os dados para a empresa modelo?',
          texto: 'Vai trazer para <b>' + T.esc(emp.nome) + '</b> uma cópia de <b>' + T.esc(daOrigem.nome || origem) + '</b>: ' +
            quantos + ' arquivo(s)' + (fator === 1 ? ', as conciliações e a configuração.' : ' e a configuração.') +
            (fator !== 1 ? '<br><br><b>Todos os valores serão multiplicados por ' + fator + '.</b> As contas, as datas e as proporções ficam iguais — só a escala muda. ' +
              'As conciliações já feitas <b>não vêm</b> (elas se amarram no valor de cada lançamento): é só apertar os botões de conciliar aqui depois. ' +
              'O arquivo original também não vem, porque ele traz os valores de verdade dentro.' : '') +
            (tinha ? '<br><br>O que está aqui hoje (' + tinha + ' arquivo(s)) <b>é apagado antes</b>, para as duas empresas não se misturarem.' : '') +
            '<br><br><span class="suave pequeno">A empresa de origem não muda: ela é só lida.</span>',
          botao: '📋 Copiar',
        });
        if (!sim) return;
        b.disabled = true;
        aviso.innerHTML = '<span class="suave pequeno">Copiando…</span>';
        try {
          const r = await arm.copiarEmpresa(origem, emp.codigo, { limparAntes: true, fator });
          app().empresas = await arm.empresas();
          aviso.innerHTML = '<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Copiado de ' + T.esc(r.nomeDaOrigem) + '.</b> ' +
            r.arquivos + ' arquivo(s)' + (r.semConciliacoes ? '' : ', ' + r.conciliacoes + ' conciliação(ões)') +
            (r.documentos ? ', ' + r.documentos + ' tabela(s) do ERP' : '') +
            (r.config.length ? ' e a configuração (' + T.esc(r.config.join(', ')) + ')' : '') + '.' +
            (r.fator !== 1 ? '<br>Os valores foram <b>multiplicados por ' + r.fator + '</b>. As conciliações não vieram: aperte os botões de conciliar para refazê-las.' : '') +
            '</div></div>';
          setTimeout(() => app().mostrarRota(), 900);
        } catch (x) {
          b.disabled = false;
          aviso.innerHTML = '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div>' + T.esc(T.mensagemDeErro(x)) + '</div></div>';
        }
        return;
      }
      if (acao === 'limpar-modelo') {
        const sim = await T.confirmar({
          titulo: 'Limpar a empresa modelo?',
          texto: 'Apaga os arquivos, as conciliações e a configuração de <b>' + T.esc(emp.nome) + '</b>. O cadastro dela fica.' +
            '<br><br><span class="suave pequeno">É cópia: o original continua inteiro na empresa de onde você copiou.</span>',
          botao: '🧹 Limpar',
          perigo: true,
        });
        if (!sim) return;
        b.disabled = true;
        try {
          const r = await arm.limparEmpresa(emp.codigo);
          app().empresas = await arm.empresas();
          aviso.innerHTML = '<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Limpa.</b> ' +
            r.arquivos + ' arquivo(s) e ' + r.conciliacoes + ' conciliação(ões) apagados.</div></div>';
          setTimeout(() => app().mostrarRota(), 900);
        } catch (x) {
          b.disabled = false;
          aviso.innerHTML = '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div>' + T.esc(T.mensagemDeErro(x)) + '</div></div>';
        }
      }
    });
  }

  raiz.TelaEmpresa = { mostrar };
})(self);
