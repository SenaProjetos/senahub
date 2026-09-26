import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import { agendar, type LinhaEntrada, type Vinculo } from "./motor";

const cal = criarCalendario();
const comFeriado = criarCalendario({ feriados: ["2026-10-12", "2026-11-02"] });

/** Atalho: linha-folha sem dependência. */
const folha = (id: string, duracaoDias: number, extra: Partial<LinhaEntrada> = {}): LinhaEntrada => ({
  id,
  parentId: null,
  duracaoDias,
  predecessoras: [],
  ...extra,
});

const dep = (predecessoraId: string, tipo: Vinculo["tipo"] = "fs", lagDias = 0): Vinculo => ({
  predecessoraId,
  tipo,
  lagDias,
});

const datas = (r: ReturnType<typeof agendar>, id: string) => {
  const l = r.linhas.get(id)!;
  return `${l.inicio}..${l.fim}`;
};

// 2026-09-14 é segunda-feira; é a âncora de quase todos os testes.
const ANCORA = "2026-09-14";

describe("o motor gera as datas a partir da duração", () => {
  it("linha sem predecessora começa na âncora do projeto", () => {
    const r = agendar([folha("a", 5)], ANCORA, cal);
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-18");
  });

  it("empurra a âncora para o dia útil quando ela cai em fim de semana", () => {
    const r = agendar([folha("a", 1)], "2026-09-12", cal); // sábado
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-14");
  });

  it("marco tem duração 0 e começa e termina no mesmo dia", () => {
    const r = agendar([folha("m", 0)], ANCORA, cal);
    expect(datas(r, "m")).toBe("2026-09-14..2026-09-14");
  });

  it("pula feriado do meio da tarefa", () => {
    // 5 dias a partir de 08/10 (quinta): 08,09, [12 feriado], 13,14,15.
    const r = agendar([folha("a", 5)], "2026-10-08", comFeriado);
    expect(datas(r, "a")).toBe("2026-10-08..2026-10-15");
  });
});

describe("os 4 tipos de vínculo", () => {
  const base = [folha("a", 5), folha("b", 3, { predecessoras: [] })];

  it("FS: sucessora começa no dia útil seguinte ao fim da predecessora", () => {
    const r = agendar([base[0], { ...base[1], predecessoras: [dep("a", "fs")] }], ANCORA, cal);
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-18");
    expect(datas(r, "b")).toBe("2026-09-21..2026-09-23"); // 19-20 é fim de semana
  });

  it("SS: sucessora começa junto com a predecessora", () => {
    const r = agendar([base[0], { ...base[1], predecessoras: [dep("a", "ss")] }], ANCORA, cal);
    expect(datas(r, "b")).toBe("2026-09-14..2026-09-16");
  });

  it("FF: sucessora TERMINA junto com a predecessora, e o início vem da duração", () => {
    const r = agendar([base[0], { ...base[1], predecessoras: [dep("a", "ff")] }], ANCORA, cal);
    // a termina 18/09; b tem 3 dias, então começa 16/09 para terminar junto.
    expect(datas(r, "b")).toBe("2026-09-16..2026-09-18");
  });

  it("SF: sucessora termina quando a predecessora começa", () => {
    // Âncora em 07/09 para o SF ter espaço: a âncora é PISO e ninguém começa antes dela.
    const a = { ...base[0], restricaoTipo: "iniciar_em" as const, restricaoData: "2026-09-14" };
    const r = agendar([a, { ...base[1], predecessoras: [dep("a", "sf")] }], "2026-09-07", cal);
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-18");
    // b (3 dias) termina em 14/09, quando a começa → começa em 10/09.
    expect(datas(r, "b")).toBe("2026-09-10..2026-09-14");
  });

  it("SF fica preso na âncora quando ela não deixa espaço", () => {
    // Mesmo caso, mas com a âncora colada: o piso vence e a tela mostra o aperto.
    const r = agendar([base[0], { ...base[1], predecessoras: [dep("a", "sf")] }], ANCORA, cal);
    expect(datas(r, "b")).toBe("2026-09-14..2026-09-16");
  });
});

describe("lag e lead", () => {
  it("FS + 2 dias úteis espera dois dias", () => {
    const r = agendar(
      [folha("a", 5), folha("b", 2, { predecessoras: [dep("a", "fs", 2)] })],
      ANCORA,
      cal,
    );
    // a termina sexta 18/09; FS seria 21/09; +2 dias úteis → 23/09.
    expect(datas(r, "b")).toBe("2026-09-23..2026-09-24");
  });

  it("SS - 2 dias antecipa (lead negativo)", () => {
    const r = agendar(
      [
        folha("a", 5, { restricaoTipo: "iniciar_em", restricaoData: "2026-09-14" }),
        folha("b", 2, { predecessoras: [dep("a", "ss", -2)] }),
      ],
      "2026-09-07", // âncora com folga: o lead precisa de espaço antes do início de `a`
      cal,
    );
    // a começa segunda 14/09; -2 dias úteis → quinta 10/09.
    expect(datas(r, "b")).toBe("2026-09-10..2026-09-11");
  });

  it("lead negativo não empurra o projeto para trás da âncora", () => {
    // A âncora é piso: o lead é absorvido em vez de o cronograma recuar sozinho por causa
    // de um número que alguém digitou.
    const r = agendar(
      [folha("a", 5), folha("b", 2, { predecessoras: [dep("a", "ss", -2)] })],
      ANCORA,
      cal,
    );
    expect(datas(r, "b")).toBe("2026-09-14..2026-09-15");
  });

  it("lag conta em dias ÚTEIS, não corridos", () => {
    const r = agendar(
      [folha("a", 1), folha("b", 1, { predecessoras: [dep("a", "fs", 3)] })],
      "2026-09-17", // quinta
      cal,
    );
    // a: 17/09. FS → 18/09 (sexta). +3 dias úteis: 21, 22, 23 → 23/09.
    expect(datas(r, "b")).toBe("2026-09-23..2026-09-23");
  });
});

describe("predecessora múltipla", () => {
  it("espera a mais tardia — o marco do EAP.pdf depende de 10 linhas", () => {
    const linhas: LinhaEntrada[] = [
      folha("curta", 2),
      folha("media", 5),
      folha("longa", 12),
      folha("marco", 0, {
        predecessoras: [dep("curta"), dep("media"), dep("longa")],
      }),
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(datas(r, "longa")).toBe("2026-09-14..2026-09-29");
    // O marco espera a MAIS TARDIA e cai no mesmo dia em que ela termina — é o
    // comportamento da linha 105 do EAP.pdf, que depende de 10 predecessoras e acontece
    // no dia em que a última delas fecha.
    expect(datas(r, "marco")).toBe("2026-09-29..2026-09-29");
  });

  it("tarefa real depois da mais tardia começa no dia seguinte, não no mesmo dia", () => {
    const linhas: LinhaEntrada[] = [
      folha("curta", 2),
      folha("longa", 12),
      folha("tarefa", 1, { predecessoras: [dep("curta"), dep("longa")] }),
    ];
    const r = agendar(linhas, ANCORA, cal);
    // longa fecha 29/09 (terça) → tarefa de 1 dia começa 30/09.
    expect(datas(r, "tarefa")).toBe("2026-09-30..2026-09-30");
  });
});

describe("restrições de data", () => {
  it("iniciar_nao_antes_de segura a linha, mesmo sem predecessora", () => {
    const r = agendar(
      [folha("a", 3, { restricaoTipo: "iniciar_nao_antes_de", restricaoData: "2026-09-21" })],
      ANCORA,
      cal,
    );
    expect(datas(r, "a")).toBe("2026-09-21..2026-09-23");
  });

  it("iniciar_nao_antes_de no passado não puxa a linha para trás", () => {
    const r = agendar(
      [folha("a", 3, { restricaoTipo: "iniciar_nao_antes_de", restricaoData: "2026-09-01" })],
      ANCORA,
      cal,
    );
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-16");
  });

  it("terminar_nao_depois_de PUXA a linha para trás e acusa conflito com a dependência", () => {
    const r = agendar(
      [
        folha("a", 5),
        folha("b", 3, {
          predecessoras: [dep("a", "fs")],
          restricaoTipo: "terminar_nao_depois_de",
          restricaoData: "2026-09-18",
        }),
      ],
      ANCORA,
      cal,
    );
    // Pela dependência b começaria 21/09; a restrição a força a terminar até 18/09.
    expect(datas(r, "b")).toBe("2026-09-16..2026-09-18");
    // E isso é um CONFLITO visível, não um ajuste silencioso.
    expect(r.linhas.get("b")!.conflitoRestricao).toBe(true);
    expect(r.linhas.get("a")!.conflitoRestricao).toBe(false);
  });

  it("iniciar_em fixa a data (é o alfinete da tela)", () => {
    const r = agendar(
      [
        folha("a", 5),
        folha("b", 2, {
          predecessoras: [dep("a", "fs")],
          restricaoTipo: "iniciar_em",
          restricaoData: "2026-09-28",
        }),
      ],
      ANCORA,
      cal,
    );
    expect(datas(r, "b")).toBe("2026-09-28..2026-09-29");
  });
});

describe("linha-resumo", () => {
  it("deriva início do menor filho e fim do maior — nunca tem data própria", () => {
    const linhas: LinhaEntrada[] = [
      { id: "pai", parentId: null, duracaoDias: 99, predecessoras: [] },
      { id: "f1", parentId: "pai", duracaoDias: 3, predecessoras: [] },
      { id: "f2", parentId: "pai", duracaoDias: 8, predecessoras: [] },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(datas(r, "f1")).toBe("2026-09-14..2026-09-16");
    expect(datas(r, "f2")).toBe("2026-09-14..2026-09-23");
    // A duração 99 do pai é IGNORADA: ele vale o que os filhos valem.
    expect(datas(r, "pai")).toBe("2026-09-14..2026-09-23");
    expect(r.linhas.get("pai")!.ehResumo).toBe(true);
  });

  it("consolida resumo dentro de resumo, de baixo para cima", () => {
    const linhas: LinhaEntrada[] = [
      { id: "avo", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "pai", parentId: "avo", duracaoDias: 1, predecessoras: [] },
      { id: "neto", parentId: "pai", duracaoDias: 10, predecessoras: [] },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(datas(r, "neto")).toBe("2026-09-14..2026-09-25");
    expect(datas(r, "pai")).toBe("2026-09-14..2026-09-25");
    expect(datas(r, "avo")).toBe("2026-09-14..2026-09-25");
  });
});

describe("folga e caminho crítico", () => {
  it("cadeia única é toda crítica", () => {
    const r = agendar(
      [folha("a", 3), folha("b", 3, { predecessoras: [dep("a")] })],
      ANCORA,
      cal,
    );
    expect(r.criticas).toEqual(new Set(["a", "b"]));
    expect(r.linhas.get("a")!.folgaTotal).toBe(0);
  });

  it("o ramo mais curto ganha folga e sai do caminho crítico", () => {
    // longa (10d) e curta (2d) alimentam o mesmo marco final.
    const linhas: LinhaEntrada[] = [
      folha("longa", 10),
      folha("curta", 2),
      folha("fim", 1, { predecessoras: [dep("longa"), dep("curta")] }),
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.criticas.has("longa")).toBe(true);
    expect(r.criticas.has("fim")).toBe(true);
    expect(r.criticas.has("curta")).toBe(false);
    expect(r.linhas.get("curta")!.folgaTotal).toBe(8);
  });

  it("folga livre é menor ou igual à total", () => {
    const linhas: LinhaEntrada[] = [
      folha("a", 2),
      folha("b", 10),
      folha("fim", 1, { predecessoras: [dep("a"), dep("b")] }),
    ];
    const r = agendar(linhas, ANCORA, cal);
    const a = r.linhas.get("a")!;
    expect(a.folgaLivre).toBeLessThanOrEqual(a.folgaTotal);
  });

  it("o fim do projeto é o maior fim entre as linhas", () => {
    const r = agendar([folha("a", 3), folha("b", 12)], ANCORA, cal);
    expect(r.fimProjeto).toBe("2026-09-29");
  });
});

describe("dados inconsistentes não derrubam o motor", () => {
  it("ciclo é reportado e a aresta de volta descartada, sem laço infinito", () => {
    const linhas: LinhaEntrada[] = [
      folha("a", 2, { predecessoras: [dep("b")] }),
      folha("b", 2, { predecessoras: [dep("a")] }),
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.ciclosIgnorados.length).toBeGreaterThan(0);
    expect(r.linhas.size).toBe(2);
  });

  it("predecessora fora do conjunto é ignorada em silêncio", () => {
    const r = agendar([folha("a", 2, { predecessoras: [dep("fantasma")] })], ANCORA, cal);
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-15");
  });

  it("lista vazia devolve resultado vazio, não erro", () => {
    const r = agendar([], ANCORA, cal);
    expect(r.linhas.size).toBe(0);
    expect(r.fimProjeto).toBeNull();
  });
});

describe("progresso", () => {
  it("folha usa o informado", () => {
    const r = agendar([folha("a", 5, { progresso: 40 })], ANCORA, cal);
    expect(r.linhas.get("a")!.progresso).toBe(40);
  });

  it("resumo pondera por HORAS previstas, não por duração", () => {
    // O caso que motivou a decisão: "aprovação na prefeitura" leva 45 dias e custa 2h.
    // Por duração ela dominaria o percentual; por horas ela quase não pesa.
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "modelagem", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: 40, progresso: 100 },
      { id: "prefeitura", parentId: "disc", duracaoDias: 45, predecessoras: [], trabalhoHoras: 2, progresso: 0 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    // Por horas: 40*100 / 42 = 95%. Por duração seria 5*100/50 = 10%.
    expect(r.linhas.get("disc")!.progresso).toBe(95);
  });

  it("sem horas em nenhum filho, cai para duração — o padrão do MS Project", () => {
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "f1", parentId: "disc", duracaoDias: 5, predecessoras: [], progresso: 100 },
      { id: "f2", parentId: "disc", duracaoDias: 5, predecessoras: [], progresso: 0 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.linhas.get("disc")!.progresso).toBe(50);
  });

  it("um filho SEM estimativa derruba o peso por horas para duração — não some da conta", () => {
    // A regra antiga ("algum filho tem horas") daria peso ZERO ao f2: o resumo mostraria
    // 100% com metade do trabalho por fazer. É o caso da linha herdada da disciplina, que
    // nasce sem hora estimada.
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "f1", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: 40, progresso: 100 },
      { id: "f2", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: null, progresso: 0 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.linhas.get("disc")!.progresso).toBe(50);
    expect(r.linhas.get("disc")!.trabalhoHoras).toBeNull();
  });

  it("zero CONHECIDO (etapa de terceiro) mantém o peso por horas e pesa zero", () => {
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "modelagem", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: 40, progresso: 50 },
      { id: "prefeitura", parentId: "disc", duracaoDias: 45, predecessoras: [], trabalhoHoras: 0, progresso: 0 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    // Por horas: só a modelagem pesa. Por duração daria 5*50/50 = 5%.
    expect(r.linhas.get("disc")!.progresso).toBe(50);
    expect(r.linhas.get("disc")!.trabalhoHoras).toBe(40);
  });

  it("tudo estimado em zero cai para duração — não há horas para ponderar", () => {
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "f1", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: 0, progresso: 100 },
      { id: "f2", parentId: "disc", duracaoDias: 15, predecessoras: [], trabalhoHoras: 0, progresso: 0 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.linhas.get("disc")!.progresso).toBe(25);
  });

  it("marco não conta como filho sem estimativa", () => {
    const linhas: LinhaEntrada[] = [
      { id: "disc", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "modelagem", parentId: "disc", duracaoDias: 5, predecessoras: [], trabalhoHoras: 30, progresso: 100 },
      { id: "revisao", parentId: "disc", duracaoDias: 2, predecessoras: [], trabalhoHoras: 10, progresso: 0 },
      { id: "entrega", parentId: "disc", duracaoDias: 0, predecessoras: [] },
    ];
    const r = agendar(linhas, ANCORA, cal);
    // Por horas: 30*100/40 = 75%. Se o marco derrubasse para duração: 5*100/7 = 71%.
    expect(r.linhas.get("disc")!.progresso).toBe(75);
    expect(r.linhas.get("entrega")!.trabalhoHoras).toBe(0);
  });

  it("horas sobem pela árvore; um neto sem estimativa deixa o avô sem total", () => {
    const linhas: LinhaEntrada[] = [
      { id: "prj", parentId: null, duracaoDias: 1, predecessoras: [] },
      { id: "ele", parentId: "prj", duracaoDias: 1, predecessoras: [] },
      { id: "ele-mod", parentId: "ele", duracaoDias: 5, predecessoras: [], trabalhoHoras: 40 },
      { id: "ele-rev", parentId: "ele", duracaoDias: 2, predecessoras: [], trabalhoHoras: 8 },
      { id: "hid", parentId: "prj", duracaoDias: 1, predecessoras: [] },
      { id: "hid-mod", parentId: "hid", duracaoDias: 5, predecessoras: [] },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.linhas.get("ele")!.trabalhoHoras).toBe(48);
    expect(r.linhas.get("hid")!.trabalhoHoras).toBeNull();
    expect(r.linhas.get("prj")!.trabalhoHoras).toBeNull();
  });

  it("progresso do resumo é calculado, nunca o que foi digitado nele", () => {
    const linhas: LinhaEntrada[] = [
      { id: "pai", parentId: null, duracaoDias: 1, predecessoras: [], progresso: 90 },
      { id: "filho", parentId: "pai", duracaoDias: 5, predecessoras: [], progresso: 20 },
    ];
    const r = agendar(linhas, ANCORA, cal);
    expect(r.linhas.get("pai")!.progresso).toBe(20);
  });
});

// ─────────────────────────────────────────────────────────────
// Caso-âncora: trecho real do EAP.pdf do escritório
// ─────────────────────────────────────────────────────────────
//
// IMPORTANTE — roda SEM FERIADOS, de propósito. O arquivo original foi feito no MS Project
// com o calendário Padrão, que não tem feriado brasileiro nenhum. Prova disso, dentro do
// próprio PDF:
//   linha 25  "Revisão interna, 3 dias, Qui 08/10 → Seg 12/10"  — 12/10 é N. Sra. Aparecida
//   linha 106 "Consolidação, 2 dias, Sex 30/10 → Seg 02/11"     — 02/11 é Finados
// Com feriados carregados as duas terminariam um dia depois. Comparar contra o arquivo
// exige reproduzir a mesma premissa; em produção o calendário TERÁ feriados, e é por isso
// que o cronograma real vai esticar em relação ao que o escritório planejava.
describe("caso-âncora: EAP.pdf (calendário sem feriados, como o arquivo original)", () => {
  // Trecho ESTRUTURAL do Projeto Básico, linhas 19-26 do PDF.
  const estrutural: LinhaEntrada[] = [
    folha("19_analise_arq", 1), // Qua 09/09 → Qua 09/09
    folha("20_def_sistema", 1), // Qua 09/09 → Qua 09/09
    folha("21_estudo_prelim", 4, { predecessoras: [dep("20_def_sistema")] }), // Qui 10/09 → Ter 15/09
    folha("22_validacao", 1, { predecessoras: [dep("21_estudo_prelim")] }), // Qua 16/09
    folha("23_modelagem", 13, { predecessoras: [dep("22_validacao")] }), // Qui 17/09 → Seg 05/10
    folha("24_documentacao", 2, { predecessoras: [dep("23_modelagem")] }), // Ter 06/10 → Qua 07/10
    folha("25_revisao", 3, { predecessoras: [dep("24_documentacao")] }), // Qui 08/10 → Seg 12/10
    folha("26_liberada", 0, { predecessoras: [dep("25_revisao")] }), // Seg 12/10
  ];

  const r = agendar(estrutural, "2026-09-09", cal);

  it("reproduz cada data do arquivo", () => {
    expect(datas(r, "19_analise_arq")).toBe("2026-09-09..2026-09-09");
    expect(datas(r, "20_def_sistema")).toBe("2026-09-09..2026-09-09");
    expect(datas(r, "21_estudo_prelim")).toBe("2026-09-10..2026-09-15");
    expect(datas(r, "22_validacao")).toBe("2026-09-16..2026-09-16");
    expect(datas(r, "23_modelagem")).toBe("2026-09-17..2026-10-05");
    expect(datas(r, "24_documentacao")).toBe("2026-10-06..2026-10-07");
    expect(datas(r, "25_revisao")).toBe("2026-10-08..2026-10-12");
    expect(datas(r, "26_liberada")).toBe("2026-10-12..2026-10-12");
  });

  it("o marco de liberação fecha em 12/10, como no arquivo", () => {
    expect(r.fimProjeto).toBe("2026-10-12");
  });

  it("a cadeia principal é crítica e a linha solta tem folga", () => {
    expect(r.criticas.has("23_modelagem")).toBe(true);
    expect(r.criticas.has("25_revisao")).toBe(true);
    // "Análise da arquitetura" não alimenta ninguém: é a folga do trecho.
    expect(r.criticas.has("19_analise_arq")).toBe(false);
  });

  it("COM feriados o mesmo trecho estica — é a correção que o motor traz", () => {
    const comFeriadoReal = criarCalendario({ feriados: ["2026-10-12"] });
    const rf = agendar(estrutural, "2026-09-09", comFeriadoReal);
    // 12/10 deixa de ser dia útil: a revisão termina 13/10 e o marco anda junto.
    expect(datas(rf, "25_revisao")).toBe("2026-10-08..2026-10-13");
    expect(rf.fimProjeto).toBe("2026-10-13");
  });
});
