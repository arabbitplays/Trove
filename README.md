# Image Manager

A local full-stack image library built with PostgreSQL, ASP.NET Core 8, and React with TypeScript. The backend stores original image files in `~/Resources/Images`, named by lowercase SHA-256 hash plus the original extension. PostgreSQL stores each hash, its first-added timestamp, filename, content type, and normalized tag assignments. The library is ordered newest first.

## Requirements

- Nix with flakes enabled, or .NET 8 SDK, Node.js 22, and PostgreSQL
- A modern browser

## Run locally

From this folder, start the development environment. PostgreSQL runs as a NixOS service on localhost:

```sh
nix develop
```

Run the API from this folder:

```sh
dotnet run --project Backend/src/ImageSorter.Api
```

The API creates the database tables and `~/Resources/Images` on startup. It listens at `http://localhost:5000` by default.

The backend uses NLog for application and ASP.NET Core logging. Logs are written to the console and to `Backend/src/ImageSorter.Api/bin/<configuration>/net8.0/logs/imagemanager.log` during local development. The file target archives daily or when it reaches 10 MiB, and retains up to 14 archives under `logs/archive`. When published, the log folder is beside the API output.

In a second terminal, start the React application:

```sh
cd Frontend
npm install
npm run dev
```

Open <http://localhost:5173>, choose **Import images**, and select a folder. The browser uploads its image files to the API. Identical image bytes are deduplicated by SHA-256. The UI can search filenames and tags, filter by a tag, and add or remove per-image tags.

## Configuration

The default PostgreSQL connection is `Host=localhost;Port=5432;Database=imagemanager;Username=imagemanager;Password=imagemanager`. Override the connection with `ConnectionStrings__Images` if needed. Set `ImageStorage__Path` to use another image directory. The API allows the frontend origin `http://localhost:5173`; set `Cors__Origins__0` to allow a different origin. Set `VITE_API_URL` before starting Vite if the API is at a different address.

## Project structure

- `Backend/src/ImageSorter.Domain`: image and tag entities.
- `Backend/src/ImageSorter.Application`: use cases and persistence/storage interfaces.
- `Backend/src/ImageSorter.Infrastructure`: EF Core / Npgsql and local filesystem storage.
- `Backend/src/ImageSorter.Api`: HTTP endpoints and dependency configuration.
- `Frontend`: React and TypeScript client.

The database uses `images`, `tags`, and `image_tags` tables. This normalized model keeps filtering efficient and leaves room for more image metadata. The API also reconciles hash-named image files already in the image directory into the catalog when listing the collection.

Supported extensions are JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF, and HEIC. Files are stored without transcoding.
