import { describe, expect, it } from "vitest";
import { ACAO_ATIVAR, ACAO_EXCLUIR, ACAO_PAUSAR, ACAO_SUBIR, itensDeRegraDePreenchimento, MOTIVO_JA_E_A_PRIMEIRA } from "@/modules/financeiro/regras/acoes";
import type { AcaoItemAcao } from "@/components/ui/acoes";

const ids = (r: { ativo: boolean; primeira: boolean }, podeGerir = true) =>
  itensDeRegraDePreenchimento(r, { podeGerir }).filter((i): i is AcaoItemAcao => i.tipo === "acao");

describe("ações da regra de preenchimento", () => {
  it("sem perfil de gestão não há menu", () => {
    expect(itensDeRegraDePreenchimento({ ativo: true, primeira: false }, { podeGerir: false })).toEqual([]);
  });
  it("ativa oferece Pausar; pausada oferece Ativar", () => {
    expect(ids({ ativo: true, primeira: false }).map((i) => i.id)).toContain(ACAO_PAUSAR);
    expect(ids({ ativo: false, primeira: false }).map((i) => i.id)).toContain(ACAO_ATIVAR);
  });
  it("a primeira da lista não sobe, com o motivo à vista", () => {
    const sobe = ids({ ativo: true, primeira: true }).find((i) => i.id === ACAO_SUBIR);
    expect(sobe?.desabilitado).toBe(MOTIVO_JA_E_A_PRIMEIRA);
    expect(ids({ ativo: true, primeira: false }).find((i) => i.id === ACAO_SUBIR)?.desabilitado).toBeUndefined();
  });
  it("excluir é destrutivo e pede confirmação", () => {
    const ex = ids({ ativo: true, primeira: false }).find((i) => i.id === ACAO_EXCLUIR);
    expect(ex?.variant).toBe("destructive");
    expect(ex?.confirmar).toBeTruthy();
  });
});
