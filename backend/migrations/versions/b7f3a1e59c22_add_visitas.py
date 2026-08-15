"""add visitas

Revision ID: b7f3a1e59c22
Revises: a1c9e7d4f210
Create Date: 2026-08-15 02:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7f3a1e59c22'
down_revision = 'a1c9e7d4f210'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'visitas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('cliente_id', sa.Integer(), nullable=False),
        sa.Column('data', sa.Date(), nullable=False),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['cliente_id'], ['clientes.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_visitas_id'), 'visitas', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_visitas_id'), table_name='visitas')
    op.drop_table('visitas')
