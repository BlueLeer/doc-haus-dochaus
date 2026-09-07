#!/usr/bin/env bash
set -euo pipefail
OCR_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -x "$OCR_ROOT/.venv-ocr/bin/python" ]; then
  uv venv --python 3.11 "$OCR_ROOT/.venv-ocr"
fi
uv pip install --python "$OCR_ROOT/.venv-ocr/bin/python" -r "$OCR_ROOT/requirements-ocr.txt"
"$OCR_ROOT/.venv-ocr/bin/python" "$OCR_ROOT/scripts/paddle-ocr.py" --prepare
