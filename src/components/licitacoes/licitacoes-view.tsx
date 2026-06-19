"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Plus, Upload, Download, Trash2, Import, Receipt, Pencil, X, Check, CalendarClock } from "lucide-react";
import { PAGE_SIZE_PADRAO, PAGE_SIZES } from "@/modules/licitacoes/pagination";
import {
  criarLicitacao,
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
import { totalComposicao, subtotalItem } from "@/modules/licitacoes/composicao/composicao";
import {
  salvarContratoLicitacao,
  adicionarAditivoContrato,
  removerAditivoContrato,
} from "@/modules/licitacoes/contrato/actions";
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

type Lic = {
  id: string;
  titulo: string;
  orgao: string | null;
  modalidade: string | null;
  numeroEdital: string | null;
  prazoProposta: string;
  valorEstimado: number | null;
  status: string;
  observacoes: string;
  projeto: { id: string; codigo: string } | null;
  docs: { id: string; titulo: string; versoes: { id: string; numero: number; arquivoNome: string }[] }[];
  medicoes: { id: string; numero: number; valor: number; data: string }[];
  historico: { id: string; descricao: string; data: string }[];
  valoresDisciplina: { id: string; disciplina: string; valor: number }[];
  eventos: { id: string; tipo: string; data: string; autoria: string | null; protocolo: string | null; observacao: string | null; concluido: boolean }[];
  composicao: { observacao: string | null; itens: { id: string; descricao: string; quantidade: number; valorUnitario: number; ordem: number }[] } | null;
  contrato: {
    id: string; numeroContrato: string | null; numeroEmpenho: string | null;
    valorHomologado: number;
    vigenciaInicio: string | null; vigenciaFim: string | null;
    reajuste: string | null; garantiaTipo: string | null; garantiaValor: number | null; garantiaValidade: string | null;
    limiteAcrescimoPct: number | null;
    aditivos: { id: string; tipo: string; valorDelta: number | null; novaVigencia: string | null; justificativa: string | null; data: string }[];
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  ganha: "Ganha",
  perdida: "Perdida",
  em_execucao: "Em execução",
  concluida: "Concluída",
};
const STATUS_CHIP: Record<string, string> = {
  em_andamento: "text-status-andamento border-status-andamento/40",
  ganha: "text-success border-success/40",
  perdida: "text-destructive border-destructive/40",
  em_execucao: "text-status-entregue border-status-entregue/40",
  concluida: "text-muted-foreground",
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Filtro = { status: string[]; orgao: string; q: string };

export function LicitacoesView({
  licitacoes,
  clientes,
  modalidades,
  podeGerir,
  total,
  page,
  pages,
  pageSize,
  filtro,
}: {
  licitacoes: Lic[];
  clientes: { id: string; nome: string }[];
  modalidades: string[];
  podeGerir: boolean;
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  filtro: Filtro;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogNova, setDialogNova] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [orgao, setOrgao] = useState("");
  const [prazo, setPrazo] = useState("");

  // Filtros (busca textual com debounce; status persistido na URL)
  const [qLocal, setQLocal] = useState(filtro.q);
  const [orgaoLocal, setOrgaoLocal] = useState(filtro.orgao);

  function setParams(next: Partial<Filtro & { page: number; pageSize: number }>) {
    const status = next.status ?? filtro.status;
    const orgaoF = next.orgao ?? filtro.orgao;
    const q = next.q ?? filtro.q;
    const ps = next.pageSize ?? pageSize;
    const pg = next.page ?? 1; // qualquer mudança de filtro reinicia a paginação
    const params = new URLSearchParams();
    if (status.length) params.set("status", status.join(","));
    if (orgaoF) params.set("orgao", orgaoF);
    if (q) params.set("q", q);
    if (ps !== PAGE_SIZE_PADRAO) params.set("pageSize", String(ps));
    if (pg > 1) params.set("page", String(pg));
    const qs = params.toString();
    router.push(qs ? `/licitacoes?${qs}` : "/licitacoes");
  }

  // Debounce das buscas textuais: dispara 400ms após a última tecla.
  useEffect(() => {
    if (qLocal === filtro.q && orgaoLocal === filtro.orgao) return;
    const t = setTimeout(() => setParams({ q: qLocal, orgao: orgaoLocal }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal, orgaoLocal]);

  function toggleStatus(s: string) {
    const next = filtro.status.includes(s)
      ? filtro.status.filter((x) => x !== s)
      : [...filtro.status, s];
    setParams({ status: next });
  }

  const temFiltro = filtro.status.length > 0 || filtro.orgao !== "" || filtro.q !== "";
  function limparFiltros() {
    setQLocal("");
    setOrgaoLocal("");
    setParams({ status: [], orgao: "", q: "" });
  }

  function criar() {
    start(async () => {
      const r = await criarLicitacao({
        titulo,
        orgao,
        modalidade: "",
        numeroEdital: "",
        prazoProposta: prazo,
        observacoes: "",
      });
      if (r.ok) {
        toast.success("Licitação criada.");
        setDialogNova(false);
        setTitulo("");
        setOrgao("");
        setPrazo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const inicio = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Licitações</h2>
          <p className="text-sm text-muted-foreground">
            {total} processo(s){total > 0 && ` · exibindo ${inicio}–${fim}`}.
          </p>
        </div>
        {podeGerir && (
          <Button onClick={() => setDialogNova(true)}>
            <Plus className="size-4" /> Nova licitação
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por título…"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Filtrar por órgão…"
            value={orgaoLocal}
            onChange={(e) => setOrgaoLocal(e.target.value)}
            className="max-w-xs"
          />
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="size-3.5" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(STATUS_LABEL).map(([k, v]) => {
            const ativo = filtro.status.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleStatus(k)}
                aria-pressed={ativo}
              >
                <Badge
                  variant="outline"
                  className={
                    ativo
                      ? `cursor-pointer ${STATUS_CHIP[k]} bg-accent`
                      : "cursor-pointer text-muted-foreground hover:bg-accent/50"
                  }
                >
                  {v}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {licitacoes.map((l) => (
          <LicCard key={l.id} lic={l} clientes={clientes} modalidades={modalidades} podeGerir={podeGerir} />
        ))}
        {licitacoes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {temFiltro ? "Nenhuma licitação para os filtros." : "Nenhuma licitação."}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Itens por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => v && setParams({ pageSize: Number(v) })}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ ...filtro, page: page - 1 })}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setParams({ ...filtro, page: page + 1 })}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova licitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Órgão</Label>
                <Input value={orgao} onChange={(e) => setOrgao(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo da proposta</Label>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNova(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending || !titulo}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LicCard({
  lic,
  clientes,
  modalidades,
  podeGerir,
}: {
  lic: Lic;
  clientes: { id: string; nome: string }[];
  modalidades: string[];
  podeGerir: boolean;
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
        router.refresh();
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

        <LicEventos lic={lic} podeGerir={podeGerir} />
        <LicComposicao lic={lic} podeGerir={podeGerir} />
        <LicContrato lic={lic} podeGerir={podeGerir} />
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

function LicContrato({ lic, podeGerir }: { lic: Lic; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const c = lic.contrato;

  const medido = lic.medicoes.reduce((s, m) => s + m.valor, 0);
  const deltas = c ? somaDeltas(c.aditivos.map((a) => ({ valorDelta: a.valorDelta }))) : 0;
  const saldo = c ? saldoContratual(c.valorHomologado, deltas, medido) : 0;
  const acresc = c ? somaAcrescimos(c.aditivos.map((a) => ({ valorDelta: a.valorDelta }))) : 0;
  const pct = c ? acrescimoAcumuladoPct(c.valorHomologado, acresc) : 0;
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
