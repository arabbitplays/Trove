using ImageSorter.Application.Abstractions;

namespace ImageSorter.Application.Content;

public sealed class TagService(IContentCatalog catalog)
{
    public Task<IReadOnlyList<string>> ListAsync(CancellationToken ct) => catalog.GetTagsAsync(ct);
    public async Task<IReadOnlyList<string>> ListAutoAsync(CancellationToken ct) =>
        (await catalog.GetAutoTagsAsync(ct)).ToArray();

    public async Task AddAsync(IReadOnlyList<Guid> ids, string tag, CancellationToken ct)
    {
        var normalized = NormalizeTag(tag);
        if (normalized.Length is 0 or > 50 || normalized.Contains('/'))
            throw new ArgumentException("Tags must contain between 1 and 50 characters and cannot contain a slash.");
        if (normalized == "new") throw new ArgumentException("The 'new' tag is assigned automatically.");

        foreach (var id in ids.Distinct())
        {
            if (!await catalog.ExistsAsync(id, ct)) throw new KeyNotFoundException($"Content '{id}' was not found.");
        }

        foreach (var id in ids.Distinct()) await catalog.SetTagAsync(id, normalized, ct);
    }

    public async Task RemoveAsync(IReadOnlyList<Guid> ids, string tag, CancellationToken ct)
    {
        var normalized = NormalizeTag(tag);
        foreach (var id in ids.Distinct()) await catalog.RemoveTagAsync(id, normalized, ct);
    }

    private static string NormalizeTag(string value) => value.Trim().ToLowerInvariant();
}
