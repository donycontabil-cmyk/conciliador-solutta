/*
 * Conciliador Solutta — tela-subir.js
 * Subir arquivos (Parte 5.1 e 8): lê cada arquivo pelo CONTEÚDO, mostra o que foi lido
 * ANTES de guardar (empresa, período, contas, lançamentos, saldos e a conferência),
 * confirma a competência e diz o que cada arquivo virou.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }

  function mesesDoPeriodo(periodo) {
    const de = periodo && U.lerData(periodo.de);
    const ate = periodo && U.lerData(periodo.ate);
    if (!de || !ate) return [];
    const r = [];
    let c = U.competenciaDe(de);
    const fim = U.competenciaDe(ate);
    for (let i = 0; i < 60 && c <= fim; i++) { r.push(c); c = U.somarMeses(c, 1); }
    return r;
  }

  function opcoesDeCompetencia(selecionada, sugeridas) {
    const base = new Set(sugeridas.filter(Boolean));
    const centro = selecionada || U.competenciaDe(U.hoje());
    for (let i = -12; i <= 2; i++) base.add(U.somarMeses(centro, i));
    return Array.from(base).sort().reverse().map((c) => '<option value="' + c + '"' + (c === selecionada ? ' selected' : '') + '>' + U.nomeCompetencia(c) + '</option>').join('');
  }

  function cartaoDoResultado(r, i, empresa, competenciaDaTela) {
    const cab = '<div class="titulo-lido"><h3 style="flex:1">' + T.esc(r.nomeArquivo) + '</h3>';
    if (r.tipo === 'razao') {
      const rz = r.razao;
      const meses = mesesDoPeriodo(rz.periodo);
      const comp = r.competencia || competenciaDaTela;
      const outraEmpresa = rz.cnpj && empresa.cnpj && rz.cnpj.slice(0, 8) !== String(empresa.cnpj).slice(0, 8);
      const semPapel = r.contas.filter((c) => !c.papel.familia);
      const linhasContas = r.contas.map((c, k) => {
        const usa = !!c.papel.familia;
        // Papel da conta: o que o programa reconheceu (ou o escolhido antes para esta empresa), e dá
        // para trocar — conta com nome cortado no razão ("ADIANTAMENTO A") não fica de fora.
        const celulaPapel = c.papel.familia === 'financeiro'
          ? '<span class="pilula azul" title="' + T.esc(c.papel.regra) + '">Banco</span>'
          : '<select class="filtro papel-conta" data-papel="' + i + ':' + k + '" title="' + T.esc((c.papel.escolhido ? 'Escolhido antes para esta empresa. ' : '') + (c.papel.regra || '')) + '">' +
            [['', 'fica de fora']].concat(raiz.Familias.PAPEIS_ESCOLHIVEIS.map((p) => [p.familia + '/' + p.papel, p.texto])).map((o) =>
              '<option value="' + o[0] + '"' + ((usa ? c.papel.familia + '/' + c.papel.papel : '') === o[0] ? ' selected' : '') + '>' + T.esc(o[1]) + '</option>').join('') + '</select>' +
            (c.papel.escolhido ? ' <span class="selo mao" title="Escolhido à mão para esta empresa">escolhido</span>' : '');
        return '<tr><td class="caixa"><input type="checkbox" data-conta="' + i + ':' + k + '"' + (usa ? ' checked' : ' disabled') + '></td>' +
          '<td>' + T.esc(c.codigo) + '</td><td>' + T.esc(c.classificacao || '—') + '</td><td class="nome">' + T.esc(c.nome) + '</td>' +
          '<td>' + celulaPapel + '</td>' +
          '<td class="num">' + c.lancamentos.length.toLocaleString('pt-BR') + '</td>' + T.tdValor(c.saldoAnterior) + T.tdValor(c.totalDebito) + T.tdValor(c.totalCredito) + T.tdValor(c.saldoFinal) +
          '<td>' + (c.confere ? '<span class="pilula verde" title="Saldo anterior + débitos − créditos = saldo final do razão, linha a linha">confere</span>' :
            '<span class="pilula vermelho" title="' + T.esc(c.avisos.join(' ')) + '">não confere</span>') + '</td></tr>';
      }).join('');
      return '<div class="cartao lido" data-i="' + i + '">' + cab + '<span class="pilula verde">' + T.esc(r.nomeDoTipo) + '</span></div>' +
        '<dl><dt>Empresa no arquivo</dt><dd>' + T.nome(rz.empresa) + (rz.cnpj ? ' · CNPJ ' + U.formatarCnpj(rz.cnpj) : '') + '</dd>' +
        '<dt>Período</dt><dd>' + (rz.periodo ? T.esc(rz.periodo.de + ' a ' + rz.periodo.ate) : '—') +
        (rz.periodoOrigem === 'nome-do-arquivo' ? ' <span class="pilula ambar">pelo nome do arquivo: confirme</span>' : '') +
        (rz.periodoOrigem === 'datas-dos-lancamentos' ? ' <span class="pilula ambar">pelas datas dos lançamentos: confirme</span>' : '') + '</dd>' +
        '<dt>Competência</dt><dd><select class="filtro" data-competencia="' + i + '">' + opcoesDeCompetencia(comp, meses) + '</select>' +
        (r.variosMeses ? ' <span class="suave pequeno">razão de vários meses: guardado na competência escolhida (a do fim do período, por padrão)</span>' : '') + '</dd></dl>' +
        (outraEmpresa ? '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div>O CNPJ deste razão (' + U.formatarCnpj(rz.cnpj) + ') é de outra empresa: a aberta é ' +
          T.esc(empresa.nome) + ' (' + U.formatarCnpj(empresa.cnpj) + '). <label><input type="checkbox" data-mesmo-assim="' + i + '"> Guardar mesmo assim</label></div></div>' : '') +
        r.avisos.map((a) => '<div class="aviso ambar"><span class="icone-aviso">ℹ️</span><div>' + T.esc(a) + '</div></div>').join('') +
        '<div class="tabela-caixa" style="margin-top:10px"><table class="tabela"><thead><tr><th class="caixa">Guardar</th><th>Código</th><th>Classificação</th><th>Conta</th><th>Papel</th>' +
        '<th class="num">Lançamentos</th><th class="num">Saldo anterior</th><th class="num">Débitos</th><th class="num">Créditos</th><th class="num">Saldo final</th><th>Conferência</th></tr></thead><tbody>' +
        linhasContas + '</tbody></table></div>' +
        (semPapel.length ? '<p class="suave pequeno" style="margin-top:6px">Contas que ficam de fora (nenhuma conciliação usa): ' + semPapel.map((c) => T.esc(c.codigo + ' ' + c.nome)).join(', ') + '.</p>' : '') +
        '<p class="suave pequeno" style="margin-top:6px">Saldos no sentido débito − crédito (negativo = credor), como no razão.</p>' +
        '</div>';
    }
    if (r.tipo === 'financeiro_pagar' || r.tipo === 'financeiro_receber' || r.tipo === 'financeiro_adiantamento') {
      const f = r.financeiro;
      // Aberto de uma competência (ex.: agosto): atalho para dizer se o aging é o do mês ou o do
      // mês anterior (Dony, 15/09/2026: "subir o aging do mês anterior, o do fechamento de julho").
      const atalhos = competenciaDaTela
        ? '<div class="atalhos-competencia"><span class="suave pequeno">Este aging é:</span>' +
          '<button type="button" class="botao pequeno" data-atalho-comp="' + i + '" data-valor="' + competenciaDaTela + '">do mês · ' + U.nomeCompetencia(competenciaDaTela) + '</button>' +
          '<button type="button" class="botao pequeno" data-atalho-comp="' + i + '" data-valor="' + U.somarMeses(competenciaDaTela, -1) + '">do mês anterior · ' + U.nomeCompetencia(U.somarMeses(competenciaDaTela, -1)) + '</button>' +
          '<span class="suave pequeno">(o do mês anterior é a Parte B dele e entra como saldo inicial de ' + U.nomeCompetencia(competenciaDaTela) + ')</span></div>'
        : '';
      const sugeridas = competenciaDaTela ? [competenciaDaTela, U.somarMeses(competenciaDaTela, -1)] : [];
      return '<div class="cartao lido" data-i="' + i + '">' + cab + '<span class="pilula verde">' + T.esc(r.nomeDoTipo) + '</span></div>' +
        '<dl><dt>Tipo</dt><dd><select class="filtro" data-tipo="' + i + '"><option value="financeiro_pagar"' + (r.tipo === 'financeiro_pagar' ? ' selected' : '') + '>Contas a pagar em aberto</option>' +
        '<option value="financeiro_adiantamento"' + (r.tipo === 'financeiro_adiantamento' ? ' selected' : '') + '>Adiantamentos a fornecedores em aberto (Passo ②)</option>' +
        '<option value="financeiro_receber"' + (r.tipo === 'financeiro_receber' ? ' selected' : '') + '>Contas a receber em aberto</option></select></dd>' +
        '<dt>Posição</dt><dd>' + (f.posicao ? T.esc(f.posicao) : '<span class="suave">o relatório não diz a data da posição</span>') + '</dd>' +
        '<dt>Competência</dt><dd><select class="filtro" data-competencia="' + i + '">' + opcoesDeCompetencia(r.competencia || competenciaDaTela, sugeridas) + '</select> ' +
        '<span class="pilula ambar" title="O nome de um relatório pode trazer a faixa de VENCIMENTOS, não a data da posição.">confirme</span>' + atalhos + '</dd>' +
        '<dt>Títulos em aberto</dt><dd>' + f.titulos.length.toLocaleString('pt-BR') + ' · total ' + T.moeda(f.total) + ' <span class="suave pequeno">(recalculado pelos títulos)</span></dd></dl>' +
        r.avisos.map((a) => '<div class="aviso ambar"><span class="icone-aviso">ℹ️</span><div>' + T.esc(a) + '</div></div>').join('') +
        (f.descartados.length ? '<details style="margin-top:8px"><summary class="suave">' + f.descartados.length + ' linha(s) não entraram (clique para ver o motivo)</summary><ul class="pequeno">' +
          f.descartados.slice(0, 200).map((d) => '<li>linha ' + d.linha + ': ' + T.esc(d.motivo) + ' — <span class="suave">' + T.esc(d.texto.slice(0, 120)) + '</span></li>').join('') + '</ul></details>' : '') +
        '</div>';
    }
    const cor = r.tipo === 'desconhecido' ? 'vermelho' : 'ambar';
    return '<div class="cartao lido" data-i="' + i + '">' + cab + '<span class="pilula ' + cor + '">' + T.esc(r.nomeDoTipo) + ' · não será guardado</span></div>' +
      '<div class="aviso ' + cor + '"><span class="icone-aviso">⚠️</span><div>' + T.esc(r.motivo) + '</div></div>' +
      (r.previa && r.previa.length ? '<details style="margin-top:8px"><summary class="suave">Ver as primeiras linhas do arquivo</summary><div class="tabela-caixa" style="margin-top:6px"><table class="tabela"><tbody>' +
        r.previa.map((l) => '<tr>' + l.map((c) => '<td>' + T.esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>' : '') +
      '</div>';
  }

  async function abrir(codigo, arquivos, opcoes) {
    const empresa = app().empresas.find((e) => String(e.codigo) === String(codigo));
    const resultados = [];
    const corpoInicial = '<div id="lidos"><div class="carregando">Lendo ' + arquivos.length + ' arquivo(s)…</div></div>';
    let fecharJanela = null;
    let janelaEl = null;
    const promessa = T.janela({
      titulo: 'Subir arquivos · ' + empresa.codigo + ' · ' + empresa.nome,
      larga: true,
      naoFecharFora: true,
      corpo: corpoInicial,
      botoes: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar', tipo: 'primario', antes: () => guardar() }],
      aoAbrir: (j, fechar) => { fecharJanela = fechar; janelaEl = j; },
    });
    await new Promise((r) => setTimeout(r, 30));
    const lidos = janelaEl.querySelector('#lidos');
    const botaoGuardar = janelaEl.querySelector('footer .primario');
    botaoGuardar.disabled = true;

    for (let i = 0; i < arquivos.length; i++) {
      const arq = arquivos[i];
      lidos.querySelector('.carregando') && (lidos.querySelector('.carregando').textContent = 'Lendo ' + arq.name + ' (' + (i + 1) + ' de ' + arquivos.length + ')…');
      await new Promise((r) => setTimeout(r, 20));
      try {
        const bytes = await T.lerArquivoComoBytes(arq);
        const r = raiz.Leitor.ler(bytes, arq.name);
        r.bytes = bytes;
        resultados.push(r);
      } catch (e) {
        resultados.push({ nomeArquivo: arq.name, tipo: 'desconhecido', nomeDoTipo: 'Erro ao ler', motivo: T.mensagemDeErro(e), avisos: [], previa: [] });
      }
    }
    // Papel escolhido antes para esta empresa (conta que o programa não reconheceu sozinho).
    const escolhidos = (empresa && empresa.papeisDeConta) || {};
    resultados.forEach((r) => (r.contas || []).forEach((c) => {
      c.papelAutomatico = c.papel;
      const e = escolhidos[c.codigo];
      if (e && e.familia) c.papel = { familia: e.familia, papel: e.papel, regra: 'escolhido para esta empresa', banco: null, escolhido: true };
    }));
    lidos.innerHTML = resultados.map((r, i) => cartaoDoResultado(r, i, empresa, opcoes && opcoes.competencia)).join('');
    lidos.addEventListener('change', (ev) => {
      const sel = ev.target.closest('[data-papel]');
      if (!sel) return;
      const cx = lidos.querySelector('[data-conta="' + sel.getAttribute('data-papel') + '"]');
      if (cx) { cx.disabled = !sel.value; cx.checked = !!sel.value; }
    });
    lidos.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-atalho-comp]');
      if (!b) return;
      const sel = lidos.querySelector('[data-competencia="' + b.getAttribute('data-atalho-comp') + '"]');
      if (sel) { sel.value = b.getAttribute('data-valor'); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    lidos.addEventListener('change', (ev) => {
      const sel = ev.target.closest('[data-competencia]');
      if (!sel) return;
      const i = sel.getAttribute('data-competencia');
      lidos.querySelectorAll('[data-atalho-comp="' + i + '"]').forEach((b) => b.classList.toggle('primario', b.getAttribute('data-valor') === sel.value));
    });
    lidos.querySelectorAll('[data-competencia]').forEach((sel) => {
      lidos.querySelectorAll('[data-atalho-comp="' + sel.getAttribute('data-competencia') + '"]').forEach((b) => b.classList.toggle('primario', b.getAttribute('data-valor') === sel.value));
    });
    const guardaveis = resultados.filter((r) => r.tipo === 'razao' || r.tipo === 'financeiro_pagar' || r.tipo === 'financeiro_receber' || r.tipo === 'financeiro_adiantamento').length;
    botaoGuardar.disabled = guardaveis === 0;
    botaoGuardar.textContent = guardaveis ? 'Guardar ' + (guardaveis > 1 ? 'os ' + guardaveis + ' arquivos reconhecidos' : 'o arquivo reconhecido') : 'Nada para guardar';

    const competenciasGuardadas = new Set();
    const guardados = []; // { tipo, competencia } de cada arquivo guardado (para a tela saber para onde ir)
    async function guardar() {
      const arm = app().armazenamento;
      const saida = [];
      const lembrar = {}; // código da conta -> papel escolhido à mão (fica guardado na empresa)
      botaoGuardar.disabled = true;
      botaoGuardar.textContent = 'Guardando…';
      for (let i = 0; i < resultados.length; i++) {
        const r = resultados[i];
        const selComp = janelaEl.querySelector('[data-competencia="' + i + '"]');
        const comp = selComp ? selComp.value : null;
        try {
          if (r.tipo === 'razao') {
            const rz = r.razao;
            const outra = janelaEl.querySelector('[data-mesmo-assim="' + i + '"]');
            if (outra && !outra.checked) { saida.push({ arquivo: r.nomeArquivo, tipo: 'ambar', texto: 'Não guardado: o CNPJ do razão é de outra empresa (marque "Guardar mesmo assim" se estiver certo).' }); continue; }
            let guardadas = 0;
            for (let k = 0; k < r.contas.length; k++) {
              const c0 = r.contas[k];
              const cx = janelaEl.querySelector('[data-conta="' + i + ':' + k + '"]');
              const selPapel = janelaEl.querySelector('[data-papel="' + i + ':' + k + '"]');
              let c = c0;
              if (selPapel) {
                const [familia, papel] = selPapel.value ? selPapel.value.split('/') : [null, null];
                c = Object.assign({}, c0, { papel: familia ? { familia, papel, regra: 'escolhido na tela', banco: null } : { familia: null, papel: null, regra: 'fica de fora' } });
                const auto = c0.papelAutomatico || {};
                if (familia && (auto.familia !== familia || auto.papel !== papel)) lembrar[c0.codigo] = { familia, papel };
                else if (familia && escolhidos[c0.codigo]) lembrar[c0.codigo] = null; // voltou ao automático: esquece a escolha
              }
              if (!c.papel.familia) { saida.push({ arquivo: r.nomeArquivo, tipo: 'cinza', texto: 'Conta ' + c.codigo + ' ' + c.nome + ': ficou de fora (nenhuma conciliação usa).' }); continue; }
              if (!cx || !cx.checked) { saida.push({ arquivo: r.nomeArquivo, tipo: 'cinza', texto: 'Conta ' + c.codigo + ' ' + c.nome + ': desmarcada, não foi guardada.' }); continue; }
              const conta = Object.assign({}, c);
              delete conta.papel;
              const meta = {
                tipo: 'razao', arquivo: r.nomeArquivo, periodo: rz.periodo, competencia: comp, desenho: rz.desenho,
                conta: { codigo: c.codigo, classificacao: c.classificacao, nome: c.nome, papel: c.papel.papel, familia: c.papel.familia, banco: c.papel.banco },
                lancamentos: c.lancamentos.length, saldoAnterior: c.saldoAnterior, saldoFinal: c.saldoFinal, confere: c.confere,
                empresaNoArquivo: rz.empresa, cnpjNoArquivo: rz.cnpj, hashDoConteudo: r.hash,
              };
              const conteudo = { tipo: 'razao', desenho: rz.desenho, empresa: rz.empresa, cnpj: rz.cnpj, periodo: rz.periodo, periodoOrigem: rz.periodoOrigem, conta };
              const g = await arm.guardarArquivo(codigo, meta, conteudo, r.bytes);
              guardadas++;
              competenciasGuardadas.add(comp);
              guardados.push({ tipo: 'razao', competencia: comp });
              if (g.jaExistia) saida.push({ arquivo: r.nomeArquivo, tipo: 'cinza', texto: 'Conta ' + c.codigo + ': este arquivo já estava guardado (enviado por ' + g.meta.enviadoPor + ' em ' + U.dataHoraLocal(g.meta.enviadoEm) + '). Nada foi duplicado.' });
              else if (g.novaVersao) saida.push({ arquivo: r.nomeArquivo, tipo: 'ambar', texto: 'Conta ' + c.codigo + ' ' + c.nome + ': guardado como VERSÃO ' + g.meta.versao + ' em ' + U.nomeCompetencia(comp) + '. O arquivo anterior com o mesmo nome continua guardado.' });
              else saida.push({ arquivo: r.nomeArquivo, tipo: 'verde', texto: 'Conta ' + c.codigo + ' ' + c.nome + ': guardado em ' + U.nomeCompetencia(comp) + ' (' + c.lancamentos.length.toLocaleString('pt-BR') + ' lançamentos).' });
            }
            if (!guardadas && !r.contas.length) saida.push({ arquivo: r.nomeArquivo, tipo: 'ambar', texto: 'Nenhuma conta encontrada.' });
          } else if (r.tipo === 'financeiro_pagar' || r.tipo === 'financeiro_receber' || r.tipo === 'financeiro_adiantamento') {
            const selTipo = janelaEl.querySelector('[data-tipo="' + i + '"]');
            const tipo = selTipo ? selTipo.value : r.tipo;
            const f = r.financeiro;
            const meta = { tipo, arquivo: r.nomeArquivo, competencia: comp, titulos: f.titulos.length, total: f.total, posicao: f.posicao, hashDoConteudo: r.hash };
            const g = await arm.guardarArquivo(codigo, meta, { tipo, titulos: f.titulos, total: f.total, descartados: f.descartados, posicao: f.posicao }, r.bytes);
            competenciasGuardadas.add(comp);
            guardados.push({ tipo, competencia: comp });
            if (g.jaExistia) saida.push({ arquivo: r.nomeArquivo, tipo: 'cinza', texto: 'Este relatório já estava guardado. Nada foi duplicado.' });
            else saida.push({ arquivo: r.nomeArquivo, tipo: g.novaVersao ? 'ambar' : 'verde', texto: (g.novaVersao ? 'Guardado como VERSÃO ' + g.meta.versao : 'Guardado') + ' em ' + U.nomeCompetencia(comp) + ': ' + f.titulos.length + ' títulos, ' + T.moeda(f.total) + '.' });
          } else {
            saida.push({ arquivo: r.nomeArquivo, tipo: 'vermelho', texto: 'Não guardado: ' + r.motivo });
          }
        } catch (e) {
          saida.push({ arquivo: r.nomeArquivo, tipo: 'vermelho', texto: 'Erro ao guardar: ' + T.mensagemDeErro(e) });
        }
      }
      // Papel escolhido à mão: fica guardado na empresa (pelo código da conta) para os próximos meses.
      if (Object.keys(lembrar).length) {
        try {
          const emp = (await arm.empresas()).find((e) => String(e.codigo) === String(codigo));
          const papeis = Object.assign({}, emp.papeisDeConta || {});
          Object.keys(lembrar).forEach((k) => { if (lembrar[k]) papeis[k] = lembrar[k]; else delete papeis[k]; });
          const salvo = await arm.salvarEmpresa(Object.assign({}, emp, { papeisDeConta: papeis }));
          const ix = app().empresas.findIndex((e) => String(e.codigo) === String(codigo));
          if (ix >= 0) app().empresas[ix] = salvo;
          const nomes = Object.keys(lembrar).filter((k) => lembrar[k]).map((k) => 'conta ' + k + ' = ' + ((raiz.Familias.PAPEIS_ESCOLHIVEIS.find((p) => p.familia === lembrar[k].familia && p.papel === lembrar[k].papel) || {}).texto || ''));
          if (nomes.length) saida.push({ arquivo: 'Papel das contas', tipo: 'verde', texto: 'Guardado para esta empresa: ' + nomes.join('; ') + '. Nos próximos razões o programa já reconhece.' });
          await arm.registrarNoLog({ codigo, acao: 'papel-da-conta', alvo: Object.keys(lembrar).join(', '), detalhe: JSON.stringify(lembrar) });
        } catch (e) {
          saida.push({ arquivo: 'Papel das contas', tipo: 'ambar', texto: 'O arquivo foi guardado, mas não consegui lembrar o papel da conta para os próximos: ' + T.mensagemDeErro(e) });
        }
      }
      // Cada arquivo diz o que virou.
      lidos.innerHTML = '<h3 style="margin-bottom:10px">O que virou cada arquivo</h3>' + saida.map((s) =>
        '<div class="aviso ' + (s.tipo === 'verde' ? 'verde' : s.tipo === 'vermelho' ? 'vermelho' : s.tipo === 'ambar' ? 'ambar' : 'info') + '"><span class="icone-aviso">' +
        (s.tipo === 'verde' ? '✓' : s.tipo === 'vermelho' ? '✗' : 'ℹ️') + '</span><div><b>' + T.esc(s.arquivo) + '</b><br>' + T.esc(s.texto) + '</div></div>').join('');
      const rodape = janelaEl.querySelector('footer');
      rodape.innerHTML = '';
      const bt = document.createElement('button');
      bt.className = 'botao primario';
      bt.textContent = 'Fechar';
      bt.addEventListener('click', () => fecharJanela(true));
      rodape.appendChild(bt);
      bt.focus();
      return false;
    }

    const r = await promessa;
    if (opcoes && typeof opcoes.aoTerminar === 'function') opcoes.aoTerminar({ fechou: r, competencias: Array.from(competenciasGuardadas), guardados });
  }

  raiz.TelaSubir = { abrir };
})(self);
