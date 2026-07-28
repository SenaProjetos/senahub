import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData, formatarDataHora } from "@/lib/utils";
import type { BasePrecoItem } from "@/modules/custos/composicoes/queries";
import { ImportarBaseDialog } from "./importar-base-dialog";

type ImportacaoItem = {
  id: string;
  status: string;
  progresso: number | null;
  dataBase: Date;
  ufs: string[];
  regimes: string[];
  insumosCriados: number;
  precosCriados: number;
  composicoesCriadas: number;
  itensCriados: number;
  erro: string | null;
  autor: { name: string };
  createdAt: Date;
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  fila: "neutral",
  processando: "info",
  concluido: "success",
  erro: "danger",
};

export function BasesTab({
  bases,
  importacoes,
  podeGerir,
}: {
  bases: BasePrecoItem[];
  importacoes: ImportacaoItem[];
  podeGerir: boolean;
}) {
  return (
    <div className="space-y-6 pt-3">
      {podeGerir && (
        <div className="flex justify-end">
          <ImportarBaseDialog />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Bases de preço</h3>
        {bases.length === 0 ? (
          <EmptyState icon={Database} title="Nenhuma base de preço importada ainda." />
        ) : (
          <div className="rounded-sm border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead>Data-base</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bases.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground uppercase">{b.fonte}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.uf}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.regime}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatarData(b.dataBase)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={b.ativo ? "success" : "neutral"}>{b.ativo ? "Ativa" : "Inativa"}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {podeGerir && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Últimas importações</h3>
          {importacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma importação ainda.</p>
          ) : (
            <div className="rounded-sm border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data-base</TableHead>
                    <TableHead>UFs</TableHead>
                    <TableHead>Regimes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importacoes.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell className="text-sm">{formatarData(imp.dataBase)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{imp.ufs.join(", ")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{imp.regimes.length}</TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONE[imp.status] ?? "neutral"}>{imp.status}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {imp.status === "erro"
                          ? imp.erro
                          : `${imp.insumosCriados} insumos · ${imp.precosCriados} preços · ${imp.composicoesCriadas} composições · ${imp.itensCriados} itens`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{imp.autor.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatarDataHora(imp.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
