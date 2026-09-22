/*
 * Conciliador Solutta — motor-fechamento.js
 * Passo ① — Fornecedores × Adiantamento a fornecedores (Parte 7.2) e os
 * lançamentos do arquivo de ajustes (Parte 7.3). O mesmo motor serve Clientes
 * com natureza 'clientes', que só vira os sinais (Parte 7.9).
 * Motor puro: recebe dados, devolve dados. Não mexe em tela nem em armazenamento.
 *
 * "Se eu tenho um fornecedor a pagar de cinco mil, e adiantou dois mil, o meu saldo
 *  a pagar dele é de três mil." (Dony)
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./util.js'), require('./motor-nomes.js'), require('./motor-reclass.js'));
  } else {
    raiz.MotorFechamento = fabrica(raiz.Util, raiz.MotorNomes, raiz.MotorReclass);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, MotorNomes, MotorReclass) {
  'use strict';

  const SEM = MotorNomes.SEM_FORNECEDOR;

  // Janela de 90 dias: MEDIDA. Janela maior casava MENOS, porque o teto de 24
  // candidatas corta as certas (Parte 7.2 e armadilha 17).
  const JANELA_DIAS = 90;
  const MAX_ITENS = 6;
  const MAX_CANDIDATAS = 24;
  // Busca de combinações sem teto congela a tela (armadilha 18). Não achar dentro do teto = não bateu.
  const MAX_PASSOS = 20000;

  const TEXTOS = {
    fornecedores: {
      F: 'Fornecedores', A: 'Adiantamento a fornecedores',
      direta: (nome, cnpj, a, f) => 'Reclassificacao adiantamento - ' + nome + cnpj + ' - de ' + a + ' para ' + f,
      inversa: (nome, cnpj, a, f) => 'Reclassificacao para adiantamento - ' + nome + cnpj + ' - de ' + f + ' para ' + a,
    },
    clientes: {
      F: 'Clientes', A: 'Adiantamento de clientes',
      direta: (nome, cnpj, a, f) => 'Compensacao adiantamento de cliente - ' + nome + cnpj + ' - de ' + f + ' para ' + a,
      inversa: (nome, cnpj, a, f) => 'Reclassificacao para adiantamento de cliente - ' + nome + cnpj + ' - de ' + a + ' para ' + f,
    },
  };

  // ------------------------------------------------------------------
  // Linhas
  // ------------------------------------------------------------------
  function centavosComPonto(c) {
    const neg = c < 0;
    const abs = Math.abs(c);
    return (neg ? '-' : '') + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  // Sinal do lado (Parte 4 — o sinal tem significado, nunca Math.abs):
  //  Fornecedores (F): crédito − débito, positivo = a empresa deve.
  //  Adiantamento a fornecedores (A): débito − crédito, positivo = a empresa adiantou.
  //  Clientes: o espelho.
  function valorNoLado(natureza, lado, debito, credito) {
    const dc = debito - credito;
    if (natureza === 'clientes') return lado === 'F' ? dc : -dc;
    return lado === 'F' ? -dc : dc;
  }

  function saldoNoLado(natureza, lado, saldoDC) {
    if (natureza === 'clientes') return lado === 'F' ? saldoDC : -saldoDC;
    return lado === 'F' ? -saldoDC : saldoDC;
  }

  /**
   * Monta as linhas das contas de cada lado. A digital nasce do CONTEÚDO (Parte 4):
   * fonte|data|histórico (120)|débito|crédito|n — n separa linhas idênticas.
   */
  function montarLinhas(entrada) {
    const natureza = entrada.natureza || 'fornecedores';
    const fim = entrada.competencia ? Util.fimDaCompetencia(entrada.competencia) : null;
    const linhas = [];
    const ocorrencias = new Map();
    const contas = { F: [], A: [] };
    let foraDaCompetencia = 0;
    for (const lado of ['F', 'A']) {
      for (const fonte of (entrada.contas && entrada.contas[lado]) || []) {
        const conta = fonte.conta;
        const resumoConta = { codigo: String(conta.codigo), nome: conta.nome, classificacao: conta.classificacao || '',
          arquivoId: fonte.arquivoId || '', saldoAnterior: saldoNoLado(natureza, lado, fonte.saldoAnterior || 0), movimento: 0, linhas: 0,
          saldoFinalRazao: typeof fonte.saldoFinal === 'number' ? saldoNoLado(natureza, lado, fonte.saldoFinal) : null };
        contas[lado].push(resumoConta);
        for (const l of fonte.lancamentos) {
          const data = Util.montarData(l.dia, l.mes, l.ano);
          if (fim && data.numero > fim.numero) { foraDaCompetencia++; continue; }
          const base = lado + conta.codigo + '|' + data.texto + '|' + String(l.historico || '').slice(0, 120) + '|' +
            centavosComPonto(l.debito) + '|' + centavosComPonto(l.credito);
          const n = ocorrencias.get(base) || 0;
          ocorrencias.set(base, n + 1);
          const valor = valorNoLado(natureza, lado, l.debito, l.credito);
          resumoConta.movimento += valor;
          resumoConta.linhas++;
          linhas.push({
            i: linhas.length, digital: base + '|' + n, lado, conta: String(conta.codigo), contaNome: conta.nome,
            arquivoId: fonte.arquivoId || '', data: data.texto, dia: data.numero, historico: l.historico || '',
            contrapartida: l.contrapartida || '', numero: l.numero || '', nota: l.nota || '', debito: l.debito, credito: l.credito,
            dc: l.debito !== 0 ? (l.debito > 0 ? 'D' : 'C') : (l.credito >= 0 ? 'C' : 'D'),
            valor, fornecedorDeclarado: l.fornecedorDeclarado || null, participante: l.participante || '',
          });
        }
        resumoConta.saldoFinal = resumoConta.saldoAnterior + resumoConta.movimento;
      }
    }
    return { linhas, contas, foraDaCompetencia };
  }

  // ------------------------------------------------------------------
  // Busca de subconjunto em centavos (1xN e Nx1), com teto de itens e de passos.
  // candidatos já vêm na ordem de preferência (a data mais perto primeiro).
  // ------------------------------------------------------------------
  function buscarSoma(valores, alvo) {
    const n = valores.length;
    const sufixo = new Array(n + 1).fill(0);
    for (let k = n - 1; k >= 0; k--) sufixo[k] = sufixo[k + 1] + valores[k];
    let passos = 0;
    const escolhidos = [];
    function dfs(inicio, soma) {
      if (soma === alvo && escolhidos.length >= 2) return true;
      if (escolhidos.length >= MAX_ITENS) return false;
      for (let k = inicio; k < n; k++) {
        if (++passos > MAX_PASSOS) return false;
        const v = valores[k];
        if (soma + v > alvo) continue;
        if (soma + sufixo[k] < alvo) return false;
        escolhidos.push(k);
        if (dfs(k + 1, soma + v)) return true;
        escolhidos.pop();
        if (passos > MAX_PASSOS) return false;
      }
      return false;
    }
    return dfs(0, 0) ? escolhidos.slice() : null;
  }

  // ------------------------------------------------------------------
  // ETAPA 1 — primeiro, matar o que morre DENTRO de cada razão.
  // Regra do Dony, sem negociação: "a primeira conciliação que ele deve fazer é eliminar
  // tudo o que se mata dentro dos próprios razões pra depois confrontar um razão com
  // outro, senão está tudo errado."
  // ------------------------------------------------------------------
  function idDaBatida(marcas) {
    return 'BR-' + Util.hash8(marcas.slice().sort().join('#'));
  }

  function etapa1(linhas, bloqueadas) {
    const batidas = [];
    const batidaDe = new Map();
    const registrar = (como, lado, chave, grupo) => {
      const soma = grupo.reduce((s, l) => s + l.valor, 0);
      if (soma !== 0) throw new Error('Batida que não soma zero (' + como + '): ' + soma);
      const marcas = grupo.map((l) => l.digital);
      const b = { id: idDaBatida(marcas), como, lado, chave, marcas, valor: grupo.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0), linhas: grupo.map((l) => l.i) };
      batidas.push(b);
      for (const l of grupo) batidaDe.set(l.digital, b);
      return b;
    };

    // Grupos por fornecedor e por lado.
    const grupos = new Map();
    const semDono = new Map();
    for (const l of linhas) {
      if (bloqueadas.has(l.digital) || l.valor === 0) continue;
      if (l.dono.chave === SEM) {
        const k = l.conta + '|' + l.lado + '|' + l.dia;
        if (!semDono.has(k)) semDono.set(k, []);
        semDono.get(k).push(l);
        continue;
      }
      const k = l.dono.chave + '|' + l.lado;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(l);
    }

    for (const [k, grupo] of grupos) {
      const lado = grupo[0].lado;
      const chave = grupo[0].dono.chave;
      const aberta = (l) => !batidaDe.has(l.digital);

      // 1x1 — mesmo valor, sinais opostos. Todos os pares possíveis, ordenados por
      // custo = |dias| + 90 se quem baixa vem ANTES de quem forma; empate pela ordem das linhas.
      const baixasPorValor = new Map();
      for (const l of grupo) if (l.valor < 0) {
        const v = -l.valor;
        if (!baixasPorValor.has(v)) baixasPorValor.set(v, []);
        baixasPorValor.get(v).push(l);
      }
      const pares = [];
      for (const f of grupo) {
        if (f.valor <= 0) continue;
        const cands = baixasPorValor.get(f.valor);
        if (!cands) continue;
        for (const b of cands) {
          pares.push({ f, b, custo: Math.abs(f.dia - b.dia) + (b.dia < f.dia ? JANELA_DIAS : 0),
            o1: Math.min(f.i, b.i), o2: Math.max(f.i, b.i) });
        }
      }
      pares.sort((x, y) => x.custo - y.custo || x.o1 - y.o1 || x.o2 - y.o2);
      for (const p of pares) {
        if (aberta(p.f) && aberta(p.b)) registrar('1x1', lado, chave, [p.f, p.b]);
      }

      // 1xN — uma baixa = soma de várias que formam, até 90 dias antes dela.
      const porData = grupo.slice().sort((x, y) => x.dia - y.dia || x.i - y.i);
      for (const b of porData) {
        if (b.valor >= 0 || !aberta(b)) continue;
        const alvo = -b.valor;
        const cands = porData.filter((f) => f.valor > 0 && aberta(f) && f.valor < alvo && f.dia <= b.dia && f.dia >= b.dia - JANELA_DIAS)
          .sort((x, y) => y.dia - x.dia || x.i - y.i).slice(0, MAX_CANDIDATAS);
        if (cands.length < 2) continue;
        const idx = buscarSoma(cands.map((f) => f.valor), alvo);
        if (idx) registrar('1xN', lado, chave, [b].concat(idx.map((j) => cands[j])));
      }

      // Nx1 — uma que forma = soma de várias baixas, até 90 dias depois.
      for (const f of porData) {
        if (f.valor <= 0 || !aberta(f)) continue;
        const alvo = f.valor;
        const cands = porData.filter((b) => b.valor < 0 && aberta(b) && -b.valor < alvo && b.dia >= f.dia && b.dia <= f.dia + JANELA_DIAS)
          .sort((x, y) => x.dia - y.dia || x.i - y.i).slice(0, MAX_CANDIDATAS);
        if (cands.length < 2) continue;
        const idx = buscarSoma(cands.map((b) => -b.valor), alvo);
        if (idx) registrar('Nx1', lado, chave, [f].concat(idx.map((j) => cands[j])));
      }

      // zerou — o que sobrou do fornecedor naquele lado soma zero.
      const resto = grupo.filter(aberta);
      if (resto.length >= 2 && resto.some((l) => l.valor > 0) && resto.some((l) => l.valor < 0) &&
        resto.reduce((s, l) => s + l.valor, 0) === 0) {
        registrar('zerou', lado, chave, resto);
      }
      void k;
    }

    // mesmo-dia — linha SEM fornecedor só bate com outra sem fornecedor, na mesma conta,
    // no mesmo dia e no mesmo valor (sem nome, data diferente seria chute).
    for (const grupo of semDono.values()) {
      const usados = new Set();
      for (const a of grupo) {
        if (a.valor <= 0 || usados.has(a.digital)) continue;
        const b = grupo.find((x) => !usados.has(x.digital) && x.valor === -a.valor);
        if (!b) continue;
        usados.add(a.digital);
        usados.add(b.digital);
        registrar('mesmo-dia', a.lado, SEM, [a, b]);
      }
    }
    return { batidas, batidaDe };
  }

  // ------------------------------------------------------------------
  // À mão: aplicadas PRIMEIRO, e as linhas delas saem do resto — senão a mesma linha
  // entraria em duas reclassificações e o arquivo sairia em dobro.
  // ------------------------------------------------------------------
  function aplicarManuais(manuais, porDigital) {
    const usadas = new Set();
    const validas = [];
    const naoEncaixam = [];
    const ordenadas = (manuais || []).slice().sort((a, b) => Util.paraMs(a.quando) - Util.paraMs(b.quando));
    for (const m of ordenadas) {
      const marcas = m.marcas || [];
      const faltam = marcas.filter((d) => !porDigital.has(d));
      if (!marcas.length || faltam.length) {
        naoEncaixam.push({ manual: m, motivo: faltam.length + ' linha(s) desta reclassificação não estão mais nos razões desta competência.' });
        continue;
      }
      const repetidas = marcas.filter((d) => usadas.has(d));
      if (repetidas.length) {
        naoEncaixam.push({ manual: m, motivo: repetidas.length + ' linha(s) já estão em outra reclassificação à mão.' });
        continue;
      }
      const ls = marcas.map((d) => porDigital.get(d));
      const F = ls.filter((l) => l.lado === 'F');
      const A = ls.filter((l) => l.lado === 'A');
      let sentido = null, valor = 0, partes = [];
      if (F.length && A.length) {
        const somaF = F.reduce((s, l) => s + l.valor, 0);
        const somaA = A.reduce((s, l) => s + l.valor, 0);
        if (somaF <= 0 || somaA <= 0) {
          naoEncaixam.push({ manual: m, motivo: 'Para reclassificar, as linhas de ' + 'fornecedores precisam somar saldo a pagar e as do adiantamento, saldo adiantado.' });
          continue;
        }
        // Linhas dos dois lados -> direta, vale o MENOR. Diferença não bloqueia: vira sobra
        // (pode ser desconto; recusar seria o programa achando que entende mais que o contador).
        sentido = 'direta';
        valor = Math.min(somaF, somaA);
        partes = [{ valor, data: null, marcas }];
      } else if (F.length && F.every((l) => l.valor < 0)) {
        // Só débitos de fornecedores -> inversa, uma parte por pagamento.
        sentido = 'inversa';
        partes = F.map((l) => ({ valor: -l.valor, data: l.data, dia: l.dia, marcas: [l.digital] }));
        valor = partes.reduce((s, p) => s + p.valor, 0);
      } else {
        naoEncaixam.push({ manual: m, motivo: 'Selecione linhas dos dois lados (reclassificação direta) ou só pagamentos em fornecedores (inversa).' });
        continue;
      }
      marcas.forEach((d) => usadas.add(d));
      const donoF = F[0] || ls[0];
      validas.push({
        id: m.id, sentido, valor, partes, marcas, quem: m.quem, quando: m.quando,
        chave: donoF.dono.chave, nome: m.nome || donoF.dono.nome, cnpj: donoF.dono.cnpj,
        valorGuardado: m.valor, linhasF: F.map((l) => l.i), linhasA: A.map((l) => l.i),
      });
    }
    return { validas, naoEncaixam, usadas };
  }

  function idDaManual(marcas) {
    return 'MM-' + Util.hash8(marcas.slice().sort().join('#'));
  }

  // ------------------------------------------------------------------
  // Cálculo completo do Passo ①
  // entrada: { natureza, competencia, periodo: {de, ate}, contas: { F: [...], A: [...] },
  //            titulos: [{ nome, cnpj }], decisoes: { recusadas, aceitas, manuais, desfeitas, donos } }
  // cache (opcional): objeto guardado pela tela; a etapa 1 só é refeita quando mudam
  //   os arquivos, os donos, as desfeitas ou as linhas usadas à mão.
  // ------------------------------------------------------------------
  function calcularPasso1(entrada, cache) {
    const t0 = Date.now();
    const natureza = entrada.natureza || 'fornecedores';
    const textos = TEXTOS[natureza];
    const decisoes = entrada.decisoes || {};
    const recusadas = new Set(decisoes.recusadas || []);
    const aceitas = new Set(decisoes.aceitas || []);
    const desfeitas = decisoes.desfeitas || [];
    const donos = decisoes.donos || {};

    const chaveCache = JSON.stringify({
      arq: ['F', 'A'].map((l) => ((entrada.contas && entrada.contas[l]) || []).map((c) => (c.arquivoId || '') + ':' + c.conta.codigo + ':' + c.lancamentos.length)),
      comp: entrada.competencia, donos, desfeitas: desfeitas.map((d) => d.id + ':' + (d.marcas || []).length),
      manuais: (decisoes.manuais || []).map((m) => (m.marcas || []).join('#')).sort(),
      titulos: (entrada.titulos || []).length,
    });

    let base;
    if (cache && cache.chave === chaveCache && cache.base) {
      base = cache.base;
    } else {
      const montadas = montarLinhas(entrada);
      const linhas = montadas.linhas;
      const nomes = MotorNomes.resolver(linhas, { donos, titulos: entrada.titulos || [] });
      for (const l of linhas) l.dono = nomes.porLinha.get(l.digital);
      const reclass = MotorReclass.marcar(linhas);
      for (const l of linhas) l.reclass = reclass.get(l.digital) || null;
      const porDigital = new Map(linhas.map((l) => [l.digital, l]));

      const manuais = aplicarManuais(decisoes.manuais, porDigital);

      // "✕ Não confere": as linhas voltam a ficar em aberto e NÃO são casadas com outras.
      const bloqueadas = new Set(manuais.usadas);
      const desfeitaDe = new Map();
      const desfeitasQueNaoEncaixam = [];
      for (const d of desfeitas) {
        const existentes = (d.marcas || []).filter((m) => porDigital.has(m));
        if (existentes.length < (d.marcas || []).length) {
          desfeitasQueNaoEncaixam.push({ desfeita: d, motivo: ((d.marcas || []).length - existentes.length) + ' linha(s) desta batida desfeita não estão mais nos razões.' });
        }
        for (const m of existentes) {
          if (manuais.usadas.has(m)) continue;
          bloqueadas.add(m);
          desfeitaDe.set(m, d);
        }
      }
      const e1 = etapa1(linhas, bloqueadas);
      base = { linhas, contas: montadas.contas, foraDaCompetencia: montadas.foraDaCompetencia, nomes, porDigital,
        manuais, desfeitaDe, desfeitasQueNaoEncaixam, e1, ms: Date.now() - t0 };
      if (cache) { cache.chave = chaveCache; cache.base = base; }
    }

    const { linhas, contas, nomes, manuais, desfeitaDe, e1 } = base;
    const periodo = entrada.periodo || null;
    const inicioPeriodo = periodo && Util.lerData(periodo.de);
    const fimComp = Util.fimDaCompetencia(entrada.competencia) || (periodo && Util.lerData(periodo.ate)) || Util.hoje();

    // ------------------------------------------------------------------
    // ETAPA 2 — só as SOBRAS de um razão contra as sobras do outro.
    // ------------------------------------------------------------------
    const sobrasPorChave = new Map();
    for (const l of linhas) {
      if (e1.batidaDe.has(l.digital) || manuais.usadas.has(l.digital)) continue;
      const k = l.dono.chave;
      if (!sobrasPorChave.has(k)) sobrasPorChave.set(k, { F: [], A: [], aPagar: 0, adiantado: 0 });
      const s = sobrasPorChave.get(k);
      s[l.lado].push(l);
      if (l.lado === 'F') s.aPagar += l.valor; else s.adiantado += l.valor;
    }

    function contaDoLado(lado, ls) {
      const lista = contas[lado];
      if (!lista.length) return null;
      if (lista.length === 1 || !ls || !ls.length) return lista[0];
      const soma = new Map();
      for (const l of ls) soma.set(l.conta, (soma.get(l.conta) || 0) + Math.abs(l.valor));
      let melhor = lista[0], maior = -1;
      for (const c of lista) { const v = soma.get(c.codigo) || 0; if (v > maior) { maior = v; melhor = c; } }
      return melhor;
    }

    // O participante (o código do fornecedor no sistema contábil, quando o razão traz — desenho H) de um conjunto
    // de linhas, para as colunas de participante do arquivo de ajustes: o que leva mais valor entre as linhas do
    // sinal pedido (as notas, os adiantamentos, os pagamentos); sem nenhuma, o de qualquer linha; senão, vazio.
    function participanteDe(ls, sinal) {
      const melhor = (so) => {
        const soma = new Map();
        for (const l of ls || []) {
          if (!l || !l.participante || (so && Math.sign(l.valor) !== so)) continue;
          soma.set(l.participante, (soma.get(l.participante) || 0) + Math.abs(l.valor));
        }
        let quem = '', maior = -1;
        soma.forEach((v, p) => { if (v > maior) { maior = v; quem = p; } });
        return quem;
      };
      return melhor(sinal) || melhor(0);
    }

    function historico(sentido, nome, cnpj, contaF, contaA) {
      const trechoCnpj = cnpj ? ' - CNPJ ' + Util.formatarCnpj(cnpj) : '';
      const a = contaA ? contaA.codigo + ' ' + contaA.nome : '';
      const f = contaF ? contaF.codigo + ' ' + contaF.nome : '';
      return textos[sentido](Util.semAcento(nome).toUpperCase(), trechoCnpj, a, f);
    }

    const sugestoes = [];
    const sugestaoDe = new Map();
    for (const [chave, s] of sobrasPorChave) {
      if (chave === SEM) continue;
      const forn = nomes.fornecedores[chave] || { nome: chave, cnpj: '' };
      let sug = null;
      if (s.aPagar > 0 && s.adiantado > 0) {
        // Direta (para fornecedores): reclassifica o MENOR dos dois. D fornecedores / C adiantamento.
        const valor = Math.min(s.aPagar, s.adiantado);
        const contaF = contaDoLado('F', s.F), contaA = contaDoLado('A', s.A);
        const k = 'direta|' + chave;
        sug = { chave: k, sentido: 'direta', fornecedor: chave, nome: forn.nome, cnpj: forn.cnpj, valor,
          aPagar: s.aPagar, adiantado: s.adiantado, suspeita: null, linhasF: s.F.map((l) => l.i), linhasA: s.A.map((l) => l.i),
          contaF, contaA, recusada: recusadas.has(k) };
        sug.marcada = !sug.recusada;
        sug.partes = [{ data: fimComp.texto, valor, notas: [], pagamentos: [] }];
      } else if (s.aPagar < 0) {
        // Inversa (para adiantamento): fornecedores DEVEDOR (pagamento sem nota, ou pago a
        // mais que a nota) -> o devedor INTEIRO vai para o adiantamento. C fornecedores / D adiantamento.
        // "entrou uma nota de quinze mil a crédito, só que pagou vinte mil. Logo eu tenho
        //  cinco mil a débito em fornecedores. Esse valor pago a maior tem que ir lá pra
        //  conta de adiantamento." (Dony) As linhas do adiantamento dele não entram (ele recebe).
        const valor = -s.aPagar;
        const notas = s.F.filter((l) => l.valor > 0);
        const pagamentos = s.F.filter((l) => l.valor < 0);
        const contaF = contaDoLado('F', s.F), contaA = contaDoLado('A', s.A);
        const k = 'inversa|' + chave;
        const suspeita = [forn.nome].concat(forn.grafias || []).map((g) => MotorNomes.pareceMeioDePagamento(g)).find(Boolean) || null;
        let partes;
        if (!notas.length) {
          // Só pagamentos, nenhuma nota: um lançamento por pagamento, na data de cada um
          // ("pra ficar aberto conforme a data"). Antes do início do razão -> primeiro dia do período.
          partes = pagamentos.slice().sort((x, y) => x.dia - y.dia || x.i - y.i).map((l) => {
            const data = inicioPeriodo && l.dia < inicioPeriodo.numero ? inicioPeriodo.texto : l.data;
            return { data, valor: -l.valor, linha: l.i, notas: [], pagamentos: [l.i] };
          });
        } else {
          // Notas e pagamentos misturados: um lançamento só, com o saldo, no fim da competência.
          partes = [{ data: fimComp.texto, valor, notas: notas.map((l) => l.i), pagamentos: pagamentos.map((l) => l.i) }];
        }
        sug = { chave: k, sentido: 'inversa', fornecedor: chave, nome: forn.nome, cnpj: forn.cnpj, valor,
          aPagar: s.aPagar, adiantado: s.adiantado, suspeita, linhasF: s.F.map((l) => l.i), linhasA: s.A.map((l) => l.i),
          contaF, contaA, recusada: recusadas.has(k), notas: notas.map((l) => l.i), pagamentos: pagamentos.map((l) => l.i), partes };
        // Nome que parece meio de pagamento -> a inversa vem DESMARCADA. Marcar fica guardado em "aceitas".
        sug.marcada = !sug.recusada && (!suspeita || aceitas.has(k));
        sug.desmarcadaPorSuspeita = !!suspeita && !aceitas.has(k) && !sug.recusada;
      }
      if (sug) {
        // Participantes: na direta, o das notas (D fornecedores) e o dos adiantamentos (C adiantamento); na inversa,
        // o do pagamento que muda de conta, nos dois lados.
        const pagos = (p) => participanteDe((p.pagamentos || []).map((i) => linhas[i]), -1) || participanteDe(s.F, -1);
        sug.lancamentos = sug.partes.map((p) => (sug.sentido === 'direta'
          ? { data: p.data, contaDebito: sug.contaF ? sug.contaF.codigo : '', contaCredito: sug.contaA ? sug.contaA.codigo : '', valor: p.valor,
            participanteDebito: participanteDe(s.F, 1), participanteCredito: participanteDe(s.A, 1),
            historico: historico('direta', sug.nome, sug.cnpj, sug.contaF, sug.contaA), sentido: 'direta', origem: sug.chave }
          : { data: p.data, contaDebito: sug.contaA ? sug.contaA.codigo : '', contaCredito: sug.contaF ? sug.contaF.codigo : '', valor: p.valor,
            participanteDebito: pagos(p), participanteCredito: pagos(p),
            historico: historico('inversa', sug.nome, sug.cnpj, sug.contaF, sug.contaA), sentido: 'inversa', origem: sug.chave }));
        sugestoes.push(sug);
        sugestaoDe.set(chave, sug);
      }
    }
    sugestoes.sort((a, b) => b.valor - a.valor || (a.nome < b.nome ? -1 : 1));

    // Lançamentos das reclassificações à mão.
    for (const m of manuais.validas) {
      const lsF = m.linhasF.map((i) => linhas[i]);
      const lsA = m.linhasA.map((i) => linhas[i]);
      const contaF = contaDoLado('F', lsF), contaA = contaDoLado('A', lsA);
      m.contaF = contaF;
      m.contaA = contaA;
      const pagos = (p) => participanteDe((p.marcas || []).map((d) => base.porDigital.get(d)), -1) || participanteDe(lsF, -1);
      m.lancamentos = m.sentido === 'direta'
        ? [{ data: fimComp.texto, contaDebito: contaF ? contaF.codigo : '', contaCredito: contaA ? contaA.codigo : '', valor: m.valor,
          participanteDebito: participanteDe(lsF, 1), participanteCredito: participanteDe(lsA, 1),
          historico: historico('direta', m.nome, m.cnpj, contaF, contaA), sentido: 'direta', origem: m.id }]
        : m.partes.map((p) => ({ data: inicioPeriodo && p.dia < inicioPeriodo.numero ? inicioPeriodo.texto : p.data,
          contaDebito: contaA ? contaA.codigo : '', contaCredito: contaF ? contaF.codigo : '', valor: p.valor,
          participanteDebito: pagos(p), participanteCredito: pagos(p),
          historico: historico('inversa', m.nome, m.cnpj, contaF, contaA), sentido: 'inversa', origem: m.id }));
    }
    const manualDe = new Map();
    for (const m of manuais.validas) for (const d of m.marcas) manualDe.set(d, m);

    // ------------------------------------------------------------------
    // Situação de cada linha
    // ------------------------------------------------------------------
    for (const l of linhas) {
      l.batida = e1.batidaDe.has(l.digital) ? e1.batidaDe.get(l.digital).id : null;
      l.manual = manualDe.has(l.digital) ? manualDe.get(l.digital).id : null;
      l.desfeita = desfeitaDe.has(l.digital) ? desfeitaDe.get(l.digital).id : null;
      l.fica = null;
      l.motivo = null;
      if (l.batida) { l.situacao = 'bateu'; continue; }
      if (l.manual) { l.situacao = 'manual'; continue; }
      if (l.dono.chave === SEM) { l.situacao = 'sem-fornecedor'; continue; }
      const s = sugestaoDe.get(l.dono.chave);
      const sobra = sobrasPorChave.get(l.dono.chave);
      if (!s) { l.situacao = 'sem-par'; continue; }
      if (s.sentido === 'direta') {
        if (!s.marcada) { l.situacao = 'recusada'; l.motivo = 'recusada'; continue; }
        const total = l.lado === 'F' ? sobra.aPagar : sobra.adiantado;
        if (s.valor === total) l.situacao = 'auto';
        else { l.situacao = 'parcial'; l.fica = total - s.valor; }
      } else {
        if (l.lado === 'A') { l.situacao = 'sem-par'; continue; }
        if (s.marcada) l.situacao = 'auto';
        else { l.situacao = 'recusada'; l.motivo = s.desmarcadaPorSuspeita ? 'suspeita' : 'recusada'; }
      }
    }

    // ------------------------------------------------------------------
    // Por fornecedor, CONTA POR CONTA (nunca numa linha só: parece saldo líquido).
    // ------------------------------------------------------------------
    const porChaveLado = new Map();
    for (const l of linhas) {
      const k = l.dono.chave + '|' + l.lado;
      if (!porChaveLado.has(k)) porChaveLado.set(k, { tinha: 0, linhas: 0, bateram: 0 });
      const r = porChaveLado.get(k);
      r.tinha += l.valor;
      r.linhas++;
      if (l.batida) r.bateram++;
    }
    const efeitoManual = new Map();   // chave|lado -> efeito
    for (const m of manuais.validas) {
      const sinal = m.sentido === 'direta' ? -1 : 1;
      for (const lado of ['F', 'A']) {
        const k = m.chave + '|' + lado;
        efeitoManual.set(k, (efeitoManual.get(k) || 0) + sinal * m.valor);
      }
    }
    const chavesComManual = new Set(manuais.validas.map((m) => m.chave));
    const porFornecedor = { F: [], A: [] };
    const todasChaves = new Set(Array.from(porChaveLado.keys()).map((k) => k.slice(0, k.lastIndexOf('|'))));
    for (const m of manuais.validas) todasChaves.add(m.chave);
    for (const chave of todasChaves) {
      const forn = nomes.fornecedores[chave] || { nome: chave === SEM ? 'Sem fornecedor' : chave, cnpj: '' };
      const s = sugestaoDe.get(chave);
      const sobra = sobrasPorChave.get(chave) || { aPagar: 0, adiantado: 0 };
      for (const lado of ['F', 'A']) {
        const base0 = porChaveLado.get(chave + '|' + lado) || { tinha: 0, linhas: 0, bateram: 0 };
        let reclassificado = efeitoManual.get(chave + '|' + lado) || 0;
        if (s && s.marcada) reclassificado += (s.sentido === 'direta' ? -1 : 1) * s.valor;
        const envolvido = base0.linhas > 0 || reclassificado !== 0 || (s && (lado === 'F' || s.sentido === 'direta' || s.marcada));
        if (!envolvido) continue;
        let situacao;
        const tinhaSobra = lado === 'F' ? sobra.aPagar : sobra.adiantado;
        if (chave === SEM) situacao = 'sem-fornecedor';
        else if (chavesComManual.has(chave) && (efeitoManual.get(chave + '|' + lado) || 0) !== 0) situacao = 'a-mao';
        else if (s && s.sentido === 'direta') situacao = s.marcada ? 'reclassificado' : 'recusado';
        else if (s && s.sentido === 'inversa') {
          if (lado === 'F') situacao = s.marcada ? 'para-adiantamento' : (s.desmarcadaPorSuspeita ? 'devedor' : 'recusado');
          else situacao = s.marcada ? (tinhaSobra !== 0 ? 'adiantamento-e-devedor' : 'de-principal') :
            (tinhaSobra > 0 ? 'so-adiantamento' : tinhaSobra < 0 ? 'adiantamento-credor' : 'zerado');
        } else if (lado === 'F') situacao = base0.tinha > 0 ? 'so-a-pagar' : base0.tinha < 0 ? 'devedor' : 'zerado';
        else situacao = base0.tinha > 0 ? 'so-adiantamento' : base0.tinha < 0 ? 'adiantamento-credor' : 'zerado';
        porFornecedor[lado].push({ chave, nome: forn.nome, cnpj: forn.cnpj, lado, tinha: base0.tinha, linhas: base0.linhas,
          bateram: base0.bateram, reclassificado, fica: base0.tinha + reclassificado, situacao });
      }
    }
    for (const lado of ['F', 'A']) porFornecedor[lado].sort((a, b) => Math.abs(b.fica) - Math.abs(a.fica) || (a.nome < b.nome ? -1 : 1));

    // ------------------------------------------------------------------
    // Totais e conferências (nenhum número sem conferência)
    // ------------------------------------------------------------------
    const ajustes = [];
    for (const m of manuais.validas) ajustes.push.apply(ajustes, m.lancamentos);
    for (const s of sugestoes) if (s.marcada) ajustes.push.apply(ajustes, s.lancamentos);
    const totalArquivo = ajustes.reduce((t, a) => t + a.valor, 0);

    const totais = {};
    const falhas = [];
    for (const lado of ['F', 'A']) {
      const ls = linhas.filter((l) => l.lado === lado);
      const sobras = ls.filter((l) => !l.batida);
      const saldoAnterior = contas[lado].reduce((t, c) => t + c.saldoAnterior, 0);
      const movimento = ls.reduce((t, l) => t + l.valor, 0);
      let efeito = 0;
      for (const s of sugestoes) if (s.marcada) efeito += (s.sentido === 'direta' ? -1 : 1) * s.valor;
      for (const m of manuais.validas) efeito += (m.sentido === 'direta' ? -1 : 1) * m.valor;
      const somaSobras = sobras.reduce((t, l) => t + l.valor, 0);
      const naoBateu = sobras.filter((l) => l.situacao !== 'auto' && l.situacao !== 'manual');
      totais[lado] = {
        titulo: textos[lado],
        linhas: ls.length,
        batidas: e1.batidas.filter((b) => b.lado === lado).length,
        bateram: ls.length - sobras.length,
        sobraram: sobras.length,
        sobras: somaSobras,
        saldoAnterior,
        movimento,
        saldoFinal: saldoAnterior + movimento,
        efeitoAjustes: efeito,
        emAberto: saldoAnterior + somaSobras + efeito,
        saldoDepoisDosAjustes: saldoAnterior + movimento + efeito,
        naoBateu: { qtd: naoBateu.length, valor: naoBateu.reduce((t, l) => t + l.valor, 0) },
        semFornecedor: { qtd: sobras.filter((l) => l.dono.chave === SEM).length, valor: sobras.filter((l) => l.dono.chave === SEM).reduce((t, l) => t + l.valor, 0) },
      };
      // Invariante: a soma do que sobra de cada fornecedor = saldo dele, no centavo.
      for (const [k, r] of porChaveLado) {
        if (!k.endsWith('|' + lado)) continue;
        const chave = k.slice(0, k.lastIndexOf('|'));
        const s = sobras.filter((l) => l.dono.chave === chave).reduce((t, l) => t + l.valor, 0);
        if (s !== r.tinha) falhas.push('Sobras de ' + chave + ' (' + lado + ') não fecham com o saldo dele: ' + Util.formatarCentavos(s) + ' × ' + Util.formatarCentavos(r.tinha));
      }
      // Soma dos fornecedores + saldo anterior = saldo da conta.
      const somaForn = Array.from(porChaveLado.entries()).filter(([k]) => k.endsWith('|' + lado)).reduce((t, [, r]) => t + r.tinha, 0);
      const saldoContas = contas[lado].reduce((t, c) => t + c.saldoFinal, 0);
      if (saldoAnterior + somaForn !== saldoContas) falhas.push('Soma dos fornecedores + saldo anterior (' + lado + ') não fecha com o saldo da conta.');
      // E o saldo final que o RAZÃO declara (quando nenhuma linha ficou fora da competência).
      if (!base.foraDaCompetencia) {
        for (const c of contas[lado]) {
          if (c.saldoFinalRazao !== null && c.saldoFinalRazao !== c.saldoFinal) {
            falhas.push('Conta ' + c.codigo + ': saldo anterior + linhas = ' + Util.formatarCentavos(c.saldoFinal) + ', mas o razão diz ' + Util.formatarCentavos(c.saldoFinalRazao) + '.');
          }
        }
      }
      // Em aberto = saldo da conta mexido pelos ajustes.
      if (totais[lado].emAberto !== totais[lado].saldoDepoisDosAjustes) falhas.push('Em aberto (' + lado + ') não fecha com o saldo da conta mexido pelos ajustes.');
    }
    // Total do arquivo = sugestões aceitas + à mão.
    const somaAceitas = sugestoes.filter((s) => s.marcada).reduce((t, s) => t + s.valor, 0);
    const somaManuais = manuais.validas.reduce((t, m) => t + m.valor, 0);
    if (totalArquivo !== somaAceitas + somaManuais) falhas.push('Total do arquivo de ajustes não fecha com as sugestões aceitas + à mão.');

    const diretas = sugestoes.filter((s) => s.sentido === 'direta' && s.marcada);
    const inversas = sugestoes.filter((s) => s.sentido === 'inversa' && s.marcada);
    const mDiretas = manuais.validas.filter((m) => m.sentido === 'direta');
    const mInversas = manuais.validas.filter((m) => m.sentido === 'inversa');
    const resumo = {
      F: { linhas: totais.F.linhas, bateram: totais.F.bateram, sobraram: totais.F.sobraram, batidas: totais.F.batidas, emAberto: totais.F.emAberto },
      A: { linhas: totais.A.linhas, bateram: totais.A.bateram, sobraram: totais.A.sobraram, batidas: totais.A.batidas, emAberto: totais.A.emAberto },
      sugeridas: sugestoes.length,
      aceitas: sugestoes.filter((s) => s.marcada).length,
      manuais: manuais.validas.length,
      diretas: { qtd: diretas.length + mDiretas.length, valor: diretas.reduce((t, s) => t + s.valor, 0) + mDiretas.reduce((t, m) => t + m.valor, 0) },
      inversas: { qtd: inversas.length + mInversas.length, valor: inversas.reduce((t, s) => t + s.valor, 0) + mInversas.reduce((t, m) => t + m.valor, 0) },
      suspeitasDesmarcadas: sugestoes.filter((s) => s.desmarcadaPorSuspeita).length,
      naoBateu: { F: totais.F.naoBateu, A: totais.A.naoBateu },
      semFornecedor: { qtd: totais.F.semFornecedor.qtd + totais.A.semFornecedor.qtd, valor: totais.F.semFornecedor.valor + totais.A.semFornecedor.valor },
      arquivo: { lancamentos: ajustes.length, total: totalArquivo },
      conferido: falhas.length === 0,
    };

    return {
      natureza, competencia: entrada.competencia, periodo, textos: { F: textos.F, A: textos.A },
      linhas, contas, foraDaCompetencia: base.foraDaCompetencia,
      batidas: e1.batidas, sugestoes, manuais: manuais.validas, manuaisQueNaoEncaixam: manuais.naoEncaixam,
      desfeitasQueNaoEncaixam: base.desfeitasQueNaoEncaixam,
      porFornecedor, totais, resumo, ajustes, totalArquivo,
      fornecedores: nomes.fornecedores, regras: nomes.regras, naoEntendidos: nomes.naoEntendidos,
      invariantes: { ok: falhas.length === 0, falhas },
      ms: { etapa1: base.ms, total: Date.now() - t0 },
    };
  }

  // ------------------------------------------------------------------
  // 1.3 — RAZÃO LIMPO: o que compõe o saldo de cada conta depois do ① (Dony, 19/09/2026: "o razão de
  // fornecedores limpo, só o que tiver a crédito, já que a gente tirou tudo que era débito; e o razão de
  // adiantamento, só o que for a débito — só os saldos que ambos compõem —, por lançamento ou por fornecedor,
  // para mandar ao financeiro encontrar o que aconteceu com esses pagamentos").
  // Parte do resultado do calcularPasso1 e usa as reclassificações do arquivo de ajustes (marcadas e à mão):
  //  - o que bateu dentro do razão sai;
  //  - reclassificação direta: abate o mesmo valor nas duas contas, no fim da competência;
  //  - inversa: o saldo devedor do fornecedor sai de fornecedores e entra no adiantamento como os PAGAMENTOS
  //    que o formam (as notas abatem os pagamentos mais antigos; ficam os mais novos);
  //  - em cada fornecedor e conta, o que diminui o saldo abate o que forma o saldo, do mais antigo para o
  //    mais novo (a nota mais antiga é paga primeiro). Fica só o que forma o saldo, com o valor em aberto.
  // Conferência: a soma do que fica + o saldo anterior (que o razão não abre por fornecedor) = o em aberto do ①.
  // ------------------------------------------------------------------
  // Dentro de um fornecedor e de uma conta: o negativo abate o positivo, do mais antigo para o mais novo, e
  // cada um guarda o que o abateu (resto = o que sobra em aberto).
  function abater(itens) {
    const ordem = (a, b) => a.dia - b.dia || a.i - b.i;
    const formam = itens.filter((x) => x.resto > 0).sort(ordem);
    const baixam = itens.filter((x) => x.resto < 0).sort(ordem);
    let k = 0;
    for (const b of baixam) {
      while (b.resto < 0 && k < formam.length) {
        const f = formam[k];
        const v = Math.min(f.resto, -b.resto);
        f.resto -= v;
        b.resto += v;
        f.abatimentos.push({ data: b.data, valor: v, historico: b.historico, numero: b.numero, origem: b.origem });
        b.abatimentos.push({ data: f.data, valor: v, historico: f.historico, numero: f.numero, origem: f.origem });
        if (f.resto === 0) k++;
      }
    }
  }

  function composicao(r) {
    const fim = Util.fimDaCompetencia(r.competencia) || Util.hoje();
    const pools = { F: new Map(), A: new Map() };
    const doPool = (lado, chave) => { if (!pools[lado].has(chave)) pools[lado].set(chave, []); return pools[lado].get(chave); };
    const daLinha = (l) => ({ lado: l.lado, chave: l.dono.chave, data: l.data, dia: l.dia, i: l.i, historico: l.historico || '', numero: l.numero || '',
      contrapartida: l.contrapartida || '', conta: l.conta, contaNome: l.contaNome || '', valor: l.valor, resto: l.valor, origem: 'razao', abatimentos: [], digital: l.digital });
    const virtual = (lado, chave, valor, historico, origem) => ({ lado, chave, data: fim.texto, dia: fim.numero, i: Infinity, historico: historico || '', numero: '',
      contrapartida: '', conta: '', contaNome: '', valor, resto: valor, origem, abatimentos: [], virtual: true });
    const hist = (x) => (x.lancamentos && x.lancamentos[0] ? x.lancamentos[0].historico : '');
    const movidas = new Set();

    // Inversas: as linhas de fornecedores saem de lá; o que elas deixam devedor (os pagamentos que sobram
    // depois de as notas abaterem os mais antigos) entra no adiantamento do dono de cada linha.
    const inversas = r.sugestoes.filter((s) => s.marcada && s.sentido === 'inversa').map((s) => ({ linhas: s.linhasF, historico: hist(s) }))
      .concat(r.manuais.filter((m) => m.sentido === 'inversa').map((m) => ({ linhas: m.linhasF, historico: hist(m) })));
    for (const inv of inversas) {
      const itens = inv.linhas.map((i) => r.linhas[i]).map((l) => { movidas.add(l.i); return daLinha(l); });
      abater(itens);
      for (const x of itens) {
        if (x.resto >= 0) continue;
        doPool('A', x.chave).push(Object.assign({}, x, { lado: 'A', valor: -x.valor, resto: -x.resto, origem: 'inversa', reclassificacao: inv.historico,
          abatimentos: x.abatimentos.map((a) => Object.assign({}, a, { daNota: true })) }));
      }
    }
    // O que não bateu dentro do razão (e não foi para o adiantamento pela inversa).
    for (const l of r.linhas) {
      if (l.situacao === 'bateu' || movidas.has(l.i)) continue;
      doPool(l.lado, l.dono.chave).push(daLinha(l));
    }
    // Diretas: abatem o mesmo valor nas duas contas, no fim da competência (cada conta no dono das linhas dela).
    const dono = (idxs, reserva) => (idxs && idxs.length ? r.linhas[idxs[0]].dono.chave : reserva);
    for (const s of r.sugestoes) {
      if (!s.marcada || s.sentido !== 'direta') continue;
      for (const lado of ['F', 'A']) doPool(lado, s.fornecedor).push(virtual(lado, s.fornecedor, -s.valor, hist(s), 'direta'));
    }
    for (const m of r.manuais) {
      if (m.sentido !== 'direta') continue;
      doPool('F', dono(m.linhasF, m.chave)).push(virtual('F', dono(m.linhasF, m.chave), -m.valor, hist(m), 'direta'));
      doPool('A', dono(m.linhasA, m.chave)).push(virtual('A', dono(m.linhasA, m.chave), -m.valor, hist(m), 'direta'));
    }

    const nomeDe = (chave) => (chave === SEM ? { nome: 'Sem fornecedor', cnpj: '' } : r.fornecedores[chave] || { nome: chave, cnpj: '' });
    function daConta(lado) {
      const itens = [];
      for (const [chave, lista] of pools[lado]) {
        // Linhas sem fornecedor não se abatem umas com as outras (podem ser de fornecedores diferentes): ficam como estão.
        if (chave !== SEM) abater(lista);
        const f = nomeDe(chave);
        for (const x of lista) if (x.resto !== 0) itens.push(Object.assign(x, { nome: f.nome, cnpj: f.cnpj || '' }));
      }
      itens.sort((a, b) => a.dia - b.dia || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0) || a.i - b.i);
      const porChave = new Map();
      for (const x of itens) {
        if (!porChave.has(x.chave)) porChave.set(x.chave, { chave: x.chave, nome: x.nome, cnpj: x.cnpj, itens: [], total: 0 });
        const g = porChave.get(x.chave);
        g.itens.push(x);
        g.total += x.resto;
      }
      const fornecedores = Array.from(porChave.values()).sort((a, b) => (a.chave === SEM) - (b.chave === SEM) || Util.normalizarNome(a.nome).localeCompare(Util.normalizarNome(b.nome)));
      const total = itens.reduce((t, x) => t + x.resto, 0);
      const t = r.totais[lado];
      return {
        lado, titulo: r.textos[lado], contas: r.contas[lado], saldoAnterior: t.saldoAnterior, itens, fornecedores, total,
        saldo: t.saldoAnterior + total, emAberto: t.emAberto, confere: t.saldoAnterior + total === t.emAberto,
        // Conta com o lado trocado (fornecedores devedor, adiantamento credor) que não foi reclassificada.
        invertidos: itens.filter((x) => x.resto < 0).length,
        parciais: itens.filter((x) => x.resto !== x.valor).length,
      };
    }
    return { competencia: r.competencia, fim: fim.texto, F: daConta('F'), A: daConta('A') };
  }

  // ------------------------------------------------------------------
  // Passo ④ — FORNECEDORES · SOMENTE RAZÃO (Dony, 22/09/2026: "a conciliação de fornecedor só o razão contra o próprio
  // razão, só para pegar distorções dentro do próprio razão; se eu tiver o diário, vai ser o diário. Ele só vai pegar
  // débito e crédito e vai me mostrar tudo que tem a crédito em aberto e tudo que está em débito em aberto").
  // As mesmas batidas do ① dentro do razão de fornecedores (1x1, 1xN, Nx1, zerou e mesmo-dia, fornecedor por
  // fornecedor), sem adiantamento e sem reclassificação. O que não bateu fica em aberto: a crédito (valor > 0 no lado F:
  // nota sem pagamento) ou a débito (pagamento sem nota). Conferência: cada batida soma zero, então o saldo anterior + o
  // que ficou em aberto = o saldo final do razão, no centavo.
  // entrada: { competencia, contas: { F: [fonte] }, titulos (opcional: ajudam a reconhecer os nomes), decisoes: { donos } }
  // ------------------------------------------------------------------
  function somenteRazao(entrada) {
    const t0 = Date.now();
    const natureza = entrada.natureza || 'fornecedores';
    const e = Object.assign({}, entrada, { natureza, contas: { F: (entrada.contas && entrada.contas.F) || [], A: [] } });
    const montadas = montarLinhas(e);
    const linhas = montadas.linhas;
    const nomes = MotorNomes.resolver(linhas, { donos: (entrada.decisoes && entrada.decisoes.donos) || {}, titulos: entrada.titulos || [] });
    for (const l of linhas) l.dono = nomes.porLinha.get(l.digital);
    const e1 = etapa1(linhas, new Set());
    for (const l of linhas) {
      const b = e1.batidaDe.get(l.digital);
      l.situacao = b ? 'bateu' : 'aberta';
      l.batida = b ? b.id : null;
      l.como = b ? b.como : null;
    }
    const nomeDe = (chave) => (chave === SEM ? { nome: 'Sem fornecedor', cnpj: '' } : nomes.fornecedores[chave] || { nome: chave, cnpj: '' });
    const abertas = linhas.filter((l) => l.situacao === 'aberta' && l.valor !== 0);
    const credito = abertas.filter((l) => l.valor > 0);
    const debito = abertas.filter((l) => l.valor < 0);
    // Por fornecedor: o que ficou em aberto de cada lado e o saldo (o fornecedor com os dois lados em aberto é o
    // primeiro lugar para procurar distorção: pagamento que não casou com a nota).
    const porChave = new Map();
    for (const l of abertas) {
      const k = l.dono.chave;
      if (!porChave.has(k)) { const f = nomeDe(k); porChave.set(k, { chave: k, nome: f.nome, cnpj: f.cnpj || '', credito: 0, debito: 0, qtdCredito: 0, qtdDebito: 0, saldo: 0, linhas: [] }); }
      const g = porChave.get(k);
      if (l.valor > 0) { g.credito += l.valor; g.qtdCredito++; } else { g.debito -= l.valor; g.qtdDebito++; }
      g.saldo += l.valor;
      g.linhas.push(l.i);
    }
    const porFornecedor = Array.from(porChave.values()).map((g) => Object.assign(g, { osDoisLados: g.qtdCredito > 0 && g.qtdDebito > 0 }))
      .sort((a, b) => (a.chave === SEM) - (b.chave === SEM) || Util.normalizarNome(a.nome).localeCompare(Util.normalizarNome(b.nome)));
    const soma = (xs) => xs.reduce((t, l) => t + l.valor, 0);
    const saldoAnterior = montadas.contas.F.reduce((t, c) => t + c.saldoAnterior, 0);
    const movimento = soma(linhas);
    const somaCredito = soma(credito), somaDebito = -soma(debito);
    const falhas = [];
    for (const b of e1.batidas) if (b.linhas.reduce((t, i) => t + linhas[i].valor, 0) !== 0) falhas.push('Batida ' + b.id + ' não soma zero.');
    if (somaCredito - somaDebito !== movimento) falhas.push('O que ficou em aberto (' + Util.formatarCentavos(somaCredito - somaDebito) + ') não é o movimento do razão (' + Util.formatarCentavos(movimento) + ').');
    const porFornecedorSoma = porFornecedor.reduce((t, g) => t + g.saldo, 0);
    if (porFornecedorSoma !== somaCredito - somaDebito) falhas.push('A soma por fornecedor não fecha com o que ficou em aberto.');
    if (!montadas.foraDaCompetencia) {
      for (const c of montadas.contas.F) {
        if (c.saldoFinalRazao !== null && c.saldoFinalRazao !== c.saldoFinal) {
          falhas.push('Conta ' + c.codigo + ': saldo anterior + linhas = ' + Util.formatarCentavos(c.saldoFinal) + ', mas o razão diz ' + Util.formatarCentavos(c.saldoFinalRazao) + '.');
        }
      }
    }
    const bateram = linhas.filter((l) => l.situacao === 'bateu').length;
    return {
      natureza, competencia: entrada.competencia, textos: TEXTOS[natureza], linhas, contas: montadas.contas.F, foraDaCompetencia: montadas.foraDaCompetencia,
      batidas: e1.batidas, abertas: { credito, debito }, porFornecedor, fornecedores: nomes.fornecedores,
      totais: {
        linhas: linhas.length, bateram, batidas: e1.batidas.length, zeradas: linhas.filter((l) => l.valor === 0).length,
        credito: { qtd: credito.length, valor: somaCredito }, debito: { qtd: debito.length, valor: somaDebito },
        saldoAnterior, movimento, saldoFinal: saldoAnterior + movimento,
        fornecedoresComOsDoisLados: porFornecedor.filter((g) => g.osDoisLados).length,
      },
      invariantes: { ok: falhas.length === 0, falhas },
      ms: Date.now() - t0,
    };
  }

  return {
    JANELA_DIAS, MAX_ITENS, MAX_CANDIDATAS, MAX_PASSOS, TEXTOS,
    valorNoLado, saldoNoLado, montarLinhas, buscarSoma, etapa1, aplicarManuais, idDaBatida, idDaManual, calcularPasso1, composicao, somenteRazao,
  };
});
