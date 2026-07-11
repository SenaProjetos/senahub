/**
 * Coordenação BIM — parser PURO do ItemData do fragments (shape recursivo:
 * folhas são `{ value }`, relações são arrays de ItemData). Sem three/fragments
 * como dependência para ser testável em vitest (node) sem puxar o stack 3D.
 */

export type AtributoItem = { nome: string; valor: string };
export type PsetItem = { nome: string; props: AtributoItem[] };

function ehFolhaValor(v: unknown): v is { value: unknown } {
  return typeof v === "object" && v !== null && "value" in v && !Array.isArray(v);
}

function valorTexto(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Achata o ItemData em atributos diretos + property sets (relação IsDefinedBy). */
export function extrairAtributos(item: unknown): {
  atributos: AtributoItem[];
  psets: PsetItem[];
} {
  const atributos: AtributoItem[] = [];
  const psets: PsetItem[] = [];
  if (!item || typeof item !== "object") return { atributos, psets };

  for (const [nome, valor] of Object.entries(item)) {
    if (nome === "IsDefinedBy") continue;
    if (ehFolhaValor(valor)) atributos.push({ nome, valor: valorTexto(valor.value) });
  }

  const definicoes = (item as Record<string, unknown>).IsDefinedBy;
  if (Array.isArray(definicoes)) {
    for (const def of definicoes) {
      if (!def || typeof def !== "object") continue;
      const d = def as Record<string, unknown>;
      const nomePset = ehFolhaValor(d.Name) ? valorTexto(d.Name.value) : "Propriedades";
      const props: AtributoItem[] = [];
      const has = d.HasProperties;
      if (Array.isArray(has)) {
        for (const p of has) {
          if (!p || typeof p !== "object") continue;
          const pr = p as Record<string, unknown>;
          const nomeProp = ehFolhaValor(pr.Name) ? valorTexto(pr.Name.value) : null;
          const valorProp = ehFolhaValor(pr.NominalValue) ? valorTexto(pr.NominalValue.value) : null;
          if (nomeProp) props.push({ nome: nomeProp, valor: valorProp ?? "—" });
        }
      }
      if (props.length > 0) psets.push({ nome: nomePset, props });
    }
  }
  return { atributos, psets };
}
