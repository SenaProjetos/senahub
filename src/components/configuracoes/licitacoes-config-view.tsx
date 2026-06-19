"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { salvarConfigLicitacoes } from "@/modules/licitacoes/config/actions";
import type { ConfigLicitacoes } from "@/modules/licitacoes/config/defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function parseDiasAlerta(str: string): number[] {
  return str
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

function parseIndices(str: string): string[] {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function LicitacoesConfigView({ config }: { config: ConfigLicitacoes }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [recursoAlertas, setRecursoAlertas] = useState(
    config.recurso.alertaDiasPadrao.join(", "),
  );
  const [limiteAcrescimo, setLimiteAcrescimo] = useState(
    String(config.aditivo.limiteAcrescimoPctPadrao),
  );
  const [fatorAviso, setFatorAviso] = useState(String(config.aditivo.fatorAviso));
  const [modoPncp, setModoPncp] = useState<"manual" | "api">(config.pncp.modo);
  const [modoReajuste, setModoReajuste] = useState<"manual" | "automatico">(
    config.reajuste.modo,
  );
  const [indices, setIndices] = useState(config.reajuste.indices.join(", "));
  const [percentualPadraoReajuste, setPercentualPadraoReajuste] = useState(
    String(config.reajuste.percentualPadrao),
  );
  const [datasChaveAlertas, setDatasChaveAlertas] = useState(
    config.datasChave.alertaDiasPadrao.join(", "),
  );

  function salvar() {
    start(async () => {
      const r = await salvarConfigLicitacoes({
        recurso: { alertaDiasPadrao: parseDiasAlerta(recursoAlertas) },
        aditivo: {
          limiteAcrescimoPctPadrao: parseFloat(limiteAcrescimo) || 0,
          fatorAviso: parseFloat(fatorAviso) || 0,
        },
        pncp: { modo: modoPncp },
        reajuste: {
          modo: modoReajuste,
          indices: parseIndices(indices),
          percentualPadrao: Number(percentualPadraoReajuste) || 0,
        },
        datasChave: { alertaDiasPadrao: parseDiasAlerta(datasChaveAlertas) },
      });
      if (r.ok) {
        toast.success("Configurações salvas.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/configuracoes"
          className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> Configurações
        </Link>
        <h2 className="text-2xl font-extrabold tracking-tight">Parâmetros de licitação</h2>
        <p className="text-sm text-muted-foreground">
          Prazos de recurso, limite de aditivo, modo PNCP/reajuste e alertas.
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <span>
          Os valores de prazo de recurso e limite de aditivo devem refletir a{" "}
          <strong>Lei 14.133/2021</strong> vigente — confirme a redação atual antes de alterar.
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recurso — dias de alerta</CardTitle>
          <CardDescription>
            Dias de antecedência para alertar sobre prazos de recurso. Valores legais devem
            refletir a legislação vigente (Lei 14.133/2021). Ex.: 3, 1
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={recursoAlertas}
            onChange={(e) => setRecursoAlertas(e.target.value)}
            placeholder="Ex.: 3, 1"
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Aditivo</CardTitle>
          <CardDescription>
            Percentual máximo de acréscimo e fator de aviso antecipado. O limite deve refletir a
            legislação vigente (Lei 14.133/2021).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Limite de acréscimo (%)</label>
            <Input
              type="number"
              min={0}
              value={limiteAcrescimo}
              onChange={(e) => setLimiteAcrescimo(e.target.value)}
              placeholder="Ex.: 25"
              className="max-w-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Fator de aviso</label>
            <p className="text-xs text-muted-foreground">
              Fração do limite que dispara aviso (0–1). Ex.: 0.8 = avisa a 80% do limite.
            </p>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={fatorAviso}
              onChange={(e) => setFatorAviso(e.target.value)}
              placeholder="Ex.: 0.8"
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PNCP — modo de integração</CardTitle>
          <CardDescription>
            Define se as publicações no Portal Nacional de Contratações Públicas são feitas
            manualmente ou via API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={modoPncp} onValueChange={(v) => v && setModoPncp(v as "manual" | "api")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="api">API</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Reajuste</CardTitle>
          <CardDescription>
            Modo de cálculo de reajuste e índices econômicos disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Modo</label>
            <Select
              value={modoReajuste}
              onValueChange={(v) => v && setModoReajuste(v as "manual" | "automatico")}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="automatico">Automático</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Índices</label>
            <p className="text-xs text-muted-foreground">
              Lista separada por vírgula. Ex.: IPCA, INCC, IGP-M
            </p>
            <Input
              value={indices}
              onChange={(e) => setIndices(e.target.value)}
              placeholder="Ex.: IPCA, INCC, IGP-M"
              className="max-w-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">% padrão de reajuste (modo automático)</label>
            <p className="text-xs text-muted-foreground">
              Usado quando o reajuste está em modo automático para sugerir o reajuste no
              aniversário.
            </p>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={percentualPadraoReajuste}
              onChange={(e) => setPercentualPadraoReajuste(e.target.value)}
              placeholder="Ex.: 5.5"
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Datas-chave — dias de alerta</CardTitle>
          <CardDescription>
            Dias de antecedência para alertar sobre datas-chave do contrato. Ex.: 15, 7, 1
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={datasChaveAlertas}
            onChange={(e) => setDatasChaveAlertas(e.target.value)}
            placeholder="Ex.: 15, 7, 1"
            className="max-w-xs"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={pending}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
