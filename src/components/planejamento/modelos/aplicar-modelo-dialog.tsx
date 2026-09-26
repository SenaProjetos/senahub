"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ListTree } from "lucide-react";
import { aplicarModeloEap } from "@/modules/planejamento/modelos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PreviaDeModelo = {
  modeloId: string;
  modeloNome: string;
  criar: number;
  marcos: number;
  vinculos: number;
  terceiros: number;
  podadas: { disciplina: string; linhas: number }[];
  impedimento: string | null;
};

/**
 * Aplica um modelo de EAP no projeto (decisão #5). As prévias vêm calculadas do servidor — uma por
 * modelo, já sabendo quantas linhas criaria neste projeto e o que ficaria de fora.
 *
 * O impedimento aparece ANTES do clique, com a mesma frase que o servidor lançaria: EAP já preenchida,
 * linha de base aprovada ou projeto sem disciplina ligada ao catálogo.
 */
export function AplicarModeloDialog({ projetoId, previas }: { projetoId: string; previas: PreviaDeModelo[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(previas[0]?.modeloId ?? null);
  const [pending, start] = useTransition();

  if (previas.length === 0) return null;
  const previa = previas.find((p) => p.modeloId === escolhido) ?? previas[0];

  function aplicar() {
    if (!previa || previa.impedimento) return;
    start(async () => {
      const r = await aplicarModeloEap({ projetoId, modeloId: previa.modeloId });
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        `${r.data.criadas} linha(s) criadas do modelo${r.data.podadas > 0 ? ` (${r.data.podadas} de fora, por disciplina)` : ""}.`,
      );
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button variant="outline" onClick={() => setAberto(true)}>
        <ListTree className="size-3.5" /> Usar modelo de EAP
      </Button>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Usar modelo de EAP</DialogTitle>
          <DialogDescription>
            O modelo cria a estrutura, as durações e as dependências. As datas são do motor (ele reagenda
            logo depois), e o cronograma nasce em rascunho.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <ul className="divide-y rounded-sm border">
            {previas.map((p) => (
              <li key={p.modeloId}>
                <label className="flex cursor-pointer items-start gap-2 px-2.5 py-2">
                  <input
                    type="radio"
                    name="modelo-eap"
                    className="mt-1"
                    checked={p.modeloId === previa.modeloId}
                    onChange={() => setEscolhido(p.modeloId)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{p.modeloNome}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {p.criar} linha(s) neste projeto · {p.marcos} marcos · {p.vinculos} dependências
                      {p.terceiros > 0 ? ` · ${p.terceiros} de terceiro` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          {previa.podadas.length > 0 && (
            <div className="rounded-sm border px-3 py-2 text-xs">
              <p className="font-medium">Fica de fora (disciplina que este projeto não tem):</p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {previa.podadas.map((p) => (
                  <li key={p.disciplina}>
                    {p.disciplina} — {p.linhas} linha(s)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {previa.impedimento && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {previa.impedimento}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={pending || !!previa.impedimento || previa.criar === 0}>
            Criar {previa.criar} linha(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
