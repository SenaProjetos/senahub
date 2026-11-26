import { describe, expect, it } from "vitest";
import {
  MOTIVO_NOME_CURTO,
  MOTIVO_NOME_LONGO,
  MOTIVO_PARCEIRO_ARQUIVADO,
  MOTIVO_PARCEIRO_SO_EXTERNO,
  motivoDoNomeParceiro,
  motivoParaEscolherParceiro,
  motivoParaNaoExcluirParceiro,
  normalizarNomeParceiro,
  rotuloDoExterno,
} from "./regras";

describe("parceiro externo — regras", () => {
  it("nome: junta espaços, exige 2 a 80 letras", () => {
    expect(normalizarNomeParceiro("  Eqp.   Climatização ")).toBe("Eqp. Climatização");
    expect(motivoDoNomeParceiro(" a ")).toBe(MOTIVO_NOME_CURTO);
    expect(motivoDoNomeParceiro("x".repeat(81))).toBe(MOTIVO_NOME_LONGO);
    expect(motivoDoNomeParceiro("Eqp. Climatização")).toBeNull();
  });

  it("excluir só sem uso", () => {
    expect(motivoParaNaoExcluirParceiro(0)).toBeNull();
    expect(motivoParaNaoExcluirParceiro(1)).toBe("Este parceiro está em 1 tarefa do cronograma: arquive em vez de excluir.");
    expect(motivoParaNaoExcluirParceiro(3)).toContain("3 tarefas");
  });

  it("escolher: só no Externo; arquivado só se já era o da etapa; nenhum = pode", () => {
    const ativo = { ativo: true };
    const arquivado = { ativo: false };
    expect(motivoParaEscolherParceiro({ papel: "ext", parceiro: null, atual: null, escolhido: null })).toBeNull();
    expect(motivoParaEscolherParceiro({ papel: "pro", parceiro: ativo, atual: null, escolhido: "p" })).toBe(MOTIVO_PARCEIRO_SO_EXTERNO);
    expect(motivoParaEscolherParceiro({ papel: "ext", parceiro: ativo, atual: null, escolhido: "p" })).toBeNull();
    expect(motivoParaEscolherParceiro({ papel: "ext", parceiro: arquivado, atual: null, escolhido: "p" })).toBe(MOTIVO_PARCEIRO_ARQUIVADO);
    expect(motivoParaEscolherParceiro({ papel: "ext", parceiro: arquivado, atual: "p", escolhido: "p" })).toBeNull();
    expect(motivoParaEscolherParceiro({ papel: "ext", parceiro: null, atual: null, escolhido: "sumiu" })).toBe("Parceiro não encontrado.");
  });

  it("rótulo", () => {
    expect(rotuloDoExterno("Eqp. Climatização")).toBe("Externo: Eqp. Climatização");
    expect(rotuloDoExterno(null)).toBe("Externo");
  });
});
