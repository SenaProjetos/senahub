import Link from "next/link";
import { Check, LifeBuoy, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/utils";
import type { meuAcesso } from "@/modules/usuarios/vinculo/queries";

type Acesso = NonNullable<Awaited<ReturnType<typeof meuAcesso>>>;

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{valor}</p>
    </div>
  );
}

/**
 * "Meu acesso" — leitura pura: o que a pessoa é no sistema e o que ela pode fazer, em
 * português de negócio. Nunca mostra `recurso:acao`.
 *
 * Setor e Contratação são exibidos, não editados: quem altera é o RH/admin. A separação
 * entre "Cargo" (o que a pessoa é para o escritório) e "Perfil" (o que ela pode clicar) é
 * explícita de propósito — confundir os dois foi apontado no conselho como a via mais
 * provável de alguém perder acesso por erro de preenchimento.
 */
export function MeuAcesso({ acesso }: { acesso: Acesso }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> Meu acesso
        </CardTitle>
        <CardDescription>
          Como você está cadastrado e o que o seu perfil libera no sistema. Para mudar qualquer
          um destes campos, fale com o RH.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Setor" valor={acesso.setor ?? "Não definido"} />
          <Campo label="Contratação" valor={acesso.contratacao ?? "Não definida"} />
          <Campo label="Cargo" valor={acesso.cargo ?? "Não informado"} />
          <div>
            <p className="text-xs text-muted-foreground">Perfil de acesso</p>
            <p className="font-medium">{acesso.perfil}</p>
          </div>
        </div>

        {(acesso.desde || acesso.pj) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {acesso.desde && <Campo label="Nesta contratação desde" valor={formatarData(acesso.desde)} />}
            {acesso.pj && <Campo label="Fatura pela empresa" valor={acesso.pj} />}
          </div>
        )}

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">O que você pode fazer</h3>
            {acesso.acessoTotal ? (
              <Badge variant="outline">Acesso total</Badge>
            ) : (
              <Badge variant="outline">
                {acesso.permitidas} de {acesso.total} permissões
              </Badge>
            )}
          </div>

          {acesso.grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Seu perfil ainda não libera nenhuma ação. Se isso parece errado, procure o RH.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {acesso.grupos.map((g) => (
                <li key={g.recurso} className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                  <ul className="mt-1.5 space-y-1">
                    {g.acoes
                      .filter((a) => a.permitido)
                      .map((a) => (
                        <li key={a.label} className="flex items-start gap-1.5 text-sm">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                          <span>{a.label}</span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Esta lista mostra as permissões do seu perfil. O que você enxerga em cada projeto
          também depende de você participar dele.
        </p>

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          render={
            <Link
              href={`/suporte?nova=1&categoria=acesso&titulo=${encodeURIComponent("Meu acesso está errado")}`}
            />
          }
        >
          <LifeBuoy className="size-4" /> Meu acesso está errado
        </Button>
      </CardContent>
    </Card>
  );
}
