import { describe, expect, it } from "vitest";
import { validateGeneralAttachment } from "./upload-policy";

describe("validateGeneralAttachment", () => {
  it("recusa extensão ativa, mesmo que os bytes pareçam inofensivos", () => {
    expect(validateGeneralAttachment("ataque.svg", Buffer.from("<svg />"))).toEqual({
      ok: false,
      error: "Tipo de arquivo não permitido.",
    });
  });

  it("recusa conteúdo HTML declarado como imagem", () => {
    expect(validateGeneralAttachment("foto.png", Buffer.from("<html>conteúdo ativo</html>"))).toEqual({
      ok: false,
      error: "O conteúdo não corresponde ao tipo do arquivo enviado.",
    });
  });

  it("aceita JPEG quando a assinatura corresponde e deriva o MIME no servidor", () => {
    const result = validateGeneralAttachment("foto.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(result).toEqual({ ok: true, extension: "jpg", mime: "image/jpeg" });
  });

  it("recusa PDF sem assinatura", () => {
    expect(validateGeneralAttachment("relatorio.pdf", Buffer.from("não é PDF"))).toEqual({
      ok: false,
      error: "O conteúdo não corresponde ao tipo do arquivo enviado.",
    });
  });

  it("aceita IFC textual com BOM quando o cabeçalho STEP é válido", () => {
    expect(validateGeneralAttachment("modelo.ifc", Buffer.from("\uFEFFISO-10303-21;", "utf8"))).toMatchObject({
      ok: true,
      mime: "application/x-step",
    });
  });
});
