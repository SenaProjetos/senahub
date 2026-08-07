import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  sessaoCount: vi.fn(),
  abonoCount: vi.fn(),
  feriasCount: vi.fn(),
  documentoCount: vi.fn(),
  contaBancariaCount: vi.fn(),
  projetoFindMany: vi.fn(),
  holeriteFindMany: vi.fn(),
  usuarioOnline: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: (...args: unknown[]) => mocks.userFindMany(...args),
      findUnique: (...args: unknown[]) => mocks.userFindUnique(...args),
    },
    sessaoTrabalho: { count: (...args: unknown[]) => mocks.sessaoCount(...args) },
    abonoFalta: { count: (...args: unknown[]) => mocks.abonoCount(...args) },
    ferias: { count: (...args: unknown[]) => mocks.feriasCount(...args) },
    funcionarioDocumento: { count: (...args: unknown[]) => mocks.documentoCount(...args) },
    contaBancariaColaborador: { count: (...args: unknown[]) => mocks.contaBancariaCount(...args) },
    projeto: { findMany: (...args: unknown[]) => mocks.projetoFindMany(...args) },
    holerite: { findMany: (...args: unknown[]) => mocks.holeriteFindMany(...args) },
  },
}));
vi.mock("@/lib/socket", () => ({
  usuarioOnline: (...args: unknown[]) => mocks.usuarioOnline(...args),
}));
vi.mock("@/modules/ponto/queries", () => ({ espelhoMes: vi.fn() }));

import { fichaPessoa, holeritesDaPessoa, listarPessoas } from "./queries";

function usuarioBase() {
  return {
    id: "u1",
    name: "Ana",
    nomeCompleto: "Ana Silva",
    email: "ana@example.com",
    role: "clt",
    ativo: true,
    dataAdmissao: new Date("2026-01-02T00:00:00Z"),
    cpf: "123",
    cargo: "Engenheira",
    departamento: "Projetos",
    conselho: "CREA",
    registroProfissional: "12345",
    registroUf: "SP",
    clienteId: null,
    cliente: null,
    pj: null,
    socio: null,
  };
}

describe("Pessoa 360 — consultas de resumo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exclui somente clientes da lista e preserva perfis PJ e freelancer", async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: "pj",
        name: "Projetista",
        email: "pj@example.com",
        role: "projetista_pj",
        ativo: true,
        clienteId: null,
        pjId: "empresa-pj",
        cpf: "123",
        dataAdmissao: new Date("2026-01-01"),
        socio: null,
      },
      {
        id: "free",
        name: "Freelancer",
        email: "free@example.com",
        role: "freelancer",
        ativo: true,
        clienteId: null,
        pjId: null,
        cpf: null,
        dataAdmissao: null,
        socio: null,
      },
    ]);

    const pessoas = await listarPessoas(false);

    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: { not: "cliente" } } }),
    );
    expect(pessoas.map((p) => p.role)).toEqual(["projetista_pj", "freelancer"]);
  });

  it("não consulta nem devolve domínios sem autorização", async () => {
    mocks.userFindUnique.mockResolvedValue(usuarioBase());
    mocks.usuarioOnline.mockReturnValue(false);

    const pessoa = await fichaPessoa("u1", {
      folha: false,
      acesso: false,
      ponto: false,
      pendenciasRh: false,
      projetos: null,
    });

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    const selectBase = mocks.userFindUnique.mock.calls[0][0].select;
    expect(selectBase).not.toHaveProperty("salarioBase");
    expect(selectBase).not.toHaveProperty("mustChangePassword");
    expect(selectBase).not.toHaveProperty("setor");
    expect(selectBase).not.toHaveProperty("contratacao");
    expect(selectBase).not.toHaveProperty("createdAt");
    expect(mocks.sessaoCount).not.toHaveBeenCalled();
    expect(mocks.abonoCount).not.toHaveBeenCalled();
    expect(mocks.feriasCount).not.toHaveBeenCalled();
    expect(mocks.documentoCount).not.toHaveBeenCalled();
    expect(mocks.projetoFindMany).not.toHaveBeenCalled();
    expect(pessoa).toMatchObject({
      salarioBase: null,
      mustChangePassword: null,
      setor: null,
      contratacao: null,
      criadoEm: null,
      projetosAtivos: null,
      projetosCount: null,
      pendencias: {
        pontoEmAberto: null,
        ausencias: null,
        semDocumentos: null,
      },
    });
  });

  it("não acopla leitura de folha à leitura de acesso", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(usuarioBase())
      .mockResolvedValueOnce({ salarioBase: 5000 });
    mocks.contaBancariaCount.mockResolvedValue(1);

    const pessoa = await fichaPessoa("u1", {
      folha: true,
      acesso: false,
      ponto: false,
      pendenciasRh: false,
      projetos: null,
    });

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(2);
    expect(pessoa).toMatchObject({
      salarioBase: 5000,
      mustChangePassword: null,
      setor: null,
      contratacao: null,
      criadoEm: null,
    });
  });

  it("resume apenas dados autorizados e intersecta pessoa com escopo do observador", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(usuarioBase())
      .mockResolvedValueOnce({ salarioBase: 5000 })
      .mockResolvedValueOnce({
        mustChangePassword: true,
        setor: "engenharia",
        contratacao: "clt",
        createdAt: new Date("2026-01-01T12:00:00Z"),
      });
    mocks.contaBancariaCount.mockResolvedValue(1);
    mocks.sessaoCount.mockResolvedValue(1);
    mocks.abonoCount.mockResolvedValue(2);
    mocks.feriasCount.mockResolvedValue(1);
    mocks.documentoCount.mockResolvedValue(0);
    mocks.projetoFindMany.mockResolvedValue([
      { id: "p1", codigo: "260001", nome: "Projeto A" },
      { id: "p2", codigo: "260002", nome: "Projeto B" },
    ]);
    mocks.usuarioOnline.mockReturnValue(true);

    const pessoa = await fichaPessoa("u1", {
      folha: true,
      acesso: true,
      ponto: true,
      pendenciasRh: true,
      projetos: {
        observador: { id: "gestor", role: "administrativo", ehSocio: false },
      },
    });

    const whereProjetos = mocks.projetoFindMany.mock.calls[0][0].where;
    expect(whereProjetos.AND[1]).toEqual({
      OR: [
        { membros: { some: { userId: "u1" } } },
        { disciplinas: { some: { responsaveis: { some: { userId: "u1" } } } } },
      ],
    });
    expect(whereProjetos.AND[2]).toEqual({
      OR: [
        { membros: { some: { userId: "gestor" } } },
        { disciplinas: { some: { responsaveis: { some: { userId: "gestor" } } } } },
      ],
    });
    expect(pessoa).toMatchObject({
      online: true,
      salarioBase: 5000,
      mustChangePassword: true,
      setor: "engenharia",
      contratacao: "clt",
      projetosCount: 2,
      projetosAtivos: [
        { id: "p1", codigo: "260001", nome: "Projeto A" },
        { id: "p2", codigo: "260002", nome: "Projeto B" },
      ],
      pendencias: {
        pontoEmAberto: true,
        ausencias: 3,
        semDocumentos: true,
      },
    });
  });

  it("mantém a leitura completa do RH e totaliza o holerite", async () => {
    mocks.holeriteFindMany.mockResolvedValue([
      {
        id: "h1",
        enviadoEm: new Date("2026-07-10T12:00:00Z"),
        folha: {
          id: "f1",
          ano: 2026,
          mes: 6,
          status: "fechada",
          fechadaEm: new Date("2026-07-01T12:00:00Z"),
        },
        itens: [
          { tipo: "provento", valor: 5000 },
          { tipo: "provento", valor: 300 },
          { tipo: "desconto", valor: 850 },
        ],
      },
    ]);

    const holerites = await holeritesDaPessoa("u1");

    expect(mocks.holeriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        take: 36,
      }),
    );
    expect(holerites).toEqual([
      expect.objectContaining({
        id: "h1",
        folhaId: "f1",
        ano: 2026,
        mes: 6,
        proventos: 5300,
        descontos: 850,
        liquido: 4450,
        status: "fechada",
      }),
    ]);
  });

  it("no autoatendimento consulta estritamente folhas fechadas", async () => {
    mocks.holeriteFindMany.mockResolvedValue([]);

    await holeritesDaPessoa("u1", { somenteDisponiveis: true });

    expect(mocks.holeriteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "u1",
          folha: { status: "fechada" },
        },
      }),
    );
  });
});
