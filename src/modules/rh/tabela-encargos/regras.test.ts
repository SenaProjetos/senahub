import { describe, expect, it } from "vitest";
import { motivoParaNaoExcluirVersao } from "./regras";

describe("motivoParaNaoExcluirVersao", () => {
  it("não deixa a contratação sem tabela", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10"], mesesFechadosV2: [] }))
      .toBe("É a única versão desta contratação. Crie outra antes de excluir esta.");
  });
  it("não exclui versão usada por mês fechado", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2026-11"] }))
      .toBe("Esta versão foi usada no fechamento de 11/2026. Para mudar valores, crie uma versão nova.");
  });
  it("mês fechado depois da versão seguinte não prende a anterior", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2026-10", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2027-02"] }))
      .toBeNull();
  });
  it("versão futura sem uso pode sair", () => {
    expect(motivoParaNaoExcluirVersao({ vigencia: "2027-01", vigenciasDaContratacao: ["2026-10", "2027-01"], mesesFechadosV2: ["2026-11"] }))
      .toBeNull();
  });
});
