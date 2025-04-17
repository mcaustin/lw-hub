import React, { useEffect, useState, useCallback } from "react";
//import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import axios from 'axios';
import Select from 'react-select'

// Configure Amplify
Amplify.configure(outputs);

const baseUrl = "https://7ixkelduq5.execute-api.us-east-1.amazonaws.com/opensearch-api-test"
const warzonesUrl = "https://7ixkelduq5.execute-api.us-east-1.amazonaws.com/opensearch-api-test/warzones"

// SearchBar Component
interface SearchBarProps {
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: (warzone: any) => void;
  isLoading: boolean;
  warzones: [];
  selectedZone: any;
  onZoneChange: React.Dispatch<React.SetStateAction<any | undefined>>
}

const SearchBar: React.FC<SearchBarProps> = ({
  query,
  onChange,
  onSearch,
  isLoading,
  warzones,
  selectedZone,
  onZoneChange
}) => (
  <div className="search-bar">
    <input
      type="text"
      value={query}
      onChange={onChange}
      onKeyPress={(e) => e.key === "Enter" && onSearch}
      placeholder="Search for player names..."
      className="search-input"
      disabled={isLoading}
    />
    <Select value={selectedZone} options={warzones} onChange={(option) => onZoneChange(option)}/>
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
  base: { name: string; x: number; y: number; warzone: number; allianceTag: string; level: number; };
}

const BaseCard: React.FC<BaseCardProps> = ({ base }) => (
  <div className="movie-card">
    <div className="overlay">
      <h3 className="movie-title">(#{base.warzone}) {base.allianceTag} {base.name}</h3>
      <p className="movie-description"><b>Level:</b>{base.level}</p>
      <p className="movie-description"><b>X:</b>{base.x} <b>Y:</b>{base.y}</p>
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
    allianceTag: string;
    level: number;
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

// Main BaseList Component
const BaseList: React.FC = () => {
  const [movies, setMovies] = useState<any[]>([]);
  const [warzones, setWarzones] = useState<[]>([]);
  const [filteredBases, setFilteredMovies] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedZone, setSelectedZone] = useState<any>();

 // Fetch movies from API
 const fetchWarzones = async () => {
  try {
    axios.get(warzonesUrl)
    .then(function (response) {
        console.log(response);
        let body = JSON.parse(response.data.body)
        let parsedZones = body.aggregations.allwarzones.buckets.map((hit: any) => {
          return { 'label': hit.key, 'value': hit.key }
        });
        console.log(`warzones=${parsedZones}`)
        setWarzones(parsedZones)
    })
    .catch(function (error) {
        console.log(error);
    });
    

  } catch (err) {
    console.error("Error fetching warzones:", err);
    setError("Failed to fetch warzones. Please try again.");
  } finally {
  }
};


  // Fetch movies from API
  const fetchBases = async () => {
    setIsLoading(true);
    setError("");
    try {

      axios.get(baseUrl + '?q=*')
      .then(function (response) {
          console.log(response);
          let data = response.data.hits.hits.map((hit: any) => hit._source);
          data.forEach((base: any) => {
              base["allianceTag"] = base.allianceTag ? "[" + base.allianceTag + "]" : ""
          })
          setFilteredMovies(data)
          setMovies(data); // Set all movies
      })
      .catch(function (error) {
          console.log(error);
      });
      

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
      let url = baseUrl + '?q=' + searchQuery + '*'
      let warzone = selectedZone?.value
      if (warzone) {
        url = url + "&z=" + warzone
      }
      axios.get(url)
      .then(function (response) {
          console.log(response);
          let data = response.data.hits.hits.map((hit: any) => hit._source);
          data.forEach((base: any) => {
            base["allianceTag"] = base.allianceTag ? "[" + base.allianceTag + "]" : ""
        })
          //console.log(`data: ${JSON.stringify(data)}`)
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
  }, [movies, searchQuery, selectedZone]);

  useEffect(() => {
    fetchBases(); // Fetch all bases when the component mounts
    fetchWarzones();
  }, []);

  return (
    <main className="main-container">
      <div className="content">
        <SearchBar
          query={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onSearch={handleSearch}
          isLoading={isLoading}
          warzones={warzones}
          selectedZone={selectedZone}
          onZoneChange={setSelectedZone}
        />
        {error && <div className="error-message">{error}</div>}
        {isLoading ? (
          <div className="loading-message">Loading...</div>
        ) : (
          <BaseCarousel
            title="All Bases"
            bases={filteredBases} // Show all the filtered bases
          />
        )}
      </div>
    </main>
  );
};

// App Component
const App: React.FC = () => {
  return (
    <BaseList />
    // <Authenticator>
    //   {({ signOut }) => (
    //     <div className="app-container">
    //       <header className="header">
    //         <div className="header-content">
    //           <h1 className="header-title">Last War Bases</h1>
    //           <div className="user-info">
    //             {/* <span className="username">{user?.username}</span> */}
    //             <button onClick={signOut} className="signout-button">
    //               Sign out
    //             </button>
    //           </div>
    //         </div>
    //       </header>

    //       <BaseList />
    //     </div>
    //   )}
    // </Authenticator>
  );
};

export default App;
