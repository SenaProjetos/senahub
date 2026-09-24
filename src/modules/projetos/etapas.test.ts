import { describe, expect, it } from "vitest";
import {
  consolidarPrazoDisciplina,
  etapaQueDefineOPrazo,
  percentualQueFalta,
  transicaoEtapaPermitida,
  validarPercentuais,
} from "./etapas";

const etapa = (id: string, prazo: string | null, ordem = 0) => ({ id, prazo, ordem });

describe("consolidarPrazoDisciplina", () => {
  it("o prazo da disciplina é o MAIOR prazo entre as etapas", () => {
    expect(
      consolidarPrazoDisciplina([{ prazo: "2026-10-12" }, { prazo: "2026-12-31" }], "2026-09-01"),
    ).toBe("2026-12-31");
  });

  it("ignora etapa sem prazo e usa as que têm", () => {
    expect(
      consolidarPrazoDisciplina([{ prazo: null }, { prazo: "2026-10-12" }], "2026-09-01"),
    ).toBe("2026-10-12");
  });

  it("NENHUMA etapa com prazo mantém o prazo atual — não zera", () => {
    // Adicionar Básico e Executivo e só depois preencher as datas é o fluxo normal. Um
    // máximo ingênuo devolveria null aqui e apagaria o prazo contratual da disciplina,
    // calando alertas de prazo, saúde do projeto e o portal do cliente.
    expect(consolidarPrazoDisciplina([{ prazo: null }, { prazo: null }], "2026-09-01")).toBe("2026-09-01");
  });

  it("sem etapa nenhuma também mantém o prazo atual", () => {
    expect(consolidarPrazoDisciplina([], "2026-09-01")).toBe("2026-09-01");
  });

  it("disciplina sem prazo e etapas sem prazo continua sem prazo", () => {
    expect(consolidarPrazoDisciplina([{ prazo: null }], null)).toBeNull();
  });

  it("etapa com prazo ANTERIOR ao atual ainda manda — o prazo pode encurtar", () => {
    // Consolidar não é "só avança": se o Executivo foi antecipado, a disciplina acompanha.
    expect(consolidarPrazoDisciplina([{ prazo: "2026-10-01" }], "2026-12-31")).toBe("2026-10-01");
  });
});

describe("etapaQueDefineOPrazo", () => {
  it("escolhe a de maior prazo", () => {
    const r = etapaQueDefineOPrazo([etapa("bs", "2026-10-12", 0), etapa("ex", "2026-12-31", 1)]);
    expect(r?.id).toBe("ex");
  });

  it("ordena sozinha por `ordem` — não confia na ordem recebida", () => {
    // O Prisma não devolve por `ordem` sem orderBy; com as duas SEM prazo, a escolha é a de
    // maior ordem, e ela tem de sair igual em qualquer ordem de entrada.
    const a = etapaQueDefineOPrazo([etapa("ex", null, 1), etapa("bs", null, 0)]);
    const b = etapaQueDefineOPrazo([etapa("bs", null, 0), etapa("ex", null, 1)]);
    expect(a?.id).toBe("ex");
    expect(b?.id).toBe("ex");
  });

  it("empate de prazo fica com a de menor ordem, estável", () => {
    const r = etapaQueDefineOPrazo([etapa("ex", "2026-12-31", 1), etapa("bs", "2026-12-31", 0)]);
    expect(r?.id).toBe("bs");
  });

  it("uma com prazo vence qualquer uma sem prazo", () => {
    const r = etapaQueDefineOPrazo([etapa("bs", "2026-10-12", 0), etapa("ex", null, 5)]);
    expect(r?.id).toBe("bs");
  });

  it("lista vazia devolve null", () => {
    expect(etapaQueDefineOPrazo([])).toBeNull();
  });
});

describe("validarPercentuais", () => {
  it("fecha 100 e passa", () => {
    expect(validarPercentuais([{ percentual: 40 }, { percentual: 60 }])).toEqual({ ok: true, soma: 100 });
  });

  it("não se engana com ponto flutuante: 33,33 + 33,33 + 33,34 é exatamente 100", () => {
    expect(validarPercentuais([{ percentual: 33.33 }, { percentual: 33.33 }, { percentual: 33.34 }]).ok).toBe(true);
  });

  it("RECUSA soma diferente de 100 — nunca corrige em silêncio", () => {
    // É exatamente o erro que a proposta composta foi feita para barrar: planos somando
    // 105% e 110% nas 163 propostas auditadas.
    const r = validarPercentuais([{ percentual: 40 }, { percentual: 65 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.soma).toBe(105);
      expect(r.mensagem).toContain("105%");
    }
  });

  it("aceita 0% numa etapa — Básico só de cronograma, Executivo faturado", () => {
    // Diverge de propósito de `calcularParcelas`, que recusa <= 0: lá a parcela É o
    // pagamento; aqui a etapa carrega prazo e status além do dinheiro.
    expect(validarPercentuais([{ percentual: 0 }, { percentual: 100 }]).ok).toBe(true);
  });

  it("recusa percentual negativo ou acima de 100", () => {
    expect(validarPercentuais([{ percentual: -10 }, { percentual: 110 }]).ok).toBe(false);
    expect(validarPercentuais([{ percentual: 101 }]).ok).toBe(false);
  });

  it("recusa percentual que não é número", () => {
    expect(validarPercentuais([{ percentual: Number.NaN }]).ok).toBe(false);
  });

  it("disciplina sem etapa é válida — nada a repartir", () => {
    expect(validarPercentuais([])).toEqual({ ok: true, soma: 0 });
  });
});

describe("percentualQueFalta", () => {
  it("devolve o que falta para 100", () => {
    expect(percentualQueFalta([{ percentual: 40 }])).toBe(60);
  });

  it("sem etapa, falta tudo", () => {
    expect(percentualQueFalta([])).toBe(100);
  });

  it("nunca negativo: acima de 100 sugere 0 e deixa a validação acusar", () => {
    expect(percentualQueFalta([{ percentual: 70 }, { percentual: 50 }])).toBe(0);
  });

  it("exato em centavo de percentual", () => {
    expect(percentualQueFalta([{ percentual: 33.33 }, { percentual: 33.33 }])).toBe(33.34);
  });
});

describe("transicaoEtapaPermitida", () => {
  it("segue a mesma máquina da disciplina", () => {
    expect(transicaoEtapaPermitida("aguardando", "em_andamento")).toBe(true);
    expect(transicaoEtapaPermitida("em_andamento", "entregue")).toBe(true);
  });

  it("NÃO chega a aprovado na F4 — aprovado libera pagamento, e isso é a F7", () => {
    // Deixar a etapa virar `aprovado` antes da F7 criaria uma aprovação que não libera
    // nada — e alguém esperando um pagamento que não vem.
    expect(transicaoEtapaPermitida("entregue", "aprovado")).toBe(false);
    expect(transicaoEtapaPermitida("em_andamento", "aprovado")).toBe(false);
  });

  it("ficar no mesmo status é sempre permitido", () => {
    expect(transicaoEtapaPermitida("em_andamento", "em_andamento")).toBe(true);
  });
});
