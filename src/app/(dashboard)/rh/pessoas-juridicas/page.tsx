import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { listarPessoasJuridicas, projetistasParaPJ } from "@/modules/rh/pessoas-juridicas/queries";
import { PessoasJuridicasView } from "@/components/rh/pessoas-juridicas-view";

export const metadata: Metadata = { title: "Pessoas Jurídicas" };

export default async function PessoasJuridicasPage() {
  await requireRole(...HR_ADMIN_ROLES);
  const [pjs, projetistas] = await Promise.all([listarPessoasJuridicas(), projetistasParaPJ()]);
  return <PessoasJuridicasView pjs={pjs} projetistas={projetistas} />;
}
