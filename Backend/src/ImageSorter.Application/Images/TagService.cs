using ImageSorter.Application.Abstractions;

namespace ImageSorter.Application.Images;

public sealed class TagService(IImageCatalog catalog)
{
    public Task<IReadOnlyList<string>> ListAsync(CancellationToken ct) => catalog.GetTagsAsync(ct);

    public async Task AddAsync(IReadOnlyList<string> hashes, string tag, CancellationToken ct)
    {
        var normalized = NormalizeTag(tag);
        if (normalized.Length is 0 or > 50 || normalized.Contains('/'))
            throw new ArgumentException("Tags must contain between 1 and 50 characters and cannot contain a slash.");

        var distinctHashes = hashes.Distinct(StringComparer.Ordinal).ToArray();
        foreach (var hash in distinctHashes)
        {
            if (!await catalog.ExistsAsync(hash, ct))
                throw new KeyNotFoundException($"Image '{hash}' was not found.");
        }

        foreach (var hash in distinctHashes)
            await catalog.SetTagAsync(hash, normalized, ct);
    }

    public async Task RemoveAsync(IReadOnlyList<string> hashes, string tag, CancellationToken ct)
    {
        var normalized = NormalizeTag(tag);
        foreach (var hash in hashes.Distinct(StringComparer.Ordinal))
            await catalog.RemoveTagAsync(hash, normalized, ct);
    }

    private static string NormalizeTag(string value) => value.Trim().ToLowerInvariant();
}
