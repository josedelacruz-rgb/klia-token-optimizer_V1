/**
 * Web Dashboard - Servidor HTTP con metricas enriquecidas del router.
 */

import * as http from 'http';
import { buildDashboardReport, getDefaultEventsPath } from './stats-adapter';

export interface WebDashboardOptions {
  port?: number;
  host?: string;
  eventsPath?: string;
  benchmarkPath?: string;
  enableShutdown?: boolean;
}

const CHART_COLORS = [
  '#ff8a3d',
  '#22d3a7',
  '#fbbf24',
  '#a78bfa',
  '#38bdf8',
  '#fb7185',
  '#84cc16',
  '#94a3b8',
];

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(n: number): string {
  return n.toLocaleString('es-ES');
}

function dashboardHtml(data: ReturnType<typeof buildDashboardReport>): string {
  const { report, summary, benchmark } = data;
  const optimizerEntries = Object.entries(summary.optimizerCounts).sort((a, b) => b[1] - a[1]);
  const optDist = optimizerEntries.map(([opt, count]) => ({ opt, count }));

  const optRows = benchmark.available
    ? benchmark.rows
        .filter((r) => r.optimizer !== 'BASELINE')
        .map(
          (r) =>
            `<tr><td>${esc(r.taskId)}</td><td>${esc(r.taskName)}</td><td>${esc(r.taskType)}</td>` +
            `<td><b>${esc(r.optimizer)}</b></td><td class="num">${num(Math.round(r.tokens))}</td>` +
            `<td class="num muted">${num(Math.round(r.baselineTokens))}</td>` +
            `<td class="num ${r.savingsPercent > 0 ? 'ok' : r.savingsPercent < 0 ? 'bad' : ''}">${r.savingsPercent.toFixed(1)}%</td>` +
            `<td class="num">${num(Math.round(r.savingsTokens))}</td><td class="num">${r.latencySeconds.toFixed(1)}s</td>` +
            `<td class="num">${r.quality.toFixed(2)}</td>` +
            `<td>${r.failed ? '<span class="pill p-bad">fallo</span>' : '<span class="pill p-ok">ok</span>'}</td></tr>`,
        )
        .join('')
    : report.byModelTask
        .flatMap((mt) => mt.optimizers.map((o) => ({ model: mt.model, task: mt.taskType, ...o })))
        .sort((a, b) => (b.savingsPercent ?? -999) - (a.savingsPercent ?? -999))
        .slice(0, 100)
        .map(
          (r) =>
            `<tr><td>${esc(r.model)}</td><td>${esc(r.task)}</td><td>${esc(r.task)}</td>` +
            `<td><b>${esc(r.optimizer)}</b></td><td class="num">${num(Math.round(r.avgTokens))}</td>` +
            `<td class="num muted">-</td>` +
            `<td class="num ${r.savingsPercent !== null && r.savingsPercent > 0 ? 'ok' : ''}">` +
            `${r.savingsPercent !== null ? r.savingsPercent.toFixed(1) + '%' : '-'}</td>` +
            `<td class="num">${r.savingsTokens !== null ? num(Math.round(r.savingsTokens)) : '-'}</td>` +
            `<td class="num">${r.avgLatency.toFixed(1)}s</td><td class="num">${r.avgQuality.toFixed(2)}</td>` +
            `<td>${r.winner ? '<span class="pill p-ok">mejor</span>' : ''}</td></tr>`,
        )
        .join('');

  const modelRows = benchmark.available
    ? benchmark.byModel
        .map(
          (m) =>
            `<tr><td><b>${esc(m.key)}</b></td><td class="num">${m.samples}</td>` +
            `<td class="num">${num(Math.round(m.totalTokens))}</td>` +
            `<td class="num ok">${m.weightedSavingsPercent.toFixed(1)}%</td>` +
            `<td class="num">${num(Math.round(m.totalSavedTokens))}</td>` +
            `<td><span class="pill p-ok">${esc(m.bestOptimizer ?? '-')}</span></td>` +
            `<td class="num">${m.avgLatency.toFixed(1)}s</td>` +
            `<td class="num">${m.avgQuality.toFixed(2)}</td>` +
            `<td class="num ${m.failures > 0 ? 'bad' : 'ok'}">${m.failures}</td></tr>`,
        )
        .join('')
    : report.byModel
        .map(
          (m) =>
            `<tr><td><b>${esc(m.model)}</b> <span class="muted">${esc(m.modelFamily)}</span></td>` +
            `<td class="num">${m.executions}</td><td class="num">${num(Math.round(m.avgTokens))}</td>` +
            `<td class="num ok">${m.savingsVsBaselinePercent.toFixed(1)}%</td>` +
            `<td class="num">${num(Math.round(m.savingsVsBaselineTokens))}</td>` +
            `<td><span class="pill p-ok">${esc(m.bestOptimizer ?? '-')}</span></td>` +
            `<td class="num">${m.avgLatency.toFixed(1)}s</td><td class="num">-</td>` +
            `<td class="num">${m.avgQuality.toFixed(2)}</td></tr>`,
        )
        .join('');

  const modelTaskRows = benchmark.available
    ? benchmark.byModelTask
        .map(
          (m) =>
            `<tr><td>${esc(m.key.split(' :: ')[0])}</td><td>${esc(m.secondary)}</td>` +
            `<td class="num">${m.samples}</td>` +
            `<td class="num ok">${m.weightedSavingsPercent.toFixed(1)}%</td>` +
            `<td class="num">${num(Math.round(m.totalSavedTokens))}</td>` +
            `<td><span class="pill p-ok">${esc(m.bestOptimizer ?? '-')}</span></td></tr>`,
        )
        .join('')
    : report.byModelTask
        .map(
          (mt) =>
            `<tr><td>${esc(mt.model)}</td><td>${esc(mt.taskType)}</td><td class="num">${mt.totalSamples}</td>` +
            `<td class="num ok">${mt.bestOptimizer ? '100.0' : '-'}</td>` +
            `<td class="num">-</td>` +
            `<td><span class="pill p-ok">${esc(mt.bestOptimizer ?? '-')}</span></td></tr>`,
        )
        .join('');

  const topOpts = report.byModelTask
    .flatMap((mt) => mt.optimizers.map((o) => ({ m: mt.model, t: mt.taskType, ...o })))
    .filter((o) => o.savingsPercent !== null)
    .sort((a, b) => (b.savingsPercent ?? -999) - (a.savingsPercent ?? -999))
    .slice(0, 15);

  const charts = {
    optDist,
    topOpts: topOpts.map((o) => ({
      label: `${o.m} · ${o.optimizer}`,
      savings: o.savingsPercent,
      baseline: 0,
    })),
    byModel: (
      benchmark.available
        ? benchmark.byModel.map((m) => ({
            model: m.key,
            savings: m.weightedSavingsPercent,
            tokens: m.totalTokens,
          }))
        : report.byModel.map((m) => ({
            model: m.model,
            savings: m.savingsVsBaselinePercent,
            tokens: m.avgTokens,
          }))
    ),
    optTotals: (
      benchmark.available
        ? benchmark.byOptimizer.map((o) => ({
            opt: o.optimizer,
            saved: o.totalSavedTokens,
            base: o.totalBaselineTokens,
          }))
        : Object.values(
            report.byModelTask.reduce<Record<string, { opt: string; saved: number; base: number }>>(
              (acc, mt) => {
                for (const o of mt.optimizers) {
                  if (!acc[o.optimizer]) acc[o.optimizer] = { opt: o.optimizer, saved: 0, base: 0 };
                  acc[o.optimizer].saved += o.savingsTokens ?? 0;
                  acc[o.optimizer].base += o.avgTokens * o.samples;
                }
                return acc;
              },
              {},
            ),
          )
    ),
    bench: {
      byOptimizer: benchmark.byOptimizer.map((o) => ({
        optimizer: o.optimizer,
        savings: o.weightedSavingsPercent,
        saved: o.totalSavedTokens,
        baseline: o.totalBaselineTokens,
        used: o.totalTokens,
        latency: o.avgLatency,
        quality: o.avgQuality,
        samples: o.samples,
        failures: o.failures,
      })),
      byTaskType: benchmark.byTaskType.map((t) => ({
        taskType: t.key,
        savings: t.weightedSavingsPercent,
        saved: t.totalSavedTokens,
        baseline: t.totalBaselineTokens,
        used: t.totalTokens,
        best: t.bestOptimizer,
      })),
      byModel: benchmark.byModel.map((m) => ({
        model: m.key,
        savings: m.weightedSavingsPercent,
        saved: m.totalSavedTokens,
        baseline: m.totalBaselineTokens,
        used: m.totalTokens,
        latency: m.avgLatency,
        quality: m.avgQuality,
        samples: m.samples,
        failures: m.failures,
        best: m.bestOptimizer,
      })),
      byModelTask: benchmark.byModelTask.map((m) => ({
        label: m.key,
        taskType: m.secondary,
        savings: m.weightedSavingsPercent,
        saved: m.totalSavedTokens,
        baseline: m.totalBaselineTokens,
        used: m.totalTokens,
        best: m.bestOptimizer,
        samples: m.samples,
      })),
      quality: benchmark.rows
        .filter((r) => r.optimizer !== 'BASELINE')
        .map((r) => ({ label: `${r.taskId} ${r.optimizer}`, q: r.quality, lat: r.latencySeconds })),
      rows: benchmark.rows.map((r) => ({
        taskId: r.taskId,
        taskName: r.taskName,
        model: r.model,
        taskType: r.taskType,
        optimizer: r.optimizer,
        tokens: r.tokens,
        baseline: r.baselineTokens,
        saved: r.savingsTokens,
        savings: r.savingsPercent,
        latency: r.latencySeconds,
        quality: r.quality,
        failed: r.failed,
      })),
    },
  };

  const cal = report.confidenceCalibration;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KLIA Token Optimizer</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#1a1310;--bg2:#241a14;--panel:#241c17;--panel2:#2e241d;--line:#3d2f25;--text:#f5ece4;--muted:#b09a8a;--acc:#ff8a3d;--acc2:#ff5e13;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1100px 620px at 15% -12%,#3a2317 0%,#1a1310 58%);color:var(--text);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:1400px;margin:0 auto;padding:0 2rem 3rem}
header{padding:2.2rem 0 1.4rem;border-bottom:1px solid var(--line);margin-bottom:1.6rem;display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.9rem}
.logo{width:46px;height:46px;border-radius:13px;background:linear-gradient(135deg,#ff8a3d,#ff5e13);display:grid;place-items:center;font-weight:800;font-size:1.15rem;letter-spacing:-.5px;color:#2a1408;box-shadow:0 8px 26px rgba(255,110,40,.4)}
h1{margin:0;font-size:1.85rem;font-weight:800;letter-spacing:-.6px;color:#ff8a3d;text-shadow:0 0 26px rgba(255,120,40,.35)}
h1 span{background:linear-gradient(90deg,#ffb066,#ff5e13);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--muted);font-size:.9rem;margin-top:.15rem}
.hdr-right{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--text);padding:.45rem .9rem;border-radius:9px;cursor:pointer;font-size:.88rem;transition:.15s}
.btn:hover{background:var(--panel2);border-color:var(--acc)}
.btn.on{background:linear-gradient(135deg,#ff8a3d,#ff5e13);border-color:transparent;font-weight:600;color:#2a1408}
.tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1.4rem;background:var(--bg2);padding:.4rem;border-radius:12px;border:1px solid var(--line);width:fit-content;max-width:100%}
.tab{background:transparent;border:none;color:var(--muted);padding:.5rem 1.05rem;border-radius:9px;cursor:pointer;font-size:.9rem;font-weight:500;transition:.15s;white-space:nowrap}
.tab:hover{color:var(--text)}
.tab.active{background:linear-gradient(135deg,#ff8a3d,#ff5e13);color:#2a1408;box-shadow:0 4px 16px rgba(255,110,40,.32)}
section{display:none;animation:fade .25s ease}
section.active{display:block}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:1rem;margin-bottom:1.4rem}
.card{background:linear-gradient(160deg,var(--panel),var(--bg2));border:1px solid var(--line);border-radius:14px;padding:1.15rem 1.25rem;position:relative;overflow:hidden}
.card::after{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,#ff8a3d,transparent)}
.card h3{margin:0 0 .45rem;font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.09em;font-weight:600}
.card .v{font-size:1.75rem;font-weight:700;letter-spacing:-.6px;font-variant-numeric:tabular-nums}
.card .d{color:var(--muted);font-size:.8rem;margin-top:.25rem}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.muted{color:var(--muted)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:1.25rem;margin-bottom:1.3rem}
.panel h2{margin:0 0 .9rem;font-size:1.02rem;font-weight:600;display:flex;align-items:center;gap:.5rem}
.panel h2::before{content:"";width:3px;height:15px;border-radius:2px;background:linear-gradient(180deg,#ff8a3d,#ff5e13)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:1.3rem}
@media(max-width:960px){.cols{grid-template-columns:1fr}}
.chartbox{position:relative;height:290px}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th{color:var(--muted);text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.07em;font-weight:600;padding:.6rem .7rem;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel)}
td{padding:.55rem .7rem;border-bottom:1px solid rgba(61,47,37,.7)}
tbody tr:hover{background:rgba(255,138,61,.08)}
.num{text-align:right;font-variant-numeric:tabular-nums}
.scroll{max-height:520px;overflow:auto;border-radius:10px;border:1px solid var(--line)}
.pill{display:inline-block;padding:.12rem .55rem;border-radius:999px;background:var(--panel2);border:1px solid var(--line);font-size:.76rem;font-weight:600}
.p-ok{background:rgba(74,222,128,.13);color:var(--ok);border-color:rgba(74,222,128,.3)}
.p-bad{background:rgba(248,113,113,.13);color:var(--bad);border-color:rgba(248,113,113,.3)}
.p-neu{background:rgba(251,191,36,.13);color:var(--warn);border-color:rgba(251,191,36,.3)}
.star{color:#fbbf24}
pre{background:#140e0a;padding:1rem;border-radius:10px;overflow:auto;max-height:460px;font-size:.8rem;margin:0}
.legend{display:flex;gap:1.2rem;flex-wrap:wrap;color:var(--muted);font-size:.82rem;margin-top:.6rem}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:.35rem}
.empty{text-align:center;color:var(--muted);padding:2.5rem 1rem}
.metricrow{display:flex;justify-content:space-between;padding:.55rem 0;border-bottom:1px solid rgba(61,47,37,.8);font-size:.9rem}
.metricrow:last-child{border:none}
.bar{height:7px;border-radius:4px;background:linear-gradient(90deg,#ff8a3d,#ff5e13);margin-top:.35rem}
</style>
</head>
<body>
<div class="wrap">
<header>
  <div class="brand">
    <div class="logo">K</div>
    <div>
      <h1>KLIA <span>Token Optimizer</span></h1>
      <div class="sub">Router adaptativo · ${esc(new Date(summary.generatedAt).toLocaleString('es-ES'))}</div>
    </div>
  </div>
  <div class="hdr-right">
    <span class="pill">${num(summary.totalEvents)} eventos</span>
    <span class="pill p-ok">${num(summary.realCount)} reales</span>
    <span class="pill p-neu">${num(summary.syntheticCount)} sinteticos</span>
    <button class="btn" id="btnRefresh">Actualizar</button>
    <button class="btn on" id="btnAuto">Auto 30s</button>
  </div>
</header>

<div class="tabs">
  <button class="tab active" data-t="res">Resumen</button>
  <button class="tab" data-t="opt">Optimizadores</button>
  <button class="tab" data-t="mod">Modelos</button>
  <button class="tab" data-t="mt">Modelo + Tarea</button>
  <button class="tab" data-t="cal">Calibracion</button>
  <button class="tab" data-t="bench">Benchmark</button>
  <button class="tab" data-t="json">JSON</button>
</div>

<section id="s-res" class="active">
  <div class="grid">
    <div class="card"><h3>Tokens ahorrados</h3><div class="v ${summary.totalTokensSaved > 0 ? 'ok' : ''}">${num(Math.round(summary.totalTokensSaved))}</div><div class="d">frente a BASELINE</div></div>
    <div class="card"><h3>Ahorro ponderado</h3><div class="v">${summary.weightedSavingsPercent.toFixed(1)}%</div><div class="d">${esc(summary.savingsVerdict)}</div></div>
    <div class="card"><h3>USD ahorrado</h3><div class="v">$${summary.totalUsdSaved.toFixed(3)}</div><div class="d">coste estimado</div></div>
    <div class="card"><h3>Tokens totales</h3><div class="v">${num(summary.totalTokens)}</div><div class="d">${num(summary.totalExecutions)} ejecuciones</div></div>
    <div class="card"><h3>Decisiones</h3><div class="v">${num(summary.totalDecisions)}</div><div class="d">enrutadas por el router</div></div>
    <div class="card"><h3>Calidad media</h3><div class="v">${(summary.avgQuality * 100).toFixed(1)}%</div><div class="d">${summary.failureCount} fallo(s)</div></div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Ahorro por optimizador</h2><div class="chartbox"><canvas id="cOpt"></canvas></div></div>
    <div class="panel"><h2>Uso de optimizadores</h2><div class="chartbox"><canvas id="cDist"></canvas></div></div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Ahorro % por combinacion (top 15)</h2><div class="chartbox"><canvas id="cTop"></canvas></div></div>
    <div class="panel"><h2>Ahorro % por modelo</h2><div class="chartbox"><canvas id="cMod"></canvas></div></div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Ahorro % por tipo de tarea</h2><div class="chartbox"><canvas id="cTask2"></canvas></div></div>
    <div class="panel"><h2>Tokens ahorrados por optimizador</h2><div class="chartbox"><canvas id="cSaved"></canvas></div></div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Latencia vs calidad</h2><div class="chartbox"><canvas id="cScatter"></canvas></div></div>
    <div class="panel"><h2>Base vs consumido por optimizador</h2><div class="chartbox"><canvas id="cBase"></canvas></div></div>
  </div>
  <div class="panel">
    <h2>Resumen por optimizador</h2>
    ${
      charts.optTotals.length
        ? charts.optTotals
            .map(
              (o) =>
                `<div class="metricrow"><span><b>${esc(o.opt)}</b></span><span class="ok">${num(Math.round(o.saved))} tokens ahorrados</span></div>`,
            )
            .join('')
        : '<div class="empty">Sin datos de optimizadores</div>'
    }
  </div>
</section>

<section id="s-opt">
  <div class="panel">
    <h2>Ahorro por optimizador (detalle de ejecuciones)</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Caso</th><th>Tarea</th><th>Tipo</th><th>Optimizador</th><th class="num">Tokens</th><th class="num">BASELINE</th><th class="num">Ahorro %</th><th class="num">Ahorrados</th><th class="num">Latencia</th><th class="num">Calidad</th><th>Estado</th></tr></thead>
        <tbody>${optRows || '<tr><td colspan="11" class="empty">Sin datos</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="panel">
    <h2>Ahorro ponderado por optimizador</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Optimizador</th><th class="num">Muestras</th><th class="num">Ahorro %</th><th class="num">Tokens ahorrados</th><th class="num">Tokens usados</th><th class="num">Latencia media</th><th class="num">Calidad</th><th class="num">Fallos</th></tr></thead>
        <tbody>${
          benchmark.available
            ? benchmark.byOptimizer
                .map(
                  (o) =>
                    `<tr><td><b>${esc(o.optimizer)}</b></td><td class="num">${o.samples}</td>` +
                    `<td class="num ok">${o.weightedSavingsPercent.toFixed(1)}%</td>` +
                    `<td class="num">${num(Math.round(o.totalSavedTokens))}</td>` +
                    `<td class="num">${num(Math.round(o.totalTokens))}</td>` +
                    `<td class="num">${o.avgLatency.toFixed(1)}s</td>` +
                    `<td class="num">${o.avgQuality.toFixed(2)}</td>` +
                    `<td class="num ${o.failures > 0 ? 'bad' : 'ok'}">${o.failures}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="8" class="empty">Sin benchmark disponible</td></tr>'
        }</tbody>
      </table>
    </div>
  </div>
</section>

<section id="s-mod">
  <div class="panel">
    <h2>Por modelo</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Modelo</th><th class="num">Muestras</th><th class="num">Tokens</th><th class="num">Ahorro %</th><th class="num">Ahorrados</th><th>Mejor optimizador</th><th class="num">Latencia</th><th class="num">Calidad</th><th class="num">Fallos</th></tr></thead>
        <tbody>${modelRows || '<tr><td colspan="9" class="empty">Sin datos</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="panel"><h2>Ahorro % por modelo</h2><div class="chartbox"><canvas id="cMod2"></canvas></div></div>
</section>

<section id="s-mt">
  <div class="panel">
    <h2>Por modelo + tarea</h2>
    <div class="scroll">
      <table>
        <thead><tr><th>Modelo + Tarea</th><th>Tipo de tarea</th><th class="num">Muestras</th><th class="num">Ahorro %</th><th class="num">Ahorrados</th><th>Mejor optimizador</th></tr></thead>
        <tbody>${modelTaskRows || '<tr><td colspan="6" class="empty">Sin datos</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="panel"><h2>Ahorro % por tipo de tarea</h2><div class="chartbox"><canvas id="cTask"></canvas></div></div>
</section>

<section id="s-cal">
  <div class="cols">
    <div class="panel">
      <h2>Calibracion de confianza (router)</h2>
      <div class="metricrow"><span>Pares decision+ejecucion emparejados</span><b>${num(cal.pairsMatched)}</b></div>
      <div class="metricrow"><span>Confianza declarada media</span><b>${(cal.avgDeclaredConfidence * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Calidad real media</span><b>${(cal.avgActualQuality * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Tasa de fallo (confianza alta)</span><b class="${cal.failureRateHighConfidence > 0.1 ? 'warn' : 'ok'}">${(cal.failureRateHighConfidence * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Calibration score</span><b>${cal.calibrationScore.toFixed(3)}</b></div>
      <div class="metricrow"><span>Veredicto</span><b>${esc(cal.verdict)}</b></div>
      <div class="metricrow"><span>Nivel de confianza global</span><b>${esc(report.summary.confidenceLevel)}</b></div>
    </div>
    <div class="panel">
      <h2>Calibracion (benchmark)</h2>
      ${
        benchmark.calibration.pairsMatched > 0
          ? `<div class="metricrow"><span>Ejecuciones evaluadas</span><b>${num(benchmark.calibration.pairsMatched)}</b></div>
      <div class="metricrow"><span>Confianza declarada media</span><b>${(benchmark.calibration.avgDeclaredConfidence * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Calidad real media</span><b>${(benchmark.calibration.avgActualQuality * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Tasa de fallo (confianza alta)</span><b class="${benchmark.calibration.failureRateHighConfidence > 0.1 ? 'warn' : 'ok'}">${(benchmark.calibration.failureRateHighConfidence * 100).toFixed(1)}%</b></div>
      <div class="metricrow"><span>Calibration score</span><b>${benchmark.calibration.calibrationScore.toFixed(3)}</b></div>
      <div class="metricrow"><span>Veredicto</span><b>${esc(benchmark.calibration.verdict)}</b></div>`
          : '<div class="empty">Sin datos de confianza en el benchmark</div>'
      }
    </div>
  </div>
  ${
    benchmark.calibration.byOptimizer.length > 0
      ? `<div class="panel">
    <h2>Calibracion por optimizador</h2>
    <div class="scroll"><table>
      <thead><tr><th>Optimizador</th><th class="num">Muestras</th><th class="num">Confianza declarada</th><th class="num">Calidad real</th><th class="num">Desviacion</th><th class="num">Tasa de fallo</th></tr></thead>
      <tbody>${benchmark.calibration.byOptimizer
        .map(
          (o) =>
            `<tr><td><b>${esc(o.optimizer)}</b></td><td class="num">${o.samples}</td>` +
            `<td class="num">${(o.avgDeclaredConfidence * 100).toFixed(1)}%</td>` +
            `<td class="num">${(o.avgActualQuality * 100).toFixed(1)}%</td>` +
            `<td class="num ${Math.abs(o.gap) > 0.1 ? 'warn' : 'ok'}">${(o.gap * 100).toFixed(1)} pp</td>` +
            `<td class="num ${o.failureRate > 0 ? 'bad' : 'ok'}">${(o.failureRate * 100).toFixed(1)}%</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </div>`
      : ''
  }
  <div class="panel">
    <h2>Cobertura de datos</h2>
    <div class="metricrow"><span>Store de eventos</span><b class="muted">${esc(data.eventsPath ?? '-')}</b></div>
    <div class="metricrow"><span>Store de benchmark</span><b class="muted">${esc(benchmark.sourcePath ?? '-')}</b></div>
    <div class="metricrow"><span>Eventos totales</span><b>${num(summary.totalEvents)}</b></div>
    <div class="metricrow"><span>Decisiones totales</span><b>${num(summary.totalDecisions)}</b></div>
    <div class="metricrow"><span>Ejecuciones totales</span><b>${num(summary.totalExecutions)}</b></div>
    <div class="metricrow"><span>Datos reales</span><b class="ok">${num(report.summary.realCount)}</b></div>
    <div class="metricrow"><span>Datos sinteticos</span><b class="warn">${num(report.summary.syntheticCount)}</b></div>
    <div class="metricrow"><span>Decisiones emparejadas</span><b>${num(report.summary.matchedDecisions)}</b></div>
    <div class="metricrow"><span>Decisiones huerfanas</span><b>${num(report.summary.orphanDecisions)}</b></div>
    <div class="metricrow"><span>Modelos con datos</span><b>${num(report.summary.uniqueModels.length)}</b></div>
    <div class="metricrow"><span>Tipos de tarea</span><b>${num(report.summary.uniqueTaskTypes.length)}</b></div>
  </div>
</section>

<section id="s-bench">
  ${
    benchmark.available
      ? `<div class="grid">
    <div class="card"><h3>Tokens ahorrados (benchmark)</h3><div class="v ok">${num(Math.round(benchmark.totalSavedTokens))}</div><div class="d">frente a BASELINE</div></div>
    <div class="card"><h3>Ahorro ponderado</h3><div class="v">${benchmark.weightedSavingsPercent.toFixed(1)}%</div><div class="d">${num(benchmark.tasks)} tareas evaluadas</div></div>
    <div class="card"><h3>Tokens consumidos</h3><div class="v">${num(Math.round(benchmark.totalTokens))}</div><div class="d">base equivalente ${num(Math.round(benchmark.totalBaselineTokens))}</div></div>
    <div class="card"><h3>Optimizadores</h3><div class="v">${benchmark.byOptimizer.length}</div><div class="d">comparados con BASELINE</div></div>
  </div>
  <div class="cols">
    <div class="panel"><h2>Ahorro por optimizador (ponderado)</h2><div class="chartbox"><canvas id="cBench"></canvas></div></div>
    <div class="panel"><h2>Tokens: base vs consumidos</h2><div class="chartbox"><canvas id="cBenchTok"></canvas></div></div>
  </div>
  <div class="panel">
    <h2>Detalle por optimizador</h2>
    <div class="scroll"><table>
      <thead><tr><th>Optimizador</th><th class="num">Muestras</th><th class="num">Ahorro %</th><th class="num">Tokens ahorrados</th><th class="num">Tokens usados</th><th class="num">Latencia media</th><th class="num">Calidad</th><th class="num">Fallos</th></tr></thead>
      <tbody>${
        benchmark.byOptimizer
          .map(
            (o) =>
              `<tr><td><b>${esc(o.optimizer)}</b></td><td class="num">${o.samples}</td>` +
              `<td class="num ok">${o.weightedSavingsPercent.toFixed(1)}%</td>` +
              `<td class="num">${num(Math.round(o.totalSavedTokens))}</td>` +
              `<td class="num">${num(Math.round(o.totalTokens))}</td>` +
              `<td class="num">${o.avgLatency.toFixed(1)}s</td>` +
              `<td class="num">${o.avgQuality.toFixed(2)}</td>` +
              `<td class="num ${o.failures > 0 ? 'bad' : 'ok'}">${o.failures}</td></tr>`,
          )
          .join('')
      }</tbody>
    </table></div>
  </div>
  <div class="panel">
    <h2>Detalle por tarea (${num(benchmark.rows.length)} ejecuciones)</h2>
    <div class="scroll"><table>
      <thead><tr><th>Caso</th><th>Tarea</th><th>Modelo</th><th>Optimizador</th><th class="num">Tokens</th><th class="num">BASELINE</th><th class="num">Ahorro %</th><th class="num">Latencia</th><th class="num">Calidad</th><th>Estado</th></tr></thead>
      <tbody>${
        benchmark.rows
          .map(
            (r) =>
              `<tr><td>${esc(r.taskId)}</td><td>${esc(r.taskName)}</td><td>${esc(r.model)}</td>` +
              `<td><b>${esc(r.optimizer)}</b></td><td class="num">${num(Math.round(r.tokens))}</td>` +
              `<td class="num muted">${num(Math.round(r.baselineTokens))}</td>` +
              `<td class="num ${r.savingsPercent > 0 ? 'ok' : r.savingsPercent < 0 ? 'bad' : ''}">${r.savingsPercent.toFixed(1)}%</td>` +
              `<td class="num">${r.latencySeconds.toFixed(1)}s</td><td class="num">${r.quality.toFixed(2)}</td>` +
              `<td>${r.failed ? '<span class="pill p-bad">fallo</span>' : '<span class="pill p-ok">ok</span>'}</td></tr>`,
          )
          .join('')
      }</tbody>
    </table></div>
  </div>`
      : `<div class="panel"><div class="empty">No se encontro ningun benchmark.<br><span class="muted">Genera uno con <b>node dist/scripts/benchmark-runner.js 10</b> o define <b>--benchmark</b> en el comando.</span></div></div>`
  }
</section>

<section id="s-json">
  <div class="panel"><h2>RouterStatsReport</h2><pre>${esc(JSON.stringify(report, null, 2))}</pre></div>
  <div class="panel"><h2>Summary</h2><pre>${esc(JSON.stringify(summary, null, 2))}</pre></div>
</section>
</div>

<script>
const D=${JSON.stringify(charts).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')};
const COLORS=${JSON.stringify(CHART_COLORS)};
const AX={grid:{color:'rgba(61,47,37,.75)'},ticks:{color:'#b09a8a',font:{size:11}}};
const LEG={labels:{color:'#b09a8a',font:{size:11},usePointStyle:true}};

document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('s-'+t.dataset.t).classList.add('active');
});

new Chart(document.getElementById('cOpt'),{
  type:'bar',
  data:{labels:D.optTotals.map(o=>o.opt),datasets:[
    {label:'Tokens ahorrados',data:D.optTotals.map(o=>Math.round(o.saved)),backgroundColor:'#4f8cff',borderRadius:6},
    {label:'Tokens base (equivalentes)',data:D.optTotals.map(o=>Math.round(o.base)),backgroundColor:'rgba(139,154,179,.28)',borderRadius:6}
  ]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,stacked:false}}}
});

new Chart(document.getElementById('cDist'),{
  type:'doughnut',
  data:{labels:D.optDist.map(o=>o.opt),datasets:[{data:D.optDist.map(o=>o.count),backgroundColor:COLORS,borderColor:'#111827',borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{...LEG,position:'right'}}}
});

new Chart(document.getElementById('cTop'),{
  type:'bar',
  data:{labels:D.topOpts.map(o=>o.label),datasets:[{label:'Ahorro %',data:D.topOpts.map(o=>o.savings),backgroundColor:'#22d3a7',borderRadius:6}]},
  options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:LEG},scales:{x:{...AX,beginAtZero:true},y:AX}}
});

new Chart(document.getElementById('cMod'),{
  type:'bar',
  data:{labels:D.byModel.map(m=>m.model),datasets:[
    {label:'Ahorro %',data:D.byModel.map(m=>m.savings),backgroundColor:'#a78bfa',borderRadius:6},
    {label:'Tokens medios (k)',data:D.byModel.map(m=>Math.round(m.tokens/1000)),backgroundColor:'rgba(255,138,61,.45)',borderRadius:6,yAxisID:'y2'}
  ]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true},y2:{position:'right',...AX,grid:{display:false},beginAtZero:true}}}
});

if(D.bench.byOptimizer.length){
  new Chart(document.getElementById('cBench'),{
    type:'bar',
    data:{labels:D.bench.byOptimizer.map(o=>o.optimizer),datasets:[{label:'Ahorro %',data:D.bench.byOptimizer.map(o=>o.savings),backgroundColor:'#ff8a3d',borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true}}}
  });
  new Chart(document.getElementById('cBenchTok'),{
    type:'bar',
    data:{labels:D.bench.byOptimizer.map(o=>o.optimizer),datasets:[
      {label:'Tokens base (BASELINE)',data:D.bench.byOptimizer.map(o=>Math.round(o.baseline)),backgroundColor:'rgba(176,154,138,.35)',borderRadius:6},
      {label:'Tokens consumidos',data:D.bench.byOptimizer.map(o=>Math.round(o.used)),backgroundColor:'#22d3a7',borderRadius:6}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true}}}
  });
}

if(D.bench.byTaskType.length){
  new Chart(document.getElementById('cTask'),{
    type:'bar',
    data:{labels:D.bench.byTaskType.map(t=>t.taskType),datasets:[
      {label:'Ahorro %',data:D.bench.byTaskType.map(t=>t.savings),backgroundColor:'#fbbf24',borderRadius:6},
      {label:'Tokens ahorrados (k)',data:D.bench.byTaskType.map(t=>Math.round(t.saved/1000)),backgroundColor:'rgba(255,138,61,.5)',borderRadius:6,yAxisID:'y2'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true},y2:{position:'right',...AX,grid:{display:false},beginAtZero:true}}}
  });
  new Chart(document.getElementById('cTask2'),{
    type:'bar',
    data:{labels:D.bench.byTaskType.map(t=>t.taskType),datasets:[{label:'Ahorro %',data:D.bench.byTaskType.map(t=>t.savings),backgroundColor:'#fbbf24',borderRadius:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true}}}
  });
}

if(D.bench.byModel.length){
  new Chart(document.getElementById('cMod2'),{
    type:'bar',
    data:{labels:D.bench.byModel.map(m=>m.model),datasets:[
      {label:'Ahorro %',data:D.bench.byModel.map(m=>m.savings),backgroundColor:'#a78bfa',borderRadius:6},
      {label:'Tokens ahorrados (k)',data:D.bench.byModel.map(m=>Math.round(m.saved/1000)),backgroundColor:'rgba(255,138,61,.5)',borderRadius:6,yAxisID:'y2'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true},y2:{position:'right',...AX,grid:{display:false},beginAtZero:true}}}
  });
}

new Chart(document.getElementById('cSaved'),{
  type:'bar',
  data:{labels:D.optTotals.map(o=>o.opt),datasets:[{label:'Tokens ahorrados',data:D.optTotals.map(o=>Math.round(o.saved)),backgroundColor:'#22d3a7',borderRadius:6}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true}}}
});

new Chart(document.getElementById('cBase'),{
  type:'bar',
  data:{labels:D.optTotals.map(o=>o.opt),datasets:[
    {label:'Tokens base (BASELINE)',data:D.optTotals.map(o=>Math.round(o.base)),backgroundColor:'rgba(176,154,138,.35)',borderRadius:6},
    {label:'Tokens consumidos',data:D.optTotals.map(o=>Math.round(o.base-o.saved)),backgroundColor:'#ff8a3d',borderRadius:6}
  ]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG},scales:{x:AX,y:{...AX,beginAtZero:true}}}
});

new Chart(document.getElementById('cScatter'),{
  type:'scatter',
  data:{datasets:[{label:'Ejecuciones',data:D.bench.quality.map(q=>({x:q.lat,y:q.q})),backgroundColor:'#ff8a3d',pointRadius:6,pointHoverRadius:8}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:LEG,tooltip:{callbacks:{label:c=>'lat '+c.parsed.x+'s / calidad '+c.parsed.y}}},scales:{x:{...AX,title:{display:true,text:'Latencia (s)',color:'#b09a8a'}},y:{...AX,min:0,max:1,title:{display:true,text:'Calidad',color:'#b09a8a'}}}}
});

let auto=true,tmr=null;
const btnAuto=document.getElementById('btnAuto');
btnAuto.onclick=()=>{
  auto=!auto;
  btnAuto.classList.toggle('on',auto);
  btnAuto.textContent='Auto '+(auto?'30s':'off');
  if(tmr)clearInterval(tmr);
  if(auto)tmr=setInterval(()=>location.reload(),30000);
};
document.getElementById('btnRefresh').onclick=()=>location.reload();
if(auto)tmr=setInterval(()=>location.reload(),30000);
</script>
</body>
</html>`;
}

export function startWebDashboard(opts: WebDashboardOptions = {}): http.Server {
  const port = opts.port ?? 6283;
  const host = opts.host ?? '127.0.0.1';
  const eventsPath = opts.eventsPath ?? getDefaultEventsPath();
  const benchmarkPath = opts.benchmarkPath;

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/api/report') {
      try {
        const data = buildDashboardReport(eventsPath, benchmarkPath);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    if (url === '/api/stats') {
      try {
        const data = buildDashboardReport(eventsPath, benchmarkPath);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data.summary));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    if (url === '/api/health') {
      try {
        const data = buildDashboardReport(eventsPath, benchmarkPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: data.summary.totalEvents > 0 ? 'OK' : 'WARN',
            eventsCount: data.summary.totalEvents,
            uptime: process.uptime(),
          }),
        );
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'WARN', eventsCount: 0, uptime: process.uptime() }));
      }
      return;
    }

    if (url === '/api/shutdown' && req.method === 'POST' && opts.enableShutdown) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'shutting down' }));
      server.close();
      return;
    }

    try {
      const data = buildDashboardReport(eventsPath, benchmarkPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashboardHtml(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error cargando dashboard: ' + (e as Error).message);
    }
  });

  server.listen(port, host, () => {
    console.log(`[Klia Dashboard] http://${host}:${port}`);
  });

  return server;
}
