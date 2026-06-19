"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import {
  Plus,
  Upload,
  Download,
  Trash2,
  Import,
  Receipt,
  Pencil,
  Check,
  CalendarClock,
} from "lucide-react";
import {
  editarLicitacao,
  registrarMedicao,
  importarLicitacao,
  excluirLicitacao,
} from "@/modules/licitacoes/actions";
import {
  registrarEventoLicitacao,
  salvarValorDisciplinaLicitacao,
  removerValorDisciplinaLicitacao,
} from "@/modules/licitacoes/extras/actions";
import { salvarComposicaoLicitacao } from "@/modules/licitacoes/composicao/actions";
import { salvarResultado } from "@/modules/licitacoes/sancoes/actions";
import { salvarDadosPNCP, marcarPublicadoPNCP } from "@/modules/licitacoes/pncp/actions";
import { salvarViabilidade, decidirViabilidade } from "@/modules/licitacoes/viabilidade/actions";
import { totalComposicao, subtotalItem } from "@/modules/licitacoes/composicao/composicao";
import {
  salvarContratoLicitacao,
  adicionarAditivoContrato,
  removerAditivoContrato,
} from "@/modules/licitacoes/contrato/actions";
import {
  salvarResponsavelTecnico,
  vincularResponsavelTecnico,
  desvincularResponsavelTecnico,
  salvarSubcontratacaoMax,
  adicionarSubcontratacao,
  removerSubcontratacao,
} from "@/modules/licitacoes/tecnico/actions";
import { salvarMatrizRisco } from "@/modules/licitacoes/contrato/matriz-actions";
import { semearHabilitacao, salvarHabilitacao } from "@/modules/licitacoes/habilitacao/actions";
import { itemAtendido } from "@/modules/licitacoes/habilitacao/habilitacao";
import {
  registrarReajuste,
  aplicarReajuste,
  removerReajuste,
} from "@/modules/licitacoes/contrato/reajuste-actions";
import {
  saldoContratual,
  somaDeltas,
  somaAcrescimos,
  acrescimoAcumuladoPct,
  limiteExcedido,
  proximoDoLimite,
} from "@/modules/licitacoes/contrato/saldo";
import {
  criarEventoLicitacao,
  concluirEventoLicitacao,
  excluirEventoLicitacao,
} from "@/modules/licitacoes/eventos/actions";
import {
  TIPO_EVENTO_LICITACAO,
  TIPO_EVENTO_LABEL,
  ehRecurso,
  type TipoEventoLicitacao,
} from "@/modules/licitacoes/eventos/eventos";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { LicitacaoListItem } from "@/modules/licitacoes/queries";
import { STATUS_LABEL, STATUS_CHIP, brl } from "./_shared";

type Lic = LicitacaoListItem;

export function LicitacaoDetailView({
  lic,
  clientes,
  modalidades,
  podeGerir,
  modelosHabilitacao,
  certidoes,
  responsaveisTecnicos,
  fornecedores,
  sancoesPropriasAtivas,
}: {
  lic: Lic;
  clientes: { id: string; nome: string }[];
  modalidades: string[];
  podeGerir: boolean;
  modelosHabilitacao: { id: string; nome: string }[];
  certidoes: { id: string; nome: string; validade: string }[];
  responsaveisTecnicos: { id: string; nome: string; registro: string; conselho: string | null }[];
  fornecedores: { id: string; nome: string }[];
  sancoesPropriasAtivas: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [docTitulo, setDocTitulo] = useState("");
  const [medValor, setMedValor] = useState("");
  const [medData, setMedData] = useState(new Date().toISOString().slice(0, 10));
  const [clienteImport, setClienteImport] = useState("");

  // Edição completa
  const [dialogEdit, setDialogEdit] = useState(false);
  const [eTitulo, setETitulo] = useState("");
  const [eOrgao, setEOrgao] = useState("");
  const [eModalidade, setEModalidade] = useState("");
  const [eNumeroEdital, setENumeroEdital] = useState("");
  const [ePrazo, setEPrazo] = useState("");
  const [eValor, setEValor] = useState("");
  const [eObs, setEObs] = useState("");

  function abrirEdicao() {
    setETitulo(lic.titulo);
    setEOrgao(lic.orgao ?? "");
    setEModalidade(lic.modalidade && modalidades.includes(lic.modalidade) ? lic.modalidade : "");
    setENumeroEdital(lic.numeroEdital ?? "");
    setEPrazo(lic.prazoProposta);
    setEValor(lic.valorEstimado != null ? String(lic.valorEstimado) : "");
    setEObs(lic.observacoes);
    setDialogEdit(true);
  }

  function salvarEdicao() {
    if (!eTitulo.trim()) {
      toast.error("Informe o título.");
      return;
    }
    const valorNum = eValor.trim() === "" ? undefined : Number(eValor);
    if (valorNum != null && (Number.isNaN(valorNum) || valorNum < 0)) {
      toast.error("Valor estimado inválido.");
      return;
    }
    start(async () => {
      const r = await editarLicitacao({
        id: lic.id,
        titulo: eTitulo,
        orgao: eOrgao,
        modalidade: eModalidade,
        numeroEdital: eNumeroEdital,
        prazoProposta: ePrazo,
        valorEstimado: valorNum,
        observacoes: eObs,
        status: lic.status as never,
      });
      if (r.ok) {
        toast.success("Licitação atualizada.");
        setDialogEdit(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const diasPrazo = lic.prazoProposta
    ? differenceInCalendarDays(new Date(lic.prazoProposta + "T00:00:00"), new Date())
    : null;

  function mudarStatus(status: string | null) {
    if (!status) return;
    start(async () => {
      const r = await editarLicitacao({
        id: lic.id,
        titulo: lic.titulo,
        orgao: lic.orgao ?? "",
        modalidade: lic.modalidade ?? "",
        numeroEdital: lic.numeroEdital ?? "",
        prazoProposta: lic.prazoProposta,
        valorEstimado: lic.valorEstimado ?? undefined,
        observacoes: lic.observacoes,
        status: status as never,
      });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function uploadDoc(file: File | null) {
    if (!file) return;
    if (!docTitulo.trim()) {
      toast.error("Informe o título do documento antes de enviar.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("titulo", docTitulo);
    const res = await fetch(`/api/licitacoes/${lic.id}/doc`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Documento v${data.numero} enviado.`);
      setDocTitulo("");
      router.refresh();
    } else toast.error(data.error ?? "Falha no upload.");
    if (uploadRef.current) uploadRef.current.value = "";
  }

  function medir() {
    start(async () => {
      const r = await registrarMedicao({
        licitacaoId: lic.id,
        descricao: "",
        valor: Number(medValor),
        data: medData,
      });
      if (r.ok) {
        toast.success(`Medição ${r.data.numero} registrada — receita criada no financeiro.`);
        if (r.data.aviso) toast.warning(r.data.aviso);
        setMedValor("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function importar() {
    if (!clienteImport) {
      toast.error("Selecione o cliente (órgão contratante).");
      return;
    }
    start(async () => {
      const r = await importarLicitacao({ id: lic.id, clienteId: clienteImport });
      if (r.ok) {
        toast.success(`Projeto ${r.data.codigo} criado — documentação enviada ao Jurídico.`);
        router.push(`/projetos/${r.data.projetoId}`);
      } else toast.error(r.error);
    });
  }

  function excluir() {
    start(async () => {
      const r = await excluirLicitacao({ id: lic.id });
      if (r.ok) {
        toast.success("Licitação excluída.");
        router.push("/licitacoes");
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{lic.titulo}</span>
          <Badge variant="outline" className={STATUS_CHIP[lic.status]}>
            {STATUS_LABEL[lic.status]}
          </Badge>
          {lic.orgao && <span className="text-xs text-muted-foreground">{lic.orgao}</span>}
          {lic.modalidade && (
            <Badge variant="outline" className="text-muted-foreground">{lic.modalidade}</Badge>
          )}
          {lic.numeroEdital && (
            <span className="font-mono text-xs text-muted-foreground">Edital {lic.numeroEdital}</span>
          )}
          {diasPrazo != null && lic.status === "em_andamento" && (
            <Badge
              variant="outline"
              className={diasPrazo < 0 ? "text-destructive border-destructive/40" : diasPrazo <= 7 ? "text-warning border-warning/40" : ""}
            >
              prazo {diasPrazo < 0 ? "vencido" : `${diasPrazo}d`}
            </Badge>
          )}
          {lic.valorEstimado != null && (
            <span className="font-mono text-xs text-muted-foreground">{brl(lic.valorEstimado)}</span>
          )}
          {lic.projeto && (
            <Link href={`/projetos/${lic.projeto.id}`} className="font-mono text-xs text-primary hover:underline">
              {formatarCodigo(lic.projeto.codigo)}
            </Link>
          )}
          {podeGerir && (
            <div className="ml-auto flex items-center gap-1.5">
              <Button size="icon" variant="ghost" aria-label="Editar" onClick={abrirEdicao}>
                <Pencil className="size-4" />
              </Button>
              <Select value={lic.status} items={STATUS_LABEL} onValueChange={mudarStatus}>
                <SelectTrigger className="h-8 w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!lic.projeto && (
                <Button size="icon" variant="ghost" aria-label="Excluir" onClick={excluir}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Documentos */}
        <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Documentos ({lic.docs.length})
            </span>
            {podeGerir && (
              <>
                <Input
                  className="h-7 w-44 text-xs"
                  placeholder="Título (Edital, Proposta…)"
                  value={docTitulo}
                  onChange={(e) => setDocTitulo(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-7" onClick={() => uploadRef.current?.click()}>
                  <Upload className="size-3" /> Enviar
                </Button>
                <input
                  ref={uploadRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => uploadDoc(e.target.files?.[0] ?? null)}
                />
              </>
            )}
          </div>
          {lic.docs.map((d) => (
            <p key={d.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{d.titulo}</span>
              {d.versoes.map((v) => (
                <a
                  key={v.id}
                  href={`/api/licitacoes/versoes/${v.id}/download`}
                  className="flex items-center gap-0.5 text-primary hover:underline"
                >
                  v{v.numero} <Download className="size-3" />
                </a>
              ))}
            </p>
          ))}
        </div>

        {/* Medições (após importada) */}
        {(lic.status === "em_execucao" || lic.status === "concluida" || lic.medicoes.length > 0) && (
          <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                <Receipt className="mr-1 inline size-3" />
                Medições ({lic.medicoes.length})
              </span>
              {podeGerir && lic.status === "em_execucao" && (
                <>
                  <Input
                    type="number"
                    className="h-7 w-28 text-xs"
                    placeholder="Valor"
                    value={medValor}
                    onChange={(e) => setMedValor(e.target.value)}
                  />
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={medData}
                    onChange={(e) => setMedData(e.target.value)}
                  />
                  {lic.projeto ? (
                    <Button size="sm" variant="outline" className="h-7" onClick={medir} disabled={pending || !medValor}>
                      <Plus className="size-3" /> Medir
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="inline-flex">
                            <Button size="sm" variant="outline" className="h-7 pointer-events-none" disabled>
                              <Plus className="size-3" /> Medir
                            </Button>
                          </span>
                        }
                      />
                      <TooltipContent>
                        Importe a licitação ganha para vincular um projeto antes de registrar medições.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
            {lic.medicoes.map((m) => (
              <p key={m.id} className="text-xs text-muted-foreground">
                Medição {m.numero} · {new Date(m.data + "T00:00:00").toLocaleDateString("pt-BR")} ·{" "}
                <span className="font-mono">{brl(m.valor)}</span> → receita no financeiro
              </p>
            ))}
          </div>
        )}

        {/* Importar ganha */}
        {podeGerir && lic.status === "ganha" && !lic.projeto && (
          <div className="flex flex-wrap items-center gap-2 rounded-sm border border-success/40 bg-success/5 p-2.5">
            <span className="text-xs font-semibold text-success">Ganha — importar para projeto:</span>
            <Select value={clienteImport} onValueChange={(v) => setClienteImport(v ?? "")}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue placeholder="Cliente (órgão)…" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={importar} disabled={pending}>
              <Import className="size-3.5" /> Importar → projeto
            </Button>
          </div>
        )}

        <LicViabilidade lic={lic} podeGerir={podeGerir} sancoesPropriasAtivas={sancoesPropriasAtivas} />
        <LicEventos lic={lic} podeGerir={podeGerir} />
        <LicComposicao lic={lic} podeGerir={podeGerir} />
        <LicContrato lic={lic} podeGerir={podeGerir} />
        <LicMatrizRisco lic={lic} podeGerir={podeGerir} />
        <LicReajuste lic={lic} podeGerir={podeGerir} />
        <div className="rounded-sm border border-dashed p-2.5">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Habilitação</p>
          <LicHabilitacao lic={lic} podeGerir={podeGerir} modelos={modelosHabilitacao} certidoes={certidoes} />
        </div>
        <LicResponsaveis lic={lic} podeGerir={podeGerir} rtsDisponiveis={responsaveisTecnicos} />
        <LicSubcontratacao lic={lic} podeGerir={podeGerir} fornecedores={fornecedores} />
        <LicResultado lic={lic} podeGerir={podeGerir} />
        <LicPNCP lic={lic} podeGerir={podeGerir} />
        <LicExtras lic={lic} podeGerir={podeGerir} />
      </CardContent>

      <Dialog open={dialogEdit} onOpenChange={setDialogEdit}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar licitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={eTitulo} onChange={(e) => setETitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Órgão</Label>
                <Input value={eOrgao} onChange={(e) => setEOrgao(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <Select
                  value={eModalidade || "__none__"}
                  onValueChange={(v) => setEModalidade(v === "__none__" ? "" : (v ?? ""))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Modalidade…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {modalidades.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nº do edital</Label>
                <Input value={eNumeroEdital} onChange={(e) => setENumeroEdital(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo da proposta</Label>
                <Input type="date" value={ePrazo} onChange={(e) => setEPrazo(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Valor estimado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={eValor}
                onChange={(e) => setEValor(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={eObs} onChange={(e) => setEObs(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={pending || !eTitulo.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LicViabilidade({
  lic,
  podeGerir,
  sancoesPropriasAtivas,
}: {
  lic: Lic;
  podeGerir: boolean;
  sancoesPropriasAtivas: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const v = lic.viabilidade;

  // Edit state — initialised from server data or defaults
  const [modo, setModo] = useState<string>(v?.modo ?? "fixo");
  const [margem, setMargem] = useState(v?.margemEsperadaPct != null ? String(v.margemEsperadaPct) : "");
  const [equipe, setEquipe] = useState<boolean>(v?.equipeDisponivel ?? false);
  const [concorrencia, setConcorrencia] = useState(v?.concorrenciaPrevista ?? "");

  type LinhaCriterio = { criterio: string; atendido: boolean; observacao: string };
  const [criterios, setCriterios] = useState<LinhaCriterio[]>(
    v?.criterios.map((c) => ({ criterio: c.criterio, atendido: c.atendido, observacao: c.observacao ?? "" })) ?? [],
  );

  const [justificativa, setJustificativa] = useState("");

  const decisaoAtual = v?.decisao ?? "pendente";

  function salvar() {
    const criteriosLimpos = criterios
      .filter((c) => c.criterio.trim().length > 0)
      .map((c) => ({ criterio: c.criterio, atendido: c.atendido, observacao: c.observacao }));
    start(async () => {
      const r = await salvarViabilidade({
        licitacaoId: lic.id,
        modo: modo as "fixo" | "configuravel",
        margemEsperadaPct: margem.trim() === "" ? undefined : Number(margem),
        equipeDisponivel: equipe,
        concorrenciaPrevista: concorrencia,
        criterios: modo === "configuravel" ? criteriosLimpos : undefined,
      });
      if (r.ok) {
        toast.success("Viabilidade salva.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function decidir(decisao: "go" | "no_go" | "pendente") {
    start(async () => {
      const r = await decidirViabilidade({ licitacaoId: lic.id, decisao, justificativa });
      if (r.ok) {
        toast.success(
          decisao === "go" ? "GO registrado." : decisao === "no_go" ? "NO-GO registrado." : "Decisão revertida a pendente.",
        );
        setJustificativa("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const DECISAO_CHIP: Record<string, string> = {
    pendente: "text-muted-foreground",
    go: "text-success border-success/40",
    no_go: "text-destructive border-destructive/40",
  };
  const DECISAO_LABEL: Record<string, string> = { pendente: "Pendente", go: "GO", no_go: "NO-GO" };

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">Viabilidade (go/no-go)</p>

      {/* Sanction warning */}
      {sancoesPropriasAtivas > 0 && (
        <p className="text-xs text-warning">
          ⚠ Empresa tem {sancoesPropriasAtivas} sanção(ões) ativa(s) — considere no go/no-go.
        </p>
      )}

      {/* Current decision badge */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`${DECISAO_CHIP[decisaoAtual] ?? ""}`}>
          {DECISAO_LABEL[decisaoAtual] ?? decisaoAtual}
        </Badge>
        {v?.decididoPorNome && (
          <span className="text-xs text-muted-foreground">
            por {v.decididoPorNome}
            {v.decididoEm ? ` em ${new Date(v.decididoEm).toLocaleString("pt-BR")}` : ""}
          </span>
        )}
        {v?.justificativa && (
          <span className="text-xs italic text-muted-foreground">{v.justificativa}</span>
        )}
      </div>

      {/* Read-only view */}
      {!podeGerir && (
        <>
          {v?.modo === "fixo" && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {v.margemEsperadaPct != null && <span>Margem esperada: <span className="font-mono">{v.margemEsperadaPct}%</span></span>}
              {v.equipeDisponivel != null && <span>Equipe disponível: {v.equipeDisponivel ? "Sim" : "Não"}</span>}
              {v.concorrenciaPrevista && <span>Concorrência: {v.concorrenciaPrevista}</span>}
            </div>
          )}
          {v?.modo === "configuravel" && v.criterios.length > 0 && (
            <ul className="space-y-0.5">
              {v.criterios.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge
                    variant="outline"
                    className={c.atendido ? "text-[10px] py-0 text-success border-success/40" : "text-[10px] py-0 text-destructive border-destructive/40"}
                  >
                    {c.atendido ? "ok" : "pendente"}
                  </Badge>
                  <span className="font-medium text-foreground">{c.criterio}</span>
                  {c.observacao && <span className="italic">{c.observacao}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Edit + decide */}
      {podeGerir && (
        <>
          {/* Modo select */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value={modo} onValueChange={(v) => { if (v) setModo(v); }}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Fixo</SelectItem>
                <SelectItem value="configuravel">Configurável</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Fixo fields */}
          {modo === "fixo" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Input
                type="number"
                step="0.01"
                className="h-7 w-28 text-xs"
                placeholder="Margem esperada %"
                value={margem}
                onChange={(e) => setMargem(e.target.value)}
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={equipe as boolean}
                  onCheckedChange={(v) => setEquipe(v as boolean)}
                />
                Equipe disponível
              </label>
              <Input
                className="h-7 flex-1 text-xs"
                placeholder="Concorrência prevista"
                value={concorrencia}
                onChange={(e) => setConcorrencia(e.target.value)}
              />
            </div>
          )}

          {/* Configuravel criteria */}
          {modo === "configuravel" && (
            <div className="space-y-1">
              {criterios.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-1.5">
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Critério"
                    value={c.criterio}
                    onChange={(e) => {
                      const next = [...criterios];
                      next[i] = { ...next[i], criterio: e.target.value };
                      setCriterios(next);
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Checkbox
                      checked={c.atendido as boolean}
                      onCheckedChange={(v) => {
                        const next = [...criterios];
                        next[i] = { ...next[i], atendido: v as boolean };
                        setCriterios(next);
                      }}
                    />
                    Atendido
                  </label>
                  <Input
                    className="h-7 w-36 text-xs"
                    placeholder="Observação"
                    value={c.observacao}
                    onChange={(e) => {
                      const next = [...criterios];
                      next[i] = { ...next[i], observacao: e.target.value };
                      setCriterios(next);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Remover critério"
                    disabled={pending}
                    onClick={() => setCriterios(criterios.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setCriterios([...criterios, { criterio: "", atendido: false, observacao: "" }])}
              >
                <Plus className="size-3" /> Critério
              </Button>
            </div>
          )}

          <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
            Salvar viabilidade
          </Button>

          {/* Decisão */}
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-1.5">
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="Justificativa"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-7 text-success border-success/40" onClick={() => decidir("go")} disabled={pending}>
              GO
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-destructive border-destructive/40" onClick={() => decidir("no_go")} disabled={pending}>
              NO-GO
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => decidir("pendente")} disabled={pending}>
              Reverter p/ pendente
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LicResponsaveis({
  lic,
  podeGerir,
  rtsDisponiveis,
}: {
  lic: Lic;
  podeGerir: boolean;
  rtsDisponiveis: { id: string; nome: string; registro: string; conselho: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Vincular
  const [rtId, setRtId] = useState(rtsDisponiveis[0]?.id ?? "");
  const [docTipo, setDocTipo] = useState<"ART" | "RRT" | "CAT">("ART");
  const [numDoc, setNumDoc] = useState("");

  // Cadastrar RT inline
  const [novoNome, setNovoNome] = useState("");
  const [novoRegistro, setNovoRegistro] = useState("");
  const [novoConselho, setNovoConselho] = useState("");

  function vincular() {
    if (!rtId) { toast.error("Selecione um RT."); return; }
    start(async () => {
      const r = await vincularResponsavelTecnico({ licitacaoId: lic.id, responsavelId: rtId, documentoTipo: docTipo, numeroDocumento: numDoc });
      if (r.ok) {
        toast.success("RT vinculado.");
        if (r.data.aviso) toast.warning(r.data.aviso);
        setNumDoc("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function desvincular(id: string) {
    start(async () => {
      const r = await desvincularResponsavelTecnico({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function cadastrarRT() {
    if (!novoNome.trim() || !novoRegistro.trim()) { toast.error("Informe nome e registro."); return; }
    start(async () => {
      const r = await salvarResponsavelTecnico({ nome: novoNome, registro: novoRegistro, conselho: novoConselho });
      if (r.ok) {
        toast.success("RT cadastrado.");
        setNovoNome("");
        setNovoRegistro("");
        setNovoConselho("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">Responsável técnico</p>

      {lic.responsaveisTecnicos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum RT vinculado.</p>
      ) : (
        <ul className="space-y-0.5">
          {lic.responsaveisTecnicos.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-medium text-foreground">{r.nome}</span>
              <span className="text-muted-foreground">{r.registro}{r.conselho ? ` · ${r.conselho}` : ""}</span>
              <Badge variant="outline" className="text-[10px] py-0">{r.documentoTipo}</Badge>
              {r.numeroDocumento && <span className="font-mono text-muted-foreground">{r.numeroDocumento}</span>}
              {podeGerir && (
                <button type="button" aria-label="Desvincular RT" disabled={pending} onClick={() => desvincular(r.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeGerir && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {rtsDisponiveis.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">Cadastre um RT abaixo.</span>
            ) : (
              <Select value={rtId || rtsDisponiveis[0]?.id} onValueChange={(v) => { if (v) setRtId(v); }}>
                <SelectTrigger className="h-7 w-52 text-xs">
                  <SelectValue placeholder="Selecionar RT…" />
                </SelectTrigger>
                <SelectContent>
                  {rtsDisponiveis.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.nome} — {rt.registro}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={docTipo} onValueChange={(v) => { if (v) setDocTipo(v as "ART" | "RRT" | "CAT"); }}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ART">ART</SelectItem>
                <SelectItem value="RRT">RRT</SelectItem>
                <SelectItem value="CAT">CAT</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-7 w-32 text-xs" placeholder="Nº documento" value={numDoc} onChange={(e) => setNumDoc(e.target.value)} />
            <Button size="sm" variant="outline" className="h-7" onClick={vincular} disabled={pending || rtsDisponiveis.length === 0}>
              Vincular
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input className="h-7 w-36 text-xs" placeholder="Nome do RT" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            <Input className="h-7 w-28 text-xs" placeholder="Registro" value={novoRegistro} onChange={(e) => setNovoRegistro(e.target.value)} />
            <Input className="h-7 w-24 text-xs" placeholder="Conselho (opt.)" value={novoConselho} onChange={(e) => setNovoConselho(e.target.value)} />
            <Button size="sm" variant="outline" className="h-7" onClick={cadastrarRT} disabled={pending || !novoNome.trim() || !novoRegistro.trim()}>
              <Plus className="size-3" /> Cadastrar RT
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LicSubcontratacao({
  lic,
  podeGerir,
  fornecedores,
}: {
  lic: Lic;
  podeGerir: boolean;
  fornecedores: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [tetoInput, setTetoInput] = useState(lic.subcontratacaoMaxPct != null ? String(lic.subcontratacaoMaxPct) : "");
  const [fornId, setFornId] = useState("__none__");
  const [nomeLivre, setNomeLivre] = useState("");
  const [objeto, setObjeto] = useState("");
  const [percentual, setPercentual] = useState("");

  const soma = lic.subcontratacoes.reduce((s, x) => s + x.percentual, 0);
  const teto = lic.subcontratacaoMaxPct;
  const sobrepassou = teto != null && soma > teto;

  function salvarTeto() {
    start(async () => {
      const r = await salvarSubcontratacaoMax({ licitacaoId: lic.id, subcontratacaoMaxPct: tetoInput.trim() === "" ? undefined : Number(tetoInput) });
      if (r.ok) { toast.success("Teto salvo."); router.refresh(); } else toast.error(r.error);
    });
  }

  function adicionar() {
    const pct = Number(percentual);
    if (!objeto.trim()) { toast.error("Informe o objeto."); return; }
    if (!Number.isFinite(pct) || pct <= 0) { toast.error("Percentual inválido."); return; }
    start(async () => {
      const r = await adicionarSubcontratacao({
        licitacaoId: lic.id,
        fornecedorId: fornId === "__none__" ? "" : fornId,
        nomeLivre: fornId === "__none__" ? nomeLivre : "",
        objeto,
        percentual: pct,
      });
      if (r.ok) {
        toast.success("Subcontratação adicionada.");
        setFornId("__none__");
        setNomeLivre("");
        setObjeto("");
        setPercentual("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await removerSubcontratacao({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">Subcontratação</p>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">
          Teto: {teto != null ? `${teto}%` : "não definido"}
        </span>
        <span className={`flex items-center gap-1 ${sobrepassou ? "text-destructive" : "text-muted-foreground"}`}>
          Alocado: {soma}%
          {sobrepassou && (
            <Badge variant="destructive" className="text-[10px] py-0">acima do teto</Badge>
          )}
        </span>
      </div>

      {podeGerir && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Input type="number" step="0.01" min="0" className="h-7 w-24 text-xs" placeholder="Teto %" value={tetoInput} onChange={(e) => setTetoInput(e.target.value)} />
          <Button size="sm" variant="outline" className="h-7" onClick={salvarTeto} disabled={pending}>
            Salvar teto
          </Button>
        </div>
      )}

      {lic.subcontratacoes.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma subcontratação.</p>
      ) : (
        <ul className="space-y-0.5">
          {lic.subcontratacoes.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{s.fornecedorNome ?? s.nomeLivre}</span>
              <span className="italic">{s.objeto}</span>
              <span className="font-mono">{s.percentual}%</span>
              {podeGerir && (
                <button type="button" aria-label="Remover subcontratação" disabled={pending} onClick={() => remover(s.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeGerir && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={fornId} onValueChange={(v) => { if (v) setFornId(v); }}>
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue placeholder="Fornecedor…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem fornecedor (nome livre)</SelectItem>
              {fornecedores.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fornId === "__none__" && (
            <Input className="h-7 w-36 text-xs" placeholder="Nome do subcontratado" value={nomeLivre} onChange={(e) => setNomeLivre(e.target.value)} />
          )}
          <Input className="h-7 flex-1 text-xs min-w-32" placeholder="Objeto" value={objeto} onChange={(e) => setObjeto(e.target.value)} />
          <Input type="number" step="0.01" min="0" className="h-7 w-20 text-xs" placeholder="%" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
          <Button size="sm" variant="outline" className="h-7" onClick={adicionar} disabled={pending || !objeto.trim() || !percentual}>
            <Plus className="size-3" /> Subcontratado
          </Button>
        </div>
      )}
    </div>
  );
}

function LicHabilitacao({
  lic,
  podeGerir,
  modelos,
  certidoes,
}: {
  lic: Lic;
  podeGerir: boolean;
  modelos: { id: string; nome: string }[];
  certidoes: { id: string; nome: string; validade: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const sessao = lic.eventos.find((e) => e.tipo === "sessao");
  const refISO = sessao?.data ?? new Date().toISOString().slice(0, 10);

  type LinhaHab = { exigencia: string; certidaoId: string; atendido: boolean; obrigatorio: boolean; observacao: string };
  const [itens, setItens] = useState<LinhaHab[]>(
    lic.habilitacao.map((h) => ({
      exigencia: h.exigencia,
      certidaoId: h.certidaoId ?? "",
      atendido: h.atendido,
      obrigatorio: h.obrigatorio,
      observacao: h.observacao ?? "",
    })),
  );
  const [modeloId, setModeloId] = useState<string>(modelos[0]?.id ?? "");

  const atendidos = lic.habilitacao.filter((h) =>
    itemAtendido({ atendido: h.atendido, certidaoValidadeISO: h.certidaoValidade }, refISO),
  ).length;
  const total = lic.habilitacao.length;
  const obrigatoriosPendentes = lic.habilitacao.filter(
    (h) => h.obrigatorio && !itemAtendido({ atendido: h.atendido, certidaoValidadeISO: h.certidaoValidade }, refISO),
  ).length;

  function semear() {
    if (!modeloId) return;
    start(async () => {
      const r = await semearHabilitacao({ licitacaoId: lic.id, modeloId });
      if (r.ok) {
        toast.success("Checklist semeado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvar() {
    const limpos = itens
      .map((l) => ({
        exigencia: l.exigencia.trim(),
        certidaoId: l.certidaoId,
        atendido: l.atendido,
        obrigatorio: l.obrigatorio,
        observacao: l.observacao,
      }))
      .filter((l) => l.exigencia.length > 0);
    start(async () => {
      const r = await salvarHabilitacao({ licitacaoId: lic.id, itens: limpos });
      if (r.ok) {
        toast.success("Checklist salvo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Somente leitura
  if (!podeGerir) {
    if (lic.habilitacao.length === 0) {
      return <p className="text-xs text-muted-foreground">Sem checklist.</p>;
    }
    return (
      <ul className="space-y-0.5">
        {lic.habilitacao.map((h) => {
          const ok = itemAtendido({ atendido: h.atendido, certidaoValidadeISO: h.certidaoValidade }, refISO);
          return (
            <li key={h.id} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className={h.obrigatorio && !ok ? "font-medium text-destructive" : "text-foreground"}>
                {h.exigencia}
              </span>
              {h.certidaoNome && (
                <span className="text-muted-foreground">
                  {h.certidaoNome}
                  {h.certidaoValidade && ` · val. ${new Date(h.certidaoValidade + "T00:00:00").toLocaleDateString("pt-BR")}`}
                </span>
              )}
              <Badge
                variant="outline"
                className={ok ? "text-[10px] py-0 text-success border-success/40" : "text-[10px] py-0 text-destructive border-destructive/40"}
              >
                {ok ? "ok" : "pendente"}
              </Badge>
            </li>
          );
        })}
      </ul>
    );
  }

  // Editor
  return (
    <div className="space-y-1.5">
      {/* Resumo */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{atendidos}/{total} atendidos</span>
          {obrigatoriosPendentes > 0 && (
            <Badge variant="outline" className="text-[10px] py-0 text-destructive border-destructive/40">
              {obrigatoriosPendentes} obrigatório(s) pendente(s)
            </Badge>
          )}
        </div>
      )}

      {/* Semear */}
      {modelos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={modeloId || modelos[0]?.id}
            onValueChange={(v) => { if (v) setModeloId(v); }}
          >
            <SelectTrigger className="h-7 w-52 text-xs">
              <SelectValue placeholder="Modelo…" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-7" onClick={semear} disabled={pending || !modeloId}>
            Semear
          </Button>
        </div>
      )}

      {/* Linhas do checklist */}
      {itens.length > 0 && (
        <ul className="space-y-1">
          {itens.map((l, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5">
              <Input
                className="h-7 flex-1 text-xs"
                placeholder="Exigência"
                value={l.exigencia}
                onChange={(e) => {
                  const next = [...itens];
                  next[i] = { ...next[i], exigencia: e.target.value };
                  setItens(next);
                }}
              />
              <Select
                value={l.certidaoId || "__none__"}
                onValueChange={(v) => {
                  const next = [...itens];
                  next[i] = { ...next[i], certidaoId: v === "__none__" ? "" : (v ?? "") };
                  setItens(next);
                }}
              >
                <SelectTrigger className="h-7 w-52 text-xs">
                  <SelectValue placeholder="Certidão…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {certidoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} · {new Date(c.validade + "T00:00:00").toLocaleDateString("pt-BR")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={l.atendido as boolean}
                  onCheckedChange={(v) => {
                    const next = [...itens];
                    next[i] = { ...next[i], atendido: v as boolean };
                    setItens(next);
                  }}
                />
                Atendido
              </label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={l.obrigatorio as boolean}
                  onCheckedChange={(v) => {
                    const next = [...itens];
                    next[i] = { ...next[i], obrigatorio: v as boolean };
                    setItens(next);
                  }}
                />
                Obrigatório
              </label>
              <Input
                className="h-7 w-32 text-xs"
                placeholder="Observação"
                value={l.observacao}
                onChange={(e) => {
                  const next = [...itens];
                  next[i] = { ...next[i], observacao: e.target.value };
                  setItens(next);
                }}
              />
              <button
                type="button"
                aria-label="Remover item"
                disabled={pending}
                onClick={() => setItens(itens.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ações */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => setItens([...itens, { exigencia: "", certidaoId: "", atendido: false, obrigatorio: true, observacao: "" }])}
        >
          <Plus className="size-3" /> Item
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
          Salvar checklist
        </Button>
      </div>
    </div>
  );
}

function LicMatrizRisco({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  type LinhaRisco = { evento: string; probabilidade: string; impacto: string; alocacao: string; mitigacao: string };
  const [itens, setItens] = useState<LinhaRisco[]>(
    lic.contrato?.riscos.map((r) => ({ evento: r.evento, probabilidade: r.probabilidade, impacto: r.impacto, alocacao: r.alocacao, mitigacao: r.mitigacao ?? "" })) ?? [],
  );

  function salvar() {
    const limpos = itens.map((l) => ({ evento: l.evento.trim(), probabilidade: l.probabilidade, impacto: l.impacto, alocacao: l.alocacao, mitigacao: l.mitigacao })).filter((l) => l.evento.length > 0);
    start(async () => {
      const r = await salvarMatrizRisco({ licitacaoId: lic.id, itens: limpos as never });
      if (r.ok) { toast.success("Matriz de risco salva."); router.refresh(); } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <span className="text-xs font-semibold text-muted-foreground">Matriz de risco</span>

      {!lic.contrato ? (
        <p className="text-xs text-muted-foreground">Cadastre o contrato para registrar a matriz de risco.</p>
      ) : !podeGerir ? (
        lic.contrato.riscos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem riscos registrados.</p>
        ) : (
          <ul className="space-y-0.5">
            {lic.contrato.riscos.map((r) => (
              <li key={r.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.evento}</span>
                {" — "}prob. {r.probabilidade} / impacto {r.impacto}, alocação: {r.alocacao}
                {r.mitigacao && <span className="italic"> · {r.mitigacao}</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {itens.length > 0 && (
            <ul className="space-y-1">
              {itens.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Evento"
                    value={l.evento}
                    onChange={(e) => { const next = [...itens]; next[i] = { ...next[i], evento: e.target.value }; setItens(next); }}
                  />
                  <Select value={l.probabilidade} onValueChange={(v) => { if (!v) return; const next = [...itens]; next[i] = { ...next[i], probabilidade: v }; setItens(next); }}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={l.impacto} onValueChange={(v) => { if (!v) return; const next = [...itens]; next[i] = { ...next[i], impacto: v }; setItens(next); }}>
                    <SelectTrigger className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixo">Baixo</SelectItem>
                      <SelectItem value="medio">Médio</SelectItem>
                      <SelectItem value="alto">Alto</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={l.alocacao} onValueChange={(v) => { if (!v) return; const next = [...itens]; next[i] = { ...next[i], alocacao: v }; setItens(next); }}>
                    <SelectTrigger className="h-7 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contratante">Contratante</SelectItem>
                      <SelectItem value="contratado">Contratado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-7 w-40 text-xs"
                    placeholder="Mitigação"
                    value={l.mitigacao}
                    onChange={(e) => { const next = [...itens]; next[i] = { ...next[i], mitigacao: e.target.value }; setItens(next); }}
                  />
                  <button
                    type="button"
                    aria-label="Remover risco"
                    disabled={pending}
                    onClick={() => setItens(itens.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setItens([...itens, { evento: "", probabilidade: "media", impacto: "medio", alocacao: "contratado", mitigacao: "" }])}
            >
              <Plus className="size-3" /> Risco
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
              Salvar matriz
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LicReajuste({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [indice, setIndice] = useState("");
  const [percentual, setPercentual] = useState("");
  const [dataBase, setDataBase] = useState("");
  const [aniversario, setAniversario] = useState(new Date().toISOString().slice(0, 10));

  function add() {
    if (!indice.trim()) { toast.error("Informe o índice."); return; }
    const pct = Number(percentual);
    if (!Number.isFinite(pct)) { toast.error("Percentual inválido."); return; }
    if (!aniversario) { toast.error("Informe o aniversário."); return; }
    start(async () => {
      const r = await registrarReajuste({ licitacaoId: lic.id, indice, percentual: pct, dataBase, aniversario });
      if (r.ok) {
        toast.success("Reajuste registrado e aplicado.");
        setIndice("");
        setPercentual("");
        setDataBase("");
        setAniversario(new Date().toISOString().slice(0, 10));
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aplicar(id: string) {
    start(async () => {
      const r = await aplicarReajuste({ id });
      if (r.ok) { toast.success("Reajuste aplicado."); router.refresh(); } else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await removerReajuste({ id });
      if (r.ok) router.refresh(); else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <span className="text-xs font-semibold text-muted-foreground">Reajustes</span>

      {!lic.contrato ? (
        <p className="text-xs text-muted-foreground">Cadastre o contrato para registrar reajustes.</p>
      ) : (
        <>
          {lic.contrato.reajustes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem reajustes registrados.</p>
          ) : (
            <ul className="space-y-1">
              {lic.contrato.reajustes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.indice}</span>
                  <span className="font-mono">{r.percentual > 0 ? "+" : ""}{r.percentual}%</span>
                  <span>{brl(r.valorAnterior)} → {brl(r.valorReajustado)}</span>
                  <span>{new Date(r.aniversario + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                  {r.aplicado ? (
                    <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                      aplicado{r.aplicadoEm ? ` em ${new Date(r.aplicadoEm).toLocaleDateString("pt-BR")}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] py-0 text-warning border-warning/40">
                      pendente
                    </Badge>
                  )}
                  {podeGerir && !r.aplicado && (
                    <>
                      <button
                        type="button"
                        aria-label="Aplicar reajuste"
                        disabled={pending}
                        onClick={() => aplicar(r.id)}
                        className="text-muted-foreground hover:text-success"
                      >
                        <Check className="size-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remover reajuste"
                        disabled={pending}
                        onClick={() => remover(r.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {podeGerir && (
            <>
              <p className="text-[10px] text-muted-foreground italic">
                Registrar aqui aplica o reajuste imediatamente (atualiza o valor do contrato). Reajustes pendentes vêm do modo automático.
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Input className="h-7 w-28 text-xs" placeholder="Índice (ex.: INPC)" value={indice} onChange={(e) => setIndice(e.target.value)} />
                <Input type="number" step="0.01" className="h-7 w-24 text-xs" placeholder="Percentual" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
                <Input type="date" className="h-7 w-36 text-xs" value={dataBase} onChange={(e) => setDataBase(e.target.value)} />
                <Input type="date" className="h-7 w-36 text-xs" value={aniversario} onChange={(e) => setAniversario(e.target.value)} />
                <Button size="sm" variant="outline" className="h-7" onClick={add} disabled={pending || !indice.trim() || !aniversario}>
                  <Plus className="size-3" /> Reajuste
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LicContrato({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const c = lic.contrato;

  const medido = lic.medicoes.reduce((s, m) => s + m.valor, 0);
  const deltas = c ? somaDeltas(c.aditivos.map((a) => ({ valorDelta: a.valorDelta }))) : 0;
  const saldo = c ? saldoContratual(c.valorHomologado, deltas, medido) : 0;
  const acresc = c ? somaAcrescimos(c.aditivos.map((a) => ({ valorDelta: a.valorDelta }))) : 0;
  const pct = c ? acrescimoAcumuladoPct(c.valorHomologadoBase ?? c.valorHomologado, acresc) : 0;
  const limite = c?.limiteAcrescimoPct ?? null;

  // Form contrato state
  const [numeroContrato, setNumeroContrato] = useState(c?.numeroContrato ?? "");
  const [numeroEmpenho, setNumeroEmpenho] = useState(c?.numeroEmpenho ?? "");
  const [valorHomologado, setValorHomologado] = useState(c ? String(c.valorHomologado) : "");
  const [vigenciaInicio, setVigenciaInicio] = useState(c?.vigenciaInicio ?? "");
  const [vigenciaFim, setVigenciaFim] = useState(c?.vigenciaFim ?? "");
  const [reajuste, setReajuste] = useState(c?.reajuste ?? "");
  const [garantiaTipo, setGarantiaTipo] = useState(c?.garantiaTipo ?? "");
  const [garantiaValor, setGarantiaValor] = useState(c?.garantiaValor != null ? String(c.garantiaValor) : "");
  const [garantiaValidade, setGarantiaValidade] = useState(c?.garantiaValidade ?? "");
  const [limiteAcrescimoPct, setLimiteAcrescimoPct] = useState(c?.limiteAcrescimoPct != null ? String(c.limiteAcrescimoPct) : "");

  // Form aditivo state
  const [aditTipo, setAditTipo] = useState("valor");
  const [aditValor, setAditValor] = useState("");
  const [aditVigencia, setAditVigencia] = useState("");
  const [aditJustif, setAditJustif] = useState("");
  const [aditData, setAditData] = useState(new Date().toISOString().slice(0, 10));

  function salvarContrato() {
    const vh = Number(valorHomologado);
    if (!Number.isFinite(vh) || vh < 0) { toast.error("Valor homologado inválido."); return; }
    start(async () => {
      const r = await salvarContratoLicitacao({
        licitacaoId: lic.id,
        numeroContrato, numeroEmpenho,
        valorHomologado: vh,
        vigenciaInicio, vigenciaFim, reajuste, garantiaTipo,
        garantiaValor: garantiaValor.trim() === "" ? undefined : Number(garantiaValor),
        garantiaValidade,
        limiteAcrescimoPct: limiteAcrescimoPct.trim() === "" ? undefined : Number(limiteAcrescimoPct),
      });
      if (r.ok) { toast.success("Contrato salvo."); router.refresh(); } else toast.error(r.error);
    });
  }

  function addAditivo() {
    start(async () => {
      const r = await adicionarAditivoContrato({
        licitacaoId: lic.id,
        tipo: aditTipo as "valor" | "prazo" | "valor_prazo" | "objeto",
        valorDelta: aditValor.trim() === "" ? undefined : Number(aditValor),
        novaVigencia: aditVigencia,
        justificativa: aditJustif,
        data: aditData,
      });
      if (r.ok) {
        toast.success("Aditivo adicionado.");
        setAditValor("");
        setAditVigencia("");
        setAditJustif("");
        setAditData(new Date().toISOString().slice(0, 10));
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function removerAditivo(id: string) {
    start(async () => {
      const r = await removerAditivoContrato({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  const TIPO_ADITIVO_LABEL: Record<string, string> = {
    valor: "Valor",
    prazo: "Prazo",
    valor_prazo: "Valor + Prazo",
    objeto: "Objeto",
  };

  const formContrato = (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input className="h-7 w-36 text-xs" placeholder="Nº contrato" value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} />
        <Input className="h-7 w-36 text-xs" placeholder="Nº empenho" value={numeroEmpenho} onChange={(e) => setNumeroEmpenho(e.target.value)} />
        <Input type="number" step="0.01" min="0" className="h-7 w-36 text-xs" placeholder="Valor homologado *" value={valorHomologado} onChange={(e) => setValorHomologado(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input type="date" className="h-7 w-36 text-xs" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
        <Input type="date" className="h-7 w-36 text-xs" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
        <Input className="h-7 w-28 text-xs" placeholder="Reajuste" value={reajuste} onChange={(e) => setReajuste(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input className="h-7 w-28 text-xs" placeholder="Garantia tipo" value={garantiaTipo} onChange={(e) => setGarantiaTipo(e.target.value)} />
        <Input type="number" step="0.01" min="0" className="h-7 w-28 text-xs" placeholder="Garantia valor" value={garantiaValor} onChange={(e) => setGarantiaValor(e.target.value)} />
        <Input type="date" className="h-7 w-36 text-xs" value={garantiaValidade} onChange={(e) => setGarantiaValidade(e.target.value)} />
        <Input type="number" step="0.01" min="0" className="h-7 w-32 text-xs" placeholder="Limite acréscimo %" value={limiteAcrescimoPct} onChange={(e) => setLimiteAcrescimoPct(e.target.value)} />
      </div>
      <Button size="sm" variant="outline" className="h-7" onClick={salvarContrato} disabled={pending}>
        Salvar contrato
      </Button>
    </div>
  );

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <span className="text-xs font-semibold text-muted-foreground">Contrato &amp; aditivos</span>

      {c ? (
        <>
          {/* Saldo */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              Homologado: <span className="font-mono font-semibold">{brl(c.valorHomologado)}</span>
            </span>
            <span className="text-muted-foreground">
              Medido: <span className="font-mono">{brl(medido)}</span>
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              Saldo:{" "}
              {saldo < 0 ? (
                <Badge variant="destructive" className="font-mono text-[10px]">{brl(saldo)}</Badge>
              ) : (
                <span className="font-mono font-semibold">{brl(saldo)}</span>
              )}
            </span>
            {c.valorHomologado > 0 && (
              <span className="text-muted-foreground flex items-center gap-1">
                Acréscimo: <span className="font-mono">{pct}%</span>
                {limite != null && (
                  <>
                    {" / limite "}
                    {limiteExcedido(pct, limite) ? (
                      <Badge variant="destructive" className="text-[10px] py-0">{limite}%</Badge>
                    ) : proximoDoLimite(pct, limite, 0.8) ? (
                      <Badge variant="outline" className="text-[10px] py-0 text-warning border-warning/40">{limite}%</Badge>
                    ) : (
                      <span>{limite}%</span>
                    )}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Detalhes do contrato */}
          {(c.numeroContrato || c.numeroEmpenho || c.vigenciaInicio || c.vigenciaFim) && (
            <p className="text-xs text-muted-foreground">
              {c.numeroContrato && <span>Contrato {c.numeroContrato} </span>}
              {c.numeroEmpenho && <span>· Empenho {c.numeroEmpenho} </span>}
              {c.vigenciaInicio && <span>· Vigência {new Date(c.vigenciaInicio + "T00:00:00").toLocaleDateString("pt-BR")}</span>}
              {c.vigenciaFim && <span> – {new Date(c.vigenciaFim + "T00:00:00").toLocaleDateString("pt-BR")}</span>}
            </p>
          )}

          {/* Form edição contrato */}
          {podeGerir && formContrato}

          {/* Aditivos */}
          {c.aditivos.length > 0 && (
            <ul className="space-y-0.5">
              {c.aditivos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{TIPO_ADITIVO_LABEL[a.tipo] ?? a.tipo}</span>
                  {a.valorDelta != null && <span className="font-mono">{brl(a.valorDelta)}</span>}
                  <span>{new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                  {a.justificativa && <span className="italic">{a.justificativa}</span>}
                  {podeGerir && (
                    <button type="button" aria-label="Remover aditivo" disabled={pending} onClick={() => removerAditivo(a.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Form adicionar aditivo */}
          {podeGerir && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={aditTipo} onValueChange={(v) => v && setAditTipo(v)}>
                <SelectTrigger className="h-7 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="valor">Valor</SelectItem>
                  <SelectItem value="prazo">Prazo</SelectItem>
                  <SelectItem value="valor_prazo">Valor + Prazo</SelectItem>
                  <SelectItem value="objeto">Objeto</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" step="0.01" className="h-7 w-28 text-xs" placeholder="Valor delta" value={aditValor} onChange={(e) => setAditValor(e.target.value)} />
              <Input type="date" className="h-7 w-36 text-xs" value={aditData} onChange={(e) => setAditData(e.target.value)} />
              <Input type="date" className="h-7 w-36 text-xs" value={aditVigencia} onChange={(e) => setAditVigencia(e.target.value)} />
              <Input className="h-7 w-40 text-xs" placeholder="Justificativa" value={aditJustif} onChange={(e) => setAditJustif(e.target.value)} />
              <Button size="sm" variant="outline" className="h-7" onClick={addAditivo} disabled={pending || !aditData}>
                <Plus className="size-3" /> Aditivo
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          {podeGerir ? formContrato : <p className="text-xs text-muted-foreground">Sem contrato.</p>}
        </>
      )}
    </div>
  );
}

function LicComposicao({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  type LinhaItem = { descricao: string; quantidade: string; valorUnitario: string };
  const [itens, setItens] = useState<LinhaItem[]>(
    lic.composicao?.itens.map((it) => ({ descricao: it.descricao, quantidade: String(it.quantidade), valorUnitario: String(it.valorUnitario) })) ?? [],
  );
  const [obs, setObs] = useState(lic.composicao?.observacao ?? "");

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const total = totalComposicao(itens.map((l) => ({ quantidade: num(l.quantidade), valorUnitario: num(l.valorUnitario) })));

  function salvar() {
    const limpos = itens
      .map((l) => ({ descricao: l.descricao.trim(), quantidade: num(l.quantidade), valorUnitario: num(l.valorUnitario) }))
      .filter((l) => l.descricao.length > 0);
    start(async () => {
      const r = await salvarComposicaoLicitacao({ licitacaoId: lic.id, observacao: obs, itens: limpos });
      if (r.ok) { toast.success("Composição salva."); router.refresh(); }
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Composição de preço
        </span>
        <span className="font-mono text-xs font-semibold">{brl(total)}</span>
      </div>

      {lic.valorEstimado != null && (
        <p className="text-xs text-muted-foreground">
          Estimado: <span className="font-mono">{brl(lic.valorEstimado)}</span>
          {" · "}
          <span className={total > lic.valorEstimado ? "text-destructive" : "text-success"}>
            {total > lic.valorEstimado ? "+" : ""}
            {brl(total - lic.valorEstimado)}
          </span>
        </p>
      )}

      {/* Somente leitura */}
      {!podeGerir && (
        <>
          {itens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem composição.</p>
          ) : (
            <ul className="space-y-0.5">
              {itens.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{l.descricao}</span>
                  <span>{num(l.quantidade)} × {brl(num(l.valorUnitario))}</span>
                  <span>=</span>
                  <span className="font-mono">{brl(subtotalItem({ quantidade: num(l.quantidade), valorUnitario: num(l.valorUnitario) }))}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Edição */}
      {podeGerir && (
        <>
          {itens.length > 0 && (
            <ul className="space-y-1">
              {itens.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="Descrição"
                    value={l.descricao}
                    onChange={(e) => {
                      const next = [...itens];
                      next[i] = { ...next[i], descricao: e.target.value };
                      setItens(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    className="h-7 w-20 text-xs"
                    placeholder="Qtd"
                    value={l.quantidade}
                    onChange={(e) => {
                      const next = [...itens];
                      next[i] = { ...next[i], quantidade: e.target.value };
                      setItens(next);
                    }}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-7 w-28 text-xs"
                    placeholder="Unit."
                    value={l.valorUnitario}
                    onChange={(e) => {
                      const next = [...itens];
                      next[i] = { ...next[i], valorUnitario: e.target.value };
                      setItens(next);
                    }}
                  />
                  <span className="font-mono text-xs text-muted-foreground w-24 text-right">
                    {brl(subtotalItem({ quantidade: num(l.quantidade), valorUnitario: num(l.valorUnitario) }))}
                  </span>
                  <button
                    type="button"
                    aria-label="Remover item"
                    disabled={pending}
                    onClick={() => setItens(itens.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="Observação"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setItens([...itens, { descricao: "", quantidade: "1", valorUnitario: "0" }])}
            >
              <Plus className="size-3" /> Item
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
              Salvar composição
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LicEventos({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState<string>(TIPO_EVENTO_LICITACAO[0]);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [autoria, setAutoria] = useState("propria");
  const [protocolo, setProtocolo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [alertaDias, setAlertaDias] = useState("");

  const tipoAtual = tipo as TipoEventoLicitacao;
  const mostraRecurso = ehRecurso(tipoAtual);

  const eventosOrdenados = [...lic.eventos].sort((a, b) => a.data.localeCompare(b.data));

  function addEvento() {
    start(async () => {
      const dias = alertaDias
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n >= 0);
      const r = await criarEventoLicitacao({
        licitacaoId: lic.id,
        tipo,
        data,
        alertaDias: dias,
        autoria: mostraRecurso ? autoria : undefined,
        protocolo: mostraRecurso ? protocolo : undefined,
        observacao,
      });
      if (r.ok) {
        toast.success("Evento adicionado.");
        setData(new Date().toISOString().slice(0, 10));
        setProtocolo("");
        setObservacao("");
        setAlertaDias("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function concluir(id: string, concluido: boolean) {
    start(async () => {
      const r = await concluirEventoLicitacao({ id, concluido });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function remover(id: string) {
    start(async () => {
      const r = await excluirEventoLicitacao({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <div className="flex items-center gap-1.5">
        <CalendarClock className="size-3 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground">
          Datas-chave &amp; recursos ({lic.eventos.length})
        </span>
      </div>

      {/* Lista de eventos */}
      {eventosOrdenados.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum evento registrado.</p>
      ) : (
        <ul className="space-y-1">
          {eventosOrdenados.map((e) => {
            const diasRestantes = !e.concluido
              ? differenceInCalendarDays(new Date(e.data + "T00:00:00"), new Date())
              : null;
            const label = TIPO_EVENTO_LABEL[e.tipo as TipoEventoLicitacao] ?? e.tipo;
            const dataBR = new Date(e.data + "T00:00:00").toLocaleDateString("pt-BR");
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={e.concluido ? "line-through text-muted-foreground" : "font-medium"}>
                  {label}
                </span>
                <span className="text-muted-foreground">{dataBR}</span>
                {ehRecurso(e.tipo as TipoEventoLicitacao) && e.autoria && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    {e.autoria === "propria" ? "própria" : "concorrente"}
                  </Badge>
                )}
                {e.protocolo && (
                  <span className="text-muted-foreground">prot. {e.protocolo}</span>
                )}
                {e.observacao && (
                  <span className="text-muted-foreground italic">{e.observacao}</span>
                )}
                {e.concluido ? (
                  <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                    concluído
                  </Badge>
                ) : diasRestantes != null && diasRestantes >= 0 ? (
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${diasRestantes <= 7 ? "text-warning border-warning/40" : ""}`}
                  >
                    em {diasRestantes}d
                  </Badge>
                ) : diasRestantes != null && diasRestantes < 0 ? (
                  <Badge variant="outline" className="text-[10px] py-0 text-destructive border-destructive/40">
                    vencido
                  </Badge>
                ) : null}
                {podeGerir && (
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={e.concluido ? "Reabrir" : "Concluir"}
                      disabled={pending}
                      onClick={() => concluir(e.id, !e.concluido)}
                      className="text-muted-foreground hover:text-success"
                    >
                      <Check className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remover"
                      disabled={pending}
                      onClick={() => remover(e.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Form de adicionar */}
      {podeGerir && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Select value={tipo} onValueChange={(v) => v && setTipo(v)}>
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPO_EVENTO_LICITACAO.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIPO_EVENTO_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-7 w-36 text-xs"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
          {mostraRecurso && (
            <>
              <Select value={autoria} onValueChange={(v) => v && setAutoria(v)}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="propria">Própria</SelectItem>
                  <SelectItem value="concorrente">Concorrente</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-7 w-32 text-xs"
                placeholder="Protocolo"
                value={protocolo}
                onChange={(e) => setProtocolo(e.target.value)}
              />
            </>
          )}
          <Input
            className="h-7 w-40 text-xs"
            placeholder="Observação"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
          <Input
            className="h-7 w-28 text-xs"
            placeholder="Alertas (ex.: 7, 1)"
            value={alertaDias}
            onChange={(e) => setAlertaDias(e.target.value)}
          />
          <Button size="sm" variant="outline" className="h-7" onClick={addEvento} disabled={pending || !data}>
            <Plus className="size-3" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function LicResultado({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const r = lic.resultado;
  const [vencedor, setVencedor] = useState(r?.vencedor ?? "");
  const [vv, setVv] = useState(r?.valorVencedor != null ? String(r.valorVencedor) : "");
  const [nc, setNc] = useState(r?.nossaClassificacao != null ? String(r.nossaClassificacao) : "");
  const [observacao, setObservacao] = useState(r?.observacao ?? "");

  function salvar() {
    start(async () => {
      const res = await salvarResultado({
        licitacaoId: lic.id,
        vencedor,
        valorVencedor: vv.trim() === "" ? undefined : Number(vv),
        nossaClassificacao: nc.trim() === "" ? undefined : Number(nc),
        observacao,
      });
      if (res.ok) {
        toast.success("Resultado salvo.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const temDados = r?.vencedor || r?.valorVencedor != null || r?.nossaClassificacao != null || r?.observacao;

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">Resultado / concorrência</p>

      {!podeGerir ? (
        temDados ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {r?.vencedor && (
              <span>Vencedor: <span className="font-medium text-foreground">{r.vencedor}</span></span>
            )}
            {r?.valorVencedor != null && (
              <span>Valor: <span className="font-mono">{brl(r.valorVencedor)}</span></span>
            )}
            {r?.nossaClassificacao != null && (
              <span>Nossa classif.: <span className="font-semibold">{r.nossaClassificacao}º</span></span>
            )}
            {r?.observacao && <span className="italic">{r.observacao}</span>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem resultado registrado.</p>
        )
      ) : (
        <>
          {temDados && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {r?.vencedor && (
                <span>Vencedor: <span className="font-medium text-foreground">{r.vencedor}</span></span>
              )}
              {r?.valorVencedor != null && (
                <span>Valor: <span className="font-mono">{brl(r.valorVencedor)}</span></span>
              )}
              {r?.nossaClassificacao != null && (
                <span>Nossa classif.: <span className="font-semibold">{r.nossaClassificacao}º</span></span>
              )}
              {r?.observacao && <span className="italic">{r.observacao}</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              className="h-7 w-44 text-xs"
              placeholder="Vencedor"
              value={vencedor}
              onChange={(e) => setVencedor(e.target.value)}
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              className="h-7 w-32 text-xs"
              placeholder="Valor vencedor (R$)"
              value={vv}
              onChange={(e) => setVv(e.target.value)}
            />
            <Input
              type="number"
              step="1"
              min="1"
              className="h-7 w-24 text-xs"
              placeholder="Classif. (1º…)"
              value={nc}
              onChange={(e) => setNc(e.target.value)}
            />
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="Observação"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
              Salvar resultado
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function LicPNCP({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [numeroControlePNCP, setNumeroControlePNCP] = useState(lic.numeroControlePNCP ?? "");
  const [pncpUrl, setPncpUrl] = useState(lic.pncpUrl ?? "");
  const [origemPNCP, setOrigemPNCP] = useState<boolean>(lic.origemPNCP ?? false);

  function salvar() {
    start(async () => {
      const r = await salvarDadosPNCP({ licitacaoId: lic.id, numeroControlePNCP, pncpUrl, origemPNCP });
      if (r.ok) {
        toast.success("Dados PNCP salvos.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarPublicacao() {
    const publicado = !lic.publicadoPNCPEm;
    start(async () => {
      const r = await marcarPublicadoPNCP({ licitacaoId: lic.id, publicado });
      if (r.ok) {
        toast.success(publicado ? "Publicado no PNCP." : "Publicação desmarcada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-1.5 rounded-sm border border-dashed p-2.5">
      <p className="text-xs font-semibold text-muted-foreground">PNCP</p>

      {/* Exibição de dados */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {lic.numeroControlePNCP && (
          <span>
            Nº controle: <span className="font-mono text-foreground">{lic.numeroControlePNCP}</span>
          </span>
        )}
        {lic.pncpUrl && (
          <a
            href={lic.pncpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Abrir no PNCP ↗
          </a>
        )}
        {lic.origemPNCP && (
          <Badge variant="outline" className="text-[10px] py-0">
            origem PNCP
          </Badge>
        )}
        {lic.publicadoPNCPEm ? (
          <span className="text-success">
            Publicado em {new Date(lic.publicadoPNCPEm).toLocaleDateString("pt-BR")}
          </span>
        ) : (
          <Badge variant="outline" className="text-[10px] py-0 text-warning border-warning/40">
            Não publicado no PNCP
          </Badge>
        )}
      </div>

      {/* Edição */}
      {podeGerir && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              className="h-7 w-52 text-xs"
              placeholder="Nº controle PNCP"
              value={numeroControlePNCP}
              onChange={(e) => setNumeroControlePNCP(e.target.value)}
            />
            <Input
              className="h-7 flex-1 text-xs"
              placeholder="URL PNCP"
              value={pncpUrl}
              onChange={(e) => setPncpUrl(e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Checkbox
                checked={origemPNCP as boolean}
                onCheckedChange={(v) => setOrigemPNCP(v as boolean)}
              />
              Origem PNCP
            </label>
            <Button size="sm" variant="outline" className="h-7" onClick={salvar} disabled={pending}>
              Salvar PNCP
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className={`h-7 ${lic.publicadoPNCPEm ? "text-destructive border-destructive/40" : "text-success border-success/40"}`}
              onClick={alternarPublicacao}
              disabled={pending}
            >
              {lic.publicadoPNCPEm ? "Desmarcar publicação" : "Marcar publicado no PNCP"}
            </Button>
            <span className="text-[10px] italic text-muted-foreground">
              Confirme a obrigatoriedade/forma de publicação no PNCP conforme a legislação vigente.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function LicExtras({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [evento, setEvento] = useState("");
  const [disc, setDisc] = useState("");
  const [valor, setValor] = useState("");
  const brlf = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const totalDisc = lic.valoresDisciplina.reduce((s, v) => s + v.valor, 0);

  function addEvento() {
    if (!evento.trim()) return;
    start(async () => {
      const r = await registrarEventoLicitacao({ licitacaoId: lic.id, descricao: evento });
      if (r.ok) {
        setEvento("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function addValor() {
    if (!disc.trim() || !valor) return;
    start(async () => {
      const r = await salvarValorDisciplinaLicitacao({ licitacaoId: lic.id, disciplina: disc, valor: Number(valor) });
      if (r.ok) {
        setDisc("");
        setValor("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function rmValor(id: string) {
    start(async () => {
      const r = await removerValorDisciplinaLicitacao({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Histórico</p>
        {lic.historico.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem eventos.</p>
        ) : (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {lic.historico.map((h) => (
              <li key={h.id}><span className="font-mono">{new Date(h.data).toLocaleDateString("pt-BR")}</span> · {h.descricao}</li>
            ))}
          </ul>
        )}
        {podeGerir && (
          <div className="mt-1.5 flex gap-1.5">
            <Input value={evento} onChange={(e) => setEvento(e.target.value)} placeholder="Registrar evento…" className="h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={addEvento} disabled={pending}>+</Button>
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Valores por disciplina {totalDisc > 0 ? `· ${brlf(totalDisc)}` : ""}
        </p>
        {lic.valoresDisciplina.length > 0 && (
          <ul className="space-y-0.5 text-xs">
            {lic.valoresDisciplina.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2">
                <span>{v.disciplina}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-mono">{brlf(v.valor)}</span>
                  {podeGerir && (
                    <button onClick={() => rmValor(v.id)} aria-label="Remover" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {podeGerir && (
          <div className="mt-1.5 flex gap-1.5">
            <Input value={disc} onChange={(e) => setDisc(e.target.value)} placeholder="Disciplina" className="h-8 flex-1 text-xs" />
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor" className="h-8 w-24 text-xs" />
            <Button size="sm" variant="outline" onClick={addValor} disabled={pending}>+</Button>
          </div>
        )}
      </div>
    </div>
  );
}
