// Audio Files
const notes = [];
const _notes = {
  A: 7,
  As: 7,
  B: 7,
  C: 8,
  Cs: 7,
  D: 7,
  Ds: 7,
  E: 7,
  F: 7,
  Fs: 7,
  G: 7,
  Gs: 7,
};
for (let prefix in _notes) {
  const maxIndex = _notes[prefix];
  for (let index = 1; index <= maxIndex; index++) {
    const note = prefix + index;
    notes.push(note);
  }
}
const AUDIO = {};
notes.forEach((note) => {
  AUDIO[note.replace("s", "#")] = `./instruments/samples/piano/ogg/${note}.ogg`;
});

export default class InstrumentPianoOgg extends window.Tone.Sampler {
  constructor(options = {}) {
    super({
      urls: AUDIO,
      onload: options.onload,
    });
  }
}
