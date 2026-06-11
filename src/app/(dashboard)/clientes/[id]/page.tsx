import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import { requirePermission } from "@/lib/session";
import {
  obterCliente,
  resumoFinanceiroCliente,
  type ContatoItem,
} from "@/modules/clientes/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Cliente" };

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("clientes", "ver");
  const { id } = await params;
  const cliente = await obterCliente(id);
  if (!cliente) notFound();

  const fin = await resumoFinanceiroCliente(id);
  const endereco = [
    cliente.logradouro,
    cliente.numero,
    cliente.bairro,
    cliente.cidade && `${cliente.cidade}/${cliente.uf ?? ""}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/clientes" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-2xl font-extrabold tracking-tight">{cliente.nome}</h2>
            <Badge variant="outline">{cliente.tipo}</Badge>
            {!cliente.ativo && <Badge variant="outline">Inativo</Badge>}
          </div>
          {cliente.nomeFantasia && (
            <p className="text-sm text-muted-foreground">{cliente.nomeFantasia}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dados cadastrais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {cliente.documento && (
              <p className="font-mono text-muted-foreground">{cliente.documento}</p>
            )}
            {cliente.email && (
              <p className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" /> {cliente.email}
              </p>
            )}
            {cliente.telefone && (
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" /> {cliente.telefone}
              </p>
            )}
            {endereco && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" /> {endereco}
              </p>
            )}
            {cliente.observacoes && (
              <p className="pt-2 text-muted-foreground">{cliente.observacoes}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financeiro</CardTitle>
            <CardDescription>Consolidado do cliente</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor total</span>
              <span className="font-mono">{brl(fin.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Já pago</span>
              <span className="font-mono text-success">{brl(fin.pago)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Em aberto</span>
              <span className="font-mono text-warning">{brl(fin.emAberto)}</span>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Integra com o Financeiro na Onda 2.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contatos</CardTitle>
        </CardHeader>
        <CardContent>
          {cliente.contatos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
          ) : (
            <ul className="divide-y text-sm">
              {cliente.contatos.map((c: ContatoItem) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="font-medium">{c.nome}</span>
                    {c.cargo && <span className="ml-2 text-muted-foreground">{c.cargo}</span>}
                    {c.principal && (
                      <Badge variant="outline" className="ml-2">
                        principal
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground">{c.email ?? c.telefone ?? ""}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projetos</CardTitle>
          <CardDescription>Projetos vinculados a este cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Disponível quando os Projetos entrarem (Onda 1b).</p>
        </CardContent>
      </Card>
    </div>
  );
}
