// Instrument Types
import PianoOgg from "./ogg/index.js";

const typeMap = {
    ogg: PianoOgg,
  },
  Pianos = {
    PianoOgg,
    getByType: function (type) {
      return typeMap[type];
    },
  };

export default Pianos;
