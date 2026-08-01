"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Check, Mail, X, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buscarNotificacoes,
  marcarLidas,
  marcarNaoLidas,
  marcarTodasLidas,
  excluirNotificacoes,
} from "@/modules/notificacoes/actions";
import type { GrupoNotificacao } from "@/modules/notificacoes/agrupar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Um item do sino pode representar várias notificações idênticas (ex.: 5 arquivos enviados
 * um a um geram 5 avisos iguais). O agrupamento é só de apresentação — `ids` traz todas, e
 * cada ação age sobre o grupo inteiro. A lista completa continua em /notificacoes.
 *
 * O tipo vem do motor (puro, sem `server-only`) para que uma mudança de formato quebre na
 * compilação em vez de silenciosamente em runtime. `createdAt` aceita string porque a
 * serialização do Server Action pode entregá-la assim.
 */
type Grupo = Omit<GrupoNotificacao, "createdAt"> & { createdAt: string | Date };

const POLL_MS = 30_000;

export function NotificationBell() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Grupo[]>([]);
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
      const { grupos, naoLidas } = await buscarNotificacoes();
      setItens(grupos as Grupo[]);
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

  async function abrir(g: Grupo) {
    if (g.naoLidas > 0) {
      await marcarLidas(g.ids);
      void carregar(false);
    }
    if (g.href) {
      setAberto(false);
      router.push(g.href);
    }
  }

  function verTudo() {
    setAberto(false);
    router.push("/notificacoes");
  }

  async function lerTodas() {
    await marcarTodasLidas();
    void carregar(false);
  }

  async function alternarLida(g: Grupo) {
    if (g.naoLidas > 0) await marcarLidas(g.ids);
    else await marcarNaoLidas(g.ids);
    void carregar(false);
  }

  async function excluir(g: Grupo) {
    await excluirNotificacoes(g.ids);
    void carregar(false);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
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
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">Notificações</span>
            <Button variant="link" size="xs" className="h-auto px-1 py-0" onClick={verTudo}>
              Ver tudo <ArrowRight className="size-3" />
            </Button>
          </div>
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
              {itens.map((g) => (
                <li
                  // A chave pode se repetir entre dois bursts distintos — o id mais recente não.
                  key={g.ids[0]}
                  className={`group relative flex items-start ${g.naoLidas > 0 ? "bg-primary/5" : ""}`}
                >
                  <button
                    onClick={() => abrir(g)}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <div className="flex items-start gap-2">
                      {g.naoLidas > 0 && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{g.titulo}</p>
                        {g.corpo && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{g.corpo}</p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                          {g.total > 1 && (
                            <span
                              className="rounded-sm bg-muted px-1 py-px font-bold text-foreground"
                              title={`${g.total} notificações iguais agrupadas`}
                            >
                              {g.total}×
                            </span>
                          )}
                          {formatDistanceToNow(new Date(g.createdAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 self-center pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => alternarLida(g)}
                      title={g.naoLidas > 0 ? "Marcar como lida" : "Marcar como não lida"}
                      className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {g.naoLidas > 0 ? <Check className="size-3.5" /> : <Mail className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => excluir(g)}
                      title={g.total > 1 ? `Excluir as ${g.total}` : "Excluir"}
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
