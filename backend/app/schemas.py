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

class OrdemServicoBase(BaseModel):
    cliente_id: int
    equipamento_id: Optional[int] = None
    orcamento_id: Optional[int] = None  # orçamento que originou esta OS, se houver
    descricao: str
    status: str = "aberto"


class OrdemServicoCreate(OrdemServicoBase):
    data_abertura: Optional[datetime] = None  # se não informado, usa a data/hora atual


class OrdemServicoUpdate(BaseModel):
    equipamento_id: Optional[int] = None
    orcamento_id: Optional[int] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_abertura: Optional[datetime] = None
    data_conclusao: Optional[datetime] = None


class OrdemServicoOut(OrdemServicoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data_abertura: datetime
    data_conclusao: Optional[datetime] = None


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


class OrcamentoBase(BaseModel):
    numero: Optional[str] = None
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


class OrcamentoCreate(OrcamentoBase):
    itens: list[ItemOrcamentoCreate] = []
    equipamentos: list[OrcamentoEquipamentoItem] = []
    data: Optional[datetime] = None  # se não informado, usa a data/hora atual (emissão)


class OrcamentoUpdate(BaseModel):
    numero: Optional[str] = None
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
    data: Optional[datetime] = None


class OrcamentoOut(OrcamentoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data: datetime
    itens: list[ItemOrcamentoOut] = []
    valor_total: Decimal = Decimal("0")
    equipamentos: list[OrcamentoEquipamentoOut] = []

    @classmethod
    def from_model(cls, orcamento):
        data = {c: getattr(orcamento, c) for c in OrcamentoBase.model_fields}
        data["id"] = orcamento.id
        data["data"] = orcamento.data
        data["itens"] = [ItemOrcamentoOut.from_model(i) for i in orcamento.itens]
        data["valor_total"] = sum((i.quantidade * i.valor_unitario for i in orcamento.itens), Decimal("0"))
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
    quantidade_estoque: int = 0
    valor_unitario: Decimal
    valor_compra: Optional[Decimal] = None


class PecaCreate(PecaBase):
    pass


class PecaUpdate(BaseModel):
    nome: Optional[str] = None
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


# ---------- Dashboard ----------

class DashboardOut(BaseModel):
    os_abertas: int
    os_em_andamento: int
    os_concluidas: int
    faturamento_mes_atual: Decimal
    contratos_ativos: int
    pecas_com_estoque_baixo: list[PecaOut]
    orcamentos_total: int
    orcamentos_pendentes: int
    orcamentos_aprovados: int
    orcamentos_recusados: int
    custo_pecas_mes: Decimal
    liquido_mes: Decimal
    faturamento_ano: Decimal
    custo_pecas_ano: Decimal
    liquido_ano: Decimal
