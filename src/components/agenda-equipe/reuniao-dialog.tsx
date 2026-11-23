"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLASSE_TEXTAREA } from "@/components/atas/motivo-dialog";
import { agendarReuniaoDoProjeto, editarReuniaoAgendada } from "@/modules/portal/agenda/actions";
import { LINK_MAX, LOCAL_MAX, PAUTA_MAX, TITULO_MAX } from "@/modules/portal/agenda/reunioes";
import type { ReuniaoParaEquipe } from "@/modules/portal/agenda/queries";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";

type Campos = { titulo: string; dia: string; horaInicio: string; duracao: string; link: string; local: string; pauta: string };
const VAZIO: Campos = { titulo: "", dia: "", horaInicio: "", duracao: "", link: "", local: "", pauta: "" };

const doEdicao = (r: ReuniaoParaEquipe): Campos => ({
  titulo: r.titulo,
  dia: r.dia,
  horaInicio: r.horaInicio,
  duracao: r.duracaoMinutos ? String(r.duracaoMinutos) : "",
  link: r.link ?? "",
  local: r.local ?? "",
  pauta: r.pauta ?? "",
});

/**
 * Agendar ou editar/remarcar uma reunião (spec 2026-11-23-portal-agenda-contrato-design.md). A reunião vale na hora para o
 * cliente; o servidor confere de novo cada regra (dia de hoje em diante, hora, link https, limites) e devolve a primeira
 * frase de erro, mostrada no rodapé do formulário. Hora = horário de Brasília.
 */
export function ReuniaoDialog({
  projetoId,
  aberto,
  edicao,
  onFechar,
}: {
  projetoId: string;
  aberto: boolean;
  /** Reunião sendo editada; `null` = agendar uma nova. */
  edicao: ReuniaoParaEquipe | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [c, setC] = useState<Campos>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, start] = useTransition();
  const ids = { titulo: useId(), dia: useId(), hora: useId(), duracao: useId(), link: useId(), local: useId(), pauta: useId(), erro: useId() };

  useEffect(() => {
    if (aberto) {
      setC(edicao ? doEdicao(edicao) : VAZIO);
      setErro(null);
    }
  }, [aberto, edicao]);

  const muda = (campo: keyof Campos) => (e: { target: { value: string } }) => setC((v) => ({ ...v, [campo]: e.target.value }));

  function salvar() {
    setErro(null);
    const duracao = c.duracao.trim() === "" ? null : Number(c.duracao);
    const dados = {
      titulo: c.titulo,
      dia: c.dia,
      horaInicio: c.horaInicio,
      duracaoMinutos: duracao != null && Number.isFinite(duracao) ? duracao : null,
      link: c.link,
      local: c.local,
      pauta: c.pauta,
    };
    if (duracao != null && !Number.isFinite(duracao)) return setErro("Duração inválida.");
    start(async () => {
      const r = await (edicao ? editarReuniaoAgendada({ reuniaoAgendadaId: edicao.id, ...dados }) : agendarReuniaoDoProjeto({ projetoId, ...dados })).catch(() => null);
      if (!r) return void toast.error(FALHA);
      if (!r.ok) {
        setErro(r.error);
        // A reunião mudou por outra pessoa: o formulário está velho.
        if (edicao) router.refresh();
        return;
      }
      toast.success(edicao ? "Reunião atualizada." : "Reunião agendada. O cliente já pode vê-la.");
      onFechar();
      router.refresh();
    });
  }

  const pode = !enviando && c.titulo.trim() !== "" && c.dia !== "" && c.horaInicio !== "";

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !enviando && onFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{edicao ? "Editar / remarcar reunião" : "Agendar reunião"}</DialogTitle>
          <DialogDescription>
            O cliente vê a reunião na agenda do portal assim que você salvar.
            {edicao ? " Mudar o dia ou a hora marca a reunião como remarcada e o cliente é avisado." : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={ids.titulo}>Título</Label>
            <Input id={ids.titulo} value={c.titulo} maxLength={TITULO_MAX} onChange={muda("titulo")} disabled={enviando} placeholder="Ex.: Alinhamento do projeto básico" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={ids.dia}>Dia</Label>
              <Input id={ids.dia} type="date" value={c.dia} onChange={muda("dia")} disabled={enviando} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.hora}>Hora (Brasília)</Label>
              <Input id={ids.hora} type="time" value={c.horaInicio} onChange={muda("horaInicio")} disabled={enviando} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.duracao}>Duração (min)</Label>
              <Input id={ids.duracao} type="number" inputMode="numeric" min={5} max={600} value={c.duracao} onChange={muda("duracao")} disabled={enviando} placeholder="Opcional" />
            </div>
          </div>
          <CollapsibleSection
            titulo="Link, local e pauta"
            descricao="Opcionais — o cliente vê o que você preencher."
            resumo={[c.link && "link", c.local && "local", c.pauta && "pauta"].filter(Boolean).join(", ") || "nada preenchido"}
            defaultOpen={Boolean(c.link || c.local || c.pauta)}
          >
            <div className="space-y-3 p-3 pt-0">
              <div className="space-y-1.5">
                <Label htmlFor={ids.link}>Link da reunião</Label>
                <Input id={ids.link} type="url" inputMode="url" value={c.link} maxLength={LINK_MAX} onChange={muda("link")} disabled={enviando} placeholder="https://meet.google.com/…" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.local}>Local</Label>
                <Input id={ids.local} value={c.local} maxLength={LOCAL_MAX} onChange={muda("local")} disabled={enviando} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.pauta}>Pauta</Label>
                <textarea id={ids.pauta} rows={3} maxLength={PAUTA_MAX} className={CLASSE_TEXTAREA} value={c.pauta} onChange={muda("pauta")} disabled={enviando} />
              </div>
            </div>
          </CollapsibleSection>
          {erro && (
            <p id={ids.erro} role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button onClick={salvar} disabled={!pode}>
            <span role="status">{enviando ? "Salvando…" : edicao ? "Salvar" : "Agendar"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
