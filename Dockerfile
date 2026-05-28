FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SDL_VIDEODRIVER=offscreen
ENV SDL_AUDIODRIVER=pulse
ENV PULSE_SERVER=unix:/tmp/pulse/native

# Core dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    pulseaudio \
    pulseaudio-utils \
    ffmpeg \
    libsdl2-2.0-0 \
    libsdl2-image-2.0-0 \
    libsdl2-mixer-2.0-0 \
    libsdl2-ttf-2.0-0 \
    libsdl2-gfx-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Python packages
RUN pip3 install \
    pygame==2.5.2 \
    websockets==12.0 \
    Pillow==10.2.0

# PulseAudio config - allow non-root, disable autospawn lock
RUN mkdir -p /etc/pulse \
    && printf '%s\n' \
    'autospawn = no' \
    'daemon-binary = /usr/bin/pulseaudio' \
    > /etc/pulse/client.conf

RUN printf '%s\n' \
    'load-module module-null-sink sink_name=game_audio sink_properties=device.description="GameAudio"' \
    'load-module module-native-protocol-unix auth-anonymous=1' \
    > /etc/pulse/default.pa

# Copy the pygame runner
COPY pygame_runner.py /opt/pygame_runner.py

# Startup script - boots PulseAudio then waits
COPY start_pulse.sh /opt/start_pulse.sh
RUN chmod +x /opt/start_pulse.sh

EXPOSE 7777

CMD ["sleep", "infinity"]
