import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { holeritesPendentesDeAssinatura } from "@/modules/rh/folha/queries";
import { AssinarHoleriteFila } from "@/components/rh/assinar-holerite-fila";

export const metadata: Metadata = { title: "Assinar holerite" };

export default async function AssinarHoleritePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Mesma cadeia do /termo, e na mesma ordem do (dashboard)/layout.tsx: sem isso dá pra chegar
  // aqui direto pela URL e assinar antes de trocar a senha ou aceitar o termo.
  if (session.user.mustChangePassword) redirect("/trocar-senha");
  if (await precisaAceitarTermo(session.user)) redirect("/termo");

  const pendentes = await holeritesPendentesDeAssinatura(session.user);
  if (pendentes.length === 0) redirect("/");

  return <AssinarHoleriteFila pendentes={pendentes} />;
}
