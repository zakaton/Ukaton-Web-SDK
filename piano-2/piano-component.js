/* global AFRAME, THREE, Tone, PitchDetector, scale, instruments */
AFRAME.registerSystem("piano", {
  schema: {
    side: { default: "left", oneOf: ["left", "right"] },
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    modeText: { type: "selector" },
    instrument: { type: "string", default: "wav" },
  },
  init: function () {
    window.piano = this;
    this.extraNotes = ["E5"];

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;

    this.instrumentClass = instruments.Piano.getByType(this.data.instrument);
    this.instruments = { left: [], right: [] };
    this.gains = { left: [], right: [] };
    this.isPlaying = { left: [], right: [] };
    this.allInstruments = [];
    for (const side in this.instruments) {
      for (let index = 0; index < 5; index++) {
        const instrument = new this.instrumentClass();
        instrument._index = index;
        instrument._side = side;
        this.instruments[side][index] = instrument;
        this.allInstruments.push(instrument);

        const gain = new Tone.Gain(0).toDestination();
        this.gains[side][index] = gain;
        instrument.connect(gain);

        this.isPlaying[side][index] = false;
      }
    }

    this.throttledUpdateInstrument = this.allInstruments.map((_) => {
      return AFRAME.utils.throttle(this.updateInstrument.bind(this), 10);
    });
    this.otherSide = this.data.side == "left" ? "right" : "left";

    this.hand = this.data[`${this.data.side}Hand`];
    this.otherHand = this.data[`${this.otherSide}Hand`];

    this.hand.addEventListener("hand-tracking-extras-ready", (event) => {
      this.hand.jointsAPI = event.detail.data.jointAPI;
    });
    this.otherHand.addEventListener("hand-tracking-extras-ready", (event) => {
      this.otherHand.jointsAPI = event.detail.data.jointAPI;
    });
    this.numberOfPinches = 0;
    this.resetNumberOfPinches = AFRAME.utils.debounce(
      () => (this.numberOfPinches = 0),
      1000
    );
    this.onPinch = () => {
      this.numberOfPinches++;
      if (this.numberOfPinches > 1) {
        // double pinch
        this.numberOfPinches = 0;
      }
      this.resetNumberOfPinches();
    };
    this.otherHand.addEventListener("pinchstarted", (event) => {
      this.onPinch();
    });

    this.frequency = new Tone.Frequency(440);

    this.audioContext = Tone.context.rawContext._nativeAudioContext;

    this.modes = ["continuous", "notes", "scale", "perfect", "song"];
    this.modeIndex = 1;
    this.onModeIndexUpdate();

    this.scale = scale;
    this.setScaleRoot("G");
    this.setScaleIsMajor(false);
  },

  updateIndex: function (index, isOffset = true, currentIndex, values) {
    let newIndex = currentIndex;
    if (isNaN(index) && values.includes(index)) {
      newIndex = values.indexOf(index);
    } else {
      if (isOffset) {
        newIndex += index;
      } else {
        if (index >= 0 && index < values.length) {
          newIndex = index;
        }
      }
    }

    newIndex %= values.length;
    newIndex = THREE.MathUtils.clamp(newIndex, 0, values.length - 1);

    return newIndex;
  },
  updateMode: function (index, isOffset = true) {
    const newModeIndex = this.updateIndex(
      index,
      isOffset,
      this.modeIndex,
      this.modes
    );
    if (this.modeIndex != newModeIndex) {
      this.modeIndex = newModeIndex;
      this.onModeIndexUpdate();
    }
  },

  onModeIndexUpdate: function () {
    this.mode = this.modes[this.modeIndex];
    console.log("new mode:", this.mode);
    this.data.modeText.setAttribute("value", this.mode);

    switch (this.mode) {
      case "continuous":
      case "notes":
        this.hideEntity(this.data.scaleText.parentEl);
        break;
      case "scale":
      case "perfect":
      case "song":
        this.showEntity(this.data.scaleText.parentEl);
        break;
      default:
        break;
    }

    if (this.mode == "song") {
      this.updateHighlightedSongNote(0, false, true);
    } else {
      this.clearSongNotes();
    }
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  tick: function (time, timeDelta) {
    this.updateInstruments(time, timeDelta);
  },
  setEntityVisibility: function (entity, visibility) {
    if (entity.object3D.visible != visibility) {
      entity.setAttribute("visible", visibility);
    }
  },
  showEntity: function (entity) {
    this.setEntityVisibility(entity, "true");
  },
  hideEntity: function (entity) {
    this.setEntityVisibility(entity, "false");
  },

  updateInstruments: function (time, timeDelta) {
    this.allInstruments.forEach((instrument) => {
      const {index, side} = instrument;
      const isPlaying = this.isPlaying[index];
      if (this.isStringUsed[index]) {
        const frequency = this.fingerNotes[index];
        let pitchBend;
        this.playInstrument(index, frequency, time);
        //this.throttledUpdateInstrument[index](gain, pitchBend);
      } else {
        this.clearInstrument(index);
      }
    });
  },
  getRawMidi: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/f0bddd08ab091877e63cac2b9a5aa56be29a5a47/Tone/type/Frequency.js#L281
    return 69 + (12 * Math.log(pitch / this.A4)) / Math.LN2;
  },

  playInstrument: function (index, frequency, time) {
    if (!this.isPlaying[index]) {
      this.isPlaying[index] = true;
      const instrument = this.instruments[index];
      instrument.triggerAttack(frequency);
      instrument._midi = this.getRawMidi(frequency.toFrequency());
      instrument._startTime = time;
    }
  },
  clearInstrument: function (index) {
    if (this.isPlaying[index]) {
      this.isPlaying[index] = false;
      this.instruments[index].releaseAll(Tone.now());
      this.throttledUpdateInstrument[index](0, 0);
    }
  },
  clearInstruments: function () {
    this.instruments.forEach((_, index) => this.clearInstrument(index));
  },
  updateInstrument: function (index, gain, pitchBend) {
    if (this.isPlaying[index]) {
      if (gain !== undefined) {
        this.gains[index].gain.rampTo(gain);
      }
    }
  },

  setText: function (text, value, color) {
    if (value) {
      text.setAttribute("value", value);
      this.showEntity(text.parentEl);
      if (color) {
        text.setAttribute("color", color);
      }
    }
  },

  setScaleIsMajor: function (isMajor) {
    this.scale.isMajor = isMajor;
    this.updateScaleFrequencies();
  },
  setScaleRoot: function (root) {
    this.scale.root = root;
    this.updateScaleFrequencies();
  },
  setScalePitch: function (pitch) {
    this.scale.pitch = pitch;
    this.updateScaleFrequencies();
  },

  getPitchOffset: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L143
    const log = Math.log(pitch / this.A4) / Math.LN2;
    const offset = 12 * log - Math.round(12 * log);
    return offset;
  },
  pitchToPositions: function (pitch) {
    return this.noteToFingerings[this.pitchToNote(pitch)];
  },
  pitchToNote: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toNote();
  },
  pitchToMidi: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toMidi();
  },
});
