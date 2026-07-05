import { describe, it, expect } from "vitest";
import { entregaveisAtuais, statusValidacao, type UploadValidavel } from "./validacao";

function up(p: Partial<UploadValidavel> & Pick<UploadValidavel, "pacote" | "nomeArquivo">): UploadValidavel {
  return { versao: 1, validado: false, origem: "manual", ...p };
}

describe("entregaveisAtuais", () => {
  it("mantém só a versão mais recente por (pacote, nome)", () => {
    const r = entregaveisAtuais([
      up({ pacote: "A", nomeArquivo: "plt.pdf", versao: 1, validado: true }),
      up({ pacote: "A", nomeArquivo: "plt.pdf", versao: 2, validado: false }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].versao).toBe(2);
    expect(r[0].validado).toBe(false);
  });

  it("ignora RECEBIDOS, OUTROS e origem ferramenta", () => {
    const r = entregaveisAtuais([
      up({ pacote: "A", nomeArquivo: "a.pdf" }),
      up({ pacote: "B", nomeArquivo: "b.rvt" }),
      up({ pacote: "RECEBIDOS", nomeArquivo: "cliente.pdf" }),
      up({ pacote: "OUTROS", nomeArquivo: "x.bin" }),
      up({ pacote: "A", nomeArquivo: "auto.dxf", origem: "ferramenta" }),
    ]);
    expect(r.map((u) => u.nomeArquivo).sort()).toEqual(["a.pdf", "b.rvt"]);
  });

  it("distingue mesmo nome em pacotes diferentes", () => {
    const r = entregaveisAtuais([
      up({ pacote: "A", nomeArquivo: "modelo.ifc" }),
      up({ pacote: "B", nomeArquivo: "modelo.ifc" }),
    ]);
    expect(r).toHaveLength(2);
  });
});

describe("statusValidacao", () => {
  const semPacotes = { exigePacoteA: false, exigePacoteB: false };

  it("conta pendentes e validados pela versão atual", () => {
    const r = statusValidacao(
      [
        up({ pacote: "A", nomeArquivo: "1.pdf", validado: true }),
        up({ pacote: "A", nomeArquivo: "2.pdf", validado: false }),
      ],
      semPacotes,
    );
    expect(r).toMatchObject({ total: 2, validados: 1, pendentes: 1, todosValidados: false, completo: false });
  });

  it("reenvio (nova versão) reabre a validação", () => {
    const r = statusValidacao(
      [
        up({ pacote: "A", nomeArquivo: "1.pdf", versao: 1, validado: true }),
        up({ pacote: "A", nomeArquivo: "1.pdf", versao: 2, validado: false }),
      ],
      semPacotes,
    );
    expect(r.pendentes).toBe(1);
    expect(r.completo).toBe(false);
  });

  it("completo quando todos validados e pacotes obrigatórios presentes", () => {
    const r = statusValidacao(
      [
        up({ pacote: "A", nomeArquivo: "a.pdf", validado: true }),
        up({ pacote: "B", nomeArquivo: "b.rvt", validado: true }),
      ],
      { exigePacoteA: true, exigePacoteB: true },
    );
    expect(r.completo).toBe(true);
  });

  it("não completo se falta pacote obrigatório mesmo com tudo validado", () => {
    const r = statusValidacao(
      [up({ pacote: "A", nomeArquivo: "a.pdf", validado: true })],
      { exigePacoteA: true, exigePacoteB: true },
    );
    expect(r.completo).toBe(false); // falta B
  });

  it("sem entregáveis e sem pacote obrigatório: todosValidados, mas não conta nada", () => {
    const r = statusValidacao([], semPacotes);
    expect(r).toMatchObject({ total: 0, pendentes: 0, todosValidados: true, completo: true });
  });
});
