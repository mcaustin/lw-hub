import React, { useEffect, useState, useCallback } from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import axios from 'axios';

// Configure Amplify
Amplify.configure(outputs);

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
      placeholder="Search for player names..."
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
interface BaseCardProps {
  base: { name: string; x: number; y: number; warzone: number };
}

const BaseCard: React.FC<BaseCardProps> = ({ base }) => (
  <div className="movie-card">
    <div className="overlay">
      <h3 className="movie-title">{base.name}</h3>
      <p className="movie-description">X:{base.x} Y:{base.y} Warzone:{base.warzone}</p>
    </div>
  </div>
);

// MovieCarousel Component
interface BaseCarouselProps {
  title: string;
  bases: {
    name: string;
    x: number;
    y: number;
    warzone: number;
  }[];
}

const BaseCarousel: React.FC<BaseCarouselProps> = ({ title, bases }) => (
  <section className="movie-carousel">
    <h2 className="carousel-title">{title}</h2>
    <div className="carousel-container">
      {bases.map((base) => (
        <div key={base.name} className="carousel-item">
          <BaseCard base={base} />
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
      //const { data } = await client.models.Base.list();
      setMovies([]); // Set all movies
      setFilteredMovies([]); // Set filtered movies to all fetched movies initially
    } catch (err) {
      console.error("Error fetching bases:", err);
      setError("Failed to fetch bases. Please try again.");
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
      axios.get('https://7ixkelduq5.execute-api.us-east-1.amazonaws.com/opensearch-api-test?q=' + searchQuery)
      .then(function (response) {
          console.log(response);
          let data = response.data.hits.hits.map((hit: any) => hit._source);
          console.log(`data: ${JSON.stringify(data)}`)
          setFilteredMovies(data)

      })
      .catch(function (error) {
          console.log(error);
      });

    } catch (err) {
      console.error("Error searching bases:", err);
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
          <BaseCarousel
            title="All Bases"
            bases={filteredMovies} // Show all the filtered movies
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
              <h1 className="header-title">Last War Bases</h1>
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
