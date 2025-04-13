import React, { useEffect, useState, useCallback } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { generateClient } from "aws-amplify/api";
import { Schema } from "../amplify/data/resource";

// Configure Amplify
Amplify.configure(outputs);

const client = generateClient<Schema>({
  authMode: "apiKey",
});

// SearchBar Component
interface SearchBarProps {
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: () => void;
  isLoading: boolean;
}

const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onChange,
  onSearch,
  isLoading,
}) => (
  <div className="search-bar">
    <input
      type="text"
      value={query}
      onChange={onChange}
      onKeyPress={(e) => e.key === "Enter" && onSearch()}
      placeholder="Search for movies..."
      className="search-input"
      disabled={isLoading}
    />
    <button
      onClick={onSearch}
      disabled={isLoading}
      className={`search-button ${isLoading ? "loading" : ""}`}
    >
      {isLoading ? "Searching..." : "Search"}
    </button>
  </div>
);

// MovieCard Component
interface MovieCardProps {
  movie: { title: string; description: string };
}

const MovieCard: React.FC<MovieCardProps> = ({ movie }) => (
  <div className="movie-card">
    <div className="overlay">
      <h3 className="movie-title">{movie.title}</h3>
      <p className="movie-description">{movie.description}</p>
    </div>
  </div>
);

// MovieCarousel Component
interface MovieCarouselProps {
  title: string;
  movies: {
    id: number;
    title: string;
    description: string;
    posterUrl: string;
  }[];
}

const MovieCarousel: React.FC<MovieCarouselProps> = ({ title, movies }) => (
  <section className="movie-carousel">
    <h2 className="carousel-title">{title}</h2>
    <div className="carousel-container">
      {movies.map((movie) => (
        <div key={movie.id} className="carousel-item">
          <MovieCard movie={movie} />
        </div>
      ))}
    </div>
  </section>
);

// Main MovieList Component
const MovieList: React.FC = () => {
  const [movies, setMovies] = useState<any[]>([]);
  const [filteredMovies, setFilteredMovies] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Fetch movies from API
  const fetchMovies = async () => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await client.models.Movie.list();
      setMovies(data); // Set all movies
      setFilteredMovies(data); // Set filtered movies to all fetched movies initially
    } catch (err) {
      console.error("Error fetching movies:", err);
      setError("Failed to fetch movies. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle search logic
  const handleSearch = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      if (!searchQuery.trim()) {
        setFilteredMovies(movies); // Reset to all movies if search query is empty
        return;
      }
      const { data } = await client.queries.searchMovie({ title: searchQuery });
      if (data) {
        setFilteredMovies(data!); // Update with the search results
      }
    } catch (err) {
      console.error("Error searching movies:", err);
      setError("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [movies, searchQuery]);

  useEffect(() => {
    fetchMovies(); // Fetch all movies when the component mounts
  }, []);

  return (
    <main className="main-container">
      <div className="content">
        <SearchBar
          query={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onSearch={handleSearch}
          isLoading={isLoading}
        />
        {error && <div className="error-message">{error}</div>}
        {isLoading ? (
          <div className="loading-message">Loading...</div>
        ) : (
          <MovieCarousel
            title="All Movies"
            movies={filteredMovies} // Show all the filtered movies
          />
        )}
      </div>
    </main>
  );
};

// App Component
const App: React.FC = () => {
  return (
    <Authenticator>
      {({ signOut }) => (
        <div className="app-container">
          <header className="header">
            <div className="header-content">
              <h1 className="header-title">Movie Collection</h1>
              <div className="user-info">
                {/* <span className="username">{user?.username}</span> */}
                <button onClick={signOut} className="signout-button">
                  Sign out
                </button>
              </div>
            </div>
          </header>

          <MovieList />
        </div>
      )}
    </Authenticator>
  );
};

export default App;
