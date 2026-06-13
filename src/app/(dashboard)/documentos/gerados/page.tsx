import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { documentosGerados } from "@/modules/documentos/queries";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Documentos gerados" };

function paramsResumo(params: unknown): string {
  if (!params || typeof params !== "object") return "—";
  const e = Object.entries(params as Record<string, string>);
  if (e.length === 0) return "—";
  return e.map(([k, v]) => `${k}=${v}`).join(" · ");
}

function previewHref(modeloId: string | null, params: unknown): string | null {
  if (!modeloId) return null;
  const qs =
    params && typeof params === "object"
      ? new URLSearchParams(params as Record<string, string>).toString()
      : "";
  return `/documentos/${modeloId}/preview${qs ? `?${qs}` : ""}`;
}

export default async function DocumentosGeradosPage() {
  await requirePermission("documentos", "ver");
  const gerados = await documentosGerados();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/documentos"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Estúdio de Documentos
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Documentos gerados</h2>
        <p className="text-sm text-muted-foreground">
          Histórico imutável do que foi produzido (modelo, parâmetros, autor e data).
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {gerados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhum documento salvo ainda. Use “Salvar geração” no preview.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Fonte</th>
                    <th className="px-3 py-2">Parâmetros</th>
                    <th className="px-3 py-2">Autor</th>
                    <th className="px-3 py-2">Quando</th>
                    <th className="px-3 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {gerados.map((g) => {
                    const href = previewHref(g.modeloId, g.params);
                    return (
                      <tr key={g.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-medium">{g.modeloNome}</td>
                        <td className="px-3 py-2 text-muted-foreground">{g.fonte ?? "—"}</td>
                        <td className="max-w-[260px] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                          {paramsResumo(g.params)}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{g.geradoPorNome}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                          {g.createdAt.toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {href ? (
                            <Link href={href} className="text-xs text-primary hover:underline">
                              Reabrir
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">modelo removido</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
