import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import {
  capacidadeHorasNoDia,
  capacidadePorSemana,
  detectarSobrecargas,
  diasEntre,
  distribuirHoras,
  ehEtapaDeTerceiro,
  escolherPrincipal,
  herdarResponsaveis,
  horasDaLinha,
  linhaAceitaAtribuicao,
  linhaAceitaHoras,
  linhaGeraCard,
  parcelasDaAlocacaoDigitada,
  parcelasDasLinhas,
  somarCarga,
  type LinhaCarga,
  type PessoaCapacidade,
} from "./recursos";

// Semana de 14/09/2026 (segunda) a 20/09; 21/09 começa a seguinte. 2026-W38 e W39.
const cal = criarCalendario();
const comFeriado = criarCalendario({ feriados: ["2026-09-16"] });

const gradeCheia = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, ativo: true, horasDia: 8 }));
const pessoa = (userId: string, extra: Partial<PessoaCapacidade> = {}): PessoaCapacidade => ({
  userId,
  multiplicador: 1,
  grade: gradeCheia,
  ausencias: new Set(),
  ...extra,
});

describe("o que a linha aceita", () => {
  it("atividade e marco recebem gente; resumo e agrupador não", () => {
    expect(linhaAceitaAtribuicao({ tipoEap: "atv", ehResumo: false }).ok).toBe(true);
    expect(linhaAceitaAtribuicao({ tipoEap: "mrc", ehResumo: false }).ok).toBe(true);
    expect(linhaAceitaAtribuicao({ tipoEap: "disc", ehResumo: false }).ok).toBe(false);
  });

  it("atividade que ganhou filhos virou resumo e deixa de receber — contaria as horas duas vezes", () => {
    expect(linhaAceitaAtribuicao({ tipoEap: "atv", ehResumo: true }).ok).toBe(false);
  });

  it("marco recebe gente mas não hora — não há dia para espalhar", () => {
    expect(linhaAceitaHoras({ tipoEap: "mrc", ehResumo: false, duracaoDias: 0 })).toBe(false);
    expect(linhaAceitaHoras({ tipoEap: "atv", ehResumo: false, duracaoDias: 0 })).toBe(false);
    expect(linhaAceitaHoras({ tipoEap: "atv", ehResumo: false, duracaoDias: 0.5 })).toBe(true);
  });
});

describe("etapa de terceiro", () => {
  it("origem de fora da casa é terceiro; interna, compatibilização e alteração não", () => {
    for (const s of ["CLI", "ARQ", "EXT", "FIS", "APR", "CON", "OBR"]) expect(ehEtapaDeTerceiro(s)).toBe(true);
    for (const s of ["INT", "CMP", "ALT"]) expect(ehEtapaDeTerceiro(s)).toBe(false);
  });

  it("sem origem é da casa; origem desconhecida também — aparece em vez de sumir", () => {
    expect(ehEtapaDeTerceiro(null)).toBe(false);
    expect(ehEtapaDeTerceiro("XYZ")).toBe(false);
  });
});

describe("horasDaLinha — o que o motor pondera", () => {
  const atv = { tipoEap: "atv" as const, ehResumo: false, duracaoDias: 5, deTerceiro: false };

  it("soma as horas de todo mundo na linha", () => {
    expect(horasDaLinha(atv, [{ horas: 40 }, { horas: 4 }])).toBe(44);
  });

  it("interna sem ninguém, ou só com zero hora, é NÃO ESTIMADA (null)", () => {
    expect(horasDaLinha(atv, [])).toBeNull();
    expect(horasDaLinha(atv, [{ horas: 0 }])).toBeNull();
  });

  it("coordenador com zero hora ao lado de projetista com 40 não derruba a estimativa", () => {
    expect(horasDaLinha(atv, [{ horas: 40 }, { horas: 0 }])).toBe(40);
  });

  it("etapa de terceiro é sempre estimada — zero hora da casa é a resposta certa", () => {
    expect(horasDaLinha({ ...atv, deTerceiro: true }, [])).toBe(0);
  });

  it("marco e resumo devolvem undefined: o motor decide", () => {
    expect(horasDaLinha({ ...atv, tipoEap: "mrc", duracaoDias: 0 }, [{ horas: 3 }])).toBeUndefined();
    expect(horasDaLinha({ ...atv, ehResumo: true }, [{ horas: 3 }])).toBeUndefined();
  });
});

describe("escolherPrincipal", () => {
  const a = (id: string, userId: string | null, papel: "pro" | "rev" | "coo" | "mod", principal = false) => ({
    id,
    userId,
    papel,
    principal,
  });

  it("mantém o principal atual enquanto ele for pessoa", () => {
    expect(escolherPrincipal([a("1", "u1", "pro"), a("2", "u2", "rev", true)])).toBe("2");
  });

  it("sem principal, quem executa vem antes de quem revisa ou coordena", () => {
    expect(escolherPrincipal([a("1", "u1", "rev"), a("2", "u2", "coo"), a("3", "u3", "mod")])).toBe("3");
  });

  it("empate de papel fica com o primeiro da lista", () => {
    expect(escolherPrincipal([a("1", "u1", "pro"), a("2", "u2", "pro")])).toBe("1");
  });

  it("perfil nunca é principal; só perfis = sem principal", () => {
    expect(escolherPrincipal([a("1", null, "pro"), a("2", "u2", "rev")])).toBe("2");
    expect(escolherPrincipal([a("1", null, "pro")])).toBeNull();
  });
});

describe("herdarResponsaveis (D22)", () => {
  const linha = (id: string, extra: Partial<Parameters<typeof herdarResponsaveis>[0][number]> = {}) => ({
    id,
    tipoEap: "atv" as const,
    ehResumo: false,
    disciplinaId: "ele",
    temAtribuicao: false,
    ...extra,
  });
  const resp = new Map([["ele", ["maria", "joao"]]]);

  it("os responsáveis da disciplina descem como Projetista, sem hora; o primeiro é o principal", () => {
    expect(herdarResponsaveis([linha("l1")], resp)).toEqual([
      { tarefaId: "l1", userId: "maria", papel: "pro", principal: true },
      { tarefaId: "l1", userId: "joao", papel: "pro", principal: false },
    ]);
  });

  it("linha que já tem QUALQUER atribuição não é tocada — nem para acrescentar", () => {
    expect(herdarResponsaveis([linha("l1", { temAtribuicao: true })], resp)).toEqual([]);
  });

  it("resumo, agrupador, linha sem disciplina e disciplina sem responsável ficam de fora", () => {
    expect(
      herdarResponsaveis(
        [
          linha("r", { ehResumo: true }),
          linha("d", { tipoEap: "disc" }),
          linha("s", { disciplinaId: null }),
          linha("x", { disciplinaId: "hid" }),
        ],
        resp,
      ),
    ).toEqual([]);
  });

  it("marco herda também — responsável sem hora", () => {
    expect(herdarResponsaveis([linha("m", { tipoEap: "mrc" })], resp)).toHaveLength(2);
  });

  it("responsável repetido na lista não duplica (o banco recusaria a transação inteira)", () => {
    expect(herdarResponsaveis([linha("l1")], new Map([["ele", ["maria", "maria"]]]))).toHaveLength(1);
  });
});

describe("linhaGeraCard (D24)", () => {
  const base = {
    tipoEap: "atv" as const,
    ehResumo: false,
    duracaoDias: 5,
    status: "nin" as const,
    deTerceiro: false,
    pessoas: ["maria"],
  };

  it("atividade da casa, com gente, em cronograma aprovado: vira card", () => {
    expect(linhaGeraCard(base, true)).toBe(true);
  });

  it("rascunho não gera card nenhum (D14)", () => {
    expect(linhaGeraCard(base, false)).toBe(false);
  });

  it("marco, resumo, terceiro e linha sem pessoa não geram card", () => {
    expect(linhaGeraCard({ ...base, tipoEap: "mrc", duracaoDias: 0 }, true)).toBe(false);
    expect(linhaGeraCard({ ...base, ehResumo: true }, true)).toBe(false);
    expect(linhaGeraCard({ ...base, deTerceiro: true }, true)).toBe(false);
    expect(linhaGeraCard({ ...base, pessoas: [] }, true)).toBe(false);
  });

  it("linha encerrada não nasce como card — cairia na primeira coluna como trabalho novo", () => {
    for (const status of ["con", "can", "arq"] as const) expect(linhaGeraCard({ ...base, status }, true)).toBe(false);
  });
});

describe("distribuirHoras", () => {
  it("espalha por igual nos dias úteis — 40 h em 5 dias são 8 h por dia", () => {
    const d = distribuirHoras("2026-09-14", "2026-09-18", 40, cal);
    expect([...d.values()]).toEqual([8, 8, 8, 8, 8]);
  });

  it("pula fim de semana e feriado do calendário", () => {
    const d = distribuirHoras("2026-09-14", "2026-09-21", 30, comFeriado);
    // Úteis: 14, 15, 17, 18, 21 (16 é feriado, 19/20 fim de semana).
    expect([...d.keys()]).toEqual(["2026-09-14", "2026-09-15", "2026-09-17", "2026-09-18", "2026-09-21"]);
    expect(d.get("2026-09-17")).toBe(6);
  });

  it("linha de meio dia (duração fracionada) cabe num dia só", () => {
    expect([...distribuirHoras("2026-09-14", "2026-09-14", 4, cal)]).toEqual([["2026-09-14", 4]]);
  });

  it("sem dia útil dentro dela, joga tudo no primeiro dia em vez de sumir com as horas", () => {
    expect([...distribuirHoras("2026-09-19", "2026-09-20", 6, cal)]).toEqual([["2026-09-19", 6]]);
  });

  it("zero, negativo ou datas invertidas não produzem carga", () => {
    expect(distribuirHoras("2026-09-14", "2026-09-18", 0, cal).size).toBe(0);
    expect(distribuirHoras("2026-09-14", "2026-09-18", -3, cal).size).toBe(0);
    expect(distribuirHoras("2026-09-18", "2026-09-14", 8, cal).size).toBe(0);
  });

  it("a soma espalhada devolve exatamente o total (sem hora perdida em dízima)", () => {
    const d = distribuirHoras("2026-09-14", "2026-09-16", 10, cal);
    expect([...d.values()].reduce((s, h) => s + h, 0)).toBeCloseTo(10, 10);
  });
});

describe("capacidade", () => {
  it("jornada do dia × multiplicador", () => {
    expect(capacidadeHorasNoDia("2026-09-14", pessoa("u", { multiplicador: 0.5 }), cal)).toBe(4);
  });

  it("zero em feriado DO CALENDÁRIO, em ausência e em dia sem jornada", () => {
    expect(capacidadeHorasNoDia("2026-09-16", pessoa("u"), comFeriado)).toBe(0);
    expect(capacidadeHorasNoDia("2026-09-15", pessoa("u", { ausencias: new Set(["2026-09-15"]) }), cal)).toBe(0);
    expect(capacidadeHorasNoDia("2026-09-19", pessoa("u"), cal)).toBe(0);
  });

  it("quem trabalha sábado tem capacidade no sábado — o fim de semana vem da grade", () => {
    const comSabado = pessoa("u", { grade: [...gradeCheia, { diaSemana: 6, ativo: true, horasDia: 4 }] });
    expect(capacidadeHorasNoDia("2026-09-19", comSabado, cal)).toBe(4);
  });

  it("soma por semana ISO", () => {
    const c = capacidadePorSemana(diasEntre("2026-09-14", "2026-09-27"), pessoa("u"), comFeriado);
    expect(c.get("2026-W38")).toBe(32);
    expect(c.get("2026-W39")).toBe(40);
  });
});

describe("carga", () => {
  const linha = (extra: Partial<LinhaCarga> = {}): LinhaCarga => ({
    id: "l1",
    projetoId: "p1",
    tipoEap: "atv",
    ehResumo: false,
    duracaoDias: 10,
    status: "nin",
    inicio: "2026-09-14",
    fim: "2026-09-25",
    atribuicoes: [{ id: "a1", userId: "maria", papel: "pro", horas: 60 }],
    ...extra,
  });

  it("espalha a atribuição e parte em semanas", () => {
    const p = parcelasDasLinhas([linha()], cal);
    expect(p.map((x) => [x.semana, x.horas])).toEqual([
      ["2026-W38", 30],
      ["2026-W39", 30],
    ]);
    expect(p[0]).toMatchObject({ userId: "maria", linhaId: "l1", atribuicaoId: "a1", projetoId: "p1" });
  });

  it("perfil, zero hora, linha encerrada, marco e resumo não viram carga", () => {
    expect(
      parcelasDasLinhas(
        [
          linha({ atribuicoes: [{ id: "a", userId: null, papel: "pro", horas: 40 }] }),
          linha({ atribuicoes: [{ id: "a", userId: "maria", papel: "pro", horas: 0 }] }),
          linha({ status: "con" }),
          linha({ tipoEap: "mrc", duracaoDias: 0 }),
          linha({ ehResumo: true }),
        ],
        cal,
      ),
    ).toEqual([]);
  });

  it("todos os papéis entram na carga — o revisor aparece nas horas dele (D41)", () => {
    const p = parcelasDasLinhas(
      [
        linha({
          atribuicoes: [
            { id: "a1", userId: "maria", papel: "pro", horas: 40 },
            { id: "a2", userId: "joao", papel: "rev", horas: 4 },
          ],
        }),
      ],
      cal,
    );
    const total = somarCarga(p);
    expect((total.get("joao")?.get("2026-W38") ?? 0) + (total.get("joao")?.get("2026-W39") ?? 0)).toBeCloseTo(4);
  });

  it("alocação digitada vira hora: 50% de 8 h/dia é 20 h numa semana cheia", () => {
    const p = parcelasDaAlocacaoDigitada(
      { projetoId: "antigo", percentual: 50, inicio: null, fim: null },
      pessoa("maria"),
      diasEntre("2026-09-14", "2026-09-20"),
      cal,
    );
    expect(p).toEqual([
      { userId: "maria", semana: "2026-W38", projetoId: "antigo", linhaId: null, atribuicaoId: null, horas: 20 },
    ]);
  });

  it("alocação digitada respeita a faixa de vigência e a ausência", () => {
    const p = parcelasDaAlocacaoDigitada(
      { projetoId: "antigo", percentual: 100, inicio: "2026-09-16", fim: null },
      pessoa("maria", { ausencias: new Set(["2026-09-17"]) }),
      diasEntre("2026-09-14", "2026-09-20"),
      cal,
    );
    expect(p[0].horas).toBe(16); // 16 e 18; 17 é férias
  });
});

describe("detectarSobrecargas (D18)", () => {
  const cap = new Map([["maria", new Map([["2026-W38", 40]])]]);
  const pc = (horas: number, linhaId = "l1") => ({
    userId: "maria",
    semana: "2026-W38",
    projetoId: "p1",
    linhaId,
    atribuicaoId: `a-${linhaId}`,
    horas,
  });

  it("acusa quando a carga passa da capacidade, com o excesso e as parcelas da maior para a menor", () => {
    const s = detectarSobrecargas([pc(20, "a"), pc(28, "b")], cap, { semanas: ["2026-W38"] });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId: "maria", carga: 48, capacidade: 40, excesso: 8 });
    expect(s[0].parcelas.map((p) => p.linhaId)).toEqual(["b", "a"]);
  });

  it("dízima de espalhar hora não é sobrecarga", () => {
    expect(detectarSobrecargas([pc(40.01)], cap, { semanas: ["2026-W38"] })).toEqual([]);
  });

  it("semana fora da janela não é analisada", () => {
    expect(detectarSobrecargas([pc(80)], cap, { semanas: ["2026-W39"] })).toEqual([]);
  });

  it("capacidade zero com carga é sobrecarga, e o motivo da redução acompanha (D8)", () => {
    const s = detectarSobrecargas([{ ...pc(10), userId: "joao" }], cap, {
      semanas: ["2026-W38"],
      motivosReducao: new Map([["joao", new Map([["2026-W38", ["férias"]]])]]),
    });
    expect(s[0]).toMatchObject({ userId: "joao", capacidade: 0, excesso: 10, motivosReducao: ["férias"] });
  });
});
