import { describe, expect, it } from "vitest";
import {
  ANEXOS_MAX,
  JANELA_ANEXO_MS,
  MOTIVO_ANEXOS_MAX,
  MOTIVO_JANELA_ANEXO,
  MOTIVO_NAO_ENCONTRADA,
  MOTIVO_TEXTO_LONGO,
  MOTIVO_TEXTO_VAZIO,
  aguardandoResposta,
  contaNaoLida,
  ladoOposto,
  motivoParaNaoAnexar,
  motivoParaNaoEnviar,
  precisaDeEmail,
} from "./regras";

describe("motivoParaNaoEnviar", () => {
  it("texto vazio só com anexos", () => {
    expect(motivoParaNaoEnviar({ texto: "   ", comAnexos: false })).toBe(MOTIVO_TEXTO_VAZIO);
    expect(motivoParaNaoEnviar({ texto: "   ", comAnexos: true })).toBeNull();
    expect(motivoParaNaoEnviar({ texto: " oi ", comAnexos: false })).toBeNull();
  });
  it("texto de 5001 caracteres recusa (após trim)", () => {
    expect(motivoParaNaoEnviar({ texto: "a".repeat(5001), comAnexos: false })).toBe(MOTIVO_TEXTO_LONGO);
    expect(motivoParaNaoEnviar({ texto: `  ${"a".repeat(5000)}  `, comAnexos: false })).toBeNull();
  });
});

describe("motivoParaNaoAnexar", () => {
  const agora = new Date("2026-11-22T12:00:00Z");
  const ok = { autorId: "u1", userId: "u1", criadaEm: new Date(agora.getTime() - 60_000), agora, anexos: 0, comAnexos: true };
  it("aceita dentro da janela", () => {
    expect(motivoParaNaoAnexar(ok)).toBeNull();
  });
  it("anexo de outra pessoa = não encontrada", () => {
    expect(motivoParaNaoAnexar({ ...ok, userId: "u2" })).toBe(MOTIVO_NAO_ENCONTRADA);
    expect(motivoParaNaoAnexar({ ...ok, comAnexos: false })).toBe(MOTIVO_NAO_ENCONTRADA);
  });
  it("anexo depois de 15 minutos recusa", () => {
    expect(motivoParaNaoAnexar({ ...ok, criadaEm: new Date(agora.getTime() - JANELA_ANEXO_MS - 1) })).toBe(MOTIVO_JANELA_ANEXO);
    expect(motivoParaNaoAnexar({ ...ok, criadaEm: new Date(agora.getTime() - JANELA_ANEXO_MS) })).toBeNull();
  });
  it("sexto anexo recusa", () => {
    expect(motivoParaNaoAnexar({ ...ok, anexos: ANEXOS_MAX - 1 })).toBeNull();
    expect(motivoParaNaoAnexar({ ...ok, anexos: ANEXOS_MAX })).toBe(MOTIVO_ANEXOS_MAX);
  });
});

describe("precisaDeEmail", () => {
  it("nunca avisado → sim; avisado e não leu → não; leu depois do aviso → sim", () => {
    const t = new Date("2026-11-22T10:00:00Z");
    const depois = new Date("2026-11-22T11:00:00Z");
    expect(precisaDeEmail({ lidaAte: null, emailAvisadoEm: null })).toBe(true);
    expect(precisaDeEmail({ lidaAte: null, emailAvisadoEm: t })).toBe(false);
    expect(precisaDeEmail({ lidaAte: new Date("2026-11-22T09:00:00Z"), emailAvisadoEm: t })).toBe(false);
    expect(precisaDeEmail({ lidaAte: depois, emailAvisadoEm: t })).toBe(true);
  });
});

describe("aguardandoResposta e lados", () => {
  it("aguarda resposta da equipe quando o cliente falou por último", () => {
    expect(aguardandoResposta({ ultimoLado: "cliente" })).toBe(true);
    expect(aguardandoResposta({ ultimoLado: "equipe" })).toBe(false);
    expect(aguardandoResposta({ ultimoLado: null })).toBe(false);
  });
  it("lado oposto", () => {
    expect(ladoOposto("cliente")).toBe("equipe");
    expect(ladoOposto("equipe")).toBe("cliente");
  });
});

describe("contaNaoLida", () => {
  const lida = new Date("2026-11-22T10:00:00Z");
  const antes = new Date("2026-11-22T09:00:00Z");
  const depois = new Date("2026-11-22T11:00:00Z");
  it("não lida conta só o lado oposto depois de lidaAte", () => {
    expect(contaNaoLida({ lado: "equipe", criadaEm: depois }, "cliente", lida)).toBe(true);
    expect(contaNaoLida({ lado: "equipe", criadaEm: antes }, "cliente", lida)).toBe(false);
    expect(contaNaoLida({ lado: "cliente", criadaEm: depois }, "cliente", lida)).toBe(false);
    expect(contaNaoLida({ lado: "equipe", criadaEm: antes }, "cliente", null)).toBe(true);
  });
});
