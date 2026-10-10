import type { Metadata } from "next";
import { requireInterno } from "@/lib/session";
import { controlaJornada } from "@/modules/ponto/jornada";
import { minhasSolicitacoes, humorHoje, meuOnboarding, minhasNFs } from "@/modules/rh/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { RhView } from "@/components/rh/rh-view";
import { NfCard } from "@/components/rh/nf-card";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Users } from "lucide-react";
import Link from "next/link";
import { quantosLidera } from "@/modules/rh/desenvolvimento/queries";
import { ehPrestador } from "@/lib/contratacao";

export const metadata: Metadata = { title: "RH" };

export default async function RhPage() {
  const user = await requireInterno();
  const ehPJ = ehPrestador(user.contratacao);
  const [{ abonos, ferias }, humor, onboarding, nfs, modelosExtrato, lidera] = await Promise.all([
    minhasSolicitacoes(user.id),
    humorHoje(user.id),
    meuOnboarding(user.id),
    ehPJ ? minhasNFs(user.id) : Promise.resolve([]),
    ehPJ ? modelosPorFonte("extrato") : Promise.resolve([]),
    quantosLidera(user.id),
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
          atestadoNome: a.atestadoNome,
          motivoTipo: a.motivoTipo,
          tratamento: a.tratamento,
          horaInicio: a.horaInicio,
          horaFim: a.horaFim,
        }))}
        ferias={ferias.map((f) => ({
          id: f.id,
          inicio: f.inicio,
          fim: f.fim,
          status: f.status,
          altInicio: f.altInicio,
          altFim: f.altFim,
          altOkAdmin: f.altOkAdmin,
          altOkFunc: f.altOkFunc,
          altPorMim: f.altPorId === user.id,
          lancadaPeloRh: f.lancadoPorId !== null,
        }))}
        humorAtual={humor?.humor ?? null}
        podeSolicitarFerias={controlaJornada(user)}
      />

      {lidera > 0 && (
        <Link href="/rh/minha-equipe" className="flex items-center gap-2 rounded-sm border px-4 py-3 text-sm hover:bg-muted/40">
          <Users className="size-4 text-muted-foreground" />
          <span className="flex-1">Minha equipe — você lidera {lidera} pessoa(s): objetivos e encontros 1:1.</span>
        </Link>
      )}

      {onboarding && onboarding.itens.some((i) => !i.concluido) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{onboarding.tipo === "saida" ? "Minha lista de saída" : "Minha lista de entrada"}</CardTitle>
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
        <>
          {modelosExtrato.length > 0 && (
            <GerarDocumentoButton modelos={modelosExtrato} paramId="userId" valor={user.id} />
          )}
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
        </>
      )}
    </div>
  );
}
