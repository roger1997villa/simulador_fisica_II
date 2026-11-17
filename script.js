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
  source:     { label: 'Batería',      w: 80, h: 40, terminals: [{x:-40,y:0},{x:40,y:0}], value: 10, unit: 'V' },
  resistor:   { label: 'Resistencia',  w: 70, h: 20, terminals: [{x:-45,y:0},{x:45,y:0}], value: 1000, unit: 'Ω' },
  capacitor:  { label: 'Condensador',  w: 60, h: 30, terminals: [{x:-40,y:0},{x:40,y:0}], value: 1e-6, unit: 'F' },
  switch:     { label: 'Interruptor',  w: 70, h: 20, terminals: [{x:-40,y:0},{x:40,y:0}], closed: false },
  ground:     { label: 'Tierra',       w: 40, h: 40, terminals: [{x:0,y:-20}] },
  ammeter:    { label: 'Amperímetro',  w: 70, h: 50, terminals: [{x:-30,y:0},{x:30,y:0}] },
  voltmeter:  { label: 'Voltímetro',   w: 70, h: 50, terminals: [{x:-30,y:0},{x:30,y:0}] },
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
    
    el('rect', { class:'comp-body', x:-30, y:-35, width:60, height:70, rx:8, fill:'#2d2d2d', stroke:'#111', 'stroke-width':3 }, g);
    el('rect', { x:-24, y:-28, width:48, height:24, rx:3, fill:bg, stroke:'#444', 'stroke-width':2 }, g);
    el('text', { x:-18, y:-12, 'text-anchor':'start', fill:color, 'font-size':10, 'font-weight':700 }, g).textContent = label;
    
    const valText = el('text', { class:'lcd-value', x:2, y:-10, 'text-anchor':'middle', fill:color, 'font-size':13, 'font-family':'monospace', 'font-weight':'bold' }, g);
    valText.textContent = '0.00';
    
    meta.terminals.forEach((t, i) => {
      el('circle', { class:'terminal', cx:t.x, cy:t.y, r:5, 'data-comp':c.id, 'data-term':i }, g).addEventListener('mousedown', (e) => onTerminalMouseDown(e, c, i));
    });
    c._lcdText = valText;
    return g;
  }

  switch (c.type) {
    case 'source':
      el('rect', { class:'comp-body', x:-35, y:-18, width:70, height:36, rx:4, fill:'#111', stroke:'#333', 'stroke-width':2 }, g);
      el('rect', { x:-35, y:-18, width:25, height:36, rx:4, fill:'#f0b429' }, g);
      el('text', { x:-22, y:5, 'text-anchor':'middle', fill:'#111', 'font-size':18, 'font-weight':900 }, g).textContent = '+';
      el('text', { x:22, y:5, 'text-anchor':'middle', fill:'#666', 'font-size':18, 'font-weight':900 }, g).textContent = '-';
      el('text', { x:0, y:-25, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':12 }, g).textContent = (c.value ?? 0).toFixed(2) + ' V';
      break;
    case 'resistor':
      el('rect', { class:'comp-body', x:-35,y:-10,width:70,height:20, fill:'#e0c88a', stroke:'#a08040','stroke-width':2, rx:5 }, g);
      el('line', { x1:-25,y1:-10,x2:-25,y2:10, stroke:'#000','stroke-width':3 }, g);
      el('line', { x1:-15,y1:-10,x2:-15,y2:10, stroke:'#8B4513','stroke-width':3 }, g);
      el('line', { x1:-5,y1:-10,x2:-5,y2:10, stroke:'#FF0000','stroke-width':3 }, g);
      el('line', { x1:25,y1:-10,x2:25,y2:10, stroke:'#D4AF37','stroke-width':3 }, g);
      el('text', { x:0, y:-18, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':11 }, g).textContent = c.value >= 1e3 ? (c.value/1e3).toFixed(2)+' kΩ' : c.value.toFixed(0)+' Ω';
      break;
    case 'capacitor':
      el('rect', { class:'comp-body', x:-20, y:-15, width:40, height:30, rx:3, fill:'#1f4a7a', stroke:'#3a5570', 'stroke-width':2 }, g);
      el('line', { x1:-6, y1:-18, x2:-6, y2:18, stroke:'#ccc', 'stroke-width':4 }, g);
      el('line', { x1:6, y1:-18, x2:6, y2:18, stroke:'#ccc', 'stroke-width':4 }, g);
      el('text', { x:0, y:-24, 'text-anchor':'middle', fill:'#e6eef7', 'font-size':11 }, g).textContent = c.value >= 1e-6 ? (c.value*1e6).toFixed(2)+' µF' : (c.value*1e9).toFixed(2)+' nF';
      break;
    case 'switch':
      el('line', { x1:-40,y1:0,x2:-20,y2:0, stroke:'#00bcd4','stroke-width':4 }, g);
      el('line', { x1:20,y1:0,x2:40,y2:0, stroke:'#00bcd4','stroke-width':4 }, g);
      el('circle', { cx:-20, cy:0, r:4, fill:'#ccc' }, g);
      el('circle', { cx:20, cy:0, r:4, fill:'#ccc' }, g);
      if (c.closed) el('line', { class:'comp-body', x1:-20,y1:0,x2:20,y2:0, stroke:'#00bcd4','stroke-width':4 }, g);
      else el('line', { class:'comp-body', x1:-20,y1:0,x2:15,y2:-18, stroke:'#ff5252','stroke-width':4 }, g);
      break;
    case 'ground':
      el('line', { x1:0,y1:-20,x2:0,y2:0, stroke:'#93a6bd','stroke-width':3 }, g);
      el('line', { class:'comp-body', x1:-16,y1:0,x2:16,y2:0, stroke:'#93a6bd','stroke-width':4 }, g);
      el('line', { x1:-10,y1:6,x2:10,y2:6, stroke:'#93a6bd','stroke-width':3 }, g);
      el('line', { x1:-4,y1:12,x2:4,y2:12, stroke:'#93a6bd','stroke-width':2 }, g);
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
  if (!source || resistors.length === 0 || capacitors.length === 0) return { valid: false, reason: 'Se requiere una batería, al menos una resistencia y un condensador.' };
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
    if (c.type === 'ammeter' && c._lcdText) { c._lcdText.textContent = engFormat(Math.abs(currentI), 'A'); }
    if (c.type === 'voltmeter' && c._lcdText) { c._lcdText.textContent = fmt(currentVc, 'V', 2); }
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

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active'); $('tab-' + btn.dataset.tab).classList.add('active');
  });
});

let electronAnimFrame = 0;
function drawElectrons() {
  if (!particlesLayer) return;
  particlesLayer.innerHTML = '';
  const a = analyzeCircuit(); if (!a.valid) return;
  const i = state.history.i.length ? state.history.i[state.history.i.length - 1] : 0;
  const current = Math.abs(i); if (current < 1e-7) return;
  
  const numElectrons = Math.min(30, Math.max(5, Math.floor(current * 150000))); 
  electronAnimFrame += (current > 0 ? 0.025 : -0.025);

  state.wires.forEach(w => {
    const p1 = getTerminalPos(w.a.compId, w.a.termIdx); const p2 = getTerminalPos(w.b.compId, w.b.termIdx);
    if (!p1 || !p2) return;
    
    for (let j = 0; j < numElectrons; j++) {
      let t = (j / numElectrons + electronAnimFrame) % 1; if (t < 0) t += 1;
      const x = p1.x + (p2.x - p1.x) * t; const y = p1.y + (p2.y - p1.y) * t;
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
      el('circle', { cx: x, cy: y, r: 6, fill: '#00d2ff', filter: 'url(#glow)', opacity: 0.9 }, particlesLayer);
      el('path', { d: `M ${x-2} ${y-3} L ${x+3} ${y} L ${x-2} ${y+3} Z`, fill: '#ffffff', transform: `rotate(${angle}, ${x}, ${y})` }, particlesLayer);
    }
  });
}

$('year').textContent = new Date().getFullYear();
renderAll(); updateButtonStates();
requestAnimationFrame(step);
