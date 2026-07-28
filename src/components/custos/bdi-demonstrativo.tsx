import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarPercentual } from "@/modules/custos/status";
import type { LinhaDemonstrativoBdi } from "@/modules/custos/bdi";

/** Demonstrativo do BDI (Acórdão TCU 2622/2013), pronto para impressão. */
export function BdiDemonstrativo({
  demonstrativo,
  percentual,
  tributosTotal,
}: {
  demonstrativo: LinhaDemonstrativoBdi[];
  percentual: number;
  tributosTotal: number;
}) {
  const margens = demonstrativo.filter((l) => !["pis", "cofins", "iss", "cprb"].includes(l.chave));
  const tributos = demonstrativo.filter((l) => ["pis", "cofins", "iss", "cprb"].includes(l.chave));

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parcela</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {margens.map((l) => (
            <TableRow key={l.chave}>
              <TableCell>{l.rotulo}</TableCell>
              <TableCell className="text-right font-mono">{formatarPercentual(l.percentual)}</TableCell>
            </TableRow>
          ))}
          {tributos.map((l) => (
            <TableRow key={l.chave}>
              <TableCell className="text-muted-foreground">{l.rotulo} (I)</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatarPercentual(l.percentual)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell className="text-muted-foreground">Total de tributos (I)</TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">
              {formatarPercentual(tributosTotal)}
            </TableCell>
          </TableRow>
          <TableRow className="font-bold">
            <TableCell>BDI</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(percentual)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
