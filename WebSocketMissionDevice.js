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

    return new Promise(resolve => {
      this.addEventListener(
        "connected",
        async event => {
          resolve();
        },
        { once: true }
      );
    });
  }

  async _onWebSocketOpen(event) {
    const promises = [
      this.getDebug(false),
      this.getType(false),
      this.getName(false),
      this.getSensorDataConfigurations(false)
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
        case this.MessageTypes.GET_DEBUG:
        case this.MessageTypes.SET_DEBUG:
          this._debug = dataView.getUint8(byteOffset++);
          this._onDebugUpdate();
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
        case this.MessageTypes.BATTERY_LEVEL:
          byteOffset = this._parseBatteryLevel(dataView, byteOffset);
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
            datum = datum.map(datum => this._flattenMessageDatum(datum));
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

  // DEBUG
  async getDebug(sendImmediately = true) {
    this._assertConnection();

    if (this._debug !== null) {
      return this._debug;
    } else {
      if (this._messagePromiseMap.has(this.MessageTypes.GET_DEBUG)) {
        return this._messagePromiseMap.get(this.MessageTypes.GET_DEBUG);
      } else {
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "debug",
            event => {
              const { error, message } = event;
              if (error) {
                reject(error);
              } else {
                resolve(message.debug);
              }

              this._messagePromiseMap.delete(this.MessageTypes.GET_DEBUG);
            },
            { once: true }
          );
        });

        this._messageMap.set(this.MessageTypes.GET_DEBUG);
        if (sendImmediately) {
          this.send();
        }

        this._messagePromiseMap.set(this.MessageTypes.GET_DEBUG, promise);
        return promise;
      }
    }
  }
  async setDebug(debug, sendImmediately = true) {
    this._assertConnection();

    this.log(`setting debug value to ${debug}...`);

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "debug",
        event => {
          const { error, name } = event;
          if (error) {
            reject(error);
          } else {
            resolve(name);
          }
        },
        { once: true }
      );
    });

    this._messageMap.delete(this.MessageTypes.GET_DEBUG);
    this._messageMap.set(this.MessageTypes.SET_DEBUG, debug);
    if (sendImmediately) {
      this.send();
    }

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
        const promise = new Promise((resolve, reject) => {
          this.addEventListener(
            "type",
            event => {
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
        event => {
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
            event => {
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
        event => {
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
            event => {
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

    const flattenedConfigurations = this._flattenSensorConfigurations(
      configurations
    );

    const promise = new Promise((resolve, reject) => {
      this.addEventListener(
        "sensordataconfigurations",
        event => {
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
      flattenedConfigurations
    ]);
    if (sendImmediately) {
      this.send();
    }

    return promise;
  }
}

Object.assign(BaseMission, {
  MessageTypeStrings: [
    "GET_DEBUG",
    "SET_DEBUG",

    "GET_TYPE",
    "SET_TYPE",

    "GET_NAME",
    "SET_NAME",

    "MOTION_CALIBRATION",

    "GET_SENSOR_DATA_CONFIGURATIONS",
    "SET_SENSOR_DATA_CONFIGURATIONS",

    "SENSOR_DATA",

    "BATTERY_LEVEL"
  ]
});

["MessageType"].forEach(name => {
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
