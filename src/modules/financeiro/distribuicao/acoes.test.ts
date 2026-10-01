import { describe, expect, it } from "vitest";
import {
  ACAO_ATIVAR,
  ACAO_DESATIVAR,
  ACAO_DUPLICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_PADRAO,
  MOTIVO_ATIVAR_ANTES,
  MOTIVO_EXCLUIR_PADRAO,
  MOTIVO_PADRAO_INATIVA,
  MOTIVO_USADA,
  itensDeRegra,
} from "@/modules/financeiro/distribuicao/acoes";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const por = (xs: { id: string }[], id: string) => xs.find((x) => x.id === id) as { desabilitado?: string; variant?: string; confirmar?: unknown } | undefined;
const regra = { nome: "Medição", ativa: true, padrao: false, usos: 0 };
const gere = { podeGerir: true, totalDeRegras: 3 };

describe("itensDeRegra (ADR-0002)", () => {
  it("quem só vê não recebe nada (o cartão fica sem menu)", () => {
    expect(itensDeRegra(regra, { podeGerir: false, totalDeRegras: 3 })).toEqual([]);
  });

  it("regra comum e ativa: editar, duplicar, deixar inativa, tornar padrão e excluir (destrutivo, confirmado)", () => {
    const itens = itensDeRegra(regra, gere);
    expect(ids(itens).filter((i) => i !== "sep")).toEqual([ACAO_EDITAR, ACAO_DUPLICAR, ACAO_DESATIVAR, ACAO_PADRAO, ACAO_EXCLUIR]);
    expect(por(itens, ACAO_EXCLUIR)).toMatchObject({ variant: "destructive", confirmar: expect.any(Object), desabilitado: undefined });
  });

  it("regra padrão: não vira inativa, não oferece tornar padrão e não se exclui havendo outras", () => {
    const itens = itensDeRegra({ ...regra, padrao: true }, gere);
    expect(ids(itens)).not.toContain(ACAO_PADRAO);
    expect(por(itens, ACAO_DESATIVAR)?.desabilitado).toBe(MOTIVO_PADRAO_INATIVA);
    expect(por(itens, ACAO_EXCLUIR)?.desabilitado).toBe(MOTIVO_EXCLUIR_PADRAO);
    // A única regra (e padrão) pode ser excluída se nunca foi usada.
    expect(por(itensDeRegra({ ...regra, padrao: true }, { podeGerir: true, totalDeRegras: 1 }), ACAO_EXCLUIR)?.desabilitado).toBeUndefined();
  });

  it("regra já usada: excluir desabilitado com a frase do mock", () => {
    expect(por(itensDeRegra({ ...regra, usos: 3 }, gere), ACAO_EXCLUIR)?.desabilitado).toBe(MOTIVO_USADA);
    expect(MOTIVO_USADA).toBe("Já foi usada numa distribuição. Deixe inativa para manter o histórico.");
  });

  it("regra inativa: ativar no lugar de desativar; tornar padrão desabilitado até ativar", () => {
    const itens = itensDeRegra({ ...regra, ativa: false }, gere);
    expect(ids(itens)).toContain(ACAO_ATIVAR);
    expect(ids(itens)).not.toContain(ACAO_DESATIVAR);
    expect(por(itens, ACAO_PADRAO)?.desabilitado).toBe(MOTIVO_ATIVAR_ANTES);
  });
});
