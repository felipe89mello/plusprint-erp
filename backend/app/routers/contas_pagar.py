from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/contas-pagar", tags=["Contas a Pagar"])


@router.post("/", response_model=schemas.ContaPagarOut, status_code=201)
def criar_conta_pagar(conta: schemas.ContaPagarCreate, db: Session = Depends(get_db)):
    nova = models.ContaPagar(**conta.model_dump())
    if nova.pago:
        nova.data_pagamento = datetime.utcnow()
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.get("/", response_model=list[schemas.ContaPagarOut])
def listar_contas_pagar(db: Session = Depends(get_db)):
    return db.query(models.ContaPagar).order_by(models.ContaPagar.data_vencimento.desc()).all()


@router.get("/pendentes", response_model=list[schemas.ContaPagarOut])
def pendentes(limite: int = 8, db: Session = Depends(get_db)):
    """Contas ainda não pagas, ordenadas por vencimento — usado no painel do
    Dashboard, ao lado de Contas a Receber."""
    return (
        db.query(models.ContaPagar)
        .filter(models.ContaPagar.pago.is_(False))
        .order_by(models.ContaPagar.data_vencimento.asc())
        .limit(limite)
        .all()
    )


@router.put("/{conta_id}", response_model=schemas.ContaPagarOut)
def atualizar_conta_pagar(conta_id: int, dados: schemas.ContaPagarUpdate, db: Session = Depends(get_db)):
    conta = db.get(models.ContaPagar, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta a pagar não encontrada")
    dados_dict = dados.model_dump(exclude_unset=True)
    pago_antes = conta.pago
    for campo, valor in dados_dict.items():
        setattr(conta, campo, valor)
    if "pago" in dados_dict:
        if conta.pago and not pago_antes:
            conta.data_pagamento = datetime.utcnow()
        elif not conta.pago:
            conta.data_pagamento = None
    db.commit()
    db.refresh(conta)
    return conta


@router.delete("/{conta_id}", status_code=204)
def excluir_conta_pagar(conta_id: int, db: Session = Depends(get_db)):
    conta = db.get(models.ContaPagar, conta_id)
    if not conta:
        raise HTTPException(status_code=404, detail="Conta a pagar não encontrada")
    db.delete(conta)
    db.commit()
