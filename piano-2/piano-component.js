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
    octaveStart: { type: "number", default: 1 },
    whiteKeyDimensions: { type: "vec3", default: { x: 23.75, y: 15, z: 150 } },
    blackKeyDimensions: { type: "vec3", default: { x: 12.5, y: 6, z: 90 } },
    spaceBetweenWhiteKeys: { type: "number", default: 1 },
    release: { type: "number", default: 0.4 },
    handDistanceThreshold: { type: "number", default: 0.05 },
    treeboardTime: { type: "number", default: 500 },
    gapBetweenOptions: { type: "number", default: 0.3 },
    treeboardMaxWidth: { type: "number", default: 0.7 },
    treeboardDistanceThreshold: { type: "number", default: 0.05 },
    treeboardOptionDistanceThreshold: { type: "number", default: 0.05 },
    dragDistanceThreshold: { type: "number", default: 0.1 },
    playSongKeys: { type: "boolean", default: false },
    songScalar: { type: "vec3", default: { x: 1, y: 1, z: 0.2 } },
    songKeyGap: { type: "number", default: 0.01 },
    songTimeScalar: { type: "number", default: 0.5 },
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

    this.hands = {
      left: this.data.leftHand,
      right: this.data.rightHand,
    };
    for (const side in this.hands) {
      const hand = this.hands[side];
      hand.addEventListener("hand-tracking-extras-ready", (event) => {
        hand.jointsAPI = event.detail.data.jointAPI;
        const clearHand = () => {
          const material =
            hand.components["hand-tracking-controls"]?.skinnedMesh?.material;
          if (material) {
            console.log(material);
            material.colorWrite = false;
            clearInterval(intervalId);
          }
        };
        let intervalId = setInterval(() => {
          clearHand();
        }, 1000);
        clearHand();
      });
    }
    this.wristPosition = new THREE.Vector3();
    this.indexTipPosition = new THREE.Vector3();
    this.indexTipDistance = new THREE.Vector3();
    this.entityPosition = new THREE.Vector3();
    this.pinchDrag = new THREE.Vector3();
    this.line3 = new THREE.Line3();
    this.isHandOnDesk = {
      left: true,
      right: true,
    };
    this.lastTimeHandIsOnDesk = {
      left: 0,
      right: 0,
    };

    this.handIndexOffsets = {
      left: 3,
      right: -6,
    };

    this.hand = this.hands[this.data.side];
    this.otherHand = this.hands[this.otherSide];

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

    for (const side in this.hands) {
      if (side != this.data.side) {
        continue;
      }
      const hand = this.hands[side];
      hand.addEventListener("pinchstarted", (event) => {
        this.onPinchStarted(event, side);
      });
      hand.addEventListener("pinchmoved", (event) => {
        this.onPinchMoved(event, side);
      });
      hand.addEventListener("pinchended", (event) => {
        this.onPinchEnded(event, side);
      });
    }

    this.frequency = new Tone.Frequency(440);

    this.audioContext = Tone.context.rawContext._nativeAudioContext;

    this.modes = ["notes", "scale", "perfect", "song"];
    this.modeIndex = 1;

    this.scale = scale;
    this.scale.isPerfect = true;

    this.pianoKeysEntity = this.el.querySelector(".keys");
    this.songKeysEntity = this.el.querySelector(".song");
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
    this.checkWristPositions = AFRAME.utils.throttle(
      this.checkWristPositions,
      100,
      this
    );
    this.checkTreeboardVisibility = AFRAME.utils.throttle(
      this.checkTreeboardVisibility,
      100,
      this
    );
    this.checkHandsForTreeboard = AFRAME.utils.throttle(
      this.checkHandsForTreeboard,
      10,
      this
    );

    // B flat major
    this.songScale = {
      root: "A",
      pitch: "sharp",
      isMajor: true,
      set: () => {
        const { root, pitch, isMajor } = this.songScale;
        this.setScaleExoticScale();
        this.setScaleIsMajor(isMajor);
        this.setScaleRoot(root);
        this.setScalePitch(pitch);
      },
      reset: () => {
        this.setScaleIsMajor(true);
        this.setScaleRoot("C");
        this.setScalePitch("natural");
      },
    };
    // https://youtu.be/jGSuTdHEthc?t=56
    this.songNotes = [
      {
        side: "left",
        notes: ["G2"],
        start: 0,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["D2"],
        start: 1,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 1 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 1 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["G2"],
        start: 2,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 2 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["G3", "A#3"],
        start: 2 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["D2"],
        start: 3,
        duration: 1,
      },
      {
        side: "right",
        notes: ["D4"],
        start: 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["G4"],
        start: 3 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["A#4"],
        start: 3 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["C3"],
        start: 4,
        duration: 1,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 4,
        duration: 2 / 3,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 4 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["D3"],
        start: 5,
        duration: 1,
      },
      {
        side: "right",
        notes: ["C5"],
        start: 5,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["A#4"],
        start: 5 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["A4"],
        start: 5 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["G2"],
        start: 6,
        duration: 1,
      },
      {
        side: "right",
        notes: ["A#4"],
        start: 6,
        duration: 1,
      },

      {
        side: "left",
        notes: ["G2"],
        start: 7,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G4"],
        start: 7,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["A#4"],
        start: 7 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 7 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["C3"],
        start: 8,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G5"],
        start: 8,
        duration: 2 / 3,
      },
      {
        side: "right",
        notes: ["G5"],
        start: 8 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["F3"],
        start: 9,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G5"],
        start: 9,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 9 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["D#5"],
        start: 9 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["A#2"],
        start: 10,
        duration: 1,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 10,
        duration: 1,
      },

      {
        side: "left",
        notes: ["F2"],
        start: 11,
        duration: 1,
      },
      {
        side: "right",
        notes: ["A4"],
        start: 11,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 11 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 11 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["E2"],
        start: 12,
        duration: 1,
      },
      {
        side: "right",
        notes: ["A5"],
        start: 12,
        duration: 2 / 3,
      },
      {
        side: "right",
        notes: ["G5"],
        start: 12 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["A2"],
        start: 13,
        duration: 1,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 13,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["E5"],
        start: 13 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 13 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["D2"],
        start: 14,
        duration: 1,
      },
      {
        side: "right",
        notes: ["G5"],
        start: 14,
        duration: 2 / 3,
      },
      {
        side: "right",
        notes: ["F5"],
        start: 14 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["C2"],
        start: 15,
        duration: 1,
      },
      {
        side: "right",
        notes: ["E5"],
        start: 15,
        duration: 2 / 3,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 15 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["A#2"],
        start: 16,
        duration: 1,
      },
      {
        side: "right",
        notes: ["C5"],
        start: 16,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["A#4"],
        start: 16 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["C5"],
        start: 16 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["A2"],
        start: 17,
        duration: 1,
      },
      {
        side: "right",
        notes: ["D5"],
        start: 17,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["C5"],
        start: 17 + 1 / 3,
        duration: 1 / 3,
      },
      {
        side: "right",
        notes: ["G4"],
        start: 17 + 2 / 3,
        duration: 1 / 3,
      },

      {
        side: "left",
        notes: ["D3"],
        start: 18,
        duration: 1,
      },
      {
        side: "right",
        notes: ["A4"],
        start: 18,
        duration: 1,
      },
    ];

    this.treeboard = {
      templates: {
        option: document.getElementById("treeboardOptionTemplate"),
      },
      _isVisible: false,
      get isVisible() {
        return this._isVisible;
      },
      set isVisible(isVisible) {
        if (this._isVisible != isVisible) {
          this._isVisible = isVisible;
          this._this.setEntityVisibility(this.entity, this.isVisible);
          if (!isVisible) {
            this._this._emit(this.backPlaneEntity, "far");
            this.reset();
          }
        }
      },
      _isClose: false,
      get isClose() {
        return this._isClose;
      },
      set isClose(isClose) {
        if (this._isClose != isClose) {
          this._isClose = isClose;
          this.animateBackPlaneEntity(isClose ? "near" : "far");
          if (!this._isClose) {
            this.isMoving = false;
          }
        }
      },

      _isMoving: false,
      get isMoving() {
        return this._isMoving;
      },
      set isMoving(isMoving) {
        if (this._isMoving != isMoving) {
          this._isMoving = isMoving;
          if (this.isMoving) {
            this.optionsEntityStartX = this.optionsEntity.object3D.position.x;
          }
        }
      },
      tree: {
        mode: {
          ...(() => {
            const modes = {};
            this.modes.forEach((mode, index) => {
              modes[mode] = () => this.updateMode(index, false);
            });
            return modes;
          })(),
        },
        root: {
          ...(() => {
            const roots = {};
            this.scale.allKeys.forEach((root) => {
              if (typeof root == "string") {
                roots[root] = () => this.setScaleRoot(root);
              }
            });
            return roots;
          })(),
        },
        pitch: {
          ...(() => {
            const pitches = {};
            ["natural", "sharp"].forEach((string, index) => {
              pitches[string] = () => this.setScalePitch(string);
            });
            return pitches;
          })(),
        },
        isMajor: {
          ...(() => {
            const isMajors = {};
            ["minor", "major"].forEach((string, index) => {
              isMajors[string] = () => this.setScaleIsMajor(Boolean(index));
            });
            return isMajors;
          })(),
        },
        exoticScale: {
          ...(() => {
            const exoticScales = { none: () => this.setScaleExoticScale() };
            this.scale.exoticScales.forEach((string, index) => {
              exoticScales[string] = () => this.setScaleExoticScale(string);
            });
            return exoticScales;
          })(),
        },
      },
      _this: this,
      animateOptionEntity(optionEntity, eventName) {
        this._this._emit(optionEntity, eventName);
        this._this._emit(optionEntity._plane, eventName);
      },
      animateBackPlaneEntity(eventName) {
        this._this._emit(this.backPlaneEntity, eventName);
      },
      update() {
        this.options = this.getOptions();
        this.optionEntityPool.forEach((optionEntity) => {
          this.animateOptionEntity(optionEntity, "reset");
          this._this.hideEntity(optionEntity);
          optionEntity._available = true;
        });

        this._this.setText(
          this.pathEntity.querySelector("a-text"),
          `/${this.path.join("/")}`
        );

        const addOption = (option) => {
          let optionEntity = this.optionEntityPool.find(
            (optionEntity) => optionEntity._available
          );
          if (!optionEntity) {
            optionEntity = this.templates.option.content
              .cloneNode(true)
              .querySelector(".treeboardOption");
            optionEntity._text = optionEntity.querySelector("a-text");
            optionEntity._plane = optionEntity.querySelector("a-plane");
            optionEntity._box = new THREE.Box3();
            this.optionEntityPool.push(optionEntity);
            this.optionsEntity.appendChild(optionEntity);
          } else {
            optionEntity._available = false;
            optionEntity._isNear = false;
            optionEntity._isPinched = false;
          }
          optionEntity._option = option;
          this._this.showEntity(optionEntity);
          this._this.setText(optionEntity.querySelector("a-text"), option);
        };
        if (this.path.length > 0 && !this.options["go back"]) {
          addOption("go back");
        }
        for (const option in this.options) {
          addOption(option);
        }

        let optionsWidth = 0;
        this.optionEntities = this.optionEntityPool.filter(
          (optionEntity) => !optionEntity._available
        );
        this._this.onEntitiesLoaded(
          [...this.optionEntities, this.backPlaneEntity],
          () => {
            this.optionEntities.forEach((optionEntity, index) => {
              optionEntity.object3D.position.x = optionsWidth / 10;

              optionsWidth += optionEntity._plane._totalWidth;
              optionsWidth += this._this.data.gapBetweenOptions;
            });
            optionsWidth -= this._this.data.gapBetweenOptions;
            optionsWidth /= 10;

            this.backPlaneEntity.setAttribute("width", optionsWidth);
            this.backPlaneEntity.object3D.position.x = optionsWidth / 2;

            if (optionsWidth > this._this.data.treeboardMaxWidth) {
              this.optionsEntity.object3D.position.x = 0;
            } else {
              this.optionsEntity.object3D.position.x = -optionsWidth / 2;
            }
            this.optionsWidth = optionsWidth;

            this.updateBoxes();
          }
        );
      },
      updateBoxes() {
        setTimeout(() => {
          this.optionEntities.forEach((optionEntity, index) => {
            optionEntity._box.setFromObject(optionEntity.object3D);
          });
          this.optionsEntity._box = this.optionsEntity._box || new THREE.Box3();
          this.optionsEntity._box.setFromObject(this.optionsEntity.object3D);
        }, 100);
      },
      getOptions() {
        let options = this.tree;
        this.path.every((string) => {
          options = options[string];
          return options;
        });
        return options;
      },
      select(option) {
        if (option in this.options) {
          const value = this.options[option];
          switch (typeof value) {
            case "object":
              this.path.push(option);
              this.update();
              break;
            case "function":
              value();
              this.reset();
              break;
          }
        } else {
          if (option == "go back") {
            this.goBack();
          } else {
            console.warn(`no option "${option}"`);
          }
        }
      },
      goBack() {
        this.path.pop();
        this.update();
      },
      reset() {
        this.path.length = 0;
        this.update();
      },
      optionEntityPool: [],
      optionEntities: [],
      path: [],
      pathString: "",
      pathEntity: this.el.querySelector(".path"),
      backPlaneEntity: this.el.querySelector(".treeboard .options .back"),
      optionsEntity: this.el.querySelector(".treeboard .options"),
      entity: this.el.querySelector(".treeboard"),
      getNearOptionEntity() {
        return this.optionEntities.find((optionEntity) => optionEntity._isNear);
      },
    };
    this.treeboard.getOptions();

    this.el.addEventListener(
      "loaded",
      () => {
        this._createPiano();
        //this.setScaleRoot("G");
        //this.setScaleIsMajor(false);
        this._onScaleUpdate();
        this.onEntitiesLoaded(
          this.pianoKeys.map((key) => key.entity),
          () => {
            this.hasPianoLoaded = true;
            this.onPianoPlacement();
            this.onModeIndexUpdate();
            this.treeboard.update();
          }
        );
      },
      { once: true }
    );
  },

  onPinchStarted: function (event, side) {
    if (this.treeboard.isClose && !this.treeboard.isMoving) {
      const nearOption = this.treeboard.getNearOptionEntity();
      if (nearOption) {
        this.treeboard.animateOptionEntity(nearOption, "pinch");
        nearOption._isPinched = true;
      }
      this.hands[side].isPinching = true;
      const { position } = event.detail;
      this.startPinchPosition = position.clone();
      this.treeboard.isMoving = true;
    }
  },
  onPinchMoved: function (event, side) {
    if (this.treeboard.isMoving) {
      const { position } = event.detail;
      this.pinchDrag.subVectors(position, this.startPinchPosition);

      const nearOption = this.treeboard.getNearOptionEntity();
      if (
        nearOption &&
        Math.abs(this.pinchDrag.x) > this.data.dragDistanceThreshold
      ) {
        if (nearOption) {
          this.treeboard.animateOptionEntity(nearOption, "far");
          nearOption._isPinched = false;
        }
      }

      let optionsEntityStartX =
        this.treeboard.optionsEntityStartX + this.pinchDrag.x;
      optionsEntityStartX = THREE.MathUtils.clamp(
        optionsEntityStartX,
        -this.treeboard.optionsWidth,
        this.treeboard.optionsWidth / 2
      );
      this.treeboard.optionsEntity.object3D.position.x = optionsEntityStartX;

      this.treeboard.updateBoxes();
    }
  },
  onPinchEnded: function (event, side) {
    this.hands[side].isPinching = false;

    if (this.treeboard.isMoving) {
      this.treeboard.isMoving = false;
      const optionEntity = this.treeboard.getNearOptionEntity();
      if (optionEntity?._isPinched) {
        this.treeboard.select(optionEntity._option);
      }
    }
  },

  updateTextWidth: function (entity) {
    const text = entity.querySelector("a-text");
    const plane = entity.querySelector("a-plane");
    this.onEntityLoaded(plane, () => {
      const align = text.getAttribute("text").align;
      const data = text.components.text.data;
      const totalWidth =
        (data.value.length + 1) * (data.width / data.wrapCount);
      plane.setAttribute("width", totalWidth);
      plane._totalWidth = totalWidth;
      if (align == "center") {
        plane.object3D.position.x = 0;
      } else {
        let xOffset = totalWidth / 2;
        if (align == "right") {
          xOffset *= -1;
        }
        plane.object3D.position.x = xOffset;
      }
    });
  },

  tick: function (time, timeDelta) {
    if (this.hasPianoLoaded) {
      this.checkTriggeredKeys(time, timeDelta);
      this.checkWristPositions(time, timeDelta);
      this.checkTreeboardVisibility(time, timeDelta);
      this.checkHandsForTreeboard(time, timeDelta);
      if (this.isSongPlaying) {
        this.songTick(time, timeDelta);
      }
    }
  },

  hideHands: function () {
    for (const side in this.hands) {
      const hand = this.hands[side];
      hand.components[
        "hand-tracking-controls"
      ].skinnedMesh.material.colorWrite = false;
    }
  },

  checkTriggeredKeys: function (time, timeDelta) {
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

  checkTreeboardVisibility: function (time, timeDelta) {
    this.treeboard.isVisible =
      time - this.lastTimeHandIsOnDesk[this.data.side] >
      this.data.treeboardTime;
  },

  onPianoPlacement: function () {
    const { line3 } = this;
    this.pianoKeys[0].entity.object3D.getWorldPosition(line3.start);

    this.pianoKeys[this.pianoKeys.length - 1].entity.object3D.getWorldPosition(
      line3.end
    );
  },

  checkWristPositions: function (time, timeDelta) {
    const { wristPosition, line3 } = this;

    for (const side in this.hands) {
      const hand = this.hands[side];
      if (this.isHandVisible(side) && hand.jointsAPI) {
        let handIndex;
        hand.jointsAPI.getWrist().getPosition(wristPosition);
        this.isHandOnDesk[side] =
          Math.abs(wristPosition.y - this.el.object3D.position.y) <
          this.data.handDistanceThreshold;
        if (this.isHandOnDesk[side]) {
          this.lastTimeHandIsOnDesk[side] = time;
        }
        if (this.isHandOnDesk[side]) {
          const interpolation = line3.closestPointToPointParameter(
            wristPosition,
            true
          );
          this.pianoKeys.some((key, keyIndex) => {
            handIndex = keyIndex;
            return key.interpolation >= interpolation;
          });

          handIndex += this.handIndexOffsets[side];
          this.setHandIndex(handIndex, side);
        }
      }
    }
  },

  checkHandsForTreeboard: function (time, timeDelta) {
    const { indexTipPosition, indexTipDistance, entityPosition } = this;

    if (this.treeboard.isVisible) {
      for (const side in this.hands) {
        if (side != this.data.side) {
          continue;
        }

        if (!this.isHandOnDesk[side]) {
          const hand = this.hands[side];
          hand.jointsAPI.getIndexTip().getPosition(indexTipPosition);
          this.treeboard.backPlaneEntity.object3D.getWorldPosition(
            entityPosition
          );

          this.treeboard.isClose =
            this.treeboard.optionsEntity._box.distanceToPoint(
              indexTipPosition
            ) < this.data.treeboardDistanceThreshold;
          if (this.treeboard.isClose) {
            let closestOptionEntity;
            let closestOptionEntityDistance = Infinity;
            this.treeboard.optionEntities.forEach((optionEntity) => {
              const distanceToOptionEntity =
                optionEntity._box.distanceToPoint(indexTipPosition);
              if (
                distanceToOptionEntity <
                this.data.treeboardOptionDistanceThreshold
              ) {
                if (distanceToOptionEntity < closestOptionEntityDistance) {
                  closestOptionEntityDistance = distanceToOptionEntity;
                  closestOptionEntity = optionEntity;
                }
              }
            });
            const nearOption = this.treeboard.getNearOptionEntity();
            if (nearOption && closestOptionEntity != nearOption) {
              nearOption._isNear = false;
              this.treeboard.animateOptionEntity(nearOption, "far");
            }

            if (closestOptionEntity && !hand.isPinching) {
              if (!closestOptionEntity._isNear) {
                closestOptionEntity._isNear = true;
                this.treeboard.animateOptionEntity(closestOptionEntity, "near");
              }
            }
          } else {
            const nearOption = this.treeboard.getNearOptionEntity();
            if (nearOption) {
              nearOption._isNear = false;
              this.treeboard.animateOptionEntity(nearOption, "far");
            }
          }
          break;
        }
      }
    }
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

        const text = entity.querySelector("a-text.bottom");
        const text2 = entity.querySelector("a-text.top");

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
        textPosition[z] = (depth - 0.01);

        entity.setAttribute("position", position.join(" "));
        box.setAttribute("position", boxPosition.join(" "));
        text.setAttribute("position", textPosition.join(" "));
        
        textPosition[z] = 0.01
        text2.setAttribute("position", textPosition.join(" "));

        const pianoKey = {
          frequency,
          entity,
          box,
          note,
          isSharp,
          _note,
          text,
          text2,
          texts: [text],
          x: position[x],
        };
        this.pianoKeys.push(pianoKey);
        this.pianoKeysByNote[note] = pianoKey;
        this.pianoKeysEntity.appendChild(entity);
      }
    }
    baseFrequency.dispose();

    this.pianoWidth =
      (whiteKeyIndex - 1) *
      (this.keyDimensions.white.x + spaceBetweenWhiteKeys);
    this.pianoKeysEntity.setAttribute(
      "position",
      [-this.pianoWidth / 2, 0, 0].join(" ")
    );

    this.pianoKeys.forEach((key, index) => {
      key.interpolation = key.x / this.pianoWidth;
    });
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
    const { texts } = key;
    texts.forEach(text => {
          if (fingerIndex >= 0) {
      this.setText(text, fingerIndex + 1);
    } else {
      this.setText(text, "");
    }
    })

  },

  onEntityLoaded: function (entity, callback) {
    return this.onEntitiesLoaded([entity], callback);
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
    this.setText(this.data.modeText, this.mode);

    switch (this.mode) {
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
      this.startSong();
    } else {
      this.stopSong();
    }

    this._onScaleUpdate();
  },

  setupSong: function () {
    if (this.didSetupSong) {
      return;
    }
    this.didSetupSong = true;

    this.songNotes.forEach((songNote, index) => {
      const { side, notes, start, duration } = songNote;
      const pianoKeys = notes.map((note) => this.pianoKeysByNote[note]);
      songNote.keys = pianoKeys.map((pianoKey) => {
        const songKey = Object.assign({}, pianoKey);
        songKey.entity = pianoKey.entity.cloneNode(true);
        songKey.box = songKey.entity.querySelector("a-box");
        songKey.isHovering = false;
        songKey.enabled = true;
        songKey.side = side;
        return songKey;
      });

      songNote.keys.forEach((songKey) => {
        this.onEntityLoaded(songKey.entity, () => {
          const boxDepth =
            duration * this.data.songScalar.z - this.data.songKeyGap;
          const boxPosition = songKey.box.object3D.position;
          boxPosition.z = -boxDepth / 2;

          songKey.box.setAttribute("depth", boxDepth);

          const position = songKey.entity.object3D.position;
          position.z = -start * this.data.songScalar.z;
          songKey.entity._z = position.z;
        });
        this.updateKeyColor(songKey);
        this.songKeysEntity.appendChild(songKey.entity);
      });
    });
  },
  startSong: function () {
    this.clearInstrument();
    this.isSongPlaying = true;
    this.songScale.set();
    this.songStartTime = Tone.now() + 1;
    this.songNotes.forEach((songNote) => {
      const { keys } = songNote;
      songNote.didPlay = false;
      songNote.didFinish = false;
      keys.forEach((key) => {
        key.entity.object3D.scale.z = 1;
        key.entity.object3D.position.z = key.entity._z;
        this.showEntity(key.entity);
      });
    });
    this.showEntity(this.songKeysEntity);
  },
  stopSong: function () {
    if (this.isSongPlaying) {
      this.isSongPlaying = false;
      this.hideEntity(this.songKeysEntity);
      this.songScale.reset();
      this.clearInstrument();
    }
  },
  songTick: function (time, timeDelta) {
    const now = Tone.now();
    let songTime = now - this.songStartTime;
    songTime *= this.data.songTimeScalar;
    this.songKeysEntity.object3D.position.z = songTime * this.data.songScalar.z;
    this.songNotes.forEach((songNote) => {
      const { keys, start, duration, notes } = songNote;
      if (songTime >= start) {
        if (!songNote.didPlay) {
          songNote.didPlay = true;
          if (this.data.playSongKeys) {
            notes.forEach((note) => {
              this.playKey(this.pianoKeysByNote[note], duration);
            });
          }
        }

        if (songTime >= start + duration && !songNote.didFinish) {
          songNote.didFinish = true;
          keys.forEach((key) => {
            this.hideEntity(key.entity);
          });
        } else {
          const durationInterpolation = 1 - (songTime - start) / duration;
          keys.forEach((key) => {
            key.entity.object3D.scale.z = durationInterpolation;
            key.entity.object3D.position.z = -songTime * this.data.songScalar.z;

            // FILL - counter position
          });
        }
      }
    });
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  setEntityVisibility: function (entity, visibility) {
    this.onEntityLoaded(entity, () => {
      if (entity && entity.object3D.visible != visibility) {
        entity.object3D.visible = visibility;
      }
    });
  },
  showEntity: function (entity) {
    this.setEntityVisibility(entity, true);
  },
  hideEntity: function (entity) {
    this.setEntityVisibility(entity, false);
  },

  setSustain: function (useSustain) {
    if (this.useSustain != useSustain) {
      this.useSustain = useSustain;
      this.setEntityVisibility(this.data.sustainText.parentEl, this.useSustain);
    }
  },
  getRawMidi: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/f0bddd08ab091877e63cac2b9a5aa56be29a5a47/Tone/type/Frequency.js#L281
    return 69 + (12 * Math.log(pitch / this.A4)) / Math.LN2;
  },

  playKey: function (key, release = this.data.release) {
    key.isPlaying = true;
    this.instrument.triggerRelease(key.note);
    this.instrument.triggerAttack(key.note);
    this.animateKeyDown(key);
    this.updateKeyColor(key);
    const triggeredNote = {
      startTime: Tone.now(),
      endTime: Tone.now() + release,
      finalEndTime: Tone.now() + 5,
    };
    this.triggeredKeys.set(key, triggeredNote);
  },
  clearInstrument: function () {
    this.instrument.releaseAll(Tone.now());
    this.triggeredKeys.clear();
  },

  playTaps: function (taps, side) {
    if (!this.isHandOnDesk[side]) {
      return;
    }

    const isPerfectMode = this.mode == "perfect";
    let hoveringKeys = this.hoveringKeys[side];
    if (side == "left") {
      hoveringKeys = hoveringKeys.slice().reverse();
      taps = taps.slice().reverse();
    }
    let skips = 0;
    hoveringKeys.forEach((hoveringKey, index) => {
      let shouldPlayKey = taps[index];
      if (shouldPlayKey && isPerfectMode) {
        let keyIndex = this.pianoKeys.indexOf(hoveringKey);
        for (let skip = 0; skip < skips; skip++) {
          keyIndex = this.getNextClosestValidPianoKeyIndex(keyIndex, "right");
        }
        hoveringKey = this.pianoKeys[keyIndex];
        skips++;
      }
      if (shouldPlayKey) {
        this.playKey(hoveringKey);
      }
    });
  },

  setText: function (text, value, color) {
    this.onEntityLoaded(text, () => {
      if (value || value == "") {
        text.setAttribute("text", "value", value);
        if (text.parentEl.querySelector("a-plane")) {
          this.updateTextWidth(text.parentEl);
        }
        //this.showEntity(text.parentEl);
        if (color) {
          text.setAttribute("color", color);
        }
      }
    });
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

  _emit: function (entity, eventName) {
    entity.emit(eventName, null, false);
  },
  animateKey: function (key, isDown = true) {
    const { entity } = key;
    if (isDown) {
      this._emit(entity, "down");
    } else {
      this._emit(entity, "up");
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
    this.setScaleIsMajor(true);
    if (typeof exoticScale == "number") {
      this.scale.exoticScaleIndex = exoticScale;
    } else {
      this.scale.exoticScale = exoticScale;
    }
    this._onScaleUpdate();
  },
  _onScaleUpdate: function () {
    const useAllKeys = this.mode == "notes";
    const scaleKeys = useAllKeys ? this.scale.allKeys : this.scale.keys;

    this.scaleKeys = scaleKeys.map((key) => {
      if (Array.isArray(key)) {
        return key.find((_key) => _key.includes("#"));
      } else {
        return key;
      }
    });

    this.setText(this.data.scaleText, this.scale.name);

    this.pianoKeys.forEach((key) => {
      key.enabled = this.scaleKeys.includes(key._note);
      if (this.mode == "song") {
        // SONG EXCEPTIONS
        key.enabled = key.enabled || key._note == "E";
      }
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
