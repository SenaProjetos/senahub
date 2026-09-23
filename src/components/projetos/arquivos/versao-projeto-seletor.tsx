"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { contarForaDoPadraoParaVersao, definirVersaoNomenclaturaProjeto } from "@/modules/projetos/nomenclatura/versoes-actions";
import { NomenclaturaForm } from "@/components/projetos/nomenclatura-form";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type VersaoDisponivel = { id: string; numero: number; nome: string };

/**
 * "Padrão: v1 · v2 · Personalizado" (D3) — onde antes ficava só o editor de padrão do projeto.
 * Trocar de versão mostra ANTES quantos documentos ficariam fora do padrão (contagem real, via
 * `contarForaDoPadraoParaVersao`) e pede confirmação; nunca renomeia arquivo.
 */
export function VersaoProjetoSeletor({
  projetoId,
  versoes,
  versaoAtualId,
  personalizado,
  podeEditar,
  nomenclaturaProjeto,
  nomenclaturaGlobal,
}: {
  projetoId: string;
  versoes: VersaoDisponivel[];
  /** Id da versão hoje efetiva (fixada ou resolvida pela data) — null só sem versão publicada nenhuma. */
  versaoAtualId: string | null;
  /** O projeto tem padrão próprio (`NomenclaturaConfig.padrao`) — vence a versão. */
  personalizado: boolean;
  podeEditar: boolean;
  nomenclaturaProjeto: React.ComponentProps<typeof NomenclaturaForm>["inicial"];
  nomenclaturaGlobal: React.ComponentProps<typeof NomenclaturaForm>["global"];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [mostrarPersonalizado, setMostrarPersonalizado] = useState(personalizado);

  async function escolher(versao: VersaoDisponivel) {
    setMostrarPersonalizado(false);
    if (versao.id === versaoAtualId && !personalizado) return;
    const c = await contarForaDoPadraoParaVersao({ projetoId, versaoId: versao.id });
    const total = c.ok ? c.data.total : 0;
    const ok = await confirm({
      title: `Passar a seguir o padrão v${versao.numero}?`,
      description:
        total > 0
          ? `${total} documento(s) já enviados ficariam marcados como "fora do padrão" com este modelo. Nenhum arquivo é renomeado — é só o alerta que muda.`
          : "Nenhum documento já enviado ficaria fora do padrão com este modelo.",
      confirmLabel: "Usar este padrão",
    });
    if (!ok) return;
    start(async () => {
      const r = await definirVersaoNomenclaturaProjeto({ projetoId, versaoId: versao.id });
      if (r.ok) {
        toast.success(`Projeto passou a seguir o padrão v${versao.numero}.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (!podeEditar) {
    const atual = versoes.find((v) => v.id === versaoAtualId);
    return (
      <p className="text-sm text-muted-foreground">
        Padrão: {personalizado ? "personalizado deste projeto" : atual ? `v${atual.numero} — ${atual.nome}` : "—"}.
        Só quem tem permissão de Configurações pode alterar.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {versoes.map((v) => (
          <Button
            key={v.id}
            type="button"
            size="sm"
            variant={!mostrarPersonalizado && v.id === versaoAtualId && !personalizado ? "secondary" : "outline"}
            disabled={pending}
            onClick={() => void escolher(v)}
          >
            v{v.numero} — {v.nome}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={mostrarPersonalizado || personalizado ? "secondary" : "outline"}
          onClick={() => setMostrarPersonalizado(true)}
        >
          Personalizado
        </Button>
      </div>
      {versoes.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <TriangleAlert className="size-3.5" /> Nenhuma versão publicada ainda — cadastre em Configurações → Nomenclatura.
        </p>
      )}
      {(mostrarPersonalizado || personalizado) && (
        <div className={cn("rounded-md border p-2.5", !personalizado && "border-dashed")}>
          <NomenclaturaForm escopo={{ projetoId }} inicial={nomenclaturaProjeto} global={nomenclaturaGlobal} />
        </div>
      )}
    </div>
  );
}
