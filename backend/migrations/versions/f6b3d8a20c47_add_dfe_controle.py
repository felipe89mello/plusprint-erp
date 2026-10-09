"""add dfe_controle

Revision ID: f6b3d8a20c47
Revises: e5a2c7f19b34
Create Date: 2026-10-09 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6b3d8a20c47'
down_revision = 'e5a2c7f19b34'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'dfe_controle',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ultimo_nsu', sa.String(length=15), nullable=False, server_default='000000000000000'),
        sa.Column('ultima_consulta', sa.DateTime(), nullable=True),
        sa.Column('bloqueado_ate', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('dfe_controle')
