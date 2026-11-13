import re
from datetime import date, datetime, timedelta
from decimal import ROUND_DOWN, Decimal

from fastapi import APIRouter, Depends, HTTPException
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


# Vários prazos seguidos: "30/60/90 DDL", "30-60-90", "30, 60 e 90 dias", "30+60".
_RE_PRAZOS = re.compile(r"\d+(?:\s*(?:ddl|dias|d)?\s*(?:/|,|-|\+|&|e)\s*\d+)+", re.IGNORECASE)


def _prazos_parcelas(condicoes_pagamento: str | None) -> list[int]:
    """Prazos de um pagamento parcelado, ex: '30/60/90 DDL' -> [30, 60, 90].
    Devolve lista vazia quando há um prazo só (ex: '28DDL') ou nenhum — nesses
    casos o orçamento não é parcelado e segue a regra antiga."""
    if not condicoes_pagamento:
        return []
    m = _RE_PRAZOS.search(condicoes_pagamento)
    if not m:
        return []
    prazos = [int(n) for n in re.findall(r"\d+", m.group(0))]
    return prazos if len(prazos) >= 2 else []


def _dividir_em_parcelas(total: Decimal, n: int) -> list[Decimal]:
    """Divide o total em n parcelas iguais (2 casas). A diferença de centavos
    fica na última parcela, para a soma bater exatamente com o total."""
    base = (total / n).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    partes = [base] * (n - 1)
    partes.append(total - base * (n - 1))
    return partes


def _sincronizar_parcelas(db: Session, o: models.Orcamento, prazos: list[int]) -> bool:
    """Deixa as parcelas gravadas iguais aos prazos escritos na condição de
    pagamento (cria as que faltam, ajusta prazos, remove as que sobram).
    Devolve True se mudou alguma coisa."""
    mudou = False
    existentes = list(o.parcelas)
    for i, dias in enumerate(prazos):
        if i < len(existentes):
            if existentes[i].dias != dias:
                existentes[i].dias = dias
                mudou = True
        else:
            # Orçamento já marcado como pago antes do parcelamento: nasce tudo pago.
            o.parcelas.append(models.ParcelaReceber(numero=i + 1, dias=dias, pago=bool(o.pago)))
            mudou = True
    for extra in existentes[len(prazos):]:
        o.parcelas.remove(extra)
        mudou = True
    if mudou:
        db.flush()
    return mudou


def _situacao_vencimento(pago: bool, data_ref: date | None, dias: int | None, hoje: date):
    """(situacao, data_vencimento) de uma conta a receber (orçamento inteiro ou parcela)."""
    if pago:
        return "pago", None
    if data_ref is None:
        return "aguardando_conclusao", None
    if dias is None:
        return "em_dia", None  # prazo de pagamento não informado no orçamento
    data_venc = data_ref + timedelta(days=dias)
    if data_venc < hoje:
        return "atrasado", data_venc
    if (data_venc - hoje).days <= 5:
        return "vence_em_breve", data_venc
    return "em_dia", data_venc


def _faturamento_tecnico_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    """Soma dos itens de orçamentos técnicos vinculados a OS concluídas no período."""
    query = (
        db.query(func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0))
        .join(models.Orcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
        .join(models.OrdemServico, models.OrdemServico.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.tipo != "desenvolvimento",  # esse tipo é contado à parte, na aprovação
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


def _faturamento_desenvolvimento_periodo(db: Session, ano: int, mes: int | None = None) -> Decimal:
    """Soma dos itens de orçamentos de desenvolvimento (ex: projeto de etiquetas)
    aprovados no período — mesma regra da venda de equipamento: a receita é
    considerada realizada na aprovação, sem depender de OS."""
    query = (
        db.query(func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0))
        .join(models.Orcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.tipo == "desenvolvimento",
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
def resumo_financeiro(ano: int | None = None, db: Session = Depends(get_db)):
    agora = datetime.utcnow()
    ano_resumo = ano if ano is not None else agora.year

    faturamento_mes = _faturamento_tecnico_periodo(db, agora.year, agora.month) + _faturamento_venda_periodo(db, agora.year, agora.month) + _faturamento_desenvolvimento_periodo(db, agora.year, agora.month)
    custo_pecas_mes = _custo_pecas_periodo(db, agora.year, agora.month) + _custo_vendas_periodo(db, agora.year, agora.month)
    despesas_mes = _despesas_periodo(db, agora.year, agora.month)

    faturamento_ano = _faturamento_tecnico_periodo(db, ano_resumo) + _faturamento_venda_periodo(db, ano_resumo) + _faturamento_desenvolvimento_periodo(db, ano_resumo)
    custo_pecas_ano = _custo_pecas_periodo(db, ano_resumo) + _custo_vendas_periodo(db, ano_resumo)
    despesas_ano = _despesas_periodo(db, ano_resumo)

    def contar_orcamentos(status: str | None = None) -> int:
        query = db.query(func.count(models.Orcamento.id))
        if status is not None:
            query = query.filter(models.Orcamento.status == status)
        return query.scalar()

    return schemas.FinanceiroResumoOut(
        ano=ano_resumo,
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
    houve_mudanca = False

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

        prazos = _prazos_parcelas(o.condicoes_pagamento)
        if _sincronizar_parcelas(db, o, prazos):
            houve_mudanca = True

        if prazos:
            # Pago em parcelas: uma linha por parcela, com o valor e o vencimento dela.
            valores = _dividir_em_parcelas(valor_total, len(prazos))
            for parcela, valor in zip(o.parcelas, valores):
                situacao, data_venc = _situacao_vencimento(parcela.pago, data_ref, parcela.dias, hoje)
                resultado.append(
                    schemas.ContaReceberOut(
                        orcamento_id=o.id,
                        numero=o.numero,
                        cliente_nome=o.cliente.nome,
                        valor_total=valor,
                        condicoes_pagamento=o.condicoes_pagamento,
                        data_referencia=data_ref,
                        dias_prazo=parcela.dias,
                        data_vencimento=data_venc if data_ref else None,
                        pago=bool(parcela.pago),
                        data_pagamento=parcela.data_pagamento,
                        situacao=situacao,
                        parcela_id=parcela.id,
                        parcela_numero=parcela.numero,
                        parcela_total=len(prazos),
                    )
                )
            continue

        dias = _dias_prazo(o.condicoes_pagamento)
        situacao, data_venc = _situacao_vencimento(bool(o.pago), data_ref, dias, hoje)
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

    if houve_mudanca:
        db.commit()

    ordem = {"atrasado": 0, "vence_em_breve": 1, "em_dia": 2, "aguardando_conclusao": 3, "pago": 4}
    resultado.sort(key=lambda r: (ordem.get(r.situacao, 5), r.data_vencimento or date.max))
    return resultado


@router.get("/anos-disponiveis", response_model=list[int])
def anos_disponiveis(db: Session = Depends(get_db)):
    """Anos que têm algum dado financeiro (OS concluída, orçamento aprovado
    ou despesa lançada), sempre incluindo o ano atual — usado para montar os
    botões de ano do gráfico Faturamento x Líquido."""
    anos = set()
    for (a,) in db.query(extract("year", models.OrdemServico.data_conclusao)).filter(models.OrdemServico.status == "concluido").distinct():
        if a is not None:
            anos.add(int(a))
    for (a,) in db.query(extract("year", models.Orcamento.data)).filter(models.Orcamento.status == "aprovado").distinct():
        if a is not None:
            anos.add(int(a))
    for (a,) in db.query(extract("year", models.Despesa.data)).distinct():
        if a is not None:
            anos.add(int(a))
    anos.add(datetime.utcnow().year)
    return sorted(anos)


@router.get("/faturamento-mensal", response_model=list[schemas.FaturamentoMensalPonto])
def faturamento_mensal(ano: int | None = None, db: Session = Depends(get_db)):
    """Os 12 meses (Jan-Dez) de faturamento/custo/líquido do ano informado
    (padrão: ano atual)."""
    if ano is None:
        ano = datetime.utcnow().year

    pontos = []
    for m in range(1, 13):
        fat = _faturamento_tecnico_periodo(db, ano, m) + _faturamento_venda_periodo(db, ano, m) + _faturamento_desenvolvimento_periodo(db, ano, m)
        custo = _custo_pecas_periodo(db, ano, m) + _custo_vendas_periodo(db, ano, m)
        pontos.append(schemas.FaturamentoMensalPonto(ano=ano, mes=m, faturamento=fat, custo=custo, liquido=fat - custo))
    return pontos


@router.get("/detalhe-mensal", response_model=schemas.DetalheMensalOut)
def detalhe_mensal(ano: int, mes: int | None = None, db: Session = Depends(get_db)):
    """Detalhamento por trás dos totais de um período: orçamentos que
    compuseram o faturamento, peças usadas e despesas lançadas — usado no
    modal de detalhe do gráfico Faturamento x Líquido e dos cards do
    dashboard. Se `mes` não for informado, agrega o ano inteiro."""

    orcamentos: list[schemas.OrcamentoDetalheMensalOut] = []

    # Técnico: orçamentos com ao menos uma OS concluída no período (mesma
    # regra usada em _faturamento_tecnico_periodo, mas agrupado por orçamento).
    tecnicos_query = (
        db.query(
            models.Orcamento,
            func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0).label("valor"),
        )
        .join(models.ItemOrcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
        .join(models.OrdemServico, models.OrdemServico.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.tipo != "desenvolvimento",  # esse tipo é contado à parte, na aprovação
            models.OrdemServico.status == "concluido",
            extract("year", models.OrdemServico.data_conclusao) == ano,
        )
    )
    if mes is not None:
        tecnicos_query = tecnicos_query.filter(extract("month", models.OrdemServico.data_conclusao) == mes)
    for o, valor in tecnicos_query.group_by(models.Orcamento.id).all():
        if valor > 0:
            orcamentos.append(
                schemas.OrcamentoDetalheMensalOut(
                    orcamento_id=o.id, numero=o.numero, cliente_nome=o.cliente.nome, tipo="tecnico", valor=valor
                )
            )

    # Venda de equipamento: orçamentos aprovados no período (valor de venda e
    # custo pago no equipamento, lado a lado).
    vendas_query = (
        db.query(
            models.Orcamento,
            func.coalesce(func.sum(models.ItemVendaEquipamento.quantidade * models.ItemVendaEquipamento.preco_unitario), 0).label("valor"),
            func.coalesce(func.sum(models.ItemVendaEquipamento.quantidade * models.ItemVendaEquipamento.custo_unitario), 0).label("custo"),
        )
        .join(models.ItemVendaEquipamento, models.ItemVendaEquipamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.status == "aprovado",
            extract("year", models.Orcamento.data) == ano,
        )
    )
    if mes is not None:
        vendas_query = vendas_query.filter(extract("month", models.Orcamento.data) == mes)
    for o, valor, custo in vendas_query.group_by(models.Orcamento.id).all():
        if valor > 0:
            orcamentos.append(
                schemas.OrcamentoDetalheMensalOut(
                    orcamento_id=o.id,
                    numero=o.numero,
                    cliente_nome=o.cliente.nome,
                    tipo="venda_equipamento",
                    valor=valor,
                    custo=custo,
                )
            )

    # Desenvolvimento: mesma regra da venda de equipamento — conta na
    # aprovação do orçamento, sem depender de OS (não tem equipamento físico
    # nem visita técnica vinculada).
    desenvolvimento_query = (
        db.query(
            models.Orcamento,
            func.coalesce(func.sum(models.ItemOrcamento.quantidade * models.ItemOrcamento.valor_unitario), 0).label("valor"),
        )
        .join(models.ItemOrcamento, models.ItemOrcamento.orcamento_id == models.Orcamento.id)
        .filter(
            models.Orcamento.tipo == "desenvolvimento",
            models.Orcamento.status == "aprovado",
            extract("year", models.Orcamento.data) == ano,
        )
    )
    if mes is not None:
        desenvolvimento_query = desenvolvimento_query.filter(extract("month", models.Orcamento.data) == mes)
    for o, valor in desenvolvimento_query.group_by(models.Orcamento.id).all():
        if valor > 0:
            orcamentos.append(
                schemas.OrcamentoDetalheMensalOut(
                    orcamento_id=o.id, numero=o.numero, cliente_nome=o.cliente.nome, tipo="desenvolvimento", valor=valor
                )
            )

    orcamentos.sort(key=lambda r: r.valor, reverse=True)

    # Peças usadas em OS concluídas no período, agrupadas por peça.
    pecas_base_query = (
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
        )
    )
    if mes is not None:
        pecas_base_query = pecas_base_query.filter(extract("month", models.OrdemServico.data_conclusao) == mes)
    pecas_query = pecas_base_query.group_by(models.Peca.id, models.Peca.nome).order_by(
        func.sum(models.ItemPecaOS.quantidade_usada * models.ItemPecaOS.custo_unitario_na_epoca).desc()
    ).all()
    pecas = [
        schemas.PecaDetalheMensalOut(peca_id=pid, peca_nome=nome, quantidade=int(qtd), custo_total=custo)
        for pid, nome, qtd, custo in pecas_query
    ]

    # Despesas lançadas no período.
    despesas_base_query = db.query(models.Despesa).filter(extract("year", models.Despesa.data) == ano)
    if mes is not None:
        despesas_base_query = despesas_base_query.filter(extract("month", models.Despesa.data) == mes)
    despesas_query = despesas_base_query.order_by(models.Despesa.data.asc()).all()
    despesas = [
        schemas.DespesaDetalheMensalOut(despesa_id=d.id, descricao=d.descricao, categoria=d.categoria, valor=d.valor, data=d.data)
        for d in despesas_query
    ]

    return schemas.DetalheMensalOut(ano=ano, mes=mes, orcamentos=orcamentos, pecas=pecas, despesas=despesas)


@router.put("/parcelas-receber/{parcela_id}", response_model=schemas.ParcelaReceberOut)
def marcar_parcela_paga(parcela_id: int, dados: schemas.ParcelaReceberUpdate, db: Session = Depends(get_db)):
    """Marca (ou desfaz) o pagamento de UMA parcela. O orçamento só fica como
    pago quando todas as parcelas dele estiverem pagas."""
    parcela = db.get(models.ParcelaReceber, parcela_id)
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")

    parcela.pago = dados.pago
    parcela.data_pagamento = datetime.utcnow() if dados.pago else None

    orcamento = parcela.orcamento
    todas_pagas = all(p.pago for p in orcamento.parcelas)
    orcamento.pago = todas_pagas
    orcamento.data_pagamento = datetime.utcnow() if todas_pagas else None

    db.commit()
    return schemas.ParcelaReceberOut(
        id=parcela.id,
        orcamento_id=orcamento.id,
        numero=parcela.numero,
        pago=parcela.pago,
        data_pagamento=parcela.data_pagamento,
        orcamento_pago=todas_pagas,
    )


@router.get("/por-cliente", response_model=list[schemas.ClienteRankingOut])
def por_cliente(ano: int | None = None, db: Session = Depends(get_db)):
    """Ranking de faturamento por cliente — só conta o que já foi
    efetivamente realizado (OS concluída, ou venda de equipamento aprovada).

    Sem `ano`, soma tudo (botão "Total"). Com `ano`, só entra o que foi
    realizado naquele ano: a data de referência da venda de equipamento é a da
    aprovação do orçamento; a do serviço técnico é a da conclusão da OS."""
    totais: dict[int, dict] = {}

    for o in db.query(models.Orcamento).filter(models.Orcamento.status == "aprovado").all():
        valor = Decimal("0")
        data_ref = o.data
        if o.tipo == "venda_equipamento":
            valor = sum((i.quantidade * i.preco_unitario for i in o.itens_venda), Decimal("0"))
        else:
            concluidas = [os_ for os_ in o.ordens_servico if os_.status == "concluido"]
            if concluidas:
                valor = sum((i.quantidade * i.valor_unitario for i in o.itens), Decimal("0"))
                datas = [os_.data_conclusao for os_ in concluidas if os_.data_conclusao]
                data_ref = max(datas) if datas else o.data

        if valor <= 0:
            continue
        if ano is not None and (data_ref is None or data_ref.year != ano):
            continue
        registro = totais.setdefault(o.cliente_id, {"nome": o.cliente.nome, "total": Decimal("0")})
        registro["total"] += valor

    ranking = [
        schemas.ClienteRankingOut(cliente_id=cid, cliente_nome=v["nome"], faturamento_total=v["total"])
        for cid, v in totais.items()
    ]
    ranking.sort(key=lambda r: r.faturamento_total, reverse=True)
    return ranking
