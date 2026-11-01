import { describe, expect, it } from "vitest";
import { disciplinaDaSessao, motivoParaNaoMarcarNoProjeto, MSG_SEM_ACESSO_PROJETO, MSG_TAREFA_OBRIGATORIA } from "./disciplina-sessao";

describe("motivoParaNaoMarcarNoProjeto (decisão 11 e 44b)", () => {
  it("equipe, responsável de disciplina ou card aberto podem marcar", () => {
    expect(motivoParaNaoMarcarNoProjeto({ membro: true, responsavelDeDisciplina: false, temCardAberto: false })).toBeNull();
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: true, temCardAberto: false })).toBeNull();
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: false, temCardAberto: true })).toBeNull();
  });
  it("quem não tem nenhum dos três é recusado", () => {
    expect(motivoParaNaoMarcarNoProjeto({ membro: false, responsavelDeDisciplina: false, temCardAberto: false })).toBe(MSG_SEM_ACESSO_PROJETO);
  });
});

describe("disciplinaDaSessao (decisões 8, 12 e 44a)", () => {
  it("a tarefa escolhida manda", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: "d2", tarefaEscolhida: true, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ disciplinaId: "d2" });
  });
  it("tarefa sem disciplina (card manual) deixa a sessão sem disciplina", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: null, tarefaEscolhida: true, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ disciplinaId: null });
  });
  it("uma disciplina só: automática, tarefa opcional", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1"], exigirTarefa: true })).toEqual({ disciplinaId: "d1" });
  });
  it("nenhuma disciplina: coordenação/apoio, sem disciplina", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: [], exigirTarefa: true })).toEqual({ disciplinaId: null });
  });
  it("duas ou mais sem tarefa: ao vivo exige a tarefa", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: true })).toEqual({ erro: MSG_TAREFA_OBRIGATORIA });
  });
  it("duas ou mais sem tarefa na correção do dia: fica sem disciplina, nunca falha", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1", "d2"], exigirTarefa: false })).toEqual({ disciplinaId: null });
  });
  it("a mesma disciplina repetida conta como uma só", () => {
    expect(disciplinaDaSessao({ disciplinaDaTarefa: undefined, tarefaEscolhida: false, disciplinasDaPessoa: ["d1", "d1"], exigirTarefa: true })).toEqual({ disciplinaId: "d1" });
  });
});
