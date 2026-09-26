"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListTree, Trash2 } from "lucide-react";
import { removerModeloEap } from "@/modules/planejamento/modelos/actions";
import { formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ImportarModeloDialog } from "./importar-modelo-dialog";

export type ModeloDaLista = {
  id: string;
  nome: string;
  descricao: string | null;
  arquivoNome: string | null;
  totalLinhas: number;
  totalMarcos: number;
  createdAt: Date;
  updatedAt: Date;
  tipoEmpreendimento: { id: string; nome: string } | null;
  autor: { name: string } | null;
};

/**
 * Biblioteca de modelos de EAP (decisão #5): a estrutura de cronograma que a casa reusa em projeto
 * novo, importada do MS Project.
 *
 * Remover é DESATIVAR: o projeto que nasceu de um modelo guarda no histórico de onde veio.
 */
export function ModelosView({
  modelos,
  tiposEmpreendimento,
  podeGerir,
}: {
  modelos: ModeloDaLista[];
  tiposEmpreendimento: { id: string; nome: string }[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  async function remover(m: ModeloDaLista) {
    const ok = await confirm({
      title: `Remover o modelo "${m.nome}"?`,
      description: "Ele deixa de aparecer na lista e de ser sugerido. Os projetos já criados não mudam.",
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await removerModeloEap({ id: m.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Modelo removido.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Modelos de EAP</h1>
          <p className="text-sm text-muted-foreground">
            A estrutura que a casa reusa em projeto novo. Importada do MS Project: vem a árvore, as
            durações e as dependências — datas, horas e pessoas são do projeto.
          </p>
        </div>
        {podeGerir && <ImportarModeloDialog tiposEmpreendimento={tiposEmpreendimento} />}
      </div>

      {modelos.length === 0 ? (
        <div className="rounded-sm border border-dashed">
          <EmptyState
            icon={ListTree}
            title="Nenhum modelo ainda"
            description={
              podeGerir
                ? "Exporte um cronograma do MS Project (Arquivo → Salvar como → XML) e importe aqui."
                : "A coordenação ainda não cadastrou modelos."
            }
            className="py-14"
          />
        </div>
      ) : (
        <ul className="divide-y rounded-sm border">
          {modelos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <Link href={`/planejamento/modelos/${m.id}`} className="text-sm font-medium hover:underline">
                  {m.nome}
                </Link>
                {m.descricao && <p className="truncate text-xs text-muted-foreground">{m.descricao}</p>}
                <p className="text-[11px] text-muted-foreground">
                  {m.totalLinhas} linhas · {m.totalMarcos} marcos
                  {m.tipoEmpreendimento ? ` · ${m.tipoEmpreendimento.nome}` : " · qualquer tipo"}
                  {m.arquivoNome ? ` · ${m.arquivoNome}` : ""}
                  {m.autor ? ` · ${m.autor.name}` : ""} · {formatarData(m.updatedAt)}
                </p>
              </div>
              {podeGerir && (
                <Button size="icon-sm" variant="ghost" aria-label="Remover" disabled={pending} onClick={() => remover(m)}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
