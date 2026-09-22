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

    const cartoes = raiz.Familias.FAMILIAS.map((f) => {
      if (f.id === 'fornecedores') {
        const ultima = competencias[0];
        return '<a class="cartao familia" href="#/empresa/' + encodeURIComponent(codigo) + '/fornecedores' + (ultima ? '/' + ultima : '') + '">' +
          '<div class="icone">' + f.icone + '</div><h2>' + T.esc(f.titulo) + '</h2><p class="suave" style="line-height:1.5">' + T.esc(f.texto) + '</p>' +
          '<div class="rodape"><span class="suave pequeno">' + (deFornecedores.length ? deFornecedores.length + ' arquivo(s)' + (ultima ? ' · último mês: ' + U.nomeCompetencia(ultima + '-01') : '') : 'nenhum arquivo ainda') + '</span>' +
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

    el.innerHTML = '<a class="voltar" href="#/">← Empresas</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>' + T.esc(emp.nome) + '</h1><p class="suave">Código ' + T.esc(emp.codigo) + (detalhes.length ? ' · ' + T.esc(detalhes.join(' · ')) : '') + '</p></div>' +
      '<button class="botao" id="bt-editar">Editar cadastro</button></div>' +
      '<div class="grade-3">' + cartaoApresentacao + cartaoDiario + cartoes + '</div>';
    el.querySelector('#bt-editar').addEventListener('click', () => raiz.TelaCarteira.formulario(emp));
  }

  raiz.TelaEmpresa = { mostrar };
})(self);
