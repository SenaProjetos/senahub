import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vínculo de código de rubrica e de matrícula (P2). O que importa aqui é o CONSERTO: apontar o
 * código pra rubrica errada tem que ter volta pela tela, senão o código fica preso na rubrica
 * errada — o import recusa para sempre e só sobra mexer no banco à mão.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  can: vi.fn(),
  logAudit: vi.fn(),
  getClientIp: vi.fn(),
  revalidatePath: vi.fn(),
  rubricaFindUnique: vi.fn(),
  rubricaUpdate: vi.fn(),
  rubricaCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  matriculaIgnoradaDeleteManyTx: vi.fn(),
  matriculaIgnoradaUpsert: vi.fn(),
  matriculaIgnoradaDeleteMany: vi.fn(),
}));

const tx = {
  rubricaFolha: { update: mocks.rubricaUpdate, create: mocks.rubricaCreate },
  user: { update: mocks.userUpdate },
  matriculaExternaIgnorada: { deleteMany: mocks.matriculaIgnoradaDeleteManyTx },
};

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, getClientIp: mocks.getClientIp }));
vi.mock("@/lib/mail", () => ({ smtpConfigurado: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ enviarEmailTemplate: vi.fn() }));
vi.mock("@/modules/rh/encargos/queries", () => ({ faixasPorTipo: vi.fn(), deducaoDependente: vi.fn() }));
vi.mock("@/modules/rh/funcionarios/queries", () => ({ dependentesPorUsuario: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rubricaFolha: { findUnique: mocks.rubricaFindUnique },
    user: { findUnique: mocks.userFindUnique },
    matriculaExternaIgnorada: { upsert: mocks.matriculaIgnoradaUpsert, deleteMany: mocks.matriculaIgnoradaDeleteMany },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { vincularRubricaExterna, vincularMatriculaExterna, ignorarMatriculaExterna, designorarMatriculaExterna } =
  await import("./actions");

const ADMIN = { id: "admin-1", role: "admin", name: "Admin", ativo: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user: ADMIN });
  mocks.can.mockResolvedValue(true);
  mocks.getClientIp.mockResolvedValue(null);
  mocks.rubricaFindUnique.mockResolvedValue(null);
  mocks.userFindUnique.mockResolvedValue(null);
});

describe("vincularRubricaExterna", () => {
  it("vincula o código a uma rubrica existente", async () => {
    mocks.rubricaUpdate.mockResolvedValue({ id: "r1", nome: "INSS" });
    const r = await vincularRubricaExterna({ codigoExterno: "903", rubricaId: "r1" });
    expect(r.ok).toBe(true);
    expect(mocks.rubricaUpdate).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { codigoExterno: "903" },
      select: { id: true, nome: true },
    });
  });

  it("cria rubrica nova quando o código não corresponde a nenhuma existente", async () => {
    mocks.rubricaCreate.mockResolvedValue({ id: "r-novo", nome: "Diferença salarial" });
    const r = await vincularRubricaExterna({
      codigoExterno: "081",
      nome: "Diferença salarial",
      tipo: "provento",
    });
    expect(r.ok).toBe(true);
    expect(mocks.rubricaCreate).toHaveBeenCalledWith({
      data: { nome: "Diferença salarial", tipo: "provento", codigoExterno: "081" },
      select: { id: true, nome: true },
    });
  });

  it("MOVE o código quando ele já estava na rubrica errada (o conserto tem que existir)", async () => {
    mocks.rubricaFindUnique.mockResolvedValue({ id: "r-errada", nome: "Faltas" });
    mocks.rubricaUpdate.mockResolvedValue({ id: "r-certa", nome: "Bonificação" });
    const r = await vincularRubricaExterna({ codigoExterno: "081", rubricaId: "r-certa" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.desvinculadaDe).toBe("Faltas");
    // Solta a antiga ANTES de gravar a nova — o código é unique no banco.
    expect(mocks.rubricaUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "r-errada" },
      data: { codigoExterno: null },
    });
    expect(mocks.rubricaUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "r-certa" },
      data: { codigoExterno: "081" },
      select: { id: true, nome: true },
    });
  });

  it("move o código de uma rubrica existente para uma rubrica NOVA", async () => {
    mocks.rubricaFindUnique.mockResolvedValue({ id: "r-errada", nome: "Faltas" });
    mocks.rubricaCreate.mockResolvedValue({ id: "r-novo", nome: "Diferença salarial" });
    const r = await vincularRubricaExterna({
      codigoExterno: "081",
      nome: "Diferença salarial",
      tipo: "provento",
    });
    expect(r.ok).toBe(true);
    expect(mocks.rubricaUpdate).toHaveBeenCalledWith({
      where: { id: "r-errada" },
      data: { codigoExterno: null },
    });
    expect(mocks.rubricaCreate).toHaveBeenCalled();
  });

  it("recusa vincular a uma rubrica existente E criar outra ao mesmo tempo", async () => {
    const r = await vincularRubricaExterna({
      codigoExterno: "081",
      rubricaId: "r1",
      nome: "Outra",
      tipo: "provento",
    });
    expect(r.ok).toBe(false);
  });
});

describe("vincularMatriculaExterna", () => {
  it("vincula a matrícula à pessoa", async () => {
    mocks.userUpdate.mockResolvedValue({ id: "u1", name: "Fulana" });
    const r = await vincularMatriculaExterna({ matriculaExterna: "000003", userId: "u1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.desvinculadaDe).toBeNull();
  });

  it("MOVE a matrícula quando estava na pessoa errada, e diz de quem saiu", async () => {
    // Pior erro do mapeamento: salário de uma pessoa cair na ficha de outra. Precisa ter
    // conserto pela tela, e a tela precisa mostrar de quem saiu.
    mocks.userFindUnique.mockResolvedValue({ id: "u-errado", name: "Ciclano" });
    mocks.userUpdate.mockResolvedValue({ id: "u-certo", name: "Fulana" });
    const r = await vincularMatriculaExterna({ matriculaExterna: "000003", userId: "u-certo" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.desvinculadaDe).toBe("Ciclano");
    expect(mocks.userUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "u-errado" },
      data: { matriculaFolhaExterna: null },
    });
  });

  it("revincular à MESMA pessoa não desvincula ninguém", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", name: "Fulana" });
    mocks.userUpdate.mockResolvedValue({ id: "u1", name: "Fulana" });
    const r = await vincularMatriculaExterna({ matriculaExterna: "000003", userId: "u1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.desvinculadaDe).toBeNull();
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
  });

  it("vincular de verdade remove a marca de 'ignorada', se existia (a pessoa ganhou acesso)", async () => {
    mocks.userUpdate.mockResolvedValue({ id: "u1", name: "Fulana" });
    await vincularMatriculaExterna({ matriculaExterna: "000003", userId: "u1" });
    expect(mocks.matriculaIgnoradaDeleteManyTx).toHaveBeenCalledWith({
      where: { matriculaExterna: "000003" },
    });
  });
});

describe("ignorarMatriculaExterna", () => {
  it("marca a matrícula como ignorada quando ninguém está vinculado a ela", async () => {
    const r = await ignorarMatriculaExterna({ matriculaExterna: "000009", nome: "SEM ACESSO" });
    expect(r.ok).toBe(true);
    expect(mocks.matriculaIgnoradaUpsert).toHaveBeenCalledWith({
      where: { matriculaExterna: "000009" },
      create: { matriculaExterna: "000009", nome: "SEM ACESSO" },
      update: { nome: "SEM ACESSO" },
    });
  });

  it("recusa ignorar uma matrícula que já está vinculada a alguém — teria que desvincular primeiro", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", name: "Fulana" });
    const r = await ignorarMatriculaExterna({ matriculaExterna: "000003", nome: "Fulana" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/já está vinculada a "Fulana"/);
    expect(mocks.matriculaIgnoradaUpsert).not.toHaveBeenCalled();
  });

  it("ignorar de novo a mesma matrícula é idempotente (upsert, não erro de duplicata)", async () => {
    const r1 = await ignorarMatriculaExterna({ matriculaExterna: "000009", nome: "SEM ACESSO" });
    const r2 = await ignorarMatriculaExterna({ matriculaExterna: "000009", nome: "SEM ACESSO" });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});

describe("designorarMatriculaExterna", () => {
  it("remove a marca de ignorada — pessoa volta a pedir cadastro no próximo import", async () => {
    const r = await designorarMatriculaExterna({ matriculaExterna: "000009" });
    expect(r.ok).toBe(true);
    expect(mocks.matriculaIgnoradaDeleteMany).toHaveBeenCalledWith({ where: { matriculaExterna: "000009" } });
  });

  it("desfazer uma matrícula que nunca foi ignorada não é erro (deleteMany é no-op)", async () => {
    const r = await designorarMatriculaExterna({ matriculaExterna: "000000" });
    expect(r.ok).toBe(true);
  });
});
