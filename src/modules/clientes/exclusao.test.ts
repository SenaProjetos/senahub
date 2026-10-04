import { describe, expect, it } from "vitest";

import { VINCULOS_VAZIOS, motivoParaNaoExcluir } from "./exclusao";

describe("motivoParaNaoExcluir", () => {
  it("cadastro vazio pode ser excluído", () => {
    expect(motivoParaNaoExcluir(VINCULOS_VAZIOS)).toBeNull();
  });

  it("qualquer vínculo impede e diz qual, no singular ou plural", () => {
    const motivo = motivoParaNaoExcluir({ ...VINCULOS_VAZIOS, projetos: 2, contatos: 1 });
    expect(motivo).toContain("2 projetos");
    expect(motivo).toContain("1 contato");
    expect(motivo).toContain("desative em vez de excluir");
  });

  it("fusão impede mesmo sem nenhuma contagem", () => {
    expect(motivoParaNaoExcluir({ ...VINCULOS_VAZIOS, fusao: true })).toContain("fusão com outro cliente");
  });

  it("cada contagem sozinha impede", () => {
    for (const campo of Object.keys(VINCULOS_VAZIOS) as (keyof typeof VINCULOS_VAZIOS)[]) {
      if (campo === "fusao") continue;
      expect(motivoParaNaoExcluir({ ...VINCULOS_VAZIOS, [campo]: 1 }), campo).not.toBeNull();
    }
  });
});
