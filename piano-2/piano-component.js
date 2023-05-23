/* global AFRAME, THREE, Tone, PitchDetector, scale, instruments */
AFRAME.registerComponent("piano", {
  schema: {
    side: { default: "left", oneOf: ["left", "right"] },
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    modeText: { type: "selector" },
    instrument: { type: "string", default: "ogg" },
    camera: { type: "selector", default: "[camera]" },
    scaleText: { type: "selector" },
    octaves: { type: "number", default: 6 },
    octaveStart: { type: "number", default: 2 },
    whiteKeyDimensions: { type: "vec3", default: { x: 23.75, y: 15, z: 150 } },
    blackKeyDimensions: { type: "vec3", default: { x: 12.5, y: 6, z: 90 } },
    spaceBetweenWhiteKeys: { type: "number", default: 1 },
  },
  init: function () {
    window.piano = this;

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;

    this.instrumentClass = instruments.Piano.getByType(this.data.instrument);
    this.instrument = new this.instrumentClass();
    this.gain = new Tone.Gain(1).toDestination();
    this.instrument.connect(this.gain);

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

    this.modes = ["notes", "scale", "perfect"];
    this.modeIndex = 1;
    this.onModeIndexUpdate();

    this.scale = scale;
    this.scale.isPerfect = true;

    this.pianoKeysEntity = this.el.querySelector(".keys");
    this.highlightColors = {
      left: {
        hover: { white: "#E0FFFD", black: "#C7FFFB" },
        play: { white: "#C2FFFB", black: "#47FFF3" },
      },
      right: {
        hover: { white: "#F8AB1B", black: "#FF6666" },
        play: { white: "#FFD88F", black: "#FFC966" },
      },
    };

    this.el.addEventListener(
      "loaded",
      () => {
        this._createPiano();
        //this.setScaleRoot("G");
        //this.setScaleIsMajor(false);
        this._onScaleUpdate();
      },
      { once: true }
    );
  },

  _createPiano: function () {
    if (this._didCreatePiano) {
      return;
    }
    this._didCreatePiano = true;

    const keyTemplates = {
      white: document.getElementById("whiteKeyTemplate"),
      black: document.getElementById("blackKeyTemplate"),
    };

    const keyDimensions = {
      white: this.data.whiteKeyDimensions,
      black: this.data.blackKeyDimensions,
    };
    for (const color in keyDimensions) {
      const _keyDimensions = keyDimensions[color];
      for (const component in _keyDimensions) {
        _keyDimensions[component] /= 1000;
      }
    }

    this.pianoKeys = []; // {entity, frequency}
    this.pianoKeysByNote = {};
    let baseFrequency = new Tone.Frequency(
      `C${this.data.octaveStart}`
    ).transpose(-1);

    const spaceBetweenWhiteKeys = this.data.spaceBetweenWhiteKeys / 1000;

    let whiteKeyIndex = 0;
    for (
      let octaveIndex = this.data.octaveStart;
      octaveIndex < this.data.octaveStart + this.data.octaves;
      octaveIndex++
    ) {
      for (let semitone = 0; semitone < 12; semitone++) {
        baseFrequency = baseFrequency.transpose(1);
        const frequency = baseFrequency;
        const note = frequency.toNote();
        const _note = note.slice(0, -1);

        const isSharp = note.includes("#");
        const color = isSharp ? "black" : "white";
        const entity = keyTemplates[color].content
          .cloneNode(true)
          .querySelector(".key");
        entity.dataset.note = note;
        const box = entity.querySelector("a-box");

        const { x: width, y: height, z: depth } = keyDimensions[color];
        box.setAttribute("width", width);
        box.setAttribute("height", height);
        box.setAttribute("depth", depth);

        const position = [0, 0, 0];
        const boxPosition = [0, 0, 0];
        const [x, y, z] = [0, 1, 2];
        if (color == "white") {
          position[x] = whiteKeyIndex * (width + spaceBetweenWhiteKeys);
          whiteKeyIndex++;
        } else {
          position[x] =
            (whiteKeyIndex - 0.5) *
            (keyDimensions.white.x + spaceBetweenWhiteKeys);
          position[y] = keyDimensions.white.y / 2;
        }
        boxPosition[y] = -height / 2;
        boxPosition[z] = depth / 2;

        entity.setAttribute("position", position.join(" "));
        box.setAttribute("position", boxPosition.join(" "));

        const pianoKey = { frequency, entity, box, note, isSharp, _note };
        this.pianoKeys.push(pianoKey);
        this.pianoKeysByNote[note] = pianoKey;
        this.pianoKeysEntity.appendChild(entity);
      }
    }
    baseFrequency.dispose();

    const pianoWidth =
      whiteKeyIndex * (keyDimensions.white.x + spaceBetweenWhiteKeys);
    this.pianoKeysEntity.setAttribute(
      "position",
      [-pianoWidth / 2, 0, 0].join(" ")
    );

    console.log(this.pianoKeys);
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
      case "notes":
        this.hideEntity(this.data.scaleText.parentEl);
        break;
      case "scale":
      case "perfect":
        this.showEntity(this.data.scaleText.parentEl);
        break;
      default:
        break;
    }
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  setEntityVisibility: function (entity, visibility) {
    if (entity && entity.object3D.visible != visibility) {
      entity.setAttribute("visible", visibility);
    }
  },
  showEntity: function (entity) {
    this.setEntityVisibility(entity, "true");
  },
  hideEntity: function (entity) {
    this.setEntityVisibility(entity, "false");
  },

  setSustain: function (useSustain) {
    if (this.useSustain != useSustain) {
      this.useSustain = useSustain;
      if (!this.useSustain) {
        // FILL - UI indicating useSustain
      } else {
        // FILL - UI indicating useSustain
        // FILL - release all pending instruments
      }
    }
  },
  getRawMidi: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/f0bddd08ab091877e63cac2b9a5aa56be29a5a47/Tone/type/Frequency.js#L281
    return 69 + (12 * Math.log(pitch / this.A4)) / Math.LN2;
  },

  playKey: function (key) {
    // FILL - color key and animate
    key.isPlaying = true;
    if (this.useSustain) {
      this.instrument.triggerAttack(key.note);
    } else {
      this.instrument.triggerAttackRelease(key.note);
      // FILL - release
    }
  },
  clearInstrument: function () {
    this.instrument.releaseAll(Tone.now());
    this.throttledUpdateInstrument(0, 0);
  },
  updateInstrument: function (gain) {
    if (gain !== undefined) {
      this.gain.gain.rampTo(gain);
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

  updateKeyColor: function (key) {
    const { isSharp, box, enabled, isHovering, isPlaying, side } = key;
    let color;

    if (enabled) {
      if (isHovering) {
        color =
          this.highlightColors[side][isSharp ? "black" : "white"][
            isPlaying ? "playing" : "hover"
          ];
      } else {
        color = isSharp ? "black" : "white";
      }
    } else {
      color = isSharp ? "grey" : "grey";
    }

    if (color) {
      box.setAttribute("color", color);
    }
  },

  animateKey: function (key, isDown = true) {
    const { entity } = key;
    if (isDown) {
      entity.emit("rotateDown", null, false);
    } else {
      entity.emit("rotateUp", null, false);
    }
  },
  animateKeyDown: function (key) {
    this.animateKey(key, true);
  },
  animateKeyUp: function (key) {
    this.animateKey(key, false);
  },

  setScaleIsMajor: function (isMajor) {
    this.scale.isMajor = isMajor;
    this._onScaleUpdate();
  },
  setScaleRoot: function (root) {
    this.scale.root = root;
    this._onScaleUpdate();
  },
  setScalePitch: function (pitch) {
    this.scale.pitch = pitch;
    this._onScaleUpdate();
  },
  setScaleExoticScale: function (exoticScale = -1) {
    if (typeof exoticScale == "number") {
      this.scale.exoticScaleIndex = exoticScale;
    } else {
      this.scale.exoticScale = exoticScale;
    }
    this._onScaleUpdate();
  },
  _onScaleUpdate: function () {
    this.scaleKeys = this.scale.keys.map((key) => {
      if (Array.isArray(key)) {
        return key.find((_key) => _key.includes("#"));
      } else {
        return key;
      }
    });

    piano.setText(piano.data.scaleText, this.scale.name);

    this.pianoKeys.forEach((key) => {
      key.enabled = this.scaleKeys.includes(key._note);
      this.updateKeyColor(key);
    });
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
