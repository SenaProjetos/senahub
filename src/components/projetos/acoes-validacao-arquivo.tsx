"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, XCircle } from "lucide-react";
import {
  validarArquivo,
  reverterValidacaoArquivo,
  solicitarAjusteArquivo,
} from "@/modules/uploads/actions";
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
 * Controles de validação parcial de um único arquivo (upload de disciplina):
 * validar · desfazer · solicitar ajuste (com motivo). Compartilhado pelo card da
 * disciplina e pelo explorer de arquivos. Só deve ser renderizado para quem tem
 * `uploads:validar` e enquanto a entrega não foi finalizada.
 */
export function AcoesValidacaoArquivo({
  uploadId,
  nomeArquivo,
  validado,
}: {
  uploadId: string;
  nomeArquivo: string;
  validado: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  function validar() {
    start(async () => {
      const r = await validarArquivo({ uploadId });
      if (r.ok) {
        toast.success("Arquivo validado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function reverter() {
    start(async () => {
      const r = await reverterValidacaoArquivo({ uploadId });
      if (r.ok) {
        toast.success("Validação desfeita.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function solicitar() {
    if (!motivo.trim()) return;
    start(async () => {
      const r = await solicitarAjusteArquivo({ uploadId, motivo: motivo.trim() });
      if (r.ok) {
        toast.success("Ajuste solicitado.");
        setAjusteOpen(false);
        setMotivo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (validado) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 px-1.5 text-xs text-muted-foreground"
        onClick={reverter}
        disabled={pending}
        title="Desfazer validação"
      >
        desfazer
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-xs text-status-aprovado"
        onClick={validar}
        disabled={pending}
        title="Validar arquivo"
      >
        <ShieldCheck className="size-3.5" /> validar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1 text-xs text-warning"
        onClick={() => setAjusteOpen(true)}
        disabled={pending}
        title="Solicitar ajuste"
        aria-label="Solicitar ajuste"
      >
        <XCircle className="size-3.5" />
      </Button>
      <Dialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar ajuste</DialogTitle>
            <DialogDescription className="truncate">{nomeArquivo}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`motivo-${uploadId}`}>Motivo do ajuste</Label>
            <Input
              id={`motivo-${uploadId}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: prancha sem selo / cota errada na planta baixa"
              maxLength={500}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O projetista será notificado e poderá reenviar apenas este arquivo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={solicitar} disabled={pending || !motivo.trim()}>
              Solicitar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
