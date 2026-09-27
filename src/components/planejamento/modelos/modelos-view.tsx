"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListTree, Trash2 } from "lucide-react";
import { removerModeloEap } from "@/modules/planejamento/modelos/actions";
import { formatarData } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
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
  /** Preenchido = modelo de DISCIPLINA (entra por "Gerar EAP das disciplinas"). */
  disciplinaCatalogo: { id: string; nome: string } | null;
};

/**
 * Biblioteca de modelos de EAP (decisão #5): a estrutura de cronograma que a casa reusa em projeto novo. Dois
 * tipos: o de PROJETO (a EAP inteira, importada do MS Project) e o de DISCIPLINA (o conteúdo de uma disciplina,
 * criado a partir de um modelo de projeto), que "Gerar EAP das disciplinas" aplica.
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
  const deProjeto = modelos.filter((m) => !m.disciplinaCatalogo);
  const deDisciplina = modelos
    .filter((m) => m.disciplinaCatalogo)
    .sort((a, b) => a.disciplinaCatalogo!.nome.localeCompare(b.disciplinaCatalogo!.nome, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));

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

  const linha = (m: ModeloDaLista) => (
    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <Link href={`/planejamento/modelos/${m.id}`} className="text-sm font-medium hover:underline">
          {m.nome}
        </Link>
        {m.descricao && <p className="truncate text-xs text-muted-foreground">{m.descricao}</p>}
        <p className="text-[11px] text-muted-foreground">
          {m.totalLinhas} linhas · {m.totalMarcos} marcos
          {m.tipoEmpreendimento ? ` · ${m.tipoEmpreendimento.nome}` : " · qualquer tipo"}
          {m.arquivoNome && !m.disciplinaCatalogo ? ` · ${m.arquivoNome}` : ""}
          {m.autor ? ` · ${m.autor.name}` : ""} · {formatarData(m.updatedAt)}
        </p>
      </div>
      {podeGerir && (
        <Button size="icon-sm" variant="ghost" aria-label={`Remover ${m.nome}`} disabled={pending} onClick={() => remover(m)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Modelos de EAP"
        descricao="A estrutura que a casa reusa: a EAP inteira do projeto, ou o conteúdo de cada disciplina."
        acoes={podeGerir ? <ImportarModeloDialog tiposEmpreendimento={tiposEmpreendimento} /> : undefined}
      />

      <section className="space-y-2" aria-labelledby="modelos-projeto">
        <div>
          <h2 id="modelos-projeto" className="text-sm font-semibold">
            Modelos de projeto
          </h2>
          <p className="text-xs text-muted-foreground">
            A EAP inteira, importada do MS Project: vem a árvore, as durações e as dependências — datas, horas e pessoas
            são do projeto. Entra pelo botão <strong>Usar modelo de EAP</strong>, com a EAP vazia.
          </p>
        </div>
        {deProjeto.length === 0 ? (
          <div className="rounded-sm border border-dashed">
            <EmptyState
              icon={ListTree}
              title="Nenhum modelo de projeto ainda"
              description={
                podeGerir
                  ? "Exporte um cronograma do MS Project (Arquivo → Salvar como → XML) e importe aqui."
                  : "A coordenação ainda não cadastrou modelos."
              }
              className="py-10"
            />
          </div>
        ) : (
          <ul className="divide-y rounded-sm border">{deProjeto.map(linha)}</ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="modelos-disciplina">
        <div>
          <h2 id="modelos-disciplina" className="text-sm font-semibold">
            Modelos de disciplina
          </h2>
          <p className="text-xs text-muted-foreground">
            O conteúdo de uma disciplina — fases e tarefas. Entra pelo botão <strong>Gerar EAP das disciplinas</strong> do
            projeto, em cada disciplina que ainda não tem tarefa. Para criar, abra um modelo de projeto e use{" "}
            <strong>Criar modelos de disciplina</strong>.
          </p>
        </div>
        {deDisciplina.length === 0 ? (
          <p className="rounded-sm border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum modelo de disciplina ainda.
          </p>
        ) : (
          <ul className="divide-y rounded-sm border">{deDisciplina.map(linha)}</ul>
        )}
      </section>
    </div>
  );
}
