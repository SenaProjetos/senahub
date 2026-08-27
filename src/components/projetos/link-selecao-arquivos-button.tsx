"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Share2 } from "lucide-react";
import { criarLinkArquivos } from "@/modules/projetos/arquivos/link-publico-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Publica os arquivos marcados num link público próprio (escopo `selecao`).
 *
 * Vive fora das duas barras de seleção porque as duas telas de arquivos precisam dele:
 * a tabela nova (v2) e o explorer antigo, que ainda é o caminho de produção enquanto
 * `NEXT_PUBLIC_DOCUMENTOS_V2` estiver desligado. Uma cópia em cada lado é como um dos
 * dois fica para trás.
 *
 * Diferente do link por disciplina, aqui a escolha manual vence o recorte: dá para
 * mandar uma revisão antiga ou um backup do modelo de propósito. A lixeira continua de
 * fora — o servidor descarta o que estiver lá.
 */
export function LinkSelecaoArquivosButton({
  projetoId,
  uploadIds,
  className,
}: {
  projetoId: string;
  uploadIds: string[];
  className?: string;
}) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState<string | null>(null);

  const n = uploadIds.length;

  function criar() {
    start(async () => {
      const r = await criarLinkArquivos({
        projetoId,
        nome: nome.trim() || undefined,
        escopo: "selecao",
        disciplinaIds: [],
        uploadIds,
      });
      if (r.ok) {
        setUrl(`${window.location.origin}/p/arquivos/${r.data.token}`);
        toast.success("Link criado com os arquivos selecionados.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" className={className} onClick={() => setAberto(true)} disabled={pendente}>
        <Share2 className="size-3.5" /> Link público
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) {
            setNome("");
            setUrl(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link público destes arquivos</DialogTitle>
            <DialogDescription>
              Acesso externo, sem login, só para ver e baixar. O link mostra exatamente {n}{" "}
              {n === 1 ? "arquivo marcado" : "arquivos marcados"} — inclusive revisão antiga ou backup do modelo,
              se foi o que se marcou. Arquivo na lixeira não entra.
            </DialogDescription>
          </DialogHeader>

          {url ? (
            <div className="space-y-2">
              <p className="rounded-sm bg-muted px-3 py-2 font-mono text-xs break-all">{url}</p>
              <p className="text-xs text-muted-foreground">
                Para renomear, dar validade ou revogar este link, use &ldquo;Link público&rdquo; no topo da tela.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="nome-link-selecao">Nome do link (opcional)</Label>
              <Input
                id="nome-link-selecao"
                placeholder="Prefeitura, cliente final, consultor…"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            {url ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copiado.");
                  }}
                >
                  Copiar link
                </Button>
                <Button onClick={() => setAberto(false)}>Fechar</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
                  Cancelar
                </Button>
                <Button onClick={criar} disabled={pendente}>
                  {pendente ? "Criando…" : "Criar link"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
