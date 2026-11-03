"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { definirModeloDoProjeto } from "@/modules/inputs/modelo-actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Escolha do modelo de formulário do projeto. Trocar zera as ocultações do briefing (eram do
 * modelo anterior) e recalcula o status; as respostas ficam guardadas — por isso confirma antes.
 */
export function SeletorModeloBriefing({
  projetoId,
  atual,
  modelos,
  origem,
}: {
  projetoId: string;
  atual: string | null;
  modelos: { id: string; nome: string; padrao: boolean; ativo: boolean }[];
  /** De onde vem o modelo em uso: escolhido no projeto, herdado do cliente ou o padrão do sistema. */
  origem: "projeto" | "cliente" | "padrao" | "embutido";
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(atual ?? "");

  async function trocar(novo: string | null) {
    if (!novo || novo === valor) return;
    const nome = modelos.find((m) => m.id === novo)?.nome ?? "";
    // Confirma ANTES de abrir a transição (o diálogo não pode ficar dentro dela).
    const ok = await confirm({
      title: `Usar o modelo “${nome}” neste projeto?`,
      description:
        "As perguntas ocultas neste projeto voltam a aparecer e o status do briefing é recalculado. As respostas já dadas ficam guardadas: as perguntas que existem nos dois modelos aproveitam a resposta.",
      confirmLabel: "Trocar modelo",
    });
    if (!ok) return;
    start(async () => {
      try {
        const r = await definirModeloDoProjeto({ projetoId, modeloId: novo });
        if (r.ok) {
          setValor(novo);
          toast.success("Modelo do formulário alterado.");
          router.refresh();
        } else toast.error(r.error);
      } catch {
        toast.error("Não foi possível trocar o modelo. Verifique a conexão e tente de novo.");
      }
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-sm border bg-muted/30 px-3 py-2">
      {/* (o aviso de origem vem logo depois do seletor) */}
      <Label htmlFor="modelo-briefing" className="text-xs text-muted-foreground">
        Modelo do formulário
      </Label>
      <Select value={valor || undefined} onValueChange={trocar} disabled={pending}>
        <SelectTrigger id="modelo-briefing" className="w-64 max-w-full">
          <SelectValue placeholder="Modelo padrão" />
        </SelectTrigger>
        <SelectContent>
          {modelos.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.nome}
              {m.padrao ? " (padrão)" : ""}
              {!m.ativo ? " (arquivado)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {origem !== "projeto" && (
        <span className="text-xs text-muted-foreground">
          {origem === "cliente" ? "Herdado do formulário padrão do cliente." : "Vem do modelo padrão do sistema."}
        </span>
      )}
    </div>
  );
}
