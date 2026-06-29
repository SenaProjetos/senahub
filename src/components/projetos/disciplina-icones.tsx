import type { StatusDisciplina } from "@/generated/prisma/client";
import { iconeDisciplina } from "@/lib/disciplinas";
import { STATUS_TEXT, STATUS_LABEL } from "@/modules/projetos/status";

/**
 * Mód 2/15: lista de ícones de disciplina coloridos pela cor do STATUS de cada uma.
 * Acessível: o ícone é `aria-hidden` e cada item carrega texto `sr-only` + `title`
 * ("Estrutural — Em revisão"), então o status nunca depende só da cor.
 */
export function DisciplinaIcones({
  disciplinas,
  max = 8,
  size = "size-4",
}: {
  disciplinas: { nome: string; status: StatusDisciplina }[];
  max?: number;
  size?: string;
}) {
  if (disciplinas.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const visiveis = disciplinas.slice(0, max);
  const resto = disciplinas.length - visiveis.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visiveis.map((d, i) => {
        const Icone = iconeDisciplina(d.nome);
        const rotulo = `${d.nome} — ${STATUS_LABEL[d.status]}`;
        return (
          <span
            key={`${d.nome}-${i}`}
            title={rotulo}
            className={`inline-flex items-center ${STATUS_TEXT[d.status]}`}
          >
            <Icone className={size} aria-hidden />
            <span className="sr-only">{rotulo}</span>
          </span>
        );
      })}
      {resto > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground" title={`mais ${resto}`}>
          +{resto}
        </span>
      )}
    </div>
  );
}
