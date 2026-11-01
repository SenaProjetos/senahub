// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate do detalhe do mês do rateio: o mesmo da página (ponto:rateio, ou sócio pelo piso de leitura),
 * e os reais só para quem vê custo — decidido no servidor.
 */
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  canRole: vi.fn(),
  podeVerCusto: vi.fn(),
  detalheDoMes: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can, canRole: mocks.canRole }));
vi.mock("@/lib/custo-visivel", () => ({ podeVerCusto: mocks.podeVerCusto }));
vi.mock("@/modules/rh/rateio/fechamento/queries", () => ({ detalheDoMes: mocks.detalheDoMes }));

const { buscarDetalheDoMesRateio } = await import("./detalhe-actions");

const interno = { id: "u1", ativo: true, tipo: "interno", ehSocio: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.detalheDoMes.mockResolvedValue({ ok: true });
  mocks.podeVerCusto.mockResolvedValue(false);
  mocks.canRole.mockResolvedValue(false);
});

describe("buscarDetalheDoMesRateio", () => {
  it("sem sessão, inativo ou externo: nada", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect(await buscarDetalheDoMesRateio(2026, 10)).toBeNull();
    mocks.getSession.mockResolvedValue({ user: { ...interno, ativo: false } });
    expect(await buscarDetalheDoMesRateio(2026, 10)).toBeNull();
    mocks.getSession.mockResolvedValue({ user: { ...interno, tipo: "externo" } });
    expect(await buscarDetalheDoMesRateio(2026, 10)).toBeNull();
    expect(mocks.detalheDoMes).not.toHaveBeenCalled();
  });

  it("mês ou ano fora do intervalo: nada", async () => {
    mocks.getSession.mockResolvedValue({ user: interno });
    mocks.can.mockResolvedValue(true);
    expect(await buscarDetalheDoMesRateio(2026, 13)).toBeNull();
    expect(await buscarDetalheDoMesRateio(1999, 5)).toBeNull();
    expect(mocks.detalheDoMes).not.toHaveBeenCalled();
  });

  it("sem ponto:rateio: nada", async () => {
    mocks.getSession.mockResolvedValue({ user: interno });
    mocks.can.mockResolvedValue(false);
    expect(await buscarDetalheDoMesRateio(2026, 10)).toBeNull();
  });

  it("sócio sem o par no perfil entra pelo piso de leitura, como na página", async () => {
    mocks.getSession.mockResolvedValue({ user: { ...interno, ehSocio: true } });
    mocks.can.mockResolvedValue(false);
    mocks.canRole.mockResolvedValue(true);
    expect(await buscarDetalheDoMesRateio(2026, 10)).toEqual({ ok: true });
    expect(mocks.canRole).toHaveBeenCalledWith("supervisor", "ponto", "rateio");
  });

  it("com ponto:rateio e sem permissão de custo: pede o detalhe sem reais", async () => {
    mocks.getSession.mockResolvedValue({ user: interno });
    mocks.can.mockResolvedValue(true);
    await buscarDetalheDoMesRateio(2026, 9);
    expect(mocks.detalheDoMes).toHaveBeenCalledWith(2026, 9, false);
  });
});
