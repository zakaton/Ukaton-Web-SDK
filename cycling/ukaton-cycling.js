/* global AFRAME, THREE, WebSocketMissionDevice, BluetoothMissionDevice */

AFRAME.registerSystem("ukaton-cycling", {
  schema: {
    rate: { type: "number", default: 80 },
    gateway: { type: "array", default: [] },
    autoConnect: { type: "boolean", default: false },
    useWheel: { type: "boolean", default: false },
    useMovement: { type: "boolean", default: false },
  },

  init: function () {
    window.cyclingSystem = this;

    this.webSocketMissionDevices = {};
    this.devices = [];
    this.namedDevices = {};

    this.el.addEventListener("cycling-connect", (event) => this.connect());
    this.el.addEventListener("cycling-addbluetoothdevice", (event) =>
      this._addBluetoothDevice()
    );

    if (this.data.autoConnect) {
      this.connect();
    }

    this.cameraPosition = this.sceneEl.querySelector("#cameraPosition");
    this.cameraRotation = this.sceneEl.querySelector("#cameraRotation");

    this.wheelAngle = 0;
    this.smartphoneWheelScalar = 0.005;
    window.addEventListener("deviceorientation", (event) => {
      const { beta } = event;
      this.wheelAngle = -(beta * this.smartphoneWheelScalar);
      this._updateWheel = true;
    });
    this.wheelScalar = 0.25;
    this.wheelThreshold = 0;

    this.cameraRotationWithoutPitch = new THREE.Euler();
    this.cameraYaw = 0;
    this.smoothedCameraYaw = 0;
    

    this.movementVector = new THREE.Vector3();
    this.movementZ = 0;

    this.masses = { left: 0, right: 0 };
    this.massThresholds = { left: 0.05, right: 0.05 };
    this.lastLinearAcceleration = {};
    this.lastLinearAccelerationTime = {};
    this.timeDifferenceScalar = 1 / 10;
    this.massScalar = 3;
    this.upVector = new THREE.Vector3(0, 0, 0);
    this.crossVectors = {
      left: new THREE.Vector3(),
      right: new THREE.Vector3(),
    };
    this.friction = 0.0005
    this.maxMovementZ = 0.6
    this.minMovementZ = -0.6
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
        this._updateMovement = true;
        const { mass } = event.message;
        this.masses[device.insoleSide] = mass;
      });
      device.addEventListener("linearAcceleration", (event) => {
        this._updateMovement = true;
        const { linearAcceleration } = event.message;
        linearAcceleration.x = 0;
        const now = Date.now();
        if (
          device.insoleSide in this.masses &&
          device.insoleSide in this.lastLinearAcceleration
        ) {
          const mass = this.masses[device.insoleSide];
          const otherMass =
            this.masses[device.isRightInsole ? "left" : "right"];
          const lastLinearAcceleration =
            this.lastLinearAcceleration[device.insoleSide];
          if (
            mass > otherMass &&
            mass > this.massThresholds[device.insoleSide]
          ) {
            const timeDifference =
              (now - this.lastLinearAccelerationTime[device.insoleSide]) *
              this.timeDifferenceScalar;
            const crossVector = this.crossVectors[device.insoleSide];
            crossVector.crossVectors(
              linearAcceleration,
              lastLinearAcceleration
            );
            //console.log("crossVector.x", crossVector.x.toFixed(2));
            //console.log("crossVector", crossVector);
            let movement = 0;
            movement += crossVector.x / 100;
            movement *= timeDifference;
            //console.log("mass", mass);
            //console.log('now', now)
            //console.log('timeDifference', timeDifference)
            //console.log("movement", movement);
            this.movementZ = THREE.MathUtils.clamp(this.movementZ + movement, this.minMovementZ, this.maxMovementZ)
          }
        }
        this.lastLinearAcceleration[device.insoleSide] = linearAcceleration;
        this.lastLinearAccelerationTime[device.insoleSide] = now;
      });

      sensorDataConfigurations.motion.linearAcceleration = this.data.rate;
      sensorDataConfigurations.pressure.mass = this.data.rate;
    }

    if (name === "wheel" && !AFRAME.utils.device.isMobile()) {
      device.defaultEulerOrder = "YZX";
      device.addEventListener("euler", (event) => {
        this._updateWheel = true;
        const { euler } = event.message;
        //console.log(euler)
        let turn = euler.z
        turn *= 0.25;
        if (Math.abs(turn) < this.wheelThreshold) {
          turn = 0;
        }
        turn *= -this.wheelScalar;
        this.wheelAngle = turn;
      });
      sensorDataConfigurations.motion.quaternion = this.data.rate;
    }

    await device.setSensorDataConfigurations(sensorDataConfigurations);
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
  tick: function (time, timeDelta) {
    if (this._updateWheel) {
      this.updateWheel(...arguments);
      delete this._updateWheel;
    }
    if (this._updateMovement) {
      this.updateMovement(...arguments);
      delete this._updateMovement;
    }
    
    if (this.movementZ !== 0) {
      const sign = Math.sign(this.movementZ)
      const counterMovementZ = this.friction * timeDelta * -sign
      this.movementZ += counterMovementZ
      if (Math.sign(this.movementZ) != sign) {
        this.movementZ = 0;
      }
    }
  },
  updateWheel: function () {
    if (!this.data.useWheel) {
      return;
    }

    this.cameraYaw += this.wheelAngle;
    this.smoothedCameraYaw = THREE.MathUtils.lerp(this.cameraRotation.object3D.rotation.y, this.cameraYaw, 0.5)
    
    this.cameraRotation.object3D.rotation.y = this.smoothedCameraYaw
    this.cameraRotationWithoutPitch.copy(this.cameraRotation.object3D.rotation);
    this.cameraRotationWithoutPitch.x = 0;
  },
  updateMovement: function () {
    if (!this.data.useMovement) {
      return;
    }
    
    console.log("SPEED", this.movementZ)

    this.movementVector.set(0, 0, -this.movementZ);
    this.movementVector.applyEuler(this.cameraRotationWithoutPitch);
    this.cameraPosition.object3D.position.add(this.movementVector);
  },
  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("key")) {
      // do something
    }
  },
});
