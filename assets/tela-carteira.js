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
    const empresas = app().empresas;
    const contagem = {};
    for (const e of empresas) {
      try { contagem[e.codigo] = (await arm.arquivos(e.codigo)).length; } catch (x) { contagem[e.codigo] = 0; }
    }
    if (conferir && !conferir()) return;
    const busca = app().lerLocal('conciliador-solutta.busca-carteira') || '';
    const E = raiz.Demonstracao && raiz.Demonstracao.EMPRESA;
    const semDemonstracao = app().demonstracao && E && !empresas.some((x) => String(x.codigo) === E.codigo);
    el.innerHTML = '<div class="cabecalho"><div class="titulos"><h1>Empresas</h1><p class="suave">A carteira do escritório. Abra uma empresa para conciliar.</p></div>' +
      '<button class="botao primario" id="bt-nova">＋ Cadastrar empresa</button></div>' +
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
        linha: (e) => '<tr><td>' + T.esc(e.codigo) + '</td><td class="nome"><a href="#/empresa/' + encodeURIComponent(e.codigo) + '"><b>' + T.esc(e.nome) + '</b></a></td>' +
          '<td class="num">' + (e.cnpj ? U.formatarCnpj(e.cnpj) : '—') + '</td><td>' + T.nome(e.regime) + '</td><td>' + T.nome(e.atividade) + '</td><td>' + T.nome(e.grupo) + '</td>' +
          '<td class="num' + (contagem[e.codigo] ? '' : ' zero') + '">' + (contagem[e.codigo] || 0) + '</td>' +
          '<td class="num"><button class="botao pequeno leve" data-editar="' + T.esc(e.codigo) + '">Editar</button> <a class="botao pequeno" href="#/empresa/' + encodeURIComponent(e.codigo) + '">Abrir →</a></td></tr>',
      });
    }
    el.querySelector('#busca').addEventListener('input', () => { app().gravarLocal('conciliador-solutta.busca-carteira', el.querySelector('#busca').value); desenhar(); });
    el.querySelector('#bt-nova').addEventListener('click', () => formulario(null));
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
    lista.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-editar]');
      if (b) formulario(empresas.find((e) => String(e.codigo) === b.getAttribute('data-editar')));
    });
    desenhar();
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

  raiz.TelaCarteira = { mostrar, formulario };
})(self);
