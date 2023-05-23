// Instrument Types
import PianoMp3 from "./mp3/index.js";
import PianoOgg from "./ogg/index.js";

const typeMap = {
    mp3: PianoMp3,
    ogg: PianoOgg,
  },
  Pianos = {
    PianoMp3,
    PianoOgg,
    getByType: function (type) {
      return typeMap[type];
    },
  };

export default Pianos;
