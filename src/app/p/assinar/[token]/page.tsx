import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { linkVigente } from "@/lib/link-publico";
import { formatarDataHora } from "@/lib/utils";
import { AssinaturaPublicaForm } from "@/components/juridico/assinatura-publica-form";

export const metadata: Metadata = {
  title: "Assinar documento",
  robots: { index: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

/**
 * Assinatura por link, para quem NÃO é usuário do sistema (Fase F).
 *
 * `noindex` + `no-referrer` como toda página de token: o token está na URL e não pode vazar em
 * buscador nem em cabeçalho de referência.
 */
export default async function AssinarPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await prisma.linkPublicoAssinatura.findUnique({
    where: { token },
    include: {
      aceite: true,
      versao: {
        select: {
          numero: true,
          arquivoNome: true,
          documento: { select: { titulo: true, tipo: true } },
        },
      },
    },
  });
  if (!link) notFound();
  // Regra única de vigência de todo link público do sistema (`lib/link-publico.ts`):
  // revogado (`ativo=false`) ou expirado some, sem revelar que já existiu.
  if (!linkVigente(link)) notFound();

  const doc = link.versao.documento;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-extrabold tracking-tight">{doc.titulo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Versão {link.versao.numero} · {link.versao.arquivoNome}
      </p>

      {link.aceite ? (
        <div className="mt-6 rounded-sm border border-success/40 bg-success/10 p-4 text-sm">
          <p className="font-medium text-success">Documento já assinado.</p>
          <p className="mt-1 text-muted-foreground">
            Assinado por {link.aceite.nome} em {formatarDataHora(link.aceite.assinadoEm)}.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            Hash do documento: {link.aceite.hashArquivo}
          </p>
          <a
            href={`/api/p/assinar/${token}/documento`}
            className="mt-3 inline-block text-primary underline underline-offset-2"
          >
            Baixar o documento assinado
          </a>
        </div>
      ) : (
        <AssinaturaPublicaForm token={token} nomeEsperado={link.nome} titulo={doc.titulo} versao={link.versao.numero} />
      )}
    </main>
  );
}
