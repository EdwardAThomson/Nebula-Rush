#!/usr/bin/env bash
# Regenerates public/assets/audio/sfx/boost.mp3 ("surge"): a 0.6s harmonic
# riser sweeping 260->1340 Hz. Keep boost energy ABOVE ~200 Hz: the Dec 2025
# "deeper tones" pass swept 20-140 Hz, which normal speakers cannot reproduce,
# and the boost sound was silently inaudible for months.
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -y -v error -f lavfi -i \
  "aevalsrc='(min(t*30,1)*exp(-2.5*t))*0.5*(sin(2*PI*(260*t+900*t*t))+0.5*sin(2*PI*2*(260*t+900*t*t))+0.25*sin(2*PI*3*(260*t+900*t*t)))':d=0.6:s=44100" \
  -c:a libmp3lame -q:a 4 public/assets/audio/sfx/boost.mp3
echo "boost.mp3 regenerated:"
ffmpeg -i public/assets/audio/sfx/boost.mp3 -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
