"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { removerDependente } from "@/modules/rh/funcionarios/actions";
import { formatarData } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DependenteDialog } from "@/components/rh/dependente-dialog";

export type DependenteItem = {
  id: string;
  nome: string;
  cpf: string | null;
  nascimento: string | null;
  parentesco: string | null;
  dependenteIrrf: boolean;
};

/**
 * Dependentes de uma pessoa, na ficha 360. Read-only por padrão; com `podeEditar` (HR-admin)
 * ganha adicionar/editar/remover, cada um pelo mesmo `DependenteDialog`.
 */
export function DependentesEditor({
  pessoaId,
  dependentes,
  podeEditar,
}: {
  pessoaId: string;
  dependentes: DependenteItem[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogAlvo, setDialogAlvo] = useState<DependenteItem | null | "novo">(null);
  const confirm = useConfirm();

  async function remover(d: DependenteItem) {
    const ok = await confirm({
      title: `Remover ${d.nome}?`,
      description: "Remove o dependente do cadastro desta pessoa. Esta ação não pode ser desfeita.",
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await removerDependente({ id: d.id });
      if (r.ok) {
        toast.success("Dependente removido.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Dependentes ({dependentes.length})</h4>
        {podeEditar && (
          <Button size="xs" variant="ghost" onClick={() => setDialogAlvo("novo")} disabled={pending}>
            <Plus className="size-3.5" /> Dependente
          </Button>
        )}
      </div>

      {dependentes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum dependente"
          description={podeEditar ? "Adicione os dependentes desta pessoa." : "Esta pessoa não possui dependentes cadastrados."}
        />
      ) : (
        <ul className="divide-y rounded-sm border text-sm">
          {dependentes.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">{d.nome}</span>
                <span className="text-muted-foreground"> · {d.parentesco ?? "—"}</span>
                {d.dependenteIrrf && (
                  <Badge variant="outline" className="ml-2 align-middle">IRRF</Badge>
                )}
                {d.cpf && <p className="text-xs text-muted-foreground">CPF {d.cpf}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-1">
                <span className="text-muted-foreground">{d.nascimento ? formatarData(d.nascimento) : ""}</span>
                {podeEditar && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label="Editar dependente" onClick={() => setDialogAlvo(d)} disabled={pending}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Remover dependente" onClick={() => remover(d)} disabled={pending}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {podeEditar && dialogAlvo !== null && (
        <DependenteDialog
          open
          onOpenChange={(v) => !v && setDialogAlvo(null)}
          userId={pessoaId}
          dependente={dialogAlvo === "novo" ? null : dialogAlvo}
        />
      )}
    </div>
  );
}
