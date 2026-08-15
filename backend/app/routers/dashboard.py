from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ESTOQUE_BAIXO_LIMITE = 5


@router.get("/anos-disponiveis", response_model=list[int])
def anos_disponiveis(db: Session = Depends(get_db)):
    """Anos com algum orçamento ou OS cadastrado, sempre incluindo o ano
    atual — usado para montar os botões de ano do Dashboard."""
    anos = set()
    for (a,) in db.query(extract("year", models.Orcamento.data)).distinct():
        if a is not None:
            anos.add(int(a))
    for (a,) in db.query(extract("year", models.OrdemServico.data_abertura)).distinct():
        if a is not None:
            anos.add(int(a))
    anos.add(datetime.utcnow().year)
    return sorted(anos)


@router.get("/", response_model=schemas.DashboardOut)
def obter_dashboard(ano: int | None = None, db: Session = Depends(get_db)):
    def contar_os(status: str | None = None) -> int:
        q = db.query(func.count(models.OrdemServico.id))
        if status is not None:
            q = q.filter(models.OrdemServico.status == status)
        if ano is not None:
            q = q.filter(extract("year", models.OrdemServico.data_abertura) == ano)
        return q.scalar()

    def contar_orcamentos(status: str | None = None) -> int:
        q = db.query(func.count(models.Orcamento.id))
        if status is not None:
            q = q.filter(models.Orcamento.status == status)
        if ano is not None:
            q = q.filter(extract("year", models.Orcamento.data) == ano)
        return q.scalar()

    contratos_ativos = (
        db.query(func.count(models.Contrato.id))
        .filter(models.Contrato.status == "ativo")
        .scalar()
    )

    pecas_com_estoque_baixo = (
        db.query(models.Peca)
        .filter(models.Peca.quantidade_estoque < ESTOQUE_BAIXO_LIMITE)
        .all()
    )

    return schemas.DashboardOut(
        ano=ano,
        os_abertas=contar_os("aberto"),
        os_em_andamento=contar_os("em_andamento"),
        os_concluidas=contar_os("concluido"),
        os_total=contar_os(),
        orcamentos_pendentes=contar_orcamentos("pendente"),
        orcamentos_aprovados=contar_orcamentos("aprovado"),
        orcamentos_recusados=contar_orcamentos("recusado"),
        orcamentos_total=contar_orcamentos(),
        contratos_ativos=contratos_ativos,
        pecas_com_estoque_baixo=pecas_com_estoque_baixo,
    )
