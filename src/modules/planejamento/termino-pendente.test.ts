import { describe, expect, it } from "vitest";
import { terminosPendentes, type LinhaParaTermino, type PontoDaLinha } from "./termino-pendente";

const linha = (id: string, extra: Partial<LinhaParaTermino> = {}): LinhaParaTermino => ({
  id,
  parentId: null,
  nome: `Tarefa ${id}`,
  tipoEap: "atv",
  status: "and",
  inicioReal: null,
  fimReal: null,
  predecessoras: [],
  ...extra,
});
const fs = (predecessoraId: string, tipo = "fs") => [{ predecessoraId, tipo }];
const ponto = (entradas: Record<string, PontoDaLinha>) => new Map(Object.entries(entradas));

describe("terminosPendentes", () => {
  it("sucessora (término → início) começou pelo ponto: pede o término, sugere o último dia de ponto", () => {
    const r = terminosPendentes(
      [linha("A", { inicioReal: "2026-11-03" }), linha("B", { status: "nin", predecessoras: fs("A") })],
      ponto({ A: { primeiro: "2026-11-03", ultimo: "2026-11-12" }, B: { primeiro: "2026-11-13", ultimo: "2026-11-14" } }),
    );
    expect(r.get("A")).toEqual({ sucessoraId: "B", sucessoraNome: "Tarefa B", sucessoraDesde: "2026-11-13", sugestao: "2026-11-12" });
    expect(r.has("B")).toBe(false);
  });

  it("sucessora com início real digitado (sem ponto) também conta", () => {
    const r = terminosPendentes(
      [linha("A"), linha("B", { inicioReal: "2026-11-13", predecessoras: fs("A") })],
      ponto({ A: { primeiro: "2026-11-03", ultimo: "2026-11-12" } }),
    );
    expect(r.get("A")?.sucessoraDesde).toBe("2026-11-13");
  });

  it("sucessora que não começou: nada", () => {
    const r = terminosPendentes([linha("A"), linha("B", { status: "nin", predecessoras: fs("A") })], ponto({}));
    expect(r.size).toBe(0);
  });

  it.each(["ss", "ff", "sf"])("vínculo %s não diz que a tarefa terminou", (tipo) => {
    const r = terminosPendentes(
      [linha("A"), linha("B", { predecessoras: fs("A", tipo) })],
      ponto({ B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }),
    );
    expect(r.size).toBe(0);
  });

  it("tarefa com término real não pede de novo", () => {
    const r = terminosPendentes(
      [linha("A", { inicioReal: "2026-11-03", fimReal: "2026-11-12", status: "con" }), linha("B", { predecessoras: fs("A") })],
      ponto({ B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }),
    );
    expect(r.size).toBe(0);
  });

  it.each(["con", "blq", "sus", "can", "arq"])("tarefa %s fica de fora", (status) => {
    const r = terminosPendentes(
      [linha("A", { status }), linha("B", { predecessoras: fs("A") })],
      ponto({ B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }),
    );
    expect(r.size).toBe(0);
  });

  it("marco e agrupamento não são sinalizados", () => {
    const r = terminosPendentes(
      [
        linha("M", { tipoEap: "mrc" }),
        linha("G"),
        linha("G1", { parentId: "G" }),
        linha("B", { predecessoras: [...fs("M"), ...fs("G")] }),
      ],
      ponto({ B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }),
    );
    expect(r.size).toBe(0);
  });

  it("sucessora agrupamento começou quando qualquer tarefa de dentro começou", () => {
    const r = terminosPendentes(
      [linha("A"), linha("G", { predecessoras: fs("A") }), linha("G1", { parentId: "G" }), linha("G2", { parentId: "G" })],
      ponto({ G2: { primeiro: "2026-11-14", ultimo: "2026-11-14" } }),
    );
    expect(r.get("A")).toMatchObject({ sucessoraId: "G", sucessoraDesde: "2026-11-14", sugestao: null });
  });

  it("sem hora apontada na tarefa: amarelo sem sugestão", () => {
    const r = terminosPendentes([linha("A"), linha("B", { predecessoras: fs("A") })], ponto({ B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }));
    expect(r.get("A")?.sugestao).toBeNull();
  });

  it("último dia de ponto antes do início real digitado não é sugerido (o término real recusaria)", () => {
    const r = terminosPendentes(
      [linha("A", { inicioReal: "2026-11-10" }), linha("B", { predecessoras: fs("A") })],
      ponto({ A: { primeiro: "2026-11-03", ultimo: "2026-11-05" }, B: { primeiro: "2026-11-13", ultimo: "2026-11-13" } }),
    );
    expect(r.get("A")?.sugestao).toBeNull();
  });

  it("duas sucessoras começaram: vale a que começou primeiro, em qualquer ordem", () => {
    const linhas = [
      linha("A"),
      linha("B", { predecessoras: fs("A") }),
      linha("C", { predecessoras: fs("A") }),
    ];
    const p = ponto({ B: { primeiro: "2026-11-14", ultimo: "2026-11-14" }, C: { primeiro: "2026-11-12", ultimo: "2026-11-12" } });
    expect(terminosPendentes(linhas, p).get("A")?.sucessoraId).toBe("C");
    expect(terminosPendentes([...linhas].reverse(), p).get("A")?.sucessoraId).toBe("C");
  });

  it("ciclo na árvore (dado corrompido) não estoura", () => {
    const r = terminosPendentes(
      [linha("A"), linha("X", { parentId: "Y", predecessoras: fs("A") }), linha("Y", { parentId: "X" })],
      ponto({}),
    );
    expect(r.size).toBe(0);
  });
});
