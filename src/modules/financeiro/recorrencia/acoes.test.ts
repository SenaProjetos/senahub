import { describe, expect, it } from "vitest";
import {
  ACAO_ATIVAR,
  ACAO_DESATIVAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_GERAR,
  MOTIVO_INATIVO,
  MOTIVO_JA_GEROU,
  itensDeCompromisso,
} from "@/modules/financeiro/recorrencia/acoes";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const por = (xs: { id: string }[], id: string) => xs.find((x) => x.id === id) as { desabilitado?: string; variant?: string; confirmar?: unknown } | undefined;
const c = { descricao: "Pró-labore Ana", ativo: true, gerados: 0 };

describe("itensDeCompromisso (ADR-0002)", () => {
  it("quem só vê não recebe nada", () => {
    expect(itensDeCompromisso(c, { podeGerir: false })).toEqual([]);
  });

  it("ativo e nunca gerado: editar, gerar, inativar e excluir", () => {
    const itens = itensDeCompromisso(c, { podeGerir: true });
    expect(ids(itens).filter((i) => i !== "sep")).toEqual([ACAO_EDITAR, ACAO_GERAR, ACAO_DESATIVAR, ACAO_EXCLUIR]);
    expect(por(itens, ACAO_EXCLUIR)).toMatchObject({ variant: "destructive", confirmar: expect.any(Object), desabilitado: undefined });
  });

  it("já gerou: excluir desabilitado com o motivo (fica inativo para manter a origem)", () => {
    expect(por(itensDeCompromisso({ ...c, gerados: 4 }, { podeGerir: true }), ACAO_EXCLUIR)?.desabilitado).toBe(MOTIVO_JA_GEROU);
  });

  it("inativo: ativar no lugar de inativar, e gerar desabilitado", () => {
    const itens = itensDeCompromisso({ ...c, ativo: false }, { podeGerir: true });
    expect(ids(itens)).toContain(ACAO_ATIVAR);
    expect(ids(itens)).not.toContain(ACAO_DESATIVAR);
    expect(por(itens, ACAO_GERAR)?.desabilitado).toBe(MOTIVO_INATIVO);
  });
});
