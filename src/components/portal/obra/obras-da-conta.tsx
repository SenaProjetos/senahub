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

/**
 * "Minhas obras" da conta de obra (spec 2026-11-25): um cartão por obra da lista, com o que importa no canteiro — nome, código,
 * endereço, quantas pranchas estão liberadas e quando foi a última liberação. Nada do cliente (situação, prazo, contratos).
 */
export async function ObrasDaConta({ userId }: { userId: string }) {
  const [obras, resumoPorEmail] = [await obrasParaLista(userId), await querResumoPorEmail(userId)];
  return (
    <div className="space-y-6">
      <CabecalhoPagina titulo="Minhas obras" descricao="Pranchas e modelos liberados para a execução das suas obras." />
      {obras.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <EmptyState icon={HardHat} title="Nenhuma obra liberada para você ainda." description="Fale com o escritório." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {obras.map((o) => (
            <Link key={o.id} href={`/portal/${o.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
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
                  <p>
                    {o.liberadas === 0 ? "Nenhuma prancha liberada" : o.liberadas === 1 ? "1 prancha liberada" : `${o.liberadas} pranchas liberadas`}
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
    </div>
  );
}
