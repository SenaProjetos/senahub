"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLASSE_TEXTAREA } from "@/components/atas/motivo-dialog";
import { salvarNotaDoMarco } from "@/modules/portal/agenda/actions";
import { NOTA_MAX } from "@/modules/portal/agenda/marcos";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";

/**
 * Nota de motivo de um marco da agenda (spec 2026-11-23-portal-agenda-contrato-design.md): texto da coordenação que o cliente
 * lê junto das duas datas. O diálogo avisa que o texto vai para o cliente; o servidor confere de novo o tamanho.
 */
export function NotaDialog({
  projetoId,
  marco,
  onFechar,
}: {
  projetoId: string;
  /** `null` = fechado. */
  marco: { marcoId: string; titulo: string; nota: string | null } | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  const ids = { campo: useId(), ajuda: useId(), erro: useId() };

  useEffect(() => {
    if (marco) {
      setNota(marco.nota ?? "");
      setErro(null);
    }
  }, [marco]);

  function salvar() {
    if (!marco) return;
    setErro(null);
    start(async () => {
      const r = await salvarNotaDoMarco({ projetoId, marcoId: marco.marcoId, nota }).catch(() => null);
      if (!r) return void toast.error(FALHA);
      if (!r.ok) return setErro(r.error);
      toast.success("Nota salva.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={marco !== null} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{marco?.nota ? "Editar nota" : "Escrever nota"}</DialogTitle>
          <DialogDescription className="break-words">
            {marco?.titulo}. O cliente lê esta nota junto das datas do marco — explique o motivo com cuidado.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor={ids.campo}>Nota para o cliente</Label>
          <textarea
            id={ids.campo}
            rows={4}
            maxLength={NOTA_MAX}
            aria-describedby={erro ? `${ids.ajuda} ${ids.erro}` : ids.ajuda}
            className={CLASSE_TEXTAREA}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            disabled={enviando}
          />
          <p id={ids.ajuda} className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>Ex.: Aguardando a aprovação do projeto básico pelo cliente.</span>
            <span className="font-mono">
              {nota.length}/{NOTA_MAX}
            </span>
          </p>
          {erro && (
            <p id={ids.erro} role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button onClick={salvar} disabled={enviando || nota.trim().length === 0}>
            <span role="status">{enviando ? "Salvando…" : "Salvar nota"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
