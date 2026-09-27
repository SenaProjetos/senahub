"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AvisoGeralView, type PerfilAlvo, type UsuarioAlvo } from "@/components/configuracoes/aviso-geral-view";

/** Botão "Novo aviso" do cabeçalho de Avisos gerais: o formulário abre numa janela. */
export function NovoAvisoDialog({ usuarios, perfis }: { usuarios: UsuarioAlvo[]; perfis: PerfilAlvo[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" data-tour="aviso-novo">
            <Plus className="size-4" /> Novo aviso
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo aviso</DialogTitle>
          <DialogDescription>
            Aparece em tela cheia para o destinatário e pode exigir confirmação de leitura.
          </DialogDescription>
        </DialogHeader>
        <AvisoGeralView usuarios={usuarios} perfis={perfis} onConcluido={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}
