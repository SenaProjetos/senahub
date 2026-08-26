import { formatarDataHora } from "@/lib/utils";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";

type NotaItem = {
  id: string;
  nota: string;
  createdAt: Date | string;
  autor: { name: string | null; image?: string | null } | null;
};

/**
 * Histórico cronológico de notas/atividades de um lead.
 * As notas chegam ordenadas desc (mais recentes primeiro) das queries.
 */
export function NotasHistorico({
  atividades,
  className,
}: {
  atividades: NotaItem[];
  className?: string;
}) {
  if (atividades.length === 0) {
    return (
      <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
        Nenhuma nota registrada.
      </p>
    );
  }

  return (
    <ul className={`space-y-2 ${className ?? ""}`}>
      {atividades.map((a) => (
        <li key={a.id} className="rounded-sm border bg-card p-2 text-sm">
          <p className="whitespace-pre-wrap">{a.nota}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            {a.autor?.name && (
              <AvatarUsuario nome={a.autor.name} image={a.autor.image} size="sm" className="size-4" title={a.autor.name} />
            )}
            <span className="font-mono">{formatarDataHora(a.createdAt)}</span>
            {a.autor?.name ? ` · ${a.autor.name}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
