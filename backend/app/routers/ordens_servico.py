from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/ordens-servico", tags=["Ordens de Serviço"])


@router.post("/", response_model=schemas.OrdemServicoOut, status_code=201)
def criar_ordem_servico(os_: schemas.OrdemServicoCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, os_.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")
    if os_.equipamento_id and not db.get(models.Equipamento, os_.equipamento_id):
        raise HTTPException(status_code=400, detail="Equipamento informado não existe")
    if os_.orcamento_id and not db.get(models.Orcamento, os_.orcamento_id):
        raise HTTPException(status_code=400, detail="Orçamento informado não existe")
    dados = os_.model_dump()
    if dados.get("data_abertura") is None:
        dados.pop("data_abertura", None)  # deixa o default do model (agora) valer
    nova = models.OrdemServico(**dados)
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.get("/", response_model=list[schemas.OrdemServicoOut])
def listar_ordens_servico(
    cliente_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.OrdemServico)
    if cliente_id is not None:
        query = query.filter(models.OrdemServico.cliente_id == cliente_id)
    if status is not None:
        query = query.filter(models.OrdemServico.status == status)
    return query.all()


@router.get("/{os_id}", response_model=schemas.OrdemServicoOut)
def obter_ordem_servico(os_id: int, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    return os_


@router.put("/{os_id}", response_model=schemas.OrdemServicoOut)
def atualizar_ordem_servico(os_id: int, dados: schemas.OrdemServicoUpdate, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    campos = dados.model_dump(exclude_unset=True)
    for campo, valor in campos.items():
        setattr(os_, campo, valor)

    # Se o status virou "concluído" e nenhuma data de conclusão foi informada
    # nessa mesma atualização, registra a data de hoje automaticamente —
    # é esse campo que o dashboard usa para calcular o faturamento do mês.
    if campos.get("status") == "concluido" and "data_conclusao" not in campos:
        os_.data_conclusao = datetime.utcnow()

    db.commit()
    db.refresh(os_)
    return os_


@router.delete("/{os_id}", status_code=204)
def excluir_ordem_servico(os_id: int, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    db.delete(os_)
    db.commit()
