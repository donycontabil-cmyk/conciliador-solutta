/*
 * Conciliador Solutta — tela-suporte.js
 * "Ver o desenho de um arquivo (para o suporte)": arraste um arquivo e o programa mostra
 * só o FORMATO dele, sem nome, CNPJ nem valor, para copiar e mandar ao suporte adaptar o
 * leitor a um sistema novo. Não guarda nada, não precisa de empresa nem de pasta de dados.
 */
(function (raiz) {
  'use strict';
  const T = raiz.Tela;

  function app() { return raiz.App; }

  function mostrar(el) {
    el.innerHTML =
      '<div class="cabecalho"><div class="titulos"><h1>Ver o desenho de um arquivo</h1>' +
      '<p class="suave">Para adaptar o programa a um sistema novo. Mostra só o formato do arquivo — <b>sem nome, sem CNPJ e sem valor</b> — para você copiar e mandar ao suporte. Nada é guardado.</p></div></div>' +
      '<div class="aviso info"><span class="icone-aviso">🔒</span><div>O arquivo é lido aqui no seu computador e <b>não vai para a internet</b>. O texto abaixo troca nomes por <b>xxxxx</b>, CNPJs por <b>[CNPJ]</b> e valores por <b>9999</b>. Confira antes de copiar.</div></div>' +
      '<div class="soltar" id="soltar" tabindex="0" role="button" style="margin-top:14px"><b>Arraste um arquivo aqui</b> ou clique para escolher<br><span class="pequeno">Razão, contas a pagar, extrato — qualquer .xls, .xlsx ou .csv de um sistema da Solutta.</span></div>' +
      '<input type="file" id="escolher" multiple class="escondido" accept=".xls,.xlsx,.xlsm,.csv,.txt">' +
      '<div id="saida" style="margin-top:14px"></div>';

    const zona = el.querySelector('#soltar');
    const input = el.querySelector('#escolher');
    const saida = el.querySelector('#saida');

    async function processar(arquivos) {
      saida.innerHTML = '<div class="carregando">Lendo ' + arquivos.length + ' arquivo(s)…</div>';
      const blocos = [];
      for (const arq of Array.from(arquivos)) {
        try {
          const bytes = await T.lerArquivoComoBytes(arq);
          const r = raiz.Diagnostico.gerar(arq.name, bytes);
          blocos.push({ nome: arq.name, texto: r.texto, reconhecido: r.reconhecido, tipo: r.tipo });
        } catch (e) {
          blocos.push({ nome: arq.name, texto: 'Não consegui ler este arquivo: ' + T.mensagemDeErro(e), reconhecido: false });
        }
      }
      const textoTudo = blocos.map((b) => b.texto).join('\n\n' + '='.repeat(70) + '\n\n');
      saida.innerHTML =
        '<div class="cartao corpo"><div class="linha-flex" style="margin-bottom:10px">' +
        '<h3 style="flex:1">Desenho de ' + blocos.length + ' arquivo(s)</h3>' +
        '<button class="botao primario" id="bt-copiar">📋 Copiar tudo para o suporte</button></div>' +
        blocos.map((b) => '<p class="pequeno" style="margin:2px 0">' + (b.reconhecido ? '<span class="ok">✓</span> o programa já reconhece' : '<span class="falta">✗</span> o programa ainda NÃO reconhece — é um destes que o suporte vai ajustar') +
          ' · <b>' + T.esc(b.nome) + '</b></p>').join('') +
        '<textarea id="texto-desenho" readonly style="width:100%;height:340px;margin-top:10px;font-family:Consolas,monospace;font-size:12.5px;white-space:pre;overflow:auto;border:1px solid var(--borda-forte);border-radius:8px;padding:10px;background:#fff;color:var(--texto)"></textarea>' +
        '<p class="suave pequeno" style="margin-top:8px">Clique em <b>Copiar tudo para o suporte</b> e cole na conversa com o suporte. Se preferir, selecione o texto e copie à mão.</p>' +
        '</div>';
      saida.querySelector('#texto-desenho').value = textoTudo;
      saida.querySelector('#bt-copiar').addEventListener('click', async () => {
        const area = saida.querySelector('#texto-desenho');
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(textoTudo);
          else { area.focus(); area.select(); document.execCommand('copy'); }
          T.avisoRapido('Desenho copiado. Agora é só colar na conversa com o suporte.', 'ok', 5000);
        } catch (e) {
          area.focus(); area.select();
          T.avisoRapido('Não consegui copiar sozinho: o texto está selecionado, use Ctrl+C.', 'erro');
        }
      });
    }

    zona.addEventListener('click', () => input.click());
    zona.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } });
    input.addEventListener('change', () => { if (input.files.length) processar(input.files); input.value = ''; });
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('por-cima'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('por-cima'));
    zona.addEventListener('drop', (ev) => { ev.preventDefault(); zona.classList.remove('por-cima'); if (ev.dataTransfer && ev.dataTransfer.files.length) processar(ev.dataTransfer.files); });
  }

  raiz.TelaSuporte = { mostrar };
})(self);
