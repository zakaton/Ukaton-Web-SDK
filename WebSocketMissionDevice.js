/* global THREE, BaseMission, BaseMissions */

class WebSocketMissionDevice extends BaseMission {
  get MessageTypes() {
    return this.constructor.MessageTypes;
  }
  get MessageTypeStrings() {
    return this.constructor.MessageTypeStrings;
  }

  constructor() {
    super();

    this._messageMap = new Map();
    this._messagePromiseMap = new Map();
  }

  get isConnected() {
    return (
      this._webSocket && this._webSocket.readyState == this._webSocket.OPEN
    );
  }
  async connect(ipAddress) {
    const gateway = `ws://${ipAddress}/ws`;
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
  }
  async _onWebSocketMessage(event) {
    if (!this._sentInitialMessage) {
      this.log("received message without sending initial payload");
      return;
    }

    const arrayBuffer = await event.data.arrayBuffer();

    this.log(
      "message received",
      Array.from(new Uint8Array(arrayBuffer)),
      event
    );
    this.dispatchEvent({ type: "websocketmessage", message: { event } });

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
              type: "firmwareversion",
              message: { firmwareVersion: this._firmwareVersion },
            });
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
            datum = datum.map((datum) => this._flattenMessageDatum(datum));
            return this._concatenateArrayBuffers(...datum);
            break;
          case "Object":
            this.log(
              "uncaught datum type: object (what do we do with the keys and in what order?)",
              datum
            );
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

  // TYPE
  async getType(sendImmediately = true) {
    this._assertConnection();

    if (this._type !== null) {
      return this._type;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.GET_TYPE)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_TYPE);
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "type",
            (event) => {
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

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "type",
        (event) => {
          const { error, message } = event;
          if (error) {
            reject(error);
          } else {
            resolve(message.type);
          }
        },
        { once: true }
      );
    });

    this._messageMap.delete(this.MessageTypes.GET_TYPE);
    this._messageMap.set(this.MessageTypes.SET_TYPE, newType);
    if (sendImmediately) {
      this.send();
    }

    return promise;
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
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "name",
            (event) => {
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

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "name",
        (event) => {
          const { error, message } = event;
          if (error) {
            reject(error);
          } else {
            resolve(message.name);
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
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "sensordataconfigurations",
            (event) => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.sensorDataConfigurations);
              }

              this._messagePromiseMap.delete(
                this.MessageTypes.GET_SENSOR_DATA_CONFIGURATIONS
              );
            },
            { once: true }
          );
        });

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

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "sensordataconfigurations",
        (event) => {
          const { error, message } = event;
          if (error) {
            reject(error);
          } else {
            resolve(message.sensorDataConfigurations);
          }
        },
        { once: true }
      );
    });

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

  // WEIGHT DATA DELA
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
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "weightdatadelay",
            (event) => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.weightDataDelay);
              }

              this._messagePromiseMap.delete(
                this.MessageTypes.GET_WEIGHT_DATA_DELAY
              );
            },
            { once: true }
          );
        });

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

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "weightdatadelay",
        (event) => {
          const { error, message } = event;
          if (error) {
            reject(error);
          } else {
            resolve(message.weightDataDelay);
          }
        },
        { once: true }
      );
    });

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
  _receivedInitialFileReceivePayload = false
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
    this._receivedInitialFileReceivePayload = false

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
      this._receivingFilePath = filePath
      byteOffset += filePathLength;

      const fileSize = dataView.getUint32(byteOffset, true);
      this._receivingFileSize = fileSize;
      byteOffset += 4;

      this.log(`anticipating "${filePath}" (${fileSize} bytes)`);
      this._receivedInitialFileReceivePayload = true
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
      byteOffset = dataView.byteLength
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
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "firmwareversion",
            (event) => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.firmwareVersion);
              }

              this._messagePromiseMap.delete(
                this.MessageTypes.GET_FIRMWARE_VERSION
              );
            },
            { once: true }
          );
        });

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

    "SEND_FILE",
    "RECEIVE_FILE",
    "REMOVE_FILE",
    "FORMAT_FILESYSTEM",

    "GET_FIRMWARE_VERSION",
    "FIRMWARE_UPDATE",
  ],
});

["MessageType"].forEach((name) => {
  WebSocketMissionDevice[name + "s"] = WebSocketMissionDevice[
    name + "Strings"
  ].reduce((object, name, index) => {
    object[name] = index;
    return object;
  }, {});
});

class WebSocketMissions extends BaseMissions {
  static get MissionDevice() {
    return WebSocketMissionDevice;
  }
}
