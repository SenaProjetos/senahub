import { describe, expect, it } from "vitest";
import { motivoDaBaseline, rotuloBaseline, rotuloDaOpcao, tarefasComBaseline } from "./baselines";

describe("rótulos", () => {
  it("BL com dois dígitos", () => {
    expect(rotuloBaseline(0)).toBe("BL-00");
    expect(rotuloBaseline(7)).toBe("BL-07");
    expect(rotuloBaseline(12)).toBe("BL-12");
  });

  it("motivo: o escrito (sem o ponto final), ou o que se sabe", () => {
    expect(motivoDaBaseline({ numero: 0, motivo: "Aprovação do cronograma." })).toBe("Aprovação do cronograma");
    expect(motivoDaBaseline({ numero: 0, motivo: null })).toBe("Aprovação do cronograma");
    expect(motivoDaBaseline({ numero: 2, motivo: "  Aditivo do contrato  " })).toBe("Aditivo do contrato");
    expect(motivoDaBaseline({ numero: 2, motivo: "   " })).toBe("Sem motivo registrado");
  });

  it("opção do seletor marca a atual", () => {
    expect(rotuloDaOpcao({ numero: 1, motivo: "Atraso do cliente" }, true)).toBe("BL-01 · Atraso do cliente (atual)");
    expect(rotuloDaOpcao({ numero: 0, motivo: null }, false)).toBe("BL-00 · Aprovação do cronograma");
  });
});

describe("tarefasComBaseline", () => {
  const tarefas = [
    { id: "a", nome: "A", inicioBaseline: "2026-10-05", fimBaseline: "2026-10-09" },
    { id: "b", nome: "B", inicioBaseline: "2026-10-12", fimBaseline: "2026-10-16" },
    { id: "nova", nome: "Nasceu depois", inicioBaseline: "2026-10-19", fimBaseline: "2026-10-20" },
  ];
  const datas = { 0: { a: ["2026-10-01", "2026-10-07"] as [string, string], b: ["2026-10-08", "2026-10-14"] as [string, string] } };

  it("sem escolha, ou com a versão atual (que não vem em `datas`), devolve como veio", () => {
    expect(tarefasComBaseline(tarefas, null, datas)).toEqual(tarefas);
    expect(tarefasComBaseline(tarefas, 3, datas)).toEqual(tarefas);
  });

  it("uma versão anterior troca só as datas de base — o resto da tarefa fica", () => {
    const r = tarefasComBaseline(tarefas, 0, datas);
    expect(r[0]).toEqual({ id: "a", nome: "A", inicioBaseline: "2026-10-01", fimBaseline: "2026-10-07" });
    expect(r[1].inicioBaseline).toBe("2026-10-08");
  });

  it("linha que não existia naquela versão fica sem base, não com a de hoje", () => {
    const r = tarefasComBaseline(tarefas, 0, datas);
    expect(r[2]).toMatchObject({ id: "nova", inicioBaseline: null, fimBaseline: null });
  });

  it("não altera a lista de entrada", () => {
    const copia = JSON.parse(JSON.stringify(tarefas));
    tarefasComBaseline(tarefas, 0, datas);
    expect(tarefas).toEqual(copia);
  });
});
