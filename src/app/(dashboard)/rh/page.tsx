import type { Metadata } from "next";
import { requireRole } from "@/lib/session";
import { minhasSolicitacoes, humorHoje, meuOnboarding, minhasNFs } from "@/modules/rh/queries";
import { RhView } from "@/components/rh/rh-view";
import { NfCard } from "@/components/rh/nf-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

export const metadata: Metadata = { title: "RH" };

export default async function RhPage() {
  const user = await requireRole(
    "admin",
    "supervisor",
    "administrativo",
    "clt",
    "estagiario",
    "projetista_pj",
    "freelancer",
  );
  const ehPJ = user.role === "projetista_pj" || user.role === "freelancer";
  const [{ abonos, ferias }, humor, onboarding, nfs] = await Promise.all([
    minhasSolicitacoes(user.id),
    humorHoje(user.id),
    meuOnboarding(user.id),
    ehPJ ? minhasNFs(user.id) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <RhView
        abonos={abonos.map((a) => ({
          id: a.id,
          dataInicio: a.dataInicio,
          dataFim: a.dataFim,
          status: a.status,
          atestadoPath: a.atestadoPath,
        }))}
        ferias={ferias.map((f) => ({ id: f.id, inicio: f.inicio, fim: f.fim, status: f.status }))}
        humorAtual={humor?.humor ?? null}
      />

      {onboarding && onboarding.itens.some((i) => !i.concluido) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meu onboarding</CardTitle>
            <CardDescription>
              {onboarding.itens.filter((i) => i.concluido).length}/{onboarding.itens.length}{" "}
              concluído(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {onboarding.itens.map((it) => (
                <li key={it.id} className="flex items-center gap-2">
                  {it.concluido ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                  <span className={it.concluido ? "text-muted-foreground line-through" : ""}>
                    {it.descricao}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {ehPJ && (
        <NfCard
          nfs={nfs.map((n) => ({
            id: n.id,
            numero: n.numero,
            valor: Number(n.valor),
            status: n.status,
            observacao: n.observacao,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
