'use strict';

const state = {
  components: [], wires: [], nextId: 1, selectedId: null,
  placingType: null, wireStart: null, mode: 'idle',
  sim: { running: false, paused: false, t: 0, phase: 'idle', V0: 0, speed: 1 },
  history: { t: [], vc: [], i: [], q: [], vcCharge: [], vcDischarge: [], phase: [] },
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('circuit-svg');
const wiresLayer = document.getElementById('wires-layer');
const particlesLayer = document.getElementById('particles-layer');
const compsLayer = document.getElementById('components-layer');
const instLayer = document.getElementById('instruments-layer');

function el(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function $(id) { return document.getElementById(id); }
function fmt(value, unit, decimals = 3) { return !isFinite(value) ? '—' : value.toFixed(decimals) + ' ' + unit; }
function engFormat(value, baseUnit) {
  const abs = Math.abs(value);
  if (abs === 0 || abs < 1e-12) return '0.00 ' + baseUnit; 
  if (abs >= 1) return value.toFixed(3) + ' ' + baseUnit;
  if (abs >= 1e-3) return (value * 1e3).toFixed(2) + ' m' + baseUnit;
  if (abs >= 1e-6) return (value * 1e6).toFixed(2) + ' µ' + baseUnit;
  if (abs >= 1e-9) return (value * 1e9).toFixed(2) + ' n' + baseUnit;
  return value.toExponential(2) + ' ' + baseUnit;
}

const COMPONENTS = {
  source:     { label: 'Fuente DC',    w: 60, h: 60, terminals: [{x:0,y:-30},{x:0,y:30}], value: 10, unit: 'V', editable: 'value' },
  resistor:   { label: 'Resistencia',  w: 60, h: 30, terminals: [{x:-30,y:0},{x:30,y:0}], value: 1000, unit: 'Ω', editable: 'value' },
  capacitor:  { label: 'Condensador',  w: 60, h: 40, terminals: [{x:-30,y:0},{x:30,y:0}], value: 1e-6, unit: 'F', editable: 'value' },
  switch:     { label: 'Interruptor',  w: 60, h: 30, terminals: [{x:-30,y:0},{x:30,y:0}], closed: false, editable: 'switch' },
  ground:     { label: 'Tierra',       w: 40, h: 40, terminals: [{x:0,y:-20}], editable: null },
  ammeter:    { label: 'Amperímetro',  w: 60, h: 50, terminals: [{x:-30,y:0},{x:30,y:0}], editable: null },
  voltmeter:  { label: 'Voltímetro',   w: 60, h: 50, terminals: [{x:-30,y:0},{x:30,y:0}], editable: null },
};

function renderComponent(c) {
  const meta = COMPONENTS[c.type];
  const g = el('g', { class: 'svg-component' + (state.selectedId === c.id ? ' selected' : ''), 'data-id': c.id, transform: `translate(${c.x},${c.y})` });
  g.addEventListener('mousedown', (e) => onComponentMouseDown(e, c));

  if (c.type === 'ammeter' || c.type === 'voltmeter') {
    const isAmp = c.type === 'ammeter';
    const color = isAmp ? '#ffb84d' : '#7cc7ff';
    const label = isAmp ? 'A' : 'V';
    const bg = isAmp ? '#2a1f0a' : '#0a1a2a';
    
    el('rect', { class:'comp-body', x:-30, y:-25, width:60, height:50, rx:6, fill:'#1a2233', stroke:'#3a5570', 'stroke-width':2, filter:'url(#shadow)' }, g);
    el('rect', { x:-24, y:-18, width:48, height:22, rx:3, fill:bg, stroke:color, 'stroke-width':1 }, g);
    el('text', { x:-20, y:-5, 'text-anchor':'start', fill:color, 'font-size':12, 'font-weight':700 }, g).textContent = label;
    
    const valText = el('text', { class:'lcd-value', x:5, y:-3, 'text-anchor':'middle', fill:color, 'font-size':13, 'font-family':'monospace', 'font-weight':'bold' }, g);
    valText.textContent = '0.00';
    
    meta.terminals.forEach((t, i) => {
      el('circle', { class:'terminal', cx:t.x, cy:t.y, r:5, 'data-comp':c.id, 'data-term':i }, g).addEventListener('mousedown', (e) => onTerminalMouseDown(e, c, i));
    });
    c._lcdText = valText;
    return g;
  }

  switch (c.type) {
    case 'source':
      el('circle', { class:'comp-body', cx:0, cy:0, r:26, fill:'rgba(63,208,201,0.08)', stroke:'#3fd0c9', 'stroke-width':2.2 }, g);
      el('line', { x1:-10,y1:0,x2:10,y2:0, stroke:'#3fd0c9','stroke-width':2 }, g);
      el('line', { x1:0,y1:-10,x2:0,y2:10, stroke:'#3fd0c9','stroke-width':2 }, g);
      el('text', { x:0, y:-34, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':11 }, g).textContent = (c.value ?? 0).toFixed(2) + ' V';
      break;
    case 'resistor':
      el('rect', { class:'comp-body', x:-30,y:-15,width:60,height:30, fill:'rgba(240,180,41,0.06)', stroke:'#f0b429','stroke-width':2.2, rx:4 }, g);
      el('line', { x1:-38,y1:0,x2:-30,y2:0, stroke:'#f0b429','stroke-width':2 }, g);
      el('line', { x1:30,y1:0,x2:38,y2:0, stroke:'#f0b429','stroke-width':2 }, g);
      el('text', { x:0, y:-20, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':11 }, g).textContent = c.value >= 1e6 ? (c.value/1e6).toFixed(2)+' MΩ' : c.value >= 1e3 ? (c.value/1e3).toFixed(2)+' kΩ' : c.value.toFixed(0)+' Ω';
      break;
    case 'capacitor':
      el('line', { x1:-30,y1:0,x2:-6,y2:0, stroke:'#7c5cff','stroke-width':2 }, g);
      el('line', { x1:6,y1:0,x2:30,y2:0, stroke:'#7c5cff','stroke-width':2 }, g);
      el('line', { class:'comp-body', x1:-6,y1:-18,x2:-6,y2:18, stroke:'#7c5cff','stroke-width':3 }, g);
      el('line', { class:'comp-body', x1:6,y1:-18,x2:6,y2:18, stroke:'#7c5cff','stroke-width':3 }, g);
      el('text', { x:0, y:-24, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':11 }, g).textContent = c.value >= 1e-6 ? (c.value*1e6).toFixed(2)+' µF' : (c.value*1e9).toFixed(2)+' nF';
      break;
    case 'switch':
      el('line', { x1:-38,y1:0,x2:-18,y2:0, stroke:'#34d399','stroke-width':2 }, g);
      el('line', { x1:18,y1:0,x2:38,y2:0, stroke:'#34d399','stroke-width':2 }, g);
      el('circle', { cx:-18, cy:0, r:3, fill:'#34d399' }, g);
      el('circle', { cx:18, cy:0, r:3, fill:'#34d399' }, g);
      if (c.closed) el('line', { class:'comp-body switch-closed', x1:-18,y1:0,x2:18,y2:0, stroke:'#3fd0c9','stroke-width':2.6 }, g);
      else el('line', { class:'comp-body switch-open', x1:-18,y1:0,x2:14,y2:-14, stroke:'#ef5b6b','stroke-width':2.6 }, g);
      break;
    case 'ground':
      el('line', { x1:0,y1:-20,x2:0,y2:0, stroke:'#93a6bd','stroke-width':2 }, g);
      el('line', { class:'comp-body', x1:-16,y1:0,x2:16,y2:0, stroke:'#93a6bd','stroke-width':2.2 }, g);
      el('line', { x1:-10,y1:6,x2:10,y2:6, stroke:'#93a6bd','stroke-width':2.2 }, g);
      el('line', { x1:-4,y1:12,x2:4,y2:12, stroke:'#93a6bd','stroke-width':2.2 }, g);
      break;
  }
  meta.terminals.forEach((t, i) => {
    el('circle', { class:'terminal', cx:t.x, cy:t.y, r:5, 'data-comp':c.id, 'data-term':i }, g).addEventListener('mousedown', (e) => onTerminalMouseDown(e, c, i));
  });
  return g;
}

function renderAll() {
  wiresLayer.innerHTML = ''; compsLayer.innerHTML = ''; instLayer.innerHTML = '';
  state.wires.forEach(w => {
    const a = getTerminalPos(w.a.compId, w.a.termIdx);
    const b = getTerminalPos(w.b.compId, w.b.termIdx);
    if (a && b) el('path', { class: 'wire-path', 'data-wire': w.id, d: `M ${a.x} ${a.y} L ${b.x} ${b.y}` }, wiresLayer);
  });
  state.components.forEach(c => compsLayer.appendChild(renderComponent(c)));
  if (state.wireStart) {
    const p = getTerminalPos(state.wireStart.compId, state.wireStart.termIdx);
    if (p) el('circle', { cx:p.x, cy:p.y, r:6, fill:'#f0b429', opacity:0.8 }, instLayer);
  }
  updateSelInfo(); updateMeasurements();
}

function getTerminalPos(compId, termIdx) {
  const c = state.components.find(x => x.id === compId);
  if (!c) return null;
  const t = COMPONENTS[c.type].terminals[termIdx];
  return t ? { x: c.x + t.x, y: c.y + t.y } : null;
}

let drag = null;
function svgPoint(evt) {
  const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function onComponentMouseDown(e, c) {
  e.stopPropagation();
  if (state.mode === 'wire') return;
  state.selectedId = c.id;
  const p = svgPoint(e);
  drag = { id: c.id, dx: c.x - p.x, dy: c.y - p.y };
  renderAll(); showProperties(c);
}

function onTerminalMouseDown(e, c, termIdx) {
  e.stopPropagation();
  if (state.mode !== 'wire') return;
  if (!state.wireStart) {
    state.wireStart = { compId: c.id, termIdx }; renderAll();
  } else {
    if (state.wireStart.compId === c.id && state.wireStart.termIdx === termIdx) { state.wireStart = null; renderAll(); return; }
    const exists = state.wires.some(w => (w.a.compId === state.wireStart.compId && w.a.termIdx === state.wireStart.termIdx && w.b.compId === c.id && w.b.termIdx === termIdx) || (w.b.compId === state.wireStart.compId && w.b.termIdx === state.wireStart.termIdx && w.a.compId === c.id && w.a.termIdx === termIdx));
    if (!exists) state.wires.push({ id: state.nextId++, a: { ...state.wireStart }, b: { compId: c.id, termIdx } });
    state.wireStart = null; renderAll();
  }
}

svg.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const p = svgPoint(e);
  const c = state.components.find(x => x.id === drag.id);
  if (c) { c.x = Math.round(p.x + drag.dx); c.y = Math.round(p.y + drag.dy); renderAll(); }
});
svg.addEventListener('mouseup', () => { drag = null; });
svg.addEventListener('click', (e) => {
  if (state.mode === 'place' && state.placingType) {
    const p = svgPoint(e);
    const meta = COMPONENTS[state.placingType];
    const comp = { id: state.nextId++, type: state.placingType, x: Math.round(p.x), y: Math.round(p.y), value: meta.value ?? undefined, closed: meta.closed ?? undefined };
    state.components.push(comp);
    state.selectedId = comp.id; state.mode = 'idle'; state.placingType = null;
    document.querySelectorAll('.comp-btn').forEach(b => b.classList.remove('active'));
    renderAll(); showProperties(comp);
  } else { state.selectedId = null; hideProperties(); renderAll(); }
});

const propsPanel = document.createElement('div');
propsPanel.className = 'props-panel'; propsPanel.id = 'props-panel';
document.querySelector('.panel-controls').appendChild(propsPanel);
function hideProperties() { propsPanel.classList.remove('visible'); propsPanel.innerHTML = ''; }

function showProperties(c) {
  const meta = COMPONENTS[c.type];
  propsPanel.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = meta.label; propsPanel.appendChild(h);

  if (c.type === 'source') addNumberInput('Voltaje (V)', c.value, (v) => { c.value = Math.max(0.1, v); renderAll(); });
  else if (c.type === 'resistor') addNumberInput('Resistencia (Ω)', c.value, (v) => { c.value = Math.max(1, v); renderAll(); });
  else if (c.type === 'capacitor') {
    const currentUnit = c.value >= 1e-6 ? 'µF' : c.value >= 1e-9 ? 'nF' : 'F';
    const displayVal = currentUnit === 'µF' ? c.value*1e6 : currentUnit === 'nF' ? c.value*1e9 : c.value;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.innerHTML = `<label>Capacitancia</label>`;
    const inp = document.createElement('input'); inp.type = 'number'; inp.value = displayVal; inp.step = 'any'; inp.min = '0.001';
    const sel = document.createElement('select');
    ['F','µF','nF'].forEach(u => { const o = document.createElement('option'); o.value = u; o.textContent = u; if (u===currentUnit) o.selected = true; sel.appendChild(o); });
    const apply = document.createElement('button'); apply.className = 'btn btn-primary btn-block'; apply.textContent = 'Aplicar';
    apply.onclick = () => { let v = parseFloat(inp.value); if (!isFinite(v) || v <= 0) return; if (sel.value === 'µF') v *= 1e-6; else if (sel.value === 'nF') v *= 1e-9; c.value = v; renderAll(); };
    row.appendChild(inp); row.appendChild(sel); row.appendChild(apply); propsPanel.appendChild(row);
  } else if (c.type === 'switch') {
    const row = document.createElement('div'); row.className = 'prop-row';
    row.innerHTML = `<label>Estado</label>`;
    const sel = document.createElement('select');
    ['Abierto','Cerrado'].forEach((u,i) => { const o = document.createElement('option'); o.value = i; o.textContent = u; if ((i===1) === c.closed) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => { c.closed = sel.value === '1'; renderAll(); };
    row.appendChild(sel); propsPanel.appendChild(row);
  } else {
    const p = document.createElement('p'); p.style.fontSize='0.75rem'; p.style.color='var(--text-dim)';
    p.textContent = 'Este componente no tiene parámetros editables.';
    propsPanel.appendChild(p);
  }
  propsPanel.classList.add('visible');
}

function addNumberInput(labelText, value, onChange) {
  const row = document.createElement('div'); row.className = 'prop-row';
  row.innerHTML = `<label>${labelText}</label>`;
  const inp = document.createElement('input'); inp.type = 'number'; inp.value = value; inp.step = 'any'; inp.min = '0';
  const btn = document.createElement('button'); btn.className = 'btn btn-primary btn-block'; btn.textContent = 'Aplicar';
  btn.onclick = () => { const v = parseFloat(inp.value); if (isFinite(v)) onChange(v); };
  row.appendChild(inp); row.appendChild(btn); propsPanel.appendChild(row);
}

document.querySelectorAll('.comp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.comp;
    if (type === 'wire') { state.mode = 'wire'; state.placingType = null; }
    else { state.mode = 'place'; state.placingType = type; state.wireStart = null; }
    document.querySelectorAll('.comp-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

$('btn-delete').addEventListener('click', () => {
  if (!state.selectedId) return;
  const id = state.selectedId;
  state.components = state.components.filter(c => c.id !== id);
  state.wires = state.wires.filter(w => w.a.compId !== id && w.b.compId !== id);
  state.selectedId = null; hideProperties(); renderAll();
});
$('btn-clear').addEventListener('click', () => {
  state.components = []; state.wires = []; state.selectedId = null; state.wireStart = null;
  state.mode = 'idle'; state.placingType = null;
  document.querySelectorAll('.comp-btn').forEach(b => b.classList.remove('active'));
  hideProperties(); resetSimulation(); renderAll();
});
$('grid-toggle').addEventListener('change', (e) => { document.getElementById('grid-bg').style.display = e.target.checked ? '' : 'none'; });

function analyzeCircuit() {
  const source = state.components.find(c => c.type === 'source');
  const resistors = state.components.filter(c => c.type === 'resistor');
  const capacitors = state.components.filter(c => c.type === 'capacitor');
  const switches = state.components.filter(c => c.type === 'switch');
  if (!source || resistors.length === 0 || capacitors.length === 0) return { valid: false, reason: 'Se requiere una fuente, al menos una resistencia y un condensador.' };
  const R = resistors.reduce((s, r) => s + r.value, 0);
  const C = capacitors.reduce((s, c) => s + c.value, 0);
  if (R <= 0 || C <= 0) return { valid: false, reason: 'R y C deben ser mayores que cero.' };
  return { valid: true, R, C, V: source.value, tau: R * C, openSwitch: switches.some(s => !s.closed) };
}

function resetSimulation() {
  state.sim.running = false; state.sim.paused = false; state.sim.t = 0;
  state.sim.phase = 'idle'; state.sim.V0 = 0;
  state.history = { t: [], vc: [], i: [], q: [], vcCharge: [], vcDischarge: [], phase: [] };
  updateMeasurements(); drawAllCharts(); updateButtonStates();
}
function startSimulation() {
  const a = analyzeCircuit(); if (!a.valid) { showWarning(a.reason); return; }
  showWarning('Simulación en marcha.', true);
  state.sim.running = true; state.sim.paused = false; updateButtonStates();
}
function pauseSimulation() { state.sim.paused = true; updateButtonStates(); }
function resumeSimulation() { if (state.sim.running) { state.sim.paused = false; updateButtonStates(); } }
function chargeCapacitor() {
  const a = analyzeCircuit(); if (!a.valid) { showWarning(a.reason); return; }
  if (a.openSwitch) { showWarning('El interruptor está abierto: ciérralo para cargar.'); return; }
  state.sim.phase = 'charge'; state.sim.t = 0; state.sim.V0 = 0;
  state.sim.running = true; state.sim.paused = false;
  state.history = { t: [], vc: [], i: [], q: [], vcCharge: [], vcDischarge: [], phase: [] };
  updateButtonStates();
}
function dischargeCapacitor() {
  const a = analyzeCircuit(); if (!a.valid) { showWarning(a.reason); return; }
  const lastVc = state.history.vc.length ? state.history.vc[state.history.vc.length - 1] : a.V;
  state.sim.phase = 'discharge'; state.sim.t = 0; state.sim.V0 = lastVc;
  state.sim.running = true; state.sim.paused = false;
  state.history.vcCharge = state.history.vc.slice();
  state.history.t = []; state.history.vc = []; state.history.i = []; state.history.q = [];
  updateButtonStates();
}

let lastTs = null; const TAU_MAX = 60;
function step(ts) {
  if (!lastTs) lastTs = ts;
  let dt = (ts - lastTs) / 1000; lastTs = ts;
  dt = Math.min(dt, 0.1) * state.sim.speed;
  if (state.sim.running && !state.sim.paused) {
    const a = analyzeCircuit();
    if (a.valid) {
      const tau = a.tau; const t = state.sim.t + dt; state.sim.t = t;
      let vc, i, q;
      if (state.sim.phase === 'charge') { vc = a.V * (1 - Math.exp(-t / tau)); i = (a.V / a.R) * Math.exp(-t / tau); q = a.C * vc; }
      else if (state.sim.phase === 'discharge') { vc = state.sim.V0 * Math.exp(-t / tau); i = -(state.sim.V0 / a.R) * Math.exp(-t / tau); q = a.C * vc; }
      else { vc = 0; i = 0; q = 0; }
      state.history.t.push(t); state.history.vc.push(vc); state.history.i.push(i); state.history.q.push(q); state.history.phase.push(state.sim.phase);
      const MAX = 4000;
      if (state.history.t.length > MAX) { for (const k of ['t','vc','i','q','phase']) state.history[k].shift(); }
      if (t > TAU_MAX) state.sim.running = false;
    }
  }
  updateMeasurements(); drawAllCharts(); drawElectrons();
  
  const currentI = state.history.i.length ? state.history.i[state.history.i.length - 1] : 0;
  const currentVc = state.history.vc.length ? state.history.vc[state.history.vc.length - 1] : 0;
  
  state.components.forEach(c => {
    if (c.type === 'ammeter' && c._lcdText) { 
      c._lcdText.textContent = engFormat(Math.abs(currentI), 'A'); 
    }
    if (c.type === 'voltmeter' && c._lcdText) { 
      c._lcdText.textContent = fmt(currentVc, 'V', 2); 
    }
  });
  requestAnimationFrame(step);
}

function updateMeasurements() {
  const a = analyzeCircuit(); const t = state.sim.t;
  const vc = state.history.vc.length ? state.history.vc[state.history.vc.length - 1] : 0;
  const i  = state.history.i.length  ? state.history.i[state.history.i.length - 1]  : 0;
  const q  = state.history.q.length  ? state.history.q[state.history.q.length - 1]  : 0;
  $('m-time').textContent = fmt(t, 's', 3); $('m-vsource').textContent = a.valid ? fmt(a.V, 'V', 2) : '—';
  $('m-vc').textContent = fmt(vc, 'V', 3); $('m-i').textContent = engFormat(i, 'A');
  $('m-q').textContent = engFormat(q, 'C'); $('m-tau').textContent = a.valid ? engFormat(a.tau, 's') : '—';
}

function updateSelInfo() {
  const info = $('sel-info');
  if (!state.selectedId) { info.textContent = 'Nada seleccionado'; return; }
  const c = state.components.find(x => x.id === state.selectedId);
  info.textContent = c ? COMPONENTS[c.type].label + ' #' + c.id : 'Nada seleccionado';
}
function updateButtonStates() {
  $('btn-start').disabled = state.sim.running && !state.sim.paused;
  $('btn-pause').disabled = !state.sim.running || state.sim.paused;
  $('btn-resume').disabled = !state.sim.running || !state.sim.paused;
}
function showWarning(msg, ok = false) {
  const w = $('warnings'); w.innerHTML = '';
  const d = document.createElement('div'); d.className = 'warn-msg' + (ok ? ' ok' : ''); d.textContent = msg; w.appendChild(d);
}

$('btn-start').addEventListener('click', startSimulation);
$('btn-pause').addEventListener('click', pauseSimulation);
$('btn-resume').addEventListener('click', resumeSimulation);
$('btn-reset').addEventListener('click', () => { resetSimulation(); showWarning('Simulación reiniciada.', true); });
$('btn-charge').addEventListener('click', chargeCapacitor);
$('btn-discharge').addEventListener('click', dischargeCapacitor);
$('speed').addEventListener('input', (e) => { state.sim.speed = parseFloat(e.target.value); $('speed-val').textContent = state.sim.speed.toFixed(1) + '×'; });

const charts = { vc: $('chart-vc'), i: $('chart-i'), q: $('chart-q'), cd: $('chart-cd') };
function drawChart(canvas, series, opts) {
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
  const pad = { l: 48, r: 14, t: 14, b: 28 }; const plotW = W - pad.l - pad.r; const plotH = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#060a10'; ctx.fillRect(0, 0, W, H);
  const xs = series.x, ys = series.y;
  if (!xs.length) { ctx.fillStyle = '#93a6bd'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Sin datos aún. Inicia la simulación.', W/2, H/2); return; }
  const xMin = 0; const xMax = Math.max(xs[xs.length-1], opts.tau * 5 || 1);
  let yMin = Math.min(...ys, 0); let yMax = Math.max(...ys, 0);
  if (yMax - yMin < 1e-12) { yMax = 1; yMin = 0; }
  const padY = (yMax - yMin) * 0.1; yMin -= padY; yMax += padY;
  const X = v => pad.l + (v - xMin) / (xMax - xMin || 1) * plotW;
  const Y = v => pad.t + plotH - (v - yMin) / (yMax - yMin || 1) * plotH;
  ctx.strokeStyle = 'rgba(80,130,180,0.15)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const y = pad.t + (plotH * i / 5); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + plotW, y); ctx.stroke(); }
  for (let i = 0; i <= 5; i++) { const x = pad.l + (plotW * i / 5); ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke(); }
  if (opts.tau && opts.tau > 0) {
    for (let k = 1; k <= 5; k++) {
      const tx = k * opts.tau; if (tx > xMax) break; const x = X(tx);
      ctx.strokeStyle = 'rgba(240,180,41,0.5)'; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f0b429'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(k + 'τ', x, pad.t + 10);
    }
  }
  ctx.strokeStyle = '#3a5570'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(pad.l + plotW, pad.t + plotH); ctx.stroke();
  ctx.fillStyle = '#93a6bd'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) { const val = yMax - (yMax - yMin) * i / 5; const y = pad.t + plotH * i / 5; ctx.fillText(opts.fmtY(val), pad.l - 6, y + 4); }
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) { const val = xMin + (xMax - xMin) * i / 5; const x = pad.l + plotW * i / 5; ctx.fillText(val.toFixed(2) + ' s', x, H - 8); }
  if (opts.secondSeries) drawSeries(ctx, opts.secondSeries.x, opts.secondSeries.y, X, Y, '#ef5b6b', 2);
  drawSeries(ctx, xs, ys, X, Y, opts.color, 2.4);
  ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = opts.color; ctx.fillText('● ' + opts.label, pad.l + 6, pad.t + 12);
  if (opts.secondSeries) { ctx.fillStyle = '#ef5b6b'; ctx.fillText('● ' + opts.secondLabel, pad.l + 6, pad.t + 26); }
}
function drawSeries(ctx, xs, ys, X, Y, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  for (let i = 0; i < xs.length; i++) { const x = X(xs[i]), y = Y(ys[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}
function drawAllCharts() {
  const a = analyzeCircuit(); const tau = a.valid ? a.tau : 0;
  drawChart(charts.vc, { x: state.history.t, y: state.history.vc }, { color: '#3fd0c9', label: 'V_C(t)', tau, fmtY: v => v.toFixed(2) });
  drawChart(charts.i, { x: state.history.t, y: state.history.i }, { color: '#7c5cff', label: 'I(t)', tau, fmtY: v => v.toExponential(1) });
  drawChart(charts.q, { x: state.history.t, y: state.history.q }, { color: '#34d399', label: 'Q(t)', tau, fmtY: v => v.toExponential(1) });
  const xC = state.history.t; const yC = state.history.vcCharge && state.history.vcCharge.length ? state.history.vcCharge : state.history.vc;
  drawChart(charts.cd, { x: xC, y: state.history.vc }, { color: '#3fd0c9', label: 'Actual', tau, fmtY: v => v.toFixed(2), secondSeries: { x: xC, y: yC }, secondLabel: 'Carga previa' });
}

let electronAnimFrame = 0;
function drawElectrons() {
  if (!particlesLayer) return;
  particlesLayer.innerHTML = '';
  const a = analyzeCircuit(); if (!a.valid) return;
  const i = state.history.i.length ? state.history.i[state.history.i.length - 1] : 0;
  const current = Math.abs(i); if (current < 1e-7) return;
  
  const numElectrons = Math.min(20, Math.max(3, Math.floor(current * 100000))); 
  electronAnimFrame += (current > 0 ? 0.02 : -0.02);

  state.wires.forEach(w => {
    const p1 = getTerminalPos(w.a.compId, w.a.termIdx); const p2 = getTerminalPos(w.b.compId, w.b.termIdx);
    if (!p1 || !p2) return;
    
    // Dibujar electrones (Partículas amarillas sólidas)
    for (let j = 0; j < numElectrons; j++) {
      let t = (j / numElectrons + electronAnimFrame) % 1; if (t < 0) t += 1;
      const x = p1.x + (p2.x - p1.x) * t; const y = p1.y + (p2.y - p1.y) * t;
      el('circle', { cx: x, cy: y, r: 3.5, fill: '#ffd700', filter: 'url(#glow)', opacity: 0.9 }, particlesLayer);
    }

    // NUEVO: Dibujar paquetes de ENERGÍA (Pulsos de luz naranja con estela)
    // La energía se mueve igual que la corriente pero la representamos más rápida y luminosa.
    const numEnergyPulses = Math.min(5, Math.max(1, Math.floor(current * 50000)));
    for (let k = 0; k < numEnergyPulses; k++) {
      let te = (k / numEnergyPulses + electronAnimFrame * 1.5) % 1; if (te < 0) te += 1;
      const ex = p1.x + (p2.x - p1.x) * te; const ey = p1.y + (p2.y - p1.y) * te;
      
      // Estela de energía
      el('circle', { cx: ex, cy: ey, r: 6, fill: 'rgba(255, 100, 0, 0.3)', filter: 'url(#glow)' }, particlesLayer);
      // Núcleo brillante de la energía
      el('circle', { cx: ex, cy: ey, r: 2.5, fill: '#ffffff', filter: 'url(#glow)' }, particlesLayer);
    }
  });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active'); $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

const EXPERIMENTS = [
  { title: 'Exp 1: Carga', objective: 'Observar la curva exponencial de carga.', config: { V: 10, R: 1000, C: 1e-6 }, procedure: ['Cierra interruptor.', 'Pulsa Cargar.'], expected: 'V_C alcanza 6.32 V en τ.' },
  { title: 'Exp 2: Descarga', objective: 'Observar la curva de descarga.', config: { V: 10, R: 1000, C: 1e-6 }, procedure: ['Carga el condensador.', 'Pulsa Descargar.'], expected: 'V_C cae a 3.68 V en τ.' },
  { title: 'Exp 3: Efecto R', objective: 'Comprobar que τ = RC.', config: { V: 10, R: 2200, C: 1e-6 }, procedure: ['Prueba con R=1k y R=2.2k.'], expected: 'Al duplicar R, se duplica τ.' },
  { title: 'Exp 4: Efecto C', objective: 'Comprobar que τ = RC.', config: { V: 10, R: 1000, C: 4.7e-6 }, procedure: ['Prueba con C=1µF y C=4.7µF.'], expected: 'Al aumentar C, τ crece.' },
  { title: 'Exp 5: Comparación τ', objective: 'Comparar dos constantes.', config: { V: 10, R: 1000, C: 2.2e-6 }, procedure: ['Carga con 1µF y luego con 2.2µF.'], expected: 'La mayor τ tarda más.' },
  { title: 'Exp 6: Diferentes V', objective: 'Forma de onda vs amplitud.', config: { V: 5, R: 1000, C: 1e-6 }, procedure: ['Carga con V=5 y V=10.'], expected: 'Misma forma exponencial.' },
];

function renderExperiments() {
  const grid = $('experiments-grid'); grid.innerHTML = '';
  EXPERIMENTS.forEach((exp, idx) => {
    const card = document.createElement('div'); card.className = 'exp-card';
    card.innerHTML = `<h3>${exp.title}</h3><p><strong>Objetivo:</strong> ${exp.objective}</p><p><strong>Config:</strong> V=${exp.config.V}V, R=${exp.config.R}Ω, C=${(exp.config.C*1e6).toFixed(2)}µF</p><ul>${exp.procedure.map(s=>`<li>${s}</li>`).join('')}</ul><p><strong>Esperado:</strong> ${exp.expected}</p><button class="btn btn-primary btn-block exp-btn" data-exp="${idx}">Cargar experimento</button>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.exp-btn').forEach(b => b.addEventListener('click', () => loadExperiment(parseInt(b.dataset.exp))));
}

function loadExperiment(idx) {
  const exp = EXPERIMENTS[idx]; if (!exp) return;
  state.components = []; state.wires = []; state.selectedId = null; state.wireStart = null; state.mode = 'idle'; state.placingType = null;
  const src = { id: state.nextId++, type: 'source', x: 120, y: 160, value: exp.config.V };
  const res = { id: state.nextId++, type: 'resistor', x: 300, y: 120, value: exp.config.R };
  const cap = { id: state.nextId++, type: 'capacitor', x: 300, y: 300, value: exp.config.C };
  const sw = { id: state.nextId++, type: 'switch', x: 480, y: 160, closed: true };
  const gnd = { id: state.nextId++, type: 'ground', x: 120, y: 300 };
  state.components.push(src, res, cap, sw, gnd);
  const addWire = (a, at, b, bt) => state.wires.push({ id: state.nextId++, a: { compId: a.id, termIdx: at }, b: { compId: b.id, termIdx: bt } });
  addWire(src, 0, res, 0); addWire(res, 1, sw, 0); addWire(sw, 1, cap, 0); addWire(cap, 1, src, 1); addWire(src, 1, gnd, 0);
  resetSimulation(); renderAll(); showWarning('Experimento cargado.', true);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="lab"]').classList.add('active'); $('tab-lab').classList.add('active');
}

$('year').textContent = new Date().getFullYear();
renderExperiments(); updateButtonStates(); renderAll(); drawAllCharts();
requestAnimationFrame(step);
loadExperiment(0);
