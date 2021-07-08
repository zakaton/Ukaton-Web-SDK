/* global THREE */

class SideMission {
  constructor() {
    this.batteryLevel = 100;

    this.calibration = {
      system: 0,
      gyroscope: 0,
      accelerometer: 0,
      magnetometer: 0
    };

    this.acceleration = new THREE.Vector3();
    this.gravity = new THREE.Quaternion();
    this.linearAcceleration = new THREE.Vector3();
    this.rotationRate = new THREE.Euler();
    this.magnetometer = new THREE.Quaternion();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();

    this.textEncoder = new TextEncoder();
    this.textDecoder = new TextDecoder();

    this.SERVICE_UUID = this.GENERATE_UUID("0000");

    this.NAME_CHARACTERISTIC_UUID = this.GENERATE_UUID("1000");

    this.IMU_CALIBRATION_CHARACTERISTIC_UUID = this.GENERATE_UUID("2000");
    this.IMU_CONFIGURATION_CHARACTERISTIC_UUID = this.GENERATE_UUID("2001");
    this.IMU_DATA_CHARACTERISTIC_UUID = this.GENERATE_UUID("2002");

    window.addEventListener("beforeunload", event => {
      this.disableAllSensors();
    });
  }

  GENERATE_UUID(val) {
    return `5691eddf-${val}-4420-b7a5-bb8751ab5181`;
  }

  connect() {
    if (this.isConnected) {
      return Promise.resolve();
    } else {
      return navigator.bluetooth
        .requestDevice({
          filters: [
            {
              services: [this.SERVICE_UUID]
            }
          ],
          optionalServices: ["battery_service"]
        })
        .then(device => {
          console.log("got device");
          this.device = device;
          this.device.addEventListener(
            "gattserverdisconnected",
            this.onGattServerDisconnected.bind(this)
          );
        })
        .then(() => {
          return this.device.gatt.connect();
        })
        .then(server => {
          console.log("got server");
          this.server = server;
        })
        .then(() => {
          return this.server.getPrimaryService(this.SERVICE_UUID);
        })
        .then(service => {
          console.log("got service");
          this.service = service;
        })
        .then(() => {
          return this.service.getCharacteristic(this.NAME_CHARACTERISTIC_UUID);
        })
        .then(nameCharacteristic => {
          console.log("got name characteristic");
          this.nameCharacteristic = nameCharacteristic;
          return this.nameCharacteristic
            .startNotifications()
            .catch(error => console.log(error));
        })
        .then(() => {
          return this.service.getCharacteristic(
            this.IMU_CALIBRATION_CHARACTERISTIC_UUID
          );
        })
        .then(imuCalibrationCharacteristic => {
          console.log("got imu calibration characteristic");
          this.imuCalibrationCharacteristic = imuCalibrationCharacteristic;
          this.imuCalibrationCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this.onImuCalibrationCharacteristicValueChanged.bind(this)
          );
          return this.imuCalibrationCharacteristic
            .startNotifications()
            .catch(error => console.log(error));
        })
        .then(() => {
          return this.service.getCharacteristic(
            this.IMU_CONFIGURATION_CHARACTERISTIC_UUID
          );
        })
        .then(imuConfigurationCharacteristic => {
          console.log("got imu configuration characteristic");
          this.imuConfigurationCharacteristic = imuConfigurationCharacteristic;
        })
        .then(() => {
          return this.service.getCharacteristic(
            this.IMU_DATA_CHARACTERISTIC_UUID
          );
        })
        .then(imuDataCharacteristic => {
          console.log("got imu data characteristic");
          this.imuDataCharacteristic = imuDataCharacteristic;
          this.imuDataCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this.onImuDataCharacteristicValueChanged.bind(this)
          );
          return this.imuDataCharacteristic
            .startNotifications()
            .catch(error => console.log(error));
        })
        .then(() => {
          return this.server.getPrimaryService("battery_service");
        })
        .then(batteryService => {
          console.log("got battery service");
          this.batteryService = batteryService;
        })
        .then(() => {
          console.log("getting battery level characteristic");
          return this.batteryService.getCharacteristic("battery_level");
        })
        .then(batteryLevelCharacteristic => {
          console.log("got battery level characteristic");
          this.batteryLevelCharacteristic = batteryLevelCharacteristic;
          this.batteryLevelCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this.onBatteryLevelCharacteristicValueChanged.bind(this)
          );
          return this.batteryLevelCharacteristic
            .startNotifications()
            .catch(error => console.log(error));
        })
        .then(() => {
          console.log("connected");
          this.dispatchEvent({ type: "connected" });
        });
    }
  }
  get isConnected() {
    return this.device && this.device.gatt.connected;
  }

  onGattServerDisconnected(event) {
    console.log("disconnected");
    this.dispatchEvent({ type: "disconnected" });
    this.device.gatt.connect();
  }

  onBatteryLevelCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.batteryLevel = dataView.getUint8(0);
    this.dispatchEvent({
      type: "batterylevel",
      message: { batteryLevel: this.batteryLevel }
    });
  }

  getName() {
    return Promise.resolve().then(() => {
      if (this.isConnected) {
        return this.nameCharacteristic.readValue().then(dataView => {
          const name = this.textDecoder.decode(dataView);
          return name;
        });
      }
    });
  }
  setName(name) {
    return Promise.resolve().then(() => {
      if (this.isConnected && name.length > 0 && name.length <= 30) {
        return this.nameCharacteristic.writeValue(
          this.textEncoder.encode(name)
        );
      }
    });
  }

  get isFullyCalibrated() {
    const { gyroscope, accelerometer, magnetometer, system } = this.calibration;
    return (
      gyroscope == 3 && accelerometer == 3 && magnetometer == 3 && system == 3
    );
  }
  onImuCalibrationCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.imuCalibrationTypes.forEach((calibrationType, index) => {
      this.calibration[calibrationType] = dataView.getUint8(index);
    });

    this.dispatchEvent({
      type: "calibration",
      message: { calibration: this.calibration }
    });

    if (this.isFullyCalibrated) {
      this.dispatchEvent({
        type: "fullycalibrated"
      });
    }
  }

  configureImu(imuConfiguration = {}) {
    return Promise.resolve().then(() => {
      if (this.isConnected) {
        return this.imuConfigurationCharacteristic
          .readValue()
          .then(dataView => {
            this.imuDataTypes.forEach((dataType, index) => {
              if (dataType in imuConfiguration) {
                let rate = imuConfiguration[dataType];
                if (Number.isInteger(rate) && rate >= 0) {
                  rate -= rate % 20;
                  dataView.setUint16(index * 2, rate, true);
                }
              }
            });
            return this.imuConfigurationCharacteristic.writeValue(dataView);
          });
      }
    });
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

  onImuDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;

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

      dataTypes.forEach(dataType => {
        let vector, quaternion, euler;
        const scalar = this.imuDataScalars[dataType];
        switch (dataType) {
          case "acceleration":
          case "gravity":
          case "linearAcceleration":
          case "magnetometer":
            vector = this.parseImuVector(dataView, byteOffset, scalar);
            byteOffset += 6;

            this[dataType].copy(vector);
            this.dispatchEvent({
              type: dataType,
              message: { timestamp, [dataType]: vector }
            });
            break;
          case "rotationRate":
            euler = this.parseImuEuler(dataView, byteOffset, scalar);
            byteOffset += 6;

            this[dataType].copy(euler);
            this.dispatchEvent({
              type: dataType,
              message: { timestamp, [dataType]: euler }
            });
            break;
          case "quaternion":
            quaternion = this.parseImuQuaternion(dataView, byteOffset, scalar);
            byteOffset += 8;

            this[dataType].copy(quaternion);
            this.dispatchEvent({
              type: dataType,
              message: { timestamp, [dataType]: quaternion }
            });

            euler = new THREE.Euler().setFromQuaternion(quaternion);
            euler.reorder("YXZ");
            this.euler.copy(euler);
            this.dispatchEvent({
              type: "euler",
              message: { timestamp, euler }
            });
            break;
        }
      });
    }
  }

  parseImuVector(dataView, offset, scalar = 1) {
    const vector = new THREE.Vector3();
    const x = dataView.getInt16(offset, true);
    const y = dataView.getInt16(offset + 2, true);
    const z = dataView.getInt16(offset + 4, true);
    vector.set(-x, -z, y).multiplyScalar(scalar);
    return vector;
  }
  parseImuEuler(dataView, offset, scalar = 1) {
    const euler = new THREE.Euler();
    const x = THREE.Math.degToRad(dataView.getInt16(offset, true) * scalar);
    const y = THREE.Math.degToRad(dataView.getInt16(offset + 2, true) * scalar);
    const z = THREE.Math.degToRad(dataView.getInt16(offset + 4, true) * scalar);
    euler.set(-x, z, -y, "YXZ");
    return euler;
  }
  parseImuQuaternion(dataView, offset, scalar = 1) {
    const quaternion = new THREE.Quaternion();
    const w = dataView.getInt16(offset, true) * scalar;
    const x = dataView.getInt16(offset + 2, true) * scalar;
    const y = dataView.getInt16(offset + 4, true) * scalar;
    const z = dataView.getInt16(offset + 6, true) * scalar;
    quaternion.set(x, z, -y, w);
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

  get dataTypes() {
    return this.constructor.dataTypes;
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
  imuDataTypes: [
    "acceleration",
    "gravity",
    "linearAcceleration",
    "rotationRate",
    "magnetometer",
    "quaternion",
    "euler"
  ],
  get dataTypes() {
    return this.imuDataTypes;
  }
});

Object.assign(SideMission.prototype, THREE.EventDispatcher.prototype);
