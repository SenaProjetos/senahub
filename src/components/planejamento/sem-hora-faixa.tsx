"use client";

import { useState } from "react";
import { ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

export type SemHora = { semNinguem: string[]; semHoras: string[] };

const atividades = (n: number) => (n === 1 ? "1 atividade" : `${n} atividades`);

/** O parágrafo do aviso de aprovar: uma frase por causa, cada uma dizendo onde se corrige. */
export function descricaoSemHora(s: SemHora): string {
  const frases = [
    s.semNinguem.length > 0
      ? `${atividades(s.semNinguem.length)} sem ninguém escalado: escale uma pessoa ou um perfil na linha (Pessoas e horas) e as horas entram sozinhas.`
      : null,
    s.semHoras.length > 0
      ? `${atividades(s.semHoras.length)} com gente mas sem horas: digite as horas na linha (Pessoas e horas).`
      : null,
  ];
  return `${frases.filter(Boolean).join(" ")} Sem hora, a atividade não entra na carga de ninguém, nem no custo, nem nas horas da linha de base.`;
}

/**
 * Atividades sem hora prevista na faixa do cronograma (feedback do planejamento, 26/11/2026): o aviso de aprovar dizia
 * "N atividades sem hora" sem dizer onde pôr hora. Aqui as duas causas ficam separadas, cada uma com "Ver na tabela", e as
 * sem ninguém com o atalho de herdar o responsável da disciplina (que entra com hora automática).
 */
export function SemHoraFaixa({
  semHora,
  onVerNaTabela,
  onHerdar,
}: {
  semHora: SemHora;
  onVerNaTabela: (rotulo: string, tarefaIds: string[]) => void;
  /** Ausente = quem vê não monta a EAP. */
  onHerdar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const total = semHora.semNinguem.length + semHora.semHoras.length;
  if (total === 0) return null;
  const rotulo = `${atividades(total)} sem hora`;

  const ver = (titulo: string, ids: string[]) => {
    setAberto(false);
    onVerNaTabela(titulo, ids);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-warning-text hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${rotulo}. Abrir detalhes`}
          />
        }
      >
        <Clock className="size-4 text-warning" aria-hidden />
        <span className="underline underline-offset-[3px]">{rotulo}</span>
        <ChevronRight className="size-3" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-md max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-3 py-2">
          <PopoverTitle className="text-sm font-semibold">Atividades sem hora prevista</PopoverTitle>
          <p className="text-xs text-muted-foreground">
            Sem hora, a atividade não entra na carga de ninguém, nem no custo, nem nas horas da linha de base.
          </p>
        </div>
        <ul className="divide-y">
          {semHora.semNinguem.length > 0 && (
            <li className="space-y-1 px-3 py-2 text-xs">
              <p>
                <strong>{atividades(semHora.semNinguem.length)} sem ninguém escalado.</strong> Abra a linha e, em Pessoas e
                horas, escale uma pessoa ou um perfil: quem executa ganha dias úteis × 8 h sozinho.
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  aria-label="Ver na tabela as atividades sem ninguém escalado"
                  onClick={() => ver("Sem ninguém escalado", semHora.semNinguem)}
                >
                  Ver na tabela
                </Button>
                {onHerdar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    title="Cada linha sem ninguém recebe os responsáveis da disciplina dela; o que já tem gente não é tocado."
                    onClick={() => {
                      setAberto(false);
                      onHerdar();
                    }}
                  >
                    Preencher com o responsável da disciplina
                  </Button>
                )}
              </div>
            </li>
          )}
          {semHora.semHoras.length > 0 && (
            <li className="space-y-1 px-3 py-2 text-xs">
              <p>
                <strong>{atividades(semHora.semHoras.length)} com gente mas sem horas.</strong> Quem está nelas revisa,
                acompanha ou aprova (essas nascem em zero) ou as horas foram zeradas: digite as horas na linha, em Pessoas e
                horas.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-xs"
                aria-label="Ver na tabela as atividades com gente mas sem horas"
                onClick={() => ver("Com gente mas sem horas", semHora.semHoras)}
              >
                Ver na tabela
              </Button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
