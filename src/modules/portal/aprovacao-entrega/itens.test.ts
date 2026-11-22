import { describe, expect, it } from "vitest";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { candidatosDasEntregas, impressaoDigital, itemDesatualizado } from "./itens";

function arquivo(id: string, nome: string, extra: Partial<{ bloqueado: boolean; indisponivel: boolean; versao: number }> = {}) {
  return {
    id,
    nome,
    tamanho: 1,
    ehPdf: nome.endsWith(".pdf"),
    versao: extra.versao ?? 2,
    emRevisao: null,
    descricaoRevisao: null,
    bloqueado: extra.bloqueado ?? false,
    indisponivel: extra.indisponivel ?? false,
  };
}

function pasta(arqs: ReturnType<typeof arquivo>[]) {
  return {
    chave: "fase:bs",
    rotulo: "BS",
    titulo: "Projeto básico",
    total: arqs.length,
    extensoes: [{ chave: "pdf", rotulo: "PDF", total: arqs.length, arquivos: arqs }],
  };
}

function conteudo(): ConteudoPublico {
  return {
    projeto: { codigo: "P1", nome: "Projeto" },
    titulo: null,
    disciplinas: [],
    arts: [],
    situacoes: [
      {
        id: "compartilhado",
        rotulo: "Compartilhado",
        total: 3,
        disciplinas: [
          {
            id: "d1",
            nome: "Estrutural",
            total: 3,
            pastas: [
              pasta([
                arquivo("u1", "b.pdf"),
                arquivo("u2", "bloq.pdf", { bloqueado: true }),
                arquivo("u3", "sumiu.pdf", { indisponivel: true }),
              ]),
            ],
          },
        ],
      },
      {
        id: "liberado_obra",
        rotulo: "Liberado para obra",
        total: 2,
        disciplinas: [
          { id: "d1", nome: "Estrutural", total: 2, pastas: [pasta([arquivo("u1", "b.pdf"), arquivo("u4", "a.dwg", { versao: 1 })])] },
        ],
      },
    ],
  } as unknown as ConteudoPublico;
}

describe("aprovação da entrega — itens", () => {
  it("mesmo arquivo nas duas pastas vira um candidato", () => {
    const c = candidatosDasEntregas(conteudo());
    expect(c.filter((x) => x.uploadId === "u1")).toHaveLength(1);
    expect(c.map((x) => x.uploadId).sort()).toEqual(["u1", "u4"]);
    expect(c.find((x) => x.uploadId === "u4")).toMatchObject({
      disciplinaId: "d1",
      disciplinaNome: "Estrutural",
      faseChave: "fase:bs",
      faseRotulo: "BS",
      revisaoRotulo: "R00",
      ehPdf: false,
    });
  });

  it("bloqueado e ausente ficam de fora", () => {
    const ids = candidatosDasEntregas(conteudo()).map((x) => x.uploadId);
    expect(ids).not.toContain("u2");
    expect(ids).not.toContain("u3");
  });

  it("impressão digital não depende da ordem", () => {
    const a = impressaoDigital([
      { uploadId: "u1", hashSha256: "h1" },
      { uploadId: "u2", hashSha256: "h2" },
    ]);
    const b = impressaoDigital([
      { uploadId: "u2", hashSha256: "h2" },
      { uploadId: "u1", hashSha256: "h1" },
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("impressão digital muda com o hash", () => {
    expect(impressaoDigital([{ uploadId: "u1", hashSha256: "h1" }])).not.toBe(impressaoDigital([{ uploadId: "u1", hashSha256: "h9" }]));
  });

  it("desatualizado por qualquer um dos três motivos", () => {
    expect(itemDesatualizado({ excluido: false, substituido: false, nasEntregas: true })).toBe(false);
    expect(itemDesatualizado({ excluido: true, substituido: false, nasEntregas: true })).toBe(true);
    expect(itemDesatualizado({ excluido: false, substituido: true, nasEntregas: true })).toBe(true);
    expect(itemDesatualizado({ excluido: false, substituido: false, nasEntregas: false })).toBe(true);
  });
});
