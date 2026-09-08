"""orcamento escopo_servico (tipo desenvolvimento)

Revision ID: c3d8f92a17e5
Revises: b7f3a1e59c22
Create Date: 2026-09-03 09:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d8f92a17e5'
down_revision = 'b7f3a1e59c22'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orcamentos', sa.Column('escopo_servico', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('orcamentos', 'escopo_servico')
