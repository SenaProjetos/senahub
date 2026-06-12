import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { minhasSolicitacoes, humorHoje } from "@/modules/rh/queries";
import { RhView } from "@/components/rh/rh-view";

export const metadata: Metadata = { title: "RH" };

export default async function RhPage() {
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
    "freelancer",
  );
  const [{ abonos, ferias }, humor] = await Promise.all([
    minhasSolicitacoes(user.id),
    humorHoje(user.id),
  ]);
  return (
    <RhView
      abonos={abonos.map((a) => ({
        id: a.id,
        dataInicio: a.dataInicio,
        dataFim: a.dataFim,
        status: a.status,
        atestadoPath: a.atestadoPath,
      }))}
      ferias={ferias.map((f) => ({ id: f.id, inicio: f.inicio, fim: f.fim, status: f.status }))}
      humorAtual={humor?.humor ?? null}
    />
  );
}
