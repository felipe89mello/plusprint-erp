"""add parcelas receber

Revision ID: b8d5f12c9a63
Revises: a7c4e91d5b28
Create Date: 2026-11-13 11:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8d5f12c9a63'
down_revision = 'a7c4e91d5b28'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'parcelas_receber',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('orcamento_id', sa.Integer(), nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('dias', sa.Integer(), nullable=False),
        sa.Column('pago', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('data_pagamento', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['orcamento_id'], ['orcamentos.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_parcelas_receber_id'), 'parcelas_receber', ['id'], unique=False)
    op.create_index(op.f('ix_parcelas_receber_orcamento_id'), 'parcelas_receber', ['orcamento_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_parcelas_receber_orcamento_id'), table_name='parcelas_receber')
    op.drop_index(op.f('ix_parcelas_receber_id'), table_name='parcelas_receber')
    op.drop_table('parcelas_receber')
