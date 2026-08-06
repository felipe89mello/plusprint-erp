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


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj_cpf: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    endereco: Optional[str] = None


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
    descricao: str
    status: str = "aberto"


class OrdemServicoCreate(OrdemServicoBase):
    pass


class OrdemServicoUpdate(BaseModel):
    equipamento_id: Optional[int] = None
    descricao: Optional[str] = None
    status: Optional[str] = None
    data_conclusao: Optional[datetime] = None


class OrdemServicoOut(OrdemServicoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data_abertura: datetime
    data_conclusao: Optional[datetime] = None


# ---------- Orçamento ----------

class OrcamentoBase(BaseModel):
    ordem_servico_id: int
    descricao_itens: str
    valor_total: Decimal
    status: str = "pendente"


class OrcamentoCreate(OrcamentoBase):
    pass


class OrcamentoUpdate(BaseModel):
    descricao_itens: Optional[str] = None
    valor_total: Optional[Decimal] = None
    status: Optional[str] = None


class OrcamentoOut(OrcamentoBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    data: datetime


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


class PecaCreate(PecaBase):
    pass


class PecaUpdate(BaseModel):
    nome: Optional[str] = None
    quantidade_estoque: Optional[int] = None
    valor_unitario: Optional[Decimal] = None


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
    data_uso: datetime


# ---------- Dashboard ----------

class DashboardOut(BaseModel):
    os_abertas: int
    os_em_andamento: int
    os_concluidas: int
    faturamento_mes_atual: Decimal
    contratos_ativos: int
    pecas_com_estoque_baixo: list[PecaOut]
