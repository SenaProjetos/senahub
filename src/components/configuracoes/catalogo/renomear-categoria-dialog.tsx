"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Renomeia uma categoria em todas as disciplinas dela de uma vez (nome vazio = tirar a categoria). */
export function RenomearCategoriaDialog({
  categoria,
  quantas,
  pending,
  onSalvar,
  onFechar,
}: {
  categoria: string;
  quantas: number;
  pending: boolean;
  onSalvar: (novo: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState(categoria);
  const limpo = nome.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear categoria</DialogTitle>
          <DialogDescription>
            Vale para as {quantas} disciplina(s) de &ldquo;{categoria}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="renomear-categoria-nome">Nome da categoria</Label>
          <Input
            id="renomear-categoria-nome"
            value={nome}
            maxLength={60}
            autoFocus
            placeholder="CIVIL"
            onChange={(e) => setNome(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            {limpo === ""
              ? "Em branco, a categoria deixa de existir e as disciplinas vão para “Outras”."
              : "Usar o nome de outra categoria existente junta os dois grupos em um só."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar(nome)} disabled={pending || limpo === categoria}>
            {pending ? "Salvando…" : limpo === "" ? "Remover categoria" : "Renomear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
