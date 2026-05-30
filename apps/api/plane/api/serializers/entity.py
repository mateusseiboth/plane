# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.db.models import Entity, TechnicalVisit, TechnicalVisitIssue
from .base import BaseSerializer
from .user import UserLiteSerializer


class EntitySerializer(BaseSerializer):
    class Meta:
        model = Entity
        fields = [
            "id", "name", "entity_type", "cnpj", "city", "state",
            "email", "phone", "is_active", "legacy_id",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EntityLiteSerializer(BaseSerializer):
    class Meta:
        model = Entity
        fields = ["id", "name", "entity_type", "city", "is_active"]


class TechnicalVisitSerializer(BaseSerializer):
    technician_detail = UserLiteSerializer(source="technician", read_only=True)
    technician_2_detail = UserLiteSerializer(source="technician_2", read_only=True)
    entity_detail = EntityLiteSerializer(source="entity", read_only=True)
    linked_issues = serializers.SerializerMethodField()

    class Meta:
        model = TechnicalVisit
        fields = [
            "id", "workspace",
            "technician", "technician_detail",
            "technician_2", "technician_2_detail",
            "entity", "entity_detail",
            "contacts", "city",
            "scheduled_date", "started_at", "finished_at",
            "status", "period",
            "mot_update", "mot_bug_fix", "mot_training",
            "mot_improvement", "mot_commercial", "mot_other",
            "mot_other_description",
            "summary", "conclusion",
            "visit_number", "legacy_id",
            "linked_issues",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "workspace", "created_at", "updated_at"]

    def get_linked_issues(self, obj):
        return list(
            obj.visit_issues.filter(deleted_at__isnull=True)
            .values_list("issue_id", flat=True)
        )


class TechnicalVisitCreateSerializer(BaseSerializer):
    issue_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = TechnicalVisit
        fields = [
            "id", "technician", "technician_2", "entity",
            "contacts", "city", "scheduled_date", "started_at", "finished_at",
            "status", "period",
            "mot_update", "mot_bug_fix", "mot_training",
            "mot_improvement", "mot_commercial", "mot_other",
            "mot_other_description",
            "summary", "conclusion",
            "visit_number",
            "issue_ids",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        issue_ids = validated_data.pop("issue_ids", [])
        visit = TechnicalVisit.objects.create(**validated_data)
        if issue_ids:
            TechnicalVisitIssue.objects.bulk_create([
                TechnicalVisitIssue(visit=visit, issue_id=issue_id)
                for issue_id in issue_ids
            ])
        return visit

    def update(self, instance, validated_data):
        from django.utils import timezone as tz
        issue_ids = validated_data.pop("issue_ids", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if issue_ids is not None:
            instance.visit_issues.filter(deleted_at__isnull=True).update(
                deleted_at=tz.now()
            )
            TechnicalVisitIssue.objects.bulk_create([
                TechnicalVisitIssue(visit=instance, issue_id=issue_id)
                for issue_id in issue_ids
            ])
        return instance


class TechnicalVisitReportSerializer(BaseSerializer):
    technician_detail = UserLiteSerializer(source="technician", read_only=True)
    entity_detail = EntityLiteSerializer(source="entity", read_only=True)
    issues_count = serializers.SerializerMethodField()
    duration_hours = serializers.SerializerMethodField()

    class Meta:
        model = TechnicalVisit
        fields = [
            "id", "visit_number", "scheduled_date", "started_at", "finished_at",
            "status", "city",
            "technician", "technician_detail",
            "entity", "entity_detail",
            "mot_update", "mot_bug_fix", "mot_training",
            "mot_improvement", "mot_commercial", "mot_other",
            "summary", "conclusion",
            "issues_count", "duration_hours",
            "created_at",
        ]

    def get_issues_count(self, obj):
        return obj.visit_issues.filter(deleted_at__isnull=True).count()

    def get_duration_hours(self, obj):
        if obj.started_at and obj.finished_at:
            delta = obj.finished_at - obj.started_at
            return round(delta.total_seconds() / 3600, 2)
        return None
