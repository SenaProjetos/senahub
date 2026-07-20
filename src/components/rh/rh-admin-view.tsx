"use client";

import { useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Download, Smile, MessageSquare, CalendarSync } from "lucide-react";
import { validarAbono, validarFerias, responderAlteracaoFerias, proporAlteracaoFerias } from "@/modules/rh/actions";
import type { AbonoPendente, FeriasPendente, AlteracaoFeriasPendente, FeriasVigente } from "@/modules/rh/queries";
import { FeriasDatasDialog } from "@/components/rh/ferias-acoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HUMORES = ["😞", "🙁", "😐", "🙂", "😄"];
function dt(d: string | Date) {
  return formatarData(d);
}

export function RhAdminView({
  abonos,
  ferias,
  alteracoesFerias,
  feriasVigentes,
  clima,
  feedbacksHumor,
}: {
  abonos: AbonoPendente[];
  ferias: FeriasPendente[];
  alteracoesFerias: AlteracaoFeriasPendente[];
  feriasVigentes: FeriasVigente[];
  clima: {
    total: number;
    media: number;
    distribuicao: { humor: number; qtd: number }[];
    comentarios: { comentario: string; humor: number; createdAt: string | Date }[];
  };
  feedbacksHumor: { id: string; conteudo: string; autor: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function decidirAbono(id: string, aprovar: boolean) {
    start(async () => {
      const r = await validarAbono({ id, aprovar });
      if (r.ok) {
        toast.success(aprovar ? "Abono aprovado." : "Abono rejeitado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function decidirFerias(id: string, aprovar: boolean) {
    start(async () => {
      const r = await validarFerias({ id, aprovar });
      if (r.ok) {
        toast.success(aprovar ? "Férias aprovadas." : "Férias rejeitadas.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function decidirAlteracao(id: string, aprovar: boolean) {
    start(async () => {
      const r = await responderAlteracaoFerias({ id, aprovar });
      if (r.ok) {
        toast.success(aprovar ? "Nova data de férias aprovada." : "Alteração recusada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const maxDist = Math.max(1, ...clima.distribuicao.map((d) => d.qtd));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">RH — administração</h2>
        <p className="text-sm text-muted-foreground">Validações pendentes e clima da equipe.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smile className="size-4" /> Clima emocional (30 dias)
          </CardTitle>
          <CardDescription>
            {clima.total} registro(s) · média {clima.media.toFixed(1)} / 5 · anônimo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            {clima.distribuicao.map((d) => (
              <div key={d.humor} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-lg">{HUMORES[d.humor - 1]}</span>
                <div className="h-3 flex-1 rounded-sm bg-muted">
                  <div
                    className="h-full rounded-sm bg-primary"
                    style={{ width: `${(d.qtd / maxDist) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-xs">{d.qtd}</span>
              </div>
            ))}
          </div>
          {clima.comentarios.length > 0 && (
            <div className="space-y-1 border-t pt-2">
              <p className="text-xs font-semibold text-muted-foreground">Comentários (anônimos)</p>
              {clima.comentarios.slice(0, 10).map((c, i) => (
                <p key={i} className="text-sm">
                  <span className="mr-1">{HUMORES[c.humor - 1]}</span>
                  {c.comentario}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="size-4" /> Feedback à empresa ({feedbacksHumor.length})
          </CardTitle>
          <CardDescription>Comentários enviados pelo herocard. Anônimos não exibem o autor.</CardDescription>
        </CardHeader>
        <CardContent>
          {feedbacksHumor.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum feedback ainda.</p>
          ) : (
            <ul className="divide-y">
              {feedbacksHumor.map((f) => (
                <li key={f.id} className="space-y-0.5 py-2">
                  <p className="text-sm">{f.conteudo}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.autor ?? "Anônimo"} · {dt(f.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Abonos pendentes ({abonos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {abonos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pendente.</p>
            ) : (
              <ul className="divide-y">
                {abonos.map((a) => (
                  <li key={a.id} className="space-y-1 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{a.user.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {dt(a.dataInicio)} – {dt(a.dataFim)}
                      </span>
                    </div>
                    {a.motivo && <p className="text-xs text-muted-foreground">{a.motivo}</p>}
                    <div className="flex items-center gap-2">
                      {a.atestadoPath && (
                        <Button size="sm" variant="ghost" render={<a href={`/api/rh/abono/${a.id}/atestado`} />}>
                          <Download className="size-3.5" /> Atestado
                        </Button>
                      )}
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => decidirAbono(a.id, true)}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decidirAbono(a.id, false)}>
                        <X className="size-3.5" /> Rejeitar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Férias pendentes ({ferias.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {ferias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pendente.</p>
            ) : (
              <ul className="divide-y">
                {ferias.map((f) => (
                  <li key={f.id} className="space-y-1 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.user.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {dt(f.inicio)} – {dt(f.fim)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => decidirFerias(f.id, true)}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decidirFerias(f.id, false)}>
                        <X className="size-3.5" /> Rejeitar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarSync className="size-4" /> Alterações de férias ({alteracoesFerias.length})
            </CardTitle>
            <CardDescription>
              Mudanças de data em férias já aprovadas. Só valem após a sua aprovação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alteracoesFerias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pendente.</p>
            ) : (
              <ul className="divide-y">
                {alteracoesFerias.map((f) => (
                  <li key={f.id} className="space-y-1 py-2.5">
                    <span className="text-sm font-medium">{f.user.name}</span>
                    <p className="text-xs text-muted-foreground">
                      <span className="line-through">
                        {dt(f.inicio)} – {dt(f.fim)}
                      </span>{" "}
                      <span className="text-info">
                        → {dt(f.altInicio!)} – {dt(f.altFim!)}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => decidirAlteracao(f.id, true)}>
                        <Check className="size-3.5" /> Aprovar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decidirAlteracao(f.id, false)}>
                        <X className="size-3.5" /> Recusar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Férias aprovadas ({feriasVigentes.length})</CardTitle>
            <CardDescription>
              Em curso ou futuras. Ao propor uma nova data, ela só vale após o funcionário aprovar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feriasVigentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma férias aprovada em aberto.</p>
            ) : (
              <ul className="divide-y">
                {feriasVigentes.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{f.user.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {" · "}
                        {dt(f.inicio)} – {dt(f.fim)}
                      </span>
                    </div>
                    {f.altInicio ? (
                      <span className="text-xs text-muted-foreground">Alteração em andamento</span>
                    ) : (
                      <ProporAlteracaoBotao id={f.id} inicio={f.inicio} fim={f.fim} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** RH propõe nova data para férias já aprovadas — depende do aceite do funcionário. */
function ProporAlteracaoBotao({
  id,
  inicio,
  fim,
}: {
  id: string;
  inicio: string | Date;
  fim: string | Date;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <CalendarSync className="size-3.5" /> Propor alteração
      </Button>
      {aberto && (
        <FeriasDatasDialog
          titulo="Propor alteração de férias"
          descricao="A nova data só passa a valer depois que o funcionário aprovar."
          inicio={inicio}
          fim={fim}
          onOpenChange={setAberto}
          onSalvar={(i, f) => proporAlteracaoFerias({ id, inicio: i, fim: f })}
          msgOk="Alteração proposta — aguardando o funcionário."
        />
      )}
    </>
  );
}
