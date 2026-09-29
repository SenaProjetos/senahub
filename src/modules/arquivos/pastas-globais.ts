/**
 * Os dois níveis que o diretório geral (/arquivos) tem ACIMA do projeto — ano e projeto — na
 * mesma forma das pastas da aba Arquivos (`modules/uploads/pastas-da-lista.ts`). Do projeto
 * para baixo o diretório é a própria aba, então só estes dois níveis moram aqui. Regra pura.
 */
import type { DestinoPasta, PastaNaLista } from "@/modules/uploads/pastas-da-lista";

export type ProjetoDoAno = { projetoId: string; codigo: string; nome: string; total: number };
export type AnoDoDiretorio = { ano: number; total: number; projetos: ProjetoDoAno[] };

/** Sair para um ano ou projeto zera a posição DENTRO do projeto — a pasta aberta era de outro. */
export function destinoGlobal(ano: string | null, projetoId: string | null): DestinoPasta {
  return { ano, projetoId, disciplinaId: null, fase: null, ext: null, area: null };
}

/** Endereço de um ano ou projeto no diretório (sem nada do que estava aberto antes). */
export function hrefGlobal(ano: string | null, projetoId: string | null = null): string {
  const params = new URLSearchParams();
  if (ano) params.set("ano", ano);
  if (projetoId) params.set("projetoId", projetoId);
  const qs = params.toString();
  return qs ? `/arquivos?${qs}` : "/arquivos";
}

export function rotuloProjeto(p: { codigo: string; nome: string }): string {
  return `${p.codigo} · ${p.nome}`;
}

/** Pastas da raiz (os anos, do mais recente) ou de um ano (os projetos dele). */
export function pastasGlobais(ano: string | null, anos: AnoDoDiretorio[]): PastaNaLista[] {
  if (ano === null) {
    return anos.map((a) => ({
      tipo: "ano",
      chave: `ano:${a.ano}`,
      rotulo: String(a.ano),
      titulo: null,
      status: null,
      disciplinaNome: null,
      total: a.total,
      destino: destinoGlobal(String(a.ano), null),
      zip: null,
    }));
  }
  const doAno = anos.find((a) => String(a.ano) === ano);
  if (!doAno) return [];
  return doAno.projetos.map((p) => ({
    tipo: "projeto",
    chave: `projeto:${p.projetoId}`,
    rotulo: rotuloProjeto(p),
    titulo: null,
    status: null,
    disciplinaNome: null,
    total: p.total,
    destino: destinoGlobal(ano, p.projetoId),
    // Projeto inteiro não vira .zip, como a raiz da aba do projeto: o pacote seria grande demais.
    zip: null,
  }));
}

/**
 * Trechos da trilha ACIMA do nível aberto, com endereço — "Todos os projetos › 2026". O nível
 * aberto (o ano, ou o projeto) é a raiz da trilha de quem desenha, sem link.
 */
export function trilhaGlobal(ano: string | null, projeto: { projetoId: string } | null): { rotulo: string; href: string }[] {
  if (ano === null) return [];
  const inicio = [{ rotulo: "Todos os projetos", href: hrefGlobal(null) }];
  if (projeto) inicio.push({ rotulo: ano, href: hrefGlobal(ano) });
  return inicio;
}
