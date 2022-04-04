/* global AFRAME, THREE, WebSocketMissionDevice, BluetoothMissionDevice */

AFRAME.registerSystem("ready-player-me", {
  init: function () {
    this.entities = [];

    this.assetsEl = this.el.sceneEl.querySelector("a-assets");
    if (!this.assetsEl) {
      this.assetsEl = document.createElement("a-assets");
      this.el.sceneEl.appendChild(this.assetsEl);
    }

    this.footstepAudio = document.createElement("audio");
    this.footstepAudio.id = "footstepSound";
    this.footstepAudio.setAttribute(
      "src",
      "https://cdn.glitch.me/6c283599-191e-4c4a-b236-e1e1f0d90e7a%2Ffootstep.mp3?v=1638758108070"
    );
    this.assetsEl.appendChild(this.footstepAudio);
  },

  addEntity: function (entity) {
    this.entities.push(entity);
  },
  removeEntity: function (entity) {
    this.entities.splice(this.entities.indexOf(entity), 1);
  },

  tick: function () {
    this.entities.forEach((entity) => entity.tick(...arguments));
  },
});

AFRAME.registerComponent("ready-player-me", {
  dependencies: ["gltf-model"],
  schema: {
    hidePressure: { type: "boolean", default: true },
    flip: { type: "boolean", default: true },
    manualArticulation: { type: "boolean", default: false },
    pressureAnchoringEnabled: { type: "boolean", default: true },
    gateway: { type: "array", default: [] },
    rate: { type: "number", default: 20 },
  },
  init: function () {
    window._rig = this;

    this.recordedData = [];

    this.webSocketMissionDevices = {};
    this.devices = [];
    this.namedDevices = {};

    this.positions = {};
    this.positionOffsets = {};
    this.quaternionOffsets = {};
    this.yawQuaternionOffsets = {};
    this.pitchRollQuaternionOffsets = {};
    this.quaternions = {};
    this.updatedQuaternion = {};
    this.correctionQuaternions = {};
    {
      const { correctionQuaternions } = this;

      const _euler = new THREE.Euler();
      window._euler = _euler;

      _euler.set(0, Math.PI, 0);
      correctionQuaternions.head = new THREE.Quaternion().setFromEuler(_euler);

      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      correctionQuaternions.upperTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );
      _euler.set(Math.PI / 2, Math.PI, -Math.PI / 2);
      correctionQuaternions.lowerTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );

      _euler.set(0, 0, 0);
      correctionQuaternions.leftBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      correctionQuaternions.leftForearm = new THREE.Quaternion().setFromEuler(
        _euler
      );
      correctionQuaternions.leftHand = new THREE.Quaternion().setFromEuler(
        _euler
      );

      _euler.set(0, Math.PI, 0);
      correctionQuaternions.rightBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      correctionQuaternions.rightForearm = new THREE.Quaternion().setFromEuler(
        _euler
      );
      correctionQuaternions.rightHand = new THREE.Quaternion().setFromEuler(
        _euler
      );

      _euler.set(-Math.PI / 2, 0, Math.PI / 2);
      correctionQuaternions.leftThigh = new THREE.Quaternion().setFromEuler(
        _euler
      );
      _euler.set(-Math.PI / 2, 0, Math.PI / 2, "XYZ");
      correctionQuaternions.leftShin = new THREE.Quaternion().setFromEuler(
        _euler
      );
      _euler.set(0, Math.PI, 0, "XYZ");
      correctionQuaternions.leftFoot = new THREE.Quaternion().setFromEuler(
        _euler
      );

      _euler.set(-Math.PI / 2, 0, Math.PI / 2);
      correctionQuaternions.rightThigh = new THREE.Quaternion().setFromEuler(
        _euler
      );
      _euler.set(-Math.PI / 2, 0, Math.PI / 2, "XYZ");
      correctionQuaternions.rightShin = new THREE.Quaternion().setFromEuler(
        _euler
      );

      _euler.set(0, Math.PI, 0, "XYZ");
      correctionQuaternions.rightFoot = new THREE.Quaternion().setFromEuler(
        _euler
      );
    }
    
    {
      const euler = new THREE.Euler();
      const quaternion = new THREE.Quaternion();
      
      euler.x = Math.PI;
      quaternion.setFromEuler(euler);
      this.flipQuaternion = quaternion.clone();
      
      euler.x = 0;
      euler.y = Math.PI;
      quaternion.setFromEuler(euler);
      this.flipFootQuaternion = quaternion.clone();
    }

    this.sides = ["left", "right"];

    this.anchors = {};
    this.sides.forEach((side) => {
      this.anchors[side] = {};

      const entity = document.createElement("a-entity");
      entity.id = `${side}Anchor`;
      entity.object3D.visible = false;

      const primitive = document.createElement("a-ring");
      primitive.setAttribute("position", `0 0.001 0.1`);
      primitive.setAttribute("rotation", "-90 0 0");
      primitive.setAttribute("radius-inner", 0);
      primitive.setAttribute("radius-outer", 0.2);
      primitive.setAttribute("color", "blue");
      if (this.data.hidePressure) {
        primitive.setAttribute("visible", "false");
      }

      entity.appendChild(primitive);
      this.el.appendChild(entity);

      this.anchors[side].entity = entity;
      this.anchors[side].primitive = primitive;
    });

    this.names = ["head", "upperTorso", "lowerTorso"];
    this.symmetricalNames = [
      "bicep",
      "forearm",
      "hand",
      "thigh",
      "shin",
      "foot",
    ];
    this.sides.forEach((side) => {
      this.symmetricalNames.forEach((name) => {
        const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
        this.names.push(side + capitalizedName);
      });
    });
    this.names.forEach((name) => {
      this.quaternions[name] = new THREE.Quaternion();
      this.quaternionOffsets[name] = new THREE.Quaternion();
      this.yawQuaternionOffsets[name] = new THREE.Quaternion();
      this.pitchRollQuaternionOffsets[name] = new THREE.Quaternion();
      this.positions[name] = new THREE.Vector3();
      this.positionOffsets[name] = new THREE.Vector3();
    });

    this.bones = {};
    this.boneMapping = {
      head: "Head",
      upperTorso: "Spine1",
      lowerTorso: "Hips",

      leftBicep: "LeftArm",
      leftForearm: "LeftForeArm",
      leftHand: "LeftHand",

      rightBicep: "RightArm",
      rightForearm: "RightForeArm",
      rightHand: "RightHand",

      rightThigh: "RightUpLeg",
      rightShin: "RightLeg",
      rightFoot: "RightFoot",

      leftThigh: "LeftUpLeg",
      leftShin: "LeftLeg",
      leftFoot: "LeftFoot",
    };
    this.getKeyForBoneName = (boneName) => {
      let key;
      for (let _key in this.boneMapping) {
        if (this.boneMapping[_key] == boneName) {
          key = _key;
          break;
        }
      }
      return key;
    };

    this.allBones = {};
    this.el.addEventListener("model-loaded", (event) => {
      this.el.components["gltf-model"].model.traverse((object) => {
        if (object.type == "Bone") {
          const bone = object;
          this.allBones[bone.name] = bone;
          const key = this.getKeyForBoneName(bone.name);
          if (key) {
            bone._key = key;
            this.bones[bone.name] = bone;
          }
        }
      });
      
      this.feetObjects = {};
      this.sides.forEach(side => {
        const object = new THREE.Object3D();
        this.feetObjects[side] = object;
        object.position.x = 0.03
        if (side == "right") {
          object.position.x *= -1;
        }
        object.position.y = -0.22;
        object.name = `${side}FootObject`;
        const capitalizedSide = side.charAt(0).toUpperCase() + side.slice(1);
        this.allBones[`${capitalizedSide}Toe_End`].add(object);
      });
      
      this.updateEntityAutoUpdate();
    });

    const anchorConfiguration = (this.anchorConfiguration = {
      masses: { left: 0, right: 0 },
      thresholds: { left: 0.05, right: 0.05 }, // goback
      updatedMass: {},
      updatedAnchor: false,
      isAnchored: false,
      side: "",
      position: new THREE.Vector3(),
      exceededThresholds: { left: false, right: false },
      updatedThresholds: { left: false, right: false },
    });

    this.el.addEventListener("connect", (event) => this.connect());
    this.el.addEventListener("addbluetoothdevice", (event) =>
      this._addBluetoothDevice()
    );
    this.el.addEventListener("calibrate", (event) =>
      this.calibrate(event.detail.delay)
    );

    this.system.addEntity(this);
  },
  connect: async function () {
    this.data.gateway.forEach(async (gateway) => {
      let websocketMissionDevice = this.webSocketMissionDevices[gateway];
      if (websocketMissionDevice) {
        await websocketMissionDevice.connect(gateway);
      } else {
        await this._addWebSocketDevice(gateway);
      }
    });
  },
  _setupDevice: async function (device) {
    const { anchorConfiguration } = this;

    this.devices.push(device);

    const sensorDataConfigurations = { motion: {}, pressure: {} };

    const name = await device.getName();
    console.log(`connected to ${name}`);
    this.namedDevices[name] = device;
    const deviceType = await device.getType();
    if (device.isInsole) {
      device.addEventListener("mass", (event) => {
        if (this._hasCalibratedAtLeastOnce) {
          this._tickFlag = true;

          const side = name.includes("left") ? "left" : "right";
          const { mass } = event.message;
          anchorConfiguration.masses[side] = mass;
          const threshold = anchorConfiguration.thresholds[side];
          const previouslyExceededThreshold =
            anchorConfiguration.exceededThresholds[side];
          const exceededThreshold = mass >= threshold;
          anchorConfiguration.exceededThresholds[side] = exceededThreshold;
          const updatedThreshold =
            anchorConfiguration.updatedThresholds[side] ||
            exceededThreshold != previouslyExceededThreshold;
          anchorConfiguration.updatedThresholds[side] = updatedThreshold;

          if (anchorConfiguration.isAnchored) {
            if (side == anchorConfiguration.side) {
              if (!exceededThreshold) {
                anchorConfiguration.isAnchored = false;
                delete anchorConfiguration.updatedAnchor;
              }
            }
          } else {
            if (exceededThreshold) {
              anchorConfiguration.isAnchored = true;
              anchorConfiguration.side = side;
              anchorConfiguration.updatedAnchor = true;
            }
          }

          anchorConfiguration.updatedMass[side] = true;
        }
      });

      sensorDataConfigurations.pressure.mass = this.data.rate;
    }

    device.addEventListener("quaternion", (event) => {
      if (this.names.includes(name)) {
        this._tickFlag = true;

        const { quaternion } = event.message;
        if (name in this.correctionQuaternions) {
          if (this.data.flip) {
            if (name.includes("Foot")) {
              quaternion.multiply(this.flipFootQuaternion);
            }
            else {
              quaternion.multiply(this.flipQuaternion);
            }
          }
          
          this.quaternions[name].multiplyQuaternions(
            quaternion,
            this.correctionQuaternions[name]
          );
        } else {
          this.quaternions[name].copy(quaternion);
        }
        this.updatedQuaternion[name] = true;
      }
    });

    sensorDataConfigurations.motion.quaternion = this.data.rate;

    await device.setSensorDataConfigurations(sensorDataConfigurations);
    
    device.addEventListener("connected", async event => {
      await device.setSensorDataConfigurations(sensorDataConfigurations);
    })
    
    device.addEventListener("isConnected", event => {
      console.log("isConnected", event.message.isConnected, name);
    });
  },
  _addBluetoothDevice: async function () {
    console.log("getting device");
    const bluetoothMissionDevice = new BluetoothMissionDevice();
    await bluetoothMissionDevice.connect();
    console.log("got bluetooth mission device", bluetoothMissionDevice);
    await this._setupDevice(bluetoothMissionDevice);
    bluetoothMissionDevice.peers.forEach(async (peer) => {
      let isConnected = await peer._isConnected();
      if (isConnected) {
        await this._setupDevice(peer);
      } else {
        peer.addEventListener(
          "connected",
          async () => {
            await this._setupDevice(peer);
          },
          { once: true }
        );
      }
    });
    return bluetoothMissionDevice;
  },
  _addWebSocketDevice: async function (gateway) {
    const webSocketMissionDevice = new WebSocketMissionDevice();
    await webSocketMissionDevice.connect(gateway);
    console.log("got websocket mission device", webSocketMissionDevice);
    this.webSocketMissionDevices[gateway] = webSocketMissionDevice;
    await this._setupDevice(webSocketMissionDevice);
    return webSocketMissionDevice;
  },
  calibrate: function (delay) {
    setTimeout(() => this._calibrate(), delay);
  },
  _calibrate: function () {
    console.log("calibrating");

    this.names.forEach((name) => {
      this.quaternionOffsets[name].copy(this.quaternions[name]).invert();

      const euler = new THREE.Euler();
      euler.order = "YXZ";

      euler.setFromQuaternion(this.quaternionOffsets[name]);
      euler.x = euler.z = 0;
      this.yawQuaternionOffsets[name].setFromEuler(euler);

      euler.order = "XZY";
      euler.setFromQuaternion(this.quaternionOffsets[name]);
      euler.y = 0;
      this.pitchRollQuaternionOffsets[name].setFromEuler(euler);
    });

    this._hasCalibratedAtLeastOnce = true;

    {
      const { position } = this.el.object3D;
      position.x = position.z = 0;
    }

    this.anchorConfiguration.isAnchored = false;
    Object.assign(this.anchorConfiguration.masses, { left: 0, right: 0 });
    Object.assign(this.anchorConfiguration.updatedMass, {
      left: true,
      right: true,
    });

    this.sides.forEach((side) => {
      this.anchors[side].entity.object3D.visible = false;
    });
  },
  startRecording: function () {
    this.recordedData.length = 0; // [...{timestamp, position?, quaternions: {deviceName: quaternion}}]
    this._isRecording = true;
  },
  stopRecording: function () {
    this._isRecording = false;
    const { recordedData } = this;
    if (recordedData.length > 0) {
      recordedData.duration = Math.ceil(
        recordedData[recordedData.length - 1].timestamp
      );
    }
  },
  getRecordingDatumByTime(time) {
    const { recordedData } = this;

    return recordedData.find((_, index) => {
      const nextDatum = recordedData[index + 1];
      return !nextDatum || nextDatum.timestamp > time;
    });
  },
  tick: function () {
    if (this._tickFlag) {
      this._tick(...arguments);
      delete this._tickFlag;
    }
  },
  _tick: function (time) {
    let recordingDatum;
    const { recordedData } = this;
    if (this._isRecording) {
      recordingDatum = { quaternions: {} };
      if (recordedData.length == 0) {
        recordingDatum.timestamp = 0;
        recordedData.baseTime = time;
      } else {
        recordingDatum.timestamp = time - recordedData.baseTime;
      }
    }

    const { anchorConfiguration } = this;
    for (const name in this.updatedQuaternion) {
      const bone = this.getBoneByName(name);
      if (bone && this.updatedQuaternion[name]) {
        const quaternion = this.quaternions[name];

        const quaternionOffset = this.quaternionOffsets[name];
        const yawQuaternionOffset = this.yawQuaternionOffsets[name];
        const pitchRollQuaternionOffset = this.pitchRollQuaternionOffsets[name];

        const yawEuler = new THREE.Euler().setFromQuaternion(quaternion);
        yawEuler.reorder("YXZ");
        yawEuler.x = yawEuler.z = 0;
        const yawQuaternion = new THREE.Quaternion().setFromEuler(yawEuler);
        const inverseYawQuaternion = yawQuaternion.clone().invert();

        const modifiedQuaternion = quaternion
          .clone()
          .premultiply(inverseYawQuaternion)
          .premultiply(pitchRollQuaternionOffset)
          .premultiply(yawQuaternion)
          .premultiply(yawQuaternionOffset);

        bone.modifiedQuaternion = modifiedQuaternion;
      }
    }

    const euler = new THREE.Euler();
    const postCorrectionEuler = new THREE.Euler().reorder("YXZ");
    const postCorrectionQuaternion = new THREE.Quaternion();
    this.el.components["gltf-model"].model.traverse((object) => {
      if (object.type == "Bone") {
        const bone = object;
        const name = bone._key;
        if (bone.modifiedQuaternion) {
          const { modifiedQuaternion } = bone;

          window._defaultEuler = window._defaultEuler || new THREE.Euler();
          if (window._defaultEuler) {
            const q = new THREE.Quaternion().setFromEuler(window._defaultEuler);
            modifiedQuaternion.multiply(q);
          }

          bone.parent
            .getWorldQuaternion(bone.quaternion)
            .invert()
            .multiply(this.el.object3D.quaternion)
            .multiply(modifiedQuaternion);

          euler.setFromQuaternion(bone.quaternion);
          postCorrectionEuler.set(0, 0, 0);

          switch (name) {
            case "head":
              break;
            case "upperTorso":
              euler.reorder("YXZ");
              euler.x *= -1;
              euler.z *= -1;
              bone.rotation.copy(euler);
              break;
            case "leftBicep":
            case "leftForearm":
            case "leftHand":
              postCorrectionEuler.x = Math.PI / 2;
              postCorrectionEuler.y = Math.PI / 2;
              postCorrectionQuaternion.setFromEuler(postCorrectionEuler);
              bone.quaternion.multiply(postCorrectionQuaternion);
              break;
            case "rightBicep":
            case "rightForearm":
            case "rightHand":
              postCorrectionEuler.x = Math.PI / 2;
              postCorrectionEuler.y = -Math.PI / 2;
              postCorrectionQuaternion.setFromEuler(postCorrectionEuler);
              bone.quaternion.multiply(postCorrectionQuaternion);
              break;
            case "leftThigh":
            case "rightThigh":
            case "leftShin":
            case "rightShin":
            case "leftFoot":
            case "rightFoot":
              if (name.includes("Foot")) {
                postCorrectionEuler.x = -1.07;
              }
              postCorrectionEuler.z = Math.PI;
              postCorrectionQuaternion.setFromEuler(postCorrectionEuler);
              bone.quaternion.multiply(postCorrectionQuaternion);
              break;
            default:
              break;
          }

          delete bone.modifiedQuaternion;
        }

        bone.updateMatrix();
      }
    });

    for (const name in this.updatedQuaternion) {
      if (this.updatedQuaternion[name]) {
        const bone = this.getBoneByName(name);
        if (bone) {
          if (recordingDatum) {
            recordingDatum.quaternions[name] = bone.quaternion.toArray();
          }
        }
        delete this.updatedQuaternion[name];
      }
    }

    if (this._hasCalibratedAtLeastOnce) {
      for (const side in anchorConfiguration.updatedMass) {
        const mass = anchorConfiguration.masses[side];
        const anchorEntity = this.anchors[side].entity;
        const anchorPrimitive = this.anchors[side].primitive;
        anchorPrimitive.setAttribute(
          "radius-outer",
          THREE.Math.lerp(0, 0.5, mass)
        );

        const exceededThreshold = anchorConfiguration.exceededThresholds[side];
        const updatedThreshold = anchorConfiguration.updatedThresholds[side];

        if (updatedThreshold) {
          if (exceededThreshold) {
            const rootPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(rootPosition);

            const footPosition = new THREE.Vector3();
            this.feetObjects[side].getWorldPosition(footPosition).sub(rootPosition);

            const obstacleHeight = 0.4318; // gym bench height
            const allowSteppingOnObstacle = !true;
            if (allowSteppingOnObstacle) {
              footPosition.y =
                footPosition.y >= obstacleHeight / 2 ? obstacleHeight : 0;
            } else {
              footPosition.y = 0;
            }
            const anchorEntity = this.anchors[side].entity;
            anchorEntity.object3D.position.copy(footPosition);
            anchorEntity.object3D.updateMatrix();
          } else {
            if (!this.isOculusBrowser && !this.data.hidePressure) {
              const footStep = document.createElement("a-ring");
              footStep.setAttribute("rotation", "-90 0 0");
              footStep.object3D.position.copy(anchorEntity.object3D.position);
              footStep.object3D.position.y += 0.001;
              footStep.setAttribute("color", side == "left" ? "blue" : "red");
              footStep.setAttribute("radius-inner", 0);
              footStep.setAttribute("radius-outer", 0.15);
              footStep.setAttribute("animation__fade", {
                property: "material.opacity",
                from: 1,
                to: 0,
                dur: 4000,
                easing: "easeOutExpo",
              });
              footStep.addEventListener("animationcomplete__fade", (event) => {
                footStep.remove();
              });
              this.el.appendChild(footStep);
            }
          }

          delete anchorConfiguration.updatedThresholds[side];

          if (exceededThreshold) {
            this.el.emit(`${side}footdown`);
            this.el.emit("footdown", { side });
          } else {
            this.el.emit(`${side}footup`);
            this.el.emit("footup", { side });
          }
        } else {
          if (exceededThreshold) {
            this.el.emit(`${side}footdrag`);
            this.el.emit("footdrag", { side });
          }
        }

        anchorEntity.object3D.visible =
          this.isOculusBrowser || exceededThreshold;
        if (exceededThreshold) {
          if (
            anchorConfiguration.isAnchored &&
            anchorConfiguration.side == side &&
            anchorConfiguration.updatedAnchor
          ) {
            anchorConfiguration.position.copy(anchorEntity.object3D.position);
            delete anchorConfiguration.updatedAnchor;
          }
        }

        delete anchorConfiguration.updatedMass[side];
      }
    }

    if (this.data.pressureAnchoringEnabled && anchorConfiguration.isAnchored) {
      const anchorPosition = anchorConfiguration.position;

      const rootPosition = new THREE.Vector3();
      this.el.object3D.getWorldPosition(rootPosition);

      const { side } = anchorConfiguration;

      const footPosition = new THREE.Vector3();
      this.feetObjects[side].getWorldPosition(footPosition).sub(rootPosition);
      this.positionOffsets.lowerTorso.add(anchorPosition).sub(footPosition);
      this.bones.Hips.position.addVectors(this.positions.lowerTorso, this.positionOffsets.lowerTorso);
      this.bones.Hips.updateMatrix();

      if (recordingDatum) {
        recordingDatum.position = this.bones.Hips.position.toArray();
      }
    }

    if (this._isRecording) {
      recordedData.push(recordingDatum);
    }
  },
  getBoneByName(name) {
    return this.bones[this.boneMapping[name]];
  },
  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("manualArticulation")) {
      this.updateEntityAutoUpdate();
    }
  },
  updateEntityAutoUpdate() {
    for (const name in this.bones) {
      const bone = this.bones[name];
      bone.matrixAutoUpdate = this.data.manualArticulation;
      bone.updateMatrix();
    }
  },
  remove: function () {
    this.system.removeEntity(this);
  },
});
