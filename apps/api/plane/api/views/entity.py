# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
from django.db import IntegrityError
from django.db.models import Count, Avg, F, ExpressionWrapper, DurationField, Q
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.api.serializers.entity import (
    EntitySerializer,
    EntityLiteSerializer,
    TechnicalVisitSerializer,
    TechnicalVisitCreateSerializer,
    TechnicalVisitReportSerializer,
)
from plane.app.permissions import WorkspaceEntityPermission
from plane.db.models import Entity, TechnicalVisit, TechnicalVisitIssue, Workspace

from .base import BaseAPIView

logger = logging.getLogger("plane.api")


# ── Entity ────────────────────────────────────────────────────────────────────


class EntityListCreateAPIEndpoint(BaseAPIView):
    """List all entities in a workspace or create a new one."""

    permission_classes = [WorkspaceEntityPermission]
    serializer_class = EntitySerializer
    use_read_replica = True

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug")

    def get_queryset(self):
        return (
            Entity.objects.filter(
                workspace__slug=self.kwargs["slug"],
                deleted_at__isnull=True,
            )
            .select_related("workspace")
            .order_by("name")
        )

    def get(self, request, slug):
        """List entities, optionally filtered by is_active."""
        qs = self.get_queryset()
        is_active = request.query_params.get("is_active")
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == "true")
        return self.paginate(
            request=request,
            queryset=qs,
            on_results=lambda entities: EntitySerializer(
                entities, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug):
        """Create a new entity in the workspace."""
        try:
            workspace = Workspace.objects.get(slug=slug)
            serializer = EntitySerializer(data=request.data)
            if serializer.is_valid():
                serializer.save(workspace=workspace)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            entity = Entity.objects.filter(
                workspace__slug=slug,
                name=request.data.get("name"),
                deleted_at__isnull=True,
            ).first()
            return Response(
                {
                    "error": "Entity with the same name already exists in this workspace",
                    "id": str(entity.id) if entity else None,
                },
                status=status.HTTP_409_CONFLICT,
            )


class EntityDetailAPIEndpoint(BaseAPIView):
    """Retrieve, update or soft-delete a single entity."""

    permission_classes = [WorkspaceEntityPermission]
    serializer_class = EntitySerializer
    use_read_replica = True

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug")

    def _get_entity(self, slug, entity_id):
        return Entity.objects.get(
            pk=entity_id,
            workspace__slug=slug,
            deleted_at__isnull=True,
        )

    def get(self, request, slug, entity_id):
        entity = self._get_entity(slug, entity_id)
        return Response(EntitySerializer(entity).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, entity_id):
        entity = self._get_entity(slug, entity_id)
        serializer = EntitySerializer(entity, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, entity_id):
        entity = self._get_entity(slug, entity_id)
        entity.deleted_at = timezone.now()
        entity.save(update_fields=["deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── TechnicalVisit ─────────────────────────────────────────────────────────────


class TechnicalVisitListCreateAPIEndpoint(BaseAPIView):
    """List visits with filters or create a new visit."""

    permission_classes = [WorkspaceEntityPermission]
    serializer_class = TechnicalVisitSerializer
    use_read_replica = True

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug")

    def get_queryset(self):
        qs = (
            TechnicalVisit.objects.filter(
                workspace__slug=self.kwargs["slug"],
                deleted_at__isnull=True,
            )
            .select_related("technician", "technician_2", "entity", "workspace")
            .prefetch_related("visit_issues")
        )
        params = self.request.query_params

        if params.get("status") is not None:
            qs = qs.filter(status=params["status"])
        if params.get("entity_id"):
            qs = qs.filter(entity_id=params["entity_id"])
        if params.get("technician_id"):
            qs = qs.filter(
                Q(technician_id=params["technician_id"]) |
                Q(technician_2_id=params["technician_id"])
            )
        if params.get("date_from"):
            qs = qs.filter(scheduled_date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(scheduled_date__lte=params["date_to"])

        return qs.order_by("-scheduled_date", "-created_at")

    def get(self, request, slug):
        return self.paginate(
            request=request,
            queryset=self.get_queryset(),
            on_results=lambda visits: TechnicalVisitSerializer(
                visits, many=True, fields=self.fields, expand=self.expand
            ).data,
        )

    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = TechnicalVisitCreateSerializer(data=request.data)
        if serializer.is_valid():
            visit = serializer.save(workspace=workspace)
            return Response(
                TechnicalVisitSerializer(visit).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TechnicalVisitDetailAPIEndpoint(BaseAPIView):
    """Retrieve, update or soft-delete a single technical visit."""

    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug")

    def _get_visit(self, slug, visit_id):
        return TechnicalVisit.objects.select_related(
            "technician", "technician_2", "entity"
        ).prefetch_related("visit_issues").get(
            pk=visit_id,
            workspace__slug=slug,
            deleted_at__isnull=True,
        )

    def get(self, request, slug, visit_id):
        visit = self._get_visit(slug, visit_id)
        return Response(TechnicalVisitSerializer(visit).data, status=status.HTTP_200_OK)

    def patch(self, request, slug, visit_id):
        visit = self._get_visit(slug, visit_id)
        serializer = TechnicalVisitCreateSerializer(visit, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(
                TechnicalVisitSerializer(self._get_visit(slug, visit_id)).data,
                status=status.HTTP_200_OK,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, slug, visit_id):
        visit = self._get_visit(slug, visit_id)
        visit.deleted_at = timezone.now()
        visit.save(update_fields=["deleted_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class TechnicalVisitReportAPIEndpoint(BaseAPIView):
    """
    Aggregated report for technical visits.
    GET /workspaces/<slug>/technical-visits/report/
    Query params: date_from, date_to, entity_id, technician_id, status
    """

    permission_classes = [WorkspaceEntityPermission]
    use_read_replica = True

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug")

    def get(self, request, slug):
        params = request.query_params
        qs = TechnicalVisit.objects.filter(
            workspace__slug=slug,
            deleted_at__isnull=True,
        )

        if params.get("status") is not None:
            qs = qs.filter(status=params["status"])
        if params.get("entity_id"):
            qs = qs.filter(entity_id=params["entity_id"])
        if params.get("technician_id"):
            qs = qs.filter(
                Q(technician_id=params["technician_id"]) |
                Q(technician_2_id=params["technician_id"])
            )
        if params.get("date_from"):
            qs = qs.filter(scheduled_date__gte=params["date_from"])
        if params.get("date_to"):
            qs = qs.filter(scheduled_date__lte=params["date_to"])

        total = qs.count()
        scheduled = qs.filter(status=TechnicalVisit.VISIT_STATUS_SCHEDULED).count()
        completed = qs.filter(status=TechnicalVisit.VISIT_STATUS_COMPLETED).count()

        # Motivation breakdown
        motivations = {
            "update": qs.filter(mot_update=True).count(),
            "bug_fix": qs.filter(mot_bug_fix=True).count(),
            "training": qs.filter(mot_training=True).count(),
            "improvement": qs.filter(mot_improvement=True).count(),
            "commercial": qs.filter(mot_commercial=True).count(),
            "other": qs.filter(mot_other=True).count(),
        }

        # By entity
        by_entity = list(
            qs.filter(entity__isnull=False)
            .values("entity_id", "entity__name")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        )

        # By technician
        by_technician = list(
            qs.filter(technician__isnull=False)
            .values("technician_id", "technician__display_name")
            .annotate(count=Count("id"))
            .order_by("-count")[:20]
        )

        # Average duration (hours) for completed visits with both timestamps
        completed_with_duration = qs.filter(
            status=TechnicalVisit.VISIT_STATUS_COMPLETED,
            started_at__isnull=False,
            finished_at__isnull=False,
        )
        avg_duration_hours = None
        if completed_with_duration.exists():
            total_seconds = sum(
                (v.finished_at - v.started_at).total_seconds()
                for v in completed_with_duration.only("started_at", "finished_at")
            )
            avg_duration_hours = round(total_seconds / completed_with_duration.count() / 3600, 2)

        # Detailed visit list for the report
        visits = TechnicalVisitReportSerializer(
            qs.select_related("technician", "entity")
            .prefetch_related("visit_issues")
            .order_by("-scheduled_date"),
            many=True,
        ).data

        return Response(
            {
                "summary": {
                    "total": total,
                    "scheduled": scheduled,
                    "completed": completed,
                    "avg_duration_hours": avg_duration_hours,
                },
                "motivations": motivations,
                "by_entity": by_entity,
                "by_technician": by_technician,
                "visits": visits,
            },
            status=status.HTTP_200_OK,
        )
