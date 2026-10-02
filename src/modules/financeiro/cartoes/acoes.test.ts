import { describe, expect, it } from "vitest";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_ESTORNAR_COMPRA,
  ACAO_EXCLUIR_CARTAO,
  ACAO_EXCLUIR_COMPRA,
  ACAO_PAGAR_COMPRA,
  ACAO_PAGAR_FATURA,
  itensDeCartao,
  itensDeCompra,
  itensDeFatura,
  MOTIVO_CARTAO_COM_COMPRAS,
  MOTIVO_COMPRA_PAGA,
  MOTIVO_SO_PESSOAL,
} from "@/modules/financeiro/cartoes/acoes";
import { MOTIVO_FATURA_ABERTA, MOTIVO_FATURA_PAGA } from "@/modules/financeiro/cartoes/ciclo";

const acoes = (itens: ReturnType<typeof itensDeCartao>) => itens.filter((i): i is AcaoItemAcao => i.tipo === "acao");
const achar = (itens: ReturnType<typeof itensDeCartao>, id: string) => acoes(itens).find((i) => i.id === id);

describe("ações do cartão", () => {
  it("quem só vê não lança compra nem edita", () => {
    const ids = acoes(itensDeCartao({ nome: "Visa", ativo: true, temCompras: false }, { podeGerir: false })).map((i) => i.id);
    expect(ids).toEqual(["ver-fatura"]);
  });
  it("cartão com compras não se exclui, com o motivo à vista", () => {
    const comCompras = itensDeCartao({ nome: "Visa", ativo: true, temCompras: true }, { podeGerir: true });
    expect(achar(comCompras, ACAO_EXCLUIR_CARTAO)?.desabilitado).toBe(MOTIVO_CARTAO_COM_COMPRAS);
    const sem = itensDeCartao({ nome: "Visa", ativo: true, temCompras: false }, { podeGerir: true });
    expect(achar(sem, ACAO_EXCLUIR_CARTAO)?.desabilitado).toBeUndefined();
    expect(achar(sem, ACAO_EXCLUIR_CARTAO)?.confirmar).toBeTruthy();
  });
});

describe("ações da fatura", () => {
  const f = { fimCiclo: "2026-10-25", situacao: "fechada" as const };
  it("fatura aberta ou paga não se paga, com a frase do servidor", () => {
    const aberta = itensDeFatura({ ...f, compras: { emAberto: 3, pagas: 0 } }, { podeGerir: true, pessoal: false, hoje: "2026-10-20" });
    expect(achar(aberta, ACAO_PAGAR_FATURA)?.desabilitado).toBe(MOTIVO_FATURA_ABERTA);
    const paga = itensDeFatura({ ...f, compras: { emAberto: 0, pagas: 2 } }, { podeGerir: true, pessoal: false, hoje: "2026-11-01" });
    expect(achar(paga, ACAO_PAGAR_FATURA)?.desabilitado).toBe(MOTIVO_FATURA_PAGA);
    const fechada = itensDeFatura({ ...f, compras: { emAberto: 3, pagas: 0 } }, { podeGerir: true, pessoal: false, hoje: "2026-10-30" });
    expect(achar(fechada, ACAO_PAGAR_FATURA)?.desabilitado).toBeUndefined();
  });
  it("no cartão pessoal o verbo é reembolsar", () => {
    const p = itensDeFatura({ ...f, compras: { emAberto: 1, pagas: 0 } }, { podeGerir: true, pessoal: true, hoje: "2026-10-30" });
    expect(achar(p, ACAO_PAGAR_FATURA)?.rotulo).toBe("Reembolsar tudo…");
  });
});

describe("ações da compra", () => {
  const aberta = { descricao: "Licença", paga: false, temCategoria: true };
  it("pagar uma compra só existe no cartão pessoal", () => {
    expect(achar(itensDeCompra(aberta, { podeGerir: true, pessoal: true }), ACAO_PAGAR_COMPRA)?.desabilitado).toBeUndefined();
    expect(achar(itensDeCompra(aberta, { podeGerir: true, pessoal: false }), ACAO_PAGAR_COMPRA)?.desabilitado).toBe(MOTIVO_SO_PESSOAL);
  });
  it("compra paga troca pagar por estornar e trava editar/excluir", () => {
    const paga = itensDeCompra({ ...aberta, paga: true }, { podeGerir: true, pessoal: true });
    expect(achar(paga, ACAO_ESTORNAR_COMPRA)).toBeTruthy();
    expect(achar(paga, ACAO_PAGAR_COMPRA)).toBeUndefined();
    expect(achar(paga, ACAO_EXCLUIR_COMPRA)?.desabilitado).toBe(MOTIVO_COMPRA_PAGA);
  });
  it("sem perfil de gestão a compra não tem menu", () => {
    expect(itensDeCompra(aberta, { podeGerir: false, pessoal: true })).toEqual([]);
  });
});
