"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import type { ConflitoRecurso } from "@/modules/planejamento/conflitos-recursos";
import { dataCurta } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const horas = (h: number) => `${String(h).replace(".", ",")}h`;

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2 pessoas em 3 semanas" — o resumo da faixa e da confirmação de aprovar. */
export function resumoDosConflitos(conflitos: readonly ConflitoRecurso[]): string {
  const pessoas = new Set(conflitos.map((c) => c.userId)).size;
  const semanas = new Set(conflitos.map((c) => c.semana)).size;
  return `${pessoas === 1 ? "1 pessoa" : `${pessoas} pessoas`} acima da capacidade em ${semanas === 1 ? "1 semana" : `${semanas} semanas`}`;
}

/** Uma frase por conflito, para a confirmação de aprovar (no máximo 3, o resto vira "e mais N"). */
export function exemplosDosConflitos(conflitos: readonly ConflitoRecurso[], maximo = 3): string {
  const frases = conflitos
    .slice(0, maximo)
    .map((c) => `${c.nome}, semana de ${dataCurta(c.inicioSemana)}: ${horas(c.carga)} de ${horas(c.capacidade)}`);
  const resto = conflitos.length - frases.length;
  return frases.join("; ") + (resto > 0 ? `; e mais ${resto}` : "") + ".";
}

/**
 * Alerta de conflito de recurso na faixa do cronograma (pedido da equipe, 2026-11-24): quem tem hora NESTE projeto e passa
 * da capacidade somando os outros, semana a semana, de hoje até o fim do projeto. Só alerta — não bloqueia a aprovação nem
 * mexe em data (D18). "Ver na tabela" filtra as linhas daqui que causam a carga.
 */
export function ConflitosRecursosFaixa({
  conflitos,
  verRecursos,
  onVerNaTabela,
}: {
  conflitos: ConflitoRecurso[];
  verRecursos: boolean;
  onVerNaTabela: (rotulo: string, tarefaIds: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (conflitos.length === 0) return null;
  const rotulo = conflitos.length === 1 ? "1 conflito de recurso" : `${conflitos.length} conflitos de recurso`;
  const de = conflitos[0].inicioSemana;
  const ate = somarDias(conflitos.reduce((m, c) => (c.inicioSemana > m ? c.inicioSemana : m), de), 6);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-warning-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${rotulo}: ${resumoDosConflitos(conflitos)}. Abrir detalhes`}
          />
        }
      >
        <Users className="size-4 text-warning" aria-hidden />
        <span className="underline underline-offset-[3px]">{rotulo}</span>
        <ChevronRight className="size-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-md max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-3 py-2">
          <h3 className="text-sm font-semibold">Conflitos de recurso</h3>
          <p className="text-xs text-muted-foreground">
            {resumoDosConflitos(conflitos)}, somando este projeto aos outros. Só aviso: nada muda de data sozinho.
          </p>
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {conflitos.map((c) => (
            <li key={`${c.userId}:${c.semana}`} className="space-y-1 px-3 py-2 text-xs">
              <p>
                <strong>{c.nome}</strong> · semana de {dataCurta(c.inicioSemana)}:{" "}
                <strong className="text-warning-text">{horas(c.carga)}</strong> para {horas(c.capacidade)} disponíveis (+{horas(c.excesso)})
              </p>
              <p className="text-muted-foreground">
                Aqui: {horas(c.horasDoProjeto)} ·{" "}
                {c.outros
                  ? c.outros.length > 0
                    ? c.outros.map((o) => `${o.rotulo}: ${horas(o.horas)}`).join(" · ")
                    : "nenhum outro projeto"
                  : `outros projetos: ${horas(c.horasOutros)}`}
              </p>
              {c.motivosReducao.length > 0 && <p className="text-muted-foreground">Semana menor: {c.motivosReducao.join(", ")}.</p>}
              {c.linhas.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => {
                    setAberto(false);
                    onVerNaTabela(`Conflito de ${c.nome} na semana de ${dataCurta(c.inicioSemana)}`, c.linhas.map((l) => l.id));
                  }}
                >
                  Ver na tabela ({c.linhas.length === 1 ? "1 linha" : `${c.linhas.length} linhas`})
                </Button>
              )}
            </li>
          ))}
        </ul>
        {verRecursos && (
          <div className="border-t px-3 py-2 text-xs">
            <Link href={`/recursos?de=${de}&ate=${ate}`} className="text-primary underline underline-offset-[3px]">
              Abrir a carga da equipe em Recursos
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
