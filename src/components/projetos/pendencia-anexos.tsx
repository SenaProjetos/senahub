"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink, FileText, Link2, Loader2, Paperclip, Trash2 } from "lucide-react";
import { anexarLinkPendencia, excluirAnexoPendencia } from "@/modules/projetos/pendencias/actions";
import type { AnexoView } from "@/modules/projetos/pendencias/queries";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";

/** Extensões que o servidor aceita — espelha a lista de `api/pendencias/anexo/route.ts`. */
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,audio/*,application/pdf";
const MAX = 25 * 1024 * 1024;

function tamanhoLegivel(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Anexos de UM apontamento (item 12): print, foto, áudio, PDF e link externo.
 *
 * Cada tipo tem render próprio de propósito — quatro linhas de download idênticas entregariam
 * bem menos do que a ficha promete. Imagem vira miniatura clicável, áudio vira player (é o que
 * torna "áudio como anexo bruto", decidido em R5, algo utilizável sem baixar o arquivo), PDF
 * vira linha de download e link vira âncora externa.
 *
 * Arquivo sobe por multipart (`/api/pendencias/anexo`) porque foto/áudio estouram o
 * `bodySizeLimit` de Server Action; link é só texto e vai por action.
 */
export function PendenciaAnexos({
  pendenciaId,
  anexos,
  currentUserId,
  ehAdmin,
  onMudou,
}: {
  pendenciaId: string;
  anexos: AnexoView[];
  currentUserId: string;
  ehAdmin: boolean;
  onMudou: (anexos: AnexoView[]) => void;
}) {
  const [pending, start] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [modoLink, setModoLink] = useState(false);
  const [url, setUrl] = useState("");
  const [rotulo, setRotulo] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function enviarArquivo(file: File) {
    if (file.size > MAX) {
      toast.error("Arquivo muito grande (máx 25 MB).");
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("pendenciaId", pendenciaId);
      form.append("file", file);
      const r = await fetch("/api/pendencias/anexo", { method: "POST", body: form });
      const dados = await r.json().catch(() => null);
      if (!r.ok) {
        toast.error(dados?.error ?? "Não foi possível anexar o arquivo.");
        return;
      }
      onMudou([
        ...anexos,
        {
          id: dados.id,
          tipo: "arquivo",
          nome: dados.nome,
          url: null,
          mime: dados.mime,
          tamanho: dados.tamanho,
          autorId: currentUserId,
          autor: "Você",
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.success("Anexo enviado.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function salvarLink() {
    const u = url.trim();
    if (!u) return;
    start(async () => {
      const r = await anexarLinkPendencia({ id: pendenciaId, url: u, nome: rotulo.trim() || undefined });
      if (r.ok) {
        onMudou([
          ...anexos,
          {
            id: r.data.id,
            tipo: "link",
            nome: r.data.nome,
            url: r.data.url,
            mime: null,
            tamanho: null,
            autorId: currentUserId,
            autor: "Você",
            createdAt: new Date().toISOString(),
          },
        ]);
        setUrl("");
        setRotulo("");
        setModoLink(false);
      } else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirAnexoPendencia({ id });
      if (r.ok) onMudou(anexos.filter((a) => a.id !== id));
      else toast.error(r.error);
    });
  }

  return (
    <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      {anexos.map((a) => {
        const podeRemover = a.autorId === currentUserId || ehAdmin;
        const rota = `/api/pendencias/anexo/${a.id}`;
        const titulo = `${a.nome} · ${a.autor} · ${formatarDataHora(a.createdAt)}`;
        return (
          <div key={a.id} className="group/anexo flex items-start gap-1.5 text-[11px]">
            <div className="min-w-0 flex-1">
              {a.tipo === "link" ? (
                <a
                  href={a.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                  title={a.url ?? undefined}
                >
                  <Link2 className="size-3 shrink-0" />
                  {a.nome}
                  <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                </a>
              ) : a.mime?.startsWith("image/") ? (
                <a href={rota} target="_blank" rel="noopener noreferrer" title={titulo}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={rota}
                    alt={a.nome}
                    loading="lazy"
                    className="max-h-32 w-full rounded-sm border bg-white object-contain"
                  />
                </a>
              ) : a.mime?.startsWith("audio/") ? (
                <div className="space-y-0.5">
                  <span className="block truncate text-muted-foreground" title={titulo}>
                    {a.nome}
                  </span>
                  {/* `preload="none"` porque uma prancha pode acumular vários áudios e nenhum
                      deles precisa baixar antes de alguém dar play. */}
                  <audio controls preload="none" src={rota} className="h-8 w-full" />
                </div>
              ) : (
                <a
                  href={`${rota}?disposition=attachment`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  title={titulo}
                >
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate">{a.nome}</span>
                  <span className="shrink-0 text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span>
                </a>
              )}
            </div>
            {podeRemover && (
              <button
                type="button"
                aria-label={`Remover anexo ${a.nome}`}
                className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/anexo:opacity-100"
                onClick={() => remover(a.id)}
                disabled={pending}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Fica FORA do condicional de propósito: no mesmo galho que os campos de link, o React
          reaproveitava o nó DOM e alternava um input não-controlado (file) com um controlado
          (url), o que dispara aviso de "controlled/uncontrolled" e perde o `ref`. */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviarArquivo(f);
        }}
      />
      {modoLink ? (
        <div className="space-y-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-sm border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary"
            autoFocus
          />
          <input
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Rótulo (opcional)"
            className="w-full rounded-sm border bg-background px-1.5 py-1 text-[11px] outline-none focus:border-primary"
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-6 px-2 text-xs" onClick={salvarLink} disabled={pending || !url.trim()}>
              Salvar link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setModoLink(false);
                setUrl("");
                setRotulo("");
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={() => inputRef.current?.click()}
            disabled={enviando || pending}
          >
            {enviando ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />} anexar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={() => setModoLink(true)}
            disabled={pending}
          >
            <Link2 className="size-3" /> link
          </Button>
        </div>
      )}
    </div>
  );
}
