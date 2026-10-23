// Virtual piano controlled by hand tracking.
//
// Stack: p5.js (rendering) + ml5.js handPose (21 landmarks per hand via
// MediaPipe) + Web Audio (synthesis). Press gesture: a fingertip crosses
// the cyan trigger line downward -> note on; lifting back above it ->
// note off. Hysteresis prevents flapping at the boundary.
//
// Extra inputs: mouse/touch clicks on the keys, and an optional microphone
// mode where saying a note like "g4" / "sol4" plays that key (Web Speech API).

let video;
let handPoseModel;
let hands = [];
let audioEngine;
let piano;
let running = false;
let triggerLineY = 0;
let mouseNote = null;
let micOn = false;
let recognizer = null;
let lastHeard = '';

// midi -> timeout id for voice-triggered notes (short taps).
const voiceTimers = new Map();

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// fingerId -> { key, midi } while that fingertip is holding a note.
const handTipStates = new Map();

// ml5 1.4.0 landmark names for the four playing fingertips (thumb excluded:
// it moves sideways and is unreliable for vertical presses).
const FINGERTIPS = [
  'index_finger_tip',
  'middle_finger_tip',
  'ring_finger_tip',
  'pinky_finger_tip',
];

// Landmark index chains used to draw the hand skeleton.
const FINGER_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
];

const HYSTERESIS = 14; // px of dead zone around the trigger line
const MIN_CONFIDENCE = 0.5; // ignore shaky low-confidence detections

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  audioEngine = new AudioEngine();
  piano = new PianoKeyboard();
  layoutKeyboard();
  wireControls();
  document.getElementById('startBtn').addEventListener('click', startApp);
}

// Wire the HTML control panel: volume slider and microphone toggle.
function wireControls() {
  const volume = document.getElementById('volume');
  audioEngine.setVolume(Number(volume.value));
  volume.addEventListener('input', () => {
    audioEngine.setVolume(Number(volume.value));
  });
  document.getElementById('micBtn').addEventListener('click', toggleMic);
}

function layoutKeyboard() {
  const w = width * 0.96;
  const h = height * 0.34;
  piano.layout((width - w) / 2, height - h - 12, w, h);
  // Press threshold just inside the top edge of the keys.
  triggerLineY = piano.y + piano.h * 0.12;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layoutKeyboard();
}

function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function setOverlayVisible(visible) {
  document.getElementById('overlay').classList.toggle('hidden', !visible);
}

async function startApp() {
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  setStatus('Cargando el modelo de manos… la primera vez puede tardar unos segundos.');
  try {
    await audioEngine.start();
    video = createCapture({ video: { facingMode: 'user' }, audio: false });
    video.hide();
    await waitForVideo(video);
    // ml5.handPose() returns the instance immediately; the model loads in
    // parallel and the real load promise lives in `instance.ready`. Starting
    // detection before that resolves makes detectLoop hit `this.model === null`.
    handPoseModel = ml5.handPose({ maxHands: 2, runtime: 'mediapipe', modelType: 'full' });
    await handPoseModel.ready;
    handPoseModel.detectStart(video, gotHands);
    running = true;
    setOverlayVisible(false);
  } catch (err) {
    console.error(err);
    running = false;
    setStatus('No se pudo iniciar: ' + friendlyError(err));
    btn.disabled = false;
  }
}

function waitForVideo(capture) {
  return new Promise((resolve) => {
    if (capture.elt.readyState >= 2) return resolve();
    capture.elt.onloadeddata = () => resolve();
  });
}

function friendlyError(err) {
  const msg = String(err && err.message ? err.message : err).toLowerCase();
  if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
    return 'permiso de cámara denegado. Permite el acceso a la cámara y vuelve a intentarlo.';
  }
  if (msg.includes('devices') || msg.includes('notfound')) return 'no se encontró una cámara.';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('load')) {
    return 'falló la descarga del modelo (revisa tu conexión a internet).';
  }
  return err && err.message ? err.message : 'error desconocido.';
}

function gotHands(results) {
  hands = results;
}

// ---------- Mouse / touch input ----------

function pressAt(x, y) {
  if (!audioEngine.ctx || mouseNote !== null) return;
  const key = piano.findKey(x, y);
  if (key) {
    audioEngine.noteOn('mouse', key.midi);
    piano.press(key.midi);
    mouseNote = key.midi;
  }
}

function releaseMouse() {
  if (mouseNote === null) return;
  audioEngine.noteOff('mouse');
  piano.release(mouseNote);
  mouseNote = null;
}

function mousePressed() {
  pressAt(mouseX, mouseY);
}

function mouseReleased() {
  releaseMouse();
}

function touchStarted() {
  pressAt(mouseX, mouseY);
  return false;
}

function touchEnded() {
  releaseMouse();
  return false;
}

// ---------- Microphone / voice notes ----------

function setMicStatus(text) {
  const el = document.getElementById('micStatus');
  if (el) el.textContent = text;
}

function updateMicButton() {
  const btn = document.getElementById('micBtn');
  btn.textContent = micOn ? '🎤 Mic: encendido' : '🎤 Mic: apagado';
  btn.classList.toggle('active', micOn);
}

function toggleMic() {
  if (micOn) stopMic();
  else startMic();
}

function startMic() {
  if (!running || !audioEngine.ctx) {
    setMicStatus('Pulsa "Empezar" primero');
    return;
  }
  if (!SpeechRecognition) {
    setMicStatus('Este navegador no soporta reconocimiento de voz');
    return;
  }
  try {
    recognizer = new SpeechRecognition();
    recognizer.lang = 'es-ES';
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = onSpeechResult;
    recognizer.onerror = onSpeechError;
    recognizer.onend = () => {
      // Chrome stops after silence: restart while the mic is still on.
      if (micOn && recognizer) {
        try { recognizer.start(); } catch (err) { /* already started */ }
      }
    };
    recognizer.start();
    micOn = true;
    updateMicButton();
    setMicStatus('Escuchando… di una nota, por ejemplo «sol4» o «g4»');
  } catch (err) {
    micOn = false;
    updateMicButton();
    setMicStatus('No se pudo activar el micrófono: ' + err.message);
  }
}

function stopMic() {
  micOn = false;
  if (recognizer) {
    recognizer.onend = null;
    try { recognizer.stop(); } catch (err) { /* already stopped */ }
  }
  recognizer = null;
  updateMicButton();
  setMicStatus('');
}

function onSpeechResult(event) {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (!result.isFinal) continue;
    const transcript = result[0].transcript.trim();
    if (!transcript) continue;
    // Try the whole phrase first (covers "ge 4" / "sol cuatro"), then words.
    const midi = parseSpokenNote(transcript);
    if (midi !== null) {
      lastHeard = transcript;
      playSpokenNote(midi);
    } else {
      for (const word of transcript.split(/\s+/)) {
        const wordMidi = parseSpokenNote(word);
        if (wordMidi !== null) {
          lastHeard = word;
          playSpokenNote(wordMidi);
        }
      }
    }
  }
}

function onSpeechError(event) {
  if (event.error === 'no-speech' || event.error === 'aborted') return;
  if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
    stopMic();
    setMicStatus('Permiso de micrófono denegado');
    return;
  }
  // network / audio-capture errors: keep the flag on, onend will retry.
}

// Play a spoken note as a short tap with visual feedback.
function playSpokenNote(midi) {
  const fid = 'voice:' + midi;
  audioEngine.noteOn(fid, midi);
  piano.press(midi);
  clearTimeout(voiceTimers.get(midi));
  voiceTimers.set(midi, setTimeout(() => {
    audioEngine.noteOff(fid);
    piano.release(midi);
    voiceTimers.delete(midi);
  }, 600));
}

function draw() {
  background(8, 8, 18);
  drawVideoMirrored();
  if (running) processHands();
  piano.draw();
  drawTriggerLine();
  if (running) {
    drawHands();
    drawHud();
  }
}

function drawVideoMirrored() {
  if (!video || !video.elt.videoWidth) return;
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  const coverScale = Math.max(width / vw, height / vh); // cover-fit
  const dw = vw * coverScale;
  const dh = vh * coverScale;
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
  pop();
}

// Map a landmark point (video pixel space) to mirrored screen space.
function kpToScreen(kp) {
  const vw = video.elt.videoWidth;
  const vh = video.elt.videoHeight;
  const coverScale = Math.max(width / vw, height / vh);
  const dw = vw * coverScale;
  const dh = vh * coverScale;
  const ox = (width - dw) / 2;
  const oy = (height - dh) / 2;
  return {
    x: width - ((kp.x / vw) * dw + ox),
    y: (kp.y / vh) * dh + oy,
  };
}

function processHands() {
  const seen = new Set();
  hands.forEach((hand, hi) => {
    if (hand.confidence < MIN_CONFIDENCE) return;
    for (const name of FINGERTIPS) {
      const kp = hand[name];
      if (!kp) continue;
      const fid = hi + ':' + name;
      seen.add(fid);
      const p = kpToScreen(kp);
      let state = handTipStates.get(fid);
      if (!state) {
        state = { key: null, midi: null };
        handTipStates.set(fid, state);
      }

      if (state.key) {
        // Holding: release once the tip rises above the line.
        if (p.y < triggerLineY - HYSTERESIS) {
          audioEngine.noteOff(fid);
          piano.release(state.midi);
          state.key = null;
          state.midi = null;
        }
      } else if (p.y > triggerLineY + HYSTERESIS) {
        // Idle: press once the tip dips below the line.
        const key = piano.findKey(p.x, p.y);
        if (key) {
          audioEngine.noteOn(fid, key.midi);
          piano.press(key.midi);
          state.key = key;
          state.midi = key.midi;
        }
      }
    }
  });

  // Hands that vanished mid-note: release their voices.
  for (const [fid, state] of handTipStates) {
    if (!seen.has(fid) && state.key) {
      audioEngine.noteOff(fid);
      piano.release(state.midi);
      handTipStates.delete(fid);
    }
  }
}

function drawHands() {
  hands.forEach((hand, hi) => {
    if (hand.confidence < MIN_CONFIDENCE) return;

    strokeWeight(3);
    stroke(120, 220, 255, 120);
    noFill();
    for (const chain of FINGER_CHAINS) {
      beginShape();
      for (const idx of chain) {
        const p = kpToScreen(hand.keypoints[idx]);
        vertex(p.x, p.y);
      }
      endShape();
    }

    noStroke();
    for (const name of FINGERTIPS) {
      const kp = hand[name];
      if (!kp) continue;
      const fid = hi + ':' + name;
      const p = kpToScreen(kp);
      const state = handTipStates.get(fid);
      const pressing = !!(state && state.key);
      fill(pressing ? '#57e0ff' : '#ffd166');
      circle(p.x, p.y, pressing ? 20 : 14);
    }
  });
}

function drawTriggerLine() {
  push();
  drawingContext.setLineDash([10, 8]);
  drawingContext.shadowColor = '#00e5ff';
  drawingContext.shadowBlur = 12;
  stroke(0, 229, 255, 160);
  strokeWeight(2);
  line(piano.x, triggerLineY, piano.x + piano.w, triggerLineY);
  drawingContext.setLineDash([]);
  drawingContext.shadowBlur = 0;
  noStroke();
  drawingContext.shadowBlur = 8;
  fill(0, 229, 255, 180);
  textAlign(RIGHT, CENTER);
  textSize(12);
  text('presiona aquí abajo', piano.x + piano.w - 8, triggerLineY - 12);
  drawingContext.shadowBlur = 0;
  pop();
}

function drawHud() {
  textAlign(LEFT, TOP);
  textSize(14);
  noStroke();
  drawingContext.shadowColor = '#00e5ff';
  drawingContext.shadowBlur = 6;
  const tracked = hands.filter((h) => h.confidence >= MIN_CONFIDENCE).length;
  fill(190, 250, 255);
  text('Manos detectadas: ' + tracked, 12, 12);
  drawingContext.shadowBlur = 0;
  if (piano.pressedMidis.size > 0) {
    fill(255, 47, 214);
    drawingContext.shadowColor = '#ff2fd6';
    drawingContext.shadowBlur = 8;
    text('Notas: ' + [...piano.pressedNames].join('  '), 12, 32);
    drawingContext.shadowBlur = 0;
  } else {
    fill(255, 255, 255, 110);
    text('Baja las puntas de los dedos hasta cruzar la línea celeste', 12, 32);
  }
  if (micOn) {
    fill(0, 229, 255, 210);
    text(lastHeard ? 'Mic: «' + lastHeard + '»' : 'Mic: escuchando…', 12, 52);
  }
}
