"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Upload } from "lucide-react";
import { anexarComprovantePagamento } from "@/modules/financeiro/folha/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ItemPago = { id: string; projetistaNome: string; lancamentoId: string };

/**
 * Lista pós-pagamento para anexar comprovante linha a linha (G7/B1) — o equivalente, para
 * lote/selecionados/"Pagar tudo", do 2º passo que a F8 deu ao "Pagar" individual. Um
 * comprovante por lançamento, não um arquivo só para N pagamentos: cada linha tem o seu
 * upload independente.
 *
 * Pular qualquer linha é sempre permitido (decisão do dono) — "Concluir" fecha o dialog com
 * o que já foi enviado, sem exigir 100%.
 */
export function ComprovantesEmLoteDialog({
  itens,
  onClose,
}: {
  itens: ItemPago[] | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (itens) {
      setEnviados(new Set());
      setEnviando(new Set());
    }
  }, [itens]);

  return (
    <Dialog open={!!itens} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anexar comprovantes</DialogTitle>
          <DialogDescription>
            Um arquivo por pagamento — pular qualquer linha é sempre permitido.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {itens?.map((item) => (
            <LinhaComprovante
              key={item.id}
              item={item}
              enviado={enviados.has(item.id)}
              enviando={enviando.has(item.id)}
              onEnviando={(v) =>
                setEnviando((s) => {
                  const n = new Set(s);
                  if (v) n.add(item.id);
                  else n.delete(item.id);
                  return n;
                })
              }
              onEnviado={() => {
                setEnviados((s) => new Set(s).add(item.id));
                router.refresh();
              }}
            />
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinhaComprovante({
  item,
  enviado,
  enviando,
  onEnviando,
  onEnviado,
}: {
  item: ItemPago;
  enviado: boolean;
  enviando: boolean;
  onEnviando: (v: boolean) => void;
  onEnviado: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    onEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/financeiro/folha-projetistas/comprovante", { method: "POST", body: fd });
      const meta = await res.json();
      if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
      const r = await anexarComprovantePagamento({ lancamentoId: item.lancamentoId, meta });
      if (r.ok) onEnviado();
      else toast.error(r.error);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      onEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-sm border p-2">
      <span className="min-w-0 flex-1 truncate text-sm">{item.projetistaNome}</span>
      {enviado ? (
        <span className="flex items-center gap-1 text-xs text-success">
          <Check className="size-3.5" /> Anexado
        </span>
      ) : (
        <>
          <Input ref={fileRef} type="file" className="h-8 w-40 text-xs" disabled={enviando} />
          <Button size="sm" variant="outline" onClick={enviar} disabled={enviando}>
            <Upload className="size-3.5" /> {enviando ? "…" : "Enviar"}
          </Button>
        </>
      )}
    </div>
  );
}
