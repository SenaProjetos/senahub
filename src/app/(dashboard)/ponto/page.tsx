import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { estadoDoDia, projetosDoUsuario, espelhoMes, ajustesPendentesCiencia } from "@/modules/ponto/queries";
import { rateioMesGestor } from "@/modules/rh/rateio/queries";
import { PontoView } from "@/components/ponto/ponto-view";

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

  return (
    <PontoView
      estadoDia={estadoDia}
      projetos={projetos}
      espelho={espelho}
      rateio={rateio}
      ano={ano}
      mes={mes}
      pendencias={pendencias}
    />
  );
}
