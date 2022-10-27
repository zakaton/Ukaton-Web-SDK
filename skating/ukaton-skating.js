/* global AFRAME, THREE, WebSocketMissionDevice, BluetoothMissionDevice, BluetoothMissions, WebSocketMissions */

THREE.MathUtils.inverseLerp = function (x, y, value) {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
};

AFRAME.registerSystem("ukaton-skating", {
  schema: {
    rate: { type: "number", default: 60 },
    gateway: { type: "array", default: [] },
    autoConnect: { type: "boolean", default: false },
    useMovement: { type: "boolean", default: false },
    useTurn: { type: "boolean", default: false },
    audioThrottle: { type: "number", default: 100 },
  },

  init: function () {
    window.skatingSystem = this;

    this.webSocketMissionDevices = {};
    this.devices = [];
    this.namedDevices = {};

    this.bluetoothMissions = new BluetoothMissions();
    this.websocketMissions = new WebSocketMissions();

    this.bluetoothMissions.addEventListener("pressure", (event) =>
      this.onPressure(event, this.bluetoothMissions)
    );
    this.websocketMissions.addEventListener("pressure", (event) =>
      this.onPressure(event, this.websocketMissions)
    );

    this.el.addEventListener("skating-connect", (event) => this.connect());
    this.el.addEventListener("skating-addbluetoothdevice", (event) =>
      this._addBluetoothDevice()
    );

    if (this.data.autoConnect) {
      this.connect();
    }

    this.camera = this.sceneEl.querySelector("a-camera");
    this.cameraPosition = this.sceneEl.querySelector("#cameraPosition");
    this.cameraRotation = this.sceneEl.querySelector("#cameraRotation");
    this.cameraJump = this.sceneEl.querySelector("#cameraJump");

    this.cameraRotationWithoutPitch = new THREE.Euler();
    this.cameraYaw = 0;
    this.smoothedCameraYaw = 0;

    this.isInsoleOnGround = {
      left: true,
      right: true,
      both() {
        return this.left && this.right;
      },
      neither() {
        return !this.left && !this.right;
      },
    };
    this.massThreshold = { left: 0.03, right: 0.03 };
    this.motionThreshold = { left: 10, right: 10 };
    this.centerOfMass = {
      x: { min: 1, max: 0 },
      y: { min: 1, max: 0 },
      reset() {
        this.x.min = this.y.min = 1;
        this.x.max = this.y.max = 0;
      },
      _updateRange({ x, y }) {
        this.x.min = Math.min(x, this.x.min);
        this.x.max = Math.max(x, this.x.max);

        this.y.min = Math.min(y, this.y.min);
        this.y.max = Math.max(y, this.y.max);
      },
      value: { x: 0, y: 0 },
      update({ x, y }) {
        this._updateRange({ x, y });
        this.value = {
          x: THREE.MathUtils.inverseLerp(this.x.min, this.x.max, x),
          y: THREE.MathUtils.inverseLerp(this.y.min, this.y.max, y),
        };
      },
    };

    this.speed = 0;
    this.speedScalar = 0.0001;
    this.linearAccelerationScalar = 1;
    this.velocity = new THREE.Vector3();
    this.airFriction = 0.01;
    this.groundFriction = 0.01;
    this.leanBackFriction = 0.05;
    this.cameraFriction = 0;
    this.minMovement = -0.6;
    this.maxMovement = 0.6;

    this.turnAngleScalar = 0.035;

    this.assetsEl = this.el.querySelector("a-assets");
    if (!this.assetsEl) {
      this.assetsEl = document.createElement("a-assets");
      this.el.appendChild(this.assetsEl);
    }

    this.audioSources = {
      jump: {
        src: "https://cdn.glitch.global/6c283599-191e-4c4a-b236-e1e1f0d90e7a/SkateJump2.mp3?v=1660048190298",
        defaultVolume: 0.7
      },
      land: {
        src: "https://cdn.glitch.global/6c283599-191e-4c4a-b236-e1e1f0d90e7a/LandGround.mp3?v=1660048234440",
        defaultVolume: 0.7
      },
      skating: {
        loop: true,
        autoplay: true,
        src: "https://cdn.glitch.global/6c283599-191e-4c4a-b236-e1e1f0d90e7a/Skating.mp3?v=1660048238092",
        defaultVolume: 0
      },
    };
    for (let audioName in this.audioSources) {
      const audioObject = this.audioSources[audioName];
      const element = document.createElement("audio");
      element.volume = 1;
      if (audioObject.defaultVolume) {
        element.volume = audioObject.defaultVolume
      }
      element.id = `${audioName}-audio`;
      element.setAttribute("src", audioObject.src);
      element.crossOrigin = "anonymous";
      this.assetsEl.appendChild(element);
      audioObject.element = element;

      const { loop, autoplay } = audioObject;
      if (loop) {
        element.setAttribute("loop", "");
      }
      if (autoplay) {
        element.setAttribute("autoplay", "");
        //element.play();
        document.addEventListener("click", () => element.play(), {
          once: true,
        });
      }

      /*
      const entity = document.createElement("a-sound");
      entity.setAttribute("src", `#${element.id}`);
      const { loop, autoplay } = audioObject;
      if (loop) {
        entity.setAttribute("loop", true);
      }
      if (autoplay) {
        entity.setAttribute("autoplay", true);
      }
      this.cameraPosition.appendChild(entity);
      audioObject.entity = entity;
      */
    }

    this.audioContext = THREE.AudioContext.getContext();
    const resumeAudioConextOnClick = () => {
      if (this.audioContext.state !== "running") {
        document.addEventListener("click", () => this.audioContext.resume(), {
          once: true,
        });
      }
    };
    this.audioContext.addEventListener("statechange", () => {
      resumeAudioConextOnClick();
    });
    resumeAudioConextOnClick();

    this.skateAudioScalar = 0.008;
    this.lastSpeedBeforeAudioTick = null;
    this.throttledAudioTick = AFRAME.utils.throttle(() => {
      if (this.speed !== this.lastSpeedBeforeAudioTick) {
        const newGain = this.speed * this.skateAudioScalar;
        this.audioSources.skating.element.volume = THREE.Math.clamp(
          newGain,
          0,
          1
        );
        /*
        const sound =
          this.audioSources.skating.entity.components.sound.pool.children[0];
        sound.setVolume(newGain);
        */
        this.lastSpeedBeforeAudioTick = this.speed;
      }
    }, this.data.audioThrottle);
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
      this.bluetoothMissions.replaceInsole(device);
      this.websocketMissions.replaceInsole(device);

      device.addEventListener("linearAcceleration", (event) => {
        const { linearAcceleration } = event.message;
        if (device.insoleSide === "right") {
          //console.log(linearAcceleration.z, this.isInsoleOnGround[device.insoleSide])
        }
        if (
          !this._isInAir &&
          //this.isInsoleOnGround[device.insoleSide] &&
          Math.sign(linearAcceleration.z) < 0 &&
          Math.abs(linearAcceleration.z) >
            this.motionThreshold[device.insoleSide]
        ) {
          this.speed += -linearAcceleration.z * this.linearAccelerationScalar;
        }
      });

      sensorDataConfigurations.motion.linearAcceleration = this.data.rate;
      sensorDataConfigurations.pressure.pressureSingleByte = this.data.rate;
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
  onPressure: function (event, missions) {
    const { side, pressure } = event.message;
    this.isInsoleOnGround[side] =
      missions[side].pressure.mass > this.massThreshold[side];

    if (!this._isInAir && this.isInsoleOnGround.both()) {
      const { centerOfMass } = pressure;
      this.centerOfMass.update(centerOfMass);
      if (side == "right") {
        const normalizedHorizontal = (this.centerOfMass.value.y - 0.5) * 2;
        this.cameraYaw += normalizedHorizontal * this.turnAngleScalar;
      }
    }

    if (this.isInsoleOnGround.neither()) {
      this.requestJump();
    }
  },
  requestJump: function () {
    if (!this._isInAir) {
      this._shouldJump = true;
    }
  },
  tick: function (time, timeDelta) {
    this.updateMovement(...arguments);
    this.updateTurn(...arguments);

    if (this._shouldJump) {
      if (!this._isInAir) {
        this._jumpStartTime = time;
        this._jumpEndTime = time + 2 * 300;
        this._isInAir = true;
        this.cameraJump.emit("jump");
        //this.audioSources.jump.entity.components.sound.playSound();
        this.audioSources.jump.element.play();
      }
      this._shouldJump = false;
    }

    if (this._isInAir) {
      const hasLanded = time >= this._jumpEndTime;
      if (hasLanded) {
        this._isInAir = false;
        //this.audioSources.land.entity.components.sound.playSound();
        this.audioSources.land.element.play();
      }
    }

    if (this.speed != 0) {
      const sign = Math.sign(this.speed);
      const oppositeSign = -sign;
      if (this._isInAir) {
        this.speed += oppositeSign * this.airFriction * timeDelta;
      } else {
        this.speed += oppositeSign * this.groundFriction * timeDelta;
      }

      if (!this._isInAir) {
        if (this.isInsoleOnGround.both()) {
          this.speed +=
            oppositeSign *
            this.centerOfMass.value.x *
            this.leanBackFriction *
            timeDelta;
        }
        this.speed +=
          oppositeSign *
          this.camera.object3D.position.y *
          this.cameraFriction *
          timeDelta;
      }

      if (sign != Math.sign(this.speed)) {
        this.speed = 0;
      }
    }

    this.throttledAudioTick();
  },
  updateTurn: function () {
    if (!this.data.useTurn) {
      return;
    }

    this.smoothedCameraYaw = THREE.MathUtils.lerp(
      this.cameraRotation.object3D.rotation.y,
      this.cameraYaw,
      0.2
    );

    this.cameraRotation.object3D.rotation.y = this.smoothedCameraYaw;
    this.cameraRotationWithoutPitch.copy(this.cameraRotation.object3D.rotation);
    this.cameraRotationWithoutPitch.x = 0;
  },
  updateMovement: function (time, timeDelta) {
    if (!this.data.useMovement) {
      return;
    }

    this.velocity.set(0, 0, -this.speed * timeDelta * this.speedScalar);
    this.velocity.applyEuler(this.cameraRotationWithoutPitch);
    this.cameraPosition.object3D.position.add(this.velocity);
  },
  update: function (oldData) {
    const diff = AFRAME.utils.diff(oldData, this.data);

    const diffKeys = Object.keys(diff);

    if (diffKeys.includes("key")) {
      // do something
    }
  },
});
