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

  exoticScales: [
    "algerian",
    "arabic",
    "augmented",
    "balinese",
    "byzantine",
    "chinese",
    "diminished",
    "dominant diminished",
    "egyptian",
    "eight tone spanish",
    "enigmatic",
    "geez", // ethiopian
    "hawaiian",
    "hindu",
    "hirajoshi",
    "hungarian",
    "iberian",
    "iwato",
    "japanese",
    "lydian b7",
    "maqam",
    "neapolitan major",
    "neapolitan minor",
    "bebop",
    "oriental", // Chinese
    "prometheus", // mystic
    "romanian minor",
    "spanish gypsy",
    "super locrian",
    "whole tone",
    "yo",
    "phrygian",
    "nine tone",
  ],
  _exoticScale: "",
  get exoticScale() {
    return this._exoticScale;
  },
  set exoticScale(newExoticScale) {
    if (this._exoticScale != newExoticScale) {
      if (this.exoticScales.includes(newExoticScale)) {
        this._exoticScale = newExoticScale;
      } else {
        this._exoticScale = "";
      }
      this.update();
    }
  },
  get exoticScaleIndex() {
    return this.exoticScales.indexOf(this._exoticScale) || 0;
  },
  set exoticScaleIndex(newExoticScaleIndex) {
    this.exoticScale = this.exoticScales[newExoticScaleIndex];
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

    if (this.exoticScale?.length > 0) {
      name += ` ${this.exoticScale}`;
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
  // references https://www.pianoscales.org/
  patterns: {
    major: [2, 2, 1, 2, 2, 2],
    minor: [2, 1, 2, 2, 1, 2],
    pentatonicMajor: [2, 2, 3, 2],
    pentatonicMinor: [3, 2, 2, 3],
    algerian: [2, 1, 2, 1, 1, 1, 3],
    arabic: [2, 2, 1, 1, 2, 2, 2],
    augmented: [3, 1, 3, 1, 3],
    balinese: [1, 2, 4, 1],
    byzantine: [1, 3, 1, 2, 1, 3],
    chinese: [4, 2, 1, 4],
    diminished: [2, 1, 2, 1, 2, 1, 2],
    "dominant diminished": [1, 2, 1, 2, 1, 2, 1],
    egyptian: [2, 3, 2, 3, 2],
    "eight tone spanish": [1, 2, 1, 1, 1, 2, 2],
    enigmatic: [1, 3, 2, 2, 2, 1],
    geez: [2, 1, 2, 2, 1, 2], // ethiopian
    hawaiian: [2, 1, 2, 2, 2, 2],
    hindu: [2, 2, 1, 2, 1, 2],
    hirajoshi: [2, 1, 4, 1],
    hungarian: [2, 1, 3, 1, 1, 3],
    iberian: [1, 3, 1, 2, 3],
    iwato: [1, 4, 1, 4],
    japanese: [1, 4, 2, 3],
    "lydian b7": [2, 2, 2, 1, 2, 1],
    maqam: [1, 3, 1, 2, 1, 3],
    "neapolitan minor": [1, 2, 2, 2, 1, 3],
    "neapolitan major": [1, 2, 2, 2, 2, 2],
    bebop: [2, 2, 1, 2, 1, 1, 2],
    oriental: [1, 3, 1, 1, 3, 1], // Chinese
    prometheus: [2, 2, 2, 3, 1], // mystic
    "romanian minor": [2, 1, 3, 1, 2, 1],
    "spanish gypsy": [1, 3, 1, 2, 1, 2],
    "super locrian": [1, 2, 1, 2, 2, 2],
    "whole tone": [2, 2, 2, 2, 2],
    yo: [2, 3, 2, 2],
    phrygian: [1, 2, 2, 2, 1, 2],
    "nine tone": [2, 1, 1, 2, 1, 1, 1, 2],
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
          if (this.exoticScales.includes(lowercasePatternName)) {
            scaleName += ` ${lowercasePatternName}`;
          } else {
            scaleName += lowercasePatternName.includes("major") ? "" : "m";
            scaleName += lowercasePatternName.includes("pentatonic") ? "p" : "";
          }
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
