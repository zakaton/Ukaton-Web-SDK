/* global AFRAME, THREE, Tone, PitchDetector, scale, instruments */
AFRAME.registerComponent("piano", {
  schema: {
    side: { default: "left", oneOf: ["left", "right"] },
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    modeText: { type: "selector" },
    sustainText: { type: "selector" },
    instrument: { type: "string", default: "ogg" },
    camera: { type: "selector", default: "[camera]" },
    scaleText: { type: "selector" },
    octaves: { type: "number", default: 6 },
    octaveStart: { type: "number", default: 2 },
    whiteKeyDimensions: { type: "vec3", default: { x: 23.75, y: 15, z: 150 } },
    blackKeyDimensions: { type: "vec3", default: { x: 12.5, y: 6, z: 90 } },
    spaceBetweenWhiteKeys: { type: "number", default: 1 },
    release: { type: "number", default: 0.6 },
  },
  init: function () {
    window.piano = this;

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;

    this.instrumentClass = instruments.Piano.getByType(this.data.instrument);
    this.instrument = new this.instrumentClass();
    this.gain = new Tone.Gain(1).toDestination();
    this.instrument.connect(this.gain);
    this.triggeredKeys = new Map(); // {key: {startTime, endTime}}

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
        white: {
          isHovering: "#cffffc",
          isPlaying: "#adfffa",
        },
        black: {
          isHovering: "#9cfff8",
          isPlaying: "#47fff2",
        },
      },
      right: {
        white: {
          isHovering: "#ffcb6b",
          isPlaying: "#ffb221",
        },
        black: {
          isHovering: "#c99128",
          isPlaying: "#c98300",
        },
      },
    };

    this.handIndices = {
      left: null,
      right: null,
    };
    this.hoveringKeys = {
      left: [],
      right: [],
    };

    this.checkTriggeredKeys = AFRAME.utils.throttle(
      this.checkTriggeredKeys,
      100,
      this
    );

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

  tick: function (time, timeDelta) {
    this.checkTriggeredKeys();
  },

  checkTriggeredKeys: function () {
    const now = Tone.now();
    this.triggeredKeys.forEach((value, key) => {
      let { endTime, shouldRelease, finalEndTime } = value;
      shouldRelease = shouldRelease || now > endTime;
      const shouldReleaseOverride = now > finalEndTime;
      if ((shouldRelease && !this.useSustain) || shouldReleaseOverride) {
        key.isPlaying = false;
        this.instrument.triggerRelease(key.note);
        this.animateKeyUp(key);
        this.updateKeyColor(key);
        this.triggeredKeys.delete(key);
      } else {
        value.shouldRelease = shouldRelease;
      }
    });
  },

  _createPiano: function () {
    if (this._didCreatePiano) {
      return;
    }
    this._didCreatePiano = true;

    this.keyDimensions = {
      white: this.data.whiteKeyDimensions,
      black: this.data.blackKeyDimensions,
    };
    for (const color in this.keyDimensions) {
      const _keyDimensions = this.keyDimensions[color];
      for (const component in _keyDimensions) {
        _keyDimensions[component] /= 1000;
      }
    }

    const keyTemplates = {
      white: document.getElementById("whiteKeyTemplate"),
      black: document.getElementById("blackKeyTemplate"),
    };

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

        const { x: width, y: height, z: depth } = this.keyDimensions[color];
        box.setAttribute("width", width);
        box.setAttribute("height", height);
        box.setAttribute("depth", depth);

        const text = entity.querySelector("a-text");

        const position = [0, 0, 0];
        const boxPosition = [0, 0, 0];
        const textPosition = [0, 0, 0];
        const [x, y, z] = [0, 1, 2];
        if (color == "white") {
          position[x] = whiteKeyIndex * (width + spaceBetweenWhiteKeys);
          whiteKeyIndex++;
        } else {
          position[x] =
            (whiteKeyIndex - 0.5) *
            (this.keyDimensions.white.x + spaceBetweenWhiteKeys);
          position[y] = this.keyDimensions.white.y / 2;
        }
        boxPosition[y] = -height / 2;
        boxPosition[z] = depth / 2;
        textPosition[z] = depth - 0.01;

        entity.setAttribute("position", position.join(" "));
        box.setAttribute("position", boxPosition.join(" "));
        text.setAttribute("position", textPosition.join(" "));

        const pianoKey = { frequency, entity, box, note, isSharp, _note, text };
        this.pianoKeys.push(pianoKey);
        this.pianoKeysByNote[note] = pianoKey;
        this.pianoKeysEntity.appendChild(entity);
      }
    }
    baseFrequency.dispose();

    const pianoWidth =
      whiteKeyIndex * (this.keyDimensions.white.x + spaceBetweenWhiteKeys);
    this.pianoKeysEntity.setAttribute(
      "position",
      [-pianoWidth / 2, 0, 0].join(" ")
    );
  },

  getClosestValidPianoKeyIndex: function (index, side) {
    let key = this.pianoKeys[index];
    let radius = 0;
    let offset = 0;
    let initialSign = side == "left" ? -1 : 1;
    while (key && !key.enabled) {
      radius++;

      offset = radius * initialSign;
      key = this.pianoKeys[index + offset];
    }
    return index + offset;
  },
  getNextClosestValidPianoKeyIndex: function (index, side) {
    const offset = side == "left" ? -1 : 1;
    return this.getClosestValidPianoKeyIndex(index + offset, side);
  },
  setHandIndex: function (
    handIndex = this.handIndices[side],
    side,
    override = true
  ) {
    handIndex = this.getClosestValidPianoKeyIndex(handIndex, side);
    if (this.handIndices[side] == handIndex && !override) {
      return;
    }

    this.handIndices[side] = handIndex;
    const hoveringKeys = this.hoveringKeys[side];
    hoveringKeys.forEach((key) => {
      key.isHovering = false;
      delete key.side;
      this.updateKeyColor(key);
      this.updateKeyIndex(key);
    });
    hoveringKeys.length = 0;

    let keyIndex = handIndex;
    for (let fingerIndex = 0; fingerIndex < 5; fingerIndex++) {
      if (fingerIndex > 0) {
        keyIndex = this.getNextClosestValidPianoKeyIndex(keyIndex, side);
      } else {
        keyIndex = this.getClosestValidPianoKeyIndex(keyIndex, side);
      }
      const key = this.pianoKeys[keyIndex];
      if (key) {
        key.isHovering = true;
        key.side = side;
        this.updateKeyColor(key);
        this.updateKeyIndex(key, fingerIndex);
        hoveringKeys.push(key);
      }
    }
  },

  updateKeyIndex: function (key, fingerIndex = -1) {
    const { text } = key;
    if (fingerIndex >= 0) {
      this.setText(text, fingerIndex + 1);
    } else {
      this.setText(text, "");
    }
  },

  onEntitiesLoaded: function (entities, callback) {
    const firstUnloadedEntity = entities.find((entity) => !entity.hasLoaded);
    if (!firstUnloadedEntity) {
      callback();
    } else {
      firstUnloadedEntity.addEventListener(
        "loaded",
        () => this.onEntitiesLoaded(entities, callback),
        { once: true }
      );
    }
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
      // TODO - UI indicating useSustain?
      this.setEntityVisibility(this.data.sustainText.parentEl, this.useSustain);
    }
  },
  getRawMidi: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/f0bddd08ab091877e63cac2b9a5aa56be29a5a47/Tone/type/Frequency.js#L281
    return 69 + (12 * Math.log(pitch / this.A4)) / Math.LN2;
  },

  playKey: function (key) {
    key.isPlaying = true;
    this.instrument.triggerRelease(key.note);
    this.instrument.triggerAttack(key.note);
    this.animateKeyDown(key);
    this.updateKeyColor(key);
    const triggeredNote = {
      startTime: Tone.now(),
      endTime: Tone.now() + this.data.release,
      finalEndTime: Tone.now() + 5,
    };
    this.triggeredKeys.set(key, triggeredNote);
  },
  clearInstrument: function () {
    this.instrument.releaseAll(Tone.now());
    this.triggeredKeys.clear();
  },

  playTaps: function (taps, side) {
    this.hoveringKeys[side].forEach((hoveringKey, index) => {
      const playKey = taps[index];
      if (playKey) {
        this.playKey(hoveringKey);
      }
    });
  },

  setText: function (text, value, color) {
    if (value || value == "") {
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
        const highlightColors =
          this.highlightColors[side][isSharp ? "black" : "white"];
        color = isPlaying
          ? highlightColors.isPlaying
          : highlightColors.isHovering;
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
      entity.emit("down", null, false);
    } else {
      entity.emit("up", null, false);
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

    this.setHandIndex(Math.floor(this.pianoKeys.length / 2) - 3, "left");
    this.setHandIndex(Math.ceil(this.pianoKeys.length / 2) + 3, "right");
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
