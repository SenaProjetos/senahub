"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FolderKanban, ExternalLink, Download, Eye, ClipboardCheck, AlertTriangle } from "lucide-react";
import type { PendenteAprovacao } from "@/modules/arquivos/queries";
import { AcoesValidacaoArquivo } from "@/components/projetos/acoes-validacao-arquivo";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const PACOTE_LABEL: Record<string, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const PDF_INLINE = (url: string) => `${url}?disposition=inline`;

export function AprovacoesView({ pendentes }: { pendentes: PendenteAprovacao[] }) {
  // Agrupa por projeto — cada grupo tem o atalho direto para a pasta/projeto.
  const grupos = useMemo(() => {
    const mapa = new Map<string, { projetoId: string; codigo: string; nome: string; href: string; itens: PendenteAprovacao[] }>();
    for (const p of pendentes) {
      const g = mapa.get(p.projetoId) ?? {
        projetoId: p.projetoId,
        codigo: p.projetoCodigo,
        nome: p.projetoNome,
        href: p.href,
        itens: [],
      };
      g.itens.push(p);
      mapa.set(p.projetoId, g);
    }
    return [...mapa.values()];
  }, [pendentes]);

  if (pendentes.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Nenhuma aprovação pendente"
        description="Todos os entregáveis enviados já foram validados."
      />
    );
  }

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={g.projetoId} className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <FolderKanban className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              <span className="font-mono text-muted-foreground">{formatarCodigo(g.codigo)}</span> · {g.nome}
            </span>
            <Badge variant="secondary" className="shrink-0">
              {g.itens.length}
            </Badge>
            <Link
              href={g.href}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
              title="Abrir a pasta do projeto"
            >
              <ExternalLink className="size-3.5" /> Abrir pasta
            </Link>
          </div>

          <ul className="divide-y">
            {g.itens.map((a) => {
              const inline = a.nome.toLowerCase().endsWith(".pdf");
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{a.nome}</span>
                      {a.versao > 1 && <span className="shrink-0 text-[10px] text-muted-foreground">v{a.versao}</span>}
                      {a.ajusteObs && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-warning" title={a.ajusteObs}>
                          <AlertTriangle className="size-3" /> reenvio pós-ajuste
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.disciplina} · {PACOTE_LABEL[a.pacote] ?? a.pacote} · {a.autor} · {formatarDataHora(a.criadoEm)} ·{" "}
                      {fmtBytes(a.tamanho)}
                    </p>
                  </div>
                  {inline && (
                    <Link
                      href={PDF_INLINE(a.downloadUrl)}
                      target="_blank"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Abrir"
                      aria-label={`Abrir ${a.nome}`}
                    >
                      <Eye className="size-4" />
                    </Link>
                  )}
                  <Link
                    href={a.downloadUrl}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Baixar"
                    aria-label={`Baixar ${a.nome}`}
                  >
                    <Download className="size-4" />
                  </Link>
                  <AcoesValidacaoArquivo uploadId={a.id} nomeArquivo={a.nome} validado={false} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
