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
    const deFornecedores = arquivos.filter((a) => (a.conta && a.conta.familia === 'fornecedores') || a.tipo === 'financeiro_pagar');
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

    el.innerHTML = '<a class="voltar" href="#/">← Empresas</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>' + T.esc(emp.nome) + '</h1><p class="suave">Código ' + T.esc(emp.codigo) + (detalhes.length ? ' · ' + T.esc(detalhes.join(' · ')) : '') + '</p></div>' +
      '<button class="botao" id="bt-editar">Editar cadastro</button></div>' +
      '<div class="grade-3">' + cartoes + '</div>';
    el.querySelector('#bt-editar').addEventListener('click', () => raiz.TelaCarteira.formulario(emp));
  }

  raiz.TelaEmpresa = { mostrar };
})(self);
