"use client";

import { useRef, useState, useTransition } from "react";
import { formatarData, formatarDataHora, brl } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Upload, Download, Trash2, Folder, FolderPlus, X, FileText, Eye, PenLine, ShieldAlert, Pencil, FilePlus2, ShieldCheck, Send, Receipt, FileEdit } from "lucide-react";
import {
  criarDocJuridico,
  excluirDocJuridico,
  criarPastaJuridica,
  excluirPastaJuridica,
  moverDocPasta,
  criarModeloContrato,
  editarModeloContrato,
  excluirModeloContrato,
  registrarAceite,
  atualizarContratoEquipe,
  gerarVersaoDeModelo,
  criarAditivoEquipe,
  criarLinkAssinatura,
  definirCondicaoPagamento,
  atualizarClausulasAdicionais,
} from "@/modules/juridico/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { AssinarComCertificadoIcp } from "@/components/juridico/assinar-com-certificado-icp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Aceite = { id: string; userId: string; userNome: string; hashArquivo: string; assinadoEm: string };
type EventoTrilha = {
  sequencia: number;
  tipo: string;
  ocorridoEm: string;
  atorNome: string;
  ip: string | null;
  hash: string;
};
type VersaoDoc = {
  id: string;
  numero: number;
  arquivoNome: string;
  autor: string;
  data: string;
  aceites: Aceite[];
  trilha: EventoTrilha[];
  cadeiaIntegra: boolean;
};

const EVENTO_LABEL: Record<string, string> = {
  visualizado: "Visualizado",
  autenticado: "Identidade verificada",
  assinado: "Assinado",
};

/**
 * Trilha de evidência da versão (Fase D/E). Mostra a cadeia inteira e o resultado da verificação
 * de integridade — que roda na LEITURA, porque adulteração acontece no banco, depois do fato.
 */
function TrilhaAssinatura({ versao }: { versao: VersaoDoc }) {
  const [aberta, setAberta] = useState(false);
  if (versao.trilha.length === 0) return null;

  return (
    <div className="ml-4 mt-1">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <ShieldCheck className={`size-3 ${versao.cadeiaIntegra ? "text-success" : "text-destructive"}`} />
        Trilha de evidência ({versao.trilha.length}) {aberta ? "▾" : "▸"}
      </button>
      {aberta && (
        <div className="mt-1 border-l pl-2">
          {!versao.cadeiaIntegra && (
            <p className="mb-1 text-[11px] font-medium text-destructive">
              Cadeia inconsistente — algum registro foi alterado fora do sistema.
            </p>
          )}
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {versao.trilha.map((e) => (
              <li key={e.sequencia} className="flex items-center gap-2">
                <span className="font-mono">{e.sequencia}.</span>
                <span className="font-medium text-foreground">{EVENTO_LABEL[e.tipo] ?? e.tipo}</span>
                <span>{e.atorNome}</span>
                <span>· {formatarDataHora(e.ocorridoEm)}</span>
                {e.ip && <span className="font-mono">· {e.ip}</span>}
                <span className="font-mono text-muted-foreground/70" title={e.hash}>
                  · {e.hash.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
          <a
            href={`/api/juridico/versoes/${versao.id}/certificado`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-[11px] text-primary underline underline-offset-2"
          >
            Certificado de conclusão (PDF) →
          </a>
        </div>
      )}
    </div>
  );
}
type StatusContrato = "rascunho" | "aguardando_assinatura" | "assinado" | "vencido" | "rescindido";
type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  pastaId: string | null;
  projeto: string | null;
  cliente: string | null;
  vinculo: { id: string; userId: string; nome: string; contratacao: string; dataFim: string | null } | null;
  contratoOrigemId: string | null;
  aditivo: {
    vigenciaEm: string;
    remuneracao: number | null;
    cargoNome: string | null;
    novoVencimento: string | null;
    motivo: string | null;
  } | null;
  dataVencimento: string | null;
  valor: number | null;
  statusContrato: StatusContrato | null;
  parcelas: number | null;
  primeiroVencimento: string | null;
  clausulasAdicionais: string | null;
  versoes: VersaoDoc[];
};
type Pasta = { id: string; nome: string; total: number };
type Modelo = { id: string; nome: string; categoria: string | null; conteudo: string };
/** Modelo do ESTÚDIO (`DocumentoModelo`, tipo=contrato) — a fonte real desde a Fase E2. Distinto
 * de `Modelo` acima (`ModeloContrato`, pipeline em texto puro, deprecado até a Fase E6). */
type ModeloEstudio = { id: string; nome: string };
type VinculoOpt = { id: string; label: string; contratacao: string };
type AtivoDevolucao = { id: string; nome: string; tipo: string };
type CargoOpt = { id: string; nome: string };

/** Mesmos motivos de `modules/rh/contratual/motivos.ts` — o aditivo alimenta aquele histórico. */
const MOTIVOS_ADITIVO = [
  { valor: "reajuste", label: "Reajuste" },
  { valor: "promocao", label: "Promoção" },
  { valor: "transferencia", label: "Transferência" },
  { valor: "correcao", label: "Correção" },
];

const NONE = "__none";
const TIPOS_DOC = ["contrato", "aditivo", "proposta", "procuracao", "outro"];

const ehPdf = (nome: string) => nome.toLowerCase().endsWith(".pdf");

const STATUS_LABEL: Record<StatusContrato, string> = {
  rascunho: "Rascunho",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  vencido: "Vencido",
  rescindido: "Rescindido",
};
const STATUS_TONE: Record<StatusContrato, "neutral" | "warning" | "success" | "danger"> = {
  rascunho: "neutral",
  aguardando_assinatura: "warning",
  assinado: "success",
  vencido: "danger",
  rescindido: "neutral",
};

export function JuridicoView({
  docs,
  modelos,
  modelosContrato,
  projetos,
  clientes,
  pastas,
  vinculos,
  cargos,
  ativosPorUsuario,
  podeGerir,
  podeVerEquipe,
}: {
  docs: Doc[];
  modelos: Modelo[];
  modelosContrato: ModeloEstudio[];
  projetos: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  pastas: Pasta[];
  vinculos: VinculoOpt[];
  cargos: CargoOpt[];
  ativosPorUsuario: Record<string, AtivoDevolucao[]>;
  podeGerir: boolean;
  podeVerEquipe: boolean;
}) {
  const docsGerais = docs.filter((d) => !d.vinculo);
  const docsEquipe = docs.filter((d) => d.vinculo);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Jurídico</h2>
        <p className="text-sm text-muted-foreground">
          Contratos versionados. Certidões da empresa agora ficam em{" "}
          <a href="/certidoes" className="underline underline-offset-2">
            Certidões
          </a>
          .
        </p>
      </div>

      <Tabs defaultValue="docs">
        <TabsList>
          <TabsTrigger value="docs">Documentos</TabsTrigger>
          {podeVerEquipe && (
            <TabsTrigger value="equipe">
              Contratos de equipe
              {docsEquipe.length > 0 && <Badge variant="outline" className="ml-1.5">{docsEquipe.length}</Badge>}
            </TabsTrigger>
          )}
          <TabsTrigger value="modelos">Modelos</TabsTrigger>
        </TabsList>
        <Card className="mt-3">
          <CardContent className="pt-5">
            <TabsContent value="docs">
              <DocsTab docs={docsGerais} projetos={projetos} clientes={clientes} pastas={pastas} modelosContrato={modelosContrato} podeGerir={podeGerir} />
            </TabsContent>
            {podeVerEquipe && (
              <TabsContent value="equipe">
                <ContratosEquipeTab docs={docsEquipe} vinculos={vinculos} cargos={cargos} ativosPorUsuario={ativosPorUsuario} modelosContrato={modelosContrato} podeGerir={podeGerir} />
              </TabsContent>
            )}
            <TabsContent value="modelos">
              <ModelosTab modelos={modelos} podeGerir={podeGerir} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}

const SEM_PASTA = "__sempasta";

/** Fase F — gera o link de assinatura para quem não é usuário do sistema. */
function EnviarParaAssinatura({ versaoId, rotulo }: { versaoId: string; rotulo: string }) {
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", dias: "30" });
  const [url, setUrl] = useState<string | null>(null);

  function criar() {
    if (form.nome.trim().length < 3) return toast.error("Informe o nome do signatário.");
    start(async () => {
      const r = await criarLinkAssinatura({
        versaoId,
        nome: form.nome,
        email: form.email,
        diasValidade: Number(form.dias) || 30,
      });
      if (r.ok) setUrl(r.data.url);
      else toast.error(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUrl(null);
          setForm({ nome: "", email: "", dias: "30" });
          setAberto(true);
        }}
        className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
        title="Enviar para assinatura externa"
      >
        <Send className="size-3.5" /> Enviar
      </button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar {rotulo} para assinatura</DialogTitle>
          </DialogHeader>
          {url ? (
            <div className="space-y-2">
              <p className="text-sm">Link gerado. Envie para o signatário:</p>
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(url).then(
                    () => toast.success("Link copiado."),
                    () => toast.error("Não foi possível copiar — selecione e copie à mão."),
                  );
                }}
              >
                Copiar link
              </Button>
              <p className="text-xs text-muted-foreground">
                O link vale por {form.dias} dias, serve para uma assinatura só e pode ser revogado.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome do signatário</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>E-mail (opcional)</Label>
                    <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Validade (dias)</Label>
                    <Input
                      type="number"
                      value={form.dias}
                      onChange={(e) => setForm({ ...form, dias: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O nome fica gravado no link: é o que prova para quem ele foi enviado.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
                <Button onClick={criar} disabled={pending}>Gerar link</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Fase G — plano de parcelas do contrato de cliente. As parcelas nascem na ASSINATURA. */
/**
 * Fase E3 — cláusulas específicas deste contrato, sem editar o layout do modelo. É a resposta à
 * pergunta que originou o spec de integração com o Estúdio: um modelo com `[ClausulasAdicionais]`
 * (idealmente dentro de um elemento condicional, `naoVazio([ClausulasAdicionais])`) puxa este
 * texto — o layout continua único e padronizado, só o conteúdo muda por contrato.
 */
function ClausulasAdicionaisDialog({ doc }: { doc: Doc }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  function abrir() {
    setTexto(doc.clausulasAdicionais ?? "");
    setAberto(true);
  }

  function salvar() {
    start(async () => {
      const r = await atualizarClausulasAdicionais({ id: doc.id, clausulasAdicionais: texto });
      if (r.ok) {
        toast.success("Cláusulas salvas.");
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}>
        <FileEdit className="size-3.5" />
        Cláusulas{doc.clausulasAdicionais ? " •" : ""}
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cláusulas adicionais — {doc.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Texto específico deste contrato. Só aparece no PDF se o modelo escolhido citar o
              campo &quot;Cláusulas adicionais&quot;. Deixe em branco se este contrato não tem
              nenhuma exceção ao padrão.
            </p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="w-full rounded-sm border bg-transparent p-2 text-sm"
              placeholder="Ex.: Cláusula 12 — Confidencialidade estendida por 24 meses após o encerramento."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CondicaoPagamento({ doc }: { doc: Doc }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ parcelas: "", primeiroVencimento: "" });

  function abrir() {
    setForm({
      parcelas: doc.parcelas != null ? String(doc.parcelas) : "",
      primeiroVencimento: doc.primeiroVencimento ? doc.primeiroVencimento.slice(0, 10) : "",
    });
    setAberto(true);
  }

  function salvar() {
    const n = form.parcelas ? Number(form.parcelas) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1)) return toast.error("Número de parcelas inválido.");
    if (n !== null && !form.primeiroVencimento) return toast.error("Informe o vencimento da primeira parcela.");
    start(async () => {
      const r = await definirCondicaoPagamento({
        id: doc.id,
        parcelas: n,
        primeiroVencimento: form.primeiroVencimento,
      });
      if (r.ok) {
        toast.success("Condição de pagamento salva.");
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}>
        <Receipt className="size-3.5" /> Pagamento
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Condição de pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.parcelas}
                  onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>1º vencimento</Label>
                <Input
                  type="date"
                  value={form.primeiroVencimento}
                  onChange={(e) => setForm({ ...form, primeiroVencimento: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              As parcelas são criadas no financeiro quando o contrato for <strong>assinado</strong> —
              não agora. Valor do contrato: {doc.valor != null ? brl(doc.valor) : "não definido"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Gera uma versão do contrato preenchendo um modelo com os dados do próprio documento (Fase B).
 * A ação recusa quando falta dado obrigatório, e a mensagem já diz se o defeito é no modelo ou no
 * cadastro — por isso o erro vai inteiro para o toast, sem encurtar.
 */
function GerarDoModelo({ docId, modelos }: { docId: string; modelos: ModeloEstudio[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [modeloId, setModeloId] = useState<string>(NONE);

  function gerar() {
    if (modeloId === NONE) return toast.error("Escolha o modelo.");
    start(async () => {
      const r = await gerarVersaoDeModelo({ documentoId: docId, modeloId });
      if (r.ok) {
        toast.success(`Versão v${r.data.numero} gerada a partir do modelo.`);
        setAberto(false);
        setModeloId(NONE);
        router.refresh();
      } else toast.error(r.error, { duration: 10000 });
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)} disabled={modelos.length === 0}>
        <FileText className="size-3.5" /> Gerar do modelo
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar versão a partir de um modelo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={(v) => setModeloId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha…" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Os campos entre colchetes do modelo são preenchidos com os dados deste contrato. Se faltar
              algum dado obrigatório, a geração é recusada e o campo é apontado.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={gerar} disabled={pending}>Gerar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocsTab({
  docs,
  projetos,
  clientes,
  pastas,
  modelosContrato,
  podeGerir,
}: {
  docs: Doc[];
  projetos: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  pastas: Pasta[];
  modelosContrato: ModeloEstudio[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("contrato");
  const [projetoId, setProjetoId] = useState(NONE);
  const [clienteId, setClienteId] = useState(NONE);
  const [pastaId, setPastaId] = useState(NONE);
  const [filtro, setFiltro] = useState<string | null>(null); // null = todas; SEM_PASTA; ou id
  const [novaPasta, setNovaPasta] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadDoc, setUploadDoc] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; nome: string } | null>(null);

  const docsVisiveis =
    filtro === null
      ? docs
      : filtro === SEM_PASTA
        ? docs.filter((d) => !d.pastaId)
        : docs.filter((d) => d.pastaId === filtro);
  const nomePasta = (id: string | null) => (id ? (pastas.find((p) => p.id === id)?.nome ?? null) : null);

  function criar() {
    if (!titulo.trim()) return toast.error("Informe o título.");
    start(async () => {
      const r = await criarDocJuridico({
        titulo,
        tipo: tipo as never,
        projetoId: projetoId === NONE ? "" : projetoId,
        clienteId: clienteId === NONE ? "" : clienteId,
        pastaId: pastaId === NONE ? "" : pastaId,
        observacao: "",
      });
      if (r.ok) {
        toast.success("Documento criado — envie a primeira versão.");
        setTitulo("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function criarPasta() {
    if (!novaPasta.trim()) return;
    start(async () => {
      const r = await criarPastaJuridica({ nome: novaPasta, parentId: "" });
      if (r.ok) {
        toast.success("Pasta criada.");
        setNovaPasta("");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluirPasta(id: string) {
    start(async () => {
      const r = await excluirPastaJuridica({ id });
      if (r.ok) {
        if (filtro === id) setFiltro(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function mover(id: string, pasta: string) {
    start(async () => {
      const r = await moverDocPasta({ id, pastaId: pasta === NONE ? "" : pasta });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function enviarVersao(file: File | null) {
    if (!file || !uploadDoc) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/juridico/docs/${uploadDoc}/versao`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Versão v${data.numero} enviada.`);
      router.refresh();
    } else toast.error(data.error ?? "Falha no upload.");
    if (uploadRef.current) uploadRef.current.value = "";
    setUploadDoc(null);
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirDocJuridico({ id });
      if (r.ok) {
        toast.success("Documento excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function assinar(versaoId: string, label: string) {
    const ok = await confirm({
      title: "Registrar aceite desta versão?",
      description: `Será registrado o seu aceite de ${label} com a data/hora atual e o hash SHA-256 do arquivo (prova de integridade).`,
      confirmLabel: "Assinar",
    });
    if (!ok) return;
    start(async () => {
      const r = await registrarAceite({ versaoId });
      if (r.ok) {
        toast.success(r.data.jaAssinado ? "Você já havia assinado esta versão." : "Aceite registrado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-3">
          <Input className="w-56" placeholder="Título do documento…" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <Select value={tipo} onValueChange={(v) => setTipo(v ?? "contrato")}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DOC.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Projeto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem projeto</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? NONE)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem cliente</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pastaId} onValueChange={(v) => setPastaId(v ?? NONE)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Pasta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem pasta</SelectItem>
              {pastas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={criar} disabled={pending}>
            <Plus className="size-3.5" /> Criar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFiltro(null)}
          className={`rounded-sm border px-2.5 py-1 text-xs ${filtro === null ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Todas ({docs.length})
        </button>
        <button
          onClick={() => setFiltro(SEM_PASTA)}
          className={`rounded-sm border px-2.5 py-1 text-xs ${filtro === SEM_PASTA ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Sem pasta ({docs.filter((d) => !d.pastaId).length})
        </button>
        {pastas.map((p) => (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-xs ${filtro === p.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            <button onClick={() => setFiltro(p.id)} className="inline-flex items-center gap-1 hover:text-foreground">
              <Folder className="size-3" /> {p.nome} ({p.total})
            </button>
            {podeGerir && (
              <button onClick={() => excluirPasta(p.id)} aria-label="Excluir pasta" className="hover:text-destructive" disabled={pending}>
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {podeGerir && (
          <span className="inline-flex items-center gap-1">
            <Input
              className="h-7 w-32 text-xs"
              placeholder="Nova pasta…"
              value={novaPasta}
              onChange={(e) => setNovaPasta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && criarPasta()}
            />
            <Button size="icon" variant="ghost" aria-label="Criar pasta" onClick={criarPasta} disabled={pending || !novaPasta.trim()}>
              <FolderPlus className="size-4" />
            </Button>
          </span>
        )}
      </div>

      <input ref={uploadRef} type="file" className="hidden" onChange={(e) => enviarVersao(e.target.files?.[0] ?? null)} />

      {docsVisiveis.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum documento." />
      ) : (
        <div className="space-y-3">
          {docsVisiveis.map((d) => (
            <div key={d.id} className="rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.titulo}</span>
                <Badge variant="outline">{d.tipo}</Badge>
                {nomePasta(d.pastaId) && (
                  <Badge variant="outline" className="text-info border-info/40">
                    <Folder className="mr-1 size-3" /> {nomePasta(d.pastaId)}
                  </Badge>
                )}
                {d.projeto && <span className="font-mono text-xs text-muted-foreground">{formatarCodigo(d.projeto)}</span>}
                {d.cliente && <span className="text-xs text-muted-foreground">{d.cliente}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  {podeGerir && (
                    <>
                      <Select value={d.pastaId ?? NONE} onValueChange={(v) => mover(d.id, v ?? NONE)}>
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue placeholder="Pasta" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sem pasta</SelectItem>
                          {pastas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {d.tipo === "contrato" && <GerarDoModelo docId={d.id} modelos={modelosContrato} />}
                      {d.tipo === "contrato" && <CondicaoPagamento doc={d} />}
                      {d.tipo === "contrato" && <ClausulasAdicionaisDialog doc={d} />}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setUploadDoc(d.id);
                          uploadRef.current?.click();
                        }}
                      >
                        <Upload className="size-3.5" /> Nova versão
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(d.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {d.versoes.length > 0 && (
                <ul className="mt-2 space-y-2 text-xs">
                  {d.versoes.map((v, i) => (
                    <li key={v.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className={`font-mono ${i === 0 ? "font-bold text-foreground" : ""}`}>
                          v{v.numero}
                          {i === 0 && " (atual)"}
                        </span>
                        <span className="truncate">{v.arquivoNome}</span>
                        <span>· {v.autor} · {formatarData(v.data)}</span>
                        {ehPdf(v.arquivoNome) && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreview({ url: `/api/juridico/versoes/${v.id}/download?inline=1`, nome: v.arquivoNome })
                            }
                            className="text-primary hover:text-primary/80"
                            aria-label="Visualizar"
                            title="Visualizar"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        )}
                        <a href={`/api/juridico/versoes/${v.id}/download`} className="text-primary" aria-label="Baixar">
                          <Download className="size-3.5" />
                        </a>
                        {podeGerir && (
                          <button
                            type="button"
                            onClick={() => assinar(v.id, `v${v.numero}`)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
                            aria-label="Assinar / registrar aceite"
                            title="Assinar / registrar aceite"
                          >
                            <PenLine className="size-3.5" /> Assinar
                          </button>
                        )}
                        {podeGerir && <EnviarParaAssinatura versaoId={v.id} rotulo={`v${v.numero}`} />}
                        {podeGerir && <AssinarComCertificadoIcp />}
                      </div>
                      {v.aceites.length > 0 && (
                        <ul className="ml-4 space-y-0.5 border-l pl-2 text-[11px] text-muted-foreground">
                          {v.aceites.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              <PenLine className="size-3 shrink-0 text-success" />
                              <span>
                                Assinado por <span className="font-medium text-foreground">{a.userNome}</span> em{" "}
                                {formatarData(a.assinadoEm)}
                              </span>
                              <span className="font-mono text-muted-foreground/70" title={a.hashArquivo}>
                                · {a.hashArquivo.slice(0, 12)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <TrilhaAssinatura versao={v} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.nome}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe src={preview.url} className="h-[80svh] w-full rounded-sm border" title={preview.nome} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Cria um aditivo do contrato (Fase B2). O aditivo é documento próprio, assinado à parte — e
 * ASSINAR é o que aplica a alteração no cadastro (`registrarAlteracaoContratual`), não salvar aqui.
 */
function NovoAditivo({ contrato, cargos }: { contrato: Doc; cargos: CargoOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    vigenciaEm: "",
    cargoId: NONE,
    remuneracao: null as number | null,
    novoVencimento: "",
    motivo: "reajuste",
    observacao: "",
  });

  function abrir() {
    setForm({
      titulo: `Aditivo — ${contrato.titulo}`,
      vigenciaEm: "",
      cargoId: NONE,
      remuneracao: null,
      novoVencimento: "",
      motivo: "reajuste",
      observacao: "",
    });
    setAberto(true);
  }

  function salvar() {
    if (!form.vigenciaEm) return toast.error("Informe a data de vigência.");
    const mexeEmAlgo = form.cargoId !== NONE || form.remuneracao !== null || form.novoVencimento;
    if (!mexeEmAlgo) return toast.error("Informe ao menos uma alteração (cargo, remuneração ou prazo).");
    start(async () => {
      const r = await criarAditivoEquipe({
        contratoOrigemId: contrato.id,
        titulo: form.titulo,
        vigenciaEm: form.vigenciaEm,
        cargoId: form.cargoId === NONE ? "" : form.cargoId,
        remuneracao: form.remuneracao,
        novoVencimento: form.novoVencimento,
        motivo: form.motivo,
        observacao: form.observacao,
      });
      if (r.ok) {
        toast.success("Aditivo criado — gere a versão e assine para aplicar a alteração.");
        setAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={abrir}>
        <FilePlus2 className="size-3.5" /> Aditivo
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo aditivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vigência a partir de</Label>
                <Input
                  type="date"
                  value={form.vigenciaEm}
                  onChange={(e) => setForm({ ...form, vigenciaEm: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <Select value={form.motivo} onValueChange={(v) => setForm({ ...form, motivo: v ?? "reajuste" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_ADITIVO.map((m) => (
                      <SelectItem key={m.valor} value={m.valor}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Preencha só o que este aditivo altera. Campo em branco = eixo inalterado.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Novo cargo</Label>
                <Select value={form.cargoId} onValueChange={(v) => setForm({ ...form, cargoId: v ?? NONE })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem mudança" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem mudança</SelectItem>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nova remuneração</Label>
                <InputMoeda
                  placeholder="Sem mudança"
                  value={form.remuneracao}
                  onChange={(v) => setForm({ ...form, remuneracao: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Novo vencimento</Label>
                <Input
                  type="date"
                  value={form.novoVencimento}
                  onChange={(e) => setForm({ ...form, novoVencimento: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observação</Label>
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Criar aditivo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const CONTRATACAO_LABEL: Record<string, string> = {
  clt: "CLT",
  estagiario: "Estágio",
  projetista_pj: "PJ",
  freelancer: "Freelancer",
};

function ContratosEquipeTab({
  docs,
  vinculos,
  cargos,
  ativosPorUsuario,
  modelosContrato,
  podeGerir,
}: {
  docs: Doc[];
  vinculos: VinculoOpt[];
  cargos: CargoOpt[];
  ativosPorUsuario: Record<string, AtivoDevolucao[]>;
  modelosContrato: ModeloEstudio[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [vinculoId, setVinculoId] = useState(NONE);
  const [dataVencimento, setDataVencimento] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [editando, setEditando] = useState<Doc | null>(null);
  const [editForm, setEditForm] = useState({ dataVencimento: "", valor: null as number | null, statusContrato: "rascunho" as StatusContrato });
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadDoc, setUploadDoc] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; nome: string } | null>(null);

  function selecionarVinculo(id: string) {
    setVinculoId(id);
    if (id !== NONE && !titulo.trim()) {
      const v = vinculos.find((x) => x.id === id);
      if (v) setTitulo(`Contrato — ${v.label.split(" · ")[0]}`);
    }
  }

  function criar() {
    if (vinculoId === NONE) return toast.error("Selecione o vínculo.");
    if (!titulo.trim()) return toast.error("Informe o título.");
    start(async () => {
      const r = await criarDocJuridico({
        titulo,
        tipo: "contrato" as never,
        vinculoId,
        dataVencimento,
        valor: valor ?? undefined,
        projetoId: "",
        clienteId: "",
        pastaId: "",
        observacao: "",
      });
      if (r.ok) {
        toast.success("Contrato criado — envie a primeira versão.");
        setTitulo("");
        setVinculoId(NONE);
        setDataVencimento("");
        setValor(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function abrirEdicao(d: Doc) {
    setEditForm({
      dataVencimento: d.dataVencimento ? d.dataVencimento.slice(0, 10) : "",
      valor: d.valor != null ? Number(d.valor) : null,
      statusContrato: d.statusContrato ?? "rascunho",
    });
    setEditando(d);
  }

  function salvarEdicao() {
    if (!editando) return;
    start(async () => {
      const r = await atualizarContratoEquipe({
        id: editando.id,
        dataVencimento: editForm.dataVencimento,
        valor: editForm.valor,
        statusContrato: editForm.statusContrato,
      });
      if (r.ok) {
        toast.success("Contrato atualizado.");
        setEditando(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirDocJuridico({ id });
      if (r.ok) {
        toast.success("Contrato excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function enviarVersao(file: File | null) {
    if (!file || !uploadDoc) return;
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/juridico/docs/${uploadDoc}/versao`, { method: "POST", body: fd });
    const data = await res.json();
    if (res.ok) {
      toast.success(`Versão v${data.numero} enviada.`);
      router.refresh();
    } else toast.error(data.error ?? "Falha no upload.");
    if (uploadRef.current) uploadRef.current.value = "";
    setUploadDoc(null);
  }

  async function assinar(versaoId: string, label: string) {
    const ok = await confirm({
      title: "Registrar aceite desta versão?",
      description: `Será registrado o seu aceite de ${label} com a data/hora atual e o hash SHA-256 do arquivo (prova de integridade).`,
      confirmLabel: "Assinar",
    });
    if (!ok) return;
    start(async () => {
      const r = await registrarAceite({ versaoId });
      if (r.ok) {
        toast.success(r.data.jaAssinado ? "Você já havia assinado esta versão." : "Aceite registrado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const vencido = (d: Doc) => d.dataVencimento && d.statusContrato !== "rescindido" && new Date(d.dataVencimento) < new Date();

  // Aditivo aparece SOB o contrato que ele altera, não solto na lista: ele não é um contrato
  // independente, e vê-lo fora de contexto não diz o que foi alterado nem de quem.
  const contratos = docs.filter((d) => !d.contratoOrigemId);
  const aditivosPorContrato = new Map<string, Doc[]>();
  for (const d of docs) {
    if (!d.contratoOrigemId) continue;
    const lista = aditivosPorContrato.get(d.contratoOrigemId) ?? [];
    lista.push(d);
    aditivosPorContrato.set(d.contratoOrigemId, lista);
  }

  function resumoAditivo(d: Doc): string {
    if (!d.aditivo) return "";
    const partes: string[] = [];
    if (d.aditivo.cargoNome) partes.push(`cargo → ${d.aditivo.cargoNome}`);
    if (d.aditivo.remuneracao != null) partes.push(`remuneração → ${brl(d.aditivo.remuneracao)}`);
    if (d.aditivo.novoVencimento) partes.push(`prazo → ${formatarData(d.aditivo.novoVencimento)}`);
    return partes.join(" · ");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-sm border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          Contrato de equipe carrega dado sensível de RH (salário, CPF) — visível só pra quem tem perfil de RH.
        </span>
      </div>

      {podeGerir && (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
          <div className="space-y-1">
            <Label className="text-xs">Vínculo</Label>
            <Select value={vinculoId} onValueChange={(v) => selecionarVinculo(v ?? NONE)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {vinculos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Título</Label>
            <Input className="w-56" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vencimento</Label>
            <Input type="date" className="w-40" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor</Label>
            <InputMoeda className="w-32" value={valor} onChange={setValor} />
          </div>
          <Button size="sm" onClick={criar} disabled={pending}>
            <Plus className="size-3.5" /> Criar
          </Button>
        </div>
      )}

      <input ref={uploadRef} type="file" className="hidden" onChange={(e) => enviarVersao(e.target.files?.[0] ?? null)} />

      {contratos.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum contrato de equipe." />
      ) : (
        <div className="space-y-3">
          {contratos.map((d) => (
            <div key={d.id} className="rounded-sm border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{d.titulo}</span>
                {d.vinculo && (
                  <Badge variant="outline">
                    {d.vinculo.nome} · {CONTRATACAO_LABEL[d.vinculo.contratacao] ?? d.vinculo.contratacao}
                  </Badge>
                )}
                {d.statusContrato && (
                  <StatusBadge tone={vencido(d) ? "danger" : STATUS_TONE[d.statusContrato]}>
                    {vencido(d) ? "Vencido" : STATUS_LABEL[d.statusContrato]}
                  </StatusBadge>
                )}
                {d.dataVencimento && (
                  <span className="text-xs text-muted-foreground">até {formatarData(d.dataVencimento)}</span>
                )}
                {d.valor != null && <span className="text-xs text-muted-foreground">{brl(d.valor)}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  {podeGerir && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => abrirEdicao(d)}>
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <GerarDoModelo docId={d.id} modelos={modelosContrato} />
                      <NovoAditivo contrato={d} cargos={cargos} />
                      <ClausulasAdicionaisDialog doc={d} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setUploadDoc(d.id);
                          uploadRef.current?.click();
                        }}
                      >
                        <Upload className="size-3.5" /> Nova versão
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(d.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {d.vinculo?.dataFim && (() => {
                const pendentes = ativosPorUsuario[d.vinculo.userId] ?? [];
                return (
                  <div className="mt-2 rounded-sm border border-warning/40 bg-warning/10 p-2 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-warning">
                      <ShieldAlert className="size-3.5" /> Vínculo encerra em {formatarData(d.vinculo.dataFim)} — checklist de devolução
                    </div>
                    {pendentes.length === 0 ? (
                      <p className="mt-1 text-muted-foreground">Nenhum ativo/máquina de Patrimônio no nome desta pessoa.</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {pendentes.map((a) => (
                          <li key={a.id}>· {a.nome} ({a.tipo})</li>
                        ))}
                      </ul>
                    )}
                    <a href="/patrimonio" className="mt-1 inline-block text-primary underline underline-offset-2">
                      Registrar devolução em Patrimônio →
                    </a>
                  </div>
                );
              })()}
              {d.versoes.length > 0 && (
                <ul className="mt-2 space-y-2 text-xs">
                  {d.versoes.map((v, i) => (
                    <li key={v.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className={`font-mono ${i === 0 ? "font-bold text-foreground" : ""}`}>
                          v{v.numero}
                          {i === 0 && " (atual)"}
                        </span>
                        <span className="truncate">{v.arquivoNome}</span>
                        <span>· {v.autor} · {formatarData(v.data)}</span>
                        {ehPdf(v.arquivoNome) && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreview({ url: `/api/juridico/versoes/${v.id}/download?inline=1`, nome: v.arquivoNome })
                            }
                            className="text-primary hover:text-primary/80"
                            aria-label="Visualizar"
                            title="Visualizar"
                          >
                            <Eye className="size-3.5" />
                          </button>
                        )}
                        <a href={`/api/juridico/versoes/${v.id}/download`} className="text-primary" aria-label="Baixar">
                          <Download className="size-3.5" />
                        </a>
                        {podeGerir && (
                          <button
                            type="button"
                            onClick={() => assinar(v.id, `v${v.numero}`)}
                            disabled={pending}
                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
                            aria-label="Assinar / registrar aceite"
                            title="Assinar / registrar aceite"
                          >
                            <PenLine className="size-3.5" /> Assinar
                          </button>
                        )}
                        {podeGerir && <EnviarParaAssinatura versaoId={v.id} rotulo={`v${v.numero}`} />}
                        {podeGerir && <AssinarComCertificadoIcp />}
                      </div>
                      {v.aceites.length > 0 && (
                        <ul className="ml-4 space-y-0.5 border-l pl-2 text-[11px] text-muted-foreground">
                          {v.aceites.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              <PenLine className="size-3 shrink-0 text-success" />
                              <span>
                                Assinado por <span className="font-medium text-foreground">{a.userNome}</span> em{" "}
                                {formatarData(a.assinadoEm)}
                              </span>
                              <span className="font-mono text-muted-foreground/70" title={a.hashArquivo}>
                                · {a.hashArquivo.slice(0, 12)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <TrilhaAssinatura versao={v} />
                    </li>
                  ))}
                </ul>
              )}

              {(aditivosPorContrato.get(d.id) ?? []).map((a) => (
                <div key={a.id} className="mt-2 ml-4 rounded-sm border border-dashed p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-info/40 text-info">Aditivo</Badge>
                    <span className="font-medium">{a.titulo}</span>
                    {a.statusContrato && (
                      <StatusBadge tone={STATUS_TONE[a.statusContrato]}>{STATUS_LABEL[a.statusContrato]}</StatusBadge>
                    )}
                    {a.aditivo && (
                      <span className="text-muted-foreground">
                        vigência {formatarData(a.aditivo.vigenciaEm)}
                        {resumoAditivo(a) && ` · ${resumoAditivo(a)}`}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      {podeGerir && (
                        <>
                          <GerarDoModelo docId={a.id} modelos={modelosContrato} />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setUploadDoc(a.id);
                              uploadRef.current?.click();
                            }}
                          >
                            <Upload className="size-3.5" /> Nova versão
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Excluir aditivo" onClick={() => excluir(a.id)}>
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {a.statusContrato !== "assinado" && (
                    <p className="mt-1 text-muted-foreground">
                      A alteração só entra no cadastro quando o aditivo for assinado.
                    </p>
                  )}
                  {a.versoes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {a.versoes.map((v, i) => (
                        <li key={v.id} className="flex items-center gap-2">
                          <span className={`font-mono ${i === 0 ? "font-bold text-foreground" : ""}`}>v{v.numero}</span>
                          <span className="truncate">{v.arquivoNome}</span>
                          <a href={`/api/juridico/versoes/${v.id}/download`} className="text-primary" aria-label="Baixar">
                            <Download className="size-3.5" />
                          </a>
                          {podeGerir && (
                            <button
                              type="button"
                              onClick={() => assinar(v.id, `v${v.numero}`)}
                              disabled={pending}
                              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 disabled:opacity-50"
                            >
                              <PenLine className="size-3.5" /> Assinar
                            </button>
                          )}
                          {v.aceites.length > 0 && (
                            <span className="text-success">· assinado por {v.aceites[0]!.userNome}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.nome}</DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe src={preview.url} className="h-[80svh] w-full rounded-sm border" title={preview.nome} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar contrato — {editando?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={editForm.dataVencimento}
                onChange={(e) => setEditForm({ ...editForm, dataVencimento: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <InputMoeda value={editForm.valor} onChange={(v) => setEditForm({ ...editForm, valor: v })} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Status</Label>
              <Select
                value={editForm.statusContrato}
                onValueChange={(v) => setEditForm({ ...editForm, statusContrato: (v ?? "rascunho") as StatusContrato })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as StatusContrato[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModelosTab({ modelos, podeGerir }: { modelos: Modelo[]; podeGerir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<Modelo | "novo" | null>(null);
  const [form, setForm] = useState({ nome: "", categoria: "", conteudo: "" });

  function abrir(m: Modelo | "novo") {
    if (m === "novo") setForm({ nome: "", categoria: "", conteudo: "" });
    else setForm({ nome: m.nome, categoria: m.categoria ?? "", conteudo: m.conteudo });
    setEdit(m);
  }
  function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = edit && edit !== "novo"
        ? await editarModeloContrato({ id: edit.id, nome: form.nome, categoria: form.categoria, conteudo: form.conteudo })
        : await criarModeloContrato({ nome: form.nome, categoria: form.categoria, conteudo: form.conteudo });
      if (r.ok) {
        toast.success("Modelo salvo.");
        setEdit(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir(id: string) {
    start(async () => {
      const r = await excluirModeloContrato({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {podeGerir && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => abrir("novo")}><Plus className="size-3.5" /> Novo modelo</Button>
        </div>
      )}
      {modelos.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhum modelo de contrato." />
      ) : (
        <ul className="divide-y rounded-sm border">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="font-medium">{m.nome}</span>
              {m.categoria && <Badge variant="outline">{m.categoria}</Badge>}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{m.conteudo.length} car.</span>
              {podeGerir && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => abrir(m)}>Editar</Button>
                  <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(m.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{edit && edit !== "novo" ? "Editar modelo" : "Novo modelo"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="prestação de serviço…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo</Label>
              <textarea
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                rows={8}
                className="w-full rounded-sm border bg-transparent p-2 font-mono text-xs"
                placeholder="Cláusulas do modelo…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
