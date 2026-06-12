"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Send, Hash, AtSign, Plus, Circle } from "lucide-react";
import { getSocket, tocarSom } from "@/lib/chat-client";
import {
  enviarMensagem,
  marcarLido,
  definirStatusChat,
  abrirDM,
} from "@/modules/chat/actions";
import type { CanalListItem } from "@/modules/chat/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Msg = {
  id: string;
  conteudo: string;
  autor: { id: string; name: string };
  createdAt: string | Date;
};
type Usuario = { id: string; name: string; role: string; chatStatus: string };
type ChatStatus = "disponivel" | "ocupado" | "reuniao";

const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  ocupado: "Ocupado",
  reuniao: "Em reunião",
};
const STATUS_COR: Record<string, string> = {
  disponivel: "text-status-aprovado",
  ocupado: "text-status-entregue",
  reuniao: "text-status-revisao",
};

export function ChatView({
  canais: canaisIniciais,
  usuarios,
  meId,
  status: statusInicial,
}: {
  canais: CanalListItem[];
  usuarios: Usuario[];
  meId: string;
  status: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [canais, setCanais] = useState(canaisIniciais);
  const [sel, setSel] = useState<string | null>(sp.get("c") ?? canaisIniciais[0]?.id ?? null);
  const [mensagens, setMensagens] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [status, setStatus] = useState(statusInicial);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const fimRef = useRef<HTMLDivElement>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  // Carrega mensagens ao trocar de canal + marca lido.
  useEffect(() => {
    if (!sel) return;
    let vivo = true;
    fetch(`/api/chat/canais/${sel}/mensagens`)
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d.mensagens) setMensagens(d.mensagens);
      });
    void marcarLido({ canalId: sel });
    setCanais((cs) => cs.map((c) => (c.id === sel ? { ...c, naoLidas: 0 } : c)));
    return () => {
      vivo = false;
    };
  }, [sel]);

  // Socket: mensagens ao vivo, presença, novos canais.
  useEffect(() => {
    const s = getSocket();
    function onMensagem(p: Msg & { canalId: string }) {
      if (p.autor.id !== meId) tocarSom();
      if (p.canalId === selRef.current) {
        setMensagens((m) => [...m, p]);
        void marcarLido({ canalId: p.canalId });
      } else {
        setCanais((cs) =>
          cs.map((c) =>
            c.id === p.canalId
              ? { ...c, naoLidas: c.naoLidas + (p.autor.id !== meId ? 1 : 0), ultima: { conteudo: p.conteudo, autor: p.autor.name, createdAt: new Date(p.createdAt) } }
              : c,
          ),
        );
      }
    }
    function onPresenca(p: { userId: string; online: boolean }) {
      setOnline((o) => {
        const n = new Set(o);
        if (p.online) n.add(p.userId);
        else n.delete(p.userId);
        return n;
      });
    }
    function onNovoCanal(p: { canalId: string }) {
      s.emit("entrar-canal", p.canalId);
      router.refresh();
    }
    s.on("mensagem", onMensagem);
    s.on("presenca", onPresenca);
    s.on("entrar-canal-novo", onNovoCanal);
    return () => {
      s.off("mensagem", onMensagem);
      s.off("presenca", onPresenca);
      s.off("entrar-canal-novo", onNovoCanal);
    };
  }, [meId, router]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  function enviar() {
    if (!texto.trim() || !sel) return;
    const conteudo = texto;
    setTexto("");
    void enviarMensagem({ canalId: sel, conteudo }).then((r) => {
      if (!r.ok) toast.error(r.error);
    });
  }

  function mudarStatus(s: string) {
    setStatus(s);
    void definirStatusChat({ status: s as ChatStatus });
  }

  async function novaDM(usuarioId: string) {
    const r = await abrirDM({ usuarioId });
    if (r.ok) {
      router.refresh();
      setSel(r.data.canalId);
    } else toast.error(r.error);
  }

  const canalSel = canais.find((c) => c.id === sel);

  return (
    <div className="grid h-[calc(100svh-9rem)] grid-cols-1 gap-3 lg:grid-cols-[300px_1fr]">
      {/* Lista de canais */}
      <div className={cn("flex flex-col rounded-sm border", sel && "hidden lg:flex")}>
        <div className="flex items-center justify-between gap-2 border-b p-2">
          <Select value={status} onValueChange={(v) => mudarStatus(v ?? "disponivel")}>
            <SelectTrigger className="h-8 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <Circle className={cn("mr-1 inline size-2 fill-current", STATUS_COR[k])} /> {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DMDialog usuarios={usuarios} online={online} onAbrir={novaDM} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {canais.map((c) => (
            <button
              key={c.id}
              onClick={() => setSel(c.id)}
              className={cn(
                "flex w-full items-center gap-2 border-b p-2.5 text-left text-sm hover:bg-muted/50",
                sel === c.id && "bg-muted",
              )}
            >
              {c.tipo === "dm" ? (
                <AtSign className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Hash className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{c.nome}</span>
                  {c.naoLidas > 0 && (
                    <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {c.naoLidas}
                    </span>
                  )}
                </div>
                {c.ultima && (
                  <p className="truncate text-xs text-muted-foreground">
                    {c.ultima.autor}: {c.ultima.conteudo}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa */}
      <div className={cn("flex flex-col rounded-sm border", !sel && "hidden lg:flex")}>
        {canalSel ? (
          <>
            <div className="flex items-center gap-2 border-b p-3">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setSel(null)}
              >
                ←
              </Button>
              {canalSel.tipo === "dm" ? <AtSign className="size-4" /> : <Hash className="size-4" />}
              <span className="font-semibold">{canalSel.nome}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {mensagens.map((m) => {
                const meu = m.autor.id === meId;
                return (
                  <div key={m.id} className={cn("flex", meu && "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[75%] rounded-md px-3 py-1.5 text-sm",
                        meu ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {!meu && <p className="text-xs font-semibold opacity-80">{m.autor.name}</p>}
                      <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                      <p className="mt-0.5 text-right text-[10px] opacity-60">
                        {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>
            <div className="flex items-center gap-2 border-t p-2">
              <Input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), enviar())}
                placeholder="Mensagem…"
              />
              <Button size="icon" onClick={enviar} aria-label="Enviar">
                <Send className="size-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa.
          </div>
        )}
      </div>
    </div>
  );
}

function DMDialog({
  usuarios,
  online,
  onAbrir,
}: {
  usuarios: Usuario[];
  online: Set<string>;
  onAbrir: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="icon" variant="outline" aria-label="Nova conversa">
            <Plus className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conversar com…</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {usuarios.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                onAbrir(u.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm p-2 text-left text-sm hover:bg-muted"
            >
              <Circle
                className={cn(
                  "size-2 fill-current",
                  online.has(u.id) ? "text-status-aprovado" : "text-muted-foreground/40",
                )}
              />
              <span className="flex-1">{u.name}</span>
              <span className="text-xs text-muted-foreground">{u.role}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
