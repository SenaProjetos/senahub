"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { criarSobreposicao, renomearSobreposicao } from "@/modules/coordenacao/sobreposicao/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  projetoId: string;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /** Preenchido = renomear esta sobreposição; vazio = criar uma nova. */
  renomear?: { id: string; nome: string };
};

/** Pede só o nome do pavimento. Criar leva para a nova sobreposição (`?s=`); renomear só atualiza a tela. */
export function NovaSobreposicaoDialog({ projetoId, open, onOpenChange, renomear }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nome = String(new FormData(e.currentTarget).get("nome") ?? "");
    setErro("");
    start(async () => {
      if (renomear) {
        const r = await renomearSobreposicao({ id: renomear.id, nome });
        if (!r.ok) {
          setErro(r.fieldErrors?.nome?.[0] ?? r.error);
          return;
        }
        toast.success("Sobreposição renomeada.");
        onOpenChange(false);
        router.refresh();
        return;
      }
      const r = await criarSobreposicao({ projetoId, nome });
      if (!r.ok) {
        setErro(r.fieldErrors?.nome?.[0] ?? r.error);
        return;
      }
      toast.success("Sobreposição criada.");
      onOpenChange(false);
      router.push(`/projetos/${projetoId}/coordenacao/sobreposicao?s=${r.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{renomear ? "Renomear sobreposição" : "Nova sobreposição"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sobreposicao-nome">Nome do pavimento</Label>
            <Input
              id="sobreposicao-nome"
              name="nome"
              defaultValue={renomear?.nome ?? ""}
              placeholder="Ex.: Pavimento tipo"
              maxLength={60}
              autoFocus
              required
              aria-describedby={erro ? "sobreposicao-nome-erro" : undefined}
            />
            <FieldError campo="sobreposicao-nome" mensagem={erro} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {renomear ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
