import Link from "next/link";
import { ArrowLeft, History, ShieldCheck } from "lucide-react";
import type { HistoricoProjeto, HistoricoItem } from "@/modules/projetos/historico/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";

const ACAO_LABEL: Record<string, string> = {
  "enviar-arquivos": "Enviou arquivo(s)",
  "validar-entrega": "Validou a entrega",
  "gerar-aceite-cliente": "Gerou link de aceite",
  "renomear-arquivo": "Renomeou arquivo",
  "criar-prancha": "Criou folha (lista mestre)",
  "editar-prancha": "Editou folha",
  "excluir-prancha": "Excluiu folha",
  "importar-pranchas": "Importou folhas",
  "criar-arquivo": "Adicionou arquivo geral",
  "editar-arquivo": "Editou arquivo geral",
  "excluir-arquivo": "Excluiu arquivo geral",
  "adicionar-versao-arquivo": "Nova versão (arquivo geral)",
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Resumo humano do detalhe do evento (quando útil). */
function resumo(item: HistoricoItem): string | null {
  const d = item.detalhe;
  if (!d) return null;
  const antes = (d.antes ?? null) as Record<string, unknown> | null;
  const novo = (d.novo ?? null) as Record<string, unknown> | null;

  if (item.acao === "renomear-arquivo") {
    const de = texto(antes?.nomeArquivo);
    const para = texto(novo?.nome) ?? texto((d as Record<string, unknown>).nome);
    if (de && para) return `“${de}” → “${para}”`;
    if (para) return `→ “${para}”`;
  }
  if (item.acao === "enviar-arquivos") {
    const pacote = texto(d.pacote);
    const total = typeof d.total === "number" ? d.total : null;
    return [pacote ? `pacote ${pacote}` : null, total ? `${total} arquivo(s)` : null].filter(Boolean).join(" · ") || null;
  }
  return null;
}

export function HistoricoView({
  projeto,
  historico,
}: {
  projeto: { id: string; codigo: string; nome: string };
  historico: HistoricoProjeto;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
        </Link>
        <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          Histórico <ShieldCheck className="size-5 text-muted-foreground" />
        </h2>
        <p className="text-sm text-muted-foreground">
          Registro imutável de alterações em documentos deste projeto (CDE). Visível apenas a administradores e cargos
          autorizados. {historico.total} evento(s).
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {historico.itens.length === 0 ? (
            <EmptyState icon={History} title="Sem eventos" description="Nenhuma alteração de documento registrada ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Quando</th>
                    <th className="px-4 py-2">Quem</th>
                    <th className="px-4 py-2">Evento</th>
                    <th className="px-4 py-2">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historico.itens.map((it) => {
                    const r = resumo(it);
                    return (
                      <tr key={it.id} className="hover:bg-muted/40">
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted-foreground">
                          {formatarDataHora(it.quando)}
                        </td>
                        <td className="px-4 py-2">{it.autor}</td>
                        <td className="px-4 py-2">
                          <span className="font-medium">{ACAO_LABEL[it.acao] ?? it.acao}</span>
                          {it.resultado !== "sucesso" && (
                            <Badge variant="outline" className="ml-2 text-[10px] capitalize">{it.resultado}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination page={historico.page} pageCount={historico.pageCount} pageSize={historico.take} total={historico.total} />
    </div>
  );
}
