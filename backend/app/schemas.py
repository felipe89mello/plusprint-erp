from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------- Cliente ----------

class ClienteBase(BaseModel):
    nome: str
    cnpj_cpf: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    contato_nome: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj_cpf: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None
    contato_nome: Optional[str] = None


class ClienteOut(ClienteBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Equipamento ----------

class EquipamentoBase(BaseModel):
    cliente_id: int
    marca: str
    modelo: str
    numero_serie: Optional[str] = None
    tipo: Optional[str] = None


class EquipamentoCreate(EquipamentoBase):
    pass


class EquipamentoUpdate(BaseModel):
    cliente_id: Optional[int] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    numero_serie: Optional[str] = None
    tipo: Optional[str] = None


class EquipamentoOut(EquipamentoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Ordem de Serviço ----------

class ItemServicoOSCreate(BaseModel):
    descricao: str
    quantidade: Decimal
    valor_unitario: Decimal


class ItemServicoOSOut(ItemServicoOSCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    valor_total: Decimal = Decimal("0")

    @classmethod
    def from_model(cls, item):
        return cls(
            id=item.id,
            descricao=item.descricao,
            quantidade=item.quantidade,
            valor_unitario=item.valor_unitario,
            valor_total=item.quantidade * item.valor_unitario,
        )


class OrdemServicoBase(BaseModel):
    numero: Optional[str] = None
    cliente_id: int
    orcamento_id: Optional[int] = None  # orçamento que originou esta OS, se houver
    descricao: str
    status: str = "aberto"


class OrdemServicoCreate(OrdemServicoBase):
    data_abertura: Optional[datetime] = None  # se não informado, usa a data/hora atual
    data_conclusao: Optional[datetime] = None
    itens_servico: list[ItemServicoOSCreate] = []
    equipamento_ids: list[int] = []


class OrdemServicoUpdate(BaseModel):
    orcamento_id: Optional[int] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_abertura: Optional[datetime] = None
    data_conclusao: Optional[datetime] = None
    itens_servico: Optional[list[ItemServicoOSCreate]] = None
    equipamento_ids: Optional[list[int]] = None


class OrdemServicoOut(OrdemServicoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data_abertura: datetime
    data_conclusao: Optional[datetime] = None
    itens_servico: list[ItemServicoOSOut] = []
    valor_total: Decimal = Decimal("0")
    equipamento_ids: list[int] = []

    @classmethod
    def from_model(cls, os_):
        data = {c: getattr(os_, c) for c in OrdemServicoBase.model_fields}
        data["id"] = os_.id
        data["data_abertura"] = os_.data_abertura
        data["data_conclusao"] = os_.data_conclusao
        data["itens_servico"] = [ItemServicoOSOut.from_model(i) for i in os_.itens_servico]
        data["valor_total"] = sum((i.quantidade * i.valor_unitario for i in os_.itens_servico), Decimal("0"))
        data["equipamento_ids"] = [e.id for e in os_.equipamentos]
        return cls(**data)


# ---------- Orçamento ----------

class ItemOrcamentoCreate(BaseModel):
    quantidade: Decimal
    descricao: str
    valor_unitario: Decimal


class ItemOrcamentoOut(ItemOrcamentoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    valor_total: Decimal = Decimal("0")

    @classmethod
    def from_model(cls, item):
        return cls(
            id=item.id,
            quantidade=item.quantidade,
            descricao=item.descricao,
            valor_unitario=item.valor_unitario,
            valor_total=item.quantidade * item.valor_unitario,
        )


class OrcamentoEquipamentoItem(BaseModel):
    equipamento_id: int
    defeitos_constatados: Optional[str] = None
    solucao_adotada: Optional[str] = None


class OrcamentoEquipamentoOut(OrcamentoEquipamentoItem):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ItemVendaEquipamentoCreate(BaseModel):
    ncm: Optional[str] = None
    partnumber: Optional[str] = None
    descricao: str
    quantidade: Decimal = Decimal("1")
    unidade: str = "Peça"
    garantia_meses: Optional[int] = None
    prazo_entrega: Optional[str] = None
    ipi_percentual: Optional[Decimal] = None
    icms_percentual: Optional[Decimal] = None
    preco_unitario: Decimal
    custo_unitario: Optional[Decimal] = None


class ItemVendaEquipamentoOut(ItemVendaEquipamentoCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    valor_total: Decimal = Decimal("0")

    @classmethod
    def from_model(cls, item):
        return cls(
            id=item.id,
            ncm=item.ncm,
            partnumber=item.partnumber,
            descricao=item.descricao,
            quantidade=item.quantidade,
            unidade=item.unidade,
            garantia_meses=item.garantia_meses,
            prazo_entrega=item.prazo_entrega,
            ipi_percentual=item.ipi_percentual,
            icms_percentual=item.icms_percentual,
            preco_unitario=item.preco_unitario,
            custo_unitario=item.custo_unitario,
            valor_total=item.quantidade * item.preco_unitario,
        )


class OrcamentoBase(BaseModel):
    numero: Optional[str] = None
    tipo: str = "tecnico"  # tecnico (manutenção) | venda_equipamento
    cliente_id: int
    local_equipamento: Optional[str] = None
    observacoes: Optional[str] = None
    validade_dias: int = 5
    condicoes_pagamento: Optional[str] = None
    prazo_entrega: Optional[str] = None
    garantia_dias: int = 90
    responsabilidade_transporte: str = "Cliente"
    tecnico_responsavel: Optional[str] = None
    status: str = "pendente"
    pago: bool = False


class OrcamentoCreate(OrcamentoBase):
    itens: list[ItemOrcamentoCreate] = []
    equipamentos: list[OrcamentoEquipamentoItem] = []
    itens_venda: list[ItemVendaEquipamentoCreate] = []
    data: Optional[datetime] = None  # se não informado, usa a data/hora atual (emissão)
    data_pagamento: Optional[datetime] = None


class OrcamentoUpdate(BaseModel):
    numero: Optional[str] = None
    tipo: Optional[str] = None
    local_equipamento: Optional[str] = None
    observacoes: Optional[str] = None
    validade_dias: Optional[int] = None
    condicoes_pagamento: Optional[str] = None
    prazo_entrega: Optional[str] = None
    garantia_dias: Optional[int] = None
    responsabilidade_transporte: Optional[str] = None
    tecnico_responsavel: Optional[str] = None
    status: Optional[str] = None
    itens: Optional[list[ItemOrcamentoCreate]] = None
    equipamentos: Optional[list[OrcamentoEquipamentoItem]] = None
    itens_venda: Optional[list[ItemVendaEquipamentoCreate]] = None
    data: Optional[datetime] = None
    pago: Optional[bool] = None
    data_pagamento: Optional[datetime] = None


class OrcamentoOut(OrcamentoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data: datetime
    data_pagamento: Optional[datetime] = None
    itens: list[ItemOrcamentoOut] = []
    itens_venda: list[ItemVendaEquipamentoOut] = []
    valor_total: Decimal = Decimal("0")
    equipamentos: list[OrcamentoEquipamentoOut] = []

    @classmethod
    def from_model(cls, orcamento):
        data = {c: getattr(orcamento, c) for c in OrcamentoBase.model_fields}
        data["id"] = orcamento.id
        data["data"] = orcamento.data
        data["data_pagamento"] = orcamento.data_pagamento
        data["tipo"] = data.get("tipo") or "tecnico"  # registros antigos (antes do campo existir) ficam com NULL
        data["pago"] = bool(data.get("pago"))  # idem — registros antigos ficam com NULL
        data["itens"] = [ItemOrcamentoOut.from_model(i) for i in orcamento.itens]
        data["itens_venda"] = [ItemVendaEquipamentoOut.from_model(i) for i in orcamento.itens_venda]
        valor_servicos = sum((i.quantidade * i.valor_unitario for i in orcamento.itens), Decimal("0"))
        valor_venda = sum((i.quantidade * i.preco_unitario for i in orcamento.itens_venda), Decimal("0"))
        data["valor_total"] = valor_servicos + valor_venda
        data["equipamentos"] = [OrcamentoEquipamentoOut.model_validate(v) for v in orcamento.itens_equipamento]
        return cls(**data)


# ---------- Contrato ----------

class ContratoBase(BaseModel):
    cliente_id: int
    descricao: Optional[str] = None
    periodicidade_visita: Optional[str] = None
    data_inicio: date
    data_fim: Optional[date] = None
    valor_mensal: Decimal
    suprimentos_por_conta_cliente: bool = True
    status: str = "ativo"


class ContratoCreate(ContratoBase):
    equipamento_ids: list[int] = []


class ContratoUpdate(BaseModel):
    descricao: Optional[str] = None
    periodicidade_visita: Optional[str] = None
    data_fim: Optional[date] = None
    valor_mensal: Optional[Decimal] = None
    suprimentos_por_conta_cliente: Optional[bool] = None
    status: Optional[str] = None
    equipamento_ids: Optional[list[int]] = None


class ContratoOut(ContratoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    equipamento_ids: list[int] = []

    @classmethod
    def from_model(cls, contrato):
        data = {c: getattr(contrato, c) for c in ContratoBase.model_fields}
        data["id"] = contrato.id
        data["equipamento_ids"] = [e.id for e in contrato.equipamentos]
        return cls(**data)


# ---------- Peça ----------

class PecaBase(BaseModel):
    nome: str
    partnumber: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    quantidade_estoque: int = 0
    valor_unitario: Decimal
    valor_compra: Optional[Decimal] = None


class PecaCreate(PecaBase):
    pass


class PecaUpdate(BaseModel):
    nome: Optional[str] = None
    partnumber: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    quantidade_estoque: Optional[int] = None
    valor_unitario: Optional[Decimal] = None
    valor_compra: Optional[Decimal] = None


class PecaOut(PecaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Item de Peça usado em OS ----------

class ItemPecaOSCreate(BaseModel):
    ordem_servico_id: int
    peca_id: int
    quantidade_usada: int


class ItemPecaOSOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ordem_servico_id: int
    peca_id: int
    quantidade_usada: int
    valor_unitario_na_epoca: Decimal
    custo_unitario_na_epoca: Decimal
    data_uso: datetime


# ---------- Dashboard (só operacional) ----------

class DashboardOut(BaseModel):
    os_abertas: int
    os_em_andamento: int
    os_concluidas: int
    contratos_ativos: int
    pecas_com_estoque_baixo: list[PecaOut]


# ---------- Despesa ----------

class DespesaBase(BaseModel):
    descricao: str
    categoria: Optional[str] = None
    valor: Decimal
    data: date
    observacoes: Optional[str] = None


class DespesaCreate(DespesaBase):
    pass


class DespesaUpdate(BaseModel):
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    valor: Optional[Decimal] = None
    data: Optional[date] = None
    observacoes: Optional[str] = None


class DespesaOut(DespesaBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Financeiro ----------

class FinanceiroResumoOut(BaseModel):
    faturamento_mes: Decimal
    custo_pecas_mes: Decimal
    despesas_mes: Decimal
    liquido_mes: Decimal
    faturamento_ano: Decimal
    custo_pecas_ano: Decimal
    despesas_ano: Decimal
    liquido_ano: Decimal
    orcamentos_total: int
    orcamentos_pendentes: int
    orcamentos_aprovados: int
    orcamentos_recusados: int


class ContaReceberOut(BaseModel):
    orcamento_id: int
    numero: Optional[str] = None
    cliente_nome: str
    valor_total: Decimal
    condicoes_pagamento: Optional[str] = None
    data_referencia: Optional[date] = None  # base usada no cálculo (conclusão da OS ou emissão)
    dias_prazo: Optional[int] = None
    data_vencimento: Optional[date] = None
    pago: bool
    data_pagamento: Optional[datetime] = None
    situacao: str  # pago | em_dia | vence_em_breve | atrasado | aguardando_conclusao


class FaturamentoMensalPonto(BaseModel):
    ano: int
    mes: int
    faturamento: Decimal
    custo: Decimal
    liquido: Decimal


class ClienteRankingOut(BaseModel):
    cliente_id: int
    cliente_nome: str
    faturamento_total: Decimal


class OrcamentoDetalheMensalOut(BaseModel):
    orcamento_id: int
    numero: Optional[str] = None
    cliente_nome: str
    tipo: str  # tecnico | venda_equipamento
    valor: Decimal


class PecaDetalheMensalOut(BaseModel):
    peca_id: int
    peca_nome: str
    quantidade: int
    custo_total: Decimal


class DespesaDetalheMensalOut(BaseModel):
    despesa_id: int
    descricao: str
    categoria: Optional[str] = None
    valor: Decimal
    data: date


class DetalheMensalOut(BaseModel):
    ano: int
    mes: int
    orcamentos: list[OrcamentoDetalheMensalOut]
    pecas: list[PecaDetalheMensalOut]
    despesas: list[DespesaDetalheMensalOut]
