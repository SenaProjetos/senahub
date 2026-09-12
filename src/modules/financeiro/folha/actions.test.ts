import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D39: as guardas de `corrigirPagamentoEfetivado` (F11) e `estornarPagamentoEfetivado`
 * (F12) — pagamento já efetivado, lançamento conciliado, baixa parcial — só eram
 * exercitadas por scripts `_tmp-verificar-*.ts` apagados ao fim de cada fase. Este arquivo
 * fixa essa cobertura: mocka sessão/permissão/Prisma/notificação (mesmo padrão de
 * `rh/pessoas/queries.test.ts`) e testa o CONTROLE da action — bloqueio antes de qualquer
 * escrita, e o caminho feliz — não a regra pura em si (`erroCorrecaoEfetivado` etc. já têm
 * testes próprios em `service.test.ts`).
 *
 * Limite do mock: `$transaction: (fn) => fn(tx)` executa o corpo da transação mas não
 * desfaz nada se algo no meio falhar — isso é responsabilidade do Postgres/Prisma de
 * verdade, não da action. O que os testes de `count === 0` provam é que a action CHECA o
 * `.count` e recusa antes de seguir — não que um rollback real acontece nesse caso (isso já
 * foi verificado por scripts de banco em fases anteriores desta sessão, contra o dev real).
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  notificar: vi.fn(),
  notificarMuitos: vi.fn(),
  revalidatePath: vi.fn(),
  recalcularTotalFolha: vi.fn(),
  sincronizarValorDisciplina: vi.fn(),
  confirmarDespesaProjetista: vi.fn(),
  criarDespesaProjetistaPrevista: vi.fn(),
  removerArquivo: vi.fn(),
  pagamentoFindUnique: vi.fn(),
  pagamentoUpdateMany: vi.fn(),
  lancamentoFindFirst: vi.fn(),
  lancamentoUpdateMany: vi.fn(),
  lancamentoStatusHistoricoCreate: vi.fn(),
  contaFindUnique: vi.fn(),
  formaFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/notificar", () => ({ notificar: mocks.notificar, notificarMuitos: mocks.notificarMuitos }));
vi.mock("@/lib/storage", () => ({ removerArquivo: mocks.removerArquivo }));
vi.mock("@/modules/financeiro/custo/lancamento-custo", () => ({
  confirmarDespesaProjetista: mocks.confirmarDespesaProjetista,
  criarDespesaProjetistaPrevista: mocks.criarDespesaProjetistaPrevista,
}));
vi.mock("@/modules/uploads/pagamento", () => ({ sincronizarValorDisciplina: mocks.sincronizarValorDisciplina }));
vi.mock("@/modules/financeiro/folha-lote/service", () => ({ recalcularTotalFolha: mocks.recalcularTotalFolha }));

// `tx` reusa os MESMOS mocks de `prisma` (findFirst/updateMany) — as actions chamam
// `lancamentoDoPagamento` tanto fora da transação (`capturarAntes`, com `prisma`) quanto
// dentro (com `tx`); os dois têm de responder igual pro mesmo `where`.
const tx = {
  lancamento: { findFirst: mocks.lancamentoFindFirst, updateMany: mocks.lancamentoUpdateMany },
  contaBancaria: { findUnique: mocks.contaFindUnique },
  formaPagamento: { findUnique: mocks.formaFindUnique },
  pagamentoProjetista: { updateMany: mocks.pagamentoUpdateMany },
  lancamentoStatusHistorico: { create: mocks.lancamentoStatusHistoricoCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pagamentoProjetista: { findUnique: mocks.pagamentoFindUnique, updateMany: mocks.pagamentoUpdateMany },
    lancamento: { findFirst: mocks.lancamentoFindFirst },
    $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
  },
}));

const { corrigirPagamentoEfetivado, estornarPagamentoEfetivado } = await import("./actions");

const USER = { id: "u1", role: "admin", ativo: true, mustChangePassword: false };

function sessionOk() {
  mocks.getSession.mockResolvedValue({ user: USER });
}

const PAGAMENTO_PAGO = {
  id: "pag1",
  status: "pago",
  lancamentoId: "lanc1",
  folhaId: null,
  disciplinaId: "disc1",
  projetistaId: "proj1",
  valor: 1000,
  pagoEm: new Date("2026-04-05T00:00:00.000Z"),
};

const LANCAMENTO_CONFIRMADO = {
  id: "lanc1",
  status: "confirmado",
  valor: 1000,
  valorEfetivo: null,
  contaId: "conta1",
  formaId: "forma1",
  dataConfirmacao: new Date("2026-04-05T00:00:00.000Z"),
  transacao: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionOk();
  mocks.can.mockResolvedValue(true);
  mocks.getClientIp.mockResolvedValue(null);
  mocks.logAudit.mockResolvedValue(undefined);
});

describe("corrigirPagamentoEfetivado", () => {
  const input = {
    id: "pag1",
    valor: 1000,
    contaId: "conta1",
    formaId: "forma1",
    data: "2026-04-05",
    justificativa: "Valor lançado errado, corrigindo conforme recibo.",
  };

  it("sem permissão folha_pj_corrigir: bloqueia antes de tocar no banco", async () => {
    mocks.can.mockResolvedValue(false);

    const r = await corrigirPagamentoEfetivado(input);

    expect(r).toEqual({ ok: false, error: "Sem permissão." });
    expect(mocks.pagamentoFindUnique).not.toHaveBeenCalled();
    expect(mocks.pagamentoUpdateMany).not.toHaveBeenCalled();
  });

  it("pagamento pendente (não pago): recusa sem escrever nada", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue({ ...PAGAMENTO_PAGO, status: "pendente" });
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);

    const r = await corrigirPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/já efetivado é corrigido/);
    expect(mocks.pagamentoUpdateMany).not.toHaveBeenCalled();
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
  });

  it("lançamento conciliado com valor divergente: recusa (erroCorrecaoConciliada) sem escrever", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue({
      ...LANCAMENTO_CONFIRMADO,
      transacao: { id: "trans1", valor: 1450, contaId: "conta1", data: new Date("2026-04-05T00:00:00.000Z") },
    });
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });

    // input pede 1000, mas o extrato (transacao) diz 1450 — tem de bater com o extrato.
    const r = await corrigirPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/conciliado com o extrato/);
    expect(mocks.pagamentoUpdateMany).not.toHaveBeenCalled();
  });

  it("caminho feliz: atualiza pagamento e lançamento, notifica só quando valor muda (G8)", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 1 });

    const r = await corrigirPagamentoEfetivado({ ...input, valor: 1200 }); // valor mudou: 1000 -> 1200

    expect(r).toEqual({ ok: true, data: { id: "pag1" } });
    expect(mocks.can).toHaveBeenCalledWith(USER, "financeiro", "folha_pj_corrigir");
    expect(mocks.pagamentoUpdateMany).toHaveBeenCalledWith({
      where: { id: "pag1", status: "pago" },
      data: { valor: 1200, pagoEm: new Date("2026-04-05") },
    });
    // A MESMA guarda repetida na escrita (não só na leitura que já decidiu "sem conflito") —
    // livre continua livre (`transacao: { is: null }`) na hora de gravar, senão uma
    // conciliação no meio do caminho passaria batido. Apagar essa cláusula da action não
    // pode deixar este teste verde.
    expect(mocks.lancamentoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "lanc1", status: "confirmado", transacao: { is: null } }),
      }),
    );
    expect(mocks.notificar).toHaveBeenCalledTimes(1);
    expect(mocks.notificar).toHaveBeenCalledWith(
      "proj1",
      expect.objectContaining({ titulo: "Pagamento corrigido" }),
      { categoria: "pagamento" },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/financeiro/folha-projetistas");
  });

  it("caminho feliz sem mudar valor/data: não notifica (G8 — só conta/forma/observação não notificam)", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 1 });

    const r = await corrigirPagamentoEfetivado(input); // mesmo valor (1000) e mesma data (2026-04-05)

    expect(r.ok).toBe(true);
    expect(mocks.notificar).not.toHaveBeenCalled();
  });

  it("conciliado BATENDO com o extrato: passa, e pagoEm/dataConfirmacao vêm da transação (G1a), não do formulário", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    // Data da transação (07/04) DIFERENTE da data do input (05/04) — discrimina de propósito:
    // se a action ignorasse a transação e usasse a data do formulário, este teste pegaria.
    mocks.lancamentoFindFirst.mockResolvedValue({
      ...LANCAMENTO_CONFIRMADO,
      transacao: { id: "trans1", valor: 1000, contaId: "conta1", data: new Date("2026-04-07T00:00:00.000Z") },
    });
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 1 });

    const r = await corrigirPagamentoEfetivado(input); // valor 1000 bate com a transação

    expect(r.ok).toBe(true);
    expect(mocks.pagamentoUpdateMany).toHaveBeenCalledWith({
      where: { id: "pag1", status: "pago" },
      data: { valor: 1000, pagoEm: new Date("2026-04-07T00:00:00.000Z") },
    });
    expect(mocks.lancamentoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ transacao: { is: { id: "trans1" } } }),
        data: expect.objectContaining({ dataConfirmacao: new Date("2026-04-07T00:00:00.000Z") }),
      }),
    );
  });

  it("reserva.count === 0: pagamento mudou no meio do caminho, recusa sem seguir adiante", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 0 });

    const r = await corrigirPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mudou enquanto a tela estava aberta/);
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
  });

  it("atualizado.count === 0: lançamento mudou no meio do caminho, recusa mesmo com o pagamento já reservado", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.contaFindUnique.mockResolvedValue({ id: "conta1" });
    mocks.formaFindUnique.mockResolvedValue({ id: "forma1" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 0 });

    const r = await corrigirPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lançamento mudou enquanto a tela estava aberta/);
  });
});

describe("estornarPagamentoEfetivado", () => {
  const input = { id: "pag1", justificativa: "Pago para a pessoa errada por engano." };

  it("sem permissão folha_pj_corrigir: bloqueia antes de tocar no banco", async () => {
    mocks.can.mockResolvedValue(false);

    const r = await estornarPagamentoEfetivado(input);

    expect(r).toEqual({ ok: false, error: "Sem permissão." });
    expect(mocks.pagamentoFindUnique).not.toHaveBeenCalled();
  });

  it("lançamento conciliado: recusa o estorno sem cancelar nada", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue({
      ...LANCAMENTO_CONFIRMADO,
      transacao: { id: "trans1", valor: 1000, contaId: "conta1", data: new Date() },
    });

    const r = await estornarPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/conciliado com o extrato/);
    expect(mocks.pagamentoUpdateMany).not.toHaveBeenCalled();
    expect(mocks.lancamentoStatusHistoricoCreate).not.toHaveBeenCalled();
  });

  it("caminho feliz: cancela pagamento e lançamento, recalcula lote e sincroniza disciplina", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue({ ...PAGAMENTO_PAGO, folhaId: "lote1" });
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 1 });

    const r = await estornarPagamentoEfetivado(input);

    expect(r).toEqual({ ok: true, data: { id: "pag1" } });
    expect(mocks.can).toHaveBeenCalledWith(USER, "financeiro", "folha_pj_corrigir");
    expect(mocks.pagamentoUpdateMany).toHaveBeenCalledWith({
      where: { id: "pag1", status: "pago" },
      data: { status: "cancelado", folhaId: null },
    });
    // A MESMA guarda repetida na escrita: `transacao: { is: null }` na hora de cancelar o
    // lançamento — se conciliarem entre a leitura e aqui, o update tem de achar 0 linhas em
    // vez de apagar do caixa uma saída que o banco já registrou. Remover essa cláusula da
    // action não pode deixar este teste verde.
    expect(mocks.lancamentoUpdateMany).toHaveBeenCalledWith({
      where: { id: "lanc1", status: { not: "cancelado" }, excluidoEm: null, transacao: { is: null } },
      data: { status: "cancelado" },
    });
    expect(mocks.lancamentoStatusHistoricoCreate).toHaveBeenCalledWith({
      data: { lancamentoId: "lanc1", de: "confirmado", para: "cancelado", autorId: "u1" },
    });
    expect(mocks.recalcularTotalFolha).toHaveBeenCalledWith(tx, "lote1");
    expect(mocks.sincronizarValorDisciplina).toHaveBeenCalledWith(tx, "disc1");
  });

  it("lançamento já cancelado: não repete o cancelamento nem o histórico (estado que a action existe para limpar)", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue({ ...LANCAMENTO_CONFIRMADO, status: "cancelado" });
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });

    const r = await estornarPagamentoEfetivado(input);

    expect(r.ok).toBe(true);
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
    expect(mocks.lancamentoStatusHistoricoCreate).not.toHaveBeenCalled();
  });

  it("reserva.count === 0: pagamento mudou no meio do caminho, recusa sem cancelar o lançamento", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 0 });

    const r = await estornarPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mudou enquanto a tela estava aberta/);
    expect(mocks.lancamentoUpdateMany).not.toHaveBeenCalled();
  });

  it("cancelado.count === 0: lançamento foi conciliado/editado no meio do caminho, recusa e não grava histórico", async () => {
    mocks.pagamentoFindUnique.mockResolvedValue(PAGAMENTO_PAGO);
    mocks.lancamentoFindFirst.mockResolvedValue(LANCAMENTO_CONFIRMADO);
    mocks.pagamentoUpdateMany.mockResolvedValue({ count: 1 });
    mocks.lancamentoUpdateMany.mockResolvedValue({ count: 0 });

    const r = await estornarPagamentoEfetivado(input);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/lançamento mudou enquanto a tela estava aberta/);
    expect(mocks.lancamentoStatusHistoricoCreate).not.toHaveBeenCalled();
  });
});
