"use client";

import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, Check, Mail, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  marcarLida,
  marcarNaoLida,
  marcarTodasLidas,
  excluirNotificacao,
} from "@/modules/notificacoes/actions";
import type { FiltroNotificacao } from "@/modules/notificacoes/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useSetParams } from "@/lib/use-set-param";

type Notif = {
  id: string;
  titulo: string;
  corpo: string | null;
  href: string | null;
  lida: boolean;
  createdAt: string;
};

const FILTROS: { chave: FiltroNotificacao; label: string }[] = [
  { chave: "todas", label: "Todas" },
  { chave: "nao_lidas", label: "Não lidas" },
  { chave: "lidas", label: "Lidas" },
];

export function NotificacoesView({
  itens,
  total,
  naoLidas,
  filtro,
  page,
  pageCount,
  pageSize,
}: {
  itens: Notif[];
  total: number;
  naoLidas: number;
  filtro: FiltroNotificacao;
  page: number;
  pageCount: number;
  pageSize: number;
}) {
  const router = useRouter();
  const setParams = useSetParams();

  async function abrir(n: Notif) {
    if (!n.lida) await marcarLida(n.id);
    if (n.href) router.push(n.href);
    else router.refresh();
  }

  async function alternarLida(n: Notif) {
    if (n.lida) await marcarNaoLida(n.id);
    else await marcarLida(n.id);
    router.refresh();
  }

  async function excluir(n: Notif) {
    await excluirNotificacao(n.id);
    router.refresh();
  }

  async function lerTodas() {
    await marcarTodasLidas();
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            Notificações <Bell className="size-5 text-muted-foreground" />
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} notificação(ões){naoLidas > 0 ? ` · ${naoLidas} não lida(s)` : ""}.
          </p>
        </div>
        {naoLidas > 0 && (
          <Button variant="outline" size="sm" onClick={lerTodas}>
            <CheckCheck className="size-4" /> Ler todas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTROS.map((f) => (
          <Button
            key={f.chave}
            variant={filtro === f.chave ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setParams({ filtro: f.chave === "todas" ? null : f.chave })}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {itens.length === 0 ? (
            <EmptyState
              icon={BellOff}
              title="Nenhuma notificação"
              description={
                filtro === "nao_lidas"
                  ? "Você está em dia — nada por ler."
                  : filtro === "lidas"
                    ? "Nenhuma notificação lida ainda."
                    : "Você ainda não recebeu notificações."
              }
            />
          ) : (
            <ul className="divide-y">
              {itens.map((n) => (
                <li
                  key={n.id}
                  className={`group relative flex items-start ${n.lida ? "" : "bg-primary/5"}`}
                >
                  <button
                    onClick={() => abrir(n)}
                    className="min-w-0 flex-1 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-2">
                      {!n.lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{n.titulo}</p>
                        {n.corpo && (
                          <p className="text-xs text-muted-foreground">{n.corpo}</p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.createdAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 self-center pr-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => alternarLida(n)}
                      title={n.lida ? "Marcar como não lida" : "Marcar como lida"}
                      className="rounded-sm p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {n.lida ? <Mail className="size-4" /> : <Check className="size-4" />}
                    </button>
                    <button
                      onClick={() => excluir(n)}
                      title="Excluir"
                      className="rounded-sm p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Pagination page={page} pageCount={pageCount} pageSize={pageSize} total={total} />
    </div>
  );
}
