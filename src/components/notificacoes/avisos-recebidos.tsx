"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, ImageIcon, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { confirmarLeituraAviso } from "@/modules/notificacoes/avisos/actions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ConteudoAviso } from "@/components/notificacoes/conteudo-aviso";
import { cn, formatarDataHora } from "@/lib/utils";

/** `AvisoRecebido` (modules/notificacoes/avisos/recebidos.ts) com as datas em ISO. */
export type AvisoRecebidoItem = {
  avisoId: string;
  titulo: string;
  corpo: string | null;
  temImagem: boolean;
  exigeConfirmacao: boolean;
  autor: string;
  recebidoEm: string;
  lidoEm: string | null;
};

/**
 * Aba "Recebidos" de /avisos: os comunicados que a pessoa recebeu, para reler depois que o
 * modal sumiu. A linha abre o mesmo conteúdo do modal (`ConteudoAviso`); `inicial` vem de
 * `?aviso=<id>` (link da notificação) e abre direto.
 */
export function AvisosRecebidos({
  itens,
  inicial,
  page,
  pageCount,
  pageSize,
  total,
}: {
  itens: AvisoRecebidoItem[];
  inicial: AvisoRecebidoItem | null;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState<AvisoRecebidoItem | null>(inicial);
  const [confirmando, startConfirmar] = useTransition();

  function fechar() {
    setAberto(null);
    // Tira o `?aviso=` sem voltar a paginação (o useSetParams zeraria `page`).
    if (searchParams.has("aviso")) {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("aviso");
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }

  function confirmar(a: AvisoRecebidoItem) {
    startConfirmar(async () => {
      const r = await confirmarLeituraAviso(a.avisoId);
      if (!r.ok) {
        toast.error("Não foi possível confirmar a leitura.");
        return;
      }
      setAberto({ ...a, lidoEm: new Date().toISOString() });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3" data-tour="avisos-recebidos">
      {itens.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhum aviso recebido"
          description="Os comunicados gerais que chegarem para você ficam guardados aqui para reler."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {itens.map((a) => (
            <li key={a.avisoId} className={cn(!a.lidoEm && "bg-primary/5")}>
              <button
                type="button"
                onClick={() => setAberto(a)}
                className="flex w-full min-w-0 items-start gap-2 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium break-words">{a.titulo}</span>
                    {a.temImagem && (
                      <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Tem imagem" />
                    )}
                    {!a.lidoEm && (
                      <Badge variant="outline" className="font-normal">
                        Não confirmado
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {a.autor} · {formatarDataHora(new Date(a.recebidoEm))}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination lista="avisos-recebidos" page={page} pageCount={pageCount} pageSize={pageSize} total={total} />

      <Dialog open={!!aberto} onOpenChange={(o: boolean) => !o && fechar()}>
        {aberto ? (
          <DialogContent
            className={cn("flex max-h-[85dvh] flex-col", aberto.temImagem ? "sm:max-w-3xl" : "sm:max-w-md")}
          >
            <DialogHeader className="shrink-0">
              <DialogTitle className="flex items-center gap-2 pr-6">
                <Megaphone className="size-4 shrink-0 text-primary" /> {aberto.titulo}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {aberto.autor} · {formatarDataHora(new Date(aberto.recebidoEm))}
              </p>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <ConteudoAviso avisoId={aberto.avisoId} corpo={aberto.corpo} temImagem={aberto.temImagem} />
            </div>
            <DialogFooter className="shrink-0 items-center">
              {aberto.lidoEm ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground sm:mr-auto">
                  <Check className="size-3.5" /> Leitura confirmada em {formatarDataHora(new Date(aberto.lidoEm))}
                </p>
              ) : (
                <Button onClick={() => confirmar(aberto)} disabled={confirmando}>
                  {confirmando ? "Confirmando…" : "Li e entendi"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
