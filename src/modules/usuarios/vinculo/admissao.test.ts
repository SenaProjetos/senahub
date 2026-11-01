import { describe, expect, it } from "vitest";
import { inicioDoVinculoPelaAdmissao, MOTIVO_ADMISSAO_DEPOIS_DO_FIM } from "./admissao";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const unico = [{ id: "v1", dataInicio: d("2026-07-03"), dataFim: null }];

describe("inicioDoVinculoPelaAdmissao", () => {
  it("um vínculo só: a admissão corrigida move o início", () => {
    expect(inicioDoVinculoPelaAdmissao(unico, d("2026-07-01"))).toEqual({
      acao: "alterar",
      vinculoId: "v1",
      dataInicio: d("2026-07-01"),
    });
  });

  it("admissão para depois do início também move", () => {
    expect(inicioDoVinculoPelaAdmissao(unico, d("2026-07-10"))).toMatchObject({ acao: "alterar" });
  });

  it("mesma data: nada a fazer", () => {
    expect(inicioDoVinculoPelaAdmissao(unico, d("2026-07-03"))).toEqual({ acao: "nenhuma" });
  });

  it("admissão apagada não mexe no vínculo", () => {
    expect(inicioDoVinculoPelaAdmissao(unico, null)).toEqual({ acao: "nenhuma" });
  });

  it("dois vínculos (estágio → CLT): a admissão não diz qual mudou", () => {
    const dois = [
      { id: "v1", dataInicio: d("2025-01-01"), dataFim: d("2026-06-30") },
      { id: "v2", dataInicio: d("2026-07-01"), dataFim: null },
    ];
    expect(inicioDoVinculoPelaAdmissao(dois, d("2024-12-01"))).toEqual({ acao: "nenhuma" });
  });

  it("sem vínculo: nada a fazer", () => {
    expect(inicioDoVinculoPelaAdmissao([], d("2026-07-01"))).toEqual({ acao: "nenhuma" });
  });

  it("admissão depois do fim do vínculo é recusada", () => {
    const encerrado = [{ id: "v1", dataInicio: d("2026-07-03"), dataFim: d("2026-07-31") }];
    expect(inicioDoVinculoPelaAdmissao(encerrado, d("2026-08-01"))).toEqual({
      acao: "recusar",
      motivo: MOTIVO_ADMISSAO_DEPOIS_DO_FIM,
    });
    expect(inicioDoVinculoPelaAdmissao(encerrado, d("2026-07-31"))).toMatchObject({ acao: "alterar" });
  });
});
