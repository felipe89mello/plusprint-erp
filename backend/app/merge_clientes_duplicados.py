"""
Funde cadastros duplicados de cliente que têm "eurofarma" no nome (comparação
sem diferenciar maiúsculas/acentos) — move equipamentos, orçamentos, ordens de
serviço e contratos todos para o cadastro com mais histórico, e apaga o(s)
duplicado(s) vazio(s) que sobrar(em).

Roda uma vez só: docker compose exec api python -m app.merge_clientes_duplicados
"""
from app.database import SessionLocal
from app import models

db = SessionLocal()

TERMO = "eurofarma"

candidatos = [c for c in db.query(models.Cliente).all() if TERMO in c.nome.lower()]

if len(candidatos) <= 1:
    print(f"Encontrado {len(candidatos)} cliente(s) com '{TERMO}' no nome — nada para fundir.")
else:
    print(f"Encontrados {len(candidatos)} cadastros:")
    for c in candidatos:
        n_equip = len(c.equipamentos)
        n_orc = len(c.orcamentos)
        n_os = len(c.ordens_servico)
        n_contr = len(c.contratos)
        print(f"  #{c.id} — '{c.nome}' — {n_equip} equipamento(s), {n_orc} orçamento(s), {n_os} OS, {n_contr} contrato(s)")

    # Mantém o que tem mais registros vinculados no total (mais "histórico real").
    def total_vinculos(c):
        return len(c.equipamentos) + len(c.orcamentos) + len(c.ordens_servico) + len(c.contratos)

    keeper = max(candidatos, key=total_vinculos)
    duplicados = [c for c in candidatos if c.id != keeper.id]

    print(f"\nMantendo #{keeper.id} — '{keeper.nome}' (o com mais histórico vinculado)\n")

    for dup in duplicados:
        print(f"Fundindo #{dup.id} — '{dup.nome}' em #{keeper.id}...")
        for e in list(dup.equipamentos):
            dup.equipamentos.remove(e)
            keeper.equipamentos.append(e)
            print(f"  Equipamento movido: {e.marca} {e.modelo} (id {e.id})")
        for o in list(dup.orcamentos):
            dup.orcamentos.remove(o)
            keeper.orcamentos.append(o)
            print(f"  Orçamento movido: nº {o.numero or o.id}")
        for os_ in list(dup.ordens_servico):
            dup.ordens_servico.remove(os_)
            keeper.ordens_servico.append(os_)
            print(f"  OS movida: nº {os_.numero or os_.id}")
        for ct in list(dup.contratos):
            dup.contratos.remove(ct)
            keeper.contratos.append(ct)
            print(f"  Contrato movido: id {ct.id}")

        db.flush()
        db.delete(dup)
        print(f"  Cadastro duplicado #{dup.id} removido.\n")

    db.commit()
    print("Fusão concluída com sucesso!")