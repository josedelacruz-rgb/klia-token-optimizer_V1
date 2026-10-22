---
description: Purga el store de eventos del router (TTL + pares huerfanos); dry-run por defecto, usa --write para aplicar
---

Compacta el store de eventos: elimina eventos caducados por TTL (90 dias por defecto)
y pares huerfanos (decisiones sin execution y viceversa) respetando un periodo de
gracia de 7 dias para no romper sesiones en curso. Por defecto es un dry-run: muestra
el informe sin tocar el store. Anade --write en los argumentos para aplicar los cambios
(crea un backup events.json.bak-<timestamp>).

Argumentos opcionales en $ARGUMENTS:
  --write                     Aplica la compactacion (por defecto solo muestra el informe)
  --max-age-days <N>          TTL en dias (0 desactiva la expiracion; por defecto 90)
  --orphan-grace-days <N>     Dias de gracia para pares huerfanos (por defecto 7)
  --drop-orphan-executions    Tambien elimina ejecuciones huerfanas (por defecto se conservan)
  --purge-synthetic           Tambien expira los eventos sinteticos de calibracion
  --rotate                    Rota el fichero si supera --keep-events (por defecto 5000)

IMPORTANTE: muestra al usuario TODO el contenido del informe de abajo, integro y
literal, dentro de un unico bloque de codigo ```text```. Conserva todas las tablas y
secciones, sin resumir y sin anadir comentarios propios. No ejecutes ninguna otra
herramienta ni pidas confirmacion.

!`node "__KLIA_INSTALL_DIR__/dist/router-cli.js" compact --events "__KLIA_HOME__/data/events.json" --no-color $ARGUMENTS`