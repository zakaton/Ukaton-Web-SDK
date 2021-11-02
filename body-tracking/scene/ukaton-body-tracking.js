/* global AFRAME, THREE, MissionMesh */

AFRAME.registerSystem("ukaton-body-tracking", {
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

AFRAME.registerComponent("ukaton-body-tracking", {
  schema: {
    gateway: { type: "array", default: [] },
    autoConnect: { type: "boolean", default: false },
    manualArticulation: { type: "boolean", default: false },

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
    footLength: { type: "number", default: 0.25 }
  },
  init: function() {
    window._rig = this;
    
    this.missionMeshes = {};

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
      correctionQuaternions.leftShin = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.leftThigh.appendChild(entities.leftShin);
      entities.leftFoot = document.createElement("a-entity");
      entities.leftShin.appendChild(entities.leftFoot);

      entities.rightThigh = document.createElement("a-entity");
      correctionQuaternions.rightThigh = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.lowerTorso.appendChild(entities.rightThigh);
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

      primitives.leftAnchor = document.createElement("a-ring");
      primitives.leftAnchor.setAttribute("position", "0 0.001 0");
      primitives.leftAnchor.setAttribute("rotation", "-90 0 0");
      primitives.leftAnchor.setAttribute("radius-inner", 0);
      primitives.leftAnchor.setAttribute("radius-outer", 0.2);
      primitives.leftAnchor.setAttribute("color", "blue");

      primitives.rightAnchor = document.createElement("a-ring");
      primitives.rightAnchor.setAttribute("position", "0 0.001 0");
      primitives.rightAnchor.setAttribute("rotation", "-90 0 0");
      primitives.rightAnchor.setAttribute("radius-inner", 0);
      primitives.rightAnchor.setAttribute("radius-outer", 0.2);
      primitives.rightAnchor.setAttribute("color", "red");
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
      thresholds: { left: 0.1, right: 0.1 },
      updatedMass: {},
      updatedAnchor: false,
      isAnchored: false,
      side: "",
      position: new THREE.Vector3(),
      exceededThresholds: { left: false, right: false },
      updatedThresholds: { left: false, right: false }
    });

    this.el.addEventListener("connect", event => this.connect());
    this.el.addEventListener("calibrate", event =>
      this.calibrate(event.detail.delay)
    );

    this.system.addEntity(this);

    if (this.data.autoConnect) {
      this.connect();
    }
  },
  _createMissionMesh: function() {
    const missionMesh = new MissionMesh();
    missionMesh.addEventListener("numberofdevices", async event => {
      missionMesh.devices.forEach(device => {
        this._handleDevice(device, false);
      });
      missionMesh.send();

      missionMesh.addEventListener("deviceadded", async event => {
        const { device } = event.message;
        await this._handleDevice(device, true);
      });
    });
    missionMesh.addEventListener("disconnected", event => {
      return;
      setTimeout(() => {
        missionMesh.connect(missionMesh._webSocket.url);
      }, 3000);
    });
    return missionMesh;
  },
  _handleDevice: async function(
    device,
    sendImmediately,
    addEventListeners = true
  ) {
    const { anchorConfiguration, entities } = this;

    const name = await device.getName(sendImmediately);
    const deviceType = await device.getType(sendImmediately);
    if (device.isInsole) {
      if (addEventListeners) {
        device.addEventListener("mass", event => {
          if (this._hasCalibratedAtLeastOnce) {
            this._tickFlag = true;

            const side = name.includes("left") ? "left" : "right";
            const { mass } = event.message;
            anchorConfiguration.masses[side] = mass;
            const threshold = anchorConfiguration.thresholds[side];
            const previouslyExceededThreshold =
              anchorConfiguration.exceededThresholds[side];
            const exceededThreshold = (anchorConfiguration.exceededThresholds[
              side
            ] = mass >= threshold);
            anchorConfiguration.updatedThresholds[side] =
              exceededThreshold != previouslyExceededThreshold;

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
      }

      device.setPressureConfiguration({ mass: 60 }, false);
    }

    if (addEventListeners) {
      device.addEventListener("quaternion", event => {
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
    }
    device.setMotionConfiguration({ quaternion: 60 }, sendImmediately);

    if (addEventListeners) {
      device.addEventListener("available", async event => {
        this._handleDevice(device, true, false);
      });
    }
  },
  connect: function() {
    this.data.gateway.forEach(_gateway => {
      const gateway = `ws://192.168.5.${_gateway}/ws`;
      let missionMesh = this.missionMeshes[gateway]
      if (missionMesh) {
        missionMesh.connect();
      }
      else {
        missionMesh = this._createMissionMesh();
        missionMesh.connect(gateway);
        this.missionMeshes[gateway] = missionMesh;
      }
    });
  },
  updateEntityLengths: function() {
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
  updatePrimitiveLengths: function() {
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
  updatePrimitiveColors: function() {
    const { primitives } = this;

    primitives.hatCrown.setAttribute("color", this.data.hatColor);
    primitives.hatBrim.setAttribute("color", this.data.hatColor);
    primitives.head.setAttribute("color", this.data.skinColor);
    primitives.leftHand.setAttribute("color", this.data.skinColor);
    primitives.rightHand.setAttribute("color", this.data.skinColor);

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
  calibrate: function(delay) {
    setTimeout(() => this._calibrate(), delay);
  },
  _calibrate: function() {
    console.log("calibrating...");
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
      right: true
    });
    this.entities.leftAnchor.object3D.visible = false;
    this.entities.rightAnchor.object3D.visible = false;
  },
  tick: function() {
    if (this._tickFlag) {
      this._tick();
      delete this._tickFlag;
    }
  },
  _tick: function() {
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
          .multiply(this.el.object3D.quaternion)
          .multiply(modifiedQuaternion);
      }
    }

    for (const name in this.updatedQuaternion) {
      if (this.updatedQuaternion[name]) {
        const entity = entities[name];
        entity.object3D.updateMatrix();

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
          THREE.Math.lerp(0, 0.5, mass)
        );

        if (side in this.anchorConfiguration.updatedThresholds) {
          const exceededThreshold = this.anchorConfiguration.exceededThresholds[
            side
          ];
          if (!exceededThreshold) {
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
              easing: "easeOutExpo"
            });
            footStep.addEventListener("animationcomplete__fade", event => {
              footStep.remove();
            });
            this.el.appendChild(footStep);
          }
        }

        const exceededThreshold = mass >= anchorConfiguration.thresholds[side];
        anchorEntity.object3D.visible = exceededThreshold;
        if (exceededThreshold) {
          if (
            !anchorConfiguration.isAnchored ||
            anchorConfiguration.side != side ||
            anchorConfiguration.updatedAnchor
          ) {
            const rootPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(rootPosition);

            const footEntity = entities[`${side}Foot`];
            const footPosition = new THREE.Vector3();
            footEntity.object3D
              .getWorldPosition(footPosition)
              .sub(rootPosition);

            const obstacleHeight = 0.4318; // bench height
            const allowSteppingOnObstacle = true;
            if (allowSteppingOnObstacle) {
              footPosition.y =
                footPosition.y >= obstacleHeight / 2 ? obstacleHeight : 0;
            } else {
              footPosition.y = 0;
            }
            const anchorEntity = entities[`${side}Anchor`];
            anchorEntity.object3D.position.copy(footPosition);
            anchorEntity.object3D.updateMatrix();

            if (
              anchorConfiguration.isAnchored &&
              anchorConfiguration.side == side &&
              anchorConfiguration.updatedAnchor
            ) {
              anchorConfiguration.position.copy(footPosition);
              delete anchorConfiguration.updatedAnchor;
            }
          }
        }

        delete anchorConfiguration.updatedMass[side];
      }
    }

    if (anchorConfiguration.isAnchored) {
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
    }
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);
    if (diffKeys.some(key => key.includes("Color") || key.includes("Style"))) {
      this.updatePrimitiveColors();
    }
    if (
      diffKeys.some(
        key =>
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
  },
  updateEntityAutoUpdate() {
    const { entities } = this;
    for (const name in entities) {
      const entity = entities[name];
      entity.object3D.matrixAutoUpdate = this.data.manualArticulation;
    }
  },
  remove: function() {
    this.system.removeEntity(this);
  }
});
