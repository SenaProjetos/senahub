import type { LucideIcon } from "lucide-react";

/**
 * Título padrão das páginas públicas: rótulo do tipo de link (com ícone), código opcional,
 * título, descrição e ações à direita (ex.: "Baixar tudo").
 */
export function CabecalhoPublico({
  icone: Icone,
  rotulo,
  codigo,
  titulo,
  descricao,
  acoes,
}: {
  icone: LucideIcon;
  rotulo: string;
  codigo?: string | null;
  titulo: string;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <Icone className="size-3.5" aria-hidden />
          {rotulo}
          {codigo && <span className="font-mono font-normal normal-case tracking-normal text-muted-foreground">· {codigo}</span>}
        </p>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight sm:text-3xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="shrink-0">{acoes}</div>}
    </div>
  );
}
