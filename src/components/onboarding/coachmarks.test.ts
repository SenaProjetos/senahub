import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { GUIAS, chaveGuia, guiaParaRota } from "./coachmarks";

describe("guia do menu de contexto em /tarefas", () => {
  it("casa a rota e as subrotas, com a chave própria do guia", () => {
    const guia = guiaParaRota("/tarefas");
    expect(guia?.rota).toBe("/tarefas");
    expect(guiaParaRota("/tarefas/qualquer")?.rota).toBe("/tarefas");
    expect(guia && chaveGuia(guia)).toBe("tour_visto:/tarefas");
  });

  // O casamento é por prefixo literal e não aceita segmento dinâmico: um guia em /projetos
  // apareceria em toda tela de projeto. Por isso a tabela de documentos (/projetos/[id]/arquivos)
  // fica só com a dica, sem coachmark.
  it("não vaza para as telas de projeto nem para o diretório de arquivos", () => {
    expect(guiaParaRota("/projetos/abc/arquivos")).toBeNull();
    expect(guiaParaRota("/arquivos")).toBeNull();
  });

  it("aponta para um data-tour que existe no quadro de tarefas", () => {
    const alvos = GUIAS.find((g) => g.rota === "/tarefas")?.passos.map((p) => p.alvo) ?? [];
    expect(alvos).toEqual(['[data-tour="menu-contexto"]']);

    // Passo sem alvo é pulado em silêncio: se o atributo sumir do quadro, o guia deixa de
    // aparecer e ninguém percebe. Este teste é o aviso.
    const quadro = readFileSync(
      path.resolve(__dirname, "../tarefas/tarefas-board.tsx"),
      "utf8",
    );
    expect(quadro).toContain('data-tour={primeiro ? "menu-contexto" : undefined}');
  });
});
