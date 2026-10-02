# Synthese vocale francaise, sur la tour.
#
# Les voix sont telechargees a la construction, pas au demarrage : le conteneur
# doit pouvoir redemarrer sans acces internet, et sans fenetre pendant laquelle
# Isaac serait muet.
FROM python:3.11-slim

# Version figee : la signature de synthesize() a change entre les versions de
# piper-tts, et une mise a jour silencieuse casserait le service.
RUN pip install --no-cache-dir "piper-tts==1.2.0"

ARG BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR
ARG BASE_EN=https://huggingface.co/rhasspy/piper-voices/resolve/main/en
RUN set -eux; \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    mkdir -p /voix && \
    for v in "siwis/medium/fr_FR-siwis-medium" "upmc/medium/fr_FR-upmc-medium"; do \
      f=$(basename "$v"); \
      curl -fsSL "$BASE/$v.onnx"      -o "/voix/$f.onnx"; \
      curl -fsSL "$BASE/$v.onnx.json" -o "/voix/$f.onnx.json"; \
    done && \
    for v in "en_US/ryan/medium/en_US-ryan-medium"; do \
      f=$(basename "$v"); \
      curl -fsSL "$BASE_EN/$v.onnx"      -o "/voix/$f.onnx"; \
      curl -fsSL "$BASE_EN/$v.onnx.json" -o "/voix/$f.onnx.json"; \
    done && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY serveur.py prononciation.py /app/
ENV DOSSIER_VOIX=/voix VOIX_PAR_DEFAUT=pierre VOIX_ANGLAISE=ryan PORT=5002
EXPOSE 5002
WORKDIR /app
CMD ["python", "serveur.py"]
