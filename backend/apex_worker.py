from __future__ import annotations

import argparse
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
import uvicorn


def create_app(data_dir: Path) -> FastAPI:
    os.environ["APEX_DATA_DIR"] = str(data_dir)
    from app.apex_launcher.service import get_service

    app = FastAPI(title="APEX Console Worker", version="1.0.0")

    def payload(status) -> dict:
        service = get_service()
        return {
            **status.to_dict(),
            "revision": service.revision(),
            "starting_revision": service.starting_revision(),
        }

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "service": "apex-console-worker"}

    @app.post("/actions/{action}")
    def action(action: str) -> dict:
        service = get_service()
        if action not in {"run", "stop", "restart"}:
            raise HTTPException(status_code=404, detail="不支持的 APEX 动作")
        if action in {"stop", "restart"}:
            service.adopt_running_environment()
        status = getattr(service, {"run": "start", "stop": "stop", "restart": "restart"}[action])()
        return payload(status)

    @app.get("/wait")
    def wait(target: str, revision: int) -> dict:
        if target not in {"running", "stopped"}:
            raise HTTPException(status_code=422, detail="不支持的等待目标")
        service = get_service()
        return {**service.wait_for_state(target, revision=revision, timeout=170), "starting_revision": service.starting_revision()}

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    uvicorn.run(create_app(args.data_dir), host="127.0.0.1", port=8766, log_level="warning")


if __name__ == "__main__":
    main()
