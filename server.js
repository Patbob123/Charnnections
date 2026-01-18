require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static('static'));
app.use('/src', express.static('src'));
app.use('/views', express.static('views'));
app.use(express.static("public"));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html');
});

const characterSchema = new mongoose.Schema({
  malId: { type: Number, unique: true },
  name: String,
  nameKanji: String,
  series: String,
  imageUrl: String,
  about: String,
  favorites: Number,
  attributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  scrapedAt: { type: Date, default: Date.now }
}, { strict: false });

const Character = mongoose.model('Character', characterSchema);

const dailyPuzzleSchema = new mongoose.Schema({
  date: { type: String, unique: true },
  groups: [{
    trait: String,
    traitValue: mongoose.Schema.Types.Mixed,
    difficulty: Number,
    characters: [{
      malId: Number,
      name: String,
      series: String,
      imageUrl: String
    }]
  }],
  createdAt: { type: Date, default: Date.now }
});

const DailyPuzzle = mongoose.model('DailyPuzzle', dailyPuzzleSchema);

const attributeStandardSchema = new mongoose.Schema({
  canonical: String,
  type: String,
  category: String,
  difficulty: Number,
  examples: [String]
});

const AttributeStandard = mongoose.model('AttributeStandard', attributeStandardSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whocarfes';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to mongo'))
  .catch(err => console.error('mongo error:', err));

function getTodayDateString() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

let attributeIndex = null;
let lastIndexUpdate = null;
const INDEX_CACHE_TIME = 5 * 60 * 1000;

async function buildAttributeIndex() {
  console.log('Findeing attributes');
  const startTime = Date.now();
  
  const characters = await Character.find();
  console.log(`There are ${characters.length} characters in database`);
  
  if (characters.length === 0) {
    console.log('Empty database');
    return new Map();
  }
  
  const index = new Map();
  let totalAttributesProcessed = 0;
  let charactersWithAttributes = 0;
  let charactersWithoutAttributes = 0;
  
  characters.forEach((char, charIndex) => {
    if (!char.attributes || char.attributes.size === 0) {
      charactersWithoutAttributes++;
      if (charIndex < 5) {
        console.log(`character ${charIndex} (${char.name}) has no attributes`);
      }
      return;
    }
    
    charactersWithAttributes++;
    
    const attrObj = char.attributes instanceof Map 
      ? Object.fromEntries(char.attributes) 
      : (char.attributes.toObject ? char.attributes.toObject() : char.attributes);
    
    const entries = Object.entries(attrObj);
    
    if (charIndex < 3) {
      console.log(`\nCharacter ${charIndex}: ${char.name}`);
      console.log(`   Attributes (${entries.length} total):`, entries);
    }
    
    entries.forEach(([key, value]) => {
      totalAttributesProcessed++;
      const attrKey = `${key}|||${value}`;
      
      if (!index.has(attrKey)) {
        index.set(attrKey, {
          attribute: key,
          value: value,
          characters: []
        });
        
        if (index.size <= 10) {
          console.log(`   + New attribute: "${key}" = "${value}"`);
        }
      }
      
      index.get(attrKey).characters.push({
        malId: char.malId,
        name: char.name,
        series: char.series,
        imageUrl: char.imageUrl
      });
    });
  });
  
  console.log(`==============================================`);
  console.log(`\nIndex built in ${Date.now() - startTime}ms`);
  console.log(`Total characters in DB: ${characters.length}`);
  console.log(`Characters WITH attributes: ${charactersWithAttributes}`);
  console.log(`Characters WITHOUT attributes: ${charactersWithoutAttributes}`);
  console.log(`Total attribute entries processed: ${totalAttributesProcessed}`);
  console.log(`Unique attribute-value combinations: ${index.size}`);

  
  const validForPuzzle = Array.from(index.values()).filter(attr => attr.characters.length >= 4);
  console.log(`\n attributes with 4+ characters: ${validForPuzzle.length}`);
  if (validForPuzzle.length > 0) {
    console.log('aa');
    validForPuzzle.slice(0, 10).forEach(attr => {
      console.log(`   - "${attr.attribute}" = "${attr.value}" → ${attr.characters.length} characters`);
    });
  } else {
    console.log('   no attributes with more than 4 dudes');
    console.log('   need to re-do the data collection.');
  }
  
  return index;
}

async function getAttributeIndex() {
  const now = Date.now();
  
  if (!attributeIndex || !lastIndexUpdate || (now - lastIndexUpdate > INDEX_CACHE_TIME)) {
    attributeIndex = await buildAttributeIndex();
    lastIndexUpdate = now;
  }
  
  return attributeIndex;
}

async function generatePuzzle() {
  const MAX_ATTEMPTS = 50;
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`\n  ${attempt}/${MAX_ATTEMPTS}`);
    const startTime = Date.now();
    
    try {
      const index = await getAttributeIndex();
      
      const validAttributes = Array.from(index.values())
        .filter(attr => attr.characters.length >= 4);
      
      console.log(`guy with 4+`);
      
      if (validAttributes.length < 4) {
        throw new Error(`Not enough attributes (found ${validAttributes.length}, need at least 4)`);
      }
      
      for (let i = validAttributes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validAttributes[i], validAttributes[j]] = [validAttributes[j], validAttributes[i]];
      }
      
      const usedCharacters = new Set();
      const usedAttributeNames = new Set();
      const groups = [];
      
      for (const attr of validAttributes) {
        if (usedAttributeNames.has(attr.attribute)) {
          continue;
        }
        
        const availableChars = attr.characters.filter(char => !usedCharacters.has(char.malId));
        
        if (availableChars.length >= 4) {
          const selectedChars = availableChars.slice(0, 4);
          
          const attrStandard = await AttributeStandard.findOne({ canonical: attr.attribute });
          const difficulty = attrStandard?.difficulty || 3;
          
          selectedChars.forEach(char => usedCharacters.add(char.malId));
          usedAttributeNames.add(attr.attribute);
          
          groups.push({
            trait: attr.attribute,
            traitValue: attr.value,
            difficulty: difficulty,
            characters: selectedChars
          });
          
          console.log(`Group ${groups.length}: ${attr.attribute} = ${attr.value} (Difficulty: ${difficulty})`);
          console.log(`Characters: ${selectedChars.map(c => c.name).join(', ')}`);
          
          if (groups.length === 4) {
            break;
          }
        }
      }
      
      if (groups.length === 4) {
        const totalTime = Date.now() - startTime;
        console.log(`\nPuzzle is ready in ${totalTime}ms!`);
        return groups;
      } else {
        console.log(`Retrying puzzle generation`);
      }
      
    } catch (err) {
      console.error(`Puzzle gen died`, err.message);
    }
  }
  
  throw new Error(`Failed to generate puzzle after ${MAX_ATTEMPTS} attempts`);
}

async function getTodaysPuzzle() {
  const today = getTodayDateString();
  
  let puzzle = await DailyPuzzle.findOne({ date: today });
  
  if (puzzle) {
    console.log(`Loading existing puzzle for ${today}`);
    return puzzle;
  }
  
  // console.log("BRUH WTF??")
  console.log(`Creating new puzzle for ${today}`);
  const groups = await generatePuzzle();
  
  puzzle = await DailyPuzzle.create({
    date: today,
    groups
  });
  
  return puzzle;
}

function checkConnection(groups, malIds) {
  if (malIds.length !== 4) {
    return { valid: false, message: 'sss' };
  }
  
  for (const group of groups) {
    const groupIds = group.characters.map(c => c.malId);
    const allMatch = malIds.every(id => groupIds.includes(id));
    
    if (allMatch) {
      return {
        valid: true,
        correct: true,
        trait: group.trait,
        traitValue: group.traitValue,
        difficulty: group.difficulty,
        characters: group.characters
      };
    }
  }
  
  return {
    valid: true,
    correct: false,
    message: 'YOU SUCK'
  };
}


app.get('/api/game/today', async (req, res) => {
  try {
    const puzzle = await getTodaysPuzzle();
    
    // console.log("AAAAAA")
    const characters = puzzle.groups.flatMap(g => g.characters);
    
    for (let i = characters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [characters[i], characters[j]] = [characters[j], characters[i]];
    }
    
    res.json({
      puzzleId: puzzle._id,
      date: puzzle.date,
      characters,
      message: 'ddd'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/game/:puzzleId/check', async (req, res) => {
  try {
    const { malIds } = req.body;
    const puzzle = await DailyPuzzle.findById(req.params.puzzleId);
    
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    
    const result = checkConnection(puzzle.groups, malIds);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/game/:puzzleId/solution', async (req, res) => {
  try {
    const puzzle = await DailyPuzzle.findById(req.params.puzzleId);
    
    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    
    res.json({
      date: puzzle.date,
      groups: puzzle.groups.map(g => ({
        trait: g.trait,
        value: g.traitValue,
        characters: g.characters.map(c => c.name)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// app.get('/api/stats', async (req, res) => {
//   try {
//     const totalChars = await Character.countDocuments();
//     const totalPuzzles = await DailyPuzzle.countDocuments();
//     const todayDate = getTodayDateString();
//     const todayPuzzle = await DailyPuzzle.findOne({ date: todayDate });
    
//     const characters = await Character.find();
//     const attributeCounts = {};
    
//     characters.forEach(char => {
//       if (!char.attributes) return;
//       Object.keys(char.attributes.toObject()).forEach(key => {
//         attributeCounts[key] = (attributeCounts[key] || 0) + 1;
//       });
//     });
    
//     const topAttributes = Object.entries(attributeCounts)
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 10)
//       .map(([attr, count]) => ({ attribute: attr, count }));
    
//     res.json({
//       totalCharacters: totalChars,
//       totalPuzzles: totalPuzzles,
//       todaysPuzzleExists: !!todayPuzzle,
//       todayDate,
//       topAttributes
//     });
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.post('/api/admin/set-puzzle', async (req, res) => {
  try {
    const { groups, date } = req.body;
    
    if (!groups || !Array.isArray(groups) || groups.length !== 4) {
      return res.status(400).json({ error: 'Must provide exactly 4 groups' });
    }
    
    for (let i = 0; i < groups.length; i++) {
      if (!groups[i].malIds || groups[i].malIds.length !== 4) {
        return res.status(400).json({ 
          error: `Group ${i + 1} must have exactly 4 character IDs` 
        });
      }
    }
    
    const targetDate = date || getTodayDateString();
    
    const processedGroups = [];
    
    for (const group of groups) {
      const characters = await Character.find({ 
        malId: { $in: group.malIds } 
      });
      
      if (characters.length !== 4) {
        return res.status(400).json({ 
          error: `Could not find all characters for group "${group.trait}". Only ${characters} is fine` 
        });
      }
      
      processedGroups.push({
        trait: group.trait,
        traitValue: group.traitValue,
        difficulty: group.difficulty || 3,
        characters: characters.map(c => ({
          malId: c.malId,
          name: c.name,
          series: c.series,
          imageUrl: c.imageUrl
        }))
      });
    }
    
    await DailyPuzzle.deleteOne({ date: targetDate });
    
    const puzzle = await DailyPuzzle.create({
      date: targetDate,
      groups: processedGroups
    });
    
    res.json({
      message: `Puzzle set for ${targetDate}`,
      puzzleId: puzzle._id,
      groups: processedGroups.map(g => ({
        trait: g.trait,
        value: g.traitValue,
        characters: g.characters.map(c => c.name)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/regenerate-today', async (req, res) => { // who cares we gpt wrote this
  try {
    const today = getTodayDateString();
    
    // Delete existing puzzle for today
    await DailyPuzzle.deleteOne({ date: today });
    
    // Generate new one
    const puzzle = await getTodaysPuzzle();
    
    res.json({
      message: `Regenerated puzzle for ${today}`,
      puzzleId: puzzle._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n ====== Charnnection Server running on port ${PORT} ======\n`);
  console.log('Endpoints:');
  console.log('  GET  /api/game/today            - Get today\'s connections');
  console.log('  POST /api/game/:id/check        - Check answer');
  console.log('  GET  /api/game/:id/solution     - Get solution');
  //console.log('  GET  /api/stats                 - Database stats');
  console.log('  POST /api/admin/set-puzzle      - Manually set puzzle with character IDs');
  //console.log('  POST /api/admin/regenerate-today - Force regenerate today\'s puzzle\n');
});

module.exports = app;