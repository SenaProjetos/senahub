import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { FocoReativacao } from "@/modules/comercial/inteligencia/filtros";
import type { ListasReativacaoDados } from "@/modules/comercial/inteligencia/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Item = ListasReativacaoDados["prospectsEsquecidos"][number];

export function ListasReativacaoView({
  dados,
  foco,
}: {
  dados: ListasReativacaoDados;
  foco: FocoReativacao | null;
}) {
  const listas: { chave: FocoReativacao; titulo: string; descricao: string; itens: Item[] }[] = [
    {
      chave: "prospects_esquecidos",
      titulo: "Prospects esquecidos",
      descricao: `Qualificados sem contato há pelo menos ${dados.limiares.diasSemContato} dias.`,
      itens: dados.prospectsEsquecidos,
    },
    {
      chave: "empresas_sem_interacao",
      titulo: "Empresas sem interação",
      descricao: `Nenhuma interação registrada nos últimos ${dados.limiares.diasSemContato} dias.`,
      itens: dados.empresasSemInteracao,
    },
    {
      chave: "clientes_inativos",
      titulo: "Clientes inativos",
      descricao: `Sem nova contratação há pelo menos ${dados.limiares.diasClienteInativo} dias e sem negociação aberta.`,
      itens: dados.clientesInativos,
    },
    {
      chave: "negociacoes_em_espera",
      titulo: "Negociações em espera",
      descricao: "Negócios pausados que podem ser retomados pelo responsável.",
      itens: dados.negociacoesEmEspera,
    },
    {
      chave: "clientes_para_reativar",
      titulo: "Clientes para reativar",
      descricao: `Recorrentes, sem negociação aberta e parados há pelo menos ${dados.limiares.diasParaReativar} dias.`,
      itens: dados.clientesParaReativar,
    },
  ];
  const visiveis = foco ? listas.filter((lista) => lista.chave === foco) : listas;

  return (
    <section aria-labelledby="listas-reativacao" className="space-y-3">
      <div>
        <h3 id="listas-reativacao" className="text-lg font-bold tracking-tight">
          Listas de reativação
        </h3>
        <p className="text-sm text-muted-foreground">
          Filas determinísticas; os prazos vêm das Configurações do Comercial.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {visiveis.map((lista) => (
          <Card key={lista.chave}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-3 text-sm">
                <span>{lista.titulo}</span>
                <span className="font-normal text-muted-foreground">{lista.itens.length}</span>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{lista.descricao}</p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {lista.itens.length === 0 ? (
                <EmptyState
                  icon={RefreshCw}
                  title="Nenhum registro nesta fila"
                  description="O recorte foi calculado e não encontrou casos que atendam à regra."
                />
              ) : (
                lista.itens.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-md border px-3 py-2 hover:bg-muted/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">{item.nome}</span>
                      {item.responsavel && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.responsavel}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{item.detalhe}</p>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
