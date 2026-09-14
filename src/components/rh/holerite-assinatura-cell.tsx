"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PenLine, Download } from "lucide-react";
import { assinarHolerite } from "@/modules/rh/folha/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarData } from "@/lib/utils";

/**
 * Célula de assinatura do holerite (P3, espelha `LinhaRecibo` de `meus-recibos.tsx`). "Assinar"
 * só aparece pro próprio titular (`self`), com folha fechada e ainda sem assinatura — quem vê a
 * ficha de outra pessoa (RH) só enxerga o status, nunca assina no lugar de ninguém. "PDF" aparece
 * pros dois lados quando a folha está fechada (a rota confere titularidade/role de novo).
 */
export function HoleriteAssinaturaCell({
  holeriteId,
  status,
  assinadoEm,
  assinanteNome,
  self,
}: {
  holeriteId: string;
  status: "aberta" | "fechada";
  assinadoEm: string | null;
  assinanteNome: string | null;
  self: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  if (status !== "fechada") {
    return <span className="text-muted-foreground">—</span>;
  }

  async function assinar() {
    const ok = await confirm({
      title: "Assinar holerite",
      description: "Ao assinar, você confirma o recebimento dos valores deste holerite. Ficam registrados seu nome, a data e a hora.",
      confirmLabel: "Assinar",
    });
    if (!ok) return;
    start(async () => {
      const r = await assinarHolerite({ id: holeriteId });
      if (r.ok) {
        toast.success("Holerite assinado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assinadoEm ? (
        <span className="text-success">Assinado {formatarData(assinadoEm)}{assinanteNome ? ` · ${assinanteNome}` : ""}</span>
      ) : (
        <span className="text-warning">Pendente</span>
      )}
      {self && !assinadoEm && (
        <Button size="sm" variant="outline" onClick={assinar} disabled={pending}>
          <PenLine className="size-3.5" /> Assinar
        </Button>
      )}
      <Button size="sm" variant="ghost" render={<a href={`/api/rh/holerite/${holeriteId}/pdf`} target="_blank" rel="noreferrer" />}>
        <Download className="size-3.5" /> PDF
      </Button>
    </div>
  );
}
