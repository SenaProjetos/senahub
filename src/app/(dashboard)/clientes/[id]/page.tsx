import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Users, Building2, History } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  obterCliente,
  resumoFinanceiroCliente,
  historicoCliente,
  type ContatoItem,
} from "@/modules/clientes/queries";
import { projetosDoCliente } from "@/modules/projetos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { ContatoDialog } from "@/components/clientes/contato-dialog";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl, formatarData } from "@/lib/utils";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clientes", "ver");
  const podeGerir = await can(user.role, "clientes", "gerir");
  const { id } = await params;
  const cliente = await obterCliente(id);
  if (!cliente) notFound();

  const [fin, projetos, historico, modelosDoc] = await Promise.all([
    resumoFinanceiroCliente(id),
    projetosDoCliente(id),
    historicoCliente(id),
    modelosPorFonte("cliente"),
  ]);
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-2xl font-extrabold tracking-tight">{cliente.nome}</h2>
            <Badge variant="outline">{cliente.tipo}</Badge>
            {cliente.categoria && <Badge variant="secondary">{cliente.categoria}</Badge>}
            {!cliente.ativo && <Badge variant="outline">Inativo</Badge>}
          </div>
          {cliente.nomeFantasia && (
            <p className="text-sm text-muted-foreground">{cliente.nomeFantasia}</p>
          )}
        </div>
        <GerarDocumentoButton modelos={modelosDoc} paramId="clienteId" valor={id} />
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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Contatos</CardTitle>
          {podeGerir && <ContatoDialog clienteId={cliente.id} />}
        </CardHeader>
        <CardContent>
          {cliente.contatos.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum contato cadastrado." />
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
          {projetos.length === 0 ? (
            <EmptyState icon={Building2} title="Nenhum projeto vinculado." />
          ) : (
            <ul className="divide-y text-sm">
              {projetos.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2">
                  <Link href={`/projetos/${p.id}`} className="flex items-center gap-3 hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatarCodigo(p.codigo)}
                    </span>
                    <span className="font-medium">{p.nome}</span>
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{p._count.disciplinas} disc.</span>
                    <Badge variant="outline">{SITUACAO_PROJETO_LABEL[p.situacao]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
          <CardDescription>Linha do tempo de eventos do cliente</CardDescription>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <EmptyState icon={History} title="Nenhum evento registrado." />
          ) : (
            <ul className="space-y-3 text-sm">
              {historico.map((ev) => (
                <li key={ev.id} className="flex gap-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                    {formatarData(ev.data)}
                  </span>
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span>{ev.descricao}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
