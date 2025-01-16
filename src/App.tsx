import { useEffect, useState } from "react";
import type { Schema } from "../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function App() {
  const [movies, setMovies] = useState<Array<Schema["Movie"]["type"]>>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    // Fetch movies when component mounts
    fetchMovies();

    // Subscribe to real-time updates
    const sub = client.models.Movie.observeQuery().subscribe({
      next: ({ items }) => setMovies([...items]),
    });

    return () => sub.unsubscribe();
  }, []);

  async function fetchMovies() {
    try {
      const { data } = await client.models.Movie.list();
      setMovies(data);
    } catch (error) {
      console.error("Error fetching movies:", error);
    }
  }

  async function createMovie(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!title.trim() || !description.trim()) return;

      await client.models.Movie.create({
        title: title,
        description: description,
      });

      // Clear form
      setTitle("");
      setDescription("");
    } catch (error) {
      console.error("Error creating movie:", error);
    }
  }

  async function deleteMovie(id: string) {
    try {
      await client.models.Movie.delete({ id: id });
    } catch (error) {
      console.error("Error deleting movie:", error);
    }
  }

  return (
    <main className="p-4">
      <h1 className="text-2xl font-bold mb-4">Movie Collection</h1>

      {/* Create Movie Form */}
      <form onSubmit={createMovie} className="mb-6">
        <div className="flex flex-col gap-4 max-w-md">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Movie title"
            className="p-2 border rounded"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Movie description"
            className="p-2 border rounded"
          />
          <button
            type="submit"
            className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Add Movie
          </button>
        </div>
      </form>

      {/* Movie List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {movies.map((movie) => (
          <div key={movie.id} className="border p-4 rounded shadow">
            <h2 className="text-xl font-semibold">{movie.title}</h2>
            <p className="mt-2">{movie.description}</p>
            <button
              onClick={() => movie.id && deleteMovie(movie.id)}
              className="mt-2 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;
