import { describe, expect, it } from "vitest";

import { fdAquecimentoEletrodomesticos, fdEquipamentoEspecifico } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/equatorial";
import { fdAdministracaoEdificios } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/neoenergia";

import { linhasAdministracaoEdificios, novaLinhaCarga } from "./edicao-calculo";
import { REGRA_EQT_AQUECIMENTO, fdEfetivoDaLinha, fdSugeridoDaLinha, regraVale, type ContextoFd } from "./fd-linha";
import { calcularLinha } from "./resultado";

const neo: ContextoFd = { concessionaria: "neoenergia", escopoN: 1, fdAquecimento: null };
const eqt = (extra: Partial<ContextoFd> = {}): ContextoFd => ({ concessionaria: "equatorial", escopoN: 1, fdAquecimento: null, ...extra });

describe("Neoenergia, administração de edifícios (duas linhas, Q36)", () => {
  const [il, tom] = linhasAdministracaoEdificios();

  it("a regra nasce em duas linhas, iluminação e tomadas", () => {
    expect(il.tipoCarga).toBe("iluminacao");
    expect(tom.tipoCarga).toBe("tomadas_uso_geral");
    expect(il.id).not.toBe(tom.id);
  });

  it("o FD sugerido vem da biblioteca (iluminação e tomadas), não da linha", () => {
    expect(fdSugeridoDaLinha(neo, il)).toBe(fdAdministracaoEdificios().iluminacao);
    expect(fdSugeridoDaLinha(neo, tom)).toBe(fdAdministracaoEdificios().tomadas);
  });

  it("em outra concessionária não há sugestão (nunca um número velho)", () => {
    expect(fdSugeridoDaLinha({ ...neo, concessionaria: "cemig" }, il)).toBeNull();
    expect(fdSugeridoDaLinha({ ...neo, concessionaria: null }, il)).toBeNull();
    expect(regraVale(il.regraFd, "equatorial")).toBe(false);
  });

  it("FD digitado vale mais que o sugerido; em branco, o sugerido", () => {
    expect(fdEfetivoDaLinha(neo, { ...il, fd: 0.7 })).toEqual({ fd: 0.7, ehSugerido: false });
    expect(fdEfetivoDaLinha(neo, il)).toEqual({ fd: fdAdministracaoEdificios().iluminacao, ehSugerido: true });
  });

  it("a conta usa o sugerido quando o FD está em branco", () => {
    const l = { ...tom, quantidade: 1, potenciaW: 4000, fp: 1 };
    const r = calcularLinha(l, 1, fdSugeridoDaLinha(neo, l));
    expect(r.fd).toBe(fdAdministracaoEdificios().tomadas);
    expect(r.fdEhSugerido).toBe(true);
    expect(r.demandaKVA).toBeCloseTo(4 * fdAdministracaoEdificios().tomadas, 9);
  });
});

describe("Equatorial, aquecimento: pela potência (T7) ou pelo equipamento (T6) — Q33", () => {
  const linha = (extra = {}) => novaLinhaCarga({ tipoCarga: "aquecimento", regraFd: REGRA_EQT_AQUECIMENTO, quantidade: 12, potenciaW: 5500, ...extra });

  it("toda linha de aquecimento da Equatorial segue a regra, sem marcar linha a linha", () => {
    const solta = novaLinhaCarga({ tipoCarga: "aquecimento", quantidade: 12, potenciaW: 5500 });
    expect(fdSugeridoDaLinha(eqt(), solta)).toBe(fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 12).fd);
    expect(fdSugeridoDaLinha({ ...eqt(), concessionaria: "cemig" }, solta)).toBeNull();
    expect(fdSugeridoDaLinha(eqt(), { ...solta, tipoCarga: "iluminacao" })).toBeNull();
  });

  it("padrão é pela potência: acima de 3,5 kW", () => {
    expect(fdSugeridoDaLinha(eqt(), linha())).toBe(fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 12).fd);
  });

  it("até 3,5 kW é inclusive", () => {
    expect(fdSugeridoDaLinha(eqt(), linha({ potenciaW: 3500 }))).toBe(fdAquecimentoEletrodomesticos("ate_3_5_kW", 12).fd);
    expect(fdSugeridoDaLinha(eqt(), linha({ potenciaW: 3501 }))).toBe(fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 12).fd);
  });

  it("pelo equipamento: usa o grupo escolhido; sem grupo, sem sugestão", () => {
    const ctx = eqt({ fdAquecimento: "equipamento" });
    expect(fdSugeridoDaLinha(ctx, linha({ subtipo: "chuveiro" }))).toBe(fdEquipamentoEspecifico("chuveiro", 12).fd);
    expect(fdSugeridoDaLinha(ctx, linha())).toBeNull();
    expect(fdSugeridoDaLinha(ctx, linha({ subtipo: "grupo-inexistente" }))).toBeNull();
  });

  it("os dois critérios dão números diferentes para a mesma linha", () => {
    expect(fdSugeridoDaLinha(eqt(), linha())).not.toBe(fdSugeridoDaLinha(eqt({ fdAquecimento: "equipamento" }), linha({ subtipo: "chuveiro" })));
  });

  it("o nº de aparelhos é o do ESCOPO (quantidade × N)", () => {
    expect(fdSugeridoDaLinha(eqt({ escopoN: 5 }), linha({ quantidade: 12 }))).toBe(fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 60).fd);
  });

  it("sem quantidade ou potência: sem sugestão", () => {
    expect(fdSugeridoDaLinha(eqt(), linha({ quantidade: null }))).toBeNull();
    expect(fdSugeridoDaLinha(eqt(), linha({ potenciaW: null }))).toBeNull();
  });
});

describe("linha sem regra", () => {
  it("não tem sugestão", () => {
    expect(fdSugeridoDaLinha(neo, novaLinhaCarga())).toBeNull();
    expect(fdEfetivoDaLinha(neo, novaLinhaCarga())).toEqual({ fd: null, ehSugerido: false });
  });
});
