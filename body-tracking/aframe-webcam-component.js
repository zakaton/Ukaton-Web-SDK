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
    fps: { type: "number", default: 24 }
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
    this.el.sceneEl.querySelector("a-assets").appendChild(this.canvas);

    this.assetsEl = this.el.sceneEl.querySelector("a-assets");
    if (!this.assetsEl) {
      this.assetsEl = document.createElement("a-assets");
      this.el.sceneEl.appendChild(this.assetsEl);
    }
    this.assetsEl.appendChild(this.canvas);

    this.cameraEl = document.createElement("a-camera");
    this.cameraBoxEl = document.createElement("a-box");
    this.cameraBoxEl.setAttribute("scale", "0.1 0.1 0.1");
    this.cameraBoxEl.setAttribute("color", "green");
    this.cameraBoxEl.object3D.visible = false;
    this.cameraEl.appendChild(this.cameraBoxEl);
    this.cameraEl.setAttribute("camera", { spectator: true, active: false });
    this.cameraEl.setAttribute("rotation", "0 180 0");
    this.cameraEl.setAttribute("position", "0 0 0");
    this.cameraEl.setAttribute("look-controls-enabled", "false");
    this.cameraEl.setAttribute("wasd-controls-enabled", "false");
    this.cameraEl.addEventListener("loaded", event => {
      this.cameraEl.components.camera.camera.aspect = 1;
      //this.cameraEl.components.camera.camera.aspect = screen.width/screen.height;
      this.cameraEl.components.camera.camera.updateProjectionMatrix();
    });
    this.el.appendChild(this.cameraEl);

    this.planeEl = document.createElement("a-plane");
    this.planeEl.setAttribute("material", { src: `#${this.canvas.id}`, shader: "flat"});
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
    /*
    const cameraPosition = this.el.object3D.worldToLocal(
      this.el.sceneEl.camera.getWorldPosition()
    );
    cameraPosition.z *= -1;
    this.cameraEl.object3D.position.copy(cameraPosition);
    
    const cameraQuaternion = this.el.sceneEl.camera.getWorldQuaternion();
    this.cameraEl.object3D.quaternion.copy(cameraQuaternion);
    this.cameraEl.object3D.rotation.y *= -1;
    this.cameraEl.object3D.rotation.y += Math.PI;
    this.cameraEl.object3D.quaternion.multiply(this.el.object3D.getWorldQuaternion());
    */

    this.renderer.render(
      this.el.sceneEl.object3D,
      this.cameraEl.object3DMap.camera
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
