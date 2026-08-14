import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/financeiro", tags=["Financeiro"])


def _dias_prazo(condicoes_pagamento: str | None) -> int | None:
    """Extrai o número de dias de um texto tipo '30DDL', '28ddl.', '21 DDL'."""
    if not condicoes_pagamento:
        return None
    m = re.search(r"(\d+)", condicoes_pagamento)
    return int(m.group(1)) if m else None


def _faturamento_tecnico_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    """Soma dos itens de orçamentos técnicos vinculados a OS concluídas no período."""
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


def _faturamento_venda_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    """Soma dos itens de orçamentos de venda de equipamento aprovados no período
    (aqui a receita já é considerada realizada na aprovação, sem depender de OS)."""
    query = (
        db.query(func.coalesce(func.sum(models.ItemVendaEquipamento.quantidade * models.ItemVendaEquipamento.preco_unitario), 0))
        .join(models.Orcamento, models.ItemVendaEquipamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.status == "aprovado",
            extract("year", models.Orcamento.data) == ano,
        )
    )
    if mes is not None:
        query = query.filter(extract("month", models.Orcamento.data) == mes)
    return query.scalar()


def _custo_pecas_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
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


def _custo_vendas_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    """Soma do custo de compra dos equipamentos vendidos (orçamentos de venda
    aprovados) no período — mesma janela usada para contar a receita da venda."""
    query = (
        db.query(func.coalesce(func.sum(models.ItemVendaEquipamento.quantidade * models.ItemVendaEquipamento.custo_unitario), 0))
        .join(models.Orcamento, models.ItemVendaEquipamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.status == "aprovado",
            extract("year", models.Orcamento.data) == ano,
        )
    )
    if mes is not None:
        query = query.filter(extract("month", models.Orcamento.data) == mes)
    return query.scalar()


def _despesas_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    query = db.query(func.coalesce(func.sum(models.Despesa.valor), 0)).filter(extract("year", models.Despesa.data) == ano)
    if mes is not None:
        query = query.filter(extract("month", models.Despesa.data) == mes)
    return query.scalar()


@router.get("/resumo", response_model=schemas.FinanceiroResumoOut)
def resumo_financeiro(db: Session = Depends(get_db)):
    agora = datetime.utcnow()

    faturamento_mes = _faturamento_tecnico_periodo(db, agora.year, agora.month) + _faturamento_venda_periodo(db, agora.year, agora.month)
    custo_pecas_mes = _custo_pecas_periodo(db, agora.year, agora.month) + _custo_vendas_periodo(db, agora.year, agora.month)
    despesas_mes = _despesas_periodo(db, agora.year, agora.month)

    faturamento_ano = _faturamento_tecnico_periodo(db, agora.year) + _faturamento_venda_periodo(db, agora.year)
    custo_pecas_ano = _custo_pecas_periodo(db, agora.year) + _custo_vendas_periodo(db, agora.year)
    despesas_ano = _despesas_periodo(db, agora.year)

    def contar_orcamentos(status: str | None = None) -> int:
        query = db.query(func.count(models.Orcamento.id))
        if status is not None:
            query = query.filter(models.Orcamento.status == status)
        return query.scalar()

    return schemas.FinanceiroResumoOut(
        faturamento_mes=faturamento_mes,
        custo_pecas_mes=custo_pecas_mes,
        despesas_mes=despesas_mes,
        liquido_mes=faturamento_mes - custo_pecas_mes - despesas_mes,
        faturamento_ano=faturamento_ano,
        custo_pecas_ano=custo_pecas_ano,
        despesas_ano=despesas_ano,
        liquido_ano=faturamento_ano - custo_pecas_ano - despesas_ano,
        orcamentos_total=contar_orcamentos(),
        orcamentos_pendentes=contar_orcamentos("pendente"),
        orcamentos_aprovados=contar_orcamentos("aprovado"),
        orcamentos_recusados=contar_orcamentos("recusado"),
    )


@router.get("/contas-a-receber", response_model=list[schemas.ContaReceberOut])
def contas_a_receber(db: Session = Depends(get_db)):
    orcamentos = db.query(models.Orcamento).filter(models.Orcamento.status == "aprovado").all()
    hoje = date.today()
    resultado = []

    for o in orcamentos:
        valor_servicos = sum((i.quantidade * i.valor_unitario for i in o.itens), Decimal("0"))
        valor_venda = sum((i.quantidade * i.preco_unitario for i in o.itens_venda), Decimal("0"))
        valor_total = valor_servicos + valor_venda
        if valor_total <= 0:
            continue

        # Data de referência para contar o prazo: conclusão da OS vinculada
        # (é quando o trabalho de fato terminou), ou — para venda de
        # equipamento, que normalmente não passa por OS — a emissão do orçamento.
        os_concluida = next((os_ for os_ in o.ordens_servico if os_.status == "concluido" and os_.data_conclusao), None)
        if os_concluida:
            data_ref = os_concluida.data_conclusao.date()
        elif o.tipo == "venda_equipamento":
            data_ref = o.data.date()
        else:
            data_ref = None  # técnico, ainda sem OS concluída — nada vencendo ainda

        dias = _dias_prazo(o.condicoes_pagamento)
        data_venc = None
        if o.pago:
            situacao = "pago"
        elif data_ref is None:
            situacao = "aguardando_conclusao"
        elif dias is None:
            situacao = "em_dia"  # prazo de pagamento não informado no orçamento
        else:
            data_venc = data_ref + timedelta(days=dias)
            if data_venc < hoje:
                situacao = "atrasado"
            elif (data_venc - hoje).days <= 5:
                situacao = "vence_em_breve"
            else:
                situacao = "em_dia"

        resultado.append(
            schemas.ContaReceberOut(
                orcamento_id=o.id,
                numero=o.numero,
                cliente_nome=o.cliente.nome,
                valor_total=valor_total,
                condicoes_pagamento=o.condicoes_pagamento,
                data_referencia=data_ref,
                dias_prazo=dias,
                data_vencimento=data_venc,
                pago=bool(o.pago),
                data_pagamento=o.data_pagamento,
                situacao=situacao,
            )
        )

    ordem = {"atrasado": 0, "vence_em_breve": 1, "em_dia": 2, "aguardando_conclusao": 3, "pago": 4}
    resultado.sort(key=lambda r: (ordem.get(r.situacao, 5), r.data_vencimento or date.max))
    return resultado


@router.get("/faturamento-mensal", response_model=list[schemas.FaturamentoMensalPonto])
def faturamento_mensal(db: Session = Depends(get_db)):
    """Últimos 12 meses (incluindo o atual) de faturamento/custo/líquido."""
    agora = datetime.utcnow()
    periodos = []
    ano, mes = agora.year, agora.month
    for i in range(11, -1, -1):
        m = mes - i
        a = ano
        while m <= 0:
            m += 12
            a -= 1
        periodos.append((a, m))

    pontos = []
    for a, m in periodos:
        fat = _faturamento_tecnico_periodo(db, a, m) + _faturamento_venda_periodo(db, a, m)
        custo = _custo_pecas_periodo(db, a, m) + _custo_vendas_periodo(db, a, m)
        pontos.append(schemas.FaturamentoMensalPonto(ano=a, mes=m, faturamento=fat, custo=custo, liquido=fat - custo))
    return pontos


@router.get("/detalhe-mensal", response_model=schemas.DetalheMensalOut)
def detalhe_mensal(ano: int, mes: int, db: Session = Depends(get_db)):
    """Detalhamento por trás dos totais de um mês específico: orçamentos que
    compuseram o faturamento, peças usadas e despesas lançadas — usado no
    modal de detalhe do gráfico Faturamento x Líquido."""

    orcamentos: list[schemas.OrcamentoDetalheMensalOut] = []

    # Técnico: orçamentos com ao menos uma OS concluída no período (mesma
    # regra usada em _faturamento_tecnico_periodo, mas agrupado por orçamento).
    tecnicos = (
        db.query(
            models.Orcamento,
            func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0).label("valor"),
        )
        .join(models.ItemOrcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
        .join(models.OrdemServico, models.OrdemServico.orcamento_id == models.Orcamento.id)
        .filter(
            models.OrdemServico.status == "concluido",
            extract("year", models.OrdemServico.data_conclusao) == ano,
            extract("month", models.OrdemServico.data_conclusao) == mes,
        )
        .group_by(models.Orcamento.id)
        .all()
    )
    for o, valor in tecnicos:
        if valor > 0:
            orcamentos.append(
                schemas.OrcamentoDetalheMensalOut(
                    orcamento_id=o.id, numero=o.numero, cliente_nome=o.cliente.nome, tipo="tecnico", valor=valor
                )
            )

    # Venda de equipamento: orçamentos aprovados no período.
    vendas = (
        db.query(
            models.Orcamento,
            func.coalesce(func.sum(models.ItemVendaEquipamento.quantidade * models.ItemVendaEquipamento.preco_unitario), 0).label("valor"),
        )
        .join(models.ItemVendaEquipamento, models.ItemVendaEquipamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.status == "aprovado",
            extract("year", models.Orcamento.data) == ano,
            extract("month", models.Orcamento.data) == mes,
        )
        .group_by(models.Orcamento.id)
        .all()
    )
    for o, valor in vendas:
        if valor > 0:
            orcamentos.append(
                schemas.OrcamentoDetalheMensalOut(
                    orcamento_id=o.id, numero=o.numero, cliente_nome=o.cliente.nome, tipo="venda_equipamento", valor=valor
                )
            )

    orcamentos.sort(key=lambda r: r.valor, reverse=True)

    # Peças usadas em OS concluídas no período, agrupadas por peça.
    pecas_query = (
        db.query(
            models.Peca.id,
            models.Peca.nome,
            func.sum(models.ItemPecaOS.quantidade_usada).label("quantidade"),
            func.sum(models.ItemPecaOS.quantidade_usada * models.ItemPecaOS.custo_unitario_na_epoca).label("custo_total"),
        )
        .join(models.ItemPecaOS, models.ItemPecaOS.peca_id == models.Peca.id)
        .join(models.OrdemServico, models.ItemPecaOS.ordem_servico_id == models.OrdemServico.id)
        .filter(
            models.OrdemServico.status == "concluido",
            extract("year", models.OrdemServico.data_conclusao) == ano,
            extract("month", models.OrdemServico.data_conclusao) == mes,
        )
        .group_by(models.Peca.id, models.Peca.nome)
        .order_by(func.sum(models.ItemPecaOS.quantidade_usada * models.ItemPecaOS.custo_unitario_na_epoca).desc())
        .all()
    )
    pecas = [
        schemas.PecaDetalheMensalOut(peca_id=pid, peca_nome=nome, quantidade=int(qtd), custo_total=custo)
        for pid, nome, qtd, custo in pecas_query
    ]

    # Despesas lançadas no período.
    despesas_query = (
        db.query(models.Despesa)
        .filter(extract("year", models.Despesa.data) == ano, extract("month", models.Despesa.data) == mes)
        .order_by(models.Despesa.data.asc())
        .all()
    )
    despesas = [
        schemas.DespesaDetalheMensalOut(despesa_id=d.id, descricao=d.descricao, categoria=d.categoria, valor=d.valor, data=d.data)
        for d in despesas_query
    ]

    return schemas.DetalheMensalOut(ano=ano, mes=mes, orcamentos=orcamentos, pecas=pecas, despesas=despesas)


@router.get("/por-cliente", response_model=list[schemas.ClienteRankingOut])
def por_cliente(db: Session = Depends(get_db)):
    """Ranking de faturamento por cliente — só conta o que já foi
    efetivamente realizado (OS concluída, ou venda de equipamento aprovada)."""
    totais: dict[int, dict] = {}

    for o in db.query(models.Orcamento).filter(models.Orcamento.status == "aprovado").all():
        valor = Decimal("0")
        if o.tipo == "venda_equipamento":
            valor = sum((i.quantidade * i.preco_unitario for i in o.itens_venda), Decimal("0"))
        elif any(os_.status == "concluido" for os_ in o.ordens_servico):
            valor = sum((i.quantidade * i.valor_unitario for i in o.itens), Decimal("0"))

        if valor > 0:
            registro = totais.setdefault(o.cliente_id, {"nome": o.cliente.nome, "total": Decimal("0")})
            registro["total"] += valor

    ranking = [
        schemas.ClienteRankingOut(cliente_id=cid, cliente_nome=v["nome"], faturamento_total=v["total"])
        for cid, v in totais.items()
    ]
    ranking.sort(key=lambda r: r.faturamento_total, reverse=True)
    return ranking
