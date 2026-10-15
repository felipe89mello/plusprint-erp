"""add categoria peca

Revision ID: a7c4e91d5b28
Revises: f6b3d8a20c47
Create Date: 2026-10-15 14:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7c4e91d5b28'
down_revision = 'f6b3d8a20c47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pecas', sa.Column('categoria', sa.String(length=30), nullable=True))
    # Organiza o que já existe pela marca; o que não for Zebra/Argox vai para "outros".
    # Impressoras (aparelho inteiro) precisam ser marcadas à mão, a marca sozinha não diz isso.
    op.execute("UPDATE pecas SET categoria = 'peca_zebra' WHERE LOWER(TRIM(COALESCE(marca, ''))) = 'zebra'")
    op.execute("UPDATE pecas SET categoria = 'peca_argox' WHERE LOWER(TRIM(COALESCE(marca, ''))) = 'argox'")
    op.execute("UPDATE pecas SET categoria = 'outros' WHERE categoria IS NULL")


def downgrade() -> None:
    op.drop_column('pecas', 'categoria')
