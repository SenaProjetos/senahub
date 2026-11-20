"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus, Paperclip, X } from "lucide-react";
import { criarPedidoRevisao } from "@/modules/portal/pedido-revisao/actions";
import { EXTENSOES_ANEXO, LIMITE_COMENTARIO, MAX_ANEXOS, motivoDoAnexo } from "@/modules/portal/pedido-revisao/regras";
import { TAMANHO_MAX, TAMANHO_MAX_LABEL } from "@/modules/uploads/limites";
import { formatarBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Envia os anexos de um pedido JÁ criado, um por requisição (spec, decisão 5). Devolve as falhas para a tela avisar:
 * o pedido fica de pé mesmo que um anexo não suba.
 */
export async function enviarAnexosDoPedido(pedidoId: string, arquivos: readonly File[]): Promise<string[]> {
  const falhas: string[] = [];
  for (const arquivo of arquivos) {
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      const res = await fetch(`/api/portal/pedidos/${encodeURIComponent(pedidoId)}/anexos`, { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        falhas.push(`${arquivo.name}: ${data.error ?? "falha no envio."}`);
      }
    } catch {
      falhas.push(`${arquivo.name}: falha de conexão.`);
    }
  }
  return falhas;
}

/** Escolha de anexos (até 5, extensões e tamanho conferidos antes de enviar — o servidor confere de novo). */
export function CampoAnexos({ arquivos, onChange }: { arquivos: File[]; onChange: (arquivos: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();
  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos = [...arquivos];
    for (const f of Array.from(lista)) {
      const motivo = motivoDoAnexo({ nome: f.name, jaTem: novos.length }) ?? (f.size > TAMANHO_MAX ? `Arquivo acima de ${TAMANHO_MAX_LABEL}.` : null);
      if (motivo) toast.error(`${f.name}: ${motivo}`);
      else novos.push(f);
    }
    onChange(novos);
    if (ref.current) ref.current.value = "";
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Anexos (opcional)</Label>
      <p className="text-xs text-muted-foreground">
        Até {MAX_ANEXOS} arquivos: PDF, imagem (PNG ou JPG), DWG ou DXF.
      </p>
      {arquivos.length > 0 && (
        <ul className="space-y-1">
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-sm border px-2 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatarBytes(f.size)}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`Tirar ${f.name}`}
                onClick={() => onChange(arquivos.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={ref}
        id={id}
        type="file"
        multiple
        accept={EXTENSOES_ANEXO.map((e) => `.${e}`).join(",")}
        className="sr-only"
        onChange={(e) => adicionar(e.target.files)}
        disabled={arquivos.length >= MAX_ANEXOS}
      />
      <Button type="button" size="sm" variant="outline" disabled={arquivos.length >= MAX_ANEXOS} onClick={() => ref.current?.click()}>
        <Paperclip className="size-4" /> Anexar arquivo
      </Button>
    </div>
  );
}

/**
 * Botão "Pedir revisão" na linha de um PDF das Entregas do portal: comentário obrigatório e anexos. Cria o pedido e
 * depois envia os anexos um a um.
 */
export function PedirRevisaoDialog({
  projetoId,
  uploadId,
  nome,
  revisao,
}: {
  projetoId: string;
  uploadId: string;
  nome: string;
  revisao: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [comentario, setComentario] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [enviando, startTransition] = useTransition();
  const idComentario = useId();

  function enviar() {
    startTransition(async () => {
      const r = await criarPedidoRevisao({ projetoId, uploadId, comentario });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const falhas = await enviarAnexosDoPedido(r.data.id, arquivos);
      toast.success("Pedido enviado à equipe. A resposta aparece aqui no portal.");
      for (const f of falhas) toast.error(`${f} O pedido foi enviado sem este anexo.`);
      setAberto(false);
      setComentario("");
      setArquivos([]);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1 text-xs font-medium text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Pedir revisão de ${nome}`}
        title="Pedir revisão"
      >
        <MessageSquarePlus className="size-4" />
        <span className="hidden sm:inline">Pedir revisão</span>
      </button>
      <Dialog open={aberto} onOpenChange={(o) => !enviando && setAberto(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedir revisão</DialogTitle>
            <DialogDescription className="break-words">
              {nome} · {revisao}. A equipe recebe o pedido e responde aqui no portal.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={idComentario}>O que você quer revisar?</Label>
              <textarea
                id={idComentario}
                rows={5}
                maxLength={LIMITE_COMENTARIO}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder="Ex.: mudar a porta da cozinha para a parede da direita."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>
            <CampoAnexos arquivos={arquivos} onChange={setArquivos} />
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={enviando || !comentario.trim()}>
              {enviando ? "Enviando…" : "Enviar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
