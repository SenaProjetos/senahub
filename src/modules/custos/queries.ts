import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, StatusCustoOrcamento } from "@/generated/prisma/client";
import { acessoGlobal, type Role } from "@/lib/roles";
import { escopoProjeto } from "@/modules/projetos/queries";
import { parseListParams } from "@/lib/list-params";
import { calcularBdi, type EntradaBdi, type ResultadoBdi } from "./bdi";
import { calcularEncargos, type OverrideEncargo, type ResultadoEncargos } from "./encargos-obra";

type Viewer = { id: string; role: Role; ehSocio?: boolean };
type RawParams = Record<string, string | string[] | undefined>;

/**
 * Escopo de leitura (D1): global (inclui sócio) vê tudo; demais veem orçamentos de projetos
 * dentro do próprio `escopoProjeto`, mais os próprios orçamentos avulsos (sem `Projeto`).
 */
export function escopoCustoOrcamento(viewer: Viewer): Prisma.CustoOrcamentoWhereInput {
  if (acessoGlobal(viewer)) return {};
  return {
    OR: [{ projeto: escopoProjeto(viewer) }, { projetoId: null, criadoPorId: viewer.id }],
  };
}

export type OrcamentoListItem = {
  id: string;
  titulo: string;
  status: string;
  projetoId: string | null;
  projetoCodigo: string | null;
  projetoNome: string | null;
  nomeAvulso: string | null;
  dataBase: Date;
  bdiPercentual: number | null;
  criadoPorNome: string;
  createdAt: Date;
};

const SORT_FIELDS = ["titulo", "dataBase", "status", "createdAt"] as const;

/** Lista paginada de orçamentos, com escopo de acesso e filtros por texto/status/projeto. */
export async function listarOrcamentos(
  sp: RawParams,
  viewer: Viewer,
  filtros?: { status?: StatusCustoOrcamento; projetoId?: string },
): Promise<{ itens: OrcamentoListItem[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, skip, take, sort, dir, q } = parseListParams(sp, {
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultDir: "desc",
  });

  const where: Prisma.CustoOrcamentoWhereInput = {
    AND: [
      escopoCustoOrcamento(viewer),
      filtros?.status ? { status: filtros.status } : {},
      filtros?.projetoId ? { projetoId: filtros.projetoId } : {},
      q
        ? {
            OR: [
              { titulo: { contains: q, mode: "insensitive" } },
              { nomeAvulso: { contains: q, mode: "insensitive" } },
              { projeto: { nome: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };

  const [registros, total] = await Promise.all([
    prisma.custoOrcamento.findMany({
      where,
      orderBy: sort ? { [sort]: dir } : { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        titulo: true,
        status: true,
        projetoId: true,
        nomeAvulso: true,
        dataBase: true,
        bdiPercentual: true,
        createdAt: true,
        projeto: { select: { codigo: true, nome: true } },
        criadoPor: { select: { name: true } },
      },
    }),
    prisma.custoOrcamento.count({ where }),
  ]);

  const itens: OrcamentoListItem[] = registros.map((r) => ({
    id: r.id,
    titulo: r.titulo,
    status: r.status,
    projetoId: r.projetoId,
    projetoCodigo: r.projeto?.codigo ?? null,
    projetoNome: r.projeto?.nome ?? null,
    nomeAvulso: r.nomeAvulso,
    dataBase: r.dataBase,
    bdiPercentual: r.bdiPercentual !== null ? Number(r.bdiPercentual) : null,
    criadoPorNome: r.criadoPor.name,
    createdAt: r.createdAt,
  }));

  return { itens, total, page, pageSize };
}

/** Orçamentos de um projeto específico (aba "Custos"), já com o escopo de acesso aplicado. */
export async function orcamentosDoProjeto(projetoId: string, viewer: Viewer): Promise<OrcamentoListItem[]> {
  const { itens } = await listarOrcamentos({}, viewer, { projetoId });
  return itens;
}

export type OrcamentoDetalhe = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  projetoId: string | null;
  projetoCodigo: string | null;
  projetoNome: string | null;
  nomeAvulso: string | null;
  contratanteId: string | null;
  contratanteNome: string | null;
  contratanteCadastradoNome: string | null;
  dataBase: Date;
  regimeEncargos: string;
  encargosPreset: string;
  entradaBdi: EntradaBdi;
  bdi: ResultadoBdi;
  encargos: ResultadoEncargos;
  criadoPorNome: string;
  createdAt: Date;
  updatedAt: Date;
};

function entradaBdiDoRegistro(r: {
  bdiAdmCentral: Prisma.Decimal;
  bdiSeguro: Prisma.Decimal;
  bdiRisco: Prisma.Decimal;
  bdiGarantia: Prisma.Decimal;
  bdiDespesasFinanceiras: Prisma.Decimal;
  bdiLucro: Prisma.Decimal;
  bdiPis: Prisma.Decimal;
  bdiCofins: Prisma.Decimal;
  bdiIss: Prisma.Decimal;
  bdiCprb: Prisma.Decimal;
}): EntradaBdi {
  return {
    admCentral: Number(r.bdiAdmCentral),
    seguro: Number(r.bdiSeguro),
    risco: Number(r.bdiRisco),
    garantia: Number(r.bdiGarantia),
    despesasFinanceiras: Number(r.bdiDespesasFinanceiras),
    lucro: Number(r.bdiLucro),
    pis: Number(r.bdiPis),
    cofins: Number(r.bdiCofins),
    iss: Number(r.bdiIss),
    cprb: Number(r.bdiCprb),
  };
}

/** Abre um orçamento (com escopo) e devolve o cabeçalho + BDI/encargos recalculados na hora. */
export async function obterOrcamento(id: string, viewer: Viewer): Promise<OrcamentoDetalhe | null> {
  const registro = await prisma.custoOrcamento.findFirst({
    where: { AND: [{ id }, escopoCustoOrcamento(viewer)] },
    include: {
      projeto: { select: { codigo: true, nome: true } },
      contratante: { select: { nome: true } },
      criadoPor: { select: { name: true } },
    },
  });
  if (!registro) return null;

  const entradaBdi = entradaBdiDoRegistro(registro);
  const bdi = calcularBdi(entradaBdi);

  const overrides = (registro.encargosOverridesJson as OverrideEncargo[] | null) ?? undefined;
  const encargos = calcularEncargos({
    regime: registro.regimeEncargos,
    overrides,
  });

  return {
    id: registro.id,
    titulo: registro.titulo,
    descricao: registro.descricao,
    status: registro.status,
    projetoId: registro.projetoId,
    projetoCodigo: registro.projeto?.codigo ?? null,
    projetoNome: registro.projeto?.nome ?? null,
    nomeAvulso: registro.nomeAvulso,
    contratanteId: registro.contratanteId,
    contratanteNome: registro.contratanteNome,
    contratanteCadastradoNome: registro.contratante?.nome ?? null,
    dataBase: registro.dataBase,
    regimeEncargos: registro.regimeEncargos,
    encargosPreset: registro.encargosPreset,
    entradaBdi,
    bdi,
    encargos,
    criadoPorNome: registro.criadoPor.name,
    createdAt: registro.createdAt,
    updatedAt: registro.updatedAt,
  };
}
