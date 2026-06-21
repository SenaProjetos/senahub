"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Check, Mail, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buscarNotificacoes,
  marcarLida,
  marcarNaoLida,
  marcarTodasLidas,
  excluirNotificacao,
} from "@/modules/notificacoes/actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Notif = {
  id: string;
  titulo: string;
  corpo: string | null;
  href: string | null;
  lida: boolean;
  createdAt: string | Date;
};

const POLL_MS = 30_000;

export function NotificationBell() {
  const router = useRouter();
  const [itens, setItens] = useState<Notif[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const anterior = useRef(0);
  const audio = useRef<HTMLAudioElement | null>(null);

  const tocarSom = useCallback(() => {
    try {
      audio.current ??= new Audio("/sounds/notificacao.wav");
      audio.current.currentTime = 0;
      void audio.current.play();
    } catch {
      /* autoplay pode ser bloqueado até primeira interação */
    }
  }, []);

  const carregar = useCallback(
    async (comSom = true) => {
      const { itens, naoLidas } = await buscarNotificacoes();
      setItens(itens as Notif[]);
      setNaoLidas(naoLidas);
      if (comSom && naoLidas > anterior.current) tocarSom();
      anterior.current = naoLidas;
    },
    [tocarSom],
  );

  useEffect(() => {
    void carregar(false);
    const id = setInterval(() => void carregar(true), POLL_MS);

    // Atualização instantânea quando o SW recebe um push.
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "notificacao") void carregar(true);
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      clearInterval(id);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [carregar]);

  async function abrir(n: Notif) {
    if (!n.lida) {
      await marcarLida(n.id);
      void carregar(false);
    }
    if (n.href) router.push(n.href);
  }

  async function lerTodas() {
    await marcarTodasLidas();
    void carregar(false);
  }

  async function alternarLida(n: Notif) {
    if (n.lida) await marcarNaoLida(n.id);
    else await marcarLida(n.id);
    void carregar(false);
  }

  async function excluir(n: Notif) {
    await excluirNotificacao(n.id);
    void carregar(false);
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
            <Bell className="size-4" />
            {naoLidas > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {naoLidas > 9 ? "9+" : naoLidas}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          {naoLidas > 0 && (
            <Button variant="ghost" size="xs" onClick={lerTodas}>
              <CheckCheck className="size-3.5" /> Ler todas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {itens.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </p>
          ) : (
            <ul className="divide-y">
              {itens.map((n) => (
                <li
                  key={n.id}
                  className={`group relative flex items-start ${n.lida ? "" : "bg-primary/5"}`}
                >
                  <button
                    onClick={() => abrir(n)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-2">
                      {!n.lida && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{n.titulo}</p>
                        {n.corpo && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{n.corpo}</p>
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
                  <div className="flex shrink-0 items-center gap-0.5 self-center pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => alternarLida(n)}
                      title={n.lida ? "Marcar como não lida" : "Marcar como lida"}
                      className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {n.lida ? <Mail className="size-3.5" /> : <Check className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => excluir(n)}
                      title="Excluir"
                      className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
