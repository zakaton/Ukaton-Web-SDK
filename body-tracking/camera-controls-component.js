/* global AFRAME, THREE */
AFRAME.registerSystem("camera-controls", {});

AFRAME.registerComponent("camera-controls", {
  schema: {
    scalar: { type: "number", default: 0.01 },
    hand: { default: "right", oneOf: ["left", "right"] },
    toggleVisibility: {
      type: "selectorAll",
      default: "[data-toggle-visibility]",
    },
    orbit: { type: "boolean", default: false },
    camera: { type: "selector" },
  },
  init: function () {
    window.cameraControls = this;
    this.cameraPosition = document.getElementById("cameraPosition");
    this.cameraRotation = document.getElementById("cameraRotation");
    this.camera = document.querySelector("a-camera#camera");
    this.positionOffset = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.quaternion = new THREE.Quaternion();

    this.el.addEventListener("thumbstickmoved", this.controlCamera.bind(this));
    this.el.addEventListener("abuttondown", this.toggleVisibility.bind(this));
    this.el.addEventListener("xbuttondown", this.toggleInvertVisibility.bind(this));
    if (this.data.orbit && this.data.camera) {
      if (this.data.hand == "right") {
        this.system.orbitCameraConfig = {
          euler: new THREE.Euler(0, 0, 0, "YXZ"),
          center: this.camera.object3D.getWorldPosition(new THREE.Vector3()),
          radius: 5, // FIX
          cameraPosition: this.camera.object3D.getWorldPosition(
            new THREE.Vector3()
          ),
          offset: new THREE.Vector3(),
        };
        this.system.thirdCameraConfig = {
          position: new THREE.Vector3(0, 1.6, 0),
          euler: new THREE.Euler(0, 0, 0, "YXZ"),
        };
        this.system.isOrbiting = false;
      }

      this.el.addEventListener("bbuttondown", this.toggleCamera.bind(this));
    }
    this.orbitCameraConfig = this.system.orbitCameraConfig;
    this.thirdCameraConfig = this.system.thirdCameraConfig;
    this.system.showEntities = true;
  },
  controlCamera: function (event) {
    this.orbitCameraConfig = this.system.orbitCameraConfig;
    this.thirdCameraConfig = this.system.thirdCameraConfig;

    let { x, y } = event.detail;
    x *= this.data.scalar;
    y *= this.data.scalar;

    if (this.system.showEntities) {
      if (this.data.hand == "left") {
        this.positionOffset.set(x, 0, y);
        this.camera.object3D.getWorldQuaternion(this.quaternion);
        this.euler.setFromQuaternion(this.quaternion);
        this.euler.x = this.euler.z = 0;
        this.positionOffset.applyEuler(this.euler);
        this.cameraPosition.object3D.position.add(this.positionOffset);
      } else {
        this.cameraRotation.object3D.rotation.y += -x;
      }
    } else {
      if (this.data.camera) {
        if (this.system.isOrbiting) {
          x *= 2;
          y *= 2;
          if (this.data.hand == "left") {
            this.orbitCameraConfig.radius += y;
            this.orbitCameraConfig.radius = THREE.MathUtils.clamp(
              this.orbitCameraConfig.radius,
              0,
              5
            );
          } else {
            
            this.orbitCameraConfig.euler.x += y;
            this.orbitCameraConfig.euler.x = THREE.MathUtils.clamp(
              this.orbitCameraConfig.euler.x,
              -Math.PI,
              Math.PI
            );
            this.orbitCameraConfig.euler.y += x;
          }
        } else {
          x *= 2;
          y *= 2;
          if (this.data.hand == "left") {
            this.positionOffset.set(x, 0, y);
            this.euler.copy(this.thirdCameraConfig.euler);
            this.euler.x = this.euler.z = 0;
            this.positionOffset.applyEuler(this.euler);
            this.thirdCameraConfig.position.add(this.positionOffset);
          } else {
            this.thirdCameraConfig.euler.x += -y;
            this.thirdCameraConfig.euler.x = THREE.MathUtils.clamp(
              this.thirdCameraConfig.euler.x,
              -Math.PI,
              Math.PI
            );
            this.thirdCameraConfig.euler.y += -x;
          }
        }
        this.system.shouldUpdateCamera = true;
      }
    }
  },
  tick: function () {
    if (this.data.hand == "left") {
      return;
    }

    this.orbitCameraConfig = this.system.orbitCameraConfig;
    this.thirdCameraConfig = this.system.thirdCameraConfig;

    if (this.data.camera && this.system.isOrbiting) {
      this.camera.object3D.getWorldPosition(
        this.orbitCameraConfig.cameraPosition
      );
      if (
        this.orbitCameraConfig.cameraPosition.distanceTo(
          this.orbitCameraConfig.center
        ) > 0.01
      ) {
        this.orbitCameraConfig.center.copy(
          this.orbitCameraConfig.cameraPosition
        );
        this.system.shouldUpdateCamera = true;
      }
    }
    if (this.system.shouldUpdateCamera) {
      if (this.system.isOrbiting) {
        this.orbitCameraConfig.offset.set(0, 0, this.orbitCameraConfig.radius);
        this.orbitCameraConfig.offset.applyEuler(this.orbitCameraConfig.euler);
        this.data.camera.object3D.position.addVectors(
          this.orbitCameraConfig.center,
          this.orbitCameraConfig.offset
        );
        this.data.camera.object3D.rotation.x = this.orbitCameraConfig.euler.x;
        this.data.camera.object3D.rotation.y = this.orbitCameraConfig.euler.y;
        //this.data.camera.object3D.lookAt(this.orbitCameraConfig.center);
      } else {
        this.data.camera.object3D.rotation.copy(this.thirdCameraConfig.euler);
        this.data.camera.object3D.position.copy(
          this.thirdCameraConfig.position
        );
      }
      this.system.shouldUpdateCamera = false;
    }
  },
  toggleVisibility: function () {
    this.system.showEntities = !this.system.showEntities;
    this.data.toggleVisibility.forEach((entity) => {
      let visibility = this.system.showEntities;
      if (entity.dataset.toggleVisibility === "invert") {
        visibility = !visibility;
      }

      if (this.data.orbit && entity.dataset.toggleVisibility !== "invert") {
        entity.object3D.traverse((object3D) => {
          if (visibility) {
            object3D.layers.set(5);
            object3D.layers.enable(1);
            object3D.layers.enable(2);
          } else {
            object3D.layers.set(6);
          }
        });
      } else {
        if (!this.system.overrideInvertVisibility || !visibility) {
          entity.setAttribute("visible", visibility);
        }
      }
    });
  },
  toggleCamera: function () {
    if (this.data.camera) {
      this.system.isOrbiting = !this.system.isOrbiting;
      this.system.shouldUpdateCamera = true;
    }
  },
  toggleInvertVisibility: function() {
    this.system.overrideInvertVisibility = !this.system.overrideInvertVisibility
  }
});
