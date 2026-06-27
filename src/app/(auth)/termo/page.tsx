import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { precisaAceitarTermo } from "@/modules/legal/queries";
import { TERMOS } from "@/modules/legal/termos";
import { TermoAceiteForm } from "@/components/legal/termo-aceite-form";

export const metadata: Metadata = { title: "Termo de Uso" };

export default async function TermoPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/trocar-senha");

  const pendencia = await precisaAceitarTermo(session.user);
  if (!pendencia) redirect("/");

  const termo = TERMOS[pendencia.tipo];

  return (
    <TermoAceiteForm
      tipo={pendencia.tipo}
      versao={termo.versao}
      titulo={termo.titulo}
      conteudo={termo.conteudo}
    />
  );
}
