"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, Undo2, XCircle } from "lucide-react";
import {
  validarArquivo,
  reverterValidacaoArquivo,
  solicitarAjusteArquivo,
} from "@/modules/uploads/actions";
import { BotaoFerramenta } from "@/components/pdf/botao-ferramenta";
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
 *
 * `compacto` = só ícones, com o nome e a função na dica (barra do visualizador de pranchas).
 */
export function AcoesValidacaoArquivo({
  uploadId,
  nomeArquivo,
  validado,
  compacto = false,
}: {
  uploadId: string;
  nomeArquivo: string;
  validado: boolean;
  compacto?: boolean;
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

  if (validado && compacto) {
    return (
      <BotaoFerramenta rotulo="Desfazer validação" dica="A prancha volta a aguardar validação." onClick={reverter} disabled={pending}>
        <Undo2 />
      </BotaoFerramenta>
    );
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
      {compacto ? (
        <>
          <BotaoFerramenta
            rotulo="Validar arquivo"
            dica="Dá a prancha por conferida e aceita nesta revisão."
            onClick={validar}
            disabled={pending}
            className="text-status-aprovado"
          >
            <ShieldCheck />
          </BotaoFerramenta>
          <BotaoFerramenta
            rotulo="Solicitar ajuste"
            dica="Devolve só este arquivo ao projetista, com o motivo."
            onClick={() => setAjusteOpen(true)}
            disabled={pending}
            className="text-warning"
          >
            <XCircle />
          </BotaoFerramenta>
        </>
      ) : (
        <>
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
        </>
      )}
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
