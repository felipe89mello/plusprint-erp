from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/ordens-servico", tags=["Ordens de Serviço"])


def _substituir_itens_servico(os_: models.OrdemServico, itens: list[schemas.ItemServicoOSCreate]):
    os_.itens_servico.clear()
    for item in itens:
        os_.itens_servico.append(
            models.ItemServicoOS(
                descricao=item.descricao,
                quantidade=item.quantidade,
                valor_unitario=item.valor_unitario,
            )
        )


def _buscar_equipamentos(db: Session, equipamento_ids: list[int]) -> list[models.Equipamento]:
    if not equipamento_ids:
        return []
    equipamentos = db.query(models.Equipamento).filter(models.Equipamento.id.in_(equipamento_ids)).all()
    encontrados_ids = {e.id for e in equipamentos}
    faltando = set(equipamento_ids) - encontrados_ids
    if faltando:
        raise HTTPException(status_code=400, detail=f"Equipamentos não encontrados: {sorted(faltando)}")
    return equipamentos


@router.post("/", response_model=schemas.OrdemServicoOut, status_code=201)
def criar_ordem_servico(os_: schemas.OrdemServicoCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, os_.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")
    if os_.orcamento_id and not db.get(models.Orcamento, os_.orcamento_id):
        raise HTTPException(status_code=400, detail="Orçamento informado não existe")

    dados = os_.model_dump(exclude={"itens_servico", "equipamento_ids"})
    if dados.get("data_abertura") is None:
        dados.pop("data_abertura", None)  # deixa o default do model (agora) valer

    nova = models.OrdemServico(**dados)
    nova.itens_servico = [
        models.ItemServicoOS(descricao=i.descricao, quantidade=i.quantidade, valor_unitario=i.valor_unitario)
        for i in os_.itens_servico
    ]
    nova.equipamentos = _buscar_equipamentos(db, os_.equipamento_ids)

    db.add(nova)
    db.commit()
    db.refresh(nova)
    return schemas.OrdemServicoOut.from_model(nova)


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
    return [schemas.OrdemServicoOut.from_model(o) for o in query.all()]


@router.get("/{os_id}", response_model=schemas.OrdemServicoOut)
def obter_ordem_servico(os_id: int, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    return schemas.OrdemServicoOut.from_model(os_)


@router.put("/{os_id}", response_model=schemas.OrdemServicoOut)
def atualizar_ordem_servico(os_id: int, dados: schemas.OrdemServicoUpdate, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")

    campos = dados.model_dump(exclude_unset=True, exclude={"itens_servico", "equipamento_ids"})
    for campo, valor in campos.items():
        setattr(os_, campo, valor)

    if dados.itens_servico is not None:
        _substituir_itens_servico(os_, dados.itens_servico)

    if dados.equipamento_ids is not None:
        os_.equipamentos = _buscar_equipamentos(db, dados.equipamento_ids)

    # Se o status virou "concluído" e nenhuma data de conclusão foi informada
    # nessa mesma atualização, registra a data de hoje automaticamente —
    # é esse campo que o dashboard usa para calcular o faturamento do mês.
    if campos.get("status") == "concluido" and "data_conclusao" not in campos:
        os_.data_conclusao = datetime.utcnow()

    db.commit()
    db.refresh(os_)
    return schemas.OrdemServicoOut.from_model(os_)


@router.delete("/{os_id}", status_code=204)
def excluir_ordem_servico(os_id: int, db: Session = Depends(get_db)):
    os_ = db.get(models.OrdemServico, os_id)
    if not os_:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")

    # Devolve ao estoque as peças que haviam sido descontadas para esta OS,
    # antes de excluir os registros de uso (o cascade cuida do resto).
    for item in os_.itens_peca:
        if item.peca:
            item.peca.quantidade_estoque += item.quantidade_usada

    db.delete(os_)
    db.commit()
