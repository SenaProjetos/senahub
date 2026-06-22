import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AceitePublicoForm } from "@/components/uploads/aceite-publico-form";

export const metadata: Metadata = { title: "Aceite de entrega", robots: { index: false } };

export default async function AceitePublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const aceite = await prisma.aceiteCliente.findUnique({
    where: { token },
    select: {
      situacao: true,
      respondidoEm: true,
      observacao: true,
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          createdAt: true,
          disciplina: {
            select: {
              nome: true,
              projeto: { select: { codigo: true, nome: true } },
            },
          },
        },
      },
    },
  });
  if (!aceite) notFound();

  const { upload } = aceite;
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="mb-6">
        <p className="font-mono text-xs text-muted-foreground">{upload.disciplina.projeto.codigo}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{upload.disciplina.projeto.nome}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confirme ou solicite revisão da entrega abaixo.
        </p>
      </div>
      <AceitePublicoForm
        token={token}
        arquivo={upload.nomeArquivo}
        pacote={upload.pacote}
        disciplina={upload.disciplina.nome}
        dataEntrega={upload.createdAt.toISOString()}
        situacaoAtual={aceite.situacao}
        respondidoEm={aceite.respondidoEm?.toISOString() ?? null}
        observacaoAnterior={aceite.observacao ?? null}
      />
    </main>
  );
}
