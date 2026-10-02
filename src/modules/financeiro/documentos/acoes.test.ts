import { describe, expect, it } from "vitest";
import { ACAO_BAIXAR, ACAO_EXCLUIR, ACAO_GERAR_PARCELAS, itensDeDocumento } from "@/modules/financeiro/documentos/acoes";

const ids = (itens: ReturnType<typeof itensDeDocumento>) => itens.map((i) => i.id);

describe("itensDeDocumento", () => {
  it("quem gere vê baixar, gerar parcelas e excluir", () => {
    expect(ids(itensDeDocumento({ id: "d1", temArquivo: true, lancamentos: 0 }, { podeGerir: true }))).toEqual([ACAO_BAIXAR, ACAO_GERAR_PARCELAS, "sep", ACAO_EXCLUIR]);
  });

  it("quem só vê fica com o download; sem arquivo, sem item nenhum", () => {
    expect(ids(itensDeDocumento({ id: "d1", temArquivo: true, lancamentos: 0 }, { podeGerir: false }))).toEqual([ACAO_BAIXAR]);
    expect(itensDeDocumento({ id: "d1", temArquivo: false, lancamentos: 0 }, { podeGerir: false })).toEqual([]);
  });

  it("excluir é destrutivo, confirma e diz o que acontece com arquivo e lançamentos", () => {
    const um = itensDeDocumento({ id: "d1", temArquivo: true, lancamentos: 1 }, { podeGerir: true }).find((i) => i.id === ACAO_EXCLUIR);
    expect(um?.tipo === "acao" && um.variant).toBe("destructive");
    expect(um?.tipo === "acao" && um.confirmar?.descricao).toBe("O arquivo guardado é apagado. O lançamento ligado a ele continua, só sem o documento.");
    const tres = itensDeDocumento({ id: "d1", temArquivo: false, lancamentos: 3 }, { podeGerir: true }).find((i) => i.id === ACAO_EXCLUIR);
    expect(tres?.tipo === "acao" && tres.confirmar?.descricao).toBe("Os 3 lançamentos ligados a ele continuam, só sem o documento.");
  });

  it("o download é link de verdade", () => {
    const b = itensDeDocumento({ id: "d9", temArquivo: true, lancamentos: 0 }, { podeGerir: false })[0];
    expect(b.tipo === "link" && b.href).toBe("/api/financeiro/documentos/d9/download");
  });
});
