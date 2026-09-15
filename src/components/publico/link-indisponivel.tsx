import type { LucideIcon } from "lucide-react";
import { Link2Off } from "lucide-react";

/**
 * Estado neutro de todo link público inválido (inexistente, revogado, expirado). Nunca revela se
 * o link já existiu nem a que se refere — e nunca aponta pra `/`, que cairia no login de quem
 * não tem conta.
 */
export function LinkIndisponivel({
  icone: Icone = Link2Off,
  mensagem = "Este link não está mais ativo ou expirou. Solicite um novo link ao responsável.",
}: {
  icone?: LucideIcon;
  mensagem?: string;
}) {
  return (
    <main className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
        <Icone className="size-8 text-muted-foreground" aria-hidden />
      </span>
      <h1 className="text-xl font-extrabold tracking-tight">Link indisponível</h1>
      <p className="mt-2 text-sm text-muted-foreground">{mensagem}</p>
    </main>
  );
}
