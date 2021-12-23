/* global THREE */

{
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
}

class BaseMission {
  constructor() {
    this.isLoggingEnabled = true;
    this._messageMap = new Map();
    this._messagePromiseMap = new Map();
    
    this._reconnectOnDisconnection = true;
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
  
  get SensorTypes() {
    return this.constructor.SensorTypes;
  }
  get SensorTypeStrings() {
    return this.constructor.SensorTypeStrings;
  }
  
  get SensorDataTypes() {
    return this.constructor.SensorDataTypes;
  }
  get SensorDataTypeStrings() {
    return this.constructor.SensorDataTypeStrings;
  }
  
  isValidSensorType(sensorType) {
    return sensorType in this.SensorTypeStrings;
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
  
  _getRawMotionData(dataView, offset, size) {
    return Array.from(new Int16Array(dataView.buffer.slice(offset, offset+size)));
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
  
  SensorTypeStrings: [
    "MOTION",
    "PRESSURE"
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
  "PressureDataType",
  "SensorType"
].forEach(name => {
  BaseMission[name + "s"] = BaseMission[name + "Strings"].reduce(
    (object, name, index) => {
      object[name] = index;
      return object;
    },
    {}
  );
});
BaseMission.SensorDataTypes = {
  MOTION: BaseMission.MotionDataTypes,
  PRESSURE: BaseMission.PressureDataTypes,
}
BaseMission.SensorDataTypeStrings = {
  MOTION: BaseMission.MotionDataTypeStrings,
  PRESSURE: BaseMission.PressureDataTypeStrings
}
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
