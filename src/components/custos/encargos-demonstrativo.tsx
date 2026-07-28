import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarPercentual } from "@/modules/custos/status";
import type { LinhaEncargo } from "@/modules/custos/encargos-obra";

const GRUPO_LABEL: Record<string, string> = { A: "Grupo A", B: "Grupo B", C: "Grupo C" };

/** Demonstrativo dos encargos sociais de obra (Grupos A/B/C/D), horista × mensalista. */
export function EncargosDemonstrativo({
  linhas,
  grupoA,
  grupoBHorista,
  grupoBMensalista,
  grupoC,
  grupoDHorista,
  grupoDMensalista,
  totalHorista,
  totalMensalista,
}: {
  linhas: LinhaEncargo[];
  grupoA: number;
  grupoBHorista: number;
  grupoBMensalista: number;
  grupoC: number;
  grupoDHorista: number;
  grupoDMensalista: number;
  totalHorista: number;
  totalMensalista: number;
}) {
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rubrica</TableHead>
            <TableHead className="text-right">Horista</TableHead>
            <TableHead className="text-right">Mensalista</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(["A", "B", "C"] as const).map((grupo) => (
            <Fragment key={grupo}>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={3} className="text-xs font-semibold text-muted-foreground">
                  {GRUPO_LABEL[grupo]}
                </TableCell>
              </TableRow>
              {linhas
                .filter((l) => l.grupo === grupo)
                .map((l) => (
                  <TableRow key={l.codigo}>
                    <TableCell>
                      {l.descricao}
                      {l.zeradaPeloRegime && (
                        <span className="ml-2 text-xs text-muted-foreground">(zerada — desonerado)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatarPercentual(l.horista)}</TableCell>
                    <TableCell className="text-right font-mono">{formatarPercentual(l.mensalista)}</TableCell>
                  </TableRow>
                ))}
            </Fragment>
          ))}

          <TableRow className="font-semibold">
            <TableCell>Total Grupo A</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoA)}</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoA)}</TableCell>
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell>Total Grupo B</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoBHorista)}</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoBMensalista)}</TableCell>
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell>Total Grupo C</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoC)}</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoC)}</TableCell>
          </TableRow>
          <TableRow className="font-semibold">
            <TableCell>Grupo D (reincidência A×B, calculado)</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoDHorista)}</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(grupoDMensalista)}</TableCell>
          </TableRow>
          <TableRow className="font-bold">
            <TableCell>Total de encargos</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(totalHorista)}</TableCell>
            <TableCell className="text-right font-mono">{formatarPercentual(totalMensalista)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
