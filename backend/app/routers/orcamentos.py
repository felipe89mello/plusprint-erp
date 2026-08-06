from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/orcamentos", tags=["Orçamentos"])


@router.post("/", response_model=schemas.OrcamentoOut, status_code=201)
def criar_orcamento(orcamento: schemas.OrcamentoCreate, db: Session = Depends(get_db)):
    if not db.get(models.OrdemServico, orcamento.ordem_servico_id):
        raise HTTPException(status_code=400, detail="Ordem de serviço informada não existe")
    novo = models.Orcamento(**orcamento.model_dump())
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@router.get("/", response_model=list[schemas.OrcamentoOut])
def listar_orcamentos(
    ordem_servico_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Orcamento)
    if ordem_servico_id is not None:
        query = query.filter(models.Orcamento.ordem_servico_id == ordem_servico_id)
    if status is not None:
        query = query.filter(models.Orcamento.status == status)
    return query.all()


@router.get("/{orcamento_id}", response_model=schemas.OrcamentoOut)
def obter_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    return orcamento


@router.put("/{orcamento_id}", response_model=schemas.OrcamentoOut)
def atualizar_orcamento(orcamento_id: int, dados: schemas.OrcamentoUpdate, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(orcamento, campo, valor)
    db.commit()
    db.refresh(orcamento)
    return orcamento


@router.delete("/{orcamento_id}", status_code=204)
def excluir_orcamento(orcamento_id: int, db: Session = Depends(get_db)):
    orcamento = db.get(models.Orcamento, orcamento_id)
    if not orcamento:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    db.delete(orcamento)
    db.commit()
