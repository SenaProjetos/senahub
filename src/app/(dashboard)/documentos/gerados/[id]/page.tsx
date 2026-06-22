import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { obterDocumentoGerado } from "@/modules/documentos/queries";
import { docSchemaZ, docVazio } from "@/modules/documentos/schema";
import { DocRender } from "@/components/documentos/doc-render";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Documento gerado" };

type DadosSnapshot = {
  escalar?: Record<string, unknown>;
  linhas?: unknown[];
  porFonte?: Record<string, { escalar: Record<string, unknown>; linhas: unknown[] }>;
};

export default async function DocumentoGeradoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("documentos", "ver");
  const { id } = await params;
  const g = await obterDocumentoGerado(id);
  if (!g) notFound();

  const schemaParsed = docSchemaZ.safeParse(g.schemaSnapshot);
  const schema = schemaParsed.success ? schemaParsed.data : docVazio();

  const dados = (g.dadosSnapshot as DadosSnapshot | null) ?? {};
  const escalar = (dados.escalar ?? {}) as Record<string, string | number | boolean | null>;
  const linhas = (dados.linhas ?? []) as Record<string, string | number | boolean | null>[];
  const porFonte = dados.porFonte as
    | Record<
        string,
        {
          escalar: Record<string, string | number | boolean | null>;
          linhas: Record<string, string | number | boolean | null>[];
        }
      >
    | undefined;

  const numeroFmt =
    g.numero != null
      ? `${g.serie ?? "DOC"}-${String(g.createdAt.getFullYear()).slice(2)}${String(g.numero).padStart(4, "0")}`
      : null;

  return (
    <div className="space-y-4">
      <div className="doc-no-print flex items-center gap-3">
        <Link
          href="/documentos/gerados"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Documentos gerados
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {g.modeloNome}
            {numeroFmt && (
              <span className="ml-2 font-mono text-xs text-primary">{numeroFmt}</span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            Gerado por {g.geradoPorNome} em {formatarData(g.createdAt)} · snapshot imutável
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={
            <Link href={`/api/documentos/gerados/${id}/pdf`} target="_blank" aria-label="Baixar PDF" />
          }
        >
          <Download className="size-4" /> PDF
        </Button>
      </div>

      <div className="doc-print-area overflow-auto">
        <DocRender schema={schema} escalar={escalar} linhas={linhas} porFonte={porFonte} />
      </div>
    </div>
  );
}
