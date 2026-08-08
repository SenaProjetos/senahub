import { describe, expect, it } from "vitest";
import {
  agruparPorDestinatario,
  diasAtePrazo,
  DIAS_ALERTA,
  rotuloPrazo,
  situacaoPrazo,
  SITUACAO_PRAZO_LABEL,
  SITUACOES_PRAZO,
} from "@/modules/projetos/pendencias/prazo";

const HOJE = new Date("2026-08-08T15:00:00");
const ENCERRADOS = ["fechada", "descartada"] as const;
const dia = (d: string) => new Date(`${d}T00:00:00`);
const PUB = dia("2026-08-01");

describe("catálogo", () => {
  it("toda situação tem rótulo pt-BR", () => {
    for (const s of SITUACOES_PRAZO) expect(SITUACAO_PRAZO_LABEL[s]).toBeTruthy();
  });
});

describe("diasAtePrazo", () => {
  it("conta dias inteiros, ignorando a hora do dia", () => {
    // 08/08 15:00 → prazo 11/08 00:00 continua sendo "3 dias", não 2.
    expect(diasAtePrazo(dia("2026-08-11"), PUB, HOJE)).toBe(3);
    expect(diasAtePrazo(dia("2026-08-08"), PUB, HOJE)).toBe(0);
    expect(diasAtePrazo(dia("2026-08-05"), PUB, HOJE)).toBe(-3);
  });

  it("RASCUNHO não tem relógio — sem publicadoEm, não conta", () => {
    // É o ponto do item: cobrar prazo de quem não pode ver o apontamento seria armadilha.
    expect(diasAtePrazo(dia("2026-08-01"), null, HOJE)).toBeNull();
  });

  it("sem prazo não conta", () => {
    expect(diasAtePrazo(null, PUB, HOJE)).toBeNull();
    expect(diasAtePrazo(undefined, PUB, HOJE)).toBeNull();
  });

  it("data inválida não vira NaN", () => {
    expect(diasAtePrazo("não é data", PUB, HOJE)).toBeNull();
  });
});

describe("situacaoPrazo", () => {
  const base = { publicadoEm: PUB, status: "aberta" };

  it("classifica pela distância até o prazo", () => {
    expect(situacaoPrazo({ ...base, prazo: dia("2026-08-20") }, ENCERRADOS, HOJE)).toBe("no_prazo");
    expect(situacaoPrazo({ ...base, prazo: dia("2026-08-10") }, ENCERRADOS, HOJE)).toBe("vence_em_breve");
    expect(situacaoPrazo({ ...base, prazo: dia("2026-08-08") }, ENCERRADOS, HOJE)).toBe("vence_em_breve");
    expect(situacaoPrazo({ ...base, prazo: dia("2026-08-07") }, ENCERRADOS, HOJE)).toBe("vencido");
  });

  it("a fronteira de 'vence em breve' é exatamente DIAS_ALERTA", () => {
    const noLimite = new Date(HOJE);
    noLimite.setDate(noLimite.getDate() + DIAS_ALERTA);
    const alem = new Date(HOJE);
    alem.setDate(alem.getDate() + DIAS_ALERTA + 1);
    expect(situacaoPrazo({ ...base, prazo: noLimite }, ENCERRADOS, HOJE)).toBe("vence_em_breve");
    expect(situacaoPrazo({ ...base, prazo: alem }, ENCERRADOS, HOJE)).toBe("no_prazo");
  });

  it("apontamento ENCERRADO nunca aparece vencido — o trabalho acabou", () => {
    for (const status of ENCERRADOS) {
      expect(situacaoPrazo({ prazo: dia("2026-01-01"), publicadoEm: PUB, status }, ENCERRADOS, HOJE)).toBe("sem_prazo");
    }
  });

  it("em_correcao e adiado ainda respondem ao prazo (não são encerrados)", () => {
    for (const status of ["aberta", "em_correcao", "resolvida", "adiado"]) {
      expect(situacaoPrazo({ prazo: dia("2026-08-01"), publicadoEm: PUB, status }, ENCERRADOS, HOJE)).toBe("vencido");
    }
  });

  it("rascunho com prazo vencido NÃO está vencido — o relógio não começou", () => {
    expect(situacaoPrazo({ prazo: dia("2026-01-01"), publicadoEm: null, status: "aberta" }, ENCERRADOS, HOJE)).toBe("sem_prazo");
  });
});

describe("rotuloPrazo", () => {
  it("distingue hoje, atraso e futuro", () => {
    expect(rotuloPrazo(0)).toBe("vence hoje");
    expect(rotuloPrazo(-3)).toContain("atrasado");
    expect(rotuloPrazo(5)).toBe("em 5 dia(s)");
    expect(rotuloPrazo(null)).toBe("—");
  });
});

describe("agruparPorDestinatario", () => {
  it("junta tudo de uma pessoa numa lista só (uma notificação, não N)", () => {
    const m = agruparPorDestinatario([
      { item: "p1", destinatarios: ["u1", "u2"] },
      { item: "p2", destinatarios: ["u1"] },
    ]);
    expect(m.get("u1")).toEqual(["p1", "p2"]);
    expect(m.get("u2")).toEqual(["p1"]);
  });

  it("não duplica quando o mesmo destinatário aparece duas vezes no item", () => {
    const m = agruparPorDestinatario([{ item: "p1", destinatarios: ["u1", "u1"] }]);
    expect(m.get("u1")).toEqual(["p1"]);
  });

  it("item sem destinatário não cria entrada", () => {
    expect(agruparPorDestinatario([{ item: "p1", destinatarios: [] }]).size).toBe(0);
  });

  it("lista vazia devolve mapa vazio", () => {
    expect(agruparPorDestinatario([]).size).toBe(0);
  });
});
