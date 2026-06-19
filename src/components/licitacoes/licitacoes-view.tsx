"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Plus, Upload, Download, Trash2, Import, Receipt, Pencil, X } from "lucide-react";
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
