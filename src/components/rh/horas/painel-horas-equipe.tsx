"use client";

import { useMemo, useState } from "react";
import { Clock, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { empilharPorDestino } from "@/modules/rh/produtividade/horas";
import { LIMITE_COMPARACAO } from "@/modules/rh/produtividade/acoes-horas";
import type { Periodo } from "@/modules/rh/produtividade/periodo";
import type { HorasProjetistas, PessoaHoras } from "@/modules/rh/produtividade/queries";
import { CORES_COMPARACAO, corDoDestino, rotuloDia } from "./formato";
import { GraficoHoras, type SerieGrafico } from "./grafico-horas";
import { RankingHoras } from "./ranking-horas";
import { SeletorPeriodo } from "./seletor-periodo";

/** RH → Produtividade: período, ranking de todos e gráfico de quem está selecionado. */
export function PainelHorasEquipe({
  horas,
  periodo,
  hoje,
  podeVerEspelho,
}: {
  horas: HorasProjetistas;
  periodo: Periodo;
  hoje: string;
  podeVerEspelho: boolean;
}) {
  const pessoas = useMemo(
    () =>
      horas.pessoas
        .filter((p) => p.totalHoras > 0)
        .sort((a, b) => b.totalHoras - a.totalHoras || a.nome.localeCompare(b.nome)),
    [horas.pessoas],
  );
  const [selecionados, setSelecionados] = useState<string[]>(() => pessoas.slice(0, 1).map((p) => p.userId));
  const ativos = selecionados
    .map((id) => pessoas.find((p) => p.userId === id))
    .filter((p): p is PessoaHoras => p !== undefined);
  const cores = Object.fromEntries(selecionados.map((id, i) => [id, CORES_COMPARACAO[i % CORES_COMPARACAO.length]]));

  function alternar(userId: string) {
    setSelecionados((atuais) =>
      atuais.includes(userId)
        ? atuais.filter((id) => id !== userId)
        : atuais.length >= LIMITE_COMPARACAO
          ? atuais
          : [...atuais, userId],
    );
  }

  const series: SerieGrafico[] =
    ativos.length === 1
      ? empilharPorDestino(ativos[0], horas.destinos).map((s, i) => ({ ...s, cor: corDoDestino(s.chave, i) }))
      : ativos.map((p) => ({ chave: p.userId, rotulo: p.nome, cor: cores[p.userId], valores: p.porDia }));

  const intervalo = `${rotuloDia(periodo.de)} a ${rotuloDia(periodo.ate)}`;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" /> Horas no período
          </CardTitle>
          <CardDescription>
            Clique em até {LIMITE_COMPARACAO} nomes para comparar. Com um só nome, o gráfico separa as horas por projeto.
          </CardDescription>
        </div>
        <SeletorPeriodo key={`${periodo.de}:${periodo.ate}`} periodo={periodo} hoje={hoje} />
      </CardHeader>
      <CardContent className="space-y-4">
        {pessoas.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`Sem horas registradas de ${intervalo}.`}
            description="Escolha outro período ou aguarde os registros de ponto dos projetistas."
            className="border-0 py-6 shadow-none"
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <RankingHoras
              pessoas={pessoas}
              selecionados={selecionados}
              cores={cores}
              podeVerEspelho={podeVerEspelho}
              onAlternar={alternar}
              onSoEste={(id) => setSelecionados([id])}
            />
            {ativos.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Selecione um projetista no ranking para ver o gráfico.</p>
            ) : (
              <GraficoHoras
                dias={horas.dias}
                granularidade={periodo.granularidade}
                modo={ativos.length === 1 ? "empilhado" : "linhas"}
                series={series}
                titulo={
                  ativos.length === 1
                    ? `Horas de ${ativos[0].nome} por projeto, ${intervalo}`
                    : `Comparação de horas por dia, ${intervalo}`
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
