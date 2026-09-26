"use client";

import { useEffect, useState } from "react";
import { buscarTarefasPonto } from "@/modules/ponto/actions";
import type { TarefaDoPonto } from "@/modules/ponto/tarefa-ponto-service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM_TAREFA = "__sem_tarefa";

/**
 * Tarefa da jornada (F6 — D20). OPCIONAL e discreto: o ponto não pode virar burocracia (Q20).
 * Só aparece quando há projeto escolhido E a pessoa tem alguma tarefa aberta nele no período;
 * do contrário não ocupa lugar nenhum. O padrão é "sem tarefa" — quem não quer escolher bate
 * ponto como sempre bateu.
 *
 * A lista é a curta do servidor (`tarefasParaPonto`): só as tarefas abertas da própria pessoa,
 * no período — nunca todas as do projeto.
 */
export function SeletorTarefa({
  projetoId,
  value,
  onChange,
  tarefaAtual,
  disabled,
}: {
  /** Projeto REAL escolhido (nunca "sem projeto"/reunião). `null` esconde o seletor. */
  projetoId: string | null;
  /** Id da tarefa escolhida, ou "" para nenhuma. */
  value: string;
  onChange: (tarefaId: string) => void;
  /** Tarefa da sessão em curso — entra na lista mesmo se já saiu do período, para não sumir do seletor. */
  tarefaAtual?: { id: string; titulo: string } | null;
  disabled?: boolean;
}) {
  const [lista, setLista] = useState<TarefaDoPonto[] | null>(null);

  useEffect(() => {
    if (!projetoId) {
      setLista(null);
      return;
    }
    let vivo = true;
    setLista(null);
    buscarTarefasPonto(projetoId)
      .then((l) => vivo && setLista(l))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [projetoId]);

  if (!projetoId || lista == null) return null;

  const opcoes = [...lista];
  if (tarefaAtual && !opcoes.some((t) => t.id === tarefaAtual.id)) {
    opcoes.unshift({ id: tarefaAtual.id, titulo: tarefaAtual.titulo, prazo: null });
  }
  if (opcoes.length === 0) return null;

  return (
    <Select value={value || SEM_TAREFA} onValueChange={(v) => onChange(!v || v === SEM_TAREFA ? "" : v)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-full" aria-label="Tarefa (opcional)">
        <SelectValue placeholder="Tarefa (opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_TAREFA}>— sem tarefa</SelectItem>
        {opcoes.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.titulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
