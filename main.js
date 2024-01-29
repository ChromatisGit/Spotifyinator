const fs = require('fs');

filepath = '';

fs.readFile(filepath, 'utf8', (err, data) => {
  const jsonData = JSON.parse(data);


//Geht durch den JSON Datensatz und ändert das Format
const result = jsonData.reduce(
  (acc, entry) => {
    if (entry.ms_played > 30000 && entry.master_metadata_track_name) {

      const trackArtistKey = `${entry.master_metadata_track_name}-${entry.master_metadata_album_artist_name}`;
      const period = entry.ts.slice(0, 7);

      let id = acc.ids[trackArtistKey];

      // Check if the combination of track and artist has an id
      if (!id) {
        id = acc.idCounter++;
        acc.ids[trackArtistKey] = id;
        acc.songsData[id] = {
          track: entry.master_metadata_track_name,
          artist: entry.master_metadata_album_artist_name,
          uri: entry.spotify_track_uri,
          album: entry.master_metadata_album_album_name ?? "Local file",
        };
      }

      // Increase Play Count
      const periodMap = acc.playCountData[period] || (acc.playCountData[period] = {});
      periodMap[id] = (periodMap[id] ?? 0) + 1;
    }

    return acc;
  },
  { ids: {}, songsData: {}, playCountData: {}, idCounter: 1 }
);

let { songsData, playCountData } = result;

playCountData = Object.keys(playCountData).sort().reduce(
  (obj, key) => { 
    obj[key] = playCountData[key]; 
    return obj;
  }, 
  {}
);


const playCount = Object.create(process);
playCount.data = playCountData;
playCount.songs = songsData;

const topArtist = playCount.returnCopy()
const honorableMentions = playCount.returnCopy()
const allTime = playCount.returnCopy();

const topSongs = playCount.convertToSortedArray().getTop(10).returnUnique()
playCount.convertToSongObj()

topArtist.groupAll().groupByArtist().convertToSortedArray().getTop(10).convertToArtistObj()

honorableMentions.groupByYear().removeSongsInSet(topSongs).convertToSortedArray().getTop(15).convertToSongObj()

allTime.groupAll().convertToSortedArray().convertToSongObj()


// Write to file
fs.writeFileSync('json/topArtist.json', JSON.stringify(topArtist.data, null, 2));
fs.writeFileSync('json/playCount.json', JSON.stringify(playCount.data, null, 2));
fs.writeFileSync('json/honorableMentions.json', JSON.stringify(honorableMentions.data, null, 2));
fs.writeFileSync('json/topSongs.json', JSON.stringify(allTime.data, null, 2));

console.log('Data exported');

});


const process = {
  data: undefined,

  songs: undefined,

  returnCopy: function() {
    const copy = Object.create(process);
    copy.data = structuredClone(this.data);
    copy.songs = this.songs;
    return copy;
  },

  //Keeps only entries after this
  after: function(year, month) {
    let res = {};
  
    Object.entries(this.data).forEach(([period, data]) => {
      const year2 = Number(period.slice(0,4));
      const month2 = Number(period.slice(5,7));
  
      if(year2 > year || (year2 === year &&  month2 > month)) {
        res[period] = data;
      }
    });

    this.data = res;
    return this;
  },

  //Keeps only entries before this
  before: function(year, month) {
    let res = {};
  
    Object.entries(this.data).forEach(([period, data]) => {
      const year2 = Number(period.slice(0,4));
      const month2 = Number(period.slice(5,7));
  
      if(year2 < year || (year2 === year &&  month2 < month)) {
        res[period] = data;
      }
    });

    this.data = res;
    return this;
  },

  groupAll: function() {
    const res = {};
  
    Object.values(this.data).forEach(obj => {
      Object.entries(obj).forEach(([id, playCount]) => {
        res[id] = (res[id] ?? 0) + playCount;
      });
    });
  
    this.data = {total: res};

    return this;
  },

  groupByYear: function() {
    const res = {};
  
    Object.entries(this.data).forEach(([period, obj]) => {
      const year = period.slice(0,4);

      Object.entries(obj).forEach(([id, playCount]) => {
        const yearMap = res[year] || (res[year] = {});
        yearMap[id] = (yearMap[id] ?? 0) + playCount;
      });
    });
  
    this.data = res;

    return this;
  },

  groupByArtist: function() {
    const res = {};
  
    Object.entries(this.data).forEach(([period, obj]) => {
      Object.entries(obj).forEach(([id, playCount]) => {
        const artist = this.songs[id].artist
        const periodMap = res[period] || (res[period] = {});
        periodMap[artist] = (periodMap[artist] ?? 0) + playCount;
      });
    });
  
    this.data = res;

    return this;
  },

  removeSongsInSet(set) {
    Object.entries(this.data).forEach(([period, obj]) => {
      this.data[period] = Object.keys(obj)
        .filter(key => !set.has(key))
        .reduce((newObject, key) => {
          newObject[key] = obj[key];
          return newObject;
        }, {})
    })
    return this;
  },

  hasMorePlaysThan(val) {
    Object.entries(this.data).forEach(([period, obj]) => {
      this.data[period] = Object.fromEntries(
        Object.entries(obj).filter(([, value]) => value >= val)
      );
    })
    return this;
  },

  //Converts to a sorted array, all functions after this only work on sorted arrays
  convertToSortedArray: function() {
    Object.entries(this.data).forEach(([period, arr]) => {
      this.data[period] = Object.entries(arr).sort(([, a], [, b]) => b - a);
    })
    return this;
  },

  getTop: function(top) {
    Object.entries(this.data).forEach(([period, arr]) => {
      if (arr.length < top) {
        this.data[period] = arr
      }
      else {
        const minPlays = arr[top-1][1];
        this.data[period] = arr.slice(0, arr.findIndex((element) => element[1] < minPlays));
      }
    })
    return this;
  },

  convertToSongObj: function() {
    Object.entries(this.data).forEach(([period, arr]) => {
      let res = {};

      arr.forEach((entry, pos) => {
        res[pos] = {...this.songs[entry[0]], playCount: entry[1]};
      });
      
      this.data[period] = res;
    })
    return this;
  },

  convertToArtistObj: function() {
    Object.entries(this.data).forEach(([period, arr]) => {
      let res = {};

      arr.forEach((entry, pos) => {
        res[pos] = {artist: entry[0], playCount: entry[1]};
      });
      
      this.data[period] = res;
    })
    return this;
  },

  returnUnique: function() {
    const res = new Set();
  
    Object.values(this.data).forEach((arr) => {
      arr.forEach((entry) => {
        res.add(entry[0]);
      });
    });

    return res;
  }
}