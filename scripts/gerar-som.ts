import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Gera um som de notificação curto (WAV PCM 16-bit mono) — dois tons suaves
 * com fade. Rode com: npx tsx scripts/gerar-som.ts
 */
const SAMPLE_RATE = 44100;

function tom(freq: number, durMs: number, fadeMs = 12): number[] {
  const n = Math.floor((SAMPLE_RATE * durMs) / 1000);
  const fade = Math.floor((SAMPLE_RATE * fadeMs) / 1000);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let amp = 0.35;
    if (i < fade) amp *= i / fade;
    if (i > n - fade) amp *= (n - i) / fade;
    out.push(Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * amp);
  }
  return out;
}

function wav(samples: number[]): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE((s * 32767) | 0, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function main() {
  const samples = [...tom(880, 110), ...tom(1318.5, 170)];
  const dir = path.join(process.cwd(), "public", "sounds");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "notificacao.wav"), wav(samples));
  console.log("✔ public/sounds/notificacao.wav");
}

main();
