import { cn } from "@/lib/utils";
import type { AlertaNav } from "@/lib/nav-config";

/**
 * Bolinha numerada de um item de menu — o equivalente "vindo do servidor" do `ChatBadge`.
 *
 * Duas diferenças para o do chat:
 *
 *  - a COR significa algo: vermelho só quando algo já venceu, âmbar quando ainda dá tempo
 *    (mesma regra do `painel-atencao` de /acessos). Como cor não pode ser o único portador do
 *    sinal, a contagem é texto e o motivo vai no `aria-label`/`title`;
 *  - a pílula é tingida com borda (fundo a 10%, texto e borda na cor), e não um bloco chapado:
 *    é o tratamento de `badge.tsx`/`status-badge.tsx`, então o badge do menu e o chip da linha
 *    na tela de Certidões têm a mesma cara. Chapado exigiria um `--destructive-foreground`, que
 *    o tema não define — e inventar `text-white` quebraria entre tema claro e escuro.
 *
 * `dot`: bolinha lisa para a sidebar colapsada (icon-only), onde não cabe número. Aí a cor é
 * chapada mesmo (não há texto para contrastar) e o `aria-label` continua dizendo quantos e por quê.
 */
export function NavBadge({
  alerta,
  className,
  dot = false,
}: {
  alerta: AlertaNav;
  className?: string;
  dot?: boolean;
}) {
  if (alerta.total <= 0) return null;

  const rotulo = `${alerta.total} — ${alerta.descricao}`;

  if (dot) {
    return (
      <span
        aria-label={rotulo}
        title={alerta.descricao}
        className={cn(
          "size-2 rounded-full ring-2 ring-background",
          alerta.critico ? "bg-destructive" : "bg-warning",
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-label={rotulo}
      title={alerta.descricao}
      className={cn(
        "inline-flex min-w-4.5 items-center justify-center rounded-full border px-1 text-[10px] font-semibold leading-4 tabular-nums",
        alerta.critico
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning",
        className,
      )}
    >
      {alerta.total > 99 ? "99+" : alerta.total}
    </span>
  );
}
