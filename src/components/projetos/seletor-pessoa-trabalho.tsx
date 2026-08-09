"use client";

import { useSetParams } from "@/lib/use-set-param";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EU = "__eu__";

/**
 * Troca de quem é o "Meu trabalho" exibido. Só é renderizado para quem tem `recursos:ver` — a
 * página decide, não este componente: seletor escondido não é gate.
 */
export function SeletorPessoaTrabalho({
  pessoas,
  selecionado,
}: {
  pessoas: { id: string; name: string; cargo: string | null }[];
  /** `null` = o próprio usuário. */
  selecionado: string | null;
}) {
  const setParams = useSetParams();

  return (
    <Select
      value={selecionado ?? EU}
      onValueChange={(v) => setParams({ usuario: !v || v === EU ? null : v })}
    >
      <SelectTrigger className="h-9 w-[16rem]" aria-label="Ver o trabalho de outra pessoa">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={EU}>Meu trabalho</SelectItem>
        {pessoas.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
            {p.cargo ? ` — ${p.cargo}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
