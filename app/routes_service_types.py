"""Routes for service types and their templates."""

from fastapi import APIRouter, status

from app import models, service_types, store

router = APIRouter()


@router.get("/service-types")
def list_service_types(source: store.Injected) -> list[models.ServiceType]:
    """List every service type with its template, by name."""
    return service_types.service_types(source)


@router.post("/service-types", status_code=status.HTTP_201_CREATED)
def create_service_type(body: models.NewServiceType, source: store.Injected) -> models.ServiceType:
    """Add a service type; it starts at 10:00 with no rehearsal unless said otherwise."""
    return service_types.add_service_type(source, body)


@router.patch("/service-types/{service_type_id}")
def change_service_type(
    service_type_id: models.PathId, body: models.ServiceTypeChanges, source: store.Injected
) -> models.ServiceType:
    """Change a service type's name, start time or rehearsal offset; plans keep theirs."""
    return service_types.change_service_type(source, service_type_id, body)


@router.put("/service-types/{service_type_id}/template")
def set_template(
    service_type_id: models.PathId, body: models.TemplateChanges, source: store.Injected
) -> models.ServiceType:
    """Replace the type's template; services planned from it keep their copy."""
    return service_types.set_template(source, service_type_id, body)


@router.post("/service-types/{service_type_id}/template/from-service")
def template_from_service(
    service_type_id: models.PathId, body: models.TemplateSource, source: store.Injected
) -> models.ServiceType:
    """Make a service's items and needed positions the type's template."""
    return service_types.template_from_service(source, service_type_id, body)
