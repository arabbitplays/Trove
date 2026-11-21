using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Images;

public sealed record ImageDto(string Hash, string OriginalName, DateTimeOffset AddedAt, IReadOnlyList<string> Tags);
public sealed record ImagePage(IReadOnlyList<ImageDto> Items, int Total, int Skip, int Take);
public sealed record ImportResult(int Imported, IReadOnlyList<string> Errors, IReadOnlyList<string> Hashes);

public sealed class ImageService(IImageCatalog catalog, IImageStorage storage, IClock clock, IImageProcessor imageProcessor)
{
    private static readonly HashSet<string> Extensions = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".avif", ".heic" };

    public async Task<ImagePage> ListAsync(string? tag, int skip, int take, CancellationToken ct)
    {
        await ReconcileStorageAsync(ct);
        var safeTake = Math.Clamp(take, 1, 100);
        var images = await catalog.ListAsync(NormalizeTagOrNull(tag), Math.Max(0, skip), safeTake, ct);
        return new ImagePage(images.Select(ToDto).ToArray(), await catalog.CountAsync(NormalizeTagOrNull(tag), ct), Math.Max(0, skip), safeTake);
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
            if (!Extensions.Contains(extension)) { errors.Add($"{name}: unsupported image type"); continue; }
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
                    await catalog.AddAsync(new ImageRecord(hash, type, convertedName, clock.UtcNow), ct);
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

    public Task<string?> FindImagePathAsync(string hash, CancellationToken ct) => storage.FindPathAsync(hash, ct);

    public async Task<byte[]?> GetThumbnailAsync(string hash, CancellationToken ct)
    {
        var imagePath = await storage.FindPathAsync(hash, ct);
        if (imagePath is null) return null;

        var thumbnailDirectory = Path.Combine(storage.RootPath, ".thumbnails");
        Directory.CreateDirectory(thumbnailDirectory);
        var thumbnailPath = Path.Combine(thumbnailDirectory, hash + ".jpg");
        if (File.Exists(thumbnailPath)) return await File.ReadAllBytesAsync(thumbnailPath, ct);

        var thumbnail = imageProcessor.CreateJpegThumbnail(imagePath, 480);
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
            await catalog.AddAsync(new ImageRecord(hash, ContentTypeFor(extension), hash + extension, new DateTimeOffset(File.GetCreationTimeUtc(path), TimeSpan.Zero)), ct);
        }
    }

    private static ImageDto ToDto(ImageRecord image) => new(image.Hash, image.OriginalName, image.AddedAt, image.ImageTags.Select(t => t.TagName).Order().ToArray());
    private static string NormalizeTag(string value) => value.Trim().ToLowerInvariant();
    private static string? NormalizeTagOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : NormalizeTag(value);
    private static string ContentTypeFor(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", ".gif" => "image/gif", ".webp" => "image/webp",
        ".bmp" => "image/bmp", ".tif" or ".tiff" => "image/tiff", ".avif" => "image/avif", ".heic" => "image/heic", _ => "application/octet-stream"
    };
}
