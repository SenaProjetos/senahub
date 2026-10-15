import { describe, expect, it } from "vitest";
import { adicionarAnexoLeadSchema } from "./schemas";

const meta = (caminho: string) => ({
  leadId: "l1",
  nome: "",
  meta: { caminho, nomeArquivo: "a.pdf", mime: "application/pdf", tamanho: 10, hashSha256: "h" },
});

describe("adicionarAnexoLeadSchema — caminho do anexo", () => {
  it("aceita o caminho que a rota de upload devolve", () => {
    expect(adicionarAnexoLeadSchema.safeParse(meta("comercial/leads/0a1b2c3d4e5f60718293a4b5.pdf")).success).toBe(true);
  });

  it("recusa caminho fora de comercial/leads (arquivo de outro cliente), com mensagem em pt-BR", () => {
    const r = adicionarAnexoLeadSchema.safeParse(meta("documentos/outroCliente/x.pdf"));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Arquivo inválido. Envie o anexo de novo.");
  });

  it("recusa subida de diretório", () => {
    expect(adicionarAnexoLeadSchema.safeParse(meta("comercial/leads/../../rh/rg.pdf")).success).toBe(false);
  });
});
