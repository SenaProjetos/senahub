import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { removerArquivo, resolverCaminho } from "@/lib/storage";

/**
 * Regra única de "de quem é este arquivo no disco" para os arquivos de `Upload`.
 *
 * Até 2026-10-20 o contador de versão da rota de upload não via a lixeira. Reenviar um arquivo que
 * estava na lixeira gravava no MESMO caminho físico (o número da versão entra no nome), e a purga da
 * lixeira, 30 dias depois, apagava o arquivo da linha viva ("Arquivo indisponível no disco.").
 * Duas defesas, e as duas valem para qualquer código que grave ou apague arquivo de Upload:
 *  - gravar só em caminho RESERVADO (`reservarCaminhoLivre`): nenhuma linha usa e o disco não tem;
 *  - apagar só arquivo SEM DONO (`removerArquivoDeUploadSemDono`): linhas antigas que já dividem
 *    caminho continuam no banco de produção.
 *
 * O `where` das duas vê todas as linhas: as da lixeira (`excluidoEm`) e as substituídas
 * (`substituidoPorId`), que as extensões do Prisma escondem por padrão.
 */

const TODAS = { excluidoEm: { not: undefined }, substituidoPorId: { not: undefined } } as const;

/** Quantas linhas de Upload (em qualquer estado) apontam para este caminho. */
async function donosDoCaminho(caminho: string): Promise<number> {
  return prisma.upload.count({ where: { caminho, ...TODAS } });
}

/**
 * Apaga do disco o arquivo de um Upload SÓ se nenhuma linha de Upload ainda aponta para o mesmo
 * `caminho`. Chamar DEPOIS de apagar a linha (ou, num envio que falhou, antes de criá-la).
 */
export async function removerArquivoDeUploadSemDono(caminho: string): Promise<boolean> {
  if ((await donosDoCaminho(caminho)) > 0) return false;
  await removerArquivo(caminho);
  return true;
}

/**
 * Escolhe o primeiro caminho livre a partir de `inicial` (`montar(n)` monta o caminho da versão n) e
 * o RESERVA criando o arquivo vazio com `wx` — criação exclusiva do sistema de arquivos, então dois
 * envios simultâneos do mesmo nome nunca recebem o mesmo caminho. Livre = nenhuma linha de Upload
 * aponta para ele e o disco não tem o arquivo (também pega colisão de slug, que o contador por
 * `nomeArquivo` não vê: `Planta.dwg` × `planta.dwg`). Quem chama sobrescreve o arquivo vazio com o
 * conteúdo; se desistir, apaga com `removerArquivoDeUploadSemDono`.
 *
 * Devolve o caminho e o `n` usado — o `n` é só do nome físico; a versão lógica é de quem chama.
 */
export async function reservarCaminhoLivre(
  montar: (n: number) => string,
  inicial: number,
): Promise<{ caminho: string; n: number }> {
  for (let n = inicial; n < inicial + 1000; n++) {
    const caminho = montar(n);
    if ((await donosDoCaminho(caminho)) > 0) continue;
    const absoluto = resolverCaminho(caminho);
    await fs.mkdir(path.dirname(absoluto), { recursive: true });
    try {
      const fh = await fs.open(absoluto, "wx");
      await fh.close();
      return { caminho, n };
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw erro;
    }
  }
  throw new Error("Não foi possível reservar um nome livre para o arquivo.");
}
