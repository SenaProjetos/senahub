import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABEL, STATUS_TONE } from "@/components/inputs/briefing-status";
import type { BriefingDoPortal } from "@/modules/portal/briefing-queries";
import { fraseEncerradoPelaEquipe, fraseProgressoBriefing } from "@/modules/portal/briefing-regras";

/**
 * Card "Briefing do projeto" da página do projeto no portal. Quem renderiza só o monta quando a equipe pediu o
 * briefing pelo portal (`briefingDoPortal` ≠ null).
 */
export function BriefingCard({
  projetoId,
  resumo,
}: {
  projetoId: string;
  resumo: Pick<BriefingDoPortal, "situacao" | "status" | "progresso" | "encerradoEm">;
}) {
  const encerrado = resumo.situacao === "encerrado";
  const progresso = fraseProgressoBriefing(resumo.progresso);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden /> Briefing do projeto
        </CardTitle>
        <Badge variant="outline" className={STATUS_TONE[resumo.status]}>
          {STATUS_LABEL[resumo.status]}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-sm text-muted-foreground">
          {progresso && <p>{progresso}</p>}
          {encerrado && resumo.encerradoEm && <p>{fraseEncerradoPelaEquipe(resumo.encerradoEm)}</p>}
        </div>
        <Button
          size="sm"
          variant={encerrado ? "outline" : "default"}
          render={<Link href={`/portal/${projetoId}/briefing`} />}
        >
          {encerrado ? "Ver respostas" : "Preencher"}
        </Button>
      </CardContent>
    </Card>
  );
}
