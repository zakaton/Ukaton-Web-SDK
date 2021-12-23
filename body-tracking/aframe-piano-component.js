/* global AFRAME, THREE */

AFRAME.registerSystem("piano", {
  schema: {},

  init: function() {
    this.entities = [];
    this.keys = [
      { letter: "C", frequency: 261.6256 },
      { letter: "C#", frequency: 277.1826 },
      { letter: "D", frequency: 293.6648 },
      { letter: "D#", frequency: 311.127 },
      { letter: "E", frequency: 329.6276 },
      { letter: "F", frequency: 349.2282 },
      { letter: "F#", frequency: 369.9944 },
      { letter: "G", frequency: 391.9954 },
      { letter: "G#", frequency: 415.3047 },
      { letter: "A", frequency: 440.0 },
      { letter: "A#", frequency: 466.1638 },
      { letter: "B", frequency: 493.8833 },
      { letter: "C", frequency: 523.2511 }
    ];
  },

  addEntity: function(entity) {
    this.entities.push(entity);
  },
  removeEntity: function(entity) {
    this.entities.splice(this.entities.indexOf(entity), 1);
  },

  tick: function(time, timeDelta) {
    this.entities.forEach(entity => entity.tick(...arguments));
  }
});

AFRAME.registerComponent("piano", {
  schema: {
    gain: { type: "number", default: 1 },
    attack: { type: "number", default: 0.02 },
    delay: { type: "number", default: 0.2 },
    sustain: { type: "number", default: 0.8 },
    release: { type: "number", default: 0.05 }
  },
  init: function() {
    window._piano = this;

    this.keys = [];
    this.oldPosition = this.el.object3D.position.clone();

    if (this.el.sceneEl.systems["resonance-audio"]) {
      this.onLoadedResonanceAudio();
    } else {
      this.el.sceneEl.addEventListener(
        "loadedresonanceaudio",
        event => {
          this.onLoadedResonanceAudio();
        },
        { once: true }
      );
    }
  },

  onLoadedResonanceAudio: function() {
    this.audioSystem = this.el.sceneEl.systems["resonance-audio"];
    this.audioContext = this.audioSystem.audioContext;

    let xOffset = 0;
    this.system.keys.forEach(({ letter, frequency }, index) => {
      const key = document.createElement("a-plane");
      key.classList.add("key");
      const isSharp = letter.includes("#");
      let width = 0.2;
      if (isSharp) {
        width /= 2;
      }
      let height = 0.01;
      if (isSharp) {
        height *= 2;
      }
      const originalLength = 0.8;
      let length = originalLength;
      if (isSharp) {
        length *= 0.6;
      }

      if (!isSharp && index < this.system.keys.length - 1) {
        const divider = document.createElement("a-plane");
        divider.setAttribute("scale", `0.01 ${length} 1`);
        divider.setAttribute("rotation", "-90 0 0");
        divider.setAttribute(
          "position",
          `${xOffset + width / 2} ${height * 1.5} 0`
        );
        divider.setAttribute("color", "black");
        this.el.appendChild(divider);
      }

      key.setAttribute("scale", `${width} ${length} 1`);
      key.setAttribute("rotation", "-90 0 0");
      key.setAttribute(
        "position",
        `${xOffset - (isSharp ? width : 0)} ${height} ${
          isSharp ? -(originalLength - length) / 2 : 0
        }`
      );
      key.dataset.letter = letter;
      if (!isSharp) {
        xOffset += width;
      }

      const color = isSharp ? "black" : "white";
      key.setAttribute("color", color);

      const oscillator = this.audioContext.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      oscillator.start();
      key.oscillator = oscillator;

      const gain = this.audioContext.createGain();
      key.gain = gain;
      key.gain.gain.value = 0;
      oscillator.connect(gain);

      const source = this.audioSystem.resonanceAudioScene.createSource();
      source.setDirectivityPattern(0);
      gain.connect(source.input);
      key.source = source;
      this._updateKeyGain(key);

      key.isDown = false;
      key.addEventListener("down", event => {
        if (key.isDown) return;
        key.isDown = true;
        let velocity = (event.detail && event.detail.velocity) || 1;
        let newColor = (event.detail && event.detail.color) || "yellow";
        key.gain.gain.setTargetAtTime(
          velocity,
          this.audioContext.currentTime,
          this.data.attack
        );
        key.gain.gain.setTargetAtTime(
          this.data.sustain,
          this.audioContext.currentTime + this.data.attack,
          this.data.delay
        );
        key.setAttribute(
          "animation",
          `property: components.material.material.color; type: color; to: ${newColor}; dur: 80`
        );
      });
      key.addEventListener("up", event => {
        key.isDown = false;
        key.setAttribute(
          "animation",
          `property: components.material.material.color; type: color; to: ${color}; dur: 80`
        );
        key.gain.gain.setTargetAtTime(
          0,
          this.audioContext.currentTime,
          this.data.release
        );
      });
      this.keys.push(key);
      this.el.appendChild(key);
      key.addEventListener("loaded", event => {
        this._updateKeyPosition(key);
      });
    });

    this.system.addEntity(this);
  },
  getClosestKey: function(position) {
    const planeVertices = [];
    for (let i = 0; i < 4; i++) {
      planeVertices[i] = new THREE.Vector3();
    }
    const flatVertex = new THREE.Vector2();
    const flatPosition = new THREE.Vector2(position.x, position.z);
    return this.keys.find(key => {
      const mesh = key.getObject3D("mesh");
      const matrix = mesh.matrixWorld;
      const vertexBuffer = mesh.geometry.attributes.position.array;
      const box2 = new THREE.Box2();
      planeVertices.forEach((vertex, index) => {
        vertex.set(
          vertexBuffer[index * 3],
          vertexBuffer[index * 3 + 1],
          vertexBuffer[index * 3 + 2]
        );
        vertex.applyMatrix4(matrix);
        flatVertex.set(vertex.x, vertex.z);
        box2.expandByPoint(flatVertex);
      });
      return box2.containsPoint(flatPosition);
    });
  },
  tick: function() {
    if (this.oldPosition.distanceTo(this.el.object3D.position) > 0) {
      this.oldPosition.copy(this.el.object3D.position);
      this._updateKeyPositions();
    }
  },
  _updateKeyPositions: function() {
    this.keys.forEach(key => {
      this._updateKeyPosition(key);
    });
  },
  _updateKeyPosition: function(key) {
    if (key.source) {
      key.source.setPosition(...key.object3D.position.toArray());
    }
  },
  _updateKeyGains: function() {
    this.keys.forEach(key => {
      this._updateKeyGain(key);
    });
  },
  _updateKeyGain: function(key) {
    if (key.source) {
      key.source.setGain(this.data.gain);
    }
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("gain") && this.audioSystem) {
      this._updateKeyGains();
    }
  },
  remove: function() {
    this.system.removeEntity(this);
  }
});
