// based off https://github.com/etiennepinchon/aframe-resonance/blob/master/src/index.js but using a single resonance audio scene
/* global ResonanceAudio, AFRAME, THREE */

const RESONANCE_MATERIAL = Object.keys(
  ResonanceAudio.Utils.ROOM_MATERIAL_COEFFICIENTS
);

// https://aframe.io/docs/1.2.0/core/systems.html#registering-a-system
AFRAME.registerSystem("resonance-audio", {
  schema: {
    gain: { type: "number", default: 1 },
    width: { type: "number", default: 2 },
    height: { type: "number", default: 2 },
    depth: { type: "number", default: 2 },
    leftWall: { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    rightWall: { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    frontWall: { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    backWall: { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    downWall: { default: "wood-panel", oneOf: RESONANCE_MATERIAL },
    upWall: { default: "wood-ceiling", oneOf: RESONANCE_MATERIAL }
  },
  init: function() {
    this.audioContext = THREE.AudioContext.getContext();
    this.resonanceAudioScene = new ResonanceAudio(this.audioContext);
    this.resonanceAudioScene.output.connect(this.audioContext.destination);
    const roomDimensions = {
      width: this.data.width,
      height: this.data.height,
      depth: this.data.depth
    };
    const roomMaterials = {
      left: this.data.leftWall,
      right: this.data.rightWall,
      front: this.data.frontWall,
      back: this.data.backWall,
      down: this.data.downWall,
      up: this.data.upWall
    };
    this.resonanceAudioScene.output.gain.value = this.data.gain;
    this.resonanceAudioScene.setRoomProperties(roomDimensions, roomMaterials);

    this.audioContext.addEventListener("statechange", event => {
      if (this.audioContext.state !== "running") {
        this.resonanceAudioScene.output.gain.value = 0;
        this.sceneEl.emit("muted");
        document.addEventListener(
          "click",
          event => {
            this.audioContext.resume();
            this.resonanceAudioScene.output.gain.value = 1;
          },
          { once: true }
        );
      }
    });
    this.audioContext.dispatchEvent(new Event("statechange"));
    this.el.emit("loadedresonanceaudio");
  },
  tick: function() {
    this.resonanceAudioScene.setListenerFromMatrix(
      this.sceneEl.camera.matrixWorld
    );
  }
});

AFRAME.registerComponent("resonance-audio", {
  schema: {
    src: { type: "asset" },
    loop: { type: "boolean", default: false },
    gain: { default: 1 }
  },
  init: function() {
    if (!this.data.src) {
      return;
    }

    this.oldPosition = new THREE.Vector3();

    this.audioElement = document.createElement("audio");
    this.el.addEventListener("playaudio", () => {
      if (this.system.audioContext.state == "running") {
        this.audioElement.play().catch(error => {
          document.addEventListener(
            "click",
            event => {
              this.audioElement.play();
            },
            { once: true }
          );
        });
      }
    });
    this.audioElement.addEventListener("ended", () => {
      this.el.emit("audioended");
    });
    this.audioElement.src = this.data.src;
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.load();
    this.audioElementSource = this.system.audioContext.createMediaElementSource(
      this.audioElement
    );
    this.source = this.system.resonanceAudioScene.createSource();
    //this.source.setDirectivityPattern(1, Infinity);
    this.source.setGain(this.data.gain);
    this.audioElementSource.connect(this.source.input);
    this.audioElement.loop = this.data.loop;
  },
  tick: function() {
    if (this.source) {
      const position = new THREE.Vector3();
      this.el.object3D.getWorldPosition(position);
      if (this.oldPosition.distanceTo(position) > 0) {
        //this.source.setPosition(...position.toArray());
        this.source.setFromMatrix(this.el.object3D.matrixWorld);
        this.oldPosition.copy(position);
      }
    }
  }
});
