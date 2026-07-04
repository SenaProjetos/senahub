"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Layers, FileStack, FileDown, Tags } from "lucide-react";
import {
  criarPrancha,
  editarPrancha,
  excluirPrancha,
  proporPranchas,
  salvarPranchasLote,
} from "@/modules/projetos/pranchas/actions";
import type {
  PranchasDisciplina,
  PranchaItem,
  CatalogosPrancha,
  PranchaCatalogoRow,
} from "@/modules/projetos/pranchas/queries";
import { ListaMestreConfigView } from "@/components/configuracoes/lista-mestre-config-view";
import { NomenclaturaForm } from "@/components/projetos/nomenclatura-form";
import { codigoPrancha, revisaoLabel } from "@/modules/projetos/pranchas/codigo";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Catalogo = CatalogosPrancha;
type FormState = { folha: string; tipo: string; fase: string; numeracao: string; revisao: string; conteudo: string };

const VAZIO: FormState = { folha: "", tipo: "", fase: "", numeracao: "", revisao: "0", conteudo: "" };

function primeira(sigla: { sigla: string }[]): string {
  return sigla[0]?.sigla ?? "";
}

export function ListaMestreView({
  projeto,
  disciplinas,
  catalogos,
  catalogosProjeto,
  nomenclaturaProjeto,
  nomenclaturaGlobal,
  podeGerir,
  podeConfigSiglas,
}: {
  projeto: { id: string; codigo: string; nome: string };
  disciplinas: PranchasDisciplina[];
  catalogos: Catalogo;
  catalogosProjeto: PranchaCatalogoRow[];
  nomenclaturaProjeto: { exigir: boolean; padrao: string; definido: boolean };
  nomenclaturaGlobal: { exigir: boolean; padrao: string };
  podeGerir: boolean;
  podeConfigSiglas: boolean;
}) {
  const [siglasOpen, setSiglasOpen] = useState(false);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projetos/${projeto.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> {formatarCodigo(projeto.codigo)} · {projeto.nome}
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Lista Mestre</h2>
          <p className="text-sm text-muted-foreground">
            Índice de documentos por disciplina. Código: {"{projeto}-{disciplina}-{fase}-{nº}-{tipo}[-Rnn]"}.
          </p>
        </div>
        {podeConfigSiglas && (
          <Button variant="outline" size="sm" onClick={() => setSiglasOpen(true)}>
            <Tags className="size-3.5" /> Siglas do projeto
          </Button>
        )}
      </div>

      <Dialog open={siglasOpen} onOpenChange={setSiglasOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Siglas deste projeto</DialogTitle>
            <DialogDescription>
              Siglas de folha/tipo/fase válidas apenas neste projeto — somam-se às globais nos seletores. As globais
              se editam em Configurações → Lista Mestre.
            </DialogDescription>
          </DialogHeader>
          <NomenclaturaForm
            escopo={{ projetoId: projeto.id }}
            inicial={nomenclaturaProjeto}
            global={nomenclaturaGlobal}
          />
          <ListaMestreConfigView catalogos={catalogosProjeto} projetoId={projeto.id} />
        </DialogContent>
      </Dialog>

      {disciplinas.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState icon={Layers} title="Nenhuma disciplina" description="Cadastre disciplinas no projeto para montar a Lista Mestre." />
          </CardContent>
        </Card>
      ) : (
        disciplinas.map((d) => (
          <DisciplinaListaMestre
            key={d.id}
            projetoCodigo={formatarCodigo(projeto.codigo)}
            disciplina={d}
            catalogos={catalogos}
            podeGerir={podeGerir}
          />
        ))
      )}
    </div>
  );
}

function DisciplinaListaMestre({
  projetoCodigo,
  disciplina,
  catalogos,
  podeGerir,
}: {
  projetoCodigo: string;
  disciplina: PranchasDisciplina;
  catalogos: Catalogo;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dlg, setDlg] = useState<{ p: PranchaItem | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<FormState>(VAZIO);

  function abrir(p: PranchaItem | null) {
    if (!podeGerir) return;
    setForm(
      p
        ? { folha: p.folha, tipo: p.tipo, fase: p.fase, numeracao: String(p.numeracao), revisao: String(p.revisao), conteudo: p.conteudo ?? "" }
        : {
            ...VAZIO,
            folha: primeira(catalogos.folha),
            tipo: primeira(catalogos.tipo),
            fase: primeira(catalogos.fase),
            numeracao: String((disciplina.pranchas.at(-1)?.numeracao ?? 0) + 1),
          },
    );
    setDlg({ p });
  }

  const codigoPreview = useMemo(
    () =>
      codigoPrancha({
        projetoCodigo,
        siglaDisciplina: disciplina.sigla,
        fase: form.fase || "?",
        numeracao: Number(form.numeracao) || 0,
        tipo: form.tipo || "?",
        revisao: Number(form.revisao) || 0,
      }),
    [projetoCodigo, disciplina.sigla, form.fase, form.numeracao, form.tipo, form.revisao],
  );

  function salvar() {
    if (!dlg) return;
    if (!form.folha || !form.tipo || !form.fase) {
      toast.error("Preencha folha, tipo e fase.");
      return;
    }
    const payload = {
      disciplinaId: disciplina.id,
      folha: form.folha,
      tipo: form.tipo,
      fase: form.fase,
      numeracao: Number(form.numeracao) || 0,
      revisao: Number(form.revisao) || 0,
      conteudo: form.conteudo || undefined,
    };
    start(async () => {
      const r = dlg.p ? await editarPrancha({ id: dlg.p.id, ...payload }) : await criarPrancha(payload);
      if (r.ok) {
        toast.success("Folha salva.");
        setDlg(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirPrancha({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {disciplina.nome}
          {disciplina.sigla && <Badge variant="outline" className="font-mono">{disciplina.sigla}</Badge>}
        </CardTitle>
        {podeGerir && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <FileDown className="size-3.5" /> Importar do pacote A
            </Button>
            <Button size="sm" variant="outline" onClick={() => abrir(null)}>
              <Plus className="size-3.5" /> Nova folha
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {disciplina.pranchas.length === 0 ? (
          <EmptyState icon={FileStack} title="Sem folhas" description="Cadastre folhas manualmente ou importe pelos nomes dos PDFs do pacote A." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Código</th>
                  <th className="px-4 py-2">Fase</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Folha</th>
                  <th className="px-4 py-2 text-center">Nº</th>
                  <th className="px-4 py-2 text-center">Rev.</th>
                  <th className="px-4 py-2">Conteúdo</th>
                  {podeGerir && <th className="px-4 py-2 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {disciplina.pranchas.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2 font-mono text-xs text-primary">{p.codigo}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.fase}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.tipo}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.folha}</td>
                    <td className="px-4 py-2 text-center font-mono text-xs">{String(p.numeracao).padStart(4, "0")}</td>
                    <td className="px-4 py-2 text-center font-mono text-xs">{revisaoLabel(p.revisao)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.conteudo || "—"}</td>
                    {podeGerir && (
                      <td className="px-4 py-2 text-right">
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => abrir(p)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(p.id)} disabled={pending}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Nova / editar folha */}
      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dlg?.p ? "Editar folha" : "Nova folha"}</DialogTitle>
            <DialogDescription className="font-mono text-xs text-primary">{codigoPreview}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <SelectCampo label="Fase" value={form.fase} onChange={(v) => setForm({ ...form, fase: v })} itens={catalogos.fase} />
            <SelectCampo label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })} itens={catalogos.tipo} />
            <SelectCampo label="Folha" value={form.folha} onChange={(v) => setForm({ ...form, folha: v })} itens={catalogos.folha} />
            <div className="space-y-1.5">
              <Label>Numeração</Label>
              <Input
                type="number"
                min={0}
                value={form.numeracao}
                onChange={(e) => setForm({ ...form, numeracao: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Revisão</Label>
              <Input
                type="number"
                min={0}
                value={form.revisao}
                onChange={(e) => setForm({ ...form, revisao: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Conteúdo (opcional)</Label>
              <Input value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} placeholder="Planta baixa — Pavimento Tipo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        disciplina={disciplina}
        projetoCodigo={projetoCodigo}
      />
    </Card>
  );
}

function SelectCampo({
  label,
  value,
  onChange,
  itens,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  itens: { sigla: string; nome: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione…" />
        </SelectTrigger>
        <SelectContent>
          {itens.length === 0 ? (
            <SelectItem value="__vazio" disabled>Nenhuma sigla cadastrada</SelectItem>
          ) : (
            itens.map((c) => (
              <SelectItem key={c.sigla} value={c.sigla}>
                <span className="font-mono">{c.sigla}</span> — {c.nome}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

type Proposto = { folha: string; tipo: string; fase: string; numeracao: number; revisao: number; conteudo: string; nomeArquivo: string };

function ImportDialog({
  open,
  onOpenChange,
  disciplina,
  projetoCodigo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disciplina: PranchasDisciplina;
  projetoCodigo: string;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [salvando, start] = useTransition();
  const [proposta, setProposta] = useState<{
    propostos: Proposto[];
    jaExistentes: string[];
    semPadrao: string[];
    totalPdfs: number;
  } | null>(null);

  async function carregar() {
    setCarregando(true);
    setProposta(null);
    const r = await proporPranchas({ disciplinaId: disciplina.id });
    setCarregando(false);
    if (r.ok) setProposta(r.data);
    else toast.error(r.error);
  }

  function abrir(o: boolean) {
    onOpenChange(o);
    if (o) carregar();
    else setProposta(null);
  }

  function salvar() {
    if (!proposta || proposta.propostos.length === 0) return;
    start(async () => {
      const r = await salvarPranchasLote({
        disciplinaId: disciplina.id,
        pranchas: proposta.propostos.map((p) => ({
          folha: p.folha,
          tipo: p.tipo,
          fase: p.fase,
          numeracao: p.numeracao,
          revisao: p.revisao,
          conteudo: p.conteudo || undefined,
        })),
      });
      if (r.ok) {
        toast.success(`${r.data.total} folha(s) importada(s).`);
        onOpenChange(false);
        setProposta(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar do pacote A — {disciplina.nome}</DialogTitle>
          <DialogDescription>
            Lê os PDFs enviados em Pranchas (pacote A) e propõe folhas a partir dos nomes no padrão
            {" "}<span className="font-mono">{"{projeto}-{disc}-{fase}-{nº}-{tipo}[-Rnn]"}</span>.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Lendo arquivos…</p>
        ) : !proposta ? (
          <p className="py-6 text-center text-sm text-muted-foreground">—</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {proposta.totalPdfs} PDF(s) no pacote A · {proposta.propostos.length} nova(s) ·{" "}
              {proposta.jaExistentes.length} já existente(s) · {proposta.semPadrao.length} fora do padrão.
            </p>

            {proposta.propostos.length > 0 ? (
              <div className="overflow-x-auto rounded-sm border">
                <table className="w-full text-sm">
                  <thead className="border-b text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Arquivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {proposta.propostos.map((p, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-1.5 font-mono text-xs text-primary">
                          {codigoPrancha({
                            projetoCodigo,
                            siglaDisciplina: disciplina.sigla,
                            fase: p.fase,
                            numeracao: p.numeracao,
                            tipo: p.tipo,
                            revisao: p.revisao,
                          })}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{p.nomeArquivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma folha nova a importar.</p>
            )}

            {proposta.semPadrao.length > 0 && (
              <div className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-xs">
                <p className="mb-1 font-medium text-warning">Fora do padrão (ignorados):</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {proposta.semPadrao.map((n) => (
                    <li key={n} className="truncate">{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !proposta || proposta.propostos.length === 0}>
            {salvando ? "Importando…" : `Importar ${proposta?.propostos.length ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
