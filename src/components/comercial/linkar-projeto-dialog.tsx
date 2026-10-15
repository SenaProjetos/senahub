"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { candidatosParaVinculo, linkarProjeto, previaDoVinculo } from "@/modules/comercial/vinculo/actions";
import type { PreviaVinculoTela } from "@/modules/comercial/vinculo/regras";

export type AlvoLink = { modo: "ficha"; negociacaoId: string } | { modo: "projeto"; projetoId: string };

type Candidato = { id: string; rotulo: string; detalhe: string | null };
type Escolha = { importar: boolean; exibir: boolean };

const ROTULO_ORIGEM = { anexo_lead: "Anexo", proposta_pdf: "Proposta" } as const;
const ERRO_REDE = "Não foi possível falar com o servidor. Tente de novo.";

/**
 * Um diálogo, dois pontos de entrada (ficha contratada e ⋯ do projeto). Passo 1: escolher o outro lado
 * (projeto ou ficha do MESMO cliente). Passo 2: prévia — o que será preenchido/mantido e os arquivos, cada um
 * com "importar" (marcado) e "mostrar em Recebidos" (desmarcado: nada vai ao projetista sem decisão).
 */
export function LinkarProjetoDialog({
  alvo,
  aberto,
  onAbertoChange,
}: {
  alvo: AlvoLink;
  aberto: boolean;
  onAbertoChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Monta só quando aberto: estado limpo a cada abertura e a lista de candidatos sempre fresca. */}
        {aberto && <Conteudo alvo={alvo} fechar={() => onAbertoChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo({ alvo, fechar }: { alvo: AlvoLink; fechar: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [erroCandidatos, setErroCandidatos] = useState<string | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [previa, setPrevia] = useState<PreviaVinculoTela | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [incluirResumo, setIncluirResumo] = useState(true);

  const modo = alvo.modo;
  const idDoAlvo = alvo.modo === "ficha" ? alvo.negociacaoId : alvo.projetoId;

  // Erro NÃO vira lista vazia: "nenhum projeto livre" seria mentira quando a busca falhou.
  const carregarCandidatos = useCallback(
    async (vivo: () => boolean) => {
      setErroCandidatos(null);
      setCandidatos(null);
      try {
        const r = await candidatosParaVinculo({ modo, id: idDoAlvo });
        if (!vivo()) return;
        if (r.ok) setCandidatos(r.data);
        else setErroCandidatos(r.error);
      } catch {
        if (vivo()) setErroCandidatos(ERRO_REDE);
      }
    },
    [modo, idDoAlvo],
  );

  useEffect(() => {
    let vivo = true;
    void carregarCandidatos(() => vivo);
    return () => {
      vivo = false;
    };
  }, [carregarCandidatos]);

  async function escolher(c: Candidato) {
    setCarregandoPrevia(true);
    const ids =
      alvo.modo === "ficha"
        ? { projetoId: c.id, negociacaoId: alvo.negociacaoId }
        : { projetoId: alvo.projetoId, negociacaoId: c.id };
    try {
      const r = await previaDoVinculo(ids);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPrevia(r.data);
      setEscolhas(Object.fromEntries(r.data.arquivos.map((a) => [a.chave, { importar: a.importarPadrao, exibir: false }])));
      setIncluirResumo(r.data.novaDescricao != null);
    } catch {
      toast.error(ERRO_REDE);
    } finally {
      setCarregandoPrevia(false);
    }
  }

  function atualizar(chave: string, parte: Partial<Escolha>) {
    setEscolhas((atual) => ({ ...atual, [chave]: { ...atual[chave], ...parte } }));
  }

  function confirmar() {
    if (!previa) return;
    start(async () => {
      try {
        const r = await linkarProjeto({
          projetoId: previa.projeto.id,
          negociacaoId: previa.ficha.id,
          arquivos: previa.arquivos
            .filter((a) => escolhas[a.chave]?.importar)
            .map((a) => ({ chave: a.chave, exibirEmRecebidos: escolhas[a.chave].exibir })),
          incluirResumo: incluirResumo && previa.novaDescricao != null,
        });
        if (r.ok) {
          toast.success(
            r.data.arquivos > 0
              ? `Projeto linkado. ${r.data.arquivos} arquivo(s) na pasta Geral do projeto.`
              : "Projeto linkado.",
          );
          fechar();
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } catch {
        toast.error(ERRO_REDE);
      }
    });
  }

  const nadaMarcado = previa ? previa.arquivos.every((a) => !escolhas[a.chave]?.importar) : true;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{alvo.modo === "ficha" ? "Linkar projeto a esta ficha" : "Linkar a uma ficha do funil"}</DialogTitle>
        <DialogDescription>
          {previa
            ? `${previa.projeto.codigo} · ${previa.projeto.nome}  ↔  ${previa.ficha.titulo}`
            : alvo.modo === "ficha"
              ? "Escolha o projeto do mesmo cliente que corresponde a esta ficha."
              : "Escolha a ficha Contratado do mesmo cliente que originou este projeto."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody>
        {!previa && (
          <div className="space-y-2" aria-busy={candidatos === null || carregandoPrevia}>
            {candidatos === null && !erroCandidatos && (
              <div role="status" aria-label="Carregando a lista" className="space-y-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            )}
            {erroCandidatos && (
              <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p>{erroCandidatos}</p>
                <Button size="sm" variant="outline" onClick={() => void carregarCandidatos(() => true)}>
                  Tentar de novo
                </Button>
              </div>
            )}
            {candidatos?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {alvo.modo === "ficha"
                  ? "Nenhum projeto deste cliente está livre para linkar. Crie o projeto em Projetos (com o mesmo cliente) e volte aqui."
                  : "Nenhuma ficha em Contratado deste cliente. Mova a ficha para Contratado no funil e volte aqui."}
              </p>
            )}
            {carregandoPrevia && (
              <p role="status" className="text-sm text-muted-foreground">
                Montando a prévia…
              </p>
            )}
            {candidatos?.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={carregandoPrevia}
                onClick={() => escolher(c)}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-medium">{c.rotulo}</span>
                {c.detalhe && <span className="shrink-0 text-xs text-muted-foreground">{c.detalhe}</span>}
              </button>
            ))}
          </div>
        )}

        {previa?.motivo && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            {previa.motivo}
          </p>
        )}

        {previa && !previa.motivo && (
          <div className="space-y-4 text-sm">
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dados do projeto</h3>
              {previa.preencheTexto.map((f) => (
                <p key={f.campo}>
                  <span className="text-muted-foreground">Vai preencher:</span> {f.rotulo} — <strong>{f.valor}</strong>
                </p>
              ))}
              {previa.mantemTexto.map((f) => (
                <p key={f.campo} className="text-muted-foreground">
                  Vai manter: {f.rotulo} (o projeto já tem)
                </p>
              ))}
              {previa.coordenador && (
                <p>
                  <span className="text-muted-foreground">Vai incluir como coordenador:</span> {previa.coordenador.nome}
                </p>
              )}
              {previa.preencheTexto.length === 0 && previa.mantemTexto.length === 0 && !previa.coordenador && (
                <p className="text-muted-foreground">A ficha não traz dados novos para o projeto.</p>
              )}
            </section>

            {previa.resumo && (
              <section>
                {previa.descricaoVazia ? (
                  <div className="space-y-1 rounded-md border px-3 py-2.5">
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={incluirResumo}
                        onCheckedChange={(v) => setIncluirResumo(v as boolean)}
                        aria-describedby="vinculo-resumo"
                      />
                      Resumir o histórico comercial na descrição do projeto
                    </label>
                    <p id="vinculo-resumo" className="whitespace-pre-wrap pl-7 text-xs text-muted-foreground">
                      {previa.resumo}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A descrição do projeto já está preenchida: o resumo do histórico não será gravado.
                  </p>
                )}
              </section>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Arquivos para a pasta Geral
              </h3>
              {previa.arquivos.length === 0 && <p className="text-muted-foreground">Esta ficha não tem arquivos para importar.</p>}
              {previa.arquivos.map((a, i) => {
                const e = escolhas[a.chave] ?? { importar: false, exibir: false };
                const idMotivo = `vinculo-motivo-${i}`;
                return (
                  <div key={a.chave} className="min-w-0 space-y-1.5 rounded-md border px-3 py-2.5">
                    <label className="flex min-w-0 cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={e.importar}
                        disabled={!a.existe}
                        aria-describedby={a.motivoNaoImportar ? idMotivo : undefined}
                        onCheckedChange={(v) => atualizar(a.chave, { importar: v as boolean, exibir: v ? e.exibir : false })}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{a.nome}</span>
                      <Badge variant="outline" className="shrink-0">
                        {ROTULO_ORIGEM[a.origem]}
                      </Badge>
                    </label>
                    {a.motivoNaoImportar && (
                      <p id={idMotivo} className="pl-7 text-xs text-muted-foreground">
                        {a.motivoNaoImportar}
                      </p>
                    )}
                    <label className="flex cursor-pointer items-center gap-3 pl-7 text-xs text-muted-foreground">
                      <Checkbox
                        checked={e.exibir}
                        disabled={!e.importar}
                        onCheckedChange={(v) => atualizar(a.chave, { exibir: v as boolean })}
                      />
                      {e.importar
                        ? "Mostrar também em “Recebidos do cliente” (os projetistas passam a ver)"
                        : "Mostrar em “Recebidos do cliente”: marque o arquivo para importar primeiro"}
                    </label>
                  </div>
                );
              })}
            </section>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {previa ? (
          <Button variant="outline" onClick={() => setPrevia(null)} disabled={pending}>
            Voltar
          </Button>
        ) : (
          <Button variant="outline" onClick={fechar}>
            Cancelar
          </Button>
        )}
        {previa && !previa.motivo && (
          <Button onClick={confirmar} disabled={pending}>
            {pending ? "Linkando…" : nadaMarcado ? "Linkar sem arquivos" : "Linkar e importar"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
