import { describe, expect, it } from "vitest";
import { avisoRecebidoDe } from "./recebidos";

const base = {
  avisoId: "a1",
  lidoEm: null as Date | null,
  criadoEm: new Date("2026-10-01T12:00:00Z"),
  aviso: {
    titulo: "Recesso de fim de ano",
    corpo: "**Atenção**: escritório fechado.",
    imagemPath: null as string | null,
    exigeConfirmacao: true,
    enviadoEm: new Date("2026-10-01T11:59:00Z") as Date | null,
    criadoPor: { name: "Diretoria" },
  },
};

describe("avisoRecebidoDe", () => {
  it("leva título, corpo e autor sem mexer no Markdown", () => {
    const r = avisoRecebidoDe(base);
    expect(r).toMatchObject({
      avisoId: "a1",
      titulo: "Recesso de fim de ano",
      corpo: "**Atenção**: escritório fechado.",
      autor: "Diretoria",
      exigeConfirmacao: true,
      temImagem: false,
      lidoEm: null,
    });
  });

  it("recebido em = momento do disparo do aviso", () => {
    expect(avisoRecebidoDe(base).recebidoEm).toEqual(new Date("2026-10-01T11:59:00Z"));
  });

  it("aviso antigo sem enviadoEm usa a criação da entrega", () => {
    const r = avisoRecebidoDe({ ...base, aviso: { ...base.aviso, enviadoEm: null } });
    expect(r.recebidoEm).toEqual(new Date("2026-10-01T12:00:00Z"));
  });

  it("não expõe o caminho da imagem, só se ela existe", () => {
    const r = avisoRecebidoDe({ ...base, aviso: { ...base.aviso, imagemPath: "avisos/a1.jpg" } });
    expect(r.temImagem).toBe(true);
    expect(r).not.toHaveProperty("imagemPath");
  });

  it("confirmado guarda a data da confirmação", () => {
    const lido = new Date("2026-10-02T09:00:00Z");
    expect(avisoRecebidoDe({ ...base, lidoEm: lido }).lidoEm).toEqual(lido);
  });
});
