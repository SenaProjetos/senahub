import { Suspense } from "react";
import Link from "next/link";
import { HardHat, MapPin } from "lucide-react";
import { formatarData } from "@/lib/utils";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { obrasParaLista } from "@/modules/portal/obra/queries";
import { querResumoPorEmail } from "@/modules/portal/queries";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { ResumoEmailToggle } from "@/components/portal/resumo-email-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Minhas obras" da conta de obra (spec 2026-11-25): um cartão por obra da lista, com o que importa no canteiro — nome, código,
 * endereço, quantas pranchas estão liberadas e quando foi a última liberação. Nada do cliente (situação, prazo, contratos).
 * O cabeçalho sai na hora; a lista (que lê a pasta de cada obra) carrega com esqueleto.
 */
export function ObrasDaConta({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Minhas obras" descricao="Pranchas e modelos liberados para a execução das suas obras." />
      <Suspense fallback={<ObrasCarregando />}>
        <ListaDeObras userId={userId} />
      </Suspense>
    </div>
  );
}

async function ListaDeObras({ userId }: { userId: string }) {
  const obras = await obrasParaLista(userId);
  const resumoPorEmail = await querResumoPorEmail(userId);
  return (
    <>
      {obras.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState icon={HardHat} title="Nenhuma obra liberada para você ainda." description="Fale com o escritório." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {obras.map((o) => (
            <Link key={o.id} href={`/portal/${o.id}`} className="group rounded-md focus-visible:outline-none">
              <Card className="h-full transition-colors group-hover:border-primary group-focus-visible:border-primary group-focus-visible:ring-2 group-focus-visible:ring-ring">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <span className="font-mono text-primary">{formatarCodigo(o.codigo)}</span> · {o.nome}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                  {o.endereco && (
                    <p className="flex min-w-0 items-center gap-1.5">
                      <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{o.endereco}</span>
                    </p>
                  )}
                  <p className="text-foreground">
                    {o.liberadas === 0 ? "Nenhum arquivo liberado" : o.liberadas === 1 ? "1 arquivo liberado" : `${o.liberadas} arquivos liberados`}
                  </p>
                  {o.ultimaLiberacao && <p className="text-xs">Última liberação em {formatarData(o.ultimaLiberacao)}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <ResumoEmailToggle
        ligado={resumoPorEmail}
        rotulo="Receber por e-mail o resumo diário quando algo for liberado, substituído ou retirado de obra"
      />
    </>
  );
}

function ObrasCarregando() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando as obras…
      </span>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
