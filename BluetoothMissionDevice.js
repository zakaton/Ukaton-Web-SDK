/* global THREE, BaseMission */

// to remove that stupid THREE.js warning
THREE.Quaternion.prototype.inverse = THREE.Quaternion.prototype.invert;

class BluetoothMissionDevice extends BaseMission {
  constructor() {
    super();

    this._debug = null;
    this._batteryLevel = null;
    this._name = null;
    this._type = null;

    this._sensorDataConfigurations = {
      motion: null,
      pressure: null
    };

    this.motion = {
      acceleration: new THREE.Vector3(),
      gravity: new THREE.Quaternion(),
      linearAcceleration: new THREE.Vector3(),
      rotationRate: new THREE.Euler(),
      magnetometer: new THREE.Quaternion(),
      quaternion: new THREE.Quaternion(),
      euler: new THREE.Euler(),

      calibration: null
    };

    this.pressure = Object.assign([], {
      sum: 0,
      mass: 0,
      heelToToe: 0,
      centerOfMass: { x: 0, y: 0 }
    });
  }

  get isConnected() {
    return this._device && this._device.gatt.connected;
  }
  _assertConnection() {
    if (!this.isConnected) {
      throw "Not connected";
    }
  }
  GENERATE_UUID(value) {
    return `5691eddf-${value}-4420-b7a5-bb8751ab5181`;
  }
  async connect() {
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

    this.log("getting device...");
    this._device = await navigator.bluetooth.requestDevice({
      filters: [
        {
          services: [this.GENERATE_UUID("0000")]
        }
      ],
      optionalServices: ["battery_service"]
    });
    this.log("got device!");
    this._device.addEventListener(
      "gattserverdisconnected",
      this._onGattServerDisconnected.bind(this)
    );

    this.log("getting server");
    this._server = await this._device.gatt.connect();
    this.log("got server!");

    this.log("getting service...");
    this._service = await this._server.getPrimaryService(
      this.GENERATE_UUID("0000")
    );
    this.log("got service!");

    // DEBUG
    this.log("getting debug characteristic...");
    this._debugCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0001")
    );
    this.log("got debug characteristic!");

    this.log("getting debug value...");
    await this.getDebug();
    this.log("got debug value!");

    // ERROR MESSAGE
    this.log("getting error message characteristic...");
    this._errorMessageCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0002")
    );
    this.log("got error message characteristic!");

    this._errorMessageCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onErrorMessageCharacteristicValueChanged.bind(this)
    );
    this.log("starting error message  notifications...");
    await this._errorMessageCharacteristic.startNotifications();
    this.log("started error message notifications!");

    // TYPE
    this.log("getting type characteristic...");
    this._typeCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0003")
    );
    this.log("got type characteristic!");

    this.log("getting type value...");
    await this.getType();
    this.log("got type value!");

    // NAME
    this.log("getting name characteristic...");
    this._nameCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0004")
    );
    this.log("got name characteristic!");

    this.log("getting name...");
    await this.getName();
    this.log("got name value!");

    // MOTION CALIBRATION
    this.log("getting motion calibration characteristic...");
    this._motionCalibrationCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0005")
    );
    this.log("got motion calibration characteristic!");

    this._motionCalibrationCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onMotionCalibrationCharacteristicValueChanged.bind(this)
    );
    this.log("starting motion calibration notifications...");
    await this._motionCalibrationCharacteristic.startNotifications();
    this.log("started imu calibration notifications!");

    // SENSOR DATA CONFIGURATION
    this.log("getting sensor data configuration characteristic...");
    this._sensorDataConfigurationCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0006")
    );
    this.log("got sensor data configuration characteristic!");

    this.log("getting sensor data configuration...");
    await this.getSensorDataConfigurations();
    this.log("got sensor data configuration!");

    // SENSOR DATA
    this.log("getting sensor data characteristic...");
    this._sensorDataCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("0007")
    );
    this.log("got sensor data characteristic!");

    this._sensorDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onSensorDataCharacteristicValueChanged.bind(this)
    );
    this.log("starting sensor data notifications...");
    await this._sensorDataCharacteristic.startNotifications();
    this.log("started sensor data notifications!");

    // BATTERY CHARACTERITICS
    this.log("getting battery service...");
    this._batteryService = await this._server.getPrimaryService(
      "battery_service"
    );
    this.log("got battery service!");

    this.log("getting battery level characteristic...");
    this._batteryLevelCharacteristic = await this._batteryService.getCharacteristic(
      "battery_level"
    );
    this.log("got battery level characteristic!");

    this._batteryLevelCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onBatteryLevelCharacteristicValueChanged.bind(this)
    );
    this.log("starting battery level notifications...");
    await this._batteryLevelCharacteristic.startNotifications();
    this.log("started battery level notifications!");

    // COMPLETED
    this.log("connection complete!");
    this.dispatchEvent({ type: "connected" });
  }

  _onGattServerDisconnected(event) {
    this.log("disconnected");
    this.dispatchEvent({ type: "disconnected" });
    if (this._reconnectOnDisconnection) {
      this.log("attempting to reconnect...");
      this._device.gatt.connect();
    }
  }

  // DEBUG
  async getDebug() {
    this._assertConnection();

    if (this._debug !== null) {
      return this._debug;
    } else {
      const dataView = await this._debugCharacteristic.readValue();
      const debug = Boolean(dataView.getUint8(dataView));
      this.log(`debug is ${debug ? "enabled" : "disabled"}`);
      this._debug = debug;
    }
  }
  async setDebug(debug) {
    this._assertConnection();

    this.log(`setting debug value to ${debug}...`);
    return this._debugCharacteristic.writeValueWithResponse(
      Uint8Array.of([debug ? 1 : 0])
    );
  }

  // ERROR MESSAGE
  _onErrorMessageCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    const errorMessage = this.textDecoder.decode(dataView);
    this.log(`error message: ${errorMessage}`);
    this.dispatchEvent({
      type: "errorMessage",
      message: { errorMessage }
    });
  }

  // TYPE
  getTypeString() {
    return this.TypeStrings[this._type];
  }
  async getType() {
    this._assertConnection();

    if (this._type !== null) {
      return this._type;
    } else {
      this.log("requesting type...");
      const dataView = await this._typeCharacteristic.readValue();
      this._type = dataView.getUint8(0);
      this.log(`type: ${this.getTypeString()}`);
      this._onTypeUpdate();
      return this._type;
    }
  }
  async setType(newType) {
    this._assertConnection();

    this.log(`setting type to ${newType}...`);

    if (!(newType in this.TypeStrings)) {
      throw `invalid type ${newType}`;
    }

    await this._typeCharacteristic.writeValueWithResponse(
      Uint8Array.from([newType])
    );
    this._type = this._typeCharacteristic.value.getUint8(0);
    this._onTypeUpdate();

    return this._type;
  }
  _onTypeUpdate() {
    this.isInsole =
      this._type == this.Types.LEFT_INSOLE ||
      this._type == this.Types.RIGHT_INSOLE;
    if (this.isInsole) {
      this.isRightInsole = this._type == this.Types.RIGHT_INSOLE;
    }
    this.dispatchEvent({type: "typeupdate", message: {type: this._type}})
  }

  // NAME
  async getName() {
    this._assertConnection();

    if (this._name !== null) {
      return this._name;
    } else {
      const dataView = await this._nameCharacteristic.readValue();
      this._name = this.textDecoder.decode(dataView);
      this.log(`got name "${this._name}"`);
      this._onNameUpdate();
      return this._name;
    }
  }
  async setName(newName) {
    this._assertConnection();

    newName = newName.substr(0, 30);
    await this._nameCharacteristic.writeValueWithResponse(
      this.textEncoder.encode(newName)
    );
    this._name = this.textDecoder.decode(this._nameCharacteristic.value);
    this._onNameUpdate();
    return this._name;
  }
  _onNameUpdate() {
    this.dispatchEvent({ type: "nameupdate", message: { name: this._name } });
  }

  // MOTION CALIBRATION
  _onMotionCalibrationCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    let isFullyCalibrated = true;
    const motionCalibration = {};
    this.MotionCalibrationTypeStrings.forEach(
      (motionCalibrationTypeString, index) => {
        const value = dataView.getUint8(index);
        motionCalibration[motionCalibrationTypeString] = value;
        isFullyCalibrated = isFullyCalibrated && value == 3;
      }
    );
    motionCalibration.isFullyCalibrated = isFullyCalibrated;

    this.log("received motion calibration data", motionCalibration);
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
  }

  // SENSOR DATA CONFIGURATION
  async getSensorDataConfigurations() {
    this._assertConnection();

    const dataView = await this._sensorDataConfigurationCharacteristic.readValue();
    this.log("getting sensor data configuration", dataView);
    this._parseSensorDataConfigurations(dataView);
    return this._sensorDataConfigurations;
  }
  _parseSensorDataConfigurations(dataView, byteOffset = 0) {
    this.SensorTypeStrings.forEach((sensorTypeString, sensorType) => {
      byteOffset = this._parseSensorDataConfiguration(
        dataView,
        byteOffset,
        sensorType
      );
    });
    this.dispatchEvent({type: "sensordataconfigurationsupdate", message: {sensorDataConfigurations: this._sensorDataConfigurations}})
    return byteOffset;
  }
  _parseSensorDataConfiguration(dataView, byteOffset, sensorType) {
    const sensorDataConfiguration = {};
    if (!this.isValidSensorType(sensorType)) {
      throw `undefined sensor type ${sensorType}`;
    }
    const sensorTypeString = this.SensorTypeStrings[sensorType];
    const sensorDataTypeStrings = this.SensorDataTypeStrings[sensorTypeString];
    const sensorDataTypes = this.SensorDataTypes[sensorTypeString];

    sensorDataTypeStrings.forEach((sensorDataTypeString, index) => {
      sensorDataConfiguration[sensorDataTypeString] = dataView.getUint16(
        byteOffset,
        true
      );
      byteOffset += 2;
    });

    const lowerCaseSensorTypeString = sensorTypeString.toLowerCase();
    this._sensorDataConfigurations[
      lowerCaseSensorTypeString
    ] = sensorDataConfiguration;
    return byteOffset;
  }

  async setSensorDataConfigurations(configurations = {}) {
    this._assertConnection();

    const flattenedConfigurations = this._flattenSensorConfigurations(
      configurations
    );
    await this._sensorDataConfigurationCharacteristic.writeValueWithResponse(
      flattenedConfigurations
    );
    return this.getSensorDataConfigurations();
  }
  _flattenSensorConfigurations(configurations) {
    let flattenedConfigurations = new ArrayBuffer();

    this.SensorTypeStrings.forEach((sensorTypeString, sensorType) => {
      sensorTypeString = sensorTypeString.toLowerCase();
      if (sensorTypeString in configurations) {
        flattenedConfigurations = this._concatenateArrayBuffers(
          flattenedConfigurations,
          this._flattenSensorConfiguration(
            configurations[sensorTypeString],
            sensorType
          )
        );
      }
    });
    return flattenedConfigurations;
  }
  _flattenSensorConfiguration(configuration, sensorType) {
    const _configuration = {};
    if (!this.isValidSensorType(sensorType)) {
      throw `undefined sensor type ${sensorType}`;
    }
    const sensorTypeString = this.SensorTypeStrings[sensorType];
    const sensorDataTypeStrings = this.SensorDataTypeStrings[sensorTypeString];
    const sensorDataTypes = this.SensorDataTypes[sensorTypeString];

    for (const sensorDataTypeString in configuration) {
      if (sensorDataTypeStrings.includes(sensorDataTypeString)) {
        let delay = configuration[sensorDataTypeString];
        if (Number.isInteger(delay) && delay >= 0) {
          delay -= delay % 20;
          _configuration[sensorDataTypeString] = delay;
        }
      }
    }

    const numberOfSensorDataTypes = Object.keys(_configuration).length;
    if (numberOfSensorDataTypes > 0) {
      const flattenedConfiguration = new DataView(
        new ArrayBuffer(numberOfSensorDataTypes * 3)
      );
      let byteOffset = 0;
      for (const sensorDataType in _configuration) {
        flattenedConfiguration.setUint8(
          byteOffset,
          sensorDataTypes[sensorDataType]
        );
        flattenedConfiguration.setUint16(
          byteOffset + 1,
          _configuration[sensorDataType],
          true
        );
        byteOffset += 3;
      }
      return this._concatenateArrayBuffers(
        Uint8Array.from([sensorType, flattenedConfiguration.byteLength]),
        flattenedConfiguration.buffer
      );
    } else {
      return new ArrayBuffer();
    }
  }

  // SENSOR DATA
  _onSensorDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.log("received sensor data", dataView);
    this._parseSensorData(dataView);
  }
  _parseSensorData(dataView, byteOffset = 0) {
    const timestamp = dataView.getUint16(byteOffset, true);
    console.log(timestamp);
    byteOffset += 2;

    while (byteOffset < dataView.byteLength) {
      const sensorType = dataView.getUint8(byteOffset++);
      byteOffset = this._parseSensorDataType(
        dataView,
        byteOffset,
        timestamp,
        sensorType
      );
    }
  }
  _parseSensorDataType(dataView, byteOffset, timestamp, sensorType) {
    const dataSize = dataView.getUint8(byteOffset++);
    const finalByteOffset = byteOffset + dataSize;
    if (finalByteOffset > dataView.byteLength) {
      throw `data size is larger than data view size`;
    }

    if (!this.isValidSensorType(sensorType)) {
      throw `undefined sensor type ${sensorType}`;
    }

    switch (sensorType) {
      case this.SensorTypes.MOTION:
        byteOffset = this._parseMotionSensorData(
          dataView,
          byteOffset,
          finalByteOffset,
          timestamp
        );
        break;
      case this.SensorTypes.PRESSURE:
        byteOffset = this._parsePressureSensorData(
          dataView,
          byteOffset,
          finalByteOffset,
          timestamp
        );
        break;
    }

    return byteOffset;
  }
  _parseMotionSensorData(dataView, byteOffset, finalByteOffset, timestamp) {
    while (byteOffset < finalByteOffset) {
      const motionSensorDataType = dataView.getUint8(byteOffset++);
      const motionSensorDataTypeString = this.MotionDataTypeStrings[
        motionSensorDataType
      ];
      this.log(`got motion sensor data type "${motionSensorDataTypeString}"`);

      const scalar = this.MotionDataScalars[motionSensorDataTypeString];
      let byteSize = 0;
      let vector, quaternion, euler;
      switch (motionSensorDataType) {
        case this.MotionDataTypes.acceleration:
        case this.MotionDataTypes.gravity:
        case this.MotionDataTypes.linearAcceleration:
        case this.MotionDataTypes.magnetometer:
          vector = this._parseMotionVector(dataView, byteOffset, scalar);
          this.motion[motionSensorDataTypeString].copy(vector);

          byteSize = 6;
          break;
        case this.MotionDataTypes.rotationRate:
          euler = this._parseMotionEuler(dataView, byteOffset, scalar);
          this.motion[motionSensorDataTypeString].copy(euler);

          byteSize = 6;
          break;
        case this.MotionDataTypes.quaternion:
          quaternion = this._parseMotionQuaternion(
            dataView,
            byteOffset,
            scalar
          );
          this.motion[motionSensorDataTypeString].copy(quaternion);

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
          throw `undefined motion sensor data type ${motionSensorDataType}`;
          break;
      }

      const rawData = this._getRawMotionData(dataView, byteOffset, byteSize);
      this.dispatchEvent({
        type: motionSensorDataTypeString,
        message: {
          timestamp,
          [motionSensorDataTypeString]:
            motionSensorDataTypeString == "quaternion"
              ? quaternion
              : vector || euler,
          rawData
        }
      });
      byteOffset += byteSize;
    }
    return byteOffset;
  }
  _parsePressureSensorData(dataView, byteOffset, finalByteOffset, timestamp) {
    while (byteOffset < finalByteOffset) {
      const pressureSensorDataType = dataView.getUint8(byteOffset++);
      const pressureSensorDataTypeString = this.PressureDataTypeStrings[
        pressureSensorDataType
      ];
      this.log(
        `got pressure sensor data type "${pressureSensorDataTypeString}"`
      );

      const scalar = this.PressureDataScalars[pressureSensorDataTypeString];
      let byteSize = 0;

      switch (pressureSensorDataType) {
        case this.PressureDataTypes.pressureSingleByte:
        case this.PressureDataTypes.pressureDoubleByte:
          const pressure = [];
          pressure.sum = 0;
          for (let index = 0; index < 16; index++) {
            let value;
            if (
              pressureSensorDataType ==
              this.PressureDataTypes.pressureSingleByte
            ) {
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
          if (
            pressureSensorDataType == this.PressureDataTypes.pressureSingleByte
          ) {
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
            type: pressureSensorDataTypeString,
            message: {
              timestamp,
              [pressureSensorDataTypeString]: pressure
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
          throw `undefined pressure sensor data type ${pressureSensorDataType}`;
          break;
      }
    }
    return byteOffset;
  }

  // BATTERY LEVEL
  _onBatteryLevelCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._onBatteryLevel(dataView);
  }
  _onBatteryLevel(dataView) {
    const batteryLevel = dataView.getUint8(0);
    this.log(`Got battery level ${batteryLevel} from device #${this.index}`);
    this.batteryLevel = batteryLevel;
    this.dispatchEvent({
      type: "batterylevel",
      message: { batteryLevel }
    });
  }
}

class BluetoothMissions {
  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  constructor() {
    this.left = new BluetoothMissionDevice();
    this.right = new BluetoothMissionDevice();

    this.isLoggingEnabled = true;

    this.sides = ["left", "right"];

    this.pressure = {
      sum: 0,
      centerOfMass: { x: 0, y: 0 },
      mass: { left: 0, right: 0 }
    };

    this.sides.forEach(side => {
      this[side].addEventListener("pressure", event => {
        const { timestamp } = event.message;
        this.updatePressure({ side, timestamp });
      });
    });
  }

  updatePressure({ side, timestamp }) {
    const pressure = {
      sum: 0,
      centerOfMass: { x: 0, y: 0 },
      mass: { left: 0, right: 0 }
    };
    pressure.sum = this.left.pressure.sum + this.right.pressure.sum;

    this.sides.forEach(side => {
      pressure.mass[side] = this[side].pressure.sum / pressure.sum || 0;
    });

    pressure.centerOfMass.x = pressure.mass.right;
    pressure.centerOfMass.y =
      this.left.pressure.centerOfMass.y * pressure.mass.left +
        this.right.pressure.centerOfMass.y * pressure.mass.right || 0;
    this.pressure = pressure;
    this.dispatchEvent({
      type: "pressure",
      message: { timestamp, side, pressure }
    });
  }
}
Object.assign(BluetoothMissions.prototype, THREE.EventDispatcher.prototype);