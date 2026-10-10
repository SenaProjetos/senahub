"use client";

import { useEffect, useRef, useState } from "react";
import { Move3d, Upload, X, Check, ArrowLeft, RotateCcw, RotateCw, Crosshair, Spline } from "lucide-react";
import { normalizarGraus, realinhamentoNulo } from "@/modules/coordenacao/realinhamento";
import type { EtapaPontos, ModoPontos } from "@/modules/coordenacao/viewer/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ModeloRealinhavel = {
  uploadId: string;
  nomeArquivo: string;
  disciplinaNome: string;
  versao: number;
};

type Vetor = [number, number, number];

/**
 * Painel de realinhamento (offset) de um IFC. NÃO é um modal: fica flutuando sobre o
 * viewport para o arraste 3D continuar funcionando. Controla o modo realinhamento do
 * ViewerEngine (prévia ao vivo) via callbacks do pai; ao aplicar, o pai chama a action
 * que gera uma NOVA VERSÃO do IFC deslocado (o original nunca é sobrescrito).
 */
export function RealinharIfcDialog({
  aberto,
  onFechar,
  onTrocar,
  modelos,
  uploadIdAtivo,
  onEscolher,
  vetor,
  onVetor,
  rotacao,
  onRotacao,
  etapaPontos,
  modoPontos,
  avisoAlinhamento,
  onPontos,
  onAplicar,
  pending,
  disciplinasUpload,
  onEnviarAvulso,
  enviandoAvulso,
}: {
  aberto: boolean;
  onFechar: () => void;
  onTrocar: () => void;
  modelos: ModeloRealinhavel[];
  uploadIdAtivo: string | null;
  onEscolher: (uploadId: string) => void;
  vetor: Vetor;
  onVetor: (v: Vetor) => void;
  /** Giro em planta, graus (anti-horário visto de cima), em torno do centro do modelo. */
  rotacao: number;
  onRotacao: (graus: number) => void;
  /** Modo de pontos: qual clique falta (null = desligado) e qual modo está ativo. */
  etapaPontos: EtapaPontos;
  modoPontos: ModoPontos | null;
  /** Aviso de escala do alinhamento por 2 pares (distâncias diferentes), se houver. */
  avisoAlinhamento: string | null;
  onPontos: (modo: ModoPontos | null) => void;
  onAplicar: () => void;
  pending: boolean;
  disciplinasUpload: { id: string; nome: string }[];
  onEnviarAvulso: (file: File, disciplinaId: string) => void;
  enviandoAvulso: boolean;
}) {
  const [discAvulso, setDiscAvulso] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!aberto) return null;

  const ativo = modelos.find((m) => m.uploadId === uploadIdAtivo) ?? null;

  return (
    <div className="absolute bottom-3 left-3 z-20 w-72 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Move3d className="size-4" /> Realinhar IFC
        </p>
        <Button variant="ghost" size="icon" className="size-6" onClick={onFechar} aria-label="Fechar realinhamento">
          <X className="size-4" />
        </Button>
      </div>

      {!ativo ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Modelo do projeto</Label>
            <Select value="" onValueChange={(v) => v && onEscolher(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um modelo convertido" />
              </SelectTrigger>
              <SelectContent>
                {modelos.map((m) => (
                  <SelectItem key={m.uploadId} value={m.uploadId}>
                    {m.disciplinaNome} · {m.nomeArquivo}
                    {m.versao > 1 ? ` (v${m.versao})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Só modelos já convertidos aparecem aqui. Ligar um modelo pode levar um instante.
            </p>
          </div>

          {disciplinasUpload.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs">Ou enviar um IFC novo</Label>
              <Select value={discAvulso} onValueChange={(v) => setDiscAvulso(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Disciplina de destino" />
                </SelectTrigger>
                <SelectContent>
                  {disciplinasUpload.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={fileRef}
                type="file"
                accept=".ifc"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && discAvulso) onEnviarAvulso(f, discAvulso);
                  e.target.value = "";
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-1"
                disabled={!discAvulso || enviandoAvulso}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" /> {enviandoAvulso ? "Enviando…" : "Enviar IFC"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Após a conversão, ligue a disciplina e selecione o modelo acima para realinhar.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="truncate text-xs text-muted-foreground" title={ativo.nomeArquivo}>
            {ativo.disciplinaNome} · {ativo.nomeArquivo}
          </p>
          <p className="rounded bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
            Arraste o modelo no plano (botão esquerdo) para posicionar X/Y. Ajuste a altura (Z)
            e o giro pelos campos — o giro é em torno do centro do modelo, positivo no sentido
            anti-horário visto de cima. Orbite com o botão direito. O modelo se move ao vivo — só
            grava ao aplicar.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <CampoNumero rotulo="X (m)" valor={vetor[0]} onValor={(n) => onVetor([n, vetor[1], vetor[2]])} />
            <CampoNumero rotulo="Y (m)" valor={vetor[1]} onValor={(n) => onVetor([vetor[0], n, vetor[2]])} />
            <CampoNumero rotulo="Z (m)" valor={vetor[2]} onValor={(n) => onVetor([vetor[0], vetor[1], n])} />
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={modoPontos === "um-par" ? "default" : "secondary"}
                size="sm"
                className="gap-1 px-2"
                onClick={() => onPontos(modoPontos === "um-par" ? null : "um-par")}
                disabled={pending}
                title="Um ponto do modelo vai parar em cima do ponto de destino"
              >
                <Crosshair className="size-4" /> {modoPontos === "um-par" ? "Cancelar" : "Por pontos"}
              </Button>
              <Button
                variant={modoPontos === "dois-pares" ? "default" : "secondary"}
                size="sm"
                className="gap-1 px-2"
                onClick={() => onPontos(modoPontos === "dois-pares" ? null : "dois-pares")}
                disabled={pending}
                title="Dois pares de pontos: desloca e gira de uma vez"
              >
                <Spline className="size-4" /> {modoPontos === "dois-pares" ? "Cancelar" : "Por 2 pares"}
              </Button>
            </div>
            {etapaPontos && (
              <p className="rounded bg-primary/10 px-2 py-1.5 text-[11px] leading-snug" aria-live="polite">
                {textoEtapa(etapaPontos, modoPontos)}
              </p>
            )}
            {!etapaPontos && avisoAlinhamento && (
              <p className="rounded bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                {avisoAlinhamento}
              </p>
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <CampoNumero rotulo="Giro (°)" valor={rotacao} onValor={onRotacao} />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onRotacao(normalizarGraus(rotacao + 90))}
              aria-label="Girar 90° no sentido anti-horário"
              title="Girar 90° no sentido anti-horário"
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              onClick={() => onRotacao(normalizarGraus(rotacao - 90))}
              aria-label="Girar 90° no sentido horário"
              title="Girar 90° no sentido horário"
            >
              <RotateCw className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1" onClick={onTrocar} disabled={pending}>
              <ArrowLeft className="size-4" /> Trocar
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={onAplicar}
              disabled={pending || realinhamentoNulo(vetor, rotacao)}
            >
              <Check className="size-4" /> {pending ? "Aplicando…" : "Aplicar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Campo numérico com buffer de texto local — deixa digitar "-", "1." e decimais sem o
 * valor "pular", e reflete mudanças externas (arraste no viewport) quando não está
 * sendo editado ou quando o número efetivo diverge do buffer.
 */
function CampoNumero({
  rotulo,
  valor,
  onValor,
}: {
  rotulo: string;
  valor: number;
  onValor: (n: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    // Sincroniza quando o valor externo muda e não corresponde ao que está digitado.
    if (Number(texto) !== valor) setTexto(formatar(valor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={texto}
        className="h-8 px-2 text-base md:text-sm"
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          const n = Number(t);
          if (t.trim() !== "" && Number.isFinite(n)) onValor(n);
          else if (t.trim() === "") onValor(0);
        }}
      />
    </div>
  );
}

/** Instrução do clique que falta, conforme o modo de pontos. */
function textoEtapa(etapa: Exclude<EtapaPontos, null>, modo: ModoPontos | null): string {
  const total = modo === "dois-pares" ? 4 : 2;
  const texto: Record<Exclude<EtapaPontos, null>, string> = {
    origem: "Clique num ponto do modelo que vai se mover (pega vértice e aresta).",
    destino:
      modo === "dois-pares"
        ? "Clique no destino desse ponto."
        : "Clique no ponto de destino. O primeiro ponto vai parar em cima dele.",
    origem2: "Clique num SEGUNDO ponto do modelo, longe do primeiro — ele define o giro.",
    destino2: "Clique no destino do segundo ponto. O modelo desloca e gira de uma vez.",
  };
  const ordem: Exclude<EtapaPontos, null>[] = ["origem", "destino", "origem2", "destino2"];
  return `${ordem.indexOf(etapa) + 1}/${total} — ${texto[etapa]}`;
}

/** Arredonda para 3 casas para exibir sem ruído de ponto flutuante vindo do arraste. */
function formatar(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}
