/* global THREE, BaseMission, BaseMissions, PeerBluetoothMissionDevice */

class BluetoothMissionDevice extends BaseMission {
  static MAX_NUMBER_OF_BLE_PEERS = 2;
  get MAX_NUMBER_OF_BLE_PEERS() {
    return this.constructor.MAX_NUMBER_OF_BLE_PEERS;
  }

  _minimizeBluetooth = false;

  _wifiSSID = null;
  _wifiPassword = null;
  _wifiConnect = null;
  _isWifiConnected = null;
  _wifiMACAddress = null;
  _wifiIPAddress = null;

  get isConnected() {
    return this._device && this._device.gatt.connected;
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
          //services: [this.GENERATE_UUID("0000")],
          services: [0x0000],
        },
      ],
      optionalServices: ["battery_service"],
    });

    if (false) {
      this._device.addEventListener("advertisementreceived", (event) => {
        //this.log("advertismeent", event);
        event.serviceData.forEach((dataView, key) => {
          this.log(
            "serviceData",
            Array.from(new Uint8Array(dataView.buffer)).join(",")
          );
        });
      });

      this._device.watchAdvertisements();

      return;
    }

    this.log("got device!");
    this._device.addEventListener(
      "gattserverdisconnected",
      this._onGattServerDisconnected.bind(this)
    );

    this.log("getting server");
    this._server = await this._device.gatt.connect();
    this.log("got server!");

    if (true || !this._minimizeBluetooth) {
      // BATTERY SERVICE/CHARACTERITICS
      this.log("getting battery service...");
      this._batteryService = await this._server.getPrimaryService(
        "battery_service"
      );
      this.log("got battery service!");

      this.log("getting battery level characteristic...");
      this._batteryLevelCharacteristic =
        await this._batteryService.getCharacteristic("battery_level");
      this.log("got battery level characteristic!");

      this._batteryLevelCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onBatteryLevelCharacteristicValueChanged.bind(this)
      );
      this.log("starting battery level notifications...");
      await this._batteryLevelCharacteristic.startNotifications();
      this.log("started battery level notifications!");

      await this._batteryLevelCharacteristic.readValue();
    }

    this.log("getting service...");
    this._service = await this._server.getPrimaryService(0x0000);
    this.log("got service!");

    // TYPE
    this.log("getting type characteristic...");
    this._typeCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("3001")
    );
    this.log("got type characteristic!");

    this.log("getting type value...");
    await this.getType();
    this.log("got type value!");

    // NAME
    this.log("getting name characteristic...");
    this._nameCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("4001")
    );
    this.log("got name characteristic!");

    this.log("getting name...");
    await this.getName();
    this.log("got name value!");

    if (!this._minimizeBluetooth) {
      // MOTION CALIBRATION
      this.log("getting motion calibration characteristic...");
      this._motionCalibrationCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("5001"));
      this.log("got motion calibration characteristic!");

      this._motionCalibrationCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onMotionCalibrationCharacteristicValueChanged.bind(this)
      );
      this.log("starting motion calibration notifications...");
      await this._motionCalibrationCharacteristic.startNotifications();
      this.log("started imu calibration notifications!");
    }

    // SENSOR DATA CONFIGURATION
    this.log("getting sensor data configuration characteristic...");
    this._sensorDataConfigurationCharacteristic =
      await this._service.getCharacteristic(this.GENERATE_UUID("6001"));
    this.log("got sensor data configuration characteristic!");

    this.log("getting sensor data configuration...");
    await this.getSensorDataConfigurations();
    this.log("got sensor data configuration!");

    // SENSOR DATA
    this.log("getting sensor data characteristic...");
    this._sensorDataCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID("6002")
    );
    this.log("got sensor data characteristic!");

    this._sensorDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onSensorDataCharacteristicValueChanged.bind(this)
    );
    this.log("starting sensor data notifications...");
    await this._sensorDataCharacteristic.startNotifications();
    this.log("started sensor data notifications!");

    if (!this._minimizeBluetooth) {
      // WEIGHT DATA DELAY
      this.log("getting weight data delay characteristic...");
      this._weightDataDelayCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("8001"));
      this.log("got weight data delay characteristic!");

      this.log("getting weight data delay...");
      await this.getWeightDataDelay();
      this.log("got weight data delay!");

      // WEIGHT DATA
      this.log("getting weight data characteristic...");
      this._weightDataCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("8002")
      );
      this.log("got weight data characteristic!");

      this._weightDataCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onWeightDataCharacteristicValueChanged.bind(this)
      );
      this.log("starting weight data notifications...");
      await this._weightDataCharacteristic.startNotifications();
      this.log("started weight data notifications!");

      // WIFI CHARACTERITICS
      this.log("getting wifi ssid characteristic...");
      this._wifiSSIDCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("7001")
      );
      await this.getWifiSSID();
      this.log("got wifi ssid characteristic!");

      this.log("getting wifi password characteristic...");
      this._wifiPasswordCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("7002")
      );
      await this.getWifiPassword();
      this.log("got wifi password characteristic!");

      this.log("getting wifi connect characteristic...");
      this._wifiConnectCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("7003")
      );
      await this.getWifiConnect();
      this.log("got wifi connect characteristic!");

      this.log("getting wifi is connected characteristic...");
      this._isWifiConnectedCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("7004"));
      await this.isWifiConnected();
      this.log("got wifi is connected characteristic!");
      this._isWifiConnectedCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onWifiIsConnectedCharacteristicValueChanged.bind(this)
      );
      this.log("starting wifi is connected notifications...");
      await this._isWifiConnectedCharacteristic.startNotifications();
      this.log("started wifi is connected notifications!");

      this.log("getting wifi IP address characteristic...");
      this._wifiIPAddressCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("7005")
      );
      await this.getWifiIPAddress();
      this.log("got wifi IP address characteristic!");

      this._wifiIPAddressCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onWifiIPAddressCharacteristicValueChanged.bind(this)
      );
      this.log("starting wifi IP address notifications...");
      await this._wifiIPAddressCharacteristic.startNotifications();
      this.log("started wifi IP address notifications!");

      this.log("getting wifi MAC address characteristic...");
      this._wifiMACAddressCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("7006"));
      await this.getWifiMACAddress();
      this.log("got wifi MAC address characteristic!");

      this._wifiMACAddressCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onWifiMACAddressCharacteristicValueChanged.bind(this)
      );
      this.log("starting wifi MAC address notifications...");
      await this._wifiMACAddressCharacteristic.startNotifications();
      this.log("started wifi MAC address notifications!");
    }

    // PEERS
    this.log("getting peer characteristics...");
    this.peers = [];
    for (
      let index = 0;
      !this._minimizeBluetooth &&
      index < this.constructor.MAX_NUMBER_OF_BLE_PEERS;
      index++
    ) {
      const peer = new PeerBluetoothMissionDevice();
      await peer.init(index, this._service);
      this.peers.push(peer);
    }
    this.log("got peer characteristics!");

    if (!this._minimizeBluetooth) {
      // FILE TRANSFER

      this.log("getting max file transfer size characteristic...");
      this._maxFileSizeCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("a000")
      );
      await this.getMaxFileSize();
      this.log("got max file transfer size characteristic!");

      this.log("getting file transfer size characteristic...");
      this._fileTransferSizeCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a001"));
      this.log("got file transfer size characteristic!");

      this.log("getting max file transfer filePath length characteristic...");
      this._maxFileTransferFilePathLengthCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a002"));
      await this.getMaxFileTransferFilePathLength();
      this.log("got max file transfer filePath length characteristic!");

      this.log("getting filePath characteristic...");
      this._fileTransferFilePathCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a003"));
      this.log("got file transfer filePath characteristic!");

      this.log("getting file transfer command characteristic...");
      this._fileTransferCommandCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a004"));
      this.log("got file transfer command characteristic!");

      this.log("getting file transfer status characteristic...");
      this._fileTransferStatusCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a005"));
      await this.getFileTransferStatus();
      this.log("got file transfer status characteristic!");

      this._fileTransferStatusCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onFileTransferStatusCharacteristicValueChanged.bind(this)
      );
      this.log("starting file transfer status notifications...");
      await this._fileTransferStatusCharacteristic.startNotifications();
      this.log("started file transfer status notifications!");

      this.log("getting file transfer data characteristic...");
      this._fileTransferDataCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("a006"));
      this.log("got file transfer data characteristic!");

      this._fileTransferDataCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onFileTransferDataCharacteristicValueChanged.bind(this)
      );
      this.log("starting file transfer data notifications...");
      await this._fileTransferDataCharacteristic.startNotifications();
      this.log("started file transfer data notifications!");
    }

    if (!this._minimizeBluetooth) {
      // FIRMWARE
      this.log("getting firmware version characteristic...");
      this._firmwareVersionCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("b000"));
      await this.getFirmwareVersion();
      this.log("got firmware version characteristic");

      this.log("getting max firmware size characteristic...");
      this._maxFirmwareSizeCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("b001"));
      await this.getMaxFirmwareSize();
      this.log("got max firmware size  characteristic");

      this.log("getting firmware data characteristic...");
      this._firmwareDataCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("b002")
      );
      this.log("got firmware data characteristic");
    }

    if (!this._minimizeBluetooth) {
      // STEPS
      this.log("getting is step tracking enabled characteristic...");
      this._isStepTrackingEnabledCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("c000"));
      await this.isStepTrackingEnabled();
      this.log("got is step tracking enabled characteristic");

      this.log("getting step tracking mass threshold characteristic...");
      this._stepTrackingMassThresholdCharacteristic =
        await this._service.getCharacteristic(this.GENERATE_UUID("c001"));
      await this.getStepTrackingMassThreshold();
      this.log("got step tracking mass threshold  characteristic");

      this.log("getting step data characteristic...");
      this._stepDataCharacteristic = await this._service.getCharacteristic(
        this.GENERATE_UUID("c002")
      );
      await this.getSteps();
      this.log("got step data characteristic");

      this._stepDataCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onStepDataCharacteristicValueChanged.bind(this)
      );
      this.log("starting step data notifications...");
      await this._stepDataCharacteristic.startNotifications();
      this.log("started step data notifications!");
    }
    // HAPTICS
    this.log("getting haptics vibration characteristic...");
    this._hapticsVibrationCharacteristic =
      await this._service.getCharacteristic(this.GENERATE_UUID("d000"));
    this.log("got haptic vibration characteristic");

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

  // BATTERY LEVEL
  _onBatteryLevelCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._parseBatteryLevel(dataView);
  }

  // TYPE
  async getType() {
    this._assertConnection();

    if (this._type == null) {
      this.log("requesting type...");
      const dataView = await this._typeCharacteristic.readValue();
      this._type = dataView.getUint8(0);
      this._onTypeUpdate();
    }
    return this._type;
  }
  async setType(newType) {
    this._assertConnection();

    this.log(`setting type to ${newType}...`);

    if (!this.isValidType(newType)) {
      throw `invalid type ${newType}`;
    }

    await this._typeCharacteristic.writeValueWithResponse(
      Uint8Array.from([newType])
    );
    this._type = this._typeCharacteristic.value.getUint8(0);
    this._onTypeUpdate();

    return this._type;
  }

  // NAME
  async getName() {
    this._assertConnection();

    if (this._name == null) {
      const dataView = await this._nameCharacteristic.readValue();
      this._name = this.textDecoder.decode(dataView);
      this._onNameUpdate();
    }
    return this._name;
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

  // MOTION CALIBRATION
  _onMotionCalibrationCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._parseMotionCalibration(dataView);
  }

  // SENSOR DATA CONFIGURATION
  async getSensorDataConfigurations() {
    this._assertConnection();

    if (this._sensorDataConfigurations == null) {
      const dataView =
        await this._sensorDataConfigurationCharacteristic.readValue();
      this.log("getting sensor data configuration", dataView);
      this._parseSensorDataConfigurations(dataView);
    }
    return this._sensorDataConfigurations;
  }

  async setSensorDataConfigurations(configurations = {}) {
    this._assertConnection();

    const flattenedConfigurations =
      this._flattenSensorConfigurations(configurations);
    await this._sensorDataConfigurationCharacteristic.writeValueWithResponse(
      flattenedConfigurations
    );
    const dataView =
      await this._sensorDataConfigurationCharacteristic.readValue();
    this._parseSensorDataConfigurations(dataView);
    return this.getSensorDataConfigurations();
  }

  // SENSOR DATA
  _onSensorDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.log("received sensor data", dataView);
    this._parseSensorData(dataView);
  }

  // WEIGHT DATA DELAY
  async getWeightDataDelay() {
    this._assertConnection();

    if (this._weightDelay == null) {
      const dataView = await this._weightDataDelayCharacteristic.readValue();
      this.log("getting weight data delay", dataView);
      this._weightDataDelay = dataView.getUint16(0, true);
      this._onWeightDataDelayUpdate();
    }
    return this._weightDelay;
  }

  async setWeightDataDelay(delay) {
    this._assertConnection();
    await this._weightDataDelayCharacteristic.writeValueWithResponse(
      Uint16Array.of([delay])
    );
    const dataView = await this._weightDataDelayCharacteristic.readValue();
    this._weightDataDelay = dataView.getUint16(0, true);
    this._onWeightDataDelayUpdate();
    return this._weightDataDelay;
  }

  // WEIGHT DATA
  _onWeightDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.log("received weight data", dataView);
    this._weight = dataView.getFloat32(0, true);
    this._onWeightDataUpdate();
  }

  // WIFI
  async getWifiSSID() {
    this._assertConnection();

    if (this._wifiSSID !== null) {
      return this._wifiSSID;
    } else {
      const dataView = await this._wifiSSIDCharacteristic.readValue();
      const wifiSSID = this.textDecoder.decode(dataView);
      this._wifiSSID = wifiSSID;
      this._onWifiSSIDUpdate();
      return this._wifiSSID;
    }
  }
  async setWifiSSID(wifiSSID) {
    this._assertConnection();

    this.log(`setting wifi ssid to ${wifiSSID}...`);
    await this._wifiSSIDCharacteristic.writeValueWithResponse(
      this.textEncoder.encode(wifiSSID)
    );
    this._wifiSSID = this.textDecoder.decode(
      this._wifiSSIDCharacteristic.value
    );
    this._onWifiSSIDUpdate();
    return this._wifiSSID;
  }
  _onWifiSSIDUpdate() {
    this.log(`wifi ssid is ${this._wifiSSID}`);
    this.dispatchEvent({
      type: "wifissid",
      message: { wifiSSID: this._wifiSSID },
    });
  }

  async getWifiPassword() {
    this._assertConnection();

    if (this._wifiPassword !== null) {
      return this._wifiPassword;
    } else {
      const dataView = await this._wifiPasswordCharacteristic.readValue();
      const wifiPassword = this.textDecoder.decode(dataView);
      this._wifiPassword = wifiPassword;
      this._onWifiPasswordUpdate();
      return this._wifiPassword;
    }
  }
  async setWifiPassword(wifiPassword) {
    this._assertConnection();

    this.log(`setting wifi ssid to ${wifiPassword}...`);
    await this._wifiPasswordCharacteristic.writeValueWithResponse(
      this.textEncoder.encode(wifiPassword)
    );
    this._wifiPassword = this.textDecoder.decode(
      this._wifiPasswordCharacteristic.value
    );
    this._onWifiPasswordUpdate();
    return this._wifiPassword;
  }
  _onWifiPasswordUpdate() {
    this.log(`wifi password is ${this._wifiPassword}`);
    this.dispatchEvent({
      type: "wifipassword",
      message: { wifiPassword: this._wifiPassword },
    });
  }

  async isWifiConnected() {
    this._assertConnection();

    if (this._isWifiConnected !== null) {
      return this._isWifiConnected;
    } else {
      const dataView = await this._isWifiConnectedCharacteristic.readValue();
      this._isWifiConnected = Boolean(dataView.getUint8(0));
      this._onWifiIsConnectedUpdate();
      return this._isWifiConnected;
    }
  }
  _onWifiIsConnectedCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._isWifiConnected = Boolean(dataView.getUint8(0));
    this._onWifiIsConnectedUpdate();
  }
  _onWifiIsConnectedUpdate() {
    this.log(
      `wifi is ${this._isWifiConnected ? "connected" : "not connected"}`
    );
    this.dispatchEvent({
      type: "iswificonnected",
      message: { isWifiConnected: this._isWifiConnected },
    });
  }

  async getWifiConnect() {
    this._assertConnection();

    if (this._wifiConnect !== null) {
      return this._wifiConnect;
    } else {
      const dataView = await this._wifiConnectCharacteristic.readValue();
      this._wifiConnect = Boolean(dataView.getUint8(0));
      this._onWifiConnectUpdate();
      return this._wifiConnect;
    }
  }
  async _setWifiConnection(connect) {
    await this._wifiConnectCharacteristic.writeValueWithResponse(
      Uint8Array.of([connect ? 1 : 0])
    );
    this._wifiConnect = Boolean(
      this._wifiConnectCharacteristic.value.getUint8(0)
    );
    this._onWifiConnectUpdate();
    return this._wifiConnect;
  }

  async connectToWifi() {
    return this._setWifiConnection(true);
  }
  async disconnectFromWifi() {
    return this._setWifiConnection(false);
  }
  _onWifiConnectUpdate() {
    this.log(
      `wifi connect is ${this._wifiConnect ? "enabled" : "not enabled"}`
    );
    this.dispatchEvent({
      type: "wificonnect",
      message: { wifiConnect: this._wifiConnect },
    });
  }

  async getWifiIPAddress() {
    this._assertConnection();

    if (this._wifiIPAddress !== null) {
      return this._wifiIPAddress;
    } else {
      const dataView = await this._wifiIPAddressCharacteristic.readValue();
      this._wifiIPAddress = this.textDecoder.decode(dataView);
      this._onWifiIPAddressUpdate();
      return this._wifiIPAddress;
    }
  }
  _onWifiIPAddressCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._wifiIPAddress = this.textDecoder.decode(dataView);
    this._onWifiIPAddressUpdate();
  }
  _onWifiIPAddressUpdate() {
    this.log(`wifi IP Address: ${this._wifiIPAddress}`);
    this.dispatchEvent({
      type: "wifiipaddress",
      message: { wifiIPAddress: this._wifiIPAddress },
    });
  }

  async getWifiMACAddress() {
    this._assertConnection();

    if (this._wifiMACAddress !== null) {
      return this._wifiMACAddress;
    } else {
      const dataView = await this._wifiMACAddressCharacteristic.readValue();
      this._wifiMACAddress = this.textDecoder.decode(dataView);
      this._onWifiMACAddressUpdate();
      return this._wifiMACAddress;
    }
  }
  _onWifiMACAddressCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._wifiMACAddress = this.textDecoder.decode(dataView);
    this._onWifiMACAddressUpdate();
  }
  _onWifiMACAddressUpdate() {
    this.log(`wifi MAC Address: ${this._wifiMACAddress}`);
    this.dispatchEvent({
      type: "wifimacaddress",
      message: { wifiMACAddress: this._wifiMACAddress },
    });
  }

  // FILE TRANSFER
  _maxFileSize = null;
  async getMaxFileSize() {
    this._assertConnection();

    if (this._maxFileSize != null) {
      return this._maxFileSize;
    }

    const maxFileSizeValue = await this._maxFileSizeCharacteristic.readValue();
    this._maxFileSize = maxFileSizeValue.getUint32(0, true);

    this.log("got max file transfer size", this._maxFileSize);
    return this._maxFileSize;
  }

  _fileTransferSize = null;
  async _getFileTransferSize(refresh = false) {
    this._assertConnection();

    if (this._fileTransferSize != null && !refresh) {
      return this._fileTransferSize;
    }

    const fileTransferSizeValue =
      await this._fileTransferSizeCharacteristic.readValue();
    this._fileTransferSize = fileTransferSizeValue.getUint32(0, true);
    this.log("updated file transfer size", this._fileTransferSize);
    return this._fileTransferSize;
  }
  async _assertValidFileTransferSize(fileTransferSize) {
    const maxFileSize = await this.getMaxFileSize();
    if (fileTransferSize > maxFileSize) {
      throw `File size is too big: ${fileTransferSize} bytes but max is ${maxFileSize}`;
    }
  }
  async _setFileTransferSize(newFileTransferSize) {
    this._assertConnection();

    this.log(`setting file transfer size to ${newFileTransferSize} bytes...`);

    this._assertValidFileTransferSize(newFileTransferSize);

    await this._fileTransferSizeCharacteristic.writeValueWithResponse(
      Uint32Array.from([newFileTransferSize])
    );
    this._fileTransferSize =
      this._fileTransferSizeCharacteristic.value.getUint32(0, true);

    return this._fileTransferSize;
  }

  _maxFileTransferFilePathLength = null;
  async getMaxFileTransferFilePathLength() {
    this._assertConnection();

    if (this._maxFileTransferFilePathLength != null) {
      return this._maxFileTransferFilePathLength;
    }

    const maxFileTransferFilePathLengthValue =
      await this._maxFileTransferFilePathLengthCharacteristic.readValue();
    this._maxFileTransferFilePathLength =
      maxFileTransferFilePathLengthValue.getUint8(0);

    this.log(
      "got max file transfer filePath length",
      this._maxFileTransferFilePathLength
    );
    return this._maxFileTransferFilePathLength;
  }

  _fileTransferFilePath = null;
  async _getFileTransferFilePath(refresh = false) {
    this._assertConnection();

    if (this._fileTransferFilePath != null && !refresh) {
      return this._fileTransferFilePath;
    }

    const fileTransferFilePathValue =
      await this._fileTransferFilePathCharacteristic.readValue();
    this._fileTransferFilePath = this.textDecoder.decode(
      fileTransferFilePathValue
    );
    return this._fileTransferFilePath;
  }
  async _assertValidFileTransferFilePath(filePath) {
    const maxFilePathLength = await this.getMaxFileTransferFilePathLength();
    if (filePath.length > maxFilePathLength) {
      throw `FilePath "${filePath}" is too long: max is ${maxFileSize} characters`;
    }
  }
  async _setFileTransferFilePath(newFilePath) {
    this._assertConnection();

    this.log(`setting file transfer filePath to "${newFilePath}"...`);

    this._assertValidFileTransferFilePath(newFilePath);

    await this._fileTransferFilePathCharacteristic.writeValueWithResponse(
      this.textEncoder.encode(newFilePath)
    );
    this._fileTransferFilePath = this.textDecoder.decode(
      this._fileTransferFilePathCharacteristic.value
    );

    return this._fileTransferFilePath;
  }

  async _assertFileTransferCommand(command) {
    if (!this.isValidFileTransferCommand(command)) {
      throw `invalid file transfer command ${command}`;
    }
  }
  async _setFileTransferCommand(command) {
    this._assertConnection();

    this.log(`setting file transfer command to ${command}...`);

    this._assertFileTransferCommand(command);

    const fileTransferStatus = await this.getFileTransferStatus();
    if (fileTransferStatus !== this.FILE_TRANSFER_STATUSES.IDLE) {
      throw "already transfefring file";
    }

    await this._fileTransferCommandCharacteristic.writeValueWithResponse(
      Uint8Array.from([command])
    );
  }

  async cancelFileTransfer() {
    return this._setFileTransferCommand(
      this.FILE_TRANSFER_COMMANDS.CANCEL_FILE_TRANSFER
    );
  }

  _fileTransferStatus = null;
  async getFileTransferStatus() {
    this._assertConnection();

    if (this._fileTransferStatus != null) {
      return this._fileTransferStatus;
    }

    const fileTransferStatusValue =
      await this._fileTransferStatusCharacteristic.readValue();
    this._fileTransferStatus = fileTransferStatusValue.getUint8(0);
    this._onFileTransferStatusUpdate();
    return this._fileTransferStatus;
  }
  _onFileTransferStatusCharacteristicValueChanged(event) {
    this._fileTransferStatus = event.target.value.getUint8(0);
    this._onFileTransferStatusUpdate();
  }
  async _assertFileTransferStatusIsIdle() {
    const status = await this.getFileTransferStatus();
    if (status !== missionDevice.FILE_TRANSFER_STATUSES.IDLE) {
      throw "file transfer service is busy";
    }
  }

  async sendFile(file, filePath) {
    this.log("transferring file", file);
    this._assertFileTransferStatusIsIdle();
    const fileBuffer = await this._getFileBuffer(file);

    await this._setFileTransferSize(fileBuffer.byteLength);
    await this._setFileTransferFilePath(filePath);

    const commandArray = Uint8Array.of(
      this.FILE_TRANSFER_COMMANDS.START_FILE_SEND
    );
    await this._fileTransferCommandCharacteristic.writeValueWithResponse(
      commandArray
    );

    return this._sendFileBlock(fileBuffer, 0);
  }

  _maxBlockLength = 512;
  async _sendFileBlock(fileContents, bytesAlreadySent) {
    let bytesRemaining = fileContents.byteLength - bytesAlreadySent;

    const maxBlockLength = this._maxBlockLength;
    const blockLength = Math.min(bytesRemaining, maxBlockLength);
    const blockView = new Uint8Array(
      fileContents,
      bytesAlreadySent,
      blockLength
    );

    try {
      await this._fileTransferDataCharacteristic.writeValueWithResponse(
        blockView
      );
      bytesRemaining -= blockLength;
      this.log(`File block written - ${bytesRemaining} bytes remaining`);
      bytesAlreadySent += blockLength;
      const progress = bytesAlreadySent / fileContents.byteLength;
      this.dispatchEvent({
        type: "filetransferprogress",
        message: { progress, type: "send" },
      });

      if (
        bytesRemaining > 0 &&
        this._fileTransferStatus == this.FILE_TRANSFER_STATUSES.SENDING_FILE
      ) {
        return this._sendFileBlock(fileContents, bytesAlreadySent);
      } else {
        this.log("successfully written file");
        this.dispatchEvent({
          type: "filetransfercomplete",
          message: { type: "send" },
        });
      }
    } catch (error) {
      console.error(error);
      this.log(`File block write error with ${bytesRemaining} bytes remaining`);
    }
  }

  _receivedFileTransferArray = null;
  async receiveFile(filePath) {
    this.log("requesting file", filePath);
    this._assertFileTransferStatusIsIdle();
    await this._setFileTransferFilePath(filePath);

    const commandArray = Uint8Array.of(
      this.FILE_TRANSFER_COMMANDS.START_FILE_RECEIVE
    );
    await this._fileTransferCommandCharacteristic.writeValueWithResponse(
      commandArray
    );

    this._receivedFileTransferArray = null;

    const fileSize = await this._getFileTransferSize(true);

    if (fileSize > 0) {
      return new Promise((resolve) => {
        this.addEventListener(
          "filetransfercomplete",
          (event) => resolve(event),
          { once: true }
        );
      });
    } else {
      throw { error: "file doesn't exist", filePath };
    }
  }

  async _onFileTransferDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.log("received file data", dataView);
    this._receivedFileTransferArray = this._concatenateArrayBuffers(
      this._receivedFileTransferArray,
      dataView
    );
    this.log(
      "received file length",
      this._receivedFileTransferArray.byteLength
    );
    const fileTransferSize = await this._getFileTransferSize();
    const progress =
      this._receivedFileTransferArray.byteLength / fileTransferSize;
    this.log("filetransferprogress", progress);
    this.dispatchEvent({
      type: "filetransferprogress",
      message: { progress, type: "receive" },
    });

    if (this._receivedFileTransferArray.byteLength == fileTransferSize) {
      this.log("finished receiving file data!");
      const filePath = await this._getFileTransferFilePath();
      const filename = filePath.split("/").pop();
      const file = new File([this._receivedFileTransferArray], filename);
      this.dispatchEvent({
        type: "filetransfercomplete",
        message: { file, type: "receive" },
      });
    }
  }

  async removeFile(filePath) {
    this.log("removing file", filePath);
    this._assertFileTransferStatusIsIdle();
    await this._setFileTransferFilePath(filePath);

    const commandArray = Uint8Array.of(this.FILE_TRANSFER_COMMANDS.REMOVE_FILE);
    await this._fileTransferCommandCharacteristic.writeValueWithResponse(
      commandArray
    );

    return new Promise((resolve) => {
      const eventListener = ((event) => {
        if (
          event.message.filetransferstatus == this.FILE_TRANSFER_STATUSES.IDLE
        ) {
          this.removeEventListener("filetransferstatus", eventListener);
          this.dispatchEvent({
            type: "fileremovecomplete",
            message: { filePath },
          });
          resolve();
        }
      }).bind(this);
      this.addEventListener("filetransferstatus", eventListener);
    });
  }

  async formatFilesystem() {
    this.log("formatting filesystem");
    this._assertFileTransferStatusIsIdle();

    const commandArray = Uint8Array.of(
      this.FILE_TRANSFER_COMMANDS.FORMAT_FILESYSTEM
    );
    await this._fileTransferCommandCharacteristic.writeValueWithResponse(
      commandArray
    );

    return new Promise((resolve) => {
      const eventListener = ((event) => {
        if (
          event.message.filetransferstatus == this.FILE_TRANSFER_STATUSES.IDLE
        ) {
          this.removeEventListener("filetransferstatus", eventListener);
          this.dispatchEvent({
            type: "fileformatcomplete",
            message: { filePath },
          });
          resolve();
        }
      }).bind(this);
      this.addEventListener("filetransferstatus", eventListener);
    });
  }

  // FIRMWARE UPDATE
  async getFirmwareVersion() {
    const firmwareVersionValue =
      await this._firmwareVersionCharacteristic.readValue();
    const firmwareVersion = this.textDecoder.decode(firmwareVersionValue);
    return firmwareVersion;
  }
  async getMaxFirmwareSize() {
    const maxFirmwareSizeValue =
      await this._maxFirmwareSizeCharacteristic.readValue();
    const maxFirmwareSize = maxFirmwareSizeValue.getUint32(0, true);
    return maxFirmwareSize;
  }

  async updateFirmware(file) {
    let fileBuffer = await this._getFileBuffer(file);
    if (!fileBuffer) {
      return;
    }

    const maxFirmwareSize = await this.getMaxFirmwareSize();

    if (fileBuffer.byteLength > maxFirmwareSize) {
      this.log(
        `File length is too long: ${fileBuffer.byteLength} bytes but maximum is ${maximumFileLength}`
      );
      return;
    }

    this.log("transferring firmware", fileBuffer);

    return this.sendFirmwareBlock(fileBuffer, 0);
  }

  async sendFirmwareBlock(fileContents, bytesAlreadySent) {
    let bytesRemaining = fileContents.byteLength - bytesAlreadySent;

    const maxBlockLength = this._maxBlockLength;
    const blockLength = Math.min(bytesRemaining, maxBlockLength);
    const blockView = new Uint8Array(
      fileContents,
      bytesAlreadySent,
      blockLength
    );

    try {
      await this.firmwareDataCharacteristic.writeValueWithResponse(blockView);
      bytesRemaining -= blockLength;
      this.log(`firmware block written - ${bytesRemaining} bytes remaining`);
      bytesAlreadySent += blockLength;
      const progress = bytesAlreadySent / fileContents.byteLength;
      this.dispatchEvent({
        type: "firmwareupdateprogress",
        message: { progress },
      });

      if (bytesRemaining > 0) {
        return this.sendFirmwareBlock(fileContents, bytesAlreadySent);
      } else {
        this.log("successfully updated firmware");
        this.dispatchEvent({
          type: "firmwareupdatecomplete",
        });
      }
    } catch (error) {
      console.error(error);
      this.log(
        `firmware block write error with ${bytesRemaining} bytes remaining`
      );
    }
  }

  // STEPS
  _isStepTrackingEnabled = null;
  async isStepTrackingEnabled() {
    this._assertConnection();

    if (this._isStepTrackingEnabled != null) {
      return this._isStepTrackingEnabled;
    }

    const isStepTrackingEnabledValue =
      await this._isStepTrackingEnabledCharacteristic.readValue();
    this._isStepTrackingEnabled = Boolean(
      isStepTrackingEnabledValue.getUint8(0)
    );

    this.log("is step tracking enabled?", this._isStepTrackingEnabled);
    return this._isStepTrackingEnabled;
  }
  async setStepTrackingEnabled(enabled) {
    this._assertConnection();

    this.log("setting step tracking", enabled);

    await this._isStepTrackingEnabledCharacteristic.writeValueWithResponse(
      Uint8Array.of([enabled ? 1 : 0])
    );
    this._isStepTrackingEnabled = Boolean(
      this._isStepTrackingEnabledCharacteristic.value.getUint8(0)
    );

    return this._isStepTrackingEnabled;
  }
  async enableStepTracking() {
    return this.setStepTrakingEnabled(true);
  }
  async disableStepTracking() {
    return this.setStepTrakingEnabled(false);
  }
  _stepTrackingMassThreshold = null;
  async getStepTrackingMassThreshold() {
    this._assertConnection();

    if (this._stepTrackingMassThreshold != null) {
      return this._stepTrackingMassThreshold;
    }

    const stepTrackingMassThresholdValue =
      await this._stepTrackingMassThresholdCharacteristic.readValue();
    this._stepTrackingMassThreshold = stepTrackingMassThresholdValue.getFloat32(
      0,
      true
    );

    this.log("step tracking mass threshold", this._stepTrackingMassThreshold);
    return this._stepTrackingMassThreshold;
  }
  async setStepTrackingMassThreshold(massThreshold) {
    this._assertConnection();

    this.log("setting step tracking mass threshold", massThreshold);

    await this._stepTrackingMassThresholdCharacteristic.writeValueWithResponse(
      Float32Array.of([massThreshold])
    );
    this._stepTrackingMassThreshold =
      this._stepTrackingMassThresholdCharacteristic.value.getFloat32(0, true);

    return this._isStepTrackingEnabled;
  }
  _stepData = null;
  async getSteps() {
    this._assertConnection();

    if (this._stepData != null) {
      return this._stepData;
    }

    const stepDataValue = await this._stepDataCharacteristic.readValue();
    this._stepData = stepDataValue.getUint32(0, true);

    this.log("steps", this._stepData);
    return this._stepData;
  }
  async setSteps(steps) {
    this._assertConnection();

    this.log("setting steps", steps);

    await this._stepDataCharacteristic.writeValueWithResponse(
      Uint32Array.of([steps])
    );
    this._stepData = this._stepDataCharacteristic.value.getUint32(0, true);

    return this._stepData;
  }
  _onStepDataCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this._stepData = dataView.getUint32(0, true);
    this.dispatchEvent({
      type: "steps",
      message: { steps: this._stepData },
    });
  }

  // VIBRATION
  async _vibrate(array) {
    await this._hapticsVibrationCharacteristic.writeValue(
      Uint8Array.from(array)
    );
  }
}

class BluetoothMissions extends BaseMissions {
  static get MissionDevice() {
    return BluetoothMissionDevice;
  }
}
