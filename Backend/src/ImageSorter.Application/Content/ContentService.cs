using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Content;

public sealed record ContentDto(string Hash, string OriginalName, DateTimeOffset AddedAt, IReadOnlyList<string> Tags, string MediaType, string Description);
public sealed record ContentPage(IReadOnlyList<ContentDto> Items, int Total, int Skip, int Take);
public sealed record ImportResult(int Imported, IReadOnlyList<string> Errors, IReadOnlyList<string> Hashes);

public sealed class ContentService(IContentCatalog catalog, IContentStorage storage, IClock clock, IImageProcessor imageProcessor, IVideoProcessor videoProcessor)
{
    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".mp4", ".m4v", ".mov", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".3gp" };

    public async Task<ContentPage> ListAsync(string? tag, int skip, int take, CancellationToken ct)
    {
        await ReconcileStorageAsync(ct);
        var safeTake = Math.Clamp(take, 1, 100);
        var contents = await catalog.ListAsync(NormalizeTagOrNull(tag), Math.Max(0, skip), safeTake, ct);
        return new ContentPage(contents.Select(ToDto).ToArray(), await catalog.CountAsync(NormalizeTagOrNull(tag), ct), Math.Max(0, skip), safeTake);
    }

    public async Task<ImportResult> ImportAsync(IEnumerable<(Stream Content, string Name)> files, CancellationToken ct)
    {
        var imported = 0; var errors = new List<string>();
        var importedHashes = new List<string>();
        foreach (var (content, name) in files)
        {
            await using var input = content;
            ct.ThrowIfCancellationRequested();
            var extension = Path.GetExtension(Path.GetFileName(name));
            if (!Extensions.Contains(extension)) { errors.Add($"{name}: unsupported media type"); continue; }
            try
            {
                var convertedName = Path.GetFileName(name);
                Stream importContent = input;
                using var converted = string.Equals(extension, ".heic", StringComparison.OrdinalIgnoreCase)
                    ? imageProcessor.ConvertHeicToPng(input)
                    : null;
                if (converted is not null)
                {
                    importContent = converted;
                    extension = ".png";
                    convertedName = Path.ChangeExtension(convertedName, ".png");
                }

                var (hash, path) = await storage.SaveAsync(importContent, extension, ct);
                var type = ContentTypeFor(extension);
                try
                {
                    await catalog.AddAsync(new ContentRecord(hash, type, convertedName, clock.UtcNow), ct);
                    imported++;
                    importedHashes.Add(hash);
                }
                catch
                {
                    if (!await catalog.ExistsAsync(hash, ct)) File.Delete(path);
                    throw;
                }
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            { errors.Add($"{name}: {e.Message}"); }
        }
        await catalog.ApplyImportTagsAsync(importedHashes, [], "new", ct);
        return new ImportResult(imported, errors, importedHashes);
    }

    public Task<string?> FindContentPathAsync(string hash, CancellationToken ct) => storage.FindPathAsync(hash, ct);

    public async Task SetDescriptionAsync(string hash, string description, CancellationToken ct)
    {
        if (description.Length > 5000) throw new ArgumentException("Descriptions cannot exceed 5000 characters.");
        if (!await catalog.SetDescriptionAsync(hash, description, ct))
            throw new KeyNotFoundException($"Content '{hash}' was not found.");
    }

    public async Task<byte[]?> GetThumbnailAsync(string hash, CancellationToken ct)
    {
        var contentPath = await storage.FindPathAsync(hash, ct);
        if (contentPath is null) return null;

        var thumbnailDirectory = Path.Combine(storage.RootPath, ".thumbnails");
        Directory.CreateDirectory(thumbnailDirectory);
        var thumbnailPath = Path.Combine(thumbnailDirectory, hash + ".jpg");
        if (File.Exists(thumbnailPath)) return await File.ReadAllBytesAsync(thumbnailPath, ct);

        var thumbnail = IsVideoPath(contentPath)
            ? videoProcessor.CreateJpegThumbnail(contentPath, 480)
            : imageProcessor.CreateJpegThumbnail(contentPath, 480);
        var temporaryPath = Path.Combine(thumbnailDirectory, $".{Guid.NewGuid():N}.tmp");
        try
        {
            await File.WriteAllBytesAsync(temporaryPath, thumbnail, ct);
            File.Move(temporaryPath, thumbnailPath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }

        return thumbnail;
    }

    private async Task ReconcileStorageAsync(CancellationToken ct)
    {
        await foreach (var (hash, path) in storage.EnumerateAsync(ct))
        {
            if (await catalog.ExistsAsync(hash, ct)) continue;
            var extension = Path.GetExtension(path);
            await catalog.AddAsync(new ContentRecord(hash, ContentTypeFor(extension), hash + extension, new DateTimeOffset(File.GetCreationTimeUtc(path), TimeSpan.Zero)), ct);
        }
    }

    private static ContentDto ToDto(ContentRecord content) => new(content.Hash, content.OriginalName, content.AddedAt, content.ContentTags.Select(t => t.TagName).Order().ToArray(), content.ContentType, content.Description);
    private static string NormalizeTag(string value) => value.Trim().ToLowerInvariant();
    private static string? NormalizeTagOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : NormalizeTag(value);
    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".gif" => "image/gif", ".webp" => "image/webp",
        ".bmp" => "image/bmp", ".tif" or ".tiff" => "image/tiff", ".avif" => "image/avif", ".heic" => "image/heic",
        ".mp4" or ".m4v" => "video/mp4", ".mov" => "video/quicktime", ".avi" => "video/x-msvideo", ".mkv" => "video/x-matroska",
        ".webm" => "video/webm", ".mpg" or ".mpeg" => "video/mpeg", ".3gp" => "video/3gpp", _ => "application/octet-stream"
    };

    private static bool IsVideoPath(string path) => ContentTypeFor(Path.GetExtension(path)).StartsWith("video/", StringComparison.Ordinal);
}
