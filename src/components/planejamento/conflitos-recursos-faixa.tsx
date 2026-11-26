"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import {
  trechosDosConflitos,
  type ConflitoRecurso,
  type OutroProjetoNoConflito,
  type TrechoDeConflito,
} from "@/modules/planejamento/conflitos-recursos";
import { dataCurta } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const horas = (h: number) => `${String(h).replace(".", ",")}h`;

/** "26/11" ou "26/11 a 30/11". */
export function periodoDoTrecho(t: Pick<TrechoDeConflito, "de" | "ate">): string {
  return t.de === t.ate ? dataCurta(t.de) : `${dataCurta(t.de)} a ${dataCurta(t.ate)}`;
}

const rotuloOutro = (o: OutroProjetoNoConflito) => (o.rascunho ? `${o.rotulo} (rascunho)` : o.rotulo);

/** "2 pessoas acima da jornada em 3 dias" — o resumo da faixa e da confirmação de aprovar. */
export function resumoDosConflitos(conflitos: readonly ConflitoRecurso[]): string {
  const pessoas = new Set(conflitos.map((c) => c.userId)).size;
  const dias = new Set(conflitos.map((c) => c.dia)).size;
  return `${pessoas === 1 ? "1 pessoa" : `${pessoas} pessoas`} acima da jornada em ${dias === 1 ? "1 dia" : `${dias} dias`}`;
}

/** Uma frase por trecho, para a confirmação de aprovar (no máximo 3, o resto vira "e mais N"). */
export function exemplosDosConflitos(conflitos: readonly ConflitoRecurso[], maximo = 3): string {
  const trechos = trechosDosConflitos(conflitos);
  const frases = trechos.slice(0, maximo).map((t) => {
    const com = t.outros && t.outros.length > 0 ? ` (com ${t.outros.map(rotuloOutro).join(", ")})` : "";
    return `${t.nome}, ${periodoDoTrecho(t)}: até ${horas(t.cargaMaxima)} em ${horas(t.capacidade)} de jornada${com}`;
  });
  const resto = trechos.length - frases.length;
  return frases.join("; ") + (resto > 0 ? `; e mais ${resto}` : "") + ".";
}

/**
 * Alerta de conflito de recurso na faixa do cronograma (pedido da equipe, 2026-11-24; por DIA desde a decisão A do pool de
 * recursos): quem tem hora NESTE projeto e passa da jornada do dia somando os outros, de hoje até o fim do projeto. Os dias
 * seguidos viram um trecho. Só alerta — não bloqueia a aprovação nem mexe em data (D18). "Ver na tabela" filtra as linhas
 * daqui que causam a carga.
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
  const trechos = trechosDosConflitos(conflitos);
  const rotulo = trechos.length === 1 ? "1 conflito de recurso" : `${trechos.length} conflitos de recurso`;
  const de = conflitos[0].dia;

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
      <PopoverContent align="start" className="w-md max-w-[calc(100vw-2rem)] p-0" aria-label="Conflitos de recurso">
        <div className="border-b px-3 py-2">
          <h3 className="text-sm font-semibold">Conflitos de recurso</h3>
          <p className="text-xs text-muted-foreground">
            {resumoDosConflitos(conflitos)}, somando este projeto aos outros. Só aviso: nada muda de data sozinho.
          </p>
        </div>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {trechos.map((t) => (
            <li key={`${t.userId}:${t.de}`} className="space-y-1 px-3 py-2 text-xs">
              <p>
                <strong>{t.nome}</strong> · {periodoDoTrecho(t)}
                {t.dias > 1 ? ` (${t.dias} dias)` : ""}: até <strong className="text-warning-text">{horas(t.cargaMaxima)}</strong> em{" "}
                {horas(t.capacidade)} de jornada
              </p>
              <p className="text-muted-foreground">
                {t.dias > 1 ? "No trecho — aqui" : "Aqui"}: {horas(t.horasDoProjeto)} ·{" "}
                {t.outros
                  ? t.outros.length > 0
                    ? t.outros.map((o) => `${rotuloOutro(o)}: ${horas(o.horas)}`).join(" · ")
                    : "nenhum outro projeto"
                  : `outros projetos: ${horas(t.horasOutros)}`}
              </p>
              {t.motivosReducao.length > 0 && <p className="text-muted-foreground">Dia menor: {t.motivosReducao.join(", ")}.</p>}
              {t.linhas.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  aria-label={`Ver na tabela (${t.linhas.length === 1 ? "1 linha" : `${t.linhas.length} linhas`}): ${t.nome}, ${periodoDoTrecho(t)}`}
                  onClick={() => {
                    setAberto(false);
                    onVerNaTabela(`Conflito de ${t.nome} em ${periodoDoTrecho(t)}`, t.linhas.map((l) => l.id));
                  }}
                >
                  Ver na tabela ({t.linhas.length === 1 ? "1 linha" : `${t.linhas.length} linhas`})
                </Button>
              )}
              {verRecursos && (
                <Link
                  href={`/recursos/por-pessoa?pessoa=${encodeURIComponent(t.userId)}&de=${t.de}`}
                  className="ml-1 text-primary underline underline-offset-[3px]"
                  aria-label={`Ver na tela por pessoa: ${t.nome}, ${periodoDoTrecho(t)}`}
                >
                  Ver na tela por pessoa
                </Link>
              )}
            </li>
          ))}
        </ul>
        {verRecursos && (
          <div className="border-t px-3 py-2 text-xs">
            <Link href={`/recursos/por-pessoa?de=${de}`} className="text-primary underline underline-offset-[3px]">
              Abrir a equipe em Recursos, por pessoa
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
