// Original local soundtrack sketch. No samples, services, or third-party melodies.
// Run: node scripts/compose-little-orbit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'art/music/little-orbit');
fs.mkdirSync(out, { recursive: true });
const rate = 24000, bpm = 76, beat = 60 / bpm, bars = 32;
const frames = Math.round(bars * 4 * beat * rate);
const dryL = new Float64Array(frames), dryR = new Float64Array(frames);
const events = [];
const voices = ['piano', 'plucks', 'pad', 'bell'];
function note(voice, bar, offset, pitch, length, gain, pan = 0) {
  events.push({ voice, start: bar * 4 + offset, pitch, length, gain, pan });
}
// Dmaj9, A/C#, Bm7, Gmaj9, D/F#, Em9, Gmaj7, Asus(add9).
const chords = [
  [38, [54, 57, 61, 64]], [37, [52, 57, 59, 61]],
  [35, [54, 57, 59, 62]], [31, [54, 57, 59, 62]],
  [30, [54, 57, 62, 64]], [28, [55, 59, 62, 66]],
  [31, [54, 57, 59, 62]], [33, [52, 57, 59, 62]],
];
// Each tuple is onset, MIDI pitch, held beats. Space is part of the melody.
const theme = [
  [[.5,66,.75],[1.5,69,.75],[2.5,73,1.1]],
  [[.5,71,1],[2,69,1.3]],
  [[.5,66,.8],[1.75,69,.65],[2.75,74,.8]],
  [[.25,73,.75],[1.5,71,1.8]],
  [[.5,69,.75],[1.75,66,.75],[3,64,.65]],
  [[.5,66,.8],[2,67,1.1]],
  [[.5,66,.8],[1.75,64,.65],[2.75,62,.8]],
  [[.5,64,1.3],[2.5,61,1.0]],
];
for (let bar = 0; bar < bars; bar++) {
  const section = Math.floor(bar / 8), local = bar % 8;
  const [bass, chord] = chords[local];
  const intimacy = section === 2;
  for (const pitch of chord) note('pad', bar, 0, pitch, 4.1, intimacy ? .013 : .016, (pitch % 3 - 1) * .35);
  note('piano', bar, .025, bass + 12, 2.7, .075, -.18);
  if (!intimacy && bar > 1) {
    [0, 2, 1, 3, 2, 1].forEach((index, i) =>
      note('plucks', bar, .45 + i * .5, chord[index] + 12, .85,
        (.022 + (i % 2) * .004) * (section === 1 ? 1.12 : 1), i % 2 ? .32 : -.32));
  } else {
    note('plucks', bar, 1.4, chord[1] + 12, 1.6, .025, -.25);
    note('plucks', bar, 2.8, chord[3] + 12, 1.4, .021, .25);
  }
  for (let i = 0; i < theme[local].length; i++) {
    let [onset, pitch, length] = theme[local][i];
    if (intimacy) { pitch -= 12; length *= 1.18; }
    if (section === 1 && local === 2 && i === 2) pitch = 78;
    if (section === 1 && local === 3 && i === 0) pitch = 76;
    if (section === 3 && local === 6 && i === 2) pitch = 66;
    note('piano', bar, onset, pitch, length, intimacy ? .112 : .127, .06);
  }
  if ([2, 6, 10, 14, 26, 30].includes(bar)) {
    note('bell', bar, 3.25, chord[2] + 24, 1.4, .023, .45);
  }
}
function synth(event) {
  const hz = 440 * 2 ** ((event.pitch - 69) / 12);
  const held = event.length * beat;
  const pad = event.voice === 'pad', bell = event.voice === 'bell';
  const duration = pad ? held + 1.2 : held + 1.7;
  const count = Math.ceil(duration * rate);
  const start = Math.round(event.start * beat * rate);
  const left = Math.sqrt((1 - event.pan) / 2), right = Math.sqrt((1 + event.pan) / 2);
  for (let i = 0; i < count; i++) {
    const t = i / rate, phase = 2 * Math.PI * hz * t;
    let wave, envelope;
    if (pad) {
      envelope = Math.min(1, t / .65) * Math.min(1, (duration - t) / 1.2);
      wave = .78 * Math.sin(phase) + .14 * Math.sin(phase * 2) + .08 * Math.sin(phase * 1.002);
    } else {
      const attack = 1 - Math.exp(-t / (bell ? .004 : .009));
      const release = Math.exp(-Math.max(0, t - held) / .34);
      envelope = attack * release;
      const decay = event.voice === 'plucks' ? .55 : bell ? 1.1 : 1.5;
      wave = Math.sin(phase) * Math.exp(-t / decay)
        + .27 * Math.sin(phase * 2.001) * Math.exp(-t / (decay * .55))
        + .09 * Math.sin(phase * (bell ? 2.76 : 3.003)) * Math.exp(-t / .22)
        + .025 * Math.sin(phase * 4.007) * Math.exp(-t / .12);
      envelope *= Math.min(1, (duration - t) / .025);
    }
    const value = wave * envelope * event.gain;
    // Circular accumulation retains the preceding cycle's release at loop start.
    const index = (start + i) % frames;
    dryL[index] += value * left; dryR[index] += value * right;
  }
}
events.forEach(synth);
const left = new Float64Array(dryL), right = new Float64Array(dryR);
for (const [seconds, gain] of [[.087,.10],[.151,.085],[.233,.075],[.347,.065],[.521,.045],[.719,.028]]) {
  const delay = Math.round(seconds * rate);
  for (let i = 0; i < frames; i++) {
    const source = (i - delay + frames) % frames;
    left[i] += dryR[source] * gain;
    right[i] += dryL[source] * gain;
  }
}
let peak = 0, energy = 0;
for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const scale = .63 / peak; // About -4 dBFS peak, leaving generous headroom.
const pcm = Buffer.alloc(frames * 4);
for (let i = 0; i < frames; i++) {
  const l = left[i] * scale, r = right[i] * scale;
  if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error('Non-finite audio');
  energy += l*l + r*r;
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 4, 28);
header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
fs.writeFileSync(path.join(out, 'little-orbit-v1.wav'), Buffer.concat([header, pcm]));
// Editable standard MIDI preserves the composition for higher-quality instruments.
function vlq(n) { const a = [n & 127]; while ((n >>= 7)) a.unshift((n & 127) | 128); return a; }
function chunk(name, data) {
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  return Buffer.concat([Buffer.from(name), size, Buffer.from(data)]);
}
const tempo = Math.round(60e6 / bpm);
const tracks = [chunk('MTrk', [0,255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255,
  0,255,88,4,4,2,24,8,...vlq(bars*4*480),255,47,0])];
voices.forEach((voice, channel) => {
  const midi = [{ t: 0, data: [192+channel, [0,10,89,8][channel]] }];
  events.filter(e => e.voice === voice).forEach(e => {
    midi.push({t: Math.round(e.start*480), data: [144+channel,e.pitch,Math.max(18,Math.round(95*Math.sqrt(e.gain/.127)))]});
    midi.push({t: Math.min(bars*4*480,Math.round((e.start+e.length)*480)), data: [128+channel,e.pitch,0]});
  });
  midi.sort((a,b) => a.t-b.t || a.data[0]-b.data[0]);
  let last = 0; const data = [];
  midi.forEach(e => { data.push(...vlq(e.t-last),...e.data); last=e.t; });
  data.push(...vlq(bars*4*480-last),255,47,0); tracks.push(chunk('MTrk',data));
});
const mh = Buffer.alloc(6); mh.writeUInt16BE(1); mh.writeUInt16BE(tracks.length,2); mh.writeUInt16BE(480,4);
fs.writeFileSync(path.join(out,'little-orbit-v1.mid'),Buffer.concat([chunk('MThd',mh),...tracks]));
const report = {
  title: 'Little Orbit', version: 1, bpm, bars, key: 'D major / B minor colors',
  durationSeconds: frames/rate, sampleRate: rate, channels: 2, bitDepth: 16,
  noteCount: events.length, peakDbfs: 20*Math.log10(.63),
  rmsDbfs: 20*Math.log10(Math.sqrt(energy/(frames*2))),
  loopBoundaryStep: Math.max(Math.abs(left[0]-left[frames-1]), Math.abs(right[0]-right[frames-1]))*scale,
  source: 'Original hand-authored note events; deterministic additive synthesis; no samples or external services',
  acceptance: 'Technical rendering checked; user listening and musical acceptance pending',
};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
