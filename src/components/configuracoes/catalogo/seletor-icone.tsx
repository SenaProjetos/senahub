"use client";

import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { iconeDisciplina } from "@/lib/disciplinas";
import { CHAVES_GALERIA, GALERIA_ICONES } from "@/lib/disciplinas-galeria";
import { cn } from "@/lib/utils";

const SVG_MAX = 20 * 1024;

/** Ícone de um item do catálogo, resolvido pelos próprios campos (svg → galeria → derivado do nome). */
export function IconeCatalogo({
  icone,
  iconeSvg,
  nome,
  className = "size-4",
}: {
  icone: string | null;
  iconeSvg: string | null;
  nome: string;
  className?: string;
}) {
  if (iconeSvg) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`data:image/svg+xml;utf8,${encodeURIComponent(iconeSvg)}`} alt="" aria-hidden className={className} />;
  }
  const Icone = (icone ? GALERIA_ICONES[icone] : undefined) ?? iconeDisciplina(nome);
  return <Icone className={className} aria-hidden />;
}

/** Galeria de ícones + envio de SVG próprio (até 20 KB; a action sanitiza). */
export function SeletorIcone({
  nome,
  icone,
  iconeSvg,
  onChange,
}: {
  nome: string;
  icone: string | null;
  iconeSvg: string | null;
  onChange: (v: { icone: string | null; iconeSvg: string | null }) => void;
}) {
  async function onArquivoSvg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;
    if (file.size > SVG_MAX) {
      toast.error("SVG acima de 20 KB.");
      return;
    }
    const txt = await file.text();
    if (!txt.includes("<svg")) {
      toast.error("Arquivo não parece um SVG.");
      return;
    }
    onChange({ icone: null, iconeSvg: txt });
  }

  return (
    <div className="space-y-1.5">
      <Label>Ícone</Label>
      <Tabs defaultValue="galeria">
        <TabsList>
          <TabsTrigger value="galeria">Galeria</TabsTrigger>
          <TabsTrigger value="svg">Enviar SVG</TabsTrigger>
        </TabsList>

        <TabsContent value="galeria" className="pt-2">
          <div className="grid max-h-52 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2">
            {CHAVES_GALERIA.map((chave) => {
              const Icone = GALERIA_ICONES[chave];
              const sel = icone === chave && !iconeSvg;
              return (
                <button
                  key={chave}
                  type="button"
                  title={chave}
                  aria-label={`Ícone ${chave}`}
                  aria-pressed={sel}
                  onClick={() => onChange({ icone: chave, iconeSvg: null })}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted",
                    sel ? "border-primary bg-primary/10 text-primary" : "border-transparent",
                  )}
                >
                  <Icone className="size-5" />
                </button>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="svg" className="pt-2">
          <div className="flex items-center gap-3 rounded-md border p-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted/40">
              <IconeCatalogo icone={icone} iconeSvg={iconeSvg} nome={nome} className="size-7 text-foreground" />
            </div>
            <div className="space-y-1.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm hover:bg-muted">
                <Upload className="size-4" /> Escolher .svg
                <input type="file" accept=".svg,image/svg+xml" className="hidden" onChange={onArquivoSvg} />
              </label>
              <p className="text-xs text-muted-foreground">SVG até 20 KB. Sanitizado no envio.</p>
              {iconeSvg && (
                <button
                  type="button"
                  className="text-xs text-destructive hover:underline"
                  onClick={() => onChange({ icone, iconeSvg: null })}
                >
                  Remover SVG
                </button>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
      {!icone && !iconeSvg && (
        <p className="text-xs text-muted-foreground">Sem ícone escolhido → o sistema deriva um ícone pelo nome.</p>
      )}
    </div>
  );
}
