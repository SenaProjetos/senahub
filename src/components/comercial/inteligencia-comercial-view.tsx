import { BarChart3, CircleDollarSign, GitBranch } from "lucide-react";
import type {
  InteligenciaComercialDados,
  LinhaCategoria,
  LinhaOrigem,
} from "@/modules/comercial/inteligencia/analise";
import { ESTAGIO_NEGOCIACAO_LABEL } from "@/modules/comercial/labels";
import { brlInteiro } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function InteligenciaComercialView({ dados }: { dados: InteligenciaComercialDados }) {
  const { resumo, funil, novosVsRecorrentes } = dados;
  return (
    <div className="space-y-8">
      <section aria-labelledby="metricas-executivas" className="space-y-3">
        <h3 id="metricas-executivas" className="text-lg font-bold tracking-tight">
          Métricas executivas
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardNumero titulo="Prospecções criadas" valor={String(resumo.prospeccoes)} />
          <CardNumero titulo="Negociações criadas" valor={String(resumo.negociacoes)} />
          <CardNumero titulo="Propostas enviadas" valor={String(resumo.propostas)} />
          <CardNumero titulo="Contratos fechados" valor={String(resumo.contratos)} detalhe={resumo.contratosSemValor > 0 ? `${resumo.contratosSemValor} sem valor` : undefined} />
          <CardNumero titulo="Receita contratada" valor={brlInteiro(resumo.receita)} />
          <CardNumero titulo="Ticket médio" valor={resumo.ticketMedio == null ? "Sem contratos com valor" : brlInteiro(resumo.ticketMedio)} />
          <CardNumero titulo="Pipeline aberto" valor={brlInteiro(resumo.pipelineAberto)} detalhe={`${brlInteiro(resumo.pipelineEmEspera)} em espera · ${resumo.pipelineSemValor} sem valor`} />
          <CardNumero titulo="Pipeline ponderado" valor={brlInteiro(resumo.pipelinePonderado)} />
          <CardNumero titulo="Tempo médio de fechamento" valor={resumo.tempoFechamento.media == null ? "Sem fechamentos na coorte" : `${resumo.tempoFechamento.media.toFixed(1)} dias`} detalhe={resumo.tempoFechamento.mediana == null ? undefined : `Mediana: ${resumo.tempoFechamento.mediana.toFixed(1)} dias`} />
        </div>
      </section>

      <section aria-labelledby="funil-conversao" className="space-y-3">
        <div>
          <h3 id="funil-conversao" className="text-lg font-bold tracking-tight">
            Funil de conversão
          </h3>
          <p className="text-sm text-muted-foreground">
            Coorte de {funil.coorte} negociação(ões) criada(s) no período. Cada etapa conta quem comprovadamente a alcançou.
          </p>
        </div>
        {funil.coorte === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="Sem negociações neste recorte"
            description="Não há base para calcular taxas entre etapas. Amplie o período ou remova filtros."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Card>
              <CardContent className="space-y-2 p-5">
                {funil.etapas.map((item, indice) => {
                  const anterior = funil.etapas[indice - 1];
                  const entreEtapas = anterior?.quantidade
                    ? item.quantidade / anterior.quantidade
                    : null;
                  const largura = Math.max(16, (item.taxa ?? 0) * 100);
                  return (
                    <div key={item.etapa} className="text-center">
                      <div
                        className="mx-auto flex min-h-11 items-center justify-center bg-primary px-3 text-sm font-semibold text-primary-foreground"
                        style={{
                          width: `${largura}%`,
                          clipPath: "polygon(6% 0, 94% 0, 100% 100%, 0 100%)",
                        }}
                      >
                        {ESTAGIO_NEGOCIACAO_LABEL[item.etapa]} · {item.quantidade}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {indice === 0
                          ? "100% da coorte"
                          : entreEtapas == null
                            ? "Sem base na etapa anterior"
                            : `${percentual(entreEtapas)} da etapa anterior`}
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Ponta a ponta</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-extrabold">
                  {percentual(funil.pontaAPonta.taxa)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {funil.pontaAPonta.contratos} contrato(s) entre {funil.pontaAPonta.prospeccoes} prospecção(ões) da coorte.
                </p>
                {funil.pontaAPonta.contratosSemProspeccao > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {funil.pontaAPonta.contratosSemProspeccao} contrato(s) sem prospecção de origem ficaram fora desta taxa.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <SecaoOrigem titulo="Análise por canal" linhas={dados.porCanal} />
      <SecaoOrigem titulo="Análise por campanha" linhas={dados.porCampanha} />

      <div className="grid gap-6 xl:grid-cols-2">
        <SecaoCategoria titulo="Por tipo de empreendimento" linhas={dados.porTipoEmpreendimento} />
        <SecaoCategoria
          titulo="Por disciplina"
          linhas={dados.porDisciplina}
          observacao="O desconto da proposta é rateado proporcionalmente pelo valor dos itens de cada disciplina; representa rateio analítico, não desconto negociado por item."
        />
      </div>

      <section aria-labelledby="novos-recorrentes" className="space-y-3">
        <h3 id="novos-recorrentes" className="text-lg font-bold tracking-tight">
          Novos × recorrentes
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardNumero titulo="Contratos de clientes novos" valor={String(novosVsRecorrentes.contratosDeNovos)} detalhe={brlInteiro(novosVsRecorrentes.receitaNovos)} />
          <CardNumero titulo="Contratos recorrentes" valor={String(novosVsRecorrentes.contratosDeRecorrentes)} detalhe={brlInteiro(novosVsRecorrentes.receitaRecorrentes)} />
          <CardNumero titulo="Ticket por empresa" valor={novosVsRecorrentes.ticketPorEmpresa == null ? "Sem contratos no período" : brlInteiro(novosVsRecorrentes.ticketPorEmpresa)} />
          <CardNumero titulo="Recompra em 6 meses" valor={taxaRecompra(novosVsRecorrentes.recompra6m)} />
          <CardNumero titulo="Recompra em 12 meses" valor={taxaRecompra(novosVsRecorrentes.recompra12m)} />
          <CardNumero titulo="Recompra em 24 meses" valor={taxaRecompra(novosVsRecorrentes.recompra24m)} />
        </div>
      </section>
    </div>
  );
}

function CardNumero({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="mt-1 text-xl font-bold">{valor}</p>
        {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

function SecaoOrigem({ titulo, linhas }: { titulo: string; linhas: LinhaOrigem[] }) {
  return (
    <section aria-label={titulo} className="space-y-3">
      <h3 className="text-lg font-bold tracking-tight">{titulo}</h3>
      {linhas.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Sem dados para este recorte"
          description="Não há prospecções, negociações, propostas ou contratos que atendam aos filtros."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{titulo.replace("Análise por ", "")}</th>
                  <th className="px-3 py-3 text-right font-medium">Prospecções</th>
                  <th className="px-3 py-3 text-right font-medium">Negociações</th>
                  <th className="px-3 py-3 text-right font-medium">Propostas</th>
                  <th className="px-3 py-3 text-right font-medium">Contratos</th>
                  <th className="px-3 py-3 text-right font-medium">Conversão</th>
                  <th className="px-3 py-3 text-right font-medium">Receita</th>
                  <th className="px-3 py-3 text-right font-medium">Ticket</th>
                  <th className="px-4 py-3 text-right font-medium">Fechamento</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((linha) => (
                  <tr key={linha.chave}>
                    <td className="px-4 py-3 font-medium">{linha.nome}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.prospeccoes}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.negociacoes}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.propostas}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.contratos}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{percentual(linha.conversao)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{brlInteiro(linha.receita)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{linha.ticketMedio == null ? "Sem base" : brlInteiro(linha.ticketMedio)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{linha.tempoMedioDias == null ? "Sem base" : `${linha.tempoMedioDias.toFixed(1)}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function SecaoCategoria({
  titulo,
  linhas,
  observacao,
}: {
  titulo: string;
  linhas: LinhaCategoria[];
  observacao?: string;
}) {
  const maiorReceita = Math.max(0, ...linhas.map((linha) => linha.receita));
  return (
    <section aria-label={titulo} className="space-y-3">
      <div>
        <h3 className="text-lg font-bold tracking-tight">{titulo}</h3>
        {observacao && <p className="text-xs text-muted-foreground">{observacao}</p>}
      </div>
      {linhas.length === 0 ? (
        <EmptyState icon={CircleDollarSign} title="Sem dados para este recorte" />
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            {linhas.map((linha) => (
              <div key={linha.chave} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{linha.nome}</span>
                  <span className="shrink-0 tabular-nums">{brlInteiro(linha.receita)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maiorReceita === 0 ? 0 : (linha.receita / maiorReceita) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {linha.negociacoes} negociação(ões) · {linha.contratos} contrato(s) · ticket {linha.ticketMedio == null ? "sem base" : brlInteiro(linha.ticketMedio)} · desconto {percentualPct(linha.descontoMedio)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function percentual(valor: number | null): string {
  return valor == null ? "Sem base" : `${(valor * 100).toFixed(1)}%`;
}

function percentualPct(valor: number | null): string {
  return valor == null ? "sem base" : `${valor.toFixed(1)}%`;
}

function taxaRecompra(item: {
  taxa: number | null;
  empresasCoorte: number;
  janelaAindaAberta: boolean;
}): string {
  if (item.janelaAindaAberta) return "Janela ainda aberta";
  if (item.empresasCoorte === 0) return "Sem coorte elegível";
  return percentual(item.taxa);
}
