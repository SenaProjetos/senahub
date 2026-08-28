# E6 Parte B — Limpeza de ModeloContrato

Scripts para verificar e dropar `modelo_contrato` em produção de forma segura.

## Opção 1: Python (recomendado — portável)

```bash
pip install psycopg2-binary
export DATABASE_URL="postgresql://user:pass@host:5432/senahub_remake"
python scripts/e6-limpar-modelo-contrato.py
```

**Fluxo:**
1. Conecta ao banco
2. Conta linhas e mede conteúdo
3. Se vazio/rascunho → dropa automaticamente ✅
4. Se texto real → exporta CSV + JSON para `backups/modelo-contrato-YYYYMMDD-HHMMSS/` e para ⚠️

**Automático só quando:**
- `count = 0` (tabela vazia)
- `count > 0 BUT sum(length) < 1000 bytes` (rascunho)

**Manual quando:** sum > 1000 bytes (precisa revisar exports antes de dropar)

---

## Opção 2: Shell (Linux/Mac)

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/senahub_remake"
bash scripts/e6-limpar-modelo-contrato.sh
```

Fluxo idêntico ao Python. Requer `psql` no PATH.

---

## Opção 3: SQL puro (pgAdmin ou linha de comando)

```bash
psql $DATABASE_URL -f scripts/e6-limpar-modelo-contrato.sql
```

Mostra status. Descomente linhas manualmente para dropar (não automático — segurança).

---

## Resultado esperado

### Cenário 1: Vazio (count=0)
```
🔍 Verificando ModeloContrato...
  Contagem: 0 linhas
  Tamanho total: 0 bytes
✅ Vazio — procedendo com DROP.
✅ Tabela dropada com sucesso.
```

### Cenário 2: Rascunho (count>0, size<1000)
```
🔍 Verificando ModeloContrato...
  Contagem: 3 linhas
  Tamanho total: 245 bytes
⚠️ Conteúdo vazio — procedendo com DROP.
✅ Tabela dropada com sucesso.
```

### Cenário 3: Texto real (size>1000)
```
🔍 Verificando ModeloContrato...
  Contagem: 5 linhas
  Tamanho total: 47892 bytes
⚠️ TEXTO REAL (47892 bytes) — EXPORTANDO antes de dropar...
✅ CSV: backups/modelo-contrato-20260827-143022/modelo_contrato.csv
✅ JSON: backups/modelo-contrato-20260827-143022/modelo_contrato.json

📋 PRÓXIMOS PASSOS (MANUAL):
  1. Revise os arquivos em backups/modelo-contrato-20260827-143022/
  2. Quando tiver certeza, execute:
     python scripts/e6-limpar-modelo-contrato.py --drop
  3. Depois execute o deploy do código (E6 Parte B)
```

---

## Depois de dropar

Após qualquer um dos cenários fazer DROP com sucesso:

```bash
# 1. Aplica código da E6 Parte B
git pull
git checkout -- src/  # se tiver mudanças locais
npm run build
npm test

# 2. Deploy normal
```

---

## Rollback (se precisar)

Se exportou o JSON, pode restaurar:

```sql
INSERT INTO modelo_contrato (id, nome, categoria, conteudo, ativo, createdAt, updatedAt)
SELECT 
  id, nome, categoria, conteudo, ativo, createdAt, updatedAt
FROM json_to_recordset('<JSON do arquivo>'::json) AS t(
  id text,
  nome text,
  categoria text,
  conteudo text,
  ativo boolean,
  createdAt timestamp,
  updatedAt timestamp
);
```

(Recomendado só se dropar for erro — a tabela é LEGADO, nada depende dela.)

---

## Troubleshooting

**"DATABASE_URL não configurado"**
```bash
export DATABASE_URL="postgresql://user:pass@host:5432/senahub_remake"
# Depois reexecute o script
```

**"psycopg2-binary" falta**
```bash
pip install psycopg2-binary
```

**Connection timeout**
- Rede: `host` e `port` estão corretos?
- Firewall: porta 5432 liberada?
- Credenciais: `user` e `pass` estão corretos?

**Tabela não existe**
- E6 já foi aplicado. Nada a fazer.
