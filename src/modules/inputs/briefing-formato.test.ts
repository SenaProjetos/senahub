import { describe, expect, it } from "vitest";
import { aplicarFormatosDoBriefing, formatosDoBriefing } from "./briefing-formato";

describe("briefing: formato de e-mail e telefone", () => {
  it("marca e-mail e telefone de contato", () => {
    expect(formatosDoBriefing()).toEqual({ emailContato: "email", telefoneContato: "telefone" });
  });

  it("válido é gravado no formato padrão", () => {
    const r = aplicarFormatosDoBriefing({ telefoneContato: "81999998888", emailContato: " A@B.com " }, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.respostas.telefoneContato).toBe("(81) 99999-8888");
      expect(r.respostas.emailContato).toBe("a@b.com");
    }
  });

  it("inválido novo é recusado com a mensagem no campo", () => {
    const r = aplicarFormatosDoBriefing({ telefoneContato: "123" }, { telefoneContato: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.campos.telefoneContato).toBeTruthy();
  });

  it("inválido que já estava gravado passa sem mexer; vazio é válido", () => {
    expect(aplicarFormatosDoBriefing({ telefoneContato: "123" }, { telefoneContato: "123" }).ok).toBe(true);
    expect(aplicarFormatosDoBriefing({ telefoneContato: "", emailContato: "" }, null).ok).toBe(true);
  });

  it("não mexe nos outros campos", () => {
    const r = aplicarFormatosDoBriefing({ nomeCompleto: " Ana ", tipoImovel: "Casa" }, null);
    expect(r.ok && r.respostas).toEqual({ nomeCompleto: " Ana ", tipoImovel: "Casa" });
  });
});
