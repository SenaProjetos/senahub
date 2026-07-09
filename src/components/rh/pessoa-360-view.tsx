"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, FileText, Landmark, Building2, KeyRound, UserRound, ClipboardList, CalendarRange, Clock, Receipt } from "lucide-react";
import { brl, formatarData } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { carregarPontoPessoa } from "@/modules/rh/pessoas/actions";
import { EscalaGrade } from "@/components/rh/escala-grade";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { FichaPessoa, CadastroPessoa, SolicitacoesUsuario, PontoMes, NotasUsuario } from "@/modules/rh/pessoas/queries";

type DiaGrade = {
  diaSemana: number; ativo: boolean; entrada: string | null; saida: string | null;
  descansos: { inicio: string; fim: string }[]; horasDia: number; toleranciaMin: number;
};
type BancoRow = { ano: number; mes: number; saldoMinutos: number; acumuladoMinutos: number };

export type Pessoa360Props = {
  pessoa: FichaPessoa;
  podeFolha: boolean;
  cadastro: CadastroPessoa | null;
  ausencias: SolicitacoesUsuario | null;
  escala: { temOverride: boolean; dias: DiaGrade[]; roleDias: DiaGrade[] } | null;
  banco: BancoRow[] | null;
  temPonto: boolean;
  nf: NotasUsuario | null;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  aprovado: { label: "Aprovado", cls: "text-success" },
  aprovada: { label: "Aprovada", cls: "text-success" },
  pendente: { label: "Pendente", cls: "text-warning" },
  enviada: { label: "Enviada", cls: "text-warning" },
  rejeitado: { label: "Rejeitado", cls: "text-destructive" },
  rejeitada: { label: "Rejeitada", cls: "text-destructive" },
};

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function minutosParaHoras(min: number) {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`;
}
function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "text-muted-foreground" };
  return <span className={`text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{valor ?? <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{titulo}</h4>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>
    </div>
  );
}

export function Pessoa360View({ pessoa, podeFolha, cadastro, ausencias, escala, banco, temPonto, nf }: Pessoa360Props) {
  const abas: { value: string; label: string; icon: React.ElementType; show: boolean }[] = [
    { value: "cadastro", label: "Cadastro", icon: UserRound, show: !!cadastro },
    { value: "ponto", label: "Ponto", icon: Clock, show: temPonto },
    { value: "ausencias", label: "Ausências", icon: CalendarRange, show: !!ausencias },
    { value: "escala", label: "Escala", icon: CalendarClock, show: !!escala },
    { value: "banco", label: "Banco de horas", icon: ClipboardList, show: !!banco },
    { value: "pj", label: "Vínculo PJ", icon: Building2, show: !!pessoa.pj },
    { value: "nf", label: "Notas fiscais", icon: Receipt, show: !!nf },
    { value: "folha", label: "Folha", icon: Landmark, show: podeFolha },
    { value: "cliente", label: "Cliente", icon: Building2, show: !!pessoa.cliente },
    { value: "acesso", label: "Acesso", icon: KeyRound, show: true },
  ].filter((a) => a.show);
  const primeira = abas[0]?.value ?? "acesso";

  // Aba Ponto: carga sob demanda (só quando aberta) — evita rodar `espelhoMes` em todo load da ficha.
  const [aba, setAba] = useState(primeira);
  const [ponto, setPonto] = useState<PontoMes | null>(null);
  const [pontoEstado, setPontoEstado] = useState<"idle" | "carregando" | "pronto" | "erro">("idle");

  useEffect(() => {
    if (aba !== "ponto" || !temPonto || pontoEstado !== "idle") return;
    setPontoEstado("carregando");
    carregarPontoPessoa({ id: pessoa.id }).then((res) => {
      if (res.ok) {
        setPonto(res.data);
        setPontoEstado("pronto");
      } else {
        setPontoEstado("erro");
      }
    });
  }, [aba, temPonto, pontoEstado, pessoa.id]);

  return (
    <div className="space-y-5">
      {/* Cabeçalho / resumo */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 pt-6">
          <div className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/10 text-lg font-bold text-primary">
            {iniciais(pessoa.name)}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">{pessoa.name}</h2>
              <Badge variant="outline">{ROLE_LABELS[pessoa.role as Role]}</Badge>
              {pessoa.socioAtivo && <Badge variant="secondary">Sócio</Badge>}
              {pessoa.ativo ? (
                <span className="text-xs text-success">Ativo</span>
              ) : (
                <span className="text-xs text-muted-foreground">Inativo</span>
              )}
              {pessoa.mustChangePassword && <span className="text-xs text-warning">troca de senha pendente</span>}
              {pessoa.incompleto && <Badge variant="outline" className="border-warning text-warning">cadastro incompleto</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{pessoa.email}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-xs text-muted-foreground">
              {pessoa.nomeCompleto && pessoa.nomeCompleto !== pessoa.name && (
                <span>Nome completo: {pessoa.nomeCompleto}</span>
              )}
              {pessoa.dataAdmissao && <span>Admissão: {formatarData(pessoa.dataAdmissao)}</span>}
              {pessoa.cargo && <span>{pessoa.cargo}{pessoa.departamento ? ` · ${pessoa.departamento}` : ""}</span>}
              <span>{pessoa.projetosCount} projeto(s)</span>
              {podeFolha && pessoa.salarioBase != null && <span>Salário base: {brl(pessoa.salarioBase)}</span>}
              {pessoa.pj && <span>PJ: {pessoa.pj.razaoSocial}</span>}
              {pessoa.cliente && <span>Cliente: {pessoa.cliente.nome}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={aba} onValueChange={(v) => setAba(v as string)}>
        <TabsList className="h-auto flex-wrap">
          {abas.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>
              <a.icon /> {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Cadastro */}
        {cadastro && (
          <TabsContent value="cadastro">
            <Card><CardContent className="space-y-5 pt-6">
              <Secao titulo="Dados pessoais">
                <Campo label="CPF" valor={cadastro.cpf} />
                <Campo label="RG" valor={cadastro.rg} />
                <Campo label="Nascimento" valor={cadastro.dataNascimento ? formatarData(cadastro.dataNascimento) : null} />
                <Campo label="Sexo" valor={cadastro.sexo} />
                <Campo label="Estado civil" valor={cadastro.estadoCivil} />
                <Campo label="Nacionalidade" valor={cadastro.nacionalidade} />
              </Secao>
              <Secao titulo="Endereço e contato">
                <Campo label="Logradouro" valor={cadastro.enderecoLogradouro} />
                <Campo label="Número" valor={cadastro.enderecoNumero} />
                <Campo label="Complemento" valor={cadastro.enderecoComplemento} />
                <Campo label="Bairro" valor={cadastro.enderecoBairro} />
                <Campo label="Cidade/UF" valor={cadastro.enderecoCidade ? `${cadastro.enderecoCidade}${cadastro.enderecoUf ? "/" + cadastro.enderecoUf : ""}` : null} />
                <Campo label="CEP" valor={cadastro.enderecoCep} />
                <Campo label="Telefone" valor={cadastro.telefone} />
                <Campo label="E-mail pessoal" valor={cadastro.emailPessoal} />
                <Campo label="Emergência" valor={cadastro.contatoEmergenciaNome ? `${cadastro.contatoEmergenciaNome}${cadastro.telefoneEmergencia ? " · " + cadastro.telefoneEmergencia : ""}` : null} />
              </Secao>
              {podeFolha && (
                <Secao titulo="Dados bancários">
                  <Campo label="Banco" valor={cadastro.banco} />
                  <Campo label="Agência" valor={cadastro.agencia} />
                  <Campo label="Conta" valor={cadastro.conta} />
                  <Campo label="Tipo" valor={cadastro.tipoContaBancaria} />
                </Secao>
              )}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Dependentes ({cadastro.dependentes.length})</h4>
                {cadastro.dependentes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dependente.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {cadastro.dependentes.map((d) => (
                      <li key={d.id} className="flex justify-between py-1.5">
                        <span>{d.nome} <span className="text-muted-foreground">· {d.parentesco ?? "—"}</span></span>
                        <span className="text-muted-foreground">{d.nascimento ? formatarData(d.nascimento) : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Documentos ({cadastro.documentos.length})</h4>
                {cadastro.documentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {cadastro.documentos.map((d) => (
                      <li key={d.id} className="flex justify-between py-1.5">
                        <span><FileText className="mr-1 inline size-3.5 text-muted-foreground" />{d.nome} <span className="text-muted-foreground">· {d.tipo}</span></span>
                        <span className="text-muted-foreground">{formatarData(d.criadoEm)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Ponto — carregado sob demanda */}
        {temPonto && (
          <TabsContent value="ponto">
            <Card><CardContent className="space-y-4 pt-6">
              {pontoEstado === "carregando" && (
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
                  ))}
                </div>
              )}
              {pontoEstado === "erro" && (
                <p className="text-sm text-destructive">Não foi possível carregar o ponto. Recarregue a página.</p>
              )}
              {pontoEstado === "pronto" && ponto && (
                <>
                  <p className="text-sm text-muted-foreground">Mês {String(ponto.mes).padStart(2, "0")}/{ponto.ano}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Trabalhado</div>
                      <div className="text-lg font-semibold tabular-nums">{minutosParaHoras(ponto.totalMinutos)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Esperado (até hoje)</div>
                      <div className="text-lg font-semibold tabular-nums">{minutosParaHoras(ponto.esperadoMinutos)}</div>
                    </div>
                    <div className="rounded-lg border p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Saldo</div>
                      <div className={`text-lg font-semibold tabular-nums ${ponto.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>{minutosParaHoras(ponto.saldoMinutos)}</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ponto.dias.length === 0 ? "Sem batidas neste mês." : `${ponto.dias.length} dia(s) com registro.`}
                  </p>
                </>
              )}
              <Link href="/ponto/espelho" className="text-sm text-primary hover:underline">Abrir espelho de ponto completo →</Link>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Ausências */}
        {ausencias && (
          <TabsContent value="ausencias">
            <Card><CardContent className="space-y-5 pt-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Férias ({ausencias.ferias.length})</h4>
                {ausencias.ferias.length === 0 ? (
                  <EmptyState title="Sem solicitações de férias" description="Esta pessoa não possui férias registradas." />
                ) : (
                  <ul className="divide-y text-sm">
                    {ausencias.ferias.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                        <span>{formatarData(f.inicio)} — {formatarData(f.fim)}{f.observacao ? <span className="text-muted-foreground"> · {f.observacao}</span> : null}</span>
                        <StatusBadge status={f.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Abonos de falta ({ausencias.abonos.length})</h4>
                {ausencias.abonos.length === 0 ? (
                  <EmptyState title="Sem abonos" description="Esta pessoa não possui abonos de falta registrados." />
                ) : (
                  <ul className="divide-y text-sm">
                    {ausencias.abonos.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <span>
                          {formatarData(a.dataInicio)}{a.dataFim !== a.dataInicio ? ` — ${formatarData(a.dataFim)}` : ""}
                          {a.motivo ? <span className="text-muted-foreground"> · {a.motivo}</span> : null}
                          {a.atestadoNome ? <span className="text-muted-foreground"> · 📎 {a.atestadoNome}</span> : null}
                        </span>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Escala */}
        {escala && (
          <TabsContent value="escala">
            <Card><CardContent className="pt-6">
              <EscalaGrade temOverride={escala.temOverride} dias={escala.dias} roleDias={escala.roleDias} />
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Banco de horas */}
        {banco && (
          <TabsContent value="banco">
            <Card><CardContent className="pt-6">
              {banco.length === 0 ? (
                <EmptyState title="Sem fechamentos" description="Nenhum fechamento de banco de horas registrado." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Mês</th>
                        <th className="py-2 pr-3 font-medium">Saldo do mês</th>
                        <th className="py-2 font-medium">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {banco.map((b) => (
                        <tr key={`${b.ano}-${b.mes}`} className="border-b">
                          <td className="py-2 pr-3">{String(b.mes).padStart(2, "0")}/{b.ano}</td>
                          <td className={`py-2 pr-3 ${b.saldoMinutos < 0 ? "text-destructive" : "text-success"}`}>{minutosParaHoras(b.saldoMinutos)}</td>
                          <td className={`py-2 ${b.acumuladoMinutos < 0 ? "text-destructive" : ""}`}>{minutosParaHoras(b.acumuladoMinutos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Vínculo PJ */}
        {pessoa.pj && (
          <TabsContent value="pj">
            <Card><CardContent className="space-y-4 pt-6">
              <Secao titulo="Pessoa jurídica vinculada">
                <Campo label="Razão social" valor={pessoa.pj.razaoSocial} />
                <Campo label="CNPJ" valor={pessoa.pj.cnpj} />
              </Secao>
              <Link href="/rh/pessoas-juridicas" className="text-sm text-primary hover:underline">Gerir Pessoas Jurídicas →</Link>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Notas fiscais */}
        {nf && (
          <TabsContent value="nf">
            <Card><CardContent className="pt-6">
              {nf.length === 0 ? (
                <EmptyState title="Sem notas fiscais" description="Esta pessoa não enviou notas fiscais." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Número</th>
                        <th className="py-2 pr-3 font-medium">Valor</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Enviada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nf.map((n) => (
                        <tr key={n.id} className="border-b">
                          <td className="py-2 pr-3">{n.numero ?? "—"}{n.arquivoNome ? <span className="text-muted-foreground"> · 📎</span> : null}</td>
                          <td className="py-2 pr-3">{brl(n.valor)}</td>
                          <td className="py-2 pr-3"><StatusBadge status={n.status} /></td>
                          <td className="py-2 text-muted-foreground">{formatarData(n.criadoEm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Link href="/rh/admin" className="mt-3 inline-block text-sm text-primary hover:underline">Gerir notas em RH — admin →</Link>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Folha */}
        {podeFolha && (
          <TabsContent value="folha">
            <Card><CardContent className="space-y-4 pt-6">
              <Secao titulo="Remuneração">
                <Campo label="Salário base" valor={pessoa.salarioBase != null ? brl(pessoa.salarioBase) : null} />
                <Campo label="Admissão" valor={pessoa.dataAdmissao ? formatarData(pessoa.dataAdmissao) : null} />
              </Secao>
              <Link href="/rh/folha" className="text-sm text-primary hover:underline">Ver holerites em Folha CLT →</Link>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Cliente */}
        {pessoa.cliente && (
          <TabsContent value="cliente">
            <Card><CardContent className="space-y-4 pt-6">
              <Secao titulo="Cliente representado (portal)">
                <Campo label="Nome" valor={pessoa.cliente.nome} />
                <Campo label="Tipo" valor={pessoa.cliente.tipo} />
                <Campo label="Documento" valor={pessoa.cliente.documento} />
              </Secao>
              <Link href={`/clientes/${pessoa.cliente.id}`} className="text-sm text-primary hover:underline">Abrir ficha do cliente →</Link>
            </CardContent></Card>
          </TabsContent>
        )}

        {/* Acesso */}
        <TabsContent value="acesso">
          <Card><CardContent className="space-y-4 pt-6">
            <Secao titulo="Acesso ao sistema">
              <Campo label="Perfil" valor={ROLE_LABELS[pessoa.role as Role]} />
              <Campo label="Situação" valor={pessoa.ativo ? "Ativo" : "Inativo"} />
              <Campo label="Troca de senha" valor={pessoa.mustChangePassword ? "Pendente" : "—"} />
              <Campo label="Criado em" valor={formatarData(pessoa.criadoEm)} />
            </Secao>
            <Link href="/configuracoes/usuarios" className="text-sm text-primary hover:underline">Gerir acesso em Usuários →</Link>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
