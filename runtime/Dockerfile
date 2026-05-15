FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV PYTHONUNBUFFERED=1
ENV RUNTIME_ROOT=/opt/runtime
ENV RUNTIME_WORKDIR=/opt/runtime/workdir
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        libasound2 \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libx11-6 \
        libxext6 \
        libxrender1 \
        novnc \
        x11vnc \
        xvfb \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pygame==2.6.1 \
    && pip install --no-cache-dir --no-deps websockify==0.13.0

RUN mkdir -p "${RUNTIME_WORKDIR}"

WORKDIR ${RUNTIME_ROOT}

COPY launcher.sh ${RUNTIME_ROOT}/launcher.sh
COPY workdir ${RUNTIME_WORKDIR}

RUN chmod +x ${RUNTIME_ROOT}/launcher.sh

EXPOSE 5900 6080

CMD ["./launcher.sh"]
