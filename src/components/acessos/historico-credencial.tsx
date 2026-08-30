"use client";

import { useEffect, useState } from "react";
import { History, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { formatarDataHora } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { obterHistoricoCredencial } from "@/modules/acessos/actions";
import { ACAO_LABEL } from "@/modules/auditoria/labels";
import type { EventoHistorico } from "@/modules/acessos/queries";

/**
 * §33/§73 — histórico da credencial, em timeline compacta.
 *
 * Lê o `AuditLog` que o `defineAction` já grava; não existe tabela de histórico própria. Mostra
 * QUEM, O QUÊ e QUANDO — nunca o `detalhe` do evento, que carrega o antes/depois do cadastro
 * (§33: "Registrar somente eventos necessários e seguros", "JAMAIS registrar a senha").
 *
 * Carrega sob demanda, ao abrir a aba: o drawer não deve pagar essa consulta em toda abertura,
 * já que a maioria das visitas só quer o cadastro.
 */
export function HistoricoCredencial({ credencialId }: { credencialId: string }) {
  const [eventos, setEventos] = useState<EventoHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setEventos(null);
    setErro(null);
    obterHistoricoCredencial({ id: credencialId }).then((r) => {
      if (cancelado) return;
      if (r.ok) setEventos(r.data);
      else setErro(r.error);
    });
    return () => {
      cancelado = true;
    };
  }, [credencialId]);

  if (erro) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="size-4" aria-hidden />
        {erro}
      </p>
    );
  }

  if (eventos === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="h-8 w-3/5" />
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="size-4" aria-hidden />
        Nenhum evento registrado ainda.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {eventos.map((e) => {
        const negado = e.resultado !== "sucesso";
        return (
          <li key={e.id} className="flex gap-2.5">
            {/* Trilho da timeline: o ponto marca o evento, a linha liga ao próximo. */}
            <span className="flex flex-col items-center pt-1" aria-hidden>
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  negado ? "bg-destructive" : "bg-primary",
                )}
              />
              <span className="mt-1 w-px flex-1 bg-border" />
            </span>

            <div className="min-w-0 pb-1">
              <p className="text-sm">
                {ACAO_LABEL[e.acao] ?? e.acao}
                {/* Tentativa negada também é registro que interessa (§90): o texto diz, não só a cor. */}
                {negado && <span className="ml-1 text-xs text-destructive">· negado</span>}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {e.autor && (
                  <AvatarUsuario nome={e.autor.name} image={e.autor.image} className="size-4" />
                )}
                {e.autor?.name ?? "Usuário removido"} · {formatarDataHora(e.criadoEm)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
