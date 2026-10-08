import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { requireInterno } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { desenvolvimentoDaPessoa, liderancaAtiva } from "@/modules/rh/desenvolvimento/queries";
import { listarHabilidades } from "@/modules/rh/habilidades/queries";
import { DesenvolvimentoPessoa } from "@/components/rh/desenvolvimento-pessoa";

export const metadata: Metadata = { title: "Liderado" };

/** Um liderado: só para a liderança ATIVA dele. Quem não lidera recebe 404, sem confirmar quem existe. */
export default async function LideradoPage({ params }: { params: Promise<{ userId: string }> }) {
  const user = await requireInterno();
  const { userId } = await params;
  const lideranca = await liderancaAtiva(userId);
  if (!lideranca || lideranca.liderId !== user.id) notFound();
  const [pessoa, dados, competencias] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    desenvolvimentoDaPessoa(userId, "lider"),
    listarHabilidades(),
  ]);
  return (
    <div className="space-y-5">
      <CabecalhoPagina titulo={pessoa?.name ?? "Liderado"} descricao="Objetivos de desenvolvimento e encontros 1:1." />
      <Link href="/rh/minha-equipe" className="text-sm text-muted-foreground hover:underline">← Minha equipe</Link>
      <DesenvolvimentoPessoa userId={userId} dados={dados} papel="lider" competencias={competencias} />
    </div>
  );
}
