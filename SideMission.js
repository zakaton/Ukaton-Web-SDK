/* global THREE */

class SideMission {
  constructor() {
    this.acceleration = new THREE.Vector3();
    this.gravity = new THREE.Quaternion();
    this.linearAcceleration = new THREE.Vector3();
    this.rotationRate = new THREE.Euler();
    this.magnetometer = new THREE.Quaternion();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();

    this.SERVICE_UUID = "ca51b65e-1c92-4e54-9bd7-fc1088f48832";
    this.CONFIGURATION_CHARACTERISTIC_UUID =
      "816ad53c-29df-4699-b25a-4acdf89699d6";
    this.DATA_CHARACTERISTIC_UUID = "bb52dc35-1a47-41c1-ae97-ce138dbf2cab";

    window.addEventListener("beforeunload", event => {
      this.disableAllSensors();
    });
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
          return this.service.getCharacteristic(
            this.CONFIGURATION_CHARACTERISTIC_UUID
          );
        })
        .then(configurationCharacteristic => {
          console.log("got configuration characteristic");
          this.configurationCharacteristic = configurationCharacteristic;
          this.configurationCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this.onConfigurationCharacteristicValueChanged.bind(this)
          );
          return this.configurationCharacteristic
            .startNotifications()
            .catch(error => console.log(error));
        })
        .then(() => {
          return this.service.getCharacteristic(this.DATA_CHARACTERISTIC_UUID);
        })
        .then(dataCharacteristic => {
          console.log("got data characteristic");
          this.dataCharacteristic = dataCharacteristic;
          this.dataCharacteristic.addEventListener(
            "characteristicvaluechanged",
            this.onDataCharacteristicValueChanged.bind(this)
          );
          return this.dataCharacteristic
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
    console.log("gettserverdisconnected");
    this.dispatchEvent({ type: "disconnected" });
    this.device.gatt.connect();
  }

  configureSensors(configuration = {}, rate) {
    if (this.isConnected) {
      this.configurationCharacteristic.readValue().then(dataView => {
        let configurationBitmask = dataView.getUint8(0);
        configuration = Object.assign(
          this.parseConfiguration(configurationBitmask),
          configuration
        );
        configurationBitmask = this.createConfigurationBitmask(configuration);
        dataView.setUint8(0, configurationBitmask);

        rate = rate || dataView.getUint16(1, true);
        dataView.setUint16(1, rate, true);

        return this.configurationCharacteristic.writeValue(dataView);
      });
    } else {
      return Promise.resolve();
    }
  }
  
  setRate(rate) {
    return this.configureSensors(null, rate);
  }

  disableAllSensors() {
    return this.configureSensors({
      acceleration: false,
      gravity: false,
      linearAcceleration: false,
      rotationRate: false,
      magnetometer: false,
      quaternion: false
    });
  }

  onConfigurationCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    const configurationBitmask = dataView.getUint8(0);
    const configuration = this.parseConfiguration(configurationBitmask);
    const rate = dataView.getUint8(1);
    this.dispatchEvent({
      type: "configuration",
      message: { configuration, rate }
    });
  }

  parseConfiguration(configurationBitmask = 0) {
    const configuration = {};
    for (const bitFlag in this.bitFlags) {
      configuration[bitFlag] = Boolean(
        configurationBitmask & this.bitFlags[bitFlag]
      );
    }
    return configuration;
  }
  createConfigurationBitmask(configuration = {}) {
    let configurationBitmask = 0;
    for (const bitFlag in configuration) {
      if (bitFlag in this.bitFlags) {
        const enabled = configuration[bitFlag];
        if (enabled) {
          configurationBitmask |= this.bitFlags[bitFlag];
        } else {
          configurationBitmask &= 0b11111111 ^ this.bitFlags[bitFlag];
        }
      }
    }
    return configurationBitmask;
  }

  onDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    
    const dataBitmask = dataView.getUint8(0);
    const timestamp = dataView.getUint32(1, true);

    const dataTypes = [];
    for (const dataType in this.bitFlags) {
      if (dataBitmask & this.bitFlags[dataType]) {
        dataTypes.push(dataType);
      }
    }
    
    if (dataTypes.length) {
      let byteOffset = 5;

      dataTypes.forEach(dataType => {
        let vector, quaternion, euler;
        const scalar = this.scalars[dataType];
        switch (dataType) {
          case "acceleration":
          case "gravity":
          case "linearAcceleration":
          case "magnetometer":
            vector = this.getVector(dataView, byteOffset, scalar);
            byteOffset += 6;

            this[dataType].copy(vector);
            this.dispatchEvent({
              type: dataType,
              message: { timestamp, [dataType]: vector }
            });
            break;
          case "rotationRate":
            euler = this.getEuler(dataView, byteOffset, scalar);
            byteOffset += 6;

            this[dataType].copy(euler);
            this.dispatchEvent({
              type: dataType,
              message: { timestamp, [dataType]: euler }
            });
            break;
          case "quaternion":
            quaternion = this.getQuaternion(dataView, byteOffset, scalar);
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

  getVector(dataView, offset, scalar = 1) {
    const vector = new THREE.Vector3();
    const x = dataView.getInt16(offset, true);
    const y = dataView.getInt16(offset + 2, true);
    const z = dataView.getInt16(offset + 4, true);
    vector.set(-x, -z, y).multiplyScalar(scalar);
    return vector;
  }
  getEuler(dataView, offset, scalar = 1) {
    const euler = new THREE.Euler();
    const x = THREE.Math.degToRad(dataView.getInt16(offset, true) * scalar);
    const y = THREE.Math.degToRad(dataView.getInt16(offset + 2, true) * scalar);
    const z = THREE.Math.degToRad(dataView.getInt16(offset + 4, true) * scalar);
    euler.set(-x, z, -y, "YXZ");
    return euler;
  }
  getQuaternion(dataView, offset, scalar = 1) {
    const quaternion = new THREE.Quaternion();
    const w = dataView.getInt16(offset, true) * scalar;
    const x = dataView.getInt16(offset + 2, true) * scalar;
    const y = dataView.getInt16(offset + 4, true) * scalar;
    const z = dataView.getInt16(offset + 6, true) * scalar;
    quaternion.set(x, z, -y, w);
    return quaternion;
  }

  getBatteryLevel() {
    return this.batteryLevelCharacteristic.readValue().then(dataView => {
      return dataView.getUint8(0);
    });
  }

  get bitFlags() {
    return this.constructor.bitFlags;
  }

  get scalars() {
    return this.constructor.scalars;
  }

  get dataTypes() {
    return this.constructor.dataTypes;
  }
}

Object.assign(SideMission, {
  bitFlags: {
    acceleration: 1 << 0,
    gravity: 1 << 1,
    linearAcceleration: 1 << 2,
    rotationRate: 1 << 3,
    magnetometer: 1 << 4,
    quaternion: 1 << 5
  },
  scalars: {
    acceleration: 1 / 100,
    gravity: 1 / 100,
    linearAcceleration: 1 / 100,
    rotationRate: 1 / 16,
    magnetometer: 1 / 16,
    quaternion: 1 / (1 << 14)
  },
  dataTypes: [
    "acceleration",
    "gravity",
    "linearAcceleration",
    "rotationRate",
    "magnetometer",
    "quaternion",
    "euler"
  ]
});

Object.assign(SideMission.prototype, THREE.EventDispatcher.prototype);
