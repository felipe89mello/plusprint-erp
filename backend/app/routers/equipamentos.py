from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/equipamentos", tags=["Equipamentos"])


@router.post("/", response_model=schemas.EquipamentoOut, status_code=201)
def criar_equipamento(equipamento: schemas.EquipamentoCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, equipamento.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")
    novo = models.Equipamento(**equipamento.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.get("/", response_model=list[schemas.EquipamentoOut])
def listar_equipamentos(cliente_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(models.Equipamento)
    if cliente_id is not None:
        query = query.filter(models.Equipamento.cliente_id == cliente_id)
    return query.all()


@router.get("/{equipamento_id}", response_model=schemas.EquipamentoOut)
def obter_equipamento(equipamento_id: int, db: Session = Depends(get_db)):
    equipamento = db.get(models.Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    return equipamento


@router.put("/{equipamento_id}", response_model=schemas.EquipamentoOut)
def atualizar_equipamento(equipamento_id: int, dados: schemas.EquipamentoUpdate, db: Session = Depends(get_db)):
    equipamento = db.get(models.Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(equipamento, campo, valor)
    db.commit()
    db.refresh(equipamento)
    return equipamento


@router.delete("/{equipamento_id}", status_code=204)
def excluir_equipamento(equipamento_id: int, db: Session = Depends(get_db)):
    equipamento = db.get(models.Equipamento, equipamento_id)
    if not equipamento:
        raise HTTPException(status_code=404, detail="Equipamento não encontrado")
    db.delete(equipamento)
    db.commit()
