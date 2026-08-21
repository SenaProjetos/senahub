"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, formatarDataHora } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TimelineEvento {
  id: string;
  /** Canal/categoria do evento — chave do filtro. Não precisa ser um enum do Prisma. */
  tipo: string;
  descricao: string;
  createdAt: Date | string;
  autor?: string | null;
  icone?: LucideIcon;
}

export interface TimelineTipoOpcao {
  value: string;
  label: string;
}

/**
 * F3.6 — timeline reutilizável (antes eram renderizadores bespoke por tela).
 *
 * Domain-agnostic de propósito, como todo `components/ui/*`: recebe `tipo` como `string` solto
 * em vez de importar `TipoAtividade` do Comercial — quem chama traduz o enum próprio e passa
 * `tipos` (rótulos pt-BR) só se quiser o filtro visível.
 *
 * **Paginação e filtro são só de RENDER.** O array inteiro já chega do servidor (é o mesmo dado
 * que os componentes antigos recebiam) — não há nova query por página nem por filtro. O aceite
 * ("500 eventos carrega só a 1ª página", "filtrar não recarrega a página") é sobre o que a TELA
 * ocupa e sobre não disparar navegação/fetch, não sobre paginação de rede: com centenas de
 * eventos numa timeline comercial, o array inteiro ainda é leve — a query cara seria fatiar o
 * histórico completo do sistema (`AuditLog`), que é outro caso de uso, fora deste componente.
 *
 * Scroll infinito: um sentinela no fim da lista, observado por `IntersectionObserver`, expande a
 * janela visível em `pageSize` sempre que entra na viewport. Filtro muda a janela de volta para
 * `pageSize`, senão trocar de filtro no meio do scroll deixaria "buracos" na primeira página.
 */
export function Timeline({
  eventos,
  tipos,
  pageSize = 20,
  vazioTitulo = "Nenhum evento",
  vazioDescricao,
  className,
}: {
  eventos: TimelineEvento[];
  /** Opções do filtro por tipo. Omitido esconde o seletor (timeline sem filtro). */
  tipos?: TimelineTipoOpcao[];
  pageSize?: number;
  vazioTitulo?: string;
  vazioDescricao?: string;
  className?: string;
}) {
  const [filtro, setFiltro] = useState<string>("TODOS");
  const [visiveis, setVisiveis] = useState(pageSize);
  const sentinelaRef = useRef<HTMLDivElement | null>(null);

  const filtrados = useMemo(
    () => (filtro === "TODOS" ? eventos : eventos.filter((e) => e.tipo === filtro)),
    [eventos, filtro],
  );

  useEffect(() => {
    setVisiveis(pageSize);
  }, [filtro, pageSize]);

  useEffect(() => {
    const alvo = sentinelaRef.current;
    if (!alvo) return;
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0]?.isIntersecting) {
          setVisiveis((v) => Math.min(v + pageSize, filtrados.length));
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [filtrados.length, pageSize]);

  if (eventos.length === 0) {
    return <EmptyState title={vazioTitulo} description={vazioDescricao} />;
  }

  const pagina = filtrados.slice(0, visiveis);
  const temMais = visiveis < filtrados.length;

  return (
    <div className={cn("space-y-3", className)}>
      {tipos && tipos.length > 0 && (
        <Select value={filtro} onValueChange={(v) => v && setFiltro(v)}>
          <SelectTrigger className="h-8 w-fit min-w-[10rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os tipos</SelectItem>
            {tipos.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {pagina.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
          Nenhum evento deste tipo.
        </p>
      ) : (
        <ul className="space-y-2">
          {pagina.map((e) => {
            const Icone = e.icone;
            return (
              <li key={e.id} className="rounded-sm border bg-card p-2 text-sm">
                <div className="flex items-start gap-2">
                  {Icone && (
                    <Icone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap">{e.descricao}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <span className="font-mono">{formatarDataHora(e.createdAt)}</span>
                      {e.autor ? ` · ${e.autor}` : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {temMais && <div ref={sentinelaRef} aria-hidden className="h-1" />}
    </div>
  );
}
