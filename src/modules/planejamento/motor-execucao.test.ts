import { describe, expect, it } from "vitest";
import { criarCalendario } from "@/lib/calendario-trabalho";
import { agendar, type LinhaEntrada, type Vinculo } from "./motor";

/**
 * L1 (D6): datas reais e Data de Status no motor — o "Atualizar projeto → Reprogramar trabalho não
 * concluído para iniciar após" do MS Project.
 */

const cal = criarCalendario();
const comFeriado = criarCalendario({ feriados: ["2026-10-12"] });

const folha = (id: string, duracaoDias: number, extra: Partial<LinhaEntrada> = {}): LinhaEntrada => ({
  id,
  parentId: null,
  duracaoDias,
  predecessoras: [],
  ...extra,
});
const dep = (predecessoraId: string, tipo: Vinculo["tipo"] = "fs", lagDias = 0): Vinculo => ({ predecessoraId, tipo, lagDias });
const datas = (r: ReturnType<typeof agendar>, id: string) => {
  const l = r.linhas.get(id)!;
  return `${l.inicio}..${l.fim}`;
};

// 2026-09-14 é segunda-feira.
const ANCORA = "2026-09-14";

describe("datas reais mandam na linha e empurram as sucessoras (D6)", () => {
  it("concluída que atrasou empurra a sucessora", () => {
    // Planejado 14..18; terminou de verdade na terça, 22.
    const r = agendar(
      [folha("a", 5, { inicioReal: "2026-09-14", fimReal: "2026-09-22" }), folha("b", 3, { predecessoras: [dep("a")] })],
      ANCORA,
      cal,
    );
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-22");
    expect(datas(r, "b")).toBe("2026-09-23..2026-09-25");
    expect(r.linhas.get("a")!.duracaoDias).toBe(7); // duração REAL, em dias úteis
    expect(r.linhas.get("a")!.situacao).toBe("concluida");
  });

  it("concluída antes do plano puxa a sucessora para trás", () => {
    const r = agendar(
      [folha("a", 5, { inicioReal: "2026-09-14", fimReal: "2026-09-16" }), folha("b", 3, { predecessoras: [dep("a")] })],
      ANCORA,
      cal,
    );
    expect(datas(r, "b")).toBe("2026-09-17..2026-09-21");
  });

  it("início real atropela a dependência — a realidade já aconteceu, sem conflito", () => {
    const r = agendar(
      [folha("a", 5), folha("b", 3, { predecessoras: [dep("a")], inicioReal: "2026-09-16", progresso: 10 })],
      ANCORA,
      cal,
    );
    expect(datas(r, "b")).toBe("2026-09-16..2026-09-18");
    expect(r.linhas.get("b")!.conflitoRestricao).toBe(false);
    expect(r.linhas.get("b")!.situacao).toBe("em_andamento");
  });

  it("em andamento sem Data de Status: a duração conta do início real", () => {
    const r = agendar([folha("a", 10, { inicioReal: "2026-09-15", progresso: 30 })], ANCORA, cal);
    expect(datas(r, "a")).toBe("2026-09-15..2026-09-28");
    expect(r.linhas.get("a")!.reprogramada).toBe(false);
  });

  it("resumo consolida as datas reais das filhas", () => {
    const r = agendar(
      [
        { id: "g", parentId: null, duracaoDias: 1, predecessoras: [] },
        folha("a", 5, { parentId: "g", inicioReal: "2026-09-11", fimReal: "2026-09-18" }),
        folha("b", 2, { parentId: "g", predecessoras: [dep("a")] }),
      ],
      ANCORA,
      cal,
    );
    expect(datas(r, "g")).toBe("2026-09-11..2026-09-22");
  });
});

describe("Data de Status: o trabalho não feito vai para depois dela", () => {
  it("em andamento: a parte feita fica, o restante começa depois da Data de Status", () => {
    // 10 dias, começou 15/09, 30% = 3 dias feitos (15, 16, 17). Status 24/09 (quinta): os 7 restantes
    // começam na sexta 25 → 25, 28, 29, 30, 01, 02, 05.
    const r = agendar(
      [folha("a", 10, { inicioReal: "2026-09-15", progresso: 30 }), folha("b", 2, { predecessoras: [dep("a")] })],
      ANCORA,
      cal,
      { dataStatus: "2026-09-24" },
    );
    expect(datas(r, "a")).toBe("2026-09-15..2026-10-05");
    expect(r.linhas.get("a")!.reprogramada).toBe(true);
    expect(datas(r, "b")).toBe("2026-10-06..2026-10-07");
  });

  it("em andamento adiantado não é puxado para trás nem encurtado", () => {
    // 10 dias desde 14/09 com 80%: a parte feita vai até 23/09, depois da Data de Status (16/09).
    const r = agendar([folha("a", 10, { inicioReal: "2026-09-14", progresso: 80 })], ANCORA, cal, { dataStatus: "2026-09-16" });
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-25");
    expect(r.linhas.get("a")!.reprogramada).toBe(false);
  });

  it("não iniciada que devia ter começado anda para o dia útil seguinte à Data de Status", () => {
    const r = agendar([folha("a", 5)], ANCORA, cal, { dataStatus: "2026-09-16" });
    expect(datas(r, "a")).toBe("2026-09-17..2026-09-23");
    expect(r.linhas.get("a")!.reprogramada).toBe(true);
    expect(r.linhas.get("a")!.situacao).toBe("nao_iniciada");
  });

  it("Data de Status num sábado: o restante começa na segunda, não na terça", () => {
    const r = agendar([folha("a", 2)], ANCORA, cal, { dataStatus: "2026-09-19" });
    expect(datas(r, "a")).toBe("2026-09-21..2026-09-22");
  });

  it("dia seguinte à Data de Status é feriado: pula para o útil depois dele", () => {
    // Status sexta 09/10; segunda 12/10 é feriado → terça 13.
    const r = agendar([folha("a", 3)], "2026-10-05", comFeriado, { dataStatus: "2026-10-09" });
    expect(datas(r, "a")).toBe("2026-10-13..2026-10-15");
  });

  it("o que está depois da Data de Status não se mexe", () => {
    const r = agendar([folha("a", 5)], "2026-09-28", cal, { dataStatus: "2026-09-16" });
    expect(datas(r, "a")).toBe("2026-09-28..2026-10-02");
    expect(r.linhas.get("a")!.reprogramada).toBe(false);
  });

  it("marco não concluído vai para depois da Data de Status; concluído fica na data real", () => {
    const r = agendar(
      [folha("m1", 0), folha("m2", 0, { inicioReal: "2026-09-15", fimReal: "2026-09-15" })],
      ANCORA,
      cal,
      { dataStatus: "2026-09-17" },
    );
    expect(datas(r, "m1")).toBe("2026-09-18..2026-09-18");
    expect(datas(r, "m2")).toBe("2026-09-15..2026-09-15");
    expect(r.linhas.get("m2")!.duracaoDias).toBe(0);
  });

  it("empurrar além de uma restrição rígida acusa conflito; a não rígida só segura", () => {
    const r = agendar(
      [
        folha("rigida", 2, { restricaoTipo: "iniciar_em", restricaoData: "2026-09-15" }),
        folha("piso", 2, { restricaoTipo: "iniciar_nao_antes_de", restricaoData: "2026-09-15" }),
      ],
      ANCORA,
      cal,
      { dataStatus: "2026-09-17" },
    );
    expect(datas(r, "rigida")).toBe("2026-09-18..2026-09-21");
    expect(r.linhas.get("rigida")!.conflitoRestricao).toBe(true);
    expect(datas(r, "piso")).toBe("2026-09-18..2026-09-21");
    expect(r.linhas.get("piso")!.conflitoRestricao).toBe(false);
  });

  it("sem Data de Status nada é reprogramado — a linha não iniciada fica onde o plano a pôs", () => {
    const r = agendar([folha("a", 5)], ANCORA, cal);
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-18");
  });
});

describe("percentual sem data real: a regra do MS Project", () => {
  it("% > 0 sem início real conta como iniciada no início calculado", () => {
    // 10 dias, 50% = 5 feitos (14..18); os 5 restantes já estão depois do status (18) → 21..25.
    const r = agendar([folha("a", 10, { progresso: 50 })], ANCORA, cal, { dataStatus: "2026-09-18" });
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-25");
    expect(r.linhas.get("a")!.situacao).toBe("em_andamento");
  });

  it("% > 0 em linha que só começa depois da Data de Status continua no futuro", () => {
    const r = agendar(
      [folha("a", 5, { progresso: 20, restricaoTipo: "iniciar_nao_antes_de", restricaoData: "2026-09-28" })],
      ANCORA,
      cal,
      { dataStatus: "2026-09-16" },
    );
    expect(datas(r, "a")).toBe("2026-09-28..2026-10-02");
  });

  it("100% sem término real conta como concluída nas datas calculadas — não anda", () => {
    const r = agendar(
      [folha("a", 5, { progresso: 100 }), folha("b", 2, { predecessoras: [dep("a")] })],
      ANCORA,
      cal,
      { dataStatus: "2026-09-30" },
    );
    expect(datas(r, "a")).toBe("2026-09-14..2026-09-18");
    expect(r.linhas.get("a")!.situacao).toBe("concluida");
    // A sucessora não começou e devia: vai para depois do status.
    expect(datas(r, "b")).toBe("2026-10-01..2026-10-02");
  });
});

describe("folga e caminho crítico com o realizado", () => {
  it("linha concluída nunca é crítica", () => {
    const r = agendar([folha("a", 5, { inicioReal: "2026-09-14", fimReal: "2026-09-18" }), folha("b", 3, { predecessoras: [dep("a")] })], ANCORA, cal);
    expect(r.linhas.get("a")!.critica).toBe(false);
    expect(r.linhas.get("b")!.critica).toBe(true);
    expect(r.criticas.has("a")).toBe(false);
  });

  it("vínculo com sucessora que já começou não prende a predecessora no passe de volta", () => {
    // b começou de verdade em 14/09 mesmo dependendo de a: a não tem mais o que empurrar.
    const r = agendar(
      [folha("a", 2), folha("b", 10, { predecessoras: [dep("a")], inicioReal: "2026-09-14", progresso: 10 })],
      ANCORA,
      cal,
    );
    expect(datas(r, "b")).toBe("2026-09-14..2026-09-25");
    expect(r.linhas.get("a")!.folgaTotal).toBe(8);
    expect(r.linhas.get("a")!.critica).toBe(false);
    expect(r.linhas.get("b")!.critica).toBe(true);
  });
});
