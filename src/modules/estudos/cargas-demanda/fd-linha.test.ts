import { describe, expect, it } from "vitest";

import { fdAquecimento as fdAquecimentoCelesc, fdArCondicionado as fdArCelesc } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/celesc";
import { fdAparelhos as fdAparelhosCemig, fdFornosFogoes } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/cemig";
import { fdAquecimento as fdAquecimentoCopel, fdArCondicionado as fdArCopel, fdMotores as fdMotoresCopel } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/copel";
import {
  fdAquecimentoEletrodomesticos,
  fdArCondicionadoEdificio,
  fdArCondicionadoResidencia,
  fdEquipamentoEspecifico,
  fdHidromassagem,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/equatorial";
import {
  fdAdministracaoEdificios,
  fdAquecimento as fdAquecimentoNeo,
  fdArCondicionado as fdArNeo,
  fdFogao,
  fdRecargaIndividual,
} from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/neoenergia";

import type { Concessionaria, LinhaCargaEstudo } from "./conteudo";
import { linhasAdministracaoEdificios, novaLinhaCarga } from "./edicao-calculo";
import { REGRA_EQT_AQUECIMENTO, REGRA_NEO_ADM_ILUMINACAO, fdEfetivoDaLinha, fdSugeridoDaLinha, regraCabeNoTipo, regraVale, regrasOferecidas, type ContextoFd } from "./fd-linha";
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

// ─── Demais tabelas por nº de aparelhos (passo 1d da retomada) ─────────────────────────────────────────────────────

const linhaDe = (extra: Partial<LinhaCargaEstudo>): LinhaCargaEstudo => ({ ...novaLinhaCarga(), ...extra });
const ctxDe = (concessionaria: Concessionaria, extra: Partial<ContextoFd> = {}): ContextoFd => ({ concessionaria, escopoN: 1, fdAquecimento: null, ...extra });

describe("regras por nº de aparelhos (o valor é o da biblioteca)", () => {
  it("Celesc: aquecimento vale sozinho (única regra do tipo); ar-condicionado só depois de escolhido", () => {
    const aq = linhaDe({ tipoCarga: "aquecimento", quantidade: 4 });
    expect(fdSugeridoDaLinha(ctxDe("celesc"), aq)).toBe(fdAquecimentoCelesc(4).fd);
    const ar = linhaDe({ tipoCarga: "ar_condicionado", quantidade: 6 });
    expect(fdSugeridoDaLinha(ctxDe("celesc"), ar)).toBeNull();
    expect(fdSugeridoDaLinha(ctxDe("celesc"), { ...ar, regraFd: "celesc-ar" })).toBe(fdArCelesc(false, 6).fd);
    expect(fdSugeridoDaLinha(ctxDe("celesc"), { ...ar, regraFd: "celesc-ar-central" })).toBe(fdArCelesc(true, 1).fd);
  });

  it("o × N do escopo multiplica a contagem", () => {
    const aq = linhaDe({ tipoCarga: "aquecimento", quantidade: 4 });
    expect(fdSugeridoDaLinha(ctxDe("copel", { escopoN: 5 }), aq)).toBe(fdAquecimentoCopel(20).fd);
  });

  it("Copel: ar-condicionado por uso e motores pelo TOTAL de motores do cálculo", () => {
    const ar = linhaDe({ tipoCarga: "ar_condicionado", quantidade: 3, regraFd: "copel-ar-comercial" });
    expect(fdSugeridoDaLinha(ctxDe("copel"), ar)).toBe(fdArCopel("comercial", 3).fd);
    const m1 = linhaDe({ tipoCarga: "motores", quantidade: 2 });
    const m2 = linhaDe({ tipoCarga: "motores", quantidade: 4 });
    expect(fdSugeridoDaLinha(ctxDe("copel", { linhas: [m1, m2] }), m1)).toBe(fdMotoresCopel(6).fd);
    expect(fdSugeridoDaLinha(ctxDe("copel"), m1)).toBe(fdMotoresCopel(2).fd);
  });

  it("Neoenergia: aquecimento soma os aparelhos do cálculo que seguem a mesma tabela; o resto conta por linha", () => {
    const a = linhaDe({ tipoCarga: "aquecimento", quantidade: 3, regraFd: "neo-aquecimento" });
    const b = linhaDe({ tipoCarga: "aquecimento", quantidade: 5, regraFd: "neo-aquecimento" });
    const fogao = linhaDe({ tipoCarga: "tomadas_uso_especifico", quantidade: 7, regraFd: "neo-fogao" });
    const ctx = ctxDe("neoenergia", { linhas: [a, b, fogao] });
    expect(fdSugeridoDaLinha(ctx, a)).toBe(fdAquecimentoNeo(8).fd);
    expect(fdSugeridoDaLinha(ctx, fogao)).toBe(fdFogao(7).fd);
    expect(fdSugeridoDaLinha(ctxDe("neoenergia"), linhaDe({ tipoCarga: "recarga", quantidade: 9 }))).toBe(fdRecargaIndividual(9).fd);
    expect(fdSugeridoDaLinha(ctxDe("neoenergia"), linhaDe({ tipoCarga: "ar_condicionado", quantidade: 2, regraFd: "neo-ar-central" }))).toBe(fdArNeo("central", 1).fd);
  });

  it("Cemig: fogão e forno pela potência do aparelho (3,5 kW inclusive) e aparelhos pelo grupo", () => {
    const f = (potenciaW: number | null) => linhaDe({ tipoCarga: "tomadas_uso_especifico", quantidade: 5, potenciaW, regraFd: "cemig-fogoes-fornos" });
    expect(fdSugeridoDaLinha(ctxDe("cemig"), f(3500))).toBe(fdFornosFogoes("ate_3_5kw", 5).fd);
    expect(fdSugeridoDaLinha(ctxDe("cemig"), f(3501))).toBe(fdFornosFogoes("superior_3_5kw", 5).fd);
    expect(fdSugeridoDaLinha(ctxDe("cemig"), f(null))).toBeNull();
    expect(fdSugeridoDaLinha(ctxDe("cemig"), linhaDe({ tipoCarga: "ar_condicionado", quantidade: 8, regraFd: "cemig-aparelhos" }))).toBe(fdAparelhosCemig(8).fd);
  });

  it("Equatorial: ar-condicionado e hidromassagem", () => {
    const ar = (regraFd: string) => linhaDe({ tipoCarga: "ar_condicionado", quantidade: 10, regraFd });
    expect(fdSugeridoDaLinha(ctxDe("equatorial"), ar("eqt-ar-edificio-comerciais"))).toBe(fdArCondicionadoEdificio("comerciais", 10).fd);
    expect(fdSugeridoDaLinha(ctxDe("equatorial"), ar("eqt-ar-residencia"))).toBe(fdArCondicionadoResidencia(10).fd);
    expect(fdSugeridoDaLinha(ctxDe("equatorial"), linhaDe({ tipoCarga: "outro", quantidade: 4, regraFd: "eqt-hidromassagem" }))).toBe(fdHidromassagem(4).fd);
  });

  it("regra de outra concessionária, de outro tipo ou sem quantidade não sugere", () => {
    const ar = linhaDe({ tipoCarga: "ar_condicionado", quantidade: 6, regraFd: "celesc-ar" });
    expect(fdSugeridoDaLinha(ctxDe("copel"), ar)).toBeNull();
    expect(fdSugeridoDaLinha(ctxDe("celesc"), { ...ar, tipoCarga: "iluminacao" })).toBeNull();
    expect(fdSugeridoDaLinha(ctxDe("celesc"), { ...ar, quantidade: null })).toBeNull();
  });

  it("a lista da tela traz as regras do tipo, sem as automáticas; trocar o tipo solta a regra que não cabe", () => {
    expect(regrasOferecidas("celesc", "ar_condicionado").map((r) => r.id)).toEqual(["celesc-ar", "celesc-ar-central"]);
    expect(regrasOferecidas("celesc", "aquecimento")).toEqual([]);
    expect(regrasOferecidas("energisa", "ar_condicionado")).toEqual([]);
    expect(regrasOferecidas(null, "aquecimento")).toEqual([]);
    expect(regraCabeNoTipo("celesc-ar", "ar_condicionado")).toBe(true);
    expect(regraCabeNoTipo("celesc-ar", "iluminacao")).toBe(false);
    expect(regraCabeNoTipo(REGRA_NEO_ADM_ILUMINACAO, "tomadas_uso_geral")).toBe(true);
    expect(regraCabeNoTipo(null, null)).toBe(true);
  });
});
