-- Contas provisórias (2026-11-01): o contador autorizou criarmos no nosso plano de referência as contas que faltavam no
-- dele (ISS a Recolher, ISS/INSS a Compensar, Cartão de Crédito a Pagar, Adiantamento de Sócios); ele se adequa quando
-- criar as reais no Alterdata. O contrato da exportação é a CLASSIFICAÇÃO (decisão 2026-10-16), não o reduzido interno
-- (bloco 9101–9105, só nosso). As contas em si entram pelo `npm run contabil:importar-plano`; aqui só o de-para.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt") VALUES
  (gen_random_uuid()::text, 'imposto_recolher', 'iss', 9101, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_compensar', 'iss', 9102, false, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'imposto_compensar', 'inss', 9103, false, CURRENT_TIMESTAMP)
ON CONFLICT ("alvo", "alvoId") DO NOTHING;

-- Cartões já cadastrados: o da empresa vai para Cartão de Crédito a Pagar; o pessoal do sócio (a fatura é o reembolso que a
-- empresa deve a ele) para Adiantamento de Sócios. Cartão criado depois se liga na aba De-para.
INSERT INTO "de_para_contabil" ("id", "alvo", "alvoId", "contaReduzido", "naoExportar", "updatedAt")
SELECT gen_random_uuid()::text, 'cartao'::"AlvoDeParaContabil", c."id", CASE WHEN c."tipo" = 'pessoal' THEN 9105 ELSE 9104 END, false, CURRENT_TIMESTAMP
FROM "cartao_credito" c
ON CONFLICT ("alvo", "alvoId") DO NOTHING;
