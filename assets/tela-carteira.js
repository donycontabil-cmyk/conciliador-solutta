/*
 * Conciliador Solutta — tela-carteira.js
 * Carteira de empresas: busca por código, nome ou CNPJ; cadastrar e editar (Parte 8).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'Imune / Isenta', 'Outro'];

  function app() { return raiz.App; }

  async function mostrar(el, conferir) {
    const arm = app().armazenamento;
    let empresas = app().empresas;
    const contagem = {};
    for (const e of empresas) {
      try { contagem[e.codigo] = (await arm.arquivos(e.codigo)).length; } catch (x) { contagem[e.codigo] = 0; }
    }
    if (conferir && !conferir()) return;
    const busca = app().lerLocal('conciliador-solutta.busca-carteira') || '';
    const E = raiz.Demonstracao && raiz.Demonstracao.EMPRESA;
    const semDemonstracao = app().demonstracao && E && !empresas.some((x) => String(x.codigo) === E.codigo);
    el.innerHTML = '<div class="cabecalho"><div class="titulos"><h1>Empresas</h1><p class="suave">A carteira do escritório. Abra uma empresa para conciliar.</p></div>' +
      '<div class="linha-flex"><button class="botao" id="bt-consolidacao" title="Um relatório que soma várias empresas do mesmo grupo">🧩 Nova consolidação</button>' +
      '<button class="botao primario" id="bt-nova">＋ Cadastrar empresa</button></div></div>' +
      (semDemonstracao ? '<div class="aviso info" style="margin-bottom:14px"><span class="icone-aviso">🧪</span><div style="flex:1"><b>Quer conhecer o programa sem arquivo de cliente?</b><br>' +
        'Crie a empresa de demonstração ' + T.esc(E.nome) + ' (código ' + T.esc(E.codigo) + ', CNPJ fictício). Fornecedores, notas e valores são todos inventados.</div>' +
        '<button class="botao primario" id="bt-demonstracao">Criar a empresa de demonstração</button></div>' : '') +
      '<div class="filtros"><input class="busca" id="busca" type="search" placeholder="Buscar por código, nome ou CNPJ" value="' + T.esc(busca) + '"></div>' +
      '<div id="lista"></div>';
    const lista = el.querySelector('#lista');
    function desenhar() {
      const q = U.normalizarNome(el.querySelector('#busca').value);
      const qd = U.soDigitos(el.querySelector('#busca').value);
      const filtradas = empresas.filter((e) => !q || U.normalizarNome(e.codigo + ' ' + e.nome).indexOf(q) >= 0 || (qd && String(e.cnpj || '').indexOf(qd) >= 0));
      if (!empresas.length) {
        lista.innerHTML = '<div class="cartao"><div class="vazio"><p style="font-size:15px;color:var(--texto)">Nenhuma empresa cadastrada ainda.</p>' +
          '<p style="margin-top:6px">Clique em <b>Cadastrar empresa</b> para começar.</p></div></div>';
        return;
      }
      T.tabelaPaginada(lista, {
        alta: false,
        ordem: { id: 'carteira', colunas: ['codigo', 'nome', 'cnpj', 'regime', 'atividade', 'grupo'].map((k) => ({ tipo: 'texto', de: (e) => e[k] }))
          .concat([{ tipo: 'numero', de: (e) => contagem[e.codigo] || 0 }, null]) },
        cabecalho: '<th>Código</th><th>Empresa</th><th>CNPJ</th><th>Regime</th><th>Atividade</th><th>Grupo</th><th class="num">Arquivos</th><th></th>',
        linhas: filtradas,
        vazio: 'Nenhuma empresa encontrada para esta busca.',
        linha: (e) => '<tr><td>' + T.esc(e.codigo) + '</td><td class="nome"><a href="#/empresa/' + encodeURIComponent(e.codigo) + (e.ehGrupo ? '/apresentacao' : '') + '"><b>' + T.esc(e.nome) + '</b></a>' +
          (e.ehGrupo ? ' <span class="pilula">🧩 consolidação</span>' : '') + '</td>' +
          '<td class="num">' + (e.cnpj ? U.formatarCnpj(e.cnpj) : '—') + '</td><td>' + T.nome(e.regime) + '</td><td>' + T.nome(e.atividade) + '</td><td>' + T.nome(e.grupo) + '</td>' +
          (e.ehGrupo ? '<td class="num">' + ((e.consolidacao && e.consolidacao.empresas.length) || 0) + ' empresa(s)</td>'
            : '<td class="num' + (contagem[e.codigo] ? '' : ' zero') + '">' + (contagem[e.codigo] || 0) + '</td>') +
          '<td class="num"><button class="botao pequeno leve" data-editar="' + T.esc(e.codigo) + '">Editar</button> ' +
          '<button class="botao pequeno leve" data-excluir="' + T.esc(e.codigo) + '" title="Excluir esta empresa e tudo o que está guardado nela">🗑</button> ' +
          '<a class="botao pequeno" href="#/empresa/' + encodeURIComponent(e.codigo) + '">Abrir →</a></td></tr>',
      });
    }
    el.querySelector('#busca').addEventListener('input', () => { app().gravarLocal('conciliador-solutta.busca-carteira', el.querySelector('#busca').value); desenhar(); });
    el.querySelector('#bt-nova').addEventListener('click', () => formulario(null));
    el.querySelector('#bt-consolidacao').addEventListener('click', () => formularioGrupo(null));
    const btDemo = el.querySelector('#bt-demonstracao');
    if (btDemo) {
      btDemo.addEventListener('click', async () => {
        btDemo.disabled = true;
        try {
          const salvo = await app().armazenamento.salvarEmpresa(E);
          T.avisoRapido('Empresa de demonstração criada: ' + salvo.codigo + ' · ' + salvo.nome, 'ok');
          app().ir('#/empresa/' + encodeURIComponent(salvo.codigo) + '/fornecedores/' + U.anoMes(raiz.Demonstracao.COMPETENCIA));
        } catch (x) {
          btDemo.disabled = false;
          T.avisoRapido(T.mensagemDeErro(x), 'erro');
        }
      });
    }
    lista.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-editar]');
      if (b) {
        const alvo = empresas.find((e) => String(e.codigo) === b.getAttribute('data-editar'));
        if (alvo && alvo.ehGrupo) formularioGrupo(alvo); else formulario(alvo);
        return;
      }
      const x = ev.target.closest('[data-excluir]');
      if (x) { const apagou = await excluirEmpresa(empresas.find((e) => String(e.codigo) === x.getAttribute('data-excluir'))); if (apagou) { empresas = await app().armazenamento.empresas(); app().empresas = empresas; desenhar(); } }
    });
    desenhar();
  }

  // ------------------------------------------------------------------
  // EXCLUIR EMPRESA (Dony, 24/09/2026: "eu quero poder excluir empresa também"). Apaga a pasta dela inteira —
  // arquivos, conciliações e histórico —, então: mostra o que vai sumir, oferece o backup antes e só libera o
  // botão depois de digitar o código da empresa. Não tem como desfazer.
  // ------------------------------------------------------------------
  async function excluirEmpresa(empresa) {
    if (!empresa) return false;
    const arm = app().armazenamento;
    const codigo = String(empresa.codigo);
    let arqs = [], concs = [];
    try { arqs = await arm.arquivos(codigo); concs = await arm.conciliacoes(codigo); } catch (x) { /* empresa sem pasta */ }
    const temDados = arqs.length || concs.length;
    const confirmado = await T.janela({
      titulo: 'Excluir a empresa ' + codigo + '?',
      corpo: '<p style="line-height:1.6">Vai sumir <b>tudo</b> desta empresa, sem como desfazer:</p>' +
        '<ul class="pequeno" style="margin:8px 0 12px 18px"><li><b>' + T.esc(empresa.nome || '') + '</b> (código ' + T.esc(codigo) + ')</li>' +
        '<li><b>' + arqs.length + '</b> arquivo(s) guardado(s)</li><li><b>' + concs.length + '</b> conciliação(ões) e as decisões delas</li>' +
        '<li>o histórico do que foi feito nesta empresa</li></ul>' +
        (temDados ? '<div class="aviso ambar" style="margin:0 0 12px"><span class="icone-aviso">💾</span><div><b>Faça um backup antes.</b> ' +
          'O backup é um arquivo só, que dá para importar depois nesta ou em outra máquina. <button type="button" class="botao pequeno" id="bt-backup-antes">⬇ Gerar o backup agora</button></div></div>' : '') +
        '<div class="campo"><label for="f-apagar">Para confirmar, digite o código da empresa (<b>' + T.esc(codigo) + '</b>)</label>' +
        '<input id="f-apagar" autocomplete="off" autofocus placeholder="' + T.esc(codigo) + '"></div><div id="f-apagar-erro"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, {
        texto: '🗑 Excluir a empresa', tipo: 'perigo',
        antes: (j) => {
          const digitado = j.querySelector('#f-apagar').value.trim();
          if (digitado !== codigo) {
            j.querySelector('#f-apagar-erro').innerHTML = '<div class="aviso vermelho" style="margin-top:10px">Digite <b>' + T.esc(codigo) + '</b> para confirmar.</div>';
            return false;
          }
          return true;
        },
      }],
      aoAbrir: (j) => {
        const bt = j.querySelector('#bt-backup-antes');
        if (bt) bt.addEventListener('click', async () => { bt.disabled = true; try { await raiz.TelaBackup.baixarBackup(codigo); } catch (x) { T.avisoRapido(T.mensagemDeErro(x), 'erro'); } bt.disabled = false; });
      },
    });
    if (!confirmado) return false;
    try {
      const r = await arm.apagarEmpresa(codigo, { comTudo: true });
      T.avisoRapido('Empresa ' + codigo + ' excluída' + (r && r.arquivos ? ' com ' + r.arquivos + ' arquivo(s) e ' + r.conciliacoes + ' conciliação(ões)' : '') + '.', 'ok', 7000);
      return true;
    } catch (x) {
      T.avisoRapido('Não deu para excluir: ' + T.mensagemDeErro(x), 'erro', 9000);
      return false;
    }
  }

  async function formulario(empresa) {
    const e = empresa || {};
    const novo = !empresa;
    const opcoesRegime = ['<option value="">—</option>'].concat(REGIMES.map((r) => '<option' + (e.regime === r ? ' selected' : '') + '>' + r + '</option>')).join('');
    const salvo = await T.janela({
      titulo: novo ? 'Cadastrar empresa' : 'Editar empresa ' + e.codigo,
      corpo: '<div class="grade-form">' +
        '<div class="campo"><label for="f-codigo">Código *</label><input id="f-codigo" maxlength="20" ' + (novo ? 'autofocus' : 'readonly') + ' value="' + T.esc(e.codigo || '') + '" placeholder="Ex.: 250"><span class="ajuda">O mesmo código do sistema contábil.</span></div>' +
        '<div class="campo"><label for="f-cnpj">CNPJ</label><input id="f-cnpj" maxlength="18" value="' + T.esc(e.cnpj ? U.formatarCnpj(e.cnpj) : '') + '" placeholder="00.000.000/0000-00"><span class="ajuda" id="f-cnpj-ajuda">Conferido pelo dígito verificador.</span></div>' +
        '<div class="campo inteiro"><label for="f-nome">Nome *</label><input id="f-nome" maxlength="120" ' + (novo ? '' : 'autofocus') + ' value="' + T.esc(e.nome || '') + '" placeholder="Razão social"></div>' +
        '<div class="campo"><label for="f-regime">Regime</label><select id="f-regime">' + opcoesRegime + '</select></div>' +
        '<div class="campo"><label for="f-atividade">Atividade</label><input id="f-atividade" maxlength="80" value="' + T.esc(e.atividade || '') + '" placeholder="Ex.: Restaurante"></div>' +
        '<div class="campo inteiro"><label for="f-grupo">Grupo</label><input id="f-grupo" maxlength="80" value="' + T.esc(e.grupo || '') + '" placeholder="Empresas do mesmo grupo econômico (opcional)"></div>' +
        '</div><div id="f-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, {
        texto: novo ? 'Cadastrar' : 'Salvar', tipo: 'primario',
        antes: async (j) => {
          const dados = {
            codigo: j.querySelector('#f-codigo').value.trim(),
            nome: j.querySelector('#f-nome').value.trim(),
            cnpj: j.querySelector('#f-cnpj').value.trim(),
            regime: j.querySelector('#f-regime').value,
            atividade: j.querySelector('#f-atividade').value.trim(),
            grupo: j.querySelector('#f-grupo').value.trim(),
          };
          const erro = j.querySelector('#f-erro');
          if (novo && app().empresas.some((x) => String(x.codigo) === dados.codigo)) {
            erro.innerHTML = '<div class="aviso vermelho">Já existe uma empresa com o código ' + T.esc(dados.codigo) + '.</div>';
            return false;
          }
          try {
            return await app().armazenamento.salvarEmpresa(dados);
          } catch (x) {
            erro.innerHTML = '<div class="aviso vermelho">' + T.esc(T.mensagemDeErro(x)) + '</div>';
            return false;
          }
        },
      }],
      aoAbrir: (j) => {
        const cnpj = j.querySelector('#f-cnpj');
        const ajuda = j.querySelector('#f-cnpj-ajuda');
        cnpj.addEventListener('input', () => {
          const d = U.limparCnpj(cnpj.value);
          if (!d) { ajuda.className = 'ajuda'; ajuda.textContent = 'Conferido pelo dígito verificador.'; return; }
          if (d.length < 14) { ajuda.className = 'ajuda'; ajuda.textContent = 'Faltam dígitos.'; return; }
          const valido = U.cnpjValido(d);
          ajuda.className = valido ? 'ajuda ok' : 'erro-campo';
          ajuda.textContent = valido ? '✓ CNPJ válido' : 'CNPJ inválido: o dígito verificador não confere.';
        });
      },
    });
    if (salvo) {
      T.avisoRapido((novo ? 'Empresa cadastrada: ' : 'Empresa salva: ') + salvo.codigo + ' · ' + salvo.nome, 'ok');
      app().mostrarRota();
    }
  }

  // ------------------------------------------------------------------
  // CONSOLIDAÇÃO (Dony, 28/09/2026: "existem algumas empresas em que eu preciso consolidar; quero entrar nos
  // relatórios de consolidação e escolher as empresas"). Um grupo é um cadastro sem balancete próprio: o
  // relatório dele soma os balancetes das empresas escolhidas. As contas que se eliminam (operações entre as
  // empresas do grupo) são marcadas depois, dentro do relatório, onde as contas estão à mão.
  // ------------------------------------------------------------------
  async function formularioGrupo(grupo) {
    const g = grupo || {};
    const novo = !grupo;
    const escolhidas = new Set(((g.consolidacao && g.consolidacao.empresas) || []).map(String));
    const candidatas = app().empresas.filter((e) => !e.ehGrupo).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const codigoSugerido = () => {
      for (let n = 1; n < 100; n++) { const c = 'C' + n; if (!app().empresas.some((x) => String(x.codigo) === c)) return c; }
      return 'C';
    };
    const salvo = await T.janela({
      titulo: novo ? 'Nova consolidação' : 'Editar a consolidação ' + g.codigo,
      larga: true,
      corpo: '<p class="suave pequeno" style="margin:0 0 10px;line-height:1.5">A consolidação soma os balancetes das empresas escolhidas, mês a mês e conta por conta, e ' +
        'monta o relatório inteiro (DRE, balanço, indicadores e fluxo de caixa) como se fosse uma empresa só. ' +
        'As <b>contas que se eliminam</b> (operações entre as empresas do grupo) você marca depois, dentro do relatório.</p>' +
        '<div class="grade-form">' +
        '<div class="campo"><label for="g-codigo">Código *</label><input id="g-codigo" maxlength="20" ' + (novo ? 'autofocus' : 'readonly') +
        ' value="' + T.esc(g.codigo || codigoSugerido()) + '"><span class="ajuda">Um código só para a consolidação (ela não é uma empresa do sistema contábil).</span></div>' +
        '<div class="campo"><label for="g-nome">Nome *</label><input id="g-nome" maxlength="120" ' + (novo ? '' : 'autofocus') + ' value="' + T.esc(g.nome || '') + '" placeholder="Ex.: GRUPO ALFA (consolidado)"></div>' +
        '</div>' +
        '<h3 class="apres-sub" style="margin:14px 0 6px">Empresas desta consolidação</h3>' +
        (candidatas.length ? '<div class="lista-escolha" id="g-empresas">' + candidatas.map((e) => '<label class="item-aba"><input type="checkbox" value="' + T.esc(e.codigo) + '"' +
          (escolhidas.has(String(e.codigo)) ? ' checked' : '') + '> <b>' + T.esc(e.codigo) + '</b> · ' + T.esc(e.nome) + (e.grupo ? ' <span class="suave pequeno">· grupo ' + T.esc(e.grupo) + '</span>' : '') + '</label>').join('')
          + '</div>' : '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>Cadastre as empresas primeiro.</div></div>') +
        '<div id="g-erro" style="margin-top:12px"></div>',
      botoes: [{ texto: 'Cancelar', valor: null }, {
        texto: novo ? 'Criar consolidação' : 'Salvar', tipo: 'primario',
        antes: async (j) => {
          const empresas = Array.from(j.querySelectorAll('#g-empresas input:checked')).map((x) => x.value);
          const erro = j.querySelector('#g-erro');
          const dados = { codigo: j.querySelector('#g-codigo').value.trim(), nome: j.querySelector('#g-nome').value.trim(), ehGrupo: true,
            consolidacao: { empresas, eliminar: (g.consolidacao && g.consolidacao.eliminar) || [] } };
          if (empresas.length < 2) { erro.innerHTML = '<div class="aviso vermelho">Escolha pelo menos duas empresas para consolidar.</div>'; return false; }
          if (novo && app().empresas.some((x) => String(x.codigo) === dados.codigo)) {
            erro.innerHTML = '<div class="aviso vermelho">Já existe uma empresa ou consolidação com o código ' + T.esc(dados.codigo) + '.</div>';
            return false;
          }
          try { return await app().armazenamento.salvarEmpresa(dados); } catch (x) {
            erro.innerHTML = '<div class="aviso vermelho">' + T.esc(T.mensagemDeErro(x)) + '</div>';
            return false;
          }
        },
      }],
    });
    if (salvo) {
      app().empresas = await app().armazenamento.empresas();
      T.avisoRapido((novo ? 'Consolidação criada: ' : 'Consolidação salva: ') + salvo.codigo + ' · ' + salvo.nome, 'ok');
      app().ir('#/empresa/' + encodeURIComponent(salvo.codigo) + '/apresentacao');
    }
  }

  raiz.TelaCarteira = { mostrar, formulario, formularioGrupo };
})(self);
