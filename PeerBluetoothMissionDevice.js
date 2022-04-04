/* global THREE, BluetoothMissionDevice */

class PeerBluetoothMissionDevice extends BluetoothMissionDevice {
  GENERATE_UUID(characteristicIndex) {
    return super.GENERATE_UUID(`90${this._index}${characteristicIndex}`);
  }

  log() {
    super.log(`[peer #${this._index}]`, ...arguments);
  }
  
  disableSensorsBeforeUnload = false;
  
  async init(index, service) {
    this._index = index;
    this._service = service;

    // NAME
    this.log("getting name characteristic...");
    this._nameCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID(0)
    );
    this.log("got name characterstic!");

    this.log("getting name value...");
    await this.getName();
    this.log("got name value!");

    // CONNECT
    this.log("getting connect characteristic...");
    this._connectCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID(1)
    );
    this.log("got connect characterstic!");

    this.log("getting connect value...");
    await this._getConnect();
    this.log("got connect value!");
    
    // TYPE
    this.log("getting type characteristic...");
    this._typeCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID(3)
    );
    this.log("got type characteristic!");

    // IS_CONNECTED
    this.log("getting isConnected characteristic...");
    this._isConnectedCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID(2)
    );
    this.log("got isConnected characterstic!");

    this.log("getting isConnected value...");
    await this._isConnected();
    this.log("got isConnected value!");
    this._isConnectedCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onIsConnectedCharacteristicValueChanged.bind(this)
    );
    this.log("starting isConnected notifications...");
    await this._isConnectedCharacteristic.startNotifications();
    this.log("started isConnected notifications!");

    // SENSOR DATA CONFIGURATION
    this.log("getting sensor data configuration characteristic...");
    this._sensorDataConfigurationCharacteristic =
      await this._service.getCharacteristic(this.GENERATE_UUID(4));
    this.log("got sensor data configuration characteristic!");

    this.log("getting sensor data configuration...");
    await this.getSensorDataConfigurations();
    this.log("got sensor data configuration!");

    // SENSOR DATA
    this.log("getting sensor data characteristic...");
    this._sensorDataCharacteristic = await this._service.getCharacteristic(
      this.GENERATE_UUID(5)
    );
    this.log("got sensor data characteristic!");

    this._sensorDataCharacteristic.addEventListener(
      "characteristicvaluechanged",
      this._onSensorDataCharacteristicValueChanged.bind(this)
    );
    this.log("starting sensor data notifications...");
    await this._sensorDataCharacteristic.startNotifications();
    this.log("started sensor data notifications!");

    this.log("finished connections!");
  }

  _assertConnection() {
    return this._service;
  }

  _connect = null;
  __isConnected = null;
  async _getConnect() {
    this._assertConnection();

    if (this._connect !== null) {
      return this._connect;
    } else {
      const dataView = await this._connectCharacteristic.readValue();
      this._connect = Boolean(dataView.getUint8(0));
      this._onConnectUpdate();
      return this._connect;
    }
  }
  async _setConnect(connect) {
    await this._connectCharacteristic.writeValueWithResponse(
      Uint8Array.of([connect ? 1 : 0])
    );
    this._connect = Boolean(this._connectCharacteristic.value.getUint8(0));
    this._onConnectUpdate();
    return this._connect;
  }

  async connect() {
    return this._setConnect(true);
  }
  async disconnect() {
    return this._setConnect(false);
  }
  _onConnectUpdate() {
    this.log(`connect is ${this._connect ? "enabled" : "disabled"}`);
    this.dispatchEvent({
      type: "connect",
      message: { connect: this._connect },
    });
  }

  async _isConnected() {
    this._assertConnection();

    if (this.__isConnected !== null) {
      return this.__isConnected;
    } else {
      const dataView = await this._isConnectedCharacteristic.readValue();
      this.__isConnected = Boolean(dataView.getUint8(0));
      await this._onIsConnectedUpdate();
      return this.__isConnected;
    }
  }
  _onIsConnectedCharacteristicValueChanged(event) {
    const dataView = event.target.value;
    this.__isConnected = Boolean(dataView.getUint8(0));
    this._onIsConnectedUpdate();
  }
  async _onIsConnectedUpdate() {
    this.log(`${this.__isConnected ? "connected" : "not connected"}`);
    if (this.__isConnected) {
      await this.getType();
    }
    this.dispatchEvent({
      type: "isConnected",
      message: { isConnected: this.__isConnected },
    });
    this.dispatchEvent({
      type: this.__isConnected ? "connected" : "disconnected",
    });
  }
}
