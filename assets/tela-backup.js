/*
 * Conciliador Solutta — tela-backup.js
 * BACKUP E IMPORTAÇÃO DE UMA EMPRESA (Dony, 23/09/2026: "como o sistema é offline, cada um usa na sua
 * máquina; eu quero que o colaborador selecione a empresa, gere um backup daquela empresa, e outro
 * colaborador pegue esse backup, importe naquela empresa, e os dois fiquem com os mesmos dados").
 *
 * Gerar: baixa um arquivo .zip com TUDO da empresa — cadastro, arquivos (o lido e o original, byte a byte),
 * conciliações com as decisões, congelados e o log dela.
 * Importar: escolhe o arquivo, o programa LÊ e MOSTRA o que vai acontecer (o que entra, o que já existe,
 * o que está mais novo de cada lado) e só mexe depois do "sim".
 *
 * Regra da importação (a mesma do armazenamento): nada é apagado. O que não existe aqui entra; quando a
 * mesma conciliação existe nos dois, fica a mais nova — e quem importa pode marcar "trazer tudo do backup"
 * para ficar idêntico ao do colega (o que for trocado vira versão em _versoes).
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;
  const U = raiz.Util;

  function app() { return raiz.App; }
  function B() { return raiz.Backup; }

  let E = null;

  async function mostrar(el, codigo, conferir) {
    const emp = app().empresas.find((e) => String(e.codigo) === String(codigo));
    if (!emp) { el.innerHTML = '<div class="aviso ambar">Empresa não cadastrada. <a href="#/">Voltar</a></div>'; return; }
    T.carregando(el, 'Abrindo o backup de ' + emp.nome + '…');
    const arm = app().armazenamento;
    const arquivos = await arm.arquivos(codigo);
    if (conferir && !conferir()) return;
    const conciliacoes = await arm.conciliacoes(codigo);
    if (conferir && !conferir()) return;
    E = { codigo, emp, el: null, arquivos, conciliacoes, lido: null };
    const meses = Array.from(new Set(arquivos.map((a) => U.anoMes(a.competencia)).filter(Boolean))).sort();
    const n = (q) => Number(q || 0).toLocaleString('pt-BR');
    el.innerHTML = '<div class="tela-backup">' +
      '<a class="voltar" href="#/empresa/' + encodeURIComponent(codigo) + '">← ' + T.esc(emp.nome) + '</a>' +
      '<div class="cabecalho"><div class="titulos"><h1>Backup desta empresa</h1>' +
      '<p class="suave">' + T.esc(emp.codigo + ' · ' + emp.nome) + ' · leve tudo para outro computador, ou traga o que o colega fez</p></div></div>' +
      '<div class="grade-2">' +
      '<div class="cartao corpo"><h3 style="margin:0 0 6px">💾 Gerar o backup</h3>' +
      '<p class="suave" style="line-height:1.55;margin:0 0 10px">Baixa <b>um arquivo só</b> com tudo desta empresa: o cadastro, os ' + n(arquivos.length) +
      ' arquivo(s) (o que o programa leu <b>e</b> o original, byte a byte), as ' + n(conciliacoes.length) + ' conciliação(ões) com as decisões, os congelados e o log dela' +
      (meses.length ? ' · de ' + T.esc(U.nomeCompetencia(meses[0] + '-01')) + ' a ' + T.esc(U.nomeCompetencia(meses[meses.length - 1] + '-01')) : '') + '.</p>' +
      '<p class="suave pequeno" style="margin:0 0 12px">Mande o arquivo para o colega como você preferir (rede, pendrive, e-mail). Ele é compactado: costuma ficar bem menor que os arquivos originais somados.</p>' +
      '<button type="button" class="botao primario" data-acao="gerar">💾 Gerar e baixar o backup</button>' +
      '<div id="bk-gerando" class="suave pequeno" style="margin-top:8px"></div></div>' +
      '<div class="cartao corpo"><h3 style="margin:0 0 6px">📥 Importar um backup</h3>' +
      '<p class="suave" style="line-height:1.55;margin:0 0 10px">Escolha o arquivo que o colega mandou. O programa <b>lê primeiro e mostra o que vai acontecer</b>; nada muda enquanto você não confirmar.</p>' +
      '<p class="suave pequeno" style="margin:0 0 12px">Nada é apagado: o que não existe aqui entra, e quando a mesma conciliação existe nos dois fica a mais nova (o que for trocado vira versão, dá para voltar).</p>' +
      '<label class="botao" style="cursor:pointer">📥 Escolher o arquivo de backup<input type="file" accept=".zip" id="bk-arquivo" style="display:none"></label>' +
      '<div id="bk-lendo" class="suave pequeno" style="margin-top:8px"></div></div>' +
      '</div>' +
      '<div id="bk-previa"></div>' +
      '<div class="cartao corpo" style="margin-top:14px"><h3 style="margin:0 0 8px">O que tem aqui hoje</h3>' +
      '<table class="tabela"><thead><tr><th>Arquivos</th><th>Conciliações</th><th>Meses</th><th>Conciliações livres</th></tr></thead><tbody>' +
      '<tr><td>' + n(arquivos.length) + '</td><td>' + n(conciliacoes.length) + '</td><td>' + (meses.length ? T.esc(meses.join(', ')) : '—') + '</td>' +
      '<td>' + n((emp.conciliacoesLivres || []).length) + '</td></tr></tbody></table></div></div>';
    E.el = el.firstChild;
    ligar();
  }

  function ligar() {
    E.el.addEventListener('click', async (ev) => {
      const acao = ev.target.closest('[data-acao]');
      if (!acao) return;
      const a = acao.getAttribute('data-acao');
      if (a === 'gerar') await gerar(acao);
      else if (a === 'importar') await importar(false);
      else if (a === 'importar-substituindo') await importar(true);
      else if (a === 'cancelar-previa') { E.lido = null; E.el.querySelector('#bk-previa').innerHTML = ''; }
    });
    const campo = E.el.querySelector('#bk-arquivo');
    if (campo) campo.addEventListener('change', async () => { if (campo.files && campo.files[0]) await lerArquivo(campo.files[0]); campo.value = ''; });
  }

  // ------------------------------------------------------------------
  // Gerar
  // ------------------------------------------------------------------
  async function gerar(botao) {
    const aviso = E.el.querySelector('#bk-gerando');
    botao.disabled = true;
    aviso.textContent = 'Juntando tudo… isso pode levar alguns segundos.';
    try {
      const pacote = await app().armazenamento.exportarEmpresa(E.codigo);
      const bytes = B().empacotar(pacote);
      const nome = B().nomeDoArquivo(pacote);
      T.baixar(bytes, nome, 'application/zip');
      const r = B().resumo(pacote);
      aviso.innerHTML = '✓ <b>' + T.esc(nome) + '</b> · ' + (bytes.length / 1048576).toFixed(1).replace('.', ',') + ' MB · ' +
        r.arquivos + ' arquivo(s) e ' + r.conciliacoes + ' conciliação(ões).';
      T.avisoRapido('Backup gerado: ' + nome, 'ok', 8000);
      app().armazenamento.registrarNoLog({ codigo: E.codigo, acao: 'backup-gerado', alvo: nome,
        detalhe: r.arquivos + ' arquivos · ' + r.conciliacoes + ' conciliações · ' + bytes.length + ' bytes' }).catch(() => {});
    } catch (e) {
      aviso.innerHTML = '<span class="falta">Não deu para gerar: ' + T.esc(T.mensagemDeErro(e)) + '</span>';
      T.avisoRapido('Não deu para gerar o backup: ' + T.mensagemDeErro(e), 'erro', 9000);
    } finally {
      botao.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Ler o arquivo escolhido e mostrar a prévia (nada é gravado ainda)
  // ------------------------------------------------------------------
  async function lerArquivo(file) {
    const aviso = E.el.querySelector('#bk-lendo');
    aviso.textContent = 'Lendo ' + file.name + '…';
    try {
      const bytes = await T.lerArquivoComoBytes(file);
      const lido = B().ler(bytes);
      const outra = String(lido.resumo.empresa.codigo) !== String(E.codigo);
      const comparacao = B().comparar(lido.pacote, { empresa: E.emp, arquivos: E.arquivos, conciliacoes: E.conciliacoes });
      E.lido = { nome: file.name, bytes: bytes.length, lido, comparacao, outra };
      aviso.textContent = '';
      desenharPrevia();
    } catch (e) {
      aviso.innerHTML = '<span class="falta">' + T.esc(T.mensagemDeErro(e)) + '</span>';
      E.lido = null;
      E.el.querySelector('#bk-previa').innerHTML = '';
    }
  }

  function desenharPrevia() {
    const { nome, bytes, lido, comparacao, outra } = E.lido;
    const r = lido.resumo;
    const n = (q) => Number(q || 0).toLocaleString('pt-BR');
    const tipos = Object.keys(r.porTipo || {}).map((t) => n(r.porTipo[t]) + ' ' + t.replace(/_/g, ' ')).join(' · ');
    const linha = (rotulo, valor, obs) => '<tr><td>' + rotulo + '</td><td class="num"><b>' + valor + '</b></td><td class="suave pequeno">' + (obs || '') + '</td></tr>';
    E.el.querySelector('#bk-previa').innerHTML = '<div class="cartao corpo" style="margin-top:14px">' +
      '<h3 style="margin:0 0 8px">📥 O que veio no arquivo <span class="suave pequeno">' + T.esc(nome) + ' · ' + (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB</span></h3>' +
      (outra ? '<div class="aviso vermelho" style="margin:0 0 10px"><span class="icone-aviso">⚠️</span><div><b>Este backup é de outra empresa:</b> ' +
        T.esc(r.empresa.codigo + ' · ' + r.empresa.nome) + ', e você está em ' + T.esc(E.emp.codigo + ' · ' + E.emp.nome) + '. ' +
        'Se importar, a empresa do backup é criada (ou atualizada) aqui — a que está aberta não é tocada.</div></div>'
        : '<div class="aviso info" style="margin:0 0 10px"><span class="icone-aviso">🏢</span><div>Backup de <b>' + T.esc(r.empresa.codigo + ' · ' + r.empresa.nome) + '</b>, ' +
          'gerado por <b>' + T.esc(r.exportadoPor || '—') + '</b> em ' + T.esc(U.dataHoraLocal(r.exportadoEm)) + '.</div></div>') +
      '<table class="tabela"><thead><tr><th>O que vem</th><th class="num">Quantos</th><th>O que acontece aqui</th></tr></thead><tbody>' +
      linha('Arquivos', n(r.arquivos), (tipos ? tipos + ' · ' : '') + n(comparacao.arquivos.novos) + ' entram · ' + n(comparacao.arquivos.jaTem) + ' já existem aqui (ficam como estão)') +
      linha('Conciliações', n(r.conciliacoes), n(comparacao.conciliacoes.novas) + ' novas · ' + n(comparacao.conciliacoes.maisNovasNoBackup) + ' mais novas no backup · ' +
        n(comparacao.conciliacoes.maisNovasAqui) + ' mais novas aqui · ' + n(comparacao.conciliacoes.iguais) + ' iguais') +
      linha('Conciliações livres', n(r.conciliacoesLivres), 'entram no cadastro da empresa') +
      linha('Congelados', n(r.congelados), 'entram os que faltarem (cópia imutável nunca é trocada)') +
      linha('Linhas de log', n(r.log), 'as que faltarem são acrescentadas') +
      (r.meses.length ? linha('Meses', T.esc(r.meses[0] + ' a ' + r.meses[r.meses.length - 1]), n(r.meses.length) + ' mês(es) com arquivo') : '') +
      '</tbody></table>' +
      (comparacao.podeFicarDiferente
        ? '<div class="aviso ambar" style="margin:10px 0 0"><span class="icone-aviso">⚠️</span><div><b>' + n(comparacao.podeFicarDiferente) +
          ' conciliação(ões) estão mais novas aqui do que no backup.</b> Do jeito normal elas <b>ficam como estão</b> (o seu trabalho não se perde) — e aí as duas máquinas não ficam idênticas. ' +
          'Se você quer ficar exatamente igual ao do colega, use <b>Trazer tudo do backup</b>: o que for trocado vira versão e dá para voltar.</div></div>'
        : '<div class="aviso verde" style="margin:10px 0 0"><span class="icone-aviso">✓</span><div>Não há nada mais novo aqui do que no backup: depois de importar, as duas máquinas ficam com os mesmos dados.</div></div>') +
      '<div class="linha-flex" style="margin-top:12px;gap:8px">' +
      '<button type="button" class="botao primario" data-acao="importar">📥 Importar' + (comparacao.podeFicarDiferente ? ' (mantendo o que está mais novo aqui)' : '') + '</button>' +
      (comparacao.podeFicarDiferente ? '<button type="button" class="botao perigo" data-acao="importar-substituindo">Trazer tudo do backup (ficar igual ao do colega)</button>' : '') +
      '<button type="button" class="botao" data-acao="cancelar-previa">Cancelar</button></div>' +
      '<div id="bk-resultado" style="margin-top:10px"></div></div>';
  }

  // ------------------------------------------------------------------
  // Importar de verdade
  // ------------------------------------------------------------------
  async function importar(substituir) {
    if (!E.lido) return;
    const r = E.lido.lido.resumo;
    const ok = await T.confirmar({
      titulo: substituir ? 'Trazer tudo do backup?' : 'Importar o backup?',
      perigo: !!substituir,
      botao: substituir ? 'Trazer tudo do backup' : 'Importar',
      texto: 'Empresa <b>' + T.esc(r.empresa.codigo + ' · ' + r.empresa.nome) + '</b>: ' + r.arquivos + ' arquivo(s) e ' + r.conciliacoes + ' conciliação(ões).<br><br>' +
        (substituir
          ? 'As conciliações do backup <b>substituem</b> as daqui, mesmo as que estão mais novas. O que for trocado é guardado em <b>versões</b> antes, então dá para voltar.'
          : 'Entra o que falta aqui e fica a versão mais nova de cada conciliação. <b>Nada é apagado.</b>'),
    });
    if (!ok) return;
    const alvo = E.el.querySelector('#bk-resultado');
    alvo.innerHTML = '<span class="suave pequeno">Importando…</span>';
    try {
      const res = await app().armazenamento.importarTudo(E.lido.lido.pacote, { substituir: !!substituir });
      app().empresas = await app().armazenamento.empresas();
      alvo.innerHTML = '<div class="aviso verde"><span class="icone-aviso">✓</span><div><b>Importado.</b> ' +
        res.empresas + ' empresa(s) · ' + res.arquivos + ' arquivo(s) novo(s)' + (res.jaTinha ? ' (' + res.jaTinha.arquivos + ' já existiam)' : '') + ' · ' +
        res.conciliacoes + ' conciliação(ões) gravada(s)' + (res.jaTinha ? ' (' + res.jaTinha.conciliacoes + ' ficaram como estavam)' : '') + ' · ' +
        res.congelados + ' congelado(s) · ' + res.log + ' linha(s) de log.<br>' +
        '<a href="#/empresa/' + encodeURIComponent(r.empresa.codigo) + '">Abrir ' + T.esc(r.empresa.nome) + ' →</a></div></div>';
      T.avisoRapido('Backup importado: ' + res.arquivos + ' arquivo(s) e ' + res.conciliacoes + ' conciliação(ões).', 'ok', 9000);
      E.lido = null;
    } catch (e) {
      alvo.innerHTML = '<div class="aviso vermelho"><span class="icone-aviso">⚠️</span><div><b>Não deu para importar.</b> ' + T.esc(T.mensagemDeErro(e)) + '</div></div>';
    }
  }

  // Gerar e baixar o backup de uma empresa de fora desta tela (a exclusão de empresa oferece isso antes de apagar).
  async function baixarBackup(codigo) {
    const pacote = await app().armazenamento.exportarEmpresa(codigo);
    const bytes = B().empacotar(pacote);
    const nome = B().nomeDoArquivo(pacote);
    T.baixar(bytes, nome, 'application/zip');
    const r = B().resumo(pacote);
    T.avisoRapido('Backup gerado: ' + nome + ' · ' + r.arquivos + ' arquivo(s) e ' + r.conciliacoes + ' conciliação(ões).', 'ok', 8000);
    app().armazenamento.registrarNoLog({ codigo, acao: 'backup-gerado', alvo: nome,
      detalhe: r.arquivos + ' arquivos · ' + r.conciliacoes + ' conciliações · ' + bytes.length + ' bytes' }).catch(() => {});
    return nome;
  }

  raiz.TelaBackup = { mostrar, baixarBackup };
})(self);
