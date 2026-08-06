from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/clientes", tags=["Clientes"])


@router.post("/", response_model=schemas.ClienteOut, status_code=201)
def criar_cliente(cliente: schemas.ClienteCreate, db: Session = Depends(get_db)):
    novo = models.Cliente(**cliente.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.get("/", response_model=list[schemas.ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()


@router.get("/{cliente_id}", response_model=schemas.ClienteOut)
def obter_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.get(models.Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


@router.put("/{cliente_id}", response_model=schemas.ClienteOut)
def atualizar_cliente(cliente_id: int, dados: schemas.ClienteUpdate, db: Session = Depends(get_db)):
    cliente = db.get(models.Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(cliente, campo, valor)
    db.commit()
    db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=204)
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.get(models.Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    db.delete(cliente)
    db.commit()
