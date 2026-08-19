"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, FileText, Download, History, Pencil, Trash2 } from "lucide-react";
import { excluirArt } from "@/modules/projetos/art/actions";
import { LABEL_SITUACAO_ART, rotuloArt, podeReceberNovaVersao } from "@/modules/projetos/art/service";
import type { ArtListItem } from "@/modules/projetos/art/queries";
import { brl, formatarData } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArtDialog } from "./art-dialog";
import { ArtVersoesDialog } from "./art-versoes-dialog";

export type ResponsavelOpcao = { id: string; nome: string; registro: string };

type Props = {
  projetoId: string;
  arts: ArtListItem[];
  responsaveis: ResponsavelOpcao[];
  disciplinas: { id: string; nome: string }[];
  podeGerir: boolean;
};

/** Cores por situação — mesma leitura do resto do sistema (verde = vigente, âmbar = atenção). */
function corSituacao(situacao: string): "default" | "secondary" | "outline" | "destructive" {
  if (situacao === "registrada") return "default";
  if (situacao === "cancelada") return "destructive";
  if (situacao === "rascunho") return "outline";
  return "secondary";
}

export function ArtsView({ projetoId, arts, responsaveis, disciplinas, podeGerir }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editando, setEditando] = useState<ArtListItem | null>(null);
  const [criando, setCriando] = useState(false);
  const [versoesDe, setVersoesDe] = useState<ArtListItem | null>(null);

  async function excluir(a: ArtListItem) {
    const ok = await confirm({
      title: `Excluir ${rotuloArt(a)}`,
      description:
        "A ART e todo o seu histórico de versões serão removidos. Se ela já foi registrada no conselho, prefira marcá-la como cancelada.",
      variant: "destructive",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const r = await excluirArt({ id: a.id });
    if (r.ok) {
      toast.success("ART excluída.");
      router.refresh();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">ARTs do projeto</h2>
          <p className="text-sm text-muted-foreground">
            Anotações e registros de responsabilidade técnica. Cada substituição gera uma versão no histórico.
          </p>
        </div>
        {podeGerir && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="size-4" /> Nova ART
          </Button>
        )}
      </div>

      {arts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma ART cadastrada"
          description="Registre a ART/RRT do projeto para que ela apareça nos arquivos e possa ser referenciada nos memoriais de cálculo."
          action={podeGerir ? <Button onClick={() => setCriando(true)}><Plus className="size-4" /> Nova ART</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {arts.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{rotuloArt(a)}</span>
                    <Badge variant={corSituacao(a.situacao)}>{LABEL_SITUACAO_ART[a.situacao] ?? a.situacao}</Badge>
                    {a.disciplina && <Badge variant="outline">{a.disciplina.disciplinaTextoLegado}</Badge>}
                    {a.versoes > 0 && (
                      <Badge variant="secondary">
                        {a.versoes} versão(ões) anterior(es)
                      </Badge>
                    )}
                  </div>
                  {a.descricao && <p className="text-sm text-muted-foreground">{a.descricao}</p>}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                    {a.responsavelNome && (
                      <span>
                        {a.responsavelNome}
                        {a.responsavelRegistro ? ` — ${a.responsavelRegistro}` : ""}
                      </span>
                    )}
                    {a.emitidaEm && <span>Emitida em {formatarData(a.emitidaEm)}</span>}
                    {a.valor != null && <span>Taxa: {brl(a.valor)}</span>}
                    {!a.temArquivo && <span className="italic">sem PDF anexado</span>}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {a.temArquivo && (
                    <Button size="sm" variant="outline" render={<a href={`/api/projetos/art/${a.id}/download`} />}>
                      <Download className="size-3.5" /> PDF
                    </Button>
                  )}
                  {a.versoes > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setVersoesDe(a)}>
                      <History className="size-3.5" /> Histórico
                    </Button>
                  )}
                  {podeGerir && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(a)}>
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void excluir(a)} aria-label={`Excluir ${rotuloArt(a)}`}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(criando || editando) && (
        <ArtDialog
          projetoId={projetoId}
          art={editando}
          responsaveis={responsaveis}
          disciplinas={disciplinas}
          podeNovaVersao={editando ? podeReceberNovaVersao(editando.situacao) : false}
          open
          onOpenChange={(v) => {
            if (!v) {
              setCriando(false);
              setEditando(null);
            }
          }}
        />
      )}

      {versoesDe && (
        <ArtVersoesDialog artId={versoesDe.id} titulo={rotuloArt(versoesDe)} open onOpenChange={(v) => !v && setVersoesDe(null)} />
      )}
    </div>
  );
}
