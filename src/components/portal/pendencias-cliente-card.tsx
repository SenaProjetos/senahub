"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ListTodo } from "lucide-react";
import { marcarPendenciaFeita } from "@/modules/portal/atas/actions";
import type { PendenciaDTO } from "@/modules/portal/atas/queries";
import { COMENTARIO_FEITO_MAX, ROTULO_SITUACAO_PENDENCIA } from "@/modules/portal/atas/regras";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLASSE_TEXTAREA } from "@/components/atas/motivo-dialog";

/**
 * Card "Pendências suas" do portal: o que ficou a cargo do cliente nas atas. Abertas e reabertas no topo (atrasadas em
 * destaque, com texto), depois as que aguardam a conferência da coordenação; concluídas recolhidas. Sem pendência, nada.
 */
export function PendenciasClienteCard({ pendencias }: { pendencias: PendenciaDTO[] }) {
  const [marcando, setMarcando] = useState<PendenciaDTO | null>(null);
  if (pendencias.length === 0) return null;
  const ativas = pendencias.filter((p) => p.situacao === "aberta" || p.situacao === "reaberta" || p.situacao === "aguardando_conferencia");
  const concluidas = pendencias.filter((p) => p.situacao === "conferida");
  return (
    <Card id="pendencias" className="scroll-mt-20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="size-4 text-muted-foreground" aria-hidden /> Pendências suas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-2 pt-0">
        {ativas.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">Nenhuma pendência em aberto.</p>
        ) : (
          <ul className="divide-y">
            {ativas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-2 py-3">
                <div className="min-w-0 flex-1 basis-full space-y-0.5 text-sm sm:basis-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-words font-medium">{p.titulo}</p>
                    <Badge variant="outline">{ROTULO_SITUACAO_PENDENCIA[p.situacao]}</Badge>
                    {p.atrasada && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        Atrasada
                      </Badge>
                    )}
                  </div>
                  {p.descricao && <p className="whitespace-pre-wrap break-words text-muted-foreground">{p.descricao}</p>}
                  <p className="text-xs text-muted-foreground">
                    {p.prazo ? `Prazo ${formatarData(p.prazo)} · ` : ""}Ata de {formatarData(p.reuniaoData)} — {p.reuniaoTitulo}
                  </p>
                  {p.situacao === "reaberta" && p.motivoReabertura && (
                    <p className="text-xs text-foreground">Reaberta pela coordenação: {p.motivoReabertura}</p>
                  )}
                  {p.situacao === "aguardando_conferencia" && p.feitaEm && (
                    <p className="text-xs text-muted-foreground">
                      Marcada como feita por {p.feitaPorNome} em {formatarDataHora(p.feitaEm)}. Aguardando a coordenação conferir.
                    </p>
                  )}
                </div>
                {(p.situacao === "aberta" || p.situacao === "reaberta") && (
                  <Button size="sm" variant="outline" onClick={() => setMarcando(p)} aria-label={`Marquei como feito: ${p.titulo}`}>
                    <CheckCircle2 className="size-4" aria-hidden /> Marquei como feito
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {concluidas.length > 0 && (
          <details className="px-2 text-sm">
            <summary className="cursor-pointer text-xs text-muted-foreground">Concluídas ({concluidas.length})</summary>
            <ul className="mt-2 space-y-1">
              {concluidas.map((p) => (
                <li key={p.id} className="break-words text-muted-foreground">
                  {p.titulo} — conferida
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
      {marcando && <MarcarFeito key={marcando.id} pendencia={marcando} onFechar={() => setMarcando(null)} />}
    </Card>
  );
}

function MarcarFeito({ pendencia, onFechar }: { pendencia: PendenciaDTO; onFechar: () => void }) {
  const router = useRouter();
  const [comentario, setComentario] = useState("");
  const [enviando, start] = useTransition();
  const id = useId();

  function enviar() {
    start(async () => {
      const r = await marcarPendenciaFeita({ pendenciaId: pendencia.id, comentario: comentario || null }).catch(() => null);
      if (!r) return void toast.error("Não foi possível enviar. Verifique a conexão e tente de novo.");
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      toast.success("Marcada como feita. A coordenação vai conferir.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Marcar como feito?</DialogTitle>
          <DialogDescription className="break-words">{pendencia.titulo}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor={id}>Comentário (opcional)</Label>
          <textarea
            id={id}
            rows={3}
            maxLength={COMENTARIO_FEITO_MAX}
            className={CLASSE_TEXTAREA}
            placeholder="Ex.: enviei o levantamento por e-mail hoje."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            disabled={enviando}
          />
          <p className="text-xs text-muted-foreground">A coordenação confere e, se faltar algo, reabre com o motivo.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            <span role="status">{enviando ? "Enviando…" : "Marcar como feito"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
