"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { excluirVersaoEncargos, definirAgenteIntegracao } from "@/modules/rh/tabela-encargos/actions";
import type { ContratacaoComEncargos, ParametrosEncargos } from "@/modules/rh/rateio/custo-hora/parametros";
import { NovaVersaoEncargosDialog } from "./nova-versao-encargos-dialog";

type Versao = { id: string; contratacao: ContratacaoComEncargos; vigencia: string; resumo: string; observacao: string | null; parametros: ParametrosEncargos };
type Estagiario = { vinculoId: string; nome: string; agenteIntegracao: string | null };

const TITULO: Record<ContratacaoComEncargos, string> = { clt: "CLT", estagio: "Estágio", pro_labore: "Pró-labore (sócios)" };
const mesTexto = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const selectCls = "h-9 rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EncargosEmpresaView({ versoes, estagiarios }: { versoes: Versao[]; estagiarios: Estagiario[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nova, setNova] = useState<ContratacaoComEncargos | null>(null);

  async function excluir(v: Versao) {
    // Confirmar ANTES de abrir a transição (regra do CLAUDE.md: confirm dentro de startTransition trava).
    const confirmou = await confirm({
      title: "Excluir versão?",
      description: `A versão de ${TITULO[v.contratacao]} que começa em ${mesTexto(v.vigencia)} será excluída.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!confirmou) return;
    start(async () => {
      const r = await excluirVersaoEncargos({ id: v.id });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Versão excluída.");
        router.refresh();
      }
    });
  }

  function mudarAgente(e: Estagiario, valor: string) {
    start(async () => {
      const r = await definirAgenteIntegracao({ vinculoId: e.vinculoId, agente: valor === "" ? null : valor });
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Encargos da empresa" descricao="Quanto cada contratação custa além do salário, por mês de vigência." />
      <div className="grid gap-4 lg:grid-cols-3">
        {(["clt", "estagio", "pro_labore"] as const).map((c) => {
          const lista = versoes.filter((v) => v.contratacao === c);
          return (
            <Card key={c}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">{TITULO[c]}</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setNova(c)} disabled={pending}>
                    <Plus className="size-4" /> Nova versão
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {lista.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem tabela: o custo desta contratação fica sem encargos.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {lista.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Desde {mesTexto(v.vigencia)}</p>
                          <p className="text-muted-foreground">{v.resumo}</p>
                          {v.observacao && <p className="text-xs text-muted-foreground">{v.observacao}</p>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => excluir(v)} disabled={pending}>
                          Excluir
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estagiários e agente de integração</CardTitle>
          <CardDescription>A taxa do agente só entra no custo de quem foi contratado por ele.</CardDescription>
        </CardHeader>
        <CardContent>
          {estagiarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum estágio ativo.</p>
          ) : (
            <ul className="divide-y text-sm">
              {estagiarios.map((e) => (
                <li key={e.vinculoId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate">{e.nome}</span>
                  <select
                    aria-label={`Contratação de ${e.nome}`}
                    className={selectCls}
                    value={e.agenteIntegracao ?? ""}
                    onChange={(ev) => mudarAgente(e, ev.target.value)}
                    disabled={pending}
                  >
                    <option value="IEL">Pelo IEL</option>
                    <option value="">Contratação direta</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {nova && (
        <NovaVersaoEncargosDialog
          contratacao={nova}
          base={versoes.find((v) => v.contratacao === nova)?.parametros ?? null}
          onOpenChange={(open) => !open && setNova(null)}
        />
      )}
    </div>
  );
}
