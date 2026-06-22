"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Archive, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cancelarOuArquivarProjeto } from "@/modules/projetos/actions";

export function ProjetoAcoesMenu({
  projetoId,
  situacao,
}: {
  projetoId: string;
  situacao: string;
}) {
  const [dialog, setDialog] = useState<"cancelar" | "arquivar" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();

  const ativo = situacao === "em_andamento";

  const handleConfirm = () => {
    if (!dialog) return;
    startTransition(async () => {
      const res = await cancelarOuArquivarProjeto({
        projetoId,
        situacao: dialog === "cancelar" ? "cancelado" : "arquivado",
        motivo: motivo || undefined,
      });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao atualizar projeto.");
      } else {
        toast.success(dialog === "cancelar" ? "Projeto cancelado." : "Projeto arquivado.");
        setDialog(null);
        setMotivo("");
      }
    });
  };

  const handleReativar = () => {
    startTransition(async () => {
      const res = await cancelarOuArquivarProjeto({ projetoId, situacao: "em_andamento" });
      if (!res?.ok) {
        toast.error(res?.ok === false ? res.error : "Erro ao reativar.");
      } else {
        toast.success("Projeto reativado.");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" className="size-8" aria-label="Mais ações">
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {ativo ? (
            <>
              <DropdownMenuItem onSelect={() => setDialog("arquivar")} className="gap-2">
                <Archive className="size-4" /> Arquivar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setDialog("cancelar")}
                className="gap-2 text-destructive"
              >
                <XCircle className="size-4" /> Cancelar projeto
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={handleReativar} className="gap-2" disabled={pending}>
              <RefreshCw className="size-4" /> Reativar projeto
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>
            {dialog === "cancelar" ? "Cancelar projeto" : "Arquivar projeto"}
          </DialogTitle>
          <DialogDescription>
            {dialog === "cancelar"
              ? "O projeto será marcado como cancelado e os membros serão notificados."
              : "O projeto será arquivado e removido do painel ativo."}
          </DialogDescription>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="motivo-proj">Motivo (opcional)</Label>
              <textarea
                id="motivo-proj"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Informe o motivo..."
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog(null)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant={dialog === "cancelar" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={pending}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
