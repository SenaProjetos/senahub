import { describe, expect, it } from "vitest";
import { aplicarPadrao, compilarPadrao, ehModelo } from "./padrao";

describe("ehModelo", () => {
  it("campo entre chaves é modelo; quantificador de regex não é", () => {
    expect(ehModelo("{proj}-{disc}-{fase}-{nº}-{tipo}")).toBe(true);
    expect(ehModelo("^[A-Z]{3}-\\d{4}$")).toBe(false);
  });
});

describe("compilarPadrao — modelo", () => {
  // Os dois padrões cadastrados em produção em 2026-09-15.
  const global = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}");
  const comRevisao = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}-{Rnn}");

  it("lê os campos do nome", () => {
    expect(aplicarPadrao("260020-EST-EX-4000-DET", global!)).toEqual({
      proj: "260020",
      disc: "EST",
      fase: "EX",
      num: "4000",
      tipo: "DET",
    });
  });

  it("exige o que o modelo exige e aceita o que ele permite", () => {
    expect(aplicarPadrao("260020-EST-EX-4000-DET", comRevisao!)).toBeNull();
    expect(aplicarPadrao("260020-EST-EX-4000-DET-R00", comRevisao!)?.rev).toBe("R00");
  });

  it("trecho entre colchetes é opcional", () => {
    const p = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]")!;
    expect(aplicarPadrao("260020-EST-EX-4000-DET", p)).toMatchObject({ tipo: "DET" });
    expect(aplicarPadrao("260020-EST-EX-4000-DET-R02", p)?.rev).toBe("R02");
  });

  it("aceita underscore, subprojeto e o R fora do campo", () => {
    const p = compilarPadrao("{proj}_{disc}_{fase}_{tipo}_{nº}_R{rev}")!;
    expect(aplicarPadrao("26019_EST_EX_DTC_4003_R00", p)).toMatchObject({ disc: "EST", tipo: "DTC", num: "4003", rev: "00" });
    const comSub = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}")!;
    expect(aplicarPadrao("26001.1-EST-EX-4001-DTC", comSub)?.proj).toBe("26001.1");
  });

  it("campo desconhecido no modelo ainda valida, só não extrai", () => {
    const p = compilarPadrao("{proj}-{cliente}-{disc}-{fase}")!;
    expect(p.campos).not.toContain("cliente");
    expect(aplicarPadrao("260020-ACME-EST-EX", p)).toEqual({ proj: "260020", disc: "EST", fase: "EX" });
  });

  it("não casa nome fora do modelo", () => {
    expect(aplicarPadrao("planta qualquer", global!)).toBeNull();
  });
});

describe("compilarPadrao — regex", () => {
  it("regex sem grupo nomeado só valida", () => {
    const p = compilarPadrao("^[A-Z]{3}-\\d{4}$")!;
    expect(p.extrai).toBe(false);
    expect(aplicarPadrao("EST-4001", p)).toEqual({});
    expect(aplicarPadrao("est-4001", p)).toBeNull();
  });

  it("regex com grupo nomeado extrai", () => {
    const p = compilarPadrao("^(?<proj>\\d{6})-(?<disc>[A-Z]{3})-(?<fase>[A-Z]{2})$")!;
    expect(p.extrai).toBe(true);
    expect(aplicarPadrao("260020-EST-EX", p)).toEqual({ proj: "260020", disc: "EST", fase: "EX" });
  });

  it("regex inválida não compila (e não vira alerta para ninguém)", () => {
    expect(compilarPadrao("[")).toBeNull();
    expect(compilarPadrao("   ")).toBeNull();
    expect(compilarPadrao(null)).toBeNull();
  });
});
