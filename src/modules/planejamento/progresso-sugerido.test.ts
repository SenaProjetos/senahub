import { describe, expect, it } from "vitest";
import { contextoDeArquivos, rotuloHoras, sugerirProgresso } from "./progresso-sugerido";

describe("sugerirProgresso (F6.3)", () => {
  it("checklist vira a razão feitos/total, arredondada", () => {
    const [s] = sugerirProgresso({ checklist: { feitos: 3, total: 5 }, progressoDoStatusDaDisciplina: null });
    expect(s).toEqual({ origem: "checklist", valor: 60, motivo: "3 de 5 itens do checklist da tarefa" });
    expect(sugerirProgresso({ checklist: { feitos: 1, total: 3 }, progressoDoStatusDaDisciplina: null })[0].valor).toBe(33);
  });

  it("checklist sem item não é 0% — é ausência de informação", () => {
    expect(sugerirProgresso({ checklist: { feitos: 0, total: 0 }, progressoDoStatusDaDisciplina: null })).toEqual([]);
  });

  it("um item só usa o singular", () => {
    expect(sugerirProgresso({ checklist: { feitos: 1, total: 1 }, progressoDoStatusDaDisciplina: null })[0].motivo).toBe(
      "1 de 1 item do checklist da tarefa",
    );
  });

  it("status da disciplina entra como sugestão própria, depois do checklist", () => {
    const r = sugerirProgresso({ checklist: { feitos: 2, total: 4 }, progressoDoStatusDaDisciplina: 60 });
    expect(r.map((s) => [s.origem, s.valor])).toEqual([
      ["checklist", 50],
      ["status_disciplina", 60],
    ]);
  });

  it("sem card e sem disciplina não há o que sugerir", () => {
    expect(sugerirProgresso({ checklist: null, progressoDoStatusDaDisciplina: null })).toEqual([]);
  });

  it("nunca sai do intervalo 0–100", () => {
    expect(sugerirProgresso({ checklist: null, progressoDoStatusDaDisciplina: 140 })[0].valor).toBe(100);
    expect(sugerirProgresso({ checklist: null, progressoDoStatusDaDisciplina: -5 })[0].valor).toBe(0);
  });

  it("horas apontadas NÃO viram porcentagem — consumo não é avanço", () => {
    // Não há como passar horas: a assinatura não aceita. O teste fixa que ninguém "conserta" isso.
    const r = sugerirProgresso({ checklist: null, progressoDoStatusDaDisciplina: null });
    expect(r.every((s) => s.origem === "checklist" || s.origem === "status_disciplina")).toBe(true);
  });
});

describe("contexto e rótulos", () => {
  it("arquivo enviado é só contexto (em documentos), e diz que não é entrega", () => {
    expect(contextoDeArquivos(0)).toBeNull();
    expect(contextoDeArquivos(1)).toBe("1 documento enviado na disciplina — envio não é entrega aprovada.");
    expect(contextoDeArquivos(4)).toBe("4 documentos enviados na disciplina — envio não é entrega aprovada.");
  });

  it("horas em pt-BR com uma casa", () => {
    expect(rotuloHoras(12.5)).toBe("12,5 h");
    expect(rotuloHoras(40)).toBe("40 h");
    expect(rotuloHoras(0.04)).toBe("0 h");
  });
});
