import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Controle das actions de etapa que mexem com dinheiro (F7.4): `aprovarEtapaDisciplina` e as
 * travas da F4 sobre fase liberada. Mesmo padrão de `financeiro/folha/actions.test.ts` — mocka
 * sessão/permissão/Prisma/notificação e testa o que a action decide ANTES de escrever. A
 * aritmética do pool (`poolsDasFasesPendentes`) tem teste próprio; o I/O da liberação, o
 * `smoke:pagamento-fase`.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  podeVerFinanceiro: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  notificarMuitos: vi.fn(),
  revalidatePath: vi.fn(),
  liberarPagamentosDaFase: vi.fn(),
  situacaoPagamento: vi.fn(),
  sincronizarPrazoDisciplina: vi.fn(),
  etapaFindUnique: vi.fn(),
  etapaUpdateMany: vi.fn(),
  etapaUpsert: vi.fn(),
  etapaDelete: vi.fn(),
  etapaAggregate: vi.fn(),
  disciplinaFindUnique: vi.fn(),
  catalogoFindFirst: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can, podeVerFinanceiro: mocks.podeVerFinanceiro }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/notificar", () => ({ notificarMuitos: mocks.notificarMuitos }));
vi.mock("@/lib/audiencias", () => ({ whereAudiencia: () => ({ ativo: true }) }));
vi.mock("@/modules/uploads/pagamento", () => ({
  liberarPagamentosDaFase: mocks.liberarPagamentosDaFase,
  situacaoPagamento: mocks.situacaoPagamento,
}));
vi.mock("./etapas-service", () => ({ sincronizarPrazoDisciplina: mocks.sincronizarPrazoDisciplina }));

const tx = {
  disciplinaEtapa: {
    upsert: mocks.etapaUpsert,
    delete: mocks.etapaDelete,
    aggregate: mocks.etapaAggregate,
    findMany: vi.fn().mockResolvedValue([]),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    disciplinaEtapa: {
      findUnique: mocks.etapaFindUnique,
      updateMany: mocks.etapaUpdateMany,
      findMany: vi.fn().mockResolvedValue([]),
    },
    disciplina: { findUnique: mocks.disciplinaFindUnique },
    pranchaCatalogo: { findFirst: mocks.catalogoFindFirst },
    user: { findMany: mocks.userFindMany },
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}));

const { aprovarEtapaDisciplina, salvarEtapaDisciplina, excluirEtapaDisciplina } = await import("./etapas-actions");

const USER = { id: "u1", role: "supervisor", ativo: true, mustChangePassword: false };
const PJ = { userId: "pj1", user: { id: "pj1", name: "Ana PJ", role: "projetista_pj" } };
const CLT = { userId: "clt1", user: { id: "clt1", name: "Bia CLT", role: "clt" } };

const FASE_ENTREGUE = { id: "de1", status: "entregue", liberadaEm: null, disciplinaId: "d1", etapa: { sigla: "BS" } };
const disciplina = (responsaveis: unknown[], valor: number | null = 10000) => ({
  id: "d1",
  disciplinaTextoLegado: "Estrutural",
  valor,
  responsaveis,
  projeto: { id: "p1", codigo: "260001" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: USER });
  mocks.can.mockResolvedValue(true);
  mocks.userFindMany.mockResolvedValue([{ id: "g1" }]);
  mocks.liberarPagamentosDaFase.mockResolvedValue({ pagaveis: [PJ], salariados: [], pool: 4000, jaLiberada: false });
});

describe("aprovarEtapaDisciplina", () => {
  it("sem aprovacoes:disciplina: bloqueia antes de ler a fase", async () => {
    mocks.can.mockResolvedValue(false);
    const r = await aprovarEtapaDisciplina({ id: "de1" });
    expect(r).toEqual({ ok: false, error: "Sem permissão." });
    expect(mocks.can).toHaveBeenCalledWith(USER, "aprovacoes", "disciplina");
    expect(mocks.liberarPagamentosDaFase).not.toHaveBeenCalled();
  });

  it("fase não entregue: recusa sem liberar", async () => {
    mocks.etapaFindUnique.mockResolvedValue({ ...FASE_ENTREGUE, status: "em_andamento" });
    const r = await aprovarEtapaDisciplina({ id: "de1" });
    expect(r).toEqual({ ok: false, error: "A fase precisa estar entregue para ser aprovada." });
    expect(mocks.liberarPagamentosDaFase).not.toHaveBeenCalled();
  });

  it("fase já liberada: recusa (a liberação é única)", async () => {
    mocks.etapaFindUnique.mockResolvedValue({ ...FASE_ENTREGUE, status: "aprovado", liberadaEm: new Date() });
    const r = await aprovarEtapaDisciplina({ id: "de1" });
    expect(r).toEqual({ ok: false, error: "Esta fase já foi aprovada." });
    expect(mocks.liberarPagamentosDaFase).not.toHaveBeenCalled();
  });

  it("PJ sem valor na disciplina: recusa com o bloqueio de sempre", async () => {
    mocks.etapaFindUnique.mockResolvedValue(FASE_ENTREGUE);
    mocks.disciplinaFindUnique.mockResolvedValue(disciplina([PJ], null));
    const r = await aprovarEtapaDisciplina({ id: "de1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Defina o valor de pagamento/);
    expect(mocks.liberarPagamentosDaFase).not.toHaveBeenCalled();
  });

  it("caminho feliz: libera a fase, avisa o PJ com a tag DA FASE e a gestão; não devolve valor (Q15)", async () => {
    mocks.etapaFindUnique.mockResolvedValue(FASE_ENTREGUE);
    mocks.disciplinaFindUnique.mockResolvedValue(disciplina([PJ, CLT]));

    const r = await aprovarEtapaDisciplina({ id: "de1" });

    expect(r).toEqual({ ok: true, data: { id: "de1", pagamentos: 1 } });
    expect(mocks.liberarPagamentosDaFase).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ faseId: "de1", autorId: "u1", disciplina: expect.objectContaining({ valor: 10000 }) }),
    );
    expect(mocks.notificarMuitos).toHaveBeenCalledWith(
      ["pj1"],
      expect.objectContaining({ titulo: "Pagamento liberado", tag: "pagto-fase-de1" }),
      { categoria: "pagamento" },
    );
    expect(mocks.notificarMuitos).toHaveBeenCalledWith(
      ["g1"],
      expect.objectContaining({ titulo: "Fase aprovada", tag: "aprovacao-fase-de1" }),
      { categoria: "aprovacao_disciplina" },
    );
  });

  it("valor enviado na chamada é ignorado: o pool sai do valor gravado (Q15)", async () => {
    mocks.etapaFindUnique.mockResolvedValue(FASE_ENTREGUE);
    mocks.disciplinaFindUnique.mockResolvedValue(disciplina([PJ]));

    await aprovarEtapaDisciplina({ id: "de1", valor: 1 } as unknown as { id: string });

    expect(mocks.liberarPagamentosDaFase).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ disciplina: expect.objectContaining({ valor: 10000 }) }),
    );
  });

  it("100% CLT: aprova a fase sem liberar pagamento nem avisar pagamento", async () => {
    mocks.etapaFindUnique.mockResolvedValue(FASE_ENTREGUE);
    mocks.disciplinaFindUnique.mockResolvedValue(disciplina([CLT], null));
    mocks.etapaUpdateMany.mockResolvedValue({ count: 1 });

    const r = await aprovarEtapaDisciplina({ id: "de1" });

    expect(r).toEqual({ ok: true, data: { id: "de1", pagamentos: 0 } });
    expect(mocks.liberarPagamentosDaFase).not.toHaveBeenCalled();
    expect(mocks.etapaUpdateMany).toHaveBeenCalledWith({
      where: { id: "de1", liberadaEm: null, status: { in: ["entregue", "em_revisao"] } },
      data: expect.objectContaining({ status: "aprovado" }),
    });
    expect(mocks.notificarMuitos).toHaveBeenCalledTimes(1);
    expect(mocks.notificarMuitos).toHaveBeenCalledWith(["g1"], expect.objectContaining({ titulo: "Fase aprovada" }), {
      categoria: "aprovacao_disciplina",
    });
  });

  it("100% CLT e a fase mudou no meio: recusa em vez de fingir sucesso", async () => {
    mocks.etapaFindUnique.mockResolvedValue(FASE_ENTREGUE);
    mocks.disciplinaFindUnique.mockResolvedValue(disciplina([CLT], null));
    mocks.etapaUpdateMany.mockResolvedValue({ count: 0 });

    const r = await aprovarEtapaDisciplina({ id: "de1" });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mudou enquanto a tela estava aberta/);
  });
});

describe("travas da F4 sobre fase liberada", () => {
  beforeEach(() => {
    mocks.disciplinaFindUnique.mockResolvedValue({ projetoId: "p1", projeto: { prazoPlanejado: null } });
    mocks.catalogoFindFirst.mockResolvedValue({ id: "f1", ativo: true, nome: "Básico" });
  });

  it("não muda o percentual de fase liberada", async () => {
    mocks.etapaFindUnique.mockResolvedValue({ id: "de1", status: "aprovado", liberadaEm: new Date(), percentual: 40 });
    const r = await salvarEtapaDisciplina({ disciplinaId: "d1", etapaId: "f1", percentual: 50 });
    expect(r).toEqual({ ok: false, error: "O pagamento desta fase já foi liberado — o percentual dela está fixado." });
    expect(mocks.etapaUpsert).not.toHaveBeenCalled();
  });

  it("fase liberada ainda aceita mudar o prazo (mesmo percentual)", async () => {
    mocks.etapaFindUnique.mockResolvedValue({ id: "de1", status: "aprovado", liberadaEm: new Date(), percentual: 40 });
    mocks.etapaUpsert.mockResolvedValue({ id: "de1" });
    mocks.sincronizarPrazoDisciplina.mockResolvedValue("2026-12-01");
    const r = await salvarEtapaDisciplina({ disciplinaId: "d1", etapaId: "f1", percentual: 40, prazo: "2026-12-01", status: "aprovado" });
    expect(r.ok).toBe(true);
    expect(mocks.etapaUpsert).toHaveBeenCalled();
  });

  it("não remove fase liberada", async () => {
    mocks.etapaFindUnique.mockResolvedValue({ disciplinaId: "d1", liberadaEm: new Date(), disciplina: { projetoId: "p1" } });
    const r = await excluirEtapaDisciplina({ id: "de1" });
    expect(r).toEqual({ ok: false, error: "Esta fase já teve o pagamento liberado — não pode ser removida." });
    expect(mocks.etapaDelete).not.toHaveBeenCalled();
  });
});
