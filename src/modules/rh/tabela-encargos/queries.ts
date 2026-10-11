import "server-only";
import { prisma } from "@/lib/prisma";
import {
  CONTRATACOES_COM_ENCARGOS, parametrosEncargosSchema, resumoParametros,
  type ContratacaoComEncargos, type ParametrosEncargos,
} from "@/modules/rh/rateio/custo-hora/parametros";
import { motivoParaNaoExcluirVersao } from "@/modules/rh/tabela-encargos/regras";

export async function listarTabelasEncargos() {
  const [rows, fechados] = await Promise.all([
    prisma.tabelaEncargos.findMany({ orderBy: [{ contratacao: "asc" }, { vigenciaEm: "desc" }] }),
    prisma.fechamentoRateio.findMany({ where: { calculo: "v2" }, select: { ano: true, mes: true } }),
  ]);
  const mesesFechadosV2 = fechados.map((f) => `${f.ano}-${String(f.mes).padStart(2, "0")}`);
  const mes = (d: Date) => d.toISOString().slice(0, 7);
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
      /** Mesmo texto do erro da ação; `null` = pode excluir. */
      motivoNaoExcluir: motivoParaNaoExcluirVersao({
        vigencia: mes(r.vigenciaEm),
        vigenciasDaContratacao: rows.filter((x) => x.contratacao === r.contratacao).map((x) => mes(x.vigenciaEm)),
        mesesFechadosV2,
      }),
    }];
  });
}

/** Estagiários com vínculo ativo, para marcar quem é pelo agente de integração. */
export async function listarEstagiariosAtivos() {
  const vs = await prisma.vinculo.findMany({
    where: { contratacao: "estagio", ativo: true },
    select: { id: true, agenteIntegracao: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return vs.map((v) => ({ vinculoId: v.id, nome: v.user.name, agenteIntegracao: v.agenteIntegracao }));
}
