import type { Metadata } from "next";
import { requireGestorRh } from "@/lib/session";

import { listarPessoasJuridicas, projetistasParaPJ } from "@/modules/rh/pessoas-juridicas/queries";
import { PessoasJuridicasView } from "@/components/rh/pessoas-juridicas-view";

export const metadata: Metadata = { title: "Pessoas Jurídicas" };

export default async function PessoasJuridicasPage() {
  await requireGestorRh();
  const [pjs, projetistas] = await Promise.all([listarPessoasJuridicas(), projetistasParaPJ()]);
  return <PessoasJuridicasView pjs={pjs} projetistas={projetistas} />;
}
