const { useState, useEffect } = React;

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001/api' 
  : 'https://charnnections.onrender.com/';

const DIFFICULTY_COLORS = {
  1: 'bg-green-500',
  2: 'bg-blue-500',
  3: 'bg-yellow-500',
  4: 'bg-purple-500'
};

function RipoffConnections() {
  const [gameState, setGameState] = useState('loading');
  const [gameId, setGameId] = useState(null);
  const [gameDate, setGameDate] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [solvedGroups, setSolvedGroups] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [isWrong, setIsWrong] = useState(false);

  const MAX_MISTAKES = 4;

  useEffect(() => {
    if (gameDate) {
      loadProgress();
    }
  }, [gameDate]);

  useEffect(() => {
    if (gameDate && gameState !== 'loading') {
      saveProgress();
    }
  }, [gameState, characters, solvedGroups, mistakes, gameDate]);

  const loadProgress = () => {
    const saved = localStorage.getItem(`game_progress_${gameDate}`);
    if (saved) {
      try {
        const progress = JSON.parse(saved);
        console.log('Load from local:', progress);
        
        setGameState(progress.gameState);
        setCharacters(progress.characters);
        setSolvedGroups(progress.solvedGroups);
        setMistakes(progress.mistakes);
        setSelectedIds([]);
      } catch (err) {
        console.error('Error loading:', err);
      }
    } else {
      console.log('No saves', gameDate);
    }
  };

  const saveProgress = () => {
    const progress = {
      puzzleId: gameId,
      gameState,
      characters,
      solvedGroups,
      mistakes,
      savedAt: new Date().toISOString()
    };
    
    localStorage.setItem(`game_progress_${gameDate}`, JSON.stringify(progress));
    console.log('Saved to local');
  };

  useEffect(() => { startNewGame(); }, []);

  const startNewGame = async () => {
    setGameState('loading');
    try {
      const response = await fetch(`${API_BASE}/game/today`, { method: 'GET' });
      const data = await response.json();
      
      
      setGameId(data.puzzleId);
      setGameDate(data.date);
      
      // console.log("ADADAD")


      const saved = localStorage.getItem(`game_progress_${data.date}`);
      
      if (saved) {
        const progress = JSON.parse(saved);

        if (progress.puzzleId === data.puzzleId) {
          setGameState(progress.gameState);
          setCharacters(progress.characters);
          setSolvedGroups(progress.solvedGroups);
          setMistakes(progress.mistakes);
        } else {
          localStorage.removeItem(`game_progress_${data.date}`);
          setCharacters(data.characters);
          setSelectedIds([]);
          setSolvedGroups([]);
          setMistakes(0);
          setGameState('playing');
        }
      } else {
        console.log('Start new gam');
        setCharacters(data.characters);
        setSelectedIds([]);
        setSolvedGroups([]);
        setMistakes(0);
        setGameState('playing');
      }
    } catch (err) { 
      console.error('Error start game:', err);
    }
  };

  const toggleSelection = (malId) => {
    if (selectedIds.includes(malId)) {
      setSelectedIds(selectedIds.filter(id => id !== malId));
    } else if (selectedIds.length < 4) {
      setSelectedIds([...selectedIds, malId]);
    }
  };

  const revealRemainingGroups = async () => {
    try {
      const response = await fetch(`${API_BASE}/game/${gameId}/solution`);
      const result = await response.json();

      if (result.groups) {
        const formattedGroups = result.groups.map((group, idx) => ({
          trait: group.trait,
          traitValue: group.value,
          difficulty: idx + 1,
          characters: group.characters.map(name => ({ name }))
        }));
        setSolvedGroups(formattedGroups);
        setCharacters([]);
      }
    } catch (err) {
      console.error('Error revealing groups:', err);
    }
  };

  const submitGuess = async () => {
    if (selectedIds.length !== 4) return;
    try {
      const response = await fetch(`${API_BASE}/game/${gameId}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ malIds: selectedIds })
      });
      const result = await response.json();
      if (result.correct) {
        const newSolvedGroups = [...solvedGroups, result];
        const newCharacters = characters.filter(c => !selectedIds.includes(c.malId));
        
        setSolvedGroups(newSolvedGroups);
        setCharacters(newCharacters);
        setSelectedIds([]);
        
        if (newSolvedGroups.length === 4) {
          playWinSound();
          setGameState('won');
        }
      } else {
        setIsWrong(true);
        setTimeout(() => setIsWrong(false), 400);
        playWrongSound();
        const newMistakes = mistakes + 1;
        setMistakes(newMistakes);
        setSelectedIds([]);
        if (newMistakes >= MAX_MISTAKES) {
          setGameState('lost');
          await revealRemainingGroups();
        }
      }
    } catch (err) { console.error('ded:', err); }
  };

  const playWrongSound = () => {
    const audio = new Audio('/royal-cry.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log(""));
  };

  const playWinSound = () => {
    const audio = new Audio('/royal-laugh.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log(""));

    const audio2 = new Audio('/san_jose_strut.mp3');
    audio2.volume = 0.5;
    audio2.play().catch(e => console.log(""));
  };

  if (gameState === 'loading') return (
    <div className="h-[100dvh] bg-slate-950 flex items-center justify-center text-white font-sans">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent" />
    </div>
  );

  return (
    <div className="h-[100dvh] bg-slate-950 text-white flex flex-col overflow-hidden font-sans select-none">
      <header className="pt-4 pb-2 md:py-4 px-4 flex justify-between items-center shrink-0 relative">
        <h1 className="flex items-center gap-2 text-xl md:text-2xl font-black italic tracking-tighter">
          <img
            src="/favicon.png"
            className="h-[1.2em] w-auto"
            alt="Logo"
          />
          <span>CHARNNECTIONS</span>
        </h1>

        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 font-medium text-white/60 tracking-widest text-sm uppercase">
          {gameDate || 'Group 4x4'}
        </div>

        <div className="flex gap-1.5 items-center">
          <span className="text-[10px] md:text-xs uppercase font-bold mr-1 opacity-50">HP:</span>
          {[...Array(MAX_MISTAKES)].map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 md:w-4 md:h-4 rounded-full border border-white/20 transition-colors ${i < MAX_MISTAKES - mistakes ? 'bg-yellow-400' : 'bg-transparent'
                }`}
            />
          ))}
        </div>
      </header>

      <main className={`flex-[3] flex flex-col p-2 gap-2 max-w-md mx-auto w-full min-h-0 transition-colors duration-150 rounded-xl ${isWrong ? 'bg-red-800 animate-shake' : ''}`}>

        <div className="flex flex-col gap-2">
          {solvedGroups.map((group, idx) => (
            <div key={idx} className={`${DIFFICULTY_COLORS[group.difficulty]} rounded-xl flex flex-col items-center justify-center text-center p-3 min-h-[5rem] border border-white/10 shadow-lg animate-in fade-in slide-in-from-top-4 duration-500`}>
              <span className="text-sm font-black uppercase opacity-90 leading-none mb-1">{group.trait}</span>
              <span className={`text-lg font-bold leading-tight uppercase ${group.traitValue=='true' ? 'hidden' : ''} `}>{group.traitValue}</span>
              <span className="text-xs mt-1 opacity-90 truncate w-full px-2">
                {group.characters.map(c => c.name).join(' 𓆣 ')}
              </span>
            </div>
          ))}
        </div>

        {gameState === 'playing' && (
          <div className="flex-1 grid grid-cols-4 gap-2 min-h-0">
            {characters.map((char) => {
              const isSelected = selectedIds.includes(char.malId);
              return (
                <button
                  key={char.malId}
                  onClick={() => toggleSelection(char.malId)}
                  className={`relative flex flex-col rounded-xl overflow-hidden transition-all duration-200 h-full border ${isSelected ? 'ring-2 ring-yellow-400 border-transparent z-10 scale-[1.02]' : 'bg-slate-900 border-white/10'}`}
                >
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <img
                      src={char.imageUrl}
                      className={`w-full h-full object-cover pointer-events-none ${isSelected ? 'brightness-50 opacity-60' : ''}`}
                    />
                  </div>
                  <div className={`shrink-0 w-full flex items-center justify-center px-1 py-1.5 min-h-[1.3rem] ${isSelected ? 'bg-yellow-400 text-slate-950' : 'bg-black/80 text-white'}`}>
                    <p className="text-[9px] font-black leading-tight text-center line-clamp-2 break-words uppercase tracking-tighter">
                      {char.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {(gameState === 'won' || gameState === 'lost') && (
          <div className="py-1 px-2 w-fit mx-auto flex flex-col items-center animate-in fade-in zoom-in duration-700">

            <img
              src={gameState === 'won' ? '/cake.jpg' : '/crying_gob.jpg'}
              alt={gameState === 'won' ? 'w' : 'g'}
              className="min-h-[2rem] w-auto object-contain rounded-lg shadow-md"
            />

            <div className="text-center">
              <h2 className="text-lg font-black leading-none py-1">
                {gameState === 'won' ? 'W' : 'L'}
              </h2>
            </div>

          </div>
        )}
      </main>

      {gameState === 'playing' && (
        <footer className="p-4 pb-6 shrink-0 bg-slate-950">
          <div className="flex gap-2 max-w-md mx-auto h-12">
            <button
              onClick={() => setCharacters([...characters].sort(() => Math.random() - 0.5))}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl text-xs font-bold active:bg-white/10 text-white"
            >
              SHUFFLE
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl text-xs font-bold active:bg-white/10 text-white"
            >
              CELAR
            </button>
            <button
              onClick={submitGuess}
              disabled={selectedIds.length !== 4}
              className={`flex-[2] rounded-xl font-black transition-transform active:scale-95 ${selectedIds.length === 4 ? 'bg-white text-slate-950' : 'bg-white/5 text-white/20'}`}
            >
              SUBMIT
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<RipoffConnections />);