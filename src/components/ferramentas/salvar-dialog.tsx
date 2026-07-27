"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  salvarCalculo,
  listarProjetosParaFerramenta,
  listarDisciplinasParaFerramenta,
  dadosCabecalhoMemorial,
} from "@/modules/ferramentas/actions";

type Projeto = { id: string; codigo: string; nome: string };
type Disciplina = { id: string; nome: string };
type Art = { id: string; rotulo: string; responsavelNome: string | null; responsavelRegistro: string | null };

/** Valor do seletor de ART quando o memorial não cita nenhuma. */
const SEM_ART = "";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ferramenta: string;
  tituloSugerido: string;
  entradas: Record<string, unknown>;
  onSalvo: (id: string) => void;
};

export function SalvarDialog({
  open,
  onOpenChange,
  ferramenta,
  tituloSugerido,
  entradas,
  onSalvo,
}: Props) {
  const [titulo, setTitulo] = useState(tituloSugerido);
  const [projetoId, setProjetoId] = useState("");
  const [disciplinaId, setDisciplinaId] = useState("");
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [carregandoProjetos, setCarregandoProjetos] = useState(false);
  const [carregandoDisciplinas, setCarregandoDisciplinas] = useState(false);
  const [pending, startTransition] = useTransition();
  // Cabeçalho técnico do memorial (ART + responsável). Só faz sentido com projeto escolhido.
  const [arts, setArts] = useState<Art[]>([]);
  const [artId, setArtId] = useState(SEM_ART);
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelRegistro, setResponsavelRegistro] = useState("");

  // Carrega projetos ao abrir
  useEffect(() => {
    if (!open) return;
    setCarregandoProjetos(true);
    listarProjetosParaFerramenta({})
      .then((r) => {
        if (r.ok) setProjetos(r.data);
      })
      .finally(() => setCarregandoProjetos(false));
  }, [open]);

  // Carrega disciplinas ao selecionar projeto
  useEffect(() => {
    if (!projetoId) {
      setDisciplinas([]);
      setDisciplinaId("");
      return;
    }
    setCarregandoDisciplinas(true);
    listarDisciplinasParaFerramenta({ projetoId })
      .then((r) => {
        if (r.ok) setDisciplinas(r.data);
      })
      .finally(() => setCarregandoDisciplinas(false));
  }, [projetoId]);

  // ARTs do projeto + prefill do responsável a partir do cadastro de quem está salvando.
  useEffect(() => {
    if (!projetoId) {
      setArts([]);
      setArtId(SEM_ART);
      return;
    }
    void dadosCabecalhoMemorial({ projetoId }).then((r) => {
      if (!r.ok) return;
      setArts(r.data.arts);
      setResponsavelNome((atual) => atual || r.data.eu.nome);
      setResponsavelRegistro((atual) => atual || r.data.eu.registro);
    });
  }, [projetoId]);

  /** Escolher a ART sugere o responsável dela — mas o campo continua livre para digitar. */
  function escolherArt(valor: string) {
    setArtId(valor);
    const art = arts.find((a) => a.id === valor);
    if (art?.responsavelNome) setResponsavelNome(art.responsavelNome);
    if (art?.responsavelRegistro) setResponsavelRegistro(art.responsavelRegistro);
  }

  // Atualiza o titulo quando abre com novo tituloSugerido
  if (open && titulo !== tituloSugerido && !titulo) setTitulo(tituloSugerido);

  function handleFechar() {
    onOpenChange(false);
    // Limpa estado ao fechar
    setProjetoId("");
    setDisciplinaId("");
    setDisciplinas([]);
    setArts([]);
    setArtId(SEM_ART);
  }

  function handleSalvar() {
    if (!titulo.trim()) {
      toast.error("Informe um título para o cálculo.");
      return;
    }
    startTransition(async () => {
      const r = await salvarCalculo({
        ferramenta,
        titulo: titulo.trim(),
        entradas,
        projetoId: projetoId || undefined,
        disciplinaId: disciplinaId || undefined,
        artId: artId || undefined,
        responsavelNome: responsavelNome.trim() || undefined,
        responsavelRegistro: responsavelRegistro.trim() || undefined,
      });
      if (r.ok) {
        const msg =
          projetoId && disciplinaId
            ? `Cálculo "${titulo.trim()}" salvo e arquivado na disciplina.`
            : `Cálculo "${titulo.trim()}" salvo.`;
        toast.success(msg);
        onSalvo(r.data.id);
        handleFechar();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleFechar(); else onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar cálculo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo-calculo">Nome do cálculo</Label>
            <Input
              id="titulo-calculo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Viga V1 — bloco B"
              onKeyDown={(e) => e.key === "Enter" && handleSalvar()}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projeto-calculo">Projeto (opcional)</Label>
            <Select
              value={projetoId}
              onValueChange={(v) => {
                setProjetoId(v ?? "");
                setDisciplinaId("");
              }}
            >
              <SelectTrigger id="projeto-calculo" disabled={carregandoProjetos}>
                <SelectValue
                  placeholder={carregandoProjetos ? "Carregando…" : "Nenhum"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.codigo} — {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {projetoId && (
            <div className="space-y-1.5">
              <Label htmlFor="disciplina-calculo">Disciplina</Label>
              <Select
                value={disciplinaId}
                onValueChange={(v) => setDisciplinaId(v ?? "")}
              >
                <SelectTrigger
                  id="disciplina-calculo"
                  disabled={carregandoDisciplinas}
                >
                  <SelectValue
                    placeholder={carregandoDisciplinas ? "Carregando…" : "Selecione"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projetoId && !disciplinaId && (
                <p className="text-xs text-muted-foreground">
                  Selecione a disciplina para arquivar o cálculo automaticamente.
                </p>
              )}
            </div>
          )}

          {projetoId && (
            <div className="space-y-3 rounded-sm border p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                Cabeçalho técnico do memorial (opcional)
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="art-calculo">ART / RRT</Label>
                <Select value={artId} onValueChange={(v) => escolherArt(v ?? SEM_ART)}>
                  <SelectTrigger id="art-calculo" disabled={arts.length === 0}>
                    <SelectValue placeholder={arts.length === 0 ? "Projeto sem ART cadastrada" : "Nenhuma"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ART}>Nenhuma</SelectItem>
                    {arts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="resp-calculo">Responsável técnico</Label>
                <Input
                  id="resp-calculo"
                  value={responsavelNome}
                  onChange={(e) => setResponsavelNome(e.target.value)}
                  placeholder="Nome do responsável"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reg-calculo">Registro</Label>
                <Input
                  id="reg-calculo"
                  value={responsavelRegistro}
                  onChange={(e) => setResponsavelRegistro(e.target.value)}
                  placeholder="CREA-SP 123456"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Preenchido a partir do seu cadastro (e da ART escolhida), mas pode ser editado.
                Com responsável preenchido, o PDF sai com o bloco de assinaturas.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleFechar} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={pending || !titulo.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
