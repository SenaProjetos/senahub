"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { concluirProjeto } from "@/modules/projetos/actions";

/** Chama `concluirProjeto` e devolve o resultado em toast. Compartilhado pela faixa e pelo ⋯. */
export function useConcluirProjeto(projetoId: string) {
  const [pending, startTransition] = useTransition();
  const concluir = () => {
    startTransition(async () => {
      const res = await concluirProjeto({ projetoId });
      if (!res?.ok) toast.error(res?.ok === false ? res.error : "Erro ao concluir o projeto.");
      else toast.success("Projeto concluído.");
    });
  };
  return { concluir, pending };
}

const chaveDispensa = (projetoId: string) => `senahub:concluir-projeto-dispensado:${projetoId}`;

/**
 * Faixa que sugere concluir o projeto quando todas as disciplinas estão aprovadas. Só é
 * renderizada pelo layout quando `motivoParaNaoConcluirProjeto` devolve `null` e a pessoa
 * pode gerir. "Agora não" esconde a faixa deste projeto só para quem dispensou (localStorage);
 * o item "Concluir projeto" do ⋯ continua lá.
 */
export function FaixaConcluirProjeto({ projetoId, totalDisciplinas }: { projetoId: string; totalDisciplinas: number }) {
  const { concluir, pending } = useConcluirProjeto(projetoId);
  // Começa escondida e só aparece depois de ler o localStorage, para não piscar quando já foi dispensada.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    try {
      setVisivel(localStorage.getItem(chaveDispensa(projetoId)) == null);
    } catch {
      setVisivel(true);
    }
  }, [projetoId]);

  const dispensar = () => {
    setVisivel(false);
    try {
      localStorage.setItem(chaveDispensa(projetoId), "1");
    } catch {
      // sem armazenamento: a faixa volta na próxima visita, o que é inofensivo
    }
  };

  if (!visivel) return null;

  const texto =
    totalDisciplinas === 1
      ? "A disciplina do projeto está aprovada."
      : `Todas as ${totalDisciplinas} disciplinas estão aprovadas.`;

  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border border-status-aprovado/40 bg-status-aprovado/10 px-3 py-2 text-sm"
    >
      <CheckCircle2 className="size-4 shrink-0 text-status-aprovado" aria-hidden />
      <p className="min-w-0 flex-1">
        {texto} Marcar o projeto como concluído?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={concluir} disabled={pending}>
          Marcar como concluído
        </Button>
        <Button size="sm" variant="ghost" onClick={dispensar} disabled={pending}>
          <X className="size-4" aria-hidden /> Agora não
        </Button>
      </div>
    </div>
  );
}
