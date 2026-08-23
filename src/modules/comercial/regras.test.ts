import { describe, expect, it } from "vitest";
import {
  REGRAS_COMERCIAIS,
  avaliarRegras,
  regraClienteElegivelReativacao,
  regraClienteInativo,
  regraFollowUpVencido,
  regraNegociacaoParadaNoEstagio,
  regraNegociacaoSemInteracao,
  regraPropostaPertoDaValidade,
  type ContextoRegras,
  type LinhaClienteRegra,
  type LinhaFollowUp,
  type LinhaNegociacaoRegra,
  type LinhaPropostaRegra,
  type ParametrosRegras,
} from "./regras";

/**
 * Todo teste usa `hoje` FIXO (aceite da F7.1). Nenhum depende do dia em que roda — é a diferença
 * entre um teste de regra temporal e uma bomba-relógio que quebra sozinha daqui a um mês.
 */

const HOJE = new Date("2026-08-22T15:00:00.000Z"); // 12:00 em Recife (UTC-3)

/** Uma data N dias ANTES de `HOJE`, em dias civis. */
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86_400_000);
/** Uma data N dias DEPOIS de `HOJE`. */
const diasAFrente = (n: number) => new Date(HOJE.getTime() + n * 86_400_000);

const PARAMETROS: ParametrosRegras = {
  diasSemContato: 15,
  diasAvisoValidadeProposta: 7,
  diasClienteInativo: 180,
  diasParadoNoEstagio: 30,
  diasParaReativar: 360,
};

function ctx(over: Partial<ContextoRegras> = {}): ContextoRegras {
  return {
    hoje: HOJE,
    parametros: PARAMETROS,
    followUps: [],
    propostas: [],
    negociacoes: [],
    clientes: [],
    ...over,
  };
}

const followUp = (o: Partial<LinhaFollowUp> & { id: string }): LinhaFollowUp => ({
  titulo: "Ligar para o cliente",
  inicio: HOJE,
  concluidoEm: null,
  responsavelId: "user-1",
  entidadeTipo: "NEGOCIACAO",
  entidadeId: `ent-${o.id}`,
  ...o,
});

const proposta = (o: Partial<LinhaPropostaRegra> & { id: string }): LinhaPropostaRegra => ({
  numero: `PR-${o.id}`,
  validade: null,
  status: "enviada",
  responsavelId: "user-1",
  ...o,
});

const negociacao = (o: Partial<LinhaNegociacaoRegra> & { id: string }): LinhaNegociacaoRegra => ({
  titulo: "Obra X",
  estagio: "ORCAMENTO",
  responsavelId: "user-1",
  ultimaInteracaoEm: HOJE,
  estagioDesde: HOJE,
  criadoEm: HOJE,
  ...o,
});

const cliente = (o: Partial<LinhaClienteRegra> & { id: string }): LinhaClienteRegra => ({
  nome: "Construtora Aurora",
  ultimoContratoEm: null,
  temNegociacaoAberta: false,
  recorrente: false,
  responsavelId: "user-1",
  ...o,
});

describe("1 — follow-up vencido", () => {
  it("dispara para ação com data passada e não concluída", () => {
    const r = regraFollowUpVencido.avaliar(ctx({ followUps: [followUp({ id: "a", inicio: diasAtras(3) })] }));
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("3 dia(s)");
  });

  it("NÃO dispara para ação de hoje — ainda dá tempo", () => {
    expect(regraFollowUpVencido.avaliar(ctx({ followUps: [followUp({ id: "a", inicio: HOJE })] }))).toHaveLength(0);
  });

  it("NÃO dispara para ação futura", () => {
    expect(
      regraFollowUpVencido.avaliar(ctx({ followUps: [followUp({ id: "a", inicio: diasAFrente(2) })] })),
    ).toHaveLength(0);
  });

  it("concluída sai da fila mesmo estando vencida", () => {
    const f = followUp({ id: "a", inicio: diasAtras(10), concluidoEm: diasAtras(1) });
    expect(regraFollowUpVencido.avaliar(ctx({ followUps: [f] }))).toHaveLength(0);
  });

  it("o link aponta para lead ou negociação conforme a âncora", () => {
    const c = ctx({
      followUps: [
        followUp({ id: "a", inicio: diasAtras(1), entidadeTipo: "LEAD", entidadeId: "L1" }),
        followUp({ id: "b", inicio: diasAtras(1), entidadeTipo: "NEGOCIACAO", entidadeId: "N1" }),
      ],
    });
    const hrefs = regraFollowUpVencido.avaliar(c).map((o) => o.href);
    expect(hrefs).toContain("/comercial/leads/L1");
    expect(hrefs).toContain("/comercial/negociacoes/N1");
  });
});

describe("2 — proposta perto da validade", () => {
  it("dispara dentro da antecedência configurada (7 dias)", () => {
    const r = regraPropostaPertoDaValidade.avaliar(
      ctx({ propostas: [proposta({ id: "p1", validade: diasAFrente(3) })] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("3 dia(s)");
  });

  it("vence hoje tem texto próprio, não '0 dia(s)'", () => {
    const r = regraPropostaPertoDaValidade.avaliar(
      ctx({ propostas: [proposta({ id: "p1", validade: HOJE })] }),
    );
    expect(r[0].corpo).toContain("vence hoje");
  });

  it("na fronteira exata do limiar ainda dispara (7 dias com limiar 7)", () => {
    expect(
      regraPropostaPertoDaValidade.avaliar(ctx({ propostas: [proposta({ id: "p", validade: diasAFrente(7) })] })),
    ).toHaveLength(1);
  });

  it("além do limiar não dispara (8 dias com limiar 7)", () => {
    expect(
      regraPropostaPertoDaValidade.avaliar(ctx({ propostas: [proposta({ id: "p", validade: diasAFrente(8) })] })),
    ).toHaveLength(0);
  });

  it("proposta JÁ vencida não entra — é a F5.7 que cuida dela", () => {
    // As duas regras não podem notificar o mesmo fato, senão o time recebe em dobro.
    expect(
      regraPropostaPertoDaValidade.avaliar(ctx({ propostas: [proposta({ id: "p", validade: diasAtras(1) })] })),
    ).toHaveLength(0);
  });

  it("aceita, recusada e rascunho ficam de fora", () => {
    const c = ctx({
      propostas: [
        proposta({ id: "a", validade: diasAFrente(2), status: "aceita" }),
        proposta({ id: "b", validade: diasAFrente(2), status: "recusada" }),
        proposta({ id: "c", validade: diasAFrente(2), status: "rascunho" }),
        proposta({ id: "d", validade: diasAFrente(2), status: "em_negociacao" }),
      ],
    });
    const ids = regraPropostaPertoDaValidade.avaliar(c).map((o) => o.entidadeId);
    expect(ids).toEqual(["d"]);
  });

  it("sem validade definida, a regra não se aplica", () => {
    expect(
      regraPropostaPertoDaValidade.avaliar(ctx({ propostas: [proposta({ id: "p", validade: null })] })),
    ).toHaveLength(0);
  });
});

describe("3 — negociação sem interação há X dias", () => {
  it("dispara passando o limiar (15 dias)", () => {
    const r = regraNegociacaoSemInteracao.avaliar(
      ctx({ negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(20) })] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("20 dia(s)");
  });

  it("na fronteira exata dispara (15 com limiar 15)", () => {
    expect(
      regraNegociacaoSemInteracao.avaliar(ctx({ negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(15) })] })),
    ).toHaveLength(1);
  });

  it("abaixo do limiar não dispara (14 com limiar 15)", () => {
    expect(
      regraNegociacaoSemInteracao.avaliar(ctx({ negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(14) })] })),
    ).toHaveLength(0);
  });

  it("sem NENHUMA interação usa a criação como marco — e diz isso no texto", () => {
    // Negociação aberta há 40 dias e nunca tocada é exatamente o caso que a regra existe pra pegar.
    const r = regraNegociacaoSemInteracao.avaliar(
      ctx({ negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: null, criadoEm: diasAtras(40) })] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("nunca teve interação");
  });

  it("negociação encerrada ou contratada não gera cobrança", () => {
    const c = ctx({
      negociacoes: [
        negociacao({ id: "a", estagio: "CONTRATADO", ultimaInteracaoEm: diasAtras(90) }),
        negociacao({ id: "b", estagio: "PERDIDO", ultimaInteracaoEm: diasAtras(90) }),
        negociacao({ id: "c", estagio: "CANCELADO", ultimaInteracaoEm: diasAtras(90) }),
        negociacao({ id: "d", estagio: "EM_ESPERA", ultimaInteracaoEm: diasAtras(90) }),
      ],
    });
    // EM_ESPERA também fica de fora: foi pausada de propósito, cobrar seria barulho.
    expect(regraNegociacaoSemInteracao.avaliar(c)).toHaveLength(0);
  });
});

describe("4 — negociação parada no mesmo estágio há Z dias", () => {
  it("dispara passando o limiar (30 dias)", () => {
    const r = regraNegociacaoParadaNoEstagio.avaliar(
      ctx({ negociacoes: [negociacao({ id: "n", estagioDesde: diasAtras(45) })] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("45 dia(s)");
  });

  it("é INDEPENDENTE da regra 3: com contato recente e estágio parado, só a 4 dispara", () => {
    // O ponto de existirem as duas: contato em dia não significa progresso.
    const c = ctx({
      negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(1), estagioDesde: diasAtras(60) })],
    });
    expect(regraNegociacaoSemInteracao.avaliar(c)).toHaveLength(0);
    expect(regraNegociacaoParadaNoEstagio.avaliar(c)).toHaveLength(1);
  });

  it("sem histórico de estágio NÃO dispara — não dá pra chutar", () => {
    // Anterior à F3.2 ou sintética da F5.2. Usar a criação acusaria toda negociação antiga de
    // "parada" no primeiro tick, que é ruído em massa no dia do deploy.
    expect(
      regraNegociacaoParadaNoEstagio.avaliar(
        ctx({ negociacoes: [negociacao({ id: "n", estagioDesde: null, criadoEm: diasAtras(365) })] }),
      ),
    ).toHaveLength(0);
  });
});

describe("5 — cliente inativo há Y dias", () => {
  it("dispara passando o limiar (180 dias)", () => {
    const r = regraClienteInativo.avaliar(
      ctx({ clientes: [cliente({ id: "c", ultimoContratoEm: diasAtras(200) })] }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].corpo).toContain("200 dia(s)");
  });

  it("quem NUNCA contratou não é 'inativo' — é prospecção, outro problema", () => {
    expect(
      regraClienteInativo.avaliar(ctx({ clientes: [cliente({ id: "c", ultimoContratoEm: null })] })),
    ).toHaveLength(0);
  });

  it("com negociação aberta fica de fora — já está sendo tratado", () => {
    expect(
      regraClienteInativo.avaliar(
        ctx({ clientes: [cliente({ id: "c", ultimoContratoEm: diasAtras(300), temNegociacaoAberta: true })] }),
      ),
    ).toHaveLength(0);
  });
});

describe("6 — cliente elegível a reativação", () => {
  it("exige recorrência E o limiar próprio de reativação (360d)", () => {
    const recorrenteMuitoParado = cliente({
      id: "c",
      ultimoContratoEm: diasAtras(400), // > diasParaReativar = 360
      recorrente: true,
    });
    expect(regraClienteElegivelReativacao.avaliar(ctx({ clientes: [recorrenteMuitoParado] }))).toHaveLength(1);
  });

  it("cliente de uma compra só NÃO entra, por mais parado que esteja", () => {
    // Quem fechou uma obra e sumiu pode não ter mais demanda; quem voltou já mostrou que repete.
    const umaCompraSo = cliente({ id: "c", ultimoContratoEm: diasAtras(2000), recorrente: false });
    expect(regraClienteElegivelReativacao.avaliar(ctx({ clientes: [umaCompraSo] }))).toHaveLength(0);
    // Mas a regra 5 (inativo) pega ele — as duas cobrem coisas diferentes.
    expect(regraClienteInativo.avaliar(ctx({ clientes: [umaCompraSo] }))).toHaveLength(1);
  });

  it("recorrente parado só um pouco (200d) aciona a 5, não a 6", () => {
    const c = ctx({ clientes: [cliente({ id: "c", ultimoContratoEm: diasAtras(200), recorrente: true })] });
    expect(regraClienteInativo.avaliar(c)).toHaveLength(1);
    expect(regraClienteElegivelReativacao.avaliar(c)).toHaveLength(0);
  });
});

describe("contrato do registro e da chave de dedup", () => {
  it("as 6 regras estão registradas, com chaves únicas", () => {
    expect(REGRAS_COMERCIAIS).toHaveLength(6);
    const chaves = REGRAS_COMERCIAIS.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(6);
  });

  it("toda regra tem título e descrição pt-BR não vazios (vão para a tela de config)", () => {
    for (const r of REGRAS_COMERCIAIS) {
      expect(r.titulo.length).toBeGreaterThan(0);
      expect(r.descricao.length).toBeGreaterThan(0);
    }
  });

  it("a chave de dedup inclui a DATA — mesmo dia repete, dia seguinte notifica de novo (F7.4)", () => {
    const c1 = ctx({ followUps: [followUp({ id: "a", inicio: diasAtras(5) })] });
    const c2 = { ...c1, hoje: new Date("2026-08-23T15:00:00.000Z") };
    const k1 = regraFollowUpVencido.avaliar(c1)[0].chaveDedup;
    const k2 = regraFollowUpVencido.avaliar(c2)[0].chaveDedup;
    expect(k1).toContain("2026-08-22");
    expect(k2).toContain("2026-08-23");
    expect(k1).not.toBe(k2);
  });

  it("rodar a MESMA avaliação duas vezes dá a mesma chave (idempotência do tick)", () => {
    const c = ctx({ followUps: [followUp({ id: "a", inicio: diasAtras(5) })] });
    expect(regraFollowUpVencido.avaliar(c)[0].chaveDedup).toBe(regraFollowUpVencido.avaliar(c)[0].chaveDedup);
  });

  it("toda ocorrência carrega href e responsável — é o que a F7.3 precisa para notificar", () => {
    const c = ctx({
      followUps: [followUp({ id: "a", inicio: diasAtras(5) })],
      propostas: [proposta({ id: "p", validade: diasAFrente(1) })],
      negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(60), estagioDesde: diasAtras(60) })],
      clientes: [cliente({ id: "c", ultimoContratoEm: diasAtras(400), recorrente: true })],
    });
    const todas = avaliarRegras(c);
    expect(todas.length).toBeGreaterThan(0);
    for (const o of todas) {
      expect(o.href.startsWith("/")).toBe(true);
      expect(o.responsavelId).toBe("user-1");
      expect(o.regra.length).toBeGreaterThan(0);
    }
  });

  it("avaliarRegras junta o resultado de todas as regras num tick só", () => {
    const c = ctx({
      followUps: [followUp({ id: "a", inicio: diasAtras(5) })],
      negociacoes: [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(60), estagioDesde: diasAtras(60) })],
    });
    // 1 follow-up + (sem interação) + (parada no estágio) = 3
    expect(avaliarRegras(c)).toHaveLength(3);
  });

  it("contexto vazio não gera ocorrência nenhuma", () => {
    expect(avaliarRegras(ctx())).toHaveLength(0);
  });
});

describe("nenhum limiar mora no código (aceite literal da F7.1)", () => {
  it("mudar o parâmetro muda o resultado — nada está cravado", () => {
    const negs = [negociacao({ id: "n", ultimaInteracaoEm: diasAtras(20) })];
    const frouxo = { ...PARAMETROS, diasSemContato: 30 };
    const apertado = { ...PARAMETROS, diasSemContato: 5 };
    expect(regraNegociacaoSemInteracao.avaliar(ctx({ negociacoes: negs, parametros: frouxo }))).toHaveLength(0);
    expect(regraNegociacaoSemInteracao.avaliar(ctx({ negociacoes: negs, parametros: apertado }))).toHaveLength(1);
  });
});
