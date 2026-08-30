import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { escopoCredencial, permissoesDoViewer, buscarCredencial } from "../src/modules/acessos/queries";
import { criptografarSenha, descriptografarSenha } from "../src/lib/encryption";
import type { ViewerCofre } from "../src/modules/acessos/service";

/**
 * Smoke do cofre de Acessos — cenários §84 da spec, contra o banco de dev.
 *
 * Existe porque a defesa de IDOR do módulo é um `where` do Prisma: ler o código não prova que
 * ele filtra, e vitest aqui roda sem sessão nem HTTP. Este script cria o cenário, consulta como
 * cada perfil e apaga tudo no fim.
 *
 * Cobre escopo de leitura (§84 A-E), soft delete e criptografia em repouso (§83/§90).
 * Revelar/copiar entram na 2c, junto das actions que os implementam.
 */

let falhas = 0;
function checar(nome: string, condicao: boolean) {
  console.log(`${condicao ? "  ✔" : "  ✘"} ${nome}`);
  if (!condicao) falhas++;
}

const marca = `smoke-acessos-${Date.now()}`;

async function main() {
  console.log("Preparando cenário...\n");

  const perfil = await prisma.perfilAcesso.findFirstOrThrow({ select: { id: true } });

  const [dono, autorizado, limitado, estranho] = await Promise.all(
    ["dono", "autorizado", "limitado", "estranho"].map((papel) =>
      prisma.user.create({
        data: {
          name: `${marca}-${papel}`,
          email: `${marca}-${papel}@teste.local`,
          role: "clt",
          setor: papel === "limitado" ? "engenharia" : null,
          perfilId: papel === "autorizado" ? perfil.id : null,
        },
        select: { id: true, perfilId: true, setor: true },
      }),
    ),
  );

  const categoria = await prisma.credencialCategoria.create({
    data: { nome: `${marca}-cat` },
    select: { id: true },
  });

  const cred = await prisma.credencial.create({
    data: {
      nome: `${marca}-CBMMG`,
      categoriaId: categoria.id,
      responsavelId: dono.id,
      compartilhamentos: {
        create: [
          // Autorizado: alcança por PERFIL e pode revelar.
          { tipoAlvo: "perfil", alvoId: perfil.id, podeVerCadastro: true, podeVerCredencial: true },
          // Limitado: alcança por SETOR, só o cadastro.
          { tipoAlvo: "setor", alvoId: "engenharia", podeVerCadastro: true, podeVerCredencial: false },
        ],
      },
    },
    select: { id: true },
  });

  // Credencial que ninguém alcança, para provar que a listagem não a devolve.
  const secreta = await prisma.credencial.create({
    data: { nome: `${marca}-SECRETA`, categoriaId: categoria.id },
    select: { id: true },
  });

  const viewer = (u: { id: string; perfilId: string | null; setor: string | null }, superUsuario = false): ViewerCofre => ({
    id: u.id,
    perfilId: u.perfilId,
    setor: u.setor as ViewerCofre["setor"],
    superUsuario,
  });

  async function alcanca(v: ViewerCofre, id: string) {
    return (await prisma.credencial.count({ where: { AND: [{ id }, escopoCredencial(v)] } })) > 0;
  }

  console.log("Cenário A — administrador (superUsuario)");
  const admin = viewer(estranho, true);
  checar("alcança a credencial compartilhada", await alcanca(admin, cred.id));
  checar("alcança até a credencial sem compartilhamento", await alcanca(admin, secreta.id));
  checar("permissões resolvem tudo true", (await permissoesDoViewer(admin, cred.id))?.verCredencial === true);

  console.log("\nCenário B — autorizado (compartilhado por perfil, com credencial)");
  const vB = viewer(autorizado);
  checar("alcança o cadastro", await alcanca(vB, cred.id));
  const pB = await permissoesDoViewer(vB, cred.id);
  checar("pode ver o cadastro", pB?.verCadastro === true);
  checar("pode revelar a credencial", pB?.verCredencial === true);
  checar("NÃO alcança a credencial não compartilhada", !(await alcanca(vB, secreta.id)));

  console.log("\nCenário C — limitado (compartilhado por setor, SEM credencial)");
  const vC = viewer(limitado);
  checar("alcança o cadastro", await alcanca(vC, cred.id));
  const pC = await permissoesDoViewer(vC, cred.id);
  checar("pode ver o cadastro", pC?.verCadastro === true);
  checar("NÃO pode revelar a credencial (§27)", pC?.verCredencial === false);

  console.log("\nCenário D — estranho (sem compartilhamento nenhum)");
  const vD = viewer(estranho);
  checar("NÃO alcança a credencial (não encontra o registro)", !(await alcanca(vD, cred.id)));
  const pD = await permissoesDoViewer(vD, cred.id);
  checar("permissões negam tudo", pD?.verCadastro === false && pD?.verCredencial === false);

  console.log("\nCenário E — responsável sem compartilhamento explícito");
  const vE = viewer(dono);
  checar("alcança o próprio cadastro", await alcanca(vE, cred.id));
  const pE = await permissoesDoViewer(vE, cred.id);
  checar("pode ver e editar o cadastro", pE?.verCadastro === true && pE?.editar === true);
  checar("NÃO revela a credencial só por ser responsável", pE?.verCredencial === false);

  console.log("\nSoft delete");
  await prisma.credencial.update({ where: { id: cred.id }, data: { deletadoEm: new Date() } });
  checar("credencial deletada some para o autorizado", !(await alcanca(vB, cred.id)));
  checar("credencial deletada some até para o admin", !(await alcanca(admin, cred.id)));
  checar(
    "com incluirDeletadas, o admin volta a alcançar",
    (await prisma.credencial.count({
      where: { AND: [{ id: cred.id }, escopoCredencial(admin, { incluirDeletadas: true })] },
    })) > 0,
  );

  console.log("\nCriptografia em repouso (§83/§90)");
  const SENHA = "S3nh@-do-portal-CBMMG";
  const USUARIO = "projetos@senaengenharia.com.br";
  await prisma.credencial.update({
    where: { id: secreta.id },
    data: {
      usuarioEncriptado: JSON.stringify(await criptografarSenha(USUARIO)),
      senhaEncriptada: JSON.stringify(await criptografarSenha(SENHA)),
    },
  });

  // Lê a coluna CRUA, como quem abrisse o banco ou o dump — é o que §90 quer garantir.
  const [cru] = await prisma.$queryRaw<Array<{ senhaEncriptada: string; usuarioEncriptado: string }>>`
    SELECT "senhaEncriptada", "usuarioEncriptado" FROM credencial WHERE id = ${secreta.id}`;
  checar("a coluna não contém a senha em claro", !cru.senhaEncriptada.includes(SENHA));
  checar("a coluna não contém o usuário em claro", !cru.usuarioEncriptado.includes(USUARIO));
  checar(
    "o payload gravado é o envelope AES-GCM",
    (() => {
      const p = JSON.parse(cru.senhaEncriptada);
      return typeof p.iv === "string" && typeof p.authTag === "string" && p.keyVersion === 1;
    })(),
  );
  checar(
    "decifra de volta ao original",
    (await descriptografarSenha(JSON.parse(cru.senhaEncriptada))) === SENHA,
  );
  checar(
    "duas gravações da MESMA senha geram cifras distintas (IV por operação)",
    JSON.stringify(await criptografarSenha(SENHA)) !== JSON.stringify(await criptografarSenha(SENHA)),
  );

  console.log("\nLeitura nunca devolve campo cifrado");
  const lido = await buscarCredencial(admin, secreta.id);
  checar(
    "buscarCredencial não expõe senhaEncriptada nem usuarioEncriptado",
    lido !== null &&
      !("senhaEncriptada" in lido.credencial) &&
      !("usuarioEncriptado" in lido.credencial),
  );

  console.log("\nLimpando...");
  await prisma.credencial.deleteMany({ where: { nome: { startsWith: marca } } });
  await prisma.credencialCategoria.delete({ where: { id: categoria.id } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });

  console.log(falhas === 0 ? "\n✔ SMOKE ACESSOS: tudo passou" : `\n✘ SMOKE ACESSOS: ${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error("✘ erro:", e);
  await prisma.credencial.deleteMany({ where: { nome: { startsWith: marca } } }).catch(() => {});
  await prisma.credencialCategoria.deleteMany({ where: { nome: { startsWith: marca } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { startsWith: marca } } }).catch(() => {});
  await prisma.$disconnect();
  process.exitCode = 1;
});
