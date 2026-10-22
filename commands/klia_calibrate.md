---
description: Calibracion de confianza de KLIA Token Optimizer (score, desglose por modelo, umbral minConfidence sugerido, ruta del fichero de config, recalibracion automatica con --dry-run para vista previa)
---

Analiza la calibracion del router adaptativo de KLIA Token Optimizer: compara la
confianza que el router declara en cada decision con la calidad real de la
ejecucion emparejada por sessionId, recomienda si conviene subir, bajar o
mantener el umbral minConfidence, e indica el fichero de configuracion global
donde vive `ROUTER_MIN_CONFIDENCE`. Aplica automaticamente el umbral sugerido a
ese fichero (crea backup `.bak-<timestamp>`). Para verlo sin escribir nada, pasa
`--dry-run`.

IMPORTANTE: muestra al usuario TODO el contenido del informe de abajo, integro y
literal, dentro de un unico bloque de codigo ```text```. Conserva las metricas, la
recomendacion, el desglose por modelo, la seccion de configuracion y el
veredicto, sin resumir y sin anadir comentarios propios. No ejecutes ninguna otra
herramienta ni pidas confirmacion.

!`node "__KLIA_INSTALL_DIR__/dist/router-cli.js" calibrate --events "__KLIA_HOME__/data/events.json" --no-color --write $ARGUMENTS`
