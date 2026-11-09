"""Routes for live mode: starting it, following it, advancing it and handing it over."""

from fastapi import APIRouter, Response, status

from app import clock, live, models, store

router = APIRouter()


@router.get("/live")
def list_live(source: store.Injected) -> list[models.LiveState]:
    """List every service in live mode; the worker polls this."""
    return live.lives(source)


@router.post("/services/{service_id}/live", status_code=status.HTTP_201_CREATED)
def start_live(
    service_id: models.PathId, body: models.LiveStart, source: store.Injected, now: clock.Injected
) -> models.LiveState:
    """Start live mode at the first item; 409 when it is live already or has no items."""
    return live.start(source, service_id, body, now())


@router.get("/services/{service_id}/live")
def read_live(service_id: models.PathId, source: store.Injected) -> models.LiveState:
    """Return the live state; 404 when the service is not live."""
    return live.state(source, service_id)


@router.post("/services/{service_id}/live/advance")
def advance_live(
    service_id: models.PathId, body: models.Advance, source: store.Injected, now: clock.Injected
) -> models.LiveState:
    """Move the current item; only the controller may (409, naming who holds control).

    The new current item is recorded as started now.
    """
    return live.advance(source, service_id, body, now())


@router.post("/services/{service_id}/live/handover")
def hand_over_live(
    service_id: models.PathId, body: models.Handover, source: store.Injected
) -> models.LiveState:
    """Pass live control on; 409 unless from_person_id holds it."""
    return live.handover(source, service_id, body)


@router.put("/services/{service_id}/live/devices")
def report_devices(
    service_id: models.PathId,
    body: models.DeviceReport,
    source: store.Injected,
    now: clock.Injected,
) -> models.LiveState:
    """Record what the worker sees of OBS and Ableton."""
    return live.report_devices(source, service_id, body, now())


@router.delete("/services/{service_id}/live", status_code=status.HTTP_204_NO_CONTENT)
def end_live(service_id: models.PathId, source: store.Injected) -> Response:
    """End live mode."""
    live.end(source, service_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
