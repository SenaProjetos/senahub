"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Building2, FileUp, Loader2 } from "lucide-react";
import { salvarModeloEap } from "@/modules/planejamento/modelos/actions";
import type { EstruturaModelo } from "@/modules/planejamento/modelos/estrutura";
import type { Conferencia, ParDeNome } from "@/modules/planejamento/modelos/mapeamento";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type Opcoes = {
  disciplinas: { id: string; nome: string }[];
  fases: { id: string; nome: string; sigla: string | null }[];
};

type Previa = {
  titulo: string | null;
  arquivoNome: string;
  estrutura: EstruturaModelo;
  conferencia: Conferencia;
  opcoes: Opcoes;
};

/** Valor do seletor de cada nome do arquivo. */
const AGRUPAMENTO = "__agrupamento";
const chaveFase = (id: string) => `fase:${id}`;
const chaveDisciplina = (id: string) => `disc:${id}`;

/**
 * Importar um modelo de EAP do MS Project (decisão #5), em três passos na mesma janela: escolher o
 * arquivo, CONFERIR o que o sistema entendeu e dar nome ao modelo.
 *
 * A conferência é o miolo: o casamento de nome é palpite. No arquivo da casa, "FUNDAÇÃO" acerta
 * "Fundações" por parecença, mas "GLP", "TELECOMUNICAÇÕES" e "SEGURANÇA E ALARME" não têm par nenhum —
 * e linha sem disciplina não herda responsável nem fecha marco de fase, em silêncio. Então nada é
 * gravado sem alguém olhar.
 *
 * O arquivo NÃO sobe por Server Action (o XML da casa tem 966 KB e o limite é 1 MB): vai por multipart
 * para `/api/planejamento/modelos/previa`, que só lê. O que a action grava é a estrutura conferida.
 */
export function ImportarModeloDialog({ tiposEmpreendimento }: { tiposEmpreendimento: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [gravando, start] = useTransition();
  const inputArquivo = useRef<HTMLInputElement>(null);

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [terceiros, setTerceiros] = useState<Set<string>>(new Set());
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoId, setTipoId] = useState<string>("");

  function limpar() {
    setPrevia(null);
    setEscolha({});
    setTerceiros(new Set());
    setNome("");
    setDescricao("");
    setTipoId("");
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  async function lerArquivo(file: File) {
    setLendo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/planejamento/modelos/previa", { method: "POST", body: form });
      const json = await resp.json();
      if (!resp.ok) {
        toast.error(typeof json?.error === "string" ? json.error : "Não foi possível ler o arquivo.");
        return;
      }
      const p = json as Previa;
      setPrevia(p);
      setNome(p.titulo?.trim() || file.name.replace(/\.xml$/i, ""));
      // A escolha começa no que o sistema achou — inclusive "agrupamento" para quem não casou.
      const inicial: Record<string, string> = {};
      for (const f of p.conferencia.fases) inicial[f.chave] = f.catalogoId ? chaveFase(f.catalogoId) : AGRUPAMENTO;
      for (const d of p.conferencia.disciplinas) {
        inicial[d.chave] = d.catalogoId ? chaveDisciplina(d.catalogoId) : AGRUPAMENTO;
      }
      setEscolha(inicial);
      setTerceiros(new Set(p.conferencia.terceiros.map((t) => t.id)));
    } catch {
      toast.error("Falha ao enviar o arquivo.");
    } finally {
      setLendo(false);
    }
  }

  function gravar() {
    if (!previa) return;
    const mapaDisciplina: Record<string, string | null> = {};
    const mapaFase: Record<string, string | null> = {};
    for (const [chave, valor] of Object.entries(escolha)) {
      if (valor.startsWith("fase:")) {
        mapaFase[chave] = valor.slice(5);
        mapaDisciplina[chave] = null;
      } else if (valor.startsWith("disc:")) {
        mapaDisciplina[chave] = valor.slice(5);
        mapaFase[chave] = null;
      } else {
        mapaDisciplina[chave] = null;
        mapaFase[chave] = null;
      }
    }
    start(async () => {
      const r = await salvarModeloEap({
        nome,
        descricao: descricao.trim() || null,
        tipoEmpreendimentoId: tipoId || null,
        arquivoNome: previa.arquivoNome,
        estrutura: previa.estrutura,
        respostas: { mapaDisciplina, mapaFase, terceiros: [...terceiros] },
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Modelo "${nome}" gravado com ${r.data.totalLinhas} linhas.`);
      setAberto(false);
      limpar();
      router.refresh();
    });
  }

  const conf = previa?.conferencia;
  const semPar = conf ? [...conf.fases, ...conf.disciplinas].filter((p) => p.catalogoId == null).length : 0;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) limpar();
      }}
    >
      <Button onClick={() => setAberto(true)}>
        <FileUp className="size-3.5" /> Importar do MS Project
      </Button>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar modelo de EAP</DialogTitle>
          <DialogDescription>
            No MS Project: <strong>Arquivo → Salvar como → XML</strong>. Vem a estrutura, as durações e as
            dependências; datas, horas e pessoas não vêm (elas são do projeto, não do modelo).
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="arquivo-mspdi">Arquivo XML</Label>
            <Input
              id="arquivo-mspdi"
              ref={inputArquivo}
              type="file"
              accept=".xml,text/xml,application/xml"
              disabled={lendo || gravando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
            {lendo && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Lendo o arquivo…
              </p>
            )}
          </div>

          {conf && previa && (
            <>
              <div className="rounded-sm border bg-muted/30 px-3 py-2 text-xs">
                <strong>{conf.totais.linhas}</strong> linhas · <strong>{conf.totais.agrupamentos}</strong> agrupamentos ·{" "}
                <strong>{conf.totais.marcos}</strong> marcos · <strong>{conf.totais.vinculos}</strong> dependências ·{" "}
                <strong>{conf.totais.comDisciplina}</strong> linhas com disciplina
              </div>

              {semPar > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {semPar} nome(s) do arquivo não têm par no catálogo. Escolha o que cada um é — linha sem
                  disciplina não herda responsável nem fecha o marco da fase.
                </p>
              )}

              <div className="space-y-1.5">
                <Label>O que cada agrupamento do arquivo é</Label>
                <ul className="divide-y rounded-sm border">
                  {[...conf.fases, ...conf.disciplinas].map((par) => (
                    <LinhaDeNome
                      key={par.chave}
                      par={par}
                      opcoes={previa.opcoes}
                      valor={escolha[par.chave] ?? AGRUPAMENTO}
                      onChange={(v) => setEscolha((e) => ({ ...e, [par.chave]: v }))}
                    />
                  ))}
                </ul>
              </div>

              {conf.terceiros.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Etapas de terceiro</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Quem executa está fora da casa: a linha segura prazo, mas não gera card nem cobra hora.
                    Desmarque o que for trabalho da equipe.
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-sm border p-2">
                    {conf.terceiros.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          id={`terceiro-${t.id}`}
                          checked={terceiros.has(t.id)}
                          onCheckedChange={(v) =>
                            setTerceiros((s) => {
                              const novo = new Set(s);
                              if (v) novo.add(t.id);
                              else novo.delete(t.id);
                              return novo;
                            })
                          }
                        />
                        <label htmlFor={`terceiro-${t.id}`} className="cursor-pointer">
                          {t.nome}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {conf.avisos.length > 0 && (
                <details className="rounded-sm border px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium">O que o sistema ajustou ou ignorou ({conf.avisos.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                    {conf.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="modelo-nome">Nome do modelo</Label>
                  <Input id="modelo-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="modelo-tipo">Tipo de empreendimento</Label>
                  <Select value={tipoId} onValueChange={(v) => setTipoId(v ?? "")}>
                    <SelectTrigger id="modelo-tipo">
                      <SelectValue placeholder="Qualquer" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposEmpreendimento.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    O projeto desse tipo passa a sugerir este modelo.
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelo-descricao">Descrição (opcional)</Label>
                <textarea
                  id="modelo-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Ex.: residência unifamiliar, sem compatibilização"
                  className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                />
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={gravar} disabled={!previa || gravando || nome.trim().length < 2}>
            <Building2 className="size-3.5" /> Gravar modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Uma linha da conferência: o nome do arquivo e o que ele vira. Top-level (ADR-0002). */
function LinhaDeNome({
  par,
  opcoes,
  valor,
  onChange,
}: {
  par: ParDeNome;
  opcoes: Opcoes;
  valor: string;
  onChange: (v: string) => void;
}) {
  const rotuloComo: Record<ParDeNome["como"], string> = {
    exato: "nome igual",
    sigla: "pela sigla",
    parecido: "nome parecido",
    lembrado: "como na última importação",
    sem_par: "sem par no catálogo",
  };
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{par.origem}</span>
        <span className="text-[11px] text-muted-foreground">
          {par.linhas} linha(s) · {rotuloComo[par.como]}
        </span>
      </span>
      <Select value={valor} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-8 w-60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AGRUPAMENTO} className="text-xs">
            Agrupamento (nem fase, nem disciplina)
          </SelectItem>
          <SelectGroup>
            <SelectLabel>Fase</SelectLabel>
            {opcoes.fases.map((f) => (
              <SelectItem key={f.id} value={chaveFase(f.id)} className="text-xs">
                {f.sigla ? `${f.sigla} — ${f.nome}` : f.nome}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Disciplina</SelectLabel>
            {opcoes.disciplinas.map((d) => (
              <SelectItem key={d.id} value={chaveDisciplina(d.id)} className="text-xs">
                {d.nome}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </li>
  );
}
