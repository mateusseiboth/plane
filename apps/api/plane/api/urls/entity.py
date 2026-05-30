# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.api.views import (
    EntityListCreateAPIEndpoint,
    EntityDetailAPIEndpoint,
    TechnicalVisitListCreateAPIEndpoint,
    TechnicalVisitDetailAPIEndpoint,
    TechnicalVisitReportAPIEndpoint,
)

urlpatterns = [
    # Entity
    path(
        "workspaces/<str:slug>/entities/",
        EntityListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="entity-list",
    ),
    path(
        "workspaces/<str:slug>/entities/<uuid:entity_id>/",
        EntityDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="entity-detail",
    ),
    # Technical visits
    path(
        "workspaces/<str:slug>/technical-visits/",
        TechnicalVisitListCreateAPIEndpoint.as_view(http_method_names=["get", "post"]),
        name="technical-visit-list",
    ),
    path(
        "workspaces/<str:slug>/technical-visits/<uuid:visit_id>/",
        TechnicalVisitDetailAPIEndpoint.as_view(http_method_names=["get", "patch", "delete"]),
        name="technical-visit-detail",
    ),
    path(
        "workspaces/<str:slug>/technical-visits/report/",
        TechnicalVisitReportAPIEndpoint.as_view(http_method_names=["get"]),
        name="technical-visit-report",
    ),
]
