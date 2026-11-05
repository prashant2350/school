"""Question papers, AI answer keys, question-wise marks, cached AI summaries.

Revision ID: 0005
Revises: 0004
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('exam_papers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('exam_id', sa.Integer(), sa.ForeignKey('examinations.id'), nullable=False, index=True),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id'), nullable=False, index=True),
        sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subjects.id'), nullable=False),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('pdf', sa.LargeBinary(), nullable=True),
        sa.Column('pdf_name', sa.String(200), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('gen_status', sa.String(20), nullable=False, server_default='idle'),
        sa.Column('gen_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('exam_id', 'class_id', 'subject_id', name='uq_paper_exam_class_subject'))
    op.create_table('paper_questions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('paper_id', sa.Integer(), sa.ForeignKey('exam_papers.id'), nullable=False, index=True),
        sa.Column('sort', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('number', sa.String(12), nullable=False, server_default=''),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('marks', sa.Float(), nullable=False, server_default='1'),
        sa.Column('word_limit', sa.Integer(), nullable=True),
        sa.Column('keywords', sa.Text(), nullable=False, server_default=''),
        sa.Column('topic', sa.String(120), nullable=False, server_default=''),
        sa.Column('ai_answer', sa.Text(), nullable=True),
        sa.Column('answer', sa.Text(), nullable=True),
        sa.Column('ai_status', sa.String(12), nullable=False, server_default='pending'))
    op.create_table('question_marks',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('question_id', sa.Integer(), sa.ForeignKey('paper_questions.id'), nullable=False, index=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('marks', sa.Float(), nullable=False, server_default='0'),
        sa.UniqueConstraint('question_id', 'student_id', name='uq_qmark'))
    op.create_table('student_insights',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=False, unique=True, index=True),
        sa.Column('signature', sa.String(60), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade() -> None:
    for t in ('student_insights', 'question_marks', 'paper_questions', 'exam_papers'):
        op.drop_table(t)
