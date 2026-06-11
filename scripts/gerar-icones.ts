import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Gera os ícones PWA (192/512, normal e maskable) a partir do símbolo da marca,
 * sobre fundo Navy (#0D1428). Rode com: npx tsx scripts/gerar-icones.ts
 */
const NAVY = "#0D1428";
const OUT = path.join(process.cwd(), "public", "icons");
const LOGO = path.join(process.cwd(), "public", "MARCA", "logo_light.svg");

async function gerar(size: number, pad: number, nome: string) {
  const svg = await readFile(LOGO);
  const inner = size - pad * 2;
  const logo = await sharp(svg, { density: 400 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT, nome));

  console.log(`✔ ${nome}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await gerar(192, 28, "icon-192.png");
  await gerar(512, 76, "icon-512.png");
  // maskable: mais respiro (safe zone de 20%)
  await gerar(512, 102, "icon-maskable-512.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
