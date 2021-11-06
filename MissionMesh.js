/* global THREE */

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

class BaseMission {
  constructor() {
    this.isLoggingEnabled = !true;
    this._messageMap = new Map();
    this._messagePromiseMap = new Map();
  }

  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  get textEncoder() {
    return this.constructor.textEncoder;
  }
  get textDecoder() {
    return this.constructor.textDecoder;
  }

  _concatenateArrayBuffers(...arrayBuffers) {
    arrayBuffers = arrayBuffers.filter(
      arrayBuffer => arrayBuffer && "byteLength" in arrayBuffer
    );
    //this.log("concatenating array buffers", arrayBuffers);
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

  _flattenMessageData() {
    const arrayBuffers = [];
    this._messageMap.forEach((datum, key) => {
      arrayBuffers.push(Uint8Array.from([key]));
      const flattenedDatum = this._flattenMessageDatum(datum);
      arrayBuffers.push(flattenedDatum);
    });
    const flattenedData = this._concatenateArrayBuffers(...arrayBuffers);
    this._messageMap.clear();
    return flattenedData;
  }
  _flattenMessageDatum(datum) {
    switch (typeof datum) {
      case "object":
        switch (datum.constructor.name) {
          case "Uint8Array":
          case "Uint16Array":
            return datum.buffer;
            break;
          case "ArrayBuffer":
            return datum;
            break;
          case "Array":
            datum = datum.map(datum => this._flattenMessageDatum(datum));
            return this._concatenateArrayBuffers(...datum);
            break;
          case "Object":
            this.log("uncaught datum object", datum);
            break;
        }
        break;
      case "string":
        return this._concatenateArrayBuffers(
          Uint8Array.from([datum.length]),
          this.textEncoder.encode(datum)
        );
        break;
      case "number":
      case "boolean":
        return Uint8Array.from([datum]);
        break;
      case "function":
        return this._flattenMessageDatum(datum());
      case "undefined":
        return Uint8Array.from([]);
        break;
      default:
        this.log(`uncaught datum of type ${typeof datum}`, datum);
        break;
    }
  }

  get MessageTypes() {
    return this.constructor.MessageTypes;
  }
  get MessageTypeStrings() {
    return this.constructor.MessageTypeStrings;
  }

  get ErrorMessageTypes() {
    return this.constructor.ErrorMessageTypes;
  }
  get ErrorMessageTypeStrings() {
    return this.constructor.ErrorMessageTypeStrings;
  }

  get Types() {
    return this.constructor.Types;
  }
  get TypeStrings() {
    return this.constructor.TypeStrings;
  }

  get MotionCalibrationTypes() {
    return this.constructor.MotionCalibrationTypes;
  }
  get MotionCalibrationTypeStrings() {
    return this.constructor.MotionCalibrationTypeStrings;
  }

  get MotionDataTypes() {
    return this.constructor.MotionDataTypes;
  }
  get MotionDataTypeStrings() {
    return this.constructor.MotionDataTypeStrings;
  }

  get MotionDataScalars() {
    return this.constructor.MotionDataScalars;
  }

  get PressureDataTypes() {
    return this.constructor.PressureDataTypes;
  }
  get PressureDataTypeStrings() {
    return this.constructor.PressureDataTypeStrings;
  }

  get PressureDataScalars() {
    return this.constructor.PressureDataScalars;
  }

  get PressurePositions() {
    return this.constructor.PressurePositions;
  }
  getPressurePosition(index, isRight = false) {
    let { x, y } = this.PressurePositions[index];
    if (isRight) {
      x = 1 - x;
    }
    return { x, y };
  }

  get InsoleCorrectionQuaternions() {
    return this.constructor.InsoleCorrectionQuaternions;
  }
  get insoleCorrectionQuaternion() {
    return this.InsoleCorrectionQuaternions[
      this.isRightInsole ? "right" : "left"
    ];
  }
}
Object.assign(BaseMission, {
  textEncoder: new TextEncoder(),
  textDecoder: new TextDecoder(),

  MessageTypeStrings: [
    "TIMESTAMP",

    "GET_NUMBER_OF_DEVICES",
    "AVAILABILITY",

    "DEVICE_ADDED",
    "DEVICE_REMOVED",

    "BATTERY_LEVEL",

    "GET_NAME",
    "SET_NAME",

    "GET_TYPE",

    "MOTION_CALIBRATION",

    "GET_MOTION_CONFIGURATION",
    "SET_MOTION_CONFIGURATION",

    "GET_PRESSURE_CONFIGURATION",
    "SET_PRESSURE_CONFIGURATION",

    "MOTION_DATA",
    "PRESSURE_DATA"
  ],

  ErrorMessageTypeStrings: ["NO_ERROR", "DEVICE_NOT_FOUND", "FAILED_TO_SEND"],

  TypeStrings: ["MOTION_MODULE", "LEFT_INSOLE", "RIGHT_INSOLE"],

  MotionCalibrationTypeStrings: [
    "system",
    "gyroscope",
    "accelerometer",
    "magnetometer"
  ],

  MotionDataTypeStrings: [
    "acceleration",
    "gravity",
    "linearAcceleration",
    "rotationRate",
    "magnetometer",
    "quaternion"
  ],

  MotionDataScalars: {
    acceleration: 1 / 100,
    gravity: 1 / 100,
    linearAcceleration: 1 / 100,
    rotationRate: 1 / 16,
    magnetometer: 1 / 16,
    quaternion: 1 / (1 << 14)
  },

  PressureDataTypeStrings: [
    "pressureSingleByte",
    "pressureDoubleByte",
    "centerOfMass",
    "mass",
    "heelToToe"
  ],

  PressureDataScalars: {
    pressureSingleByte: 2 ** 8,
    pressureDoubleByte: 2 ** 12,
    mass: 2 ** 16
  },

  PressurePositions: [
    [59.55, 32.3],
    [33.1, 42.15],

    [69.5, 55.5],
    [44.11, 64.8],
    [20.3, 71.9],

    [63.8, 81.1],
    [41.44, 90.8],
    [19.2, 102.8],

    [48.3, 119.7],
    [17.8, 130.5],

    [43.3, 177.7],
    [18.0, 177.0],

    [43.3, 200.6],
    [18.0, 200.0],

    [43.5, 242.0],
    [18.55, 242.1]

    /*
    Right Insole
       0 1
      2 3 4
       5 6 7
        8 9
    
        10 11
        12 13
    
        1$ 15
    */

    /*
    Left Insole
       1 0
      4 3 2
     7 6 5
     9 8
    
    11 10
    13 12
    
    15 14
    */
  ].map(([x, y]) => {
    x /= 93.257; // width (mm)
    y /= 265.069; // height (mm)
    return { x, y };
  }),

  InsoleCorrectionQuaternions: {
    left: new THREE.Quaternion(),
    right: new THREE.Quaternion()
  }
});

[
  "MessageType",
  "ErrorMessageType",
  "Type",
  "MotionCalibrationType",
  "MotionDataType",
  "PressureDataType"
].forEach(name => {
  BaseMission[name + "s"] = BaseMission[name + "Strings"].reduce(
    (object, name, index) => {
      object[name] = index;
      return object;
    },
    {}
  );
});
Object.assign(BaseMission.prototype, THREE.EventDispatcher.prototype);

{
  const insoleCorrectionEuler = new THREE.Euler();
  insoleCorrectionEuler.set(0, Math.PI / 2, -Math.PI / 2);
  BaseMission.InsoleCorrectionQuaternions.right.setFromEuler(
    insoleCorrectionEuler
  );

  insoleCorrectionEuler.set(-Math.PI / 2, -Math.PI / 2, 0);
  BaseMission.InsoleCorrectionQuaternions.left.setFromEuler(
    insoleCorrectionEuler
  );

  window.updateCorrectionEuler = (x, y, z, order) => {
    insoleCorrectionEuler.set(x, y, z, order);
    BaseMission.InsoleCorrectionQuaternions.right.setFromEuler(
      insoleCorrectionEuler
    );
  };
}

class MissionMeshDevice extends BaseMission {
  constructor() {
    super();

    this.index = null;
    this._isAvailable = true;
    this.batteryLevel = null;
    this._name = null;
    this._type = null;

    this.motion = {
      acceleration: new THREE.Vector3(),
      gravity: new THREE.Quaternion(),
      linearAcceleration: new THREE.Vector3(),
      rotationRate: new THREE.Euler(),
      magnetometer: new THREE.Quaternion(),
      quaternion: new THREE.Quaternion(),
      euler: new THREE.Euler(),

      calibration: null,
      _configuration: null
    };
  }

  send() {
    this.dispatchEvent({ type: "send" });
  }

  _flattenMessageData() {
    if (this._isAvailable) {
      return super._flattenMessageData();
    }
  }
  _flattenMessageDatum(datum) {
    return this._concatenateArrayBuffers(
      Uint8Array.from([this.index]),
      super._flattenMessageDatum(datum)
    );
  }

  _onAvailability(dataView, byteOffset) {
    const isAvailable = Boolean(dataView.getUint8(byteOffset++));

    this.log(
      `Got availability "${Boolean(isAvailable).toString()}" from device #${
        this.index
      }`
    );
    if (isAvailable) {
      this.getName(false);
      this.getType(false);
    } else {
      this._name = null;
      this._type = null;
      this.motion._configuration = null;
      delete this.pressure;
    }

    this._isAvailable = isAvailable;
    this.dispatchEvent({
      type: "availability",
      message: { isAvailable }
    });

    if (isAvailable) {
      this.dispatchEvent({ type: "available" });
    } else {
      this.dispatchEvent({ type: "unavailable" });
    }

    return byteOffset;
  }

  _onBatteryLevel(dataView, byteOffset) {
    const batteryLevel = dataView.getUint8(byteOffset++);
    this.log(`Got battery level ${batteryLevel} from device #${this.index}`);
    this.batteryLevel = batteryLevel;
    this.dispatchEvent({
      type: "batterylevel",
      message: { batteryLevel }
    });
    return byteOffset;
  }

  async getName(sendImmediately = true) {
    if (this._name !== null) {
      return this._name;
    } else {
      this.log("requesting name...");

      if (this._messagePromiseMap.has(this.MessageTypes.GET_NAME)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_NAME);
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "name",
            event => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.name);
              }

              this._messagePromiseMap.delete(this.MessageTypes.GET_NAME);
            },
            { once: true }
          );
        });

        if (!this._messageMap.has(this.MessageTypes.SET_NAME)) {
          this._messageMap.set(this.MessageTypes.GET_NAME);
        }
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.GET_NAME, promise);
        return promise;
      }
    }
  }
  async setName(newName, sendImmediately = true) {
    this.log("requesting name change...");

    newName = newName.substr(0, 30);

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "name",
        event => {
          const { error, name } = event;
          if (error) {
            reject(error);
          } else {
            resolve(name);
          }
        },
        { once: true }
      );
    });

    this._messageMap.delete(this.MessageTypes.GET_NAME);
    this._messageMap.set(this.MessageTypes.SET_NAME, newName);
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }
  _onName(dataView, byteOffset) {
    const errorCode = dataView.getUint8(byteOffset++);
    if (errorCode != this.ErrorMessageTypes.NO_ERROR) {
      const error = this.ErrorMessageTypeStrings[errorCode];
      this.log(`error trying to get name for #${this.index}: ${error}`);
      this.dispatchEvent({
        type: "name",
        error
      });
    } else {
      const nameLength = dataView.getUint8(byteOffset++);
      const name = this.textDecoder.decode(
        dataView.buffer.slice(byteOffset, byteOffset + nameLength)
      );
      byteOffset += nameLength;
      this.log(`got name "${name}" for device #${this.index}`);
      this._name = name;
      this.dispatchEvent({
        type: "name",
        message: { name }
      });
    }
    return byteOffset;
  }

  async getType(sendImmediately = true) {
    if (this._type !== null) {
      return this._type;
    } else {
      this.log("requesting type...");

      if (this._messagePromiseMap.has(this.MessageTypes.GET_TYPE)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_TYPE);
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "type",
            event => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.type);
              }

              this._messagePromiseMap.delete(this.MessageTypes.GET_TYPE);
            },
            { once: true }
          );
        });

        this._messageMap.set(this.MessageTypes.GET_TYPE);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.GET_TYPE, promise);

        return promise;
      }
    }
  }
  _onType(dataView, byteOffset) {
    const errorCode = dataView.getUint8(byteOffset++);
    if (errorCode != this.ErrorMessageTypes.NO_ERROR) {
      const error = this.ErrorMessageTypeStrings[errorCode];
      this.log(`error trying to get type for #${this.index}: ${error}`);
      this.dispatchEvent({
        type: "type",
        error
      });
    } else {
      const type = dataView.getUint8(byteOffset++);
      const typeString = this.TypeStrings[type];
      this.log(`Got type ${typeString} from device #${this.index}`);
      this._type = type;
      this.isInsole =
        type == this.Types.LEFT_INSOLE || type == this.Types.RIGHT_INSOLE;
      if (this.isInsole) {
        this.isRightInsole = type == this.Types.RIGHT_INSOLE;
        this.pressure = Object.assign([], {
          sum: 0,
          mass: 0,
          heelToToe: 0,
          centerOfMass: { x: 0, y: 0 },
          _configuration: null
        });
      } else {
        delete this.pressure;
      }
      this.dispatchEvent({
        type: "type",
        message: { type }
      });
    }
    return byteOffset;
  }

  _onMotionCalibration(dataView, byteOffset) {
    let isFullyCalibrated = true;
    const motionCalibration = {};
    this.MotionCalibrationTypeStrings.forEach(motionCalibrationTypeString => {
      const value = dataView.getUint8(byteOffset++);
      motionCalibration[motionCalibrationTypeString] = value;
      isFullyCalibrated = isFullyCalibrated && value == 3;
    });
    motionCalibration.isFullyCalibrated = isFullyCalibrated;
    this.log(
      `Got motion calibration from device #${this.index}`,
      motionCalibration
    );
    this.motion.calibration = motionCalibration;
    this.dispatchEvent({
      type: "motioncalibration",
      message: { motionCalibration }
    });
    if (isFullyCalibrated) {
      this.dispatchEvent({
        type: "motionisfullycalibrated"
      });
    }
    return byteOffset;
  }

  async getMotionConfiguration(sendImmediately = true) {
    if (this.motion._configuration !== null) {
      return this.motion._configuration;
    } else {
      this.log("requesting motion configuration...");

      if (
        this._messagePromiseMap.has(this.MessageTypes.GET_MOTION_CONFIGURATION)
      ) {
        return this._messagePromiseMap.get(
          this.MessageTypes.GET_MOTION_CONFIGURATION
        );
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "motionconfiguration",
            event => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.motionConfiguration);
              }

              this._messagePromiseMap.delete(
                this.MessageTypes.GET_MOTION_CONFIGURATION
              );
            },
            { once: true }
          );
        });

        this._messageMap.set(this.MessageTypes.GET_MOTION_CONFIGURATION);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(
          this.MessageTypes.GET_MOTION_CONFIGURATION,
          promise
        );

        return promise;
      }
    }
  }
  async setMotionConfiguration(
    motionConfiguration = {},
    sendImmediately = true
  ) {
    this.log("requesting to set motion configuration...");

    /*
    if (this._type != this.Types.MOTION_MODULE) {
      return Promise.reject("motion is not available for insoles");
    }
    */

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "motionconfiguration",
        event => {
          const { error, motionConfiguration } = event;
          if (error) {
            reject(error);
          } else {
            resolve(motionConfiguration);
          }
        },
        { once: true }
      );
    });

    const motionConfigurationArray = Uint16Array.from(
      this.MotionDataTypeStrings.map(motionDataType => {
        if (motionDataType in motionConfiguration) {
          let rate = motionConfiguration[motionDataType];
          if (Number.isInteger(rate) && rate >= 0) {
            rate -= rate % 20;
            return rate;
          }
        } else {
          if (this.motion._configuration) {
            return this.motion._configuration[motionDataType];
          }
        }
      })
    );
    this._messageMap.set(
      this.MessageTypes.SET_MOTION_CONFIGURATION,
      motionConfigurationArray
    );
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }
  _onMotionConfiguration(dataView, byteOffset) {
    const errorCode = dataView.getUint8(byteOffset++);
    if (errorCode != this.ErrorMessageTypes.NO_ERROR) {
      const error = this.ErrorMessageTypeStrings[errorCode];
      this.log(
        `error trying to get motion configuration for #${this.index}: ${error}`
      );
      this.dispatchEvent({
        type: "motionconfiguration",
        error
      });
    } else {
      const motionConfiguration = {};
      this.MotionDataTypeStrings.forEach(motionDataTypeString => {
        const value = dataView.getUint16(byteOffset, true);
        byteOffset += 2;
        motionConfiguration[motionDataTypeString] = value;
      });
      this.motion._configuration = motionConfiguration;
      this.log(
        `Got motion configuration from device #${this.index}`,
        motionConfiguration
      );
      this.dispatchEvent({
        type: "motionconfiguration",
        message: { motionConfiguration }
      });
    }
    return byteOffset;
  }

  _onMotionData(dataView, byteOffset, timestamp) {
    const dataByteLength = dataView.getUint8(byteOffset++);
    const finalByteOffset = byteOffset + dataByteLength;
    while (byteOffset < finalByteOffset) {
      const dataType = dataView.getUint8(byteOffset++);
      const dataTypeString = this.MotionDataTypeStrings[dataType];
      this.log(`motion data type for device ${this.index}: ${dataTypeString}`);
      const scalar = this.MotionDataScalars[dataTypeString];
      let byteSize = 0;
      let vector, quaternion, euler;
      switch (dataType) {
        case this.MotionDataTypes.acceleration:
        case this.MotionDataTypes.gravity:
        case this.MotionDataTypes.linearAcceleration:
        case this.MotionDataTypes.magnetometer:
          vector = this._parseMotionVector(dataView, byteOffset, scalar);
          this.motion[dataTypeString].copy(vector);

          byteSize = 6;
          break;
        case this.MotionDataTypes.rotationRate:
          euler = this._parseMotionEuler(dataView, byteOffset, scalar);
          this.motion[dataTypeString].copy(euler);

          byteSize = 6;
          break;
        case this.MotionDataTypes.quaternion:
          quaternion = this._parseMotionQuaternion(
            dataView,
            byteOffset,
            scalar
          );
          this.motion[dataTypeString].copy(quaternion);

          byteSize = 8;

          euler = new THREE.Euler().setFromQuaternion(quaternion);
          euler.reorder("YXZ");
          this.motion.euler.copy(euler);
          this.dispatchEvent({
            type: "euler",
            message: { timestamp, euler }
          });
          break;
        default:
          this.log("uncaught motion data type", dataType);
          byteOffset = finalByteOffset;
          break;
      }

      const rawData = this._getRawMotionData(dataView, byteOffset, byteSize);
      this.dispatchEvent({
        type: dataTypeString,
        message: {
          timestamp,
          [dataTypeString]:
            dataTypeString == "quaternion" ? quaternion : vector || euler,
          rawData
        }
      });
      byteOffset += byteSize;
    }
    return byteOffset;
  }

  _getRawMotionData(dataView, offset, size) {
    return Array.from(new Int16Array(dataView.buffer.slice(offset, size)));
  }

  _parseMotionVector(dataView, offset, scalar = 1) {
    const vector = new THREE.Vector3();
    const x = dataView.getInt16(offset, true);
    const y = dataView.getInt16(offset + 2, true);
    const z = dataView.getInt16(offset + 4, true);

    if (this.isInsole) {
      if (this.isRightInsole) {
        vector.set(z, y, x);
      } else {
        vector.set(-z, y, -x);
      }
    } else {
      vector.set(x, -z, -y);
    }

    vector.multiplyScalar(scalar);
    return vector;
  }
  _parseMotionEuler(dataView, offset, scalar = 1) {
    const euler = new THREE.Euler();
    const x = THREE.Math.degToRad(dataView.getInt16(offset, true) * scalar);
    const y = THREE.Math.degToRad(dataView.getInt16(offset + 2, true) * scalar);
    const z = THREE.Math.degToRad(dataView.getInt16(offset + 4, true) * scalar);
    if (this.isInsole) {
      if (this.isRightInsole) {
        euler.set(-z, -y, -x, "YXZ");
      } else {
        euler.set(z, -y, x, "YXZ");
      }
    } else {
      euler.set(-x, z, y, "YXZ");
    }
    return euler;
  }
  _parseMotionQuaternion(dataView, offset, scalar = 1) {
    const quaternion = new THREE.Quaternion();
    const w = dataView.getInt16(offset, true) * scalar;
    const x = dataView.getInt16(offset + 2, true) * scalar;
    const y = dataView.getInt16(offset + 4, true) * scalar;
    const z = dataView.getInt16(offset + 6, true) * scalar;
    quaternion.set(-y, -w, -x, z);

    if (this.isInsole) {
      quaternion.multiply(this.insoleCorrectionQuaternion);
    }
    return quaternion;
  }

  async getPressureConfiguration(sendImmediately = true) {
    if (this.pressure._configuration !== null) {
      return this.pressure._configuration;
    } else {
      this.log("requesting pressure configuration...");

      if (
        this._messagePromiseMap.has(
          this.MessageTypes.GET_PRESSURE_CONFIGURATION
        )
      ) {
        return this._messagePromiseMap.get(
          this.MessageTypes.GET_PRESSURE_CONFIGURATION
        );
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "pressureconfiguration",
            event => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.pressureConfiguration);
              }

              this._messagePromiseMap.delete(
                this.MessageTypes.GET_PRESSURE_CONFIGURATION
              );
            },
            { once: true }
          );
        });

        this._messageMap.set(this.MessageTypes.GET_PRESSURE_CONFIGURATION);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(
          this.MessageTypes.GET_PRESSURE_CONFIGURATION,
          promise
        );

        return promise;
      }
    }
  }
  async setPressureConfiguration(
    pressureConfiguration = {},
    sendImmediately = true
  ) {
    this.log("requesting to set pressure configuration...");

    if (this._type == this.Types.MOTION_MODULE) {
      return Promise.reject("pressure is not available for motion modules");
    }

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "pressureconfiguration",
        event => {
          const { error, pressureConfiguration } = event;
          if (error) {
            reject(error);
          } else {
            resolve(pressureConfiguration);
          }
        },
        { once: true }
      );
    });

    const pressureConfigurationArray = Uint16Array.from(
      this.PressureDataTypeStrings.map(pressureDataType => {
        if (pressureDataType in pressureConfiguration) {
          let rate = pressureConfiguration[pressureDataType];
          if (Number.isInteger(rate) && rate >= 0) {
            rate -= rate % 20;
            return rate;
          }
        } else {
          if (this.pressure._configuration) {
            return this.pressure._configuration[pressureDataType];
          }
        }
      })
    );

    if (
      pressureConfigurationArray[this.PressureDataTypes.pressureSingleByte] !=
        0 ||
      pressureConfigurationArray[this.PressureDataTypes.pressureDoubleByte] != 0
    ) {
      if (
        pressureConfigurationArray[this.PressureDataTypes.pressureSingleByte] !=
          0 &&
        pressureConfigurationArray[this.PressureDataTypes.pressureDoubleByte] !=
          0
      ) {
        pressureConfigurationArray[
          this.PressureDataTypes.pressureSingleByte
        ] = 0;
      }

      pressureConfigurationArray[this.PressureDataTypes.mass] = 0;
      pressureConfigurationArray[this.PressureDataTypes.centerOfMass] = 0;
      pressureConfigurationArray[this.PressureDataTypes.heelToToe] = 0;
    }
    if (pressureConfigurationArray[this.PressureDataTypes.centerOfMass] != 0) {
      pressureConfigurationArray[this.PressureDataTypes.heelToToe] = 0;
    }

    this._messageMap.set(
      this.MessageTypes.SET_PRESSURE_CONFIGURATION,
      pressureConfigurationArray
    );
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }
  _onPressureConfiguration(dataView, byteOffset) {
    const errorCode = dataView.getUint8(byteOffset++);
    if (errorCode != this.ErrorMessageTypes.NO_ERROR) {
      const error = this.ErrorMessageTypeStrings[errorCode];
      this.log(
        `error trying to get pressure configuration for #${this.index}: ${error}`
      );
      this.dispatchEvent({
        type: "pressureconfiguration",
        error
      });
    } else {
      const pressureConfiguration = {};
      this.PressureDataTypeStrings.forEach(pressureDataTypeString => {
        const value = dataView.getUint16(byteOffset, true);
        byteOffset += 2;
        pressureConfiguration[pressureDataTypeString] = value;
      });
      this.pressure._configuration = pressureConfiguration;
      this.log(
        `Got pressure configuration from device #${this.index}`,
        pressureConfiguration
      );
      this.dispatchEvent({
        type: "pressureconfiguration",
        message: { pressureConfiguration }
      });
    }
    return byteOffset;
  }

  _onPressureData(dataView, byteOffset, timestamp) {
    const dataByteLength = dataView.getUint8(byteOffset++);
    const finalByteOffset = byteOffset + dataByteLength;
    while (byteOffset < finalByteOffset) {
      const dataType = dataView.getUint8(byteOffset++);
      const dataTypeString = this.PressureDataTypeStrings[dataType];
      this.log(
        `pressure data type for device ${this.index}: ${dataTypeString}`
      );
      const scalar = this.PressureDataScalars[dataTypeString];
      let byteSize = 0;

      switch (dataType) {
        case this.PressureDataTypes.pressureSingleByte:
        case this.PressureDataTypes.pressureDoubleByte:
          const pressure = [];
          pressure.sum = 0;
          for (let index = 0; index < 16; index++) {
            let value;
            if (dataType == this.PressureDataTypes.pressureSingleByte) {
              value = dataView.getUint8(byteOffset++);
            } else {
              value = dataView.getUint16(byteOffset, true);
              byteOffset += 2;
            }
            pressure.sum += value;

            const { x, y } = this.getPressurePosition(
              index,
              this.isRightInsole
            );
            pressure[index] = { x, y, value };
          }

          const centerOfMass = pressure.reduce(
            (centerOfMass, sensor) => {
              const { value } = sensor;
              const weight = value / pressure.sum || 0;
              sensor.weight = weight;

              const { x, y } = sensor;
              centerOfMass.x += x * weight;
              centerOfMass.y += y * weight;

              return centerOfMass;
            },
            { x: 0, y: 0 }
          );

          const heelToToe = 1 - centerOfMass.y;

          let mass = pressure.sum;
          if (dataType == this.PressureDataTypes.pressureSingleByte) {
            mass /= 2 ** 8 * 16;
          } else {
            mass /= 2 ** 12 * 16;
          }

          Object.assign(pressure, { mass, centerOfMass, heelToToe });
          this.pressure = pressure;

          this.dispatchEvent({
            type: "pressure",
            message: {
              timestamp,
              pressure
            }
          });

          this.dispatchEvent({
            type: dataTypeString,
            message: {
              timestamp,
              [dataTypeString]: pressure
            }
          });

          this.dispatchEvent({
            type: "mass",
            message: {
              timestamp,
              mass
            }
          });
          this.dispatchEvent({
            type: "centerOfMass",
            message: {
              timestamp,
              centerOfMass
            }
          });
          this.dispatchEvent({
            type: "heelToToe",
            message: {
              timestamp,
              heelToToe
            }
          });
          break;
        case this.PressureDataTypes.centerOfMass:
          {
            const centerOfMass = {
              x: dataView.getFloat32(byteOffset, true),
              y: dataView.getFloat32(byteOffset + 4, true)
            };

            this.pressure.centerOfMass = centerOfMass;
            byteOffset += 4 * 2;

            this.dispatchEvent({
              type: "centerOfMass",
              message: {
                timestamp,
                centerOfMass
              }
            });
            break;
          }
          break;
        case this.PressureDataTypes.mass:
          {
            let mass = dataView.getUint32(byteOffset, true);
            mass /= scalar;
            this.pressure.mass = mass;
            byteOffset += 4;

            this.dispatchEvent({
              type: "mass",
              message: {
                timestamp,
                mass
              }
            });
          }
          break;
        case this.PressureDataTypes.heelToToe:
          {
            const heelToToe = 1 - dataView.getFloat64(byteOffset, true);
            this.pressure.heelToToe = heelToToe;
            byteOffset += 8;

            this.dispatchEvent({
              type: "heelToToe",
              message: {
                timestamp,
                heelToToe
              }
            });
          }
          break;
        default:
          this.log("uncaught pressure data type", dataType);
          byteOffset = finalByteOffset;
          break;
      }
    }
    return byteOffset;
  }
}

class MissionMesh extends BaseMission {
  constructor() {
    super();

    this.devices = [];
    this.addEventListener(
      "connected",
      async () => {
        await this.getNumberOfDevices();
      },
      { once: true }
    );
  }

  get isConnected() {
    return (
      this._webSocket && this._webSocket.readyState == this._webSocket.OPEN
    );
  }
  _assertConnection() {
    if (!this.isConnected) {
      throw "Not connected";
    }
  }

  async connect(gateway) {
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

    this.log("getting device...");

    this._webSocket = new WebSocket(gateway);
    this._webSocket.addEventListener("open", this._onWebSocketOpen.bind(this));
    this._webSocket.addEventListener(
      "close",
      this._onWebSocketClose.bind(this)
    );
    this._webSocket.addEventListener(
      "message",
      this._onWebSocketMessage.bind(this)
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

  _onWebSocketOpen(event) {
    this.log("websocket opened");
    this.dispatchEvent({ type: "connected", message: { event } });
  }
  _onWebSocketClose(event) {
    this.log("websocket closed");
    this.dispatchEvent({ type: "disconnected", message: { event } });
  }
  _sendWebSocketMessage(message) {
    if (message.byteLength > 0) {
      this.log("sending message", Array.from(new Uint8Array(message)));
      this._webSocket.send(message);
    }
  }
  send() {
    this._assertConnection();
    const contatenatedMessages = this._concatenateArrayBuffers(
      this._flattenMessageData(),
      ...this.devices.map(device => device._flattenMessageData())
    );
    this._sendWebSocketMessage(contatenatedMessages);
  }
  async _onWebSocketMessage(event) {
    const arrayBuffer = await event.data.arrayBuffer();

    this.log(
      "message received",
      Array.from(new Uint8Array(arrayBuffer)),
      event
    );
    this.dispatchEvent({ type: "websocketmessage", message: { event } });

    const dataView = new DataView(arrayBuffer);
    let byteOffset = 0;

    let messageType;
    let timestamp;
    while (byteOffset < dataView.byteLength) {
      messageType = dataView.getUint8(byteOffset++);
      const messageTypeString = this.MessageTypeStrings[messageType];
      this.log(`message type: ${messageTypeString}`);
      switch (messageType) {
        case this.MessageTypes.TIMESTAMP:
          timestamp = dataView.getUint32(byteOffset, true);
          this.log("timestamp", timestamp);
          byteOffset += 4;
          break;
        case this.MessageTypes.GET_NUMBER_OF_DEVICES:
          byteOffset = this._onNumberOfDevices(dataView, byteOffset);
          break;
        case this.MessageTypes.AVAILABILITY:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onAvailability(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.DEVICE_ADDED:
          byteOffset = this._onDeviceAdded(dataView, byteOffset);
          break;
        case this.MessageTypes.DEVICE_REMOVED:
          byteOffset = this._onDeviceRemoved(dataView, byteOffset);
          break;
        case this.MessageTypes.BATTERY_LEVEL:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onBatteryLevel(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.GET_NAME:
        case this.MessageTypes.SET_NAME:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onName(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.GET_TYPE:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onType(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.MOTION_CALIBRATION:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onMotionCalibration(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.GET_MOTION_CONFIGURATION:
        case this.MessageTypes.SET_MOTION_CONFIGURATION:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onMotionConfiguration(dataView, byteOffset);
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.MOTION_DATA:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onMotionData(
                dataView,
                byteOffset,
                timestamp
              );
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.GET_PRESSURE_CONFIGURATION:
        case this.MessageTypes.SET_PRESSURE_CONFIGURATION:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onPressureConfiguration(
                dataView,
                byteOffset
              );
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        case this.MessageTypes.PRESSURE_DATA:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              byteOffset = device._onPressureData(
                dataView,
                byteOffset,
                timestamp
              );
            } else {
              throw `[${messageTypeString}] device #${deviceIndex} not found!`;
            }
          }
          break;
        default:
          this.log(`uncaught message type #${messageType}`);
          byteOffset = dataView.byteLength;
          break;
      }
    }

    this.send();
  }

  async getNumberOfDevices(sendImmediately = true) {
    this.log("requesting number of devices...");

    if (this._messagePromiseMap.has(this.MessageTypes.GET_NUMBER_OF_DEVICES)) {
      return this._messagePromiseMap.get(
        this.MessageTypes.GET_NUMBER_OF_DEVICES
      );
    } else {
      const promise = new Promise((resolve, reject) => {
        this.addEventListener(
          "numberofdevices",
          event => {
            const { error, message } = event;
            if (error) {
              reject(error);
            } else {
              resolve(message.numberOfDevices);
            }

            this._messagePromiseMap.delete(
              this.MessageTypes.GET_NUMBER_OF_DEVICES
            );
          },
          { once: true }
        );
      });

      this._messageMap.set(this.MessageTypes.GET_NUMBER_OF_DEVICES);
      if (sendImmediately) {
        this.send();
      }

      this._messagePromiseMap.set(
        this.MessageTypes.GET_NUMBER_OF_DEVICES,
        promise
      );

      return promise;
    }
  }
  _onNumberOfDevices(dataView, byteOffset) {
    const errorCode = dataView.getUint8(byteOffset++);
    if (errorCode != this.ErrorMessageTypes.NO_ERROR) {
      const error = this.ErrorMessageTypeStrings[errorCode];
      this.log(`error trying to get number of devices: ${error}`);
      this.dispatchEvent({
        type: "numberofdevices",
        error
      });
    } else {
      const numberOfDevices = dataView.getUint8(byteOffset++);
      this.log(`number of devices: ${numberOfDevices}`);
      while (this.devices.length < numberOfDevices) {
        this._addDevice();
      }
      for (let deviceIndex = 0; deviceIndex < numberOfDevices; deviceIndex++) {
        byteOffset = this.devices[deviceIndex]._onAvailability(
          dataView,
          byteOffset
        );
      }
      this.dispatchEvent({
        type: "numberofdevices",
        message: { numberOfDevices }
      });
    }
    return byteOffset;
  }

  _onDeviceAdded(dataView, byteOffset) {
    const newDeviceIndex = dataView.getUint8(byteOffset++);
    while (!(newDeviceIndex in this.devices)) {
      this._addDevice();
    }
    return byteOffset;
  }
  _addDevice() {
    const device = new MissionMeshDevice();
    this.devices.push(device);
    device.addEventListener("send", event => this.send());
    const deviceIndex = this.devices.indexOf(device);
    device.index = deviceIndex;
    this.log(`adding device #${deviceIndex}:`);
    try {
      device.getName(false);
      device.getType(false);
    } catch (error) {
      this.log(error);
    }
    this.dispatchEvent({
      type: "deviceadded",
      message: { device }
    });
  }

  _onDeviceRemoved(dataView, byteOffset) {
    const deviceIndex = dataView.getUint8(byteOffset++);
    const numberOfDevices = dataView.getUint8(byteOffset++);
    this.removeDevice(deviceIndex);
    return byteOffset;
  }
  _removeDevice(deviceIndex) {
    const device = this.devices[deviceIndex];
    if (device) {
      this.devices.splice(deviceIndex, 1);
      for (
        let index = deviceIndex;
        deviceIndex < this.devices.length;
        deviceIndex++
      ) {
        this.devices.index = deviceIndex;
      }
      this.log(`removed device #${deviceIndex}:`);
      this.dispatchEvent({
        type: "deviceremoved",
        message: { device }
      });
      device.dispatchEvent({ type: "removed" });
    }
  }
}
