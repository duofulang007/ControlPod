# -*- coding: utf-8 -*-
"""Short-lived input helper using the click driver proven by the old launcher."""
import argparse
import json

import pyautogui


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--x", required=True, type=int)
    parser.add_argument("--y", required=True, type=int)
    parser.add_argument("--click", action="store_true")
    args = parser.parse_args()

    try:
        if args.click:
            # Keep this identical to the known-good reference implementation.
            pyautogui.click(args.x, args.y)
            clicked = True
        else:
            pyautogui.moveTo(args.x, args.y, duration=0.2)
            clicked = False
        position = pyautogui.position()
        actual = [int(position.x), int(position.y)]
        moved = abs(actual[0] - args.x) <= 2 and abs(actual[1] - args.y) <= 2
        result = {
            "ok": moved and (clicked if args.click else True),
            "moved": moved,
            "clicked": clicked,
            "actual": actual,
            "target": [args.x, args.y],
            "driver": "pyautogui.click" if args.click else "pyautogui.moveTo",
        }
    except Exception as exc:
        result = {
            "ok": False,
            "moved": False,
            "clicked": False,
            "actual": None,
            "target": [args.x, args.y],
            "driver": "pyautogui",
            "error": type(exc).__name__,
        }
    print(json.dumps(result))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
