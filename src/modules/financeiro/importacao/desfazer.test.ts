import { describe, expect, it } from "vitest";
import { motivoParaNaoDesfazer } from "@/modules/financeiro/importacao/desfazer";

describe("motivoParaNaoDesfazer (A8)", () => {
  it("lote intocado pode ser desfeito", () => {
    expect(motivoParaNaoDesfazer({ conciliados: 0, distribuidos: 0, alterados: 0 })).toBeNull();
  });
  it("conciliado, distribuído ou alterado barra, e a frase diz quantos de cada", () => {
    const m = motivoParaNaoDesfazer({ conciliados: 1, distribuidos: 2, alterados: 3 });
    expect(m).toContain("1 conciliado com o extrato");
    expect(m).toContain("2 distribuídos entre as caixinhas");
    expect(m).toContain("3 alterados depois da importação");
    expect(m).toContain("Exclua um a um");
  });
  it("só o que existe entra na frase", () => {
    expect(motivoParaNaoDesfazer({ conciliados: 0, distribuidos: 0, alterados: 1 })).toBe(
      "Esta importação já foi trabalhada (1 alterado depois da importação): desfazer apagaria esse trabalho. Exclua um a um, em Lançamentos, os que precisam sair.",
    );
  });
});
