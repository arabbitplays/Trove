using System.Security.Cryptography;
using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Images;

public sealed record ImageDto(string Hash, string OriginalName, DateTimeOffset AddedAt, IReadOnlyList<string> Tags);
public sealed record ImagePage(IReadOnlyList<ImageDto> Items, int Total, int Skip, int Take);
public sealed record ImportResult(int Imported, int Duplicates, IReadOnlyList<string> Errors);

public sealed class ImageService(IImageCatalog catalog, IImageStorage storage, IClock clock)
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

    public Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken ct) => catalog.GetTagsAsync(ct);

    public async Task<ImportResult> ImportAsync(IEnumerable<(Stream Content, string Name)> files, CancellationToken ct)
    {
        var imported = 0; var duplicates = 0; var errors = new List<string>();
        foreach (var (content, name) in files)
        {
            await using var input = content;
            ct.ThrowIfCancellationRequested();
            var extension = Path.GetExtension(Path.GetFileName(name));
            if (!Extensions.Contains(extension)) { errors.Add($"{name}: unsupported image type"); continue; }
            try
            {
                var (hash, path) = await storage.SaveAsync(input, extension, ct);
                if (await catalog.ExistsAsync(hash, ct)) { duplicates++; continue; }
                var type = ContentTypeFor(extension);
                try
                {
                    await catalog.AddAsync(new ImageRecord(hash, type, Path.GetFileName(name), clock.UtcNow), ct);
                    imported++;
                }
                catch
                {
                    if (!await catalog.ExistsAsync(hash, ct)) File.Delete(path);
                    else duplicates++;
                    throw;
                }
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            { errors.Add($"{name}: {e.Message}"); }
        }
        return new ImportResult(imported, duplicates, errors);
    }

    public async Task AddTagAsync(string hash, string tag, CancellationToken ct)
    {
        var normalized = NormalizeTag(tag);
        if (normalized.Length is 0 or > 50 || normalized.Contains('/')) throw new ArgumentException("Tags must contain between 1 and 50 characters and cannot contain a slash.");
        if (!await catalog.ExistsAsync(hash, ct)) throw new KeyNotFoundException("Image was not found.");
        await catalog.SetTagAsync(hash, normalized, ct);
    }

    public Task RemoveTagAsync(string hash, string tag, CancellationToken ct) => catalog.RemoveTagAsync(hash, NormalizeTag(tag), ct);
    public Task<string?> FindImagePathAsync(string hash, CancellationToken ct) => storage.FindPathAsync(hash, ct);

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
