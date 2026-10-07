"use client";

import { salvarBriefing } from "@/modules/inputs/actions";
import { BriefingForm } from "./briefing-form";
import { filtrarSecoes, type StatusBriefing } from "@/modules/inputs/briefing-schema";
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
}: {
  projetoId: string;
  respostasIniciais: Record<string, unknown>;
  disciplinas: string[];
  canEdit: boolean;
  status: StatusBriefing;
}) {
  const secoes = filtrarSecoes(disciplinas);

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
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Briefing de Start</CardTitle>
          <CardDescription>Briefing técnico do cliente para iniciar os projetos complementares.</CardDescription>
        </div>
        <Badge variant="outline" className={STATUS_TONE[status]}>
          {STATUS_LABEL[status]}
        </Badge>
      </CardHeader>
      <CardContent>
        <BriefingForm
          respostasIniciais={respostasIniciais}
          secoes={secoes}
          canEdit={canEdit}
          onSalvar={onSalvar}
        />
      </CardContent>
    </Card>
  );
}
