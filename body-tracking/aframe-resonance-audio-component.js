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
    "left-wall": { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    "right-wall": { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    "front-wall": { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    "back-wall": { default: "sheet-rock", oneOf: RESONANCE_MATERIAL },
    "down-wall": { default: "wood-panel", oneOf: RESONANCE_MATERIAL },
    "up-wall": { default: "wood-ceiling", oneOf: RESONANCE_MATERIAL }
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
      left: this.data["left-wall"],
      right: this.data["right-wall"],
      front: this.data["front-wall"],
      back: this.data["back-wall"],
      down: this.data["down-wall"],
      up: this.data["up-wall"]
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
          },
          { once: true }
        );
      }
    });
    this.audioContext.dispatchEvent(new Event("statechange"));
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
    this.source.setGain(this.data.gain);
    this.audioElementSource.connect(this.source.input);
    this.audioElement.loop = this.data.loop;
  },
  tick: function() {
    if (this.source) {
      this.source.setFromMatrix(this.el.object3D.matrixWorld);
    }
  }
});
