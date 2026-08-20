/**
 * Rótulo secundário de disciplina: o nome do CATÁLOGO, exibido junto ao nome que a disciplina
 * carrega — e **só quando os dois diferem**.
 *
 * Existe por causa do estado que a F1.21 deixou. A disciplina do projeto guarda o texto original
 * (`disciplinaTextoLegado`) e, desde a F1.19c, uma FK opcional para `DisciplinaCatalogo`. Depois da
 * consolidação, produção tem 6 disciplinas cujo texto **não** é o nome do catálogo:
 * `Ar condicionado (ARC)` e `Exaustão (EXT)` → `Climatização (AVAC)`, `Gases` → `Gás`, e as três
 * grafias compostas → `Cabeamento`.
 *
 * Por que não simplesmente exibir o nome do catálogo no lugar do texto: no projeto 260023 as duas
 * primeiras apontam para a MESMA entrada, por decisão do dono (são entregas separadas naquele
 * contrato). Trocar o rótulo renderizaria "Climatização (AVAC)" duas vezes, apagando a distinção.
 * O texto original é o que diferencia as linhas; o catálogo é a classificação. Mostrar os dois,
 * com o catálogo em segundo plano, resolve sem escolher um lado.
 *
 * Retorna `null` quando não há o que acrescentar — sem FK, ou nome igual ao do catálogo. Isso
 * mantém a tela silenciosa no caso normal: das disciplinas de produção, só essas 6 ganham o rótulo.
 *
 * A comparação é EXATA, de propósito: os backfills da F1.19c/F1.21 casaram por nome exato, então
 * "igual ao catálogo" aqui significa exatamente a mesma string que casou lá. Normalizar (caixa,
 * acento) faria esta função discordar de quem gravou a FK.
 */
export function rotuloCatalogo(
  nome: string,
  catalogoNome: string | null | undefined,
): string | null {
  if (!catalogoNome) return null;
  return catalogoNome === nome ? null : catalogoNome;
}
