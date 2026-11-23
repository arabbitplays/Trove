using System.Text.Json;
using Trove.Application.Abstractions;
using Trove.Domain.Entities;

namespace Trove.Application.Content;

public sealed record DeletedContentDto(
    Guid Id,
    DateTimeOffset AddedAt,
    DateOnly? TakenAt,
    DateTimeOffset DeletedAt,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> AutoTags,
    string MediaType,
    string Description);

public sealed class GarbageService(IContentCatalog catalog)
{
    public async Task<IReadOnlyList<DeletedContentDto>> ListAsync(CancellationToken ct)
    {
        var deleted = await catalog.ListDeletedAsync(ct);
        return deleted.Select(ToDto).ToArray();
    }

    public Task<bool> RestoreAsync(Guid id, CancellationToken ct) => catalog.RestoreAsync(id, ct);

    private static DeletedContentDto ToDto(DeletedContentRecord item)
    {
        var tags = JsonSerializer.Deserialize<DeletedTagSnapshot[]>(item.TagsJson) ?? [];
        return new DeletedContentDto(
            item.Id,
            item.AddedAt,
            item.TakenAt,
            item.DeletedAt,
            tags.Where(tag => !tag.IsAuto).Select(tag => tag.Name).Order().ToArray(),
            tags.Where(tag => tag.IsAuto).Select(tag => tag.Name).Order().ToArray(),
            item.ContentType,
            item.Description);
    }
}
