"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import {
  anexarComprovantePagamento,
  comprovantesDoLancamento,
  removerComprovantePagamento,
} from "@/modules/financeiro/folha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatarData } from "@/lib/utils";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Anexo = { id: string; nome: string; tamanho: number; createdAt: Date };

/**
 * Gerenciar comprovantes de um pagamento JÁ pago (G6/B3) — fora do fluxo de pagar, para
 * quem esqueceu de anexar na hora ou quer trocar/complementar depois. Mesma tabela e mesma
 * rota de upload da F8; a diferença é que aqui também lista e permite remover.
 *
 * Fecha o beco que a F8 deixou: um usuário só-`folha_pj` (sem `financeiro:gerir`) via "sem
 * anexo" na linha e não tinha como resolver — só quem tinha acesso a Lançamentos conseguia.
 */
export function GerenciarComprovantesDialog({
  pagamento,
  onClose,
}: {
  pagamento: { id: string; projetistaNome: string; lancamentoId: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [anexos, setAnexos] = useState<Anexo[] | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, start] = useTransition();
  const [pending, startAcao] = useTransition();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lancamentoId = pagamento?.lancamentoId ?? null;

  function carregar() {
    if (!lancamentoId) return;
    start(async () => {
      const r = await comprovantesDoLancamento(lancamentoId);
      if (r.ok) {
        setAnexos(r.anexos);
        setSemPermissao(false);
      } else {
        setAnexos(null);
        setSemPermissao(true);
      }
    });
  }

  // Recarrega a cada abertura (dialog controlado por prop, não por trigger interno).
  useEffect(() => {
    if (pagamento) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagamento?.id]);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file || !lancamentoId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/financeiro/folha-projetistas/comprovante", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await anexarComprovantePagamento({ lancamentoId, meta });
      if (r.ok) {
        toast.success("Comprovante anexado.");
        if (fileRef.current) fileRef.current.value = "";
        carregar();
        router.refresh();
      } else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function remover(id: string) {
    startAcao(async () => {
      const r = await removerComprovantePagamento({ id });
      if (r.ok) {
        toast.success("Comprovante removido.");
        carregar();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Comprovantes do pagamento</DialogTitle>
          <DialogDescription>{pagamento?.projetistaNome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {carregando ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : semPermissao ? (
            <p className="text-xs text-warning">Sem permissão para ver os comprovantes deste pagamento.</p>
          ) : anexos === null ? null : anexos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum comprovante ainda.</p>
          ) : (
            <ul className="divide-y rounded-sm border text-sm">
              {anexos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="min-w-0 truncate">
                    {a.nome} <span className="font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
                    <span className="block text-xs text-muted-foreground">{formatarData(a.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Baixar"
                      render={<a href={`/api/financeiro/folha-projetistas/comprovante/${a.id}`} />}
                    >
                      <Download className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover"
                      onClick={() => remover(a.id)}
                      disabled={pending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input ref={fileRef} type="file" className="text-xs" disabled={busy} />
            <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
              <Upload className="size-3.5" /> {busy ? "Enviando…" : "Anexar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
