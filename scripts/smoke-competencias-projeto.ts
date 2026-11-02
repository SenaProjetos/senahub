/**
 * Smoke do cartão "Competências que o projeto precisa" (Visão Geral do projeto) contra o banco de dev:
 * quem cobre cada necessidade (nível mínimo, validado antes de declarado, só gente interna e ativa),
 * nomes só quando pedidos, catálogo só quando pedido, necessidade única por projeto e cascata ao apagar.
 *
 * Cria cliente + projeto + usuários + competência throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:competencias-projeto
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { competenciasDoProjeto } from "../src/modules/rh/habilidades/queries";

async function main() {
  const tag = `SMKCOMP_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };

  const novoUsuario = (sufixo: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: { name: `${tag}_${sufixo}`, email: `${tag.toLowerCase()}_${sufixo}@smoke.local`, tipo: "interno", contratacao: "clt", perfil: { connect: { chave: "projetista_pj" } }, ativo: true, ...extra },
    });
  const validado = await novoUsuario("validado");
  const declarado = await novoUsuario("declarado");
  const abaixo = await novoUsuario("abaixo");
  const inativo = await novoUsuario("inativo", { ativo: false });
  const externo = await novoUsuario("externo", { tipo: "externo", contratacao: null });
  const usuarios = [validado, declarado, abaixo, inativo, externo].map((u) => u.id);

  const h = await prisma.habilidade.create({ data: { nome: `${tag} Revit`, categoria: "software", publicada: true } });
  const naoPublicada = await prisma.habilidade.create({ data: { nome: `${tag} Proposta`, categoria: "software", publicada: false } });
  const nivel = (userId: string, n: number, validadoEm: Date | null) =>
    prisma.userHabilidade.create({ data: { userId, habilidadeId: h.id, nivel: n, validadoEm } });
  await nivel(validado.id, 4, new Date());
  await nivel(declarado.id, 3, null);
  await nivel(abaixo.id, 2, new Date());
  await nivel(inativo.id, 5, new Date());
  await nivel(externo.id, 5, new Date());

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id } });
  });

  try {
    const vazio = await competenciasDoProjeto(projeto.id, { comNomes: true, comCatalogo: true });
    check("sem necessidade: lista vazia", vazio.necessidades.length === 0);
    check("catálogo traz só competência publicada", vazio.catalogo.some((c) => c.id === h.id) && !vazio.catalogo.some((c) => c.id === naoPublicada.id));

    const n = await prisma.necessidadeHabilidade.create({ data: { projetoId: projeto.id, habilidadeId: h.id, nivelMinimo: 3, observacao: "Modelagem" } });
    const unica = await prisma.necessidadeHabilidade
      .create({ data: { projetoId: projeto.id, habilidadeId: h.id, nivelMinimo: 4 } })
      .then(() => false)
      .catch(() => true);
    check("a mesma competência não entra duas vezes no projeto", unica);

    const comNomes = await competenciasDoProjeto(projeto.id, { comNomes: true, comCatalogo: false });
    const item = comNomes.necessidades[0];
    check("cobertura de nível 3: 1 validada + 1 só declarada (abaixo, inativo e externo ficam de fora)", item?.aptosValidados === 1 && item?.aptosDeclarados === 1, JSON.stringify(item));
    check("nomes: validado vem antes do declarado", item?.pessoas?.[0]?.nome === validado.name && item?.pessoas?.[1]?.nome === declarado.name);
    check("catálogo não vai quando não é pedido", comNomes.catalogo.length === 0);

    const semNomes = await competenciasDoProjeto(projeto.id, { comNomes: false, comCatalogo: false });
    check("sem permissão de Recursos: só a contagem, sem nomes", semNomes.necessidades[0]?.pessoas === null && semNomes.necessidades[0]?.aptosValidados === 1);

    await prisma.necessidadeHabilidade.update({ where: { id: n.id }, data: { nivelMinimo: 5 } });
    const exigente = await competenciasDoProjeto(projeto.id, { comNomes: false, comCatalogo: false });
    check("nível mínimo 5: ninguém cobre (lacuna)", exigente.necessidades[0]?.aptosValidados === 0 && exigente.necessidades[0]?.aptosDeclarados === 0);
  } finally {
    const antes = await prisma.necessidadeHabilidade.count({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } }).catch((e) => console.error("limpeza do projeto:", e));
    check("cascata: apagar o projeto leva as necessidades", antes > 0 && (await prisma.necessidadeHabilidade.count({ where: { projetoId: projeto.id } })) === 0);
    await prisma.cliente.delete({ where: { id: cliente.id } }).catch(() => {});
    await prisma.habilidade.deleteMany({ where: { id: { in: [h.id, naoPublicada.id] } } }).catch((e) => console.error("limpeza da competência:", e));
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } }).catch((e) => console.error("limpeza dos usuários:", e));
  }

  console.log(ok ? "\nTUDO CERTO" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
