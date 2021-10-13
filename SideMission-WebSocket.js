/* global THREE */

class SideMission {
  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  concatenateArrayBuffers(...arrayBuffers) {
    const length = arrayBuffers.reduce(
      (length, arrayBuffer) => length + arrayBuffer.byteLength,
      0
    );
    const uint8Array = new Uint8Array(length);

    let offset = 0;
    arrayBuffers.forEach(arrayBuffer => {
      uint8Array.set(new Uint8Array(arrayBuffer), offset);
      offset += arrayBuffer.byteLength;
    });
    return uint8Array.buffer;
  }

  constructor() {
    this.isLoggingEnabled = true;

    this.batteryLevel = 100;

    this.calibration = {
      system: 0,
      gyroscope: 0,
      accelerometer: 0,
      magnetometer: 0
    };

    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();

    this.acceleration = new THREE.Vector3();
    this.gravity = new THREE.Quaternion();
    this.linearAcceleration = new THREE.Vector3();
    this.rotationRate = new THREE.Euler();
    this.magnetometer = new THREE.Quaternion();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();

    window.addEventListener("beforeunload", async event => {
      await this.disableAllSensors();
    });
  }

  async connect(gateway = "ws://192.168.5.193/ws") {
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

    this.log("getting device");

    this.webSocket = new WebSocket(gateway);
    this.webSocket.addEventListener("open", this.onWebSocketOpen.bind(this));
    this.webSocket.addEventListener("close", this.onWebSocketClose.bind(this));
    this.webSocket.addEventListener(
      "message",
      this.onWebSocketMessage.bind(this)
    );

    return new Promise(resolve => {
      this.addEventListener(
        "connected",
        event => {
          resolve();
        },
        { once: true }
      );
    });
  }

  get isConnected() {
    return this.webSocket && this.webSocket.readyState == this.webSocket.OPEN;
  }

  async onWebSocketOpen(event) {
    this.log("websocket opened");
    this.dispatchEvent({ type: "connected", message: { event } });
  }
  async onWebSocketClose(event) {
    this.log("websocket closed");
    this.dispatchEvent({ type: "disconnected", message: { event } });
  }
  async onWebSocketMessage(event) {
    //this.log("message received", event);
    this.dispatchEvent({ type: "message", message: { event } });

    const arrayBuffer = await event.data.arrayBuffer();
    let dataView = new DataView(arrayBuffer);

    const messageType = dataView.getUint8(0);
    dataView = new DataView(arrayBuffer.slice(1));
    switch (messageType) {
      case this.webSocketMessageTypes.GET_NAME_RESPONSE:
      case this.webSocketMessageTypes.SET_NAME_RESPONSE:
        this.name = this.textDecoder.decode(dataView.buffer);
        this.log(`got name "${this.name}"`);
        this.dispatchEvent({ type: "name", message: { name: this.name } });
        break;
      case this.webSocketMessageTypes.GET_IMU_CONFIGURATION_RESPONSE:
      case this.webSocketMessageTypes.SET_IMU_CONFIGURATION_RESPONSE:
        this.imuConfiguration = dataView;
        this.dispatchEvent({
          type: "imuConfiguration",
          message: { imuConfiguration: this.imuConfiguration }
        });
        break;
      case this.webSocketMessageTypes.GET_IMU_CALLIBRATION_DATA_RESPONSE:
        this.onImuCalibration(dataView);
        break;
      case this.webSocketMessageTypes.IMU_DATA:
        this.onImuData(dataView);
        break;
      case this.webSocketMessageTypes.GET_BATTERY_LEVEL_RESPONSE:
        this.batteryLevel = dataView.getUint8(0);
        this.log(`Got battery level ${this.batteryLevel}`);
        this.dispatchEvent({
          type: "batteryLevel",
          message: { batteryLevel: this.batteryLevel }
        });
        break;
      default:
        this.log(`unknown message type ${messageType}`);
        break;
    }
  }
  send(data) {
    if (this.isConnected) {
      this.webSocket.send(data);
    }
  }

  async getBatteryLevel() {
    if (!this.isConnected) {
      return;
    }

    const promise = new Promise(resolve => {
      this.addEventListener(
        "batteryLevel",
        event => {
          const { batteryLevel } = event.message;
          resolve(batteryLevel);
        },
        { once: true }
      );
    });
    this.send(
      Uint8Array.from([this.webSocketMessageTypes.GET_BATTERY_LEVEL_REQUEST])
    );
    return promise;
  }

  async getName() {
    if (!this.isConnected) {
      return;
    }

    const promise = new Promise(resolve => {
      this.addEventListener(
        "name",
        event => {
          const { name } = event.message;
          resolve(name);
        },
        { once: true }
      );
    });
    this.send(Uint8Array.from([this.webSocketMessageTypes.GET_NAME_REQUEST]));
    return promise;
  }
  setName(name) {
    if (!this.isConnected) {
      return;
    }
    if (name.length < 0 || name.length >= 30) {
      return;
    }
    this.send(
      this.concatenateArrayBuffers(
        Uint8Array.from([this.webSocketMessageTypes.SET_NAME_REQUEST]),
        this.textEncoder.encode(name)
      )
    );
  }

  async getImuCalibration() {
    if (!this.isConnected) {
      return;
    }

    const promise = new Promise(resolve => {
      this.addEventListener(
        "imuCalibration",
        event => {
          const { imuCalibration } = event.message;
          resolve(imuCalibration);
        },
        { once: true }
      );
    });
    this.send(
      Uint8Array.from([
        this.webSocketMessageTypes.GET_IMU_CALLIBRATION_DATA_REQUEST
      ])
    );
    return promise;
  }
  get isImuFullyCalibrated() {
    const { gyroscope, accelerometer, magnetometer, system } = this.calibration;
    return (
      gyroscope == 3 && accelerometer == 3 && magnetometer == 3 && system == 3
    );
  }
  onImuCalibration(dataView) {
    this.imuCalibrationTypes.forEach((calibrationType, index) => {
      this.calibration[calibrationType] = dataView.getUint8(index);
    });

    this.log("Got Imu Calibration data", this.calibration);

    this.dispatchEvent({
      type: "calibration",
      message: { calibration: this.calibration }
    });

    if (this.isImuFullyCalibrated) {
      this.dispatchEvent({
        type: "imuFullyCalibrated"
      });
    }
  }

  async getImuConfiguration() {
    if (!this.isConnected) {
      return;
    }

    const promise = new Promise(resolve => {
      this.addEventListener(
        "imuConfiguration",
        event => {
          const { imuConfiguration } = event.message;
          resolve(imuConfiguration);
        },
        { once: true }
      );
    });
    this.send(
      Uint8Array.from([
        this.webSocketMessageTypes.GET_IMU_CONFIGURATION_REQUEST
      ])
    );
    return promise;
  }

  async configureImu(imuConfiguration = {}) {
    if (!this.isConnected) {
      return;
    }

    const dataView = await this.getImuConfiguration();
    this.imuDataTypes.forEach((dataType, index) => {
      if (dataType in imuConfiguration) {
        let rate = imuConfiguration[dataType];
        if (Number.isInteger(rate) && rate >= 0) {
          rate -= rate % 20;
          dataView.setUint16(index * 2, rate, true);
        }
      }
    });

    const promise = new Promise(resolve => {
      this.addEventListener(
        "imuConfiguration",
        event => {
          const { imuConfiguration } = event.message;
          resolve(imuConfiguration);
        },
        { once: true }
      );
    });

    this.send(
      this.concatenateArrayBuffers(
        Uint8Array.from([
          this.webSocketMessageTypes.SET_IMU_CONFIGURATION_REQUEST
        ]),
        dataView.buffer
      )
    );

    return promise;
  }

  disableAllSensors() {
    return this.configureImu({
      acceleration: 0,
      gravity: 0,
      linearAcceleration: 0,
      rotationRate: 0,
      magnetometer: 0,
      quaternion: 0
    });
  }

  onImuData(dataView) {
    const dataBitmask = dataView.getUint8(0);
    const timestamp = dataView.getUint32(1, true);

    const dataTypes = [];
    for (const dataType in this.imuDataBitFlags) {
      if (dataBitmask & this.imuDataBitFlags[dataType]) {
        dataTypes.push(dataType);
      }
    }

    if (dataTypes.length) {
      let byteOffset = 5;
      let byteSize = 0;

      dataTypes.forEach(dataType => {
        let vector, quaternion, euler;
        const scalar = this.imuDataScalars[dataType];
        switch (dataType) {
          case "acceleration":
          case "gravity":
          case "linearAcceleration":
          case "magnetometer":
            vector = this.parseImuVector(dataView, byteOffset, scalar);
            byteSize = 6;

            this[dataType].copy(vector);
            break;
          case "rotationRate":
            euler = this.parseImuEuler(dataView, byteOffset, scalar);
            this[dataType].copy(euler);

            byteSize = 6;
            break;
          case "quaternion":
            quaternion = this.parseImuQuaternion(dataView, byteOffset, scalar);
            this[dataType].copy(quaternion);

            byteSize = 8;

            euler = new THREE.Euler().setFromQuaternion(quaternion);
            euler.reorder("YXZ");
            this.euler.copy(euler);
            this.dispatchEvent({
              type: "euler",
              message: { timestamp, euler }
            });
            break;
        }

        const rawData = this.getRawImuData(
          dataView,
          byteOffset,
          byteOffset + byteSize
        );
        this.dispatchEvent({
          type: dataType,
          message: {
            timestamp,
            [dataType]: dataType == "quaternion" ? quaternion : vector || euler,
            rawData
          }
        });
        byteOffset += byteSize;
      });
    }
  }

  getRawImuData(dataView, offset, size) {
    return Array.from(new Int16Array(dataView.buffer.slice(offset, size)));
  }

  parseImuVector(dataView, offset, scalar = 1) {
    const vector = new THREE.Vector3();
    const x = dataView.getInt16(offset, true);
    const y = dataView.getInt16(offset + 2, true);
    const z = dataView.getInt16(offset + 4, true);
    vector.set(x, -z, -y).multiplyScalar(scalar);
    return vector;
  }
  parseImuEuler(dataView, offset, scalar = 1) {
    const euler = new THREE.Euler();
    const x = THREE.Math.degToRad(dataView.getInt16(offset, true) * scalar);
    const y = THREE.Math.degToRad(dataView.getInt16(offset + 2, true) * scalar);
    const z = THREE.Math.degToRad(dataView.getInt16(offset + 4, true) * scalar);
    euler.set(-x, z, y, "YXZ");
    return euler;
  }
  parseImuQuaternion(dataView, offset, scalar = 1) {
    const quaternion = new THREE.Quaternion();
    const w = dataView.getInt16(offset, true) * scalar;
    const x = dataView.getInt16(offset + 2, true) * scalar;
    const y = dataView.getInt16(offset + 4, true) * scalar;
    const z = dataView.getInt16(offset + 6, true) * scalar;
    quaternion.set(-y, -w, -x, z);
    return quaternion;
  }

  get imuCalibrationTypes() {
    return this.constructor.imuCalibrationTypes;
  }

  get imuDataBitFlags() {
    return this.constructor.imuDataBitFlags;
  }

  get imuDataScalars() {
    return this.constructor.imuDataScalars;
  }

  get imuDataTypes() {
    return this.constructor.imuDataTypes;
  }

  get imuDataRanges() {
    return this.constructor.imuDataRanges;
  }

  get dataTypes() {
    return this.constructor.dataTypes;
  }

  get webSocketMessageTypes() {
    return this.constructor.webSocketMessageTypes;
  }
}

Object.assign(SideMission, {
  imuCalibrationTypes: ["system", "gyroscope", "accelerometer", "magnetometer"],
  imuDataBitFlags: {
    acceleration: 1 << 0,
    gravity: 1 << 1,
    linearAcceleration: 1 << 2,
    rotationRate: 1 << 3,
    magnetometer: 1 << 4,
    quaternion: 1 << 5
  },
  imuDataScalars: {
    acceleration: 1 / 100,
    gravity: 1 / 100,
    linearAcceleration: 1 / 100,
    rotationRate: 1 / 16,
    magnetometer: 1 / 16,
    quaternion: 1 / (1 << 14)
  },
  imuDataRanges: {
    acceleration: 4000 + 1000,
    get gravity() {
      return this.acceleration;
    },
    get linearAcceleration() {
      return this.acceleration;
    },
    rotationRate: 32000 + 1000,
    magnetometer: 6400 + 960,
    quaternion: 1
  },
  imuDataTypes: [
    "acceleration",
    "gravity",
    "linearAcceleration",
    "rotationRate",
    "magnetometer",
    "quaternion"
  ],
  get dataTypes() {
    return this.imuDataTypes;
  },

  webSocketMessageTypes: {
    GET_NAME_REQUEST: 0,
    GET_NAME_RESPONSE: 1,

    SET_NAME_REQUEST: 2,
    SET_NAME_RESPONSE: 3,

    GET_IMU_CONFIGURATION_REQUEST: 4,
    GET_IMU_CONFIGURATION_RESPONSE: 5,

    SET_IMU_CONFIGURATION_REQUEST: 6,
    SET_IMU_CONFIGURATION_RESPONSE: 7,

    IMU_DATA: 8,

    GET_IMU_CALLIBRATION_DATA_REQUEST: 9,
    GET_IMU_CALLIBRATION_DATA_RESPONSE: 10,

    GET_BATTERY_LEVEL_REQUEST: 11,
    GET_BATTERY_LEVEL_RESPONSE: 12
  }
});

const eventDispatcherAddEventListener =
  THREE.EventDispatcher.prototype.addEventListener;
THREE.EventDispatcher.prototype.addEventListener = function(
  type,
  listener,
  options
) {
  if (options) {
    if (options.once) {
      function onceCallback(event) {
        listener.apply(this, arguments);
        this.removeEventListener(type, onceCallback);
      }
      eventDispatcherAddEventListener.call(this, type, onceCallback);
    }
  } else {
    eventDispatcherAddEventListener.apply(this, arguments);
  }
};

Object.assign(SideMission.prototype, THREE.EventDispatcher.prototype);
