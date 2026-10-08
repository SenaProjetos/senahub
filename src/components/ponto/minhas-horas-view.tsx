"use client";

import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { empilharPorDestino } from "@/modules/rh/produtividade/horas";
import type { Periodo } from "@/modules/rh/produtividade/periodo";
import type { HorasProjetistas } from "@/modules/rh/produtividade/queries";
import { corDoDestino, rotuloDia, rotuloHoras } from "@/components/rh/horas/formato";
import { GraficoHoras } from "@/components/rh/horas/grafico-horas";
import { SeletorPeriodo } from "@/components/rh/horas/seletor-periodo";

/** Ponto → Minhas horas: só as horas de quem está logado, sem ranking nem colegas. */
export function MinhasHorasView({
  subnav,
  horas,
  periodo,
  hoje,
}: {
  subnav: ReactNode;
  horas: HorasProjetistas;
  periodo: Periodo;
  hoje: string;
}) {
  const eu = horas.pessoas[0];
  const intervalo = `${rotuloDia(periodo.de)} a ${rotuloDia(periodo.ate)}`;
  const series = eu ? empilharPorDestino(eu, horas.destinos).map((s, i) => ({ ...s, cor: corDoDestino(s.chave, i) })) : [];

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Minhas horas" descricao="Suas horas registradas no ponto, dia a dia e por projeto." />
      {subnav}

      <div className="grid grid-cols-3 gap-3">
        <Resumo rotulo="Total" valor={rotuloHoras(eu?.totalHoras ?? 0)} />
        <Resumo rotulo="Média por dia com registro" valor={rotuloHoras(eu?.mediaPorDiaComRegistro ?? 0)} />
        <Resumo rotulo="Dias com registro" valor={String(eu?.diasComRegistro ?? 0)} />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" /> Horas por projeto
            </CardTitle>
            <CardDescription>{intervalo}</CardDescription>
          </div>
          <SeletorPeriodo key={`${periodo.de}:${periodo.ate}`} periodo={periodo} hoje={hoje} />
        </CardHeader>
        <CardContent>
          {!eu || eu.totalHoras === 0 ? (
            <EmptyState
              icon={Clock}
              title={`Nenhuma hora registrada de ${intervalo}.`}
              description="As horas aparecem aqui conforme você bate o ponto."
              className="border-0 py-6 shadow-none"
            />
          ) : (
            <GraficoHoras
              dias={horas.dias}
              granularidade={periodo.granularidade}
              modo="empilhado"
              series={series}
              titulo={`Suas horas por projeto, ${intervalo}`}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription className="text-[10px] uppercase tracking-[0.14em]">{rotulo}</CardDescription>
        <CardTitle className="font-mono text-xl tabular-nums sm:text-2xl">{valor}</CardTitle>
      </CardHeader>
    </Card>
  );
}
