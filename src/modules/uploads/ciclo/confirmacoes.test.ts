import { describe, expect, it } from "vitest";

import { MOTIVO_CARIMBO_ILEGIVEL } from "./carimbo";
import { CONFIRMACOES_DO_CICLO, confirmacaoDaRecusa } from "./confirmacoes";
import { MOTIVO_SEM_DWG_SEM_TIPO } from "./regras";

describe("confirmacaoDaRecusa", () => {
  it("reconhece a recusa pela frase exata do servidor", () => {
    expect(confirmacaoDaRecusa(MOTIVO_CARIMBO_ILEGIVEL)).toBe("carimbo");
    expect(confirmacaoDaRecusa(MOTIVO_SEM_DWG_SEM_TIPO)).toBe("dwg");
  });

  it("erro comum (ou mensagem que só contém a frase) não pede confirmação", () => {
    expect(confirmacaoDaRecusa("Esta revisão está bloqueada.")).toBeNull();
    expect(confirmacaoDaRecusa(`Corrija antes:\n• ${MOTIVO_CARIMBO_ILEGIVEL}`)).toBeNull();
    expect(confirmacaoDaRecusa(undefined)).toBeNull();
  });

  it("textos no singular e no plural", () => {
    expect(CONFIRMACOES_DO_CICLO.dwg.botaoLote(1)).toBe("Publicar sem o DWG");
    expect(CONFIRMACOES_DO_CICLO.dwg.botaoLote(3)).toBe("Publicar as 3 sem o DWG");
    expect(CONFIRMACOES_DO_CICLO.carimbo.aviso(2)).toMatch(/^Em 2 revisões/);
  });
});
