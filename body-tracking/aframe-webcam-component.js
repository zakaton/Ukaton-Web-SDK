/* global AFRAME, THREE */

AFRAME.registerSystem("webcam", {
  init: function() {
    this.entities = [];
  },

  addEntity: function(entity) {
    this.entities.push(entity);
  },
  removeEntity: function(entity) {
    this.entities.splice(this.entities.indexOf(entity), 1);
  },

  tick: function() {
    this.entities.forEach(entity => entity.tick(...arguments));
  }
});

AFRAME.registerComponent("webcam", {
  schema: {
    width: { type: "number", default: 300 },
    height: { type: "number", default: 300 },
    fps: { type: "number", default: 24 },
    position: {type: "array", default: [0, 0, 0]},
    rotation: {type: "array", default: [0, 0, 0]},
    fov: {type: "number", default: 50}
  },
  init: function() {
    window.webcam = this;

    const flipYawEuler = new THREE.Euler();
    flipYawEuler.y = Math.PI;
    this.flipYawQuaternion = new THREE.Quaternion().setFromEuler(flipYawEuler);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.identifier = Math.random()
      .toFixed(3)
      .split(".")[1];
    this.canvas = this.renderer.domElement;
    this.canvas.id = `canvas${this.identifier}`;
    this.context = this.canvas.getContext("2d");

    this.assetsEl = this.el.sceneEl.querySelector("a-assets");
    if (!this.assetsEl) {
      this.assetsEl = document.createElement("a-assets");
      this.el.sceneEl.appendChild(this.assetsEl);
    }
    this.assetsEl.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.enable(3);

    this.planeEl = document.createElement("a-plane");
    this.planeEl.setAttribute("material", {
      src: `#${this.canvas.id}`,
      shader: "flat"
    });
    this.planeEl.setAttribute("scale", "-1 1 1");
    this.planeEl.addEventListener("loaded", event => {
      //this.planeEl.components.material.material.colorWrite = false;
      this.planeEl.getObject3D(
        "mesh"
      ).onBeforeRender = this.onBeforeRender.bind(this);
    });
    this.el.appendChild(this.planeEl);

    this.frustum = new THREE.Frustum();

    this._updateCanvas();
    this._updateFps();

    this.system.addEntity(this);
  },
  onBeforeRender: function() {
    this._isVisible = true;
  },
  _tick: function() {
    if (this._isVisible) {
      this._render();
      delete this._isVisible;
    }
  },
  _render: function() {
    this.renderer.render(
      this.el.sceneEl.object3D,
      this.camera
    );
    this.planeEl.components.material.material.map.needsUpdate = true;
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("width") || diffKeys.includes("height")) {
      this._updateCanvas();
    }
    if (diffKeys.includes("fps")) {
      this._updateFps();
    }
    if (diffKeys.includes("fov")) {
      this.camera.fov = this.data.fov;
      this.camera.updateProjectionMatrix();
    }
    if (diffKeys.includes("position")) {
      this.camera.position.set(...this.data.position.map(n => Number(n)))
    }
    if (diffKeys.includes("rotation")) {
      this.camera.rotation.set(...this.data.rotation.map(n => THREE.Math.degToRad(Number(n))))
    }
  },
  _updateCanvas: function() {
    this.canvas.width = this.data.width;
    this.canvas.height = this.data.height;

    this.renderer.setSize(this.canvas.width, this.canvas.height);
  },
  _updateFps: function() {
    this.tick = AFRAME.utils.throttleTick(
      this._tick,
      1000 / this.data.fps,
      this
    );
  },
  remove: function() {
    this.system.removeEntity(this);
  }
});
