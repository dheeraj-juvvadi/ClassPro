"""Keep the report contract while using FastAPI's Pydantic Rust JSON path."""
from pydantic import ConfigDict, JsonValue, RootModel


class ReportResponse(RootModel[dict[str, JsonValue]]):
    # Do not coerce numeric strings or discard provider-specific report fields.
    # Reject nonfinite values just as the previous JSONResponse did.
    model_config = ConfigDict(strict=True, allow_inf_nan=False)
