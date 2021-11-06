// based off https://github.com/etiennepinchon/aframe-resonance/blob/master/src/index.js but using a single resonance audio scene
/* global ResonanceAudio, AFRAME, THREE */

const RESONANCE_MATERIAL = Object.keys(
  ResonanceAudio.Utils.ROOM_MATERIAL_COEFFICIENTS
);

// https://aframe.io/docs/1.2.0/core/systems.html#registering-a-system
AFRAME.registerSystem("resonance-audio", {
  schema: {
    gain: { type: "number", default: 0 },
    width: { type: "number", default: 2 },
    height: { type: "number", default: 2 },
    depth: { type: "number", default: 2 },
    listener: {type: "string", default: ""},
    ambisonicOrder: {
      type: "number",
      default: ResonanceAudio.Utils.DEFAULT_AMBISONIC_ORDER
    },
    left: { oneOf: RESONANCE_MATERIAL },
    right: { oneOf: RESONANCE_MATERIAL },
    front: { oneOf: RESONANCE_MATERIAL },
    back: { oneOf: RESONANCE_MATERIAL },
    down: { oneOf: RESONANCE_MATERIAL },
    up: { oneOf: RESONANCE_MATERIAL },
  },
  init: function() {
    this.audioContext = THREE.AudioContext.getContext();

    this.resonanceAudioScene = this.audioContext.resonanceAudioScene = new ResonanceAudio(this.audioContext);
    this.resonanceAudioScene.output.connect(this.audioContext.destination);
    const roomDimensions = {
      width: this.data.width,
      height: this.data.height,
      depth: this.data.depth
    };
    const roomMaterials = {
      left: this.data["left"],
      right: this.data["right"],
      front: this.data["front"],
      back: this.data["back"],
      down: this.data["down"],
      up: this.data["up"]
    };
    
    if (this.data.listener.length > 0) {
      this.listenerEntity = document.querySelector(this.data.listener);
    }

    this.resonanceAudioScene.output.gain.value = this.data.gain;
    this.resonanceAudioScene.setRoomProperties(roomDimensions, roomMaterials);
    this.resonanceAudioScene.setAmbisonicOrder(this.data.ambisonicOrder);

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
      } else {
        this.resonanceAudioScene.output.gain.value = this.data.gain;
      }
    });
    this.audioContext.dispatchEvent(new Event("statechange"));
  },
  update: function(oldData) {
    if ("gain" in this.data) {
      this.resonanceAudioScene.output.gain.value = this.data.gain;
    }
  },
  tick: function() {
    const matrixWorld = this.listenerEntity? this.listenerEntity.object3D.matrixWorld : this.sceneEl.camera.matrixWorld;
    this.resonanceAudioScene.setListenerFromMatrix(matrixWorld);
  }
});

AFRAME.registerComponent("resonance-audio", {
  schema: {
    src: { type: "asset" },
    loop: { type: "boolean", default: false },
    gain: { default: 1 },
    autoplay: { type: "boolean", default: false }
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
    this.audioElement.addEventListener("ended", event => {
      console.log(event);
      this.el.emit("audioended");
    });
    this.audioElement.loop = this.data.loop;
    this.audioElement.autoplay = this.data.autoplay;
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.load();
    this.audioElementSource = this.system.audioContext.createMediaElementSource(
      this.audioElement
    );
    this.source = this.system.resonanceAudioScene.createSource();
    this.source.setGain(this.data.gain);
    this.audioElementSource.connect(this.source.input);
    this.audioElement.src = this.data.src;
    if (this.data.autoplay) {
      document.addEventListener("click", event => {
        this.audioElement.play();
      }, {once: true})
    }
  },
  tick: function() {
    if (this.source) {
      this.source.setFromMatrix(this.el.object3D.matrixWorld);
    }
  }
});
