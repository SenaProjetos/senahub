import { describe, expect, it } from "vitest";
import { linhasSemHistorico, progressoNaData, type RegistroProgresso } from "./progresso-historico";

let ordem = 0;
const reg = (
  tarefaId: string,
  anterior: number,
  progresso: number,
  emDia: string,
  dataStatus: string | null = null,
): RegistroProgresso => ({ tarefaId, anterior, progresso, emDia, emOrdem: ++ordem, dataStatus });

describe("progressoNaData", () => {
  it("vale o último registro até a data", () => {
    const r = [reg("a", 0, 20, "2026-09-10"), reg("a", 20, 60, "2026-09-18")];
    expect(progressoNaData(r, "2026-09-15", new Map([["a", 90]])).get("a")).toBe(20);
    expect(progressoNaData(r, "2026-09-20", new Map([["a", 90]])).get("a")).toBe(60);
  });

  it("no dia da mudança, o valor JÁ é o novo", () => {
    const r = [reg("a", 0, 40, "2026-09-18")];
    expect(progressoNaData(r, "2026-09-18", new Map([["a", 40]])).get("a")).toBe(40);
  });

  it("antes da primeira mudança vale o valor de ENTÃO, não o de depois", () => {
    const r = [reg("a", 0, 40, "2026-09-18")];
    expect(progressoNaData(r, "2026-09-10", new Map([["a", 40]])).get("a")).toBe(0);
  });

  it("antes da primeira mudança de uma linha que já vinha com avanço, vale o `anterior` dela", () => {
    // A linha estava em 30% quando o histórico começou; subiu para 70% no dia 20.
    const r = [reg("a", 30, 70, "2026-09-20")];
    expect(progressoNaData(r, "2026-09-05", new Map([["a", 70]])).get("a")).toBe(30);
  });

  it("linha sem registro nenhum fica com o % de hoje (o comportamento de antes do histórico)", () => {
    expect(progressoNaData([], "2026-09-15", new Map([["a", 55]])).get("a")).toBe(55);
  });

  it("duas mudanças no MESMO dia: vale a última", () => {
    const r = [reg("a", 0, 30, "2026-09-18"), reg("a", 30, 50, "2026-09-18")];
    expect(progressoNaData(r, "2026-09-18", new Map([["a", 50]])).get("a")).toBe(50);
  });

  it("ordem de entrada não importa", () => {
    const a = reg("a", 0, 30, "2026-09-10");
    const b = reg("a", 30, 80, "2026-09-12");
    expect(progressoNaData([b, a], "2026-09-11", new Map([["a", 80]])).get("a")).toBe(30);
  });

  it("cada linha responde por si", () => {
    const r = [reg("a", 0, 100, "2026-09-10"), reg("b", 0, 25, "2026-09-20")];
    const m = progressoNaData(r, "2026-09-15", new Map([["a", 100], ["b", 25], ["c", 10]]));
    expect([m.get("a"), m.get("b"), m.get("c")]).toEqual([100, 0, 10]);
  });

  it("o que foi digitado DEPOIS, mas com aquela Data de Status vigente, conta", () => {
    // Data de Status = sexta 18/09; a coordenação atualizou na segunda 21/09, referente a sexta.
    const r = [reg("a", 10, 70, "2026-09-21", "2026-09-18")];
    expect(progressoNaData(r, "2026-09-18", new Map([["a", 70]])).get("a")).toBe(70);
  });

  it("mas o que foi digitado depois com OUTRA Data de Status não contamina a data anterior", () => {
    const r = [reg("a", 10, 70, "2026-09-25", "2026-09-25")];
    expect(progressoNaData(r, "2026-09-18", new Map([["a", 70]])).get("a")).toBe(10);
  });

  it("digitado na vigência da data conta mesmo com uma mudança posterior fora dela", () => {
    const r = [
      reg("a", 0, 40, "2026-09-21", "2026-09-18"),
      reg("a", 40, 90, "2026-09-28", "2026-09-25"),
    ];
    expect(progressoNaData(r, "2026-09-18", new Map([["a", 90]])).get("a")).toBe(40);
    expect(progressoNaData(r, "2026-09-25", new Map([["a", 90]])).get("a")).toBe(90);
  });
});

describe("linhasSemHistorico", () => {
  it("acusa só linha com avanço e sem registro — zero é igual em qualquer data", () => {
    const r = [reg("a", 0, 40, "2026-09-10")];
    expect(linhasSemHistorico(r, new Map([["a", 40], ["b", 20], ["c", 0]]))).toEqual(["b"]);
  });
});
