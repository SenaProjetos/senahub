import { describe, expect, it } from "vitest";
import { criarCalendario, type Dia } from "@/lib/calendario-trabalho";
import { agendar, type LinhaEntrada } from "./motor";
import {
  capacidadePorSemana,
  detectarSobrecargas,
  diasEntre,
  parcelasDasLinhas,
  type LinhaCarga,
  type Papel,
  type StatusLinha,
} from "./recursos";
import { sugerirAtraso, sugerirTroca, type EntradaSugestoes } from "./sugestoes-recursos";

// Semanas: W38 = 14–18/09/2026, W39 = 21–25/09, W40 = 28/09–02/10, W41 = 05–09/10.
const cal = criarCalendario();
const ANCORA = "2026-09-14";
const SEMANAS = ["2026-W38", "2026-W39", "2026-W40", "2026-W41", "2026-W42", "2026-W43"];
const grade = [1, 2, 3, 4, 5].map((d) => ({ diaSemana: d, ativo: true, horasDia: 8 }));

type Atrib = { userId: string | null; horas: number; papel?: Papel };
type LinhaCenario = LinhaEntrada & { atrib?: Atrib[]; status?: StatusLinha; iniciada?: boolean };

/** Monta a entrada das sugestões a partir de um projeto só, com o motor de verdade. */
function cenario(linhas: LinhaCenario[], opcoes: { pessoas: string[]; qualificados?: string[] }): EntradaSugestoes {
  const motor = agendar(linhas, ANCORA, cal);
  const linhasCarga: LinhaCarga[] = linhas
    .filter((l) => (l.atrib?.length ?? 0) > 0)
    .map((l) => {
      const a = motor.linhas.get(l.id)!;
      return {
        id: l.id,
        projetoId: "p1",
        tipoEap: "atv",
        ehResumo: a.ehResumo,
        duracaoDias: l.duracaoDias,
        status: l.status ?? "nin",
        inicio: a.inicio,
        fim: a.fim,
        atribuicoes: (l.atrib ?? []).map((x, i) => ({ id: `${l.id}-${i}`, userId: x.userId, papel: x.papel ?? "pro", horas: x.horas })),
      };
    });
  const dias = diasEntre("2026-09-14", "2026-10-25");
  const capacidade = new Map(
    opcoes.pessoas.map((u) => [u, capacidadePorSemana(dias, { userId: u, multiplicador: 1, grade, ausencias: new Set<Dia>() }, cal)]),
  );
  return {
    projetos: new Map([
      [
        "p1",
        {
          projetoId: "p1",
          linhasMotor: linhas,
          inicioProjeto: ANCORA,
          fimProjeto: motor.fimProjeto,
          agendado: motor.linhas,
          linhasCarga,
          iniciadas: new Set(linhas.filter((l) => l.iniciada).map((l) => l.id)),
        },
      ],
    ]),
    parcelas: parcelasDasLinhas(linhasCarga, cal),
    capacidade,
    semanas: SEMANAS,
    cal,
    qualificados: () => opcoes.qualificados ?? [],
  };
}

const alvo = (e: EntradaSugestoes, userId: string, semana: string) => {
  const s = detectarSobrecargas(e.parcelas, e.capacidade, { semanas: e.semanas }).find(
    (x) => x.userId === userId && x.semana === semana,
  );
  if (!s) throw new Error(`cenário sem sobrecarga de ${userId} em ${semana}`);
  return s;
};

const linha = (id: string, duracaoDias: number, extra: Partial<LinhaCenario> = {}): LinhaCenario => ({
  id,
  parentId: null,
  duracaoDias,
  predecessoras: [],
  ...extra,
});
const fs = (predecessoraId: string) => ({ predecessoraId, tipo: "fs" as const, lagDias: 0 });

// A linha longa sem ninguém segura o término do projeto em 09/10: dá folga ao resto.
const longa = linha("longa", 20);

describe("sugerirAtraso", () => {
  it("empurra uma linha com folga para a semana seguinte e resolve a sobrecarga", () => {
    const e = cenario(
      [longa, linha("a", 5, { atrib: [{ userId: "maria", horas: 40 }] }), linha("b", 5, { atrib: [{ userId: "maria", horas: 40 }] })],
      { pessoas: ["maria"] },
    );
    const s = sugerirAtraso(alvo(e, "maria", "2026-W38"), e);
    expect(s).toMatchObject({ tipo: "atrasar", novoInicio: "2026-09-21", diasUteis: 5, resolve: true, criaRestricao: true });
  });

  it("recusa atrasar quando a sucessora, ao andar junto, estoura OUTRA pessoa numa semana livre", () => {
    // b → c (João). Atrasar b uma semana leva c para a W40, onde João já tem d: 80 h.
    // Só a folga de b diria que pode; a simulação com o motor é que pega.
    const linhas = [
      linha("x", 25), // segura o término: dá folga a b e c
      // A outra carga da Maria na W38, presa por restrição: não é candidata.
      linha("y", 5, { restricaoTipo: "iniciar_em", restricaoData: ANCORA, atrib: [{ userId: "maria", horas: 20 }] }),
      linha("b", 5, { atrib: [{ userId: "maria", horas: 40 }] }),
      linha("c", 5, { predecessoras: [fs("b")], atrib: [{ userId: "joao", horas: 40 }] }),
      linha("d", 5, { restricaoTipo: "iniciar_em", restricaoData: "2026-09-28", atrib: [{ userId: "joao", horas: 40 }] }),
    ];
    const e = cenario(linhas, { pessoas: ["maria", "joao"] });
    expect(sugerirAtraso(alvo(e, "maria", "2026-W38"), e)).toBeNull();

    // Controle: sem o d do João, a mesma sugestão passa.
    const semD = cenario(linhas.slice(0, 4), { pessoas: ["maria", "joao"] });
    expect(sugerirAtraso(alvo(semD, "maria", "2026-W38"), semD)).toMatchObject({ linhaId: "b", resolve: true });
  });

  it("não sugere o que atrasaria o término do projeto", () => {
    // Sem a linha longa, a e b SÃO o projeto: nenhuma tem folga.
    const e = cenario(
      [linha("a", 5, { atrib: [{ userId: "maria", horas: 40 }] }), linha("b", 5, { atrib: [{ userId: "maria", horas: 40 }] })],
      { pessoas: ["maria"] },
    );
    expect(sugerirAtraso(alvo(e, "maria", "2026-W38"), e)).toBeNull();
  });

  it("linha já iniciada, ou com outra restrição posta de propósito, não é candidata", () => {
    const iniciada = cenario(
      [longa, linha("a", 5, { iniciada: true, status: "and", atrib: [{ userId: "maria", horas: 80 }] })],
      { pessoas: ["maria"] },
    );
    expect(sugerirAtraso(alvo(iniciada, "maria", "2026-W38"), iniciada)).toBeNull();

    const presa = cenario(
      [longa, linha("a", 5, { restricaoTipo: "iniciar_em", restricaoData: ANCORA, atrib: [{ userId: "maria", horas: 80 }] })],
      { pessoas: ["maria"] },
    );
    expect(sugerirAtraso(alvo(presa, "maria", "2026-W38"), presa)).toBeNull();
  });

  it("linha que já tinha 'não iniciar antes de' só muda a data — não cria restrição nova", () => {
    const e = cenario(
      [
        longa,
        linha("a", 5, { atrib: [{ userId: "maria", horas: 40 }] }),
        linha("b", 5, { restricaoTipo: "iniciar_nao_antes_de", restricaoData: ANCORA, atrib: [{ userId: "maria", horas: 40 }] }),
      ],
      { pessoas: ["maria"] },
    );
    const s = sugerirAtraso(alvo(e, "maria", "2026-W38"), e);
    expect(s).not.toBeNull();
    if (s!.linhaId === "b") expect(s!.criaRestricao).toBe(false);
    else expect(s!.criaRestricao).toBe(true);
  });
});

describe("sugerirTroca", () => {
  const sobrecarregada = (extra: LinhaCenario[] = []) => [
    linha("a", 5, { atrib: [{ userId: "maria", horas: 40 }] }),
    linha("b", 5, { atrib: [{ userId: "maria", horas: 40 }] }),
    ...extra,
  ];

  it("passa a atribuição inteira para alguém qualificado e livre", () => {
    const e = cenario(sobrecarregada(), { pessoas: ["maria", "joao"], qualificados: ["joao"] });
    expect(sugerirTroca(alvo(e, "maria", "2026-W38"), e)).toMatchObject({
      tipo: "passar",
      deUserId: "maria",
      paraUserId: "joao",
      horas: 40,
      resolve: true,
    });
  });

  it("sem ninguém qualificado, não sugere — carga livre não é competência", () => {
    const e = cenario(sobrecarregada(), { pessoas: ["maria", "joao"], qualificados: [] });
    expect(sugerirTroca(alvo(e, "maria", "2026-W38"), e)).toBeNull();
  });

  it("não passa para quem ficaria sobrecarregado", () => {
    const e = cenario(sobrecarregada([linha("j", 5, { atrib: [{ userId: "joao", horas: 20 }] })]), {
      pessoas: ["maria", "joao"],
      qualificados: ["joao"],
    });
    expect(sugerirTroca(alvo(e, "maria", "2026-W38"), e)).toBeNull();
  });

  it("entre dois que servem, fica o mais folgado", () => {
    const e = cenario(sobrecarregada([linha("n", 5, { atrib: [{ userId: "ana", horas: 0.5 }] })]), {
      pessoas: ["maria", "joao", "ana"],
      qualificados: ["ana", "joao"],
    });
    expect(sugerirTroca(alvo(e, "maria", "2026-W38"), e)?.paraUserId).toBe("joao");
  });

  it("quem já está na linha no mesmo papel não é candidato", () => {
    const e = cenario(
      [
        linha("a", 5, { atrib: [{ userId: "maria", horas: 40 }, { userId: "joao", horas: 1 }] }),
        linha("b", 5, { atrib: [{ userId: "maria", horas: 40 }, { userId: "joao", horas: 1 }] }),
      ],
      { pessoas: ["maria", "joao"], qualificados: ["joao"] },
    );
    expect(sugerirTroca(alvo(e, "maria", "2026-W38"), e)).toBeNull();
  });
});
