from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/contratos", tags=["Contratos"])


def _buscar_equipamentos(db: Session, equipamento_ids: list[int]) -> list[models.Equipamento]:
    if not equipamento_ids:
        return []
    equipamentos = db.query(models.Equipamento).filter(models.Equipamento.id.in_(equipamento_ids)).all()
    encontrados_ids = {e.id for e in equipamentos}
    faltando = set(equipamento_ids) - encontrados_ids
    if faltando:
        raise HTTPException(status_code=400, detail=f"Equipamentos não encontrados: {sorted(faltando)}")
    return equipamentos


@router.post("/", response_model=schemas.ContratoOut, status_code=201)
def criar_contrato(contrato: schemas.ContratoCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, contrato.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")

    dados = contrato.model_dump(exclude={"equipamento_ids"})
    novo = models.Contrato(**dados)
    novo.equipamentos = _buscar_equipamentos(db, contrato.equipamento_ids)

    db.add(novo)
    db.commit()
    db.refresh(novo)
    return schemas.ContratoOut.from_model(novo)


@router.get("/", response_model=list[schemas.ContratoOut])
def listar_contratos(
    cliente_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Contrato)
    if cliente_id is not None:
        query = query.filter(models.Contrato.cliente_id == cliente_id)
    if status is not None:
        query = query.filter(models.Contrato.status == status)
    return [schemas.ContratoOut.from_model(c) for c in query.all()]


@router.get("/{contrato_id}", response_model=schemas.ContratoOut)
def obter_contrato(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    return schemas.ContratoOut.from_model(contrato)


@router.put("/{contrato_id}", response_model=schemas.ContratoOut)
def atualizar_contrato(contrato_id: int, dados: schemas.ContratoUpdate, db: Session = Depends(get_db)):
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")

    campos = dados.model_dump(exclude_unset=True, exclude={"equipamento_ids"})
    for campo, valor in campos.items():
        setattr(contrato, campo, valor)

    if dados.equipamento_ids is not None:
        contrato.equipamentos = _buscar_equipamentos(db, dados.equipamento_ids)

    db.commit()
    db.refresh(contrato)
    return schemas.ContratoOut.from_model(contrato)


@router.delete("/{contrato_id}", status_code=204)
def excluir_contrato(contrato_id: int, db: Session = Depends(get_db)):
    contrato = db.get(models.Contrato, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    db.delete(contrato)
    db.commit()
