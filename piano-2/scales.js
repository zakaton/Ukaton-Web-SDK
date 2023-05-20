/* global Tone */

function intersectArrays(a, b) {
  const shorterArray = a.length < b.length ? a : b;
  const longerArray = a.length > b.length ? a : b;
  return shorterArray.filter(function (value) {
    return longerArray.includes(value);
  });
}
function unionArrays(a, b) {
  return a.concat(b).filter(function (value, index, union) {
    return union.indexOf(value) == index;
  });
}
function differenceArrays(a, b) {
  return a.filter(function (value) {
    return !b.includes(value);
  });
}

const scale = {
  init() {
    this.initAllScales();
    this.initKeyToScales();
    this.update();
  },

  _root: "C",
  get root() {
    return this._root;
  },
  set root(newRoot) {
    if (this._root != newRoot) {
      this._root = newRoot;
      this.update();
    }
  },
  _pitch: "natural",
  get pitch() {
    return this._pitch;
  },
  set pitch(newPitch) {
    if (this._pitch != newPitch) {
      this._pitch = newPitch;
      this.update();
    }
  },

  _isMajor: true,
  get isMajor() {
    return this._isMajor;
  },
  set isMajor(newIsMajor) {
    if (this._isMajor != newIsMajor) {
      this._isMajor = newIsMajor;
      this.update();
    }
  },

  _isPentatonic: false,
  get isPentatonic() {
    return this._isPentatonic;
  },
  set isPentatonic(newIsPentatonic) {
    if (this._isPentatonic != newIsPentatonic) {
      this._isPentatonic = newIsPentatonic;
      this.update();
    }
  },

  _isAuto: false,
  get isAuto() {
    return this._isAuto;
  },
  set isAuto(newIsAuto) {
    if (this._isAuto != newIsAuto) {
      this._isAuto = newIsAuto;
      this.update();
    }
  },

  _isPerfect: false,
  get isPerfect() {
    return this._isPerfect;
  },
  set isPerfect(newIsPerfect) {
    if (this._isPerfect != newIsPerfect) {
      this._isPerfect = newIsPerfect;
      this.update();
    }
  },

  _name: "",
  get name() {
    return this._name;
  },
  updateName() {
    let name = this.root;
    switch (this.pitch) {
      case "flat":
        name += "b";
        break;
      case "sharp":
        name += "#";
        break;
    }
    if (!this.isMajor) {
      name += "m";
    }
    if (this.isPentatonic) {
      name += "p";
    }

    if (!this.allScales[name]) {
      throw `invalid scale "${name}"`;
      name = "C";
    }

    this._name = name;
    console.log("scales name:", this.name);
  },

  allKeys: [
    "C",
    ["C#", "Db"],
    "D",
    ["D#", "Eb"],
    "E",
    "F",
    ["F#", "Gb"],
    "G",
    ["G#", "Ab"],
    "A",
    ["A#", "Bb"],
    "B",
  ],
  keys: [],

  idealIntervals: [
    1,
    17 / 16, // minor second
    9 / 8, // major second
    6 / 5, // minor third
    5 / 4, // major third
    4 / 3, // perfect fourth
    7 / 5, // tritone
    3 / 2, // perfect fifth
    8 / 5, // minor sixth
    5 / 3, // major sixth
    7 / 4, // minor seventh
    15 / 8, // major seventh
  ],
  chords: {
    // relative to the root and each other
    major: [4, 3],
    minor: [3, 4],
    suspendedSecond: [2, 5],
    suspendedFourth: [5, 2],
    diminished: [3, 3],
    augmented: [4, 4],
    seventh: [4, 3, 3],
    minorSeventh: [3, 4, 3],
    majorSeventh: [4, 3, 4],
  },

  allScales: {},
  patterns: {
    major: [2, 2, 1, 2, 2, 2],
    minor: [2, 1, 2, 2, 1, 2],
    pentatonicMajor: [2, 2, 3, 2],
    pentatonicMinor: [3, 2, 2, 3],
  },
  initAllScales() {
    this.allKeys.forEach((rootKey, rootKeyIndex) => {
      var rootKeys = rootKey instanceof Array ? rootKey : [rootKey];

      for (var patternName in this.patterns) {
        var scale = [rootKey];

        var pattern = this.patterns[patternName];
        var netKeyOffset = rootKeyIndex;
        pattern.forEach((keyOffset) => {
          netKeyOffset = (netKeyOffset + keyOffset) % 12;
          scale.push(this.allKeys[netKeyOffset]);
        });

        var lowercasePatternName = patternName.toLowerCase();
        rootKeys.forEach((rootKeyName) => {
          var scaleName = rootKeyName;
          scaleName += lowercasePatternName.includes("major") ? "" : "m";
          scaleName += lowercasePatternName.includes("pentatonic") ? "p" : "";
          this.allScales[scaleName] = scale;
        });
      }
    });
  },

  keyToScales: {},
  initKeyToScales() {
    this.allKeys.forEach((keyName) => {
      const scales = [];
      for (var scaleName in this.allScales) {
        const scale = this.allScales[scaleName];
        if (scale.includes(keyName)) {
          scales.push(scaleName);
        }
      }
      this.keyToScales[keyName] = scales;
    });
    for (const keyName in this.keyToScales) {
      const keyNames = keyName.split(",");
      if (keyNames.length > 1) {
        keyNames.forEach((_keyName) => {
          this.keyToScales[_keyName] = this.keyToScales[keyName];
        });
      }
    }
  },

  lastNKeysPlayed: [],
  lastNKeysPlayedMax: 10,
  possibleScales: [],
  updatePossibleScales(keys) {
    keys = keys instanceof Array ? keys : [keys];
    this.lastNKeysPlayed = this.lastNKeysPlayed.concat(keys);
    while (this.lastNKeysPlayed.length > this.lastNKeysPlayedMax) {
      this.lastNKeysPlayed.shift();
    }

    let possibleScales = this.keyToScales[this.lastNKeysPlayed[0]].slice();
    for (var index = 1; index < this.lastNKeysPlayed.length; index++) {
      possibleScales = intersectArrays(
        possibleScales,
        this.keyToScales[this.lastNKeysPlayed[index]]
      );
    }
    this.possibleScales = possibleScales;

    console.log(
      `auto (${possibleScales
        .filter((scale) => !scale.includes("p"))
        .join(", ")})`
    );

    this.computeKeys();
  },

  update() {
    if (this.isAuto) {
      this.lastNKeysPlayed = [];
    } else {
      this.updateName();
    }

    this.computeKeys();
  },
  computeKeys() {
    var keys;
    if (this.isAuto) {
      keys = this.possibleScales.length == 0 ? this.keys.slice() : [];
      for (
        var index = 0;
        index < this.possibleScales.length && keys.length < 12;
        index++
      ) {
        var possibleScale = this.possibleScales[index];
        keys = unionArrays(keys, this.allScales[possibleScale]);
      }
      keys = keys.sort((a, b) => {
        return this.allKeys.indexOf(a) - this.allKeys.indexOf(b);
      });
    } else if (this.isPerfect) {
      keys = this.allScales[this.name];
    } else {
      keys = this.allKeys.slice();
    }
    this.keys = keys;
  },
};
scale.init();
