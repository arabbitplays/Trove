using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Content;

public sealed record ContentDto(Guid Id, DateTimeOffset AddedAt, DateOnly? TakenAt, IReadOnlyList<string> Tags, IReadOnlyList<string> AutoTags, string MediaType, string Description);
public sealed record ContentPage(IReadOnlyList<ContentDto> Items, int Total, int Skip, int Take);
public sealed record ImportResult(int Imported, IReadOnlyList<string> Errors, IReadOnlyList<Guid> Ids);

public sealed class ContentService(IContentCatalog catalog, IContentStorage storage, IClock clock, IImageProcessor imageProcessor, IVideoProcessor videoProcessor)
{
    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".mp4", ".m4v", ".mov", ".avi", ".mkv", ".webm", ".mpg", ".mpeg", ".3gp" };

    public async Task<ContentPage> ListAsync(IReadOnlyList<string>? tags, int skip, int take, CancellationToken ct)
    {
        await ReconcileStorageAsync(ct);
        var safeTake = Math.Clamp(take, 1, 100);
        var normalizedTags = NormalizeTags(tags);
        var contents = await catalog.ListAsync(normalizedTags, Math.Max(0, skip), safeTake, ct);
        return new ContentPage(contents.Select(ToDto).ToArray(), await catalog.CountAsync(normalizedTags, ct), Math.Max(0, skip), safeTake);
    }

    public Task<IReadOnlyList<string>> GetAvailableTagsAsync(IReadOnlyList<string>? tags, CancellationToken ct) =>
        catalog.GetTagsForContentMatchingAsync(NormalizeTags(tags), ct);

    public async Task<ImportResult> ImportAsync(IEnumerable<(Stream Content, string Name)> files, CancellationToken ct)
    {
        var imported = 0; var errors = new List<string>();
        var importedIds = new List<Guid>();
        foreach (var (content, name) in files)
        {
            await using var input = content;
            ct.ThrowIfCancellationRequested();
            var extension = Path.GetExtension(Path.GetFileName(name));
            if (!Extensions.Contains(extension)) { errors.Add($"{name}: unsupported media type"); continue; }
            try
            {
                var takenAt = ContentTypeFor(extension).StartsWith("image/", StringComparison.Ordinal)
                    ? imageProcessor.GetDateTaken(input)
                    : null;
                Stream importContent = input;
                using var converted = string.Equals(extension, ".heic", StringComparison.OrdinalIgnoreCase)
                    ? imageProcessor.ConvertHeicToPng(input)
                    : null;
                if (converted is not null)
                {
                    importContent = converted;
                    extension = ".png";
                }

                var id = Guid.NewGuid();
                await storage.SaveAsync(importContent, extension, id, ct);
                var type = ContentTypeFor(extension);
                try
                {
                    await catalog.AddAsync(new ContentRecord(id, type, clock.UtcNow, takenAt), ct);
                    imported++;
                    importedIds.Add(id);
                }
                catch
                {
                    if (!await catalog.ExistsAsync(id, ct)) await storage.DeleteAsync(id, ct);
                    throw;
                }
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            { errors.Add($"{name}: {e.Message}"); }
        }
        await catalog.ApplyImportTagsAsync(importedIds, [], "new", ct);
        return new ImportResult(imported, errors, importedIds);
    }

    public Task<string?> FindContentPathAsync(Guid id, CancellationToken ct) => storage.FindPathAsync(id, ct);

    public async Task SetMetadataAsync(Guid id, string? description, DateOnly? takenAt, CancellationToken ct)
    {
        if (description?.Length > 5000) throw new ArgumentException("Descriptions cannot exceed 5000 characters.");
        if (!await catalog.SetMetadataAsync(id, description, takenAt, ct))
            throw new KeyNotFoundException($"Content '{id}' was not found.");
    }

    public async Task<byte[]?> GetThumbnailAsync(Guid id, CancellationToken ct)
    {
        var contentPath = await storage.FindPathAsync(id, ct);
        if (contentPath is null) return null;

        var thumbnailDirectory = Path.Combine(storage.RootPath, ".thumbnails");
        Directory.CreateDirectory(thumbnailDirectory);
        var thumbnailPath = Path.Combine(thumbnailDirectory, id.ToString("D") + ".jpg");
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
        await foreach (var (id, path) in storage.EnumerateAsync(ct))
        {
            if (await catalog.ExistsAsync(id, ct)) continue;
            var extension = Path.GetExtension(path);
            var mediaType = ContentTypeFor(extension);
            DateOnly? takenAt = null;
            if (mediaType.StartsWith("image/", StringComparison.Ordinal))
            {
                await using var stream = File.OpenRead(path);
                takenAt = imageProcessor.GetDateTaken(stream);
            }
            await catalog.AddAsync(new ContentRecord(id, mediaType, new DateTimeOffset(File.GetCreationTimeUtc(path), TimeSpan.Zero), takenAt), ct);
        }
    }

    private static ContentDto ToDto(ContentRecord content) => new(
        content.Id,
        content.AddedAt,
        content.TakenAt,
        content.ContentTags.Where(link => !link.Tag.IsAuto).Select(link => link.TagName).Order().ToArray(),
        content.ContentTags.Where(link => link.Tag.IsAuto).Select(link => link.TagName).Order().ToArray(),
        content.ContentType,
        content.Description);
    private static string NormalizeTag(string value) => value.Trim().ToLowerInvariant();
    private static string[] NormalizeTags(IReadOnlyList<string>? values) => values?
        .Where(value => !string.IsNullOrWhiteSpace(value))
        .Select(NormalizeTag)
        .Distinct(StringComparer.Ordinal)
        .ToArray() ?? [];
    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".gif" => "image/gif", ".webp" => "image/webp",
        ".bmp" => "image/bmp", ".tif" or ".tiff" => "image/tiff", ".avif" => "image/avif", ".heic" => "image/heic",
        ".mp4" or ".m4v" => "video/mp4", ".mov" => "video/quicktime", ".avi" => "video/x-msvideo", ".mkv" => "video/x-matroska",
        ".webm" => "video/webm", ".mpg" or ".mpeg" => "video/mpeg", ".3gp" => "video/3gpp", _ => "application/octet-stream"
    };

    private static bool IsVideoPath(string path) => ContentTypeFor(Path.GetExtension(path)).StartsWith("video/", StringComparison.Ordinal);
}
