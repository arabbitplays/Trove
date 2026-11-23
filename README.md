# Trove

A local full-stack media library built with PostgreSQL, ASP.NET Core 8, and React with TypeScript. The backend stores original media files in `~/Resources/Images`, named by a lowercase random ID plus the original extension. PostgreSQL stores each ID, the immutable added date, an optional capture date read from image metadata, content type, description, and normalized tags. Tags can be manually assigned or automatically assigned by the program.

## Requirements

- Nix with flakes enabled, or .NET 8 SDK, Node.js 22, PostgreSQL, FFmpeg, and FFprobe
- A modern browser

## Run locally

From this folder, start the development environment. PostgreSQL runs as a NixOS service on localhost:

```sh
nix develop
```

Run the API from this folder:

```sh
dotnet run --project Backend/src/Trove.Api
```

The API creates the database tables and `~/Resources/Images` on startup. It listens at `http://localhost:5000` by default.

The backend uses NLog for application and ASP.NET Core logging. Logs are written to the console and to `Backend/src/Trove.Api/bin/<configuration>/net8.0/logs/trove.log` during local development. The file target archives daily or when it reaches 10 MiB, and retains up to 14 archives under `logs/archive`. When published, the log folder is beside the API output.

In a second terminal, start the React application:

```sh
cd Frontend
npm install
npm run dev
```

Open <http://localhost:5173>, choose **Import folder**, and select a folder. The browser uploads supported images and videos. The background worker merges pixel-identical images and videos separately; for videos it compares duration before decoding frames. Capture dates are read from EXIF metadata when available. The UI can filter by tags and edit descriptions and manually assigned tags; automatic tags are read-only.

## Configuration

The default PostgreSQL connection is `Host=localhost;Port=5432;Database=imagemanager;Username=imagemanager;Password=imagemanager`. Override it with `ConnectionStrings__Contents` (the legacy `ConnectionStrings__Images` setting is still accepted). Set `ContentStorage__Path` to use another media directory; the legacy `ImageStorage__Path` setting is still accepted. The API allows the frontend origin `http://localhost:5173`; set `Cors__Origins__0` to allow a different origin. Set `VITE_API_URL` before starting Vite if the API is at a different address.

## Project structure

- `Backend/src/Trove.Domain`: content and tag entities.
- `Backend/src/Trove.Application`: use cases and persistence/storage interfaces.
- `Backend/src/Trove.Infrastructure`: EF Core / Npgsql and local filesystem storage.
- `Backend/src/Trove.Api`: HTTP endpoints and dependency configuration.
- `Frontend`: React and TypeScript client.

The database uses GUID identifiers for content and its tag and period relationships. Files and thumbnails use the same GUID names. EF Core creates the schema on startup when the database is empty; the API reconciles GUID-named files already in the media directory into the catalog when listing the collection.

Supported image extensions are JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF, and HEIC. Supported video extensions are MP4, M4V, MOV, AVI, MKV, WebM, MPG, MPEG, and 3GP. HEIC images are converted to PNG; other files are stored without transcoding. FFmpeg and FFprobe must be available on `PATH` for video thumbnails and duplicate checks.
