# Generated migration — SAC migration foundation
# Adds: Entity, TechnicalVisit, TechnicalVisitIssue tables
#       entity_id + legacy_ticket_number on issues

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0121_alter_estimate_type"),
    ]

    operations = [
        # ── Entity ──────────────────────────────────────────────────────────
        migrations.CreateModel(
            name="Entity",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(null=True, blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="entity_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="entity_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="entities",
                        to="db.workspace",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("entity_type", models.SmallIntegerField(
                    blank=True,
                    null=True,
                    choices=[
                        (0, "Prefeitura"), (1, "Câmara"), (2, "Outros"),
                        (3, "Escola"), (4, "Autarquia"), (5, "RPPS"),
                        (6, "SAAE"), (7, "Consórcio"),
                    ],
                )),
                ("cnpj", models.CharField(blank=True, max_length=20, null=True)),
                ("city", models.CharField(blank=True, max_length=255, null=True)),
                ("state", models.CharField(blank=True, max_length=2, null=True)),
                ("email", models.EmailField(blank=True, null=True)),
                ("phone", models.CharField(blank=True, max_length=30, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("legacy_id", models.IntegerField(blank=True, db_index=True, null=True)),
                ("external_source", models.CharField(blank=True, max_length=255, null=True)),
                ("external_id", models.CharField(blank=True, max_length=255, null=True)),
            ],
            options={
                "verbose_name": "Entity",
                "verbose_name_plural": "Entities",
                "db_table": "entities",
                "ordering": ("name",),
            },
        ),
        migrations.AddConstraint(
            model_name="entity",
            constraint=models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True),
                fields=["workspace", "name"],
                name="unique_entity_name_per_workspace_when_not_deleted",
            ),
        ),

        # ── TechnicalVisit ──────────────────────────────────────────────────
        migrations.CreateModel(
            name="TechnicalVisit",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(null=True, blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technicalvisit_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technicalvisit_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="technical_visits",
                        to="db.workspace",
                    ),
                ),
                (
                    "technician",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technical_visits_primary",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "technician_2",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technical_visits_secondary",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "entity",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technical_visits",
                        to="db.entity",
                    ),
                ),
                ("contacts", models.TextField(blank=True, null=True)),
                ("city", models.CharField(blank=True, max_length=255, null=True)),
                ("scheduled_date", models.DateField(blank=True, null=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("status", models.SmallIntegerField(
                    choices=[(0, "Agendada"), (1, "Efetivada")],
                    default=0,
                )),
                ("period", models.CharField(blank=True, max_length=50, null=True)),
                ("mot_update", models.BooleanField(default=False)),
                ("mot_bug_fix", models.BooleanField(default=False)),
                ("mot_training", models.BooleanField(default=False)),
                ("mot_improvement", models.BooleanField(default=False)),
                ("mot_commercial", models.BooleanField(default=False)),
                ("mot_other", models.BooleanField(default=False)),
                ("mot_other_description", models.CharField(blank=True, max_length=255, null=True)),
                ("summary", models.TextField(blank=True, null=True)),
                ("conclusion", models.TextField(blank=True, null=True)),
                ("visit_number", models.CharField(blank=True, db_index=True, max_length=50, null=True)),
                ("legacy_id", models.IntegerField(blank=True, db_index=True, null=True)),
            ],
            options={
                "verbose_name": "Technical Visit",
                "verbose_name_plural": "Technical Visits",
                "db_table": "technical_visits",
                "ordering": ("-scheduled_date", "-created_at"),
            },
        ),

        # ── TechnicalVisitIssue ─────────────────────────────────────────────
        migrations.CreateModel(
            name="TechnicalVisitIssue",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
                ("deleted_at", models.DateTimeField(null=True, blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technicalvisitissue_created_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technicalvisitissue_updated_by",
                        to=settings.AUTH_USER_MODEL,
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "visit",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="visit_issues",
                        to="db.technicalvisit",
                    ),
                ),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="technical_visit_links",
                        to="db.issue",
                    ),
                ),
            ],
            options={
                "verbose_name": "Technical Visit Issue",
                "verbose_name_plural": "Technical Visit Issues",
                "db_table": "technical_visit_issues",
            },
        ),
        migrations.AddConstraint(
            model_name="technicalvisitissue",
            constraint=models.UniqueConstraint(
                condition=models.Q(deleted_at__isnull=True),
                fields=["visit", "issue"],
                name="unique_visit_issue_when_not_deleted",
            ),
        ),

        # ── Issue: new fields ───────────────────────────────────────────────
        migrations.AddField(
            model_name="issue",
            name="entity",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="issues",
                to="db.entity",
            ),
        ),
        migrations.AddField(
            model_name="issue",
            name="legacy_ticket_number",
            field=models.CharField(blank=True, db_index=True, max_length=50, null=True),
        ),
    ]
