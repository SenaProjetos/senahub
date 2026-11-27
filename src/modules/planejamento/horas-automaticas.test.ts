import { describe, expect, it } from "vitest";
import {
  atribuicaoAposEditar,
  horasAutomaticasDaLinha,
  nasceAutomatica,
  perfilQueAPessoaOcupa,
  type AtribuicaoParaHorasAutomaticas,
  type LinhaParaHorasAutomaticas,
  type PesoDaPessoa,
} from "./horas-automaticas";

const linha = (p: Partial<LinhaParaHorasAutomaticas> = {}): LinhaParaHorasAutomaticas => ({
  tipoEap: "atv",
  ehResumo: false,
  duracaoDias: 5,
  status: "nin",
  ...p,
});

const auto = (id: string, userId: string, p: Partial<AtribuicaoParaHorasAutomaticas> = {}): AtribuicaoParaHorasAutomaticas => ({
  id,
  userId,
  papel: "pro",
  horas: 0,
  automatica: true,
  ...p,
});

const pesos = (m: Record<string, Partial<PesoDaPessoa>>) => (userId: string): PesoDaPessoa => ({
  jornadaSemanal: 40,
  dedicacao: 1,
  ...m[userId],
});

describe("horasAutomaticasDaLinha — cenários do planejamento (26/11/2026)", () => {
  it("Mireli e João Vitor a 100%, 5 dias: 20 h cada", () => {
    const r = horasAutomaticasDaLinha(linha(), [auto("m", "mireli"), auto("j", "joao")], pesos({}));
    expect(Object.fromEntries(r)).toEqual({ m: 20, j: 20 });
  });

  it("Mireli a 50%: 13,33 h e João Vitor 26,67 h — o total continua 40 h", () => {
    const r = horasAutomaticasDaLinha(linha(), [auto("m", "mireli"), auto("j", "joao")], pesos({ mireli: { dedicacao: 0.5 } }));
    expect(r.get("m")).toBe(13.33);
    expect(r.get("j")).toBe(26.67);
    expect((r.get("m")! * 100 + r.get("j")! * 100) / 100).toBe(40);
  });

  it("jornadas diferentes: Mireli 8 h e estagiário 6 h por dia, ambos a 100% — 22,85 h e 17,15 h", () => {
    const r = horasAutomaticasDaLinha(linha(), [auto("m", "mireli"), auto("e", "estag")], pesos({ estag: { jornadaSemanal: 30 } }));
    expect(r.get("m")).toBe(22.85);
    expect(r.get("e")).toBe(17.15);
  });

  it("pessoa sozinha recebe o total inteiro, mesmo com jornada menor (o conflito é que avisa)", () => {
    const r = horasAutomaticasDaLinha(linha(), [auto("e", "estag")], pesos({ estag: { jornadaSemanal: 30, dedicacao: 0.5 } }));
    expect(r.get("e")).toBe(40);
  });
});

describe("horasAutomaticasDaLinha — perfil sem pessoa (feedback do planejamento, 26/11/2026)", () => {
  const perfil = (id: string, p: Partial<AtribuicaoParaHorasAutomaticas> = {}) => auto(id, null as unknown as string, { userId: null, ...p });

  it("perfil sozinho, 10 dias: 80 h", () => {
    expect(horasAutomaticasDaLinha(linha({ duracaoDias: 10 }), [perfil("p")], pesos({})).get("p")).toBe(80);
  });

  it("perfil pesa o expediente a 100%: com uma pessoa a 50%, 26,66 h × 13,34 h (o resto do centésimo vai para a última)", () => {
    const r = horasAutomaticasDaLinha(linha(), [perfil("p"), auto("m", "mireli")], pesos({ mireli: { dedicacao: 0.5 } }));
    expect(r.get("p")).toBe(26.66);
    expect(r.get("m")).toBe(13.34);
  });

  it("hora digitada no perfil sai do total antes de dividir", () => {
    const r = horasAutomaticasDaLinha(linha(), [perfil("p", { automatica: false, horas: 15 }), auto("m", "mireli")], pesos({}));
    expect(Object.fromEntries(r)).toEqual({ m: 25 });
  });
});

describe("horasAutomaticasDaLinha — o que não muda", () => {
  it("hora digitada de outra pessoa sai do total antes de dividir", () => {
    const r = horasAutomaticasDaLinha(
      linha(),
      [auto("m", "mireli"), auto("j", "joao", { automatica: false, horas: 10 }), auto("c", "coord", { papel: "coo", automatica: false, horas: 2 })],
      pesos({}),
    );
    expect(Object.fromEntries(r)).toEqual({ m: 28 });
  });

  it("digitado acima do total deixa as automáticas em zero (nunca negativo)", () => {
    const r = horasAutomaticasDaLinha(linha(), [auto("m", "mireli"), auto("j", "joao", { automatica: false, horas: 50 })], pesos({}));
    expect(r.get("m")).toBe(0);
  });

  it("Externo, quem acompanha e o perfil que não executa nunca recebem hora automática, mesmo marcados", () => {
    const r = horasAutomaticasDaLinha(
      linha(),
      [
        auto("c", "coord", { papel: "coo" }),
        auto("x", null as unknown as string, { userId: null, papel: "ext" }),
        auto("r", null as unknown as string, { userId: null, papel: "rev" }),
      ],
      pesos({}),
    );
    expect(r.size).toBe(0);
  });

  it("linha encerrada não muda", () => {
    expect(horasAutomaticasDaLinha(linha({ status: "con" }), [auto("m", "mireli")], pesos({})).size).toBe(0);
  });

  it("marco e agrupamento zeram as automáticas", () => {
    expect(horasAutomaticasDaLinha(linha({ tipoEap: "mrc", duracaoDias: 0 }), [auto("m", "mireli", { horas: 8 })], pesos({})).get("m")).toBe(0);
    expect(horasAutomaticasDaLinha(linha({ ehResumo: true }), [auto("m", "mireli", { horas: 8 })], pesos({})).get("m")).toBe(0);
  });

  it("sem jornada cadastrada usa o expediente comercial; todos sem dedicação dividem por igual", () => {
    expect(Object.fromEntries(horasAutomaticasDaLinha(linha(), [auto("a", "a"), auto("b", "b")], pesos({ a: { jornadaSemanal: 0 } })))).toEqual({ a: 20, b: 20 });
    expect(Object.fromEntries(horasAutomaticasDaLinha(linha(), [auto("a", "a"), auto("b", "b")], pesos({ a: { dedicacao: 0 }, b: { dedicacao: 0 } })))).toEqual({ a: 20, b: 20 });
  });

  it("duração fracionada: 2,5 dias = 20 h; três pessoas fecham a soma no centésimo", () => {
    const r = horasAutomaticasDaLinha(linha({ duracaoDias: 2.5 }), [auto("a", "a"), auto("b", "b"), auto("c", "c")], pesos({}));
    expect([r.get("a"), r.get("b"), r.get("c")]).toEqual([6.66, 6.66, 6.68]);
  });
});

describe("perfilQueAPessoaOcupa — a pessoa preenche a vaga", () => {
  const vagas = [
    { id: "x", userId: null, papel: "ext" as const },
    { id: "r", userId: null, papel: "rev" as const },
    { id: "m", userId: "mireli", papel: "pro" as const },
    { id: "p", userId: null, papel: "pro" as const },
    { id: "p2", userId: null, papel: "pro" as const },
  ];
  it("mesmo papel: o primeiro perfil dele", () => {
    expect(perfilQueAPessoaOcupa(vagas, "pro")?.id).toBe("p");
    expect(perfilQueAPessoaOcupa(vagas, "rev")?.id).toBe("r");
  });
  it("papel sem perfil: entra como atribuição nova", () => {
    expect(perfilQueAPessoaOcupa(vagas, "mod")).toBeNull();
  });
  it("sem papel (arrasto): o primeiro perfil que executa, nunca o Externo nem o revisor", () => {
    expect(perfilQueAPessoaOcupa(vagas, null)?.id).toBe("p");
    expect(perfilQueAPessoaOcupa(vagas.slice(0, 3), null)).toBeNull();
  });
  it("Externo nunca é vaga, mesmo pedindo o papel ext", () => {
    expect(perfilQueAPessoaOcupa(vagas, "ext")).toBeNull();
  });
});

describe("quando a atribuição é automática", () => {
  it("nasce automática: pessoa que executa, sem hora digitada", () => {
    expect(nasceAutomatica({ userId: "u", papel: "pro", horas: 0 })).toBe(true);
    expect(nasceAutomatica({ userId: "u", papel: "pro", horas: 12 })).toBe(false);
    expect(nasceAutomatica({ userId: "u", papel: "coo", horas: 0 })).toBe(false);
    expect(nasceAutomatica({ userId: null, papel: "pro", horas: 0 })).toBe(true);
    expect(nasceAutomatica({ userId: null, papel: "pro", horas: 12 })).toBe(false);
    expect(nasceAutomatica({ userId: null, papel: "rev", horas: 0 })).toBe(false);
    expect(nasceAutomatica({ userId: null, papel: "ext", horas: 0 })).toBe(false);
  });

  it("perfil: zero volta ao automático; perfil → pessoa (horas ausentes) continua automático", () => {
    expect(atribuicaoAposEditar({ horas: 0, automatica: false }, { userId: null, papel: "pro", horas: 0 })).toEqual({ horas: 0, automatica: true });
    expect(atribuicaoAposEditar({ horas: 40, automatica: true }, { userId: "u", papel: "pro" })).toEqual({ horas: 40, automatica: true });
  });

  it("depois de editar: digitar outro valor desliga, zero liga, o mesmo valor mantém", () => {
    expect(atribuicaoAposEditar({ horas: 20, automatica: true }, { userId: "u", papel: "pro", horas: 12 })).toEqual({ horas: 12, automatica: false });
    expect(atribuicaoAposEditar({ horas: 12, automatica: false }, { userId: "u", papel: "pro", horas: 0 })).toEqual({ horas: 0, automatica: true });
    expect(atribuicaoAposEditar({ horas: 20, automatica: true }, { userId: "u", papel: "pro", horas: 20 })).toEqual({ horas: 20, automatica: true });
    expect(atribuicaoAposEditar({ horas: 20, automatica: false }, { userId: "u", papel: "pro", horas: 20 })).toEqual({ horas: 20, automatica: false });
  });

  it("sem horas na edição (trocou só o papel): ficam as gravadas, nunca um valor velho da tela", () => {
    expect(atribuicaoAposEditar({ horas: 8, automatica: true }, { userId: "u", papel: "mod" })).toEqual({ horas: 8, automatica: true });
    expect(atribuicaoAposEditar({ horas: 10, automatica: false }, { userId: "u", papel: "mod" })).toEqual({ horas: 10, automatica: false });
  });

  it("quem passa a revisar sai do automático e a hora do sistema vira zero; a digitada fica", () => {
    expect(atribuicaoAposEditar({ horas: 16, automatica: true }, { userId: "u", papel: "rev" })).toEqual({ horas: 0, automatica: false });
    expect(atribuicaoAposEditar({ horas: 6, automatica: false }, { userId: "u", papel: "rev" })).toEqual({ horas: 6, automatica: false });
    expect(atribuicaoAposEditar({ horas: 16, automatica: true }, { userId: "u", papel: "rev", horas: 0 })).toEqual({ horas: 0, automatica: false });
  });
});
