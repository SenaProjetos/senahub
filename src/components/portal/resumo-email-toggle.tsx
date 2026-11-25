"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { salvarResumoPorEmail } from "@/modules/portal/resumo-actions";

/**
 * Opção do cliente no rodapé de Meus projetos: receber ou não o e-mail do resumo diário (`notif_portal_resumo`).
 * Desligar só para o e-mail; o aviso no sino do portal continua.
 */
export function ResumoEmailToggle({
  ligado,
  rotulo = "Receber por e-mail o resumo dos dias em que um projeto andar",
}: {
  ligado: boolean;
  /** A conta de obra recebe outro resumo (liberadas, substituídas, retiradas). */
  rotulo?: string;
}) {
  const [marcado, setMarcado] = useState(ligado);
  const [pendente, startTransition] = useTransition();

  function alternar(valor: boolean) {
    setMarcado(valor);
    startTransition(async () => {
      const r = await salvarResumoPorEmail({ quer: valor });
      if (r.ok) {
        toast.success(valor ? "Você vai receber o resumo por e-mail." : "Você não vai mais receber o resumo por e-mail.");
      } else {
        setMarcado(!valor);
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="flex items-start gap-2 text-sm">
      <Checkbox id="resumo-email" checked={marcado} disabled={pendente} onCheckedChange={(v: boolean) => alternar(v)} />
      <Label htmlFor="resumo-email" className="font-normal leading-snug text-muted-foreground">
        {rotulo}
      </Label>
    </div>
  );
}
