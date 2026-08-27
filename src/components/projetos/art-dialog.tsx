"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Upload } from "lucide-react";
import { salvarArt, novaVersaoArt, anexarArquivoArt } from "@/modules/projetos/art/actions";
import { TIPOS_ART, SITUACOES_ART } from "@/modules/projetos/art/service";
import type { ArtListItem } from "@/modules/projetos/art/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ResponsavelOpcao } from "./arts-view";

const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Valor do seletor de responsável quando o usuário quer digitar nome/registro à mão. */
const AVULSO = "__avulso__";

type Props = {
  projetoId: string;
  /** Null = criando. */
  art: ArtListItem | null;
  responsaveis: ResponsavelOpcao[];
  disciplinas: { id: string; nome: string }[];
  /** ART cancelada/baixada não recebe nova versão. */
  podeNovaVersao: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ArtDialog({ projetoId, art, responsaveis, disciplinas, podeNovaVersao, open, onOpenChange }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  /** Modo "nova versão": em vez de sobrescrever, arquiva o estado atual no histórico. */
  const [modoVersao, setModoVersao] = useState(false);
  const [observacao, setObservacao] = useState("");

  const [f, setF] = useState({
    tipo: art?.tipo ?? "ART",
    numero: art?.numero ?? "",
    descricao: art?.descricao ?? "",
    situacao: art?.situacao === "substituida" ? "registrada" : art?.situacao ?? "registrada",
    emitidaEm: art?.emitidaEm ?? "",
    valor: art?.valor ?? null,
    disciplinaId: art?.disciplina?.id ?? "",
    responsavelSel: art?.responsavelUserId ?? (art ? AVULSO : responsaveis[0]?.id ?? AVULSO),
    responsavelNome: art?.responsavelUserId ? "" : art?.responsavelNome ?? "",
    responsavelRegistro: art?.responsavelUserId ? "" : art?.responsavelRegistro ?? "",
  });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  /** Escolher uma pessoa preenche os campos livres como ponto de partida — que segue editável. */
  function escolherResponsavel(valor: string) {
    const pessoa = responsaveis.find((r) => r.id === valor);
    setF((p) => ({
      ...p,
      responsavelSel: valor,
      responsavelNome: pessoa ? pessoa.nome : p.responsavelNome,
      responsavelRegistro: pessoa ? pessoa.registro : p.responsavelRegistro,
    }));
  }

  async function enviarArquivo(artId: string) {
    if (!arquivo) return;
    const fd = new FormData();
    fd.append("file", arquivo);
    const res = await fetch("/api/projetos/art", { method: "POST", body: fd });
    if (!res.ok) {
      toast.warning("ART salva, mas o PDF não pôde ser enviado.");
      return;
    }
    const meta = (await res.json()) as { caminho: string; nomeArquivo: string };
    await anexarArquivoArt({ id: artId, caminho: meta.caminho, nomeArquivo: meta.nomeArquivo });
  }

  function salvar() {
    setErro("");
    start(async () => {
      if (modoVersao && art) {
        const r = await novaVersaoArt({
          id: art.id,
          numero: f.numero,
          situacao: f.situacao as "rascunho" | "registrada" | "baixada" | "cancelada",
          emitidaEm: f.emitidaEm,
          observacao,
        });
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        await enviarArquivo(art.id);
        toast.success(`Versão ${r.data.versao} registrada.`);
      } else {
        const r = await salvarArt({
          id: art?.id,
          projetoId,
          disciplinaId: f.disciplinaId,
          tipo: f.tipo as "ART" | "RRT" | "TRT",
          numero: f.numero,
          descricao: f.descricao,
          situacao: f.situacao as "rascunho" | "registrada" | "baixada" | "cancelada",
          emitidaEm: f.emitidaEm,
          valor: f.valor,
          responsavelUserId: f.responsavelSel === AVULSO ? "" : f.responsavelSel,
          responsavelNome: f.responsavelNome,
          responsavelRegistro: f.responsavelRegistro,
        });
        if (!r.ok) {
          setErro(r.error);
          return;
        }
        await enviarArquivo(r.data.id);
        toast.success(art ? "ART atualizada." : "ART cadastrada.");
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  const avulso = f.responsavelSel === AVULSO;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {!art ? "Nova ART" : modoVersao ? "Nova versão da ART" : "Editar ART"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {art && podeNovaVersao && (
            <label className="flex items-start gap-2 rounded-sm border border-dashed p-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={modoVersao}
                onChange={(e) => setModoVersao(e.target.checked)}
              />
              <span>
                Registrar como <strong>nova versão</strong>
                <span className="block text-xs text-muted-foreground">
                  A ART atual vai para o histórico marcada como substituída, e estes dados passam a valer.
                  Deixe desmarcado para apenas corrigir os dados desta ART.
                </span>
              </span>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Tipo">
              <select className={selectCls} value={f.tipo} onChange={(e) => set("tipo", e.target.value)} disabled={modoVersao}>
                {TIPOS_ART.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </Campo>
            <Campo label="Número">
              <Input value={f.numero} onChange={(e) => set("numero", e.target.value)} />
            </Campo>
            <Campo label="Situação">
              <select className={selectCls} value={f.situacao} onChange={(e) => set("situacao", e.target.value)}>
                {SITUACOES_ART.filter((s) => s.valor !== "substituida").map((s) => (
                  <option key={s.valor} value={s.valor}>{s.label}</option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Emissão">
              <Input type="date" value={f.emitidaEm} onChange={(e) => set("emitidaEm", e.target.value)} />
            </Campo>
            <Campo label="Disciplina">
              <select
                className={selectCls}
                value={f.disciplinaId}
                onChange={(e) => set("disciplinaId", e.target.value)}
                disabled={modoVersao}
              >
                <option value="">— projeto todo —</option>
                {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Taxa (R$)">
              <InputMoeda value={f.valor} onChange={(v) => set("valor", v)} disabled={modoVersao} />
            </Campo>
          </div>

          {!modoVersao && (
            <>
              <Campo label="Descrição">
                <Input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: projeto estrutural — execução" />
              </Campo>

              <div className="space-y-3 rounded-sm border p-3">
                <Campo label="Responsável técnico">
                  <select className={selectCls} value={f.responsavelSel} onChange={(e) => escolherResponsavel(e.target.value)}>
                    {responsaveis.map((r) => (
                      <option key={r.id} value={r.id}>{r.nome} — {r.registro}</option>
                    ))}
                    <option value={AVULSO}>Outro (digitar)</option>
                  </select>
                </Campo>
                {avulso && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Nome">
                      <Input value={f.responsavelNome} onChange={(e) => set("responsavelNome", e.target.value)} />
                    </Campo>
                    <Campo label="Registro">
                      <Input value={f.responsavelRegistro} onChange={(e) => set("responsavelRegistro", e.target.value)} placeholder="CREA-SP 123456" />
                    </Campo>
                  </div>
                )}
                {!avulso && (
                  <p className="text-xs text-muted-foreground">
                    Nome e registro vêm da ficha da pessoa — para alterá-los, edite o cadastro em RH.
                  </p>
                )}
              </div>
            </>
          )}

          {modoVersao && (
            <Campo label="Motivo da nova versão">
              <textarea
                className="w-full rounded-sm border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: substituída por alteração de área do projeto."
                rows={2}
              />
            </Campo>
          )}

          <Campo label={modoVersao ? "PDF da nova versão (opcional)" : "PDF da ART (opcional)"}>
            <div className="flex items-center gap-2">
              <Input type="file" accept="application/pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              {arquivo && <Upload className="size-4 shrink-0 text-muted-foreground" />}
            </div>
            {art?.arquivoNome && !arquivo && (
              <p className="mt-1 text-xs text-muted-foreground">Atual: {art.arquivoNome}</p>
            )}
          </Campo>

          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending || !f.numero.trim() || (modoVersao && observacao.trim().length < 3)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
