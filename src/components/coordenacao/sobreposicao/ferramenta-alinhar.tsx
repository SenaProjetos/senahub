"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Undo2 } from "lucide-react";
import { COR_BASE } from "@/modules/coordenacao/sobreposicao/regras";
import {
  instrucao,
  marcadores,
  mudou,
  type ModoAlinhar,
  type SessaoAlinhamento,
} from "@/modules/coordenacao/sobreposicao/sessao-alinhamento";
import { aplicar, type Alinhamento } from "@/modules/coordenacao/sobreposicao/transformacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { VistaPalco } from "./palco";

type Campo = keyof Alinhamento;

const CAMPOS: { campo: Campo; rotulo: string; casas: number }[] = [
  { campo: "tx", rotulo: "X", casas: 2 },
  { campo: "ty", rotulo: "Y", casas: 2 },
  { campo: "giro", rotulo: "Giro (°)", casas: 3 },
  { campo: "escala", rotulo: "Escala", casas: 6 },
];

/** Número curto para o campo (sem zeros sobrando). */
function mostrar(valor: number, casas: number): string {
  return String(Number(valor.toFixed(casas)));
}

/** Campo numérico que só aplica ao sair do campo ou com Enter (digitar "1." não vira 1 no meio do caminho). */
function CampoNumero({
  id,
  rotulo,
  valor,
  casas,
  onAplicar,
}: {
  id: string;
  rotulo: string;
  valor: number;
  casas: number;
  onAplicar: (v: number) => void;
}) {
  const texto = mostrar(valor, casas);
  const [rascunho, setRascunho] = useState(texto);
  useEffect(() => setRascunho(texto), [texto]);

  function aplicar() {
    if (rascunho === texto) return;
    const v = Number(rascunho.replace(",", "."));
    onAplicar(rascunho.trim() === "" ? Number.NaN : v);
    setRascunho(texto);
  }

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => {
          if (e.key === "Enter") aplicar();
          if (e.key === "Escape") setRascunho(texto);
        }}
        className="h-8 w-24 tabular-nums"
      />
    </div>
  );
}

type Props = {
  sessao: SessaoAlinhamento;
  /** "Estrutura · Térreo" — a camada que está sendo alinhada. */
  nome: string;
  salvando: boolean;
  onModo: (m: ModoAlinhar) => void;
  onCampos: (campos: Partial<Alinhamento>) => void;
  onDesfazer: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
  /** Trava: outra pessoa salvou o alinhamento desta camada. `atualizando` = recarregando a cena. */
  corrida: "aviso" | "atualizando" | null;
  /** Recarrega a cena e mantém o alinhamento desta sessão (o próximo "Salvar" grava por cima, sabendo). */
  onManterMeu: () => void;
};

/** Barra do alinhamento: modo, o que clicar, campos X/Y/giro/escala, desfazer, cancelar e salvar. */
export function FerramentaAlinhar({
  sessao,
  nome,
  salvando,
  onModo,
  onCampos,
  onDesfazer,
  onCancelar,
  onSalvar,
  corrida,
  onManterMeu,
}: Props) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-3" aria-label={`Alinhando a camada ${nome}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="min-w-0 truncate text-sm font-semibold" title={nome}>
          Alinhando: {nome}
        </h3>
        <Tabs value={sessao.modo} onValueChange={(v) => v && onModo(v as ModoAlinhar)}>
          <TabsList aria-label="Modo de alinhamento">
            <TabsTrigger value="um_ponto">1 ponto</TabsTrigger>
            <TabsTrigger value="dois_pontos">2 pontos</TabsTrigger>
            <TabsTrigger value="ajuste">Ajuste fino</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {instrucao(sessao)} <span className="whitespace-nowrap">Ctrl+Z desfaz · Esc limpa os cliques.</span>
      </p>
      {corrida && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-warning-text/40 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning-text" aria-hidden />
          <span className="min-w-0 flex-1">
            Outra pessoa salvou o alinhamento desta camada enquanto você editava. Para manter o seu, atualize e salve de
            novo (o seu grava por cima); para ver o dela, cancele.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onManterMeu} disabled={corrida === "atualizando"}>
            {corrida === "atualizando" && <Loader2 className="size-4 animate-spin" />}
            Atualizar e manter o meu
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {CAMPOS.map(({ campo, rotulo, casas }) => (
          <CampoNumero
            key={campo}
            id={`alinhar-${campo}`}
            rotulo={rotulo}
            valor={sessao.atual[campo]}
            casas={casas}
            onAplicar={(v) => onCampos({ [campo]: v })}
          />
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDesfazer}
            disabled={sessao.desfazer.length === 0 || salvando}
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="size-4" />
            Desfazer
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSalvar}
            disabled={salvando || corrida !== null || (!mudou(sessao) && sessao.versaoLida !== null)}
          >
            {salvando && <Loader2 className="size-4 animate-spin" />}
            Salvar alinhamento
          </Button>
        </div>
      </div>
    </section>
  );
}

const RAIO_MARCADOR = 7;

/** Desenha os cliques do par em andamento por cima do palco (contexto em px CSS). */
export function desenharMarcadores(ctx: CanvasRenderingContext2D, vista: VistaPalco, sessao: SessaoAlinhamento, corCamada: string) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "bold 11px sans-serif";
  ctx.textBaseline = "middle";
  for (const m of marcadores(sessao)) {
    const p = aplicar(vista, m.mundo);
    const cor = m.lado === "camada" ? corCamada : COR_BASE;
    ctx.strokeStyle = cor;
    ctx.fillStyle = cor;
    ctx.beginPath();
    if (m.lado === "camada") {
      ctx.arc(p.x, p.y, RAIO_MARCADOR, 0, Math.PI * 2);
    } else {
      ctx.moveTo(p.x - RAIO_MARCADOR - 3, p.y);
      ctx.lineTo(p.x + RAIO_MARCADOR + 3, p.y);
      ctx.moveTo(p.x, p.y - RAIO_MARCADOR - 3);
      ctx.lineTo(p.x, p.y + RAIO_MARCADOR + 3);
    }
    ctx.stroke();
    ctx.fillText(String(m.par), p.x + RAIO_MARCADOR + 4, p.y - RAIO_MARCADOR);
  }
  ctx.restore();
}
