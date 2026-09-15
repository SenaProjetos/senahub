"use client";

import { useEffect, useState } from "react";
import { Download, Eye, Globe, History, PencilLine } from "lucide-react";
import { carregarHistoricoDocumento } from "@/modules/uploads/actions";
import type { EventoHistorico } from "@/modules/uploads/historico/queries";
import { cn, formatarDataHora, rotuloRevisao } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Filtro = "tudo" | "alteracao" | "acesso";

const ROTULO_VIA: Record<string, string> = { zip: "em .zip", dwg: "visualizador DWG", ifc: "visualizador BIM" };

/**
 * Linha do tempo do documento dentro do painel de detalhe. Busca ao abrir e de novo quando os
 * metadados da linha mudam (`recarga`) — assim salvar fase/status aparece no histórico sem
 * fechar o painel. Acessos só chegam do servidor para quem tem `arquivos:ver_acessos`; o filtro
 * só aparece nesse caso.
 */
export function HistoricoDocumento({
  documentoId,
  aberto,
  recarga,
}: {
  documentoId: string;
  aberto: boolean;
  recarga: string;
}) {
  const [dados, setDados] = useState<{ eventos: EventoHistorico[]; truncado: boolean; podeVerAcessos: boolean } | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setErro("");
    void carregarHistoricoDocumento({ documentoId }).then((r) => {
      if (!vivo) return;
      if (r.ok) setDados(r.data);
      else setErro(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [aberto, documentoId, recarga]);

  const eventos = (dados?.eventos ?? []).filter((e) => filtro === "tudo" || e.categoria === filtro);

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby={`historico-${documentoId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={`historico-${documentoId}`} className="text-sm font-semibold">Histórico</h3>
          <p className="text-xs text-muted-foreground">
            {dados?.podeVerAcessos ? "Alterações, downloads e visualizações." : "Alterações feitas neste documento."}
          </p>
        </div>
        {dados?.podeVerAcessos && (
          <div className="flex items-center gap-1" role="group" aria-label="Filtrar histórico">
            {(["tudo", "alteracao", "acesso"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  filtro === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {f === "tudo" ? "Tudo" : f === "alteracao" ? "Alterações" : "Acessos"}
              </button>
            ))}
          </div>
        )}
      </div>

      {erro ? (
        <p className="text-sm text-destructive">{erro}</p>
      ) : !dados ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : eventos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="size-4" aria-hidden />
          {filtro === "acesso" ? "Nenhum download ou visualização registrado." : "Nenhum evento registrado ainda."}
        </p>
      ) : (
        <ol className="space-y-2">
          {eventos.map((e) => (
            <ItemHistorico key={e.id} evento={e} />
          ))}
          {dados.truncado && (
            <li className="text-xs text-muted-foreground">Mostrando os eventos mais recentes.</li>
          )}
        </ol>
      )}
    </section>
  );
}

function ItemHistorico({ evento: e }: { evento: EventoHistorico }) {
  const Icone = e.origem === "link_publico" ? Globe : e.tipo === "download" ? Download : e.tipo === "visualizacao" ? Eye : PencilLine;
  const quem = e.autor ?? (e.origem === "link_publico" ? `Link público${e.linkNome ? ` "${e.linkNome}"` : ""}` : "Sistema");
  const contexto = [
    e.arquivo,
    e.versao != null ? rotuloRevisao(e.versao) : null,
    e.via ? ROTULO_VIA[e.via] ?? e.via : null,
  ].filter(Boolean);
  const repetido = e.quantidade > 1;

  return (
    <li className="flex gap-2 text-sm">
      <Icone
        className={cn("mt-0.5 size-4 shrink-0", e.categoria === "acesso" ? "text-muted-foreground" : "text-primary")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          <span className="font-medium">{quem}</span> {e.rotulo.toLowerCase()}
          {e.complemento && <span className="text-muted-foreground"> — {e.complemento}</span>}
          {repetido && (
            <Badge
              variant="outline"
              className="ml-1.5 align-middle font-mono text-[10px]"
              title={`${e.quantidade} vezes entre ${formatarDataHora(e.criadoEm)} e ${formatarDataHora(e.ultimoEm)}`}
            >
              {e.quantidade}×
            </Badge>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={contexto.join(" · ") || undefined}>
          {formatarDataHora(e.ultimoEm)}
          {contexto.length > 0 && ` · ${contexto.join(" · ")}`}
        </p>
      </div>
    </li>
  );
}
