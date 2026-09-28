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
 * Tarefas que o ponto oferece para um projeto: a lista curta do servidor (`tarefasParaPonto` — só
 * as abertas da própria pessoa, no período, nunca todas as do projeto) mais a tarefa da sessão em
 * curso, que entra mesmo se já saiu do período para não sumir da escolha.
 *
 * `null` enquanto carrega ou sem projeto. Compartilhado pelo seletor do computador e pela gaveta
 * do card de ponto do celular: as duas superfícies oferecem exatamente as mesmas tarefas.
 */
export function useTarefasDoPonto(
  projetoId: string | null,
  tarefaAtual?: { id: string; titulo: string } | null,
): TarefaDoPonto[] | null {
  // Guarda de qual projeto é a lista: no render logo depois de trocar de projeto o efeito ainda
  // não rodou, e sem a chave a lista do projeto anterior apareceria por um instante.
  const [carga, setCarga] = useState<{ projetoId: string; lista: TarefaDoPonto[] } | null>(null);

  useEffect(() => {
    if (!projetoId) return;
    let vivo = true;
    buscarTarefasPonto(projetoId)
      .then((lista) => vivo && setCarga({ projetoId, lista }))
      .catch(() => vivo && setCarga({ projetoId, lista: [] }));
    return () => {
      vivo = false;
    };
  }, [projetoId]);

  if (!projetoId || carga?.projetoId !== projetoId) return null;
  if (tarefaAtual && !carga.lista.some((t) => t.id === tarefaAtual.id)) {
    return [{ id: tarefaAtual.id, titulo: tarefaAtual.titulo, prazo: null }, ...carga.lista];
  }
  return carga.lista;
}

/**
 * Tarefa da jornada (F6 — D20). OPCIONAL e discreto: o ponto não pode virar burocracia (Q20).
 * Só aparece quando há projeto escolhido E a pessoa tem alguma tarefa aberta nele no período;
 * do contrário não ocupa lugar nenhum. O padrão é "sem tarefa" — quem não quer escolher bate
 * ponto como sempre bateu.
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
  /** Tarefa da sessão em curso — ver `useTarefasDoPonto`. */
  tarefaAtual?: { id: string; titulo: string } | null;
  disabled?: boolean;
}) {
  const opcoes = useTarefasDoPonto(projetoId, tarefaAtual);
  if (!opcoes || opcoes.length === 0) return null;

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
