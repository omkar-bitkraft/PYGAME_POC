#!/bin/bash
# Starts PulseAudio with virtual null sink inside the container
# Called once per session before pygame_runner.py

mkdir -p /tmp/pulse

pulseaudio \
  --daemonize=yes \
  --exit-idle-time=-1 \
  --log-target=file:/tmp/pulse.log \
  --load="module-null-sink sink_name=game_audio sink_properties=device.description=GameAudio" \
  --load="module-native-protocol-unix socket=/tmp/pulse/native auth-anonymous=1"

# Wait until socket is ready
for i in $(seq 1 20); do
  if [ -S /tmp/pulse/native ]; then
    echo "PulseAudio ready"
    exit 0
  fi
  sleep 0.2
done

echo "PulseAudio failed to start" >&2
exit 1
