import { describe, expect, it } from "vitest";
import {
  ACAO_AJUSTAR,
  ACAO_ARQUIVAR,
  ACAO_EDITAR,
  ACAO_EXTRATO,
  ACAO_LIBERAR,
  ACAO_RESERVAR,
  ACAO_RESTAURAR,
  ACAO_TRANSFERIR,
  MOTIVO_ARQUIVAR_RESERVADO,
  MOTIVO_SEM_RESERVADO,
  itensDeCaixinha,
  motivoArquivarAbertas,
} from "@/modules/financeiro/caixinhas/acoes";

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const por = (xs: { id: string }[], id: string) => xs.find((x) => x.id === id) as { desabilitado?: string; variant?: string; confirmar?: unknown } | undefined;
const cx = { nome: "Impostos", ativo: true, reservado: 4_800_00, abertas: 0 };

describe("itensDeCaixinha (ADR-0002)", () => {
  it("quem gere: movimentar, extrato, editar, copiar e arquivar", () => {
    const itens = itensDeCaixinha(cx, { podeGerir: true });
    expect(ids(itens).filter((i) => !i.startsWith("sep"))).toEqual([
      ACAO_RESERVAR,
      ACAO_LIBERAR,
      ACAO_TRANSFERIR,
      ACAO_AJUSTAR,
      ACAO_EXTRATO,
      ACAO_EDITAR,
      "copiar-nome",
      ACAO_ARQUIVAR,
    ]);
  });

  it("quem só vê: extrato e copiar (o que o perfil não permite some)", () => {
    expect(ids(itensDeCaixinha(cx, { podeGerir: false }))).toEqual([ACAO_EXTRATO, "copiar-nome"]);
  });

  it("sem reservado: liberar e transferir desabilitados com o motivo", () => {
    const itens = itensDeCaixinha({ ...cx, reservado: 0 }, { podeGerir: true });
    expect(por(itens, ACAO_LIBERAR)?.desabilitado).toBe(MOTIVO_SEM_RESERVADO);
    expect(por(itens, ACAO_TRANSFERIR)?.desabilitado).toBe(MOTIVO_SEM_RESERVADO);
    expect(por(itens, ACAO_RESERVAR)?.desabilitado).toBeUndefined();
  });

  it("arquivar: destrutivo e confirmado; desabilitado com reservado, depois com contas ligadas", () => {
    expect(por(itensDeCaixinha(cx, { podeGerir: true }), ACAO_ARQUIVAR)).toMatchObject({ variant: "destructive", desabilitado: MOTIVO_ARQUIVAR_RESERVADO });
    const vazia = por(itensDeCaixinha({ ...cx, reservado: 0, abertas: 2 }, { podeGerir: true }), ACAO_ARQUIVAR);
    expect(vazia?.desabilitado).toBe(motivoArquivarAbertas(2));
    expect(vazia?.confirmar).toBeDefined();
    expect(por(itensDeCaixinha({ ...cx, reservado: 0 }, { podeGerir: true }), ACAO_ARQUIVAR)?.desabilitado).toBeUndefined();
  });

  it("arquivada: só restaurar, extrato, editar e copiar — nada de movimentar", () => {
    const itens = itensDeCaixinha({ ...cx, ativo: false, reservado: 0 }, { podeGerir: true });
    expect(ids(itens)).toContain(ACAO_RESTAURAR);
    expect(ids(itens)).not.toContain(ACAO_RESERVAR);
    expect(ids(itens)).not.toContain(ACAO_ARQUIVAR);
  });

  it("a frase de contas ligadas concorda no singular e no plural", () => {
    expect(motivoArquivarAbertas(1)).toContain("1 conta a pagar ligada");
    expect(motivoArquivarAbertas(3)).toContain("3 contas a pagar ligadas");
  });
});
