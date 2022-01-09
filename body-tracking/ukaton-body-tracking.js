/* global AFRAME, THREE, WebSocketMissionDevice, BluetoothMissionDevice */

AFRAME.registerSystem("ukaton-body-tracking", {
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

AFRAME.registerComponent("ukaton-body-tracking", {
  schema: {
    footstepSounds: { type: "boolean", default: false },
    physics: { type: "boolean", default: true },
    hidePressure: { type: "boolean", default: false },
    hidePrimitives: { type: "array", default: [] },
    hideEntities: { type: "array", default: [] },
    cybershoes: { type: "boolean", default: false },
    moveHands: { type: "boolean", default: false },
    hideExtremities: { type: "boolean", default: false },
    gateway: { type: "array", default: [] },
    autoConnect: { type: "boolean", default: false },
    manualArticulation: { type: "boolean", default: false },

    pressureAnchoringEnabled: { type: "boolean", default: true },
    anchorToCamera: { type: "boolean", default: false },

    hatColor: { type: "color", default: "#171717" },

    skinColor: { type: "color", default: "#fab452" },
    headRadius: { type: "number", default: 0.11 },
    neckLength: { type: "number", default: 0.1 },

    torsoHeight: { type: "number", default: 0.5 },

    shoulderWidth: { type: "number", default: 0.38 },
    hipWidth: { type: "number", default: 0.3302 },

    shirtColor: { type: "color", default: "#171717" },
    shirtStyle: { type: "string", default: "short" },
    shoulderRadius: { type: "number", default: 0.06 },
    bicepLength: { type: "number", default: 0.25 },
    bicepRadius: { type: "number", default: 0.05 },
    elbowRadius: { type: "number", default: 0.055 },
    forearmLength: { type: "number", default: 0.29 },
    forearmRadius: { type: "number", default: 0.05 },
    handLength: { type: "number", default: 0.216 },

    pantsColor: { type: "color", default: "#3e88c1" },
    pantsStyle: { type: "string", default: "long" },
    legSocketRadius: { type: "number", default: 0.06 },
    thighLength: { type: "number", default: 0.45 },
    thighRadius: { type: "number", default: 0.05 },
    kneeRadius: { type: "number", default: 0.055 },
    shinLength: { type: "number", default: 0.48 },
    shinRadius: { type: "number", default: 0.05 },

    shoeColor1: { type: "color", default: "#1c1c1c" },
    shoeColor2: { type: "color", default: "white" },
    footLength: { type: "number", default: 0.25 },
  },
  init: function () {
    window._rig = this;

    if (this.data.cybershoes) {
      this.cameraRigEl = document.getElementById("cameraRig");
    }
    
    this.recordedData = [];

    this.isOculusBrowser = AFRAME.utils.device.isOculusBrowser();
    if (this.isOculusBrowser) {
      this.handContainers = {};
      this.hands = {};
      ["left", "right"].forEach((side) => {
        const handContainerEl = document.createElement("a-entity");
        const handEl = document.createElement("a-entity");
        handEl.setAttribute("hand-tracking-controls", {
          hand: side,
          modelColor: this.data.skinColor,
        });
        handEl.setAttribute("shadow", "");

        this.hands[side] = handEl;
        this.handContainers[side] = handContainerEl;

        if (this.data.cybershoes) {
          this.cameraRigEl.appendChild(handContainerEl);
        } else {
          this.el.sceneEl.appendChild(handContainerEl);
        }
        handContainerEl.appendChild(handEl);
      });

      for (const side in this.hands) {
        let pinchTimeoutHandle;
        let pinchCounter;
        this.hands[side].addEventListener("pinchstarted", (event) => {
          clearTimeout(pinchTimeoutHandle);

          pinchCounter++;
          if (pinchCounter >= 2) {
            this.hands[side].emit("doublepinch");
            this.el.emit(`${side}doublepinch`);
            pinchCounter = 0;
          } else {
            pinchTimeoutHandle = setTimeout(() => {
              pinchCounter = 0;
            }, 1000);
          }
        });

        this.hands.right.addEventListener("doublepinch", (event) => {
          this.calibrate(2000);
          this._setHandColor(side, "red");
          setTimeout(() => {
            this._setHandColor(side, this.data.skinColor);
          }, 2000);
        });
      }

      setInterval(() => {
        this._updateHandPositions();
      }, 1000 / 60);
    }
    this.cameraEl = document.querySelector("a-camera");

    this.headsetQuaternionOffset = new THREE.Quaternion();
    this.headsetQuaternionYawOffset = new THREE.Quaternion();

    this.webSocketMissionDevices = {};
    this.devices = [];
    this.namedDevices = {};

    const entities = (this.entities = {});
    this.positions = {};
    this.positionOffsets = {};
    this.quaternionOffsets = {};
    this.yawQuaternionOffsets = {};
    this.pitchRollQuaternionOffsets = {};
    this.quaternions = {};
    this.updatedQuaternion = {};
    const correctionQuaternions = (this.correctionQuaternions = {});
    {
      const _euler = new THREE.Euler();
      window._euler = _euler;

      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      entities.lowerTorso = document.createElement("a-entity");
      entities.upperTorso = document.createElement("a-entity");
      correctionQuaternions.upperTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.lowerTorso.appendChild(entities.upperTorso);
      correctionQuaternions.lowerTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );

      entities.head = document.createElement("a-entity");
      entities.upperTorso.appendChild(entities.head);

      _euler.set(0, Math.PI, 0);
      entities.leftBicep = document.createElement("a-entity");
      correctionQuaternions.leftBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.upperTorso.appendChild(entities.leftBicep);
      entities.leftForearm = document.createElement("a-entity");
      correctionQuaternions.leftForearm = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.leftBicep.appendChild(entities.leftForearm);
      entities.leftHand = document.createElement("a-entity");
      correctionQuaternions.leftHand = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.leftForearm.appendChild(entities.leftHand);

      _euler.set(0, 0, 0);
      entities.rightBicep = document.createElement("a-entity");
      correctionQuaternions.rightBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.upperTorso.appendChild(entities.rightBicep);
      entities.rightForearm = document.createElement("a-entity");
      correctionQuaternions.rightForearm = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.rightBicep.appendChild(entities.rightForearm);
      entities.rightHand = document.createElement("a-entity");
      correctionQuaternions.rightHand = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.rightForearm.appendChild(entities.rightHand);

      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      entities.leftThigh = document.createElement("a-entity");
      correctionQuaternions.leftThigh = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.lowerTorso.appendChild(entities.leftThigh);
      entities.leftShin = document.createElement("a-entity");
      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      correctionQuaternions.leftShin = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.leftThigh.appendChild(entities.leftShin);
      entities.leftFoot = document.createElement("a-entity");
      entities.leftShin.appendChild(entities.leftFoot);

      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      entities.rightThigh = document.createElement("a-entity");
      correctionQuaternions.rightThigh = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.lowerTorso.appendChild(entities.rightThigh);
      _euler.set(-Math.PI / 2, Math.PI, -Math.PI / 2);
      entities.rightShin = document.createElement("a-entity");
      correctionQuaternions.rightShin = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.rightThigh.appendChild(entities.rightShin);
      entities.rightFoot = document.createElement("a-entity");
      entities.rightShin.appendChild(entities.rightFoot);

      entities.leftAnchor = document.createElement("a-entity");
      entities.leftAnchor.object3D.visible = false;
      entities.rightAnchor = document.createElement("a-entity");
      entities.rightAnchor.object3D.visible = false;
    }

    const primitives = (this.primitives = {});
    {
      primitives.lowerTorso = document.createElement("a-box");
      primitives.upperTorso = document.createElement("a-box");

      primitives.head = document.createElement("a-sphere");
      primitives.leftEye = document.createElement("a-sphere");
      primitives.leftEye.setAttribute("color", "black");
      primitives.leftEye.setAttribute("radius", "0.02");
      primitives.head.appendChild(primitives.leftEye);
      primitives.rightEye = document.createElement("a-sphere");
      primitives.rightEye.setAttribute("color", "black");
      primitives.rightEye.setAttribute("radius", "0.02");
      primitives.head.appendChild(primitives.rightEye);

      primitives.hatCrown = document.createElement("a-sphere");
      primitives.head.setAttribute("theta-start", 75);
      primitives.hatCrown.setAttribute("theta-length", 75);
      primitives.head.appendChild(primitives.hatCrown);
      primitives.hatBrim = document.createElement("a-ring");
      primitives.hatBrim.setAttribute("radius-inner", 0);
      primitives.hatBrim.setAttribute("radius-outer", 0.1);
      primitives.hatBrim.setAttribute("position", "0 0.029 0");
      primitives.hatBrim.setAttribute("scale", "1 2.5 1");
      primitives.hatBrim.setAttribute("theta-length", 180);
      primitives.hatBrim.setAttribute("material", "side:double");
      primitives.hatBrim.setAttribute("rotation", "-90 0 0");
      primitives.head.appendChild(primitives.hatBrim);

      primitives.leftShoulder = document.createElement("a-sphere");
      entities.leftBicep.appendChild(primitives.leftShoulder);
      primitives.leftBicep = document.createElement("a-cylinder");
      primitives.leftBicep.setAttribute("rotation", "0 0 90");
      primitives.leftElbow = document.createElement("a-sphere");
      entities.leftForearm.appendChild(primitives.leftElbow);
      primitives.leftForearm = document.createElement("a-cylinder");
      primitives.leftForearm.setAttribute("rotation", "0 0 90");
      primitives.leftHand = document.createElement("a-box");

      primitives.rightShoulder = document.createElement("a-sphere");
      entities.rightBicep.appendChild(primitives.rightShoulder);
      primitives.rightBicep = document.createElement("a-cylinder");
      primitives.rightBicep.setAttribute("rotation", "0 0 -90");
      primitives.rightElbow = document.createElement("a-sphere");
      entities.rightForearm.appendChild(primitives.rightElbow);
      primitives.rightForearm = document.createElement("a-cylinder");
      primitives.rightForearm.setAttribute("rotation", "0 0 -90");
      primitives.rightHand = document.createElement("a-box");

      primitives.leftLegSocket = document.createElement("a-sphere");
      entities.leftThigh.appendChild(primitives.leftLegSocket);
      primitives.leftThigh = document.createElement("a-cylinder");
      primitives.leftKnee = document.createElement("a-sphere");
      entities.leftShin.appendChild(primitives.leftKnee);
      primitives.leftShin = document.createElement("a-cylinder");
      primitives.leftShoe1 = document.createElement("a-box");
      entities.leftFoot.appendChild(primitives.leftShoe1);
      primitives.leftShoe2 = document.createElement("a-box");
      entities.leftFoot.appendChild(primitives.leftShoe2);
      if (this.data.footstepSounds) {
        primitives.leftShoe1.setAttribute(
          "resonance-audio",
          "src: #footstepSound;"
        );
        this.el.addEventListener("leftfootdown", () => {
          this.primitives.leftShoe1.emit("playaudio");
        });
      }

      primitives.rightLegSocket = document.createElement("a-sphere");
      entities.rightThigh.appendChild(primitives.rightLegSocket);
      primitives.rightThigh = document.createElement("a-cylinder");
      primitives.rightKnee = document.createElement("a-sphere");
      entities.rightShin.appendChild(primitives.rightKnee);
      primitives.rightShin = document.createElement("a-cylinder");
      primitives.rightShoe1 = document.createElement("a-box");
      entities.rightFoot.appendChild(primitives.rightShoe1);
      primitives.rightShoe2 = document.createElement("a-box");
      entities.rightFoot.appendChild(primitives.rightShoe2);
      if (this.data.footstepSounds) {
        primitives.rightShoe1.setAttribute(
          "resonance-audio",
          "src: #footstepSound;"
        );
        this.el.addEventListener("rightfootdown", () => {
          this.primitives.rightShoe1.emit("playaudio");
        });
      }

      primitives.leftAnchor = document.createElement("a-ring");
      primitives.leftAnchor.setAttribute(
        "position",
        `0 0.001 ${-this.data.footLength / 2}`
      );
      primitives.leftAnchor.setAttribute("rotation", "-90 0 0");
      primitives.leftAnchor.setAttribute("radius-inner", 0);
      primitives.leftAnchor.setAttribute("radius-outer", 0.2);
      primitives.leftAnchor.setAttribute("color", "blue");
      if (this.data.hidePressure) {
        primitives.leftAnchor.setAttribute("visible", "false");
      }

      primitives.rightAnchor = document.createElement("a-ring");
      primitives.rightAnchor.setAttribute(
        "position",
        `0 0.001 ${-this.data.footLength / 2}`
      );
      primitives.rightAnchor.setAttribute("rotation", "-90 0 0");
      primitives.rightAnchor.setAttribute("radius-inner", 0);
      primitives.rightAnchor.setAttribute("radius-outer", 0.2);
      primitives.rightAnchor.setAttribute("color", "red");
      if (this.data.hidePressure) {
        primitives.rightAnchor.setAttribute("visible", "false");
      }
    }

    this._updateExtremities();
    if (this.isOculusBrowser) {
      this.primitives.leftHand.object3D.visible = false;
      this.primitives.rightHand.object3D.visible = false;
    }

    for (const name in entities) {
      const entity = entities[name];
      entity.id = name;
      if (name in primitives) {
        entity.appendChild(primitives[name]);
      }
      this.quaternions[name] = new THREE.Quaternion();
      this.quaternionOffsets[name] = new THREE.Quaternion();
      this.yawQuaternionOffsets[name] = new THREE.Quaternion();
      this.pitchRollQuaternionOffsets[name] = new THREE.Quaternion();
      this.positions[name] = new THREE.Vector3();
      this.positionOffsets[name] = new THREE.Vector3();
    }

    this.el.appendChild(entities.lowerTorso);
    this.el.appendChild(entities.leftAnchor);
    this.el.appendChild(entities.rightAnchor);

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

    if (this.data.cybershoes) {
      Object.assign(anchorConfiguration.thresholds, {
        left: 0.02,
        right: 0.02,
      });
    }

    this.el.addEventListener("connect", (event) => this.connect());
    this.el.addEventListener("addbluetoothdevice", (event) =>
      this._addBluetoothDevice()
    );
    this.el.addEventListener("calibrate", (event) =>
      this.calibrate(event.detail.delay)
    );

    this.system.addEntity(this);

    if (this.data.autoConnect) {
      this.connect();
    }

    this.updateEntityLengths();
    this.updatePrimitiveLengths();
    if (this.data.physics) {
      const sides = ["left", "right"];
      const parts = [1, 2];
      sides.forEach((side) => {
        parts.forEach((part) => {
          const name = `${side}Shoe${part}`;
          const primitive = this.primitives[name];
          primitive.addEventListener("loaded", (event) => {
            primitive.setAttribute(
              "physics",
              `mass: 0; name: ${name}; shape: box; scale: ${primitive.object3D.scale
                .toArray()
                .join(",")};`
            );
          });
        });
      });
    }
  },
  _setHandColor: function (side, color) {
    if (this.hands && side in this.hands) {
      const hand = this.hands[side];
      const setColor = () => {
        const mesh = this.hands[side].getObject3D("mesh");
        if (mesh) {
          mesh.children[30].material.color = new THREE.Color(color);
        }
      };
      if (hand.hasLoaded) {
        setColor();
      } else {
        hand.addEventListener("loaded", () => setColor());
      }
    }
  },
  _updateExtremities: function () {
    [
      "head",
      "hatBrim",
      "hatCrown",
      "leftEye",
      "rightEye",
      "leftHand",
      "rightHand",
    ].forEach((primitiveToHide) => {
      const primitive = this.primitives[primitiveToHide];
      const onLoaded = () => {
        primitive
          .getObject3D("mesh")
          .layers.set(this.data.hideExtremities ? 3 : 0);
      };
      if (primitive.hasLoaded) {
        onLoaded();
      } else {
        primitive.addEventListener("loaded", () => onLoaded());
      }
    });
  },
  _updatePrimitiveVisibility: function () {
    for (const name in this.primitives) {
      this.primitives[name].object3D.visible =
        !this.data.hidePrimitives.includes(name);
    }
  },
  _updateEntityVisibility: function () {
    for (const name in this.entities) {
      this.entities[name].object3D.visible =
        !this.data.hideEntities.includes(name);
    }
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
    const { anchorConfiguration, entities } = this;

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

      sensorDataConfigurations.pressure.mass = 60;
    }

    device.addEventListener("quaternion", (event) => {
      const entity = entities[name];
      if (entity) {
        this._tickFlag = true;

        const { quaternion } = event.message;
        if (name in this.correctionQuaternions) {
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

    sensorDataConfigurations.motion.quaternion = 60;

    await device.setSensorDataConfigurations(sensorDataConfigurations);
  },
  _addBluetoothDevice: async function () {
    console.log("getting device");
    const bluetoothMissionDevice = new BluetoothMissionDevice();
    await bluetoothMissionDevice.connect();
    console.log("got bluetooth mission device", bluetoothMissionDevice);
    await this._setupDevice(bluetoothMissionDevice);
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
  updateEntityLengths: function () {
    const { entities } = this;

    entities.lowerTorso.object3D.position.y =
      this.data.thighLength + this.data.shinLength;
    entities.upperTorso.object3D.position.y = this.data.torsoHeight / 2;
    entities.head.object3D.position.y = this.data.torsoHeight / 2;

    entities.leftBicep.object3D.position.set(
      -this.data.shoulderWidth / 2,
      this.data.torsoHeight / 2,
      0
    );
    entities.leftForearm.object3D.position.x = -this.data.bicepLength;
    entities.leftHand.object3D.position.x = -this.data.forearmLength;

    entities.rightBicep.object3D.position.set(
      this.data.shoulderWidth / 2,
      this.data.torsoHeight / 2,
      0
    );
    entities.rightForearm.object3D.position.x = this.data.bicepLength;
    entities.rightHand.object3D.position.x = this.data.forearmLength;

    entities.leftThigh.object3D.position.x = -this.data.hipWidth / 2;
    entities.leftShin.object3D.position.y = -this.data.thighLength;
    entities.leftFoot.object3D.position.y = -this.data.shinLength;

    entities.rightThigh.object3D.position.x = this.data.hipWidth / 2;
    entities.rightShin.object3D.position.y = -this.data.thighLength;
    entities.rightFoot.object3D.position.y = -this.data.shinLength;

    entities.leftAnchor.object3D.position.x = -this.data.hipWidth / 2;
    entities.rightAnchor.object3D.position.x = this.data.hipWidth / 2;

    for (const name in entities) {
      const entity = entities[name];
      this.positions[name].copy(entity.object3D.position);
      entity.object3D.updateMatrix();
    }
  },
  updatePrimitiveLengths: function () {
    const { primitives } = this;

    primitives.lowerTorso.setAttribute(
      "scale",
      `${this.data.hipWidth} ${this.data.torsoHeight / 2} 0.1`
    );
    primitives.lowerTorso.setAttribute(
      "position",
      `0 ${this.data.torsoHeight / 4} 0`
    );
    primitives.upperTorso.setAttribute(
      "scale",
      `${this.data.shoulderWidth} ${this.data.torsoHeight / 3} 0.1`
    );
    primitives.upperTorso.setAttribute(
      "position",
      `0 ${this.data.torsoHeight / 3} 0`
    );

    primitives.head.setAttribute("radius", this.data.headRadius);
    primitives.hatCrown.setAttribute("radius", this.data.headRadius);
    //primitives.hatBrim.setAttribute("radius-outer", this.data.headRadius);
    primitives.head.setAttribute(
      "position",
      `0 ${this.data.neckLength + this.data.headRadius} 0`
    );
    primitives.leftEye.setAttribute(
      "position",
      `-${this.data.headRadius / 3} 0 -${this.data.headRadius - 0.01}`
    );
    primitives.rightEye.setAttribute(
      "position",
      `${this.data.headRadius / 3} 0 -${this.data.headRadius - 0.01}`
    );

    primitives.leftShoulder.setAttribute("radius", this.data.shoulderRadius);
    primitives.leftBicep.setAttribute("height", this.data.bicepLength);
    primitives.leftBicep.setAttribute("radius", this.data.bicepRadius);
    primitives.leftBicep.setAttribute(
      "position",
      `-${this.data.bicepLength / 2} 0 0`
    );
    primitives.leftElbow.setAttribute("radius", this.data.elbowRadius);
    primitives.leftForearm.setAttribute("height", this.data.forearmLength);
    primitives.leftForearm.setAttribute("radius", this.data.forearmRadius);
    primitives.leftForearm.setAttribute(
      "position",
      `-${this.data.forearmLength / 2} 0 0`
    );
    primitives.leftHand.setAttribute(
      "scale",
      `${this.data.handLength} 0.05 0.1`
    );
    primitives.leftHand.setAttribute(
      "position",
      `-${this.data.handLength / 2} 0 0`
    );

    primitives.rightShoulder.setAttribute("radius", this.data.shoulderRadius);
    primitives.rightBicep.setAttribute("height", this.data.bicepLength);
    primitives.rightBicep.setAttribute("radius", this.data.bicepRadius);
    primitives.rightBicep.setAttribute(
      "position",
      `${this.data.bicepLength / 2} 0 0`
    );
    primitives.rightElbow.setAttribute("radius", this.data.elbowRadius);
    primitives.rightForearm.setAttribute("height", this.data.forearmLength);
    primitives.rightForearm.setAttribute("radius", this.data.forearmRadius);
    primitives.rightForearm.setAttribute(
      "position",
      `${this.data.forearmLength / 2} 0 0`
    );
    primitives.rightHand.setAttribute(
      "scale",
      `${this.data.handLength} 0.05 0.1`
    );
    primitives.rightHand.setAttribute(
      "position",
      `${this.data.handLength / 2} 0 0`
    );

    primitives.leftLegSocket.setAttribute("radius", this.data.legSocketRadius);
    primitives.leftThigh.setAttribute(
      "position",
      `0 -${this.data.thighLength / 2} 0`
    );
    primitives.leftThigh.setAttribute("height", this.data.thighLength);
    primitives.leftThigh.setAttribute("radius", this.data.thighRadius);
    primitives.leftKnee.setAttribute("radius", this.data.kneeRadius);
    primitives.leftShin.setAttribute(
      "position",
      `0 -${this.data.shinLength / 2} 0`
    );
    primitives.leftShin.setAttribute("height", this.data.shinLength - 0.05);
    primitives.leftShin.setAttribute("radius", this.data.shinRadius);
    primitives.leftShoe1.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.06 ${this.data.footLength}`
    );
    primitives.leftShoe1.setAttribute(
      "position",
      `0 0.06 -${this.data.footLength / 3}`
    );
    primitives.leftShoe2.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.03 ${this.data.footLength}`
    );
    primitives.leftShoe2.setAttribute(
      "position",
      `0 0.015 -${this.data.footLength / 3}`
    );

    primitives.rightLegSocket.setAttribute("radius", this.data.legSocketRadius);
    primitives.rightThigh.setAttribute(
      "position",
      `0 -${this.data.thighLength / 2} 0`
    );
    primitives.rightThigh.setAttribute("height", this.data.thighLength);
    primitives.rightThigh.setAttribute("radius", this.data.thighRadius);
    primitives.rightKnee.setAttribute("radius", this.data.kneeRadius);
    primitives.rightShin.setAttribute(
      "position",
      `0 -${this.data.shinLength / 2} 0`
    );
    primitives.rightShin.setAttribute("height", this.data.shinLength - 0.05);
    primitives.rightShin.setAttribute("radius", this.data.shinRadius);
    primitives.rightShoe1.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.06 ${this.data.footLength}`
    );
    primitives.rightShoe1.setAttribute(
      "position",
      `0 0.06 -${this.data.footLength / 3}`
    );
    primitives.rightShoe2.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.03 ${this.data.footLength}`
    );
    primitives.rightShoe2.setAttribute(
      "position",
      `0 0.015 -${this.data.footLength / 3}`
    );
  },
  updatePrimitiveColors: function () {
    const { primitives } = this;

    primitives.hatCrown.setAttribute("color", this.data.hatColor);
    primitives.hatBrim.setAttribute("color", this.data.hatColor);
    primitives.head.setAttribute("color", this.data.skinColor);
    primitives.leftHand.setAttribute("color", this.data.skinColor);
    primitives.rightHand.setAttribute("color", this.data.skinColor);

    this._setHandColor("left", this.data.skinColor);
    this._setHandColor("right", this.data.skinColor);

    primitives.upperTorso.setAttribute("color", this.data.shirtColor);
    primitives.lowerTorso.setAttribute("color", this.data.shirtColor);

    switch (this.data.shirtStyle) {
      case "long":
        primitives.leftShoulder.setAttribute("color", this.data.shirtColor);
        primitives.leftBicep.setAttribute("color", this.data.shirtColor);
        primitives.leftElbow.setAttribute("color", this.data.shirtColor);
        primitives.leftForearm.setAttribute("color", this.data.shirtColor);
        primitives.rightShoulder.setAttribute("color", this.data.shirtColor);
        primitives.rightBicep.setAttribute("color", this.data.shirtColor);
        primitives.rightElbow.setAttribute("color", this.data.shirtColor);
        primitives.rightForearm.setAttribute("color", this.data.shirtColor);
        break;
      case "short":
        primitives.leftShoulder.setAttribute("color", this.data.shirtColor);
        primitives.leftBicep.setAttribute("color", this.data.shirtColor);
        primitives.leftElbow.setAttribute("color", this.data.skinColor);
        primitives.leftForearm.setAttribute("color", this.data.skinColor);
        primitives.rightShoulder.setAttribute("color", this.data.shirtColor);
        primitives.rightBicep.setAttribute("color", this.data.shirtColor);
        primitives.rightElbow.setAttribute("color", this.data.skinColor);
        primitives.rightForearm.setAttribute("color", this.data.skinColor);
        break;
      case "sleeveless":
        primitives.leftShoulder.setAttribute("color", this.data.skinColor);
        primitives.leftBicep.setAttribute("color", this.data.skinColor);
        primitives.leftElbow.setAttribute("color", this.data.skinColor);
        primitives.leftForearm.setAttribute("color", this.data.skinColor);
        primitives.rightShoulder.setAttribute("color", this.data.skinColor);
        primitives.rightBicep.setAttribute("color", this.data.skinColor);
        primitives.rightElbow.setAttribute("color", this.data.skinColor);
        primitives.rightForearm.setAttribute("color", this.data.skinColor);
        break;
    }

    switch (this.data.pantsStyle) {
      case "long":
        primitives.leftLegSocket.setAttribute("color", this.data.pantsColor);
        primitives.leftThigh.setAttribute("color", this.data.pantsColor);
        primitives.leftKnee.setAttribute("color", this.data.pantsColor);
        primitives.leftShin.setAttribute("color", this.data.pantsColor);
        primitives.rightLegSocket.setAttribute("color", this.data.pantsColor);
        primitives.rightThigh.setAttribute("color", this.data.pantsColor);
        primitives.rightKnee.setAttribute("color", this.data.pantsColor);
        primitives.rightShin.setAttribute("color", this.data.pantsColor);
        break;
      case "short":
        primitives.leftLegSocket.setAttribute("color", this.data.pantsColor);
        primitives.leftThigh.setAttribute("color", this.data.pantsColor);
        primitives.leftKnee.setAttribute("color", this.data.pantsColor);
        primitives.leftShin.setAttribute("color", this.data.skinColor);
        primitives.rightLegSocket.setAttribute("color", this.data.pantsColor);
        primitives.rightThigh.setAttribute("color", this.data.pantsColor);
        primitives.rightKnee.setAttribute("color", this.data.pantsColor);
        primitives.rightShin.setAttribute("color", this.data.skinColor);
        break;
    }

    primitives.leftShoe1.setAttribute("color", this.data.shoeColor1);
    primitives.leftShoe2.setAttribute("color", this.data.shoeColor2);

    primitives.rightShoe1.setAttribute("color", this.data.shoeColor1);
    primitives.rightShoe2.setAttribute("color", this.data.shoeColor2);
  },
  calibrate: function (delay) {
    setTimeout(() => this._calibrate(), delay);
  },
  _calibrate: function () {
    console.log("calibrating");
    if (this.isOculusBrowser) {
      this.headsetQuaternionOffset.copy(this.cameraEl.object3D.quaternion);

      const euler = new THREE.Euler();
      euler.order = "YXZ";

      euler.setFromQuaternion(this.headsetQuaternionOffset);
      euler.x = euler.z = 0;
      this.headsetQuaternionYawOffset.setFromEuler(euler);
    }

    for (const name in this.entities) {
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
    }
    this._hasCalibratedAtLeastOnce = true;

    {
      const { position } = this.entities.lowerTorso.object3D;
      position.x = position.z = 0;
    }

    this.anchorConfiguration.isAnchored = false;
    Object.assign(this.anchorConfiguration.masses, { left: 0, right: 0 });
    Object.assign(this.anchorConfiguration.updatedMass, {
      left: true,
      right: true,
    });
    this.entities.leftAnchor.object3D.visible = false;
    this.entities.rightAnchor.object3D.visible = false;
  },
  startRecording: function() {
    this.recordedData.length = 0; // [...{timestamp, position?, quaternions: {deviceName: quaternion}}]
    this._isRecording = true;
  },
  stopRecording: function() {
    this._isRecording = false;
    const {recordedData} = this;
    if (recordedData.length > 0) {
      recordedData.duration = Math.ceil(recordedData[recordedData.length-1].timestamp);
    }
  },
  getRecordingDatumByTime(time) {
    const {recordedData} = this;
    
    return recordedData.find((_, index) => {
        const nextDatum = recordedData[index+1];
        return !nextDatum || nextDatum.timestamp > time;
      });
  },
  tick: function () {    
    if (this._tickFlag) {
      this._tick(...arguments);
      delete this._tickFlag;
    }
    
    if (this.data.anchorToCamera) {
      this._anchorToCamera();
    }
  },
  _anchorToCamera: function () {
    const cameraPosition = this.cameraEl.object3D.position.clone();

    const lowerTorsoEntity = this.entities.lowerTorso;
    const lowerTorsoPosition = new THREE.Vector3();
    lowerTorsoEntity.object3D.getWorldPosition(lowerTorsoPosition);

    const headEntity = this.entities.head;
    const headPosition = new THREE.Vector3();
    headEntity.object3D.getWorldPosition(headPosition);
    headPosition.z -= 0.1;

    const headToTorso = new THREE.Vector3()
      .subVectors(lowerTorsoPosition, headPosition)
      .sub(this.primitives.head.object3D.position);

    lowerTorsoEntity.object3D.position.addVectors(cameraPosition, headToTorso);
    lowerTorsoEntity.object3D.position.y += 0.1;
    lowerTorsoEntity.object3D.updateMatrix();

    const headQuaternion = this.cameraEl.object3D.quaternion.clone();
    headEntity.object3D.quaternion.copy(headQuaternion);
    const headParentEntityQuaternion = new THREE.Quaternion();
    headEntity.parentEl.object3D
      .getWorldQuaternion(headParentEntityQuaternion)
      .invert();
    headEntity.object3D.quaternion.premultiply(headParentEntityQuaternion);
    headEntity.object3D.updateMatrix();

    if (this.isOculusBrowser && this.data.moveHands) {
      for (const side in this.hands) {
        const hand = this.hands[side];
        const { mesh, skinnedMesh } = hand.components["hand-tracking-controls"];
        if (skinnedMesh && mesh) {
          const wristBone = skinnedMesh.skeleton.getBoneByName(
            `b_${side == "left" ? "l" : "r"}_wrist`
          );
          if (wristBone) {
            let wristPosition = new THREE.Vector3();
            wristBone.getWorldPosition(wristPosition);

            let handPosition = new THREE.Vector3();
            this.entities[`${side}Hand`].object3D.getWorldPosition(
              handPosition
            );

            const meshPosition = new THREE.Vector3();
            meshPosition.copy(wristPosition).multiplyScalar(-1);

            if (window.offset) {
              meshPosition.add(window.offset);
            } else {
              window.offset = new THREE.Vector3();
            }
            mesh.position.copy(meshPosition);

            /*
            const handEntityPosition = new THREE.Vector3();
            this.entities[`${side}Hand`].object3D.getWorldPosition(
              handEntityPosition
            );

            this.handContainers[side].object3D.position.copy(
              handEntityPosition
            );
            this.handContainers[side].object3D.position.y -= 1.5;
            */
          }
        }
      }
    }
  },
  _updateHandPositions: function () {
    if (this.isOculusBrowser && this.data.moveHands) {
      for (const side in this.hands) {
        const hand = this.hands[side];
        const { mesh, skinnedMesh } = hand.components["hand-tracking-controls"];
        if (skinnedMesh && mesh) {
          const wristBone = skinnedMesh.skeleton.getBoneByName(
            `b_${side == "left" ? "l" : "r"}_wrist`
          );
          if (wristBone) {
            const handEntityPosition = new THREE.Vector3();
            this.entities[`${side}Hand`].object3D.getWorldPosition(
              handEntityPosition
            );

            this.handContainers[side].object3D.position.copy(
              handEntityPosition
            );
            this.handContainers[side].object3D.position.y -= 1.5;
          }
        }
      }
    }
  },
  _tick: function (time) {
    let recordingDatum;
    const {recordedData} = this;
    if (this._isRecording) {
      recordingDatum = {quaternions: {}};
      if (recordedData.length == 0) {
        recordingDatum.timestamp = 0;
        recordedData.baseTime = time;
      }
      else {
        recordingDatum.timestamp = time - recordedData.baseTime;
      }
    }
    
    const { entities, primitives, anchorConfiguration } = this;
    for (const name in this.updatedQuaternion) {
      if (this.updatedQuaternion[name]) {
        const entity = entities[name];
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

        entity.parentEl.object3D
          .getWorldQuaternion(entity.object3D.quaternion)
          .invert()
          .multiply(this.headsetQuaternionYawOffset)
          .multiply(this.el.object3D.quaternion)
          .multiply(modifiedQuaternion);
      }
    }

    for (const name in this.updatedQuaternion) {
      if (this.updatedQuaternion[name]) {
        const entity = entities[name];
        entity.object3D.updateMatrix();
        
        if (recordingDatum) {
          recordingDatum.quaternions[name] = entity.object3D.quaternion.toArray();
        }

        delete this.updatedQuaternion[name];
      }
    }

    if (this._hasCalibratedAtLeastOnce) {
      for (const side in anchorConfiguration.updatedMass) {
        const mass = anchorConfiguration.masses[side];
        const anchorEntity = entities[`${side}Anchor`];
        const anchorPrimitive = primitives[`${side}Anchor`];
        anchorPrimitive.setAttribute(
          "radius-outer",
          this.data.cybershoes
            ? THREE.Math.lerp(0, 4, mass)
            : THREE.Math.lerp(0, 0.5, mass)
        );

        const exceededThreshold = anchorConfiguration.exceededThresholds[side];
        const updatedThreshold = anchorConfiguration.updatedThresholds[side];

        if (updatedThreshold) {
          /*
          console.log(
            `${side}: ${exceededThreshold ? "above" : "below"} threshold`
          );
          */
          if (exceededThreshold) {
            const rootPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(rootPosition);

            const footEntity = entities[`${side}Foot`];
            const footPosition = new THREE.Vector3();
            footEntity.object3D
              .getWorldPosition(footPosition)
              .sub(rootPosition);

            const obstacleHeight = 0.4318; // gym bench height
            const allowSteppingOnObstacle = false;
            if (allowSteppingOnObstacle) {
              footPosition.y =
                footPosition.y >= obstacleHeight / 2 ? obstacleHeight : 0;
            } else {
              footPosition.y = 0;
            }
            const anchorEntity = entities[`${side}Anchor`];
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
      const footEntity = entities[`${side}Foot`];
      const footPosition = new THREE.Vector3();
      footEntity.object3D.getWorldPosition(footPosition).sub(rootPosition);

      this.positionOffsets.lowerTorso.add(anchorPosition).sub(footPosition);

      const lowerTorsoEntity = entities.lowerTorso;
      lowerTorsoEntity.object3D.position.addVectors(
        this.positions.lowerTorso,
        this.positionOffsets.lowerTorso
      );

      lowerTorsoEntity.object3D.updateMatrix();
      
      if (recordingDatum) {
          recordingDatum.position = lowerTorsoEntity.object3D.position.toArray();
        }

      if (this.data.cybershoes) {
        const { x, y, z } = lowerTorsoEntity.object3D.position;
        this.cameraRigEl.object3D.position.x = x;
        this.cameraRigEl.object3D.position.z = z - 0.1;
      }
    }
    
    if (this._isRecording) {
      recordedData.push(recordingDatum);
    }
  },
  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);
    if (
      diffKeys.some((key) => key.includes("Color") || key.includes("Style"))
    ) {
      this.updatePrimitiveColors();
    }
    if (
      diffKeys.some(
        (key) =>
          key.includes("Length") ||
          key.includes("Radius") ||
          key.includes("Width") ||
          key.includes("Size") ||
          key.includes("Height")
      )
    ) {
      this.updateEntityLengths();
      this.updatePrimitiveLengths();
    }

    if (diffKeys.includes("manualArticulation")) {
      this.updateEntityAutoUpdate();
    }

    if (diffKeys.includes("hideExtremities")) {
      this._updateExtremities();
    }

    if (diffKeys.includes("hidePrimitives")) {
      this._updatePrimitiveVisibility();
    }
    if (diffKeys.includes("hideEntities")) {
      this._updateEntityVisibility();
    }
  },
  updateEntityAutoUpdate() {
    const { entities } = this;
    for (const name in entities) {
      const entity = entities[name];
      entity.object3D.matrixAutoUpdate = this.data.manualArticulation;
    }
  },
  remove: function () {
    this.system.removeEntity(this);
  },
});
