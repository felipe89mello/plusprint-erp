from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

ESTOQUE_BAIXO_LIMITE = 5


@router.get("/", response_model=schemas.DashboardOut)
def obter_dashboard(db: Session = Depends(get_db)):
    def contar_os(status: str) -> int:
        return (
            db.query(func.count(models.OrdemServico.id))
            .filter(models.OrdemServico.status == status)
            .scalar()
        )

    def faturamento_periodo(ano: int, mes: int | None = None):
        """Soma dos itens do orçamento vinculado a OS concluídas no período."""
        query = (
            db.query(func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0))
            .join(models.Orcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
            .join(models.OrdemServico, models.OrdemServico.orcamento_id == models.Orcamento.id)
            .filter(
                models.OrdemServico.status == "concluido",
                extract("year", models.OrdemServico.data_conclusao) == ano,
            )
        )
        if mes is not None:
            query = query.filter(extract("month", models.OrdemServico.data_conclusao) == mes)
        return query.scalar()

    def custo_pecas_periodo(ano: int, mes: int | None = None):
        """Soma do custo (valor pago) das peças usadas em OS concluídas no período."""
        query = (
            db.query(func.coalesce(func.sum(models.ItemPecaOS.quantidade_usada * models.ItemPecaOS.custo_unitario_na_epoca), 0))
            .join(models.OrdemServico, models.ItemPecaOS.ordem_servico_id == models.OrdemServico.id)
            .filter(
                models.OrdemServico.status == "concluido",
                extract("year", models.OrdemServico.data_conclusao) == ano,
            )
        )
        if mes is not None:
            query = query.filter(extract("month", models.OrdemServico.data_conclusao) == mes)
        return query.scalar()

    agora = datetime.utcnow()

    faturamento_mes = faturamento_periodo(agora.year, agora.month)
    custo_pecas_mes = custo_pecas_periodo(agora.year, agora.month)

    faturamento_ano = faturamento_periodo(agora.year)
    custo_pecas_ano = custo_pecas_periodo(agora.year)

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

    def contar_orcamentos(status: str | None = None) -> int:
        query = db.query(func.count(models.Orcamento.id))
        if status is not None:
            query = query.filter(models.Orcamento.status == status)
        return query.scalar()

    return schemas.DashboardOut(
        os_abertas=contar_os("aberto"),
        os_em_andamento=contar_os("em_andamento"),
        os_concluidas=contar_os("concluido"),
        faturamento_mes_atual=faturamento_mes,
        contratos_ativos=contratos_ativos,
        pecas_com_estoque_baixo=pecas_com_estoque_baixo,
        orcamentos_total=contar_orcamentos(),
        orcamentos_pendentes=contar_orcamentos("pendente"),
        orcamentos_aprovados=contar_orcamentos("aprovado"),
        orcamentos_recusados=contar_orcamentos("recusado"),
        custo_pecas_mes=custo_pecas_mes,
        liquido_mes=faturamento_mes - custo_pecas_mes,
        faturamento_ano=faturamento_ano,
        custo_pecas_ano=custo_pecas_ano,
        liquido_ano=faturamento_ano - custo_pecas_ano,
    )
