# Lote 5a — Trava de validação + Reservatórios + Corrente e demanda

Desenho: [../specs/2026-11-02-lote5-calculadoras-instalacoes-design.md](../specs/2026-11-02-lote5-calculadoras-instalacoes-design.md).
O dono pulou as perguntas em 02/11/2026; as decisões estão no desenho (marcadas "decisão do agente").

## Tarefas

- [x] **Trava de validação.** `registry.ts`: `exigeValidacao`, `validacao`, `situacaoValidacao`, `ferramentaVisivel`
  (testes em `registry.test.ts`). Servidor: página `[key]` (404), `salvarCalculo` (recusa; recusa também vínculo a
  projeto/disciplina, para o `autoStore` não gravar no Pacote A), `buscarCalculo` e `abrirCalculo` (cálculo salvo de
  ferramenta que voltou para validação só abre para quem gere). Galeria esconde e mostra o selo "Em validação" a quem gere.
  Memória sai com "EM VALIDAÇÃO, não usar em projeto" no subtítulo.
- [x] **Reservatórios** (`reservatorios`): `calc/reservoir.ts` + teste, formulário, memória, `.shcalc`.
- [x] **Corrente e demanda** (`corrente-demanda`): `calc/electrical-demand.ts` + teste, formulário com lista de cargas
  (menu de contexto + ⋯ pelo descritor `acoes-carga.ts`), memória, `.shcalc`.
- [x] Fichas de validação em `docs/engenharia/validacao/` (fórmulas, tabelas, hipóteses, casos de teste).
- [x] Correção de passagem: `salvarCalculo` gravava `versaoCalc = 1` fixo; agora grava `versaoCalcDe(ferramenta)`.
- [x] `SalvarDialog`: o título sugerido passou a ser relido a cada abertura (nascia vazio de valores).
- [ ] Guia ilustrado das duas calculadoras (depois da validação).
- [ ] Manual (`docs/manual/`): só depois da validação — hoje a equipe não vê as calculadoras.

## Decisões de execução (do agente)

- Sem permissão nova: a trava usa `ferramentas:gerir` (supervisor e administrativo já têm no perfil-base). Se o dono
  quiser "só engenheiro", vira `ferramentas:validar` com migration por par novo — pedido à parte.
- Sem migração e sem seed neste lote.
- Chaves publicadas: `reservatorios`, `corrente-demanda` (nunca renomear).
- Campos do esquema em português (`diasReserva`, `potenciaW`…) seguem o padrão do módulo ferramentas e são persistidos
  em `entradasJson` — não renomear.

## Depende do engenheiro (não vai ao ar sem isso)

Tudo. Ver as duas fichas: tabela de consumo por unidade, 2 dias, 60/40, RTI; Tabelas 40 e 42 da NBR 5410, soma
aritmética de kVA, alerta FCT×FCA < 0,5. Registrar com o commit descrito no fim de cada ficha.

## Próximos sublotes

5b bombas (recalque e piscina) → 5c destino final de esgoto → 5d aba Estudos (projeto, com migração).
