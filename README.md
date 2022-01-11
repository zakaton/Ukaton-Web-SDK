# Ukaton Smart Insoles + Motion Modules Web SDK

_A client-side JavaScript SDK for the Ukaton Smart Insoles and Motion Modules_

## Table of Contents  
⚙️ Setting up the SDK  
📲 Connecting to your Device  
🔓 Enabling and Disabling Sensors  
👂 Listening for Events  

### ⚙️ Setting up the SDK

Include the following scripts to your webpage (you can also download the glitch-hosted scripts for local use):  

```
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r118/three.min.js"></script>
<script src="https://ukaton-side-mission-dev.glitch.me/BaseMission.js"></script>
<script src="https://ukaton-side-mission-dev.glitch.me/BluetoothMissionDevice.js"></script>
<script src="https://ukaton-side-mission-dev.glitch.me/WebSocketMissionDevice.js"></script>
```

_Our devices are called "Missions", where the Smart Insoles are the "Sole Missions", and the Motion Modules are the "Core Missions". This is because we started with the Smart Insoles (the "sole mission" of our company), and the motion modules are stripped-down versions without the insole (the "core" of our hardware)._

`BaseMission.js` is the base class for Ukaton devices, while `BluetoothMissionDevice.js` and `WebSocketMissionDevice.js` implement the base class via Web Bluetooth or WebSockets. If you plan on just connecting via Bluetooth or WebSockets exclusively, you don't need to include the other script.

After including the scripts, you can create an instance of 4 possible classes:

1. An instance of `BluetoothMissionDevice`, which connects to either a Motion Module or single Smart Insole via Web Bluetooth
2. An instance of `BluetoothMissions`, which is a wrapper for 2 `BluetoothMissionDevice` instances representing the left and right insoles
3. An instance of `WebSocketMissionDevice`, which connects to either a Motion Module or single Smart Insole via Websockets
4. An instance of `WebSocketMissions`, which is a wrapper for 2 `WebSocketMissionDevice` instances representing the left and right insoles

The first 2 classes come from `BluetoothMissionDevice.js`, and the last 2 classes come from `WebSocketMissionDevice.js`.

Creating instances is straightforward:

```
// bluetooth-based devices
const bluetoothMissionDevice = new BluetoothMissionDevice();
const bluetoothMissions = new BluetoothMissions();

// websocket-based devices
const webSocketMissionDevice = new WebSocketMissionDevice();
const webSocketMissions = new WebSocketMissions();
```

### 📲 Connecting to your Device

When you start, you can only connect to your device via Web Bluetooth:

```
const bluetoothMissionDevice = new BluetoothMissionDevice();

// the .connect method returns a promise if connected
// make sure to call this method in response to a user action, like a button click
bluetoothMissionDevice.connect().then(() => {
  console.log("connected!");
});

// you can also listen for the "connected" event:
bluetoothMissionDevice.addEventListener("connected", () => {
  console.log("connected!");
});
```

Once connected, you can get and set the device name:

```
// .getName() returns a promise with the name
bluetoothMissionDevice.getName().then(name => {
  console.log(`name of device: ${name}`);
});

// .setName(newName) also returns a promise with the name (in case the name was truncated due to length constraints):
bluetoothMissionDevice.setName(newName).then(_newName => {
  console.log(`new name of device: ${_newName}`);
});
```

Setting the name also sets the bluetooth device name and wifi hostname.

You can also get and set the device type (MOTION_MODULE, LEFT_INSOLE, RIGHT_INSOLE):

```
// .getType() returns a promise with the device type enumeration (0, 1, or 2)
// .getTypeString() returns the type enumeration string ("MOTION_MODULE", "LEFT_INSOLE", "RIGHT_INSOLE")
bluetoothMissionDevice.getType().then(type => {
  console.log(`type of device: ${type}. type name: ${bluetoothMissionDevice.getTypeString()}`);
});

// .setType(newType) takes an enumeration between 0 and 2:
bluetoothMissionDevice.setType(newType).then(_newType => {
  console.log(`new type of device: ${_newType}. type name: ${bluetoothMissionDevice.getTypeString()}`);
});
```

Setting the device type will affect the motion data axes and orientation (insoles are orientated sideways, and the left/right insoles don't face the same way), as well as pressure data (motion modules don't have pressure data, and left/right insoles have different pressure sensor arrangements). Setting the device type allows us to run the same firmware/web sdk for all device types without hard-coding the device type in firmware beforehand, and allows us to parse the motion/pressure data differently in the Web SDK.


Before connecting via WebSockets, you first need to setup the WiFi credentials:

```
// .setWifiSSID(wifiSSID) sets the Wifi name, returning a promise with the ssid (in case it was truncated)
await _wifiSSID = bluetoothMissionDevice.setWifiSSID(wifiSSID);
console.log(`set wifi ssid: ${_wifiSSID}`);

// .setWifiPassword(wifiPassword) sets the Wifi name, returning a promise with the ssid (in case it was truncated)
await _wifiPassword = bluetoothMissionDevice.setWifiPassword(wifiPassword);
console.log(`set wifi password: ${_wifiPassword}`);

// after setting up wifi credentials, call .connectToWifi()
// this will keep attempting to connect to WiFi every second until you call .disconnectFromWifi()
missionDevice.connectToWifi();

// listen for the "iswificonnected" event for wifi connection updates
bluetoothMissionDevice.addEventListener("iswificonnected", async event => {
  const {iswificonnected} = event.message;
  console.log("is connected to wifi? ", iswificonnected);
  
  // you can also get the IP address to use for the WebSocket gateway
  const ipAddress = await bluetoothMissionDevice.getWifiIPAddress();
  console.log("IP address: ", ipAddress);
});
```

After connecting to WiFi and getting the ip address, you can then connect via WebSockets:
```
let gateway = "0.0.0.0";
const webSocketMissionDevice = new WebSocketMissionDevice();
webSocketMissionDevice.connect(gateway).then(() => {
  console.log("connected via WebSockets!")
});
```

The Web SDK for the Bluetooth and WebSocket verions are pretty much identical except for the .connect() method ( the WebSocket version requires a `gateway` argument)

The `BluetoothMissions` and `WebSocketMissions` devices are a wrapper containing 2 `*MissionsDevice`, whose left and right insoles are the `.left` and `.right` properties, and can be accessed as such:

```
const bluetoothMissions = new BluetoothMissions();
bluetoothMissions.left.connect().then(() => {
  console.log("connected to the left insole");
});
bluetoothMissions.right.connect().then(() => {
  console.log("connected to the right insole");
});
```

### 🔓 Enabling and Disabling Sensors

After connecting, you can enable and disable sensors using `.setSensorDataConfigurations(configurations)`:

```
bluetoothMissionDevice.setSensorDataConfigurations({
  motion: {
    acceleration: 0,
    gravity: 0,
    linearAcceleration: 0,
    rotationRate: 0,
    magnetometer: 0,
    quaternion: 0
  },
  pressure: {
    pressureSingleByte: 0,
    pressureDoubleByte: 0,
    centerOfMass: 0,
    mass: 0,
    heelToToe: 0
  }
});
```

This is an exhaustive list of all possible sensor types (motion/pressure) and their data types. The values represent the delay between samples in milliseconds, accepting multiples of 20 (set it to 0 to stop sending data). Normally you'd just pass in whatever data type you want, e.g. to just get quaternion data use `.setSensorDataConfigurations({motion: {quaternion: 20}})`.

### 👂 Listening for Sensor Data Events

After configuring sensors, listening for data events is pretty staightforward:

```
// we don't recommend enabling all the sensors, but this is just for reference
bluetoothMissionDevice.setSensorDataConfigurations({
  motion: {
    acceleration: 40,
    gravity: 40,
    linearAcceleration: 40,
    rotationRate: 40,
    magnetometer: 40,
    quaternion: 40 // this emits the "euler" event as well
  },
  pressure: {
    // only enable either "pressureSingleByte" or "pressureDoubleByte" - it's the same data with either 8 or 12 bits of precision
    pressureSingleByte: 0,
    pressureDoubleByte: 40,
    
    // if either of the top 2 data types are enabled, the lower 3 data types don't need to be enabled, since they'll be computed from the raw data above
    // this is to save processing if you only need the mass and don't need 16 or 32 bytes (1 or 2 bytes per pressure sensor) when you just need a 1 or 2 scalar values
    centerOfMass: 0,
    mass: 0,
    heelToToe: 0
  }
});

// motion events
bluetoothMissionDevice.addEventListener("acceleration", event => {
  const {acceleration, timestamp} = event.message;
  // acceleration is a THREE.js Vector3
  console.log(`[${timestamp}] acceleration`, acceleration);
});
bluetoothMissionDevice.addEventListener("gravity", event => {
  const {gravity, timestamp} = event.message;
  // gravity is a THREE.js Vector3
  console.log(`[${timestamp}] gravity`, gravity);
});
bluetoothMissionDevice.addEventListener("linearacceleration", event => {
  const {linearAcceleration, timestamp} = event.message;
  // linearAcceleration is a THREE.js Vector3
  console.log(`[${timestamp}] linearAcceleration`, linearAcceleration);
});
bluetoothMissionDevice.addEventListener("rotationrate", event => {
  const {rotationRate, timestamp} = event.message;
  // rotationRate is a THREE.js Euler
  console.log(`[${timestamp}] rotationRate`, rotationRate);
});
bluetoothMissionDevice.addEventListener("magnetometer", event => {
  const {magnetometer, timestamp} = event.message;
  // magnetometer is a THREE.js Vector3
  console.log(`[${timestamp}] magnetometer`, magnetometer);
});
bluetoothMissionDevice.addEventListener("quaternion", event => {
  const {quaternion, timestamp} = event.message;
  // quaternion is a THREE.js Quaternion
  console.log(`[${timestamp}] quaternion`, quaternion);
});
bluetoothMissionDevice.addEventListener("euler", event => {
  const {euler, timestamp} = event.message;
  // euler is a THREE.js Euler
  console.log(`[${timestamp}] euler`, euler);
});

// pressure events
bluetoothMissionDevice.addEventListener("pressure", event => {
  const {pressure, timestamp} = event.message;
  // pressure is an array of 16 {x, y, value} objects, with {x, y} referring to the position on the insole
  console.log(`[${timestamp}] pressure`, pressure);
});
bluetoothMissionDevice.addEventListener("centerofmass", event => {
  const {centerOfMass, timestamp} = event.message;
  // centerOfMass is a {x, y} value representing the side-to-side and front-to-backness of the insole
  console.log(`[${timestamp}] centerOfMass`, centerOfMass);
});
bluetoothMissionDevice.addEventListener("mass", event => {
  const {mass, timestamp} = event.message;
  // mass is a scalar ranging [0, 1] as the user puts more pressure on the insole
  console.log(`[${timestamp}] mass`, mass);
});
bluetoothMissionDevice.addEventListener("heeltotoe", event => {
  const {heelToToe, timestamp} = event.message;
  // heelToToe is a scalar that ranges [0, 1] as the user leans from the heel to the toe
  console.log(`[${timestamp}] heelToToe`, heelToToe);
});

// pressure events (for *Missions devices)
// called when either the left or right insole dispatches a "pressure" event
bluetoothMissions.addEventListener("pressure", event => {
  const {timestamp, side, pressure} = event.message;
  // pressure is {sum, mass, centerOfMass}, where sum is the net mass, mass is a {left, right}, each side being a scalar addend of 1 showing relative mass distribution (e.g. leaning all the way to the left is 0, right is 1, and center is 0.5), and centerOfMass is an {x, y} center of balance across both insoles
  console.log(`[${timestamp}] heelToToe`, heelToToe);
});
```