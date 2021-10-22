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
    gateway: { type: "string", default: "ws://192.168.5.193/ws" },
    manualArticulation: { type: "boolean", default: false },

    hatColor: { type: "color", default: "#737373" },

    skinColor: { type: "color", default: "#fab452" },
    headRadius: { type: "number", default: 0.11 },
    neckLength: { type: "number", default: 0.1 },

    torsoHeight: { type: "number", default: 0.5 },
    torsoWidth: { type: "number", default: 0.35 },

    shirtColor: { type: "color", default: "#737373" },
    shirtType: { type: "string", default: "long" },
    shoulderRadius: { type: "number", default: 0.06 },
    bicepLength: { type: "number", default: 0.25 },
    bicepRadius: { type: "number", default: 0.05 },
    elbowRadius: { type: "number", default: 0.055 },
    forearmLength: { type: "number", default: 0.29 },
    forearmRadius: { type: "number", default: 0.05 },
    handLength: { type: "number", default: 0.216 },

    pantsColor: { type: "color", default: "#3e88c1" },
    pantsType: { type: "string", default: "long" },
    legSocketRadius: { type: "number", default: 0.06 },
    thighLength: { type: "number", default: 0.45 },
    thighRadius: { type: "number", default: 0.05 },
    kneeRadius: { type: "number", default: 0.055 },
    shinLength: { type: "number", default: 0.48 },
    shinRadius: { type: "number", default: 0.05 },

    footColor: { type: "color", default: "#1c1c1c" },
    footLength: { type: "number", default: 0.25 }
  },
  init: function() {
    window.rig = this;

    const entities = (this.entities = {});
    this.quaternionOffsets = {};
    this.quaternions = {};
    this.updatedQuaternion = {};
    const correctionQuaternions = (this.correctionQuaternions = {});
    {
      const _euler = new THREE.Euler();

      entities.lowerTorso = document.createElement("a-entity");
      entities.upperTorso = document.createElement("a-entity");
      _euler.set(Math.PI / 2, 0, 0);
      correctionQuaternions.upperTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.lowerTorso.appendChild(entities.upperTorso);
      correctionQuaternions.lowerTorso = new THREE.Quaternion().setFromEuler(
        _euler
      );

      entities.head = document.createElement("a-entity");
      entities.upperTorso.appendChild(entities.head);

      entities.leftBicep = document.createElement("a-entity");
      _euler.set(0, 0, Math.PI / 2);
      correctionQuaternions.leftBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.leftBicep.object3D.rotation.copy(_euler);
      entities.upperTorso.appendChild(entities.leftBicep);
      entities.leftForearm = document.createElement("a-entity");
      entities.leftBicep.appendChild(entities.leftForearm);
      entities.leftHand = document.createElement("a-entity");
      entities.leftForearm.appendChild(entities.leftHand);

      entities.rightBicep = document.createElement("a-entity");
      _euler.set(0, 0, -Math.PI/2);
      correctionQuaternions.rightBicep = new THREE.Quaternion().setFromEuler(
        _euler
      );
      entities.rightBicep.object3D.rotation.copy(_euler);
      entities.upperTorso.appendChild(entities.rightBicep);
      entities.rightForearm = document.createElement("a-entity");
      entities.rightBicep.appendChild(entities.rightForearm);
      entities.rightHand = document.createElement("a-entity");
      entities.rightForearm.appendChild(entities.rightHand);

      entities.leftThigh = document.createElement("a-entity");
      entities.lowerTorso.appendChild(entities.leftThigh);
      entities.leftShin = document.createElement("a-entity");
      entities.leftThigh.appendChild(entities.leftShin);
      entities.leftFoot = document.createElement("a-entity");
      entities.leftShin.appendChild(entities.leftFoot);

      entities.rightThigh = document.createElement("a-entity");
      entities.lowerTorso.appendChild(entities.rightThigh);
      entities.rightShin = document.createElement("a-entity");
      entities.rightThigh.appendChild(entities.rightShin);
      entities.rightFoot = document.createElement("a-entity");
      entities.rightShin.appendChild(entities.rightFoot);

      entities.leftAnchor = document.createElement("a-entity");
      entities.rightAnchor = document.createElement("a-entity");
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
      primitives.leftElbow = document.createElement("a-sphere");
      entities.leftForearm.appendChild(primitives.leftElbow);
      primitives.leftForearm = document.createElement("a-cylinder");
      primitives.leftHand = document.createElement("a-box");

      primitives.rightShoulder = document.createElement("a-sphere");
      entities.rightBicep.appendChild(primitives.rightShoulder);
      primitives.rightBicep = document.createElement("a-cylinder");
      primitives.rightElbow = document.createElement("a-sphere");
      entities.rightForearm.appendChild(primitives.rightElbow);
      primitives.rightForearm = document.createElement("a-cylinder");
      primitives.rightHand = document.createElement("a-box");

      primitives.leftLegSocket = document.createElement("a-sphere");
      entities.leftThigh.appendChild(primitives.leftLegSocket);
      primitives.leftThigh = document.createElement("a-cylinder");
      primitives.leftKnee = document.createElement("a-sphere");
      entities.leftShin.appendChild(primitives.leftKnee);
      primitives.leftShin = document.createElement("a-cylinder");
      primitives.leftFoot = document.createElement("a-box");

      primitives.rightLegSocket = document.createElement("a-sphere");
      entities.rightThigh.appendChild(primitives.rightLegSocket);
      primitives.rightThigh = document.createElement("a-cylinder");
      primitives.rightKnee = document.createElement("a-sphere");
      entities.rightShin.appendChild(primitives.rightKnee);
      primitives.rightShin = document.createElement("a-cylinder");
      primitives.rightFoot = document.createElement("a-box");

      primitives.leftAnchor = document.createElement("a-ring");
      primitives.leftAnchor.setAttribute("rotation", "-90 0 0");
      primitives.leftAnchor.setAttribute("radius-inner", 0);
      primitives.leftAnchor.setAttribute("radius-outer", 0.2);
      primitives.leftAnchor.setAttribute("color", "red");

      primitives.rightAnchor = document.createElement("a-ring");
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
    }

    this.el.appendChild(entities.lowerTorso);
    this.el.appendChild(entities.leftAnchor);
    this.el.appendChild(entities.rightAnchor);

    const missionMesh = (this.missionMesh = new MissionMesh());

    const anchorConfiguration = (this.anchorConfiguration = {
      masses: { left: 0, right: 0 },
      thresholds: { left: 0.1, right: 0.1 },
      updatedMass: {},
      updatedAnchor: false,
      isAnchored: false,
      side: "",
      position: new THREE.Vector3()
    });
    const handleDevice = async (device, sendImmediately) => {
      const name = await device.getName(sendImmediately);
      const deviceType = await device.getType(sendImmediately);
      if (device.isInsole) {
        device.setPressureConfiguration({ mass: 40 }, sendImmediately);
        device.addEventListener("mass", event => {
          const side = name.includes("left") ? "left" : "right";
          const { mass } = event.message;
          anchorConfiguration.masses[side] = mass;
          const threshold = anchorConfiguration.thresholds[side];

          if (anchorConfiguration.isAnchored) {
            if (side == anchorConfiguration.side) {
              if (mass < threshold) {
                anchorConfiguration.isAnchored = false;
                //anchorConfiguration.updatedAnchor = true;
              }
            }
          } else {
            if (mass >= threshold) {
              anchorConfiguration.isAnchored = true;
              anchorConfiguration.side = side;
              anchorConfiguration.updatedAnchor = true;
            }
          }

          anchorConfiguration.updatedMass[side] = true;
        });
      } else {
        device.setMotionConfiguration({ quaternion: 80 }, sendImmediately);
        device.addEventListener("quaternion", event => {
          const entity = entities[name];
          if (entity) {
            const { quaternion } = event.message;
            if (name in this.correctionQuaternions) {
              this.quaternions[name].multiplyQuaternions(quaternion, this.correctionQuaternions[name]);
            }
            else {
              this.quaternions[name].copy(quaternion);
            }
            this.updatedQuaternion[name] = true;
          }
        });
      }
    };

    missionMesh.addEventListener("numberofdevices", async event => {
      missionMesh.devices.forEach(async device => {
        await handleDevice(device, false);
      });
      missionMesh.send();

      missionMesh.addEventListener("deviceadded", async event => {
        const { device } = event.message;
        await handleDevice(device, true);
      });
    });

    this.el.addEventListener("connect", event => this.connect());
    this.el.addEventListener("calibrate", event => this.calibrate());

    this.system.addEntity(this);
  },
  connect: function() {
    this.missionMesh.connect(this.data.gateway);
  },
  updateEntityLengths: function() {
    const { entities } = this;

    entities.lowerTorso.object3D.position.y =
      this.data.thighLength + this.data.shinLength;
    entities.upperTorso.object3D.position.y = this.data.torsoHeight / 2;
    entities.head.object3D.position.y = this.data.torsoHeight / 2;

    entities.leftBicep.object3D.position.set(
      -this.data.torsoWidth / 2,
      this.data.torsoHeight / 2,
      0
    );
    entities.leftForearm.object3D.position.y = this.data.bicepLength;
    entities.leftHand.object3D.position.y = this.data.forearmLength;

    entities.rightBicep.object3D.position.set(
      this.data.torsoWidth / 2,
      this.data.torsoHeight / 2,
      0
    );
    entities.rightForearm.object3D.position.y = this.data.bicepLength;
    entities.rightHand.object3D.position.y = this.data.forearmLength;

    entities.leftThigh.object3D.position.x = this.data.torsoWidth / 2;
    entities.leftShin.object3D.position.y = -this.data.thighLength;
    entities.leftFoot.object3D.position.y = -this.data.shinLength;

    entities.rightThigh.object3D.position.x = -this.data.torsoWidth / 2;
    entities.rightShin.object3D.position.y = -this.data.thighLength;
    entities.rightFoot.object3D.position.y = -this.data.shinLength;

    entities.leftAnchor.object3D.position.x = -this.data.torsoWidth / 2;
    entities.rightAnchor.object3D.position.x = this.data.torsoWidth / 2;

    for (const name in entities) {
      const entity = entities[name];
      entity.object3D.updateMatrix();
    }
  },
  updatePrimitiveLengths: function() {
    const { primitives } = this;

    primitives.lowerTorso.setAttribute(
      "scale",
      `${this.data.torsoWidth} ${this.data.torsoHeight / 2} 0.1`
    );
    primitives.lowerTorso.setAttribute(
      "position",
      `0 ${this.data.torsoHeight / 4} 0`
    );
    primitives.upperTorso.setAttribute(
      "scale",
      `${this.data.torsoWidth} ${this.data.torsoHeight / 3} 0.1`
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
      `0 ${this.data.bicepLength / 2} 0`
    );
    primitives.leftElbow.setAttribute("radius", this.data.elbowRadius);
    primitives.leftForearm.setAttribute("height", this.data.forearmLength);
    primitives.leftForearm.setAttribute("radius", this.data.forearmRadius);
    primitives.leftForearm.setAttribute(
      "position",
      `0 ${this.data.forearmLength / 2} 0`
    );
    primitives.leftHand.setAttribute(
      "scale",
      `0.05 ${this.data.handLength} 0.1`
    );
    primitives.leftHand.setAttribute(
      "position",
      `0 ${this.data.handLength / 2} 0`
    );

    primitives.rightShoulder.setAttribute("radius", this.data.shoulderRadius);
    primitives.rightBicep.setAttribute("height", this.data.bicepLength);
    primitives.rightBicep.setAttribute("radius", this.data.bicepRadius);
    primitives.rightBicep.setAttribute(
      "position",
      `0 ${this.data.bicepLength / 2} 0`
    );
    primitives.rightElbow.setAttribute("radius", this.data.elbowRadius);
    primitives.rightForearm.setAttribute("height", this.data.forearmLength);
    primitives.rightForearm.setAttribute("radius", this.data.forearmRadius);
    primitives.rightForearm.setAttribute(
      "position",
      `0 ${this.data.forearmLength / 2} 0`
    );
    primitives.rightHand.setAttribute(
      "scale",
      `0.05 ${this.data.handLength} 0.1`
    );
    primitives.rightHand.setAttribute(
      "position",
      `0 ${this.data.handLength / 2} 0`
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
    primitives.leftShin.setAttribute("height", this.data.shinLength);
    primitives.leftShin.setAttribute("radius", this.data.shinRadius);
    primitives.leftFoot.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.1 ${this.data.footLength}`
    );
    primitives.leftFoot.setAttribute(
      "position",
      `0 0.05 -${this.data.footLength / 3}`
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
    primitives.rightShin.setAttribute("height", this.data.shinLength);
    primitives.rightShin.setAttribute("radius", this.data.shinRadius);
    primitives.rightFoot.setAttribute(
      "scale",
      `${0.05 + 2 * this.data.shinRadius} 0.1 ${this.data.footLength}`
    );
    primitives.rightFoot.setAttribute(
      "position",
      `0 0.05 -${this.data.footLength / 3}`
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

    switch (this.data.shirtType) {
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
        primitives.leftElbow.setAttribute("color", this.data.shirtColor);
        primitives.leftForearm.setAttribute("color", this.data.skinColor);
        primitives.rightShoulder.setAttribute("color", this.data.shirtColor);
        primitives.rightBicep.setAttribute("color", this.data.shirtColor);
        primitives.rightElbow.setAttribute("color", this.data.shirtColor);
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

    switch (this.data.pantsType) {
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

    primitives.leftFoot.setAttribute("color", this.data.footColor);
    primitives.rightFoot.setAttribute("color", this.data.footColor);
  },
  calibrate: function() {
    console.log("calibrating...");
    for (const name in this.entities) {
      const quaternionOffset = this.quaternionOffsets[name];
      if (quaternionOffset) {
        quaternionOffset.copy(this.quaternions[name]).invert();
      }
    }
  },
  tick: function() {
    const { entities } = this;
    for (const name in this.updatedQuaternion) {
      if (this.updatedQuaternion[name]) {
        const entity = entities[name];
        const quaternion = this.quaternions[name];
        const quaternionOffset = this.quaternionOffsets[name];

        entity.parentEl.object3D
          .getWorldQuaternion(entity.object3D.quaternion)
          .invert()
          .multiply(this.el.object3D.quaternion)
          .multiply(quaternionOffset)
          .multiply(quaternion)

        entity.object3D.updateMatrix();

        delete this.updatedQuaternion[name];
      }
    }

    const { anchorConfiguration, primitives } = this;
    for (const side in anchorConfiguration.updatedMass) {
      const mass = anchorConfiguration.masses[side];

      const anchorPrimitive = primitives[`${side}Anchor`];
      if (anchorPrimitive) {
        anchorPrimitive.setAttribute(
          "outer-radius",
          THREE.Math.lerp(0, 0.2, mass)
        );
      }

      delete anchorConfiguration.updatedMass[side];
    }

    if (anchorConfiguration.updated) {
      const { side } = anchorConfiguration;
      const entity = this.el.querySelector(`#${side}Foot`);
      anchorConfiguration.position.subVectors(
        entity.object3D.getWorldPosition(),
        this.el.object3D.getWorldPosition()
      );

      const rootEntity = entities.lowerTorso;
      const footEntity = entities[`${side}Foot`];
      if (footEntity) {
        const difference = new THREE.Vector3().subVectors(
          footEntity.object3D.position,
          anchorConfiguration.position
        );
        rootEntity.object3D.position.copy(difference);
      }

      delete anchorConfiguration.updated;
    }
  },
  update: function(oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);
    if (diffKeys.some(key => key.includes("Color"))) {
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
