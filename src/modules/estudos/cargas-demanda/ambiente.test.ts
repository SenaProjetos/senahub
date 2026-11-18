import { describe, expect, it } from "vitest";

import { iluminacaoSugeridaVA, potenciaTomadasMinimaVA, tomadasMinimas } from "@/modules/ferramentas/calc/cargas-demanda/habitacao";

import { avisosDoAmbiente, iluminacaoDoAmbienteCompleta, pontoDoAmbiente } from "./ambiente";
import type { AmbienteEstudo } from "./conteudo";
import { novoAmbiente, novoPonto } from "./edicao";
import { totaisDoEscopo } from "./levantamento";

const sala = (extra: Partial<AmbienteEstudo> = {}): AmbienteEstudo => ({
  ...novoAmbiente("Sala", { iluminacao: 1, tug: 0.8 }),
  tipo: "sala",
  areaM2: 18,
  perimetroM: 17,
  ...extra,
});

describe("habitação: campo em branco adota o sugerido", () => {
  it("iluminação pela área", () => {
    const r = iluminacaoDoAmbienteCompleta(sala(), "habitacao", null);
    expect(r.va).toBe(iluminacaoSugeridaVA(18));
    expect(r.ehSugerido).toBe(true);
    expect(r.w).toBe(iluminacaoSugeridaVA(18) * 1);
  });

  it("o valor digitado vale e deixa de ser sugerido", () => {
    const a = sala();
    a.iluminacao.vaAdotado = 500;
    const r = iluminacaoDoAmbienteCompleta(a, "habitacao", null);
    expect(r.va).toBe(500);
    expect(r.ehSugerido).toBe(false);
  });

  it("sem área não há sugestão: fica em branco", () => {
    const r = iluminacaoDoAmbienteCompleta(sala({ areaM2: null }), "habitacao", null);
    expect(r.va).toBeNull();
  });

  it("primeiro TUG: quantidade e potência pelo tipo, área e perímetro", () => {
    const a = sala();
    const p = pontoDoAmbiente(a, a.pontos[0], "habitacao");
    const n = tomadasMinimas("sala", 18, 17);
    expect(p.quantidade).toBe(n);
    expect(p.vaTotal).toBeCloseTo(potenciaTomadasMinimaVA("sala", n), 9);
    expect(p.quantidadeEhSugerida).toBe(true);
    expect(p.w).toBeCloseTo(potenciaTomadasMinimaVA("sala", n) * 0.8, 9);
  });

  it("quantidade digitada: a potência mínima é a da quantidade adotada", () => {
    const a = sala();
    a.pontos[0].quantidade = 6;
    const p = pontoDoAmbiente(a, a.pontos[0], "habitacao");
    expect(p.vaTotal).toBeCloseTo(potenciaTomadasMinimaVA("sala", 6), 9);
  });

  it("TUE nunca recebe sugestão; sem VA fica em branco", () => {
    const a = sala();
    const tue = novoPonto("tue");
    a.pontos.push(tue);
    const p = pontoDoAmbiente(a, tue, "habitacao");
    expect(p.vaPorPonto).toBeNull();
    expect(p.vaTotal).toBeNull();
  });

  it("fora da habitação (lux) o TUG não tem sugestão", () => {
    const a = sala();
    const p = pontoDoAmbiente(a, a.pontos[0], "lux");
    expect(p.quantidade).toBeNull();
  });
});

describe("totais do levantamento usam o sugerido", () => {
  it("iluminação e TUG somam o sugerido quando em branco", () => {
    const c = {
      criterioIluminacao: "habitacao" as const,
      peDireitoM: null,
      levantamentos: [{ id: "l", nome: "Flat", fpIluminacao: null, fpTomadas: null, pavimentos: [{ id: "p", nome: "T", ambientes: [sala()] }] }],
    };
    const t = totaisDoEscopo(c, ["l"]);
    expect(t.iluminacao.va).toBe(iluminacaoSugeridaVA(18));
    expect(t.tug.quantidade).toBe(tomadasMinimas("sala", 18, 17));
    expect(t.tug.w).not.toBeNull();
  });
});

describe("avisos do ambiente", () => {
  it("perímetro incompatível com a área", () => {
    const a = sala({ areaM2: 100, perimetroM: 10 });
    expect(avisosDoAmbiente(a, "habitacao", null).some((m) => m.id === "perimetro_incompativel")).toBe(true);
  });

  it("iluminação abaixo do mínimo da norma", () => {
    const a = sala();
    a.iluminacao.vaAdotado = 50;
    expect(avisosDoAmbiente(a, "habitacao", null).some((m) => m.id === "iluminacao_abaixo_minimo")).toBe(true);
  });

  it("os sugeridos não geram aviso", () => {
    expect(avisosDoAmbiente(sala(), "habitacao", null)).toEqual([]);
  });
});
