"""add notas_fiscais

Revision ID: e5a2c7f19b34
Revises: d4e6b83fa910
Create Date: 2026-10-09 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5a2c7f19b34'
down_revision = 'd4e6b83fa910'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'notas_fiscais',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tipo', sa.String(length=20), nullable=False),
        sa.Column('chave_acesso', sa.String(length=60), nullable=True),
        sa.Column('numero', sa.String(length=20), nullable=True),
        sa.Column('serie', sa.String(length=10), nullable=True),
        sa.Column('data_emissao', sa.Date(), nullable=False),
        sa.Column('valor_total', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('emitente_cnpj', sa.String(length=20), nullable=True),
        sa.Column('emitente_nome', sa.String(length=150), nullable=True),
        sa.Column('destinatario_cnpj', sa.String(length=20), nullable=True),
        sa.Column('destinatario_nome', sa.String(length=150), nullable=True),
        sa.Column('xml', sa.Text(), nullable=True),
        sa.Column('origem', sa.String(length=20), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('chave_acesso'),
    )
    op.create_index(op.f('ix_notas_fiscais_id'), 'notas_fiscais', ['id'], unique=False)

    # Vínculo opcional: se a nota for apagada, orçamento/OS continuam e só
    # perdem a referência (ON DELETE SET NULL).
    op.add_column('orcamentos', sa.Column('nota_fiscal_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'orcamentos_nota_fiscal_id_fkey', 'orcamentos', 'notas_fiscais', ['nota_fiscal_id'], ['id'], ondelete='SET NULL'
    )
    op.add_column('ordens_servico', sa.Column('nota_fiscal_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'ordens_servico_nota_fiscal_id_fkey', 'ordens_servico', 'notas_fiscais', ['nota_fiscal_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('ordens_servico_nota_fiscal_id_fkey', 'ordens_servico', type_='foreignkey')
    op.drop_column('ordens_servico', 'nota_fiscal_id')
    op.drop_constraint('orcamentos_nota_fiscal_id_fkey', 'orcamentos', type_='foreignkey')
    op.drop_column('orcamentos', 'nota_fiscal_id')
    op.drop_index(op.f('ix_notas_fiscais_id'), table_name='notas_fiscais')
    op.drop_table('notas_fiscais')
