import { describe, expect, it } from "vitest";
import { motivoParaNaoExcluirDisciplina, MSG_DISCIPLINA_COM_ARQUIVOS, MSG_DISCIPLINA_COM_HORAS, MSG_DISCIPLINA_COM_PAGAMENTOS } from "./excluir-disciplina";

const zero = { uploads: 0, pagamentos: 0, sessoes: 0, rateios: 0 };

describe("motivoParaNaoExcluirDisciplina", () => {
  it("sem nada preso: pode excluir", () => {
    expect(motivoParaNaoExcluirDisciplina(zero)).toBeNull();
  });
  it("arquivos e pagamentos seguem recusando", () => {
    expect(motivoParaNaoExcluirDisciplina({ ...zero, uploads: 1 })).toBe(MSG_DISCIPLINA_COM_ARQUIVOS);
    expect(motivoParaNaoExcluirDisciplina({ ...zero, pagamentos: 2 })).toBe(MSG_DISCIPLINA_COM_PAGAMENTOS);
  });
  it("horas no ponto ou linha no rateio (mês fechado) recusam", () => {
    expect(motivoParaNaoExcluirDisciplina({ ...zero, sessoes: 3 })).toBe(MSG_DISCIPLINA_COM_HORAS);
    expect(motivoParaNaoExcluirDisciplina({ ...zero, rateios: 1 })).toBe(MSG_DISCIPLINA_COM_HORAS);
  });
});
