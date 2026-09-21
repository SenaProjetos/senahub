import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { carregarDocumentoProposta } from "@/modules/comercial/proposta-composta/documento-dados";
import { DocRender } from "@/components/documentos/doc-render";
import { DocViewport } from "@/components/documentos/doc-viewport";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Prévia da proposta" };

/**
 * Prévia interna da proposta composta — o MESMO documento que o cliente vê, mais a lista do que
 * impede a publicação. A página pública recusa documento com impedimento (o cliente não pode
 * receber plano zerado nem cláusula com lacuna); é aqui que se descobre o porquê.
 */
export default async function PreviaPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("comercial", "ver");
  const { id } = await params;
  const doc = await carregarDocumentoProposta(id);
  if (!doc) notFound();

  return (
    <div className="space-y-3">
      <div className="doc-no-print flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/comercial/propostas/${id}/compor`} />}>
          <ArrowLeft className="size-4" /> Voltar ao editor
        </Button>
        <h2 className="text-lg font-bold">
          {doc.numero} · {doc.titulo}
        </h2>
      </div>

      {doc.impedimentos.length > 0 && (
        <div className="doc-no-print space-y-1 rounded-sm border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> O cliente ainda NÃO consegue abrir esta proposta:
          </p>
          <ul className="list-inside list-disc">
            {doc.impedimentos.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {doc.modeloDeFabrica && (
        <p className="doc-no-print flex items-center gap-2 rounded-sm border bg-muted/40 p-2 text-xs text-muted-foreground">
          <Info className="size-3.5" /> Usando o layout de fábrica: não há modelo salvo no Estúdio com
          este nome, ou o salvo não pôde ser lido.
        </p>
      )}

      <DocViewport>
        <DocRender schema={doc.schema} escalar={doc.escalar} linhas={doc.linhas} porFonte={doc.porFonte} />
      </DocViewport>
    </div>
  );
}
