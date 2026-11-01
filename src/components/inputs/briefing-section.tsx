"use client";

import { useState } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { salvarBriefing } from "@/modules/inputs/actions";
import { BriefingForm } from "./briefing-form";
import { BriefingPersonalizar } from "./briefing-personalizar";
import {
  aplicarOcultos,
  filtrarSecoes,
  type OcultosBriefing,
  type StatusBriefing,
} from "@/modules/inputs/briefing-schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<StatusBriefing, string> = {
  nao_iniciado: "Não iniciado",
  em_preenchimento: "Em preenchimento",
  completo: "Completo",
};
const STATUS_TONE: Record<StatusBriefing, string> = {
  nao_iniciado: "text-muted-foreground",
  em_preenchimento: "border-warning/40 text-warning",
  completo: "border-success/40 text-success",
};

/** Seção "Briefing de Start" da aba Inputs — salva via Server Action (uso interno). */
export function BriefingSection({
  projetoId,
  respostasIniciais,
  disciplinas,
  canEdit,
  status,
  ocultos,
}: {
  projetoId: string;
  respostasIniciais: Record<string, unknown>;
  disciplinas: string[];
  canEdit: boolean;
  status: StatusBriefing;
  ocultos: OcultosBriefing;
}) {
  const [personalizando, setPersonalizando] = useState(false);
  const doProjeto = filtrarSecoes(disciplinas);
  const secoes = aplicarOcultos(doProjeto, ocultos);
  const totalCampos = doProjeto.reduce((n, s) => n + s.campos.length, 0);
  const qtdOcultos = totalCampos - secoes.reduce((n, s) => n + s.campos.length, 0);

  async function onSalvar(respostas: Record<string, unknown>) {
    const r = await salvarBriefing({ projetoId, respostas });
    if (r.ok) return { ok: true as const };
    const campos = Object.fromEntries(
      Object.entries(r.fieldErrors ?? {}).flatMap(([k, v]) => (v[0] ? [[k, v[0]]] : [])),
    );
    return { ok: false as const, error: r.error, campos };
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">Briefing de Start</CardTitle>
          <CardDescription>
            Briefing técnico do cliente para iniciar os projetos complementares.
            {qtdOcultos === 1 && " 1 pergunta oculta neste projeto."}
            {qtdOcultos > 1 && ` ${qtdOcultos} perguntas ocultas neste projeto.`}
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={STATUS_TONE[status]}>
            {STATUS_LABEL[status]}
          </Badge>
          {canEdit && (
            <Button
              variant={personalizando ? "default" : "outline"}
              size="sm"
              aria-pressed={personalizando}
              onClick={() => setPersonalizando((v) => !v)}
            >
              {personalizando ? <Check className="size-3.5" /> : <SlidersHorizontal className="size-3.5" />}
              {personalizando ? "Concluir" : "Personalizar"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {personalizando && <BriefingPersonalizar projetoId={projetoId} secoes={doProjeto} ocultos={ocultos} />}
        {!personalizando && secoes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Todas as perguntas do briefing estão ocultas neste projeto — o cliente não vê o briefing no link.
          </p>
        )}
        {/* Montado mesmo escondido: o que foi digitado e o autosave pendente sobrevivem ao Personalizar. */}
        <div className={personalizando || secoes.length === 0 ? "hidden" : undefined}>
          <BriefingForm
            respostasIniciais={respostasIniciais}
            secoes={secoes}
            canEdit={canEdit}
            onSalvar={onSalvar}
          />
        </div>
      </CardContent>
    </Card>
  );
}
