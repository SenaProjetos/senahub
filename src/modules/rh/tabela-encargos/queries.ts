import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CONTRATACOES_COM_ENCARGOS, parametrosEncargosSchema, resumoParametros,
  type ContratacaoComEncargos, type ParametrosEncargos,
} from "@/modules/rh/rateio/custo-hora/parametros";

export async function listarTabelasEncargos() {
  const rows = await prisma.tabelaEncargos.findMany({ orderBy: [{ contratacao: "asc" }, { vigenciaEm: "desc" }] });
  return rows.flatMap((r) => {
    const p = parametrosEncargosSchema.safeParse(r.parametros);
    if (!p.success || !(CONTRATACOES_COM_ENCARGOS as readonly string[]).includes(r.contratacao)) return [];
    return [{
      id: r.id,
      contratacao: r.contratacao as ContratacaoComEncargos,
      vigencia: r.vigenciaEm.toISOString().slice(0, 7),
      resumo: resumoParametros(p.data),
      observacao: r.observacao,
      parametros: p.data as ParametrosEncargos,
    }];
  });
}

/** Estagiários com vínculo ativo, para marcar quem é pelo agente de integração. */
export async function listarEstagiariosAtivos() {
  const vs = await prisma.vinculo.findMany({
    where: { contratacao: "estagio", dataFim: null },
    select: { id: true, agenteIntegracao: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return vs.map((v) => ({ vinculoId: v.id, nome: v.user.name, agenteIntegracao: v.agenteIntegracao }));
}
