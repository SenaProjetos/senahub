/**
 * Smoke do "Arquivo indisponível no disco" (2026-10-20) contra o banco de dev.
 *
 * O bug: o contador de versão da rota de upload não via a lixeira. Reenviar um arquivo que estava na
 * lixeira gravava no MESMO caminho físico, e a purga da lixeira apagava o arquivo da linha viva.
 * Cobre as duas metades da correção:
 *  - o `where` do contador (mesma forma da rota) enxerga a linha da lixeira e a substituída;
 *  - `removerArquivoDeUploadSemDono` não apaga arquivo que outra linha (viva, na lixeira ou
 *    substituída) ainda usa, e apaga quando ninguém mais usa.
 *
 * Cria cliente + projeto + arquivos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:lixeira-caminho
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { existeArquivo, resolverCaminho, salvarArquivo } from "../src/lib/storage";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { removerArquivoDeUploadSemDono, reservarCaminhoLivre } from "../src/modules/uploads/arquivo-fisico";
import { nomeFisico } from "../src/modules/uploads/caminho";

async function main() {
  const tag = `SMKLIX_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const usuario = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!usuario) throw new Error("Banco de dev sem usuário ativo.");

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: `${tag}_proj`,
        clienteId: cliente.id,
        disciplinas: { create: [{ disciplinaTextoLegado: "Elétrico", ordem: 0 }] },
      },
      include: { disciplinas: true },
    });
  });
  const disciplinaId = projeto.disciplinas[0].id;
  const nome = `${tag}-DET-R00.dwg`;
  const caminho = `smoke/${tag}/ELE-${tag.toLowerCase()}.dwg`;
  const caminhoSozinho = `smoke/${tag}/sozinho.dwg`;

  try {
    const doc = await prisma.documentoDisciplina.create({ data: { disciplinaId, chave: `A/${nome}`, nomeArquivo: nome } });
    const base = { disciplinaId, documentoId: doc.id, pacote: "A" as const, nomeArquivo: nome, tamanho: 4, hashSha256: "0".repeat(64), autorId: usuario.id };

    // Envio original, depois mandado para a lixeira.
    const naLixeira = await prisma.upload.create({ data: { ...base, caminho, versao: 1, excluidoEm: new Date(Date.now() - 31 * 86_400_000) } });

    // 1. O contador (mesmo `where` da rota) precisa ver a linha da lixeira — senão o reenvio repete a v1.
    const anterior = await prisma.upload.findFirst({
      where: { substituidoPorId: { not: undefined }, excluidoEm: { not: undefined }, disciplinaId, pacote: "A", nomeArquivo: nome },
      orderBy: { versao: "desc" },
    });
    check("contador da rota enxerga a versão que está na lixeira", anterior?.id === naLixeira.id);
    const semEscape = await prisma.upload.findFirst({
      where: { substituidoPorId: { not: undefined }, disciplinaId, pacote: "A", nomeArquivo: nome },
    });
    check("(controle) o filtro antigo NÃO enxergava — era o bug", semEscape === null);

    // 2. Linhas antigas que já dividem caminho (dado de produção anterior à correção).
    await salvarArquivo(caminho, Buffer.from("dwg!"));
    const vivo = await prisma.upload.create({ data: { ...base, caminho, versao: 1 } });

    await prisma.upload.delete({ where: { id: naLixeira.id } }); // purga da linha da lixeira
    const apagou = await removerArquivoDeUploadSemDono(caminho);
    check("purga da linha da lixeira NÃO apaga o arquivo que a linha viva usa", !apagou && (await existeArquivo(caminho)));

    // 3. Linha substituída também é dona do arquivo (fica no disco e no histórico).
    await prisma.upload.update({ where: { id: vivo.id }, data: { substituidoPorId: "outro", substituidoEm: new Date() } });
    check("linha substituída segura o arquivo", !(await removerArquivoDeUploadSemDono(caminho)) && (await existeArquivo(caminho)));

    // 4. Linha da lixeira também segura (ainda restaurável).
    await prisma.upload.update({ where: { id: vivo.id }, data: { substituidoPorId: null, excluidoEm: new Date() } });
    check("linha na lixeira segura o arquivo", !(await removerArquivoDeUploadSemDono(caminho)) && (await existeArquivo(caminho)));

    // 5. Sem nenhuma linha, o arquivo sai.
    await prisma.upload.delete({ where: { id: vivo.id } });
    check("sem dono, o arquivo é apagado", (await removerArquivoDeUploadSemDono(caminho)) && !(await existeArquivo(caminho)));

    // 6. Envio que falhou antes de criar a linha (arquivo só dele) é limpo.
    await salvarArquivo(caminhoSozinho, Buffer.from("x"));
    check("envio que falhou sem linha nenhuma limpa o arquivo", (await removerArquivoDeUploadSemDono(caminhoSozinho)) && !(await existeArquivo(caminhoSozinho)));

    // 7. Reserva do caminho: pula caminho de outra linha (mesmo sem arquivo no disco), arquivo solto no
    //    disco, colisão de slug e envio simultâneo.
    const montar = (nomeArq: string) => (n: number) => `smoke/${tag}/r/${nomeFisico({ nomeArquivo: nomeArq, siglaDisciplina: "ELE", versao: n })}`;
    const daLinha = await prisma.upload.create({ data: { ...base, caminho: montar(nome)(1), versao: 1, excluidoEm: new Date() } });
    const r1 = await reservarCaminhoLivre(montar(nome), 1);
    check("caminho de linha da lixeira (sem arquivo no disco) não é reaproveitado", r1.n === 2 && r1.caminho !== daLinha.caminho);
    const r2 = await reservarCaminhoLivre(montar(nome), 1);
    check("arquivo já reservado no disco faz pular para o próximo número", r2.n === 3);
    const slug1 = await reservarCaminhoLivre(montar("Planta Baixa.dwg"), 1);
    const slug2 = await reservarCaminhoLivre(montar("planta-baixa.dwg"), 1);
    check("colisão de slug (Planta Baixa × planta-baixa) recebe caminhos diferentes", slug1.caminho.toLowerCase() !== slug2.caminho.toLowerCase());
    const simultaneos = await Promise.all(Array.from({ length: 5 }, () => reservarCaminhoLivre(montar(`${tag}-sim.pdf`), 1)));
    check("5 reservas simultâneas do mesmo nome = 5 caminhos distintos", new Set(simultaneos.map((x) => x.caminho)).size === 5);
    await prisma.upload.delete({ where: { id: daLinha.id } });
  } finally {
    await rm(resolverCaminho(`smoke/${tag}`), { recursive: true, force: true });
    await prisma.upload.deleteMany({ where: { disciplinaId } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(ok ? "\nTudo certo." : "\nHÁ FALHAS.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
