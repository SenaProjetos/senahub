import { Cake, PartyPopper } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Aniversariante } from "@/modules/dashboard/queries";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

function Inicial({ nome }: { nome: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
      {nome.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Item 4: cards de "Aniversariante(s) do dia" e "Aniversariantes do mês". */
export function AniversariantesCards({ doDia, doMes }: { doDia: Aniversariante[]; doMes: Aniversariante[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PartyPopper className="size-4 text-primary" /> Aniversariante(s) do dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          {doDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aniversariante hoje.</p>
          ) : (
            <ul className="space-y-2">
              {doDia.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5">
                  <Inicial nome={a.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">🎉 {a.name}</p>
                    {a.cargo && <p className="truncate text-xs text-muted-foreground">{a.cargo}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cake className="size-4 text-primary" /> Aniversariantes do mês
          </CardTitle>
          <CardDescription>{MESES[new Date().getMonth()]}.</CardDescription>
        </CardHeader>
        <CardContent>
          {doMes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aniversariante neste mês.</p>
          ) : (
            <ul className="space-y-2">
              {doMes.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-center gap-2.5 ${a.hoje ? "rounded-sm bg-primary/5 px-1.5 py-1" : ""}`}
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">
                    {String(a.dia).padStart(2, "0")}
                  </span>
                  <Inicial nome={a.name} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {a.name}
                      {a.hoje && <span className="ml-1.5 text-xs font-normal text-primary">• hoje</span>}
                    </p>
                    {a.cargo && <p className="truncate text-xs text-muted-foreground">{a.cargo}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
