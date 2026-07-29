"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { definirBasePreco } from "@/modules/custos/orcamento/actions";

type BaseOpcao = { id: string; nome: string; uf: string; regime: string };

/**
 * `CustoOrcamento.regimeEncargos` (encargos sociais de obra) e `CustoBasePreco.regime` (planilha
 * SINAPI) são eixos diferentes mas correlacionados. Divergência é AVISADA, nunca bloqueada — há
 * caso legítimo de usar base sem encargos com encargos próprios.
 */
function regimeDivergente(regimeEncargos: string, regimeBase: string): boolean {
  if (regimeBase === "sem_encargos") return false;
  const esperado = regimeEncargos === "desonerado" ? "com_desoneracao" : "sem_desoneracao";
  return regimeBase !== esperado;
}

export function BasePrecoSelector({
  orcamentoId,
  bases,
  basePrecoId,
  regimeEncargos,
  podeGerir,
}: {
  orcamentoId: string;
  bases: BaseOpcao[];
  basePrecoId: string | null;
  regimeEncargos: string;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const atual = bases.find((b) => b.id === basePrecoId) ?? null;

  function escolher(id: string) {
    startTransition(async () => {
      const r = await definirBasePreco({ orcamentoId, basePrecoId: id });
      if (r.ok) {
        toast.success("Base de preço definida — a data-base acompanhou.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const divergente = atual !== null && regimeDivergente(regimeEncargos, atual.regime);

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">Base de preço</h3>
        <p className="text-xs text-muted-foreground">
          De onde vem o custo dos itens. Trocar depois usa o fluxo &ldquo;Trocar data-base&rdquo;, que mostra o
          impacto antes de aplicar.
        </p>
      </div>

      {bases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma base importada ainda — importe uma em Bancos antes de vincular composições.
        </p>
      ) : (
        <div className="max-w-md space-y-1.5">
          <Label>Base vigente</Label>
          <Select value={basePrecoId ?? ""} onValueChange={(v) => v && escolher(v)} disabled={!podeGerir || pending}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a base de preço" />
            </SelectTrigger>
            <SelectContent>
              {bases.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {divergente && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            O orçamento está <strong>{regimeEncargos === "desonerado" ? "desonerado" : "não desonerado"}</strong>,
            mas a base escolhida é <strong>{atual?.regime.replace(/_/g, " ")}</strong>. Confira se é intencional.
          </span>
        </p>
      )}
    </section>
  );
}
