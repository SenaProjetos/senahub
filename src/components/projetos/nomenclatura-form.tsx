"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  salvarNomenclaturaGlobal,
  salvarNomenclaturaProjeto,
  limparNomenclaturaProjeto,
} from "@/modules/projetos/nomenclatura/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLACEHOLDER = "vazio = padrão embutido {proj}-{disc}-{fase}-{nº}-{tipo}[-Rnn]";

export function NomenclaturaForm({
  escopo,
  inicial,
  global,
}: {
  escopo: "global" | { projetoId: string };
  inicial: { exigir: boolean; padrao: string; definido?: boolean };
  global?: { exigir: boolean; padrao: string };
}) {
  const router = useRouter();
  const [exigir, setExigir] = useState(inicial.exigir);
  const [padrao, setPadrao] = useState(inicial.padrao);
  const [pending, start] = useTransition();
  const isProjeto = escopo !== "global";

  function salvar() {
    start(async () => {
      const r = isProjeto
        ? await salvarNomenclaturaProjeto({ projetoId: escopo.projetoId, exigir, padrao: padrao || undefined })
        : await salvarNomenclaturaGlobal({ exigir, padrao: padrao || undefined });
      if (r.ok) {
        toast.success("Nomenclatura salva.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function limpar() {
    if (!isProjeto) return;
    start(async () => {
      const r = await limparNomenclaturaProjeto({ projetoId: escopo.projetoId });
      if (r.ok) {
        toast.success("Voltou a herdar a configuração global.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-3 rounded-sm border p-3">
      <div>
        <p className="text-sm font-semibold">Nomenclatura padrão (pacote A)</p>
        <p className="text-xs text-muted-foreground">
          Quando exigida, arquivos de Pranchas fora do padrão recebem um alerta na lista.
          {isProjeto && global && (
            <> Global: <span className="font-medium">{global.exigir ? "exige" : "livre"}</span>.</>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="button" size="sm" variant={exigir ? "secondary" : "outline"} onClick={() => setExigir((v) => !v)}>
          {exigir ? "Exige padrão" : "Nomenclatura livre"}
        </Button>
        <div className="min-w-[16rem] flex-1 space-y-1">
          <Label className="text-xs">Padrão custom (regex, opcional)</Label>
          <Input
            value={padrao}
            onChange={(e) => setPadrao(e.target.value)}
            placeholder={PLACEHOLDER}
            className="font-mono text-xs"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={salvar} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        {isProjeto && inicial.definido && (
          <Button size="sm" variant="ghost" onClick={limpar} disabled={pending}>
            Voltar ao global
          </Button>
        )}
      </div>
    </div>
  );
}
