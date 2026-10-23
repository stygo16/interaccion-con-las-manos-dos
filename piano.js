// PianoKeyboard — 3-octave virtual keyboard (C3..B5) with geometry,
// press tracking and p5.js drawing. Black keys are hit-tested first
// because they sit in front of the white keys.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NATURAL_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

class PianoKeyboard {
  constructor() {
    this.firstMidi = 48; // C3
    this.lastMidi = 83; // B5
    this.whiteKeys = [];
    this.blackKeys = [];
    this.keyByMidi = new Map();
    this.pressedMidis = new Set();
    this.pressedNames = new Set();
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.blackBottom = 0;
    this.buildKeys();
  }

  noteName(midi) {
    return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  buildKeys() {
    for (let midi = this.firstMidi; midi <= this.lastMidi; midi++) {
      const key = {
        midi,
        name: this.noteName(midi),
        type: NATURAL_OFFSETS.includes(midi % 12) ? 'white' : 'black',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      };
      if (key.type === 'white') this.whiteKeys.push(key);
      else this.blackKeys.push(key);
      this.keyByMidi.set(midi, key);
    }
  }

  layout(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;

    const whiteW = w / this.whiteKeys.length;
    this.whiteKeys.forEach((k, i) => {
      k.x = x + i * whiteW;
      k.y = y;
      k.w = whiteW;
      k.h = h;
    });

    // Each black key sits centered on the boundary between the two white
    // keys that surround it (there is no black key between E-F and B-C).
    const bw = whiteW * 0.62;
    const bh = h * 0.6;
    for (const k of this.blackKeys) {
      const leftWhite = this.keyByMidi.get(k.midi - 1);
      const boundaryX = leftWhite.x + leftWhite.w;
      k.x = boundaryX - bw / 2;
      k.y = y;
      k.w = bw;
      k.h = bh;
    }
    this.blackBottom = y + bh;
  }

  findKey(x, y) {
    // Black keys win while the point is inside their vertical range.
    if (y >= this.y && y <= this.blackBottom) {
      for (const k of this.blackKeys) {
        if (x >= k.x && x < k.x + k.w) return k;
      }
    }
    for (const k of this.whiteKeys) {
      if (x >= k.x && x < k.x + k.w) return k;
    }
    return null;
  }

  press(midi) {
    this.pressedMidis.add(midi);
    this.pressedNames.add(this.keyByMidi.get(midi).name);
  }

  release(midi) {
    this.pressedMidis.delete(midi);
    if (!this.pressedMidis.has(midi)) {
      this.pressedNames.delete(this.keyByMidi.get(midi).name);
    }
  }

  // Neon glow helpers (p5 drawingContext shadow API).
  setGlow(color, blur) {
    drawingContext.shadowColor = color;
    drawingContext.shadowBlur = blur;
  }

  noGlow() {
    drawingContext.shadowColor = 'transparent';
    drawingContext.shadowBlur = 0;
  }

  draw() {
    const cyan = 'rgba(0, 229, 255, 1)';
    const magenta = 'rgba(255, 47, 214, 1)';

    for (const k of this.whiteKeys) {
      const pressed = this.pressedMidis.has(k.midi);
      strokeWeight(pressed ? 2 : 1);
      if (pressed) {
        fill('rgba(0, 240, 255, 0.95)');
        stroke(cyan);
        this.setGlow('#00e5ff', 22);
      } else {
        fill('rgba(12, 18, 32, 0.66)');
        stroke('rgba(0, 229, 255, 0.75)');
        this.setGlow('#00e5ff', 8);
      }
      rect(k.x, k.y, k.w, k.h);
      this.noGlow();
      noStroke();
      fill(pressed ? '#001018' : 'rgba(150, 245, 255, 0.9)');
      textAlign(CENTER, BOTTOM);
      textSize(Math.min(k.w * 0.3, 16));
      text(k.name, k.x + k.w / 2, k.y + k.h - 6);
    }

    for (const k of this.blackKeys) {
      const pressed = this.pressedMidis.has(k.midi);
      strokeWeight(pressed ? 2 : 1);
      if (pressed) {
        fill('rgba(255, 47, 214, 0.95)');
        stroke(magenta);
        this.setGlow('#ff2fd6', 22);
      } else {
        fill('rgba(4, 6, 14, 0.82)');
        stroke('rgba(255, 47, 214, 0.8)');
        this.setGlow('#ff2fd6', 8);
      }
      rect(k.x, k.y, k.w, k.h);
      this.noGlow();
      noStroke();
      fill(pressed ? '#1a0020' : 'rgba(255, 160, 240, 0.9)');
      textAlign(CENTER, BOTTOM);
      textSize(Math.min(k.w * 0.28, 12));
      text(k.name, k.x + k.w / 2, k.y + k.h - 4);
    }
  }
}
