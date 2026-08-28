#!/usr/bin/env python3
"""
E6 Parte B: verificar e limpar ModeloContrato em produção.
Uso: python scripts/e6-limpar-modelo-contrato.py
Requer: DATABASE_URL, psycopg2 (pip install psycopg2-binary)
"""

import os
import sys
import json
import csv
from datetime import datetime
from pathlib import Path

try:
    import psycopg2
    from urllib.parse import urlparse
except ImportError:
    print("❌ Dependência faltando. Instale com:")
    print("   pip install psycopg2-binary")
    sys.exit(1)


def main():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("❌ DATABASE_URL não configurado.")
        sys.exit(1)

    # Parse connection string
    parsed = urlparse(db_url)
    conn_params = {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "database": parsed.path.lstrip("/") or "senahub_remake",
        "user": parsed.username or "postgres",
        "password": parsed.password or "",
    }

    try:
        conn = psycopg2.connect(**conn_params)
        cur = conn.cursor()
    except Exception as e:
        print(f"❌ Falha ao conectar: {e}")
        sys.exit(1)

    print("🔍 Verificando ModeloContrato...")

    # Query 1: count e size
    try:
        cur.execute("SELECT count(*), COALESCE(sum(length(conteudo)), 0) FROM modelo_contrato;")
        count, total_size = cur.fetchone()
    except psycopg2.errors.UndefinedTable:
        print("✅ Tabela não existe — E6 já foi aplicado.")
        conn.close()
        return
    except Exception as e:
        print(f"❌ Erro na query: {e}")
        conn.close()
        sys.exit(1)

    print(f"  Contagem: {count} linhas")
    print(f"  Tamanho total: {total_size} bytes")

    # Decisão
    if count == 0:
        print("✅ Vazio — procedendo com DROP.")
        try:
            cur.execute("DROP TABLE modelo_contrato;")
            conn.commit()
            print("✅ Tabela dropada com sucesso.")
        except Exception as e:
            print(f"❌ Erro ao dropar: {e}")
            conn.rollback()
            sys.exit(1)
        finally:
            conn.close()
        return

    if total_size < 1000:
        print("⚠️ Conteúdo vazio — procedendo com DROP.")
        try:
            cur.execute("DROP TABLE modelo_contrato;")
            conn.commit()
            print("✅ Tabela dropada com sucesso.")
        except Exception as e:
            print(f"❌ Erro ao dropar: {e}")
            conn.rollback()
            sys.exit(1)
        finally:
            conn.close()
        return

    # Texto real — exportar
    print(f"⚠️ TEXTO REAL ({total_size} bytes) — EXPORTANDO antes de dropar...")

    export_dir = Path("backups") / f"modelo-contrato-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    export_dir.mkdir(parents=True, exist_ok=True)

    try:
        # CSV
        cur.execute("SELECT * FROM modelo_contrato;")
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()

        csv_file = export_dir / "modelo_contrato.csv"
        with open(csv_file, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(columns)
            w.writerows(rows)
        print(f"✅ CSV: {csv_file}")

        # JSON
        json_file = export_dir / "modelo_contrato.json"
        data = [dict(zip(columns, row)) for row in rows]
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False, default=str)
        print(f"✅ JSON: {json_file}")

    except Exception as e:
        print(f"❌ Erro ao exportar: {e}")
        conn.close()
        sys.exit(1)

    print("")
    print("📋 PRÓXIMOS PASSOS (MANUAL):")
    print(f"  1. Revise os arquivos em {export_dir}")
    print("  2. Quando tiver certeza, execute:")
    print("     python scripts/e6-limpar-modelo-contrato.py --drop")
    print("  3. Depois execute o deploy do código (E6 Parte B)")
    print("")

    conn.close()


if __name__ == "__main__":
    if "--drop" in sys.argv:
        print("⚠️ Flag --drop detectado, mas export é obrigatório primeiro.")
        print("Execute sem --drop para exportar, depois revise e reexecute com --drop.")
        sys.exit(1)

    main()
