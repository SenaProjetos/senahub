"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Download, FileText } from "lucide-react";
import { adicionarDocumentoFuncionario, removerDocumentoFuncionario } from "@/modules/rh/funcionarios/actions";
import { conferirDocumento, definirValidadeDocumento, removerMeuDocumento } from "@/modules/rh/documentos/actions";
import { itensDoDocumento } from "@/modules/rh/documentos/acoes";
import { situacaoValidade, TIPO_DOC_LABEL, TIPOS_COM_VALIDADE, TIPOS_DOC, type TipoDoc } from "@/modules/rh/documentos/regras";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PreviewPdfButton } from "@/components/pdf/preview-pdf-button";
import { dataCurta } from "@/lib/dias-iso";

export type DocumentoItem = {
  id: string; tipo: string; nome: string; nomeArquivo: string; mime: string; tamanho: number; criadoEm: string;
  validadeEm: string | null; conferido: boolean; enviadoPelaPessoa: boolean;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Documentos de uma pessoa (ficha 360 e Minha conta). Ver e baixar sempre. RH (`podeEditar`) anexa,
 * define validade, confere e remove. A própria pessoa (`self`) envia os seus — ficam "aguardando
 * conferência" e só ela os remove até o RH conferir. Validade: F5 (60/30/7 dias, só alerta).
 */
export function DocumentosEditor({
  pessoaId,
  documentos,
  podeEditar,
  self = false,
}: {
  pessoaId: string;
  documentos: DocumentoItem[];
  podeEditar: boolean;
  self?: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [docTipo, setDocTipo] = useState<TipoDoc>("contrato");
  const [docNome, setDocNome] = useState("");
  const [docValidade, setDocValidade] = useState("");
  const [busy, setBusy] = useState(false);
  const [validade, setValidade] = useState<{ id: string; valor: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modo = podeEditar ? "rh" : self ? "self" : "leitura";
  const podeEnviar = podeEditar || self;
  const hoje = hojeLocal();

  async function enviar() {
    const file = fileRef.current?.files?.[0];
    if (!docNome.trim() || !file) {
      toast.error("Informe o nome e selecione um arquivo.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (self && !podeEditar) {
        // A pessoa: a rota guarda o arquivo E cria o registro (nenhum caminho vem do navegador).
        fd.append("tipo", docTipo);
        fd.append("nome", docNome.trim());
        if (docValidade) fd.append("validadeEm", docValidade);
        const res = await fetch("/api/rh/meus-documentos", { method: "POST", body: fd });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error ?? "Falha no envio.");
        toast.success("Documento enviado. O RH vai conferir.");
      } else {
        const res = await fetch("/api/rh/funcionarios/documentos", { method: "POST", body: fd });
        const meta = await res.json();
        if (!res.ok) throw new Error(meta.error ?? "Falha no upload.");
        const r = await adicionarDocumentoFuncionario({ userId: pessoaId, tipo: docTipo, nome: docNome, meta, validadeEm: docValidade || null });
        if (!r.ok) throw new Error(r.error);
        toast.success("Documento anexado.");
      }
      setDocNome("");
      setDocValidade("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function aoSelecionar(d: DocumentoItem, acao: AcaoItemAcao) {
    if (acao.id === "validade") {
      setValidade({ id: d.id, valor: d.validadeEm ?? "" });
      return;
    }
    if (acao.confirmar) {
      const ok = await confirm({ title: acao.confirmar.titulo, description: acao.confirmar.descricao, confirmLabel: acao.confirmar.rotuloConfirmar, variant: "destructive" });
      if (!ok) return;
    }
    start(async () => {
      const r =
        acao.id === "conferir"
          ? await conferirDocumento({ id: d.id })
          : acao.id === "remover"
            ? modo === "rh"
              ? await removerDocumentoFuncionario({ id: d.id })
              : await removerMeuDocumento({ id: d.id })
            : null;
      if (!r) return;
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function linha(d: DocumentoItem) {
    const acoes = itensDoDocumento(d, modo);
    const v = situacaoValidade(d.validadeEm, hoje);
    return (
      <LinhaComMenu key={d.id} itens={acoes} onSelect={(a) => aoSelecionar(d, a)}
        render={<li className="flex flex-wrap items-center justify-between gap-2 py-1.5 data-[popup-open]:bg-muted/30" />}>
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{d.nome}</span>
          <Badge variant="outline">{TIPO_DOC_LABEL[d.tipo as TipoDoc] ?? d.tipo}</Badge>
          {v.situacao !== "sem_validade" && d.validadeEm && (
            <span className={`text-xs ${v.situacao === "vencido" ? "font-medium text-destructive" : v.situacao === "vence_em_breve" ? "text-warning" : "text-muted-foreground"}`}>
              {v.situacao === "vencido" ? "venceu em " : "vale até "}
              {dataCurta(d.validadeEm)}
            </span>
          )}
          {!d.conferido && <span className="text-xs text-warning">aguardando conferência do RH</span>}
          <span className="font-mono text-xs text-muted-foreground">{fmtBytes(d.tamanho)}</span>
        </span>
        <span className="flex shrink-0 items-center">
          <PreviewPdfButton visivel={d.mime === "application/pdf"} url={`/api/rh/funcionarios/documentos/${d.id}/download?disposition=inline`} titulo={d.nome} />
          <Button size="icon" variant="ghost" aria-label="Baixar" render={<a href={`/api/rh/funcionarios/documentos/${d.id}/download`} />}>
            <Download className="size-3.5" />
          </Button>
          <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(d, a)} rotulo={`Ações do documento ${d.nome}`} />
        </span>
      </LinhaComMenu>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">Documentos ({documentos.length})</h4>
      {documentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y text-sm">{documentos.map(linha)}</ul>
      )}
      {podeEnviar && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Select value={docTipo} onValueChange={(v) => setDocTipo((v as TipoDoc) ?? "contrato")}>
            <SelectTrigger className="w-36" aria-label="Tipo do documento"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_DOC.map((t) => (
                <SelectItem key={t} value={t}>{TIPO_DOC_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Nome do documento" aria-label="Nome do documento" value={docNome} onChange={(e) => setDocNome(e.target.value)} className="min-w-32 flex-1" />
          {TIPOS_COM_VALIDADE.has(docTipo) && (
            <Input type="date" aria-label="Validade (opcional)" title="Validade (opcional)" value={docValidade} onChange={(e) => setDocValidade(e.target.value)} className="w-40" />
          )}
          <Input ref={fileRef} type="file" aria-label="Arquivo" className="w-44" />
          <Button size="sm" variant="outline" onClick={enviar} disabled={busy}>
            <Plus className="size-3.5" /> {busy ? "Enviando…" : podeEditar ? "Anexar" : "Enviar"}
          </Button>
          {self && !podeEditar && <p className="w-full text-xs text-muted-foreground">O RH confere o que você enviar. Até lá, você pode remover.</p>}
        </div>
      )}

      <Dialog open={!!validade} onOpenChange={(o) => !o && setValidade(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Validade do documento</DialogTitle></DialogHeader>
          {validade && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-validade">Vale até</Label>
              <Input id="doc-validade" type="date" value={validade.valor} onChange={(e) => setValidade({ ...validade, valor: e.target.value })} />
              <p className="text-xs text-muted-foreground">Vazio = o documento não vence. Avisos 60, 30 e 7 dias antes; vencido só alerta.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidade(null)}>Cancelar</Button>
            <Button disabled={pending} onClick={() => validade && start(async () => {
              const r = await definirValidadeDocumento({ id: validade.id, validadeEm: validade.valor || null });
              if (r.ok) { setValidade(null); router.refresh(); } else toast.error(r.error);
            })}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
