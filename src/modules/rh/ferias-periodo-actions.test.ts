import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Teto de 30 dias corridos por período de férias, no SERVIDOR: cada ação de férias que recebe datas
 * recusa no schema (antes de qualquer leitura ou escrita no banco) com a mesma frase da tela
 * (`motivoPeriodoFerias`). Sessão, auditoria e Prisma mockados: o Prisma é um objeto vazio, então se a
 * ação passasse do schema ela quebraria — e o teste falharia por outro motivo, não por esta frase.
 */
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), logAudit: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: async () => true }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: async () => null }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notificar", () => ({ notificar: vi.fn(), notificarMuitos: vi.fn() }));

import {
  editarFeriasPendente,
  lancarFeriasColaborador,
  proporAlteracaoFerias,
  solicitarFerias,
} from "@/modules/rh/actions";
import { MOTIVO_FIM_ANTES_DO_INICIO, motivoPeriodoFerias } from "@/modules/rh/ferias-decisao";

const sessao = {
  user: {
    id: "rh1",
    ativo: true,
    mustChangePassword: false,
    tipo: "interno",
    gereRh: true,
    superUsuario: false,
    contratacao: "clt",
  },
};

const TRINTA_E_UM = { inicio: "2026-12-01", fim: "2026-12-31" };
const FRASE_31 = motivoPeriodoFerias(TRINTA_E_UM.inicio, TRINTA_E_UM.fim);

describe("férias acima de 30 dias corridos: recusa no servidor, com a frase da tela", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(sessao);
  });

  it("a frase de 31 dias existe (a regra pura é testada em ferias-decisao.test.ts)", () => {
    expect(FRASE_31).toMatch(/no máximo 30 dias corridos \(este tem 31\)/);
  });

  it("solicitar", async () => {
    expect(await solicitarFerias(TRINTA_E_UM)).toEqual({ ok: false, error: FRASE_31, fieldErrors: { fim: [FRASE_31] } });
  });

  it("lançar pelo RH", async () => {
    expect(await lancarFeriasColaborador({ userId: "u2", ...TRINTA_E_UM })).toEqual({
      ok: false,
      error: FRASE_31,
      fieldErrors: { fim: [FRASE_31] },
    });
  });

  it("editar o pedido pendente", async () => {
    expect(await editarFeriasPendente({ id: "f1", ...TRINTA_E_UM })).toEqual({
      ok: false,
      error: FRASE_31,
      fieldErrors: { fim: [FRASE_31] },
    });
  });

  it("propor nova data", async () => {
    expect(await proporAlteracaoFerias({ id: "f1", ...TRINTA_E_UM })).toEqual({
      ok: false,
      error: FRASE_31,
      fieldErrors: { fim: [FRASE_31] },
    });
  });

  it("fim antes do início continua com a frase de sempre", async () => {
    expect(await solicitarFerias({ inicio: "2026-12-10", fim: "2026-12-09" })).toMatchObject({
      ok: false,
      error: MOTIVO_FIM_ANTES_DO_INICIO,
    });
  });
});
