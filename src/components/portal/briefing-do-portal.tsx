"use client";

import { BriefingForm } from "@/components/inputs/briefing-form";
import { PerguntasExtrasForm, type ItemExtra } from "@/components/inputs/perguntas-extras-form";
import type { SecaoBriefing } from "@/modules/inputs/briefing-schema";
import { responderPerguntasDoPortal, salvarBriefingDoPortal } from "@/modules/portal/briefing-actions";

/**
 * Formulário do briefing no portal do cliente: o mesmo `BriefingForm` da equipe e do link, com as Server Actions do
 * portal, mais as perguntas extras do projeto. Encerrado pela equipe, tudo só leitura.
 */
export function BriefingDoPortal({
  projetoId,
  secoes,
  respostas,
  extras,
  somenteLeitura,
}: {
  projetoId: string;
  secoes: SecaoBriefing[];
  respostas: Record<string, unknown>;
  extras: ItemExtra[];
  somenteLeitura: boolean;
}) {
  async function onSalvar(enviadas: Record<string, unknown>) {
    const r = await salvarBriefingDoPortal({ projetoId, respostas: enviadas });
    if (r.ok) return { ok: true as const, descartados: r.data.descartados };
    const campos = Object.fromEntries(
      Object.entries(r.fieldErrors ?? {}).flatMap(([k, v]) => (v[0] ? [[k, v[0]]] : [])),
    );
    return { ok: false as const, error: r.error, campos };
  }

  async function salvarExtra(id: string, resposta: string) {
    const r = await responderPerguntasDoPortal({ projetoId, respostas: [{ id, resposta }] });
    return r.ok ? { ok: true as const, ignoradas: r.data.ignoradas } : { ok: false as const, erro: r.error };
  }

  return (
    <div className="space-y-6">
      {secoes.length > 0 && (
        <BriefingForm respostasIniciais={respostas} secoes={secoes} canEdit={!somenteLeitura} onSalvar={onSalvar} />
      )}

      {extras.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Perguntas extras</h2>
          <PerguntasExtrasForm itens={extras} salvar={salvarExtra} somenteLeitura={somenteLeitura} />
        </div>
      )}

      {secoes.length === 0 && extras.length === 0 && (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Não há nada para preencher neste formulário no momento. Aguarde o contato da equipe.
        </p>
      )}
    </div>
  );
}
