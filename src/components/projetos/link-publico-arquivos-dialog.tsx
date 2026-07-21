"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Link2, RefreshCw, Share2, ExternalLink } from "lucide-react";
import { gerarLinkArquivos, atualizarLinkArquivos } from "@/modules/projetos/arquivos/link-publico-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type LinkData = {
  token: string;
  ativo: boolean;
  expiraEm: string | null;
  disciplinaIds: string[];
};

/** ISO (UTC) → valor de `<input type="datetime-local">` (horário local, sem segundos). */
function isoParaLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function LinkPublicoArquivosButton({
  projetoId,
  baseUrl,
  disciplinas,
  link,
}: {
  projetoId: string;
  baseUrl: string;
  disciplinas: { id: string; nome: string }[];
  link: LinkData | null;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();

  const [ativo, setAtivo] = useState(link?.ativo ?? true);
  const [expira, setExpira] = useState(isoParaLocal(link?.expiraEm ?? null));
  const [sel, setSel] = useState<Set<string>>(new Set(link?.disciplinaIds ?? []));

  // Sincroniza o estado local quando o link muda (após gerar/regerar via router.refresh).
  const [snap, setSnap] = useState(link?.token ?? "");
  if ((link?.token ?? "") !== snap) {
    setSnap(link?.token ?? "");
    setAtivo(link?.ativo ?? true);
    setExpira(isoParaLocal(link?.expiraEm ?? null));
    setSel(new Set(link?.disciplinaIds ?? []));
  }

  const url = link ? `${baseUrl}/p/arquivos/${link.token}` : null;

  function alternar(id: string) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function gerar() {
    start(async () => {
      const r = await gerarLinkArquivos({ projetoId });
      if (r.ok) {
        toast.success(link ? "Link regerado. O anterior deixou de funcionar." : "Link público gerado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvar() {
    start(async () => {
      const r = await atualizarLinkArquivos({
        projetoId,
        disciplinaIds: [...sel],
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
            <Share2 className="size-3.5" /> Link público
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link público de arquivos</DialogTitle>
          <DialogDescription>
            Acesso externo (sem login) somente para visualizar e baixar os arquivos aprovados das disciplinas
            selecionadas. Alterar a seleção reflete no mesmo link.
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
              <Switch checked={ativo} onCheckedChange={(v) => setAtivo(v)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expira" className="text-xs text-muted-foreground">
                Expira em (opcional)
              </Label>
              <Input
                id="expira"
                type="datetime-local"
                value={expira}
                onChange={(e) => setExpira(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Disciplinas liberadas</Label>
              {disciplinas.length === 0 ? (
                <p className="text-sm text-muted-foreground">O projeto não tem disciplinas.</p>
              ) : (
                <ul className="max-h-52 space-y-1 overflow-y-auto rounded-sm border p-2">
                  {disciplinas.map((d) => (
                    <li key={d.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/50">
                        <Checkbox checked={sel.has(d.id)} onCheckedChange={() => alternar(d.id)} />
                        <span className="truncate">{d.nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Somente arquivos aprovados (validados) das disciplinas marcadas ficam visíveis.
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
