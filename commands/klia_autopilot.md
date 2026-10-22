---
description: Ejecuta el piloto automatico de KLIA (alertas burn, fallos, store)
---

Evalua las metricas del sistema y muestra acciones automaticas recomendadas
(ajuste de confianza, fallback a baseline, compactacion, alertas de burn).

IMPORTANTE: muestra la salida literal al usuario dentro de un bloque ```text```.
No ejecutes ninguna otra herramienta.

!`node "__KLIA_INSTALL_DIR__/dist/router-cli.js" autopilot --events "__KLIA_HOME__/data/events.json" $ARGUMENTS`
