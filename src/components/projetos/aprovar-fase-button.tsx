"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { aprovarEtapaDisciplina } from "@/modules/projetos/etapas-actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * "Aprovar fase" — a MESMA `aprovarEtapaDisciplina` do diálogo Etapas, da fila de Aprovações e do card da
 * disciplina (decisão #10): libera o pagamento daquela fase. Quem chama só o mostra a quem tem
 * `aprovacoes:disciplina` (item proibido pelo perfil é omitido, não desabilitado).
 */
export function AprovarFaseButton({
  faseId,
  sigla,
  disciplina,
  label = "Aprovar",
}: {
  faseId: string;
  sigla: string;
  disciplina: string;
  label?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  // O confirm vem ANTES do start: dentro da transition o setState do diálogo suspende e trava a tela.
  async function aprovar() {
    const ok = await confirm({
      title: `Aprovar a fase ${sigla} de ${disciplina}?`,
      description:
        "Libera o pagamento desta fase para os projetistas PJ/freelancer da disciplina. Depois disso o percentual da fase fica fixo e ela não pode mais ser removida.",
      confirmLabel: "Aprovar fase",
    });
    if (!ok) return;
    start(async () => {
      const r = await aprovarEtapaDisciplina({ id: faseId });
      if (r.ok) {
        toast.success(r.data.pagamentos > 0 ? `Fase ${sigla} aprovada — pagamento liberado.` : `Fase ${sigla} aprovada.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => void aprovar()}>
      {label}
    </Button>
  );
}
