<div align="center">

<img src="docs/assets/Banner.png" alt="Klia Token Optimizer — optimización inteligente para OpenCode" width="100%" />

# Klia Token Optimizer

### Menos tokens. Más eficiencia. Optimización inteligente para OpenCode.

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?logo=node.js&logoColor=white)](https://nodejs.org/)[![Tests](https://img.shields.io/badge/Tests-Vitest-6e9f18?logo=vitest)](https://vitest.dev/)[![MCP](https://img.shields.io/badge/Integración-MCP-0a9e6a?logo=modelcontextprotocol&logoColor=white)

**Klia Token Optimizer es una capa inteligente de optimización para OpenCode que coordina estrategias especializadas para reducir el consumo de tokens de contexto, automatizar tareas de configuración y mejorar la eficiencia de los agentes de IA.**

**Una instalación. Múltiples estrategias. Ahorro medible.**

</div>

---

## Ahorro medido: 25,9 % menos tokens frente al baseline

Klia Token Optimizer busca reducir el consumo innecesario de contexto en OpenCode mediante la selección de estrategias adaptadas a cada tipo de tarea.

Las cifras de esta sección proceden del benchmark reproducible incluido en el repositorio, ejecutado sobre este mismo proyecto con el mismo modelo, el mismo repositorio y la misma batería de queries en los dos modos. No hay cifras agregadas sin trazabilidad: **cada número sale de un fichero de resultado por query**, enlazado al final de la sección.

### Cómo se midió

| Parámetro | Valor |
| --- | --- |
| Queries | 32 (10 categorías: búsquedas, empaquetado, documentación) |
| Modelo | `klia/GLM-5.2` en ambos modos |
| Modo baseline | Optimizadores **desactivados**: sin MCP `repomix` ni `semble`, sin `context-mode`, sin plugins `klia-*` y sin directiva del router |
| Modo optimizer | Optimizadores **activados**: MCP `repomix` y `semble` registrados, plugins `klia-router-inject`, `klia-auto-record`, `openrtk` y DCP cargados, y directiva del router inyectada en el prompt |
| Métricas | Stream JSON de `kilocode run --format json` (tokens, latencia, herramientas) |
| Repeticiones | 1 por query (el benchmark admite `-Repetitions N`) |

### Resultado global (27 queries comparables)

Las 27 queries que terminan en ambos modos son las que permiten comparar tokens.

| Métrica | Baseline | Optimizer | Diferencia |
| --- | --- | --- | --- |
| Tokens totales | 963.517 | 713.839 | **−249.678 (−25,9 %)** |
| Latencia media | 121 s | 61 s | −50 % |
| Latencia máxima | 282 s | 118 s | −58 % |
| Llamadas a herramientas | 103 | 66 | −36 % |
| Tokens de salida | 20.085 | 17.795 | −11 % |

- **Mediana del ahorro por query: −3,3 %.** **Media: +10,4 %.**
- El modo optimizer gana en **13 de 27** queries y pierde o empata en **14**.
- Además, **5 queries del baseline no terminan** (Q21, Q22, Q24, Q28, Q32): agotan el tiempo. Con optimizadores **las 32 queries terminan**.

### Ahorro por categoría

| Categoría | n | Baseline | Optimizer | Ahorro | Latencia (base → opt) |
| --- | --- | --- | --- | --- | --- |
| BUSQUEDA_REFERENCIAS | 8 | 346.367 | 160.258 | **−53,7 %** | 116 s → 59 s |
| EMPAQUETADO_REPO | 5 | 187.363 | 133.260 | **−28,9 %** | 153 s → 65 s |
| BUSQUEDA_FUNCION | 8 | 248.620 | 223.037 | −10,3 % | 99 s → 55 s |
| DOCUMENTACION | 6 | 181.167 | 197.284 | **+8,9 %** | 132 s → 69 s |

### Qué explica el resultado

- El ahorro se concentra donde el modelo iba a leer el repositorio entero a mano: `BUSQUEDA_REFERENCIAS` y `EMPAQUETADO_REPO`. Con repomix, el empaquetado del repo cabe en una llamada en lugar de decenas de lecturas.
- En `DOCUMENTACION` el modo optimizer es **peor** (+8,9 %): la tarea solo necesitaba leer dos o tres ficheros y se paga el coste fijo de los MCP registrados sin llegar a amortizarlo.
- La mediana del ahorro es negativa por ese mismo motivo: en una consulta trivial el overhead de las herramientas se paga y no se recupera. El balance global positivo viene del reparto entre categorías, no de que toda consulta mejore.
- El beneficio más sólido no está solo en tokens: **5 consultas que el baseline deja colgadas se resuelven** con optimizadores.

### Casos representativos

| Query | Categoría | Baseline | Optimizer | Ahorro | Herramientas (modo optimizer) |
| --- | --- | --- | --- | --- | --- |
| Q17 | BUSQUEDA_REFERENCIAS | 128.064 | 14.418 | **−88,7 %** | `grep` |
| Q05 | EMPAQUETADO_REPO | 42.258 | 18.780 | **−55,6 %** | `repomix_pack_codebase` |
| Q03 | BUSQUEDA_REFERENCIAS | 57.192 | 26.172 | **−54,2 %** | `grep` |
| Q18 | BUSQUEDA_REFERENCIAS | 31.702 | 15.289 | **−51,8 %** | `grep` |
| Q26 | EMPAQUETADO_REPO | 38.752 | 24.041 | **−38,0 %** | `repomix_pack_codebase`, `bash` |
| Q09 | BUSQUEDA_FUNCION | 20.287 | 35.050 | **+72,8 %** | `semble_search`, `read`, `read` |
| Q08 | DOCUMENTACION | 31.463 | 41.534 | **+32,0 %** | `grep`, `read`, `read` |
| Q12 | BUSQUEDA_FUNCION | 32.912 | 40.065 | **+21,7 %** | `grep`, `grep`, `glob`, `grep` |

### Verifica cada cifra

Los ficheros de resultado del benchmark están versionados en el repositorio. Cada `.md` incluye el prompt, la categoría, el `TaskType`, el modelo, la duración, el estado y las métricas (tokens de entrada, salida y total, latencia, herramientas usadas), de modo que cualquier cifra de este README se puede contrastar con su origen:

- [Instrucciones del benchmark](./Berchmark/benchmark_separado_kilocode/README.md) — cómo se ejecuta y qué significa cada estado.
- [Resultados completos (baseline y optimizer)](./Berchmark/benchmark_separado_kilocode/results/) — un fichero por query y por modo.
- [run-baseline.ps1](./Berchmark/benchmark_separado_kilocode/run-baseline.ps1) / [run-optimizer.ps1](./Berchmark/benchmark_separado_kilocode/run-optimizer.ps1) — scripts de ejecución.

| Query | Baseline (optimizadores OFF) | Optimizer (optimizadores ON) |
| --- | --- | --- |
| Q01 | [baseline01.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline01.md) | [optimizer01.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer01.md) |
| Q02 | [baseline02.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline02.md) | [optimizer02.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer02.md) |
| Q03 | [baseline03.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline03.md) | [optimizer03.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer03.md) |
| Q04 | [baseline04.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline04.md) | [optimizer04.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer04.md) |
| Q05 | [baseline05.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline05.md) | [optimizer05.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer05.md) |
| Q06 | [baseline06.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline06.md) | [optimizer06.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer06.md) |
| Q07 | [baseline07.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline07.md) | [optimizer07.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer07.md) |
| Q08 | [baseline08.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline08.md) | [optimizer08.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer08.md) |
| Q09 | [baseline09.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline09.md) | [optimizer09.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer09.md) |
| Q10 | [baseline10.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline10.md) | [optimizer10.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer10.md) |
| Q11 | [baseline11.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline11.md) | [optimizer11.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer11.md) |
| Q12 | [baseline12.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline12.md) | [optimizer12.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer12.md) |
| Q13 | [baseline13.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline13.md) | [optimizer13.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer13.md) |
| Q14 | [baseline14.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline14.md) | [optimizer14.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer14.md) |
| Q15 | [baseline15.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline15.md) | [optimizer15.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer15.md) |
| Q16 | [baseline16.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline16.md) | [optimizer16.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer16.md) |
| Q17 | [baseline17.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline17.md) | [optimizer17.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer17.md) |
| Q18 | [baseline18.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline18.md) | [optimizer18.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer18.md) |
| Q19 | [baseline19.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline19.md) | [optimizer19.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer19.md) |
| Q20 | [baseline20.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline20.md) | [optimizer20.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer20.md) |
| Q21 | [baseline21.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline21.md) | [optimizer21.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer21.md) |
| Q22 | [baseline22.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline22.md) | [optimizer22.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer22.md) |
| Q23 | [baseline23.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline23.md) | [optimizer23.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer23.md) |
| Q24 | [baseline24.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline24.md) | [optimizer24.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer24.md) |
| Q25 | [baseline25.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline25.md) | [optimizer25.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer25.md) |
| Q26 | [baseline26.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline26.md) | [optimizer26.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer26.md) |
| Q27 | [baseline27.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline27.md) | [optimizer27.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer27.md) |
| Q28 | [baseline28.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline28.md) | [optimizer28.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer28.md) |
| Q29 | [baseline29.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline29.md) | [optimizer29.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer29.md) |
| Q30 | [baseline30.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline30.md) | [optimizer30.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer30.md) |
| Q31 | [baseline31.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline31.md) | [optimizer31.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer31.md) |
| Q32 | [baseline32.md](./Berchmark/benchmark_separado_kilocode/results/baseline/baseline32.md) | [optimizer32.md](./Berchmark/benchmark_separado_kilocode/results/optimizer/optimizer32.md) |

> **Notas sobre el alcance de los datos.**
>
> - Solo se comparan las 27 queries que terminan en ambos modos. Las 5 restantes agotaron el tiempo en el baseline (Q21, Q22, Q24, Q28, Q32) y su fichero no registra tokens, por lo que quedan fuera de la tabla global; sus valores de optimizer sí están en la tabla de enlaces.
> - Q13 y Q17 agotaron también el tiempo de la primera pasada de baseline y se repitieron con un presupuesto de 10 minutos: 73.772 y 128.064 tokens respectivamente. Son las dos mayores ganancias y explican buena parte del ahorro agregado.
> - Una repetición por query: el reparto entre categorías y los porcentajes individuales tienen varianza. El benchmark admite `-Repetitions N` para estabilizar la medición.
> - El ahorro se midió con el modelo `klia/GLM-5.2` y este repositorio como proyecto objetivo. Otros modelos, repositorios y mezclas de tareas dan otros números.
> - Reducir tokens de contexto no implica necesariamente una reducción equivalente del coste total de API, y en consultas triviales el modo optimizer puede consumir más tokens que el baseline.

## Instalación automatizada: un solo comando para empezar

¿Por qué perder tiempo instalando y configurando manualmente cada herramienta?

Klia incluye un instalador PowerShell diseñado para automatizar la preparación del entorno y la instalación y configuración de los componentes contemplados por el script.

En lugar de empezar desde cero con cada optimizador, puedes iniciar el proceso con un único comando.

### 1. Ejecuta el instalador

Abre PowerShell en el directorio del proyecto y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File install_klia_tokens.ps1
```

### 2. Selecciona el perfil adecuado

El proyecto documenta opciones para utilizar un perfil mínimo o simular las operaciones antes de aplicarlas:

```powershell
.\install_klia_tokens.ps1 -StackProfile minimo
.\install_klia_tokens.ps1 -DryRun
```

### 3. Utiliza el router y mide los resultados

Una vez completada la instalación, podrás utilizar el router para seleccionar estrategias, ejecutar tareas y registrar métricas.

El alcance de la instalación automática depende de las operaciones implementadas por el script. Las dependencias externas, los requisitos previos y las herramientas que necesiten autenticación deben cumplir sus respectivas instrucciones.

## ¿Qué es Klia Token Optimizer?

No todas las tareas de programación necesitan el mismo contexto ni se benefician de la misma herramienta.

Una búsqueda en un repositorio, una operación de terminal, una refactorización y una tarea multipaso presentan necesidades diferentes. Aplicar siempre el mismo optimizador puede introducir complejidad innecesaria e incluso aumentar el consumo.

Klia aborda este problema mediante una capa de decisión que analiza el tipo de tarea, considera las estrategias candidatas y utiliza el historial de ejecuciones para orientar futuras selecciones.

El objetivo es **reducir el consumo evitable de tokens sin perder de vista la calidad, la fiabilidad, la latencia y el coste total**.

## Principales ventajas

<img src="docs/assets/klia-token-optimizer-banner.png" alt="Klia Token Optimizer — optimización inteligente para OpenCode" width="100%" />

<table>
<tr>
<td width="50%" valign="top">

### Selección según la tarea

El router identifica el tipo de trabajo y propone una estrategia candidata en lugar de aplicar siempre el mismo optimizador.

</td>
<td width="50%" valign="top">

### Ahorro medible

Compara los resultados frente al baseline para identificar reducciones reales, pérdidas o resultados neutros.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Instalación simplificada

El instalador automatiza las operaciones de preparación y configuración que contempla el proyecto.

</td>
<td width="50%" valign="top">

### Decisiones orientadas por datos

Las ejecuciones registradas permiten estudiar qué estrategias funcionan mejor según el modelo y la tarea.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Equilibrio entre ahorro y calidad

La evaluación considera tokens, latencia, coste, fallos y calidad, no solamente el volumen de contexto.

</td>
<td width="50%" valign="top">

### Fallback conservador

Cuando no existe evidencia suficiente, el router puede recurrir a `BASELINE` en lugar de asumir que una estrategia no validada es superior.

</td>
</tr>
</table>

## Seis estrategias coordinadas

Klia contempla seis estrategias para responder a diferentes necesidades de optimización.

| Estrategia     | Cuándo puede resultar útil                                             |
| -------------- | ---------------------------------------------------------------------- |
| `BASELINE`     | Referencia de comparación o alternativa conservadora.                  |
| `DCP`          | Poda o compresión selectiva del contexto.                              |
| `RTK`          | Reducción del ruido en salidas de terminal, comandos y logs.           |
| `CONTEXT_MODE` | Trabajo con contextos amplios y recuperación selectiva de información. |
| `REPOMIX`      | Preparación de una vista empaquetada del repositorio.                  |
| `SEMBLE`       | Búsqueda semántica para localizar código relevante.                    |

La selección depende de las reglas del router, el modelo, el tipo de tarea y los datos disponibles. Utilizar más herramientas simultáneamente no garantiza un mayor ahorro: la coordinación y la evaluación son esenciales.

## Cómo funciona

<img src="docs/assets/comofunciona.png" alt="Arquitectura y funcionamiento de Klia Token Optimizer" width="100%" />

### Un ciclo de optimización basado en datos

1. **Clasifica:** analiza señales de la tarea, como la consulta, el número de archivos y el tamaño del contexto.
2. **Evalúa:** considera los optimizadores candidatos y la evidencia disponible para el modelo y la tarea.
3. **Selecciona:** propone una estrategia o utiliza `BASELINE` cuando corresponde.
4. **Registra:** almacena las métricas disponibles de la ejecución.
5. **Compara:** identifica dónde hay ahorro, pérdida o ausencia de mejora.
6. **Mejora las decisiones:** utiliza el historial para orientar futuras selecciones.

El router contempla cuatro versiones de decisión: desde reglas base (V0), pasando por adaptación con historial (V1–V2), hasta exploración controlada (V3).

## Mide lo que importa

Klia no se limita a contar tokens. Permite evaluar distintas dimensiones del rendimiento.

| Métrica                    | Objetivo                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Tokens de entrada y salida | Medir el consumo cuando ambas métricas están disponibles.                                     |
| Tokens de contexto         | Comparar el volumen de contexto registrado frente al baseline.                                |
| Ahorro relativo            | Calcular la diferencia entre la referencia y la estrategia optimizada.                        |
| Latencia                   | Medir el tiempo de ejecución.                                                                 |
| Coste                      | Evaluar el coste registrado o estimado y los costes de herramientas cuando estén disponibles. |
| Calidad y fiabilidad       | Identificar fallos, reintentos y posibles pérdidas de calidad.                                |
| Trazabilidad               | Registrar el modelo, la tarea, la estrategia y el motivo de selección.                        |

Para demostrar una mejora real, compara ejecuciones con el mismo modelo, tareas equivalentes, el mismo repositorio y criterios de calidad comparables.

## Ejemplo: consultar una decisión

```bash
npm run router -- --model glm-5.2 --query "refactoriza auth" --files 12 --size 250000
```

La salida incluye el optimizador seleccionado, el tipo de tarea, la versión del router, la confianza y el motivo de la decisión.

### Registrar una ejecución

Después de ejecutar la tarea, registra las métricas reales:

```bash
npm run router -- --record-id <RECORD_ID> --tokens 9500 --latency 88 --quality 0.98
```

### Consultar estadísticas

```bash
npm run router -- stats --model glm-5.2 --real-only
```

Los valores del ejemplo son ilustrativos. Las conclusiones sobre el ahorro deben basarse en registros reales y comparables.

## Integración MCP

El servidor MCP permite integrar las capacidades del router en flujos de trabajo compatibles.

| Herramienta        | Función                                           |
| ------------------ | ------------------------------------------------- |
| `route_task`       | Recomendar una estrategia para una tarea.         |
| `record_execution` | Registrar el resultado de una ejecución.          |
| `get_router_stats` | Consultar estadísticas y comparativas.            |
| `migrate_history`  | Migrar el historial al esquema de eventos actual. |

## ¿Por qué elegir Klia Token Optimizer?

Muchas soluciones se centran en una técnica específica: reducir el contexto, filtrar salidas, indexar código o enrutar modelos.

Klia propone un enfoque de coordinación: **reunir varias estrategias en una misma capa de decisión y utilizar resultados registrados para orientar la selección**.

Esto permite:

- Simplificar la preparación del entorno mediante el instalador.
- Adaptar la estrategia al tipo de tarea.
- Comparar optimizadores frente a una referencia.
- Identificar cuándo una herramienta aporta valor y cuándo no.
- Tomar decisiones respaldadas por métricas en lugar de suposiciones.
- Evaluar el ahorro junto con la calidad, la latencia y el coste.

El objetivo no es reducir tokens a cualquier precio, sino mejorar la eficiencia del flujo de trabajo con IA.

## Estado del proyecto

- Router adaptativo con versiones V0–V3.
- Seis estrategias contempladas por las reglas del router.
- Registro de ejecuciones e informes por modelo y tarea.
- Servidor MCP y CLI.
- Tests automatizados disponibles en el repositorio.
- Instalador PowerShell con perfiles y modo de simulación documentados.
- Suite de evaluación con comparativa entre baseline y optimización.

## Requisitos

- Windows para utilizar el instalador PowerShell.
- Node.js `>= 22.5`.
- npm.
- `uv` para las herramientas que lo requieran.
- Dependencias y credenciales adicionales según los componentes seleccionados.

Consulta las instrucciones del instalador para verificar los requisitos específicos de tu entorno.

## Desarrollo

```bash
npm install
npm run build
npm test
```

## Documentación

- [Guía de uso de OpenCode](./docs/md/OPENCODE_USAGE.md)
- [Detalles del instalador](./instaladores/install.md)
- [Convenciones del proyecto](./AGENTS.md)
- [Documentación técnica](./docs/md/router.md)
- [Benchmark baseline vs. optimizado: instrucciones](./Berchmark/benchmark_separado_kilocode/README.md)
- [Resultados del benchmark, un fichero por query y modo](./Berchmark/benchmark_separado_kilocode/results/)

## Licencia

Licencia ISC. Consulta [`package.json`](./package.json).

---

<div align="center">

**Klia Token Optimizer**

### Instala. Optimiza. Mide. Mejora.

*Menos contexto innecesario. Más control sobre el consumo de IA.*

</div>
