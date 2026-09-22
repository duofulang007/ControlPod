# -*- coding: utf-8 -*-
"""Typed failures for AK process/window automation."""

from __future__ import annotations

from typing import Any


class AkAutomationError(RuntimeError):
    """A failure tied to one explicit automation layer."""

    def __init__(self, stage: str, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.stage = stage
        self.code = code
        self.message = message
        self.details = details

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }
