"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Clock } from "lucide-react";
import type { TipoProximaAcao } from "@/generated/prisma/client";
import { concluirProximaAcao, reagendarProximaAcao } from "@/modules/comercial/actions";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";

export type ItemAcao = {
  id: string;
  tipo: TipoProximaAcao | null;
  href: string;
  nomeEntidade: string;
  /** ISO. Quando presente, a linha mostra data e hora. */
  inicio?: string;
  responsavel?: { name: string; image: string | null } | null;
};

/**
 * Uma próxima ação com "concluir" e "reagendar +1/3/7 dias" — usada no Meu Dia da Home e na tela
 * de Follow-ups. O estado do reagendamento é da linha, não da lista.
 */
export function AcaoLinha({ item, atrasada }: { item: ItemAcao; atrasada?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reagendando, setReagendando] = useState(false);

  function concluir() {
    start(async () => {
      const r = await concluirProximaAcao({ compromissoId: item.id });
      if (r.ok) {
        toast.success("Ação concluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function reagendar(dias: number) {
    const novo = new Date(Date.now() + dias * 86_400_000);
    start(async () => {
      const r = await reagendarProximaAcao({ compromissoId: item.id, novoInicio: novo.toISOString() });
      if (r.ok) {
        toast.success("Reagendado.");
        setReagendando(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border px-2 py-1.5 text-sm">
      <Link href={item.href} className="min-w-0 flex-1 truncate hover:underline">
        <span className="text-xs text-muted-foreground">{item.tipo ? TIPO_PROXIMA_ACAO_LABEL[item.tipo] : "Ação"}</span>{" "}
        — {item.nomeEntidade}
        {item.inicio && (
          <span className={`ml-2 font-mono text-[10px] ${atrasada ? "text-destructive" : "text-muted-foreground"}`}>
            {formatarDataHora(item.inicio)}
          </span>
        )}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {item.responsavel && (
          <AvatarUsuario
            nome={item.responsavel.name}
            image={item.responsavel.image}
            size="sm"
            title={`Responsável: ${item.responsavel.name}`}
          />
        )}
        {reagendando ? (
          [1, 3, 7].map((d) => (
            <Button key={d} size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={pending} onClick={() => reagendar(d)}>
              +{d}d
            </Button>
          ))
        ) : (
          <Button size="icon" variant="ghost" className="size-6" title="Reagendar" aria-label="Reagendar" disabled={pending} onClick={() => setReagendando(true)}>
            <Clock className="size-3.5" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="size-6" title="Concluir" aria-label="Concluir" disabled={pending} onClick={concluir}>
          <CheckCircle2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
