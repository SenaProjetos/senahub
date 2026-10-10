"use client";

import { useEffect, useState } from "react";
import { buscarTarefasPonto } from "@/modules/ponto/actions";
import type { TarefaDoPonto } from "@/modules/ponto/tarefa-ponto-service";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SEM_TAREFA = "__sem_tarefa";
const VER_OUTRAS = "__ver_outras";

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
    return [{ id: tarefaAtual.id, titulo: tarefaAtual.titulo, prazo: null, atrasada: false, grupo: "periodo" }, ...carga.lista];
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
  // "Outras da etapa" começam recolhidas (decisão 1 de 08/10/2026): a lista curta é o padrão.
  const [verOutras, setVerOutras] = useState(false);
  if (!opcoes || opcoes.length === 0) return null;

  const principais = opcoes.filter((t) => t.grupo === "periodo");
  const outras = opcoes.filter((t) => t.grupo === "etapa");
  // A escolhida estar entre as recolhidas abre o grupo — senão o seletor mostraria um valor sem item.
  const abertas = verOutras || outras.some((t) => t.id === value);

  return (
    <Select
      value={value || SEM_TAREFA}
      onValueChange={(v) => {
        if (v === VER_OUTRAS) return setVerOutras(true);
        onChange(!v || v === SEM_TAREFA ? "" : v);
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full" aria-label="Tarefa (opcional)">
        <SelectValue placeholder="Tarefa (opcional)" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_TAREFA}>— sem tarefa</SelectItem>
        {principais.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {rotuloTarefaPonto(t)}
          </SelectItem>
        ))}
        {outras.length > 0 &&
          (abertas ? (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Outras da etapa</SelectLabel>
                {outras.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {rotuloTarefaPonto(t)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          ) : (
            <SelectItem value={VER_OUTRAS} className="text-muted-foreground">
              Ver outras da etapa ({outras.length})
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

/** Título da tarefa com a marca de atraso — mesmo texto no seletor do computador e na gaveta do celular. */
export function rotuloTarefaPonto(t: Pick<TarefaDoPonto, "titulo" | "atrasada">): string {
  return t.atrasada ? `${t.titulo} · atrasada` : t.titulo;
}
