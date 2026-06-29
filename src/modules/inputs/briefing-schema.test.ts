import { describe, it, expect } from "vitest";
import {
  BRIEFING_SCHEMA,
  filtrarSecoes,
  prePopularRespostas,
  calcularStatusBriefing,
  progressoObrigatorios,
} from "./briefing-schema";

describe("briefing-schema", () => {
  it("tem 7 seções com Dados Gerais primeiro e Declaração por último", () => {
    expect(BRIEFING_SCHEMA).toHaveLength(7);
    expect(BRIEFING_SCHEMA[0].id).toBe("dados-gerais");
    expect(BRIEFING_SCHEMA.at(-1)!.id).toBe("declaracao");
  });

  it("filtra seções por disciplina ativa (Dados Gerais e Declaração sempre entram)", () => {
    const secoes = filtrarSecoes(["Estrutural", "Elétrico"]);
    const ids = secoes.map((s) => s.id);
    expect(ids).toContain("dados-gerais");
    expect(ids).toContain("declaracao");
    expect(ids).toContain("estrutural");
    expect(ids).toContain("eletrico");
    expect(ids).not.toContain("hidrossanitario");
    expect(ids).not.toContain("climatizacao");
  });

  it("sem disciplinas → todas as seções", () => {
    expect(filtrarSecoes([])).toHaveLength(7);
    expect(filtrarSecoes(undefined)).toHaveLength(7);
  });

  it("pré-popula do cadastro sem sobrescrever respostas existentes", () => {
    const r = prePopularRespostas(
      { nomeCompleto: "Já preenchido" },
      { email: "c@x.com", nome: "Cliente X", telefone: "9999", endereco: "Rua 1" },
    );
    expect(r.emailContato).toBe("c@x.com");
    expect(r.nomeCompleto).toBe("Já preenchido");
    expect(r.telefoneContato).toBe("9999");
  });

  it("status: nao_iniciado → em_preenchimento → completo", () => {
    expect(calcularStatusBriefing({})).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ emailContato: "a@b.com" })).toBe("em_preenchimento");
    const obrig = BRIEFING_SCHEMA.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
    const todas: Record<string, unknown> = {};
    for (const c of obrig) todas[c.chave] = c.tipo === "checkbox" || c.tipo === "checkbox-single" ? ["x"] : "x";
    expect(calcularStatusBriefing(todas)).toBe("completo");
  });

  it("progresso: obrigatórios vivem só em Dados Gerais + Declaração (sempre visíveis)", () => {
    // Seções de disciplina não têm campos obrigatórios → total não muda ao filtrar.
    const { total } = progressoObrigatorios({}, filtrarSecoes(["Estrutural"]));
    expect(total).toBe(progressoObrigatorios({}).total);
    expect(total).toBeGreaterThan(0);
    // Preencher um obrigatório incrementa o contador.
    expect(progressoObrigatorios({ emailContato: "a@b.com" }).preenchidos).toBe(1);
  });
});
