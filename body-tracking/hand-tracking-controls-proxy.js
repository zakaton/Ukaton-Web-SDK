/* global AFRAME, THREE */

AFRAME.registerComponent("hand-tracking-controls-proxy", {
  schema: {
    hand: { default: "right", oneOf: ["left", "right"] },
    modelStyle: { default: "mesh", oneOf: ["dots", "mesh"] },
    modelColor: { default: "white" },
    source: { type: "selector" },
  },

  addEventListeners: function () {
    this.el.addEventListener("model-loaded", this.onModelLoaded);
    for (var i = 0; i < this.jointEls.length; ++i) {
      this.jointEls[i].object3D.visible = true;
    }
  },

  removeEventListeners: function () {
    this.el.removeEventListener("model-loaded", this.onModelLoaded);
    for (var i = 0; i < this.jointEls.length; ++i) {
      this.jointEls[i].object3D.visible = false;
    }
  },

  init: function () {
    this.LEFT_HAND_MODEL_URL =
      "https://cdn.aframe.io/controllers/oculus-hands/v3/left.glb";
    this.RIGHT_HAND_MODEL_URL =
      "https://cdn.aframe.io/controllers/oculus-hands/v3/right.glb";

    this.BONE_PREFIX = {
      left: "b_l_",
      right: "b_r_",
    };

    this.JOINTS = [
      "wrist",
      "thumb-metacarpal",
      "thumb-phalanx-proximal",
      "thumb-phalanx-distal",
      "thumb-tip",
      "index-finger-metacarpal",
      "index-finger-phalanx-proximal",
      "index-finger-phalanx-intermediate",
      "index-finger-phalanx-distal",
      "index-finger-tip",
      "middle-finger-metacarpal",
      "middle-finger-phalanx-proximal",
      "middle-finger-phalanx-intermediate",
      "middle-finger-phalanx-distal",
      "middle-finger-tip",
      "ring-finger-metacarpal",
      "ring-finger-phalanx-proximal",
      "ring-finger-phalanx-intermediate",
      "ring-finger-phalanx-distal",
      "ring-finger-tip",
      "pinky-finger-metacarpal",
      "pinky-finger-phalanx-proximal",
      "pinky-finger-phalanx-intermediate",
      "pinky-finger-phalanx-distal",
      "pinky-finger-tip",
    ];

    this.BONE_MAPPING = {
      wrist: "wrist",
      "thumb-metacarpal": "thumb1",
      "thumb-phalanx-proximal": "thumb2",
      "thumb-phalanx-distal": "thumb3",
      "thumb-tip": "thumb_null",
      "index-finger-metacarpal": "index0",
      "index-finger-phalanx-proximal": "index1",
      "index-finger-phalanx-intermediate": "index2",
      "index-finger-phalanx-distal": "index3",
      "index-finger-tip": "index_null",
      "middle-finger-metacarpal": "middle0",
      "middle-finger-phalanx-proximal": "middle1",
      "middle-finger-phalanx-intermediate": "middle2",
      "middle-finger-phalanx-distal": "middle3",
      "middle-finger-tip": "middle_null",
      "ring-finger-metacarpal": "ring0",
      "ring-finger-phalanx-proximal": "ring1",
      "ring-finger-phalanx-intermediate": "ring2",
      "ring-finger-phalanx-distal": "ring3",
      "ring-finger-tip": "ring_null",
      "pinky-finger-metacarpal": "pinky0",
      "pinky-finger-phalanx-proximal": "pinky1",
      "pinky-finger-phalanx-intermediate": "pinky2",
      "pinky-finger-phalanx-distal": "pinky3",
      "pinky-finger-tip": "pinky_null",
    };

    this.PINCH_START_DISTANCE = 0.015;
    this.PINCH_END_DISTANCE = 0.03;
    this.PINCH_POSITION_INTERPOLATION = 0.5;

    var sceneEl = this.el.sceneEl;
    this.onModelLoaded = this.onModelLoaded.bind(this);
    this.jointEls = [];
    this.addEventListeners();
    this.controllerPresent = false;
    this.isPinched = false;
    this.pinchEventDetail = { position: new THREE.Vector3() };
    this.indexTipPosition = new THREE.Vector3();
    this.initDefaultModel();
  },

  tick: function () {
    if (this.mesh && this.data.source) {
      this.el.object3D.position.set(0, 0, 0);
      this.el.object3D.rotation.set(0, 0, 0);
      this.updateHandModel();
    }
  },

  updateHandModel: function () {
    if (this.data.modelStyle === "dots") {
      this.updateHandDotsModel();
    }

    if (this.data.modelStyle === "mesh") {
      this.updateHandMeshModel();
    }
  },

  getBone: function (name) {
    var bones = this.bones;
    for (var i = 0; i < bones.length; i++) {
      if (bones[i].name === name) {
        return bones[i];
      }
    }
    return null;
  },

  updateHandMeshModel: function () {
    this.mesh.visible = false;
    const skeleton =
      this.data.source.components?.["hand-tracking-controls"]?.skinnedMesh
        ?.skeleton;
    if (skeleton) {
      this.bones.forEach((bone) => {
        const _bone = skeleton.getBoneByName(bone.name);
        if (_bone) {
          bone.copy(_bone);
          this.mesh.visible = true;
        }
      });
    }

    /*
    for (var inputjoint of controller.hand.values()) {
      var bone;
      var jointPose;
      var jointTransform;
      jointPose = frame.getJointPose(inputjoint, referenceSpace);
      if (!this.BONE_MAPPING[inputjoint.jointName]) {
        continue;
      }
      bone = this.getBone(
        this.BONE_PREFIX[this.data.hand] + this.BONE_MAPPING[inputjoint.jointName]
      );
      if (bone != null && jointPose) {
        jointTransform = jointPose.transform;
        this.mesh.visible = true;
        bone.position.copy(jointTransform.position).multiplyScalar(100);
        bone.quaternion.set(
          jointTransform.orientation.x,
          jointTransform.orientation.y,
          jointTransform.orientation.z,
          jointTransform.orientation.w
        );
      }
    }
    */
  },

  updateHandDotsModel: function () {
    var frame = this.el.sceneEl.frame;
    var controller =
      this.el.components["tracked-controls"] &&
      this.el.components["tracked-controls"].controller;
    var trackedControlsWebXR = this.el.components["tracked-controls-webxr"];
    var referenceSpace = trackedControlsWebXR.system.referenceSpace;
    var jointEl;
    var object3D;
    var jointPose;
    var i = 0;

    for (var inputjoint of controller.hand.values()) {
      jointEl = this.jointEls[i++];
      object3D = jointEl.object3D;
      jointPose = frame.getJointPose(inputjoint, referenceSpace);
      jointEl.object3D.visible = !!jointPose;
      if (!jointPose) {
        continue;
      }
      object3D.matrix.elements = jointPose.transform.matrix;
      object3D.matrix.decompose(
        object3D.position,
        object3D.rotation,
        object3D.scale
      );
      jointEl.setAttribute("scale", {
        x: jointPose.radius,
        y: jointPose.radius,
        z: jointPose.radius,
      });
    }
  },

  detectGesture: function () {
    this.detectPinch();
  },

  detectPinch: (function () {
    var thumbTipPosition = new THREE.Vector3();
    return function () {
      var frame = this.el.sceneEl.frame;
      var indexTipPosition = this.indexTipPosition;
      var controller =
        this.el.components["tracked-controls"] &&
        this.el.components["tracked-controls"].controller;
      var trackedControlsWebXR = this.el.components["tracked-controls-webxr"];
      var referenceSpace =
        this.referenceSpace || trackedControlsWebXR.system.referenceSpace;
      var indexTip = controller.hand.get("index-finger-tip");
      var thumbTip = controller.hand.get("thumb-tip");
      if (!indexTip || !thumbTip) {
        return;
      }
      var indexTipPose = frame.getJointPose(indexTip, referenceSpace);
      var thumbTipPose = frame.getJointPose(thumbTip, referenceSpace);

      if (!indexTipPose || !thumbTipPose) {
        return;
      }

      thumbTipPosition.copy(thumbTipPose.transform.position);
      indexTipPosition.copy(indexTipPose.transform.position);

      var distance = indexTipPosition.distanceTo(thumbTipPosition);

      if (distance < this.PINCH_START_DISTANCE && this.isPinched === false) {
        this.isPinched = true;
        this.pinchEventDetail.position
          .copy(indexTipPosition)
          .lerp(thumbTipPosition, this.PINCH_POSITION_INTERPOLATION);
        this.pinchEventDetail.position.y += 1.5;
        this.el.emit("pinchstarted", this.pinchEventDetail);
      }

      if (distance > this.PINCH_END_DISTANCE && this.isPinched === true) {
        this.isPinched = false;
        this.pinchEventDetail.position
          .copy(indexTipPosition)
          .lerp(thumbTipPosition, this.PINCH_POSITION_INTERPOLATION);
        this.pinchEventDetail.position.y += 1.5;
        this.el.emit("pinchended", this.pinchEventDetail);
      }

      if (this.isPinched) {
        this.pinchEventDetail.position
          .copy(indexTipPosition)
          .lerp(thumbTipPosition, this.PINCH_POSITION_INTERPOLATION);
        this.pinchEventDetail.position.y += 1.5;
        this.el.emit("pinchmoved", this.pinchEventDetail);
      }

      indexTipPosition.y += 1.5;
    };
  })(),

  initDefaultModel: function () {
    if (this.el.getObject3D("mesh")) {
      return;
    }
    if (this.data.modelStyle === "dots") {
      this.initDotsModel();
    }

    if (this.data.modelStyle === "mesh") {
      this.initMeshHandModel();
    }
  },

  initDotsModel: function () {
    // Add models just once.
    if (this.jointEls.length !== 0) {
      return;
    }
    for (var i = 0; i < this.JOINTS.length; ++i) {
      var jointEl = (this.jointEl = document.createElement("a-entity"));
      jointEl.setAttribute("geometry", {
        primitive: "sphere",
        radius: 1.0,
      });
      jointEl.setAttribute("material", { color: this.data.modelColor });
      jointEl.object3D.visible = false;
      this.el.appendChild(jointEl);
      this.jointEls.push(jointEl);
    }
  },

  initMeshHandModel: function () {
    var modelURL =
      this.data.hand === "left" ? this.LEFT_HAND_MODEL_URL : this.RIGHT_HAND_MODEL_URL;
    this.el.setAttribute("gltf-model", modelURL);
  },

  onModelLoaded: function () {
    var mesh = (this.mesh = this.el.getObject3D("mesh").children[0]);
    var skinnedMesh = (this.skinnedMesh = mesh.children[30]);
    if (!this.skinnedMesh) {
      return;
    }
    this.bones = skinnedMesh.skeleton.bones;
    this.el.removeObject3D("mesh");
    mesh.position.set(0, 1.5, 0);
    mesh.rotation.set(0, 0, 0);
    skinnedMesh.frustumCulled = false;
    skinnedMesh.material = new THREE.MeshStandardMaterial({
      skinning: true,
      color: this.data.modelColor,
    });
    this.el.setObject3D("mesh", mesh);
  },
});
