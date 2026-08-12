"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, ExternalLink, Link2, RefreshCw, Share2 } from "lucide-react";
import { gerarLinkInput, atualizarLinkInput } from "@/modules/inputs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type LinkInputData = {
  token: string;
  ativo: boolean;
  expiraEm: string | null;
};

/** ISO (UTC) → valor de `<input type="datetime-local">` (horário local, sem segundos). */
function isoParaLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

/**
 * Gerência do link público do formulário do projeto (briefing + perguntas extras).
 * Fica acima do formulário, não dentro das "Perguntas extras": o link abre o
 * formulário inteiro, não só elas.
 */
export function LinkPublicoInputsButton({
  projetoId,
  baseUrl,
  link,
}: {
  projetoId: string;
  baseUrl: string;
  link: LinkInputData | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();

  const [ativo, setAtivo] = useState(link?.ativo ?? true);
  const [expira, setExpira] = useState(isoParaLocal(link?.expiraEm ?? null));

  // Ressincroniza o estado local quando o link muda (após gerar/regerar + router.refresh).
  const [snap, setSnap] = useState(link?.token ?? "");
  if ((link?.token ?? "") !== snap) {
    setSnap(link?.token ?? "");
    setAtivo(link?.ativo ?? true);
    setExpira(isoParaLocal(link?.expiraEm ?? null));
  }

  const url = link ? `${baseUrl}/p/inputs/${link.token}` : null;
  // Estado SALVO (não o do formulário): regerar troca só o endereço, então um link
  // revogado/expirado continua sem abrir até salvar a mudança aqui.
  const expirado = !!link?.expiraEm && new Date(link.expiraEm).getTime() <= Date.now();
  const foraDoAr = !!link && (!link.ativo || expirado);

  function gerar() {
    start(async () => {
      const r = await gerarLinkInput({ projetoId });
      if (r.ok) {
        toast.success(link ? "Link regerado. O anterior deixou de funcionar." : "Link público gerado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvar() {
    start(async () => {
      const r = await atualizarLinkInput({
        projetoId,
        ativo,
        expiraEm: expira ? new Date(expira).toISOString() : null,
      });
      if (r.ok) {
        toast.success("Configurações do link salvas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function copiar() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Share2 className="size-3.5" /> Link para o cliente
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link público do formulário</DialogTitle>
          <DialogDescription>
            Acesso externo (sem login) para o cliente preencher o briefing e as perguntas extras do
            projeto. As respostas salvam sozinhas e caem direto nesta tela.
          </DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="py-2">
            <Button onClick={gerar} disabled={pending}>
              <Link2 className="size-4" /> Gerar link público
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {foraDoAr && (
              <p className="rounded-sm border border-destructive/40 px-3 py-2 text-xs text-destructive">
                {link.ativo
                  ? "Link expirado — o cliente vê “Link indisponível”. Ajuste a data e salve."
                  : "Link revogado — o cliente vê “Link indisponível”. Ligue “Link ativo” e salve."}{" "}
                Regerar troca só o endereço, não reativa.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Endereço do link</Label>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate rounded-sm bg-muted px-3 py-2 font-mono text-xs">{url}</p>
                <Button variant="outline" size="icon" onClick={copiar} title="Copiar link" aria-label="Copiar link">
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title="Abrir link"
                  aria-label="Abrir link"
                  render={<a href={url!} target="_blank" rel="noopener" />}
                >
                  <ExternalLink className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-sm border p-3">
              <div>
                <p className="text-sm font-medium">Link ativo</p>
                <p className="text-xs text-muted-foreground">Desligue para revogar o acesso imediatamente.</p>
              </div>
              <Switch checked={ativo} onCheckedChange={(v: boolean) => setAtivo(v)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expira-inputs" className="text-xs text-muted-foreground">
                Expira em (opcional)
              </Label>
              <Input
                id="expira-inputs"
                type="datetime-local"
                value={expira}
                onChange={(e) => setExpira(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Vazio = não expira. Depois da data o link para de abrir.
              </p>
            </div>
          </div>
        )}

        {link && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={gerar} disabled={pending} title="Gera um novo endereço e invalida o atual">
              <RefreshCw className="size-4" /> Regerar link
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
