import { describe, expect, it } from "vitest";
import { rotuloCatalogo } from "./disciplina-rotulo";

describe("rotuloCatalogo", () => {
  it("não mostra nada quando a disciplina não tem FK para o catálogo", () => {
    expect(rotuloCatalogo("Alguma coisa nova", null)).toBeNull();
    expect(rotuloCatalogo("Alguma coisa nova", undefined)).toBeNull();
  });

  it("não mostra nada quando o texto já é o nome do catálogo — o caso normal", () => {
    // 79 das 85 disciplinas de produção caem aqui: a tela fica igual ao que sempre foi.
    expect(rotuloCatalogo("Elétrico", "Elétrico")).toBeNull();
    expect(rotuloCatalogo("Estrutural", "Estrutural")).toBeNull();
    // As 3 CFTV criadas pela F1.21 nascem com o nome do catálogo — nada de rótulo.
    expect(rotuloCatalogo("CFTV", "CFTV")).toBeNull();
  });

  it("mostra o catálogo nas 6 grafias que a F1.21 consolidou", () => {
    expect(rotuloCatalogo("Gases", "Gás")).toBe("Gás");
    expect(rotuloCatalogo("Lógica/cftv", "Cabeamento")).toBe("Cabeamento");
    expect(rotuloCatalogo("Lógica e Cftv", "Cabeamento")).toBe("Cabeamento");
    expect(rotuloCatalogo("Dados/Voz, Automação e CFTV", "Cabeamento")).toBe("Cabeamento");
  });

  it("mantém distinguíveis as duas linhas do 260023 que apontam para a mesma entrada", () => {
    // É a razão de o rótulo ser secundário em vez de substituir o nome: as duas compartilham
    // a FK, e trocar o texto pelo catálogo mostraria "Climatização (AVAC)" duas vezes.
    const ar = rotuloCatalogo("Ar condicionado (ARC)", "Climatização (AVAC)");
    const ext = rotuloCatalogo("Exaustão (EXT)", "Climatização (AVAC)");
    expect(ar).toBe("Climatização (AVAC)");
    expect(ext).toBe("Climatização (AVAC)");
    // O rótulo é o mesmo nas duas — quem as distingue continua sendo o nome principal.
    expect(ar).toBe(ext);
  });

  it("compara de forma exata: caixa e acento diferentes contam como diferentes", () => {
    // Combina com o backfill, que casou por nome exato. Normalizar aqui faria a tela
    // discordar de quem gravou a FK.
    expect(rotuloCatalogo("elétrico", "Elétrico")).toBe("Elétrico");
    expect(rotuloCatalogo("Eletrico", "Elétrico")).toBe("Elétrico");
  });

  it("trata string vazia de catálogo como ausência de rótulo", () => {
    expect(rotuloCatalogo("Qualquer", "")).toBeNull();
  });
});
