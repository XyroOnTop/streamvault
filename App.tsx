import { useState, useEffect, useCallback, useRef } from 'react';

// TMDB API Configuration
const TMDB_API_KEY = '2dca580c2a14b55200e784d157207b4d';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Video Providers
interface Provider {
  id: string;
  name: string;
  movieUrl: (id: number) => string;
  tvUrl: (id: number, season: number, episode: number) => string;
  hasAds: boolean;
}

const PROVIDERS: Provider[] = [
  {
    id: 'videasy',
    name: 'Videasy',
    movieUrl: (id) => `https://player.videasy.ws/embed/movie/${id}?ds_lang=en`,
    tvUrl: (id, s, e) => `https://player.videasy.ws/embed/tv/${id}/${s}/${e}?ds_lang=en&autonext=1`,
    hasAds: false
  },
  {
    id: 'vidsrc-pro',
    name: 'VidSrc Pro',
    movieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`,
    hasAds: false
  },
  {
    id: 'embed-su',
    name: 'Embed.su',
    movieUrl: (id) => `https://embed.su/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
    hasAds: false
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc',
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
    hasAds: true
  }
];

// User & Watch Progress Types
interface User {
  id: string;
  username: string;
  email: string;
}

interface WatchProgress {
  mediaId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  progress: number; // seconds
  duration: number; // seconds
  season?: number;
  episode?: number;
  episodeTitle?: string;
  lastWatched: number; // timestamp
}

// Types
interface Movie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  genre_ids?: number[];
}

interface TVShowDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  first_air_date: string;
  number_of_seasons: number;
  seasons: Season[];
  genres: { id: number; name: string }[];
}

interface Season {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string;
  poster_path: string | null;
  overview: string;
}

interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview: string;
  air_date: string;
  still_path: string | null;
  vote_average: number;
  runtime: number;
}

interface MovieDetails {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  runtime: number;
  genres: { id: number; name: string }[];
}

// Genre mapping
const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie',
  53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
  10767: 'Talk', 10768: 'War & Politics'
};

// User Management Functions
function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('streamvault_user');
  return userStr ? JSON.parse(userStr) : null;
}

function setCurrentUser(user: User | null) {
  if (user) {
    localStorage.setItem('streamvault_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('streamvault_user');
  }
}

function registerUser(username: string, email: string, password: string): User | null {
  const usersStr = localStorage.getItem('streamvault_users');
  const users: Array<User & { password: string }> = usersStr ? JSON.parse(usersStr) : [];
  
  if (users.find(u => u.email === email)) {
    return null; // Email already exists
  }
  
  const newUser: User & { password: string } = {
    id: Date.now().toString(),
    username,
    email,
    password // In production, this should be hashed
  };
  
  users.push(newUser);
  localStorage.setItem('streamvault_users', JSON.stringify(users));
  
  const { password: _, ...userWithoutPassword } = newUser;
  setCurrentUser(userWithoutPassword);
  return userWithoutPassword;
}

function loginUser(email: string, password: string): User | null {
  const usersStr = localStorage.getItem('streamvault_users');
  const users: Array<User & { password: string }> = usersStr ? JSON.parse(usersStr) : [];
  
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    const { password: _, ...userWithoutPassword } = user;
    setCurrentUser(userWithoutPassword);
    return userWithoutPassword;
  }
  return null;
}

function logoutUser() {
  setCurrentUser(null);
}

// Watch Progress Functions
function getWatchProgress(): WatchProgress[] {
  const user = getCurrentUser();
  if (!user) return [];
  
  const progressStr = localStorage.getItem(`watch_progress_${user.id}`);
  return progressStr ? JSON.parse(progressStr) : [];
}

function saveWatchProgress(progress: Omit<WatchProgress, 'lastWatched'>) {
  const user = getCurrentUser();
  if (!user) return;
  
  const allProgress = getWatchProgress();
  const existingIndex = allProgress.findIndex(
    p => p.mediaId === progress.mediaId && p.mediaType === progress.mediaType
  );
  
  const updatedProgress: WatchProgress = {
    ...progress,
    lastWatched: Date.now()
  };
  
  if (existingIndex >= 0) {
    allProgress[existingIndex] = updatedProgress;
  } else {
    allProgress.unshift(updatedProgress);
  }
  
  // Keep only last 50 items
  const trimmed = allProgress.slice(0, 50);
  localStorage.setItem(`watch_progress_${user.id}`, JSON.stringify(trimmed));
}

function getContinueWatching(): WatchProgress[] {
  return getWatchProgress()
    .filter(p => p.progress > 0 && p.progress < p.duration * 0.9) // Not completed
    .sort((a, b) => b.lastWatched - a.lastWatched);
}

function clearWatchHistory() {
  const user = getCurrentUser();
  if (!user) return;
  localStorage.removeItem(`watch_progress_${user.id}`);
}

// API Functions
async function fetchTrending(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchPopularMovies(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchTopRatedMovies(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/top_rated?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchPopularTV(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/popular?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchNowPlaying(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/now_playing?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchTopRatedTV(): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/top_rated?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.results || [];
}

async function fetchByGenre(mediaType: 'movie' | 'tv', genreId: number): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/discover/${mediaType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&sort_by=popularity.desc`);
  const data = await res.json();
  return (data.results || []).map((item: Movie) => ({ ...item, media_type: mediaType }));
}

async function searchMulti(query: string): Promise<Movie[]> {
  const res = await fetch(`${TMDB_BASE_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
  const data = await res.json();
  return (data.results || []).filter((item: Movie) => item.media_type === 'movie' || item.media_type === 'tv');
}

async function fetchTVDetails(id: number): Promise<TVShowDetails> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}`);
  return res.json();
}

async function fetchMovieDetails(id: number): Promise<MovieDetails> {
  const res = await fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`);
  return res.json();
}

async function fetchEpisodes(tvId: number, season: number): Promise<Episode[]> {
  const res = await fetch(`${TMDB_BASE_URL}/tv/${tvId}/season/${season}?api_key=${TMDB_API_KEY}`);
  const data = await res.json();
  return data.episodes || [];
}

// Auth Modal Component
function AuthModal({ onClose, onAuth }: { onClose: () => void; onAuth: (user: User) => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      const user = loginUser(email, password);
      if (user) {
        onAuth(user);
        onClose();
      } else {
        setError('Invalid email or password');
      }
    } else {
      if (!username.trim()) {
        setError('Username is required');
        return;
      }
      const user = registerUser(username, email, password);
      if (user) {
        onAuth(user);
        onClose();
      } else {
        setError('Email already registered');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-6 sm:p-8 max-w-md w-full border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                placeholder="Choose a username"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              placeholder="your@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-semibold transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Components
function Header({ onSearch, onHomeClick, onCategoryClick, user, onLoginClick, onLogout, onClearHistory }: { onSearch: (q: string) => void; onHomeClick: () => void; onCategoryClick: (cat: string) => void; user: User | null; onLoginClick: () => void; onLogout: () => void; onClearHistory: () => void }) {
  const [query, setQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setMobileMenuOpen(false);
    }
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-gray-950/95 backdrop-blur-md shadow-lg shadow-black/20' : 'bg-gradient-to-b from-gray-950/80 to-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <button onClick={onHomeClick} className="flex items-center gap-2 shrink-0 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-violet-500/30 group-hover:shadow-violet-500/50 transition-shadow">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent hidden sm:block">
            StreamVault
          </span>
        </button>

        <form onSubmit={handleSubmit} className="flex-1 max-w-xl">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies & TV shows..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all text-sm"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </form>

        <nav className="hidden md:flex items-center gap-1">
          <button onClick={onHomeClick} className="px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            Home
          </button>
          <button onClick={() => onCategoryClick('movie')} className="px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            Movies
          </button>
          <button onClick={() => onCategoryClick('tv')} className="px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            TV Shows
          </button>
          <button onClick={() => onCategoryClick('anime')} className="px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
            Anime
          </button>
        </nav>

        {/* User Profile / Login */}
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-xs font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-300">{user.username}</span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                <div className="p-2">
                  <div className="px-3 py-2 border-b border-white/5 mb-1">
                    <p className="text-sm font-medium text-white">{user.username}</p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={onClearHistory}
                    className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                  >
                    🗑️ Clear Watch History
                  </button>
                  <button
                    onClick={onLogout}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-all"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-gray-950/98 backdrop-blur-md border-t border-white/5 animate-fade-in">
          <div className="px-4 py-4 space-y-2">
            {user ? (
              <div className="flex items-center gap-3 px-4 py-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-sm font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{user.username}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>
            ) : null}
            <button onClick={() => { onHomeClick(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
              🏠 Home
            </button>
            <button onClick={() => { onCategoryClick('movie'); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
              🎬 Movies
            </button>
            <button onClick={() => { onCategoryClick('tv'); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
              📺 TV Shows
            </button>
            <button onClick={() => { onCategoryClick('anime'); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-white/5 transition-all">
              🎌 Anime
            </button>
            {user ? (
              <button onClick={() => { onLogout(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-red-400 hover:text-red-300 rounded-lg hover:bg-white/5 transition-all">
                🚪 Sign Out
              </button>
            ) : (
              <button onClick={() => { onLoginClick(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-violet-400 hover:text-violet-300 rounded-lg hover:bg-white/5 transition-all font-medium">
                🔑 Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function HeroBanner({ item, onPlay }: { item: Movie | null; onPlay: (item: Movie) => void }) {
  if (!item) return null;

  return (
    <div className="relative h-[70vh] sm:h-[80vh] w-full overflow-hidden">
      <div className="absolute inset-0">
        {item.backdrop_path && (
          <img
            src={`${TMDB_IMAGE_BASE}/original${item.backdrop_path}`}
            alt={item.title || item.name || ''}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-gray-950/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-gray-950/80 via-transparent to-transparent" />
      </div>
      <div className="relative h-full flex items-end pb-16 sm:pb-24 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="max-w-2xl space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-md border border-violet-500/30">
              {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
            </span>
            <span className="text-yellow-400 flex items-center gap-1">
              ★ {item.vote_average?.toFixed(1)}
            </span>
            <span className="text-gray-400">
              {item.release_date?.slice(0, 4) || item.first_air_date?.slice(0, 4)}
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            {item.title || item.name}
          </h1>
          <p className="text-gray-300 text-sm sm:text-base line-clamp-3 max-w-lg">
            {item.overview}
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onPlay(item)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-semibold text-sm sm:text-base transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Watch Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentRow({ title, items, onItemClick }: { title: string; items: Movie[]; onItemClick: (item: Movie) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.8;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (!items.length) return null;

  return (
    <section className="py-6 sm:py-8">
      <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 px-4 sm:px-6 max-w-7xl mx-auto">{title}</h2>
      <div className="relative group">
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-gray-950/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <ContentCard key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </div>
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-gray-950/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </section>
  );
}

function ContentCard({ item, onClick }: { item: Movie; onClick: () => void }) {
  const title = item.title || item.name || 'Unknown';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);

  return (
    <button
      onClick={onClick}
      className="shrink-0 w-36 sm:w-44 group cursor-pointer text-left"
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 ring-1 ring-white/5 group-hover:ring-violet-500/50 transition-all group-hover:scale-105 group-hover:shadow-xl group-hover:shadow-violet-500/10">
        {item.poster_path ? (
          <img
            src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
            <span className="text-gray-500 text-xs text-center px-2">{title}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <div className="flex items-center gap-1">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        {item.media_type && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium bg-violet-500/90 rounded text-white">
            {item.media_type === 'tv' ? 'TV' : 'Movie'}
          </span>
        )}
      </div>
      <h3 className="text-xs sm:text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
        {title}
      </h3>
      <p className="text-[11px] text-gray-500">
        {year} • ★ {item.vote_average?.toFixed(1)}
      </p>
    </button>
  );
}

function SearchResults({ results, query, onItemClick }: { results: Movie[]; query: string; onItemClick: (item: Movie) => void }) {
  return (
    <div className="pt-24 pb-12 px-4 sm:px-6 max-w-7xl mx-auto">
      <h2 className="text-xl sm:text-2xl font-bold mb-6">
        Search results for "<span className="text-violet-400">{query}</span>"
      </h2>
      {results.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-gray-400 text-lg">No results found</p>
          <p className="text-gray-500 text-sm mt-2">Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {results.map((item) => (
            <ContentCard key={item.id} item={item} onClick={() => onItemClick(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailView({ item, onBack, onPlay }: { item: Movie; onBack: () => void; onPlay: () => void }) {
  const [details, setDetails] = useState<MovieDetails | TVShowDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetchDetails = async () => {
      try {
        if (item.media_type === 'tv') {
          const data = await fetchTVDetails(item.id);
          setDetails(data);
        } else {
          const data = await fetchMovieDetails(item.id);
          setDetails(data);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchDetails();
  }, [item]);

  const title = item.title || item.name || 'Unknown';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);

  return (
    <div className="pt-16">
      <div className="relative">
        {item.backdrop_path && (
          <div className="h-[40vh] sm:h-[50vh] relative">
            <img
              src={`${TMDB_IMAGE_BASE}/original${item.backdrop_path}`}
              alt={title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/50 to-transparent" />
          </div>
        )}
        <div className={`${item.backdrop_path ? 'absolute bottom-0 left-0 right-0' : 'pt-8'} px-4 sm:px-6 max-w-7xl mx-auto`}>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 pb-8">
            {item.poster_path && (
              <div className="shrink-0 w-32 sm:w-48 mx-auto sm:mx-0">
                <img
                  src={`${TMDB_IMAGE_BASE}/w500${item.poster_path}`}
                  alt={title}
                  className="w-full rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/10"
                />
              </div>
            )}
            <div className="flex-1 text-center sm:text-left">
              <button onClick={onBack} className="mb-3 text-sm text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
              <h1 className="text-2xl sm:text-4xl font-bold mb-2">{title}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm text-gray-400 mb-4">
                <span className="text-yellow-400">★ {item.vote_average?.toFixed(1)}</span>
                <span>{year}</span>
                {details && 'genres' in details && (
                  <span>{details.genres?.map(g => g.name).join(', ')}</span>
                )}
                {details && 'runtime' in details && details.runtime && (
                  <span>{Math.floor(details.runtime / 60)}h {details.runtime % 60}m</span>
                )}
                {details && 'number_of_seasons' in details && (
                  <span>{details.number_of_seasons} Season{details.number_of_seasons > 1 ? 's' : ''}</span>
                )}
              </div>
              <p className="text-gray-300 text-sm sm:text-base max-w-2xl mb-6 leading-relaxed">
                {item.overview}
              </p>
              <button
                onClick={onPlay}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-semibold text-sm transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-105"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                Watch Now
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function PlayerModal({ item, onClose, isTV, user, initialProgress }: { 
  item: Movie; 
  onClose: () => void; 
  isTV?: boolean;
  user: User | null;
  initialProgress?: WatchProgress | null;
}) {
  const [season, setSeason] = useState(initialProgress?.season || 1);
  const [episode, setEpisode] = useState(initialProgress?.episode || 1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [tvDetails, setTvDetails] = useState<TVShowDetails | null>(null);
  const [showEpisodePicker, setShowEpisodePicker] = useState(() => window.innerWidth >= 1024);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(() => {
    return localStorage.getItem('preferred_provider') || 'videasy';
  });
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (isTV) {
      fetchTVDetails(item.id).then(setTvDetails);
    }
  }, [item, isTV]);

  useEffect(() => {
    if (isTV && tvDetails) {
      setLoadingEpisodes(true);
      fetchEpisodes(item.id, season).then((eps) => {
        setEpisodes(eps);
        setLoadingEpisodes(false);
      });
    }
  }, [isTV, item.id, season, tvDetails]);

  // Save watch progress periodically
  useEffect(() => {
    if (!user) return;
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PLAYER_EVENT') {
        const data = event.data.data;
        if (data && data.player_progress !== undefined) {
          const ep = episodes.find(e => e.episode_number === episode);
          saveWatchProgress({
            mediaId: item.id,
            mediaType: isTV ? 'tv' : 'movie',
            title: item.title || item.name || 'Unknown',
            posterPath: item.poster_path,
            progress: data.player_progress,
            duration: data.player_duration || 0,
            season: isTV ? season : undefined,
            episode: isTV ? episode : undefined,
            episodeTitle: isTV ? ep?.name : undefined,
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Also save on interval as fallback
    const interval = setInterval(() => {
      // Try to get progress from iframe
      try {
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ type: 'GET_PROGRESS' }, '*');
        }
      } catch (e) { /* cross-origin restriction */ }
    }, 15000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(interval);
    };
  }, [user, item, isTV, season, episode, episodes]);

  // Space bar to pause/play
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        try {
          if (iframeRef.current?.contentWindow) {
            // Send play/pause command to player
            iframeRef.current.contentWindow.postMessage({ type: 'TOGGLE_PLAY' }, '*');
          }
        } catch (err) { /* cross-origin */ }
      }
      // Escape to close
      if (e.code === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider) || PROVIDERS[0];
  
  // Build embed URL with resume support
  let baseEmbedUrl = isTV
    ? currentProvider.tvUrl(item.id, season, episode)
    : currentProvider.movieUrl(item.id);
  
  // Add startAt parameter if resuming
  const hasResume = initialProgress && initialProgress.progress > 10 && initialProgress.season === season && initialProgress.episode === episode;
  if (hasResume && selectedProvider === 'videasy') {
    const startAt = Math.floor(initialProgress.progress);
    baseEmbedUrl += `&startAt=${startAt}`;
  }
  
  const embedUrl = baseEmbedUrl;

  const title = item.title || item.name || 'Unknown';

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    localStorage.setItem('preferred_provider', providerId);
    setShowProviderMenu(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-gray-950/90 backdrop-blur-sm border-b border-white/5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <h2 className="text-sm sm:text-base font-semibold truncate">{title}</h2>
          {isTV && (
            <span className="text-xs text-gray-400 shrink-0 bg-white/5 px-2 py-0.5 rounded">
              S{season} E{episode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Provider Selector */}
          <div className="relative">
            <button
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className="px-2.5 sm:px-3 py-1.5 text-xs bg-white/5 text-gray-300 rounded-lg border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="hidden sm:inline">{currentProvider.name}</span>
              <span className="sm:hidden">Source</span>
            </button>
            {showProviderMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-gray-900 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide px-2 py-1">Video Source</p>
                  {PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleProviderChange(provider.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between ${
                        selectedProvider === provider.id
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{provider.name}</span>
                      <div className="flex items-center gap-1.5">
                        {!provider.hasAds && (
                          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">No Ads</span>
                        )}
                        {selectedProvider === provider.id && (
                          <svg className="w-4 h-4 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-white/5 px-3 py-2">
                  <p className="text-[10px] text-gray-500">
                    💡 Tip: Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-gray-400">Space</kbd> to pause/play
                  </p>
                </div>
              </div>
            )}
          </div>

          {isTV && (
            <button
              onClick={() => setShowEpisodePicker(!showEpisodePicker)}
              className="px-2.5 sm:px-3 py-1.5 text-xs bg-violet-500/20 text-violet-300 rounded-lg border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
            >
              <span className="hidden sm:inline">Episodes</span>
              <span className="sm:hidden">EP</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Player */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center bg-black p-1 sm:p-4">
          {/* Resume indicator */}
          {hasResume && (
            <div className="w-full max-w-7xl mb-2 px-1">
              <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Resuming from {Math.floor((initialProgress?.progress || 0) / 60)}m {Math.floor((initialProgress?.progress || 0) % 60)}s</span>
              </div>
            </div>
          )}
          <div className="relative w-full max-w-7xl" style={{ paddingBottom: '56.25%' }}>
            <iframe
              ref={iframeRef}
              src={embedUrl}
              className="absolute inset-0 w-full h-full rounded-lg"
              frameBorder="0"
              allowFullScreen
              allow="encrypted-media; autoplay; fullscreen; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
            />
          </div>
          {/* Ad-block tip */}
          {currentProvider.hasAds && (
            <div className="w-full max-w-7xl mt-2 px-1">
              <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                <span>💡</span>
                <span>This source may show ads. Try another source (Videasy, VidSrc Pro, or Embed.su are ad-free) or use an ad-blocker extension.</span>
              </div>
            </div>
          )}
          {/* Not logged in notice */}
          {!user && (
            <div className="w-full max-w-7xl mt-2 px-1">
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5">
                <span>🔑</span>
                <span>Sign in to save your watch progress and pick up where you left off next time.</span>
              </div>
            </div>
          )}
        </div>

        {/* Episode Sidebar */}
        {isTV && showEpisodePicker && tvDetails && (
          <div className="lg:w-80 xl:w-96 bg-gray-900/95 border-t lg:border-t-0 lg:border-l border-white/5 overflow-y-auto max-h-[40vh] lg:max-h-full">
            <div className="p-4 space-y-4">
              {/* Season Selector */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2 block">Season</label>
                <div className="flex flex-wrap gap-1.5">
                  {tvDetails.seasons
                    .filter(s => s.season_number > 0)
                    .map((s) => (
                      <button
                        key={s.season_number}
                        onClick={() => { setSeason(s.season_number); setEpisode(1); }}
                        className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                          season === s.season_number
                            ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        S{s.season_number}
                      </button>
                    ))}
                </div>
              </div>

              {/* Episodes List */}
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-2 block">Episodes</label>
                {loadingEpisodes ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {episodes.map((ep) => (
                      <button
                        key={ep.id}
                        onClick={() => setEpisode(ep.episode_number)}
                        className={`w-full text-left p-2.5 rounded-lg transition-all ${
                          episode === ep.episode_number
                            ? 'bg-violet-500/20 border border-violet-500/30'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`text-xs font-bold mt-0.5 ${episode === ep.episode_number ? 'text-violet-400' : 'text-gray-500'}`}>
                            {ep.episode_number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${episode === ep.episode_number ? 'text-white' : 'text-gray-300'}`}>
                              {ep.name}
                            </p>
                            {ep.runtime && (
                              <p className="text-[10px] text-gray-500 mt-0.5">{ep.runtime}m</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 border-[3px] border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 text-sm">Loading StreamVault...</p>
      </div>
    </div>
  );
}

// Main App
export default function App() {
  const [view, setView] = useState<'home' | 'search' | 'detail' | 'category'>('home');
  const [trending, setTrending] = useState<Movie[]>([]);
  const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
  const [topRated, setTopRated] = useState<Movie[]>([]);
  const [popularTV, setPopularTV] = useState<Movie[]>([]);
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<Movie | null>(null);
  const [playerItem, setPlayerItem] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [categoryItems, setCategoryItems] = useState<Movie[]>([]);
  const [categoryTitle, setCategoryTitle] = useState('');
  const [nowPlaying, setNowPlaying] = useState<Movie[]>([]);
  const [topRatedTV, setTopRatedTV] = useState<Movie[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [genreItems, setGenreItems] = useState<Movie[]>([]);
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [trend, pop, top, tv, nowPlay, topTV] = await Promise.all([
          fetchTrending(),
          fetchPopularMovies(),
          fetchTopRatedMovies(),
          fetchPopularTV(),
          fetchNowPlaying(),
          fetchTopRatedTV()
        ]);
        setTrending(trend);
        setPopularMovies(pop);
        setTopRated(top);
        setPopularTV(tv);
        setNowPlaying(nowPlay);
        setTopRatedTV(topTV);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Rotate hero banner
  useEffect(() => {
    if (trending.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(trending.length, 5));
    }, 8000);
    return () => clearInterval(interval);
  }, [trending]);

  // Load continue watching
  useEffect(() => {
    if (user) {
      setContinueWatching(getContinueWatching());
    }
  }, [user, playerItem]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setView('search');
    try {
      const results = await searchMulti(query);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleCategoryClick = useCallback(async (category: string) => {
    setView('category');
    setSearchQuery('');
    try {
      let items: Movie[] = [];
      let title = '';
      if (category === 'movie') {
        items = await fetchPopularMovies();
        title = '🎬 Popular Movies';
      } else if (category === 'tv') {
        items = await fetchPopularTV();
        title = '📺 Popular TV Shows';
      } else if (category === 'anime') {
        // Search for anime via TMDB
        const res = await fetch(`${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=anime&with_genres=16`);
        const data = await res.json();
        items = (data.results || []).map((item: Movie) => ({ ...item, media_type: 'tv' }));
        title = '🎌 Anime';
      }
      setCategoryItems(items);
      setCategoryTitle(title);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleItemClick = useCallback((item: Movie) => {
    setSelectedItem(item);
    setView('detail');
    window.scrollTo(0, 0);
  }, []);

  const handlePlay = useCallback((item: Movie) => {
    setPlayerItem(item);
    if (!user) {
      // Show a gentle reminder that progress won't be saved
      // We'll handle this with a state flag in the player
    }
  }, [user]);

  const handleGenreSelect = useCallback(async (genreId: number) => {
    if (selectedGenre === genreId) {
      setSelectedGenre(null);
      setGenreItems([]);
      return;
    }
    setSelectedGenre(genreId);
    try {
      const [movies, tvShows] = await Promise.all([
        fetchByGenre('movie', genreId),
        fetchByGenre('tv', genreId)
      ]);
      setGenreItems([...movies, ...tvShows].sort(() => Math.random() - 0.5));
    } catch (err) {
      console.error(err);
    }
  }, [selectedGenre]);

  const handleHome = useCallback(() => {
    setView('home');
    setSelectedItem(null);
    setSearchQuery('');
    setCategoryItems([]);
    setSelectedGenre(null);
    setGenreItems([]);
  }, []);

  if (loading) return <LoadingSpinner />;

  const heroItem = trending[heroIndex] || null;

  return (
    <div className="min-h-screen bg-gray-950 text-white font-['Inter',sans-serif]">
      <Header 
        onSearch={handleSearch} 
        onHomeClick={handleHome} 
        onCategoryClick={handleCategoryClick}
        user={user}
        onLoginClick={() => setShowAuthModal(true)}
        onLogout={() => { logoutUser(); setUser(null); setContinueWatching([]); }}
        onClearHistory={() => { clearWatchHistory(); setContinueWatching([]); }}
      />

      {view === 'home' && (
        <>
          <HeroBanner item={heroItem} onPlay={handlePlay} />
          <div className="-mt-16 relative z-10">
            {/* Continue Watching Section */}
            {user && continueWatching.length > 0 && (
              <section className="py-6 sm:py-8">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 px-4 sm:px-6 max-w-7xl mx-auto flex items-center gap-2">
                  <span>▶️</span> Continue Watching
                </h2>
                <div className="px-4 sm:px-6 max-w-7xl mx-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {continueWatching.slice(0, 8).map((progress) => {
                      const progressPercent = progress.duration > 0 ? (progress.progress / progress.duration) * 100 : 0;
                      const formatTime = (seconds: number) => {
                        const mins = Math.floor(seconds / 60);
                        const secs = Math.floor(seconds % 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                      };
                      
                      return (
                        <button
                          key={`${progress.mediaId}-${progress.mediaType}`}
                          onClick={() => handlePlay({
                            id: progress.mediaId,
                            media_type: progress.mediaType,
                            title: progress.title,
                            poster_path: progress.posterPath,
                            backdrop_path: null,
                            overview: '',
                            vote_average: 0,
                          } as Movie)}
                          className="group relative bg-gray-900/50 rounded-xl overflow-hidden border border-white/5 hover:border-violet-500/30 transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/10 text-left"
                        >
                          <div className="flex gap-3 p-3">
                            {progress.posterPath && (
                              <div className="w-16 sm:w-20 shrink-0 aspect-[2/3] rounded-lg overflow-hidden">
                                <img
                                  src={`${TMDB_IMAGE_BASE}/w200${progress.posterPath}`}
                                  alt={progress.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-medium text-white truncate group-hover:text-violet-300 transition-colors">
                                {progress.title}
                              </h3>
                              {progress.mediaType === 'tv' && progress.season && progress.episode && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  S{progress.season} E{progress.episode}
                                  {progress.episodeTitle && (
                                    <span className="text-gray-500"> • {progress.episodeTitle}</span>
                                  )}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 mt-1">
                                {formatTime(progress.progress)} / {formatTime(progress.duration)}
                              </p>
                              {/* Progress Bar */}
                              <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all"
                                  style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          {/* Play overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all opacity-0 group-hover:opacity-100">
                            <div className="w-12 h-12 rounded-full bg-violet-500/90 flex items-center justify-center shadow-lg shadow-violet-500/30">
                              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {/* Login prompt for non-users */}
            {!user && (
              <div className="px-4 sm:px-6 max-w-7xl mx-auto py-4">
                <div className="bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Sign in to track your progress</p>
                    <p className="text-xs text-gray-400 mt-0.5">Save watch history and pick up where you left off</p>
                  </div>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="shrink-0 px-4 py-2 text-sm font-medium bg-violet-500 hover:bg-violet-400 rounded-lg transition-colors"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            )}

            {/* Genre Filter */}
            <div className="px-4 sm:px-6 max-w-7xl mx-auto py-4">
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {[
                  { id: 28, name: '🎯 Action' },
                  { id: 35, name: '😂 Comedy' },
                  { id: 18, name: '🎭 Drama' },
                  { id: 27, name: '👻 Horror' },
                  { id: 878, name: '🚀 Sci-Fi' },
                  { id: 10749, name: '💕 Romance' },
                  { id: 53, name: '🔪 Thriller' },
                  { id: 16, name: '✨ Animation' },
                  { id: 80, name: '🔫 Crime' },
                  { id: 14, name: '🧙 Fantasy' },
                  { id: 99, name: '📹 Documentary' },
                  { id: 10752, name: '💣 War' },
                ].map((genre) => (
                  <button
                    key={genre.id}
                    onClick={() => handleGenreSelect(genre.id)}
                    className={`shrink-0 px-4 py-2 text-xs sm:text-sm font-medium rounded-full transition-all ${
                      selectedGenre === genre.id
                        ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {genre.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Genre Results */}
            {selectedGenre && genreItems.length > 0 && (
              <div className="px-4 sm:px-6 max-w-7xl mx-auto pb-4">
                <h2 className="text-lg sm:text-xl font-bold mb-3">
                  {GENRES[selectedGenre]} Titles
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {genreItems.slice(0, 18).map((item) => (
                    <ContentCard key={item.id} item={item} onClick={() => handleItemClick(item)} />
                  ))}
                </div>
              </div>
            )}

            <ContentRow title="🔥 Trending This Week" items={trending} onItemClick={handleItemClick} />
            <ContentRow title="🎬 Now Playing in Theaters" items={nowPlaying} onItemClick={handleItemClick} />
            <ContentRow title="🍿 Popular Movies" items={popularMovies} onItemClick={handleItemClick} />
            <ContentRow title="⭐ Top Rated Movies" items={topRated} onItemClick={handleItemClick} />
            <ContentRow title="📺 Popular TV Shows" items={popularTV} onItemClick={handleItemClick} />
            <ContentRow title="🏆 Top Rated TV Shows" items={topRatedTV} onItemClick={handleItemClick} />
          </div>
          <footer className="border-t border-white/5 mt-12 py-8 px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <span className="text-sm font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                StreamVault
              </span>
            </div>
            <p className="text-gray-500 text-sm">
              Your gateway to endless entertainment
            </p>
            <p className="text-gray-600 text-xs mt-2">
              Powered by TMDB & Videasy • English subtitles available
            </p>
            <p className="text-gray-700 text-xs mt-1">
              This site does not host any video content. All videos are provided by third-party services.
            </p>
          </footer>
        </>
      )}

      {view === 'search' && (
        <SearchResults results={searchResults} query={searchQuery} onItemClick={handleItemClick} />
      )}

      {view === 'category' && (
        <div className="pt-24 pb-12 px-4 sm:px-6 max-w-7xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-6">{categoryTitle}</h2>
          {categoryItems.length === 0 ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {categoryItems.map((item) => (
                <ContentCard key={item.id} item={item} onClick={() => handleItemClick(item)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'detail' && selectedItem && (
        <DetailView
          item={selectedItem}
          onBack={() => { setView(searchQuery ? 'search' : 'home'); setSelectedItem(null); }}
          onPlay={() => handlePlay(selectedItem)}
        />
      )}

      {playerItem && (
        <PlayerModal
          item={playerItem}
          onClose={() => { setPlayerItem(null); setContinueWatching(getContinueWatching()); }}
          isTV={playerItem.media_type === 'tv'}
          user={user}
          initialProgress={continueWatching.find(p => p.mediaId === playerItem.id && p.mediaType === playerItem.media_type) || null}
        />
      )}

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={(u) => { setUser(u); setContinueWatching(getContinueWatching()); }}
        />
      )}
    </div>
  );
}
