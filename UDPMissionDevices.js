/* global THREE, BaseMission, WebSocketMissionDevice */

class UDPMissionDevice extends WebSocketMissionDevice {
  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(
        `[${this.constructor.name} #${this.index}]`,
        ...arguments
      );
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  _isConnected = false;
  constructor(index, udpMissionDevices) {
    super();
    this.udpMissionDevices = udpMissionDevices;
    this.index = index;
  }
  get isConnected() {
    return true;
  }
  get _webSocket() {
    return this.udpMissionDevices._webSocket;
  }
  send() {
    this.udpMissionDevices.send();
  }

  async connect() {
    this.log("not valid for updMissionDevices");
  }

  async checkConnection() {
    if (!this._name) {
      return;
    }

    const sensorDataConfigurations = this._sensorDataConfigurations;
    const lastTimeReceivedSensorData = this._lastTimeReceivedSensorData;
    if (sensorDataConfigurations) {
      let hasAtLeastOneNonzeroConfig = false;
      for (const sensorType in sensorDataConfigurations) {
        for (const sensorDataType in sensorDataConfigurations[sensorType]) {
          hasAtLeastOneNonzeroConfig =
            sensorDataConfigurations[sensorType][sensorDataType] > 0;
          if (hasAtLeastOneNonzeroConfig) break;
        }
        if (hasAtLeastOneNonzeroConfig) break;
      }
      if (hasAtLeastOneNonzeroConfig) {
        const now = Date.now();
        const shouldRetry = now - this._lastTimeReceivedSensorData > 2000;
        if (shouldRetry) {
          this.log("retrying sensor data...", this, sensorDataConfigurations);
          this.setSensorDataConfigurations(sensorDataConfigurations);
        }
      }
    }
  }

  async setSensorDataConfigurations(sensorDataConfigurations) {
    this._sensorDataConfigurations = sensorDataConfigurations;
    super.setSensorDataConfigurations(...arguments);
  }
}

Object.assign(UDPMissionDevice, {
  MessageTypeStrings: [
    "PING",

    "BATTERY_LEVEL",

    "GET_TYPE",
    "SET_TYPE",

    "GET_NAME",
    "SET_NAME",

    "MOTION_CALIBRATION",

    "GET_SENSOR_DATA_CONFIGURATIONS",
    "SET_SENSOR_DATA_CONFIGURATIONS",

    "SENSOR_DATA",
    
    "VIBRATION"
  ],
});

["MessageType"].forEach((name) => {
  UDPMissionDevice[name + "s"] = UDPMissionDevice[name + "Strings"].reduce(
    (object, name, index) => {
      object[name] = index;
      return object;
    },
    {}
  );
});

class UDPMissionDevices extends THREE.EventDispatcher {
  _assertConnection() {
    if (!this.isConnected) {
      throw "Not connected";
    }
  }

  get MessageTypes() {
    return this.constructor.MessageTypes;
  }
  get MessageTypeStrings() {
    return this.constructor.MessageTypeStrings;
  }

  constructor() {
    super();
    this.isLoggingEnabled = !true;
    this._reconnectOnDisconnection = true;
    this.devices = [];
    this._messageMap = new Map();

    this.checkDeviceConnections = this._checkDeviceConnections.bind(this);
    this.addEventListener("connected", (event) => {
      this._checkDeviceConnectionsIntervalId = window.setInterval(
        this.checkDeviceConnections,
        3000
      );
    });
    this.addEventListener("disconnected", (event) => {
      window.clearInterval(this._checkDeviceConnectionsIntervalId);
    });
  }
  log() {
    if (this.isLoggingEnabled) {
      console.groupCollapsed(`[${this.constructor.name}]`, ...arguments);
      console.trace(); // hidden in collapsed group
      console.groupEnd();
    }
  }

  async _checkDeviceConnections() {
    this.devices.forEach((device) => {
      device.checkConnection();
    });
  }

  get isConnected() {
    return (
      this._webSocket && this._webSocket.readyState == this._webSocket.OPEN
    );
  }
  async connect(ipAddress) {
    this._ipAddress = ipAddress;
    const gateway = `wss://${ipAddress}:8080/ws`;
    this._gateway = gateway;
    this.log("attempting to connect...");
    if (this.isConnected) {
      this.log("already connected");
      return;
    }

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

    return new Promise((resolve) => {
      this.addEventListener(
        "connected",
        async (event) => {
          resolve();
        },
        { once: true }
      );
    });
  }

  async _onWebSocketOpen(event) {
    this.dispatchEvent({ type: "connected", message: { event } });
  }
  _onWebSocketClose(event) {
    this.log("websocket closed");
    this.dispatchEvent({ type: "disconnected", message: { event } });
    if (this._reconnectOnDisconnection) {
      window.setTimeout(async () => {
        await this.connect(this._ipAddress);
      }, 3000);
    }
  }
  async _onWebSocketMessage(event) {
    const arrayBuffer = await event.data.arrayBuffer();
    this.dispatchEvent({ type: "websocketmessage", message: { event } });
    this._parseWebSocketMessage(arrayBuffer);
  }
  _parseWebSocketMessage(arrayBuffer) {
    this.log("message received", Array.from(new Uint8Array(arrayBuffer)));

    const dataView = new DataView(arrayBuffer);
    let byteOffset = 0;

    while (byteOffset < dataView.byteLength) {
      const messageType = dataView.getUint8(byteOffset++);
      const messageTypeString = this.MessageTypeStrings[messageType];
      this.log(`message type: ${messageTypeString}`);
      switch (messageType) {
        case this.MessageTypes.NUMBER_OF_DEVICES:
          {
            const numberOfDevices = dataView.getUint8(byteOffset++);
            this.numberOfDevices = numberOfDevices;
            this._onNumberOfDevices();
          }
          break;
        case this.MessageTypes.DEVICE_MESSAGE:
          {
            const deviceIndex = dataView.getUint8(byteOffset++);
            const byteLength = dataView.getUint8(byteOffset++);
            const device = this.devices[deviceIndex];
            if (device) {
              device._parseWebSocketMessage(
                dataView.buffer.slice(byteOffset, byteOffset + byteLength)
              );
            }
            byteOffset += byteLength;
          }
          break;
        default:
          this.log(`uncaught message type #${messageType}`);
          byteOffset = dataView.byteLength;
          break;
      }
    }
  }

  _onNumberOfDevices() {
    this.log(`number of devices: ${this.numberOfDevices}`);
    for (let index = 0; index < this.numberOfDevices; index++) {
      this.devices.push(new UDPMissionDevice(index, this));
    }
    this.dispatchEvent({
      type: "numberofdevices",
      numberOfDevices: this.numberOfDevices,
    });

    this._messageMap.set(this.MessageTypes.DEVICE_INFORMATION);

    this.send();
  }

  send() {
    this._assertConnection();
    const contatenatedMessages = this._concatenateArrayBuffers(
      this._flattenMessageData()
    );
    this._sendWebSocketMessage(contatenatedMessages);
  }
  _sendWebSocketMessage(message) {
    if (message.byteLength > 0) {
      this.log("sending message", Array.from(new Uint8Array(message)));
      this._webSocket.send(message);
    }
  }
  _flattenMessageData() {
    const arrayBuffers = [];

    this._messageMap.forEach((datum, key) => {
      arrayBuffers.push(Uint8Array.from([key]));
      const flattenedDatum = this._flattenMessageDatum(datum);
      arrayBuffers.push(flattenedDatum);
    });
    this._messageMap.clear();

    const devicesData = [];
    this.devices.forEach((device) => {
      const flattenedData = device._flattenMessageData();
      if (flattenedData.byteLength > 0) {
        devicesData.push([device.index]);
        devicesData.push([flattenedData.byteLength]);
        devicesData.push(flattenedData);
      }
    });
    if (devicesData.length) {
      arrayBuffers.push([this.MessageTypes.DEVICE_MESSAGE]);
      arrayBuffers.push(...devicesData);
    }

    const flattenedData = this._concatenateArrayBuffers(...arrayBuffers);
    return flattenedData;
  }
}

['_concatenateArrayBuffers', '_flattenMessageDatum'].forEach(methodName => {
  UDPMissionDevices.prototype[methodName] = BaseMission.prototype[methodName]
})

Object.assign(UDPMissionDevices, {
  MessageTypeStrings: [
    "NUMBER_OF_DEVICES",
    "DEVICE_INFORMATION",
    "DEVICE_MESSAGE",
  ],
});

["MessageType"].forEach((name) => {
  UDPMissionDevices[name + "s"] = UDPMissionDevices[name + "Strings"].reduce(
    (object, name, index) => {
      object[name] = index;
      return object;
    },
    {}
  );
});
