import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { estadoDoDia, projetosDoUsuario, espelhoMes, ajustesPendentesCiencia } from "@/modules/ponto/queries";
import { rateioMesGestor } from "@/modules/rh/rateio/queries";
import { CLT_ROLES } from "@/lib/roles";
import { disciplinasEscreviveisNoProjeto, type DisciplinaEscrevivel } from "@/modules/projetos/diario/queries";
import { PontoView } from "@/components/ponto/ponto-view";
import { PontoSubnav } from "@/components/ponto/ponto-subnav";

export const metadata: Metadata = { title: "Ponto" };

export default async function PontoPage() {
  // Ponto é autoatendimento de todos os internos (cliente fora).
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
    "freelancer",
  );

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const [estadoDia, projetos, espelho, pendencias, podeRatear] = await Promise.all([
    estadoDoDia(user.id),
    projetosDoUsuario(user.id),
    espelhoMes(user.id, ano, mes),
    ajustesPendentesCiencia(user.id),
    can(user.role, "ponto", "rateio"),
  ]);

  const rateio = podeRatear ? await rateioMesGestor(ano, mes) : null;

  // Atalho "registrar no diário" — um lookup por projeto distinto que aparece
  // em alguma abertura de bloco na timeline de hoje (é sempre o próprio ponto).
  const diarioPorProjeto: Record<string, DisciplinaEscrevivel[]> = {};
  const projetoIds = new Set<string>();
  for (const item of estadoDia.timeline) {
    if ((item.kind === "entrada" || item.kind === "fim_descanso" || item.kind === "troca") && item.projetoId) {
      projetoIds.add(item.projetoId);
    }
  }
  const entradasDiario = await Promise.all(
    [...projetoIds].map(async (pid) => [pid, await disciplinasEscreviveisNoProjeto(user, pid)] as const),
  );
  for (const [pid, discs] of entradasDiario) if (discs.length > 0) diarioPorProjeto[pid] = discs;

  return (
    <div className="space-y-4">
      <PontoSubnav />
      <PontoView
        estadoDia={estadoDia}
        projetos={projetos}
        espelho={espelho}
        rateio={rateio}
        ano={ano}
        mes={mes}
        pendencias={pendencias}
        diarioPorProjeto={diarioPorProjeto}
        controlaJornada={CLT_ROLES.includes(user.role)}
      />
    </div>
  );
}
