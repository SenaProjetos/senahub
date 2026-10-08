import { describe, expect, it } from "vitest";
import {
  ancoraDoCiclo,
  itemAtrasado,
  MOTIVO_CICLO_ABERTO,
  MOTIVO_CICLO_FECHADO,
  MOTIVO_SAIDA_SEM_DESLIGAMENTO,
  MOTIVO_SEM_PERMISSAO_ITEM,
  modeloSugerido,
  motivoParaNaoAbrir,
  motivoParaNaoMarcar,
  prazoDoItem,
  progresso,
  publicoDaContratacao,
  responsavelEfetivo,
  rotuloPrazo,
  statusAposItens,
} from "./regras";

describe("publicoDaContratacao", () => {
  it("CLT e estágio usam a mesma lista; PJ e RPA a de PJ", () => {
    expect(publicoDaContratacao("clt")).toBe("clt_estagio");
    expect(publicoDaContratacao("estagio")).toBe("clt_estagio");
    expect(publicoDaContratacao("pj")).toBe("pj");
    expect(publicoDaContratacao("autonomo_rpa")).toBe("pj");
  });
  it("sócio ou sem vínculo cai na lista geral", () => {
    expect(publicoDaContratacao("pro_labore")).toBe("todos");
    expect(publicoDaContratacao(null)).toBe("todos");
  });
});

describe("modeloSugerido", () => {
  const m = (id: string, tipo: "entrada" | "saida", publico: "clt_estagio" | "pj" | "todos", ativo = true) => ({
    id,
    nome: id,
    tipo,
    publico,
    ativo,
  });
  const modelos = [m("geral", "entrada", "todos"), m("clt", "entrada", "clt_estagio"), m("pj-saida", "saida", "pj"), m("velho", "entrada", "pj", false)];

  it("prefere a lista do público da contratação", () => {
    expect(modeloSugerido(modelos, "entrada", "clt")?.id).toBe("clt");
  });
  it("sem lista do público, usa a geral; inativa não conta", () => {
    expect(modeloSugerido(modelos, "entrada", "pj")?.id).toBe("geral");
  });
  it("respeita o tipo", () => {
    expect(modeloSugerido(modelos, "saida", "pj")?.id).toBe("pj-saida");
    expect(modeloSugerido(modelos, "saida", "clt")).toBeNull();
  });
});

describe("prazos", () => {
  it("soma dias corridos à âncora, inclusive para trás e virando o mês", () => {
    expect(prazoDoItem("2026-11-02", -1)).toBe("2026-11-01");
    expect(prazoDoItem("2026-11-02", 0)).toBe("2026-11-02");
    expect(prazoDoItem("2026-10-30", 5)).toBe("2026-11-04");
  });
  it("sem âncora ou sem prazo, sem data", () => {
    expect(prazoDoItem(null, 3)).toBeNull();
    expect(prazoDoItem("2026-11-02", null)).toBeNull();
  });
  it("rótulo D-1 / D0 / D+5", () => {
    expect([rotuloPrazo(-1), rotuloPrazo(0), rotuloPrazo(5), rotuloPrazo(null)]).toEqual(["D-1", "D0", "D+5", "sem prazo"]);
  });
  it("atrasado só depois do dia do prazo, e nunca se concluído", () => {
    expect(itemAtrasado({ concluido: false, prazoEm: "2026-10-07" }, "2026-10-08")).toBe(true);
    expect(itemAtrasado({ concluido: false, prazoEm: "2026-10-08" }, "2026-10-08")).toBe(false);
    expect(itemAtrasado({ concluido: true, prazoEm: "2026-10-01" }, "2026-10-08")).toBe(false);
    expect(itemAtrasado({ concluido: false, prazoEm: null }, "2026-10-08")).toBe(false);
  });
});

describe("abrir ciclo", () => {
  it("um ciclo em andamento por tipo", () => {
    expect(motivoParaNaoAbrir("entrada", [{ tipo: "entrada", status: "em_andamento" }], null)).toBe(MOTIVO_CICLO_ABERTO.entrada);
  });
  it("recontratação: ciclo antigo concluído ou cancelado não impede", () => {
    expect(
      motivoParaNaoAbrir("entrada", [{ tipo: "entrada", status: "concluido" }, { tipo: "saida", status: "concluido" }], null),
    ).toBeNull();
  });
  it("saída exige o último dia do vínculo", () => {
    expect(motivoParaNaoAbrir("saida", [], null)).toBe(MOTIVO_SAIDA_SEM_DESLIGAMENTO);
    expect(motivoParaNaoAbrir("saida", [{ tipo: "entrada", status: "em_andamento" }], "2026-11-30")).toBeNull();
  });
  it("âncora: início do vínculo na entrada (hoje sem vínculo), último dia na saída", () => {
    const v = { dataInicio: "2026-10-01", dataFim: "2026-11-30" };
    expect(ancoraDoCiclo("entrada", v, "2026-10-08")).toBe("2026-10-01");
    expect(ancoraDoCiclo("entrada", null, "2026-10-08")).toBe("2026-10-08");
    expect(ancoraDoCiclo("saida", v, "2026-10-08")).toBe("2026-11-30");
    expect(ancoraDoCiclo("saida", { dataInicio: "2026-01-01", dataFim: null }, "2026-10-08")).toBeNull();
  });
});

describe("status e marcação", () => {
  it("conclui quando todos os itens estão marcados e reabre ao desmarcar", () => {
    expect(statusAposItens("em_andamento", [{ concluido: true }, { concluido: true }])).toBe("concluido");
    expect(statusAposItens("concluido", [{ concluido: true }, { concluido: false }])).toBe("em_andamento");
    expect(statusAposItens("em_andamento", [])).toBe("em_andamento");
  });
  it("cancelado não volta sozinho", () => {
    expect(statusAposItens("cancelado", [{ concluido: true }])).toBe("cancelado");
  });
  it("líder e coordenador ficam com o RH até a F3", () => {
    expect(responsavelEfetivo("lider")).toBe("rh");
    expect(responsavelEfetivo("coordenador")).toBe("rh");
    expect(responsavelEfetivo("ti")).toBe("ti");
  });

  const ciclo = { status: "em_andamento" as const, userId: "ana" };
  it("RH marca qualquer item", () => {
    expect(motivoParaNaoMarcar({ responsavel: "ti" }, ciclo, { id: "rh1", ehRh: true, ehTi: false })).toBeNull();
  });
  it("TI marca os da TI, não os do RH", () => {
    expect(motivoParaNaoMarcar({ responsavel: "ti" }, ciclo, { id: "t", ehRh: false, ehTi: true })).toBeNull();
    expect(motivoParaNaoMarcar({ responsavel: "rh" }, ciclo, { id: "t", ehRh: false, ehTi: true })).toBe(MOTIVO_SEM_PERMISSAO_ITEM);
  });
  it("a pessoa marca só os itens dela, no próprio ciclo", () => {
    expect(motivoParaNaoMarcar({ responsavel: "pessoa" }, ciclo, { id: "ana", ehRh: false, ehTi: false })).toBeNull();
    expect(motivoParaNaoMarcar({ responsavel: "pessoa" }, ciclo, { id: "bia", ehRh: false, ehTi: false })).toBe(MOTIVO_SEM_PERMISSAO_ITEM);
    expect(motivoParaNaoMarcar({ responsavel: "lider" }, ciclo, { id: "ana", ehRh: false, ehTi: false })).toBe(MOTIVO_SEM_PERMISSAO_ITEM);
  });
  it("ciclo cancelado recusa até o RH", () => {
    expect(motivoParaNaoMarcar({ responsavel: "rh" }, { ...ciclo, status: "cancelado" }, { id: "rh1", ehRh: true, ehTi: false })).toBe(MOTIVO_CICLO_FECHADO);
  });
  it("progresso", () => {
    expect(progresso([{ concluido: true }, { concluido: false }, { concluido: false }])).toEqual({ feitos: 1, total: 3, pct: 33 });
    expect(progresso([])).toEqual({ feitos: 0, total: 0, pct: 0 });
  });
});
