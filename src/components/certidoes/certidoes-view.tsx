"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  Download,
  Trash2,
  FileArchive,
  FileText,
  ShieldCheck,
  ShieldAlert,
  PenLine,
  Share2,
  FileSpreadsheet,
  History,
  Copy,
  Ban,
  Tags,
} from "lucide-react";
import { formatarData, formatarDataHora } from "@/lib/utils";
import { statusCertidao, type StatusCertidao, type PanoramaCompliance, type TipoObrigatorio } from "@/modules/certidoes/service";
import { extrairValidadeDoTexto } from "@/modules/certidoes/extrair-validade";
import {
  criarCertidao,
  editarCertidao,
  excluirCertidao,
  criarTipoCertidao,
  editarTipoCertidao,
  excluirTipoCertidao,
  criarLinkCertidoes,
  revogarLinkCertidoes,
} from "@/modules/certidoes/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Versao = { id: string; numero: number; validade: string; arquivoNome: string | null; data: string };
type LicitacaoRef = { licitacaoId: string; titulo: string; status: string; exigencia: string; atendido: boolean };
type Auditoria = { id: string; acao: string; resultado: string; usuario: string | null; data: string };
type Certidao = {
  id: string;
  tipoId: string;
  tipo: string;
  descricao: string | null;
  validade: string;
  arquivoNome: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  versoes: Versao[];
  licitacoes: LicitacaoRef[];
  auditoria: Auditoria[];
};
type Tipo = { id: string; nome: string; obrigatoria: boolean };
type Responsavel = { id: string; name: string };
type LinkPublico = { id: string; token: string; ativo: boolean; expiraEm: string | null; certidaoIds: string[]; createdAt: string };

const NONE = "__none";

function badgeStatus(status: StatusCertidao) {
  if (status === "vencida") return <Badge variant="outline" className="text-destructive border-destructive/40">vencida</Badge>;
  if (status === "vence_em_breve") return <Badge variant="outline" className="text-warning border-warning/40">vence em breve</Badge>;
  return <Badge variant="outline" className="text-success border-success/40">ok</Badge>;
}

/**
 * Lê o texto selecionável de um PDF no cliente (pdfjs, carregado dinamicamente —
 * mesmo padrão de `documento-viewer.tsx`). NÃO é OCR: PDF escaneado (imagem) não
 * tem camada de texto e retorna string vazia — a chamada nunca lança para o caller
 * tratar como "sem sugestão", já que quem chama está num fluxo de upload que não
 * pode travar por causa disso.
 */
async function lerTextoPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // pdfjs-dist tem tipos incômodos p/ uso solto (mesmo motivo de `documento-viewer.tsx` usar `any`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    let texto = "";
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const conteudo = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      texto += conteudo.items.map((it: any) => ("str" in it ? it.str : "")).join(" ") + " ";
    }
    return texto;
  } finally {
    doc.destroy?.();
  }
}

export function CertidoesView({
  certidoes,
  tipos,
  responsaveis,
  links,
  panorama,
  faltando,
  podeGerir,
}: {
  certidoes: Certidao[];
  tipos: Tipo[];
  responsaveis: Responsavel[];
  links: LinkPublico[];
  panorama: PanoramaCompliance;
  faltando: TipoObrigatorio[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [filtro, setFiltro] = useState<"todas" | StatusCertidao | "sem_arquivo">("todas");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<Certidao | null>(null);
  const [uploadPara, setUploadPara] = useState<Certidao | null>(null);
  const [editar, setEditar] = useState<Certidao | null>(null);
  const [loteAberto, setLoteAberto] = useState(false);
  const [compartilharAberto, setCompartilharAberto] = useState(false);
  const [tiposAberto, setTiposAberto] = useState(false);
  const [novo, setNovo] = useState({ tipoId: "", descricao: "", validade: "" });

  const visiveis = certidoes.filter((c) => {
    if (filtro === "todas") return true;
    if (filtro === "sem_arquivo") return !c.arquivoNome;
    return statusCertidao(c.validade) === filtro;
  });

  function alternarSelecao(id: string) {
    setSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function registrar() {
    if (!novo.tipoId || !novo.validade) return toast.error("Selecione o tipo e informe a validade.");
    start(async () => {
      const r = await criarCertidao(novo);
      if (r.ok) {
        toast.success("Certidão registrada — anexe o arquivo em seguida.");
        setNovo({ tipoId: "", descricao: "", validade: "" });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(c: Certidao) {
    start(async () => {
      const ok = await confirm({
        title: `Excluir "${c.tipo}"?`,
        description: "Remove a certidão e todo o histórico de versões. Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
        variant: "destructive",
      });
      if (!ok) return;
      const r = await excluirCertidao({ id: c.id });
      if (r.ok) {
        toast.success("Certidão excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Certidões</h2>
          <p className="text-sm text-muted-foreground">Controle de validade, versionamento e compartilhamento das certidões da empresa.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" render={<a href="/api/certidoes/exportar" rel="noopener" />}>
            <FileSpreadsheet className="size-3.5" /> Exportar
          </Button>
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setCompartilharAberto(true)}>
              <Share2 className="size-3.5" /> Compartilhar
            </Button>
          )}
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setTiposAberto(true)}>
              <Tags className="size-3.5" /> Gerenciar tipos
            </Button>
          )}
        </div>
      </div>

      <PainelVencimentos panorama={panorama} filtro={filtro} onFiltro={setFiltro} total={certidoes.length} />

      {faltando.length > 0 && (
        <div className="flex items-start gap-2 rounded-sm border border-warning/40 bg-warning/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Tipos obrigatórios sem certidão vigente</p>
            <p className="text-muted-foreground">{faltando.map((t) => t.nome).join(", ")}</p>
          </div>
        </div>
      )}

      {podeGerir && (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-dashed p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={novo.tipoId} onValueChange={(v) => setNovo((n) => ({ ...n, tipoId: v ?? "" }))}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                    {t.obrigatoria ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Input className="w-52" value={novo.descricao} onChange={(e) => setNovo((n) => ({ ...n, descricao: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Validade</Label>
            <Input type="date" value={novo.validade} onChange={(e) => setNovo((n) => ({ ...n, validade: e.target.value }))} />
          </div>
          <Button size="sm" onClick={registrar} disabled={pending || !novo.tipoId || !novo.validade}>
            <Plus className="size-3.5" /> Registrar
          </Button>
        </div>
      )}

      {selecionadas.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border bg-muted/40 p-2 text-sm">
          <span className="font-medium">{selecionadas.size} selecionada(s)</span>
          <Button size="sm" variant="outline" render={<a href={`/api/certidoes/zip?ids=${[...selecionadas].join(",")}`} rel="noopener" />}>
            <FileArchive className="size-3.5" /> Baixar (.zip)
          </Button>
          {podeGerir && (
            <Button size="sm" variant="outline" onClick={() => setLoteAberto(true)}>
              <Upload className="size-3.5" /> Renovar selecionadas
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelecionadas(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {visiveis.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Nenhuma certidão." />
      ) : (
        <ul className="divide-y rounded-sm border">
          {visiveis.map((c) => {
            const status = statusCertidao(c.validade);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                {podeGerir && (
                  <Checkbox checked={selecionadas.has(c.id)} onCheckedChange={() => alternarSelecao(c.id)} aria-label={`Selecionar ${c.tipo}`} />
                )}
                <span className="font-medium">{c.tipo}</span>
                {c.descricao && <span className="text-muted-foreground">{c.descricao}</span>}
                {c.responsavelNome && <Badge variant="outline">{c.responsavelNome}</Badge>}
                {!c.arquivoNome && <Badge variant="outline" className="text-warning border-warning/40">sem arquivo</Badge>}
                <span className="ml-auto font-mono text-xs">{formatarData(c.validade)}</span>
                {badgeStatus(status)}
                {c.versoes.length > 0 && (
                  <span className="font-mono text-[10px] text-muted-foreground">{c.versoes.length} versão(ões)</span>
                )}
                <Button size="icon" variant="ghost" aria-label="Detalhes" title="Histórico e detalhes" onClick={() => setDetalhe(c)}>
                  <History className="size-4" />
                </Button>
                {c.arquivoNome && (
                  <a
                    href={`/api/certidoes/${c.id}/download`}
                    className="text-primary hover:text-primary/80"
                    title="Baixar"
                    aria-label={`Baixar ${c.tipo}`}
                  >
                    <Download className="size-4" />
                  </a>
                )}
                {podeGerir && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setUploadPara(c)}>
                      <Upload className="size-3.5" /> Nova versão
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditar(c)}>
                      <PenLine className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(c)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DetalheSheet certidao={detalhe} onClose={() => setDetalhe(null)} />
      <UploadVersaoDialog certidao={uploadPara} onClose={() => setUploadPara(null)} onOk={() => router.refresh()} />
      <EditarDialog certidao={editar} responsaveis={responsaveis} onClose={() => setEditar(null)} />
      <RenovacaoLoteDialog
        open={loteAberto}
        certidoes={certidoes.filter((c) => selecionadas.has(c.id))}
        onClose={() => setLoteAberto(false)}
        onOk={() => {
          setSelecionadas(new Set());
          router.refresh();
        }}
      />
      <CompartilharDialog
        open={compartilharAberto}
        onClose={() => setCompartilharAberto(false)}
        certidoes={certidoes}
        preSelecionadas={selecionadas}
        links={links}
      />
      <GerenciarTiposDialog open={tiposAberto} onClose={() => setTiposAberto(false)} tipos={tipos} />
    </div>
  );
}

function PainelVencimentos({
  panorama,
  filtro,
  onFiltro,
  total,
}: {
  panorama: PanoramaCompliance;
  filtro: "todas" | StatusCertidao | "sem_arquivo";
  onFiltro: (f: "todas" | StatusCertidao | "sem_arquivo") => void;
  total: number;
}) {
  const chips: { key: "todas" | StatusCertidao | "sem_arquivo"; label: string; n: number; cls: string }[] = [
    { key: "todas", label: "Todas", n: total, cls: "text-foreground" },
    { key: "vencida", label: "Vencidas", n: panorama.vencidas, cls: "text-destructive" },
    { key: "vence_em_breve", label: "Vence em breve", n: panorama.venceEmBreve, cls: "text-warning" },
    { key: "ok", label: "Ok", n: panorama.ok, cls: "text-success" },
    { key: "sem_arquivo", label: "Sem arquivo", n: panorama.semArquivo, cls: "text-muted-foreground" },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onFiltro(c.key)}
          className={`rounded-sm border px-2.5 py-1 text-xs ${filtro === c.key ? "border-primary bg-primary/10" : ""} ${c.cls}`}
        >
          {c.label} ({c.n})
        </button>
      ))}
    </div>
  );
}

function DetalheSheet({ certidao, onClose }: { certidao: Certidao | null; onClose: () => void }) {
  return (
    <Sheet open={!!certidao} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {certidao && (
          <>
            <SheetHeader>
              <SheetTitle>{certidao.tipo}</SheetTitle>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-4">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Histórico de versões</h3>
                {certidao.versoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma versão anterior.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Validade</TableHead>
                        <TableHead>Enviada em</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certidao.versoes.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>v{v.numero}</TableCell>
                          <TableCell>{formatarData(v.validade)}</TableCell>
                          <TableCell>{formatarDataHora(v.data)}</TableCell>
                          <TableCell className="text-right">
                            {v.arquivoNome && (
                              <a
                                href={`/api/certidoes/versoes/${v.id}/download`}
                                className="text-primary hover:text-primary/80"
                                title="Baixar esta versão"
                                aria-label={`Baixar versão ${v.numero}`}
                              >
                                <Download className="size-4" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Licitações que exigem esta certidão</h3>
                {certidao.licitacoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma.</p>
                ) : (
                  <ul className="space-y-1">
                    {certidao.licitacoes.map((l) => (
                      <li key={`${l.licitacaoId}-${l.exigencia}`} className="flex items-center gap-2 text-sm">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{l.titulo}</span>
                        <Badge variant="outline" className={l.atendido ? "text-success border-success/40" : "text-warning border-warning/40"}>
                          {l.atendido ? "atendido" : "pendente"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Auditoria</h3>
                {certidao.auditoria.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {certidao.auditoria.map((a) => (
                      <li key={a.id} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{a.acao}</span>
                        {a.usuario && <> — {a.usuario}</>} · {formatarDataHora(a.data)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function UploadVersaoDialog({
  certidao,
  onClose,
  onOk,
}: {
  certidao: Certidao | null;
  onClose: () => void;
  onOk: () => void;
}) {
  const [validade, setValidade] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [sugerida, setSugerida] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSugerida(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setLendo(true);
    try {
      const texto = await lerTextoPdf(file);
      const achada = extrairValidadeDoTexto(texto);
      if (achada) {
        setSugerida(achada);
        setValidade((atual) => atual || achada);
      }
    } catch {
      // PDF escaneado, corrompido ou falha ao carregar o leitor — sem sugestão, upload segue normal.
    } finally {
      setLendo(false);
    }
  }

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!certidao || !file || !validade) return toast.error("Selecione o arquivo e informe a validade.");
    setEnviando(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("validade", validade);
    const res = await fetch(`/api/certidoes/${certidao.id}/versao`, { method: "POST", body: fd });
    const data = await res.json();
    setEnviando(false);
    if (res.ok) {
      toast.success(`Versão v${data.numero} enviada.`);
      setValidade("");
      setSugerida(null);
      onClose();
      onOk();
    } else toast.error(data.error ?? "Falha no upload.");
  }

  return (
    <Dialog open={!!certidao} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova versão — {certidao?.tipo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Arquivo (PDF)</Label>
            <input ref={fileRef} type="file" accept="application/pdf" className="w-full text-sm" onChange={onFileChange} />
            {lendo && <p className="text-xs text-muted-foreground">Lendo PDF em busca da validade…</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Nova validade</Label>
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            {sugerida && validade === sugerida && (
              <p className="text-xs text-success">Validade detectada automaticamente no PDF — confira antes de enviar.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarDialog({
  certidao,
  responsaveis,
  onClose,
}: {
  certidao: Certidao | null;
  responsaveis: Responsavel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [descricao, setDescricao] = useState("");
  const [responsavelId, setResponsavelId] = useState(NONE);

  function abrirComDados(c: Certidao) {
    setDescricao(c.descricao ?? "");
    setResponsavelId(c.responsavelId ?? NONE);
  }

  function salvar() {
    if (!certidao) return;
    start(async () => {
      const r = await editarCertidao({
        id: certidao.id,
        descricao,
        responsavelId: responsavelId === NONE ? "" : responsavelId,
      });
      if (r.ok) {
        toast.success("Certidão atualizada.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={!!certidao}
      onOpenChange={(o) => {
        if (o && certidao) abrirComDados(certidao);
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar — {certidao?.tipo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={responsavelId} onValueChange={(v) => setResponsavelId(v ?? NONE)}>
              <SelectTrigger>
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem responsável</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenovacaoLoteDialog({
  open,
  certidoes,
  onClose,
  onOk,
}: {
  open: boolean;
  certidoes: Certidao[];
  onClose: () => void;
  onOk: () => void;
}) {
  const [validades, setValidades] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const filesRef = useRef<Record<string, File | null>>({});

  async function enviarTudo() {
    setEnviando(true);
    let ok = 0;
    let falhas = 0;
    for (const c of certidoes) {
      const file = filesRef.current[c.id];
      const validade = validades[c.id];
      if (!file || !validade) continue;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("validade", validade);
      const res = await fetch(`/api/certidoes/${c.id}/versao`, { method: "POST", body: fd });
      if (res.ok) ok++;
      else falhas++;
    }
    setEnviando(false);
    if (ok > 0) toast.success(`${ok} certidão(ões) renovada(s).`);
    if (falhas > 0) toast.error(`${falhas} falharam.`);
    setValidades({});
    filesRef.current = {};
    onClose();
    onOk();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Renovação em lote</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50svh] space-y-3 overflow-y-auto">
          {certidoes.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-sm border p-2">
              <span className="min-w-0 truncate text-sm font-medium">{c.tipo}</span>
              <input
                type="file"
                accept="application/pdf"
                className="w-40 text-xs"
                onChange={(e) => (filesRef.current[c.id] = e.target.files?.[0] ?? null)}
              />
              <Input
                type="date"
                className="w-36"
                value={validades[c.id] ?? ""}
                onChange={(e) => setValidades((v) => ({ ...v, [c.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviarTudo} disabled={enviando}>
            Enviar todas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompartilharDialog({
  open,
  onClose,
  certidoes,
  preSelecionadas,
  links,
}: {
  open: boolean;
  onClose: () => void;
  certidoes: Certidao[];
  preSelecionadas: Set<string>;
  links: LinkPublico[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [expiraEm, setExpiraEm] = useState("");
  const [gerado, setGerado] = useState<string | null>(null);

  function abrir() {
    setMarcadas(new Set(preSelecionadas));
    setGerado(null);
  }

  function alternar(id: string) {
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function gerar() {
    if (marcadas.size === 0) return toast.error("Selecione ao menos uma certidão.");
    start(async () => {
      const r = await criarLinkCertidoes({
        certidaoIds: [...marcadas],
        expiraEm: expiraEm ? new Date(expiraEm).toISOString() : null,
      });
      if (r.ok) {
        const url = `${window.location.origin}/p/certidoes/${r.data.token}`;
        setGerado(url);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function copiar(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado.");
  }

  function revogar(id: string) {
    start(async () => {
      const r = await revogarLinkCertidoes({ id });
      if (r.ok) {
        toast.success("Link revogado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) abrir();
        else onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartilhar certidões (link público)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-sm border p-2">
            {certidoes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                <Checkbox checked={marcadas.has(c.id)} onCheckedChange={() => alternar(c.id)} />
                {c.tipo}
              </label>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Expira em (opcional)</Label>
              <Input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
            </div>
            <Button onClick={gerar} disabled={pending}>
              Gerar link
            </Button>
          </div>
          {gerado && (
            <div className="flex items-center gap-2 rounded-sm border bg-muted/40 p-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono">{gerado}</span>
              <Button size="icon" variant="ghost" aria-label="Copiar link" onClick={() => copiar(gerado)}>
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}

          {links.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Links gerados</p>
              <ul className="space-y-1.5">
                {links.map((l) => {
                  const expirado = l.expiraEm ? new Date(l.expiraEm).getTime() <= Date.now() : false;
                  const vigente = l.ativo && !expirado;
                  return (
                    <li key={l.id} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className={vigente ? "text-success border-success/40" : "text-muted-foreground"}>
                        {vigente ? "ativo" : l.ativo ? "expirado" : "revogado"}
                      </Badge>
                      <span className="text-muted-foreground">{l.certidaoIds.length} certidão(ões) · {formatarData(l.createdAt)}</span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Copiar link"
                          onClick={() => copiar(`${window.location.origin}/p/certidoes/${l.token}`)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                        {l.ativo && (
                          <Button size="icon" variant="ghost" aria-label="Revogar link" onClick={() => revogar(l.id)} disabled={pending}>
                            <Ban className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GerenciarTiposDialog({ open, onClose, tipos }: { open: boolean; onClose: () => void; tipos: Tipo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [novoObrigatoria, setNovoObrigatoria] = useState(false);

  function adicionar() {
    if (!novoNome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = await criarTipoCertidao({ nome: novoNome, obrigatoria: novoObrigatoria });
      if (r.ok) {
        toast.success("Tipo criado.");
        setNovoNome("");
        setNovoObrigatoria(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(t: Tipo) {
    start(async () => {
      const r = await excluirTipoCertidao({ id: t.id });
      if (r.ok) {
        toast.success("Tipo excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar tipos de certidão</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50svh] space-y-1.5 overflow-y-auto">
          {tipos.map((t) => (
            <TipoRow key={t.id} tipo={t} pending={pending} onExcluir={() => excluir(t)} />
          ))}
        </div>
        <div className="flex items-end gap-2 border-t pt-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Novo tipo</Label>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome do tipo…" />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
            <Checkbox checked={novoObrigatoria} onCheckedChange={(v) => setNovoObrigatoria(v === true)} />
            Obrigatória
          </label>
          <Button size="sm" onClick={adicionar} disabled={pending}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TipoRow({
  tipo,
  pending,
  onExcluir,
}: {
  tipo: Tipo;
  pending: boolean;
  onExcluir: () => void;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState(tipo.nome);
  const [obrigatoria, setObrigatoria] = useState(tipo.obrigatoria);
  const sujo = nome !== tipo.nome || obrigatoria !== tipo.obrigatoria;

  async function salvar() {
    if (!nome.trim()) return toast.error("Informe o nome.");
    setSalvando(true);
    const r = await editarTipoCertidao({ id: tipo.id, nome, obrigatoria });
    setSalvando(false);
    if (r.ok) {
      toast.success("Tipo atualizado.");
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="flex items-center gap-2 rounded-sm border p-1.5">
      <Input className="h-7 flex-1" value={nome} onChange={(e) => setNome(e.target.value)} />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <Checkbox checked={obrigatoria} onCheckedChange={(v) => setObrigatoria(v === true)} />
        Obrigatória
      </label>
      {sujo && (
        <Button size="icon-sm" variant="ghost" aria-label="Salvar" onClick={salvar} disabled={salvando}>
          <PenLine className="size-3.5" />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" aria-label="Excluir tipo" onClick={onExcluir} disabled={pending}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
