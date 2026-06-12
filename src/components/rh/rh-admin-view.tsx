"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Download, Smile } from "lucide-react";
import { validarAbono, validarFerias } from "@/modules/rh/actions";
import type { AbonoPendente, FeriasPendente } from "@/modules/rh/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const HUMORES = ["😞", "🙁", "😐", "🙂", "😄"];
function dt(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR");
}

export function RhAdminView({
  abonos,
  ferias,
  clima,
}: {
  abonos: AbonoPendente[];
  ferias: FeriasPendente[];
  clima: {
    total: number;
    media: number;
    distribuicao: { humor: number; qtd: number }[];
    comentarios: { comentario: string; humor: number; createdAt: string | Date }[];
  };
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
      </div>
    </div>
  );
}
