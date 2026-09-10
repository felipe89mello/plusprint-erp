"""add contas_pagar

Revision ID: d4e6b83fa910
Revises: c3d8f92a17e5
Create Date: 2026-09-10 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e6b83fa910'
down_revision = 'c3d8f92a17e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'contas_pagar',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('descricao', sa.String(length=250), nullable=False),
        sa.Column('fornecedor', sa.String(length=150), nullable=True),
        sa.Column('valor', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('data_vencimento', sa.Date(), nullable=False),
        sa.Column('pago', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('data_pagamento', sa.DateTime(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_contas_pagar_id'), 'contas_pagar', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_contas_pagar_id'), table_name='contas_pagar')
    op.drop_table('contas_pagar')
