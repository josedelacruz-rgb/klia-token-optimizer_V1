---
description: Inicia el dashboard web de KLIA (servidor HTTP local en segundo plano)
---

Arranca el dashboard web de KLIA con las metricas del router.
Por defecto escucha en http://127.0.0.1:6283 y lee los eventos de
~/.klia/data/events.json.

El servidor se levanta en segundo plano (proceso desacoplado): el comando
devuelve la URL y termina, no se queda bloqueando la sesion.

IMPORTANTE: muestra la salida literal al usuario dentro de un bloque ```text```.
No ejecutes ninguna otra herramienta.

!`node "__KLIA_INSTALL_DIR__/dist/router-cli.js" dashboard --events "__KLIA_HOME__/data/events.json" --detach $ARGUMENTS; Start-Process "http://127.0.0.1:6283"`

El navegador se abre automaticamente con la URL del dashboard. Si no se
abre, entra manualmente en http://127.0.0.1:6283.

Arranque manual equivalente (si el proceso desacoplado no llegase a levantarse):
- Windows (PowerShell): `Start-Process -FilePath "node" -ArgumentList '"__KLIA_INSTALL_DIR__/dist/router-cli.js"','dashboard','--events','"__KLIA_HOME__/data/events.json"' -WindowStyle Hidden`
- Unix: `nohup node "__KLIA_INSTALL_DIR__/dist/router-cli.js" dashboard --events "__KLIA_HOME__/data/events.json" >/dev/null 2>&1 &`
