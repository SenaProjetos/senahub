"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { definirDisciplinasNegociacao } from "@/modules/comercial/actions";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputMoeda } from "@/components/ui/input-moeda";

type Atual = { disciplinaId: string; nome: string; valor: number | null };

/**
 * Disciplinas de interesse da negociação: quais entram no escopo em conversa e, se já houver
 * número, quanto vale cada uma (opcional — ADR-13). Alimenta o filtro por disciplina do funil.
 * Não é a proposta: os itens da proposta é que viram as disciplinas do projeto no aceite.
 */
export function NegociacaoDisciplinasForm({
  negociacaoId,
  atuais,
  catalogo,
  podeGerir,
}: {
  negociacaoId: string;
  atuais: Atual[];
  catalogo: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selecao, setSelecao] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(atuais.map((d) => [d.disciplinaId, d.valor])),
  );

  // Catálogo ativo + as já ligadas que foram arquivadas depois: sem elas o chip sumiria e a
  // disciplina ficaria presa na negociação sem como ser vista.
  const opcoes = useMemo(() => {
    const porId = new Map(catalogo.map((d) => [d.id, d.nome]));
    for (const a of atuais) if (!porId.has(a.disciplinaId)) porId.set(a.disciplinaId, `${a.nome} (arquivada)`);
    return [...porId].map(([id, nome]) => ({ id, nome }));
  }, [catalogo, atuais]);

  const inicial = useMemo(() => JSON.stringify(atuais.map((d) => [d.disciplinaId, d.valor]).sort()), [atuais]);
  const atual = JSON.stringify(Object.entries(selecao).sort());
  const alterado = inicial !== atual;
  const total = Object.values(selecao).reduce<number>((s, v) => s + (v ?? 0), 0);
  const nomeDe = (id: string) => opcoes.find((o) => o.id === id)?.nome ?? id;

  function alternar(id: string) {
    setSelecao((s) => {
      const nova = { ...s };
      if (id in nova) delete nova[id];
      else nova[id] = null;
      return nova;
    });
  }

  function salvar() {
    start(async () => {
      const r = await definirDisciplinasNegociacao({
        negociacaoId,
        disciplinas: Object.entries(selecao).map(([disciplinaId, valor]) => ({ disciplinaId, valor })),
      });
      if (r.ok) {
        toast.success("Disciplinas atualizadas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (!podeGerir) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Disciplinas</p>
        {atuais.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma informada.</p>
        ) : (
          <ul className="text-sm">
            {atuais.map((d) => (
              <li key={d.disciplinaId}>
                {d.nome}
                {d.valor != null && <span className="ml-2 font-mono text-xs text-muted-foreground">{brl(d.valor)}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-sm border p-3" disabled={pending}>
      <legend className="px-1 text-sm font-medium">Disciplinas de interesse</legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Disciplinas do catálogo">
        {opcoes.map((o) => {
          const ativa = o.id in selecao;
          return (
            <Button
              key={o.id}
              type="button"
              size="sm"
              variant={ativa ? "default" : "outline"}
              aria-pressed={ativa}
              onClick={() => alternar(o.id)}
            >
              {o.nome}
            </Button>
          );
        })}
      </div>

      {Object.keys(selecao).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Valor por disciplina — opcional.</p>
          {Object.entries(selecao).map(([id, valor]) => (
            <div key={id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{nomeDe(id)}</span>
              <InputMoeda
                className="w-36"
                aria-label={`Valor de ${nomeDe(id)}`}
                value={valor}
                onChange={(v) => setSelecao((s) => ({ ...s, [id]: v }))}
              />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remover ${nomeDe(id)}`} onClick={() => alternar(id)}>
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          {total > 0 && <p className="text-right font-mono text-xs text-muted-foreground">Soma {brl(total)}</p>}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={salvar} disabled={pending || !alterado}>
          {pending ? "Salvando…" : "Salvar disciplinas"}
        </Button>
      </div>
    </fieldset>
  );
}
