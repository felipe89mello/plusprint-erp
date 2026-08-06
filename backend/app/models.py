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
    telefone = Column(String(20), nullable=True)
    email = Column(String(150), nullable=True)
    endereco = Column(String(250), nullable=True)

    equipamentos = relationship("Equipamento", back_populates="cliente")
    ordens_servico = relationship("OrdemServico", back_populates="cliente")
    contratos = relationship("Contrato", back_populates="cliente")


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


class OrdemServico(Base):
    __tablename__ = "ordens_servico"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    equipamento_id = Column(Integer, ForeignKey("equipamentos.id"), nullable=True)
    descricao = Column(Text, nullable=False)
    status = Column(String(30), default="aberto")  # aberto | em_andamento | concluido
    data_abertura = Column(DateTime, default=datetime.utcnow)
    data_conclusao = Column(DateTime, nullable=True)

    cliente = relationship("Cliente", back_populates="ordens_servico")
    equipamento = relationship("Equipamento", back_populates="ordens_servico")
    orcamentos = relationship("Orcamento", back_populates="ordem_servico")
    itens_peca = relationship("ItemPecaOS", back_populates="ordem_servico")


class Orcamento(Base):
    __tablename__ = "orcamentos"

    id = Column(Integer, primary_key=True, index=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)
    descricao_itens = Column(Text, nullable=False)
    valor_total = Column(Numeric(10, 2), nullable=False)
    status = Column(String(30), default="pendente")  # pendente | aprovado | recusado
    data = Column(DateTime, default=datetime.utcnow)

    ordem_servico = relationship("OrdemServico", back_populates="orcamentos")


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
    quantidade_estoque = Column(Integer, nullable=False, default=0)
    valor_unitario = Column(Numeric(10, 2), nullable=False)

    itens_os = relationship("ItemPecaOS", back_populates="peca")


class ItemPecaOS(Base):
    __tablename__ = "itens_peca_os"

    id = Column(Integer, primary_key=True, index=True)
    ordem_servico_id = Column(Integer, ForeignKey("ordens_servico.id"), nullable=False)
    peca_id = Column(Integer, ForeignKey("pecas.id"), nullable=False)
    quantidade_usada = Column(Integer, nullable=False)
    valor_unitario_na_epoca = Column(Numeric(10, 2), nullable=False)
    data_uso = Column(DateTime, default=datetime.utcnow)

    ordem_servico = relationship("OrdemServico", back_populates="itens_peca")
    peca = relationship("Peca", back_populates="itens_os")
