/* global THREE */

class SideMission {
  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  GENERATE_UUID(val) {
    return `5691eddf-${val}-4420-b7a5-bb8751ab5181`;
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

    this.FILE_BLOCK_CHARACTERISTIC_UUID = this.GENERATE_UUID("3000");
    this.FILE_LENGTH_CHARACTERISTIC_UUID = this.GENERATE_UUID("3001");
    this.MAXIMUM_FILE_LENGTH_CHARACTERISTIC_UUID = this.GENERATE_UUID("3002");
    this.FILE_TRANSFER_TYPE_CHARACTERISTIC_UUID = this.GENERATE_UUID("3003");
    this.FILE_CHECKSUM_CHARACTERISTIC_UUID = this.GENERATE_UUID("3004");
    this.FILE_COMMAND_CHARACTERISTIC_UUID = this.GENERATE_UUID("3005");
    this.FILE_TRANSFER_STATUS_CHARACTERISTIC_UUID = this.GENERATE_UUID("3006");
    this.FILE_ERROR_MESSAGE_CHARACTERISTIC_UUID = this.GENERATE_UUID("3007");

    this.HAS_TFLITE_MODEL_CHARACTERISTIC_UUID = this.GENERATE_UUID("4000");
    this.TFLITE_ENABLED_CHARACTERISTIC_UUID = this.GENERATE_UUID("4001");
    this.TFLITE_MODEL_TYPE_CHARACTERISTIC_UUID = this.GENERATE_UUID("4002");
    this.TFLITE_NUMBER_OF_CLASSES_CHARACTERISTIC_UUID = this.GENERATE_UUID(
      "4003"
    );
    this.TFLITE_DATA_TYPES_CHARACTERISTIC_UUID = this.GENERATE_UUID("4004");
    this.TFLITE_SAMPLE_RATE_CHARACTERISTIC_UUID = this.GENERATE_UUID("4005");
    this.TFLITE_NUMBER_OF_SAMPLES_CHARACTERISTIC_UUID = this.GENERATE_UUID(
      "4006"
    );
    this.TFLITE_THRESHOLD_CHARACTERISTIC_UUID = this.GENERATE_UUID("4007");
    this.TFLITE_CAPTURE_DELAY_CHARACTERISTIC_UUID = this.GENERATE_UUID("4008");
    this.TFLITE_INFERENCE_CHARACTERISTIC_UUID = this.GENERATE_UUID("4009");
    this.TFLITE_MAKE_INFERENCE_CHARACTERISTIC_UUID = this.GENERATE_UUID("4010");

    window.addEventListener("beforeunload", async event => {
      await this.disableAllSensors();
      await this.disableTfLiteModel();
    });
  }

  async connect() {
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

    this.log("getting device");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        {
          services: [this.SERVICE_UUID]
        }
      ],
      optionalServices: ["battery_service"]
    });
    this.log("got device");
    this.device.addEventListener(
      "gattserverdisconnected",
      this.onGattServerDisconnected.bind(this)
    );

    this.log("getting server");
    this.server = await this.device.gatt.connect();
    this.log("got server");

    this.log("getting service...");
    this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
    this.log("got service");

    this.log("getting name characteristic...");
    this.nameCharacteristic = await this.service.getCharacteristic(
      this.NAME_CHARACTERISTIC_UUID
    );
    this.log("got name characteristic");

    // IMU CHARACTERISTICS
    this.log("getting imu callibration characteristic...");
    this.imuCalibrationCharacteristic = await this.service.getCharacteristic(
      this.IMU_CALIBRATION_CHARACTERISTIC_UUID
    );
    this.log("got imu callibration characteristic");
    this.imuCalibrationCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onImuCalibrationCharacteristicValueChanged.bind(this)
    );
    this.log("starting imu calibration notifications...");
    await this.imuCalibrationCharacteristic.startNotifications();
    this.log("started imu calibration notifications");

    this.log("getting imu configuration characteristic...");
    this.imuConfigurationCharacteristic = await this.service.getCharacteristic(
      this.IMU_CONFIGURATION_CHARACTERISTIC_UUID
    );
    this.log("got imu configuration characteristic");

    this.log("getting imu data characteristic...");
    this.imuDataCharacteristic = await this.service.getCharacteristic(
      this.IMU_DATA_CHARACTERISTIC_UUID
    );
    this.log("got imu data characteristic");
    this.imuDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onImuDataCharacteristicValueChanged.bind(this)
    );
    this.log("starting imu data notifications...");
    await this.imuDataCharacteristic.startNotifications();
    this.log("started imu data notifications");

    this.log("connection complete!");
    this.dispatchEvent({ type: "connected" });

    // FILE TRANSFER CHARACTERISTICS
    this.log("getting file block characteristic...");
    this.fileBlockCharacteristic = await this.service.getCharacteristic(
      this.FILE_BLOCK_CHARACTERISTIC_UUID
    );
    this.log("got file block characteristic");

    this.log("getting file length characteristic...");
    this.fileLengthCharacteristic = await this.service.getCharacteristic(
      this.FILE_LENGTH_CHARACTERISTIC_UUID
    );
    this.log("got file length characteristic");

    this.log("getting maximum file length characteristic...");
    this.maximumFileLengthCharacteristic = await this.service.getCharacteristic(
      this.MAXIMUM_FILE_LENGTH_CHARACTERISTIC_UUID
    );
    this.log("got maximum file length characteristic");

    this.log("getting file transfer type characteristic...");
    this.fileTransferTypeCharacteristic = await this.service.getCharacteristic(
      this.FILE_TRANSFER_TYPE_CHARACTERISTIC_UUID
    );
    this.log("got file transfer type characteristic");

    this.log("getting file checksum characteristic...");
    this.fileChecksumCharacteristic = await this.service.getCharacteristic(
      this.FILE_CHECKSUM_CHARACTERISTIC_UUID
    );
    this.log("got file checksum characteristic");

    this.log("getting file command characteristic...");
    this.fileCommandCharacteristic = await this.service.getCharacteristic(
      this.FILE_COMMAND_CHARACTERISTIC_UUID
    );
    this.log("got file command characteristic");

    this.log("getting file transfer status characteristic...");
    this.fileTransferStatusCharacteristic = await this.service.getCharacteristic(
      this.FILE_TRANSFER_STATUS_CHARACTERISTIC_UUID
    );
    this.log("got file transfer status characteristic");
    this.fileTransferStatusCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onFileTransferStatusCharacteristicValueChanged.bind(this)
    );
    this.log("starting file transfer status notifications...");
    await this.fileTransferStatusCharacteristic.startNotifications();
    this.log("started file transfer status notifications");

    this.log("getting file error message characteristic...");
    this.fileErrorMessageCharacteristic = await this.service.getCharacteristic(
      this.FILE_ERROR_MESSAGE_CHARACTERISTIC_UUID
    );
    this.log("got file error message characteristic");
    this.fileErrorMessageCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onFileErrorMessageCharacteristicValueChanged.bind(this)
    );
    this.log("starting file error message notifications...");
    await this.fileErrorMessageCharacteristic.startNotifications();
    this.log("started file error message notifications");

    // TFLITE CHARACTERISTICS
    this.log("getting 'has tflite model loaded' characteristic...");
    this.hasTfLiteModelLoadedCharacteristic = await this.service.getCharacteristic(
      this.HAS_TFLITE_MODEL_CHARACTERISTIC_UUID
    );
    this.log("got 'has tflite model loaded' characteristic");
    this.hasTfLiteModelLoadedCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onHasTfLiteModelLoadedCharacteristicValueChanged.bind(this)
    );
    this.log("starting 'has tflite model loaded' notifications...");
    await this.hasTfLiteModelLoadedCharacteristic.startNotifications();
    this.log("started 'has tflite model loaded' notifications");

    this.log("getting tflite enabled characteristic...");
    this.tfLiteEnabledCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_ENABLED_CHARACTERISTIC_UUID
    );
    this.log("got tflite enabled characteristic");

    this.log("getting tflite model type characteristic...");
    this.tfLiteModelTypeCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_MODEL_TYPE_CHARACTERISTIC_UUID
    );
    this.log("got tflite model type characteristic");

    this.log("getting tflite number of classes characteristic...");
    this.tfLiteNumberOfClassesCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_NUMBER_OF_CLASSES_CHARACTERISTIC_UUID
    );
    this.log("got tflite number of classes characteristic");

    this.log("getting tflite data types characteristic...");
    this.tfLiteDataTypesCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_DATA_TYPES_CHARACTERISTIC_UUID
    );
    this.log("got tflite data types characteristic");

    this.log("getting tflite sample rate characteristic...");
    this.tfLiteSampleRateCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_SAMPLE_RATE_CHARACTERISTIC_UUID
    );
    this.log("got tflite sample rate characteristic");

    this.log("getting tflite number of samples characteristic...");
    this.tfLiteNumberOfSamplesCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_NUMBER_OF_SAMPLES_CHARACTERISTIC_UUID
    );
    this.log("got tflite number of samples characteristic");

    this.log("getting tflite threshold characteristic...");
    this.tfLiteThresholdCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_THRESHOLD_CHARACTERISTIC_UUID
    );
    this.log("got tflite threshold characteristic");

    this.log("getting tflite capture delay characteristic...");
    this.tfLiteCaptureDelayCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_CAPTURE_DELAY_CHARACTERISTIC_UUID
    );
    this.log("got tflite capture delay characteristic");

    this.log("getting tflite inference characteristic...");
    this.tfLiteInferenceCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_INFERENCE_CHARACTERISTIC_UUID
    );
    this.log("got tflite inference characteristic");
    this.tfLiteInferenceCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onTfLiteInferenceCharacteristicValueChanged.bind(this)
    );
    this.log("starting tflite inference notifications...");
    await this.tfLiteInferenceCharacteristic.startNotifications();
    this.log("started tflite inference notifications");

    this.log("getting make tflite inference characteristic...");
    this.tfLiteMakeInferenceCharacteristic = await this.service.getCharacteristic(
      this.TFLITE_MAKE_INFERENCE_CHARACTERISTIC_UUID
    );
    this.log("got make tflite inference characteristic");

    // BATTERY CHARACTERITICS
    this.log("getting battery service...");
    this.batteryService = await this.server.getPrimaryService(
      "battery_service"
    );
    this.log("got battery service");

    this.log("getting battery level characteristic...");
    this.batteryLevelCharacteristic = await this.batteryService.getCharacteristic(
      "battery_level"
    );
    this.log("got battery level characteristic");

    this.batteryLevelCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this.onBatteryLevelCharacteristicValueChanged.bind(this)
    );
    this.log("starting battery level notifications...");
    await this.batteryLevelCharacteristic.startNotifications();
    this.log("started battery level notifications");

    this.log("connection complete!");
    this.dispatchEvent({ type: "connected" });
  }

  get isConnected() {
    return this.device && this.device.gatt.connected;
  }

  onGattServerDisconnected(event) {
    this.log("disconnected");
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

  async getName() {
    if (!this.isConnected) {
      return;
    }
    const dataView = await this.nameCharacteristic.readValue();
    const name = this.textDecoder.decode(dataView);
    return name;
  }
  async setName(name) {
    if (!this.isConnected) {
      return;
    }
    if (name.length < 0 || name.length >= 30) {
      return;
    }
    return this.nameCharacteristic.writeValue(this.textEncoder.encode(name));
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

  async configureImu(imuConfiguration = {}) {
    if (!this.isConnected) {
      return;
    }

    const dataView = await this.imuConfigurationCharacteristic.readValue();
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

  // FILE TRANSFER
  async getMaximumFileLength() {
    const maximumFileLengthValue = await this.maximumFileLengthCharacteristic.readValue();
    const maximumFileLength = maximumFileLengthValue.getUint16(0, true);
    return maximumFileLength;
  }

  onFileTransferStatusCharacteristicValueChanged(event) {
    this.fileTransferStatus = event.target.value.getUint8(0);
    switch (this.fileTransferStatus) {
      case this.FILE_TRANSFER_STATUSES.SUCCESS:
        this.log("File Transfer Status: SUCCESS");
        break;
      case this.FILE_TRANSFER_STATUSES.ERROR:
        this.log("File Transfer Status: ERROR");
        break;
      case this.FILE_TRANSFER_STATUSES.IN_PROGRESS:
        this.log("File Transfer Status: IN PROGRESS");
        break;
    }
    this.dispatchEvent({
      type: "filetransferstatus",
      message: this.fileTransferStatus
    });
  }
  onFileErrorMessageCharacteristicValueChanged(event) {
    const errorMessage = this.textDecoder.decode(event.target.value);
    throw new Error(errorMessage);
  }

  // TFLITE
  async disableTfLiteModel() {
    if (!this.isConnected) {
      return;
    }
    return this.tfLiteEnabledCharacteristic.writeValue(Uint8Array.of([0]));
  }
  async enableTfLiteModel() {
    if (!this.isConnected) {
      return;
    }
    return this.tfLiteEnabledCharacteristic.writeValue(Uint8Array.of([1]));
  }
  async isTfLiteModelEnabled() {
    const dataView = await this.tfLiteEnabledCharacteristic.readValue();
    const isEnabled = dataView.getUint8(0) == 1;
    return isEnabled;
  }
  async makeTfLiteInference() {
    if (!this.isConnected) {
      return;
    }
    return this.tfLiteMakeInferenceCharacteristic.writeValue(
      Uint8Array.of([1])
    );
  }
  async hasTfLiteModelLoaded() {
    const dataView = await this.hasTfLiteModelLoadedCharacteristic.readValue();
    const hasLoaded = dataView.getUint8(0) == 1;
    return hasLoaded;
  }

  // https://github.com/googlecreativelab/tiny-motion-trainer/blob/eb1f4bdefbeed0bf4b53463befdbba3b302747b8/frontend/src/tf4micro-motion-kit/modules/bleManager.js#L275
  async transferTfLiteModel({
    model,
    type,
    numberOfClasses,
    dataTypes,
    sampleRate,
    numberOfSamples,
    thresholds,
    captureDelay
  }) {
    if (!this.isConnected) {
      return;
    }

    this.log("about to transfer TfLite model...");

    await this.tfLiteModelTypeCharacteristic.writeValue(
      Uint8Array.of(this.tfLiteModelTypes[type])
    );

    await this.tfLiteNumberOfClassesCharacteristic.writeValue(
      Uint8Array.of(numberOfClasses)
    );

    let dataTypesBitmask = 0;
    dataTypes.forEach(dataType => {
      dataTypesBitmask |= this.imuDataBitFlags[dataType];
    });
    await this.tfLiteDataTypesCharacteristic.writeValue(
      Uint8Array.of(dataTypesBitmask)
    );

    await this.tfLiteSampleRateCharacteristic.writeValue(
      Uint16Array.of(sampleRate)
    );
    await this.tfLiteNumberOfSamplesCharacteristic.writeValue(
      Uint16Array.of(numberOfSamples)
    );

    const thresholdsArray = [0, 0];
    for (const thresholdName in thresholds) {
      if (thresholdName in this.tfLiteThresholds) {
        thresholdsArray[this.tfLiteThresholds[thresholdName]] =
          thresholds[thresholdName];
      }
    }
    await this.tfLiteThresholdCharacteristic.writeValue(
      Float32Array.from(thresholdsArray)
    );
    await this.tfLiteCaptureDelayCharacteristic.writeValue(
      Uint16Array.of(captureDelay)
    );

    return this.transferFile(model, "TF_LITE_MODEL");
  }

  // https://github.com/googlecreativelab/tf4micro-motion-kit/blob/main/web/modules/bleFileTransfer.js
  async transferFile(file, type) {
    let fileBuffer;
    if (file instanceof Array) {
      fileBuffer = file;
    } else if (file.buffer) {
      fileBuffer = file.buffer;
    } else if (typeof file == "string") {
      const response = await fetch(file);
      fileBuffer = await response.arrayBuffer();
    } else {
      this.log(file, "is not a valid file type");
      return;
    }

    const maximumFileLength = this.getMaximumFileLength();

    if (fileBuffer.byteLength > maximumFileLength) {
      this.log(
        `File length is too long: ${fileBuffer.byteLength} bytes but maximum is ${maximumFileLength}`
      );
      return;
    }

    this.log("transfering file", fileBuffer);

    const fileTransferTypeArray = Uint8Array.of(this.FILE_TRANSFER_TYPES[type]);
    await this.fileTransferTypeCharacteristic.writeValue(fileTransferTypeArray);

    const fileBufferByteLengthArray = Int32Array.of(fileBuffer.byteLength);
    await this.fileLengthCharacteristic.writeValue(fileBufferByteLengthArray);

    const fileChecksum = this.crc32(fileBuffer);
    const fileChecksumArray = Uint32Array.of(fileChecksum);
    await this.fileChecksumCharacteristic.writeValue(fileChecksumArray);

    let commandArray = Uint8Array.of(0);
    await this.fileCommandCharacteristic.writeValue(commandArray);

    return this.sendFileBlock(fileBuffer, 0);
  }

  async sendFileBlock(fileContents, bytesAlreadySent) {
    let bytesRemaining = fileContents.byteLength - bytesAlreadySent;

    const maxBlockLength = 128;
    const blockLength = Math.min(bytesRemaining, maxBlockLength);
    const blockView = new Uint8Array(
      fileContents,
      bytesAlreadySent,
      blockLength
    );

    try {
      await this.fileBlockCharacteristic.writeValue(blockView);
      bytesRemaining -= blockLength;
      if (
        bytesRemaining > 0 &&
        this.fileTransferStatus == this.FILE_TRANSFER_STATUSES.IN_PROGRESS
      ) {
        this.log(`File block written - ${bytesRemaining} bytes remaining`);
        bytesAlreadySent += blockLength;
        this.dispatchEvent({
          type: "filetransferprogress",
          message: bytesAlreadySent / fileContents.byteLength
        });
        return this.sendFileBlock(fileContents, bytesAlreadySent);
      } else {
        this.log("successfully written file");
      }
    } catch (error) {
      console.error(error);
      this.log(`File block write error with ${bytesRemaining} bytes remaining`);
    }
  }
  async cancelFileTransfer() {
    const commandArray = Int32Array.of(1);
    await this.fileCommandCharacteristic.writeValue(commandArray);
  }

  // https://github.com/googlecreativelab/tf4micro-motion-kit/blob/281868796979ad5f2fd31ba94f8a61b28a3455fb/web/modules/bleFileTransfer.js#L195
  crc32ForByte(r) {
    for (let j = 0; j < 8; ++j) {
      r = (r & 1 ? 0 : 0xedb88320) ^ (r >>> 1);
    }
    return r ^ 0xff000000;
  }

  crc32(dataIterable) {
    const tableSize = 256;
    if (!window.crc32Table) {
      const crc32Table = new Uint32Array(tableSize);
      for (let i = 0; i < tableSize; ++i) {
        crc32Table[i] = this.crc32ForByte(i);
      }
      window.crc32Table = crc32Table;
    }
    let dataBytes = new Uint8Array(dataIterable);
    let crc = 0;
    for (let i = 0; i < dataBytes.byteLength; ++i) {
      const crcLowByte = crc & 0x000000ff;
      const dataByte = dataBytes[i];
      const tableIndex = crcLowByte ^ dataByte;
      // The last >>> is to convert this into an unsigned 32-bit integer.
      crc = (window.crc32Table[tableIndex] ^ (crc >>> 8)) >>> 0;
    }
    return crc;
  }

  get FILE_TRANSFER_STATUSES() {
    return this.constructor.FILE_TRANSFER_STATUSES;
  }
  get FILE_TRANSFER_TYPES() {
    return this.constructor.FILE_TRANSFER_TYPES;
  }

  // TFLITE
  onHasTfLiteModelLoadedCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    const hasTfLiteModelLoaded = dataView.getUint8(0);
    this.log(`TfLite Model has ${hasTfLiteModelLoaded ? "" : "not "}loaded`);
    this.dispatchEvent({
      type: "hasTfLiteModelLoaded",
      message: { hasLoaded: hasTfLiteModelLoaded }
    });
  }
  onTfLiteInferenceCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    const index = dataView.getUint8(0);
    const value = dataView.getFloat32(1, true);
    this.log(`inference: class #${index} with value ${value}`);
    this.dispatchEvent({ type: "inference", message: { index, value } });
  }

  get tfLiteThresholds() {
    return this.constructor.tfLiteThresholds;
  }
  get tfLiteModelTypes() {
    return this.constructor.tfLiteModelTypes;
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
    "quaternion",
    "euler"
  ],
  get dataTypes() {
    return this.imuDataTypes;
  },

  FILE_TRANSFER_STATUSES: {
    SUCCESS: 0,
    ERROR: 1,
    IN_PROGRESS: 2
  },
  FILE_TRANSFER_TYPES: {
    TF_LITE_MODEL: 0
  },

  tfLiteThresholds: {
    linearAcceleration: 0,
    rotationRate: 1
  },
  tfLiteModelTypes: {
    classification: 0,
    regression: 1
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
