/*
 * Conciliador Solutta — tela-familia.js
 * Família (Fornecedores): competência ‹ mês ›, nota "Primeiro fechamento" ou "Mês a mês",
 * checklist "Antes de conciliar", cartões dos passos e os arquivos da família (Parte 7.0, 7.1 e 8).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;
  const F = raiz.Familias;

  function app() { return raiz.App; }

  function idChecklist(codigo, comp) { return 'F-' + codigo + '-fornecedor_checklist-' + U.anoMes(comp); }
  function idPasso1(codigo, comp) { return 'F-' + codigo + '-fornecedor_adiantamento-' + U.anoMes(comp); }

  function daFamilia(meta) {
    return (meta.tipo === 'razao' && meta.conta && meta.conta.familia === 'fornecedores') || meta.tipo === 'financeiro_pagar' || meta.tipo === 'financeiro_adiantamento';
  }

  // O arquivo que vale para cada papel na competência: a versão mais nova.
  function arquivosDoPasso1(metas, comp) {
    const doMes = metas.filter((m) => m.competencia === comp);
    const maisNovo = (lista) => lista.slice().sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm))[0] || null;
    const principal = doMes.filter((m) => m.tipo === 'razao' && m.conta && m.conta.familia === 'fornecedores' && m.conta.papel === 'principal');
    const adiant = doMes.filter((m) => m.tipo === 'razao' && m.conta && m.conta.familia === 'fornecedores' && m.conta.papel === 'adiantamento');
    // Uma conta pode ter mais de um arquivo (versões): vale o mais novo de cada conta.
    const porConta = (lista) => {
      const mapa = new Map();
      for (const m of lista) {
        const k = m.conta.codigo;
        if (!mapa.has(k) || U.paraMs(m.enviadoEm) > U.paraMs(mapa.get(k).enviadoEm)) mapa.set(k, m);
      }
      return Array.from(mapa.values());
    };
    return {
      F: porConta(principal),
      A: porConta(adiant),
      pagar: maisNovo(doMes.filter((m) => m.tipo === 'financeiro_pagar')),
    };
  }

  function checklistCompleto(registro) {
    return !!(registro && registro.decisoes && registro.decisoes.bancos && registro.decisoes.bancos.ok &&
      registro.decisoes.notas && registro.decisoes.notas.ok);
  }

  function competenciaPadrao(metas) {
    const comps = Array.from(new Set(metas.filter(daFamilia).map((m) => m.competencia))).sort().reverse();
    if (comps.length) return U.anoMes(comps[0]);
    return U.anoMes(U.somarMeses(U.competenciaDe(U.hoje()), -1));
  }

  async function mostrar(el, codigo, familiaId, anoMes, conferir) {
    const arm = app().armazenamento;
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) {
      el.innerHTML = '<div class="aviso ambar">A empresa ' + T.esc(codigo) + ' não está cadastrada. <a href="#/">Voltar</a></div>';
      return;
    }
    const fam = F.familia(familiaId);
    if (!fam || familiaId !== 'fornecedores') {
      el.innerHTML = '<a class="voltar" href="#/empresa/' + encodeURIComponent(codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
        '<div class="aviso info"><span class="icone-aviso">🛠️</span><div><b>' + T.esc(fam ? fam.titulo : familiaId) + '</b> está em construção' +
        (fam && fam.etapa ? ' (Etapa ' + fam.etapa + ' do plano)' : '') + '.</div></div>';
      return;
    }
    const metas = await arm.arquivos(codigo);
    if (!anoMes) {
      app().ir('#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + competenciaPadrao(metas));
      return;
    }
    const comp = anoMes + '-01';
    const concs = await arm.conciliacoes(codigo, comp);
    const todasConcs = await arm.conciliacoes(codigo);
    if (conferir && !conferir()) return;

    const checklist = concs.find((c) => c.id === idChecklist(codigo, comp)) || null;
    const passo1 = concs.find((c) => c.id === idPasso1(codigo, comp)) || null;
    const completo = checklistCompleto(checklist);
    const fechadaAntes = todasConcs.some((c) => c.tipo === 'fornecedor_adiantamento' && c.situacao === 'fechada' && c.competencia < comp);
    const arqs = arquivosDoPasso1(metas, comp);
    const doMes = metas.filter((m) => m.competencia === comp && daFamilia(m));
    const outrosMeses = Array.from(new Set(metas.filter((m) => daFamilia(m) && m.competencia !== comp).map((m) => U.anoMes(m.competencia)))).sort().reverse();
    const base = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/';

    el.innerHTML =
      '<a class="voltar" href="#/empresa/' + encodeURIComponent(codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Fornecedores · ' + U.nomeCompetencia(comp) + '</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + '</p></div>' +
      '<div class="linha-flex">' +
      (fechadaAntes
        ? '<span class="pilula azul" title="Razão do mês + relatório do mês.">Mês a mês</span>'
        : '<span class="pilula ambar" title="Primeiro fechamento da empresa: o que está no razão até o fim do mês é confrontado com a posição do financeiro dessa data, e a diferença vira ajuste de exercícios anteriores.">Primeiro fechamento</span>') +
      '<div class="competencia"><button type="button" id="mes-antes" title="Mês anterior">‹</button><span>' + U.nomeCompetencia(comp) + '</span><button type="button" id="mes-depois" title="Mês seguinte">›</button></div>' +
      '</div></div>' +
      (outrosMeses.length ? '<p class="suave pequeno" style="margin:-8px 0 14px">Arquivos também em: ' +
        outrosMeses.map((m) => '<a href="' + base + m + '">' + U.nomeCompetencia(m + '-01') + '</a>').join(' · ') + '</p>' : '') +
      '<div class="cartao checklist" id="checklist"></div>' +
      '<h2 style="margin:22px 0 12px">Passos</h2>' +
      '<div class="grade-3" id="passos"></div>' +
      '<h2 style="margin:26px 0 12px">Arquivos de ' + U.nomeCompetencia(comp) + '</h2>' +
      '<div class="soltar" id="soltar" tabindex="0" role="button"><b>Arraste os arquivos aqui</b> ou clique para escolher<br><span class="pequeno">Razões (.xls, .xlsx, .csv), aging de contas a pagar e aging de adiantamentos. Pode subir vários de uma vez.</span></div>' +
      '<input type="file" id="escolher-arquivos" multiple class="escondido" accept=".xls,.xlsx,.xlsm,.csv,.txt">' +
      (app().demonstracao && raiz.Demonstracao
        ? '<div class="linha-flex" style="margin-top:10px"><button type="button" class="botao" id="bt-exemplo">🧪 Usar os razões de exemplo</button>' +
          '<span class="suave pequeno">Gera os razões de fornecedores e de adiantamento da empresa de demonstração (janeiro a julho/2026), com fornecedores, CNPJs e valores inventados.</span></div>'
        : '') +
      '<div id="arquivos" style="margin-top:12px"></div>' +
      '<div id="inativos"></div>';

    el.querySelector('#mes-antes').addEventListener('click', () => app().ir(base + U.anoMes(U.somarMeses(comp, -1))));
    el.querySelector('#mes-depois').addEventListener('click', () => app().ir(base + U.anoMes(U.somarMeses(comp, 1))));

    // Passos no modelo "Conciliar A × B" (③ contas a pagar e ② adiantamentos): arquivos e registro de cada um.
    const ab = {};
    if (raiz.TelaPasso3) {
      for (const id of Object.keys(raiz.TelaPasso3.PASSOS_AB)) {
        const cfg = raiz.TelaPasso3.configDoPasso(id);
        ab[id] = { cfg, arqs: raiz.TelaPasso3.arquivosDoPasso(metas, comp, id),
          registro: concs.find((c) => c.id === 'F-' + codigo + '-' + cfg.tipo + '-' + U.anoMes(comp)) || null };
      }
    }
    const inativos = passosInativos(emp, fam);
    desenharChecklist(el.querySelector('#checklist'), codigo, comp, checklist, fam, inativos);
    desenharPassos(el.querySelector('#passos'), codigo, comp, fam, arqs, completo, passo1, ab, inativos);
    desenharArquivos(el.querySelector('#arquivos'), doMes);
    desenharInativos(el.querySelector('#inativos'), fam, inativos);
    const alternar = (ev) => {
      const b = ev.target.closest('[data-inativar], [data-ativar]');
      if (!b) return;
      const inativar = b.hasAttribute('data-inativar');
      alternarPasso(codigo, fam, b.getAttribute(inativar ? 'data-inativar' : 'data-ativar'), inativar, b);
    };
    el.querySelector('#passos').addEventListener('click', alternar);
    el.querySelector('#inativos').addEventListener('click', alternar);

    // Subir arquivo continua liberado mesmo com o checklist pendente (Parte 7.1).
    const zona = el.querySelector('#soltar');
    const input = el.querySelector('#escolher-arquivos');
    // Depois de subir: se tudo foi para outra competência, a tela vai para ela (senão o arquivo "sumiria" da vista).
    const subir = (lista) => raiz.TelaSubir.abrir(codigo, Array.from(lista), {
      competencia: comp,
      aoTerminar: (fim) => {
        const comps = (fim && fim.competencias) || [];
        const guardados = (fim && fim.guardados) || [];
        // Aging do mês anterior subido daqui (ex.: aging de julho estando em agosto): ele é o saldo
        // inicial do ③ deste mês, então a tela fica aqui (antes ia para julho e parecia que não pegou).
        const compAnterior = U.somarMeses(comp, -1);
        const soDoMesOuAgingAnterior = guardados.length && guardados.every((g) => g.competencia === comp || (g.competencia === compAnterior && (g.tipo === 'financeiro_pagar' || g.tipo === 'financeiro_adiantamento')));
        if (soDoMesOuAgingAnterior && guardados.some((g) => g.competencia === compAnterior)) {
          T.avisoRapido('Aging de ' + U.nomeCompetencia(compAnterior) + ' guardado: é o aging do mês anterior do Passo ③ de ' + U.nomeCompetencia(comp) + '.', 'ok', 6000);
          app().mostrarRota();
        } else if (comps.length && comps.indexOf(comp) < 0) {
          const destino = comps.slice().sort().reverse()[0];
          T.avisoRapido('Os arquivos foram guardados em ' + U.nomeCompetencia(destino) + ': abrindo essa competência.', 'ok', 5000);
          app().ir(base + U.anoMes(destino));
        } else {
          app().mostrarRota();
        }
      },
    });
    zona.addEventListener('click', () => input.click());
    const btExemplo = el.querySelector('#bt-exemplo');
    if (btExemplo) {
      btExemplo.addEventListener('click', () => {
        const razoes = raiz.Demonstracao.gerarRazoes();
        subir(razoes.map((x) => new File([x.bytes], x.nome, { type: 'application/vnd.ms-excel' })));
      });
    }
    zona.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files.length) subir(input.files); input.value = ''; });
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('por-cima'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('por-cima'));
    zona.addEventListener('drop', (ev) => {
      ev.preventDefault();
      zona.classList.remove('por-cima');
      if (ev.dataTransfer && ev.dataTransfer.files.length) subir(ev.dataTransfer.files);
    });
    el.querySelector('#passos').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-subir]');
      if (b) input.click();
    });
    el.querySelector('#arquivos').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-apagar]');
      if (!b) return;
      const meta = doMes.find((m) => m.id === b.getAttribute('data-apagar'));
      const sim = await T.confirmar({
        titulo: 'Apagar este arquivo?',
        texto: '<b>' + T.esc(meta.arquivo) + '</b>' + (meta.conta ? ' · conta ' + T.esc(meta.conta.codigo + ' ' + meta.conta.nome) : '') +
          '<br><br>Ele sai das listas e dos passos desta competência. A cópia vai para a pasta <b>_apagados</b> dentro da pasta de dados (nada some de verdade).',
        botao: 'Apagar', perigo: true,
      });
      if (!sim) return;
      try {
        await arm.apagarArquivo(meta.id);
        T.avisoRapido('Arquivo apagado: ' + meta.arquivo, 'ok');
        app().mostrarRota();
      } catch (e) {
        T.avisoRapido(T.mensagemDeErro(e), 'erro');
      }
    });
  }

  // ------------------------------------------------------------------
  // Passos inativos (Dony, 14/09/2026): cada empresa pode inativar, por família, o passo que
  // não usa (ex.: ① sem conta de adiantamento). O cartão sai da grade e fica escondido lá
  // embaixo, em "Passos inativos", com o botão Ativar para quando passar a ter.
  // ------------------------------------------------------------------
  function passosInativos(emp, fam) {
    return new Set(((emp && emp.passosInativos) || {})[fam.id] || []);
  }

  async function alternarPasso(codigo, fam, passoId, inativar, botao) {
    const p = fam.passos.find((x) => x.id === passoId);
    if (!p) return;
    const arm = app().armazenamento;
    if (botao) botao.disabled = true;
    try {
      // Reler antes de gravar: outra pessoa pode ter mexido no cadastro.
      const emp = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo));
      const todos = Object.assign({}, emp.passosInativos || {});
      const daFamiliaAtual = new Set(todos[fam.id] || []);
      if (inativar) daFamiliaAtual.add(passoId); else daFamiliaAtual.delete(passoId);
      todos[fam.id] = Array.from(daFamiliaAtual);
      await arm.salvarEmpresa(Object.assign({}, emp, { passosInativos: todos }));
      await arm.registrarNoLog({ codigo, acao: inativar ? 'passo-inativado' : 'passo-ativado', alvo: fam.id + '/' + passoId, detalhe: p.numero + ' ' + p.titulo });
      T.avisoRapido(inativar
        ? p.numero + ' ' + p.titulo + ': inativado nesta empresa. Para voltar, lá embaixo em "Passos inativos".'
        : p.numero + ' ' + p.titulo + ': ativado de novo.', 'ok', 5000);
      app().mostrarRota();
    } catch (e) {
      if (botao) botao.disabled = false;
      T.avisoRapido(T.mensagemDeErro(e), 'erro');
    }
  }

  function desenharInativos(el, fam, inativos) {
    const lista = fam.passos.filter((p) => inativos.has(p.id));
    if (!lista.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<details class="cartao inativos"><summary>Passos inativos nesta empresa (' + lista.length + ')</summary>' +
      '<p class="suave pequeno" style="margin:4px 0 8px">Não aparecem na grade de passos. Ative quando a empresa passar a usar.</p>' +
      lista.map((p) => '<div class="linha-inativo"><span class="numero">' + p.numero + '</span>' +
        '<span style="flex:1"><b>' + T.esc(p.titulo) + '</b><br><span class="suave pequeno">' + T.esc(p.texto) + '</span></span>' +
        '<button type="button" class="botao pequeno" data-ativar="' + p.id + '">Ativar</button></div>').join('') +
      '</details>';
  }

  function desenharChecklist(el, codigo, comp, registro, fam, inativos) {
    const podeMarcar = app().usuario.podeLancar !== false;
    const decisoes = (registro && registro.decisoes) || {};
    const completo = checklistCompleto(registro);
    const alguemEspera = fam.passos.some((p) => p.construido && !p.semChecklist && !(inativos && inativos.has(p.id)));
    el.innerHTML = '<div class="linha-flex" style="margin-bottom:6px"><h3>Antes de conciliar</h3>' +
      (completo ? '<span class="pilula verde">liberado</span>'
        : '<span class="pilula cinza">' + (alguemEspera ? 'os passos esperam os dois itens' : 'nenhum passo ativo depende destes itens') + '</span>') + '</div>' +
      fam.checklist.map((item) => {
        const d = decisoes[item.id] || {};
        return '<label class="item"><input type="checkbox" data-item="' + item.id + '"' + (d.ok ? ' checked' : '') + (podeMarcar ? '' : ' disabled') + '>' +
          '<span><span>' + T.esc(item.texto) + '</span>' +
          (d.quem ? '<br><span class="suave pequeno">' + (d.ok ? 'Marcado' : 'Desmarcado') + ' por ' + T.esc(d.quem) + ' em ' + U.dataHoraLocal(d.quando) + '</span>' : '') +
          '</span></label>';
      }).join('');
    el.addEventListener('change', async (ev) => {
      const cx = ev.target.closest('[data-item]');
      if (!cx) return;
      const item = cx.getAttribute('data-item');
      const marcar = cx.checked;
      if (!marcar) {
        const sim = await T.confirmar({ titulo: 'Desmarcar este item?', texto: 'Desmarcar trava de novo os passos desta competência até o item ser marcado outra vez.', botao: 'Desmarcar', perigo: true });
        if (!sim) { cx.checked = true; return; }
      }
      try {
        // Reler antes de gravar: outra pessoa pode ter acabado de marcar o outro item.
        const arm = app().armazenamento;
        const id = idChecklist(codigo, comp);
        const atual = (await arm.conciliacoes(codigo, comp)).find((c) => c.id === id) ||
          { id, codigo, tipo: 'fornecedor_checklist', competencia: comp, situacao: 'andamento', arquivos: [], decisoes: { historico: [] }, resumo: {} };
        const quem = app().usuario.nome;
        const quando = U.agoraISO();
        atual.decisoes = atual.decisoes || {};
        atual.decisoes[item] = { ok: marcar, quem, quando };
        atual.decisoes.historico = (atual.decisoes.historico || []).concat([{ item, ok: marcar, quem, quando }]).slice(-50);
        atual.resumo = { completo: checklistCompleto(atual) };
        await arm.salvarConciliacao(atual);
        await arm.registrarNoLog({ codigo, acao: marcar ? 'checklist-marcado' : 'checklist-desmarcado', alvo: id, detalhe: item });
        app().mostrarRota();
      } catch (e) {
        cx.checked = !marcar;
        T.avisoRapido(T.mensagemDeErro(e), 'erro');
      }
    });
  }

  function botaoInativar(p) {
    return '<button type="button" class="botao pequeno leve inativar" data-inativar="' + p.id + '" title="Esta empresa não usa este passo: ele sai daqui e fica em Passos inativos, lá embaixo">Inativar</button>';
  }

  function desenharPassos(el, codigo, comp, fam, arqs, completo, passo1, ab, inativos) {
    const base = '#/empresa/' + encodeURIComponent(codigo) + '/fornecedores/' + U.anoMes(comp) + '/';
    const ativos = fam.passos.filter((p) => !inativos.has(p.id));
    if (!ativos.length) {
      el.innerHTML = '<div class="cartao"><div class="vazio">Todos os passos desta família estão inativos nesta empresa. Ative em "Passos inativos", lá embaixo.</div></div>';
      return;
    }
    el.innerHTML = ativos.map((p) => {
      if (!p.construido) {
        return '<div class="cartao passo em-construcao"><div class="linha-flex"><span class="numero">' + p.numero + '</span><h3 style="flex:1">' + T.esc(p.titulo) + '</h3></div>' +
          '<p class="suave" style="line-height:1.5">' + T.esc(p.texto) + '</p>' +
          '<div class="acoes"><span class="pilula cinza">em construção · Etapa ' + p.etapa + '</span>' + botaoInativar(p) + '</div></div>';
      }
      if (ab[p.id]) return cartaoAB(p, codigo, comp, base, ab[p.id]);
      const temF = arqs.F.length > 0;
      const temA = arqs.A.length > 0;
      const itens = [
        '<li>' + (temF ? '<span class="ok">✓</span>' : '<span class="falta">✗</span>') + '<span>Razão de fornecedores' +
          (temF ? ' <span class="suave pequeno">(' + arqs.F.map((m) => T.esc(m.conta.codigo)).join(', ') + ')</span>' : ' <span class="falta pequeno">falta</span>') + '</span></li>',
        '<li>' + (temA ? '<span class="ok">✓</span>' : '<span class="falta">✗</span>') + '<span>Razão de adiantamento a fornecedores' +
          (temA ? ' <span class="suave pequeno">(' + arqs.A.map((m) => T.esc(m.conta.codigo)).join(', ') + ')</span>' : ' <span class="falta pequeno">falta</span>') + '</span></li>',
        '<li>' + (arqs.pagar ? '<span class="ok">✓</span>' : '<span class="fraco">·</span>') + '<span>Contas a pagar em aberto <span class="selo opcional">opcional</span></span></li>',
      ];
      let estado, pode = false, porque = '';
      if (!completo) { estado = '<span class="pilula cinza">espera o checklist</span>'; porque = 'Marque os dois itens de "Antes de conciliar".'; }
      else if (!temF || !temA) { estado = '<span class="pilula ambar">falta arquivo</span>'; porque = 'Suba o razão de fornecedores e o de adiantamento desta competência.'; }
      else if (passo1) { estado = '<span class="pilula azul">em andamento</span>'; pode = true; }
      else { estado = '<span class="pilula verde">pronta para conciliar</span>'; pode = true; }
      const r = passo1 && passo1.resumo;
      const resumo = r && r.arquivo ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo1.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo1.atualizadoEm) +
        '<br>' + r.aceitas + ' reclassificação(ões) marcadas · arquivo com ' + r.arquivo.lancamentos + ' lançamento(s), ' + T.moeda(r.arquivo.total) + '</p>' : '';
      return '<div class="cartao passo"><div class="linha-flex"><span class="numero">' + p.numero + '</span><h3 style="flex:1">' + T.esc(p.titulo) + '</h3>' + estado + '</div>' +
        '<p class="suave" style="line-height:1.5">' + T.esc(p.texto) + '</p><ul class="precisa">' + itens.join('') + '</ul>' + resumo +
        (porque ? '<p class="pequeno" style="color:var(--ambar)">' + T.esc(porque) + '</p>' : '') +
        '<div class="acoes">' + (pode ? '<a class="botao primario" href="' + base + 'passo1">Abrir →</a>' : '<span class="botao primario travado" title="' + T.esc(porque) + '">Abrir →</span>') +
        '<button type="button" class="botao" data-subir>Subir o razão</button>' + botaoInativar(p) + '</div></div>';
    }).join('');
  }

  // Cartão de um passo A × B (③ contas a pagar ou ② adiantamentos): precisa do aging do mês
  // passado, do aging do mês e do razão da conta.
  function cartaoAB(p, codigo, comp, base, dados) {
    const cfg = dados.cfg, arqsAB = dados.arqs, passo3 = dados.registro;
    const maiuscula = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
    const temAnt = !!arqsAB.agingAnterior, temAtu = !!arqsAB.agingAtual, temRaz = !!arqsAB.razao;
    const pode = temAnt && temAtu && temRaz;
    const itens = [
      linhaPrecisa(temAnt, maiuscula(cfg.nomeAging) + ' de ' + U.nomeCompetencia(U.somarMeses(comp, -1))),
      linhaPrecisa(temAtu, maiuscula(cfg.nomeAging) + ' de ' + U.nomeCompetencia(comp)),
      linhaPrecisa(temRaz, maiuscula(cfg.nomeRazao) + ' de ' + U.nomeCompetencia(comp)),
    ];
    let estado, porque = '';
    if (pode && passo3) estado = '<span class="pilula azul">em andamento</span>';
    else if (pode) estado = '<span class="pilula verde">pronta para conciliar</span>';
    else { estado = '<span class="pilula ambar">falta arquivo</span>'; porque = 'Suba os dois ' + cfg.nomeAging.replace(/^aging/, 'agings') + ' e o ' + cfg.nomeRazao + '.'; }
    const rs = passo3 && passo3.resumo;
    // Com o Conciliar A × B gravado, o resumo é o dele (conciliações e o que sobra em aberto).
    const resumo = rs && typeof rs.conciliacoesAB === 'number'
      ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo3.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo3.atualizadoEm) +
        '<br>' + rs.conciliacoesAB + ' conciliação(ões) com ID · em aberto: ' + rs.abertosA + ' na A e ' + rs.abertosB + ' na B · diferença ' + T.moeda(rs.diferencaAB) + '</p>'
      : rs && typeof rs.diferenca === 'number'
        ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo3.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo3.atualizadoEm) +
          '<br>' + rs.batem + ' batem · ' + rs.comDiferenca + ' com diferença · diferença ' + T.moeda(rs.diferenca) + '</p>' : '';
    return '<div class="cartao passo"><div class="linha-flex"><span class="numero">' + p.numero + '</span><h3 style="flex:1">' + T.esc(p.titulo) + '</h3>' + estado + '</div>' +
      '<p class="suave" style="line-height:1.5">' + T.esc(p.texto) + '</p><ul class="precisa">' + itens.join('') + '</ul>' + resumo +
      (porque ? '<p class="pequeno" style="color:var(--ambar)">' + T.esc(porque) + '</p>' : '') +
      '<div class="acoes">' + (pode ? '<a class="botao primario" href="' + base + p.id + '">Abrir →</a>' : '<span class="botao primario travado" title="' + T.esc(porque) + '">Abrir →</span>') +
      (pode && passo3 ? '<a class="botao" href="' + base + p.id + '-relatorio" title="Relatório da conciliação para imprimir, salvar em PDF ou baixar em Excel">📄 Relatório</a>' : '') +
      '<button type="button" class="botao" data-subir>Subir arquivo</button>' + botaoInativar(p) + '</div></div>';
  }
  function linhaPrecisa(tem, texto) {
    return '<li>' + (tem ? '<span class="ok">✓</span>' : '<span class="falta">✗</span>') + '<span>' + T.esc(texto) + (tem ? '' : ' <span class="falta pequeno">falta</span>') + '</span></li>';
  }

  function desenharArquivos(el, doMes) {
    if (!doMes.length) {
      el.innerHTML = '<div class="cartao"><div class="vazio">Nenhum arquivo desta família nesta competência.</div></div>';
      return;
    }
    const lista = doMes.slice().sort((a, b) => U.paraMs(b.enviadoEm) - U.paraMs(a.enviadoEm));
    T.tabelaPaginada(el, {
      alta: false,
      cabecalho: '<th>Arquivo</th><th>Tipo</th><th>Conta</th><th>Período</th><th class="num">Linhas</th><th class="num">Saldo final</th><th>Enviado</th><th class="num">Versão</th><th></th>',
      linhas: lista,
      linha: (m) => {
        const tipo = m.tipo === 'razao' ? 'Razão · ' + (m.conta.papel === 'principal' ? 'fornecedores' : 'adiantamento') : raiz.Leitor.NOMES_DOS_TIPOS[m.tipo] || m.tipo;
        return '<tr><td class="nome">' + T.esc(m.arquivo) + (m.original && m.original !== m.arquivo ? '<br><span class="suave pequeno">guardado como ' + T.esc(m.original) + '</span>' : '') + '</td>' +
          '<td>' + T.esc(tipo) + '</td><td>' + (m.conta ? T.esc(m.conta.codigo + ' · ' + m.conta.nome) : '—') + '</td>' +
          '<td class="num">' + (m.periodo ? T.esc(m.periodo.de + ' a ' + m.periodo.ate) : '—') + '</td>' +
          '<td class="num">' + (m.tipo === 'razao' ? (m.lancamentos || 0) : (m.titulos || 0)) + '</td>' +
          (m.tipo === 'razao' ? T.tdValor(m.saldoFinal) : T.tdValor(m.total)) +
          '<td>' + T.esc(m.enviadoPor || '') + '<br><span class="suave pequeno">' + U.dataHoraLocal(m.enviadoEm) + '</span></td>' +
          '<td class="num">' + (m.versao > 1 ? '<span class="pilula ambar">versão ' + m.versao + '</span>' : '1') + '</td>' +
          '<td class="num"><button class="botao pequeno perigo" data-apagar="' + T.esc(m.id) + '">Apagar</button></td></tr>';
      },
    });
  }

  raiz.TelaFamilia = { mostrar, arquivosDoPasso1, checklistCompleto, idChecklist, idPasso1 };
})(self);
