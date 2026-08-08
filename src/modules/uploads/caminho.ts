/**
 * Convenção ÚNICA de pasta e nome físico de arquivo de disciplina.
 *
 * Fonte da verdade extraída de `app/api/uploads/route.ts` (a rota de upload é a convenção
 * vencedora). Antes desta extração, `ferramentas/auto-store.ts` compunha o mesmo caminho com
 * regra própria — usava o NOME da disciplina onde a rota usa a SIGLA, e omitia o prefixo de sigla
 * no arquivo. Resultado: a mesma disciplina gravava em dois diretórios irmãos (`…/EST/` e
 * `…/Estrutural/`), e só um deles era lido por qualquer outro caminho do sistema.
 *
 * Puro (sem I/O, sem Prisma) para ser testável. O lookup da sigla no `DisciplinaCatalogo` fica
 * a cargo de quem chama — ver `siglaDisciplina`.
 *
 * ATENÇÃO: mudar estas funções muda o layout do storage APENAS para arquivos novos. Arquivos já
 * gravados continuam onde estão e seguem legíveis, porque toda leitura usa o `Upload.caminho`
 * persistido por linha — o caminho nunca é recomposto a partir da disciplina.
 */
import { slug } from "@/lib/storage";
import { extensao } from "./service";

/**
 * Diretório-base da disciplina, relativo ao `STORAGE_BASE_PATH`:
 * `{ano}/{cliente}/{codigo}_{projeto}/{SIGLA}`.
 *
 * `siglaDisciplina` é o `DisciplinaCatalogo.codigo` (ex.: "ELE"). Disciplina sem sigla no
 * catálogo — ou fora dele, já que o vínculo é por nome e não por FK — cai no nome inteiro.
 */
export function baseDirDisciplina(args: {
  ano: number;
  clienteNome: string;
  projetoCodigo: string;
  projetoNome: string;
  disciplinaNome: string;
  siglaDisciplina: string | null;
}): string {
  return [
    String(args.ano),
    slug(args.clienteNome),
    `${args.projetoCodigo}_${slug(args.projetoNome)}`,
    args.siglaDisciplina ? slug(args.siglaDisciplina) : slug(args.disciplinaNome),
  ].join("/");
}

/**
 * Nome do arquivo em disco: `{SIGLA}-{slug(base)}[__v{n}].{ext}` (ex.: `ELE-planta__v2.dwg`).
 *
 * NÃO é o nome de exibição — `Upload.nomeArquivo` guarda o nome original do cliente, e é ele
 * (não este) que o validador da Lista Mestre (`foraDoPadrao`) enxerga. Os dois namespaces são
 * disjuntos de propósito.
 */
export function nomeFisico(args: {
  nomeArquivo: string;
  siglaDisciplina: string | null;
  versao: number;
}): string {
  const ext = extensao(args.nomeArquivo);
  const base = ext ? args.nomeArquivo.slice(0, -(ext.length + 1)) : args.nomeArquivo;
  const comSigla = args.siglaDisciplina ? `${args.siglaDisciplina}-${slug(base)}` : slug(base);
  const sufixo = ext ? `.${ext}` : "";
  return args.versao > 1 ? `${comSigla}__v${args.versao}${sufixo}` : `${comSigla}${sufixo}`;
}
