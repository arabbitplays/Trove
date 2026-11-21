using System.Security.Cryptography;
using ImageSorter.Application.Abstractions;
using ImageSorter.Domain.Entities;

namespace ImageSorter.Application.Images;

public sealed record ImageDto(string Hash, string OriginalName, DateTimeOffset AddedAt, IReadOnlyList<string> Tags);
public sealed record ImagePage(IReadOnlyList<ImageDto> Items, int Total, int Skip, int Take);
public sealed record ImportResult(int Imported, int Duplicates, int RenamedDuplicates, IReadOnlyList<string> Errors, IReadOnlyList<string> Hashes);

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

    public async Task<int> CountDuplicatesAsync(IEnumerable<(Stream Content, string Name)> files, CancellationToken ct)
    {
        await ReconcileStorageAsync(ct);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var duplicates = 0;
        foreach (var (content, name) in files)
        {
            await using var input = content;
            ct.ThrowIfCancellationRequested();
            if (!Extensions.Contains(Path.GetExtension(Path.GetFileName(name)))) continue;
            var hash = Convert.ToHexString(await SHA256.HashDataAsync(input, ct)).ToLowerInvariant();
            if (await catalog.ExistsAsync(hash, ct) || !seen.Add(hash)) duplicates++;
        }
        return duplicates;
    }

    public async Task<ImportResult> ImportAsync(IEnumerable<(Stream Content, string Name)> files, bool renameDuplicates, CancellationToken ct)
    {
        var imported = 0; var duplicates = 0; var errors = new List<string>();
        var renamedDuplicates = 0;
        var importedHashes = new List<string>();
        var duplicateHashes = new List<string>();
        foreach (var (content, name) in files)
        {
            await using var input = content;
            ct.ThrowIfCancellationRequested();
            var extension = Path.GetExtension(Path.GetFileName(name));
            if (!Extensions.Contains(extension)) { errors.Add($"{name}: unsupported image type"); continue; }
            try
            {
                var (hash, path) = await storage.SaveAsync(input, extension, ct);
                if (await catalog.ExistsAsync(hash, ct))
                {
                    duplicates++;
                    if (!renameDuplicates) continue;

                    var duplicate = await storage.CopyAsync(hash, ct);
                    var renamed = await GetAvailableDuplicateNameAsync(name, ct);
                    try
                    {
                        await catalog.AddAsync(new ImageRecord(duplicate.Hash, ContentTypeFor(extension), renamed, clock.UtcNow), ct);
                        imported++;
                        renamedDuplicates++;
                        importedHashes.Add(duplicate.Hash);
                        duplicateHashes.Add(duplicate.Hash);
                    }
                    catch
                    {
                        if (!await catalog.ExistsAsync(duplicate.Hash, ct)) File.Delete(duplicate.Path);
                        throw;
                    }
                    continue;
                }
                var type = ContentTypeFor(extension);
                try
                {
                    await catalog.AddAsync(new ImageRecord(hash, type, Path.GetFileName(name), clock.UtcNow), ct);
                    imported++;
                    importedHashes.Add(hash);
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
        await catalog.ApplyImportTagsAsync(importedHashes, [], "new", ct);
        foreach (var hash in duplicateHashes)
            await catalog.SetTagAsync(hash, "duplicate", ct);
        return new ImportResult(imported, duplicates, renamedDuplicates, errors, importedHashes);
    }

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

    private async Task<string> GetAvailableDuplicateNameAsync(string name, CancellationToken ct)
    {
        var fileName = Path.GetFileName(name);
        var extension = Path.GetExtension(fileName);
        var baseName = Path.GetFileNameWithoutExtension(fileName);
        for (var number = 1; ; number++)
        {
            var suffix = $" ({number})";
            var maxBaseNameLength = Math.Max(1, 255 - extension.Length - suffix.Length);
            var candidate = $"{baseName[..Math.Min(baseName.Length, maxBaseNameLength)]}{suffix}{extension}";
            if (!await catalog.OriginalNameExistsAsync(candidate, ct)) return candidate;
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
