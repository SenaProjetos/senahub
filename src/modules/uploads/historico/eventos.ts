/**
 * Regras do histórico por documento (`DocumentoEvento`). Puro, sem I/O, client-safe: a gravação
 * (`service.ts`), a leitura (`queries.ts`), o backfill e a tela usam as mesmas definições.
 *
 * Duas categorias, com visibilidade diferente:
 *  - `alteracao`: o que mudou no documento — quem enxerga o documento vê;
 *  - `acesso`: quem baixou/visualizou — monitoramento de colegas, só com `arquivos:ver_acessos`.
 */

export type CategoriaEvento = "alteracao" | "acesso";
export type OrigemEvento = "interno" | "link_publico";

export const TIPOS_EVENTO = {
  envio: { categoria: "alteracao", rotulo: "Enviou arquivo" },
  metadados: { categoria: "alteracao", rotulo: "Alterou dados do documento" },
  status: { categoria: "alteracao", rotulo: "Alterou o status documental" },
  validacao: { categoria: "alteracao", rotulo: "Validou arquivo" },
  validacao_revertida: { categoria: "alteracao", rotulo: "Desfez a validação" },
  ajuste_solicitado: { categoria: "alteracao", rotulo: "Solicitou ajuste" },
  apontamentos_enviados: { categoria: "alteracao", rotulo: "Enviou apontamentos" },
  renomeio: { categoria: "alteracao", rotulo: "Renomeou" },
  lixeira: { categoria: "alteracao", rotulo: "Moveu para a lixeira" },
  restauracao: { categoria: "alteracao", rotulo: "Restaurou da lixeira" },
  exclusao_definitiva: { categoria: "alteracao", rotulo: "Excluiu em definitivo" },
  exclusao_solicitada: { categoria: "alteracao", rotulo: "Pediu a exclusão" },
  exclusao_aprovada: { categoria: "alteracao", rotulo: "Aprovou a exclusão" },
  exclusao_recusada: { categoria: "alteracao", rotulo: "Recusou a exclusão" },
  aceite_gerado: { categoria: "alteracao", rotulo: "Gerou link de aceite do cliente" },
  aceite_revogado: { categoria: "alteracao", rotulo: "Revogou link de aceite do cliente" },
  lista_adicionado: { categoria: "alteracao", rotulo: "Adicionou a uma lista" },
  lista_removido: { categoria: "alteracao", rotulo: "Removeu de uma lista" },
  download: { categoria: "acesso", rotulo: "Baixou" },
  visualizacao: { categoria: "acesso", rotulo: "Visualizou" },
} as const satisfies Record<string, { categoria: CategoriaEvento; rotulo: string }>;

export type TipoEvento = keyof typeof TIPOS_EVENTO;
export type TipoAcesso = "download" | "visualizacao";

export function categoriaDoTipo(tipo: TipoEvento): CategoriaEvento {
  return TIPOS_EVENTO[tipo].categoria;
}

export function ehTipoEvento(v: string): v is TipoEvento {
  return Object.hasOwn(TIPOS_EVENTO, v);
}

/** Janela em que acessos repetidos contam como um só evento (decisão do dono, 2026-09-15). */
export const JANELA_ACESSO_MS = 10 * 60 * 1000;

/**
 * Chave única do agrupamento de acessos. Janela FIXA (instante arredondado para baixo), não
 * deslizante: é o que permite um upsert atômico numa coluna unique — uma janela deslizante
 * exigiria ler-antes-de-gravar e duas requisições simultâneas criariam duas linhas.
 * Quem acessou é o usuário; sem usuário (link público), o próprio link.
 */
export function chaveAgrupamentoAcesso(a: {
  tipo: TipoAcesso;
  uploadId: string;
  origem: OrigemEvento;
  userId?: string | null;
  linkId?: string | null;
  em: Date;
}): string {
  const quem = a.userId ?? (a.linkId ? `link:${a.linkId}` : "anonimo");
  const janela = Math.floor(a.em.getTime() / JANELA_ACESSO_MS);
  return `${a.tipo}|${a.uploadId}|${a.origem}|${quem}|${janela}`;
}

export type Mudanca = { de: string | null; para: string | null };

/**
 * Campos que de fato mudaram, com o valor anterior e o novo. Vazio e nulo são o mesmo
 * "sem valor" — salvar o formulário sem mexer não pode virar evento.
 */
export function camposAlterados<C extends string>(
  antes: Record<C, string | null | undefined>,
  depois: Record<C, string | null | undefined>,
  campos: readonly C[],
): Partial<Record<C, Mudanca>> {
  const norm = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v);
  const out: Partial<Record<C, Mudanca>> = {};
  for (const campo of campos) {
    const de = norm(antes[campo]);
    const para = norm(depois[campo]);
    if (de !== para) out[campo] = { de, para };
  }
  return out;
}

const ROTULO_CAMPO: Record<string, string> = {
  titulo: "título",
  descricao: "descrição",
  fase: "fase",
  tipo: "tipo",
  numeroPrancha: "nº da prancha",
  tamanhoPapel: "tamanho do papel",
};

function aspas(v: string | null): string {
  return v === null ? "vazio" : `"${v.length > 60 ? `${v.slice(0, 57)}…` : v}"`;
}

function mudancaTexto(m: unknown): string | null {
  if (!m || typeof m !== "object") return null;
  const { de, para } = m as { de?: string | null; para?: string | null };
  return `${aspas(de ?? null)} → ${aspas(para ?? null)}`;
}

/**
 * Complemento legível do rótulo, a partir do `detalhe` gravado. Tolerante a lixo: o JSON vem do
 * banco (inclusive linhas importadas do AuditLog), então campo ausente só omite o trecho.
 */
export function complementoEvento(tipo: TipoEvento, detalhe: unknown): string | null {
  const d = (detalhe && typeof detalhe === "object" ? detalhe : {}) as Record<string, unknown>;
  const texto = (k: string) => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null);
  switch (tipo) {
    case "metadados": {
      const campos = (d.campos && typeof d.campos === "object" ? d.campos : {}) as Record<string, unknown>;
      const partes = Object.entries(campos)
        .map(([campo, m]) => {
          const t = mudancaTexto(m);
          return t ? `${ROTULO_CAMPO[campo] ?? campo}: ${t}` : null;
        })
        .filter(Boolean);
      return partes.length ? partes.join(" · ") : null;
    }
    case "status":
    case "renomeio":
      return mudancaTexto(d);
    case "ajuste_solicitado":
      return texto("motivo");
    case "exclusao_solicitada":
      return texto("justificativa");
    case "exclusao_recusada":
      return texto("motivo");
    case "apontamentos_enviados":
      return typeof d.total === "number" ? `${d.total} apontamento(s)` : null;
    case "lista_adicionado":
    case "lista_removido":
      return texto("lista");
    case "envio": {
      // Só o que ESTE envio classificou (o motor de nomenclatura não sobrescreve o que já
      // existia, então a ausência aqui significa "não mexeu", não "não tem").
      const partes = [
        texto("fase") ? `fase ${texto("fase")}` : null,
        texto("tipo") ? `tipo ${texto("tipo")}` : null,
        typeof d.numeroPrancha === "number" ? `nº ${d.numeroPrancha}` : null,
        d.novaVersaoDe === true ? "nova versão de um documento existente" : null,
      ].filter(Boolean);
      return partes.length ? partes.join(" · ") : null;
    }
    default:
      return null;
  }
}
