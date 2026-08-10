from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Table, Text
from sqlalchemy.orm import relationship

from app.database import Base

# Tabela associativa (N:N) entre Contrato e Equipamento — sem model próprio,
# porque só guarda os pares de IDs, sem campos extras.
contrato_equipamento = Table(
    "contrato_equipamento",
    Base.metadata,
    Column("contrato_id", Integer, ForeignKey("contratos.id"), primary_key=True),
    Column("equipamento_id", Integer, ForeignKey("equipamentos.id"), primary_key=True),
)


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    cnpj_cpf = Column(String(20), unique=True, nullable=True)
    telefone = Column(String(60), nullable=True)
    email = Column(String(150), nullable=True)
    endereco = Column(String(250), nullable=True)
    contato_nome = Column(String(150), nullable=True)  # pessoa de contato no cliente

    equipamentos = relationship("Equipamento", back_populates="cliente")
    ordens_servico = relationship("OrdemServico", back_populates="cliente")
    contratos = relationship("Contrato", back_populates="cliente")
    orcamentos = relationship("Orcamento", back_populates="cliente")


class Equipamento(Base):
    __tablename__ = "equipamentos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    marca = Column(String(100), nullable=False)
    modelo = Column(String(100), nullable=False)
    numero_serie = Column(String(100), nullable=True)
    tipo = Column(String(50), nullable=True)  # ex: impressora, leitor

    cliente = relationship("Cliente", back_populates="equipamentos")
    ordens_servico = relationship("OrdemServico", back_populates="equipamento")
    contratos = relationship("Contrato", secondary=contrato_equipamento, back_populates="equipamentos")
    orcamento_vinculos = relationship("OrcamentoEquipamento", back_populates="equipamento")


class OrdemServico(Base):
    __tablename__ = "ordens_servico"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    equipamento_id = Column(Integer, ForeignKey("equipamentos.id"), nullable=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id"), nullable=True)  # orçamento que originou esta OS
    descricao = Column(Text, nullable=False)
    status = Column(String(30), default="aberto")  # aberto | em_andamento | concluido
    data_abertura = Column(DateTime, default=datetime.utcnow)
    data_conclusao = Column(DateTime, nullable=True)

    cliente = relationship("Cliente", back_populates="ordens_servico")
    equipamento = relationship("Equipamento", back_populates="ordens_servico")
    orcamento = relationship("Orcamento", back_populates="ordens_servico")
    itens_peca = relationship("ItemPecaOS", back_populates="ordem_servico")
    itens_servico = relationship("ItemServicoOS", back_populates="ordem_servico", cascade="all, delete-orphan")


class Orcamento(Base):
    __tablename__ = "orcamentos"

    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(20), nullable=True)  # nº da proposta comercial (ex: "084")
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    local_equipamento = Column(String(150), nullable=True)  # ex: "Loja Mooca"

    observacoes = Column(Text, nullable=True)

    validade_dias = Column(Integer, default=5)
    condicoes_pagamento = Column(String(100), nullable=True)  # ex: "28DDL"
    prazo_entrega = Column(String(150), nullable=True)  # ex: "30 dias após aprovação"
    garantia_dias = Column(Integer, default=90)
    responsabilidade_transporte = Column(String(150), default="Cliente")
    tecnico_responsavel = Column(String(150), nullable=True)

    status = Column(String(30), default="pendente")  # pendente | aprovado | recusado
    data = Column(DateTime, default=datetime.utcnow)

    cliente = relationship("Cliente", back_populates="orcamentos")
    itens_equipamento = relationship("OrcamentoEquipamento", back_populates="orcamento", cascade="all, delete-orphan")
    ordens_servico = relationship("OrdemServico", back_populates="orcamento")
    itens = relationship("ItemOrcamento", back_populates="orcamento", cascade="all, delete-orphan")


class OrcamentoEquipamento(Base):
    """Vincula um equipamento ao orçamento, com diagnóstico e solução PRÓPRIOS
    daquele equipamento — permite orçar várias impressoras juntas, cada uma
    com seu defeito e solução, em vez de um texto único para tudo."""

    __tablename__ = "orcamento_equipamento"

    id = Column(Integer, primary_key=True, index=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id"), nullable=False)
    equipamento_id = Column(Integer, ForeignKey("equipamentos.id"), nullable=False)
    defeitos_constatados = Column(Text, nullable=True)
    solucao_adotada = Column(Text, nullable=True)

    orcamento = relationship("Orcamento", back_populates="itens_equipamento")
    equipamento = relationship("Equipamento", back_populates="orcamento_vinculos")


class ItemOrcamento(Base):
    """Uma linha da tabela 'Peças e Serviços' do orçamento (qtde/hrs, descrição, valor unitário)."""

    __tablename__ = "itens_orcamento"

    id = Column(Integer, primary_key=True, index=True)
    orcamento_id = Column(Integer, ForeignKey("orcamentos.id"), nullable=False)
    quantidade = Column(Numeric(10, 2), nullable=False)
    descricao = Column(String(250), nullable=False)
    valor_unitario = Column(Numeric(10, 2), nullable=False)

    orcamento = relationship("Orcamento", back_populates="itens")


class Contrato(Base):
    __tablename__ = "contratos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    descricao = Column(String(250), nullable=True)
    periodicidade_visita = Column(String(30), nullable=True)  # mensal | trimestral | semestral
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=True)
    valor_mensal = Column(Numeric(10, 2), nullable=False)
    suprimentos_por_conta_cliente = Column(Boolean, default=True)
    status = Column(String(30), default="ativo")  # ativo | encerrado | suspenso

    cliente = relationship("Cliente", back_populates="contratos")
    equipamentos = relationship("Equipamento", secondary=contrato_equipamento, back_populates="contratos")


class Peca(Base):
    __tablename__ = "pecas"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(150), nullable=False)
    partnumber = Column(String(100), nullable=True)
    quantidade_estoque = Column(Integer, nullable=False, default=0)
    valor_unitario = Column(Numeric(10, 2), nullable=False)  # preço de venda
    valor_compra = Column(Numeric(10, 2), nullable=True)  # quanto você pagou (custo)

    itens_os = relationship("ItemPecaOS", back_populates="peca")


class ItemPecaOS(Base):
    __tablename__ = "itens_peca_os"

    id = Column(Integer, primary_key=True, index=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)
    peca_id = Column(Integer, ForeignKey("pecas.id"), nullable=False)
    quantidade_usada = Column(Integer, nullable=False)
    valor_unitario_na_epoca = Column(Numeric(10, 2), nullable=False)  # preço de venda "congelado"
    custo_unitario_na_epoca = Column(Numeric(10, 2), nullable=False, default=0)  # custo "congelado"
    data_uso = Column(DateTime, default=datetime.utcnow)

    ordem_servico = relationship("OrdemServico", back_populates="itens_peca")
    peca = relationship("Peca", back_populates="itens_os")


class ItemServicoOS(Base):
    """Linha de serviço/mão de obra lançada direto na OS (ex: Hora técnica,
    Deslocamento) — não vem do estoque de peças, é digitada livremente,
    igual à tabela 'Peças e Serviços' do Orçamento."""

    __tablename__ = "itens_servico_os"

    id = Column(Integer, primary_key=True, index=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)
    descricao = Column(String(250), nullable=False)
    quantidade = Column(Numeric(10, 2), nullable=False)
    valor_unitario = Column(Numeric(10, 2), nullable=False)

    ordem_servico = relationship("OrdemServico", back_populates="itens_servico")
