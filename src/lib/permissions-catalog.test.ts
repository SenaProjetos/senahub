import { describe, expect, it } from "vitest";
import { ehLeitura, PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";

describe("ehLeitura", () => {
  it("reconhece as ações de leitura marcadas", () => {
    expect(ehLeitura("projetos", "ver")).toBe(true);
    expect(ehLeitura("projetos", "historico")).toBe(true);
    expect(ehLeitura("arquivos", "baixar")).toBe(true);
  });

  it("trata ação de escrita como não-leitura", () => {
    expect(ehLeitura("projetos", "gerir")).toBe(false);
    expect(ehLeitura("arquivos", "enviar")).toBe(false);
    expect(ehLeitura("uploads", "validar")).toBe(false);
    expect(ehLeitura("permissoes", "gerir")).toBe(false);
  });

  it("é fail-closed: recurso ou ação desconhecida não é leitura", () => {
    expect(ehLeitura("recurso_que_nao_existe", "ver")).toBe(false);
    expect(ehLeitura("projetos", "acao_que_nao_existe")).toBe(false);
  });

  it("mantém como NÃO-leitura os dois casos de fronteira decididos no §15.7", () => {
    // "Ver e gerar documentos" — gerar persiste arquivo.
    expect(ehLeitura("documentos", "ver")).toBe(false);
    // "Usar ferramentas e salvar cálculos" — salvar persiste.
    expect(ehLeitura("ferramentas", "usar")).toBe(false);
  });

  it("nenhuma ação `gerir` do catálogo está marcada como leitura", () => {
    // Guarda contra marcação distraída: `gerir` é sempre escrita, em qualquer recurso. Isso
    // importa porque o piso de sócio (só leitura, §15.7) é derivado desta classificação.
    for (const r of PERMISSOES_CATALOGO) {
      for (const a of r.acoes) {
        if (a.acao === "gerir") {
          expect(a.leitura ?? false, `${r.recurso}:gerir`).toBe(false);
        }
      }
    }
  });
});
