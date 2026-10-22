<div align="center">

<img src="docs/assets/klia-token-optimizer-banner.png" alt="Klia Token Optimizer — intelligent optimization for OpenCode" width="100%">

# Klia Token Optimizer

### Menos contexto innecesario. Decisiones más inteligentes. Resultados medibles.

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Tests-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![MCP](https://img.shields.io/badge/MCP-Integration-0a9e6a?logo=modelcontextprotocol&logoColor=white)](https://modelcontextprotocol.io/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](./package.json)

**Una capa de optimización inteligente para OpenCode que coordina seis estrategias y usa los resultados de ejecución registrados para guiar las decisiones futuras.**

</div>

---

## Ahorro medido: 25,9 % menos tokens frente al baseline

Klia Token Optimizer reduce el uso de contexto evitable seleccionando la estrategia que encaja con cada tipo de tarea.

Las cifras siguientes provienen del benchmark reproducible incluido en este repositorio, ejecutado sobre este mismo proyecto con el mismo modelo, el mismo repositorio y el mismo conjunto de consultas en ambos modos. No hay números agregados sin trazabilidad: **cada cifra viene de un fichero de resultados por consulta**, enlazado al final de la sección.

### Cómo se ha medido

| Parámetro        | Valor                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Consultas        | 32 (10 categorías: búsqueda, empaquetado, documentación)                                                                                                                                   |
| Modelo           | `klia/GLM-5.2` en ambos modos                                                                                                                                                              |
| Modo baseline    | Optimizadores **desactivados**: sin MCP `repomix`/`semble`, sin `context-mode`, sin plugins `klia-*`, sin directiva del router                                                             |
| Modo optimizador | Optimizadores **activados**: MCP `repomix` y `semble` registrados, plugins `klia-router-inject`, `klia-auto-record`, `openrtk` y DCP cargados, directiva del router inyectada en el prompt |
| Métricas         | Flujo JSON de `kilocode run --format json` (tokens, latencia, herramientas)                                                                                                                |
| Repeticiones     | 1 por consulta (el benchmark acepta `-Repetitions N`)                                                                                                                                      |

### Resultado global (27 consultas comparables)

Solo las consultas que completan en ambos modos pueden compararse token a token.

| Métrica                 | Baseline | Optimizador | Diferencia            |
| ----------------------- | -------- | ----------- | --------------------- |
| Tokens totales          | 963.517  | 713.839     | **−249.678 (−25,9%)** |
| Latencia media          | 121 s    | 61 s        | −50%                  |
| Latencia máxima         | 282 s    | 118 s       | −58%                  |
| Llamadas a herramientas | 103      | 66          | −36%                  |
| Tokens de salida        | 20.085   | 17.795      | −11%                  |

- **Ahorro mediano por consulta: −3,3%.** **Media: +10,4%.**
- El modo optimizador gana en **13 de 27** consultas y pierde o empata en **14**.
- Además, **5 consultas del baseline nunca terminan** (Q21, Q22, Q24, Q28, Q32): se quedan sin tiempo. Con optimizadores **las 32 consultas completan**.

### Ahorro por categoría

| Categoría            | n   | Baseline | Optimizador | Ahorro     | Latencia (base → opt) |
| -------------------- | --- | -------- | ----------- | ---------- | --------------------- |
| BUSQUEDA_REFERENCIAS | 8   | 346.367  | 160.258     | **−53,7%** | 116 s → 59 s          |
| EMPAQUETADO_REPO     | 5   | 187.363  | 133.260     | **−28,9%** | 153 s → 65 s          |
| BUSQUEDA_FUNCION     | 8   | 248.620  | 223.037     | −10,3%     | 99 s → 55 s           |
| DOCUMENTACION        | 6   | 181.167  | 197.284     | **+8,9%**  | 132 s → 69 s          |

### Qué explica el resultado

- El ahorro se concentra donde el modelo leería el repositorio completo a mano: `BUSQUEDA_REFERENCIAS` y `EMPAQUETADO_REPO`. Con repomix, empaquetar el repositorio cabe en una llamada en lugar de docenas de lecturas.
- En `DOCUMENTACION` el modo optimizador es **peor** (+8,9%): la tarea solo necesitaba dos o tres ficheros, así que el coste fijo de los MCP registrados se paga sin amortizar.
- La mediana negativa viene de la misma causa: en una consulta trivial se paga la sobrecarga de las herramientas y no se recupera. El balance global positivo viene de la mezcla de categorías, no de que cada consulta mejore.
- El beneficio más sólido no son solo los tokens: **5 consultas que se cuelgan en modo baseline sí se resuelven** con optimizadores.

### Verifica cada cifra

Los ficheros de resultados del benchmark están versionados en el repositorio. Cada `.md` incluye el prompt, la categoría, el `TaskType`, el modelo, la duración, el estado y las métricas (tokens de entrada, salida y totales, latencia, herramientas usadas), así que cualquier cifra de este README puede comprobarse contra su fuente:

- [Instrucciones del benchmark](./Berchmark/benchmark_separado_kilocode/README.md) — cómo ejecutarlo y qué significa cada estado.
- [Resultados completos (baseline y optimizador)](./Berchmark/benchmark_separado_kilocode/results/) — un fichero por consulta y modo.
- [run-baseline.ps1](./Berchmark/benchmark_separado_kilocode/run-baseline.ps1) / [run-optimizer.ps1](./Berchmark/benchmark_separado_kilocode/run-optimizer.ps1) — scripts de ejecución.

| Consulta | Baseline (optimizadores OFF)                                                            | Optimizador (optimizadores ON)                                                             |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Q01      | [baseline01.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline01.md) | [optimizer01.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer01.md) |
| Q02      | [baseline02.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline02.md) | [optimizer02.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer02.md) |
| Q03      | [baseline03.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline03.md) | [optimizer03.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer03.md) |
| Q04      | [baseline04.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline04.md) | [optimizer04.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer04.md) |
| Q05      | [baseline05.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline05.md) | [optimizer05.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer05.md) |
| Q06      | [baseline06.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline06.md) | [optimizer06.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer06.md) |
| Q07      | [baseline07.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline07.md) | [optimizer07.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer07.md) |
| Q08      | [baseline08.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline08.md) | [optimizer08.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer08.md) |
| Q09      | [baseline09.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline09.md) | [optimizer09.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer09.md) |
| Q10      | [baseline10.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline10.md) | [optimizer10.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer10.md) |
| Q11      | [baseline11.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline11.md) | [optimizer11.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer11.md) |
| Q12      | [baseline12.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline12.md) | [optimizer12.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer12.md) |
| Q13      | [baseline13.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline13.md) | [optimizer13.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer13.md) |
| Q14      | [baseline14.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline14.md) | [optimizer14.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer14.md) |
| Q15      | [baseline15.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline15.md) | [optimizer15.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer15.md) |
| Q16      | [baseline16.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline16.md) | [optimizer16.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer16.md) |
| Q17      | [baseline17.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline17.md) | [optimizer17.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer17.md) |
| Q18      | [baseline18.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline18.md) | [optimizer18.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer18.md) |
| Q19      | [baseline19.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline19.md) | [optimizer19.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer19.md) |
| Q20      | [baseline20.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline20.md) | [optimizer20.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer20.md) |
| Q21      | [baseline21.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline21.md) | [optimizer21.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer21.md) |
| Q22      | [baseline22.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline22.md) | [optimizer22.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer22.md) |
| Q23      | [baseline23.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline23.md) | [optimizer23.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer23.md) |
| Q24      | [baseline24.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline24.md) | [optimizer24.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer24.md) |
| Q25      | [baseline25.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline25.md) | [optimizer25.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer25.md) |
| Q26      | [baseline26.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline26.md) | [optimizer26.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer26.md) |
| Q27      | [baseline27.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline27.md) | [optimizer27.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer27.md) |
| Q28      | [baseline28.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline28.md) | [optimizer28.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer28.md) |
| Q29      | [baseline29.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline29.md) | [optimizer29.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer29.md) |
| Q30      | [baseline30.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline30.md) | [optimizer30.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer30.md) |
| Q31      | [baseline31.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline31.md) | [optimizer31.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer31.md) |
| Q32      | [baseline32.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline32.md) | [optimizer32.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer32.md) |

> **Alcance de los datos.**
>
> - Solo se comparan las 27 consultas que completan en ambos modos. Las otras 5 se quedaron sin tiempo en modo baseline (Q21, Q22, Q24, Q28, Q32) y sus ficheros no registran tokens, así que quedan excluidas de la tabla global; sus valores en modo optimizador siguen en la tabla de enlaces.
> - Q13 y Q17 también agotaron el tiempo en la primera pasada del baseline y se repitieron con un presupuesto de 10 minutos: 73.772 y 128.064 tokens respectivamente. Son los dos mayores ahorros y explican buena parte del agregado.
> - Una repetición por consulta: el reparto por categorías y los porcentajes individuales llevan varianza. El benchmark acepta `-Repetitions N` para estabilizar la medición.
> - El ahorro se midió con el modelo `klia/GLM-5.2` y este repositorio como proyecto objetivo. Otros modelos, repositorios y mezclas de tareas producen números diferentes.
> - Menos tokens de contexto no significa necesariamente un coste total de API proporcionalmente menor, y en consultas triviales el modo optimizador puede consumir más tokens que el baseline.

## ¿Y si cada tarea usara la estrategia correcta?

No todas las tareas de código necesitan el mismo contexto ni se benefician de la misma herramienta. Klia Token Optimizer ayuda a seleccionar entre distintas estrategias según el tipo de tarea, el modelo y el historial de ejecución disponible.

El objetivo: **reducir el uso de tokens evitable manteniendo a la vista la calidad, los fallos, la latencia y el coste total.**

> Klia no promete un porcentaje de ahorro universal. Registra y compara resultados para ayudar a identificar qué estrategias funcionan mejor en un entorno dado.

## ¿Qué puede aportar a tu flujo de trabajo?

<table>
<tr>
<td width="50%" valign="top">

### Selección consciente del tipo de tarea

El router evalúa el tipo de trabajo y propone una estrategia candidata en lugar de aplicar siempre el mismo optimizador.

</td>
<td width="50%" valign="top">

### Ahorro medible, no suposiciones

Registra tokens y otras métricas para comparar estrategias contra un baseline y distinguir ahorros, retrocesos o resultados neutros.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Decisiones con historial

Las ejecuciones registradas aportan evidencia para adaptar la selección por modelo y tipo de tarea.

</td>
<td width="50%" valign="top">

### Equilibrio entre ahorro y calidad

La evaluación puede considerar tokens, latencia, costes de herramientas, fallos y calidad, no solo el volumen de tokens.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Fallback conservador

Cuando la evidencia es insuficiente, el router puede volver a `BASELINE` en lugar de dar por ganadora una alternativa sin validar.

</td>
<td width="50%" valign="top">

### Visibilidad de resultados

Consulta estadísticas por modelo y tarea, compara optimizadores y separa los datos reales de los registros sintéticos.

</td>
</tr>
</table>

## Seis estrategias coordinadas

| Estrategia     | Caso de uso potencial                                               |
| -------------- | ------------------------------------------------------------------- |
| `BASELINE`     | Referencia de comparación o fallback seguro cuando falta evidencia. |
| `DCP`          | Poda o compresión selectiva del contexto.                           |
| `RTK`          | Reducción de ruido en salidas de terminal, comandos y logs.         |
| `CONTEXT_MODE` | Trabajo con contexto grande, documentación e indexación.            |
| `REPOMIX`      | Preparación de una vista empaquetada del repositorio.               |
| `SEMBLE`       | Búsqueda semántica para localizar código relevante.                 |

La selección final depende de las reglas, el modelo, el tipo de tarea y los datos disponibles; no se asume que una sola estrategia gane en todos los casos.

## Cómo funciona

```text
OpenCode
   │
   ▼
Clasificación de la tarea
   │
   ▼
Reglas + evidencia histórica + modelo
   │
   ▼
Selección del optimizador
   │
   ▼
Ejecución y registro de resultados
   │
   ▼
Estadísticas para guiar decisiones futuras
```

### Un ciclo de mejora guiado por datos

1. **Clasificar** la tarea usando señales como la consulta, el número de ficheros y el tamaño del contexto.
2. **Evaluar** los optimizadores candidatos y la evidencia disponible para ese modelo y tipo de tarea.
3. **Seleccionar** una estrategia, volviendo a `BASELINE` cuando toca.
4. **Registrar** las métricas de ejecución disponibles.
5. **Comparar** resultados para identificar ahorros, retrocesos o ausencia de mejora.

El router incluye cuatro versiones del algoritmo de decisión: desde las reglas de base (V0), pasando por la adaptación guiada por historial (V1–V2), hasta la exploración controlada (V3).

## Mide lo que importa

- **Tokens:** uso total y, cuando está disponible, desglose entrada/salida.
- **Ahorro relativo:** comparación con el baseline para la misma combinación modelo/tarea.
- **Latencia:** tiempo de ejecución.
- **Coste:** coste estimado o registrado y costes de herramientas.
- **Calidad y fiabilidad:** valoraciones de calidad, fallos y reintentos.
- **Trazabilidad:** modelo, tarea, estrategia, motivo de la selección y confianza.

Los resultados dependen de la configuración y de las métricas registradas. Para demostrar un ahorro real, compara estrategias con el mismo modelo, tarea, repositorio y criterios de calidad.

## Instalación rápida en Windows

<img src="docs/assets/Klia_Token_Optimizer_2.png" alt="Klia Token Optimizer — intelligent optimization for OpenCode" width="100%">

El repositorio incluye un instalador de PowerShell para configurar el router y los optimizadores soportados por el proyecto.

```powershell
powershell -ExecutionPolicy Bypass -File install_klia_tokens.ps1
```

El instalador documentado soporta perfiles y un dry run:

```powershell
.\install_klia_tokens.ps1 -StackProfile minimo
.\install_klia_tokens.ps1 -DryRun
```

> Requisitos indicados por el proyecto: Node.js `>= 22.5`, npm y `uv` para las herramientas que lo requieren. Revisa las instrucciones del instalador antes de ejecutarlo en un entorno de trabajo.

## Ejemplo: pedir una decisión de enrutado

```bash
npm run router -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 250000
```

La salida incluye el optimizador seleccionado, el tipo de tarea, la versión del router, la confianza y el motivo de la decisión.

Si la tarea es pequeña o trivial (sin señal de coste), el router la rechaza: imprime `REFUSED=true` y `DIRECT=NATIVE` y recomienda ejecutarla directamente con las herramientas nativas (`read`, `grep`, `glob`, `shell`). La decisión se registra igualmente como `BASELINE`.

Tras ejecutar la tarea, registra métricas reales para aportar al historial:

```bash
npm run router -- --record-id <RECORD_ID> --tokens 9500 --latency 88 --quality 0.98
```

Consulta las estadísticas:

```bash
npm run router -- stats --model glm-5.2 --real-only
```

Los valores anteriores son ejemplos de uso, no una promesa de ahorro ni un resultado universal de benchmark.

## Mantenimiento: stats, calibrate, compact, autopilot y dashboard

La CLI incluye cinco subcomandos de mantenimiento que operan sobre `events.json` (el registro de eventos del router):

```bash
npm run router -- stats          # informe de ahorro en 8 secciones construido desde los eventos
npm run router -- calibrate      # compara la confianza declarada vs. la calidad real, sugiere ROUTER_MIN_CONFIDENCE
npm run router -- compact        # plan de limpieza del almacén (dry-run por defecto; --write lo aplica)
npm run router -- autopilot      # evalúa tokens/hora, tasa de fallos y tamaño del almacén, devuelve acciones
npm run router -- dashboard      # panel web local con métricas y benchmark (http://127.0.0.1:6283)
```

- `stats` acepta `--model`, `--task`, `--real-only` y `--no-color`.
- `calibrate --write` aplica el umbral sugerido a la configuración global de OpenCode (con una copia de seguridad `.bak-<timestamp>`); sin `--write` solo imprime la recomendación.
- `compact` caduca los eventos de más de 90 días (`--max-age-days`), purga las decisiones huérfanas tras 7 días (`--orphan-grace-days`) y rota el fichero con `--rotate --keep-events 5000`. Aplicar los cambios requiere `--write`.
- `autopilot` sugiere acciones (`adjust_confidence`, `force_baseline`, `compact_store`, `alert_burn`, `retrain_classifier`) sin ejecutarlas; `--disable` lo apaga 24 h y `--enable` lo reactiva.
- `dashboard --detach` deja el servidor en segundo plano (log en `~/.klia/logs/dashboard.log`) y no arranca si el puerto ya está en uso.

### Comandos slash

El instalador registra cinco comandos slash para OpenCode y Kilo: `/klia_stats`, `/klia_calibrate`, `/klia_compact`, `/klia_dashboard` y `/klia_autopilot`. Cada comando invoca la CLI instalada (`dist/router-cli.js`) con la ruta de eventos de `~/.klia` y renderiza la salida en el chat.

### Chequeo de salud al arrancar

Plugins finos (`klia-healthcheck`) instalados en Kilo y OpenCode (v1 y v2) lanzan, en cada arranque del editor, `dist/scripts/health-check.js --popup`. El chequeo verifica que:

- la versión de Node es >= 22.5,
- el runtime global existe (`%LOCALAPPDATA%\klia-token-optimizer\dist\router-cli.js`),
- el almacén de eventos (`events.json`) es accesible y editable,
- los MCP `repomix` y `semble` están registrados en las configuraciones OpenCode/Kilo,
- los binarios `rtk`, `repomix` y `semble` responden a `--version`,
- los plugins (`klia-router-inject`, `klia-auto-record`, `klia-healthcheck`) están en sus directorios.

El resultado se guarda en `~/.klia/data/health-state.json` y se limita a un chequeo completo cada 24 horas (`--interval-hours` o `KLIA_HEALTH_HOURS`; los arranques intermedios usan la caché y no muestran salida). Si algo falla, o si falta el propio `health-check.js` (instalación incompleta), se muestra un popup de Windows indicando si todo funciona bien o qué programa falla. Estados posibles: `ok`, `warn` (aviso, p. ej. un binario no responde), `fail` (fallo crítico).

El popup se controla con `KLIA_HEALTH_POPUP` (`always` por defecto, `fail-only` solo con fallos, `off` para silenciarlo) y `KLIA_HEALTH_POPUP_TIMEOUT` (segundos, 10 por defecto). `KLIA_HEALTH_DISABLE=1` desactiva el chequeo. El chequeo también se puede ejecutar a mano: `node dist/scripts/health-check.js --force --json`.

## Integración MCP

El servidor MCP expone cuatro herramientas:

| Herramienta        | Propósito                                          |
| ------------------ | -------------------------------------------------- |
| `route_task`       | Recomendar un optimizador para una tarea.          |
| `record_execution` | Registrar el resultado de una ejecución.           |
| `get_router_stats` | Consultar estadísticas y comparativas.             |
| `migrate_history`  | Migrar el historial al esquema de eventos vigente. |

## ¿Por qué Klia Token Optimizer?

Muchos proyectos se centran en una técnica concreta: comprimir contexto, filtrar salida, indexar código o enrutar modelos. Klia adopta un enfoque de coordinación: **reunir varias estrategias en una sola capa y usar los resultados registrados para guiar la selección**.

Su valor debe verificarse con datos del entorno real. Ejecuta pruebas comparables y evalúa juntos el uso de tokens, la calidad, la latencia, los fallos y la sobrecarga de instrumentación.

## Estado del proyecto

- Router adaptativo con versiones V0–V3.
- Seis estrategias soportadas por las reglas del router.
- Registro de ejecuciones e informes por modelo y tarea.
- Registro de decisiones y ejecuciones con escritura atómica y limpieza programable del almacén.
- CLI con `stats`, `calibrate`, `compact` y `autopilot`, además de un panel web `dashboard` en modo desacoplado.
- Comandos slash para OpenCode y Kilo (`/klia_stats`, `/klia_calibrate`, `/klia_compact`, `/klia_dashboard`, `/klia_autopilot`).
- Chequeo de salud con popup al arrancar OpenCode y Kilo: Node, runtime, almacén de eventos, MCP, binarios y plugins.
- Servidor MCP y CLI.
- Tests automatizados disponibles en el repositorio.

Para verificar una instalación o estrategia concreta, ejecuta los tests y realiza un benchmark controlado en tu entorno.

## Desarrollo

```bash
npm install
npm run build
npm test
```

## Documentación

- [Guía de uso en OpenCode](./docs/md/OPENCODE_USAGE.md)
- [Detalles del instalador](./instaladores/install.md)
- [Convenciones del proyecto](./AGENTS.md)
- [Documentación del router](./docs/md/router.md)
- [Benchmark baseline vs. optimizador: instrucciones](./Berchmark/benchmark_separado_kilocode/README.md)
- [Resultados del benchmark, un fichero por consulta y modo](./Berchmark/benchmark_separado_kilocode/results/)

## Licencia

Licencia ISC. Ver [`package.json`](./package.json).

---

<div align="center">

**Klia Token Optimizer · Instala. Optimiza. Mide. Mejora.**

</div>