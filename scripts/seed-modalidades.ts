import "dotenv/config";
import { semearModalidadesPadrao } from "../src/modules/licitacoes/modalidades/queries";

async function main() {
  const total = await semearModalidadesPadrao();
  console.log(`Modalidades padrão semeadas/garantidas: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
