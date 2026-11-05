"""Faculty portal: subjects, teaching assignments, timetable, faculty attendance, exam publishing, student profile.

Revision ID: 0002
Revises: 0001
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('subjects',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('code', sa.String(20), nullable=True))
    op.create_table('teaching_assignments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('teacher_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id'), nullable=False, index=True),
        sa.Column('subject_id', sa.Integer(), sa.ForeignKey('subjects.id'), nullable=False),
        sa.UniqueConstraint('class_id', 'subject_id', name='uq_class_subject'))
    op.create_table('timetable_slots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('class_id', sa.Integer(), sa.ForeignKey('classes.id'), nullable=False, index=True),
        sa.Column('weekday', sa.Integer(), nullable=False),
        sa.Column('period_no', sa.Integer(), nullable=False),
        sa.Column('assignment_id', sa.Integer(), sa.ForeignKey('teaching_assignments.id'), nullable=False),
        sa.UniqueConstraint('class_id', 'weekday', 'period_no', name='uq_slot'))
    op.create_table('staff_attendance',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('attendance_date', sa.Date(), nullable=False, index=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='present'),
        sa.Column('marked_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('marked_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.UniqueConstraint('user_id', 'attendance_date', name='uq_staff_day'))

    # Plain ADD COLUMN works on both SQLite and PostgreSQL (all new columns are nullable or have a default).
    op.add_column('users', sa.Column('employee_id', sa.String(40), nullable=True))
    op.add_column('users', sa.Column('designation', sa.String(80), nullable=True))
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index('ix_users_employee_id', 'users', ['employee_id'])
    op.add_column('students', sa.Column('phone', sa.String(20), nullable=True))
    op.add_column('students', sa.Column('email', sa.String(255), nullable=True))
    op.add_column('students', sa.Column('bio', sa.String(300), nullable=True))
    op.add_column('students', sa.Column('theme', sa.String(20), nullable=False, server_default='purple'))
    op.add_column('students', sa.Column('photo', sa.LargeBinary(), nullable=True))
    op.add_column('students', sa.Column('photo_type', sa.String(30), nullable=True))
    # existing exams become 'open'; the admin publishes them when marks are complete
    op.add_column('examinations', sa.Column('status', sa.String(20), nullable=False, server_default='open'))
    op.add_column('exam_marks', sa.Column('subject_id', sa.Integer(), nullable=True))
    op.add_column('exam_marks', sa.Column('entered_by', sa.Integer(), nullable=True))
    if op.get_bind().dialect.name != 'sqlite':          # SQLite cannot add a constraint to an existing table
        op.create_foreign_key('fk_exam_marks_subject', 'exam_marks', 'subjects', ['subject_id'], ['id'])
        op.create_foreign_key('fk_exam_marks_entered_by', 'exam_marks', 'users', ['entered_by'], ['id'])


def downgrade() -> None:
    if op.get_bind().dialect.name != 'sqlite':
        op.drop_constraint('fk_exam_marks_entered_by', 'exam_marks', type_='foreignkey')
        op.drop_constraint('fk_exam_marks_subject', 'exam_marks', type_='foreignkey')
    op.drop_column('exam_marks', 'entered_by')
    op.drop_column('exam_marks', 'subject_id')
    op.drop_column('examinations', 'status')
    for c in ('photo_type', 'photo', 'theme', 'bio', 'email', 'phone'):
        op.drop_column('students', c)
    op.drop_index('ix_users_employee_id', table_name='users')
    for c in ('must_change_password', 'designation', 'employee_id'):
        op.drop_column('users', c)
    op.drop_table('staff_attendance')
    op.drop_table('timetable_slots')
    op.drop_table('teaching_assignments')
    op.drop_table('subjects')
