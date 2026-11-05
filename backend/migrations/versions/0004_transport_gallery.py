"""School transport (drivers, buses, stops, student bus choice) and the public photo gallery.

Revision ID: 0004
Revises: 0003
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('drivers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('full_name', sa.String(160), nullable=False),
        sa.Column('phone', sa.String(20), nullable=False),
        sa.Column('license_no', sa.String(40), nullable=False, index=True),
        sa.Column('license_expiry', sa.Date(), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('photo', sa.LargeBinary(), nullable=True),
        sa.Column('photo_type', sa.String(30), nullable=True),
        sa.Column('photo_version', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_table('buses',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('number', sa.String(30), nullable=False, unique=True, index=True),
        sa.Column('registration_no', sa.String(30), nullable=True),
        sa.Column('capacity', sa.Integer(), nullable=False, server_default='40'),
        sa.Column('route_name', sa.String(160), nullable=False, server_default=''),
        sa.Column('driver_id', sa.Integer(), sa.ForeignKey('drivers.id'), nullable=True),
        sa.Column('school_arrival_time', sa.String(5), nullable=True),
        sa.Column('school_departure_time', sa.String(5), nullable=True),
        sa.Column('gps_device_id', sa.String(60), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table('bus_stops',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('bus_id', sa.Integer(), sa.ForeignKey('buses.id'), nullable=False, index=True),
        sa.Column('name', sa.String(160), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('pickup_time', sa.String(5), nullable=True),
        sa.Column('drop_time', sa.String(5), nullable=True))
    op.create_table('student_transport',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('students.id'), nullable=False, index=True),
        sa.Column('academic_year', sa.String(20), nullable=False, index=True),
        sa.Column('uses_bus', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('pickup_location', sa.String(255), nullable=True),
        sa.Column('stop_id', sa.Integer(), sa.ForeignKey('bus_stops.id'), nullable=True),
        sa.Column('bus_id', sa.Integer(), sa.ForeignKey('buses.id'), nullable=True, index=True),
        sa.Column('note', sa.String(255), nullable=True),
        sa.Column('locked', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('student_id', 'academic_year', name='uq_transport_student_year'))
    op.create_table('gallery_photos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('title', sa.String(160), nullable=False, server_default=''),
        sa.Column('category', sa.String(40), nullable=False, server_default='Campus', index=True),
        sa.Column('image', sa.LargeBinary(), nullable=False),
        sa.Column('thumb', sa.LargeBinary(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade() -> None:
    for t in ('gallery_photos', 'student_transport', 'bus_stops', 'buses', 'drivers'):
        op.drop_table(t)
