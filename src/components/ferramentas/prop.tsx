import { cn } from "@/lib/utils";

/** `ok` = condição atendida; `alerta` = não atendida. O texto do valor continua dizendo o mesmo (nunca só cor). */
export type TomProp = "ok" | "alerta";

const COR_TOM: Record<TomProp, string> = { ok: "text-success-text", alerta: "text-warning-text" };

/** Uma grandeza do resultado: "símbolo = valor unidade". Única para todas as calculadoras e o Estudos. */
export function Prop({
  simbolo,
  valor,
  un,
  destaque,
  tom,
}: {
  simbolo: string;
  valor: string;
  un: string;
  destaque?: boolean;
  tom?: TomProp;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="italic text-muted-foreground">{simbolo} =</span>
      <span className={cn("font-mono", destaque ? "font-semibold" : "font-medium", tom && COR_TOM[tom])}>{valor}</span>
      <span className="text-xs text-muted-foreground">{un}</span>
    </div>
  );
}
