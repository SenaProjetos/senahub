import Link from "next/link";
import { formatarData, formatarDataHora } from "@/lib/utils";
import type { ContaObraDoProjeto } from "@/modules/portal/obra/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Aba Cliente do projeto: quem tem conta de obra com este projeto (spec 2026-11-25), só leitura. Dar ou tirar o acesso é em
 * Configurações → Usuários — o link aparece só para quem pode (`usuarios:gerir`).
 */
export function AcessoObraEquipe({ contas, podeGerir }: { contas: ContaObraDoProjeto[]; podeGerir: boolean }) {
  if (contas.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Acesso de obra</CardTitle>
        {podeGerir && (
          <Link href="/configuracoes/usuarios" className="text-sm text-primary underline-offset-4 hover:underline">
            Gerenciar contas de obra
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <p className="px-2 pb-2 text-xs text-muted-foreground">
          Estas pessoas veem só a pasta Liberado para obra e o modelo 3D deste projeto.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Acesso até</TableHead>
                <TableHead>Último acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.map((c) => (
                <TableRow key={c.userId}>
                  <TableCell className="font-medium">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {c.nome}
                      {!c.ativo && <Badge variant="outline">Desativada</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{c.empresa}</TableCell>
                  <TableCell className="whitespace-nowrap">{c.acessoAte ? formatarData(c.acessoAte) : "Sem prazo"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {c.ultimoAcesso ? formatarDataHora(c.ultimoAcesso) : "Nunca"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
