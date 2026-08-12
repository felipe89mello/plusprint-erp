from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/despesas", tags=["Despesas"])


@router.post("/", response_model=schemas.DespesaOut, status_code=201)
def criar_despesa(despesa: schemas.DespesaCreate, db: Session = Depends(get_db)):
    nova = models.Despesa(**despesa.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.get("/", response_model=list[schemas.DespesaOut])
def listar_despesas(categoria: str | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Despesa)
    if categoria is not None:
        query = query.filter(models.Despesa.categoria == categoria)
    return query.order_by(models.Despesa.data.desc()).all()


@router.get("/{despesa_id}", response_model=schemas.DespesaOut)
def obter_despesa(despesa_id: int, db: Session = Depends(get_db)):
    despesa = db.get(models.Despesa, despesa_id)
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return despesa


@router.put("/{despesa_id}", response_model=schemas.DespesaOut)
def atualizar_despesa(despesa_id: int, dados: schemas.DespesaUpdate, db: Session = Depends(get_db)):
    despesa = db.get(models.Despesa, despesa_id)
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(despesa, campo, valor)
    db.commit()
    db.refresh(despesa)
    return despesa


@router.delete("/{despesa_id}", status_code=204)
def excluir_despesa(despesa_id: int, db: Session = Depends(get_db)):
    despesa = db.get(models.Despesa, despesa_id)
    if not despesa:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    db.delete(despesa)
    db.commit()
