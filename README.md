# Content Manager

A local full-stack media library built with PostgreSQL, ASP.NET Core 8, and React with TypeScript. The backend stores original media files in `~/Resources/Images`, named by a lowercase random ID plus the original extension. PostgreSQL stores each ID, its first-added timestamp, filename, content type, and normalized tag assignments. The library is ordered newest first.

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

Open <http://localhost:5173>, choose **Import folder**, and select a folder. The browser uploads supported images and videos. The background worker merges pixel-identical images and videos separately; for videos it compares duration before decoding frames. The UI can search filenames and tags, filter by a tag, and add or remove per-file tags.

## Configuration

The default PostgreSQL connection is `Host=localhost;Port=5432;Database=imagemanager;Username=imagemanager;Password=imagemanager`. Override it with `ConnectionStrings__Contents` (the legacy `ConnectionStrings__Images` setting is still accepted). Set `ContentStorage__Path` to use another media directory; the legacy `ImageStorage__Path` setting is still accepted. The API allows the frontend origin `http://localhost:5173`; set `Cors__Origins__0` to allow a different origin. Set `VITE_API_URL` before starting Vite if the API is at a different address.

## Project structure

- `Backend/src/ImageSorter.Domain`: content and tag entities.
- `Backend/src/ImageSorter.Application`: use cases and persistence/storage interfaces.
- `Backend/src/ImageSorter.Infrastructure`: EF Core / Npgsql and local filesystem storage.
- `Backend/src/ImageSorter.Api`: HTTP endpoints and dependency configuration.
- `Frontend`: React and TypeScript client.

The database uses `contents`, `tags`, and `content_tags` tables. On startup, the API renames the legacy `images` and `image_tags` tables and their `ImageHash` column in place, preserving existing rows and tag assignments. The API also reconciles hash-named files already in the media directory into the catalog when listing the collection.

Supported image extensions are JPEG, PNG, GIF, WebP, BMP, TIFF, AVIF, and HEIC. Supported video extensions are MP4, M4V, MOV, AVI, MKV, WebM, MPG, MPEG, and 3GP. HEIC images are converted to PNG; other files are stored without transcoding. FFmpeg and FFprobe must be available on `PATH` for video thumbnails and duplicate checks.
