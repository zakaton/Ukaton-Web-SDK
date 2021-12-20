/* global AFRAME, THREE */

AFRAME.registerSystem("dance", {
  schema: {},

  init: function() {
    this.entities = [];

    this.assetsEl = this.el.sceneEl.querySelector("a-assets");
    if (!this.assetsEl) {
      this.assetsEl = document.createElement("a-assets");
      this.el.sceneEl.appendChild(this.assetsEl);
    }

    this.metronomeAudio = document.createElement("audio");
    this.metronomeAudio.id = "metronomeSound";
    this.metronomeAudio.setAttribute(
      "src",
      "https://cdn.glitch.me/6c283599-191e-4c4a-b236-e1e1f0d90e7a%2Fmetronome.mp3?v=1638826473898"
    );
    this.assetsEl.appendChild(this.metronomeAudio);

    this.stepImage = document.createElement("img");
    this.stepImage.id = "stepImage";
    this.stepImage.setAttribute(
      "src",
      "https://cdn.glitch.me/6c283599-191e-4c4a-b236-e1e1f0d90e7a%2Fstep.svg?v=1638828551654"
    );
    this.assetsEl.appendChild(this.stepImage);
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

AFRAME.registerComponent("dance", {
  schema: {
    bpm: { type: "number", default: 60 },
    preview: { type: "boolean", default: false }
  },
  init: function() {
    window._dance = this;

    this.addedNodeObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(addedNode => {
          this.setupStep(addedNode);
        });

        if (mutation.addedNodes.length + mutation.removedNodes.length > 0) {
          this.updateStepNumbers();
        }
      });
    });
    this.addedNodeObserver.observe(this.el, {
      subtree: false,
      childList: true
    });

    this.updatedStepObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        const step = mutation.target;
        const attribute = mutation.attributeName;
        const value = step.getAttribute(attribute);
        this.updateStep(step, attribute, value);
      });
    });
    this.updatedStepObserver.observe(this.el, {
      subtree: true,
      childList: false,
      attributeFilter: [
        "data-side",
        "data-color",
        "data-number",
        "data-opacity"
      ]
    });

    this.el.childNodes.forEach(childNode => this.setupStep(childNode));
    this.updateStepNumbers();

    this.el.addEventListener("start", this.onstart.bind(this));
  },
  setupStep: function(step) {
    if (step.isEntity) {
      const text = document.createElement("a-text");
      text.setAttribute("align", "center");
      text.setAttribute("width", "2.8");
      text.setAttribute("rotation", "-90 0 0");
      text.setAttribute("position", "0 0.02 -0.070");
      step.appendChild(text);
      step.text = text;

      const image = document.createElement("a-image");
      image.setAttribute("src", `#${this.system.stepImage.id}`);
      image.setAttribute("material", "shader: standard; emissiveIntensity: 1;");
      image.setAttribute("rotation", "-90 0 0");
      image.setAttribute(
        "scale",
        `${0.151 * (step.dataset.side == "right" ? -1 : 1)} 0.331 1`
      );
      image.setAttribute("position", "0 0.01 0");
      step.appendChild(image);
      step.image = image;

      step.setAttribute("resonance-audio", "src: #metronomeSound");

      step.dataset.opacity = 0;
    }
  },
  iterateSteps: async function(callback) {
    const reachedFirstStep = {
      left: false,
      right: false
    };
    let number = 1;
    for (
      let childIndex = 0;
      childIndex < this.el.childElementCount;
      childIndex++
    ) {
      const childNode = this.el.children[childIndex];
      const side = childNode.dataset.side == "left" ? "left" : "right";
      const hasReachedFirstStep = reachedFirstStep[side];
      const _number = hasReachedFirstStep ? number : 0;
      if (hasReachedFirstStep) {
        number++;
      } else {
        reachedFirstStep[side] = true;
      }
      await callback(childNode, _number, side);
    }
  },
  updateStepNumbers: function() {
    this.iterateSteps((step, number, side) => {
      if (number == 0) {
        step.dataset.number = "";
        step.dataset.opacity = 1;
      } else {
        step.dataset.number = number;
        step.dataset.opacity = 0;
      }
    });
  },
  updateStep: function(step, attribute, value) {
    switch (attribute) {
      case "data-side":
        const scaleX = step.image.object3D.scale.x;
        if (
          (value == "right" && scaleX > 0) ||
          (value != "right" && scaleX < 0)
        ) {
          step.image.object3D.scale.x *= -1;
        }
        break;
      case "data-color":
        step.image.setAttribute("material", `emissive: ${value};`);
        break;
      case "data-number":
        step.text.setAttribute("value", value);
        break;
      case "data-opacity":
        step.text.setAttribute("visible", value > 0);
        step.image.setAttribute("opacity", value);
        break;
      default:
        console.log(`unknown attribute "${attribute}"`);
        break;
    }
  },
  waitForBeat: async function() {
    await this.currentBeatPromise;

    this.currentBeatPromise = new Promise(resolve => {
      this.currentBeatResolve = resolve;
      this.timeoutId = setTimeout(() => {
        delete this.timeoutId;
        resolve();
      }, this.beatTime);
    });
    return this.currentBeatPromise;
  },
  cancelBeat: function() {
    clearTimeout(this.timeoutId);
    delete this.timeoutId;

    if (this.currentBeatResolve) {
      this.currentBeatResolve();
    }
  },
  getNthStep: function(stepNumber) {
    return this.el.querySelector(`[data-number="${stepNumber}"]`);
  },
  start: async function() {
    if (this.isDancing) {
      return;
    }
    this.isDancing = true;

    this.cancelBeat();

    await this.iterateSteps(async (step, number, side) => {
      if (number == 0) {
        step.dataset.opacity = 1;
        step.dataset.color = "black";
      } else {
        step.dataset.opacity = 0;
        step.dataset.color = "black";
      }
    });

    const initialSteps = {
      left: this.el.querySelector("[data-number='']:not([data-side='right'])"),
      right: this.el.querySelector("[data-number=''][data-side='right']")
    };
    for (let index = 0; index < 4; index++) {
      const { metronomeAudio } = this.system;
      metronomeAudio.pause();
      metronomeAudio.currentTime = 0;
      metronomeAudio.play();
      for (let side in initialSteps) {
        const step = initialSteps[side];
        let color;
        switch (index) {
          case 0:
          case 1:
            color = "red";
            break;
          case 2:
            color = "yellow";
            break;
          case 3:
            color = "green";
            this.getNthStep(1).dataset.opacity = 0.5;
            break;
          default:
            color = "black";
            break;
        }
        step.dataset.color = color;
        setTimeout(() => {
          step.dataset.color = "black";
        }, this.beatTime / 4);
      }
      await this.waitForBeat();
    }

    const stepOnFloor = {
      left: initialSteps.left,
      right: initialSteps.right
    };
    await this.iterateSteps(async (step, number, side) => {
      if (number == 0) {
        return;
      }

      stepOnFloor[side].dataset.opacity = 0;
      stepOnFloor[side] = step;
      step.dataset.opacity = 1;

      const nextStep = this.getNthStep(number + 1);
      if (nextStep) {
        //nextStep.dataset.color = "yellow";
        nextStep.dataset.opacity = 0.5;
      }

      step.emit("playaudio");
      //step.dataset.color = "green";
      let onStepCallback;
      onStepCallback = event => {
        const { side, position, mass } = event.detail;
        step.dataset.color = "black";
      };
      onStepCallback = onStepCallback.bind(this);
      step.addEventListener("step", onStepCallback, {once: true});
      await this.waitForBeat();
      step.removeEventListener("step", onStepCallback);
    });

    for (let side in stepOnFloor) {
      const step = stepOnFloor[side];
      step.dataset.opacity = 0;
    }
    for (let side in initialSteps) {
      const step = initialSteps[side];
      step.dataset.opacity = 1;
    }
    delete this.isDancing;
  },
  onstart: function(event) {
    this.start();
  },

  onLoadedResonanceAudio: function() {
    this.system.addEntity(this);
  },
  getClosestSteps: function(position) {
    const planeVertices = [];
    for (let i = 0; i < 4; i++) {
      planeVertices[i] = new THREE.Vector3();
    }
    const flatVertex = new THREE.Vector2();
    const flatPosition = new THREE.Vector2(position.x, position.z);
    const steps = Array.from(this.el.children);
    return steps.filter(step => {
      const image = step.image;
      const mesh = image.getObject3D("mesh");
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
  tick: function() {},

  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("bpm")) {
      this.beatTime = (60 * 1000) / this.data.bpm;
    }
    if (diffKeys.includes("preview")) {
      if (this.data.preview) {
        this.iterateSteps((step, number, side) => {
          step.dataset.opacity = 1;
          step.dataset.color = "black";
        });
      } else {
        this.iterateSteps((step, number, side) => {
          if (number == 0) {
            step.dataset.opacity = 1;
            step.dataset.color = "black";
          } else {
            step.dataset.opacity = 0;
            step.dataset.color = "black";
          }
        });
      }
    }
  },
  remove: function() {
    this.system.removeEntity(this);
  }
});
