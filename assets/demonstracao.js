/*
 * Conciliador Solutta — demonstracao.js
 * Gera, no próprio navegador, os razões de uma empresa 100% INVENTADA, para mostrar o
 * programa sem nenhum dado de cliente (Parte 12, Etapa 1, item 6). Pedido do Dony em
 * 14/09/2026: o PC da empresa só abre site, então a demonstração precisa funcionar sem
 * arquivo nenhum no computador.
 *
 * Empresa SOLUTTA TESTE LTDA, fornecedores, CNPJs e notas inventados (os CNPJs têm
 * dígito verificador válido para o programa reconhecer, mas são fictícios).
 * Os razões saem no desenho A (.xls), como os de sistema contábil, com os casos do roteiro:
 *   nota × pagamento que bate (1x1) · nota paga em parcelas (Nx1) · pagamento de várias
 *   notas (1xN) · o que sobra soma zero (zerou) · linhas sem fornecedor que se anulam no
 *   mesmo dia · adiantamento que casa com nota a pagar (direta) · fornecedor pago a mais
 *   (inversa agregada) · pagamentos sem nota (inversa, um lançamento por pagamento) ·
 *   cartão de compra e "business" (inversas suspeitas, desmarcadas) · reclassificação do
 *   próprio sistema entre as contas (⇄) · linha sem fornecedor que fica em aberto.
 * Sempre o mesmo resultado (sorteio com semente).
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./xlsx.full.min.js'), require('./util.js'));
  else raiz.Demonstracao = fabrica(raiz.XLSX, raiz.Util);
})(typeof self !== 'undefined' ? self : this, function (XLSX, Util) {
  'use strict';

  const EMPRESA = {
    codigo: '9001', nome: 'SOLUTTA TESTE LTDA', cnpj: '94968396000109',
    regime: 'Lucro Presumido', atividade: 'Restaurante (empresa fictícia de demonstração)', grupo: '',
  };
  const ANO = 2026;
  const PERIODO = { de: '01/01/2026', ate: '31/07/2026' };
  const COMPETENCIA = '2026-07-01';
  const CONTA_F = { codigo: '10001', classificacao: '2.1.3.01.000001', nome: 'FORNECEDORES' };
  const CONTA_A = { codigo: '527', classificacao: '1.1.3.05.000001', nome: 'ADIANTAMENTOS A FORNECEDORES' };
  const CP = { banco: 536, estoque: 56, servicos: 587, issRecolher: 183, issRetido: 173, transferencia: 10120 };
  const SALDO_ANTERIOR = { F: -4832015, A: 615000 };

  function sorteador(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // CNPJ fictício com dígito verificador válido (raiz começando em 9).
  function cnpjFicticio(i) {
    const raizCnpj = String(91000000 + ((i + 1) * 1046527) % 8999999);
    const base = raizCnpj + '0001';
    return base + Util.dvCnpj(base);
  }

  const dataDe = (dia, mes) => Util.montarData(dia, mes, ANO);
  const somarDias = (data, n) => Util.dataDeNumero(data.numero + n);
  const FIM = dataDe(31, 7);

  // ------------------------------------------------------------------
  // Fornecedores inventados
  // ritmo: de quantos em quantos dias chega nota; pagamento: boleto | pix | sistema
  // ------------------------------------------------------------------
  const REGULARES = [
    { nome: 'ZAVORI ALIMENTOS LTDA', ritmo: 7, faixa: [900, 4800], pagamento: 'boleto' },
    { nome: 'TELUMA DISTRIBUIDORA DE BEBIDAS LTDA', ritmo: 7, faixa: [700, 3900], pagamento: 'boleto', especial: '1xN' },
    { nome: 'BRISANTE LATICINIOS LTDA', ritmo: 14, faixa: [1100, 5200], pagamento: 'boleto', especial: 'Nx1' },
    { nome: 'CORVELA CARNES E DERIVADOS LTDA', ritmo: 7, faixa: [1800, 7600], pagamento: 'boleto' },
    { nome: 'MARENZO PESCADOS LTDA', ritmo: 14, faixa: [1200, 6400], pagamento: 'pix', especial: 'reclass' },
    { nome: 'FOLHAVIVA HORTIFRUTI LTDA', ritmo: 7, faixa: [400, 2100], pagamento: 'sistema' },
    { nome: 'DUNAREL EMBALAGENS LTDA', ritmo: 30, faixa: [800, 3600], pagamento: 'boleto' },
    { nome: 'PRAVELLI MASSAS ARTESANAIS LTDA', ritmo: 14, faixa: [600, 2800], pagamento: 'boleto', especial: 'reclass' },
    { nome: 'SOLAREZ COMERCIO DE GRAOS LTDA', ritmo: 30, faixa: [1500, 6200], pagamento: 'boleto' },
    { nome: 'VIRTALLE PRODUTOS DE LIMPEZA LTDA', ritmo: 30, faixa: [500, 1900], pagamento: 'boleto' },
    { nome: 'QUINTARO FRIGORIFICO LTDA', ritmo: 14, faixa: [2200, 8900], pagamento: 'boleto' },
    { nome: 'NOVELTRA CAFE E TORREFACAO LTDA', ritmo: 30, faixa: [700, 2400], pagamento: 'pix', especial: 'reclass' },
    { nome: 'OLIVANCE AZEITES E CONSERVAS LTDA', ritmo: 30, faixa: [900, 3100], pagamento: 'boleto' },
    { nome: 'GRANVALE OVOS E AVES LTDA', ritmo: 14, faixa: [600, 2600], pagamento: 'boleto', especial: 'zerou', pagaTudo: true },
    { nome: 'ESTRALIS DESCARTAVEIS LTDA', ritmo: 30, faixa: [400, 1600], pagamento: 'boleto' },
    { nome: 'PANTEVO PANIFICACAO LTDA', ritmo: 7, faixa: [300, 1400], pagamento: 'sistema' },
    { nome: 'RIVALTO BEBIDAS FINAS LTDA', ritmo: 30, faixa: [1300, 5800], pagamento: 'boleto' },
    { nome: 'SABORIM TEMPEROS LTDA', ritmo: 30, faixa: [350, 1500], pagamento: 'pix' },
    { nome: 'CANTORRE UTENSILIOS DE COZINHA LTDA', ritmo: 60, faixa: [900, 4200], pagamento: 'boleto' },
    { nome: 'TECNAVE MANUTENCAO DE EQUIPAMENTOS LTDA', ritmo: 30, faixa: [650, 2900], pagamento: 'boleto', servico: true },
    { nome: 'CLARIMAR CONTROLE DE PRAGAS LTDA', ritmo: 30, faixa: [380, 380], pagamento: 'boleto', servico: true },
    { nome: 'VERANDI SISTEMAS PARA RESTAURANTES LTDA', ritmo: 30, faixa: [520, 520], pagamento: 'boleto', servico: true },
  ];

  // Adiantamento que casa com nota a pagar (direta).
  const DIRETAS = [
    { nome: 'MONTEVIA EQUIPAMENTOS PARA COZINHA LTDA', ensina: [[10, 2], 345000, [6, 3]], nota: [[15, 5], 1200000], adiantamentos: [[[20, 4], 1200000]] },
    { nome: 'ARBOREL MOVEIS PLANEJADOS LTDA', ensina: [[14, 1], 218090, [9, 2]], nota: [[12, 6], 550000], adiantamentos: [[[28, 5], 800000]] },
    { nome: 'LUXIMA ILUMINACAO LTDA', ensina: [[3, 3], 96540, [30, 3]], nota: [[8, 7], 420000], adiantamentos: [[[22, 6], 300000]] },
    { nome: 'TORVANE REFRIGERACAO LTDA', ensina: [[20, 1], 157320, [19, 2]], nota: [[18, 7], 650000], adiantamentos: [[[2, 7], 300000], [[9, 7], 350000]] },
  ];

  function gerarLancamentos(semente) {
    const s = sorteador(semente || 2026);
    const F = [];
    const A = [];
    let ordem = 0;
    const cnpjs = new Map();
    let proximoCnpj = 0;
    const cnpjDe = (nome) => {
      if (!cnpjs.has(nome)) cnpjs.set(nome, cnpjFicticio(proximoCnpj++));
      return cnpjs.get(nome);
    };
    const valorEntre = (min, max) => Math.round((min + s() * (max - min)) * 100);
    const nf = () => String(Math.floor(1000 + s() * 899000));
    const curto = (nome) => nome.slice(0, 12).trim();
    let sobra = 'LTDA';

    const add = (lista, data, historico, contrapartida, debito, credito) => {
      if (data.numero > FIM.numero) return false;
      lista.push({ data, historico, contrapartida, debito, credito, ordem: ordem++ });
      return true;
    };
    const nota = (f, data, valor) => add(F, data, f.servico
      ? 'Serviços tomados ref. NF nº ' + nf() + ' - ' + f.nome
      : 'AQUISICAO CONFORME NOTA FISCAL ' + nf() + ' - ' + f.nome, f.servico ? CP.servicos : CP.estoque, 0, valor);
    const pagamento = (f, data, valor, jeito) => {
      const cnpj = Util.formatarCnpj(cnpjDe(f.nome));
      let h;
      if (jeito === 'pix') h = 'VALOR REFERENTE PIX ENVIADO ' + f.nome + ' ' + cnpj;
      else if (jeito === 'sistema') {
        // Armadilha do extrato: o pedaço antes de BOLETO PAGO é sobra da linha anterior.
        h = 'Pagamento conciliado com sistema interno - ' + sobra + ' BOLETO PAGO ' + curto(f.nome) + ' ' + f.nome;
      } else {
        h = 'VALOR REFERENTE ' + f.nome.slice(0, 27).trim() + ' BOLETO PAGO ' + curto(f.nome) + ' ' + cnpj +
          (f.nome.length > 27 ? ' ' + f.nome.slice(27, 45).trim() : '');
      }
      sobra = f.nome.split(' ').slice(-2).join(' ');
      return add(F, data, h, CP.banco, valor, 0);
    };

    // ---------- Fornecedores regulares ----------
    REGULARES.forEach((f, idx) => {
      cnpjDe(f.nome);
      let data = dataDe(2 + (idx % 6), 1);
      const limite = f.pagaTudo ? dataDe(20, 7) : FIM;
      let reclassFeita = false;
      const notasDeMarco = [];
      while (data.numero <= limite.numero) {
        const valor = f.faixa[0] === f.faixa[1] ? Math.round(f.faixa[0] * 100) : valorEntre(f.faixa[0], f.faixa[1]);
        nota(f, data, valor);
        const prazo = 20 + Math.floor(s() * 15);
        let pagoEm = somarDias(data, prazo);
        if (f.pagaTudo && pagoEm.numero > FIM.numero) pagoEm = FIM;
        if (f.especial === '1xN' && data.mes === 3) {
          notasDeMarco.push(valor);        // pagas de uma vez no fim do mês
        } else if (f.especial === 'reclass' && !reclassFeita && data.mes >= 2 && data.mes <= 4) {
          // O sistema lançou o pagamento no ADIANTAMENTO e depois reclassificou para fornecedores.
          reclassFeita = true;
          const cnpjCurto = curto(f.nome);
          add(A, pagoEm, 'Pagamento não conciliado no sistema interno - BOLETO PAGO ' + cnpjCurto + ' ' + f.nome, CP.banco, valor, 0);
          const dReclass = somarDias(pagoEm, 2);
          const hReclass = 'Reclass. Pagamento nÆo conciliado no sistema interno - BOLETO PAGO ' + cnpjCurto + ' ' + f.nome;
          add(A, dReclass, hReclass, Number(CONTA_F.codigo), 0, valor);
          add(F, dReclass, hReclass, Number(CONTA_A.codigo), valor, 0);
        } else {
          pagamento(f, pagoEm, valor, f.pagamento);
        }
        data = somarDias(data, f.ritmo);
      }
      if (notasDeMarco.length) pagamento(f, dataDe(31, 3), notasDeMarco.reduce((t, v) => t + v, 0), 'boleto');
      if (f.especial === 'Nx1') {
        // Uma nota de 6.000,00 paga em três parcelas.
        nota(f, dataDe(6, 4), 600000);
        pagamento(f, dataDe(21, 4), 200000, 'boleto');
        pagamento(f, dataDe(21, 5), 200000, 'boleto');
        pagamento(f, dataDe(19, 6), 200000, 'boleto');
      }
      if (f.especial === 'zerou') {
        // O que sobra do fornecedor soma zero sem casar 1x1, 1xN nem Nx1.
        nota(f, dataDe(3, 6), 100000);
        nota(f, dataDe(10, 6), 50000);
        pagamento(f, dataDe(25, 6), 120000, 'boleto');
        pagamento(f, dataDe(30, 6), 30000, 'boleto');
      }
    });

    // ---------- Direta: adiantamento × nota a pagar ----------
    DIRETAS.forEach((f) => {
      cnpjDe(f.nome);
      const [dNota, vEnsina, dPago] = f.ensina;
      nota(f, dataDe(dNota[0], dNota[1]), vEnsina);
      pagamento(f, dataDe(dPago[0], dPago[1]), vEnsina, 'boleto');
      nota(f, dataDe(f.nota[0][0], f.nota[0][1]), f.nota[1]);
      for (const [d, v] of f.adiantamentos) {
        add(A, dataDe(d[0], d[1]), 'Pagamento não conciliado no sistema interno - BOLETO PAGO ' + curto(f.nome) + ' ' + f.nome, CP.banco, v, 0);
      }
    });

    // ---------- Inversa agregada: pago a mais do que as notas (notas e pagamentos misturados) ----------
    // "entrou uma nota de quinze mil a crédito, só que pagou vinte mil" (Dony).
    const belcanto = { nome: 'BELCANTO DOCES E SOBREMESAS LTDA' };
    nota(belcanto, dataDe(5, 3), 750000);
    nota(belcanto, dataDe(6, 4), 750000);
    pagamento(belcanto, dataDe(20, 3), 1000000, 'boleto');
    pagamento(belcanto, dataDe(22, 4), 1000000, 'boleto');

    // Depois da etapa 1 só sobra um pagamento: inversa com um lançamento na data dele.
    const frutalle = { nome: 'FRUTALLE POLPAS LTDA' };
    nota(frutalle, dataDe(3, 5), 730000);
    nota(frutalle, dataDe(10, 5), 210000);
    pagamento(frutalle, dataDe(30, 5), 940000, 'boleto');
    pagamento(frutalle, dataDe(12, 6), 85000, 'pix');

    // ---------- Inversa por pagamento: pagamentos sem nota ----------
    const venturi = { nome: 'VENTURI GAS ENGARRAFADO LTDA' };
    pagamento(venturi, dataDe(15, 5), 180000, 'pix');
    pagamento(venturi, dataDe(16, 6), 220000, 'pix');
    const portello = { nome: 'PORTELLO UNIFORMES LTDA' };
    pagamento(portello, dataDe(10, 7), 95000, 'pix');

    // ---------- Suspeitas: o nome parece meio de pagamento ----------
    const cartao = Util.formatarCnpj(cnpjFicticio(90));
    add(F, dataDe(10, 3), 'VALOR REFERENTE BOLETO PAGO CARTAO DE CO CARTAO DE COMPRA ' + cartao, CP.banco, 234567, 0);
    add(F, dataDe(10, 4), 'VALOR REFERENTE BOLETO PAGO CARTAO DE CO CARTAO DE COMPRA ' + cartao, CP.banco, 198040, 0);
    add(F, dataDe(11, 5), 'VALOR REFERENTE BOLETO PAGO CARTAO DE CO CARTAO DE COMPRA ' + cartao, CP.banco, 276015, 0);
    add(F, dataDe(18, 4), 'VALOR REFERENTE BUSINESS 4000-1234', CP.banco, 412000, 0);
    add(F, dataDe(19, 6), 'VALOR REFERENTE BUSINESS 4000-1234', CP.banco, 387050, 0);

    // ---------- Sem fornecedor ----------
    add(F, dataDe(27, 2), 'ISS RETIDO A RECOLHER', CP.issRecolher, 0, 18640);
    add(F, dataDe(27, 2), 'VLR.REF. ISS RETIDO 02/2026', CP.issRetido, 18640, 0);
    add(F, dataDe(15, 4), 'VALOR REFERENTE TRANSF. PARA FORNECEDORES', CP.transferencia, 0, 200000);
    add(F, dataDe(15, 4), 'VALOR REFERENTE TRANSF. PARA FORNECEDORES', CP.transferencia, 200000, 0);
    add(F, dataDe(22, 5), 'VALOR REFERENTE CH COMPENSADO 341 000512', CP.banco, 450000, 0);

    const porData = (x, y) => x.data.numero - y.data.numero || x.ordem - y.ordem;
    F.sort(porData);
    A.sort(porData);
    return { F, A };
  }

  // Monta o .xls no desenho A do sistema contábil.
  function montarXls(conta, saldoAnterior, lancamentos, loteInicial) {
    const vazia = () => new Array(14).fill(null);
    const linhas = [];
    let l = vazia(); l[0] = 'Empresa:'; l[2] = EMPRESA.nome; l[11] = 'Folha:'; l[13] = 1; linhas.push(l);
    l = vazia(); l[0] = 'C.N.P.J.:'; l[2] = Util.formatarCnpj(EMPRESA.cnpj); linhas.push(l);
    l = vazia(); l[0] = 'Período:'; l[2] = PERIODO.de + ' - ' + PERIODO.ate; linhas.push(l);
    l = vazia(); l[0] = 'CONSOLIDADO'; linhas.push(l);
    l = vazia(); l[0] = 'DADOS FICTÍCIOS PARA DEMONSTRAÇÃO (empresa, fornecedores e CNPJs inventados)'; linhas.push(l);
    l = vazia(); l[0] = 'RAZÃO'; linhas.push(l);
    linhas.push(vazia());
    l = vazia(); l[0] = 'Data'; l[1] = 'Lote'; l[2] = 'Histórico'; l[5] = 'Cta.C.Part.'; l[6] = 'Filial'; l[7] = 'Débito'; l[8] = 'Crédito'; l[9] = 'Saldo'; l[12] = 'Saldo-Exercício'; linhas.push(l);
    l = vazia(); l[0] = 'Conta:'; l[1] = Number(conta.codigo); l[2] = conta.classificacao; l[4] = conta.nome; linhas.push(l);
    l = vazia(); l[2] = 'SALDO ANTERIOR'; l[12] = saldoAnterior / 100; linhas.push(l);
    let periodo = 0, exercicio = saldoAnterior, lote = loteInicial;
    const linhasDeData = [];
    for (const x of lancamentos) {
      periodo += x.debito - x.credito;
      exercicio += x.debito - x.credito;
      l = vazia();
      l[0] = (Date.UTC(x.data.ano, x.data.mes - 1, x.data.dia) - Date.UTC(1899, 11, 30)) / 86400000;
      l[1] = lote++;
      l[2] = x.historico;
      l[5] = x.contrapartida;
      l[6] = 1;
      l[7] = x.debito ? x.debito / 100 : null;
      l[8] = x.credito ? x.credito / 100 : null;
      l[9] = periodo / 100;
      l[12] = exercicio / 100;
      linhasDeData.push(linhas.length);
      linhas.push(l);
    }
    linhas.push(vazia());
    l = vazia(); l[0] = 'Dados fictícios gerados pelo Conciliador Solutta para demonstração'; linhas.push(l);
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    for (const i of linhasDeData) {
      const endereco = XLSX.utils.encode_cell({ r: i, c: 0 });
      if (ws[endereco]) ws[endereco].z = 'dd/mm/yyyy';
    }
    ws['!cols'] = [{ wch: 11 }, { wch: 8 }, { wch: 70 }, { wch: 2 }, { wch: 2 }, { wch: 10 }, { wch: 6 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 2 }, { wch: 2 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Razão');
    const saida = XLSX.write(wb, { type: 'array', bookType: 'biff8' });
    return saida instanceof Uint8Array ? saida : new Uint8Array(saida);
  }

  /**
   * Os dois razões da empresa de demonstração, prontos para subir.
   * @returns [{ nome, bytes, lancamentos }]
   */
  function gerarRazoes(semente) {
    const { F, A } = gerarLancamentos(semente);
    return [
      { nome: 'Razao Fornecedores - SOLUTTA TESTE LTDA - EXEMPLO - 01-01-2026 a 31-07-2026.xls', bytes: montarXls(CONTA_F, SALDO_ANTERIOR.F, F, 150001), lancamentos: F.length },
      { nome: 'Razao Adiantamento a Fornecedores - SOLUTTA TESTE LTDA - EXEMPLO - 01-01-2026 a 31-07-2026.xls', bytes: montarXls(CONTA_A, SALDO_ANTERIOR.A, A, 160001), lancamentos: A.length },
    ];
  }

  return { EMPRESA, PERIODO, COMPETENCIA, CONTA_F, CONTA_A, gerarLancamentos, gerarRazoes, cnpjFicticio };
});
