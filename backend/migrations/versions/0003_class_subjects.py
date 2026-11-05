"""Subjects per class (independent of the teacher).

Revision ID: 0003
Revises: 0002
"""
from alembic import op
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('class_subjects',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id'), nullable=False, index=True),
        sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subjects.id'), nullable=False, index=True),
        sa.UniqueConstraint('class_id', 'subject_id', name='uq_class_subject_list'))
    # subjects that already have a teacher become part of that class's subject list
    op.execute("INSERT INTO class_subjects (class_id, subject_id) SELECT class_id, subject_id FROM teaching_assignments")


def downgrade() -> None:
    op.drop_table('class_subjects')
