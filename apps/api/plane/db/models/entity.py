# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.db.models import Q

from .base import BaseModel


ENTITY_TYPE_CHOICES = [
    (0, "Prefeitura"),
    (1, "Câmara"),
    (2, "Outros"),
    (3, "Escola"),
    (4, "Autarquia"),
    (5, "RPPS"),
    (6, "SAAE"),
    (7, "Consórcio"),
]


class Entity(BaseModel):
    """
    Represents a client organization (e.g. Prefeitura de Sidrolândia).
    Workspace-scoped; issues may optionally be linked to an entity.
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="entities",
    )
    name = models.CharField(max_length=255)
    entity_type = models.SmallIntegerField(choices=ENTITY_TYPE_CHOICES, null=True, blank=True)
    cnpj = models.CharField(max_length=20, null=True, blank=True)
    city = models.CharField(max_length=255, null=True, blank=True)
    state = models.CharField(max_length=2, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    phone = models.CharField(max_length=30, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    # Preserves the original legacy ID from the old system for traceability
    legacy_id = models.IntegerField(null=True, blank=True, db_index=True)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "entities"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="unique_entity_name_per_workspace_when_not_deleted",
            )
        ]
        verbose_name = "Entity"
        verbose_name_plural = "Entities"

    def __str__(self):
        return self.name


class TechnicalVisit(BaseModel):
    """
    Technical visit scheduling and reporting.
    Migrated from old_intranet.visita table.
    """

    VISIT_STATUS_SCHEDULED = 0
    VISIT_STATUS_COMPLETED = 1
    VISIT_STATUS_CHOICES = [
        (VISIT_STATUS_SCHEDULED, "Agendada"),
        (VISIT_STATUS_COMPLETED, "Efetivada"),
    ]

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="technical_visits",
    )
    # Main technician
    technician = models.ForeignKey(
        "db.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technical_visits_primary",
    )
    # Optional second technician
    technician_2 = models.ForeignKey(
        "db.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technical_visits_secondary",
    )
    entity = models.ForeignKey(
        Entity,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="technical_visits",
    )
    # Comma-separated contact names/IDs kept for backwards compat with legacy data
    contacts = models.TextField(null=True, blank=True)
    city = models.CharField(max_length=255, null=True, blank=True)
    scheduled_date = models.DateField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.SmallIntegerField(choices=VISIT_STATUS_CHOICES, default=VISIT_STATUS_SCHEDULED)
    period = models.CharField(max_length=50, null=True, blank=True)

    # Motivation flags (multiple can be set simultaneously)
    mot_update = models.BooleanField(default=False, verbose_name="Atualização")
    mot_bug_fix = models.BooleanField(default=False, verbose_name="Correção de Erros")
    mot_training = models.BooleanField(default=False, verbose_name="Acompanhamento/Treinamento")
    mot_improvement = models.BooleanField(default=False, verbose_name="Solicitação de Melhoria")
    mot_commercial = models.BooleanField(default=False, verbose_name="Comercial")
    mot_other = models.BooleanField(default=False, verbose_name="Outros")
    mot_other_description = models.CharField(max_length=255, null=True, blank=True)

    summary = models.TextField(null=True, blank=True)
    conclusion = models.TextField(null=True, blank=True)

    # Human-readable number (e.g. "42-2026"), preserved from legacy
    visit_number = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    legacy_id = models.IntegerField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "technical_visits"
        ordering = ("-scheduled_date", "-created_at")
        verbose_name = "Technical Visit"
        verbose_name_plural = "Technical Visits"

    def __str__(self):
        return f"Visita {self.visit_number or self.id} - {self.entity}"


class TechnicalVisitIssue(BaseModel):
    """Links a TechnicalVisit to one or more Issues."""

    visit = models.ForeignKey(
        TechnicalVisit,
        on_delete=models.CASCADE,
        related_name="visit_issues",
    )
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="technical_visit_links",
    )

    class Meta:
        db_table = "technical_visit_issues"
        constraints = [
            models.UniqueConstraint(
                fields=["visit", "issue"],
                condition=Q(deleted_at__isnull=True),
                name="unique_visit_issue_when_not_deleted",
            )
        ]
        verbose_name = "Technical Visit Issue"
        verbose_name_plural = "Technical Visit Issues"
