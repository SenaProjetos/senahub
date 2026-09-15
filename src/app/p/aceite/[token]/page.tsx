import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AceitePublicoForm } from "@/components/uploads/aceite-publico-form";
import { linkAceiteEstaAtivo } from "@/modules/uploads/aceite";
import { metadataPublica } from "@/lib/metadata-publica";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";

export const metadata: Metadata = {
  ...metadataPublica({
    titulo: "Aceite de entrega",
    descricao: "Confirme o recebimento da entrega.",
  }),
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

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
      expiraEm: true,
      revogadoEm: true,
      respondidoEm: true,
      observacao: true,
      upload: {
        select: {
          nomeArquivo: true,
          pacote: true,
          createdAt: true,
          disciplina: {
            select: {
              disciplinaTextoLegado: true,
              projeto: { select: { codigo: true, nome: true } },
            },
          },
        },
      },
    },
  });
  if (!aceite) notFound();
  if (!linkAceiteEstaAtivo(aceite)) notFound();

  const { upload } = aceite;
  // Aceite só existe p/ upload validado (gerarAceiteCliente exige validado=true), e só
  // uploads de pacote A/B passam pela validação — pastaId nunca chega aqui, mas o tipo
  // de `pacote` é nullable no schema (Upload de PastaProjeto), daí a guarda.
  if (!upload.pacote) notFound();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <CabecalhoPublico
        icone={PackageCheck}
        rotulo="Aceite de entrega"
        codigo={upload.disciplina.projeto.codigo}
        titulo={upload.disciplina.projeto.nome}
        descricao="Confirme ou solicite revisão da entrega abaixo."
      />
      <AceitePublicoForm
        token={token}
        arquivo={upload.nomeArquivo}
        pacote={upload.pacote}
        disciplina={upload.disciplina.disciplinaTextoLegado}
        dataEntrega={upload.createdAt.toISOString()}
        situacaoAtual={aceite.situacao}
        respondidoEm={aceite.respondidoEm?.toISOString() ?? null}
        observacaoAnterior={aceite.observacao ?? null}
      />
    </main>
  );
}
