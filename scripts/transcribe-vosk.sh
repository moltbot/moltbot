#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: transcribe-vosk.sh <audio-file>

Environment:
  VOSK_MODEL       Path to Vosk model dir (default: ~/TOOLS/vosk-model-small-ru-0.22)
  VOSK_PYTHON      Python binary (default: .venv/bin/python if present, else python3)
  VOSK_TRANSCODE   Set to 1 to force ffmpeg WAV conversion (default: 1)
EOF
}

if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 2
fi

input="$1"
if [[ ! -f "$input" ]]; then
  echo "File not found: $input" >&2
  exit 3
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "$script_dir/.." && pwd)"

VOSK_MODEL="${VOSK_MODEL:-"$HOME/TOOLS/vosk-model-small-ru-0.22"}"
if [[ ! -d "$VOSK_MODEL" ]]; then
  echo "Vosk model not found: $VOSK_MODEL" >&2
  exit 4
fi

tmp_dir="$(mktemp -d)"
tmp_in="$input"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

if [[ "${VOSK_TRANSCODE:-1}" == "1" ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "ffmpeg is required for VOSK_TRANSCODE=1" >&2
    exit 5
  fi
  tmp_in="$tmp_dir/input.wav"
  ffmpeg -y -loglevel error -i "$input" -ac 1 -ar 16000 "$tmp_in"
fi

python_bin="${VOSK_PYTHON:-}"
if [[ -z "$python_bin" && -x "$project_root/.venv/bin/python" ]]; then
  python_bin="$project_root/.venv/bin/python"
fi
if [[ -z "$python_bin" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    python_bin="$(command -v python3)"
  fi
fi
if [[ -z "$python_bin" ]]; then
  echo "python3 is required to run Vosk" >&2
  exit 6
fi

transcript="$(
  "$python_bin" - "$tmp_in" "$VOSK_MODEL" <<'PY'
import json
import sys
import wave

from vosk import KaldiRecognizer, Model

wav_path = sys.argv[1]
model_path = sys.argv[2]

wf = wave.open(wav_path, "rb")
model = Model(model_path)
rec = KaldiRecognizer(model, wf.getframerate())

parts = []
while True:
    data = wf.readframes(4000)
    if not data:
        break
    if rec.AcceptWaveform(data):
        res = json.loads(rec.Result())
        text = res.get("text", "").strip()
        if text:
            parts.append(text)

final = json.loads(rec.FinalResult())
final_text = final.get("text", "").strip()
if final_text:
    parts.append(final_text)

print(" ".join(parts).strip())
PY
)"

if [[ -z "${transcript// }" ]]; then
  echo "Empty transcript from Vosk" >&2
  exit 7
fi

printf '%s\n' "$transcript"
