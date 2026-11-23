using Trove.Domain.Entities;
using Trove.Application.Content;

namespace Trove.Application.Abstractions;

public interface IContentCatalog
{
    Task<bool> ExistsAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> IsDeletedAsync(Guid id, CancellationToken cancellationToken);
    Task AddAsync(ContentRecord content, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> GetDirtyContentAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> GetContentAsync(CancellationToken cancellationToken);
    Task MarkCleanAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> MergeTagsAndDeleteAsync(Guid sourceId, Guid targetId, CancellationToken cancellationToken);
    Task<IReadOnlyList<ContentRecord>> ListAsync(IReadOnlyList<string> tags, int skip, int take, CancellationToken cancellationToken);
    Task<int> CountAsync(IReadOnlyList<string> tags, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetTagsForContentMatchingAsync(IReadOnlyList<string> tags, CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetTagsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<string>> GetAutoTagsAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<TagSummaryDto>> GetTagSummariesAsync(CancellationToken cancellationToken);
    Task<bool> RenameTagAsync(string oldName, string newName, CancellationToken cancellationToken);
    Task<bool> DeleteTagAsync(string name, CancellationToken cancellationToken);
    Task SetTagAsync(Guid id, string tag, CancellationToken cancellationToken);
    Task RemoveTagAsync(Guid id, string tag, CancellationToken cancellationToken);
    Task<bool> SetMetadataAsync(Guid id, string? description, DateOnly? takenAt, CancellationToken cancellationToken);
    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken);
    Task<bool> RestoreAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<DeletedContentRecord>> ListDeletedAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<Guid>> GetExpiredDeletedContentAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);
    Task PurgeDeletedContentAsync(Guid id, CancellationToken cancellationToken);
    Task ApplyImportTagsAsync(IReadOnlyList<Guid> contentIds, IReadOnlyList<string> tags, string newTag, CancellationToken cancellationToken);
}

public interface IContentStorage
{
    string RootPath { get; }
    Task<string> SaveAsync(Stream content, string extension, Guid id, CancellationToken cancellationToken);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken);
    Task<string?> FindPathAsync(Guid id, CancellationToken cancellationToken);
    IAsyncEnumerable<(Guid Id, string Path)> EnumerateAsync(CancellationToken cancellationToken);
}

public interface IClock { DateTimeOffset UtcNow { get; } }
