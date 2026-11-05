"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { adicionarCamada } from "@/modules/coordenacao/sobreposicao/actions";
import type { documentosParaCamada } from "@/modules/coordenacao/sobreposicao/queries";
import type { Formato } from "@/modules/coordenacao/sobreposicao/regras";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type DocumentoParaCamada = Awaited<ReturnType<typeof documentosParaCamada>>[number];

type Props = {
  sobreposicaoId: string;
  /** Só os documentos que ainda não são camada. */
  documentos: DocumentoParaCamada[];
  /** Nenhuma camada ainda: a que entrar vira a base. */
  primeira: boolean;
};

/** Fora da base o padrão é o DWG (ele separa a arquitetura de fundo); a primeira camada começa no PDF. */
function formatoPadrao(d: DocumentoParaCamada, primeira: boolean): Formato {
  if (primeira) return d.temPdf ? "pdf" : "dwg";
  return d.temDwg ? "dwg" : "pdf";
}

/** "+ Adicionar disciplina": documentos do projeto agrupados por disciplina, com a escolha PDF ou DWG. */
export function AdicionarCamadaDialog({ sobreposicaoId, documentos, primeira }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();

  const grupos = new Map<string, DocumentoParaCamada[]>();
  for (const d of documentos) grupos.set(d.disciplina, [...(grupos.get(d.disciplina) ?? []), d]);

  function adicionar(documentoId: string, formato: Formato) {
    start(async () => {
      const r = await adicionarCamada({ sobreposicaoId, documentoId, formato });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(primeira ? "Camada base adicionada." : "Camada adicionada.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button type="button" size="sm" variant="outline" onClick={() => setAberto(true)} disabled={documentos.length === 0}>
        <Plus className="size-4" />
        Adicionar disciplina
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar disciplina</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {primeira
              ? "A primeira camada é a base do pavimento, normalmente a arquitetura."
              : "Escolha a prancha e o arquivo. O DWG esconde a arquitetura de fundo (layer SENA_ARQ)."}
          </p>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {[...grupos.entries()].map(([disciplina, docs]) => (
            <section key={disciplina} className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{disciplina}</h3>
              <ul className="divide-y rounded-md border">
                {docs.map((d) => {
                  const padrao = formatoPadrao(d, primeira);
                  return (
                    <li key={d.documentoId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{d.titulo}</span>
                      <span className="flex shrink-0 gap-1.5">
                        {(["pdf", "dwg"] as const).map((f) => {
                          const tem = f === "pdf" ? d.temPdf : d.temDwg;
                          return (
                            <Button
                              key={f}
                              type="button"
                              size="sm"
                              variant={f === padrao ? "default" : "outline"}
                              disabled={!tem || pending}
                              title={tem ? undefined : `Sem arquivo ${f.toUpperCase()} vigente`}
                              aria-label={`Adicionar ${d.titulo} em ${f.toUpperCase()}`}
                              onClick={() => adicionar(d.documentoId, f)}
                            >
                              {f.toUpperCase()}
                            </Button>
                          );
                        })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
