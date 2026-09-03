import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { pisoDeSocio } from "@/modules/permissoes/queries";
import { PisoSocioView } from "@/components/configuracoes/piso-socio-view";

export const metadata: Metadata = { title: "Piso de sócio" };

// Rota mantida (`/configuracoes/permissoes`) para não quebrar link salvo nem histórico de
// auditoria; o conteúdo é que deixou de ser a matriz — ver `piso-socio-view.tsx`.
export default async function PisoSocioPage() {
  await requireRole("admin", "supervisor", "administrativo");
  const { pares, socios } = await pisoDeSocio();
  return <PisoSocioView pares={pares} socios={socios} />;
}
