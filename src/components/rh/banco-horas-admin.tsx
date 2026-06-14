"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { fecharBancoMesEquipe } from "@/modules/rh/banco/actions";
import { fmtHoras } from "@/modules/ponto/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtSaldo(min: number) {
  const sinal = min < 0 ? "−" : "+";
  return `${sinal}${fmtHoras(Math.abs(min))}`;
}

type Fechamento = { userId: string; nome: string; saldoMinutos: number; acumuladoMinutos: number; fechadoEm: string };

export function BancoHorasAdmin({
  ano,
  mes,
  fechamentos,
}: {
  ano: number;
  mes: number;
  fechamentos: Fechamento[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function fechar() {
    start(async () => {
      const r = await fecharBancoMesEquipe({ ano, mes });
      if (r.ok) {
        toast.success(`Banco fechado para ${r.data.fechados} colaborador(es).`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Banco de horas</CardTitle>
            <CardDescription>
              Fechamento de {MESES[mes - 1]}/{ano} · CLT e estagiários
            </CardDescription>
          </div>
          <Button size="sm" variant={fechamentos.length ? "outline" : "default"} onClick={fechar} disabled={pending}>
            <Clock className="size-3.5" /> {fechamentos.length ? "Refechar mês" : "Fechar mês"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {fechamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Mês ainda não fechado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="py-2">Colaborador</th>
                <th className="py-2 text-right">Saldo do mês</th>
                <th className="py-2 text-right">Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fechamentos.map((f) => (
                <tr key={f.userId}>
                  <td className="py-2">{f.nome}</td>
                  <td className={`py-2 text-right font-mono ${f.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>
                    {fmtSaldo(f.saldoMinutos)}
                  </td>
                  <td className={`py-2 text-right font-mono font-semibold ${f.acumuladoMinutos < 0 ? "text-destructive" : "text-success"}`}>
                    {fmtSaldo(f.acumuladoMinutos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
