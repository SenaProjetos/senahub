import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin, Users, Building2, FileText, Download } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  obterCliente,
  resumoFinanceiroCliente,
  type ContatoItem,
} from "@/modules/clientes/queries";
import { documentosDoCliente } from "@/modules/documentos-cliente/queries";
import { projetosDoCliente } from "@/modules/projetos/queries";
import { empresa360 } from "@/modules/comercial/empresa-360/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL } from "@/modules/projetos/status";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { ContatoDialog } from "@/components/clientes/contato-dialog";
import { Empresa360View } from "@/components/comercial/empresa-360-view";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { brl } from "@/lib/utils";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("clientes", "ver");
  const podeGerir = await can(user, "clientes", "gerir");
  /**
   * F3.7 — a Empresa 360 é dado COMERCIAL numa página gateada por `clientes:ver`. Hoje nenhum
   * perfil tem um sem o outro (conferido no banco), mas a matriz de permissão é dado editável
   * pela tela: separar o gate custa uma chamada e evita que uma edição futura vaze funil de
   * vendas para quem só devia ver o cadastro.
   */
  const podeVerComercial = await can(user, "comercial", "ver");
  const { id } = await params;
  const cliente = await obterCliente(id);
  if (!cliente) notFound();

  const [fin, projetos, modelosDoc, gruposDoc, dados360] = await Promise.all([
    resumoFinanceiroCliente(id),
    projetosDoCliente(id),
    modelosPorFonte("cliente"),
    documentosDoCliente(id),
    // `historicoCliente` MORREU aqui: a timeline da Empresa 360 (`Atividade`, F3.1/F3.2) é a
    // versão real do mesmo card — narrativa gravada pelo fluxo, e não uma remontagem em memória
    // de createdAt de projeto/proposta/lançamento a cada leitura. A função continua exportada
    // por enquanto; some quando nenhuma tela chamar.
    podeVerComercial ? empresa360(id) : Promise.resolve(null),
  ]);
  const totalDocs = gruposDoc.reduce((s, g) => s + g.documentos.length, 0);
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
          <CardTitle className="text-base">Documentos ({totalDocs})</CardTitle>
          <CardDescription>Material do cliente (proposta e projetos) — segue o cliente.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalDocs === 0 ? (
            <EmptyState icon={FileText} title="Nenhum documento." description="Anexos de proposta e material recebido do cliente aparecem aqui." />
          ) : (
            <div className="space-y-4">
              {gruposDoc.map((g) => (
                <div key={g.chave}>
                  <div className="mb-1.5">
                    <p className="text-sm font-semibold">{g.titulo}</p>
                    {g.subtitulo && <p className="text-xs text-muted-foreground">{g.subtitulo}</p>}
                  </div>
                  <ul className="divide-y rounded-sm border text-sm">
                    {g.documentos.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">{d.nome}</span>
                          {d.canal !== "interno" && <Badge variant="outline" className="shrink-0 capitalize">{d.canal}</Badge>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {d.atual ? `${(d.atual.tamanho / 1024).toFixed(0)} KB` : "—"}
                          </span>
                          {d.atual && (
                            <Button size="icon" variant="ghost" aria-label={`Baixar ${d.nome}`} render={<a href={d.atual.downloadUrl} />}>
                              <Download className="size-3.5" />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* F3.7 — substitui o card "Histórico" que remontava eventos em memória a cada leitura. */}
      {dados360 && <Empresa360View dados={dados360} podeGerir={podeGerir} />}
    </div>
  );
}
