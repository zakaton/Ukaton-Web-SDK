/* global THREE, BaseMission, BaseMissions */

class WebSocketMissionDevice extends BaseMission {
  get MessageTypes() {
    return this.constructor.MessageTypes;
  }
  get MessageTypeStrings() {
    return this.constructor.MessageTypeStrings;
  }

  _messageMap = new Map();
  _messagePromiseMap = new Map();

  get isConnected() {
    return (
      this._webSocket && this._webSocket.readyState == this._webSocket.OPEN
    );
  }
  async connect(ipAddress) {
    this._ipAddress = ipAddress;
    const gateway = `ws://${ipAddress}/ws`;
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
    const promises = [
      this.getType(false),
      this.getFirmwareVersion(false),
      this.getName(false),
      this.getSensorDataConfigurations(false),
      this.getBatteryLevel(false),
    ];
    this.log("sending initial payload...");
    this.send();
    this.log("sent initial payload!");
    this._sentInitialMessage = true;
    await Promise.all(promises);
    this.log("received initial payload!");
    this.dispatchEvent({ type: "connected", message: { event } });
  }
  _onWebSocketClose(event) {
    this.log("websocket closed");
    this.dispatchEvent({ type: "disconnected", message: { event } });
    this._bleGenericPeers.forEach((bleGenericPeer) => {
      bleGenericPeer.isConnected = false;
      bleGenericPeer.dispatchEvent({
        type: "isConnected",
        message: { isConnected: bleGenericPeer.isConnected },
      });
    });
    if (this._reconnectOnDisconnection) {
      window.setTimeout(async () => {
        await this.connect(this._ipAddress);
      }, 3000);
    }
  }
  async _onWebSocketMessage(event) {
    if (!this._sentInitialMessage) {
      this.log("received message without sending initial payload");
      return;
    }
    this.dispatchEvent({ type: "websocketmessage", message: { event } });

    const arrayBuffer = await event.data.arrayBuffer();
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
        case this.MessageTypes.GET_NAME:
        case this.MessageTypes.SET_NAME:
          {
            const nameLength = dataView.getUint8(byteOffset++);
            this._name = this.textDecoder.decode(
              dataView.buffer.slice(byteOffset, byteOffset + nameLength)
            );
            byteOffset += nameLength;
            this._onNameUpdate();
          }
          break;
        case this.MessageTypes.GET_TYPE:
        case this.MessageTypes.SET_TYPE:
          this._type = dataView.getUint8(byteOffset++);
          this._onTypeUpdate();
          break;
        case this.MessageTypes.MOTION_CALIBRATION:
          byteOffset = this._parseMotionCalibration(dataView, byteOffset);
          break;
        case this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS:
        case this.MessageTypes.SET_SENSOR_DATA_CONFIGURATIONS:
          byteOffset = this._parseSensorDataConfigurations(
            dataView,
            byteOffset
          );
          break;
        case this.MessageTypes.SENSOR_DATA:
          byteOffset = this._parseSensorData(dataView, byteOffset);
          break;
        case this.MessageTypes.GET_WEIGHT_DATA_DELAY:
        case this.MessageTypes.SET_WEIGHT_DATA_DELAY:
          this._weightDataDelay = dataView.getUint16(byteOffset, true);
          byteOffset += 2;
          this._onWeightDataDelayUpdate();
          break;
        case this.MessageTypes.WEIGHT_DATA:
          this._weight = dataView.getFloat32(byteOffset, true);
          byteOffset += 4;
          this._onWeightDataUpdate();
          break;
        case this.MessageTypes.BATTERY_LEVEL:
          byteOffset = this._parseBatteryLevel(dataView, byteOffset);
          break;
        case this.MessageTypes.SEND_FILE:
          {
            const filePathLength = dataView.getUint8(byteOffset++);
            const filePath = this.textDecoder.decode(
              dataView.buffer.slice(byteOffset, byteOffset + filePathLength)
            );
            byteOffset += filePathLength;
            this.log(`sent file ${filePath}!`);
          }
          break;
        case this.MessageTypes.RECEIVE_FILE:
          byteOffset = this._parseFile(dataView, byteOffset);
          break;
        case this.MessageTypes.REMOVE_FILE:
          {
            const filePathLength = dataView.getUint8(byteOffset++);
            const filePath = this.textDecoder.decode(
              dataView.buffer.slice(byteOffset, byteOffset + filePathLength)
            );
            byteOffset += filePathLength;
            this.log(`removed file ${filePath}`);
            this.dispatchEvent({
              type: "removefile",
              message: { filePath },
            });
          }
          break;
        case this.MessageTypes.FORMAT_FILESYSTEM:
          this.log("formatted filesystem");
          this.dispatchEvent({
            type: "formatfilesystem",
          });
          break;
        case this.MessageTypes.GET_FIRMWARE_VERSION:
          {
            const firmwareVersionLength = dataView.getUint8(byteOffset++);
            this._firmwareVersion = this.textDecoder.decode(
              dataView.buffer.slice(
                byteOffset,
                byteOffset + firmwareVersionLength
              )
            );
            byteOffset += firmwareVersionLength;
            this.dispatchEvent({
              type: "firmwareVersion",
              message: { firmwareVersion: this._firmwareVersion },
            });
          }
          break;
        case this.MessageTypes.BLE_GENERIC_PEER:
          {
            const bleGenericPeersDataLength = dataView.getUint8(byteOffset++);
            this._parseBLEGenericPeersMessage(
              new DataView(
                dataView.buffer.slice(
                  byteOffset,
                  byteOffset + bleGenericPeersDataLength
                )
              )
            );
            byteOffset += bleGenericPeersDataLength;
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

  _sendWebSocketMessage(message) {
    if (message.byteLength > 0) {
      this.log("sending message", Array.from(new Uint8Array(message)));
      this._webSocket.send(message);
    }
  }
  send() {
    this._assertConnection();
    const contatenatedMessages = this._concatenateArrayBuffers(
      this._flattenMessageData()
    );
    this._sendWebSocketMessage(contatenatedMessages);
  }
  _flattenMessageData() {
    const arrayBuffers = [];
    this._messageMap.forEach((datum, key) => {
      arrayBuffers.push(Uint8Array.from([key]));
      const flattenedDatum = this._flattenMessageDatum(datum);
      arrayBuffers.push(flattenedDatum);
    });

    const bleGenericPeersArrayBuffers = [];
    let bleGenericPeersArrayBufferSize = 0;
    this._bleGenericPeers.forEach((bleGenericPeer, bleGenericPeerIndex) => {
      const bleGenericPeerArrayBuffers = [];
      let bleGenericPeerArrayBufferSize = 0;

      bleGenericPeer._messageMap.forEach((datum, key) => {
        bleGenericPeerArrayBuffers.push(Uint8Array.from([key]));
        bleGenericPeerArrayBufferSize++;
        const flattenedDatum = this._flattenMessageDatum(datum);
        bleGenericPeerArrayBufferSize += flattenedDatum.byteLength;
        bleGenericPeerArrayBuffers.push(flattenedDatum);
      });
      bleGenericPeer._messageMap.clear();
      if (bleGenericPeerArrayBufferSize > 0) {
        bleGenericPeerArrayBuffers.unshift(
          Uint8Array.from([bleGenericPeerIndex, bleGenericPeerArrayBufferSize])
        );
        bleGenericPeersArrayBuffers.push(...bleGenericPeerArrayBuffers);
      }
      bleGenericPeersArrayBufferSize += bleGenericPeerArrayBufferSize;
    });
    if (bleGenericPeersArrayBufferSize > 0) {
      bleGenericPeersArrayBuffers.unshift(
        Uint8Array.from([
          this.MessageTypes.BLE_GENERIC_PEER,
          bleGenericPeersArrayBufferSize,
        ])
      );
      arrayBuffers.push(...bleGenericPeersArrayBuffers);
    }

    const flattenedData = this._concatenateArrayBuffers(...arrayBuffers);
    this._messageMap.clear();
    return flattenedData;
  }

  async _waitForResponse(eventString, promiseTypeToDelete) {
    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        eventString,
        (event) => {
          const { error, message } = event;
          if (error) {
            reject(error);
          } else {
            resolve(message[eventString]);
          }

          if (promiseTypeToDelete != undefined) {
            this._messagePromiseMap.delete(promiseTypeToDelete);
          }
        },
        { once: true }
      );
    });
    return promise;
  }

  // TYPE
  async getType(sendImmediately = true) {
    this._assertConnection();

    if (this._type !== null) {
      return this._type;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.GET_TYPE)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_TYPE);
      } else {
        const promise = this._waitForResponse(
          "type",
          this.MessageTypes.GET_TYPE
        );

        this._messageMap.set(this.MessageTypes.GET_TYPE);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.GET_TYPE, promise);
        return promise;
      }
    }
  }
  async setType(newType, sendImmediately = true) {
    this._assertConnection();

    this.log(`setting type to ${newType}...`);

    if (!this.isValidType(newType)) {
      throw `invalid type ${newType}`;
    }
    if (isNaN(newType)) {
      throw `type "${newType}" is not a number!`;
    }
    newType = Number(newType);

    const promise = this._waitForResponse("type");

    this._messageMap.delete(this.MessageTypes.GET_TYPE);
    this._messageMap.set(this.MessageTypes.SET_TYPE, newType);
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }

  // BATTERY
  async getBatteryLevel(sendImmediately = true) {
    this._assertConnection();

    if (this._batteryLevel !== null) {
      return this._batteryLevel;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.BATTERY_LEVEL)) {
        return this._messagePromiseMap.get(this.MessageTypes.BATTERY_LEVEL);
      } else {
        const promise = this._waitForResponse(
          "batteryLevel",
          this.MessageTypes.BATTERY_LEVEL
        );

        this._messageMap.set(this.MessageTypes.BATTERY_LEVEL);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.BATTERY_LEVEL, promise);
        return promise;
      }
    }
  }

  // NAME
  async getName(sendImmediately = true) {
    this._assertConnection();

    if (this._name !== null) {
      return this._name;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.GET_NAME)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_NAME);
      } else {
        const promise = this._waitForResponse(
          "name",
          this.MessageTypes.GET_NAME
        );

        this._messageMap.set(this.MessageTypes.GET_NAME);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.GET_NAME, promise);
        return promise;
      }
    }
  }
  async setName(newName, sendImmediately = true) {
    this._assertConnection();

    newName = newName.substr(0, 30);

    const promise = this._waitForResponse("name");

    this._messageMap.delete(this.MessageTypes.GET_NAME);
    this._messageMap.set(this.MessageTypes.SET_NAME, newName);
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }

  // SENSOR DATA CONFIGURATION
  async getSensorDataConfigurations(sendImmediately = true) {
    this._assertConnection();

    if (this._sensorDataConfigurations !== null) {
      return this._sensorDataConfigurations;
    } else {
      if (
        this._messagePromiseMap.has(
          this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS
        )
      ) {
        return this._messagePromiseMap.get(
          this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS
        );
      } else {
        const promise = this._waitForResponse(
          "sensorDataConfigurations",
          this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS
        );

        this._messageMap.set(this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(
          this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS,
          promise
        );
        return promise;
      }
    }
  }
  async setSensorDataConfigurations(
    configurations = {},
    sendImmediately = true
  ) {
    this._assertConnection();

    const flattenedConfigurations =
      this._flattenSensorConfigurations(configurations);
    const promise = this._waitForResponse("sensorDataConfigurations");

    this._messageMap.delete(this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS);
    this._messageMap.set(this.MessageTypes.SET_SENSOR_DATA_CONFIGURATIONS, [
      flattenedConfigurations.byteLength,
      flattenedConfigurations,
    ]);
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }

  // WEIGHT DATA DELAY
  async getWeightDataDelay(sendImmediately = true) {
    this._assertConnection();

    if (this._weightDataDelay !== null) {
      return this._weightDataDelay;
    } else {
      if (
        this._messagePromiseMap.has(this.MessageTypes.GET_WEIGHT_DATA_DELAY)
      ) {
        return this._messagePromiseMap.get(
          this.MessageTypes.GET_WEIGHT_DATA_DELAY
        );
      } else {
        const promise = this._waitForResponse(
          "weightDataDelay",
          this.MessageTypes.GET_WEIGHT_DATA_DELAY
        );

        this._messageMap.set(this.MessageTypes.GET_WEIGHT_DATA_DELAY);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(
          this.MessageTypes.GET_WEIGHT_DATA_DELAY,
          promise
        );
        return promise;
      }
    }
  }
  async setWeightDataDelay(newWeightDataDelay, sendImmediately = true) {
    this._assertConnection();

    this.log(`setting weight data delay to ${newWeightDataDelay}...`);

    if (isNaN(newWeightDataDelay)) {
      throw `weight data delay "${newWeightDataDelay}" is not a number!`;
    }
    newWeightDataDelay = Number(newWeightDataDelay);
    const promise = this._waitForResponse("weightDataDelay");

    this._messageMap.delete(this.MessageTypes.GET_WEIGHT_DATA_DELAY);
    this._messageMap.set(
      this.MessageTypes.SET_WEIGHT_DATA_DELAY,
      Uint16Array.of([newWeightDataDelay])
    );
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }

  // File Transfer
  _isTransferringFile = false;
  async sendFile(file, filePath) {
    this._assertConnection();

    if (this._isTransferringFile) {
      return;
    }
    this._isTransferringFile = true;

    const fileBuffer = await this._getFileBuffer(file);

    this.log(`sending file "${filePath}" of size ${fileBuffer.byteLength}`);

    const arrayBuffer = this._concatenateArrayBuffers(
      Uint32Array.of([fileBuffer.byteLength]),
      Uint8Array.of([filePath.length]),
      this.textEncoder.encode(filePath)
    );
    this._messageMap.set(this.MessageTypes.SEND_FILE, arrayBuffer);
    this.send();

    this._webSocket.send(fileBuffer);
    const initialBufferedAmount = this._webSocket.bufferedAmount;

    this._transferFileIntervalId = setInterval(() => {
      const progress =
        (initialBufferedAmount - this._webSocket.bufferedAmount) /
        initialBufferedAmount;
      this.log(`file transfer progress: ${progress * 100}%`);
      this.dispatchEvent({
        type: "filetransferprogress",
        message: { progress },
      });
      if (progress == 1) {
        clearInterval(this._transferFileIntervalId);
        this._transferFileIntervalId = null;
        this.dispatchEvent({
          type: "filetransfercomplete",
          message: { type: "send" },
        });
        this._isTransferringFile = false;
      }
    }, 500);
  }
  _receivedInitialFileReceivePayload = false;
  _receivedFileTransferArray = null;
  _receivingFileSize = null;
  _receivingFilePath = null;
  async receiveFile(filePath) {
    this._assertConnection();

    if (this._isTransferringFile) {
      return;
    }
    this._isTransferringFile = true;
    this._receivedFileTransferArray = null;
    this._receivingFileSize = null;
    this._receivedInitialFileReceivePayload = false;

    this.log(`requesting file "${filePath}"`);

    const arrayBuffer = this._concatenateArrayBuffers(
      Uint8Array.of([filePath.length]),
      this.textEncoder.encode(filePath)
    );
    this._messageMap.set(this.MessageTypes.RECEIVE_FILE, arrayBuffer);
    this.send();

    return new Promise((resolve) => {
      this.addEventListener(
        "filetransfercomplete",
        (event) => {
          this._isTransferringFile = false;
          resolve(event);
        },
        { once: true }
      );
    });
  }
  _parseFile(dataView, byteOffset) {
    if (!this._receivedInitialFileReceivePayload) {
      const filePathLength = dataView.getUint8(byteOffset++);
      const filePath = this.textDecoder.decode(
        dataView.buffer.slice(byteOffset, byteOffset + filePathLength)
      );
      this._receivingFilePath = filePath;
      byteOffset += filePathLength;

      const fileSize = dataView.getUint32(byteOffset, true);
      this._receivingFileSize = fileSize;
      byteOffset += 4;

      this.log(`anticipating "${filePath}" (${fileSize} bytes)`);
      this._receivedInitialFileReceivePayload = true;
    } else {
      this.log("received file data", dataView);
      this._receivedFileTransferArray = this._concatenateArrayBuffers(
        this._receivedFileTransferArray,
        dataView.buffer.slice(1)
      );
      this.log(
        "received file length",
        this._receivedFileTransferArray.byteLength
      );
      const fileTransferSize = this._receivingFileSize;
      const progress =
        this._receivedFileTransferArray.byteLength / fileTransferSize;
      this.log("filetransferprogress", progress);
      this.dispatchEvent({
        type: "filetransferprogress",
        message: { progress, type: "receive" },
      });

      if (this._receivedFileTransferArray.byteLength == fileTransferSize) {
        this.log("finished receiving file data!");
        const filePath = this._receivingFilePath;
        const filename = filePath.split("/").pop();
        const file = new File([this._receivedFileTransferArray], filename);
        this.dispatchEvent({
          type: "filetransfercomplete",
          message: { file, type: "receive" },
        });
      }
      byteOffset = dataView.byteLength;
    }
    return byteOffset;
  }

  removeFile(filePath) {
    this._assertConnection();

    this.log(`requesting file "${filePath}"`);

    const arrayBuffer = this._concatenateArrayBuffers(
      Uint8Array.of([filePath.length]),
      this.textEncoder.encode(filePath)
    );
    this._messageMap.set(this.MessageTypes.REMOVE_FILE, arrayBuffer);
    this.send();
  }
  formatFilesystem() {
    this._assertConnection();

    this.log("formatting filesystem");

    this._messageMap.set(this.MessageTypes.FORMAT_FILESYSTEM);
    this.send();
  }

  // FIRMWARE
  _firmwareVersion = null;
  async getFirmwareVersion(sendImmediately = true) {
    this._assertConnection();

    if (this._firmwareVersion !== null) {
      return this._firmwareVersion;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.GET_FIRMWARE_VERSION)) {
        return this._messagePromiseMap.get(
          this.MessageTypes.GET_FIRMWARE_VERSION
        );
      } else {
        const promise = this._waitForResponse(
          "firmwareVersion",
          this.MessageTypes.GET_FIRMWARE_VERSION
        );

        this._messageMap.set(this.MessageTypes.GET_FIRMWARE_VERSION);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(
          this.MessageTypes.GET_FIRMWARE_VERSION,
          promise
        );
        return promise;
      }
    }
  }
  async updateFirmware(file) {
    this._assertConnection();

    let fileBuffer = await this._getFileBuffer(file);

    if (this._isUpdatingFirmware) {
      return;
    }
    this._isUpdatingFirmware = true;

    this.log(`sending firmware of size ${fileBuffer.byteLength}`);

    this._messageMap.set(
      this.MessageTypes.FIRMWARE_UPDATE,
      Uint32Array.of([fileBuffer.byteLength]).buffer
    );
    this.send();

    this._webSocket.send(fileBuffer);
    const initialBufferedAmount = this._webSocket.bufferedAmount;

    this._updateFirmwareIntervalId = setInterval(() => {
      const progress =
        (initialBufferedAmount - this._webSocket.bufferedAmount) /
        initialBufferedAmount;
      this.log(`firmware update progress: ${progress * 100}%`);
      this.dispatchEvent({
        type: "firmwareupdateprogress",
        message: { progress },
      });
      if (progress == 1) {
        clearInterval(this._updateFirmwareIntervalId);
        this._updateFirmwareIntervalId = null;
        this.dispatchEvent({
          type: "firmwareupdatecomplete",
        });
      }
    }, 500);
  }

  // BLE GENERIC PEER
  static MAX_NUMBER_OF_BLE_GENERIC_PEERS = 2;
  get MAX_NUMBER_OF_BLE_GENERIC_PEERS() {
    return this.constructor.MAX_NUMBER_OF_BLE_GENERIC_PEERS;
  }
  _bleGenericPeers = new Array(this.MAX_NUMBER_OF_BLE_GENERIC_PEERS)
    .fill(null)
    .map((_, index) => new WebSocketGenericBLEPeer(this, index));

  _parseBLEGenericPeersMessage(dataView) {
    let byteOffset = 0;
    while (byteOffset < dataView.byteLength) {
      const bleGenericPeerIndex = dataView.getUint8(byteOffset++);
      const bleGenericPeerDataLength = dataView.getUint8(byteOffset++);
      this._bleGenericPeers[bleGenericPeerIndex]._parseMessage(
        new DataView(
          dataView.buffer.slice(
            byteOffset,
            byteOffset + bleGenericPeerDataLength
          )
        )
      );
      byteOffset += bleGenericPeerDataLength;
    }
  }
}

Object.assign(BaseMission, {
  MessageTypeStrings: [
    "BATTERY_LEVEL",

    "GET_TYPE",
    "SET_TYPE",

    "GET_NAME",
    "SET_NAME",

    "MOTION_CALIBRATION",

    "GET_SENSOR_DATA_CONFIGURATIONS",
    "SET_SENSOR_DATA_CONFIGURATIONS",

    "SENSOR_DATA",

    "GET_WEIGHT_DATA_DELAY",
    "SET_WEIGHT_DATA_DELAY",

    "WEIGHT_DATA",

    "RECEIVE_FILE",
    "SEND_FILE",
    "REMOVE_FILE",
    "FORMAT_FILESYSTEM",

    "GET_FIRMWARE_VERSION",
    "FIRMWARE_UPDATE",

    "BLE_GENERIC_PEER",
  ],
  BLEGenericPeerMessageTypeStrings: [
    "GET_CONNECTION",
    "SET_CONNECTION",

    "GET_SERVICE",
    "GET_CHARACTERISTIC",

    "READ_CHARACTERISTIC",
    "WRITE_CHARACTERISTIC",

    "GET_CHARACTERISTIC_SUBSCRIPTION",
    "SET_CHARACTERISTIC_SUBSCRIPTION",
  ],
});

["MessageType", "BLEGenericPeerMessageType"].forEach((name) => {
  WebSocketMissionDevice[name + "s"] = WebSocketMissionDevice[
    name + "Strings"
  ].reduce((object, name, index) => {
    object[name] = index;
    return object;
  }, {});
});

class WebSocketGenericBLEPeer extends THREE.EventDispatcher {
  isLoggingEnabled = !true;
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

  get MessageTypes() {
    return this._missionDevice.constructor.BLEGenericPeerMessageTypes;
  }
  get MessageTypeStrings() {
    return this._missionDevice.constructor.BLEGenericPeerMessageTypeStrings;
  }

  _messageMap = new Map();
  _messagePromiseMap = new Map();

  constructor(missionDevice, index) {
    super();

    this._missionDevice = missionDevice;
    this.index = index;
  }

  send() {
    this.log("send");
    this._missionDevice.send();
  }

  _name = null;
  isConnected = null;
  async _setConnection(shouldConnect, name, sendImmediately = true) {
    this.log("attempting to connect?", shouldConnect, name);

    const promise = this._waitForResponse("isConnected");

    this._messageMap.delete(this.MessageTypes.GET_CONNECTION);
    this._messageMap.set(this.MessageTypes.SET_CONNECTION, [
      shouldConnect,
      name,
    ]);

    if (sendImmediately) {
      this.send();
    }

    return promise;
  }

  async requestDevice({ name, services }) {
    await this.connect(name);
    if (this.isConnected) {
      for (const serviceIndex in services) {
        const { uuid, name } = services[serviceIndex];
        await this.getService(serviceIndex, uuid, name);
      }

      let characteristicIndex = 0;
      for (const serviceIndex in services) {
        const { characteristics } = services[serviceIndex];
        for (const index in characteristics) {
          const { uuid, name, read, subscribe, onValue } =
            characteristics[index];
          this.log(
            "getting characteristic",
            serviceIndex,
            characteristicIndex,
            uuid,
            name
          );
          await this.getCharacteristic(
            serviceIndex,
            characteristicIndex,
            uuid,
            name
          );
          if (read) {
            await this.readCharacteristic(characteristicIndex);
          }
          if (subscribe) {
            await this.setCharacteristicSubscription(characteristicIndex, true);
          }
          if (onValue) {
            this.addEventListener(
              `characteristicValue${characteristicIndex}`,
              onValue
            );
          }
          characteristicIndex++;
        }
      }
      this.log("Requested device!");
      this.dispatchEvent({type: "didRequestDevice"})
    }
  }

  async connect(name) {
    return this._setConnection(true, name);
  }
  async disconnect() {
    const response = await this._setConnection(false);
    this._services.length = 0;
    this._characteristics.length = 0;
    return response;
  }

  _services = []; // {uuid, value, didGet, name}
  async getService(serviceIndex, uuid, name, sendImmediately = true) {
    this._assertConnection();
    serviceIndex = Number(serviceIndex);
    if (!this._services[serviceIndex]) {
      this._services[serviceIndex] = { uuid, value: null, didGet: false, name };
      const promise = this._waitForResponse(`getService${serviceIndex}`);
      this._messageMap.set(this.MessageTypes.GET_SERVICE, [serviceIndex, uuid]);
      if (sendImmediately) {
        this.send();
      }
      return promise;
    } else {
      throw `service #${serviceIndex} already in use`;
    }
  }
  _getIndex(value, array) {
    let index;
    if (!isNaN(value)) {
      index = Number(value);
    } else if (typeof value == "string") {
      const string = value;
      const _index = array.findIndex(({ name, uuid }) => {
        return string == name || string == uuid;
      });
      if (_index != -1) {
        index = _index;
      }
    }

    if (typeof index == "number") {
      return index;
    } else {
      throw `couldn't find index for "${value}"`;
    }
  }

  _getServiceIndex(value) {
    return this._getIndex(value, this._services);
  }
  _getCharacteristicIndex(value) {
    return this._getIndex(value, this._characteristics);
  }

  _characteristics = []; // {serviceIndex, uuid, value, isSubscribed, didGet, name}
  async getCharacteristic(
    serviceIndex,
    characteristicIndex,
    uuid,
    name,
    sendImmediately = true
  ) {
    this._assertConnection();

    serviceIndex = this._getServiceIndex(serviceIndex);
    characteristicIndex = Number(characteristicIndex);

    const service = this._services[serviceIndex];
    let characteristic = this._characteristics[characteristicIndex];
    if (service?.didGet && !characteristic) {
      this._characteristics[characteristicIndex] = {
        serviceIndex,
        uuid,
        value: null,
        didGet: false,
        isSubscribed: false,
        name,
      };

      const promise = this._waitForResponse(
        `getCharacteristic${characteristicIndex}`
      );
      this._messageMap.set(this.MessageTypes.GET_CHARACTERISTIC, [
        serviceIndex,
        characteristicIndex,
        uuid,
      ]);
      if (sendImmediately) {
        this.send();
      }
      return promise;
    } else {
      if (!service?.didGet) {
        throw `did not get service #${serviceIndex}`;
      } else {
        throw `characteristic #${characteristicIndex} already in use`;
      }
    }
  }
  async readCharacteristic(characteristicIndex, sendImmediately = true) {
    this._assertConnection();

    characteristicIndex = this._getCharacteristicIndex(characteristicIndex);

    const characteristic = this._characteristics[characteristicIndex];
    if (characteristic) {
      if (characteristic.value) {
        return characteristic.value;
      } else {
        if (
          this._messagePromiseMap.has(this.MessageTypes.READ_CHARACTERISTIC)
        ) {
          return this._messagePromiseMap.get(
            this.MessageTypes.READ_CHARACTERISTIC
          );
        } else {
          const promise = this._waitForResponse(
            `characteristicValue${characteristicIndex}`
          );
          this._messageMap.set(this.MessageTypes.READ_CHARACTERISTIC, [
            characteristicIndex,
          ]);
          if (sendImmediately) {
            this.send();
          }
          this._messagePromiseMap.set(this.MessageTypes.GET_TYPE, promise);
          return promise;
        }
      }
    } else {
      throw `did not get characteristic #${characteristicIndex}`;
    }
  }
  async writeCharacteristic(
    characteristicIndex,
    newValue,
    sendImmediately = true
  ) {
    this._assertConnection();

    characteristicIndex = this._getCharacteristicIndex(characteristicIndex);

    if (this._characteristics[characteristicIndex]) {
      const promise = this._waitForResponse(
        `characteristicValue${characteristicIndex}`
      );
      this._messageMap.delete(this.MessageTypes.READ_CHARACTERISTIC);
      const arrayBuffer = this._flattenMessageDatum(newValue);
      this._messageMap.set(this.MessageTypes.WRITE_CHARACTERISTIC, [
        characteristicIndex,
        [arrayBuffer.byteLength, arrayBuffer],
      ]);
      if (sendImmediately) {
        this.send();
      }
      return promise;
    } else {
      throw `did not get characteristic #${characteristicIndex}`;
    }
  }
  async setCharacteristicSubscription(
    characteristicIndex,
    shouldSubscribe,
    sendImmediately = true
  ) {
    this._assertConnection();

    characteristicIndex = this._getCharacteristicIndex(characteristicIndex);

    if (this._characteristics[characteristicIndex]) {
      const promise = this._waitForResponse(
        `characteristicSubscription${characteristicIndex}`
      );
      this._messageMap.delete(
        this.MessageTypes.GET_CHARACTERISTIC_SUBSCRIPTION
      );
      this._messageMap.set(this.MessageTypes.SET_CHARACTERISTIC_SUBSCRIPTION, [
        characteristicIndex,
        shouldSubscribe,
      ]);
      if (sendImmediately) {
        this.send();
      }
      return promise;
    } else {
      throw `did not get characteristic #${characteristicIndex}`;
    }
  }

  _parseMessage(dataView) {
    this.log("_parseMessage", dataView);

    let byteOffset = 0;
    while (byteOffset < dataView.byteLength) {
      const messageType = dataView.getUint8(byteOffset++);
      const messageTypeString = this.MessageTypeStrings[messageType];
      this.log(`bleGenericPeerMessage type: ${messageTypeString}`);
      const messageDataLength = dataView.getUint8(byteOffset++);
      const _dataView = new DataView(
        dataView.buffer.slice(byteOffset, byteOffset + messageDataLength)
      );
      let _byteOffset = 0;
      switch (messageType) {
        case this.MessageTypes.GET_CONNECTION:
        case this.MessageTypes.SET_CONNECTION:
          this.isConnected = Boolean(_dataView.getUint8(_byteOffset++));
          this.log("isConnectedToBLEGenericPeer", this.isConnected);
          this.dispatchEvent({
            type: "isConnected",
            message: { isConnected: this.isConnected },
          });
          break;
        case this.MessageTypes.GET_SERVICE:
          while (_byteOffset < _dataView.byteLength) {
            const serviceIndex = _dataView.getUint8(_byteOffset++);
            const service = this._services[serviceIndex];
            service.didGet = Boolean(_dataView.getUint8(_byteOffset++));
            const type = `getService${serviceIndex}`;
            this.log(type, service);
            this.dispatchEvent({
              type,
              message: { [type]: service.didGet },
            });
          }
          break;
        case this.MessageTypes.GET_CHARACTERISTIC:
          while (_byteOffset < _dataView.byteLength) {
            const characteristicIndex = _dataView.getUint8(_byteOffset++);
            const characteristic = this._characteristics[characteristicIndex];
            characteristic.didGet = Boolean(_dataView.getUint8(_byteOffset++));
            const type = `getCharacteristic${characteristicIndex}`;
            this.log(type, characteristic);
            this.dispatchEvent({
              type,
              message: { [type]: characteristic.didGet },
            });
          }
          break;
        case this.MessageTypes.READ_CHARACTERISTIC:
        case this.MessageTypes.WRITE_CHARACTERISTIC:
          while (_byteOffset < _dataView.byteLength) {
            const characteristicIndex = _dataView.getUint8(_byteOffset++);
            const characteristic = this._characteristics[characteristicIndex];
            const valueLength = _dataView.getUint8(_byteOffset++);
            const value = new DataView(
              _dataView.buffer.slice(_byteOffset, _byteOffset + valueLength)
            );
            characteristic.value = value;
            _byteOffset += valueLength;
            const type = `characteristicValue${characteristicIndex}`;
            this.log(type, characteristic);
            this.dispatchEvent({
              type,
              message: { [type]: characteristic.value, value },
            });
            if ("name" in characteristic) {
              const { name } = characteristic;
              this.dispatchEvent({
                type: name,
                message: { [name]: characteristic.value, value },
              });
            }
          }
          break;
        case this.MessageTypes.GET_CHARACTERISTIC_SUBSCRIPTION:
        case this.MessageTypes.SET_CHARACTERISTIC_SUBSCRIPTION:
          while (_byteOffset < _dataView.byteLength) {
            const characteristicIndex = _dataView.getUint8(_byteOffset++);
            const characteristic = this._characteristics[characteristicIndex];
            characteristic.isSubscribed = Boolean(
              _dataView.getUint8(_byteOffset++)
            );
            const type = `characteristicSubscription${characteristicIndex}`;
            this.log(type, characteristic);
            this.dispatchEvent({
              type,
              message: { [type]: characteristic.isSubscribed },
            });
          }
          break;
        default:
          this.log(`uncaught message type #${messageType}`);
          byteOffset = dataView.byteLength;
          break;
      }
      byteOffset += messageDataLength;
    }
  }
}

["_waitForResponse", "_assertConnection", "_flattenMessageDatum"].forEach(
  (methodName) => {
    WebSocketGenericBLEPeer.prototype[methodName] =
      WebSocketMissionDevice.prototype[methodName];
  }
);

class WebSocketMissions extends BaseMissions {
  static get MissionDevice() {
    return WebSocketMissionDevice;
  }
}
