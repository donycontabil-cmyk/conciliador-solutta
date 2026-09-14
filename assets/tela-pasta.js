/*
 * Conciliador Solutta — tela-pasta.js
 * Quem está usando, e a pasta de dados: escolher, reconectar, trocar (Parte 3.1).
 * A tela mostra sempre qual pasta está conectada.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;

  function app() { return raiz.App; }

  // Na primeira abertura, o programa pergunta o nome de quem usa (guardado no navegador)
  // e grava quem/quando em tudo (Parte 3.4).
  async function pedirNome(podeCancelar) {
    const atual = app().usuario.nome || '';
    while (true) {
      const r = await T.janela({
        titulo: 'Quem está usando o programa?',
        corpo: '<p class="suave" style="margin-bottom:12px;line-height:1.5">O nome fica gravado em cada ação (quem subiu o arquivo, quem aceitou a reclassificação, quem baixou o arquivo de ajustes).</p>' +
          '<div class="campo"><label for="nome-usuario">Seu nome</label><input id="nome-usuario" autofocus maxlength="60" value="' + T.esc(atual) + '" placeholder="Ex.: Dony"></div>',
        naoFecharFora: !podeCancelar,
        botoes: (podeCancelar ? [{ texto: 'Cancelar', valor: null }] : []).concat([{
          texto: 'Continuar', tipo: 'primario',
          antes: (j) => {
            const v = j.querySelector('#nome-usuario').value.trim();
            if (!v) { j.querySelector('#nome-usuario').focus(); return false; }
            return v;
          },
        }]),
        aoAbrir: (j) => {
          const input = j.querySelector('#nome-usuario');
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') j.querySelector('footer .primario').click(); });
        },
      });
      if (r) { app().guardarNome(r); return r; }
      if (podeCancelar) return null;
    }
  }

  function telaNaoSuportado(el) {
    el.innerHTML = '<div class="entrada"><div class="cartao"><h1>Abra no Google Chrome ou no Microsoft Edge</h1>' +
      '<p class="suave" style="line-height:1.55;margin-top:8px">Este navegador não deixa o programa gravar numa pasta do computador. ' +
      'O Conciliador guarda os dados numa pasta sua, e só o <b>Google Chrome</b> e o <b>Microsoft Edge</b> de computador permitem isso.</p>' +
      '<ol><li>Feche esta janela.</li><li>Clique com o botão direito no arquivo <b>index.html</b> da pasta do programa.</li>' +
      '<li>Escolha <b>Abrir com</b> → <b>Google Chrome</b> ou <b>Microsoft Edge</b>.</li></ol>' +
      '<p class="suave pequeno" style="margin-top:14px">Só para ver o programa funcionando, sem gravar nada: <a href="?modo=memoria">abrir em modo demonstração</a>.</p>' +
      '</div></div>';
  }

  function telaConectar(el) {
    const cfg = app().config;
    el.innerHTML = '<div class="carregando">Verificando a pasta de dados…</div>';
    app().armazenamento.situacao().then((sit) => {
      if (!sit.suportado) return telaNaoSuportado(el);
      const lembrada = sit.lembrada;
      el.innerHTML = '<div class="entrada"><div class="cartao">' +
        (lembrada
          ? '<h1>Reconectar a pasta de dados</h1><p class="suave" style="line-height:1.55;margin-top:8px">A pasta usada da última vez foi <b>' + T.esc(sit.nome) + '</b>. ' +
            'Por segurança, o navegador pede a sua permissão a cada vez que o programa é aberto.</p>' +
            '<div class="linha-flex" style="margin-top:18px"><button class="botao primario" id="bt-reconectar">Reconectar a pasta de dados</button>' +
            '<button class="botao" id="bt-outra">Escolher outra pasta</button></div>' +
            '<p class="suave pequeno" style="margin-top:12px">O navegador vai perguntar se permite editar os arquivos da pasta: clique em <b>Permitir</b> (ou "Editar arquivos").</p>'
          : '<h1>Escolha a pasta de dados</h1><p class="suave" style="line-height:1.55;margin-top:8px">Tudo o que o Conciliador guarda (empresas, arquivos que subirem, decisões e o registro de quem fez o quê) ' +
            'fica numa pasta <b>deste computador</b>. Nada vai para a internet.</p>' +
            '<ol><li>Crie uma pasta nova, por exemplo <b>' + T.esc(cfg.pastaSugerida) + '</b> (no Explorador de Arquivos: botão direito → Novo → Pasta).</li>' +
            '<li>Clique em <b>Escolher a pasta de dados</b>, abaixo.</li><li>Selecione a pasta criada e clique em <b>Selecionar pasta</b>.</li>' +
            '<li>Quando o navegador perguntar, clique em <b>Permitir</b> (ou "Editar arquivos").</li></ol>' +
            '<div class="linha-flex" style="margin-top:14px"><button class="botao primario" id="bt-escolher">Escolher a pasta de dados</button></div>' +
            '<p class="suave pequeno" style="margin-top:12px">O navegador não aceita a raiz do disco (C:\\) nem pastas do sistema: use uma pasta própria.</p>') +
        '<div id="msg-pasta" style="margin-top:14px"></div>' +
        '</div></div>';
      const msg = el.querySelector('#msg-pasta');
      const agir = async (pedido) => {
        msg.innerHTML = '';
        try {
          let r = await app().armazenamento.conectar(pedido);
          if (!r.ok && r.precisaConfirmar) {
            const sim = await T.confirmar({ titulo: 'Usar esta pasta?', texto: T.esc(r.precisaConfirmar), botao: 'Usar esta pasta' });
            if (!sim) return;
            r = await app().armazenamento.conectar({ aceitarPastaComOutrosArquivos: true });
          }
          if (r.cancelado) return;
          if (!r.ok && r.semPermissao) {
            msg.innerHTML = '<div class="aviso ambar"><span class="icone-aviso">⚠️</span><div>Sem a permissão do navegador o programa não consegue gravar na pasta <b>' + T.esc(r.nome) + '</b>. Clique de novo e escolha <b>Permitir</b>.</div></div>';
            return;
          }
          if (r.ok) {
            T.avisoRapido((r.criada ? 'Pasta de dados preparada: ' : 'Pasta de dados conectada: ') + r.nome, 'ok');
            await app().atualizarTopo();
            await app().mostrarRota();
          }
        } catch (e) {
          msg.innerHTML = '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div>' + T.esc(T.mensagemDeErro(e)) + '</div></div>';
        }
      };
      const b1 = el.querySelector('#bt-reconectar');
      const b2 = el.querySelector('#bt-outra');
      const b3 = el.querySelector('#bt-escolher');
      if (b1) b1.addEventListener('click', () => agir({}));
      if (b2) b2.addEventListener('click', () => agir({ escolherNova: true }));
      if (b3) b3.addEventListener('click', () => agir({ escolherNova: true }));
    });
  }

  async function menuDaPasta() {
    const arm = app().armazenamento;
    const ligado = await arm.estaConectado();
    if (!ligado) { app().mostrarRota(); return; }
    if (app().modo === 'memoria') {
      await T.janela({ titulo: 'Modo demonstração', corpo: '<p class="suave" style="line-height:1.5">Os dados estão só na memória desta aba. Para gravar numa pasta, abra o programa sem <b>?modo=memoria</b> no endereço.</p>' });
      return;
    }
    const r = await T.janela({
      titulo: 'Pasta de dados',
      corpo: '<p style="line-height:1.55">Em uso: <b>' + T.esc(await arm.descricao()) + '</b>.</p>' +
        '<p class="suave" style="margin-top:8px;line-height:1.55">Para mostrar onde os dados estão, abra essa pasta no Explorador de Arquivos. ' +
        'Trocar de pasta não apaga nada: a pasta anterior continua como estava.</p>',
      botoes: [{ texto: 'Fechar', valor: null }, { texto: 'Trocar de pasta', valor: 'trocar' }],
    });
    if (r === 'trocar') {
      await arm.desconectar(false);
      try {
        let c = await arm.conectar({ escolherNova: true });
        if (!c.ok && c.precisaConfirmar) {
          const sim = await T.confirmar({ titulo: 'Usar esta pasta?', texto: T.esc(c.precisaConfirmar), botao: 'Usar esta pasta' });
          if (sim) c = await arm.conectar({ aceitarPastaComOutrosArquivos: true });
        }
      } catch (e) {
        T.avisoRapido(T.mensagemDeErro(e), 'erro');
      }
      await app().atualizarTopo();
      app().mostrarRota();
    }
  }

  raiz.TelaPasta = { pedirNome, telaNaoSuportado, telaConectar, menuDaPasta };
})(self);
