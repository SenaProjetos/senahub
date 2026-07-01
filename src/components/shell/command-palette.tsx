"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FolderKanban, Users, Wallet, ListChecks, FileText, Loader2, Gavel, TrendingUp, BookOpen } from "lucide-react";
import { buscaGlobal, type ResultadoBusca } from "@/modules/busca/actions";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { brl } from "@/lib/utils";

const VAZIO: ResultadoBusca = { projetos: [], clientes: [], tarefas: [], lancamentos: [], documentos: [], licitacoes: [], propostas: [], ajuda: [] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const [res, setRes] = useState<ResultadoBusca>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K e evento do header.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command", onOpen);
    };
  }, []);

  // Busca com debounce.
  useEffect(() => {
    if (!open) return;
    const t = termo.trim();
    if (t.length < 2) {
      setRes(VAZIO);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    const id = setTimeout(async () => {
      try {
        setRes(await buscaGlobal(t));
      } finally {
        setCarregando(false);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [termo, open]);

  // Limpa ao fechar.
  useEffect(() => {
    if (!open) {
      setTermo("");
      setRes(VAZIO);
    }
  }, [open]);

  const ir = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const total =
    res.projetos.length +
    res.clientes.length +
    res.tarefas.length +
    res.lancamentos.length +
    res.documentos.length +
    res.licitacoes.length +
    res.propostas.length +
    res.ajuda.length;
  const curto = termo.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[12%] max-h-[70svh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Busca global</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar projetos, clientes, tarefas, licitações, propostas…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {carregando && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-[52svh] overflow-y-auto py-1.5">
          {curto ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Digite ao menos 2 caracteres.
            </p>
          ) : total === 0 && !carregando ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum resultado.</p>
          ) : (
            <>
              <Grupo titulo="Projetos" icon={FolderKanban}>
                {res.projetos.map((p) => (
                  <Item key={p.id} onClick={() => ir(`/projetos/${p.id}`)}>
                    <span className="font-mono text-xs text-primary">{formatarCodigo(p.codigo)}</span>
                    <span className="truncate">{p.nome}</span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Clientes" icon={Users}>
                {res.clientes.map((c) => (
                  <Item key={c.id} onClick={() => ir(`/clientes/${c.id}`)}>
                    <span className="truncate">{c.nome}</span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Tarefas" icon={ListChecks}>
                {res.tarefas.map((t) => (
                  <Item key={t.id} onClick={() => ir(`/tarefas`)}>
                    <span className="truncate">{t.titulo}</span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Documentos" icon={FileText}>
                {res.documentos.map((d) => (
                  <Item key={d.id} onClick={() => ir(`/documentos/${d.id}`)}>
                    <span className="truncate">{d.nome}</span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Lançamentos" icon={Wallet}>
                {res.lancamentos.map((l) => (
                  <Item key={l.id} onClick={() => ir(`/financeiro/lancamentos`)}>
                    <span className="truncate">{l.descricao}</span>
                    <span
                      className={`ml-auto shrink-0 font-mono text-xs ${l.tipo === "receita" ? "text-success" : "text-muted-foreground"}`}
                    >
                      {brl(l.valor)}
                    </span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Licitações" icon={Gavel}>
                {res.licitacoes.map((l) => (
                  <Item key={l.id} onClick={() => ir(`/licitacoes/${l.id}`)}>
                    <span className="truncate">{l.titulo}</span>
                  </Item>
                ))}
              </Grupo>
              <Grupo titulo="Propostas" icon={TrendingUp}>
                {res.propostas.map((p) => (
                  <Item key={p.id} onClick={() => ir(`/comercial/propostas/${p.id}`)}>
                    <span className="font-mono text-xs text-primary">{p.numero}</span>
                    <span className="truncate">{p.titulo}</span>
                  </Item>
                ))}
              </Grupo>
              {/* Ajuda/Manual: documentação, não registros do sistema — grupo destacado. */}
              <Grupo titulo="Ajuda · Documentação" icon={BookOpen}>
                {res.ajuda.map((a) => (
                  <Item key={a.path} onClick={() => ir(`/ajuda/${a.path}`)}>
                    <span className="truncate">{a.titulo}</span>
                    <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      doc
                    </span>
                  </Item>
                ))}
              </Grupo>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Grupo({
  titulo,
  icon: Icon,
  children,
}: {
  titulo: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode[];
}) {
  if (children.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="size-3" /> {titulo}
      </div>
      {children}
    </div>
  );
}

function Item({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
    >
      {children}
    </button>
  );
}
