"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, SlidersHorizontal } from "lucide-react";
import { removerAtribuicao, salvarAtribuicao } from "@/modules/planejamento/recursos-actions";
import { linhaAceitaAtribuicao, type Papel, type TipoLinha } from "@/modules/planejamento/recursos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { cn } from "@/lib/utils";

/**
 * Escolher quem faz a linha direto na célula "Nomes dos recursos" (reunião de 08/10/2026, item 2),
 * como no Project: uma lista só de nomes, que grava ao clicar — sem abrir a configuração da linha
 * inteira nem o "Adicionar" + "Salvar" do diálogo. Papel e horas continuam no diálogo ("Papel e
 * horas…"). Quem entra aqui recebe o papel de projetista (estagiário, o de estagiário), com 0 h.
 *
 * Linha que não aceita pessoa (agrupamento, tipo que não é atividade nem marco) e etapa de terceiro
 * ficam como estão: só o conteúdo da célula, sem lista.
 */
type Pessoa = { id: string; name: string; image: string | null; role?: string; habilidades?: string[] };

type LinhaDaCelula = {
  id: string;
  tipoEap: TipoLinha;
  ehResumo: boolean;
  deTerceiro: boolean;
  /** Disciplina da linha — quem tem habilidade com o mesmo nome vem antes dos demais. */
  disciplinaNome?: string | null;
  atribuicoes: { id: string; userId: string | null }[];
};

export function RecursosDaCelula({
  linha,
  pessoas,
  onAbrirLinha,
  children,
}: {
  linha: LinhaDaCelula;
  pessoas: Pessoa[];
  /** Abre o diálogo completo da linha (papel, horas, principal). */
  onAbrirLinha?: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState("");

  if (!linhaAceitaAtribuicao(linha).ok || linha.deTerceiro) return <>{children}</>;

  const naLinha = new Set(linha.atribuicoes.map((a) => a.userId).filter((u): u is string => u != null));
  const q = busca.trim().toLowerCase();
  // Quem já está na linha primeiro, depois quem tem a habilidade da disciplina, depois a ordem alfabética que a lista já traz.
  const disciplina = linha.disciplinaNome?.trim().toLowerCase() ?? null;
  const temHabilidade = (p: Pessoa) => !!disciplina && (p.habilidades ?? []).some((h) => h.trim().toLowerCase() === disciplina);
  const lista = pessoas
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        Number(naLinha.has(b.id)) - Number(naLinha.has(a.id)) || Number(temHabilidade(b)) - Number(temHabilidade(a)),
    );

  const papelPadrao = (p: Pessoa): Papel => (p.role === "estagiario" ? "est" : "pro");

  function adicionar(p: Pessoa) {
    start(async () => {
      const r = await salvarAtribuicao({ tarefaId: linha.id, userId: p.id, papel: papelPadrao(p), horasPrevistas: 0 });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function tirar(p: Pessoa) {
    const ids = linha.atribuicoes.filter((a) => a.userId === p.id).map((a) => a.id);
    const ok = await confirm({
      title: `Tirar ${p.name} desta linha?`,
      description: ids.length > 1 ? "Ela está na linha em mais de um papel — todos saem." : undefined,
      confirmLabel: "Tirar",
    });
    if (!ok) return;
    start(async () => {
      for (const id of ids) {
        const r = await removerAtribuicao({ id });
        if (!r.ok) {
          toast.error(r.error);
          break;
        }
      }
      router.refresh();
    });
  }

  return (
    <Popover onOpenChange={(o) => !o && setBusca("")}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Escolher quem faz esta atividade"
            aria-label="Escolher recursos da linha"
            onDoubleClick={(e) => e.stopPropagation()}
            className="flex min-h-5 w-full min-w-0 items-center rounded-sm text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2 p-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa…"
          aria-label="Buscar pessoa"
          className="h-8 text-xs"
        />
        <ul className="max-h-60 overflow-y-auto">
          {lista.map((p) => {
            const dentro = naLinha.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (dentro ? void tirar(p) : adicionar(p))}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-60",
                    dentro && "font-medium",
                  )}
                >
                  <AvatarUsuario nome={p.name} image={p.image} size="sm" className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {!dentro && temHabilidade(p) && <span className="shrink-0 text-[10px] text-muted-foreground">{linha.disciplinaNome}</span>}
                  {dentro && <Check className="size-3.5 shrink-0 text-primary" aria-label="na linha" />}
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">Ninguém com esse nome.</li>}
        </ul>
        {onAbrirLinha && (
          <Button size="xs" variant="ghost" className="justify-start" onClick={onAbrirLinha}>
            <SlidersHorizontal className="size-3" aria-hidden /> Papel e horas…
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
