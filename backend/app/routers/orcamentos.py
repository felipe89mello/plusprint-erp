from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/orcamentos", tags=["Orçamentos"])


def _substituir_itens(db: Session, orcamento: models.Orcamento, itens: list[schemas.ItemOrcamentoCreate]):
    orcamento.itens.clear()
    for item in itens:
        orcamento.itens.append(
            models.ItemOrcamento(
                quantidade=item.quantidade,
                descricao=item.descricao,
                valor_unitario=item.valor_unitario,
            )
        )


def _substituir_equipamentos(
    db: Session, orcamento: models.Orcamento, equipamentos: list[schemas.OrcamentoEquipamentoItem]
):
    if equipamentos:
        ids = [e.equipamento_id for e in equipamentos]
        encontrados = db.query(models.Equipamento).filter(models.Equipamento.id.in_(ids)).all()
        encontrados_ids = {e.id for e in encontrados}
        faltando = set(ids) - encontrados_ids
        if faltando:
            raise HTTPException(status_code=400, detail=f"Equipamentos não encontrados: {sorted(faltando)}")

    orcamento.itens_equipamento.clear()
    for item in equipamentos:
        orcamento.itens_equipamento.append(
            models.OrcamentoEquipamento(
                equipamento_id=item.equipamento_id,
                defeitos_constatados=item.defeitos_constatados,
                solucao_adotada=item.solucao_adotada,
            )
        )


@router.post("/", response_model=schemas.OrcamentoOut, status_code=201)
def criar_orcamento(orcamento: schemas.OrcamentoCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, orcamento.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")

    dados = orcamento.model_dump(exclude={"itens", "equipamentos"})
    if dados.get("data") is None:
        dados.pop("data", None)  # deixa o default do model (agora) valer
    novo = models.Orcamento(**dados)
    novo.itens = [
        models.ItemOrcamento(quantidade=i.quantidade, descricao=i.descricao, valor_unitario=i.valor_unitario)
        for i in orcamento.itens
    ]
    _substituir_equipamentos(db, novo, orcamento.equipamentos)

    db.add(novo)
    db.commit()
    db.refresh(novo)
    return schemas.OrcamentoOut.from_model(novo)


@router.get("/", response_model=list[schemas.OrcamentoOut])
def listar_orcamentos(
    cliente_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Orcamento)
    if cliente_id is not None:
        query = query.filter(models.Orcamento.cliente_id == cliente_id)
    if status is not None:
        query = query.filter(models.Orcamento.status == status)
    return [schemas.OrcamentoOut.from_model(o) for o in query.all()]


@router.get("/{orcamento_id}", response_model=schemas.OrcamentoOut)
def obter_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    return schemas.OrcamentoOut.from_model(orcamento)


@router.put("/{orcamento_id}", response_model=schemas.OrcamentoOut)
def atualizar_orcamento(orcamento_id: int, dados: schemas.OrcamentoUpdate, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")

    campos = dados.model_dump(exclude_unset=True, exclude={"itens", "equipamentos"})
    for campo, valor in campos.items():
        setattr(orcamento, campo, valor)

    if dados.itens is not None:
        _substituir_itens(db, orcamento, dados.itens)

    if dados.equipamentos is not None:
        _substituir_equipamentos(db, orcamento, dados.equipamentos)

    db.commit()
    db.refresh(orcamento)
    return schemas.OrcamentoOut.from_model(orcamento)


@router.delete("/{orcamento_id}", status_code=204)
def excluir_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")

    # Se já existem OS geradas a partir deste orçamento, desvincula (mantém a
    # OS, só remove a referência) em vez de bloquear/apagar a exclusão.
    for os_ in orcamento.ordens_servico:
        os_.orcamento_id = None

    db.delete(orcamento)
    db.commit()
