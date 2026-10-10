import { describe, expect, it } from "vitest";
import { MOTIVO_JA_APROVADA, MOTIVO_JA_ENVIADA, MOTIVO_NAO_ENVIADA, motivoParaDesfazerEnvio, motivoParaEnviar } from "./envio-etapa";

describe("enviar a etapa para análise", () => {
  it("envia de aguardando, em andamento e em revisão (devolvida para correção)", () => {
    for (const s of ["aguardando", "em_andamento", "em_revisao"] as const) expect(motivoParaEnviar(s)).toBeNull();
  });
  it("recusa a já enviada e a já aprovada", () => {
    expect(motivoParaEnviar("entregue")).toBe(MOTIVO_JA_ENVIADA);
    expect(motivoParaEnviar("aprovado")).toBe(MOTIVO_JA_APROVADA);
  });
});

describe("desfazer o envio", () => {
  it("só a enviada e ainda não aprovada", () => {
    expect(motivoParaDesfazerEnvio("entregue")).toBeNull();
    expect(motivoParaDesfazerEnvio("aprovado")).toMatch(/já aprovou/);
    expect(motivoParaDesfazerEnvio("em_andamento")).toBe(MOTIVO_NAO_ENVIADA);
  });
});
