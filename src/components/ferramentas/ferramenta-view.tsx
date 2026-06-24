"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getFerramenta } from "@/modules/ferramentas/registry";
import type { RecenteCalculo } from "@/modules/ferramentas/types";
import { buscarCalculo } from "@/modules/ferramentas/actions";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UnitConvertForm } from "./unit-convert-form";
import { SectionPropertiesForm } from "./section-properties-form";
import { ConcreteBeamForm } from "./concrete-beam-form";
import { AnchorageForm } from "./anchorage-form";
import { SteelSummaryForm } from "./steel-summary-form";
import { PileSptForm } from "./pile-spt-form";
import { LoadDescentForm } from "./load-descent-form";
import { WindForceForm } from "./wind-force-form";
import { ActionCombosForm } from "./action-combos-form";
import { ConcreteColumnForm } from "./concrete-column-form";
import { SlabBaresForm } from "./slab-bares-form";
import { RecentesList } from "./recentes-list";

type RecenteSerializado = Omit<RecenteCalculo, "createdAt"> & { createdAt: string };

type Props = {
  /** Chave da ferramenta (string serializável); o `meta` é resolvido aqui no cliente. */
  ferramentaKey: string;
  recentes: RecenteSerializado[];
};

function renderForm(key: string, initialEntradas: Record<string, unknown> | undefined, onSalvo: (id: string) => void) {
  switch (key) {
    case "U01":
      return <UnitConvertForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "U02":
      return <SectionPropertiesForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E01":
      return <ConcreteBeamForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E10":
      return <AnchorageForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E11":
      return <SteelSummaryForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E23":
      return <PileSptForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E12":
      return <LoadDescentForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E13":
      return <WindForceForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E14":
      return <ActionCombosForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E04":
      return <ConcreteColumnForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    case "E05":
      return <SlabBaresForm initialEntradas={initialEntradas} onSalvo={onSalvo} />;
    default:
      return <p className="text-muted-foreground text-sm">Ferramenta em desenvolvimento.</p>;
  }
}

export function FerramentaView({ ferramentaKey, recentes }: Props) {
  const router = useRouter();
  const [initialEntradas, setInitialEntradas] = useState<Record<string, unknown> | undefined>();
  // Incrementado a cada recente aberto → força re-mount do form, reinicializando os campos.
  const [formKey, setFormKey] = useState(0);
  const meta = getFerramenta(ferramentaKey);

  const handleSalvo = useCallback(
    (id: string) => {
      // Recarrega o Server Component → atualiza a lista de recentes via novas props.
      router.refresh();
      void id;
    },
    [router],
  );

  const handleAbrir = useCallback(async (id: string) => {
    const r = await buscarCalculo({ id });
    if (r.ok) {
      setInitialEntradas(r.data.entradasJson);
      setFormKey((k) => k + 1);
    }
  }, []);

  if (!meta) {
    return <div className="p-6 text-sm text-muted-foreground">Ferramenta não encontrada.</div>;
  }

  const Icon = meta.icon;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start gap-4">
        <Link
          href="/ferramentas"
          className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-md bg-primary/10 p-1.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">{meta.nome}</h1>
            <Badge variant="outline" className="text-xs">
              {meta.disciplina}
            </Badge>
            {meta.norma && (
              <Badge variant="secondary" className="text-xs">
                {meta.norma}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{meta.descricao}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        {/* Formulário da ferramenta — key muda ao abrir recente, reinicializando os campos */}
        <div key={formKey} className="rounded-lg border bg-card p-6">
          {renderForm(meta.key, initialEntradas, handleSalvo)}
        </div>

        {/* Painel lateral: Recentes */}
        <aside className="space-y-3">
          <h2 className="text-sm font-medium">Recentes</h2>
          <Separator />
          <RecentesList recentes={recentes} onAbrir={handleAbrir} exportaveis={meta.exportaveis} />
        </aside>
      </div>
    </div>
  );
}
