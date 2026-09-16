/*
 * Conciliador Solutta — tela-familia.js
 * Família (Fornecedores): competência ‹ mês ›, nota "Primeiro fechamento" ou "Mês a mês",
 * checklist "Antes de conciliar" e cartões dos passos (Parte 7.0, 7.1 e 8). Os arquivos sobem e
 * aparecem dentro de cada passo, cada um no seu lugar (tela-subir.js).
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
      // Tela limpa (Dony, 15/09/2026): os arquivos sobem e aparecem DENTRO de cada passo.
      '<div class="cartao checklist" id="checklist"></div>' +
      '<h2 style="margin:22px 0 12px">Passos</h2>' +
      '<div class="grade-3" id="passos"></div>' +
      '<div id="inativos"></div>';

    el.querySelector('#mes-antes').addEventListener('click', () => app().ir(base + U.anoMes(U.somarMeses(comp, -1))));
    el.querySelector('#mes-depois').addEventListener('click', () => app().ir(base + U.anoMes(U.somarMeses(comp, 1))));

    // Passos no modelo "Conciliar A × B" (③ contas a pagar e ② adiantamentos): arquivos e registro de cada um.
    const ab = {};
    if (raiz.TelaPasso3) {
      for (const id of Object.keys(raiz.TelaPasso3.PASSOS_AB)) {
        const cfg = raiz.TelaPasso3.configDoPasso(id);
        const registro = concs.find((c) => c.id === 'F-' + codigo + '-' + cfg.tipo + '-' + U.anoMes(comp)) || null;
        // O período escolhido dentro do passo fica no registro dele.
        ab[id] = { cfg, registro, arqs: raiz.TelaPasso3.arquivosDoPasso(metas, comp, id, { de: registro && registro.decisoes && registro.decisoes.periodoDe }) };
      }
    }
    const inativos = passosInativos(emp, fam);
    desenharChecklist(el.querySelector('#checklist'), codigo, comp, checklist, fam, inativos);
    desenharPassos(el.querySelector('#passos'), codigo, comp, fam, arqs, completo, passo1, ab, inativos);
    desenharInativos(el.querySelector('#inativos'), fam, inativos);
    const alternar = (ev) => {
      const b = ev.target.closest('[data-inativar], [data-ativar]');
      if (!b) return;
      const inativar = b.hasAttribute('data-inativar');
      alternarPasso(codigo, fam, b.getAttribute(inativar ? 'data-inativar' : 'data-ativar'), inativar, b);
    };
    el.querySelector('#passos').addEventListener('click', alternar);
    el.querySelector('#inativos').addEventListener('click', alternar);
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
      if (!completo) { estado = '<span class="pilula cinza">espera o checklist</span>'; porque = 'Marque os dois itens de "Antes de conciliar"' + (temF && temA ? '.' : ' (os razões já podem subir dentro do passo).'); }
      else if (!temF || !temA) { estado = '<span class="pilula ambar">falta arquivo</span>'; porque = 'Abra o passo e suba cada razão no lugar dele.'; }
      else if (passo1) { estado = '<span class="pilula azul">em andamento</span>'; pode = true; }
      else { estado = '<span class="pilula verde">pronta para conciliar</span>'; pode = true; }
      const r = passo1 && passo1.resumo;
      const resumo = r && r.arquivo ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo1.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo1.atualizadoEm) +
        '<br>' + r.aceitas + ' reclassificação(ões) marcadas · arquivo com ' + r.arquivo.lancamentos + ' lançamento(s), ' + T.moeda(r.arquivo.total) + '</p>' : '';
      return '<div class="cartao passo"><div class="linha-flex"><span class="numero">' + p.numero + '</span><h3 style="flex:1">' + T.esc(p.titulo) + '</h3>' + estado + '</div>' +
        '<p class="suave" style="line-height:1.5">' + T.esc(p.texto) + '</p><ul class="precisa">' + itens.join('') + '</ul>' + resumo +
        (porque ? '<p class="pequeno" style="color:var(--ambar)">' + T.esc(porque) + '</p>' : '') +
        // Os razões sobem DENTRO do passo (Dony, 15/09/2026): Abrir fica sempre liberado.
        '<div class="acoes"><a class="botao primario" href="' + base + 'passo1">' + (temF && temA ? 'Abrir →' : '📁 Abrir e subir arquivos') + '</a>' + botaoInativar(p) + '</div></div>';
    }).join('');
  }

  // Cartão de um passo A × B (③ contas a pagar ou ② adiantamentos): precisa do aging do mês
  // passado, do aging do mês e do razão da conta.
  function cartaoAB(p, codigo, comp, base, dados) {
    const cfg = dados.cfg, arqsAB = dados.arqs, passo3 = dados.registro;
    const maiuscula = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
    const temAnt = !!arqsAB.agingAnterior, temAtu = !!arqsAB.agingAtual, temRaz = !!arqsAB.razao;
    const pode = temAnt && temAtu && temRaz;
    // Conciliação de período (razão guardado neste mês começando antes): o aging anterior é o do mês
    // antes do começo do razão (ex.: razão de abril a agosto → aging de março).
    const compAnterior = arqsAB.compAnterior || U.somarMeses(comp, -1);
    const itens = [
      linhaPrecisa(temAnt, maiuscula(cfg.nomeAging) + ' de ' + U.nomeCompetencia(compAnterior)),
      linhaPrecisa(temAtu, maiuscula(cfg.nomeAging) + ' de ' + U.nomeCompetencia(comp)),
      linhaPrecisa(temRaz, maiuscula(cfg.nomeRazao) + ' de ' + (arqsAB.periodo
        ? (arqsAB.periodo.de.slice(0, 4) === comp.slice(0, 4) ? U.nomeCompetencia(arqsAB.periodo.de).replace(/\/\d{4}$/, '') : U.nomeCompetencia(arqsAB.periodo.de)) + ' a ' : '') + U.nomeCompetencia(comp)),
    ];
    let estado, porque = '';
    if (pode && passo3) estado = '<span class="pilula azul">em andamento</span>';
    else if (pode) estado = '<span class="pilula verde">pronta para conciliar</span>';
    else { estado = '<span class="pilula ambar">falta arquivo</span>'; porque = 'Abra o passo, escolha o período e suba cada arquivo no lugar dele.'; }
    const rs = passo3 && passo3.resumo;
    // Natureza (D/C) no lugar do sinal, como na conciliação.
    const comDC = (c) => T.valorDC(c, raiz.MotorTerceiro.ladoDC(c, cfg.natureza));
    // Com o Conciliar A × B gravado, o resumo é o dele (conciliações e o que sobra em aberto).
    const resumo = rs && typeof rs.conciliacoesAB === 'number'
      ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo3.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo3.atualizadoEm) +
        '<br>' + rs.conciliacoesAB + ' conciliação(ões) com ID · em aberto: ' + rs.abertosA + ' na A e ' + rs.abertosB + ' na B · diferença R$ ' + comDC(rs.diferencaAB) + '</p>'
      : rs && typeof rs.diferenca === 'number'
        ? '<p class="suave pequeno">Última gravação: ' + T.esc(passo3.atualizadoPor || '') + ' em ' + U.dataHoraLocal(passo3.atualizadoEm) +
          '<br>' + rs.batem + ' batem · ' + rs.comDiferenca + ' com diferença · diferença R$ ' + comDC(rs.diferenca) + '</p>' : '';
    return '<div class="cartao passo"><div class="linha-flex"><span class="numero">' + p.numero + '</span><h3 style="flex:1">' + T.esc(p.titulo) + '</h3>' + estado + '</div>' +
      '<p class="suave" style="line-height:1.5">' + T.esc(p.texto) + '</p><ul class="precisa">' + itens.join('') + '</ul>' + resumo +
      (porque ? '<p class="pequeno" style="color:var(--ambar)">' + T.esc(porque) + '</p>' : '') +
      // Os arquivos destes passos sobem DENTRO do passo (Dony, 15/09/2026): Abrir fica sempre liberado.
      '<div class="acoes"><a class="botao primario" href="' + base + p.id + '">' + (pode ? 'Abrir →' : '📁 Abrir e subir arquivos') + '</a>' +
      (pode && passo3 ? '<a class="botao" href="' + base + p.id + '-relatorio" title="Relatório da conciliação para imprimir, salvar em PDF ou baixar em Excel">📄 Relatório</a>' : '') +
      botaoInativar(p) + '</div></div>';
  }
  function linhaPrecisa(tem, texto) {
    return '<li>' + (tem ? '<span class="ok">✓</span>' : '<span class="falta">✗</span>') + '<span>' + T.esc(texto) + (tem ? '' : ' <span class="falta pequeno">falta</span>') + '</span></li>';
  }

  raiz.TelaFamilia = { mostrar, arquivosDoPasso1, checklistCompleto, idChecklist, idPasso1 };
})(self);
