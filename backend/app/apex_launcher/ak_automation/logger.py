# -*- coding: utf-8 -*-
"""Structured workflow logging and screenshot evidence for AK automation."""

from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from .window_manager import WindowSnapshot, capture_window_evidence


def _json_safe(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "to_dict") and callable(value.to_dict):
        return _json_safe(value.to_dict())
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (tuple, list, set)):
        return [_json_safe(item) for item in value]
    return value


@dataclass(frozen=True)
class WorkflowLogRecord:
    timestamp: float
    elapsed_seconds: float
    level: str
    state: str
    step: str
    message: str
    code: str | None
    details: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return _json_safe(asdict(self))


class WorkflowLogger:
    """Keep an in-memory event stream and optionally persist it as JSON Lines."""

    def __init__(
        self,
        output_dir: str | Path | None = None,
        *,
        run_name: str = "ak-workflow",
    ) -> None:
        self.started_at = time.monotonic()
        self.state = "not_running"
        self.step = "initialise"
        self.records: list[WorkflowLogRecord] = []
        self.output_dir = Path(output_dir) if output_dir is not None else None
        self.log_path: Path | None = None
        if self.output_dir is not None:
            self.output_dir.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime("%Y%m%d-%H%M%S")
            self.log_path = self.output_dir / f"{run_name}-{stamp}.jsonl"

    def bind(self, *, state: str | Enum | None = None, step: str | None = None) -> None:
        if state is not None:
            self.state = str(state.value if isinstance(state, Enum) else state)
        if step is not None:
            self.step = step

    def record(
        self,
        level: str,
        message: str,
        *,
        code: str | None = None,
        step: str | None = None,
        state: str | Enum | None = None,
        **details: Any,
    ) -> WorkflowLogRecord:
        if state is not None or step is not None:
            self.bind(state=state, step=step)
        record = WorkflowLogRecord(
            timestamp=time.time(),
            elapsed_seconds=time.monotonic() - self.started_at,
            level=level.upper(),
            state=self.state,
            step=self.step,
            message=message,
            code=code,
            details=_json_safe(details),
        )
        self.records.append(record)
        if self.log_path is not None:
            with self.log_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record.to_dict(), ensure_ascii=False) + "\n")
        return record

    def info(self, message: str) -> None:
        self.record("INFO", message)

    def warning(self, message: str) -> None:
        self.record("WARNING", message)

    def error(self, message: str) -> None:
        self.record("ERROR", message)

    def timing(
        self,
        operation: str,
        started_at: float,
        *,
        success: bool = True,
        **details: Any,
    ) -> float:
        """Record one independently measurable operation without changing flow state."""
        elapsed = max(0.0, time.monotonic() - started_at)
        self.record(
            "INFO" if success else "ERROR",
            f"耗时记录：{operation} {elapsed:.3f}s",
            perf_operation=operation,
            duration_seconds=elapsed,
            success=success,
            **details,
        )
        return elapsed

    def transition(
        self,
        previous: str | Enum,
        current: str | Enum,
        *,
        step: str,
        **details: Any,
    ) -> WorkflowLogRecord:
        old_value = previous.value if isinstance(previous, Enum) else str(previous)
        new_value = current.value if isinstance(current, Enum) else str(current)
        return self.record(
            "INFO",
            f"流程状态：{old_value} -> {new_value}",
            step=step,
            state=new_value,
            previous_state=old_value,
            current_state=new_value,
            **details,
        )

    def capture(
        self,
        window: WindowSnapshot | None,
        reason: str,
        *,
        required: bool = False,
    ) -> str | None:
        path = (
            capture_window_evidence(window, self.output_dir, reason)
            if window is not None
            else None
        )
        level = "INFO" if path else ("ERROR" if required else "WARNING")
        self.record(
            level,
            "已保存 AK 窗口截图。" if path else "未能保存 AK 窗口截图。",
            code=None if path else "SCREENSHOT_EVIDENCE_UNAVAILABLE",
            evidence_path=path,
            reason=reason,
            window=window,
        )
        return path

    def to_dict(self) -> dict[str, Any]:
        return {
            "log_path": str(self.log_path) if self.log_path else None,
            "records": [record.to_dict() for record in self.records],
        }
