"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { lembrarAssinaturaHolerite } from "@/modules/rh/folha/actions";
import { Button } from "@/components/ui/button";

/** Botão de RH pra lembrar quem ainda não assinou (P5, espelha o "Lembrar" de `LinhaRecibo`). */
export function HoleriteLembreteButton({ holeriteId, nome }: { holeriteId: string; nome: string }) {
  const [pending, start] = useTransition();

  function lembrar() {
    start(async () => {
      const res = await lembrarAssinaturaHolerite({ id: holeriteId });
      if (!res.ok) {
        toast.error(res.error);
      } else if (res.data.avisado) {
        toast.success("Lembrete enviado.");
      } else {
        toast.warning(`${nome} desativou avisos de pagamento — avise por outro canal.`);
      }
    });
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      title="Lembrar assinatura"
      aria-label={`Lembrar ${nome} de assinar o holerite`}
      onClick={lembrar}
      disabled={pending}
    >
      <Bell className="size-3.5" />
    </Button>
  );
}
