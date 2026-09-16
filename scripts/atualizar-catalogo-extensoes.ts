import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/**
 * Reconcilia o catálogo de extensões (`ExtensaoArquivo`) com a lista viva em
 * `src/modules/uploads/nomenclatura/extensoes-iniciais.ts`.
 *
 * Necessário porque a carga inicial do catálogo foi feita direto na migration
 * `20260915170000_motor_nomenclatura_sinonimos_extensoes` (INSERT estático) — editar
 * `extensoes-iniciais.ts` depois disso não afeta bancos já semeados nem `prisma migrate deploy`
 * (a migration não lê o arquivo em runtime). Rodar este script à mão sempre que a lista mudar,
 * inclusive no primeiro deploy desta branch em produção.
 *
 * Idempotente: reclassificação usa `update` (só aplica os campos listados); extensão nova
 * usa `findUnique` + `create` (não sobrescreve nada que já exista).
 */

const RECLASSIFICAR = [
  { extensao: "bak", categoria: "backup_software", ehBackup: true, ehTemporario: false },
  { extensao: "sv$", categoria: "backup_software", ehBackup: true, ehTemporario: false },
  { extensao: "zip", ehBackup: true },
  { extensao: "rar", ehBackup: true },
  { extensao: "7z", ehBackup: true },
] as const;

const NOVAS = [
  { extensao: "skp", categoria: "modelo_bim", software: "SketchUp" },
  { extensao: "skb", categoria: "backup_software", software: "SketchUp", ehBackup: true },
  { extensao: "pln", categoria: "modelo_bim", software: "ArchiCAD" },
  { extensao: "gsm", categoria: "modelo_bim", software: "ArchiCAD" },
  { extensao: "nwd", categoria: "modelo_bim", software: "Navisworks" },
  { extensao: "obj", categoria: "modelo_bim" },
  { extensao: "bpn", categoria: "backup_software", ehBackup: true },
] as const;

async function main() {
  for (const r of RECLASSIFICAR) {
    const { extensao, ...data } = r;
    const antes = await prisma.extensaoArquivo.findUnique({ where: { extensao } });
    if (!antes) {
      console.log(`(pula, não existe) ${extensao}`);
      continue;
    }
    await prisma.extensaoArquivo.update({ where: { extensao }, data });
    console.log(`reclassificado: ${extensao}`, data);
  }
  const max0 = await prisma.extensaoArquivo.aggregate({ _max: { ordem: true } });
  let ordem = (max0._max.ordem ?? -1) + 1;
  for (const n of NOVAS) {
    const existe = await prisma.extensaoArquivo.findUnique({ where: { extensao: n.extensao } });
    if (existe) {
      console.log(`(já existe) ${n.extensao}`);
      continue;
    }
    await prisma.extensaoArquivo.create({
      data: {
        extensao: n.extensao,
        categoria: n.categoria,
        software: "software" in n ? n.software : null,
        ehBackup: "ehBackup" in n ? n.ehBackup : false,
        ehTemporario: false,
        ehConteiner: false,
        ordem: ordem++,
      },
    });
    console.log(`criado: ${n.extensao}`);
  }
}

main().finally(() => prisma.$disconnect());
