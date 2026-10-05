import { describe, expect, it } from "vitest";
import { aplicarFormatosDoBriefing, formatosDoBriefing, respostasParaSalvar } from "./briefing-formato";

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

describe("briefing: envio do autosave com campo inválido", () => {
  it("troca o inválido mudado pelo último valor salvo e deixa o resto salvar", () => {
    const r = respostasParaSalvar(
      { telefoneContato: "12", emailContato: "a@b.com", nomeCompleto: "Ana" },
      { telefoneContato: "(81) 99999-8888", emailContato: "a@b.com" },
    );
    expect(r.payload).toEqual({ telefoneContato: "(81) 99999-8888", emailContato: "a@b.com", nomeCompleto: "Ana" });
    expect(r.invalidos).toEqual([{ chave: "telefoneContato", label: "Telefone para contato" }]);
  });

  it("sem valor salvo antes, o campo inválido fica fora do envio", () => {
    const r = respostasParaSalvar({ telefoneContato: "12", nomeCompleto: "Ana" }, {});
    expect(r.payload).toEqual({ nomeCompleto: "Ana" });
    expect(r.invalidos.map((c) => c.chave)).toEqual(["telefoneContato"]);
  });

  it("inválido igual ao já salvo segue no envio; válido e vazio também", () => {
    const igual = respostasParaSalvar({ telefoneContato: "12" }, { telefoneContato: "12" });
    expect(igual.payload).toEqual({ telefoneContato: "12" });
    expect(igual.invalidos).toEqual([]);
    const ok = respostasParaSalvar({ telefoneContato: "", emailContato: "a@b.com" }, { telefoneContato: "12" });
    expect(ok.payload).toEqual({ telefoneContato: "", emailContato: "a@b.com" });
    expect(ok.invalidos).toEqual([]);
  });

  it("nomeia os dois campos quando e-mail e telefone estão inválidos", () => {
    const r = respostasParaSalvar({ telefoneContato: "1", emailContato: "x" }, {});
    expect(r.invalidos.map((c) => c.label)).toEqual(["E-mail", "Telefone para contato"]);
  });
});
